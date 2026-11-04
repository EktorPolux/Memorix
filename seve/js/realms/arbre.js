// Sève — L'Arbre-Monde : le carrefour. Un arbre qui pousse vers la lumière, un ciel qui tourne, des fruits qui sont des portes.
import { TAU, clamp, lerp, smoothstep, rng, glow, drawGlow, hexToRgb, rgba, mixRgb, segDist, easeOutBack, makeCanvas, makeNoise } from '../engine.js';

export const mood = {
  root: 146.83, scale: 'majPenta', wave: 'triangle', chord: [0, 7, 12, 16], pad: 0.05, cutoff: 760, lfo: 0.05,
  noise: { type: 'bandpass', freq: 420, q: 0.5, gain: 0.018, gust: 0.8, gustRate: 0.09 },
};

const DAY = 150; // un jour entier, en secondes
const SKY = [
  [0.0, '#03030f', '#0b0a24'],
  [0.2, '#05061c', '#1f1840'],
  [0.27, '#1a1d48', '#d98a6c'],
  [0.35, '#20406f', '#86a9bf'],
  [0.5, '#24558f', '#9ec3d8'],
  [0.65, '#22477a', '#c4a68c'],
  [0.73, '#1b1440', '#e0745a'],
  [0.8, '#0c0a2a', '#3b2050'],
  [1.0, '#03030f', '#0b0a24'],
].map(([p, a, b]) => [p, hexToRgb(a), hexToRgb(b)]);

function skyAt(ph) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [p0, a0, b0] = SKY[i], [p1, a1, b1] = SKY[i + 1];
    if (ph >= p0 && ph <= p1) {
      const k = smoothstep(0, 1, (ph - p0) / (p1 - p0));
      return [mixRgb(a0, a1, k), mixRgb(b0, b1, k)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

// L'horloge du monde survit aux allers-retours : le ciel continue de tourner pendant ton voyage
let dayClock = 0.755 * DAY;
let hasGerminated = false;
const treeCache = new Map();

const BARK_DAY = hexToRgb('#2a1c1e'), BARK_NIGHT = hexToRgb('#0a0712');
const LEAF_DAY = ['#2f6b55', '#4d8a5e', '#25564c'].map(hexToRgb);
const LEAF_NIGHT = ['#1f7f78', '#4b4796', '#2a7a5c'].map(hexToRgb);
const GOLD = hexToRgb('#ffd48a');
const VEL = 1.15; // vitesse de pousse, en unités d'arbre par seconde
const WK = 0.0158; // épaisseur d'une brindille, en unités d'arbre

// ——— Colonisation de l'espace (Runions, Lane & Prusinkiewicz, 2007)
// Des points attracteurs remplissent une couronne ; chaque bourgeon pousse vers ceux qui sont les plus proches de lui.
function colonize(seed, portrait, q) {
  const R = rng(seed);
  const NA = Math.round((portrait ? 520 : 760) * (q < 0.8 ? 0.7 : 1));
  const rx = portrait ? 1.12 : 1.75, ry = portrait ? 1.32 : 1.04, cx = 0, cy = portrait ? -2.5 : -2.2;
  const di = 0.5, dk = 0.085, D = q < 0.8 ? 0.075 : 0.06, MAXN = q < 0.8 ? 1700 : 2600;
  const ax = [], ay = [];
  for (let guard = 0; ax.length < NA && guard < NA * 30; guard++) {
    const x = R() * 2 - 1, y = R() * 2 - 1;
    const a = Math.atan2(y, x), r = Math.hypot(x, y);
    const edge = 0.84 + 0.12 * Math.sin(a * 3 + 1.3) + 0.07 * Math.sin(a * 7 + 0.4);
    if (r > edge) continue;
    if (y > 0.3 && R() < 0.5) continue; // une couronne plus légère par en dessous
    ax.push(cx + x * rx);
    ay.push(cy + y * ry);
  }
  const A = ax.length, alive = new Uint8Array(A).fill(1);
  const px = [], py = [], par = [];
  const grid = new Map();
  const key = (ix, iy) => (ix + 512) * 2048 + (iy + 512);
  const add = (x, y, p) => {
    const i = px.length;
    px.push(x); py.push(y); par.push(p);
    const k = key(Math.floor(x / di), Math.floor(y / di));
    let c = grid.get(k);
    if (!c) grid.set(k, (c = []));
    c.push(i);
    return i;
  };
  const nearest = (x, y) => {
    const ix = Math.floor(x / di), iy = Math.floor(y / di);
    let best = -1, bd = di * di;
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const c = grid.get(key(ix + gx, iy + gy));
      if (!c) continue;
      for (const i of c) {
        const d = (px[i] - x) * (px[i] - x) + (py[i] - y) * (py[i] - y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  };
  // le tronc monte droit jusqu'à sentir la couronne
  let cur = add(0, 0, -1);
  for (let k = 0; k < 300; k++) {
    let near = false;
    for (let i = 0; i < A && !near; i++) near = (ax[i] - px[cur]) ** 2 + (ay[i] - py[cur]) ** 2 < di * di;
    if (near) break;
    cur = add(px[cur] + (R() - 0.5) * D * 0.2, py[cur] - D, cur);
  }
  const pull = new Map();
  for (let it = 0; it < 400 && px.length < MAXN; it++) {
    pull.clear();
    for (let i = 0; i < A; i++) {
      if (!alive[i]) continue;
      const n = nearest(ax[i], ay[i]);
      if (n < 0) continue;
      const dx = ax[i] - px[n], dy = ay[i] - py[n], l = Math.hypot(dx, dy) || 1;
      let g = pull.get(n);
      if (!g) pull.set(n, (g = [0, 0, 0]));
      g[0] += dx / l; g[1] += dy / l; g[2]++;
    }
    if (!pull.size) break;
    const fresh = [];
    for (const [n, g] of pull) {
      let vx = g[0] / g[2] + (R() - 0.5) * 0.14, vy = g[1] / g[2] - 0.16 + (R() - 0.5) * 0.14;
      const l = Math.hypot(vx, vy) || 1;
      fresh.push(add(px[n] + (vx / l) * D, py[n] + (vy / l) * D, n));
    }
    for (let i = 0; i < A; i++) {
      if (!alive[i]) continue;
      for (const f of fresh) if ((ax[i] - px[f]) ** 2 + (ay[i] - py[f]) ** 2 < dk * dk) { alive[i] = 0; break; }
    }
  }

  // Nœuds : chaque nœud est un segment qui part du bout de son parent
  const nodes = px.map((x, i) => ({ i, x, y: py[i], parent: null, kids: [], w: 1, len: 0, rel: 0, abs0: 0, dist: 0 }));
  for (let i = 1; i < nodes.length; i++) { const n = nodes[i]; n.parent = nodes[par[i]]; n.parent.kids.push(n); }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kids.length) n.w = Math.sqrt(n.kids.reduce((s, c) => s + c.w * c.w, 0));
  }
  for (const n of nodes) {
    const p = n.parent;
    if (!p) continue;
    const dx = n.x - p.x, dy = n.y - p.y;
    n.len = Math.hypot(dx, dy);
    n.abs0 = Math.atan2(dx, -dy);
    let rel = n.abs0 - p.abs0;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    n.rel = rel;
    n.dist = p.dist + n.len;
    n.ph = n.x * 2.3 + R() * 0.6;
  }
  nodes[0].ph = 0;
  const twigs = nodes.filter(n => n.parent && n.w <= 2.4);
  for (const n of twigs) {
    n.leaves = [];
    const k = n.w <= 1.25 ? (q < 0.8 ? 3 : 4) : 2;
    for (let j = 0; j < k; j++) n.leaves.push({ a: R() * TAU, d: 0.008 + R() * 0.055, r: 0.009 + R() * 0.013, tone: (R() * 3) | 0 });
  }
  let minX = 0, maxX = 0, minY = 0, cminX = 1e9, cmaxX = -1e9, cminY = 1e9, cmaxY = -1e9, maxDist = 0, wMax = 0;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y);
    maxDist = Math.max(maxDist, n.dist); wMax = Math.max(wMax, n.w);
  }
  for (const n of twigs) { cminX = Math.min(cminX, n.x); cmaxX = Math.max(cmaxX, n.x); cminY = Math.min(cminY, n.y); cmaxY = Math.max(cmaxY, n.y); }
  return { nodes, twigs, bbox: { minX, maxX, minY }, crown: { minX: cminX, maxX: cmaxX, minY: cminY, maxY: cmaxY }, maxDist, wMax };
}

