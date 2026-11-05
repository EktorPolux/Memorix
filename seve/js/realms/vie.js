// Sève — La Cité de Conway : naître avec trois voisins, survivre avec deux ou trois (Conway, 1970).
// Une tête de lecture balaie la cité : chaque colonne vivante devient un accord.
import { clamp, glow, drawGlow, makeCanvas, makeLayer, blit } from '../engine.js';
import { rle, unrle } from '../memory.js';

export const mood = { root: 196, scale: 'majPenta', wave: 'sine', chord: [0, 7, 12], pad: 0.03, cutoff: 900, lfo: 0.03, motif: false };

const RULES = [
  { name: 'Conway', code: 'B3/S23', b: [3], s: [2, 3] },
  { name: 'HighLife', code: 'B36/S23', b: [3, 6], s: [2, 3] },
  { name: 'Jour & Nuit', code: 'B3678/S34678', b: [3, 6, 7, 8], s: [3, 4, 6, 7, 8] },
  { name: 'Graines', code: 'B2/S', b: [2], s: [] },
  { name: 'Labyrinthe', code: 'B3/S12345', b: [3], s: [1, 2, 3, 4, 5] },
];
const parse = rows => { const out = []; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'O') out.push([x, y]); })); return out; };
const PATTERNS = {
  planeur: parse(['.O.', '..O', 'OOO']),
  vaisseau: parse(['.O..O', 'O....', 'O...O', 'OOOO.']),
  pulsar: parse(['..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............', '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..']),
  canon: parse([
    '........................O...........',
    '......................O.O...........',
    '............OO......OO............OO',
    '...........O...O....OO............OO',
    'OO........O.....O...OO..............',
    'OO........O...O.OO....O.O...........',
    '..........O.....O.......O...........',
    '...........O...O....................',
    '............OO......................',
  ]),
  rpento: parse(['.OO', 'OO.', '.O.']),
};
const LABELS = { planeur: 'Planeur', vaisseau: 'Vaisseau', pulsar: 'Pulsar', canon: 'Canon de Gosper', rpento: 'R-pentomino' };
const SHORT = { canon: 'Canon' }; // sur le bouton, le nom court suffit

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const q = engine.quality;
  let W = api.W, H = api.H, cs = 7, cols = 0, rows = 0;
  let cur, nxt, age, trail, img, b32, off, octx, half, hctx, grid = null;
  let rule = 0, gen = 0, acc = 0, sps = 11, paused = false, armed = null, rpento = -1, lastLabel = 0;
  let head = 0, headAcc = 0, lastCell = null;
  const flashes = [];

  // ——— La barre : jouer/pause, motifs à poser, hasard, effacer
  const bar = document.createElement('div');
  bar.className = 'realm-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Cité de Conway');
  const mk = (label, aria, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.addEventListener('click', () => fn(b)); bar.append(b); return b; };
  const playBtn = mk('Pause', 'Mettre en pause', () => { paused = !paused; playBtn.textContent = paused ? 'Jouer' : 'Pause'; playBtn.setAttribute('aria-label', paused ? 'Reprendre' : 'Mettre en pause'); });
  const patBtns = {};
  for (const k of Object.keys(PATTERNS)) {
    patBtns[k] = mk(SHORT[k] || LABELS[k], `Poser un ${LABELS[k]}`, () => {
      armed = armed === k ? null : k;
      for (const [kk, b] of Object.entries(patBtns)) b.setAttribute('aria-pressed', String(kk === armed));
    });
    patBtns[k].setAttribute('aria-pressed', 'false');
  }
  mk('Hasard', 'Semer au hasard', () => soup(0.3));
  mk('Effacer', 'Effacer la cité', () => { cur.fill(0); age.fill(0); rpento = -1; });
  document.getElementById('ui').append(bar);

  function resize(w, h) {
    W = w; H = h;
    cs = clamp(Math.round(Math.sqrt((W * H) / (24000 * q))), 5, 11);
    const nc = Math.ceil(W / cs), nr = Math.ceil(H / cs);
    const old = cur ? { cur, cols, rows } : null;
    cols = nc; rows = nr;
    cur = new Uint8Array(cols * rows); nxt = new Uint8Array(cols * rows); age = new Uint16Array(cols * rows); trail = new Float32Array(cols * rows);
    if (old) for (let y = 0; y < Math.min(rows, old.rows); y++) for (let x = 0; x < Math.min(cols, old.cols); x++) cur[y * cols + x] = old.cur[y * old.cols + x];
    off = makeCanvas(cols, rows); octx = off.getContext('2d');
    img = octx.createImageData(cols, rows); b32 = new Uint32Array(img.data.buffer);
    half = makeCanvas(Math.ceil(cols / 2), Math.ceil(rows / 2)); hctx = half.getContext('2d');
    // le plan de la cité : une grille très fine
    grid = makeLayer(engine);
    const g = grid.getContext('2d');
    g.fillStyle = '#04060c'; g.fillRect(0, 0, W, H);
    if (cs >= 6) {
      g.strokeStyle = 'rgba(120,160,255,0.045)'; g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= cols; x++) { g.moveTo(x * cs + 0.5, 0); g.lineTo(x * cs + 0.5, H); }
      for (let y = 0; y <= rows; y++) { g.moveTo(0, y * cs + 0.5); g.lineTo(W, y * cs + 0.5); }
      g.stroke();
    }
  }
  resize(W, H);

  function soup(p) {
    const x0 = Math.floor(cols * 0.2), x1 = Math.floor(cols * 0.8), y0 = Math.floor(rows * 0.2), y1 = Math.floor(rows * 0.8);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Math.random() < p) { cur[y * cols + x] = 1; age[y * cols + x] = 1; }
  }
  function stamp(name, cx, cy) {
    const pts = PATTERNS[name];
    let mw = 0, mh = 0;
    for (const [x, y] of pts) { mw = Math.max(mw, x); mh = Math.max(mh, y); }
    for (const [x, y] of pts) {
      const gx = ((cx - (mw >> 1) + x) % cols + cols) % cols, gy = ((cy - (mh >> 1) + y) % rows + rows) % rows;
      cur[gy * cols + gx] = 1; age[gy * cols + gx] = 1;
    }
    flashes.push({ x: cx * cs, y: cy * cs, t: 0 });
    if (name === 'canon') secrets.find('gosper');
    if (name === 'rpento') rpento = gen;
    audio.note(5 + Object.keys(PATTERNS).indexOf(name), { type: 'bell', vel: 0.1, dur: 2 });
  }
  // la cité se souvient : ses vivants, sa règle et son âge reviennent tels que tu les avais laissés
  const saved = api.memory?.get('vie');
  if (saved && saved.runs && saved.cols > 0 && saved.rows > 0) {
    const old = unrle(saved.runs, new Uint8Array(saved.cols * saved.rows));
    for (let y = 0; y < Math.min(rows, saved.rows); y++) for (let x = 0; x < Math.min(cols, saved.cols); x++) { const v = old[y * saved.cols + x] ? 1 : 0; cur[y * cols + x] = v; age[y * cols + x] = v; }
    rule = (saved.rule | 0) % RULES.length;
    gen = saved.gen | 0;
  } else {
    soup(0.28);
    stamp('planeur', 6, 6);
  }
  function save() { api.memory?.set('vie', { cols, rows, rule, gen, runs: rle(cur) }); }

  // ——— Une génération, sur un tore : le bord droit touche le bord gauche
  function step() {
    const { b, s } = RULES[rule];
    const born = new Uint8Array(9), keep = new Uint8Array(9);
    for (const n of b) born[n] = 1;
    for (const n of s) keep[n] = 1;
    for (let y = 0; y < rows; y++) {
      const ym = ((y - 1 + rows) % rows) * cols, y0 = y * cols, yp = ((y + 1) % rows) * cols;
      for (let x = 0; x < cols; x++) {
        const xm = x === 0 ? cols - 1 : x - 1, xp = x === cols - 1 ? 0 : x + 1;
        const n = cur[ym + xm] + cur[ym + x] + cur[ym + xp] + cur[y0 + xm] + cur[y0 + xp] + cur[yp + xm] + cur[yp + x] + cur[yp + xp];
        const i = y0 + x;
        const alive = cur[i] ? keep[n] : born[n];
        nxt[i] = alive;
        if (alive) age[i] = Math.min(65000, age[i] + 1);
        else { if (cur[i]) trail[i] = 1; age[i] = 0; }
      }
    }
    const t = cur; cur = nxt; nxt = t;
    gen++;
    if (rpento >= 0 && gen - rpento >= 1103) { rpento = -1; secrets.find('mathusalem'); }
  }

  function update(dt, t) {
    if (!paused) {
      acc += dt * sps;
      let n = 0;
      while (acc >= 1 && n < 4) { step(); acc -= 1; n++; }
    }
    for (let i = 0; i < trail.length; i++) if (trail[i] > 0) trail[i] = Math.max(0, trail[i] - dt * 1.5);
    // la tête de lecture : une note par colonne vivante (la plus haute), un accord toutes les quatre
    headAcc += dt * 6;
    while (headAcc >= 1) {
      headAcc -= 1;
      head = (head + 1) % cols;
      const ys = [];
      const want = head % 4 === 0 ? 2 : 1;
      for (let y = 0; y < rows && ys.length < want; y++) if (cur[y * cols + head] && (!ys.length || y - ys[ys.length - 1] > rows / 8)) ys.push(y);
      ys.forEach((y, k) => audio.note(Math.floor(((rows - 1 - y) / rows) * 14), { type: k ? 'glass' : 'pluck', vel: 0.05, dur: 1.1, pan: (head / cols) * 2 - 1, send: 0.35, delay: 0.08, at: k * 0.03 }));
    }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 1) flashes.splice(i, 1); }
    if (t - lastLabel > 0.5) {
      lastLabel = t;
      let pop = 0;
      for (let i = 0; i < cur.length; i++) pop += cur[i];
      api.label(rpento >= 0 ? `R-pentomino · génération ${gen - rpento} / 1103` : `génération ${gen} · ${pop.toLocaleString('fr-FR')} vivants`);
    }
  }

  function draw(ctx, t) {
    blit(ctx, grid);
    // l'âge colore les quartiers : les nouveaux-nés brillent, les anciens bleuissent ; les morts laissent une braise
    for (let i = 0; i < cur.length; i++) {
      if (cur[i]) {
        const a = age[i];
        let r, g, b;
        if (a <= 1) { r = 255; g = 252; b = 230; }
        else if (a < 8) { const k = (a - 1) / 7; r = 255 - k * 175; g = 250 - k * 20; b = 230; }
        else { const k = Math.min(1, (a - 8) / 60); r = 80 - k * 30; g = 230 - k * 130; b = 230 + k * 25; }
        b32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
      } else if (trail[i] > 0) {
        const k = trail[i];
        b32[i] = ((k * k * 120) << 24) | (70 << 16) | ((90 * k + 40) << 8) | 230;
      } else b32[i] = 0;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, cols * cs, rows * cs);
    // un halo : la même image, réduite puis agrandie
    hctx.clearRect(0, 0, half.width, half.height);
    hctx.imageSmoothingEnabled = true;
    hctx.drawImage(off, 0, 0, half.width, half.height);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42;
    ctx.drawImage(half, 0, 0, cols * cs, rows * cs);
    ctx.globalAlpha = 1;
    // la tête de lecture
    const hg = ctx.createLinearGradient(head * cs - 30, 0, head * cs + cs, 0);
    hg.addColorStop(0, 'rgba(255,214,140,0)');
    hg.addColorStop(1, 'rgba(255,214,140,0.16)');
    ctx.fillStyle = hg;
    ctx.fillRect(head * cs - 30, 0, 30 + cs, H);
    for (const f of flashes) drawGlow(ctx, glow([255, 236, 190], 32), f.x, f.y, 40 + f.t * 80, 1 - f.t);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // la règle en vigueur : on peut la toucher pour en changer
    const R = RULES[rule];
    ctx.font = '400 10px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,236,200,0.75)';
    ctx.fillText(`${R.code} · ${R.name.toUpperCase()}`, W / 2, 74);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // aperçu du motif à poser, sous la souris
    if (armed && input.inside && input.type === 'mouse') {
      const cx = Math.floor(input.x / cs), cy = Math.floor(input.y / cs);
      const pts = PATTERNS[armed];
      let mw = 0, mh = 0;
      for (const [x, y] of pts) { mw = Math.max(mw, x); mh = Math.max(mh, y); }
      ctx.fillStyle = 'rgba(255,214,140,0.45)';
      for (const [x, y] of pts) ctx.fillRect((cx - (mw >> 1) + x) * cs, (cy - (mh >> 1) + y) * cs, cs - 1, cs - 1);
    }
  }

  // ——— Gestes : dessiner des vivants, poser un motif, changer de règle
  const cellAt = (x, y) => [clamp(Math.floor(x / cs), 0, cols - 1), clamp(Math.floor(y / cs), 0, rows - 1)];
  function paint(x, y) { const [cx, cy] = cellAt(x, y); cur[cy * cols + cx] = 1; age[cy * cols + cx] = 1; }
  function down(p) {
    if (p.y < 100 && Math.abs(p.x - W / 2) < 160) return;
    if (armed) return;
    lastCell = [p.x, p.y];
    paint(p.x, p.y);
  }
  function move(p) {
    if (!lastCell || p.hover) return;
    const [lx, ly] = lastCell, d = Math.hypot(p.x - lx, p.y - ly), n = Math.ceil(d / (cs * 0.6));
    for (let k = 1; k <= n; k++) paint(lx + ((p.x - lx) * k) / n, ly + ((p.y - ly) * k) / n);
    lastCell = [p.x, p.y];
  }
  function up() { lastCell = null; }
  function tap(p) {
    if (p.y < 100 && Math.abs(p.x - W / 2) < 160) {
      rule = (rule + 1) % RULES.length;
      audio.note(rule * 2, { type: 'glass', vel: 0.1, dur: 2 });
      if (RULES[rule].name === 'HighLife') secrets.find('highlife');
      return;
    }
    if (armed) { const [cx, cy] = cellAt(p.x, p.y); stamp(armed, cx, cy); }
  }

  return {
    resize, update, draw, down, move, up, tap, save,
    words: { conway: () => stamp('canon', Math.floor(cols / 2), Math.floor(rows / 2)) },
    destroy() { bar.remove(); },
  };
}
