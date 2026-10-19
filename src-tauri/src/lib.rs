pub mod credentials;
pub mod account_proxy;
pub mod desktop_settings;
pub mod game_headless;
pub mod webview_manager;
pub mod webview_memory;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Window};
use serde::Serialize;
use serde_json::json;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn creds_load() -> Vec<credentials::Account> {
    credentials::load_accounts()
}

#[tauri::command]
async fn creds_save(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    accounts: Vec<credentials::Account>,
) -> Result<bool, String> {
    let ok = credentials::save_accounts(accounts.clone()).is_ok();
    if ok {
        for (i, acc) in accounts.iter().enumerate() {
            let email = acc.email.as_deref().unwrap_or("");
            let pass = acc.senha.as_deref().unwrap_or("");
            if !email.is_empty() && !pass.is_empty() {
                let _ = manager.fill_credentials(&app, i, email, pass).await;
            }
        }
    }
    Ok(ok)
}

#[tauri::command]
async fn webview_fill_creds(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    email: String,
    pass: String,
) -> Result<bool, String> {
    manager.fill_credentials(&app, index, &email, &pass).await.map(|_| true)
}

#[tauri::command]
async fn webview_settings(app:AppHandle,manager:tauri::State<'_,Arc<webview_manager::WebviewManager>>,index:usize,zoom:Option<f64>,muted:Option<bool>)->Result<webview_manager::ViewSettings,String>{manager.configure_view(&app,index,zoom,muted).await}

#[derive(Serialize)]
pub struct WindowStateResponse {
    pub maximized: bool,
    pub visible: bool,
}

#[tauri::command]
async fn window_control(window: Window, action: String) -> Result<WindowStateResponse,String> {
    let mut is_max = window.is_maximized().unwrap_or(false);
    match action.as_str() {
        "minimize" => {
            desktop_settings::minimize_window_to_tray(&window);
        }
        "maximize" => {
            if is_max {
                let _ = window.unmaximize();
                is_max = false;
            } else {
                let _ = window.maximize();
                is_max = true;
            }
        }
        "close" => {
            let _ = window.close();
        }
        "show" => { desktop_settings::restore_window(window.app_handle()); }
        "drag" => { let _ = window.start_dragging(); }
        _ => {}
    }
    let _ = window.emit_to("main", "window:maximized", is_max);
    Ok(WindowStateResponse { maximized: is_max, visible:window.is_visible().unwrap_or(false) })
}

#[tauri::command]
fn set_awake(on: bool) -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };
        unsafe {
            if on {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }
    true
}

#[tauri::command]
fn set_min_to_tray(state:tauri::State<'_, desktop_settings::DesktopSettings>, on:bool)->Result<bool,String>{state.set_min_to_tray(on)}

#[tauri::command]
fn preset_read(name: String) -> Option<String> {
    let candidates = [
        PathBuf::from("presets").join(&name),
        PathBuf::from("../presets").join(&name),
        PathBuf::from("ui/presets").join(&name),
    ];
    for p in &candidates {
        if let Ok(c) = fs::read_to_string(p) {
            return Some(c);
        }
    }
    None
}

fn get_app_data_dir() -> PathBuf {
    if let Some(roaming) = std::env::var_os("APPDATA") {
        PathBuf::from(roaming).join("pawnailo")
    } else {
        PathBuf::from(".").join("data")
    }
}

#[tauri::command]
fn errlog_write(origin: String, msg: String) -> bool {
    let dir = get_app_data_dir();
    let _ = fs::create_dir_all(&dir);
    let log_file = dir.join("relatorio-de-erros.log");
    use std::io::Write;
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = writeln!(f, "[LOG] [{}] {}", origin, msg);
    }
    true
}

#[tauri::command]
fn errlog_open() -> bool {
    let dir = get_app_data_dir();
    let log_file = dir.join("relatorio-de-erros.log");
    if log_file.exists() {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("notepad.exe")
                .arg(log_file)
                .spawn();
        }
    }
    true
}

#[tauri::command]
fn backup_save(name: String, content: String, _header: Option<String>) -> bool {
    let dir = get_app_data_dir().join("backups");
    let _ = fs::create_dir_all(&dir);
    let f = dir.join(name);
    fs::write(f, content).is_ok()
}

