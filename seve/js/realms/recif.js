// Sève — Le Récif de Collatz : si pair, divise par deux ; sinon, triple et ajoute un. Chaque nombre rentre à 1 (on le croit).
// Chaque corail est une colonie de plusieurs arbres de Collatz nés du même pied, certains en miroir : une lyre,
// une gorgone en éventail, un cœur, des herbes, une harpe. Autour, six espèces de méduses qui ont chacune leur nage.
import { TAU, clamp, lerp, glow, drawGlow, rgba, mixRgb, hexToRgb, makeNoise, hslToRgb, angleDiff, rng, makeCanvas } from '../engine.js';

export const mood = {
  root: 82.41, scale: 'minPenta', wave: 'sine', chord: [0, 7, 12, 15], pad: 0.055, cutoff: 520, lfo: 0.025, droneOct: 1,
  noise: { type: 'lowpass', freq: 300, q: 0.7, gain: 0.02, gust: 0.6, gustRate: 0.06 },
};

const CYCLE = 120; // marée du jour et de la nuit
const next = n => (n % 2 ? 3 * n + 1 : n / 2);

// L'arbre inverse de Collatz : 1 à la racine, chaque nombre accroché à celui qu'il devient.
// m = 1 ou −1 (le miroir), base = l'angle de départ de la branche dans sa colonie.
function buildPlant(N, turnEven, turnOdd, m, base) {
  const map = new Map();
  const root = { n: 1, parent: null, kids: [], depth: 0 };
  map.set(1, root);
  for (let s = 2; s <= N; s++) {
    const chain = [];
    let x = s;
    while (!map.has(x)) { chain.push(x); x = next(x); }
    let parent = map.get(x);
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = { n: chain[i], parent, kids: [], depth: parent.depth + 1 };
      parent.kids.push(node);
      map.set(chain[i], node);
      parent = node;
    }
  }
  // ordre en largeur, et taille des sous-arbres (le « trafic » qui épaissit les tiges)
  const order = [root];
  for (let i = 0; i < order.length; i++) order.push(...order[i].kids);
  for (let i = order.length - 1; i >= 0; i--) { const n = order[i]; n.size = 1 + n.kids.reduce((s, c) => s + c.size, 0); }
  let minX = 0, maxX = 0, minY = 0, maxD = 0;
  root.ua = base; root.ux = 0; root.uy = 0;
  for (const n of order) {
    if (!n.parent) continue;
    n.turn = (n.n % 2 === 0 ? turnEven : -turnOdd) * m;
    n.ua = n.parent.ua + n.turn;
    n.ux = n.parent.ux + Math.sin(n.ua);
    n.uy = n.parent.uy - Math.cos(n.ua);
    minX = Math.min(minX, n.ux); maxX = Math.max(maxX, n.ux); minY = Math.min(minY, n.uy);
    maxD = Math.max(maxD, n.depth);
  }
  return { root, map, order, bbox: { minX, maxX, minY }, maxD, base };
}

// Les colonies : [N, angle pair, angle impair, miroir, angle de départ] pour chaque branche ;
// emplacement [x, largeur, hauteur] en paysage (L) et en portrait (P)
const COLONIES = [
  { id: 'lyre', hue: 172, sat: 58, k: 1.15, L: [0.5, 0.48, 0.84], P: [0.5, 0.94, 0.5], copies: [[820, 0.151, 0.279, 1, -0.12], [820, 0.151, 0.279, -1, 0.12]] },
  { id: 'gorgone', hue: 340, sat: 62, k: 0.8, L: [0.15, 0.27, 0.5], P: [0.2, 0.4, 0.22], copies: [-0.58, -0.29, 0, 0.29, 0.58].map((b, i) => [230, 0.12, 0.2, i % 2 ? -1 : 1, b]) },
  { id: 'coeur', hue: 350, sat: 60, k: 0.7, L: [0.86, 0.21, 0.56], P: [0.82, 0.32, 0.25], copies: [[300, 0.08, 0.244, 1, 0.25], [300, 0.08, 0.244, -1, -0.25]] },
  { id: 'herbes', hue: 118, sat: 52, k: 0.75, L: [0.31, 0.19, 0.36], P: [0.37, 0.3, 0.19], copies: [-0.55, -0.2, 0.2, 0.55].map((b, i) => [160, 0.07, 0.14, i % 2 ? -1 : 1, b]) },
  { id: 'harpe', hue: 222, sat: 64, k: 0.8, L: [0.69, 0.22, 0.27], P: [0.64, 0.32, 0.14], copies: [[260, 0.19, 0.38, -1, -0.3], [260, 0.19, 0.38, 1, 0.3]] },
];

