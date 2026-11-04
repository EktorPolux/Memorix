// Sève — L'Atelier de Fourier : toute forme fermée est une somme de cercles qui tournent.
// Ptolémée empilait déjà des épicycles pour imiter le ciel ; Fourier a montré qu'on peut tout imiter ainsi.
import { TAU, clamp, glow, drawGlow, hslToRgb } from '../engine.js';

export const mood = { root: 130.81, scale: 'majPenta', wave: 'sine', chord: [0, 7, 12], pad: 0.03, cutoff: 900, lfo: 0.03, motif: false };

const N = 256;
const PERIOD = 14; // secondes pour que la chaîne fasse un tour
const STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const COS = new Float64Array(N), SIN = new Float64Array(N);
for (let i = 0; i < N; i++) { COS[i] = Math.cos((TAU * i) / N); SIN[i] = Math.sin((TAU * i) / N); }

// Polygone parcouru à vitesse constante
function polygon(verts, t) {
  const L = [];
  let tot = 0;
  for (let i = 0; i < verts.length; i++) { const a = verts[i], b = verts[(i + 1) % verts.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(l); tot += l; }
  let s = (t / TAU) * tot;
  for (let i = 0; i < verts.length; i++) {
    if (s <= L[i]) { const a = verts[i], b = verts[(i + 1) % verts.length], k = s / L[i]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
    s -= L[i];
  }
  return verts[0];
}
const STAR = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.42 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; });
const SQUARE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
// Le flocon de Koch, à la troisième génération : 192 sommets
const KOCH = (() => {
  let pts = [0, 1, 2].map(i => { const a = -Math.PI / 2 + (i * TAU) / 3; return [Math.cos(a), Math.sin(a)]; });
  for (let d = 0; d < 3; d++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const dx = (bx - ax) / 3, dy = (by - ay) / 3;
      const p1 = [ax + dx, ay + dy], p3 = [ax + 2 * dx, ay + 2 * dy];
      const p2 = [p1[0] + dx * 0.5 + dy * Math.sqrt(3) / 2, p1[1] + dy * 0.5 - dx * Math.sqrt(3) / 2];
      out.push([ax, ay], p1, p2, p3);
    }
    pts = out;
  }
  return pts;
})();
const CAT = [[0, 0.85], [0.45, 0.78], [0.78, 0.5], [0.9, 0.1], [0.85, -0.3], [0.95, -0.95], [0.5, -0.6], [0, -0.68], [-0.5, -0.6], [-0.95, -0.95], [-0.85, -0.3], [-0.9, 0.1], [-0.78, 0.5], [-0.45, 0.78]];
// le croissant : un grand arc de cercle à gauche, un arc plus plat qui revient par l'intérieur
const MOON = (() => {
  const pts = [], c = 0.42, R = Math.hypot(c, 1), a0 = Math.atan2(-1, -c), a1 = Math.atan2(1, -c);
  for (let i = 0; i <= 60; i++) { const a = Math.PI / 2 + (i / 60) * Math.PI; pts.push([Math.cos(a), Math.sin(a)]); }
  for (let i = 1; i < 60; i++) { const a = a0 - (i / 60) * (TAU - (a1 - a0)); pts.push([c + Math.cos(a) * R, Math.sin(a) * R]); }
  return pts;
})();

