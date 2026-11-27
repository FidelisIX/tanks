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
  let targeting = false; // choosing a teleport target
  let currentMap = { type: 'hills', water: null };
  let hoverX = null;
  let countdownEnd = 0;
  let lastMsgAt = 0;
  let reconnectUntil = 0;
  let reconnectTimer = null;

  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = P.W;
  canvas.height = P.H;

  // ---------- connection ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}`);
    ws = sock;
    lastMsgAt = performance.now();
    sock.onmessage = (e) => {
      lastMsgAt = performance.now();
      handle(JSON.parse(e.data));
    };
    sock.onclose = (e) => {
      if (ws === sock) connectionLost(e.code);
    };
    return new Promise((resolve, reject) => {
      sock.onopen = resolve;
      sock.onerror = reject;
    });
  }

  // ---------- reconnecting ----------
  // The seat token lives in sessionStorage (per tab, survives reloads) and in
  // localStorage (survives closing the tab and opening the invite link again).
  const SESSION_KEY = 'kk-session';
  function saveSession(code, token) {
    const v = JSON.stringify({ code, token });
    for (const store of [sessionStorage, localStorage]) {
      try {
        store.setItem(SESSION_KEY, v);
      } catch {
        /* storage unavailable */
      }
    }
  }
  function loadSession() {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const v = JSON.parse(store.getItem(SESSION_KEY));
        if (v && v.code && v.token) return v;
      } catch {
        /* storage unavailable */
      }
    }
    return null;
  }
  function clearSession() {
    for (const store of [sessionStorage, localStorage]) {
      try {
        store.removeItem(SESSION_KEY);
      } catch {
        /* storage unavailable */
      }
    }
  }

  function banner(text) {
    $('conn-banner').textContent = text || '';
    $('conn-banner').classList.toggle('hidden', !text);
  }

  function connectionLost(code) {
    ws = null;
    clearInterval(driveTimer);
    if (code === 4000) {
      room = null;
      banner('');
      showError('Das Spiel läuft jetzt in einem anderen Tab weiter.');
      return show('menu');
    }
    const session = loadSession();
    if (!room || !session) {
      showError('Verbindung zum Server verloren.');
      return show('menu');
    }
    phase = 'idle';
    updateControls();
    // 1012 = server restart (deploy): give the new server more time to come up
    reconnectUntil = performance.now() + (code === 1012 ? 120000 : 60000);
    resume(session);
  }

  async function resume(session) {
    clearTimeout(reconnectTimer);
    if (performance.now() > reconnectUntil) {
      banner('');
      room = null;
      showError('Wiedereinstieg fehlgeschlagen. Der Server ist nicht erreichbar.');
      return show('menu');
    }
    banner('Verbindung verloren – verbinde neu …');
    try {
      await connect();
      send({ type: 'resume', code: session.code, token: session.token });
    } catch {
      reconnectTimer = setTimeout(() => resume(session), 2000);
    }
  }

  // Heartbeat: a silently dropped connection (e.g. a phone switching networks)
  // is noticed when the server stops answering.
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (performance.now() - lastMsgAt > 20000) {
      const sock = ws;
      sock.onclose = null;
      sock.close();
      connectionLost(1006);
      return;
    }
    send({ type: 'ping' });
  }, 7000);

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  // Turn-ending actions (fire, shield, teleport, repair). Without a connection nothing is sent and
  // the controls stay usable; if the server does not answer within 3 s they are released again,
  // so a lost message never leaves the player stuck until the turn runs out. (The server ignores
  // a second action in the same turn, so pressing again is safe.)
  let ackTimer = null;
  function sendAction(msg) {
    if (!send(msg)) {
      notice('Keine Verbindung – nicht gesendet. Gleich nochmal versuchen.');
      return false;
    }
    phase = 'wait';
    updateControls();
    clearTimeout(ackTimer);
    ackTimer = setTimeout(() => {
      if (phase !== 'wait') return;
      phase = 'aim';
      updateControls();
      notice('Keine Antwort vom Server – bitte nochmal drücken.');
    }, 3000);
    return true;
  }
  function acknowledged() {
    clearTimeout(ackTimer);
  }
  let noticeTimer = null;
  function notice(text) {
    banner(text);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      if ($('conn-banner').textContent === text) banner('');
    }, 4000);
  }

  function handle(msg) {
    switch (msg.type) {
      case 'error':
        showError(msg.msg);
        break;
      case 'joined':
        myId = msg.you;
        saveSession(msg.code, msg.token);
        history.replaceState(null, '', `?room=${msg.code}`);
        if (msg.resumed) banner('');
        break;
      case 'kicked':
        clearSession();
        room = null;
        overlayVisible = false;
        showError(msg.message);
        show('menu');
        break;
      case 'info':
        banner(msg.message);
        break;
      case 'resumeFailed':
        clearSession();
        banner('');
        room = null;
        showError('Wiedereinstieg nicht möglich: Das Match ist vorbei oder der Server wurde neu gestartet.');
        show('menu');
        break;
      case 'sync':
        anim = null;
        applyTurn(msg);
        if (msg.phase !== 'aim') phase = 'idle'; // a shot is playing out; the next turn message follows
        updateControls();
        break;
      case 'timer':
        deadline = performance.now() + msg.timeLeft;
        break;
      case 'room':
        room = msg;
        if (room.state === 'shop') shopDeadline = performance.now() + room.shopTimeLeft;
        renderRoom();
        break;
      case 'left':
        clearSession();
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
        if (msg.id === myId) $('fuel').textContent = `⛽ ${Math.floor(msg.fuel)}`;
        renderScoreboard();
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
        waterFloater(msg.turnDamage);
        renderScoreboard();
        break;
      case 'repair': {
        acknowledged();
        tanks = msg.tanks;
        phase = 'anim';
        const t = tankById(msg.id);
        if (t) floaters.push({ x: t.x, y: t.y - 50, text: `+${msg.heal} ❤`, age: 0, color: '#6fd36f' });
        sound('shield');
        updateControls();
        renderScoreboard();
        break;
      }
      case 'teleport': {
        acknowledged();
        tanks = msg.tanks;
        phase = 'anim';
        for (const pt of [msg.from, msg.to]) effects.push({ teleport: true, x: pt.x, y: pt.y - 8, age: 0 });
        const t = tankById(msg.id);
        if (t) floaters.push({ x: msg.to.x, y: msg.to.y - 50, text: 'Teleport!', age: 0, color: '#c4b5fd' });
        sound('shield');
        updateControls();
        renderScoreboard();
        break;
      }
      case 'shield': {
        acknowledged();
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
        acknowledged();
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
    document.body.classList.toggle('in-game', name === 'game');
    if (name === 'game' && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (name === 'game') requestAnimationFrame(fitCanvas);
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
    if (room.state === 'shop' || room.state === 'over' || room.state === 'countdown') show('game');
    if (room.state === 'countdown') {
      countdownEnd = performance.now() + room.countdownLeft;
      overlayVisible = true;
    }
    $('room-code').textContent = room.code;
    $('player-list').innerHTML = room.players
      .map(
        (p) => `<li><span class="dot" style="background:${p.color}"></span>${p.isBot ? '🤖 ' : ''}${esc(p.name)}${
          p.id === myId ? ' (du)' : p.connected ? '' : ' <span class="offline">(getrennt)</span>'
        }<span class="badge">${p.id === room.hostId ? 'Gastgeber' : p.isBot ? `Computer · ${LEVELS[p.difficulty] || ''}` : ''}</span>${
          isHost && p.id !== myId ? `<button class="kick" data-kick="${p.id}" title="Aus dem Raum entfernen">✕</button>` : ''
        }</li>`
      )
      .join('');
    $('bot-row').classList.toggle('hidden', !isHost);
    $('btn-bot').disabled = room.players.length >= P.MAX_PLAYERS;
    $('rounds').value = String(room.rounds);
    $('map-type').value = room.mapType || 'random';
    $('map-type').disabled = !isHost;
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

  const LEVELS = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

  function isOffline(id) {
    const p = room && room.players.find((pp) => pp.id === id);
    return !!p && p.connected === false;
  }

  function me() {
    return room && room.players.find((p) => p.id === myId);
  }

  // Round summary + shop (between rounds) or final standings (after the last round).
  function renderOverlay() {
    const countdown = overlayVisible && room && room.state === 'countdown';
    const show = countdown || (overlayVisible && room && (room.state === 'shop' || room.state === 'over') && lastRound);
    $('overlay').classList.toggle('hidden', !show);
    if (!show) return;
    if (countdown) {
      $('overlay-card').innerHTML = `<p class="hint">Gleich geht's los – ${room.rounds} Runden</p>
        <div class="countdown" id="countdown-num"></div>
        <p class="hint">${room.players.map((p) => `<span style="color:${p.color}">${esc(p.name)}</span>`).join(' · ')}</p>`;
      return;
    }
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
        return `<tr><td>${name(p.id)}</td><td>${e.damage}</td><td>${e.kills}</td><td>${e.win}</td><td>${e.base}</td><td>${e.bounty || 0}</td><td><b>+${e.total}</b></td><td>${p.score}</td></tr>`;
      })
      .join('');
    if (rows) {
      html += `<table class="earn"><tr><th></th><th>Schaden</th><th>Abschüsse</th><th>Sieg</th><th>Basis</th><th title="50 % mehr Punkte für Schaden am Führenden, +25 für seinen Abschuss">Kopfgeld</th><th>Runde</th><th>Gesamt</th></tr>${rows}</table>`;
    }

    if (room.state === 'shop') {
      const m = me();
      const inv = m.inv;
      const owned = (k) => (k === 'shield' ? inv.shields : k === 'fuel' ? Math.floor(inv.fuel) : k === 'teleport' ? inv.teleports || 0 : inv.ammo[k]);
      if (room.discountId === myId) {
        html += `<p class="discount-note">Letzter Platz: ${Math.round(P.LAST_PLACE_DISCOUNT * 100)} % Rabatt auf alles im Shop</p>`;
      }
      html += `<div class="shop-head"><b>Shop</b><span>💰 ${m.money}</span><button class="link" data-help-open>Was bringt was?</button><span id="shop-timer"></span></div><div class="shop">`;
      for (const [k, it] of Object.entries(P.SHOP_ITEMS)) {
        const price = myPrice(it.price);
        html += `<button data-buy="${k}" ${m.money < price || m.ready ? 'disabled' : ''} title="${esc(it.desc || '')}">
          ${ICONS[k] || ''}<span>${it.name}${it.qty > 1 ? ` +${it.qty}` : ''}</span><small>Vorrat: ${owned(k)}</small><b>${priceLabel(it.price)}</b></button>`;
      }
      for (const [k, u] of Object.entries(P.UPGRADES)) {
        const lvl = inv.upgrades[k];
        const price = u.prices[lvl] === undefined ? undefined : myPrice(u.prices[lvl]);
        html += `<button data-upgrade="${k}" class="upg" ${price === undefined || m.money < price || m.ready ? 'disabled' : ''}>
          ${ICONS[k] || ''}<span>${u.name} ${'★'.repeat(lvl)}${'☆'.repeat(u.prices.length - lvl)}</span><small>${u.desc}</small><b>${price === undefined ? 'max.' : priceLabel(u.prices[lvl])}</b></button>`;
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
      const mine = me();
      html += `<div class="votes">${players
        .filter((p) => !p.isBot)
        .map((p) => `<span class="${p.vote ? 'ok' : ''}">${p.vote ? '✓' : '…'} ${esc(p.name)}</span>`)
        .join('')}</div>`;
      html += `<button data-action="vote" class="primary" ${players.length < 2 ? 'disabled' : ''}>${
        mine && mine.vote ? 'Doch nicht' : `Nochmal spielen (${room.rounds} Runden)`
      }</button>`;
      if (isHost) {
        html += `<button data-action="again" ${players.length < 2 ? 'disabled' : ''}>Sofort starten (ohne alle Stimmen)</button>`;
        html += `<button data-action="lobby">Zurück in den Warteraum</button>`;
      } else html += `<p class="hint">Haben alle zugestimmt, startet das nächste Match. Der Gastgeber kann auch sofort starten.</p>`;
      html += `<a href="statistik.html" target="_blank" class="stats-link">Statistik &amp; Rekorde</a>`;
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
    acknowledged();
    stopTargeting();
    terrain = msg.terrain;
    tanks = msg.tanks;
    currentId = msg.currentId;
    wind = msg.wind;
    deadline = performance.now() + msg.timeLeft;
    phase = 'aim';
    overlayVisible = false;
    $('overlay').classList.add('hidden');
    if (msg.map) currentMap = msg.map;
    updateSnowLine(`${room ? room.code : ''}-${msg.round}`);
    const mapName = P.MAP_TYPES[currentMap.type] ? P.MAP_TYPES[currentMap.type].name : '';
    const skyName = P.SKIES[currentMap.sky] ? P.SKIES[currentMap.sky].name : '';
    $('round-label').innerHTML = `<span class="round-pill">Runde ${msg.round}/${msg.rounds}</span> ${[mapName, skyName].filter(Boolean).join(' · ')}`;
    const roundKey = `${room ? room.code : ''}-${msg.round}`;
    if (roundKey !== introKey) {
      introKey = roundKey;
      intro = {
        title: `Runde ${msg.round} von ${msg.rounds}`,
        sub: [mapName, skyName].filter(Boolean).join(' · '),
        last: msg.round === msg.rounds,
        start: performance.now(),
      };
    }
    waterFloater(msg.turnDamage);
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
    for (const id of ['angle', 'power', 'btn-fire', 'btn-left', 'btn-right', 'angle-up', 'angle-down', 'power-up', 'power-down']) $(id).disabled = !mine;
    if (t) {
      $('power').max = t.maxPower;
      $('fuel').textContent = `⛽ ${Math.floor(t.fuel)}`;
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
      return `<button data-w="${k}" class="weapon ${t && t.weapon === k ? 'active' : ''}" ${
        !mine || ammo === 0 ? 'disabled' : ''
      } title="${w.name}${weaponKey(i) ? ` (Taste ${weaponKey(i)})` : ''}"><span class="key">${weaponKey(i)}</span>${ICONS[k] || ''}<small>${label}</small></button>`;
    }).join('');
    const weaponNames = `<div class="weapon-name">${t ? `${P.WEAPONS[t.weapon].name} <small>${
      t.ammo[t.weapon] === -1 ? '∞' : `×${t.ammo[t.weapon]}`
    }</small>` : ''}</div>`;
    $('weapons').innerHTML = weaponNames + `<div class="weapon-row">${$('weapons').innerHTML}
      <button id="btn-shield" class="weapon shield-btn" ${!mine || !t || t.shieldLeft <= 0 ? 'disabled' : ''} title="Schild (Taste S) – kostet den Zug"><span class="key">S</span>${ICONS.shield}<small>×${
        t ? t.shieldLeft : 1
      }</small></button>
      <button id="btn-teleport" class="weapon${targeting ? ' active' : ''}" ${!mine || !t || !(t.teleports > 0) ? 'disabled' : ''} title="Teleport (Taste T) – Ziel auf der Karte anklicken, kostet den Zug"><span class="key">T</span>${ICONS.teleport}<small>×${
        t ? t.teleports || 0 : 0
      }</small></button>
      <button id="btn-repair" class="weapon" ${!mine || !t || !(t.repairs > 0) || t.hp >= t.maxHp ? 'disabled' : ''} title="Reparaturset (Taste R) – +${P.REPAIR_HP} Lebenspunkte, kostet den Zug"><span class="key">R</span>${ICONS.repair}<small>×${
        t ? t.repairs || 0 : 0
      }</small></button></div>`;
    const cur = tankById(currentId);
    $('turn-label').innerHTML = cur
      ? `<span class="turn-pill${mine ? ' mine' : ''}" style="--c:${cur.color}">${
          mine ? '🎯 Du bist dran!' : `${esc(cur.name)} ist dran${isOffline(cur.id) ? ' (getrennt)' : ''}`
        }</span>`
      : '';
    renderWind();
    renderScoreboard();
    fitCanvas();
  }

  // Make the play area as large as the window allows (keeping its aspect ratio): the width of
  // the page, and whatever height is left after the bars above and below it.
  function fitCanvas() {
    if ($('screen-game').classList.contains('hidden')) return;
    const wrap = $('canvas-wrap');
    const used = ['topbar', 'scoreboard', 'controls'].reduce((h, id) => h + $(id).offsetHeight, 0);
    const keys = document.querySelector('.keys');
    const banner = $('conn-banner');
    const extra = (keys ? keys.offsetHeight : 0) + (banner.classList.contains('hidden') ? 0 : banner.offsetHeight) + 34; // gaps and padding
    const maxH = Math.max(240, window.innerHeight - used - extra);
    const w = Math.min(wrap.clientWidth, (maxH * P.W) / P.H);
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor((w * P.H) / P.W)}px`;
  }
  window.addEventListener('resize', fitCanvas);
  document.addEventListener('fullscreenchange', () => {
    $('btn-fullscreen').textContent = document.fullscreenElement ? '⛶ Vollbild aus' : '⛶ Vollbild';
    fitCanvas();
  });

  // Wind: arrow length = strength, arrow direction = where the wind blows.
  function renderWind() {
    const s = Math.abs(wind);
    const dir = wind > 0 ? 'nach rechts' : wind < 0 ? 'nach links' : '';
    const label = s === 0 ? 'windstill' : s <= 3 ? 'schwach' : s <= 7 ? 'mittel' : 'stark';
    $('wind-label').innerHTML = `<span class="wind-title">Wind</span>
      <span class="wind-gauge"><span class="wind-arrow ${wind < 0 ? 'left' : ''}" style="width:calc((50% - 7px) * ${s / 10})"></span></span>
      <b>${s}</b><small>${label}${dir ? ` · ${dir}` : ''}</small>`;
  }

  // One card per tank: hit points, shield, points this round, total points, money.
  function renderScoreboard() {
    if (!tanks.length) return ($('scoreboard').innerHTML = '');
    $('scoreboard').innerHTML = tanks
      .map((t) => {
        const p = room && room.players.find((pp) => pp.id === t.id);
        const hpPct = Math.max(0, Math.round((100 * t.hp) / t.maxHp));
        const hpColor = hpPct > 50 ? '#6fd36f' : hpPct > 25 ? '#f2c230' : '#e8553b';
        const tags = [
          t.id === myId ? 'du' : '',
          p && p.isBot ? '🤖' : '',
          isOffline(t.id) ? 'getrennt' : '',
          room && room.leaderId === t.id ? '<span class="bounty" title="Schaden an diesem Panzer bringt 50 % mehr Punkte">🎯 Kopfgeld</span>' : '',
        ].filter(Boolean).join(' · ');
        return `<div class="sb${t.id === currentId && phase !== 'idle' ? ' active' : ''}${t.alive ? '' : ' dead'}" style="--c:${t.color}">
          <div class="sb-name"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}${tags ? `<small>${tags}</small>` : ''}
            <span class="sb-hpnum">${t.alive ? `❤ ${t.hp}/${t.maxHp}` : '💀 zerstört'}${t.shield > 0 ? ` <span class="shield">🛡 ${t.shield}</span>` : ''}</span></div>
          <div class="sb-hp"><span style="width:${hpPct}%;background:${hpColor}"></span></div>
          <div class="sb-row"><span>Runde <b>+${t.roundPts || 0}</b> · Gesamt <b>${t.score || 0}</b></span><span class="muted">💰 ${t.money || 0} · ⛽ ${Math.floor(t.fuel)}</span></div>
        </div>`;
      })
      .join('');
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
    // the aim travels with the shot, so a dropped aim update can never change the shot
    sendAction({ type: 'fire', angle: t.angle, power: t.power, weapon: t.weapon });
  }

  // number keys 1–9 and 0 select the first ten weapons; Q/E cycle through all available ones
  function weaponKey(i) {
    return i < 9 ? String(i + 1) : i === 9 ? '0' : '';
  }
  function cycleWeapon(step) {
    const t = myTank();
    const avail = P.WEAPON_ORDER.filter((k) => t.ammo[k] !== 0);
    const i = avail.indexOf(t.weapon);
    setAim({ weapon: avail[(i + step + avail.length) % avail.length] });
  }

  // shop prices for this player (last place gets a discount)
  function myPrice(price) {
    return room && room.discountId === myId ? Math.round(price * (1 - P.LAST_PLACE_DISCOUNT)) : price;
  }
  function priceLabel(price) {
    const p = myPrice(price);
    return p === price ? `${price} 💰` : `<s>${price}</s> ${p} 💰`;
  }

  function drawWater(level, now) {
    ctx.fillStyle = 'rgba(40, 110, 190, 0.55)';
    ctx.fillRect(0, level, P.W, P.H - level);
    ctx.strokeStyle = 'rgba(160, 210, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= P.W; x += 8) ctx.lineTo(x, level + Math.sin(x / 30 + now / 400) * 2);
    ctx.stroke();
  }

  // the server takes at most one step per 25 ms, so faster key repeat only wastes messages
  let lastDrive = 0;
  function drive(dir) {
    const now = performance.now();
    if (!isMyTurn() || now - lastDrive < 30) return;
    lastDrive = now;
    send({ type: 'move', dir });
  }

  // Teleport: first pick the target on the map, then the server moves the tank.
  function startTargeting() {
    const t = myTank();
    if (!isMyTurn() || !(t.teleports > 0)) return;
    targeting = !targeting;
    canvas.classList.toggle('targeting', targeting);
    updateControls();
  }
  function stopTargeting() {
    if (!targeting) return;
    targeting = false;
    canvas.classList.remove('targeting');
  }
  function teleportTargetOk(x) {
    if (currentMap.water !== null && terrain && terrain[x] >= currentMap.water) return false; // not into the sea
    return x >= 15 && x <= P.W - 15 && !tanks.some((t) => t.alive && t.id !== myId && Math.abs(t.x - x) < P.TELEPORT_MIN_DISTANCE);
  }
  function waterFloater(td) {
    const t = td && tankById(td.id);
    if (t) floaters.push({ x: t.x, y: t.y - 40, text: `Wasser -${td.dmg}`, age: 0, color: '#5fb3ff' });
  }
  function canvasX(e) {
    const r = canvas.getBoundingClientRect();
    return Math.round(((e.clientX - r.left) / r.width) * P.W);
  }

  function repairTank() {
    const t = myTank();
    if (!isMyTurn() || !(t.repairs > 0) || t.hp >= t.maxHp) return;
    sendAction({ type: 'repair' });
  }

  function raiseShield() {
    if (!isMyTurn() || myTank().shieldLeft <= 0) return;
    sendAction({ type: 'shield' });
  }

  // ---------- shot animation ----------
  function startAnim(msg) {
    acknowledged();
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
        const nuke = !!P.WEAPONS[s.w].nukeFx;
        // trench digger: dust along the trench instead of a fireball
        const earthy = s.explosion.dirt || !!s.explosion.dig;
        if (s.explosion.dig) {
          for (const [dx, dy] of s.explosion.dig.filter((_, i) => i % 4 === 0)) spawnDebris({ x: dx, y: dy, dirt: true });
        } else effects.push({ x: s.explosion.x, y: s.explosion.y, r: s.explosion.r, dirt: s.explosion.dirt, nuke, age: 0 });
        if (nuke) shakeUntil = performance.now() + 900;
        if (!s.explosion.dig) spawnDebris(s.explosion);
        sound(earthy ? 'thud' : 'boom', nuke ? 250 : s.explosion.r);
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
      const wet = msg.hits.filter((h) => h.id === t.id && h.water).reduce((a, h) => a + h.dmg, 0);
      const lost = old.hp - t.hp - fell - wet;
      if (wet > 0) floaters.push({ x: t.x + 24, y: t.y - 24, text: `Wasser -${wet}`, age: 0, color: '#5fb3ff' });
      const blocked = (old.shield || 0) - (t.shield || 0);
      if (blocked > 0) floaters.push({ x: t.x + 22, y: t.y - 58, text: `🛡 -${blocked}`, age: 0, color: '#7fd8ff' });
      if (lost > 0) floaters.push({ x: t.x, y: t.y - 40, text: `-${lost}`, age: 0, color: '#ff6b5a' });
      if (fell > 0) floaters.push({ x: t.x - 24, y: t.y - 20, text: `Sturz -${fell}`, age: 0, color: '#ffb347' });
      if (lost > 0 && !t.alive) floaters.push({ x: t.x, y: t.y - 60, text: 'zerstört!', age: 0, color: '#fff' });
    }
    anim = null;
    renderScoreboard();
    fitCanvas();
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

    drawSky(now);

    if (terrain) drawTerrain();
    for (const t of tanks) drawTank(t, now);
    if (currentMap.water !== null && currentMap.water !== undefined) drawWater(currentMap.water, now);
    if (anim) drawProjectiles();
    drawEffects();
    drawFloaters();
    drawWindSock();
    if (intro) drawIntro(now);
    if (targeting) {
      // hint on the canvas itself, so the page layout does not jump
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15,18,24,0.75)';
      ctx.fillRect(P.W / 2 - 230, 14, 460, 34);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillText('Teleport: Ziel auf der Karte anklicken · Esc bricht ab', P.W / 2, 37);
      if (hoverX !== null) drawTeleportMarker(hoverX);
    }
    ctx.restore();

    if (phase === 'aim' && deadline) {
      const s = Math.max(0, Math.ceil((deadline - now) / 1000));
      $('timer-label').textContent = `⏱ ${s}s`;
      $('timer-label').style.color = s <= 10 ? '#e8553b' : '';
    } else $('timer-label').textContent = '';
    const cd = $('countdown-num');
    if (cd) cd.textContent = Math.max(1, Math.ceil((countdownEnd - now) / 1000));
    const st = $('shop-timer');
    if (st) st.textContent = `⏱ ${Math.max(0, Math.ceil((shopDeadline - now) / 1000))}s`;

    requestAnimationFrame(draw);
  }

  // ---------- looks: time of day and map palettes ----------
  const SKY_LOOKS = {
    day: { stops: ['#4f9fe0', '#94cdf2', '#dcf1ff'], body: { x: P.W - 170, y: 95, r: 38, color: '#fff3b0', glow: 'rgba(255,240,170,0.35)' }, stars: 0, clouds: 'rgba(255,255,255,0.9)', shade: null },
    dawn: { stops: ['#34477a', '#d99bb4', '#ffd7a3'], body: { x: 190, y: 250, r: 44, color: '#ffd59a', glow: 'rgba(255,200,150,0.4)' }, stars: 0.25, clouds: 'rgba(255,220,225,0.75)', shade: 'rgba(255,170,150,0.08)' },
    sunset: { stops: ['#2a1c4a', '#a3456c', '#f6a05a'], body: { x: P.W - 210, y: 300, r: 50, color: '#ffb067', glow: 'rgba(255,140,80,0.45)' }, stars: 0.35, clouds: 'rgba(255,170,140,0.7)', shade: 'rgba(255,110,60,0.10)' },
    night: { stops: ['#070b1c', '#18214a', '#3a3462'], body: { x: P.W - 140, y: 90, r: 34, color: '#f3e3b5', glow: 'rgba(240,230,190,0.18)' }, stars: 1, clouds: null, shade: 'rgba(5,10,40,0.32)' },
  };
  const PALETTES = {
    hills: { stops: ['#4f7a3a', '#5d4a2f', '#2e2418'], edge: '#8fc46a' },
    mountains: { stops: ['#8d909a', '#5a5c65', '#2e2f35'], edge: '#c3c7cf', snow: true },
    plains: { stops: ['#e4c07e', '#c69552', '#7a5a2e'], edge: '#f4dca4' },
    canyon: { stops: ['#c2643c', '#8e3e22', '#4a1f12'], edge: '#e58c5e', strata: true },
    islands: { stops: ['#4f8f3a', '#6b5434', '#2e2418'], edge: '#8fd46a', beach: true },
  };
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: (i * 230 + Math.random() * 120) % P.W, y: 40 + Math.random() * 120, s: 0.7 + Math.random() * 0.7 }));

  function drawSky(now) {
    const look = SKY_LOOKS[currentMap.sky] || SKY_LOOKS.night;
    const g = ctx.createLinearGradient(0, 0, 0, P.H);
    look.stops.forEach((c, i) => g.addColorStop(i / (look.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, P.W, P.H);
    if (look.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * look.stars})`;
      for (const [x, y, r] of stars) ctx.fillRect(x, y, r, r);
    }
    const b = look.body;
    const glow = ctx.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, b.r * 3);
    glow.addColorStop(0, b.glow);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    if (look.clouds) {
      ctx.fillStyle = look.clouds;
      for (const c of clouds) {
        const x = ((c.x + now * 0.004 * (wind || 1)) % (P.W + 200) + P.W + 200) % (P.W + 200) - 100; // drift with the wind
        for (const [dx, dy, r] of [[0, 0, 22], [24, -10, 26], [50, 0, 20], [24, 6, 22]]) {
          ctx.beginPath();
          ctx.arc(x + dx * c.s, c.y + dy * c.s, r * c.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // The snow line follows the map: between the highest peak and the median ground height,
  // so the top of every mountain map is snowy. Fixed for a round (craters do not move it).
  let snowLine = P.H * 0.36;
  let snowRound = null;
  function updateSnowLine(round) {
    if (!terrain || snowRound === round) return;
    snowRound = round;
    const sorted = [...terrain].sort((a, b) => a - b);
    const top = sorted[0];
    const median = sorted[sorted.length >> 1];
    snowLine = top + Math.max(50, (median - top) * 0.6);
  }

  function terrainPath() {
    ctx.beginPath();
    ctx.moveTo(0, P.H);
    for (let x = 0; x < P.W; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineTo(P.W, P.H);
    ctx.closePath();
  }

  function drawTerrain() {
    const pal = PALETTES[currentMap.type] || PALETTES.hills;
    terrainPath();
    const g = ctx.createLinearGradient(0, P.H * 0.3, 0, P.H);
    g.addColorStop(0, pal.stops[0]);
    g.addColorStop(0.25, pal.stops[1]);
    g.addColorStop(1, pal.stops[2]);
    ctx.fillStyle = g;
    ctx.fill();

    // details are painted inside the terrain shape only
    ctx.save();
    terrainPath();
    ctx.clip();
    if (pal.strata) {
      // rock layers of the canyon
      for (let y = 140; y < P.H; y += 22) {
        ctx.fillStyle = y % 44 === 0 ? 'rgba(60,20,10,0.18)' : 'rgba(255,190,150,0.08)';
        ctx.beginPath();
        for (let x = 0; x <= P.W; x += 20) ctx.lineTo(x, y + Math.sin(x / 90 + y) * 3);
        for (let x = P.W; x >= 0; x -= 20) ctx.lineTo(x, y + 9 + Math.sin(x / 90 + y) * 3);
        ctx.fill();
      }
    }
    if (pal.snow) {
      // snow caps above a slightly wavy snow line
      const snowY = (x) => snowLine + Math.sin(x / 37) * 10 + Math.sin(x / 13) * 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= P.W; x += 6) ctx.lineTo(x, snowY(x));
      ctx.lineTo(P.W, 0);
      ctx.closePath();
      const sg = ctx.createLinearGradient(0, 0, 0, P.H * 0.4);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(1, '#d6e2ef');
      ctx.fillStyle = sg;
      ctx.fill();
      // texture: rock furrows, snow fields running down the gullies, and grain in the snow
      const rnd = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1;
      ctx.strokeStyle = 'rgba(30,32,38,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 70; i++) {
        const x = Math.abs(rnd(i + 1)) * P.W;
        const y = terrain[Math.floor(x)] + 25 + Math.abs(rnd(i + 7)) * 160;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14 + Math.abs(rnd(i + 3)) * 18, y + 22 + Math.abs(rnd(i + 5)) * 26);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(240,246,252,0.85)';
      for (let i = 0; i < 40; i++) {
        const x = Math.abs(rnd(i + 101)) * P.W;
        const y0 = snowY(x) - 4;
        if (terrain[Math.floor(x)] > y0) continue; // only below a snowy peak
        const len = 25 + Math.abs(rnd(i + 103)) * 55;
        ctx.beginPath();
        ctx.moveTo(x - 6, y0);
        ctx.lineTo(x + 6, y0);
        ctx.lineTo(x + 1, y0 + len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(170,190,215,0.55)';
      for (let i = 0; i < 260; i++) {
        const x = Math.abs(rnd(i + 301)) * P.W;
        const y = Math.abs(rnd(i + 307)) * snowY(x);
        if (y > terrain[Math.floor(x)]) ctx.fillRect(x, y, 2, 2);
      }
    }
    if (pal.beach && currentMap.water !== null && currentMap.water !== undefined) {
      ctx.fillStyle = '#e3cb8c';
      ctx.fillRect(0, currentMap.water - 26, P.W, 30);
    }
    const look = SKY_LOOKS[currentMap.sky] || SKY_LOOKS.night;
    if (look.shade) {
      ctx.fillStyle = look.shade; // the light of the time of day tints the ground
      ctx.fillRect(0, 0, P.W, P.H);
    }
    ctx.restore();

    ctx.beginPath();
    for (let x = 0; x < P.W; x++) ctx.lineTo(x, terrain[x]);
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (pal.snow) {
      // white edge where the ground is snowy
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      let on = false;
      for (let x = 0; x < P.W; x++) {
        const snowy = terrain[x] < snowLine + Math.sin(x / 37) * 10 + Math.sin(x / 13) * 4;
        if (snowy && !on) ctx.moveTo(x, terrain[x]);
        else if (snowy) ctx.lineTo(x, terrain[x]);
        on = snowy;
      }
      ctx.stroke();
    }
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
    const offline = isOffline(t.id);
    ctx.fillStyle = offline ? '#8d97a8' : '#fff';
    ctx.fillText(offline ? `${t.name} (getrennt)` : t.name, t.x, t.y - 40);
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
      const isBall = s.w === 'ball' || s.w === 'motorball';
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
      } else if (e.teleport) {
        ctx.strokeStyle = `rgba(196,181,253,${1 - e.age / 30})`;
        ctx.lineWidth = 3;
        for (const k of [0.5, 1]) {
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, 10 + e.age * k, 4 + e.age * k * 0.4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
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

  // big round banner at the start of every round, fades out after ~2.5 s
  let intro = null;
  let introKey = null;
  function drawIntro(now) {
    const t = (now - intro.start) / 1000;
    if (t > 2.8) return (intro = null);
    const alpha = t < 0.2 ? t / 0.2 : t > 2.2 ? 1 - (t - 2.2) / 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10,12,18,0.7)';
    ctx.fillRect(P.W / 2 - 300, P.H / 2 - 95, 600, intro.last ? 190 : 160);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f08a24';
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.fillText(intro.title, P.W / 2, P.H / 2 - 15);
    ctx.fillStyle = '#e9edf3';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText(intro.sub, P.W / 2, P.H / 2 + 30);
    if (intro.last) {
      ctx.fillStyle = '#f2c230';
      ctx.fillText('Letzte Runde!', P.W / 2, P.H / 2 + 70);
    }
    ctx.restore();
  }

  function drawTeleportMarker(x) {
    const ok = teleportTargetOk(x) && terrain;
    const y = terrain ? terrain[Math.max(0, Math.min(P.W - 1, x))] : P.H;
    ctx.strokeStyle = ok ? '#c4b5fd' : '#e8553b';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y - 8, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ok ? '#c4b5fd' : '#e8553b';
    const wet = currentMap.water !== null && currentMap.water !== undefined && y >= currentMap.water;
    ctx.fillText(ok ? 'hierhin teleportieren' : wet ? 'nicht ins Wasser' : 'zu nah an einem Panzer', x, Math.max(20, y - 32));
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
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(wind === 0 ? 'windstill' : `Wind ${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`, x, y + 48);
  }

  // ---------- input ----------
  $('name').value = localStorageGet('name') || '';
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $('code').value = urlRoom.toUpperCase();
  const saved = loadSession();
  if (urlRoom && saved && saved.code === urlRoom.toUpperCase()) {
    // reopened or reloaded: try to take the seat back
    reconnectUntil = performance.now() + 15000;
    resume(saved);
  }

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

  $('btn-solo').onclick = async () => {
    localStorageSet('name', $('name').value);
    showError('');
    await ensureConnected();
    send({ type: 'create', name: $('name').value, solo: true });
  };
  $('btn-bot').onclick = () => send({ type: 'addBot', difficulty: $('bot-level').value });
  $('player-list').onclick = (e) => {
    const b = e.target.closest('button[data-kick]');
    if (b) send({ type: 'kick', playerId: b.dataset.kick });
  };
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
  $('map-type').onchange = (e) => send({ type: 'settings', mapType: e.target.value });
  $('overlay-card').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.buy) send({ type: 'buy', item: b.dataset.buy });
    else if (b.dataset.upgrade) send({ type: 'buy', upgrade: b.dataset.upgrade });
    else if (b.dataset.action === 'ready') send({ type: 'ready', ready: !me().ready });
    else if (b.dataset.action === 'again') send({ type: 'start' });
    else if (b.dataset.action === 'vote') send({ type: 'vote', vote: !me().vote });
    else if (b.dataset.action === 'lobby') send({ type: 'lobby' });
    else if (b.dataset.action === 'menu') {
      clearSession();
      send({ type: 'leave' });
    }
  };
  // step buttons for angle and power (made for touch screens): one tap = 1 step; holding repeats,
  // first after a short pause, then faster and faster
  for (const [id, change] of [
    ['angle-up', () => ({ angle: myTank().angle + 1 })],
    ['angle-down', () => ({ angle: myTank().angle - 1 })],
    ['power-up', () => ({ power: myTank().power + 1 })],
    ['power-down', () => ({ power: myTank().power - 1 })],
  ]) {
    const btn = $(id);
    let timer = null;
    const stop = () => clearTimeout(timer);
    const step = (delay) => {
      if (!isMyTurn()) return;
      setAim(change());
      timer = setTimeout(() => step(Math.max(30, delay * 0.85)), delay);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stop();
      if (!isMyTurn()) return;
      setAim(change());
      timer = setTimeout(() => step(110), 380);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault()); // long press on phones
  }

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
  $('btn-leave').onclick = () => {
    clearSession();
    send({ type: 'leave' });
  };
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
    if (e.target.closest('#btn-teleport')) return startTargeting();
    if (e.target.closest('#btn-repair')) return repairTank();
    const b = e.target.closest('button[data-w]');
    if (b) setAim({ weapon: b.dataset.w });
  };
  $('btn-fire').onclick = fire;
  // a clicked control button must not keep the focus, or the space bar would also press it
  $('controls').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) btn.blur();
  });
  $('btn-fullscreen').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  document.addEventListener('keydown', (e) => {
    // leave keys to a text field only if it is actually visible: some browsers keep the focus in
    // a field of a hidden screen (e.g. the room code after joining with Enter)
    const field = (e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'SELECT';
    if (field && e.target.offsetParent !== null) return;
    if (e.key === 'h' || e.key === 'H' || e.key === '?') return Help.isOpen() ? Help.close() : Help.open();
    if (Help.isOpen()) return;
    if (e.key === 'Escape' && targeting) return stopTargeting(), updateControls();
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
      case 't':
      case 'T': startTargeting(); break;
      case 'r':
      case 'R': repairTank(); break;
      case 'a':
      case 'A': drive(-1); break;
      case 'd':
      case 'D': drive(1); break;
      case 'q':
      case 'Q': cycleWeapon(-1); break;
      case 'e':
      case 'E': cycleWeapon(1); break;
      default: {
        const i = e.key === '0' ? 9 : Number(e.key) - 1;
        if (/^[0-9]$/.test(e.key) && P.WEAPON_ORDER[i]) setAim({ weapon: P.WEAPON_ORDER[i] });
        else return;
      }
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => (hoverX = canvasX(e)));
  canvas.addEventListener('pointerleave', () => (hoverX = null));
  canvas.addEventListener('click', (e) => {
    if (!targeting || !isMyTurn()) return;
    const x = canvasX(e);
    if (!teleportTargetOk(x)) return;
    stopTargeting();
    sendAction({ type: 'teleport', x });
  });

  requestAnimationFrame(draw);
})();
