// Sève — son génératif. Aucun fichier : chaque note est calculée.

const SCALES = {
  majPenta: [0, 2, 4, 7, 9],
  minPenta: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  wholetone: [0, 2, 4, 6, 8, 10],
  hirajoshi: [0, 2, 3, 7, 8],
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* stockage indisponible */ } },
};

export const audio = {
  ctx: null,
  ready: false,
  muted: store.get('seve.muted') === '1',
  mood: null,
  voices: 0,
  _drone: null,
  _noiseBuf: null,

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    // Réverbération : une réponse impulsionnelle fabriquée avec du bruit qui s'éteint
    const len = Math.floor(ctx.sampleRate * 3.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverb.connect(revOut).connect(this.master);

    // Écho filtré
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2200;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.5;
    dlp.connect(dOut).connect(this.master);

    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this._noiseBuf = nb;

    this.ready = true;
    if (this.mood) this.setMood(this.mood, true);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.suspend() : this.resume()));
  },

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },

  setMuted(m) {
    this.muted = m;
    store.set('seve.muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
  },
  toggle() { this.setMuted(!this.muted); return this.muted; },

  scale() { return SCALES[this.mood?.scale] || SCALES.majPenta; },
  // Fréquence d'un degré de la gamme du tableau courant
  freq(deg, oct = 0) {
    const sc = this.scale();
    const n = sc.length;
    const o = Math.floor(deg / n);
    const st = sc[((deg % n) + n) % n] + 12 * (o + oct);
    return (this.mood?.root || 220) * Math.pow(2, st / 12);
  },

  // Branche une voix sur la sortie, la réverbération et l'écho ; renvoie les nœuds à débrancher ensuite
  _send(node, pan, send, delay) {
    const ctx = this.ctx;
    const made = [node];
    let out = node;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      out = p;
      made.push(p);
    }
    out.connect(this.master);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; out.connect(s).connect(this.reverb); made.push(s); }
    if (delay > 0) { const s = ctx.createGain(); s.gain.value = delay; out.connect(s).connect(this.delay); made.push(s); }
    return made;
  },

  // Une note : 'bell' (FM), 'glass', 'pluck', 'soft', 'drop'
  play(freq, { type = 'bell', vel = 0.3, pan = 0, dur = 2.2, send = 0.35, delay = 0.12, at = 0 } = {}) {
    if (!this.ready || this.muted || this.voices > 26 || !isFinite(freq)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    const attack = type === 'soft' ? 0.18 : type === 'drop' ? 0.002 : 0.006;
    out.gain.linearRampToValueAtTime(vel, t + attack);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const oscs = [];
    const car = ctx.createOscillator();
    car.frequency.setValueAtTime(freq, t);
    oscs.push(car);
    if (type === 'bell') {
      const mod = ctx.createOscillator();
      mod.frequency.value = freq * 3.5;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(freq * 2.4, t);
      mg.gain.exponentialRampToValueAtTime(freq * 0.04, t + dur * 0.7);
      mod.connect(mg).connect(car.frequency);
      oscs.push(mod);
      car.connect(out);
    } else if (type === 'glass') {
      car.type = 'sine';
      car.connect(out);
      const o2 = ctx.createOscillator();
      o2.frequency.value = freq * 2.76;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o2.connect(g2).connect(out);
      oscs.push(o2);
    } else if (type === 'pluck') {
      car.type = 'triangle';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(Math.min(9000, freq * 8), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 1.2), t + Math.min(dur, 0.6));
      car.connect(f).connect(out);
    } else if (type === 'drop') {
      car.frequency.setValueAtTime(freq * 2.3, t);
      car.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
      car.connect(out);
    } else {
      car.type = 'triangle';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.min(6000, freq * 4);
      car.connect(f).connect(out);
    }
    const made = this._send(out, pan, send, delay);
    this.voices++;
    for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
    car.onended = () => { this.voices--; made.forEach(n => n.disconnect()); };
  },

  note(deg, opts = {}) { this.play(this.freq(deg, opts.oct || 0), opts); },

  // Souffle de bruit filtré : éclaboussure, crépitement, vent
  noise({ freq = 1200, q = 1, dur = 0.3, vel = 0.15, type = 'bandpass', pan = 0, send = 0.3, sweep = 0, at = 0 } = {}) {
    if (!this.ready || this.muted || this.voices > 26) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    const made = this._send(g, pan, send, 0);
    this.voices++;
    src.onended = () => { this.voices--; made.forEach(n => n.disconnect()); };
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  },

  // Glissando : un sifflement qui descend (les « chœurs de l'aube » sous les aurores), une sirène, un souffle
  sweep({ from = 3000, to = 500, dur = 1.2, vel = 0.05, type = 'sine', pan = 0, send = 0.5, at = 0 } = {}) {
    if (!this.ready || this.muted || this.voices > 26) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    const made = this._send(g, pan, send, 0.12);
    this.voices++;
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => { this.voices--; o.disconnect(); made.forEach(n => n.disconnect()); };
  },

  // Petite fanfare cristalline : un secret vient d'être trouvé
  chime() {
    if (!this.ready) return;
    const base = (this.mood?.root || 220) * 2;
    [0, 4, 7, 12, 16].forEach((st, i) => this.play(base * Math.pow(2, st / 12), { type: 'bell', vel: 0.16, at: i * 0.09, dur: 2.6, send: 0.5, delay: 0.2, pan: (i - 2) * 0.25 }));
    this.play(base * 4, { type: 'glass', vel: 0.08, at: 0.5, dur: 3.5, send: 0.7 });
  },

  // Nappe de fond propre à chaque tableau
  setMood(mood, force = false) {
    if (!mood) return;
    if (!force && this.mood === mood) return;
    this.mood = mood;
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this._drone) {
      const old = this._drone;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setTargetAtTime(0.0001, t, 0.8);
      setTimeout(() => { old.nodes.forEach(n => { try { n.stop(); } catch (_) { /* déjà arrêté */ } }); old.out.disconnect(); }, 4000);
    }
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const nodes = [];
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = mood.cutoff || 900;
    filt.Q.value = 0.6;
    filt.connect(out);
    const chord = mood.chord || [0, 7, 12];
    for (const st of chord) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = mood.wave || 'sine';
        o.frequency.value = (mood.root || 220) * Math.pow(2, st / 12) * (mood.droneOct || 0.5);
        o.detune.value = det + (Math.random() - 0.5) * 4;
        const g = ctx.createGain();
        g.gain.value = 0.5 / chord.length;
        o.connect(g).connect(filt);
        o.start();
        nodes.push(o);
      }
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = mood.lfo || 0.06;
    const lg = ctx.createGain();
    lg.gain.value = (mood.cutoff || 900) * 0.45;
    lfo.connect(lg).connect(filt.frequency);
    lfo.start();
    nodes.push(lfo);
    if (mood.noise) {
      const n = mood.noise;
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = n.type || 'lowpass';
      nf.frequency.value = n.freq || 600;
      nf.Q.value = n.q || 0.7;
      const ng = ctx.createGain();
      ng.gain.value = n.gain || 0.02;
      const gl = ctx.createOscillator();
      gl.frequency.value = n.gustRate || 0.11;
      const gg = ctx.createGain();
      gg.gain.value = (n.gain || 0.02) * (n.gust || 0.5);
      gl.connect(gg).connect(ng.gain);
      src.connect(nf).connect(ng).connect(out);
      src.start();
      gl.start();
      nodes.push(src, gl);
      this._noiseGain = ng;
    } else this._noiseGain = null;
    this._send(out, 0, 0.45, 0);
    out.gain.setTargetAtTime(mood.pad ?? 0.05, t + 0.2, 1.2);
    this._drone = { out, nodes };
  },

  // Intensité du bruit de fond (pluie, vent…)
  setNoiseLevel(v) {
    if (this._noiseGain && this.ctx) this._noiseGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.6);
  },
};
