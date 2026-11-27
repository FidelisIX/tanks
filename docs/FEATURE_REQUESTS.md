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
| F-035 | Spiel im Browser größer: volle Fensterbreite, Spielfläche passt sich der Fensterhöhe an, Titel im Spiel ausgeblendet, kompaktere Anzeigetafel, Vollbild-Knopf. Laptop 1366×768: 807×438 → 943×511 px; Monitor 1920×1080: 1202×652 → 1519×823 px | `7605d18` |
| F-036 | Testspiel: Ball V2, der aufwärts rollt – Motor-Ball (Antrieb, bis 300 px, Steigung bis 3 : 1), Shop 30 | `279130a` |
| F-037 | Testspiel: dauerhaftes Tank-Upgrade – Großtank, +100 Treibstoff pro Runde, 2 Stufen, 40/70 | `279130a` |
| F-038 | Testspiel: verschiedene Karten – Hügel, Berge, Ebene, Canyon, Inseln (mit Wasser); Auswahl im Warteraum oder Zufall | `279130a` |
| F-039 | Testspiel: besser aufholen – Kopfgeld auf den alleinigen Führenden (+50 % Punkte, +25 für Abschuss) und 25 % Shop-Rabatt für den alleinigen Letzten | `279130a` |
| F-040 | Testspiel: Hot Shower – Dreierfächer aus drei kleineren Atombomben (80 px, 60 Schaden), Shop 220 | `279130a` |
| F-041 | Optische Varianten: Tageszeit pro Runde (Tag, Morgen, Abend, Nacht; Sonne/Mond, Wolken, Sterne, Lichtfarbe) und eigenes Aussehen je Kartentyp (Wüste, roter Fels mit Schichten, Inseln mit Strand) | `046b5ff` |
| F-042 | Berge deutlich bergiger (höchster Gipfel im Median y 259 → 113, Höhenunterschied 274 → 395 px) mit Schneekappen und Schnee-/Felstextur; Schneegrenze passt sich jeder Karte an; weiche Obergrenze statt abgeschnittener Gipfel (46 → 0 von 200 Karten) | `046b5ff` |
| F-043 | Tasten fürs Handy zum Verstellen von Winkel (↶ ↷) und Kraft (− +): Tippen = 1 Schritt, Halten wiederholt immer schneller; Fahr-Tasten beschriftet, damit man sie nicht mit den Winkel-Tasten verwechselt | `a26d0e3` |
| F-044 | Computergegner nutzen die neuen Waffen: Motor-Ball (82–100 % Treffer), Hot Shower (97 %, Ø 67 Schaden), Tunnelbohrer nur wenn ein Graben den Gegner abstürzen lässt; Einkaufslisten ergänzt | `02cc633` |
| F-045 | Deutlicher, in welcher Runde man ist: großes „Runde 2 von 5“ (mit Karte, Tageszeit, „Letzte Runde!“) zu Rundenbeginn, Runde oben als orange Markierung | `b369a02` |
| F-046 | Erdklumpen mehr Erde: Radius 45 → 55 px (~50 % mehr) | `b369a02` |
| F-047 | Neues Reparaturset: +35 Lebenspunkte (höchstens 100), kostet den Zug, Taste R, Shop 35; Computergegner (Mittel/Schwer) kaufen und nutzen es | `b369a02` |
