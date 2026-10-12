// Testet die Rechenlogik direkt aus index.html (Block <script id="journal-core">).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = html.match(/<script id="journal-core">([\s\S]*?)<\/script>/)[1];
// Eigener Kontext: Arrays von dort mit [...x] kopieren, bevor deepEqual sie vergleicht.
const sandbox = { module: { exports: {} } };
vm.runInNewContext(core, sandbox);
const J = sandbox.module.exports;

const t = (o = {}) => J.validateTrade({
  date: '2026-01-05', time: '09:30', symbol: 'X', side: 'long',
  entry: 100, exit: 110, quantity: 10, stop: null, fees: 0, strategy: 'Breakout', note: '', ...o,
}).trade;

test('parseNum: Dezimalkomma, Tausenderpunkt, leer, ungültig', () => {
  assert.equal(J.parseNum('1,5'), 1.5);
  assert.equal(J.parseNum('1.234,5'), 1234.5);
  assert.equal(J.parseNum('2.5'), 2.5);
  assert.equal(J.parseNum(''), null);
  assert.ok(Number.isNaN(J.parseNum('abc')));
});

test('validateTrade: normalisiert Eingaben', () => {
  const { trade } = J.validateTrade({
    date: '2026-03-02', time: '14:05:00', symbol: ' dax ', side: 'Short', entry: '18000,5', exit: '17950',
    quantity: '2', stop: '18050', fees: '', strategy: '', note: '  Test ',
  });
  assert.deepEqual({ ...trade }, {
    date: '2026-03-02', time: '14:05', symbol: 'DAX', side: 'short', entry: 18000.5, exit: 17950,
    quantity: 2, stop: 18050, fees: 0, strategy: 'Ohne Strategie', note: 'Test',
  });
});

test('validateTrade: lehnt Ungültiges ab', () => {
  const bad = (o) => J.validateTrade({ date: '2026-03-02', symbol: 'A', entry: 1, exit: 1, quantity: 1, ...o }).error;
  assert.ok(bad({ date: '2026-02-30' }));
  assert.ok(bad({ time: '25:00' }));
  assert.ok(bad({ symbol: '<script>' }));
  assert.ok(bad({ entry: 0 }));
  assert.ok(bad({ quantity: '-1' }));
  assert.ok(bad({ fees: '-2' }));
  assert.ok(bad({ entry: 100, stop: 105 }), 'Long-Stop über Einstieg');
  assert.ok(bad({ side: 'short', entry: 100, stop: 95 }), 'Short-Stop unter Einstieg');
});

test('G/V netto und R-Multiple', () => {
  const long = t({ entry: 100, exit: 110, quantity: 10, stop: 95, fees: 5 });
  assert.equal(J.netPnl(long), 95);           // 100 brutto − 5 Gebühren
  assert.equal(J.riskAmount(long), 50);       // (100 − 95) × 10
  assert.equal(J.rMultiple(long), 1.9);
  const short = t({ side: 'short', entry: 100, exit: 90, quantity: 2, stop: 105 });
  assert.equal(J.netPnl(short), 20);
  assert.equal(J.rMultiple(short), 2);
  assert.equal(J.rMultiple(t()), null);       // ohne Stop kein R
});

test('computeStats: Kennzahlen und Serien', () => {
  const list = [
    t({ date: '2026-01-05', exit: 120, stop: 90 }),            // +200, 2 R
    t({ date: '2026-01-06', exit: 110, stop: 95 }),            // +100, 2 R
    t({ date: '2026-01-07', exit: 104, stop: 98 }),            // +40, 2 R (Risiko 20)
    t({ date: '2026-01-08', exit: 95, stop: 90 }),             // −50, −0,5 R
    t({ date: '2026-01-09', exit: 90 }),                       // −100, ohne Stop
    t({ date: '2026-01-10', exit: 100 }),                      // ±0, unterbricht Serie
    t({ date: '2026-01-12', exit: 98, fees: 0 }),              // −20
  ];
  const s = J.computeStats(list);
  assert.equal(s.count, 7);
  assert.equal(s.wins, 3);
  assert.equal(s.losses, 3);
  assert.equal(s.breakeven, 1);
  assert.equal(s.totalPnl, 170);
  assert.equal(s.avgWin, 340 / 3);
  assert.equal(s.avgLoss, 170 / 3);
  assert.equal(s.largestWin.pnl, 200);
  assert.equal(s.largestLoss.pnl, -100);
  assert.equal(s.maxWinStreak, 3);
  assert.equal(s.maxLossStreak, 2);
  assert.equal(s.crv, 2);
  assert.equal(s.expectancyR, (2 + 2 + 2 - 0.5) / 4);
  assert.equal(s.tradesWithStop, 4);
});

