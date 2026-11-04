// Sève — Le Jardin de Darwin : une règle de réécriture fait pousser une plante (Lindenmayer, 1968) ;
// ton regard choisit, et la règle mute (les Biomorphes de Dawkins, 1986).
import { TAU, clamp, lerp, glow, drawGlow, hsl, makeCanvas, rng } from '../engine.js';

export const mood = {
  root: 164.81, scale: 'majPenta', wave: 'triangle', chord: [0, 4, 7, 12], pad: 0.038, cutoff: 1300, lfo: 0.035,
  noise: { type: 'bandpass', freq: 700, q: 0.4, gain: 0.006, gust: 0.7, gustRate: 0.09 },
};

const GENUS = ['Lindenmayera', 'Fractalis', 'Turtlea', 'Ramosa', 'Sylvula', 'Viridis', 'Spiralis', 'Furcata', 'Recursia', 'Phyllotaxa'];
const SPECIES = ['gracilis', 'serpens', 'umbrosa', 'aurea', 'nocturna', 'dichotoma', 'vulgaris', 'fulgens', 'minima', 'tortuosa', 'ramosissima', 'mirabilis', 'pendula', 'stellata'];
// Les premières plantes de « The Algorithmic Beauty of Plants » (Prusinkiewicz & Lindenmayer, 1990)
const ANCESTORS = [
  { rule: 'F[+F]F[-F]F', angle: 25.7, hue: 118, bend: 0, leaf: 1, flower: 1 },
  { rule: 'F[+F]F[-F][F]', angle: 20, hue: 96, bend: 1, leaf: 1, flower: 0 },
  { rule: 'FF-[-F+F+F]+[+F-F-F]', angle: 22.5, hue: 140, bend: -1, leaf: 2, flower: 2 },
];

const isBalanced = r => { let d = 0; for (const c of r) { if (c === '[') d++; else if (c === ']' && --d < 0) return false; } return d === 0; };
const mirror = r => [...r].reverse().map(c => ({ '+': '-', '-': '+', '[': ']', ']': '[' }[c] || c)).join('');
const pretty = r => r.replace(/-/g, '−');

function nameOf(g) {
  let h = 2166136261;
  for (const c of g.rule + g.angle.toFixed(1) + Math.round(g.hue)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h >>>= 0;
  return `${GENUS[h % GENUS.length]} ${SPECIES[(h >>> 8) % SPECIES.length]}`;
}

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
  // toujours au moins une mutation de forme (la règle ou l'angle), pour que chaque enfant se distingue
  if (R() < 0.62) c.rule = mutateRule(c.rule, R);
  else c.angle = clamp(c.angle + (R() < 0.5 ? -1 : 1) * (4 + R() * 10), 8, 60);
  if (R() < 0.45) {
    const r = R();
    if (r < 0.35) c.hue = (c.hue + (R() - 0.5) * 70 + 360) % 360;
    else if (r < 0.65) c.bend = clamp(c.bend + (R() - 0.5) * 4, -6, 6);
    else if (r < 0.85) c.flower = (c.flower + 1 + Math.floor(R() * 3)) % 4;
    else c.leaf = (c.leaf + 1) % 3;
  }
  return c;
}

