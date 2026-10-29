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
       schickt sie an den Server.
     – Jeder sieht sich selbst LINKS: Wer in der rechten Hälfte steht,
       bekommt das Feld gespiegelt angezeigt und rechnet in seinem
       gespiegelten Koordinatensystem (mirrorOf / ownX in script.js).
       Verschickt wird immer in Welt-Koordinaten. Der Server wendet die Treffer an,
       sobald die Kurve beim Ziel ankommt, und teleportiert das Ziel.
   ========================================================== */
'use strict';

// Manaschild = Trefferfläche eines Zauberers: ein fester Kreis um seinen Körper (nicht um die Kugel –
// die Kurve startet weiter am Stab). Er wird bei Treffern nicht kleiner: 3 Leben = Schild ganz,
// 2 = Schild mit Rissen, 1 = Schild zerbrochen (nur noch der Umriss), der nächste Treffer wirft raus.
const MP_SHIELD_RADIUS = 0.75;
const MP_DARK = { '#2f6fdb': '#1b3f8f', '#d64545': '#8f2a18', '#2e9e6a': '#1d6644', '#e08a1a': '#8a4f08' };
const MP_KEEP_SHOTS = 8;                          // so viele Schüsse bleiben als blasse Spur stehen
// Jeder Spieler hat zusätzlich zur Farbe ein Symbol und ein eigenes Strichmuster für seine
// Spuren – so sind die Spieler auch ohne Farben (Farbenblindheit) gut zu unterscheiden.
const MP_SYMBOLS = ['●', '▲', '■', '◆'];
const MP_ICONS = ['circle', 'triangle', 'square', 'diamond'];   // dieselben Symbole als Pixel-Icons
const MP_DASH = [[], [5, 3], [1, 2], [5, 2, 1, 2]];      // in Kunst-Pixeln: durchgezogen, gestrichelt, gepunktet, Strich-Punkt
const TEAM_NAMES = ['Links', 'Rechts'];
const POWERUP_RADIUS = 0.5;                       // so nah muss die Kurve kommen, um es einzusammeln
const POWERUP_LOOK = {
  life: { sprite: 'heart', color: '#e0393e', name: '+1 Leben' },
  shield: { sprite: 'shield', color: '#5b6b8c', name: 'Schutzzauber' },
  double: { text: '×2', color: '#e0218a', name: 'Doppelschuss' },
};
// Kleine Bilder in den Power-up-Blasen ('#' = Farbe des Power-ups)
const POWERUP_SPRITES = {
  heart: ['.#.#.', '#####', '.###.', '..#..'],
  shield: ['#####', '#####', '#####', '.###.', '..#..'],
};
const MP_SESSION = 'functionFighter.mp';
const MP_NAME = 'functionFighter.name';

// Auswahlmöglichkeiten der Lobby-Einstellungen (müssen zu ALLOWED_SETTINGS in server.py passen)
const MP_OPTIONS = {
  mode: [['turns', 'Runden'], ['realtime', 'Echtzeit']],
  thinkTime: [[10, '10 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s']],
  cooldown: [[2, '2 s'], [3, '3 s'], [5, '5 s']],
  walls: [['keine', 'keine'], ['wenig', 'wenig'], ['mittel', 'mittel'], ['viel', 'viel']],
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
// Mitte des Manaschilds in Welt-Koordinaten (der Körper steht in der eigenen Blickrichtung hinter dem Stab)
const mpShieldCenter = p => ({ x: p.x + mirrorOf(p) * WIZARD_BODY.x, y: p.y + WIZARD_BODY.y });
const hearts = lives => icon('heart').repeat(Math.max(0, lives)) + icon('heart', 'empty').repeat(Math.max(0, 3 - lives));
const mpSymbol = p => MP_SYMBOLS[p.slot] || '●';
const mpSymbolIcon = p => icon(MP_ICONS[p.slot] || 'circle');
const mpTeammate = (a, b) => !!a && !!b && a.team !== null && a.team !== undefined && a.team === b.team;

async function mpApi(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { ok: false, error: 'Server antwortet nicht (start.bat?)' };
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
    mpShowError('Name fehlt');
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
  if (code.length !== 4) { mpShowError('Code hat 4 Zeichen'); return; }
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
  mpReset('Lobby verlassen', restore);
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
    if (es.readyState === EventSource.CLOSED) mpReset('Lobby beendet');
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
  showCard({ num: 'MULTIPLAYER', name: `Lobby ${lobby.code}` });
  buildLevelSelect();
  showMessage('Los!', 'good');
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
    if (p.id === mp.playerId) showMessage('Getroffen!', 'error');
  }
  const me = mpMe();
  if (!me) return;
  const oldMe = prev && prev.players.find(q => q.id === me.id);
  if (oldMe && oldMe.alive && !me.alive) showMessage('Du bist raus', 'error');
  state.player = { x: me.x, y: me.y };
}

