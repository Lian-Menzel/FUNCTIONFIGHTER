/* ==========================================================
   FUNCTION FIGHTER – script.js

   Aufbau der Datei:
     1. Level-Rezepte, Kurvenformen & Tutorial (hier Inhalte ändern)
     2. Spielfeld, Koordinaten & Karten-Matrix
     3. Formel-Parser          (Eingabe -> JavaScript-Funktion + LaTeX)
     4. Kurve, Wände & Treffererkennung
     5. Kartengenerierung
     6. Spielzustand & Spiellogik (Level, Endlos, Tutorial)
     7. Zeichnen
     8. Benutzeroberfläche & Einstellungen

   Dazu kommen catalog.js (Funktionsliste) und multiplayer.js
   (Live-Multiplayer mit server.py).
   ========================================================== */
'use strict';

/* ==========================================================
   1. LEVEL-REZEPTE, KURVENFORMEN & TUTORIAL
   ----------------------------------------------------------
   Level werden nicht von Hand gezeichnet, sondern bei jedem
   Start zufällig erzeugt (siehe Abschnitt 5). Ein Level ist ein
   „Rezept“:
     name, form       : Name und Funktionsform (LaTeX, steht unter dem Namen)
     shapes           : pro Eintrag eine Gegnergruppe, die auf einer
                        zufälligen Kurve dieser Form liegt (siehe SHAPES)
     count            : Gegner pro Gruppe
     hp               : mögliche Lebenspunkte (zufällig gewählt, 1–3)
     walls            : Anzahl Wandstücke
     spareShots       : zusätzliche Angriffe als Puffer

   Alternativ kann ein Level eine feste Karte haben:
     layout: [ 30 Zeilen mit je 50 Ziffern ], shots: 5, solution: ['...']
   (Ziffern wie in der Karten-Matrix, siehe Abschnitt 2.)
   ========================================================== */

const LEVELS = [
  { name: 'Erste Gerade', form: 'm\\cdot x', shapes: ['linear'], count: 3, hp: [1], walls: 3, spareShots: 2 },
  { name: 'Zwei Geraden', form: 'm\\cdot x', shapes: ['linear', 'linear'], count: 3, hp: [1], walls: 6, spareShots: 1 },
  { name: 'Dicke Brocken', form: 'm\\cdot x', shapes: ['linear', 'linear'], count: 3, hp: [1, 2], walls: 8, spareShots: 1 },
  { name: 'Die Parabel', form: 'a\\cdot x^2', shapes: ['parabola'], count: 4, hp: [1, 2], walls: 8, spareShots: 1 },
  { name: 'Wurfparabel', form: '\\frac{x(k-x)}{d} \\quad m\\cdot x', shapes: ['throw', 'linear'], count: 3, hp: [1], walls: 10, spareShots: 1 },
  { name: 'Polynom-Schlange', form: '\\frac{x(x-a)(x+a)}{d}', shapes: ['cubic'], count: 4, hp: [1], walls: 10, spareShots: 1 },
  { name: 'Hyperbel', form: '\\frac{a}{x \\pm b}', shapes: ['rational'], count: 4, hp: [1], walls: 10, spareShots: 1 },
  { name: 'Wurzelkraft', form: 'a\\sqrt{x} \\quad a\\sqrt{|x|}', shapes: ['sqrt', 'sqrt'], count: 3, hp: [1, 2], walls: 10, spareShots: 1 },
  { name: 'Exponentiell', form: '\\pm e^{\\pm x/k} \\quad m\\cdot x', shapes: ['exp', 'linear'], count: 3, hp: [1], walls: 12, spareShots: 1 },
  { name: 'Sinuswelle', form: 'a\\sin(x/k)', shapes: ['sin'], count: 5, hp: [1], walls: 12, spareShots: 1 },
  { name: 'Kosinus & Tangens', form: 'a\\cos(x/k) \\quad a\\tan(x/k)', shapes: ['cos', 'tan'], count: 3, hp: [1], walls: 12, spareShots: 1 },
  { name: 'Finale', form: 'g(x) + \\sin x \\quad a\\cdot x^2', shapes: ['combo', 'parabola'], count: 4, hp: [1, 2, 3], walls: 14, spareShots: 1 },
];

// Zufallshilfen
const pick = list => list[Math.floor(Math.random() * list.length)];
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Kurvenformen für die Kartengenerierung. Jede liefert eine zufällige
// Funktion als Text – genau das, was ein Spieler eintippen würde (x zählt vom
// Spieler aus, geschossen wird nach rechts).
const SHAPES = {
  linear: () => { const m = pick(['x/5', 'x/4', 'x/3', 'x/2', '2x/3', 'x', '3x/2', '2x']); return pick([m, `-(${m})`]); },
  parabola: () => pick(['', '-']) + `x^2/${pick([2, 3, 4, 5, 6, 8, 10])}`,
  throw: () => `x(${pick([6, 8, 10, 12, 14]) * pick([1, -1])}-x)/${pick([4, 5, 6, 8, 10])}`,
  cubic: () => { const a = pick([3, 4, 5]); return pick(['', '-']) + `x(x-${a})(x+${a})/${pick([8, 10, 12, 16])}`; },
  rational: () => `${pick([2, 3, 4])}/(x${pick(['-', '+'])}${pick([3, 4, 5, 6])})`,
  sqrt: () => pick(['', '2', '1.5', '-', '-2']) + pick(['sqrt(x)', 'sqrt(abs(x))']),
  exp: () => { const e = `x/${pick([3, 4, 5, 6])}`; return pick(['', '-']) + `e^(${pick([e, `-(${e})`])})`; },
  sin: () => pick(['', '2', '3']) + `sin(${pick(['x', 'x/2', 'x/3'])})`,
  cos: () => pick(['2', '3', '4']) + `cos(${pick(['x/2', 'x/3'])})`,
  tan: () => pick(['', '2']) + `tan(x/${pick([3, 4, 5])})`,
  combo: () => pick([
    `x/${pick([3, 4, 5])}+${pick(['', '2'])}sin(x)`,
    `x^2/${pick([8, 10, 12])}+cos(x)`,
    'sqrt(abs(x))+sin(x)',
  ]),
};

// Tutorial: feste kleine Karten. Gegner [dx, dy, Lebenspunkte] und Wände
// [dx, dy] stehen relativ zum Spieler (Kästchenmitte = ganze Zahl + 0,5).
// player: andere Startposition für einen Schritt (immer links, x ≤ 0).
const TUTORIAL_PLAYER = { x: -10, y: -2 };
const TUTORIAL = [
  { title: 'Willkommen!', text: 'Du bist der Nullpunkt (0 | 0). Deine Kurve: \\(y = f(x) - f(0)\\)' },
  { title: 'Erste Gerade', text: 'Tippe x/3 und drücke Enter.', enemies: [[4.5, 1.5, 1], [10.5, 3.5, 1]], solution: ['x/3'] },
  { title: 'Nur die Steigung zählt', text: '+b fällt weg: -x/3+5 trifft wie -x/3.', enemies: [[4.5, -1.5, 1], [10.5, -3.5, 1]], solution: ['-x/3+5'] },
  { title: 'Die Parabel', text: 'Probier x^2/8.', enemies: [[4.5, 2.5, 1], [6.5, 5.5, 1]], solution: ['x^2/8'] },
  { title: 'Dicke Brocken', text: 'Ein Herz = ein Treffer. Zweimal x.', enemies: [[3.5, 3.5, 2], [6.5, 6.5, 1]], solution: ['x', 'x'] },
  { title: 'Mauern', text: 'Mauern stoppen den Schuss. Probier x^2/33.', enemies: [[13.5, 5.5, 1]], walls: [[2.5, 1.5], [2.5, 2.5]], solution: ['x^2/33'] },
  { title: 'Bereit!', text: 'L davor schießt nach links: L x^2/8' },
];

/* ==========================================================
   2. SPIELFELD, KOORDINATEN & KARTEN-MATRIX
   ----------------------------------------------------------
   Intern (Welt-Koordinaten, nur zum Speichern und Verschicken – der
   Spieler sieht sie nie): x von -25 bis 25, y von -15 bis 15, der
   Welt-Nullpunkt liegt in der Mitte.
   Beide Achsen haben denselben Maßstab (UNIT), damit Kreise
   auch wirklich rund sind.

   Die Karte ist eine Matrix mit einem Eintrag pro Kästchen des
   Koordinatensystems: 30 Zeilen × 50 Spalten.
     0 = leer, 1–3 = Gegner mit so vielen Lebenspunkten,
     4 = Wand, 5 = Spieler
   Zeile 0 ist oben (y = 15), Spalte 0 ist links (x = -25).

   Gegner sitzen in der Mitte ihres Kästchens. Der Spieler sitzt
   auf einem KREUZ des Rasters (ganzzahlige Koordinaten) und ist
   deshalb in der Matrix als 2×2-Block aus vier 5en gespeichert –
   den vier Kästchen, die an sein Kreuz grenzen.

   Eigenes Koordinatensystem: Der Nullpunkt (0 | 0) jedes Spielers
   liegt in ihm selbst, und jeder sieht das Feld so, dass ER LINKS
   steht. Steht er in der Welt rechts (x > 0), wird für ihn alles an
   der y-Achse gespiegelt: Seine x-Richtung zeigt in der Welt nach
   links (y bleibt gleich). Gespeichert und verschickt wird immer in
   Welt-Koordinaten; gespiegelt wird nur beim Rechnen des eigenen
   Schusses (ownX) und beim Zeichnen (toCanvasX / toMathX).
   ========================================================== */

const VIEW = { xMin: -25, xMax: 25, yMin: -15, yMax: 15 };
const WIDTH = 1500;
const UNIT = WIDTH / (VIEW.xMax - VIEW.xMin);    // 30 Pixel pro Koordinaten-Einheit
const HEIGHT = (VIEW.yMax - VIEW.yMin) * UNIT;   // 900 Pixel

const COLS = VIEW.xMax - VIEW.xMin;              // 50 Spalten
const ROWS = VIEW.yMax - VIEW.yMin;              // 30 Zeilen
const CELL = { EMPTY: 0, WALL: 4, PLAYER: 5 };   // 1–3 = Gegner mit so vielen Lebenspunkten
const ENEMY_RADIUS = { 1: 0.45, 2: 0.6, 3: 0.8 };

// Spiegelung des Koordinatensystems eines Spielers: +1 = wie die Welt, −1 = gespiegelt
// (er steht rechts der Mitte und sieht sich deshalb links).
function mirrorOf(player) { return player && player.x > 0 ? -1 : 1; }

// x eines Welt-Punktes im Koordinatensystem dieses Spielers (für Welt-x aus eigenem x
// gilt dieselbe Formel, weil Spiegeln zweimal nichts ändert)
function ownX(x, player) { return mirrorOf(player) * x; }

// Spiegelung der Ansicht: die des eigenen Spielers – im Editor nie (dort wird gebaut)
function viewMirror() { return state.mode === 'editor' ? 1 : mirrorOf(state.player); }

// Welt-Punkt -> Koordinaten im eigenen System des Spielers (Nullpunkt im Spieler,
// gespiegelt wie die Ansicht) – für Achsen, Mausanzeige und Beschriftungen
function viewX(x) { return viewMirror() * (x - state.player.x); }
function viewY(y) { return y - state.player.y; }

// Mathe -> Pixel. Die y-Achse wird umgedreht, weil Canvas-y nach unten zählt.
function toCanvasX(x) { return (viewMirror() * x - VIEW.xMin) * UNIT; }
function toCanvasY(y) { return (VIEW.yMax - y) * UNIT; }

// Pixel -> Mathe (für die Mausposition)
function toMathX(px) { return viewMirror() * (px / UNIT + VIEW.xMin); }
function toMathY(py) { return VIEW.yMax - py / UNIT; }

// Kästchen (Spalte c, Zeile r) -> Mittelpunkt in Mathe-Koordinaten
function cellCenter(c, r) {
  return { x: VIEW.xMin + c + 0.5, y: VIEW.yMax - r - 0.5 };
}

// Kreuz (c, r) = linke obere Ecke von Kästchen (c, r) -> Mathe-Koordinaten
function crossPoint(c, r) {
  return { x: VIEW.xMin + c, y: VIEW.yMax - r };
}

// Mathe-Koordinaten eines Kreuzes -> Kreuz-Index (c, r)
function crossIndex(point) {
  return { c: Math.round(point.x - VIEW.xMin), r: Math.round(VIEW.yMax - point.y) };
}

// Die vier Kästchen, die an das Kreuz (c, r) grenzen
function crossCells(c, r) {
  return [{ c: c - 1, r: r - 1 }, { c, r: r - 1 }, { c: c - 1, r }, { c, r }];
}

// Mathe-Koordinaten -> Kästchen (oder null außerhalb des Feldes)
function cellAt(x, y) {
  const c = Math.floor(x - VIEW.xMin);
  const r = Math.floor(VIEW.yMax - y);
  return c >= 0 && c < COLS && r >= 0 && r < ROWS ? { c, r } : null;
}

function isWall(grid, x, y) {
  if (!grid) return false;
  const cell = cellAt(x, y);
  return cell !== null && grid[cell.r][cell.c] === CELL.WALL;
}

function emptyGrid() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(CELL.EMPTY));
}

// Spieler als 2×2-Block an das Kreuz (c, r) setzen
function setPlayer(grid, c, r) {
  for (const cell of crossCells(c, r)) grid[cell.r][cell.c] = CELL.PLAYER;
}

// Matrix als Text (eine Zeile pro Kartenzeile), z. B. für die Anzeige
function gridToText(grid) {
  return grid.map(row => row.join('')).join('\n');
}

// Text-Zeilen (feste Level-Karte) -> Matrix
function layoutToGrid(lines) {
  if (lines.length !== ROWS) throw new Error(`Karte braucht ${ROWS} Zeilen, hat ${lines.length}.`);
  const grid = lines.map((line, r) => {
    if (!new RegExp(`^[0-5]{${COLS}}$`).test(line)) throw new Error(`Zeile ${r} braucht genau ${COLS} Ziffern von 0 bis 5.`);
    return [...line].map(Number);
  });
  if (!readMap(grid).player) throw new Error('Die Karte braucht genau einen Spieler: vier 5en als 2×2-Block.');
  return grid;
}

// Liest aus der Matrix die Spielerposition (Kreuz in der Mitte des 5er-Blocks) und die Gegner
function readMap(grid) {
  const fives = [];
  const enemies = [];
  grid.forEach((row, r) => row.forEach((value, c) => {
    if (value === CELL.PLAYER) fives.push({ c, r });
    else if (value >= 1 && value <= 3) {
      const center = cellCenter(c, r);
      enemies.push({ x: center.x, y: center.y, r: ENEMY_RADIUS[value], hp: value, maxHp: value, flash: 0 });
    }
  }));
  let player = null;
  if (fives.length === 4) {
    const c = Math.min(...fives.map(f => f.c)) + 1;
    const r = Math.min(...fives.map(f => f.r)) + 1;
    const block = crossCells(c, r);
    if (block.every(b => fives.some(f => f.c === b.c && f.r === b.r))) player = crossPoint(c, r);
  }
  return { player, enemies };
}

/* ==========================================================
   3. FORMEL-PARSER
   ----------------------------------------------------------
   MathJax kann Formeln nur ANZEIGEN, nicht ausrechnen. Darum
   übersetzt dieser kleine Parser die Eingabe selbst in
     – eine JavaScript-Funktion  x => Zahl  (zum Rechnen) und
     – sauberes LaTeX (für die Vorschau, damit man genau sieht,
       wie die Eingabe verstanden wurde).
   Es wird niemals eval() oder new Function() benutzt: Erlaubt ist
   nur, was hier ausdrücklich programmiert ist. Alles andere ergibt
   eine Fehlermeldung.

   Normale Schreibweise wie bei Graphwar: x^2/3, sqrt(x), sin(x/2).
   Zusätzlich erlaubt (Backslash immer optional):
     (x+1)/3       frac(x+1;3)     \frac{x+1}{3}   Bruch
     sqrt(3x)      \sqrt{3x}       sqrt[3](x)   Wurzel / n-te Wurzel
     x^2   x^(2x+1)   x^{2x+1}   e^-x           Potenz
     sin(x)  cos(x)  e^x  abs(x)  |x|  ...      Funktionen
   Logarithmen und arcsin/arccos/arctan gibt es absichtlich nicht
   (REMOVED_WORDS) – sie machen im Spiel zu viele Probleme.
   Runde Klammern () gehen überall dort, wo LaTeX {} verlangt.

   Jeder Teil des Ausdrucks wird zu einem Knoten { f, hasX, tex, kind }:
   f rechnet den Wert aus, hasX merkt sich, ob x darin vorkommt
   (daraus werden die Funktionstypen für die Einstellungen erkannt),
   tex ist die LaTeX-Darstellung.

   Grammatik (von niedriger zu hoher Rangfolge):
     Ausdruck = Term   { (+|-) Term }
     Term     = Unär   { (*|/) Unär  |  Potenz (implizites Mal, z. B. 2x) }
     Unär     = -Unär | +Unär | Potenz
     Potenz   = Basis [ ^ [-] Basis ]
     Basis    = Zahl | x | e | pi | (Ausdruck) | |Ausdruck|
              | frac(..;..) | sqrt(..) | sin(..) usw.
   ========================================================== */

// Alle Funktionen, die in den Einstellungen einzeln abgeschaltet werden können.
// Lineare Funktionen (m·x + b) sind immer erlaubt.
const FUNCTION_TYPES = {
  power:    { group: 'Grundlagen', label: 'x^2  x(x+1)' },
  rational: { group: 'Grundlagen', label: '1/x' },
  abs:      { group: 'Grundlagen', label: '|x|' },
  sqrt:     { group: 'Wurzeln', label: 'sqrt(x)' },
  root:     { group: 'Wurzeln', label: 'sqrt[n](x)' },
  exp:      { group: 'Exponential', label: 'e^x  2^x' },
  sin:      { group: 'Trigonometrie', label: 'sin' },
  cos:      { group: 'Trigonometrie', label: 'cos' },
  tan:      { group: 'Trigonometrie', label: 'tan' },
  cot:      { group: 'Trigonometrie', label: 'cot' },
  sinh:     { group: 'Hyperbolisch', label: 'sinh' },
  cosh:     { group: 'Hyperbolisch', label: 'cosh' },
  tanh:     { group: 'Hyperbolisch', label: 'tanh' },
};

// Unterstützte Funktionen: Name -> JavaScript-Funktion, Funktionstyp, LaTeX-Befehl
const FUNCTIONS = {
  sin: { fn: Math.sin, type: 'sin', tex: '\\sin' },
  cos: { fn: Math.cos, type: 'cos', tex: '\\cos' },
  tan: { fn: Math.tan, type: 'tan', tex: '\\tan' },
  cot: { fn: x => 1 / Math.tan(x), type: 'cot', tex: '\\cot' },
  sinh: { fn: Math.sinh, type: 'sinh', tex: '\\sinh' },
  cosh: { fn: Math.cosh, type: 'cosh', tex: '\\cosh' },
  tanh: { fn: Math.tanh, type: 'tanh', tex: '\\tanh' },
  exp: { fn: Math.exp, type: 'exp', tex: '\\exp' },
  abs: { fn: Math.abs, type: 'abs', tex: null },      // wird als |x| angezeigt
};

// Funktionen, die es absichtlich nicht gibt (Logarithmen, Umkehrfunktionen) – mit eigener Fehlermeldung
const REMOVED_WORDS = ['arcsin', 'arccos', 'arctan', 'ln', 'log', 'lg'];

// Befehle, die mit und ohne Backslash funktionieren. Längste zuerst,
// damit z. B. "sinh" nicht als "sin" + "h" gelesen wird.
const WORDS = ['frac', 'dfrac', 'tfrac', 'sqrt', 'pi', 'cdot', 'times', ...Object.keys(FUNCTIONS), ...REMOVED_WORDS]
  .sort((a, b) => b.length - a.length);

// Fehler, die durch die Eingabe entstehen (werden dem Spieler gezeigt)
function fail(message) {
  const error = new Error(message);
  error.isInputError = true;
  throw error;
}

