#!/usr/bin/env python3
"""
FUNCTION FIGHTER – Multiplayer-Server

Startet einen kleinen Webserver, der das Spiel ausliefert und Lobbys für den
Live-Multiplayer verwaltet. Es wird NUR die Python-Standardbibliothek benutzt –
nichts muss installiert werden. Am einfachsten mit start.bat starten.

Aufbau:
  1. Einstellungen & Konstanten
  2. Spielwelt: Positionen, Wände, Teleport
  3. Lobbys: Zustand, Senden an alle Spieler
  4. Spiel-Logik: Start, Schüsse, Treffer, Züge (läuft im Takt-Thread)
  5. HTTP: statische Dateien, API (POST) und Live-Updates (Server-Sent Events)
  6. Start: freien Port suchen, Links anzeigen

Wer trifft, rechnet der Browser des Schützen aus (dieselbe Mathematik wie im
Einzelspieler). Der Server prüft, ob der Schuss erlaubt ist (am Zug, nachgeladen),
und wendet Treffer genau dann an, wenn die Kurve beim Ziel ankommt.
"""
import json
import math
import os
import queue
import random
import secrets
import socket
import socketserver
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

# ==========================================================
# 1. EINSTELLUNGEN & KONSTANTEN
# ==========================================================

ROOT = os.path.dirname(os.path.abspath(__file__))
PORTS = range(8000, 8011)          # der erste freie Port wird genommen

COLS, ROWS = 50, 30                # Spielfeld wie in script.js (x −25…25, y −15…15)
EMPTY, WALL = 0, 4
SHOT_SPEED = 25.0                  # Kurvenlänge pro Sekunde (wie SHOT_SPEED in script.js)
MAX_PLAYERS = 4
START_LIVES = 3
TURN_PAUSE = 0.8                   # Sekunden Pause nach einem Schuss, bevor der nächste dran ist
LOBBY_IDLE = 30                    # so lange ohne Verbindung im Warteraum -> Spieler fliegt raus
GAME_IDLE = 90                     # … während eines Spiels
OFFLINE_SKIP = 3                   # Zug eines nicht verbundenen Spielers wird nach so vielen Sekunden übersprungen
LOG_LENGTH = 12                    # so viele Einträge merkt sich der Verlauf

# Power-ups: werden eingesammelt, wenn die eigene Kurve sie berührt
POWERUP_KINDS = ('life', 'shield', 'double')   # +1 Leben, Schild gegen den nächsten Treffer, nächster Schuss doppelt
POWERUP_NAMES = {'life': '+1 Leben', 'shield': 'Schutzzauber', 'double': 'Doppelschuss'}
POWERUP_EVERY = 15                 # alle so viele Sekunden erscheinen neue
POWERUP_MAX = 4                    # höchstens so viele liegen gleichzeitig auf dem Feld
SHOT_LABELS = ('f(x) = ', "y' = ", "y'' = ")   # Modus des Schusses (für den Verlauf)

PLAYER_COLORS = [('#2f6fdb', 'Blau'), ('#d64545', 'Rot'), ('#2e9e6a', 'Grün'), ('#e08a1a', 'Orange')]

# Wanddichte: so viele Wandstücke werden gesetzt (Mauerstücke 2–5 lang, Türme 2×2 oder Ecken, siehe wall_shape)
WALL_PIECES = {'keine': 0, 'wenig': 18, 'mittel': 32, 'viel': 50}
WALL_KEEP_FREE = 3                 # so viele Kästchen-Ringe bleiben um jeden Startplatz frei (Platz fürs Manaschild)

DEFAULT_SETTINGS = {
    'mode': 'realtime',     # 'turns' = nacheinander mit Bedenkzeit, 'realtime' = alle gleichzeitig
    'thinkTime': 30,        # Sekunden pro Zug (Runden-Modus)
    'cooldown': 3,          # Sekunden zwischen zwei Schüssen (Echtzeit-Modus)
    'walls': 'mittel',
    'functionList': True,   # darf die Funktionsliste geöffnet werden?
    'symmetric': True,      # faire Welt: Wände gespiegelt (Startplätze sind immer zufällig)
    'wallsBreakable': True, # sprengen Treffer Löcher in Wände?
    'teams': False,         # 2 gegen 2 (nur bei 4 Spielern): links gegen rechts
    'powerups': True,       # Power-ups auf dem Feld
    'odeModes': True,       # Profi-Modi y′ und y″ erlaubt
}
ALLOWED_SETTINGS = {
    'mode': ('turns', 'realtime'),
    'thinkTime': (10, 20, 30, 45, 60),
    'cooldown': (2, 3, 5),
    'walls': tuple(WALL_PIECES),
    'functionList': (True, False),
    'symmetric': (True, False),
    'wallsBreakable': (True, False),
    'teams': (True, False),
    'powerups': (True, False),
    'odeModes': (True, False),
}

