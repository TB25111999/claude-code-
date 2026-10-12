// UI-Logik: Formular, Tabelle, Kennzahlen, lokale Speicherung und CSV-Export/-Import.
(function () {
  'use strict';

  const { tradePnl, computeStats, validateTrade } = window.TradeStats;
  const STORAGE_KEY = 'trade-journal.v1';
  const CSV_HEADER = 'datum;symbol;richtung;einstieg;ausstieg;stueck';

  const money = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 });
  const pct = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 });

  const $ = (id) => document.getElementById(id);
  const form = $('trade-form');
  const errorEl = $('form-error');
  const rows = $('trade-rows');

  let trades = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      // Gespeicherte Daten erneut validieren, damit kaputte Einträge die App nicht stören.
      return Array.isArray(parsed)
        ? parsed.map((t) => validateTrade(t).trade).filter(Boolean).map(withId)
        : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    } catch {
      errorEl.textContent = 'Speichern im Browser nicht möglich – bitte CSV exportieren.';
    }
  }

  function withId(trade) {
    return { ...trade, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()) };
  }

  function signed(value, el) {
    el.textContent = (value > 0 ? '+' : '') + money.format(value);
    el.classList.toggle('pos', value > 0);
    el.classList.toggle('neg', value < 0);
  }

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function render() {
    const s = computeStats(trades);

    $('k-winrate').textContent = s.winRate === null ? '–' : pct.format(s.winRate);
    $('k-winrate-hint').textContent = s.count ? `${s.wins} Gewinner, ${s.losses} Verlierer` : '';
    signed(s.totalPnl, $('k-pnl'));
    $('k-pnl-hint').textContent = s.count ? `+${money.format(s.grossProfit)} / −${money.format(s.grossLoss)}` : '';
    $('k-crv').textContent = s.crv === null ? '–' : `${plain.format(Math.round(s.crv * 100) / 100)} : 1`;
    $('k-count').textContent = String(s.count);
    $('k-count-hint').textContent = s.breakeven ? `davon ${s.breakeven} Break-even` : '';

    rows.replaceChildren();
    if (!trades.length) {
      const tr = document.createElement('tr');
      const td = cell('Noch keine Trades erfasst.', 'empty');
      td.colSpan = 8;
      tr.append(td);
      rows.append(tr);
      return;
    }

    const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));
    for (const t of sorted) {
      const tr = document.createElement('tr');
      const pnlCell = cell('', 'num');
      signed(tradePnl(t), pnlCell);

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.title = 'Trade löschen';
      del.setAttribute('aria-label', `Trade ${t.symbol} vom ${t.date} löschen`);
      del.addEventListener('click', () => {
        trades = trades.filter((x) => x.id !== t.id);
        save();
        render();
      });
      const actions = cell('', 'row-actions');
      actions.append(del);

      tr.append(
        cell(new Date(t.date + 'T00:00:00').toLocaleDateString('de-DE')),
        cell(t.symbol),
        cell(t.side === 'short' ? 'Short' : 'Long'),
        cell(plain.format(t.entry), 'num'),
        cell(plain.format(t.exit), 'num'),
        cell(plain.format(t.quantity), 'num'),
        pnlCell,
        actions,
      );
      rows.append(tr);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    // Deutsches Dezimalkomma zulassen.
    for (const key of ['entry', 'exit', 'quantity']) data[key] = String(data[key]).replace(',', '.');

    const result = validateTrade(data);
    errorEl.classList.remove('ok');
    if (result.error) {
      errorEl.textContent = result.error;
      return;
    }
    errorEl.textContent = '';
    trades.push(withId(result.trade));
    save();
    render();

    const keepDate = form.date.value;
    form.reset();
    form.date.value = keepDate;
    form.symbol.focus();
  });

  $('export-csv').addEventListener('click', () => {
    const lines = trades.map((t) => [t.date, t.symbol, t.side, t.entry, t.exit, t.quantity].join(';'));
    const blob = new Blob([[CSV_HEADER, ...lines].join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('import-csv').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    let added = 0, skipped = 0;

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trim().toLowerCase() === CSV_HEADER) continue;
      const [date, symbol, side, entry, exit, quantity] = line.split(';');
      const result = validateTrade({ date, symbol, side, entry, exit, quantity });
      if (result.trade) { trades.push(withId(result.trade)); added++; } else { skipped++; }
    }

    save();
    render();
    errorEl.classList.toggle('ok', !skipped);
    errorEl.textContent = `${added} Trade(s) importiert` + (skipped ? `, ${skipped} ungültige Zeile(n) übersprungen.` : '.');
    event.target.value = '';
  });

  form.date.value = new Date().toISOString().slice(0, 10);
  render();
})();
