const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const P = require('./shared/physics');
const { createStore } = require('./server/store');
const Bot = require('./server/bot');
const { computeStats } = require('./server/stats');

const PORT = process.env.PORT || 3000;
// Render requires binding to 0.0.0.0; without a host Node listens on "::" only
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const RECONNECT_GRACE_MS = 60000; // a dropped player keeps their seat this long
const OFFLINE_TURN_MS = 8000; // turn length for someone who is disconnected
const HOST_HANDOVER_MS = 15000; // a disconnected host stays host this long (reloads)
const COUNTDOWN_MS = 5000;
const RESUME_EXTRA_MS = 5000; // added to running timers after a restore so everyone can reconnect
const RESTORE_WAIT_MS = 15000; // how long "resume" waits for the old server's backup
const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;
const SHUTDOWN_SAVE_TIMEOUT_MS = 8000;
const SNAPSHOT_VERSION = 1;

// ---------- storage / statistics ----------
const store = createStore();
let matches = [];
const statsState = { loaded: false, error: null };
store
  .load()
  .then((m) => {
    matches = m;
    statsState.loaded = true;
    console.log(`Statistik: ${m.length} Matches geladen (${store.description})`);
  })
  .catch((err) => {
    statsState.error = err.message;
    console.error('Statistik nicht ladbar:', err.message);
  });

// ---------- static files + API ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url.pathname === '/api/stats') {
    const body = computeStats(matches, { mode: url.searchParams.get('mode') || 'all' });
    body.storage = { persistent: store.persistent, loaded: statsState.loaded, error: statsState.error };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(body));
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

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const p of room.players) if (p.ws && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
}

function freeColor(room) {
  return P.COLORS.find((c) => !room.players.some((p) => p.color === c)) || P.COLORS[0];
}

function cleanName(name) {
  const n = String(name || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return n || 'Panzer';
}

function newPlayer(fields) {
  return {
    id: crypto.randomUUID(), token: crypto.randomBytes(18).toString('base64url'), tokenHash: null,
    ws: null, connected: true, isBot: false, difficulty: null,
    name: 'Panzer', color: null, room: null, graceTimer: null,
    inv: P.newInventory(), money: 0, score: 0, ready: false, vote: false,
    stats: { damage: 0, kills: 0 }, match: newMatchStats(), lastMove: 0,
    ...fields,
  };
}

function newMatchStats() {
  return { damage: 0, kills: 0, roundWins: 0, shots: {}, bestShot: null };
}

const humans = (room) => room.players.filter((p) => !p.isBot);
const onlineHumans = (room) => room.players.filter((p) => !p.isBot && p.connected);

function remaining(deadline) {
  return deadline ? Math.max(0, deadline - Date.now()) : 0;
}

function roomInfo(room) {
  return {
    type: 'room',
    code: room.code,
    hostId: room.hostId,
    state: room.state, // 'lobby' | 'countdown' | 'playing' | 'shop' | 'over'
    rounds: room.rounds,
    round: room.round,
    shopTimeLeft: room.state === 'shop' ? remaining(room.shopDeadline) : 0,
    countdownLeft: room.state === 'countdown' ? remaining(room.countdownDeadline) : 0,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, connected: p.connected, isBot: p.isBot, difficulty: p.difficulty,
      money: p.money, score: p.score, ready: p.ready, vote: p.vote, inv: p.inv,
    })),
  };
}

// roundPts: what the player has earned so far this round (damage + kills; win/base come at the end)
function publicTanks(room) {
  const game = room.game;
  return game.tanks.map((t) => ({
    ...scoreOf(room, t.id),
    id: t.id, name: t.name, color: t.color, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp, alive: t.alive,
    angle: t.angle, power: t.power, maxPower: t.maxPower, weapon: t.weapon, ammo: t.ammo,
    shield: t.shield, shieldMax: t.shieldMax, shieldLeft: t.inv.shields, fuel: t.inv.fuel,
  }));
}

function scoreOf(room, id) {
  const p = playerById(room, id);
  if (!p) return { score: 0, roundPts: 0, money: 0 };
  return { score: p.score, money: p.money, roundPts: p.stats.damage * P.REWARDS.perDamage + p.stats.kills * P.REWARDS.kill };
}

function randomWind() {
  return crypto.randomInt(-P.MAX_WIND, P.MAX_WIND + 1);
}

