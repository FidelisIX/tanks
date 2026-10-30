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

function freeColor(room) {
  return P.COLORS.find((c) => !room.players.some((p) => p.color === c)) || P.COLORS[0];
}

function cleanName(name) {
  const n = String(name || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return n || 'Panzer';
}

function roomInfo(room) {
  return {
    type: 'room',
    code: room.code,
    hostId: room.hostId,
    state: room.state, // 'lobby' | 'playing' | 'shop' | 'over'
    rounds: room.rounds,
    round: room.round,
    shopTimeLeft: room.state === 'shop' ? Math.max(0, room.shopDeadline - Date.now()) : 0,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, money: p.money, score: p.score, ready: p.ready, inv: p.inv,
    })),
  };
}

function publicTanks(game) {
  return game.tanks.map((t) => ({
    id: t.id, name: t.name, color: t.color, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp, alive: t.alive,
    angle: t.angle, power: t.power, maxPower: t.maxPower, weapon: t.weapon, ammo: t.ammo,
    shield: t.shield, shieldMax: t.shieldMax, shieldLeft: t.inv.shields, fuel: t.inv.fuel,
  }));
}

function randomWind() {
  return crypto.randomInt(-P.MAX_WIND, P.MAX_WIND + 1);
}

function playerById(room, id) {
  return room.players.find((p) => p.id === id);
}

// ---------- match / round flow ----------
function startMatch(room) {
  for (const p of room.players) {
    p.inv = P.newInventory();
    p.money = 0;
    p.score = 0;
  }
  room.round = 0;
  startRound(room);
}

