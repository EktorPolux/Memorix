// Sève — Le Musée des Cadres Impossibles : neuf chefs-d'œuvre refaits en code, « à la manière de »,
// et rangés partout sauf dans un cadre. Une bulle de savon, une tasse de café, une loupe, un gramophone,
// un éventail, un trou de serrure, une roue de bicyclette, un cerf-volant, un œil.
import { TAU, clamp, lerp, rng, glow, drawGlow, makeCanvas, angleDiff, easeOutBack, easeInOut } from '../engine.js';

export const mood = {
  root: 261.63, scale: 'lydian', wave: 'sine', chord: [0, 7, 16], pad: 0.028, cutoff: 1000, lfo: 0.025,
  noise: { type: 'lowpass', freq: 320, q: 0.5, gain: 0.005, gust: 0.3, gustRate: 0.03 },
  motif: { every: [8, 15], type: 'glass', vel: 0.022, oct: 1 },
};

const SERIF = '"Cormorant Garamond", Georgia, serif';
const MONO = '"DM Mono", ui-monospace, monospace';

const ROOMS = [
  { id: 'mondrian', short: 'Mondrian', artist: 'Piet Mondrian', life: '1872–1944', title: 'Composition II en rouge, bleu et jaune', year: '1930', ici: 'dans une bulle de savon',
    note: "Les petits carrés qui filent sur les lignes viennent d'un autre tableau, Broadway Boogie Woogie (1942–1943) : ils ont fugué. Touche la bulle.", wall: [38, 42, 52], deg: 0 },
  { id: 'vangogh', short: 'Van Gogh', artist: 'Vincent van Gogh', life: '1853–1890', title: 'La Nuit étoilée', year: '1889', ici: "dans une tasse de café, vue d'en haut",
    note: 'Remue le café : le ciel tourbillonne. Des physiciens ont mesuré ses tourbillons, ils suivent les lois de la turbulence.', wall: [28, 40, 56], deg: 2 },
  { id: 'seurat', short: 'Seurat', artist: 'Georges Seurat', life: '1859–1891', title: "Un dimanche après-midi à l'Île de la Grande Jatte", year: '1884–1886', ici: 'sous une loupe',
    note: 'De loin, un dimanche. De près, des points. Seurat appelait cela le chromo-luminarisme. Promène la loupe : chaque point a sa note.', wall: [44, 50, 38], deg: 4 },
  { id: 'kandinsky', short: 'Kandinsky', artist: 'Vassily Kandinsky', life: '1866–1944', title: 'Plusieurs cercles', year: '1926', ici: "dans le pavillon d'un gramophone",
    note: 'Kandinsky disait entendre les couleurs. Touche un cercle : il chante. Touche le pavillon : ils chantent tous.', wall: [42, 34, 52], deg: 1 },
  { id: 'hokusai', short: 'Hokusai', artist: 'Katsushika Hokusai', life: '1760–1849', title: 'La Grande Vague de Kanagawa', year: 'vers 1831', ici: 'sur un éventail',
    note: "Le mont Fuji, minuscule, attend au creux de la vague. Touche l'éventail : il se ferme, la mer reprend son souffle.", wall: [52, 42, 32], deg: 5 },
  { id: 'klint', short: 'af Klint', artist: 'Hilma af Klint', life: '1862–1944', title: 'Les Dix Plus Grands', year: '1907', ici: 'derrière une porte, par le trou de la serrure',
    note: "Elle voulait qu'on attende vingt ans après sa mort pour montrer ces toiles. Alors on regarde en cachette. Approche-toi, touche la serrure.", wall: [44, 36, 48], deg: 3 },
  { id: 'delaunay', short: 'Delaunay', artist: 'Robert Delaunay', life: '1885–1941', title: 'Le Premier Disque', year: '1912–1913', ici: 'dans la Roue de bicyclette de Marcel Duchamp',
    note: 'Deux couleurs voisines se disputent, et leur dispute fait la lumière : le contraste simultané. Fais tourner la roue.', wall: [48, 43, 38], deg: 6 },
  { id: 'matisse', short: 'Matisse', artist: 'Henri Matisse', life: '1869–1954', title: 'Polynésie, la mer', year: '1946', ici: 'sur un cerf-volant',
    note: 'Trop malade pour peindre, Matisse découpait du papier gouaché. Ses oiseaux et ses algues volent mieux en cerf-volant. Souffle dessus.', wall: [30, 44, 54], deg: 7 },
  { id: 'op', short: 'Op art', artist: "L'art optique", life: 'années 1960', title: 'À la manière de…', year: '', ici: "dans l'iris d'un œil",
    note: "Rien ne bouge, et pourtant tout tremble : c'est l'œil qui fabrique le mouvement. Ici, il se regarde regarder. Touche-le.", wall: [36, 36, 42], deg: 9 },
];
const N = ROOMS.length;
const seen = new Set(); // les salles visitées, tant que la page vit

