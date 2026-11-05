// Sève — La Chambre des Flocons : le modèle de Reiter (2005). Un flocon est l'histoire exacte des nuages qu'il traverse.
// La glace est rendue translucide, en relief, sous une lumière qui tourne ; chaque flocon fini raconte sa vie,
// puis se pose sur le velours noir, comme ceux que Wilson Bentley photographiait dans le Vermont.
import { TAU, clamp, lerp, glow, drawGlow, makeCanvas, makeNoise, easeInOut, makeLayer, blit } from '../engine.js';

export const mood = {
  root: 261.63, scale: 'wholetone', wave: 'sine', chord: [0, 4, 8], pad: 0.035, cutoff: 1800, lfo: 0.02, droneOct: 0.25,
  noise: { type: 'highpass', freq: 4200, q: 0.4, gain: 0.007, gust: 0.8, gustRate: 0.05 },
};

const SQ3 = Math.sqrt(3) / 2;
const GROW_TIME = 16; // secondes visées pour un flocon
const NUM = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept'];

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

  // ——— Le rendu de la glace : la grille hexagonale est rééchantillonnée en douceur sur une image carrée
  const RS = q < 0.8 ? 220 : 300;
  const rc = makeCanvas(RS, RS), rg = rc.getContext('2d'), rimg = rg.createImageData(RS, RS), rpx = new Uint32Array(rimg.data.buffer);
  const mIdx = new Int32Array(RS * RS), mFq = new Float32Array(RS * RS), mFr = new Float32Array(RS * RS);
  for (let oy = 0; oy < RS; oy++) for (let ox = 0; ox < RS; ox++) {
    const X = (((ox + 0.5) / RS) * 2 - 1) * M, Y = (((oy + 0.5) / RS) * 2 - 1) * M;
    const r = M + Y / SQ3, qq = M + X - Y / SQ3 / 2;
    const r0 = Math.floor(r), q0 = Math.floor(qq), o = oy * RS + ox;
    if (r0 < 1 || q0 < 1 || r0 >= N - 2 || q0 >= N - 2) { mIdx[o] = -1; continue; }
    mIdx[o] = r0 * N + q0; mFq[o] = qq - q0; mFr[o] = r - r0;
  }
  const TK = new Float32Array(NN), CR = new Float32Array(NN), CG = new Float32Array(NN), CB = new Float32Array(NN), CA = new Float32Array(NN);

  let W = api.W, H = api.H, cx = 0, cy = 0, cell = 1;
  let beta = 0.4, gamma = 0.001, breath = 0, flakeT = 0, maxR = 0, frozen = 0, spf = 2, acc = 0, lastNoteR = 0, done = 0;
  const resting = [], travelling = [], sparkles = [], bokeh = [], glints = [], puffs = [];
  let bg = null, label = '', story = null, hist = null, histT = 0, slots = 6, strip = { x: 0, y: 0, w: 0, h: 0 }, diag = { x: 0, y: 0 };

  function reset() {
    for (let i = 0; i < NN; i++) { s[i] = beta; u[i] = beta; }
    s[M * N + M] = 1;
    flakeT = 0; maxR = 0; frozen = 1; lastNoteR = 0; spf = 2;
    hist = { samples: [[beta, gamma]], breaths: 0 };
    histT = 0;
  }

  function resize(w, h) {
    W = w; H = h;
    const narrow = W < 600;
    cx = W / 2; cy = H * (H > W ? 0.42 : 0.44);
    cell = (Math.min(W * (narrow ? 0.92 : 0.8), H * 0.74)) / (2 * M);
    // le velours noir de Bentley, en bas ; le diagramme de Nakaya à côté, ou en haut sur un petit écran
    const dw = 132, dh = 92;
    diag = narrow ? { x: W - dw - 16, y: 74 } : { x: W - dw - 20, y: H - dh - 42 };
    strip = { x: 18, y: H - (narrow ? 62 : 34) - 66, w: (narrow ? W - 36 : W - dw - 58), h: 66 };
    slots = Math.max(3, Math.floor(strip.w / 70));
    resting.forEach((f, k) => { f.slot = k; });
    bg = makeLayer(engine);
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
    if (!bokeh.length) for (let i = 0; i < 14; i++) bokeh.push({ x: Math.random() * W, y: Math.random() * H, r: 10 + Math.random() * 28, vy: 4 + Math.random() * 8, ph: Math.random() * TAU });
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

  // La glace : épaisseur → transparence, pente → reflet. La lumière tourne lentement : les facettes s'allument tour à tour.
  function shade(t) {
    for (let i = 0; i < NN; i++) { const v = s[i]; TK[i] = inside[i] && v >= 0.985 ? Math.min(1.8, (v - 0.985) * 3.2) : 0; }
    const la = t * 0.22, lx = Math.cos(la), ly = Math.sin(la);
    for (let i = N + 1; i < NN - N - 1; i++) {
      if (!inside[i]) { CA[i] = 0; continue; }
      const T = TK[i];
      if (T <= 0) {
        // la vapeur appauvrie autour de la glace : un halo bleu, à peine
        const v = s[i];
        CR[i] = 130; CG[i] = 175; CB[i] = 235; CA[i] = clamp(v * v * 0.16 * fade[i], 0, 0.16);
        continue;
      }
      const gq = (TK[i + 1] - TK[i - 1]) * 0.5, gr = (TK[i + N] - TK[i - N]) * 0.5;
      const gx = gq, gy = (gr - gq * 0.5) / SQ3 * 0.5;
      const sh = clamp(0.5 + (gx * lx + gy * ly) * 1.9, 0, 1);
      const edge = TK[i + 1] === 0 || TK[i - 1] === 0 || TK[i + N] === 0 || TK[i - N] === 0 || TK[i + 1 - N] === 0 || TK[i - 1 + N] === 0 ? 1 : 0;
      const k = clamp(0.2 + T * 0.4 + (sh - 0.5) * 0.95, 0, 1);
      let r = 105 + 133 * k, g = 155 + 93 * k, b = 222 + 33 * k;
      const spec = sh > 0.72 ? (sh - 0.72) * 3.2 : 0, e = Math.min(1, edge * 0.55 + spec * 0.7);
      r += (255 - r) * e; g += (255 - g) * e; b += (255 - b) * e;
      CR[i] = r; CG[i] = g; CB[i] = b; CA[i] = clamp(0.32 + T * 0.38 + edge * 0.35 + spec * 0.3, 0, 0.97);
    }
    for (let o = 0; o < RS * RS; o++) {
      const i = mIdx[o];
      if (i < 0) { rpx[o] = 0; continue; }
      const fq = mFq[o], frr = mFr[o];
      const w00 = (1 - fq) * (1 - frr), w10 = fq * (1 - frr), w01 = (1 - fq) * frr, w11 = fq * frr;
      const j = i + N;
      const a = CA[i] * w00 + CA[i + 1] * w10 + CA[j] * w01 + CA[j + 1] * w11;
      if (a < 0.004) { rpx[o] = 0; continue; }
      const r = CR[i] * w00 + CR[i + 1] * w10 + CR[j] * w01 + CR[j + 1] * w11;
      const g = CG[i] * w00 + CG[i + 1] * w10 + CG[j] * w01 + CG[j + 1] * w11;
      const b = CB[i] * w00 + CB[i + 1] * w10 + CB[j] * w01 + CB[j + 1] * w11;
      rpx[o] = ((Math.min(1, a) * 255) << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
    }
    rg.putImageData(rimg, 0, 0);
  }

  // La biographie d'un flocon : les nuages traversés, les souffles reçus
  function biography(h, shape, n) {
    const hum = b => (b > 0.78 ? 'très humide' : b > 0.6 ? 'humide' : b > 0.45 ? 'doux' : 'sec');
    const vap = g => (g > 0.003 ? 'une vapeur abondante' : g > 0.0012 ? 'une vapeur légère' : 'une vapeur rare');
    const a = h.samples[0], z = h.samples[h.samples.length - 1];
    let mid = 0;
    for (const [b] of h.samples) mid = Math.max(mid, Math.abs(b - a[0]));
    let txt = `Né dans un air ${hum(a[0])}, sous ${vap(a[1])}`;
    if (z[0] - a[0] > 0.18) txt += ', il est monté vers des nuages plus humides';
    else if (a[0] - z[0] > 0.18) txt += ', il est descendu vers un air plus sec';
    else if (mid > 0.2) txt += ', il a traversé un ciel changeant, puis le calme';
    else txt += ', il a traversé un ciel égal';
    if (h.breaths === 1) txt += ", et un souffle l'a fait fleurir";
    else if (h.breaths > 1) txt += `, et ${NUM[Math.min(7, h.breaths)]} souffles l'ont fait fleurir`;
    return { title: `Flocon n° ${n} · ${shape}`, text: txt + '.', t: 0 };
  }

  function finishFlake() {
    // le flocon se fige dans une petite image, qui va se poser sur le velours
    const img = makeCanvas(128, 128);
    img.getContext('2d').drawImage(rc, 0, 0, 128, 128);
    const size = 2 * M * cell;
    travelling.push({ img, x: cx, y: cy, size, t: 0 });
    done++;
    const sh = shapeName();
    story = biography(hist, sh, done);
    const fill = frozen / (3 * maxR * (maxR + 1) + 1);
    if (fill > 0.6) secrets.find('lettre');
    if (done >= 12) secrets.find('collection');
    [0, 2, 4, 5].forEach((d, k) => audio.note(d + 3, { type: 'glass', vel: 0.09, at: k * 0.12, dur: 3.2, send: 0.7 }));
    audio.noise({ freq: 5000, q: 0.5, dur: 1.4, vel: 0.05, type: 'highpass', sweep: 0.3 });
    reset();
  }
  const slotPos = k => [strip.x + (k + 0.5) * (strip.w / slots), strip.y + strip.h / 2];
  function melt(f) {
    if (f.melt) return;
    f.melt = 0.001;
    audio.play(audio.freq(6 + (f.slot % 4), 1), { type: 'drop', vel: 0.08, dur: 0.8, pan: (slotPos(f.slot)[0] / W) * 2 - 1 });
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
    histT += dt;
    if (histT > 0.5) { histT = 0; hist.samples.push([beta, gamma]); if (hist.samples.length > 160) hist.samples.splice(1, 1); }

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
    shade(t);

    const sh = shapeName(), lab = `flocon n° ${done + 1} · ${sh}`;
    if (lab !== label) { label = lab; api.label(lab); }

    // des éclats de lumière courent sur les arêtes de la glace
    if (glints.length < 9 && Math.random() < dt * 9) {
      for (let tries = 0; tries < 40; tries++) {
        const i = (Math.random() * NN) | 0;
        if (TK[i] > 0 && (TK[i + 1] === 0 || TK[i - 1] === 0 || TK[i + N] === 0 || TK[i - N] === 0)) {
          const qq = i % N, r = (i / N) | 0;
          glints.push({ x: (qq - M + (r - M) / 2) * cell, y: (r - M) * SQ3 * cell, t: 0, life: 0.5 + Math.random() * 0.5 });
          break;
        }
      }
    }
    for (let i = glints.length - 1; i >= 0; i--) { glints[i].t += dt; if (glints[i].t > glints[i].life) glints.splice(i, 1); }

    // le flocon fini descend se poser sur le velours ; quand il n'y a plus de place, le plus ancien fond
    for (let i = travelling.length - 1; i >= 0; i--) {
      const f = travelling[i];
      f.t += dt;
      if (f.t > 2.4) {
        travelling.splice(i, 1);
        const live = resting.filter(r => !r.melt);
        if (live.length >= slots) melt(live[0]);
        resting.push({ img: f.img, slot: -1, t: 0, melt: 0 });
        if (resting.filter(r => !r.melt).length >= slots) secrets.find('bentley');
      }
    }
    for (let i = resting.length - 1; i >= 0; i--) {
      const f = resting[i];
      f.t += dt;
      if (f.melt) { f.melt += dt; if (f.melt > 2.2) resting.splice(i, 1); }
    }
    let k = 0;
    for (const f of resting) if (!f.melt) f.slot = k++;
    if (story) story.t += dt;
    for (let i = puffs.length - 1; i >= 0; i--) { puffs[i].t += dt; if (puffs[i].t > 1.6) puffs.splice(i, 1); }

    if (sparkles.length < 90 && Math.random() < dt * 30) sparkles.push({ x: Math.random() * W, y: -4, vy: 10 + Math.random() * 25, ph: Math.random() * TAU });
    for (let i = sparkles.length - 1; i >= 0; i--) { const p = sparkles[i]; p.y += p.vy * dt; p.x += Math.sin(t + p.ph) * 6 * dt; if (p.y > H + 4) sparkles.splice(i, 1); }
    for (const b of bokeh) { b.y += b.vy * dt; b.x += Math.sin(t * 0.3 + b.ph) * 5 * dt; if (b.y > H + b.r) { b.y = -b.r; b.x = Math.random() * W; } }
  }

  function draw(ctx, t) {
    blit(ctx, bg);
    // de gros flocons flous, très loin derrière
    ctx.globalCompositeOperation = 'lighter';
    const bk = glow([150, 180, 240], 32, 0.5);
    for (const b of bokeh) drawGlow(ctx, bk, b.x, b.y, b.r, 0.05);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // le flocon en train de naître
    const size = 2 * M * cell;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(rc, cx - size / 2, cy - size / 2, size, size);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    ctx.drawImage(rc, cx - size / 2, cy - size / 2, size, size);
    ctx.globalAlpha = 1;
    drawGlow(ctx, glow([170, 200, 255], 64), cx, cy, maxR * cell * 1.3 + 40, 0.1 + breath * 0.3);
    const gl = glow([240, 248, 255], 16, 0.3);
    for (const g of glints) { const k = Math.sin((g.t / g.life) * Math.PI); drawGlow(ctx, gl, cx + g.x, cy + g.y, 5 + k * 6, k * 0.9); }
    for (const p of puffs) { const k = p.t / 1.6; drawGlow(ctx, glow([200, 225, 255], 64), p.x, p.y, 40 + k * 160, (1 - k) * 0.2); }
    const sp = glow([230, 240, 255], 8);
    for (const p of sparkles) drawGlow(ctx, sp, p.x, p.y, 3, 0.5 + 0.5 * Math.sin(t * 5 + p.ph));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    drawStory(ctx);
    drawStrip(ctx, t);
    // les flocons finis, en route vers le velours
    for (const f of travelling) {
      const k = easeInOut(clamp(f.t / 2.4, 0, 1));
      const live = resting.filter(r => !r.melt).length;
      const [tx, ty] = slotPos(Math.min(slots - 1, live));
      const sz = lerp(f.size, 56, k);
      ctx.globalAlpha = 1;
      ctx.drawImage(f.img, lerp(f.x, tx, k) - sz / 2, lerp(f.y, ty, k) - sz / 2 - Math.sin(k * Math.PI) * 30, sz, sz);
    }
    drawDiagram(ctx);
  }

  // la fiche du flocon qui vient de naître : son nom, et ce qu'il a traversé
  function drawStory(ctx) {
    if (!story || story.t > 9) return;
    const a = clamp(story.t / 0.8, 0, 1) * clamp((9 - story.t) / 1.4, 0, 1);
    const y = Math.min(cy + M * cell * 0.86 + 26, strip.y - 70);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '400 9.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillStyle = `rgba(200,220,255,${0.6 * a})`;
    ctx.fillText(story.title.toUpperCase(), W / 2, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.font = `italic 300 ${W < 600 ? 15 : 18}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = `rgba(235,242,255,${0.9 * a})`;
    const maxW = Math.min(W - 40, 640), words = story.text.split(' '), lines = [];
    let line = '';
    for (const w of words) { const tt = line ? line + ' ' + w : w; if (line && ctx.measureText(tt).width > maxW) { lines.push(line); line = w; } else line = tt; }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 18 + i * 21));
  }

  // le velours de Bentley : les flocons y reposent, côte à côte ; on peut souffler dessus pour les faire fondre
  function drawStrip(ctx, t) {
    const { x, y, w, h } = strip;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(2,3,8,0.55)');
    g.addColorStop(1, 'rgba(6,8,16,0.8)');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const f of resting) {
      const k = f.melt ? clamp(f.melt / 2.2, 0, 1) : 0;
      const [sx, sy] = slotPos(f.slot >= 0 ? f.slot : 0);
      const appear = clamp(f.t / 0.5, 0, 1), sz = 56 * (1 - k * 0.7);
      ctx.globalAlpha = appear * (1 - k);
      ctx.drawImage(f.img, sx - sz / 2, sy - sz / 2, sz, sz);
      ctx.globalAlpha = 1;
      if (k > 0) {
        // la goutte : elle se forme, puis glisse hors du velours
        const dy = k > 0.5 ? (k - 0.5) * 2 * 40 : 0;
        ctx.fillStyle = `rgba(190,215,255,${0.75 * (1 - Math.max(0, k - 0.75) * 4)})`;
        ctx.beginPath(); ctx.arc(sx, sy + dy, 2 + k * 4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(sx - 1.5, sy + dy - 1.5, 1.2, 0, TAU); ctx.fill();
      }
    }
    ctx.font = '400 8px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(200,220,255,0.28)';
    ctx.fillText(w > 420 ? 'VELOURS NOIR · À LA MANIÈRE DE W. BENTLEY' : 'VELOURS NOIR', x + w - 8, y + h - 6);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // Diagramme de Nakaya, en miniature : où se trouve le ciel que tu choisis
  function drawDiagram(ctx) {
    const w = 132, h = 92, x0 = diag.x, y0 = diag.y;
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

  function tap(p) {
    // sur le velours : souffler sur un flocon le fait fondre
    if (p.y > strip.y - 10 && p.y < strip.y + strip.h + 10 && p.x > strip.x && p.x < strip.x + strip.w) {
      const f = resting.find(r => !r.melt && Math.abs(slotPos(r.slot)[0] - p.x) < strip.w / slots / 2);
      if (f) melt(f);
      return;
    }
    breath = 1; // un souffle d'air humide : le flocon se ramifie d'un coup
    hist.breaths++;
    puffs.push({ x: p.x, y: p.y, t: 0 });
    audio.noise({ freq: 2600, q: 0.6, dur: 0.9, vel: 0.06, type: 'bandpass', sweep: 0.5 });
  }
  function longpress() { if (maxR > 8) finishFlake(); }

  // le velours se souvient : les flocons posés reviennent (en petites images), et la numérotation continue
  {
    const saved = api.memory?.get('flocons');
    if (saved) {
      done = Math.max(0, saved.done | 0);
      for (const src of (saved.flakes || []).slice(-slots)) {
        if (typeof src !== 'string' || !src.startsWith('data:image/')) continue;
        const img = new Image();
        img.src = src;
        resting.push({ img, src, slot: -1, t: 3, melt: 0 });
      }
    }
  }
  function save() {
    const flakes = [];
    for (const f of resting) {
      if (f.melt) continue;
      try {
        if (f.src) { flakes.push(f.src); continue; }
        const c = makeCanvas(96, 96);
        c.getContext('2d').drawImage(f.img, 0, 0, 96, 96);
        f.src = c.toDataURL('image/png');
        flakes.push(f.src);
      } catch (_) { /* image pas encore prête : tant pis pour celle-là */ }
    }
    api.memory?.set('flocons', { done, flakes });
  }
  return { resize, update, draw, tap, longpress, save, destroy() {} };
}