// The wind is rolled at the start of a round and then drifts a little each turn,
// so players can still read it from one turn to the next.
function driftWind(wind) {
  const next = wind + crypto.randomInt(-P.WIND_DRIFT, P.WIND_DRIFT + 1);
  return Math.max(-P.MAX_WIND, Math.min(P.MAX_WIND, next));
}

function playerById(room, id) {
  return room.players.find((p) => p.id === id);
}

function clearRoomTimers(room) {
  clearTimeout(room.shopTimer);
  clearTimeout(room.countdownTimer);
  clearTimeout(room.hostTimer);
  if (room.game) clearTimeout(room.game.timer);
}

// ---------- match / round flow ----------
function startCountdown(room, ms = COUNTDOWN_MS) {
  clearRoomTimers(room);
  room.state = 'countdown';
  room.countdownDeadline = Date.now() + ms;
  room.countdownTimer = setTimeout(() => startMatch(room), ms);
  for (const p of room.players) p.vote = false;
  broadcast(room, roomInfo(room));
}

function startMatch(room) {
  for (const p of room.players) {
    p.inv = P.newInventory();
    p.money = 0;
    p.score = 0;
    p.match = newMatchStats();
  }
  room.round = 0;
  room.lastRoundOver = null;
  startRound(room);
}

function makeTank(p, x, terrain) {
  const hp = P.maxHp(p.inv);
  return {
    id: p.id, name: p.name, color: p.color, x, y: terrain[x], hp, maxHp: hp, alive: true,
    angle: x < P.W / 2 ? 45 : 135, power: 60, maxPower: P.maxPower(p.inv), weapon: 'shell',
    inv: p.inv, ammo: p.inv.ammo, // shared with the player: what is left carries over to the next round
    shield: 0, shieldMax: P.shieldHp(p.inv), fallFactor: P.fallFactor(p.inv), damageFactor: P.damageFactor(p.inv),
  };
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
    return makeTank(p, xs[i], terrain);
  });
  room.state = 'playing';
  room.game = { terrain, tanks, turnIdx: crypto.randomInt(tanks.length) - 1, wind: randomWind(), turns: 0, phase: 'aim', timer: null };
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

  g.turns = (g.turns || 0) + 1; // missing in rooms backed up before the wind drift existed
  if (g.turns > 1) g.wind = driftWind(g.wind);
  g.phase = 'aim';
  g.currentId = g.tanks[g.turnIdx].id;
  const owner = playerById(room, g.currentId);
  const ms = owner && owner.connected ? P.TURN_SECONDS * 1000 : OFFLINE_TURN_MS;
  setTurnTimer(room, ms);
  broadcast(room, {
    type: 'turn',
    currentId: g.currentId,
    wind: g.wind,
    timeLeft: ms,
    round: room.round,
    rounds: room.rounds,
    terrain: g.terrain,
    tanks: publicTanks(room),
  });
  if (owner && owner.isBot) scheduleBotTurn(room, owner);
}

function setTurnTimer(room, ms) {
  const g = room.game;
  clearTimeout(g.timer);
  g.deadline = Date.now() + ms;
  g.timer = setTimeout(() => nextTurn(room), ms);
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
    if (e.win) p.match.roundWins++;
    earnings[p.id] = e;
  }
  const final = room.round >= room.rounds || room.players.length < 2;
  if (final) {
    room.state = 'over';
    recordMatch(room);
  } else openShop(room);
  room.lastRoundOver = {
    type: 'roundOver',
    round: room.round,
    rounds: room.rounds,
    final,
    winnerId: winner ? winner.id : null,
    winnerName: winner ? winner.name : null,
    earnings,
  };
  broadcast(room, roomInfo(room));
  broadcast(room, room.lastRoundOver);
}

function openShop(room, ms = P.SHOP_SECONDS * 1000) {
  room.state = 'shop';
  room.shopDeadline = Date.now() + ms;
  for (const p of room.players) p.ready = false;
  for (const b of room.players.filter((p) => p.isBot)) botShop(room, b);
  clearTimeout(room.shopTimer);
  room.shopTimer = setTimeout(() => startRound(room), ms);
}

// Shop ends early once every connected human is ready (bots shop instantly).
function shopDone(room) {
  const online = onlineHumans(room);
  return online.length > 0 && online.every((p) => p.ready);
}

