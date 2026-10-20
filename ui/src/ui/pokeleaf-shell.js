(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const privacyKey = 'hideAccountNames';
  let namesHidden = false;
  try { namesHidden = localStorage.getItem(privacyKey) === '1'; } catch {}
  let sidebarCollapsed = false;
  try { sidebarCollapsed = localStorage.getItem('hubSidebarCollapsed') === '1'; } catch {}
  const isPlaceholderName = (nm) => !nm || nm.startsWith('Conta ') || nm.startsWith('Personagem ') || /^Personagem\s*\d+$/i.test(nm) || /^Conta\s*\d+$/i.test(nm) || nm === '—' || nm.toLowerCase() === 'sem líder';
  const accountLabel = i => `Personagem ${String(i + 1).padStart(2, '0')}`;
  const displayName = r => {
    if (namesHidden) return accountLabel(r.i);
    if (r.name && !isPlaceholderName(r.name)) return r.name;
    if (typeof tabNames !== 'undefined' && tabNames[r.i] && !isPlaceholderName(tabNames[r.i])) return tabNames[r.i];
    if (typeof accounts !== 'undefined' && accounts[r.i]?.name && !isPlaceholderName(accounts[r.i].name)) return accounts[r.i].name;
    return r.name || `Personagem ${r.i + 1}`;
  };
  const fmtCompact = (n) => {
    n = +n || 0; const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a >= 1e9) return sg + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.0','') + 'bi';
    if (a >= 1e6) return sg + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0','') + 'M';
    if (a >= 1e3) return sg + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0','') + 'k';
    return Math.round(a).toLocaleString('pt-BR');
  };
  const getPokeName = (id) => {
    if (!id) return '';
    const num = +id;
    if (!num) return String(id);
    if (!window.__pokeCatalogMap && window.PIW_ALL_POKEMON_THEMES) {
      window.__pokeCatalogMap = new Map(window.PIW_ALL_POKEMON_THEMES.map(p => [p.dex, p.name]));
    }
    return window.__pokeCatalogMap?.get(num) || String(id);
  };
  window.getPokeName = getPokeName;
  const prettyHunt = s => {
    if (!s) return '';
    const trimmed = String(s).trim();
    if (/^\d+$/.test(trimmed)) {
      const name = getPokeName(+trimmed);
      if (name && name !== trimmed) return name;
    }
    return trimmed.replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  };
  window.prettyHunt = prettyHunt;
  const safeDex = sid => { try { return typeof dexId === 'function' ? dexId(+sid || 0) : (+sid || 0); } catch { return +sid || 0; } };
  const pokeSprite = (p) => {
    if (!p) return '';
    const sid = p.sid || p.speciesId || (+String(p.id || '').replace(/^poke_|^p/i, '')) || 0;
    const dex = safeDex(sid);
    if (p.shiny && dex) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${dex}.png`;
    }
    if (p.img && typeof p.img === 'string' && (p.img.startsWith('http') || p.img.startsWith('assets') || p.img.startsWith('/assets'))) {
      return p.img.startsWith('http') ? p.img : ('https://pokeascendedworld.com/' + p.img.replace(/^\//, ''));
    }
    if (dex) {
      return `https://pokeascendedworld.com/assets/anime/pokemon/${dex}.png`;
    }
    return '';
  };
  const getLead = (r) => {
    if (!r || !r.team || !r.team.length) return null;
    if (r.activeId != null) {
      const act = r.team.find(p => p && (String(p.id) === String(r.activeId) || String(p.uid) === String(r.activeId)));
      if (act) return act;
    }
    const ld = r.team.find(p => p && (p.ld === true || p.active === true));
    if (ld) return ld;
    const s0 = r.team.find(p => p && p.slot === 0);
    if (s0) return s0;
    return r.team[0];
  };
  const ico = (name) => {
    const icons = {
      moon:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18.6 15.8A8 8 0 0 1 8.2 5.4 8 8 0 1 0 18.6 15.8Z"/><path d="M17.5 3.5v4M15.5 5.5h4" stroke-width="1.2"/></svg>',
      grid:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
      list:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>',
      bell:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 20h4"/></svg>',
      gear:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 14.8 6L14.5 3h-5l-.3 3a7 7 0 0 0-1.7 1.1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A7 7 0 0 0 9.2 18l.3 3h5l.3-3a7 7 0 0 0 1.7-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></svg>',
      reload:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6v5h-5"/><path d="M19 11a8 8 0 1 0-2 6"/></svg>',
      hunt:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
      chart:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>',
      user:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3.2-6 7-6s6.3 2 7 6"/></svg>',
      bag:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
      simple:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
      chat:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      plus:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
      volume:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
      volumeX:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
    };
    return icons[name] || '';
  };

  function clickOld(id) { const el = document.getElementById(id); if (el) el.click(); }
  function oldOn(id) { const el = document.getElementById(id); return !!(el && el.classList.contains('on')); }

  const oldTop = document.getElementById('topbar');
  const grid = document.getElementById('grid');
  const cards = document.getElementById('cards');
  if (!oldTop || !grid) return;
  document.body.classList.toggle('absol-win', navigator.userAgent.includes('Windows'));

  // Controller vault: functionality stays, visible hierarchy is rebuilt from zero.
  const vault = document.createElement('div');
  vault.id = 'leafControlVault';
  oldTop.parentNode.insertBefore(vault, oldTop);
  vault.appendChild(oldTop);

  const shell = document.createElement('div');
  shell.id = 'leafShell';
  shell.innerHTML = `
    <a class="leaf-skip" href="#leafMain">Pular para conteúdo</a>
    <header class="leaf-topbar">
      <div class="leaf-brand">
        <div class="leaf-brand-copy"><div class="leaf-brand-title leaf-brand-logos" aria-label="PAW Nailo"><img class="leaf-paw-logo" src="src/ui/assets/paw-logo.png" alt="PAW"><span class="leaf-brand-by">by</span><img class="leaf-nailo-logo" src="src/ui/assets/nailo-logo.png" alt="Nailo"></div></div>
      </div>
      <div class="leaf-top-center">
        <button type="button" class="leaf-icon-btn" id="leafSidebarToggle" aria-controls="leafSidebar" aria-expanded="true" title="Recolher menu lateral" aria-label="Recolher menu lateral"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path class="leaf-sidebar-arrow" d="m16 9-3 3 3 3"/></svg></button>
        <div class="leaf-segment" id="leafViewTabs">
          <button data-view="windows" class="is-active" aria-pressed="true"><span style="width:13px;height:13px">${ico('grid')}</span>Janelas</button>
          <button data-view="simple" id="leafSimple" aria-pressed="false"><span style="width:13px;height:13px">${ico('simple')}</span><span class="txt-hide-sm">Simples</span></button>
        </div>
        <button class="leaf-chip" id="leafEco" aria-pressed="false"><span style="width:13px;height:13px">${ico('moon')}</span><span>Modo Eco</span><span class="switch" aria-hidden="true"></span></button>
        <button class="leaf-chip" id="leafHuntOnly"><span style="width:13px;height:13px">${ico('hunt')}</span><span class="txt-hide-sm">Só a caça</span></button>
        <button class="leaf-chip is-active" id="leafAudio" aria-pressed="true" title="Som do jogo: Ativado (clique para mutar)"><span id="leafAudioIcon" style="width:13px;height:13px">${ico('volume')}</span><span id="leafAudioLabel" class="txt-hide-sm">Som</span><span class="switch" aria-hidden="true"></span></button>
      </div>
      <div class="leaf-top-right">
        <button class="leaf-chip leaf-chip-update" id="leafHeaderUpdate" style="display:none !important;" title="Nova versão disponível">
          <span style="font-size:12px">🚀</span><span id="leafUpdateText" class="txt-hide-sm">Atualização</span>
        </button>
        <div class="leaf-connected"><span class="dot"></span><span id="leafConnectedText">0/0 conectadas</span></div>
        <button class="leaf-chip leaf-chip-login-all" id="leafHeaderLoginAll" title="Logar equipe"><span>▶</span><span>Logar equipe</span></button>
      </div>
      <div class="leaf-window-controls" role="group" aria-label="Controles da janela">
        <button type="button" data-window-action="minimize" title="Minimizar" aria-label="Minimizar"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
        <button type="button" data-window-action="maximize" title="Restaurar" aria-label="Restaurar"><svg class="win-max-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx=".7"/></svg><svg class="win-restore-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4V2.5h8v8H12M3 5.5h8v8H3z"/></svg></button>
        <button type="button" data-window-action="close" title="Fechar" aria-label="Fechar"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button>
      </div>
    </header>
    <div class="leaf-body">
      <aside class="leaf-sidebar" id="leafSidebar" aria-label="Equipe e resumo">
        <div class="leaf-summary">
          <div class="leaf-summary-item"><div class="k">No jardim</div><div class="v good" id="leafKpiOnline">0/0</div></div>
          <div class="leaf-summary-item"><div class="k">Bolas</div><div class="v" id="leafKpiBalls">—</div></div>
          <div class="leaf-summary-item"><div class="k">Atenção</div><div class="v" id="leafKpiAttention">0</div></div>
        </div>
        <div class="leaf-sidebar-title"><span>Equipe em campo</span><span class="leaf-sidebar-rule"></span><button class="leaf-add-account" id="leafAddAccount" title="Treinadores / Conta do Jogo" aria-label="Editar treinadores e conta">${ico('user')}<span>Treinadores</span></button></div>
        <div id="leafAccountList"></div>
        <div class="leaf-side-footer">
          <button class="leaf-login-all" id="leafLoginAll">⇥ &nbsp; Logar equipe</button>
        </div>
        <div class="leaf-version" id="leafVersion">PawNailo</div>
      </aside>
      <main class="leaf-main" id="leafMain" tabindex="-1">
        <section id="leafWindowView" class="leaf-view"><h1 class="leaf-sr-only">Janelas dos personagens</h1></section>
        <section id="leafListView" class="leaf-view" hidden>
          <div class="leaf-page-head"><div><h1>Seus personagens</h1><p>Acompanhe o time e o rendimento sem abrir cada janela.</p></div><div class="leaf-page-count" id="leafListCount">0 personagens</div></div>
          <div id="leafListRows"></div>
        </section>
      </main>
    </div>
    <div id="pawUpdaterOverlay" class="paw-modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="pawUpdaterTitle">
      <div class="paw-modal-content">
        <div class="paw-modal-head">
          <h2 id="pawUpdaterTitle">🚀 Nova versão disponível!</h2>
          <button type="button" class="paw-modal-close" id="pawUpdaterClose" aria-label="Fechar">✕</button>
        </div>
        <p class="paw-modal-desc" id="pawUpdaterDesc">Uma versão mais recente do PAW Nailo está disponível no GitHub.</p>
        <div id="pawUpdaterNotes" class="paw-modal-notes" style="display:none;"></div>
        <div id="pawUpdaterProgress" class="paw-progress-container" style="display:none;">
          <div class="paw-progress-meta">
            <span id="pawUpdaterProgressLabel">Baixando atualização...</span>
            <span id="pawUpdaterProgressPct">0%</span>
          </div>
          <div class="paw-progress-track">
            <div id="pawUpdaterProgressBar" class="paw-progress-fill" style="width:0%;"></div>
          </div>
        </div>
        <div id="pawUpdaterError" class="paw-modal-error" style="display:none;"></div>
        <div class="paw-modal-actions" id="pawUpdaterActions">
          <button type="button" class="paw-btn-secondary" id="pawUpdaterDismiss">Lembrar mais tarde</button>
          <button type="button" class="paw-btn-primary" id="pawUpdaterApply">Atualizar e Reiniciar</button>
        </div>
      </div>
    </div>`;
  document.body.insertBefore(shell, document.body.firstChild);
  $('#leafWindowView').appendChild(grid);
  if (cards) $('#leafWindowView').appendChild(cards);

  const maximizeButton = $('.leaf-window-controls [data-window-action="maximize"]');
  function showMaximized(maximized) {
    if (!maximizeButton) return;
    maximizeButton.classList.toggle('is-maximized', maximized);
    maximizeButton.title = maximized ? 'Restaurar' : 'Maximizar';
    maximizeButton.setAttribute('aria-label', maximized ? 'Restaurar' : 'Maximizar');
  }
  if (window.pokeAPI?.windowControl) {
    $$('.leaf-window-controls button').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = button.dataset.windowAction;
        if (!action) return;
        window.pokeAPI.windowControl(action).then(state => {
          if (state && action === 'maximize') showMaximized(!!state.maximized);
        }).catch(() => {});
      });
    });
    window.pokeAPI.onWindowMaximized?.(showMaximized);
    window.pokeAPI.windowControl('state').then(state => { if (state) showMaximized(!!state.maximized); }).catch(() => {});
  }



  function syncSidebar() {
    const sidebar = $('#leafSidebar');
    const toggle = $('#leafSidebarToggle');
    const label = sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';
    if (sidebarCollapsed && sidebar.contains(document.activeElement)) toggle.focus();
    document.body.classList.toggle('leaf-sidebar-collapsed', sidebarCollapsed);
    sidebar.inert = sidebarCollapsed;
    sidebar.setAttribute('aria-hidden', String(sidebarCollapsed));
    toggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    try { localStorage.setItem('hubSidebarCollapsed', sidebarCollapsed ? '1' : '0'); } catch {}
    syncSidebar();
  }
  $('#leafSidebarToggle').onclick = toggleSidebar;
  syncSidebar();

  function syncGameHudHint() {}

  // buttons proxy the mature application logic instead of duplicating it.
  $('#leafEco').onclick = () => clickOld('eco');
  $('#leafHuntOnly').onclick = () => clickOld('cleanHud');
  const audioBtn = $('#leafAudio');
  if (audioBtn) {
    audioBtn.onclick = () => {
      if (typeof window.toggleGameMuted === 'function') {
        window.toggleGameMuted();
      } else {
        clickOld('audioToggle');
      }
      syncAudioState();
    };
  }
  const triggerLoginAll = () => clickOld('loginAll');
  $('#leafLoginAll').onclick = triggerLoginAll;
  const topLoginBtn = $('#leafLoginAllTop');
  if (topLoginBtn) topLoginBtn.onclick = triggerLoginAll;
  const headerLoginBtn = $('#leafHeaderLoginAll');
  const reloadAllBtn = $('#leafReloadAll');
  if (reloadAllBtn) reloadAllBtn.onclick = () => clickOld('reloadAll');
  const handleOpenAccounts = () => {
    if (typeof openAccounts === 'function') openAccounts();
    else clickOld('accounts');
  };
  const accountsFooter = $('#leafAccountsFooter');
  if (accountsFooter) accountsFooter.onclick = handleOpenAccounts;
  const addAccountBtn = $('#leafAddAccount');
  if (addAccountBtn) addAccountBtn.onclick = handleOpenAccounts;

  function closeSurfaces() {
    document.body.classList.remove('leaf-tools-open', 'leaf-settings-open');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSurfaces(); });

  const lsPick = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsPut = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
  let lastPlainView = 'windows';
  let currentView = 'windows';
  // Simples é uma vista, então o estado real é cardsOn (index.html), não só a classe do botão.
  const simpleIsOn = () => oldOn('cardsBtn') || (typeof cardsOn !== 'undefined' && !!cardsOn);

  function paintTabs(view) {
    currentView = (view === 'simple') ? 'simple' : 'windows';
    $$('#leafViewTabs button').forEach(b => { const selected = b.dataset.view === currentView; b.classList.toggle('is-active', selected); b.setAttribute('aria-pressed', String(selected)); });
    $('#leafWindowView').hidden = false;
    const lv = $('#leafListView'); if (lv) lv.hidden = true;
  }

  function setView(view, animate = false) {
    if (view === 'list') view = 'windows';
    const plain = view === 'windows';
    // Grupo exclusivo Janelas/Simples: alternar para o Simples liga cardsOn preservando o Modo Eco,
    // e sair dele desliga cardsOn mantendo o Modo Eco no estado anterior.
    if (view === 'simple') { if (!simpleIsOn()) clickOld('cardsBtn'); }
    else if (simpleIsOn()) clickOld('cardsBtn');
    paintTabs(view);
    if (plain) { lastPlainView = 'windows'; lsPut('leafViewLast', 'windows'); }
    lsPut('leafView', view);
    document.dispatchEvent(new CustomEvent('piw-view-changed', { detail: { view } }));
  }
  $$('#leafViewTabs button').forEach(b => b.onclick = e => setView(b.dataset.view, e.detail !== 0));
  window.PawView = window.PIWView = { set: (view) => setView(view), current: () => currentView };

  const states = new Map();
  function hasLiveTelemetry(r) {
    return Boolean(r && r.ok && r.live !== false && r.disconnected !== true &&
      (r.live === true || r.level > 0 || r.hunt || (r.a && (r.a.seconds > 0 || r.a.kills > 0)) || (r.team && r.team.length > 0)));
  }
  function baseState(i) {
    const hasCreds = Boolean(typeof accounts !== 'undefined' && accounts[i] && accounts[i].email && accounts[i].senha);
    const n = (typeof accounts !== 'undefined' && accounts[i] && accounts[i].name) || (typeof stName === 'function' ? stName(i) : `Personagem ${i+1}`);
    return { i, ballsKnown:false, inventoryKnown:false, name:n, st:(!hasCreds || (typeof off !== 'undefined' && off[i])) ? 'off' : 'wait', level:0, balls:0, gold:0, hunt:'', a:{}, team:[] };
  }
  function stateStatus(r) {
    const hasCreds = Boolean(typeof accounts !== 'undefined' && accounts[r?.i] && accounts[r.i].email && accounts[r.i].senha);
    if (!hasCreds || (typeof off !== 'undefined' && off[r?.i])) return ['off','Desligado'];
    const isLive = hasLiveTelemetry(r);
    if (!isLive) {
      const dot = grid.children[r?.i]?.querySelector('.panel-header .dot');
      return dot?.classList.contains('err') ? ['err','Erro'] : ['wait','Conectando'];
    }
    return ['live','Online'];
  }
  function attention(r) {
    if (!r || !r.ok) return false;
    const bInf = Boolean((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞'));
    if (r.ballsKnown !== false && !bInf && (+r.balls || 0) < 100) return true;
    const lead=getLead(r);
    return !!(lead && lead.hm > 0 && lead.hp <= 0);
  }
  async function collectOne(i) {
    const pc = (typeof stCache !== 'undefined' ? stCache[i] : null) || (window.stCache ? window.stCache[i] : null);
    let d = pc && pc.d && pc.d.ok ? pc.d : null;
    try {
      const hasTelemetry = pc && pc.d && pc.d.ok && (
        (pc.d.hunt && pc.d.hunt !== 'centro') ||
        (pc.d.team && pc.d.team.length > 0) ||
        (pc.d.level > 0) ||
        (pc.d.a && (pc.d.a.seconds > 0 || pc.d.a.kills > 0 || (pc.d.a.xpg != null && pc.d.a.xpg > 0)))
      );
      if (hasTelemetry && Date.now() - pc.t < 30000) {
        d = pc.d;
      } else if (typeof webviews !== 'undefined' && webviews[i] && !(typeof off !== 'undefined' && off[i])) {
        if (typeof readPanelState === 'function') {
          d = await readPanelState(i);
        } else {
          const rs = (typeof READ_STATE !== 'undefined' ? READ_STATE : null) || window.READ_STATE;
          if (rs) d = await webviews[i].executeJavaScript(rs);
        }
        const latest = (typeof stCache !== 'undefined' ? stCache[i] : null) || window.stCache?.[i];
        if (latest !== pc) d = latest?.d?.ok ? latest.d : null;
        if (d && d.ok && d !== latest?.d) {
          const s = (typeof stSane === 'function' ? stSane(d) : null) || (window.stSane ? window.stSane(d) : null) || d;
          if (pc && pc.d && pc.d.ok && (!s.cid || !pc.d.cid || String(s.cid) === String(pc.d.cid))) {
            if (s.team == null && pc.d.team) s.team = pc.d.team;
            if (s.balls == null && s.ballsKnown === undefined && s.ballMap === undefined && pc.d.ballsKnown !== false && pc.d.balls != null) {
              s.balls = pc.d.balls;
              s.ballMap = pc.d.ballMap;
              s.equippedBall = pc.d.equippedBall;
              s.ballsKnown = pc.d.ballsKnown;
            }
            if (isPlaceholderName(s.name) && pc.d.name && !isPlaceholderName(pc.d.name)) s.name = pc.d.name;
            if (s.hunt == null && pc.d.hunt) s.hunt = pc.d.hunt;
            if (s.level == null && pc.d.level) s.level = pc.d.level;
            if (typeof s.live !== 'boolean' && s.disconnected !== true && typeof pc.d.live === 'boolean') s.live = pc.d.live;
          }
          if (typeof stCache !== 'undefined') stCache[i] = { t: Date.now(), d: s };
          if (window.stCache) window.stCache[i] = { t: Date.now(), d: s };
          d = s;
        } else if ((!d || !d.ok) && latest === pc && pc && pc.d && pc.d.ok) {
          d = pc.d;
        }
      } else if (pc && pc.d && pc.d.ok) {
        d = pc.d;
      }
    } catch {
      const latest = (typeof stCache !== 'undefined' ? stCache[i] : null) || window.stCache?.[i];
      d = latest?.d?.ok ? latest.d : null;
    }
    if (!d || !d.ok) d = baseState(i); else d.i = i;
    if (d.name && !isPlaceholderName(d.name)) {
      if (typeof tabNames !== 'undefined') tabNames[i] = d.name;
      if (typeof accounts !== 'undefined' && accounts[i] && (isPlaceholderName(accounts[i].name) || accounts[i].name !== d.name)) {
        accounts[i].name = d.name;
        if (typeof save === 'function') save();
        window.pokeAPI?.saveCreds?.(accounts);
      }
    }
    states.set(i,d);
    return d;
  }
  let collecting = false;
  async function collectAll() {
    if (collecting || document.hidden) return;
    collecting = true;
    try {
      const n = typeof count !== 'undefined' ? count : (typeof webviews !== 'undefined' ? webviews.length : 0);
      const indices = [];
      for (let i = 0; i < n; i++) indices.push(i);
      const arr = await Promise.all(indices.map(i => collectOne(i)));
      if (typeof janelaOculta === 'undefined' || !janelaOculta) renderAll(arr);
    } finally { collecting = false; }
  }

  function renderAll(arr) {
    const online = arr.filter(hasLiveTelemetry).length;
    let balls = 0, inf = false, att = 0, known = 0;
    arr.forEach(x => {
      if (x.ballsKnown !== false) known++;
      const bInf = Boolean((x.equippedBall && x.equippedBall.infinite) || (x.balls === '∞'));
      if (bInf) inf = true;
      else balls += +x.balls || 0;
      if (attention(x)) att++;
    });
    const Perf = window.NailoPerformance;
    Perf.setText($('#leafKpiOnline'), `${online}/${arr.length || 0}`);
    Perf.setText($('#leafKpiBalls'), known === 0 ? '—' : ((inf && balls === 0) ? '∞' : (inf ? `${fmtCompact(balls)}+∞` : fmtCompact(balls))));
    Perf.setText($('#leafKpiAttention'), att);
    $('#leafKpiAttention').classList.toggle('warn',att>0);
    Perf.setText($('#leafConnectedText'), `${online}/${arr.length || 0} conectados`);
    Perf.setText($('#leafListCount'), `${arr.length} personagem${arr.length===1?'':'s'}`);
    renderSidebar(arr);
    decoratePanels(arr);
    if (!$('#leafListView').hidden) renderList(arr);
    syncToggles();
    if (typeof syncWindowCount === 'function') syncWindowCount();
    if (typeof syncLayoutMode === 'function') syncLayoutMode();
  }

  let sidebarMarkup = '';
  // Reconcile the small account subtree so timed metrics do not recreate sprites,
  // buttons and their DOM every telemetry tick.
  function patchAccountNode(current, next) {
    if (!current || !next || current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || (current.className || '') !== (next.className || '')) {
      current?.replaceWith(next.cloneNode(true)); return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of Array.from(current.attributes)) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    for (const attr of Array.from(next.attributes)) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
    const oldChildren = Array.from(current.childNodes), newChildren = Array.from(next.childNodes);
    for (let i = 0; i < newChildren.length; i++) {
      if (!oldChildren[i]) current.appendChild(newChildren[i].cloneNode(true));
      else patchAccountNode(oldChildren[i], newChildren[i]);
    }
    for (let i = newChildren.length; i < oldChildren.length; i++) oldChildren[i].remove();
  }
  function renderSidebar(arr) {
    const root = $('#leafAccountList');
    const filteredArr = arr.filter(r => (r.i != null ? r.i : 0) >= 0 && (r.i != null ? r.i : 0) < 4);
    const markup = filteredArr.map(r => {
        const dividerMarkup = '';
        const [sc,sl] = stateStatus(r); const a = r.a || {};
        const lead=getLead(r); const spr=pokeSprite(lead); const hunt=prettyHunt(r.hunt)||'Aguardando dados da caça';
        const leadSid = lead ? (lead.sid || lead.speciesId || (+String(lead.id || '').replace(/^poke_|^p/i, '')) || (+String(lead.name || '').replace('#', '')) || 0) : 0;
        const resolvedLeadName = (typeof getPokeName === 'function' && leadSid > 0) ? getPokeName(leadSid) : '';
        const leadPokeName = (lead && lead.name && lead.name !== 'Líder' && lead.name !== 'Sem líder' && !lead.name.startsWith('#')) ? lead.name : (resolvedLeadName || (lead && lead.name) || 'Pokémon');
        const selected = !!grid.children[r.i]?.classList.contains('expanded');
        return `${dividerMarkup}<article class="leaf-account state-${sc} ${r.ok?'is-live':''} ${attention(r)?'is-attention':''} ${selected?'is-selected':''}" data-i="${r.i}">
          <div class="leaf-account-top">
            <span class="leaf-account-number">${String(r.i+1).padStart(2,'0')}</span>
            <div class="leaf-poke-avatar">${spr?`<img src="${spr}" width="42" height="42" alt="" onerror="this.remove()">`:ico('user')}</div>
            <div class="leaf-account-identity"><div class="leaf-account-name">${escH(displayName(r))}</div><div class="leaf-pokemon-line">${lead?`Nv ${escH(lead.level||'—')} <span>·</span> <b>${escH(leadPokeName||'Sem líder')}</b>`:'Time ainda não carregado'}</div></div>
            ${r.level?`<span class="leaf-lv">NV ${escH(r.level)}</span>`:''}
            <div class="leaf-account-state ${sc}">${sl}</div>
          </div>
          <div class="leaf-hunt-row"><span class="leaf-hunt-glyph">${ico('hunt')}</span><span class="leaf-hunt-name">Em caça <b>${escH(hunt)}</b></span><span class="leaf-hunt-time">${(a.seconds || r.sessStart) ? ((s => Math.floor(s/3600)+'h '+String(Math.floor(s%3600/60)).padStart(2,'0')+'m')(a.seconds || Math.max(0, Math.floor((Date.now() - r.sessStart) / 1000)))) : '—'}</span></div>
          <div class="leaf-account-metrics">
            <div class="leaf-metric" title="${(r.equippedBall && r.equippedBall.name) ? `${escH(r.equippedBall.name)}: ${r.ballsKnown === false ? '—' : (((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞')) ? '∞' : fmtCompact(r.balls))}` : `Bolas: ${r.ballsKnown === false ? '—' : (((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞')) ? '∞' : fmtCompact(r.balls))}`}"><div class="mk">Bolas</div><div class="mv">${r.ballsKnown === false ? '—' : (((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞')) ? '∞' : fmtCompact(r.balls))}</div></div>
            <div class="leaf-metric" title="Shiny"><div class="mk">Shiny</div><div class="mv">${a.shinyFound!=null?fmtCompact(a.shinyFound):'—'}</div></div>
            <div class="leaf-metric" title="XP/h"><div class="mk">XP/h</div><div class="mv">${(a.xph!=null||r.xph!=null)?fmtCompact(a.xph!=null?a.xph:r.xph):'—'}</div></div>
            <div class="leaf-metric" title="Kills/h"><div class="mk">Kills/h</div><div class="mv">${(a.kph!=null||r.kph!=null)?fmtCompact(a.kph!=null?a.kph:r.kph):'—'}</div></div>
          </div>
          <div class="leaf-account-actions"><button class="leaf-open-account" data-open="${r.i}" aria-pressed="${selected}"><span aria-hidden="true">${selected?'▦':'▶'}</span>${selected?'Voltar à grade':'Abrir janela'}</button><button class="leaf-reload-account" data-reload="${r.i}" title="Recarregar ${escH(displayName(r))}" aria-label="Recarregar ${escH(displayName(r))}">${ico('reload')}</button></div>
        </article>`;
      }).join('');

    if (markup === sidebarMarkup) return;
    sidebarMarkup = markup;
    const next = document.createElement('template'); next.innerHTML = markup;
    const previous = Array.from(root.children), incoming = Array.from(next.content.children);
    const oldStates = previous.map(card => card.querySelector?.('.leaf-account-state')?.className || '');
    incoming.forEach((card, i) => {
      if (previous[i]) patchAccountNode(previous[i], card);
      else root.appendChild(card);
    });
    previous.slice(incoming.length).forEach(card => card.remove());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Array.from(root.children).forEach((card,i) => {
        const status = card.querySelector?.('.leaf-account-state');
        if (oldStates[i] && status && oldStates[i] !== status.className)
          status.animate([{opacity:.45,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],{duration:190,easing:'cubic-bezier(.16,1,.3,1)'});
      });
    }
  }
  $('#leafAccountList').addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const i=+open.dataset.open; setView('windows');
      try { toggleExpand(i); renderSidebar(Array.from(states.values()).sort((a,b)=>a.i-b.i)); } catch {}
      return;
    }
    const reload = e.target.closest('[data-reload]');
    if (reload) {
      const p=grid.children[+reload.dataset.reload];
      try { p?.querySelector('.reload')?.click(); } catch {}
    }
  });

  let listMarkup = '';
  function renderList(arr) {
    arr = arr || Array.from(states.values()).sort((a,b)=>a.i-b.i);
    const markup = arr.map(r => {
      const a=r.a||{}, lead=getLead(r), spr=pokeSprite(lead);
      return `<article class="leaf-list-card" data-i="${r.i}">
        <div class="leaf-list-identity"><span class="leaf-list-index">${String(r.i+1).padStart(2,'0')}</span><div class="avatar">${spr?`<img src="${spr}" width="48" height="48" alt="" loading="lazy" onerror="this.remove()">`:ico('user')}</div>
          <div class="leaf-list-person"><div class="name">${escH(displayName(r))}</div><div class="sub">${stateStatus(r)[1]}${r.level?' · Nv '+escH(r.level):''}${lead?' · '+escH(lead.name):''}</div></div><span class="leaf-list-state ${stateStatus(r)[0]}">${stateStatus(r)[1]}</span></div>
        <div class="leaf-list-hunt"><span>Caça atual</span><b>${escH(prettyHunt(r.hunt)||'Aguardando dados')}</b></div>
        <div class="leaf-list-stats"><div class="leaf-list-cell" title="${(r.equippedBall && r.equippedBall.name) ? `${escH(r.equippedBall.name)}: ${r.ballsKnown === false ? '—' : (((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞')) ? '∞' : fmtCompact(r.balls))}` : `Bolas: ${r.ballsKnown === false ? '—' : (((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞')) ? '∞' : fmtCompact(r.balls))}`}"><div class="label">Bolas</div><div class="value">${r.ballsKnown === false ? '—' : (((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞')) ? '∞' : fmtCompact(r.balls))}</div></div>
          <div class="leaf-list-cell"><div class="label">Shiny</div><div class="value">${a.shinyFound!=null?fmtCompact(a.shinyFound):'—'}</div></div>
          <div class="leaf-list-cell"><div class="label">EXP</div><div class="value">${(a.xpg!=null||a.xp!=null||r.xp!=null)?fmtCompact(a.xpg!=null?a.xpg:(a.xp!=null?a.xp:r.xp)):'—'}</div></div>
          <div class="leaf-list-cell"><div class="label">Kills/h</div><div class="value">${(a.kph!=null||r.kph!=null)?fmtCompact(a.kph!=null?a.kph:r.kph):'—'}</div></div></div>
        <div class="leaf-list-actions"><span>${(a.gph!=null&&a.gph>0)?'Gold/h '+fmtCompact(a.gph):(r.gold!=null&&r.gold>0?'Gold '+fmtCompact(r.gold):'Sem rendimento registrado')}</span><button class="leaf-list-open" data-list-open="${r.i}">Abrir janela</button></div>
      </article>`;
    }).join('');
    if (markup === listMarkup) return;
    listMarkup = markup;
    $('#leafListRows').innerHTML = markup;
    $$('[data-list-open]').forEach(b => b.onclick=()=>{const i=+b.dataset.listOpen;setView('windows');try{if(!grid.children[i]?.classList.contains('expanded'))toggleExpand(i);renderSidebar(Array.from(states.values()).sort((a,b)=>a.i-b.i))}catch{}});
  }

  function decoratePanels(arr) {
    $$('.panel',grid).forEach((p,i) => {
      const r=arr.find(x=>x.i===i)||baseState(i);
      const hud = window.PawBattleHud || window.PioBattleHud;
      if (hud) {
        hud.mount(p, i);
        hud.update(p, i, r);
      }
      const h=$('.panel-header',p);
      if(h) {
        h.dataset.index=String(i+1).padStart(2,'0');
      }
      const name = $('.panel-header .name',p);
      if (name && !name.querySelector('input')) {
        const liveName = (r && r.name && !isPlaceholderName(r.name)) ? r.name : null;
        const tabName = (typeof tabNames !== 'undefined' && tabNames[i] && !isPlaceholderName(tabNames[i])) ? tabNames[i] : null;
        const accName = (typeof accounts !== 'undefined' && accounts[i]?.name && !isPlaceholderName(accounts[i].name)) ? accounts[i].name : null;
        const resolvedName = liveName || tabName || accName || (typeof defName === 'function' ? defName(i) : `Personagem ${i+1}`);
        const label = namesHidden ? accountLabel(i) : resolvedName;
        if (name.textContent !== label) name.textContent = label;
      }
      const reload = $('.panel-header .reload',p), expand = $('.panel-header .expand',p);
      if (reload) reload.setAttribute('aria-label',`Recarregar personagem ${i+1}`);
      if (expand) expand.setAttribute('aria-label',p.classList.contains('expanded')?`Voltar personagem ${i+1} à grade`:`Expandir personagem ${i+1}`);
      let f=$('.leaf-panel-footer',p); if(!f){ f=document.createElement('div');f.className='leaf-panel-footer';p.appendChild(f); }
      const lead=getLead(r); const spr=pokeSprite(lead);
      const leadSid = lead ? (lead.sid || lead.speciesId || (+String(lead.id || '').replace(/^poke_|^p/i, '')) || 0) : 0;
      const leadResolvedName = (typeof getPokeName === 'function' && leadSid > 0) ? getPokeName(leadSid) : '';
      const leadName = (lead && lead.name && lead.name !== 'Líder' && lead.name !== 'Sem líder' && !lead.name.startsWith('#'))
        ? lead.name
        : (leadResolvedName || (lead && lead.name) || 'Pokémon');

      if (!f.__leafInit) {
        f.innerHTML = `<div class="pf-lead"><div class="pf-sprite-frame"><span class="pf-orbit" aria-hidden="true">◎</span></div><span class="pf-lead-name"></span></div><div class="pf-divider" aria-hidden="true"></div><div class="pf-hunt"><span class="pf-hunt-tag">CAÇA ATUAL</span><b class="pf-hunt-val"></b></div><span class="pf-spacer"></span><div class="pf-balls"><span class="pf-balls-tag">BOLAS</span><b class="pf-balls-val"></b></div>`;
        f.__leafInit = true;
      }
      if (f.__leafSprite !== spr) {
        const frame = $('.pf-sprite-frame', f);
        if (frame) {
          frame.innerHTML = spr ? `<img class="pf-sprite" src="${spr}" width="22" height="22" alt="" onerror="this.remove()">` : `<span class="pf-orbit" aria-hidden="true">◎</span>`;
        }
        f.__leafSprite = spr;
      }
      const leadEl = $('.pf-lead-name', f);
      if (leadEl && leadEl.textContent !== leadName) leadEl.textContent = lead ? leadName : 'Sem líder';
      const leadBox = $('.pf-lead', f);
      if (leadBox) leadBox.title = lead ? `Líder: ${leadName}${lead.level ? ` (Nv ${lead.level})` : ''}` : 'Sem líder na equipe';

      const huntText = prettyHunt(r.hunt)||'Aguardando dados';
      const bInf = Boolean((r.equippedBall && r.equippedBall.infinite) || (r.balls === '∞'));
      const ballsText = r.ballsKnown === false ? '—' : (bInf ? '∞' : fmtCompact(r.balls));
      const huntEl = $('.pf-hunt-val', f) || $('.pf-hunt b', f);
      const ballsEl = $('.pf-balls-val', f) || $('.pf-balls b', f);
      if (huntEl && huntEl.textContent !== huntText) huntEl.textContent = huntText;
      if (ballsEl && ballsEl.textContent !== ballsText) ballsEl.textContent = ballsText;
      const huntBox = $('.pf-hunt', f); if (huntBox) huntBox.title = `Caça atual: ${huntText}`;
      const ballsBox = $('.pf-balls', f); if (ballsBox) ballsBox.title = (r.equippedBall && r.equippedBall.name) ? `${r.equippedBall.name}: ${ballsText}` : `Bolas: ${ballsText}`;
    });
    try{const value=String(arr.length||1);if(grid.style.getPropertyValue('--leaf-panels')!==value)grid.style.setProperty('--leaf-panels',value);}catch{}
  }

  function syncAudioState() {
    const audioBtn = $('#leafAudio');
    if (!audioBtn) return;
    const isMuted = (typeof window.getGameMuted === 'function') ? window.getGameMuted() : (localStorage.getItem('gameMuted') === '1');
    const isUnmuted = !isMuted;
    audioBtn.classList.toggle('is-active', isUnmuted);
    audioBtn.setAttribute('aria-pressed', String(isUnmuted));
    audioBtn.title = isUnmuted ? 'Som do jogo: Ativado (clique para mutar)' : 'Som do jogo: Mutado (clique para desmutar)';
    const iconSpan = $('#leafAudioIcon');
    if (iconSpan) {
      iconSpan.innerHTML = ico(isUnmuted ? 'volume' : 'volumeX');
    }
    const labelSpan = $('#leafAudioLabel');
    if (labelSpan) {
      labelSpan.textContent = isUnmuted ? 'Som' : 'Mudo';
    }
  }

  function syncToggles(){
    syncGameHudHint();
    const Perf = window.NailoPerformance;
    const pairs=[['leafEco','eco'],['leafHuntOnly','cleanHud'],['leafSimple','cardsBtn']];
    pairs.forEach(([a,b])=>{const x=$('#'+a);if(x){const active=oldOn(b);x.classList.toggle('is-active',active);Perf.setAttribute(x,'aria-pressed',active);}});
    // Vista exclusiva: mudanças de cardsOn fora do setView (atalho, clique na linha, Caça) repintam as abas.
    const simpleOn = simpleIsOn();
    if (simpleOn && currentView !== 'simple') setView('simple');
    else if (!simpleOn && currentView === 'simple') setView(lastPlainView);
    const ecoChip = $('#leafEco');
    if (ecoChip && ecoChip.hasAttribute('aria-disabled')) {
      ecoChip.removeAttribute('aria-disabled');
      ecoChip.title = '';
    }
    syncAudioState();
  }

  const updateLeafVersion = () => {
    const avEl = document.getElementById('appVer');
    const lv = $('#leafVersion');
    if (!lv) return;
    const v = (avEl && avEl.textContent) ? avEl.textContent.trim() : (window.pokeAPI?.appVersion ? ('v' + window.pokeAPI.appVersion) : '');
    lv.textContent = v ? ('PawNailo ' + v) : 'PawNailo';
  };
  updateLeafVersion();
  const av = document.getElementById('appVer');
  if (av) new MutationObserver(updateLeafVersion).observe(av, { childList: true, characterData: true, subtree: true });
  const obs = new MutationObserver(()=>syncToggles()); obs.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:false});
  ['eco','cleanHud','dock','cardsBtn','chat','audioToggle'].forEach(id=>{const e=document.getElementById(id);if(e)new MutationObserver(syncToggles).observe(e,{attributes:true,attributeFilter:['class']});});
  document.addEventListener('paw-audio-muted-changed', syncAudioState);
  syncToggles();

  // Original build/setCount can add/remove panels later. Decorate new panels and refresh immediately.
  let gridRefresh = 0;
  const gridObs = new MutationObserver(() => { clearTimeout(gridRefresh); gridRefresh = setTimeout(collectAll, 100); });
  gridObs.observe(grid,{childList:true});
  grid.addEventListener('click', e => { if (e.target.closest('.expand')) renderSidebar(Array.from(states.values()).sort((a,b)=>a.i-b.i)); });
  setTimeout(collectAll,250);
  setInterval(collectAll,3500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) collectAll(); });
  document.addEventListener('piw-account-removed', (e) => {
    const idx = e.detail?.index;
    if (typeof idx === 'number' && states.has(idx)) {
      states.set(idx, baseState(idx));
      const arr = Array.from(states.values()).sort((a,b) => a.i - b.i);
      renderSidebar(arr);
      decoratePanels(arr);
      if (!$('#leafListView').hidden) renderList(arr);
    }
  });
  document.addEventListener('piw-window-count-changed', () => {
    for (const i of states.keys()) if (i >= count) states.delete(i);
    if (typeof syncWindowCount === 'function') syncWindowCount();
    collectAll();
  });
  let renderRaf = 0;
  function scheduleRenderAll() {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      const arr = Array.from(states.values()).sort((a,b) => (a.i ?? 0) - (b.i ?? 0));
      renderAll(arr);
    });
  }
  document.addEventListener('paw-telemetry-update', (e) => {
    const { index, state } = e.detail || {};
    if (typeof index === 'number' && state && (typeof count === 'undefined' || index < count)) {
      state.i = index;
      states.set(index, state);
      scheduleRenderAll();
    }
  });
  window.pokeAPI?.onJanela?.(visible => { if (visible) collectAll(); });
  document.documentElement.dataset.theme = 'paw';
  document.body.dataset.theme = 'paw';
  // Restaura a vista persistida (Janelas/Lista/Simples). O cardsOn do index é a fonte de verdade
  // do Simples; se ele estiver ligado a vista é Simples, senão vale a última vista normal salva.
  const wantSimple = simpleIsOn();
  if (wantSimple && !oldOn('cardsBtn') && typeof applyCards === 'function') { try { applyCards(); } catch { } }
  setView(wantSimple ? 'simple' : 'windows');

  // -------------------------------------------------------------
  // Auto Updater
  // -------------------------------------------------------------
  let currentUpdate = null;
  const updateBtn = $('#leafHeaderUpdate');
  const updateText = $('#leafUpdateText');
  const updateOverlay = $('#pawUpdaterOverlay');
  const updateClose = $('#pawUpdaterClose');
  const updateDismiss = $('#pawUpdaterDismiss');
  const updateApply = $('#pawUpdaterApply');
  const updateDesc = $('#pawUpdaterDesc');
  const updateNotes = $('#pawUpdaterNotes');
  const updateProgress = $('#pawUpdaterProgress');
  const updateProgressBar = $('#pawUpdaterProgressBar');
  const updateProgressPct = $('#pawUpdaterProgressPct');
  const updateProgressLabel = $('#pawUpdaterProgressLabel');
  const updateError = $('#pawUpdaterError');

  function openUpdateModal() {
    if (!currentUpdate) return;
    if (updateDesc) {
      updateDesc.textContent = `A versão v${currentUpdate.latest_version} está pronta para instalação (versão atual: v${currentUpdate.current_version}).`;
    }
    if (updateNotes) {
      if (currentUpdate.release_notes) {
        updateNotes.textContent = currentUpdate.release_notes;
        updateNotes.style.display = 'block';
      } else {
        updateNotes.style.display = 'none';
      }
    }
    if (updateProgress) updateProgress.style.display = 'none';
    if (updateError) updateError.style.display = 'none';
    if (updateApply) {
      updateApply.disabled = false;
      updateApply.textContent = 'Atualizar e Reiniciar';
    }
    if (updateDismiss) updateDismiss.disabled = false;
    if (updateOverlay) {
      updateOverlay.classList.add('show');
      updateOverlay.style.display = 'flex';
    }
    if (window.pokeAPI?.webviewSetVisible) {
      for (let i = 0; i < 4; i++) window.pokeAPI.webviewSetVisible(i, false);
    }
    document.dispatchEvent(new CustomEvent('leaf-modal-toggle', { detail: { open: true } }));
  }

  function closeUpdateModal() {
    if (updateApply?.disabled && updateProgress?.style.display === 'block') {
      return; // Em download
    }
    if (updateOverlay) {
      updateOverlay.classList.remove('show');
      updateOverlay.style.display = 'none';
    }
    document.dispatchEvent(new CustomEvent('leaf-modal-toggle', { detail: { open: false } }));
    if (window.pokeAPI?.webviewSetVisible) {
      for (let i = 0; i < 4; i++) window.pokeAPI.webviewSetVisible(i, true);
    }
  }

  updateBtn?.addEventListener('click', openUpdateModal);
  updateClose?.addEventListener('click', closeUpdateModal);
  updateDismiss?.addEventListener('click', closeUpdateModal);
  updateOverlay?.addEventListener('click', (e) => {
    if (e.target === updateOverlay) closeUpdateModal();
  });

  updateApply?.addEventListener('click', async () => {
    if (!currentUpdate?.download_url) return;
    if (updateApply) updateApply.disabled = true;
    if (updateDismiss) updateDismiss.disabled = true;
    if (updateProgress) updateProgress.style.display = 'block';
    if (updateError) updateError.style.display = 'none';
    if (updateProgressLabel) updateProgressLabel.textContent = 'Baixando atualização...';
    if (updateProgressBar) updateProgressBar.style.width = '0%';
    if (updateProgressPct) updateProgressPct.textContent = '0%';

    try {
      await window.pokeAPI.applyUpdate(currentUpdate.download_url);
    } catch (err) {
      if (updateError) {
        updateError.textContent = 'Falha ao atualizar: ' + (err?.message || String(err));
        updateError.style.display = 'block';
      }
      if (updateApply) {
        updateApply.disabled = false;
        updateApply.textContent = 'Tentar novamente';
      }
      if (updateDismiss) updateDismiss.disabled = false;
    }
  });

  window.pokeAPI?.onUpdateProgress?.((p) => {
    if (!p) return;
    const pct = Math.round(p.percent || 0);
    if (updateProgressBar) updateProgressBar.style.width = `${pct}%`;
    if (updateProgressPct) updateProgressPct.textContent = `${pct}%`;
    if (pct >= 100) {
      if (updateProgressLabel) updateProgressLabel.textContent = 'Instalando e reiniciando...';
    }
  });

  async function checkForUpdates() {
    if (!window.pokeAPI?.checkUpdate) return;
    try {
      const res = await window.pokeAPI.checkUpdate();
      if (res && res.update_available && res.download_url) {
        currentUpdate = res;
        if (updateBtn) {
          updateBtn.classList.add('has-update');
          if (updateText) updateText.textContent = `v${res.latest_version}`;
          updateBtn.title = `Nova versão v${res.latest_version} disponível! Clique para atualizar.`;
        }
      } else {
        currentUpdate = null;
        if (updateBtn) {
          updateBtn.classList.remove('has-update');
        }
      }
    } catch (e) {
      console.warn('Verificação de atualização falhou:', e);
      currentUpdate = null;
      if (updateBtn) {
        updateBtn.classList.remove('has-update');
      }
    }
  }

  setTimeout(checkForUpdates, 3000);
  setInterval(checkForUpdates, 2 * 60 * 60 * 1000);
})();