test('computeStats: Reihenfolge nach Datum und Uhrzeit, nicht nach Eingabe', () => {
  const s = J.computeStats([
    t({ date: '2026-01-05', time: '15:00', exit: 90 }),
    t({ date: '2026-01-05', time: '09:00', exit: 110 }),
    t({ date: '2026-01-04', time: '10:00', exit: 110 }),
  ]);
  assert.equal(s.maxWinStreak, 2);
  assert.equal(s.maxLossStreak, 1);
});

test('computeStats: leere Liste', () => {
  const s = J.computeStats([]);
  assert.equal(s.winRate, null);
  assert.equal(s.crv, null);
  assert.equal(s.largestWin, null);
  assert.equal(s.maxWinStreak, 0);
});

test('Gruppierung nach Wochentag, Stunde, Strategie und Kapitalkurve', () => {
  const list = [
    t({ date: '2026-01-05', time: '09:15', exit: 110 }),                        // Mo, +100
    t({ date: '2026-01-05', time: '09:45', exit: 95, strategy: 'Pullback' }),   // Mo, −50
    t({ date: '2026-01-11', time: '', exit: 101 }),                             // So, +10, ohne Zeit
  ];
  const day = J.groupPnl(list, J.weekdayIndex);
  assert.equal(day.get(0).value, 50);
  assert.equal(day.get(6).value, 10);
  const hour = J.groupPnl(list, J.hourOf);
  assert.equal(hour.size, 1);
  assert.equal(hour.get(9).count, 2);
  assert.equal(J.groupPnl(list, (x) => x.strategy).get('Pullback').value, -50);
  assert.deepEqual([...J.equityCurve(list).map((p) => p.value)], [100, 50, 60]);
});

test('filterTrades: Zeitraum, Symbol, Strategie', () => {
  const list = [t({ date: '2026-01-05', symbol: 'A' }), t({ date: '2026-02-05', symbol: 'B', strategy: 'News' })];
  assert.equal(J.filterTrades(list, { from: '2026-02-01' }).length, 1);
  assert.equal(J.filterTrades(list, { to: '2026-01-31' }).length, 1);
  assert.equal(J.filterTrades(list, { symbol: 'B' })[0].symbol, 'B');
  assert.equal(J.filterTrades(list, { strategy: 'Breakout' })[0].symbol, 'A');
  assert.equal(J.filterTrades(list, {}).length, 2);
});

test('CSV: Export → Import ergibt dieselben Trades (inkl. Sonderzeichen)', () => {
  const list = [
    t({ stop: 95.5, fees: 1.25, note: 'Mit ; Semikolon, "Zitat"\nund Zeilenumbruch' }),
    t({ side: 'short', entry: 50, exit: 45, stop: 52, strategy: '=SUMME(A1)', note: '' }),
  ];
  const csv = J.toCsv(list);
  assert.ok(csv.includes("'=SUMME(A1)"), 'Formel wird entschärft');
  const { trades, errors } = J.tradesFromCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(trades.length, 2);
  for (let i = 0; i < 2; i++) assert.ok(J.sameTrade(trades[i], J.sortChrono(list)[i]));
});

test('CSV: Import mit alter Kopfzeile und fehlerhaften Zeilen', () => {
  const { trades, errors } = J.tradesFromCsv('datum;symbol;richtung;einstieg;ausstieg;stueck\n2026-01-02;AAPL;long;100;110;5\n2026-13-01;X;long;1;1;1\n');
  assert.equal(trades.length, 1);
  assert.equal(trades[0].fees, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 3);
  assert.ok(J.tradesFromCsv('foo;bar\n1;2').errors[0].error.includes('Kopfzeile'));
});
