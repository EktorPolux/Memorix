// Sève — L'Envol : tu t'endors, et tu voles. Le monde n'existe que dans une carte de hauteurs (rendu « Voxel Space »,
// Comanche, 1992), mais il rêve : ses couleurs glissent d'une palette à l'autre, des îles flottent avec leurs cascades,
// des baleines nagent dans le ciel, des lanternes montent vers toi, une planète à anneaux se lève, et tout en haut,
// le ciel devient le miroir de la terre.
import { TAU, clamp, lerp, smoothstep, angleDiff, glow, drawGlow, rgba, mixRgb, makeCanvas, rng, hslToRgb } from '../engine.js';

export const mood = {
  root: 146.83, scale: 'lydian', wave: 'sine', chord: [0, 7, 11, 16], pad: 0.045, cutoff: 1500, lfo: 0.03,
  noise: { type: 'bandpass', freq: 520, q: 0.5, gain: 0.014, gust: 0.7, gustRate: 0.08 },
  motif: { every: [2.5, 5.5], type: 'glass', vel: 0.028, oct: 1 }, // une boîte à musique, de loin en loin
};

const MAP = 512, MASK = 511;
const WATER = 0.34;
const HS = 92; // hauteur des terres, dans l'unité de la carte
const DAY = 180;
let world = null; // la carte survit aux allers-retours

// Bruit de Perlin périodique : la carte se raccorde à elle-même, le monde est un tore
function periodicNoise(seed) {
  const R = rng(seed);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = R() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  return (x, y, period) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const X0 = ((x0 % period) + period) % period, Y0 = ((y0 % period) + period) % period;
    const X1 = (X0 + 1) % period, Y1 = (Y0 + 1) % period;
    const h00 = perm[perm[X0 & 255] + (Y0 & 255)], h10 = perm[perm[X1 & 255] + (Y0 & 255)];
    const h01 = perm[perm[X0 & 255] + (Y1 & 255)], h11 = perm[perm[X1 & 255] + (Y1 & 255)];
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const d00 = gx[h00] * fx + gy[h00] * fy, d10 = gx[h10] * (fx - 1) + gy[h10] * fy;
    const d01 = gx[h01] * fx + gy[h01] * (fy - 1), d11 = gx[h11] * (fx - 1) + gy[h11] * (fy - 1);
    const a = d00 + (d10 - d00) * u, b = d01 + (d11 - d01) * u;
    return (a + (b - a) * v) * 1.45;
  };
}

// Deux palettes de rêve : l'aube rose, et l'or turquoise. Le monde glisse lentement de l'une à l'autre.
const PAL = {
  A: { deep: [118, 148, 222], shallow: [174, 214, 238], sand: [255, 224, 214], meadow0: [176, 226, 190], meadow1: [216, 240, 206], forest: [146, 200, 198], rock0: [196, 166, 216], rock1: [226, 202, 238], snow: [255, 238, 248] },
  B: { deep: [90, 186, 212], shallow: [152, 232, 226], sand: [255, 236, 184], meadow0: [238, 206, 142], meadow1: [252, 228, 172], forest: [226, 160, 180], rock0: [160, 178, 232], rock1: [198, 212, 246], snow: [255, 250, 228] },
};
const FLOWERS = [[255, 168, 204], [255, 238, 140], [204, 172, 255], [255, 255, 255], [255, 196, 150]];
const pack = c => (Math.min(255, c[2] | 0) << 16) | (Math.min(255, c[1] | 0) << 8) | Math.min(255, c[0] | 0);

