# Feature Requests

Wünsche des Besitzers und Vorschläge. Neue Einträge bekommen die nächste freie ID.
Status: **offen**, **wartet auf Entscheidung**, **umgesetzt** (mit Commit) oder **abgelehnt / zurückgestellt**.

## Offen / wartet auf Entscheidung

### F-019 – Render-Konfiguration wie bei Ortsraten
`branch: main`, `region: frankfurt`, `numInstances: 1` in `render.yaml`, dafür einen Branch `main` anlegen.
Vorgeschlagen am 2026-10-31, **wartet auf Entscheidung des Besitzers**.

### F-020 – Mehr Spieler pro Raum (bis 6)
Aus Ortsraten (dort bis 12). Am 2026-10-31 zur Auswahl gestellt, vom Besitzer **vorerst nicht gewählt**.

### F-021 – Bessere Handy-Darstellung
Vorschlag aus B-004: größere Schrift auf der Spielfläche, kompaktere Anzeigetafel, Bedienung ohne Scrollen.

### F-022 – Automatische Tests im Repo
Vorschlag: die bisherigen Wegwerf-Tests (WebSocket-Bots, Playwright) als `npm test` einchecken, wie in Ortsraten.

## Umgesetzt

| ID | Wunsch | Commit |
|---|---|---|
| F-001 | Eigenes Artillerie-Spiel im Genre von „Tanks“, online gegen Freunde, 2–4 Spieler | `dbf39b9` |
| F-002 | Läuft auf Render (Blueprint `render.yaml`, Health-Check) | `dbf39b9` |
| F-003 | Neue Waffe „Ball“, rollt den Hang hinunter | `6cfade3` |
| F-004 | Schutzschild | `6cfade3` |
| F-005 | Realistischerer Wind (Luftwiderstand, stärker in der Höhe) | `6cfade3` |
| F-006 | Rundenbasierte Matches (3/5/10 Runden), Punkte als Geld | `24355ad` |
| F-007 | Shop: Munition, dauerhafte Upgrades, Spezialwaffen (Bohrer, Splitterbombe), Treibstoff/Fahren | `24355ad` |
| F-008 | Fallschaden sichtbar machen („Sturz -X“), Stoßdämpfer-Upgrade | `24355ad` |
| F-009 | Atombombe als sehr teure Spezialwaffe | `edebabb` |
| F-010 | Wiedereinstieg nach Verbindungsabbruch | `70c2ec0` |
| F-011 | Host-Rechte: Spieler entfernen, Host-Übergabe nach 15 s (aus Ortsraten) | `2666462` |
| F-012 | Nochmal-Abstimmung und 5-s-Countdown (aus Ortsraten) | `2666462` |
| F-013 | Räume überstehen Deploys/Neustarts (aus Ortsraten) | `2666462` |
| F-014 | Statistik & Rekorde (aus Ortsraten) | `2666462` |
| F-015 | Alleine spielen gegen Computergegner (Leicht/Mittel/Schwer) | `2666462` |
| F-016 | Anzeigen: wer dran ist, Lebenspunkte, Punkte der Runde, Windstärke und -richtung | `2016029` |
| F-017 | Dokumente für Notizen, Bugs und Feature Requests | `2016029` |
| F-018 | Bilder vom Spiel und von der Atombombe | nur als Bilder in der Sitzung, nicht im Repo |
| F-023 | Illustrationen für die Waffen in der Auswahl (und im Shop) | dieser Commit |
