const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tradePnl, computeStats, validateTrade } = require('../stats.js');

const t = (entry, exit, quantity, side = 'long') =>
  ({ date: '2026-01-02', symbol: 'X', side, entry, exit, quantity });

test('tradePnl: Long und Short', () => {
  assert.equal(tradePnl(t(100, 110, 10)), 100);
  assert.equal(tradePnl(t(100, 90, 10)), -100);
  assert.equal(tradePnl(t(100, 90, 10, 'short')), 100);
});

test('computeStats: leere Liste', () => {
  const s = computeStats([]);
  assert.equal(s.count, 0);
  assert.equal(s.winRate, null);
  assert.equal(s.totalPnl, 0);
  assert.equal(s.crv, null);
});

test('computeStats: Trefferquote, P/L und CRV', () => {
  // Gewinne: +200, +100 → Ø 150 | Verluste: -50, -100 → Ø 75 | Break-even: 0
  const s = computeStats([t(10, 30, 10), t(10, 20, 10), t(10, 5, 10), t(20, 10, 10), t(10, 10, 5)]);
  assert.equal(s.count, 5);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 2);
  assert.equal(s.breakeven, 1);
  assert.equal(s.winRate, 0.4);
  assert.equal(s.totalPnl, 150);
  assert.equal(s.avgWin, 150);
  assert.equal(s.avgLoss, 75);
  assert.equal(s.crv, 2);
});

test('computeStats: CRV null ohne Verlierer', () => {
  assert.equal(computeStats([t(10, 20, 1)]).crv, null);
});

test('validateTrade: normalisiert und lehnt Ungültiges ab', () => {
  const ok = validateTrade({ date: '2026-03-01', symbol: ' aapl ', entry: '100.5', exit: '101', quantity: '3' });
  assert.deepEqual(ok.trade, { date: '2026-03-01', symbol: 'AAPL', side: 'long', entry: 100.5, exit: 101, quantity: 3 });
  assert.ok(validateTrade({ date: '', symbol: 'A', entry: 1, exit: 1, quantity: 1 }).error);
  assert.ok(validateTrade({ date: '2026-03-01', symbol: '<b>', entry: 1, exit: 1, quantity: 1 }).error);
  assert.ok(validateTrade({ date: '2026-03-01', symbol: 'A', entry: 0, exit: 1, quantity: 1 }).error);
  assert.ok(validateTrade({ date: '2026-03-01', symbol: 'A', entry: 1, exit: 1, quantity: -2 }).error);
  assert.ok(validateTrade({ date: '2026-03-01', symbol: 'A', entry: 'abc', exit: 1, quantity: 1 }).error);
});