function buy(room, player, msg) {
  if (msg.upgrade) {
    const u = P.UPGRADES[msg.upgrade];
    if (!u) return false;
    const level = player.inv.upgrades[msg.upgrade];
    const price = u.prices[level];
    if (price === undefined || player.money < price) return false;
    player.money -= price;
    player.inv.upgrades[msg.upgrade]++;
  } else {
    const item = P.SHOP_ITEMS[msg.item];
    if (!item || player.money < item.price) return false;
    player.money -= item.price;
    if (msg.item === 'shield') player.inv.shields += item.qty;
    else if (msg.item === 'fuel') player.inv.fuel += item.qty;
    else player.inv.ammo[msg.item] += item.qty;
  }
  return true;
}

function botShop(room, bot) {
  for (const [kind, name] of Bot.shoppingList(bot.difficulty)) {
    buy(room, bot, kind === 'upgrade' ? { upgrade: name } : { item: name });
  }
  bot.ready = true;
}

// Rematch: everyone may vote; once all connected humans agree the next match starts.
function maybeRematch(room) {
  if (room.state !== 'over' || room.players.length < 2) return;
  const online = onlineHumans(room);
  if (online.length > 0 && online.every((p) => p.vote)) startCountdown(room);
}

// ---------- statistics ----------
function recordMatch(room) {
  if (!humans(room).length) return;
  const ranking = [...room.players].sort((a, b) => b.score - a.score);
  const match = {
    room: room.code,
    endedAt: new Date().toISOString(),
    rounds: room.round,
    players: ranking.map((p) => ({
      name: p.name,
      isBot: p.isBot,
      difficulty: p.difficulty,
      place: 1 + ranking.findIndex((q) => q.score === p.score),
      score: p.score,
      damage: p.match.damage,
      kills: p.match.kills,
      roundWins: p.match.roundWins,
      shots: p.match.shots,
      bestShot: p.match.bestShot,
    })),
  };
  matches.push(match);
  store.append(match).catch((err) => console.error('Statistik nicht gespeichert:', err.message));
}

// ---------- shooting ----------
// Explosion damage hits the shield first (it is the outer bubble); armor only reduces what
// gets through to the tank. Returns what was actually taken off (no overkill), so points
// are only paid for real damage.
function damage(tank, dmg) {
  const absorbed = Math.min(tank.shield, dmg);
  const taken = Math.min(tank.hp, Math.round((dmg - absorbed) * (tank.damageFactor ?? 1)));
  tank.shield -= absorbed;
  tank.hp -= taken;
  return { dmg: taken, absorbed };
}

function fire(room, tank) {
  const g = room.game;
  if (tank.ammo[tank.weapon] === 0) tank.weapon = 'shell'; // empty weapon selected: fall back instead of a dead click
  const weapon = tank.weapon;
  if (tank.ammo[weapon] > 0) tank.ammo[weapon]--;
  clearTimeout(g.timer);
  g.phase = 'anim';

  const shooter = playerById(room, tank.id);
  let shotDamage = 0;
  const credit = (victim, amount) => {
    if (!shooter || victim.id === tank.id) return;
    shooter.stats.damage += amount;
    shooter.match.damage += amount;
    shotDamage += amount;
  };
  if (shooter) shooter.match.shots[weapon] = (shooter.match.shots[weapon] || 0) + 1;
  const aliveBefore = new Set(g.tanks.filter((t) => t.alive).map((t) => t.id));

  const shells = P.fireShells(g.terrain.slice(), g.tanks, tank, weapon, g.wind);
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
      if (shooter && aliveBefore.has(t.id) && t.id !== tank.id) {
        shooter.stats.kills++;
        shooter.match.kills++;
      }
    }
  }
  if (shooter && shotDamage > 0 && (!shooter.match.bestShot || shotDamage > shooter.match.bestShot.damage)) {
    shooter.match.bestShot = { damage: shotDamage, weapon };
  }

  const end = Math.max(...shells.map((s) => s.startTick + s.path.length));
  const nuked = shells.some((s) => s.w === 'nuke' && s.explosion);
  const animMs = (end / P.ANIM_SPEED) * (1000 / 60) + 1600 + (nuked ? 2200 : 0); // let the mushroom cloud play out
  if (tank.ammo[weapon] === 0) tank.weapon = 'shell';
  broadcast(room, {
    type: 'shot',
    shooterId: tank.id,
    weapon,
    angle: tank.angle,
    power: tank.power,
    shells,
    hits,
    terrain: g.terrain,
    tanks: publicTanks(room),
  });
  setTurnTimer(room, animMs);
}

