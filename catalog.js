/* ==========================================================
   FUNCTION FIGHTER – catalog.js
   Funktionsliste: Standardfunktionen mit Parametern. Jede Karte
   zeigt einen kleinen Graphen (von dir aus, wie im Spiel), die
   fertige Eingabe und drei Knöpfe: Kopieren, Einsetzen, Feuern.

   Offen ist die Liste im Tutorial und im Sandkasten – im
   Multiplayer nur, wenn der Host sie in der Lobby erlaubt.
   Neue Einträge: unten in CATALOG ergänzen.
   ========================================================== */
'use strict';

// Zahl ohne überflüssige Nachkommastellen, z. B. 0.125 oder -2
const catNum = n => String(parseFloat(Number(n).toFixed(4)));

// a · rest als Eingabe-Text: 1·x = x, −1·x = -x
function catCoef(a, rest) {
  if (a === 1) return rest;
  if (a === -1) return '-' + rest;
  return catNum(a) + rest;
}

// „+ b·rest“ bzw. „− b·rest“ als Anhang an einen Ausdruck
function catPlus(b, rest) {
  return (b < 0 ? '-' : '+') + catCoef(Math.abs(b), rest);
}

// Jeder Eintrag: Name, Formel mit Parametern, Parameter (Startwert, Schritt, Grenzen) und
// build(p) -> Eingabe-Text (x zählt vom Spieler aus).
const CATALOG = [
  { name: 'Gerade', formula: 'a·x', params: [{ k: 'a', v: 0.5, step: 0.25 }],
    build: p => catCoef(p.a, 'x') },
  { name: 'Parabel', formula: 'a·x²', params: [{ k: 'a', v: 0.125, step: 0.025 }],
    build: p => catCoef(p.a, 'x^2') },
  { name: 'Kubische Funktion', formula: 'a·x³', params: [{ k: 'a', v: 0.02, step: 0.005 }],
    build: p => catCoef(p.a, 'x^3') },
  { name: 'Wurfparabel', formula: 'x·(k − x) / d', params: [{ k: 'k', v: 10, step: 1 }, { k: 'd', v: 6, step: 1, min: 1 }],
    build: p => `x(${catNum(p.k)}-x)/${catNum(p.d)}` },
  { name: 'Wurzel', formula: 'a·√(b·x)', params: [{ k: 'a', v: 2, step: 0.5 }, { k: 'b', v: 1, step: 0.5, min: 0.5 }],
    build: p => catCoef(p.a, `sqrt(${catCoef(p.b, 'x')})`) },
  { name: 'Bruch (Hyperbel)', formula: 'a / (x + b)', params: [{ k: 'a', v: 2, step: 1 }, { k: 'b', v: -6, step: 1 }],
    build: p => `${catNum(p.a)}/(x${p.b < 0 ? '-' : '+'}${catNum(Math.abs(p.b))})` },
  { name: 'Exponentialfunktion', formula: 'a·e^(x / b)', params: [{ k: 'a', v: 1, step: 0.5 }, { k: 'b', v: 4, step: 1, min: 1 }],
    build: p => catCoef(p.a, `e^(x/${catNum(p.b)})`) },
  { name: 'Sinus', formula: 'a·sin(b·x)', params: [{ k: 'a', v: 2, step: 0.5 }, { k: 'b', v: 1, step: 0.25, min: -4, max: 4 }],
    build: p => catCoef(p.a, `sin(${catCoef(p.b, 'x')})`) },
  { name: 'Kosinus', formula: 'a·cos(b·x)', params: [{ k: 'a', v: 3, step: 0.5 }, { k: 'b', v: 0.5, step: 0.25, min: -4, max: 4 }],
    build: p => catCoef(p.a, `cos(${catCoef(p.b, 'x')})`) },
  { name: 'Tangens', formula: 'a·tan(x / b)', params: [{ k: 'a', v: 1, step: 0.5 }, { k: 'b', v: 4, step: 1, min: 1 }],
    build: p => catCoef(p.a, `tan(x/${catNum(p.b)})`) },
  { name: 'Gerade + Welle', formula: 'x / a + b·sin(x)', params: [{ k: 'a', v: 3, step: 1, min: 1 }, { k: 'b', v: 1, step: 0.5 }],
    build: p => `x/${catNum(p.a)}${catPlus(p.b, 'sin(x)')}` },
  { name: 'Sinus hyperbolicus', formula: 'a·sinh(x / b)', params: [{ k: 'a', v: 1, step: 0.5 }, { k: 'b', v: 4, step: 1, min: 1 }],
    build: p => catCoef(p.a, `sinh(x/${catNum(p.b)})`) },
];