// Les méduses : six espèces, six nages
const SPECIES = {
  // la méduse lune : cloche de verre, quatre fers à cheval roses, une frange de fils
  aurelia: { label: 'méduse lune', r: [18, 25], rate: 1.25, power: 72, turn: 0.45, bell: [205, 228, 255], alpha: 0.2, rim: [190, 220, 255], tent: [210, 232, 255], glow: [150, 200, 255],
    tents: { n: 18, segs: 6, seg: 4 }, arms: { n: 4, segs: 9, seg: 5, w: 3, col: [255, 190, 225] } },
  // le cténophore : pas de cloche qui bat, des rangées de cils qui décomposent la lumière en arc-en-ciel
  cteno: { label: 'cténophore', r: [12, 17], rate: 0, power: 16, turn: 0.6, bell: [200, 235, 255], alpha: 0.12, rim: [200, 240, 255], tent: [255, 230, 240], glow: [180, 220, 255],
    tents: { n: 2, segs: 24, seg: 7 } },
  // l'ortie de mer : cloche d'or rayée, longs bras de dentelle, filaments pourpres
  chrysaora: { label: 'ortie de mer', r: [20, 27], rate: 0.95, power: 82, turn: 0.35, bell: [236, 138, 52], alpha: 0.55, rim: [255, 190, 120], tent: [170, 50, 60], glow: [255, 170, 90],
    tents: { n: 12, segs: 22, seg: 7 }, arms: { n: 4, segs: 15, seg: 7, w: 5, col: [255, 236, 210] } },
  // la méduse à fleurs : des bouquets de tentacules roses, jaunes et verts, qui s'allument au bout
  olindias: { label: 'méduse à fleurs', r: [16, 22], rate: 1.5, power: 76, turn: 0.5, bell: [210, 240, 230], alpha: 0.18, rim: [150, 255, 190], tent: [255, 150, 200], glow: [170, 255, 200],
    tents: { n: 20, segs: 9, seg: 4, colors: [[255, 120, 190], [255, 220, 90], [120, 255, 170]] } },
  // la méduse cristal : celle qui a donné au monde la protéine fluorescente verte
  aequorea: { label: 'méduse cristal', r: [20, 26], rate: 1.05, power: 66, turn: 0.4, bell: [220, 240, 255], alpha: 0.13, rim: [120, 255, 150], tent: [220, 245, 255], glow: [110, 255, 140], flat: 0.62,
    tents: { n: 26, segs: 14, seg: 6 } },
  // l'Atolla des abysses : rouge sombre, une couronne, et une alarme bleue quand on la dérange
  atolla: { label: 'Atolla', r: [16, 22], rate: 1.7, power: 86, turn: 0.55, bell: [150, 18, 40], alpha: 0.75, rim: [210, 50, 70], tent: [200, 60, 80], glow: [80, 140, 255],
    tents: { n: 14, segs: 5, seg: 4, long: { segs: 34, seg: 8 } } },
};
const ORDER = ['aurelia', 'chrysaora', 'cteno', 'olindias', 'aequorea', 'atolla'];

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(29);
  const q = engine.quality;
  const R = rng(2718);
  let W = api.W, H = api.H, seabed = 0;
  const colonies = COLONIES.map(c => {
    const copies = c.copies.map(([N, e, o, m, base]) => ({ ...buildPlant(Math.max(60, Math.round(N * q)), e, o, m, base), ph: R() * TAU }));
    let minX = 0, maxX = 0, minY = 0;
    for (const p of copies) { minX = Math.min(minX, p.bbox.minX); maxX = Math.max(maxX, p.bbox.maxX); minY = Math.min(minY, p.bbox.minY); }
    return { ...c, copies, bbox: { minX, maxX, minY } };
  });
  const plants = colonies.flatMap(c => c.copies.map(p => Object.assign(p, { col: c })));
  const main = colonies[0].copies[0];
  let selected = null, selT = 0, lastMelody = -9;
  const plankton = [], bubbles = [], jellies = [], sparks = [], rocks = [];
  let digits = '';
  // Les coraux bougent lentement : on les peint sur un calque, repeint quinze fois par seconde, pas à chaque image
  let coralCv = null, coralCtx = null, coralDirty = true;

  function layout() {
    seabed = H - Math.max(40, H * 0.08);
    const portrait = H > W;
    for (const c of colonies) {
      const [fx, fw, fh] = portrait ? c.P : c.L;
      const bw = c.bbox.maxX - c.bbox.minX, bh = -c.bbox.minY;
      c.Lu = Math.min((W * fw) / bw, ((seabed - 80) * fh) / bh);
      c.rootX = W * fx - ((c.bbox.minX + c.bbox.maxX) / 2) * c.Lu;
      c.rootY = seabed + 4;
      c.wk = clamp(c.Lu / 3, 0.55, 2.2) * c.k;
    }
    rocks.length = 0;
    for (const c of colonies) {
      const n = 2 + ((c.hue / 60) | 0) % 2;
      for (let i = 0; i < n; i++) rocks.push({ x: c.rootX + (i - (n - 1) / 2) * 16 + Math.sin(c.hue + i) * 6, w: 22 + ((c.hue * (i + 3)) % 18), h: 9 + ((c.hue * (i + 7)) % 7) });
    }
  }
  // couleurs et épaisseurs, regroupées une fois pour tracer vite
  for (const p of plants) {
    p.groups = new Map();
    for (const n of p.order) {
      if (!n.parent) continue;
      const band = Math.min(7, Math.floor((n.depth / (p.maxD + 1)) * 8));
      const wq = Math.min(7, Math.floor(Math.log2(n.size + 1)));
      const key = band * 10 + wq;
      let g = p.groups.get(key);
      if (!g) p.groups.set(key, (g = { band, wq, nodes: [] }));
      g.nodes.push(n);
    }
    p.tips = p.order.filter(n => n.kids.length === 0);
    p.sway = new Float32Array(p.maxD + 2);
  }
  const tipCount = plants.reduce((s, p) => s + p.tips.length, 0);
  const tipStep = Math.max(1, Math.ceil(tipCount / (520 * q)));
  function resize(w, h) {
    W = w; H = h;
    layout();
    coralDirty = true;
    if (!plankton.length) for (let i = 0; i < Math.round(280 * q); i++) plankton.push({ x: Math.random() * W, y: Math.random() * H, lit: 0, sd: Math.random() * 100 });
  }
  resize(W, H);

  // ——— Méduses
  const toWorld = (j, lx, ly) => { const c = Math.cos(j.a), s = Math.sin(j.a); return [j.x + lx * c - ly * s, j.y + lx * s + ly * c]; };
  function bellSize(j) {
    const sp = SPECIES[j.sp], c = j.c;
    return sp.rate ? [j.r * (1 - 0.2 * c), j.r * (0.76 + 0.3 * c) * (sp.flat || 1)] : [j.r * 0.62, j.r];
  }
  function anchors(j) {
    const sp = SPECIES[j.sp], [rw, rh] = bellSize(j), out = [];
    if (j.sp === 'cteno') return [[-rw * 0.35, rh * 0.7], [rw * 0.35, rh * 0.7]];
    const n = sp.tents.n;
    for (let k = 0; k < n; k++) out.push([lerp(-rw * 0.94, rw * 0.94, (k + 0.5) / n), -rh * 0.02]);
    return out;
  }
  function spawnJelly(sp, x, y, r) {
    const S = SPECIES[sp], js = clamp(Math.min(W, H) / 720, 0.75, 1.35); // les méduses à l'échelle de l'écran
    const j = { sp, x, y, vx: 0, vy: 0, a: (Math.random() - 0.5) * 1.2, r: r || lerp(S.r[0], S.r[1], Math.random()) * js, js, ph: Math.random() * TAU, c: 0, tx: x, ty: y, tT: 0, taps: [], alarm: 0, tents: [], arms: [], hue0: Math.random() * 360 };
    const mk = (lx, ly, segs, seg) => { seg *= j.r / 22; const pts = []; for (let s = 0; s < segs; s++) { const [wx, wy] = toWorld(j, lx, ly + s * seg); pts.push({ x: wx, y: wy, px: wx, py: wy }); } return { pts, seg }; };
    anchors(j).forEach(([lx, ly], k) => {
      const long = S.tents.long && k === Math.floor(S.tents.n / 2);
      j.tents.push({ ...mk(lx, ly, long ? S.tents.long.segs : S.tents.segs, long ? S.tents.long.seg : S.tents.seg), k, long });
    });
    if (S.arms) for (let k = 0; k < S.arms.n; k++) j.arms.push({ ...mk(lerp(-0.3, 0.3, (k + 0.5) / S.arms.n) * j.r, -j.r * 0.1, S.arms.segs, S.arms.seg), k });
    pickTarget(j);
    jellies.push(j);
    return j;
  }
  function pickTarget(j) {
    j.tx = W * (0.06 + 0.88 * Math.random());
    j.ty = lerp(70, seabed - 110, Math.pow(Math.random(), 0.85));
    j.tT = 10 + Math.random() * 16;
  }
  ORDER.forEach((sp, i) => spawnJelly(sp, W * (0.1 + 0.8 * ((i * 0.618) % 1)), H * (0.15 + 0.55 * ((i * 0.37) % 1))));

  function stepChain(ch, ax, ay, dt, t, g, k) {
    const pts = ch.pts;
    pts[0].x = ax; pts[0].y = ay;
    for (let s = 1; s < pts.length; s++) {
      const p = pts[s];
      const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
      p.px = p.x; p.py = p.y;
      p.x += vx + Math.sin(t * 1.7 + s * 0.5 + k) * 0.08;
      p.y += vy + g * dt * dt;
    }
    for (let it = 0; it < 3; it++) {
      for (let s = 1; s < pts.length; s++) {
        const a0 = pts[s - 1], b0 = pts[s];
        const dx = b0.x - a0.x, dy = b0.y - a0.y, d = Math.hypot(dx, dy) || 1, diff = (d - ch.seg) / d;
        if (s > 1) { a0.x += dx * diff * 0.5; a0.y += dy * diff * 0.5; b0.x -= dx * diff * 0.5; b0.y -= dy * diff * 0.5; }
        else { b0.x -= dx * diff; b0.y -= dy * diff; }
      }
    }
  }

  function layoutPlant(p, c, t) {
    const amp = 0.0042;
    for (let d = 0; d <= p.maxD + 1; d++) p.sway[d] = Math.sin(t * 0.55 - d * 0.08 + p.ph) * amp + noise.n2(d * 0.05, t * 0.1 + p.ph) * amp * 0.6;
    for (const n of p.order) {
      if (!n.parent) { n.a = p.base; n.x = c.rootX; n.y = c.rootY; continue; }
      n.a = n.parent.a + n.turn + p.sway[n.depth];
      n.x = n.parent.x + Math.sin(n.a) * c.Lu;
      n.y = n.parent.y - Math.cos(n.a) * c.Lu;
    }
  }

  function paintCoral(t) {
    const dpr = engine.dpr || 1, w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (!coralCv || coralCv.width !== w || coralCv.height !== h) { coralCv = makeCanvas(w, h); coralCtx = coralCv.getContext('2d'); }
    const g = coralCtx, day = 0.5 + 0.5 * Math.sin((t / CYCLE) * TAU);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const c of colonies) drawColony(g, c, 1 - day);
    for (const rk of rocks) {
      const gr = g.createLinearGradient(0, seabed - rk.h, 0, seabed + rk.h * 0.6);
      gr.addColorStop(0, rgba(mixRgb([30, 36, 44], [62, 70, 78], day)));
      gr.addColorStop(1, rgba(mixRgb([8, 12, 16], [20, 26, 32], day)));
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(rk.x, seabed + 3, rk.w / 2, rk.h, 0, Math.PI, TAU); g.fill();
    }
  }

  function update(dt, t) {
    if (coralDirty || engine.frame % 5 === 0) {
      coralDirty = false;
      for (const c of colonies) for (const p of c.copies) layoutPlant(p, c, t);
      paintCoral(t);
    }
    // plancton : il s'allume quand on le dérange
    for (const pk of plankton) {
      pk.x += noise.n3(pk.x * 0.004, pk.y * 0.004, t * 0.05 + pk.sd) * 14 * dt;
      pk.y += (noise.n3(pk.x * 0.004 + 50, pk.y * 0.004, t * 0.05 + pk.sd) * 10 - 2) * dt;
      if (pk.y < -5) pk.y = H; if (pk.x < -5) pk.x = W; if (pk.x > W + 5) pk.x = 0;
      if (input.inside && Math.hypot(pk.x - input.x, pk.y - input.y) < 70 && Math.hypot(input.vx, input.vy) > 30) pk.lit = 1;
      pk.lit = Math.max(0, pk.lit - dt * 0.7);
    }
    // bulles depuis trois cheminées du fond
    if (Math.random() < dt * 5) {
      const v = [0.24, 0.58, 0.77][(Math.random() * 3) | 0];
      bubbles.push({ x: W * v + (Math.random() - 0.5) * 10, y: seabed, r: 1.4 + Math.random() * 3, vy: 35 + Math.random() * 40, ph: Math.random() * TAU });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(t * 3 + b.ph) * 14 * dt;
      if (b.y < -10) bubbles.splice(i, 1);
    }
    // les méduses : un cap, une destination, et la cloche qui pousse dans le sens de son sommet
    for (const j of jellies) {
      const S = SPECIES[j.sp];
      if (S.rate) { j.ph += dt * S.rate * TAU * 0.25; j.c = Math.pow(Math.max(0, Math.sin(j.ph)), 2); } else j.c = 0;
      j.tT -= dt;
      if (j.tT < 0 || Math.hypot(j.tx - j.x, j.ty - j.y) < 50) pickTarget(j);
      let want = Math.atan2(j.tx - j.x, -(j.ty - j.y));
      if (input.inside) {
        const dx = input.x - j.x, dy = input.y - j.y, d = Math.hypot(dx, dy);
        if (d < 240 && d > 20) {
          const toward = Math.atan2(dx, -dy);
          // l'Atolla fuit la main ; les autres sont curieuses
          want = j.sp === 'atolla' ? toward + Math.PI : want + angleDiff(toward, want) * 0.35;
        }
      }
      if (j.y < 60) want = Math.PI;
      if (j.y > seabed - 70) want = 0;
      j.a += clamp(angleDiff(want, j.a), -1, 1) * dt * S.turn + noise.n2(t * 0.2, j.hue0) * dt * 0.25;
      const thrust = S.rate ? j.c * S.power : S.power;
      j.vx += Math.sin(j.a) * thrust * dt;
      j.vy += -Math.cos(j.a) * thrust * dt + 4 * dt; // et entre deux battements, elle se laisse couler
      j.vx *= Math.pow(0.5, dt); j.vy *= Math.pow(0.5, dt);
      j.x += j.vx * dt; j.y += j.vy * dt;
      if (j.x < -80) j.x = W + 80; if (j.x > W + 80) j.x = -80;
      j.alarm = Math.max(0, j.alarm - dt * 0.33);
      // tentacules et bras : la tête suit la cloche, le reste suit la tête
      const an = anchors(j), g = 14;
      j.tents.forEach((ch, k) => { const [lx, ly] = an[k] || an[0]; const [ax, ay] = toWorld(j, lx, ly); stepChain(ch, ax, ay, dt, t, g, k); });
      if (S.arms) j.arms.forEach((ch, k) => { const [ax, ay] = toWorld(j, lerp(-0.3, 0.3, (k + 0.5) / S.arms.n) * j.r, -j.r * 0.1); stepChain(ch, ax, ay, dt, t, g * 0.6, k + 9); });
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.age > s.life) sparks.splice(i, 1); }
    if (selected) selT += dt;
  }

  function draw(ctx, t) {
    const day = 0.5 + 0.5 * Math.sin((t / CYCLE) * TAU), night = 1 - day;
    const top = mixRgb(hexToRgb('#020a18'), hexToRgb('#0c3d5e'), day), bot = mixRgb(hexToRgb('#01040b'), hexToRgb('#04192c'), day);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, rgba(top));
    bg.addColorStop(1, rgba(bot));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // rayons venus de la surface
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = W * (0.1 + i * 0.17) + Math.sin(t * 0.2 + i) * 40;
      const g = ctx.createLinearGradient(x, 0, x + 120, H * 0.85);
      g.addColorStop(0, `rgba(140,210,255,${0.07 * day})`);
      g.addColorStop(1, 'rgba(140,210,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 220, H * 0.85); ctx.lineTo(x + 90, H * 0.85); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // fond de sable, et les rochers où s'accrochent les colonies
    ctx.fillStyle = rgba(mixRgb([6, 12, 18], [16, 30, 40], day));
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16) ctx.lineTo(x, seabed + noise.n2(x * 0.006, 1) * 10);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.strokeStyle = rgba(mixRgb([20, 34, 44], [40, 62, 74], day), 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 1; r <= 3; r++) {
      const y0 = seabed + 8 + r * ((H - seabed) / 4);
      for (let x = 0; x <= W; x += 24) { const y = y0 + Math.sin(x * 0.03 + r * 2) * 2.5; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    }
    ctx.stroke();

    if (coralCv) ctx.drawImage(coralCv, 0, 0, W, H);
    drawPolyps(ctx, t, night);
    if (selected) drawPath(ctx, t);

    for (const j of jellies) drawJelly(ctx, j, t, night);

    // plancton, bulles, éclats
    ctx.globalCompositeOperation = 'lighter';
    const pl = glow([90, 200, 255], 12);
    for (const pk of plankton) drawGlow(ctx, pl, pk.x, pk.y, 2.5 + pk.lit * 4, 0.06 + night * 0.12 + pk.lit * 0.85);
    for (const s of sparks) drawGlow(ctx, glow(s.c, 12), s.x, s.y, 5, 1 - s.age / s.life);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(200,235,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const b of bubbles) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, TAU); }
    ctx.stroke();
    if (selected) drawInfo(ctx);
  }

  // Les branches ont du volume : toutes les ombres d'une colonie d'abord, puis toute sa chair par-dessus
  // (sinon chaque tronçon ferait une marque sur le précédent, comme un bambou)
  function drawColony(ctx, c, night) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // un seul tracé par couleur et par épaisseur pour toute la colonie
    const byKey = new Map();
    for (const p of c.copies) for (const [key, g] of p.groups) {
      let l = byKey.get(key);
      if (!l) byKey.set(key, (l = { path: new Path2D(), k: g.band / 7, w: Math.max(0.7, (0.55 + g.wq * 0.62) * c.wk) }));
      for (const n of g.nodes) { l.path.moveTo(n.parent.x, n.parent.y); l.path.lineTo(n.x, n.y); }
    }
    const layers = [...byKey.values()];
    // l'ombre ne sert qu'aux branches assez épaisses pour qu'on la voie ; les fines la remplacent par un ton plus sourd
    for (const l of layers) {
      if (l.w < 1.9) continue;
      const col = hslToRgb(c.hue + l.k * 34 - 17, c.sat + l.k * 22, 15 + l.k * 46);
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(col.map(v => v * 0.36), 0.92);
      ctx.lineWidth = l.w + 1.6;
      ctx.stroke(l.path);
    }
    for (const l of layers) {
      const col = hslToRgb(c.hue + l.k * 34 - 17, c.sat + l.k * 22, 15 + l.k * 46);
      ctx.lineCap = l.w < 2.2 ? 'butt' : 'round';
      ctx.strokeStyle = rgba(mixRgb(l.w < 1.9 ? col.map(v => v * 0.82) : col, [255, 255, 255], night * 0.05), 0.96);
      ctx.lineWidth = l.w;
      ctx.stroke(l.path);
    }
    // un fil de lumière sur le dos des branches épaisses
    for (const l of layers) {
      if (l.w < 2.4) continue;
      const col = hslToRgb(c.hue + l.k * 34 - 7, c.sat + l.k * 10, 34 + l.k * 46);
      ctx.strokeStyle = rgba(col, 0.35);
      ctx.lineWidth = l.w * 0.3;
      ctx.stroke(l.path);
    }
  }
  // les polypes au bout des branches : ils s'ouvrent en vague, et luisent davantage la nuit
  function drawPolyps(ctx, t, night) {
    ctx.globalCompositeOperation = 'lighter';
    for (const c of colonies) {
      const sp = glow(hslToRgb(c.hue + 30, 90, 70).map(Math.round), 12);
      for (const p of c.copies) {
        for (let i = 0; i < p.tips.length; i += tipStep) {
          const n = p.tips[i];
          const open = 0.5 + 0.5 * Math.sin(t * 0.9 - n.x * 0.012 + c.hue);
          drawGlow(ctx, sp, n.x, n.y, (2 + night * 1.6) * (0.75 + open * 0.5), (0.2 + night * 0.45) * (0.6 + open * 0.4));
        }
      }
    }
    // 27 et 42 scintillent, pour qui sait regarder
    for (const num of [27, 42]) {
      const n = main.map.get(num);
      if (!n) continue;
      const tw = Math.pow(Math.max(0, Math.sin(t * 2.3 + num)), 8);
      drawGlow(ctx, glow([255, 220, 140], 16), n.x, n.y, 7, 0.15 + tw * 0.85);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawPath(ctx, t) {
    const pts = [];
    for (let n = selected.node; n; n = n.parent) pts.push(n);
    ctx.strokeStyle = 'rgba(255,236,190,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((n, i) => (i ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y)));
    ctx.stroke();
    // une lumière descend le chemin jusqu'à 1
    ctx.globalCompositeOperation = 'lighter';
    const k = Math.floor((selT * 24) % (pts.length + 20));
    for (let i = Math.max(0, k - 6); i <= Math.min(pts.length - 1, k); i++) drawGlow(ctx, glow([255, 236, 190], 16), pts[i].x, pts[i].y, 6, 1 - (k - i) / 7);
    drawGlow(ctx, glow([255, 236, 190], 32), pts[0].x, pts[0].y, 18, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawInfo(ctx) {
    const s = selected;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `italic 300 ${W < 560 ? 34 : 44}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const y = H * 0.17 + 40;
    ctx.fillText(s.node.n.toLocaleString('fr-FR'), W / 2, y);
    ctx.font = '400 10px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(200,235,255,0.7)';
    ctx.fillText(`${s.node.depth} ÉTAPES JUSQU'À 1 · SOMMET ${s.peak.toLocaleString('fr-FR')}`, W / 2, y + 24);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.font = '400 11px "DM Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(200,235,255,0.45)';
    ctx.fillText(s.seq, W / 2, y + 46);
  }

  // ——— Dessin des méduses : chaque espèce a sa cloche, ses fils, sa lumière
  function chainPath(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); }
  function drawJelly(ctx, j, t, night) {
    const S = SPECIES[j.sp], [rw, rh] = bellSize(j);
    // bras de dentelle (sous la cloche)
    if (S.arms) {
      for (const ch of j.arms) {
        chainPath(ctx, ch.pts);
        ctx.strokeStyle = rgba(S.arms.col, 0.16 + night * 0.06);
        ctx.lineWidth = S.arms.w * (j.r / 22) + 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.strokeStyle = rgba(S.arms.col, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ch.pts.forEach((p, i) => { const ox = Math.sin(i * 1.7 + t * 2) * S.arms.w * 0.5; if (i) ctx.lineTo(p.x + ox, p.y); else ctx.moveTo(p.x + ox, p.y); });
        ctx.stroke();
      }
    }
    // tentacules
    for (const ch of j.tents) {
      chainPath(ctx, ch.pts);
      const tc = S.tents.colors ? S.tents.colors[ch.k % S.tents.colors.length] : S.tent;
      ctx.strokeStyle = rgba(tc, (j.sp === 'aequorea' ? 0.22 : 0.42) + night * 0.2);
      ctx.lineWidth = ch.long ? 1.4 : j.sp === 'chrysaora' ? 1.2 : 0.9;
      ctx.stroke();
    }
    if (S.tents.colors) {
      ctx.globalCompositeOperation = 'lighter';
      for (const ch of j.tents) { const p = ch.pts[ch.pts.length - 1]; drawGlow(ctx, glow(S.tents.colors[ch.k % S.tents.colors.length], 10), p.x, p.y, 3.5, 0.45 + night * 0.4); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // le halo
    ctx.globalCompositeOperation = 'lighter';
    const [hx, hy] = toWorld(j, 0, -rh * 0.55);
    drawGlow(ctx, glow(S.glow, 32), hx, hy, j.r * 3, (j.sp === 'atolla' ? 0.08 : 0.16) + night * 0.24);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // la cloche, dessinée dans son propre repère
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.rotate(j.a);
    if (j.sp === 'cteno') drawCteno(ctx, j, rw, rh, t, night);
    else {
      const g = ctx.createRadialGradient(0, -rh * 0.85, 1, 0, -rh * 0.4, j.r * 1.1);
      g.addColorStop(0, rgba(mixRgb(S.bell, [255, 255, 255], 0.55), Math.min(1, S.alpha + 0.3)));
      g.addColorStop(1, rgba(S.bell, S.alpha));
      ctx.fillStyle = g;
      bellPath(ctx, rw, rh);
      ctx.fill();
      ctx.strokeStyle = rgba(S.rim, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      bellDetails(ctx, j, rw, rh, t, night);
    }
    ctx.restore();
    // l'alarme de l'Atolla : une roue de lumière bleue qui court autour de la cloche
    if (j.alarm > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const sp = glow([90, 150, 255], 16);
      for (let i = 0; i < 10; i++) {
        const a = t * 7 + (i / 10) * TAU;
        const [x, y] = toWorld(j, Math.cos(a) * rw * 1.05, -rh * 0.3 + Math.sin(a) * rh * 0.5);
        drawGlow(ctx, sp, x, y, 7 + (i % 2) * 3, j.alarm * (0.5 + 0.5 * Math.sin(t * 20 + i)));
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
  function bellPath(ctx, rw, rh) {
    ctx.beginPath();
    ctx.moveTo(-rw, 0);
    ctx.bezierCurveTo(-rw, -rh * 0.9, -rw * 0.55, -rh * 1.25, 0, -rh * 1.25);
    ctx.bezierCurveTo(rw * 0.55, -rh * 1.25, rw, -rh * 0.9, rw, 0);
    ctx.quadraticCurveTo(0, -rh * 0.24, -rw, 0);
    ctx.closePath();
  }
  function bellDetails(ctx, j, rw, rh, t, night) {
    const S = SPECIES[j.sp];
    if (j.sp === 'aurelia') {
      // quatre fers à cheval : les gonades, roses à travers le verre
      ctx.strokeStyle = 'rgba(255,160,210,0.6)';
      ctx.lineWidth = Math.max(1.5, j.r * 0.09);
      for (let i = 0; i < 4; i++) { const x = (-0.45 + i * 0.3) * rw; ctx.beginPath(); ctx.arc(x, -rh * 0.62, rw * 0.12, 0.35, Math.PI * 2 - 0.35); ctx.stroke(); }
    } else if (j.sp === 'chrysaora') {
      // des rayures sombres qui partent du sommet
      ctx.strokeStyle = 'rgba(120,30,20,0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) { ctx.moveTo(0, -rh * 1.2); ctx.quadraticCurveTo(lerp(-rw, rw, i / 12) * 0.6, -rh * 0.8, lerp(-rw, rw, i / 12) * 0.98, -rh * 0.06); }
      ctx.stroke();
    } else if (j.sp === 'olindias') {
      // canaux colorés, et à la marge des bourgeons de couleur
      const cols = S.tents.colors;
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { ctx.strokeStyle = rgba(cols[i % 3], 0.4); ctx.beginPath(); ctx.moveTo(0, -rh * 1.1); ctx.quadraticCurveTo(lerp(-rw, rw, i / 5) * 0.5, -rh * 0.7, lerp(-rw, rw, i / 5) * 0.92, -rh * 0.08); ctx.stroke(); }
      for (let i = 0; i < 9; i++) { ctx.fillStyle = rgba(cols[i % 3], 0.85); ctx.beginPath(); ctx.arc(lerp(-rw * 0.9, rw * 0.9, i / 8), -rh * 0.05, 1.6, 0, TAU); ctx.fill(); }
    } else if (j.sp === 'aequorea') {
      // la méduse cristal : des dizaines de canaux, et une couronne de points verts qui s'allument
      ctx.strokeStyle = 'rgba(220,245,255,0.18)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) { ctx.moveTo(0, -rh * 1.2); ctx.lineTo(lerp(-rw, rw, i / 16) * 0.96, -rh * 0.05); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const gl = glow([110, 255, 140], 8);
      for (let i = 0; i < 14; i++) drawGlow(ctx, gl, lerp(-rw * 0.95, rw * 0.95, i / 13), -rh * 0.04, 2.6 + night * 2.2, 0.45 + night * 0.5 + 0.15 * Math.sin(t * 3 + i));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    } else if (j.sp === 'atolla') {
      // la couronne : un sillon, et des lobes tout autour de la marge
      ctx.strokeStyle = 'rgba(60,0,10,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-rw * 0.86, -rh * 0.42); ctx.quadraticCurveTo(0, -rh * 0.62, rw * 0.86, -rh * 0.42); ctx.stroke();
      ctx.fillStyle = 'rgba(190,30,50,0.85)';
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(lerp(-rw * 0.9, rw * 0.9, i / 8), 0, rw * 0.1, 0, Math.PI); ctx.fill(); }
    }
  }
  function drawCteno(ctx, j, rw, rh, t, night) {
    // un œuf de verre, et huit rangées de palettes qui font courir l'arc-en-ciel
    const g = ctx.createRadialGradient(-rw * 0.3, -rh * 0.4, 1, 0, 0, rh);
    g.addColorStop(0, 'rgba(235,250,255,0.32)');
    g.addColorStop(1, 'rgba(160,210,255,0.08)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,240,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const rows = [-0.85, -0.45, 0, 0.45, 0.85];
    rows.forEach((kx, ri) => {
      for (let s = 0; s < 11; s++) {
        const u = 0.22 + (s / 10) * (Math.PI - 0.44);
        const x = kx * rw * Math.sin(u), y = -rh * Math.cos(u);
        const hue = (s * 33 - t * 260 + ri * 50 + j.hue0) % 360;
        const c = hslToRgb((hue + 360) % 360, 100, 62).map(Math.round);
        drawGlow(ctx, glow(c, 6), x, y, 2.2, 0.55 + 0.35 * Math.sin(t * 9 - s * 0.9 + ri));
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ——— Lire le voyage d'un nombre
  function select(node) {
    if (!node || selected?.node === node) return;
    const seq = [];
    let x = node.n, peak = x;
    while (x !== 1) { seq.push(x); x = next(x); peak = Math.max(peak, x); }
    seq.push(1);
    const shown = seq.slice(0, 7).map(v => v.toLocaleString('fr-FR')).join(' → ') + (seq.length > 7 ? ' → … → 1' : '');
    selected = { node, peak, seq: shown };
    selT = 0;
    if (engine.t - lastMelody > 1.2) {
      lastMelody = engine.t;
      // la mélodie du voyage : la hauteur suit la valeur, l'impair sonne en cloche
      seq.slice(0, 18).forEach((v, i) => audio.note(Math.round(Math.log2(v) * 1.4), { type: v % 2 ? 'bell' : 'glass', vel: 0.06, dur: 1.4, at: i * 0.1, send: 0.4 }));
    }
    if (node.n === 27) secrets.find('vingtsept');
    if (node.n === 42) secrets.find('quarantedeux');
  }
  function nearest(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const p of plants) for (const n of p.order) {
      const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function move(p) { if (p.type === 'mouse' || p.id !== undefined) { const n = nearest(p.x, p.y, 22); if (n) select(n); } }
  function jellyAt(x, y) {
    for (const j of jellies) {
      const [cx, cy] = toWorld(j, 0, -bellSize(j)[1] * 0.55);
      if (Math.hypot(x - cx, y - cy) < j.r * 1.6) return j;
    }
    return null;
  }
  function tap(p) {
    const t = engine.t;
    const j = jellyAt(p.x, p.y);
    if (j) {
      j.taps = j.taps.filter(x => t - x < 3);
      j.taps.push(t);
      // un toucher la fait filer droit devant
      j.vx += Math.sin(j.a) * 50; j.vy -= Math.cos(j.a) * 50;
      if (j.sp === 'atolla') { j.alarm = 1; audio.sweep({ from: 1400, to: 600, dur: 0.9, vel: 0.04, type: 'sine', send: 0.6 }); }
      audio.note(9 + j.taps.length, { type: 'glass', vel: 0.1, dur: 1.6 });
      if (j.taps.length >= 3 && jellies.length < 12) {
        j.taps = [];
        const [cx, cy] = toWorld(j, 0, j.r);
        spawnJelly(j.sp, cx + 10, cy + 10, j.r * 0.58);
        const c = SPECIES[j.sp].glow;
        for (let k = 0; k < 14; k++) { const a = Math.random() * TAU; sparks.push({ x: j.x, y: j.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, c, age: 0, life: 1 }); }
        api.toast({ kicker: 'Récif', title: SPECIES[j.sp].label, text: 'Une petite vient de bourgeonner.', ms: 2600 });
        secrets.find('meduse');
      }
      return;
    }
    const n = nearest(p.x, p.y, 34);
    if (n) select(n);
    else selected = null;
  }
  // au clavier : tape un nombre puis Entrée
  function key(e) {
    if (/^[0-9]$/.test(e.key)) digits = (digits + e.key).slice(-7);
    else if (e.key === 'Enter' && digits) {
      if (+digits < 1) { digits = ''; return; }
      let n = null;
      for (const p of plants) { n = p.map.get(+digits); if (n) break; }
      if (n) select(n);
      else api.toast({ kicker: 'Hors du récif', title: (+digits).toLocaleString('fr-FR'), text: `Ce nombre ne pousse pas dans ce récif-ci. Il rentre pourtant à 1, lui aussi, en ${(() => { let x = +digits, s = 0; while (x !== 1 && s < 2000) { x = next(x); s++; } return s; })()} étapes.`, ms: 5000 });
      digits = '';
    }
  }

  return { resize, update, draw, move, tap, key, destroy() {} };
}
