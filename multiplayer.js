/* ==========================================================
   FUNCTION FIGHTER – multiplayer.js
   Live-Multiplayer über den Python-Server (server.py, Start mit
   start.bat). Ohne Server (index.html als Datei geöffnet) zeigt
   der Reiter nur, wie man den Server startet.

   Ablauf:
     – Lobby erstellen oder mit Code beitreten (Fenster „Multiplayer“).
     – Der Server schickt jede Änderung live (Server-Sent Events,
       /api/events) – mpOnState / mpOnShot verarbeiten sie.
     – Beim Feuern rechnet DIESER Browser Kurve, Treffer und Loch in
       der Wand aus (dieselbe Mathematik wie im Einzelspieler) und
       schickt sie an den Server. Der Server wendet die Treffer an,
       sobald die Kurve beim Ziel ankommt, und teleportiert das Ziel.
   ========================================================== */
'use strict';

const MP_RADIUS = { 3: 0.8, 2: 0.6, 1: 0.45 };   // Größe der Spieler nach Leben (wie die Gegner)
const MP_DARK = { '#2f6fdb': '#1b3f8f', '#d64545': '#8f2a18', '#2e9e6a': '#1d6644', '#e08a1a': '#8a4f08' };
const MP_KEEP_SHOTS = 8;                          // so viele Schüsse bleiben als blasse Spur stehen
// Jeder Spieler hat zusätzlich zur Farbe ein Symbol und ein eigenes Strichmuster für seine
// Spuren – so sind die Spieler auch ohne Farben (Farbenblindheit) gut zu unterscheiden.
const MP_SYMBOLS = ['●', '▲', '■', '◆'];
const MP_DASH = [[], [14, 7], [3, 6], [14, 6, 3, 6]];    // durchgezogen, gestrichelt, gepunktet, Strich-Punkt
const TEAM_NAMES = ['Links', 'Rechts'];
const POWERUP_RADIUS = 0.5;                       // so nah muss die Kurve kommen, um es einzusammeln
const POWERUP_LOOK = {
  life: { icon: '♥', color: '#d64545', name: '+1 Leben' },
  shield: { icon: '🛡', color: '#5b6b8c', name: 'Schild (hält einen Treffer ab)' },
  double: { icon: '×2', color: '#e0218a', name: 'Doppelschuss (nächster Schuss kostet 2 Leben)' },
};
const MP_SESSION = 'functionFighter.mp';
const MP_NAME = 'functionFighter.name';

// Auswahlmöglichkeiten der Lobby-Einstellungen (müssen zu ALLOWED_SETTINGS in server.py passen)
const MP_OPTIONS = {
  mode: [['turns', 'Runden – nacheinander, mit Bedenkzeit'], ['realtime', 'Echtzeit – feuern, sobald nachgeladen']],
  thinkTime: [[10, '10 Sekunden'], [20, '20 Sekunden'], [30, '30 Sekunden'], [45, '45 Sekunden'], [60, '60 Sekunden']],
  cooldown: [[2, 'alle 2 Sekunden'], [3, 'alle 3 Sekunden'], [5, 'alle 5 Sekunden']],
  walls: [['keine', 'keine Wände'], ['wenig', 'wenig'], ['mittel', 'mittel'], ['viel', 'viel']],
};

const mp = {
  available: location.protocol === 'http:' || location.protocol === 'https:',
  code: null, playerId: null, token: null,
  lobby: null,       // öffentlicher Lobby-Zustand vom Server
  es: null,          // Live-Verbindung (EventSource)
  offset: 0,         // Serverzeit − eigene Uhr (ms)
  shots: [],         // Schüsse der laufenden Runde (Animation + Spuren)
  gameId: null,
  firing: false,     // Schuss wird gerade an den Server geschickt
  connLost: false,
  error: '',
  hudKey: '',
};

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const mpNow = () => Date.now() + mp.offset;
const mpPlayer = id => (mp.lobby ? mp.lobby.players.find(p => p.id === id) : null);
const mpMe = () => mpPlayer(mp.playerId);
const mpIsHost = () => !!mp.lobby && mp.lobby.hostId === mp.playerId;
const mpAuth = extra => ({ code: mp.code, playerId: mp.playerId, token: mp.token, ...extra });
const mpRadius = p => MP_RADIUS[p.lives] || MP_RADIUS[1];
const hearts = lives => '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
const mpSymbol = p => MP_SYMBOLS[p.slot] || '●';
const mpTeammate = (a, b) => !!a && !!b && a.team !== null && a.team !== undefined && a.team === b.team;

async function mpApi(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { ok: false, error: 'Der Server antwortet nicht. Läuft start.bat noch?' };
  }
}

/* ---------- Lobby erstellen, beitreten, verlassen ---------- */

function mpSaveSession() {
  try { sessionStorage.setItem(MP_SESSION, JSON.stringify({ code: mp.code, playerId: mp.playerId, token: mp.token })); } catch { /* egal */ }
}

function mpClearSession() {
  try { sessionStorage.removeItem(MP_SESSION); } catch { /* egal */ }
}

// Name aus dem Feld oben in der Kopfzeile (oder null, wenn keiner eingetragen ist)
function mpReadName() {
  const name = ui.playerName.value.trim();
  if (!name) {
    mpShowError('Trag zuerst deinen Namen ein.');
    const field = document.getElementById('mp-name') || ui.playerName;   // die Kopfzeile ist gesperrt, solange das Fenster offen ist
    field.focus();
    field.classList.add('flash');
    return null;
  }
  return name;
}

