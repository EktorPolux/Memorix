// Sève — La Chambre des Flocons : le modèle de Reiter (2005). Un flocon est l'histoire exacte des nuages qu'il traverse.
import { TAU, clamp, lerp, glow, drawGlow, makeCanvas, makeNoise } from '../engine.js';

export const mood = {
  root: 261.63, scale: 'wholetone', wave: 'sine', chord: [0, 4, 8], pad: 0.035, cutoff: 1800, lfo: 0.02, droneOct: 0.25,
  noise: { type: 'highpass', freq: 4200, q: 0.4, gain: 0.007, gust: 0.8, gustRate: 0.05 },
};

const SQ3 = Math.sqrt(3) / 2;
const GROW_TIME = 16; // secondes visées pour un flocon

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(41);
  const q = engine.quality;
  const M = q < 0.8 ? 64 : 84, N = 2 * M + 1, NN = N * N;
  const s = new Float32Array(NN), u = new Float32Array(NN), vv = new Float32Array(NN);
  const fr = new Uint8Array(NN), inside = new Uint8Array(NN), dist = new Uint8Array(NN), fade = new Float32Array(NN);
  for (let r = 0; r < N; r++) for (let qq = 0; qq < N; qq++) {
    const dq = qq - M, dr = r - M, d = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    const i = r * N + qq;
    inside[i] = d < M ? 1 : 0;
    dist[i] = Math.min(255, d);
    fade[i] = clamp(1 - Math.pow(d / M, 1.6), 0, 1); // la brume s'efface avant le bord : pas d'hexagone visible
  }
  const off = makeCanvas(N, N), octx = off.getContext('2d');
  const img = octx.createImageData(N, N), px = new Uint32Array(img.data.buffer);

  let W = api.W, H = api.H, cx = 0, cy = 0, cell = 1;
  let beta = 0.4, gamma = 0.001, breath = 0, flakeT = 0, maxR = 0, frozen = 0, spf = 2, acc = 0, lastNoteR = 0, done = 0;
  const fallen = [], sparkles = [];
  let bg = null, label = '';

  function reset() {
    for (let i = 0; i < NN; i++) { s[i] = beta; u[i] = beta; }
    s[M * N + M] = 1;
    flakeT = 0; maxR = 0; frozen = 1; lastNoteR = 0; spf = 2;
  }

  function resize(w, h) {
    W = w; H = h;
    cx = W / 2; cy = H / 2 + (H > W ? -20 : 6);
    cell = (Math.min(W, H * 1.05) * 0.78) / (2 * M);
    bg = makeCanvas(W, H);
    const g = bg.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#050b1c');
    grd.addColorStop(1, '#0d1b35');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // nuages très doux
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * W, y = Math.random() * H * 0.8, r = Math.max(W, H) * (0.15 + Math.random() * 0.2);
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, 'rgba(120,150,210,0.07)');
      c.addColorStop(1, 'rgba(120,150,210,0)');
      g.fillStyle = c;
      g.fillRect(0, 0, W, H);
    }
  }
  resize(W, H);
  reset();

  // Une étape de Reiter : les cellules gelées et leurs voisines (réceptives) captent la vapeur ;
  // ailleurs, la vapeur diffuse.
  function step() {
    const g = gamma * (1 + breath * 4);
    for (let i = 0; i < NN; i++) fr[i] = s[i] >= 1 ? 1 : 0;
    for (let i = 0; i < NN; i++) {
      if (!inside[i]) continue;
      const rec = fr[i] || fr[i + 1] || fr[i - 1] || fr[i + N] || fr[i - N] || fr[i + 1 - N] || fr[i - 1 + N];
      if (rec) { u[i] = 0; vv[i] = s[i] + g; } else { u[i] = s[i]; vv[i] = 0; }
    }
    const a12 = 1 / 12;
    for (let i = 0; i < NN; i++) {
      if (!inside[i]) { u[i] = beta; continue; }
      const sum = u[i + 1] + u[i - 1] + u[i + N] + u[i - N] + u[i + 1 - N] + u[i - 1 + N];
      const ns = u[i] + a12 * (sum - 6 * u[i]) + vv[i];
      if (ns >= 1 && !fr[i]) { frozen++; if (dist[i] > maxR) maxR = dist[i]; }
      s[i] = ns;
    }
  }

  function shapeName() {
    if (beta > 0.8) return 'plaque';
    if (beta < 0.46 && gamma < 0.0012) return 'dendrite';
    if (gamma > 0.004) return 'étoile à secteurs';
    return 'étoile';
  }

  function finishFlake() {
    // on fige le flocon dans une petite image, qui rejoint la neige
    const size = Math.ceil(2 * M * cell + 8);
    const px2 = 256, k = px2 / size, c2 = cell * k; // une petite image suffit à la neige
    const c = makeCanvas(px2, px2), g = c.getContext('2d');
    g.setTransform(c2, 0, c2 / 2, c2 * SQ3, px2 / 2 - (M + M / 2) * c2, px2 / 2 - M * c2 * SQ3);
    g.imageSmoothingEnabled = true;
    g.drawImage(off, 0, 0);
    fallen.push({ img: c, x: cx, y: cy, size, cur: size, target: 30 + Math.random() * 40, rot: 0, vr: (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 20, age: 0 });
    if (fallen.length > 36) fallen.shift();
    done++;
    const fill = frozen / (3 * maxR * (maxR + 1) + 1);
    if (fill > 0.6) secrets.find('lettre');
    if (done >= 12) secrets.find('collection');
    [0, 2, 4, 5].forEach((d, k) => audio.note(d + 3, { type: 'glass', vel: 0.09, at: k * 0.12, dur: 3.2, send: 0.7 }));
    audio.noise({ freq: 5000, q: 0.5, dur: 1.4, vel: 0.05, type: 'highpass', sweep: 0.3 });
    reset();
  }

  function update(dt, t) {
    // la main choisit le ciel : à droite l'air est humide, en haut la vapeur abonde
    let hx, hy;
    if (input.inside || input.down) { hx = input.x / W; hy = input.y / H; }
    else { hx = 0.5 + 0.45 * noise.n2(t * 0.03, 1.7); hy = 0.5 + 0.45 * noise.n2(t * 0.03, 9.1); }
    const tb = lerp(0.32, 0.96, clamp(hx, 0, 1)), tg = Math.pow(10, lerp(-2.3, -4, clamp(hy, 0, 1)));
    beta += (tb - beta) * Math.min(1, dt * 2);
    gamma += (tg - gamma) * Math.min(1, dt * 2);
    breath = Math.max(0, breath - dt * 0.7);
    flakeT += dt;

    // le rythme : on accélère ou on freine pour qu'un flocon pousse en une quinzaine de secondes
    const target = M * 0.86 * Math.pow(Math.min(1, flakeT / GROW_TIME), 0.9);
    spf = clamp(spf + (maxR < target ? 0.6 : -0.6), 0.25, q < 0.8 ? 9 : 14);
    acc += spf;
    while (acc >= 1) { step(); acc -= 1; }
    if (maxR - lastNoteR >= 6) {
      lastNoteR = maxR;
      audio.note(Math.round(maxR / 6), { type: 'glass', vel: 0.05, dur: 2.2, send: 0.6, pan: Math.sin(t) * 0.5 });
    }
    if (maxR >= M * 0.86 || flakeT > 45) finishFlake();

    const sh = shapeName();
    if (sh !== label) { label = sh; api.label(`flocon n° ${done + 1} · ${sh}`); }

    for (let i = fallen.length - 1; i >= 0; i--) {
      const f = fallen[i];
      f.age += dt;
      const k = clamp(f.age / 2.2, 0, 1);
      f.cur = lerp(f.size, f.target, k * k * (3 - 2 * k));
      if (f.age > 1.2) { f.y += (16 + f.target * 0.5) * dt; f.x += (f.vx + Math.sin(t * 0.7 + i) * 18) * dt; f.rot += f.vr * dt; }
      if (f.y > H + f.target) fallen.splice(i, 1);
    }
    if (sparkles.length < 90 && Math.random() < dt * 30) sparkles.push({ x: Math.random() * W, y: -4, vy: 10 + Math.random() * 25, ph: Math.random() * TAU });
    for (let i = sparkles.length - 1; i >= 0; i--) { const p = sparkles[i]; p.y += p.vy * dt; p.x += Math.sin(t + p.ph) * 6 * dt; if (p.y > H + 4) sparkles.splice(i, 1); }
  }

  function draw(ctx, t) {
    ctx.drawImage(bg, 0, 0, W, H);
    // la neige des flocons déjà nés, derrière
    for (const f of fallen) {
      if (f.age < 1.2) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(f.img, -f.cur / 2, -f.cur / 2, f.cur, f.cur);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // le flocon en train de naître : la glace luit, la vapeur appauvrie autour d'elle dessine un halo sombre
    for (let i = 0; i < NN; i++) {
      if (!inside[i]) { px[i] = 0; continue; }
      const v = s[i];
      if (v >= 1) {
        const k = clamp((v - 1) * 1.6 + 0.55, 0.45, 1);
        const r = 190 + 65 * k, g = 215 + 40 * k;
        px[i] = (255 << 24) | (255 << 16) | (g << 8) | r;
      } else {
        const a = clamp(v * v * 46 * fade[i], 0, 46) | 0;
        px[i] = (a << 24) | (235 << 16) | (170 << 8) | 120;
      }
    }
    octx.putImageData(img, 0, 0);
    const d = engine.dpr;
    const e = cx - (M + M / 2) * cell, f2 = cy - M * cell * SQ3;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(d * cell, 0, (d * cell) / 2, d * cell * SQ3, d * e, d * f2);
    ctx.drawImage(off, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.drawImage(off, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = 1;
    drawGlow(ctx, glow([170, 200, 255], 64), cx, cy, maxR * cell * 1.3 + 40, 0.12 + breath * 0.3);
    const sp = glow([230, 240, 255], 8);
    for (const p of sparkles) drawGlow(ctx, sp, p.x, p.y, 3, 0.5 + 0.5 * Math.sin(t * 5 + p.ph));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // le flocon qui se détache : il rétrécit avant de rejoindre la neige
    for (const f of fallen) {
      if (f.age >= 1.2) continue;
      ctx.globalAlpha = 1;
      ctx.drawImage(f.img, f.x - f.cur / 2, f.y - f.cur / 2, f.cur, f.cur);
    }
    drawDiagram(ctx);
  }

  // Diagramme de Nakaya, en miniature : où se trouve le ciel que tu choisis
  function drawDiagram(ctx) {
    const w = 132, h = 92, x0 = W - w - 20, y0 = H - h - 42;
    ctx.strokeStyle = 'rgba(200,220,255,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, w, h);
    ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(200,220,255,0.4)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('VAPEUR ↑', x0 + 6, y0 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('HUMIDITÉ →', x0 + w - 6, y0 + h - 5);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const bx = x0 + ((beta - 0.32) / 0.64) * w, by = y0 + ((Math.log10(gamma) + 2.3) / -1.7) * h;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([200, 225, 255], 16), clamp(bx, x0, x0 + w), clamp(by, y0, y0 + h), 8, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function tap() {
    breath = 1; // un souffle d'air humide : le flocon se ramifie d'un coup
    audio.noise({ freq: 2600, q: 0.6, dur: 0.9, vel: 0.06, type: 'bandpass', sweep: 0.5 });
  }
  function longpress() { if (maxR > 8) finishFlake(); }

  return { resize, update, draw, tap, longpress, destroy() {} };
}
