// Sève — moteur : canvas, boucle, entrées, et les petits outils mathématiques partagés.

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const angleDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Distance d'un point à un segment
export function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return Math.sqrt(dx * dx + dy * dy);
}

// Générateur pseudo-aléatoire déterministe (mulberry32)
export function rng(seed = 1) {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
  };
  return r;
}

// Bruit de simplex 2D / 3D (d'après Stefan Gustavson)
export function makeNoise(seed = 1) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const g = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3 = 1 / 6;

  function n2(xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const k = pm12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (g[k] * x0 + g[k + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const k = pm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (g[k] * x1 + g[k + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const k = pm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (g[k] * x2 + g[k + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  }

  function n3(xin, yin, zin) {
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) { const q = pm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (g[q] * x0 + g[q + 1] * y0 + g[q + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) { const q = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (g[q] * x1 + g[q + 1] * y1 + g[q + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) { const q = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (g[q] * x2 + g[q + 1] * y2 + g[q + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) { const q = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (g[q] * x3 + g[q + 1] * y3 + g[q + 2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }

  function fbm2(x, y, oct = 4) {
    let a = 0.5, f = 1, s = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x * f, y * f); f *= 2; a *= 0.5; }
    return s;
  }
  return { n2, n3, fbm2 };
}

// Couleurs
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// Sprites lumineux pré-rendus : bien plus rapides que shadowBlur
const spriteCache = new Map();
export function glow(c, radius = 32, core = 0.22) {
  const key = c.join(',') + '|' + radius + '|' + core;
  let s = spriteCache.get(key);
  if (s) return s;
  s = document.createElement('canvas');
  const size = Math.ceil(radius * 2);
  s.width = s.height = size;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grd.addColorStop(0, rgba(c, 1));
  grd.addColorStop(core, rgba(c, 0.5));
  grd.addColorStop(0.55, rgba(c, 0.12));
  grd.addColorStop(1, rgba(c, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  spriteCache.set(key, s);
  return s;
}
export function drawGlow(ctx, sprite, x, y, r, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Un calque plein écran à la résolution exacte du canvas : on y dessine en coordonnées CSS, et il se pose
// pixel pour pixel (blit). C'est une simple copie, nette sur les écrans fins, et jusqu'à huit fois plus rapide
// qu'un calque qu'il faut agrandir ou rééchantillonner (même d'un demi-pixel, quand la largeur est arrondie).
export function makeLayer(eng, opaque = false) {
  const c = makeCanvas(eng.canvas.width, eng.canvas.height);
  c.getContext('2d', { alpha: !opaque }).setTransform(eng.dpr, 0, 0, eng.dpr, 0, 0);
  return c;
}
export function blit(ctx, layer) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

// Moteur
export function createEngine(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const eng = {
    canvas, ctx, W: 0, H: 0, dpr: 1,
    baseDpr: Math.min(window.devicePixelRatio || 1, 2),
    dprScale: 1, quality: 1, t: 0, frame: 0, scene: null, paused: false,
    lastInput: performance.now(),
    coarse: window.matchMedia && matchMedia('(pointer: coarse)').matches,
    input: { x: -1e4, y: -1e4, px: -1e4, py: -1e4, vx: 0, vy: 0, down: false, inside: false, type: 'mouse', pointers: new Map() },
    listeners: { resize: [], frame: [] },
  };
  // Petits écrans tactiles : on vise la fluidité avant la finesse
  if (eng.coarse) { eng.baseDpr = Math.min(eng.baseDpr, 1.75); eng.quality = 0.8; }

  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    eng.dpr = Math.max(0.6, eng.baseDpr * eng.dprScale);
    canvas.width = Math.round(W * eng.dpr);
    canvas.height = Math.round(H * eng.dpr);
    eng.W = W;
    eng.H = H;
    eng.scene?.resize?.(W, H);
    for (const fn of eng.listeners.resize) fn(W, H);
  }
  window.addEventListener('resize', resize);
  resize();

  // Entrées : un seul vocabulaire pour la souris, le doigt et le stylet
  const inp = eng.input;
  const toLocal = e => [e.clientX, e.clientY];
  const touchInput = () => { eng.lastInput = performance.now(); };

  canvas.addEventListener('pointerdown', e => {
    touchInput();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* déjà capturé */ }
    const [x, y] = toLocal(e);
    const p = { id: e.pointerId, x, y, sx: x, sy: y, t0: performance.now(), moved: 0, long: false, type: e.pointerType, primary: e.isPrimary };
    inp.pointers.set(e.pointerId, p);
    p.timer = setTimeout(() => {
      if (p.moved < 12 && inp.pointers.has(p.id)) { p.long = true; eng.scene?.longpress?.(p); }
    }, 550);
    if (e.isPrimary) { inp.down = true; inp.x = inp.px = x; inp.y = inp.py = y; inp.type = e.pointerType; inp.inside = true; }
    eng.scene?.down?.(p);
  });
  canvas.addEventListener('pointermove', e => {
    touchInput();
    const [x, y] = toLocal(e);
    const p = inp.pointers.get(e.pointerId);
    if (p) {
      p.moved += Math.hypot(x - p.x, y - p.y);
      p.x = x; p.y = y;
    }
    if (e.isPrimary || !p) { inp.x = x; inp.y = y; inp.inside = true; inp.type = e.pointerType; }
    eng.scene?.move?.(p || { id: e.pointerId, x, y, hover: true, type: e.pointerType });
  });
  const release = e => {
    const p = inp.pointers.get(e.pointerId);
    if (!p) return;
    clearTimeout(p.timer);
    inp.pointers.delete(e.pointerId);
    p.dur = performance.now() - p.t0;
    if (e.isPrimary) inp.down = false;
    if (e.pointerType !== 'mouse' && inp.pointers.size === 0) inp.inside = false;
    eng.scene?.up?.(p);
    if (e.type === 'pointerup' && !p.long && p.dur < 380 && p.moved < 14) eng.scene?.tap?.(p);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') inp.inside = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { touchInput(); eng.scene?.wheel?.(e); }, { passive: true });

  // Boucle et régulateur de performance (?hq le désactive, pour juger le rendu sans carte graphique).
  // Chaque tableau garde sa propre mesure : un tableau lourd n'appauvrit plus ceux qu'on visite après lui,
  // et quand tout est redevenu fluide un long moment, on retente une fois la pleine finesse.
  const params = new URLSearchParams(location.search);
  const governed = !params.has('hq');
  const timeScale = clamp(parseFloat(params.get('vitesse')) || 1, 0.1, 10); // pour observer les cycles longs
  const baseQuality = eng.quality, memo = new Map();
  let sceneKey = null, last = performance.now(), avg = 16.7, sinceChange = 0, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let ms = now - last;
    last = now;
    if (ms > 250) ms = 16.7;
    avg = avg * 0.95 + ms * 0.05;
    sinceChange += ms;
    if (governed && sinceChange > 2500) {
      const m = memo.get(sceneKey);
      if (avg > 27) {
        sinceChange = 0;
        if (eng.dprScale > 0.62) { eng.dprScale *= 0.8; resize(); }
        else if (eng.quality > 0.45) { eng.quality *= 0.8; eng.scene?.quality?.(eng.quality); }
      } else if (m && !m.retried && eng.dprScale < 1 && avg < 18.5 && sinceChange > 12000) {
        m.retried = true;
        sinceChange = 0;
        eng.dprScale = Math.min(1, eng.dprScale / 0.8);
        resize();
      }
    }
    const dt = Math.min(ms / 1000, 0.05) * timeScale;
    eng.t += dt;
    eng.frame++;
    // vitesse lissée du pointeur
    const ivx = (inp.x - inp.px) / Math.max(dt, 0.001), ivy = (inp.y - inp.py) / Math.max(dt, 0.001);
    if (Math.abs(inp.px) < 1e4) { inp.vx = inp.vx * 0.7 + ivx * 0.3; inp.vy = inp.vy * 0.7 + ivy * 0.3; }
    inp.px = inp.x; inp.py = inp.y;
    ctx.setTransform(eng.dpr, 0, 0, eng.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const sc = eng.scene;
    if (sc) {
      sc.update?.(dt, eng.t);
      sc.draw?.(ctx, eng.t);
    }
    for (const fn of eng.listeners.frame) fn(dt, eng.t);
  }
  eng.start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  // juste avant de créer un tableau : il retrouve la finesse qu'il avait, ou la pleine finesse s'il est nouveau
  eng.prepare = key => {
    if (sceneKey !== null) { const m = memo.get(sceneKey); if (m) { m.s = eng.dprScale; m.q = eng.quality; } }
    sceneKey = key;
    let m = memo.get(key);
    if (!m) memo.set(key, (m = { s: 1, q: baseQuality, retried: false }));
    eng.scene = null;
    eng.quality = m.q;
    if (m.s !== eng.dprScale) { eng.dprScale = m.s; resize(); }
  };
  eng.setScene = sc => {
    eng.scene = sc;
    avg = 16.7;
    sinceChange = 0;
  };
  eng.idle = () => (performance.now() - eng.lastInput) / 1000;
  eng.touchInput = touchInput;
  eng.resize = resize;
  return eng;
}
