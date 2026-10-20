/**
 * @file tauri-bridge.js
 * Camada de compatibilidade transparente entre a API histórica do launcher (window.pokeAPI)
 * e os comandos / eventos nativos do Tauri v2 (window.__TAURI__.core / event), incluindo
 * polyfill completo do elemento <webview> para WebView2 nativo do Windows,
 * com gerenciamento de airspace para modais e auto-preenchimento nativo de credenciais.
 */

(() => {
  'use strict';

  // Pré-inicialização atômica do Modo Simples (Cards): se estiver persistido,
  // marca documentElement desde o primeiro microsegundo para evitar flash de tela e vazamento de webview
  try {
    if (localStorage.getItem('cardsOn') === '1' || localStorage.getItem('leafView') === 'simple') {
      document.documentElement.classList.add('cards-on');
    }
  } catch (e) { }

  const tauri = window.__TAURI__;
  const invoke = (tauri && tauri.core && tauri.core.invoke) || (async () => { throw new Error('Tauri indisponível'); });
  const listen = (tauri && tauri.event && tauri.event.listen) || (async () => { throw new Error('Eventos Tauri indisponíveis'); });

  // Cache em memória de credenciais para auto-preenchimento
  let cachedAccounts = [];

  window.pokeAPI = {
    // 1. Credenciais & Contas
    loadCreds: async () => {
      try {
        const accs = await invoke('creds_load');
        if (Array.isArray(accs) && accs.length) {
          cachedAccounts = accs;
          return accs;
        }
      } catch (e) { console.error('Falha ao carregar contas:', e); throw e; }
      return Array.from({ length: 4 }, (_, i) => ({ name: `Personagem ${i + 1}`, email: '', senha: '' }));
    },
    saveCreds: async (accounts) => {
      cachedAccounts = accounts;
      return invoke('creds_save', { accounts }).catch(() => false);
    },
    applyAccountProxies: async () => ({ changed: [], errors: [] }),
    clearAccount: (i) => invoke('account_clear', { index: i }).catch(() => true),

    // 2. Sistema & Janela
    setAwake: (on) => invoke('set_awake', { on }).catch(() => true),
    setMinToTray: (on) => invoke('set_min_to_tray', { on }),
    webhook: (url, text) => invoke('webhook_send', { url, text }).catch(() => true),
    getAutoStart: () => invoke('autostart_get').catch(() => ({ on: false, suportado: true })),
    setAutoStart: (on) => invoke('autostart_set', { on }),
    onAutoStart: (cb) => listen('autostart:change', (e) => cb(e.payload)),
    onHotkey: (cb) => listen('hotkey:press', (e) => cb(e.payload)),
    onJanela: (cb) => listen('window:visibility', (e) => cb(e.payload)),
    windowControl: (action) => invoke('window_control', { action }).catch(() => ({ maximized: false })),
    onWindowMaximized: (cb) => listen('window:maximized', (e) => cb(e.payload)),
    notify: (title, body) => invoke('system_notify', { title, body }),

    // 3. Presets & Logs
    readPreset: (name) => invoke('preset_read', { name }).catch(() => null),
    logError: (origin, msg) => invoke('errlog_write', { origin, msg }).catch(() => true),
    openErrorLog: () => invoke('errlog_open').catch(() => true),
    saveBackup: (name, content, header) => invoke('backup_save', { name, content, header }).catch(() => false),

    // 4. Userscripts & Extensões
    fetchUserScript: (url) => invoke('userscript_fetch', { url }).catch(() => null),
    fetchExtension: (url) => invoke('userscript_request', { url }).catch(() => ({ status: 500, body: '' })),

    // 5. Autenticação & Janelas Auxiliares
    camoufoxLogin: (data) => invoke('camoufox_login', { data }).catch(() => ({ success: false })),
    cancelLogin: (index) => invoke('auth_cancel_login', { index }).catch(() => true),
    camoufoxCheck: () => invoke('camoufox_check').catch(() => ({ available: false })),
    openAuthWindow: (index, url) => invoke('auth_window_open', { index, url }).catch(() => true),



    // 8. Modo Master Blaster (Headless Puro WebSocket)
    blasterStart: (index, config) => invoke('blaster_start', { index, config }).catch(() => ({ ok: false })),
    blasterStop: async (index) => {
      await invoke('blaster_stop', { index });
      delete lastBounds[index];
      for (const el of registeredWebviews) if (el.__resolveIndex() === index) el.__syncBounds();
      return { ok: true };
    },
    blasterStatus: (index) => invoke('blaster_status', { index }).catch(() => ({ active: false })),
    supplyBuy: async (index, orders) => {
      const hud = window.PawBattleHud || window.PioBattleHud;
      if (!hud?.isBlasterActive(index)) {
        return window.pokeAPI.webviewEval(index, window.SUPPLY_BUY_JS(JSON.stringify(orders)));
      }
      const results = [];
      for (const order of orders) {
        const map = order.kind === 'ball' ? 'ballMap' : 'invMap';
        const state = window.stCache?.[index]?.d;
        if (!state?.live || !state[map] || (order.kind === 'ball' ? state.ballsKnown === false : state.inventoryKnown === false)) {
          results.push({...order, success:false, reason:'aguardando estoque do servidor'});
          break;
        }
        const before = +state[map][order.id] || 0;
        const result = await new Promise(async resolve => {
          let done = false, timer, unlisten;
          const finish = data => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            unlisten?.();
            resolve({...order, before, ...data});
          };
          try {
            unlisten = await listen('blaster:update', event => {
              const payload = event.payload || {};
              if (payload.index !== index) return;
              if (payload.state?.live === false) return finish({success:false, reason:'conexão encerrada'});
              const after = +payload.state?.[map]?.[order.id];
              if (after > before) finish({success:true, after});
            });
            timer = setTimeout(() => finish({success:false, reason:'estoque não confirmado pelo servidor'}), 8000);
            if (!await invoke('blaster_send', {index, data:{t:'shop.buy', kind:order.kind, id:order.id, qty:order.qty}})) {
              finish({success:false, reason:'falha ao enviar compra'});
            }
          } catch (error) { finish({success:false, reason:String(error)}); }
        });
        results.push(result);
        if (!result.success) break;
      }
      return results;
    },
    blasterSend: (index, data) => invoke('blaster_send', { index, data }).catch(() => false),
    sessionTokenSave: (index, token, nick) => invoke('session_token_save', { index, token, nick }).catch(() => false),
    sessionTokenGet: (index) => invoke('session_token_get', { index }).catch(() => null),
    onSessionToken: (cb) => listen('session:token', (e) => cb(e.payload)),
    onBlasterUpdate: (cb) => listen('blaster:update', (e) => cb(e.payload)),
    onBlasterStatus: (cb) => listen('blaster:status', (e) => cb(e.payload)),

    blasterStartWithLogin: async (index, config = {}) => {
      lastVisibility[index] = false;
      delete lastBounds[index];
      try {
        await invoke('blaster_start', { index, config });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },

    // 9. Gerenciamento Nativo de Sub-WebViews (Perfis Isolados)
    webviewSync: (index, bounds, url, visible) => invoke('webview_sync', { index, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, url, visible: typeof visible === 'boolean' ? visible : null }).catch(() => false),
    webviewSetVisible: (index, visible) => {
      lastVisibility[index] = visible;
      return invoke('webview_set_visible', { index, visible }).catch(() => false);
    },
    webviewDestroy: (index) => {
      delete lastBounds[index];
      delete lastVisibility[index];
      for (const el of registeredWebviews) {
        if (typeof el.__resolveIndex === 'function' && el.__resolveIndex() === index) {
          registeredWebviews.delete(el);
        }
      }
      return invoke('webview_destroy', { index }).catch(() => false);
    },
    webviewEval: (index, script) => invoke('webview_eval', { index, script }),
    webviewFillCreds: (index, email, pass) => invoke('webview_fill_creds', { index, email, pass }).catch(() => false),
    setAudioMuted: (index, muted) => invoke('webview_settings', { index, muted: !!muted }).catch(console.error),

    // 10. Atualizador Automático Nativo
    checkUpdate: () => invoke('updater_check').catch((e) => ({ update_available: false, error: String(e) })),
    applyUpdate: (downloadUrl) => invoke('updater_apply', { downloadUrl }),
    onUpdateProgress: (cb) => listen('updater:progress', (e) => cb(e.payload)),

    // 11. Metadados
    appVersion: '1.0.11'
  };

  window.PawNailo = window.PawNailo || {};

  // O launcher carrega as credenciais uma única vez durante sua inicialização.

  function dispatchToApp(index, incoming) {
    if (typeof index !== 'number' || !incoming) return;
    const rawPrevious = window.stCache?.[index]?.d || {};
    const isNewCharacter = incoming.cid && rawPrevious.cid && String(incoming.cid) !== String(rawPrevious.cid);
    const previous = isNewCharacter ? {} : rawPrevious;
    const state = { ...previous, ...incoming, i: index };
    state.i = index;

    // Deep merge do objeto de métricas 'a' preservando zeros reais
    const prevA = previous.a || {};
    const incA = incoming.a || {};

    // Sincroniza aliases do INCOMING antes do merge, garantindo que a presença de uma alias (mesmo 0) invalide a outra
    const normalizedIncA = { ...incA };
    if (normalizedIncA.xp !== undefined && normalizedIncA.xpg === undefined) normalizedIncA.xpg = normalizedIncA.xp;
    if (normalizedIncA.xpg !== undefined && normalizedIncA.xp === undefined) normalizedIncA.xp = normalizedIncA.xpg;
    if (normalizedIncA.supplyCost !== undefined && normalizedIncA.supplyGold === undefined) normalizedIncA.supplyGold = normalizedIncA.supplyCost;
    if (normalizedIncA.supplyGold !== undefined && normalizedIncA.supplyCost === undefined) normalizedIncA.supplyCost = normalizedIncA.supplyGold;
    if (normalizedIncA.captureValue !== undefined && normalizedIncA.capturesGold === undefined) normalizedIncA.capturesGold = normalizedIncA.captureValue;
    if (normalizedIncA.capturesGold !== undefined && normalizedIncA.captureValue === undefined) normalizedIncA.captureValue = normalizedIncA.capturesGold;
    if (normalizedIncA.lootGold !== undefined && normalizedIncA.coins === undefined) normalizedIncA.coins = normalizedIncA.lootGold;
    if (normalizedIncA.coins !== undefined && normalizedIncA.lootGold === undefined) normalizedIncA.lootGold = normalizedIncA.coins;

    const mergedA = { ...prevA, ...normalizedIncA };
    const metricKeys = [
      'seconds', 'xpg', 'xp', 'xph', 'gph', 'kph', 'kills', 'captures',
      'shinyFound', 'shinyCap', 'ballsUsed', 'potsUsed', 'balance',
      'lootGold', 'capturesGold', 'supplyGold', 'supplyCost', 'captureValue',
      'autoSaleCoins', 'coins'
    ];
    for (const k of metricKeys) {
      if (normalizedIncA[k] !== undefined) {
        mergedA[k] = normalizedIncA[k];
      } else if (prevA[k] !== undefined) {
        mergedA[k] = prevA[k];
      }
    }
    if (normalizedIncA.drops !== undefined) mergedA.drops = normalizedIncA.drops;
    else if (prevA.drops !== undefined) mergedA.drops = prevA.drops;
    if (normalizedIncA.supplies !== undefined) mergedA.supplies = normalizedIncA.supplies;
    else if (prevA.supplies !== undefined) mergedA.supplies = prevA.supplies;
    state.a = mergedA;

    // Preserva carteira apenas se incoming for nulo/indefinido (zero e saldo valido)
    if (incoming.gold == null && previous.gold != null) {
      state.gold = previous.gold;
    }
    if (incoming.diamonds == null && previous.diamonds != null) {
      state.diamonds = previous.diamonds;
    }

    // Preserva activeId se o incoming não enviou
    if (incoming.activeId != null) {
      state.activeId = incoming.activeId;
    } else if (previous.activeId != null) {
      state.activeId = previous.activeId;
    }

    // Preserva membros do time se o incoming não enviou o time, ou mescla propriedades enriquecidas (img, sid, hp, etc.)
    if (Array.isArray(incoming.team) && incoming.team.length === 0) {
      state.team = [];
    } else if (Array.isArray(incoming.team) && incoming.team.length > 0) {
      const prevTeam = Array.isArray(previous.team) ? previous.team : [];
      state.team = incoming.team.map((inc, idx) => {
        if (!inc) return inc;
        const prevMember = prevTeam.find(p => p && (
          (inc.id != null && p.id != null && String(p.id) === String(inc.id)) ||
          (inc.slot != null && p.slot != null && p.slot === inc.slot) ||
          (inc.slot == null && p.slot === idx)
        )) || prevTeam[idx] || {};
        return {
          ...prevMember,
          ...inc,
          img: inc.img || prevMember.img || undefined,
          sid: inc.sid || prevMember.sid || undefined
        };
      });
    } else if (previous.team && previous.team.length > 0) {
      state.team = previous.team;
    }

    // Sincroniza flag ld com activeId caso activeId esteja definido
    if (Array.isArray(state.team) && state.activeId != null) {
      const hasActive = state.team.some(p => p && (String(p.id) === String(state.activeId) || String(p.uid) === String(state.activeId)));
      if (hasActive) {
        state.team.forEach(p => {
          if (!p) return;
          p.ld = (String(p.id) === String(state.activeId) || String(p.uid) === String(state.activeId));
        });
      }
    }

    // Preserva a caça atual se incoming for vazio ou centro
    if ((!incoming.hunt || incoming.hunt === '' || incoming.hunt === 'centro') && previous.hunt && previous.hunt !== 'centro') {
      state.hunt = previous.hunt;
    }

    // Preserva identidade se incoming não possuir ou enviar placeholder
    if (!incoming.cid && previous.cid) state.cid = previous.cid;
    const isPlaceholderName = (nm) => {
      if (!nm || typeof nm !== 'string') return true;
      const s = nm.trim();
      return !s || s.startsWith('Conta ') || s.startsWith('Personagem ') || /^Personagem\s*\d+$/i.test(s) || /^Conta\s*\d+$/i.test(s) || s === '—' || s.toLowerCase() === 'sem líder';
    };
    if (isPlaceholderName(incoming.name) && previous.name && !isPlaceholderName(previous.name)) {
      state.name = previous.name;
    } else if (incoming.name && !isPlaceholderName(incoming.name)) {
      state.name = incoming.name.trim();
      if (typeof window.tabNames !== 'undefined') window.tabNames[index] = state.name;
      if (cachedAccounts && cachedAccounts[index]) {
        cachedAccounts[index].name = state.name;
      }
      if (typeof accounts !== 'undefined' && accounts[index] && accounts[index].name !== state.name) {
        accounts[index].name = state.name;
        if (typeof save === 'function') save();
        window.pokeAPI?.saveCreds?.(accounts);
      }
    }
    if (!incoming.level && previous.level) state.level = previous.level;

    // Preserva inventário e catálogo de bolas apenas quando o push não for autoritativo sobre estoques
    const hasIncomingBalls = incoming.ballMap && typeof incoming.ballMap === 'object' && Object.keys(incoming.ballMap).length > 0;
    const prevHasBalls = previous.ballMap && typeof previous.ballMap === 'object' && Object.keys(previous.ballMap).length > 0;

    if (typeof incoming.ballsKnown === 'boolean') {
      state.ballsKnown = incoming.ballsKnown;
      if (!incoming.ballsKnown) {
        state.ballMap = {};
      } else if (incoming.ballMap !== undefined) {
        state.ballMap = incoming.ballMap;
      } else if (prevHasBalls) {
        state.ballMap = previous.ballMap;

      } else if (incoming.ballMap !== undefined) {
        state.ballMap = incoming.ballMap;
      } else if (!incoming.ballsKnown) {
        state.ballMap = {};
      }
      if (incoming.ballCatalog !== undefined && incoming.ballCatalog.length) {
        state.ballCatalog = incoming.ballCatalog;
      } else if (previous.ballCatalog && previous.ballCatalog.length) {
        state.ballCatalog = previous.ballCatalog;
      }
    } else if (hasIncomingBalls) {
      state.ballMap = incoming.ballMap;
      state.ballsKnown = true;
    } else if (prevHasBalls) {
      state.ballMap = previous.ballMap;
      state.ballsKnown = previous.ballsKnown ?? true;
      if (previous.ballCatalog && previous.ballCatalog.length && (!state.ballCatalog || !state.ballCatalog.length)) {
        state.ballCatalog = previous.ballCatalog;
      }
    }

    if (typeof incoming.inventoryKnown === 'boolean') {
      state.inventoryKnown = incoming.inventoryKnown;
      if (incoming.invMap !== undefined) {
        state.invMap = incoming.invMap;
      } else if (!incoming.inventoryKnown) {
        state.invMap = {};
      } else if (previous.invMap) {
        state.invMap = previous.invMap;
      }
    } else if (incoming.invMap !== undefined) {
      state.invMap = incoming.invMap;
      state.inventoryKnown = state.inventoryKnown ?? (incoming.invMap != null);
    } else if (previous.invMap) {
      state.invMap = previous.invMap;
      state.inventoryKnown = previous.inventoryKnown ?? false;
    }
    if (!incoming.equippedBall && previous.equippedBall) state.equippedBall = previous.equippedBall;
    if ((incoming.balls == null || (incoming.balls === 0 && !hasIncomingBalls && prevHasBalls)) && previous.balls != null) {
      state.balls = previous.balls;
    }

    for (const [map, known] of [['ballMap','ballsKnown'],['invMap','inventoryKnown']]) {
      if (Object.hasOwn(state, map) && state[known] === undefined) state[known] = state[map] != null;
    }

    // Desconexão explícita sem incoming.live || previous.live
    if (incoming.disconnected === true) {
      state.live = false;
    } else if (typeof incoming.live === 'boolean') {
      state.live = incoming.live;
    } else if (previous.live !== undefined) {
      state.live = previous.live;
    } else {
      state.live = false;
    }

    const getPokeName = (id) => {
      if (!id) return '';
      const num = +id;
      if (!num) return String(id);
      if (!window.__pokeCatalogMap && window.PIW_ALL_POKEMON_THEMES) {
        window.__pokeCatalogMap = new Map(window.PIW_ALL_POKEMON_THEMES.map(p => [p.dex, p.name]));
      }
      return window.__pokeCatalogMap?.get(num) || String(id);
    };

    if (state.hunt && /^\d+$/.test(String(state.hunt).trim())) {
      const hName = getPokeName(state.hunt.trim());
      if (hName && hName !== state.hunt) state.hunt = hName;
    }

    if (Array.isArray(state.team)) {
      state.team.forEach(p => {
        if (!p) return;
        const sid = p.sid || p.speciesId || (+String(p.id || '').replace(/^poke_|^p/i, '')) || 0;
        if (!p.img && sid) {
          p.img = 'https://pokeascendedworld.com/assets/anime/pokemon/' + sid + '.png';
        }
        if (!p.name || p.name === 'Líder' || p.name === 'Sem líder' || p.name.startsWith('#')) {
          const spName = getPokeName(sid);
          if (spName) {
            p.name = spName;
            p.nome = spName;
          }
        }
      });
    }

    if (Array.isArray(incoming.captureHistory)) {
      if (incoming.captureHistory.length === 0) {
        state.catchLog = [];
      } else {
        const existing = state.catchLog || [];
        const newLogs = incoming.captureHistory.filter(p => p && p.ok !== false).map(p => {
          const uid = p.uid || p.uuid || p.uniqueId || (typeof p.id === 'string' && isNaN(Number(p.id)) ? p.id : null);
          const sid = p.speciesId || p.pokeId || p.sid || (typeof p.id === 'number' || (typeof p.id === 'string' && !isNaN(Number(p.id))) ? Number(p.id) : 0);
          const t = p.time || p.t || p.timestamp || 0;
          const ivs = p.ivs ? {
            hp: p.ivs.hp || 0,
            atk: p.ivs.attack != null ? p.ivs.attack : (p.ivs.atk || 0),
            def: p.ivs.defense != null ? p.ivs.defense : (p.ivs.def || 0),
            spAtk: p.ivs.spAttack != null ? p.ivs.spAttack : (p.ivs.spAtk || 0),
            spDef: p.ivs.spDefense != null ? p.ivs.spDefense : (p.ivs.spDef || 0),
            speed: p.ivs.speed != null ? p.ivs.speed : (p.ivs.spe || 0)
          } : null;
          const ivTot = ivs ? (ivs.hp + ivs.atk + ivs.def + ivs.spAtk + ivs.spDef + ivs.speed) : (p.ivTotal || 0);
          return {
            uid: uid,
            id: uid || (t ? `${t}:${sid}` : null),
            n: p.name || p.nome || getPokeName(sid) || ('#' + sid),
            sid: sid,
            iv: ivTot,
            ivs: ivs,
            q: +p.quality || 1,
            potencia: +p.potency || 1,
            sh: !!p.shiny,
            fx: false,
            t: t
          };
        });
        const isDup = (ex, nl) => {
          if (nl.uid && ex.uid) return nl.uid === ex.uid;
          if (nl.t && ex.t) return nl.t === ex.t && nl.sid === ex.sid;
          return ex.sid === nl.sid && ex.iv === nl.iv && ex.sh === nl.sh;
        };
        state.catchLog = [...existing, ...newLogs.filter(nl => !existing.some(ex => isDup(ex, nl)))].slice(-100);
      }
    }

    if (Array.isArray(incoming.catchLog)) {
      if (incoming.catchLog.length === 0 && incoming.captureHistory === undefined) {
        state.catchLog = [];
      } else if (incoming.catchLog.length > 0) {
        const existing = state.catchLog || [];
        const isDup = (ex, cl) => {
          const exUid = ex.uid || (typeof ex.id === 'string' && isNaN(Number(ex.id)) ? ex.id : null);
          const clUid = cl.uid || (typeof cl.id === 'string' && isNaN(Number(cl.id)) ? cl.id : null);
          if (clUid && exUid) return clUid === exUid;
          if (cl.t && ex.t) return cl.t === ex.t && (cl.sid || cl.id) === (ex.sid || ex.id);
          return (cl.sid || cl.id) === (ex.sid || ex.id) && cl.iv === ex.iv;
        };
        state.catchLog = [...existing, ...incoming.catchLog.filter(cl => !existing.some(ex => isDup(ex, cl)))].slice(-100);
      }
    }
    if (Array.isArray(incoming.shinyLog) && incoming.shinyLog.length > 0) {
      const existing = state.shinyLog || [];
      state.shinyLog = [...existing, ...incoming.shinyLog.filter(sl => !existing.some(ex => ex.t === sl.t && ex.sid === sl.sid))].slice(-50);
    }

    const projected = (window.PawInventory || window.PioInventory).project(state);
    if (projected) projected.i = index;
    window.stCache = window.stCache || {};
    window.stCache[index] = { t: Date.now(), d: projected };
    if (typeof window.mergeLogs === 'function') {
      window.mergeLogs(index, projected);
    }
    const grid = document.getElementById('grid');
    const panel = grid && grid.children[index];
    const hud = window.PawBattleHud || window.PioBattleHud;
    if (panel && hud && typeof hud.update === 'function') {
      hud.update(panel, index, projected);
    }
    // Dispara console-message para o index.html (alimenta estatísticas globais, Simples e cards)
    const targetWv = (panel && panel.querySelector('webview')) ||
                     (typeof webviews !== 'undefined' && webviews[index]) ||
                     Array.from(registeredWebviews).find(w => typeof w.__resolveIndex === 'function' && w.__resolveIndex() === index);
    if (targetWv) {
      const msgStr = '__PGST__' + JSON.stringify(projected);
      const evt = new CustomEvent('console-message', {
        detail: { message: msgStr }
      });
      evt.message = msgStr;
      targetWv.dispatchEvent(evt);
    }
    // Dispara atualização direta para o shell atualizar sidebar, rodapé e lista
    document.dispatchEvent(new CustomEvent('paw-telemetry-update', { detail: { index, state: projected } }));
    return projected;
  }

  window.PawNailo.dispatchTelemetry = dispatchToApp;

  listen('game:console', (e) => {
    const {index, message} = e.payload || {};
    const el = Array.from(registeredWebviews).find(w => typeof w.__resolveIndex === 'function' && w.__resolveIndex() === index);
    if (el) { const event = new Event('console-message'); event.message = message; el.dispatchEvent(event); }
  });
  listen('game:load', (e) => {
    const el = Array.from(registeredWebviews).find(w => w.__resolveIndex() === e.payload.index);
    el?.__onNativeLoad(e.payload);
  });
  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !event.target.closest('.leaf-topbar') || event.target.closest('button, input, select, a, [role="button"]')) return;
    event.preventDefault();
    invoke('window_control', {action: event.detail === 2 ? 'maximize' : 'drag'}).catch(console.error);
  });


  // Sincronização de telemetria nativa (push de estado completo e eventos de combate)
  listen('st:push', (e) => {
    const payload = e.payload || {};
    if ((window.PawBattleHud || window.PioBattleHud)?.isBlasterActive(payload.index)) return;
    dispatchToApp(payload.index, payload.state);
  });

  listen('blaster:update', (e) => {
    const payload = e.payload || {};
    dispatchToApp(payload.index, payload.state);
  });

  // =========================================================================
  // Gerenciamento de Airspace: Modais Reais que cobrem o grid
  // (Nota: #stats NÃO é modal; é a barra lateral que fica ao lado do grid)
  // =========================================================================
  const REAL_MODAL_SELECTORS = [
    '#overlay.show',
    '#scOverlay.show',
    '#tlOverlay.show',
    '#tlOv.show',
    '#dtOverlay.show',
    '#dtOv.show',
    '#dispatchOverlay.show',
    '#autoSupplyOverlay.show',
    '#menu.show',
    'body.leaf-tools-open #leafToolsMenu',
    'body.leaf-settings-open #leafSettingsDrawer',
    '#ivCard.show',
    '#pawUpdaterOverlay.show',
    '.paw-modal-overlay.show'
  ].join(', ');

  function isAnyModalOpen() {
    const updater = document.getElementById('pawUpdaterOverlay');
    if (updater && updater.classList.contains('show')) {
      return true;
    }
    return Array.from(document.querySelectorAll(REAL_MODAL_SELECTORS)).some(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  const registeredWebviews = new Set();
  const lastBounds = {};
  const lastVisibility = {};

  function updateAllWebviewsVisibility() {
    const modalActive = isAnyModalOpen();
    const isCardsOn = document.documentElement.classList.contains('cards-on') || (document.body && document.body.classList.contains('cards-on'));
    if (modalActive || isCardsOn) {
      for (let i = 0; i < 4; i++) {
        if (lastVisibility[i] !== false) {
          lastVisibility[i] = false;
          window.pokeAPI.webviewSetVisible(i, false);
        }
      }
      return;
    }

    for (const el of registeredWebviews) {
      if (typeof el.__syncBounds === 'function') {
        el.__syncBounds();
      }
    }
  }

  let updateVisibilityTimer = null;
  function debouncedUpdateVisibility() {
    if (updateVisibilityTimer) clearTimeout(updateVisibilityTimer);
    updateVisibilityTimer = setTimeout(updateAllWebviewsVisibility, 60);
  }

  // Observa aberturas de modais com debouncing
  document.addEventListener('click', debouncedUpdateVisibility);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') debouncedUpdateVisibility();
  });
  window.addEventListener('resize', debouncedUpdateVisibility);
  document.addEventListener('leaf-modal-toggle', debouncedUpdateVisibility);
  window.addEventListener('leaf-modal-toggle', debouncedUpdateVisibility);

  // Observa mudanças de classe e estilo no body e painéis para stats-open, cards-on, modais e is-hud-active
  const bodyObserver = new MutationObserver(() => {
    debouncedUpdateVisibility();
  });
  const observeBody = () => bodyObserver.observe(document.body, {attributes: true, attributeFilter: ['class', 'style'], subtree: true});
  if (document.body) observeBody();
  else document.addEventListener('DOMContentLoaded', observeBody, {once: true});

  // =========================================================================
  // Polyfill de <webview> para o Microsoft Edge WebView2 no Tauri v2
  // =========================================================================
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName, options) {
    if (typeof tagName === 'string' && tagName.toLowerCase() === 'webview') {
      const el = origCreateElement('webview', options);
      el.classList.add('tauri-webview-host');
      el.style.flex = '1';
      el.style.minHeight = '0';
      el.style.minWidth = '0';
      el.style.background = '#0d1117';
      el.style.display = 'block';

      let _src = '';
      let _partition = '';
      let _index = -1;
      let _syncTimer = null;
      let _loadedOnce = false;
      let _filledCreds = false;

      function resolveIndex() {
        if (_index >= 0) return _index;
        if (_partition) {
          const m = _partition.match(/conta(\d+)/i);
          if (m) { _index = parseInt(m[1], 10) - 1; return _index; }
        }
        return -1;
      }

      function syncBounds() {
        const idx = resolveIndex();
        if (idx < 0) return;
        if (!el.isConnected) {
          if (lastVisibility[idx] !== false) {
            lastVisibility[idx] = false;
            window.pokeAPI.webviewSetVisible(idx, false);
          }
          registeredWebviews.delete(el);
          return;
        }

        const panel = el.closest('.panel');
        const isPanelOff = panel && panel.classList.contains('off');
        const isFamHidden = panel && panel.classList.contains('leaf-fam-hidden');
        const isHudActive = panel && (panel.classList.contains('is-hud-active') || panel.classList.contains('is-blaster-active'));
        const isCardsOn = document.documentElement.classList.contains('cards-on') || (document.body && document.body.classList.contains('cards-on'));
        const expandedPanel = document.querySelector('#grid > .panel.expanded');
        const coveredByExpandedPanel = expandedPanel && panel !== expandedPanel;
        const modalOpen = isAnyModalOpen();

        const rect = el.getBoundingClientRect();

        if (panel && panel.classList.contains('is-blaster-active')) return;

        if (isPanelOff || !_src || _src === 'about:blank') {
          if (lastVisibility[idx] !== false) {
            lastVisibility[idx] = false;
            window.pokeAPI.webviewSetVisible(idx, false);
          }
          return;
        }
        const visible = !(modalOpen || coveredByExpandedPanel || isFamHidden || isHudActive || isCardsOn || rect.width <= 15 || rect.height <= 15 || getComputedStyle(el).display === 'none');
        if (!visible) {
          if (lastVisibility[idx] !== false) {
            lastVisibility[idx] = false;
            window.pokeAPI.webviewSetVisible(idx, false);
          }
          if (!lastBounds[idx]) {
            const host = panel.getBoundingClientRect();
            const bounds = {x:Math.max(0, host.left), y:Math.max(0, host.top), width:Math.max(320, host.width), height:Math.max(240, host.height)};
            lastBounds[idx] = bounds;
            window.pokeAPI.webviewSync(idx, bounds, _src, false);
          }
          return;
        }

        const b = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };

        const prev = lastBounds[idx];
        const boundsChanged = !prev ||
          Math.abs(prev.x - b.x) > 1 ||
          Math.abs(prev.y - b.y) > 1 ||
          Math.abs(prev.width - b.width) > 1 ||
          Math.abs(prev.height - b.height) > 1;

        const targetUrl = (_src && _src !== 'about:blank') ? _src : 'https://pokeascendedworld.com/play';

        if (boundsChanged) {
          lastBounds[idx] = b;
          window.pokeAPI.webviewSync(idx, b, targetUrl, true);
        }

        if (lastVisibility[idx] !== true) {
          lastVisibility[idx] = true;
          window.pokeAPI.webviewSetVisible(idx, true);
          if (typeof window.applyWebviewSync === 'function') {
            setTimeout(() => window.applyWebviewSync(idx), 40);
          }
        }

        // Preenche credenciais automaticamente uma vez após carregar
        if (!_filledCreds && cachedAccounts[idx] && cachedAccounts[idx].email && cachedAccounts[idx].senha) {
          _filledCreds = true;
          window.pokeAPI.webviewFillCreds(idx, cachedAccounts[idx].email, cachedAccounts[idx].senha);
        }

      }

      el.__onNativeLoad = (payload) => {
        if (payload.event === 'did-start-loading') {
          el.dispatchEvent(new Event('did-start-loading'));
          return;
        }
        _src = payload.url;
        _loadedOnce = true;
        for (const type of ['did-navigate', 'did-navigate-in-page', 'dom-ready', 'did-stop-loading']) {
          const event = new Event(type);
          event.url = payload.url;
          event.isMainFrame = true;
          el.dispatchEvent(event);
        }
      };

      el.__syncBounds = syncBounds;
      el.__resolveIndex = resolveIndex;
      registeredWebviews.add(el);

      function debouncedSync() {
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(syncBounds, 80);
      }

      Object.defineProperty(el, 'src', {
        get: () => _src,
        set: (val) => {
          _src = val;
          _loadedOnce = false;
          _filledCreds = false;
          if (val && val !== 'about:blank') {
            debouncedSync();
          } else if (val === 'about:blank') {
            const idx = resolveIndex();
            if (idx >= 0) {
              lastVisibility[idx] = false;
              window.pokeAPI.webviewSetVisible(idx, false);
            }
          }
        }
      });

      Object.defineProperty(el, 'partition', {
        get: () => _partition,
        set: (val) => {
          _partition = val;
          resolveIndex();
        }
      });

      el.loadURL = (url) => {
        _src = url;
        _loadedOnce = false;
        const idx = resolveIndex();
        if (idx >= 0) {
          invoke('webview_navigate', {index: idx, url}).catch(console.error);
        }
        debouncedSync();
      };

      el.executeJavaScript = async (code) => {
        const idx = resolveIndex();
        if (idx >= 0) {
          if ((window.PawBattleHud || window.PioBattleHud)?.isBlasterActive(idx)) {
            if (code === window.READ_STATE) return window.stCache?.[idx]?.d || null;
            throw new Error('Esta ação requer abrir o jogo; conta em modo headless');
          }
          return window.pokeAPI.webviewEval(idx, code);
        }
        return null;
      };

      el.getURL = () => _src || 'https://pokeascendedworld.com/play';
      el.reload = () => {
        const idx = resolveIndex();
        if (idx >= 0) return invoke('webview_navigate', {index: idx, url: null}).catch(console.error);
      };
      el.reloadIgnoringCache = () => el.reload();
      el.setAudioMuted = (muted) => {
        const index=resolveIndex();
        if(index>=0) invoke('webview_settings', {index, muted:!!muted}).catch(console.error);
      };
      el.setZoomFactor = (zoom) => {
        const index=resolveIndex();
        if(index>=0) invoke('webview_settings', {index, zoom:Number(zoom)}).catch(console.error);
      };

      const ro = new ResizeObserver(() => debouncedSync());
      ro.observe(el);

      setTimeout(syncBounds, 200);
      setTimeout(syncBounds, 700);

      return el;
    }
    return origCreateElement(tagName, options);
  };
})();
