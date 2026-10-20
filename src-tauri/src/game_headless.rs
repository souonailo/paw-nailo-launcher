use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};

use tokio_tungstenite::tungstenite::protocol::Message;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PokemonTeamMember {
    pub id: Option<serde_json::Value>,
    pub sid: Option<u32>,
    pub name: Option<String>,
    pub level: Option<u32>,
    pub shiny: Option<bool>,
    pub ld: Option<bool>,
    pub hp: Option<f64>,
    #[serde(default)]
    pub slot: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HeadlessMetrics {
    pub seconds: u64,
    #[serde(rename = "xpg", alias = "xp")]
    pub xp: u64,
    pub xph: u64,
    pub gph: i64,
    pub kph: u64,
    #[serde(default, rename = "shinyCap", alias = "shiny_cap")]
    pub shiny_cap: u32,
    #[serde(default, rename = "shinyFound", alias = "shiny_found")]
    pub shiny_found: u32,
    pub kills: u32,
    #[serde(rename = "ballsUsed", alias = "balls")]
    pub balls: u32,
    #[serde(default, rename = "potsUsed", alias = "pots")]
    pub pots_used: u32,
    pub captures: u32,
    #[serde(default)]
    pub balance: i64,
    #[serde(default, rename = "lootGold", alias = "coins")]
    pub loot_gold: i64,
    #[serde(default, rename = "supplyCost", alias = "supplyGold")]
    pub supply_cost: u64,
    #[serde(default, rename = "captureValue", alias = "capturesGold")]
    pub capture_value: u64,
    #[serde(default, rename = "autoSaleCoins")]
    pub auto_sale_coins: u64,
    #[serde(default)]
    pub drops: serde_json::Value,
    #[serde(default)]
    pub supplies: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadlessState {
    pub ok: bool,
    pub live: bool,
    pub i: usize,
    pub name: String,
    pub cid: String,
    pub hunt: String,
    pub in_center: Option<bool>,
    #[serde(skip)]
    pub last_hunt_slug: String,
    pub balls_known: bool,
    pub inventory_known: bool,
    pub ball_catalog: Vec<serde_json::Value>,
    pub automation: serde_json::Value,
    pub last_ball_id: Option<serde_json::Value>,
    pub ball_map: serde_json::Map<String, serde_json::Value>,
    pub inv_map: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub raw_drops: serde_json::Map<String, serde_json::Value>,
    #[serde(default, rename = "huntAnalyzer")]
    pub hunt_analyzer: Option<serde_json::Value>,
    pub gold: i64,
    pub diamonds: i64,
    pub level: u32,
    pub active_id: Option<serde_json::Value>,
    pub team: Vec<PokemonTeamMember>,
    #[serde(default, rename = "captureHistory")]
    pub capture_history: Vec<serde_json::Value>,
    pub a: HeadlessMetrics,
    pub sess_start: u64,
    #[serde(skip)]
    pub initial_gold: Option<i64>,
    #[serde(skip)]
    pub session_gold: i64,
    #[serde(skip)]
    pub start_time: Option<std::time::Instant>,
    #[serde(skip)]
    pub seen_events: std::collections::VecDeque<String>,
}

impl HeadlessState {
    pub fn new(index: usize, nick: String) -> Self {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let cid = String::new();
        Self {
            ok: true,
            live: false,
            i: index,
            name: nick,
            cid,
            hunt: String::new(),
            in_center: None,
            last_hunt_slug: String::new(),
            balls_known: false,
            inventory_known: false,
            ball_catalog: Vec::new(),
            automation: json!({}),
            last_ball_id: None,
            ball_map: Default::default(),
            inv_map: Default::default(),
            raw_drops: Default::default(),
            hunt_analyzer: None,
            gold: 0,
            diamonds: 0,
            level: 0,
            active_id: None,
            team: Vec::new(),
            capture_history: Vec::new(),
            a: HeadlessMetrics::default(),
            sess_start: now_ms,
            initial_gold: None,
            session_gold: 0,
            start_time: Some(std::time::Instant::now()),
            seen_events: Default::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct BlasterConfig {
    pub token: Option<String>,
    pub nick: Option<String>,
    #[serde(alias = "wsUrl")]
    pub ws_url: Option<String>,
    pub hunt: Option<String>,
}

pub struct BlasterHandle {
    stop_tx: mpsc::Sender<()>,
    out_tx: mpsc::Sender<Message>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub struct GameHeadlessManager {
    pub auth_locks: [tokio::sync::Mutex<()>; 4],
    clients: RwLock<HashMap<usize, BlasterHandle>>,
    tokens: RwLock<HashMap<usize, String>>,
    nicks: RwLock<HashMap<usize, String>>,
    states: RwLock<HashMap<usize, HeadlessState>>,
    ws_urls: RwLock<HashMap<usize,String>>,
}

impl GameHeadlessManager {
    pub fn new() -> Self {
        let sessions = crate::credentials::load_sessions();
        Self {
            auth_locks: std::array::from_fn(|_| tokio::sync::Mutex::new(())),
            clients: RwLock::new(HashMap::new()),
            tokens: RwLock::new(sessions.iter().map(|(i,s)| (*i, s.token.clone())).collect()),
            nicks: RwLock::new(sessions.iter().filter_map(|(i,s)| s.nick.clone().map(|n| (*i,n))).collect()),
            states: RwLock::new(HashMap::new()),
            ws_urls: RwLock::new(HashMap::new()),
        }
    }

    pub async fn set_token(&self, index: usize, token: String, nick: Option<String>) {
        let (token, nick) = normalize_session_token(token, nick);
        if !token.is_empty() {
            let mut tokens = self.tokens.write().await;
            tokens.insert(index, token.clone());
        }
        if let Some(n) = nick {
            if !n.is_empty() {
                let mut nicks = self.nicks.write().await;
                nicks.insert(index, n);
            }
        }
        if !token.is_empty() {
            let nick = self.get_nick(index).await;
            let _ = crate::credentials::save_session(index, token, nick);
        }
    }

    pub async fn get_token(&self, index: usize) -> Option<String> {
        let tokens = self.tokens.read().await;
        tokens.get(&index).cloned()
    }

    pub async fn get_ws_url(&self,index:usize)->Option<String>{self.ws_urls.read().await.get(&index).cloned()}

    pub async fn get_nick(&self, index: usize) -> Option<String> {
        let nicks = self.nicks.read().await;
        nicks.get(&index).cloned()
    }

    pub async fn update_telemetry_event(
        &self,
        app: &AppHandle,
        index: usize,
        event: &serde_json::Value,
    ) {
        let t = event.get("t").and_then(|v| v.as_str()).unwrap_or("");
        let data = event.get("data").unwrap_or(event);

        if t == "session_token" {
            if let Some(token) = data.get("token").and_then(|v| v.as_str()) {
                let nick = data.get("nick").and_then(|v| v.as_str()).map(|s| s.to_string());
                self.set_token(index, token.to_string(), nick.clone()).await;
                let _ = app.emit(
                    "session:token",
                    serde_json::json!({
                        "index": index,
                        "token": token,
                        "nick": nick
                    }),
                );
            }
            return;
        }

        if t == "character_selected" {
            if let Some(nick) = data.get("nick").and_then(|v| v.as_str()) {
                let trimmed = nick.trim();
                if !is_placeholder_character_name(trimmed) {
                    let mut nicks = self.nicks.write().await;
                    nicks.insert(index, trimmed.to_string());
                    drop(nicks);
                    let mut states = self.states.write().await;
                    if let Some(state) = states.get_mut(&index) {
                        state.name = trimmed.to_string();
                        let _ = app.emit("st:push", serde_json::json!({
                            "index": index,
                            "state": state
                        }));
                    }
                }
            }
            return;
        }

        let mut states = self.states.write().await;
        let nick = self
            .get_nick(index)
            .await
            .unwrap_or_else(|| format!("Personagem {}", index + 1));
        let state = states
            .entry(index)
            .or_insert_with(|| HeadlessState::new(index, nick));

        if parse_game_message(event, state) {
            // Only apply legacy rate/balance fallbacks if authoritative hunt_analyzer is NOT present.
            // When hunt_analyzer is present, all metrics (including 0, signed/negative values) are authoritative.
            if state.hunt_analyzer.is_none() {
                if state.start_time.is_none() {
                    state.start_time = Some(std::time::Instant::now());
                }
                if let Some(st) = state.start_time {
                    if state.a.seconds == 0 && (state.a.kills > 0 || state.a.xp > 0 || state.a.captures > 0) {
                        state.a.seconds = st.elapsed().as_secs();
                    }
                    if state.a.seconds > 0 {
                        if state.a.xph == 0 && state.a.xp > 0 {
                            state.a.xph = (state.a.xp * 3600) / state.a.seconds;
                        }
                        if state.a.kph == 0 && state.a.kills > 0 {
                            state.a.kph = (state.a.kills as u64 * 3600) / state.a.seconds;
                        }
                        let total_coins = if state.a.loot_gold != 0 {
                            state.a.loot_gold
                        } else {
                            state.session_gold
                        };
                        if state.a.gph == 0 && total_coins != 0 {
                            state.a.gph = (total_coins * 3600) / state.a.seconds as i64;
                        }
                    }
                }
                if state.a.balance == 0 {
                    if state.a.loot_gold != 0 || state.a.supply_cost != 0 || state.a.capture_value != 0 {
                        state.a.balance = state.a.loot_gold + state.a.capture_value as i64 - state.a.supply_cost as i64;
                    } else if state.session_gold != 0 {
                        state.a.balance = state.session_gold;
                    }
                }
            }

            let state_val = serde_json::to_value(&*state).unwrap_or_default();
            let _ = app.emit(
                "st:push",
                json!({
                    "index": index,
                    "state": state_val
                }),
            );

        }
    }

    pub async fn stop(&self, index: usize) -> bool {
        let mut map = self.clients.write().await;
        if let Some(handle) = map.remove(&index) {
            let _ = handle.stop_tx.send(()).await;
            let _ = handle.task.await;
            true
        } else {
            false
        }
    }

    pub async fn is_running(&self, index: usize) -> bool {
        let map = self.clients.read().await;
        map.get(&index).map(|h| !h.task.is_finished()).unwrap_or(false)
    }

    pub async fn send_message(&self, index: usize, val: serde_json::Value) -> Result<bool, String> {
        let map = self.clients.read().await;
        if let Some(handle) = map.get(&index) {
            let msg = Message::Text(val.to_string().into());
            handle.out_tx.send(msg).await.map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn start(
        &self,
        app: AppHandle,
        index: usize,
        config: BlasterConfig,
    ) -> Result<(), String> {
        self.stop(index).await;

        let (stop_tx, mut stop_rx) = mpsc::channel(1);
        let (out_tx, mut out_rx) = mpsc::channel::<Message>(32);
        let ws_url = config
            .ws_url
            .unwrap_or_else(|| "wss://pokeascendedworld.com/ws".to_string());

        self.ws_urls.write().await.insert(index, ws_url.clone());
        let mut token = config.token.filter(|t| !t.is_empty()).or_else(|| None);

        if token.is_none() {
            token = self.get_token(index).await;
        }

        let token = token.ok_or_else(|| "token_required".to_string())?;

        let nick = self
            .get_nick(index)
            .await
            .or(config.nick.filter(|n| !n.is_empty()))
            .ok_or("Nick autenticado indisponivel")?;

        let mut state = self
            .states
            .read()
            .await
            .get(&index)
            .cloned()
            .unwrap_or_else(|| HeadlessState::new(index, nick.clone()));

        let target_hunt = config
            .hunt
            .clone()
            .filter(|s| !s.is_empty())
            .or_else(|| {
                if !state.hunt.is_empty() && state.hunt != "centro" {
                    Some(state.hunt.clone())
                } else if !state.last_hunt_slug.is_empty() && state.last_hunt_slug != "centro" {
                    Some(state.last_hunt_slug.clone())
                } else {
                    None
                }
            });

        let _ = app.emit("blaster:status", json!({"index":index,"status":"connecting"}));
        let socket = connect_and_handshake(
            index,
            &ws_url,
            &nick,
            &token,
            &mut state,
            target_hunt.as_deref(),
        )
        .await?;
        let _ = app.emit("blaster:status", json!({"index":index,"status":"connected"}));

        let app_handle = app.clone();
        let ws_url_clone = ws_url.clone();
        let nick_clone = nick.clone();
        let initial_hunt = target_hunt.clone();

        let task = tokio::spawn(async move {
            let mut current_socket = Some(socket);
            let start_time = state.start_time.unwrap_or_else(Instant::now);
            let mut backoff_secs = 2u64;

            'reconnect_loop: loop {
                let socket = match current_socket.take() {
                    Some(s) => s,
                    None => {
                        let _ = app_handle.emit(
                            "blaster:status",
                            json!({ "index": index, "status": "connecting" }),
                        );

                        tokio::select! {
                            _ = stop_rx.recv() => {
                                break 'reconnect_loop;
                            }
                            _ = tokio::time::sleep(Duration::from_secs(backoff_secs)) => {}
                        }

                        let manager_opt = app_handle.try_state::<std::sync::Arc<GameHeadlessManager>>();
                        let token_to_use = if let Some(ref m) = manager_opt {
                            m.get_token(index).await
                        } else {
                            None
                        };
                        let token_to_use = match token_to_use {
                            Some(t) if !t.is_empty() => t,
                            _ => {
                                backoff_secs = (backoff_secs * 2).min(30);
                                continue 'reconnect_loop;
                            }
                        };

                        let nick_to_use = if let Some(ref m) = manager_opt {
                            m.get_nick(index).await.unwrap_or_else(|| nick_clone.clone())
                        } else {
                            nick_clone.clone()
                        };

                        let hunt_to_resume = if !state.hunt.is_empty() && state.hunt != "centro" {
                            Some(state.hunt.clone())
                        } else if !state.last_hunt_slug.is_empty() && state.last_hunt_slug != "centro" {
                            Some(state.last_hunt_slug.clone())
                        } else {
                            initial_hunt.clone()
                        };

                        match connect_and_handshake(
                            index,
                            &ws_url_clone,
                            &nick_to_use,
                            &token_to_use,
                            &mut state,
                            hunt_to_resume.as_deref(),
                        )
                        .await
                        {
                            Ok(new_socket) => {
                                backoff_secs = 2;
                                state.live = true;
                                if let Some(ref m) = manager_opt {
                                    m.states.write().await.insert(index, state.clone());
                                }
                                let _ = app_handle.emit(
                                    "blaster:status",
                                    json!({ "index": index, "status": "connected" }),
                                );
                                let _ = app_handle.emit(
                                    "blaster:update",
                                    json!({ "index": index, "state": &state }),
                                );
                                new_socket
                            }
                            Err(_) => {
                                backoff_secs = (backoff_secs * 2).min(30);
                                continue 'reconnect_loop;
                            }
                        }
                    }
                };

                let (mut write, mut read) = socket.split();
                let mut ping_interval = tokio::time::interval(Duration::from_secs(25));
                let mut sec_interval = tokio::time::interval(Duration::from_secs(1));
                let mut last_activity = Instant::now();
                let mut user_stopped = false;

                loop {
                    tokio::select! {
                        _ = stop_rx.recv() => {
                            let _ = write.send(Message::Close(None)).await;
                            user_stopped = true;
                            break;
                        }
                        Some(outgoing) = out_rx.recv() => {
                            if write.send(outgoing).await.is_err() {
                                break;
                            }
                        }
                        _ = ping_interval.tick() => {
                            let ping = json!({ "t": "ping" });
                            if write.send(Message::Text(ping.to_string().into())).await.is_err() {
                                break;
                            }
                            if last_activity.elapsed() > Duration::from_secs(60) {
                                break;
                            }
                        }
                        _ = sec_interval.tick() => {
                            if state.hunt_analyzer.is_none() {
                                state.a.seconds = start_time.elapsed().as_secs();
                                if state.a.seconds > 0 {
                                    state.a.xph = (state.a.xp * 3600) / state.a.seconds;
                                    state.a.kph = (state.a.kills as u64 * 3600) / state.a.seconds;
                                    state.a.gph = (state.session_gold * 3600) / state.a.seconds as i64;
                                }
                                state.a.balance = state.session_gold;
                            }
                            let _ = app_handle.emit("blaster:update", json!({
                                "index": index,
                                "state": &state
                            }));
                        }
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(txt))) => {
                                    last_activity = Instant::now();
                                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt) {
                                        if parse_game_message(&val, &mut state) {
                                            let _ = app_handle.emit("blaster:update", json!({
                                                "index": index,
                                                "state": &state
                                            }));
                                        }
                                    }
                                }
                                Some(Ok(Message::Ping(data))) => {
                                    last_activity = Instant::now();
                                    let _ = write.send(Message::Pong(data)).await;
                                }
                                Some(Ok(Message::Pong(_))) => {
                                    last_activity = Instant::now();
                                }
                                Some(Ok(Message::Close(_))) | None => {
                                    break;
                                }
                                Some(Err(_)) => {
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }

                if user_stopped {
                    break 'reconnect_loop;
                }

                state.live = false;
                if let Some(m) = app_handle.try_state::<std::sync::Arc<GameHeadlessManager>>() {
                    m.states.write().await.insert(index, state.clone());
                }
                let _ = app_handle.emit("blaster:update", json!({ "index": index, "state": &state }));
                let _ = app_handle.emit(
                    "blaster:status",
                    json!({
                        "index": index,
                        "status": "connecting"
                    }),
                );
            }

            parse_game_message(&json!({"t":"disconnected"}), &mut state);
            if let Some(m) = app_handle.try_state::<std::sync::Arc<GameHeadlessManager>>() {
                m.states.write().await.insert(index, state.clone());
            }
            let _ = app_handle.emit("blaster:update", json!({ "index": index, "state": state }));
            let _ = app_handle.emit(
                "blaster:status",
                json!({
                    "index": index,
                    "status": "disconnected"
                }),
            );
        });

        let mut map = self.clients.write().await;
        map.insert(index, BlasterHandle { stop_tx, out_tx, task });
        Ok(())
    }
}

async fn connect_and_handshake(
    index: usize,
    ws_url: &str,
    nick: &str,
    token: &str,
    state: &mut HeadlessState,
    hunt_slug: Option<&str>,
) -> Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>, String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let mut request = ws_url.into_client_request().map_err(|e| e.to_string())?;
    let origin = if ws_url.contains("pokeascendedworld.com") {
        "https://pokeascendedworld.com"
    } else {
        "https://pokeidle.io"
    };
    request.headers_mut().insert("Origin", origin.parse().unwrap());
    request.headers_mut().insert("User-Agent", crate::webview_manager::CHROME_USER_AGENT.parse().unwrap());

    let (mut socket, _) = tokio::time::timeout(
        Duration::from_secs(20),
        crate::account_proxy::websocket_request(index, request),
    )
    .await
    .map_err(|_| "Tempo limite de conexao ao servidor".to_string())?
    .map_err(|e| e.to_string())?;

    socket
        .send(Message::Text(
            json!({"t":"hello","nick":nick,"token":token,"delta":1})
                .to_string()
                .into(),
        ))
        .await
        .map_err(|e| e.to_string())?;

    tokio::time::timeout(Duration::from_secs(20), async {
        while let Some(message) = socket.next().await {
            match message.map_err(|e| e.to_string())? {
                Message::Text(text) => {
                    let value: serde_json::Value =
                        serde_json::from_str(&text).map_err(|e| e.to_string())?;
                    if value["t"] == "erro" {
                        return Err(format!(
                            "Sessao headless recusada: {}",
                            value["msg"]
                                .as_str()
                                .or(value["chave"].as_str())
                                .unwrap_or("erro de autenticacao")
                        ));
                    }
                    if value["t"] == "welcome" {
                        parse_game_message(&value, state);
                        return Ok(());
                    }
                }
                Message::Close(_) => return Err("Servidor encerrou a conexao".into()),
                _ => {}
            }
        }
        Err("Conexao encerrada antes de autenticar".into())
    })
    .await
    .map_err(|_| "Servidor nao confirmou a sessao headless".to_string())??;

    let _ = socket
        .send(Message::Text(
            json!({"t":"client.visibility","foreground":true})
                .to_string()
                .into(),
        ))
        .await;

    if let Some(hunt) = hunt_slug.filter(|s| !s.is_empty()) {
        let _ = socket
            .send(Message::Text(
                json!({"t":"hunt.select","slug":hunt})
                    .to_string()
                    .into(),
            ))
            .await;
    }

    Ok(socket)
}

fn normalize_session_token(token: String, nick: Option<String>) -> (String, Option<String>) {
        // The game stores sessao as {nick, token, ...}, not as the token itself.
    match serde_json::from_str::<serde_json::Value>(&token) {
            Ok(value) if value.is_object() => (
                value.get("token").and_then(|v| v.as_str()).unwrap_or("").to_owned(),
                value.get("nick").and_then(|v| v.as_str()).map(str::to_owned).or(nick)
            ),
            _ => (token, nick),
    }
}

fn update_player_location(player: &serde_json::Value, state: &mut HeadlessState) -> bool {
    let slug = player
        .get("huntSlug")
        .or_else(|| player.get("hunt"))
        .or_else(|| player.get("slug"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let center = player.get("noCentro").and_then(|v| v.as_bool());
    if slug.is_none() && center.is_none() { return false; }
    if let Some(slug) = slug {
        if slug != "centro" { state.last_hunt_slug = slug.into(); }
    }
    if let Some(center) = center { state.in_center = Some(center); }
    if state.in_center == Some(true) { state.hunt = "centro".into(); }
    else if !state.last_hunt_slug.is_empty() { state.hunt = state.last_hunt_slug.clone(); }
    else if let Some(slug) = slug { state.hunt = slug.into(); }
    true
}

pub(crate) fn is_placeholder_character_name(name: &str) -> bool {
    let trimmed = name.trim();
    trimmed.is_empty()
        || trimmed.starts_with("Personagem ")
        || trimmed.starts_with("Conta ")
        || trimmed.eq_ignore_ascii_case("Sem líder")
        || trimmed == "—"
        || trimmed == "-"
}

fn parse_game_message(m: &serde_json::Value, state: &mut HeadlessState) -> bool {
    let t = m.get("t").and_then(|v| v.as_str()).unwrap_or("");
    let msg_type = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let mut changed = false;

    let data = m.get("data").unwrap_or(m);

    if t == "batalha" || t == "activity" || t == "hunt.activity" || msg_type == "activity" || msg_type == "batalha" {
        let event_id = m.get("eventId")
            .or_else(|| data.get("eventId"))
            .and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_u64().map(|n| n.to_string())));
        if let Some(ref eid) = event_id {
            if state.seen_events.contains(eid) {
                return false;
            }
            if state.seen_events.len() >= 512 {
                state.seen_events.pop_front();
            }
            state.seen_events.push_back(eid.clone());
        }
    }

    if t == "reset" || t == "disconnected" || t == "telemetry_gap" {
        state.live = false;
        state.balls_known = false; state.inventory_known = false;
        state.ball_map.clear(); state.inv_map.clear(); state.raw_drops.clear(); state.ball_catalog.clear();
        state.automation = json!({}); state.last_ball_id = None;
        if t == "reset" {
            state.a = HeadlessMetrics::default();
            state.hunt_analyzer = None;
            state.capture_history.clear();
            state.seen_events.clear();
            state.session_gold = 0;
            state.initial_gold = None;
            state.start_time = Some(std::time::Instant::now());
        }
        return true;
    }

    if !t.is_empty() && t != "ping" && t != "pong" {
        state.live = true;
    }

    if t == "welcome" || t == "estado" {
        let player = data.get("estado").unwrap_or(data);
        let full = t == "welcome" || player.get("cheio").and_then(|v| v.as_bool()) == Some(true);
        if full {
            changed = true;
            state.cid.clear();
            state.ball_map.clear(); state.inv_map.clear(); state.raw_drops.clear();
            state.balls_known = false; state.inventory_known = false;
            state.automation = json!({}); state.last_ball_id = None;
            if t == "welcome" { state.ball_catalog.clear(); }
        }
        if let Some(id) = player.get("id") {
            state.cid = id.as_str().map(str::to_owned).or_else(||id.as_u64().map(|n|n.to_string())).unwrap_or_default();
            changed = true;
        }
        let ch_opt = player.get("captureHistory")
            .or_else(|| data.get("captureHistory"))
            .or_else(|| m.get("captureHistory"))
            .and_then(|v| v.as_array());
        if let Some(ch) = ch_opt {
            let start = if ch.len() > 100 { ch.len() - 100 } else { 0 };
            state.capture_history = ch[start..].to_vec();
            changed = true;
        }
        for (keys, target, known) in [
            (["balls", "balls"], &mut state.ball_map, &mut state.balls_known),
            (["items", "inventory"], &mut state.inv_map, &mut state.inventory_known),
        ] {
            if let Some(stock) = keys.iter().find_map(|key| player.get(*key)) {
                // Match idleio-core: a supplied map replaces the complete stock.
                target.clear();
                *known = stock.is_object() || stock.is_null();
                if let Some(map) = stock.as_object() { target.extend(map.clone()); }
                changed = true;
            }
        }
        if let Some(auto) = player.get("automation") {
            if auto.is_null() { state.automation = json!({}); }
            else if let Some(fields) = auto.as_object() {
                for (key, value) in fields { state.automation[key] = value.clone(); }
            }
            changed = true;
        }
        if let Some(catalog) = data.get("catalogoBolas").and_then(|v| v.as_array()) {
            state.ball_catalog = catalog.clone(); changed = true;
        }
        if let Some(ha) = player.get("huntAnalyzer").or_else(|| data.get("huntAnalyzer")).or_else(|| player.get("a")).or_else(|| data.get("a")) {
            state.hunt_analyzer = Some(ha.clone());
            if let Some(kills) = ha.get("kills").and_then(|v| v.as_u64()) {
                state.a.kills = kills as u32;
                changed = true;
            }
            if let Some(xp) = ha.get("xp").or_else(|| ha.get("xpg")).and_then(|v| v.as_u64()) {
                state.a.xp = xp;
                changed = true;
            }
            if let Some(caps) = ha.get("captures").or_else(|| ha.get("caps")).and_then(|v| v.as_u64()) {
                state.a.captures = caps as u32;
                changed = true;
            }
            if let Some(secs) = ha.get("seconds").and_then(|v| v.as_u64()) {
                state.a.seconds = secs;
                changed = true;
            }
            if let Some(kph) = ha.get("kph").and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64))) {
                state.a.kph = kph;
                changed = true;
            }
            if let Some(xph) = ha.get("xph").and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64))) {
                state.a.xph = xph;
                changed = true;
            }
            if let Some(supply_cost) = ha.get("supplyCost").or_else(|| ha.get("supplyGold")).and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64))) {
                state.a.supply_cost = supply_cost;
                changed = true;
            }
            if let Some(capture_val) = ha.get("captureValue").or_else(|| ha.get("capturesGold")).and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64))) {
                state.a.capture_value = capture_val;
                changed = true;
            }
            if let Some(auto_sale) = ha.get("autoSaleCoins").and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64))) {
                state.a.auto_sale_coins = auto_sale;
                changed = true;
            }
            if let Some(coins) = ha.get("lootGold").or_else(|| ha.get("coins")).and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64))) {
                state.a.loot_gold = coins;
                changed = true;
            }
            let has_bal = ha.get("balance").or_else(|| ha.get("net"));
            if let Some(bal) = has_bal.and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64))) {
                state.a.balance = bal;
                changed = true;
            } else if ha.get("coins").is_some() || ha.get("lootGold").is_some() || ha.get("supplyCost").is_some() || ha.get("captureValue").is_some() {
                state.a.balance = state.a.loot_gold + state.a.capture_value as i64 - state.a.supply_cost as i64;
                changed = true;
            }
            let has_gph = ha.get("gph");
            if let Some(gph) = has_gph.and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64))) {
                state.a.gph = gph;
                changed = true;
            } else if state.a.seconds > 0 && (has_bal.is_some() || ha.get("coins").is_some() || ha.get("supplyCost").is_some() || ha.get("captureValue").is_some()) {
                state.a.gph = (state.a.balance * 3600) / state.a.seconds as i64;
                changed = true;
            }
            if let Some(sf) = ha.get("shinyFound").and_then(|v| v.as_u64()) {
                state.a.shiny_found = sf as u32;
                changed = true;
            }
            if let Some(sc) = ha.get("shinyCap").and_then(|v| v.as_u64()) {
                state.a.shiny_cap = sc as u32;
                changed = true;
            }
            if let Some(bu) = ha.get("ballsUsed").or_else(|| ha.get("balls")).and_then(|v| v.as_u64()) {
                state.a.balls = bu as u32;
                changed = true;
            }
            if let Some(pu) = ha.get("potsUsed").or_else(|| ha.get("pots")).and_then(|v| v.as_u64()) {
                state.a.pots_used = pu as u32;
                changed = true;
            }
            if let Some(drops) = ha.get("drops") {
                state.a.drops = drops.clone();
                changed = true;
            }
            if let Some(supplies) = ha.get("supplies") {
                state.a.supplies = supplies.clone();
                changed = true;
            }
        }
    }
    if t == "welcome" {
        state.live = true;
        if let Some(est) = data.get("estado").or_else(|| m.get("estado")) {
            let nick_opt = est.get("trainerName")
                .or_else(|| est.get("characterName"))
                .or_else(|| est.get("charName"))
                .or_else(|| est.get("name"))
                .or_else(|| est.get("nick"))
                .or_else(|| est.get("nome"))
                .or_else(|| est.get("character").and_then(|c| c.get("name")))
                .and_then(|v| v.as_str());
            if let Some(nick) = nick_opt {
                let trimmed = nick.trim();
                if !is_placeholder_character_name(trimmed) || is_placeholder_character_name(&state.name) {
                    state.name = trimmed.to_string();
                }
            }
            if let Some(gold) = est.get("gold").and_then(|v| v.as_i64()) {
                state.gold = gold;
                if state.initial_gold.is_none() {
                    state.initial_gold = Some(gold);
                }
            }
            if let Some(diamonds) = est.get("diamonds").or_else(|| est.get("diamantes")).or_else(|| est.get("gems")).or_else(|| est.get("gemas")).and_then(|v| v.as_i64()) {
                state.diamonds = diamonds;
            }
            if let Some(lvl) = est.get("level").or_else(|| est.get("trainerLevel")).and_then(|v| v.as_u64()) {
                state.level = lvl as u32;
            }
            update_player_location(est, state);
            if let Some(act) = est.get("activeId").or_else(|| est.get("activePokemonId")) {
                state.active_id = Some(act.clone());
            }

            let pokes = est
                .get("pokemons")
                .or_else(|| est.get("pkMud"))
                .or_else(|| est.get("eu").and_then(|eu| eu.get("pokemons")));
            if let Some(pokemons) = pokes.and_then(|v| v.as_array()) {
                state.team = pokemons
                    .iter()
                    .enumerate()
                    .map(|(idx, pk)| {
                        let is_active = state.active_id.as_ref().map(|act| act == pk.get("id").unwrap_or(&serde_json::Value::Null)).unwrap_or(false);
                        let is_ld = if state.active_id.is_some() {
                            is_active
                        } else {
                            pk.get("slot").and_then(|v| v.as_u64()).map(|s| s == 0).unwrap_or(idx == 0)
                        };
                        let s_num = pk.get("slot").and_then(|v| v.as_u64()).map(|v| v as u32).or(Some(idx as u32));
                        PokemonTeamMember {
                            id: pk.get("id").cloned(),
                            sid: pk
                                .get("speciesId")
                                .or_else(|| pk.get("pokeId"))
                                .or_else(|| pk.get("sid"))
                                .and_then(|v| v.as_u64())
                                .map(|v| v as u32),
                            name: pk
                                .get("nome")
                                .or_else(|| pk.get("name"))
                                .and_then(|v| v.as_str())
                                .map(|v| v.to_string()),
                            level: pk.get("level").or_else(|| pk.get("nv")).and_then(|v| v.as_u64()).map(|v| v as u32),
                            shiny: pk.get("shiny").and_then(|v| v.as_bool()),
                            ld: Some(is_ld),
                            hp: None,
                            slot: s_num,
                        }
                    })
                    .collect();
            }
            changed = true;
        }
    } else if t == "campo" || t == "campo.init" || msg_type == "field-init" {
        state.live = true;
        let slug_val = data
            .get("slug")
            .or_else(|| data.get("hunt"))
            .or_else(|| data.get("huntSlug"))
            .or_else(|| m.get("slug"))
            .or_else(|| m.get("hunt"))
            .or_else(|| m.get("huntSlug"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let Some(slug) = slug_val {
            state.in_center = Some(data.get("centro").and_then(|v| v.as_bool()).unwrap_or(slug == "centro"));
            if state.in_center == Some(true) { state.hunt = "centro".into(); }
            else { state.hunt = slug.into(); state.last_hunt_slug = slug.into(); }
            changed = true;
        }
    } else if t == "batalha" {
        if let Some(evs) = data.get("ev").or_else(|| m.get("ev")).and_then(|v| v.as_array()) {
            for ev in evs {
                let ev_id = ev.get("eventId")
                    .and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_u64().map(|n| n.to_string())));
                if let Some(ref eid) = ev_id {
                    if state.seen_events.contains(eid) {
                        continue;
                    }
                    if state.seen_events.len() >= 512 {
                        state.seen_events.pop_front();
                    }
                    state.seen_events.push_back(eid.clone());
                }

                let k = ev.get("k").or_else(|| ev.get("t")).and_then(|v| v.as_str()).unwrap_or("");
                if k == "spawn" && ev.get("shiny").and_then(|v| v.as_bool()).unwrap_or(false) {
                    state.a.shiny_found += 1;
                    changed = true;
                } else if k == "morte"
                    && ev.get("quem").and_then(|v| v.as_str()).unwrap_or("") == "selvagem"
                {
                    state.a.kills += 1;
                    let xp = ev
                        .get("xp")
                        .or_else(|| ev.get("xpTreinador"))
                        .or_else(|| ev.get("xpg"))
                        .or_else(|| ev.get("exp"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    state.a.xp += xp;
                    if let Some(ouro) = ev.get("ouro").or_else(|| ev.get("gold")).and_then(|v| v.as_i64()) {
                        state.session_gold += ouro;
                        state.a.loot_gold += ouro;
                    }
                    if let Some(drops) = ev.get("drops").or_else(|| ev.get("loot")).and_then(|v| v.as_array()) {
                        for drop_item in drops {
                            let item_id = drop_item
                                .get("itemId")
                                .or_else(|| drop_item.get("id"))
                                .and_then(|v| v.as_u64())
                                .map(|n| n.to_string());
                            let qty = drop_item
                                .get("qtd")
                                .or_else(|| drop_item.get("qty"))
                                .and_then(|v| v.as_u64())
                                .unwrap_or(1);
                            let name = drop_item
                                .get("nome")
                                .or_else(|| drop_item.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let drop_key = item_id.clone().unwrap_or_else(|| name.to_string());
                            if !drop_key.is_empty() {
                                let current_drop = state
                                    .raw_drops
                                    .get(&drop_key)
                                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                                    .unwrap_or(0);
                                state.raw_drops.insert(
                                    drop_key,
                                    json!({
                                        "id": item_id.as_deref().unwrap_or(""),
                                        "name": name,
                                        "qty": current_drop + qty
                                    }),
                                );
                            }
                            if let Some(id_str) = item_id {
                                let current_inv = state
                                    .inv_map
                                    .get(&id_str)
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0);
                                state
                                    .inv_map
                                    .insert(id_str, serde_json::Value::from(current_inv + qty));
                            }
                        }
                    }
                    changed = true;
                } else if k == "bossMorto" {
                    let xp = ev
                        .get("xp")
                        .or_else(|| ev.get("xpTreinador"))
                        .or_else(|| ev.get("xpg"))
                        .or_else(|| ev.get("exp"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    state.a.xp += xp;
                    if let Some(ouro) = ev.get("ouro").or_else(|| ev.get("gold")).and_then(|v| v.as_i64()) {
                        state.session_gold += ouro;
                        state.a.loot_gold += ouro;
                    }
                    if let Some(drops) = ev.get("drops").or_else(|| ev.get("loot")).and_then(|v| v.as_array()) {
                        for drop_item in drops {
                            let item_id = drop_item
                                .get("itemId")
                                .or_else(|| drop_item.get("id"))
                                .and_then(|v| v.as_u64())
                                .map(|n| n.to_string());
                            let qty = drop_item
                                .get("qtd")
                                .or_else(|| drop_item.get("qty"))
                                .and_then(|v| v.as_u64())
                                .unwrap_or(1);
                            let name = drop_item
                                .get("nome")
                                .or_else(|| drop_item.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let drop_key = item_id.clone().unwrap_or_else(|| name.to_string());
                            if !drop_key.is_empty() {
                                let current_drop = state
                                    .raw_drops
                                    .get(&drop_key)
                                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                                    .unwrap_or(0);
                                state.raw_drops.insert(
                                    drop_key,
                                    json!({
                                        "id": item_id.as_deref().unwrap_or(""),
                                        "name": name,
                                        "qty": current_drop + qty
                                    }),
                                );
                            }
                            if let Some(id_str) = item_id {
                                let current_inv = state
                                    .inv_map
                                    .get(&id_str)
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0);
                                state
                                    .inv_map
                                    .insert(id_str, serde_json::Value::from(current_inv + qty));
                            }
                        }
                    }
                    changed = true;
                } else if k == "bola" {
                    state.a.balls += 1;
                    if let Some(id) = ev.get("ballId") {
                        state.last_ball_id = Some(id.clone());
                    }
                    changed = true;
                } else if k == "cura" || k == "potion" || k == "pocao" {
                    state.a.pots_used += 1;
                    changed = true;
                } else if k == "capturado" {
                    state.a.captures += 1;
                    if ev
                        .get("pokemon")
                        .and_then(|p| p.get("shiny"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        state.a.shiny_cap += 1;
                    }
                    if let Some(p) = ev.get("pokemon").or_else(|| ev.get("poke")) {
                        if state.capture_history.len() >= 100 {
                            state.capture_history.remove(0);
                        }
                        state.capture_history.push(p.clone());
                    }
                    changed = true;
                }
            }
        }
    } else if t == "estado" {
        let est = data.get("estado").unwrap_or(data);
        if let Some(active) = est.get("activeId").or_else(|| est.get("activePokemonId")) {
            state.active_id = Some(active.clone());
            for member in &mut state.team { member.ld = Some(member.id.as_ref() == Some(active)); }
            changed = true;
        }
        let nick_opt = est.get("trainerName")
            .or_else(|| est.get("characterName"))
            .or_else(|| est.get("charName"))
            .or_else(|| est.get("name"))
            .or_else(|| est.get("nick"))
            .or_else(|| est.get("nome"))
            .or_else(|| est.get("character").and_then(|c| c.get("name")))
            .and_then(|v| v.as_str());
        if let Some(nick) = nick_opt {
            let trimmed = nick.trim();
            if !is_placeholder_character_name(trimmed) || is_placeholder_character_name(&state.name) {
                state.name = trimmed.to_string();
                changed = true;
            }
        }
        if let Some(gold) = est.get("gold").and_then(|v| v.as_i64()) {
            state.gold = gold;
            if let Some(init) = state.initial_gold {
                let diff = gold - init;
                if diff > state.session_gold {
                    state.session_gold = diff;
                }
            } else {
                state.initial_gold = Some(gold);
            }
            changed = true;
        }
        if let Some(diamonds) = est.get("diamonds").or_else(|| est.get("diamantes")).or_else(|| est.get("gems")).or_else(|| est.get("gemas")).and_then(|v| v.as_i64()) {
            state.diamonds = diamonds;
            changed = true;
        }
        if let Some(lvl) = est.get("level").or_else(|| est.get("trainerLevel")).and_then(|v| v.as_u64()) {
            state.level = lvl as u32;
            changed = true;
        }
        changed |= update_player_location(est, state);

        if let Some(pokemons) = est.get("pokemons").and_then(|v| v.as_array()) {
            if !pokemons.is_empty() || state.team.is_empty() {
                state.team = pokemons
                    .iter()
                    .enumerate()
                    .map(|(idx, pk)| {
                    let is_active = state.active_id.as_ref().map(|act| act == pk.get("id").unwrap_or(&serde_json::Value::Null)).unwrap_or(false);
                    let is_ld = if state.active_id.is_some() {
                        is_active
                    } else {
                        pk.get("slot").and_then(|v| v.as_u64()).map(|s| s == 0).unwrap_or(idx == 0)
                    };
                    PokemonTeamMember {
                        id: pk.get("id").cloned(),
                        sid: pk
                            .get("speciesId")
                            .or_else(|| pk.get("pokeId"))
                            .or_else(|| pk.get("sid"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u32),
                        name: pk
                            .get("nome")
                            .or_else(|| pk.get("name"))
                            .and_then(|v| v.as_str())
                            .map(|v| v.to_string()),
                        level: pk.get("level").or_else(|| pk.get("nv")).and_then(|v| v.as_u64()).map(|v| v as u32),
                        shiny: pk.get("shiny").and_then(|v| v.as_bool()),
                        ld: Some(is_ld),
                        hp: None,
                        slot: pk.get("slot").and_then(|v| v.as_u64()).map(|v| v as u32).or(Some(idx as u32)),
                    }
                })
                .collect();
                changed = true;
            }
        }
        if let Some(pk_mud) = est.get("pkMud").and_then(|v| v.as_array()) {
            for pk in pk_mud {
                if let Some(pk_obj) = pk.as_object() {
                    let id = pk_obj.get("id");
                    if let Some(member) = state.team.iter_mut().find(|m| m.id.as_ref() == id) {
                        if let Some(lvl) = pk_obj.get("level").or_else(|| pk_obj.get("nv")).and_then(|v| v.as_u64()) {
                            member.level = Some(lvl as u32);
                        }
                        if let Some(sid) = pk_obj.get("speciesId").or_else(|| pk_obj.get("pokeId")).and_then(|v| v.as_u64()) {
                            member.sid = Some(sid as u32);
                        }
                        if let Some(name) = pk_obj.get("nome").or_else(|| pk_obj.get("name")).and_then(|v| v.as_str()) {
                            member.name = Some(name.to_string());
                        }
                        if let Some(shiny) = pk_obj.get("shiny").and_then(|v| v.as_bool()) {
                            member.shiny = Some(shiny);
                        }
                        if let Some(slot) = pk_obj.get("slot").and_then(|v| v.as_u64()) {
                            member.slot = Some(slot as u32);
                            if state.active_id.is_some() {
                                member.ld = Some(state.active_id.as_ref() == member.id.as_ref());
                            } else {
                                member.ld = Some(slot == 0);
                            }
                        }
                        changed = true;
                    } else if pk_obj.get("slot").is_some() || state.team.len() < 6 {
                        let is_active = state.active_id.as_ref().map(|act| act == id.unwrap_or(&serde_json::Value::Null)).unwrap_or(false);
                        let is_ld = if state.active_id.is_some() {
                            is_active
                        } else {
                            pk_obj.get("slot").and_then(|v| v.as_u64()).map(|s| s == 0).unwrap_or(state.team.is_empty())
                        };
                        let s_num = pk_obj.get("slot").and_then(|v| v.as_u64()).map(|v| v as u32).or(Some(state.team.len() as u32));
                        state.team.push(PokemonTeamMember {
                            id: id.cloned(),
                            sid: pk_obj.get("speciesId").or_else(|| pk_obj.get("pokeId")).and_then(|v| v.as_u64()).map(|v| v as u32),
                            name: pk_obj.get("nome").or_else(|| pk_obj.get("name")).and_then(|v| v.as_str()).map(|v| v.to_string()),
                            level: pk_obj.get("level").or_else(|| pk_obj.get("nv")).and_then(|v| v.as_u64()).map(|v| v as u32),
                            shiny: pk_obj.get("shiny").and_then(|v| v.as_bool()),
                            ld: Some(is_ld),
                            hp: None,
                            slot: s_num,
                        });
                        changed = true;
                    }
                }
            }
        }
    } else if t == "activity" {
        let kind = data.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        if kind == "capture" {
            state.a.captures += 1;
            if data.get("shiny").and_then(|v| v.as_bool()).unwrap_or(false) {
                state.a.shiny_cap += 1;
            }
            if let Some(entry) = data.get("entry").or_else(|| data.get("pokemon")).or(Some(data)) {
                if entry.get("name").is_some() || entry.get("nome").is_some() || entry.get("speciesId").is_some() || entry.get("id").is_some() {
                    if state.capture_history.len() >= 100 {
                        state.capture_history.remove(0);
                    }
                    state.capture_history.push(entry.clone());
                }
            }
            changed = true;
        } else if kind == "battle" {
            state.a.kills += 1;
            if let Some(xp) = data.get("xp").and_then(|v| v.as_u64()) {
                state.a.xp += xp;
            }
            if let Some(gold) = data.get("gold").and_then(|v| v.as_i64()) {
                state.session_gold += gold;
                state.a.loot_gold += gold;
            }
            changed = true;
        } else if kind == "drop" {
            let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let qty = data.get("qty").and_then(|v| v.as_u64()).unwrap_or(1);
            if !name.is_empty() {
                let current = state.raw_drops.get(name)
                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                    .unwrap_or(0);
                state.raw_drops.insert(
                    name.to_string(),
                    json!({ "id": "", "name": name, "qty": current + qty })
                );
                changed = true;
            }
        }
    }

    changed
}

#[cfg(test)]
mod tests {
    use super::*;



    #[test]
    fn bridged_and_raw_welcome_have_the_same_hud_state() {
        let player = json!({"nick":"Fixture", "gold":4321, "level":27, "huntSlug":"vulpix",
            "activeId":22, "pokemons":[{"id":11,"speciesId":1,"nome":"Bulbasaur","level":5},
            {"id":22,"speciesId":7,"nome":"Squirtle","level":18}]});
        let mut raw = HeadlessState::new(0, "Fixture".into());
        let mut bridged = raw.clone();
        assert!(parse_game_message(&json!({"t":"welcome","estado":player}), &mut raw));
        assert!(parse_game_message(&json!({"t":"welcome","data":{"estado":player}}), &mut bridged));
        assert_eq!(serde_json::to_value(&raw).unwrap(), serde_json::to_value(&bridged).unwrap());
        assert_eq!(raw.gold, 4321);
        assert_eq!(raw.team.iter().find(|p| p.ld == Some(true)).unwrap().sid, Some(7));
    }

    #[test]
    fn active_id_takes_precedence_over_slot_zero_in_team_and_updates() {
        let mut state = HeadlessState::new(0, "Trainer".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "activeId": "poke_99",
                "pokemons": [
                    {"id": "poke_11", "slot": 0, "speciesId": 1, "nome": "Bulbasaur"},
                    {"id": "poke_99", "slot": 1, "speciesId": 4, "nome": "Charmander"}
                ]
            }
        }), &mut state);

        let lead = state.team.iter().find(|p| p.ld == Some(true)).expect("Must have a leader");
        assert_eq!(lead.id.as_ref(), Some(&json!("poke_99")));
        assert_eq!(lead.sid, Some(4));

        let slot0 = state.team.iter().find(|p| p.slot == Some(0)).expect("Must have slot 0");
        assert_eq!(slot0.ld, Some(false));
    }

    #[test]
    fn metrics_use_the_launcher_contract_and_active_id_deltas() {
        let mut state = HeadlessState::new(1, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"activeId":1,"pokemons":[{"id":1},{"id":2}]}}), &mut state);
        parse_game_message(&json!({"t":"estado","data":{"activeId":2}}), &mut state);
        assert_eq!(state.team.iter().find(|p| p.ld == Some(true)).unwrap().id, Some(json!(2)));
        parse_game_message(&json!({"t":"batalha","ev":[{"k":"morte","quem":"selvagem","xp":40,"ouro":8},{"k":"bola"}]}), &mut state);
        let value = serde_json::to_value(&state).unwrap();
        assert_eq!(value["a"]["xpg"], 40);
        assert_eq!(value["a"]["ballsUsed"], 1);
        assert!(value["sessStart"].as_u64().unwrap() > 0);
        assert_eq!(value["activeId"], 2);
        parse_game_message(&json!({"t":"disconnected"}), &mut state);
        assert!(!state.live);
    }

    #[test]
    fn saved_session_json_is_never_sent_as_the_websocket_token() {
        let (token, nick) = normalize_session_token(json!({"token":"actual-token","nick":"AuthenticatedNick","provedor":"email"}).to_string(), Some("display label".into()));
        assert_eq!(token, "actual-token");
        assert_eq!(nick.as_deref(), Some("AuthenticatedNick"));
        assert_eq!(normalize_session_token("raw-token".into(), None).0, "raw-token");
    }

    #[test]
    fn combat_field_updates_do_not_clear_hunt_and_center_exit_restores_target() {
        let mut state = HeadlessState::new(2, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"huntSlug":"larvitar","noCentro":false}}), &mut state);
        parse_game_message(&json!({"t":"campo.init","slug":"centro"}), &mut state);
        assert_eq!(state.hunt, "centro");
        parse_game_message(&json!({"t":"estado","data":{"noCentro":false}}), &mut state);
        assert_eq!(state.hunt, "larvitar");
        parse_game_message(&json!({"t":"campo","data":{"seq":33,"mobs":[]}}), &mut state);
        parse_game_message(&json!({"t":"campo","slug":""}), &mut state);
        assert_eq!(state.hunt, "larvitar");
    }

    #[test]
    fn ui_websocket_url_is_not_discarded() {
        let config: BlasterConfig = serde_json::from_value(json!({"wsUrl":"ws://127.0.0.1:9999","hunt":"vulpix"})).unwrap();
        assert_eq!(config.ws_url.as_deref(), Some("ws://127.0.0.1:9999"));
        assert_eq!(config.hunt.as_deref(), Some("vulpix"));
    }

    #[test]
    fn hunt_target_is_preserved_for_reconnect_across_field_and_disconnect_events() {
        let mut state = HeadlessState::new(0, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"huntSlug":"larvitar","noCentro":false}}), &mut state);
        assert_eq!(state.hunt, "larvitar");
        assert_eq!(state.last_hunt_slug, "larvitar");

        // When temporary disconnect occurs
        state.live = false;
        // The hunt slug must still be preserved for reconnect
        assert_eq!(state.hunt, "larvitar");
        assert_eq!(state.last_hunt_slug, "larvitar");
    }
}

