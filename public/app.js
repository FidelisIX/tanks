/* global Physics */
(() => {
  const P = Physics;
  const $ = (id) => document.getElementById(id);

  // ---------- state ----------
  let ws = null;
  let myId = null;
  let room = null;
  let terrain = null;
  let tanks = [];
  let currentId = null;
  let wind = 0;
  let deadline = 0;
  let phase = 'idle'; // 'aim' | 'wait' | 'anim' | 'idle'
  let anim = null;
  let effects = [];
  let floaters = [];
  let lastAimSent = 0;
  let aimTimer = null;
  let lastRound = null; // last roundOver message
  let overlayVisible = false;
  let shopDeadline = 0;
  let driveTimer = null;
  let shakeUntil = 0;

  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = P.W;
  canvas.height = P.H;

  // ---------- connection ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onmessage = (e) => handle(JSON.parse(e.data));
    ws.onclose = () => {
      showError('Verbindung zum Server verloren. Seite neu laden.');
      show('menu');
    };
    return new Promise((resolve) => (ws.onopen = resolve));
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function handle(msg) {
    switch (msg.type) {
      case 'error':
        showError(msg.msg);
        break;
      case 'joined':
        myId = msg.you;
        history.replaceState(null, '', `?room=${msg.code}`);
        break;
      case 'room':
        room = msg;
        if (room.state === 'shop') shopDeadline = performance.now() + room.shopTimeLeft;
        renderRoom();
        break;
      case 'left':
        room = null;
        history.replaceState(null, '', location.pathname);
        show('menu');
        break;
      case 'turn':
        if (anim) finishAnim();
        applyTurn(msg);
        break;
      case 'move': {
        const t = tankById(msg.id);
        if (t) Object.assign(t, { x: msg.x, y: msg.y, fuel: msg.fuel });
        if (msg.id === myId) $('fuel').textContent = `⛽ ${msg.fuel}`;
        break;
      }
      case 'aim': {
        const t = tankById(msg.id);
        if (t && msg.id !== myId) Object.assign(t, { angle: msg.angle, power: msg.power, weapon: msg.weapon });
        break;
      }
      case 'shot':
        startAnim(msg);
        break;
      case 'tanks':
        tanks = msg.tanks;
        break;
      case 'shield': {
        tanks = msg.tanks;
        phase = 'anim';
        const t = tankById(msg.id);
        if (t) {
          effects.push({ shieldPulse: true, x: t.x, y: t.y - 6, age: 0 });
          floaters.push({ x: t.x, y: t.y - 50, text: 'Schild!', age: 0, color: '#7fd8ff' });
        }
        sound('shield');
        updateControls();
        break;
      }
      case 'roundOver':
        lastRound = msg;
        phase = 'idle';
        updateControls();
        setTimeout(() => {
          overlayVisible = true;
          renderOverlay();
        }, anim ? 1800 : 600);
        break;
    }
  }

  // ---------- screens ----------
  function show(name) {
    for (const s of ['menu', 'room', 'game']) $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }

  function showError(text) {
    $('menu-error').textContent = text;
    $('room-hint').textContent = text;
  }

  function renderRoom() {
    if (!room) return;
    const isHost = room.hostId === myId;
    if (room.state === 'lobby') {
      overlayVisible = false;
      show('room');
    }
    if (room.state === 'playing') {
      overlayVisible = false;
      show('game');
    }
    $('room-code').textContent = room.code;
    $('player-list').innerHTML = room.players
      .map(
        (p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${
          p.id === myId ? ' (du)' : ''
        }<span class="badge">${p.id === room.hostId ? 'Gastgeber' : ''}</span></li>`
      )
      .join('');
    $('rounds').value = String(room.rounds);
    $('rounds').disabled = !isHost;
    $('btn-start').classList.toggle('hidden', !isHost);
    $('btn-start').disabled = room.players.length < 2;
    $('room-hint').textContent = isHost
      ? room.players.length < 2
        ? 'Teile den Code oder Link mit deinen Freunden (2–4 Spieler).'
        : ''
      : 'Warte, bis der Gastgeber das Match startet …';
    renderOverlay();
  }

  function me() {
    return room && room.players.find((p) => p.id === myId);
  }

  // Round summary + shop (between rounds) or final standings (after the last round).
  function renderOverlay() {
    const show = overlayVisible && room && (room.state === 'shop' || room.state === 'over') && lastRound;
    $('overlay').classList.toggle('hidden', !show);
    if (!show) return;
    const isHost = room.hostId === myId;
    const players = room.players;
    const name = (id) => {
      const p = players.find((pp) => pp.id === id);
      return p ? `<span style="color:${p.color}">${esc(p.name)}</span>` : '';
    };
    let html = '';

    if (room.state === 'over') {
      const ranking = [...players].sort((a, b) => b.score - a.score);
      const top = ranking[0];
      const tie = ranking.length > 1 && ranking[1].score === top.score;
      html += `<h2>${tie ? 'Unentschieden!' : top && top.id === myId ? 'Du gewinnst das Match! 🏆' : top ? `${name(top.id)} gewinnt das Match!` : 'Match vorbei'}</h2>`;
    } else {
      html += `<p class="hint">Runde ${lastRound.round} von ${lastRound.rounds}</p>`;
      html += `<h2>${lastRound.winnerId === myId ? 'Du hast die Runde gewonnen!' : lastRound.winnerId ? `${name(lastRound.winnerId)} gewinnt die Runde` : 'Niemand hat überlebt'}</h2>`;
    }

    // earnings of the round that just ended
    const rows = players
      .filter((p) => lastRound.earnings[p.id])
      .map((p) => {
        const e = lastRound.earnings[p.id];
        return `<tr><td>${name(p.id)}</td><td>${e.damage}</td><td>${e.kills}</td><td>${e.win}</td><td>${e.base}</td><td><b>+${e.total}</b></td><td>${p.score}</td></tr>`;
      })
      .join('');
    if (rows) {
      html += `<table class="earn"><tr><th></th><th>Schaden</th><th>Abschüsse</th><th>Sieg</th><th>Basis</th><th>Runde</th><th>Gesamt</th></tr>${rows}</table>`;
    }

    if (room.state === 'shop') {
      const m = me();
      const inv = m.inv;
      const owned = (k) => (k === 'shield' ? inv.shields : k === 'fuel' ? inv.fuel : inv.ammo[k]);
      html += `<div class="shop-head"><b>Shop</b><span>💰 ${m.money}</span><span id="shop-timer"></span></div><div class="shop">`;
      for (const [k, it] of Object.entries(P.SHOP_ITEMS)) {
        html += `<button data-buy="${k}" ${m.money < it.price || m.ready ? 'disabled' : ''} title="${esc(it.desc || '')}">
          <span>${it.name}${it.qty > 1 ? ` +${it.qty}` : ''}</span><small>hast ${owned(k)}</small><b>${it.price} 💰</b></button>`;
      }
      for (const [k, u] of Object.entries(P.UPGRADES)) {
        const lvl = inv.upgrades[k];
        const price = u.prices[lvl];
        html += `<button data-upgrade="${k}" class="upg" ${price === undefined || m.money < price || m.ready ? 'disabled' : ''}>
          <span>${u.name} ${'★'.repeat(lvl)}${'☆'.repeat(u.prices.length - lvl)}</span><small>${u.desc}</small><b>${price === undefined ? 'max.' : `${price} 💰`}</b></button>`;
      }
      html += `</div><div class="ready-list">${players
        .map((p) => `<span class="${p.ready ? 'ok' : ''}">${p.ready ? '✓' : '…'} ${esc(p.name)}</span>`)
        .join('')}</div>`;
      html += `<button data-action="ready" class="primary">${m.ready ? 'Doch noch einkaufen' : 'Fertig – nächste Runde'}</button>`;
    } else {
      html += `<ul class="ranking">${[...players]
        .sort((a, b) => b.score - a.score)
        .map((p, i) => `<li><b>${i + 1}.</b><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<span class="badge">${p.score} Punkte</span></li>`)
        .join('')}</ul>`;
      if (isHost) {
        html += `<button data-action="again" class="primary" ${players.length < 2 ? 'disabled' : ''}>Neues Match (${room.rounds} Runden)</button>`;
        html += `<button data-action="lobby">Rundenzahl ändern</button>`;
      } else html += `<p class="hint">Der Gastgeber kann ein neues Match starten.</p>`;
    }
    html += `<button data-action="menu" class="link">Zum Hauptmenü</button>`;
    $('overlay-card').innerHTML = html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- turns ----------
  function tankById(id) {
    return tanks.find((t) => t.id === id);
  }

  function applyTurn(msg) {
    terrain = msg.terrain;
    tanks = msg.tanks;
    currentId = msg.currentId;
    wind = msg.wind;
    deadline = performance.now() + msg.timeLeft;
    phase = 'aim';
    overlayVisible = false;
    $('overlay').classList.add('hidden');
    $('round-label').textContent = `Runde ${msg.round}/${msg.rounds}`;
    show('game');
    updateControls();
  }

  function myTank() {
    return tankById(myId);
  }

  function isMyTurn() {
    return phase === 'aim' && currentId === myId && myTank() && myTank().alive;
  }

  function updateControls() {
    const t = myTank();
    const mine = isMyTurn();
    for (const id of ['angle', 'power', 'btn-fire', 'btn-left', 'btn-right']) $(id).disabled = !mine;
    if (t) {
      $('power').max = t.maxPower;
      $('fuel').textContent = `⛽ ${t.fuel}`;
      $('angle').value = t.angle;
      $('power').value = t.power;
      $('angle-val').textContent = t.angle;
      $('power-val').textContent = t.power;
    }
    $('weapons').innerHTML = P.WEAPON_ORDER.map((k, i) => {
      const w = P.WEAPONS[k];
      const ammo = t ? t.ammo[k] : w.ammo;
      if (ammo === 0 && w.ammo === 0) return ''; // shop-only weapons appear once bought
      const label = ammo === -1 ? '∞' : `×${ammo}`;
      return `<button data-w="${k}" class="${t && t.weapon === k ? 'active' : ''}" ${
        !mine || ammo === 0 ? 'disabled' : ''
      }>${i + 1}. ${w.name}<small>${label}</small></button>`;
    }).join('') +
      `<button id="btn-shield" ${!mine || !t || t.shieldLeft <= 0 ? 'disabled' : ''} title="Kostet den Zug">S. Schild<small>×${
        t ? t.shieldLeft : 1
      }</small></button>`;
    const cur = tankById(currentId);
    $('turn-label').innerHTML = cur
      ? `<span style="color:${cur.color}">●</span> ${mine ? 'Du bist dran!' : `${esc(cur.name)} ist dran`}`
      : '';
    const arrow = wind === 0 ? '·' : wind > 0 ? '→'.repeat(Math.ceil(Math.abs(wind) / 4)) : '←'.repeat(Math.ceil(Math.abs(wind) / 4));
    $('wind-label').textContent = `Wind ${arrow} ${Math.abs(wind)}`;
    $('wind-label').title = 'In der Höhe weht der Wind stärker als am Boden.';
  }

  function setAim(changes) {
    const t = myTank();
    if (!isMyTurn()) return;
    if (changes.angle !== undefined) t.angle = Math.max(0, Math.min(180, Math.round(changes.angle)));
    if (changes.power !== undefined) t.power = Math.max(10, Math.min(t.maxPower, Math.round(changes.power)));
    if (changes.weapon !== undefined && t.ammo[changes.weapon] !== 0) t.weapon = changes.weapon;
    $('angle').value = t.angle;
    $('power').value = t.power;
    $('angle-val').textContent = t.angle;
    $('power-val').textContent = t.power;
    if (changes.weapon !== undefined) updateControls();
    // throttle network updates
    clearTimeout(aimTimer);
    const now = performance.now();
    const doSend = () => {
      lastAimSent = performance.now();
      send({ type: 'aim', angle: t.angle, power: t.power, weapon: t.weapon });
    };
    if (now - lastAimSent > 60) doSend();
    else aimTimer = setTimeout(doSend, 60);
  }

  function fire() {
    if (!isMyTurn()) return;
    const t = myTank();
    clearTimeout(aimTimer);
    send({ type: 'aim', angle: t.angle, power: t.power, weapon: t.weapon });
    send({ type: 'fire' });
    phase = 'wait';
    updateControls();
  }

  function drive(dir) {
    if (isMyTurn()) send({ type: 'move', dir });
  }

  function raiseShield() {
    if (!isMyTurn() || myTank().shieldLeft <= 0) return;
    send({ type: 'shield' });
    phase = 'wait';
    updateControls();
  }

  // ---------- shot animation ----------
  function startAnim(msg) {
    phase = 'anim';
    const shooter = tankById(msg.shooterId);
    if (shooter) Object.assign(shooter, { angle: msg.angle, power: msg.power, weapon: msg.weapon });
    anim = { msg, tick: 0, applied: msg.shells.map(() => false), endTick: Math.max(...msg.shells.map((s) => s.startTick + s.path.length)) + 40 };
    sound('fire');
    updateControls();
  }

  function stepAnim() {
    if (!anim) return;
    anim.tick += P.ANIM_SPEED;
    anim.msg.shells.forEach((s, i) => {
      if (s.explosion && !anim.applied[i] && anim.tick >= s.explosion.tick) {
        anim.applied[i] = true;
        P.applyCrater(terrain, s.explosion);
        const nuke = s.w === 'nuke';
        effects.push({ x: s.explosion.x, y: s.explosion.y, r: s.explosion.r, dirt: s.explosion.dirt, nuke, age: 0 });
        if (nuke) shakeUntil = performance.now() + 900;
        spawnDebris(s.explosion);
        sound(s.explosion.dirt ? 'thud' : 'boom', nuke ? 250 : s.explosion.r);
      }
    });
    if (anim.tick >= anim.endTick) finishAnim();
  }

  function finishAnim() {
    if (!anim) return;
    const { msg } = anim;
    terrain = msg.terrain;
    const before = new Map(tanks.map((t) => [t.id, t]));
    tanks = msg.tanks;
    for (const t of tanks) {
      const old = before.get(t.id) || t;
      const fell = msg.hits.filter((h) => h.id === t.id && h.fall).reduce((a, h) => a + h.dmg, 0);
      const lost = old.hp - t.hp - fell;
      const blocked = (old.shield || 0) - (t.shield || 0);
      if (blocked > 0) floaters.push({ x: t.x + 22, y: t.y - 58, text: `🛡 -${blocked}`, age: 0, color: '#7fd8ff' });
      if (lost > 0) floaters.push({ x: t.x, y: t.y - 40, text: `-${lost}`, age: 0, color: '#ff6b5a' });
      if (fell > 0) floaters.push({ x: t.x - 24, y: t.y - 20, text: `Sturz -${fell}`, age: 0, color: '#ffb347' });
      if (lost > 0 && !t.alive) floaters.push({ x: t.x, y: t.y - 60, text: 'zerstört!', age: 0, color: '#fff' });
    }
    anim = null;
  }

  function spawnDebris(ex) {
    const n = ex.dirt ? 12 : 26;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 4;
      effects.push({
        debris: true, x: ex.x, y: ex.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, age: 0,
        color: ex.dirt ? '#8a6a3c' : Math.random() < 0.5 ? '#ffb347' : '#5b4a33',
      });
    }
  }

  // ---------- sound (synthesized, no assets) ----------
  let actx = null;
  function sound(kind, size = 30) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (kind === 'shield') {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.frequency.setValueAtTime(300, actx.currentTime);
        o.frequency.exponentialRampToValueAtTime(900, actx.currentTime + 0.4);
        g.gain.setValueAtTime(0.15, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5);
        o.connect(g).connect(actx.destination);
        o.start();
        o.stop(actx.currentTime + 0.5);
        return;
      }
      const dur = kind === 'fire' ? 0.25 : 0.4 + size / 100;
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'fire' ? 4 : 2);
      const src = actx.createBufferSource();
      src.buffer = buf;
      const f = actx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = kind === 'fire' ? 1800 : kind === 'thud' ? 300 : 700;
      const g = actx.createGain();
      g.gain.value = kind === 'fire' ? 0.25 : 0.5;
      src.connect(f).connect(g).connect(actx.destination);
      src.start();
    } catch {
      /* audio unavailable */
    }
  }

  // ---------- rendering ----------
  const stars = Array.from({ length: 70 }, () => [Math.random() * P.W, Math.random() * P.H * 0.5, Math.random() * 1.5]);

  function draw(now) {
    stepAnim();
    ctx.save();
    if (now < shakeUntil) {
      const k = (shakeUntil - now) / 900;
      ctx.translate((Math.random() - 0.5) * 16 * k, (Math.random() - 0.5) * 16 * k);
    }

    const sky = ctx.createLinearGradient(0, 0, 0, P.H);
    sky.addColorStop(0, '#0d1530');
    sky.addColorStop(0.6, '#3b3361');
    sky.addColorStop(1, '#c46a4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, P.W, P.H);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [x, y, r] of stars) ctx.fillRect(x, y, r, r);
    ctx.fillStyle = '#f3e3b5';
    ctx.beginPath();
    ctx.arc(P.W - 140, 90, 34, 0, Math.PI * 2);
    ctx.fill();

    if (terrain) drawTerrain();
    for (const t of tanks) drawTank(t, now);
    if (anim) drawProjectiles();
    drawEffects();
    drawFloaters();
    drawWindSock();
    ctx.restore();

    if (phase === 'aim' && deadline) {
      const s = Math.max(0, Math.ceil((deadline - now) / 1000));
      $('timer-label').textContent = `⏱ ${s}s`;
      $('timer-label').style.color = s <= 10 ? '#e8553b' : '';
    } else $('timer-label').textContent = '';
    const st = $('shop-timer');
    if (st) st.textContent = `⏱ ${Math.max(0, Math.ceil((shopDeadline - now) / 1000))}s`;

    requestAnimationFrame(draw);
  }

  function drawTerrain() {
    ctx.beginPath();
    ctx.moveTo(0, P.H);
    for (let x = 0; x < P.W; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineTo(P.W, P.H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, P.H * 0.3, 0, P.H);
    g.addColorStop(0, '#4f7a3a');
    g.addColorStop(0.25, '#5d4a2f');
    g.addColorStop(1, '#2e2418');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x < P.W; x++) ctx.lineTo(x, terrain[x]);
    ctx.strokeStyle = '#8fc46a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawTank(t, now) {
    if (!t.alive) {
      ctx.fillStyle = '#333';
      ctx.fillRect(t.x - 13, t.y - 7, 26, 7);
      ctx.fillStyle = 'rgba(80,80,80,0.5)';
      ctx.beginPath();
      ctx.arc(t.x + Math.sin(now / 400) * 3, t.y - 18 - ((now / 30) % 20), 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const a = (t.angle * Math.PI) / 180;
    const ty = t.y - P.TURRET_Y;
    // barrel
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t.x, ty);
    ctx.lineTo(t.x + Math.cos(a) * P.BARREL, ty - Math.sin(a) * P.BARREL);
    ctx.stroke();
    // turret + hull
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, ty, 8, Math.PI, 0);
    ctx.fill();
    roundRect(t.x - 15, t.y - 11, 30, 8, 3);
    ctx.fill();
    ctx.fillStyle = '#22262e';
    roundRect(t.x - 16, t.y - 5, 32, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#555c6a';
    for (let i = -12; i <= 12; i += 6) ctx.fillRect(t.x + i - 1, t.y - 3, 2, 2);

    // name + hp
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(t.name, t.x, t.y - 40);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(t.x - 20, t.y - 34, 40, 5);
    ctx.fillStyle = t.hp > t.maxHp / 2 ? '#6fd36f' : t.hp > t.maxHp / 4 ? '#f2c230' : '#e8553b';
    ctx.fillRect(t.x - 20, t.y - 34, 40 * (t.hp / t.maxHp), 5);

    if (t.shield > 0) {
      const pulse = 0.25 + 0.1 * Math.sin(now / 300);
      const g = ctx.createRadialGradient(t.x, t.y - 6, P.SHIELD_RADIUS * 0.5, t.x, t.y - 6, P.SHIELD_RADIUS);
      g.addColorStop(0, 'rgba(127,216,255,0)');
      g.addColorStop(1, `rgba(127,216,255,${pulse + (0.4 * t.shield) / t.shieldMax})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 6, P.SHIELD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7fd8ff';
      ctx.fillRect(t.x - 20, t.y - 28, 40 * (t.shield / t.shieldMax), 3);
    }

    if (t.id === currentId && phase === 'aim') {
      const bob = Math.sin(now / 180) * 4;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(t.x - 7, t.y - 62 + bob);
      ctx.lineTo(t.x + 7, t.y - 62 + bob);
      ctx.lineTo(t.x, t.y - 52 + bob);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawProjectiles() {
    const tick = Math.floor(anim.tick);
    anim.msg.shells.forEach((s, i) => {
      if (anim.applied[i] || tick < s.startTick) return;
      const end = Math.min(tick - s.startTick, s.path.length - 1);
      ctx.strokeStyle = 'rgba(255,220,150,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = Math.max(0, end - 40); k <= end; k++) ctx.lineTo(s.path[k][0], s.path[k][1]);
      ctx.stroke();
      const [x, y] = s.path[end];
      if (y < 0) {
        // off the top: show a marker
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath();
        ctx.moveTo(x - 6, 12);
        ctx.lineTo(x + 6, 12);
        ctx.lineTo(x, 2);
        ctx.fill();
      }
      const isBall = s.w === 'ball';
      ctx.fillStyle = s.explosion && s.explosion.dirt ? '#8a6a3c' : isBall ? '#d9dde4' : '#fff3c4';
      ctx.beginPath();
      ctx.arc(x, y, isBall ? 5 : s.w === 'bomblet' ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (isBall) {
        // spinning stripe
        const spin = x / 5;
        ctx.strokeStyle = '#e8553b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(spin) * 5, y - Math.sin(spin) * 5);
        ctx.lineTo(x + Math.cos(spin) * 5, y + Math.sin(spin) * 5);
        ctx.stroke();
      }
    });
  }

  function drawEffects() {
    effects = effects.filter((e) => e.age < (e.nuke ? 150 : e.debris ? 60 : 30));
    for (const e of effects) {
      e.age++;
      if (e.nuke) {
        drawNuke(e);
      } else if (e.shieldPulse) {
        ctx.strokeStyle = `rgba(127,216,255,${1 - e.age / 30})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, P.SHIELD_RADIUS * (0.3 + e.age / 25), 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.debris) {
        e.vy += 0.15;
        e.x += e.vx;
        e.y += e.vy;
        ctx.fillStyle = e.color;
        ctx.globalAlpha = 1 - e.age / 60;
        ctx.fillRect(e.x, e.y, 3, 3);
      } else {
        const p = e.age / 30;
        ctx.globalAlpha = 1 - p;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (0.6 + p * 0.6));
        g.addColorStop(0, e.dirt ? '#c9a46a' : '#fff6c8');
        g.addColorStop(0.4, e.dirt ? '#8a6a3c' : '#ffb347');
        g.addColorStop(1, 'rgba(200,60,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (0.6 + p * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // White flash, fireball, then a mushroom cloud that rises and fades.
  function drawNuke(e) {
    const t = e.age;
    if (t < 25) {
      ctx.fillStyle = `rgba(255,250,230,${0.85 * (1 - t / 25)})`;
      ctx.fillRect(-20, -20, P.W + 40, P.H + 40);
    }
    const fade = Math.max(0, 1 - Math.max(0, t - 60) / 90);
    // fireball
    const fr = e.r * Math.min(1.1, 0.3 + t / 20);
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, fr);
    g.addColorStop(0, `rgba(255,255,220,${fade})`);
    g.addColorStop(0.35, `rgba(255,190,80,${0.9 * fade})`);
    g.addColorStop(1, 'rgba(200,50,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, fr, 0, Math.PI * 2);
    ctx.fill();
    if (t < 15) return;
    // mushroom: stem + cap
    const rise = Math.min(1, (t - 15) / 70);
    const capY = e.y - 40 - rise * 170;
    const capR = 35 + rise * 45;
    ctx.globalAlpha = 0.85 * fade;
    const sg = ctx.createLinearGradient(0, capY, 0, e.y);
    sg.addColorStop(0, '#b0502a');
    sg.addColorStop(1, '#5a3a2a');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(e.x - 14 - rise * 6, e.y);
    ctx.quadraticCurveTo(e.x - 8, (capY + e.y) / 2, e.x - 10, capY + capR * 0.4);
    ctx.lineTo(e.x + 10, capY + capR * 0.4);
    ctx.quadraticCurveTo(e.x + 8, (capY + e.y) / 2, e.x + 14 + rise * 6, e.y);
    ctx.fill();
    const cg = ctx.createRadialGradient(e.x, capY - capR * 0.2, 4, e.x, capY, capR * 1.2);
    cg.addColorStop(0, '#ffd27a');
    cg.addColorStop(0.4, '#d9682e');
    cg.addColorStop(1, 'rgba(70,40,35,0.9)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(e.x, capY, capR * 1.3, capR * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    floaters = floaters.filter((f) => f.age < 90);
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of floaters) {
      f.age++;
      ctx.globalAlpha = 1 - f.age / 90;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.age * 0.4);
    }
    ctx.globalAlpha = 1;
  }

  function drawWindSock() {
    const x = 60;
    const y = 40;
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y + 30);
    ctx.stroke();
    const len = 8 + Math.abs(wind) * 4;
    const dir = wind >= 0 ? 1 : -1;
    const flap = Math.sin(performance.now() / 150) * 2;
    ctx.fillStyle = '#e8553b';
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + dir * len, y - 6 + flap);
    ctx.lineTo(x + dir * len, y - 2 + flap);
    ctx.lineTo(x, y + 4);
    ctx.fill();
  }

  // ---------- input ----------
  $('name').value = localStorageGet('name') || '';
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $('code').value = urlRoom.toUpperCase();

  function localStorageGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function localStorageSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  }

  async function ensureConnected() {
    if (!ws || ws.readyState !== WebSocket.OPEN) await connect();
  }

  $('btn-create').onclick = async () => {
    localStorageSet('name', $('name').value);
    showError('');
    await ensureConnected();
    send({ type: 'create', name: $('name').value });
  };
  $('btn-join').onclick = async () => {
    const code = $('code').value.trim();
    if (code.length !== 4) return showError('Bitte den 4-stelligen Code eingeben.');
    localStorageSet('name', $('name').value);
    showError('');
    await ensureConnected();
    send({ type: 'join', code, name: $('name').value });
  };
  $('code').addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-join').click());
  $('btn-start').onclick = () => send({ type: 'start' });
  $('rounds').onchange = (e) => send({ type: 'settings', rounds: Number(e.target.value) });
  $('overlay-card').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.buy) send({ type: 'buy', item: b.dataset.buy });
    else if (b.dataset.upgrade) send({ type: 'buy', upgrade: b.dataset.upgrade });
    else if (b.dataset.action === 'ready') send({ type: 'ready', ready: !me().ready });
    else if (b.dataset.action === 'again') send({ type: 'start' });
    else if (b.dataset.action === 'lobby') send({ type: 'lobby' });
    else if (b.dataset.action === 'menu') send({ type: 'leave' });
  };
  for (const [id, dir] of [['btn-left', -1], ['btn-right', 1]]) {
    const btn = $(id);
    const stop = () => clearInterval(driveTimer);
    btn.addEventListener('pointerdown', () => {
      stop();
      drive(dir);
      driveTimer = setInterval(() => drive(dir), 40);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  }
  $('btn-leave').onclick = () => send({ type: 'leave' });
  $('btn-copy').onclick = async () => {
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      $('btn-copy').textContent = 'Link kopiert ✓';
    } catch {
      prompt('Link kopieren:', link);
    }
    setTimeout(() => ($('btn-copy').textContent = 'Einladungslink kopieren'), 2000);
  };

  $('angle').oninput = (e) => setAim({ angle: +e.target.value });
  $('power').oninput = (e) => setAim({ power: +e.target.value });
  $('weapons').onclick = (e) => {
    if (e.target.closest('#btn-shield')) return raiseShield();
    const b = e.target.closest('button[data-w]');
    if (b) setAim({ weapon: b.dataset.w });
  };
  $('btn-fire').onclick = fire;

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const t = myTank();
    if (!isMyTurn()) return;
    const step = e.shiftKey ? 1 : 3;
    switch (e.key) {
      case 'ArrowLeft': setAim({ angle: t.angle + step }); break;
      case 'ArrowRight': setAim({ angle: t.angle - step }); break;
      case 'ArrowUp': setAim({ power: t.power + (e.shiftKey ? 1 : 2) }); break;
      case 'ArrowDown': setAim({ power: t.power - (e.shiftKey ? 1 : 2) }); break;
      case ' ': fire(); break;
      case 's':
      case 'S': raiseShield(); break;
      case 'a':
      case 'A': drive(-1); break;
      case 'd':
      case 'D': drive(1); break;
      default: {
        const i = Number(e.key) - 1;
        if (P.WEAPON_ORDER[i]) setAim({ weapon: P.WEAPON_ORDER[i] });
        else return;
      }
    }
    e.preventDefault();
  });

  requestAnimationFrame(draw);
})();