// Name geändert: speichern und – wenn man in einer Lobby ist – allen zeigen
function mpNameChanged() {
  saveValue(MP_NAME, ui.playerName.value.trim());
  if (mp.code && ui.playerName.value.trim()) mpApi('/api/rename', mpAuth({ name: ui.playerName.value.trim() }));
}

async function mpCreate() {
  const name = mpReadName();
  if (!name) return;
  const res = await mpApi('/api/create', { name });
  if (res.ok) mpBegin(res);
  else mpShowError(res.error);
}

async function mpJoin() {
  const name = mpReadName();
  if (!name) return;
  const code = (document.getElementById('mp-code').value || '').trim().toUpperCase();
  if (code.length !== 4) { mpShowError('Der Lobby-Code hat 4 Zeichen.'); return; }
  const res = await mpApi('/api/join', { code, name });
  if (res.ok) mpBegin(res);
  else mpShowError(res.error);
}

function mpBegin(res) {
  mp.code = res.code;
  mp.playerId = res.playerId;
  mp.token = res.token;
  mp.error = '';
  mpSaveSession();
  mpConnect();
  mpRenderDialog();
}

// Verlassen. restore = false: der Aufrufer startet selbst einen anderen Modus.
function mpLeave(restore = true) {
  if (mp.code) mpApi('/api/leave', mpAuth());
  mpReset('Du hast die Lobby verlassen.', restore);
}

// Alles zurücksetzen (Lobby verlassen, rausgeflogen oder Server weg)
function mpReset(message, restore = true) {
  if (mp.es) mp.es.close();
  mpClearSession();
  Object.assign(mp, { code: null, playerId: null, token: null, lobby: null, es: null, shots: [], gameId: null, firing: false, connLost: false });
  if (state.mode === 'multi' && restore) loadLevel(state.unlocked);
  if (message) {
    mp.error = message;
    showMessage(message);
  }
  mpRenderDialog();
  updateCatalogVisibility();
}

/* ---------- Live-Verbindung ---------- */

function mpConnect() {
  if (mp.es) mp.es.close();
  const query = new URLSearchParams({ code: mp.code, playerId: mp.playerId, token: mp.token });
  const es = new EventSource('/api/events?' + query);
  mp.es = es;
  es.onmessage = event => mpHandle(JSON.parse(event.data));
  es.onopen = () => { mp.connLost = false; mpRenderCard(); };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) mpReset('Die Lobby gibt es nicht mehr (beendet oder Server gestoppt).');
    else { mp.connLost = true; mpRenderCard(); }   // der Browser verbindet sich von selbst neu
  };
}

function mpHandle(msg) {
  if (msg.serverTime) mp.offset = msg.serverTime - Date.now();
  if (msg.type === 'state') mpOnState(msg.lobby);
  else if (msg.type === 'shot') mpOnShot(msg.shot);
  else if (msg.type === 'kicked') mpReset(msg.reason);
}

function mpOnState(lobby) {
  const prev = mp.lobby;
  mp.lobby = lobby;
  if (lobby.phase === 'playing' && (state.mode !== 'multi' || mp.gameId !== lobby.gameId)) mpEnterGame();
  else if (state.mode === 'multi') mpSyncGame(prev);
  if (state.mode === 'multi' && lobby.phase === 'over' && prev && prev.phase === 'playing') mpShowGameOver();
  mpRenderDialog();
  mpRenderCard();
  updateCatalogVisibility();
  if (state.mode === 'multi') updateHUD();
}

// Neue Runde: Spielfeld vom Server übernehmen
function mpEnterGame() {
  const lobby = mp.lobby;
  mp.gameId = lobby.gameId;
  mp.shots = [];
  if (ui.mpDialog.open) ui.mpDialog.close();
  Object.assign(state, { mode: 'multi', status: 'playing', shot: null, trails: [], particles: [], enemies: [], shotsFired: 0 });
  ui.overlay.hidden = true;
  mpSyncGame(null);
  showCard({ num: 'MULTIPLAYER', name: `Lobby ${lobby.code}`, task: '' });
  buildLevelSelect();
  const me = mpMe();
  showMessage(me ? `Die Runde beginnt! Du bist Spieler ${me.slot + 1} (${me.colorName}).` : 'Die Runde beginnt!', 'good');
  ui.input.focus();
}

// Karte, eigene Position und Teleports aus dem neuen Zustand übernehmen
function mpSyncGame(prev) {
  const lobby = mp.lobby;
  if (lobby.grid) {
    const grid = lobby.grid.map(row => [...row].map(Number));
    state.map = { grid, shots: Infinity, solution: [] };
    state.baseMap = state.map;
  }
  for (const p of lobby.players) {
    const old = prev && prev.players.find(q => q.id === p.id);
    if (!old || old.posVersion === p.posVersion || !p.alive) continue;
    spawnParticles(toCanvasX(p.x), toCanvasY(p.y), 16, [p.color, '#ffffff'], 160);   // taucht hier wieder auf
    if (p.id === mp.playerId) showMessage(`Getroffen! Du hast noch ${p.lives} Leben und bist weggesprungen.`, 'error');
  }
  const me = mpMe();
  if (!me) return;
  const oldMe = prev && prev.players.find(q => q.id === me.id);
  if (oldMe && oldMe.alive && !me.alive) showMessage('Du bist raus! Schau zu, wer gewinnt.', 'error');
  state.player = { x: me.x, y: me.y };
}

/* ---------- Feuern ---------- */

