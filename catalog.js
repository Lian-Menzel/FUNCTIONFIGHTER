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

// a · rest als Eingabe-Text: 1·x = x, −1·x = -(x) (ein Minus direkt vor x hieße „nach links“)
function catCoef(a, rest) {
  if (a === 1) return rest;
  if (a === -1) return rest === 'x' ? '-(x)' : '-' + rest;
  return catNum(a) + rest;
}

// „+ b·rest“ bzw. „− b·rest“ als Anhang an einen Ausdruck
function catPlus(b, rest) {
  return (b < 0 ? '-' : '+') + catCoef(Math.abs(b), rest);
}

// Jeder Eintrag: Name, Formel mit Parametern, Parameter (Startwert, Schritt, Grenzen) und
// build(p) -> Eingabe-Text. Die Richtung (rechts/links) kommt für alle Einträge dazu.
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

// Eingabe-Text eines Eintrags (mit Richtung)
function catalogCode(item) {
  const code = item.build(item.values);
  return item.dir < 0 ? mirrorX(code) : code;
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

// Kleiner Graph: ganze Funktion blass, der Teil in Schussrichtung kräftig
function drawCatalogGraph(canvasEl, result) {
  const w = canvasEl.clientWidth || 170;
  const h = canvasEl.clientHeight || 96;
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = Math.round(w * dpr);
  canvasEl.height = Math.round(h * dpr);
  const g = canvasEl.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = COLORS.paper;
  g.fillRect(0, 0, w, h);
  const sx = u => (u + CAT_VIEW.x) / (2 * CAT_VIEW.x) * w;
  const sy = v => (CAT_VIEW.y - v) / (2 * CAT_VIEW.y) * h;

  g.strokeStyle = COLORS.grid;
  g.lineWidth = 1;
  for (let u = -CAT_VIEW.x; u <= CAT_VIEW.x; u += 2) { g.beginPath(); g.moveTo(sx(u), 0); g.lineTo(sx(u), h); g.stroke(); }
  for (let v = -CAT_VIEW.y; v <= CAT_VIEW.y; v += 2) { g.beginPath(); g.moveTo(0, sy(v)); g.lineTo(w, sy(v)); g.stroke(); }
  g.strokeStyle = COLORS.axes;
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, sy(0)); g.lineTo(w, sy(0)); g.moveTo(sx(0), 0); g.lineTo(sx(0), h); g.stroke();
  if (!result.ok) return;

  const f0 = result.fn(0);
  const plot = (from, to, color, width) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    let pen = false;
    let prev = null;
    const step = (to - from) / 300;
    for (let i = 0; i <= 300; i++) {
      const u = from + i * step;
      const v = result.fn(u) - f0;
      const ok = Number.isFinite(v) && Math.abs(v) < 1e3 && (prev === null || Math.abs(v - prev) < 4);
      if (ok && pen) g.lineTo(sx(u), sy(v));
      else if (ok) g.moveTo(sx(u), sy(v));
      pen = ok;
      prev = ok ? v : null;
    }
    g.stroke();
  };
  plot(-CAT_VIEW.x, CAT_VIEW.x, 'rgba(43, 40, 64, 0.25)', 1.5);
  if (Number.isFinite(f0)) plot(0, result.dir * CAT_VIEW.x, COLORS.curve, 3);
  g.fillStyle = COLORS.axes;
  g.fillRect(sx(0) - 3, sy(0) - 3, 6, 6);
}

// Baut die Liste einmal auf; danach aktualisiert jede Karte sich selbst
function buildCatalog() {
  ui.catalogList.replaceChildren(...CATALOG.map(item => {
    item.values = Object.fromEntries(item.params.map(p => [p.k, p.v]));
    item.dir = 1;

    const card = document.createElement('div');
    card.className = 'cat-item';
    card.innerHTML = `
      <div class="cat-head"><b></b><span class="cat-formula"></span></div>
      <canvas class="cat-graph"></canvas>
      <div class="cat-params"></div>
      <code class="cat-code"></code>
      <div class="cat-error"></div>
      <div class="cat-actions">
        <button type="button" class="btn btn-small" data-act="copy">Kopieren</button>
        <button type="button" class="btn btn-small" data-act="use">Einsetzen</button>
        <button type="button" class="btn btn-small btn-catfire" data-act="fire">Feuer!</button>
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
      const curve = result.ok ? buildCurve(result.fn, { x: 0, y: 0 }, null, result.dir) : null;
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
    const dir = document.createElement('select');
    dir.innerHTML = '<option value="1">→ rechts</option><option value="-1">← links</option>';
    dir.addEventListener('change', () => { item.dir = Number(dir.value); refresh(); });
    params.append(dir);

    card.querySelector('.cat-actions').addEventListener('click', event => {
      const act = event.target.dataset.act;
      if (!act) return;
      const code = catalogCode(item);
      if (act === 'copy') {
        copyText(code).then(() => showMessage(`„${code}“ kopiert.`, 'good'), () => showMessage('Kopieren hat nicht geklappt.', 'error'));
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