// Raising the shield uses up the turn.
function raiseShield(room, tank) {
  const g = room.game;
  if (tank.inv.shields <= 0) return;
  tank.inv.shields--;
  tank.shield = tank.shieldMax;
  g.phase = 'anim';
  broadcast(room, { type: 'shield', id: tank.id, tanks: publicTanks(room) });
  setTurnTimer(room, 1500);
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

function setAim(room, tank, { angle, power, weapon }) {
  angle = Number(angle);
  power = Number(power);
  if (Number.isFinite(angle)) tank.angle = Math.max(0, Math.min(180, Math.round(angle)));
  if (Number.isFinite(power)) tank.power = Math.max(10, Math.min(tank.maxPower, Math.round(power)));
  if (P.WEAPON_ORDER.includes(weapon) && tank.ammo[weapon] !== 0) tank.weapon = weapon;
  broadcast(room, { type: 'aim', id: tank.id, angle: tank.angle, power: tank.power, weapon: tank.weapon });
}

// ---------- computer opponents ----------
function addBot(room, difficulty) {
  if (room.players.length >= P.MAX_PLAYERS) return;
  const level = Bot.DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const used = new Set(room.players.map((p) => p.name));
  const name = Bot.BOT_NAMES.find((n) => !used.has(n)) || `Bot ${room.players.length + 1}`;
  const bot = newPlayer({ isBot: true, difficulty: level, name, color: freeColor(room), room, token: null, vote: true });
  room.players.push(bot);
}

// The bot "thinks" for a moment, turns the barrel, then fires.
function scheduleBotTurn(room, bot) {
  const g = room.game;
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (room.state !== 'playing' || g.currentId !== bot.id || g.phase !== 'aim') return;
    const tank = g.tanks[g.turnIdx];
    const plan = Bot.decide(g, tank, bot.difficulty);
    if (plan.shield) return raiseShield(room, tank);
    setAim(room, tank, plan);
    g.timer = setTimeout(() => {
      if (room.state === 'playing' && g.currentId === bot.id && g.phase === 'aim') fire(room, tank);
    }, 700);
  }, 900 + Math.random() * 1200);
  g.deadline = Date.now() + P.TURN_SECONDS * 1000;
}

// ---------- host ----------
function nextHost(room) {
  return onlineHumans(room)[0] || humans(room)[0] || null;
}

function handOverHostLater(room) {
  clearTimeout(room.hostTimer);
  room.hostTimer = setTimeout(() => {
    const host = playerById(room, room.hostId);
    if (host && host.connected) return;
    const next = onlineHumans(room)[0];
    if (next) {
      room.hostId = next.id;
      broadcast(room, roomInfo(room));
    }
  }, HOST_HANDOVER_MS);
}

function kick(room, host, targetId) {
  const target = playerById(room, targetId);
  if (!target || target === host) return;
  if (!target.isBot) send(target.ws, { type: 'kicked', message: 'Du wurdest vom Host aus dem Raum entfernt.' });
  leaveRoom(target);
}

// ---------- reconnecting ----------
function disconnect(player) {
  const room = player.room;
  if (!room) return;
  player.connected = false;
  player.ws = null;
  clearTimeout(player.graceTimer);
  player.graceTimer = setTimeout(() => leaveRoom(player), RECONNECT_GRACE_MS);
  if (room.hostId === player.id) handOverHostLater(room);
  if (!onlineHumans(room).length) return; // nobody left to tell; seats wait for the grace period
  broadcast(room, roomInfo(room));
  if (room.state === 'shop' && shopDone(room)) return startRound(room);
  if (room.state === 'over') return maybeRematch(room);
  const g = room.game;
  if (room.state === 'playing' && g.currentId === player.id && g.phase === 'aim') {
    // don't make the others wait the full turn for someone who is gone
    setTurnTimer(room, Math.min(OFFLINE_TURN_MS, remaining(g.deadline)));
    broadcast(room, { type: 'timer', timeLeft: remaining(g.deadline) });
  }
}

