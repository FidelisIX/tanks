// Regenerates docs/WAFFEN.md from shared/physics.js, so the document matches the
// balancing values. Run after changing weapons, prices or upgrades:
//   node scripts/build-waffen-doc.js
const fs = require('fs');
const path = require('path');
const P = require('../shared/physics');

const num = (v) => String(v).replace('.', ',');
const pct = (v) => `${Math.round(v * 100)} %`;
const wind = (d) =>
  d <= 0.6 ? `sehr gering (${num(d)})` : d < 1 ? `gering (${num(d)})` : d === 1 ? 'normal (1)' : d <= 1.3 ? `hoch (${num(d)})` : `sehr hoch (${num(d)})`;

const weaponRows = P.WEAPON_ORDER.map((k, i) => {
  const w = P.WEAPONS[k];
  const shop = P.SHOP_ITEMS[k];
  let dmg = w.dirt ? '– (baut Erde auf)' : String(w.damage);
  if (w.spread) dmg = `${w.spread.length} × ${w.damage}`;
  if (w.cluster) dmg = `${w.cluster.count} × ${P.WEAPONS.bomblet.damage}`;
  const radius = w.cluster ? `${P.WEAPONS.bomblet.radius} px je Splitter` : `${w.radius} px`;
  const start = w.ammo === -1 ? '∞' : w.ammo === 0 ? 'nur Shop' : w.ammo;
  return `| ${i + 1} | ${w.name} | ${dmg} | ${radius} | ${wind(w.drag)} | ${start} | ${shop ? shop.price : '–'} |`;
}).join('\n');

const weaponText = P.WEAPON_ORDER.map((k) => `- **${P.WEAPONS[k].name}:** ${P.WEAPONS[k].desc}`).join('\n');

const upgradeRows = Object.entries(P.UPGRADES)
  .map(([k, u]) => {
    let extra = '';
    if (k === 'armor') extra = ` (höchstens −${Math.round(P.ARMOR_REDUCTION * u.prices.length * 100)} %; wirkt erst auf den Schaden, der durch den Schild kommt; nicht bei Fallschaden)`;
    if (k === 'shock') extra = ` (Stufe ${u.prices.length} = kein Fallschaden)`;
    if (k === 'climber')
      extra = ` (Stufe 1: Steigung bis ${num(P.CLIMB[1].maxSlope)} : 1, halber Aufschlag bergauf; Stufe 2: bis ${num(P.CLIMB[2].maxSlope)} : 1, kein Aufschlag)`;
    return `| ${u.name} | ${u.desc}${extra} | ${u.prices.length} | ${u.prices.join(' / ')} |`;
  })
  .join('\n');

const inv = P.newInventory();
const R = P.REWARDS;
const S = P.SHOP_ITEMS;

