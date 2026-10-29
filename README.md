# Function Fighter

Ein kleines Browsergame wie [Graphwar](https://graphwar.com/): Zerstöre Gegner, indem du
mathematische Funktionen eintippst – ganz normal wie beim Taschenrechner, z. B. `x/2`,
`x^2/3`, `sqrt(x)` oder `sin(x/2)`. Neben dem Eingabefeld siehst du sofort, wie das Spiel
deine Formel verstanden hat.

## Starten

- **Allein spielen:** `index.html` per Doppelklick im Browser öffnen – fertig.
- **Multiplayer:** `start.bat` doppelklicken (siehe unten). Es braucht nur Python, keine
  weiteren Bibliotheken.

Mit Internetverbindung wird zusätzlich MathJax (schöne Formelvorschau) geladen. Ohne
Internet läuft das Spiel trotzdem; die Vorschau zeigt dann den LaTeX-Text. Die
Pixel-Schriften liegen im Ordner `fonts/` und funktionieren auch offline.

**Grafik:** mittelalterlicher Fantasy-Pixel-Stil – Burgmauer im Hintergrund, Holzbalken oben,
Pergament-Tafeln mit Goldnieten, ein Holzrahmen ums Pergament-Spielfeld, Zauberer, Schleime und
Burgmauern. Texte sind aufs Nötigste gekürzt; Knöpfe zeigen Pixel-Icons (Name beim Draufzeigen).
Alles ist auflösungsfest: Spielfeld, Figuren, Rahmen, Muster, Icons, Zeilenhöhen und Schrift
sitzen immer auf ganzen Bildschirmpixeln – bei 100 %, 125 %, 150 %, 175 %, 200 % Skalierung,
4K und jedem Browser-Zoom bleibt alles scharf. Die Größe der Oberfläche richtet sich nach
Skalierung und Fenstergröße (bei 150 % auf großen Bildschirmen doppelt so große Pixel). Schrift,
Knöpfe und Abstände sind 1,5-fach (`--u` in `style.css`), Icons immer ganzzahlig vergrößert.
Reicht die Breite nicht, zeigen die Reiter oben nur ihre Icons. Die Kurven werden in voller
Bildschirmauflösung mit rundem, hartkantigem Pinsel gezeichnet (`stampPath`, `curveWidth`).

**Alle Funktionen, die Eingabe-Regeln und das Karten-Format stehen in [`FUNKTIONEN.md`](FUNKTIONEN.md).**

## So wird geschossen

**Jeder Spieler hat sein eigenes Koordinatensystem.** Die blauen Achsen gehen durch dich:
Du bist immer der **Nullpunkt (0 | 0)**, alle Zahlen an den Achsen zählen von dir aus. Ein
gemeinsames Koordinatensystem gibt es nicht. **Jeder sieht sich selbst links** und schießt
**nach rechts**: Wer in der rechten Hälfte steht (im Multiplayer), bekommt das Feld an der
y-Achse gespiegelt angezeigt. Fährst du mit der Maus übers Feld, siehst du die Position des
Mauszeigers in deinem Koordinatensystem.

Deine Funktion wird von dir aus gezeichnet und **nur nach oben oder unten verschoben**, damit
sie genau aus dir herauskommt:

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

- `x^2` hat seinen Scheitel deshalb immer bei dir, egal wo du auf dem Feld stehst.
- Ein `+b` am Ende ändert nichts – es fällt beim Verschieben weg.
- f braucht bei x = 0 einen Wert. Ist f dort nicht definiert (z. B. `1/x`), kannst du
  nicht schießen – die Vorschau sagt es dir, und es kostet nichts.
- **Treffer:** Die Kurve fliegt durch Gegner hindurch und trifft jeden, den sie berührt.
- **Ende:** Es gibt keine Reichweiten-Grenze. Der Schuss fliegt, bis er eine Wand trifft
  (dort sprengt er wie bei Graphwar ein Loch hinein), das Feld verlässt, an eine
  Unstetigkeit kommt (Pol wie `1/(x-3)` oder Sprung wie `(x-3)/|x-3|` bei x = 3) oder die
  Funktion nicht mehr definiert ist. Wände werden exakt getroffen (die Kurve wird Kästchen für
  Kästchen verfolgt).
- **Anders als bei Graphwar:**
  - **Eigenes Koordinatensystem** pro Spieler (siehe oben) statt eines gemeinsamen.
  - **sin und cos:** Die Zahl vor x ist höchstens 4 – `sin(4x)` geht, `sin(5x)` nicht.
- **Nicht im Spiel:** Logarithmen (`ln`, `log`, `lg`) und `arcsin`, `arccos`, `arctan`.

## Modi (Reiter oben)

- **? Tutorial:** 7 kurze Schritte zum Mitmachen. Es startet beim ersten Besuch automatisch.
  Hier gibt es links neben der Eingabe den Diagramm-Knopf für die Funktionsliste (siehe unten).
- **▦ Level:** öffnet die Auswahl aller 12 Level (erledigte grün, gesperrte grau). Jedes
  Level erzeugt eine zufällige, garantiert lösbare Karte: Du startest
  auf einem zufälligen Kreuz in der linken Hälfte, dazu kommen Gegner und Wände.
  - **↻ Neustart** spielt dieselbe Karte noch einmal.
  - **🎲 Neue Karte** würfelt eine neue.
  - Im selben Fenster: **📅 Tages-Herausforderung**, **✎ Level-Editor** und **🔑 Karten-Code**
    (siehe unten).
- **∞ Endlos:** Du hast unbegrenzt viele Angriffe, und es tauchen immer neue Gegner auf.
  Alle 5 Schüsse ziehst du an eine neue Stelle um. Jeder zerstörte Gegner bringt 1 Punkt;
  die beste Kombo (meiste Gegner mit einem Schuss) wird gespeichert. Mit **🧱 Wände: AN/AUS**
  (oder in den Einstellungen) schaltest du die Wände ein und aus – auch mitten im Spiel.
- **□ Sandkasten:** Du stehst in der Mitte des Feldes, ohne Gegner und Wände, und
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
dir (0 | 0), bei y″ mit der Steigung aus dem Startwinkel. Gerechnet wird mit dem Runge-Kutta-Verfahren
(4. Ordnung) – genau auf etwa 6 Nachkommastellen. Im Multiplayer kann der Host die Profi-Modi
abschalten.

## Mathe-Tasten (Tastatur-Knopf)

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

## Funktionsliste (Knopf „Funktionen“)

Eine Liste mit Standardfunktionen: Gerade, Parabel, kubische Funktion, Wurfparabel, Wurzel,
Bruch, Exponentialfunktion, Sinus, Kosinus, Tangens, Gerade + Welle, Sinus hyperbolicus.
Jede Karte zeigt einen kleinen Graphen (von dir aus, kräftig ist der geschossene Teil) und
Felder für die Parameter (a, b, …). Darunter steht die fertige Eingabe mit drei Knöpfen: **Kopieren**, **Einsetzen** (zum Weiter-Anpassen) und
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
| Feuern | **Echtzeit** (Standard, alle 3 s): alle gleichzeitig, jeder darf **alle 2, 3 oder 5 Sekunden** feuern – wer schneller ist, hat Glück. **Runden:** nacheinander, jeder hat eine **Bedenkzeit** (10/20/30/45/60 s). Wer nicht feuert, verliert den Zug. |
| Wände | keine, wenig, mittel (Standard), viel – Mauerstücke (2–5 lang), Türme (2×2) und Ecken. Um jeden Startplatz bleiben 3 Kästchen frei. |
| Wände zerstörbar | an (Standard): ein Treffer sprengt ein Loch in die Wand. Aus: Wände bleiben stehen. |
| Funktionsliste | erlaubt oder nicht |
| Faire Welt | an (Standard): Die Wände werden gespiegelt – bei 2 Spielern an der y-Achse, bei 3–4 an beiden Achsen. Weil sich jeder links sieht, hat so jeder in seiner Ansicht dieselbe Umgebung. Die Startplätze sind immer zufällig in der eigenen Hälfte bzw. im eigenen Viertel. Aus: auch die Wände zufällig. |
| 2 gegen 2 | Teams (nur mit 4 Spielern): Team Links (Spieler 1 + 3) gegen Team Rechts (Spieler 2 + 4). Teamkollegen kann man nicht treffen; gewonnen hat das Team, das als letztes noch jemanden hat. |
| Power-ups | an (Standard): Auf dem Feld liegen ♥ **+1 Leben**, 🛡 **Schutzzauber** (hält einen Treffer ab, grauer Ring ums Manaschild) und ×2 **Doppelschuss** (der nächste Schuss kostet 2 Leben). Eingesammelt wird, wenn die eigene Kurve sie berührt – wer zuerst da ist. Alle 15 s kommen neue (in der fairen Welt gespiegelt). |
| Profi-Modi | y′ und y″ erlaubt oder nicht |

**Spielablauf:** Zu Beginn wird eine zufällige Welt mit Wänden erzeugt. Bei 2 Spielern steht
Spieler 1 in der linken und Spieler 2 in der rechten Hälfte, bei 3–4 Spielern hat jeder ein
Viertel (1 oben links, 2 oben rechts, 3 unten links, 4 unten rechts), jeweils an einer zufälligen
Stelle. Jeder Zauberer steht in einem **Manaschild** – das ist seine Trefferfläche (ein fester
Kreis um den Körper; die Kurve startet weiter an der Kugel auf seinem Stab). Jeder hat **3 Leben**:
Wird ein Spieler getroffen, verliert er ein Leben und **springt an eine andere Stelle in seiner
Hälfte bzw. seinem Viertel** – das Manaschild bleibt gleich groß. Nach dem 1. Treffer bekommt es
Risse, nach dem 2. zerbricht es (man sieht nur noch den gepunkteten Umriss), beim 3. Treffer ist
man raus. Der Letzte gewinnt. Danach kann der Host eine neue Runde starten.
Ist im Runden-Modus jemand nicht verbunden, wird sein Zug nach 3 Sekunden übersprungen.
Rechts im Verlauf steht, wer welche Funktion abgefeuert und wen getroffen hat. Den Namen kann
man jederzeit oben ändern – alle sehen den neuen Namen sofort.

**Wer bin ich?** In einer Ecke des Spielfelds steht „SPIELER 2 · ROT“ samt Zug-/Nachlade-
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
| Level-Namen und Funktionsform unter dem Namen | `script.js`, Abschnitt 1 – `LEVELS` (`name`, `form`) |
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
| Fehler unter der Eingabe | `script.js`, Abschnitt 8 – `updatePreview`, `shotError` |
| Sprung- und Polstellen, Wand-Treffer | `script.js`, Abschnitt 4 – `isJump`, `JUMP_LIMIT`, `wallHit` |
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
| Faire Welt (Spiegelung der Wände), Wandformen | `server.py` – `mirror_cells`, `wall_shape`, `make_walls`, `start_game` |
| Manaschild (Trefferfläche, Aussehen), Größe des Zauberers | `multiplayer.js` – `MP_SHIELD_RADIUS`, `mpShieldCenter`, `mpShieldSprite`; `script.js` – `WIZARD_SPRITE`, `WIZARD_HEIGHT`, `WIZARD_BODY` |
| Farben, Schriften, Muster (Stein, Holz, Pergament, Nieten), Layout der Oberfläche | `style.css` – Variablen in `:root` |
| Holzrahmen ums Spielfeld | `style.css` – `.frame`, `#game`; `script.js` – `FRAME`, `fitCanvas` |
| Pixel-Grafik des Spielfelds (Pergament, Farben, Zauberer, Schleime, Mauern, Icons) | `script.js`, Abschnitt 7 – `COLORS`, `drawGrid`, `WIZARD_SPRITE`, `slimeSprite`, `drawWalls`, `ICONS` |
| Auflösung, Pixelgröße, Spielfeldgröße | `script.js` – `setPixelScale`, `fitCanvas` |
| Info-Fenster, Beispiele, Aufbau der Seite | `index.html` |
