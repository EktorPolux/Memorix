// Sève — Les Lignes de Force : des aimants, de la limaille de fer qui s'oriente, des lignes qui coulent
// du nord au sud, ta main qui devient boussole, et une bobine où l'on rejoue l'induction de Faraday (1831).
import { TAU, clamp, glow, drawGlow, makeCanvas, angleDiff } from '../engine.js';

export const mood = {
  root: 87.31, scale: 'dorian', wave: 'sine', chord: [0, 7, 12], pad: 0.045, cutoff: 600, lfo: 0.03,
  noise: { type: 'bandpass', freq: 100, q: 3, gain: 0.006, gust: 0.2, gustRate: 0.05 },
};

const EPS2 = 60;

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const q = engine.quality;
  let W = api.W, H = api.H, bg = null;
  let magnets = [], coil = null, lines = [], dirty = true, gap = 12;
  let FX, FY, FA, FT, FM, nf = 0;
  const compass = { a: -Math.PI / 2, v: 0 };
  let drag = null, lastTap = {}, sparks = [], flowT = 0, lastCount = -1, bulbNote = 0;

  function resize(w, h) {
    W = w; H = h;
    bg = makeCanvas(W, H);
    const g = bg.getContext('2d');
    const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, '#0e131f'); grd.addColorStop(1, '#04060b');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(im, 0, 0);
    // la limaille : une grille de petits copeaux qui chercheront le champ
    gap = (q < 0.8 ? 15 : 12) * (W < 560 ? 1.15 : 1);
    const cols = Math.ceil(W / gap), rows = Math.ceil(H / gap);
    nf = cols * rows;
    FX = new Float32Array(nf); FY = new Float32Array(nf); FA = new Float32Array(nf); FT = new Float32Array(nf); FM = new Float32Array(nf);
    for (let i = 0; i < nf; i++) {
      FX[i] = (i % cols) * gap + gap / 2 + (Math.random() - 0.5) * gap * 0.6;
      FY[i] = Math.floor(i / cols) * gap + gap / 2 + (Math.random() - 0.5) * gap * 0.6;
      FA[i] = FT[i] = Math.random() * Math.PI;
    }
    if (!coil) coil = { x: W * (H > W ? 0.72 : 0.82), y: H * (H > W ? 0.8 : 0.7), flux: 0, emf: 0, glow: 0, first: true };
    else { coil.x = Math.min(coil.x, W - 60); coil.y = Math.min(coil.y, H - 80); }
    dirty = true;
  }
  resize(W, H);
  const L0 = () => clamp(Math.min(W, H) * 0.18, 70, 150);
  const addMagnet = (x, y, a, len = L0()) => magnets.push({ x, y, a, ta: a, len, lift: 0, pulse: 0 });
  addMagnet(W * 0.34, H * 0.46, 0);
  addMagnet(W * 0.6, H * (H > W ? 0.6 : 0.5), Math.PI / 5);

  // Chaque aimant : un pôle nord (+) et un pôle sud (−). Champ en 1/r², comme deux charges magnétiques.
  function poles() {
    const P = [];
    for (const m of magnets) {
      const c = Math.cos(m.a), s = Math.sin(m.a), k = m.len * m.len * 0.9;
      P.push(m.x + c * m.len * 0.45, m.y + s * m.len * 0.45, k, m.x - c * m.len * 0.45, m.y - s * m.len * 0.45, -k);
    }
    return P;
  }
  function field(x, y, P) {
    let bx = 0, by = 0;
    for (let i = 0; i < P.length; i += 3) {
      const dx = x - P[i], dy = y - P[i + 1], r2 = dx * dx + dy * dy + EPS2, k = P[i + 2] / (r2 * Math.sqrt(r2));
      bx += dx * k; by += dy * k;
    }
    return [bx, by];
  }

  // Les lignes de champ : on part des pôles nord et on suit le champ jusqu'à un pôle sud
  function traceLines(P) {
    lines = [];
    const seeds = q < 0.8 ? 12 : 16;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 2] < 0) continue;
      for (let k = 0; k < seeds; k++) {
        const a = (k / seeds) * TAU;
        let x = P[i] + Math.cos(a) * 9, y = P[i + 1] + Math.sin(a) * 9;
        const pts = [x, y];
        for (let s = 0; s < 420; s++) {
          let [bx, by] = field(x, y, P);
          let l = Math.hypot(bx, by) || 1;
          const mx = x + (bx / l) * 2.5, my = y + (by / l) * 2.5;
          [bx, by] = field(mx, my, P);
          l = Math.hypot(bx, by) || 1;
          x += (bx / l) * 5; y += (by / l) * 5;
          pts.push(x, y);
          if (x < -120 || y < -120 || x > W + 120 || y > H + 120) break;
          let end = false;
          for (let j = 0; j < P.length; j += 3) if (P[j + 2] < 0 && (x - P[j]) ** 2 + (y - P[j + 1]) ** 2 < 81) { end = true; break; }
          if (end) break;
        }
        let len = 0;
        for (let j = 2; j < pts.length; j += 2) len += Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]);
        lines.push({ pts, len });
      }
    }
  }

  function update(dt, t) {
    flowT += dt;
    for (const m of magnets) {
      const d = angleDiff(m.ta, m.a);
      if (Math.abs(d) > 0.002) { m.a += d * Math.min(1, dt * 9); dirty = true; }
      m.lift += ((drag && drag.m === m ? 1 : 0) - m.lift) * Math.min(1, dt * 10);
      m.pulse = Math.max(0, m.pulse - dt * 2);
    }
    const P = poles();
    if (dirty) {
      for (let i = 0; i < nf; i++) {
        const [bx, by] = field(FX[i], FY[i], P);
        FT[i] = Math.atan2(by, bx);
        FM[i] = clamp((Math.log10(Math.hypot(bx, by) + 1e-9) + 1.2) / 2.6, 0.04, 1);
      }
      traceLines(P);
      dirty = false;
    }
    // la limaille s'aligne doucement, sans distinguer ses deux bouts
    for (let i = 0; i < nf; i++) {
      let d = FT[i] - FA[i];
      d = ((d + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
      FA[i] += d * Math.min(1, dt * 6);
    }
    // la boussole au bout des doigts : une aiguille amortie
    if (input.inside || input.down) {
      const [bx, by] = field(input.x, input.y, P);
      const target = Math.atan2(by, bx);
      compass.v += (Math.sin(angleDiff(target, compass.a)) * 40 - compass.v * 4.5) * dt;
      compass.a += compass.v * dt;
    }
    // la bobine : le flux qui la traverse ; s'il varie, un courant naît et l'ampoule s'allume
    let flux = 0;
    for (const dx of [-30, 0, 30]) flux += field(coil.x + dx, coil.y, P)[0];
    if (coil.first) { coil.flux = flux; coil.first = false; }
    const emf = Math.abs(flux - coil.flux) / Math.max(dt, 1e-3);
    coil.flux = flux;
    coil.emf += (Math.min(2, emf * 0.9) - coil.emf) * Math.min(1, dt * 8);
    coil.glow = Math.max(coil.emf, coil.glow - dt * 1.5);
    if (coil.glow > 0.9) secrets.find('faraday');
    if (coil.glow > 0.5 && t - bulbNote > 0.6) { bulbNote = t; audio.note(7 + Math.round(coil.glow * 3), { type: 'glass', vel: 0.07, dur: 1.2 }); }
    // deux pôles semblables trop proches : ils se repoussent
    if (engine.frame % 10 === 0) {
      for (let i = 0; i < P.length; i += 3) for (let j = i + 3; j < P.length; j += 3) {
        if (Math.sign(P[i + 2]) !== Math.sign(P[j + 2]) || Math.floor(i / 6) === Math.floor(j / 6)) continue;
        if ((P[i] - P[j]) ** 2 + (P[i + 1] - P[j + 1]) ** 2 < 46 * 46) {
          for (let k = 0; k < 8; k++) { const a = Math.random() * TAU; sparks.push({ x: (P[i] + P[j]) / 2, y: (P[i + 1] + P[j + 1]) / 2, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, age: 0 }); }
          secrets.find('repulsion');
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.age > 0.7) sparks.splice(i, 1); }
    if (magnets.length !== lastCount) { lastCount = magnets.length; api.label(`${magnets.length} aimant${magnets.length > 1 ? 's' : ''}`); }
  }

  function draw(ctx, t) {
    ctx.drawImage(bg, 0, 0, W, H);
    // limaille, regroupée par intensité
    const half = gap * 0.36;
    for (let b = 0; b < 5; b++) {
      ctx.strokeStyle = `rgba(205,212,225,${0.12 + b * 0.17})`;
      ctx.lineWidth = 1 + b * 0.18;
      ctx.beginPath();
      for (let i = 0; i < nf; i++) {
        if (Math.min(4, Math.floor(FM[i] * 5)) !== b) continue;
        const c = Math.cos(FA[i]) * half, s = Math.sin(FA[i]) * half;
        ctx.moveTo(FX[i] - c, FY[i] - s); ctx.lineTo(FX[i] + c, FY[i] + s);
      }
      ctx.stroke();
    }
    // lignes de champ, et la lumière qui coule du nord vers le sud
    ctx.lineWidth = 1.2;
    for (const l of lines) {
      const p = l.pts, n = p.length;
      const g = ctx.createLinearGradient(p[0], p[1], p[n - 2], p[n - 1]);
      g.addColorStop(0, 'rgba(255,120,90,0.42)');
      g.addColorStop(1, 'rgba(90,190,255,0.42)');
      ctx.strokeStyle = g;
      ctx.beginPath();
      for (let i = 0; i < n; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[i], p[i + 1]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    const dot = glow([255, 225, 190], 10);
    for (const l of lines) {
      const p = l.pts;
      for (let s = (flowT * 60) % 46; s < l.len; s += 46) {
        // retrouver le point à la distance s le long de la ligne
        let acc = 0;
        for (let i = 2; i < p.length; i += 2) {
          const seg = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
          if (acc + seg >= s) { const k = (s - acc) / seg; drawGlow(ctx, dot, p[i - 2] + (p[i] - p[i - 2]) * k, p[i - 1] + (p[i + 1] - p[i - 1]) * k, 3.2, 0.75); break; }
          acc += seg;
        }
      }
    }
    for (const s of sparks) drawGlow(ctx, glow([255, 240, 200], 12), s.x, s.y, 5, 1 - s.age / 0.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawCoil(ctx, t);
    for (const m of magnets) drawMagnet(ctx, m);
    if (input.inside || input.down) drawCompass(ctx, input.x, input.y);
  }

  function drawMagnet(ctx, m) {
    const s = 1 + m.lift * 0.06 + m.pulse * 0.08, L = m.len * s, Wd = Math.max(16, m.len * 0.24) * s;
    ctx.save();
    ctx.translate(m.x, m.y + m.lift * -3);
    ctx.rotate(m.a);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-L / 2 + 4, -Wd / 2 + 6 + m.lift * 4, L, Wd);
    const rr = (x, w, col) => { ctx.fillStyle = col; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, -Wd / 2, w, Wd, 4); else ctx.rect(x, -Wd / 2, w, Wd); ctx.fill(); };
    rr(0, L / 2, '#d8443d');
    rr(-L / 2, L / 2, '#4b6db5');
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-L / 2, -Wd / 2, L, Wd * 0.28);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `600 ${Math.round(Wd * 0.55)}px "DM Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', L * 0.32, 1);
    ctx.fillText('S', -L * 0.32, 1);
    ctx.restore();
  }

  function drawCoil(ctx, t) {
    const { x, y } = coil, R = 24, len = 92, turns = 8;
    // l'ampoule, au-dessus, reliée par deux fils
    const bx = x, by = y - 70, gl = clamp(coil.glow, 0, 1.4);
    ctx.strokeStyle = 'rgba(200,140,90,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - len / 2, y - R * 0.6); ctx.quadraticCurveTo(x - len / 2, by, bx - 6, by + 14); ctx.moveTo(x + len / 2, y - R * 0.6); ctx.quadraticCurveTo(x + len / 2, by, bx + 6, by + 14); ctx.stroke();
    if (gl > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([255, 214, 140], 64), bx, by, 40 + gl * 90, Math.min(1, gl));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = `rgba(255,${200 + gl * 40},${150 + gl * 60},${0.12 + gl * 0.5})`;
    ctx.strokeStyle = 'rgba(220,230,255,0.5)';
    ctx.beginPath(); ctx.arc(bx, by, 14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(255,${180 + gl * 60},120,${0.4 + gl * 0.6})`;
    ctx.beginPath(); ctx.moveTo(bx - 5, by + 6); ctx.lineTo(bx - 3, by - 4); ctx.lineTo(bx, by + 2); ctx.lineTo(bx + 3, by - 4); ctx.lineTo(bx + 5, by + 6); ctx.stroke();
    ctx.fillStyle = 'rgba(160,160,170,0.9)';
    ctx.fillRect(bx - 6, by + 13, 12, 6);
    // les spires de cuivre
    ctx.lineWidth = 2.2;
    for (let i = 0; i <= turns; i++) {
      const cx = x - len / 2 + (i / turns) * len;
      ctx.strokeStyle = i % 2 ? 'rgba(214,130,70,0.95)' : 'rgba(240,160,95,0.95)';
      ctx.beginPath(); ctx.ellipse(cx, y, 6, R, 0, 0, TAU); ctx.stroke();
    }
    ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(240,200,160,0.5)';
    ctx.fillText('BOBINE', x, y + R + 8);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function drawCompass(ctx, x, y) {
    const r = 24;
    ctx.fillStyle = 'rgba(10,14,24,0.7)';
    ctx.strokeStyle = 'rgba(220,230,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, l = i % 4 ? 3 : 6; ctx.moveTo(x + Math.cos(a) * (r - l), y + Math.sin(a) * (r - l)); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.stroke();
    const c = Math.cos(compass.a), s = Math.sin(compass.a), px = -s * 4, py = c * 4;
    ctx.fillStyle = '#e04a40';
    ctx.beginPath(); ctx.moveTo(x + c * (r - 4), y + s * (r - 4)); ctx.lineTo(x + px, y + py); ctx.lineTo(x - px, y - py); ctx.fill();
    ctx.fillStyle = '#dfe6f5';
    ctx.beginPath(); ctx.moveTo(x - c * (r - 4), y - s * (r - 4)); ctx.lineTo(x + px, y + py); ctx.lineTo(x - px, y - py); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
  }

  // ——— Gestes : déplacer, tourner (toucher), retourner (maintenir), couper en deux (double toucher), ajouter
  function magnetAt(x, y) {
    for (let i = magnets.length - 1; i >= 0; i--) {
      const m = magnets[i], c = Math.cos(-m.a), s = Math.sin(-m.a), dx = x - m.x, dy = y - m.y;
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(lx) < m.len / 2 + 12 && Math.abs(ly) < Math.max(16, m.len * 0.24) / 2 + 14) return m;
    }
    return null;
  }
  const onCoil = (x, y) => Math.abs(x - coil.x) < 60 && y > coil.y - 90 && y < coil.y + 34;
  function down(p) {
    const m = magnetAt(p.x, p.y);
    if (m) { drag = { m, ox: p.x - m.x, oy: p.y - m.y }; magnets.splice(magnets.indexOf(m), 1); magnets.push(m); return; }
    if (onCoil(p.x, p.y)) drag = { coil: true, ox: p.x - coil.x, oy: p.y - coil.y };
  }
  function move(p) {
    if (!drag || p.hover) return;
    if (drag.coil) { coil.x = p.x - drag.ox; coil.y = p.y - drag.oy; return; }
    drag.m.x = p.x - drag.ox; drag.m.y = p.y - drag.oy;
    dirty = true;
  }
  function up() { drag = null; }
  function tap(p) {
    const t = engine.t;
    const m = magnetAt(p.x, p.y);
    if (m) {
      if (lastTap.m === m && t - lastTap.t < 0.34) {
        clearTimeout(lastTap.timer);
        lastTap = {};
        split(m);
        return;
      }
      lastTap = { m, t, timer: setTimeout(() => { m.ta += Math.PI / 4; m.pulse = 1; audio.note(3, { type: 'pluck', vel: 0.14, dur: 1 }); }, 340) };
      return;
    }
    if (onCoil(p.x, p.y)) return;
    if (magnets.length < 7) {
      addMagnet(p.x, p.y, Math.random() * TAU, L0() * (0.8 + Math.random() * 0.3));
      dirty = true;
      audio.note(Math.floor((1 - p.y / H) * 8), { type: 'bell', vel: 0.12, dur: 2, pan: (p.x / W) * 2 - 1 });
    }
  }
  function longpress(p) {
    const m = magnetAt(p.x, p.y);
    if (!m) return;
    drag = null;
    m.ta += Math.PI; // retourner l'aimant : le nord devient sud
    m.pulse = 1;
    audio.note(0, { type: 'soft', vel: 0.14, dur: 2, oct: -1 });
  }
  // couper un aimant ne donne pas un nord et un sud séparés : on obtient deux aimants
  function split(m) {
    const c = Math.cos(m.a), s = Math.sin(m.a), L = m.len;
    magnets.splice(magnets.indexOf(m), 1);
    addMagnet(m.x + c * L * 0.3, m.y + s * L * 0.3, m.a, L * 0.56);
    addMagnet(m.x - c * L * 0.3, m.y - s * L * 0.3, m.a, L * 0.56);
    dirty = true;
    for (let k = 0; k < 14; k++) { const a = Math.random() * TAU; sparks.push({ x: m.x, y: m.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, age: 0 }); }
    audio.noise({ freq: 3000, q: 1, dur: 0.25, vel: 0.08, type: 'bandpass' });
    secrets.find('monopole');
  }

  return { resize, update, draw, down, move, up, tap, longpress, destroy() { clearTimeout(lastTap.timer); } };
}
