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
     name, task, hint : Texte (Mathe in \( ... \) wird von MathJax gesetzt)
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
  {
    name: 'Erste Gerade',
    task: 'Du hast dein eigenes Koordinatensystem: Du bist der Ursprung (0 | 0), und deine Funktion wird von dir aus gezeichnet. Die Gerade \\(m\\cdot x\\) fliegt nach rechts – mit Minus direkt vor x, z. B. (-x)/2, nach links.',
    hint: 'Fahre mit der Maus über einen Gegner: Liegt er z. B. 4,5 rechts und 1,5 oben von dir, ist m = 1,5 / 4,5 = 1/3. Alle Gegner liegen auf einer Geraden.',
    shapes: ['linear'], count: 3, hp: [1], walls: 3, spareShots: 2,
  },
  {
    name: 'Zwei Geraden',
    task: 'Zwei Gegnergruppen auf zwei Geraden durch dich – vielleicht in verschiedenen Richtungen. Ein \\(+b\\) ändert nichts, nur Steigung und Richtung zählen. Wände (graue Blöcke) halten deinen Schuss auf – sind sie zerstörbar (⚙ Einstellungen), bekommen sie dabei ein Loch.',
    hint: 'Steigung m = Δy / Δx, gemessen von dir bis zum Gegner. Liegt die Gruppe links von dir, schreibe Minus direkt vor x: (-x)/2 steigt nach links.',
    shapes: ['linear', 'linear'], count: 3, hp: [1], walls: 6, spareShots: 1,
  },
  {
    name: 'Dicke Brocken',
    task: 'Größere Gegner halten mehr aus – die Kästchen über ihnen zeigen ihre Lebenspunkte. Pro Schuss gibt es höchstens 1 Schaden je Gegner.',
    hint: 'Schieße mehrmals mit derselben Geraden durch die großen Gegner.',
    shapes: ['linear', 'linear'], count: 3, hp: [1, 2], walls: 8, spareShots: 1,
  },
  {
    name: 'Die Parabel',
    task: 'Die Parabel \\(a\\cdot x^2\\) hat ihren Scheitel bei x = 0 – also genau bei dir, im Ursprung deines Koordinatensystems.',
    hint: 'Lies die Lage eines Gegners an deinen Achsen ab, z. B. (4,5 | 2,5). Dann ist a ≈ 2,5 / 4,5² ≈ 1/8, also x^2/8.',
    shapes: ['parabola'], count: 4, hp: [1, 2], walls: 8, spareShots: 1,
  },
  {
    name: 'Wurfparabel',
    task: 'Eine Gruppe liegt auf einer Parabel der Form \\(\\frac{x(k-x)}{d}\\), die andere auf einer Geraden.',
    hint: 'Die Parabel hat ihre Nullstellen bei x = 0 (bei dir) und x = k und den Scheitel bei x = k/2 – alles in deinem Koordinatensystem.',
    shapes: ['throw', 'linear'], count: 3, hp: [1], walls: 10, spareShots: 1,
  },
  {
    name: 'Polynom-Schlange',
    task: 'Die Gegner liegen auf einem Polynom dritten Grades \\(\\frac{x(x-a)(x+a)}{d}\\).',
    hint: 'Hoch- und Tiefpunkte liegen symmetrisch zu dir (x = 0). Die Nullstellen sind x = −a, 0 und a.',
    shapes: ['cubic'], count: 4, hp: [1], walls: 10, spareShots: 1,
  },
  {
    name: 'Hyperbel mit Lücke',
    task: '\\(\\frac{a}{x-b}\\) hat bei x = b eine Definitionslücke. Dort endet dein Schuss – er springt nicht darüber.',
    hint: 'Liegt die Lücke zwischen dir und den Gegnern, schieß in die andere Richtung oder wähle ein anderes b.',
    shapes: ['rational'], count: 4, hp: [1], walls: 10, spareShots: 1,
  },
  {
    name: 'Wurzelkraft',
    task: '\\(\\sqrt{x}\\) gibt es nur für x ≥ 0, \\(\\sqrt{-x}\\) nur für x ≤ 0 (Schuss nach links), \\(\\sqrt{|x|}\\) überall.',
    hint: 'Ein Faktor davor streckt die Wurzel: \\(2\\sqrt{x}\\) ist doppelt so steil, \\(-\\sqrt{x}\\) zeigt nach unten.',
    shapes: ['sqrt', 'sqrt'], count: 3, hp: [1, 2], walls: 10, spareShots: 1,
  },
  {
    name: 'Exponentiell',
    task: '\\(e^{\\frac{x}{k}}\\) wächst immer schneller – erst flach, dann immer steiler. \\(e^{\\frac{-x}{k}}\\) ist das Spiegelbild und fliegt nach links.',
    hint: 'Je größer k, desto flacher. Die zweite Gruppe liegt auf einer Geraden.',
    shapes: ['exp', 'linear'], count: 3, hp: [1], walls: 12, spareShots: 1,
  },
  {
    name: 'Sinuswelle',
    task: 'Die Sinuswelle startet bei dir und schwingt auf und ab. Verlässt sie das Feld oben oder unten, endet der Schuss.',
    hint: 'Die Amplitude ist die Höhe der Wellenberge. \\(\\sin(\\frac{x}{2})\\) hat eine doppelt so lange Periode wie \\(\\sin(x)\\).',
    shapes: ['sin'], count: 5, hp: [1], walls: 12, spareShots: 1,
  },
  {
    name: 'Kosinus & Tangens',
    task: 'Eine Gruppe liegt auf einer Kosinuswelle, die andere auf einem Tangens. Am Sprung des Tangens endet der Schuss.',
    hint: 'Die Wellenberge von \\(a\\cos(\\frac{x}{k})\\) liegen bei x = 0 (bei dir), ±2kπ … \\(\\tan(\\frac{x}{k})\\) springt bei \\(x = \\pm\\frac{k\\pi}{2}\\).',
    shapes: ['cos', 'tan'], count: 3, hp: [1], walls: 12, spareShots: 1,
  },
  {
    name: 'Finale',
    task: 'Kombinierte Funktionen wie \\(\\frac{x}{4}+\\sin(x)\\) – und Bosse mit 3 Lebenspunkten.',
    hint: 'Eine Gruppe liegt auf einer Summe (Gerade, Parabel oder Wurzel plus Sinus/Kosinus), die andere auf einer Parabel.',
    shapes: ['combo', 'parabola'], count: 4, hp: [1, 2, 3], walls: 14, spareShots: 1,
  },
];

