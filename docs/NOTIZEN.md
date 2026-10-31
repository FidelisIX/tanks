# Notizen für die nächste Sitzung

Stand: 2026-10-31. Diese Datei beschreibt den aktuellen Stand und offene Entscheidungen, damit eine neue
Sitzung direkt weitermachen kann. Bugs stehen in [BUGS.md](BUGS.md), Wünsche in [FEATURE_REQUESTS.md](FEATURE_REQUESTS.md).

## Worum es geht

**Krater-Kommando** ist ein eigenes, rundenbasiertes Artillerie-Panzerspiel für 2–4 Spieler im Browser,
online gegen Freunde oder gegen Computergegner. Der Anlass war das Spiel „Tanks“ auf addictinggames.com.
Absprache mit dem Besitzer: **keine Kopie dieses Spiels**, sondern ein eigenes Spiel im selben Genre
mit eigener Grafik, eigenen Waffen und eigenen Regeln.

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
- Zeitkonstanten (Wiederverbindung 60 s, Host-Übergabe 15 s, Countdown 5 s, getrennter Spieler 8 s pro Zug)
  stehen oben in `server.js`.

## Deployment (Render)

- Der Besitzer hat den Blueprint auf Render angelegt (2026-10-30).
- **Render deployt von `main`** (Entscheidung des Besitzers, 2026-10-31; `branch: main` in `render.yaml`).
  Entwickelt wird auf eigenen Branches (bisher `claude/gifted-johnson-szzmkh`). Ein Push auf `main` löst einen Deploy aus.
- Offen: `region` (z. B. `frankfurt`) und `numInstances: 1` sind nicht gesetzt; der Besitzer hat nur den Branch
  entschieden. Ob sich die Region eines bestehenden Render-Dienstes ändern lässt, ist nicht geprüft.
- **Dauerhafte Statistik und Raumsicherung** brauchen auf Render die Umgebungsvariable `STATS_GITHUB_TOKEN`
  (Fine-grained Token, nur `FidelisIX/tanks`, „Contents: Read and write“). Daten landen im Branch `statistik`
  (`spiele/JJJJ-MM.jsonl`, `raeume/<CODE>.json`). Der Branch darf nicht der Deploy-Branch sein.
  Ob der Token schon eingerichtet ist: unbekannt.

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
