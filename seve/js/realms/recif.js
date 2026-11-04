// Sève — Le Récif de Collatz : si pair, divise par deux ; sinon, triple et ajoute un. Chaque nombre rentre à 1 (on le croit).
import { TAU, clamp, lerp, glow, drawGlow, rgba, mixRgb, hexToRgb, makeNoise, hslToRgb } from '../engine.js';

export const mood = {
  root: 82.41, scale: 'minPenta', wave: 'sine', chord: [0, 7, 12, 15], pad: 0.055, cutoff: 520, lfo: 0.025, droneOct: 1,
  noise: { type: 'lowpass', freq: 300, q: 0.7, gain: 0.02, gust: 0.6, gustRate: 0.06 },
};

const CYCLE = 120; // marée du jour et de la nuit
const next = n => (n % 2 ? 3 * n + 1 : n / 2);

// L'arbre inverse de Collatz : 1 à la racine, chaque nombre accroché à celui qu'il devient
function buildPlant(N, turnEven, turnOdd) {
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
  root.ua = 0; root.ux = 0; root.uy = 0;
  for (const n of order) {
    if (!n.parent) continue;
    n.turn = n.n % 2 === 0 ? turnEven : -turnOdd;
    n.ua = n.parent.ua + n.turn;
    n.ux = n.parent.ux + Math.sin(n.ua);
    n.uy = n.parent.uy - Math.cos(n.ua);
    minX = Math.min(minX, n.ux); maxX = Math.max(maxX, n.ux); minY = Math.min(minY, n.uy);
    maxD = Math.max(maxD, n.depth);
  }
  return { root, map, order, bbox: { minX, maxX, minY }, maxD };
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(29);
  const q = engine.quality;
  let W = api.W, H = api.H, seabed = 0;
  const plants = [
    { N: Math.round(1900 * q), e: 0.151, o: 0.279, hue: 175, k: 1 },
    { N: Math.round(520 * q), e: 0.105, o: 0.244, hue: 300, k: 0.55 },
    { N: Math.round(520 * q), e: 0.19, o: 0.33, hue: 35, k: 0.55 },
  ].map(p => ({ ...p, ...buildPlant(p.N, p.e, p.o), ph: Math.random() * TAU }));
  const main = plants[0];
  let selected = null, selT = 0, lastMelody = -9;
  const plankton = [], bubbles = [], jellies = [], sparks = [];
  let digits = '';

  function layout() {
    seabed = H - Math.max(40, H * 0.08);
    const portrait = H > W;
    const slots = portrait ? [[0.52, 0.86, 0.66], [0.16, 0.26, 0.26], [0.84, 0.26, 0.26]] : [[0.5, 0.64, 0.82], [0.17, 0.26, 0.5], [0.84, 0.26, 0.5]];
    plants.forEach((p, i) => {
      const [fx, fw, fh] = slots[i];
      const bw = p.bbox.maxX - p.bbox.minX, bh = -p.bbox.minY;
      p.L = Math.min((W * fw) / bw, ((seabed - 80) * fh) / bh);
      p.rootX = W * fx - ((p.bbox.minX + p.bbox.maxX) / 2) * p.L;
      p.rootY = seabed + 4;
    });
  }
  // couleurs et épaisseurs, regroupées une fois pour tracer vite
  for (const p of plants) {
    p.groups = new Map();
    for (const n of p.order) {
      if (!n.parent) continue;
      const band = Math.min(7, Math.floor((n.depth / (p.maxD + 1)) * 8));
      const wq = Math.min(6, Math.floor(Math.log2(n.size + 1)));
      const key = band * 10 + wq;
      let g = p.groups.get(key);
      if (!g) p.groups.set(key, (g = { band, wq, nodes: [] }));
      g.nodes.push(n);
    }
    p.tips = p.order.filter(n => n.kids.length === 0);
  }
  function resize(w, h) {
    W = w; H = h;
    layout();
    if (!plankton.length) for (let i = 0; i < Math.round(280 * q); i++) plankton.push({ x: Math.random() * W, y: Math.random() * H, lit: 0, sd: Math.random() * 100 });
  }
  resize(W, H);

  // ——— Méduses : une cloche qui bat, des tentacules en chaînes de Verlet
  function spawnJelly(x, y, r) {
    const tents = [];
    for (let k = 0; k < 6; k++) {
      const pts = [];
      for (let s = 0; s < 12; s++) pts.push({ x, y: y + s * 6, px: x, py: y + s * 6 });
      tents.push(pts);
    }
    jellies.push({ x, y, vx: 0, vy: 0, r, ph: Math.random() * TAU, hue: [190, 280, 320, 160][jellies.length % 4], tents, taps: [] });
  }
  for (let i = 0; i < 4; i++) spawnJelly(W * (0.15 + 0.7 * Math.random()), H * (0.2 + 0.4 * Math.random()), 14 + Math.random() * 12);

  function layoutPlant(p, t, day) {
    const amp = 0.0042;
    for (const n of p.order) {
      if (!n.parent) { n.a = 0; n.x = p.rootX; n.y = p.rootY; continue; }
      const s = Math.sin(t * 0.55 - n.depth * 0.08 + p.ph) * amp + noise.n2(n.depth * 0.05, t * 0.1 + p.ph) * amp * 0.6;
      n.a = n.parent.a + n.turn + s;
      n.x = n.parent.x + Math.sin(n.a) * p.L;
      n.y = n.parent.y - Math.cos(n.a) * p.L;
    }
  }

  function update(dt, t) {
    const day = 0.5 + 0.5 * Math.sin((t / CYCLE) * TAU);
    for (const p of plants) layoutPlant(p, t, day);
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
      const v = [0.3, 0.62, 0.78][(Math.random() * 3) | 0];
      bubbles.push({ x: W * v + (Math.random() - 0.5) * 10, y: seabed, r: 1.4 + Math.random() * 3, vy: 35 + Math.random() * 40, ph: Math.random() * TAU });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(t * 3 + b.ph) * 14 * dt;
      if (b.y < -10) bubbles.splice(i, 1);
    }
    for (const j of jellies) {
      j.ph += dt * 1.5;
      const c = Math.pow(Math.max(0, Math.sin(j.ph)), 2);
      j.vy -= c * 34 * dt;
      j.vy += 7 * dt;
      j.vx += noise.n2(j.x * 0.003, t * 0.1 + j.hue) * 12 * dt;
      if (input.inside) {
        const dx = input.x - j.x, dy = input.y - j.y, d = Math.hypot(dx, dy);
        if (d < 300 && d > 30) { j.vx += (dx / d) * 6 * dt; j.vy += (dy / d) * 6 * dt; }
      }
      j.vx *= Math.pow(0.6, dt); j.vy *= Math.pow(0.6, dt);
      j.x += j.vx * dt; j.y += j.vy * dt;
      if (j.y < 40) j.vy += 30 * dt;
      if (j.y > seabed - 60) j.vy -= 30 * dt;
      if (j.x < -20) j.x = W + 20; if (j.x > W + 20) j.x = -20;
      // tentacules : la tête suit la cloche, le reste suit la tête
      j.tents.forEach((pts, k) => {
        const a = Math.PI * (0.15 + 0.7 * (k / 5));
        const rimR = j.r * (1 - 0.18 * c);
        pts[0].x = j.x + Math.cos(Math.PI - a) * rimR * 0.85;
        pts[0].y = j.y + 2;
        for (let s = 1; s < pts.length; s++) {
          const p = pts[s];
          const vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
          p.px = p.x; p.py = p.y;
          p.x += vx + Math.sin(t * 2 + s * 0.6 + k) * 0.15;
          p.y += vy + 14 * dt * dt * 60;
        }
        for (let it = 0; it < 3; it++) {
          for (let s = 1; s < pts.length; s++) {
            const a0 = pts[s - 1], b0 = pts[s];
            const dx = b0.x - a0.x, dy = b0.y - a0.y, d = Math.hypot(dx, dy) || 1, diff = (d - 6) / d;
            if (s > 1) { a0.x += dx * diff * 0.5; a0.y += dy * diff * 0.5; b0.x -= dx * diff * 0.5; b0.y -= dy * diff * 0.5; }
            else { b0.x -= dx * diff; b0.y -= dy * diff; }
          }
        }
      });
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

    // fond de sable
    ctx.fillStyle = rgba(mixRgb([6, 12, 18], [16, 30, 40], day));
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16) ctx.lineTo(x, seabed + noise.n2(x * 0.006, 1) * 10);
    ctx.lineTo(W, H);
    ctx.fill();

    for (const p of plants) drawPlant(ctx, p, t, night);
    if (selected) drawPath(ctx, t);

    // méduses
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

  function drawPlant(ctx, p, t, night) {
    for (const g of p.groups.values()) {
      const k = g.band / 7;
      const c = hslToRgb(p.hue + k * 40 - 20, 55 + k * 25, 18 + k * 42);
      ctx.strokeStyle = rgba(c, 0.85);
      ctx.lineWidth = Math.max(0.6, (0.45 + g.wq * 0.5) * p.k * (p.L / 4 + 0.5));
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const n of g.nodes) { ctx.moveTo(n.parent.x, n.parent.y); ctx.lineTo(n.x, n.y); }
      ctx.stroke();
    }
    // polypes au bout des branches : ils luisent davantage la nuit
    ctx.globalCompositeOperation = 'lighter';
    const sp = glow(hslToRgb(p.hue + 30, 90, 70).map(Math.round), 12);
    const step = p.tips.length > 900 ? 2 : 1;
    for (let i = 0; i < p.tips.length; i += step) {
      const n = p.tips[i];
      drawGlow(ctx, sp, n.x, n.y, 2.4 + night * 1.5, 0.25 + night * 0.45);
    }
    // 27 et 42 scintillent, pour qui sait regarder
    if (p === main) {
      for (const num of [27, 42]) {
        const n = p.map.get(num);
        if (!n) continue;
        const tw = Math.pow(Math.max(0, Math.sin(t * 2.3 + num)), 8);
        drawGlow(ctx, glow([255, 220, 140], 16), n.x, n.y, 7, 0.15 + tw * 0.85);
      }
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

  function drawJelly(ctx, j, t, night) {
    const c = Math.pow(Math.max(0, Math.sin(j.ph)), 2);
    const col = hslToRgb(j.hue, 80, 70);
    ctx.strokeStyle = rgba(col, 0.35 + night * 0.25);
    ctx.lineWidth = 1;
    for (const pts of j.tents) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    const rw = j.r * (1 - 0.18 * c), rh = j.r * (0.78 + 0.28 * c);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow(col.map(Math.round), 32), j.x, j.y - rh * 0.4, j.r * 3, 0.18 + night * 0.25);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(j.x, j.y - rh * 0.6, 1, j.x, j.y - rh * 0.3, j.r);
    g.addColorStop(0, rgba([255, 255, 255], 0.55));
    g.addColorStop(1, rgba(col, 0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(j.x - rw, j.y);
    ctx.quadraticCurveTo(j.x - rw, j.y - rh * 1.25, j.x, j.y - rh * 1.25);
    ctx.quadraticCurveTo(j.x + rw, j.y - rh * 1.25, j.x + rw, j.y);
    ctx.quadraticCurveTo(j.x, j.y - rh * 0.25, j.x - rw, j.y);
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.6);
    ctx.stroke();
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
  function tap(p) {
    const t = engine.t;
    for (const j of jellies) {
      if (Math.hypot(p.x - j.x, p.y - (j.y - j.r * 0.5)) < j.r * 1.6) {
        j.taps = j.taps.filter(x => t - x < 3);
        j.taps.push(t);
        j.vy -= 40;
        audio.note(9 + j.taps.length, { type: 'glass', vel: 0.1, dur: 1.6 });
        if (j.taps.length >= 3 && jellies.length < 12) {
          j.taps = [];
          spawnJelly(j.x + 10, j.y + 10, j.r * 0.55);
          for (let k = 0; k < 14; k++) { const a = Math.random() * TAU; sparks.push({ x: j.x, y: j.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, c: hslToRgb(j.hue, 80, 75).map(Math.round), age: 0, life: 1 }); }
          secrets.find('meduse');
        }
        return;
      }
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
      const n = main.map.get(+digits) || plants[1].map.get(+digits) || plants[2].map.get(+digits);
      if (n) select(n);
      else api.toast({ kicker: 'Hors du récif', title: (+digits).toLocaleString('fr-FR'), text: `Ce nombre ne pousse pas dans ce récif-ci. Il rentre pourtant à 1, lui aussi, en ${(() => { let x = +digits, s = 0; while (x !== 1 && s < 2000) { x = next(x); s++; } return s; })()} étapes.`, ms: 5000 });
      digits = '';
    }
  }

  return { resize, update, draw, move, tap, key, destroy() {} };
}