#[tauri::command]
async fn system_notify(app:AppHandle,title:String,body:String)->Result<bool,String>{
    tauri::async_runtime::spawn_blocking(move||{
        use tauri_plugin_notification::NotificationExt;
        match app.notification().builder().title(&title).body(&body).show(){
            Ok(())=>Ok(true),
            Err(error)=>{
                #[cfg(windows)] {return tauri_winrt_notification::Toast::new(tauri_winrt_notification::Toast::POWERSHELL_APP_ID).title(&title).text1(&body).show().map(|_|true).map_err(|_|error.to_string());}
                #[cfg(not(windows))] {Err(error.to_string())}
            }
        }
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn webhook_send(url: String, text: String) -> bool {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "content": text });
    client.post(&url).json(&body).send().await.is_ok()
}

#[derive(Serialize)]
pub struct ExtensionResponse {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
async fn userscript_fetch(url: String) -> Option<String> {
    let client = reqwest::Client::new();
    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            return resp.text().await.ok();
        }
    }
    None
}

#[tauri::command]
async fn userscript_request(url: String) -> ExtensionResponse {
    let client = reqwest::Client::new();
    if let Ok(resp) = client.get(&url).send().await {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        ExtensionResponse { status, body }
    } else {
        ExtensionResponse { status: 500, body: String::new() }
    }
}

#[tauri::command]
fn account_clear(index: usize) -> bool {
    let dir = get_app_data_dir().join(format!("profiles/conta_{}", index + 1));
    if dir.exists() {
        let _ = fs::remove_dir_all(&dir);
    }
    true
}

#[tauri::command]
async fn proxy_apply(app:AppHandle,manager:tauri::State<'_,Arc<webview_manager::WebviewManager>>,headless:tauri::State<'_,Arc<game_headless::GameHeadlessManager>>)->Result<serde_json::Value,String>{
    let _transition=manager.transition.lock().await;
    let mut changed=Vec::new();let mut errors=Vec::new();
    for index in 0..4 {
        match manager.proxy_changed(index){
            Ok(false)=>continue,
            Err(error)=>{manager.destroy(&app,index).await?;headless.stop(index).await;errors.push(json!({"index":index,"error":error}));continue;},
            Ok(true)=>{}
        }
        if manager.is_headless(index).await {
            let config=game_headless::BlasterConfig{token:headless.get_token(index).await,nick:headless.get_nick(index).await,ws_url:headless.get_ws_url(index).await,hunt:None};
            if let Err(error)=headless.start(app.clone(),index,config).await{let _=app.emit_to("main","blaster:status",json!({"index":index,"status":"error","error":error}));errors.push(json!({"index":index,"error":"Falha ao reconectar Blaster pelo proxy"}));continue;}
            manager.mark_proxy(index);
        }else{manager.destroy(&app,index).await?;changed.push(index);}
    }
    Ok(json!({"changed":changed,"errors":errors}))
}

#[derive(Serialize)]
pub struct AutoStartResponse {
    pub on: bool,
    pub suportado: bool,
}

#[tauri::command]
fn autostart_get() -> AutoStartResponse {
    AutoStartResponse { on: desktop_settings::autostart_enabled(), suportado: cfg!(windows) }
}

#[tauri::command]
async fn autostart_set(app:AppHandle,on:bool)->Result<bool,String>{
    let saved=tauri::async_runtime::spawn_blocking(move||desktop_settings::set_autostart(on)).await.map_err(|e|e.to_string())??;
    let _=app.emit_to("main","autostart:change",saved);Ok(saved)
}

// ----------------- MASTER BLASTER HEADLESS -----------------

#[tauri::command]
async fn blaster_start(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    config: game_headless::BlasterConfig,
) -> Result<(), String> {
    if index >= 4 { return Err("Conta inválida".into()); }
    let _auth = manager.auth_locks[index].lock().await;
    let _transition = views.transition.lock().await;
    if manager.get_token(index).await.is_none() && config.token.as_deref().unwrap_or("").is_empty() {
        let session = views.execute(&app, index,
            "({token: localStorage.getItem('sessao'), nick: localStorage.getItem('nick')})").await?;
        let token = session.get("token").and_then(|v| v.as_str()).filter(|v| !v.is_empty()).ok_or("Faça login na conta antes de ativar o Headless")?;
        manager.set_token(index, token.into(), session.get("nick").and_then(|v| v.as_str()).map(str::to_owned)).await;
    }
    views.set_headless(index, true).await;
    views.destroy(&app, index).await?;
    if let Err(e) = manager.start(app, index, config).await {
        views.set_headless(index, false).await;
        return Err(e);
    }
    Ok(())
}

#[tauri::command]
async fn blaster_stop(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
) -> Result<bool, String> {
    let _transition = views.transition.lock().await;
    let stopped = manager.stop(index).await;
    views.set_headless(index, false).await;
    Ok(stopped)
}

