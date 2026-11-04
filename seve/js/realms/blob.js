// Sève — Les Chemins du Blob : Physarum polycephalum (modèle de Jones, 2010). Pas de cerveau, et pourtant il trouve.
import { TAU, clamp, lerp, glow, drawGlow, hexToRgb, makeCanvas, makeNoise, rng } from '../engine.js';

export const mood = {
  root: 98, scale: 'hirajoshi', wave: 'sine', chord: [0, 7, 12, 19], pad: 0.05, cutoff: 560, lfo: 0.09, droneOct: 1,
  noise: { type: 'lowpass', freq: 260, q: 0.8, gain: 0.014, gust: 0.7, gustRate: 0.3 },
};

const SA = 0.39, RA = 0.52, SO = 9, SS = 1, DEP = 1.8, FOOD = 2.4, DIFF = 0.35, DECAY = 0.9;
const STOPS = [[0, '#0a0805'], [0.25, '#3a2606'], [0.5, '#a8700f'], [0.78, '#f0bf3a'], [1, '#fff4b8']].map(([p, c]) => [p, hexToRgb(c)]);
// Villes autour de Tokyo (latitude, longitude) — à la manière de Tero et al., Science, 2010
const CITIES = [[35.68, 139.76, 2], [35.44, 139.64], [35.53, 139.7], [35.61, 140.12], [35.69, 139.98], [35.79, 139.9], [35.87, 139.97], [35.86, 140.03], [35.78, 140.32], [35.72, 140.22], [36.08, 140.11], [36.08, 140.2], [36.37, 140.47], [36.56, 139.88], [36.31, 139.8], [36.18, 139.71], [35.98, 139.75], [35.89, 139.79], [35.91, 139.62], [35.98, 139.59], [36.15, 139.39], [35.92, 139.49], [35.8, 139.47], [35.79, 139.26], [35.66, 139.32], [35.7, 139.41], [35.55, 139.45], [35.57, 139.37], [35.44, 139.36], [35.33, 139.35], [35.34, 139.49], [35.32, 139.55], [35.28, 139.67], [35.26, 139.15], [35.38, 139.92], [35.5, 140.12], [36.32, 139.0], [36.39, 139.06]];
const BAY = [[35.62, 139.78], [35.53, 139.78], [35.45, 139.68], [35.33, 139.69], [35.25, 139.74], [35.2, 139.8], [35.3, 139.83], [35.37, 139.88], [35.48, 140.02], [35.58, 140.07], [35.66, 140.0], [35.64, 139.9]];

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(61);
  const q = engine.quality;
  let W = api.W, H = api.H;
  let dx0 = 0, dy0 = 0, dw = 0, dh = 0, cs = 3, cols = 0, rows = 0;
  let T, T2, salt, maze, img, img32, off, octx, agar;
  let NA = 0, X, Y, A;
  const foods = [];
  let mode = 'libre', modeT = 0, labelTaps = [], stroke = null, light = null;
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const [p0, c0] = STOPS[k], [p1, c1] = STOPS[k + 1], u = clamp((t - p0) / (p1 - p0), 0, 1);
    lut[i] = (255 << 24) | (lerp(c0[2], c1[2], u) << 16) | (lerp(c0[1], c1[1], u) << 8) | lerp(c0[0], c1[0], u);
  }
  const COS = new Float32Array(1024), SIN = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { COS[i] = Math.cos((i / 1024) * TAU); SIN[i] = Math.sin((i / 1024) * TAU); }
  const ci = a => ((((a / TAU) * 1024) | 0) & 1023);

  function resize(w, h) {
    W = w; H = h;
    dx0 = Math.round(W * 0.05); dy0 = Math.round(Math.max(76, H * 0.11));
    dw = Math.round(W * 0.9); dh = Math.round(H - dy0 - Math.max(44, H * 0.07));
    cs = clamp(Math.round(Math.sqrt((dw * dh) / (90000 * q))), 2, 5);
    cols = Math.floor(dw / cs); rows = Math.floor(dh / cs);
    T = new Float32Array(cols * rows); T2 = new Float32Array(cols * rows);
    salt = new Float32Array(cols * rows); maze = new Uint8Array(cols * rows);
    off = makeCanvas(cols, rows); octx = off.getContext('2d');
    img = octx.createImageData(cols, rows); img32 = new Uint32Array(img.data.buffer);
    NA = Math.round(clamp(cols * rows * 0.22, 6000, 28000) * q);
    X = new Float32Array(NA); Y = new Float32Array(NA); A = new Float32Array(NA);
    scatter();
    // la gélose : un grain très doux
    agar = makeCanvas(dw, dh);
    const g = agar.getContext('2d');
    const im = g.createImageData(dw, dh);
    for (let i = 0; i < dw * dh; i++) { const v = (Math.random() * 10) | 0; im.data[i * 4] = 40 + v; im.data[i * 4 + 1] = 32 + v; im.data[i * 4 + 2] = 18; im.data[i * 4 + 3] = 22; }
    g.putImageData(im, 0, 0);
    foods.length = 0;
    seedFoods();
  }

  function scatter() {
    // le blob couvre d'abord toute la boîte, puis se retire vers ce qui le nourrit
    for (let i = 0; i < NA; i++) {
      X[i] = 2 + Math.random() * (cols - 4); Y[i] = 2 + Math.random() * (rows - 4); A[i] = Math.random() * TAU;
    }
  }
  function seedFoods() {
    const R = rng(8);
    for (let k = 0; k < 7; k++) foods.push({ gx: cols * (0.12 + R() * 0.76), gy: rows * (0.12 + R() * 0.76), r: 3, rot: R() * TAU });
  }
  const blocked = (x, y) => {
    if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) return true;
    const i = (y | 0) * cols + (x | 0);
    return salt[i] > 0 || maze[i] === 1;
  };
  const sense = (x, y) => {
    if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) return -1;
    const i = (y | 0) * cols + (x | 0);
    return salt[i] > 0 || maze[i] === 1 ? -5 : T[i];
  };

  function step() {
    const lx = light ? (light.x - dx0) / cs : 0, ly = light ? (light.y - dy0) / cs : 0, lr = 70 / cs;
    for (let i = 0; i < NA; i++) {
      const x = X[i], y = Y[i];
      let a = A[i];
      const f = sense(x + COS[ci(a)] * SO, y + SIN[ci(a)] * SO);
      const l = sense(x + COS[ci(a - SA)] * SO, y + SIN[ci(a - SA)] * SO);
      const r = sense(x + COS[ci(a + SA)] * SO, y + SIN[ci(a + SA)] * SO);
      if (f > l && f > r) { /* tout droit */ }
      else if (f < l && f < r) a += (Math.random() < 0.5 ? -1 : 1) * RA;
      else if (l > r) a -= RA;
      else if (r > l) a += RA;
      // la lumière fait fuir le blob (il est photophobe)
      if (light && Math.abs(x - lx) < lr && Math.abs(y - ly) < lr) a = Math.atan2(y - ly, x - lx) + (Math.random() - 0.5);
      const nx = x + COS[ci(a)] * SS, ny = y + SIN[ci(a)] * SS;
      if (blocked(nx, ny)) { A[i] = Math.random() * TAU; continue; }
      X[i] = nx; Y[i] = ny; A[i] = a;
      T[(ny | 0) * cols + (nx | 0)] += DEP;
      // le blob se retire de ce qui ne le nourrit pas : une part infime renaît sur l'avoine
      if (foods.length && Math.random() < 0.0018) {
        const fd = foods[(Math.random() * foods.length) | 0];
        X[i] = fd.gx + (Math.random() - 0.5) * 3; Y[i] = fd.gy + (Math.random() - 0.5) * 3; A[i] = Math.random() * TAU;
      }
    }
    for (const fd of foods) {
      const r = fd.r;
      for (let y = Math.max(1, (fd.gy - r) | 0); y <= Math.min(rows - 2, (fd.gy + r) | 0); y++)
        for (let x = Math.max(1, (fd.gx - r) | 0); x <= Math.min(cols - 2, (fd.gx + r) | 0); x++) T[y * cols + x] += FOOD;
    }
    // diffusion partielle (la trace garde son trait) et évaporation
    const w = cols;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const mean = (T[i - w - 1] + T[i - w] + T[i - w + 1] + T[i - 1] + T[i] + T[i + 1] + T[i + w - 1] + T[i + w] + T[i + w + 1]) / 9;
        T2[i] = (T[i] * (1 - DIFF) + mean * DIFF) * DECAY;
      }
    }
    const tmp = T; T = T2; T2 = tmp;
  }

  // ——— Tokyo, 2010 : l'avoine posée à la place des villes, la baie interdite
  function geoToGrid(lat, lon) {
    const lat0 = 35.15, lat1 = 36.62, lon0 = 138.95, lon1 = 140.55;
    const kmW = (lon1 - lon0) * 90, kmH = (lat1 - lat0) * 111;
    const sc = Math.min((cols * 0.94) / kmW, (rows * 0.94) / kmH);
    const ox = (cols - kmW * sc) / 2, oy = (rows - kmH * sc) / 2;
    return [ox + (lon - lon0) * 90 * sc, oy + (lat1 - lat) * 111 * sc];
  }
  function startTokyo() {
    mode = 'tokyo'; modeT = 0;
    maze.fill(0); salt.fill(0); T.fill(0);
    foods.length = 0;
    for (const [lat, lon, big] of CITIES) { const [gx, gy] = geoToGrid(lat, lon); foods.push({ gx, gy, r: big ? 5 : 2.2, rot: Math.random() * TAU }); }
    const poly = BAY.map(([la, lo]) => geoToGrid(la, lo));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (inPoly(x, y, poly)) maze[y * cols + x] = 1;
    const [tx, ty] = geoToGrid(35.68, 139.76);
    for (let i = 0; i < NA; i++) { const a = Math.random() * TAU, r = Math.random() * 6; X[i] = tx + Math.cos(a) * r; Y[i] = ty + Math.sin(a) * r; A[i] = Math.random() * TAU; }
    api.label('Tokyo, 2010');
    audio.note(0, { type: 'bell', vel: 0.15, dur: 3 });
  }
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // ——— Le labyrinthe de Nakagaki (2000)
  function startMaze() {
    mode = 'labyrinthe'; modeT = 0;
    maze.fill(0); salt.fill(0); T.fill(0);
    foods.length = 0;
    const mc = Math.max(7, Math.round(Math.min(cols, rows) / 9));
    const mw = Math.floor((cols - 2) / mc), mh = Math.floor((rows - 2) / mc);
    const ox = Math.floor((cols - mw * mc) / 2), oy = Math.floor((rows - mh * mc) / 2);
    // murs partout, puis on creuse au hasard (exploration en profondeur)
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const inX = x >= ox && x <= ox + mw * mc, inY = y >= oy && y <= oy + mh * mc;
      if (!inX || !inY) { maze[y * cols + x] = 1; continue; }
      if ((x - ox) % mc === 0 || (y - oy) % mc === 0) maze[y * cols + x] = 1;
    }
    const seen = new Uint8Array(mw * mh), stack = [[0, 0]];
    seen[0] = 1;
    const carve = (cx, cy, nx, ny) => {
      if (nx !== cx) { const x = ox + Math.max(cx, nx) * mc; for (let y = oy + cy * mc + 1; y < oy + (cy + 1) * mc; y++) maze[y * cols + x] = 0; }
      else { const y = oy + Math.max(cy, ny) * mc; for (let x = ox + cx * mc + 1; x < ox + (cx + 1) * mc; x++) maze[y * cols + x] = 0; }
    };
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [cx + a, cy + b]).filter(([x, y]) => x >= 0 && y >= 0 && x < mw && y < mh && !seen[y * mw + x]);
      if (!opts.length) { stack.pop(); continue; }
      const [nx, ny] = opts[(Math.random() * opts.length) | 0];
      carve(cx, cy, nx, ny);
      seen[ny * mw + nx] = 1;
      stack.push([nx, ny]);
    }
    foods.push({ gx: ox + mc / 2, gy: oy + mc / 2, r: 2.5, rot: 0 }, { gx: ox + (mw - 0.5) * mc, gy: oy + (mh - 0.5) * mc, r: 2.5, rot: 1 });
    // le blob remplit d'abord tout le labyrinthe
    for (let i = 0; i < NA; i++) {
      let x, y, g = 0;
      do { x = ox + 1 + Math.random() * (mw * mc - 2); y = oy + 1 + Math.random() * (mh * mc - 2); } while (maze[(y | 0) * cols + (x | 0)] && g++ < 20);
      X[i] = x; Y[i] = y; A[i] = Math.random() * TAU;
    }
    api.label('le labyrinthe');
    audio.note(2, { type: 'bell', vel: 0.15, dur: 3 });
  }

  resize(W, H);
  for (let k = 0; k < 60; k++) step();

  function update(dt, t) {
    modeT += dt;
    const n = q < 0.8 ? 1 : 2;
    for (let k = 0; k < n; k++) step();
    if (engine.frame % 30 === 0) for (let i = 0; i < salt.length; i++) if (salt[i] > 0) salt[i] = Math.max(0, salt[i] - 0.5);
    if (mode === 'tokyo' && modeT > 24) secrets.find('tokyo');
    if (mode === 'labyrinthe' && modeT > 30) secrets.find('labyrinthe');
    if (light && input.down) { light.x = input.x; light.y = input.y; }
  }

  function draw(ctx, t) {
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, W, H);
    // la trace devient couleur : un pouls lent la traverse (le « courant de navette »)
    // échelle logarithmique : les filaments fins restent visibles sans que les tubes saturent
    const pulse = 0.9 + 0.1 * Math.sin(t * 1.8);
    const k = (255 * pulse) / Math.log(1 + 40);
    for (let i = 0; i < T.length; i++) {
      const v = T[i];
      img32[i] = maze[i] ? 0xff2a2a30 : salt[i] > 0 ? 0xffcfd6dc : lut[v <= 0 ? 0 : Math.min(255, (Math.log(1 + v) * k) | 0)];
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    roundRect(ctx, dx0, dy0, cols * cs, rows * cs, 18);
    ctx.clip();
    ctx.drawImage(off, dx0, dy0, cols * cs, rows * cs);
    ctx.drawImage(agar, dx0, dy0);
    // flocons d'avoine
    for (const fd of foods) {
      const x = dx0 + fd.gx * cs, y = dy0 + fd.gy * cs, r = Math.max(5, fd.r * cs * 1.4);
      ctx.fillStyle = 'rgba(232,214,170,0.95)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, fd.rot, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(140,112,70,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (light) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([255, 250, 230], 64), light.x, light.y, 90, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // le bord de la boîte, son étiquette, et la carte pliée dans un coin
    ctx.strokeStyle = 'rgba(255,230,170,0.28)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, dx0, dy0, cols * cs, rows * cs, 18);
    ctx.stroke();
    ctx.font = '400 9.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,230,170,0.5)';
    ctx.fillText('PHYSARUM POLYCEPHALUM · BOÎTE N° 8', W / 2, dy0 - 10);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const mx = dx0 + cols * cs - 34, my = dy0 + rows * cs - 30;
    ctx.fillStyle = 'rgba(230,214,180,0.75)';
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 9, my - 3); ctx.lineTo(mx + 18, my); ctx.lineTo(mx + 27, my - 3); ctx.lineTo(mx + 27, my + 16); ctx.lineTo(mx + 18, my + 19); ctx.lineTo(mx + 9, my + 16); ctx.lineTo(mx, my + 19); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,70,0.9)';
    ctx.beginPath(); ctx.moveTo(mx + 9, my - 3); ctx.lineTo(mx + 9, my + 16); ctx.moveTo(mx + 18, my); ctx.lineTo(mx + 18, my + 19); ctx.stroke();
    if (stroke && stroke.salting) {
      ctx.fillStyle = 'rgba(240,245,250,0.6)';
      for (const [x, y] of stroke.pts.slice(-40)) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ——— Gestes
  const toGrid = (x, y) => [(x - dx0) / cs, (y - dy0) / cs];
  function tap(p) {
    const t = engine.t;
    if (p.y < dy0 && p.y > dy0 - 34 && Math.abs(p.x - W / 2) < 190) {
      labelTaps = labelTaps.filter(x => t - x < 3);
      labelTaps.push(t);
      audio.note(labelTaps.length * 2, { type: 'glass', vel: 0.1, dur: 2 });
      if (labelTaps.length >= 3) { labelTaps = []; startMaze(); }
      return;
    }
    const mx = dx0 + cols * cs - 34, my = dy0 + rows * cs - 30;
    if (p.x > mx - 12 && p.x < mx + 40 && p.y > my - 14 && p.y < my + 32) { startTokyo(); return; }
    const [gx, gy] = toGrid(p.x, p.y);
    if (gx < 2 || gy < 2 || gx > cols - 2 || gy > rows - 2) return;
    const near = foods.findIndex(fd => Math.hypot(fd.gx - gx, fd.gy - gy) < 14 / cs + 3);
    if (near >= 0) { foods.splice(near, 1); audio.note(-2, { type: 'pluck', vel: 0.15, dur: 1 }); return; }
    if (foods.length < 40) foods.push({ gx, gy, r: 2.6, rot: Math.random() * TAU });
    audio.note(Math.floor((1 - gy / rows) * 7) + 2, { type: 'pluck', vel: 0.18, dur: 1.3, pan: (p.x / W) * 2 - 1 });
  }
  function down(p) { stroke = { pts: [[p.x, p.y]], salting: false }; }
  function move(p) {
    if (!stroke || p.hover || light) return;
    const last = stroke.pts[stroke.pts.length - 1];
    if (Math.hypot(p.x - last[0], p.y - last[1]) < 3) return;
    stroke.pts.push([p.x, p.y]);
    if (stroke.pts.length > 3) {
      // un trait de sel : le blob le contourne, le temps qu'il se dissolve
      stroke.salting = true;
      const [gx, gy] = toGrid(p.x, p.y);
      for (let y = Math.max(1, (gy - 1.5) | 0); y <= Math.min(rows - 2, (gy + 1.5) | 0); y++)
        for (let x = Math.max(1, (gx - 1.5) | 0); x <= Math.min(cols - 2, (gx + 1.5) | 0); x++) salt[y * cols + x] = 30;
      if (Math.random() < 0.3) audio.noise({ freq: 6000, q: 1, dur: 0.06, vel: 0.03, type: 'highpass' });
    }
  }
  function up() { stroke = null; light = null; }
  function longpress(p) { light = { x: p.x, y: p.y }; audio.note(9, { type: 'soft', vel: 0.08, dur: 2 }); }

  return { resize, update, draw, tap, down, move, up, longpress, words: { tokyo: startTokyo }, destroy() {} };
}
