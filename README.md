# Krater-Kommando

Ein rundenbasiertes Artillerie-Panzerspiel für **2–4 Spieler**, die online gegeneinander spielen.
Abwechselnd stellt jeder Spieler Winkel und Kraft ein und feuert. Dabei spielen Wind und zerstörbares Gelände eine Rolle.
Ein Match besteht aus 3, 5 oder 10 Runden. Zwischen den Runden kauft man mit den verdienten Punkten Munition und Upgrades.
Wer am Ende die meisten Gesamtpunkte hat, gewinnt.

## Spielen

1. Seite öffnen, Namen eingeben, **„Neuen Raum erstellen“**.
2. Den **Einladungslink** (oder den 4-stelligen Code) an Freunde schicken.
3. Der Gastgeber wählt die Rundenzahl, fügt bei Bedarf **Computergegner** hinzu (Leicht/Mittel/Schwer) und startet das Match.
   Nach einem Countdown von 5 Sekunden geht es los.

Ohne Freunde: **„Alleine gegen den Computer spielen“** erstellt einen Raum mit einem Computergegner; weitere lassen sich hinzufügen.

Während des Spiels zeigt die Anzeigetafel über der Spielfläche für jeden Panzer Lebenspunkte, Schild, Punkte der
laufenden Runde, Gesamtpunkte, Geld und Treibstoff. Oben stehen, wer dran ist, die Runde, der Wind (Pfeil: Länge =
Stärke, Richtung = Windrichtung) und die verbleibende Zugzeit.

**Steuerung:** ←/→ Winkel · ↑/↓ Kraft · 1–8 Waffe · S Schild · A/D fahren · Leertaste Feuer (Shift für feine Schritte).
Auf dem Handy über Schieberegler und Buttons.

| Waffe | Wirkung | Munition |
|---|---|---|
| Granate | normaler Krater | unbegrenzt |
| Schwere Bombe | großer Krater, viel Schaden | 2 |
| Dreierfächer | drei Geschosse im Fächer | 3 |
| Erdklumpen | baut Gelände auf (Deckung / Gegner eingraben) | 2 |
| Ball | rollt nach dem Aufprall den Hang hinunter, prallt an steilen Wänden ab und explodiert, wenn er liegen bleibt oder einen Panzer berührt | 3 |
| Bohrer | gräbt sich nach dem Aufprall bis zu 90 px durch die Erde und explodiert dann | nur im Shop |
| Splitterbombe | zerfällt am höchsten Punkt der Flugbahn in 5 Splitter | nur im Shop |
| Atombombe | riesiger Krater (Radius 115 px), bis zu 95 Schaden im ganzen Umkreis, kaum vom Wind abgetrieben | nur im Shop (280) |

Die Munitionsangaben gelten für den Start eines Matches. Was übrig bleibt, nimmt man in die nächste Runde mit.

**Schild** (1 zum Start, weitere im Shop; kostet beim Einsatz den Zug): Eine Energieblase mit 60 Punkten. Gegnerische Geschosse explodieren schon an der Blase, und der Schild fängt den Schaden ab, bis seine Punkte aufgebraucht sind. Fallschaden geht trotzdem durch.

**Wind:** Geschosse spüren Luftwiderstand relativ zur bewegten Luft. Der Wind weht in der Höhe stärker als am Boden. Schwere Geschosse (Schwere Bombe) werden weniger abgetrieben, leichte (Dreierfächer, Erdklumpen) stärker.

**Fallschaden:** Bricht der Boden unter einem Panzer weg, fällt er. Ab 15 px Fallhöhe gibt es Schaden (Fallhöhe ÷ 6, höchstens 30). Er wird als „Sturz -X“ angezeigt.

**Fahren:** Im eigenen Zug mit A/D oder ◀ ▶. Das kostet 1 Treibstoff pro Pixel (100 zum Start). Steile Wände und Klippen sind nicht befahrbar.

Jeder Zug hat 40 Sekunden.

### Punkte und Shop

| Wofür | Punkte |
|---|---|
| Schaden am Gegner (auch auf den Schild, auch Fallschaden durch deinen Krater) | 1 pro Punkt |
| Abschuss | 50 |
| Rundensieg (letzter Überlebender) | 75 |
| Grundbetrag pro Runde | 30 |

Punkte sind gleichzeitig Geld. Für die Rangliste zählt alles, was man insgesamt verdient hat, auch wenn man es ausgibt.
Nach jeder Runde öffnet sich der Shop für alle gleichzeitig, für 30 Sekunden oder bis alle auf „Fertig“ klicken:

