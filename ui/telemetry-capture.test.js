// Comprehensive Node vm test suite for PAW telemetry capture in ui/
// Tests src-tauri/src/gameplay_bridge.js against real contract specifications.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  PASS: ${message}`);
}

const FIXTURES = {
  sessionApi: {
    user: { id: "fixture-user-0", name: "Fixture", email: "[REDACTED_EMAIL]" },
    sessionId: "TEST_SESSION_SECRET"
  },
  initialGameProgress: {
    uid: "fixture-user-0",
    trainerName: "Fixture",
    trainerLevel: 32,
    coins: 154820,
    diamonds: 450,
    route: "viridian-forest",
    huntSpecies: 25,
    inTown: false,
    inHome: false,
    running: true,
    leader: 0,
    partySlots: ["pk_uid_lead_01", null, "pk_uid_sub_02", null, null, null],
    partyUIDs: ["pk_uid_lead_01", null, "pk_uid_sub_02", null, null, null],
    team: [
      { uid: "pk_uid_lead_01", id: 25, speciesId: 25, name: "Pikachu", level: 48, shiny: true, quality: 1.15, potency: 1.2, ivs: { hp: 31, attack: 28, defense: 30, spAttack: 31, spDefense: 29, speed: 31 } },
      { uid: "pk_uid_sub_02", id: 6, speciesId: 6, name: "Charizard", level: 52, shiny: false, quality: 1.05, potency: 1.0, ivs: { hp: 25, attack: 31, defense: 22, spAttack: 31, spDefense: 24, speed: 29 } },
      { uid: "pk_uid_bench_03", id: 1, speciesId: 1, name: "Bulbasaur", level: 10, shiny: false, quality: 1.0, potency: 1.0, ivs: null }
    ],
    balls: { "1": 150, "2": 45, "4": 18, "5": 3 },
    items: { "materials": 84, "stone:fire": 2 },
    auto: true,
    autoCaptureBall: "ultraBalls",
    autoShinyCaptureBall: "ultraBalls",
    autoHealPotion: "potions",
    autoHealThreshold: 35,
    captureBall: "balls",
    huntAnalyzer: {
      version: 1,
      route: "viridian-forest",
      species: 25,
      startedAt: 1729210000000,
      seconds: 1200,
      offlineSeconds: 0,
      kills: 60,
      xp: 24500,
      coins: 8400,
      autoSaleCoins: 1200,
      captures: 4,
      captureValue: 3600,
      captureSpecies: { "25": 4 },
      captureSales: { "25": 3600 },
      supplyCost: 520,
      supplies: { "ultraBalls": 4 },
      drops: { "materials": 35 },
      autoSoldDrops: { "materials": 35 }
    },
    captureHistory: [
      { id: 25, ok: true, time: 1729210200000, level: 12, quality: 1.1 }
    ]
  },
  initialPayload: {
    wireVersion: 1,
    revision: "epoch_101:1",
    serverTime: 1729211200000,
    progress: null,
    scene: { route: "viridian-forest", location: "viridian-forest", inTown: false, trainer: { x: 12, y: 15 }, partner: { x: 13, y: 15 }, enemies: [{ encounterId: "enc_9901", id: 25, level: 15, hp: 120, max: 120, dead: false, aggro: true }], targetIndex: 0 },
    events: [{ eventId: "ev_hit_001", kind: "hit", damage: 45, text: "-45", emittedAt: 1729211200000, targetEncounterId: "enc_9901" }]
  },
  deltaPatchPayload: {
    wireVersion: 1,
    base: "epoch_101:1",
    revision: "epoch_101:2",
    serverTime: 1729211202000,
    patch: [
      { path: ["coins"], value: 155020 },
      { path: ["huntAnalyzer", "kills"], value: 61 },
      { path: ["huntAnalyzer", "xp"], value: 24900 },
      { path: ["huntAnalyzer", "coins"], value: 8600 },
      { path: ["huntAnalyzer", "seconds"], value: 1202 }
    ],
    scene: { route: "viridian-forest", location: "viridian-forest", inTown: false, enemies: [{ encounterId: "enc_9902", id: 25, level: 14, hp: 110, max: 110, dead: false, aggro: true }], targetIndex: 0 },
    events: [{ eventId: "ev_cap_001", kind: "capture", speciesId: 25, speciesName: "Pikachu", pokemon: { id: 25, name: "Pikachu", level: 14, shiny: false, quality: 1.1 }, emittedAt: 1729211202000 }]
  },
  deltaPatch2Payload: {
    wireVersion: 1,
    base: "epoch_101:2",
    revision: "epoch_101:3",
    serverTime: 1729211204000,
    patch: [
      { path: ["coins"], value: 155250 },
      { path: ["huntAnalyzer", "kills"], value: 62 },
      { path: ["huntAnalyzer", "xp"], value: 25300 },
      { path: ["huntAnalyzer", "coins"], value: 8830 },
      { path: ["huntAnalyzer", "seconds"], value: 1204 }
    ],
    scene: { route: "viridian-forest", location: "viridian-forest", inTown: false, enemies: [], targetIndex: -1 },
    events: []
  },
  invalidBasePatchPayload: {
    wireVersion: 1,
    base: "corrupted_base_999",
    revision: "corrupted_rev_1000",
    serverTime: 1729211203000,
    patch: [{ path: ["coins"], value: 999999 }],
    events: [{ eventId: "ev_corrupt_01", kind: "kill" }]
  }
};
FIXTURES.initialPayload.progress = FIXTURES.initialGameProgress;

