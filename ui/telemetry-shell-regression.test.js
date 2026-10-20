const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the actual collector/status functions without starting authenticated games.
function fixture(live = true) {
  const source = fs.readFileSync(require.resolve('./src/ui/pokeleaf-shell.js'), 'utf8');
  const start = source.indexOf('  const states = new Map();');
  const end = source.indexOf('  let collecting = false;', start);
  assert.ok(start >= 0 && end > start, 'shell collector boundary exists');
  const sample = { i: 0, ok: true, live, name: 'Trainer', cid: 'fixture-1', level: 42,
    hunt: 'fixture-hunt', team: [{ name: 'Fixture', hp: 12 }],
    ballsKnown: true, balls: 0, a: { kills: 20, seconds: 120, xph: 0 } };
  const cache = { 0: { t: Date.now() - 60000, d: sample } };
  const context = vm.createContext({
    Date, Map, Promise, Set, Boolean, String, Number,
    stCache: cache, window: { stCache: cache },
    accounts: [{ name: 'Trainer', email: 'fixture@example.invalid', senha: 'fixture' }],
    off: [false], webviews: [{}],
    grid: { children: [{ querySelector: () => null }] },
    isPlaceholderName: name => !name || name.startsWith('Personagem '),
    readPanelState: async () => { throw new Error('Consulta ao jogo excedeu o tempo limite'); },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.collect = collectOne; globalThis.status = stateStatus;', context);
  return { context, cache, sample };
}

test('an expired snapshot survives a guest read timeout without refreshing its age', async () => {
  const { context, cache, sample } = fixture();
  const timestamp = cache[0].t;
  const result = await context.collect(0);
  assert.equal(result.cid, sample.cid);
  assert.equal(result.team[0].name, 'Fixture');
  assert.equal(result.a.kills, 20);
  assert.equal(result.balls, 0);
  assert.equal(cache[0].t, timestamp, 'fallback must not masquerade as a fresh observation');
});

test('an explicit disconnect remains offline even with last known level, team and hunt', () => {
  const { context, sample } = fixture(false);
  assert.notEqual(context.status(sample)[0], 'live');
});

test('the actual panel footer distinguishes large finite stock, explicit infinity and unknown stock', () => {
  const source = fs.readFileSync(require.resolve('./src/ui/pokeleaf-shell.js'), 'utf8');
  const start = source.indexOf('  function decoratePanels(arr) {');
  const end = source.indexOf('  function syncAudioState()', start);
  assert.ok(start >= 0 && end > start);
  const footer = { __leafInit: true, __leafSprite: '' };
  const balls = { textContent: '' }, ballBox = {}, hunt = { textContent: '' };
  const nodes = { '.leaf-panel-footer': footer, '.pf-balls-val': balls,
    '.pf-balls': ballBox, '.pf-hunt-val': hunt };
  const context = vm.createContext({
    window: {}, grid: { style: { getPropertyValue: () => '1' } },
    $$: () => [{}], $: selector => nodes[selector] ?? null,
    getLead: () => null, pokeSprite: () => '', prettyHunt: value => value,
    fmtCompact: value => String(value),
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.render = decoratePanels;', context);
  const state = { i: 0, hunt: 'Fixture', ballsKnown: true, balls: 1200000,
    equippedBall: { name: 'Idle Ball', infinite: false } };
  context.render([state]);
  assert.equal(balls.textContent, '1200000');
  assert.equal(ballBox.title, 'Idle Ball: 1200000');
  context.render([{ ...state, equippedBall: { name: 'Fixture', infinite: true } }]);
  assert.equal(balls.textContent, '∞');
  context.render([{ ...state, ballsKnown: false }]);
  assert.equal(balls.textContent, '—');
});

test('a successful read preserves authoritative zero stock and explicit offline status', async () => {
  const { context, sample } = fixture();
  sample.balls = 50;
  context.readPanelState = async () => ({ ...sample, live: false, balls: 0,
    ballsKnown: true, ballMap: { balls: 0 } });
  const result = await context.collect(0);
  assert.equal(result.balls, 0);
  assert.equal(result.live, false);
});

test('clearing an account while a read is in flight cannot resurrect its previous character', async () => {
  const { context, cache } = fixture();
  context.readPanelState = async () => { delete cache[0]; throw new Error('view replaced'); };
  const result = await context.collect(0);
  assert.equal(result.cid, undefined);
  assert.equal(cache[0], undefined);
});

test('a late guest read cannot overwrite a newer pushed snapshot', async () => {
  const source = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const start = source.indexOf('    function readPanelState(i) {');
  const end = source.indexOf('    // Depot por conta', start);
  assert.ok(start >= 0 && end > start);
  let resolveRead;
  const pending = new Promise(resolve => { resolveRead = resolve; });
  const cache = { 0: { t: 1, d: { ok: true, cid: 'same', level: 1 } } };
  const context = vm.createContext({
    Promise, Date, stCache: cache, webviews: [{}],
    stateReads: { read: () => pending },
    window: { PawNailo: { dispatchTelemetry: (i, d) => {
      cache[i] = { t: Date.now(), d };
      return d;
    } } },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.read = readPanelState;', context);
  const result = context.read(0);
  const pushed = { ok: true, cid: 'same', level: 99 };
  cache[0] = { t: Date.now(), d: pushed };
  resolveRead({ ok: true, cid: 'same', level: 1 });
  await result;
  assert.equal(cache[0].d.level, 99);
});

async function watchdogFixture({ reject = false, portalExists = true, appHidden = true, portalHidden = false } = {}) {
  const source = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const start = source.indexOf('    const lastPush = Array(4).fill(0);');
  const end = source.indexOf('    // ----- Idioma:', start);
  assert.ok(start >= 0 && end > start);
  let tick, reloads = 0, reads = 0;
  const app = { classList: { contains: () => appHidden } };
  const portal = { hidden: portalHidden, classList: { contains: () => portalHidden } };
  const guest = { document: { getElementById: id => id === 'app' ? app : portalExists ? portal : null } };
  const wv = {
    executeJavaScript: async script => {
      reads++;
      if (script === 'resume-push') return null;
      if (reject) throw new Error('guest query timeout');
      return vm.runInNewContext(script, guest);
    },
    reload: () => { reloads++; },
  };
  const context = vm.createContext({
    Array, Boolean, Date: { now: () => 400000 },
    webviews: [wv], off: [false], dlgT: [0], isLoggingIn: [false],
    window: { pokeAPI: { logError: () => {} } },
    PUSH_STATE: () => 'resume-push',
    setInterval: callback => { tick = callback; },
  });
  vm.runInContext(source.slice(start, end) + '\nlastPush.fill(1);', context);
  tick();
  await new Promise(resolve => setImmediate(resolve));
  return { reloads, reads };
}

test('telemetry watchdog preserves a game session after a guest query timeout', async () => {
  const result = await watchdogFixture({ reject: true });
  assert.equal(result.reloads, 0);
  assert.equal(result.reads, 2, 'retry the collector without reloading the game');
});

test('watchdog requires a visible login portal and hidden game before reloading', async () => {
  assert.equal((await watchdogFixture({ portalExists: false })).reloads, 0);
  assert.equal((await watchdogFixture({ appHidden: false })).reloads, 0);
  assert.equal((await watchdogFixture({ portalHidden: true })).reloads, 0);
  assert.equal((await watchdogFixture()).reloads, 1, 'confirmed stale login can still recover');
});
