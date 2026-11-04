// Sève — Le Jardin de Darwin : une règle de réécriture fait pousser une plante (Lindenmayer, 1968) ;
// ton regard choisit, et la règle mute (les Biomorphes de Dawkins, 1986).
// Le génome dit bien plus que la règle : le port (dressé, étalé, pleureur), l'écorce, la forme des feuilles,
// le type et la couleur des fleurs, l'irrégularité des rameaux. Chaque planche en tire une petite description botanique.
import { TAU, clamp, lerp, glow, drawGlow, hsl, makeCanvas, rng, angleDiff } from '../engine.js';

export const mood = {
  root: 164.81, scale: 'majPenta', wave: 'triangle', chord: [0, 4, 7, 12], pad: 0.038, cutoff: 1300, lfo: 0.035,
  noise: { type: 'bandpass', freq: 700, q: 0.4, gain: 0.006, gust: 0.7, gustRate: 0.09 },
};

const GENUS = ['Lindenmayera', 'Fractalis', 'Turtlea', 'Ramosa', 'Sylvula', 'Viridis', 'Spiralis', 'Furcata', 'Recursia', 'Phyllotaxa', 'Dawkinsia', 'Prusinkia', 'Cladonia', 'Arborella'];
const SPECIES = ['gracilis', 'serpens', 'umbrosa', 'aurea', 'nocturna', 'dichotoma', 'vulgaris', 'fulgens', 'minima', 'tortuosa', 'ramosissima', 'mirabilis', 'pendula', 'stellata', 'campanulata', 'purpurea', 'argentea', 'lanceolata', 'cordata', 'spicata'];
// Les premières plantes de « The Algorithmic Beauty of Plants » (Prusinkiewicz & Lindenmayer, 1990), chacune avec son caractère
const ANCESTORS = [
  { rule: 'FF-[-F+F+F]+[+F-F-F]', angle: 22.5, hue: 118, bend: -1, flower: 1, bark: 24, petal: 342, petalL: 82, petalS: 62, leafShape: 1, trop: 0.2, decay: 0.93, jitter: 0.06, thick: 1.15 },
  { rule: 'F[+F]F[-F][F]', angle: 20, hue: 92, bend: 1, flower: 4, bark: 32, petal: 268, petalL: 70, petalS: 52, leafShape: 4, trop: -0.65, decay: 0.88, jitter: 0.09, thick: 0.9 },
  { rule: 'F[+F]F[-F]F', angle: 25.7, hue: 146, bend: 0, flower: 2, bark: 20, petal: 48, petalL: 90, petalS: 40, leafShape: 5, trop: 0.1, decay: 0.95, jitter: 0.05, thick: 1 },
];
let ancestorIdx = 0; // chaque visite commence par un autre ancêtre

const LEAVES = ['feuilles rondes', 'feuilles lancéolées', 'larges feuilles', 'aiguilles', 'feuilles en cœur', 'feuilles palmées'];
const FLOWERS = [null, ['fleurs à cinq pétales', 'f'], ['marguerites', 'f'], ['étoiles', 'f'], ['clochettes', 'f'], ['ombelles', 'f'], ['épis', 'm']];
function colorName(h, l, gender) {
  const f = gender === 'f';
  if (l > 85) return f ? 'blanches' : 'blancs';
  if (h < 15 || h >= 345) return 'rouges';
  if (h < 40) return f ? 'orangées' : 'orangés';
  if (h < 66) return 'jaunes';
  if (h < 160) return f ? 'vertes' : 'verts';
  if (h < 200) return 'turquoise';
  if (h < 252) return f ? 'bleues' : 'bleus';
  if (h < 292) return f ? 'violettes' : 'violets';
  return 'roses';
}
function describe(g) {
  const port = g.trop > 0.35 ? 'Port dressé' : g.trop < -0.35 ? 'Port pleureur' : 'Port étalé';
  const fl = FLOWERS[g.flower];
  return `${port}, ${LEAVES[g.leafShape]}, ${fl ? `${fl[0]} ${colorName(g.petal, g.petalL, fl[1])}` : 'sans fleurs'}.`;
}

