// Shared game rules and physics. Used by the server (authoritative) and the
// browser (for local animation of craters).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Physics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 1200;
  const H = 650;
  const GRAVITY = 0.2;
  const POWER_SCALE = 0.17;
  const DRAG = 0.00022; // quadratic air drag, scaled per weapon by `drag`
  const WIND_SPEED = 0.7; // air speed (px/tick) per wind unit near the ground
  const ROLL_FRICTION = 0.012;
  const BALL_RADIUS = 4;
  const MAX_ROLL_TICKS = 450;
  const SHIELD_RADIUS = 30;
  const SHIELD_HP = 60;
  const MAX_WIND = 10;
  const TANK_RADIUS = 13;
  const BARREL = 20;
  const TURRET_Y = 10;
  const MAX_TICKS = 1500;
  const SUBSTEPS = 4;
  const ANIM_SPEED = 2; // simulation ticks rendered per frame
  const TURN_SECONDS = 40;
  const SHOP_SECONDS = 30;
  const ROUND_OPTIONS = [3, 5, 10];
  const BASE_HP = 100;
  const ARMOR_REDUCTION = 0.1; // explosion damage taken per armor level
  const BASE_MAX_POWER = 100;
  const START_FUEL = 100;
  const DRILL_SPEED = 2;
  // explosion damage: full at the centre, down to (1 - DAMAGE_FALLOFF) at radius + DAMAGE_REACH
  const DAMAGE_REACH = 10;
  const DAMAGE_FALLOFF = 0.6;
  // fall damage: only above FALL_MIN px, fall / FALL_DIV, at most FALL_MAX
  const FALL_MIN = 15;
  const FALL_DIV = 6;
  const FALL_MAX = 30;
  const MAX_PLAYERS = 4;
  const COLORS = ['#e8553b', '#3ba7e8', '#f2c230', '#9b5de5'];

  // ammo: amount at the start of a match (-1 = unlimited)
  // drag: relative air resistance (heavy shells are pushed around less by wind)
  const WEAPONS = {
    shell: { name: 'Granate', radius: 28, damage: 35, ammo: -1, drag: 1, desc: 'Standardgeschoss, unbegrenzt. Explodiert beim ersten Kontakt mit Boden, Panzer oder Schild.' },
    heavy: { name: 'Schwere Bombe', radius: 55, damage: 55, ammo: 2, drag: 0.6, desc: 'Großer Krater und viel Schaden. Schwer, deshalb wenig vom Wind abgetrieben.' },
    triple: { name: 'Dreierfächer', radius: 22, damage: 24, ammo: 3, drag: 1.3, spread: [-5, 0, 5], desc: 'Drei leichte Geschosse im Fächer (−5°, 0°, +5°). Gut gegen weit verteilte oder schwer zu treffende Ziele; stark windanfällig.' },
    dirt: { name: 'Erdklumpen', radius: 45, damage: 0, ammo: 2, drag: 1.5, dirt: true, desc: 'Macht keinen Schaden, sondern baut einen Erdhügel auf: Deckung vor dir oder einen Gegner eingraben.' },
    ball: { name: 'Ball', radius: 30, damage: 40, ammo: 3, drag: 1.1, roll: true, desc: 'Rollt nach dem Aufprall den Hang hinunter, prallt an steilen Wänden ab und fliegt über Klippen. Explodiert, wenn er liegen bleibt oder einen Panzer berührt – ideal für Gegner in Mulden.' },
    drill: { name: 'Bohrer', radius: 32, damage: 45, ammo: 0, drag: 0.8, drill: 90, desc: 'Gräbt sich nach dem Aufprall bis zu 90 px weiter durch die Erde und explodiert dann – trifft Gegner hinter Hügeln oder unter Erdhaufen.' },
    cluster: { name: 'Splitterbombe', radius: 20, damage: 20, ammo: 0, drag: 1, cluster: { count: 5, spread: 1.1 }, desc: 'Zerfällt am höchsten Punkt der Flugbahn in 5 Splitter (je 18 Schaden, Krater 18 px), die sich auffächern.' },
    nuke: { name: 'Atombombe', radius: 115, damage: 95, ammo: 0, drag: 0.5, desc: 'Riesiger Krater und fast tödlicher Schaden im ganzen Umkreis; bricht viel Boden weg (Fallschaden). Kaum windanfällig, sehr teuer.' },
    bomblet: { name: 'Splitter', radius: 18, damage: 18, ammo: 0, drag: 1.3 }, // spawned by cluster only
  };
  const WEAPON_ORDER = ['shell', 'heavy', 'triple', 'dirt', 'ball', 'drill', 'cluster', 'nuke'];

  // Shop between rounds. Items add to the inventory, upgrades are permanent for the match.
  const SHOP_ITEMS = {
    heavy: { name: 'Schwere Bombe', price: 40, qty: 1 },
    triple: { name: 'Dreierfächer', price: 35, qty: 1 },
    dirt: { name: 'Erdklumpen', price: 25, qty: 1 },
    ball: { name: 'Ball', price: 35, qty: 1 },
    drill: { name: 'Bohrer', price: 50, qty: 1, desc: 'gräbt sich nach dem Aufprall durch die Erde' },
    cluster: { name: 'Splitterbombe', price: 60, qty: 1, desc: 'zerfällt am höchsten Punkt in 5 Splitter' },
    nuke: { name: 'Atombombe', price: 280, qty: 1, desc: 'riesiger Krater, fast tödlich im ganzen Umkreis' },
    shield: { name: 'Schild', price: 60, qty: 1, desc: 'Energieblase, kostet beim Einsatz den Zug' },
    fuel: { name: 'Treibstoff', price: 20, qty: 60, desc: 'zum Fahren (A/D)' },
  };
  const UPGRADES = {
    armor: { name: 'Panzerung', desc: '−10 % Explosionsschaden', prices: [80, 120, 160] },
    shieldBoost: { name: 'Schildverstärker', desc: '+30 Schildpunkte', prices: [70, 110] },
    shock: { name: 'Stoßdämpfer', desc: '−50 % Fallschaden', prices: [60, 90] },
    cannon: { name: 'Turbo-Kanone', desc: '+10 max. Kraft', prices: [70, 110] },
  };
  const REWARDS = { perDamage: 1, kill: 50, win: 75, base: 30 };

  function newInventory() {
    const ammo = {};
    for (const k of WEAPON_ORDER) ammo[k] = WEAPONS[k].ammo;
    return { ammo, shields: 1, fuel: START_FUEL, upgrades: { armor: 0, shieldBoost: 0, shock: 0, cannon: 0 } };
  }

  // Armor reduces the explosion damage a tank takes instead of adding hit points, so an
  // armored tank does not hand out more points to its attackers.
  function maxHp() {
    return BASE_HP;
  }
  function damageFactor(inv) {
    return Math.max(0, 1 - ARMOR_REDUCTION * inv.upgrades.armor);
  }
  function maxPower(inv) {
    return BASE_MAX_POWER + 10 * inv.upgrades.cannon;
  }
  function shieldHp(inv) {
    return SHIELD_HP + 30 * inv.upgrades.shieldBoost;
  }
  function fallFactor(inv) {
    return Math.max(0, 1 - 0.5 * inv.upgrades.shock);
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // terrain[x] = y coordinate of the ground surface (0 = top of screen)
  function generateTerrain(seed) {
    const rng = mulberry32(seed);
    const waves = [];
    for (let i = 0; i < 5; i++) {
      waves.push({
        amp: (70 / (i + 1)) * (0.5 + rng()),
        freq: ((i + 1) * (0.6 + rng() * 0.9) * Math.PI * 2) / W,
        phase: rng() * Math.PI * 2,
      });
    }
    const base = H * (0.58 + rng() * 0.1);
    const terrain = new Array(W);
    for (let x = 0; x < W; x++) {
      let y = base;
      for (const w of waves) y += w.amp * Math.sin(w.freq * x + w.phase);
      terrain[x] = Math.round(Math.min(H - 40, Math.max(H * 0.28, y)));
    }
    return terrain;
  }

  function placeTanks(terrain, count, seed) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const xs = [];
    for (let i = 0; i < count; i++) {
      const slot = W / count;
      xs.push(Math.round(slot * i + slot * (0.3 + rng() * 0.4)));
    }
    // shuffle so the join order does not decide the side
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    for (const tx of xs) {
      const y = terrain[tx];
      for (let x = Math.max(0, tx - 16); x <= Math.min(W - 1, tx + 16); x++) terrain[x] = y;
    }
    return xs;
  }

  function carve(terrain, cx, cy, r) {
    for (let x = Math.max(0, Math.ceil(cx - r)); x <= Math.min(W - 1, Math.floor(cx + r)); x++) {
      const dx = x - cx;
      const dy = Math.sqrt(r * r - dx * dx);
      const surf = terrain[x];
      const removed = Math.max(0, Math.min(cy + dy, H) - Math.max(cy - dy, surf));
      if (removed > 0) terrain[x] = Math.min(H, Math.round(surf + removed));
    }
  }

  function addDirt(terrain, cx, cy, r) {
    for (let x = Math.max(0, Math.ceil(cx - r)); x <= Math.min(W - 1, Math.floor(cx + r)); x++) {
      const dx = x - cx;
      const dy = Math.sqrt(r * r - dx * dx);
      const surf = terrain[x];
      const added = Math.max(0, Math.min(cy + dy, surf) - (cy - dy));
      if (added > 0) terrain[x] = Math.max(20, Math.round(surf - added));
    }
  }

  function applyCrater(terrain, ex) {
    if (ex.dirt) addDirt(terrain, ex.x, ex.y, ex.r);
    else carve(terrain, ex.x, ex.y, ex.r);
  }

  function barrelTip(tank, angleDeg) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: tank.x + Math.cos(a) * BARREL, y: tank.y - TURRET_Y - Math.sin(a) * BARREL };
  }

  function tankCenter(tank) {
    return { x: tank.x, y: tank.y - 6 };
  }

  // Air speed at height y: wind gets stronger with altitude (simple wind-shear profile).
  function windAt(wind, y) {
    const alt = Math.max(0, Math.min(1.5, (H - y) / H));
    return wind * WIND_SPEED * (0.5 + alt);
  }

  function slopeAt(terrain, x) {
    const a = terrain[Math.max(0, Math.floor(x) - 3)];
    const b = terrain[Math.min(W - 1, Math.floor(x) + 3)];
    return (b - a) / 6; // dy/dx, positive = downhill to the right
  }

  function hitsTank(tanks, shooterId, x, y, t) {
    for (const tank of tanks) {
      if (!tank.alive) continue;
      const own = tank.id === shooterId;
      const c = tankCenter(tank);
      const d = Math.hypot(x - c.x, y - c.y);
      // a shield bubble catches enemy shells; your own shell passes through your own shield
      if (!own && tank.shield > 0 && d < SHIELD_RADIUS) return true;
      if ((!own || t >= 8) && d < TANK_RADIUS) return true;
    }
    return false;
  }

  // Flies one projectile from (x, y) with velocity (vx, vy).
  // Returns { path: [[x,y],...] one point per tick, impact: {x,y} | null, split?: {x,y,vx,vy} }
  function simulate(terrain, tanks, shooterId, x, y, vx, vy, wind, weapon, t0 = 0) {
    const drag = DRAG * (weapon.drag || 1);
    let mode = 'fly'; // 'fly' | 'roll' | 'drill'
    let rollTicks = 0;
    let slowTicks = 0;
    let drilled = 0;
    let dir = null;
    const dt = 1 / SUBSTEPS;
    const path = [[round1(x), round1(y)]];
    const impact = () => {
      path.push([round1(x), round1(y)]);
      return { path, impact: { x: round1(x), y: round1(y) } };
    };

    for (let t = t0 + 1; t <= MAX_TICKS; t++) {
      const vyBefore = vy;
      for (let s = 0; s < SUBSTEPS; s++) {
        if (mode === 'fly') {
          // gravity + quadratic drag relative to the moving air
          const rvx = vx - windAt(wind, y);
          const rv = Math.hypot(rvx, vy);
          vx -= drag * rv * rvx * dt;
          vy += (GRAVITY - drag * rv * vy) * dt;
          x += vx * dt;
          y += vy * dt;
          if (x < -300 || x > W + 300 || y > H + 50) {
            path.push([round1(x), round1(y)]);
            return { path, impact: null };
          }
          if (hitsTank(tanks, shooterId, x, y, t)) return impact();
          if (x >= 0 && x < W && y >= terrain[Math.floor(x)]) {
            if (weapon.roll) {
              // touch down: keep the velocity component along the slope
              const sl = slopeAt(terrain, x);
              vx = ((vx + vy * sl) / (1 + sl * sl)) * 0.8;
              vy = 0;
              y = terrain[Math.floor(x)] - BALL_RADIUS;
              mode = 'roll';
            } else if (weapon.drill) {
              const v = Math.hypot(vx, vy) || 1;
              dir = { x: vx / v, y: vy / v };
              mode = 'drill';
            } else return impact();
          }
        } else if (mode === 'drill') {
          x += dir.x * DRILL_SPEED * dt;
          y += dir.y * DRILL_SPEED * dt;
          drilled += DRILL_SPEED * dt;
          if (x < 0 || x >= W || y >= H - 2) return impact();
          if (hitsTank(tanks, shooterId, x, y, t)) return impact();
          // explode when the drill comes out into the open air or has dug far enough
          if (y < terrain[Math.floor(x)] - 3 || drilled >= weapon.drill) return impact();
        } else {
          const sl = slopeAt(terrain, x);
          vx += ((GRAVITY * sl) / (1 + sl * sl)) * dt;
          vx -= Math.sign(vx) * Math.min(Math.abs(vx), ROLL_FRICTION * dt);
          vx *= 1 - 0.006 * dt; // rolling resistance grows with speed
          const nx = x + vx * dt;
          if (nx < 0 || nx >= W) {
            x = nx;
            path.push([round1(x), round1(y)]);
            return { path, impact: null }; // rolled off the map
          }
          const ground = terrain[Math.floor(x)];
          const next = terrain[Math.floor(nx)];
          const limit = Math.max(3, 2.5 * Math.abs(nx - x));
          if (ground - next > limit) {
            vx *= -0.4; // too steep: bounce off the wall
          } else if (next - ground > limit) {
            x = nx; // edge of a cliff: fly again
            mode = 'fly';
          } else {
            x = nx;
            y = next - BALL_RADIUS;
          }
          if (hitsTank(tanks, shooterId, x, y, MAX_TICKS)) return impact();
        }
      }
      if (mode === 'roll') {
        rollTicks++;
        slowTicks = Math.abs(vx) < 0.08 ? slowTicks + 1 : 0;
        if (slowTicks > 15 || rollTicks > MAX_ROLL_TICKS) return impact();
      }
      path.push([round1(x), round1(y)]);
      if (weapon.cluster && mode === 'fly' && t - t0 > 5 && vyBefore < 0 && vy >= 0) {
        return { path, impact: null, split: { x, y, vx, vy } };
      }
    }
    return { path, impact: null };
  }

  function simulateShot(terrain, tanks, shooterId, start, angleDeg, power, wind, weapon) {
    const a = (angleDeg * Math.PI) / 180;
    const v = power * POWER_SCALE;
    return simulate(terrain, tanks, shooterId, start.x, start.y, Math.cos(a) * v, -Math.sin(a) * v, wind, weapon);
  }

  // All projectiles of one shot. Each shell: { w, startTick, path, explosion | null }
  // where explosion.tick is the absolute tick of the impact.
  function fireShells(terrain, tanks, shooter, weaponKey, wind) {
    const weapon = WEAPONS[weaponKey];
    const shells = [];
    const add = (w, startTick, sim) => {
      shells.push({
        w,
        startTick,
        path: sim.path,
        explosion: sim.impact
          ? { x: sim.impact.x, y: sim.impact.y, r: WEAPONS[w].radius, dirt: !!WEAPONS[w].dirt, tick: startTick + sim.path.length - 1 }
          : null,
      });
    };
    for (const d of weapon.spread || [0]) {
      const ang = shooter.angle + d;
      const sim = simulateShot(terrain, tanks, shooter.id, barrelTip(shooter, ang), ang, shooter.power, wind, weapon);
      add(weaponKey, 0, sim);
      if (sim.split) {
        const { count, spread } = weapon.cluster;
        const t0 = sim.path.length - 1;
        for (let i = 0; i < count; i++) {
          const dvx = (i - (count - 1) / 2) * spread;
          const sub = simulate(terrain, tanks, shooter.id, sim.split.x, sim.split.y, sim.split.vx + dvx, sim.split.vy, wind, WEAPONS.bomblet, t0);
          add('bomblet', t0, sub);
        }
      }
    }
    return shells;
  }

  function explosionDamage(tank, ex, weapon) {
    if (!weapon.damage) return 0;
    const c = tankCenter(tank);
    const d = Math.hypot(c.x - ex.x, c.y - ex.y);
    const reach = ex.r + DAMAGE_REACH;
    if (d >= reach) return 0;
    return Math.round(weapon.damage * (1 - DAMAGE_FALLOFF * (d / reach)));
  }

  // Drops tanks onto the (possibly changed) ground; returns fall damage per tank id.
  function settleTanks(terrain, tanks) {
    const dmg = {};
    for (const tank of tanks) {
      if (!tank.alive) continue;
      const ground = terrain[Math.round(tank.x)];
      if (ground > tank.y) {
        const fall = ground - tank.y;
        tank.y = ground;
        if (fall > FALL_MIN) dmg[tank.id] = Math.min(FALL_MAX, Math.round(fall / FALL_DIV));
      } else if (ground < tank.y) {
        // buried by dirt: stay on top
        tank.y = ground;
      }
    }
    return dmg;
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  return {
    W, H, GRAVITY, MAX_WIND, SHIELD_RADIUS, SHIELD_HP, TANK_RADIUS, BARREL, TURRET_Y, ANIM_SPEED, TURN_SECONDS,
    SHOP_SECONDS, ROUND_OPTIONS, DAMAGE_REACH, DAMAGE_FALLOFF, FALL_MIN, FALL_DIV, FALL_MAX, BASE_HP, BASE_MAX_POWER, MAX_PLAYERS, COLORS, WEAPONS, WEAPON_ORDER, SHOP_ITEMS, UPGRADES, REWARDS,
    ARMOR_REDUCTION, newInventory, maxHp, damageFactor, maxPower, shieldHp, fallFactor,
    generateTerrain, placeTanks, carve, addDirt, applyCrater, barrelTip, simulateShot, fireShells,
    explosionDamage, settleTanks,
  };
});