// Zufallshilfen
const pick = list => list[Math.floor(Math.random() * list.length)];
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Kurvenformen für die Kartengenerierung. Jede liefert eine zufällige
// Funktion als Text – genau das, was ein Spieler eintippen würde. Sie sind für
// Schüsse nach rechts geschrieben; maybeMirror (Abschnitt 5) macht daraus bei
// Bedarf einen Schuss nach links, indem jedes x zu (-x) wird. Deshalb darf
// der Buchstabe x hier nur als Variable vorkommen (z. B. nicht exp(...)), und
// kein x darf selbst schon ein Minus direkt davor haben (sonst wäre es -(-x)).
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
// player: andere Startposition für einen Schritt.
const TUTORIAL_PLAYER = { x: -5, y: -2 };
const TUTORIAL = [
  {
    title: 'Willkommen, Function Fighter!',
    text: 'Das bist du – der blaue Kämpfer mit „DU“. Die blauen Achsen sind DEIN Koordinatensystem: Du bist immer der Ursprung (0 | 0), alle Zahlen zählen von dir aus. Deine Funktion wird genau so gezeichnet wie im Sandkasten – von dir aus, und so verschoben, dass sie durch dich geht. Der Schuss fliegt von dir aus in EINE Richtung.',
  },
  {
    title: 'Deine erste Gerade',
    text: 'Fahre mit der Maus über die Gegner: Der erste liegt 4,5 rechts und 1,5 oben von dir – Steigung \\(\\frac{1{,}5}{4{,}5}=\\frac{1}{3}\\). Tippe unten x/3 ein und drücke Enter oder FEUER. Der Schuss fliegt nach rechts.',
    enemies: [[4.5, 1.5, 1], [10.5, 3.5, 1]],
    solution: ['x/3'],
  },
  {
    title: 'Nach links schießen',
    text: 'Die Richtung bestimmst du mit dem Vorzeichen von x: Steht direkt vor x ein Minus, fliegt der Schuss nach links. (-x)/3 ist das Spiegelbild von x/3 – nach links steigt es an. Probier (-x)/3.',
    enemies: [[-4.5, 1.5, 1], [-10.5, 3.5, 1]],
    solution: ['(-x)/3'],
  },
  {
    title: 'Die Parabel',
    text: 'Die Parabel x^2/8 hat ihren Scheitel bei x = 0 – also genau bei dir. Lies an deinen Achsen ab: Der erste Gegner liegt bei (4,5 | 2,5), und 4,5² / 8 ≈ 2,5. Ein +b am Ende ändert nichts, es fällt beim Verschieben weg. Probier x^2/8.',
    enemies: [[4.5, 2.5, 1], [6.5, 5.5, 1]],
    solution: ['x^2/8'],
  },
  {
    title: 'Dicke Brocken',
    text: 'Die Kästchen über einem Gegner sind seine Lebenspunkte. Jeder Schuss macht höchstens 1 Schaden pro Gegner – der große braucht also 2 Treffer. Schieße zweimal mit -x (Minus direkt vor x → nach links, steigend).',
    enemies: [[-3.5, 3.5, 2], [-6.5, 6.5, 1]],
    solution: ['-x', '-x'],
  },
  {
    title: 'Wände',
    text: 'Graue Blöcke sind Wände: Jeder Schuss endet dort und sprengt wie bei Graphwar ein Loch hinein (in den ⚙ Einstellungen kannst du Wände unzerstörbar machen). Er endet auch, wenn er das Feld verlässt oder die Funktion springt. Die direkte Gerade zum Gegner ist versperrt. Die flache Parabel x^2/33 startet bei dir fast waagerecht, läuft unter der Wand durch und steigt dann zum Gegner.',
    enemies: [[13.5, 5.5, 1]],
    walls: [[2.5, 1.5], [2.5, 2.5]],
    solution: ['x^2/33'],
  },
  {
    title: 'Bereit!',
    text: 'Merke: Du bist der Ursprung deines Koordinatensystems, die Funktion startet bei dir, Minus direkt vor x = Schuss nach links. Alle Schreibweisen findest du rechts unter „Wie gebe ich Funktionen ein?“. Im □ Sandkasten kannst du alles in Ruhe ausprobieren. Viel Spaß!',
  },
];

/* ==========================================================
   2. SPIELFELD, KOORDINATEN & KARTEN-MATRIX
   ----------------------------------------------------------
   Sichtbarer Ausschnitt in Mathe-Koordinaten (wie bei Graphwar):
   x von -25 bis 25, y von -15 bis 15 – der Ursprung liegt genau in
   der Mitte.
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
   ========================================================== */

const VIEW = { xMin: -25, xMax: 25, yMin: -15, yMax: 15 };
const WIDTH = 1500;
const UNIT = WIDTH / (VIEW.xMax - VIEW.xMin);    // 30 Pixel pro Koordinaten-Einheit
const HEIGHT = (VIEW.yMax - VIEW.yMin) * UNIT;   // 900 Pixel

const COLS = VIEW.xMax - VIEW.xMin;              // 50 Spalten
const ROWS = VIEW.yMax - VIEW.yMin;              // 30 Zeilen
const CELL = { EMPTY: 0, WALL: 4, PLAYER: 5 };   // 1–3 = Gegner mit so vielen Lebenspunkten
const ENEMY_RADIUS = { 1: 0.45, 2: 0.6, 3: 0.8 };

// Mathe -> Pixel. Die y-Achse wird umgedreht, weil Canvas-y nach unten zählt.
function toCanvasX(x) { return (x - VIEW.xMin) * UNIT; }
function toCanvasY(y) { return (VIEW.yMax - y) * UNIT; }

// Pixel -> Mathe (für die Mausposition)
function toMathX(px) { return px / UNIT + VIEW.xMin; }
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
  power:    { group: 'Grundlagen', label: 'Potenzen & Polynome (x², x(x+1))' },
  rational: { group: 'Grundlagen', label: 'Bruchfunktionen (x im Nenner)' },
  abs:      { group: 'Grundlagen', label: 'Betrag |x|' },
  sqrt:     { group: 'Wurzeln', label: 'Quadratwurzel √x' },
  root:     { group: 'Wurzeln', label: 'n-te Wurzel ⁿ√x' },
  exp:      { group: 'Exponentialfunktion', label: 'Exponentialfunktion (eˣ, 2ˣ, exp)' },
  sin:      { group: 'Trigonometrie', label: 'sin – Sinus' },
  cos:      { group: 'Trigonometrie', label: 'cos – Kosinus' },
  tan:      { group: 'Trigonometrie', label: 'tan – Tangens' },
  cot:      { group: 'Trigonometrie', label: 'cot – Kotangens' },
  sinh:     { group: 'Hyperbelfunktionen', label: 'sinh' },
  cosh:     { group: 'Hyperbelfunktionen', label: 'cosh' },
  tanh:     { group: 'Hyperbelfunktionen', label: 'tanh' },
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

// Variablen der Profi-Modi: y (Höhe) und y' (Steigung). Sie werden beim Lösen der
// Differentialgleichung gesetzt, bevor die Funktion ausgerechnet wird (siehe odeStepper).
const odeVars = { y: 0, p: 0 };

