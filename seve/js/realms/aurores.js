// Sève — Les Aurores : le vent du Soleil glisse sur le champ de la Terre ; quelques particules
// spiralent jusqu'aux pôles, et l'oxygène se met à chanter en vert.
import { TAU, clamp, lerp, smoothstep, glow, drawGlow, rgba, makeCanvas, makeNoise, rng, makeLayer, blit } from '../engine.js';

export const mood = {
  root: 110, scale: 'lydian', wave: 'sine', chord: [0, 7, 11, 16], pad: 0.05, cutoff: 900, lfo: 0.03,
  noise: { type: 'highpass', freq: 1800, q: 0.3, gain: 0.006, gust: 0.8, gustRate: 0.06 },
};

// Les couleurs viennent des atomes : oxygène vert (557,7 nm) en bas, oxygène rouge (630 nm) très haut, azote violet en lisière
const GREEN = [60, 255, 140], RED = [255, 46, 96], VIOLET = [150, 84, 255];
const LUT_N = 230; // profil vertical d'un rideau, de d = −0,6 (sous la lisière) à d = 1,7 (au sommet)

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(73);
  const R = rng(1859);
  const q = engine.quality;
  let W = api.W, H = api.H, horizon = 0;
  let sky = null, land = null, AW = 0, AH = 0, acc = null, abuf = null, actx = null, aimg = null, a32 = null;
  const lut = new Float32Array(LUT_N * 3);
  const curtains = [
    { base: 0.44, amp: 0.1, freq: 1.0, speed: 1.0, seed: 3.1 },
    { base: 0.3, amp: 0.08, freq: 1.4, speed: 1.3, seed: 7.7 },
    { base: 0.58, amp: 0.06, freq: 0.8, speed: 0.8, seed: 12.4 },
  ].slice(0, q < 0.8 ? 2 : 3);
  let act = 0.45, target = 0.45, storm = 0, nextSub = 18 + R() * 14, subT = -1, ph = 0, wind = 0, red = 0;
  const flares = [], snow = [], smoke = [], whistle = { on: false, t: 0, next: 0 };
  let tapLog = [], space = false, spaceK = 0, lastLabel = '';
  const parts = [], windParts = [];

  function build() {
    horizon = Math.round(H * (H > W ? 0.6 : 0.66));
    AW = Math.ceil(W / 4); AH = Math.ceil(horizon / 4);
    acc = new Float32Array(AW * AH * 3);
    abuf = makeCanvas(AW, AH); actx = abuf.getContext('2d');
    aimg = actx.createImageData(AW, AH); a32 = new Uint32Array(aimg.data.buffer);

    // Le ciel : bleu de nuit, la Voie lactée, des milliers d'étoiles
    sky = makeLayer(engine);
    const g = sky.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, horizon);
    grd.addColorStop(0, '#01030c'); grd.addColorStop(0.7, '#061229'); grd.addColorStop(1, '#0d2238');
    g.fillStyle = grd; g.fillRect(0, 0, W, horizon);
    const mw = makeCanvas(Math.ceil(W / 4), Math.ceil(horizon / 4)), mg = mw.getContext('2d'), mimg = mg.createImageData(mw.width, mw.height);
    for (let y = 0; y < mw.height; y++) for (let x = 0; x < mw.width; x++) {
      const u = x / mw.width, v = y / mw.height;
      const band = Math.exp(-Math.pow((v - (0.15 + u * 0.55)) / 0.16, 2));
      const n = noise.fbm2(u * 6, v * 6, 5);
      const a = clamp(band * (0.5 + n * 0.9), 0, 1);
      const i = (y * mw.width + x) * 4;
      mimg.data[i] = 150; mimg.data[i + 1] = 160; mimg.data[i + 2] = 200; mimg.data[i + 3] = a * 46;
    }
    mg.putImageData(mimg, 0, 0);
    g.drawImage(mw, 0, 0, W, horizon);
    for (let i = 0; i < (W * horizon) / 1500; i++) {
      const x = R() * W, y = Math.pow(R(), 1.2) * horizon, s = R() < 0.05 ? 1.7 : 0.5 + R() * 0.8;
      g.fillStyle = `rgba(${220 + R() * 35},${225 + R() * 30},255,${0.25 + R() * 0.6})`;
      g.fillRect(x, y, s, s);
    }

    // La terre : montagnes enneigées, forêt de sapins, la cabane, et le lac gelé qui reflète le ciel
    land = makeLayer(engine);
    const l = land.getContext('2d');
    const ridge = (base, amp, f, seed) => {
      const pts = [];
      for (let x = 0; x <= W + 8; x += 8) pts.push([x, base - (noise.fbm2(x * f, seed, 5) * 0.5 + 0.5) * amp]);
      return pts;
    };
    const far = ridge(horizon - H * 0.03, H * 0.24, 0.0026, 2), near = ridge(horizon, H * 0.12, 0.004, 6);
    const fill = (pts, col, y0) => { l.fillStyle = col; l.beginPath(); l.moveTo(0, y0); pts.forEach(([x, y]) => l.lineTo(x, y)); l.lineTo(W, y0); l.closePath(); l.fill(); };
    fill(far, '#0b1526', horizon + 2);
    l.strokeStyle = 'rgba(190,230,255,0.22)'; l.lineWidth = 1.4;
    l.beginPath(); far.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y))); l.stroke(); // la neige des crêtes
    fill(near, '#050b16', horizon + 2);
    // sapins sur la rive
    l.fillStyle = '#02050b';
    const pines = [];
    for (let x = -10; x < W + 10; x += 5 + R() * 9) pines.push([x, 10 + R() * 30 * (0.6 + 0.4 * Math.sin(x * 0.01))]);
    for (const [x, h] of pines) {
      for (let k = 0; k < 3; k++) {
        const w = h * (0.42 - k * 0.1), y = horizon - h * (k * 0.3);
        l.beginPath(); l.moveTo(x - w, y); l.lineTo(x, y - h * 0.55); l.lineTo(x + w, y); l.fill();
      }
    }
    // la cabane
    const cx = W * 0.72, cw = Math.max(26, W * 0.022), ch = cw * 0.7;
    l.beginPath(); l.rect(cx - cw / 2, horizon - ch, cw, ch); l.fill();
    l.beginPath(); l.moveTo(cx - cw * 0.65, horizon - ch); l.lineTo(cx, horizon - ch * 1.8); l.lineTo(cx + cw * 0.65, horizon - ch); l.fill();
    l.fillRect(cx + cw * 0.18, horizon - ch * 1.75, cw * 0.12, ch * 0.5);
    land.cabin = { x: cx, y: horizon - ch * 0.5, w: cw, chimney: [cx + cw * 0.24, horizon - ch * 1.78] };
    // le lac : le ciel retourné, assombri par la glace
    l.save();
    l.beginPath(); l.rect(0, horizon, W, H - horizon); l.clip();
    l.translate(0, 2 * horizon); l.scale(1, -1);
    l.globalAlpha = 0.5;
    l.drawImage(sky, 0, 0, W, H);
    l.globalAlpha = 0.35;
    l.drawImage(land, 0, 0, W, H); // la forêt s'y reflète aussi
    l.restore();
    const ice = l.createLinearGradient(0, horizon, 0, H);
    ice.addColorStop(0, 'rgba(10,22,40,0.35)'); ice.addColorStop(1, 'rgba(14,26,44,0.75)');
    l.fillStyle = ice; l.fillRect(0, horizon, W, H - horizon);
    l.strokeStyle = 'rgba(200,230,255,0.05)'; l.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const y = horizon + 6 + R() * (H - horizon); const x = R() * W; l.beginPath(); l.moveTo(x, y); l.lineTo(x + 40 + R() * 160, y + (R() - 0.5) * 6); l.stroke(); }
    l.fillStyle = 'rgba(230,240,255,0.06)'; l.fillRect(0, horizon - 1, W, 2);
  }
  function resize(w, h) { W = w; H = h; build(); }
  build();
  for (let i = 0; i < Math.round(130 * q); i++) snow.push({ x: R() * W, y: R() * H, vy: 8 + R() * 18, r: 0.6 + R() * 1.4, ph: R() * TAU });

  // Le profil vertical d'un rideau, recalculé à chaque image selon l'agitation du ciel
  function buildLut() {
    const redK = 0.35 + act * 0.7 + red * 1.4, violK = clamp((act - 0.6) * 1.4, 0, 1) + red * 0.6;
    for (let i = 0; i < LUT_N; i++) {
      const d = i / 100 - 0.6;
      const prof = d < 0 ? Math.exp(d * 7) : Math.exp(-d * 1.8);
      const wG = d < 0.5 ? 1 : Math.exp(-(d - 0.5) * 3.2);
      const wR = smoothstep(0.3, 1.15, d) * redK;
      const wV = Math.exp(-Math.pow((d - 0.02) / 0.07, 2)) * violK;
      lut[i * 3] = prof * (GREEN[0] * wG + RED[0] * wR + VIOLET[0] * wV) / 255;
      lut[i * 3 + 1] = prof * (GREEN[1] * wG + RED[1] * wR + VIOLET[1] * wV) / 255;
      lut[i * 3 + 2] = prof * (GREEN[2] * wG + RED[2] * wR + VIOLET[2] * wV) / 255;
    }
  }

  function renderAurora() {
    acc.fill(0);
    buildLut();
    const level = 0.32 + 0.62 * act + red * 0.3;
    const hk = 0.2 + 0.24 * act + red * 0.25;
    for (const c of curtains) {
      for (let x = 0; x < AW; x++) {
        const X = x / AW;
        const nx = X + Math.sin(X * 7 + ph * 0.6 * c.speed + c.seed) * 0.04 * (0.6 + act); // les plis du rideau
        const base = (c.base - red * 0.12 + noise.n2(nx * 2.4 * c.freq + c.seed, ph * 0.12 * c.speed) * c.amp) * AH;
        let I = smoothstep(-0.25, 0.55, noise.n2(nx * 1.6 + c.seed * 3, ph * 0.07 + c.seed)) * level;
        I *= 0.45 + 0.55 * Math.abs(noise.n2(nx * 34 + c.seed, ph * 0.9)); // les rayons, fins et rapides
        if (I < 0.015) continue;
        const h = AH * hk * (0.75 + 0.25 * noise.n2(nx * 3 + 9, ph * 0.1));
        const y0 = Math.max(0, Math.floor(base - h * 1.7)), y1 = Math.min(AH - 1, Math.ceil(base + h * 0.6));
        for (let y = y0; y <= y1; y++) {
          const li = clamp((((base - y) / h + 0.6) * 100) | 0, 0, LUT_N - 1) * 3;
          const i = (y * AW + x) * 3;
          acc[i] += I * lut[li]; acc[i + 1] += I * lut[li + 1]; acc[i + 2] += I * lut[li + 2];
        }
      }
    }
    // saturation douce : même au plus fort de l'orage, le vert reste vert au lieu de virer au blanc
    for (let i = 0, j = 0; i < a32.length; i++, j += 3) {
      const r = (255 * (1 - Math.exp(-acc[j] * 1.25))) | 0, g = (255 * (1 - Math.exp(-acc[j + 1] * 1.25))) | 0, b = (255 * (1 - Math.exp(-acc[j + 2] * 1.25))) | 0;
      a32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    actx.putImageData(aimg, 0, 0);
  }

  // ——— La magnétosphère : lignes de champ du dipôle, particules qui rebondissent d'un pôle à l'autre
  for (let i = 0; i < Math.round(70 * q); i++) {
    const L = 2 + R() * 5.5;
    parts.push({ L, lam: (R() - 0.5) * 1.6, dir: R() < 0.5 ? -1 : 1, side: R() < 0.5 ? -1 : 1, sp: 0.5 + R() * 0.7, gy: R() * TAU });
  }
  for (let i = 0; i < 80; i++) windParts.push({ x: R(), y: R(), sp: 0.15 + R() * 0.2 });

  function update(dt, t) {
    // les sous-orages : le ciel se déchire, danse, puis s'apaise
    nextSub -= dt;
    if (nextSub <= 0) {
      subT = 0; nextSub = 65 + R() * 30;
      [0, 4, 7, 11].forEach((d, k) => audio.note(d, { type: 'soft', vel: 0.08, at: k * 0.3, dur: 5, send: 0.7 }));
    }
    if (subT >= 0) {
      subT += dt;
      target = subT < 6 ? lerp(0.45, 1, subT / 6) : subT < 18 ? 1 : Math.max(0.45, 1 - (subT - 18) / 22);
      if (subT > 42) subT = -1;
    }
    for (let i = flares.length - 1; i >= 0; i--) {
      if (t >= flares[i]) {
        flares.splice(i, 1);
        storm = Math.min(1.2, storm + 0.35);
        [2, 4, 6, 9].forEach((d, k) => audio.note(d, { type: 'glass', vel: 0.07, at: k * 0.1, dur: 3, send: 0.7 }));
      }
    }
    storm = Math.max(0, storm - dt * 0.035);
    red = Math.max(0, red - dt * 0.03);
    act += (target + storm - act) * Math.min(1, dt * 0.8);
    if (input.down || input.inside) wind += clamp(input.vx * 0.00004, -0.02, 0.02);
    wind *= Math.pow(0.3, dt);
    ph += dt * (0.22 + act * 0.55) * (1 + wind * 6);

    // écouter le ciel : des sifflements qui descendent, et parfois un chœur qui monte
    if (whistle.on) {
      whistle.t += dt;
      whistle.next -= dt;
      if (whistle.next <= 0) {
        whistle.next = 0.45 + Math.random() * 0.5;
        if (Math.random() < 0.7) audio.sweep({ from: 3600 + Math.random() * 1500, to: 380 + Math.random() * 200, dur: 1.4 + Math.random() * 0.6, vel: 0.035, pan: Math.random() - 0.5 });
        else audio.sweep({ from: 600, to: 2400 + Math.random() * 800, dur: 0.35, vel: 0.025, pan: Math.random() - 0.5 });
      }
      if (whistle.t > 2.5) secrets.find('sifflements');
    }

    for (const s of snow) {
      s.y += s.vy * dt; s.x += Math.sin(t * 0.6 + s.ph) * 8 * dt;
      if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
    }
    const [chx, chy] = land.cabin.chimney;
    if (Math.random() < dt * 4) smoke.push({ x: chx, y: chy, r: 3, age: 0 });
    for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.age += dt; s.y -= 9 * dt; s.x += (4 + wind * 200) * dt; s.r += 3 * dt; if (s.age > 6) smoke.splice(i, 1); }
    spaceK += ((space ? 1 : 0) - spaceK) * Math.min(1, dt * 3);
    if (spaceK > 0.02) {
      for (const p of parts) {
        p.lam += p.dir * p.sp * dt * 0.6;
        const lm = Math.acos(Math.sqrt(Math.min(1, 1.15 / p.L)));
        if (Math.abs(p.lam) > lm) { p.lam = Math.sign(p.lam) * lm; p.dir *= -1; p.flash = 1; }
        p.gy += dt * 14;
        p.flash = Math.max(0, (p.flash || 0) - dt * 2);
      }
      for (const w of windParts) { w.x += w.sp * dt; if (w.x > 1) { w.x = 0; w.y = Math.random(); } }
    }
    const lb = act + red > 1.15 ? 'tempête géomagnétique' : subT >= 0 && subT < 20 ? 'sous-orage' : flares.length ? 'éruption en route' : 'ciel calme';
    if (lb !== lastLabel) { lastLabel = lb; api.label(lb); }
  }

  function draw(ctx, t) {
    renderAurora();
    blit(ctx, sky);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(abuf, 0, 0, W, horizon);
    // la couronne : au plus fort, les rayons semblent converger au zénith
    if (act + red > 0.92) {
      const k = clamp((act + red - 0.92) * 3, 0, 1);
      ctx.strokeStyle = `rgba(120,255,170,${0.05 * k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI + Math.sin(t * 0.7 + i) * 0.02;
        const x = W / 2 + Math.cos(a) * W, y = -H * 0.2 + Math.sin(a) * H * 0.9;
        ctx.moveTo(W / 2, -H * 0.2); ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    blit(ctx, land);
    // le lac reflète l'aurore, troublé par la glace
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42;
    const strips = 14, lakeH = H - horizon;
    for (let s = 0; s < strips; s++) {
      const y0 = horizon + (s / strips) * lakeH, y1 = horizon + ((s + 1) / strips) * lakeH;
      const sy0 = 2 * horizon - y1, sy1 = 2 * horizon - y0;
      if (sy1 <= 0) continue;
      const a = Math.max(0, sy0), srcY = (a / horizon) * AH, srcH = ((sy1 - a) / horizon) * AH;
      if (srcH <= 0) continue;
      const off = Math.sin(t * 0.8 + s * 1.7) * 1.6;
      ctx.save();
      ctx.translate(off, y0 + y1);
      ctx.scale(1, -1);
      ctx.drawImage(abuf, 0, srcY, AW, srcH, 0, y0, W, (sy1 - a));
      ctx.restore();
    }
    ctx.restore();
    // la fenêtre de la cabane, sa fumée, la neige
    const cb = land.cabin;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 190, 110], 32), cb.x, cb.y, cb.w * 1.4, 0.55 + 0.1 * Math.sin(t * 7) * Math.sin(t * 3.1));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,200,130,0.95)';
    ctx.fillRect(cb.x - cb.w * 0.12, cb.y - cb.w * 0.08, cb.w * 0.24, cb.w * 0.18);
    for (const s of smoke) { ctx.fillStyle = `rgba(150,165,190,${0.12 * (1 - s.age / 6)})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(235,242,255,0.8)';
    ctx.beginPath();
    for (const s of snow) { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, TAU); }
    ctx.fill();
    drawGlobe(ctx, t);
    if (spaceK > 0.02) drawSpace(ctx, t);
  }

  // Le petit globe dans un coin : la porte vers l'espace
  const globePos = () => [W - 46, H - (H > W ? 132 : 100)];
  function drawGlobe(ctx, t) {
    const [gx, gy] = globePos(), r = 13;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([90, 200, 255], 24), gx, gy, r * 2.6, 0.25 + 0.12 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#123a66';
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(140,220,255,0.5)';
    ctx.lineWidth = 1;
    for (const L of [1.6, 2.2]) {
      ctx.beginPath(); ctx.ellipse(gx - r * L * 0.55, gy, r * L * 0.55, r * L * 0.62, 0, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(gx + r * L * 0.55, gy, r * L * 0.55, r * L * 0.62, 0, Math.PI / 2, -Math.PI / 2, true); ctx.stroke();
    }
  }

  function drawSpace(ctx, t) {
    const k = spaceK;
    ctx.globalAlpha = k;
    ctx.fillStyle = '#01020a';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(sky, 0, 0, sky.width, horizon * 0.5 * (sky.width / W), 0, 0, W, H);
    const ex = W * 0.56, ey = H * 0.5, Re = Math.min(W, H) * 0.075;
    // le Soleil, loin à gauche, et son vent
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 200, 120], 64), -W * 0.02, ey, Math.min(W, H) * 0.5, 0.7 * k);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(255,220,160,${0.35 * k})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const w of windParts) {
      let x = w.x * W, y = w.y * H;
      // l'onde de choc détourne le vent autour de la Terre
      const dx = x - (ex - Re * 3.2), dy = y - ey;
      if (dx > -dy * dy / (Re * 9)) y += Math.sign(dy || 1) * Math.min(Re * 4, (dx + dy * dy / (Re * 9)) * 0.6);
      ctx.moveTo(x, y); ctx.lineTo(x + 10, y);
    }
    ctx.stroke();
    // l'onde de choc et la magnétopause
    ctx.strokeStyle = `rgba(255,190,140,${0.25 * k})`;
    ctx.beginPath();
    for (let i = -40; i <= 40; i++) { const y = (i / 40) * H * 0.6; const x = ex - Re * 3.2 + (y * y) / (Re * 9); if (i === -40) ctx.moveTo(x, ey + y); else ctx.lineTo(x, ey + y); }
    ctx.stroke();
    // lignes de champ du dipôle (r = L cos² λ), comprimées côté jour, étirées côté nuit
    ctx.strokeStyle = `rgba(130,200,255,${0.28 * k})`;
    for (const L of [1.6, 2.2, 3, 4, 5.4, 7]) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        const lm = Math.acos(Math.sqrt(1 / L));
        for (let i = 0; i <= 60; i++) {
          const lam = -lm + (i / 60) * 2 * lm, r = L * Re * Math.cos(lam) ** 2;
          const x = ex + side * r * Math.cos(lam) * (side < 0 ? 0.8 : 1.3), y = ey - r * Math.sin(lam);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    // la Terre, éclairée du côté du Soleil, et ses deux ovales d'aurore
    const eg = ctx.createRadialGradient(ex - Re * 0.4, ey - Re * 0.2, Re * 0.1, ex, ey, Re);
    eg.addColorStop(0, '#5fa8ff'); eg.addColorStop(0.6, '#1d5c9a'); eg.addColorStop(1, '#06162c');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, Re, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const oval = 0.35 + act * 0.5;
    for (const sgn of [-1, 1]) {
      ctx.strokeStyle = `rgba(90,255,150,${oval * k})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(ex, ey + sgn * Re * 0.8, Re * 0.45, Re * 0.12, 0, 0, TAU); ctx.stroke();
    }
    // particules : elles spiralent le long des lignes et rebondissent près des pôles
    for (const p of parts) {
      const r = p.L * Re * Math.cos(p.lam) ** 2;
      const x = ex + p.side * r * Math.cos(p.lam) * (p.side < 0 ? 0.8 : 1.3) + Math.cos(p.gy) * 3, y = ey - r * Math.sin(p.lam) + Math.sin(p.gy) * 3;
      drawGlow(ctx, glow([170, 230, 255], 12), x, y, 3.5 + p.flash * 5, (0.7 + p.flash * 0.3) * k);
      if (p.flash > 0.5) drawGlow(ctx, glow(GREEN, 24), ex + p.side * Re * 0.3, ey - Math.sign(p.lam) * Re * 0.8, 16, p.flash * 0.6 * k);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = k;
    ctx.font = '400 9px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(220,235,255,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('VENT SOLAIRE →', 20, ey - H * 0.3);
    ctx.textAlign = 'center';
    ctx.fillText('MAGNÉTOSPHÈRE', ex, ey + Re * 4.6);
    ctx.fillText('OVALES D\'AURORE', ex, ey + Re * 1.7);
    ctx.fillText('TOUCHE POUR REDESCENDRE', W / 2, H - 70);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  // ——— Gestes
  function tap(p) {
    const t = engine.t;
    if (space) { space = false; audio.note(0, { type: 'soft', vel: 0.1, dur: 2 }); return; }
    const [gx, gy] = globePos();
    if (Math.hypot(p.x - gx, p.y - gy) < 30) {
      space = true;
      secrets.find('magnetosphere');
      [0, 4, 7, 11, 14].forEach((d, k) => audio.note(d, { type: 'glass', vel: 0.07, at: k * 0.12, dur: 3 }));
      return;
    }
    // une éruption solaire : elle arrivera dans quelques secondes (en vrai, deux ou trois jours)
    flares.push(t + 2.5 + Math.random());
    audio.noise({ freq: 900, q: 0.6, dur: 1.6, vel: 0.06, type: 'bandpass', sweep: 3, pan: (p.x / W) * 2 - 1 });
    tapLog = tapLog.filter(x => t - x < 2.2);
    tapLog.push(t);
    if (tapLog.length >= 3) {
      tapLog = [];
      red = 1.1; storm = 1.2;
      secrets.find('carrington');
    }
  }
  function longpress() { whistle.on = true; whistle.t = 0; whistle.next = 0; }
  function up() { whistle.on = false; }

  return { resize, update, draw, tap, longpress, up, destroy() {} };
}
