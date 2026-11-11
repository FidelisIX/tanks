# Datenbranch `statistik`

Dieser Branch enthält **keinen Code**. Der Krater-Kommando-Server schreibt hier über die GitHub-API seine Daten hinein,
wenn auf Render die Umgebungsvariable `STATS_GITHUB_TOKEN` gesetzt ist:

- `spiele/JJJJ-MM.jsonl` – eine Zeile pro beendetem Match (Grundlage für „Statistik & Rekorde“)
- `raeume/<CODE>.json` – Sicherung laufender Räume beim Herunterfahren (Deploy/Neustart); wird nach der
  Wiederherstellung wieder gelöscht

Bitte nicht nach `main` mergen und nicht als Deploy-Branch verwenden: Jede Partie würde sonst einen Neustart auslösen.
Einrichtung des Tokens: siehe README im Branch `main`, Abschnitt „Statistik und Neustarts“.