// Wandelt einen Befehlsnamen in ein Token um
function commandToken(name) {
  if (REMOVED_WORDS.includes(name)) fail(`„${name}“ gibt es in diesem Spiel nicht (keine Logarithmen, kein arcsin, arccos oder arctan).`);
  if (name in FUNCTIONS) return { type: 'func', name };
  if (name === 'sqrt') return { type: 'sqrt' };
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') return { type: 'frac' };
  if (name === 'pi') return { type: 'const', value: Math.PI, tex: '\\pi' };
  if (name === 'cdot' || name === 'times') return { type: 'sym', value: '*' };
  if (name === 'div') return { type: 'sym', value: '/' };
  return fail(`Der Befehl „${name}“ wird nicht unterstützt.`);
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
      if (!cmd) fail('Nach „\\“ wird ein Befehl erwartet, z. B. frac oder sqrt.');
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
          fail(prime ? 'y′ gibt es nur im Modus y″ = … (links neben dem Eingabefeld umstellen).'
            : 'y gibt es nur in den Profi-Modi y′ = … und y″ = … (links neben dem Eingabefeld umstellen).');
        }
        tokens.push({ type: 'var', name });
        i += prime ? 2 : 1;
      } else if (ch === 'e') {
        tokens.push({ type: 'const', value: Math.E, tex: 'e' });
        i++;
      } else {
        fail(`Unbekannte Variable „${ch}“. Verwende nur x als Variable.`);
      }
      continue;
    }

    if ('+-*/^_()[]{}|;'.includes(ch)) {
      tokens.push({ type: 'sym', value: ch });
      i++;
      continue;
    }

    fail(`Das Zeichen „${ch}“ wird nicht unterstützt.`);
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
// Argument auf 1 Einheit ändert – überall, wo der Schuss hinkommen kann (x von
// −50 bis 50, vom Spieler aus). So zählen auch sin(x*4), sin(8x/2) oder sin(x^2).
const MAX_TRIG_FACTOR = 4;
function checkTrigSpeed(name, arg) {
  for (let u = -50; u <= 49; u += 0.05) {
    if (Math.abs(arg(u + 1) - arg(u)) > MAX_TRIG_FACTOR + 1e-9) {
      fail(`${name} schwingt zu schnell: Die Zahl vor x darf höchstens ${MAX_TRIG_FACTOR} sein, z. B. ${name}(4x) oder ${name}(x/2).`);
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
  let xCount = 0;          // wie oft x vorkommt …
  let mirroredX = 0;       // … und wie oft davon direkt mit Minus: -x (Schuss nach links)
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

  // Kann mit diesem Token ein neuer Faktor beginnen? (für implizites Mal: 2x, 3sin(x), (x+1)(x-1))
  function startsFactor(t) {
    if (!t) return false;
    if (['num', 'x', 'var', 'const', 'func', 'frac', 'sqrt'].includes(t.type)) return true;
    return isOpen(t);
  }

  function endedTooEarly() {
    const prev = tokens[pos - 1];
    fail('Die Eingabe ist unvollständig' + (prev ? ` – nach „${describe(prev)}“ fehlt noch etwas.` : '.'));
  }

  function expect(value) {
    if (isSym(peek(), value)) { pos++; return; }
    const names = { ')': 'schließende Klammer „)“', '}': 'schließende Klammer „}“', ']': 'schließende Klammer „]“', '|': 'schließender Betragsstrich „|“' };
    fail(`Es fehlt eine ${names[value]}.`);
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
      if (a === variable) mirroredX++;
      return node(x => -a.f(x), [a], `-${a.kind === 'neg' ? paren(a.tex) : a.tex}`, 'neg');
    }
    if (isSym(peek(), '+')) { pos++; return unary(); }
    return power();
  }

  function power() {
    const base = primary();
    if (!isSym(peek(), '^')) return base;
    pos++;
    const exp = exponent();
    if (isSym(peek(), '^')) fail('Doppelter Exponent – setze Klammern, z. B. (x^2)^3.');
    if (exp.hasX) types.add('exp');            // x im Exponenten: e^x, 2^x
    else if (base.hasX) types.add('power');    // x in der Basis:  x^2
    const baseTex = base.kind === 'frac' || base.kind === 'neg' ? paren(base.tex) : base.tex;
    return node(x => Math.pow(base.f(x), exp.f(x)), [base, exp], `${baseTex}^{${bare(exp)}}`, 'power');
  }

  // Exponent: optionales Vorzeichen + EIN Baustein (Zahl, x, Funktion oder Klammer).
  // x^12 = x hoch 12,  e^-x = e hoch -x,  x^(2x+1) für längere Exponenten.
  // e^2x heißt (wie beim Taschenrechner) e² · x – die Vorschau zeigt es an.
  function exponent() {
    const t = peek();
    if (!t) endedTooEarly();
    if (isSym(t, '-') || isSym(t, '+')) {
      pos++;
      const a = exponent();
      if (t.value === '-' && a === variable) mirroredX++;
      return t.value === '-' ? node(x => -a.f(x), [a], `-${bare(a)}`, 'neg') : a;
    }
    if (startsFactor(t) || isSym(t, '|')) return primary();
    fail('Nach „^“ fehlt der Exponent, z. B. x^2 oder x^(2x+1).');
  }

  // Argument von frac/sqrt im LaTeX-Stil: (Gruppe), {Gruppe} oder ein einzelnes Zeichen
  function argument(command) {
    const t = peek();
    if (!t) endedTooEarly();
    if (isOpen(t)) return group();
    if (t.type === 'num' && t.text.length === 1) { pos++; return constant(t.value, t.text); }
    if (['x', 'var', 'const', 'frac', 'sqrt'].includes(t.type)) return primary();
    const example = command === 'frac' ? 'frac(Zähler;Nenner)' : 'sqrt(x)';
    fail(`Nach ${command} bitte Klammern verwenden: ${example}.`);
  }

  function primary() {
    const t = peek();
    if (!t) endedTooEarly();

    if (t.type === 'num') { pos++; return constant(t.value, t.text.replace(',', '{,}')); }
    if (t.type === 'const') { pos++; return constant(t.value, t.tex); }
    if (t.type === 'x') { pos++; xCount++; return variable; }
    if (t.type === 'var') { pos++; return t.name === 'y' ? odeY : odeP; }
    if (isOpen(t)) return group();

    if (isSym(t, '|')) {
      pos++;
      const a = expression();
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
      if (isSym(peek(), '_')) fail(`„${t.name}“ hat keinen Index „_“.`);
      if (isSym(peek(), '^')) { pos++; exp = exponent(); }   // sin^2(x)

      // Argument: in Klammern, z. B. sin(x) – oder ohne Klammern, z. B. sin x oder sin 2x
      let arg;
      const n = peek();
      if (isOpen(n) || isSym(n, '|')) {
        arg = primary();
      } else if (startsFactor(n) && n.type !== 'func') {
        arg = power();
        while (startsFactor(peek()) && peek().type !== 'func') arg = multiply(arg, power(), false);
      } else {
        fail(`Nach „${t.name}“ fehlt das Argument, z. B. ${t.name}(x).`);
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

    if (isSym(t, ';')) fail('„;“ trennt nur Zähler und Nenner: frac(Zähler;Nenner).');
    fail(`„${describe(t)}“ steht an einer unerwarteten Stelle.`);
  }

  const root = expression();
  if (pos < tokens.length) {
    const t = peek();
    if (isSym(t, ')') || isSym(t, '}') || isSym(t, ']')) fail(`Zu viele schließende Klammern „${t.value}“.`);
    if (isSym(t, ';')) fail('„;“ trennt nur Zähler und Nenner: frac(Zähler;Nenner).');
    fail(`„${describe(t)}“ steht an einer unerwarteten Stelle.`);
  }
  // Richtung: Steht vor JEDEM x direkt ein Minus (-x, (-x)/6, sin(-x)), geht der Schuss nach links
  const dir = xCount > 0 && mirroredX === xCount ? -1 : 1;
  return { fn: root.f, types: [...types], tex: root.tex, dir };
}

// Haupteinstieg: Eingabe -> { ok: true, fn, types, tex, dir } oder { ok: false, error }
//   fn  = die Funktion genau wie eingegeben (x zählt vom Spieler aus, siehe Abschnitt 4)
//   dir = Schussrichtung: +1 nach rechts, −1 nach links (Minus direkt vor jedem x)
//   mode = 'y' (Funktion), 'y1' (y′ = f(x, y)) oder 'y2' (y″ = f(x, y, y′))
function compileLatex(input, xTex = 'x', mode = 'y') {
  try {
    const text = stripPrefix(String(input)).trim();
    if (text === '') return { ok: false, error: 'Bitte gib eine Funktion ein, z. B. x/2.' };
    const vars = mode === 'y1' ? ['y'] : mode === 'y2' ? ['y', 'p'] : [];
    const { fn, types, tex, dir } = parseTokens(tokenize(text, vars), xTex);
    fn(1);   // einmal ausprobieren
    return { ok: true, fn, types, tex, dir };
  } catch (err) {
    if (err.isInputError) return { ok: false, error: err.message };
    return { ok: false, error: 'Die Eingabe konnte nicht verarbeitet werden.' };
  }
}

/* ==========================================================
   4. KURVE, WÄNDE & TREFFERERKENNUNG
   ----------------------------------------------------------
   Jeder Spieler hat sein EIGENES Koordinatensystem: Er steht auf dem
   Kreuz P = (px | py) des Spielfelds und ist der Ursprung (0 | 0)
   seines Systems. Seine Funktion f wird wie im Sandkasten mit dem
   x relativ zum Spieler ausgerechnet und so verschoben, dass sie
   durch ihn geht (in Spielfeld-Koordinaten):

       y(x) = py + f(x − px) − f(0)

   x^2 hat seinen Scheitel also immer beim Spieler, egal wo er steht.
   Ein +b am Ende ändert nichts, weil es beim Verschieben wieder
   wegfällt. Ist f(0) nicht definiert (z. B. 1/x), kann nicht
   geschossen werden.

   Wie bei Graphwar fliegt die Kurve durch Gegner hindurch und
   sprengt Löcher in Wände. Anders als bei Graphwar:
     – eigenes Koordinatensystem pro Spieler (siehe oben),
     – Richtung: Der Schuss läuft nach rechts – oder nach links, wenn
       vor jedem x direkt ein Minus steht (-x, (-x)/6, sin(-x); siehe
       parseTokens).
   Eine Reichweiten-Grenze gibt es nicht. Der Schuss endet erst,
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
const WALL_STEP = 0.05;    // Prüfabstand für Wände entlang eines Kurvenstücks
const LINE_WIDTH = 0.15;   // Linienstärke der Kurve in Koordinaten-Einheiten (≈ 5 Pixel)
const MAX_VALUE = 1e4;     // |y| darüber gilt als „unendlich“ (weit außerhalb des Bildes)
const JUMP_LIMIT = 0.5;    // ab diesem y-Unterschied zweier Nachbarpunkte wird auf eine Lücke geprüft
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

// Liegt zwischen zwei Nachbarpunkten ein Sprung (Polstelle)?
// Test: Ist der Wert in der Mitte NICHT zwischen den beiden Werten,
// geht die Kurve dort ins Unendliche (z. B. tan oder frac(1;x-3)).
function isJump(f, u0, u1, y0, y1) {
  if (Math.abs(y1 - y0) < JUMP_LIMIT) return false;
  const mid = safeEval(f, (u0 + u1) / 2);
  if (Number.isNaN(mid)) return true;
  return mid < Math.min(y0, y1) || mid > Math.max(y0, y1);
}

// Länge eines Kurvenstücks, soweit es im Spielfeld liegt
function visibleLength(a, b) {
  const clampY = y => Math.max(VIEW.yMin, Math.min(VIEW.yMax, y));
  return Math.hypot(b.x - a.x, clampY(b.y) - clampY(a.y));
}

// Punkt auf der Strecke a–b beim Anteil t (0 = a, 1 = b)
function lerpPoint(a, b, t) {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), s: 0 };
}

// Läuft die Strecke a–b in eine Wand? Die Strecke wird in kleinen Schritten
// (WALL_STEP) abgetastet – nur der Teil innerhalb des Spielfelds.
// Ergebnis: Anteil t des letzten freien Punktes vor der Wand, oder null.
function wallHit(a, b, grid) {
  if (!grid) return null;
  let t0 = 0;
  let t1 = 1;
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

  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, dy) * (t1 - t0) / WALL_STEP));
  let free = t0;
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * i / n;
    if (isWall(grid, a.x + t * (b.x - a.x), a.y + t * dy)) return free;
    free = t;
  }
  return null;
}

// Profi-Modi wie bei Graphwar: löst y′ = f(x, y) bzw. y″ = f(x, y, y′) Schritt für
// Schritt (Runge-Kutta 4. Ordnung). Start im Spieler (x = 0, y = 0), bei y″ mit der
// Startsteigung shape.slope. Ergebnis: Funktion, die bis zum nächsten x (relativ zum
// Spieler) weiterrechnet und die Höhe y liefert (NaN = nicht mehr definiert).
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

// Berechnet den Schuss: y = py + f(x − px) − f(0), vom Spieler aus in Richtung dir
// (+1 rechts, −1 links), bis er endet (siehe oben). limit = höchste Kurvenlänge –
// nur für Probeschüsse (lineCanHit), ein echter Schuss hat keine Grenze.
// f ist eine Funktion – oder in den Profi-Modi { order, fn, slope } (Differentialgleichung).
// Ergebnis: { points, length, end, endReason, blocked }
function buildArm(f, player, dir, grid, limit = Infinity) {
  const shape = typeof f === 'function' ? null : f;
  const f0 = shape ? 0 : safeEval(f, 0);
  const points = [];
  let length = 0;
  let endReason = 'edge';
  if (Number.isNaN(f0)) return { points, length, end: null, endReason: 'undefined', blocked: false };

  const distance = dir > 0 ? VIEW.xMax - player.x : player.x - VIEW.xMin;
  const steps = Math.ceil(distance / STEP);
  const g = shape ? null : x => player.y + f(x - player.x) - f0;   // y-Wert im Spielfeld (x relativ zum Spieler)
  const step = shape ? odeStepper(shape) : null;
  let prevX = player.x;
  let prevY = player.y;

  for (let i = 0; i <= steps; i++) {
    const x = player.x + dir * Math.min(i * STEP, distance);
    const y = i === 0 ? player.y : step ? player.y + step(x - player.x) : safeEval(g, x);
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
    points, length, endReason,
    get drawPoints() { return this._draw || (this._draw = thinPoints(points)); },   // erst beim Zeichnen berechnet
    end: points[points.length - 1] || null,
    blocked: endReason === 'wall',
  };
}

// Berechnet den ganzen Schuss. Ergebnis: { arms: [arm], f0, dir } oder { error }
// (arms ist eine Liste, damit Zeichnen und Treffererkennung allgemein bleiben)
function buildCurve(f, player, grid = null, dir = 1) {
  const shape = typeof f === 'function' ? null : f;
  if (shape) {
    odeVars.y = 0;
    odeVars.p = shape.slope || 0;
    if (!Number.isFinite(shape.fn(0))) {
      return { error: 'Deine Gleichung ist bei dir (x = 0, y = 0) nicht definiert – so kann nicht geschossen werden.' };
    }
    const arm = buildArm(f, player, dir, grid);
    if (arm.points.length < 2) return { error: 'Die Gleichung ist direkt neben dir nicht lösbar – der Schuss käme nicht vom Fleck.' };
    return { arms: [arm], f0: 0, dir, ode: true };
  }
  const f0 = safeEval(f, 0);
  if (Number.isNaN(f0)) {
    const raw = f(0);
    if (Number.isFinite(raw)) {
      return { error: `Deine Funktion ist bei dir (x = 0) viel zu groß (${raw.toExponential(1)}) – so weit kann kein Schuss verschoben werden.` };
    }
    return { error: 'Deine Funktion ist bei dir (x = 0) nicht definiert – so kann nicht geschossen werden. ' +
      'Beispiel: 1/x hat bei x = 0 eine Lücke – nimm z. B. 1/(x+1).' };
  }
  const arm = buildArm(f, player, dir, grid);
  if (arm.points.length < 2) {
    return { error: 'Deine Funktion ist direkt neben dir nicht definiert – der Schuss käme nicht vom Fleck.' };
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

// Sucht ein freies Kreuz für den Spieler (mit Abstand zum Rand). Sein
// 2×2-Block und der Ring drumherum müssen leer sein.
function findPlayerCross(grid, avoid = null) {
  for (let tries = 0; tries < 500; tries++) {
    const c = randomInt(3, COLS - 3);
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

// Spiegelt eine Eingabe nach links: Jedes x wird zu (-x) – das Minus direkt
// vor x dreht die Richtung um. Der Buchstabe x darf nur als Variable vorkommen.
function mirrorX(input) {
  return input.replace(/x/g, '(-x)').replace(/\(\(-x\)\)/g, '(-x)');
}

// Schussrichtung für die Generierung: Steht der Spieler rechts der Mitte, wird
// meist nach links geschossen (dort ist mehr Platz).
function maybeMirror(input, player) {
  const left = Math.random() < (player.x > 0 ? 0.8 : 0.2);
  return left ? mirrorX(input) : input;
}

// Spielt die Lösung einer Karte durch: Sind danach alle Gegner zerstört?
function isSolvable(map) {
  const { player, enemies } = readMap(map.grid);
  if (!player || map.solution.length > map.shots) return false;
  for (const input of map.solution) {
    const result = compileLatex(input);
    if (!result.ok) return false;
    const curve = buildCurve(result.fn, player, map.grid, result.dir);
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
        const input = maybeMirror(SHAPES[shape](), player);
        const result = compileLatex(input);
        const curve = buildCurve(result.fn, player, null, result.dir);
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

// Füllt die Level-Karte rechts (Titel, Aufgabe, Tipp, Knöpfe)
function showCard({ num, name, task, hint = null }) {
  ui.levelNum.textContent = num;
  ui.levelName.textContent = name;
  ui.levelTask.textContent = task;
  ui.hintBox.hidden = hint === null;
  ui.hintBox.open = false;
  ui.levelHint.textContent = hint || '';
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
  const num = state.daily ? `TAGES-HERAUSFORDERUNG · ${state.daily}` : `LEVEL ${index + 1} / ${LEVELS.length}`;
  showCard({ num, name: level.name, task: level.task, hint: level.hint });
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
  showCard({
    num: 'LEVEL-EDITOR', name: 'Eigene Karte bauen',
    task: 'Werkzeug wählen, dann ins Feld klicken oder ziehen. Es braucht einen Spieler und mindestens einen Gegner. „Testen“ spielt die Karte, den Code kannst du teilen.',
  });
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
  if (!player) { ui.editorError.textContent = 'Setz zuerst den Spieler (Werkzeug „Spieler“).'; return; }
  if (!enemies.length) { ui.editorError.textContent = 'Setz mindestens einen Gegner.'; return; }
  startCustom(encodeMap(state.map.grid, editor.shots));
}

// Eigene Karte spielen (aus dem Editor oder per Code)
function startCustom(code) {
  const map = decodeMap(code);
  if (!map || !readMap(map.grid).player) { showMessage('Dieser Karten-Code ist ungültig.', 'error'); return false; }
  applyMap({ grid: map.grid, shots: map.shots, solution: [], code });
  state.mode = 'custom';
  state.shotsLeft = map.shots;
  resetRound();
  showCard({ num: 'EIGENE KARTE', name: 'Karte aus dem Editor', task: `Zerstöre alle Gegner mit höchstens ${map.shots} Angriffen.` });
  updateLevelWarning();
  updateHUD();
  buildLevelSelect();
  return true;
}

// Editor: Kästchen unter der Maus hervorheben (beim Spieler-Werkzeug das Kreuz)
function drawEditorHover() {
  const m = state.mouse;
  if (!m || !cellAt(m.x, m.y)) return;
  ctx.save();
  ctx.strokeStyle = COLORS.curve;
  ctx.lineWidth = 3;
  if (editor.tool === 'player') {
    const X = toCanvasX(Math.round(m.x));
    const Y = toCanvasY(Math.round(m.y));
    ctx.strokeRect(X - UNIT, Y - UNIT, UNIT * 2, UNIT * 2);
  } else {
    const cell = cellAt(m.x, m.y);
    const corner = crossPoint(cell.c, cell.r);
    ctx.strokeRect(toCanvasX(corner.x), toCanvasY(corner.y), UNIT, UNIT);
  }
  ctx.restore();
}

function startEndless() {
  state.mode = 'endless';
  applyMap(generateEndlessMap(settings.endlessWalls));
  state.score = 0;
  resetRound();
  showCard({
    num: 'ENDLOS-MODUS',
    name: 'Endlos',
    task: `Unbegrenzte Angriffe, immer neue Gegner. Alle ${ENDLESS_MOVE_EVERY} Schüsse ziehst du an eine neue Stelle um. ` +
      'Jeder zerstörte Gegner bringt 1 Punkt – versuche, mit einem Schuss möglichst viele zu treffen!',
  });
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
  showCard({
    num: 'SANDKASTEN',
    name: 'Funktionen testen',
    task: `Du stehst genau in der Mitte bei (0 | 0) – ohne Gegner und Wände, mit unbegrenzt vielen Schüssen. ` +
      `Die letzten ${SANDBOX_TRAILS} Kurven bleiben stehen, so kannst du sie vergleichen. ` +
      'Klicke ins Feld, um ein Übungsziel zu setzen – nochmal klicken gibt ihm mehr Leben (bis 3), danach verschwindet es. ↻ Neustart räumt alles ab.',
  });
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
  ui.tutorialNext.textContent = isLast ? "Los geht's – Level 1 ▶" : 'Weiter ▶';
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
    if (!confirm('Multiplayer verlassen? Du verlässt damit auch die Lobby.')) return;
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
const MODE_PLACEHOLDER = { y: 'z. B. x/2', y1: 'z. B. -y/4 + 1', y2: 'z. B. -y/9' };

// Eingabe → Schuss. Im Modus y = … ist es eine Funktion, in den Profi-Modi y′ = … und
// y″ = … eine Differentialgleichung; Richtung und (bei y″) Startwinkel stehen daneben.
function compileShot(text) {
  const mode = state.inputMode;
  if (mode !== 'y' && state.mode === 'multi' && mp.lobby && mp.lobby.settings.odeModes === false) {
    return { ok: false, error: 'Die Profi-Modi y′ und y″ sind in dieser Lobby ausgeschaltet.' };
  }
  const result = compileLatex(text, 'x', mode);
  if (!result.ok || mode === 'y') return { ...result, shape: result.fn };
  const dir = Number(ui.odeDir.value) < 0 ? -1 : 1;
  const angle = Math.max(-85, Math.min(85, parseFloat(String(ui.odeAngle.value).replace(',', '.')) || 0));
  const slope = mode === 'y2' ? dir * Math.tan(angle * Math.PI / 180) : 0;
  return { ...result, dir, shape: { order: mode === 'y1' ? 1 : 2, fn: result.fn, slope } };
}

function setInputMode(mode) {
  state.inputMode = MODE_LABEL[mode] ? mode : 'y';
  ui.fxMode.value = state.inputMode;
  ui.odeControls.hidden = state.inputMode === 'y';
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

function fire() {
  if (state.mode === 'multi') { mpFire(); return; }
  if (state.status !== 'playing' || state.shot || (limitedShots() && state.shotsLeft <= 0)) return;

  const result = compileShot(ui.input.value);
  if (!result.ok) { showMessage(result.error, 'error'); return; }
  const blocked = blockedTypes(result.types);
  if (blocked.length) {
    showMessage(`In den Einstellungen deaktiviert: ${typeNames(blocked)}.`, 'error');
    return;
  }

  const curve = buildCurve(result.shape, state.player, state.map.grid, result.dir);
  if (curve.error) { showMessage(curve.error, 'error'); return; }

  if (limitedShots()) state.shotsLeft--;
  rememberInput(ui.input.value);
  state.shot = {
    arms: curve.arms,
    hits: findHits(curve.arms, state.enemies),
    progress: 0,      // bisher gezeichnete Kurvenlänge pro Arm
    nextHit: 0,
    kills: 0,
    info: originInfo(curve) + ' ' + lengthInfo(curve.arms),
  };
  spawnParticles(toCanvasX(state.player.x), toCanvasY(state.player.y), 14, ['#fff3a8', COLORS.curve, '#ffffff'], 220);
  showMessage('Schuss! ' + state.shot.info);
  updateHUD();
}

// Erklärt die Verschiebung durch den Spieler: y = f(x) − f(0) in seinem Koordinatensystem
function originInfo(curve) {
  if (curve.ode) return `Schuss nach ${curve.dir > 0 ? 'rechts' : 'links'}: Differentialgleichung, startet in dir.`;
  const shift = Math.abs(curve.f0) < 1e-9 ? 'die Kurve geht schon durch dich'
    : `f(0) = ${formatNumber(curve.f0)}, die Kurve wurde so verschoben, dass sie durch dich geht`;
  return `Schuss nach ${curve.dir > 0 ? 'rechts' : 'links'}: ${shift}.`;
}

// Warum ein Schuss endet (siehe buildArm)
const END_REASONS = {
  wall: 'Wand getroffen', out: 'aus dem Feld geflogen', edge: 'Rand erreicht',
  undefined: 'Funktion nicht mehr definiert', jump: 'Sprungstelle',
};

// Zeigt, wie lang der Schuss geworden ist und warum er endet
function lengthInfo(arms) {
  const reason = arms[0].endReason;
  const hole = reason === 'wall' && wallsBreakable() ? ', Loch gesprengt' : '';
  return `Kurvenlänge ${formatNumber(arms[0].length, 1)} (${END_REASONS[reason]}${hole}).`;
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
    showMessage((n ? `Treffer! ${n} Ziel${n === 1 ? '' : 'e'} getroffen. ` : '') + shot.info, n ? 'good' : '');
    updateHUD();
    return;
  }
  if (n === 0) showMessage('Daneben! Kein Gegner getroffen. ' + shot.info);
  else showMessage(`Treffer! ${n} Gegner getroffen. ${shot.info}`, 'good');

  if (state.mode === 'tutorial') {
    state.shotsFired++;
    if (aliveEnemies().length === 0) {
      state.status = 'won';
      ui.tutorialNext.disabled = false;
      showMessage('Super, geschafft! Klicke rechts auf „Weiter“.', 'good');
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
  if (shot.hits.length === 0) text = 'Daneben! Kein Gegner getroffen.';
  else if (kills === 0) text = `Treffer! ${shot.hits.length} Gegner beschädigt, aber keiner zerstört.`;
  else text = `${kills} Gegner zerstört (+${kills} Punkte).` + (kills >= 2 ? ` KOMBO ×${kills}!` : '');

  state.enemies = aliveEnemies();
  if (state.shotsFired % ENDLESS_MOVE_EVERY === 0) {
    relocatePlayer();
    text += ' Umzug! Dein Koordinatensystem zieht mit dir um.';
  }
  spawnEnemies();
  ensureReachable();
  showMessage(text + ' ' + shot.info, kills ? 'good' : '');
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
// Gegner direkt über/unter dem Spieler: sehr steile Gerade (Steigung ±1000).
// Berechnet wird nur der Arm in Richtung des Gegners, bis kurz hinter ihn.
function lineCanHit(enemy) {
  const dx = enemy.x - state.player.x;
  const dy = enemy.y - state.player.y;
  const m = dx === 0 ? Math.sign(dy) * 1000 : dy / dx;
  const arm = buildArm(x => m * x, state.player, dx < 0 ? -1 : 1, state.map.grid, Math.hypot(dx, dy) + 1);   // f(x) = m·x, durch den Spieler verschoben
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
   7. ZEICHNEN
   ========================================================== */

const COLORS = {
  paper: '#fbf7ec',
  grid: '#efe8d6',
  gridStrong: '#ddd1b5',
  ink: '#2b2840',
  label: '#5f5872',
  curve: '#e0218a',
  curveHalo: '#ffffff',
  trail: 'rgba(224, 33, 138, 0.22)',
  player: '#2f6fdb',
  playerDark: '#1b3f8f',
  axes: '#1b3f8f',   // Achsen des Spieler-Koordinatensystems
  // Gegnerfarben nach Lebenspunkten: [Füllung, Umriss, Glanz]
  enemy: {
    1: ['#f6a74b', '#a8571a', '#fcd49a'],
    2: ['#e8573a', '#8f2a18', '#f6a08c'],
    3: ['#9b4dca', '#4f1f72', '#cfa4ea'],
  },
  wall: { light: '#cfcbe0', base: '#9a96b0', mortar: '#716d88', dark: '#4d4a63' },
  hpFull: '#d64545',
  hpEmpty: '#efe6d2',
};

const PIXEL = 3;   // Größe eines „Kunst-Pixels“ in Canvas-Pixeln

let canvas, ctx;
let renderScale = 1;
const spriteCache = new Map();

function enemyColors(enemy) {
  return COLORS.enemy[Math.min(enemy.maxHp, 3)];
}

// Erzeugt ein kleines Bild aus einer Zeichen-Vorlage (1 Zeichen = 1 Kunst-Pixel)
function spriteFromRows(key, rows, palette) {
  if (spriteCache.has(key)) return spriteCache.get(key);
  const sprite = document.createElement('canvas');
  sprite.width = rows[0].length;
  sprite.height = rows.length;
  const g = sprite.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (palette[ch]) { g.fillStyle = palette[ch]; g.fillRect(x, y, 1, 1); }
  }));
  spriteCache.set(key, sprite);
  return sprite;
}

