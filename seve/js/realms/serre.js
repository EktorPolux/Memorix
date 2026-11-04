// Sève — La Serre aux Lianes : des lianes qui cherchent ta lumière, et quatre saisons qui passent sur elles.
import { TAU, clamp, lerp, smoothstep, angleDiff, glow, drawGlow, hexToRgb, rgba, mixRgb, hslToRgb, makeCanvas, makeNoise, easeOutBack } from '../engine.js';

export const mood = {
  root: 174.61, scale: 'lydian', wave: 'triangle', chord: [0, 7, 11, 16], pad: 0.042, cutoff: 1100, lfo: 0.04,
  noise: { type: 'highpass', freq: 2600, q: 0.3, gain: 0.006, gust: 0.6, gustRate: 0.07 },
};

const SEASONS = [
  { name: 'printemps', len: 34, grow: 1, top: '#0e2b2a', bot: '#04110d', stem: '#4f9a5a', light: [255, 238, 196] },
  { name: 'été', len: 32, grow: 0.7, top: '#16301d', bot: '#050f08', stem: '#3f7d3e', light: [255, 214, 150] },
  { name: 'automne', len: 28, grow: 0.22, top: '#2c1b14', bot: '#0d0805', stem: '#7a5a33', light: [255, 178, 118] },
  { name: 'hiver', len: 20, grow: 0.03, top: '#16233a', bot: '#060a12', stem: '#5b6573', light: [205, 228, 255] },
].map(s => ({ ...s, topC: hexToRgb(s.top), botC: hexToRgb(s.bot), stemC: hexToRgb(s.stem) }));
const YEAR = SEASONS.reduce((s, x) => s + x.len, 0);
const SEG = 5; // longueur d'un segment de liane, en pixels
const GOLDEN = 137.508 * Math.PI / 180;
// L'hérédité : chaque liane porte un petit génome (couleur et forme de ses fleurs, taille des feuilles, vigueur,
// couleur des fruits). Ses graines en héritent, avec de petites mutations : la serre dérive de génération en génération.
const FTYPES = ['rosace', 'cloche', 'anemone', 'etoile'];
function randomGenome() {
  return { hue: Math.random() * 360, sat: 64 + Math.random() * 26, lig: 60 + Math.random() * 14, ftype: FTYPES[(Math.random() * 3) | 0], k: [3, 4, 5, 6, 7][(Math.random() * 5) | 0], leaf: 0.8 + Math.random() * 0.4, speed: 0.9 + Math.random() * 0.25, fruit: Math.random() * 360, gen: 1 };
}
function mutate(g) {
  const m = { ...g, gen: g.gen + 1 };
  m.hue = (g.hue + (Math.random() - 0.5) * 50 + 360) % 360;
  m.sat = clamp(g.sat + (Math.random() - 0.5) * 16, 40, 98);
  m.lig = clamp(g.lig + (Math.random() - 0.5) * 10, 48, 82);
  if (Math.random() < 0.3) m.k = clamp(g.k + (Math.random() < 0.5 ? -1 : 1), 3, 9);
  m.leaf = clamp(g.leaf + (Math.random() - 0.5) * 0.22, 0.6, 1.6);
  m.speed = clamp(g.speed + (Math.random() - 0.5) * 0.12, 0.75, 1.35);
  if (Math.random() < 0.14) m.ftype = FTYPES[(Math.random() * FTYPES.length) | 0]; // parfois, une forme nouvelle apparaît
  m.fruit = (g.fruit + (Math.random() - 0.5) * 40 + 360) % 360;
  return m;
}

