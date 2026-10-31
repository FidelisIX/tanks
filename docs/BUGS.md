# Bugs

Offene und behobene Fehler. Neue Einträge bekommen die nächste freie ID.
Status: **offen**, **behoben** (mit Commit) oder **so gewollt**.

## Offen

### B-004 – Auf dem Handy ist die Spielfläche klein und die Seite scrollt
Bei 390 × 844 px (Playwright, 2026-10-31) ist der Inhalt 912 px hoch, man muss also für den FEUER!-Knopf scrollen.
Namen und Lebensbalken auf der Spielfläche sind sehr klein, weil der Canvas (1200 × 650) auf die
Bildschirmbreite verkleinert wird. Auf dem Laptop (1366 × 768) passt alles.

### B-005 – Abstürze sind von der Raumsicherung nicht abgedeckt
Räume werden nur beim geordneten Herunterfahren (SIGTERM, z. B. Deploy) gesichert. Stürzt der Prozess ab oder
wird er hart beendet, sind laufende Räume verloren. Ohne `STATS_GITHUB_TOKEN` gehen Räume bei jedem
Neustart verloren (siehe B-006).

### B-007 – Mehrere Tabs im selben Browser teilen sich den Sitzungsschlüssel im localStorage
Der Schlüssel liegt im sessionStorage (pro Tab) und zusätzlich im localStorage. Spielen zwei Personen im selben
Browser in verschiedenen Tabs und wird ein Tab geschlossen und über den Link neu geöffnet, kann er den Platz des
zuletzt beigetretenen Tabs übernehmen. Für normale Nutzung (ein Spieler pro Gerät) ohne Bedeutung.

### B-008 – Bot-Zielsuche blockiert den Server kurz
`server/bot.js` simuliert für jeden Bot-Zug einige tausend Schüsse synchron. Das blockiert den Node-Prozess für
diese Zeit, auch für andere Räume. Wie lange genau, ist **nicht gemessen**. Bei vielen gleichzeitigen Räumen mit
Bots prüfen.

## So gewollt

### B-006 – Ohne Token sind Statistik und Räume nach einem Neustart weg
Ohne `STATS_GITHUB_TOKEN` nutzt der Server nur den Arbeitsspeicher. Die Statistikseite weist darauf hin.
Einrichtung: siehe README, Abschnitt „Statistik und Neustarts“.

## Behoben

### B-001 – Feuern mit leer geschossener Waffe tat nichts
Nach dem letzten Schuss einer Spezialwaffe blieb sie ausgewählt; FEUER! wurde ignoriert, bis der Zug nach
40 s ablief. Jetzt wird automatisch auf die Granate gewechselt. Behoben in `2666462`.

### B-002 – Schaden über die Zerstörung hinaus brachte Punkte
Ein Treffer mit 122 Schaden auf einen Panzer mit 100 Lebenspunkten brachte 122 Punkte. Jetzt zählt nur der
tatsächlich abgezogene Schaden. Behoben in `24355ad`.

### B-003 – Bedienelemente während des Countdowns anklickbar
FEUER! und die Regler waren vor dem ersten Zug aktiv (der Server hat den Schuss abgelehnt). Jetzt sind sie
anfangs gesperrt. Behoben mit dem Commit, der die Anzeigetafel eingeführt hat.