function buildWorld(seed) {
  const n = periodicNoise(seed);
  const R = rng(seed + 1);
  const hgt = new Float32Array(MAP * MAP);
  let lo = 1e9, hi = -1e9;
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const u = x / MAP, v = y / MAP;
    let cont = 0, amp = 1, sum = 0;
    for (let o = 0; o < 4; o++) { const c = 3 << o; cont += n(u * c, v * c, c) * amp; sum += amp; amp *= 0.5; }
    cont /= sum;
    // crêtes : du bruit plié, chaque octave modulée par la précédente
    let ridge = 0, prev = 1;
    amp = 0.5;
    for (let o = 0; o < 6; o++) { const c = 6 << o; let r = 1 - Math.abs(n(u * c + 17, v * c + 31, c)); r *= r; r *= prev; prev = r; ridge += r * amp; amp *= 0.5; }
    const h = 0.38 + cont * 0.42 + ridge * 0.6 * smoothstep(-0.25, 0.35, cont);
    hgt[y * MAP + x] = h;
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  for (let i = 0; i < hgt.length; i++) hgt[i] = (hgt[i] - lo) / (hi - lo);
  const colA = new Uint32Array(MAP * MAP), colB = new Uint32Array(MAP * MAP), H = new Float32Array(MAP * MAP), water = new Uint8Array(MAP * MAP), glows = new Uint8Array(MAP * MAP);
  const at = (x, y) => hgt[((y & MASK) << 9) | (x & MASK)];
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = y * MAP + x, h = hgt[i];
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
    const slope = Math.hypot(dx, dy) * 60;
    const shade = clamp(0.82 + (-dx * 0.7 - dy * 0.7) * 24, 0.5, 1.28);
    const j = 1 + (R() - 0.5) * 0.06;
    const flower = h > WATER + 0.03 && h < 0.52 && slope < 1.4 && R() < 0.07 ? FLOWERS[(R() * FLOWERS.length) | 0] : null;
    for (const [P, out] of [[PAL.A, colA], [PAL.B, colB]]) {
      let c;
      if (h < WATER) { const d = (WATER - h) / WATER; c = mixRgb(P.shallow, P.deep, Math.min(1, d * 1.6)); }
      else if (flower) c = flower;
      else if (h < WATER + 0.025) c = P.sand;
      else if (h > 0.8 && slope < 2.6) c = P.snow;
      else if (slope > 2.1 || h > 0.66) c = mixRgb(P.rock0, P.rock1, clamp((h - 0.5) * 2, 0, 1));
      else if (h > 0.5) c = P.forest;
      else c = mixRgb(P.meadow0, P.meadow1, clamp((h - WATER) * 4, 0, 1));
      const k = (h < WATER ? 1 : shade) * j;
      out[i] = pack([c[0] * k, c[1] * k, c[2] * k]);
    }
    H[i] = (h < WATER ? WATER : h) * HS; // la surface de l'eau est plate
    water[i] = h < WATER ? 1 : 0;
  }
  // des prairies qui luisent la nuit, comme des villages de lucioles
  for (let v = 0; v < 60; v++) {
    for (let tries = 0; tries < 60; tries++) {
      const x = (R() * MAP) | 0, y = (R() * MAP) | 0, h = hgt[y * MAP + x];
      if (h < WATER + 0.04 || h > 0.55) continue;
      for (let k = 0; k < 6; k++) glows[(((y + ((R() * 6) | 0)) & MASK) << 9) | ((x + ((R() * 6) | 0)) & MASK)] = 1 + ((R() * 4) | 0);
      break;
    }
  }
  // le phare : l'Arbre-Monde, sur un plateau
  let bx = 120, by = 380, best = 1e9;
  for (let tries = 0; tries < 4000; tries++) {
    const x = (R() * MAP) | 0, y = (R() * MAP) | 0, h = hgt[y * MAP + x];
    const score = Math.abs(h - 0.5) + Math.hypot(x - 120, y - 380) / 900;
    if (h > WATER + 0.05 && score < best) { best = score; bx = x; by = y; }
  }
  // les îles qui flottent, et les deux baleines du ciel
  const islands = Array.from({ length: 8 }, (_, k) => ({ x: R() * MAP, y: R() * MAP, h: 150 + R() * 42, r: 13 + R() * 9, kind: k % 4, ph: R() * TAU }));
  const whales = Array.from({ length: 2 }, (_, k) => ({ cx: R() * MAP, cy: R() * MAP, rad: 70 + R() * 60, w: (0.035 + R() * 0.02) * (k ? -1 : 1), a: R() * TAU, h: 128 + R() * 30, len: 30 + R() * 10 }));
  return { colA, colB, H, water, glows, beacon: { x: bx, y: by, h: H[by * MAP + bx] }, islands, whales };
}