#[tauri::command]
async fn blaster_status(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
) -> Result<serde_json::Value, String> {
    let running = manager.is_running(index).await;
    Ok(json!({
        "active": running,
        "status": if running { "connected" } else { "disconnected" }
    }))
}

#[tauri::command]
async fn blaster_send(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
    data: serde_json::Value,
) -> Result<bool, String> {
    manager.send_message(index, data).await
}

#[tauri::command]
async fn session_token_save(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
    token: String,
    nick: Option<String>,
) -> Result<bool, String> {
    manager.set_token(index, token.clone(), nick.clone()).await;
    let _ = app.emit(
        "session:token",
        json!({
            "index": index,
            "token": token,
            "nick": nick
        }),
    );
    Ok(true)
}

#[tauri::command]
async fn session_token_get(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
) -> Result<Option<String>, String> {
    Ok(manager.get_token(index).await)
}

#[tauri::command]
async fn telemetry_report(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
    event: serde_json::Value,
) -> Result<bool, String> {
    manager.update_telemetry_event(&app, index, &event).await;
    Ok(true)
}



// ----------------- AUTH & CAMOUFOX -----------------

fn login_components(app: &AppHandle) -> Option<(PathBuf, PathBuf, Option<PathBuf>)> {
    if let Ok(resources) = app.path().resource_dir() {
        let runtime = resources.join("login-runtime");
        let python = runtime.join("python/python.exe");
        let script = runtime.join("turnstile_solver.py");
        let browser = runtime.join("camoufox/camoufox.exe");
        if python.is_file() && script.is_file() && browser.is_file() {
            return Some((python, script, Some(browser)));
        }
    }
    [PathBuf::from("tools/turnstile_solver.py"), PathBuf::from("../tools/turnstile_solver.py")]
        .into_iter().find(|p| p.is_file())
        .map(|script| (std::env::var_os("PAW_NAILO_PYTHON").or_else(|| std::env::var_os("PIO_NAILO_PYTHON")).map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python")), script, None))
}

#[tauri::command]
fn camoufox_check(app: AppHandle) -> serde_json::Value {
    json!({ "available": login_components(&app).is_some() })
}

#[tauri::command]
async fn camoufox_login(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    data: serde_json::Value,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
) -> Result<serde_json::Value, String> {
    let index = data.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if index >= 4 { return Err("Conta inválida".into()); }
    let _auth = manager.auth_locks[index].lock().await;
    if views.is_headless(index).await { return Err("Conta em modo Blaster; sessão existente preservada".into()); }
    let email = data.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let password = data.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let proxy = data.get("proxy").cloned();

    if let Some((python, script_path, browser)) = login_components(&app) {
        let payload = json!({
            "mode": "login",
            "email": email,
            "password": password,
            "proxy": proxy,
            "timeout_s": 60,
            "headless": true
        });
        let json_str = payload.to_string();

        let mut command = tokio::process::Command::new(python);
        if let Some(browser) = browser {
            command.env("PAW_NAILO_CAMOUFOX", &browser);
            command.env("PIO_NAILO_CAMOUFOX", browser);
        }
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = command.arg(script_path)
            .arg("--json")
            .arg(&json_str)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().rev() {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                if parsed.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(token) = parsed.get("token").and_then(|v| v.as_str()) {
                        let nick = parsed.get("nick").and_then(|v| v.as_str()).map(|s| s.to_string());
                        manager.set_token(index, token.to_string(), nick.clone()).await;
                        let _ = app.emit(
                            "session:token",
                            json!({
                                "index": index,
                                "token": token,
                                "nick": nick
                            }),
                        );
                    }
                }
                return Ok(parsed);
            }
        }
    }

    Ok(json!({ "success": false, "error": "turnstile_solver.py não encontrado" }))
}

#[tauri::command]
fn auth_cancel_login(_index: usize) -> bool {
    true
}

#[tauri::command]
async fn auth_window_open(app: AppHandle, index: usize, url: String) -> Result<bool, String> {
    let label = format!("auth-window-{}", index);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(true);
    }
    let parsed_url = WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?);
    let builder = WebviewWindowBuilder::new(&app, &label, parsed_url)
        .title(format!("Autenticação - Conta {}", index + 1))
        .inner_size(800.0, 700.0);
    let _ = builder.build().map_err(|e| e.to_string())?;
    Ok(true)
}

// ----------------- WEBVIEW MANAGER -----------------

