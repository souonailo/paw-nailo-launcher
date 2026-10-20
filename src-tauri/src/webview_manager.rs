use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, atomic::{AtomicU64, Ordering}};
use std::path::PathBuf;
use tauri::{
    webview::WebviewBuilder, AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, Window,
};
use tokio::sync::{RwLock, oneshot};

fn get_account_profile_dir(index: usize) -> PathBuf {
    if let Some(roaming) = std::env::var_os("APPDATA") {
        PathBuf::from(roaming)
            .join("pawnailo")
            .join("profiles")
            .join(format!("conta_{}", index + 1))
    } else {
        PathBuf::from(".")
            .join("data")
            .join("profiles")
            .join(format!("conta_{}", index + 1))
    }
}

pub const CHROME_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

pub fn generate_autofill_script(index: usize, email: &str, pass: &str) -> String {
    let email_json = serde_json::to_string(email).unwrap_or_else(|_| "\"\"".to_string());
    let pass_json = serde_json::to_string(pass).unwrap_or_else(|_| "\"\"".to_string());

    format!(
        r#"
        (() => {{
            // NUNCA executar dentro de iframes (como o do Cloudflare Turnstile)
            if (window.self !== window.top) {{
                return;
            }}

            const ACCOUNT_INDEX = {index};
            window.__PAW_PANEL_INDEX = ACCOUNT_INDEX;
            const EMAIL = {email_json};
            const SENHA = {pass_json};

            const getInvoke = () => (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
                                    (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);

            // Se a sessão já estiver presente no localStorage, reporta via IPC nativo
            try {{
                const s = localStorage.getItem('sessao');
                const n = localStorage.getItem('nick');
                const inv = getInvoke();
                if (s && s.length > 20 && typeof inv === 'function') {{
                    inv('report_gameplay', {{ session: 'autofill-' + ACCOUNT_INDEX, event: {{t: 'session_token', data: {{token: s, nick: n || ''}}}} }}).catch(() => {{}});
                }}
            }} catch (_) {{}}

            if (!EMAIL || !SENHA) return;

            function setVal(el, val) {{
                if (!el) return;
                try {{
                    const proto = Object.getPrototypeOf(el);
                    const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                    if (desc && desc.set) {{
                        desc.set.call(el, val);
                    }} else {{
                        el.value = val;
                    }}
                }} catch (e) {{
                    el.value = val;
                }}
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}

            try {{
                if (!document.getElementById('__paw_login_fit')) {{
                    const st = document.createElement('style');
                    st.id = '__paw_login_fit';
                    st.textContent = `
                        #auth-dialog.site-auth-dialog, dialog#auth-dialog {{
                            max-height: 96vh !important;
                            max-width: 96vw !important;
                            padding: 8px 12px !important;
                            margin: auto !important;
                            overflow-y: auto !important;
                            box-sizing: border-box !important;
                        }}
                        #auth-dialog .auth-content {{
                            padding: 8px 14px 10px !important;
                        }}
                        #auth-dialog #auth-kicker {{
                            font-size: 8px !important;
                            margin-bottom: 2px !important;
                        }}
                        #auth-dialog h2#auth-title {{
                            font-size: 15px !important;
                            line-height: 1.2 !important;
                            margin: 2px 0 4px !important;
                        }}
                        #auth-dialog .auth-intro {{
                            font-size: 10px !important;
                            margin-bottom: 6px !important;
                        }}
                        #auth-dialog .auth-tabs {{
                            margin-bottom: 6px !important;
                        }}
                        #auth-dialog .auth-tabs button {{
                            padding: 3px 10px !important;
                            font-size: 10px !important;
                        }}
                        #auth-dialog #auth-form label {{
                            margin-bottom: 4px !important;
                            font-size: 10px !important;
                        }}
                        #auth-dialog #auth-form input {{
                            padding: 4px 8px !important;
                            font-size: 11px !important;
                            height: 28px !important;
                        }}
                        #auth-dialog .password-field button {{
                            font-size: 10px !important;
                        }}
                        #auth-dialog .password-help {{
                            display: none !important;
                        }}
                        #auth-dialog .auth-security {{
                            margin: 4px 0 !important;
                        }}
                        #auth-dialog .auth-submit {{
                            padding: 6px 12px !important;
                            font-size: 11px !important;
                            min-height: 30px !important;
                            margin-top: 4px !important;
                        }}
                        #auth-dialog .auth-bottom {{
                            margin-top: 4px !important;
                            font-size: 9px !important;
                        }}
                    `;
                    (document.head || document.documentElement).appendChild(st);
                }}
            }} catch (_) {{}}

            function isTurnstileResolved() {{
                if (location.pathname.includes('/characters') || location.pathname.includes('/play')) {{
                    return true;
                }}

                const tk = document.querySelector('input[name="cf-turnstile-response"]');
                if (tk && tk.value && tk.value.trim().length > 20) {{
                    return true;
                }}

                try {{
                    if (window.turnstile && typeof window.turnstile.getResponse === 'function') {{
                        const token = window.turnstile.getResponse() || window.turnstile.getResponse('entrar');
                        if (token && typeof token === 'string' && token.trim().length > 20) {{
                            return true;
                        }}
                    }}
                }} catch (_) {{}}

                const secStatus = document.querySelector('.auth-security small[role="status"]');
                if (secStatus && /conclu[ií]da/i.test(secStatus.textContent || '')) {{
                    return true;
                }}

                const hasWidget = !!document.querySelector('#login-turnstile, .cf-turnstile, [data-sitekey], iframe[src*="cloudflare"], iframe[src*="turnstile"]');
                if (!hasWidget) {{
                    return true;
                }}

                return false;
            }}

            function fillLoginForm() {{
                if (location.pathname.includes('/characters')) {{
                    return false;
                }}

                try {{
                    const d = document.getElementById('auth-dialog');
                    if (d && !d.open && typeof d.showModal === 'function') {{
                        d.showModal();
                    }}
                }} catch (_) {{}}

                const inputs = Array.from(document.querySelectorAll('input'));
                const u = inputs.find(i =>
                    i.name === 'email' ||
                    i.autocomplete === 'username' ||
                    i.type === 'email' ||
                    i.name === 'id' ||
                    i.id === 'email' ||
                    i.id === 'username'
                );
                const p = inputs.find(i =>
                    i.name === 'password' ||
                    i.autocomplete === 'current-password' ||
                    i.type === 'password' ||
                    i.name === 'password' ||
                    i.id === 'password'
                );

                if (u && p) {{
                    if (u.value !== EMAIL) setVal(u, EMAIL);
                    if (p.value !== SENHA) setVal(p, SENHA);
                    return true;
                }}
                return false;
            }}

            function findLoginSubmitBtn() {{
                const form = document.querySelector('#auth-form, form');
                if (form) {{
                    const subInForm = form.querySelector('#auth-submit, button[type="submit"], input[type="submit"]');
                    if (subInForm) return subInForm;
                }}
                const p = document.querySelector('input[type="password"], input[autocomplete="current-password"]');
                const allButtons = Array.from(document.querySelectorAll('button'));
                return allButtons.find(x => {{
                    const isTab = x.getAttribute('role') === 'tab' || /tab|nav/i.test(x.className);
                    if (isTab) return false;
                    if (p && !(p.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)) {{
                        return false;
                    }}
                    return x.type === 'submit' ||
                        /auth-imgbtn|btn-primary|submit|auth-submit/i.test(x.className) ||
                        x.id === 'entrar' ||
                        x.id === 'auth-submit' ||
                        /entrar|logar|sign in|login/i.test(x.textContent || '');
                }});
            }}

            function tryCharacterLobbySelection() {{
                if (!location.pathname.includes('/characters')) {{
                    return null;
                }}

                const nt = document.getElementById('lobby-new-tab');
                if (nt) {{
                    nt.checked = false;
                    nt.disabled = true;
                }}

                const card = document.querySelector('[data-character-slot="' + ACCOUNT_INDEX + '"]');
                const allCards = Array.from(document.querySelectorAll('.lobby-character-card'));
                const targetCard = card || (allCards.length > ACCOUNT_INDEX ? allCards[ACCOUNT_INDEX] : null);

                if (!targetCard) return null;

                const cNick = targetCard.querySelector('h2, h3, .character-name, .lobby-character-name, b, strong')?.textContent?.trim();
                if (cNick && !cNick.startsWith('Personagem ') && !cNick.startsWith('Conta ')) {{
                    const inv = getInvoke();
                    if (typeof inv === 'function') {{
                        inv('report_gameplay', {{ session: 'lobby-' + ACCOUNT_INDEX, event: {{t: 'character_selected', data: {{index: ACCOUNT_INDEX, nick: cNick}}}} }}).catch(() => {{}});
                    }}
                }}

                const enterBtn = targetCard.querySelector('button[data-enter]') ||
                    Array.from(targetCard.querySelectorAll('button')).find(b => {{
                        if (b.disabled) return false;
                        const txt = (b.textContent || '').trim().toLowerCase();
                        const cls = (b.className || '').toLowerCase();
                        if (/excluir|delet|apagar|remover|danger|trash/.test(txt + ' ' + cls)) return false;
                        return /entrar|jogar|play|enter/.test(txt) || /primary|enter|play/.test(cls);
                    }}) ||
                    Array.from(targetCard.querySelectorAll('button')).find(b => !b.disabled && !/excluir|delet|apagar|remover|danger|trash/.test((b.textContent || '') + ' ' + (b.className || ''))) ||
                    targetCard;

                if (enterBtn && !enterBtn.disabled) {{
                    return enterBtn;
                }}
                return null;
            }}

            let lastLoginSubmit = 0;
            let lastLobbyClick = 0;
            let stepCount = 0;
            let isDone = false;

            function cleanup() {{
                isDone = true;
                if (window.__pawAutofillTimer) {{
                    clearInterval(window.__pawAutofillTimer);
                    window.__pawAutofillTimer = null;
                }}
                if (window.__pawAutofillObserver) {{
                    try {{ window.__pawAutofillObserver.disconnect(); }} catch (_) {{}}
                    window.__pawAutofillObserver = null;
                }}
                window.__pokeNativeAutofill = false;
                window.__pokeNativeAutofillRunner = null;
            }}

            function runStep() {{
                if (isDone) return;
                stepCount++;

                // 1. Já está conectado no jogo (#app ativo e sem diálogos de autenticação)
                const hasAuthDialog = !!document.querySelector('#auth-dialog, .site-auth-dialog, #login-turnstile, #auth-form');
                const app = document.getElementById('app');
                const isGameRunning = app && !app.classList.contains('hidden') && !hasAuthDialog && (location.pathname.startsWith('/play') || location.pathname === '/');
                if (isGameRunning && !location.pathname.includes('/characters')) {{
                    cleanup();
                    return;
                }}

                // 2. Tela de seleção de personagens (/characters)
                if (location.pathname.includes('/characters')) {{
                    const lobbyBtn = tryCharacterLobbySelection();
                    if (lobbyBtn) {{
                        const now = Date.now();
                        if (now - lastLobbyClick > 1800) {{
                            lastLobbyClick = now;
                            try {{ lobbyBtn.scrollIntoView({{ block: 'nearest' }}); }} catch (_) {{}}
                            lobbyBtn.click();
                        }}
                    }}
                    return;
                }}

                // 3. Tela de formulário de login (/welcome, /login)
                const ok = fillLoginForm();
                const btn = findLoginSubmitBtn();
                const turnstileOk = isTurnstileResolved() || (stepCount > 8 && !document.querySelector('#login-turnstile, iframe[src*="cloudflare"]'));

                if (btn) {{
                    try {{ btn.scrollIntoView({{ block: 'nearest' }}); }} catch (_) {{}}
                }}

                if (ok && btn && turnstileOk && !btn.disabled) {{
                    const now = Date.now();
                    const minInterval = 4000;
                    if (now - lastLoginSubmit > minInterval) {{
                        lastLoginSubmit = now;
                        const stagger = (stepCount === 1) ? (ACCOUNT_INDEX * 200) : 0;
                        setTimeout(() => {{
                            try {{ if (!btn.disabled) btn.click(); }} catch (_) {{}}
                        }}, stagger);
                    }}
                }}

                // Limite de segurança: 60s (500 ticks * 120ms = 60s)
                if (stepCount > 500) {{
                    cleanup();
                }}
            }}

            // Dispara imediatamente o step se o runner já estiver ativo
            if (window.__pokeNativeAutofillRunner) {{
                window.__pokeNativeAutofillRunner();
                return;
            }}

            window.__pokeNativeAutofill = true;
            window.__pokeNativeAutofillRunner = runStep;

            window.addEventListener('popstate', runStep);
            window.addEventListener('hashchange', runStep);
            window.addEventListener('paw:locationchange', runStep);

            const startObserver = () => {{
                try {{
                    const target = document.documentElement || document.body;
                    if (target) {{
                        const obs = new MutationObserver(() => runStep());
                        obs.observe(target, {{ childList: true, subtree: true }});
                        window.__pawAutofillObserver = obs;
                    }}
                }} catch (_) {{}}
            }};

            if (document.documentElement || document.body) {{
                startObserver();
            }} else {{
                document.addEventListener('DOMContentLoaded', startObserver);
            }}

            window.__pawAutofillTimer = setInterval(runStep, 150);
            runStep();
        }})();
        "#
    )
}

#[derive(Clone, serde::Serialize)]
pub struct ViewSettings {pub zoom:f64,pub muted:bool,pub applied:bool}
impl Default for ViewSettings {fn default()->Self{Self{zoom:1.0,muted:false,applied:false}}}

pub struct WebviewManager {
    labels: RwLock<HashMap<usize, String>>,
    visibility: RwLock<HashMap<usize, bool>>,
    headless: RwLock<HashSet<usize>>,
    pub transition: tokio::sync::Mutex<()>,
    controls: std::sync::Arc<Mutex<HashMap<usize,ViewSettings>>>,
    proxies: Mutex<HashMap<usize,Option<crate::account_proxy::Proxy>>>,
    next_request: AtomicU64,
    pending: Mutex<HashMap<(usize, u64), oneshot::Sender<Result<serde_json::Value, String>>>>,
}

impl WebviewManager {
    pub fn new() -> Self {
        Self {
            labels: RwLock::new(HashMap::new()),
            visibility: RwLock::new(HashMap::new()),
            headless: RwLock::new(HashSet::new()),
            transition: tokio::sync::Mutex::new(()),
            controls: std::sync::Arc::new(Mutex::new(HashMap::new())),
            proxies: Mutex::new(HashMap::new()),
            next_request: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub async fn configure_view(&self,app:&AppHandle,index:usize,zoom:Option<f64>,muted:Option<bool>)->Result<ViewSettings,String>{
        if index>=4 {return Err("Conta inválida".into());}
        if zoom.map(|z|!z.is_finite() || !(0.5..=2.0).contains(&z)).unwrap_or(false){return Err("Zoom inválido".into());}
        let requested={let mut map=self.controls.lock().unwrap();let settings=map.entry(index).or_default();
            if let Some(z)=zoom{settings.zoom=z;}if let Some(m)=muted{settings.muted=m;}settings.clone()};
        let Some(view)=app.get_webview(&format!("game-account-{}",index))else{return Ok(requested);};
        #[cfg(windows)] {
            let (tx,rx)=oneshot::channel();let controls=self.controls.clone();
            view.with_webview(move|native|{
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
                use windows_core::Interface;
                let result=(||->Result<ViewSettings,String>{
                    let settings=controls.lock().unwrap().get(&index).cloned().unwrap_or_default();
                    unsafe{
                        let controller=native.controller();
                        controller.SetZoomFactor(settings.zoom).map_err(|e|e.to_string())?;
                        let core=controller.CoreWebView2().and_then(|c|c.cast::<ICoreWebView2_8>()).map_err(|e|e.to_string())?;
                        core.SetIsMuted(settings.muted).map_err(|e|e.to_string())?;
                        let mut actual_zoom=0.0;let mut actual_mute=windows_core::BOOL::default();
                        controller.ZoomFactor(&mut actual_zoom).map_err(|e|e.to_string())?;
                        core.IsMuted(&mut actual_mute).map_err(|e|e.to_string())?;
                        Ok(ViewSettings{zoom:actual_zoom,muted:actual_mute.as_bool(),applied:true})
                    }
                })();let _=tx.send(result);
            }).map_err(|e|e.to_string())?;
            tokio::time::timeout(std::time::Duration::from_secs(5),rx).await.map_err(|_|"Controle da WebView excedeu o tempo limite")?.map_err(|_|"Controle da WebView cancelado")?
        }
        #[cfg(not(windows))]{view.set_zoom(requested.zoom).map_err(|e|e.to_string())?;Ok(requested)}
    }

    pub fn mark_proxy(&self,index:usize){if let Ok(proxy)=crate::account_proxy::for_account(index){self.proxies.lock().unwrap().insert(index,proxy);}}
    pub fn proxy_changed(&self,index:usize)->Result<bool,String>{let next=crate::account_proxy::for_account(index)?;Ok(self.proxies.lock().unwrap().get(&index).cloned().unwrap_or(None)!=next)}

    pub async fn is_visible(&self, index: usize) -> bool {
        if self.is_headless(index).await { return false; }
        let vis = self.visibility.read().await;
        *vis.get(&index).unwrap_or(&true)
    }

    pub async fn is_headless(&self, index: usize) -> bool {
        self.headless.read().await.contains(&index)
    }

    pub async fn set_headless(&self, index: usize, active: bool) {
        let mut modes = self.headless.write().await;
        if active { modes.insert(index); self.mark_proxy(index); } else { modes.remove(&index); }
    }

    pub async fn set_visibility_state(&self, index: usize, visible: bool) {
        let mut vis = self.visibility.write().await;
        vis.insert(index, visible);
    }

    pub async fn create_or_update(
        &self,
        app: &AppHandle,
        window: &Window,
        index: usize,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        url: Option<String>,
    ) -> Result<(), String> {
        if index >= 4 { return Err("Conta inválida".into()); }
        if self.is_headless(index).await { return Ok(()); }
        let label = format!("game-account-{}", index);
        let pos = LogicalPosition::new(x, y);
        let size = LogicalSize::new(width, height);

        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.set_position(pos);
            let _ = wv.set_size(size);
            let visible = self.is_visible(index).await;
            if visible {
                let _ = wv.show();
                crate::webview_memory::set_background(&wv, false);
            } else {
                let _ = wv.hide();
                crate::webview_memory::set_background(&wv, true);
            }
            return Ok(());
        }

        let target_url = url.unwrap_or_else(|| "https://pokeascendedworld.com/play".to_string());
        let parsed_url = WebviewUrl::External(
            target_url
                .parse()
                .map_err(|e: url::ParseError| e.to_string())?,
        );

        let proxy=crate::account_proxy::for_account(index)?;
        let initial_url=if proxy.is_some(){WebviewUrl::External("about:blank".parse().unwrap())}else{parsed_url};
        let profile_dir = get_account_profile_dir(index);
        let _ = std::fs::create_dir_all(&profile_dir);

        let mut builder = WebviewBuilder::new(&label, initial_url)
            .data_directory(profile_dir)
            .user_agent(CHROME_USER_AGENT)
            .devtools(false)
            .additional_browser_args(&crate::webview_memory::browser_args(proxy.as_ref().map(|p|&p.url)))
            .initialization_script(crate::webview_memory::background_economy_script())
            .initialization_script(include_str!("gameplay_bridge.js"))
            .initialization_script(include_str!("../../ui/src/ui/inventory-state.js"))
            .initialization_script(include_str!("launcher_gameplay.js"));

        if let Some(p)=&proxy{builder=builder.proxy_url(p.url.clone());}
        builder = builder.initialization_script(include_str!("guest_compat.js"))
            .on_new_window(|url, _features| {
                let url_str = url.as_str();
                crate::open_external_safely(url_str);
                tauri::webview::NewWindowResponse::Deny
            })
            .on_navigation(|url| {
                let scheme = url.scheme();
                if scheme != "http" && scheme != "https" {
                    return scheme == "about";
                }
                let host = url.host_str().unwrap_or("");
                let is_game = host.is_empty()
                    || host.ends_with("pokeascendedworld.com")
                    || host.ends_with("pokeidle.io")
                    || host.ends_with("idleworld.online")
                    || url.as_str() == "about:blank";
                if is_game {
                    return true;
                }
                crate::open_external_safely(url.as_str());
                false
            })
            .on_page_load(move |wv, payload| {
                use tauri::Emitter;
                let event = match payload.event() {
                    tauri::webview::PageLoadEvent::Started => "did-start-loading",
                    tauri::webview::PageLoadEvent::Finished => "dom-ready",
                };
                let _ = wv.app_handle().emit_to("main", "game:load", serde_json::json!({
                    "index": index, "event": event, "url": payload.url().as_str()
                }));
            });

        // Pre-injeta auto-login de credenciais salvas se houver
        let accounts = crate::credentials::load_accounts();
        if let Some(acc) = accounts.get(index) {
            let email = acc.email.as_deref().unwrap_or("");
            let pass = acc.senha.as_deref().unwrap_or("");
            if !email.is_empty() && !pass.is_empty() {
                let init_script = generate_autofill_script(index, email, pass);
                builder = builder.initialization_script(&init_script);
            }
        }

        let wv = window
            .add_child(builder, pos, size)
            .map_err(|e| e.to_string())?;

        if let Err(error)=crate::account_proxy::authenticate(&wv,proxy.as_ref()).await{let _=wv.close();return Err(error);}
        if proxy.is_some(){wv.navigate(target_url.parse().map_err(|_|"Destino inválido")?).map_err(|e|e.to_string())?;}
        self.mark_proxy(index);
        let visible = self.is_visible(index).await;
        if visible {
            let _ = wv.show();
            crate::webview_memory::set_background(&wv, false);
        } else {
            let _ = wv.hide();
            crate::webview_memory::set_background(&wv, true);
        }

        self.configure_view(app,index,None,None).await?;
        let mut map = self.labels.write().await;
        map.insert(index, label);
        Ok(())
    }

    pub async fn set_bounds(
        &self,
        app: &AppHandle,
        index: usize,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.set_position(LogicalPosition::new(x, y));
            let _ = wv.set_size(LogicalSize::new(width, height));
        }
        Ok(())
    }

    pub async fn set_visible(
        &self,
        app: &AppHandle,
        index: usize,
        visible: bool,
    ) -> Result<(), String> {
        {
            let mut vis = self.visibility.write().await;
            vis.insert(index, visible);
        }
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            if visible {
                let _ = wv.show();
                crate::webview_memory::set_background(&wv, false);
            } else {
                let _ = wv.hide();
                crate::webview_memory::set_background(&wv, true);
            }
        }
        Ok(())
    }

    pub async fn fill_credentials(
        &self,
        app: &AppHandle,
        index: usize,
        email: &str,
        pass: &str,
    ) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            let script = generate_autofill_script(index, email, pass);
            wv.eval(&script).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn eval(&self, app: &AppHandle, index: usize, script: &str) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            wv.eval(script).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn execute(&self, app: &AppHandle, index: usize, script: &str) -> Result<serde_json::Value, String> {
        let wv = app.get_webview(&format!("game-account-{}", index)).ok_or("WebView indisponível")?;
        let request_id = self.next_request.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert((index, request_id), tx);
        let source = serde_json::to_string(script).map_err(|e| e.to_string())?;
        let code = format!(r#"(() => {{
            let result = undefined, err = null;
            try {{
                result = (0, eval)({source});
            }} catch (e) {{
                err = String(e);
            }}
            const invoke = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
                           (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
            if (typeof invoke === 'function') {{
                if (err) {{
                    invoke('webview_eval_result', {{requestId: {request_id}, value: null, error: err.slice(0, 500)}}).catch(() => {{}});
                }} else {{
                    Promise.resolve(result).then(
                        value => invoke('webview_eval_result', {{requestId: {request_id}, value: value === undefined ? null : value, error: null}}),
                        error => invoke('webview_eval_result', {{requestId: {request_id}, value: null, error: String(error).slice(0, 500)}})
                    ).catch(() => {{}});
                }}
            }}
        }})()"#);
        if let Err(e) = wv.eval(code) {
            self.pending.lock().unwrap().remove(&(index, request_id));
            return Err(e.to_string());
        }
        let result = tokio::time::timeout(std::time::Duration::from_secs(5), rx).await;
        self.pending.lock().unwrap().remove(&(index, request_id));
        result.map_err(|_| "Consulta ao jogo excedeu o tempo limite".to_string())?
            .map_err(|_| "Consulta cancelada".to_string())?
    }

    pub fn resolve(&self, index: usize, request_id: u64, value: serde_json::Value, error: Option<String>) {
        if let Some(tx) = self.pending.lock().unwrap().remove(&(index, request_id)) {
            let _ = tx.send(match error { Some(e) => Err(e), None => Ok(value) });
        }
    }

    pub async fn destroy(&self, app: &AppHandle, index: usize) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.close();
        }
        let mut map = self.labels.write().await;
        map.remove(&index);
        Ok(())
    }
}