const GALLERY = [
  { name: 'Le Cœur', eq: 'x = 16 sin³t · y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t', f: t => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] },
  { name: "L'Ellipse", eq: 'Kepler, 1609 : deux cercles qui tournent en sens contraires suffisent à une orbite', f: t => [2 * Math.cos(t), Math.sin(t)], ellipse: true },
  { name: 'Le Carré', eq: 'quatre droites et quatre coins : le pire cauchemar des cercles', f: t => polygon(SQUARE, t), square: true },
  { name: 'La Cardioïde', eq: "x = 2 cos t − cos 2t · c'est la grande bulle de l'ensemble de Mandelbrot", f: t => [2 * Math.cos(t) - Math.cos(2 * t), 2 * Math.sin(t) - Math.sin(2 * t)] },
  { name: 'Le Papillon', eq: 'Temple Fay : r = e^(sin θ) − 2 cos 4θ + sin⁵((2θ − π)/24)', f: t => { const th = t * 6, r = Math.exp(Math.sin(th)) - 2 * Math.cos(4 * th) + Math.sin((2 * th - Math.PI) / 24) ** 5; return [Math.sin(th) * r, -Math.cos(th) * r]; } },
  { name: 'La Rose de Grandi', eq: 'r = cos 4θ · Guido Grandi les nommait rhodonées, en 1723 : huit pétales', f: t => { const r = Math.cos(4 * t); return [Math.cos(t) * r, Math.sin(t) * r]; } },
  { name: 'Le Trèfle', eq: 'x = sin t + 2 sin 2t · y = cos t − 2 cos 2t', f: t => [Math.sin(t) + 2 * Math.sin(2 * t), -(Math.cos(t) - 2 * Math.cos(2 * t))] },
  { name: 'La Néphroïde', eq: "x = 3 cos t − cos 3t · la tache de lumière au fond d'une tasse de café", f: t => [3 * Math.cos(t) - Math.cos(3 * t), 3 * Math.sin(t) - Math.sin(3 * t)] },
  { name: "L'Étoile", eq: 'cinq branches, dix sommets : il faut beaucoup de cercles pour une pointe', f: t => polygon(STAR, t) },
  { name: 'La Courbe de Lissajous', eq: 'x = sin 3t · y = sin 2t · Lissajous, 1857, avec deux diapasons et deux miroirs', f: t => [Math.sin(3 * t), Math.sin(2 * t)] },
  { name: 'La Superformule', eq: 'Gielis : r = (|cos(mθ/4)|^n₂ + |sin(mθ/4)|^n₃)^(−1/n₁)', f: t => { const m = 5, n1 = 2, n2 = 7, n3 = 7; const r = Math.pow(Math.abs(Math.cos((m * t) / 4)) ** n2 + Math.abs(Math.sin((m * t) / 4)) ** n3, -1 / n1); return [Math.cos(t) * r, Math.sin(t) * r]; } },
  { name: 'La Deltoïde', eq: 'Steiner, 1856 : un cercle qui roule dans un cercle trois fois plus grand', f: t => [2 * Math.cos(t) + Math.cos(2 * t), 2 * Math.sin(t) - Math.sin(2 * t)] },
  { name: 'La Lemniscate', eq: "Bernoulli : (x² + y²)² = 2a²(x² − y²), l'infini", f: t => { const d = 1 + Math.sin(t) ** 2; return [Math.cos(t) / d, (Math.sin(t) * Math.cos(t)) / d]; } },
  { name: 'Le Poisson', eq: 'x = cos t − sin²t / √2 · y = cos t sin t', f: t => [Math.cos(t) - Math.sin(t) ** 2 / Math.SQRT2, Math.cos(t) * Math.sin(t)] },
  { name: "L'Hypotrochoïde", eq: 'le spirographe : R = 5, r = 3, d = 5', f: t => { const th = t * 3; return [2 * Math.cos(th) + 5 * Math.cos((2 / 3) * th), 2 * Math.sin(th) - 5 * Math.sin((2 / 3) * th)]; } },
  { name: "L'Astroïde", eq: "x = cos³t · y = sin³t · ce qu'enveloppe une échelle qui glisse le long d'un mur", f: t => [Math.cos(t) ** 3, Math.sin(t) ** 3] },
  { name: 'Le Limaçon de Pascal', eq: 'r = 1 + 2 cos θ · Étienne Pascal, le père de Blaise : une boucle dans la boucle', f: t => { const r = 1 + 2 * Math.cos(t); return [Math.cos(t) * r, Math.sin(t) * r]; } },
  { name: 'Le Flocon de Koch', eq: 'von Koch, 1904 : un périmètre infini autour d\'une aire finie', f: t => polygon(KOCH, t) },
  { name: 'Le Croissant', eq: 'deux arcs de cercle : la Lune au cinquième jour', f: t => polygon(MOON, t) },
  { name: "L'Épicycloïde", eq: 'x = 6 cos t − cos 6t · un cercle qui roule autour d\'un autre : cinq pointes', f: t => [6 * Math.cos(t) - Math.cos(6 * t), 6 * Math.sin(t) - Math.sin(6 * t)] },
  { name: 'Le Chat', eq: 'quatorze sommets et deux oreilles pointues : les cercles ronronnent', f: t => polygon(CAT, t) },
];

// Transformée de Fourier discrète : c_k = (1/N) Σ z_n e^(−2iπkn/N)
function dft(pts) {
  const out = [];
  for (let k = -N / 2; k < N / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const idx = (((-k * n) % N) + N) % N;
      const c = COS[idx], s = SIN[idx], [x, y] = pts[n];
      re += x * c - y * s;
      im += x * s + y * c;
    }
    re /= N; im /= N;
    out.push({ k, re, im, amp: Math.hypot(re, im), ph: Math.atan2(im, re) });
  }
  return out.sort((a, b) => b.amp - a.amp);
}