// Darf ich gerade feuern? Ergebnis: { ok, text } – text erscheint in der Statuszeile
function mpCanFire() {
  const lobby = mp.lobby;
  const me = mpMe();
  if (!lobby || lobby.phase !== 'playing' || !me) return { ok: false, text: lobby && lobby.phase === 'over' ? 'Runde vorbei.' : '' };
  if (!me.alive) return { ok: false, text: 'Du bist raus – schau zu, wer gewinnt.' };
  const now = mpNow();
  if (lobby.settings.mode === 'turns') {
    if (lobby.busy) return { ok: false, text: 'Schuss fliegt …' };
    const turn = lobby.turn;
    const left = turn && turn.deadline ? Math.max(0, Math.ceil((turn.deadline - now) / 1000)) : 0;
    if (!turn || turn.playerId !== me.id) {
      const who = turn && mpPlayer(turn.playerId);
      return { ok: false, text: who ? `${who.name} ist am Zug (${left} s)` : 'Warte …' };
    }
    return { ok: true, text: `DEIN ZUG – noch ${left} s` };
  }
  const wait = (me.nextFire - now) / 1000;
  if (wait > 0) return { ok: false, text: `Nachladen … ${formatNumber(wait, 1)} s` };
  return { ok: true, text: 'FEUER BEREIT!' };
}

// Punkte für den Server ausdünnen (zum Zeichnen reicht alle 0,08 Kurvenlänge)
function mpPack(points) {
  const out = [];
  let last = -Infinity;
  points.forEach((p, i) => {
    if (!p || (p.s - last < 0.08 && i !== points.length - 1)) return;
    out.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.s.toFixed(3)]);
    last = p.s;
  });
  return out;
}

async function mpFire() {
  const can = mpCanFire();
  if (!can.ok || mp.firing) { if (can.text) showMessage(can.text, 'error'); return; }
  const input = ui.input.value;
  const result = compileShot(input);
  if (!result.ok) { showMessage(result.error, 'error'); return; }
  const blocked = blockedTypes(result.types);
  if (blocked.length) { showMessage(`In den Einstellungen deaktiviert: ${typeNames(blocked)}.`, 'error'); return; }
  const curve = buildCurve(result.shape, state.player, state.map.grid, result.dir);
  if (curve.error) { showMessage(curve.error, 'error'); return; }

  const arm = curve.arms[0];
  const me = mpMe();
  const targets = mp.lobby.players
    .filter(p => p.alive && p.id !== me.id && !mpTeammate(p, me))          // Teamkollegen werden nicht getroffen
    .map(p => ({ id: p.id, x: p.x, y: p.y, r: mpRadius(p), hp: p.lives, posVersion: p.posVersion }));
  const hits = findHits(curve.arms, targets).map(h => ({ id: h.enemy.id, s: h.s, posVersion: h.enemy.posVersion }));
  // Power-ups, die die Kurve berührt, werden eingesammelt (der Server prüft, wer zuerst da war)
  const items = (mp.lobby.powerups || []).map(u => ({ id: u.id, x: u.x, y: u.y, r: POWERUP_RADIUS, hp: 1 }));
  const pickups = findHits(curve.arms, items).map(h => ({ id: h.enemy.id, s: h.s }));
  const blast = arm.blocked && wallsBreakable() ? blastWall(state.map.grid.map(row => row.slice()), arm.end) : [];

  mp.firing = true;
  updateHUD();
  const res = await mpApi('/api/fire', mpAuth({
    gameId: mp.gameId, input, points: mpPack(arm.points), length: arm.length, hits, blast, endReason: arm.endReason,
    pickups, label: MODE_LABEL[state.inputMode],
  }));
  mp.firing = false;
  if (res.ok) {
    rememberInput(input);
    showMessage('Schuss! ' + originInfo(curve) + ' ' + lengthInfo(curve.arms), 'good');
  }
  else showMessage(res.error, 'error');
  updateHUD();
}

function mpOnShot(shot) {
  shot.points = shot.points.map(([x, y, s]) => ({ x, y, s }));
  const shooter = mpPlayer(shot.shooterId);
  shot.color = shooter ? shooter.color : COLORS.curve;
  shot.slot = shooter ? shooter.slot : 0;
  shot.hitsShown = 0;
  shot.ended = false;
  shot.progress = 0;
  mp.shots.push(shot);
  if (mp.shots.length > MP_KEEP_SHOTS) mp.shots.shift();
  if (!shooter) return;
  spawnParticles(toCanvasX(shooter.x), toCanvasY(shooter.y), 14, ['#fff3a8', shooter.color, '#ffffff'], 220);
  if (shooter.id !== mp.playerId) showMessage(`${shooter.name} feuert: f(x) = ${shot.input}`);
}

/* ---------- Zeichnen (wird von draw() in script.js aufgerufen) ---------- */

function mpAxesColor() {
  const me = mpMe();
  return me ? MP_DARK[me.color] || COLORS.axes : COLORS.axes;
}