const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgbA = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const jit = (r, c, a) => [c[0] + (r() - 0.5) * a, c[1] + (r() - 0.5) * a, c[2] + (r() - 0.5) * a];
function rrect(ctx, x, y, w, h, rad) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h); }
function wrap(ctx, text, maxW) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
const hueOf = c => {
  const [r, g, b] = c.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return -1;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

export function create(api) {
  const { audio, secrets, input, engine, noise } = api;
  const q = engine.quality;
  let W = api.W, H = api.H;
  let cur = 0, camX = 0, drag = null, lastLabel = '', labelT = 0, settled = false, magritte = null;
  const cartels = new Map();

  // ——— La barre : salle précédente, plan, salle suivante
  const bar = document.createElement('div');
  bar.className = 'realm-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Le Musée des Cadres Impossibles');
  const mk = (label, aria, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.style.fontSize = '15px'; b.addEventListener('click', fn); bar.append(b); return b; };
  const prevBtn = mk('‹', 'Salle précédente', () => goRoom(cur - 1));
  const info = document.createElement('span');
  info.className = 'count';
  info.setAttribute('aria-live', 'polite');
  bar.append(info);
  const nextBtn = mk('›', 'Salle suivante', () => goRoom(cur + 1));
  document.getElementById('ui').append(bar);
  const fontsReady = () => cartels.clear();
  document.fonts?.ready?.then(fontsReady);

  function goRoom(i) {
    i = clamp(i, 0, N - 1);
    if (i === cur) return;
    cur = i;
    settled = false;
    audio.noise({ freq: 500, q: 0.6, dur: 0.5, vel: 0.025, type: 'lowpass', send: 0.5 });
  }
  function updateBar() {
    info.textContent = `${cur + 1} / ${N} · ${ROOMS[cur].short}`;
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === N - 1;
    prevBtn.style.opacity = cur === 0 ? 0.35 : 1;
    nextBtn.style.opacity = cur === N - 1 ? 0.35 : 1;
  }
  // le musée se souvient de la salle où tu étais
  {
    const saved = api.memory?.get('galerie');
    if (saved && Number.isFinite(saved.room)) { cur = clamp(saved.room | 0, 0, N - 1); camX = cur * W; }
  }
  updateBar();

  // ——— Géométrie d'une salle : un mur, un sol, une œuvre, un cartel
  const portrait = () => W < H * 0.9;
  function layout(i) {
    const ox = i * W - camX;
    const P = portrait();
    const floorY = Math.round(H * (P ? 0.8 : 0.79));
    if (P) {
      const top = 66 + cartel(i, { P: true }).h + 20;
      const S = Math.min(W * 0.8, (floorY - top) * 0.8);
      return { i, ox, P, floorY, S, cx: ox + W / 2, cy: top + (floorY - top) * 0.45 };
    }
    const S = Math.min(W * 0.42, floorY * 0.64);
    return { i, ox, P, floorY, S, cx: ox + W * 0.43, cy: floorY * 0.53 };
  }

  // Le cartel : petite carte crème, pré-rendue à la bonne résolution
  function cartel(i, L) {
    const dpr = Math.min(2, engine.dpr || 1);
    const w = L.P ? Math.min(W - 32, 380) : Math.max(150, Math.min(250, W - (L.cx - L.ox + L.S * 0.6 + 28) - 18));
    const key = `${i}|${w}|${dpr}|${L.P}`;
    if (cartels.has(key)) return cartels.get(key);
    const R = ROOMS[i], pad = L.P ? 13 : 16, inner = w - pad * 2;
    const m = makeCanvas(1, 1).getContext('2d');
    const titleFont = `italic 400 ${L.P ? 17 : 19}px ${SERIF}`, noteFont = `400 ${L.P ? 13.5 : 14}px ${SERIF}`;
    m.font = titleFont;
    const tl = wrap(m, `« ${R.title} »${R.year ? ', ' + R.year : ''}`, inner);
    m.font = noteFont;
    const ici = wrap(m, `Ici : ${R.ici}.`, inner);
    const nl = L.P ? [] : wrap(m, R.note, inner);
    const lhT = L.P ? 19 : 21, lhN = 17;
    const h = pad + 13 + 8 + tl.length * lhT + 6 + ici.length * lhN + (nl.length ? 10 + nl.length * lhN : 0) + pad - 2;
    const c = makeCanvas(w * dpr, h * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    rrect(g, 3, 4, w - 3, h - 4, 3); g.fill();
    g.fillStyle = '#efe9dc';
    rrect(g, 0, 0, w - 3, h - 4, 3); g.fill();
    let y = pad;
    g.textBaseline = 'top';
    g.fillStyle = '#5b5348';
    g.font = `400 9px ${MONO}`;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(`${R.artist} (${R.life})`.toUpperCase(), pad, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    y += 13 + 8;
    g.fillStyle = '#1d1a16';
    g.font = titleFont;
    for (const l of tl) { g.fillText(l, pad, y); y += lhT; }
    y += 6;
    g.fillStyle = '#7a4e22';
    g.font = noteFont;
    for (const l of ici) { g.fillText(l, pad, y); y += lhN; }
    if (nl.length) {
      y += 10;
      g.fillStyle = '#4a443b';
      for (const l of nl) { g.fillText(l, pad, y); y += lhN; }
    }
    const out = { c, w: w - 3, h: h - 4 };
    cartels.set(key, out);
    return out;
  }

  // Grain du mur : une seule petite texture répétée
  const grain = makeCanvas(128, 128);
  {
    const g = grain.getContext('2d'), im = g.createImageData(128, 128), d = im.data;
    const r = rng(41);
    for (let i = 0; i < d.length; i += 4) { const v = r() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 14; }
    g.putImageData(im, 0, 0);
  }
  let grainPat = null;

  function drawRoomShell(ctx, L, t) {
    const R = ROOMS[L.i], { ox, floorY, cx, cy, S } = L;
    // le mur : sa couleur, plus claire là où tombe la lumière
    const wg = ctx.createLinearGradient(0, 0, 0, floorY);
    wg.addColorStop(0, rgb(shade(R.wall, 0.55)));
    wg.addColorStop(0.55, rgb(R.wall));
    wg.addColorStop(1, rgb(shade(R.wall, 0.8)));
    ctx.fillStyle = wg;
    ctx.fillRect(ox, 0, W + 1, floorY);
    if (!grainPat) grainPat = ctx.createPattern(grain, 'repeat');
    ctx.save();
    ctx.translate(ox, 0);
    ctx.fillStyle = grainPat;
    ctx.fillRect(0, 0, W + 1, floorY);
    ctx.restore();
    // la flaque de lumière du projecteur
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(cx, cy - S * 0.05, S * 0.1, cx, cy, S * 0.95);
    lg.addColorStop(0, 'rgba(255,236,205,0.16)');
    lg.addColorStop(1, 'rgba(255,236,205,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(ox, 0, W + 1, floorY);
    // le faisceau, depuis le rail du plafond
    const fx = cx + (L.P ? 0 : -S * 0.25);
    const cg = ctx.createLinearGradient(0, 0, 0, cy + S * 0.4);
    cg.addColorStop(0, 'rgba(255,240,215,0.09)');
    cg.addColorStop(1, 'rgba(255,240,215,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(fx - 8, 14); ctx.lineTo(fx + 8, 14);
    ctx.lineTo(cx + S * 0.62, cy + S * 0.4); ctx.lineTo(cx - S * 0.62, cy + S * 0.4);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // le rail et le projecteur
    ctx.fillStyle = 'rgba(10,10,12,0.8)';
    ctx.fillRect(ox, 4, W + 1, 3);
    ctx.fillStyle = '#16161a';
    rrect(ctx, fx - 9, 6, 18, 12, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.85)';
    ctx.beginPath(); ctx.ellipse(fx, 18, 6, 2, 0, 0, TAU); ctx.fill();
    // le sol : un parquet sombre qui fuit vers le mur
    const fg = ctx.createLinearGradient(0, floorY, 0, H);
    fg.addColorStop(0, '#1b1511');
    fg.addColorStop(1, '#0b0907');
    ctx.fillStyle = fg;
    ctx.fillRect(ox, floorY, W + 1, H - floorY);
    ctx.strokeStyle = 'rgba(255,220,180,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const vx = ox + W / 2;
    for (let k = -14; k <= 14; k++) { const x0 = vx + k * W / 14; ctx.moveTo(x0, floorY); ctx.lineTo(vx + k * W / 14 * 2.2, H); }
    for (let k = 1; k < 7; k++) { const y = floorY + (H - floorY) * Math.pow(k / 7, 1.7); ctx.moveTo(ox, y); ctx.lineTo(ox + W + 1, y); }
    ctx.stroke();
    const pg = ctx.createRadialGradient(cx, floorY + 10, 4, cx, floorY + 10, S * 0.7);
    pg.addColorStop(0, 'rgba(255,225,185,0.12)');
    pg.addColorStop(1, 'rgba(255,225,185,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(ox, floorY, W + 1, H - floorY);
    // la plinthe
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox, floorY - 7, W + 1, 7);
    ctx.fillStyle = 'rgba(255,240,220,0.08)';
    ctx.fillRect(ox, floorY - 7, W + 1, 1);
    // le pilastre entre deux salles
    if (L.i > 0) {
      const pgx = ctx.createLinearGradient(ox - 12, 0, ox + 12, 0);
      pgx.addColorStop(0, 'rgba(0,0,0,0.5)');
      pgx.addColorStop(0.45, 'rgba(200,190,175,0.16)');
      pgx.addColorStop(0.55, 'rgba(200,190,175,0.1)');
      pgx.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = pgx;
      ctx.fillRect(ox - 12, 0, 24, floorY);
    }
  }

  function drawCartel(ctx, L) {
    const c = cartel(L.i, L);
    let x, y;
    if (L.P) { x = L.cx - c.w / 2; y = 66; } else { x = L.cx + L.S * 0.6 + 28; y = clamp(L.cy + L.S * 0.02, 70, L.floorY - c.h - 24); }
    ctx.drawImage(c.c, x, y, c.w + 3, c.h + 4);
    if (L.P) {
      // en portrait, la note du conservateur est écrite au sol, devant l'œuvre
      ctx.font = `italic 400 13.5px ${SERIF}`;
      ctx.fillStyle = 'rgba(240,230,215,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const lines = wrap(ctx, ROOMS[L.i].note, Math.min(W - 40, 360));
      const lh = 16, y0 = L.floorY + 14;
      const room = H - 82 - y0;
      lines.slice(0, Math.max(1, Math.floor(room / lh))).forEach((l, k) => ctx.fillText(l, L.cx, y0 + k * lh));
      ctx.textAlign = 'left';
    }
  }

  // ═════════════════════════ Salle I · Mondrian, dans une bulle de savon
  function makeMondrian() {
    let r = rng(1930), tree = null, rects = [], lines = [];
    const cars = [], drops = [];
    const b = { x: 0, y: 0, vx: 0, vy: 0, pop: -1, wob: 0 };
    const PAL = ['#f1eee4', '#d42a2a', '#1d4f9e', '#f2c41c', '#161616', '#e3e0d6'];
    function build(x0, y0, x1, y1, d) {
      const w = x1 - x0, h = y1 - y0;
      if (d >= 4 || (w < 0.45 && h < 0.45) || (d >= 2 && r() < 0.28)) return { leaf: true, col: 0 };
      const vert = w > h * 1.15 ? true : h > w * 1.15 ? false : r() < 0.5;
      const n = { vert, k: r.range(0.3, 0.7), ph: r() * TAU, amp: r.range(0.012, 0.035) };
      const s = vert ? x0 + w * n.k : y0 + h * n.k;
      n.a = vert ? build(x0, y0, s, y1, d + 1) : build(x0, y0, x1, s, d + 1);
      n.b = vert ? build(s, y0, x1, y1, d + 1) : build(x0, s, x1, y1, d + 1);
      return n;
    }
    function walk(n, x0, y0, x1, y1, t) {
      if (n.leaf) { rects.push([x0, y0, x1, y1, n]); return; }
      const k = n.k + Math.sin(t * 0.33 + n.ph) * n.amp;
      if (n.vert) { const s = x0 + (x1 - x0) * k; lines.push([s, y0, s, y1]); walk(n.a, x0, y0, s, y1, t); walk(n.b, s, y0, x1, y1, t); }
      else { const s = y0 + (y1 - y0) * k; lines.push([x0, s, x1, s]); walk(n.a, x0, y0, x1, s, t); walk(n.b, x0, s, x1, y1, t); }
    }
    function compose(seed) {
      r = rng(seed);
      tree = build(-1, -1, 1, 1, 0);
      rects = []; lines = [];
      walk(tree, -1, -1, 1, 1, 0);
      // comme en 1930 : un grand rouge, un petit bleu en bas à gauche, un petit jaune en bas à droite
      const leaves = rects.map(([x0, y0, x1, y1, n]) => ({ n, a: (x1 - x0) * (y1 - y0), x: (x0 + x1) / 2, y: (y0 + y1) / 2 }));
      leaves.sort((p, q2) => q2.a - p.a);
      leaves[0].n.col = 1;
      const rest = leaves.slice(1);
      const by = (f) => rest.filter(l => l.n.col === 0).sort((p, q2) => f(p) - f(q2))[0];
      const bl = by(l => l.x + (1 - l.y) + l.a * 2); if (bl) bl.n.col = 2;
      const yl = by(l => -l.x + (1 - l.y) + l.a * 3); if (yl) yl.n.col = 3;
      if (r() < 0.6) { const g = by(l => l.a + r() * 0.4); if (g) g.n.col = r() < 0.5 ? 4 : 5; }
      cars.length = 0;
      for (let k = 0; k < 9; k++) cars.push({ li: Math.floor(r() * 40), u: r(), v: r.range(0.16, 0.34) * r.sign(), col: [1, 2, 3, 3, 5][k % 5] });
    }
    compose(1930);
    const warp = (ux, uy) => { const d = Math.hypot(ux, uy), k = d < 1 ? 1.32 - 0.32 * d * d : 1 / d; return [ux * k, uy * k]; };
    let BX = 0, BY = 0, BR = 1;
    const P = (ctx, ux, uy, first) => { const [wx, wy] = warp(ux, uy); if (first) ctx.moveTo(BX + wx * BR, BY + wy * BR); else ctx.lineTo(BX + wx * BR, BY + wy * BR); };
    function warpedRect(ctx, x0, y0, x1, y1) {
      const n = 6;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) P(ctx, lerp(x0, x1, i / n), y0, i === 0);
      for (let i = 1; i <= n; i++) P(ctx, x1, lerp(y0, y1, i / n));
      for (let i = 1; i <= n; i++) P(ctx, lerp(x1, x0, i / n), y1);
      for (let i = 1; i < n; i++) P(ctx, x0, lerp(y1, y0, i / n));
      ctx.closePath();
    }
    const geo = L => ({ x: L.cx + b.x, y: L.cy + b.y, R: L.S * 0.44 });
    return {
      hit(x, y, L) { const g = geo(L); return b.pop < 0 && Math.hypot(x - g.x, y - g.y) < g.R; },
      update(dt, t, L) {
        // la bulle flotte, revient à sa place, fuit la main qui passe vite
        const g = geo(L);
        let fx = -b.x * 3 + Math.sin(t * 0.7) * 6, fy = -b.y * 3 + Math.cos(t * 0.53) * 8;
        if (input.inside) {
          const dx = g.x - input.x, dy = g.y - input.y, d = Math.hypot(dx, dy), sp = Math.hypot(input.vx, input.vy);
          if (d < g.R * 1.7 && sp > 80) { const k = Math.min(1, sp / 900) * 900 * (1 - d / (g.R * 1.7)); fx += (dx / (d || 1)) * k; fy += (dy / (d || 1)) * k; b.wob = Math.min(1, b.wob + dt * 3); }
        }
        b.vx += (fx - b.vx * 1.8) * dt; b.vy += (fy - b.vy * 1.8) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.x = clamp(b.x, -L.S * 0.3, L.S * 0.3); b.y = clamp(b.y, -L.S * 0.25, L.S * 0.25);
        b.wob = Math.max(0, b.wob - dt * 0.8);
        if (b.pop >= 0) {
          const before = b.pop;
          b.pop += dt;
          if (before < 0.3 && b.pop >= 0.3) compose(Math.floor(Math.random() * 1e9));
          if (b.pop > 1.3) b.pop = -1;
        }
        for (const c of cars) {
          c.u += (c.v * dt) / 1.2;
          if (c.u > 1 || c.u < 0) { c.li = Math.floor(Math.random() * 40); c.u = c.v > 0 ? 0 : 1; }
        }
        for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.age += dt; d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.age > 1.1) drops.splice(i, 1); }
      },
      draw(ctx, L, t) {
        const g = geo(L);
        // les gouttelettes de la bulle crevée
        for (const d of drops) { ctx.fillStyle = `hsla(${d.h},80%,80%,${0.7 * (1 - d.age / 1.1)})`; ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, TAU); ctx.fill(); }
        let grow = 1;
        if (b.pop >= 0) { if (b.pop < 0.3) return; grow = easeOutBack(clamp((b.pop - 0.3) / 1, 0, 1)); }
        BX = g.x; BY = g.y; BR = g.R * grow;
        rects = []; lines = [];
        walk(tree, -1, -1, 1, 1, t);
        // l'ombre de la bulle sur le mur
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath(); ctx.ellipse(BX + BR * 0.12, BY + BR * 0.16, BR, BR, 0, 0, TAU); ctx.fill();
        // le contour qui tremble
        ctx.save();
        ctx.beginPath();
        const wb = 0.012 + b.wob * 0.03;
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * TAU, rr = BR * (1 + wb * Math.sin(3 * a + t * 2.1) + wb * 0.7 * Math.sin(5 * a - t * 3.3));
          const x = BX + Math.cos(a) * rr, y = BY + Math.sin(a) * rr;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = 0.93;
        for (const [x0, y0, x1, y1, n] of rects) { ctx.fillStyle = PAL[n.col]; warpedRect(ctx, x0, y0, x1, y1); ctx.fill(); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#121212';
        ctx.lineWidth = Math.max(2.5, BR * 0.05);
        ctx.lineCap = 'square';
        for (const [x0, y0, x1, y1] of lines) {
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) P(ctx, lerp(x0, x1, i / 10), lerp(y0, y1, i / 10), i === 0);
          ctx.stroke();
        }
        // les petits carrés en fugue, venus de Broadway
        const cs = Math.max(4, BR * 0.055);
        for (const c of cars) {
          const l = lines[c.li % Math.max(1, lines.length)];
          if (!l) continue;
          const [wx, wy] = warp(lerp(l[0], l[2], c.u), lerp(l[1], l[3], c.u));
          ctx.fillStyle = PAL[c.col];
          ctx.fillRect(BX + wx * BR - cs / 2, BY + wy * BR - cs / 2, cs, cs);
        }
        // le film de savon : des irisations qui tournent
        ctx.globalCompositeOperation = 'screen';
        for (let k = 0; k < 3; k++) {
          const a = t * (0.3 + k * 0.17) + k * 2.1;
          drawGlow(ctx, glow(k === 0 ? [255, 120, 220] : k === 1 ? [120, 255, 210] : [255, 220, 120], 64), BX + Math.cos(a) * BR * 0.5, BY + Math.sin(a * 1.3) * BR * 0.5, BR * 0.7, 0.16);
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = BR * 0.09;
        for (let k = 0; k < 24; k++) {
          const a0 = (k / 24) * TAU, hue = (k * 37 + t * 50 + 120 * Math.sin(a0 * 2 + t * 0.6)) % 360;
          ctx.strokeStyle = `hsla(${hue},95%,62%,0.32)`;
          ctx.beginPath(); ctx.arc(BX, BY, BR * 0.955, a0, a0 + TAU / 24 + 0.02); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        const sg = ctx.createRadialGradient(BX - BR * 0.3, BY - BR * 0.35, BR * 0.05, BX, BY, BR * 1.02);
        sg.addColorStop(0, 'rgba(255,255,255,0.22)');
        sg.addColorStop(0.45, 'rgba(255,255,255,0)');
        sg.addColorStop(0.85, 'rgba(0,0,20,0.08)');
        sg.addColorStop(1, 'rgba(0,0,20,0.3)');
        ctx.fillStyle = sg;
        ctx.fillRect(BX - BR, BY - BR, BR * 2, BR * 2);
        ctx.restore();
        // reflets : une fenêtre, un point
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineCap = 'round';
        ctx.lineWidth = BR * 0.06;
        ctx.beginPath(); ctx.arc(BX, BY, BR * 0.8, -2.55, -1.95); ctx.stroke();
        ctx.lineWidth = BR * 0.035;
        ctx.beginPath(); ctx.arc(BX, BY, BR * 0.8, -1.85, -1.7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(BX + BR * 0.48, BY + BR * 0.52, BR * 0.035, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(BX, BY, BR, 0, TAU); ctx.stroke();
        ctx.lineCap = 'butt';
      },
      tap(x, y, L) {
        const g = geo(L);
        if (b.pop >= 0 || Math.hypot(x - g.x, y - g.y) > g.R) return false;
        b.pop = 0;
        for (let k = 0; k < 34; k++) {
          const a = Math.random() * TAU, sp = 120 + Math.random() * 220;
          drops.push({ x: g.x + Math.cos(a) * g.R, y: g.y + Math.sin(a) * g.R, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, s: 1 + Math.random() * 2.2, h: Math.random() * 360, age: 0 });
        }
        audio.noise({ freq: 2600, q: 0.8, dur: 0.07, vel: 0.14, type: 'bandpass', send: 0.2 });
        [0, 2, 4].forEach((d, k) => audio.note(d + 7, { type: 'bell', vel: 0.08, dur: 2.2, at: 0.35 + k * 0.12, pan: (k - 1) * 0.4 }));
        return true;
      },
    };
  }

  // ═════════════════════════ Salle II · Van Gogh, dans une tasse de café
  function makeVanGogh() {
    const PS = q < 0.85 ? 220 : 270;
    let pc = null, pctx = null;
    const r = rng(1889);
    const STARS = [[0.1, 0.13, 0.034], [0.27, 0.07, 0.03], [0.41, 0.16, 0.028], [0.56, 0.09, 0.027], [0.69, 0.2, 0.032], [0.62, 0.48, 0.033], [0.31, 0.5, 0.03], [0.91, 0.36, 0.029], [0.77, 0.44, 0.024]];
    const MOON = [0.86, 0.12, 0.068];
    const VORTS = [[0.47, 0.33, 1.4, 0.014], [0.64, 0.37, -1.1, 0.008], [0.29, 0.31, 0.8, 0.01]];
    const hill = u => 0.65 + 0.035 * Math.sin(u * 6 + 0.5) + 0.025 * Math.sin(u * 13);
    const cypress = (u, v) => {
      if (v < 0.05) return false;
      const c = 0.15 + 0.022 * Math.sin(v * 9), w = 0.012 + 0.105 * Math.pow((v - 0.05) / 0.95, 0.7) * (0.82 + 0.18 * Math.sin(v * 31));
      return Math.abs(u - c) < w;
    };
    const C = {
      deep: [[22, 40, 98], [30, 56, 122], [18, 34, 84]],
      sky: [[44, 82, 154], [58, 100, 168], [72, 118, 182], [36, 68, 138]],
      streak: [[150, 182, 212], [192, 212, 222], [122, 162, 202], [214, 222, 186]],
      star: [[252, 238, 150], [242, 212, 92], [255, 249, 205]],
      halo: [[152, 192, 212], [206, 214, 150], [112, 152, 192]],
      moonHalo: [[230, 210, 120], [210, 200, 140], [180, 190, 160]],
      hills: [[30, 52, 102], [42, 72, 112], [28, 62, 82]],
      village: [[24, 40, 72], [36, 56, 96], [20, 30, 56], [52, 62, 82]],
      cypress: [[30, 30, 18], [48, 46, 22], [26, 40, 30], [70, 56, 28]],
    };
    function colorAt(u, v) {
      if (cypress(u, v)) return pick(r, C.cypress);
      const dm = Math.hypot(u - MOON[0], v - MOON[1]);
      if (dm < MOON[2]) return dm < MOON[2] * 0.7 ? [252, 228, 118] : [240, 188, 78];
      if (dm < MOON[2] * 1.9) return pick(r, C.moonHalo);
      for (const [sx, sy, sr] of STARS) {
        const d = Math.hypot(u - sx, v - sy);
        if (d < sr) return pick(r, C.star);
        if (d < sr * 2) return pick(r, C.halo);
      }
      const h = hill(u);
      if (v > h + 0.05 || (Math.abs(u - 0.55) < 0.01 * (v - 0.55) / 0.12 && v > 0.55)) return r() < 0.06 ? [238, 202, 92] : pick(r, C.village);
      if (v > h) return pick(r, C.hills);
      const dx = u - 0.5, dy = (v - 0.34) * 1.5, d = Math.hypot(dx, dy);
      if (Math.abs(d - 0.12) < 0.028 || Math.abs(d - 0.21) < 0.018 || Math.abs(v - (0.27 + 0.05 * Math.sin(u * 7))) < 0.02) return pick(r, C.streak);
      return v < 0.24 ? pick(r, C.deep) : pick(r, C.sky);
    }
    const n = Math.round(380 * q);
    const parts = [];
    const spawn = p => { p.u = r(); p.v = r(); p.c = rgbA(jit(r, colorAt(p.u, p.v), 16), 0.92); p.life = r.range(0.5, 2); return p; };
    for (let i = 0; i < n; i++) parts.push(spawn({}));
    let rot = 0, stirW = 0, stirImp = 0, stirring = null, clinkAcc = 0;
    const ripples = [];
    const F = [0, 0];
    function flow(u, v, t) {
      let fx = 0.05, fy = 0.008 * Math.sin(u * 9 + t * 0.2);
      if (cypress(u, v)) { fx = 0.02 * Math.sin(v * 20 + t); fy = -0.13; }
      else if (v > hill(u)) { fx = 0.06; fy = 0.012 * Math.sin(u * 20 + t * 0.3); }
      else {
        for (const [x, y, s, r2] of VORTS) { const dx = u - x, dy = v - y, e = Math.exp(-(dx * dx + dy * dy) / r2) * s * 4; fx += -dy * e; fy += dx * e; }
        for (const [x, y, sr] of STARS) { const dx = u - x, dy = v - y, d2 = dx * dx + dy * dy; if (d2 < sr * sr * 7) { const e = 3; fx += -dy * e; fy += dx * e; } }
        const a = noise.n3(u * 4, v * 4, t * 0.07) * 2.5;
        fx += Math.cos(a) * 0.025; fy += Math.sin(a) * 0.025;
      }
      // la cuillère : un tourbillon qui va plus vite au centre qu'au bord
      if (Math.abs(stirW) > 0.05) { const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy), e = stirW * 0.35 * Math.max(0, 1 - d / 0.55); fx += -dy * e; fy += dx * e; }
      F[0] = fx; F[1] = fy;
    }
    function paint(dt, t, steps = 1) {
      pctx.lineWidth = PS / 85;
      pctx.lineCap = 'round';
      for (let s = 0; s < steps; s++) for (const p of parts) {
        flow(p.u, p.v, t);
        const nu = p.u + F[0] * dt * 0.65, nv = p.v + F[1] * dt * 0.65;
        pctx.strokeStyle = p.c;
        pctx.beginPath(); pctx.moveTo(p.u * PS, p.v * PS); pctx.lineTo(nu * PS, nv * PS); pctx.stroke();
        p.u = nu; p.v = nv; p.life -= dt;
        if (p.life < 0 || p.u < -0.02 || p.u > 1.02 || p.v < -0.02 || p.v > 1.02) {
          if (Math.abs(stirW) > 0.4 && p.u > 0 && p.u < 1 && p.v > 0 && p.v < 1) p.life = r.range(0.3, 1); // remué : on garde sa couleur, on la traîne
          else spawn(p);
        }
      }
    }
    function ensure() {
      if (pc) return;
      pc = makeCanvas(PS, PS); pctx = pc.getContext('2d');
      const lo = makeCanvas(60, 60), lg = lo.getContext('2d'), im = lg.createImageData(60, 60);
      for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) { const c = colorAt((x + 0.5) / 60, (y + 0.5) / 60), i = (y * 60 + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; }
      lg.putImageData(im, 0, 0);
      pctx.imageSmoothingEnabled = true;
      pctx.drawImage(lo, 0, 0, PS, PS);
      paint(1 / 30, 0, 60);
    }
    const geo = L => ({ x: L.cx, y: L.cy, Rs: L.S * 0.5, Ro: L.S * 0.37, Rc: L.S * 0.315 });
    return {
      ensure,
      hit(x, y, L) { const g = geo(L); return Math.hypot(x - g.x, y - g.y) < g.Ro; },
      update(dt, t) {
        ensure();
        stirW += stirImp; stirImp = 0;
        stirW *= Math.exp(-dt * 0.9);
        rot += stirW * dt * 0.5;
        if (stirring && Math.abs(stirW) > 1.5) { clinkAcc += Math.abs(stirW) * dt; if (clinkAcc > 5) { clinkAcc = 0; audio.note(11 + Math.floor(Math.random() * 3), { type: 'glass', vel: 0.045, dur: 1, pan: 0.2 }); } }
        paint(dt, t);
        for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].age += dt; if (ripples[i].age > 1.6) ripples.splice(i, 1); }
      },
      draw(ctx, L, t) {
        ensure();
        const { x, y, Rs, Ro, Rc } = geo(L);
        // la soucoupe
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x + Rs * 0.08, y + Rs * 0.1, Rs * 1.01, Rs * 1.01, 0, 0, TAU); ctx.fill();
        let g = ctx.createRadialGradient(x - Rs * 0.3, y - Rs * 0.3, Rs * 0.1, x, y, Rs);
        g.addColorStop(0, '#f6f3ee'); g.addColorStop(0.8, '#e2ddd4'); g.addColorStop(1, '#c9c2b6');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, Rs, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(40,70,160,0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, Rs * 0.92, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, Ro * 1.08, 0, TAU); ctx.stroke();
        // l'anse
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = Rs * 0.085;
        ctx.beginPath(); ctx.moveTo(x + Ro * 0.9, y - Rs * 0.1); ctx.bezierCurveTo(x + Ro + Rs * 0.32, y - Rs * 0.1, x + Ro + Rs * 0.32, y + Rs * 0.2, x + Ro * 0.9, y + Rs * 0.16); ctx.stroke();
        ctx.strokeStyle = '#efebe4';
        ctx.lineWidth = Rs * 0.07;
        ctx.beginPath(); ctx.moveTo(x + Ro * 0.9, y - Rs * 0.13); ctx.bezierCurveTo(x + Ro + Rs * 0.3, y - Rs * 0.14, x + Ro + Rs * 0.3, y + Rs * 0.14, x + Ro * 0.9, y + Rs * 0.13); ctx.stroke();
        // la tasse
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(x + Ro * 0.08, y + Ro * 0.1, Ro, 0, TAU); ctx.fill();
        g = ctx.createRadialGradient(x - Ro * 0.4, y - Ro * 0.4, Ro * 0.1, x, y, Ro);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.85, '#e9e4dc'); g.addColorStop(1, '#bdb5a8');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, Ro, 0, TAU); ctx.fill();
        g = ctx.createRadialGradient(x, y, Rc * 0.9, x, y, Ro * 0.97);
        g.addColorStop(0, 'rgba(120,100,80,0.5)'); g.addColorStop(1, 'rgba(120,100,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, Ro * 0.97, 0, TAU); ctx.fill();
        // le café : la Nuit étoilée qui tourne avec la cuillère
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, Rc, 0, TAU); ctx.clip();
        ctx.translate(x, y);
        ctx.rotate(rot);
        const D = Rc * 2.12;
        ctx.drawImage(pc, -D / 2, -D / 2, D, D);
        ctx.globalCompositeOperation = 'lighter';
        const sp = glow([255, 226, 120], 32);
        for (const [sx, sy, sr] of STARS) {
          const px = (sx - 0.5) * D, py = (sy - 0.5) * D, rr = sr * D;
          drawGlow(ctx, sp, px, py, rr * 2.4, 0.35 + 0.12 * Math.sin(t * 2 + sx * 30));
        }
        drawGlow(ctx, glow([255, 205, 110], 48), (MOON[0] - 0.5) * D, (MOON[1] - 0.5) * D, MOON[2] * D * 3, 0.4);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1.2, D * 0.006);
        for (const [sx, sy, sr] of STARS) {
          const px = (sx - 0.5) * D, py = (sy - 0.5) * D, rr = sr * D;
          ctx.strokeStyle = 'rgba(255,240,170,0.55)';
          for (let k = 1; k <= 2; k++) { const a = t * (0.6 + k * 0.2) + sx * 9; ctx.beginPath(); ctx.arc(px, py, rr * (0.9 + k * 0.45), a, a + 4.4); ctx.stroke(); }
        }
        // le croissant de lune
        const mx = (MOON[0] - 0.5) * D, my = (MOON[1] - 0.5) * D, mr = MOON[2] * D * 0.75;
        ctx.fillStyle = '#f6d36a';
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(44,74,140,0.95)';
        ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.85, 0, TAU); ctx.fill();
        ctx.rotate(-rot);
        // les cercles d'une goutte de lait
        for (const rp of ripples) {
          ctx.strokeStyle = `rgba(255,245,230,${0.4 * (1 - rp.age / 1.6)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(rp.x - x, rp.y - y, 4 + rp.age * Rc * 0.5, 0, TAU); ctx.stroke();
        }
        // la crème sur le bord, le reflet du projecteur
        g = ctx.createRadialGradient(0, 0, Rc * 0.82, 0, 0, Rc);
        g.addColorStop(0, 'rgba(110,70,35,0)'); g.addColorStop(1, 'rgba(120,78,40,0.75)');
        ctx.fillStyle = g;
        ctx.fillRect(-Rc, -Rc, Rc * 2, Rc * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.ellipse(-Rc * 0.35, -Rc * 0.42, Rc * 0.32, Rc * 0.13, -0.6, 0, TAU); ctx.fill();
        ctx.restore();
        // la cuillère, couchée sur la soucoupe (elle quitte sa place quand on remue)
        if (!stirring) {
          const sa = 2.28, sx = x + Math.cos(sa) * Rs * 0.86, sy = y + Math.sin(sa) * Rs * 0.86;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(sa + Math.PI / 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.ellipse(3, 4, Rs * 0.1, Rs * 0.06, 0, 0, TAU); ctx.fill();
          const sg = ctx.createLinearGradient(0, -Rs * 0.06, 0, Rs * 0.06);
          sg.addColorStop(0, '#f6f7f9'); sg.addColorStop(0.5, '#a3a8b0'); sg.addColorStop(1, '#e8eaee');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.ellipse(-Rs * 0.16, 0, Rs * 0.1, Rs * 0.06, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-Rs * 0.07, -Rs * 0.012); ctx.lineTo(Rs * 0.3, -Rs * 0.024); ctx.lineTo(Rs * 0.3, Rs * 0.024); ctx.lineTo(-Rs * 0.07, Rs * 0.012); ctx.fill();
          ctx.restore();
        }
        if (stirring) {
          ctx.fillStyle = 'rgba(225,228,234,0.9)';
          ctx.beginPath(); ctx.ellipse(input.x, input.y, 7, 4, 0.6, 0, TAU); ctx.fill();
        }
        // la vapeur
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.lineWidth = Rc * 0.18;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const s = i / 12, px = x + (k - 1) * Rc * 0.45 + noise.n2(t * 0.25 + k * 7, s * 2 - t * 0.5) * Rc * 0.5 * s, py = y - s * Rc * 1.5;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      },
      down(p, L) { const g = geo(L); if (Math.hypot(p.x - g.x, p.y - g.y) > g.Rc) return false; stirring = { a: Math.atan2(p.y - g.y, p.x - g.x), t: engine.t }; audio.note(12, { type: 'glass', vel: 0.05, dur: 0.8 }); return true; },
      move(p, L) {
        if (!stirring) return;
        const g = geo(L), a = Math.atan2(p.y - g.y, p.x - g.x), dt = Math.max(0.008, engine.t - stirring.t);
        stirImp += clamp(angleDiff(a, stirring.a) / dt, -14, 14) * 0.12;
        stirring.a = a; stirring.t = engine.t;
      },
      up() { stirring = null; },
      tap(x, y, L) {
        const g = geo(L);
        if (Math.hypot(x - g.x, y - g.y) > g.Rc) return false;
        ripples.push({ x, y, age: 0 });
        audio.play(audio.freq(4, 1), { type: 'drop', vel: 0.12, dur: 0.6 });
        return true;
      },
    };
  }

  // ═════════════════════════ Salle III · Seurat, sous une loupe
  function makeSeurat() {
    const DW = 660, DH = 440;
    let dc = null, dots = 0;
    const r = rng(1886);
    const lens = { x: 0, y: 0, init: false, path: 0, lx: 0, ly: 0, held: false };
    const P = {
      foliage: [[[40, 72, 46], [56, 92, 52], [34, 62, 56]], [[64, 82, 142], [190, 112, 52]]],
      sky: [[[202, 212, 222], [222, 226, 214]], [[242, 222, 172]]],
      river: [[[70, 122, 172], [92, 142, 192], [112, 162, 202]], [[232, 152, 82], [242, 242, 232]]],
      sun: [[[152, 192, 82], [172, 202, 92], [202, 212, 112]], [[232, 202, 92], [232, 142, 92], [122, 172, 202]]],
      shade: [[[50, 96, 56], [62, 106, 72], [46, 86, 76]], [[82, 92, 172], [152, 82, 122]]],
      trunk: [[[62, 46, 52], [76, 56, 62]], [[122, 82, 142]]],
      dark: [[[30, 30, 52], [42, 36, 62], [26, 26, 42]], [[92, 62, 142], [162, 62, 52]]],
      white: [[[236, 236, 230], [226, 222, 236]], [[202, 182, 222], [255, 222, 192]]],
      orange: [[[202, 102, 62], [182, 82, 62]], [[232, 152, 92], [92, 62, 142]]],
    };
    // Les promeneurs : des silhouettes faites d'ellipses
    const FIG = [
      ['orange', [[0.79, 0.31, 0.056, 0.03, 1], [0.7915, 0.325, 0.0025, 0.03]]],
      ['dark', [[0.53, 0.43, 0.009, 0.016], [0.535, 0.55, 0.022, 0.11]]],
      ['white', [[0.535, 0.396, 0.036, 0.02, 1], [0.505, 0.52, 0.008, 0.014], [0.505, 0.6, 0.016, 0.055]]],
      ['dark', [[0.215, 0.61, 0.01, 0.018], [0.225, 0.7, 0.035, 0.065]]],
      ['orange', [[0.225, 0.585, 0.03, 0.016, 1]]],
      ['dark', [[0.14, 0.81, 0.07, 0.022], [0.075, 0.79, 0.012, 0.018], [0.07, 0.775, 0.014, 0.008]]],
      ['dark', [[0.38, 0.45, 0.007, 0.035], [0.43, 0.47, 0.008, 0.04], [0.62, 0.42, 0.006, 0.03], [0.67, 0.44, 0.008, 0.038], [0.26, 0.43, 0.006, 0.03]]],
      ['dark', [[0.3, 0.9, 0.03, 0.015], [0.33, 0.885, 0.009, 0.009], [0.74, 0.9, 0.012, 0.02]]],
      ['white', [[0.12, 0.28, 0.012, 0.04], [0.25, 0.2, 0.01, 0.03]]],
    ];
    // les deux grands promeneurs de droite : la dame à la tournure et à l'ombrelle, l'homme au haut-de-forme
    const POLY = [
      ['dark', [[0.792, 0.34], [0.802, 0.338], [0.806, 0.372], [0.812, 0.39], [0.816, 0.45], [0.848, 0.5], [0.862, 0.56], [0.846, 0.6], [0.858, 0.88], [0.872, 0.965], [0.758, 0.965], [0.772, 0.82], [0.784, 0.6], [0.79, 0.47], [0.784, 0.4], [0.788, 0.37]]],
      ['dark', [[0.894, 0.232], [0.916, 0.232], [0.916, 0.272], [0.924, 0.276], [0.886, 0.276], [0.894, 0.272], [0.896, 0.3], [0.912, 0.318], [0.932, 0.34], [0.942, 0.46], [0.934, 0.62], [0.926, 0.96], [0.906, 0.96], [0.9, 0.72], [0.888, 0.96], [0.868, 0.96], [0.876, 0.6], [0.872, 0.45], [0.884, 0.33], [0.896, 0.318]]],
    ];
    const inPoly = (u, v, pts) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const TREES = [[0.33, 0.008, 0.48], [0.6, 0.007, 0.4], [0.72, 0.01, 0.55], [0.955, 0.012, 0.5], [0.06, 0.01, 0.5]];
    const inE = (u, v, e) => { const dx = (u - e[0]) / e[2], dy = (v - e[1]) / e[3]; return dx * dx + dy * dy < 1 && (!e[4] || v < e[1]); };
    function region(u, v) {
      for (const [pal, pts] of POLY) if (inPoly(u, v, pts)) return pal;
      for (const [pal, parts] of FIG) for (const e of parts) if (inE(u, v, e)) return pal;
      for (const [x, w, top] of TREES) if (Math.abs(u - x) < w && v < top) return 'trunk';
      const canopy = (u < 0.4 ? 0.08 : 0.2) + 0.04 * Math.sin(u * 17);
      if (v < canopy) return 'foliage';
      const bank = 0.5 - 0.75 * u;
      if (v < bank) return v < 0.1 ? 'sky' : 'river';
      if (v > 0.74 - 0.12 * u + 0.03 * Math.sin(u * 9)) return 'shade';
      for (const [x, , top] of TREES) if (inE(u, v, [x + 0.05, top + 0.03, 0.08, 0.025])) return 'shade';
      return 'sun';
    }
    function ensure() {
      if (dc) return;
      dc = makeCanvas(DW, DH);
      const g = dc.getContext('2d');
      const lo = makeCanvas(66, 44), lg = lo.getContext('2d'), im = lg.createImageData(66, 44);
      for (let y = 0; y < 44; y++) for (let x = 0; x < 66; x++) { const c = P[region((x + 0.5) / 66, (y + 0.5) / 44)][0][0], i = (y * 66 + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; }
      lg.putImageData(im, 0, 0);
      g.drawImage(lo, 0, 0, DW, DH);
      const step = 3.7;
      for (let gy = 0; gy < DH; gy += step) for (let gx = 0; gx < DW; gx += step) {
        const x = gx + r() * step, y = gy + r() * step;
        const reg = region(x / DW, y / DH), [base, acc] = P[reg], fig = reg === 'dark' || reg === 'white' || reg === 'orange';
        const c = jit(r, r() < (fig ? 0.1 : 0.22) ? pick(r, acc) : pick(r, base), fig ? 10 : 22);
        g.fillStyle = rgb(c);
        g.beginPath(); g.arc(x, y, r.range(2.2, 3.2), 0, TAU); g.fill();
        dots++;
      }
    }
    const geo = L => { const tw = L.S * (L.P ? 0.86 : 0.8), th = tw * (DH / DW); return { tx: L.cx - tw / 2, ty: L.cy - th / 2, tw, th, RL: L.S * 0.2 }; };
    return {
      ensure,
      extra: () => (dots ? `${dots.toLocaleString('fr-FR')} points` : ''),
      hit(x, y, L) { const g = geo(L); return Math.hypot(x - lens.x, y - lens.y) < g.RL * 1.2 || (x > g.tx && x < g.tx + g.tw && y > g.ty && y < g.ty + g.th); },
      update(dt, t, L) {
        ensure();
        const g = geo(L);
        let tx, ty;
        const mouseHere = input.inside && input.type === 'mouse' && !drag && input.x > g.tx - g.RL * 1.2 && input.x < g.tx + g.tw + g.RL * 1.2 && input.y > g.ty - g.RL * 1.2 && input.y < g.ty + g.th + g.RL * 1.2;
        if (lens.held || mouseHere) {
          tx = input.x; ty = input.y;
          if (lens.held && input.type !== 'mouse') { tx -= g.RL * 0.95; ty -= g.RL * 0.95; } // au doigt, on tient la loupe par le manche
        } else { tx = g.tx + g.tw * (0.5 + 0.36 * Math.sin(t * 0.13)); ty = g.ty + g.th * (0.5 + 0.3 * Math.sin(t * 0.21 + 1)); }
        tx = clamp(tx, g.tx - g.RL * 0.4, g.tx + g.tw + g.RL * 0.4);
        ty = clamp(ty, g.ty - g.RL * 0.4, g.ty + g.th + g.RL * 0.4);
        if (!lens.init) { lens.x = tx; lens.y = ty; lens.init = true; lens.lx = tx; lens.ly = ty; }
        lens.x += (tx - lens.x) * Math.min(1, dt * 7);
        lens.y += (ty - lens.y) * Math.min(1, dt * 7);
        // le pointillisme s'entend : un point de couleur, une goutte de son
        lens.path += Math.hypot(lens.x - lens.lx, lens.y - lens.ly);
        lens.lx = lens.x; lens.ly = lens.y;
        if (lens.path > 24 && (lens.held || mouseHere)) {
          lens.path = 0;
          const u = (lens.x - g.tx) / g.tw, v = (lens.y - g.ty) / g.th;
          if (u > 0 && u < 1 && v > 0 && v < 1) {
            const [base, acc] = P[region(u, v)];
            const c = Math.random() < 0.3 ? pick(Math.random, acc) : pick(Math.random, base), h = hueOf(c);
            const deg = h < 0 ? 0 : Math.floor((h / 360) * 10);
            audio.note(deg, { type: 'drop', vel: 0.04, dur: 0.5, pan: clamp(u * 2 - 1, -1, 1), oct: 1, send: 0.3 });
          }
        }
      },
      draw(ctx, L) {
        ensure();
        const g = geo(L);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(g.tx + 5, g.ty + 7, g.tw, g.th);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(dc, g.tx, g.ty, g.tw, g.th);
        const { x, y } = lens, RL = g.RL;
        // l'ombre de la loupe sur le mur
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.arc(x + RL * 0.25, y + RL * 0.35, RL * 1.05, 0, TAU); ctx.fill();
        // le manche
        const ha = Math.PI / 4, hx = Math.cos(ha), hy = Math.sin(ha);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#2b190d';
        ctx.lineWidth = RL * 0.24;
        ctx.beginPath(); ctx.moveTo(x + hx * RL * 1.25, y + hy * RL * 1.25); ctx.lineTo(x + hx * RL * 2.35, y + hy * RL * 2.35); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,180,0.18)';
        ctx.lineWidth = RL * 0.06;
        ctx.beginPath(); ctx.moveTo(x + hx * RL * 1.3 - hy * 3, y + hy * RL * 1.3 + hx * 3 - 6); ctx.lineTo(x + hx * RL * 2.3 - hy * 3, y + hy * RL * 2.3 + hx * 3 - 6); ctx.stroke();
        ctx.strokeStyle = '#b8902f';
        ctx.lineWidth = RL * 0.2;
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x + hx * RL * 1.02, y + hy * RL * 1.02); ctx.lineTo(x + hx * RL * 1.28, y + hy * RL * 1.28); ctx.stroke();
        // la lentille : le tableau vu de près, point par point
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, RL, 0, TAU); ctx.clip();
        ctx.fillStyle = rgb(ROOMS[2].wall);
        ctx.fillRect(x - RL, y - RL, RL * 2, RL * 2);
        const m = 1.9;
        const u = (x - g.tx) / g.tw, v = (y - g.ty) / g.th;
        ctx.drawImage(dc, x - u * DW * m, y - v * DH * m, DW * m, DH * m);
        const vg = ctx.createRadialGradient(x, y, RL * 0.6, x, y, RL);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(x - RL, y - RL, RL * 2, RL * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = RL * 0.05;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, RL * 0.78, -2.6, -1.95); ctx.stroke();
        ctx.lineCap = 'butt';
        const rg = ctx.createLinearGradient(x - RL, y - RL, x + RL, y + RL);
        rg.addColorStop(0, '#f2d98a'); rg.addColorStop(0.5, '#a07a26'); rg.addColorStop(1, '#e6c66e');
        ctx.strokeStyle = rg;
        ctx.lineWidth = RL * 0.13;
        ctx.beginPath(); ctx.arc(x, y, RL * 1.04, 0, TAU); ctx.stroke();
      },
      down(p, L) {
        const g = geo(L);
        if (Math.hypot(p.x - lens.x, p.y - lens.y) < g.RL * 1.3 || (p.x > g.tx && p.x < g.tx + g.tw && p.y > g.ty && p.y < g.ty + g.th)) { lens.held = true; return true; }
        return false;
      },
      up() { lens.held = false; },
    };
  }

  // ═════════════════════════ Salle IV · Kandinsky, dans le pavillon d'un gramophone
  function makeKandinsky() {
    const r = rng(1926);
    const COLS = [[242, 193, 78], [224, 75, 58], [59, 111, 216], [217, 107, 176], [92, 191, 138], [139, 92, 199], [240, 140, 58], [154, 208, 232], [245, 232, 200]];
    const circles = [{ big: true, r0: 0.3, a0: -2.3, R: 0.27, col: [16, 18, 46], w: 0.02, ph: 0, pulse: 0 }];
    for (let k = 0; k < 17; k++) {
      const R = k < 3 ? r.range(0.1, 0.16) : r.range(0.03, 0.09);
      circles.push({ r0: r.range(0.08, 0.72 - R), a0: r() * TAU, R, col: COLS[k % COLS.length], w: r.range(0.03, 0.09) * r.sign(), ph: r() * TAU, pulse: 0 });
    }
    let rec = 0, auto = 2, waves = [];
    const degOf = c => { if (c.big) return -3; const h = hueOf(c.col); return h < 0 ? 4 : h < 30 ? 6 : h < 70 ? 10 : h < 170 ? 5 : h < 250 ? 1 : 3; };
    const geo = L => ({ bx: L.cx, by: L.cy - L.S * 0.12, RB: L.S * 0.4, boxY: L.cy + L.S * 0.28 });
    const pos = (c, g, t) => { const a = c.a0 + t * c.w, rr = c.r0 * g.RB + Math.sin(t * 0.7 + c.ph) * g.RB * 0.02; return [g.bx + Math.cos(a) * rr, g.by + Math.sin(a) * rr]; };
    function sing(c, at = 0) {
      c.pulse = 1;
      const d = degOf(c);
      audio.note(d, { type: c.R < 0.06 ? 'glass' : 'bell', vel: c.big ? 0.12 : 0.08, dur: c.big ? 3.5 : 2, oct: c.big ? -1 : 0, at, send: 0.5 });
      waves.push({ age: -at });
    }
    return {
      hit(x, y, L) { const g = geo(L); return Math.hypot(x - g.bx, y - g.by) < g.RB * 1.05 || (Math.abs(x - g.bx) < L.S * 0.34 && y > g.boxY - 10 && y < g.boxY + L.S * 0.2); },
      update(dt, t) {
        rec += dt * 3.5;
        for (const c of circles) c.pulse = Math.max(0, c.pulse - dt * 1.4);
        auto -= dt;
        if (auto < 0) { auto = 1.8 + Math.random() * 2.4; sing(circles[1 + Math.floor(Math.random() * (circles.length - 1))]); }
        for (let i = waves.length - 1; i >= 0; i--) { waves[i].age += dt; if (waves[i].age > 2) waves.splice(i, 1); }
      },
      draw(ctx, L, t) {
        const g = geo(L), { bx, by, RB, boxY } = g, S = L.S;
        // le socle, la boîte, le plateau
        const bw = S * 0.62, bh = S * 0.18;
        ctx.fillStyle = '#d9d4ca';
        ctx.fillRect(L.cx - S * 0.28, boxY + bh, S * 0.56, L.floorY - boxY - bh);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(L.cx + S * 0.18, boxY + bh, S * 0.1, L.floorY - boxY - bh);
        const wg = ctx.createLinearGradient(0, boxY, 0, boxY + bh);
        wg.addColorStop(0, '#6b3d1f'); wg.addColorStop(1, '#3d2111');
        ctx.fillStyle = wg;
        ctx.fillRect(L.cx - bw / 2, boxY, bw, bh);
        ctx.strokeStyle = 'rgba(255,210,150,0.25)';
        ctx.strokeRect(L.cx - bw / 2 + 6, boxY + 6, bw - 12, bh - 12);
        ctx.fillStyle = '#c9a24a';
        ctx.beginPath(); ctx.arc(L.cx + bw * 0.42, boxY + bh / 2, 4, 0, TAU); ctx.fill();
        const tx = L.cx - S * 0.06;
        ctx.fillStyle = '#0c0c0e';
        ctx.beginPath(); ctx.ellipse(tx, boxY, S * 0.21, S * 0.045, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const a = rec + k * 2.1; ctx.beginPath(); ctx.ellipse(tx, boxY, S * (0.08 + k * 0.04), S * (0.017 + k * 0.009), 0, a, a + 0.9); ctx.stroke(); }
        ctx.fillStyle = '#b8322a';
        ctx.beginPath(); ctx.ellipse(tx, boxY, S * 0.05, S * 0.012, 0, 0, TAU); ctx.fill();
        // le col de cygne, du bras de lecture jusqu'au pavillon
        ctx.strokeStyle = '#a8842f';
        ctx.lineWidth = S * 0.05;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(L.cx + S * 0.2, boxY - 2); ctx.quadraticCurveTo(L.cx + S * 0.24, by + RB * 0.75, bx + S * 0.02, by + RB * 0.55); ctx.stroke();
        ctx.strokeStyle = '#6f5418';
        ctx.lineWidth = S * 0.012;
        ctx.beginPath(); ctx.moveTo(L.cx + S * 0.2, boxY - 3); ctx.lineTo(tx + S * 0.12, boxY - 2); ctx.stroke();
        ctx.lineCap = 'butt';
        // le pavillon : une fleur de laiton, au bord festonné
        ctx.beginPath();
        for (let k = 0; k <= 80; k++) {
          const a = (k / 80) * TAU, rr = RB * (1.04 + 0.03 * Math.cos(a * 10));
          const x = bx + Math.cos(a) * rr, y = by + Math.sin(a) * rr;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        const rim = ctx.createRadialGradient(bx - RB * 0.3, by - RB * 0.4, RB * 0.2, bx, by, RB * 1.08);
        rim.addColorStop(0, '#f4d98a'); rim.addColorStop(0.7, '#b98d2c'); rim.addColorStop(1, '#6d4f14');
        ctx.fillStyle = rim;
        ctx.fill();
        const inner = ctx.createRadialGradient(bx, by, RB * 0.05, bx, by, RB);
        inner.addColorStop(0, '#000'); inner.addColorStop(0.45, '#0b0705'); inner.addColorStop(0.78, '#3a2a10'); inner.addColorStop(0.93, '#9a7428'); inner.addColorStop(1, '#d9b45a');
        ctx.fillStyle = inner;
        ctx.beginPath(); ctx.arc(bx, by, RB, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * RB * 0.12, by + Math.sin(a) * RB * 0.12); ctx.quadraticCurveTo(bx + Math.cos(a + 0.12) * RB * 0.6, by + Math.sin(a + 0.12) * RB * 0.6, bx + Math.cos(a) * RB, by + Math.sin(a) * RB); ctx.stroke(); }
        // les cercles, qui flottent dans la nuit du pavillon
        ctx.save();
        ctx.beginPath(); ctx.arc(bx, by, RB * 0.97, 0, TAU); ctx.clip();
        const big = circles[0], [gx, gy] = pos(big, g, t), gR = big.R * RB * (1 + big.pulse * 0.12);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, glow([70, 110, 255], 64, 0.4), gx, gy, gR * 1.7, 0.55 + big.pulse * 0.3);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgb(14,16,40)';
        ctx.beginPath(); ctx.arc(gx, gy, gR, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 1; i < circles.length; i++) {
          const c = circles[i], [x, y] = pos(c, g, t), R = c.R * RB * (1 + c.pulse * 0.3);
          drawGlow(ctx, glow(c.col, 48, 0.35), x, y, R * 1.6, 0.35 + c.pulse * 0.4);
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = rgb(c.col);
          ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
          if (c.R > 0.08) { ctx.fillStyle = rgbA(COLS[(i + 3) % COLS.length], 0.6); ctx.beginPath(); ctx.arc(x + R * 0.15, y - R * 0.1, R * 0.45, 0, TAU); ctx.fill(); }
          if (c.pulse > 0.02) { ctx.strokeStyle = rgbA(c.col, c.pulse * 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R * (1.2 + (1 - c.pulse) * 1.5), 0, TAU); ctx.stroke(); }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        // ce qui sort du pavillon : des ondes
        for (const w of waves) {
          if (w.age < 0) continue;
          ctx.strokeStyle = `rgba(255,236,190,${0.25 * (1 - w.age / 2)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx, by, RB * (1.08 + w.age * 0.35), 0, TAU); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,245,210,0.35)';
        ctx.lineWidth = RB * 0.03;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(bx, by, RB * 1.0, -2.7, -1.9); ctx.stroke();
        ctx.lineCap = 'butt';
      },
      tap(x, y, L) {
        const g = geo(L), t = engine.t;
        let best = null, bd = 1e9;
        for (const c of circles) { const [cx2, cy2] = pos(c, g, t), d = Math.hypot(x - cx2, y - cy2) / (c.R * g.RB); if (d < 1.2 && d < bd) { bd = d; best = c; } }
        if (best) { sing(best); return true; }
        if (Math.hypot(x - g.bx, y - g.by) < g.RB * 1.05) {
          [...circles].sort((a, b) => a.R - b.R).forEach((c, k) => sing(c, k * 0.09));
          return true;
        }
        return false;
      },
    };
  }

  // ═════════════════════════ Salle V · Hokusai, sur un éventail
  function makeHokusai() {
    const HW = 640, HH = 240;
    const hc = makeCanvas(HW, HH), h = hc.getContext('2d');
    const r = rng(1831);
    const spray = Array.from({ length: 46 }, () => ({ x: r.range(0.2, 0.5), y: r.range(0.02, 0.4), s: r.range(1, 2.6), v: r.range(0.01, 0.04) }));
    const claws = Array.from({ length: 15 }, (_, k) => ({ k: k / 14, ph: r() * TAU }));
    let open = 1, anim = -1, tassel = { a: 0, v: 0 };
    const B = (x, y) => [x * HW, y * HH];
    function wavePath(t) {
      const c = 0.012 * Math.sin(t * 0.5), lift = 1 + 0.03 * Math.sin(t * 0.4);
      const Y = y => 1 - (1 - y) * lift;
      h.beginPath();
      h.moveTo(...B(0, 1));
      h.lineTo(...B(0, Y(0.74)));
      h.bezierCurveTo(...B(0.08, Y(0.6)), ...B(0.13, Y(0.34)), ...B(0.2, Y(0.18)));
      h.bezierCurveTo(...B(0.25, Y(0.06)), ...B(0.36 + c, Y(0.02)), ...B(0.43 + c, Y(0.13)));
      h.bezierCurveTo(...B(0.48 + c, Y(0.2)), ...B(0.49 + c, Y(0.33)), ...B(0.46 + c, Y(0.4)));
      h.bezierCurveTo(...B(0.43, Y(0.34)), ...B(0.39, Y(0.3)), ...B(0.36, Y(0.42)));
      h.bezierCurveTo(...B(0.34, Y(0.56)), ...B(0.42, Y(0.8)), ...B(0.52, 1));
      h.closePath();
      return { c, Y };
    }
    function paint(t) {
      // le ciel, sa bande grise, ses nuages
      const sg = h.createLinearGradient(0, 0, 0, HH);
      sg.addColorStop(0, '#6f6f6a'); sg.addColorStop(0.18, '#c9bfa3'); sg.addColorStop(0.5, '#e9dcbc'); sg.addColorStop(1, '#efe4c8');
      h.fillStyle = sg;
      h.fillRect(0, 0, HW, HH);
      h.fillStyle = 'rgba(255,250,235,0.5)';
      h.beginPath(); h.ellipse(HW * 0.72, HH * 0.32, HW * 0.12, HH * 0.04, 0, 0, TAU); h.ellipse(HW * 0.86, HH * 0.24, HW * 0.08, HH * 0.03, 0, 0, TAU); h.fill();
      // le Fuji, tout petit
      h.fillStyle = '#2d4064';
      h.beginPath(); h.moveTo(HW * 0.57, HH * 0.9); h.lineTo(HW * 0.66, HH * 0.6); h.lineTo(HW * 0.75, HH * 0.9); h.fill();
      h.fillStyle = '#f4efe2';
      h.beginPath(); h.moveTo(HW * 0.627, HH * 0.69); h.lineTo(HW * 0.66, HH * 0.6); h.lineTo(HW * 0.693, HH * 0.69); h.lineTo(HW * 0.677, HH * 0.672); h.lineTo(HW * 0.66, HH * 0.7); h.lineTo(HW * 0.643, HH * 0.672); h.fill();
      // les barques, qui plongent dans les creux
      for (const [x0, y0, len, a, ph] of [[0.16, 0.74, 0.26, -0.18, 0], [0.76, 0.62, 0.2, 0.14, 2], [0.8, 0.86, 0.17, -0.08, 4]]) {
        h.save();
        h.translate(HW * x0, HH * (y0 + 0.02 * Math.sin(t * 0.9 + ph)));
        h.rotate(a + 0.04 * Math.sin(t * 0.7 + ph));
        h.fillStyle = '#d8bf86';
        h.strokeStyle = '#3b3020';
        h.lineWidth = 1;
        h.beginPath(); h.moveTo(0, 0); h.quadraticCurveTo(HW * len * 0.5, HH * 0.12, HW * len, -HH * 0.03); h.quadraticCurveTo(HW * len * 0.5, HH * 0.03, 0, 0); h.fill(); h.stroke();
        h.fillStyle = '#2b3c5c';
        for (let k = 1; k < 8; k++) { h.beginPath(); h.arc(HW * len * k / 8, HH * 0.008, 2.2, 0, TAU); h.fill(); }
        h.restore();
      }
      // la grande vague
      const { c, Y } = wavePath(t);
      const bg = h.createLinearGradient(0, 0, HW * 0.5, HH);
      bg.addColorStop(0, '#2f5a8f'); bg.addColorStop(1, '#1b3360');
      h.fillStyle = bg;
      h.fill();
      h.save();
      h.clip();
      h.strokeStyle = 'rgba(160,190,215,0.75)';
      h.lineWidth = 1.6;
      for (let k = 1; k <= 9; k++) {
        const d = k * 0.022;
        h.beginPath();
        h.moveTo(...B(0.02 + d, Y(0.76)));
        h.bezierCurveTo(...B(0.1 + d, Y(0.6 + d)), ...B(0.15 + d, Y(0.36 + d)), ...B(0.22 + d, Y(0.2 + d)));
        h.bezierCurveTo(...B(0.27 + d, Y(0.1 + d)), ...B(0.36 + c, Y(0.07 + d)), ...B(0.42 + c, Y(0.17 + d)));
        h.stroke();
      }
      h.restore();
      // l'écume et ses griffes
      h.strokeStyle = '#f4efe3';
      h.lineWidth = 5;
      h.lineCap = 'round';
      h.beginPath();
      h.moveTo(...B(0.2, Y(0.18)));
      h.bezierCurveTo(...B(0.25, Y(0.06)), ...B(0.36 + c, Y(0.02)), ...B(0.43 + c, Y(0.13)));
      h.bezierCurveTo(...B(0.48 + c, Y(0.2)), ...B(0.49 + c, Y(0.33)), ...B(0.46 + c, Y(0.4)));
      h.stroke();
      for (const cl of claws) {
        const k = cl.k, a = k < 0.5 ? lerp(-2.2, -0.4, k * 2) : lerp(-0.4, 1.4, (k - 0.5) * 2);
        const px = lerp(0.24, 0.47, k) + c, py = k < 0.5 ? lerp(0.08, 0.02, k * 2) : lerp(0.04, 0.38, (k - 0.5) * 2);
        const [x, y] = B(px, Y(py)), len = 9 + 4 * Math.sin(t * 2 + cl.ph);
        h.strokeStyle = '#f4efe3';
        h.lineWidth = 3.2;
        h.beginPath(); h.moveTo(x, y); h.quadraticCurveTo(x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos(a + 1.3) * len * 0.9, y + Math.sin(a + 1.3) * len * 0.9); h.stroke();
      }
      h.fillStyle = '#f7f2e6';
      for (const s of spray) { h.beginPath(); h.arc(HW * (s.x + c), HH * s.y, s.s, 0, TAU); h.fill(); }
      // la petite vague du premier plan, qui imite la montagne
      const sw = 0.02 * Math.sin(t * 0.8);
      h.fillStyle = '#284a7c';
      h.beginPath(); h.moveTo(HW * 0.3, HH); h.quadraticCurveTo(HW * 0.42, HH * 0.76, HW * 0.47, HH * (0.7 + sw)); h.quadraticCurveTo(HW * 0.52, HH * 0.76, HW * 0.62, HH); h.fill();
      h.fillStyle = '#f4efe3';
      h.beginPath(); h.arc(HW * 0.47, HH * (0.72 + sw), 5, 0, TAU); h.arc(HW * 0.455, HH * (0.745 + sw), 3.5, 0, TAU); h.arc(HW * 0.486, HH * (0.745 + sw), 3.5, 0, TAU); h.fill();
      h.lineCap = 'butt';
      // le cartouche et la signature
      h.fillStyle = '#e7dcc0';
      h.fillRect(HW * 0.03, HH * 0.08, HW * 0.025, HH * 0.3);
      h.strokeStyle = '#8a3a2a';
      h.lineWidth = 1;
      h.strokeRect(HW * 0.03, HH * 0.08, HW * 0.025, HH * 0.3);
      h.fillStyle = '#2a2420';
      for (let k = 0; k < 7; k++) h.fillRect(HW * 0.038, HH * (0.1 + k * 0.038), HW * 0.009, 2);
    }
    const geo = L => {
      const A = (150 * Math.PI) / 180 * open + 0.05 * Math.sin(engine.t * 0.7) * open;
      const R1 = Math.min(L.S * 0.66, (W * 0.47) / Math.sin(Math.min(Math.PI / 2, (150 * Math.PI) / 360)));
      return { px: L.cx, py: L.cy + R1 * 0.5, R1, R0: R1 * 0.38, A };
    };
    return {
      hit(x, y, L) { const g = geo(L), dx = x - g.px, dy = y - g.py, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx); return d < g.R1 * 1.02 && Math.abs(angleDiff(a, -Math.PI / 2)) < g.A / 2 + 0.05; },
      update(dt, t) {
        for (const s of spray) { s.y += s.v * dt; s.x += s.v * dt * 0.4; if (s.y > 0.45) { s.y = r.range(0.0, 0.12); s.x = r.range(0.24, 0.48); } }
        if (anim >= 0) {
          anim += dt;
          const k = anim < 0.35 ? easeInOut(anim / 0.35) : 1 - easeOutBack(clamp((anim - 0.45) / 0.7, 0, 1));
          open = 1 - 0.9 * clamp(k, -0.2, 1);
          if (anim > 1.2) { anim = -1; open = 1; }
        }
        tassel.v += (-tassel.a * 9 - tassel.v * 1.4 + (anim >= 0 ? Math.sin(anim * 9) * 12 : 0)) * dt;
        tassel.a += tassel.v * dt;
        paint(t);
      },
      draw(ctx, L) {
        const { px, py, R1, R0, A } = geo(L);
        const K = 18, dA = A / K, base = -Math.PI / 2 - A / 2;
        // l'ombre de l'éventail
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.moveTo(px + 10, py + 14); ctx.arc(px + 10, py + 14, R1, base, base + A); ctx.closePath(); ctx.fill();
        for (let k = 0; k < K; k++) {
          const a0 = base + k * dA, a1 = a0 + dA, am = (a0 + a1) / 2;
          ctx.save();
          ctx.beginPath(); ctx.arc(px, py, R1, a0, a1); ctx.arc(px, py, R0, a1, a0, true); ctx.closePath();
          ctx.clip();
          ctx.translate(px, py);
          ctx.rotate(am + Math.PI / 2);
          const wOut = R1 * dA * 1.06 + 1;
          ctx.drawImage(hc, (k / K) * HW, 0, HW / K, HH, -wOut / 2, -R1, wOut, R1 - R0);
          // les plis : une lame claire, une lame sombre
          ctx.fillStyle = k % 2 ? 'rgba(0,0,0,0.13)' : 'rgba(255,250,235,0.07)';
          ctx.fillRect(-wOut, -R1, wOut * 2, R1);
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(40,25,15,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, R1, base, base + A); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, R0, base, base + A); ctx.stroke();
        // les brins, jusqu'au rivet
        ctx.lineCap = 'round';
        for (let k = 0; k <= K; k++) {
          const a = base + k * dA, guard = k === 0 || k === K, to = guard ? R1 * 1.01 : R0;
          ctx.strokeStyle = guard ? '#2a160b' : '#3d2414';
          ctx.lineWidth = guard ? 5 : 2.6;
          ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6); ctx.lineTo(px + Math.cos(a) * to, py + Math.sin(a) * to); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        const rv = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, 7);
        rv.addColorStop(0, '#fff2c0'); rv.addColorStop(1, '#8a6a22');
        ctx.fillStyle = rv;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill();
        // le gland de soie
        const ta = tassel.a, len = L.S * 0.16, ex = px + Math.sin(ta) * len, ey = py + Math.cos(ta) * len;
        ctx.strokeStyle = '#b8322a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py + 6); ctx.quadraticCurveTo(px + Math.sin(ta) * len * 0.3, py + len * 0.6, ex, ey); ctx.stroke();
        ctx.fillStyle = '#c63a2e';
        ctx.beginPath(); ctx.moveTo(ex - 4, ey); ctx.lineTo(ex + 4, ey); ctx.lineTo(ex + 7 + Math.sin(ta) * 4, ey + 22); ctx.lineTo(ex - 7 + Math.sin(ta) * 4, ey + 22); ctx.fill();
        ctx.fillStyle = '#e8b04a';
        ctx.fillRect(ex - 4, ey - 1, 8, 3);
      },
      tap(x, y, L) {
        if (!this.hit(x, y, L) || anim >= 0) return false;
        anim = 0;
        audio.noise({ freq: 900, q: 0.7, dur: 0.45, vel: 0.08, type: 'bandpass', sweep: 3, send: 0.4 });
        audio.noise({ freq: 400, q: 0.5, dur: 1.6, vel: 0.06, type: 'lowpass', sweep: 0.5, send: 0.6, at: 0.5 });
        audio.note(0, { type: 'soft', vel: 0.1, dur: 3, oct: -1, at: 0.5 });
        return true;
      },
    };
  }

  // ═════════════════════════ Salle VI · Hilma af Klint, par le trou de la serrure
  function makeKlint() {
    const AGES = [
      { age: "L'Enfance", bg: ['#4f86a8', '#80b6ca'], cols: ['#f2a6b8', '#f4c06a', '#f6efe0', '#c9a6e0', '#f08a5d', '#ffe39a'] },
      { age: 'La Jeunesse', bg: ['#e2945c', '#f2c28e'], cols: ['#f6efe0', '#7aa0d8', '#f4d35e', '#e86f8a', '#9ccf9a', '#b07ad0'] },
      { age: "L'Âge adulte", bg: ['#b38ac0', '#e1b5cf'], cols: ['#f6efe0', '#f5b14c', '#5f8fd0', '#f3d46b', '#e05a6d', '#7fc08a'] },
      { age: 'La Vieillesse', bg: ['#d0c8bb', '#ebe5d9'], cols: ['#f0b6b6', '#9fb7d8', '#e9cf7a', '#c6b3da', '#ffffff', '#8a7a6a'] },
    ];
    const ageOf = n => (n <= 2 ? 0 : n <= 4 ? 1 : n <= 8 ? 2 : 3);
    const KW = 420, KH = 580;
    let num = 1, kc = null, door = null, doorKey = '', lean = 0, flash = 0, keyTurn = 0;
    const seenNums = new Set([1]);
    const look = { x: 0, y: 0 };
    function paintNumber(n) {
      kc = kc || makeCanvas(KW, KH);
      const g = kc.getContext('2d'), A = AGES[ageOf(n)], r = rng(1907 + n * 31);
      const bgG = g.createLinearGradient(0, 0, 0, KH);
      bgG.addColorStop(0, A.bg[0]); bgG.addColorStop(1, A.bg[1]);
      g.fillStyle = bgG;
      g.fillRect(0, 0, KW, KH);
      const col = () => pick(r, A.cols);
      g.lineCap = 'round';
      // de grandes formes douces, comme des pétales géants
      for (let k = 0; k < 5; k++) {
        g.fillStyle = col(); g.globalAlpha = 0.35;
        g.beginPath(); g.ellipse(r() * KW, r() * KH, r.range(60, 150), r.range(90, 200), r() * TAU, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      const spiral = (x, y, R, turns, w, c) => {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath();
        for (let i = 0; i <= 160; i++) { const s = i / 160, a = s * turns * TAU, rr = R * s; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
        g.stroke();
      };
      const rosette = (x, y, R, p, c1, c2) => {
        g.fillStyle = c1;
        for (let k = 0; k < p; k++) { const a = (k / p) * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55, R * 0.5, R * 0.22, a, 0, TAU); g.fill(); }
        g.fillStyle = c2; g.beginPath(); g.arc(x, y, R * 0.3, 0, TAU); g.fill();
      };
      const rings = (x, y, R, n2) => { for (let k = n2; k > 0; k--) { g.fillStyle = col(); g.beginPath(); g.arc(x, y, (R * k) / n2, 0, TAU); g.fill(); } };
      const lemni = (x, y, a, c, w) => {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath();
        for (let i = 0; i <= 120; i++) { const s = (i / 120) * TAU, d = 1 + Math.sin(s) ** 2; const px = x + (a * Math.cos(s)) / d, py = y + (a * Math.sin(s) * Math.cos(s)) / d; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
        g.stroke();
      };
      const curl = (x, y, len, c) => {
        g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.bezierCurveTo(x + r.range(-len, len), y + r.range(-len, len), x + r.range(-len, len), y + r.range(-len, len), (x += r.range(-len, len) * 0.6), (y += r.range(-len, len) * 0.6));
        g.stroke();
      };
      // l'axe central : un grand motif, puis d'autres qui s'y accrochent
      const kind = n % 3;
      if (kind === 0) rings(KW / 2, KH * 0.45, 120, 6);
      else if (kind === 1) { rosette(KW / 2, KH * 0.45, 150, 8 + (n % 4) * 2, col(), col()); rosette(KW / 2, KH * 0.45, 70, 6, col(), col()); }
      else spiral(KW / 2, KH * 0.45, 150, 4, 14, col());
      for (let k = 0; k < 8; k++) {
        const x = r.range(40, KW - 40), y = r.range(40, KH - 40), t2 = Math.floor(r() * 5);
        if (t2 === 0) spiral(x, y, r.range(25, 60), r.range(2, 4), r.range(3, 7), col());
        else if (t2 === 1) rosette(x, y, r.range(25, 55), 5 + Math.floor(r() * 6), col(), col());
        else if (t2 === 2) rings(x, y, r.range(18, 45), 3 + Math.floor(r() * 3));
        else if (t2 === 3) lemni(x, y, r.range(30, 70), col(), r.range(3, 7));
        else { g.fillStyle = col(); g.beginPath(); g.ellipse(x, y, r.range(14, 30), r.range(26, 50), r() * TAU, 0, TAU); g.fill(); g.fillStyle = col(); g.beginPath(); g.ellipse(x, y, 8, 14, 0, 0, TAU); g.fill(); }
      }
      for (let k = 0; k < 40; k++) { g.fillStyle = col(); g.beginPath(); g.arc(r() * KW, r() * KH, r.range(2, 7), 0, TAU); g.fill(); }
      for (let k = 0; k < 6; k++) curl(r() * KW, r() * KH, 40, k % 2 ? 'rgba(40,30,40,0.55)' : 'rgba(255,255,255,0.7)');
    }
    function makeDoor(L) {
      const dw = Math.round(L.S * 0.84), dh = Math.round(L.floorY - (L.cy - L.S * 0.62));
      const key = `${dw}x${dh}`;
      if (door && doorKey === key) return door;
      doorKey = key;
      door = makeCanvas(dw + 28, dh + 14);
      const g = door.getContext('2d'), r = rng(5);
      g.fillStyle = '#2b1d14';
      g.fillRect(0, 0, dw + 28, dh + 14);
      g.fillStyle = 'rgba(255,220,180,0.08)';
      g.fillRect(0, 0, dw + 28, 3);
      const wg = g.createLinearGradient(14, 0, 14 + dw, 0);
      wg.addColorStop(0, '#5a3923'); wg.addColorStop(0.5, '#6a4329'); wg.addColorStop(1, '#4c301d');
      g.fillStyle = wg;
      g.fillRect(14, 14, dw, dh);
      g.strokeStyle = 'rgba(30,15,5,0.25)';
      g.lineWidth = 1;
      for (let k = 0; k < 40; k++) { const x = 14 + r() * dw; g.beginPath(); g.moveTo(x, 14); for (let y = 14; y < dh + 14; y += 20) g.lineTo(x + Math.sin(y * 0.03 + k) * 3, y); g.stroke(); }
      const m = 18, pw = (dw - 3 * m) / 2, x1 = 14 + m, x2 = 14 + 2 * m + pw;
      const kyD = 14 + L.S * 0.62, y1 = 14 + m, h1 = Math.max(20, kyD - L.S * 0.32 - y1), y2 = kyD + L.S * 0.38, h2 = Math.max(20, 14 + dh - m * 1.5 - y2);
      for (const [x, y, w2, hh] of [[x1, y1, pw, h1], [x2, y1, pw, h1], [x1, y2, pw, h2], [x2, y2, pw, h2]]) {
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y, w2, hh);
        g.strokeStyle = 'rgba(255,220,180,0.12)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w2 - 6, hh - 6);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeRect(x, y, w2, hh);
      }
      return door;
    }
    paintNumber(num);
    const geo = L => ({ kx: L.cx, ky: L.cy, kr: L.S * 0.1 * (1 + lean * 0.9), slot: L.S * 0.15 * (1 + lean * 0.9), dx0: L.cx - L.S * 0.42, dy0: L.cy - L.S * 0.62 });
    function keyholePath(ctx, g) {
      ctx.beginPath();
      ctx.arc(g.kx, g.ky, g.kr, Math.PI * 0.68, Math.PI * 0.32 + TAU);
      ctx.lineTo(g.kx + g.kr * 0.75, g.ky + g.kr + g.slot);
      ctx.lineTo(g.kx - g.kr * 0.75, g.ky + g.kr + g.slot);
      ctx.closePath();
    }
    return {
      extra: () => `N° ${num} · ${AGES[ageOf(num)].age}`,
      hit(x, y, L) { const g = geo(L); return Math.abs(x - g.kx) < L.S * 0.16 && y > g.ky - L.S * 0.2 && y < g.ky + L.S * 0.3; },
      update(dt, t, L) {
        const g = geo(L);
        const near = input.inside && Math.hypot(input.x - g.kx, input.y - g.ky) < L.S * 0.22;
        lean += ((near ? 1 : 0) - lean) * Math.min(1, dt * 3);
        const tx = input.inside ? clamp((input.x - g.kx) / (L.S * 0.6), -1, 1) : Math.sin(t * 0.17);
        const ty = input.inside ? clamp((input.y - g.ky) / (L.S * 0.6), -1, 1) : Math.sin(t * 0.11 + 2);
        look.x += (tx - look.x) * Math.min(1, dt * 3);
        look.y += (ty - look.y) * Math.min(1, dt * 3);
        flash = Math.max(0, flash - dt * 1.5);
        keyTurn = Math.max(0, keyTurn - dt * 2);
      },
      draw(ctx, L, t) {
        const g = geo(L), d = makeDoor(L);
        const dw = d.width - 28;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(g.dx0 - 14 + 8, g.dy0 - 14 + 6, d.width, d.height);
        ctx.drawImage(d, g.dx0 - 14, g.dy0 - 14);
        // la poignée
        ctx.fillStyle = '#c9a24a';
        ctx.beginPath(); ctx.arc(g.dx0 + dw * 0.86, g.ky + L.S * 0.05, L.S * 0.028, 0, TAU); ctx.fill();
        // la lumière qui fuit par la serrure
        const A = AGES[ageOf(num)], lc = A.bg[1];
        ctx.globalCompositeOperation = 'lighter';
        const lg = ctx.createRadialGradient(g.kx, g.ky + g.kr * 0.6, 2, g.kx, g.ky + g.kr * 0.6, L.S * (0.4 + flash * 0.4));
        lg.addColorStop(0, lc + '55'); lg.addColorStop(1, lc + '00');
        ctx.fillStyle = lg;
        ctx.fillRect(g.kx - L.S, g.ky - L.S, L.S * 2, L.S * 2);
        ctx.globalCompositeOperation = 'source-over';
        // l'entrée de serrure en laiton
        const er = L.S * 0.15 * (1 + lean * 0.6);
        const eg = ctx.createLinearGradient(g.kx - er, g.ky - er, g.kx + er, g.ky + er * 1.4);
        eg.addColorStop(0, '#f0d27a'); eg.addColorStop(0.5, '#a57c25'); eg.addColorStop(1, '#d9b45a');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.ellipse(g.kx, g.ky + g.kr * 0.5, er, er * 1.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(80,55,10,0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(g.kx, g.ky + g.kr * 0.5, er * 0.88, er * 1.38, 0, 0, TAU); ctx.stroke();
        // ce qu'on voit par le trou : un des Dix Plus Grands, en parallaxe
        ctx.save();
        keyholePath(ctx, g);
        ctx.clip();
        const sc = (L.S * 0.0026) * (1 + lean * 0.8);
        const fx = KW / 2 + look.x * KW * 0.38, fy = KH / 2 + look.y * KH * 0.36;
        ctx.drawImage(kc, g.kx - fx * sc, g.ky + g.kr * 0.4 - fy * sc, KW * sc, KH * sc);
        if (flash > 0) { ctx.fillStyle = `rgba(255,250,235,${flash * 0.6})`; ctx.fillRect(g.kx - L.S, g.ky - L.S, L.S * 2, L.S * 2); }
        const ig = ctx.createRadialGradient(g.kx, g.ky + g.kr * 0.4, g.kr * 0.5, g.kx, g.ky + g.kr * 0.4, g.kr + g.slot);
        ig.addColorStop(0, 'rgba(0,0,0,0)'); ig.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = ig;
        ctx.fillRect(g.kx - L.S, g.ky - L.S, L.S * 2, L.S * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(40,25,5,0.85)';
        ctx.lineWidth = 2;
        keyholePath(ctx, g);
        ctx.stroke();
        // la clé qui tourne, une fraction de seconde
        if (keyTurn > 0) {
          ctx.save();
          ctx.translate(g.kx, g.ky + g.kr * 0.5);
          ctx.rotate((1 - keyTurn) * Math.PI / 2);
          ctx.fillStyle = `rgba(200,160,70,${keyTurn})`;
          ctx.fillRect(-3, -g.kr * 1.2, 6, g.kr * 2.4);
          ctx.restore();
        }
        // pencher la tête : tout le reste s'assombrit
        if (lean > 0.02) {
          const vg = ctx.createRadialGradient(g.kx, g.ky, g.kr * 2, g.kx, g.ky, L.S * 1.3);
          vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${lean * 0.55})`);
          ctx.fillStyle = vg;
          ctx.fillRect(L.ox, 0, W, H);
        }
      },
      tap(x, y, L) {
        if (!this.hit(x, y, L)) return false;
        num = (num % 10) + 1;
        paintNumber(num);
        seenNums.add(num);
        if (seenNums.size >= 10) secrets.find('dixgrands');
        flash = 1; keyTurn = 1;
        audio.noise({ freq: 3200, q: 2, dur: 0.05, vel: 0.1, type: 'bandpass' });
        audio.noise({ freq: 1800, q: 2, dur: 0.05, vel: 0.08, type: 'bandpass', at: 0.12 });
        const base = [0, 2, 4, 6][ageOf(num)];
        [0, 2, 4].forEach((d, k) => audio.note(base + d, { type: 'glass', vel: 0.06, dur: 2.5, at: 0.2 + k * 0.1, oct: 1 }));
        return true;
      },
    };
  }

  // ═════════════════════════ Salle VII · Delaunay, dans la Roue de bicyclette de Duchamp
  function makeDelaunay() {
    const DISC = [
      ['#e8402a', '#2f6fd1', '#f3c23b', '#1d9a6c'],
      ['#2f6fd1', '#f08a2c', '#7a3fa0', '#f3e24b'],
      ['#f3c23b', '#d83b5e', '#2fa4c9', '#e8642a'],
      ['#1d9a6c', '#f3e24b', '#e8402a', '#3d4fb8'],
      ['#d83b5e', '#58b8e8', '#f08a2c', '#7a3fa0'],
      ['#3d4fb8', '#e8642a', '#9fd36a', '#f3c23b'],
      ['#f3eee2', '#20263c', '#f3eee2', '#20263c'],
    ];
    let phi = 0, w = 0.6, tickAcc = 0, spun = false, drg = null;
    const geo = L => { const seatY = L.floorY - L.S * 0.52, RW = L.S * 0.37; return { seatY, RW, hx: L.cx, hy: seatY - RW - L.S * 0.06 }; };
    function disc(ctx, x, y, R, a) {
      const n = DISC.length;
      for (let i = n - 1; i >= 0; i--) {
        const r1 = (R * (i + 1)) / n;
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = DISC[i][k];
          ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r1, a + (k * Math.PI) / 2, a + ((k + 1) * Math.PI) / 2); ctx.closePath(); ctx.fill();
        }
      }
    }
    return {
      extra: () => (Math.abs(w) > 2 ? `${(Math.abs(w) / TAU).toFixed(1).replace('.', ',')} tours par seconde` : ''),
      hit(x, y, L) { const g = geo(L); return Math.hypot(x - g.hx, y - g.hy) < g.RW * 1.08; },
      update(dt) {
        w *= Math.exp(-dt * 0.32);
        if (Math.abs(w) < 0.25 && !drg) w += (0.25 * Math.sign(w || 1) - w) * dt * 0.5; // elle ne s'arrête jamais tout à fait
        phi += w * dt;
        // le cliquet de la roue libre
        tickAcc += Math.abs(w) * dt;
        const step = Math.max(TAU / 36, Math.abs(w) / 22);
        if (tickAcc > step) { tickAcc %= step; audio.noise({ freq: 5200, q: 3, dur: 0.018, vel: 0.022 + Math.min(0.03, Math.abs(w) * 0.002), type: 'bandpass', send: 0.1 }); }
        if (Math.abs(w) > 16 && !spun) {
          spun = true;
          secrets.find('duchamp');
          [0, 2, 4, 7].forEach((d, k) => audio.note(d + 3, { type: 'bell', vel: 0.08, dur: 2.5, at: k * 0.08 }));
        }
        if (Math.abs(w) < 6) spun = false;
      },
      draw(ctx, L) {
        const { seatY, RW, hx, hy } = geo(L), S = L.S, fy = L.floorY;
        // le tabouret de cuisine, peint en blanc
        const sw = S * 0.21, legs = [[-sw * 0.92, -sw * 1.12, 0.8], [sw * 0.92, sw * 1.12, 0.8], [-sw * 0.55, -sw * 0.68, 1], [sw * 0.55, sw * 0.68, 1]];
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(L.cx + 6, fy - 2, sw * 1.4, 7, 0, 0, TAU); ctx.fill();
        ctx.lineCap = 'round';
        for (const [x0, x1, k] of legs) {
          ctx.strokeStyle = k < 1 ? '#bdb6a8' : '#e9e4d8';
          ctx.lineWidth = S * 0.026;
          ctx.beginPath(); ctx.moveTo(L.cx + x0, seatY + S * 0.03); ctx.lineTo(L.cx + x1, fy - (k < 1 ? 8 : 2)); ctx.stroke();
        }
        ctx.strokeStyle = '#d8d2c4';
        ctx.lineWidth = S * 0.016;
        const ry = lerp(seatY, fy, 0.62);
        ctx.beginPath(); ctx.moveTo(L.cx - sw * 0.98, ry); ctx.lineTo(L.cx + sw * 0.98, ry); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#cfc8ba';
        ctx.fillRect(L.cx - sw, seatY, sw * 2, S * 0.035);
        ctx.fillStyle = '#f1ede4';
        ctx.beginPath(); ctx.ellipse(L.cx, seatY, sw, S * 0.04, 0, 0, TAU); ctx.fill();
        // la fourche, plantée dans le tabouret
        const fg = ctx.createLinearGradient(hx - 5, 0, hx + 5, 0);
        fg.addColorStop(0, '#5d6066'); fg.addColorStop(0.5, '#eef0f4'); fg.addColorStop(1, '#55585e');
        ctx.fillStyle = fg;
        ctx.fillRect(hx - 4, hy, 8, seatY - hy);
        ctx.fillRect(hx - 9, seatY - S * 0.06, 18, S * 0.03);
        // le disque, qui tourne ; vite, ses couleurs se mêlent dans l'œil
        const R = RW * 0.96;
        const span = Math.min(Math.PI, Math.abs(w) * 0.05), nCopies = Math.max(1, Math.min(12, Math.ceil(span / 0.06)));
        for (let k = 0; k < nCopies; k++) {
          ctx.globalAlpha = 1 / (k + 1);
          disc(ctx, hx, hy, R, phi - (nCopies > 1 ? (span * k) / (nCopies - 1) : 0) * Math.sign(w));
        }
        ctx.globalAlpha = 1;
        // rayons croisés et jante
        ctx.strokeStyle = `rgba(230,232,240,${clamp(0.75 - Math.abs(w) * 0.03, 0.12, 0.75)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 32; k++) {
          const a = phi + (k / 32) * TAU, b2 = a + (k % 2 ? 0.32 : -0.32);
          ctx.moveTo(hx + Math.cos(a) * 7, hy + Math.sin(a) * 7); ctx.lineTo(hx + Math.cos(b2) * RW, hy + Math.sin(b2) * RW);
        }
        ctx.stroke();
        if (Math.abs(w) > 8) { ctx.fillStyle = `rgba(220,224,232,${Math.min(0.18, Math.abs(w) * 0.006)})`; ctx.beginPath(); ctx.arc(hx, hy, RW, 0, TAU); ctx.fill(); }
        const rg = ctx.createLinearGradient(hx - RW, hy - RW, hx + RW, hy + RW);
        rg.addColorStop(0, '#d9dce2'); rg.addColorStop(0.5, '#5f636b'); rg.addColorStop(1, '#c4c8cf');
        ctx.strokeStyle = rg;
        ctx.lineWidth = Math.max(5, S * 0.022);
        ctx.beginPath(); ctx.arc(hx, hy, RW, 0, TAU); ctx.stroke();
        const hg = ctx.createRadialGradient(hx - 2, hy - 2, 1, hx, hy, 9);
        hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#6a6e76');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill();
      },
      down(p, L) { const g = geo(L); if (Math.hypot(p.x - g.hx, p.y - g.hy) > g.RW * 1.08) return false; drg = { a: Math.atan2(p.y - g.hy, p.x - g.hx), t: engine.t }; return true; },
      move(p, L) {
        if (!drg) return;
        const g = geo(L), a = Math.atan2(p.y - g.hy, p.x - g.hx), dt = Math.max(0.008, engine.t - drg.t);
        const wNew = clamp(angleDiff(a, drg.a) / dt, -40, 40);
        w += (wNew - w) * 0.5;
        drg.a = a; drg.t = engine.t;
      },
      up() { drg = null; },
      tap(x, y, L) {
        const g = geo(L);
        if (Math.hypot(x - g.hx, y - g.hy) > g.RW * 1.08) return false;
        w += 4.4 * (Math.sign(w) || 1);
        audio.noise({ freq: 1400, q: 1, dur: 0.12, vel: 0.05, type: 'bandpass' });
        return true;
      },
    };
  }

  // ═════════════════════════ Salle VIII · Matisse, sur un cerf-volant
  function makeMatisse() {
    const r = rng(1946);
    const k = { x: 0, y: 0, vx: 0, vy: 0, roll: 0, loop: -1, spin: 0 };
    const tail = Array.from({ length: 11 }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
    let tailInit = false;
    const SHAPES = ['algue', 'oiseau', 'poisson', 'meduse', 'corail', 'oiseau', 'algue', 'etoile', 'poisson', 'oiseau', 'corail', 'algue'];
    const cells = [];
    for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) cells.push({ row, col, shape: (row * 4 + col) % 3 === 1 ? null : SHAPES[(row * 5 + col * 3) % SHAPES.length], rot: r.range(-0.6, 0.6), ph: r() * TAU, flip: r() < 0.5 ? -1 : 1 });
    const BOWS = ['#d6402f', '#f2c42a', '#2f8a4a', '#e57aa8', '#f08a2c', '#2f62b0'];
    function shape(ctx, name) {
      ctx.beginPath();
      if (name === 'oiseau') {
        ctx.moveTo(-1, 0.15); ctx.quadraticCurveTo(-0.55, -0.6, 0, 0); ctx.quadraticCurveTo(0.55, -0.6, 1, 0.15);
        ctx.quadraticCurveTo(0.5, -0.2, 0.08, 0.3); ctx.lineTo(-0.08, 0.3); ctx.quadraticCurveTo(-0.5, -0.2, -1, 0.15);
        ctx.fill();
      } else if (name === 'algue') {
        ctx.fillRect(-0.05, -0.95, 0.1, 1.9);
        for (let i = 0; i < 6; i++) { const y = -0.8 + i * 0.3, s = i % 2 ? 1 : -1; ctx.moveTo(0, y); ctx.ellipse(s * 0.3, y, 0.34, 0.14, s * -0.5, 0, TAU); }
        ctx.fill();
      } else if (name === 'poisson') {
        ctx.ellipse(-0.1, 0, 0.62, 0.3, 0, 0, TAU); ctx.moveTo(0.45, 0); ctx.lineTo(0.95, -0.35); ctx.lineTo(0.85, 0); ctx.lineTo(0.95, 0.35); ctx.closePath();
        ctx.fill('nonzero');
      } else if (name === 'meduse') {
        ctx.ellipse(0, -0.3, 0.55, 0.42, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 0.1; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const x = -0.36 + i * 0.24; ctx.moveTo(x, -0.3); ctx.quadraticCurveTo(x + 0.15, 0.2, x - 0.05, 0.85); }
        ctx.stroke();
      } else if (name === 'corail') {
        ctx.lineWidth = 0.16; ctx.lineCap = 'round';
        ctx.moveTo(0, 0.9); ctx.lineTo(0, 0); ctx.lineTo(-0.5, -0.5); ctx.moveTo(0, 0.1); ctx.lineTo(0.55, -0.4); ctx.lineTo(0.6, -0.85); ctx.moveTo(0.55, -0.4); ctx.lineTo(0.85, -0.55); ctx.moveTo(-0.5, -0.5); ctx.lineTo(-0.45, -0.9); ctx.moveTo(-0.5, -0.5); ctx.lineTo(-0.85, -0.6); ctx.moveTo(0, 0); ctx.lineTo(0.05, -0.75);
        ctx.stroke(); ctx.lineCap = 'butt';
      } else {
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * TAU; ctx.moveTo(0, 0); ctx.ellipse(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.45, 0.17, a, 0, TAU); }
        ctx.fill();
      }
    }
    const geo = L => { const S = L.S; return { ax: L.cx, ay: L.cy - S * 0.04, w: S * 0.27, h1: S * 0.25, h2: S * 0.42, post: [L.cx - Math.min(S * 0.62, W * 0.38), L.floorY] }; };
    const toLocal = (x, y, g) => { const c = Math.cos(-k.roll), s = Math.sin(-k.roll), dx = x - (g.ax + k.x), dy = y - (g.ay + k.y); return [dx * c - dy * s, dx * s + dy * c]; };
    const inKite = (lx, ly, g) => Math.abs(lx) / g.w + (ly < 0 ? -ly / g.h1 : ly / g.h2) <= 1;
    return {
      hit(x, y, L) { const g = geo(L), [lx, ly] = toLocal(x, y, g); return inKite(lx, ly, g); },
      update(dt, t, L) {
        const g = geo(L);
        const wind = 0.6 + 0.4 * noise.n2(t * 0.15, 3.7);
        let fx = -k.x * 2.2 + Math.sin(t * 0.5) * 30 * wind, fy = -k.y * 2.2 + Math.cos(t * 0.37) * 18;
        if (input.inside) {
          const dx = g.ax + k.x - input.x, dy = g.ay + k.y - input.y, d = Math.hypot(dx, dy), sp = Math.hypot(input.vx, input.vy);
          if (d < L.S * 0.8 && sp > 120) { fx += input.vx * 1.6 * (1 - d / (L.S * 0.8)); fy += input.vy * 1.2 * (1 - d / (L.S * 0.8)); }
        }
        k.vx += (fx - k.vx * 1.5) * dt; k.vy += (fy - k.vy * 1.5) * dt;
        k.x = clamp(k.x + k.vx * dt, -L.S * 0.25, L.S * 0.25); k.y = clamp(k.y + k.vy * dt, -L.S * 0.15, L.S * 0.12);
        let roll = clamp(k.vx * 0.004, -0.5, 0.5) + 0.06 * Math.sin(t * 0.9);
        if (k.loop >= 0) { k.loop += dt; roll += TAU * easeInOut(clamp(k.loop / 1.3, 0, 1)); if (k.loop > 1.3) k.loop = -1; }
        k.roll += angleDiff(roll, k.roll) * Math.min(1, dt * 6);
        if (k.loop >= 0) k.roll = roll;
        // la queue : une chaîne de Verlet, nouée de rubans
        const c = Math.cos(k.roll), s = Math.sin(k.roll), bx = g.ax + k.x - s * g.h2, by = g.ay + k.y + c * g.h2, seg = L.S * 0.043;
        if (!tailInit || Math.hypot(tail[0].x - bx, tail[0].y - by) > 120) { tail.forEach((p, i) => { p.x = p.px = bx; p.y = p.py = by + i * seg; }); tailInit = true; }
        tail[0].x = bx; tail[0].y = by;
        for (let i = 1; i < tail.length; i++) {
          const p = tail[i], vx = (p.x - p.px) * 0.97, vy = (p.y - p.py) * 0.97;
          p.px = p.x; p.py = p.y;
          p.x += vx + (110 + 120 * wind + Math.sin(t * 2.6 + i * 0.7) * 90) * dt * dt;
          p.y += vy + 210 * dt * dt;
        }
        for (let it = 0; it < 3; it++) for (let i = 1; i < tail.length; i++) {
          const a = tail[i - 1], b = tail[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, e = (d - seg) / d;
          if (i > 1) { a.x += dx * e * 0.5; a.y += dy * e * 0.5; b.x -= dx * e * 0.5; b.y -= dy * e * 0.5; } else { b.x -= dx * e; b.y -= dy * e; }
        }
      },
      draw(ctx, L, t) {
        const g = geo(L), x = g.ax + k.x, y = g.ay + k.y;
        // le poteau de musée, et la ficelle qui y est nouée
        const [px, py] = g.post, ph = L.S * 0.34;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(px + 4, py - 1, 16, 5, 0, 0, TAU); ctx.fill();
        const pg = ctx.createLinearGradient(px - 4, 0, px + 4, 0);
        pg.addColorStop(0, '#7a5a1a'); pg.addColorStop(0.5, '#f2d98a'); pg.addColorStop(1, '#8a6a22');
        ctx.fillStyle = pg;
        ctx.fillRect(px - 3.5, py - ph, 7, ph);
        ctx.beginPath(); ctx.ellipse(px, py - 3, 14, 4.5, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(px, py - ph, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(240,235,225,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py - ph); ctx.quadraticCurveTo((px + x) / 2, (py - ph + y) / 2 + L.S * 0.18, x, y + g.h2 * 0.1); ctx.stroke();
        // la queue et ses rubans
        ctx.strokeStyle = 'rgba(240,235,225,0.6)';
        ctx.beginPath(); tail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        for (let i = 2; i < tail.length; i += 2) {
          const p = tail[i], q2 = tail[i - 1], a = Math.atan2(p.y - q2.y, p.x - q2.x) + Math.PI / 2, s2 = L.S * 0.028;
          ctx.fillStyle = BOWS[(i / 2) % BOWS.length];
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * s2 + Math.cos(a - 1.2) * s2 * 0.5, p.y + Math.sin(a) * s2 + Math.sin(a - 1.2) * s2 * 0.5); ctx.lineTo(p.x + Math.cos(a) * s2 + Math.cos(a + 1.2) * s2 * 0.5, p.y + Math.sin(a) * s2 + Math.sin(a + 1.2) * s2 * 0.5);
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * s2 + Math.cos(a - 1.2) * s2 * 0.5, p.y - Math.sin(a) * s2 + Math.sin(a - 1.2) * s2 * 0.5); ctx.lineTo(p.x - Math.cos(a) * s2 + Math.cos(a + 1.2) * s2 * 0.5, p.y - Math.sin(a) * s2 + Math.sin(a + 1.2) * s2 * 0.5);
          ctx.fill();
        }
        // le cerf-volant : un losange de mer, des découpes blanches
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(k.roll);
        const kite = () => { ctx.beginPath(); ctx.moveTo(0, -g.h1); ctx.lineTo(g.w, 0); ctx.lineTo(0, g.h2); ctx.lineTo(-g.w, 0); ctx.closePath(); };
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.save(); ctx.translate(10, 14); kite(); ctx.fill(); ctx.restore();
        kite();
        ctx.save();
        ctx.clip();
        const cw = (g.w * 2) / 4, ch = (g.h1 + g.h2) / 6;
        for (const c of cells) {
          const cx2 = -g.w + c.col * cw, cy2 = -g.h1 + c.row * ch;
          ctx.fillStyle = (c.row + c.col) % 2 ? '#3a6fb8' : '#77a6dc';
          ctx.fillRect(cx2 - 0.5, cy2 - 0.5, cw + 1, ch + 1);
        }
        ctx.fillStyle = '#f3efe3';
        ctx.strokeStyle = '#f3efe3';
        for (const c of cells) {
          if (!c.shape) continue;
          ctx.save();
          ctx.translate(-g.w + (c.col + 0.5) * cw, -g.h1 + (c.row + 0.5) * ch);
          ctx.rotate(c.rot + 0.12 * Math.sin(t * 1.2 + c.ph));
          const s = Math.min(cw, ch) * 0.42;
          ctx.scale(s * c.flip, s);
          shape(ctx, c.shape);
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(40,25,10,0.3)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, -g.h1); ctx.lineTo(0, g.h2); ctx.moveTo(-g.w, 0); ctx.lineTo(g.w, 0); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(30,20,10,0.65)';
        ctx.lineWidth = 1.5;
        kite();
        ctx.stroke();
        ctx.restore();
      },
      tap(x, y, L) {
        if (!this.hit(x, y, L) || k.loop >= 0) return false;
        k.loop = 0;
        audio.noise({ freq: 700, q: 0.8, dur: 1.1, vel: 0.07, type: 'bandpass', sweep: 2.5, send: 0.5 });
        audio.note(7, { type: 'bell', vel: 0.08, dur: 2.5, at: 0.6 });
        return true;
      },
    };
  }

  // ═════════════════════════ Salle IX · L'art optique, dans l'iris d'un œil
  function makeOp() {
    const MODES = [
      { name: 'Vertige', tint: ['#bff3ff', '#3a8bd5', '#14214f'] },
      { name: 'Spirale', tint: ['#ffd6f5', '#b04fc4', '#2d0f4a'] },
      { name: 'Moiré', tint: ['#fff3c4', '#5fb07a', '#10301f'] },
    ];
    let mode = 0, oc = null, ox = null, ocR = 0, blinkT = -1, nextBlink = 3, sac = { x: 0, y: 0, t: 0 };
    const gaze = { x: 0, y: 0 };
    const r = rng(1965);
    const veins = Array.from({ length: 7 }, () => { const side = r.sign(); return { side, y: r.range(-0.3, 0.3), pts: Array.from({ length: 4 }, (_, i) => [1 - i * 0.12 - r() * 0.05, r.range(-0.12, 0.12)]) }; });
    const geo = L => { const ew = Math.min(L.S * 0.5, W * 0.45); return { x: L.cx, y: L.cy, ew, eu: ew * 0.62, el: ew * 0.46, RI: ew * 0.5 }; };
    function iris(RI, t) {
      const dpr = Math.min(2, engine.dpr || 1), size = Math.ceil(RI * 2 * dpr);
      if (!oc || ocR !== size) { oc = makeCanvas(size, size); ox = oc.getContext('2d'); ocR = size; }
      const s = size / (RI * 2), o = ox;
      o.setTransform(s, 0, 0, s, 0, 0);
      o.globalCompositeOperation = 'source-over';
      o.fillStyle = '#000';
      o.fillRect(0, 0, RI * 2, RI * 2);
      const c = RI, gx = c + gaze.x * RI * 0.35, gy = c + gaze.y * RI * 0.35;
      const ringSet = (x0, y0, n, amp, k0) => {
        o.beginPath();
        for (let k = n; k >= 1; k--) {
          const base = (k / n) * RI * 1.45;
          for (let i = 0; i <= 90; i++) {
            const a = (i / 90) * TAU, rr = base + amp * Math.sin(6 * a + t * 1.3 + k * k0);
            const px = x0 + Math.cos(a) * rr, py = y0 + Math.sin(a) * rr;
            if (i) o.lineTo(px, py); else o.moveTo(px, py);
          }
          o.closePath();
        }
        o.fill('evenodd');
      };
      o.fillStyle = '#fff';
      if (mode === 0) {
        ringSet(gx, gy, 16, RI * 0.025, 0.5);
        o.globalCompositeOperation = 'difference';
        o.beginPath();
        const nW = 28, a0 = t * 0.15;
        for (let j = 0; j < nW; j += 2) { o.moveTo(c, c); o.arc(c, c, RI * 1.5, a0 + (j / nW) * TAU, a0 + ((j + 1) / nW) * TAU); o.closePath(); }
        o.fill();
      } else if (mode === 1) {
        ringSet(c, c, 12, 0, 0);
        o.globalCompositeOperation = 'difference';
        const arms = 10, tw = 3.2;
        for (let j = 0; j < arms; j++) {
          const a0 = (j / arms) * TAU - t * 0.6, wA = TAU / arms / 2;
          o.beginPath();
          for (let i = 0; i <= 40; i++) { const rr = (i / 40) * RI * 1.5, a = a0 + (rr / RI) * tw; const px = gx + Math.cos(a) * rr, py = gy + Math.sin(a) * rr; if (i) o.lineTo(px, py); else o.moveTo(px, py); }
          for (let i = 40; i >= 0; i--) { const rr = (i / 40) * RI * 1.5, a = a0 + wA + (rr / RI) * tw; o.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr); }
          o.closePath();
          o.fill();
        }
      } else {
        ringSet(c, c, 22, 0, 0);
        o.globalCompositeOperation = 'difference';
        ringSet(c + gaze.x * RI * 0.18 + Math.sin(t * 0.7) * RI * 0.06, c + gaze.y * RI * 0.18 + Math.cos(t * 0.5) * RI * 0.06, 22, 0, 0);
      }
      o.globalCompositeOperation = 'multiply';
      const T = MODES[mode].tint, gr = o.createRadialGradient(c, c, RI * 0.1, c, c, RI);
      gr.addColorStop(0, T[0]); gr.addColorStop(0.55, T[1]); gr.addColorStop(1, T[2]);
      o.fillStyle = gr;
      o.fillRect(0, 0, RI * 2, RI * 2);
      o.globalCompositeOperation = 'source-over';
      return oc;
    }
    return {
      extra: () => MODES[mode].name,
      hit(x, y, L) { const g = geo(L); return Math.abs(x - g.x) < g.ew && Math.abs(y - g.y) < g.eu * 0.9; },
      update(dt, t, L) {
        const g = geo(L);
        let tx, ty;
        if (input.inside) { tx = clamp((input.x - g.x) / (g.ew * 1.6), -1, 1); ty = clamp((input.y - g.y) / (g.ew * 1.6), -1, 1); }
        else { sac.t -= dt; if (sac.t < 0) { sac.t = 0.8 + Math.random() * 1.8; sac.x = Math.random() * 1.6 - 0.8; sac.y = Math.random() * 1.2 - 0.6; } tx = sac.x; ty = sac.y; }
        gaze.x += (tx - gaze.x) * Math.min(1, dt * 9);
        gaze.y += (ty - gaze.y) * Math.min(1, dt * 9);
        nextBlink -= dt;
        if (nextBlink < 0 && blinkT < 0) { blinkT = 0; nextBlink = 3 + Math.random() * 4; }
        if (blinkT >= 0) { blinkT += dt; if (blinkT > 0.26) blinkT = -1; }
      },
      draw(ctx, L, t) {
        const g = geo(L), { x, y, ew, eu, el, RI } = g;
        const open = blinkT >= 0 ? Math.abs(1 - (blinkT / 0.26) * 2) : 1;
        const U = eu * Math.max(0.04, open), D = el * Math.max(0.04, open);
        const almond = () => { ctx.beginPath(); ctx.moveTo(x - ew, y); ctx.quadraticCurveTo(x, y - U * 2, x + ew, y); ctx.quadraticCurveTo(x, y + D * 2, x - ew, y); ctx.closePath(); };
        // une ombre portée, comme un œil peint sur le mur
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.save(); ctx.translate(7, 10); almond(); ctx.fill(); ctx.restore();
        ctx.save();
        almond();
        ctx.clip();
        const sg = ctx.createRadialGradient(x, y, ew * 0.1, x, y, ew);
        sg.addColorStop(0, '#f7f4ef'); sg.addColorStop(0.7, '#e6dcd4'); sg.addColorStop(1, '#d2a8a0');
        ctx.fillStyle = sg;
        ctx.fillRect(x - ew, y - eu, ew * 2, eu * 2);
        ctx.strokeStyle = 'rgba(190,60,60,0.35)';
        ctx.lineWidth = 0.8;
        for (const v of veins) { ctx.beginPath(); v.pts.forEach(([px, py], i) => { const X = x + v.side * px * ew, Y = y + (v.y + py) * eu; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.stroke(); }
        const ix = x + gaze.x * ew * 0.42, iy = y + gaze.y * eu * 0.3;
        ctx.save();
        ctx.beginPath(); ctx.arc(ix, iy, RI, 0, TAU); ctx.clip();
        ctx.drawImage(iris(RI, t), ix - RI, iy - RI, RI * 2, RI * 2);
        ctx.restore();
        const lim = ctx.createRadialGradient(ix, iy, RI * 0.8, ix, iy, RI);
        lim.addColorStop(0, 'rgba(0,0,0,0)'); lim.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = lim;
        ctx.beginPath(); ctx.arc(ix, iy, RI, 0, TAU); ctx.fill();
        // la pupille : elle se serre quand la main approche
        const near = input.inside ? clamp(1 - Math.hypot(input.x - x, input.y - y) / (ew * 2.5), 0, 1) : 0;
        const RP = RI * (0.34 - near * 0.16 + 0.03 * Math.sin(t * 0.8));
        ctx.fillStyle = '#050505';
        ctx.beginPath(); ctx.arc(ix, iy, RP, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.ellipse(ix - RI * 0.32, iy - RI * 0.36, RI * 0.13, RI * 0.08, -0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(ix + RI * 0.22, iy + RI * 0.3, RI * 0.04, 0, TAU); ctx.fill();
        const lid = ctx.createLinearGradient(0, y - U, 0, y);
        lid.addColorStop(0, 'rgba(60,30,30,0.45)'); lid.addColorStop(1, 'rgba(60,30,30,0)');
        ctx.fillStyle = lid;
        ctx.fillRect(x - ew, y - eu, ew * 2, eu);
        ctx.restore();
        // le trait des paupières, le pli, les cils
        ctx.strokeStyle = '#1b1414';
        ctx.lineWidth = 3;
        almond();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(20,14,14,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - ew * 0.85, y - eu * 0.18); ctx.quadraticCurveTo(x, y - eu * 1.75, x + ew * 0.9, y - eu * 0.12); ctx.stroke();
        ctx.strokeStyle = '#1b1414';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (let i = 1; i < 18; i++) {
          const s = i / 18, bx = (1 - s) * (1 - s) * (x - ew) + 2 * (1 - s) * s * x + s * s * (x + ew), by = (1 - s) * (1 - s) * y + 2 * (1 - s) * s * (y - U * 2) + s * s * y;
          const a = -Math.PI / 2 + (s - 0.5) * 2.2, len = ew * (0.1 + 0.05 * Math.sin(s * Math.PI));
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6, bx + Math.cos(a + 0.3 * Math.sign(s - 0.5)) * len, by + Math.sin(a + 0.3 * Math.sign(s - 0.5)) * len); ctx.stroke();
        }
        ctx.lineCap = 'butt';
      },
      tap(x, y, L) {
        if (!this.hit(x, y, L)) return false;
        blinkT = 0; nextBlink = 4 + Math.random() * 3;
        mode = (mode + 1) % MODES.length;
        audio.note([2, 5, 8][mode], { type: 'glass', vel: 0.08, dur: 2.4, oct: 1 });
        audio.note([2, 5, 8][mode] + 4, { type: 'glass', vel: 0.05, dur: 2.4, oct: 1, at: 0.15 });
        return true;
      },
    };
  }

  const rooms = [makeMondrian(), makeVanGogh(), makeSeurat(), makeKandinsky(), makeHokusai(), makeKlint(), makeDelaunay(), makeMatisse(), makeOp()];

  function resize(w, h) {
    W = w; H = h;
    camX = cur * W;
    cartels.clear();
    grainPat = null;
  }

  function visible() {
    const a = Math.floor(camX / W), b = Math.ceil(camX / W - 1e-6);
    const out = [];
    for (let i = Math.max(0, a); i <= Math.min(N - 1, b); i++) out.push(i);
    if (!out.length) out.push(clamp(Math.round(camX / W), 0, N - 1));
    return out;
  }

  function update(dt, t) {
    if (!drag || drag.kind !== 'pan') camX += (cur * W - camX) * Math.min(1, dt * 7);
    const vis = visible();
    for (const i of vis) rooms[i].update?.(dt, t, layout(i));
    // préparer la salle suivante pendant qu'on regarde celle-ci
    for (const i of [cur + 1, cur - 1]) if (i >= 0 && i < N && rooms[i].ensure && engine.frame % 20 === (i % 20)) rooms[i].ensure();
    if (!settled && Math.abs(camX - cur * W) < 2) {
      settled = true;
      seen.add(cur);
      audio.note(ROOMS[cur].deg, { type: 'soft', vel: 0.07, dur: 2.6, send: 0.6 });
      if (seen.size >= N) secrets.find('vernissage');
    }
    if (magritte) { magritte.t += dt; if (magritte.t > 5.5) magritte = null; }
    labelT -= dt;
    if (labelT < 0 || !settled) {
      labelT = 0.25;
      const ex = rooms[cur].extra?.();
      // sur un petit écran, la barre dit déjà la salle : le libellé ne garde que l'essentiel
      const label = W < 560 ? ex || ROOMS[cur].artist : `Salle ${cur + 1} · ${ROOMS[cur].artist}${ex ? ' · ' + ex : ''}`;
      if (label !== lastLabel) { lastLabel = label; api.label(label); updateBar(); }
    }
  }

  function draw(ctx, t) {
    ctx.fillStyle = '#0b0a09';
    ctx.fillRect(0, 0, W, H);
    for (const i of visible()) {
      const L = layout(i);
      ctx.save();
      ctx.beginPath(); ctx.rect(L.ox, 0, W, H); ctx.clip();
      drawRoomShell(ctx, L, t);
      rooms[i].draw(ctx, L, t);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      drawCartel(ctx, L);
      if (magritte && magritte.i === i) {
        const a = clamp(magritte.t / 0.6, 0, 1) * clamp((5.5 - magritte.t) / 1, 0, 1);
        ctx.font = `italic 300 ${L.P ? 24 : 30}px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(250,244,230,${a})`;
        ctx.fillText('Ceci n’est pas un cadre.', L.cx, L.floorY + (L.P ? 4 : 22));
        ctx.textAlign = 'left';
      }
      ctx.restore();
    }
    // des chevrons discrets aux bords, tant qu'il reste des salles
    ctx.strokeStyle = 'rgba(240,230,215,0.3)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const my = H * 0.45;
    if (cur > 0) { ctx.beginPath(); ctx.moveTo(22, my - 12); ctx.lineTo(12, my); ctx.lineTo(22, my + 12); ctx.stroke(); }
    if (cur < N - 1) { ctx.beginPath(); ctx.moveTo(W - 22, my - 12); ctx.lineTo(W - 12, my); ctx.lineTo(W - 22, my + 12); ctx.stroke(); }
    ctx.lineCap = 'butt';
  }

  // ——— Gestes : glisser pour changer de salle ; sur une œuvre, c'est l'œuvre qui répond
  function down(p) {
    const L = layout(cur);
    if (Math.abs(camX - cur * W) < W * 0.1 && rooms[cur].hit(p.x, p.y, L)) {
      const took = rooms[cur].down?.(p, L);
      drag = { kind: took ? 'room' : 'art', id: p.id, x0: p.x, cam0: camX, lx: p.x, lt: engine.t, vx: 0 };
      return;
    }
    drag = { kind: 'pan', id: p.id, x0: p.x, cam0: camX, lx: p.x, lt: engine.t, vx: 0 };
  }
  function move(p) {
    if (p.hover || !drag || p.id !== drag.id) return;
    if (drag.kind === 'room') { rooms[cur].move?.(p, layout(cur)); return; }
    if (drag.kind === 'art') {
      // un geste parti d'une œuvre qui ne se laisse pas tenir : il devient un glissement de salle
      if (Math.abs(p.x - drag.x0) > 18) drag.kind = 'pan';
      else return;
    }
    let c = drag.cam0 - (p.x - drag.x0);
    if (c < 0) c *= 0.35;
    if (c > (N - 1) * W) c = (N - 1) * W + (c - (N - 1) * W) * 0.35;
    camX = c;
    const dt = Math.max(0.008, engine.t - drag.lt);
    drag.vx = drag.vx * 0.6 + ((p.x - drag.lx) / dt) * 0.4;
    drag.lx = p.x; drag.lt = engine.t;
  }
  function up(p) {
    if (!drag || p.id !== drag.id) return;
    if (drag.kind === 'room') rooms[cur].up?.(p, layout(cur));
    else if (drag.kind === 'pan') {
      const dx = p.x - drag.x0;
      if (dx < -W * 0.16 || drag.vx < -450) goRoom(cur + 1);
      else if (dx > W * 0.16 || drag.vx > 450) goRoom(cur - 1);
    }
    drag = null;
  }
  function tap(p) {
    const L = layout(cur);
    if (rooms[cur].tap?.(p.x, p.y, L)) return;
    if (p.x < 52 && cur > 0) goRoom(cur - 1);
    else if (p.x > W - 52 && cur < N - 1) goRoom(cur + 1);
  }
  function longpress(p) {
    const L = layout(cur);
    if (!rooms[cur].hit(p.x, p.y, L)) return;
    rooms[cur].up?.(p, L);
    drag = null;
    magritte = { i: cur, t: 0 };
    audio.note(0, { type: 'soft', vel: 0.1, dur: 3.5, oct: -1 });
    audio.note(4, { type: 'glass', vel: 0.06, dur: 3, at: 0.4 });
    secrets.find('magritte');
  }
  function key(e) {
    if (e.key === 'ArrowRight') goRoom(cur + 1);
    else if (e.key === 'ArrowLeft') goRoom(cur - 1);
  }
  function wheel(e) {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? Math.abs(e.deltaX) > 30 : Math.abs(e.deltaY) > 60) {
      const now = engine.t;
      if (now - (wheel.last || 0) < 0.6) return;
      wheel.last = now;
      goRoom(cur + Math.sign(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    }
  }

  return {
    resize, update, draw, down, move, up, tap, longpress, key, wheel,
    save() { api.memory?.set('galerie', { room: cur }); },
    words: { magritte: () => { magritte = { i: cur, t: 0 }; secrets.find('magritte'); } },
    destroy() { bar.remove(); },
  };
}
