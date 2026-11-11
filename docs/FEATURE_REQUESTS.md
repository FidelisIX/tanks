# Feature Requests

Wünsche des Besitzers und Vorschläge. Neue Einträge bekommen die nächste freie ID.
Status: **offen**, **wartet auf Entscheidung**, **umgesetzt** (mit Commit) oder **abgelehnt / zurückgestellt**.

## Offen / wartet auf Entscheidung

### F-019 – Render-Konfiguration wie bei Ortsraten
Teil 1 umgesetzt (2026-10-31): Render läuft über `main` (`branch: main`, Branch `main` angelegt).
Noch offen, nicht entschieden: `region: frankfurt` und `numInstances: 1`.

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
| F-023 | Illustrationen für die Waffen in der Auswahl (und im Shop) | `d32e3ef` |
| F-024 | Doku für Waffen und Upgrades: `docs/WAFFEN.md` und Hilfe im Spiel („?“, Taste H) | `fd8b2e6` |
| F-025 | Atombomben-Symbol als Fliegerbombe statt Oval | `fd8b2e6` |
| F-026 | Panzerung verringert den erlittenen Schaden (−10 % pro Stufe) statt Lebenspunkte zu erhöhen – sonst bekäme der Gegner mehr Punkte | `fd69aba` |
| F-027 | Reihenfolge: erst Schild, dann Panzerung (der Schild ist die äußere Blase; die Panzerung verringert nur, was durchkommt) | `b89e432` |
| F-028 | Spieler-Feedback: Wind wechselt zu oft → wird pro Runde ausgewürfelt und ändert sich pro Zug nur um höchstens ±2 (`WIND_DRIFT`) | `e6f6627` |
| F-029 | Spieler-Feedback: Teleport als Einmal-Artikel (Ziel anklicken, kostet den Zug) | `b000717` |
| F-030 | Spieler-Feedback: Upgrade für besseres Bergauffahren – Kletterketten, 2 Stufen | `b000717` |
| F-031 | Spieler-Feedback: Upgrades/Waffen zu teuer – alles 30 % billiger, Atombombe halber Preis | `b000717` |
| F-032 | Spieler-Feedback: zu wenig Reichweite beim Fahren – 300 Treibstoff pro Runde statt 100 pro Match | `b000717` |
| F-033 | Bohrer gräbt weiter: 150 px statt 90 px (90 px war kürzer als die Explosionsradien großer Waffen) | `042d76b` |
| F-034 | Neue Waffe Tunnelbohrer (Vorschlag des Besitzers, Gegenstück zum Erdklumpen): gräbt bis 150 px einen offenen Graben, kein Explosionsschaden; 2 zum Start, im Shop 18, Taste 9. Echte Tunnel sind im jetzigen Gelände (eine Bodenhöhe pro Spalte) nicht möglich | `f550abe` |
| F-035 | Spiel im Browser größer: volle Fensterbreite, Spielfläche passt sich der Fensterhöhe an, Titel im Spiel ausgeblendet, kompaktere Anzeigetafel, Vollbild-Knopf. Laptop 1366×768: 807×438 → 943×511 px; Monitor 1920×1080: 1202×652 → 1519×823 px | dieser Commit |