// Wird vor dem Zeichnen aufgerufen: Fortschritt jedes Schusses, Funken bei Treffern
// und am Ende. Fertige Schüsse wandern als Spur in die Hintergrund-Ebene (mpDrawTrails).
function mpUpdateShots() {
  const now = mpNow();
  for (const shot of mp.shots) {
    shot.progress = (now - shot.startedAt) / 1000 * SHOT_SPEED;
    const end = shot.points[shot.points.length - 1];
    // Funken genau dann, wenn die Kurve beim getroffenen Spieler ankommt
    while (shot.hitsShown < shot.hits.length && shot.hits[shot.hitsShown].s <= shot.progress) {
      const hit = shot.hits[shot.hitsShown++];
      const p = shot.points.find(q => q.s >= hit.s) || end;
      const target = mpPlayer(hit.id);
      spawnParticles(toCanvasX(p.x), toCanvasY(p.y), 30, [target ? target.color : COLORS.curve, COLORS.ink, '#ffffff'], 280);
    }
    if (!shot.ended && shot.progress >= shot.length) {
      shot.ended = true;
      if (shot.blocked && end) spawnParticles(toCanvasX(end.x), toCanvasY(end.y), 26, [COLORS.wall.base, COLORS.wall.dark, shot.color], 200);
    }
  }
}

// Kennung der fertigen Schüsse – ändert sie sich, wird die Hintergrund-Ebene neu gemalt
function mpTrailKey() {
  return mp.shots.filter(s => s.ended).map(s => s.id).join(',');
}

// Fertige Schüsse als blasse Spur – jeder Spieler mit eigenem Strichmuster
function mpDrawTrails() {
  for (const shot of mp.shots) {
    if (!shot.ended) continue;
    ctx.setLineDash(MP_DASH[shot.slot] || []);
    strokeCurve(shot.points, Infinity, shot.color + '66', 3);
  }
  ctx.setLineDash([]);
}

