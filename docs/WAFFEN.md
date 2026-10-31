# Waffen & Upgrades

Stand: 2026-10-31. Alle Zahlen stammen aus `shared/physics.js` (`WEAPONS`, `SHOP_ITEMS`, `UPGRADES`, `REWARDS`).
Ändert sich das Balancing, zeigt die **Hilfe im Spiel** (Knopf „?“ oder Taste H) automatisch die neuen Werte;
diese Datei muss dann von Hand nachgezogen werden.

## Waffen

| Taste | Waffe | Schaden | Krater | Windanfälligkeit | Start | Preis |
|---|---|---|---|---|---|---|
| 1 | Granate | 35 | 28 px | normal (1) | ∞ | – |
| 2 | Schwere Bombe | 55 | 55 px | sehr gering (0,6) | 2 | 40 |
| 3 | Dreierfächer | 3 × 24 | 22 px | hoch (1,3) | 3 | 35 |
| 4 | Erdklumpen | – (baut Erde auf) | 45 px | sehr hoch (1,5) | 2 | 25 |
| 5 | Ball | 40 | 30 px | hoch (1,1) | 3 | 35 |
| 6 | Bohrer | 45 | 32 px | gering (0,8) | nur Shop | 50 |
| 7 | Splitterbombe | 5 × 18 | 18 px je Splitter | normal (1) | nur Shop | 60 |
| 8 | Atombombe | 95 | 115 px | sehr gering (0,5) | nur Shop | 280 |

- **Schaden** ist der Wert bei einem Treffer im Zentrum der Explosion. Er nimmt mit dem Abstand linear ab, bis auf
  40 % am Rand (Krater-Radius + 10 px). Weiter weg gibt es keinen Schaden.
- **Windanfälligkeit** ist der Luftwiderstands-Faktor der Waffe (`drag`): je größer, desto stärker wird das Geschoss abgetrieben.
- **Start** ist die Munition zu Beginn eines Matches. Was übrig bleibt, nimmt man in die nächste Runde mit.
  Ist die gewählte Waffe leer, wird automatisch die Granate gewählt.

### Was die Waffen tun

- **Granate:** Standardgeschoss, unbegrenzt. Explodiert beim ersten Kontakt mit Boden, Panzer oder Schild.
- **Schwere Bombe:** Großer Krater und viel Schaden. Schwer, deshalb wenig vom Wind abgetrieben.
- **Dreierfächer:** Drei leichte Geschosse im Fächer (−5°, 0°, +5°). Gut gegen weit verteilte oder schwer zu treffende Ziele; stark windanfällig.
- **Erdklumpen:** Macht keinen Schaden, sondern baut einen Erdhügel auf: Deckung vor dir oder einen Gegner eingraben.
- **Ball:** Rollt nach dem Aufprall den Hang hinunter, prallt an steilen Wänden ab und fliegt über Klippen. Explodiert, wenn er liegen bleibt oder einen Panzer berührt – ideal für Gegner in Mulden.
- **Bohrer:** Gräbt sich nach dem Aufprall bis zu 90 px weiter durch die Erde und explodiert dann – trifft Gegner hinter Hügeln oder unter Erdhaufen.
- **Splitterbombe:** Zerfällt am höchsten Punkt der Flugbahn in 5 Splitter (je 18 Schaden, Krater 18 px), die sich auffächern.
- **Atombombe:** Riesiger Krater und fast tödlicher Schaden im ganzen Umkreis; bricht viel Boden weg (Fallschaden). Kaum windanfällig, sehr teuer.

## Schild und Treibstoff

| | Wirkung | Zum Start | Preis |
|---|---|---|---|
| Schild (Taste S) | Energieblase mit 60 Punkten. Gegnerische Geschosse explodieren schon an der Blase; der Schild fängt den Schaden ab, bis seine Punkte aufgebraucht sind. Das eigene Geschoss fliegt durch den eigenen Schild. Aktivieren kostet den Zug. Kein Schutz vor Fallschaden. | 1 | 60 |
| Treibstoff (A/D, ◀ ▶) | Fahren im eigenen Zug, 1 Treibstoff pro Pixel. Steile Wände und Klippen sind nicht befahrbar. | 100 | +60 für 20 |

## Upgrades

Upgrades gelten für das ganze Match und werden zwischen den Runden im Shop gekauft.

| Upgrade | Wirkung pro Stufe | Stufen | Preise |
|---|---|---|---|
| Panzerung | −10 % Explosionsschaden (höchstens −30 %; wirkt erst auf den Schaden, der durch den Schild kommt; nicht bei Fallschaden) | 3 | 80 / 120 / 160 |
| Schildverstärker | +30 Schildpunkte | 2 | 70 / 110 |
| Stoßdämpfer | −50 % Fallschaden | 2 | 60 / 90 |
| Turbo-Kanone | +10 max. Kraft | 2 | 70 / 110 |

Alle Panzer haben immer 100 Lebenspunkte. Ohne Upgrades: maximale Kraft 100, Schild 60 Punkte.
Die Panzerung verringert den erlittenen Schaden, statt Lebenspunkte hinzuzufügen. Der Gegner bekommt nur Punkte für den
tatsächlich erlittenen Schaden, an einem gepanzerten Panzer verdient er also weniger.
Stoßdämpfer Stufe 2 bedeutet: kein Fallschaden mehr.

## Regeln, die beim Einsatz helfen

- **Fallschaden:** Bricht der Boden unter einem Panzer weg, fällt er. Ab 15 px Fallhöhe: Fallhöhe ÷ 6, höchstens 30.
  Große Krater unter einem Gegner (Schwere Bombe, Atombombe, Bohrer) bringen deshalb oft zusätzlichen Schaden.
- **Wind:** Stärke 0–10, wechselt jeden Zug. In der Höhe weht er stärker als am Boden, hohe Bogenschüsse werden also stärker abgetrieben.
- **Punkte = Geld:** 1 pro Schadenspunkt am Gegner (auch auf den Schild und Fallschaden durch deinen Krater),
  50 pro Abschuss, 75 für den Rundensieg, 30 Grundbetrag pro Runde. Schaden über die Zerstörung hinaus zählt nicht.

## Tipps

- **Gegner in einer Mulde:** Der Ball rollt den Hang hinunter und explodiert am tiefsten Punkt.
- **Gegner hinter einem Hügel:** Der Bohrer gräbt sich bis zu 90 px durch die Erde.
- **Gegner mit Schild:** Mehrere kleine Treffer (Dreierfächer, Splitterbombe) bauen den Schild ab; danach mit einer starken Waffe nachlegen.
- **Selbst in Gefahr:** Ein Erdklumpen vor dem eigenen Panzer gibt Deckung; ein Schild schützt, kostet aber den Zug.
- **Starker Wind:** Schwere Bombe und Atombombe werden am wenigsten abgetrieben.
