// Sève — Le Marais de Turing : deux substances qui se poursuivent (Gray-Scott), et la matière se met à dessiner.
import { TAU, clamp, lerp, glow, drawGlow, hexToRgb, makeCanvas, makeNoise } from '../engine.js';

export const mood = {
  root: 123.47, scale: 'hirajoshi', wave: 'sine', chord: [0, 7, 15], pad: 0.05, cutoff: 600, lfo: 0.03,
  noise: { type: 'bandpass', freq: 700, q: 1.2, gain: 0.011, gust: 0.9, gustRate: 0.13 },
};

// Régimes de Pearson (1993) : chaque couple (f, k) est une façon d'être vivant
const REGIMES = [
  { g: 'κ', name: 'la mitose', f: 0.0367, k: 0.0649 },
  { g: 'λ', name: 'le corail', f: 0.0545, k: 0.062 },
  { g: 'θ', name: 'les empreintes', f: 0.04, k: 0.06 },
  { g: 'μ', name: 'les bulles', f: 0.039, k: 0.058 },
  { g: 'ε', name: 'les ondes', f: 0.018, k: 0.051 },
];
const OMEGA = { g: 'Ω', name: "l'hésitation", f: 0.026, k: 0.055 };
const DA = 0.2, DB = 0.1;
const REGIME_LEN = 34;
const STOPS = [[0, '#030b10'], [0.22, '#0f3a3c'], [0.45, '#2f8a78'], [0.68, '#a9d8b8'], [0.86, '#f3e7c9'], [1, '#ffd27a']].map(([p, c]) => [p, hexToRgb(c)]);

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(17);
  const q = engine.quality;
  let W = api.W, H = api.H;
  let cs = 4, cols = 0, rows = 0, A, B, A2, B2, img, img32, off, octx;
  let reg = 0, regT = 0, from = REGIMES[0], to = REGIMES[0], F = to.f, Kk = to.k, mix = 1, omegaUntil = -1;
  let stepsPF = 6, labelTaps = [], stroke = null, lastBubble = 0;
  const wisps = [], sparks = [];
  // palette : de l'eau noire à l'ivoire, avec un liseré d'or
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const [p0, c0] = STOPS[k], [p1, c1] = STOPS[k + 1];
    const u = clamp((t - p0) / (p1 - p0), 0, 1);
    const r = lerp(c0[0], c1[0], u), g = lerp(c0[1], c1[1], u), b = lerp(c0[2], c1[2], u);
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }

  function resize(w, h) {
    W = w; H = h;
    cs = clamp(Math.round(Math.sqrt((W * H) / (68000 * q))), 3, 6);
    const nc = Math.ceil(W / cs) + 2, nr = Math.ceil(H / cs) + 2;
    const old = A ? { A, B, cols, rows } : null;
    cols = nc; rows = nr;
    A = new Float32Array(cols * rows).fill(1); B = new Float32Array(cols * rows);
    A2 = new Float32Array(cols * rows).fill(1); B2 = new Float32Array(cols * rows);
    if (old) {
      // on garde la matière en la recadrant
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = Math.floor((x / cols) * old.cols), oy = Math.floor((y / rows) * old.rows);
        A[y * cols + x] = old.A[oy * old.cols + ox]; B[y * cols + x] = old.B[oy * old.cols + ox];
      }
    } else seedRandom(26);
    off = makeCanvas(cols, rows);
    octx = off.getContext('2d');
    img = octx.createImageData(cols, rows);
    img32 = new Uint32Array(img.data.buffer);
  }

  function seedRandom(n) {
    for (let b = 0; b < n; b++) {
      const x = 3 + ((Math.random() * (cols - 6)) | 0), y = 3 + ((Math.random() * (rows - 6)) | 0);
      paintCell(x, y, 2 + Math.random() * 3);
    }
  }
  function paintCell(gx, gy, r) {
    const R2 = r * r;
    for (let y = Math.max(1, Math.floor(gy - r)); y <= Math.min(rows - 2, Math.ceil(gy + r)); y++) {
      for (let x = Math.max(1, Math.floor(gx - r)); x <= Math.min(cols - 2, Math.ceil(gx + r)); x++) {
        const d2 = (x - gx) * (x - gx) + (y - gy) * (y - gy);
        if (d2 > R2) continue;
        const i = y * cols + x;
        B[i] = Math.max(B[i], 0.9 * (1 - d2 / R2) + 0.1);
        A[i] = Math.min(A[i], 0.35);
      }
    }
  }
  function paintAt(px, py, r) { paintCell(px / cs + 1, py / cs + 1, r); }

  // Bords périodiques : les cellules fantômes recopient le bord opposé, la matière se referme sur elle-même
  function wrapEdges(arr) {
    const w = cols, h = rows;
    for (let y = 1; y < h - 1; y++) { arr[y * w] = arr[y * w + w - 2]; arr[y * w + w - 1] = arr[y * w + 1]; }
    for (let x = 0; x < w; x++) { arr[x] = arr[(h - 2) * w + x]; arr[(h - 1) * w + x] = arr[w + x]; }
  }

  // Une étape de Gray-Scott (laplacien à cinq points)
  function step() {
    wrapEdges(A);
    wrapEdges(B);
    const w = cols, f = F, kf = Kk + F;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const a = A[i], b = B[i];
        const la = A[i - 1] + A[i + 1] + A[i - w] + A[i + w] - 4 * a;
        const lb = B[i - 1] + B[i + 1] + B[i - w] + B[i + w] - 4 * b;
        const abb = a * b * b;
        A2[i] = a + DA * la - abb + f * (1 - a);
        B2[i] = b + DB * lb + abb - kf * b;
      }
    }
    let t = A; A = A2; A2 = t;
    t = B; B = B2; B2 = t;
  }

  resize(W, H);
  for (let i = 0; i < 4; i++) wisps.push({ x: Math.random() * W, y: Math.random() * H, sd: Math.random() * 100, flick: Math.random() * TAU });
  for (let k = 0; k < 420; k++) step();

  function setRegime(r, fast = false) {
    from = { f: F, k: Kk };
    to = r;
    mix = fast ? 0.6 : 0;
    regT = 0;
    api.label(`Régime ${r.g} · ${r.name}`);
    [0, 2, 4].forEach((d, k) => audio.note(d + (r === OMEGA ? 1 : 0), { type: 'soft', vel: 0.08, dur: 4.5, at: k * 0.2, send: 0.7 }));
  }
  setRegime(REGIMES[0], true);

  function update(dt, t) {
    regT += dt;
    if (omegaUntil > 0 && t > omegaUntil) { omegaUntil = -1; reg = (reg + 1) % REGIMES.length; setRegime(REGIMES[reg]); }
    else if (omegaUntil < 0 && regT > REGIME_LEN) { reg = (reg + 1) % REGIMES.length; setRegime(REGIMES[reg]); }
    if (mix < 1) {
      mix = Math.min(1, mix + dt / 8);
      const m = mix * mix * (3 - 2 * mix);
      F = lerp(from.f, to.f, m);
      Kk = lerp(from.k, to.k, m);
    }
    // les feux follets écrivent la chimie en passant
    for (const w of wisps) {
      const a = noise.n3(w.x * 0.002, w.y * 0.002, t * 0.06 + w.sd) * TAU * 1.5;
      w.x += Math.cos(a) * 34 * dt;
      w.y += Math.sin(a) * 34 * dt;
      if (w.x < 0) w.x += W; if (w.x > W) w.x -= W;
      if (w.y < 0) w.y += H; if (w.y > H) w.y -= H;
      if (Math.random() < dt * 6) paintAt(w.x, w.y, 1.6);
    }
    // si la matière s'éteint, une pluie de spores la ranime
    if (engine.frame % 90 === 0) {
      let sum = 0;
      for (let i = 0; i < B.length; i += 37) sum += B[i];
      if (sum / (B.length / 37) < 0.02) seedRandom(10);
    }
    // autant d'étapes que le temps le permet
    const t0 = performance.now();
    for (let k = 0; k < stepsPF; k++) step();
    const ms = (performance.now() - t0) / stepsPF;
    stepsPF = clamp(Math.round(9 / Math.max(ms, 0.05)), 2, 12);
    for (let i = sparks.length - 1; i >= 0; i--) { sparks[i].age += dt; if (sparks[i].age > 1) sparks.splice(i, 1); }
  }

  function draw(ctx, t) {
    // matière éclairée en relief : la pente de B donne la lumière
    const w = cols;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const b = B[i];
        const nx = B[i - 1] - B[i + 1], ny = B[i - w] - B[i + w];
        const shade = clamp(0.82 + (nx + ny) * 2.6, 0.45, 1.5);
        const c = lut[clamp((b * 3.1 * 255) | 0, 0, 255)];
        let r = (c & 255) * shade, g = ((c >> 8) & 255) * shade, bl = ((c >> 16) & 255) * shade;
        if (shade > 1.22) { const s = (shade - 1.22) * 260; r += s; g += s; bl += s * 0.9; }
        img32[i] = (255 << 24) | (Math.min(255, bl) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 1, 1, cols - 2, rows - 2, 0, 0, (cols - 2) * cs, (rows - 2) * cs);

    // brume et roseaux au bord de l'eau
    const fog = ctx.createLinearGradient(0, H * 0.7, 0, H);
    fog.addColorStop(0, 'rgba(10,30,32,0)');
    fog.addColorStop(1, 'rgba(10,30,32,0.55)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
    drawReeds(ctx, t);

    ctx.globalCompositeOperation = 'lighter';
    for (const wp of wisps) {
      const fl = 0.6 + 0.4 * Math.sin(t * 7 + wp.flick) * Math.sin(t * 3.3 + wp.sd);
      drawGlow(ctx, glow([200, 255, 190], 32), wp.x, wp.y, 30, 0.35 * fl);
      drawGlow(ctx, glow([255, 250, 220], 12), wp.x, wp.y, 5, 0.9);
    }
    for (const s of sparks) drawGlow(ctx, glow([255, 236, 180], 16), s.x, s.y, 20 * (1 - s.age), 0.6 * (1 - s.age));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // le régime courant, écrit au-dessus du marais
    ctx.font = '400 10px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const r = to;
    ctx.fillStyle = 'rgba(243,231,201,0.7)';
    ctx.fillText(`RÉGIME ${r.g} — ${r.name.toUpperCase()}`, W / 2, 74);
    ctx.fillStyle = 'rgba(243,231,201,0.4)';
    ctx.fillText(`f = ${F.toFixed(4)}   k = ${Kk.toFixed(4)}`, W / 2, 92);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (stroke && stroke.pts.length > 1) {
      ctx.strokeStyle = 'rgba(255,240,200,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      stroke.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  function drawReeds(ctx, t) {
    ctx.strokeStyle = 'rgba(2,8,10,0.92)';
    ctx.fillStyle = 'rgba(2,8,10,0.92)';
    ctx.lineCap = 'round';
    const n = Math.round(W / 22);
    for (let i = 0; i < n; i++) {
      const x = ((i * 97.3) % W) + Math.sin(i * 3.1) * 8;
      const h = 30 + ((i * 53) % 70);
      const sw = Math.sin(t * 0.9 + i * 0.7) * 6 + noise.n2(i * 0.3, t * 0.2) * 5;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, H + 4);
      ctx.quadraticCurveTo(x + sw * 0.3, H - h * 0.5, x + sw, H - h);
      ctx.stroke();
      if (i % 4 === 0) { ctx.beginPath(); ctx.ellipse(x + sw, H - h - 6, 2.6, 8, sw * 0.02, 0, TAU); ctx.fill(); }
    }
  }

  // Reconnaître un cercle tracé du doigt : il revient près de son départ et fait le tour de son centre
  function isCircle(pts) {
    if (pts.length < 16) return false;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length;
    const rs = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
    const mr = rs.reduce((s, r) => s + r, 0) / rs.length;
    if (mr < 28) return false;
    const sd = Math.sqrt(rs.reduce((s, r) => s + (r - mr) * (r - mr), 0) / rs.length);
    if (sd / mr > 0.32) return false;
    let sweep = 0;
    for (let i = 1; i < pts.length; i++) {
      let d = Math.atan2(pts[i][1] - cy, pts[i][0] - cx) - Math.atan2(pts[i - 1][1] - cy, pts[i - 1][0] - cx);
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      sweep += d;
    }
    const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
    return Math.abs(sweep) > TAU * 0.86 && Math.hypot(x1 - x0, y1 - y0) < mr * 0.8 ? { cx, cy, r: mr } : false;
  }

  function down(p) {
    if (p.y < 110 && Math.abs(p.x - W / 2) < 170) return; // l'inscription du régime
    stroke = { pts: [[p.x, p.y]] };
    paintAt(p.x, p.y, Math.max(2, 10 / cs));
    audio.note(Math.floor(Math.random() * 5), { type: 'drop', vel: 0.12, dur: 0.5, pan: (p.x / W) * 2 - 1 });
  }
  // le tracé est suivi à chaque événement du pointeur, pas à chaque image : un geste rapide reste un cercle
  function move(p) {
    if (!stroke || p.hover) return;
    const last = stroke.pts[stroke.pts.length - 1];
    const d = Math.hypot(p.x - last[0], p.y - last[1]);
    if (d < 2) return;
    const r = Math.max(2, 10 / cs);
    const n = Math.ceil(d / (r * cs * 0.5));
    for (let k = 1; k <= n; k++) paintAt(lerp(last[0], p.x, k / n), lerp(last[1], p.y, k / n), r);
    stroke.pts.push([p.x, p.y]);
    const t = engine.t;
    if (t - lastBubble > 0.09 && d > 3) {
      lastBubble = t;
      audio.noise({ freq: 400 + Math.random() * 900, q: 4, dur: 0.12, vel: 0.05, type: 'bandpass', pan: (p.x / W) * 2 - 1 });
    }
  }
  function up() {
    if (stroke) {
      const c = isCircle(stroke.pts);
      if (c) {
        // le cercle devient une membrane, et le marais passe en régime de mitose
        for (let a = 0; a < TAU; a += 0.05) paintAt(c.cx + Math.cos(a) * c.r, c.cy + Math.sin(a) * c.r, Math.max(2, 7 / cs));
        reg = 0;
        omegaUntil = -1;
        setRegime(REGIMES[0], true);
        for (let k = 0; k < 18; k++) sparks.push({ x: c.cx + Math.cos(k) * c.r, y: c.cy + Math.sin(k) * c.r, age: 0 });
        secrets.find('mitose');
      }
    }
    stroke = null;
  }
  function tap(p) {
    const t = engine.t;
    if (p.y < 110 && Math.abs(p.x - W / 2) < 170) {
      labelTaps = labelTaps.filter(x => t - x < 4);
      labelTaps.push(t);
      audio.note(labelTaps.length, { type: 'glass', vel: 0.1, dur: 2 });
      if (labelTaps.length >= 5) {
        labelTaps = [];
        omegaUntil = t + 45;
        setRegime(OMEGA, true);
        secrets.find('omega');
      }
      return;
    }
    // toucher un feu follet le fait éclater en anneau
    for (const w of wisps) {
      if (Math.hypot(p.x - w.x, p.y - w.y) < 34) {
        for (let a = 0; a < TAU; a += 0.2) paintAt(w.x + Math.cos(a) * 40, w.y + Math.sin(a) * 40, 2);
        sparks.push({ x: w.x, y: w.y, age: 0 });
        audio.note(7, { type: 'bell', vel: 0.12, dur: 2.4 });
        w.x = Math.random() * W; w.y = Math.random() * H;
        return;
      }
    }
  }

  return {
    resize, update, draw, down, move, up, tap,
    words: { turing: () => { omegaUntil = engine.t + 45; setRegime(OMEGA, true); secrets.find('omega'); } },
    destroy() {},
  };
}