// Pixel-Art-Kreis mit Augen als kleines Bild (1 Bildpunkt = 1 Kunst-Pixel).
// Wird später mit PIXEL-facher Größe ohne Glättung gezeichnet.
function enemySprite(cells, colors, flash) {
  const key = `${cells}|${colors[0]}|${flash}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const size = cells * 2;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i + 0.5 - cells;
      const dy = j + 0.5 - cells;
      const d = Math.hypot(dx, dy);
      if (d > cells) continue;
      let color = flash ? '#ffffff' : colors[0];
      if (d > cells - 1.2) color = colors[1];                                     // Umriss
      else if (!flash && dx + dy < -cells * 0.75 && d < cells * 0.8) color = colors[2];  // Glanzlicht
      g.fillStyle = color;
      g.fillRect(i, j, 1, 1);
    }
  }

  // Augen
  const eye = Math.max(1, Math.round(cells / 5));
  const eyeY = cells - Math.round(cells * 0.3);
  const eyeX = Math.round(cells * 0.42);
  g.fillStyle = COLORS.ink;
  g.fillRect(cells - eyeX, eyeY, eye, eye + 1);
  g.fillRect(cells + eyeX - eye, eyeY, eye, eye + 1);

  spriteCache.set(key, sprite);
  return sprite;
}

// Spielerfigur ('#' = Körper, 'o' = Auge, 'd' = dunkel)
const PLAYER_SPRITE = [
  '..dddd..',
  '.d####d.',
  'd##o#o#d',
  'd######d',
  'd######d',
  '.d####d.',
  '..d..d..',
];

// Wandblock: 12 × 12 Kunst-Pixel = genau ein Kästchen
// ('h' = Licht, 'b' = Stein, 'm' = Fuge, 'd' = Schatten)
const WALL_SPRITE = [
  'hhhhhhhhhhhd',
  'hbbbbmbbbbbd',
  'hbbbbmbbbbbd',
  'hbbbbmbbbbbd',
  'mmmmmmmmmmmd',
  'hbbmbbbbbmbd',
  'hbbmbbbbbmbd',
  'hbbmbbbbbmbd',
  'mmmmmmmmmmmd',
  'hbbbbbmbbbbd',
  'hbbbbbmbbbbd',
  'dddddddddddd',
];

// Raster, Wände, Achsen und die Spuren alter Schüsse ändern sich selten – sie werden
// in ein eigenes Bild vorgezeichnet und nur neu gemalt, wenn sich etwas davon ändert
// (Position, Wände, Größe, Farbe, Spuren). Die Achsen liegen über den Wänden, damit
// die Zahlen lesbar bleiben.
let background = null;   // { canvas, key }

function drawTrails() {
  if (state.mode === 'multi') { mpDrawTrails(); return; }
  for (const trail of state.trails) {
    for (const arm of trail.arms) strokeCurve(arm.drawPoints || arm.points, Infinity, COLORS.trail, 3);
  }
}

function drawBackground() {
  const axesColor = state.mode === 'multi' ? mpAxesColor() : COLORS.axes;
  const walls = state.map ? state.map.grid.map(row => row.join('')).join('') : '';
  const trails = state.mode === 'multi' ? mpTrailKey() : state.trails.map(t => t.id).join(',');
  const key = [canvas.width, canvas.height, state.player.x, state.player.y, axesColor, walls, trails].join('|');
  if (!background || background.key !== key) {
    const layer = background ? background.canvas : document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const main = ctx;
    ctx = layer.getContext('2d');
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawGrid();
    drawWalls();
    drawPlayerAxes(axesColor);
    drawTrails();
    ctx = main;
    background = { canvas: layer, key };
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(background.canvas, 0, 0);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
}

function draw() {
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
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

function drawGrid() {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Rasterlinien bei jeder ganzen Zahl, kräftiger bei Vielfachen von 5 –
  // gezählt vom Spieler aus, denn er ist der Ursprung seines Koordinatensystems
  const P = state.player;
  ctx.lineWidth = 1;
  for (let x = VIEW.xMin; x <= VIEW.xMax; x++) {
    ctx.strokeStyle = (x - P.x) % 5 === 0 ? COLORS.gridStrong : COLORS.grid;
    line(toCanvasX(x) + 0.5, 0, toCanvasX(x) + 0.5, HEIGHT);
  }
  for (let y = VIEW.yMin; y <= VIEW.yMax; y++) {
    ctx.strokeStyle = (y - P.y) % 5 === 0 ? COLORS.gridStrong : COLORS.grid;
    line(0, toCanvasY(y) + 0.5, WIDTH, toCanvasY(y) + 0.5);
  }
}

// Eigenes Koordinatensystem des Spielers: Er ist immer der Ursprung (0 | 0),
// alle Zahlen an den Achsen zählen von ihm aus. Achsen mit Pfeilspitzen,
// Striche bei jeder Zahl, Beschriftung bei jeder zweiten. Steht der Spieler
// nah am Rand, kommen die Zahlen auf die andere Seite der Achse.
// color: Achsenfarbe (im Multiplayer die Farbe des Spielers)
function drawPlayerAxes(color = COLORS.axes) {
  const P = state.player;
  const ox = toCanvasX(P.x);
  const oy = toCanvasY(P.y);
  const labelsBelow = oy < HEIGHT - 40;   // Zahlen der x-Achse unter der Achse …
  const labelsLeft = ox > 40;             // … und die der y-Achse links davon
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  line(0, oy, WIDTH - 4, oy);
  line(ox, HEIGHT, ox, 4);
  triangle(WIDTH, oy, WIDTH - 14, oy - 7, WIDTH - 14, oy + 7);
  triangle(ox, 0, ox - 7, 14, ox + 7, 14);

  // Zahlen mit hellem Rand, damit sie auch auf Kurven lesbar bleiben
  ctx.font = '700 15px ui-monospace, Consolas, monospace';
  ctx.lineWidth = 5;
  ctx.strokeStyle = COLORS.paper;
  ctx.fillStyle = COLORS.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = labelsBelow ? 'top' : 'bottom';
  for (let x = VIEW.xMin + 1; x < VIEW.xMax; x++) {
    const n = x - P.x;
    if (n === 0) continue;
    ctx.fillRect(toCanvasX(x) - 1, oy - 4, 2, 8);
    if (n % 2 === 0) label(String(n), toCanvasX(x), labelsBelow ? oy + 8 : oy - 8);
  }
  ctx.textAlign = labelsLeft ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  for (let y = VIEW.yMin + 1; y < VIEW.yMax; y++) {
    const n = y - P.y;
    if (n === 0) continue;
    ctx.fillRect(ox - 4, toCanvasY(y) - 1, 8, 2);
    if (n % 2 === 0) label(String(n), labelsLeft ? ox - 9 : ox + 9, toCanvasY(y));
  }

  // Achsennamen
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillStyle = color;
  ctx.textBaseline = labelsBelow ? 'top' : 'bottom';
  ctx.textAlign = 'right';
  label('x', WIDTH - 10, labelsBelow ? oy + 14 : oy - 14);
  ctx.textBaseline = 'top';
  ctx.textAlign = labelsLeft ? 'left' : 'right';
  label('y', labelsLeft ? ox + 14 : ox - 14, 8);
  ctx.restore();
}

function drawWalls() {
  const sprite = spriteFromRows('wall', WALL_SPRITE, {
    h: COLORS.wall.light, b: COLORS.wall.base, m: COLORS.wall.mortar, d: COLORS.wall.dark,
  });
  state.map.grid.forEach((row, r) => row.forEach((value, c) => {
    if (value !== CELL.WALL) return;
    const corner = crossPoint(c, r);
    ctx.drawImage(sprite, toCanvasX(corner.x), toCanvasY(corner.y), UNIT, UNIT);
  }));
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function triangle(x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.fill();
}

function label(text, x, y) {
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

// Zeichnet einen Arm bis zur Kurvenlänge maxS; bei null wird abgesetzt (Lücke).
// Gibt den letzten gezeichneten Punkt zurück (für die Schuss-Spitze).
function strokeCurve(points, maxS, color, width) {
  ctx.beginPath();
  let penDown = false;
  let tip = null;
  for (const p of points) {
    if (p === null) { penDown = false; continue; }
    if (p.s > maxS) break;
    const X = toCanvasX(p.x);
    const Y = toCanvasY(p.y);
    if (penDown) ctx.lineTo(X, Y);
    else { ctx.moveTo(X, Y); penDown = true; }
    tip = p;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  return tip;
}

function drawShot() {
  const shot = state.shot;
  if (!shot) return;

  for (const arm of shot.arms) {
    strokeCurve(arm.drawPoints, shot.progress, COLORS.curveHalo, LINE_WIDTH * UNIT + 5);
    const tip = strokeCurve(arm.drawPoints, shot.progress, COLORS.curve, LINE_WIDTH * UNIT);

    // leuchtende Spitze, solange der Arm noch wächst
    if (tip && shot.progress < arm.length) {
      const X = Math.round(toCanvasX(tip.x));
      const Y = Math.round(toCanvasY(tip.y));
      ctx.fillStyle = COLORS.curve;
      ctx.fillRect(X - 7, Y - 7, 14, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X - 3, Y - 3, 6, 6);
    }
  }
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const colors = enemyColors(e);
    const cells = Math.max(3, Math.round(e.r * UNIT / PIXEL));
    const sprite = enemySprite(cells, colors, e.flash > 0.5);
    const shake = e.flash > 0 ? Math.round(Math.sin(e.flash * 40) * 4 * e.flash) : 0;
    const cx = toCanvasX(e.x) + shake;
    const cy = toCanvasY(e.y);
    const half = cells * PIXEL;
    ctx.drawImage(sprite, cx - half, cy - half, half * 2, half * 2);

    // Lebenspunkte als Kästchen über dem Gegner
    const box = 9, gap = 3;
    const total = e.maxHp * box + (e.maxHp - 1) * gap;
    for (let i = 0; i < e.maxHp; i++) {
      const x = Math.round(cx - total / 2 + i * (box + gap));
      const y = Math.round(cy - half - box - 4);
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(x, y, box, box);
      ctx.fillStyle = i < e.hp ? COLORS.hpFull : COLORS.hpEmpty;
      ctx.fillRect(x + 2, y + 2, box - 4, box - 4);
    }
  }
}

function drawPlayer() {
  const sprite = spriteFromRows('player', PLAYER_SPRITE, { '#': COLORS.player, 'o': '#ffffff', 'd': COLORS.playerDark });
  const size = 4;
  const w = sprite.width * size;
  const h = sprite.height * size;
  const X = Math.round(toCanvasX(state.player.x));
  const Y = Math.round(toCanvasY(state.player.y));
  ctx.drawImage(sprite, X - w / 2, Y - h / 2, w, h);

  // Richtung, in die der letzte/aktuelle Angriff aus dem Spieler herausging
  const shot = state.shot || state.trails[state.trails.length - 1];
  const S = shot && exitDirection(shot.arms);
  const P = state.player;
  const upward = S && S.y - P.y > Math.abs(S.x - P.x);   // Strahl geht nach oben -> Schild nach unten

  // Kleines Kreuz genau auf dem Nullpunkt des Spielers
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X - 1, Y - 5, 2, 10);
  ctx.fillRect(X - 5, Y - 1, 10, 2);

  // Schild „DU“ über dem Spieler (unter ihm, wenn der Angriff nach oben herausgeht)
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = upward ? 'top' : 'bottom';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.paper;
  ctx.fillStyle = COLORS.player;
  const name = ui.playerName.value.trim();
  label(name ? `DU · ${name}` : 'DU', X, upward ? Y + h / 2 + 4 : Y - h / 2 - 4);
}

// Erster Punkt eines Arms, der mindestens 0,3 vom Spieler weg ist (Richtung des Austritts)
function exitDirection(arms) {
  const P = state.player;
  for (const arm of arms) {
    const q = arm.points.find(p => p !== null && Math.hypot(p.x - P.x, p.y - P.y) >= 0.3);
    if (q) return q;
  }
  return null;
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// Koordinaten unter der Maus – im Koordinatensystem des Spielers
function drawMouseInfo() {
  const m = state.mouse;
  if (!m) return;
  const rel = (x, y, digits) => `${formatNumber(x - state.player.x, digits)} | ${formatNumber(y - state.player.y, digits)}`;
  let text = `x = ${formatNumber(m.x - state.player.x, 1)}   y = ${formatNumber(m.y - state.player.y, 1)}   (dein Koordinatensystem)`;
  const enemy = aliveEnemies().find(e => Math.hypot(e.x - m.x, e.y - m.y) <= e.r);
  const playerText = state.mode === 'multi' ? mpHoverText(m) : null;
  if (playerText) {
    text = playerText;
  } else if (enemy) {
    text = `Gegner bei (${rel(enemy.x, enemy.y, 2)})  ·  LP ${enemy.hp}/${enemy.maxHp}`;
  } else if (isWall(state.map.grid, m.x, m.y)) {
    text = wallsBreakable() ? 'Wand – hier stoppt die Kurve und sprengt ein Loch' : 'Wand (unzerstörbar) – hier stoppt die Kurve';
  }
  ctx.font = '600 15px ui-monospace, Consolas, monospace';
  const w = ctx.measureText(text).width + 20;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(WIDTH - w - 14, 12, w + 4, 34);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(WIDTH - w - 16, 10, w, 30);
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, WIDTH - w - 6, 26);
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
  ui.enemyCount.textContent = state.mode === 'endless' || state.mode === 'sandbox' ? aliveEnemies().length : `${aliveEnemies().length} / ${state.enemies.length}`;
  ui.scoreItem.hidden = state.mode !== 'endless';

  let pips = 0, filled = 0;
  if (limited) {
    ui.shotLabel.textContent = 'Angriffe';
    ui.shotCount.textContent = `${state.shotsLeft} / ${state.map.shots}`;
    ui.shotSub.textContent = '';
    pips = state.map.shots;
    filled = state.shotsLeft;
  } else {
    ui.shotLabel.textContent = 'Schüsse';
    ui.shotCount.textContent = state.shotsFired;
    ui.shotSub.textContent = 'unbegrenzt';
  }
  if (state.mode === 'endless') {
    const untilMove = ENDLESS_MOVE_EVERY - (state.shotsFired % ENDLESS_MOVE_EVERY);
    ui.shotSub.textContent = `Umzug in ${untilMove}`;
    pips = ENDLESS_MOVE_EVERY;
    filled = untilMove;
    ui.score.textContent = state.score;
    ui.bestCombo.textContent = `Beste Kombo: ${state.bestCombo}`;
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
    const span = document.createElement('span');
    span.className = 'sym';
    span.textContent = symbol;
    btn.append(span, ' ', label);
    btn.addEventListener('click', onClick);
    return btn;
  };
  const levelLabel = state.mode === 'levels' ? (state.daily ? 'TAGES-LEVEL' : `LEVEL ${state.levelIndex + 1}`)
    : state.mode === 'editor' || state.mode === 'custom' ? 'EDITOR' : 'LEVEL';
  ui.levelSelect.replaceChildren(
    tab('TUTORIAL', '?', state.mode === 'tutorial', 'Spielerklärung Schritt für Schritt', () => switchMode(() => startTutorial(0))),
    tab(levelLabel, '▦', ['levels', 'editor', 'custom'].includes(state.mode), 'Level, Tages-Herausforderung, Editor, Karten-Code', openLevelDialog),
    tab('ENDLOS', '∞', state.mode === 'endless', 'Unbegrenzt spielen, Gegner tauchen immer wieder auf', () => switchMode(startEndless)),
    tab('SANDKASTEN', '□', state.mode === 'sandbox', 'Funktionen frei ausprobieren', () => switchMode(startSandbox)),
    tab('MULTIPLAYER', '👥', state.mode === 'multi', 'Live mit anderen spielen (Lobby mit Code)', mpOpenDialog),
    tab('INFO', 'ⓘ', false, 'So gibst du Funktionen ein', () => ui.infoDialog.showModal()),
  );
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
    name.textContent = i <= state.unlocked ? level.name : 'gesperrt';
    btn.append(num, name);
    btn.addEventListener('click', () => {
      ui.levelDialog.close();
      switchMode(() => loadLevel(i));
    });
    return btn;
  }));
  const best = loadValue(STORAGE_KEY + '.daily.' + todayString(), null);
  ui.dailyBest.textContent = best === null ? '' : `Dein Bestwert heute: ${best} Angriffe`;
  ui.codeError.textContent = '';
  ui.levelDialog.showModal();
}

function showOverlay(kind) {
  const box = ui.overlay.querySelector('.overlay-box');
  box.className = 'overlay-box ' + kind;
  const isLast = state.levelIndex === LEVELS.length - 1;
  ui.overlayRetry.hidden = ui.overlayNewmap.hidden = false;
  ui.overlayLobby.hidden = true;

  ui.overlayNext.textContent = 'Weiter ▶';
  ui.overlayNewmap.hidden = state.mode === 'custom';
  if (kind === 'won') {
    const used = state.map.shots - state.shotsLeft;
    ui.overlayTitle.textContent = state.mode === 'custom' ? 'KARTE GESCHAFFT!' : state.daily ? 'TAGES-HERAUSFORDERUNG GESCHAFFT!'
      : isLast ? 'ALLE LEVEL GESCHAFFT!' : 'LEVEL GESCHAFFT!';
    ui.overlayText.textContent = `Alle Gegner besiegt – mit ${used} von ${state.map.shots} Angriffen.` +
      (state.daily ? ` Dein Bestwert heute: ${loadValue(STORAGE_KEY + '.daily.' + state.daily, used)} Angriffe.` : '') +
      (state.mode === 'levels' && !state.daily && isLast ? ' Probier jetzt den Endlos-Modus! 🏆' : '');
    ui.overlayNext.hidden = state.mode === 'levels' && (isLast || !!state.daily);
  } else {
    const alive = aliveEnemies().length;
    const solutions = [...new Set(state.map.solution)];
    ui.overlayTitle.textContent = 'KEINE ANGRIFFE MEHR';
    ui.overlayText.textContent = `Es ${alive === 1 ? 'ist noch 1 Gegner' : `sind noch ${alive} Gegner`} übrig. ` +
      (solutions.length ? `Eine mögliche Lösung: ${solutions.map(s => `${s}  \\(${compileLatex(s).tex}\\)`).join(' und ')}` : '');
    ui.overlayNext.hidden = state.mode !== 'custom';
    typeset(ui.overlayText);
  }
  if (state.mode === 'custom') ui.overlayNext.textContent = '✎ Zum Editor';
  ui.overlay.hidden = false;
  (ui.overlayNext.hidden ? ui.overlayRetry : ui.overlayNext).focus();
}

// Warnt, wenn die Lösung der aktuellen Karte abgeschaltete Funktionstypen braucht
function updateLevelWarning() {
  const used = new Set(state.map.solution.flatMap(s => compileLatex(s).types || []));
  const blocked = blockedTypes([...used]);
  ui.levelWarning.hidden = blocked.length === 0;
  ui.levelWarning.textContent = `⚠ Diese Karte ist für ${typeNames(blocked)} gedacht – das ist in den Einstellungen deaktiviert.`;
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
  ui.wallsToggle.textContent = `🧱 Wände: ${settings.endlessWalls ? 'AN' : 'AUS'}`;
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

  let status = '';
  let kind = '';
  if (text !== '' && !result.ok) { status = '✗ ' + result.error; kind = 'error'; }
  else if (blocked.length) { status = `✗ In den Einstellungen deaktiviert: ${typeNames(blocked)}`; kind = 'error'; }
  else if (text !== '') {
    const check = functionTips(result);
    if (check.error) { status = '✗ ' + check.error; kind = 'error'; }
    else { status = check.tips.join(' '); kind = 'ok'; }
  }
  ui.parseStatus.textContent = status;
  ui.parseStatus.className = 'parse-status ' + (kind === 'ok' && status ? 'tip' : kind);
  ui.preview.className = 'preview ' + kind;

  if (!result.ok || !mathReady) {
    ui.preview.textContent = label + (text === '' ? '…' : result.ok ? result.tex : text);
    return;
  }
  try {
    ui.preview.replaceChildren(MathJax.tex2svg(label + result.tex, { display: true }));
  } catch {
    ui.preview.textContent = label + text;
  }
}

// Prüft den eingetippten Schuss vorab: Fehler (z. B. bei dir nicht definiert)
// oder Hinweise (Richtung, Kurve endet sehr früh).
// Ergebnis: { error } oder { tips: [...] }
function functionTips(result) {
  if (!state.map) return { tips: [] };
  const curve = buildCurve(result.shape, state.player, null, result.dir);
  if (curve.error) return { error: curve.error };
  const tips = [];
  if (curve.ode) tips.push(`${result.dir > 0 ? '→ Schuss nach rechts' : '← Schuss nach links'} (Richtung links neben der Vorschau).`);
  else tips.push(result.dir > 0
    ? '→ Schuss nach rechts (für links: Minus direkt vor x, z. B. (-x)/6).'
    : '← Schuss nach links (Minus direkt vor x).');
  const arm = curve.arms[0];
  const width = Math.abs(arm.end.x - arm.points[0].x);
  if (arm.endReason === 'undefined' && width < 4) {
    tips.push(`Die Funktion ist schon nach ${formatNumber(width, 1)} Einheiten nicht mehr definiert.`);
  }
  return { tips };
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

// Canvas an die verfügbare Fläche anpassen (gestochen scharf, auch auf HiDPI)
function fitCanvas() {
  const box = ui.stage.getBoundingClientRect();
  const s = Math.min((box.width - 20) / WIDTH, (box.height - 20) / HEIGHT);   // Platz für Rahmen + Schatten
  const cssW = Math.max(200, Math.floor(WIDTH * s));
  const cssH = Math.floor(cssW * HEIGHT / WIDTH);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  renderScale = canvas.width / WIDTH;
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
    odeDir: $('ode-dir'),
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
    shotLabel: $('shot-label'),
    shotCount: $('shot-count'),
    shotSub: $('shot-sub'),
    shotPips: $('shot-pips'),
    scoreItem: $('score-item'),
    score: $('score'),
    bestCombo: $('best-combo'),
    levelCard: $('level-card'),
    levelNum: $('level-num'),
    levelName: $('level-name'),
    levelTask: $('level-task'),
    levelHint: $('level-hint'),
    levelWarning: $('level-warning'),
    hintBox: $('hint-box'),
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
  ui.odeDir.addEventListener('change', updatePreview);
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
    else ui.codeError.textContent = 'Diesen Code kenne ich nicht. Level-Codes sehen so aus: L3-1A2B3C, eigene Karten beginnen mit K1-.';
  };
  $('code-load').addEventListener('click', loadCode);
  $('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadCode(); } });
  $('map-code-copy').addEventListener('click', () => copyText(mapCodeText()).then(() => showMessage('Karten-Code kopiert.', 'good')));
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
  $('editor-copy').addEventListener('click', () => copyText(encodeMap(state.map.grid, editor.shots)).then(() => showMessage('Karten-Code kopiert – zum Teilen einfügen.', 'good')));
  $('editor-clear').addEventListener('click', () => {
    if (!confirm('Ganze Karte leeren?')) return;
    saveValue(EDITOR_KEY, '');
    startEditor('K1-5-a1500');
  });
  $('editor-load').addEventListener('click', () => {
    const code = $('editor-code').value.trim();
    if (decodeMap(code)) startEditor(code);
    else ui.editorError.textContent = 'Das ist kein gültiger Karten-Code (er beginnt mit K1-).';
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

  // Ist die Pixel-Schrift nachgeladen, den vorgezeichneten Hintergrund neu malen
  if (document.fonts) document.fonts.ready.then(() => { background = null; });
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