export function create(api) {
  const { audio, secrets, input, engine } = api;
  const noise = makeNoise(31);
  const q = engine.quality;
  const LIMIT = Math.round(5200 * q);
  let W = api.W, H = api.H, groundY = 0;
  let frame = null;
  let clock = 3; // secondes depuis le début de l'année
  let lastSeason = -1, sawWinter = false;
  const vines = [], falling = [], flowers = [], croziers = [], snow = [], motes = [], bursts = [];
  const fruits = [], seeds = []; // fruits suspendus ou tombés, graines qui attendent le printemps
  let renewT = 2, maxGen = 1;
  let sunflower = null;
  const light = { x: 0, y: 0, power: 1, hold: 0, holdX: 0, holdY: 0 };
  let totalPts = 0, lastPluck = 0, lastBurst = -9;

  // ——— Saisons
  function seasonAt(c) {
    let x = ((c % YEAR) + YEAR) % YEAR;
    for (let i = 0; i < SEASONS.length; i++) {
      if (x < SEASONS[i].len) return { i, p: x / SEASONS[i].len, s: SEASONS[i], n: SEASONS[(i + 1) % 4] };
      x -= SEASONS[i].len;
    }
    return { i: 0, p: 0, s: SEASONS[0], n: SEASONS[1] };
  }
  // mélange doux avec la saison suivante dans les derniers instants
  function blend(key, se) {
    const k = smoothstep(0.78, 1, se.p);
    const a = se.s[key], b = se.n[key];
    return Array.isArray(a) ? mixRgb(a, b, k) : lerp(a, b, k);
  }

  // ——— La serre : armature de fer et vitres, dessinée une fois
  function buildFrame() {
    frame = makeCanvas(W, H);
    const g = frame.getContext('2d');
    const cols = Math.max(4, Math.round(W / 190));
    g.strokeStyle = 'rgba(190,225,210,0.07)';
    g.lineWidth = 2;
    const archTop = H * 0.06, springY = H * 0.3;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * W;
      const yTop = archTop + (springY - archTop) * Math.pow(Math.abs(i / cols - 0.5) * 2, 2);
      g.beginPath(); g.moveTo(x, groundY); g.lineTo(x, yTop); g.stroke();
    }
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80, x = u * W;
      const y = archTop + (springY - archTop) * Math.pow(Math.abs(u - 0.5) * 2, 2);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(190,225,210,0.045)';
    for (let y = springY + 40; y < groundY; y += 70) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // reflets sur le verre
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < cols; i++) {
      const x = (i / cols) * W + 18;
      const grd = g.createLinearGradient(x, 0, x + 60, H * 0.6);
      grd.addColorStop(0, 'rgba(200,240,230,0.035)');
      grd.addColorStop(1, 'rgba(200,240,230,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x, H * 0.12); g.lineTo(x + 26, H * 0.12); g.lineTo(x + 80, H * 0.75); g.lineTo(x + 54, H * 0.75); g.fill();
    }
  }

  function resize(w, h) {
    W = w; H = h;
    groundY = H - Math.max(26, H * 0.055);
    buildFrame();
    if (!motes.length) for (let i = 0; i < Math.round(70 * q); i++) motes.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, ph: Math.random() * TAU });
  }
  resize(W, H);
  light.x = W * 0.55; light.y = H * 0.35;

  // ——— Lianes
  function spawnVine(x, y, dir, o = {}) {
    if (vines.length > 170 * q) return null;
    const v = {
      pts: [{ x, y, born: clock }], tip: { x, y }, dir, acc: 0, len: 0,
      maxLen: o.maxLen ?? lerp(H * 0.45, H * 1.1, Math.random()),
      genome: o.genome || randomGenome(),
      speed: (o.speed ?? 26 + Math.random() * 16) * (o.genome ? o.genome.speed : 1), turn: o.turn ?? 1.1 + Math.random() * 0.8,
      kind: o.kind || 'liane', depth: o.depth || 0, curl: o.curl ?? (Math.random() < 0.5 ? -1 : 1),
      wmax: o.wmax ?? (o.depth ? Math.max(1.4, 4.2 - o.depth * 1.1) : 4.6), seed: Math.random() * 100,
      alive: true, leaves: [], side: 1, fade: 1, dying: false, hue: Math.random(),
    };
    maxGen = Math.max(maxGen, v.genome.gen);
    vines.push(v);
    return v;
  }
  function seedAt(x, y, burstIt = true) {
    const dir = Math.atan2(light.y - y, light.x - x);
    spawnVine(x, y, dir + (Math.random() - 0.5) * 0.6, { maxLen: lerp(H * 0.5, H * 1.05, Math.random()) });
    if (burstIt) burst(x, y, [190, 255, 170], 16, 90);
  }

  function addLeaf(v, i) {
    v.side = -v.side;
    v.leaves.push({ i, side: v.side, size: (7 + Math.random() * 9) * v.genome.leaf, born: clock, state: 'on', hueJ: Math.random(), turnAt: 0, fallAt: 0 });
  }

  function bloom(x, y, opts = {}) {
    if (flowers.length > 130 * q) flowers.shift();
    const g = opts.genome || randomGenome();
    flowers.push({ x, y, type: g.ftype, k: g.k, size: (opts.size || 1) * (9 + Math.random() * 10), born: clock, c: hslToRgb(g.hue + (Math.random() - 0.5) * 14, g.sat, g.lig), rot: Math.random() * TAU, ph: Math.random() * TAU, dying: 0, g, fruited: false });
    if (clock - lastPluck > 0.15) { lastPluck = clock; audio.note(4 + ((Math.random() * 8) | 0), { type: 'bell', vel: 0.07, dur: 2.2, send: 0.5, pan: (x / W) * 2 - 1 }); }
  }

  function growVines(dt, se) {
    const grow = blend('grow', se) * (1 + light.hold * 2.5);
    if (grow <= 0.02) return;
    for (const v of vines) {
      if (!v.alive) continue;
      const tip = v.tip;
      if (v.kind === 'vrille') {
        v.dir += v.curl * dt * (2.2 + (v.len / v.maxLen) * 5) * grow;
      } else {
        const toL = Math.atan2(light.y - tip.y, light.x - tip.x);
        const wander = noise.n3(tip.x * 0.005, tip.y * 0.005, clock * 0.12 + v.seed) * 1.5;
        v.dir += clamp(angleDiff(toL + wander, v.dir), -1, 1) * dt * v.turn * (0.6 + grow * 0.4);
      }
      const step = v.speed * grow * dt;
      tip.x += Math.cos(v.dir) * step;
      tip.y += Math.sin(v.dir) * step;
      v.acc += step;
      if (v.acc >= SEG) {
        v.acc = 0;
        v.pts.push({ x: tip.x, y: tip.y, born: clock });
        v.len += SEG;
        totalPts++;
        const n = v.pts.length;
        if (v.kind === 'liane') {
          if (n % 4 === 0) addLeaf(v, n - 1);
          if (Math.random() < (v.depth < 2 ? 0.02 : 0.008) && totalPts < LIMIT) {
            spawnVine(tip.x, tip.y, v.dir + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), { depth: v.depth + 1, maxLen: (v.maxLen - v.len) * 0.75 + 40, genome: v.genome });
          }
          if (Math.random() < 0.028 && totalPts < LIMIT) {
            spawnVine(tip.x, tip.y, v.dir + (Math.random() < 0.5 ? -1.2 : 1.2), { kind: 'vrille', maxLen: 30 + Math.random() * 70, speed: 30, wmax: 1, depth: v.depth + 1, genome: v.genome });
          }
        }
      }
      // la lumière atteinte : floraison extravagante
      const reached = v.kind === 'liane' && input.inside && Math.hypot(tip.x - light.x, tip.y - light.y) < 24;
      const out = tip.x < -30 || tip.x > W + 30 || tip.y < -30 || tip.y > groundY + 4;
      if (v.len >= v.maxLen || out || reached || totalPts > LIMIT) {
        v.alive = false;
        if (v.kind === 'liane' && !out) {
          if (reached && clock - lastBurst > 1.5) {
            lastBurst = clock;
            const n = v.pts.length;
            for (let j = 0; j < 5; j++) { const p = v.pts[Math.max(0, n - 1 - j * 3)]; bloom(p.x, p.y, { size: 1.2, genome: v.genome }); }
            burst(tip.x, tip.y, [255, 230, 160], 26, 150);
            for (let j = 0; j < 2; j++) spawnVine(tip.x, tip.y, v.dir + (j ? 1.4 : -1.4), { kind: 'vrille', maxLen: 50 + Math.random() * 60, speed: 32, wmax: 1, depth: v.depth + 1, genome: v.genome });
          } else if (Math.random() < 0.75 && se.i < 2) bloom(tip.x, tip.y, { genome: v.genome });
        }
      }
    }
  }

  // ——— Évolution
  let label = '';
  function update(dt, t) {
    clock += dt;
    const se = seasonAt(clock);
    if (se.i !== lastSeason) onSeason(se, lastSeason);
    const lab = se.s.name + (maxGen > 1 ? ` · génération ${maxGen}` : '');
    if (lab !== label) { label = lab; api.label(label); }

    // la lumière : ta main, ou un feu follet qui erre quand tu n'es pas là
    let tx, ty;
    if (input.inside || input.down) { tx = input.x; ty = input.y; light.seen = t; }
    else if (t - (light.seen ?? -99) < 7) { tx = light.x; ty = light.y; } // au doigt, la lumière reste où tu l'as posée
    else { tx = W * (0.5 + 0.32 * Math.sin(t * 0.071)); ty = H * (0.32 + 0.12 * Math.sin(t * 0.113 + 1)); }
    light.x += (tx - light.x) * Math.min(1, dt * 7);
    light.y += (ty - light.y) * Math.min(1, dt * 7);
    const holding = input.down && input.pointers.size === 1;
    light.hold = clamp(light.hold + (holding ? dt * 1.5 : -dt * 2.5), 0, 1);
    // la spirale d'or : garder la lumière immobile, longtemps
    if (holding && Math.hypot(input.x - light.holdX, input.y - light.holdY) < 20) {
      light.holdT = (light.holdT || 0) + dt;
      if (light.holdT > 4 && !sunflower) makeSunflower(input.x, input.y);
    } else { light.holdT = 0; light.holdX = input.x; light.holdY = input.y; }

    growVines(dt, se);
    renew(dt, se);
    fruitCycle(dt, se, t);

    // feuilles : en automne elles rougissent puis tombent ; au printemps elles reviennent
    if (se.i === 2) {
      for (const v of vines) for (const l of v.leaves) {
        if (l.state === 'on' && clock > l.fallAt) {
          l.state = 'gone';
          const p = leafPos(v, l, t);
          if (falling.length < 420) falling.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20, rot: p.a, vr: (Math.random() - 0.5) * 3, size: l.size * 0.9, c: leafColor(l, se), ph: Math.random() * TAU });
        }
      }
    }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy = Math.min(f.vy + 18 * dt, 46);
      f.x += (f.vx + Math.sin(t * 2.2 + f.ph) * 24) * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      if (f.y > groundY + 6) falling.splice(i, 1);
    }
    if (se.i === 3 && snow.length < 220 * q && Math.random() < dt * 40) snow.push({ x: Math.random() * W, y: -5, r: 0.8 + Math.random() * 1.8, vy: 18 + Math.random() * 26, ph: Math.random() * TAU });
    for (let i = snow.length - 1; i >= 0; i--) {
      const s = snow[i];
      s.y += s.vy * dt;
      s.x += Math.sin(t * 0.9 + s.ph) * 12 * dt;
      if (s.y > groundY + 2) snow.splice(i, 1);
    }
    // en été, des bourgeons éclosent le long des tiges
    if ((se.i === 1 || (se.i === 0 && se.p > 0.5)) && Math.random() < dt * 0.9) {
      const v = vines[(Math.random() * vines.length) | 0];
      if (v && v.kind === 'liane' && v.pts.length > 8) { const p = v.pts[(Math.random() * v.pts.length) | 0]; bloom(p.x, p.y, { size: 0.7, genome: v.genome }); }
    }
    // des crosses de fougère sortent du sol au printemps
    if (se.i === 0 && croziers.length < 7 && Math.random() < dt * 0.12) {
      croziers.push({ x: 30 + Math.random() * (W - 60), born: clock, L: 60 + Math.random() * 90, side: Math.random() < 0.5 ? -1 : 1, lean: (Math.random() - 0.5) * 0.4, found: false });
    }
    for (let i = croziers.length - 1; i >= 0; i--) if (clock - croziers[i].born > 46) croziers.splice(i, 1);
    for (const f of flowers) if (f.dying) f.dying += dt;
    for (let i = flowers.length - 1; i >= 0; i--) if (flowers[i].dying > 3) flowers.splice(i, 1);
    for (const v of vines) if (v.dying) v.fade -= dt * 0.12;
    for (let i = vines.length - 1; i >= 0; i--) if (vines[i].fade <= 0) { totalPts -= vines[i].pts.length; vines.splice(i, 1); }

    // poussières de pollen qui tournent autour de la lumière
    for (const m of motes) {
      const dx = light.x - m.x, dy = light.y - m.y, d = Math.hypot(dx, dy) + 1;
      const pull = d < 260 ? 26 : 4;
      m.vx += ((dx / d) * pull - (dy / d) * 18 + noise.n2(m.y * 0.01, t * 0.2 + m.ph) * 20) * dt;
      m.vy += ((dy / d) * pull + (dx / d) * 18 + noise.n2(m.x * 0.01 + 7, t * 0.2 + m.ph) * 20) * dt;
      m.vx *= Math.pow(0.4, dt); m.vy *= Math.pow(0.4, dt);
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < -20 || m.x > W + 20 || m.y < -20 || m.y > H + 20) { m.x = Math.random() * W; m.y = Math.random() * groundY; }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= Math.pow(0.3, dt); b.vy *= Math.pow(0.3, dt); b.vy += 12 * dt;
      if (b.age > b.life) bursts.splice(i, 1);
    }
    if (sunflower) sunflower.age += dt;
  }

  // ——— La serre ne s'arrête jamais : une liane finie se réveille, ou bourgeonne ; les plus vieilles cèdent la place
  function renew(dt, se) {
    const grow = blend('grow', se);
    renewT -= dt * (0.4 + grow);
    if (renewT > 0 || grow < 0.15) return;
    renewT = 1.4 + Math.random() * 2.2;
    if (totalPts > LIMIT * 0.8) {
      let old = null;
      for (const v of vines) if (!v.alive && !v.dying && v.kind === 'liane' && (!old || v.pts[0].born < old.pts[0].born)) old = v;
      if (old) old.dying = true;
      return;
    }
    const cands = vines.filter(v => !v.alive && !v.dying && v.kind === 'liane' && v.pts.length > 6);
    const v = cands[(Math.random() * cands.length) | 0];
    if (!v) return;
    const inside = v.tip.x > 10 && v.tip.x < W - 10 && v.tip.y > 10 && v.tip.y < groundY - 10;
    if (inside && Math.random() < 0.55) { v.alive = true; v.maxLen = v.len + 60 + Math.random() * 140; }
    else {
      const p = v.pts[(Math.random() * v.pts.length) | 0];
      spawnVine(p.x, p.y, -Math.PI / 2 + (Math.random() - 0.5) * 1.6, { depth: v.depth + 1, maxLen: 80 + Math.random() * 180, genome: v.genome });
    }
  }
  // ——— Fleurs → fruits → graines : en été les fleurs nouent, en automne les fruits mûrs tombent et se plantent
  function fruitCycle(dt, se, t) {
    if (se.i === 1 || (se.i === 0 && se.p > 0.6)) {
      for (const f of flowers) {
        if (f.fruited || f.dying || !f.g || clock - f.born < 9 || fruits.length > 70 * q) continue;
        if (Math.random() < dt * 0.07) {
          f.fruited = true; f.dying = 0.01;
          const n = 1 + ((Math.random() * 3) | 0);
          for (let i = 0; i < n; i++) fruits.push({ x: f.x + (i - (n - 1) / 2) * 6, y: f.y + 4 + (i % 2) * 4, born: clock, g: f.g, state: 'hang', vx: 0, vy: 0, r: 3 + Math.random() * 1.6, dropAt: 0 });
        }
      }
    }
    if (se.i >= 2) for (const fr of fruits) if (fr.state === 'hang' && !fr.dropAt) fr.dropAt = clock + Math.random() * (se.i === 2 ? SEASONS[2].len * 0.8 : 3);
    for (let i = fruits.length - 1; i >= 0; i--) {
      const fr = fruits[i];
      if (fr.state === 'hang') {
        if (fr.dropAt && clock > fr.dropAt) { fr.state = 'fall'; fr.vx = (Math.random() - 0.5) * 30; fr.vy = -10; }
        continue;
      }
      fr.vy += 220 * dt;
      fr.x += fr.vx * dt; fr.y += fr.vy * dt;
      if (fr.y > groundY - fr.r) {
        fr.y = groundY - fr.r;
        if (Math.abs(fr.vy) > 40) { fr.vy *= -0.35; fr.vx *= 0.7; audio.play(audio.freq(2 + ((fr.g.fruit / 60) | 0), 1), { type: 'drop', vel: 0.03, dur: 0.4, pan: (fr.x / W) * 2 - 1 }); }
        else {
          // le fruit s'enfonce : c'est une graine, qui portera un génome un peu différent
          if (seeds.length >= 14) seeds.shift();
          seeds.push({ x: clamp(fr.x, 20, W - 20), g: mutate(fr.g), ph: Math.random() * TAU });
          fruits.splice(i, 1);
        }
      }
    }
  }

  function onSeason(se, prev) {
    lastSeason = se.i;
    const chord = [[0, 2, 4], [1, 4, 6], [2, 5, 7], [-1, 2, 4]][se.i];
    chord.forEach((d, k) => audio.note(d, { type: 'soft', vel: 0.08, dur: 4.5, at: k * 0.25, send: 0.6 }));
    if (se.i === 2) {
      // l'automne : chaque feuille a son heure pour rougir et pour tomber
      const autumn = SEASONS[2].len;
      for (const v of vines) for (const l of v.leaves) { l.turnAt = clock + Math.random() * autumn * 0.45; l.fallAt = clock + autumn * (0.35 + Math.random() * 0.6); }
      for (const f of flowers) f.dying = f.dying || 0.01;
    }
    if (se.i === 3) {
      sawWinter = true;
      // les plus vieilles lianes s'endorment pour de bon
      const old = vines.filter(v => !v.alive).sort((a, b) => a.pts[0].born - b.pts[0].born);
      const excess = Math.max(0, totalPts - LIMIT * 0.55);
      let removed = 0;
      for (const v of old) { if (removed >= excess) break; v.dying = true; removed += v.pts.length; }
      if (sunflower) sunflower.leaving = clock;
    }
    if (se.i === 0 && prev !== -1) {
      for (const v of vines) for (const l of v.leaves) if (l.state === 'gone' && !v.dying) { l.state = 'on'; l.born = clock + Math.random() * 6; }
      const sown = seeds.splice(0, 7);
      for (const sd of sown) spawnVine(sd.x, groundY, -Math.PI / 2 + (Math.random() - 0.5) * 0.5, { genome: sd.g, maxLen: lerp(H * 0.45, H * 0.95, Math.random()) });
      if (sown.some(sd => sd.g.gen >= 4)) secrets.find('lignee');
      for (let k = sown.length; k < 3; k++) seedAt(40 + Math.random() * (W - 80), groundY, false);
      const living = vines.filter(v => !v.dying && v.kind === 'liane' && v.pts.length > 10);
      for (let k = 0; k < Math.min(5, living.length); k++) {
        const v = living[(Math.random() * living.length) | 0];
        const p = v.pts[(Math.random() * v.pts.length) | 0];
        spawnVine(p.x, p.y, -Math.PI / 2 + (Math.random() - 0.5), { depth: v.depth + 1 });
      }
      if (sawWinter) secrets.find('dormeur');
    }
  }

  // ——— Géométrie des tiges et des feuilles
  function sway(v, i, t) {
    const n = v.pts.length;
    const k = i / Math.max(1, n - 1);
    return Math.sin(t * 1.1 + i * 0.09 + v.seed) * 2.2 * k * k;
  }
  function leafPos(v, l, t) {
    const i = Math.min(l.i, v.pts.length - 1);
    const p = v.pts[i], p0 = v.pts[Math.max(0, i - 1)];
    const a = Math.atan2(p.y - p0.y, p.x - p0.x) + l.side * (1.0 + 0.25 * Math.sin(t * 1.4 + i)) ;
    return { x: p.x + sway(v, i, t), y: p.y, a };
  }
  function leafColor(l, se) {
    if (se.i === 2 && clock > l.turnAt) {
      const k = clamp((clock - l.turnAt) / 6, 0, 1);
      return hslToRgb(lerp(110, 10 + l.hueJ * 40, k), lerp(55, 85, k), lerp(42, 52, k));
    }
    const base = se.i === 1 ? 128 : se.i === 2 ? 110 : 112;
    return hslToRgb(base + (l.hueJ - 0.5) * 22, se.i === 1 ? 50 : 58, se.i === 1 ? 34 + l.hueJ * 8 : 40 + l.hueJ * 10);
  }

  function drawVine(ctx, v, t, stemC) {
    const n = v.pts.length;
    if (n < 2) return;
    const alpha = clamp(v.fade, 0, 1);
    if (v.kind === 'vrille') {
      ctx.strokeStyle = rgba(mixRgb(stemC, [200, 255, 190], 0.15), 0.85 * alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const p = v.pts[i]; const x = p.x + sway(v, i, t); if (i) ctx.lineTo(x, p.y); else ctx.moveTo(x, p.y); }
      ctx.lineTo(v.tip.x + sway(v, n, t), v.tip.y);
      ctx.stroke();
      return;
    }
    // un ruban qui s'affine vers la pointe et s'épaissit avec l'âge
    const L = [], Rr = [];
    const age = clamp((clock - v.pts[0].born) / 40, 0.35, 1);
    for (let i = 0; i < n; i++) {
      const p = v.pts[i], a = v.pts[Math.max(0, i - 1)], b = v.pts[Math.min(n - 1, i + 1)];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      const w = v.wmax * age * (0.28 + 0.72 * Math.pow(1 - i / n, 0.8)) * 0.5;
      const x = p.x + sway(v, i, t);
      L.push(x + nx * w, p.y + ny * w);
      Rr.push(x - nx * w, p.y - ny * w);
    }
    const wood = clamp((clock - v.pts[0].born - 60) / 220, 0, 0.6);
    ctx.fillStyle = rgba(wood > 0 ? mixRgb(stemC, [92, 72, 52], wood) : stemC, alpha);
    ctx.beginPath();
    ctx.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
    ctx.lineTo(v.tip.x + sway(v, n, t), v.tip.y);
    for (let i = Rr.length - 2; i >= 0; i -= 2) ctx.lineTo(Rr[i], Rr[i + 1]);
    ctx.fill();
  }

  function drawLeaves(ctx, t, se) {
    // regroupées par teinte pour tracer vite
    const groups = new Map();
    for (const v of vines) {
      const alpha = clamp(v.fade, 0, 1);
      if (alpha <= 0) continue;
      for (const l of v.leaves) {
        if (l.state !== 'on' || l.i >= v.pts.length) continue;
        const g = clamp((clock - l.born) / 1.6, 0, 1);
        if (g <= 0) continue;
        const c = leafColor(l, se);
        const key = c.map(x => Math.round(x / 12) * 12).join(',');
        let arr = groups.get(key);
        if (!arr) groups.set(key, (arr = []));
        arr.push([v, l, easeOutBack(g)]);
      }
    }
    for (const [key, arr] of groups) {
      ctx.fillStyle = `rgba(${key},0.92)`;
      ctx.beginPath();
      for (const [v, l, g] of arr) {
        const p = leafPos(v, l, t);
        leafPath(ctx, p.x, p.y, p.a, l.size * g);
      }
      ctx.fill();
    }
  }
  function leafPath(ctx, x, y, a, s) {
    const c = Math.cos(a), si = Math.sin(a);
    const tx = x + c * s, ty = y + si * s;
    const ox = -si * s * 0.42, oy = c * s * 0.42;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + c * s * 0.5 + ox, y + si * s * 0.5 + oy, tx, ty);
    ctx.quadraticCurveTo(x + c * s * 0.5 - ox, y + si * s * 0.5 - oy, x, y);
  }

  function drawFlower(ctx, f, t) {
    const g = easeOutBack(clamp((clock - f.born) / 2.2, 0, 1)) * (1 - clamp(f.dying / 3, 0, 1));
    if (g <= 0.02) return;
    const s = f.size * g, rot = f.rot + Math.sin(t * 0.6 + f.ph) * 0.15;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow(f.c.map(Math.round), 32), f.x, f.y, s * 2, 0.17);
    ctx.globalCompositeOperation = 'source-over';
    if (f.type === 'rosace') {
      // rose de Grandi : r = cos(kθ)
      ctx.fillStyle = rgba(f.c, 0.92);
      ctx.beginPath();
      const steps = 90;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * TAU * (f.k % 2 ? 1 : 1);
        const r = s * (0.25 + 0.75 * Math.abs(Math.cos((f.k * a) / 2)));
        const x = f.x + Math.cos(a + rot) * r, y = f.y + Math.sin(a + rot) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,170,0.95)';
      ctx.beginPath(); ctx.arc(f.x, f.y, s * 0.2, 0, TAU); ctx.fill();
    } else if (f.type === 'cloche') {
      ctx.fillStyle = rgba(f.c, 0.9);
      const bx = f.x + Math.sin(t * 1.2 + f.ph) * 2, by = f.y + s * 0.4;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.bezierCurveTo(bx + s * 0.9, by - s * 0.2, bx + s * 0.8, by + s * 0.9, bx + s * 0.55, by + s * 1.05);
      ctx.lineTo(bx - s * 0.55, by + s * 1.05);
      ctx.bezierCurveTo(bx - s * 0.8, by + s * 0.9, bx - s * 0.9, by - s * 0.2, f.x, f.y);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(bx, by + s); ctx.lineTo(bx, by + s * 1.6); ctx.stroke();
    } else if (f.type === 'etoile') {
      // l'étoile : n'apparaît que par mutation
      const n = f.k * 2;
      ctx.fillStyle = rgba(f.c, 0.92);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = rot + (i / n) * TAU, r = i % 2 ? s * 0.36 : s * 1.12;
        const x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.fill();
      ctx.fillStyle = rgba(mixRgb(f.c, [255, 255, 255], 0.6), 0.95);
      ctx.beginPath(); ctx.arc(f.x, f.y, s * 0.22, 0, TAU); ctx.fill();
    } else {
      // anémone extravagante : des filaments qui ondulent, terminés par des perles de lumière
      const nF = 16;
      ctx.strokeStyle = rgba(f.c, 0.75);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const tips = [];
      for (let i = 0; i < nF; i++) {
        const a = rot + (i / nF) * TAU;
        const wob = Math.sin(t * 1.5 + i + f.ph) * 0.35;
        const mx = f.x + Math.cos(a + wob) * s * 0.6, my = f.y + Math.sin(a + wob) * s * 0.6;
        const ex = f.x + Math.cos(a + wob * 1.6) * s * 1.25, ey = f.y + Math.sin(a + wob * 1.6) * s * 1.25;
        ctx.moveTo(f.x, f.y);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        tips.push(ex, ey);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const sp = glow(f.c.map(Math.round), 12);
      for (let i = 0; i < tips.length; i += 2) drawGlow(ctx, sp, tips[i], tips[i + 1], 4, 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  // Fruits : verts d'abord, puis de la couleur que dit leur génome ; graines : de petites perles dans le sol
  function drawFruits(ctx, t) {
    for (const fr of fruits) {
      const ripe = clamp((clock - fr.born) / 18, 0, 1);
      const c = mixRgb([110, 168, 70], hslToRgb(fr.g.fruit, 62, 46), ripe);
      const sw = fr.state === 'hang' ? Math.sin(t * 1.3 + fr.x * 0.05) * 1.2 : 0;
      if (fr.state === 'hang') {
        ctx.strokeStyle = 'rgba(90,120,70,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(fr.x, fr.y - fr.r - 5); ctx.lineTo(fr.x + sw, fr.y - fr.r); ctx.stroke();
      }
      ctx.fillStyle = rgba(c, 0.96);
      ctx.beginPath(); ctx.arc(fr.x + sw, fr.y, fr.r * (0.7 + 0.3 * ripe), 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(fr.x + sw - fr.r * 0.3, fr.y - fr.r * 0.35, fr.r * 0.25, 0, TAU); ctx.fill();
    }
    for (const sd of seeds) {
      const c = hslToRgb(sd.g.fruit, 40, 30);
      ctx.fillStyle = rgba(c, 0.9);
      ctx.beginPath(); ctx.ellipse(sd.x, groundY + 3, 3.2, 2, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow(hslToRgb(sd.g.hue, 80, 65).map(Math.round), 12), sd.x, groundY + 2, 5, 0.18 + 0.12 * Math.sin(t * 1.4 + sd.ph));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // Crosse de fougère : une clothoïde dont la courbure décroît pendant qu'elle se déroule
  function crozierShape(c) {
    const age = clock - c.born;
    const grow = smoothstep(0, 6, age);
    const unroll = smoothstep(4, 26, age);
    const L = c.L * (0.35 + 0.65 * grow);
    const N = 70, ds = L / N;
    const kmax = (2.6 * TAU) / L * (1 - unroll * 0.94);
    let x = c.x, y = groundY + 2, a = -Math.PI / 2 + c.lean;
    const pts = [[x, y, a]];
    for (let i = 1; i <= N; i++) {
      const s = i / N;
      a += c.side * kmax * Math.pow(s, 2.2) * ds * 2.4;
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
      pts.push([x, y, a]);
    }
    return { pts, unroll, grow };
  }
  function drawCrozier(ctx, c, t, se) {
    const { pts, unroll } = crozierShape(c);
    const fade = 1 - smoothstep(38, 46, clock - c.born);
    const col = se.i === 2 ? [150, 110, 60] : [90, 160, 90];
    ctx.strokeStyle = rgba(col, 0.95 * fade);
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    // folioles qui se déplient avec la fronde
    ctx.fillStyle = rgba(mixRgb(col, [140, 220, 140], 0.3), 0.85 * fade);
    ctx.beginPath();
    for (let i = 6; i < pts.length - 4; i += 4) {
      const [x, y, a] = pts[i];
      const k = (i / pts.length) * unroll;
      const len = (1 - i / pts.length) * 16 * unroll + 2;
      for (const sd of [-1, 1]) leafPath(ctx, x, y, a + sd * (1.3 - k * 0.3), len);
    }
    ctx.fill();
    if (unroll < 0.7 && !c.found) {
      const [tx, ty] = pts[pts.length - 1];
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow([170, 255, 170], 16), tx, ty, 9, 0.25 + 0.2 * Math.sin(t * 3));
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Le tournesol de Vogel : la n-ième graine à √n du centre, tournée de n × 137,508°
  function makeSunflower(x, y) {
    sunflower = { x, y, age: 0, R: Math.min(W, H) * 0.17, N: Math.round(380 * q + 120), leaving: 0 };
    secrets.find('tournesol');
    [0, 2, 4, 6, 7, 9].forEach((d, i) => audio.note(d, { type: 'bell', vel: 0.12, at: i * 0.12, dur: 3, send: 0.5 }));
  }
  function drawSunflower(ctx, t) {
    const sf = sunflower;
    const fade = sf.leaving ? 1 - clamp((clock - sf.leaving) / 6, 0, 1) : 1;
    if (fade <= 0) { sunflower = null; return; }
    const shown = Math.floor(sf.N * clamp(sf.age / 5, 0, 1));
    const c = sf.R / Math.sqrt(sf.N);
    // pétales
    const pk = easeOutBack(clamp((sf.age - 3.5) / 2, 0, 1));
    if (pk > 0) {
      ctx.fillStyle = `rgba(255,196,60,${0.9 * fade})`;
      ctx.beginPath();
      const np = 34;
      for (let i = 0; i < np; i++) {
        const a = (i / np) * TAU + t * 0.03;
        leafPath(ctx, sf.x + Math.cos(a) * sf.R * 0.95, sf.y + Math.sin(a) * sf.R * 0.95, a, sf.R * 0.55 * pk);
      }
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 200, 90], 64), sf.x, sf.y, sf.R * 2.4, 0.25 * fade);
    ctx.globalCompositeOperation = 'source-over';
    // le disque sombre, puis les graines qui dessinent les spirales de Fibonacci (21, 34, 55…)
    const dk = clamp(sf.age / 1.2, 0, 1);
    ctx.fillStyle = `rgba(38,20,8,${0.96 * fade})`;
    ctx.beginPath(); ctx.arc(sf.x, sf.y, sf.R * 1.03 * dk, 0, TAU); ctx.fill();
    for (let n = 0; n < shown; n++) {
      const r = c * Math.sqrt(n), a = n * GOLDEN + t * 0.03;
      const k = n / sf.N;
      ctx.fillStyle = `rgba(${Math.round(lerp(255, 196, k))},${Math.round(lerp(196, 112, k))},${Math.round(lerp(80, 36, k))},${fade})`;
      ctx.beginPath();
      ctx.arc(sf.x + Math.cos(a) * r, sf.y + Math.sin(a) * r, c * 0.46, 0, TAU);
      ctx.fill();
    }
  }

  function burst(x, y, c, n = 14, sp = 120) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random());
      bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c, r: 3 + Math.random() * 5, age: 0, life: 0.7 + Math.random() * 0.8 });
    }
  }

  // ——— Dessin
  function draw(ctx, t) {
    const se = seasonAt(clock);
    const top = blend('topC', se), bot = blend('botC', se), stemC = blend('stemC', se), lc = blend('light', se);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, rgba(top));
    bg.addColorStop(1, rgba(bot));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(frame, 0, 0, W, H);

    // halo de la lumière, derrière les plantes
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow(lc.map(Math.round), 64), light.x, light.y, 170 + light.hold * 140, 0.28 + light.hold * 0.25);
    ctx.globalCompositeOperation = 'source-over';

    // sol
    ctx.fillStyle = rgba(mixRgb(bot, [10, 7, 5], 0.6));
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, groundY + noise.n2(x * 0.01, 3) * 5);
    ctx.lineTo(W, H);
    ctx.fill();

    for (const c of croziers) drawCrozier(ctx, c, t, se);
    for (const v of vines) drawVine(ctx, v, t, stemC);
    drawLeaves(ctx, t, se);
    for (const f of flowers) drawFlower(ctx, f, t);
    drawFruits(ctx, t);
    if (sunflower) drawSunflower(ctx, t);

    // sève : des perles de lumière qui circulent dans les tiges
    ctx.globalCompositeOperation = 'lighter';
    const sap = glow([255, 236, 170], 12);
    for (const v of vines) {
      if (v.kind !== 'liane' || v.pts.length < 12 || v.dying) continue;
      const n = v.pts.length, speed = 70 + light.hold * 160;
      const span = n * SEG + 260;
      const pos = ((t * speed + v.seed * 97) % span) / SEG;
      for (const off of light.hold > 0.3 ? [0, n * 0.33, n * 0.66] : [0]) {
        const i = Math.floor((pos + off) % (span / SEG));
        if (i >= n) continue;
        const p = v.pts[i];
        drawGlow(ctx, sap, p.x + sway(v, i, t), p.y, 5 + light.hold * 4, 0.55 + light.hold * 0.4);
      }
    }
    // pollen, feuilles qui tombent, neige, éclats
    const mote = glow(lc.map(Math.round), 12);
    for (const m of motes) drawGlow(ctx, mote, m.x, m.y, 3, 0.55);
    for (const b of bursts) drawGlow(ctx, glow(b.c, 16), b.x, b.y, b.r, 1 - b.age / b.life);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const f of falling) {
      ctx.fillStyle = rgba(f.c, 0.9);
      ctx.beginPath();
      leafPath(ctx, f.x, f.y, f.rot, f.size);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(235,245,255,0.85)';
    ctx.beginPath();
    for (const s of snow) { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, TAU); }
    ctx.fill();

    // cœur de la lumière
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow([255, 255, 240], 24), light.x, light.y, 10 + light.hold * 8, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ——— Gestes
  function tap(p) {
    for (const c of croziers) {
      if (c.found) continue;
      const { pts, unroll } = crozierShape(c);
      const [tx, ty] = pts[pts.length - 1];
      if (unroll < 0.7 && Math.hypot(p.x - tx, p.y - ty) < 34) {
        c.found = true;
        burst(tx, ty, [170, 255, 170], 18, 110);
        audio.note(9, { type: 'glass', vel: 0.12, dur: 2.6 });
        secrets.find('crosse');
        return;
      }
    }
    seedAt(p.x, Math.min(p.y, groundY));
    audio.note(Math.floor((1 - p.y / H) * 8), { type: 'pluck', vel: 0.2, dur: 1.3, pan: (p.x / W) * 2 - 1 });
  }
  function longpress() { audio.note(7, { type: 'soft', vel: 0.1, dur: 3, send: 0.6 }); }

  // Premières pousses : depuis le sol, et deux lianes qui pendent de l'armature
  for (let i = 0; i < 5; i++) spawnVine(W * (0.1 + 0.8 * (i + Math.random() * 0.6) / 5), groundY, -Math.PI / 2 + (Math.random() - 0.5) * 0.5);
  for (let i = 0; i < 2; i++) spawnVine(W * (0.25 + i * 0.5), H * 0.08, Math.PI / 2, { maxLen: H * 0.6 });
  // un peu d'avance, pour que la serre ne soit pas nue à l'arrivée
  for (let k = 0; k < 90; k++) { growVines(1 / 15, seasonAt(clock)); clock += 1 / 15; }

  return {
    resize, update, draw, tap, longpress,
    words: { phi: () => { if (!sunflower) makeSunflower(W / 2, H * 0.45); }, fibonacci: () => { if (!sunflower) makeSunflower(W / 2, H * 0.45); } },
    destroy() {},
  };
}