// Rééchantillonner un tracé à main levée : N points également espacés sur la boucle refermée
function resample(raw) {
  const pts = raw.concat([raw[0]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = cum[cum.length - 1], out = [];
  let j = 0;
  for (let n = 0; n < N; n++) {
    const s = (n / N) * tot;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k]);
  }
  return out;
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  let W = api.W, H = api.H, cx = 0, cy = 0, S = 1;
  let shape = null, coeffs = [], nIdx = 11, tau = 0, trail = [], galleryIdx = 0, periods = 0, minusUsed = false;
  let drawing = null, voice = null;

  // ——— La barre : forme suivante, moins de cercles, plus de cercles, écouter
  const bar = document.createElement('div');
  bar.className = 'realm-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Atelier de Fourier');
  const mk = (label, aria, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.addEventListener('click', fn); bar.append(b); return b; };
  mk('↻ Forme', 'Forme suivante', () => nextShape());
  mk('−', 'Moins de cercles', () => setN(nIdx - 1, true));
  const count = document.createElement('span');
  count.className = 'count';
  bar.append(count);
  mk('+', 'Plus de cercles', () => setN(nIdx + 1));
  const listenBtn = mk('♪ Écouter', 'Écouter la forme', () => toggleVoice());
  listenBtn.setAttribute('aria-pressed', 'false');
  document.getElementById('ui').append(bar);

  function setN(i, minus = false) {
    nIdx = clamp(i, 0, STEPS.length - 1);
    count.textContent = `${STEPS[nIdx]} cercle${STEPS[nIdx] > 1 ? 's' : ''}`;
    trail = [];
    if (minus) minusUsed = true;
    if (shape?.square && minusUsed && STEPS[nIdx] <= 24) secrets.find('gibbs');
    if (shape?.ellipse && STEPS[nIdx] === 2) secrets.find('kepler');
    audio.note(nIdx, { type: 'glass', vel: 0.06, dur: 1.2 });
  }

  function useShape(sh) {
    shape = sh;
    coeffs = dft(sh.pts);
    tau = 0; trail = []; periods = 0;
    if (voice) { stopVoice(); startVoice(); }
  }
  function gallery(i) {
    galleryIdx = (i + GALLERY.length) % GALLERY.length;
    const g = GALLERY[galleryIdx];
    let pts = Array.from({ length: N }, (_, n) => g.f((n / N) * TAU));
    // centrer et ramener dans le cercle unité
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= N; my /= N;
    let r = 0;
    for (const [x, y] of pts) r = Math.max(r, Math.hypot(x - mx, y - my));
    pts = pts.map(([x, y]) => [(x - mx) / r, (y - my) / r]);
    useShape({ name: g.name, eq: g.eq, pts, unit: true, square: !!g.square, ellipse: !!g.ellipse });
    setN(11);
  }
  function nextShape() { gallery(galleryIdx + 1); }

  function resize(w, h) { W = w; H = h; cx = W / 2; cy = H / 2 - (H > W ? 20 : 10); S = Math.min(W, H) * (H > W ? 0.36 : 0.3); }
  resize(W, H);
  gallery(0);

  // ——— La voix des formes : x dans l'oreille gauche, y dans la droite
  function startVoice() {
    if (!audio.ready || !coeffs.length) return;
    const ctx = audio.ctx, M = 64;
    const rx = new Float32Array(M + 1), ix = new Float32Array(M + 1), ry = new Float32Array(M + 1), iy = new Float32Array(M + 1);
    for (const c of coeffs) {
      const m = Math.abs(c.k);
      if (m === 0 || m > M) continue;
      const A = c.amp, cp = Math.cos(c.ph), sp = Math.sin(c.ph);
      if (c.k > 0) { rx[m] += A * cp; ix[m] -= A * sp; ry[m] += A * sp; iy[m] += A * cp; }
      else { rx[m] += A * cp; ix[m] += A * sp; ry[m] += A * sp; iy[m] -= A * cp; }
    }
    const t = ctx.currentTime;
    const ox = ctx.createOscillator(), oy = ctx.createOscillator();
    ox.setPeriodicWave(ctx.createPeriodicWave(rx, ix));
    oy.setPeriodicWave(ctx.createPeriodicWave(ry, iy));
    ox.frequency.value = oy.frequency.value = 98;
    const merge = ctx.createChannelMerger(2);
    ox.connect(merge, 0, 0);
    oy.connect(merge, 0, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.6);
    merge.connect(lp).connect(g).connect(audio.master);
    ox.start(); oy.start();
    voice = { ox, oy, g };
    secrets.find('oscilloscope');
  }
  function stopVoice() {
    if (!voice) return;
    const { ox, oy, g } = voice, t = audio.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.15);
    ox.stop(t + 0.8); oy.stop(t + 0.8);
    ox.onended = () => g.disconnect();
    voice = null;
  }
  function toggleVoice() {
    if (voice) stopVoice(); else startVoice();
    listenBtn.setAttribute('aria-pressed', String(!!voice));
    if (!audio.ready) api.toast({ kicker: 'Silence', title: 'Le son dort encore', text: 'Touche la graine du Seuil avec le son activé pour réveiller les voix.', ms: 4000 });
  }

  function update(dt) {
    if (drawing) return;
    const prev = tau;
    tau = (tau + dt / PERIOD) % 1;
    if (tau < prev) {
      periods++;
      trail = trail.slice(-40);
      if (!shape.user && periods >= 2 && !voice) gallery(galleryIdx + 1);
    }
  }

  function draw(ctx, t) {
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, W, H);
    // une grille polaire très discrète, comme un cadran
    ctx.strokeStyle = 'rgba(120,150,220,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = S * 0.25; r < Math.max(W, H); r += S * 0.25) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * Math.max(W, H), cy + Math.sin(a) * Math.max(W, H)); }
    ctx.stroke();

    if (drawing) {
      ctx.strokeStyle = 'rgba(255,214,140,0.85)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      drawing.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      return;
    }
    const sc = shape.unit ? S : 1, ox = shape.unit ? cx : cx, oy = shape.unit ? cy : cy;
    // la forme visée, en pointillés
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(200,210,255,0.16)';
    ctx.beginPath();
    shape.pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * sc, oy + y * sc) : ctx.moveTo(ox + x * sc, oy + y * sc)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // la chaîne des cercles : le plus grand d'abord, chacun tourne à sa fréquence
    const n = Math.min(STEPS[nIdx], coeffs.length);
    let x = ox, y = oy;
    const buckets = [[], [], []];
    for (let j = 0; j < n; j++) {
      const c = coeffs[j], r = c.amp * sc, a = TAU * c.k * tau + c.ph;
      const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
      buckets[j < 6 ? 0 : j < 30 ? 1 : 2].push([x, y, r, nx, ny]);
      x = nx; y = ny;
    }
    const cols = ['rgba(255,214,140,0.42)', 'rgba(170,200,255,0.2)', 'rgba(130,220,255,0.1)'];
    buckets.forEach((b, i) => {
      ctx.strokeStyle = cols[i];
      ctx.lineWidth = i ? 0.8 : 1.2;
      ctx.beginPath();
      for (const [x0, y0, r, x1, y1] of b) {
        if (r > 1.2) { ctx.moveTo(x0 + r, y0); ctx.arc(x0, y0, r, 0, TAU); }
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    });
    trail.push([x, y]);
    if (trail.length > 1200) trail.shift();
    // le tracé : plus il est récent, plus il brille
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const L = trail.length, chunk = 40;
    for (let s = 0; s < L - 1; s += chunk) {
      const k = (s + chunk) / L;
      const c = hslToRgb(30 + k * 300, 85, 65);
      ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.15 + k * 0.8})`;
      ctx.lineWidth = 1.2 + k * 1.4;
      ctx.beginPath();
      for (let i = s; i <= Math.min(L - 1, s + chunk); i++) (i === s ? ctx.moveTo : ctx.lineTo).call(ctx, trail[i][0], trail[i][1]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 220, 160], 16), x, y, 9, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // le nom de la forme, et son équation
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `italic 300 ${W < 560 ? 24 : 30}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(shape.name, W / 2, 70);
    if (!shape.user) {
      ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(200,210,255,0.3)';
      ctx.fillText(`${galleryIdx + 1} / ${GALLERY.length}`, W / 2, 56);
    }
    ctx.font = '400 10px "DM Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(200,210,255,0.5)';
    ctx.fillText(shape.eq, W / 2, 108, W - 40);
  }

  // ——— Gestes : dessiner une boucle, ou toucher pour changer de forme
  function down(p) { drawing = [[p.x, p.y]]; }
  function move(p) {
    if (!drawing || p.hover) return;
    const [lx, ly] = drawing[drawing.length - 1];
    if (Math.hypot(p.x - lx, p.y - ly) > 2) drawing.push([p.x, p.y]);
  }
  function up() {
    const d = drawing;
    drawing = null;
    if (!d) return;
    let len = 0;
    for (let i = 1; i < d.length; i++) len += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
    if (len < 140 || d.length < 10) return;
    const pts = resample(d).map(([x, y]) => [x - cx, y - cy]);
    useShape({ name: 'Ton dessin', eq: `${N} points · ${N} cercles possibles · le premier n'est que le centre de gravité`, pts, unit: false, user: true });
    setN(13);
    // un seul cercle porte presque toute la forme : c'est l'épicycle de Ptolémée
    const moving = coeffs.filter(c => c.k !== 0);
    const tot = moving.reduce((s, c) => s + c.amp * c.amp, 0);
    if (moving.length && (moving[0].amp * moving[0].amp) / tot > 0.93) secrets.find('ptolemee');
    [0, 4, 7, 11].forEach((dd, i) => audio.note(dd, { type: 'bell', vel: 0.08, at: i * 0.08, dur: 2 }));
  }
  function tap() { nextShape(); }

  return {
    resize, update, draw, down, move, up, tap,
    destroy() { stopVoice(); bar.remove(); },
  };
}
