# GymLog – Fitnesstracker fürs Fitnessstudio

Mobil optimierte Web-App zum Mitloggen deines Trainings. Läuft komplett im Browser,
funktioniert offline (PWA) und speichert alle Daten lokal auf dem Gerät.

## Funktionen
- **Trainingspläne** (Push / Pull / Beine vorinstalliert, eigene Pläne anlegen)
- **Training loggen**: Gewicht & Wiederholungen pro Satz, Werte vom letzten Mal werden vorausgefüllt
- **Pausentimer** startet automatisch nach jedem Satz (Ton + Vibration, ±15 s)
- **PR-Erkennung** über geschätztes 1RM (Epley-Formel)
- **Verlauf** aller Trainings mit Dauer und Volumen
- **Fortschritt**: 1RM-Kurve je Übung, Wochenvolumen, Körpergewicht
- **Wochenziel & Serie**, Trainingskalender der letzten 5 Wochen
- 26 Übungen nach Muskelgruppe, eigene Übungen ergänzbar
- Backup als JSON exportieren/importieren, CSV-Export, Hell/Dunkel-Modus

## Starten
```bash
python3 -m http.server 8000
```
Dann `http://localhost:8000` öffnen. Für die Nutzung am Handy die Dateien auf einen
beliebigen statischen Host legen (z. B. GitHub Pages) und im Browser
„Zum Startbildschirm hinzufügen“ wählen.
