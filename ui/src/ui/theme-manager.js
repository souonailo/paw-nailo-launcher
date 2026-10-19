// PAW Nailo — Tema Oficial Poke Ascended World
(() => {
  'use strict';

  try {
    localStorage.removeItem('piw_theme');
    localStorage.removeItem('piw_pokemon_lock');
  } catch {}

  const PAW_THEME = {
    id: 'paw',
    name: 'Poke Ascended World',
    tone: 'dark',
    brandTitle: 'PAW <span>NAILO</span>',
    brandSub: 'POKE ASCENDED WORLD'
  };

  function applyPaw() {
    if (document.documentElement) {
      document.documentElement.dataset.theme = 'paw';
      document.documentElement.dataset.themeTone = 'dark';
    }
    if (document.body) {
      document.body.dataset.theme = 'paw';
      document.body.dataset.themeTone = 'dark';
    }
  }

  applyPaw();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPaw);
  }

  window.PawThemeManager = window.PIWThemeManager = {
    getThemes: () => [PAW_THEME],
    getTheme: () => PAW_THEME,
    getCurrentTheme: () => PAW_THEME,
    setTheme: () => PAW_THEME,
    selectTheme: () => Promise.resolve(PAW_THEME),
    setPokemonLocked: () => {},
    getLockedPokemonId: () => '',
    mountSelector: () => {}
  };
})();