- **Munition:** Schwere Bombe 40, Dreierfächer 35, Erdklumpen 25, Ball 35, Bohrer 50, Splitterbombe 60, Atombombe 280, Schild 60, Treibstoff +60 für 20
- **Dauerhafte Upgrades** (gelten für das ganze Match):
  - Panzerung: +15 max. Lebenspunkte, 3 Stufen, 80/120/160
  - Schildverstärker: +30 Schildpunkte, 70/110
  - Stoßdämpfer: −50 % Fallschaden pro Stufe, 60/90
  - Turbo-Kanone: +10 max. Kraft, 70/110

### Raum und Gastgeber

- Der Gastgeber kann Spieler und Computergegner entfernen (✕ in der Spielerliste).
- Ist der Gastgeber länger als 15 Sekunden getrennt, wird ein anderer Spieler Gastgeber (ein Neuladen der Seite kostet die Rolle also nicht).
- **Nochmal spielen:** Nach dem Endstand kann jeder zustimmen. Haben alle verbundenen Spieler zugestimmt, startet das
  nächste Match mit denselben Einstellungen. Der Gastgeber kann auch ohne alle Stimmen starten oder zurück in den Warteraum gehen.

### Verbindungsabbruch

Bricht die Verbindung ab, z. B. durch einen Netzwechsel am Handy, ein Neuladen der Seite oder einen geschlossenen Tab, bleibt dein Platz **60 Sekunden** reserviert.
Der Browser verbindet sich automatisch neu. Nach dem Schließen des Tabs reicht es, den Einladungslink wieder zu öffnen.
Ist ein getrennter Spieler am Zug, wird sein Zug nach 8 Sekunden übersprungen. Im Shop wartet niemand auf ihn.
Ist er nach 60 Sekunden nicht zurück, scheidet er aus.

### Statistik und Neustarts

Die Seite **„Statistik & Rekorde“** zeigt Rekorde (meiste Siege, höchste Punktzahl, bester einzelner Schuss,
meiste Abschüsse …) und eine Spielertabelle. Spieler werden über ihren Namen erkannt, Computergegner zählen nicht.

Damit Statistik und laufende Räume einen Neustart oder Deploy überstehen, speichert der Server sie über die GitHub-API
im Branch `statistik` dieses Repos (`spiele/JJJJ-MM.jsonl`, beim Herunterfahren zusätzlich `raeume/<CODE>.json`).
Die Browser verbinden sich danach automatisch neu, und das Match läuft an derselben Stelle weiter. Abstürze sind nicht abgedeckt.

Einrichtung:

1. Auf GitHub unter **Settings → Developer settings → Personal access tokens → Fine-grained tokens** einen Token
   erstellen: nur für dieses Repository, Berechtigung **Contents: Read and write**, sonst nichts.
2. Auf Render im Service unter **Environment** die Variable `STATS_GITHUB_TOKEN` mit dem Token anlegen.

Ohne Token läuft das Spiel normal, Statistik und Räume gelten dann aber nur bis zum nächsten Neustart.
Weitere Variablen: `STATS_REPO` (Standard `FidelisIX/tanks`), `STATS_BRANCH` (Standard `statistik`, darf nicht der
Deploy-Branch sein), `STATS_DIR` (lokaler Ordner statt GitHub, zum Entwickeln).

## Lokal starten

```bash
npm install
```

```bash
npm start
```

Dann http://localhost:3000 öffnen (zum Testen mehrere Tabs).

## Auf Render veröffentlichen

Das Repo enthält eine `render.yaml` (Blueprint):

1. Auf https://dashboard.render.com **New → Blueprint** wählen und dieses GitHub-Repo verbinden.
2. Render liest `render.yaml` und legt einen Web Service an (`npm install` / `npm start`, Health-Check `/healthz`).
3. Nach dem Deploy die `https://….onrender.com`-Adresse an Freunde schicken.

Alternativ manuell: **New → Web Service**, Runtime *Node*, Build `npm install`, Start `npm start`.

Hinweis: Laut Render-Dokumentation schläft ein Dienst im kostenlosen Plan nach 15 Minuten ohne Aufrufe ein; der erste Aufruf danach dauert deutlich länger.

## Technik

- `server.js`: Node.js-HTTP- und WebSocket-Server (`ws`). Verwaltet Räume und berechnet alle Schüsse autoritativ, damit niemand schummeln kann.
- `server/store.js`: Speicherung von Statistik und Raumsicherungen (GitHub-Branch, Ordner oder nur Arbeitsspeicher).
- `server/bot.js`: Computergegner. `server/stats.js`: Rekorde und Spielertabelle.
- `shared/physics.js`: Gelände, Ballistik, Waffen, Shop und Preise. Wird von Server und Browser gemeinsam genutzt.
- `public/`: Browser-Client (Canvas, kein Framework) und Statistikseite.

Projektnotizen: [docs/NOTIZEN.md](docs/NOTIZEN.md) · Bugs: [docs/BUGS.md](docs/BUGS.md) · Wünsche: [docs/FEATURE_REQUESTS.md](docs/FEATURE_REQUESTS.md)