const isBalanced = r => { let d = 0; for (const c of r) { if (c === '[') d++; else if (c === ']' && --d < 0) return false; } return d === 0; };
const mirror = r => [...r].reverse().map(c => ({ '+': '-', '-': '+', '[': ']', ']': '[' }[c] || c)).join('');
const pretty = r => r.replace(/-/g, '−');
function hashOf(g) {
  let h = 2166136261;
  for (const c of g.rule + g.angle.toFixed(1) + Math.round(g.hue) + g.flower + g.leafShape + Math.round(g.trop * 10) + Math.round(g.petal)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function nameOf(g) { const h = hashOf(g); return `${GENUS[h % GENUS.length]} ${SPECIES[(h >>> 8) % SPECIES.length]}`; }

function mutateRule(rule, R) {
  for (let tries = 0; tries < 30; tries++) {
    const a = [...rule];
    const op = R();
    const pos = Math.floor(R() * (a.length + 1));
    if (op < 0.28) a.splice(pos, 0, R() < 0.5 ? '+' : '-');
    else if (op < 0.5) a.splice(pos, 0, 'F');
    else if (op < 0.72) a.splice(pos, 0, ...(R() < 0.5 ? '[+F]' : R() < 0.5 ? '[-F]' : '[F]'));
    else if (op < 0.88) { const i = Math.floor(R() * a.length); if (a[i] !== '[' && a[i] !== ']') a.splice(i, 1); }
    else { const i = Math.floor(R() * a.length); if (a[i] === '+') a[i] = '-'; else if (a[i] === '-') a[i] = '+'; }
    const r = a.join('');
    if (r !== rule && r.length <= 20 && r.includes('F') && isBalanced(r) && !r.includes('[]')) return r;
  }
  return rule;
}
function mutate(g, R) {
  const c = { ...g };
  // toujours au moins une mutation de forme, pour que chaque enfant se distingue de ses frères
  const shapeOps = [
    () => { c.angle = clamp(c.angle + (R() < 0.5 ? -1 : 1) * (4 + R() * 10), 8, 60); },
    () => { c.trop = clamp(c.trop + (R() < 0.5 ? -1 : 1) * (0.25 + R() * 0.45), -1, 1); },
    () => { c.decay = clamp(c.decay + (R() - 0.5) * 0.16, 0.68, 1); },
    () => { c.leafShape = (c.leafShape + 1 + Math.floor(R() * 5)) % 6; },
    () => { c.jitter = clamp(c.jitter + (R() - 0.5) * 0.14, 0, 0.3); },
  ];
  if (R() < 0.45) c.rule = mutateRule(c.rule, R); else shapeOps[Math.floor(R() * shapeOps.length)]();
  if (R() < 0.82) {
    const r = R();
    if (r < 0.2) c.hue = R() < 0.06 ? 330 + R() * 40 : clamp(c.hue + (R() - 0.5) * 50, 50, 190); // parfois, un feuillage pourpre
    else if (r < 0.48) c.petal = (c.petal + [30, -30, 120, -120, 180][Math.floor(R() * 5)] + (R() - 0.5) * 30 + 360) % 360; // une couleur voisine, ou une couleur en harmonie
    else if (r < 0.56) { c.petalL = clamp(c.petalL + (R() - 0.5) * 22, 50, 92); c.petalS = clamp(c.petalS + (R() - 0.5) * 30, 25, 95); }
    else if (r < 0.72) c.flower = (c.flower + 1 + Math.floor(R() * 6)) % 7;
    else if (r < 0.82) c.bark = clamp(c.bark + (R() - 0.5) * 22, 8, 50);
    else if (r < 0.92) c.bend = clamp(c.bend + (R() - 0.5) * 4, -6, 6);
    else c.thick = clamp(c.thick + (R() - 0.5) * 0.45, 0.6, 1.6);
  }
  return c;
}

// La tortue de Lindenmayer : F avance, + et − tournent, [ ouvre une branche, ] y revient.
// Ici elle a du caractère : ses rameaux raccourcissent, cherchent le ciel (ou retombent), et hésitent un peu.
function growPlant(g) {
  const fPer = Math.max(1, (g.rule.match(/F/g) || []).length);
  let iter = 1;
  while (iter < 6 && Math.pow(fPer, iter + 1) <= 2600) iter++;
  let s = 'F';
  for (let i = 0; i < iter && s.length < 60000; i++) s = s.replace(/F/g, g.rule);
  const R = rng(hashOf(g));
  const segs = [], tips = [], nodes = [];
  let x = 0, y = 0, a = -Math.PI / 2, depth = 0;
  const stack = [], ang = (g.angle * Math.PI) / 180, curl = (g.bend * Math.PI) / 180 * 0.35;
  const trop = g.trop || 0, target = trop >= 0 ? -Math.PI / 2 : Math.PI / 2, tk = Math.abs(trop) * (trop >= 0 ? 0.022 : 0.07);
  let minX = 0, maxX = 0, minY = 0, maxY = 0, nF = 0;
  for (const ch of s) {
    if (ch === 'F') {
      const L = Math.pow(g.decay || 1, Math.min(depth, 6));
      const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
      segs.push(x, y, nx, ny, depth);
      if (depth >= 1 && (++nF & 1)) nodes.push(nx, ny, a, depth);
      x = nx; y = ny;
      a += curl + angleDiff(target, a) * tk * (depth === 0 ? (trop >= 0 ? 0.2 : 0) : Math.min(1, depth * 0.45)); // le tronc reste droit ; les rameaux se dressent ou retombent
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else if (ch === '+') a += ang * (1 + (R() - 0.5) * 2 * (g.jitter || 0));
    else if (ch === '-') a -= ang * (1 + (R() - 0.5) * 2 * (g.jitter || 0));
    else if (ch === '[') { stack.push([x, y, a, depth]); depth++; }
    else if (ch === ']') { tips.push(x, y, a, depth); [x, y, a, depth] = stack.pop(); }
  }
  tips.push(x, y, a, depth);
  return { segs: new Float32Array(segs), tips: new Float32Array(tips), nodes: new Float32Array(nodes), minX, maxX, minY: Math.min(minY, -1), maxY, iter };
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const R = rng(1986 + ancestorIdx * 7);
  let W = api.W, H = api.H;
  let paper = null, parentCell = null, cells = [], generation = 1, specimen = 1;
  const herbier = [], motes = [];
  let pressedCell = null;

  const makeCell = (g, born = engine.t) => ({ g, plant: growPlant(g), born, name: nameOf(g), desc: describe(g), num: specimen++, ph: R() * TAU, x: 0, y: 0, w: 0, h: 0, fade: 1, cache: null });

  function newGeneration(g) {
    parentCell = makeCell(g);
    cells = Array.from({ length: 6 }, (_, i) => makeCell(mutate(g, R), engine.t + 0.15 + i * 0.08));
    layout();
    api.label(`génération ${generation} · ${parentCell.name}`);
  }

  function layout() {
    const top = 86, bottom = 150, portrait = H > W * 1.05;
    if (!portrait) {
      const pw = Math.min(W * 0.36, 460);
      Object.assign(parentCell, { x: 24, y: top, w: pw, h: H - top - bottom });
      const x0 = pw + 48, aw = W - x0 - 24, ah = H - top - bottom;
      cells.forEach((c, i) => Object.assign(c, { x: x0 + (i % 3) * (aw / 3) + 6, y: top + Math.floor(i / 3) * (ah / 2) + 6, w: aw / 3 - 12, h: ah / 2 - 12 }));
    } else {
      const ph = (H - top - bottom) * 0.4;
      Object.assign(parentCell, { x: 14, y: top, w: W - 28, h: ph });
      const y0 = top + ph + 12, ah = H - y0 - bottom, aw = W - 20;
      cells.forEach((c, i) => Object.assign(c, { x: 10 + (i % 3) * (aw / 3) + 3, y: y0 + Math.floor(i / 3) * (ah / 2) + 3, w: aw / 3 - 6, h: ah / 2 - 6 }));
    }
    for (const c of [parentCell, ...cells]) c.cache = null;
  }

  function resize(w, h) {
    W = w; H = h;
    // un papier d'herbier sombre, à peine grenu
    paper = makeCanvas(W, H);
    const g = paper.getContext('2d');
    const grd = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, '#0f1a12'); grd.addColorStop(1, '#050906');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(im, 0, 0);
    if (parentCell) layout();
    for (const c of herbier) c.cache = null;
    if (!motes.length) for (let i = 0; i < 40; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * TAU, sp: 4 + Math.random() * 8 });
  }
  resize(W, H);
  newGeneration(ANCESTORS[ancestorIdx++ % ANCESTORS.length]);

  // ——— Une planche : la plante, ses feuilles, ses fleurs
  function fit(c, box) {
    const p = c.plant;
    const bw = Math.max(1, p.maxX - p.minX), bh = Math.max(1, Math.max(p.maxY, 0) - p.minY);
    const k = Math.min((box.w * 0.84) / bw, (box.h * (c === parentCell ? 0.64 : 0.72)) / bh); // le parent garde de la place pour sa description
    return { k, ox: box.x + box.w / 2 - ((p.minX + p.maxX) / 2) * k, oy: box.y + box.h * 0.12 - p.minY * k };
  }
  // les feuilles : six formes, trois tons, pour qu'un feuillage ait de la profondeur
  function leafShape(ctx, kind, x, y, a, s) {
    const c = Math.cos(a), si = Math.sin(a);
    const at = (u, v) => [x + c * u - si * v, y + si * u + c * v];
    if (kind === 0) { ctx.moveTo(x + s * 0.42, y); ctx.arc(x, y, s * 0.42, 0, TAU); return; }
    if (kind === 3) { for (const d of [-0.5, 0, 0.5]) { const [ex, ey] = [x + Math.cos(a + d) * s, y + Math.sin(a + d) * s]; ctx.moveTo(x, y); ctx.lineTo(ex, ey); } return; }
    if (kind === 5) { for (const d of [-0.65, 0, 0.65]) { const aa = a + d, [cx, cy] = [x + Math.cos(aa) * s * 0.55, y + Math.sin(aa) * s * 0.55]; ctx.moveTo(cx + s * 0.4, cy); ctx.ellipse(cx, cy, s * 0.48, s * 0.22, aa, 0, TAU); } return; }
    if (kind === 4) {
      const [px, py] = at(s, 0), [l1x, l1y] = at(s * 0.15, -s * 0.55), [l2x, l2y] = at(s * 0.55, -s * 0.55), [r1x, r1y] = at(s * 0.15, s * 0.55), [r2x, r2y] = at(s * 0.55, s * 0.55);
      ctx.moveTo(x, y); ctx.bezierCurveTo(l1x, l1y, l2x, l2y, px, py); ctx.bezierCurveTo(r2x, r2y, r1x, r1y, x, y);
      return;
    }
    const [lx, ly] = [s * (kind === 1 ? 0.8 : 0.7), s * (kind === 1 ? 0.22 : 0.4)];
    const [cx, cy] = at(lx * 0.75, 0);
    ctx.moveTo(x, y);
    ctx.ellipse(cx, cy, lx * 0.75, ly * 0.75, a, 0, TAU);
  }
  function flowerAt(ctx, g, x, y, a, fs, t) {
    switch (g.flower) {
      case 1: for (let m = 0; m < 5; m++) { const aa = a + (m / 5) * TAU, cx = x + Math.cos(aa) * fs * 0.55, cy = y + Math.sin(aa) * fs * 0.55; ctx.moveTo(cx + fs * 0.45, cy); ctx.arc(cx, cy, fs * 0.45, 0, TAU); } break;
      case 2: for (let m = 0; m < 12; m++) { const aa = a + (m / 12) * TAU; ctx.moveTo(x, y); ctx.ellipse(x + Math.cos(aa) * fs * 0.6, y + Math.sin(aa) * fs * 0.6, fs * 0.55, fs * 0.13, aa, 0, TAU); } break;
      case 4: { const by = y + fs * 0.35; ctx.moveTo(x - fs * 0.55, by + fs * 0.9); ctx.quadraticCurveTo(x - fs * 0.6, by - fs * 0.2, x, by - fs * 0.25); ctx.quadraticCurveTo(x + fs * 0.6, by - fs * 0.2, x + fs * 0.55, by + fs * 0.9); ctx.quadraticCurveTo(x, by + fs * 0.65, x - fs * 0.55, by + fs * 0.9); break; }
      case 5: for (let m = 0; m < 7; m++) { const aa = -Math.PI / 2 + (m - 3) * 0.42, cx = x + Math.cos(aa) * fs * 0.7, cy = y + Math.sin(aa) * fs * 0.7; ctx.moveTo(cx + fs * 0.24, cy); ctx.arc(cx, cy, fs * 0.24, 0, TAU); } break;
      case 6: for (let m = 0; m < 5; m++) { const cx = x + Math.cos(a) * fs * 0.45 * m, cy = y + Math.sin(a) * fs * 0.45 * m, r = fs * (0.3 - m * 0.04); ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); } break;
      default: break;
    }
  }
  function paintPlant(ctx, c, box, grow, t) {
    const p = c.plant, g = c.g, { k, ox, oy } = fit(c, box);
    const n = Math.floor((p.segs.length / 5) * grow);
    ctx.lineCap = 'round';
    // les tiges : de l'écorce au pied, du vert aux pointes ; épaisses au pied, fines au bout
    for (let dep = 0; dep < 8; dep++) {
      const u = dep / 7;
      ctx.strokeStyle = hsl(lerp(g.bark, g.hue, Math.min(1, u * 1.3)), lerp(26, 46, u), lerp(24, 36, u), 0.96);
      ctx.lineWidth = clamp(k * 0.2 * g.thick * Math.pow(0.78, dep), 0.5, 4.8);
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < n; i++) {
        const j = i * 5;
        if (Math.min(7, p.segs[j + 4]) !== dep) continue;
        ctx.moveTo(ox + p.segs[j] * k, oy + p.segs[j + 1] * k);
        ctx.lineTo(ox + p.segs[j + 2] * k, oy + p.segs[j + 3] * k);
        any = true;
      }
      if (any) ctx.stroke();
    }
    if (grow < 0.98) return;
    // feuilles le long des rameaux et au bout : trois tons
    const leafS = clamp(k * (g.leafShape === 2 || g.leafShape === 4 ? 0.95 : 0.7), 2.4, Math.min(10, box.w * 0.03));
    const fol = g.hue;
    const tones = [hsl(fol, 38, 26, 0.92), hsl(fol + 6, 44, 34, 0.92), hsl(fol + 12, 48, 44, 0.9)];
    const needles = g.leafShape === 3;
    for (let tone = 0; tone < 3; tone++) {
      ctx.beginPath();
      if (needles) { ctx.strokeStyle = tones[tone]; ctx.lineWidth = Math.max(0.6, leafS * 0.12); } else ctx.fillStyle = tones[tone];
      const tips = p.tips, nodes = p.nodes;
      for (let i = tone; i < tips.length / 4; i += 3) leafShape(ctx, g.leafShape, ox + tips[i * 4] * k, oy + tips[i * 4 + 1] * k, tips[i * 4 + 2], leafS);
      const step = Math.max(1, Math.ceil(nodes.length / 4 / 420));
      for (let i = tone * step; i < nodes.length / 4; i += 3 * step) {
        const side = (i & 1 ? 1 : -1) * 0.9;
        leafShape(ctx, g.leafShape, ox + nodes[i * 4] * k, oy + nodes[i * 4 + 1] * k, nodes[i * 4 + 2] + side, leafS * 0.8);
      }
      if (needles) ctx.stroke(); else ctx.fill();
    }
    // fleurs : leur type et leur couleur viennent du génome ; un cœur plus pâle ou plus vif selon l'espèce
    if (g.flower) {
      const fs = clamp(k * 0.8, 2.8, Math.min(7.5, box.w * 0.022)) * (g.flower === 4 ? 1.1 : g.flower === 5 ? 1.2 : 1);
      const tips = p.tips, nt = tips.length / 4, every = nt > 90 ? 5 : nt > 40 ? 4 : 3;
      ctx.globalCompositeOperation = 'lighter';
      const halo = glow(hslRgb(g.petal, g.petalS, Math.min(80, g.petalL)), 16);
      for (let i = 0; i < nt; i += every) drawGlow(ctx, halo, ox + tips[i * 4] * k, oy + tips[i * 4 + 1] * k, fs * 2.1, 0.16);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      for (const shadeK of [0, 1]) {
        ctx.beginPath();
        const col = shadeK ? hsl(g.petal + 8, g.petalS, Math.min(94, g.petalL + 8), 0.95) : hsl(g.petal, g.petalS, g.petalL - 6, 0.95);
        for (let i = shadeK; i < nt; i += every * 2) flowerAt(ctx, g, ox + tips[i * 4] * k, oy + tips[i * 4 + 1] * k, tips[i * 4 + 2], fs, t);
        if (g.flower === 3) {
          for (let i = shadeK; i < nt; i += every * 2) { const x = ox + tips[i * 4] * k, y = oy + tips[i * 4 + 1] * k; for (let m = 0; m < 6; m++) { const aa = (m / 6) * TAU; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(aa) * fs, y + Math.sin(aa) * fs); } }
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
        } else { ctx.fillStyle = col; ctx.fill(); }
      }
      if (g.flower === 1 || g.flower === 2) {
        // le cœur de la fleur
        ctx.fillStyle = hsl(g.flower === 2 ? 46 : (g.petal + 40) % 360, 85, g.flower === 2 ? 58 : 72, 0.95);
        ctx.beginPath();
        for (let i = 0; i < nt; i += every) { const x = ox + tips[i * 4] * k, y = oy + tips[i * 4 + 1] * k, r = fs * 0.26; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
        ctx.fill();
      }
    }
  }
  const hslRgb = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]; };

  // une plante finie est peinte une fois sur son propre calque ; ensuite on ne fait que la balancer
  function drawPlant(ctx, c, t, box, grow = 1) {
    if (grow < 1) { paintPlant(ctx, c, box, grow, t); return; }
    const dpr = Math.min(2, engine.dpr || 1);
    if (!c.cache || c.cache.w !== box.w || c.cache.h !== box.h) {
      const cv = makeCanvas(box.w * dpr, box.h * dpr), g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(-box.x, -box.y);
      paintPlant(g, c, box, 1, t);
      c.cache = { cv, w: box.w, h: box.h };
    }
    const { oy } = fit(c, box);
    const baseY = Math.min(box.y + box.h, oy);
    const sway = Math.sin(t * 1.1 + c.ph) * 0.03 + (pressedCell === c ? Math.sin(t * 18) * 0.04 : 0);
    ctx.save();
    ctx.translate(0, baseY);
    ctx.transform(1, 0, -sway, 1, 0, 0);
    ctx.drawImage(c.cache.cv, box.x, box.y - baseY, box.w, box.h);
    ctx.restore();
  }

  function drawCard(ctx, c, t, isParent) {
    const grow = clamp((t - c.born) / 1.4, 0, 1);
    ctx.globalAlpha = c.fade;
    ctx.strokeStyle = isParent ? 'rgba(198,255,122,0.45)' : 'rgba(220,240,210,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(c.x, c.y, c.w, c.h, 10) : ctx.rect(c.x, c.y, c.w, c.h); ctx.stroke();
    if (grow > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
      drawPlant(ctx, c, t, c, grow);
      ctx.restore();
    }
    const small = c.w < 150;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillStyle = isParent ? 'rgba(198,255,122,0.75)' : 'rgba(220,240,210,0.45)';
    ctx.fillText(isParent ? `PARENT · GÉNÉRATION ${generation}` : `SPÉCIMEN N° ${c.num}`, c.x + 10, c.y + 9, c.w - 16);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'bottom';
    const descH = isParent && c.h > 220 ? 16 : 0;
    ctx.font = `italic 400 ${isParent ? 20 : small ? 12 : 15}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = 'rgba(240,250,235,0.85)';
    ctx.fillText(c.name, c.x + 10, c.y + c.h - (small ? 18 : 22) - descH, c.w - 16);
    if (descH) {
      ctx.font = 'italic 400 13px "Cormorant Garamond", Georgia, serif';
      ctx.fillStyle = 'rgba(220,240,210,0.6)';
      ctx.fillText(c.desc, c.x + 10, c.y + c.h - 22, c.w - 16);
    }
    if (!small || isParent) {
      ctx.font = '400 9px "DM Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(220,240,210,0.5)';
      ctx.fillText(`F → ${pretty(c.g.rule)} · ${c.g.angle.toFixed(1).replace('.', ',')}°`, c.x + 10, c.y + c.h - 7, c.w - 16);
    }
    ctx.globalAlpha = 1;
  }

  function herbierBox(i) {
    const s = 54, gap = 8, n = Math.max(herbier.length, 1), total = n * (s + gap) - gap;
    return { x: W / 2 - total / 2 + i * (s + gap), y: H - 104, w: s, h: s };
  }

  function update(dt, t) {
    for (const m of motes) { m.y -= m.sp * dt; m.x += Math.sin(t * 0.5 + m.ph) * 6 * dt; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } }
  }

  function draw(ctx, t) {
    ctx.drawImage(paper, 0, 0, W, H);
    drawCard(ctx, parentCell, t, true);
    for (const c of cells) drawCard(ctx, c, t, false);
    // l'herbier, en bas : les plantes gardées
    if (herbier.length) {
      ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(220,240,210,0.4)';
      ctx.fillText('HERBIER', W / 2, H - 110);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      herbier.forEach((c, i) => {
        const b = herbierBox(i);
        ctx.strokeStyle = 'rgba(220,240,210,0.2)';
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        drawPlant(ctx, c, t, b, 1);
      });
    }
    ctx.globalCompositeOperation = 'lighter';
    const mg = glow([220, 255, 170], 10);
    for (const m of motes) drawGlow(ctx, mg, m.x, m.y, 3, 0.35 + 0.25 * Math.sin(t * 2 + m.ph));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ——— La mélodie d'une règle : F chante, + monte, − descend, les crochets mémorisent puis reviennent
  function playRule(rule) {
    let deg = 4, n = 0;
    const stack = [];
    for (const ch of rule) {
      if (ch === 'F') audio.note(deg, { type: n % 2 ? 'pluck' : 'bell', vel: 0.08, dur: 1.4, at: n++ * 0.13, send: 0.45, pan: (deg - 4) * 0.1 });
      else if (ch === '+') deg++;
      else if (ch === '-') deg--;
      else if (ch === '[') stack.push(deg);
      else if (ch === ']') deg = stack.pop() ?? 4;
      if (n > 16) break;
    }
  }

  const inBox = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function choose(g) {
    generation++;
    newGeneration(g);
    playRule(g.rule);
    if (generation >= 10) secrets.find('dawkins');
    if (g.rule === mirror(g.rule) && g.rule.length > 2) secrets.find('symetrie');
  }
  function tap(p) {
    for (let i = 0; i < herbier.length; i++) if (inBox(p, herbierBox(i))) { choose(herbier[i].g); return; }
    if (inBox(p, parentCell)) { playRule(parentCell.g.rule); pressedCell = parentCell; setTimeout(() => { pressedCell = null; }, 600); return; }
    for (const c of cells) if (inBox(p, c)) { choose(c.g); return; }
  }
  function longpress(p) {
    const c = [parentCell, ...cells].find(c => inBox(p, c));
    if (!c) return;
    if (!herbier.some(h => h.name === c.name && h.g.rule === c.g.rule)) {
      herbier.push(makeCell({ ...c.g }));
      if (herbier.length > 8) herbier.shift();
      audio.note(9, { type: 'glass', vel: 0.1, dur: 2 });
      api.toast({ kicker: 'Herbier', title: c.name, text: `${c.desc} Pressée entre deux pages : touche-la plus tard pour la faire revivre.`, ms: 3600 });
    }
    if (herbier.length >= 3) secrets.find('herbier');
  }

  return { resize, update, draw, tap, longpress, destroy() {} };
}
