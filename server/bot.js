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
  const options = ['heavy', 'cluster', 'drill', 'ball', 'triple'].filter(has);
  return options.length ? options[Math.floor(Math.random() * options.length)] : 'shell';
}

// Distance of the closest explosion of a shot to the target (Infinity when nothing explodes).
function miss(game, tank, weapon, angle, power, target) {
  const shells = P.fireShells(game.terrain, game.tanks, { ...tank, angle, power }, weapon, game.wind);
  let best = Infinity;
  for (const s of shells) {
    if (!s.explosion) continue;
    const d = Math.hypot(s.explosion.x - target.x, s.explosion.y - (target.y - 6));
    // never pick a shot that would hit ourselves harder than the target
    const self = Math.hypot(s.explosion.x - tank.x, s.explosion.y - (tank.y - 6));
    best = Math.min(best, self < s.explosion.r + 10 && self < d ? Infinity : d);
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
  if (tank.inv.shields > 0 && tank.shield <= 0 && tank.hp < tank.maxHp * cfg.shieldAt && Math.random() < 0.6) {
    return { shield: true };
  }
  const target = chooseTarget(tank, game.tanks, level);
  if (!target) return { weapon: 'shell', angle: 90, power: 30 };
  const weapon = chooseWeapon(tank, target, level);
  const aim = findAim(game, tank, weapon, target);
  return {
    weapon,
    angle: Math.max(0, Math.min(180, Math.round(aim.angle + rand(-cfg.angleErr, cfg.angleErr)))),
    power: Math.max(10, Math.min(tank.maxPower, Math.round(aim.power + rand(-cfg.powerErr, cfg.powerErr)))),
  };
}

// Shopping list per difficulty, bought in this order as long as the money lasts.
const SHOPPING = {
  easy: [['item', 'ball'], ['item', 'heavy'], ['upgrade', 'armor']],
  medium: [['upgrade', 'armor'], ['item', 'heavy'], ['item', 'shield'], ['item', 'cluster'], ['upgrade', 'shock']],
  hard: [['item', 'nuke'], ['upgrade', 'armor'], ['upgrade', 'shieldBoost'], ['item', 'shield'], ['item', 'heavy'], ['upgrade', 'cannon'], ['item', 'cluster']],
};

function shoppingList(level) {
  return SHOPPING[level] || SHOPPING.medium;
}

module.exports = { DIFFICULTIES, BOT_NAMES, decide, shoppingList };
