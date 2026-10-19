use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const GITHUB_REPO: &str = "souonailo/paw-nailo-launcher";

#[derive(Debug, Clone, Deserialize)]
pub struct GithubAsset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubRelease {
    pub tag_name: String,
    pub body: Option<String>,
    pub html_url: Option<String>,
    pub assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateCheckResult {
    pub update_available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
}

/// Parses a semver string like "1.0.2", "v1.0.3", "1.0.4-rc1" into (major, minor, patch).
pub fn parse_semver(v: &str) -> Option<(u64, u64, u64)> {
    let clean = v.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let mut parts = clean.split('.');
    let major_str = parts.next()?;
    let major: u64 = major_str.split('-').next()?.trim().parse().ok()?;

    let minor_str = parts.next().unwrap_or("0");
    let minor: u64 = minor_str.split('-').next()?.trim().parse().ok()?;

    let patch_str = parts.next().unwrap_or("0");
    let patch: u64 = patch_str.split('-').next()?.trim().parse().ok()?;

    Some((major, minor, patch))
}

/// Returns true if `latest` is strictly newer than `current`.
pub fn is_newer(current: &str, latest: &str) -> bool {
    match (parse_semver(current), parse_semver(latest)) {
        (Some((c_maj, c_min, c_pat)), Some((l_maj, l_min, l_pat))) => {
            (l_maj, l_min, l_pat) > (c_maj, c_min, c_pat)
        }
        _ => false,
    }
}

/// Finds the most suitable Windows executable asset in the release assets list.
/// Prioritizes "PAW-Nailo.exe", then any .exe asset.
pub fn select_executable_asset(assets: &[GithubAsset]) -> Option<&GithubAsset> {
    if let Some(target) = assets.iter().find(|a| a.name.eq_ignore_ascii_case("PAW-Nailo.exe")) {
        return Some(target);
    }
    assets.iter().find(|a| a.name.to_lowercase().ends_with(".exe"))
}

/// Queries the GitHub Releases API for the latest release and checks if a newer version is available.
pub async fn check_update(current_version: &str) -> Result<UpdateCheckResult, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let client = reqwest::Client::builder()
        .user_agent(format!("PAW-Nailo-Launcher/{}", current_version))
        .build()
        .map_err(|e| format!("Falha ao inicializar cliente HTTP: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Falha na consulta ao GitHub Releases: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API retornou código {}", resp.status()));
    }

    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("Falha ao interpretar resposta da release: {}", e))?;

    let latest_tag = release.tag_name.trim();
    let has_update = is_newer(current_version, latest_tag);
    let matched_asset = select_executable_asset(&release.assets);

    Ok(UpdateCheckResult {
        update_available: has_update && matched_asset.is_some(),
        current_version: current_version.to_string(),
        latest_version: latest_tag.trim_start_matches(|c| c == 'v' || c == 'V').to_string(),
        release_notes: release.body,
        download_url: matched_asset.map(|a| a.browser_download_url.clone()),
        asset_name: matched_asset.map(|a| a.name.clone()),
        asset_size: matched_asset.map(|a| a.size),
    })
}