# Bereiche, in denen die Spieler stehen (Kreuz-Indizes: Spalte c 0…50, Zeile r 0…30).
# 2 Spieler: linke / rechte Hälfte, 3–4 Spieler: je ein Viertel.
HALVES = [(3, 22, 3, 27), (28, 47, 3, 27)]
QUADRANTS = [(3, 22, 3, 13), (28, 47, 3, 13), (3, 22, 17, 27), (28, 47, 17, 27)]

CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   # ohne 0/O und 1/I, damit man sie nicht verwechselt

lock = threading.RLock()   # schützt alle Lobbys
lobbies = {}
server_port = None         # wird beim Start gesetzt (für die Links im Lobby-Fenster)


def now_ms(t=None):
    return int((time.time() if t is None else t) * 1000)


# ==========================================================
# 2. SPIELWELT: POSITIONEN, WÄNDE, TELEPORT
# ==========================================================

def cheb(a, b):
    """Schachbrett-Abstand zweier Punkte (Kästchen-Ringe)."""
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def area_free(grid, c, r):
    """Ist um das Kreuz (c, r) Platz – der 2×2-Block und ein Ring drumherum ohne Wand?"""
    for rr in range(r - 2, r + 2):
        for cc in range(c - 2, c + 2):
            if 0 <= rr < ROWS and 0 <= cc < COLS and grid[rr][cc] == WALL:
                return False
    return True


def pick_cross(grid, region, avoid, old=None):
    """Zufälliges freies Kreuz im Bereich: weg von anderen Spielern und (beim Teleport) vom alten Platz."""
    c0, c1, r0, r1 = region
    for attempt in range(600):
        c, r = random.randint(c0, c1), random.randint(r0, r1)
        if not area_free(grid, c, r):
            continue
        if any(cheb((c, r), a) < 4 for a in avoid):
            continue
        if old is not None and attempt < 400 and cheb((c, r), old) < 5:
            continue
        return c, r
    for c in range(c0, c1 + 1):                 # Notlösung: irgendein freies Kreuz
        for r in range(r0, r1 + 1):
            if area_free(grid, c, r):
                return c, r
    return (c0 + c1) // 2, (r0 + r1) // 2


def mirror_cells(cells, mirrors):
    """Kästchen samt Spiegelbildern. mirrors: 1 = keine, 2 = an der y-Achse, 4 = an beiden Achsen.
    Gespiegelt wird an der y-Achse, weil jeder Spieler sich links sieht (wer rechts steht, sieht das
    Feld gespiegelt) – so hat jeder in seiner eigenen Ansicht genau dasselbe Bild."""
    out = set(cells)
    for c, r in cells:
        if mirrors == 2:
            out.add((COLS - 1 - c, r))
        elif mirrors == 4:
            out |= {(COLS - 1 - c, r), (c, ROWS - 1 - r), (COLS - 1 - c, ROWS - 1 - r)}
    return out


def wall_shape():
    """Zufällige Form eines Wandstücks, Kästchen relativ zu (0, 0): Mauerstück (2–5 lang),
    Turm (2×2) oder Ecke (L) – waagerecht oder senkrecht, in beliebige Richtung gedreht."""
    roll = random.random()
    if roll < 0.55:
        cells = [(i, 0) for i in range(random.randint(2, 5))]
    elif roll < 0.75:
        cells = [(0, 0), (1, 0), (0, 1), (1, 1)]
    else:
        cells = [(i, 0) for i in range(random.randint(2, 4))] + [(0, j) for j in range(1, random.randint(2, 3))]
    if random.random() < 0.5:
        cells = [(r, c) for c, r in cells]
    sx, sy = random.choice((1, -1)), random.choice((1, -1))
    return [(sx * c, sy * r) for c, r in cells]


def make_walls(grid, crosses, pieces, mirrors=1):
    """Setzt Wandstücke (siehe wall_shape). Um jeden Startplatz bleiben WALL_KEEP_FREE Ringe frei.
    Bei mirrors > 1 wird jedes Stück gespiegelt mitgesetzt (zählt dann als mehrere Stücke)."""
    placed = tries = 0
    while placed < pieces and tries < pieces * 150:
        tries += 1
        c, r = random.randint(0, COLS - 1), random.randint(0, ROWS - 1)
        cells = mirror_cells([(c + dc, r + dr) for dc, dr in wall_shape()], mirrors)
        ok = all(
            0 <= cc < COLS and 0 <= rr < ROWS and grid[rr][cc] == EMPTY
            and all(cheb((cc + 0.5, rr + 0.5), p) > WALL_KEEP_FREE for p in crosses)
            for cc, rr in cells
        )
        if ok:
            for cc, rr in cells:
                grid[rr][cc] = WALL
            placed += mirrors