// Sends everything a (re)connecting client needs to pick up where the room is.
function sendSync(room, player) {
  const ws = player.ws;
  if (room.state === 'playing') {
    const g = room.game;
    send(ws, {
      type: 'sync',
      currentId: g.currentId,
      wind: g.wind,
      phase: g.phase,
      timeLeft: remaining(g.deadline),
      round: room.round,
      rounds: room.rounds,
      terrain: g.terrain,
      tanks: publicTanks(room),
    });
  } else if ((room.state === 'shop' || room.state === 'over') && room.lastRoundOver) {
    send(ws, room.lastRoundOver);
  }
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  clearTimeout(player.graceTimer);
  player.room = null;
  room.players = room.players.filter((p) => p !== player);
  if (!humans(room).length) {
    clearRoomTimers(room);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) room.hostId = nextHost(room).id;
  if (room.game) {
    const t = room.game.tanks.find((tt) => tt.id === player.id);
    if (t && t.alive) {
      t.alive = false;
      t.hp = 0;
    }
  }
  if ((room.state === 'shop' || room.state === 'countdown') && room.players.length < 2) {
    clearRoomTimers(room);
    room.state = room.state === 'shop' ? 'over' : 'lobby';
    if (room.state === 'over') {
      recordMatch(room);
      room.lastRoundOver = { type: 'roundOver', round: room.round, rounds: room.rounds, final: true, winnerId: null, earnings: {} };
    }
    broadcast(room, roomInfo(room));
    if (room.state === 'over') broadcast(room, room.lastRoundOver);
    return;
  }
  broadcast(room, roomInfo(room));
  if (room.state === 'shop' && shopDone(room)) return startRound(room);
  if (room.state === 'over') return maybeRematch(room);
  if (room.state === 'playing') {
    const g = room.game;
    const alive = g.tanks.filter((t) => t.alive);
    if (alive.length <= 1) {
      if (g.phase === 'aim') endRound(room, alive[0] || null);
      // during a shot animation the scheduled nextTurn ends the round
    } else if (g.currentId === player.id && g.phase === 'aim') nextTurn(room);
    else broadcast(room, { type: 'tanks', tanks: publicTanks(room) });
  }
}

// ---------- surviving restarts ----------
// On SIGTERM (Render deploys/restarts) every room is written to the store; the next
// server restores a room when its players reconnect. Timers are paused meanwhile.
function snapshot(room) {
  const g = room.game;
  return {
    v: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    rounds: room.rounds,
    round: room.round,
    lastRoundOver: room.lastRoundOver || null,
    left: {
      turn: g ? remaining(g.deadline) : 0,
      shop: remaining(room.shopDeadline),
      countdown: remaining(room.countdownDeadline),
    },
    players: room.players.map((p) => ({
      id: p.id, tokenHash: p.token ? hashToken(p.token) : p.tokenHash, isBot: p.isBot, difficulty: p.difficulty,
      name: p.name, color: p.color, inv: p.inv, money: p.money, score: p.score, ready: p.ready, vote: p.vote,
      stats: p.stats, match: p.match,
    })),
    game: g && {
      terrain: g.terrain,
      tanks: g.tanks.map(({ inv, ammo, ...t }) => t), // inventory is linked back from the players
      turnIdx: g.turnIdx,
      wind: g.wind,
      currentId: g.currentId,
      phase: g.phase,
    },
  };
}

function restore(snap) {
  if (snap.v !== SNAPSHOT_VERSION || rooms.has(snap.code)) return rooms.get(snap.code) || null;
  const room = { code: snap.code, hostId: snap.hostId, state: snap.state, rounds: snap.rounds, round: snap.round, players: [], game: null, lastRoundOver: snap.lastRoundOver };
  for (const s of snap.players) {
    const p = newPlayer({ ...s, token: null, room, connected: s.isBot, ws: null });
    if (!p.isBot) p.graceTimer = setTimeout(() => leaveRoom(p), RECONNECT_GRACE_MS + RESUME_EXTRA_MS);
    room.players.push(p);
  }
  if (snap.game) {
    const g = { ...snap.game, timer: null };
    g.tanks = g.tanks.map((t) => {
      const owner = room.players.find((p) => p.id === t.id);
      const inv = owner ? owner.inv : P.newInventory();
      return { ...t, inv, ammo: inv.ammo };
    });
    room.game = g;
  }
  rooms.set(room.code, room);

  const extra = RESUME_EXTRA_MS;
  if (room.state === 'countdown') startCountdown(room, snap.left.countdown + extra);
  else if (room.state === 'shop') openShopRestored(room, snap.left.shop + extra);
  else if (room.state === 'playing') {
    const g = room.game;
    if (g.phase === 'aim') {
      const owner = playerById(room, g.currentId);
      if (owner && owner.isBot) setTimeout(() => scheduleBotTurn(room, owner), extra);
      else setTurnTimer(room, snap.left.turn + extra);
    } else setTurnTimer(room, extra); // a shot was playing out: continue with the next turn
  }
  handOverHostLater(room);
  return room;
}