// Une île flottante, peinte une fois : un pré, une pointe de roche, des racines qui pendent, une cascade, et sur le dessus
// un arbre, une maison, un moulin ou deux arbres.
function makeIsland(kind, seed) {
  const R = rng(seed), c = makeCanvas(240, 260), g = c.getContext('2d');
  const tipX = 112 + R() * 20;
  const rock = g.createLinearGradient(0, 80, 0, 236);
  rock.addColorStop(0, '#c8a8d8'); rock.addColorStop(0.6, '#8f7aa8'); rock.addColorStop(1, '#5c4f78');
  g.fillStyle = rock;
  g.beginPath(); g.moveTo(36, 82);
  g.bezierCurveTo(52, 140, 92, 188, tipX, 236);
  g.bezierCurveTo(148, 190, 190, 140, 204, 82);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(70,55,95,0.35)'; g.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) { const x = 60 + k * 24; g.beginPath(); g.moveTo(x, 90); g.quadraticCurveTo(x + 8, 140, tipX + (x - 120) * 0.2, 200 - Math.abs(x - 120) * 0.4); g.stroke(); }
  g.strokeStyle = 'rgba(120,170,120,0.7)'; g.lineWidth = 1.2;
  for (let k = 0; k < 7; k++) { const x = 50 + R() * 140; g.beginPath(); g.moveTo(x, 96); g.quadraticCurveTo(x + (R() - 0.5) * 20, 130, x + (R() - 0.5) * 10, 150 + R() * 40); g.stroke(); }
  // la cascade, qui tombe dans le vide
  const wf = g.createLinearGradient(0, 84, 0, 258);
  wf.addColorStop(0, 'rgba(230,245,255,0.9)'); wf.addColorStop(1, 'rgba(230,245,255,0)');
  g.fillStyle = wf;
  g.fillRect(170, 84, 9, 176);
  const top = g.createLinearGradient(0, 62, 0, 100);
  top.addColorStop(0, '#d6f2c8'); top.addColorStop(1, '#9fcfaa');
  g.fillStyle = top;
  g.beginPath(); g.ellipse(120, 82, 86, 22, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath(); g.ellipse(108, 76, 60, 9, 0, 0, TAU); g.fill();
  const tree = (x, s, col) => {
    g.strokeStyle = '#7a5a68'; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(x, 80); g.lineTo(x, 80 - 34 * s); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x, 80 - 46 * s, 22 * s, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(x - 7 * s, 80 - 52 * s, 9 * s, 0, TAU); g.fill();
  };
  if (kind === 0) tree(118, 1.15, '#ffb3d1');
  else if (kind === 1) {
    g.fillStyle = '#fff3e0'; g.fillRect(96, 50, 40, 30);
    g.fillStyle = '#ff9f9f'; g.beginPath(); g.moveTo(90, 52); g.lineTo(116, 30); g.lineTo(142, 52); g.fill();
    g.fillStyle = '#ffd88a'; g.fillRect(110, 60, 10, 12);
    tree(160, 0.7, '#b9e4ff');
  } else if (kind === 2) {
    g.fillStyle = '#fff6ea'; g.beginPath(); g.moveTo(108, 80); g.lineTo(114, 30); g.lineTo(126, 30); g.lineTo(132, 80); g.fill();
    g.strokeStyle = '#ffb38a'; g.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; g.beginPath(); g.moveTo(120, 32); g.lineTo(120 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); g.stroke(); }
  } else { tree(96, 0.9, '#c7b3ff'); tree(146, 1, '#ffe08a'); }
  return c;
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const q = engine.quality;
  if (!world || world.seed !== secrets.seed) { world = buildWorld(secrets.seed); world.seed = secrets.seed; world.sprites = world.islands.map((isl, k) => makeIsland(isl.kind, secrets.seed + k * 7)); }
  const { colA, colB, H: HM, water, glows, beacon, islands, whales, sprites } = world;
  let W = api.W, H = api.H, RW = 320, RH = 200, off = null, octx = null, img = null, b32 = null, ybuf = null;
  const cam = { x: 260, y: 300, a: 0.6, h: 120, turn: 0, speed: 46, sx: 0, sy: 0, travel: 0 };
  cam.sx = cam.x; cam.sy = cam.y;
  let clock = 0.3 * DAY, pitch = 0, lowT = 0, lastLabel = 0, dreamT = 0, mirrorK = 0, mirrorT = 0, userLanterns = 0, whaleSang = 0, mirrorFade = false;
  // le rêve reprend où tu t'étais réveillé : même cap, même altitude, même heure du jour
  const flight = api.memory?.get('envol');
  if (flight && [flight.x, flight.y, flight.a, flight.h].every(Number.isFinite)) {
    cam.x = cam.sx = flight.x; cam.y = cam.sy = flight.y; cam.a = flight.a; cam.h = clamp(flight.h, 30, 200);
    if (Number.isFinite(flight.clock)) clock = flight.clock;
  }
  const SIN = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * TAU);
  const cranes = Array.from({ length: 9 }, (_, i) => ({ ox: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 24, oy: Math.ceil(i / 2) * 11, ph: Math.random() * TAU, c: [[255, 214, 230], [214, 246, 230], [255, 244, 214], [224, 214, 255]][i % 4] }));
  const stars = Array.from({ length: 260 }, () => ({ az: Math.random() * TAU, el: Math.random() * 0.95, b: Math.random(), tw: 0.5 + Math.random() * 3 }));
  const clouds = Array.from({ length: 14 }, (_, i) => ({ az: Math.random() * TAU, el: 0.04 + Math.random() * 0.3, s: 0.6 + Math.random(), drift: (Math.random() - 0.5) * 0.004, tint: i % 3 }));
  const cloudImgs = [[255, 220, 230], [255, 240, 210], [230, 225, 255]].map(tc => {
    const c = makeCanvas(128, 64), g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 20 + Math.random() * 88, y = 22 + Math.random() * 20, r = 14 + Math.random() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(tc, 0.6)); gr.addColorStop(1, rgba(tc, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    }
    return c;
  });
  const lanterns = [], seeds = [], bubbles = [], falling = [];

  function resize(w, h) {
    W = w; H = h;
    RW = Math.round(clamp(W / 3.2, 150, 380) * (q < 0.8 ? 0.85 : 1));
    RH = Math.round(RW * (H / W));
    off = makeCanvas(RW, RH); octx = off.getContext('2d');
    img = octx.createImageData(RW, RH); b32 = new Uint32Array(img.data.buffer);
    ybuf = new Int32Array(RW);
    if (!bubbles.length) for (let i = 0; i < 8; i++) bubbles.push({ x: Math.random() * W, y: Math.random() * H, r: 10 + Math.random() * 22, vy: 8 + Math.random() * 14, ph: Math.random() * TAU });
  }
  resize(W, H);

  const groundAt = (x, y) => HM[(((y | 0) & MASK) << 9) | ((x | 0) & MASK)];
  // le rêve n'a pas de nuit noire : la nuit y est lavande, et l'heure glisse entre deux ciels
  function skyState() {
    const ph = (clock / DAY) % 1;
    const sun = Math.sin(ph * TAU - Math.PI / 2);
    const day = smoothstep(-0.3, 0.3, sun), dusk = Math.exp(-Math.pow(sun / 0.25, 2));
    const md = 0.5 + 0.5 * Math.sin(clock * 0.021);
    const top = mixRgb(mixRgb(mixRgb([44, 30, 96], [22, 44, 92], md), mixRgb([122, 172, 236], [152, 124, 222], md), day), [250, 160, 158], dusk * 0.4);
    const fog = mixRgb(mixRgb(mixRgb([128, 96, 176], [76, 108, 168], md), mixRgb([255, 216, 222], [202, 240, 230], md), day), [255, 184, 146], dusk * 0.5);
    const tint = mixRgb([0.6, 0.56, 0.82], [1, 1, 1], day);
    return { ph, sun, day, dusk, top, fog, tint, md };
  }

  // ——— Le rendu : de près vers le loin, colonne par colonne, avec un tampon des hauteurs déjà dessinées
  function render(st) {
    b32.fill(0);
    ybuf.fill(RH);
    const sinA = Math.sin(cam.a), cosA = Math.cos(cam.a);
    const horizon = RH * 0.42 + pitch;
    const scale = RH * 0.92;
    const DIST = q < 0.8 ? 520 : 700;
    const [fr, fg, fb] = st.fog, [tr, tg, tb] = st.tint;
    const night = 1 - st.day, m = 0.5 + 0.5 * Math.sin(clock * 0.045), im = 1 - m;
    const shimmer = (clock * 60) | 0;
    let z = 1, dz = 0.55;
    while (z < DIST) {
      let plx = -cosA * z - sinA * z + cam.x, ply = sinA * z - cosA * z + cam.y;
      const prx = cosA * z - sinA * z + cam.x, pry = -sinA * z - cosA * z + cam.y;
      const dx = (prx - plx) / RW, dy = (pry - ply) / RW;
      const inv = scale / z;
      const fog = Math.min(1, Math.max(0, (z - DIST * 0.22) / (DIST * 0.78)) ** 1.2);
      for (let i = 0; i < RW; i++) {
        const mi = ((ply | 0) & MASK) << 9 | ((plx | 0) & MASK);
        const sy = ((cam.h - HM[mi]) * inv + horizon) | 0;
        const yb = ybuf[i];
        if (sy < yb) {
          const ca = colA[mi], cb = colB[mi];
          let r = ((ca & 255) * im + (cb & 255) * m) * tr, g = (((ca >> 8) & 255) * im + ((cb >> 8) & 255) * m) * tg, b = (((ca >> 16) & 255) * im + ((cb >> 16) & 255) * m) * tb;
          if (water[mi]) { const sh = SIN[((plx * 7 + ply * 5) | 0) + shimmer & 1023] * 16 + SIN[((plx * 3 - ply * 9) | 0) - shimmer & 1023] * 10; r += sh; g += sh; b += sh * 0.8; } // l'eau nacrée qui miroite
          if (night > 0.3 && glows[mi]) { const gk = night; const c = glows[mi]; r += (c === 1 ? 140 : c === 2 ? 60 : 120) * gk; g += (c === 1 ? 110 : c === 2 ? 140 : 70) * gk; b += (c === 1 ? 60 : c === 2 ? 160 : 170) * gk; }
          r += (fr - r) * fog; g += (fg - g) * fog; b += (fb - b) * fog;
          const px = (255 << 24) | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
          for (let y = sy < 0 ? 0 : sy; y < yb; y++) b32[y * RW + i] = px;
          ybuf[i] = sy < 0 ? 0 : sy;
        }
        plx += dx; ply += dy;
      }
      z += dz;
      dz *= 1.011;
    }
    octx.putImageData(img, 0, 0);
    return horizon;
  }

  // Projeter un point du monde sur l'écran (repère de la caméra : devant = (−sin a, −cos a))
  function project(wx, wy, wh, horizon) {
    let dx = wx - cam.x, dy = wy - cam.y;
    // le monde est un tore : on prend le chemin le plus court
    dx -= Math.round(dx / MAP) * MAP; dy -= Math.round(dy / MAP) * MAP;
    const fz = -Math.sin(cam.a) * dx - Math.cos(cam.a) * dy, fx = Math.cos(cam.a) * dx - Math.sin(cam.a) * dy;
    if (fz < 2) return null;
    return { x: (RW / 2 + (fx / fz) * (RW / 2)) * (W / RW), y: ((cam.h - wh) * (RH * 0.92) / fz + horizon) * (H / RH), z: fz, d: Math.hypot(dx, dy), k: ((RH * 0.92) / fz) * (H / RH) };
  }
  // l'inverse : un point de l'écran, à une profondeur donnée, devient un point du monde
  function unproject(sx, sy, fz, horizon) {
    const fx = ((sx * (RW / W) - RW / 2) / (RW / 2)) * fz;
    const wh = cam.h - ((sy * (RH / H) - horizon) * fz) / (RH * 0.92);
    const fwx = -Math.sin(cam.a), fwy = -Math.cos(cam.a), rx = Math.cos(cam.a), ry = -Math.sin(cam.a);
    return { x: cam.x + fwx * fz + rx * fx, y: cam.y + fwy * fz + ry * fx, h: wh };
  }

  function spawnLantern(near, x, y, h) {
    const a = cam.a + (Math.random() - 0.5) * 1.6, d = near ? 20 + Math.random() * 60 : 60 + Math.random() * 260;
    const lx = x ?? cam.x - Math.sin(a) * d, ly = y ?? cam.y - Math.cos(a) * d;
    lanterns.push({ x: lx, y: ly, h: h ?? groundAt(lx, ly) + 2, vh: 3 + Math.random() * 4, ph: Math.random() * TAU, hue: Math.random() });
  }
  for (let i = 0; i < Math.round(60 * q); i++) { spawnLantern(false); lanterns[i].h += Math.random() * 120; }
  for (let i = 0; i < 14; i++) { const a = Math.random() * TAU, d = 30 + Math.random() * 160; seeds.push({ x: cam.x + Math.cos(a) * d, y: cam.y + Math.sin(a) * d, h: cam.h + (Math.random() - 0.5) * 50, ph: Math.random() * TAU, rot: Math.random() * TAU }); }

  function update(dt, t) {
    clock += dt;
    dreamT += dt;
    // le pilotage : la main tire vers la gauche ou la droite, plus haut ou plus bas
    let turnIn = 0, climb = 0;
    const ground0 = groundAt(cam.x, cam.y);
    if (input.inside || input.down) { turnIn = clamp((input.x - W / 2) / (W * 0.4), -1, 1); climb = clamp((H * 0.5 - input.y) / (H * 0.4), -1, 1); }
    else { turnIn = Math.sin(t * 0.07) * 0.35; climb = clamp((ground0 + 46 - cam.h) / 30, -0.5, 0.5) + Math.sin(t * 0.05) * 0.15; } // le rêveur garde son altitude de croisière
    if (keys.left) turnIn = -1; if (keys.right) turnIn = 1; if (keys.up) climb = 1; if (keys.down) climb = -1;
    cam.turn += (turnIn - cam.turn) * Math.min(1, dt * 2.5);
    cam.a -= cam.turn * 0.9 * dt;
    const want = input.down && longHold ? 95 : 46;
    cam.speed += (want - cam.speed) * Math.min(1, dt * 1.5);
    const vx = -Math.sin(cam.a) * cam.speed * dt, vy = -Math.cos(cam.a) * cam.speed * dt;
    cam.x += vx; cam.y += vy; cam.travel += Math.hypot(vx, vy);
    const ground = Math.max(groundAt(cam.x, cam.y), groundAt(cam.x - Math.sin(cam.a) * 30, cam.y - Math.cos(cam.a) * 30));
    const clear = ground <= WATER * HS + 0.01 ? 2.5 : 7; // au-dessus de l'eau, on peut la frôler
    cam.h = Math.min(210, cam.h + climb * 38 * dt); // monter, descendre : la main règle la vitesse verticale
    if (cam.h < ground + clear) cam.h += (ground + clear - cam.h) * Math.min(1, dt * 6); // on se cabre avant le relief
    // près du relief, le regard se relève : on frôle les crêtes sans jamais fixer le sol
    const near = clamp((cam.h - ground - clear) / 24, 0, 1);
    pitch += ((climb * RH * 0.12 * (climb < 0 ? near : 1)) - pitch) * Math.min(1, dt * 2);
    audio.setNoiseLevel(0.01 + cam.speed * 0.0003);

    // secrets d'avant : frôler l'eau, retrouver l'Arbre, faire le tour du tore
    const overWater = groundAt(cam.x, cam.y) <= WATER * HS + 0.01;
    lowT = overWater && cam.h - WATER * HS < 4.5 ? lowT + dt : 0;
    if (lowT > 2.5) secrets.find('rasemottes');
    let bdx = beacon.x - cam.x, bdy = beacon.y - cam.y;
    bdx -= Math.round(bdx / MAP) * MAP; bdy -= Math.round(bdy / MAP) * MAP;
    if (Math.hypot(bdx, bdy) < 26) secrets.find('phare');
    let sdx = cam.x - cam.sx, sdy = cam.y - cam.sy;
    sdx -= Math.round(sdx / MAP) * MAP; sdy -= Math.round(sdy / MAP) * MAP;
    if (cam.travel > 480 && Math.hypot(sdx, sdy) < 22) secrets.find('tore');
    // secrets du rêve : rêver longtemps, voir le ciel devenir miroir, nager près d'une baleine
    if (dreamT > 90) secrets.find('paradoxal');
    mirrorK += ((cam.h > 168 ? 1 : 0) - mirrorK) * Math.min(1, dt * 1.2);
    mirrorT = mirrorK > 0.9 ? mirrorT + dt : 0;
    if (mirrorT > 2) secrets.find('lucide');
    for (const w of whales) {
      w.a += w.w * dt;
      const wx = w.cx + Math.cos(w.a) * w.rad, wy = w.cy + Math.sin(w.a) * w.rad;
      let dx = wx - cam.x, dy = wy - cam.y;
      dx -= Math.round(dx / MAP) * MAP; dy -= Math.round(dy / MAP) * MAP;
      if (Math.hypot(dx, dy) < 50 && Math.abs(cam.h - w.h) < 50 && t - whaleSang > 9) {
        whaleSang = t;
        // le chant : de longues glissades graves, qui se répondent
        audio.sweep({ from: 180, to: 95, dur: 2.6, vel: 0.07, type: 'sine', send: 0.85 });
        audio.sweep({ from: 120, to: 240, dur: 2.2, vel: 0.05, type: 'triangle', send: 0.85, at: 2.4 });
        audio.sweep({ from: 300, to: 140, dur: 3, vel: 0.04, type: 'sine', send: 0.9, at: 4.4 });
        secrets.find('baleine');
      }
    }
    // les lanternes montent ; trop hautes ou trop loin, elles renaissent devant toi
    for (let i = lanterns.length - 1; i >= 0; i--) {
      const l = lanterns[i];
      l.h += l.vh * dt;
      l.x += Math.sin(t * 0.3 + l.ph) * 1.2 * dt;
      let dx = l.x - cam.x, dy = l.y - cam.y;
      dx -= Math.round(dx / MAP) * MAP; dy -= Math.round(dy / MAP) * MAP;
      if (l.h > 260 || Math.hypot(dx, dy) > 360) { lanterns.splice(i, 1); if (lanterns.length < 60 * q) spawnLantern(false); }
    }
    for (const s of seeds) {
      s.x += 4 * dt; s.y += Math.sin(t * 0.2 + s.ph) * 2 * dt; s.h += Math.sin(t * 0.4 + s.ph) * 3 * dt; s.rot += dt * 0.2;
      let dx = s.x - cam.x, dy = s.y - cam.y;
      dx -= Math.round(dx / MAP) * MAP; dy -= Math.round(dy / MAP) * MAP;
      if (Math.hypot(dx, dy) > 220) { const a = cam.a + (Math.random() - 0.5) * 1.4, d = 120 + Math.random() * 80; s.x = cam.x - Math.sin(a) * d; s.y = cam.y - Math.cos(a) * d; s.h = cam.h + (Math.random() - 0.5) * 50; }
    }
    for (const b of bubbles) { b.y -= b.vy * dt; b.x += (Math.sin(t * 0.6 + b.ph) * 10 + cam.turn * 60) * dt; if (b.y < -40 || b.x < -60 || b.x > W + 60) { b.y = H + 30; b.x = Math.random() * W; } }
    if (Math.random() < dt * 0.25 && falling.length < 3) falling.push({ x: Math.random() * W, y: Math.random() * H * 0.25, vx: 160 + Math.random() * 160, vy: 80 + Math.random() * 60, age: 0, hue: Math.random() * 360 });
    for (let i = falling.length - 1; i >= 0; i--) { const f = falling[i]; f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.age > 1.6) falling.splice(i, 1); }

    for (const c of clouds) c.az += c.drift * dt * 10;
    if (t - lastLabel > 0.5) {
      lastLabel = t;
      const cap = Math.round((((-cam.a * 180) / Math.PI) % 360 + 360) % 360);
      api.label(mirrorK > 0.6 ? 'le ciel est un miroir' : `cap ${cap}° · ${Math.round((cam.h - WATER * HS) * 14)} m`);
    }
  }

  // ——— Le ciel du rêve
  function drawPlanet(ctx, x, y, R) {
    // l'anneau de derrière, la planète, puis l'anneau de devant
    const ring = (front) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(-0.32); ctx.scale(1, 0.26);
      const g = ctx.createRadialGradient(0, 0, R * 1.25, 0, 0, R * 2.1);
      g.addColorStop(0, 'rgba(255,230,240,0)'); g.addColorStop(0.25, 'rgba(255,226,236,0.55)'); g.addColorStop(0.55, 'rgba(214,226,255,0.35)'); g.addColorStop(0.75, 'rgba(255,240,214,0.45)'); g.addColorStop(1, 'rgba(255,240,214,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R * 2.1, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.arc(0, 0, R * 1.25, front ? Math.PI : TAU, front ? 0 : Math.PI, true); ctx.fill();
      ctx.restore();
    };
    ring(false);
    const g = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
    g.addColorStop(0, '#ffe1ec'); g.addColorStop(0.3, '#ffc7d9'); g.addColorStop(0.45, '#f6d9ff'); g.addColorStop(0.6, '#d7c8ff'); g.addColorStop(0.8, '#ffdcc2'); g.addColorStop(1, '#f0b8c8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    const sh = ctx.createRadialGradient(x - R * 0.4, y - R * 0.4, R * 0.2, x, y, R);
    sh.addColorStop(0, 'rgba(255,255,255,0.25)'); sh.addColorStop(0.7, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(90,60,140,0.35)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ring(true);
  }
  function drawWhale(ctx, x, y, L, f, t, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    ctx.globalAlpha = alpha;
    const tail = Math.sin(t * 1.4) * L * 0.08;
    const body = ctx.createLinearGradient(0, -L * 0.18, 0, L * 0.18);
    body.addColorStop(0, '#8ea6e8'); body.addColorStop(0.55, '#b9a6ee'); body.addColorStop(1, '#f2e6ff');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.bezierCurveTo(L * 0.45, -L * 0.2, L * 0.05, -L * 0.22, -L * 0.25, -L * 0.1);
    ctx.quadraticCurveTo(-L * 0.42, -L * 0.04 + tail * 0.3, -L * 0.5, tail);
    ctx.lineTo(-L * 0.62, tail - L * 0.1); ctx.lineTo(-L * 0.56, tail); ctx.lineTo(-L * 0.62, tail + L * 0.1); ctx.lineTo(-L * 0.5, tail + L * 0.02);
    ctx.quadraticCurveTo(-L * 0.4, L * 0.06 + tail * 0.3, -L * 0.25, L * 0.1);
    ctx.bezierCurveTo(L * 0.05, L * 0.2, L * 0.45, L * 0.16, L * 0.5, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,140,230,0.9)';
    ctx.beginPath(); ctx.moveTo(L * 0.12, L * 0.08); ctx.quadraticCurveTo(L * 0.02, L * 0.28 + Math.sin(t * 1.4 + 1) * L * 0.04, -L * 0.06, L * 0.24); ctx.quadraticCurveTo(L * 0.04, L * 0.14, L * 0.12, L * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(30,30,60,0.8)';
    ctx.beginPath(); ctx.arc(L * 0.36, -L * 0.03, Math.max(1, L * 0.018), 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const sp = glow([200, 230, 255], 12);
    for (let k = 0; k < 7; k++) drawGlow(ctx, sp, L * (0.3 - k * 0.09), -L * 0.06 + Math.sin(k * 1.7) * L * 0.03, L * 0.035, alpha * (0.5 + 0.5 * Math.sin(t * 2 + k)));
    ctx.restore();
  }
  function drawCrane(ctx, x, y, s, flap, c) {
    ctx.fillStyle = rgba(c, 0.95);
    ctx.beginPath(); ctx.moveTo(x - s * 0.9, y); ctx.lineTo(x, y - s * 0.12); ctx.lineTo(x + s * 0.9, y - s * 0.35); ctx.lineTo(x + s * 0.2, y + s * 0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(c.map(v => v * 0.86), 0.95);
    ctx.beginPath(); ctx.moveTo(x - s * 0.15, y - s * 0.05); ctx.lineTo(x + s * 0.1, y - s * 0.05); ctx.lineTo(x - s * 0.2, y - s * (0.9 * flap)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(c.map(v => v * 0.75), 0.95);
    ctx.beginPath(); ctx.moveTo(x - s * 0.1, y); ctx.lineTo(x + s * 0.15, y); ctx.lineTo(x + s * 0.05, y + s * 0.6 * flap); ctx.closePath(); ctx.fill();
  }

  function draw(ctx, t) {
    const st = skyState();
    const horizonFull = (RH * 0.42 + pitch) * (H / RH);
    const g = ctx.createLinearGradient(0, 0, 0, horizonFull);
    g.addColorStop(0, rgba(st.top));
    g.addColorStop(1, rgba(st.fog));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const fov = Math.PI / 2;
    const azX = az => W / 2 + (angleDiff(cam.a, az) / (fov / 2)) * (W / 2);
    // des étoiles, même le jour : c'est un rêve
    for (const s of stars) {
      const x = azX(s.az);
      if (x < -2 || x > W + 2) continue;
      const a = (0.25 + (1 - st.day) * 0.65) * (0.6 + 0.4 * Math.sin(t * s.tw + s.az * 9));
      ctx.fillStyle = `rgba(255,248,255,${a})`;
      const z = s.b > 0.9 ? 1.8 : 1;
      ctx.fillRect(x, horizonFull - s.el * horizonFull, z, z);
    }
    // la planète à anneaux et ses deux lunes
    const pAz = 0.9, px = azX(pAz), pR = Math.min(W, H) * 0.24;
    if (px > -pR * 2.5 && px < W + pR * 2.5) drawPlanet(ctx, px, horizonFull - horizonFull * 0.12, pR);
    for (const [az, el, r] of [[pAz + 0.62, 0.45, 0.035], [pAz - 0.75, 0.62, 0.022]]) {
      const x = azX(az);
      if (x < -60 || x > W + 60) continue;
      const rr = Math.min(W, H) * r;
      ctx.fillStyle = 'rgba(255,250,240,0.92)';
      ctx.beginPath(); ctx.arc(x, horizonFull - el * horizonFull, rr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200,180,230,0.35)';
      ctx.beginPath(); ctx.arc(x + rr * 0.3, horizonFull - el * horizonFull - rr * 0.1, rr * 0.8, 0, TAU); ctx.fill();
    }
    // le soleil, et son halo arc-en-ciel
    const sunAz = 2.2, sx = azX(sunAz), sElev = st.sun, sy = horizonFull - sElev * horizonFull * 0.9;
    ctx.globalCompositeOperation = 'lighter';
    if (sElev > -0.2) {
      drawGlow(ctx, glow(mixRgb([255, 236, 214], [255, 160, 140], st.dusk).map(Math.round), 64), sx, sy, Math.min(W, H) * 0.32, 0.5);
      const R0 = Math.min(W, H) * 0.2;
      ctx.lineWidth = Math.max(2, R0 * 0.025);
      for (let k = 0; k < 7; k++) { const c = hslToRgb(k * 45, 90, 70); ctx.strokeStyle = rgba(c, 0.07 * st.day); ctx.beginPath(); ctx.arc(sx, sy, R0 + k * ctx.lineWidth, 0, TAU); ctx.stroke(); }
    }
    for (const f of falling) {
      const k = 1 - f.age / 1.6;
      for (let s2 = 0; s2 < 5; s2++) { const c = hslToRgb((f.hue + s2 * 40) % 360, 90, 72); ctx.strokeStyle = rgba(c, 0.18 * k); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x - s2 * 2, f.y + s2 * 2); ctx.lineTo(f.x - f.vx * 0.18 - s2 * 2, f.y - f.vy * 0.18 + s2 * 2); ctx.stroke(); }
      drawGlow(ctx, glow([255, 255, 255], 12), f.x, f.y, 6, k);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const c of clouds) {
      const x = azX(c.az);
      if (x < -200 || x > W + 200) continue;
      ctx.globalAlpha = 0.35 + st.day * 0.4;
      const w = 230 * c.s;
      ctx.drawImage(cloudImgs[c.tint], x - w / 2, horizonFull - c.el * horizonFull - w * 0.25, w, w / 2);
    }
    ctx.globalAlpha = 1;

    // la terre, avec un peu de roulis quand on vire
    const hz = render(st);
    const roll = -cam.turn * 0.16;
    const zoom = Math.cos(roll) + (Math.max(W, H) / Math.min(W, H)) * Math.abs(Math.sin(roll)) + 0.03;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(roll);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, (-W * zoom) / 2, (-H * zoom) / 2, W * zoom, H * zoom);
    // tout en haut, le ciel devient le miroir de la terre
    if (mirrorK > 0.01) {
      const hy = (horizonFull - H / 2) * zoom;
      ctx.save();
      ctx.beginPath(); ctx.rect(-W * 2, -H * 2, W * 4, H * 2 + hy); ctx.clip();
      ctx.translate(0, 2 * hy);
      ctx.scale(1, -1);
      ctx.globalAlpha = 0.42 * mirrorK;
      ctx.drawImage(off, (-W * zoom) / 2, (-H * zoom) / 2, W * zoom, H * zoom);
      ctx.restore();
      ctx.globalAlpha = 1;
      mirrorFade = true;
    } else mirrorFade = false;

    if (mirrorFade) {
      // le bord du reflet (là où l'image renversée s'arrête) se fond dans le ciel, sans trait
      const edge = 2 * (horizonFull - H / 2) * zoom - (H / 2) * zoom, fadeG = ctx.createLinearGradient(0, edge, 0, edge + H * 0.2);
      fadeG.addColorStop(0, rgba(st.top, mirrorK)); fadeG.addColorStop(1, rgba(st.top, 0));
      ctx.fillStyle = fadeG;
      ctx.fillRect(-W * 2, edge, W * 4, H * 0.2);
    }
    // ce qui flotte dans le rêve, du plus loin au plus proche
    const items = [];
    const DIST = q < 0.8 ? 520 : 700;
    const fade = z => 1 - smoothstep(DIST * 0.45, DIST * 0.95, z);
    for (let k = 0; k < islands.length; k++) {
      const isl = islands[k], p = project(isl.x, isl.y, isl.h + Math.sin(t * 0.4 + isl.ph) * 3, hz);
      if (p) items.push({ z: p.z, f: () => { const s = isl.r * 2 * p.k * zoom, ix = (p.x - W / 2) * zoom, iy = (p.y - H / 2) * zoom; ctx.globalAlpha = fade(p.z); ctx.drawImage(sprites[k], ix - s / 2, iy - s * 0.36, s, s * 1.08); } });
    }
    for (const w of whales) {
      const wx = w.cx + Math.cos(w.a) * w.rad, wy = w.cy + Math.sin(w.a) * w.rad;
      const p = project(wx, wy, w.h + Math.sin(t * 0.5 + w.a) * 4, hz);
      if (!p) continue;
      const ahead = project(wx - Math.sin(w.a) * w.w * 40, wy + Math.cos(w.a) * w.w * 40, w.h, hz);
      const dir = ahead ? Math.sign(ahead.x - p.x) || 1 : 1;
      items.push({ z: p.z, f: () => drawWhale(ctx, (p.x - W / 2) * zoom, (p.y - H / 2) * zoom, w.len * p.k * zoom, dir, t, fade(p.z)) });
    }
    for (const s of seeds) {
      const p = project(s.x, s.y, s.h, hz);
      if (!p) continue;
      items.push({ z: p.z, f: () => {
        const r = 5 * p.k * zoom, x = (p.x - W / 2) * zoom, y = (p.y - H / 2) * zoom;
        if (r < 1.5) return;
        ctx.globalAlpha = fade(p.z) * 0.85;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(0.6, r * 0.03);
        ctx.beginPath();
        for (let m = 0; m < 14; m++) { const a = s.rot + (m / 14) * TAU; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        ctx.moveTo(x, y); ctx.lineTo(x + r * 0.15, y + r * 1.2);
        ctx.stroke();
      } });
    }
    const warm = glow([255, 196, 130], 24);
    for (const l of lanterns) {
      const p = project(l.x, l.y, l.h, hz);
      if (!p || p.z > DIST * 0.9) continue;
      items.push({ z: p.z, f: () => {
        const s = 2.2 * p.k * zoom, x = (p.x - W / 2) * zoom, y = (p.y - H / 2) * zoom, a = fade(p.z);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, warm, x, y, s * 3.2 + 2, a * (0.5 + 0.15 * Math.sin(t * 3 + l.ph)));
        ctx.globalCompositeOperation = 'source-over';
        if (s > 1.4) {
          // une lanterne de papier : un cocon lumineux, plus clair au cœur, cerclé en haut et en bas
          ctx.globalAlpha = a;
          const lg = ctx.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0);
          const c0 = l.hue > 0.7 ? [255, 160, 186] : [255, 196, 120], c1 = l.hue > 0.7 ? [255, 226, 236] : [255, 240, 196];
          lg.addColorStop(0, rgba(c0, 0.92)); lg.addColorStop(0.5, rgba(c1, 0.98)); lg.addColorStop(1, rgba(c0, 0.92));
          ctx.fillStyle = lg;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - s * 0.5, y - s * 0.7, s, s * 1.3, s * 0.4); else ctx.rect(x - s * 0.5, y - s * 0.7, s, s * 1.3); ctx.fill();
          if (s > 4) { ctx.fillStyle = 'rgba(120,60,50,0.55)'; ctx.fillRect(x - s * 0.36, y - s * 0.72, s * 0.72, s * 0.1); ctx.fillRect(x - s * 0.3, y + s * 0.52, s * 0.6, s * 0.08); }
        }
      } });
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) { it.f(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }

    // le phare de l'Arbre-Monde : une colonne de lumière qui monte au-dessus des terres
    const b = project(beacon.x, beacon.y, beacon.h, hz);
    if (b) {
      const bx = (b.x - W / 2) * zoom, by = (b.y - H / 2) * zoom;
      const k = clamp(1.6 - b.z / 400, 0.25, 1);
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(bx, by, bx, -H);
      beam.addColorStop(0, `rgba(255,214,160,${0.55 * k})`);
      beam.addColorStop(1, 'rgba(255,214,160,0)');
      ctx.fillStyle = beam;
      const bw = Math.max(2, 26 / Math.max(1, b.z / 40));
      ctx.fillRect(bx - bw / 2, -H, bw, by + H);
      drawGlow(ctx, glow([255, 220, 170], 48), bx, by, 30 + 600 / b.z, 0.8 * k);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // les grues de papier qui volent avec toi, et les bulles de savon
    for (const cr of cranes) {
      const x = W / 2 + cr.ox * (W / 900) + Math.sin(t * 0.7 + cr.ph) * 6 - cam.turn * 40, y = H * 0.3 + cr.oy * (W / 900) + Math.sin(t * 1.1 + cr.ph) * 4;
      drawCrane(ctx, x, y, 11 * (W / 1200 + 0.4), 0.35 + 0.65 * Math.abs(Math.sin(t * 4 + cr.ph)), cr.c);
    }
    for (const bb of bubbles) {
      ctx.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) { const a0 = (k / 6) * TAU + t * 0.5; ctx.strokeStyle = `hsla(${(k * 60 + t * 40) % 360},90%,75%,0.35)`; ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, a0, a0 + TAU / 6); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(bb.x - bb.r * 0.35, bb.y - bb.r * 0.4, bb.r * 0.16, 0, TAU); ctx.fill();
    }
    // un voile de rêve : les bords se teintent doucement
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(255,220,240,0)'); v.addColorStop(1, rgba(mixRgb([255, 200, 230], [190, 170, 255], st.md), 0.22));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // ——— Commandes : la main, et les flèches du clavier
  const keys = { left: false, right: false, up: false, down: false };
  let longHold = false;
  const keyMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const kd = e => { if (keyMap[e.key]) keys[keyMap[e.key]] = true; };
  const ku = e => { if (keyMap[e.key]) keys[keyMap[e.key]] = false; };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  return {
    resize, update, draw,
    save() { api.memory?.set('envol', { x: Math.round(cam.x * 10) / 10, y: Math.round(cam.y * 10) / 10, a: Math.round(cam.a * 1000) / 1000, h: Math.round(cam.h * 10) / 10, clock: Math.round(clock * 10) / 10 }); },
    longpress() { longHold = true; audio.noise({ freq: 400, q: 0.5, dur: 1.2, vel: 0.08, type: 'bandpass', sweep: 3 }); },
    up() { longHold = false; },
    // toucher le monde : une lanterne s'élève de là où tu as touché, avec un vœu
    tap(p) {
      const hz = RH * 0.42 + pitch;
      const w = unproject(p.x, p.y, 34 + Math.random() * 20, hz);
      spawnLantern(true, w.x, w.y, Math.max(w.h, groundAt(w.x, w.y) + 2));
      userLanterns++;
      audio.note(Math.floor((1 - p.y / H) * 8) + 2, { type: 'bell', vel: 0.07, dur: 2.6, pan: (p.x / W) * 2 - 1, send: 0.6 });
      if (userLanterns >= 10) secrets.find('lanternes');
    },
    destroy() { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); audio.setNoiseLevel(mood.noise.gain); },
  };
}