def teleport(lobby, player):
    """Getroffener Spieler springt an eine andere Stelle in seinem Bereich (Hälfte / Viertel)."""
    avoid = [(p['c'], p['r']) for p in lobby['players'] if p is not player and p['alive']]
    player['c'], player['r'] = pick_cross(lobby['grid'], player['region'], avoid, old=(player['c'], player['r']))
    player['posVersion'] += 1


# ==========================================================
# 3. LOBBYS: ZUSTAND, SENDEN AN ALLE SPIELER
# ==========================================================

def new_code():
    while True:
        code = ''.join(random.choice(CODE_CHARS) for _ in range(4))
        if code not in lobbies:
            return code


def clean_name(name):
    name = ' '.join(str(name or '').split())[:16]
    return name or 'Spieler'


def new_player(name, slot):
    return {
        'id': secrets.token_hex(4), 'token': secrets.token_hex(12), 'name': clean_name(name), 'slot': slot,
        'lives': START_LIVES, 'alive': False, 'c': 0, 'r': 0, 'region': HALVES[0], 'posVersion': 0,
        'nextFire': 0.0, 'conns': 0, 'lastSeen': time.time(),
        'wins': 0, 'hits': 0,                              # Punkte über alle Runden der Lobby
        'team': None, 'shield': False, 'double': False,
    }


def free_slot(lobby):
    used = {p['slot'] for p in lobby['players']}
    return next(s for s in range(MAX_PLAYERS) if s not in used)


def find_player(lobby, player_id):
    return next((p for p in lobby['players'] if p['id'] == player_id), None)


def auth(data):
    """Lobby und Spieler zu einer Anfrage – nur mit passendem Token."""
    lobby = lobbies.get(str(data.get('code', '')).upper())
    if not lobby:
        return None, None
    player = find_player(lobby, data.get('playerId'))
    if not player or player['token'] != data.get('token'):
        return lobby, None
    return lobby, player


def add_log(lobby, text):
    lobby['log'].append(text)
    del lobby['log'][:-LOG_LENGTH]