function openShopRestored(room, ms) {
  room.shopDeadline = Date.now() + ms;
  clearTimeout(room.shopTimer);
  room.shopTimer = setTimeout(() => startRound(room), ms);
}

const restoring = new Map();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// On a deploy the new server may be up before the old one has written its backup,
// so "resume" keeps looking for up to waitMs.
function restoreRoom(code, waitMs) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return Promise.resolve(null);
  if (rooms.has(code)) return Promise.resolve(rooms.get(code));
  if (restoring.has(code)) return restoring.get(code);
  const attempt = (async () => {
    const until = Date.now() + waitMs;
    for (;;) {
      let snap = null;
      try {
        snap = await store.loadRoom(code);
      } catch (err) {
        console.error('Raumsicherung nicht lesbar:', err.message);
      }
      if (snap && Date.now() - Date.parse(snap.savedAt) <= SNAPSHOT_MAX_AGE_MS) {
        const room = restore(snap);
        if (room) {
          console.log(`Raum ${code} nach Neustart wiederhergestellt (${room.state})`);
          store.deleteRoom(code).catch((err) => console.error('Raumsicherung nicht gelöscht:', err.message));
        }
        return room;
      }
      if (Date.now() + 1000 > until) return null;
      await delay(1000);
    }
  })().finally(() => restoring.delete(code));
  restoring.set(code, attempt);
  return attempt;
}

// remove backups nobody picked up
(async () => {
  if (!store.persistent) return;
  try {
    for (const code of await store.listRooms()) {
      const snap = await store.loadRoom(code);
      if (snap && Date.now() - Date.parse(snap.savedAt) > SNAPSHOT_MAX_AGE_MS) await store.deleteRoom(code);
    }
  } catch (err) {
    console.error('Aufräumen der Raumsicherungen fehlgeschlagen:', err.message);
  }
})();

async function shutdown() {
  const active = [...rooms.values()].filter((r) => humans(r).length);
  let saved = 0;
  if (store.persistent && active.length) {
    const saves = active.map((r) =>
      store
        .saveRoom(r.code, snapshot(r))
        .then(() => saved++)
        .catch((err) => console.error(`Raum ${r.code} nicht gesichert:`, err.message))
    );
    await Promise.race([Promise.all(saves), delay(SHUTDOWN_SAVE_TIMEOUT_MS)]);
    console.log(`${saved} von ${active.length} Räumen vor dem Neustart gesichert`);
  }
  for (const ws of wss.clients) {
    send(
      ws,
      saved > 0
        ? { type: 'info', message: 'Der Server wird aktualisiert – ihr werdet gleich automatisch wieder verbunden.' }
        : { type: 'info', message: 'Der Server wird neu gestartet – laufende Spiele gehen verloren.' }
    );
    ws.close(1012, 'restart');
  }
}

