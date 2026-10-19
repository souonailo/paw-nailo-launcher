// Use the game's own Economy controls only while its view is hidden.
// No hunting, purchasing, reconnecting or socket suspension occurs here.
(() => {
  if (window.top !== window || (!['https://pokeidle.io', 'https://pokeascendedworld.com'].includes(location.origin)) || window.__idleioBackgroundEconomy) return;
  const preference = 'cfg-economia', marker = '__idleio_auto_economy_v1';
  let requestedHidden = false, owned = false, previous = null, retry;
  let capturing = false, capturePrevious = null;
  let manualPreference = null;
  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {} };
  // Restore a transient setting left by a crash before the game reads preferences.
  try {
    const saved = JSON.parse(get(marker) ?? 'null');
    if (saved?.version === 1 && [null, '0'].includes(saved.previous) && get(preference) === '1') set(preference, saved.previous);
  } catch {}
  set(marker, null);
  function cancelRetry() { if (retry !== undefined) clearTimeout(retry); retry = undefined; }
  function apply() {
    cancelRetry();
    if (capturing) {
      if (get(preference) === '1') document.getElementById('eco-sair')?.click();
      return;
    }
    const hidden = requestedHidden || document.hidden;
    const app = document.getElementById('app');
    if (!app || app.classList.contains('hidden')) return;

    if (hidden) {
      if (manualPreference === '1' || get(preference) === '1') {
        owned = false; // User wants economy, background does not "own" it to cancel later
        return;
      }
      if (owned) return;
      const button = document.getElementById('hunt-eco');
      if (!button) return;
      previous = get(preference);
      if (previous !== null && previous !== '0') return; // unknown future preference format
      set(marker, JSON.stringify({ version: 1, previous }));
      button.click();
      if (get(preference) === '1') owned = true;
      else set(marker, null); // unsupported game version: do not fake Economy
    } else {
      // Unhidden (visible view in grid / window)
      if (manualPreference === '1' || (!owned && get(preference) === '1')) {
        // User explicitly wants economy ON: keep it on!
        owned = false;
        set(marker, null);
        return;
      }
      if (manualPreference === '0' || (owned && previous === '0')) {
        const button = document.getElementById('eco-sair') || document.querySelector('.eco-sair, [data-eco-sair], .btn-eco-sair');
        if (button && (get(preference) === '1' || document.documentElement.classList.contains('modo-economia'))) {
          button.click();
        } else if (document.documentElement.classList.contains('modo-economia')) {
          const eb = document.getElementById('hunt-eco');
          if (eb) eb.click();
        }
        if (get(preference) !== '1' || !document.documentElement.classList.contains('modo-economia')) {
          set(preference, '0');
          set(marker, null);
          owned = false;
          manualPreference = null;
        }
      }
    }
  }
  function schedule() { cancelRetry(); retry = setTimeout(() => { retry = undefined; apply(); }, 50); }
  window.__idleioBackgroundEconomy = {
    setUserEconomy(value) {
      const on = !!value;
      manualPreference = on ? '1' : '0';
      owned = false;
      previous = on ? '1' : '0';
      set(marker, null);
      set(preference, on ? '1' : '0');
      const hidden = requestedHidden || document.hidden;
      if (!hidden) {
        cancelRetry();
        const app = document.getElementById('app');
        if (app && !app.classList.contains('hidden')) {
          if (on) {
            const btn = document.getElementById('hunt-eco');
            if (btn && !document.documentElement.classList.contains('modo-economia')) {
              try { btn.click(); } catch (_) {}
            }
          } else {
            const btn = document.getElementById('eco-sair') || document.querySelector('.eco-sair, [data-eco-sair], .btn-eco-sair');
            if (btn) {
              try { btn.click(); } catch (_) {}
            } else if (document.documentElement.classList.contains('modo-economia')) {
              const eb = document.getElementById('hunt-eco');
              if (eb) try { eb.click(); } catch (_) {}
            }
          }
        }
      } else {
        if (on && get(preference) !== '1') {
          const btn = document.getElementById('hunt-eco');
          if (btn) try { btn.click(); } catch (_) {}
        }
      }
    },
    setCapture(value) {
      value = !!value;
      if (value === capturing) return;
      if (value) { capturePrevious = owned ? previous : get(preference); owned = false; set(marker, null); }
      capturing = value;
      if (!value) {
        if (capturePrevious === '1' && get(preference) !== '1') document.getElementById('hunt-eco')?.click();
        if (capturePrevious !== '1') set(preference, capturePrevious);
      }
      schedule();
    },
    setHidden(value) { requestedHidden = !!value; schedule(); },
    ready() { schedule(); },
    status() { return { requestedHidden, owned, economy: get(preference) === '1', documentHidden: document.hidden, manualPreference }; },
  };
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('click', event => {
    if (event.isTrusted && event.target?.closest?.('#hunt-eco,#eco-sair,#cfg-economia,[data-card-disable]')) {
      // An explicit user choice takes ownership back from the launcher.
      set(marker, null);
      owned = false;
      manualPreference = null;
      const isExit = event.target?.closest?.('#eco-sair,[data-card-disable]') ||
                     (event.target?.closest?.('button,[role="button"]') && /voltar/i.test(event.target?.closest?.('button,[role="button"]')?.textContent || ''));
      if (isExit) {
        set(preference, '0');
      }
    }
  }, true);
  function observeApp() {
    const app = document.getElementById('app');
    if (app) new MutationObserver(schedule).observe(app, { attributes: true, attributeFilter: ['class'] });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeApp, { once: true });
  else observeApp();
  window.addEventListener('load', schedule, { once: true });
  window.addEventListener('pagehide', () => {
    cancelRetry();
    if (capturing) set(preference, capturePrevious);
    else if (owned && get(preference) === '1') set(preference, previous);
    set(marker, null);
  }, { once: true });
})();
