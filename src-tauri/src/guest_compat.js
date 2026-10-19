// Forward only the launcher's existing console protocol; never arbitrary console output.
(() => {
  if (window.top !== window || window.__pawConsoleBridge || window.__pioConsoleBridge) return;
  window.__pawConsoleBridge = window.__pioConsoleBridge = true;
  window.__pawSendConsoleMessage = (message) => {
    if (typeof message === 'string' && /^__(PGST|PGIV|PGDLG|RBZOOM|GMSET|GMXHR|PGECO|PGOPEN)__/.test(message) && message.length < 5000000) {
      const invoke = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
                     (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
      if (typeof invoke === 'function') {
        invoke('game_console_message', {message}).catch(() => {});
        return true;
      }
    }
    return false;
  };
  const log = console.log.bind(console);
  console.log = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && /^__(PGST|PGIV|PGDLG|RBZOOM|GMSET|GMXHR|PGECO|PGOPEN)__/.test(message) && message.length < 5000000) {
      window.__pawSendConsoleMessage(message);
    }
    return log(...args);
  };

  const isExternalUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const host = u.hostname.toLowerCase();
      return !host.includes('pokeascendedworld.com') &&
             !host.includes('pokeidle.io') &&
             !host.includes('idleworld.online');
    } catch {
      return false;
    }
  };

  const openExternal = (url) => {
    if (!url || typeof url !== 'string') return;
    try {
      const u = new URL(url, location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        window.__pawSendConsoleMessage('__PGOPEN__' + u.href);
      }
    } catch {}
  };
  window.__pawOpenExternal = openExternal;

  // Intercepta cliques em links de votacao/redes sociais direcionados para fora do jogo
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (isExternalUrl(href)) {
      e.preventDefault();
      e.stopPropagation();
      openExternal(href);
    }
  }, true);

  // Intercepta window.open para URLs externas (ex: TopIdle) sem retornar null
  const origOpen = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string' && isExternalUrl(url)) {
      openExternal(url);
      return {
        closed: false,
        focus: () => {},
        blur: () => {},
        close: () => {},
        location: {
          set href(val) { openExternal(val); },
          get href() { return url; }
        }
      };
    }
    const win = origOpen ? origOpen.apply(this, arguments) : null;
    return win || {
      closed: false,
      focus: () => {},
      blur: () => {},
      close: () => {},
      location: {
        set href(val) { openExternal(val); },
        get href() { return ''; }
      }
    };
  };
})();
