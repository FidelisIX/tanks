/* global Physics, ICONS */
// In-game reference for weapons, shield, fuel and upgrades. All numbers come from
// shared/physics.js, so the page stays correct when the balancing changes.
// eslint-disable-next-line no-unused-vars
const Help = (() => {
  const P = Physics;
  const pct = (v) => `${Math.round(v * 100)} %`;
  const num = (v) => String(v).replace('.', ',');
  const wind = (drag) => {
    const d = num(drag);
    return drag <= 0.6 ? `sehr gering (${d})` : drag < 1 ? `gering (${d})` : drag === 1 ? 'normal (1)' : drag <= 1.3 ? `hoch (${d})` : `sehr hoch (${d})`;
  };

  function weaponRows() {
    return P.WEAPON_ORDER.map((k, i) => {
      const w = P.WEAPONS[k];
      const shop = P.SHOP_ITEMS[k];
      let dmg = w.dirt ? '– (baut Erde auf)' : `${w.damage}`;
      if (w.spread) dmg = `${w.spread.length} × ${w.damage}`;
      if (w.cluster) dmg = `${w.cluster.count} × ${P.WEAPONS.bomblet.damage}`;
      const radius = w.cluster ? `${P.WEAPONS.bomblet.radius} px je Splitter` : `${w.radius} px`;
      const start = w.ammo === -1 ? '∞' : w.ammo === 0 ? 'nur Shop' : w.ammo;
      return `<tr>
        <td class="h-name">${ICONS[k] || ''}<span><b>${i + 1}. ${w.name}</b><small>${w.desc || ''}</small></span></td>
        <td>${dmg}</td><td>${radius}</td><td>${wind(w.drag)}</td><td>${start}</td><td>${shop ? shop.price : '–'}</td></tr>`;
    }).join('');
  }

  function upgradeRows() {
    return Object.entries(P.UPGRADES)
      .map(([k, u]) => `<tr><td class="h-name">${ICONS[k] || ''}<span><b>${u.name}</b></span></td>
        <td>${u.desc}${k === 'shock' ? ` (Stufe ${u.prices.length} = kein Fallschaden)` : ''}${
          k === 'armor' ? ` (höchstens −${Math.round(P.ARMOR_REDUCTION * u.prices.length * 100)} %; wirkt erst auf den Schaden, der durch den Schild kommt; nicht bei Fallschaden)` : ''
        }</td>
        <td>${u.prices.length}</td><td>${u.prices.join(' / ')}</td></tr>`)
      .join('');
  }

  function html() {
    const inv = P.newInventory();
    const R = P.REWARDS;
    return `
      <div class="help-head"><h2>Waffen &amp; Upgrades</h2><button class="link" data-help-close>Schließen ✕</button></div>

      <h3>Waffen</h3>
      <div class="table-wrap"><table class="help-table">
        <tr><th>Waffe</th><th>Schaden</th><th>Krater</th><th>Windanfälligkeit</th><th>Start</th><th>Preis</th></tr>
        ${weaponRows()}
      </table></div>
      <p class="hint">Schaden ist der Wert bei einem Treffer im Zentrum. Er nimmt mit dem Abstand linear ab, bis auf
        ${pct(1 - P.DAMAGE_FALLOFF)} am Rand (Krater-Radius + ${P.DAMAGE_REACH} px); weiter weg gibt es keinen Schaden.
        „Start“ ist die Munition zu Beginn eines Matches; was übrig bleibt, nimmt man in die nächste Runde mit.
        Ist eine Waffe leer, wird automatisch die Granate gewählt.</p>

      <h3>Schild, Treibstoff</h3>
      <div class="table-wrap"><table class="help-table">
        <tr><td class="h-name">${ICONS.shield}<span><b>Schild</b><small>Taste S</small></span></td>
          <td>Energieblase mit ${P.SHIELD_HP} Punkten. Gegnerische Geschosse explodieren schon an der Blase, der Schild fängt
          den Schaden ab, bis seine Punkte aufgebraucht sind. Dein eigenes Geschoss fliegt durch deinen Schild.
          Das Aktivieren kostet den Zug. Kein Schutz vor Fallschaden.</td>
          <td>${inv.shields} zum Start</td><td>${P.SHOP_ITEMS.shield.price}</td></tr>
        <tr><td class="h-name">${ICONS.fuel}<span><b>Treibstoff</b><small>Tasten A/D, ◀ ▶</small></span></td>
          <td>Fahren im eigenen Zug kostet 1 Treibstoff pro Pixel. Steile Wände und Klippen sind nicht befahrbar.</td>
          <td>${inv.fuel} zum Start</td><td>+${P.SHOP_ITEMS.fuel.qty} für ${P.SHOP_ITEMS.fuel.price}</td></tr>
      </table></div>

      <h3>Upgrades <small class="hint">(gelten für das ganze Match)</small></h3>
      <div class="table-wrap"><table class="help-table">
        <tr><th>Upgrade</th><th>Wirkung pro Stufe</th><th>Stufen</th><th>Preise</th></tr>
        ${upgradeRows()}
      </table></div>
      <p class="hint">Ohne Upgrades: ${P.BASE_HP} Lebenspunkte, maximale Kraft ${P.BASE_MAX_POWER}.</p>

      <h3>Regeln</h3>
      <ul class="help-rules">
        <li><b>Fallschaden:</b> Bricht der Boden unter einem Panzer weg, fällt er. Ab ${P.FALL_MIN} px Fallhöhe:
          Fallhöhe ÷ ${P.FALL_DIV}, höchstens ${P.FALL_MAX}. Angezeigt als „Sturz -X“.</li>
        <li><b>Wind:</b> Geschosse haben Luftwiderstand gegenüber der bewegten Luft. In der Höhe weht der Wind stärker als
          am Boden; leichte Geschosse werden stärker abgetrieben (siehe Windanfälligkeit). Stärke 0–${P.MAX_WIND}; zu Beginn jeder Runde ausgewürfelt, danach ändert er sich pro Zug um höchstens ±${P.WIND_DRIFT}.</li>
        <li><b>Punkte = Geld:</b> ${R.perDamage} pro Schadenspunkt am Gegner (auch auf den Schild und Fallschaden durch deinen
          Krater), ${R.kill} pro Abschuss, ${R.win} für den Rundensieg, ${R.base} Grundbetrag pro Runde.</li>
        <li><b>Zugzeit:</b> ${P.TURN_SECONDS} Sekunden. Shop: ${P.SHOP_SECONDS} Sekunden oder bis alle fertig sind.</li>
      </ul>`;
  }

  function open() {
    const el = document.getElementById('help');
    document.getElementById('help-card').innerHTML = html();
    el.classList.remove('hidden');
  }
  function close() {
    document.getElementById('help').classList.add('hidden');
  }
  function isOpen() {
    return !document.getElementById('help').classList.contains('hidden');
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-help-open]')) open();
    else if (e.target.closest('[data-help-close]') || e.target.id === 'help') close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  return { open, close, isOpen };
})();