/* ---------- Feuern ---------- */

// Darf ich gerade feuern? Ergebnis: { ok, text } – text erscheint in der Statuszeile
function mpCanFire() {
  const lobby = mp.lobby;
  const me = mpMe();
  if (!lobby || lobby.phase !== 'playing' || !me) return { ok: false, text: lobby && lobby.phase === 'over' ? 'Runde vorbei' : '' };
  if (!me.alive) return { ok: false, text: 'Du bist raus' };
  const now = mpNow();
  if (lobby.settings.mode === 'turns') {
    if (lobby.busy) return { ok: false, text: 'Schuss fliegt …' };
    const turn = lobby.turn;
    const left = turn && turn.deadline ? Math.max(0, Math.ceil((turn.deadline - now) / 1000)) : 0;
    if (!turn || turn.playerId !== me.id) {
      const who = turn && mpPlayer(turn.playerId);
      return { ok: false, text: who ? `${who.name} · ${left} s` : 'Warte …' };
    }
    return { ok: true, text: `DEIN ZUG · ${left} s` };
  }
  const wait = (me.nextFire - now) / 1000;
  if (wait > 0) return { ok: false, text: `Nachladen ${formatNumber(wait, 1)} s` };
  return { ok: true, text: 'FEUER!' };
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
  if (!result.ok) { rejectShot(result.error); return; }
  const blocked = blockedTypes(result.types);
  if (blocked.length) { rejectShot(`Aus: ${typeNames(blocked)}`); return; }
  const curve = buildCurve(result.shape, state.player, state.map.grid, result.dir);
  if (curve.error) { rejectShot(curve.error); return; }

  const arm = curve.arms[0];
  const me = mpMe();
  const targets = mp.lobby.players
    .filter(p => p.alive && p.id !== me.id && !mpTeammate(p, me))          // Teamkollegen werden nicht getroffen
    .map(p => ({ id: p.id, ...mpShieldCenter(p), r: MP_SHIELD_RADIUS, hp: p.lives, posVersion: p.posVersion }));
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
    showMessage('');
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
  if (shooter.id !== mp.playerId) showMessage(`${shooter.name}: ${shot.input}`);
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

// Farbe a mit Anteil t über Farbe b gelegt (beide '#rrggbb') – deckend, damit sich Pixel nicht aufaddieren
function mpMix(a, b, t) {
  const n = (c, k) => parseInt(c.slice(1 + 2 * k, 3 + 2 * k), 16);
  return '#' + [0, 1, 2].map(k => Math.round(n(a, k) * t + n(b, k) * (1 - t)).toString(16).padStart(2, '0')).join('');
}

// Fertige Schüsse als blasse Spur – jeder Spieler mit eigenem Strichmuster
function mpDrawTrails() {
  for (const shot of mp.shots) {
    if (!shot.ended) continue;
    const dash = MP_DASH[shot.slot];
    stampPath(pixelPath(shot.points), Infinity, mpMix(shot.color, COLORS.paper, 0.4), curveWidth(), dash && dash.length ? dash : null);
  }
}

// Pixel-Kreis mit Radius R Kunst-Pixeln: Füllung (darf durchsichtig sein) und 1 Pixel Rand
function mpDiscSprite(R, fillColor, lineColor) {
  const key = `disc|${R}|${fillColor}|${lineColor}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const size = 2 * R;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && (x + 0.5 - R) ** 2 + (y + 0.5 - R) ** 2 <= R * R;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      g.fillStyle = edge ? lineColor : fillColor;
      g.fillRect(x, y, 1, 1);
    }
  }
  spriteCache.set(key, sprite);
  return sprite;
}

// Ring mit Radius R um den Bildschirmpixel (cx, cy), gezeichnet aus Quadraten mit P Bildschirmpixeln
// Kantenlänge; segments > 0: gestrichelt und drehend
function mpRing(cx, cy, R, color, segments = 0, P = pix.K) {
  const turn = performance.now() / 1500;
  ctx.fillStyle = color;
  for (let j = -R - 1; j <= R; j++) {
    for (let i = -R - 1; i <= R; i++) {
      const d = Math.hypot(i + 0.5, j + 0.5);
      if (Math.abs(d - R) > 0.5) continue;
      if (segments && Math.floor((Math.atan2(j + 0.5, i + 0.5) / (2 * Math.PI) + turn) * segments * 2) % 2) continue;
      ctx.fillRect(cx + i * P, cy + j * P, P, P);
    }
  }
}

// Manaschild als kleines Bild (Radius R in Schild-Pixeln): lives 3 = ganz (Füllung, heller Rand,
// Glanzlicht), 2 = Risse (Rand mit Lücken, Sprünge), 1 = zerbrochen (nur gepunkteter Umriss)
function mpShieldSprite(R, color, lives) {
  const state = lives >= 3 ? 'full' : lives === 2 ? 'cracked' : 'broken';
  const key = 'shield|' + R + '|' + color + '|' + state;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const size = 2 * R;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && (x + 0.5 - R) ** 2 + (y + 0.5 - R) ** 2 <= R * R;
  const rim = mpMix(color, '#ffffff', 0.45);
  const isEdge = (x, y) => inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      const edge = isEdge(x, y);
      const inner = !edge && (isEdge(x - 1, y) || isEdge(x + 1, y) || isEdge(x, y - 1) || isEdge(x, y + 1));
      const angle = Math.atan2(y + 0.5 - R, x + 0.5 - R);
      let paint = null;
      if (state === 'full') paint = edge ? color : inner ? rim : color + '33';
      else if (state === 'cracked') {
        const gap = Math.floor((angle / Math.PI + 1) * 7) % 3 === 0;   // Lücken im Rand
        paint = edge ? (gap ? null : color) : inner && !gap ? rim + '99' : color + '1a';
      } else if (edge && (x + y) % 3 === 0) paint = color + 'cc';     // nur noch die Trefferfläche
      if (paint) { g.fillStyle = paint; g.fillRect(x, y, 1, 1); }
    }
  }
  if (state === 'full') {   // Glanzlicht oben links
    g.fillStyle = '#ffffffb0';
    for (let k = 0; k < Math.max(2, Math.round(R / 3)); k++) g.fillRect(Math.round(R * 0.45) + k, Math.round(R * 0.3) - Math.floor(k / 2), 1, 1);
  }
  if (state === 'cracked') {   // zwei Sprünge vom Rand nach innen
    g.fillStyle = color;
    for (let k = 0; k < Math.round(R * 0.45); k++) {
      g.fillRect(size - 2 - k, Math.round(R * 0.5) + (k % 2), 1, 1);
      g.fillRect(Math.round(R * 0.35) + (k % 2), size - 2 - k, 1, 1);
    }
  }
  spriteCache.set(key, sprite);
  return sprite;
}

// Power-ups: Blase mit Bild, schwebt leicht auf und ab
function mpDrawPowerups() {
  const bob = Math.round(Math.sin(performance.now() / 300));
  for (const u of mp.lobby.powerups || []) {
    const look = POWERUP_LOOK[u.kind];
    if (!look) continue;
    const R = Math.max(4, Math.round(POWERUP_RADIUS * pix.A));
    const ci = Math.round(artX(u.x));
    const cj = Math.round(artY(u.y)) + bob;
    blit(mpDiscSprite(R, '#ffffff', look.color), ci - R, cj - R);
    if (look.sprite) {
      const sprite = spriteFromRows('pu|' + u.kind, POWERUP_SPRITES[look.sprite], { '#': look.color });
      blit(sprite, ci - Math.floor(sprite.width / 2), cj - Math.floor(sprite.height / 2));
    } else {
      pixelText(look.text, ci * pix.K, cj * pix.K + 5 * pix.S, look.color, { align: 'center' });
    }
  }
}

function mpDraw() {
  mpDrawPowerups();
  for (const shot of mp.shots) if (!shot.ended) mpDrawShot(shot);
  mpDrawPlayers();
  mpDrawBanner();
}

// Ein fliegender Schuss mit funkelnder Spitze
function mpDrawShot(shot) {
  if (shot.progress <= 0) return;
  const cells = pixelPath(shot.points);
  stampPath(cells, shot.progress, COLORS.curveHalo, haloWidth());
  const tip = stampPath(cells, shot.progress, shot.color, curveWidth());
  if (tip && shot.progress < shot.length) drawSparkle(Math.round(tip.x / pix.K), Math.round(tip.y / pix.K), shot.color);
}

// Pixel-Icon passend zur Schrift (1 Raster-Pixel = 2 · pix.T Bildschirmpixel, ganzzahlig → scharf), linke obere Ecke (x, y)
function mpSmallIcon(name, x, y, color) {
  const sprite = spriteFromRows('icon|' + name + '|' + color, ICONS[name], { '#': color });
  ctx.drawImage(sprite, Math.round(x), Math.round(y), sprite.width * 2 * pix.T, sprite.height * 2 * pix.T);
}

function mpDrawPlayers() {
  const lobby = mp.lobby;
  if (!lobby) return;
  const { K, T, S } = pix;
  const P = wizardPixel();   // Schild und Ringe in derselben Pixelgröße wie der Zauberer
  const gap = 19 * T;        // Symbol (7 Raster-Pixel à 2 · T) + Abstand bis zum Namen
  const turnId = lobby.settings.mode === 'turns' && lobby.turn && !lobby.busy ? lobby.turn.playerId : null;
  for (const p of lobby.players) {
    if (!p.alive) continue;
    const isMe = p.id === mp.playerId;
    const dark = MP_DARK[p.color] || COLORS.ink;
    const center = mpShieldCenter(p);
    const cx = screenX(center.x);
    const cy = screenY(center.y);
    const R = Math.max(4, Math.round(MP_SHIELD_RADIUS * pix.U / P));   // in Schild-Pixeln

    // Manaschild (= Trefferfläche) hinter dem Zauberer, darum der Schutzzauber und – wer am Zug ist – ein drehender Ring
    ctx.drawImage(mpShieldSprite(R, p.color, p.lives), cx - R * P, cy - R * P, 2 * R * P, 2 * R * P);
    if (p.shield) mpRing(cx, cy, R + 2, POWERUP_LOOK.shield.color, 0, P);
    if (p.id === turnId) mpRing(cx, cy, R + 4, dark, 8, P);

    // Jeder schaut in seine eigene x-Richtung (wer gespiegelt spielt, schaut in der Welt nach links);
    // die Kugel am Stab ist sein Nullpunkt
    drawWizard(screenX(p.x), screenY(p.y), p.color, dark, p.color, mirrorOf(p) * viewMirror());
    const top = Math.floor((cy - (R + (p.id === turnId ? 5 : p.shield ? 3 : 1)) * P) / K);   // Kunst-Pixel

    // Leben als Herzen, darüber Symbol + Name, darüber das Team
    const ci = Math.round(cx / K);
    drawHearts(ci, top - 1, p.lives, 3);
    const name = `${isMe ? 'DU · ' : ''}${p.name}${p.double ? ' ×2' : ''}`;
    const w = textWidth(name) + gap;
    const x = Math.round(ci * K - w / 2);
    const base = Math.round((top - 6) * K - 2 * S);
    mpSmallIcon(MP_ICONS[p.slot] || 'circle', x, base - 14 * T, dark);
    pixelText(name, x + gap, base, dark, { outline: COLORS.paper });
    if (lobby.teamsActive && p.team !== null) {
      pixelText(`Team ${TEAM_NAMES[p.team]}`, ci * K, base - 13 * S, COLORS.label, { align: 'center', outline: COLORS.paper });
    }
  }
}

// Kasten in einer Ecke: wer bin ich, darf ich feuern?
function mpDrawBanner() {
  const me = mpMe();
  if (!me) return;
  const { K, T, S } = pix;
  const dark = MP_DARK[me.color] || COLORS.ink;
  const status = mpCanFire();
  const team = mp.lobby.teamsActive && me.team !== null ? ` · TEAM ${TEAM_NAMES[me.team].toUpperCase()}` : '';
  const title = `SPIELER ${me.slot + 1} · ${me.colorName.toUpperCase()}${team}`;
  const w = Math.round(Math.max(textWidth(title) + 19 * T, textWidth(status.text)) + 22 * S);
  const h = Math.round(34 * S);
  // In eine Ecke, in der kein Spieler (samt Name darüber) und kein Power-up liegt –
  // der Reihe nach: oben links, unten links, unten rechts, oben rechts
  const things = [
    ...mp.lobby.players.filter(p => p.alive).map(p => ({ x: artX(p.x) * K, y: artY(p.y) * K - 8 * K, rx: 18 * K, ry: 22 * K })),
    ...(mp.lobby.powerups || []).map(u => ({ x: artX(u.x) * K, y: artY(u.y) * K, rx: 8 * K, ry: 8 * K })),
  ];
  const free = (left, top) => !things.some(t => t.x + t.rx > left && t.x - t.rx < left + w && t.y + t.ry > top && t.y - t.ry < top + h);
  const m = 10 * T;
  const corners = [[m, m], [m, canvas.height - h - m], [canvas.width - w - m, canvas.height - h - m], [canvas.width - w - m, m]];
  const [left, top] = corners.find(([l, t]) => free(l, t)) || corners[0];
  pixelPanel(left, top, w, h, COLORS.parchment);
  ctx.fillStyle = me.color;
  ctx.fillRect(left, top, 4 * T, h);
  mpSmallIcon(MP_ICONS[me.slot] || 'circle', left + 10 * S, top + 13 * S - 14 * T, dark);
  pixelText(title, left + 10 * S + 19 * T, top + 13 * S, dark);
  pixelText(status.text, left + 10 * S, top + 29 * S, status.ok ? COLORS.curve : COLORS.label);
}

// Text für die Mausanzeige über einem Spieler (oder null)
function mpHoverText(m) {
  const me = mpMe();
  const lobby = mp.lobby;
  if (!lobby || !me) return null;
  const item = (lobby.powerups || []).find(u => Math.hypot(u.x - m.x, u.y - m.y) <= POWERUP_RADIUS);
  if (item && POWERUP_LOOK[item.kind]) {
    return `${POWERUP_LOOK[item.kind].name} ${placeText(item.x, item.y)}`;
  }
  const p = lobby.players.find(q => {
    const c = mpShieldCenter(q);
    return q.alive && Math.hypot(c.x - m.x, c.y - m.y) <= MP_SHIELD_RADIUS;
  });
  if (!p) return null;
  if (p.id === me.id) return 'Du (0 | 0)';
  return `${p.name} ${placeText(p.x, p.y)}${mpTeammate(p, me) ? ' · Team' : ''}`;
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
  document.title = myTurn ? '▶ Dein Zug – Function Fighter' : 'Function Fighter';
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
    <span class="mp-swatch">${mpSymbolIcon(p)}</span>
    <span class="mp-name">${esc(p.name)}${p.id === mp.playerId ? ' (du)' : ''}${team}</span>
    ${lives}<span class="mp-score" title="Siege · Treffer in dieser Lobby">${icon('trophy')} ${p.wins} · ${icon('target')} ${p.hits}</span>
    ${tags.length ? `<span class="mp-tags">${tags.join(' · ')}</span>` : ''}
    ${kick && p.id !== mp.playerId ? `<button class="btn btn-small mp-kick" data-act="kick" data-id="${p.id}" title="Entfernen">${icon('close')}</button>` : ''}</li>`;
}

function mpRenderCard() {
  const lobby = mp.lobby;
  const me = mpMe();
  if (!lobby || !me) return;
  ui.mpCardHead.innerHTML = `
    <div class="level-num">LOBBY ${esc(lobby.code)}</div>
    <div class="mp-you" style="--pc:${me.color}">
      <span class="mp-swatch big">${mpSymbolIcon(me)}</span>
      <div><b>SPIELER ${me.slot + 1} · ${esc(me.colorName.toUpperCase())}</b>
        <span>${esc(me.name)}${lobby.teamsActive && me.team !== null ? ` · Team ${TEAM_NAMES[me.team]}` : ''}</span></div>
    </div>`;
  const log = [...lobby.log].reverse().slice(0, 5).map(t => `<li>${esc(t)}</li>`).join('');
  ui.mpCardBody.innerHTML = `
    ${mp.connLost ? '<p class="warning">Verbindung weg …</p>' : ''}
    <ul class="mp-players">${lobby.players.map(p => mpPlayerRow(p, lobby)).join('')}</ul>
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
  const links = mp.info.addresses.map(ip => `<code>http://${esc(ip)}:${mp.info.port}</code>`).join(' ');
  return `<p class="small mp-links">Link für die anderen: ${links}</p>`;
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
  const close = `<button class="btn btn-small dlg-close" data-act="close" title="Schließen">${icon('close')}</button>`;
  if (!mp.available) {
    html = `${close}
      <h2>Multiplayer</h2>
      <p><code>start.bat</code> starten und den Link öffnen, der dort steht.</p>`;
  } else if (!mp.code) {
    const name = ui.playerName.value.trim();
    html = `${close}
      <h2>Multiplayer</h2>
      <label class="mp-field" title="Name">${icon('user')}
        <input id="mp-name" maxlength="16" value="${esc(name)}" placeholder="Name" autocomplete="nickname" spellcheck="false"></label>
      <div class="mp-choice">
        <div class="mp-box">
          <h3>Neue Lobby</h3>
          <button class="btn btn-primary" data-act="create">Erstellen</button>
        </div>
        <div class="mp-box">
          <h3>Beitreten</h3>
          <input id="mp-code" class="mp-code-input" maxlength="4" placeholder="CODE" autocomplete="off">
          <button class="btn" data-act="join">Beitreten</button>
        </div>
      </div>
      ${mpJoinLinks()}
      <p class="warning" id="mp-error">${esc(mp.error)}</p>`;
  } else if (!mp.lobby) {
    html = `<h2>Multiplayer</h2><p>Verbinde …</p><div class="settings-actions"><button class="btn" data-act="leave">Abbrechen</button></div>`;
  } else {
    const lobby = mp.lobby;
    const host = mpIsHost();
    const editable = host && lobby.phase !== 'playing';
    const s = lobby.settings;
    const slots = [0, 1, 2, 3].map(slot => {
      const p = lobby.players.find(q => q.slot === slot);
      return p ? mpPlayerRow(p, lobby, host && lobby.phase !== 'playing') : `<li class="free"><span class="mp-swatch"></span><span class="mp-name">frei</span></li>`;
    }).join('');
    const winner = lobby.phase === 'over' ? mpPlayer(lobby.winnerId) : null;
    let footer = '';
    if (host && lobby.phase !== 'playing') {
      footer = `<button class="btn btn-primary" data-act="start"${lobby.players.length < 2 ? ' disabled' : ''}>${icon('play')} ${lobby.phase === 'over' ? 'Neue Runde' : 'Start'}</button>`;
    } else if (!host && lobby.phase !== 'playing') footer = '<p class="small">Warte auf den Host …</p>';
    const check = (key, text) => `<label class="mp-check"><input type="checkbox" data-setting="${key}"${s[key] ? ' checked' : ''}${editable ? '' : ' disabled'}> ${text}</label>`;
    html = `${close}
      <h2>Lobby</h2>
      <div class="mp-cols"><div>
      <div class="mp-code-row"><span class="mp-code-big">${esc(lobby.code)}</span>
        <button class="btn btn-small" data-act="copy-code" title="Code kopieren">${icon('copy')}</button></div>
      ${mpJoinLinks()}
      ${winner ? `<p class="mp-winner">${icon('trophy')} ${esc(winner.name)}</p>` : ''}
      <ul class="mp-players">${slots}</ul>
      ${mpRanking(lobby, host)}
      </div><div>
      <div class="mp-settings">
        <label>Modus ${mpSelect('mode', s.mode, editable)}</label>
        ${s.mode === 'turns' ? `<label>Bedenkzeit ${mpSelect('thinkTime', s.thinkTime, editable)}</label>`
          : `<label>Nachladen ${mpSelect('cooldown', s.cooldown, editable)}</label>`}
        <label>Wände ${mpSelect('walls', s.walls, editable)}</label>
        ${check('wallsBreakable', 'Wände zerstörbar')}
        ${check('symmetric', 'Faire Welt (gespiegelt)')}
        ${check('teams', '2 gegen 2')}
        ${check('powerups', `Power-ups ${icon('heart')} ${icon('shield', 'shield')} ×2`)}
        ${check('functionList', 'Funktionsliste')}
        ${check('odeModes', 'y′ und y″')}
      </div>
      <p class="warning" id="mp-error">${esc(mp.error)}</p>
      <div class="settings-actions">${footer}<button class="btn" data-act="leave">Verlassen</button></div>
      </div></div>`;
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
  else if (act === 'copy-code') copyText(mp.code).then(() => { event.target.innerHTML = icon('check'); });
  else if (act === 'reset-scores' && confirm('Punkte auf 0 setzen?')) mpApi('/api/resetscores', mpAuth());
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
  const rows = sorted.map((p, i) => `<li style="--pc:${p.color}"><b>${i + 1}.</b> <span class="mp-swatch">${mpSymbolIcon(p)}</span>
    ${esc(p.name)} <span class="mp-score">${icon('trophy')} ${p.wins} · ${icon('target')} ${p.hits}</span></li>`).join('');
  return `<div class="mp-ranking"><h3>${icon('trophy')} Rangliste</h3><ol>${rows}</ol>
    ${host ? '<button class="btn btn-small" data-act="reset-scores">Zurücksetzen</button>' : ''}</div>`;
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
  let won, title;
  if (lobby.teamsActive) {
    const team = lobby.winnerTeam;
    won = me && team !== null && me.team === team;
    title = team === null ? 'Unentschieden' : won ? 'Sieg!' : `Team ${TEAM_NAMES[team]} gewinnt`;
  } else {
    const winner = mpPlayer(lobby.winnerId);
    won = winner && winner.id === mp.playerId;
    title = winner ? (won ? 'Sieg!' : `${winner.name} gewinnt`) : 'Unentschieden';
  }
  box.className = 'overlay-box ' + (won ? 'won' : 'lost');
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = mpScoreLine(lobby);
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
