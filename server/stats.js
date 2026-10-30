'use strict';

// Records and player table from the stored matches. Players are recognised by name
// (case-insensitive); computer opponents never appear in the table or the records.
const P = require('../shared/physics');

const key = (name) => String(name).trim().toLowerCase();

function computeStats(matches, { mode = 'all' } = {}) {
  const humans = (m) => m.players.filter((p) => !p.isBot);
  const list = matches.filter((m) => {
    const n = humans(m).length;
    if (mode === 'friends') return n >= 2; // only matches against other people
    if (mode === 'bots') return m.players.some((p) => p.isBot);
    return n >= 1;
  });

  const table = new Map();
  const records = { bestScore: null, bestShot: null, mostKills: null };
  const better = (cur, value) => !cur || value > cur.value;

  for (const m of list) {
    for (const p of humans(m)) {
      const k = key(p.name);
      const row = table.get(k) || { name: p.name, matches: 0, wins: 0, score: 0, kills: 0, damage: 0, roundWins: 0, shots: {} };
      row.name = p.name;
      row.matches++;
      if (p.place === 1) row.wins++;
      row.score += p.score;
      row.kills += p.kills;
      row.damage += p.damage;
      row.roundWins += p.roundWins;
      for (const [w, n] of Object.entries(p.shots || {})) row.shots[w] = (row.shots[w] || 0) + n;
      table.set(k, row);

      const at = { name: p.name, date: m.endedAt, room: m.room };
      if (better(records.bestScore, p.score)) records.bestScore = { ...at, value: p.score, rounds: m.rounds };
      if (p.bestShot && better(records.bestShot, p.bestShot.damage))
        records.bestShot = { ...at, value: p.bestShot.damage, weapon: P.WEAPONS[p.bestShot.weapon]?.name || p.bestShot.weapon };
      if (better(records.mostKills, p.kills)) records.mostKills = { ...at, value: p.kills };
    }
  }

  const players = [...table.values()]
    .map((r) => {
      const fav = Object.entries(r.shots).sort((a, b) => b[1] - a[1])[0];
      return {
        name: r.name,
        matches: r.matches,
        wins: r.wins,
        winRate: r.matches ? Math.round((100 * r.wins) / r.matches) : 0,
        avgScore: r.matches ? Math.round(r.score / r.matches) : 0,
        kills: r.kills,
        damage: r.damage,
        roundWins: r.roundWins,
        favoriteWeapon: fav ? P.WEAPONS[fav[0]]?.name || fav[0] : null,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.avgScore - a.avgScore);

  const top = (field) => {
    const p = [...players].sort((a, b) => b[field] - a[field])[0];
    return p && p[field] > 0 ? { name: p.name, value: p[field] } : null;
  };
  return {
    matches: list.length,
    records: { ...records, mostWins: top('wins'), mostMatches: top('matches'), mostDamage: top('damage') },
    players,
  };
}

module.exports = { computeStats };