function createMockBrowserEnv() {
  const reportedBatches = [];
  const eventListeners = new Map();

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      this.listeners = {};
      MockWebSocket.latestInstance = this;
    }
    addEventListener(event, fn) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(l => l !== fn);
      }
    }
    send(data) {
      if (typeof this.onSend === 'function') this.onSend(data);
    }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      (this.listeners['close'] || []).forEach(fn => fn());
    }
    simulateMessage(data) {
      const msgEvent = { data: typeof data === 'string' ? data : JSON.stringify(data) };
      (this.listeners['message'] || []).forEach(fn => fn(msgEvent));
    }
    simulateOpen() {
      (this.listeners['open'] || []).forEach(fn => fn());
    }
  }

  const localStorageData = {};
  const mockLocalStorage = {
    getItem: k => localStorageData[k] || null,
    setItem: (k, v) => { localStorageData[k] = String(v); },
    removeItem: k => { delete localStorageData[k]; }
  };

  const windowListeners = new Map();
  const documentListeners = new Map();
  const intervals = new Map();

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => { const id = {}; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
    Date,
    Math,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Set,
    Map,
    performance: { now: () => Date.now() },
    crypto: { randomUUID: () => 'uuid_' + Math.random().toString(36).substring(2, 10) },
    URL,
    URLSearchParams,
    Reflect,
    TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : undefined,
    queueMicrotask: fn => queueMicrotask(fn)
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  sandbox.self = sandbox;
  sandbox.WebSocket = MockWebSocket;
  sandbox.localStorage = mockLocalStorage;
  sandbox.addEventListener = (ev, fn) => {
    const list = windowListeners.get(ev) || [];
    list.push(fn);
    windowListeners.set(ev, list);
  };
  sandbox.removeEventListener = (ev, fn) => {
    const list = windowListeners.get(ev) || [];
    windowListeners.set(ev, list.filter(l => l !== fn));
  };
  sandbox.document = {
    hidden: false,
    addEventListener: (ev, fn) => {
      const list = documentListeners.get(ev) || [];
      list.push(fn);
      documentListeners.set(ev, list);
    },
    removeEventListener: (ev, fn) => {
      const list = documentListeners.get(ev) || [];
      documentListeners.set(ev, list.filter(l => l !== fn));
    },
    getElementById: id => null,
    querySelector: sel => null,
    querySelectorAll: sel => []
  };
  sandbox.location = {
    href: 'https://pokeascendedworld.com/game',
    hostname: 'pokeascendedworld.com',
    protocol: 'https:'
  };

  let shouldFailInvoke = false;
  let invokeHook = null;
  sandbox.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (invokeHook) await invokeHook(cmd, args);
      if (shouldFailInvoke) {
        throw new Error('Network / bridge error');
      }
      if (cmd === 'report_gameplay_batch') {
        reportedBatches.push(JSON.parse(JSON.stringify(args)));
        return;
      }
      throw new Error('Unknown command: ' + cmd);
    }
  };

  const mockFetchResponses = new Map();
  sandbox.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    for (const [pattern, handler] of mockFetchResponses.entries()) {
      if (urlStr.includes(pattern)) {
        return handler(urlStr, options);
      }
    }
    return {
      status: 200,
      ok: true,
      clone: () => ({ json: async () => ({}) })
    };
  };

  return {
    sandbox,
    reportedBatches,
    mockFetchResponses,
    MockWebSocket,
    setFailInvoke: val => { shouldFailInvoke = val; },
    setInvokeHook: hook => { invokeHook = hook; },
    tickInterval: ms => { for (const interval of intervals.values()) if (interval.ms === ms) interval.fn(); },
    flushTimers: async (ms = 50) => {
      await new Promise(r => setTimeout(r, ms));
    },
    triggerWindowFocus: () => {
      const list = windowListeners.get('focus') || [];
      list.forEach(fn => fn());
    },
    triggerVisibilityChange: (hidden = false) => {
      sandbox.document.hidden = hidden;
      const list = documentListeners.get('visibilitychange') || [];
      list.forEach(fn => fn());
    }
  };
}

