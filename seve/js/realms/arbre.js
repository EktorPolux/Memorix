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
// Le jardin au pied de l'arbre se souvient de ce qu'on y a planté, même après une longue balade
const GARDEN_KEY = 'seve.jardin';
const SPROUT_COLS = [[255, 214, 140], [190, 160, 255], [130, 240, 200], [255, 160, 200]];
const BLOOM_MS = 4 * 60 * 1000; // une pousse met quatre minutes à fleurir
function loadGarden() {
  try { const g = JSON.parse(localStorage.getItem(GARDEN_KEY) || '[]'); return Array.isArray(g) ? g.filter(s => s && isFinite(s.u)).slice(-28) : []; } catch (_) { return []; }
}
function saveGarden(list) {
  try {
    localStorage.setItem(GARDEN_KEY, JSON.stringify(list.map(s => ({ u: +s.u.toFixed(4), h: Math.round(s.h), lean: +s.lean.toFixed(3), curl: +s.curl.toFixed(3), ph: +s.ph.toFixed(2), ci: s.ci, born: s.born, petals: s.petals }))));
  } catch (_) { /* stockage indisponible : le jardin vivra le temps de la page */ }
}
const WK = 0.0158; // épaisseur d'une brindille, en unités d'arbre

// ——— Colonisation de l'espace (Runions, Lane & Prusinkiewicz, 2007)
// Des points attracteurs remplissent une couronne ; chaque bourgeon pousse vers ceux qui sont les plus proches de lui.
function colonize(seed, portrait, q) {
  const R = rng(seed);
  const NA = Math.round((portrait ? 1300 : 1800) * (q < 0.8 ? 0.7 : 1));
  const rx = portrait ? 1.12 : 1.9, ry = portrait ? 1.42 : 1.12, cx = 0, cy = portrait ? -2.3 : -2.0;
  const di = 0.5, dk = 0.055, D = q < 0.8 ? 0.06 : 0.05, MAXN = q < 0.8 ? 2200 : 3200;
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
  const twigs = nodes.filter(n => n.parent && n.w <= 1.5);
  for (const n of twigs) {
    n.leaves = [];
    const k = n.w <= 1.25 ? 2 : 1;
    // trois sortes de feuilles, par bouquets : rondes, en amande, en trèfle
    const kind = ((n.i * 2654435761) >>> 0) % 7 < 3 ? 0 : ((n.i * 40503) >>> 0) % 5 < 3 ? 1 : 2;
    for (let j = 0; j < k; j++) n.leaves.push({ a: R() * TAU, d: 0.008 + R() * 0.055, r: 0.011 + R() * 0.013, tone: (R() * 3) | 0, kind });
  }
  // au bout de chaque rameau, deux fourches de plus, puis deux encore : le dessin devient fractal
  for (const n of nodes) {
    if (!n.parent || n.kids.length) continue;
    const l1 = 0.04 + R() * 0.025, a1 = 0.3 + R() * 0.22, spr = [-1, -a1, l1, -1, a1 * 0.85, l1 * 0.9];
    for (const p of [0, 1]) { const l2 = l1 * (0.58 + R() * 0.15), a2 = 0.32 + R() * 0.22; spr.push(p, -a2, l2, p, a2, l2 * 0.85); }
    n.spr = spr;
  }
  let minX = 0, maxX = 0, minY = 0, cminX = 1e9, cmaxX = -1e9, cminY = 1e9, cmaxY = -1e9, maxDist = 0, wMax = 0;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y);
    maxDist = Math.max(maxDist, n.dist); wMax = Math.max(wMax, n.w);
  }
  for (const n of twigs) { cminX = Math.min(cminX, n.x); cmaxX = Math.max(cmaxX, n.x); cminY = Math.min(cminY, n.y); cmaxY = Math.max(cmaxY, n.y); }
  return { nodes, twigs, bbox: { minX, maxX, minY }, crown: { minX: cminX, maxX: cmaxX, minY: cminY, maxY: cmaxY }, maxDist, wMax };
}

// Les petits esprits de l'écorce se souviennent de leurs visites : la première fois, il faut les mériter
const SPIRIT_KEY = 'seve.esprits';
const loadSpirits = () => { try { return +localStorage.getItem(SPIRIT_KEY) || 0; } catch (_) { return 0; } };
const saveSpirits = n => { try { localStorage.setItem(SPIRIT_KEY, String(n)); } catch (_) { /* stockage indisponible */ } };