/// Downloads the new executable with progress emission, performs the Windows atomic swap,
/// spawns the new version and shuts down the current process.
pub async fn apply_update(app: AppHandle, download_url: String) -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Não foi possível determinar o executável atual: {}", e))?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "Diretório do executável não encontrado".to_string())?;

    let exe_stem = current_exe
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("PAW-Nailo");

    let download_tmp = exe_dir.join(format!("{}.download.tmp", exe_stem));
    let old_tmp = exe_dir.join(format!("{}.old.tmp", exe_stem));

    if download_tmp.exists() {
        let _ = std::fs::remove_file(&download_tmp);
    }

    let client = reqwest::Client::builder()
        .user_agent("PAW-Nailo-Updater")
        .build()
        .map_err(|e| format!("Falha ao inicializar cliente de download: {}", e))?;

    let mut resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Falha ao conectar para download: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download recusado com código HTTP {}", resp.status()));
    }

    let total_size = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&download_tmp)
        .await
        .map_err(|e| format!("Falha ao criar arquivo de atualização temporário: {}", e))?;

    let mut downloaded: u64 = 0;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Erro durante transferência de dados: {}", e))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Erro ao gravar no disco: {}", e))?;
        downloaded += chunk.len() as u64;

        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0).min(100.0)
        } else {
            0.0
        };

        let _ = app.emit(
            "updater:progress",
            UpdateProgress {
                downloaded,
                total: total_size,
                percent,
            },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Falha ao descarregar buffer em disco: {}", e))?;
    drop(file);

    if total_size > 0 && downloaded < total_size {
        let _ = std::fs::remove_file(&download_tmp);
        return Err(format!(
            "Download incompleto: {} de {} bytes transferidos",
            downloaded, total_size
        ));
    }

    // Limpa backup antigo se existir
    if old_tmp.exists() {
        let _ = std::fs::remove_file(&old_tmp);
    }

    // No Windows, um executável em execução não pode ser sobrescrito diretamente,
    // mas pode ser renomeado livremente dentro do mesmo volume.
    // 1. current_exe -> old_tmp
    std::fs::rename(&current_exe, &old_tmp)
        .map_err(|e| format!("Falha ao renomear executável atual para backup: {}", e))?;

    // 2. download_tmp -> current_exe
    if let Err(e) = std::fs::rename(&download_tmp, &current_exe) {
        // Tenta rollback imediato caso falhe renomear o novo
        let _ = std::fs::rename(&old_tmp, &current_exe);
        return Err(format!("Falha ao instalar novo executável: {}", e));
    }

    // 3. Executa a nova versão
    let spawn_result = std::process::Command::new(&current_exe).spawn();
    if let Err(e) = spawn_result {
        // Rollback se falhar ao iniciar
        let _ = std::fs::rename(&current_exe, &download_tmp);
        let _ = std::fs::rename(&old_tmp, &current_exe);
        return Err(format!("Falha ao iniciar nova versão atualizada: {}", e));
    }

    // 4. Encerra processo atual
    app.exit(0);
    Ok(())
}

/// Cleans up any leftover .old.tmp or .download.tmp files left from prior updates.
pub fn cleanup_old_updates() {
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            if let Ok(entries) = std::fs::read_dir(exe_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.ends_with(".old.tmp") || name.ends_with(".download.tmp") {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_parsing() {
        assert_eq!(parse_semver("1.0.2"), Some((1, 0, 2)));
        assert_eq!(parse_semver("v1.0.3"), Some((1, 0, 3)));
        assert_eq!(parse_semver("V2.1.0"), Some((2, 1, 0)));
        assert_eq!(parse_semver("1.0.3-beta"), Some((1, 0, 3)));
        assert_eq!(parse_semver("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_semver("invalid"), None);
    }

    #[test]
    fn test_is_newer_comparison() {
        assert!(is_newer("1.0.2", "1.0.3"));
        assert!(is_newer("1.0.2", "v1.0.3"));
        assert!(is_newer("1.0.2", "1.1.0"));
        assert!(is_newer("1.0.2", "2.0.0"));
        assert!(!is_newer("1.0.2", "1.0.2"));
        assert!(!is_newer("1.0.3", "1.0.2"));
        assert!(!is_newer("1.10.0", "1.9.0"));
        assert!(is_newer("1.9.0", "1.10.0"));
        assert!(!is_newer("1.0.2", "v1.0.2-patch"));
    }

    #[test]
    fn test_select_executable_asset() {
        let assets = vec![
            GithubAsset {
                name: "PAW-Nailo-v1.0.2.zip".into(),
                size: 40000000,
                browser_download_url: "https://github.com/releases/download/v1.0.2/zip".into(),
            },
            GithubAsset {
                name: "PAW-Nailo.exe".into(),
                size: 42000000,
                browser_download_url: "https://github.com/releases/download/v1.0.2/PAW-Nailo.exe".into(),
            },
        ];

        let selected = select_executable_asset(&assets).expect("deve encontrar PAW-Nailo.exe");
        assert_eq!(selected.name, "PAW-Nailo.exe");
    }

    #[test]
    fn test_select_fallback_exe_asset() {
        let assets = vec![
            GithubAsset {
                name: "source.tar.gz".into(),
                size: 1000,
                browser_download_url: "https://github.com/".into(),
            },
            GithubAsset {
                name: "paw-nailo-rust.exe".into(),
                size: 42000000,
                browser_download_url: "https://github.com/releases/download/v1.0.2/paw-nailo-rust.exe".into(),
            },
        ];

        let selected = select_executable_asset(&assets).expect("deve encontrar .exe fallback");
        assert_eq!(selected.name, "paw-nailo-rust.exe");
    }
}
