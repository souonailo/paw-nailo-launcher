const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

// Synthetic stocks using the supply keys in the public supply-model.js present
// in both supplied HARs. Those HARs contain no recorded gameplay socket frames.
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(require.resolve('./src/ui/inventory-state.js'), 'utf8'), context);
const project = state => context.window.PawInventory.project(state);

test('Normal elemental balls remain independent from ordinary Poke Balls', () => {
  const stock = { ballsKnown: true, ballMap: { '1': 23, normalBalls: 7 } };
  const normal = project({ ...stock, automation: { autoCaptureBall: 'normalBalls' } });
  assert.equal(normal.balls, 7);
  assert.equal(normal.equippedBall.name, 'Bola de Normal');
  const ordinary = project({ ...stock, automation: { autoCaptureBall: 'balls' } });
  assert.equal(ordinary.balls, 23);
  assert.equal(ordinary.equippedBall.name, 'Poké Ball');
});

test('fixed choice preserves zero while other ball types are stocked', () => {
  const result = project({ ballsKnown: true, ballMap: { '1': 12, '4': 0 },
    automation: { autoCaptureBall: 'ultraBalls' } });
  assert.equal(result.balls, 0);
  assert.equal(result.equippedBall.id, '4');
});

test('auto selection falls back from an exhausted observed ball', () => {
  const result = project({ ballsKnown: true, ballMap: { '1': 0, '4': 9 },
    automation: { autoCaptureBall: 'auto' }, lastBallId: 1 });
  assert.equal(result.balls, 9);
  assert.equal(result.equippedBall.id, '4');
});

test('an available observed ball is retained in auto mode', () => {
  const result = project({ ballsKnown: true, ballMap: { '1': 3, '4': 9 },
    automation: { autoCaptureBall: 'auto' }, lastBallId: 1 });
  assert.equal(result.balls, 3);
  assert.equal(result.equippedBall.id, '1');
});

test('unknown stock stays unknown and does not expose cached equipped stock', () => {
  const result = project({ ballsKnown: false, ballMap: { '1': 30 },
    equippedBall: { id: '1', qty: 30 } });
  assert.equal(result.ballsKnown, false);
  assert.equal(result.equippedBall, null);
  assert.equal(Object.keys(result.ballMap).length, 0);
});

test('finite premium and elemental stocks are never inferred to be infinite', () => {
  for (const id of ['5', 'normalBalls', 'fireBalls']) {
    const result = project({ ballsKnown: true, ballMap: { [id]: 1200000 },
      automation: { autoCaptureBall: id } });
    assert.equal(result.balls, 1200000);
    assert.equal(result.equippedBall.infinite, false);
    assert.equal(result.ballMap[id], 1200000);
  }
});

test('explicit infinity remains supported for legacy catalogs', () => {
  for (const stock of ['∞', 4]) {
    const result = project({ ballsKnown: true, ballMap: { '1': stock },
      ballCatalog: [{ id: 1, infinite: true }] });
    assert.equal(result.equippedBall.infinite, true);
  }
});

test('Idle Ball and elemental fallback names match the public supply model', () => {
  for (const [id, name] of [['5', 'Idle Ball'], ['fireBalls', 'Bola de Fogo'], ['fairyBalls', 'Bola de Fada']]) {
    const result = project({ ballsKnown: true, ballMap: { [id]: 4 } });
    assert.equal(result.equippedBall.name, name);
  }
});

test('automatic fallback compares capture multipliers instead of string IDs', () => {
  const result = project({ ballsKnown: true, ballMap: { fireBalls: 8, '4': 9 },
    automation: { autoCaptureBall: 'auto' } });
  assert.equal(result.equippedBall.id, '4');
  assert.equal(result.balls, 9);
});

test('legacy KPI snapshots and multiple configured IDs retain their behavior', () => {
  const legacy = { balls: 42, potions: 7 };
  assert.equal(project(legacy), legacy);
  const result = project({ ballsKnown: true, ballMap: { '1': 0, '2': 8, '4': 9 },
    automation: { ballIds: [1, 2], autoCaptureBall: 'ultraBalls' } });
  assert.equal(result.equippedBall.id, '2');
  assert.equal(result.balls, 8);
});

test('top-level PAW preference is accepted without overriding automation', () => {
  const result = project({ ballsKnown: true, ballMap: { '1': 2, '4': 8 },
    autoCaptureBall: 'balls' });
  assert.equal(result.balls, 2);
});