function startRound(room) {
  clearTimeout(room.shopTimer);
  room.round++;
  const seed = crypto.randomInt(1, 2 ** 31);
  const terrain = P.generateTerrain(seed);
  const xs = P.placeTanks(terrain, room.players.length, seed);
  const tanks = room.players.map((p, i) => {
    p.ready = false;
    p.stats = { damage: 0, kills: 0 };
    const x = xs[i];
    const hp = P.maxHp(p.inv);
    return {
      id: p.id, name: p.name, color: p.color, x, y: terrain[x], hp, maxHp: hp, alive: true,
      angle: x < P.W / 2 ? 45 : 135, power: 60, maxPower: P.maxPower(p.inv), weapon: 'shell',
      inv: p.inv, ammo: p.inv.ammo, // shared with the player: what is left carries over to the next round
      shield: 0, shieldMax: P.shieldHp(p.inv), fallFactor: P.fallFactor(p.inv),
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
  if (alive.length <= 1) return endRound(room, alive[0] || null);

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
    round: room.round,
    rounds: room.rounds,
    terrain: g.terrain,
    tanks: publicTanks(g),
  });
}

function endRound(room, winner) {
  const g = room.game;
  clearTimeout(g.timer);
  const R = P.REWARDS;
  const earnings = {};
  for (const p of room.players) {
    const e = {
      damage: p.stats.damage * R.perDamage,
      kills: p.stats.kills * R.kill,
      win: winner && winner.id === p.id ? R.win : 0,
      base: R.base,
    };
    e.total = e.damage + e.kills + e.win + e.base;
    p.money += e.total;
    p.score += e.total;
    earnings[p.id] = e;
  }
  const final = room.round >= room.rounds || room.players.length < 2;
  if (final) room.state = 'over';
  else openShop(room);
  broadcast(room, roomInfo(room));
  broadcast(room, {
    type: 'roundOver',
    round: room.round,
    rounds: room.rounds,
    final,
    winnerId: winner ? winner.id : null,
    winnerName: winner ? winner.name : null,
    earnings,
  });
}

function openShop(room) {
  room.state = 'shop';
  room.shopDeadline = Date.now() + P.SHOP_SECONDS * 1000;
  for (const p of room.players) p.ready = false;
  clearTimeout(room.shopTimer);
  room.shopTimer = setTimeout(() => startRound(room), P.SHOP_SECONDS * 1000);
}

function buy(room, player, msg) {
  if (msg.upgrade) {
    const u = P.UPGRADES[msg.upgrade];
    if (!u) return;
    const level = player.inv.upgrades[msg.upgrade];
    const price = u.prices[level];
    if (price === undefined || player.money < price) return;
    player.money -= price;
    player.inv.upgrades[msg.upgrade]++;
  } else {
    const item = P.SHOP_ITEMS[msg.item];
    if (!item || player.money < item.price) return;
    player.money -= item.price;
    if (msg.item === 'shield') player.inv.shields += item.qty;
    else if (msg.item === 'fuel') player.inv.fuel += item.qty;
    else player.inv.ammo[msg.item] += item.qty;
  }
  broadcast(room, roomInfo(room));
}

// Explosion damage hits the shield first. Returns what was actually taken off
// (no overkill), so points are only paid for real damage.
function damage(tank, dmg) {
  const absorbed = Math.min(tank.shield, dmg);
  const taken = Math.min(tank.hp, dmg - absorbed);
  tank.shield -= absorbed;
  tank.hp -= taken;
  return { dmg: taken, absorbed };
}

function fire(room, tank) {
  const g = room.game;
  if (tank.ammo[tank.weapon] === 0) return;
  if (tank.ammo[tank.weapon] > 0) tank.ammo[tank.weapon]--;
  clearTimeout(g.timer);
  g.phase = 'anim';

  const shooter = playerById(room, tank.id);
  const credit = (victim, amount) => {
    if (shooter && victim.id !== tank.id) shooter.stats.damage += amount;
  };
  const aliveBefore = new Set(g.tanks.filter((t) => t.alive).map((t) => t.id));

  const shells = P.fireShells(g.terrain.slice(), g.tanks, tank, tank.weapon, g.wind);
  const hits = [];
  for (const s of shells.filter((s) => s.explosion).sort((a, b) => a.explosion.tick - b.explosion.tick)) {
    for (const t of g.tanks) {
      if (!t.alive) continue;
      const dmg = P.explosionDamage(t, s.explosion, P.WEAPONS[s.w]);
      if (dmg <= 0) continue;
      const res = damage(t, dmg);
      credit(t, res.dmg + res.absorbed);
      hits.push({ id: t.id, ...res });
    }
    P.applyCrater(g.terrain, s.explosion);
  }
  const fall = P.settleTanks(g.terrain, g.tanks);
  for (const [id, raw] of Object.entries(fall)) {
    const t = g.tanks.find((tt) => tt.id === id);
    // the shield does not soften a fall, shock absorbers do
    const dmg = Math.min(t.hp, Math.round(raw * t.fallFactor));
    if (dmg <= 0) continue;
    t.hp -= dmg;
    credit(t, dmg);
    hits.push({ id, dmg, absorbed: 0, fall: true });
  }
  for (const t of g.tanks) {
    if (t.alive && t.hp <= 0) {
      t.alive = false;
      if (shooter && aliveBefore.has(t.id) && t.id !== tank.id) shooter.stats.kills++;
    }
  }

  const end = Math.max(...shells.map((s) => s.startTick + s.path.length));
  const animMs = (end / P.ANIM_SPEED) * (1000 / 60) + 1600;
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

// Raising the shield uses up the turn.
function raiseShield(room, tank) {
  const g = room.game;
  if (tank.inv.shields <= 0) return;
  tank.inv.shields--;
  tank.shield = tank.shieldMax;
  clearTimeout(g.timer);
  g.phase = 'anim';
  broadcast(room, { type: 'shield', id: tank.id, tanks: publicTanks(g) });
  g.timer = setTimeout(() => nextTurn(room), 1500);
}

// Driving costs 1 fuel per pixel; tanks cannot climb walls or drive off cliffs.
const MOVE_STEP = 2;
function move(room, tank, dir) {
  const g = room.game;
  if (tank.inv.fuel < MOVE_STEP) return;
  const nx = Math.max(15, Math.min(P.W - 15, tank.x + Math.sign(dir) * MOVE_STEP));
  if (nx === tank.x) return;
  const ny = g.terrain[nx];
  if (tank.y - ny > 2.5 * MOVE_STEP || ny - tank.y > 4 * MOVE_STEP) return;
  tank.x = nx;
  tank.y = ny;
  tank.inv.fuel -= MOVE_STEP;
  broadcast(room, { type: 'move', id: tank.id, x: tank.x, y: tank.y, fuel: tank.inv.fuel });
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  player.room = null;
  room.players = room.players.filter((p) => p !== player);
  if (room.players.length === 0) {
    if (room.game) clearTimeout(room.game.timer);
    clearTimeout(room.shopTimer);
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
  if (room.state === 'shop' && room.players.length < 2) {
    clearTimeout(room.shopTimer);
    room.state = 'over';
    broadcast(room, roomInfo(room));
    broadcast(room, { type: 'roundOver', round: room.round, rounds: room.rounds, final: true, winnerId: null, earnings: {} });
    return;
  }
  broadcast(room, roomInfo(room));
  if (room.state === 'shop' && room.players.every((p) => p.ready)) return startRound(room);
  if (room.state === 'playing') {
    const g = room.game;
    const alive = g.tanks.filter((t) => t.alive);
    if (alive.length <= 1) {
      if (g.phase === 'aim') endRound(room, alive[0] || null);
      // during a shot animation the scheduled nextTurn ends the round
    } else if (g.currentId === player.id && g.phase === 'aim') nextTurn(room);
    else broadcast(room, { type: 'tanks', tanks: publicTanks(g) });
  }
}

// ---------- websocket ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  const player = {
    id: crypto.randomUUID(), ws, name: 'Panzer', color: null, room: null,
    inv: P.newInventory(), money: 0, score: 0, ready: false, stats: { damage: 0, kills: 0 }, lastMove: 0,
  };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const myTurn = (room) =>
    room && room.state === 'playing' && room.game.currentId === player.id && room.game.phase === 'aim';

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
        const r = { code: newCode(), players: [], hostId: player.id, state: 'lobby', rounds: 5, round: 0, game: null };
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
        if (r.state === 'playing' || r.state === 'shop')
          return send(ws, { type: 'error', msg: 'In diesem Raum läuft gerade ein Match.' });
        if (r.players.length >= P.MAX_PLAYERS) return send(ws, { type: 'error', msg: 'Der Raum ist voll.' });
        if (room) leaveRoom(player);
        player.name = cleanName(msg.name);
        player.color = freeColor(r);
        player.room = r;
        player.money = 0;
        player.score = 0;
        r.players.push(player);
        send(ws, { type: 'joined', you: player.id, code: r.code });
        broadcast(r, roomInfo(r));
        break;
      }
      case 'settings': {
        if (!room || room.hostId !== player.id || (room.state !== 'lobby' && room.state !== 'over')) return;
        if (P.ROUND_OPTIONS.includes(Number(msg.rounds))) room.rounds = Number(msg.rounds);
        broadcast(room, roomInfo(room));
        break;
      }
      case 'start': {
        if (!room || room.hostId !== player.id || (room.state !== 'lobby' && room.state !== 'over')) return;
        if (room.players.length < 2) return send(ws, { type: 'error', msg: 'Mindestens 2 Spieler nötig.' });
        startMatch(room);
        break;
      }
      case 'lobby': {
        if (!room || room.hostId !== player.id || room.state !== 'over') return;
        room.state = 'lobby';
        broadcast(room, roomInfo(room));
        break;
      }
      case 'aim': {
        if (!myTurn(room)) return;
        const t = room.game.tanks[room.game.turnIdx];
        const angle = Number(msg.angle);
        const power = Number(msg.power);
        if (Number.isFinite(angle)) t.angle = Math.max(0, Math.min(180, Math.round(angle)));
        if (Number.isFinite(power)) t.power = Math.max(10, Math.min(t.maxPower, Math.round(power)));
        if (P.WEAPON_ORDER.includes(msg.weapon) && t.ammo[msg.weapon] !== 0) t.weapon = msg.weapon;
        broadcast(room, { type: 'aim', id: t.id, angle: t.angle, power: t.power, weapon: t.weapon });
        break;
      }
      case 'fire':
        if (myTurn(room)) fire(room, room.game.tanks[room.game.turnIdx]);
        break;
      case 'shield':
        if (myTurn(room)) raiseShield(room, room.game.tanks[room.game.turnIdx]);
        break;
      case 'move': {
        if (!myTurn(room)) return;
        const now = Date.now();
        if (now - player.lastMove < 25) return;
        player.lastMove = now;
        move(room, room.game.tanks[room.game.turnIdx], Number(msg.dir) || 0);
        break;
      }
      case 'buy':
        if (room && room.state === 'shop') buy(room, player, msg);
        break;
      case 'ready':
        if (!room || room.state !== 'shop') return;
        player.ready = !!msg.ready;
        if (room.players.every((p) => p.ready)) startRound(room);
        else broadcast(room, roomInfo(room));
        break;
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
