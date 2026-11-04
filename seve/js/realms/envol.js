// Sève — L'Envol : survoler un monde qui n'existe que dans une carte de hauteurs.
// Rendu « Voxel Space » (Comanche, 1992) : chaque colonne de l'écran plonge dans la carte, de près vers le loin.
import { TAU, clamp, lerp, smoothstep, angleDiff, glow, drawGlow, rgba, mixRgb, makeCanvas, rng } from '../engine.js';

export const mood = {
  root: 146.83, scale: 'lydian', wave: 'triangle', chord: [0, 7, 14], pad: 0.04, cutoff: 1200, lfo: 0.04,
  noise: { type: 'bandpass', freq: 520, q: 0.5, gain: 0.02, gust: 0.7, gustRate: 0.12 },
};

const MAP = 512, MASK = 511;
const WATER = 0.34;
const HS = 92; // hauteur des terres, dans l'unité de la carte
const DAY = 160;
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
  // couleurs : eau, sable, prairie, forêt, roche, neige ; l'ombre vient d'un soleil au nord-ouest
  const col = new Uint32Array(MAP * MAP), H = new Float32Array(MAP * MAP), lights = new Uint8Array(MAP * MAP);
  const at = (x, y) => hgt[((y & MASK) << 9) | (x & MASK)];
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = y * MAP + x, h = hgt[i];
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
    const slope = Math.hypot(dx, dy) * 60;
    const shade = clamp(0.78 + (-dx * 0.7 - dy * 0.7) * 26, 0.35, 1.35);
    const j = (R() - 0.5) * 0.08;
    let c;
    if (h < WATER) { const d = (WATER - h) / WATER; c = [lerp(40, 10, d), lerp(110, 46, d), lerp(130, 90, d)]; }
    else if (h < WATER + 0.025) c = [196, 180, 132];
    else if (h > 0.8 && slope < 2.6) c = [236, 240, 248];
    else if (slope > 2.1 || h > 0.66) c = [lerp(110, 140, h), lerp(98, 128, h), lerp(88, 120, h)];
    else if (h > 0.5 && R() < 0.85) c = [36, 78 + h * 30, 44];
    else c = [lerp(70, 104, h * 2 - 0.6), lerp(124, 150, h), lerp(56, 70, h)];
    const k = (h < WATER ? 1 : shade) * (1 + j);
    col[i] = (Math.min(255, c[2] * k) << 16) | (Math.min(255, c[1] * k) << 8) | Math.min(255, c[0] * k);
    H[i] = (h < WATER ? WATER : h) * HS; // la surface de l'eau est plate
  }
  // villages : quelques lumières sur des terres plates, pour la nuit
  for (let v = 0; v < 46; v++) {
    for (let tries = 0; tries < 60; tries++) {
      const x = (R() * MAP) | 0, y = (R() * MAP) | 0, h = hgt[y * MAP + x];
      if (h < WATER + 0.04 || h > 0.55) continue;
      for (let k = 0; k < 5; k++) lights[(((y + ((R() * 5) | 0)) & MASK) << 9) | ((x + ((R() * 5) | 0)) & MASK)] = 1;
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
  return { col, H, lights, beacon: { x: bx, y: by, h: H[by * MAP + bx] } };
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const q = engine.quality;
  if (!world || world.seed !== secrets.seed) { world = buildWorld(secrets.seed); world.seed = secrets.seed; }
  const { col, H: HM, lights, beacon } = world;
  let W = api.W, H = api.H, RW = 320, RH = 200, off = null, octx = null, img = null, b32 = null, ybuf = null;
  const cam = { x: 260, y: 300, a: 0.6, h: 120, turn: 0, speed: 46, sx: 0, sy: 0, travel: 0 };
  cam.sx = cam.x; cam.sy = cam.y;
  let clock = 0.32 * DAY, pitch = 0, lowT = 0, lastLabel = 0;
  const birds = Array.from({ length: 9 }, (_, i) => ({ ox: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 22, oy: Math.ceil(i / 2) * 10, ph: Math.random() * TAU }));
  const stars = Array.from({ length: 220 }, () => ({ az: Math.random() * TAU, el: Math.random() * 0.9, b: Math.random() }));
  const clouds = Array.from({ length: 12 }, () => ({ az: Math.random() * TAU, el: 0.05 + Math.random() * 0.25, s: 0.6 + Math.random(), drift: (Math.random() - 0.5) * 0.004 }));
  const cloudImg = (() => {
    const c = makeCanvas(128, 64), g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 20 + Math.random() * 88, y = 22 + Math.random() * 20, r = 14 + Math.random() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    }
    return c;
  })();

  function resize(w, h) {
    W = w; H = h;
    RW = Math.round(clamp(W / 3.2, 150, 380) * (q < 0.8 ? 0.85 : 1));
    RH = Math.round(RW * (H / W));
    off = makeCanvas(RW, RH); octx = off.getContext('2d');
    img = octx.createImageData(RW, RH); b32 = new Uint32Array(img.data.buffer);
    ybuf = new Int32Array(RW);
  }
  resize(W, H);

  const groundAt = (x, y) => HM[(((y | 0) & MASK) << 9) | ((x | 0) & MASK)];
  // jour et nuit : la lumière du ciel, la couleur du brouillard, la teinte des terres
  function skyState() {
    const ph = (clock / DAY) % 1;
    const sun = Math.sin(ph * TAU - Math.PI / 2); // −1 minuit, 1 midi
    const day = smoothstep(-0.25, 0.35, sun), dusk = Math.exp(-Math.pow(sun / 0.22, 2));
    const top = mixRgb(mixRgb([4, 6, 20], [60, 110, 190], day), [70, 50, 110], dusk * 0.5);
    const fog = mixRgb(mixRgb([10, 14, 32], [170, 200, 225], day), [235, 150, 120], dusk * 0.65);
    const tint = mixRgb([0.22, 0.26, 0.42], [1, 1, 1], day).map((v, i) => v * (1 - dusk * 0.18) + dusk * [0.22, 0.1, 0.02][i]);
    return { ph, sun, day, dusk, top, fog, tint };
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
    const night = 1 - st.day;
    let z = 1, dz = 0.55;
    while (z < DIST) {
      let plx = -cosA * z - sinA * z + cam.x, ply = sinA * z - cosA * z + cam.y;
      const prx = cosA * z - sinA * z + cam.x, pry = -sinA * z - cosA * z + cam.y;
      const dx = (prx - plx) / RW, dy = (pry - ply) / RW;
      const inv = scale / z;
      const fog = Math.min(1, Math.max(0, (z - DIST * 0.3) / (DIST * 0.7)) ** 1.3);
      for (let i = 0; i < RW; i++) {
        const mi = ((ply | 0) & MASK) << 9 | ((plx | 0) & MASK);
        const sy = ((cam.h - HM[mi]) * inv + horizon) | 0;
        const yb = ybuf[i];
        if (sy < yb) {
          const c = col[mi];
          let r = (c & 255) * tr, g = ((c >> 8) & 255) * tg, b = ((c >> 16) & 255) * tb;
          if (night > 0.35 && lights[mi]) { r = 255; g = 200; b = 120; } // les villages s'allument
          r += (fr - r) * fog; g += (fg - g) * fog; b += (fb - b) * fog;
          const px = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
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
    return { x: (RW / 2 + (fx / fz) * (RW / 2)) * (W / RW), y: ((cam.h - wh) * (RH * 0.92) / fz + horizon) * (H / RH), z: fz, d: Math.hypot(dx, dy) };
  }

  function update(dt, t) {
    clock += dt;
    // le pilotage : la main tire vers la gauche ou la droite, plus haut ou plus bas
    let turnIn = 0, climb = 0;
    const ground0 = groundAt(cam.x, cam.y);
    if (input.inside || input.down) { turnIn = clamp((input.x - W / 2) / (W * 0.4), -1, 1); climb = clamp((H * 0.5 - input.y) / (H * 0.4), -1, 1); }
    else { turnIn = Math.sin(t * 0.07) * 0.35; climb = clamp((ground0 + 42 - cam.h) / 30, -0.5, 0.5) + Math.sin(t * 0.05) * 0.15; } // le planeur garde son altitude de croisière
    if (keys.left) turnIn = -1; if (keys.right) turnIn = 1; if (keys.up) climb = 1; if (keys.down) climb = -1;
    cam.turn += (turnIn - cam.turn) * Math.min(1, dt * 2.5);
    cam.a -= cam.turn * 0.9 * dt; // a croissant fait tourner vers la gauche : la main à droite fait virer à droite
    const want = input.down && longHold ? 95 : 46;
    cam.speed += (want - cam.speed) * Math.min(1, dt * 1.5);
    const vx = -Math.sin(cam.a) * cam.speed * dt, vy = -Math.cos(cam.a) * cam.speed * dt;
    cam.x += vx; cam.y += vy; cam.travel += Math.hypot(vx, vy);
    const ground = Math.max(groundAt(cam.x, cam.y), groundAt(cam.x - Math.sin(cam.a) * 30, cam.y - Math.cos(cam.a) * 30));
    const clear = ground <= WATER * HS + 0.01 ? 2.5 : 7; // au-dessus de l'eau, on peut la frôler
    const targetH = clamp(cam.h + climb * 60 * dt, ground + clear, 210);
    cam.h += (targetH - cam.h) * Math.min(1, dt * 4);
    if (cam.h < ground + clear) cam.h += (ground + clear - cam.h) * Math.min(1, dt * 6); // on se cabre avant le relief
    pitch += ((climb * RH * 0.12) - pitch) * Math.min(1, dt * 2);
    audio.setNoiseLevel(0.012 + cam.speed * 0.00035);

    // secrets : frôler l'eau, retrouver l'Arbre, faire le tour du tore
    const overWater = groundAt(cam.x, cam.y) <= WATER * HS + 0.01;
    lowT = overWater && cam.h - WATER * HS < 4.5 ? lowT + dt : 0;
    if (lowT > 2.5) secrets.find('rasemottes');
    let bdx = beacon.x - cam.x, bdy = beacon.y - cam.y;
    bdx -= Math.round(bdx / MAP) * MAP; bdy -= Math.round(bdy / MAP) * MAP;
    if (Math.hypot(bdx, bdy) < 26) secrets.find('phare');
    let sdx = cam.x - cam.sx, sdy = cam.y - cam.sy;
    sdx -= Math.round(sdx / MAP) * MAP; sdy -= Math.round(sdy / MAP) * MAP;
    if (cam.travel > 480 && Math.hypot(sdx, sdy) < 22) secrets.find('tore');

    for (const c of clouds) c.az += c.drift * dt * 10;
    if (t - lastLabel > 0.5) {
      lastLabel = t;
      const cap = Math.round((((-cam.a * 180) / Math.PI) % 360 + 360) % 360);
      api.label(`cap ${cap}° · ${Math.round((cam.h - WATER * HS) * 14)} m`);
    }
  }

  function draw(ctx, t) {
    const st = skyState();
    // le ciel : dégradé, étoiles la nuit, l'astre du moment, les nuages
    const horizonFull = (RH * 0.42 + pitch) * (H / RH);
    const g = ctx.createLinearGradient(0, 0, 0, horizonFull);
    g.addColorStop(0, rgba(st.top));
    g.addColorStop(1, rgba(st.fog));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const fov = Math.PI / 2;
    const azX = az => W / 2 + (angleDiff(cam.a, az) / (fov / 2)) * (W / 2);
    if (st.day < 0.7) {
      ctx.fillStyle = `rgba(230,235,255,${(1 - st.day) * 0.8})`;
      for (const s of stars) { const x = azX(s.az); if (x < -2 || x > W + 2) continue; ctx.fillRect(x, horizonFull - s.el * horizonFull, s.b > 0.9 ? 1.6 : 1, s.b > 0.9 ? 1.6 : 1); }
    }
    const sunAz = 2.2, sx = azX(sunAz), sElev = st.sun;
    ctx.globalCompositeOperation = 'lighter';
    if (sElev > -0.2) drawGlow(ctx, glow(mixRgb([255, 236, 200], [255, 140, 90], st.dusk).map(Math.round), 64), sx, horizonFull - sElev * horizonFull * 0.9, Math.min(W, H) * 0.35, 0.55);
    else { const mx = azX(sunAz + Math.PI); drawGlow(ctx, glow([200, 210, 255], 48), mx, horizonFull + sElev * horizonFull * 0.8, 60, 0.6); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const c of clouds) {
      const x = azX(c.az);
      if (x < -200 || x > W + 200) continue;
      ctx.globalAlpha = 0.25 + st.day * 0.45;
      const w = 220 * c.s;
      ctx.drawImage(cloudImg, x - w / 2, horizonFull - c.el * horizonFull - w * 0.25, w, w / 2);
    }
    ctx.globalAlpha = 1;

    // la terre, avec un peu de roulis quand on vire
    const hz = render(st);
    // l'image doit couvrir l'écran même inclinée : on l'agrandit juste assez pour l'angle du moment
    const roll = -cam.turn * 0.16;
    const zoom = Math.cos(roll) + (Math.max(W, H) / Math.min(W, H)) * Math.abs(Math.sin(roll)) + 0.03;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(roll);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, (-W * zoom) / 2, (-H * zoom) / 2, W * zoom, H * zoom);
    ctx.restore();

    // le phare de l'Arbre-Monde : une colonne de lumière qui monte au-dessus des terres
    const b = project(beacon.x, beacon.y, beacon.h, hz);
    if (b) {
      const bx = W / 2 + (b.x - W / 2) * zoom, by = H / 2 + (b.y - H / 2) * zoom;
      const k = clamp(1.6 - b.z / 400, 0.25, 1);
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(bx, by, bx, 0);
      beam.addColorStop(0, `rgba(255,214,140,${0.55 * k})`);
      beam.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = beam;
      const bw = Math.max(2, 26 / Math.max(1, b.z / 40));
      ctx.fillRect(bx - bw / 2, 0, bw, by);
      drawGlow(ctx, glow([255, 220, 160], 48), bx, by, 30 + 600 / b.z, 0.8 * k);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // les oiseaux qui volent avec toi
    ctx.strokeStyle = st.day > 0.4 ? 'rgba(20,22,30,0.75)' : 'rgba(220,225,255,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const bd of birds) {
      const x = W / 2 + bd.ox * (W / 900) + Math.sin(t * 0.7 + bd.ph) * 6 - cam.turn * 40, y = H * 0.32 + bd.oy * (W / 900) + Math.sin(t * 1.1 + bd.ph) * 4;
      const f = Math.sin(t * 7 + bd.ph) * 5, s = 9 * (W / 1200 + 0.4);
      ctx.moveTo(x - s, y - f); ctx.quadraticCurveTo(x - s * 0.4, y - f * 0.3 - 3, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - f * 0.3 - 3, x + s, y - f);
    }
    ctx.stroke();
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
    longpress() { longHold = true; audio.noise({ freq: 400, q: 0.5, dur: 1.2, vel: 0.08, type: 'bandpass', sweep: 3 }); },
    up() { longHold = false; },
    tap(p) { audio.note(Math.floor((1 - p.y / H) * 8), { type: 'glass', vel: 0.07, dur: 2, pan: (p.x / W) * 2 - 1 }); },
    destroy() { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); audio.setNoiseLevel(mood.noise.gain); },
  };
}
