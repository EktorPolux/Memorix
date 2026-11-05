// Sève — Les Racines : sous l'arbre, ce qui relie tout. Et tout au fond, un cœur qui est une équation.
import { TAU, clamp, lerp, glow, drawGlow, rgba, hslToRgb, makeCanvas, makeNoise, rng, makeLayer, blit } from '../engine.js';

export const mood = {
  root: 55, scale: 'phrygian', wave: 'sine', chord: [0, 7, 12, 15], pad: 0.065, cutoff: 320, lfo: 0.02, droneOct: 1,
  noise: { type: 'lowpass', freq: 120, q: 0.9, gain: 0.022, gust: 0.5, gustRate: 0.05 },
};

const HOME = { x: -0.62, y: 0, s: 2.9 };
const DIVE = { x: -0.743643887037151, y: 0.13182590420533 }; // la vallée des hippocampes

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(97);
  const R = rng(secrets.seed + 5);
  const q = engine.quality;
  let W = api.W, H = api.H;
  let hx = 0, hy = 0, hr = 100;
  let roots = [], threads = [], fossils = [], crystals = [], strata = null, dark = null, dctx = null;
  const beads = [], sparks = [];
  let view = { ...HOME }, diving = false, diveT = 0, returning = false;
  let buf = null, bctx = null, bimg = null, b32 = null, mu = null, bw = 0, bh = 0;
  let bufView = null, renderRow = 0, renderView = null, maxIt = 160, beat = 0, nextBeat = 2;
  let seedShown = false, seedT = 0, lanternX = -999, lanternY = -999;

  // ——— Le cœur : z ← z² + c, rendu ligne après ligne pour ne jamais bloquer l'image
  function startRender(v) {
    renderView = { ...v };
    renderRow = 0;
    const zoom = HOME.s / v.s;
    maxIt = Math.round(clamp(150 + Math.log2(Math.max(1, zoom)) * 34, 150, 1400));
  }
  function renderSome(budgetMs) {
    if (!renderView) return;
    const t0 = performance.now();
    const v = renderView, sc = v.s / bw;
    const LOG2 = Math.log(2);
    while (renderRow < bh && performance.now() - t0 < budgetMs) {
      const y = renderRow, ci = v.y + (y - bh / 2) * sc;
      for (let x = 0; x < bw; x++) {
        const cr = v.x + (x - bw / 2) * sc;
        let zr = 0, zi = 0, it = 0, zr2 = 0, zi2 = 0;
        // la cardioïde et le grand disque sont dans l'ensemble : on les reconnaît sans itérer
        const qx = cr - 0.25, qq = qx * qx + ci * ci;
        if (qq * (qq + qx) <= 0.25 * ci * ci || (cr + 1) * (cr + 1) + ci * ci <= 0.0625) { mu[y * bw + x] = -1; continue; }
        while (zr2 + zi2 <= 256 && it < maxIt) { zi = 2 * zr * zi + ci; zr = zr2 - zi2 + cr; zr2 = zr * zr; zi2 = zi * zi; it++; }
        mu[y * bw + x] = it >= maxIt ? -1 : it + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / LOG2;
      }
      renderRow++;
    }
    if (renderRow >= bh) { bufView = renderView; renderView = null; paintBuffer(); }
  }
  // Couleur : loin de l'ensemble tout est sombre ; plus un point hésite avant de fuir, plus il brille.
  // La teinte, elle, tourne lentement le long des bandes.
  const palette = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) {
    const c = hslToRgb(268 + 70 * Math.sin((i / 1024) * TAU * 3), 78, 62);
    palette[i * 3] = c[0]; palette[i * 3 + 1] = c[1]; palette[i * 3 + 2] = c[2];
  }
  let palShift = 0;
  function paintBuffer() {
    if (!bufView) return;
    for (let i = 0; i < mu.length; i++) {
      const m = mu[i];
      if (m < 0) { b32[i] = 0xff12060b; continue; }
      const ramp = Math.min(1, Math.pow(m / 30, 0.85));
      const k = (((m * 7 + palShift) | 0) & 1023) * 3;
      b32[i] = (255 << 24) | ((palette[k + 2] * ramp) << 16) | ((palette[k + 1] * ramp) << 8) | (palette[k] * ramp);
    }
    bctx.putImageData(bimg, 0, 0);
  }

  // ——— Le monde souterrain : strates, racines, mycélium, fossiles
  function build() {
    hx = W / 2; hy = H * (H > W ? 0.66 : 0.68); hr = Math.min(W, H) * 0.2;
    bw = bh = Math.round(clamp(hr * 1.4, 120, 260) * (q < 0.8 ? 0.8 : 1));
    buf = makeCanvas(bw, bh); bctx = buf.getContext('2d');
    bimg = bctx.createImageData(bw, bh); b32 = new Uint32Array(bimg.data.buffer);
    mu = new Float32Array(bw * bh);
    bufView = null;
    startRender(view);

    strata = makeLayer(engine);
    const g = strata.getContext('2d');
    const bands = 9;
    for (let b = 0; b < bands; b++) {
      const y0 = (b / bands) * H, k = b / bands;
      const c = [lerp(34, 10, k), lerp(22, 8, k), lerp(20, 16, k)];
      g.fillStyle = rgba(c);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, y0 + noise.n2(x * 0.004, b * 3.3) * 26);
      g.lineTo(W, H);
      g.fill();
    }
    // grains de terre et cailloux
    for (let i = 0; i < (W * H) / 900; i++) {
      g.fillStyle = `rgba(${120 + R() * 60},${90 + R() * 40},${70 + R() * 30},${0.05 + R() * 0.12})`;
      const r = 0.6 + R() * 2.4;
      g.beginPath(); g.arc(R() * W, R() * H, r, 0, TAU); g.fill();
    }

    // racines : elles descendent vers le cœur en se ramifiant
    roots = [];
    const grow = (x, y, a, w, len, depth) => {
      const pts = [[x, y, w]];
      for (let i = 0; i < len; i++) {
        const toHeart = Math.atan2(hy - y, hx - x);
        a += clamp(((toHeart - a + Math.PI * 3) % TAU) - Math.PI, -0.08, 0.08) * 0.5 + noise.n2(x * 0.01, y * 0.01 + depth) * 0.12;
        x += Math.cos(a) * 7; y += Math.sin(a) * 7;
        w *= 0.985;
        pts.push([x, y, w]);
        if (Math.hypot(x - hx, y - hy) < hr * 0.95) break;
        if (depth < 3 && R() < 0.035) grow(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5), w * 0.6, len * 0.5, depth + 1);
      }
      roots.push({ pts, depth });
    };
    const nRoots = 7;
    for (let k = 0; k < nRoots; k++) grow(W * (0.3 + 0.4 * (k / (nRoots - 1))) + (R() - 0.5) * 30, -10, Math.PI / 2 + (R() - 0.5) * 0.6, 10 + R() * 6, 160, 0);

    // mycélium : des fils très fins entre les racines, où passent des signaux
    threads = [];
    const anchors = roots.flatMap(r => r.pts.filter((_, i) => i % 9 === 4));
    for (let k = 0; k < Math.round(46 * q); k++) {
      const a = anchors[(R() * anchors.length) | 0], b = anchors[(R() * anchors.length) | 0];
      if (!a || !b || a === b) continue;
      const mx = (a[0] + b[0]) / 2 + (R() - 0.5) * 140, my = (a[1] + b[1]) / 2 + (R() - 0.5) * 140;
      threads.push({ a, b, mx, my });
    }
    // fossiles : des ammonites (spirales logarithmiques) et des géodes
    fossils = [];
    for (let k = 0; k < 6; k++) fossils.push({ x: R() * W, y: H * (0.2 + R() * 0.75), r: 16 + R() * 26, rot: R() * TAU });
    crystals = [];
    for (let k = 0; k < 5; k++) crystals.push({ x: R() * W, y: H * (0.25 + R() * 0.7), n: 5 + ((R() * 6) | 0), r: 10 + R() * 16, rot: R() * TAU, hue: 260 + R() * 60 });
    dark = makeCanvas(W, H);
    dctx = dark.getContext('2d');
  }
  function resize(w, h) { W = w; H = h; build(); }
  build();

  function pointOnRoot(r, k) { const i = Math.min(r.pts.length - 1, Math.floor(k * (r.pts.length - 1))); return r.pts[i]; }
  function sendSap(r) { beads.push({ r, k: 0, speed: 0.22 + Math.random() * 0.1 }); }

  function update(dt, t) {
    // le cœur bat ; la sève descend à chaque battement
    nextBeat -= dt;
    if (nextBeat <= 0) {
      nextBeat = 3.2;
      beat = 1;
      audio.play(audio.freq(0, -1), { type: 'soft', vel: 0.16, dur: 1.6, send: 0.5 });
      audio.play(audio.freq(0, -1), { type: 'soft', vel: 0.1, dur: 1.2, send: 0.5, at: 0.28 });
      sendSap(roots[(Math.random() * roots.length) | 0]);
    }
    beat = Math.max(0, beat - dt * 1.6);
    for (let i = beads.length - 1; i >= 0; i--) {
      const b = beads[i];
      b.k += b.speed * dt;
      if (b.k >= 1) { beads.splice(i, 1); beat = Math.max(beat, 0.6); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.age > s.life) sparks.splice(i, 1); }
    // la plongée : on s'enfonce dans la frontière, de plus en plus près
    if (diving) {
      diveT += dt;
      const target = returning ? HOME : DIVE;
      view.x += (target.x - view.x) * Math.min(1, dt * (returning ? 2.5 : 0.9));
      view.y += (target.y - view.y) * Math.min(1, dt * (returning ? 2.5 : 0.9));
      if (returning) {
        view.s = Math.min(HOME.s, view.s * Math.pow(30, dt));
        if (view.s >= HOME.s * 0.999) { diving = false; returning = false; view = { ...HOME }; startRender(view); api.label(''); }
      } else {
        view.s *= Math.pow(0.55, dt);
        api.label(`profondeur ×${formatZoom(HOME.s / view.s)}`);
        if (view.s < 3e-11 || diveT > 70) returning = true;
      }
      if (!renderView && bufView && bufView.s / view.s > 1.5) startRender(view);
      if (!renderView && returning && view.s / bufView.s > 1.5) startRender(view);
    }
    renderSome(diving ? 9 : 6);
    palShift += dt * 40;
    if (engine.frame % 2 === 0) paintBuffer();
    // la lanterne suit la main
    if (input.inside || input.down) { lanternX += (input.x - lanternX) * Math.min(1, dt * 10); lanternY += (input.y - lanternY) * Math.min(1, dt * 10); }
    else { lanternX = lerp(lanternX, W * (0.5 + 0.3 * Math.sin(t * 0.13)), dt * 0.6); lanternY = lerp(lanternY, H * (0.35 + 0.15 * Math.sin(t * 0.17)), dt * 0.6); }
    // la Graine d'Or apparaît quand tout le reste a été trouvé
    if (!seedShown && secrets.allButSeed()) { seedShown = true; seedT = 0; audio.chime(); }
    if (seedShown) seedT += dt;
  }
  function formatZoom(z) {
    if (z < 1000) return Math.round(z).toString();
    const e = Math.floor(Math.log10(z));
    return `${(z / Math.pow(10, e)).toFixed(1).replace('.', ',')}·10^${e}`;
  }

  function draw(ctx, t) {
    blit(ctx, strata);
    // fossiles et cristaux
    ctx.strokeStyle = 'rgba(214,180,120,0.28)';
    ctx.lineWidth = 1.2;
    for (const f of fossils) {
      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const th = (i / 140) * TAU * 3.2, r = f.r * Math.exp(0.16 * (th - TAU * 3.2));
        const x = f.x + Math.cos(th + f.rot) * r, y = f.y + Math.sin(th + f.rot) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      for (let i = 8; i < 140; i += 7) {
        const th = (i / 140) * TAU * 3.2, r = f.r * Math.exp(0.16 * (th - TAU * 3.2)), r2 = r * 0.6;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(th + f.rot) * r, f.y + Math.sin(th + f.rot) * r);
        ctx.lineTo(f.x + Math.cos(th + f.rot) * r2, f.y + Math.sin(th + f.rot) * r2);
        ctx.stroke();
      }
    }
    for (const c of crystals) {
      ctx.fillStyle = rgba(hslToRgb(c.hue, 60, 45), 0.5);
      for (let i = 0; i < c.n; i++) {
        const a = c.rot + (i / c.n) * Math.PI - Math.PI / 2, L = c.r * (0.6 + 0.5 * Math.sin(i * 2.3));
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(a - 0.12) * L, c.y + Math.sin(a - 0.12) * L);
        ctx.lineTo(c.x + Math.cos(a) * L * 1.2, c.y + Math.sin(a) * L * 1.2);
        ctx.lineTo(c.x + Math.cos(a + 0.12) * L, c.y + Math.sin(a + 0.12) * L);
        ctx.fill();
      }
    }
    // mycélium
    ctx.strokeStyle = 'rgba(235,230,255,0.07)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const th of threads) { ctx.moveTo(th.a[0], th.a[1]); ctx.quadraticCurveTo(th.mx, th.my, th.b[0], th.b[1]); }
    ctx.stroke();
    // racines
    ctx.lineCap = 'round';
    for (const r of roots) {
      for (let i = 1; i < r.pts.length; i++) {
        const [x0, y0, w0] = r.pts[i - 1], [x1, y1] = r.pts[i];
        ctx.strokeStyle = 'rgba(58,36,30,0.95)';
        ctx.lineWidth = w0;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    // le cœur
    const pulse = 1 + beat * 0.05;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([180, 120, 255], 64), hx, hy, hr * 2.6 * pulse, 0.3 + beat * 0.25);
    ctx.globalCompositeOperation = 'source-over';
    if (bufView) {
      ctx.save();
      ctx.beginPath(); ctx.arc(hx, hy, hr * pulse, 0, TAU); ctx.clip();
      const ratio = bufView.s / view.s;
      const size = hr * 2 * pulse * ratio * 1.05;
      const offX = ((bufView.x - view.x) / view.s) * hr * 2 * pulse, offY = ((bufView.y - view.y) / view.s) * hr * 2 * pulse;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, hx - size / 2 + offX, hy - size / 2 + offY, size, size);
      ctx.restore();
    }
    ctx.strokeStyle = `rgba(210,180,255,${0.35 + beat * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, hr * pulse, 0, TAU); ctx.stroke();

    // la sève et les signaux du mycélium
    ctx.globalCompositeOperation = 'lighter';
    const sap = glow([255, 210, 130], 16);
    for (const b of beads) { const [x, y] = pointOnRoot(b.r, b.k); drawGlow(ctx, sap, x, y, 9, 0.95); }
    const sig = glow([220, 220, 255], 12);
    threads.forEach((th, i) => {
      const k = ((t * 0.18 + i * 0.37) % 1.6);
      if (k > 1) return;
      const x = (1 - k) * (1 - k) * th.a[0] + 2 * (1 - k) * k * th.mx + k * k * th.b[0];
      const y = (1 - k) * (1 - k) * th.a[1] + 2 * (1 - k) * k * th.my + k * k * th.b[1];
      drawGlow(ctx, sig, x, y, 4, 0.6);
    });
    for (const s of sparks) drawGlow(ctx, glow(s.c, 12), s.x, s.y, 5, 1 - s.age / s.life);
    // la Graine d'Or, au-dessus du cœur
    if (seedShown) {
      const sy = hy - hr * 1.35 + Math.sin(t * 1.4) * 6, k = clamp(seedT / 3, 0, 1);
      drawGlow(ctx, glow([255, 210, 110], 64), hx, sy, 80 * k, 0.6);
      drawGlow(ctx, glow([255, 245, 200], 16), hx, sy, 10 * k, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // l'obscurité : seule ta lanterne (et le cœur) éclairent
    dctx.globalCompositeOperation = 'source-over';
    dctx.fillStyle = 'rgba(2,1,5,0.86)';
    dctx.clearRect(0, 0, W, H);
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';
    const lr = Math.min(W, H) * 0.3;
    const lg = dctx.createRadialGradient(lanternX, lanternY, 0, lanternX, lanternY, lr);
    lg.addColorStop(0, 'rgba(0,0,0,1)');
    lg.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = lg;
    dctx.fillRect(0, 0, W, H);
    const hg = dctx.createRadialGradient(hx, hy, hr * 0.6, hx, hy, hr * 1.9);
    hg.addColorStop(0, 'rgba(0,0,0,1)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = hg;
    dctx.fillRect(0, 0, W, H);
    ctx.drawImage(dark, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 220, 170], 48), lanternX, lanternY, lr * 0.5, 0.08);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (!diving) {
      ctx.font = 'italic 300 20px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = `rgba(220,200,255,${0.45 + beat * 0.3})`;
      ctx.fillText('z ← z² + c', hx, hy + hr + 18);
    }
  }

  // ——— Gestes
  function tap(p) {
    if (seedShown && seedT > 1.5 && Math.hypot(p.x - hx, p.y - (hy - hr * 1.35)) < 40) { finale(); return; }
    if (Math.hypot(p.x - hx, p.y - hy) < hr) {
      if (!diving) { diving = true; returning = false; diveT = 0; secrets.find('coeur'); [0, 3, 7, 10].forEach((d, i) => audio.note(d, { type: 'bell', vel: 0.1, at: i * 0.15, dur: 3 })); }
      else returning = true;
      return;
    }
    // toucher une racine y envoie la sève
    for (const r of roots) {
      for (let i = 0; i < r.pts.length; i += 3) {
        const [x, y, w] = r.pts[i];
        if (Math.hypot(p.x - x, p.y - y) < w + 14) {
          beads.push({ r, k: i / r.pts.length, speed: 0.3 });
          audio.note(2 + r.depth * 2, { type: 'pluck', vel: 0.16, dur: 1.4, oct: -1 });
          return;
        }
      }
    }
    for (let k = 0; k < 10; k++) { const a = Math.random() * TAU; sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, c: [220, 200, 255], age: 0, life: 0.9 }); }
  }

  // La Graine d'Or : un autre monde poussera, à partir d'elle
  function finale() {
    secrets.find('graine');
    const s = (Math.random() * 1e9) >>> 0;
    secrets.reseed(s);
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((d, i) => audio.note(d, { type: 'bell', vel: 0.1, at: i * 0.14, dur: 3.6, send: 0.6 }));
    api.toast({ kicker: 'Fin, et recommencement', title: 'Un autre arbre', text: 'Tu as planté la Graine d\'Or. L\'Arbre-Monde repousse, différent : un nouvel arbre, de nouvelles branches. Tes secrets restent dans ton carnet.', ms: 9000 });
    setTimeout(() => api.regrow(), 1600);
  }

  return { resize, update, draw, tap, destroy() {} };
}