// La tortue de Lindenmayer : F avance, + et − tournent, [ ouvre une branche, ] y revient
function growPlant(g) {
  const fPer = Math.max(1, (g.rule.match(/F/g) || []).length);
  let iter = 1;
  while (iter < 6 && Math.pow(fPer, iter + 1) <= 2600) iter++;
  let s = 'F';
  for (let i = 0; i < iter && s.length < 60000; i++) s = s.replace(/F/g, g.rule);
  const segs = [], tips = [];
  let x = 0, y = 0, a = -Math.PI / 2, depth = 0;
  const stack = [], ang = (g.angle * Math.PI) / 180, curl = (g.bend * Math.PI) / 180 * 0.35;
  let minX = 0, maxX = 0, minY = 0;
  for (const ch of s) {
    if (ch === 'F') {
      const nx = x + Math.cos(a), ny = y + Math.sin(a);
      segs.push(x, y, nx, ny, depth);
      x = nx; y = ny; a += curl;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y;
    } else if (ch === '+') a += ang;
    else if (ch === '-') a -= ang;
    else if (ch === '[') { stack.push([x, y, a, depth]); depth++; }
    else if (ch === ']') { tips.push(x, y, a, depth); [x, y, a, depth] = stack.pop(); }
  }
  tips.push(x, y, a, depth);
  return { segs: new Float32Array(segs), tips: new Float32Array(tips), minX, maxX, minY: Math.min(minY, -1), iter };
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const R = rng(1986);
  let W = api.W, H = api.H;
  let paper = null, parentCell = null, cells = [], generation = 1, specimen = 1;
  const herbier = [], motes = [];
  let pressedCell = null;

  const makeCell = (g, born = engine.t) => ({ g, plant: growPlant(g), born, name: nameOf(g), num: specimen++, ph: R() * TAU, x: 0, y: 0, w: 0, h: 0, fade: 1 });

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
    if (!motes.length) for (let i = 0; i < 40; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * TAU, sp: 4 + Math.random() * 8 });
  }
  resize(W, H);
  newGeneration(ANCESTORS[0]);

  // ——— Une planche : la plante, sa fleur, son nom latin, sa règle
  function drawPlant(ctx, c, t, box, grow = 1) {
    const p = c.plant, g = c.g;
    const bw = Math.max(1, p.maxX - p.minX), bh = -p.minY;
    const k = Math.min((box.w * 0.84) / bw, (box.h * 0.74) / bh);
    const ox = box.x + box.w / 2 - ((p.minX + p.maxX) / 2) * k, oy = box.y + box.h * 0.84;
    const sway = Math.sin(t * 1.1 + c.ph) * 0.018 + (pressedCell === c ? Math.sin(t * 18) * 0.02 : 0);
    const shear = (h) => sway * (h * h) / (bh * k);
    const n = Math.floor((p.segs.length / 5) * grow);
    // tiges : de plus en plus fines avec la profondeur
    for (let dep = 0; dep < 8; dep++) {
      ctx.strokeStyle = hsl(g.hue, 42, 30 + dep * 5, 0.95);
      ctx.lineWidth = clamp(k * 0.16 * (1 - dep * 0.14), 0.6, 3.6);
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < n; i++) {
        const j = i * 5;
        if (Math.min(7, p.segs[j + 4]) !== dep) continue;
        const h0 = -p.segs[j + 1] * k, h1 = -p.segs[j + 3] * k;
        ctx.moveTo(ox + p.segs[j] * k + shear(h0), oy + p.segs[j + 1] * k);
        ctx.lineTo(ox + p.segs[j + 2] * k + shear(h1), oy + p.segs[j + 3] * k);
        any = true;
      }
      if (any) ctx.stroke();
    }
    if (grow < 0.98) return;
    // feuilles et fleurs, au bout des branches
    const tips = p.tips, nt = tips.length / 4;
    const leafS = clamp(k * (g.leaf === 2 ? 0.9 : 0.55), 1.5, 9);
    ctx.fillStyle = hsl(g.hue + 12, 58, g.leaf === 0 ? 62 : 46, 0.9);
    ctx.beginPath();
    for (let i = 0; i < nt; i++) {
      const x = tips[i * 4], y = tips[i * 4 + 1], a = tips[i * 4 + 2];
      const sx = ox + x * k + shear(-y * k), sy = oy + y * k;
      if (g.leaf === 0) { ctx.moveTo(sx + 1.4, sy); ctx.arc(sx, sy, 1.4, 0, TAU); continue; }
      ctx.moveTo(sx, sy);
      ctx.ellipse(sx + Math.cos(a) * leafS * 0.6, sy + Math.sin(a) * leafS * 0.6, leafS * 0.7, leafS * 0.3, a, 0, TAU);
    }
    ctx.fill();
    if (g.flower) {
      const fh = (g.hue + 180) % 360, fs = clamp(k * 0.75, 2.2, 7);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < nt; i += 3) {
        const x = tips[i * 4], y = tips[i * 4 + 1];
        drawGlow(ctx, glow(hslRgb(fh, 90, 70), 16), ox + x * k + shear(-y * k), oy + y * k, fs * 2.2, 0.35);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = hsl(fh, 85, g.flower === 2 ? 78 : 66, 0.95);
      ctx.beginPath();
      for (let i = 0; i < nt; i += 3) {
        const x = tips[i * 4], y = tips[i * 4 + 1];
        const sx = ox + x * k + shear(-y * k), sy = oy + y * k;
        if (g.flower === 3) { for (let m = 0; m < 6; m++) { const a = (m / 6) * TAU + t * 0.4; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * fs, sy + Math.sin(a) * fs); } }
        else { ctx.moveTo(sx + fs * 0.6, sy); ctx.arc(sx, sy, fs * 0.6, 0, TAU); }
      }
      if (g.flower === 3) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.2; ctx.stroke(); } else ctx.fill();
    }
  }
  const hslRgb = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]; };

  function drawCard(ctx, c, t, isParent) {
    const grow = clamp((t - c.born) / 1.4, 0, 1);
    ctx.globalAlpha = c.fade;
    ctx.strokeStyle = isParent ? 'rgba(198,255,122,0.45)' : 'rgba(220,240,210,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(c.x, c.y, c.w, c.h, 10) : ctx.rect(c.x, c.y, c.w, c.h); ctx.stroke();
    if (grow > 0) drawPlant(ctx, c, t, c, grow);
    const small = c.w < 150;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillStyle = isParent ? 'rgba(198,255,122,0.75)' : 'rgba(220,240,210,0.45)';
    ctx.fillText(isParent ? `PARENT · GÉNÉRATION ${generation}` : `SPÉCIMEN N° ${c.num}`, c.x + 10, c.y + 9, c.w - 16);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'bottom';
    ctx.font = `italic 400 ${isParent ? 20 : small ? 12 : 15}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = 'rgba(240,250,235,0.85)';
    ctx.fillText(c.name, c.x + 10, c.y + c.h - (small ? 18 : 22), c.w - 16);
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
    if (!herbier.some(h => h.g.rule === c.g.rule && h.g.angle === c.g.angle && h.g.hue === c.g.hue)) {
      herbier.push(makeCell({ ...c.g }));
      if (herbier.length > 8) herbier.shift();
      audio.note(9, { type: 'glass', vel: 0.1, dur: 2 });
      api.toast({ kicker: 'Herbier', title: c.name, text: 'Pressée entre deux pages. Touche-la plus tard pour la faire revivre.', ms: 3200 });
    }
    if (herbier.length >= 3) secrets.find('herbier');
  }

  return { resize, update, draw, tap, longpress, destroy() {} };
}