// Power-ups: Kreis mit Symbol, pulsiert leicht
function mpDrawPowerups() {
  const pulse = 1 + 0.08 * Math.sin(performance.now() / 250);
  for (const u of mp.lobby.powerups || []) {
    const look = POWERUP_LOOK[u.kind];
    if (!look) continue;
    const X = toCanvasX(u.x);
    const Y = toCanvasY(u.y);
    const R = POWERUP_RADIUS * UNIT * pulse;
    ctx.save();
    ctx.beginPath();
    ctx.arc(X, Y, R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = look.color;
    ctx.stroke();
    ctx.font = '800 15px "Segoe UI Emoji", "Segoe UI Symbol", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = look.color;
    ctx.fillText(look.icon, X, Y + 1);
    ctx.restore();
  }
}

function mpDraw() {
  mpDrawPowerups();
  for (const shot of mp.shots) if (!shot.ended) mpDrawShot(shot);
  mpDrawPlayers();
  mpDrawBanner();
}

// Ein fliegender Schuss mit leuchtender Spitze
function mpDrawShot(shot) {
  if (shot.progress <= 0) return;
  strokeCurve(shot.points, shot.progress, COLORS.curveHalo, LINE_WIDTH * UNIT + 5);
  const tip = strokeCurve(shot.points, shot.progress, shot.color, LINE_WIDTH * UNIT);
  if (!tip) return;
  const X = Math.round(toCanvasX(tip.x));
  const Y = Math.round(toCanvasY(tip.y));
  ctx.fillStyle = shot.color;
  ctx.fillRect(X - 7, Y - 7, 14, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X - 3, Y - 3, 6, 6);
}

function mpDrawPlayers() {
  const lobby = mp.lobby;
  if (!lobby) return;
  const turnId = lobby.settings.mode === 'turns' && lobby.turn && !lobby.busy ? lobby.turn.playerId : null;
  for (const p of lobby.players) {
    if (!p.alive) continue;
    const isMe = p.id === mp.playerId;
    const dark = MP_DARK[p.color] || COLORS.ink;
    const r = mpRadius(p) * UNIT;
    const X = Math.round(toCanvasX(p.x));
    const Y = Math.round(toCanvasY(p.y));
    ctx.save();

    // Trefferfläche (so groß wie der Spieler gerade ist)
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color + '33';
    ctx.fill();
    ctx.lineWidth = isMe ? 4 : 2;
    ctx.strokeStyle = p.color;
    ctx.stroke();

    // Wer am Zug ist, bekommt einen drehenden Ring
    if (p.id === turnId) {
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -performance.now() / 40;
      ctx.lineWidth = 3;
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.arc(X, Y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Schild: zweiter, grauer Ring
    if (p.shield) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = POWERUP_LOOK.shield.color;
      ctx.beginPath();
      ctx.arc(X, Y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sprite = spriteFromRows('mp' + p.color, PLAYER_SPRITE, { '#': p.color, 'o': '#ffffff', 'd': dark });
    const scale = r * 1.4 / sprite.width;
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    ctx.drawImage(sprite, X - w / 2, Y - h / 2, w, h);

    // Name und Leben darüber
    const top = Y - r - (p.id === turnId ? 12 : 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLORS.paper;
    ctx.font = '700 16px system-ui, "Segoe UI", sans-serif';
    ctx.fillStyle = p.color;
    label(hearts(p.lives), X, top);
    ctx.font = (isMe ? '800 15px' : '700 14px') + ' system-ui, "Segoe UI", sans-serif';
    ctx.fillStyle = dark;
    label(`${mpSymbol(p)} ${isMe ? 'DU · ' : ''}${p.name}${p.double ? ' ×2' : ''}`, X, top - 17);
    if (lobby.teamsActive && p.team !== null) {
      ctx.font = '600 12px system-ui, "Segoe UI", sans-serif';
      ctx.fillStyle = COLORS.label;
      label(`Team ${TEAM_NAMES[p.team]}`, X, top - 34);
    }
    ctx.restore();
  }
}

// Kasten oben links: wer bin ich, darf ich feuern?
function mpDrawBanner() {
  const me = mpMe();
  if (!me) return;
  const dark = MP_DARK[me.color] || COLORS.ink;
  const status = mpCanFire();
  const team = mp.lobby.teamsActive && me.team !== null ? ` · TEAM ${TEAM_NAMES[me.team].toUpperCase()}` : '';
  const title = `${mpSymbol(me)} DU BIST SPIELER ${me.slot + 1} · ${me.colorName.toUpperCase()}${team}`;
  ctx.save();
  ctx.font = '800 16px system-ui, "Segoe UI", sans-serif';
  const w = Math.max(ctx.measureText(title).width, ctx.measureText(status.text).width) + 28;
  // In eine Ecke, in der kein Spieler (samt Name darüber) und kein Power-up liegt –
  // der Reihe nach: oben links, unten links, unten rechts, oben rechts
  const things = [
    ...mp.lobby.players.filter(p => p.alive).map(p => ({ x: toCanvasX(p.x), y: toCanvasY(p.y) - 20, rx: 45, ry: 50 })),
    ...(mp.lobby.powerups || []).map(u => ({ x: toCanvasX(u.x), y: toCanvasY(u.y), rx: 20, ry: 20 })),
  ];
  const free = (left, top) => !things.some(t => t.x + t.rx > left && t.x - t.rx < left + w && t.y + t.ry > top && t.y - t.ry < top + 62);
  const corners = [[12, 10], [12, HEIGHT - 72], [WIDTH - w - 16, HEIGHT - 72], [WIDTH - w - 16, 10]];
  const [left, top] = corners.find(([l, t]) => free(l, t)) || corners[0];
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(left + 4, top + 4, w, 58);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top, w, 58);
  ctx.fillStyle = me.color;
  ctx.fillRect(left, top, 8, 58);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dark;
  ctx.fillText(title, left + 16, top + 18);
  ctx.font = '700 15px system-ui, "Segoe UI", sans-serif';
  ctx.fillStyle = status.ok ? COLORS.curve : COLORS.label;
  ctx.fillText(status.text, left + 16, top + 42);
  ctx.restore();
}

// Text für die Mausanzeige über einem Spieler (oder null)
function mpHoverText(m) {
  const me = mpMe();
  const lobby = mp.lobby;
  if (!lobby || !me) return null;
  const item = (lobby.powerups || []).find(u => Math.hypot(u.x - m.x, u.y - m.y) <= POWERUP_RADIUS);
  if (item && POWERUP_LOOK[item.kind]) {
    return `${POWERUP_LOOK[item.kind].name} bei (${formatNumber(item.x - me.x)} | ${formatNumber(item.y - me.y)}) – mit deiner Kurve berühren`;
  }
  const p = lobby.players.find(q => q.alive && Math.hypot(q.x - m.x, q.y - m.y) <= mpRadius(q));
  if (!p) return null;
  if (p.id === me.id) return `Das bist du – ${mpSymbol(p)} Spieler ${p.slot + 1} (${p.colorName}) · ${p.lives} Leben`;
  const mate = mpTeammate(p, me) ? ' · dein Team (kein Schaden)' : '';
  return `${mpSymbol(p)} ${p.name} bei (${formatNumber(p.x - me.x)} | ${formatNumber(p.y - me.y)}) · ${p.lives} Leben${mate}`;
}

/* ---------- Statuszeile & Seitenleiste ---------- */

// Wird jedes Bild aufgerufen; aktualisiert die Anzeige nur, wenn sich der Text ändert
function mpTick() {
  const can = mpCanFire();
  const key = can.ok + '|' + can.text + '|' + mp.firing;
  if (key !== mp.hudKey) {
    mp.hudKey = key;
    mpUpdateHUD();
  }
}

function mpUpdateHUD() {
  const can = mpCanFire();
  ui.fireBtn.disabled = !can.ok || mp.firing;
  ui.mpStatus.textContent = can.text;
  ui.mpStatus.className = 'mp-status' + (can.ok ? ' ready' : '');
  ui.fireBar.classList.toggle('my-turn', can.ok);
  // Im Runden-Modus sieht man „Dein Zug“ auch, wenn ein anderer Tab vorne ist
  const myTurn = can.ok && mp.lobby && mp.lobby.settings.mode === 'turns';
  document.title = myTurn ? '▶ Dein Zug! – Function Fighter' : 'Function Fighter';
  // Kommt man an die Reihe, springt der Cursor ins Eingabefeld (wenn kein Fenster offen ist)
  if (myTurn && !mp.wasMyTurn && !document.querySelector('dialog[open]')) ui.input.focus();
  mp.wasMyTurn = myTurn;
}

function mpPlayerRow(p, lobby, kick = false) {
  const tags = [];
  if (p.id === lobby.hostId) tags.push('Host');
  if (lobby.phase === 'playing' && lobby.settings.mode === 'turns' && lobby.turn && lobby.turn.playerId === p.id) tags.push('am Zug');
  if (lobby.phase !== 'lobby' && lobby.gameId > 0 && !p.alive) tags.push('raus');
  if (!p.connected) tags.push('getrennt');
  if (lobby.phase === 'playing' && p.shield) tags.push('Schild');
  if (lobby.phase === 'playing' && p.double) tags.push('×2');
  const lives = lobby.phase === 'lobby' ? '' : `<span class="mp-hearts">${hearts(p.alive ? p.lives : 0)}</span>`;
  const team = lobby.teamsActive && p.team !== null ? ` · Team ${TEAM_NAMES[p.team]}` : '';
  return `<li class="${p.id === mp.playerId ? 'me' : ''}" style="--pc:${p.color}">
    <span class="mp-swatch">${mpSymbol(p)}</span>
    <span class="mp-name">${esc(p.name)}${p.id === mp.playerId ? ' (du)' : ''}<small>Spieler ${p.slot + 1} · ${esc(p.colorName)}${team}</small></span>
    ${lives}<span class="mp-score" title="Siege · Treffer in dieser Lobby">🏆 ${p.wins} · 🎯 ${p.hits}</span>
    ${tags.length ? `<span class="mp-tags">${tags.join(' · ')}</span>` : ''}
    ${kick && p.id !== mp.playerId ? `<button class="btn btn-small mp-kick" data-act="kick" data-id="${p.id}" title="Aus der Lobby entfernen">✕</button>` : ''}</li>`;
}

function mpRenderCard() {
  const lobby = mp.lobby;
  const me = mpMe();
  if (!lobby || !me) return;
  ui.mpCardHead.innerHTML = `
    <div class="level-num">MULTIPLAYER · LOBBY ${esc(lobby.code)}</div>
    <div class="mp-you" style="--pc:${me.color}">
      <span class="mp-swatch big">${mpSymbol(me)}</span>
      <div><small>Du bist</small><b>SPIELER ${me.slot + 1} · ${esc(me.colorName.toUpperCase())}</b>
        <span>${esc(me.name)}${lobby.teamsActive && me.team !== null ? ` · Team ${TEAM_NAMES[me.team]}` : ''}</span></div>
    </div>`;
  const log = [...lobby.log].reverse().slice(0, 6).map(t => `<li>${esc(t)}</li>`).join('');
  const rule = lobby.settings.mode === 'turns'
    ? `Runden · ${lobby.settings.thinkTime} s Bedenkzeit` : `Echtzeit · Feuer alle ${lobby.settings.cooldown} s`;
  ui.mpCardBody.innerHTML = `
    ${mp.connLost ? '<p class="warning">Verbindung unterbrochen – verbinde neu …</p>' : ''}
    <ul class="mp-players">${lobby.players.map(p => mpPlayerRow(p, lobby)).join('')}</ul>
    <p class="small">${rule} · Wände: ${esc(lobby.settings.walls)}${lobby.settings.wallsBreakable ? '' : ' (unzerstörbar)'}${lobby.settings.powerups ? ' · Power-ups' : ''}</p>
    ${log ? `<ul class="mp-log">${log}</ul>` : ''}`;
}

/* ---------- Fenster „Multiplayer“ (Lobby) ---------- */

function mpOpenDialog() {
  if (!ui.mpDialog.open) ui.mpDialog.showModal();
  mpRenderDialog();
  // Einmal beim Server nachfragen, unter welcher Adresse die anderen PCs ihn erreichen
  if (mp.available && !mp.info) {
    fetch('/api/info').then(r => r.json()).then(info => { mp.info = info; mpRenderDialog(); }).catch(() => {});
  }
}

// Links für die anderen PCs (die Netzwerk-Adressen des Server-PCs)
function mpJoinLinks() {
  if (!mp.info || !mp.info.addresses || !mp.info.addresses.length) return '';
  const links = mp.info.addresses.map(ip => `<code>http://${esc(ip)}:${mp.info.port}</code>`).join(' oder ');
  return `<p class="small mp-links">Die anderen PCs öffnen im Browser: ${links}</p>`;
}

function mpShowError(text) {
  mp.error = text || '';
  const el = document.getElementById('mp-error');
  if (el) el.textContent = mp.error;
}

function mpSelect(key, value, enabled) {
  const options = MP_OPTIONS[key].map(([v, text]) => `<option value="${v}"${v === value ? ' selected' : ''}>${text}</option>`).join('');
  return `<select data-setting="${key}"${enabled ? '' : ' disabled'}>${options}</select>`;
}

function mpRenderDialog() {
  if (!ui.mpDialog.open) return;
  let html;
  if (!mp.available) {
    html = `
      <h2>MULTIPLAYER</h2>
      <p>Für den Multiplayer braucht es den kleinen Server, der beim Spiel dabei ist:</p>
      <ol class="rules">
        <li>Im Spielordner <b>start.bat</b> doppelklicken.</li>
        <li>Im schwarzen Fenster steht ein Link wie <code>http://192.168.…:8000</code>.</li>
        <li>Diesen Link auf jedem PC im Browser öffnen, der mitspielen soll.</li>
      </ol>
      <p class="small">Gerade ist das Spiel als Datei geöffnet (file://) – deshalb geht es hier noch nicht.</p>
      <div class="settings-actions"><button class="btn" data-act="close">Schließen</button></div>`;
  } else if (!mp.code) {
    const name = ui.playerName.value.trim();
    html = `
      <h2>MULTIPLAYER</h2>
      <p class="small">Live mit bis zu 4 Spielern im selben Netzwerk.</p>
      ${mpJoinLinks()}
      <label class="mp-field">Dein Name <span class="small">(derselbe wie oben links)</span>
        <input id="mp-name" maxlength="16" value="${esc(name)}" placeholder="Name" autocomplete="nickname" spellcheck="false"></label>
      <div class="mp-choice">
        <div class="mp-box">
          <h3>Neue Lobby</h3>
          <p class="small">Du bist der Host und stellst die Regeln ein.</p>
          <button class="btn btn-primary" data-act="create">Lobby erstellen</button>
        </div>
        <div class="mp-box">
          <h3>Beitreten</h3>
          <input id="mp-code" class="mp-code-input" maxlength="4" placeholder="CODE" autocomplete="off">
          <button class="btn" data-act="join">Beitreten</button>
        </div>
      </div>
      <p class="warning" id="mp-error">${esc(mp.error)}</p>
      <div class="settings-actions"><button class="btn" data-act="close">Schließen</button></div>`;
  } else if (!mp.lobby) {
    html = '<h2>MULTIPLAYER</h2><p>Verbinde mit der Lobby …</p><div class="settings-actions"><button class="btn" data-act="leave">Abbrechen</button></div>';
  } else {
    const lobby = mp.lobby;
    const host = mpIsHost();
    const editable = host && lobby.phase !== 'playing';
    const s = lobby.settings;
    const slots = [0, 1, 2, 3].map(slot => {
      const p = lobby.players.find(q => q.slot === slot);
      return p ? mpPlayerRow(p, lobby, host && lobby.phase !== 'playing') : `<li class="free"><span class="mp-swatch"></span><span class="mp-name">frei<small>Spieler ${slot + 1}</small></span></li>`;
    }).join('');
    const winner = lobby.phase === 'over' ? mpPlayer(lobby.winnerId) : null;
    let footer;
    if (lobby.phase === 'playing') footer = '<p class="small">Die Runde läuft.</p>';
    else if (host) {
      footer = `<button class="btn btn-primary" data-act="start"${lobby.players.length < 2 ? ' disabled' : ''}>${lobby.phase === 'over' ? 'Neue Runde starten' : 'Spiel starten'}</button>` +
        (lobby.players.length < 2 ? '<p class="small">Warte auf mindestens einen Mitspieler …</p>' : '');
    } else footer = '<p class="small">Warte, bis der Host die Runde startet …</p>';
    html = `
      <h2>LOBBY</h2>
      <div class="mp-code-row"><span class="mp-code-big">${esc(lobby.code)}</span>
        <div><p class="small">Diesen Code geben deine Mitspieler unter „Beitreten“ ein.</p>
          <button class="btn btn-small" data-act="copy-code">Code kopieren</button></div></div>
      ${mpJoinLinks()}
      ${lobby.phase === 'over' ? `<p class="mp-winner">${winner ? `🏆 ${esc(winner.name)} hat die letzte Runde gewonnen.` : 'Die letzte Runde ging unentschieden aus.'}</p>` : ''}
      <ul class="mp-players">${slots}</ul>
      ${mpRanking(lobby, host)}
      <fieldset class="endless-settings mp-settings">
        <legend>Einstellungen${host ? '' : ' – stellt der Host ein'}</legend>
        <label>Feuern ${mpSelect('mode', s.mode, editable)}</label>
        ${s.mode === 'turns' ? `<label>Bedenkzeit pro Zug ${mpSelect('thinkTime', s.thinkTime, editable)}</label>`
          : `<label>Feuer-Takt ${mpSelect('cooldown', s.cooldown, editable)}</label>`}
        <label>Wände ${mpSelect('walls', s.walls, editable)}</label>
        <label class="mp-check"><input type="checkbox" data-setting="functionList"${s.functionList ? ' checked' : ''}${editable ? '' : ' disabled'}>
          Funktionsliste im Spiel erlauben</label>
        <label class="mp-check"><input type="checkbox" data-setting="wallsBreakable"${s.wallsBreakable ? ' checked' : ''}${editable ? '' : ' disabled'}>
          Wände zerstörbar – ein Treffer sprengt ein Loch hinein</label>
        <label class="mp-check"><input type="checkbox" data-setting="symmetric"${s.symmetric ? ' checked' : ''}${editable ? '' : ' disabled'}>
          Faire Welt – Wände und Startplätze gespiegelt</label>
        <label class="mp-check"><input type="checkbox" data-setting="teams"${s.teams ? ' checked' : ''}${editable ? '' : ' disabled'}>
          2 gegen 2 – Team Links gegen Team Rechts (nur mit 4 Spielern)</label>
        <label class="mp-check"><input type="checkbox" data-setting="powerups"${s.powerups ? ' checked' : ''}${editable ? '' : ' disabled'}>
          Power-ups: ♥ +1 Leben, 🛡 Schild, ×2 Doppelschuss – mit der Kurve einsammeln</label>
        <label class="mp-check"><input type="checkbox" data-setting="odeModes"${s.odeModes ? ' checked' : ''}${editable ? '' : ' disabled'}>
          Profi-Modi y′ und y″ erlauben</label>
      </fieldset>
      <p class="small">Jeder hat 3 Leben. Wer getroffen wird, wird kleiner und springt an eine andere Stelle in seiner Hälfte bzw. seinem Viertel.</p>
      <p class="warning" id="mp-error">${esc(mp.error)}</p>
      <div class="settings-actions">${footer}</div>
      <div class="settings-actions">
        <button class="btn" data-act="leave">Lobby verlassen</button>
        <button class="btn" data-act="close">Schließen</button>
      </div>`;
  }
  ui.mpDialogBody.innerHTML = html;
}

// Ein Klick-/Änderungs-Handler für das ganze Fenster (der Inhalt wird oft neu gebaut)
function mpDialogClick(event) {
  const act = event.target.dataset.act;
  if (act === 'close') ui.mpDialog.close();
  else if (act === 'create') mpCreate();
  else if (act === 'join') mpJoin();
  else if (act === 'leave') mpLeave();
  else if (act === 'start') mpApi('/api/start', mpAuth()).then(res => { if (!res.ok) mpShowError(res.error); });
  else if (act === 'kick') mpApi('/api/kick', mpAuth({ targetId: event.target.dataset.id })).then(res => { if (!res.ok) mpShowError(res.error); });
  else if (act === 'copy-code') copyText(mp.code).then(() => { event.target.textContent = 'Kopiert ✓'; });
  else if (act === 'reset-scores' && confirm('Siege und Treffer aller Spieler auf 0 setzen?')) mpApi('/api/resetscores', mpAuth());
}

function mpDialogChange(event) {
  const key = event.target.dataset.setting;
  if (!key) return;
  let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  if (key === 'thinkTime' || key === 'cooldown') value = Number(value);
  mpApi('/api/settings', mpAuth({ settings: { [key]: value } })).then(res => { if (!res.ok) mpShowError(res.error); });
}

function mpDialogKey(event) {
  if (event.key === 'Enter' && event.target.id === 'mp-code') mpJoin();
}

// Rangliste der Lobby: Siege, dann Treffer
function mpRanking(lobby, host) {
  if (!lobby.players.some(p => p.wins || p.hits)) return '';
  const sorted = [...lobby.players].sort((a, b) => b.wins - a.wins || b.hits - a.hits);
  const rows = sorted.map((p, i) => `<li style="--pc:${p.color}"><b>${i + 1}.</b> <span class="mp-swatch">${mpSymbol(p)}</span>
    ${esc(p.name)} <span class="small">– ${p.wins} ${p.wins === 1 ? 'Sieg' : 'Siege'}, ${p.hits} Treffer</span></li>`).join('');
  return `<div class="mp-ranking"><h3>🏆 Rangliste</h3><ol>${rows}</ol>
    ${host ? '<button class="btn btn-small" data-act="reset-scores">Punkte zurücksetzen</button>' : ''}</div>`;
}

// Kurzer Punktestand als Text (für das Fenster am Rundenende)
function mpScoreLine(lobby) {
  return [...lobby.players].sort((a, b) => b.wins - a.wins || b.hits - a.hits)
    .map(p => `${mpSymbol(p)} ${p.name} ${p.wins}`).join(' · ');
}

/* ---------- Rundenende ---------- */

function mpShowGameOver() {
  const lobby = mp.lobby;
  const me = mpMe();
  const box = ui.overlay.querySelector('.overlay-box');
  let won, title, text;
  if (lobby.teamsActive) {
    const team = lobby.winnerTeam;
    won = me && team !== null && me.team === team;
    title = team === null ? 'UNENTSCHIEDEN' : won ? 'DEIN TEAM HAT GEWONNEN!' : `TEAM ${TEAM_NAMES[team].toUpperCase()} GEWINNT!`;
    text = team === null ? 'Alle sind raus. ' : `Team ${TEAM_NAMES[team]} hat als Letztes noch Spieler übrig. `;
  } else {
    const winner = mpPlayer(lobby.winnerId);
    won = winner && winner.id === mp.playerId;
    title = winner ? (won ? 'DU HAST GEWONNEN!' : `${winner.name.toUpperCase()} GEWINNT!`) : 'UNENTSCHIEDEN';
    text = winner ? `${mpSymbol(winner)} Spieler ${winner.slot + 1} (${winner.colorName}) ist als Letztes übrig. ` : 'Alle sind raus. ';
  }
  box.className = 'overlay-box ' + (won ? 'won' : 'lost');
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = text + `Siege: ${mpScoreLine(lobby)}. ` +
    (mpIsHost() ? 'Starte in der Lobby eine neue Runde.' : 'Der Host kann in der Lobby eine neue Runde starten.');
  ui.overlayRetry.hidden = true;
  ui.overlayNewmap.hidden = true;
  ui.overlayNext.hidden = true;
  ui.overlayLobby.hidden = false;
  ui.overlay.hidden = false;
  ui.overlayLobby.focus();
}

/* ---------- Start ---------- */

function mpInit() {
  ui.playerName.value = loadValue(MP_NAME, '');
  ui.playerName.addEventListener('input', () => {
    ui.playerName.classList.remove('flash');
    saveValue(MP_NAME, ui.playerName.value.trim());
  });
  // Namensfeld im Multiplayer-Fenster schreibt in das Feld oben (beide sind derselbe Name)
  ui.mpDialogBody.addEventListener('input', event => {
    if (event.target.id !== 'mp-name') return;
    event.target.classList.remove('flash');
    ui.playerName.value = event.target.value;
    saveValue(MP_NAME, event.target.value.trim());
  });
  ui.playerName.addEventListener('change', mpNameChanged);
  ui.playerName.addEventListener('keydown', e => { if (e.key === 'Enter') ui.playerName.blur(); });
  ui.mpDialogBody.addEventListener('click', mpDialogClick);
  ui.mpDialogBody.addEventListener('change', mpDialogChange);
  ui.mpDialogBody.addEventListener('keydown', mpDialogKey);
  ui.mpLeaveBtn.addEventListener('click', () => {
    if (confirm('Lobby wirklich verlassen?')) mpLeave();
  });
  ui.mpLobbyBtn.addEventListener('click', mpOpenDialog);
  ui.overlayLobby.addEventListener('click', mpOpenDialog);
  if (!mp.available) return;
  // Nach einem Neuladen der Seite wieder in dieselbe Lobby
  try {
    const saved = JSON.parse(sessionStorage.getItem(MP_SESSION) || 'null');
    if (saved && saved.code) {
      Object.assign(mp, saved);
      mpConnect();
    }
  } catch { /* egal */ }
}
