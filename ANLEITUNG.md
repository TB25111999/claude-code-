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
   - **Publish directory:** `.`
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
| `index.html` | Die komplette App |
| `config.js` | Supabase-Zugangsdaten (optional) |
| `manifest.webmanifest`, `icons/` | Name und Symbol auf dem Home-Bildschirm |
| `sw.js` | Offline-Unterstützung |
| `vendor/supabase.js` | Supabase-Bibliothek (MIT-Lizenz, Version 2.117.2) |
| `supabase/schema.sql` | Datenbank-Tabellen und Zugriffsregeln |
| `netlify.toml` | Einstellungen fürs Hosting |
