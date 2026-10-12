// Reine Berechnungslogik – ohne DOM, damit sie im Browser und in Node getestet werden kann.
(function (root) {
  'use strict';

  /** Gewinn/Verlust eines Trades. Long: (Ausstieg - Einstieg) * Stück, Short: umgekehrt. */
  function tradePnl(trade) {
    const diff = (trade.exit - trade.entry) * trade.quantity;
    return trade.side === 'short' ? -diff : diff;
  }

  /**
   * Kennzahlen über alle Trades.
   * - Trefferquote: Anteil der Trades mit P/L > 0 (Break-even zählt nicht als Treffer).
   * - CRV (realisiert): Ø Gewinn je Gewinner / |Ø Verlust je Verlierer|.
   *   null, solange es keine Gewinner oder keine Verlierer gibt.
   */
  function computeStats(trades) {
    let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0;

    for (const t of trades) {
      const p = tradePnl(t);
      if (p > 0) { wins++; grossProfit += p; }
      else if (p < 0) { losses++; grossLoss += -p; }
    }

    const count = trades.length;
    const avgWin = wins ? grossProfit / wins : null;
    const avgLoss = losses ? grossLoss / losses : null;

    return {
      count,
      wins,
      losses,
      breakeven: count - wins - losses,
      winRate: count ? wins / count : null,
      totalPnl: grossProfit - grossLoss,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
      crv: avgWin !== null && avgLoss !== null ? avgWin / avgLoss : null,
    };
  }

  /** Prüft und normalisiert eine Eingabe. Gibt { trade } oder { error } zurück. */
  function validateTrade(input) {
    const date = String(input.date || '').trim();
    const symbol = String(input.symbol || '').trim().toUpperCase();
    const side = input.side === 'short' ? 'short' : 'long';
    const entry = Number(input.entry);
    const exit = Number(input.exit);
    const quantity = Number(input.quantity);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Bitte ein gültiges Datum angeben.' };
    if (!/^[A-Z0-9.\-:/]{1,20}$/.test(symbol)) return { error: 'Symbol: 1–20 Zeichen (A–Z, 0–9, . - : /).' };
    if (!(entry > 0) || !Number.isFinite(entry)) return { error: 'Einstieg muss größer als 0 sein.' };
    if (!(exit > 0) || !Number.isFinite(exit)) return { error: 'Ausstieg muss größer als 0 sein.' };
    if (!(quantity > 0) || !Number.isFinite(quantity)) return { error: 'Stückzahl muss größer als 0 sein.' };

    return { trade: { date, symbol, side, entry, exit, quantity } };
  }

  const api = { tradePnl, computeStats, validateTrade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TradeStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