async function runAllTests() {
  console.log('=== RUNNING TELEMETRY-CAPTURE TEST SUITE IN UI ===\n');

  const rootDir = path.resolve(__dirname, '..');
  const gameplayBridgePath = path.join(rootDir, 'src-tauri', 'src', 'gameplay_bridge.js');
  const gameplayBridgeCode = fs.readFileSync(gameplayBridgePath, 'utf-8');

  // TEST 1: Baseline HTTP / WS state
  console.log('Test 1: Baseline HTTP Before WS & Real Ball Catalog');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    env.mockFetchResponses.set('/api/session', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => FIXTURES.sessionApi })
    }));
    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => FIXTURES.initialPayload })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    assert(env.sandbox.__idleioBridgeMetrics !== undefined, 'Bridge metrics initialized');

    await env.sandbox.fetch('/api/session');
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(80);

    assert(env.reportedBatches.length > 0, 'Batches reported to Tauri via HTTP');
    const welcome = env.reportedBatches[0].events.find(e => e.t === 'welcome');
    assert(welcome !== undefined, 'welcome event emitted');
    assert(welcome.data.catalogoBolas.length === 22, 'Catalog includes four standard and eighteen elemental ball types');
    assert(welcome.data.catalogoBolas.find(b => b.id === 4).priceGold === 130, 'Ultra ball price is 130');
  }

  // TEST 2: Bug Reproduction & Verification: awaitingSnapshot must NOT wipe wireState or deadlock deltas
  console.log('\nTest 2: Bug Reproduction: awaitingSnapshot must NOT wipe wireState or deadlock delta patches');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    let currentGameResponse = FIXTURES.initialPayload;
    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => currentGameResponse })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    // Step A: Baseline full snapshot established
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(60);
    assert(env.reportedBatches.length > 0, 'Baseline established');

    // Step B: Simulate temporary invoke failure (sets awaitingSnapshot = true and queues delivery_failed gap)
    env.setFailInvoke(true);
    // Send a delta patch while invoke is failing
    currentGameResponse = FIXTURES.deltaPatchPayload;
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(40);

    assert(env.sandbox.__idleioBridgeMetrics.failures > 0, 'Invoke failure recorded');

    // Step C: Backend recovers
    env.setFailInvoke(false);
    await env.flushTimers(60);

    // Step D: Now send subsequent delta patch 2 (base matches revision of deltaPatchPayload)
    currentGameResponse = FIXTURES.deltaPatch2Payload;
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(60);

    const allEvents = env.reportedBatches.flatMap(b => b.events);
    const gapEvents = allEvents.filter(e => e.t === 'telemetry_gap');
    const patchGap = gapEvents.find(e => e.data.reason === 'patch_gap');

    // CRITICAL: A valid contiguous delta patch MUST NOT trigger patch_gap or wipe wireState!
    assert(patchGap === undefined, 'No bogus patch_gap triggered for valid contiguous delta patch');

    // Telemetry must have recovered and produced a valid estado snapshot with updated gold
    const finalEstado = allEvents.filter(e => e.t === 'estado').pop();
    assert(finalEstado !== undefined, 'Full estado snapshot emitted upon recovery');
    assert(finalEstado.data.gold === 155250, 'Gold updated to 155250 through applied delta patches without deadlock');
    assert(finalEstado.data.cheio === true, 'Estado has cheio: true to restore live in Rust');
    assert(finalEstado.data.catalogoBolas !== undefined && finalEstado.data.catalogoBolas.length === 22, 'Estado includes the complete catalog to restore it in Rust');
  }

  // TEST 3: Buffer Limit / Queue Overflow Recovery without Wiping wireState
  console.log('\nTest 3: Buffer Limit / Queue Overflow Recovery without Wiping wireState');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    let currentGameResponse = FIXTURES.initialPayload;
    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => currentGameResponse })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    // Baseline
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(60);

    // Fill buffer beyond MAX_EVENTS (256) to trigger buffer_limit invalidate
    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateOpen();

    // Ingest 260 rapid activity events
    for (let i = 0; i < 260; i++) {
      ws.simulateMessage({
        t: 'morte',
        data: { quem: 'selvagem', nome: 'Pidgey', ouro: 10, xp: 20 }
      });
    }
    await env.flushTimers(60);

    const allEvents = env.reportedBatches.flatMap(b => b.events);
    const bufferGap = allEvents.find(e => e.t === 'telemetry_gap' && e.data.reason === 'buffer_limit');
    assert(bufferGap !== undefined, 'buffer_limit gap emitted when queue exceeded MAX_EVENTS');

    // Now send valid delta patch: wireState must have been preserved so patch applies cleanly!
    currentGameResponse = FIXTURES.deltaPatchPayload;
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(60);

    const eventsAfterPatch = env.reportedBatches.flatMap(b => b.events);
    const recoveredEstado = eventsAfterPatch.filter(e => e.t === 'estado').pop();
    assert(recoveredEstado !== undefined, 'State recovered successfully after buffer_limit');
    assert(recoveredEstado.data.gold === 155020, 'Gold correctly reflects patched value (155020)');
  }

  // TEST 4: Time / Window Focus Resumption and Stalled Flush Recovery
  console.log('\nTest 4: Time / Window Focus Resumption & Live State Preservation');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => FIXTURES.initialPayload })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    // Establish baseline
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(60);

    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateOpen();
    await env.flushTimers(30);

    assert(env.sandbox.__idleioTelemetryLive === true, 'Telemetry is live when socket is open');

    // Simulate tab blur / window hidden
    env.triggerVisibilityChange(true);

    // Simulate temporary delivery failure while hidden
    env.setFailInvoke(true);
    ws.simulateMessage({
      wireVersion: 1,
      base: "epoch_101:1",
      revision: "epoch_101:2",
      patch: [{ path: ["coins"], value: 155020 }]
    });
    await env.flushTimers(30);

    // Now user focuses back to the window
    env.setFailInvoke(false);
    env.triggerVisibilityChange(false);
    env.triggerWindowFocus();
    await env.flushTimers(60);

    assert(env.sandbox.__idleioTelemetryLive === true, 'Telemetry live restored on window focus');

    const allEvents = env.reportedBatches.flatMap(b => b.events);
    const latestEstado = allEvents.filter(e => e.t === 'estado').pop();
    assert(latestEstado !== undefined, 'State snapshot emitted on focus recovery');
    assert(latestEstado.data.gold === 155020, 'State reflects current gold (155020)');
  }

  // TEST 5: Real Invalid Base Patch Detection (patch_gap) is Preserved
  console.log('\nTest 5: Real Invalid Base Patch Detection (patch_gap) Preserved');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    let currentGameResponse = FIXTURES.initialPayload;
    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => currentGameResponse })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);

    // Send payload with mismatched base
    currentGameResponse = FIXTURES.invalidBasePatchPayload;
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);

    const allEvents = env.reportedBatches.flatMap(b => b.events);
    const gap = allEvents.find(e => e.t === 'telemetry_gap' && e.data.reason === 'patch_gap');
    assert(gap !== undefined, 'Mismatched base patch correctly triggers patch_gap');
  }

  // TEST 6: Session Bounds & Counter Deduplication Preservation
  console.log('\nTest 6: Session Bounds & Counter Deduplication Preservation');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => FIXTURES.initialPayload })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);

    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateOpen();

    // Send 120 capture events to test bounding to 100
    for (let i = 0; i < 120; i++) {
      ws.simulateMessage({
        wireVersion: 1,
        base: `epoch_101:${i + 1}`,
        revision: `epoch_101:${i + 2}`,
        patch: [{ path: ["huntAnalyzer", "kills"], value: 60 + i }],
        events: [{
          eventId: `cap_ev_${i}`,
          kind: 'capture',
          speciesId: 25,
          pokemon: { id: `pk_${i}`, speciesId: 25, level: 10, name: 'Pikachu' },
          emittedAt: Date.now() + i
        }]
      });
    }
    await env.flushTimers(100);

    const allEvents = env.reportedBatches.flatMap(b => b.events);
    const latestEstado = allEvents.filter(e => e.t === 'estado').pop().data;

    assert(Array.isArray(latestEstado.captureHistory), 'captureHistory is an array');
    assert(latestEstado.captureHistory.length <= 100, `captureHistory strictly bounded to 100 (actual: ${latestEstado.captureHistory.length})`);

    // Verify duplicate event ID is ignored
    const batchesBeforeDup = env.reportedBatches.length;
    ws.simulateMessage({
      t: 'morte',
      eventId: 'cap_ev_0', // Already seen!
      data: { quem: 'selvagem', nome: 'Duplicate', ouro: 999, xp: 999 }
    });
    await env.flushTimers(50);

    const newBatches = env.reportedBatches.slice(batchesBeforeDup);
    const dupEvents = newBatches.flatMap(b => b.events).filter(e => e.data?.name === 'Duplicate');
    assert(dupEvents.length === 0, 'Duplicate eventId was successfully suppressed');
  }

  // TEST 7: huntAnalysisTotals Exact Math & Counter Integrity
  console.log('\nTest 7: huntAnalysisTotals Exact Math & Counter Integrity');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    // Exact coordinator case: coins 15, capture 50, supply 7, seconds 60, autoSaleCoins 999
    // reward = 15 + 0 + 50 = 65, net = 65 - 7 = 58 -> balance: 58, gph: 3480
    // autoSaleCoins (999) must NOT be added!
    const payload = {
      wireVersion: 1,
      revision: "rev_exact_1",
      progress: {
        ...FIXTURES.initialGameProgress,
        coins: 15,
        huntAnalyzer: {
          version: 1,
          route: "test-route",
          startedAt: 1729210000000,
          seconds: 60,
          kills: 5,
          xp: 2000,
          coins: 15,
          autoSaleCoins: 999,
          captures: 1,
          captureValue: 50,
          supplyCost: 7,
          drops: {}
        }
      }
    };

    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => payload })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);

    const welcome = env.reportedBatches[0].events.find(e => e.t === 'welcome');
    const ha = welcome.data.estado.huntAnalyzer;
    assert(ha.balance === 58, 'Exact case balance = reward (65) - supplyCost (7) = 58');
    assert(ha.gph === 3480, 'Exact case gph = net (58) * 3600 / 60 = 3480');
    assert(ha.balance !== (58 + 999), 'autoSaleCoins (999) was NOT added to balance');
  }

  // TEST 8: Consumables & Ball Normalization without Duplication
  console.log('\nTest 8: Consumables & Ball Normalization without Duplication');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    const payload = {
      wireVersion: 1,
      revision: "rev_consumables_1",
      progress: {
        ...FIXTURES.initialGameProgress,
        balls: 9,
        greatBalls: 4,
        ultraBalls: 2,
        potions: 5,
        greatPotions: 2,
        revives: 3
      }
    };

    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => payload })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);

    const welcome = env.reportedBatches[0].events.find(e => e.t === 'welcome');
    const st = welcome.data.estado;
    assert(st.potions === 7, 'Potions normalized to 7 (5 potions + 2 greatPotions)');
    assert(st.revives === 3, 'Revives normalized to 3');
    assert(st.ballsKnown === true, 'ballsKnown is true');
    assert(st.inventoryKnown === true, 'inventoryKnown is true');
  }

  // TEST 9: WebSocket Disconnect & Reconnect Snapshot Re-sync
  console.log('\nTest 9: WebSocket Disconnect & Reconnect Snapshot Re-sync');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);

    env.mockFetchResponses.set('/api/game', () => ({
      status: 200, ok: true,
      clone: () => ({ json: async () => FIXTURES.initialPayload })
    }));

    vm.runInContext(gameplayBridgeCode, env.sandbox);

    // Initial state
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);

    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateOpen();
    await env.flushTimers(50);

    // Simulate disconnect
    ws.close();
    await env.flushTimers(50);
    assert(env.sandbox.__idleioTelemetryLive === false, 'Telemetry live false on WS disconnect');

    // Reconnect
    const ws2 = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws2.simulateOpen();
    await env.flushTimers(50);

    assert(env.sandbox.__idleioTelemetryLive === true, 'Telemetry live restored on WS reconnect');
    const beforePayload = env.reportedBatches.flatMap(b => b.events);
    assert(beforePayload.at(-1).t === 'disconnected', 'Opening a socket alone does not replay stale account data');
    ws2.simulateMessage(FIXTURES.initialPayload);
    await env.flushTimers(50);
    const allEvents = env.reportedBatches.flatMap(b => b.events);
    const estadoOnOpen = allEvents.filter(e => e.t === 'estado').pop();
    assert(estadoOnOpen !== undefined, 'Observed reconnect payload restores state');
    assert(estadoOnOpen.data.catalogoBolas !== undefined, 'Catalogo bolas included on reconnect');
  }

  console.log('\nTest 10: Disconnect during a gap acknowledgement cannot revive cached state');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);
    vm.runInContext(gameplayBridgeCode, env.sandbox);
    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateOpen();
    ws.simulateMessage(FIXTURES.initialPayload);
    await env.flushTimers(50);
    let resolveGap, sawGap = false, failOnce = true;
    const held = new Promise(resolve => { resolveGap = resolve; });
    env.setInvokeHook(async (_cmd, args) => {
      if (args.events.some(e => e.t === 'telemetry_gap')) { sawGap = true; await held; }
      else if (failOnce) { failOnce = false; throw new Error('temporary IPC failure'); }
    });
    ws.simulateMessage(FIXTURES.deltaPatchPayload);
    await env.flushTimers(60);
    assert(sawGap, 'Gap acknowledgement is held in flight');
    ws.close();
    resolveGap();
    await env.flushTimers(60);
    assert(env.reportedBatches.flatMap(b => b.events).at(-1).t === 'disconnected', 'Gap ack cannot append a snapshot after disconnect');
    env.sandbox.state = FIXTURES.initialGameProgress;
    env.tickInterval(2500);
    env.triggerWindowFocus();
    env.triggerVisibilityChange(false);
    await env.flushTimers(40);
    assert(env.sandbox.__idleioTelemetryLive === false, 'Focus and periodic cache sampling do not revive a closed source');
    assert(env.reportedBatches.flatMap(b => b.events).at(-1).t === 'disconnected', 'No stale telemetry follows the explicit disconnect');
    env.mockFetchResponses.set('/api/game', () => ({ status: 200, ok: true, clone: () => ({ json: async () => FIXTURES.initialPayload }) }));
    await env.sandbox.fetch('/api/game');
    await env.flushTimers(50);
    assert(env.sandbox.__idleioTelemetryLive === true, 'A real HTTP payload can recover telemetry while WebSocket is closed');
    assert(env.reportedBatches.flatMap(b => b.events).at(-1).t !== 'disconnected', 'HTTP recovery reaches native telemetry');
  }

  console.log('\nTest 11: Rejected old delivery cannot erase a queued disconnect');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);
    vm.runInContext(gameplayBridgeCode, env.sandbox);
    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateOpen();
    ws.simulateMessage(FIXTURES.initialPayload);
    await env.flushTimers(50);
    let rejectBatch, started = false;
    const held = new Promise((_resolve, reject) => { rejectBatch = reject; });
    env.setInvokeHook(async () => { if (!started) { started = true; await held; } });
    ws.simulateMessage(FIXTURES.deltaPatchPayload);
    await env.flushTimers(25);
    assert(started, 'Normal batch is held in flight');
    ws.close();
    rejectBatch(new Error('late rejection'));
    await env.flushTimers(60);
    assert(env.reportedBatches.flatMap(b => b.events).at(-1).t === 'disconnected', 'Late rejection preserves the newer disconnect');
    assert(env.sandbox.__idleioTelemetryLive === false, 'Rejected older delivery cannot revive the connection');
  }

  console.log('\nTest 12: Repeated entity IDs are not unique event IDs');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);
    vm.runInContext(gameplayBridgeCode, env.sandbox);
    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    const message = { t: 'morte', id: 25, data: { quem: 'selvagem', nome: 'Fixture target', ouro: 1, xp: 1 } };
    ws.simulateMessage(message);
    ws.simulateMessage(message);
    await env.flushTimers(50);
    const events = env.reportedBatches.flatMap(b => b.events).filter(e => e.t === 'activity' && e.data.name === 'Fixture target');
    assert(events.length === 2, 'Two real actions with the same entity ID are both retained');
  }

  console.log('\nTest 13: Ordinary and Normal elemental balls remain independent through wire patches');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);
    vm.runInContext(gameplayBridgeCode, env.sandbox);
    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.simulateMessage({ wireVersion: 1, revision: 'stock:1', progress: {
      uid: 'stock-fixture', team: [], balls: 23, normalBalls: 7,
      fireBalls: 11, autoCaptureBall: 'normalBalls'
    } });
    await env.flushTimers();
    const welcome = env.reportedBatches.flatMap(b => b.events).find(e => e.t === 'welcome');
    assert(welcome.data.estado.balls['1'] === 23, 'Ordinary Poke Ball stock remains 23');
    assert(welcome.data.estado.balls.normalBalls === 7, 'Normal elemental stock remains separate at 7');
    assert(welcome.data.catalogoBolas.some(b => b.key === 'normalBalls'), 'Native catalog identifies Normal elemental balls');
    assert(welcome.data.catalogoBolas.some(b => b.key === 'fireBalls'), 'Native catalog identifies Fire elemental balls');
    ws.simulateMessage({ wireVersion: 1, base: 'stock:1', revision: 'stock:2', patch: [
      { path: ['normalBalls'], value: 0 }, { path: ['balls'], value: 22 }
    ] });
    await env.flushTimers();
    const latest = env.reportedBatches.flatMap(b => b.events).filter(e => e.t === 'estado').at(-1).data;
    assert(latest.balls.normalBalls === 0, 'A wire patch can exhaust only the Normal elemental stock');
    assert(latest.balls['1'] === 22 && latest.balls.fireBalls === 11, 'Independent stocks survive the consumption patch');
  }

  console.log('\nTest 14: WebSocket Heartbeat Keepalive sends {t: "ping"} while socket is open');
  {
    const env = createMockBrowserEnv();
    vm.createContext(env.sandbox);
    vm.runInContext(gameplayBridgeCode, env.sandbox);

    const sentMessages = [];
    const ws = new env.sandbox.WebSocket('wss://pokeascendedworld.com/api/game/socket');
    ws.onSend = msg => sentMessages.push(msg);

    ws.simulateOpen();
    await env.flushTimers(10);

    // Trigger the 20s heartbeat interval
    env.tickInterval(20000);
    await env.flushTimers(10);

    assert(sentMessages.some(m => {
      try {
        const parsed = JSON.parse(m);
        return parsed.t === 'ping';
      } catch (_) { return false; }
    }), 'WebSocket Heartbeat Keepalive sends {t: "ping"} while socket is open');

    // Close socket and ensure heartbeat stops
    ws.close();
    const countBefore = sentMessages.length;
    env.tickInterval(20000);
    await env.flushTimers(10);
    assert(sentMessages.length === countBefore, 'Heartbeat stops sending after socket is closed');
  }

  // SUMMARY
  console.log(`\n========================================`);
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log(`========================================\n`);
}

runAllTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
