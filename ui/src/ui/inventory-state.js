// One stock projection for gameplay reads, native telemetry and Blaster.
(() => {
  'use strict';
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const quantity = value => value === '∞' ? '∞' : (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
  const cleanMap = input => Object.fromEntries(
    Object.entries(input || {})
      .filter(([id]) => /^\d+$/.test(id) || /^[a-zA-Z0-9_\-:]+$/.test(id))
      .map(([id, value]) => [id, quantity(value)])
  );
  const names = {
    1: 'Poké Ball', 2: 'Great Ball', 3: 'Super Ball', 4: 'Ultra Ball', 5: 'Beast Ball',
    'poke-ball': 'Poké Ball', 'great-ball': 'Great Ball', 'super-ball': 'Super Ball', 'ultra-ball': 'Ultra Ball'
  };

  const POTION_GROUPS = [
    ['200', 'potion', 'potions', 'crafted:potion'],
    ['201', 'greatPotion', 'greatPotions', 'crafted:great-potion'],
    ['202', 'superPotion', 'superPotions', 'ultraPotion', 'ultraPotions', 'crafted:super-potion'],
    ['203', 'hyperPotion', 'hyperPotions', 'crafted:hyper-potion'],
    ['204', 'maxPotion', 'maxPotions', 'crafted:max-potion'],
    ['goldenPotion', 'goldenPotions']
  ];

  const REVIVE_GROUPS = [
    ['205', 'revive', 'revives', 'crafted:revive'],
    ['206', 'maxRevive', 'maxRevives', 'crafted:max-revive']
  ];

  function sumGroups(map, groups) {
    let sum = 0;
    for (const group of groups) {
      for (const k of group) {
        if (own(map, k)) {
          sum += (Number(map[k]) || 0);
          break;
        }
      }
    }
    return sum;
  }

  function project(state) {
    if (!state) return state;
    // Legacy fixture/readers may have only precomputed KPIs; native snapshots always declare known flags.
    if (!own(state, 'ballsKnown') && !own(state, 'inventoryKnown') && !own(state, 'ballMap') && !own(state, 'invMap')) return state;
    const ballsKnown = state.ballsKnown ?? (state.ballMap != null);
    const inventoryKnown = state.inventoryKnown ?? (state.invMap != null);
    const ballMap = ballsKnown ? cleanMap(state.ballMap) : {};
    const invMap = inventoryKnown ? cleanMap(state.invMap) : {};
    const catalog = Object.fromEntries((state.ballCatalog || []).filter(b => b && b.id != null).map(b => [String(b.id), b]));
    const infinite = id => ballMap[id] === '∞' || !!(catalog[id]?.infinite || catalog[id]?.infinito) || (Number(ballMap[id]) >= 999999 && !catalog[id]?.priceGold);
    for (const id of Object.keys(ballMap)) if (infinite(id)) ballMap[id] = '∞';
    const available = id => ballMap[id] === '∞' || Number(ballMap[id]) > 0;

    let selected = [];
    if (Array.isArray(state.automation?.ballIds)) {
      selected = state.automation.ballIds.map(String);
    } else if (state.automation?.autoCaptureBall != null) {
      selected = [String(state.automation.autoCaptureBall)];
    } else if (state.automation?.captureBall != null) {
      selected = [String(state.automation.captureBall)];
    } else if (state.automation?.ball != null) {
      selected = [String(state.automation.ball)];
    }
    // PAW preferences use supply keys while the native bridge also supports legacy numeric IDs.
    const supplyIds = { balls: '1', greatBalls: '2', ultraBalls: '4', idleBalls: '5' };
    selected = selected.filter(key => key !== 'auto').map(key => {
      if (own(ballMap, key)) return key;
      const item = Object.values(catalog).find(entry => entry.key === key);
      return item ? String(item.id) : (supplyIds[key] ?? key);
    });

    let id = selected.find(available) ?? selected[0];
    if (id == null && state.lastBallId != null && own(ballMap, String(state.lastBallId))) id = String(state.lastBallId);
    if (id == null) id = Object.keys(ballMap).filter(available).sort((a,b) => Number(catalog[b]?.catchRate ?? b) - Number(catalog[a]?.catchRate ?? a))[0] ?? Object.keys(ballMap)[0];
    const equippedBall = ballsKnown && id != null ? {
      id,
      name: catalog[id]?.nome || catalog[id]?.name || names[id] || `Bola ${id}`,
      infinite: infinite(id),
      qty: infinite(id) ? 999999 : (Number(ballMap[id]) || 0)
    } : null;

    const totalPotions = sumGroups(invMap, POTION_GROUPS);
    const totalRevives = sumGroups(invMap, REVIVE_GROUPS);

    return {
      ...state,
      ballsKnown,
      inventoryKnown,
      ballMap,
      invMap,
      equippedBall,
      balls: ballsKnown ? (equippedBall?.qty != null ? equippedBall.qty : 0) : (state.balls ?? null),
      potions: inventoryKnown ? totalPotions : (state.potions ?? null),
      revives: inventoryKnown ? totalRevives : (state.revives ?? null)
    };
  }
  window.PawInventory = window.PioInventory = {project};
})();
