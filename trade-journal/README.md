# Trade-Journal

Einfache Web-App ohne Abhängigkeiten zum Erfassen von Trades (Datum, Symbol, Richtung, Einstieg, Ausstieg, Stückzahl).

**Starten:** `index.html` im Browser öffnen – kein Server, kein Build nötig.

## Kennzahlen

| Kennzahl | Berechnung |
|---|---|
| Gewinn/Verlust je Trade | Long: (Ausstieg − Einstieg) × Stück · Short: (Einstieg − Ausstieg) × Stück |
| Trefferquote | Gewinner ÷ alle Trades (Break-even zählt nicht als Treffer) |
| Gewinn/Verlust gesamt | Summe aller Trades |
| Chance-Risiko-Verhältnis | Ø Gewinn der Gewinner ÷ Ø Verlust der Verlierer (realisiert) |

Gebühren und Steuern werden nicht berücksichtigt. Das CRV ist das *realisierte* Verhältnis; ein geplantes CRV bräuchte zusätzlich Stop-Loss und Kursziel je Trade.

## Daten

Trades werden nur im `localStorage` dieses Browsers gespeichert. Für eine Sicherung bzw. den Umzug auf ein anderes Gerät: **CSV exportieren** / **CSV importieren** (Trennzeichen `;`, Datum `JJJJ-MM-TT`).

## Tests

```bash
node --test test/*.test.js
```