const CAT_VIEW = { x: 10, y: 6 };   // Mini-Graph zeigt x von −10 bis 10, y von −6 bis 6 (von dir aus)

// Darf die Funktionsliste gerade geöffnet werden?
function catalogAllowed() {
  if (state.mode === 'tutorial' || state.mode === 'sandbox') return true;
  return state.mode === 'multi' && !!(mp.lobby && mp.lobby.settings.functionList);
}

// Knopf ein-/ausblenden; ist die Liste nicht erlaubt, wird sie geschlossen
function updateCatalogVisibility() {
  const allowed = catalogAllowed();
  ui.catalogBtn.hidden = !allowed;
  if (!allowed) ui.catalogCard.hidden = true;
  ui.catalogBtn.classList.toggle('current', !ui.catalogCard.hidden);
}

function toggleCatalog() {
  if (!catalogAllowed()) return;
  ui.catalogCard.hidden = !ui.catalogCard.hidden;
  updateCatalogVisibility();
  if (ui.catalogCard.hidden) return;
  refreshCatalog();
  ui.catalogCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Eingabe-Text eines Eintrags
function catalogCode(item) {
  return item.build(item.values);
}

// Text in die Zwischenablage – mit Ausweichweg, weil die Zwischenablage-API
// nur auf https:// oder localhost erlaubt ist (nicht unter http://192.168…)
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

// Kleiner Graph (Mitte = du): ganze Funktion blass, der geschossene Teil (nach rechts)
// kräftig – genau wie im Spiel um f(0) verschoben
function drawCatalogGraph(canvasEl, result) {
  // Pixel-Graph: ein Graph-Pixel = 2 Pixel der Oberfläche (pix.T), das Canvas hat genau
  // so viele Pixel wie der Bildschirm an dieser Stelle → scharf bei jeder Auflösung
  const dpr = window.devicePixelRatio || 1;
  const k = 2 * pix.T;
  canvasEl.style.width = canvasEl.style.height = '';   // erst die von CSS vorgegebene Größe messen
  const w = Math.max(20, Math.floor((canvasEl.clientWidth || 170) * dpr / k));
  const h = Math.max(12, Math.floor((canvasEl.clientHeight || 96) * dpr / k));
  canvasEl.width = w * k;
  canvasEl.height = h * k;
  canvasEl.style.width = w * k / dpr + 'px';
  canvasEl.style.height = h * k / dpr + 'px';
  const g = canvasEl.getContext('2d');
  const dot = (color, i, j, s = 1) => { g.fillStyle = color; g.fillRect(i * k, j * k, s * k, s * k); };
  const sx = u => Math.round((u + CAT_VIEW.x) / (2 * CAT_VIEW.x) * w);
  const sy = v => Math.round((CAT_VIEW.y - v) / (2 * CAT_VIEW.y) * h);
  g.fillStyle = COLORS.paper;
  g.fillRect(0, 0, w * k, h * k);
  for (let u = -CAT_VIEW.x + 2; u < CAT_VIEW.x; u += 2) for (let j = 1; j < h; j += 2) dot(COLORS.grid, sx(u), j);
  for (let v = -CAT_VIEW.y + 2; v < CAT_VIEW.y; v += 2) for (let i = 1; i < w; i += 2) dot(COLORS.grid, i, sy(v));
  g.fillStyle = COLORS.axes;
  g.fillRect(0, sy(0) * k, w * k, k);
  g.fillRect(sx(0) * k, 0, k, h * k);
  if (!result.ok) return;

  // Kurve als lückenlose Pixel-Linie (Bresenham zwischen den Abtastpunkten)
  const f0 = result.fn(0);
  const plot = (from, to, color, size) => {
    let prev = null;
    let pv = null;
    const step = (to - from) / 300;
    for (let n = 0; n <= 300; n++) {
      const u = from + n * step;
      const v = result.fn(u) - f0;
      const ok = Number.isFinite(v) && Math.abs(v) < 1e3 && (pv === null || Math.abs(v - pv) < 4);
      if (!ok) { prev = null; pv = null; continue; }
      const i = sx(u);
      const j = Math.max(-2, Math.min(h + 2, sy(v)));
      let [x, y] = prev || [i, j];
      const di = Math.abs(i - x), dj = -Math.abs(j - y), si = x < i ? 1 : -1, sj = y < j ? 1 : -1;
      let err = di + dj;
      for (;;) {
        dot(color, x - (size - 1), y - (size - 1), size);
        if (x === i && y === j) break;
        const e2 = 2 * err;
        if (e2 >= dj) { err += dj; x += si; }
        if (e2 <= di) { err += di; y += sj; }
      }
      prev = [i, j];
      pv = v;
    }
  };
  plot(-CAT_VIEW.x, CAT_VIEW.x, COLORS.trail, 1);
  if (Number.isFinite(f0)) plot(0, CAT_VIEW.x, COLORS.curve, 2);
  dot(COLORS.ink, sx(0) - 2, sy(0) - 2, 4);
  dot('#ffffff', sx(0) - 1, sy(0) - 1, 2);
}

// Baut die Liste einmal auf; danach aktualisiert jede Karte sich selbst
function buildCatalog() {
  ui.catalogList.replaceChildren(...CATALOG.map(item => {
    item.values = Object.fromEntries(item.params.map(p => [p.k, p.v]));

    const card = document.createElement('div');
    card.className = 'cat-item';
    card.innerHTML = `
      <div class="cat-head"><b></b><span class="cat-formula"></span></div>
      <canvas class="cat-graph"></canvas>
      <div class="cat-params"></div>
      <code class="cat-code"></code>
      <div class="cat-error"></div>
      <div class="cat-actions">
        <button type="button" class="btn btn-small" data-act="copy" title="Kopieren">${icon('copy')}</button>
        <button type="button" class="btn btn-small" data-act="use" title="Einsetzen">${icon('insert')}</button>
        <button type="button" class="btn btn-small btn-catfire" data-act="fire" title="Feuer">${icon('bolt')}</button>
      </div>`;
    card.querySelector('b').textContent = item.name;
    card.querySelector('.cat-formula').textContent = item.formula;
    const graph = card.querySelector('.cat-graph');
    const codeEl = card.querySelector('.cat-code');
    const errorEl = card.querySelector('.cat-error');
    const buttons = card.querySelectorAll('.cat-actions button');

    const refresh = () => {
      const code = catalogCode(item);
      const result = compileLatex(code);
      const curve = result.ok ? buildCurve(result.fn, state.player, null) : null;
      const error = !result.ok ? result.error : curve.error || '';
      codeEl.textContent = code;
      errorEl.textContent = error;
      buttons.forEach(b => { if (b.dataset.act !== 'copy') b.disabled = !!error; });
      drawCatalogGraph(graph, result);
    };

    const params = card.querySelector('.cat-params');
    for (const p of item.params) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'number';
      input.value = p.v;
      input.step = p.step;
      if (p.min !== undefined) input.min = p.min;
      if (p.max !== undefined) input.max = p.max;
      input.addEventListener('input', () => {
        let value = parseFloat(input.value.replace(',', '.'));
        if (!Number.isFinite(value)) return;
        if (p.min !== undefined) value = Math.max(p.min, value);
        if (p.max !== undefined) value = Math.min(p.max, value);
        item.values[p.k] = value;
        refresh();
      });
      label.append(p.k + ' =', input);
      params.append(label);
    }

    card.querySelector('.cat-actions').addEventListener('click', event => {
      const act = event.target.dataset.act;
      if (!act) return;
      const code = catalogCode(item);
      if (act === 'copy') {
        copyText(code).then(() => showMessage('Kopiert', 'good'), () => showMessage('Kopieren fehlgeschlagen', 'error'));
        return;
      }
      if (state.inputMode !== 'y') setInputMode('y');   // die Liste enthält normale Funktionen
      ui.input.value = code;
      updatePreview();
      if (act === 'fire') fire();
      else ui.input.focus();
    });

    item.refresh = refresh;
    return card;
  }));
}

// Graphen neu zeichnen, sobald die Liste sichtbar ist (vorher kennen die Canvas ihre Größe nicht)
function refreshCatalog() {
  for (const item of CATALOG) if (item.refresh) item.refresh();
}