#[tauri::command]
async fn webview_sync(
    app: AppHandle,
    window: Window,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: Option<String>,
    visible: Option<bool>,
) -> Result<(), String> {
    let _transition = manager.transition.lock().await;
    if let Some(v) = visible {
        manager.set_visibility_state(index, v).await;
    }
    manager
        .create_or_update(&app, &window, index, x, y, width, height, url)
        .await
}

#[tauri::command]
async fn webview_set_visible(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    visible: bool,
) -> Result<(), String> {
    let _transition = manager.transition.lock().await;
    manager.set_visible(&app, index, visible).await
}

#[tauri::command]
async fn webview_destroy(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
) -> Result<(), String> {
    manager.destroy(&app, index).await
}

#[tauri::command]
async fn webview_eval(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    script: String,
) -> Result<serde_json::Value, String> {
    manager.execute(&app, index, &script).await
}

#[tauri::command]
fn webview_navigate(app: AppHandle, index: usize, url: Option<String>) -> Result<(), String> {
    let view = app.get_webview(&format!("game-account-{}", index)).ok_or("WebView indisponível")?;
    match url {
        Some(url) => view.navigate(url.parse().map_err(|e: url::ParseError| e.to_string())?),
        None => view.reload(),
    }.map_err(|e| e.to_string())
}

fn is_valid_game_host(host: Option<&str>) -> bool {
    let host = match host {
        Some(h) => h.strip_prefix("www.").unwrap_or(h),
        None => return false,
    };
    host == "pokeascendedworld.com"
        || host.ends_with(".pokeascendedworld.com")
        || host == "pokeidle.io"
        || host.ends_with(".pokeidle.io")
        || host == "poke.idleworld.online"
        || host.ends_with(".idleworld.online")
}

fn game_index(webview: &tauri::Webview) -> Result<usize, String> {
    let index = webview.label().strip_prefix("game-account-")
        .or_else(|| webview.label().strip_prefix("embedded-acc-"))
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|i| *i < 4)
        .ok_or_else(|| "WebView inválida".to_string())?;

    if let Some(host) = webview.url().ok().and_then(|u| u.host_str().map(str::to_owned)) {
        if !is_valid_game_host(Some(&host)) {
            return Err("Origem inválida".into());
        }
    }
    Ok(index)
}

#[tauri::command]
fn webview_eval_result(webview: tauri::Webview, manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    request_id: u64, value: serde_json::Value, error: Option<String>) -> Result<(), String> {
    manager.resolve(game_index(&webview)?, request_id, value, error);
    Ok(())
}

static LAST_OPENED_URL: std::sync::Mutex<Option<(String, std::time::Instant)>> = std::sync::Mutex::new(None);

pub fn open_external_safely(url: &str) {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return;
    }
    let mut last = LAST_OPENED_URL.lock().unwrap();
    if let Some((ref last_url, ref last_time)) = *last {
        if last_url == url && last_time.elapsed() < std::time::Duration::from_millis(1500) {
            return;
        }
    }
    *last = Some((url.to_string(), std::time::Instant::now()));
    let _ = tauri_plugin_opener::open_url(url, None::<&str>);
}

#[tauri::command]
fn game_console_message(webview: tauri::Webview, app: AppHandle, message: String) -> Result<(), String> {
    let index = game_index(&webview)?;
    if message.len() >= 5_000_000 || !["__PGST__", "__PGIV__", "__PGDLG__", "__RBZOOM__", "__GMSET__", "__GMXHR__", "__PGECO__", "__PGOPEN__"].iter().any(|p| message.starts_with(p)) {
        return Err("Mensagem inválida".into());
    }
    if message.starts_with("__PGOPEN__") {
        let url = message.trim_start_matches("__PGOPEN__").trim();
        open_external_safely(url);
        return Ok(());
    }
    app.emit("game:console", json!({"index": index, "message": message})).map_err(|e| e.to_string())
}

#[tauri::command]
async fn report_gameplay(
    webview: tauri::Webview,
    app: AppHandle,
    headless: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    session: String,
    event: serde_json::Value,
) -> Result<(), String> {
    if session.is_empty() || session.len() > 64 { return Err("Sessão inválida".into()); }
    let host = webview.url().ok().and_then(|u| u.host_str().map(str::to_owned));
    if !is_valid_game_host(host.as_deref()) {
        return Err("Origem inválida".into());
    }
    let label = webview.label().to_string();
    let index: usize = if let Some(idx_str) = label.strip_prefix("game-account-") {
        idx_str.parse().unwrap_or(0)
    } else if let Some(idx_str) = label.strip_prefix("embedded-acc-") {
        idx_str.parse().unwrap_or(0)
    } else {
        0
    };
    if views.is_headless(index).await { return Ok(()); }

    headless.update_telemetry_event(&app, index, &event).await;
    Ok(())
}