// L'épaisseur dessinée : fine aux brindilles, massive au tronc, évasée au pied
const branchPx = (n, k) => k * (0.5 + 0.15 * Math.pow(n.w, 1.8)) * (1 + 1.6 * Math.exp(-n.dist / 0.35));
// Les saisons de l'Arbre suivent l'heure réelle : un tour complet en neuf minutes, le même pour toutes les visites
const SEASON_MS = 9 * 60 * 1000;
const SEASON_NAMES = ['printemps', 'été', 'automne', 'hiver'];
const SEASON_TINTS = [[150, 215, 130], [40, 118, 76], [206, 128, 56], [132, 162, 204]].map(c => c);
function seasonNow() {
  const f = ((Date.now() / SEASON_MS) % 1) * 4, i = Math.floor(f) % 4, j = (i + 1) % 4, k = smoothstep(0.75, 1, f - Math.floor(f));
  return { i, k, tint: mixRgb(SEASON_TINTS[i], SEASON_TINTS[j], k), w: [0, 1, 2, 3].map(s => (s === i ? 1 - k : s === j ? k : 0)) };
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
  let wind = 0, userWind = 0, gust = 0, parX = 0;
  // deux balanciers : les brindilles répondent vite, le tronc lentement ; tous deux dépassent un peu, puis reviennent
  const sway = { fast: 0, fastV: 0, slow: 0, slowV: 0 };
  const hand = { x: -1e4, k: 0 }; // la main qui écarte l'herbe, adoucie
  let vignette = null, moonImg = null, hovered = null, leafLayer = null, leafCtx = null, leafFresh = false;
  let state = opts.intro && !hasGerminated ? 'seed' : 'live';
  let growT = state === 'seed' ? -1 : 999;
  if (opts.regrow) { state = 'grow'; growT = 0; } // après la Graine d'Or : un autre arbre pousse sous tes yeux
  let seedT = 0, lastLvl = -1, nextPulse = -1;
  // ——— Les racines : sept bras qui s'agrippent à la terre, puis plongent ; et dessous, le réseau
  const rootR = rng(secrets.seed + 23);
  const ROOTS = Array.from({ length: 7 }, (_, i) => ({ side: i % 2 ? 1 : -1, rank: Math.floor(i / 2), spread: 0.5 + rootR() * 0.9, depth: 0.2 + rootR() * 0.7, lift: rootR(), wig: rootR() * TAU }));
  let rootTaps = [], network = null; // network : une impulsion de sève qui court sous la terre jusqu'aux pousses

  // ——— Les petits esprits de l'écorce : ils viennent la nuit, quand le jardin a fleuri et que tout se tait.
  // Ils marchent, flairent les fleurs, se cachent derrière le tronc, grimpent s'asseoir sur une branche,
  // se saluent d'un « toc » de bois, s'approchent d'une main immobile, fuient une main pressée, et rentrent à l'aube.
  const spirits = [];
  let spiritsOn = false, spiritCalm = 0, stillT = 0, spiritMemory = loadSpirits();
  const spiritTapped = new Set();
  const seats = nodes.filter(n => n.parent && n.w >= 2.2 && n.w <= 6 && n.dist > 0.8 && n.dist < 2.1);
  function toc(s, at = 0) {
    audio.noise({ freq: 1300 + (s.id % 4) * 260, q: 14, dur: 0.06, vel: 0.07, type: 'bandpass', pan: clamp((s.x / W) * 2 - 1, -1, 1), send: 0.25, at });
  }
  function nod(s, n = 1) { for (let i = 0; i < n; i++) setTimeout(() => { s.tiltV += (s.look || 1) * (5 + Math.random() * 3); toc(s); }, i * 140); }
  function spiritsCanCome(night) {
    if (night < 0.55 || state !== 'live') return false;
    const bloomed = sprouts.some(sp => Date.now() - sp.born > BLOOM_MS * 0.6);
    return bloomed || spiritMemory > 0 || secrets.count() >= 6;
  }
  function spawnSpirits() {
    const n = 3 + Math.min(4, spiritMemory);
    const B = rootBase();
    for (let i = 0; i < n; i++) {
      const fromTrunk = i % 2 === 0;
      spirits.push({
        id: i, x: fromTrunk ? rootX + (Math.random() - 0.5) * B * 0.5 : (Math.random() < 0.5 ? -24 : W + 24), y: groundY + 2,
        size: clamp(S * 0.15, 16, 32) * (0.72 + Math.random() * 0.45), state: 'arrive', t: 0, tt: 2, alpha: 0, look: Math.random() < 0.5 ? -1 : 1,
        tilt: 0, tiltV: 0, tx: 0, hide: 0, bob: 0, lean: 0, behind: fromTrunk, seat: null, climbK: 0, sprouts: 1 + (Math.random() < 0.6 ? 1 : 0), delay: i * 1.7 + Math.random() * 2,
      });
    }
    spiritsOn = true;
    spiritMemory++;
    saveSpirits(spiritMemory);
    audio.note(9, { type: 'glass', vel: 0.03, dur: 3.5, send: 0.85 });
  }
  function chooseSpirit(s) {
    s.t = 0; s.lean = 0;
    const B = rootBase(), r = Math.random();
    const still = stillT > 1.2 && input.inside && Math.abs(input.x - s.x) < 240 && input.y > groundY - S * 1.2;
    if (still) { s.state = 'curious'; s.tt = 4 + Math.random() * 3; return; }
    const bloomed = sprouts.filter(sp => Date.now() - sp.born > BLOOM_MS * 0.4);
    if (r < 0.22 && bloomed.length) { const sp = bloomed[(Math.random() * bloomed.length) | 0]; s.state = 'walk'; s.next = 'sniff'; s.tx = sp.x + (s.x < sp.x ? -10 : 10); return; }
    if (r < 0.36) { s.state = 'walk'; s.next = 'peek'; s.tx = rootX + (Math.random() < 0.5 ? -1 : 1) * B * 0.42; return; }
    if (r < 0.46 && seats.length && !spirits.some(o => o.state === 'climb' || o.state === 'sit')) { s.state = 'walk'; s.next = 'climb'; s.tx = rootX + (Math.random() - 0.5) * B * 0.3; return; }
    if (r < 0.72) { s.state = 'walk'; s.next = 'idle'; s.tx = clamp(rootX + (Math.random() - 0.5) * W * 0.8, 20, W - 20); return; }
    s.state = 'idle'; s.tt = 2 + Math.random() * 4;
  }
  function updateSpirits(dt, t, night) {
    const sp = Math.hypot(input.vx, input.vy);
    stillT = input.inside && sp < 30 ? stillT + dt : 0;
    if (!spiritsOn) {
      spiritCalm = engine.idle() > 4 ? spiritCalm + dt : 0;
      if (spiritCalm > 1 && spiritsCanCome(night)) spawnSpirits();
      return;
    }
    const dawn = night < 0.3, B = rootBase();
    for (let i = spirits.length - 1; i >= 0; i--) {
      const s = spirits[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t += dt;
      s.tiltV += (-s.tilt * 30 - s.tiltV * 5) * dt;
      s.tilt += s.tiltV * dt;
      const near = input.inside ? Math.hypot(input.x - s.x, input.y - (s.y - s.size)) : 1e9;
      if (s.state !== 'leave' && dawn && s.state !== 'sit' && s.state !== 'climb') { s.state = 'walk'; s.next = 'leave'; s.tx = rootX; s.seat = null; }
      if (s.state !== 'leave' && s.state !== 'hide' && s.state !== 'sit' && s.state !== 'climb' && near < 120 && sp > 480) {
        // une main pressée : on file se cacher derrière le tronc, ou dans l'herbe
        s.state = 'hide'; s.t = 0; s.tx = Math.abs(s.x - rootX) < W * 0.2 ? rootX + Math.sign(s.x - rootX || 1) * B * 0.38 : s.x + Math.sign(s.x - input.x || 1) * 60;
        toc(s);
      }
      switch (s.state) {
        case 'arrive': s.alpha = Math.min(1, s.alpha + dt * 0.5); if (s.alpha >= 1) chooseSpirit(s); break;
        case 'walk': {
          const d = s.tx - s.x;
          s.look = Math.sign(d) || s.look;
          s.x += Math.sign(d) * Math.min(Math.abs(d), s.size * 1.4 * dt);
          s.bob += dt * 10;
          if (Math.abs(s.x - rootX) > B * 0.6) s.behind = false;
          if (Math.abs(d) < 2) {
            const nx = s.next; s.next = null;
            if (nx === 'sniff') { s.state = 'sniff'; s.tt = 3 + Math.random() * 2; }
            else if (nx === 'peek') { s.state = 'idle'; s.behind = true; s.look = Math.sign(s.x - rootX) || 1; s.tt = 4 + Math.random() * 4; }
            else if (nx === 'climb') { s.state = 'climb'; s.seat = seats[(Math.random() * seats.length) | 0]; s.climbK = 0; s.behind = false; }
            else if (nx === 'leave') { s.state = 'leave'; s.behind = true; }
            else { s.state = 'idle'; s.tt = 2 + Math.random() * 4; }
            s.t = 0;
          }
          break;
        }
        case 'idle':
          if (Math.random() < dt * 0.35) s.look = -s.look;
          if (Math.random() < dt * 0.22) nod(s);
          // deux esprits qui se croisent se saluent
          for (const o of spirits) if (o !== s && o.state === 'idle' && !o.behind && !s.behind && Math.abs(o.x - s.x) < s.size * 2.2 && Math.random() < dt * 0.5) { s.look = Math.sign(o.x - s.x) || 1; o.look = -s.look; nod(s); setTimeout(() => nod(o), 300); }
          if (s.t > s.tt) chooseSpirit(s);
          break;
        case 'sniff': s.lean = Math.sin(s.t * 3) * 0.12 + 0.25 * s.look; if (Math.random() < dt * 0.6) nod(s); if (s.t > s.tt) chooseSpirit(s); break;
        case 'curious': {
          // une main immobile : on s'approche un peu, et on la regarde, la tête penchée
          s.look = Math.sign(input.x - s.x) || s.look;
          const d = input.x - s.x;
          if (Math.abs(d) > 46) { s.x += Math.sign(d) * Math.min(Math.abs(d) - 46, s.size * 0.9 * dt); s.bob += dt * 7; }
          s.lean = -0.18 * s.look;
          if (Math.random() < dt * 0.5) nod(s);
          if (s.t > s.tt || stillT === 0) chooseSpirit(s);
          break;
        }
        case 'hide': {
          const d = s.tx - s.x;
          s.x += Math.sign(d) * Math.min(Math.abs(d), s.size * 5 * dt);
          s.hide = Math.min(1, s.hide + dt * 4);
          if (Math.abs(s.x - rootX) < B * 0.45) s.behind = true;
          if (s.t > 3 && (!input.inside || Math.hypot(input.x - s.x, input.y - s.y) > 160)) { s.hide = Math.max(0, s.hide - dt * 2); if (s.hide <= 0) chooseSpirit(s); }
          break;
        }
        case 'climb': case 'down': {
          s.climbK = clamp(s.climbK + (s.state === 'climb' ? dt : -dt) / 2.6, 0, 1);
          if (s.state === 'climb' && s.climbK >= 1) { s.state = 'sit'; s.t = 0; s.tt = 7 + Math.random() * 8; }
          if (s.state === 'down' && s.climbK <= 0) { s.y = groundY + 2; s.x = rootX + (Math.random() - 0.5) * B * 0.3; chooseSpirit(s); }
          break;
        }
        case 'sit': if (Math.random() < dt * 0.3) s.look = -s.look; if (Math.random() < dt * 0.15) nod(s); if (s.t > s.tt || dawn) { s.state = 'down'; } break;
        case 'leave': s.alpha -= dt * 0.45; if (s.alpha <= 0) spirits.splice(i, 1); break;
        default: break;
      }
      // grimper : le long du tronc, puis de la branche, jusqu'au siège
      if ((s.state === 'climb' || s.state === 'down' || s.state === 'sit') && s.seat) {
        const k = s.state === 'sit' ? 1 : s.climbK, seat = s.seat;
        const tx = lerp(rootX, seat.x1, smoothstep(0.35, 1, k)), ty = lerp(groundY + 2, seat.y1 + 2, k);
        s.x = tx; s.y = ty;
        if (s.state !== 'sit') s.bob += dt * 12;
      }
    }
    if (!spirits.length) { spiritsOn = false; spiritCalm = 0; spiritTapped.clear(); }
  }
  // un esprit : un galet pâle, une tête ronde coiffée d'une pousse, deux yeux sombres ; la nuit, il luit à peine
  function drawSpirit(ctx, s, night) {
    if (s.delay > 0 || s.alpha <= 0.01) return;
    const z = s.size, bob = Math.abs(Math.sin(s.bob)) * z * 0.07;
    ctx.save();
    ctx.translate(s.x, s.y - bob);
    ctx.globalAlpha = s.alpha * (1 - s.hide * 0.4);
    ctx.scale(1, 1 - s.hide * 0.32);
    if (night > 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([190, 240, 210], 24), 0, -z * 0.6, z * 1.4, 0.16 * night * s.alpha);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = s.alpha * (1 - s.hide * 0.4);
    }
    const pale = 'rgba(234,242,232,0.93)';
    ctx.fillStyle = pale;
    ctx.beginPath(); ctx.ellipse(0, -z * 0.3, z * 0.22, z * 0.32, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = pale;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, z * 0.07);
    const sw = s.state === 'walk' ? Math.sin(s.bob) * 0.5 : 0;
    ctx.beginPath();
    ctx.moveTo(-z * 0.18, -z * 0.42); ctx.lineTo(-z * 0.34, -z * (0.2 + sw * 0.2));
    ctx.moveTo(z * 0.18, -z * 0.42); ctx.lineTo(z * 0.34, -z * (0.2 - sw * 0.2));
    if (s.state === 'walk' || s.state === 'curious') { ctx.moveTo(-z * 0.08, -z * 0.02); ctx.lineTo(-z * 0.1 - sw * z * 0.12, z * 0.04); ctx.moveTo(z * 0.08, -z * 0.02); ctx.lineTo(z * 0.1 + sw * z * 0.12, z * 0.04); }
    ctx.stroke();
    ctx.translate(0, -z * 0.6);
    ctx.rotate(s.tilt * 0.35 + s.lean);
    ctx.beginPath(); ctx.ellipse(0, -z * 0.2, z * 0.31, z * 0.27, 0, 0, TAU); ctx.fill();
    // la pousse sur la tête
    ctx.fillStyle = 'rgba(150,212,140,0.95)';
    ctx.beginPath();
    ctx.ellipse(z * 0.07, -z * 0.53, z * 0.1, z * 0.045, -0.6, 0, TAU);
    if (s.sprouts > 1) ctx.ellipse(-z * 0.07, -z * 0.53, z * 0.1, z * 0.045, 0.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,212,140,0.95)';
    ctx.lineWidth = Math.max(0.8, z * 0.035);
    ctx.beginPath(); ctx.moveTo(0, -z * 0.45); ctx.lineTo(0, -z * 0.52); ctx.stroke();
    // le visage
    const lx = s.look * z * 0.06;
    ctx.fillStyle = 'rgba(30,34,40,0.9)';
    ctx.beginPath();
    ctx.ellipse(lx - z * 0.1, -z * 0.22, z * 0.042, z * 0.06, 0, 0, TAU);
    ctx.ellipse(lx + z * 0.1, -z * 0.22, z * 0.042, z * 0.06, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath(); ctx.arc(lx * 1.2, -z * 0.1, z * 0.024, 0, TAU); ctx.fill();
    ctx.restore();
  }

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
    // beaucoup de mondes : les fruits voisins pendent à des distances différentes, sur deux ou trois cercles
    const rings = fruits.length > 13 ? [1, 1.13, 1.26] : fruits.length > 9 ? [1, 1.17] : [1];
    // l'anneau extérieur reste dans l'écran, et les fruits du sommet restent étagés au lieu de s'aplatir contre le haut
    const rxE = Math.min(rx, (W / 2 - 26) / rings[rings.length - 1]);
    const ryE = Math.min(ry, (Cy - topLimit) / rings[rings.length - 1]);
    for (const f of fruits) {
      const ring = rings[f.idx % rings.length];
      f.ring = ring;
      f.rx = clamp(Cx + Math.sin(f.u) * rxE * ring, 22, W - 22);
      f.ry = Math.max(topLimit, Cy - Math.cos(f.u) * ryE * ring);
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
    for (const sp of sprouts) sp.x = sp.u * W;
    placeFruits();
  }
  resize(W, H);
  for (const g of loadGarden()) {
    const ci = (g.ci | 0) % SPROUT_COLS.length;
    sprouts.push({ ...g, ci, x: g.u * W, c: SPROUT_COLS[ci], age: 99, born: g.born || Date.now(), petals: g.petals || 5 });
  }
  planted = sprouts.length;

  const fruitR = () => clamp(S * 0.085, 11, 19);
  const phase = () => (dayClock / DAY) % 1;
  const sunElev = ph => -Math.cos(ph * TAU);
  const nightness = ph => smoothstep(0.12, -0.32, sunElev(ph));
  const astrePos = ph => ({ x: W * 0.5 + Math.sin(ph * TAU - Math.PI) * W * 0.44, y: groundY - sunElev(ph) * H * 0.62 });

  // Le vent : brise lente, rafales, et ce que ta main y ajoute. Les brindilles plient plus que le tronc.
  function layout(t) {
    const front = growT * VEL;
    for (const n of nodes) {
      const p = n.parent;
      if (!p) { n.abs = 0; n.x1 = rootX; n.y1 = groundY; n.g = 1; continue; }
      n.g = growT >= 900 ? 1 : clamp((front - p.dist) / (n.len * 2 + 0.04), 0, 1);
      const wv = lerp(sway.fast, sway.slow, clamp((n.w - 0.8) / 4, 0, 1));
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
      // la souris effleure (elle passe vite et sans le vouloir) ; le doigt, lui, pousse exprès
      const gain = input.type === 'mouse' ? 0.0000016 : 0.0000035;
      if (inX && inY) gust += clamp(input.vx * gain, -0.0015, 0.0015);
    }
    gust *= Math.pow(0.35, dt);
    gust = clamp(gust, -0.05, 0.05);
    userWind += (gust - userWind) * Math.min(1, dt * 2.2); // l'air met un moment à se mettre en mouvement
    const force = wind + userWind;
    sway.fastV += ((force - sway.fast) * 30 - sway.fastV * 4.5) * dt;
    sway.fast += sway.fastV * dt;
    sway.slowV += ((force - sway.slow) * 7 - sway.slowV * 2.4) * dt;
    sway.slow += sway.slowV * dt;
    const nearGround = input.inside && Math.abs(input.y - groundY) < 90;
    hand.k += ((nearGround ? 1 : 0) - hand.k) * Math.min(1, dt * 3);
    if (input.inside) hand.x += (input.x - hand.x) * Math.min(1, dt * (hand.x < -1e3 ? 99 : 5));
    parX += ((input.inside ? input.x - W / 2 : 0) - parX) * Math.min(1, dt * 1.5);
    layout(t);

    for (const f of fruits) {
      const target = (sway.fast + sway.slow) * 1.1;
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
    updateSpirits(dt, t, night);
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
    // écho des Aurores : qui les a vues les retrouve, la nuit, au-dessus de l'arbre
    if (night > 0.3 && secrets.wasVisited('aurores')) drawEchoAurora(ctx, t, night);
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

    for (const s of spirits) if (s.behind && s.state !== 'sit' && s.state !== 'climb' && s.state !== 'down') drawSpirit(ctx, s, night);
    if (state !== 'seed') drawTree(ctx, t, night);
    for (const s of spirits) if (s.state === 'sit' || s.state === 'climb' || s.state === 'down') drawSpirit(ctx, s, night);

    drawHill(ctx, hills[2], groundY + 4, H * 0.018, rgba(mixRgb([5, 4, 11], bot, 0.06)), -0.035);
    ctx.fillStyle = rgba(mixRgb([5, 4, 11], bot, 0.06));
    ctx.fillRect(0, groundY + H * 0.03, W, H);
    if (state !== 'seed') drawRoots(ctx, t, night, mixRgb([5, 4, 11], bot, 0.06));
    for (const s of spirits) if (!s.behind && s.state !== 'sit' && s.state !== 'climb' && s.state !== 'down') drawSpirit(ctx, s, night);
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

  // le pied de l'arbre : une motte, des racines qui agrippent puis s'enfoncent, un réseau qui luit dessous
  const rootBase = () => branchPx(nodes[0], WK * S);
  function rootPath(r, B, rk) {
    const x0 = rootX + r.side * B * (0.16 + r.rank * 0.09), y0 = groundY - B * 0.06;
    const cx = rootX + r.side * (B * 0.55 + r.spread * B * 0.35) * rk, cy = groundY - B * 0.04 + r.lift * 5;
    const x1 = rootX + r.side * (B * 0.5 + r.spread * B * 1.25) * rk, y1 = groundY + (10 + r.depth * B * 0.55) * rk;
    return [x0, y0, cx, cy, x1, y1];
  }
  function drawRoots(ctx, t, night, groundC) {
    const B = rootBase(), rk = growT >= 900 ? 1 : clamp((growT - 0.2) / 1.6, 0, 1);
    if (rk <= 0) return;
    const barkC = mixRgb(BARK_DAY, BARK_NIGHT, night);
    // sous la terre : des filaments très pâles, qui s'éclairent un peu la nuit
    ctx.strokeStyle = `rgba(180,150,255,${0.05 + night * 0.08})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of ROOTS) {
      const [, , , , x1, y1] = rootPath(r, B, rk);
      for (let f = 0; f < 3; f++) { const ex = x1 + r.side * (30 + f * 40) * rk, ey = y1 + 14 + f * 9; ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + ex) / 2, ey + 12, ex, ey + Math.sin(r.wig + f) * 6); }
    }
    ctx.stroke();
    // la motte
    const mg = ctx.createRadialGradient(rootX, groundY - B * 0.05, B * 0.2, rootX, groundY + 4, B * 1.3 * rk);
    mg.addColorStop(0, rgba(mixRgb(groundC, barkC, 0.55), 1));
    mg.addColorStop(1, rgba(groundC, 0));
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.ellipse(rootX, groundY + 5, B * 1.3 * rk, B * 0.2 * rk + 4, 0, Math.PI, TAU); ctx.fill();
    // les racines : des fuseaux qui s'amincissent et pâlissent en entrant dans la terre
    for (const r of ROOTS) {
      const [x0, y0, cx, cy, x1, y1] = rootPath(r, B, rk);
      const w0 = B * (0.34 - r.rank * 0.07) * rk, L = [], Rr = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        const x = a * x0 + b * cx + c * x1, y = a * y0 + b * cy + c * y1;
        const tx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx), ty = 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy), tl = Math.hypot(tx, ty) || 1;
        const w = lerp(w0, 1, Math.pow(u, 0.7)) * 0.5;
        L.push(x - (ty / tl) * w, y + (tx / tl) * w);
        Rr.push(x + (ty / tl) * w, y - (tx / tl) * w);
      }
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgba(barkC, 1));
      g.addColorStop(0.55, rgba(mixRgb(barkC, groundC, 0.4), 0.85));
      g.addColorStop(1, rgba(groundC, 0.1));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(L[0], L[1]);
      for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
      for (let i = Rr.length - 2; i >= 0; i -= 2) ctx.lineTo(Rr[i], Rr[i + 1]);
      ctx.fill();
      const top = r.side > 0 ? Rr : L;
      ctx.strokeStyle = `rgba(${night > 0.5 ? '170,160,210' : '190,160,130'},${0.22 + night * 0.12})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < 18; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, top[i], top[i + 1]);
      ctx.stroke();
    }
    // le réseau réveillé : la sève court sous la terre jusqu'à chaque pousse
    if (network) {
      const k = (t - network.t) / 2.6;
      if (k > 1.4) network = null;
      else {
        ctx.globalCompositeOperation = 'lighter';
        const gl = glow([200, 170, 255], 16);
        const dests = sprouts.length ? sprouts.map(sp => sp.x) : [W * 0.15, W * 0.35, W * 0.65, W * 0.85];
        dests.forEach((dx, j) => {
          const r = ROOTS[j % ROOTS.length], [, , , , x1, y1] = rootPath(r, B, rk);
          const u = clamp(k - j * 0.04, 0, 1), mx = (x1 + dx) / 2, my = Math.max(y1, groundY + 10) + 26;
          const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
          const x = a * x1 + b * mx + c * dx, y = a * y1 + b * my + c * (groundY + 4);
          ctx.strokeStyle = `rgba(200,170,255,${0.18 * (1 - Math.max(0, k - 1) * 2.5)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, dx, groundY + 4); ctx.stroke();
          drawGlow(ctx, gl, x, y, 7, u < 1 ? 0.9 : 0);
          if (u >= 1) drawGlow(ctx, glow([230, 200, 255], 32), dx, groundY - 8, 26, 0.5 * (1.4 - k));
        });
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawEchoAurora(ctx, t, night) {
    const k = (night - 0.3) / 0.7;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 48; i++) {
      const n = noise.n2(i * 0.17, t * 0.05);
      const a = Math.max(0, n + 0.15) * 0.1 * k;
      if (a < 0.004) continue;
      const x = (i / 47) * W, top = H * (0.05 + 0.06 * noise.n2(i * 0.1 + 5, t * 0.03)), bottom = top + H * (0.15 + 0.08 * n);
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, 'rgba(255,60,120,0)');
      g.addColorStop(0.45, `rgba(255,70,130,${a * 0.35})`);
      g.addColorStop(0.82, `rgba(60,255,150,${a})`);
      g.addColorStop(1, 'rgba(60,255,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - W / 94, top, W / 47 + 1, bottom - top);
    }
    ctx.globalCompositeOperation = 'source-over';
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
    const barkC = mixRgb(BARK_DAY, BARK_NIGHT, night), bark = rgba(barkC);
    const k = WK * S;
    // branches, regroupées par épaisseur pour tracer vite
    const buckets = new Map();
    for (const n of nodes) {
      if (!n.parent || n.g <= 0) continue;
      const w = Math.max(0.6, branchPx(n, k));
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
    // le relief de l'écorce : un fil de lumière sur le flanc des grosses branches, des sillons sur le tronc
    ctx.strokeStyle = rgba(mixRgb(barkC, [150, 120, 120], 0.3 - night * 0.15), 0.55);
    for (const [w, list] of buckets) {
      if (w < 5) continue;
      ctx.lineWidth = w * 0.22;
      ctx.beginPath();
      for (const n of list) {
        const dx = n.x1 - n.x0, dy = n.y1 - n.y0, l = Math.hypot(dx, dy) || 1, ox = (-dy / l) * w * 0.26, oy = (dx / l) * w * 0.26;
        ctx.moveTo(n.x0 - ox, n.y0 - oy); ctx.lineTo(n.x1 - ox, n.y1 - oy);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(mixRgb(barkC, [0, 0, 0], 0.45), 0.5);
    ctx.lineWidth = 1;
    for (const [w, list] of buckets) {
      if (w < 14) continue;
      ctx.beginPath();
      for (const n of list) {
        const dx = n.x1 - n.x0, dy = n.y1 - n.y0, l = Math.hypot(dx, dy) || 1;
        for (const f of [-0.18, 0.08, 0.3]) { const ox = (-dy / l) * w * f, oy = (dx / l) * w * f; ctx.moveTo(n.x0 + ox, n.y0 + oy); ctx.lineTo(n.x1 + ox, n.y1 + oy); }
      }
      ctx.stroke();
    }
    // les brindilles fractales au bout des rameaux
    const front0 = growT * VEL;
    const sprEnds = [];
    ctx.strokeStyle = rgba(mixRgb(barkC, [60, 50, 60], 0.3), 0.9);
    ctx.lineWidth = Math.max(0.6, k * 0.32);
    ctx.beginPath();
    const ex = new Float32Array(6), ey = new Float32Array(6), ea = new Float32Array(6);
    for (const n of nodes) {
      if (!n.spr || n.g < 1) continue;
      const gk = growT >= 900 ? 1 : clamp((front0 - n.dist) / 0.3, 0, 1);
      if (gk <= 0) continue;
      const spr = n.spr;
      for (let j = 0; j < 6; j++) {
        const p = spr[j * 3], sx = p < 0 ? n.x1 : ex[p], sy = p < 0 ? n.y1 : ey[p];
        const a = (p < 0 ? n.abs : ea[p]) + spr[j * 3 + 1], L = spr[j * 3 + 2] * S * gk;
        ex[j] = sx + Math.sin(a) * L; ey[j] = sy - Math.cos(a) * L; ea[j] = a;
        ctx.moveTo(sx, sy); ctx.lineTo(ex[j], ey[j]);
        if (j >= 2) sprEnds.push(ex[j], ey[j], a, n.i + j);
      }
    }
    ctx.stroke();
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
    // feuillage : trois formes de feuilles, trois tons, et la couleur de la saison qui passe dessus, doucement
    const front = growT * VEL;
    const sea = seasonNow();
    const tones = [0, 1, 2].map(i => mixRgb(mixRgb(LEAF_DAY[i], LEAF_NIGHT[i], night), sea.tint, 0.3 * (1 - night * 0.5)));
    // les feuilles se peignent sur leur propre calque, une image sur deux : l'œil n'y voit rien, la machine respire
    const dpr = engine.dpr || 1, lw = Math.round(W * dpr), lh = Math.round(H * dpr);
    if (!leafLayer || leafLayer.width !== lw || leafLayer.height !== lh) { leafLayer = makeCanvas(lw, lh); leafCtx = leafLayer.getContext('2d'); leafFresh = false; }
    const repaint = !leafFresh || engine.frame % 2 === 0 || growT < 900;
    const lc = leafCtx;
    if (repaint) { lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, lw, lh); lc.setTransform(dpr, 0, 0, dpr, 0, 0); leafFresh = true; }
    const leafAt = (x, y, r, a, kind) => {
      if (kind === 0) { lc.moveTo(x + r, y); lc.arc(x, y, r, 0, TAU); }
      else if (kind === 1) { lc.moveTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5); lc.ellipse(x, y, r * 1.5, r * 0.62, a, 0, TAU); }
      else { const c = Math.cos(a) * r * 1.3, s2 = Math.sin(a) * r * 1.3; lc.moveTo(x + c, y + s2); lc.lineTo(x - s2 * 0.6, y + c * 0.6); lc.lineTo(x - c, y - s2); lc.lineTo(x + s2 * 0.6, y - c * 0.6); lc.closePath(); }
    };
    for (let tone = 0; repaint && tone < 3; tone++) {
      lc.fillStyle = rgba(tones[tone], 0.8);
      lc.beginPath();
      for (const n of twigs) {
        const la = growT >= 900 ? 1 : clamp((front - n.dist - 0.1) / 0.5, 0, 1);
        if (la <= 0) continue;
        for (const l of n.leaves) {
          if (l.tone !== tone) continue;
          const a = l.a + n.abs;
          leafAt(n.x1 + Math.cos(a) * l.d * S, n.y1 + Math.sin(a) * l.d * S, l.r * S * la, a, l.kind);
        }
      }
      for (let i = tone * 12; i < sprEnds.length; i += 36) leafAt(sprEnds[i], sprEnds[i + 1], 0.01 * S, sprEnds[i + 2] - Math.PI / 2, (sprEnds[i + 3] | 0) % 3);
      lc.fill();
    }
    // au printemps, des fleurs pâles s'ouvrent dans la couronne ; en hiver, du givre scintille
    if (repaint && sea.w[0] > 0.02 && growT >= 900) {
      lc.fillStyle = `rgba(255,214,232,${0.85 * sea.w[0]})`;
      lc.beginPath();
      const r = clamp(S * 0.008, 1.2, 3);
      for (let i = 0; i < twigs.length; i += 5) {
        const n = twigs[i];
        lc.moveTo(n.x1 + r * 2, n.y1); lc.arc(n.x1, n.y1, r * 2, 0, TAU);
      }
      lc.fill();
    }
    ctx.drawImage(leafLayer, 0, 0, W, H);
    if (sea.w[3] > 0.02 && growT >= 900) {
      ctx.globalCompositeOperation = 'lighter';
      const fr = glow([220, 235, 255], 8);
      for (let i = 0; i < twigs.length; i += 9) {
        const n = twigs[i], tw = Math.pow(Math.max(0, Math.sin(t * 1.3 + n.i * 1.7)), 6);
        drawGlow(ctx, fr, n.x1, n.y1, 3 + tw * 3, sea.w[3] * (0.25 + tw * 0.7));
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (night > 0.1) {
      // la nuit, la couronne respire une lumière douce
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < twigs.length; i += 11) {
        const n = twigs[i];
        if (growT < 900 && front < n.dist) continue;
        drawGlow(ctx, glow(LEAF_NIGHT[i % 3], 24), n.x1, n.y1, S * 0.12, 0.14 * night);
        if (i % 44 === 0) drawGlow(ctx, glow(LEAF_NIGHT[(i >> 2) % 3], 64), n.x1, n.y1, S * 0.45, 0.05 * night);
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
      const rc = realmColor(s.realm);
      drawFlower(ctx, n.x1, n.y1, clamp(S * 0.045, 4, 8) * k2 * la, t * 0.3 + i, night, i % 3, rc);
    });
    for (const f of fruits) drawFruit(ctx, f, t, night);
  }

  // une fleur par secret : rose à cinq lobes, clochette ou étoile, teintée par le monde où le secret a été trouvé
  const realmColor = id => { const r = api.realms.find(m => m.id === id); return r ? hexToRgb(r.color) : [255, 236, 200]; };
  function drawFlower(ctx, x, y, r, rot, night, kind = 0, rc = [255, 220, 235]) {
    if (r <= 0.3) return;
    const petal = mixRgb([255, 240, 246], rc, 0.38);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow(rc.map(Math.round), 24), x, y, r * 3.4, 0.3 + 0.4 * night);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(petal, 0.95);
    ctx.beginPath();
    if (kind === 1) {
      // la clochette, qui pend sous son rameau
      const by = y + r * 0.3;
      ctx.moveTo(x - r * 0.75, by + r * 1.05); ctx.quadraticCurveTo(x - r * 0.8, by - r * 0.3, x, by - r * 0.35); ctx.quadraticCurveTo(x + r * 0.8, by - r * 0.3, x + r * 0.75, by + r * 1.05);
      ctx.quadraticCurveTo(x, by + r * 0.75, x - r * 0.75, by + r * 1.05);
      ctx.fill();
      return;
    }
    if (kind === 2) {
      for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; ctx.moveTo(x, y); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.6, r * 0.16, a, 0, TAU); }
      ctx.fill();
    } else {
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * TAU;
        const rr = r * (0.35 + 0.65 * Math.abs(Math.cos(2.5 * a)));
        const px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.fill();
    }
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
      // les fruits du sommet portent leur nom au-dessus ; sur un petit écran, ceux de l'anneau intérieur le portent dessous, pour ne pas se marcher dessus
      const above = Math.abs(f.u) < 0.75 && !(small && f.ring === 1);
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
      let bend = b.lean + Math.sin(t * 1.6 + b.ph + b.x * 0.01) * 0.12 + sway.fast * 6;
      if (hand.k > 0.01) {
        const d = (b.x - hand.x) / 70;
        if (Math.abs(d) < 2.5) bend += d * Math.exp(-d * d * 2) * 1.5 * hand.k;
      }
      ctx.moveTo(b.x, groundY + 8);
      ctx.quadraticCurveTo(b.x + Math.sin(bend) * b.h * 0.3, groundY - b.h * 0.4, b.x + Math.sin(bend) * b.h, groundY + 6 - Math.cos(bend) * b.h);
    }
    ctx.stroke();
  }

  // Pousses plantées au pied de l'arbre. Elles se souviennent de leur jour de naissance :
  // d'abord une tige et deux feuilles, puis d'autres feuilles, puis une fleur qui s'ouvre et luit la nuit.
  function drawSprouts(ctx, t, night) {
    const now = Date.now();
    for (const sp of sprouts) {
      const k = easeOutBack(clamp(sp.age / 2.6, 0, 1));
      const m = clamp((now - sp.born) / BLOOM_MS, 0, 1), bloom = smoothstep(0.3, 1, m);
      const h = sp.h * k * (1 + 0.45 * m);
      const sw = Math.sin(t * 1.3 + sp.ph) * 0.08 + sway.fast * 3;
      const tipX = sp.x + Math.sin(sp.lean + sw) * h, tipY = groundY - Math.cos(sp.lean + sw) * h;
      const cx = sp.x + sp.curl * h * 0.4, cy = groundY - h * 0.5;
      ctx.strokeStyle = rgba(mixRgb([60, 120, 80], [70, 190, 150], night), 0.95);
      ctx.lineWidth = 1.6 + m * 0.6;
      ctx.beginPath();
      ctx.moveTo(sp.x, groundY + 4);
      ctx.quadraticCurveTo(cx, cy, tipX, tipY);
      ctx.stroke();
      ctx.fillStyle = rgba(mixRgb([70, 150, 90], [80, 220, 170], night), 0.9);
      const pairs = 1 + Math.min(2, Math.floor(m * 3));
      for (let j = 0; j < pairs; j++) {
        const f = [0.55, 0.3, 0.75][j], u = 1 - f;
        const lx = u * u * sp.x + 2 * u * f * cx + f * f * tipX, ly = u * u * (groundY + 4) + 2 * u * f * cy + f * f * tipY;
        for (const side of [-1, 1]) {
          const la = -Math.PI / 2 + side * (0.9 + j * 0.15) + sw;
          const L = 9 * k * (1 + 0.3 * m) * (j ? 0.8 : 1);
          ctx.beginPath();
          ctx.ellipse(lx + Math.cos(la) * L * 0.5, ly + Math.sin(la) * L * 0.5, L * 0.55, L * 0.22, la, 0, TAU);
          ctx.fill();
        }
      }
      if (bloom > 0.02) {
        // la fleur : des pétales qui s'écartent du bourgeon, et tournent un peu avec le vent
        const n = sp.petals, pr = (3 + 6 * bloom) * k;
        ctx.fillStyle = rgba(mixRgb(sp.c, [255, 255, 255], 0.25), 0.55 + 0.35 * bloom);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + sp.ph + sw * 2;
          ctx.beginPath();
          ctx.ellipse(tipX + Math.cos(a) * pr * 0.75, tipY + Math.sin(a) * pr * 0.75, pr * 0.62, pr * 0.3, a, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow(sp.c, 16), tipX, tipY, 6 + 4 * k + bloom * 6, 0.6 + 0.3 * night + bloom * 0.25 * night);
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
    for (const s of spirits) {
      if (s.delay > 0 || s.alpha < 0.3) continue;
      if (Math.hypot(p.x - s.x, p.y - (s.y - s.size * 0.6)) < s.size * 0.9 + 8) {
        s.look = Math.sign(p.x - s.x) || s.look;
        nod(s, 2);
        s.bob += 1.2;
        spiritTapped.add(s.id);
        if (spiritTapped.size >= 3) secrets.find('esprits');
        return;
      }
    }
    const f = fruitAt(p.x, p.y);
    if (f) {
      if (f.realm.ready) {
        audio.note(f.idx + 2, { type: 'bell', vel: 0.22, dur: 2.6, send: 0.5 });
        burst(f.x, f.y, f.color, 18, 160);
        api.go(f.realm.id, { x: f.x, y: f.y });
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
      api.go('racines', { x: rootX, y: groundY + 16 });
      return;
    }
    // le tronc : un cœur qui bat
    for (const n of nodes) {
      if (!n.parent || n.w < tree.wMax * 0.5) continue;
      if (segDist(p.x, p.y, n.x0, n.y0, n.x1, n.y1) < branchPx(n, WK * S) * 0.5 + 14) {
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
    // les racines : trois coups, et la sève court sous la terre vers toutes les pousses
    const B = rootBase();
    if (Math.abs(p.x - rootX) < B * 1.7 && p.y > groundY - B * 0.35 && p.y < groundY + 46) {
      rootTaps = rootTaps.filter(x => t - x < 4);
      rootTaps.push(t);
      audio.note(-4 + rootTaps.length, { type: 'pluck', vel: 0.18, dur: 1.6, oct: -1 });
      if (rootTaps.length >= 3) {
        rootTaps = [];
        network = { t };
        [0, 2, 4, 7].forEach((d, i) => audio.note(d, { type: 'glass', vel: 0.07, at: 0.4 + i * 0.25, dur: 2.4, send: 0.6 }));
        secrets.find('mycorhize');
      }
      return;
    }
    // le sol : planter une pousse
    if (p.y > groundY - 14) {
      const ci = planted % SPROUT_COLS.length;
      sprouts.push({ u: p.x / W, x: p.x, h: 26 + Math.random() * 30, lean: (Math.random() - 0.5) * 0.5, curl: (Math.random() - 0.5) * 0.6, ph: Math.random() * TAU, age: 0, ci, c: SPROUT_COLS[ci], born: Date.now(), petals: 5 + Math.floor(Math.random() * 3) });
      if (sprouts.length > 28) sprouts.shift();
      planted++;
      saveGarden(sprouts);
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