const md = `# Waffen & Upgrades

Diese Datei wird mit \`node scripts/build-waffen-doc.js\` aus \`shared/physics.js\` erzeugt – bitte nicht von Hand
bearbeiten, sondern nach Balancing-Änderungen neu erzeugen. Die **Hilfe im Spiel** (Knopf „?“ oder Taste H)
zeigt dieselben Werte.

## Waffen

| Taste | Waffe | Schaden | Krater | Windanfälligkeit | Start | Preis |
|---|---|---|---|---|---|---|
${weaponRows}

- **Schaden** ist der Wert bei einem Treffer im Zentrum der Explosion. Er nimmt mit dem Abstand linear ab, bis auf
  ${pct(1 - P.DAMAGE_FALLOFF)} am Rand (Krater-Radius + ${P.DAMAGE_REACH} px). Weiter weg gibt es keinen Schaden.
- **Windanfälligkeit** ist der Luftwiderstands-Faktor der Waffe (\`drag\`): je größer, desto stärker wird das Geschoss abgetrieben.
- **Start** ist die Munition zu Beginn eines Matches. Was übrig bleibt, nimmt man in die nächste Runde mit.
  Ist die gewählte Waffe leer, wird automatisch die Granate gewählt.

### Was die Waffen tun

${weaponText}

## Schild, Teleport, Treibstoff

| | Wirkung | Zum Start | Preis |
|---|---|---|---|
| Schild (Taste S) | Energieblase mit ${P.SHIELD_HP} Punkten. Gegnerische Geschosse explodieren schon an der Blase; der Schild fängt den Schaden ab, bis seine Punkte aufgebraucht sind. Das eigene Geschoss fliegt durch den eigenen Schild. Aktivieren kostet den Zug. Kein Schutz vor Fallschaden. | ${inv.shields} | ${S.shield.price} |
| Teleport (Taste T) | Im eigenen Zug eine Stelle auf der Karte anklicken; der Panzer springt dorthin. Nicht näher als ${P.TELEPORT_MIN_DISTANCE} px an einen anderen Panzer. Kostet den Zug. | 0 | ${S.teleport.price} |
| Treibstoff (A/D, ◀ ▶) | Zu Beginn jeder Runde ${P.ROUND_FUEL}, der Rest verfällt am Rundenende. Fahren kostet 1 pro Pixel, bergauf zusätzlich ${num(P.CLIMB[0].uphillCost)} pro Pixel Höhe. Ohne Kletterketten schafft der Panzer Steigungen bis ${num(P.CLIMB[0].maxSlope)} : 1; von Klippen fährt er nicht hinunter. | ${P.ROUND_FUEL} pro Runde | +${S.fuel.qty} für ${S.fuel.price} (gilt für die nächste Runde) |

## Upgrades

Upgrades gelten für das ganze Match und werden zwischen den Runden im Shop gekauft.

| Upgrade | Wirkung pro Stufe | Stufen | Preise |
|---|---|---|---|
${upgradeRows}

Alle Panzer haben immer ${P.BASE_HP} Lebenspunkte. Ohne Upgrades: maximale Kraft ${P.BASE_MAX_POWER}, Schild ${P.SHIELD_HP} Punkte.
Die Panzerung verringert den erlittenen Schaden, statt Lebenspunkte hinzuzufügen. Der Gegner bekommt nur Punkte für den
tatsächlich erlittenen Schaden, an einem gepanzerten Panzer verdient er also weniger.

## Regeln, die beim Einsatz helfen

- **Fallschaden:** Bricht der Boden unter einem Panzer weg, fällt er. Ab ${P.FALL_MIN} px Fallhöhe: Fallhöhe ÷ ${P.FALL_DIV}, höchstens ${P.FALL_MAX}.
  Große Krater unter einem Gegner (Schwere Bombe, Atombombe, Bohrer) bringen deshalb oft zusätzlichen Schaden.
- **Unterer Kartenrand:** Ein Panzer kann bis ganz nach unten fallen; er nimmt dabei nur den normalen Fallschaden und spielt weiter.
- **Keine Tunnel:** Das Gelände hat pro Spalte nur eine Bodenhöhe. Auch der Bohrer gräbt keinen Tunnel; nach seiner
  Explosion sackt die Erde darüber nach und es entsteht ein tiefer Krater.
- **Wind:** Stärke 0–${P.MAX_WIND}, zu Beginn jeder Runde ausgewürfelt, danach ändert er sich pro Zug um höchstens ±${P.WIND_DRIFT}.
  In der Höhe weht er stärker als am Boden, hohe Bogenschüsse werden also stärker abgetrieben.
- **Punkte = Geld:** ${R.perDamage} pro Schadenspunkt am Gegner (auch auf den Schild und Fallschaden durch deinen Krater),
  ${R.kill} pro Abschuss, ${R.win} für den Rundensieg, ${R.base} Grundbetrag pro Runde. Schaden über die Zerstörung hinaus zählt nicht.

## Tipps

- **Gegner in einer Mulde:** Der Ball rollt den Hang hinunter und explodiert am tiefsten Punkt.
- **Gegner hinter einem Hügel:** Der Bohrer gräbt sich bis zu ${P.WEAPONS.drill.drill} px durch die Erde und zündet, sobald er nah an einen Gegner kommt.
- **Gegner mit Schild:** Mehrere kleine Treffer (Dreierfächer, Splitterbombe) bauen den Schild ab; danach mit einer starken Waffe nachlegen.
- **Selbst in Gefahr:** Ein Erdklumpen vor dem eigenen Panzer gibt Deckung; ein Schild schützt, kostet aber den Zug.
  Ein Teleport bringt dich aus einem tiefen Krater oder aus der Schusslinie.
- **Starker Wind:** Schwere Bombe und Atombombe werden am wenigsten abgetrieben.
- **Hügeliges Gelände:** Mit Kletterketten kommst du auch steile Hänge und Kraterwände hinauf und verbrauchst bergauf weniger Treibstoff.
`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'WAFFEN.md'), md);
console.log('docs/WAFFEN.md geschrieben');
