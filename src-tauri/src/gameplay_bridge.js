// Observe server state; backend-authorized purchases use the existing game socket.
(() => {
  if (window.top !== window || window.__idleioGameplayBridge) return;
  window.__idleioGameplayBridge = true;
  const NativeWebSocket = window.WebSocket;

  // Active session is initialized immediately with a valid UUID so early HTTP requests
  // before WebSocket connection are captured without being dropped.
  let activeSession = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2));

  let latestSocket = null;
  let sourceGeneration = 0, sourceValid = false;
  let pending = [], pendingBytes = 0, inFlight = false, timer = undefined;
  let awaitingSnapshot = false;
  let wireRevision = null, wireState = null;
  let firstProgressSeen = false;
  const seenEventIds = new Set();
  const sessionCaptureHistory = [];
  let lastSeenUid = null;

  // Invoked only by the native executor. Never changes inventory or gold locally.
  window.__idleioSupplySend = (session, command) => {
    if (session !== activeSession || awaitingSnapshot || latestSocket?.readyState !== NativeWebSocket.OPEN) return;
    const gameId = id => typeof id === 'string' || (Number.isSafeInteger(id) && id > 0);
    const valid = command && (
      (command.t === 'ball.throw' && Number.isSafeInteger(command.ballId) && command.ballId >= 1 && command.ballId <= 4 && Number.isSafeInteger(command.slot) && command.slot >= 0) ||
      command.t === 'centro.ir' || command.t === 'centro.curar' || command.t === 'centro.desistir' || command.t === 'market.meus' ||
      (command.t === 'market.cancelar' && (gameId(command.id) || typeof command.id === 'object')) ||
      (command.t === 'market.especies' && typeof command.tipo === 'string') ||
      (command.t === 'market.listar' && typeof command.tipo === 'string') ||
      command.t === 'market.itens' ||
      (command.t === 'market.item' && gameId(command.itemId)) ||
      (command.t === 'market.comprar' && (gameId(command.id) || typeof command.id === 'object') && Number.isSafeInteger(command.qtd) && command.qtd > 0 && Number.isSafeInteger(command.preco) && command.preco > 0 && ['gold','orb'].includes(command.moeda)) ||
      (command.t === 'outland.tier' && Number.isInteger(command.tier) && command.tier > 0 && command.tier <= 100) ||
      (command.t === 'hunt.select' && typeof command.slug === 'string') ||
      (command.t === 'pokemon.evoluir' && gameId(command.pokemonId) && Number.isSafeInteger(command.alvoId)) ||
      (command.t === 'market.criar' && command.tipo === 'item' && gameId(command.itemId) && Number.isSafeInteger(command.qtd) && command.qtd > 0 && Number.isSafeInteger(command.preco) && command.preco > 0 && ['gold','orb'].includes(command.moeda)) ||
      (command.t === 'auto.set' && command.autoVoltarHunt === false) ||
      (command.t === 'shop.autoVendaLoot' && typeof command.ativo === 'boolean') ||
      command.t === 'shop.sellAllItems'
    );
    if (!valid) return;
    latestSocket.send(JSON.stringify(command));
  };

  const MAX_EVENTS = 256, MAX_BYTES = 1024 * 1024, BATCH_EVENTS = 64;
  const metrics = { depth: 0, bytes: 0, highWater: 0, batches: 0, events: 0, gaps: 0, failures: 0, lastLatencyMs: 0 };
  // Numeric diagnostics only; no game payloads or credentials are retained here.
  window.__idleioBridgeMetrics = metrics;

  const playerKeys = ['id','cheio','nick','nome','level','trainerLevel','gold','orbs','gemas','gems','diamantes','diamonds','activeId','activePokemonId','pokemons','pkMud','pkFora','balls','items','inventory','huntSlug','hunt','slug','outlandTier','noCentro','mapId','zoneId','zoneName','autoCaptureBall','autoShinyCaptureBall','autoHealPotion','autoHealThreshold','captureBall','captureHistory'];
  const pokemonKeys = ['id','speciesId','nome','name','level','shiny','slot','quality','potencia','looktype','lookShiny','skin','ld'];
  const pick = (value, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(value ?? {}, k)).map(k => [k, value[k]]));

  function player(value) {
    value = value?.estado ?? value;
    const result = pick(value, playerKeys);
    if (value?.automation && typeof value.automation === 'object') result.automation = value.automation;
    if (value?.huntAnalyzer) result.huntAnalyzer = value.huntAnalyzer;
    if (value?.a) result.a = value.a;
    if (Array.isArray(value?.captureHistory)) result.captureHistory = value.captureHistory;
    for (const key of ['pokemons','pkMud']) if (Array.isArray(result[key])) result[key] = result[key].map(p => pick(p, pokemonKeys));
    return result;
  }

  // PAW incremental state codec (PAW_WIRE) for reconstructive delta handling
  const PAW_WIRE = {
    clone: value => JSON.parse(JSON.stringify(value)),
    safe: key => !['__proto__', 'prototype', 'constructor'].includes(String(key)),
    apply(state, patch) {
      for (const op of patch) {
        if (!Array.isArray(op.path) || !op.path.every(PAW_WIRE.safe)) throw Error('Invalid state patch');
        if (!op.path.length) { state = PAW_WIRE.clone(op.value); continue; }
        let parent = state;
        for (const key of op.path.slice(0, -1)) {
          if (parent == null || typeof parent !== 'object') throw Error('Missing state patch base');
          parent = parent[key];
        }
        const key = op.path.at(-1);
        if (op.remove) delete parent[key];
        else parent[key] = PAW_WIRE.clone(op.value);
      }
      return state;
    }
  };

  // Real ball catalog and costs from PAW supply-model.js (no synthetic legacy prices or non-existent Super Ball 50)
  const ELEMENTAL_BALL_CATALOG = [
    ['normal', 'Normal'], ['fire', 'Fogo'], ['water', 'Água'], ['electric', 'Elétrico'],
    ['grass', 'Planta'], ['ice', 'Gelo'], ['fighting', 'Lutador'], ['poison', 'Veneno'],
    ['ground', 'Terra'], ['flying', 'Voador'], ['psychic', 'Psíquico'], ['bug', 'Inseto'],
    ['rock', 'Pedra'], ['ghost', 'Fantasma'], ['dragon', 'Dragão'], ['dark', 'Sombrio'],
    ['steel', 'Aço'], ['fairy', 'Fada']
  ].map(([type, name]) => ({
    id: type + 'Balls', key: type + 'Balls', nome: 'Bola de ' + name, name: 'Bola de ' + name,
    cost: 108, craftOnly: true, infinite: false, catchRate: 1, matchingCapture: 5.5, type: name
  }));
  const REAL_BALL_CATALOG = [
    { id: 1, key: 'balls', nome: 'Poké Ball', name: 'Poké Ball', priceGold: 5, cost: 5, infinite: false, catchRate: 1 },
    { id: 2, key: 'greatBalls', nome: 'Great Ball', name: 'Great Ball', priceGold: 20, cost: 20, infinite: false, catchRate: 1.5 },
    { id: 4, key: 'ultraBalls', nome: 'Ultra Ball', name: 'Ultra Ball', priceGold: 130, cost: 130, infinite: false, catchRate: 4 },
    { id: 5, key: 'idleBalls', nome: 'Idle Ball', name: 'Idle Ball', priceGold: 0, cost: 0, infinite: false, catchRate: 6 },
    ...ELEMENTAL_BALL_CATALOG
  ];

  function resolveSpeciesName(id) {
    if (!id) return '';
    const num = Number(id);
    if (!num) return String(id);
    try {
      if (typeof window !== 'undefined') {
        if (typeof window.data === 'function') {
          const d = window.data(num);
          if (d && d.name) return d.name;
        }
        if (window.pokedex && window.pokedex[num]) return window.pokedex[num].name || '';
        if (window.species && window.species[num]) return window.species[num].name || '';
        if (window.creaturesById && window.creaturesById[num]) return window.creaturesById[num].name || '';
        if (window.__poke && window.__poke.creaturesMap && window.__poke.creaturesMap[num]) return window.__poke.creaturesMap[num].name || '';
      }
    } catch (_) {}
    return '';
  }

  function mapPawProgress(prog) {
    if (!prog || typeof prog !== 'object') return null;

    const currentUid = prog.uid || prog.id || null;
    if (currentUid && lastSeenUid && currentUid !== lastSeenUid) {
      sessionCaptureHistory.length = 0;
      seenEventIds.clear();
    }
    if (currentUid) {
      lastSeenUid = currentUid;
    }

    const rawPartySlots = Array.isArray(prog.partySlots)
      ? prog.partySlots
      : (Array.isArray(prog.partyUIDs) ? prog.partyUIDs : null);
    const teamList = Array.isArray(prog.team) ? prog.team : [];

    let leaderUid = null;
    if (rawPartySlots && rawPartySlots.length) {
      leaderUid = rawPartySlots[0] || null;
    }
    if (!leaderUid && Number.isInteger(prog.leader) && teamList[prog.leader]?.uid) {
      leaderUid = teamList[prog.leader].uid;
    }

    const mappedTeam = teamList.map((p, idx) => {
      let slot = null;
      if (rawPartySlots) {
        const slotIdx = p.uid ? rawPartySlots.indexOf(p.uid) : -1;
        slot = slotIdx >= 0 ? slotIdx : null;
      } else if (Number.isInteger(p.slot) && p.slot >= 0) {
        slot = p.slot;
      } else if (idx < 6) {
        slot = idx;
      }

      const isLd = leaderUid
        ? (p.uid === leaderUid)
        : (slot === 0 || (rawPartySlots == null && idx === (prog.leader || 0)));

      const sId = p.id || p.speciesId || 0;
      const sName = p.name || p.nome || resolveSpeciesName(sId) || '';
      return {
        id: p.uid || p.id || ('pk_' + idx),
        speciesId: sId,
        nome: sName,
        name: sName,
        level: p.level || 1,
        shiny: Boolean(p.shiny),
        slot: slot,
        quality: p.quality || 1,
        potencia: p.potency || p.potencia || 1,
        ld: isLd,
        ivs: p.ivs ? {
          hp: p.ivs.hp || 0,
          atk: p.ivs.attack != null ? p.ivs.attack : (p.ivs.atk || 0),
          def: p.ivs.defense != null ? p.ivs.defense : (p.ivs.def || 0),
          spAtk: p.ivs.spAttack != null ? p.ivs.spAttack : (p.ivs.spAtk || 0),
          spDef: p.ivs.spDefense != null ? p.ivs.spDefense : (p.ivs.spDef || 0),
          speed: p.ivs.speed != null ? p.ivs.speed : (p.ivs.spe || 0)
        } : null
      };
    });

    const ballMap = {};
    if (prog.ballMap && typeof prog.ballMap === 'object') {
      Object.assign(ballMap, prog.ballMap);
    }
    if (prog.balls && typeof prog.balls === 'object') {
      Object.assign(ballMap, prog.balls);
    } else if (typeof prog.balls === 'number') {
      ballMap['1'] = prog.balls;
    }
    if (prog.greatBalls != null) ballMap['2'] = Number(prog.greatBalls) || 0;
    if (prog.ultraBalls != null) ballMap['4'] = Number(prog.ultraBalls) || 0;
    if (prog.idleBalls != null) ballMap['5'] = Number(prog.idleBalls) || 0;
    if (prog.balls != null && typeof prog.balls === 'number') {
      ballMap['1'] = Number(prog.balls) || 0;
    }

    const ballKeys = ELEMENTAL_BALL_CATALOG.map(ball => ball.key);
    for (const bk of ballKeys) {
      if (prog[bk] != null) ballMap[bk] = Number(prog[bk]) || 0;
    }

    // Authoritative huntAnalyzer from progress (from PAW hunt-analyzer-model.js huntAnalysisTotals)
    const ha = prog.huntAnalyzer || (typeof window !== 'undefined' && window.state && window.state.huntAnalyzer) || null;
    let haNormalized = null;
    let haSecs = 0, haKills = 0, haXp = 0, haCaps = 0, haCoins = 0, haAutoSale = 0, haSupplyCost = 0, haCapVal = 0;
    let haKph = 0, haXph = 0, haGph = 0, lootValue = 0, reward = 0, net = 0;

    if (ha && typeof ha === 'object') {
      haSecs = Number(ha.seconds) || 0; // Strict seconds: never fallback to elapsed time when 0
      haKills = Number(ha.kills) || 0;
      haXp = Number(ha.xp) || 0;
      haCaps = Number(ha.captures) || 0;
      haCoins = Number(ha.coins) || 0;
      haAutoSale = Number(ha.autoSaleCoins) || 0;
      haSupplyCost = Number(ha.supplyCost) || 0;
      haCapVal = Number(ha.captureValue) || 0;

      const dropsObj = (ha.drops && typeof ha.drops === 'object') ? ha.drops : {};
      lootValue = Object.entries(dropsObj).reduce((sum, [key, count]) => {
        const cnt = Math.max(0, Number(count) || 0);
        let val = 0;
        if (key === 'materials') {
          val = 4;
        } else if (typeof elementalLootItem === 'function') {
          val = elementalLootItem(key)?.value || 0;
        } else if (typeof window !== 'undefined' && typeof window.elementalLootItem === 'function') {
          val = window.elementalLootItem(key)?.value || 0;
        }
        return sum + cnt * val;
      }, 0);

      // huntAnalysisTotals: reward = s.coins + lootValue + s.captureValue, net = reward - s.supplyCost
      // autoSaleCoins is NOT added additionally!
      reward = haCoins + lootValue + haCapVal;
      net = reward - haSupplyCost;
      haKph = haSecs > 0 ? Math.round(haKills * 3600 / haSecs) : 0;
      haXph = haSecs > 0 ? Math.round(haXp * 3600 / haSecs) : 0;
      haGph = haSecs > 0 ? Math.round(net * 3600 / haSecs) : 0; // Can be negative

      haNormalized = {
        version: ha.version || 1,
        route: ha.route || prog.route || '',
        species: ha.species ?? prog.huntSpecies ?? null,
        startedAt: ha.startedAt || 0,
        seconds: haSecs,
        offlineSeconds: ha.offlineSeconds || 0,
        kills: haKills,
        xp: haXp,
        coins: haCoins,
        autoSaleCoins: haAutoSale,
        captures: haCaps,
        captureValue: haCapVal,
        captureSpecies: ha.captureSpecies || {},
        captureSales: ha.captureSales || {},
        supplyCost: haSupplyCost,
        supplies: ha.supplies || {},
        drops: dropsObj,
        autoSoldDrops: ha.autoSoldDrops || {},
        lootValue: lootValue,
        reward: reward,
        net: net,
        kph: haKph,
        xph: haXph,
        gph: haGph,
        balance: net,
        lootGold: haCoins + lootValue,
        supplyGold: haSupplyCost,
        capturesGold: haCapVal
      };
    }

    const rawHuntSlug = prog.huntSpecies ? String(prog.huntSpecies) : (prog.route ? String(prog.route) : (prog.currentHunt || ''));
    const resolvedHuntSlug = (prog.huntSpecies && resolveSpeciesName(prog.huntSpecies)) || rawHuntSlug;
    const inCenter = Boolean(prog.inTown);

    // Capture history (bounded to 100 entries for G7 analytics)
    // Respect captureHistory snapshot if present as authoritative (including [])
    const finalCaptureHistory = Array.isArray(prog.captureHistory)
      ? prog.captureHistory.slice(-100)
      : sessionCaptureHistory.slice(-100);

    const autoActive = prog.auto === true || (prog.automation && typeof prog.automation === 'object' && prog.automation.active === true);
    const automation = {
      active: autoActive,
      autoCaptureBall: prog.autoCaptureBall || "auto",
      autoShinyCaptureBall: prog.autoShinyCaptureBall || prog.autoCaptureBall || "auto",
      autoHealPotion: prog.autoHealPotion || "auto",
      autoHealThreshold: Number.isFinite(Number(prog.autoHealThreshold))
        ? Math.max(5, Math.min(95, Math.round(Number(prog.autoHealThreshold) / 5) * 5))
        : 35,
      captureBall: prog.captureBall || "balls"
    };

    const activeId = leaderUid || (rawPartySlots && rawPartySlots.find(Boolean)) || (teamList[0]?.uid) || (teamList[0]?.id) || null;

    const invMap = {};
    if (prog.invMap && typeof prog.invMap === 'object') {
      Object.assign(invMap, prog.invMap);
    }
    if (prog.items && typeof prog.items === 'object') {
      Object.assign(invMap, prog.items);
    } else if (prog.inventory && typeof prog.inventory === 'object') {
      Object.assign(invMap, prog.inventory);
    }

    const consumablePotionMap = {
      potions: '200', potion: '200',
      greatPotions: '201', greatPotion: '201',
      ultraPotions: '202', ultraPotion: '202', superPotions: '202', superPotion: '202',
      hyperPotions: '203', hyperPotion: '203',
      maxPotions: '204', maxPotion: '204',
      goldenPotions: 'goldenPotion', goldenPotion: 'goldenPotion'
    };
    const consumableReviveMap = {
      revives: '205', revive: '205',
      maxRevives: '206', maxRevive: '206'
    };

    for (const [k, id] of Object.entries(consumablePotionMap)) {
      if (prog[k] != null) {
        const val = Number(prog[k]) || 0;
        invMap[k] = val;
        if (/^\d+$/.test(id)) invMap[id] = val;
      }
    }
    for (const [k, id] of Object.entries(consumableReviveMap)) {
      if (prog[k] != null) {
        const val = Number(prog[k]) || 0;
        invMap[k] = val;
        if (/^\d+$/.test(id)) invMap[id] = val;
      }
    }

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
    let totalPotions = 0;
    for (const group of POTION_GROUPS) {
      for (const k of group) {
        if (Object.prototype.hasOwnProperty.call(invMap, k)) {
          totalPotions += (Number(invMap[k]) || 0);
          break;
        }
      }
    }
    let totalRevives = 0;
    for (const group of REVIVE_GROUPS) {
      for (const k of group) {
        if (Object.prototype.hasOwnProperty.call(invMap, k)) {
          totalRevives += (Number(invMap[k]) || 0);
          break;
        }
      }
    }

    const resolvedCharName = prog.trainerName
      || prog.characterName
      || prog.charName
      || (prog.character && prog.character.name)
      || (prog.selectedCharacter && prog.selectedCharacter.name)
      || prog.name
      || prog.nick
      || prog.nome
      || '';

    return {
      cheio: true,
      id: prog.uid || prog.id || '',
      nick: resolvedCharName,
      nome: resolvedCharName,
      name: resolvedCharName,
      trainerName: resolvedCharName,
      characterName: resolvedCharName,
      level: prog.trainerLevel != null ? prog.trainerLevel : (prog.level || 0),
      trainerLevel: prog.trainerLevel != null ? prog.trainerLevel : (prog.level || 0),
      gold: prog.coins != null ? prog.coins : (prog.gold || 0),
      diamonds: prog.diamonds || 0,
      activeId: activeId,
      pokemons: mappedTeam,
      balls: ballMap,
      ballMap: ballMap,
      items: invMap,
      inventory: invMap,
      invMap: invMap,
      potions: totalPotions,
      revives: totalRevives,
      ballsKnown: true,
      inventoryKnown: true,
      ballCatalog: REAL_BALL_CATALOG,
      catalogoBolas: REAL_BALL_CATALOG,
      automation: automation,
      auto: autoActive,
      autoCaptureBall: automation.autoCaptureBall,
      autoShinyCaptureBall: automation.autoShinyCaptureBall,
      autoHealPotion: automation.autoHealPotion,
      autoHealThreshold: automation.autoHealThreshold,
      captureBall: automation.captureBall,
      huntSlug: inCenter ? 'centro' : resolvedHuntSlug,
      hunt: inCenter ? 'centro' : resolvedHuntSlug,
      noCentro: inCenter,
      huntAnalyzer: haNormalized,
      captureHistory: finalCaptureHistory,
      a: {
        kills: haKills,
        xp: haXp,
        xpg: haXp,
        captures: haCaps,
        seconds: haSecs,
        balance: net,
        lootGold: haCoins + lootValue,
        supplyCost: haSupplyCost,
        supplyGold: haSupplyCost,
        captureValue: haCapVal,
        capturesGold: haCapVal,
        kph: haKph,
        xph: haXph,
        gph: haGph
      }
    };
  }

  function handlePawPayload(session, prog, scene, events) {
    const hasHuntAnalyzer = Boolean(prog && (prog.huntAnalyzer || (prog.estado && prog.estado.huntAnalyzer)));

    if (Array.isArray(events) && events.length) {
      for (const ev of events) {
        if (!ev || typeof ev !== 'object') continue;
        const evId = ev.eventId ?? ev.id;
        if (evId != null) {
          if (seenEventIds.has(evId)) continue;
          seenEventIds.add(evId);
          if (seenEventIds.size > 512) {
            const arr = Array.from(seenEventIds).slice(-256);
            seenEventIds.clear();
            arr.forEach(id => seenEventIds.add(id));
          }
        }

        const k = ev.type || ev.k || ev.t || ev.kind || '';
        if (k === 'capture' || k === 'capturado') {
          const capEntry = {
            id: ev.pokemon?.id || ev.pokemon?.speciesId || ev.speciesId || (ev.pokemon?.species) || 0,
            name: ev.pokemon?.name || ev.pokemon?.nome || ev.speciesName || 'Pokémon',
            level: ev.pokemon?.level || 1,
            quality: ev.pokemon?.quality || 1,
            shiny: Boolean(ev.shiny || ev.pokemon?.shiny),
            time: ev.time || ev.emittedAt || Date.now(),
            ok: true
          };
          sessionCaptureHistory.push(capEntry);
          if (sessionCaptureHistory.length > 100) sessionCaptureHistory.shift();
        }

        // When authoritative huntAnalyzer is present, cumulative progress snapshots are the source of truth for cumulative battle progress (kills, xp, coins).
        // We do not emit synthetic activity battle kills that would duplicate the snapshot's counts.
        // If huntAnalyzer is absent, activity events serve as deltas.
        if (!hasHuntAnalyzer) {
          if (k === 'kill' || k === 'battle' || k === 'morte') {
            report(session, {
              t: 'activity',
              data: {
                kind: 'battle',
                name: ev.speciesName || ev.nome || 'Selvagem',
                qty: 1,
                gold: ev.coinsGained || ev.ouro || ev.gold || 0,
                xp: ev.xpGained || ev.xp || 0
              }
            });
          } else if (k === 'capture' || k === 'capturado') {
            report(session, {
              t: 'activity',
              data: {
                kind: 'capture',
                name: ev.speciesName || ev.pokemon?.name || ev.pokemon?.nome || 'Pokémon',
                qty: 1,
                shiny: Boolean(ev.shiny || ev.pokemon?.shiny),
                pokemon: ev.pokemon || null
              }
            });
          }
        }

        if (Array.isArray(ev.drops)) {
          for (const d of ev.drops) {
            if (d && (d.name || d.nome)) {
              report(session, { t: 'activity', data: { kind: 'drop', name: d.name || d.nome, qty: d.qty || d.qtd || 1 } });
            }
          }
        }
      }
    }

    if (prog) {
      const est = mapPawProgress(prog);
      if (est) {
        if (!firstProgressSeen) {
          firstProgressSeen = true;
          report(session, {
            t: 'welcome',
            data: {
              estado: est,
              hunts: [],
              catalogoBolas: REAL_BALL_CATALOG
            }
          });
        } else {
          report(session, { t: 'estado', data: est });
        }
      }
    }

    if (scene) {
      const slug = scene.location || scene.route || scene.hunt || prog?.huntSpecies || prog?.route || '';
      const inTown = Boolean(scene.inTown ?? prog?.inTown ?? (slug === 'centro'));
      report(session, { t: 'campo', data: { slug: inTown ? 'centro' : slug, centro: inTown } });
    }
  }

  function ingestPawPayload(session, raw) {
    if (!raw || typeof raw !== 'object') return;
    let payload = raw;
    if (raw.body && typeof raw.body === 'object') {
      payload = raw.body;
    }

    let progToEmit = null;
    let sceneToEmit = payload.scene || null;
    let eventsToEmit = payload.events || null;

    if (payload.wireVersion === 1) {
      if (payload.progress) {
        wireState = PAW_WIRE.clone(payload.progress);
        wireRevision = payload.revision;
        awaitingSnapshot = false;
        progToEmit = PAW_WIRE.clone(wireState);
      } else if (Array.isArray(payload.patch)) {
        if (payload.base === wireRevision && wireState) {
          try {
            wireState = PAW_WIRE.apply(wireState, payload.patch);
            wireRevision = payload.revision;
            progToEmit = PAW_WIRE.clone(wireState);
          } catch (_) {
            wireRevision = null;
            wireState = null;
            invalidate(session, 'patch_gap');
            return;
          }
        } else {
          // Invalid base patch: invalidate session, clear wire state, do not apply events
          wireRevision = null;
          wireState = null;
          invalidate(session, 'patch_gap');
          return;
        }
      } else {
        // Wire payload without progress or patch: do not reuse stale wireState
        if (awaitingSnapshot) return;
      }
    } else if (payload.progress) {
      wireState = PAW_WIRE.clone(payload.progress);
      awaitingSnapshot = false;
      progToEmit = payload.progress;
    } else {
      // Non-wire message without progress (market, chat, erro): do not reuse stale wireState
      if (awaitingSnapshot) return;
    }

    const extCharName = payload.character?.name || payload.trainerName || payload.characterName || raw.character?.name || raw.trainerName || null;
    if (extCharName && progToEmit) {
      if (!progToEmit.trainerName) progToEmit.trainerName = extCharName;
      if (!progToEmit.characterName) progToEmit.characterName = extCharName;
      if (wireState) {
        if (!wireState.trainerName) wireState.trainerName = extCharName;
        if (!wireState.characterName) wireState.characterName = extCharName;
      }
    }

    if (progToEmit && typeof window !== 'undefined') {
      sourceValid = true;
      window.__idleioTelemetryLive = true;
      window.__poke = window.__poke || {};
      window.__poke.estado = wireState;
      if (wireState && wireState.huntAnalyzer) window.__poke.huntSession = wireState.huntAnalyzer;
      if (window.__pawSniffer && window.__pawSniffer.P) {
        window.__pawSniffer.P.estado = wireState;
        if (wireState && wireState.huntAnalyzer) window.__pawSniffer.P.huntSession = wireState.huntAnalyzer;
        if (wireState && wireState.coins != null) window.__pawSniffer.P.gold = wireState.coins;
        if (wireState && wireState.trainerLevel != null) window.__pawSniffer.P.level = window.__pawSniffer.P.trainerLevel = wireState.trainerLevel;
      }
    }

    if (progToEmit || sceneToEmit || eventsToEmit) {
      handlePawPayload(session, progToEmit, sceneToEmit, eventsToEmit);
    }
  }

  function updateMetrics() { metrics.depth = pending.length; metrics.bytes = pendingBytes; metrics.highWater = Math.max(metrics.highWater, pending.length); }
  function schedule() {
    if (timer === undefined && !inFlight && pending.length) timer = setTimeout(() => { timer = undefined; void flush(); }, 16);
  }
  function invalidate(session, reason) {
    if (reason === 'patch_gap') sourceValid = false;
    if (typeof window !== 'undefined') window.__idleioTelemetryLive = false;
    pending = []; pendingBytes = 0; awaitingSnapshot = true; metrics.gaps++;
    const event = { t: 'telemetry_gap', data: { reason } };
    pending.push({ session, event, bytes: JSON.stringify(event).length * 2 });
    pendingBytes = pending[0].bytes;
    updateMetrics(); schedule();
  }
  async function flush() {
    if (inFlight || !pending.length) return;
    const batch = pending.splice(0, BATCH_EVENTS);
    const session = batch[0].session;
    const generation = sourceGeneration;
    pendingBytes -= batch.reduce((n, item) => n + item.bytes, 0);
    updateMetrics(); inFlight = true;
    const started = performance.now();
    try {
      const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
      if (!invoke) throw new Error('Bridge unavailable');
      await invoke('report_gameplay_batch', { session, events: batch.map(item => item.event), metrics: { ...metrics } });
      metrics.batches++; metrics.events += batch.length;
      if (session === activeSession && generation === sourceGeneration && sourceValid && batch.some(item => item.event.t === 'telemetry_gap')) {
        if (wireState) {
          const est = mapPawProgress(wireState);
          if (est) report(session, { t: 'estado', data: est });
        }
      }
    } catch {
      metrics.failures++;
      if (session === activeSession && generation === sourceGeneration) {
        pending = []; pendingBytes = 0; awaitingSnapshot = true; metrics.gaps++;
        const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (invoke) {
          pending.push({ session, event: { t: 'telemetry_gap', data: { reason: 'delivery_failed' } }, bytes: 128 });
          pendingBytes = 128;
        }
      }
      if (session === activeSession && generation === sourceGeneration && batch.some(item => item.event.t === 'telemetry_gap')) { pending = []; pendingBytes = 0; }
    } finally {
      metrics.lastLatencyMs = Math.round(performance.now() - started);
      inFlight = false; updateMetrics(); schedule();
    }
  }
  function report(session, event) {
    if (event.t === 'reset' || event.t === 'disconnected') {
      sourceGeneration++;
      sourceValid = false;
      if (typeof window !== 'undefined') window.__idleioTelemetryLive = false;
      if (event.t === 'reset') {
        activeSession = session; pending = []; pendingBytes = 0; awaitingSnapshot = false;
        sessionCaptureHistory.length = 0; seenEventIds.clear(); lastSeenUid = null;
      }
    }
    if (session !== activeSession) return;
    if (awaitingSnapshot && !['welcome', 'reset', 'disconnected', 'session_token'].includes(event.t)) {
      if (event.t === 'estado' && (event.data?.cheio || event.data?.pokemons)) awaitingSnapshot = false;
      else if (event.t === 'campo' || event.t === 'campo.init') awaitingSnapshot = false;
      else return;
    }
    if (event.t === 'welcome' || (event.t === 'estado' && event.data?.cheio)) {
      awaitingSnapshot = false;
      if (typeof window !== 'undefined') window.__idleioTelemetryLive = true;
    }
    const bytes = JSON.stringify(event).length * 2;
    if (pending.length >= MAX_EVENTS || pendingBytes + bytes > MAX_BYTES) {
      invalidate(session, 'buffer_limit'); return;
    }
    pending.push({ session, event, bytes }); pendingBytes += bytes;
    updateMetrics(); schedule();
  }

  // Robust background heartbeat keepalive for WebSocket connections (prevents idle timeouts in background / tray / taskbar)
  let heartbeatHandle = null;
  function startHeartbeat(socket) {
    stopHeartbeat();
    const sendPing = () => {
      try {
        if (socket && socket === latestSocket && socket.readyState === NativeWebSocket.OPEN) {
          socket.send(JSON.stringify({ t: 'ping' }));
        }
      } catch (_) {}
    };

    let worker = null;
    try {
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([
          'let t = setInterval(function() { postMessage("p"); }, 20000); self.onmessage = function() { clearInterval(t); };'
        ], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        worker = new Worker(workerUrl);
        worker.onmessage = () => sendPing();
        URL.revokeObjectURL(workerUrl);
      }
    } catch (_) {
      worker = null;
    }

    const intervalId = setInterval(sendPing, 20000);
    heartbeatHandle = {
      stop() {
        if (worker) {
          try { worker.postMessage('stop'); worker.terminate(); } catch (_) {}
          worker = null;
        }
        clearInterval(intervalId);
      }
    };
  }

  function stopHeartbeat() {
    if (heartbeatHandle) {
      try { heartbeatHandle.stop(); } catch (_) {}
      heartbeatHandle = null;
    }
  }

  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args) {
      const socket = Reflect.construct(target, args);
      let url;
      try { url = new URL(args[0], window.location.href); } catch { return socket; }
      const cleanHost = url.hostname.replace(/^www\./, '');
      const isGameHost = cleanHost === 'pokeidle.io' || cleanHost.endsWith('.pokeidle.io') ||
                         cleanHost === 'pokeascendedworld.com' || cleanHost.endsWith('.pokeascendedworld.com') ||
                         cleanHost === 'poke.idleworld.online' || cleanHost.endsWith('.idleworld.online');
      if (!isGameHost) return socket;
      sourceGeneration++;
      sourceValid = false;
      latestSocket = socket;

      // Extract session token from WS URL query parameter if present
      const urlSession = url.searchParams.get('session');
      if (urlSession) {
        report(activeSession, { t: 'session_token', data: { token: urlSession, nick: '' } });
      }

      const origSend = socket.send;
      socket.send = function(data) {
        try {
          if (typeof data === 'string') {
            const raw = JSON.parse(data);
            if (raw.t === 'hello' && raw.token) {
              report(activeSession, { t: 'session_token', data: { token: raw.token, nick: raw.nick || '' } });
            }
          }
        } catch (_) {}
        return origSend.apply(this, arguments);
      };

      socket.addEventListener('open', () => {
        if (socket !== latestSocket) return;
        if (typeof window !== 'undefined') window.__idleioTelemetryLive = true;
        startHeartbeat(socket);
        // Wait for an observed payload before replaying a previous connection's state.
      });

      socket.addEventListener('close', () => {
        if (socket === latestSocket) {
          stopHeartbeat();
          if (typeof window !== 'undefined') window.__idleioTelemetryLive = false;
          report(activeSession, { t: 'disconnected' });
          try {
            const app = typeof document !== 'undefined' && document.getElementById('app');
            const hasAuth = typeof document !== 'undefined' && !!document.querySelector('#auth-dialog, .site-auth-dialog, #login-turnstile, #auth-form');
            if (app && !app.classList.contains('hidden') && !hasAuth && typeof location !== 'undefined' && location.pathname.startsWith('/play')) {
              setTimeout(() => {
                if (!latestSocket || latestSocket.readyState !== NativeWebSocket.OPEN) {
                  try { location.reload(); } catch (_) {}
                }
              }, 8000);
            }
          } catch (_) {}
        }
      });

      socket.addEventListener('message', message => {
        if (socket !== latestSocket || typeof message.data !== 'string') return;
        try {
          const raw = JSON.parse(message.data);
          ingestPawPayload(activeSession, raw);

          const t = raw.t ?? raw.type, data = raw.data ?? raw;
          if (t === 'welcome' || t === 'estado') sourceValid = true;
          const evId = raw.eventId ?? data?.eventId;
          if (evId != null && (t === 'morte' || t === 'batalha' || t === 'capturado' || t === 'loot.received')) {
            if (seenEventIds.has(evId)) return;
            seenEventIds.add(evId);
            if (seenEventIds.size > 512) {
              const arr = Array.from(seenEventIds).slice(-256);
              seenEventIds.clear();
              arr.forEach(id => seenEventIds.add(id));
            }
          }
          if (t === 'welcome') {
            try {
              const sessToken = localStorage.getItem('sessao');
              const sessNick = localStorage.getItem('nick');
              if (sessToken) {
                report(activeSession, { t: 'session_token', data: { token: sessToken, nick: sessNick || '' } });
              }
            } catch (_) {}
            report(activeSession, { t, data: { outlandTiers: (data.outlandTiers ?? []).map(r => pick(r,["tier","rotulo","nivel","mult"])), pedrasEvolucao: data.pedrasEvolucao, shinyStone: data.shinyStone, mercado: data.mercado, catalogoBolas: (data.catalogoBolas ?? []).map(b => pick(b,["id","nome","name","priceGold","infinite","infinito","catchRate"])), estado: player(data.estado), hunts: (data.hunts ?? []).map(h => ({...pick(h, ['slug','name','nome','regiao','area','nivel']), especies: (h.especies ?? []).map(s => pick(s, ['pokeId','pontos','nome','looktype']))})), shinyLooks: data.shinyLooks, shinyLooksOutland: data.shinyLooksOutland } });
            queueMicrotask(() => window.__idleioBackgroundEconomy?.ready());
          }
          else if (t === 'campo' || t === 'campo.init') report(activeSession, { t, data: { ...pick(data, ['slug','centro','pvp','casa','fora']), mobs: (data.mobs ?? []).map(m => pick(m,['s','x','xr'])) } });
          else if (t === 'batalha') report(activeSession, { t, data: { ev: (data.ev ?? []).filter(e => ['bola','morte','capturado'].includes(e.k ?? e.t)).map(e => ({...pick(e,['k','t','ballId','slot','sucesso','quem','nome','ouro','xp']), ...(Array.isArray(e.drops) ? {drops:e.drops.map(d => pick(d,['nome','qtd']))} : {}), ...(e.pokemon ? {pokemon:{...pick(e.pokemon,[...pokemonKeys,'pokeId','potency','grade','nota','iv_hp','iv_atk','iv_def','iv_spa','iv_spd','iv_spe']),ivs:pick(e.pokemon.ivs,['hp','atk','def','spAtk','spa','spDef','spd','speed','spe'])}} : {})})) } });
          else if (t === 'estado') report(activeSession, { t, data: player(data.estado ?? data) });
          else if (t === 'market') report(activeSession, { t, data: { aba: data.aba, itemId: data.itemId, moeda: data.moeda, total: data.total, pagina: data.pagina, resumo: data.resumo, linhas: data.linhas, anuncio: data.anuncio } });
          else if (t === 'erro') report(activeSession, { t, data: pick(data, ['chave','msg']) });
          else if (t === 'capturado') {
            const p = data.pokemon ?? data;
            const name = p.nome ?? p.name;
            if (typeof name === 'string') report(activeSession, { t: 'activity', data: { kind: 'capture', name, qty: 1, shiny: typeof p.shiny === 'boolean' ? p.shiny : null, pokemon: {...pick(p,['speciesId','pokeId','level','quality','potencia','potency','grade','nota','skin','iv_hp','iv_atk','iv_def','iv_spa','iv_spd','iv_spe']), ivs: pick(p.ivs,['hp','atk','def','spAtk','spa','spDef','spd','speed','spe'])} } });
          } else if (t === 'morte' && data.quem === 'selvagem') {
            report(activeSession, { t: 'activity', data: { kind: 'battle', name: data.nome ?? 'Selvagem derrotado', qty: 1, gold: data.ouro, xp: data.xp } });
            for (const item of data.drops ?? []) if (typeof item.nome === 'string' && item.qtd > 0) report(activeSession, { t: 'activity', data: { kind: 'drop', name: item.nome, qty: item.qtd } });
          } else if (t === 'loot.received') {
            for (const item of data.items ?? []) if (typeof item.item_id === 'string' && item.qty > 0) report(activeSession, { t: 'activity', data: { kind: 'drop', name: item.item_id, qty: item.qty } });
          }
        } catch { /* Non-game messages do not enter the bridge. */ }
      });
      return socket;
    }
  });

  const NativeFetch = window.fetch;
  if (NativeFetch) {
    window.fetch = function(...args) {
      const p = NativeFetch.apply(this, args);
      try {
        const urlStr = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        if (urlStr.includes('/api/game')) {
          p.then(r => {
            try {
              const c = r.clone();
              c.json().then(j => {
                ingestPawPayload(activeSession, j);
              }).catch(() => {});
            } catch (_) {}
          }).catch(() => {});
        } else if (urlStr.includes('/api/session')) {
          p.then(r => {
            try {
              const c = r.clone();
              c.json().then(j => {
                if (j && j.sessionId) {
                  report(activeSession, { t: 'session_token', data: { token: j.sessionId, nick: j.user?.name || '' } });
                }
              }).catch(() => {});
            } catch (_) {}
          }).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
  }

  // Fallback periodic inspection of window.state (authoritative client store)
  setInterval(() => {
    try {
      if (sourceValid && !awaitingSnapshot && typeof window !== 'undefined' && window.state && activeSession) {
        handlePawPayload(activeSession, window.state, window.state.scene || null, null);
      }
    } catch (_) {}
  }, 2500);

  // Window focus & visibility recovery to prevent telemetry blanking after tab away / focus loss
  if (typeof window !== 'undefined') {
    const handleFocusOrResume = () => {
      try {
        if (sourceValid && awaitingSnapshot && wireState && activeSession) {
          const est = mapPawProgress(wireState);
          if (est) report(activeSession, { t: 'estado', data: est });
        }
        if (!inFlight && pending.length) {
          if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
          void flush();
        }
      } catch (_) {}
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('focus', handleFocusOrResume);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) handleFocusOrResume();
      });
    }
  }
})();