#[tauri::command]
async fn report_gameplay_batch(
    webview: tauri::Webview,
    app: AppHandle,
    headless: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    session: String,
    events: Vec<serde_json::Value>,
    metrics: serde_json::Value,
) -> Result<(), String> {
    if session.is_empty() || session.len() > 64 || events.is_empty() || events.len() > 64 {
        return Err("Lote inválido".into());
    }
    let host = webview.url().ok().and_then(|u| u.host_str().map(str::to_owned));
    if !is_valid_game_host(host.as_deref()) {
        return Err("Origem inválida".into());
    }
    if events.iter().map(|e| e.to_string().len()).sum::<usize>() > 1024 * 1024 {
        return Err("Lote muito grande".into());
    }

    let label = webview.label().to_string();
    let index: usize = if let Some(idx_str) = label.strip_prefix("game-account-") {
        idx_str.parse().unwrap_or(0)
    } else if let Some(idx_str) = label.strip_prefix("embedded-acc-") {
        idx_str.parse().unwrap_or(0)
    } else {
        0
    };
    if views.is_headless(index).await { return Ok(()); }

    let has_welcome = events.iter().any(|e| e.get("t").and_then(|v| v.as_str()) == Some("welcome"));
    for event in events {
        headless.update_telemetry_event(&app, index, &event).await;
    }

    if has_welcome {
        crate::webview_memory::refresh(&webview);
    }

    let _ = metrics;
    Ok(())
}

pub fn run() {
    let headless_manager = Arc::new(game_headless::GameHeadlessManager::new());
    let webview_manager = Arc::new(webview_manager::WebviewManager::new());

    #[allow(unused_mut)]
    let mut context=tauri::generate_context!();
    // An isolated native profile is available only in debug builds for lifecycle tests.
    #[cfg(debug_assertions)]
    if let Some(path)=std::env::var_os("PAW_NAILO_TEST_PROFILE").or_else(|| std::env::var_os("PIO_NAILO_TEST_PROFILE")) {
        let _=path;
        context.config_mut().app.windows[0].create=false;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(path)=std::env::var_os("PAW_NAILO_TEST_PROFILE").or_else(|| std::env::var_os("PIO_NAILO_TEST_PROFILE")) {
                WebviewWindowBuilder::from_config(app,&app.config().app.windows[0])?.data_directory(PathBuf::from(path)).build()?;
            }
            let handle = app.handle().clone();
            if let Err(error)=desktop_settings::setup_tray(&handle){eprintln!("Bandeja indisponível: {error}");}
            tauri::async_runtime::spawn_blocking(move||{
                if desktop_settings::autostart_enabled(){let _=desktop_settings::set_autostart(true);}
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                    window.app_handle().exit(0);
                }
                if matches!(event, tauri::WindowEvent::Resized(_)) || matches!(event, tauri::WindowEvent::Focused(false)) {
                    if window.is_minimized().unwrap_or(false) && window.is_visible().unwrap_or(false) {
                        desktop_settings::minimize_to_tray(window.app_handle());
                    }
                }
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Resized(_)) {
                let _ = window.emit_to("main", "window:maximized", window.is_maximized().unwrap_or(false));
            }
        })
        .manage(desktop_settings::DesktopSettings::new())
        .manage(headless_manager)
        .manage(webview_manager)
        .manage(webview_memory::MemoryPolicy::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            creds_load,
            creds_save,
            window_control,
            set_awake,
            set_min_to_tray,
            preset_read,
            errlog_write,
            errlog_open,
            backup_save,
            system_notify,
            webhook_send,
            userscript_fetch,
            userscript_request,
            account_clear,
            proxy_apply,
            autostart_get,
            autostart_set,
            blaster_start,
            blaster_stop,
            blaster_status,
            blaster_send,
            session_token_save,
            session_token_get,
            telemetry_report,
            report_gameplay,
            report_gameplay_batch,

            camoufox_check,
            camoufox_login,
            auth_cancel_login,
            auth_window_open,
            webview_sync,
            webview_set_visible,
            webview_destroy,
            webview_eval,
            webview_navigate,
            webview_eval_result,
            game_console_message,
            webview_fill_creds,
            webview_settings
        ])
        .run(context)
        .expect("erro ao rodar o aplicativo PAW Nailo em Rust");
}
