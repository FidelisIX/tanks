# Notizen für die nächste Sitzung

Stand: 2026-11-27. Diese Datei beschreibt den aktuellen Stand und offene Entscheidungen, damit eine neue
Sitzung direkt weitermachen kann. Bugs stehen in [BUGS.md](BUGS.md), Wünsche in [FEATURE_REQUESTS.md](FEATURE_REQUESTS.md).

## Worum es geht

**Krater-Kommando** ist ein eigenes, rundenbasiertes Artillerie-Panzerspiel für 2–4 Spieler im Browser,
online gegen Freunde oder gegen Computergegner. Der Anlass war das Spiel „Tanks“ auf addictinggames.com.
Absprache mit dem Besitzer: **keine Kopie dieses Spiels**, sondern ein eigenes Spiel im selben Genre
mit eigener Grafik, eigenen Waffen und eigenen Regeln.

## Aktueller Stand (2026-11-27)

Live: https://krater-kommando.onrender.com, Stand `main` = `51e7ac4` (identisch mit `claude/gifted-johnson-szzmkh`).

- **Spiel:** 2–4 Spieler oder gegen Computergegner (Leicht/Mittel/Schwer), Matches mit 3/5/10 Runden, Shop zwischen den Runden.
- **11 Waffen:** Granate, Schwere Bombe, Dreierfächer, Erdklumpen, Ball, Bohrer (Annäherungszünder, 150 px), Splitterbombe,
  Atombombe, Tunnelbohrer, Motor-Ball, Hot Shower. Dazu Schild (S), Teleport (T), Reparaturset (R, +50 LP).
- **Upgrades:** Panzerung (−10 % Schaden/Stufe, wirkt nach dem Schild), Schildverstärker, Stoßdämpfer, Turbo-Kanone,
  Kletterketten, Großtank. Treibstoff 300 pro Runde.
- **Karten:** Hügel, Berge (absichtlich kaum befahrbar), Ebene, Canyon, Inseln (Wasser: 25 beim Sturz, 10 pro Zug);
  Gastgeber wählt Typ oder Zufall. Tageszeit (Tag/Morgen/Abend/Nacht) pro Runde, nur optisch.
- **Aufholen:** Kopfgeld auf den alleinigen Führenden, 25 % Shop-Rabatt für den alleinigen Letzten.
- **Raum:** Einladungslink/Code, Host-Rechte, Wiedereinstieg nach Verbindungsabbruch, Nochmal-Abstimmung, Countdown,
  Räume und Statistik überstehen Deploys (Branch `statistik`, Token eingerichtet und funktioniert).
- **Bedienung:** Tastatur (siehe Hilfe, Taste H) und Handy-Tasten für Winkel/Kraft; Spielfläche passt sich dem Fenster an.

**Offen** (Details in BUGS.md / FEATURE_REQUESTS.md):
- B-015 (Leertaste) und B-019 (FEUER am Handy ohne Wirkung): Korrekturen online, Bestätigung des Besitzers steht aus.
- B-004 (kleine Schrift auf dem Handy), B-005 (Abstürze nicht gesichert), B-007 (Tabs teilen Sitzung), B-008 (Bot-Rechenzeit
  bis ~0,5 s blockiert den Server).
- F-019 Teil 2: Region Frankfurt (braucht einen neuen Render-Dienst; Token dort neu eintragen), `numInstances: 1`.
- F-020 (mehr Spieler), F-021 (Handy), F-022 (automatische Tests im Repo).

**Arbeitsweise mit dem Besitzer:** Änderungen auf `claude/gifted-johnson-szzmkh` entwickeln und testen, dann fragen; erst nach
„ja“ per Fast-Forward nach `main` (löst Deploy aus, ~20–50 s). Nach dem Deploy live prüfen (`/healthz`, `/api/stats`,
ausgelieferte Dateien).

## Aufbau

```
server.js            HTTP + WebSocket-Server: Räume, Spielablauf, Shop, Bots, Wiederaufnahme, Sicherung
server/store.js      Speicherung: GitHub-Branch / Ordner / nur Arbeitsspeicher (aus Ortsraten übernommen)
server/bot.js        Computergegner (zielen per Simulation, Streuung je Schwierigkeit, Einkaufsliste)
server/stats.js      Rekorde und Spielertabelle aus den gespeicherten Matches
shared/physics.js    Gelände, Ballistik, Waffen, Shop-Katalog, Preise, Belohnungen (Server + Browser)
public/              Client (Canvas, kein Framework), Statistikseite
render.yaml          Render-Blueprint
```

