(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '');

  function card(title, rec, unit, extra = '') {
    if (!rec) return `<div class="record"><span class="hint">${title}</span><b>–</b></div>`;
    return `<div class="record"><span class="hint">${title}</span><b>${rec.value} ${unit}</b>
      <span>${esc(rec.name)}${extra}</span>${rec.date ? `<small class="hint">${date(rec.date)}</small>` : ''}</div>`;
  }

  async function load() {
    const res = await fetch(`/api/stats?mode=${$('mode').value}`);
    const s = await res.json();
    $('storage').textContent = s.storage.persistent
      ? `${s.matches} Matches gespeichert.`
      : `${s.matches} Matches seit dem letzten Serverstart. Ohne STATS_GITHUB_TOKEN wird die Statistik nicht dauerhaft gespeichert.`;
    if (s.storage.error) $('storage').textContent += ` Fehler beim Laden: ${s.storage.error}`;
    const r = s.records;
    $('records').innerHTML = [
      card('Meiste Siege', r.mostWins, 'Siege'),
      card('Höchste Punktzahl in einem Match', r.bestScore, 'Punkte', r.bestScore ? ` (${r.bestScore.rounds} Runden)` : ''),
      card('Bester einzelner Schuss', r.bestShot, 'Schaden', r.bestShot ? ` mit ${esc(r.bestShot.weapon)}` : ''),
      card('Meiste Abschüsse in einem Match', r.mostKills, 'Abschüsse'),
      card('Am meisten Schaden insgesamt', r.mostDamage, 'Schaden'),
      card('Meiste Matches', r.mostMatches, 'Matches'),
    ].join('');
    $('players').innerHTML = s.players.length
      ? `<tr><th>Spieler</th><th>Matches</th><th>Siege</th><th>Quote</th><th>Ø Punkte</th><th>Abschüsse</th><th>Schaden</th><th>Lieblingswaffe</th></tr>` +
        s.players
          .map(
            (p) => `<tr><td>${esc(p.name)}</td><td>${p.matches}</td><td>${p.wins}</td><td>${p.winRate} %</td><td>${p.avgScore}</td>
              <td>${p.kills}</td><td>${p.damage}</td><td>${esc(p.favoriteWeapon || '–')}</td></tr>`
          )
          .join('')
      : '<tr><td>Noch keine Matches.</td></tr>';
  }

  $('mode').onchange = load;
  load();
})();
