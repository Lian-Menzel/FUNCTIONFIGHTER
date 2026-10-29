# Function Fighter – Alle Funktionen

Diese Datei listet alles, was du unten ins Eingabefeld schreiben kannst. Wie bei
[Graphwar](https://graphwar.com/) ist das ein ganz normales Textfeld: Du tippst die Formel
wie beim Taschenrechner, z. B. `x^2/3`. Daneben siehst du sofort die Formel so, wie das
Spiel sie verstanden hat. Jede Funktion (außer linearen) lässt sich in den
**⚙ Einstellungen** einzeln an- und ausschalten.

Fertige Standardfunktionen mit Parametern zum Kopieren, Anpassen und Feuern gibt es im Spiel
unter dem Diagramm-Knopf links neben der Eingabe (im Tutorial, im Sandkasten und im Multiplayer, wenn der Host es erlaubt).

## Grundregeln

| Was | So schreibst du es | Beispiel |
|---|---|---|
| Variable | nur `x` | `2x+1` |
| Plus, Minus | `+`, `-` | `x-3` |
| Mal | `*` oder einfach weglassen | `2x`, `3sin(x)`, `(x+1)(x-1)` |
| Geteilt | `/` | `x/2`, `x^2/4`, `(x+1)/3`, `1/(x-2)` |
| Potenz | `^` – längere Exponenten in **runden Klammern** | `x^2`, `x^12`, `e^-x`, `x^(2x+1)` |
| Klammern | immer **runde Klammern** `( )` | `(x+1)^2`, `sin(2x)` |
| Dezimalzahlen | Punkt oder Komma | `0.5x`, `0,5x` |
| Präfix | `f(x)=` oder `y=` darf davor stehen | `y=x^2` |

- **Rangfolge wie beim Taschenrechner:** erst `^`, dann Mal und Geteilt, dann Plus und
  Minus. `x^2/3` ist also x²/3, und `1/x+1` ist 1/x + 1. Für 1/(x+1) brauchst du Klammern.
- **Exponenten:** Zum Exponenten gehört ein Vorzeichen und **ein** Baustein, also eine Zahl,
  `x`, eine Funktion oder eine Klammer. `e^2x` heißt deshalb e² · x. Für e^(2x) brauchst du
  Klammern. Die Vorschau zeigt dir immer, wie es gemeint ist.
- **Potenztürme** werden wie in der Mathematik von rechts gerechnet: `x^2^3` = x^(2³) = x⁸,
  `e^-x^2` = e^(−x²) (Glockenkurve). Für (x²)³ schreib `(x^2)^3`.
- **Zusätzlich erlaubt:** `frac(Zähler;Nenner)` und echtes LaTeX wie `\frac{1}{2}`,
  `\sqrt{x}` oder `x^{2x+1}`. `{ }` und `( )` bedeuten dasselbe, der Backslash ist optional.

## Konstanten

| Eingabe | Wert |
|---|---|
| `e` | Eulersche Zahl ≈ 2,71828 |
| `pi` | Kreiszahl π ≈ 3,14159 |

## Alle Funktionen

Das Argument steht in Klammern, bei einfachen Argumenten dürfen sie auch fehlen:
`sin x`, `sin 2x`. Potenzen von Funktionen schreibst du so: `sin^2(x)`. `sin^-1(x)` gibt es
nicht – das bedeutet in der Mathematik arcsin(x). Für 1/sin(x) schreib `1/sin(x)`.

### Grundlagen

| Funktion | Eingabe | Definiert für | Einstellung |
|---|---|---|---|
| Lineare Funktion | `2x+1`, `x/3`, `x/3-2` | alle x | **immer erlaubt** |
| Potenzen & Polynome | `x^2`, `x^3-2x`, `x(x+1)` | alle x | Potenzen & Polynome |
| Bruchfunktion (x im Nenner) | `1/(x+1)`, `2/(x-5)` | Nenner ≠ 0 | Bruchfunktionen |
| Betrag | `abs(x)`, `|x-3|`, `2|x|` | alle x | Betrag |

`x/2` (x nur im Zähler) gilt als **linear**, `x^2/10` als **Potenz**.

### Wurzeln

| Funktion | Eingabe | Definiert für | Einstellung |
|---|---|---|---|
| Quadratwurzel | `sqrt(x)`, `sqrt(3x)` | Inhalt ≥ 0 | Quadratwurzel |
| n-te Wurzel | `sqrt[3](x)` | ungerade n: alle x · gerade n: x ≥ 0 | n-te Wurzel |

### Exponentialfunktion

| Funktion | Eingabe | Definiert für | Einstellung |
|---|---|---|---|
| Exponentialfunktion | `e^x`, `e^(x/4)`, `2^x`, `exp(x)` | alle x | Exponentialfunktion |

Jede Potenz mit **x im Exponenten** zählt als Exponentialfunktion.

### Trigonometrie (Winkel im Bogenmaß)

| Funktion | Eingabe | Definiert für | Einstellung |
|---|---|---|---|
| Sinus | `sin(x)`, `sin(4x)`, `sin(x/2)` | alle x | sin |
| Kosinus | `cos(x)`, `cos(4x)`, `cos(x/2)` | alle x | cos |
| Tangens | `tan(x)` | x ≠ π/2 + kπ | tan |
| Kotangens | `cot(x)` | x ≠ kπ | cot |

**sin und cos schwingen höchstens so schnell wie `sin(4x)`:** Die Zahl vor x darf höchstens
4 sein. `sin(4x)`, `cos(2x+1)` und `sin(x/3)` gehen, `sin(5x)` oder `cos(2pi x)` (≈ 6,28)
nicht. Allgemein gilt: Das Argument darf sich auf 1 Einheit um höchstens 4 ändern – deshalb
geht auch `sin(x^2)` nicht, weil es weiter draußen immer schneller schwingt.

### Hyperbelfunktionen

| Funktion | Eingabe | Definiert für | Einstellung |
|---|---|---|---|
| Sinus hyperbolicus | `sinh(x)` | alle x | sinh |
| Kosinus hyperbolicus | `cosh(x)` | alle x | cosh |
| Tangens hyperbolicus | `tanh(x)` | alle x | tanh |

## Profi-Modi: y′ = … und y″ = … (Differentialgleichungen)

Wie bei Graphwar kannst du links neben dem Eingabefeld den Modus umstellen. Dann gibst du nicht
die Kurve selbst ein, sondern wie sie sich ändert – das Spiel rechnet die Kurve aus
(Runge-Kutta 4. Ordnung, sehr genau). Die Kurve startet immer in dir (x = 0, y = 0).

| Modus | Bedeutung | Variablen | Beispiele |
|---|---|---|---|
| `y′ =` | Steigung an jeder Stelle | `x`, `y` | `x/5` → Parabel x²/10 · `1` → Gerade · `-y/4+1` → steigt und flacht ab · `y/6+0.3` → wächst exponentiell |
| `y″ =` | Krümmung; dazu ein **Startwinkel** (−85° … 85°) | `x`, `y`, `y'` | `-y/9` → Schwingung (Höhe 3 · sin(Winkel)) · `0` → Gerade im Startwinkel · `-0.05` → Wurfbahn · `-y'/3` → bremst ab |

- Geschossen wird wie immer nach rechts (in deinem Koordinatensystem), mit `L` davor nach links –
  gelöst wird dann von x = 0 aus rückwärts bis zum linken Rand.
- `y` heißt „Höhe relativ zu dir“, `y'` „aktuelle Steigung“. Beide gibt es nur in diesen Modi.
- Die Kurve endet wie sonst an Wänden, am Feldrand oder wenn die Rechnung nicht mehr geht.
- Im Multiplayer kann der Host die Profi-Modi in der Lobby abschalten.

## Wie erkennt das Spiel den Funktionstyp?

Der Parser merkt sich für jeden Teil des Ausdrucks, ob `x` darin vorkommt:

- `x · x` (auch `x(x+1)`) oder `x^Zahl` → **Potenzen & Polynome**
- `x` im Nenner → **Bruchfunktion**
- `x` im Exponenten → **Exponentialfunktion**
- `sin(...)` usw. zählt nur, wenn im Argument ein `x` steht. `sin(2)x` ist also linear.

Ist ein Typ in den Einstellungen aus, zeigt das die Vorschau sofort an, und der
Schuss wird nicht abgefeuert. Er kostet dann auch keinen Angriff.

## So wird geschossen

**Jeder Spieler hat sein eigenes Koordinatensystem.** Du stehst immer auf einem Kreuz des
Rasters. Die blauen Achsen gehen durch dich: Du bist der **Nullpunkt (0 | 0)**, und alle
Zahlen an den Achsen zählen von dir aus. Ein gemeinsames Koordinatensystem gibt es nicht.
Das Spielfeld ist 50 Einheiten breit und 30 hoch.

**Jeder sieht sich selbst links** und schießt **nach rechts**. Steht ein Spieler in der rechten
Hälfte (im Multiplayer), wird das Feld für ihn an der y-Achse gespiegelt – seine x-Richtung
zeigt dann in der Welt nach links, y bleibt gleich.

Deine Funktion wird von dir aus gezeichnet und nur **senkrecht verschoben**, bis sie durch
dich geht:

```
y = f(x) − f(0)        für x ≥ 0
```

**Nach links schießen:** Schreib `L` (oder `l`) vor die Funktion, z. B. `L x^2/8` oder `lx/2`.
Dann fliegt die Kurve von dir aus nach links:

```
y = f(x) − f(0)        für x ≤ 0
```

`R`/`r` oder gar nichts davor heißt nach rechts (Standard). Auch `f(x) = L x^2` geht. Die
Taste `← L` bei den Mathe-Tasten schaltet die Richtung um. Bei `L x^2/8` steigt die Kurve
also nach links an, bei `L x/2` fällt sie nach links (die Steigung bleibt 1/2).

Daraus folgt:

- **Die Form hängt nur von der Funktion ab, nicht davon, wo du stehst.** `x^2` hat seinen
  Scheitel immer bei dir, `1/(x-3)` seine Lücke immer 3 rechts von dir.
- **Ein `+b` am Ende ändert nichts.** `x+3` und `x` sind derselbe Schuss, weil das +3
  beim Verschieben wieder wegfällt.
- **Geraden sind überall gleich.** Bei `m·x` ist die Steigung überall m, deshalb rechnest
  du sie einfach von dir zum Gegner aus: m = y / x des Gegners.

Gegner sitzen in der Mitte ihrer Kästchen. In deinem Koordinatensystem liegen sie deshalb
immer bei „… ,5“, z. B. (4,5 | 1,5). Fährst du mit der Maus übers Feld, siehst du die
Position des Mauszeigers in deinem Koordinatensystem, über einem Gegner seine Koordinaten.

| Fall | Was passiert | Beispiel |
|---|---|---|
| f(0) = 0 | nichts, die Kurve geht schon durch dich | `x/3`, `x^2`, `sin(x)` |
| f(0) definiert | Verschiebung um f(0) – die Kurve geht exakt durch dich | `cos(x)` → cos(x) − 1, `e^x` → eˣ − 1 |
| f(0) nicht definiert | Du kannst nicht schießen. Die Vorschau zeigt es an, es kostet nichts. | `1/x` → nimm z. B. `1/(x+1)` |

Wie bei Graphwar fliegt die Kurve durch Gegner hindurch und sprengt Löcher in Wände.

### Treffer

Die Kurve fliegt durch Gegner hindurch und trifft jeden, den sie berührt. Jeder Gegner
bekommt pro Schuss höchstens 1 Schaden.

### Wann endet der Schuss?

Es gibt **keine Reichweiten-Grenze**. Der Schuss fliegt, bis

- er eine **Wand** trifft – dort sprengt er wie bei Graphwar ein **Loch** hinein (alle
  Wandkästchen, deren Mitte höchstens 1 vom Einschlag entfernt ist). Der nächste Schuss
  kann durch das Loch fliegen. **↻ Neustart** stellt die Wände wieder her.
  Unter **⚙ Einstellungen → Wände zerstörbar** (im Multiplayer in der Lobby) lässt sich das
  abschalten – dann bleiben Wände stehen und stoppen die Kurve nur.
- er das Spielfeld **oben, unten oder seitlich** verlässt,
- er an eine **Unstetigkeit** kommt: eine Polstelle (z. B. `tan(x)` oder `1/(x-3)` bei x = 3)
  oder einen Sprung (z. B. `(x-3)/|x-3|` bei x = 3). Erkannt wird das per Intervallhalbierung
  zwischen zwei Rechenpunkten – Sprünge ab etwa einem Bildschirmpixel Höhe stoppen den Schuss,
  steile, aber stetige Stellen (z. B. `sqrt[3](x-3)`) nicht,
- die Funktion **nicht mehr definiert** ist (z. B. `sqrt(4-x)` ab 4 rechts von dir).

### Beispiele

- Ein Gegner liegt bei (4,5 | 1,5) in deinem Koordinatensystem: `x/3` trifft ihn.
- `-x/3` fällt nach rechts mit der Steigung −1/3.
- `x^2/8` startet bei dir waagerecht und steigt immer steiler: bei x = 4,5 ist es ≈ 2,5.
- `sqrt(x)` gibt es nur für x ≥ 0 – also genau ab dir nach rechts.
- Eine Wand versperrt die Gerade zum Gegner? Schieß einmal hinein, dann fliegt der nächste
  Schuss durch das Loch – oder nimm eine Kurve, die um die Wand herumgeht.
- **Garantie, dass du jeden Gegner treffen kannst:**
  - Im Level-Modus ist jede Karte mit der gewürfelten Lösung schaffbar. Die Wände stehen
    nie auf dieser Lösung, versperren aber manchmal absichtlich die einfache Gerade.
    Verlierst du, zeigt das Spiel eine mögliche Lösung.
  - Im Endlos-Modus hat jeder Gegner immer eine freie Schusslinie. Steht nach einem
    Umzug ein Gegner hinter einer Wand, wird er an eine erreichbare Stelle versetzt.

## Karten-Matrix

Jede Karte ist eine Matrix mit **30 Zeilen × 50 Spalten**, ein Eintrag pro Kästchen
des Koordinatensystems. Zeile 0 ist oben (y = 15), Spalte 0 ist links (x = −25).

| Wert | Bedeutung |
|---|---|
| `0` | leer |
| `1`, `2`, `3` | Gegner mit so vielen Lebenspunkten |
| `4` | Wand (undurchdringbar) |
| `5` | Spieler – immer **vier 5en als 2×2-Block** |

Gegner sitzen in der **Mitte** ihres Kästchens: Spalte c, Zeile r liegt bei
`x = −25 + c + 0,5` und `y = 15 − r − 0,5`.
Der Spieler sitzt auf dem **Kreuz in der Mitte seines 2×2-Blocks**. Weil Wände nie direkt
neben einer 5 stehen dürfen, hat der Spieler automatisch immer einen freien Ring um sich.

Beispiel (Ausschnitt): Der Spieler steht auf dem Kreuz zwischen den vier 5en,
rechts davon ein Gegner mit 2 Lebenspunkten, darüber eine Wand.

```
0000000000
0004440000
0000000000
0550000000
0550000200
0000000000
```

Die aktuelle Karte kannst du im Spiel unter **⚙ Einstellungen → „Karte als Matrix“** ansehen.

### Zufällige Level (Standard)

Ein Level in `script.js` ist ein Rezept, aus dem bei jedem Start eine neue Karte entsteht:

```js
{
  name: 'Die Parabel',
  form: 'a\\cdot x^2',     // Funktionsform (LaTeX), steht unter dem Namen
  shapes: ['parabola'],   // pro Eintrag eine Gegnergruppe auf einer Kurve dieser Form
  count: 4,               // Gegner pro Gruppe
  hp: [1, 2],             // mögliche Lebenspunkte
  walls: 8,               // Anzahl Wandstücke
  spareShots: 1,          // Puffer-Angriffe
}
```

Formen (`SHAPES` in `script.js`): `linear` (m·x), `parabola`, `throw`, `cubic`, `rational`,
`sqrt`, `exp`, `sin`, `cos`, `tan`, `combo`.

Der Generator setzt den Spieler auf ein zufälliges Kreuz in der linken Hälfte und würfelt pro
Gruppe eine Funktion (z. B. `x^2/4` oder `3/(x-5)`). Die Gegner kommen in Kästchen, durch deren Mitte
diese Kurve läuft. Die Wände stehen nie auf den Lösungskurven, gern aber auf der direkten
Linie zwischen dir und den Gegnern. Zum Schluss wird die Lösung simuliert, und nur lösbare
Karten werden genommen.

### Feste Level (eigene Karte zeichnen)

Statt eines Rezepts kann ein Level auch eine feste Matrix haben:

```js
{
  name: 'Meine Karte',
  shots: 3,
  solution: ['x/2'],          // optional, wird nach einer Niederlage gezeigt
  layout: [
    '00000000000000000000000000000000000000000000000000',
    // … insgesamt 30 Zeilen mit je 50 Ziffern (0–5), genau ein 2×2-Block aus 5en
  ],
}
```

## Häufige Fehlermeldungen

| Meldung | Lösung |
|---|---|
| „) fehlt“ | Jede `(` braucht eine `)` |
| „Nach … fehlt etwas“ | Nach `+`, `-`, `/` oder `^` fehlt noch etwas, z. B. `x/` → `x/2` |
| „Unbekannt: … – nur x“ | Nur `x` ist erlaubt |
| „Zu schnell – höchstens sin(4x)“ | Bei sin und cos ist die Zahl vor x höchstens 4: `sin(4x)` statt `sin(5x)` |
| „f(0) nicht definiert“ | f hat bei x = 0 keinen Wert, z. B. `1/x` – nimm z. B. `1/(x+1)` |
| „… gibt es hier nicht“ | Logarithmen (`ln`, `log`, `lg`) und `arcsin`, `arccos`, `arctan` sind entfernt |
| „sin^-1 gibt es nicht“ | Das wäre arcsin. Für 1/sin(x) schreib `1/sin(x)` |
| „Aus: …“ | Funktion unter ⚙ Einstellungen wieder einschalten |
| „Klammern: frac(a;b)“ | nur bei der frac-Schreibweise: `frac(Zähler;Nenner)` – oder einfach `/` |