#[cfg(test)]
mod supply_inventory_tests {
    use super::*;
    #[test]
    fn inventory_maps_follow_server_deltas() {
        let mut state = HeadlessState::new(0, "fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"balls":{"3":0,"1":42},"items":{"9":0}}}), &mut state);
        parse_game_message(&json!({"t":"estado","data":{"estado":{"balls":{"3":1000,"1":42},"items":{"9":50}}}}), &mut state);
        let value = serde_json::to_value(&state).unwrap();
        assert_eq!(value["ballMap"]["3"], 1000);
        assert_eq!(value["ballMap"]["1"], 42);
        assert_eq!(value["invMap"]["9"], 50);
    }
}

#[cfg(test)]
mod stock_contract_tests {
    use super::*;
    #[test]
    fn snapshots_replace_stock_and_missing_fields_preserve_it() {
        let mut s = HeadlessState::new(0, "fixture".into());
        parse_game_message(&json!({"t":"welcome","catalogoBolas":[{"id":5,"infinite":true}],"estado":{"balls":{"1":10,"5":1},"items":{"200":10,"205":3},"automation":{"ballIds":[5]}}}), &mut s);
        assert!(s.balls_known && s.inventory_known);
        assert_eq!(s.ball_catalog.len(),1);
        parse_game_message(&json!({"t":"estado","data":{"gold":4}}), &mut s);
        assert_eq!(s.inv_map["200"],10);
        parse_game_message(&json!({"t":"estado","data":{"balls":{"1":0},"items":{"205":2}}}), &mut s);
        assert!(!s.inv_map.contains_key("200"));
        assert!(!s.ball_map.contains_key("5"));
        parse_game_message(&json!({"t":"estado","items":null}), &mut s);
        assert!(s.inventory_known && s.inv_map.is_empty());
    }
    #[test]
    fn consumption_waits_for_authoritative_stock_and_reset_invalidates_it() {
        let mut s = HeadlessState::new(0, "fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"balls":{"1":10},"items":{"200":4}}}), &mut s);
        parse_game_message(&json!({"t":"batalha","ev":[{"k":"bola","ballId":1},{"k":"cura","itemId":200}]}), &mut s);
        assert_eq!(s.ball_map["1"],10);
        assert_eq!(s.inv_map["200"],4);
        assert_eq!(s.last_ball_id,Some(json!(1)));
        assert!(parse_game_message(&json!({"t":"estado","cheio":true}), &mut s));
        assert!(!s.balls_known && !s.inventory_known);
        assert!(s.ball_map.is_empty() && s.inv_map.is_empty());
        parse_game_message(&json!({"t":"telemetry_gap"}), &mut s);
        assert!(!s.live);
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn character_identity_comes_from_server_id_never_nickname() {
        let mut s = HeadlessState::new(0, "Nickname".into());
        assert!(s.cid.is_empty());
        parse_game_message(&json!({"t":"welcome","estado":{"id":42,"nick":"Nickname"}}), &mut s);
        assert_eq!(s.cid,"42");
        parse_game_message(&json!({"t":"estado","nick":"Renamed"}), &mut s);
        assert_eq!(s.cid,"42");
        parse_game_message(&json!({"t":"estado","id":"43"}), &mut s);
        assert_eq!(s.cid,"43");
        parse_game_message(&json!({"t":"welcome","estado":{"nick":"Unknown"}}), &mut s);
        assert!(s.cid.is_empty());
    }

    #[test]
    fn character_name_extracted_from_all_variants_and_preserves_against_placeholders() {
        let mut s = HeadlessState::new(0, "Personagem 1".into());
        // Resolves from trainerName
        parse_game_message(&json!({"t":"welcome","estado":{"trainerName":"Nailo"}}), &mut s);
        assert_eq!(s.name, "Nailo");

        // Incoming placeholder does not overwrite real character name
        parse_game_message(&json!({"t":"estado","estado":{"nick":"Personagem 1"}}), &mut s);
        assert_eq!(s.name, "Nailo");

        // Resolves from characterName
        parse_game_message(&json!({"t":"estado","estado":{"characterName":"Nailo2"}}), &mut s);
        assert_eq!(s.name, "Nailo2");

        // Resolves from character.name
        parse_game_message(&json!({"t":"estado","estado":{"character":{"name":"Nailo3"}}}), &mut s);
        assert_eq!(s.name, "Nailo3");
    }

    #[test]
    fn non_empty_team_is_preserved_when_empty_pokemons_array_received() {
        let mut s = HeadlessState::new(0, "Personagem 1".into());
        parse_game_message(&json!({"t":"welcome","estado":{"pokemons":[{"id":1,"speciesId":1,"nome":"Bulbasaur","level":5,"slot":0}]}}), &mut s);
        assert_eq!(s.team.len(), 1);
        assert_eq!(s.team[0].name.as_deref(), Some("Bulbasaur"));

        // Empty pokemons array in subsequent estado does NOT erase team
        parse_game_message(&json!({"t":"estado","estado":{"pokemons":[]}}), &mut s);
        assert_eq!(s.team.len(), 1);
        assert_eq!(s.team[0].name.as_deref(), Some("Bulbasaur"));
    }
}

#[cfg(test)]
mod telemetry_analytics_tests {
    use super::*;

    #[test]
    fn telemetry_analytics_full_ledger_contract_with_g6() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        let hunt_analyzer = json!({
            "version": 1,
            "route": "rota_1",
            "species": 25,
            "seconds": 120,
            "kills": 15,
            "xp": 3600,
            "coins": 450,
            "captures": 3,
            "captureValue": 600,
            "supplyCost": 150,
            "autoSaleCoins": 100,
            "balance": 1000,
            "shinyFound": 1,
            "shinyCap": 1,
            "ballsUsed": 5,
            "potsUsed": 2,
            "kph": 450,
            "xph": 108000,
            "gph": 16500,
            "drops": {"stone:water": 1, "materials": 12},
            "supplies": {"crafted:poke-ball": 5, "crafted:potion": 2}
        });

        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "char_101",
                "nick": "Trainer1",
                "gold": 5000,
                "diamonds": 100,
                "huntAnalyzer": hunt_analyzer
            }
        }), &mut s);

        let val = serde_json::to_value(&s).unwrap();
        assert_eq!(val["a"]["kills"], 15);
        assert_eq!(val["a"]["xpg"], 3600);
        assert_eq!(val["a"]["captures"], 3);
        assert_eq!(val["a"]["seconds"], 120);
        assert_eq!(val["a"]["supplyCost"], 150);
        assert_eq!(val["a"]["captureValue"], 600);
        assert_eq!(val["a"]["autoSaleCoins"], 100);
        assert_eq!(val["a"]["lootGold"], 450);
        assert_eq!(val["a"]["balance"], 1000);
        assert_eq!(val["a"]["shinyFound"], 1);
        assert_eq!(val["a"]["shinyCap"], 1);
        assert_eq!(val["a"]["ballsUsed"], 5);
        assert_eq!(val["a"]["potsUsed"], 2);
        assert_eq!(val["a"]["drops"]["stone:water"], 1);
        assert_eq!(val["a"]["supplies"]["crafted:poke-ball"], 5);
        assert!(s.live);
    }

    #[test]
    fn telemetry_analytics_zero_preservation_and_reset() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "1",
                "gold": 1000,
                "huntAnalyzer": {
                    "kills": 50,
                    "seconds": 500,
                    "coins": 200,
                    "supplyCost": 80
                }
            }
        }), &mut s);
        assert_eq!(s.a.kills, 50);
        assert_eq!(s.a.seconds, 500);

        parse_game_message(&json!({
            "t": "estado",
            "data": {
                "cheio": true,
                "huntAnalyzer": {
                    "kills": 0,
                    "seconds": 0,
                    "xp": 0,
                    "coins": 0,
                    "supplyCost": 0,
                    "captureValue": 0,
                    "autoSaleCoins": 0,
                    "balance": 0
                }
            }
        }), &mut s);
        assert_eq!(s.a.kills, 0);
        assert_eq!(s.a.seconds, 0);
        assert_eq!(s.a.xp, 0);
        assert_eq!(s.a.loot_gold, 0);
        assert_eq!(s.a.supply_cost, 0);
        assert_eq!(s.a.capture_value, 0);
        assert_eq!(s.a.auto_sale_coins, 0);
        assert_eq!(s.a.balance, 0);
    }

    #[test]
    fn telemetry_analytics_explicit_disconnect_marks_live_false_without_clearing_metrics() {
        let mut s = HeadlessState::new(1, "Trainer2".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "2",
                "huntSlug": "vulpix",
                "huntAnalyzer": { "kills": 10, "seconds": 60 }
            }
        }), &mut s);
        assert!(s.live);
        assert_eq!(s.hunt, "vulpix");

        parse_game_message(&json!({"t": "disconnected"}), &mut s);
        assert!(!s.live);
        assert_eq!(s.hunt, "vulpix");
        assert_eq!(s.a.kills, 10);
        assert_eq!(s.a.seconds, 60);
    }

    #[test]
    fn telemetry_analytics_idempotent_event_replay() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({"t": "welcome", "estado": {"id": "1"}}), &mut s);

        let battle_ev = json!({
            "t": "batalha",
            "eventId": "battle_evt_42",
            "ev": [
                {"id": "ev_sub_1", "k": "morte", "quem": "selvagem", "xp": 100, "ouro": 25},
                {"id": "ev_sub_2", "k": "bola", "ballId": 1},
                {"id": "ev_sub_3", "k": "cura", "itemId": 200}
            ]
        });

        assert!(parse_game_message(&battle_ev, &mut s));
        assert_eq!(s.a.kills, 1);
        assert_eq!(s.a.xp, 100);
        assert_eq!(s.a.loot_gold, 25);
        assert_eq!(s.a.balls, 1);
        assert_eq!(s.a.pots_used, 1);

        assert!(!parse_game_message(&battle_ev, &mut s));
        assert_eq!(s.a.kills, 1);
        assert_eq!(s.a.xp, 100);
        assert_eq!(s.a.loot_gold, 25);
        assert_eq!(s.a.balls, 1);
        assert_eq!(s.a.pots_used, 1);
    }

    #[test]
    fn telemetry_analytics_authoritative_empty_stock_preserved() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "balls": {"1": 10, "2": 5},
                "items": {"200": 3}
            }
        }), &mut s);
        assert!(s.balls_known);
        assert_eq!(s.ball_map["1"], 10);

        parse_game_message(&json!({
            "t": "estado",
            "data": {
                "balls": {}
            }
        }), &mut s);
        assert!(s.balls_known);
        assert!(s.ball_map.is_empty());
    }

    #[test]
    fn telemetry_analytics_har_replay_and_activity_drops() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": { "id": "nailo_har", "nick": "Nailo", "gold": 12000 }
        }), &mut s);

        parse_game_message(&json!({
            "t": "activity",
            "data": { "kind": "battle", "name": "Geodude", "xp": 55, "gold": 14 }
        }), &mut s);
        parse_game_message(&json!({
            "t": "activity",
            "data": { "kind": "drop", "name": "element:earth", "qty": 2 }
        }), &mut s);

        assert_eq!(s.a.kills, 1);
        assert_eq!(s.a.xp, 55);
        assert_eq!(s.a.loot_gold, 14);
        assert_eq!(s.raw_drops["element:earth"]["qty"], 2);
    }

    #[test]
    fn telemetry_analytics_native_coordinator_fixture() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "char_coord",
                "nick": "Trainer1",
                "huntAnalyzer": {
                    "coins": 15,
                    "captureValue": 50,
                    "supplyCost": 7,
                    "seconds": 60,
                    "drops": {}
                }
            }
        }), &mut s);

        let val = serde_json::to_value(&s).unwrap();
        assert_eq!(val["a"]["lootGold"], 15);
        assert_eq!(val["a"]["captureValue"], 50);
        assert_eq!(val["a"]["supplyCost"], 7);
        assert_eq!(val["a"]["seconds"], 60);
        assert_eq!(val["a"]["balance"], 58);
        assert_eq!(val["a"]["gph"], 3480);
    }

    #[test]
    fn telemetry_analytics_negative_net_and_gph() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "char_neg",
                "huntAnalyzer": {
                    "coins": 10,
                    "captureValue": 0,
                    "supplyCost": 50,
                    "seconds": 60
                }
            }
        }), &mut s);

        let val = serde_json::to_value(&s).unwrap();
        assert_eq!(val["a"]["balance"], -40);
        assert_eq!(val["a"]["gph"], -2400);
    }

    #[test]
    fn telemetry_analytics_auto_sale_coins_not_double_counted() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "char_autosale",
                "huntAnalyzer": {
                    "coins": 100,
                    "autoSaleCoins": 50,
                    "supplyCost": 20,
                    "seconds": 3600
                }
            }
        }), &mut s);

        let val = serde_json::to_value(&s).unwrap();
        assert_eq!(val["a"]["autoSaleCoins"], 50);
        assert_eq!(val["a"]["balance"], 80);
        assert_eq!(val["a"]["gph"], 80);
    }

    #[test]
    fn telemetry_analytics_capture_history_preserved_in_rust() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "char_ch",
                "captureHistory": [
                    {"uid": "cap_1", "speciesId": 25, "time": 1000},
                    {"uid": "cap_2", "speciesId": 25, "time": 1005}
                ]
            }
        }), &mut s);

        assert_eq!(s.capture_history.len(), 2);
        assert_eq!(s.capture_history[0]["uid"], "cap_1");
        assert_eq!(s.capture_history[1]["uid"], "cap_2");

        parse_game_message(&json!({
            "t": "batalha",
            "ev": [
                {"k": "capturado", "pokemon": {"uid": "cap_3", "speciesId": 4, "time": 1010}}
            ]
        }), &mut s);

        assert_eq!(s.capture_history.len(), 3);
        assert_eq!(s.capture_history[2]["uid"], "cap_3");

        let val = serde_json::to_value(&s).unwrap();
        assert!(val.get("captureHistory").is_some());
        assert_eq!(val["captureHistory"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn telemetry_analytics_snapshots_with_same_id_do_not_deduplicate() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        assert!(parse_game_message(&json!({
            "t": "estado",
            "id": 42,
            "estado": { "id": 42, "gold": 100 }
        }), &mut s));
        assert_eq!(s.gold, 100);

        assert!(parse_game_message(&json!({
            "t": "estado",
            "id": 42,
            "estado": { "id": 42, "gold": 250 }
        }), &mut s));
        assert_eq!(s.gold, 250);
    }

    #[test]
    fn telemetry_analytics_breakdown_loot_gold_prefers_normalized() {
        let mut s = HeadlessState::new(0, "Trainer1".into());
        // coins: 15, materials: 5 * 4 = 20 -> normalized lootGold = 35.
        parse_game_message(&json!({
            "t": "welcome",
            "estado": {
                "id": "char_breakdown",
                "huntAnalyzer": {
                    "coins": 15,
                    "lootGold": 35,
                    "captureValue": 50,
                    "supplyCost": 7,
                    "seconds": 60
                }
            }
        }), &mut s);

        let val = serde_json::to_value(&s).unwrap();
        assert_eq!(val["a"]["lootGold"], 35);
        assert_eq!(val["a"]["balance"], 78);
        assert_eq!(val["a"]["gph"], 4680);
    }
}
