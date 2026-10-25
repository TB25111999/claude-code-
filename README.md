# Kalorienzähler

Ein Kalorienzähler im Stil von Yazio – als installierbare Web-App (PWA), die auf dem Handy wie eine native App läuft. Alle Daten bleiben lokal auf dem Gerät.

## Funktionen

- **Ernährungstagebuch** mit Frühstück, Mittagessen, Abendessen und Snacks; Kalorienring, Makro-Balken (Kohlenhydrate, Eiweiß, Fett), Wasser-Tracker und 7-Tage-Übersicht. Eigene Mahlzeiten-Slots (z. B. „Vor dem Training“) lassen sich im Profil anlegen, umbenennen und sortieren.
- **Riesige Lebensmitteldatenbank**: Online-Suche in [Open Food Facts](https://world.openfoodfacts.org) (über 3 Mio. Produkte, optional auf Deutschland beschränkt) plus eingebaute Grunddatenbank mit rund 180 Grundlebensmitteln, die auch offline funktioniert.
- **Barcode-Scanner per Kamera**: EAN-13/EAN-8/UPC scannen und sofort Nährwerte, Nutri-Score und Portionsgrößen sehen. Nutzt die native `BarcodeDetector`-API und fällt (z. B. auf dem iPhone) auf die mitgelieferte ZXing-Bibliothek zurück. Alternativ: Foto auswählen oder Barcode eintippen. Unbekannte Produkte können direkt mit dem Barcode angelegt werden.
- **Gerichte (Rezepte)**: aus beliebig vielen Zutaten (gesucht oder gescannt) zusammenstellen, Portionen und optional das Endgewicht angeben – Nährwerte pro Portion werden automatisch berechnet.
- **Mahlzeiten (Vorlagen)**: häufige Kombinationen speichern (auch direkt aus dem Tagebuch über „⋯ → Als Mahlzeit speichern“) und mit einem Tipp eintragen. Mahlzeiten vom Vortag übernehmen.
- **Eigene Lebensmittel**, Favoriten und zuletzt verwendete Lebensmittel.
- **Profil & Ziele**: Kalorienbedarf nach Mifflin-St-Jeor aus Geschlecht, Alter, Größe, Gewicht, Aktivität und Ziel; einstellbare Makro-Verteilung; Gewichtsverlauf.
- Export/Import aller Daten als JSON, Dark Mode, offline nutzbar.

## Starten

Es ist kein Build-Schritt nötig – es sind reine statische Dateien.

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Die Kamera funktioniert nur über **HTTPS** (oder `localhost`). Für die Nutzung auf dem Handy:

1. Im GitHub-Repository unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** wählen.
2. Nach einem Push auf `main` veröffentlicht der Workflow `.github/workflows/pages.yml` die App unter `https://<benutzer>.github.io/<repo>/`.
3. Die Seite auf dem Handy öffnen und über „Zum Home-Bildschirm hinzufügen“ installieren.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `css/app.css` | Oberfläche (mobile-first) |
| `js/app.js` | Ansichten: Tagebuch, Gerichte/Mahlzeiten, Lebensmittel, Profil; Such- und Detaildialoge |
| `js/store.js` | Datenhaltung in `localStorage`, Nährwert- und Zielberechnung |
| `js/off.js` | Open-Food-Facts-API (Suche und Barcode-Abfrage) |
| `js/scanner.js` | Kamera-Barcode-Scanner |
| `js/foods-de.js` | eingebaute Grunddatenbank (Werte pro 100 g/ml) |
| `vendor/zxing.min.js` | [ZXing](https://github.com/zxing-js/library) (Apache 2.0) als Scanner-Fallback |
| `sw.js`, `manifest.webmanifest` | PWA: Offline-Cache und Installierbarkeit |

Produktdaten: © Open Food Facts contributors, [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Die Nährwerte sind Richtwerte und ersetzen keine ärztliche oder ernährungswissenschaftliche Beratung.
