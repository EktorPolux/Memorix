// Sève — L'Harmonie des Sphères : une étoile, la gravité, et des orbites qui chantent en franchissant le méridien.
import { TAU, clamp, lerp, glow, drawGlow, rgba, hslToRgb, makeCanvas, makeNoise, rng } from '../engine.js';

export const mood = {
  root: 130.81, scale: 'majPenta', wave: 'sine', chord: [0, 7, 12, 19], pad: 0.04, cutoff: 900, lfo: 0.03,
  noise: { type: 'highpass', freq: 5200, q: 0.2, gain: 0.004, gust: 0.4, gustRate: 0.05 },
  motif: false, // ici, ce sont les orbites qui chantent
};

const EPS2 = 30; // adoucissement de la gravité aux très courtes distances
const TRAIL = 200;
// Chenciner & Montgomery (2000) : conditions initiales de la chorégraphie en huit (G = m = 1)
const EIGHT = { x: 0.97000436, y: -0.24308753, vx: -0.93240737, vy: -0.86473146, T: 6.32591398 };

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(5);
  let W = api.W, H = api.H, cx = 0, cy = 0, GM = 1, starR = 14;
  let sky = null;
  const planets = [], comets = [], sparks = [], links = [];
  let aim = null, starTaps = [], dance = null, starPulse = 0, meridianGlow = 0;
  let nextComet = 25, lastCount = -1, resonanceFound = secrets.has('resonance');

  function resize(w, h) {
    const sx = w / (W || w), sy = h / (H || h);
    W = w; H = h;
    const ocx = cx, ocy = cy;
    cx = W / 2; cy = H / 2 + (H > W ? -10 : 8);
    const r0 = Math.min(W, H) * 0.25;
    GM = (4 * Math.PI * Math.PI * r0 * r0 * r0) / 36; // une orbite de rayon r0 dure 6 s
    starR = clamp(Math.min(W, H) * 0.022, 9, 18);
    for (const p of planets) { p.x = cx + (p.x - ocx) * sx; p.y = cy + (p.y - ocy) * sy; }
    buildSky();
  }

  // Ciel : étoiles et nébuleuses, peints une fois
  function buildSky() {
    sky = makeCanvas(W, H);
    const g = sky.getContext('2d');
    g.fillStyle = '#020108';
    g.fillRect(0, 0, W, H);
    const lw = Math.ceil(W / 6), lh = Math.ceil(H / 6);
    const neb = makeCanvas(lw, lh);
    const ng = neb.getContext('2d');
    const img = ng.createImageData(lw, lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const v = noise.fbm2(x * 0.03, y * 0.03, 5);
      const w2 = noise.fbm2(x * 0.02 + 40, y * 0.02, 4);
      const a = clamp(v * 1.4 + 0.1, 0, 1);
      const i = (y * lw + x) * 4;
      img.data[i] = 40 + 90 * clamp(w2 + 0.5, 0, 1);
      img.data[i + 1] = 20 + 40 * a;
      img.data[i + 2] = 80 + 100 * clamp(0.5 - w2, 0, 1);
      img.data[i + 3] = a * 70;
    }
    ng.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(neb, 0, 0, W, H);
    const R = rng(77);
    for (let i = 0; i < Math.round((W * H) / 2600); i++) {
      const x = R() * W, y = R() * H, s = R() < 0.06 ? 1.6 : 0.5 + R() * 0.8;
      const c = R();
      g.fillStyle = c < 0.15 ? `rgba(255,210,180,${0.4 + R() * 0.5})` : c < 0.3 ? `rgba(180,200,255,${0.4 + R() * 0.5})` : `rgba(240,240,255,${0.3 + R() * 0.5})`;
      g.fillRect(x, y, s, s);
    }
  }
  resize(W, H);
  const twinkles = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU, sp: 0.6 + Math.random() * 2 }));

  // ——— Orbites
  function orbitInfo(p) {
    const dx = p.x - cx, dy = p.y - cy, r = Math.hypot(dx, dy);
    const v2 = p.vx * p.vx + p.vy * p.vy;
    const E = v2 / 2 - GM / r;
    if (E >= 0) return null;
    const a = -GM / (2 * E);
    return { a, T: TAU * Math.sqrt((a * a * a) / GM) };
  }
  // la hauteur de la note suit la période : une orbite rapide chante plus aigu
  function degreeFor(p) {
    const o = orbitInfo(p);
    if (!o) return 2;
    return clamp(Math.round(-Math.log2(o.T / 6) * 5) + 5, 0, 16);
  }

  function addPlanet(x, y, vx, vy) {
    const r = 3.5 + Math.random() * 4.5;
    const dist = Math.hypot(x - cx, y - cy);
    const hue = (200 + (dist / Math.min(W, H)) * 300 + Math.random() * 40) % 360;
    const p = { x, y, vx, vy, r, m: r * r * r * 0.0000045, c: hslToRgb(hue, 70, 66), trail: new Float32Array(TRAIL * 2), ti: 0, tn: 0, born: engine.t, side: Math.sign(x - cx) || 1, flash: 0, ring: Math.random() < 0.2 };
    planets.push(p);
    audio.note(degreeFor(p), { type: 'glass', vel: 0.1, dur: 2.2, pan: ((x - cx) / W) * 2 });
    return p;
  }

  function accel(px, py, self) {
    const dx = cx - px, dy = cy - py;
    const d2 = dx * dx + dy * dy + EPS2, inv = GM / (d2 * Math.sqrt(d2));
    let ax = dx * inv, ay = dy * inv;
    for (const o of planets) {
      if (o === self || o.dead) continue;
      const ex = o.x - px, ey = o.y - py;
      const e2 = ex * ex + ey * ey + EPS2, k = (GM * o.m) / (e2 * Math.sqrt(e2));
      ax += ex * k; ay += ey * k;
    }
    return [ax, ay];
  }

  function stepPlanets(dt) {
    const n = 4, h = dt / n;
    for (let s = 0; s < n; s++) {
      // saute-mouton (leapfrog) : stable sur des milliers d'orbites
      for (const p of planets) { const [ax, ay] = accel(p.x, p.y, p); p.vx += ax * h * 0.5; p.vy += ay * h * 0.5; }
      for (const p of planets) { p.px = p.x; p.py = p.y; p.x += p.vx * h; p.y += p.vy * h; }
      for (const p of planets) { const [ax, ay] = accel(p.x, p.y, p); p.vx += ax * h * 0.5; p.vy += ay * h * 0.5; }
      for (const p of planets) {
        // le méridien : la demi-droite qui monte de l'étoile. Chaque passage sonne.
        if (p.y < cy && p.py < cy && Math.sign(p.x - cx) !== Math.sign(p.px - cx)) {
          p.flash = 1;
          meridianGlow = 1;
          audio.note(degreeFor(p), { type: 'bell', vel: clamp(0.06 + p.r * 0.012, 0.06, 0.16), dur: 2.6, send: 0.45 });
          for (let k = 0; k < 6; k++) sparks.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, c: p.c, age: 0, life: 0.8 });
        }
      }
    }
    // collisions : fusion entre planètes, absorption par l'étoile, fuite au loin
    for (const p of planets) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < starR * 0.9) {
        p.dead = true;
        starPulse = 1;
        audio.noise({ freq: 300, q: 0.8, dur: 1.2, vel: 0.12, type: 'lowpass', sweep: 4 });
        for (let k = 0; k < 24; k++) { const a = Math.random() * TAU; sparks.push({ x: cx, y: cy, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, c: [255, 220, 160], age: 0, life: 1.2 }); }
      } else if (d > Math.max(W, H) * 2.2) p.dead = true;
    }
    for (let i = 0; i < planets.length; i++) {
      const a = planets[i];
      if (a.dead) continue;
      for (let j = i + 1; j < planets.length; j++) {
        const b = planets[j];
        if (b.dead) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.85) {
          const m = a.m + b.m;
          a.vx = (a.vx * a.m + b.vx * b.m) / m; a.vy = (a.vy * a.m + b.vy * b.m) / m;
          a.x = (a.x * a.m + b.x * b.m) / m; a.y = (a.y * a.m + b.y * b.m) / m;
          a.r = Math.cbrt(a.r ** 3 + b.r ** 3); a.m = m;
          b.dead = true;
          audio.note(degreeFor(a) - 5, { type: 'pluck', vel: 0.2, dur: 1.4, oct: -1 });
          for (let k = 0; k < 16; k++) { const ang = Math.random() * TAU; sparks.push({ x: a.x, y: a.y, vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 90, c: a.c, age: 0, life: 1 }); }
        }
      }
    }
    for (let i = planets.length - 1; i >= 0; i--) if (planets[i].dead) planets.splice(i, 1);
    for (const p of planets) {
      p.trail[p.ti * 2] = p.x; p.trail[p.ti * 2 + 1] = p.y;
      p.ti = (p.ti + 1) % TRAIL; p.tn = Math.min(TRAIL, p.tn + 1);
    }
  }

  // Comètes : de longues ellipses, une queue toujours tournée à l'opposé de l'étoile
  function spawnComet() {
    const a = Math.random() * TAU, r = Math.max(W, H) * 0.75;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const vEsc = Math.sqrt((2 * GM) / r) * 0.93;
    const inward = a + Math.PI + (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.15);
    comets.push({ x, y, vx: Math.cos(inward) * vEsc, vy: Math.sin(inward) * vEsc, age: 0 });
  }

  // ——— La danse en huit
  function startDance() {
    dance = { t: 0, b: [
      { x: EIGHT.x, y: EIGHT.y, vx: -EIGHT.vx / 2, vy: -EIGHT.vy / 2 },
      { x: -EIGHT.x, y: -EIGHT.y, vx: -EIGHT.vx / 2, vy: -EIGHT.vy / 2 },
      { x: 0, y: 0, vx: EIGHT.vx, vy: EIGHT.vy },
    ].map((b, i) => ({ ...b, trail: [], c: [[255, 210, 140], [160, 200, 255], [255, 160, 210]][i], side: 0 })), S: Math.min(W, H) * 0.3 };
    secrets.find('huit');
    audio.noise({ freq: 200, q: 0.7, dur: 2.5, vel: 0.14, type: 'lowpass', sweep: 6 });
  }
  function stepDance(dt) {
    const d = dance;
    d.t += dt;
    const speed = EIGHT.T / 7; // un tour de huit en 7 secondes
    const n = 12, h = (dt * speed) / n;
    const acc = (b, others) => {
      let ax = 0, ay = 0;
      for (const o of others) { const dx = o.x - b.x, dy = o.y - b.y, r2 = dx * dx + dy * dy, k = 1 / (r2 * Math.sqrt(r2)); ax += dx * k; ay += dy * k; }
      return [ax, ay];
    };
    for (let s = 0; s < n; s++) {
      for (const b of d.b) { const [ax, ay] = acc(b, d.b.filter(o => o !== b)); b.vx += ax * h * 0.5; b.vy += ay * h * 0.5; }
      for (const b of d.b) { b.ox = b.x; b.x += b.vx * h; b.y += b.vy * h; }
      for (const b of d.b) { const [ax, ay] = acc(b, d.b.filter(o => o !== b)); b.vx += ax * h * 0.5; b.vy += ay * h * 0.5; }
    }
    d.b.forEach((b, i) => {
      if (Math.sign(b.x) !== Math.sign(b.ox) && b.ox !== undefined) audio.note([0, 4, 7][i] + (b.y < 0 ? 5 : 0), { type: 'bell', vel: 0.1, dur: 2.4, pan: 0 });
      b.trail.push(cx + b.x * d.S, cy + b.y * d.S);
      if (b.trail.length > 360) b.trail.splice(0, 2);
    });
    if (d.t > 30) { dance = null; starPulse = 1.5; audio.note(0, { type: 'soft', vel: 0.14, dur: 4, oct: -1 }); }
  }

  // ——— Évolution
  function update(dt, t) {
    if (dance) stepDance(dt);
    else {
      stepPlanets(dt);
      nextComet -= dt;
      if (nextComet <= 0) { spawnComet(); nextComet = 40 + Math.random() * 30; }
    }
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.age += dt;
      for (let s = 0; s < 4; s++) {
        const h = dt / 4, dx = cx - c.x, dy = cy - c.y, d2 = dx * dx + dy * dy + EPS2, k = GM / (d2 * Math.sqrt(d2));
        c.vx += dx * k * h; c.vy += dy * k * h; c.x += c.vx * h; c.y += c.vy * h;
      }
      if (c.age > 6 && Math.hypot(c.x - cx, c.y - cy) > Math.max(W, H)) comets.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.pow(0.3, dt); s.vy *= Math.pow(0.3, dt);
      if (s.age > s.life) sparks.splice(i, 1);
    }
    for (const p of planets) p.flash = Math.max(0, p.flash - dt * 1.5);
    starPulse = Math.max(0, starPulse - dt * 0.8);
    meridianGlow = Math.max(0, meridianGlow - dt * 1.2);

    // le septième ciel, et les résonances
    const bound = planets.filter(p => orbitInfo(p));
    if (bound.length !== lastCount) {
      lastCount = bound.length;
      api.label(bound.length ? `${bound.length} monde${bound.length > 1 ? 's' : ''} en orbite` : 'le ciel attend');
    }
    if (bound.length >= 7) secrets.find('septieme');
    if (!resonanceFound && bound.length >= 2 && engine.frame % 20 === 0) {
      const info = bound.map(p => ({ p, o: orbitInfo(p) })).filter(x => engine.t - x.p.born > x.o.T * 1.5);
      for (let i = 0; i < info.length && !resonanceFound; i++) for (let j = i + 1; j < info.length; j++) {
        const r = Math.max(info[i].o.T, info[j].o.T) / Math.min(info[i].o.T, info[j].o.T);
        if (Math.abs(r - 2) < 0.04 || Math.abs(r - 1.5) < 0.03) {
          resonanceFound = true;
          links.push({ a: info[i].p, b: info[j].p, age: 0 });
          secrets.find('resonance');
          break;
        }
      }
    }
    for (let i = links.length - 1; i >= 0; i--) { links[i].age += dt; if (links[i].age > 8) links.splice(i, 1); }
  }

  // ——— Dessin
  function draw(ctx, t) {
    ctx.drawImage(sky, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of twinkles) {
      const a = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 6);
      if (a > 0.05) drawGlow(ctx, glow([220, 230, 255], 8), s.x * W, s.y * H, 4, a * 0.8);
    }
    ctx.globalCompositeOperation = 'source-over';

    // le méridien
    const mg = ctx.createLinearGradient(cx, cy, cx, 0);
    mg.addColorStop(0, `rgba(255,220,170,${0.18 + meridianGlow * 0.4})`);
    mg.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.strokeStyle = mg;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - starR * 1.6); ctx.lineTo(cx, 0); ctx.stroke();

    // traînées (pendant la danse, le ciel retient son souffle : les planètes s'effacent)
    for (const p of planets) {
      if (p.tn < 2 || dance) continue;
      const step = 40;
      for (let s = 0; s < p.tn - 1; s += step) {
        const a = (1 - s / TRAIL) * 0.55;
        ctx.strokeStyle = rgba(p.c, a);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let k = s; k <= Math.min(p.tn - 1, s + step); k++) {
          const idx = ((p.ti - 1 - k) % TRAIL + TRAIL) % TRAIL;
          const x = p.trail[idx * 2], y = p.trail[idx * 2 + 1];
          if (k === s) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    for (const l of links) {
      const k = 1 - l.age / 8;
      ctx.strokeStyle = `rgba(255,214,120,${0.6 * k})`;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (dance) drawDance(ctx, t);
    else drawStar(ctx, t);

    // planètes, éclairées du côté de l'étoile
    for (const p of dance ? [] : planets) {
      const dx = cx - p.x, dy = cy - p.y, d = Math.hypot(dx, dy) || 1;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow(p.c.map(Math.round), 32), p.x, p.y, p.r * (3 + p.flash * 3), 0.25 + p.flash * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      const grd = ctx.createRadialGradient(p.x + (dx / d) * p.r * 0.45, p.y + (dy / d) * p.r * 0.45, p.r * 0.1, p.x, p.y, p.r);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.45, rgba(p.c, 1));
      grd.addColorStop(1, rgba(p.c.map(v => v * 0.25), 1));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      if (p.ring) {
        ctx.strokeStyle = rgba(p.c, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2, p.r * 0.6, -0.4, 0, TAU); ctx.stroke();
      }
    }
    // comètes
    for (const c of comets) {
      const dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy) || 1;
      const L = clamp(26000 / d, 20, 220);
      const g = ctx.createLinearGradient(c.x, c.y, c.x + (dx / d) * L, c.y + (dy / d) * L);
      g.addColorStop(0, 'rgba(200,235,255,0.75)');
      g.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + (dx / d) * L, c.y + (dy / d) * L); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([210, 240, 255], 16), c.x, c.y, 9, 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks) drawGlow(ctx, glow(s.c.map(Math.round), 12), s.x, s.y, 4, 1 - s.age / s.life);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // la visée : flèche et trajectoire prédite
    if (aim && aim.active) drawAim(ctx);
  }

  function drawStar(ctx, t) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 170, 90], 64), cx, cy, starR * 14, 0.22 + starPulse * 0.3);
    drawGlow(ctx, glow([255, 220, 160], 48), cx, cy, starR * 5, 0.6 + starPulse * 0.3);
    // couronne : des rayons qui frémissent
    ctx.strokeStyle = 'rgba(255,210,150,0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + t * 0.03;
      const L = starR * (1.8 + 1.6 * (0.5 + 0.5 * noise.n2(i * 0.7, t * 0.3)));
      ctx.moveTo(cx + Math.cos(a) * starR * 1.1, cy + Math.sin(a) * starR * 1.1);
      ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    }
    ctx.stroke();
    drawGlow(ctx, glow([255, 252, 240], 24), cx, cy, starR * 1.5, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawDance(ctx, t) {
    const d = dance;
    d.b.forEach(b => {
      ctx.strokeStyle = rgba(b.c, 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < b.trail.length; i += 2) { if (i) ctx.lineTo(b.trail[i], b.trail[i + 1]); else ctx.moveTo(b.trail[i], b.trail[i + 1]); }
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'lighter';
    const fade = Math.min(1, d.t / 1.5) * (d.t > 28 ? (30 - d.t) / 2 : 1);
    d.b.forEach(b => {
      const x = cx + b.x * d.S, y = cy + b.y * d.S;
      drawGlow(ctx, glow(b.c, 48), x, y, starR * 6, 0.5 * fade);
      drawGlow(ctx, glow([255, 252, 240], 24), x, y, starR * 1.3, fade);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function aimVelocity() { return [(aim.x - aim.sx) * 1.5, (aim.y - aim.sy) * 1.5]; }
  function drawAim(ctx) {
    const [vx, vy] = aimVelocity();
    ctx.strokeStyle = 'rgba(255,230,190,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(aim.sx, aim.sy); ctx.lineTo(aim.x, aim.y); ctx.stroke();
    const a = Math.atan2(aim.y - aim.sy, aim.x - aim.sx);
    ctx.beginPath();
    ctx.moveTo(aim.x, aim.y);
    ctx.lineTo(aim.x - Math.cos(a - 0.4) * 10, aim.y - Math.sin(a - 0.4) * 10);
    ctx.moveTo(aim.x, aim.y);
    ctx.lineTo(aim.x - Math.cos(a + 0.4) * 10, aim.y - Math.sin(a + 0.4) * 10);
    ctx.stroke();
    // trajectoire prédite, avec la seule étoile
    let x = aim.sx, y = aim.sy, ux = vx, uy = vy;
    const h = 1 / 60;
    ctx.fillStyle = 'rgba(255,230,190,0.55)';
    for (let i = 0; i < 360; i++) {
      for (let s = 0; s < 2; s++) {
        const dx = cx - x, dy = cy - y, d2 = dx * dx + dy * dy + EPS2, k = GM / (d2 * Math.sqrt(d2));
        ux += dx * k * h / 2; uy += dy * k * h / 2; x += ux * h / 2; y += uy * h / 2;
      }
      if (Math.hypot(x - cx, y - cy) < starR) break;
      if (i % 4 === 0) { ctx.globalAlpha = 1 - i / 360; ctx.fillRect(x - 1, y - 1, 2, 2); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 230, 190], 16), aim.sx, aim.sy, 8, 0.9);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ——— Gestes
  const onStar = (x, y) => Math.hypot(x - cx, y - cy) < starR * 2.6;
  function down(p) {
    if (dance || onStar(p.x, p.y)) return;
    aim = { sx: p.x, sy: p.y, x: p.x, y: p.y, active: false, id: p.id };
  }
  function move(p) {
    if (!aim || p.id !== aim.id) return;
    aim.x = p.x; aim.y = p.y;
    if (Math.hypot(aim.x - aim.sx, aim.y - aim.sy) > 14) aim.active = true;
  }
  function up(p) {
    if (!aim || p.id !== aim.id) return;
    if (aim.active) { const [vx, vy] = aimVelocity(); addPlanet(aim.sx, aim.sy, vx, vy); }
    aim = null;
  }
  function tap(p) {
    const t = engine.t;
    if (dance) return;
    if (onStar(p.x, p.y)) {
      starTaps = starTaps.filter(x => t - x < 2.2);
      starTaps.push(t);
      starPulse = 1;
      audio.note(starTaps.length * 2, { type: 'bell', vel: 0.12, dur: 2.5, oct: -1 });
      if (starTaps.length >= 3) { starTaps = []; startDance(); }
      return;
    }
    // une orbite parfaite : la vitesse circulaire, perpendiculaire au rayon
    const dx = p.x - cx, dy = p.y - cy, r = Math.hypot(dx, dy);
    if (r < starR * 3) return;
    const v = Math.sqrt(GM / r) * (0.97 + Math.random() * 0.06);
    addPlanet(p.x, p.y, (-dy / r) * v, (dx / r) * v);
  }

  // un ciel déjà habité à l'arrivée : trois mondes sur des orbites différentes
  [0.5, 0.78, 1.15].forEach((k, i) => {
    const r = Math.min(W, H) * 0.25 * k, a = i * 2.1 + 0.4;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, v = Math.sqrt(GM / r) * (0.95 + i * 0.04);
    const p = addPlanet(x, y, -Math.sin(a) * v, Math.cos(a) * v);
    p.born -= 30;
  });

  return { resize, update, draw, tap, down, move, up, words: { huit: () => { if (!dance) startDance(); } }, destroy() {} };
}