export function create(api, meta, opts = {}) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(secrets.seed + 3);
  const R = rng(secrets.seed + 11);
  const q = engine.quality;
  let W = api.W, H = api.H;
  let S = 1, rootX = 0, groundY = 0;

  const portrait = H > W * 1.1;
  const ck = `${secrets.seed}|${portrait}|${q < 0.8}`;
  if (!treeCache.has(ck)) treeCache.set(ck, colonize(secrets.seed, portrait, q));
  const tree = treeCache.get(ck);
  const nodes = tree.nodes, twigs = tree.twigs;
  const GROW_DUR = tree.maxDist / VEL + 1.1;

  // ——— Les fruits : une porte par tableau, suspendus en lanternes autour de la couronne
  const portalRealms = api.realms.filter(r => r.id !== 'arbre' && !r.hidden);
  const fruits = portalRealms.map((realm, k) => ({
    realm, idx: k, color: hexToRgb(realm.color),
    u: lerp(-1.95, 1.95, portalRealms.length > 1 ? k / (portalRealms.length - 1) : 0.5),
    anchor: null, rx: 0, ry: 0, x: 0, y: 0, hover: 0, swing: 0, swingV: 0, flash: 0,
  }));
  const anchorsPool = nodes.filter(n => n.w >= 1.3 && n.w <= 6 && n.parent);

  // ——— Fleurs : une par secret trouvé, sur des brindilles choisies une fois pour toutes
  const flowerSlots = twigs.filter(n => n.w <= 1.25).sort((a, b) => ((a.i * 2654435761) % 1000) - ((b.i * 2654435761) % 1000)).filter((_, i) => i % 5 === 0);
  const bloomT = new Map();
  const unsub = secrets.onFind(s => bloomT.set(s.id, engine.t));

  // ——— Décor : collines, étoiles, herbe, lucioles
  const hills = [0, 1, 2].map(l => {
    const pts = [];
    for (let i = 0; i <= 64; i++) pts.push(noise.fbm2(i * 0.09 + l * 17, l * 3.1, 3));
    return pts;
  });
  const stars = Array.from({ length: Math.round(260 * q) }, () => ({ x: R(), y: Math.pow(R(), 1.4) * 0.78, s: R() < 0.08 ? 1.6 : 0.7 + R() * 0.7, tw: 0.5 + R() * 2.5, ph: R() * TAU, warm: R() }));
  let blades = [], flies = [], motes = [];
  const sprouts = [], shooting = [], bursts = [];
  let pulses = [], trunkTaps = [], astreTaps = [], planted = 0;
  let wind = 0, userWind = 0, parX = 0;
  let vignette = null, moonImg = null, hovered = null;
  let state = opts.intro && !hasGerminated ? 'seed' : 'live';
  let growT = state === 'seed' ? -1 : 999;
  if (opts.regrow) { state = 'grow'; growT = 0; } // après la Graine d'Or : un autre arbre pousse sous tes yeux
  let seedT = 0, lastLvl = -1, nextPulse = -1;

  function makeMoon(r) {
    const c = makeCanvas(r * 2 + 2, r * 2 + 2);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(r * 0.8, r * 0.75, r * 0.1, r, r, r);
    grd.addColorStop(0, '#fffaf0');
    grd.addColorStop(1, '#d8d2e8');
    g.fillStyle = grd;
    g.beginPath(); g.arc(r + 1, r + 1, r, 0, TAU); g.fill();
    const cr = rng(9);
    g.fillStyle = 'rgba(150,140,175,.28)';
    for (let i = 0; i < 9; i++) {
      const a = cr() * TAU, d = cr() * r * 0.7, rr = r * (0.08 + cr() * 0.18);
      g.beginPath(); g.arc(r + 1 + Math.cos(a) * d, r + 1 + Math.sin(a) * d, rr, 0, TAU); g.fill();
    }
    return c;
  }

  // Position de repos à l'échelle de l'écran (sans vent, croissance achevée)
  function restLayout() {
    for (const n of nodes) {
      const p = n.parent;
      n.rx1 = rootX + n.x * S;
      n.ry1 = groundY + n.y * S;
      if (!p) continue;
    }
  }
  function placeFruits() {
    restLayout();
    const c = tree.crown;
    const Cx = rootX + ((c.minX + c.maxX) / 2) * S, Cy = groundY + ((c.minY + c.maxY) / 2) * S;
    const rx = Math.min(W * 0.46 - 8, ((c.maxX - c.minX) / 2) * S * 1.08 + 30);
    let ry = ((c.maxY - c.minY) / 2) * S * 1.12 + 30;
    const topLimit = portrait ? 132 : 104;
    if (Cy - ry < topLimit) ry = Cy - topLimit;
    const used = new Set();
    for (const f of fruits) {
      f.rx = Cx + Math.sin(f.u) * rx;
      f.ry = Cy - Math.cos(f.u) * ry;
      let best = null, bd = 1e9;
      for (const n of anchorsPool) {
        if (used.has(n)) continue;
        const d = Math.hypot(n.rx1 - f.rx, n.ry1 - f.ry);
        if (d < bd) { bd = d; best = n; }
      }
      f.anchor = best;
      if (best) used.add(best);
    }
  }

  function resize(w, h) {
    W = w; H = h;
    groundY = Math.round(H * (H > W ? 0.84 : 0.875));
    const top = H > W ? 150 : 118;
    const treeH = -tree.bbox.minY, treeW = tree.bbox.maxX - tree.bbox.minX;
    S = Math.min((groundY - top) / treeH, (W * (H > W ? 0.84 : 0.62)) / treeW);
    rootX = W * 0.5;
    const nb = Math.round(clamp(W / 5, 110, 320) * q);
    blades = Array.from({ length: nb }, () => ({ x: R() * W, h: 7 + R() * 22, lean: (R() - 0.5) * 0.5, ph: R() * TAU }));
    if (!flies.length) {
      flies = Array.from({ length: Math.round(44 * q) }, () => ({ x: R() * W, y: groundY - R() * H * 0.55, vx: 0, vy: 0, ph: R() * TAU, sd: R() * 100 }));
      motes = Array.from({ length: Math.round(34 * q) }, () => ({ x: R() * W, y: R() * groundY, ph: R() * TAU, sd: R() * 100 }));
    }
    vignette = makeCanvas(W, H);
    const v = vignette.getContext('2d');
    const grd = v.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    v.fillStyle = grd;
    v.fillRect(0, 0, W, H);
    moonImg = makeMoon(Math.round(Math.min(W, H) * 0.032 + 6));
    placeFruits();
  }
  resize(W, H);

  const fruitR = () => clamp(S * 0.085, 11, 19);
  const phase = () => (dayClock / DAY) % 1;
  const sunElev = ph => -Math.cos(ph * TAU);
  const nightness = ph => smoothstep(0.12, -0.32, sunElev(ph));
  const astrePos = ph => ({ x: W * 0.5 + Math.sin(ph * TAU - Math.PI) * W * 0.44, y: groundY - sunElev(ph) * H * 0.62 });

  // Le vent : brise lente, rafales, et ce que ta main y ajoute. Les brindilles plient plus que le tronc.
  function layout(t) {
    const wv = wind + userWind;
    const front = growT * VEL;
    for (const n of nodes) {
      const p = n.parent;
      if (!p) { n.abs = 0; n.x1 = rootX; n.y1 = groundY; n.g = 1; continue; }
      n.g = growT >= 900 ? 1 : clamp((front - p.dist) / (n.len * 2 + 0.04), 0, 1);
      n.abs = p.abs + n.rel + wv * 0.2 / Math.pow(n.w, 0.62) + Math.sin(t * 1.7 + n.ph) * 0.0028 / n.w;
      n.x0 = p.x1; n.y0 = p.y1;
      const L = n.len * S * n.g;
      n.x1 = n.x0 + Math.sin(n.abs) * L;
      n.y1 = n.y0 - Math.cos(n.abs) * L;
    }
  }

  // ——— Évolution
  function update(dt, t) {
    if (state === 'seed') seedT += dt;
    else {
      dayClock += dt;
      if (state === 'grow') {
        growT += dt;
        const lvl = Math.floor(growT / 0.45);
        if (lvl !== lastLvl && lvl <= 9) { lastLvl = lvl; audio.note(lvl, { type: 'glass', vel: 0.07, dur: 2.4, send: 0.6, pan: lvl % 2 ? 0.3 : -0.3 }); }
        if (growT >= GROW_DUR) { state = 'live'; growT = 999; hasGerminated = true; api.germinated(); }
      }
    }
    const ph = state === 'seed' ? 0.755 : phase();
    const night = nightness(ph);
    wind = 0.012 * Math.sin(t * 0.37) + 0.009 * Math.sin(t * 0.83 + 1.3) + noise.n2(t * 0.08, 4.2) * 0.022;
    if (input.inside && state === 'live') {
      const c = tree.crown;
      const inX = input.x > rootX + c.minX * S - 40 && input.x < rootX + c.maxX * S + 40;
      const inY = input.y > groundY + c.minY * S - 40 && input.y < groundY + c.maxY * S + 60;
      if (inX && inY) userWind += clamp(input.vx * 0.0000045, -0.004, 0.004);
    }
    userWind *= Math.pow(0.18, dt);
    userWind = clamp(userWind, -0.09, 0.09);
    parX += ((input.inside ? input.x - W / 2 : 0) - parX) * Math.min(1, dt * 1.5);
    layout(t);

    for (const f of fruits) {
      const target = (wind + userWind) * 2.2;
      f.swingV += ((target - f.swing) * 9 - f.swingV * 2.2) * dt;
      f.swing += f.swingV * dt;
      const a = f.anchor, hang = S * 0.06;
      const dx = a ? a.x1 - a.rx1 : 0, dy = a ? a.y1 - a.ry1 : 0;
      f.x = f.rx + dx * 0.8 + Math.sin(f.swing) * hang;
      f.y = f.ry + dy * 0.8 + (1 - Math.cos(f.swing)) * hang;
      f.hover += ((hovered === f ? 1 : 0) - f.hover) * Math.min(1, dt * 8);
      f.flash = Math.max(0, f.flash - dt * 0.7);
    }

    // lucioles (la nuit) et poussières de lumière (le jour)
    for (const f of flies) {
      const nx = noise.n3(f.x * 0.004, f.y * 0.004, t * 0.15 + f.sd), ny = noise.n3(f.x * 0.004 + 40, f.y * 0.004, t * 0.15 + f.sd);
      f.vx += nx * 60 * dt;
      f.vy += ny * 60 * dt - 4 * dt;
      if (input.inside && night > 0.2) {
        const dx = input.x - f.x, dy = input.y - f.y, d = Math.hypot(dx, dy);
        if (d < 230 && d > 1) { f.vx += (dx / d) * 70 * dt + (-dy / d) * 40 * dt; f.vy += (dy / d) * 70 * dt + (dx / d) * 40 * dt; }
      }
      f.vx *= Math.pow(0.35, dt); f.vy *= Math.pow(0.35, dt);
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < -20) f.x = W + 20;
      if (f.x > W + 20) f.x = -20;
      if (f.y > groundY + 10) f.vy -= 40 * dt;
      if (f.y < H * 0.12) f.vy += 30 * dt;
    }
    for (const m of motes) {
      m.x += (noise.n2(m.y * 0.003, t * 0.1 + m.sd) * 18 + 6) * dt;
      m.y += (noise.n2(m.x * 0.003 + 9, t * 0.1 + m.sd) * 12 - 3) * dt;
      if (m.x > W + 10) m.x = -10;
      if (m.y < -10) m.y = groundY;
      if (m.y > groundY) m.y = 0;
    }

    if (night > 0.6 && Math.random() < dt * 0.075 && shooting.length < 2) {
      const fromLeft = Math.random() < 0.5;
      const sp = 700 + Math.random() * 400, ang = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.3;
      shooting.push({ x: fromLeft ? Math.random() * W * 0.5 : W * 0.5 + Math.random() * W * 0.5, y: Math.random() * H * 0.3, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.1, age: 0 });
    }
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.age > s.life) shooting.splice(i, 1);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.age += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += b.g * dt;
      b.vx *= Math.pow(0.4, dt); b.vy *= Math.pow(0.6, dt);
      if (b.age > b.life) bursts.splice(i, 1);
    }
    for (const sp of sprouts) sp.age += dt;
    pulses = pulses.filter(p => t - p < tree.maxDist / VEL + 1);
    if (state === 'live') {
      if (nextPulse < 0) nextPulse = t + 8;
      if (t > nextPulse) { pulses.push(t); nextPulse = t + 22 + Math.random() * 10; }
    }
    // les fruits s'illuminent quand la sève atteint leur branche
    for (const p of pulses) {
      const front = (t - p) * VEL, prev = (t - dt - p) * VEL;
      for (const f of fruits) if (f.anchor && f.anchor.dist <= front && f.anchor.dist > prev) f.flash = 1;
    }
  }

  // ——— Dessin
  function draw(ctx, t) {
    const ph = state === 'seed' ? 0.755 : phase();
    const night = nightness(ph);
    const [top, bot] = skyAt(ph);
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, rgba(top));
    sky.addColorStop(1, rgba(bot));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (night > 0.02) {
      for (const s of stars) {
        const a = night * (0.45 + 0.55 * Math.sin(t * s.tw + s.ph)) * (s.s > 1.2 ? 1 : 0.75);
        if (a <= 0.02) continue;
        ctx.fillStyle = s.warm > 0.8 ? `rgba(255,220,190,${a})` : `rgba(225,230,255,${a})`;
        ctx.fillRect(s.x * W, s.y * groundY, s.s, s.s);
      }
    }
    const sun = astrePos(ph), moon = astrePos((ph + 0.5) % 1);
    const mr = moonImg.width / 2;
    ctx.globalCompositeOperation = 'lighter';
    if (sun.y < groundY + 40) {
      const warm = mixRgb(hexToRgb('#ffd9a0'), hexToRgb('#ff8a5c'), 1 - clamp(sunElev(ph) * 2.5, 0, 1));
      drawGlow(ctx, glow(warm.map(Math.round), 64), sun.x, sun.y, Math.min(W, H) * 0.32, 0.55);
      drawGlow(ctx, glow([255, 245, 225], 32), sun.x, sun.y, mr * 1.6, 0.95);
    }
    if (moon.y < groundY + 40 && night > 0.05) drawGlow(ctx, glow([190, 200, 255], 64), moon.x, moon.y, mr * 7, 0.22 * night);
    ctx.globalCompositeOperation = 'source-over';
    if (moon.y < groundY + 40) { ctx.globalAlpha = 0.25 + 0.75 * night; ctx.drawImage(moonImg, moon.x - mr, moon.y - mr); ctx.globalAlpha = 1; }

    ctx.lineCap = 'round';
    for (const s of shooting) {
      const k = 1 - s.age / s.life;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); ctx.stroke();
    }

    const horizonTint = mixRgb(bot, [6, 5, 14], 0.55);
    drawHill(ctx, hills[0], groundY - H * 0.16, H * 0.07, rgba(mixRgb(horizonTint, bot, 0.25)), -0.012);
    drawHill(ctx, hills[1], groundY - H * 0.08, H * 0.06, rgba(mixRgb(horizonTint, [4, 3, 10], 0.45)), -0.022);

    if (state !== 'seed') drawTree(ctx, t, night);

    drawHill(ctx, hills[2], groundY + 4, H * 0.018, rgba(mixRgb([5, 4, 11], bot, 0.06)), -0.035);
    ctx.fillStyle = rgba(mixRgb([5, 4, 11], bot, 0.06));
    ctx.fillRect(0, groundY + H * 0.03, W, H);
    drawGrass(ctx, t, night);
    drawSprouts(ctx, t, night);
    if (state === 'live' && api.rootsOpen()) drawDoor(ctx, t);
    if (state === 'seed' || (state === 'grow' && growT < 1.6)) drawSeed(ctx);

    ctx.globalCompositeOperation = 'lighter';
    const fly = glow([215, 255, 140], 24);
    for (const f of flies) {
      const blink = Math.pow(Math.max(0, Math.sin(t * 1.7 + f.ph)), 3);
      drawGlow(ctx, fly, f.x, f.y, 9 + blink * 7, night * (0.25 + 0.75 * blink));
    }
    const dust = glow([255, 236, 200], 16);
    for (const m of motes) drawGlow(ctx, dust, m.x, m.y, 3.5, (1 - night) * 0.35 * (0.6 + 0.4 * Math.sin(t + m.ph)));
    for (const b of bursts) drawGlow(ctx, glow(b.c, 16), b.x, b.y, b.r * (1 - (b.age / b.life) * 0.5), 1 - b.age / b.life);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (state !== 'seed') drawLabels(ctx);
    ctx.drawImage(vignette, 0, 0, W, H);
  }

  function drawHill(ctx, pts, base, amp, color, par) {
    const off = parX * par;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, H);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(-40 + (i / (pts.length - 1)) * (W + 80) + off, base - pts[i] * amp * 2.2);
    ctx.lineTo(W + 40, H);
    ctx.closePath();
    ctx.fill();
  }

  // Le passage vers les Racines : une fente de lumière entre les racines, quand assez de secrets l'ont ouverte
  function drawDoor(ctx, t) {
    const x = rootX, y = groundY + 16, k = 0.8 + 0.2 * Math.sin(t * 2.2);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([180, 140, 255], 48), x, y, 70 * k, 0.45);
    ctx.strokeStyle = `rgba(220,200,255,${0.5 * k})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + (i - 3) * 0.32;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 26 * k, y + Math.sin(a) * 14 * k);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.font = '400 9px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = `rgba(220,200,255,${0.55 * k})`;
    ctx.fillText('↓ RACINES', x, y + 18);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function drawSeed(ctx) {
    const k = state === 'seed' ? 1 : 1 - clamp(growT / 1.6, 0, 1);
    const r = 5 + Math.sin(seedT * 2.4) * 1.4;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow(GOLD, 48), rootX, groundY - 3, 70 + Math.sin(seedT * 2.4) * 10, 0.55 * k);
    drawGlow(ctx, glow([255, 250, 230], 16), rootX, groundY - 3, r * 2.2, k);
    ctx.globalCompositeOperation = 'source-over';
    if (state === 'grow') {
      const rk = clamp(growT / 1.3, 0, 1);
      ctx.strokeStyle = `rgba(255,212,138,${0.55 * k + 0.2})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + (i - 2.5) * 0.32;
        ctx.beginPath();
        ctx.moveTo(rootX, groundY);
        ctx.quadraticCurveTo(rootX + Math.cos(a) * 30 * rk, groundY + 20 * rk, rootX + Math.cos(a) * 70 * rk, groundY + Math.sin(a) * 50 * rk);
        ctx.stroke();
      }
    }
  }

  function drawTree(ctx, t, night) {
    const bark = rgba(mixRgb(BARK_DAY, BARK_NIGHT, night));
    const k = WK * S;
    // branches, regroupées par épaisseur pour tracer vite
    const buckets = new Map();
    for (const n of nodes) {
      if (!n.parent || n.g <= 0) continue;
      const w = Math.max(0.6, n.w * k * (1 + Math.max(0, 0.45 - n.dist) * 1.8)); // le pied s'évase
      const key = w < 4 ? Math.round(w * 4) / 4 : Math.round(w);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(n);
    }
    ctx.strokeStyle = bark;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, list] of buckets) {
      ctx.lineWidth = w;
      ctx.beginPath();
      for (const n of list) { ctx.moveTo(n.x0, n.y0); ctx.lineTo(n.x1, n.y1); }
      ctx.stroke();
    }
    // pulsations de sève : une lumière qui monte du pied jusqu'aux brindilles
    if (pulses.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pulses) {
        const front = (t - p) * VEL;
        for (const n of nodes) {
          if (!n.parent || n.g < 0.5) continue;
          const d = Math.abs(n.dist - front);
          if (d > 0.16) continue;
          ctx.strokeStyle = `rgba(255,214,140,${0.7 * (1 - d / 0.16)})`;
          ctx.lineWidth = Math.max(1.4, n.w * k * 0.55);
          ctx.beginPath(); ctx.moveTo(n.x0, n.y0); ctx.lineTo(n.x1, n.y1); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // feuillage : un pointillisme de feuilles, qui luit la nuit
    const front = growT * VEL;
    const tones = [0, 1, 2].map(i => mixRgb(LEAF_DAY[i], LEAF_NIGHT[i], night));
    for (let tone = 0; tone < 3; tone++) {
      ctx.fillStyle = rgba(tones[tone], 0.78);
      ctx.beginPath();
      for (const n of twigs) {
        const la = growT >= 900 ? 1 : clamp((front - n.dist - 0.1) / 0.5, 0, 1);
        if (la <= 0) continue;
        for (const l of n.leaves) {
          if (l.tone !== tone) continue;
          const a = l.a + n.abs;
          const x = n.x1 + Math.cos(a) * l.d * S, y = n.y1 + Math.sin(a) * l.d * S;
          const r = l.r * S * la;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
      }
      ctx.fill();
    }
    if (night > 0.1) {
      // la nuit, la couronne respire une lumière douce
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < twigs.length; i += 7) {
        const n = twigs[i];
        if (growT < 900 && front < n.dist) continue;
        drawGlow(ctx, glow(LEAF_NIGHT[i % 3], 24), n.x1, n.y1, S * 0.11, 0.13 * night);
        if (i % 28 === 0) drawGlow(ctx, glow(LEAF_NIGHT[(i >> 2) % 3], 64), n.x1, n.y1, S * 0.45, 0.05 * night);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // fleurs des secrets trouvés
    const found = secrets.foundIndex();
    found.forEach((s, i) => {
      const n = flowerSlots[i % flowerSlots.length];
      if (!n) return;
      const b0 = bloomT.get(s.id);
      const k2 = b0 === undefined ? 1 : easeOutBack(clamp((t - b0) / 1.4, 0, 1));
      const la = growT >= 900 ? 1 : clamp((front - n.dist) / 0.5, 0, 1);
      drawFlower(ctx, n.x1, n.y1, clamp(S * 0.045, 4, 8) * k2 * la, t * 0.3 + i, night);
    });
    for (const f of fruits) drawFruit(ctx, f, t, night);
  }

  function drawFlower(ctx, x, y, r, rot, night) {
    if (r <= 0.3) return;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 200, 235], 24), x, y, r * 3.4, 0.35 + 0.4 * night);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,236,246,0.95)';
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * TAU;
      const rr = r * (0.35 + 0.65 * Math.abs(Math.cos(2.5 * a)));
      const px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,120,0.95)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
  }

  function fruitPop() { return growT >= 900 ? 1 : easeOutBack(clamp((growT - (GROW_DUR - 1.1)) / 0.8, 0, 1)); }

  function drawFruit(ctx, f, t, night) {
    const pop = fruitPop();
    if (pop <= 0) return;
    const ready = f.realm.ready;
    const r = fruitR() * pop * (ready ? 1 + f.hover * 0.28 + Math.sin(t * 1.6 + f.idx) * 0.04 : 0.62);
    const a = f.anchor;
    if (a) {
      ctx.strokeStyle = rgba(f.color, (ready ? 0.32 : 0.16) * pop + f.flash * 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.quadraticCurveTo((a.x1 + f.x) / 2, Math.max(a.y1, f.y) + S * 0.08, f.x, f.y - r);
      ctx.stroke();
    }
    if (ready) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow(f.color, 48), f.x, f.y, r * (3.2 + f.flash * 2), 0.38 + 0.25 * night + f.hover * 0.3 + f.flash * 0.5);
      ctx.globalCompositeOperation = 'source-over';
      const grd = ctx.createRadialGradient(f.x - r * 0.35, f.y - r * 0.4, r * 0.1, f.x, f.y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.35, rgba(f.color, 0.95));
      grd.addColorStop(1, rgba(mixRgb(f.color, [10, 6, 20], 0.55), 0.95));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, r * 0.62, r * 0.22, t * 0.6 + f.idx, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = rgba(mixRgb(f.color, [20, 14, 30], 0.6), 0.85);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - r * 1.3);
      ctx.quadraticCurveTo(f.x + r, f.y - r * 0.2, f.x, f.y + r * 0.9);
      ctx.quadraticCurveTo(f.x - r, f.y - r * 0.2, f.x, f.y - r * 1.3);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow(f.color, 24), f.x, f.y, r * 2.2, 0.12 + 0.1 * night);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawLabels(ctx) {
    const a = growT >= 900 ? 1 : clamp((growT - GROW_DUR + 0.5) / 0.5, 0, 1);
    if (a <= 0) return;
    ctx.textAlign = 'center';
    const small = W < 560;
    const r = fruitR();
    for (const f of fruits) {
      const ready = f.realm.ready;
      const above = Math.abs(f.u) < 0.75; // les fruits du sommet portent leur nom au-dessus
      ctx.font = '400 9.5px "DM Mono", ui-monospace, monospace';
      if ('letterSpacing' in ctx) ctx.letterSpacing = small ? '1.5px' : '3px';
      const name = f.realm.short.toUpperCase();
      const tw = ctx.measureText(name).width;
      const lx = clamp(f.x, 10 + tw / 2, W - 10 - tw / 2);
      ctx.fillStyle = `rgba(239,233,255,${(ready ? 0.72 : 0.36) * a + f.hover * 0.28})`;
      ctx.textBaseline = above ? 'bottom' : 'top';
      ctx.fillText(name, lx, above ? f.y - r * 1.55 - 4 : f.y + r * 1.55 + 4);
      if (f.hover > 0.05) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        ctx.font = `italic 400 ${small ? 18 : 23}px "Cormorant Garamond", Georgia, serif`;
        const title = ready ? f.realm.title : 'Pas encore mûr';
        const w2 = ctx.measureText(title).width;
        ctx.fillStyle = `rgba(255,255,255,${f.hover})`;
        ctx.textBaseline = above ? 'top' : 'bottom';
        ctx.fillText(title, clamp(f.x, 10 + w2 / 2, W - 10 - w2 / 2), above ? f.y + r * 1.6 + 6 : f.y - r * 1.6 - 6);
      }
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function drawGrass(ctx, t, night) {
    ctx.strokeStyle = rgba(mixRgb([14, 12, 22], [5, 4, 11], night));
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of blades) {
      let bend = b.lean + Math.sin(t * 1.6 + b.ph + b.x * 0.01) * 0.12 + (wind + userWind) * 6;
      if (input.inside) {
        const dx = b.x - input.x, dy = groundY - input.y;
        if (Math.abs(dx) < 70 && Math.abs(dy) < 90) bend += Math.sign(dx) * (1 - Math.abs(dx) / 70) * 0.9;
      }
      ctx.moveTo(b.x, groundY + 8);
      ctx.quadraticCurveTo(b.x + Math.sin(bend) * b.h * 0.3, groundY - b.h * 0.4, b.x + Math.sin(bend) * b.h, groundY + 6 - Math.cos(bend) * b.h);
    }
    ctx.stroke();
  }

  // Pousses plantées au pied de l'arbre : tige qui se courbe, deux feuilles, un bourgeon qui luit
  function drawSprouts(ctx, t, night) {
    for (const sp of sprouts) {
      const k = easeOutBack(clamp(sp.age / 2.6, 0, 1));
      const h = sp.h * k;
      const sw = Math.sin(t * 1.3 + sp.ph) * 0.08 + (wind + userWind) * 3;
      const tipX = sp.x + Math.sin(sp.lean + sw) * h, tipY = groundY - Math.cos(sp.lean + sw) * h;
      ctx.strokeStyle = rgba(mixRgb([60, 120, 80], [70, 190, 150], night), 0.95);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sp.x, groundY + 4);
      ctx.quadraticCurveTo(sp.x + sp.curl * h * 0.4, groundY - h * 0.5, tipX, tipY);
      ctx.stroke();
      ctx.fillStyle = rgba(mixRgb([70, 150, 90], [80, 220, 170], night), 0.9);
      for (const side of [-1, 1]) {
        const lx = lerp(sp.x, tipX, 0.55), ly = lerp(groundY, tipY, 0.55);
        const la = -Math.PI / 2 + side * 0.9 + sw;
        const L = 9 * k;
        ctx.beginPath();
        ctx.ellipse(lx + Math.cos(la) * L * 0.5, ly + Math.sin(la) * L * 0.5, L * 0.55, L * 0.22, la, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow(sp.c, 16), tipX, tipY, 6 + 4 * k, 0.6 + 0.3 * night);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ——— Gestes
  function fruitAt(x, y) {
    if (fruitPop() < 0.5) return null;
    let best = null, bd = 1e9;
    for (const f of fruits) {
      const d = Math.hypot(x - f.x, y - f.y);
      if (d < fruitR() * 2 + 10 && d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function burst(x, y, c, n = 14, sp = 120, g = -10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random());
      bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, c, r: 4 + Math.random() * 6, age: 0, life: 0.8 + Math.random() * 0.9 });
    }
  }

  function tap(p) {
    if (state === 'seed') { api.seuilStart(); return; }
    if (state !== 'live') return;
    const t = engine.t, ph = phase(), night = nightness(ph);
    const f = fruitAt(p.x, p.y);
    if (f) {
      if (f.realm.ready) {
        audio.note(f.idx + 2, { type: 'bell', vel: 0.22, dur: 2.6, send: 0.5 });
        burst(f.x, f.y, f.color, 18, 160);
        api.go(f.realm.id);
      } else {
        audio.note(f.idx, { type: 'soft', vel: 0.1, dur: 1.6 });
        api.toast({ kicker: 'Pas encore mûr', title: f.realm.title, text: f.realm.sub + ' Ce fruit mûrit encore : reviens bientôt.', ms: 5200 });
      }
      return;
    }
    // l'astre : trois coups à sa porte
    const sun = astrePos(ph), moon = astrePos((ph + 0.5) % 1);
    const astre = night > 0.5 ? moon : sun;
    if (Math.hypot(p.x - astre.x, p.y - astre.y) < Math.max(36, moonImg.width)) {
      astreTaps = astreTaps.filter(x => t - x < 2.5);
      astreTaps.push(t);
      audio.note(7 + astreTaps.length, { type: 'glass', vel: 0.1, dur: 2 });
      if (astreTaps.length >= 3) { astreTaps = []; api.eclipse(); secrets.find('umbra'); }
      return;
    }
    // une étoile filante attrapée
    for (const s of shooting) {
      if (segDist(p.x, p.y, s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12) < 46) {
        burst(s.x, s.y, [255, 250, 220], 26, 220, 30);
        [0, 2, 4, 7, 9].forEach((d, i) => audio.note(d + 10, { type: 'glass', vel: 0.08, at: i * 0.06, dur: 2.5 }));
        s.age = s.life;
        secrets.find('voeu');
        return;
      }
    }
    // la fente entre les racines
    if (api.rootsOpen() && Math.hypot(p.x - rootX, p.y - (groundY + 18)) < 42) {
      audio.note(-3, { type: 'soft', vel: 0.14, dur: 3, oct: -1 });
      api.go('racines');
      return;
    }
    // le tronc : un cœur qui bat
    for (const n of nodes) {
      if (!n.parent || n.w < tree.wMax * 0.5) continue;
      if (segDist(p.x, p.y, n.x0, n.y0, n.x1, n.y1) < n.w * WK * S * 0.5 + 14) {
        pulses.push(t);
        trunkTaps = trunkTaps.filter(x => t - x < 6);
        trunkTaps.push(t);
        audio.note(-5 + trunkTaps.length, { type: 'pluck', vel: 0.25, dur: 1.4, oct: -1 });
        if (trunkTaps.length >= 5) {
          trunkTaps = [];
          for (const fr of fruits) { fr.flash = 1.4; burst(fr.x, fr.y, fr.color, 10, 90); }
          secrets.find('seve');
        }
        return;
      }
    }
    // le sol : planter une pousse
    if (p.y > groundY - 14) {
      const c = [[255, 214, 140], [190, 160, 255], [130, 240, 200], [255, 160, 200]][planted % 4];
      sprouts.push({ x: p.x, h: 26 + Math.random() * 30, lean: (Math.random() - 0.5) * 0.5, curl: (Math.random() - 0.5) * 0.6, ph: Math.random() * TAU, age: 0, c });
      if (sprouts.length > 28) sprouts.shift();
      planted++;
      audio.note(8 + (planted % 5), { type: 'pluck', vel: 0.16, dur: 1.2 });
      if (planted >= 7) secrets.find('jardinier');
      return;
    }
    // le ciel : un essaim de lumière
    burst(p.x, p.y, night > 0.4 ? [215, 255, 140] : [255, 236, 200], 12, 90, -6);
    audio.note(5 + Math.floor(Math.random() * 5), { type: 'glass', vel: 0.06, dur: 1.8 });
  }

  function move(p) {
    if (state !== 'live') return;
    const f = fruitAt(p.x, p.y);
    if (f !== hovered) {
      hovered = f;
      engine.canvas.style.cursor = f ? 'pointer' : '';
      if (f && f.realm.ready) audio.note(f.idx + 2, { type: 'soft', vel: 0.05, dur: 1.2, send: 0.6 });
    }
  }
  function up(p) { if (p.type !== 'mouse' && hovered) { hovered = null; engine.canvas.style.cursor = ''; } }

  function germinate() {
    if (state !== 'seed') return;
    state = 'grow';
    growT = 0;
    audio.note(0, { type: 'bell', vel: 0.2, dur: 3.5, send: 0.6, oct: -1 });
  }

  function destroy() { unsub(); engine.canvas.style.cursor = ''; }

  return { resize, update, draw, tap, move, up, germinate, destroy };
}
