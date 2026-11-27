'use strict';

// Computer opponents. They aim by running the same physics simulation the server uses,
// then add an aiming error that depends on the difficulty.
const P = require('../shared/physics');

const DIFFICULTIES = {
  easy: { label: 'Leicht', angleErr: 7, powerErr: 8, specialChance: 0.15, shieldAt: 0 },
  medium: { label: 'Mittel', angleErr: 2.5, powerErr: 3.5, specialChance: 0.35, shieldAt: 0.4 },
  hard: { label: 'Schwer', angleErr: 0.8, powerErr: 1.2, specialChance: 0.6, shieldAt: 0.5 },
};
const BOT_NAMES = ['Rost-Rudi', 'Kanonen-Karla', 'Panzer-Paul', 'Mörser-Maja', 'Granaten-Gustav', 'Bomben-Berta'];

const rand = (a, b) => a + Math.random() * (b - a);

function chooseTarget(tank, tanks, level) {
  const enemies = tanks.filter((t) => t.alive && t.id !== tank.id);
  if (level === 'easy') return enemies[Math.floor(Math.random() * enemies.length)];
  // weakest first, nearer ones break ties
  return enemies.sort((a, b) => a.hp - b.hp || Math.abs(a.x - tank.x) - Math.abs(b.x - tank.x))[0];
}

function chooseWeapon(tank, target, level) {
  const cfg = DIFFICULTIES[level];
  const has = (k) => tank.ammo[k] > 0;
  if (Math.random() > cfg.specialChance) return 'shell';
  if (has('nuke') && target.hp > 50) return 'nuke';
  if (has('hotshower') && target.hp > 40) return 'hotshower';
  const options = ['heavy', 'cluster', 'drill', 'ball', 'motorball', 'triple', 'trench'].filter(has);
  return options.length ? options[Math.floor(Math.random() * options.length)] : 'shell';
}

// Distance of the closest explosion of a shot to the target (Infinity when nothing explodes).
// Trench digger: it does no explosion damage, so it is only worth it if digging under the
// target makes it fall. Lower is better, like a distance: minus the fall the target would take.
function trenchScore(game, tank, shells, target) {
  const terrain = game.terrain.slice();
  for (const s of shells) if (s.explosion) P.applyCrater(terrain, s.explosion);
  const clones = game.tanks.map((t) => ({ ...t }));
  const falls = P.settleTanks(terrain, clones);
  if (falls[tank.id]) return Infinity; // never dig under ourselves
  return falls[target.id] ? -falls[target.id] : Infinity;
}

function miss(game, tank, weapon, angle, power, target) {
  const shells = P.fireShells(game.terrain, game.tanks, { ...tank, angle, power }, weapon, game.wind);
  if (P.WEAPONS[weapon].trench) return trenchScore(game, tank, shells, target);
  let best = Infinity;
  for (const s of shells) {
    if (!s.explosion) continue;
    // never pick a shot in which any explosion would reach ourselves (fans and cluster bombs
    // have several; one good shell must not hide another one landing next to us)
    const self = Math.hypot(s.explosion.x - tank.x, s.explosion.y - (tank.y - 6));
    if (P.WEAPONS[s.w].damage && self < s.explosion.r + P.DAMAGE_REACH) return Infinity;
    best = Math.min(best, Math.hypot(s.explosion.x - target.x, s.explosion.y - (target.y - 6)));
  }
  return best;
}

function findAim(game, tank, weapon, target) {
  let best = { d: Infinity, angle: target.x < tank.x ? 135 : 45, power: 60 };
  const side = target.x < tank.x ? [92, 178] : [2, 88];
  for (let power = 25; power <= tank.maxPower; power += 3) {
    for (let angle = side[0]; angle <= side[1]; angle += 2) {
      const d = miss(game, tank, weapon, angle, power, target);
      if (d < best.d) best = { d, angle, power };
    }
  }
  // refine around the best coarse hit
  const coarse = { ...best };
  for (let power = coarse.power - 3; power <= coarse.power + 3; power++) {
    for (let angle = coarse.angle - 2; angle <= coarse.angle + 2; angle++) {
      if (power < 10 || power > tank.maxPower || angle < 0 || angle > 180) continue;
      const d = miss(game, tank, weapon, angle, power, target);
      if (d < best.d) best = { d, angle, power };
    }
  }
  return best;
}

// What the bot does on its turn: { shield: true } or { weapon, angle, power }.
function decide(game, tank, level = 'medium') {
  const cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
  // badly damaged: repair first (repair kits are bought by medium and hard bots)
  if (tank.inv.repairs > 0 && level !== 'easy' && tank.hp <= tank.maxHp - P.REPAIR_HP && tank.hp < tank.maxHp * 0.45) {
    return { repair: true };
  }
  if (tank.inv.shields > 0 && tank.shield <= 0 && tank.hp < tank.maxHp * cfg.shieldAt && Math.random() < 0.6) {
    return { shield: true };
  }
  const target = chooseTarget(tank, game.tanks, level);
  if (!target) return { weapon: 'shell', angle: 90, power: 30 };
  let weapon = chooseWeapon(tank, target, level);
  let aim = findAim(game, tank, weapon, target);
  if (aim.d === Infinity && weapon !== 'shell') {
    weapon = 'shell'; // e.g. no trench that would make the target fall
    aim = findAim(game, tank, weapon, target);
  }
  const shot = {
    weapon,
    angle: Math.max(0, Math.min(180, Math.round(aim.angle + rand(-cfg.angleErr, cfg.angleErr)))),
    power: Math.max(10, Math.min(tank.maxPower, Math.round(aim.power + rand(-cfg.powerErr, cfg.powerErr)))),
  };
  // the deliberate aiming error must not turn the shot against ourselves
  if (!harmsSelf(game, tank, shot)) return shot;
  const exact = { weapon, angle: aim.angle, power: aim.power };
  return harmsSelf(game, tank, exact) ? { weapon: 'shell', angle: aim.angle, power: aim.power } : exact;
}

// Would this shot damage our own tank, by an explosion or by digging away the ground under it?
function harmsSelf(game, tank, { weapon, angle, power }) {
  const shells = P.fireShells(game.terrain, game.tanks, { ...tank, angle, power }, weapon, game.wind);
  const terrain = game.terrain.slice();
  for (const s of shells) {
    if (!s.explosion) continue;
    if (P.explosionDamage(tank, s.explosion, P.WEAPONS[s.w]) > 0) return true;
    P.applyCrater(terrain, s.explosion);
  }
  const falls = P.settleTanks(terrain, game.tanks.map((t) => ({ ...t })));
  return !!falls[tank.id];
}

// Shopping list per difficulty, bought in this order as long as the money lasts.
const SHOPPING = {
  easy: [['item', 'ball'], ['item', 'heavy'], ['item', 'motorball'], ['upgrade', 'armor']],
  medium: [['upgrade', 'armor'], ['item', 'repair'], ['item', 'heavy'], ['item', 'shield'], ['item', 'motorball'], ['item', 'cluster'], ['upgrade', 'shock']],
  hard: [['item', 'hotshower'], ['item', 'repair'], ['item', 'nuke'], ['upgrade', 'armor'], ['upgrade', 'shieldBoost'], ['item', 'shield'], ['item', 'heavy'], ['item', 'motorball'], ['upgrade', 'cannon'], ['item', 'cluster']],
};

function shoppingList(level) {
  return SHOPPING[level] || SHOPPING.medium;
}

module.exports = { DIFFICULTIES, BOT_NAMES, decide, shoppingList };
