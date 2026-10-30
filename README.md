# Krater-Kommando

Ein rundenbasiertes Artillerie-Panzerspiel für **2–4 Spieler**, die online gegeneinander spielen.
Abwechselnd stellt jeder Spieler Winkel und Kraft ein und feuert. Dabei spielen Wind und zerstörbares Gelände eine Rolle.
Wer als Letzter übrig bleibt, gewinnt die Runde.

## Spielen

1. Seite öffnen, Namen eingeben, **„Neuen Raum erstellen“**.
2. Den **Einladungslink** (oder den 4-stelligen Code) an Freunde schicken.
3. Wenn alle drin sind, startet der Gastgeber das Spiel.

**Steuerung:** ←/→ Winkel · ↑/↓ Kraft · 1–4 Waffe · Leertaste Feuer (Shift für feine Schritte).
Auf dem Handy über Schieberegler und Buttons.

| Waffe | Wirkung | Munition |
|---|---|---|
| Granate | normaler Krater | unbegrenzt |
| Schwere Bombe | großer Krater, viel Schaden | 2 |
| Dreierfächer | drei Geschosse im Fächer | 3 |
| Erdklumpen | baut Gelände auf (Deckung / Gegner eingraben) | 2 |

Jeder Zug hat 40 Sekunden. Wenn Boden unter einem Panzer wegbricht, fällt er und nimmt Fallschaden.

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

Hinweis: Im kostenlosen Plan schläft der Dienst nach ca. 15 Minuten Inaktivität ein. Der erste Aufruf danach dauert etwa eine Minute, und laufende Räume gehen dabei verloren.

## Technik

- `server.js`: Node.js-HTTP- und WebSocket-Server (`ws`). Verwaltet Räume und berechnet alle Schüsse autoritativ, damit niemand schummeln kann.
- `shared/physics.js`: Gelände, Ballistik, Krater und Schaden. Wird von Server und Browser gemeinsam genutzt.
- `public/`: Browser-Client (Canvas, kein Framework).
