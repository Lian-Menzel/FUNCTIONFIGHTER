# Function Fighter

Ein kleines Browsergame wie [Graphwar](https://graphwar.com/): Zerstöre Gegner, indem du
mathematische Funktionen eintippst – ganz normal wie beim Taschenrechner, z. B. `x/2`,
`x^2/3`, `sqrt(x)` oder `sin(x/2)`. Neben dem Eingabefeld siehst du sofort, wie das Spiel
deine Formel verstanden hat.

## Starten

- **Allein spielen:** `index.html` per Doppelklick im Browser öffnen – fertig.
- **Multiplayer:** `start.bat` doppelklicken (siehe unten). Es braucht nur Python, keine
  weiteren Bibliotheken.

Mit Internetverbindung werden zusätzlich MathJax (schöne Formelvorschau) und die
Pixel-Schrift geladen. Ohne Internet läuft das Spiel trotzdem; die Vorschau zeigt dann
den LaTeX-Text.

**Alle Funktionen, die Eingabe-Regeln und das Karten-Format stehen in [`FUNKTIONEN.md`](FUNKTIONEN.md).**

## So wird geschossen

**Jeder Spieler hat sein eigenes Koordinatensystem.** Die blauen Achsen gehen durch dich,
du bist immer der Ursprung (0 | 0), und alle Zahlen an den Achsen zählen von dir aus.
Deine Funktion wird genau so gezeichnet wie im Sandkasten: von dir aus und **nach oben
oder unten verschoben**, bis sie durch dich geht. In deinem Koordinatensystem ist das

```
y = f(x) − f(0)
```

- `x^2` hat seinen Scheitel deshalb immer bei dir, egal wo du auf dem Feld stehst.
  Dieselbe Funktion hat von jeder Stelle aus dieselbe Form.
- Ein `+b` am Ende ändert nichts – es fällt beim Verschieben weg.
- f braucht bei x = 0 einen Wert. Ist f dort nicht definiert (z. B. `1/x`), kannst du
  nicht schießen – die Vorschau sagt es dir, und es kostet nichts.
- **Treffer:** Die Kurve fliegt durch Gegner hindurch und trifft jeden, den sie berührt.
- **Ende:** Es gibt keine Reichweiten-Grenze. Der Schuss fliegt, bis er eine Wand trifft
  (dort sprengt er wie bei Graphwar ein Loch hinein), das Feld verlässt, an eine
  Sprungstelle kommt (z. B. `1/(x-3)` bei x = 3) oder die Funktion nicht mehr definiert ist.
- **Wie bei Graphwar:** Die Kurve fliegt durch Gegner hindurch und sprengt Löcher in Wände.
- **Anders als bei Graphwar:**
  - **Eigenes Koordinatensystem** pro Spieler (siehe oben) statt eines gemeinsamen.
  - **Richtung:** Der Schuss fliegt nach rechts. Steht direkt vor **jedem** x ein Minus
    (`-x`, `(-x)/6`, `sin(-x)`), fliegt er nach links.
  - **sin und cos:** Die Zahl vor x ist höchstens 4 – `sin(4x)` geht, `sin(5x)` nicht.
- **Nicht im Spiel:** Logarithmen (`ln`, `log`, `lg`) und `arcsin`, `arccos`, `arctan`.

## Modi (Reiter oben)

- **? Tutorial:** 7 kurze Schritte zum Mitmachen. Es startet beim ersten Besuch automatisch.
  Hier gibt es den Knopf **📈 Funktionen** (siehe unten).
- **▦ Level:** öffnet die Auswahl aller 12 Level (erledigte grün, gesperrte grau). Jedes
  Level erzeugt eine zufällige, garantiert lösbare Karte: Du startest
  auf einem zufälligen Kreuz des Rasters, dazu kommen Gegner und Wände.
  - **↻ Neustart** spielt dieselbe Karte noch einmal.
  - **🎲 Neue Karte** würfelt eine neue.
  - Im selben Fenster: **📅 Tages-Herausforderung**, **✎ Level-Editor** und **🔑 Karten-Code**
    (siehe unten).
- **∞ Endlos:** Du hast unbegrenzt viele Angriffe, und es tauchen immer neue Gegner auf.
  Alle 5 Schüsse ziehst du an eine neue Stelle um. Jeder zerstörte Gegner bringt 1 Punkt;
  die beste Kombo (meiste Gegner mit einem Schuss) wird gespeichert. Mit **🧱 Wände: AN/AUS**
  (oder in den Einstellungen) schaltest du die Wände ein und aus – auch mitten im Spiel.
- **□ Sandkasten:** Du stehst genau in der Mitte bei (0 | 0), ohne Gegner und Wände, und
  kannst beliebig viele Funktionen ausprobieren. Die letzten 8 Kurven bleiben zum Vergleichen
  stehen. Ein Klick ins Feld setzt ein Übungsziel; jeder weitere Klick gibt ihm mehr Leben
  (bis 3), danach verschwindet es. **↻ Neustart** räumt alles ab. Die Funktionsliste ist offen.
- **👥 Multiplayer:** Live mit bis zu 4 Spielern (siehe unten).
- **ⓘ Info:** Regeln, Schreibweise und klickbare Beispiele.
- **⚙ Einstellungen:**
  - Alle 13 Funktionen lassen sich einzeln an- und ausschalten (lineare Funktionen gehen immer).
  - **Wände zerstörbar** (an/aus): Ist es aus, sprengen Treffer keine Löcher mehr – die Kurve
    stoppt nur an der Wand. Gilt für Tutorial, Level, Endlos und Sandkasten.
  - Wände im Endlos-Modus und die aktuelle Karte als Matrix.

## Profi-Modi y′ und y″ (wie bei Graphwar)

Links neben dem Eingabefeld wählst du den Modus:

| Modus | Du gibst ein | Beispiel |
|---|---|---|
| `f(x) =` | die Funktion selbst (Standard) | `x^2/8` |
| `y′ =` | die **Steigung** – die Kurve wird daraus berechnet (Differentialgleichung) | `x/5` ergibt eine Parabel, `-y/4+1` biegt sich ein |
| `y″ =` | die **Krümmung**, dazu einen **Startwinkel** | `-y/9` mit 45° ergibt eine Schwingung |

Erlaubt sind `x`, `y` und im Modus y″ zusätzlich `y'` (die Steigung). Die Kurve startet immer in
dir; die Richtung (→ / ←) wählst du daneben. Gerechnet wird mit dem Runge-Kutta-Verfahren
(4. Ordnung) – genau auf etwa 6 Nachkommastellen. Im Multiplayer kann der Host die Profi-Modi
abschalten.

## Mathe-Tasten (⌨)

Der Knopf **⌨** neben dem Eingabefeld blendet Tasten für x, x², xⁿ, √, sin, cos, tan, eˣ, π,
|x|, Klammern, Rechenzeichen, ⌫ und C ein. Sie fügen an der Cursor-Stelle ein und setzen den
Cursor gleich in die Klammer – praktisch am Tablet (dort sind sie von Anfang an offen).

## Level-Editor, Karten-Codes und Tages-Herausforderung

- **🔑 Karten-Code:** Unter jeder Level-Aufgabe steht ein Code wie `L7-3K9QX`. Wer ihn im
  Level-Fenster eingibt, spielt **genau dieselbe Karte** (der Code enthält Level und Zufalls-Seed).
- **📅 Tages-Herausforderung:** Jeden Tag ein Level mit einer festen Karte – für alle gleich.
  Dein Bestwert (wenigste Angriffe) wird gespeichert.
- **✎ Level-Editor:** Werkzeug wählen (🧱 Wand, ● Gegner mit 1–3 Leben, 🙂 Spieler, ⌫ Radierer)
  und ins Feld klicken oder ziehen, Anzahl der Angriffe einstellen. **▶ Testen** spielt die Karte,
  **Code kopieren** gibt einen Code (`K1-…`) zum Teilen. Codes lädt man im Editor oder im
  Level-Fenster. Der Editor merkt sich deine Karte.

## Eingabe-Verlauf

Mit **↑ / ↓** im Eingabefeld holst du deine letzten 30 abgefeuerten Funktionen zurück – praktisch
zum Nachjustieren. Der Verlauf wird gespeichert.

## Funktionsliste (📈 Funktionen)

Eine Liste mit Standardfunktionen: Gerade, Parabel, kubische Funktion, Wurfparabel, Wurzel,
Bruch, Exponentialfunktion, Sinus, Kosinus, Tangens, Gerade + Welle, Sinus hyperbolicus.
Jede Karte zeigt einen kleinen Graphen (von dir aus, kräftig ist der geschossene Teil),
Felder für die Parameter (a, b, …) und die Richtung (→ rechts / ← links). Darunter steht die
fertige Eingabe mit drei Knöpfen: **Kopieren**, **Einsetzen** (zum Weiter-Anpassen) und
**Feuer!**. Offen ist die Liste im Tutorial und im Sandkasten, im Multiplayer nur, wenn der
Host sie in der Lobby erlaubt. In den Leveln und im Endlos-Modus gibt es sie nicht.

## Multiplayer

1. Auf einem PC **`start.bat`** doppelklicken. Es öffnet sich ein schwarzes Fenster mit den
   Links, z. B. `http://192.168.1.23:8000` – und auf diesem PC gleich der Browser.
   Fragt Windows nach der Firewall: **Zugriff zulassen** (private Netzwerke).
2. Auf allen anderen PCs im selben Netzwerk (WLAN/LAN) diesen Link im Browser öffnen.
3. Oben links den **eigenen Namen** eintragen (wird gespeichert; geht auch im Multiplayer-Fenster).
4. Reiter **👥 Multiplayer**: Einer erstellt eine Lobby und bekommt einen **4-stelligen Code**
   (Knopf „Code kopieren“), die anderen treten mit dem Code bei (2–4 Spieler). Das Fenster
   zeigt auch den Link, den die anderen PCs öffnen müssen.
5. Der Host stellt die Regeln ein und startet die Runde. Er kann Spieler mit ✕ entfernen.

**Lobby-Einstellungen (Host):**

| Einstellung | Möglichkeiten |
|---|---|
| Feuern | **Runden:** nacheinander, jeder hat eine **Bedenkzeit** (10/20/30/45/60 s). Wer nicht feuert, verliert den Zug. **Echtzeit:** alle gleichzeitig, jeder darf **alle 2, 3 oder 5 Sekunden** feuern – wer schneller ist, hat Glück. |
| Wände | keine, wenig, mittel, viel |
| Wände zerstörbar | an (Standard): ein Treffer sprengt ein Loch in die Wand. Aus: Wände bleiben stehen. |
| Funktionsliste | erlaubt oder nicht |
| Faire Welt | an (Standard): Wände und Startplätze werden gespiegelt – bei 2 Spielern um die Feldmitte gedreht, bei 3–4 an beiden Achsen. So hat jeder dieselbe Umgebung. Aus: alles zufällig. |
| 2 gegen 2 | Teams (nur mit 4 Spielern): Team Links (Spieler 1 + 3) gegen Team Rechts (Spieler 2 + 4). Teamkollegen kann man nicht treffen; gewonnen hat das Team, das als letztes noch jemanden hat. |
| Power-ups | an (Standard): Auf dem Feld liegen ♥ **+1 Leben**, 🛡 **Schild** (hält einen Treffer ab) und ×2 **Doppelschuss** (der nächste Schuss kostet 2 Leben). Eingesammelt wird, wenn die eigene Kurve sie berührt – wer zuerst da ist. Alle 15 s kommen neue (in der fairen Welt gespiegelt). |
| Profi-Modi | y′ und y″ erlaubt oder nicht |

**Spielablauf:** Zu Beginn wird eine zufällige Welt mit Wänden erzeugt. Bei 2 Spielern steht
Spieler 1 in der linken und Spieler 2 in der rechten Hälfte, bei 3–4 Spielern hat jeder ein
Viertel (1 oben links, 2 oben rechts, 3 unten links, 4 unten rechts). Jeder hat **3 Leben**.
Wird ein Spieler von einem anderen getroffen, verliert er ein Leben, **wird kleiner** und
**springt an eine andere Stelle in seiner Hälfte bzw. seinem Viertel**. Wer alle Leben
verliert, ist raus; der Letzte gewinnt. Danach kann der Host eine neue Runde starten.
Ist im Runden-Modus jemand nicht verbunden, wird sein Zug nach 3 Sekunden übersprungen.
Rechts im Verlauf steht, wer welche Funktion abgefeuert und wen getroffen hat. Den Namen kann
man jederzeit oben ändern – alle sehen den neuen Namen sofort.

**Wer bin ich?** Oben links im Spielfeld steht „DU BIST SPIELER 2 · ROT“ samt Zug-/Nachlade-
Anzeige, über deiner Figur „DU · Name“, deine Achsen haben deine Farbe, und rechts steht deine
Karte mit allen Spielern und ihren Leben. Wer am Zug ist, hat einen drehenden Ring. Bist du im
Runden-Modus dran, steht „▶ Dein Zug!“ auch im Tab-Titel.

**Auch ohne Farben unterscheidbar:** Jeder Spieler hat ein Symbol (● Spieler 1, ▲ Spieler 2,
■ Spieler 3, ◆ Spieler 4) – über der Figur, in allen Listen und im Status-Kasten – und seine
Spuren haben ein eigenes Muster (durchgezogen, gestrichelt, gepunktet, Strich-Punkt).

**Punkte über mehrere Runden:** Die Lobby zählt **Siege 🏆** und **Treffer 🎯** jedes Spielers.
Im Lobby-Fenster steht die **Rangliste**, am Rundenende der Stand. Der Host kann die Punkte
zurücksetzen.

Gerechnet wird wie im Einzelspieler (eigenes Koordinatensystem). Der Browser des Schützen
berechnet Kurve und Treffer, der Server prüft, ob der Schuss erlaubt ist, und wendet den
Treffer genau dann an, wenn die Kurve beim Ziel ankommt. Lädt man die Seite neu, kommt man
in dieselbe Lobby zurück. Das ist für Spiele unter Freunden im eigenen Netz gedacht – der
Server prüft nicht nach, ob ein Browser beim Treffer schummelt.

**Kein Python?** `start.bat` sagt es dir. Python gibt es kostenlos auf
https://www.python.org/downloads/ (beim Installieren „Add python.exe to PATH“ anhaken) oder
per `winget install Python.Python.3.12`.

## Wo kann ich was ändern?

| Was | Wo |
|---|---|
| Level-Rezepte (Formen, Gegnerzahl, Wände) | `script.js`, Abschnitt 1 – `LEVELS` |
| Tutorial-Schritte (Texte, Gegner, Wände, Lösung) | `script.js`, Abschnitt 1 – `TUTORIAL` |
| Kurvenformen für die Generierung | `script.js`, Abschnitt 1 – `SHAPES` |
| Feldgröße, Karten-Matrix, Gegnergrößen | `script.js`, Abschnitt 2 – `VIEW`, `CELL`, `ENEMY_RADIUS` |
| Eingabe-Schreibweise (/, ^, sqrt, Klammern …) | `script.js`, Abschnitt 3 – Parser |
| Unterstützte / abschaltbare Funktionen | `script.js`, Abschnitt 3 – `FUNCTIONS`, `FUNCTION_TYPES` |
| Gesperrte Funktionen (ln, log, lg, arcsin …) | `script.js`, Abschnitt 3 – `REMOVED_WORDS` |
| Rechnung im Spieler-Koordinatensystem, Ende des Schusses | `script.js`, Abschnitt 4 – `buildArm`, `buildCurve` |
| Achsen des Spieler-Koordinatensystems | `script.js`, Abschnitt 7 – `drawPlayerAxes`, `COLORS.axes` |
| Höchste Zahl vor x bei sin und cos | `script.js`, Abschnitt 3 – `MAX_TRIG_FACTOR`, `checkTrigSpeed` |
| Löcher in Wänden, Linienstärke | `script.js`, Abschnitt 4 – `blastWall`, `BLAST_RADIUS`, `LINE_WIDTH` |
| Wände zerstörbar oder nicht | `script.js`, Abschnitt 6 – `wallsBreakable`, `settings.wallsBreakable`; Multiplayer: Lobby-Einstellung `wallsBreakable` in `server.py` |
| Geschwindigkeit der Schuss-Animation | `script.js`, Abschnitt 6 – `SHOT_SPEED` |
| Kartengenerierung, Wände im Endlos-Modus | `script.js`, Abschnitt 5 – `generateLevelMap`, `ENDLESS_WALLS` |
| Endlos-Modus (Umzug, Gegnerzahl, Abstand neuer Gegner) | `script.js`, Abschnitt 6 – `ENDLESS_…` |
| Sandkasten (Spuren, Übungsziele) | `script.js`, Abschnitt 6 – `startSandbox`, `toggleTarget`, `SANDBOX_TRAILS` |
| Farben der Spielwelt (Canvas) | `script.js`, Abschnitt 7 – `COLORS` |
| Tipps unter der Eingabe | `script.js`, Abschnitt 8 – `functionTips` |
| Reiter, Level-Auswahl | `script.js`, Abschnitt 8 – `buildLevelSelect`, `openLevelDialog` |
| Profi-Modi y′ / y″ (Löser) | `script.js`, Abschnitt 4 – `odeStepper`, `buildArm`; Eingabe: `compileShot`, `setInputMode` |
| Mathe-Tasten | `index.html` – `#keypad`; `script.js` – `insertAtCursor`, `keypadPress` |
| Karten-Codes, Seeds, Tages-Herausforderung | `script.js`, Abschnitt 5 – `seededRandom`, `withSeed`, `levelMap`, `mapCodeText`, `loadMapCode`, `startDaily` |
| Level-Editor, eigene Karten | `script.js`, Abschnitt 6 – `startEditor`, `editorPaint`, `encodeMap`, `decodeMap`, `startCustom` |
| Teams, Power-ups, Punkte (Server) | `server.py` – `POWERUP_…`, `spawn_powerups`, `apply_effect`, `check_game_over` |
| Symbole und Strichmuster der Spieler | `multiplayer.js` – `MP_SYMBOLS`, `MP_DASH`, `POWERUP_LOOK` |
| Funktionsliste (Einträge, Parameter) | `catalog.js` – `CATALOG` |
| Multiplayer im Browser (Lobby-Fenster, Anzeige, Feuern) | `multiplayer.js` |
| Multiplayer-Server (Lobbys, Wanddichte, Bereiche, Leben, Bedenkzeit) | `server.py` – Abschnitt 1 (`WALL_PIECES`, `HALVES`, `QUADRANTS`, `START_LIVES`, `ALLOWED_SETTINGS`, `OFFLINE_SKIP`) |
| Faire Welt (Spiegelung von Wänden und Startplätzen) | `server.py` – `mirror_cells`, `make_walls`, `start_game` |
| Farben, Schriften, Layout der Oberfläche | `style.css` – Variablen in `:root` |
| Info-Fenster, Beispiele, Aufbau der Seite | `index.html` |