- Der Server rechnet **alle Schüsse selbst** (autoritativ). Der Browser bekommt die Flugbahnen und spielt sie nur ab.
- Balancing (Preise, Schaden, Wind, Reibung, Belohnungen) steht gesammelt in `shared/physics.js`
  (`WEAPONS`, `SHOP_ITEMS`, `UPGRADES`, `REWARDS`, Konstanten oben). Die Werte sind geschätzt und noch nicht mit
  echten Spielern ausprobiert.
- Die **Hilfe im Spiel** (`public/help.js`) erzeugt ihre Tabellen aus `shared/physics.js` (auch die Waffentexte `desc`)
  und ist damit immer aktuell. `docs/WAFFEN.md` wird mit `node scripts/build-waffen-doc.js` aus denselben Werten erzeugt;
  nach Balancing-Änderungen neu erzeugen.
- Kartentypen (`MAP_TYPES` in `shared/physics.js`): Auf **Bergen** kommt man absichtlich kaum vom Fleck
  (gemessen: Median 56 px Fahrstrecke, 1 % bleiben am Start hängen). Entscheidung des Besitzers vom 2026-11-27: so in Ordnung,
  dort helfen Kletterketten und Teleport. Nicht „reparieren“.
- Zeitkonstanten (Wiederverbindung 60 s, Host-Übergabe 15 s, Countdown 5 s, getrennter Spieler 8 s pro Zug)
  stehen oben in `server.js`.

## Deployment (Render)

- Der Besitzer hat den Blueprint auf Render angelegt (2026-10-30).
- Live-Adresse: https://krater-kommando.onrender.com (erster erfolgreicher Deploy: `5a4db07`, 2026-11-11).
- **Render deployt von `main`** (Entscheidung des Besitzers, 2026-10-31; `branch: main` in `render.yaml`).
  Entwickelt wird auf eigenen Branches (bisher `claude/gifted-johnson-szzmkh`). Ein Push auf `main` löst einen Deploy aus.
- Offen: `region` (z. B. `frankfurt`) und `numInstances: 1` sind nicht gesetzt; der Besitzer hat nur den Branch
  entschieden. Ob sich die Region eines bestehenden Render-Dienstes ändern lässt, ist nicht geprüft.
- Der Server muss auf `0.0.0.0` lauschen (Render-Vorgabe, siehe B-010) und läuft auf Node `22.x` (`engines` in `package.json`).
- **Dauerhafte Statistik und Raumsicherung** brauchen auf Render die Umgebungsvariable `STATS_GITHUB_TOKEN`
  (Fine-grained Token, nur `FidelisIX/tanks`, „Contents: Read and write“). Daten landen im Branch `statistik`
  (`spiele/JJJJ-MM.jsonl`, `raeume/<CODE>.json`). Der Branch darf nicht der Deploy-Branch sein.
  Der Branch `statistik` existiert seit 2026-11-11 (leerer Datenbranch mit README, ohne Code).
  Token ist auf Render eingerichtet und hat Schreibrechte (bestätigt 2026-11-11, siehe B-014).

## Testen

Es gibt noch keine Test-Suite im Repo (siehe Feature Requests). Bisher wurde mit Wegwerf-Skripten im
Scratchpad getestet:

- WebSocket-Bots, die per `P.fireShells` zielen, für Spielablauf, Shop, Host-Rechte, Abstimmung, Neustart
  (`STATS_DIR=<ordner>` statt GitHub-Token, Server mit SIGTERM beenden und neu starten).
- Playwright für Oberfläche und Screenshots (Chromium ist im Cloud-Container vorinstalliert).
- Für Screenshots von Spezialwaffen: einen kleinen Wrapper starten, der vor `require('./server.js')` z. B.
  `P.WEAPONS.nuke.ammo = 1` setzt. Das Spiel selbst bleibt dabei unverändert.

## Konventionen

- Oberfläche und Doku auf Deutsch, Code-Kommentare auf Englisch.
- Der Besitzer möchte, dass bei Unklarheiten **nachgefragt statt geraten** wird und Aussagen mit Quellen oder
  Messdaten belegt werden.
- Neue Bugs in `docs/BUGS.md`, neue Wünsche in `docs/FEATURE_REQUESTS.md` eintragen (fortlaufende IDs).
