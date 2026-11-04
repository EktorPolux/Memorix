// Sève — L'Étang au Crépuscule : l'équation des ondes, un fond qui se tord sous elles, et des carpes curieuses.
import { TAU, clamp, lerp, angleDiff, glow, drawGlow, rgba, mixRgb, hexToRgb, makeCanvas, makeNoise } from '../engine.js';

export const mood = {
  root: 146.83, scale: 'minPenta', wave: 'triangle', chord: [0, 7, 10, 15], pad: 0.045, cutoff: 700, lfo: 0.04,
  noise: { type: 'lowpass', freq: 900, q: 0.4, gain: 0.006, gust: 0.4, gustRate: 0.08 },
};

const CYCLE = 110; // du crépuscule à la nuit, et retour
const KOI = [
  { base: [246, 242, 236], spots: [[240, 92, 40]] }, // kohaku
  { base: [250, 140, 50], spots: [[30, 24, 28]] }, // showa
  { base: [240, 236, 230], spots: [[230, 70, 40], [30, 24, 28]] }, // sanke
  { base: [255, 196, 120], spots: [] }, // ogon pâle
  { base: [210, 222, 236], spots: [[60, 80, 120]] }, // asagi
  { base: [250, 120, 60], spots: [[255, 245, 235]] },
  { base: [244, 238, 228], spots: [[226, 80, 50]] },
];

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(53);
  const q = engine.quality;
  let W = api.W, H = api.H;
  let cs = 4, cols = 0, rows = 0, h0, h1, floor, img, img32, hi, hi32, off, offH, octx, hctx;
  const fish = [], pellets = [], pads = [], flowers = [], drops = [], flies = [];
  let feeds = 0, golden = null, rain = 0, nextRain = 35, lastTap = null, moon = { x: 0, y: 0 };

  // ——— Le fond de l'étang : sable, galets et herbes, peints une fois à la résolution de la grille
  function buildFloor() {
    floor = new Uint8ClampedArray(cols * rows * 3);
    const pebbles = [];
    for (let i = 0; i < (cols * rows) / 520; i++) pebbles.push([Math.random() * cols, Math.random() * rows, 0.9 + Math.random() * 2.2, Math.random()]);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const n = noise.fbm2(x * 0.03, y * 0.03, 4), m = noise.fbm2(x * 0.012 + 40, y * 0.012, 3);
      const ripple = Math.sin(x * 0.35 + noise.n2(x * 0.02, y * 0.02) * 6) * 4; // le sable ridé par le courant
      let r = 46 + n * 22 + ripple, g = 52 + n * 20 + ripple, b = 44 + n * 14 + ripple * 0.6;
      if (m > 0.18) { const k = clamp((m - 0.18) * 4, 0, 1); r = lerp(r, 22, k); g = lerp(g, 52, k); b = lerp(b, 36, k); } // herbiers
      const i = (y * cols + x) * 3;
      floor[i] = r; floor[i + 1] = g; floor[i + 2] = b;
    }
    for (const [px, py, pr, c] of pebbles) {
      const col = c < 0.3 ? [96, 92, 86] : c < 0.6 ? [70, 76, 84] : [110, 100, 88];
      for (let y = Math.max(0, Math.floor(py - pr)); y < Math.min(rows, py + pr); y++) for (let x = Math.max(0, Math.floor(px - pr)); x < Math.min(cols, px + pr); x++) {
        const d = Math.hypot(x - px, y - py) / pr;
        if (d > 1) continue;
        const sh = 1.15 - d * 0.5 - ((x - px) + (y - py)) / pr * 0.15;
        const i = (y * cols + x) * 3;
        floor[i] = col[0] * sh; floor[i + 1] = col[1] * sh; floor[i + 2] = col[2] * sh;
      }
    }
  }

  function resize(w, h) {
    W = w; H = h;
    cs = clamp(Math.round(Math.sqrt((W * H) / (62000 * q))), 3, 6);
    cols = Math.ceil(W / cs) + 2; rows = Math.ceil(H / cs) + 2;
    h0 = new Float32Array(cols * rows); h1 = new Float32Array(cols * rows);
    buildFloor();
    off = makeCanvas(cols, rows); octx = off.getContext('2d');
    offH = makeCanvas(cols, rows); hctx = offH.getContext('2d');
    img = octx.createImageData(cols, rows); img32 = new Uint32Array(img.data.buffer);
    hi = hctx.createImageData(cols, rows); hi32 = new Uint32Array(hi.data.buffer);
    moon = { x: W * 0.72, y: H * 0.26 };
    if (!pads.length) {
      for (let i = 0; i < 7; i++) pads.push({ x: Math.random() * W, y: Math.random() * H, r: 22 + Math.random() * 26, rot: Math.random() * TAU, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, flower: i < 3 });
      for (let i = 0; i < Math.round(26 * q); i++) flies.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * TAU, sd: Math.random() * 100 });
    }
  }

  // ——— Les ondes : h(t+1) = moyenne des voisins × 2 − h(t−1), amortie
  function waveStep() {
    const w = cols;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        h0[i] = ((h1[i - 1] + h1[i + 1] + h1[i - w] + h1[i + w]) * 0.5 - h0[i]) * 0.985;
      }
    }
    const t = h0; h0 = h1; h1 = t;
  }
  function disturb(px, py, amount, r = 2) {
    const gx = px / cs + 1, gy = py / cs + 1;
    for (let y = Math.max(1, Math.floor(gy - r)); y <= Math.min(rows - 2, Math.ceil(gy + r)); y++)
      for (let x = Math.max(1, Math.floor(gx - r)); x <= Math.min(cols - 2, Math.ceil(gx + r)); x++) {
        const d = Math.hypot(x - gx, y - gy) / r;
        if (d < 1) h1[y * cols + x] += amount * (1 - d * d);
      }
  }
  const slopeAt = (px, py) => {
    const x = clamp(Math.round(px / cs + 1), 1, cols - 2), y = clamp(Math.round(py / cs + 1), 1, rows - 2), i = y * cols + x;
    return [h1[i - 1] - h1[i + 1], h1[i - cols] - h1[i + cols]];
  };

  // ——— Carpes : une tête qui décide, une colonne qui suit, des nageoires qui battent
  function spawnFish(k, gold = false) {
    const pal = gold ? { base: [255, 214, 90], spots: [[255, 170, 40]] } : KOI[k % KOI.length];
    const L = (gold ? 64 : 42 + Math.random() * 26);
    const f = { x: Math.random() * W, y: Math.random() * H, a: Math.random() * TAU, v: 26, L, pal, spine: [], sd: Math.random() * 100, flee: 0, wig: Math.random() * TAU, gold, spots: pal.spots.map(() => [Math.random() * 0.5 + 0.15, (Math.random() - 0.5) * 0.6, 0.12 + Math.random() * 0.14]) };
    for (let s = 0; s < 12; s++) f.spine.push([f.x - Math.cos(f.a) * s * (L / 11), f.y - Math.sin(f.a) * s * (L / 11)]);
    fish.push(f);
    return f;
  }
  resize(W, H);
  for (let k = 0; k < Math.round(7 * Math.max(q, 0.7)); k++) spawnFish(k);

  function updateFish(f, dt, t) {
    let target = null;
    let best = 1e9;
    for (const p of pellets) { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < best && d < 380) { best = d; target = p; } }
    let desired = f.a + noise.n2(t * 0.15, f.sd) * 1.6;
    if (target) desired = Math.atan2(target.y - f.y, target.x - f.x);
    else if (input.inside && f.flee <= 0 && Math.hypot(input.x - f.x, input.y - f.y) < 300) desired = Math.atan2(input.y - f.y, input.x - f.x) + Math.sin(t + f.sd) * 0.6; // curieuses
    if (f.flee > 0) desired = f.fleeA;
    // les bords repoussent doucement
    const m = 60;
    if (f.x < m) desired = lerp(desired, 0, 0.6); if (f.x > W - m) desired = lerp(desired, Math.PI, 0.6);
    if (f.y < m) desired = Math.PI / 2; if (f.y > H - m) desired = -Math.PI / 2;
    for (const o of fish) {
      if (o === f) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d < f.L * 0.8) desired += angleDiff(f.a, Math.atan2(o.y - f.y, o.x - f.x)) * 0.4;
    }
    f.a += clamp(angleDiff(desired, f.a), -2.4 * dt, 2.4 * dt);
    const speed = f.flee > 0 ? 130 : target ? 62 : 26 + 10 * Math.sin(t * 0.7 + f.sd);
    f.v += (speed - f.v) * Math.min(1, dt * 2);
    f.x += Math.cos(f.a) * f.v * dt;
    f.y += Math.sin(f.a) * f.v * dt;
    f.flee -= dt;
    f.wig += dt * (3 + f.v * 0.06);
    // la colonne : chaque vertèbre suit la précédente à distance fixe, et ondule
    const seg = f.L / 11;
    f.spine[0] = [f.x, f.y];
    for (let s = 1; s < f.spine.length; s++) {
      const [px, py] = f.spine[s - 1];
      let [x, y] = f.spine[s];
      const wave = Math.sin(f.wig - s * 0.55) * 0.9 * (s / f.spine.length);
      const ax = Math.atan2(py - y, px - x) + wave * 0.12;
      x = px - Math.cos(ax) * seg; y = py - Math.sin(ax) * seg;
      f.spine[s] = [x, y];
    }
    if (target && best < f.L * 0.3) {
      pellets.splice(pellets.indexOf(target), 1);
      disturb(target.x, target.y, -60, 1.5);
      audio.note(8 + ((Math.random() * 4) | 0), { type: 'drop', vel: 0.14, dur: 0.4, pan: (target.x / W) * 2 - 1 });
      feeds++;
      if (feeds >= 15 && !golden) {
        golden = spawnFish(0, true);
        golden.x = -40; golden.y = H * 0.5; golden.a = 0;
        secrets.find('carpe');
      }
    }
  }

  function update(dt, t) {
    const night = 0.5 - 0.5 * Math.cos((t / CYCLE) * TAU);
    waveStep();
    if (q > 0.7) waveStep();
    for (const f of fish) updateFish(f, dt, t);
    // averses : de temps en temps, le ciel tambourine
    nextRain -= dt;
    if (nextRain <= 0 && rain <= 0) { rain = 14 + Math.random() * 8; audio.setNoiseLevel(0.03); }
    if (rain > 0) {
      rain -= dt;
      const n = Math.random() < dt * 60 ? 1 + ((Math.random() * 2) | 0) : 0;
      for (let k = 0; k < n; k++) {
        const x = Math.random() * W, y = Math.random() * H;
        disturb(x, y, 70 + Math.random() * 60, 1.2);
        drops.push({ x, y, age: 0 });
      }
      if (rain <= 0) { nextRain = 50 + Math.random() * 30; audio.setNoiseLevel(mood.noise.gain); }
    }
    for (let i = drops.length - 1; i >= 0; i--) { drops[i].age += dt; if (drops[i].age > 0.5) drops.splice(i, 1); }
    // nénuphars : ils dérivent et dansent sur les vagues
    for (const p of pads) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const [sx, sy] = slopeAt(p.x, p.y);
      p.x += sx * 0.004; p.y += sy * 0.004;
      if (p.x < -p.r) p.x = W + p.r; if (p.x > W + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = H + p.r; if (p.y > H + p.r) p.y = -p.r;
      p.bob = (sx + sy) * 0.002;
    }
    for (const p of pellets) { p.age += dt; p.sink = Math.min(1, p.age / 9); }
    for (let i = pellets.length - 1; i >= 0; i--) if (pellets[i].age > 12) pellets.splice(i, 1);
    // nourrir : maintenir le doigt sur l'eau
    if (input.down && this.holding) {
      this.feedT = (this.feedT || 0) + dt;
      if (this.feedT > 0.28 && pellets.length < 40) {
        this.feedT = 0;
        pellets.push({ x: input.x + (Math.random() - 0.5) * 30, y: input.y + (Math.random() - 0.5) * 30, age: 0, sink: 0 });
        disturb(input.x, input.y, 30, 1);
      }
    }
    for (const f of flies) {
      f.x += noise.n3(f.x * 0.003, f.y * 0.003, t * 0.1 + f.sd) * 30 * dt;
      f.y += noise.n3(f.x * 0.003 + 30, f.y * 0.003, t * 0.1 + f.sd) * 30 * dt;
      if (f.x < 0) f.x = W; if (f.x > W) f.x = 0; if (f.y < 0) f.y = H; if (f.y > H) f.y = 0;
    }
    this.night = night;
  }

  function draw(ctx, t) {
    const night = this.night ?? 0;
    // le ciel qui s'y reflète : rose du crépuscule, puis bleu de nuit
    const sky = mixRgb([255, 150, 140], [50, 70, 130], night);
    const deep = mixRgb([14, 38, 46], [4, 12, 24], night);
    const lightK = lerp(0.82, 0.38, night);
    const w = cols;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const sx = h1[i - 1] - h1[i + 1], sy = h1[i - w] - h1[i + w];
        const fx = clamp(x + ((sx * 0.03) | 0), 0, cols - 1), fy = clamp(y + ((sy * 0.03) | 0), 0, rows - 1);
        const fi = (fy * cols + fx) * 3;
        const sh = clamp(1 + (sx + sy) * 0.0035, 0.6, 1.5) * lightK;
        let r = floor[fi] * sh * 0.62 + deep[0], g = floor[fi + 1] * sh * 0.62 + deep[1], b = floor[fi + 2] * sh * 0.62 + deep[2];
        // un peu de ciel dans l'eau, davantage sur les pentes
        const fres = 0.1 + clamp(Math.abs(sx) + Math.abs(sy), 0, 200) * 0.0012;
        r = lerp(r, sky[0], fres); g = lerp(g, sky[1], fres); b = lerp(b, sky[2], fres);
        img32[i] = (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
        // reflets : là où la pente regarde la lumière
        const s = -(sx * 0.7 + sy * 0.7);
        if (s > 5) { const a = Math.min(220, (s - 5) * 6) | 0; hi32[i] = (a << 24) | (Math.min(255, sky[2] + 70) << 16) | (Math.min(255, sky[1] + 70) << 8) | Math.min(255, sky[0] + 70); }
        else hi32[i] = 0;
      }
    }
    octx.putImageData(img, 0, 0);
    hctx.putImageData(hi, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 1, 1, cols - 2, rows - 2, 0, 0, (cols - 2) * cs, (rows - 2) * cs);

    // carpes, sous la surface : ombre, puis corps
    for (const f of fish) drawFish(ctx, f, t, true);
    for (const f of fish) drawFish(ctx, f, t, false);
    // granulés qui coulent
    for (const p of pellets) {
      ctx.fillStyle = `rgba(150,96,50,${1 - p.sink * 0.7})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * (1 - p.sink * 0.4), 0, TAU); ctx.fill();
    }
    // la surface : le ciel s'y reflète par-dessus tout ce qui nage dessous
    const refl = ctx.createLinearGradient(0, 0, 0, H);
    refl.addColorStop(0, rgba(sky, 0.2));
    refl.addColorStop(0.6, rgba(sky, 0.06));
    refl.addColorStop(1, rgba(sky, 0.02));
    ctx.fillStyle = refl;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(offH, 1, 1, cols - 2, rows - 2, 0, 0, (cols - 2) * cs, (rows - 2) * cs);
    ctx.globalCompositeOperation = 'source-over';

    // reflet de la lune, la nuit
    if (night > 0.35) {
      const [sx, sy] = slopeAt(moon.x, moon.y);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([200, 215, 255], 48), moon.x + sx * 0.05, moon.y + sy * 0.05, 46, (night - 0.35) * 1.2);
      drawGlow(ctx, glow([240, 245, 255], 16), moon.x + sx * 0.08, moon.y + sy * 0.08, 12, (night - 0.35) * 1.5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // nénuphars et lotus, posés sur l'eau
    for (const p of pads) drawPad(ctx, p, t, night);
    // pluie
    if (rain > 0) {
      ctx.strokeStyle = 'rgba(210,225,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 70; k++) { const x = (k * 137.1 + t * 600) % (W + 40) - 20, y = (k * 97.7 + t * 900) % (H + 40) - 20; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14); }
      ctx.stroke();
    }
    // lucioles, quand la nuit vient
    ctx.globalCompositeOperation = 'lighter';
    const fl = glow([210, 255, 140], 16);
    for (const f of flies) drawGlow(ctx, fl, f.x, f.y, 7, night * Math.pow(Math.max(0, Math.sin(t * 1.6 + f.ph)), 3));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function fishPath(ctx, f, ox = 0, oy = 0, scale = 1) {
    const L = [], Rr = [];
    const n = f.spine.length;
    for (let s = 0; s < n; s++) {
      const [x, y] = f.spine[s], [x2, y2] = f.spine[Math.min(n - 1, s + 1)], [x0, y0] = f.spine[Math.max(0, s - 1)];
      const a = Math.atan2(y0 - y2, x0 - x2);
      const k = s / (n - 1);
      const wdt = f.L * 0.19 * Math.sin(Math.PI * Math.pow(Math.min(1, k * 1.05 + 0.04), 0.62)) * scale;
      L.push([x + ox - Math.sin(a) * wdt, y + oy + Math.cos(a) * wdt]);
      Rr.push([x + ox + Math.sin(a) * wdt, y + oy - Math.cos(a) * wdt]);
    }
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let s = 1; s < n; s++) ctx.lineTo(L[s][0], L[s][1]);
    for (let s = n - 1; s >= 0; s--) ctx.lineTo(Rr[s][0], Rr[s][1]);
    ctx.closePath();
  }

  function drawFish(ctx, f, t, shadow) {
    const [sx, sy] = slopeAt(f.x, f.y);
    const ox = sx * 0.04, oy = sy * 0.04;
    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      fishPath(ctx, f, 10 + ox, 14 + oy, 1.05);
      ctx.fill();
      return;
    }
    const n = f.spine.length;
    // queue et nageoires
    const [tx, ty] = f.spine[n - 1], [px, py] = f.spine[n - 3];
    const ta = Math.atan2(ty - py, tx - px) + Math.sin(f.wig) * 0.35;
    ctx.fillStyle = rgba(f.pal.base, 0.55);
    ctx.beginPath();
    ctx.moveTo(tx + ox, ty + oy);
    ctx.lineTo(tx + ox + Math.cos(ta + 0.5) * f.L * 0.28, ty + oy + Math.sin(ta + 0.5) * f.L * 0.28);
    ctx.lineTo(tx + ox + Math.cos(ta - 0.5) * f.L * 0.28, ty + oy + Math.sin(ta - 0.5) * f.L * 0.28);
    ctx.fill();
    const [hx, hy] = f.spine[2], [h2x, h2y] = f.spine[3];
    const ha = Math.atan2(hy - h2y, hx - h2x);
    for (const sd of [-1, 1]) {
      const fa = ha + sd * (2 + Math.sin(f.wig * 1.3) * 0.3);
      ctx.beginPath();
      ctx.ellipse(hx + ox + Math.cos(fa) * f.L * 0.12, hy + oy + Math.sin(fa) * f.L * 0.12, f.L * 0.12, f.L * 0.05, fa, 0, TAU);
      ctx.fill();
    }
    // corps, et ses taches (dessinées à travers la silhouette)
    ctx.save();
    fishPath(ctx, f, ox, oy);
    ctx.fillStyle = rgba(f.pal.base, 0.95);
    ctx.fill();
    ctx.clip();
    f.pal.spots.forEach((c, k) => {
      const [u, side, r] = f.spots[k];
      const s = Math.floor(u * (n - 1));
      const [x, y] = f.spine[s];
      ctx.fillStyle = rgba(c, 0.92);
      ctx.beginPath();
      ctx.ellipse(x + ox + side * f.L * 0.08, y + oy, f.L * r, f.L * r * 0.7, ha, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
    if (f.gold) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([255, 210, 100], 32), f.x, f.y, f.L, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  function drawPad(ctx, p, t, night) {
    const r = p.r * (1 + (p.bob || 0));
    ctx.fillStyle = rgba(mixRgb([60, 120, 70], [24, 60, 44], night), 0.95);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, r, p.rot + 0.25, p.rot + TAU - 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(mixRgb([110, 170, 110], [40, 90, 70], night), 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) { const a = p.rot + 0.4 + (k / 9) * (TAU - 0.5); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * r * 0.85, p.y + Math.sin(a) * r * 0.85); }
    ctx.stroke();
    if (!p.flower) return;
    // le lotus s'ouvre au crépuscule et se referme dans la nuit noire
    const open = clamp(1.2 - night * 1.4, 0.08, 1);
    const fx = p.x + Math.cos(p.rot + 2) * r * 0.3, fy = p.y + Math.sin(p.rot + 2) * r * 0.3;
    for (let layer = 0; layer < 2; layer++) {
      const nP = layer ? 6 : 8, len = r * (layer ? 0.42 : 0.55);
      for (let k = 0; k < nP; k++) {
        const a = (k / nP) * TAU + layer * 0.4 + t * 0.05;
        const spread = len * (0.35 + 0.65 * open);
        ctx.fillStyle = layer ? 'rgba(255,214,228,0.95)' : 'rgba(244,150,190,0.92)';
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(a) * spread * 0.5, fy + Math.sin(a) * spread * 0.5, spread * 0.55, len * 0.22, a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,220,120,0.95)';
    ctx.beginPath(); ctx.arc(fx, fy, r * 0.09, 0, TAU); ctx.fill();
  }

  // ——— Gestes
  const self = { resize, update, draw, destroy() { audio.setNoiseLevel(mood.noise.gain); } };
  self.update = update.bind(self);
  self.draw = draw.bind(self);
  self.down = p => {
    disturb(p.x, p.y, 220, 2.2);
    for (const f of fish) {
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < 140) { f.flee = 0.9; f.fleeA = Math.atan2(f.y - p.y, f.x - p.x); }
    }
    audio.note(Math.floor((1 - p.y / H) * 7), { type: 'drop', vel: 0.16, dur: 0.6, pan: (p.x / W) * 2 - 1 });
    // deux gouttes au même instant, en deux endroits : les franges de Young
    const t = engine.t;
    if (lastTap && t - lastTap.t < 0.2 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) > 80) {
      disturb(p.x, p.y, 400, 2.5);
      disturb(lastTap.x, lastTap.y, 400, 2.5);
      secrets.find('young');
    }
    lastTap = { x: p.x, y: p.y, t };
    // toucher le reflet de la lune
    if ((self.night ?? 0) > 0.45 && Math.hypot(p.x - moon.x, p.y - moon.y) < 36) secrets.find('reflet');
  };
  self.move = p => {
    if (p.hover || !input.down) return;
    disturb(p.x, p.y, 70, 1.6);
  };
  self.longpress = () => { self.holding = true; audio.note(3, { type: 'soft', vel: 0.08, dur: 2 }); };
  self.up = () => { self.holding = false; };
  return self;
}
