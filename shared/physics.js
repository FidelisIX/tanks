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
  const WIND_SCALE = 0.0025;
  const MAX_WIND = 10;
  const TANK_RADIUS = 13;
  const BARREL = 20;
  const TURRET_Y = 10;
  const MAX_TICKS = 1500;
  const SUBSTEPS = 4;
  const ANIM_SPEED = 2; // simulation ticks rendered per frame
  const TURN_SECONDS = 40;
  const MAX_PLAYERS = 4;
  const COLORS = ['#e8553b', '#3ba7e8', '#f2c230', '#9b5de5'];

  // ammo -1 = unlimited
  const WEAPONS = {
    shell: { name: 'Granate', radius: 28, damage: 35, ammo: -1 },
    heavy: { name: 'Schwere Bombe', radius: 55, damage: 55, ammo: 2 },
    triple: { name: 'Dreierfächer', radius: 22, damage: 24, ammo: 3, spread: [-5, 0, 5] },
    dirt: { name: 'Erdklumpen', radius: 45, damage: 0, ammo: 2, dirt: true },
  };
  const WEAPON_ORDER = ['shell', 'heavy', 'triple', 'dirt'];

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

  // Returns { path: [[x,y],...] one point per tick, impact: {x,y} | null }
  function simulateShot(terrain, tanks, shooterId, start, angleDeg, power, wind) {
    const a = (angleDeg * Math.PI) / 180;
    let x = start.x;
    let y = start.y;
    let vx = Math.cos(a) * power * POWER_SCALE;
    let vy = -Math.sin(a) * power * POWER_SCALE;
    const dt = 1 / SUBSTEPS;
    const path = [[round1(x), round1(y)]];
    for (let t = 1; t <= MAX_TICKS; t++) {
      for (let s = 0; s < SUBSTEPS; s++) {
        vx += wind * WIND_SCALE * dt;
        vy += GRAVITY * dt;
        x += vx * dt;
        y += vy * dt;
        if (x < -300 || x > W + 300 || y > H + 50) {
          path.push([round1(x), round1(y)]);
          return { path, impact: null };
        }
        let hit = x >= 0 && x < W && y >= terrain[Math.floor(x)];
        if (!hit) {
          for (const tank of tanks) {
            if (!tank.alive || (tank.id === shooterId && t < 8)) continue;
            const c = tankCenter(tank);
            if (Math.hypot(x - c.x, y - c.y) < TANK_RADIUS) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          path.push([round1(x), round1(y)]);
          return { path, impact: { x: round1(x), y: round1(y) } };
        }
      }
      path.push([round1(x), round1(y)]);
    }
    return { path, impact: null };
  }

  function explosionDamage(tank, ex, weapon) {
    if (!weapon.damage) return 0;
    const c = tankCenter(tank);
    const d = Math.hypot(c.x - ex.x, c.y - ex.y);
    const reach = ex.r + 10;
    if (d >= reach) return 0;
    return Math.round(weapon.damage * (1 - 0.6 * (d / reach)));
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
        if (fall > 15) dmg[tank.id] = Math.min(30, Math.round(fall / 6));
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
    W, H, GRAVITY, MAX_WIND, TANK_RADIUS, BARREL, TURRET_Y, ANIM_SPEED, TURN_SECONDS,
    MAX_PLAYERS, COLORS, WEAPONS, WEAPON_ORDER,
    generateTerrain, placeTanks, carve, addDirt, applyCrater, barrelTip, simulateShot,
    explosionDamage, settleTanks,
  };
});