// Entfernt ein vorangestelltes "f(x)=" oder "y="
function stripPrefix(text) {
  return text.replace(/^\s*(f\s*\(\s*x\s*\)|y['’′´`″]{0,2})\s*=/, '');
}

// Schussrichtung vor der Funktion: „L“ oder „l“ schießt nach links, „R“, „r“ oder nichts nach
// rechts. Erlaubt mit oder ohne Leerzeichen/Doppelpunkt und auch hinter „f(x) =“, z. B.
// „L x^2“, „lx/2“, „R: sin(x)“, „f(x) = L x^2“. ln, log und lg bleiben Wörter (die gibt es im
// Spiel nicht – dafür kommt dann die passende Fehlermeldung).
// Ergebnis: { dir: 1 (rechts) oder −1 (links), text: Eingabe ohne den Buchstaben }
function splitDirection(input) {
  const m = /^(\s*(?:(?:f\s*\(\s*x\s*\)|y['’′´`″]{0,2})\s*=)?\s*)([LlRr])(?![nN]|[oO][gG]|[gG])\s*:?\s*/.exec(String(input));
  if (!m) return { dir: 1, text: String(input) };
  return { dir: m[2] === 'L' || m[2] === 'l' ? -1 : 1, text: m[1] + String(input).slice(m[0].length) };
}

// Variablen der Profi-Modi: y (Höhe) und y' (Steigung). Sie werden beim Lösen der
// Differentialgleichung gesetzt, bevor die Funktion ausgerechnet wird (siehe odeStepper).
const odeVars = { y: 0, p: 0 };

// Wandelt einen Befehlsnamen in ein Token um
function commandToken(name) {
  if (REMOVED_WORDS.includes(name)) fail(`${name} gibt es hier nicht`);
  if (name in FUNCTIONS) return { type: 'func', name };
  if (name === 'sqrt') return { type: 'sqrt' };
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') return { type: 'frac' };
  if (name === 'pi') return { type: 'const', value: Math.PI, tex: '\\pi' };
  if (name === 'cdot' || name === 'times') return { type: 'sym', value: '*' };
  if (name === 'div') return { type: 'sym', value: '/' };
  return fail(`Unbekannt: ${name}`);
}

// Zerlegt den Text in Tokens (Zahlen, x, Befehle, Zeichen).
// vars: zusätzlich erlaubte Variablen – 'y' (Modus y′) und 'p' für y' (Modus y″)
function tokenize(source, vars = []) {
  const s = source
    .replace(/[’′´`]/g, "'")                    // verschiedene Striche für y'
    .replace(/\\left|\\right/g, '')            // \left( ... \right) -> ( ... )
    .replace(/\\[,;:! ]|\\q?quad/g, ' ')       // LaTeX-Abstände ignorieren
    .replace(/\{,\}/g, ',')                     // 0{,}5 -> 0,5
    .replace(/[−–]/g, '-')                      // Unicode-Minus
    .replace(/[·×]/g, '*')
    .replace(/\$/g, '');

  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);

    if (/\s/.test(ch)) { i++; continue; }

    // Zahlen: 3, 12, 0.5 oder 0,5 (deutsches Komma)
    const num = /^(\d+([.,]\d+)?|\.\d+)/.exec(rest);
    if (num) {
      tokens.push({ type: 'num', value: parseFloat(num[0].replace(',', '.')), text: num[0] });
      i += num[0].length;
      continue;
    }

    // Befehle mit Backslash: \frac, \sin, \pi, ...
    if (ch === '\\') {
      const cmd = /^\\([a-zA-Z]+)/.exec(rest);
      if (!cmd) fail('Nach \\ fehlt ein Befehl');
      tokens.push(commandToken(cmd[1]));
      i += cmd[0].length;
      continue;
    }

    // Buchstaben: bekannte Wörter (sin, frac, sqrt, pi, ...) oder einzelne Buchstaben
    if (/[a-zA-Z]/.test(ch)) {
      const word = WORDS.find(w => s.startsWith(w, i));
      if (word) {
        tokens.push(commandToken(word));
        i += word.length;
      } else if (ch === 'x') {
        tokens.push({ type: 'x' });
        i++;
      } else if (ch === 'y') {
        const prime = s[i + 1] === "'";
        const name = prime ? 'p' : 'y';
        if (!vars.includes(name)) {
          fail(prime ? 'y′ nur im Modus y″' : 'y nur in den Modi y′ und y″');
        }
        tokens.push({ type: 'var', name });
        i += prime ? 2 : 1;
      } else if (ch === 'e') {
        tokens.push({ type: 'const', value: Math.E, tex: 'e' });
        i++;
      } else {
        fail(`Unbekannt: ${ch} – nur x`);
      }
      continue;
    }

    if ('+-*/^_()[]{}|;'.includes(ch)) {
      tokens.push({ type: 'sym', value: ch });
      i++;
      continue;
    }

    fail(`Zeichen ${ch} geht nicht`);
  }
  return tokens;
}

// Lesbare Form eines Tokens für Fehlermeldungen
function describe(token) {
  if (!token) return 'Ende';
  if (token.type === 'num') return token.text;
  if (token.type === 'const') return token.tex.replace('\\', '');
  if (token.type === 'x') return 'x';
  if (token.type === 'func') return token.name;
  if (token.type === 'frac') return 'frac';
  if (token.type === 'sqrt') return 'sqrt';
  return token.value;
}

// sin und cos dürfen höchstens so schnell schwingen wie sin(4x): Die Zahl vor x
// ist höchstens MAX_TRIG_FACTOR. Geprüft wird allgemein, wie stark sich das
// Argument auf 1 Einheit ändert – überall, wo der Schuss hinkommen kann (das Feld
// geht von x = −25 bis 25, geprüft wird großzügig von −50 bis 50). So zählen auch
// sin(x*4), sin(8x/2) oder sin(x^2).
const MAX_TRIG_FACTOR = 4;
function checkTrigSpeed(name, arg) {
  for (let u = -50; u <= 49; u += 0.05) {
    if (Math.abs(arg(u + 1) - arg(u)) > MAX_TRIG_FACTOR + 1e-9) {
      fail(`Zu schnell – höchstens ${name}(${MAX_TRIG_FACTOR}x)`);
    }
  }
}

// n-te Wurzel; ungerade Wurzeln funktionieren auch für negative Zahlen
function nthRoot(a, n) {
  if (a < 0 && Number.isInteger(n) && n % 2 === 1) return -Math.pow(-a, 1 / n);
  return Math.pow(a, 1 / n);
}

// Baut aus den Tokens Funktion + LaTeX (rekursiver Abstieg).
// xTex: wie x in der LaTeX-Ausgabe erscheint (z. B. "(x+5)" für die
// Anzeige „Formel mit deiner Position“). Ergebnis: { fn, types, tex }
function parseTokens(tokens, xTex = 'x') {
  let pos = 0;
  const types = new Set();
  const peek = () => tokens[pos];
  const isSym = (t, v) => t !== undefined && t.type === 'sym' && t.value === v;
  const OPEN = { '(': ')', '{': '}', '[': ']' };
  const isOpen = t => isSym(t, '(') || isSym(t, '{') || isSym(t, '[');

  // Knoten bauen: hasX ist wahr, sobald ein Teil x enthält
  const node = (f, parts, tex, kind = 'atom') => ({ f, hasX: parts.some(p => p.hasX), tex, kind });
  const constant = (value, tex) => ({ f: () => value, hasX: false, tex, kind: /^\d/.test(tex) ? 'num' : 'atom' });
  const variable = { f: x => x, hasX: true, tex: xTex, kind: 'atom' };
  const odeY = { f: () => odeVars.y, hasX: true, tex: 'y', kind: 'atom' };     // Profi-Modi
  const odeP = { f: () => odeVars.p, hasX: true, tex: "y'", kind: 'atom' };
  const paren = tex => `\\left(${tex}\\right)`;
  const bare = n => (n.kind === 'group' ? n.inner.tex : n.tex);   // äußere Klammern weglassen

  function multiply(a, b, explicit) {
    if (a.hasX && b.hasX) types.add('power');           // x·x, x(x+1), ...
    // Zwei Zahlen direkt hintereinander bräuchten einen Malpunkt, sonst sähe 2·3 wie 23 aus
    const dot = explicit || b.kind === 'num' || b.kind === 'neg';
    return node(x => a.f(x) * b.f(x), [a, b], `${a.tex}${dot ? '\\cdot ' : ' '}${b.tex}`, 'product');
  }
  function divide(a, b) {
    if (b.hasX) types.add('rational');                  // x im Nenner
    return node(x => a.f(x) / b.f(x), [a, b], `\\frac{${bare(a)}}{${bare(b)}}`, 'frac');
  }

  // Kann mit diesem Token ein neuer Faktor beginnen? (für implizites Mal: 2x, 3sin(x), (x+1)(x-1), 2|x|)
  // Ein „|“ öffnet nur außerhalb eines Betrags einen neuen Faktor – drinnen schließt es ihn.
  let absDepth = 0;
  function startsFactor(t) {
    if (!t) return false;
    if (['num', 'x', 'var', 'const', 'func', 'frac', 'sqrt'].includes(t.type)) return true;
    if (isSym(t, '|')) return absDepth === 0;
    return isOpen(t);
  }

  function endedTooEarly() {
    const prev = tokens[pos - 1];
    fail(prev ? `Nach ${describe(prev)} fehlt etwas` : 'Unvollständig');
  }

  function expect(value) {
    if (isSym(peek(), value)) { pos++; return; }
    fail(`${value} fehlt`);
  }

  // Klammer-Gruppe ( ... ), { ... } oder [ ... ] – wird immer mit runden Klammern angezeigt
  function group() {
    const close = OPEN[tokens[pos].value];
    pos++;
    const inner = expression();
    expect(close);
    return { f: inner.f, hasX: inner.hasX, tex: paren(inner.tex), kind: 'group', inner };
  }

  function expression() {
    let left = term();
    while (isSym(peek(), '+') || isSym(peek(), '-')) {
      const op = tokens[pos++].value;
      const a = left, b = term();
      left = node(op === '+' ? x => a.f(x) + b.f(x) : x => a.f(x) - b.f(x), [a, b], `${a.tex}${op}${b.tex}`, 'sum');
    }
    return left;
  }

  function term() {
    let left = unary();
    for (;;) {
      const t = peek();
      if (isSym(t, '*') || isSym(t, '/')) {
        pos++;
        const right = unary();
        left = t.value === '*' ? multiply(left, right, true) : divide(left, right);
      } else if (startsFactor(t)) {
        left = multiply(left, power(), false);   // implizites Mal: 2x, x(x+1)
      } else {
        return left;
      }
    }
  }

  function unary() {
    if (isSym(peek(), '-')) {
      pos++;
      const a = unary();
      return node(x => -a.f(x), [a], `-${a.kind === 'neg' ? paren(a.tex) : a.tex}`, 'neg');
    }
    if (isSym(peek(), '+')) { pos++; return unary(); }
    return power();
  }

  function power() {
    const base = primary();
    if (!isSym(peek(), '^')) return base;
    pos++;
    return raise(base, exponent());
  }

  function raise(base, exp) {
    if (exp.hasX) types.add('exp');            // x im Exponenten: e^x, 2^x
    else if (base.hasX) types.add('power');    // x in der Basis:  x^2
    const baseTex = base.kind === 'frac' || base.kind === 'neg' || base.kind === 'power' ? paren(base.tex) : base.tex;
    return node(x => Math.pow(base.f(x), exp.f(x)), [base, exp], `${baseTex}^{${bare(exp)}}`, 'power');
  }

  // Exponent: optionales Vorzeichen + EIN Baustein (Zahl, x, Funktion oder Klammer),
  // Potenztürme von rechts wie in der Mathematik: x^2^3 = x^(2^3), e^-x^2 = e^(−x²).
  // x^(2x+1) für längere Exponenten. e^2x heißt (wie beim Taschenrechner) e² · x.
  function exponent() {
    const t = peek();
    if (!t) endedTooEarly();
    if (isSym(t, '-') || isSym(t, '+')) {
      pos++;
      const a = exponent();
      return t.value === '-' ? node(x => -a.f(x), [a], `-${bare(a)}`, 'neg') : a;
    }
    if (startsFactor(t) || isSym(t, '|')) {
      const base = primary();
      if (!isSym(peek(), '^')) return base;
      pos++;
      return raise(base, exponent());
    }
    fail('Exponent fehlt: x^2');
  }

  // Argument von frac/sqrt im LaTeX-Stil: (Gruppe), {Gruppe} oder ein einzelnes Zeichen
  function argument(command) {
    const t = peek();
    if (!t) endedTooEarly();
    if (isOpen(t)) return group();
    if (t.type === 'num' && t.text.length === 1) { pos++; return constant(t.value, t.text); }
    if (['x', 'var', 'const', 'frac', 'sqrt'].includes(t.type)) return primary();
    fail(`Klammern: ${command === 'frac' ? 'frac(a;b)' : 'sqrt(x)'}`);
  }

  function primary() {
    const t = peek();
    if (!t) endedTooEarly();

    if (t.type === 'num') { pos++; return constant(t.value, t.text.replace(',', '{,}')); }
    if (t.type === 'const') { pos++; return constant(t.value, t.tex); }
    if (t.type === 'x') { pos++; return variable; }
    if (t.type === 'var') { pos++; return t.name === 'y' ? odeY : odeP; }
    if (isOpen(t)) return group();

    if (isSym(t, '|')) {
      pos++;
      absDepth++;
      const a = expression();
      absDepth--;
      expect('|');
      if (a.hasX) types.add('abs');
      return node(x => Math.abs(a.f(x)), [a], `\\left|${a.tex}\\right|`);
    }

    // frac(Zähler;Nenner), frac(Zähler)(Nenner) oder \frac{Zähler}{Nenner}
    if (t.type === 'frac') {
      pos++;
      if (isSym(peek(), '(')) {
        pos++;
        const top = expression();
        if (isSym(peek(), ';')) {
          pos++;
          const bottom = expression();
          expect(')');
          return divide(top, bottom);
        }
        expect(')');
        return divide(top, argument('frac'));
      }
      const top = argument('frac');
      return divide(top, argument('frac'));
    }

    // sqrt(x), sqrt[3](x), \sqrt{x}, \sqrt[3]{x}
    if (t.type === 'sqrt') {
      pos++;
      let n = null;
      if (isSym(peek(), '[')) {
        pos++;
        n = expression();
        expect(']');
      }
      const a = argument('sqrt');
      if (a.hasX) types.add(n ? 'root' : 'sqrt');
      const tex = n ? `\\sqrt[${n.tex}]{${bare(a)}}` : `\\sqrt{${bare(a)}}`;
      return node(n ? x => nthRoot(a.f(x), n.f(x)) : x => Math.sqrt(a.f(x)), n ? [a, n] : [a], tex);
    }

    if (t.type === 'func') {
      pos++;
      const info = FUNCTIONS[t.name];
      let exp = null;
      if (isSym(peek(), '_')) fail(`${t.name} hat keinen Index „_“`);
      if (isSym(peek(), '^')) { pos++; exp = exponent(); }   // sin^2(x)
      // sin^-1(x) heißt in der Mathematik arcsin(x), nicht 1/sin(x) – Umkehrfunktionen gibt es nicht
      if (exp && !exp.hasX && exp.f(0) === -1 && t.name !== 'abs') fail(`${t.name}^-1 gibt es nicht – für 1/${t.name}(x) so schreiben`);

      // Argument: in Klammern, z. B. sin(x) – oder ohne Klammern, z. B. sin x oder sin 2x
      let arg;
      const n = peek();
      if (isOpen(n) || isSym(n, '|')) {
        arg = primary();
      } else if (startsFactor(n) && n.type !== 'func') {
        arg = power();
        while (startsFactor(peek()) && peek().type !== 'func') arg = multiply(arg, power(), false);
      } else {
        fail(`Argument fehlt: ${t.name}(x)`);
      }
      if (arg.hasX) types.add(info.type);
      if (arg.hasX && (info.type === 'sin' || info.type === 'cos')) checkTrigSpeed(t.name, arg.f);

      const apply = x => info.fn(arg.f(x));
      const expTex = exp ? `^{${bare(exp)}}` : '';
      let tex;
      if (info.tex === null) tex = `\\left|${bare(arg)}\\right|${expTex}`;           // abs(x) -> |x|
      else tex = `${info.tex}${expTex}${paren(bare(arg))}`;
      const parts = [arg, exp].filter(Boolean);
      if (exp) return node(x => Math.pow(apply(x), exp.f(x)), parts, tex);
      return node(apply, parts, tex);
    }

    if (isSym(t, ';')) fail('; nur in frac(a;b)');
    fail(`${describe(t)} passt hier nicht`);
  }

  const root = expression();
  if (pos < tokens.length) {
    const t = peek();
    if (isSym(t, ')') || isSym(t, '}') || isSym(t, ']')) fail(`Zu viele ${t.value}`);
    if (isSym(t, ';')) fail('; nur in frac(a;b)');
    fail(`${describe(t)} passt hier nicht`);
  }
  return { fn: root.f, types: [...types], tex: root.tex };
}

// Haupteinstieg: Eingabe -> { ok: true, fn, types, tex } oder { ok: false, error }
//   fn  = die Funktion genau wie eingegeben (x im Koordinatensystem des Spielers, siehe Abschnitt 4)
//   mode = 'y' (Funktion), 'y1' (y′ = f(x, y)) oder 'y2' (y″ = f(x, y, y′))
function compileLatex(input, xTex = 'x', mode = 'y') {
  try {
    const text = stripPrefix(String(input)).trim();
    if (text === '') return { ok: false, error: 'Funktion eingeben' };
    const vars = mode === 'y1' ? ['y'] : mode === 'y2' ? ['y', 'p'] : [];
    const { fn, types, tex } = parseTokens(tokenize(text, vars), xTex);
    fn(1);   // einmal ausprobieren
    return { ok: true, fn, types, tex };
  } catch (err) {
    if (err.isInputError) return { ok: false, error: err.message };
    return { ok: false, error: 'Eingabe ungültig' };
  }
}

/* ==========================================================
   4. KURVE, WÄNDE & TREFFERERKENNUNG
   ----------------------------------------------------------
   Jeder Spieler hat sein EIGENES Koordinatensystem: Der Nullpunkt
   (0 | 0) liegt in ihm selbst, und er sieht sich links (gespiegelt,
   falls er in der Welt rechts steht – siehe Abschnitt 2). Er schießt
   nach rechts, also für x ≥ 0 – oder mit „L“ vor der Funktion nach
   links, für x ≤ 0 (splitDirection). Gezeichnet wird der Graph von f
   in diesem System, nur in y-Richtung verschoben, so dass er aus dem
   Spieler herauskommt:

       y(x) = f(x) − f(0)        für x von 0 bis zum rechten Rand

   x^2 hat seinen Scheitel also immer beim Spieler, egal wo er steht.
   Ein +b am Ende ändert nichts, weil es beim Verschieben wieder
   wegfällt. Ist f(0) nicht definiert (z. B. 1/x), kann nicht
   geschossen werden. In den Profi-Modi wird die Differentialgleichung
   exakt im Spieler gestartet: y(0) = 0 (bei y″ zusätzlich
   y′(0) = Startsteigung).

   Wie bei Graphwar fliegt die Kurve durch Gegner hindurch und
   sprengt Löcher in Wände. Eine Reichweiten-Grenze gibt es nicht.
   Der Schuss endet erst,
     – an einer Wand (sind Wände zerstörbar, sprengt er ein Loch hinein, siehe
       blastWall und wallsBreakable),
     – wenn er das Spielfeld oben, unten oder seitlich verlässt,
     – wenn die Funktion nicht mehr definiert ist oder springt
       (z. B. 1/(x-3) bei x = 3).

   Der Schuss ist eine Punktliste; jeder Punkt kennt seine bisherige
   Kurvenlänge s. Zeichnen UND Treffererkennung benutzen genau
   dieselbe Liste.
   ========================================================== */

const STEP = 0.005;        // Abstand der Stützstellen in x-Richtung
const LINE_WIDTH = 0.15;   // Linienstärke der Kurve in Koordinaten-Einheiten (≈ 5 Pixel)
const MAX_VALUE = 1e4;     // |y| darüber gilt als „unendlich“ (weit außerhalb des Bildes)
const JUMP_LIMIT = 0.05;   // ab diesem y-Unterschied zweier Nachbarpunkte wird auf eine Unstetigkeit geprüft (≈ 1 Pixel)
const BLAST_RADIUS = 1;    // Radius des Lochs, das ein Schuss in eine Wand sprengt
const DRAW_SPACING = 0.04; // Abstand der Punkte zum Zeichnen (≈ 1 Pixel) – gerechnet wird mit allen

// Weniger Punkte zum Zeichnen: Eine Kurve hat bis zu 10 000 Stützstellen, zum
// Malen reicht etwa eine pro Pixel. Treffer werden weiter mit allen Punkten berechnet.
function thinPoints(points) {
  const out = [];
  let last = null;
  points.forEach((p, i) => {
    if (last && i !== points.length - 1 && Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < DRAW_SPACING) return;
    out.push(p);
    last = p;
  });
  return out;
}

// Wertet f sicher aus: NaN, ±Infinity und riesige Werte werden zu NaN
function safeEval(f, x) {
  const y = f(x);
  return Number.isFinite(y) && Math.abs(y) < MAX_VALUE ? y : NaN;
}

// Liegt zwischen zwei Nachbarpunkten eine Unstetigkeit (Polstelle oder Sprung)?
// Intervallhalbierung: Es wird immer die Hälfte mit der größeren Änderung weiter geteilt.
// Bei einer stetigen Funktion schrumpft die Änderung mit dem Intervall (sie wird
// irgendwann kleiner als JUMP_LIMIT / 2), bei einem Pol wird die Funktion irgendwo
// dazwischen riesig/undefiniert, bei einem Sprung (z. B. (x−3)/|x−3| bei x = 3) bleibt
// die Änderung gleich groß, auch wenn das Intervall winzig ist.
function isJump(f, u0, u1, y0, y1) {
  if (!(Math.abs(y1 - y0) >= JUMP_LIMIT)) return false;
  let a = u0, b = u1, ya = y0, yb = y1;
  const change = [];
  for (let k = 0; k < 60; k++) {
    const d = Math.abs(yb - ya);
    if (d < JUMP_LIMIT / 2) return false;
    change.push(d);
    const m = (a + b) / 2;
    if (m === a || m === b) break;             // genauer geht es mit Kommazahlen nicht
    const ym = safeEval(f, m);
    if (Number.isNaN(ym)) return true;         // Pol oder Lücke dazwischen
    if (Math.abs(ym - ya) >= Math.abs(yb - ym)) { b = m; yb = ym; } else { a = m; ya = ym; }
  }
  // Ganz steile, aber stetige Stellen (z. B. die 9. Wurzel bei 0) schrumpfen langsam, aber
  // stetig; ein echter Sprung schrumpft gar nicht mehr.
  const last = change[change.length - 1];
  return last > 0.75 * change[Math.max(0, change.length - 21)];
}

// Punkt auf der Strecke a–b beim Anteil t (0 = a, 1 = b)
function lerpPoint(a, b, t) {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), s: 0 };
}

// Läuft die Strecke a–b in eine Wand? Exakt gerechnet: Die Strecke wird Kästchen für
// Kästchen verfolgt (in der Reihenfolge, in der sie die Kästchen betritt) – nur der Teil
// innerhalb des Spielfelds. Ergebnis: Anteil t, an dem sie das erste Wand-Kästchen
// betritt (der Punkt liegt genau auf dem Rand der Wand), oder null.
function wallHit(a, b, grid) {
  if (!grid) return null;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dy !== 0) {
    const tA = (VIEW.yMin - a.y) / dy;
    const tB = (VIEW.yMax - a.y) / dy;
    t0 = Math.max(0, Math.min(tA, tB));
    t1 = Math.min(1, Math.max(tA, tB));
  } else if (a.y < VIEW.yMin || a.y > VIEW.yMax) {
    return null;
  }
  if (t0 > t1) return null;

  // Kästchen-Koordinaten: Spalte = u, Zeile = v (zählt nach unten)
  const u0 = a.x - VIEW.xMin, du = dx;
  const v0 = VIEW.yMax - a.y, dv = -dy;
  const u = u0 + t0 * du, v = v0 + t0 * dv;
  // Startkästchen: das, in das die Strecke hineinläuft (wichtig, wenn sie auf einer Kante beginnt)
  let c = du < 0 ? Math.ceil(u) - 1 : Math.floor(u);
  let r = dv < 0 ? Math.ceil(v) - 1 : Math.floor(v);
  const stepC = du > 0 ? 1 : -1, stepR = dv > 0 ? 1 : -1;
  let nextC = du > 0 ? (c + 1 - u0) / du : du < 0 ? (c - u0) / du : Infinity;   // t an der nächsten senkrechten Kante
  let nextR = dv > 0 ? (r + 1 - v0) / dv : dv < 0 ? (r - v0) / dv : Infinity;   // … waagerechten Kante
  const deltaC = du !== 0 ? Math.abs(1 / du) : Infinity;
  const deltaR = dv !== 0 ? Math.abs(1 / dv) : Infinity;
  let t = t0;
  for (;;) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === CELL.WALL) return t;
    if (nextC < nextR) { t = nextC; c += stepC; nextC += deltaC; } else { t = nextR; r += stepR; nextR += deltaR; }
    if (t > t1) return null;
  }
}

// Profi-Modi wie bei Graphwar: löst y′ = f(x, y) bzw. y″ = f(x, y, y′) Schritt für
// Schritt (Runge-Kutta 4. Ordnung) im Koordinatensystem des Spielers. Anfangswert:
// y(0) = 0 (im Spieler), bei y″ zusätzlich y′(0) = shape.slope.
// Ergebnis: Funktion, die bis zum nächsten x weiterrechnet und y liefert
// (NaN = nicht mehr definiert).
function odeStepper(shape) {
  let u = 0;
  let y = 0;
  let p = shape.slope || 0;
  const F = (uu, yy, pp) => { odeVars.y = yy; odeVars.p = pp; return shape.fn(uu); };
  return target => {
    const h = target - u;
    if (shape.order === 1) {
      const k1 = F(u, y, 0);
      const k2 = F(u + h / 2, y + h * k1 / 2, 0);
      const k3 = F(u + h / 2, y + h * k2 / 2, 0);
      const k4 = F(u + h, y + h * k3, 0);
      y += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
    } else {
      const a1 = p, b1 = F(u, y, p);
      const a2 = p + h / 2 * b1, b2 = F(u + h / 2, y + h / 2 * a1, a2);
      const a3 = p + h / 2 * b2, b3 = F(u + h / 2, y + h / 2 * a2, a3);
      const a4 = p + h * b3, b4 = F(u + h, y + h * a3, a4);
      y += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
      p += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
    }
    u = target;
    return Number.isFinite(y) && Math.abs(y) < MAX_VALUE && Number.isFinite(p) ? y : NaN;
  };
}

// Berechnet den Schuss: y(x) = f(x) − f(0) im Koordinatensystem des Spielers,
// von ihm aus nach rechts (dir = 1, x ≥ 0) oder nach links (dir = −1, x ≤ 0), bis er
// endet (siehe oben). Die Punkte werden in Welt-Koordinaten gespeichert: Steht der
// Spieler gespiegelt, läuft „rechts“ in der Welt nach links. limit = höchste Kurvenlänge – nur für Probeschüsse (lineCanHit), ein
// echter Schuss hat keine Grenze.
// f ist eine Funktion – oder in den Profi-Modi { order, fn, slope } (Differentialgleichung).
// Ergebnis: { points, length, end, endReason, blocked, dir }
function buildArm(f, player, grid, limit = Infinity, dir = 1) {
  const shape = typeof f === 'function' ? null : f;
  const mirror = mirrorOf(player);
  const f0 = shape ? 0 : safeEval(f, 0);
  const points = [];
  let length = 0;
  let endReason = 'edge';
  if (Number.isNaN(f0)) return { points, length, end: null, endReason: 'undefined', blocked: false, dir };

  const own = ownX(player.x, player);
  const distance = dir > 0 ? VIEW.xMax - own : own - VIEW.xMin;   // bis zum Rand in Schussrichtung (eigene Ansicht)
  const steps = Math.ceil(distance / STEP);
  const g = shape ? null : x => player.y + f(mirror * (x - player.x)) - f0;   // Höhe der Kurve über dem Welt-x
  const step = shape ? odeStepper(shape) : null;
  let prevX = player.x;
  let prevY = player.y;

  for (let i = 0; i <= steps; i++) {
    const u = dir * Math.min(i * STEP, distance);  // eigenes x (vom Spieler aus, links negativ)
    const x = player.x + mirror * u;               // Welt-x
    const y = i === 0 ? player.y : step ? player.y + step(u) : safeEval(g, x);
    if (Number.isNaN(y)) { endReason = 'undefined'; break; }
    if (i > 0 && g && isJump(g, prevX, x, prevY, y)) { endReason = 'jump'; break; }

    let p = { x, y, s: length };
    const last = points[points.length - 1];
    if (last) {
      let stop = null;
      // Verlässt der Schuss das Spielfeld oben oder unten? Dann endet er genau am Rand.
      if (y > VIEW.yMax || y < VIEW.yMin) {
        const edge = y > VIEW.yMax ? VIEW.yMax : VIEW.yMin;
        p = lerpPoint(last, p, (edge - last.y) / (y - last.y));
        stop = 'out';
      }
      const t = wallHit(last, p, grid);
      if (t !== null) { p = lerpPoint(last, p, t); stop = 'wall'; }   // Wand: Schuss endet kurz davor
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const piece = Math.sqrt(dx * dx + dy * dy);   // schneller als Math.hypot (läuft bis zu 10 000-mal pro Kurve)
      if (length + piece > limit) {
        p = lerpPoint(last, p, (limit - length) / piece);   // Probeschuss: genau bei limit enden
        length = limit;
        stop = 'reach';
      } else {
        length += piece;
      }
      p.s = length;
      points.push(p);
      if (stop) { endReason = stop; break; }
    } else {
      points.push(p);
    }
    prevX = x;
    prevY = y;
  }
  return {
    points, length, endReason, dir,
    get drawPoints() { return this._draw || (this._draw = thinPoints(points)); },   // erst beim Zeichnen berechnet
    end: points[points.length - 1] || null,
    blocked: endReason === 'wall',
  };
}

// Berechnet den ganzen Schuss. dir: 1 = nach rechts, −1 = nach links.
// Ergebnis: { arms: [arm], f0, dir, ode } oder { error }
// (arms ist eine Liste, damit Zeichnen und Treffererkennung allgemein bleiben)
function buildCurve(f, player, grid = null, dir = 1) {
  const shape = typeof f === 'function' ? null : f;
  if (shape) {
    odeVars.y = 0;
    odeVars.p = shape.slope || 0;
    if (!Number.isFinite(shape.fn(0))) {
      return { error: 'Bei (0 | 0) nicht definiert' };
    }
    const arm = buildArm(f, player, grid, Infinity, dir);
    if (arm.points.length < 2) return { error: 'Neben dir nicht lösbar' };
    return { arms: [arm], f0: 0, dir, ode: true };
  }
  const f0 = safeEval(f, 0);
  if (Number.isNaN(f0)) {
    const raw = f(0);
    if (Number.isFinite(raw)) {
      return { error: 'f(0) ist zu groß' };
    }
    return { error: 'f(0) nicht definiert' };
  }
  const arm = buildArm(f, player, grid, Infinity, dir);
  if (arm.points.length < 2) {
    return { error: 'Neben dir nicht definiert' };
  }
  return { arms: [arm], f0, dir };
}

// Wie bei Graphwar: Ein Schuss, der eine Wand trifft, sprengt dort ein rundes
// Loch hinein. Entfernt werden alle Wandkästchen, deren Mitte höchstens
// BLAST_RADIUS vom Einschlag entfernt ist. Ergebnis: Liste der entfernten Kästchen [c, r]
function blastWall(grid, point) {
  const removed = [];
  grid.forEach((row, r) => row.forEach((value, c) => {
    if (value !== CELL.WALL) return;
    const center = cellCenter(c, r);
    if (Math.hypot(center.x - point.x, center.y - point.y) > BLAST_RADIUS) return;
    row[c] = CELL.EMPTY;
    removed.push([c, r]);
  }));
  return removed;
}

// Startpunkte der Schüsse (erster Punkt jedes Arms)
function curveStarts(arms) {
  return arms.map(arm => arm.points[0]).filter(Boolean);
}

// Kürzester Abstand vom Punkt (px | py) zur Strecke a–b
function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));          // auf die Strecke begrenzen
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Treffererkennung: Ein Gegner ist getroffen, wenn irgendein Kurvenstück
// näher an seinem Mittelpunkt liegt als  Radius + halbe Linienstärke.
// Jeder Gegner kommt höchstens EINMAL in die Liste – auch wenn die Kurve
// ihn mehrmals kreuzt oder beide Arme ihn treffen. 's' ist die Kurven-
// länge bis zum ersten Treffer (damit der Schaden passend zur Schuss-
// Animation ausgelöst wird).
function findHits(arms, enemies) {
  const hits = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const reach = enemy.r + LINE_WIDTH / 2;
    const left = enemy.x - reach;
    const right = enemy.x + reach;
    let first = Infinity;
    for (const arm of arms) {
      const points = arm.points;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (a === null || b === null) continue;   // über Lücken hinweg gibt es keine Linie
        // Schnelltest: Liegt das Stück ganz links oder rechts neben dem Gegner, kann es ihn nicht berühren
        if ((a.x < left && b.x < left) || (a.x > right && b.x > right)) continue;
        if (distanceToSegment(enemy.x, enemy.y, a, b) <= reach) {
          first = Math.min(first, b.s);
          break;
        }
      }
    }
    if (first < Infinity) hits.push({ enemy, s: first });
  }
  return hits.sort((h1, h2) => h1.s - h2.s);
}

/* ==========================================================
   5. KARTENGENERIERUNG
   ----------------------------------------------------------
   So entsteht eine Level-Karte (Matrix):
     1. Spieler auf ein zufälliges freies Kreuz setzen (2×2 aus 5en).
     2. Für jede Gruppe im Rezept eine zufällige Funktion der
        gewünschten Form würfeln (SHAPES) und ihre Kurve vom
        Spieler aus berechnen.
     3. Kästchen suchen, durch deren Mitte diese Kurve läuft, und
        dort Gegner (1–3) setzen – mit Abstand zueinander.
     4. Wände (4) setzen: nie direkt neben Spieler oder Gegner,
        nie auf die Lösungskurven, gern aber auf die direkte Linie
        zwischen Spieler und Gegnern, damit simple Geraden nicht
        immer reichen.
     5. Probe: Die Lösung wird mit Wänden simuliert. Nur lösbare
        Karten werden genommen – sonst neuer Versuch.
   ========================================================== */

const ENDLESS_WALLS = 10;   // Wandstücke im Endlos-Modus

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Abstand zweier Kästchen in „Königszügen“ (Schach)
function chebyshev(a, b) {
  return Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
}

// Liegt das Kästchen zu nah am Spieler? (die 2 Ringe um seinen 2×2-Block)
function nearPlayer(c, r, player) {
  const center = cellCenter(c, r);
  return Math.max(Math.abs(center.x - player.x), Math.abs(center.y - player.y)) < 2.5;
}

// Ist der Bereich (Spalten c0..c1, Zeilen r0..r1) im Feld und komplett leer?
function isRegionFree(grid, c0, r0, c1, r1) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (grid[r][c] !== CELL.EMPTY) return false;
    }
  }
  return true;
}

// Ist das Kästchen leer und sind auch seine 8 Nachbarn leer?
function isAreaFree(grid, c, r) {
  return isRegionFree(grid, c - 1, r - 1, c + 1, r + 1);
}

// Ist das Kästchen leer und steht kein Gegner/Spieler daneben? (Wände dürfen sich berühren)
function isWallSpot(grid, c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS || grid[r][c] !== CELL.EMPTY) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const v = grid[r + dr] ? grid[r + dr][c + dc] : undefined;
      if (v !== undefined && v !== CELL.EMPTY && v !== CELL.WALL) return false;
    }
  }
  return true;
}

// Sucht ein freies Kreuz für den Spieler (mit Abstand zum Rand) in der linken
// Hälfte (x ≤ −3) – geschossen wird standardmäßig nach rechts. Sein 2×2-Block und der
// Ring drumherum müssen leer sein.
function findPlayerCross(grid, avoid = null) {
  for (let tries = 0; tries < 500; tries++) {
    const c = randomInt(3, COLS / 2 - 3);
    const r = randomInt(2, ROWS - 2);
    if (avoid && Math.max(Math.abs(c - avoid.c), Math.abs(r - avoid.r)) < 6) continue;
    if (isRegionFree(grid, c - 2, r - 2, c + 1, r + 1)) return { c, r };
  }
  return null;
}

// Spieler zufällig setzen
function placePlayer(grid) {
  const cross = findPlayerCross(grid);
  setPlayer(grid, cross.c, cross.r);
  return cross;
}

// Kästchen, durch deren Mitte (± 0,3) die Kurve läuft – Plätze für Gegner.
// Ein Gegner mit Radius ≥ 0,45 wird dort sicher getroffen.
function cellsOnCurve(arms) {
  const best = new Map();
  for (const arm of arms) {
    for (const p of arm.points) {
      if (p === null) continue;
      const cell = cellAt(p.x, p.y);
      if (!cell) continue;
      const center = cellCenter(cell.c, cell.r);
      const d = Math.hypot(p.x - center.x, p.y - center.y);
      const key = cell.r * COLS + cell.c;
      if (!best.has(key) || d < best.get(key).d) best.set(key, { c: cell.c, r: cell.r, d });
    }
  }
  return [...best.values()].filter(cell => cell.d <= 0.3);
}

// Wählt 'count' gut verteilte Kästchen auf der Kurve für eine Gegnergruppe
function pickEnemyCells(arms, grid, player, count) {
  const picked = [];
  for (const cell of shuffle(cellsOnCurve(arms))) {
    if (cell.r < 1) continue;                                 // oben Platz für die LP-Kästchen
    if (nearPlayer(cell.c, cell.r, player)) continue;         // nicht direkt beim Spieler
    if (!isAreaFree(grid, cell.c, cell.r)) continue;          // Platz um den Gegner
    if (picked.some(p => chebyshev(p, cell) < 3)) continue;   // Gegner verteilen
    picked.push(cell);
    if (picked.length === count) return picked;
  }
  return null;
}

// Merkt sich alle Kästchen, durch die eine Kurve läuft (dort keine Wände)
function markCurveCells(arms, set) {
  const nudges = [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]];
  for (const arm of arms) {
    for (const p of arm.points) {
      if (p === null) continue;
      for (const [dx, dy] of nudges) {
        const cell = cellAt(p.x + dx, p.y + dy);
        if (cell) set.add(cell.r * COLS + cell.c);
      }
    }
  }
}

// Punkte entlang einer Strecke (zum Schützen der direkten Schusslinien)
function segmentArm(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
  return { points: Array.from({ length: n + 1 }, (_, i) => lerpPoint(a, b, i / n)) };
}

// Setzt 'count' Wandstücke (1–4 Kästchen lang, waagerecht oder senkrecht)
function placeWalls(grid, count, protectedCells, playerCross, enemyCells) {
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 60; tries++) {
    let c, r;
    if (enemyCells.length && Math.random() < 0.5) {
      // auf die direkte Linie Spieler -> Gegner (versperrt einfache Geraden)
      const e = pick(enemyCells);
      const t = 0.3 + Math.random() * 0.4;
      c = Math.round(playerCross.c + t * (e.c - playerCross.c));
      r = Math.round(playerCross.r + t * (e.r - playerCross.r));
    } else {
      c = randomInt(0, COLS - 1);
      r = randomInt(0, ROWS - 1);
    }
    const horizontal = Math.random() < 0.5;
    const cells = Array.from({ length: randomInt(1, 4) }, (_, i) => (horizontal ? { c: c + i, r } : { c, r: r + i }));
    const ok = cells.every(cell => isWallSpot(grid, cell.c, cell.r) && !protectedCells.has(cell.r * COLS + cell.c));
    if (!ok) continue;
    for (const cell of cells) grid[cell.r][cell.c] = CELL.WALL;
    placed++;
  }
}

// Spielt die Lösung einer Karte durch: Sind danach alle Gegner zerstört?
function isSolvable(map) {
  const { player, enemies } = readMap(map.grid);
  if (!player || map.solution.length > map.shots) return false;
  for (const input of map.solution) {
    const result = compileLatex(input);
    if (!result.ok) return false;
    const curve = buildCurve(result.fn, player, map.grid);
    if (curve.error) return false;
    for (const hit of findHits(curve.arms, enemies)) hit.enemy.hp--;
  }
  return enemies.every(e => e.hp <= 0);
}

// Erzeugt eine zufällige, lösbare Karte nach einem Level-Rezept.
// Ergebnis: { grid, shots, solution }  (solution = Liste von Funktionen)
function generateLevelMap(level) {
  let lastMap = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const grid = emptyGrid();
    const cross = placePlayer(grid);
    const player = crossPoint(cross.c, cross.r);

    // Gegnergruppen auf zufälligen Kurven
    const groups = [];
    for (const shape of level.shapes) {
      for (let tries = 0; tries < 40; tries++) {
        const input = SHAPES[shape]();
        const result = compileLatex(input);
        const curve = buildCurve(result.fn, player, null);
        if (curve.error) continue;
        const cells = pickEnemyCells(curve.arms, grid, player, level.count);
        if (!cells) continue;
        const hps = cells.map(() => pick(level.hp));
        cells.forEach((cell, i) => { grid[cell.r][cell.c] = hps[i]; });
        groups.push({ input, arms: curve.arms, cells, maxHp: Math.max(...hps) });
        break;
      }
    }
    if (groups.length < level.shapes.length) continue;

    // Wände – nach vielen Fehlversuchen ohne Wände, damit es sicher klappt
    const protectedCells = new Set();
    groups.forEach(g => markCurveCells(g.arms, protectedCells));
    const walls = attempt < 80 ? level.walls : 0;
    placeWalls(grid, walls, protectedCells, cross, groups.flatMap(g => g.cells));

    const map = {
      grid,
      shots: groups.reduce((sum, g) => sum + g.maxHp, 0) + level.spareShots,
      solution: groups.flatMap(g => Array(g.maxHp).fill(g.input)),
    };
    if (isSolvable(map)) return map;
    lastMap = map;
  }
  return lastMap;
}

// Zufallszahlen aus einem Startwert (Seed, „mulberry32“): gleicher Seed → gleiche Folge
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Führt fn mit gesetztem Seed aus: Alle Zufallszahlen darin (Math.random) kommen aus
// dem Seed – so entsteht aus demselben Karten-Code immer dieselbe Karte.
function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try { return fn(); } finally { Math.random = original; }
}

// Karte für ein Level: feste Karte (layout) oder aus dem Seed erzeugt
function levelMap(level, seed) {
  if (level.layout) return { grid: layoutToGrid(level.layout), shots: level.shots, solution: level.solution || [] };
  return { ...withSeed(seed, () => generateLevelMap(level)), seed };
}

// Karten-Code: L<Level>-<Seed> für Level, K1-… für eigene Karten (Editor)
function mapCodeText() {
  if (state.mode === 'custom') return state.baseMap.code;
  if (state.mode === 'levels' && state.baseMap.seed !== undefined) {
    return `L${state.levelIndex + 1}-${state.baseMap.seed.toString(36).toUpperCase()}`;
  }
  return '';
}

// Lädt einen Karten-Code (aus dem Level-Fenster). Ergebnis: hat es geklappt?
function loadMapCode(code) {
  code = code.trim();
  const level = /^L(\d+)-([0-9A-Z]+)$/i.exec(code);
  if (level && Number(level[1]) >= 1 && Number(level[1]) <= LEVELS.length) {
    switchMode(() => loadLevel(Number(level[1]) - 1, true, parseInt(level[2], 36)));
    return true;
  }
  if (decodeMap(code)) {
    switchMode(() => startCustom(code));
    return true;
  }
  return false;
}

// Tages-Herausforderung: Level und Karte hängen nur vom Datum ab – alle spielen dieselbe
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startDaily() {
  const date = todayString();
  let h = 2166136261;
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  switchMode(() => loadLevel(3 + (h % (LEVELS.length - 3)), true, h % 2147483648, date));
}

// Endlos-Karte: nur Spieler und (falls eingeschaltet) Wände – Gegner erscheinen während des Spiels
function generateEndlessMap(withWalls = true) {
  const grid = emptyGrid();
  const cross = placePlayer(grid);
  if (withWalls) placeWalls(grid, ENDLESS_WALLS, new Set(), cross, []);
  return { grid, shots: Infinity, solution: [] };
}

// Tutorial-Karte: Spieler fest, Gegner und Wände relativ zum Spieler
function tutorialMap(step) {
  const grid = emptyGrid();
  const player = step.player || TUTORIAL_PLAYER;
  const cross = crossIndex(player);
  setPlayer(grid, cross.c, cross.r);
  for (const [dx, dy, hp] of step.enemies || []) {
    const cell = cellAt(player.x + dx, player.y + dy);
    grid[cell.r][cell.c] = hp;
  }
  for (const [dx, dy] of step.walls || []) {
    const cell = cellAt(player.x + dx, player.y + dy);
    grid[cell.r][cell.c] = CELL.WALL;
  }
  return { grid, shots: Infinity, solution: step.solution || [] };
}


/* ==========================================================
   6. SPIELZUSTAND & SPIELLOGIK
   ========================================================== */

const SHOT_SPEED = 25;          // so viel Kurvenlänge wird pro Sekunde gezeichnet
const MAX_TRAILS = 3;           // so viele alte Schüsse bleiben blass sichtbar
let trailCounter = 0;           // Nummer für jede Spur (damit die Hintergrund-Ebene merkt, wenn eine dazukommt)
const SANDBOX_TRAILS = 8;       // … im Sandkasten (zum Vergleichen von Kurven)
const STORAGE_KEY = 'functionFighter.unlocked';

// Endlos-Modus
const ENDLESS_MOVE_EVERY = 5;   // nach so vielen Schüssen zieht der Spieler um
const ENDLESS_MIN_ENEMIES = 3;  // so viele Gegner sind am Anfang auf dem Feld …
const ENDLESS_MAX_ENEMIES = 9;  // … und höchstens so viele später
const ENDLESS_NEAR = 28;        // neue Gegner erscheinen möglichst höchstens so weit vom Spieler entfernt

const state = {
  mode: 'levels',    // 'levels' | 'endless' | 'tutorial' | 'sandbox'
  levelIndex: 0,
  tutorialIndex: 0,
  unlocked: 0,       // höchstes freigeschaltetes Level (Index)
  map: null,         // aktuelle Karte { grid, shots, solution } – Wände bekommen hier Löcher
  baseMap: null,     // dieselbe Karte unverändert (für ↻ Neustart)
  player: { x: 0, y: 0 },
  enemies: [],
  shotsLeft: 0,      // Level-Modus
  shotsFired: 0,     // Endlos-Modus & Tutorial
  score: 0,          // Endlos-Modus: zerstörte Gegner
  bestCombo: 0,      // Endlos-Modus: meiste Gegner mit einem Schuss
  status: 'playing', // 'playing' | 'won' | 'lost'
  shot: null,        // laufender Schuss { arms, hits, progress, nextHit, kills, info }
  trails: [],        // letzte Schüsse { arms }
  inputMode: 'y',    // 'y' (Funktion), 'y1' (y′ = …), 'y2' (y″ = …)
  daily: null,       // Datum, wenn die Tages-Herausforderung läuft
  particles: [],
  mouse: null,       // Mausposition in Mathe-Koordinaten
  loadId: 0,         // zählt Spielstarts (für verzögerte Overlays)
};

// Einstellungen: abgeschaltete Funktionstypen, Wände im Endlos-Modus
const settings = { disabled: new Set(), endlessWalls: true, wallsBreakable: true };

// Sprengen Schüsse Löcher in Wände? Im Multiplayer entscheidet der Host (Lobby-Einstellung),
// sonst die eigene Einstellung (⚙ Einstellungen → Wände zerstörbar).
function wallsBreakable() {
  if (state.mode === 'multi') return !(mp.lobby && mp.lobby.settings.wallsBreakable === false);
  return settings.wallsBreakable;
}

function currentLevel() { return LEVELS[state.levelIndex]; }
function aliveEnemies() { return state.enemies.filter(e => e.hp > 0); }
const limitedShots = () => state.mode === 'levels' || state.mode === 'custom';

// Aktueller Zustand als Matrix: Wände aus der Karte, dazu Spieler und lebende Gegner
function currentGrid() {
  const grid = state.map.grid.map(row => row.map(v => (v === CELL.WALL ? v : CELL.EMPTY)));
  const cross = crossIndex(state.player);
  setPlayer(grid, cross.c, cross.r);
  for (const e of aliveEnemies()) {
    const cell = cellAt(e.x, e.y);
    if (cell) grid[cell.r][cell.c] = e.hp;
  }
  return grid;
}

/* ---------- Speichern (localStorage) ---------- */

function loadValue(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch { return fallback; }
}

function saveValue(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* z. B. privater Modus */ }
}

function loadProgress() {
  const n = loadValue(STORAGE_KEY, 0);
  return Number.isInteger(n) ? Math.max(0, Math.min(n, LEVELS.length - 1)) : 0;
}

/* ---------- Funktionstypen erlauben / sperren ---------- */

// Welche der erkannten Typen sind in den Einstellungen abgeschaltet?
function blockedTypes(types) {
  return types.filter(t => settings.disabled.has(t));
}

function typeNames(types) {
  return types.map(t => FUNCTION_TYPES[t].label).join(', ');
}

/* ---------- Spielstart ---------- */

function resetRound() {
  state.status = 'playing';
  state.shot = null;
  state.trails = [];
  state.particles = [];
  state.shotsFired = 0;
  state.loadId++;
  ui.overlay.hidden = true;
  showMessage('');
}

// Übernimmt Spieler und Gegner aus der Karten-Matrix. Gespielt wird auf einer
// Kopie, damit gesprengte Löcher in Wänden bei ↻ Neustart wieder zu sind.
function applyMap(map) {
  state.baseMap = map;
  state.map = { ...map, grid: map.grid.map(row => row.slice()) };
  const { player, enemies } = readMap(map.grid);
  state.player = player;
  state.enemies = enemies;
}

// Füllt die Level-Karte rechts (Titel, kurze Aufgabe bzw. Funktionsform, Knöpfe)
function showCard({ num, name, task = '' }) {
  ui.levelNum.textContent = num;
  ui.levelName.textContent = name;
  ui.levelTask.textContent = task;
  ui.levelTask.hidden = !task;
  ui.tutorialNav.hidden = state.mode !== 'tutorial';
  ui.wallsToggle.hidden = state.mode !== 'endless';
  ui.stage.classList.toggle('sandbox', state.mode === 'sandbox');
  ui.sidebar.classList.toggle('multi', state.mode === 'multi');
  ui.restartBtn.hidden = state.mode === 'multi' || state.mode === 'editor';
  ui.newmapBtn.hidden = state.mode === 'multi' || state.mode === 'editor' || state.mode === 'custom';
  ui.editorTools.hidden = state.mode !== 'editor';
  ui.stage.classList.toggle('editor', state.mode === 'editor');
  const code = mapCodeText();
  ui.mapCode.hidden = !code;
  ui.mapCodeText.textContent = code;
  ui.mapCodeEdit.hidden = state.mode !== 'custom';
  updateCatalogVisibility();
  typeset(ui.levelCard);
}

// Startet ein Level. newMap = false spielt dieselbe Karte noch einmal.
// seed: bestimmte Karte (Karten-Code), daily: Datum der Tages-Herausforderung
function loadLevel(index, newMap = true, seed = null, daily = null) {
  const level = LEVELS[index];
  const sameLevel = state.mode === 'levels' && state.levelIndex === index && state.map;
  if (newMap || !sameLevel) {
    applyMap(levelMap(level, seed ?? Math.floor(Math.random() * 2147483648)));
    state.daily = daily;
  } else {
    applyMap(state.baseMap);
  }
  state.mode = 'levels';
  state.levelIndex = index;
  state.shotsLeft = state.map.shots;
  resetRound();
  const num = state.daily ? `TAGES-LEVEL · ${state.daily}` : `LEVEL ${index + 1} / ${LEVELS.length}`;
  showCard({ num, name: level.name, task: level.form ? `\\(${level.form}\\)` : '' });
  updateLevelWarning();
  updateHUD();
  buildLevelSelect();
}

/* ---------- Level-Editor & eigene Karten ---------- */

const EDITOR_KEY = STORAGE_KEY + '.editor';
const editor = { tool: 'wall', painting: false, shots: 5 };

// Code einer eigenen Karte: K1-<Angriffe>-<Matrix lauflängenkodiert, a–f stehen für 0–5>
function encodeMap(grid, shots) {
  const flat = grid.flat();
  let out = '';
  for (let i = 0; i < flat.length;) {
    let n = 1;
    while (i + n < flat.length && flat[i + n] === flat[i]) n++;
    out += 'abcdef'[flat[i]] + n;
    i += n;
  }
  return `K1-${shots}-${out}`;
}

function decodeMap(code) {
  const m = /^K1-(\d+)-((?:[a-f]\d+)+)$/.exec(String(code || '').trim());
  if (!m) return null;
  const flat = [];
  for (const [, ch, n] of m[2].matchAll(/([a-f])(\d+)/g)) {
    if (flat.length + Number(n) > ROWS * COLS) return null;
    for (let k = 0; k < Number(n); k++) flat.push('abcdef'.indexOf(ch));
  }
  if (flat.length !== ROWS * COLS) return null;
  const grid = Array.from({ length: ROWS }, (_, r) => flat.slice(r * COLS, (r + 1) * COLS));
  return { grid, shots: Math.max(1, Math.min(30, Number(m[1]))) };
}

function startEditor(code = null) {
  const saved = decodeMap(code || loadValue(EDITOR_KEY, ''));
  const grid = saved ? saved.grid : emptyGrid();
  if (!saved) {
    const cross = crossIndex({ x: 0, y: 0 });
    setPlayer(grid, cross.c, cross.r);
  }
  editor.shots = saved ? saved.shots : 5;
  state.mode = 'editor';
  state.map = { grid, shots: editor.shots, solution: [] };
  state.baseMap = state.map;
  resetRound();
  state.status = 'editing';
  editorSync();
  ui.editorShots.value = editor.shots;
  ui.editorError.textContent = '';
  showCard({ num: 'EDITOR', name: 'Eigene Karte' });
  editorRenderTools();
  updateHUD();
  buildLevelSelect();
}

// Spieler und Gegner aus der Matrix übernehmen und die Karte merken
function editorSync() {
  const { player, enemies } = readMap(state.map.grid);
  if (player) state.player = player;
  state.enemies = enemies;
  saveValue(EDITOR_KEY, encodeMap(state.map.grid, editor.shots));
}

function editorPaint(point) {
  if (!point) return;
  const grid = state.map.grid;
  if (editor.tool === 'player') {
    const cross = crossIndex({ x: Math.round(point.x), y: Math.round(point.y) });
    const c = Math.max(1, Math.min(COLS - 1, cross.c));
    const r = Math.max(1, Math.min(ROWS - 1, cross.r));
    grid.forEach(row => row.forEach((v, i) => { if (v === CELL.PLAYER) row[i] = CELL.EMPTY; }));
    setPlayer(grid, c, r);
  } else {
    const cell = cellAt(point.x, point.y);
    if (!cell || grid[cell.r][cell.c] === CELL.PLAYER) return;
    const value = editor.tool === 'wall' ? CELL.WALL : editor.tool === 'erase' ? CELL.EMPTY : Number(editor.tool);
    if (grid[cell.r][cell.c] === value) return;
    grid[cell.r][cell.c] = value;
  }
  editorSync();
  updateHUD();
}

function editorRenderTools() {
  ui.editorPalette.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('current', b.dataset.tool === editor.tool));
}

function editorTest() {
  const { player, enemies } = readMap(state.map.grid);
  if (!player) { ui.editorError.textContent = 'Spieler fehlt'; return; }
  if (!enemies.length) { ui.editorError.textContent = 'Gegner fehlt'; return; }
  startCustom(encodeMap(state.map.grid, editor.shots));
}

// Eigene Karte spielen (aus dem Editor oder per Code)
function startCustom(code) {
  const map = decodeMap(code);
  if (!map || !readMap(map.grid).player) { showMessage('Code ungültig', 'error'); return false; }
  applyMap({ grid: map.grid, shots: map.shots, solution: [], code });
  state.mode = 'custom';
  state.shotsLeft = map.shots;
  resetRound();
  showCard({ num: 'EIGENE KARTE', name: 'Eigene Karte' });
  updateLevelWarning();
  updateHUD();
  buildLevelSelect();
  return true;
}

// Editor: Kästchen unter der Maus hervorheben (beim Spieler-Werkzeug das Kreuz)
function drawEditorHover() {
  const m = state.mouse;
  if (!m || !cellAt(m.x, m.y)) return;
  const A = pix.A;
  let i, j, size;
  if (editor.tool === 'player') {
    i = Math.round(artX(Math.round(m.x))) - A;
    j = Math.round(artY(Math.round(m.y))) - A;
    size = 2 * A;
  } else {
    const corner = crossPoint(cellAt(m.x, m.y).c, cellAt(m.x, m.y).r);
    i = Math.round(artX(corner.x));
    j = Math.round(artY(corner.y));
    size = A;
  }
  fill(COLORS.curve, i, j, size, 1);
  fill(COLORS.curve, i, j + size - 1, size, 1);
  fill(COLORS.curve, i, j, 1, size);
  fill(COLORS.curve, i + size - 1, j, 1, size);
}

function startEndless() {
  state.mode = 'endless';
  applyMap(generateEndlessMap(settings.endlessWalls));
  state.score = 0;
  resetRound();
  showCard({ num: 'ENDLOS', name: 'Endlos' });
  updateWallsToggle();
  updateLevelWarning();
  spawnEnemies();
  updateHUD();
  buildLevelSelect();
}

// Sandkasten: Spieler genau in der Mitte, keine Gegner, keine Wände, unbegrenzt
// Schüsse. Ein Klick ins Feld setzt Übungsziele (siehe toggleTarget).
function startSandbox() {
  state.mode = 'sandbox';
  const grid = emptyGrid();
  const cross = crossIndex({ x: 0, y: 0 });
  setPlayer(grid, cross.c, cross.r);
  applyMap({ grid, shots: Infinity, solution: [] });
  resetRound();
  showCard({ num: 'SANDKASTEN', name: 'Sandkasten', task: 'Klick ins Feld setzt ein Ziel.' });
  updateLevelWarning();
  updateHUD();
  buildLevelSelect();
  ui.input.focus();
}

// Sandkasten: Übungsziel im angeklickten Kästchen setzen bzw. stärker machen (1 → 2 → 3 → weg)
function toggleTarget(point) {
  if (state.mode !== 'sandbox' || state.shot) return;
  const cell = cellAt(point.x, point.y);
  if (!cell || state.map.grid[cell.r][cell.c] === CELL.PLAYER) return;
  const center = cellCenter(cell.c, cell.r);
  state.enemies = state.enemies.filter(e => e.hp > 0);
  const enemy = state.enemies.find(e => e.x === center.x && e.y === center.y);
  if (!enemy) {
    state.enemies.push({ x: center.x, y: center.y, r: ENEMY_RADIUS[1], hp: 1, maxHp: 1, flash: 0 });
  } else if (enemy.maxHp < 3) {
    enemy.maxHp++;
    enemy.hp = enemy.maxHp;
    enemy.r = ENEMY_RADIUS[enemy.maxHp];
  } else {
    state.enemies = state.enemies.filter(e => e !== enemy);
  }
  updateHUD();
}

function startTutorial(index = 0) {
  const steps = TUTORIAL;
  index = Math.min(index, steps.length - 1);
  const step = steps[index];
  state.mode = 'tutorial';
  state.tutorialIndex = index;
  applyMap(tutorialMap(step));
  resetRound();
  showCard({ num: `TUTORIAL ${index + 1} / ${steps.length}`, name: step.title, task: step.text });
  const isLast = index === steps.length - 1;
  ui.tutorialNext.innerHTML = (isLast ? 'Los! ' : 'Weiter ') + icon('play');
  ui.tutorialNext.disabled = state.enemies.length > 0;     // erst weiter, wenn alle Gegner weg sind
  ui.tutorialSkip.hidden = isLast;
  updateLevelWarning();
  updateHUD();
  buildLevelSelect();
  if (index === 0) ui.input.focus();
}

function finishTutorial() {
  saveValue(STORAGE_KEY + '.tutorialSeen', true);
  loadLevel(0);
}

// Anderen Modus starten. Aus einer Multiplayer-Runde heraus nur nach Rückfrage –
// man verlässt damit auch die Lobby.
function switchMode(start) {
  if (state.mode === 'multi') {
    if (!confirm('Lobby verlassen?')) return;
    mpLeave(false);
  }
  start();
}

// Gleiche Karte noch einmal
function restart() {
  if (state.mode === 'custom') startCustom(state.baseMap.code);
  else if (state.mode === 'editor') startEditor();
  else if (state.mode === 'sandbox') startSandbox();
  else if (state.mode === 'endless') startEndless();
  else if (state.mode === 'tutorial') startTutorial(state.tutorialIndex);
  else loadLevel(state.levelIndex, false);
}

// Neue zufällige Karte
function newMap() {
  if (state.mode === 'custom' || state.mode === 'editor') startEditor(state.mode === 'custom' ? state.baseMap.code : null);
  else if (state.mode === 'sandbox') startSandbox();
  else if (state.mode === 'endless') startEndless();
  else if (state.mode === 'tutorial') startTutorial(state.tutorialIndex);
  else loadLevel(state.levelIndex, true);
}

/* ---------- Schießen ---------- */

/* ---------- Eingabe: Modus, Mathe-Tasten, Verlauf ---------- */

const MODE_LABEL = { y: 'f(x) = ', y1: "y' = ", y2: "y'' = " };
const MODE_PLACEHOLDER = { y: 'x/2', y1: '-y/4+1', y2: '-y/9' };

// Eingabe → Schuss. Im Modus y = … ist es eine Funktion, in den Profi-Modi y′ = … und
// y″ = … eine Differentialgleichung; bei y″ steht der Startwinkel daneben.
// Ergebnis wie compileLatex, dazu shape (Funktion oder Differentialgleichung) und dir (Richtung)
function compileShot(text) {
  const mode = state.inputMode;
  if (mode !== 'y' && state.mode === 'multi' && mp.lobby && mp.lobby.settings.odeModes === false) {
    return { ok: false, error: 'y′ und y″ sind aus' };
  }
  const { dir, text: body } = splitDirection(text);
  const result = { ...compileLatex(body, 'x', mode), dir };
  if (!result.ok || mode === 'y') return { ...result, shape: result.fn };
  const angle = Math.max(-85, Math.min(85, parseFloat(String(ui.odeAngle.value).replace(',', '.')) || 0));
  const slope = mode === 'y2' ? Math.tan(angle * Math.PI / 180) : 0;   // Startsteigung im eigenen System
  return { ...result, shape: { order: mode === 'y1' ? 1 : 2, fn: result.fn, slope } };
}

function setInputMode(mode) {
  state.inputMode = MODE_LABEL[mode] ? mode : 'y';
  ui.fxMode.value = state.inputMode;
  ui.odeControls.hidden = state.inputMode !== 'y2';   // nur y″ braucht den Startwinkel
  ui.odeAngleBox.hidden = state.inputMode !== 'y2';
  ui.input.placeholder = MODE_PLACEHOLDER[state.inputMode];
  ui.keypad.dataset.mode = state.inputMode;
  saveValue(STORAGE_KEY + '.inputMode', state.inputMode);
  updatePreview();
}

// Mathe-Tasten: fügen Text an der Cursor-Stelle ein; „|“ markiert, wo der Cursor danach steht
function insertAtCursor(snippet) {
  const el = ui.input;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const caret = snippet.indexOf('|');
  const text = snippet.replace('|', '');
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const pos = start + (caret >= 0 ? caret : text.length);
  if (!window.matchMedia('(pointer: coarse)').matches) el.focus();   // am Tablet keine Bildschirmtastatur aufklappen
  el.setSelectionRange(pos, pos);
  updatePreview();
}

function keypadPress(button) {
  const el = ui.input;
  if (button.dataset.key === 'clear') {
    el.value = '';
    updatePreview();
  } else if (button.dataset.key === 'dir') {
    // „L “ vorne einfügen oder wieder entfernen (Richtung links ↔ rechts)
    const { dir, text } = splitDirection(el.value);
    el.value = dir < 0 ? text : 'L ' + el.value.replace(/^\s*[Rr](?![nN]|[oO][gG]|[gG])\s*:?\s*/, '');
    el.focus();
    updatePreview();
  } else if (button.dataset.key === 'back') {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const from = start === end ? Math.max(0, start - 1) : start;
    el.value = el.value.slice(0, from) + el.value.slice(end);
    el.setSelectionRange(from, from);
    updatePreview();
  } else if (button.dataset.ins) {
    insertAtCursor(button.dataset.ins);
  }
}

function toggleKeypad(show = ui.keypad.hidden) {
  ui.keypad.hidden = !show;
  ui.keypadBtn.classList.toggle('current', show);
  saveValue(STORAGE_KEY + '.keypad', show);
}

/* ---------- Eingabe-Verlauf (↑ / ↓ im Eingabefeld) ---------- */

const HISTORY_SIZE = 30;
const inputHistory = { list: [], pos: -1, draft: '' };

// Merkt sich eine abgefeuerte Funktion (neueste zuerst, ohne Doppelte)
function rememberInput(text) {
  text = text.trim();
  if (!text) return;
  inputHistory.list = [text, ...inputHistory.list.filter(t => t !== text)].slice(0, HISTORY_SIZE);
  inputHistory.pos = -1;
  saveValue(STORAGE_KEY + '.history', inputHistory.list);
}

// ↑ = ältere Eingabe, ↓ = neuere; ganz unten steht wieder, was man gerade tippte
function browseHistory(step) {
  const list = inputHistory.list;
  if (!list.length) return;
  if (inputHistory.pos === -1) inputHistory.draft = ui.input.value;
  inputHistory.pos = Math.max(-1, Math.min(list.length - 1, inputHistory.pos + step));
  ui.input.value = inputHistory.pos === -1 ? inputHistory.draft : list[inputHistory.pos];
  updatePreview();
  ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
}

// Schuss geht nicht: Fehler zeigen – aber nicht doppelt, wenn er schon unter der Eingabe steht
function rejectShot(text) {
  showMessage(ui.parseStatus.textContent.trim() === text ? '' : text, 'error');
  ui.input.classList.remove('flash');
  void ui.input.offsetWidth;          // Animation neu starten
  ui.input.classList.add('flash');
}

function fire() {
  if (state.mode === 'multi') { mpFire(); return; }
  if (state.status !== 'playing' || state.shot || (limitedShots() && state.shotsLeft <= 0)) return;

  const result = compileShot(ui.input.value);
  if (!result.ok) { rejectShot(result.error); return; }
  const blocked = blockedTypes(result.types);
  if (blocked.length) {
    rejectShot(`Aus: ${typeNames(blocked)}`);
    return;
  }

  const curve = buildCurve(result.shape, state.player, state.map.grid, result.dir);
  if (curve.error) { rejectShot(curve.error); return; }

  if (limitedShots()) state.shotsLeft--;
  rememberInput(ui.input.value);
  state.shot = {
    arms: curve.arms,
    hits: findHits(curve.arms, state.enemies),
    progress: 0,      // bisher gezeichnete Kurvenlänge pro Arm
    nextHit: 0,
    kills: 0,
  };
  spawnParticles(toCanvasX(state.player.x), toCanvasY(state.player.y), 14, ['#fff3a8', COLORS.curve, '#ffffff'], 220);
  showMessage('');
  updateHUD();
}

function updateShot(dt) {
  const shot = state.shot;
  if (!shot) return;
  shot.progress += dt * SHOT_SPEED;

  // Schaden genau dann, wenn die Kurve beim Gegner ankommt
  while (shot.nextHit < shot.hits.length && shot.hits[shot.nextHit].s <= shot.progress) {
    damage(shot.hits[shot.nextHit].enemy);
    shot.nextHit++;
  }

  // Trifft ein Arm eine Wand, sprengt er ein Loch hinein (wie bei Graphwar) – außer Wände sind unzerstörbar
  for (const arm of shot.arms) {
    if (arm.blocked && !arm.sparked && shot.progress >= arm.length && arm.end) {
      arm.sparked = true;
      const removed = wallsBreakable() ? blastWall(state.map.grid, arm.end).length : 0;
      spawnParticles(toCanvasX(arm.end.x), toCanvasY(arm.end.y), 10 + removed * 8, [COLORS.wall.base, COLORS.wall.dark, COLORS.curve], 200);
    }
  }

  const longest = Math.max(...shot.arms.map(arm => arm.length));
  if (shot.progress >= longest) finishShot();
}

function finishShot() {
  const shot = state.shot;
  state.trails.push({ id: ++trailCounter, arms: shot.arms });
  if (state.trails.length > (state.mode === 'sandbox' ? SANDBOX_TRAILS : MAX_TRAILS)) state.trails.shift();
  state.shot = null;

  if (state.mode === 'endless') {
    endlessAfterShot(shot);
    return;
  }
  const n = shot.hits.length;
  if (state.mode === 'sandbox') {
    state.shotsFired++;
    showMessage(n ? `Treffer ×${n}` : '', 'good');
    updateHUD();
    return;
  }
  if (n === 0) showMessage('Daneben');
  else showMessage(`Treffer ×${n}`, 'good');

  if (state.mode === 'tutorial') {
    state.shotsFired++;
    if (aliveEnemies().length === 0) {
      state.status = 'won';
      ui.tutorialNext.disabled = false;
      showMessage('Geschafft!', 'good');
      ui.tutorialNext.focus();
    }
    updateHUD();
    return;
  }
  checkLevelEnd();
}

function damage(enemy) {
  enemy.hp--;
  enemy.flash = 1;
  const cx = toCanvasX(enemy.x);
  const cy = toCanvasY(enemy.y);
  const colors = enemyColors(enemy);
  if (enemy.hp <= 0) {
    if (state.shot) state.shot.kills++;
    spawnParticles(cx, cy, 26, [colors[0], colors[1], COLORS.ink, '#ffffff'], 260);
  } else {
    spawnParticles(cx, cy, 8, ['#ffffff', colors[0]], 140);
  }
  updateHUD();
}

function checkLevelEnd() {
  const alive = aliveEnemies().length;
  const loadId = state.loadId;
  if (alive === 0) {
    state.status = 'won';
    if (state.mode === 'levels' && !state.daily) {
      if (state.levelIndex + 1 > state.unlocked && state.levelIndex + 1 < LEVELS.length) {
        state.unlocked = state.levelIndex + 1;
      }
      markDone(state.levelIndex);
      saveValue(STORAGE_KEY, state.unlocked);
    }
    if (state.daily) {
      const key = STORAGE_KEY + '.daily.' + state.daily;
      const used = state.map.shots - state.shotsLeft;
      saveValue(key, Math.min(used, loadValue(key, Infinity) ?? Infinity));
    }
    buildLevelSelect();
    setTimeout(() => { if (loadId === state.loadId) showOverlay('won'); }, 700);
  } else if (state.shotsLeft === 0) {
    state.status = 'lost';
    setTimeout(() => { if (loadId === state.loadId) showOverlay('lost'); }, 700);
  }
  updateHUD();
}

// Abgeschlossene Level (nur für die grüne Markierung in der Levelauswahl)
function markDone(index) {
  const done = loadValue(STORAGE_KEY + '.done', []);
  if (!done.includes(index)) done.push(index);
  saveValue(STORAGE_KEY + '.done', done);
}

/* ---------- Endlos-Modus ---------- */

function endlessAfterShot(shot) {
  const kills = shot.kills;
  state.score += kills;
  state.shotsFired++;
  if (kills > state.bestCombo) {
    state.bestCombo = kills;
    saveValue(STORAGE_KEY + '.bestCombo', kills);
  }

  let text;
  if (shot.hits.length === 0) text = 'Daneben';
  else if (kills === 0) text = `Treffer ×${shot.hits.length}`;
  else text = `+${kills}` + (kills >= 2 ? ` · Kombo ×${kills}!` : '');

  state.enemies = aliveEnemies();
  if (state.shotsFired % ENDLESS_MOVE_EVERY === 0) {
    relocatePlayer();
    text += ' · Umzug';
  }
  spawnEnemies();
  ensureReachable();
  showMessage(text, kills ? 'good' : '');
  updateHUD();
}

// Wie viele Gegner stehen von 'from' aus hinter einer Wand?
function blockedCount(from, grid) {
  return aliveEnemies().filter(e => wallHit(from, e, grid) !== null).length;
}

// Setzt den Spieler auf ein neues zufälliges freies Kreuz (Endlos-Modus).
// Bevorzugt werden Stellen, von denen aus kein Gegner hinter einer Wand steht.
function relocatePlayer() {
  const grid = currentGrid();
  const old = crossIndex(state.player);
  for (const cell of crossCells(old.c, old.r)) grid[cell.r][cell.c] = CELL.EMPTY;
  let best = null;
  let bestBlocked = Infinity;
  for (let tries = 0; tries < 60 && bestBlocked > 0; tries++) {
    const cross = findPlayerCross(grid, old);
    if (!cross) break;
    const blocked = blockedCount(crossPoint(cross.c, cross.r), grid);
    if (blocked < bestBlocked) { best = cross; bestBlocked = blocked; }
  }
  if (!best) return;
  spawnParticles(toCanvasX(state.player.x), toCanvasY(state.player.y), 12, [COLORS.player, '#ffffff'], 180);
  state.player = crossPoint(best.c, best.r);
  spawnParticles(toCanvasX(state.player.x), toCanvasY(state.player.y), 12, [COLORS.player, '#ffffff'], 180);
  state.trails = [];
}

// Probeschuss: Trifft eine Gerade vom Spieler aus diesen Gegner? Benutzt genau
// dieselbe Kurven- und Treffererkennung wie ein echter Schuss (inkl. Wände).
// Geprüft wird nur nach rechts (die Standardrichtung) – Gegner links oder direkt
// über/unter dem Spieler zählen nicht als treffbar. Berechnet wird nur bis kurz hinter den Gegner.
function lineCanHit(enemy) {
  const dx = ownX(enemy.x, state.player) - ownX(state.player.x, state.player);
  const dy = enemy.y - state.player.y;
  if (dx < 1) return false;
  const m = dy / dx;
  const arm = buildArm(x => m * x, state.player, state.map.grid, Math.hypot(dx, dy) + 1);   // f(x) = m·x, durch den Spieler verschoben
  return findHits([arm], [{ ...enemy, hp: 1 }]).length === 1;
}

// Sucht ein freies Kästchen, das der Spieler mit einer Geraden ohne Wand
// dazwischen erreicht. preferNear: möglichst höchstens ENDLESS_NEAR entfernt.
function findReachableCell(grid, preferNear) {
  for (let tries = 0; tries < 800; tries++) {
    const c = randomInt(0, COLS - 1);
    const r = randomInt(1, ROWS - 1);
    if (nearPlayer(c, r, state.player) || !isAreaFree(grid, c, r)) continue;
    const center = cellCenter(c, r);
    if (ownX(center.x, state.player) - ownX(state.player.x, state.player) < 1) continue;   // nur rechts vom Spieler
    if (preferNear && tries < 600 && Math.hypot(center.x - state.player.x, center.y - state.player.y) > ENDLESS_NEAR) continue;
    if (wallHit(state.player, center, grid) !== null) continue;              // schnelle Vorprüfung
    if (!lineCanHit({ ...center, r: ENEMY_RADIUS[1] })) continue;            // echter Probeschuss
    return { c, r, ...center };
  }
  return null;
}

// Füllt das Feld mit neuen Gegnern auf. Mit steigender Punktzahl werden es
// mehr, und Gegner mit mehr Lebenspunkten kommen dazu.
function spawnEnemies() {
  const target = Math.min(ENDLESS_MIN_ENEMIES + Math.floor(state.score / 4), ENDLESS_MAX_ENEMIES);
  const grid = currentGrid();
  while (aliveEnemies().length < target) {
    const spot = findReachableCell(grid, true);
    if (!spot) break;
    const hp = randomHp();
    const enemy = { x: spot.x, y: spot.y, r: ENEMY_RADIUS[hp], hp, maxHp: hp, flash: 1 };
    state.enemies.push(enemy);
    grid[spot.r][spot.c] = hp;
    spawnParticles(toCanvasX(enemy.x), toCanvasY(enemy.y), 6, ['#ffffff', enemyColors(enemy)[0]], 90);
  }
}

// Garantie im Endlos-Modus: Jeder Gegner ist mit einer Geraden treffbar.
// Wer nach einem Umzug hinter einer Wand steht, wird versetzt.
function ensureReachable() {
  for (const enemy of aliveEnemies()) {
    if (lineCanHit(enemy)) continue;
    const grid = currentGrid();
    const old = cellAt(enemy.x, enemy.y);
    grid[old.r][old.c] = CELL.EMPTY;
    const spot = findReachableCell(grid, false);
    if (!spot) continue;
    spawnParticles(toCanvasX(enemy.x), toCanvasY(enemy.y), 8, [COLORS.wall.base, '#ffffff'], 120);
    enemy.x = spot.x;
    enemy.y = spot.y;
    enemy.flash = 1;
  }
}

// Wände im Endlos-Modus an- oder ausschalten (auch mitten im Spiel)
function setEndlessWalls(on) {
  settings.endlessWalls = on;
  saveValue(STORAGE_KEY + '.endlessWalls', on);
  updateWallsToggle();
  if (state.mode !== 'endless') return;

  const grid = state.map.grid;
  if (!on) {
    grid.forEach(row => row.forEach((v, c) => { if (v === CELL.WALL) row[c] = CELL.EMPTY; }));
  } else {
    // Neue Wände – aber nicht auf die direkten Schusslinien zu den Gegnern
    const snapshot = currentGrid();
    const protectedCells = new Set();
    for (const e of aliveEnemies()) markCurveCells([segmentArm(state.player, e)], protectedCells);
    placeWalls(snapshot, ENDLESS_WALLS, protectedCells, crossIndex(state.player), []);
    snapshot.forEach((row, r) => row.forEach((v, c) => { if (v === CELL.WALL) grid[r][c] = CELL.WALL; }));
    ensureReachable();
  }
  state.trails = [];
}

function randomHp() {
  const roll = Math.random();
  if (roll < Math.min(0.15, state.score / 150)) return 3;
  if (roll < Math.min(0.4, state.score / 40)) return 2;
  return 1;
}

/* ---------- Effekte ---------- */

function spawnParticles(cx, cy, count, colors, speed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    state.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 60,
      life: 0.5 + Math.random() * 0.4,
      size: 3 + Math.floor(Math.random() * 2) * 3,
      color: colors[i % colors.length],
    });
  }
}

function updateEffects(dt) {
  for (const e of state.enemies) e.flash = Math.max(0, e.flash - dt * 3);
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 500 * dt;   // etwas Schwerkraft
    p.life -= dt;
  }
  state.particles = state.particles.filter(p => p.life > 0);
}

/* ==========================================================
   7. ZEICHNEN (Pixel-Grafik)
   Das Spielfeld ist ein Raster aus „Kunst-Pixeln“: Jede Einheit
   des Koordinatensystems ist pix.A Kunst-Pixel breit, jedes
   Kunst-Pixel pix.K × pix.K echte Bildschirmpixel. fitCanvas
   wählt beides passend zu Fenstergröße und Bildschirm-Auflösung
   (auch 125 %, 150 %, 4K …). Gezeichnet wird direkt in
   Bildschirmpixeln und nur auf ganzen Kunst-Pixeln – nichts wird
   hochskaliert oder geglättet, deshalb ist alles immer scharf.
   Kurven werden als Pixel-Linie gestempelt; gerechnet (Treffer,
   Wände) wird weiterhin exakt mit den Punkten aus Abschnitt 4.
   ========================================================== */

const COLORS = {
  paper: '#f6e9c9',       // Pergament des Spielfelds
  paperDark: '#ead8ae',   // Fasern / Flecken im Pergament
  paperLight: '#fcf3dc',
  paperEdge: ['#d9bf8a', '#e6d0a0', '#efdeb6'],   // dunkler werdender Rand (außen → innen)
  parchment: '#fff6df',   // Schildchen auf dem Feld (Mausanzeige, Banner)
  grid: '#e6d2a6',
  gridStrong: '#d9c08c',
  ink: '#2a1d2e',
  label: '#5a4636',
  curve: '#e0218a',
  curveHalo: '#ffffff',
  trail: '#f3bfd8',
  player: '#3b6fe0',
  playerDark: '#23449a',
  axes: '#23449a',
  // Schleim-Gegner nach Lebenspunkten: [Körper, Umriss, Glanz, Schatten]
  enemy: {
    1: ['#6cc35a', '#2f6e36', '#c2f0a0', '#4fa246'],
    2: ['#f39a3d', '#97461a', '#ffd79a', '#d9772a'],
    3: ['#9b5bd6', '#4a2678', '#dcbcf8', '#7a44b8'],
  },
  wall: { light: '#dcd9e8', base: '#aca8c3', mortar: '#757090', dark: '#4d4866', moss: '#79ad5f' },
  gold: '#f2c14e',
  goldDark: '#c98a1e',
  hpFull: '#e0393e',
  hpLight: '#ff9a9a',
  hpEmpty: '#e2d3b4',
  skin: '#f6c8a0',
  beard: '#ffffff',
  beardDark: '#d9d2e0',
};

const TEXT_SIZE = 56 / 3;   // Jersey 10 ist auf einem Raster gezeichnet: 1 Schrift-Pixel = 1/18,667 der Schriftgröße
const FONT = '"Jersey 10", "Segoe UI", sans-serif';
const OUTLINE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

let canvas, ctx;
// U: Bildschirmpixel pro Einheit, K: Bildschirmpixel pro Kunst-Pixel, A: Kunst-Pixel pro Einheit (U = K · A),
// T: Bildschirmpixel pro Pixel der Oberfläche (--p), S: Bildschirmpixel pro Schrift-Pixel (1,5 · T, wie die
// Schrift der Oberfläche – bei T = 2 genau 3, also exakt auf dem Raster)
const pix = { U: 30, K: 3, A: 10, T: 1, S: 1.5 };
const spriteCache = new Map();

/* ---------- Kunst-Pixel ---------- */

// Welt-Koordinaten → Kunst-Pixel (Kommazahl; 0 = linker bzw. oberer Rand des Feldes)
function artX(x) { return toCanvasX(x) / UNIT * pix.A; }
function artY(y) { return toCanvasY(y) / UNIT * pix.A; }
// Logische Canvas-Pixel (1500 × 900, z. B. Funken) → Kunst-Pixel
function logToArt(v) { return v / UNIT * pix.A; }

// Rechteck aus Kunst-Pixeln
function fill(color, i, j, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(i * pix.K, j * pix.K, w * pix.K, h * pix.K);
}

// Kleines Bild aus einer Zeichen-Vorlage (1 Zeichen = 1 Kunst-Pixel), auf Wunsch gespiegelt
function spriteFromRows(key, rows, palette, flip = false) {
  key += flip ? '|flip' : '';
  if (spriteCache.has(key)) return spriteCache.get(key);
  const sprite = document.createElement('canvas');
  sprite.width = Math.max(...rows.map(row => row.length));
  sprite.height = rows.length;
  const g = sprite.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!palette[ch]) return;
    g.fillStyle = palette[ch];
    g.fillRect(flip ? sprite.width - 1 - x : x, y, 1, 1);
  }));
  spriteCache.set(key, sprite);
  return sprite;
}

// Sprite mit der linken oberen Ecke auf Kunst-Pixel (i, j) – genau K-fach vergrößert, ohne Glättung
function blit(sprite, i, j) {
  ctx.drawImage(sprite, i * pix.K, j * pix.K, sprite.width * pix.K, sprite.height * pix.K);
}

/* ---------- Pixel-Schrift ---------- */

function setFont(scale) {
  ctx.font = `${TEXT_SIZE * scale}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function textWidth(text, scale = pix.S) {
  setFont(scale);
  return Math.round(ctx.measureText(text).width);
}

// Text auf ganzen Bildschirmpixeln (x, y in Bildschirmpixeln, y = Grundlinie).
// outline: Farbe für einen etwa 1 Schrift-Pixel breiten Rand rundherum (lesbar auf Kurven und Wänden),
// immer ganze Bildschirmpixel breit
function pixelText(text, x, y, color, { align = 'left', outline = null, scale = pix.S } = {}) {
  const w = textWidth(text, scale);
  const left = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  if (outline) {
    const o = Math.max(1, Math.round(scale / 1.5));
    ctx.fillStyle = outline;
    for (const [dx, dy] of OUTLINE) ctx.fillText(text, left + dx * o, y + dy * o);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, left, y);
  return w;
}

// Kasten mit Stufen-Ecken (wie die Rahmen der Oberfläche), alles in Bildschirmpixeln
function pixelPanel(x, y, w, h, background, border = COLORS.ink, b = pix.T * 2) {
  [x, y, w, h] = [x, y, w, h].map(Math.round);
  ctx.fillStyle = 'rgba(46, 34, 54, 0.18)';
  ctx.fillRect(x + b, y + h + b, w, b);   // Schatten
  ctx.fillStyle = border;
  ctx.fillRect(x, y - b, w, h + 2 * b);
  ctx.fillRect(x - b, y, w + 2 * b, h);
  ctx.fillStyle = background;
  ctx.fillRect(x, y, w, h);
}

/* ---------- Figuren ---------- */

// Zauberer (schaut nach rechts). Er hält die Zauberkugel – ihre Mitte ist der Nullpunkt (0 | 0),
// dort beginnt jede Kurve. Zeichen: o Umriss, h/d Hut, g/G Goldband, s Haut, e Auge,
// w/v Bart, r/R Gewand, * + k Zauberkugel
const WIZARD_SPRITE = [
  '....oo...........',
  '...ohdo..........',
  '...ohhdo.........',
  '....ohhdo........',
  '....ohhhdo.......',
  '...ohhhhhdo......',
  '..oggggggGGo.....',
  '.oohhhhhhhhoo....',
  '...osssssesoooo..',
  '...owssssswoo++o.',
  '..orwwwwwwss+***o',
  '..orrwwwwvRo****o',
  '.orrrrwvvRRoo*ko.',
  '.orrrrrrRRRRooo..',
  '.orrrrrrrRRRo....',
  '..oooooooooo.....',
];
const WIZARD_ANCHOR = { x: 14, y: 11 };   // Kunst-Pixel-Ecke in der Mitte der Kugel

// color/dark: Gewand und Hut, orb: Farbe der Zauberkugel (= Farbe der Kurve)
function wizardSprite(color, dark, orb, flip) {
  return spriteFromRows(`wiz|${color}|${orb}`, WIZARD_SPRITE, {
    o: COLORS.ink, h: color, d: dark, r: color, R: dark, g: COLORS.gold, G: COLORS.goldDark,
    s: COLORS.skin, e: COLORS.ink, w: COLORS.beard, v: COLORS.beardDark,
    '*': orb, '+': '#ffffff', k: dark,
  }, flip);
}

// Zauberer mit der Kugel auf der Kunst-Pixel-Ecke (oi, oj); face = 1 schaut nach rechts, −1 nach links.
// Gibt die obere und untere Kante zurück (für Namen darüber).
function drawWizard(oi, oj, color, dark, orb, face = 1) {
  const sprite = wizardSprite(color, dark, orb, face < 0);
  const ax = face < 0 ? sprite.width - WIZARD_ANCHOR.x : WIZARD_ANCHOR.x;
  const top = oj - WIZARD_ANCHOR.y;
  blit(sprite, oi - ax, top);
  return { top, bottom: top + sprite.height };
}

// Schleim als Pixel-Kreis mit Radius R Kunst-Pixeln – genau so groß wie seine Trefferfläche.
// hp: 2 bekommt böse Augenbrauen (die Krone für 3 kommt in drawEnemies dazu)
function slimeSprite(R, hp, colors, flash) {
  const key = `slime|${R}|${hp}|${colors[0]}|${flash}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const size = 2 * R;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');
  const put = (x, y, color, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && (x + 0.5 - R) ** 2 + (y + 0.5 - R) ** 2 <= R * R;
  const [body, line, light, shade] = flash ? ['#ffffff', '#ffffff', '#ffffff', '#ffffff'] : colors;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const lit = (x + 0.5 - R * 0.75) ** 2 + (y + 0.5 - R * 0.7) ** 2 <= (R * 1.05) ** 2;
      put(x, y, edge ? line : lit ? body : shade);
    }
  }
  if (flash) { spriteCache.set(key, sprite); return sprite; }

  // Glanzlicht oben links
  const gx = Math.round(R * 0.45);
  const gy = Math.round(R * 0.4);
  put(gx, gy, light, R >= 5 ? 2 : 1, 1);
  if (R >= 5) put(gx, gy + 1, light);

  // Augen (mit Lichtpunkt, wenn groß genug), Mund und bei 2 Leben Augenbrauen
  const ew = R >= 8 ? 2 : 1;
  const eh = R >= 6 ? 3 : 2;
  const d = Math.max(1, Math.round(R * 0.28));
  const top = Math.round(R * 0.85);
  const lx = R - d - ew;
  const rx = R + d;
  put(lx, top, COLORS.ink, ew, eh);
  put(rx, top, COLORS.ink, ew, eh);
  if (ew === 2) { put(lx, top, '#ffffff'); put(rx, top, '#ffffff'); }
  if (R >= 6) put(R - 1, top + eh + 1, COLORS.ink, 2, 1);
  if (hp === 2 && R >= 4) {
    put(lx - 1, top - 2, COLORS.ink); put(lx, top - 1, COLORS.ink, ew, 1);
    put(rx + ew, top - 2, COLORS.ink); put(rx, top - 1, COLORS.ink, ew, 1);
  }
  spriteCache.set(key, sprite);
  return sprite;
}

// Krone für Schleime mit 3 Leben
const CROWN_SPRITE = [
  'g..g..g',
  'gg.g.gg',
  'ggggggg',
  'GrGGGrG',
];

// Herz für die Lebenspunkte (auch für Power-ups und Spieler im Multiplayer)
const HEART_SPRITE = [
  '.#.#.',
  '#+###',
  '.###.',
  '..#..',
];

// Lebenspunkte als Herzen, mittig über ci, Unterkante bei Kunst-Pixel-Zeile bottom
function drawHearts(ci, bottom, hp, max) {
  const total = max * 6 - 1;
  const left = ci - Math.floor(total / 2);
  for (let n = 0; n < max; n++) {
    const full = n < hp;
    const sprite = spriteFromRows('heart' + full, HEART_SPRITE, full
      ? { '#': COLORS.hpFull, '+': COLORS.hpLight } : { '#': COLORS.hpEmpty, '+': COLORS.hpEmpty });
    blit(sprite, left + n * 6, bottom - 4);
  }
}

// Funkelnder Stern an der Spitze einer fliegenden Kurve
function drawSparkle(i, j, color) {
  const big = Math.floor(performance.now() / 90) % 2 === 0;
  const r = big ? 3 : 2;
  fill(color, i - r, j - 1, 2 * r, 2);
  fill(color, i - 1, j - r, 2, 2 * r);
  fill('#ffffff', i - 1, j - 1, 2, 2);
}

/* ---------- Hintergrund: Raster, Wände, Achsen, alte Spuren ---------- */

// Raster, Wände, Achsen und die Spuren alter Schüsse ändern sich selten – sie werden
// in ein eigenes Bild vorgezeichnet und nur neu gemalt, wenn sich etwas davon ändert
// (Position, Wände, Größe, Farbe, Spuren, Schrift geladen).
let background = null;   // { canvas, key }
let fontsReady = false;

function drawTrails() {
  if (state.mode === 'multi') { mpDrawTrails(); return; }
  for (const trail of state.trails) {
    for (const arm of trail.arms) stampPath(pixelPath(arm.drawPoints || arm.points), Infinity, COLORS.trail, curveWidth());
  }
}

function drawBackground() {
  const axesColor = state.mode === 'multi' ? mpAxesColor() : COLORS.axes;
  const walls = state.map ? state.map.grid.map(row => row.join('')).join('') : '';
  const trails = state.mode === 'multi' ? mpTrailKey() : state.trails.map(t => t.id).join(',');
  const key = [canvas.width, canvas.height, pix.K, pix.T, state.player.x, state.player.y, viewMirror(), axesColor, walls, trails, fontsReady].join('|');
  if (!background || background.key !== key) {
    const layer = background ? background.canvas : document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const main = ctx;
    ctx = layer.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawGrid();
    drawWalls();
    drawTrails();
    drawPlayerAxes(axesColor);
    ctx = main;
    background = { canvas: layer, key };
  }
  ctx.drawImage(background.canvas, 0, 0);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (state.mode === 'multi') mpUpdateShots();
  drawBackground();
  if (state.mode === 'multi') {
    mpDraw();
  } else {
    drawEnemies();
    drawShot();
    drawPlayer();
    if (state.mode === 'editor') drawEditorHover();
  }
  drawParticles();
  drawMouseInfo();
}

// Rasterlinien bei jeder ganzen Zahl (gepunktet), durchgezogen bei Vielfachen von 5 –
// gezählt vom Spieler aus, denn er ist der Nullpunkt seines Koordinatensystems
function drawGrid() {
  const W = COLS * pix.A;
  const H = ROWS * pix.A;
  fill(COLORS.paper, 0, 0, W, H);
  // Pergament-Struktur: einzelne hellere und dunklere Kunst-Pixel, fest verteilt (flackert nicht),
  // dazu ein Rand, der nach außen dunkler wird
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663);
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      const v = ((h ^ (h >>> 16)) >>> 0) % 1000;
      if (v < 14) fill(COLORS.paperDark, i, j, v < 4 ? 2 : 1, 1);
      else if (v > 993) fill(COLORS.paperLight, i, j);
    }
  }
  COLORS.paperEdge.forEach((color, k) => {
    fill(color, k, k, W - 2 * k, 1);
    fill(color, k, H - 1 - k, W - 2 * k, 1);
    fill(color, k, k, 1, H - 2 * k);
    fill(color, W - 1 - k, k, 1, H - 2 * k);
  });
  for (let x = VIEW.xMin + 1; x < VIEW.xMax; x++) {
    const i = Math.round(artX(x));
    if (viewX(x) % 5 === 0) fill(COLORS.gridStrong, i, 0, 1, H);
    else for (let j = 1; j < H; j += 2) fill(COLORS.grid, i, j);
  }
  for (let y = VIEW.yMin + 1; y < VIEW.yMax; y++) {
    const j = Math.round(artY(y));
    if (viewY(y) % 5 === 0) fill(COLORS.gridStrong, 0, j, W, 1);
    else for (let i = 1; i < W; i += 2) fill(COLORS.grid, i, j);
  }
}

// Wände als Burgmauer: zwei Steinreihen pro Kästchen im Verband, Umriss nur an freien Seiten
// (so verschmelzen benachbarte Wände zu einer Mauer), hier und da etwas Moos oben drauf.
function drawWalls() {
  const grid = state.map.grid;
  const A = pix.A;
  const W = COLORS.wall;
  const h1 = Math.floor(A / 2);
  const m = viewMirror();
  const wallAt = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === CELL.WALL;
  grid.forEach((row, r) => row.forEach((value, c) => {
    if (value !== CELL.WALL) return;
    const i0 = Math.round(Math.min(artX(VIEW.xMin + c), artX(VIEW.xMin + c + 1)));   // gespiegelt ist die rechte Ecke links
    const j0 = r * A;
    fill(W.base, i0, j0, A, A);
    fill(W.light, i0, j0, A, 1);
    fill(W.light, i0, j0 + h1, A, 1);
    fill(W.mortar, i0, j0 + h1 - 1, A, 1);
    fill(W.mortar, i0, j0 + A - 1, A, 1);
    fill(W.mortar, i0 + h1 - 1, j0, 1, h1);
    fill(W.mortar, i0 + A - 1, j0 + h1, 1, A - h1);
    if (!wallAt(c, r - 1)) fill(W.dark, i0, j0, A, 1);
    if (!wallAt(c, r + 1)) fill(W.dark, i0, j0 + A - 1, A, 1);
    if (!wallAt(c - m, r)) fill(W.dark, i0, j0, 1, A);
    if (!wallAt(c + m, r)) fill(W.dark, i0 + A - 1, j0, 1, A);
    const hash = (c * 7 + r * 13) % 11;
    if (!wallAt(c, r - 1) && hash < 4 && A >= 6) {
      const x = i0 + 1 + (hash * 3) % (A - 4);
      fill(W.moss, x, j0, 3, 1);
      fill(W.moss, x + 1, j0 - 1, 1, 1);
    }
  }));
}

// Eigenes Koordinatensystem des Spielers: Der Nullpunkt (0 | 0) liegt in ihm, alle
// Zahlen an den Achsen zählen von ihm aus; x wächst nach rechts (steht er in der Welt
// rechts, ist die Ansicht gespiegelt). Ein allgemeines Koordinatensystem gibt es nicht.
// Achsen 1 Kunst-Pixel breit (mittig auf der Linie), Pfeilspitzen, Striche bei jeder Zahl,
// Beschriftung bei jeder zweiten. Steht der Spieler nah am Rand, kommen die Zahlen auf die
// andere Seite der Achse.
// color: Achsenfarbe (im Multiplayer die Farbe des Spielers)
function drawPlayerAxes(color = COLORS.axes) {
  const { A, K, T, S } = pix;
  const W = COLS * A;
  const H = ROWS * A;
  const oi = Math.round(artX(state.player.x));
  const oj = Math.round(artY(state.player.y));
  const labelsBelow = oj < H - 2 * A;   // Zahlen der x-Achse unter der Achse …
  const labelsLeft = oi > 2 * A;        // … und die der y-Achse links davon
  // Beschriftet wird jede 2. Zahl – ist das Feld klein, nur jede 4., 5. oder 10., damit nichts aneinanderstößt
  const steps = [2, 4, 5, 10];
  const stepX = steps.find(st => st * pix.U >= textWidth('-30') + 6 * S) || 10;
  const stepY = steps.find(st => st * pix.U >= 16 * S) || 10;

  // in Bildschirmpixeln gezeichnet, damit die dünne Linie genau mittig auf dem Nullpunkt liegt
  const c = Math.floor(K / 2);
  const ox = oi * K;
  const oy = oj * K;
  ctx.fillStyle = color;
  ctx.fillRect(0, oy - c, (W - 1) * K, K);
  ctx.fillRect(ox - c, K, K, (H - 1) * K);
  for (let s = 0; s <= 3; s++) {
    ctx.fillRect((W - 1 - s) * K, oy - c - s * K, K, (2 * s + 1) * K);
    ctx.fillRect(ox - c - s * K, s * K, (2 * s + 1) * K, K);
  }

  for (let x = VIEW.xMin + 1; x < VIEW.xMax; x++) {
    const n = viewX(x);
    if (n === 0) continue;
    const i = Math.round(artX(x));
    ctx.fillStyle = color;
    ctx.fillRect(i * K - c, oy - c - 2 * K, K, 5 * K);
    if (n % stepX !== 0 || i > W - 6) continue;
    const y = labelsBelow ? (oj + 4) * K + 11 * S : (oj - 4) * K - 2 * S;
    pixelText(String(n), i * K, y, COLORS.label, { align: 'center', outline: COLORS.paper });
  }
  for (let y = VIEW.yMin + 1; y < VIEW.yMax; y++) {
    const n = viewY(y);
    if (n === 0) continue;
    const j = Math.round(artY(y));
    ctx.fillStyle = color;
    ctx.fillRect(ox - c - 2 * K, j * K - c, 5 * K, K);
    if (n % stepY !== 0 || j < 6) continue;
    const x = labelsLeft ? (oi - 4) * K - T : (oi + 4) * K + T;
    pixelText(String(n), x, j * K + 5 * S, COLORS.label, { align: labelsLeft ? 'right' : 'left', outline: COLORS.paper });
  }

  // Achsennamen
  pixelText('x', (W - 5) * K, labelsBelow ? (oj + 4) * K + 13 * S + 12 * T : (oj - 4) * K - 3 * S, color,
    { align: 'right', outline: COLORS.paper, scale: 2 * T });
  pixelText('y', labelsLeft ? (oi + 4) * K : (oi - 4) * K, 5 * K + 16 * T, color,
    { align: labelsLeft ? 'left' : 'right', outline: COLORS.paper, scale: 2 * T });
}

/* ---------- Kurven als Pixel-Linie ---------- */

// Kurven werden in voller Bildschirmauflösung gezeichnet (nicht in Kunst-Pixeln): Kurvenpunkte →
// Bildschirmpixel der Mittellinie, lückenlos verbunden (Bresenham), danach mit einem runden,
// hartkantigen Pinsel gestempelt – glatt, aber ohne Kantenglättung, also trotzdem scharf.
// Ergebnis: flaches Array [x, y, s, x, y, s, …] mit s = Kurvenlänge bis dorthin (für die Animation).
// Wird pro Punktliste und Ansicht nur einmal berechnet.
const pathCache = new WeakMap();

function pixelPath(points) {
  const key = pix.U + '|' + viewMirror();
  const cached = pathCache.get(points);
  if (cached && cached.key === key) return cached.cells;
  const cells = [];
  const far = 4 * COLS * pix.U;
  let pi = null;
  let pj = null;
  for (const p of points) {
    if (p === null) { pi = null; continue; }
    const i = Math.round(artX(p.x) * pix.K);
    const j = Math.round(artY(p.y) * pix.K);
    if (pi === null || Math.abs(i - pi) + Math.abs(j - pj) > far) {
      cells.push(i, j, p.s);
    } else if (i !== pi || j !== pj) {
      // Bresenham von (pi, pj) nach (i, j), ohne den Startpunkt
      const di = Math.abs(i - pi), dj = -Math.abs(j - pj);
      const si = pi < i ? 1 : -1, sj = pj < j ? 1 : -1;
      let err = di + dj, x = pi, y = pj;
      while (x !== i || y !== j) {
        const e2 = 2 * err;
        if (e2 >= dj) { err += dj; x += si; }
        if (e2 <= di) { err += di; y += sj; }
        cells.push(x, y, p.s);
      }
    }
    pi = i;
    pj = j;
  }
  pathCache.set(points, { key, cells });
  return cells;
}

// Runder Pinsel mit size Bildschirmpixeln Durchmesser, harte Kante
function brushSprite(size, color) {
  const key = `brush|${size}|${color}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');
  g.fillStyle = color;
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r + 0.5) g.fillRect(x, y, 1, 1);
    }
  }
  spriteCache.set(key, sprite);
  return sprite;
}

// Linienstärken der Kurve in Bildschirmpixeln: der Kern so breit wie die Trefferbreite (LINE_WIDTH),
// dazu ein heller Rand für den fliegenden Schuss
function curveWidth() { return Math.max(3, Math.round(LINE_WIDTH * pix.U)); }
function haloWidth() { return curveWidth() + 2 * Math.max(2, Math.round(pix.U / 14)); }

// Stempelt einen Pfad bis zur Kurvenlänge maxS mit dem runden Pinsel (size Bildschirmpixel,
// mittig auf der Linie). dash: Strichmuster in Kunst-Pixeln, z. B. [4, 2]. Gibt die Spitze zurück.
function stampPath(cells, maxS, color, size, dash = null) {
  const brush = brushSprite(size, color);
  const off = Math.floor(size / 2);
  const stride = Math.max(1, Math.floor(size / 3));   // dicke Pinsel überlappen – nicht jeder Pixel nötig
  const pattern = dash ? dash.map(d => d * pix.K) : null;
  const period = pattern ? pattern.reduce((a, b) => a + b, 0) : 0;
  let tip = null;
  for (let c = 0, n = 0; c < cells.length; c += 3, n++) {
    if (cells[c + 2] > maxS) break;
    tip = { x: cells[c], y: cells[c + 1] };
    if (pattern ? !dashOn(pattern, n % period) : n % stride !== 0) continue;
    ctx.drawImage(brush, tip.x - off, tip.y - off);
  }
  if (tip && !pattern) ctx.drawImage(brush, tip.x - off, tip.y - off);
  return tip;
}

function dashOn(dash, pos) {
  for (let k = 0; k < dash.length; k++) {
    if (pos < dash[k]) return k % 2 === 0;
    pos -= dash[k];
  }
  return true;
}

function drawShot() {
  const shot = state.shot;
  if (!shot) return;
  for (const arm of shot.arms) {
    const cells = pixelPath(arm.drawPoints);
    stampPath(cells, shot.progress, COLORS.curveHalo, haloWidth());
    const tip = stampPath(cells, shot.progress, COLORS.curve, curveWidth());
    if (tip && shot.progress < arm.length) drawSparkle(Math.round(tip.x / pix.K), Math.round(tip.y / pix.K), COLORS.curve);
  }
}

/* ---------- Gegner, Spieler, Funken ---------- */

function enemyColors(enemy) {
  return COLORS.enemy[Math.min(enemy.maxHp, 3)];
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const R = Math.max(2, Math.round(e.r * pix.A));
    const sprite = slimeSprite(R, e.maxHp, enemyColors(e), e.flash > 0.5);
    const shake = e.flash > 0 ? Math.round(Math.sin(e.flash * 40) * 1.5 * e.flash) : 0;
    const ci = Math.round(artX(e.x)) + shake;
    const cj = Math.round(artY(e.y));
    blit(sprite, ci - R, cj - R);
    let top = cj - R;
    if (e.maxHp >= 3) {
      blit(spriteFromRows('crown', CROWN_SPRITE, { g: COLORS.gold, G: COLORS.goldDark, r: COLORS.hpFull }), ci - 4, top - 3);
      top -= 3;
    }
    drawHearts(ci, top - 1, e.hp, e.maxHp);
  }
}

function drawPlayer() {
  const oi = Math.round(artX(state.player.x));
  const oj = Math.round(artY(state.player.y));
  // Richtung, in die der letzte/aktuelle Angriff aus dem Spieler herausging – dorthin schaut der Zauberer
  const shot = state.shot || state.trails[state.trails.length - 1];
  const face = shot && shot.arms[0] && shot.arms[0].dir < 0 ? -1 : 1;
  drawWizard(oi, oj, COLORS.player, COLORS.playerDark, COLORS.curve, face);
}

// Funken als Kunst-Pixel (Position in logischen Canvas-Pixeln, siehe spawnParticles)
function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = p.life > 0.25 ? 1 : 0.5;
    const s = p.size >= 6 ? 2 : 1;
    fill(p.color, Math.round(logToArt(p.x)), Math.round(logToArt(p.y)), s, s);
  }
  ctx.globalAlpha = 1;
}

/* ---------- Maus-Anzeige ---------- */

// Ort eines Welt-Punktes im Koordinatensystem des Spielers, z. B. „(4,5 | 1,5)“
function placeText(x, y, digits = 2) {
  return `(${formatNumber(viewX(x), digits)} | ${formatNumber(viewY(y), digits)})`;
}

// Position der Maus – im eigenen Koordinatensystem des Spielers (Nullpunkt im Spieler)
function drawMouseInfo() {
  const m = state.mouse;
  if (!m) return;
  // über einem Gegner (oder Spieler im Multiplayer) dessen genaue Lage, sonst die der Maus
  const enemy = aliveEnemies().find(e => Math.hypot(e.x - m.x, e.y - m.y) <= e.r);
  const text = (state.mode === 'multi' ? mpHoverText(m) : null) ||
    (enemy ? placeText(enemy.x, enemy.y) : `(${formatNumber(viewX(m.x), 1)} | ${formatNumber(viewY(m.y), 1)})`);
  const T = pix.T;
  const S = pix.S;
  const w = textWidth(text) + 16 * S;
  const h = 18 * S;
  const x = canvas.width - w - 10 * T;
  const y = 10 * T;
  pixelPanel(x, y, w, h, COLORS.parchment);
  pixelText(text, x + 8 * S, y + 14 * S, COLORS.ink);
}

/* ---------- Pixel-Icons für die Oberfläche ----------
   Kleine Raster ('#' = Pixel), daraus wird ein SVG gebaut, das die Textfarbe
   übernimmt. Größe immer ein Vielfaches von --p (siehe style.css) → scharf. */

const ICONS = {
  user: ['...####...', '..######..', '..######..', '..######..', '...####...', '..........', '..######..', '.########.', '##########', '##########'],
  gear: ['....##....', '.#.####.#.', '..######..', '.###..###.', '####..####', '####..####', '.###..###.', '..######..', '.#.####.#.', '....##....'],
  dice: ['.########.', '##########', '##.####.##', '##########', '####..####', '####..####', '##########', '##.####.##', '##########', '.########.'],
  restart: ['...####.#.', '.##....###', '.#....####', '##........', '#.........', '#........#', '##......##', '.##....##.', '...####...', '..........'],
  play: ['..#.......', '..##......', '..###.....', '..####....', '..#####...', '..#####...', '..####....', '..###.....', '..##......', '..#.......'],
  chart: ['#.........', '#.......##', '#......#..', '#.....#...', '#....#....', '#..##.....', '#.#.......', '##........', '##########', '..........'],
  keyboard: ['..........', '##########', '#.#.#.#.##', '##########', '##.#.#.#.#', '##########', '#.######.#', '##########', '..........', '..........'],
  help: ['..####....', '.##..##...', '.##..##...', '.....##...', '....##....', '...##.....', '...##.....', '..........', '...##.....', '...##.....'],
  flag: ['##........', '########..', '#########.', '########..', '#######...', '########..', '##........', '##........', '##........', '##........'],
  infinity: ['..........', '..........', '.###..###.', '##.####.##', '#...##...#', '##.####.##', '.###..###.', '..........', '..........', '..........'],
  target: ['...####...', '.##....##.', '.#..##..#.', '#..#..#..#', '#.#.##.#.#', '#.#.##.#.#', '#..#..#..#', '.#..##..#.', '.##....##.', '...####...'],
  swords: ['#........#', '##......##', '.##....##.', '..##..##..', '...####...', '...####...', '.#.#..#.#.', '..#....#..', '.#.#..#.#.', '#........#'],
  info: ['....##....', '....##....', '..........', '...###....', '....##....', '....##....', '....##....', '....##....', '...####...', '..........'],
  wall: ['##########', '####.#####', '####.#####', '..........', '#.#####.##', '#.#####.##', '..........', '####.#####', '####.#####', '##########'],
  calendar: ['.#....#...', '##########', '##########', '#........#', '#.##.##.##', '#........#', '#.##.##.##', '#........#', '##########', '..........'],
  key: ['..........', '.###......', '#...#.....', '#...######', '#...#.#.#.', '.###..#.#.', '..........', '..........', '..........', '..........'],
  pencil: ['.......##.', '......####', '.....####.', '....####..', '...####...', '..####....', '.####.....', '.###......', '##........', '#.........'],
  close: ['##......##', '###....###', '.###..###.', '..######..', '...####...', '...####...', '..######..', '.###..###.', '###....###', '##......##'],
  check: ['..........', '.........#', '........##', '.......##.', '#.....##..', '##...##...', '.##.##....', '..###.....', '...#......', '..........'],
  trophy: ['#.######.#', '#.######.#', '.########.', '..######..', '...####...', '....##....', '....##....', '...####...', '..######..', '..######..'],
  heart: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  shield: ['##########', '##########', '##########', '##########', '.########.', '.########.', '..######..', '...####...', '....##....'],
  warning: ['....##....', '...####...', '...####...', '..##..##..', '..##..##..', '.###..###.', '.########.', '####..####', '##########', '..........'],
  crest: ['##########', '#.##..##.#', '#.##..##.#', '##########', '##########', '.########.', '.###..###.', '..##..##..', '...####...', '....##....'],
  slime: ['..........', '...####...', '.########.', '.##.##.##.', '##########', '##########', '##########', '.########.', '..........', '..........'],
  eraser: ['..........', '.....###..', '....#####.', '...#######', '..#.#####.', '.#...###..', '#.....#...', '.#...#....', '..###.....', '..........'],
  bolt: ['.....###..', '....###...', '...###....', '..###.....', '.#######..', '....###...', '...###....', '..###.....', '.##.......', '#.........'],
  lock: ['..........', '...####...', '..#....#..', '..#....#..', '.########.', '.###..###.', '.###..###.', '.####.###.', '.########.', '..........'],
  copy: ['######....', '#....#....', '#..######.', '#..#....#.', '#..#....#.', '####....#.', '...#....#.', '...#....#.', '...######.', '..........'],
  insert: ['....##....', '....##....', '....##....', '..######..', '...####...', '....##....', '#........#', '#........#', '##########', '..........'],
  scroll: ['.########.', '#.#......#', '##.......#', '..#.####.#', '..#......#', '..#.####.#', '..#......#', '..#.###..#', '..#......#', '..########'],
  // Spieler-Symbole im Multiplayer (zusätzlich zur Farbe)
  circle: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
  triangle: ['...#...', '...#...', '..###..', '..###..', '.#####.', '.#####.', '#######'],
  square: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'],
  diamond: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
};

const iconPaths = {};

// SVG-Pfad aus einem Raster: jede waagerechte Reihe von '#' wird ein Rechteck
function iconPath(name) {
  if (iconPaths[name]) return iconPaths[name];
  let d = '';
  ICONS[name].forEach((row, y) => row.replace(/#+/g, (run, x) => { d += `M${x} ${y}h${run.length}v1h-${run.length}z`; return run; }));
  return (iconPaths[name] = d);
}

// Icon als SVG-Text (für innerHTML); cls: zusätzliche Klasse, z. B. 'empty'
function icon(name, cls = '') {
  const rows = ICONS[name];
  const w = rows[0].length;
  const h = rows.length;
  return `<svg class="ico ${cls}" style="--w:${w};--h:${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${iconPath(name)}"/></svg>`;
}

// Icon als Element (für replaceChildren / append)
function iconNode(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = icon(name, cls);
  return t.content.firstChild;
}

// Ersetzt alle <i data-icon="…"> im Dokument (bzw. in root) durch das Icon
function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach(el => el.replaceWith(iconNode(el.dataset.icon)));
}

// Icon-Raster als Kunst-Pixel aufs Spielfeld (z. B. Power-ups), mittig um (ci, cj)
function drawIcon(name, ci, cj, color) {
  const rows = ICONS[name];
  const sprite = spriteFromRows('icon|' + name + '|' + color, rows, { '#': color });
  blit(sprite, ci - Math.floor(sprite.width / 2), cj - Math.floor(sprite.height / 2));
}

/* ==========================================================
   8. BENUTZEROBERFLÄCHE & EINSTELLUNGEN
   ========================================================== */

let ui = {};
let mathReady = false;
let lastTime = 0;

function formatNumber(n, digits = 2) {
  return (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString('de-DE');
}

function showMessage(text, kind = '') {
  ui.message.textContent = text;
  ui.message.className = 'message ' + kind;
}

function updateHUD() {
  if (state.mode === 'multi') { mpUpdateHUD(); return; }
  ui.fireBar.classList.remove('my-turn');
  const limited = limitedShots();
  const alive = aliveEnemies().length;
  ui.enemyCount.textContent = state.mode === 'endless' || state.mode === 'sandbox' ? alive : `${alive} / ${state.enemies.length}`;
  ui.scoreItem.hidden = state.mode !== 'endless';
  ui.shotItem.hidden = !limited && state.mode !== 'endless';

  let pips = 0, filled = 0;
  if (limited) {
    ui.shotItem.title = 'Angriffe';
    ui.shotCount.textContent = `${state.shotsLeft} / ${state.map.shots}`;
    pips = state.map.shots;
    filled = state.shotsLeft;
  }
  if (state.mode === 'endless') {
    const untilMove = ENDLESS_MOVE_EVERY - (state.shotsFired % ENDLESS_MOVE_EVERY);
    ui.shotItem.title = `Umzug in ${untilMove}`;
    ui.shotCount.textContent = state.shotsFired;
    pips = ENDLESS_MOVE_EVERY;
    filled = untilMove;
    ui.score.textContent = state.score;
    ui.bestCombo.textContent = `×${state.bestCombo}`;
  }
  ui.shotPips.replaceChildren(...Array.from({ length: pips }, (_, i) => {
    const pip = document.createElement('span');
    pip.className = 'pip' + (i < filled ? '' : ' used');
    return pip;
  }));
  ui.fireBtn.disabled = state.status !== 'playing' || state.shot !== null || (limited && state.shotsLeft <= 0);
}

// Reiter in der Kopfzeile: Tutorial, Level (öffnet die Auswahl), Endlos, Sandkasten, Multiplayer, Info
function buildLevelSelect() {
  const tab = (label, symbol, current, title, onClick) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (current ? ' current' : '');
    btn.title = title;
    const text = document.createElement('span');
    text.className = 'tab-label';
    text.textContent = label;
    btn.append(iconNode(symbol), text);
    btn.addEventListener('click', onClick);
    return btn;
  };
  const levelLabel = state.mode === 'levels' ? (state.daily ? 'TAGES-LEVEL' : `LEVEL ${state.levelIndex + 1}`)
    : state.mode === 'editor' || state.mode === 'custom' ? 'EDITOR' : 'LEVEL';
  ui.levelSelect.replaceChildren(
    tab('TUTORIAL', 'help', state.mode === 'tutorial', 'Spielerklärung Schritt für Schritt', () => switchMode(() => startTutorial(0))),
    tab(levelLabel, 'flag', ['levels', 'editor', 'custom'].includes(state.mode), 'Level, Tages-Herausforderung, Editor, Karten-Code', openLevelDialog),
    tab('ENDLOS', 'infinity', state.mode === 'endless', 'Unbegrenzt spielen, Gegner tauchen immer wieder auf', () => switchMode(startEndless)),
    tab('SANDKASTEN', 'target', state.mode === 'sandbox', 'Funktionen frei ausprobieren', () => switchMode(startSandbox)),
    tab('MULTIPLAYER', 'swords', state.mode === 'multi', 'Live mit anderen spielen (Lobby mit Code)', mpOpenDialog),
    tab('INFO', 'info', false, 'So gibst du Funktionen ein', () => ui.infoDialog.showModal()),
  );
  fitCanvas();   // die Reiter können breiter geworden sein (Kopfzeile kompakt?)
}

// Fenster mit allen Leveln (erledigte grün, gesperrte grau)
function openLevelDialog() {
  const done = loadValue(STORAGE_KEY + '.done', []);
  ui.levelGrid.replaceChildren(...LEVELS.map((level, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-choice' + (done.includes(i) ? ' done' : '') + (state.mode === 'levels' && i === state.levelIndex ? ' current' : '');
    btn.disabled = i > state.unlocked;
    const num = document.createElement('b');
    num.textContent = i + 1;
    const name = document.createElement('span');
    if (i <= state.unlocked) name.textContent = level.name;
    else name.append(iconNode('lock'));
    btn.append(num, name);
    btn.addEventListener('click', () => {
      ui.levelDialog.close();
      switchMode(() => loadLevel(i));
    });
    return btn;
  }));
  const best = loadValue(STORAGE_KEY + '.daily.' + todayString(), null);
  ui.dailyBest.replaceChildren(...(best === null ? [] : [iconNode('bolt'), ` ${best}`]));
  ui.codeError.textContent = '';
  ui.levelDialog.showModal();
}

function showOverlay(kind) {
  const box = ui.overlay.querySelector('.overlay-box');
  box.className = 'overlay-box ' + kind;
  const isLast = state.levelIndex === LEVELS.length - 1;
  ui.overlayRetry.hidden = ui.overlayNewmap.hidden = false;
  ui.overlayLobby.hidden = true;

  ui.overlayNext.innerHTML = 'Weiter ' + icon('play');
  ui.overlayNewmap.hidden = state.mode === 'custom';
  if (kind === 'won') {
    const used = state.map.shots - state.shotsLeft;
    ui.overlayTitle.textContent = state.mode === 'levels' && !state.daily && isLast ? 'Alle Level geschafft!' : 'Geschafft!';
    ui.overlayText.replaceChildren(iconNode('bolt'), ` ${used} / ${state.map.shots}` +
      (state.daily ? `  ·  Bestwert ${loadValue(STORAGE_KEY + '.daily.' + state.daily, used)}` : ''));
    ui.overlayNext.hidden = state.mode === 'levels' && (isLast || !!state.daily);
  } else {
    const solutions = [...new Set(state.map.solution)];
    ui.overlayTitle.textContent = 'Keine Angriffe mehr';
    ui.overlayText.textContent = solutions.length ? 'Lösung: ' + solutions.map(s => `\\(${compileLatex(s).tex}\\)`).join(' und ') : '';
    ui.overlayNext.hidden = state.mode !== 'custom';
    typeset(ui.overlayText);
  }
  if (state.mode === 'custom') ui.overlayNext.innerHTML = icon('pencil') + ' Editor';
  ui.overlay.hidden = false;
  (ui.overlayNext.hidden ? ui.overlayRetry : ui.overlayNext).focus();
}

// Warnt, wenn die Lösung der aktuellen Karte abgeschaltete Funktionstypen braucht
function updateLevelWarning() {
  const used = new Set(state.map.solution.flatMap(s => compileLatex(s).types || []));
  const blocked = blockedTypes([...used]);
  ui.levelWarning.hidden = blocked.length === 0;
  ui.levelWarning.replaceChildren(iconNode('warning'), ` Aus: ${typeNames(blocked)}`);
}

/* ---------- Einstellungen ---------- */

function buildSettings() {
  const groups = {};
  for (const [type, info] of Object.entries(FUNCTION_TYPES)) {
    (groups[info.group] = groups[info.group] || []).push([type, info.label]);
  }
  ui.typeToggles.replaceChildren(...Object.entries(groups).map(([group, entries]) => {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group;
    fieldset.append(legend, ...entries.map(([type, name]) => {
      const row = document.createElement('label');
      row.className = 'toggle';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !settings.disabled.has(type);
      box.dataset.type = type;
      box.addEventListener('change', () => {
        if (box.checked) settings.disabled.delete(type);
        else settings.disabled.add(type);
        settingsChanged();
      });
      row.append(box, document.createTextNode(name));
      return row;
    }));
    return fieldset;
  }));
}

function setAllTypes(enabled) {
  settings.disabled = enabled ? new Set() : new Set(Object.keys(FUNCTION_TYPES));
  buildSettings();
  settingsChanged();
}

function settingsChanged() {
  saveValue(STORAGE_KEY + '.disabled', [...settings.disabled]);
  updatePreview();
  updateLevelWarning();
}

function updateWallsToggle() {
  ui.wallsToggle.replaceChildren(iconNode('wall'), settings.endlessWalls ? ' AN' : ' AUS');
  ui.wallsToggle.classList.toggle('off', !settings.endlessWalls);
  ui.endlessWallsBox.checked = settings.endlessWalls;
}

function openSettings() {
  ui.mapMatrix.textContent = gridToText(currentGrid());
  ui.settings.showModal();
}

/* ---------- Formel-Vorschau ---------- */

// Zeigt die Eingabe als gerenderte Formel – genau so, wie sie verstanden wurde
function updatePreview() {
  const text = stripPrefix(ui.input.value).trim();
  const result = compileShot(text);
  const label = MODE_LABEL[state.inputMode];
  const blocked = result.ok ? blockedTypes(result.types) : [];

  let error = '';
  if (text !== '' && !result.ok) error = result.error;
  else if (blocked.length) error = `Aus: ${typeNames(blocked)}`;
  else if (text !== '') error = shotError(result);
  const kind = error ? 'error' : text !== '' ? 'ok' : '';
  if (error) ui.parseStatus.replaceChildren(iconNode('close'), ' ' + error);
  else ui.parseStatus.textContent = '';
  ui.parseStatus.className = 'parse-status ' + kind;
  ui.preview.className = 'preview ' + kind;

  const side = result.ok && result.dir < 0;   // nach links: Pfeil vor der Formel
  if (!result.ok || !mathReady) {
    ui.preview.textContent = (side ? '← ' : '') + label + (text === '' ? '…' : result.ok ? result.tex : text);
    return;
  }
  try {
    ui.preview.replaceChildren(MathJax.tex2svg((side ? '\\leftarrow\\ ' : '') + label + result.tex, { display: true }));
  } catch {
    ui.preview.textContent = label + text;
  }
}

// Kann von hier aus überhaupt geschossen werden (z. B. f bei dir definiert)? Ergebnis: Fehlertext oder ''
function shotError(result) {
  if (!state.map || !state.player) return '';
  return buildCurve(result.shape, state.player, null, result.dir).error || '';
}

// MathJax wird asynchron geladen; ohne Internet bleibt die Textvorschau
function whenMathJaxReady(callback) {
  const check = () => {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(callback);
    else setTimeout(check, 200);
  };
  check();
}

function typeset(element) {
  if (!mathReady) return;
  MathJax.typesetClear([element]);
  MathJax.typesetPromise([element]).catch(() => { /* Formel bleibt als Text stehen */ });
}

/* ---------- Canvas & Maus ---------- */

// Pixel der Oberfläche (--p in style.css): immer eine ganze Zahl n Bildschirmpixel, möglichst
// nah an 1 CSS-Pixel (bei 150 % also 2, bei 125 % 1 – gerundet im Verhältnis). Ist das Fenster
// dafür zu klein, wird n kleiner; ist es riesig (z. B. 4K bei 100 %), größer.
// Die Oberfläche ist in Einheiten von 1,5 · --p gebaut (--u), die Schrift ebenso (pix.S).
function setPixelScale(dpr) {
  const lo = Math.max(1, Math.floor(dpr));
  const hi = Math.max(1, Math.ceil(dpr));
  let n = dpr / lo <= hi / dpr ? lo : hi;
  const w = window.innerWidth * dpr;
  const h = window.innerHeight * dpr;
  n = Math.min(n, Math.max(1, Math.floor(Math.min(w / 1700, h / 980))));
  n = Math.max(n, Math.floor(Math.min(w / 1900, h / 1070)));
  document.documentElement.style.setProperty('--p', n / dpr + 'px');
  pix.T = n;
  pix.S = 1.5 * n;
}

const FRAME = 12;   // Breite des Holzrahmens ums Spielfeld in Oberflächen-Pixeln (--p), siehe .frame in style.css

// Spielfeld an die verfügbare Fläche anpassen – auflösungsfest:
// Eine Einheit ist U = K · A Bildschirmpixel (K Bildschirmpixel pro Kunst-Pixel, A Kunst-Pixel pro
// Einheit, A zwischen 7 und 11). Das Canvas hat genau so viele Pixel wie der Bildschirm an dieser
// Stelle und liegt auf ganzen Bildschirmpixeln – nichts wird vom Browser skaliert oder geglättet.
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  setPixelScale(dpr);
  // Passt die Kopfzeile nicht in eine Zeile, zeigen die Reiter nur ihre Icons (Name beim Draufzeigen)
  const topbar = ui.levelSelect.parentElement;
  const firstTab = ui.levelSelect.firstElementChild;
  topbar.classList.remove('compact');
  const logo = topbar.firstElementChild;
  const wrapped = [...topbar.children].some(el => el.offsetTop > logo.offsetTop + logo.offsetHeight / 2) ||
    (firstTab && ui.levelSelect.offsetHeight > 1.6 * firstTab.offsetHeight + 12);
  topbar.classList.toggle('compact', wrapped);
  const box = ui.stage.getBoundingClientRect();
  const room = FRAME * pix.T + 6 * pix.T;   // Platz für Holzrahmen und Schatten
  const maxU = Math.max(7, Math.floor(Math.min((box.width * dpr - 2 * room) / COLS, (box.height * dpr - 2 * room) / ROWS)));
  let best = { K: 1, A: 7, score: 0 };
  for (let K = 1; K <= 16; K++) {
    const A = Math.min(11, Math.floor(maxU / K));
    if (A < 7) break;
    const score = K * A * (A >= 8 ? 1 : 0.95);   // A = 7 nur, wenn es deutlich mehr Fläche bringt
    if (score > best.score) best = { K, A, score };
  }
  pix.K = best.K;
  pix.A = best.A;
  pix.U = best.K * best.A;
  canvas.width = COLS * pix.U;
  canvas.height = ROWS * pix.U;
  canvas.style.width = canvas.width / dpr + 'px';
  canvas.style.height = canvas.height / dpr + 'px';
  // mittig, aber auf ganzen Bildschirmpixeln
  const left = Math.round(box.left * dpr + (box.width * dpr - canvas.width) / 2) - box.left * dpr;
  const top = Math.round(box.top * dpr + (box.height * dpr - canvas.height) / 2) - box.top * dpr;
  canvas.style.left = left / dpr + 'px';
  canvas.style.top = top / dpr + 'px';
  // Holzrahmen ringsum, ebenfalls auf ganzen Bildschirmpixeln
  const F = FRAME * pix.T;
  Object.assign(ui.frame.style, {
    left: (left - F) / dpr + 'px', top: (top - F) / dpr + 'px',
    width: (canvas.width + 2 * F) / dpr + 'px', height: (canvas.height + 2 * F) / dpr + 'px',
  });
  ctx.imageSmoothingEnabled = false;
  background = null;
  if (state.map) draw();   // sofort neu malen – sonst bliebe das geleerte Canvas bis zum nächsten Bild leer
}

function onMouseMove(event) {
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * WIDTH / rect.width;
  const py = (event.clientY - rect.top) * HEIGHT / rect.height;
  state.mouse = { x: toMathX(px), y: toMathY(py) };
}

function gameLoop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (state.mode === 'multi') mpTick();
  else updateShot(dt);
  updateEffects(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function init() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  ui = {
    stage: $('stage'),
    frame: $('frame'),
    sidebar: $('sidebar'),
    playerName: $('player-name'),
    fireBar: $('fire-bar'),
    restartBtn: $('restart-btn'),
    newmapBtn: $('newmap-btn'),
    levelDialog: $('level-dialog'),
    levelGrid: $('level-grid'),
    infoDialog: $('info-dialog'),
    catalogBtn: $('catalog-btn'),
    catalogCard: $('catalog-card'),
    catalogList: $('catalog-list'),
    mpDialog: $('mp-dialog'),
    mpDialogBody: $('mp-dialog-body'),
    mpCardHead: $('mp-card-head'),
    mpCardBody: $('mp-card-body'),
    mpStatus: $('mp-status'),
    mpLeaveBtn: $('mp-leave-btn'),
    mpLobbyBtn: $('mp-lobby-btn'),
    overlayNewmap: $('overlay-newmap'),
    fxMode: $('fx-mode'),
    odeControls: $('ode-controls'),
    odeAngle: $('ode-angle'),
    odeAngleBox: $('ode-angle-box'),
    keypad: $('keypad'),
    keypadBtn: $('keypad-btn'),
    editorTools: $('editor-tools'),
    editorPalette: $('editor-palette'),
    editorShots: $('editor-shots'),
    editorError: $('editor-error'),
    mapCode: $('map-code'),
    mapCodeText: $('map-code-text'),
    mapCodeEdit: $('map-code-edit'),
    dailyBest: $('daily-best'),
    codeError: $('code-error'),
    overlayLobby: $('overlay-lobby'),
    input: $('fx-input'),
    preview: $('preview'),
    parseStatus: $('parse-status'),
    fireBtn: $('fire-btn'),
    message: $('message'),
    enemyCount: $('enemy-count'),
    shotItem: $('shot-item'),
    shotCount: $('shot-count'),
    shotPips: $('shot-pips'),
    scoreItem: $('score-item'),
    score: $('score'),
    bestCombo: $('best-combo'),
    levelCard: $('level-card'),
    levelNum: $('level-num'),
    levelName: $('level-name'),
    levelTask: $('level-task'),
    levelWarning: $('level-warning'),
    tutorialNav: $('tutorial-nav'),
    tutorialNext: $('tutorial-next'),
    tutorialSkip: $('tutorial-skip'),
    wallsToggle: $('walls-toggle'),
    levelSelect: $('level-select'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'),
    overlayRetry: $('overlay-retry'),
    overlayNext: $('overlay-next'),
    settings: $('settings'),
    typeToggles: $('type-toggles'),
    endlessWallsBox: $('endless-walls'),
    wallsBreakableBox: $('walls-breakable'),
    mapMatrix: $('map-matrix'),
  };

  state.unlocked = loadProgress();
  state.bestCombo = loadValue(STORAGE_KEY + '.bestCombo', 0);
  settings.disabled = new Set(loadValue(STORAGE_KEY + '.disabled', []).filter(t => t in FUNCTION_TYPES));
  settings.endlessWalls = loadValue(STORAGE_KEY + '.endlessWalls', true);
  settings.wallsBreakable = loadValue(STORAGE_KEY + '.wallsBreakable', true);
  ui.wallsBreakableBox.checked = settings.wallsBreakable;

  ui.input.addEventListener('input', updatePreview);
  inputHistory.list = loadValue(STORAGE_KEY + '.history', []);
  ui.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') fire();
    else if (e.key === 'ArrowUp') { e.preventDefault(); browseHistory(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); browseHistory(-1); }
  });
  ui.fireBtn.addEventListener('click', fire);
  ui.restartBtn.addEventListener('click', restart);
  ui.newmapBtn.addEventListener('click', newMap);
  ui.catalogBtn.addEventListener('click', toggleCatalog);
  $('catalog-close').addEventListener('click', toggleCatalog);
  $('settings-btn').addEventListener('click', openSettings);
  $('all-on').addEventListener('click', () => setAllTypes(true));
  $('all-off').addEventListener('click', () => setAllTypes(false));
  ui.endlessWallsBox.addEventListener('change', () => setEndlessWalls(ui.endlessWallsBox.checked));
  ui.wallsBreakableBox.addEventListener('change', () => {
    settings.wallsBreakable = ui.wallsBreakableBox.checked;
    saveValue(STORAGE_KEY + '.wallsBreakable', settings.wallsBreakable);
  });
  ui.wallsToggle.addEventListener('click', () => setEndlessWalls(!settings.endlessWalls));
  ui.tutorialNext.addEventListener('click', () => {
    if (state.tutorialIndex === TUTORIAL.length - 1) finishTutorial();
    else startTutorial(state.tutorialIndex + 1);
  });
  ui.tutorialSkip.addEventListener('click', finishTutorial);
  ui.overlayRetry.addEventListener('click', restart);
  ui.overlayNewmap.addEventListener('click', newMap);
  ui.overlayNext.addEventListener('click', () => {
    if (state.mode === 'custom') startEditor(state.baseMap.code);
    else loadLevel(state.levelIndex + 1);
  });

  // Eingabe-Modus, Profi-Felder, Mathe-Tasten
  ui.fxMode.addEventListener('change', () => setInputMode(ui.fxMode.value));
  ui.odeAngle.addEventListener('input', updatePreview);
  ui.keypad.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });   // Cursor bleibt im Feld
  ui.keypad.addEventListener('click', e => { const b = e.target.closest('button'); if (b) keypadPress(b); });
  ui.keypadBtn.addEventListener('click', () => toggleKeypad());
  toggleKeypad(loadValue(STORAGE_KEY + '.keypad', window.matchMedia('(pointer: coarse)').matches));
  setInputMode(loadValue(STORAGE_KEY + '.inputMode', 'y'));

  // Level-Fenster: Tages-Herausforderung, Editor, Karten-Code
  $('daily-btn').addEventListener('click', () => { ui.levelDialog.close(); startDaily(); });
  $('editor-btn').addEventListener('click', () => { ui.levelDialog.close(); switchMode(() => startEditor()); });
  const loadCode = () => {
    if (loadMapCode($('code-input').value)) ui.levelDialog.close();
    else ui.codeError.textContent = 'Code unbekannt';
  };
  $('code-load').addEventListener('click', loadCode);
  $('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadCode(); } });
  $('map-code-copy').addEventListener('click', () => copyText(mapCodeText()).then(() => showMessage('Kopiert', 'good')));
  ui.mapCodeEdit.addEventListener('click', () => startEditor(state.baseMap.code));

  // Editor
  ui.editorPalette.addEventListener('click', e => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    editor.tool = b.dataset.tool;
    editorRenderTools();
  });
  ui.editorShots.addEventListener('input', () => {
    editor.shots = Math.max(1, Math.min(30, parseInt(ui.editorShots.value, 10) || 1));
    editorSync();
  });
  $('editor-test').addEventListener('click', editorTest);
  $('editor-copy').addEventListener('click', () => copyText(encodeMap(state.map.grid, editor.shots)).then(() => showMessage('Kopiert', 'good')));
  $('editor-clear').addEventListener('click', () => {
    if (!confirm('Karte leeren?')) return;
    saveValue(EDITOR_KEY, '');
    startEditor('K1-5-a1500');
  });
  $('editor-load').addEventListener('click', () => {
    const code = $('editor-code').value.trim();
    if (decodeMap(code)) startEditor(code);
    else ui.editorError.textContent = 'Code ungültig';
  });
  canvas.addEventListener('pointerdown', event => {
    if (state.mode !== 'editor') return;
    onMouseMove(event);
    editor.painting = true;
    editorPaint(state.mouse);
  });
  canvas.addEventListener('pointermove', event => {
    if (state.mode !== 'editor') return;
    onMouseMove(event);
    if (editor.painting && editor.tool !== 'player') editorPaint(state.mouse);
  });
  window.addEventListener('pointerup', () => { editor.painting = false; });

  // Beispiele aus dem Info-Fenster ins Eingabefeld übernehmen
  document.querySelectorAll('.example').forEach(btn => btn.addEventListener('click', () => {
    if (ui.infoDialog.open) ui.infoDialog.close();
    ui.input.value = btn.dataset.input;
    updatePreview();
    ui.input.focus();
    ui.input.classList.remove('flash');
    void ui.input.offsetWidth;          // Animation neu starten
    ui.input.classList.add('flash');
  }));

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', () => { state.mouse = null; });
  canvas.addEventListener('click', event => {
    onMouseMove(event);
    toggleTarget(state.mouse);
  });
  window.addEventListener('resize', fitCanvas);
  new ResizeObserver(fitCanvas).observe(ui.stage);

  // Ist die Pixel-Schrift geladen, den vorgezeichneten Hintergrund neu malen
  if (document.fonts) {
    document.fonts.load(`${TEXT_SIZE}px "Jersey 10"`).then(() => { fontsReady = true; });
  } else fontsReady = true;
  hydrateIcons();
  buildSettings();
  buildCatalog();
  mpInit();
  updateWallsToggle();
  fitCanvas();
  if (loadValue(STORAGE_KEY + '.tutorialSeen', false)) loadLevel(state.unlocked);
  else startTutorial(0);
  updatePreview();

  whenMathJaxReady(() => {
    mathReady = true;
    updatePreview();
    typeset(ui.levelCard);
  });

  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', init);
