# Trading-Journal

Ein Trading-Journal als **einzelne Datei** (`index.html`): HTML, CSS und JavaScript in einer Datei, keine Installation, keine Internetverbindung nötig. Oberfläche auf Deutsch, auch fürs Handy.

## Öffnen

- **Computer:** `index.html` herunterladen und doppelklicken (öffnet im Standardbrowser).
- **Handy:** Datei aufs Handy laden (z. B. über Cloud-Speicher oder per Mail) und mit dem Browser öffnen.

Die Daten liegen im Speicher *des jeweiligen Browsers* für genau diese Datei. Anderer Browser, anderes Gerät oder anderer Speicherort der Datei = leeres Journal. Zum Übertragen und als Sicherung: **CSV exportieren** und dort **CSV importieren**.

## Funktionen

- Trades erfassen: Datum, Uhrzeit, Symbol, Long/Short, Einstieg, Ausstieg, Stückzahl, Stop-Loss, Gebühren, Strategie (Auswahl, eigene ergänzbar), Notiz
- Tabelle mit Bearbeiten (✎) und Löschen (✕)
- Auswertung, Diagramme und Tabelle folgen dem Filter (Zeitraum, Symbol, Strategie)
- CSV mit `;` und Dezimalkomma (öffnet direkt in deutschem Excel); Import überspringt Duplikate und meldet fehlerhafte Zeilen

## Berechnungen

| Kennzahl | Berechnung |
|---|---|
| G/V netto je Trade | Long: (Ausstieg − Einstieg) × Stück − Gebühren · Short: (Einstieg − Ausstieg) × Stück − Gebühren |
| CRV je Trade (R) | G/V netto ÷ Anfangsrisiko, Anfangsrisiko = \|Einstieg − Stop-Loss\| × Stück |
| Chance-Risiko-Verhältnis | Ø R der Gewinner-Trades mit Stop-Loss, angezeigt als „x : 1“ |
| Erwartungswert | Ø R über alle Trades mit Stop-Loss |
| Trefferquote | Gewinner ÷ alle Trades (±0 zählt nicht als Gewinner) |
| Gewinn-/Verlustserie | Längste Folge in zeitlicher Reihenfolge (Datum + Uhrzeit); ±0 unterbricht die Serie |

Trades ohne Stop-Loss zählen bei allen Kennzahlen mit, nur nicht beim CRV und beim Erwartungswert.

## Tests

Die Rechenlogik steht im Block `<script id="journal-core">` und wird direkt aus `index.html` getestet:

```bash
node --test test/*.test.js
```
