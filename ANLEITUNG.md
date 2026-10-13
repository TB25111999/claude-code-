# To-do-App auf iPhone und iPad einrichten

Die App ist eine Web-App: Du legst sie wie eine normale App auf den Home-Bildschirm. Sie startet im Vollbild, funktioniert auch offline und gleicht deine Aufgaben über dein eigenes, kostenloses Supabase-Projekt zwischen iPhone und iPad ab.

Du brauchst einmalig etwa 15 Minuten. Danach musst du nichts mehr einrichten.

---

## Schritt 1: Datenbank bei Supabase anlegen (ca. 5 Min.)

1. Öffne [supabase.com](https://supabase.com) und klicke auf **Start your project**. Melde dich am einfachsten mit deinem GitHub-Konto an.
2. Klicke auf **New project**.
   - **Name:** z. B. `todos`
   - **Database Password:** irgendein sicheres Passwort (brauchst du für die App nicht)
   - **Region:** `Central EU (Frankfurt)`
   - Plan: **Free**
3. Warte, bis das Projekt fertig ist (1–2 Minuten).
4. Öffne links **SQL Editor**, füge den kompletten Inhalt der Datei [`supabase/schema.sql`](supabase/schema.sql) ein und klicke auf **Run**. Es sollte „Success“ erscheinen.
5. Hol dir die zwei Zugangsdaten:
   - **Project URL** – unter **Project Settings → Data API** (sieht aus wie `https://abcd1234.supabase.co`)
   - **anon public Key** – unter **Project Settings → API Keys**, Reiter **Legacy API Keys**, Eintrag `anon` `public` (beginnt mit `eyJ…`)

   Beide Werte dürfen öffentlich sein. Deine Daten schützt die Datenbank selbst: Jede Person sieht nur ihre eigenen Aufgaben.

> **Tipp:** Schick mir (Claude) die beiden Werte, dann trage ich sie in `config.js` ein. Dann musst du sie auf iPhone und iPad nicht eintippen.

## Schritt 2: App online stellen mit Netlify (ca. 5 Min.)

Netlify hostet die App kostenlos und funktioniert auch mit privaten GitHub-Repos.

1. Öffne [app.netlify.com](https://app.netlify.com) und melde dich mit GitHub an.
2. **Add new site → Import an existing project → GitHub**.
3. Erlaube Netlify den Zugriff auf das Repo `claude-code-` und wähle es aus.
4. Einstellungen:
   - **Branch to deploy:** `main` (oder `claude/practical-planck-bgfxcg`, falls noch nicht gemergt)
   - **Build command:** leer lassen
   - **Publish directory:** egal – `netlify.toml` legt `public` fest
5. **Deploy** klicken. Nach etwa einer Minute bekommst du eine Adresse wie `https://xyz-123.netlify.app`.
   Unter **Site configuration → Change site name** kannst du sie z. B. in `https://tims-todos.netlify.app` ändern.
6. Zurück in Supabase: **Authentication → URL Configuration → Site URL** auf deine Netlify-Adresse setzen und speichern. So führt der Bestätigungslink aus der Anmelde-E-Mail zur App.

Jede Änderung im Repo wird ab jetzt automatisch veröffentlicht.

<details>
<summary>Alternative: GitHub Pages</summary>

GitHub Pages ist bei privaten Repos nur mit einem bezahlten GitHub-Konto verfügbar. Wenn das Repo öffentlich ist (oder du GitHub Pro hast):
**Settings → Pages → Source: Deploy from a branch → Branch `main`, Ordner `/ (root)`**. Die App liegt dann unter `https://tb25111999.github.io/claude-code-/`.
</details>

## Schritt 3: Auf iPhone und iPad installieren (je 1 Min.)

1. Öffne deine App-Adresse in **Safari** (nicht Chrome).
2. Tippe auf **Teilen** (Quadrat mit Pfeil nach oben) → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Starte die App über das neue Symbol „To-dos“.
4. Falls nach Supabase-Daten gefragt wird: Project URL und anon Key eintragen → **Verbinden**.
5. **Erstes Gerät:** E-Mail und Passwort eingeben → **Neues Konto erstellen**. Bestätige den Link in der E-Mail, dann in der App **Anmelden**.
   **Zweites Gerät:** Mit derselben E-Mail und demselben Passwort **Anmelden**.

Fertig. Änderungen erscheinen auf dem anderen Gerät innerhalb von Sekunden, spätestens wenn du die App wieder öffnest.

> Ohne E-Mail-Bestätigung geht es schneller: In Supabase unter **Authentication → Sign In / Providers → Email** den Schalter **Confirm email** ausschalten.

---

## Benachrichtigungen einrichten (einmalig, ca. 5 Min.)

Damit du Tagesüberblick, „Startet heute“ und Erinnerungen mit Uhrzeit bekommst:

1. **Datenbank erweitern:** In Supabase den **SQL Editor** öffnen, den Inhalt von [`supabase/benachrichtigungen.sql`](supabase/benachrichtigungen.sql) einfügen und **Run** drücken („Success. No rows returned“ ist richtig).
2. **Geheimen Server-Schlüssel kopieren:** In Supabase **Project Settings → API Keys**, Bereich **Secret keys**, den Schlüssel `sb_secret_…` kopieren (Auge-Symbol / Kopieren).
   ⚠️ Diesen Schlüssel nie in die App, in Chats oder ins Repo kopieren – nur in Netlify.
3. **In Netlify hinterlegen:** **Project configuration → Environment variables → Add a variable → Add a single variable**
   - **Key:** `SUPABASE_SECRET_KEY`
   - **Value:** den kopierten `sb_secret_…`-Schlüssel
   - **Create variable**
4. **Neu veröffentlichen:** **Deploys → Trigger deploy → Deploy project**.
5. **Auf iPhone und iPad:** Die App **über das Symbol auf dem Home-Bildschirm** öffnen (in Safari selbst geht es nicht) → in der Seitenleiste unten **Benachrichtigungen** → **Auf diesem Gerät erlauben** → bei der iOS-Abfrage **Erlauben**. Danach **Test senden**: Nach ein paar Sekunden sollte eine Mitteilung erscheinen.
6. Tagesüberblick, „Startet heute“ und die Uhrzeit einstellen → **Speichern**.

Erinnerungen setzt du pro Aufgabe über **+ Erinnerung** (oder im Bearbeiten-Fenster). Der Server prüft alle 5 Minuten, Erinnerungen kommen also bis zu 5 Minuten nach der eingestellten Zeit.

Voraussetzung: iOS/iPadOS 16.4 oder neuer. Mitteilungen lassen sich jederzeit in den iPhone-Einstellungen unter **Mitteilungen → To-dos** abschalten.

## Gut zu wissen

- **Offline:** Du kannst ohne Netz Aufgaben anlegen, abhaken und ändern. Unten in der Seitenleiste steht „Offline – n Änderungen warten“. Sobald wieder Netz da ist, wird alles übertragen.
- **Sync-Anzeige:** Grüner Punkt = alles abgeglichen. Gelb = wartet/überträgt. Rot = Fehler (Text daneben erklärt ihn).
- **Backup:** **Export** speichert alle Aufgaben als JSON-Datei (z. B. in „Dateien“), **Import** liest so eine Datei wieder ein.
- **Updates:** Neue Versionen der App lädt sie beim nächsten Start automatisch. Falls nicht: App zweimal schließen und neu öffnen.
- **Passwort vergessen:** In Supabase unter **Authentication → Users** kannst du dein Konto verwalten oder eine Wiederherstellungs-Mail senden.
- **Kosten:** Supabase Free und Netlify Free reichen für eine persönliche To-do-Liste bei Weitem. Ein Supabase-Free-Projekt wird nach 7 Tagen ohne jede Nutzung pausiert; ein Klick auf **Restore** im Dashboard weckt es wieder auf. Wenn du die App regelmäßig nutzt, passiert das nicht.

## Dateien

| Datei | Zweck |
| --- | --- |
| `public/index.html` | Die komplette App |
| `public/config.js` | Supabase-Adresse und öffentlicher Schlüssel |
| `public/manifest.webmanifest`, `public/icons/` | Name und Symbol auf dem Home-Bildschirm |
| `public/sw.js` | Offline-Unterstützung und Empfang von Benachrichtigungen |
| `public/vendor/supabase.js` | Supabase-Bibliothek (MIT-Lizenz, Version 2.117.2) |
| `netlify/functions/send-reminders.mjs` | Läuft alle 5 Minuten und verschickt Erinnerungen und den Morgen-Überblick |
| `netlify/functions/push-api.mjs` | Schnittstelle für „Auf diesem Gerät erlauben“ und „Test senden“ |
| `supabase/schema.sql` | Komplette Datenbank (für neue Projekte) |
| `supabase/benachrichtigungen.sql` | Nachrüstung für Benachrichtigungen |
| `netlify.toml`, `package.json` | Einstellungen fürs Hosting |