// ---------- websocket ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  // `player` is swapped for the stored one when this connection resumes a seat
  let player = newPlayer({ ws });
  ws.isAlive = true;
  ws.budget = { count: 0, since: Date.now() };
  ws.on('pong', () => (ws.isAlive = true));

  const myTurn = (room) =>
    room && room.state === 'playing' && room.game.currentId === player.id && room.game.phase === 'aim';
  const isHost = (room) => room && room.hostId === player.id;

  function joinRoom(r, name) {
    player.name = cleanName(name);
    player.color = freeColor(r);
    player.room = r;
    player.money = 0;
    player.score = 0;
    r.players.push(player);
    send(ws, { type: 'joined', you: player.id, code: r.code, token: player.token });
    broadcast(r, roomInfo(r));
  }

  async function handle(msg) {
    const room = player.room;
    switch (msg.type) {
      case 'create': {
        if (room) leaveRoom(player);
        player = newPlayer({ ws });
        const r = { code: newCode(), players: [], hostId: player.id, state: 'lobby', rounds: 5, round: 0, game: null };
        rooms.set(r.code, r);
        joinRoom(r, msg.name);
        if (msg.solo) {
          addBot(r, 'medium');
          broadcast(r, roomInfo(r));
        }
        break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim()) || (await restoreRoom(msg.code, 0));
        if (!r) return send(ws, { type: 'error', msg: 'Raum nicht gefunden.' });
        if (r.state !== 'lobby' && r.state !== 'over')
          return send(ws, { type: 'error', msg: 'In diesem Raum läuft gerade ein Match.' });
        if (r.players.length >= P.MAX_PLAYERS) return send(ws, { type: 'error', msg: 'Der Raum ist voll.' });
        if (room) leaveRoom(player);
        player = newPlayer({ ws });
        joinRoom(r, msg.name);
        break;
      }
      case 'resume': {
        const r = await restoreRoom(msg.code, store.persistent ? RESTORE_WAIT_MS : 0);
        const hash = hashToken(msg.token);
        const p = r && r.players.find((pp) => !pp.isBot && (pp.token ? pp.token === msg.token : pp.tokenHash === hash));
        if (!p) return send(ws, { type: 'resumeFailed' });
        if (p === player) return sendSync(r, p);
        if (player.room) leaveRoom(player);
        clearTimeout(p.graceTimer);
        const old = p.ws;
        p.ws = ws;
        p.token = msg.token;
        p.connected = true;
        player = p;
        // the same seat open in another tab: that tab gets closed
        if (old && old !== ws && old.readyState === old.OPEN) old.close(4000, 'resumed elsewhere');
        send(ws, { type: 'joined', you: p.id, code: r.code, token: p.token, resumed: true });
        broadcast(r, roomInfo(r));
        sendSync(r, p);
        if (r.state === 'over') maybeRematch(r);
        break;
      }
      case 'settings': {
        if (!isHost(room) || (room.state !== 'lobby' && room.state !== 'over')) return;
        if (P.ROUND_OPTIONS.includes(Number(msg.rounds))) room.rounds = Number(msg.rounds);
        broadcast(room, roomInfo(room));
        break;
      }
      case 'addBot': {
        if (!isHost(room) || (room.state !== 'lobby' && room.state !== 'over')) return;
        addBot(room, msg.difficulty);
        broadcast(room, roomInfo(room));
        break;
      }
      case 'kick':
        if (isHost(room)) kick(room, player, msg.playerId);
        break;
      case 'start': {
        if (!isHost(room) || (room.state !== 'lobby' && room.state !== 'over')) return;
        if (room.players.length < 2) return send(ws, { type: 'error', msg: 'Mindestens 2 Spieler nötig.' });
        startCountdown(room);
        break;
      }
      case 'vote': {
        if (!room || room.state !== 'over') return;
        player.vote = !!msg.vote;
        broadcast(room, roomInfo(room));
        maybeRematch(room);
        break;
      }
      case 'lobby': {
        if (!isHost(room) || room.state !== 'over') return;
        room.state = 'lobby';
        for (const p of room.players) p.vote = p.isBot;
        broadcast(room, roomInfo(room));
        break;
      }
      case 'aim':
        if (myTurn(room)) setAim(room, room.game.tanks[room.game.turnIdx], msg);
        break;
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
        if (room && room.state === 'shop' && !player.ready && buy(room, player, msg)) broadcast(room, roomInfo(room));
        break;
      case 'ready':
        if (!room || room.state !== 'shop') return;
        player.ready = !!msg.ready;
        if (shopDone(room)) startRound(room);
        else broadcast(room, roomInfo(room));
        break;
      case 'ping':
        send(ws, { type: 'pong' });
        break;
      case 'leave':
        leaveRoom(player);
        player = newPlayer({ ws });
        send(ws, { type: 'left' });
        break;
    }
  }

  ws.on('message', (raw) => {
    // simple flood guard: at most 40 messages per second
    const now = Date.now();
    if (now - ws.budget.since > 1000) ws.budget = { count: 0, since: now };
    if (++ws.budget.count > 40) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // one message after another per connection ("resume" may wait for a backup)
    ws.queue = (ws.queue || Promise.resolve()).then(() => handle(msg || {})).catch((err) => console.error(err));
  });

  ws.on('close', () => {
    if (player.ws === ws) disconnect(player);
  });
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

server.listen(PORT, HOST, () => console.log(`Krater-Kommando läuft auf http://${HOST}:${PORT}`));

// Render sends SIGTERM on deploys/restarts: back up rooms, tell the players, exit.
let stopping = false;
process.on('SIGTERM', async () => {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(0), SHUTDOWN_SAVE_TIMEOUT_MS + 3000).unref();
  await shutdown();
  server.close(() => process.exit(0));
});