def public_state(lobby):
    """Was alle sehen dürfen (ohne Tokens)."""
    players = []
    for p in sorted(lobby['players'], key=lambda q: q['slot']):
        color, color_name = PLAYER_COLORS[p['slot']]
        players.append({
            'id': p['id'], 'name': p['name'], 'slot': p['slot'], 'color': color, 'colorName': color_name,
            'lives': p['lives'], 'alive': p['alive'], 'x': p['c'] - COLS // 2, 'y': ROWS // 2 - p['r'],
            'posVersion': p['posVersion'], 'connected': p['conns'] > 0, 'nextFire': now_ms(p['nextFire']),
            'wins': p['wins'], 'hits': p['hits'], 'team': p['team'], 'shield': p['shield'], 'double': p['double'],
        })
    turn = lobby['turn']
    return {
        'code': lobby['code'], 'hostId': lobby['hostId'], 'phase': lobby['phase'], 'gameId': lobby['gameId'],
        'settings': lobby['settings'], 'players': players,
        'grid': [''.join(str(v) for v in row) for row in lobby['grid']] if lobby['grid'] else None,
        'turn': {'playerId': turn['playerId'], 'deadline': now_ms(turn['deadline']) if turn['deadline'] else None} if turn else None,
        'busy': lobby['busyUntil'] is not None, 'winnerId': lobby['winnerId'], 'log': lobby['log'],
        'winnerTeam': lobby['winnerTeam'], 'teamsActive': lobby['teamsActive'],
        'powerups': [{'id': u['id'], 'kind': u['kind'], 'x': u['c'] - COLS // 2 + 0.5, 'y': ROWS // 2 - u['r'] - 0.5}
                     for u in lobby['powerups']],
    }


def broadcast(lobby, message, only=None):
    message['serverTime'] = now_ms()
    data = json.dumps(message, separators=(',', ':'))
    for player_id, q in list(lobby['subscribers']):
        if only is None or player_id == only:
            q.put(data)


def send_state(lobby):
    broadcast(lobby, {'type': 'state', 'lobby': public_state(lobby)})


def remove_player(lobby, player, reason):
    """Spieler verlässt die Lobby (oder fliegt wegen Verbindungsverlust raus)."""
    broadcast(lobby, {'type': 'kicked', 'reason': reason}, only=player['id'])
    for player_id, q in list(lobby['subscribers']):
        if player_id == player['id']:
            q.put(None)                                   # beendet seine Live-Verbindung
    lobby['players'].remove(player)
    add_log(lobby, f"{player['name']} hat die Lobby verlassen.")
    if not lobby['players']:
        del lobbies[lobby['code']]
        return
    if lobby['hostId'] == player['id']:
        lobby['hostId'] = sorted(lobby['players'], key=lambda q: q['slot'])[0]['id']
    if lobby['phase'] == 'playing':
        check_game_over(lobby)


# ==========================================================
# 4. SPIEL-LOGIK: START, SCHÜSSE, TREFFER, ZÜGE
# ==========================================================

def start_game(lobby):
    players = sorted(lobby['players'], key=lambda q: q['slot'])
    regions = HALVES if len(players) == 2 else QUADRANTS
    grid = [[EMPTY] * COLS for _ in range(ROWS)]
    now = time.time()
    symmetric = lobby['settings']['symmetric']
    taken = []
    teams = lobby['settings']['teams'] and len(players) == 4
    for i, (player, region) in enumerate(zip(players, regions)):
        # Teams: Viertel oben links + unten links gegen oben rechts + unten rechts
        player.update(lives=START_LIVES, alive=True, region=region, posVersion=0, nextFire=now + 2,
                      team=i % 2 if teams else None, shield=False, double=False)
        player['c'], player['r'] = pick_cross(grid, region, taken)   # Startplatz immer zufällig in der eigenen Hälfte/im Viertel
        taken.append((player['c'], player['r']))
    # Faire Welt: Wände gespiegelt (2 Spieler: an der y-Achse, 3–4: an beiden Achsen)
    mirrors = (2 if len(players) == 2 else 4) if symmetric else 1
    make_walls(grid, taken, WALL_PIECES[lobby['settings']['walls']], mirrors)
    lobby.update(grid=grid, phase='playing', gameId=lobby['gameId'] + 1, effects=[], busyUntil=None,
                 winnerId=None, winnerTeam=None, teamsActive=teams, turn=None, log=[], powerups=[],
                 nextPowerup=now + POWERUP_EVERY)
    add_log(lobby, 'Die Runde beginnt – Team Links gegen Team Rechts!' if teams else 'Die Runde beginnt – viel Glück!')
    if lobby['settings']['powerups']:
        spawn_powerups(lobby)
    if lobby['settings']['mode'] == 'turns':
        start_turn(lobby, now, random.choice(players)['id'], first=True)


def spawn_powerups(lobby):
    """Legt Power-ups auf freie Kästchen – in der fairen Welt gespiegelt, damit jeder gleich weit hat."""
    if len(lobby['powerups']) >= POWERUP_MAX:
        return
    players = [(p['c'], p['r']) for p in lobby['players'] if p['alive']]
    mirrors = (2 if len(lobby['players']) == 2 else 4) if lobby['settings']['symmetric'] else 1
    kind = random.choice(POWERUP_KINDS)
    for _ in range(200):
        c, r = random.randint(2, COLS - 3), random.randint(2, ROWS - 3)
        cells = mirror_cells([(c, r)], mirrors)
        taken = {(u['c'], u['r']) for u in lobby['powerups']}
        if len(lobby['powerups']) + len(cells) > POWERUP_MAX + 2:
            return
        if all(lobby['grid'][rr][cc] == EMPTY and (cc, rr) not in taken
               and all(cheb((cc + 0.5, rr + 0.5), p) > 4 for p in players) for cc, rr in cells):
            for cc, rr in cells:
                lobby['powerups'].append({'id': secrets.token_hex(3), 'kind': kind, 'c': cc, 'r': rr})
            return


def start_turn(lobby, now, after_id, first=False):
    """Nächster lebender Spieler (nach Slot-Reihenfolge) ist am Zug."""
    order = [p for p in sorted(lobby['players'], key=lambda q: q['slot']) if p['alive']]
    if not order:
        lobby['turn'] = None
        return
    ids = [p['id'] for p in order]
    if first and after_id in ids:
        nxt = after_id
    else:
        after = find_player(lobby, after_id)
        after_slot = after['slot'] if after else -1
        later = [p for p in order if p['slot'] > after_slot]
        nxt = (later or order)[0]['id']
    lobby['turn'] = {'playerId': nxt, 'deadline': now + lobby['settings']['thinkTime'], 'start': now}


def check_game_over(lobby):
    alive = [p for p in lobby['players'] if p['alive']]
    if lobby['phase'] != 'playing':
        return
    if lobby['teamsActive']:
        teams = {p['team'] for p in alive}
        if len(teams) > 1:
            return
        lobby.update(phase='over', turn=None, busyUntil=None, effects=[], powerups=[])
        lobby['winnerTeam'] = teams.pop() if teams else None
        if lobby['winnerTeam'] is None:
            add_log(lobby, 'Unentschieden – alle sind raus!')
            return
        for p in lobby['players']:
            if p['team'] == lobby['winnerTeam']:
                p['wins'] += 1                                # ganzes Team bekommt den Sieg
        add_log(lobby, f"Team {'Links' if lobby['winnerTeam'] == 0 else 'Rechts'} gewinnt die Runde!")
        return
    if len(alive) > 1:
        return
    lobby.update(phase='over', turn=None, busyUntil=None, effects=[], powerups=[])
    lobby['winnerId'] = alive[0]['id'] if alive else None
    if alive:
        alive[0]['wins'] += 1
    add_log(lobby, f"{alive[0]['name']} gewinnt die Runde!" if alive else 'Unentschieden – alle sind raus!')


def apply_effect(lobby, effect):
    if effect['kind'] == 'blast':
        for c, r in effect['cells']:
            if 0 <= r < ROWS and 0 <= c < COLS and lobby['grid'][r][c] == WALL:
                lobby['grid'][r][c] = EMPTY
        return
    shooter = find_player(lobby, effect['shooterId'])
    shooter_name = shooter['name'] if shooter else 'Jemand'
    if effect['kind'] == 'pickup':
        item = next((u for u in lobby['powerups'] if u['id'] == effect['powerupId']), None)
        if not item or not shooter or not shooter['alive']:
            return                                        # schon weg (jemand anderes war schneller)
        lobby['powerups'].remove(item)
        if item['kind'] == 'life':
            shooter['lives'] = min(START_LIVES, shooter['lives'] + 1)
        elif item['kind'] == 'shield':
            shooter['shield'] = True
        else:
            shooter['double'] = True
        add_log(lobby, f"{shooter_name} sammelt {POWERUP_NAMES[item['kind']]} ein.")
        return
    target = find_player(lobby, effect['targetId'])
    if not target or not target['alive'] or target['posVersion'] != effect['posVersion']:
        return                                            # schon getroffen und weggesprungen
    if target['shield']:
        target['shield'] = False
        add_log(lobby, f"Der Schutzzauber von {target['name']} hält {shooter_name}s Treffer ab!")
        return
    if shooter:
        shooter['hits'] += 1
    target['lives'] -= effect.get('damage', 1)
    if target['lives'] <= 0:
        target['alive'] = False
        add_log(lobby, f"{shooter_name} trifft {target['name']} – {target['name']} ist raus!")
        check_game_over(lobby)
    else:
        teleport(lobby, target)
        state = 'bekommt Risse' if target['lives'] >= 2 else 'zerbricht'
        add_log(lobby, f"{shooter_name} trifft {target['name']} – Manaschild {state}!")


def tick_lobby(lobby, now):
    """Wird 20-mal pro Sekunde aufgerufen. Ergebnis: hat sich etwas geändert?"""
    changed = False
    idle_limit = GAME_IDLE if lobby['phase'] == 'playing' else LOBBY_IDLE
    for player in list(lobby['players']):
        if player['conns'] == 0 and now - player['lastSeen'] > idle_limit:
            remove_player(lobby, player, 'Verbindung verloren.')
            if lobby['code'] not in lobbies:
                return False
            changed = True
    if lobby['phase'] != 'playing':
        return changed

    if lobby['settings']['powerups'] and now >= lobby['nextPowerup']:
        lobby['nextPowerup'] = now + POWERUP_EVERY
        before = len(lobby['powerups'])
        spawn_powerups(lobby)
        changed = changed or len(lobby['powerups']) != before

    due = sorted((e for e in lobby['effects'] if e['at'] <= now), key=lambda e: e['at'])
    if due:
        lobby['effects'] = [e for e in lobby['effects'] if e['at'] > now]
        for effect in due:
            if lobby['phase'] == 'playing':
                apply_effect(lobby, effect)
        changed = True
    if lobby['phase'] != 'playing' or lobby['settings']['mode'] != 'turns':
        return changed

    turn = lobby['turn']
    if lobby['busyUntil'] is not None:
        if now >= lobby['busyUntil']:
            lobby['busyUntil'] = None
            start_turn(lobby, now, turn['playerId'] if turn else None)
            changed = True
    elif turn:
        current = find_player(lobby, turn['playerId'])
        if not current or not current['alive']:
            start_turn(lobby, now, turn['playerId'])
            changed = True
        elif now >= turn['deadline']:
            add_log(lobby, f"{current['name']}: Zeit abgelaufen.")
            start_turn(lobby, now, turn['playerId'])
            changed = True
        elif current['conns'] == 0 and now - turn['start'] >= OFFLINE_SKIP:
            add_log(lobby, f"{current['name']} ist nicht verbunden – Zug übersprungen.")
            start_turn(lobby, now, turn['playerId'])
            changed = True
    else:
        start_turn(lobby, now, None)
        changed = True
    return changed


def tick_loop():
    while True:
        time.sleep(0.05)
        with lock:
            now = time.time()
            for lobby in list(lobbies.values()):
                if tick_lobby(lobby, now) and lobby['code'] in lobbies:
                    send_state(lobby)


def number(value, low, high):
    """Zahl prüfen (gegen kaputte oder böswillige Anfragen)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError
    if not low <= value <= high:
        raise ValueError
    return float(value)


# ---------- API-Funktionen (laufen unter lock) ----------

def api_create(data):
    code = new_code()
    player = new_player(data.get('name'), 0)
    lobbies[code] = {
        'code': code, 'hostId': player['id'], 'phase': 'lobby', 'gameId': 0, 'settings': dict(DEFAULT_SETTINGS),
        'players': [player], 'grid': None, 'turn': None, 'busyUntil': None, 'effects': [], 'winnerId': None,
        'log': [f"{player['name']} hat die Lobby erstellt."], 'subscribers': [],
        'winnerTeam': None, 'teamsActive': False, 'powerups': [], 'nextPowerup': 0,
    }
    return {'ok': True, 'code': code, 'playerId': player['id'], 'token': player['token']}


def api_join(data):
    lobby = lobbies.get(str(data.get('code', '')).strip().upper())
    if not lobby:
        return {'ok': False, 'error': 'Diese Lobby gibt es nicht. Stimmt der Code?'}
    if lobby['phase'] == 'playing':
        return {'ok': False, 'error': 'Dort läuft gerade eine Runde. Versuch es gleich nach der Runde noch einmal.'}
    if len(lobby['players']) >= MAX_PLAYERS:
        return {'ok': False, 'error': f'Die Lobby ist voll (höchstens {MAX_PLAYERS} Spieler).'}
    player = new_player(data.get('name'), free_slot(lobby))
    lobby['players'].append(player)
    add_log(lobby, f"{player['name']} ist beigetreten.")
    send_state(lobby)
    return {'ok': True, 'code': lobby['code'], 'playerId': player['id'], 'token': player['token']}


def api_settings(data):
    lobby, player = auth(data)
    if not player:
        return {'ok': False, 'error': 'Nicht in dieser Lobby.'}
    if player['id'] != lobby['hostId']:
        return {'ok': False, 'error': 'Nur der Host kann die Einstellungen ändern.'}
    if lobby['phase'] == 'playing':
        return {'ok': False, 'error': 'Während einer Runde geht das nicht.'}
    for key, value in (data.get('settings') or {}).items():
        if key in ALLOWED_SETTINGS and value in ALLOWED_SETTINGS[key] and type(value) is type(DEFAULT_SETTINGS[key]):
            lobby['settings'][key] = value
    send_state(lobby)
    return {'ok': True}


def api_start(data):
    lobby, player = auth(data)
    if not player:
        return {'ok': False, 'error': 'Nicht in dieser Lobby.'}
    if player['id'] != lobby['hostId']:
        return {'ok': False, 'error': 'Nur der Host kann die Runde starten.'}
    if lobby['phase'] == 'playing':
        return {'ok': False, 'error': 'Die Runde läuft schon.'}
    if len(lobby['players']) < 2:
        return {'ok': False, 'error': 'Es braucht mindestens 2 Spieler.'}
    start_game(lobby)
    send_state(lobby)
    return {'ok': True}


def api_fire(data):
    lobby, player = auth(data)
    if not player:
        return {'ok': False, 'error': 'Nicht in dieser Lobby.'}
    if lobby['phase'] != 'playing' or data.get('gameId') != lobby['gameId']:
        return {'ok': False, 'error': 'Gerade läuft keine Runde.'}
    if not player['alive']:
        return {'ok': False, 'error': 'Du bist schon raus.'}
    now = time.time()
    settings = lobby['settings']
    if settings['mode'] == 'turns':
        turn = lobby['turn']
        if lobby['busyUntil'] is not None or not turn or turn['playerId'] != player['id']:
            return {'ok': False, 'error': 'Du bist gerade nicht am Zug.'}
    elif now < player['nextFire'] - 0.05:
        return {'ok': False, 'error': 'Noch nicht nachgeladen.'}

    try:
        length = number(data.get('length'), 0, 2000)
        raw_points = data.get('points')
        if not isinstance(raw_points, list) or not 2 <= len(raw_points) <= 6000:
            raise ValueError
        points = [[number(p[0], -60, 60), number(p[1], -60, 60), number(p[2], 0, 2000)] for p in raw_points]
        hits = []
        for hit in data.get('hits') or []:
            target = find_player(lobby, hit.get('id'))
            teammate = player['team'] is not None and target is not None and target['team'] == player['team']
            if target and target is not player and target['alive'] and not teammate and all(h['targetId'] != target['id'] for h in hits):
                hits.append({'targetId': target['id'], 's': number(hit.get('s'), 0, 2000),
                             'posVersion': int(number(hit.get('posVersion'), 0, 1e9))})
        blast = [[int(number(c[0], 0, COLS - 1)), int(number(c[1], 0, ROWS - 1))] for c in (data.get('blast') or [])[:40]]
        pickups = []
        for item in (data.get('pickups') or [])[:POWERUP_MAX + 2]:
            if any(u['id'] == item.get('id') for u in lobby['powerups']):
                pickups.append({'powerupId': item['id'], 's': number(item.get('s'), 0, 2000)})
    except (ValueError, TypeError, IndexError, KeyError, AttributeError):
        return {'ok': False, 'error': 'Ungültiger Schuss.'}

    end = now + length / SHOT_SPEED
    damage = 2 if player['double'] else 1                 # Doppelschuss: jeder Treffer kostet 2 Leben
    player['double'] = False
    for hit in hits:
        lobby['effects'].append({'kind': 'hit', 'at': now + hit['s'] / SHOT_SPEED, 'shooterId': player['id'],
                                 'damage': damage, **hit})
    for item in pickups:
        lobby['effects'].append({'kind': 'pickup', 'at': now + item['s'] / SHOT_SPEED, 'shooterId': player['id'],
                                 'powerupId': item['powerupId']})
    if blast and settings['wallsBreakable']:             # unzerstörbare Wände: Löcher werden ignoriert
        lobby['effects'].append({'kind': 'blast', 'at': end, 'cells': blast})
    if settings['mode'] == 'turns':
        lobby['busyUntil'] = end + TURN_PAUSE
        lobby['turn']['deadline'] = None
    else:
        player['nextFire'] = now + settings['cooldown']

    shot = {
        'id': secrets.token_hex(4), 'shooterId': player['id'], 'input': str(data.get('input', ''))[:120],
        'points': points, 'length': length, 'blocked': bool(blast) or data.get('endReason') == 'wall',
        'hits': [{'id': h['targetId'], 's': h['s']} for h in hits], 'startedAt': now_ms(now), 'damage': damage,
    }
    label = data.get('label') if data.get('label') in SHOT_LABELS else SHOT_LABELS[0]
    if shot['input']:
        add_log(lobby, f"{player['name']}: {label}{shot['input']}" + (' (Doppelschuss!)' if damage == 2 else ''))
    broadcast(lobby, {'type': 'shot', 'shot': shot})
    send_state(lobby)
    return {'ok': True}


def api_rename(data):
    lobby, player = auth(data)
    if not player:
        return {'ok': False, 'error': 'Nicht in dieser Lobby.'}
    name = clean_name(data.get('name'))
    if name != player['name']:
        add_log(lobby, f"{player['name']} heißt jetzt {name}.")
        player['name'] = name
        send_state(lobby)
    return {'ok': True}


def api_reset_scores(data):
    lobby, player = auth(data)
    if not player or player['id'] != lobby['hostId']:
        return {'ok': False, 'error': 'Nur der Host kann die Punkte zurücksetzen.'}
    for p in lobby['players']:
        p['wins'] = p['hits'] = 0
    add_log(lobby, 'Die Punkte wurden zurückgesetzt.')
    send_state(lobby)
    return {'ok': True}


def api_kick(data):
    lobby, player = auth(data)
    if not player:
        return {'ok': False, 'error': 'Nicht in dieser Lobby.'}
    if player['id'] != lobby['hostId']:
        return {'ok': False, 'error': 'Nur der Host kann Spieler entfernen.'}
    target = find_player(lobby, data.get('targetId'))
    if not target or target is player:
        return {'ok': False, 'error': 'Diesen Spieler gibt es nicht.'}
    remove_player(lobby, target, 'Der Host hat dich aus der Lobby entfernt.')
    if lobby['code'] in lobbies:
        send_state(lobby)
    return {'ok': True}


def api_leave(data):
    lobby, player = auth(data)
    if player:
        remove_player(lobby, player, 'Du hast die Lobby verlassen.')
        if lobby['code'] in lobbies:
            send_state(lobby)
    return {'ok': True}


API = {
    '/api/create': api_create, '/api/join': api_join, '/api/settings': api_settings,
    '/api/start': api_start, '/api/fire': api_fire, '/api/leave': api_leave,
    '/api/rename': api_rename, '/api/kick': api_kick, '/api/resetscores': api_reset_scores,
}

# ==========================================================
# 5. HTTP: DATEIEN, API, LIVE-UPDATES
# ==========================================================

MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}


class Handler(BaseHTTPRequestHandler):
    server_version = 'FunctionFighter/1.0'

    def log_message(self, fmt, *args):   # keine Zeile pro Anfrage im Terminal
        pass

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/api/events':
            self.events(parse_qs(url.query))
        elif url.path == '/api/ping':
            self.send_json({'ok': True, 'serverTime': now_ms()})
        elif url.path == '/api/info':
            # Links für die anderen PCs (fürs Lobby-Fenster)
            self.send_json({'ok': True, 'port': server_port, 'addresses': lan_addresses()})
        else:
            self.static(url.path)

    def do_POST(self):
        url = urlparse(self.path)
        handler = API.get(url.path)
        if not handler:
            self.send_json({'ok': False, 'error': 'Unbekannte Anfrage.'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if length > 2_000_000:
                raise ValueError
            data = json.loads(self.rfile.read(length) or b'{}')
            if not isinstance(data, dict):
                raise ValueError
        except ValueError:
            self.send_json({'ok': False, 'error': 'Ungültige Anfrage.'}, 400)
            return
        with lock:
            result = handler(data)
        self.send_json(result)

    def static(self, path):
        path = unquote(path)
        if path in ('', '/'):
            path = '/index.html'
        full = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        ext = os.path.splitext(full)[1].lower()
        if not full.startswith(ROOT + os.sep) or ext not in MIME or not os.path.isfile(full):
            self.send_json({'ok': False, 'error': 'Nicht gefunden.'}, 404)
            return
        with open(full, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', MIME[ext])
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def events(self, query):
        """Live-Verbindung (Server-Sent Events): schickt jede Änderung der Lobby sofort an den Browser."""
        data = {k: v[0] for k, v in query.items()}
        with lock:
            lobby, player = auth(data)
            if not player:
                self.send_json({'ok': False, 'error': 'Lobby oder Spieler nicht gefunden.'}, 404)
                return
            q = queue.Queue()
            entry = (player['id'], q)
            lobby['subscribers'].append(entry)
            player['conns'] += 1
            send_state(lobby)
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        try:
            while True:
                try:
                    message = q.get(timeout=5)               # Ping alle 5 s: merkt schnell, wenn jemand weg ist
                except queue.Empty:
                    self.wfile.write(b': ping\n\n')          # hält die Verbindung offen
                    self.wfile.flush()
                    continue
                if message is None:
                    break
                self.wfile.write(('data: ' + message + '\n\n').encode('utf-8'))
                self.wfile.flush()
        except OSError:
            pass                                          # Browser hat die Verbindung geschlossen
        finally:
            with lock:
                if entry in lobby['subscribers']:
                    lobby['subscribers'].remove(entry)
                player['conns'] = max(0, player['conns'] - 1)
                player['lastSeen'] = time.time()
                if lobby['code'] in lobbies and player in lobby['players']:
                    send_state(lobby)


def dual_stack_available():
    """Kann ein Socket IPv4 und IPv6 zugleich annehmen? (einmal beim Start geprüft)"""
    if not socket.has_ipv6:
        return False
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            s.bind(('::', 0))
        return True
    except (AttributeError, OSError):
        return False


class Server(ThreadingHTTPServer):
    allow_reuse_address = False   # unter Windows sonst zwei Server auf demselben Port möglich
    daemon_threads = True
    address_family = socket.AF_INET6 if dual_stack_available() else socket.AF_INET

    def server_bind(self):
        # Port exklusiv belegen: Läuft schon ein Server (auch ein halb belegter Port),
        # schlägt das fehl und main() nimmt den nächsten Port.
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        # IPv4 und IPv6 zugleich: Unter Windows fragt „localhost“ zuerst IPv6 (::1) –
        # ohne das hinge jede Anfrage dort ~2 Sekunden.
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        # wie HTTPServer.server_bind, aber ohne das unter Windows langsame getfqdn()
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name, self.server_port = host, port


# ==========================================================
# 6. START
# ==========================================================

def lan_addresses():
    """IPv4-Adressen dieses PCs im lokalen Netz (die erste ist meist die richtige)."""
    found = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))                  # es wird nichts gesendet
        found.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        found += socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        pass
    result = []
    for ip in found:
        if ip not in result and not ip.startswith(('127.', '169.254.', '0.')):
            result.append(ip)
    return result


def main():
    try:
        sys.stdout.reconfigure(errors='replace')
    except AttributeError:
        pass
    server = None
    host = '::' if Server.address_family == socket.AF_INET6 else '0.0.0.0'
    for port in PORTS:
        try:
            server = Server((host, port), Handler)
            break
        except OSError:
            continue                                      # Port belegt -> nächster
    if not server:
        print('Kein freier Port zwischen 8000 und 8010 gefunden. Läuft der Server schon in einem anderen Fenster?')
        return 1
    global server_port
    port = server_port = server.server_port
    threading.Thread(target=tick_loop, daemon=True).start()

    line = '=' * 64
    print(line)
    print('  FUNCTION FIGHTER – Multiplayer-Server läuft')
    print(line)
    print()
    print(f'  Auf DIESEM PC:            http://localhost:{port}')
    print()
    addresses = lan_addresses()
    if addresses:
        print('  Auf ALLEN anderen PCs im selben Netzwerk (WLAN/LAN) im Browser eingeben:')
        for i, ip in enumerate(addresses):
            print(f'      http://{ip}:{port}' + ('' if i == 0 else '   (andere Netzwerkkarte)'))
    else:
        print('  Keine Netzwerk-Adresse gefunden – ist der PC mit einem Netzwerk verbunden?')
    print()
    print('  Fragt Windows nach der Firewall: "Zugriff zulassen" (private Netzwerke) klicken.')
    print('  Server beenden: dieses Fenster schließen oder Strg+C drücken.')
    print(line)
    sys.stdout.flush()

    if not os.environ.get('FF_NO_BROWSER'):          # beim automatischen Testen kein Browserfenster
        try:
            webbrowser.open(f'http://localhost:{port}')
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer beendet.')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
