// Sève — Le Bassin Primordial : six chimies, une matrice d'attirances, et des êtres qui émergent sous le microscope.
import { TAU, clamp, lerp, glow, drawGlow, rgba, makeCanvas } from '../engine.js';

export const mood = {
  root: 110, scale: 'dorian', wave: 'sine', chord: [0, 7, 10, 14], pad: 0.055, cutoff: 680, lfo: 0.035, droneOct: 1,
  noise: { type: 'lowpass', freq: 420, q: 0.6, gain: 0.013, gust: 0.5, gustRate: 0.05 },
};

const COLORS = [[94, 242, 255], [255, 94, 196], [255, 215, 94], [125, 255, 106], [169, 139, 255], [255, 138, 76], [240, 244, 255]];
const NS = 6; // espèces ; la 7e couleur est celle de LUCA, l'ancêtre commun
const RMAX = 0.15, BETA = 0.3, FORCE = 3.2;
const ERA_LEN = 40;
const ERA_NAMES = ['des Membranes', 'des Spirales', 'des Chasseurs', 'des Essaims', 'des Colonies', 'du Silence', 'des Comètes', 'des Symbioses', 'des Anneaux', 'des Nomades', 'des Serpents', 'des Fleurs', 'des Horloges', 'des Ombres'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const q = engine.quality;
  const N = Math.round(1300 * q);
  const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
  const AX = new Float32Array(N), AY = new Float32Array(N);
  const Sp = new Uint8Array(N), Orig = new Uint8Array(N), Back = new Float32Array(N);
  const K = new Float32Array(49), Kfrom = new Float32Array(49), Kto = new Float32Array(49);
  const CELLS = 14, CS = 2.1 / CELLS;
  const count = new Int32Array(CELLS * CELLS), start = new Int32Array(CELLS * CELLS + 1), order = new Int32Array(N), cellOf = new Int32Array(N);

  let W = api.W, H = api.H, cx = 0, cy = 0, R = 1;
  let trail = null, tctx = null, D = 0, dprT = 1;
  let era = 0, eraT = 0, trans = 1, eraName = '';
  let drops = 0, dropLog = [], labelTaps = [], lucaT = -1;
  let well = null, rainbow = false;
  const ripples = [];
  const sprites = COLORS.map(c => glow(c, 16, 0.3));

  for (let i = 0; i < N; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.95;
    X[i] = Math.cos(a) * r; Y[i] = Math.sin(a) * r;
    Sp[i] = Orig[i] = (Math.random() * NS) | 0;
  }
  // matrice : la ligne i dit ce que l'espèce i ressent pour chaque autre
  function randomMatrix(m) {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) m[i * 7 + j] = i === 6 || j === 6 ? 0.35 : Math.random() * 2 - 1;
  }
  randomMatrix(K);
  Kto.set(K);

  function newEra(custom) {
    era++;
    eraT = 0;
    Kfrom.set(K);
    if (custom) Kto.set(custom);
    else {
      for (let i = 0; i < NS; i++) for (let j = 0; j < NS; j++) {
        const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.7;
        Kto[i * 7 + j] = clamp(Kto[i * 7 + j] + g, -1, 1);
      }
    }
    trans = 0;
    eraName = custom ? 'de la Ronde' : ERA_NAMES[(Math.random() * ERA_NAMES.length) | 0];
    api.label(`Ère ${ROMAN[(era - 1) % ROMAN.length]} ${eraName}`);
    [0, 4, 7, 9].forEach((d, k) => audio.note(d, { type: 'soft', vel: 0.07, dur: 5, at: k * 0.3, send: 0.6, oct: 1 }));
  }

  function resize(w, h) {
    W = w; H = h;
    R = Math.min(W * 0.46, H * 0.42);
    cx = W / 2; cy = H / 2 + (H > W ? 0 : 12);
    dprT = Math.min(engine.dpr, 1.5);
    D = Math.ceil((R * 2 + 24) * dprT);
    trail = makeCanvas(D, D);
    tctx = trail.getContext('2d');
    tctx.fillStyle = '#030c10';
    tctx.fillRect(0, 0, D, D);
  }
  resize(W, H);

  function force(r, a) {
    if (r < BETA) return r / BETA - 1;
    if (r < 1) return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));
    return 0;
  }

  function step(dt) {
    // grille de voisinage (tri par comptage)
    count.fill(0);
    for (let i = 0; i < N; i++) {
      const gx = clamp(((X[i] + 1.05) / CS) | 0, 0, CELLS - 1), gy = clamp(((Y[i] + 1.05) / CS) | 0, 0, CELLS - 1);
      const c = gy * CELLS + gx;
      cellOf[i] = c;
      count[c]++;
    }
    start[0] = 0;
    for (let c = 0; c < CELLS * CELLS; c++) start[c + 1] = start[c] + count[c];
    const fill = start.slice(0, CELLS * CELLS);
    for (let i = 0; i < N; i++) order[fill[cellOf[i]]++] = i;

    const r2max = RMAX * RMAX;
    for (let i = 0; i < N; i++) {
      const xi = X[i], yi = Y[i], row = Sp[i] * 7;
      let fx = 0, fy = 0;
      const c = cellOf[i], gx = c % CELLS, gy = (c / CELLS) | 0;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = gy + oy;
        if (yy < 0 || yy >= CELLS) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = gx + ox;
          if (xx < 0 || xx >= CELLS) continue;
          const cc = yy * CELLS + xx;
          for (let k = start[cc], e = start[cc + 1]; k < e; k++) {
            const j = order[k];
            if (j === i) continue;
            const dx = X[j] - xi, dy = Y[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r2max || d2 < 1e-10) continue;
            const d = Math.sqrt(d2);
            const f = force(d / RMAX, K[row + Sp[j]]);
            fx += (dx / d) * f;
            fy += (dy / d) * f;
          }
        }
      }
      AX[i] = fx * FORCE;
      AY[i] = fy * FORCE;
    }
    // la main : remous, puits de gravité
    if (well) {
      for (let i = 0; i < N; i++) {
        const dx = well.x - X[i], dy = well.y - Y[i], d = Math.hypot(dx, dy) + 1e-4;
        if (d < 0.6) { const k = (1 - d / 0.6) * 2.6; AX[i] += (dx / d) * k - (dy / d) * k * 0.6; AY[i] += (dy / d) * k + (dx / d) * k * 0.6; }
      }
    }
    const fr = Math.pow(0.5, dt / 0.04);
    for (let i = 0; i < N; i++) {
      VX[i] = VX[i] * fr + AX[i] * dt;
      VY[i] = VY[i] * fr + AY[i] * dt;
      X[i] += VX[i] * dt;
      Y[i] += VY[i] * dt;
      const r = Math.hypot(X[i], Y[i]);
      if (r > 0.975) {
        const nx = X[i] / r, ny = Y[i] / r;
        X[i] = nx * 0.975; Y[i] = ny * 0.975;
        const vn = VX[i] * nx + VY[i] * ny;
        if (vn > 0) { VX[i] -= 1.6 * vn * nx; VY[i] -= 1.6 * vn * ny; }
      }
    }
  }

  function update(dt, t) {
    eraT += dt;
    if (eraT > ERA_LEN) newEra();
    if (trans < 1) {
      trans = Math.min(1, trans + dt / 4);
      const k = trans * trans * (3 - 2 * trans);
      for (let i = 0; i < 49; i++) K[i] = lerp(Kfrom[i], Kto[i], k);
    }
    // LUCA : tout redevient un, puis la diversité revient, particule après particule
    if (lucaT >= 0) {
      lucaT += dt;
      for (let i = 0; i < N; i++) if (Sp[i] === 6 && lucaT > Back[i]) Sp[i] = Orig[i];
      if (lucaT > 24) lucaT = -1;
    }
    // remuer
    if (input.down && !well) {
      const px = (input.x - cx) / R, py = (input.y - cy) / R;
      const vx = input.vx / R, vy = input.vy / R;
      const sp = Math.hypot(vx, vy);
      if (sp > 0.05) {
        for (let i = 0; i < N; i++) {
          const d = Math.hypot(X[i] - px, Y[i] - py);
          if (d < 0.22) { const k = (1 - d / 0.22) * 0.5 * dt * 8; VX[i] += vx * k; VY[i] += vy * k; }
        }
      }
    }
    if (well && input.down) { well.x = (input.x - cx) / R; well.y = (input.y - cy) / R; }
    const sdt = Math.min(dt, 1 / 40);
    step(sdt);
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].age += dt; if (ripples[i].age > 1.4) ripples.splice(i, 1); }
  }

  function draw(ctx, t) {
    // la trace : on efface lentement, pour que le mouvement laisse un sillage
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    tctx.fillStyle = 'rgba(3,12,16,0.26)';
    tctx.fillRect(0, 0, D, D);
    tctx.globalCompositeOperation = 'lighter';
    tctx.setTransform(dprT, 0, 0, dprT, 0, 0);
    const o = R + 12, s = 4.2;
    for (let i = 0; i < N; i++) {
      tctx.drawImage(sprites[Sp[i]], o + X[i] * R - s, o + Y[i] * R - s, s * 2, s * 2);
    }

    // le reste du microscope
    ctx.fillStyle = '#010406';
    ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.5);
    halo.addColorStop(0, 'rgba(40,120,140,0.10)');
    halo.addColorStop(1, 'rgba(40,120,140,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.drawImage(trail, cx - R - 12, cy - R - 12, D / dprT, D / dprT);
    // réticule
    ctx.strokeStyle = 'rgba(160,230,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    for (const k of [0.33, 0.66]) { ctx.moveTo(cx + R * k, cy); ctx.arc(cx, cy, R * k, 0, TAU); }
    ctx.stroke();
    for (const r of ripples) {
      const k = r.age / 1.4;
      ctx.strokeStyle = rgba(r.c, 0.5 * (1 - k));
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, 8 + k * 70, 0, TAU); ctx.stroke();
    }
    if (well && input.down) {
      const wx = cx + well.x * R, wy = cy + well.y * R;
      ctx.strokeStyle = 'rgba(200,240,255,0.25)';
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(wx, wy, 26 + Math.sin(t * 4) * 3, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // bord de la boîte de Petri, avec un reflet
    ctx.strokeStyle = 'rgba(180,240,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(180,240,255,0.08)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI * 1.08, Math.PI * 1.38); ctx.stroke();

    // inscriptions
    ctx.font = '400 9.5px "DM Mono", ui-monospace, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(180,240,255,0.5)';
    ctx.fillText('ÉCHANTILLON N° 1', cx, cy - R - 12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const bx = cx + R * 0.42, by = cy + R * 0.78;
    ctx.fillStyle = 'rgba(180,240,255,0.45)';
    ctx.fillRect(bx, by, R * 0.18, 1.5);
    ctx.fillText('50 µm', bx + R * 0.18 + 8, by);
    // ère courante, et la matrice des attirances en miniature
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(180,240,255,0.35)';
    const ex = W - 18, ey = H - 18;
    ctx.fillText(`ÈRE ${ROMAN[Math.max(0, era - 1) % ROMAN.length]}`, ex, ey - 76);
    const cell = 9;
    for (let i = 0; i < NS; i++) for (let j = 0; j < NS; j++) {
      const v = K[i * 7 + j];
      ctx.fillStyle = v > 0 ? `rgba(120,255,200,${Math.abs(v) * 0.6})` : `rgba(255,90,140,${Math.abs(v) * 0.6})`;
      ctx.fillRect(ex - (NS - j) * cell, ey - 60 + i * cell, cell - 1, cell - 1);
    }
    for (let i = 0; i < NS; i++) {
      ctx.fillStyle = rgba(COLORS[i], 0.8);
      ctx.fillRect(ex - (NS + 1) * cell, ey - 60 + i * cell + 2, 4, 4);
      ctx.fillRect(ex - (NS - i) * cell + 2, ey - 68, 4, 4);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ——— Gestes
  function tap(p) {
    const t = engine.t;
    // l'étiquette de l'échantillon : trois touches, et l'ancêtre commun apparaît
    if (Math.abs(p.x - cx) < 110 && p.y < cy - R + 4 && p.y > cy - R - 34) {
      labelTaps = labelTaps.filter(x => t - x < 3);
      labelTaps.push(t);
      audio.note(labelTaps.length * 2, { type: 'glass', vel: 0.1, dur: 2 });
      if (labelTaps.length >= 3) { labelTaps = []; luca(); }
      return;
    }
    const px = (p.x - cx) / R, py = (p.y - cy) / R;
    if (Math.hypot(px, py) > 1) return;
    const s = drops % NS;
    drops++;
    for (let k = 0; k < 36; k++) {
      const i = (Math.random() * N) | 0;
      const a = Math.random() * TAU, r = Math.random() * 0.045;
      X[i] = px + Math.cos(a) * r; Y[i] = py + Math.sin(a) * r;
      VX[i] = VY[i] = 0;
      Sp[i] = Orig[i] = s;
    }
    ripples.push({ x: p.x, y: p.y, c: COLORS[s], age: 0 });
    audio.note(s * 2, { type: 'drop', vel: 0.2, dur: 0.6, pan: px * 0.8 });
    audio.note(s * 2 + 4, { type: 'bell', vel: 0.05, dur: 2, at: 0.05 });
    // six couleurs versées d'affilée : la ronde
    dropLog = dropLog.filter(d => t - d.t < 20);
    dropLog.push({ t, s });
    if (!rainbow && new Set(dropLog.map(d => d.s)).size === NS) {
      rainbow = true;
      const m = new Float32Array(49);
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) m[i * 7 + j] = i === 6 || j === 6 ? 0.35 : j === i ? 0.4 : j === (i + 1) % NS ? 0.85 : j === (i + NS - 1) % NS ? -0.35 : -0.08;
      newEra(m);
      secrets.find('arcenciel');
    }
  }

  function luca() {
    lucaT = 0;
    for (let i = 0; i < N; i++) { Sp[i] = 6; Back[i] = 5 + Math.random() * 16; }
    secrets.find('luca');
    [0, 7, 12].forEach((d, k) => audio.note(d, { type: 'soft', vel: 0.12, dur: 6, at: k * 0.4, send: 0.7 }));
  }

  function longpress(p) {
    const px = (p.x - cx) / R, py = (p.y - cy) / R;
    if (Math.hypot(px, py) > 1) return;
    well = { x: px, y: py };
    audio.note(-3, { type: 'soft', vel: 0.12, dur: 2.5, oct: -1 });
  }
  function up() { well = null; }

  newEra();
  // l'ère I commence avec un peu d'avance : les premières formes sont déjà là
  for (let k = 0; k < 80; k++) step(1 / 40);

  return { resize, update, draw, tap, longpress, up, words: { luca }, destroy() {} };
}
