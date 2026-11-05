// Sève — L'Atelier d'Alchimie : un automate de matière. Sable, eau, feu, graines… et ce qui naît de leurs rencontres.
import { TAU, clamp, glow, drawGlow, makeCanvas, hslToRgb, makeLayer, blit } from '../engine.js';
import { rle, unrle } from '../memory.js';

export const mood = {
  root: 130.81, scale: 'mixolydian', wave: 'triangle', chord: [0, 7, 10], pad: 0.045, cutoff: 900, lfo: 0.04,
  noise: { type: 'bandpass', freq: 1800, q: 0.7, gain: 0.005, gust: 0.9, gustRate: 0.4 },
};

const VIDE = 0, SABLE = 1, EAU = 2, PIERRE = 3, FEU = 4, VAPEUR = 5, PLANTE = 6, GRAINE = 7, LAVE = 8, GLACE = 9, OR = 10, FLEUR = 11;
const BASE = [null, [214, 180, 120], [58, 118, 220], [104, 102, 114], [255, 140, 40], [205, 214, 228], [64, 160, 78], [150, 108, 58], [255, 88, 28], [178, 224, 255], [255, 206, 72], [255, 120, 180]];
const TOOLS = [
  { id: SABLE, name: 'Sable', sym: '▽̶' }, { id: EAU, name: 'Eau', sym: '▽' }, { id: FEU, name: 'Feu', sym: '△' },
  { id: LAVE, name: 'Lave', sym: '◬' }, { id: GLACE, name: 'Glace', sym: '❄' }, { id: GRAINE, name: 'Graine', sym: '•' },
  { id: PIERRE, name: 'Pierre', sym: '■' }, { id: VIDE, name: 'Gomme', sym: '○' },
];

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const q = engine.quality;
  let W = api.W, H = api.H, cs = 4, cols = 0, rows = 0;
  let cell, shade, life, stamp, img, img32, off, octx, bg;
  let tool = SABLE, frameStamp = 1, lastHiss = 0, lastPour = 0, transmuted = 0;
  const glows = [], sparks = [], hot = [];

  // ——— La palette d'outils : des boutons posés sur le verre
  const bar = document.createElement('div');
  bar.className = 'alchemy-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Éléments');
  const style = document.createElement('style');
  style.textContent = `.alchemy-bar{position:absolute;left:50%;bottom:calc(40px + var(--sab));transform:translateX(-50%);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;width:min(900px,calc(100vw - 24px));pointer-events:auto}
.alchemy-bar button{display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(16,8,6,.62);color:#f3e6d6;font:400 9.5px/1 var(--mono);letter-spacing:2px;text-transform:uppercase;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.alchemy-bar button[aria-pressed=true]{border-color:var(--accent);background:rgba(60,22,14,.85)}
.alchemy-bar .dot{width:9px;height:9px;border-radius:50%}
@media(max-width:560px){.alchemy-bar button{padding:0 9px;letter-spacing:1px}}`;
  document.head.append(style);
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const c = t.id === VIDE ? [60, 50, 50] : BASE[t.id];
    dot.style.background = `rgb(${c.join(',')})`;
    b.append(dot, t.name);
    b.setAttribute('aria-pressed', String(t.id === tool));
    b.addEventListener('click', () => { tool = t.id; for (const x of bar.children) x.setAttribute('aria-pressed', String(x === b)); audio.note(TOOLS.indexOf(t), { type: 'glass', vel: 0.06, dur: 1 }); });
    bar.append(b);
  }
  document.getElementById('ui').append(bar);

  let F = 0; // rangée du sol : tout se passe au-dessus de la barre d'éléments
  function resize(w, h) {
    W = w; H = h;
    cs = clamp(Math.round(Math.sqrt((W * H) / (52000 * q))), 3, 7);
    const nc = Math.ceil(W / cs), nr = Math.ceil(H / cs);
    F = nr - Math.ceil((bar.offsetHeight + 52) / cs);
    const old = cell ? { cell, cols, rows } : null;
    cols = nc; rows = nr;
    cell = new Uint8Array(cols * rows); shade = new Uint8Array(cols * rows); life = new Uint8Array(cols * rows); stamp = new Uint8Array(cols * rows);
    for (let i = 0; i < shade.length; i++) shade[i] = (Math.random() * 255) | 0;
    if (old) {
      for (let y = 0; y < Math.min(rows, old.rows); y++) for (let x = 0; x < Math.min(cols, old.cols); x++) cell[y * cols + x] = old.cell[y * old.cols + x];
    } else buildScene();
    off = makeCanvas(cols, rows); octx = off.getContext('2d');
    img = octx.createImageData(cols, rows); img32 = new Uint32Array(img.data.buffer);
    bg = makeLayer(engine);
    const g = bg.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#140b08'); grd.addColorStop(1, '#050303');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // les quatre symboles des éléments, gravés dans le mur
    g.strokeStyle = 'rgba(255,200,150,0.05)'; g.lineWidth = 2;
    const r = Math.min(W, H) * 0.12;
    [[0.2, 0.3, 1, false], [0.8, 0.3, -1, false], [0.35, 0.62, 1, true], [0.65, 0.62, -1, true]].forEach(([x, y, up, bar2]) => {
      const cx = x * W, cy = y * H;
      g.beginPath(); g.moveTo(cx, cy - r * up); g.lineTo(cx + r * 0.87, cy + r * 0.5 * up); g.lineTo(cx - r * 0.87, cy + r * 0.5 * up); g.closePath(); g.stroke();
      if (bar2) { g.beginPath(); g.moveTo(cx - r * 0.5, cy); g.lineTo(cx + r * 0.5, cy); g.stroke(); }
    });
    g.beginPath(); g.arc(W / 2, H * 0.45, Math.min(W, H) * 0.34, 0, TAU); g.stroke();
  }

  // Un atelier déjà installé : des étagères de pierre, un tas de sable, un bassin, de la glace, une poche de lave, des graines
  function buildScene() {
    const put = (x0, y0, x1, y1, id) => {
      for (let y = Math.max(0, y0 | 0); y < Math.min(rows, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(cols, x1 | 0); x++) cell[y * cols + x] = id;
    };
    const C = cols, R = F;
    put(0, R - 3, C, rows, PIERRE);
    put(C * 0.08, R * 0.55, C * 0.38, R * 0.55 + 2, PIERRE);
    put(C * 0.6, R * 0.45, C * 0.92, R * 0.45 + 2, PIERRE);
    put(C * 0.6, R * 0.45 - 8, C * 0.6 + 2, R * 0.45, PIERRE);
    put(C * 0.92 - 2, R * 0.45 - 8, C * 0.92, R * 0.45, PIERRE);
    put(C * 0.6 + 2, R * 0.45 - 6, C * 0.92 - 2, R * 0.45, EAU);
    for (let x = C * 0.12; x < C * 0.34; x++) { const h = 10 * Math.sin(((x - C * 0.12) / (C * 0.22)) * Math.PI); put(x, R * 0.55 - h, x + 1, R * 0.55, SABLE); }
    put(C * 0.78, R * 0.18, C * 0.86, R * 0.18 + 6, GLACE);
    put(C * 0.04, R - 9, C * 0.16, R - 3, LAVE);
    put(C * 0.03, R - 11, C * 0.17, R - 9, PIERRE);
    for (let k = 0; k < 6; k++) put(C * (0.45 + k * 0.03), R - 4, C * (0.45 + k * 0.03) + 1, R - 3, GRAINE);
    put(C * 0.42, R - 6, C * 0.66, R - 3, SABLE);
  }
  resize(W, H);
  // l'atelier se souvient de ce que tu y as versé : la grille revient, recalée sur le sol si l'écran a changé
  {
    const saved = api.memory?.get('alchimie');
    if (saved && saved.runs && saved.cols > 0 && saved.rows > 0) {
      const old = unrle(saved.runs, new Uint8Array(saved.cols * saved.rows)), dy = F - saved.F;
      cell.fill(0);
      for (let y = 0; y < saved.rows; y++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let x = 0; x < Math.min(cols, saved.cols); x++) cell[ny * cols + x] = old[y * saved.cols + x];
      }
      for (let y = Math.max(0, F - 3); y < rows; y++) for (let x = 0; x < cols; x++) if (!cell[y * cols + x]) cell[y * cols + x] = PIERRE;
    }
  }
  function save() { api.memory?.set('alchimie', { cols, rows, F, runs: rle(cell) }); }

  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? PIERRE : cell[y * cols + x]);
  const isLiquid = id => id === EAU || id === LAVE;
  const isEmptyish = id => id === VIDE || id === VAPEUR;

  function swap(i, j) {
    const c = cell[i]; cell[i] = cell[j]; cell[j] = c;
    const l = life[i]; life[i] = life[j]; life[j] = l;
    const s = shade[i]; shade[i] = shade[j]; shade[j] = s;
    stamp[j] = frameStamp;
  }
  function set(i, id, l = 0) { cell[i] = id; life[i] = l; stamp[i] = frameStamp; }

  // Une génération de l'automate : on balaie de bas en haut, dans un sens puis dans l'autre
  function stepWorld() {
    frameStamp = frameStamp === 255 ? 1 : frameStamp + 1;
    const flip = frameStamp & 1;
    for (let y = rows - 1; y >= 0; y--) {
      for (let k = 0; k < cols; k++) {
        const x = flip ? k : cols - 1 - k;
        const i = y * cols + x;
        const id = cell[i];
        if (id === VIDE || id === PIERRE || stamp[i] === frameStamp) continue;
        const below = y + 1 < rows ? i + cols : -1;
        const dir = Math.random() < 0.5 ? -1 : 1;
        switch (id) {
          case SABLE: case GRAINE: case OR: {
            if (id === GRAINE && (at(x, y + 1) === EAU || at(x - 1, y) === EAU || at(x + 1, y) === EAU || at(x, y - 1) === EAU)) {
              // la graine boit : elle devient pousse
              for (const j of [i + cols, i - 1, i + 1, i - cols]) if (j >= 0 && j < cell.length && cell[j] === EAU) { cell[j] = VIDE; break; }
              set(i, PLANTE, 46);
              audio.note(5 + ((Math.random() * 5) | 0), { type: 'pluck', vel: 0.1, dur: 1.2 });
              break;
            }
            if (below < 0) break;
            const b = cell[below];
            if (isEmptyish(b) || isLiquid(b)) { swap(i, below); break; }
            const d1 = at(x + dir, y + 1), d2 = at(x - dir, y + 1);
            if (isEmptyish(d1) || isLiquid(d1)) swap(i, below + dir);
            else if (isEmptyish(d2) || isLiquid(d2)) swap(i, below - dir);
            break;
          }
          case EAU: {
            if (at(x, y - 1) === FEU || at(x, y + 1) === FEU || at(x - 1, y) === FEU || at(x + 1, y) === FEU) { set(i, VAPEUR, 60 + ((Math.random() * 80) | 0)); hiss(); break; }
            if (below >= 0 && isEmptyish(cell[below])) { swap(i, below); break; }
            if (below >= 0 && isEmptyish(at(x + dir, y + 1))) { swap(i, below + dir); break; }
            if (isEmptyish(at(x + dir, y))) { swap(i, i + dir); break; }
            if (isEmptyish(at(x - dir, y))) swap(i, i - dir);
            if (Math.random() < 0.0015 && (at(x - 1, y) === GLACE || at(x + 1, y) === GLACE || at(x, y - 1) === GLACE)) set(i, GLACE);
            break;
          }
          case LAVE: {
            for (const [nx, ny] of [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]]) {
              const n = at(nx, ny), j = ny * cols + nx;
              if (n === EAU) { set(j, VAPEUR, 90); set(i, PIERRE); hiss(); break; }
              if (n === GLACE) { set(j, EAU); if (Math.random() < 0.3) set(i, PIERRE); break; }
              if ((n === PLANTE || n === GRAINE || n === FLEUR) && Math.random() < 0.2) set(j, FEU, 30 + ((Math.random() * 40) | 0));
              if (n === VIDE && ny < y && Math.random() < 0.004) set(j, FEU, 20);
            }
            if (cell[i] !== LAVE || Math.random() < 0.5) break; // la lave est lente
            if (below >= 0 && isEmptyish(cell[below])) { swap(i, below); break; }
            if (Math.random() < 0.3 && isEmptyish(at(x + dir, y))) swap(i, i + dir);
            break;
          }
          case FEU: {
            if (life[i] <= 1) { set(i, Math.random() < 0.35 ? VAPEUR : VIDE, 40); break; }
            life[i]--;
            for (const [nx, ny] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]]) {
              const n = at(nx, ny), j = ny * cols + nx;
              if ((n === PLANTE || n === GRAINE || n === FLEUR) && Math.random() < 0.08) set(j, FEU, 40 + ((Math.random() * 40) | 0));
              if (n === GLACE && Math.random() < 0.1) set(j, EAU);
            }
            const up = y > 0 ? i - cols : -1;
            if (up >= 0 && Math.random() < 0.55) {
              const tgt = Math.random() < 0.5 ? up : up + dir;
              if (tgt >= 0 && tgt < cell.length && cell[tgt] === VIDE) swap(i, tgt);
            }
            break;
          }
          case VAPEUR: {
            if (life[i] <= 1 || (y < rows * 0.1 && Math.random() < 0.02)) { set(i, Math.random() < 0.4 ? EAU : VIDE); break; } // la pluie
            life[i]--;
            const up = y > 0 ? i - cols : -1;
            if (up >= 0 && Math.random() < 0.7) {
              const tgt = up + (Math.random() < 0.4 ? dir : 0);
              if (tgt >= 0 && cell[tgt] === VIDE) swap(i, tgt);
            } else if (isEmptyish(at(x + dir, y)) && at(x + dir, y) === VIDE) swap(i, i + dir);
            break;
          }
          case PLANTE: {
            // les pousses boivent l'eau voisine et grimpent en se ramifiant
            if (life[i] < 30) for (const j of [i - 1, i + 1, i + cols]) if (j >= 0 && j < cell.length && cell[j] === EAU) { cell[j] = VIDE; life[i] = Math.min(250, life[i] + 12); break; }
            if (life[i] > 1 && Math.random() < 0.09) {
              const opts = [[0, -1], [-1, -1], [1, -1], [0, -1]];
              const [ox, oy] = opts[(Math.random() * opts.length) | 0];
              if (at(x + ox, y + oy) === VIDE && at(x + ox, y + oy - 1) !== PLANTE) {
                const j = (y + oy) * cols + x + ox;
                set(j, PLANTE, life[i] - 1);
                if (Math.random() < 0.08) life[i] = Math.max(0, life[i] - 10); else life[i] = 0;
                if (Math.random() < 0.015) audio.note(6 + ((Math.random() * 6) | 0), { type: 'pluck', vel: 0.05, dur: 1 });
              }
            } else if (life[i] === 1 && at(x, y - 1) === VIDE) {
              // au bout de sa force, la pousse fleurit
              set(i - cols, FLEUR, 0);
              shade[i - cols] = (Math.random() * 255) | 0;
              life[i] = 0;
              audio.note(9, { type: 'bell', vel: 0.08, dur: 2 });
              secrets.find('fleur');
            }
            break;
          }
          case GLACE: {
            if (at(x, y + 1) === FEU || at(x, y - 1) === FEU || at(x - 1, y) === FEU || at(x + 1, y) === FEU) set(i, EAU);
            break;
          }
          default: break;
        }
      }
    }
  }
  function hiss() {
    if (engine.t - lastHiss < 0.12) return;
    lastHiss = engine.t;
    audio.noise({ freq: 5200, q: 0.8, dur: 0.35, vel: 0.05, type: 'highpass' });
  }

  // La pierre philosophale : terre, eau, feu et air réunis au même endroit
  function seekStone() {
    if (!hot.length) return;
    for (let k = 0; k < 60; k++) {
      const i = hot[(Math.random() * hot.length) | 0];
      if (cell[i] !== FEU && cell[i] !== LAVE) continue;
      const x = i % cols, y = (i / cols) | 0;
      let water = false, air = false, earth = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = at(x + dx, y + dy);
        if (n === EAU) water = true;
        else if (n === VAPEUR) air = true;
        else if (n === SABLE || (n === PIERRE && y + dy < F - 3)) earth = true;
      }
      if (water && air && earth) {
        for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || dx * dx + dy * dy > 49) continue;
          const j = yy * cols + xx;
          if (cell[j] === SABLE || (cell[j] === PIERRE && yy < F - 3)) set(j, OR);
        }
        for (let s = 0; s < 24; s++) { const a = Math.random() * TAU; sparks.push({ x: x * cs, y: y * cs, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, age: 0 }); }
        if (engine.t - transmuted > 3) { transmuted = engine.t; audio.chime(); }
        secrets.find('or');
        return;
      }
    }
  }

  function pour(px, py) {
    const gx = (px / cs) | 0, gy = (py / cs) | 0;
    const r = tool === PIERRE || tool === VIDE ? 3 : tool === GRAINE ? 1 : 2.5;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= F - 3) continue;
      const i = y * cols + x;
      if (tool === VIDE) { cell[i] = VIDE; continue; }
      if (tool !== PIERRE && Math.random() > (tool === GRAINE ? 0.25 : 0.55)) continue;
      if (cell[i] !== VIDE && tool !== PIERRE) continue;
      cell[i] = tool;
      life[i] = tool === FEU ? 40 + ((Math.random() * 50) | 0) : tool === VAPEUR ? 80 : 0;
      shade[i] = (Math.random() * 255) | 0;
    }
    if (engine.t - lastPour > 0.07) {
      lastPour = engine.t;
      const f = { [SABLE]: [3200, 'bandpass'], [EAU]: [700, 'lowpass'], [FEU]: [2400, 'highpass'], [LAVE]: [300, 'lowpass'], [GLACE]: [6000, 'highpass'], [GRAINE]: [1800, 'bandpass'], [PIERRE]: [500, 'bandpass'], [VIDE]: [1200, 'bandpass'] }[tool];
      audio.noise({ freq: f[0], q: 1.2, dur: 0.09, vel: 0.035, type: f[1], pan: (px / W) * 2 - 1 });
    }
  }

  function update(dt, t) {
    if (input.down && input.pointers.size) for (const p of input.pointers.values()) pour(p.x, p.y);
    stepWorld();
    if (q > 0.75) stepWorld();
    if (engine.frame % 8 === 0) seekStone();
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.94; s.vy *= 0.94; if (s.age > 1.2) sparks.splice(i, 1); }
  }

  function draw(ctx, t) {
    blit(ctx, bg);
    glows.length = 0;
    hot.length = 0;
    const fl = (Math.sin(t * 9) + 1) * 0.5;
    const floorStart = (F - 1) * cols;
    for (let i = 0; i < cell.length; i++) {
      const id = cell[i];
      if (id === VIDE) { img32[i] = 0; continue; }
      if (id === FEU || id === LAVE) hot.push(i);
      const v = (0.86 + (shade[i] / 255) * 0.28) * (i >= floorStart ? 0.38 : 1); // le socle, sous la barre, reste dans l'ombre
      let c = BASE[id], a = 255;
      if (id === FEU) { const k = Math.random(); c = [255, 120 + k * 120, 30 + k * 60]; if ((i & 7) === 0) glows.push(i); }
      else if (id === LAVE) { c = [255, 70 + fl * 50 * (shade[i] / 255), 20]; if ((i & 15) === 0) glows.push(i); }
      else if (id === VAPEUR) a = 70 + (life[i] & 63);
      else if (id === EAU) { const x = i % cols; c = [58, 118 + Math.sin(t * 2 + x * 0.3) * 10, 220]; a = 220; }
      else if (id === FLEUR) c = hslToRgb((shade[i] / 255) * 360, 85, 70);
      else if (id === OR) { const s = Math.sin(t * 4 + shade[i]) > 0.95 ? 1.3 : 1; c = [255 * s, 206 * s, 72]; }
      img32[i] = (a << 24) | (Math.min(255, c[2] * v) << 16) | (Math.min(255, c[1] * v) << 8) | Math.min(255, c[0] * v);
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, cols * cs, rows * cs);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    const fs = glow([255, 140, 50], 32);
    for (const i of glows) drawGlow(ctx, fs, (i % cols) * cs, ((i / cols) | 0) * cs, cs * 6, 0.18);
    const gs = glow([255, 220, 120], 16);
    for (const s of sparks) drawGlow(ctx, gs, s.x, s.y, 6, 1 - s.age / 1.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // clavier : 1 à 8 pour choisir l'élément
  function key(e) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= TOOLS.length) bar.children[n - 1].click();
  }

  return {
    resize, update, draw, key, save,
    destroy() { bar.remove(); style.remove(); },
  };
}
