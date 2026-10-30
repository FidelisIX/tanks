const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const P = require('./shared/physics');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ---------- static files ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  let file;
  if (url.pathname === '/shared/physics.js') file = path.join(__dirname, 'shared', 'physics.js');
  else {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map();

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const p of room.players) if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
}

function roomInfo(room) {
  return {
    type: 'room',
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    players: room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, wins: p.wins })),
  };
}

function freeColor(room) {
  return P.COLORS.find((c) => !room.players.some((p) => p.color === c)) || P.COLORS[0];
}

function cleanName(name) {
  const n = String(name || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return n || 'Panzer';
}

function publicTanks(game) {
  return game.tanks.map((t) => ({
    id: t.id, name: t.name, color: t.color, x: t.x, y: t.y, hp: t.hp, alive: t.alive,
    angle: t.angle, power: t.power, weapon: t.weapon, ammo: t.ammo,
    shield: t.shield, shieldLeft: t.shieldLeft,
  }));
}

function randomWind() {
  return crypto.randomInt(-P.MAX_WIND, P.MAX_WIND + 1);
}

// ---------- game flow ----------
function startGame(room) {
  const seed = crypto.randomInt(1, 2 ** 31);
  const terrain = P.generateTerrain(seed);
  const xs = P.placeTanks(terrain, room.players.length, seed);
  const tanks = room.players.map((p, i) => {
    const ammo = {};
    for (const k of P.WEAPON_ORDER) ammo[k] = P.WEAPONS[k].ammo;
    const x = xs[i];
    return {
      id: p.id, name: p.name, color: p.color, x, y: terrain[x], hp: 100, alive: true,
      angle: x < P.W / 2 ? 45 : 135, power: 60, weapon: 'shell', ammo,
      shield: 0, shieldLeft: 1,
    };
  });
  room.state = 'playing';
  room.game = { terrain, tanks, turnIdx: crypto.randomInt(tanks.length) - 1, wind: 0, phase: 'aim', timer: null };
  broadcast(room, roomInfo(room));
  nextTurn(room);
}

function nextTurn(room) {
  const g = room.game;
  clearTimeout(g.timer);
  const alive = g.tanks.filter((t) => t.alive);
  if (alive.length <= 1) return endGame(room, alive[0] || null);

  do g.turnIdx = (g.turnIdx + 1) % g.tanks.length;
  while (!g.tanks[g.turnIdx].alive);

  g.wind = randomWind();
  g.phase = 'aim';
  g.currentId = g.tanks[g.turnIdx].id;
  g.timer = setTimeout(() => nextTurn(room), P.TURN_SECONDS * 1000);
  broadcast(room, {
    type: 'turn',
    currentId: g.currentId,
    wind: g.wind,
    timeLeft: P.TURN_SECONDS * 1000,
    terrain: g.terrain,
    tanks: publicTanks(g),
  });
}

function endGame(room, winner) {
  const g = room.game;
  clearTimeout(g.timer);
  room.state = 'over';
  if (winner) {
    const p = room.players.find((pl) => pl.id === winner.id);
    if (p) p.wins++;
  }
  broadcast(room, roomInfo(room));
  broadcast(room, { type: 'gameOver', winnerId: winner ? winner.id : null, winnerName: winner ? winner.name : null });
}

function fire(room, tank) {
  const g = room.game;
  const weapon = P.WEAPONS[tank.weapon];
  if (weapon.ammo !== -1) {
    if (tank.ammo[tank.weapon] <= 0) return;
    tank.ammo[tank.weapon]--;
  }
  clearTimeout(g.timer);
  g.phase = 'anim';

  const snapshot = g.terrain.slice();
  const angles = (weapon.spread || [0]).map((d) => tank.angle + d);
  const shells = angles.map((ang) => {
    const sim = P.simulateShot(snapshot, g.tanks, tank.id, P.barrelTip(tank, ang), ang, tank.power, g.wind, weapon);
    const explosion = sim.impact
      ? { x: sim.impact.x, y: sim.impact.y, r: weapon.radius, dirt: !!weapon.dirt, tick: sim.path.length - 1 }
      : null;
    return { path: sim.path, explosion };
  });

  const hits = [];
  for (const s of shells.filter((s) => s.explosion).sort((a, b) => a.explosion.tick - b.explosion.tick)) {
    for (const t of g.tanks) {
      if (!t.alive) continue;
      const dmg = P.explosionDamage(t, s.explosion, weapon);
      if (dmg > 0) hits.push({ id: t.id, ...damage(t, dmg) });
    }
    P.applyCrater(g.terrain, s.explosion);
  }
  const fall = P.settleTanks(g.terrain, g.tanks);
  for (const [id, dmg] of Object.entries(fall)) {
    const t = g.tanks.find((tt) => tt.id === id);
    t.hp = Math.max(0, t.hp - dmg); // the shield does not soften a fall
    hits.push({ id, dmg, absorbed: 0, fall: true });
  }
  for (const t of g.tanks) if (t.alive && t.hp <= 0) t.alive = false;

  const longest = Math.max(...shells.map((s) => s.path.length));
  const animMs = (longest / P.ANIM_SPEED) * (1000 / 60) + 1600;
  broadcast(room, {
    type: 'shot',
    shooterId: tank.id,
    weapon: tank.weapon,
    angle: tank.angle,
    power: tank.power,
    shells,
    hits,
    terrain: g.terrain,
    tanks: publicTanks(g),
  });
  g.timer = setTimeout(() => nextTurn(room), animMs);
}

// Explosion damage hits the shield first.
function damage(tank, dmg) {
  const absorbed = Math.min(tank.shield, dmg);
  tank.shield -= absorbed;
  tank.hp = Math.max(0, tank.hp - (dmg - absorbed));
  return { dmg: dmg - absorbed, absorbed };
}

// Raising the shield uses up the turn.
function raiseShield(room, tank) {
  const g = room.game;
  if (tank.shieldLeft <= 0) return;
  tank.shieldLeft--;
  tank.shield = P.SHIELD_HP;
  clearTimeout(g.timer);
  g.phase = 'anim';
  broadcast(room, { type: 'shield', id: tank.id, tanks: publicTanks(g) });
  g.timer = setTimeout(() => nextTurn(room), 1500);
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  player.room = null;
  room.players = room.players.filter((p) => p !== player);
  if (room.players.length === 0) {
    if (room.game) clearTimeout(room.game.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) room.hostId = room.players[0].id;
  if (room.game) {
    const t = room.game.tanks.find((tt) => tt.id === player.id);
    if (t && t.alive) {
      t.alive = false;
      t.hp = 0;
    }
  }
  broadcast(room, roomInfo(room));
  if (room.state === 'playing') {
    const g = room.game;
    const alive = g.tanks.filter((t) => t.alive);
    if (alive.length <= 1) endGame(room, alive[0] || null);
    else if (g.currentId === player.id && g.phase === 'aim') nextTurn(room);
    else broadcast(room, { type: 'tanks', tanks: publicTanks(g) });
  }
}

// ---------- websocket ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  const player = { id: crypto.randomUUID(), ws, name: 'Panzer', color: null, wins: 0, room: null };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const room = player.room;

    switch (msg.type) {
      case 'create': {
        if (room) leaveRoom(player);
        const r = { code: newCode(), players: [], hostId: player.id, state: 'lobby', game: null };
        rooms.set(r.code, r);
        player.name = cleanName(msg.name);
        player.color = freeColor(r);
        player.room = r;
        r.players.push(player);
        send(ws, { type: 'joined', you: player.id, code: r.code });
        broadcast(r, roomInfo(r));
        break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return send(ws, { type: 'error', msg: 'Raum nicht gefunden.' });
        if (r.state === 'playing') return send(ws, { type: 'error', msg: 'In diesem Raum läuft gerade ein Spiel.' });
        if (r.players.length >= P.MAX_PLAYERS) return send(ws, { type: 'error', msg: 'Der Raum ist voll.' });
        if (room) leaveRoom(player);
        player.name = cleanName(msg.name);
        player.color = freeColor(r);
        player.room = r;
        r.players.push(player);
        send(ws, { type: 'joined', you: player.id, code: r.code });
        broadcast(r, roomInfo(r));
        break;
      }
      case 'start': {
        if (!room || room.hostId !== player.id || room.state === 'playing') return;
        if (room.players.length < 2) return send(ws, { type: 'error', msg: 'Mindestens 2 Spieler nötig.' });
        startGame(room);
        break;
      }
      case 'aim': {
        if (!room || room.state !== 'playing') return;
        const g = room.game;
        if (g.currentId !== player.id || g.phase !== 'aim') return;
        const t = g.tanks[g.turnIdx];
        const angle = Number(msg.angle);
        const power = Number(msg.power);
        if (Number.isFinite(angle)) t.angle = Math.max(0, Math.min(180, Math.round(angle)));
        if (Number.isFinite(power)) t.power = Math.max(10, Math.min(100, Math.round(power)));
        if (P.WEAPONS[msg.weapon] && (t.ammo[msg.weapon] !== 0)) t.weapon = msg.weapon;
        broadcast(room, { type: 'aim', id: t.id, angle: t.angle, power: t.power, weapon: t.weapon });
        break;
      }
      case 'fire': {
        if (!room || room.state !== 'playing') return;
        const g = room.game;
        if (g.currentId !== player.id || g.phase !== 'aim') return;
        fire(room, g.tanks[g.turnIdx]);
        break;
      }
      case 'shield': {
        if (!room || room.state !== 'playing') return;
        const g = room.game;
        if (g.currentId !== player.id || g.phase !== 'aim') return;
        raiseShield(room, g.tanks[g.turnIdx]);
        break;
      }
      case 'leave':
        leaveRoom(player);
        send(ws, { type: 'left' });
        break;
    }
  });

  ws.on('close', () => leaveRoom(player));
});

// Drop dead connections (also keeps Render's proxy from idling the socket out)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

server.listen(PORT, () => console.log(`Krater-Kommando läuft auf http://localhost:${PORT}`));
