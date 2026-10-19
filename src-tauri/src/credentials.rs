use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub email: String,
    pub token: String,
    pub nick: Option<String>,
}

// Separate from accounts.enc: session handoff never rewrites saved credentials.
pub fn load_sessions() -> HashMap<usize, SavedSession> {
    let path = get_app_data_dir().join("sessions.enc");
    let accounts = load_accounts();
    fs::read(path).ok().and_then(|b| dpapi_decrypt(&b).ok())
        .and_then(|b| serde_json::from_slice::<HashMap<usize, SavedSession>>(&b).ok())
        .unwrap_or_default().into_iter().filter(|(i, s)| {
            !s.token.is_empty() && accounts.get(*i).and_then(|a| a.email.as_deref()) == Some(s.email.as_str())
        }).collect()
}

pub fn save_session(index: usize, token: String, nick: Option<String>) -> Result<(), String> {
    static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let accounts = load_accounts();
    let email = accounts.get(index).and_then(|a| a.email.clone()).filter(|s| !s.is_empty()).ok_or("Conta não cadastrada")?;
    let mut sessions = load_sessions();
    sessions.insert(index, SavedSession {email, token, nick});
    let dir = get_app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let encrypted = dpapi_encrypt(&serde_json::to_vec(&sessions).map_err(|e| e.to_string())?)?;
    let temp = dir.join("sessions.enc.tmp");
    fs::write(&temp, encrypted).map_err(|e| e.to_string())?;
    fs::rename(temp, dir.join("sessions.enc")).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Account {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub senha: Option<String>,
    #[serde(default)]
    pub proxy: Option<serde_json::Value>,
}

fn get_app_data_dir() -> PathBuf {
    if let Some(roaming) = std::env::var_os("APPDATA") {
        PathBuf::from(roaming).join("pawnailo")
    } else {
        PathBuf::from(".").join("data")
    }
}

fn get_creds_path() -> PathBuf {
    get_app_data_dir().join("accounts.enc")
}

#[cfg(windows)]
pub fn dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};
    use std::ptr::null_mut;

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    unsafe {
        let res = CryptProtectData(
            &in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        );
        if res.is_err() {
            return Err("Falha na chamada DPAPI CryptProtectData".to_string());
        }
        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let result = slice.to_vec();
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as _)));
        Ok(result)
    }
}

#[cfg(windows)]
pub fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};
    use std::ptr::null_mut;

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    unsafe {
        let res = CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        );
        if res.is_err() {
            return Err("Falha na chamada DPAPI CryptUnprotectData".to_string());
        }
        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let result = slice.to_vec();
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as _)));
        Ok(result)
    }
}

#[cfg(not(windows))]
pub fn dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

#[cfg(not(windows))]
pub fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

pub fn load_accounts() -> Vec<Account> {
    let path = get_creds_path();
    let mut accounts: Vec<Account> = if path.exists() {
        match fs::read(&path) {
            Ok(encrypted_bytes) => {
                match dpapi_decrypt(&encrypted_bytes) {
                    Ok(plain_bytes) => {
                        serde_json::from_slice::<Vec<Account>>(&plain_bytes).unwrap_or_default()
                    }
                    Err(_) => {
                        serde_json::from_slice::<Vec<Account>>(&encrypted_bytes).unwrap_or_default()
                    }
                }
            }
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    let primary_email = accounts.first().and_then(|a| a.email.clone()).filter(|e| !e.is_empty());
    let primary_senha = accounts.first().and_then(|a| a.senha.clone()).filter(|s| !s.is_empty());

    while accounts.len() < 4 {
        let i = accounts.len();
        accounts.push(Account {
            name: Some(format!("Personagem {}", i + 1)),
            email: primary_email.clone().or_else(|| Some("".to_string())),
            senha: primary_senha.clone().or_else(|| Some("".to_string())),
            proxy: None,
        });
    }

    for (i, a) in accounts.iter_mut().enumerate() {
        a.proxy = None;
        if let Some(ref mut name) = a.name {
            if name.starts_with("Conta ") {
                *name = format!("Personagem {}", i + 1);
            }
        } else {
            a.name = Some(format!("Personagem {}", i + 1));
        }
        if a.email.as_deref().unwrap_or("").is_empty() {
            if let Some(ref e) = primary_email {
                a.email = Some(e.clone());
            }
        }
        if a.senha.as_deref().unwrap_or("").is_empty() {
            if let Some(ref s) = primary_senha {
                a.senha = Some(s.clone());
            }
        }
    }

    accounts.truncate(4);
    accounts
}

pub fn save_accounts(mut accounts: Vec<Account>) -> Result<(), String> {
    for a in &mut accounts {
        a.proxy = None;
    }
    let dir = get_app_data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let json_bytes = serde_json::to_vec(&accounts).map_err(|e| e.to_string())?;
    let encrypted = dpapi_encrypt(&json_bytes)?;

    let path = get_creds_path();
    let tmp_path = dir.join("accounts.enc.tmp");

    fs::write(&tmp_path, &encrypted).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_and_propagate_single_account() {
        let mut accounts = vec![
            Account {
                name: Some("Conta 1".to_string()),
                email: Some("trainer@example.com".to_string()),
                senha: Some("secret123".to_string()),
                proxy: None,
            }
        ];

        let primary_email = accounts.first().and_then(|a| a.email.clone()).filter(|e| !e.is_empty());
        let primary_senha = accounts.first().and_then(|a| a.senha.clone()).filter(|s| !s.is_empty());

        while accounts.len() < 4 {
            let i = accounts.len();
            accounts.push(Account {
                name: Some(format!("Personagem {}", i + 1)),
                email: primary_email.clone().or_else(|| Some("".to_string())),
                senha: primary_senha.clone().or_else(|| Some("".to_string())),
                proxy: None,
            });
        }

        for (i, a) in accounts.iter_mut().enumerate() {
            if let Some(ref mut name) = a.name {
                if name.starts_with("Conta ") {
                    *name = format!("Personagem {}", i + 1);
                }
            } else {
                a.name = Some(format!("Personagem {}", i + 1));
            }
            if a.email.as_deref().unwrap_or("").is_empty() {
                if let Some(ref e) = primary_email {
                    a.email = Some(e.clone());
                }
            }
            if a.senha.as_deref().unwrap_or("").is_empty() {
                if let Some(ref s) = primary_senha {
                    a.senha = Some(s.clone());
                }
            }
        }

        assert_eq!(accounts.len(), 4);
        assert_eq!(accounts[0].name.as_deref(), Some("Personagem 1"));
        assert_eq!(accounts[0].email.as_deref(), Some("trainer@example.com"));
        assert_eq!(accounts[1].name.as_deref(), Some("Personagem 2"));
        assert_eq!(accounts[1].email.as_deref(), Some("trainer@example.com"));
        assert_eq!(accounts[1].senha.as_deref(), Some("secret123"));
        assert_eq!(accounts[2].name.as_deref(), Some("Personagem 3"));
        assert_eq!(accounts[2].email.as_deref(), Some("trainer@example.com"));
        assert_eq!(accounts[3].name.as_deref(), Some("Personagem 4"));
        assert_eq!(accounts[3].email.as_deref(), Some("trainer@example.com"));
    }
}
