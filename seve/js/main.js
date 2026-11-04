// Sève — chef d'orchestre : les lieux, les passages entre eux, et ce qui vaut partout.
import { createEngine, makeNoise, rng, glow } from './engine.js';
import { audio } from './audio.js';
import { secrets } from './secrets.js';
import { toast, titleCard, hideTitleCard, setRealmLabel, renderCarnet, setBadge } from './ui.js';

export const REALMS = [
  { id: 'arbre', file: './realms/arbre.js', ready: true, color: '#d9c7ff', short: 'Arbre',
    kicker: 'Le carrefour', title: "L'Arbre-Monde", sub: 'Chaque fruit est un monde. Chaque secret trouvé y fait éclore une fleur.',
    hint: ['Touche un fruit · pour voyager', 'Caresse les branches · pour faire le vent'] },
  { id: 'serre', file: './realms/serre.js', ready: true, color: '#9be58a', short: 'Serre',
    kicker: 'Tableau I · Végétation', title: 'La Serre aux Lianes', sub: "Elles ne savent qu'une chose : aller vers la lumière. Et la lumière, c'est toi.",
    hint: ['Bouge · la lumière', 'Touche · pour semer', 'Maintiens · pour nourrir la sève'] },
  { id: 'bassin', file: './realms/bassin.js', ready: true, color: '#5ef2ff', short: 'Bassin',
    kicker: 'Tableau II · Vie', title: 'Le Bassin Primordial', sub: "Six chimies, une seule règle : s'attirer ou se fuir. La vie fait le reste.",
    hint: ['Glisse · pour remuer', 'Touche · pour verser une goutte de vie', 'Maintiens · pour attirer'] },
  { id: 'spheres', file: './realms/spheres.js', ready: true, color: '#ffb36b', short: 'Sphères',
    kicker: 'Tableau III · Gravité', title: "L'Harmonie des Sphères", sub: 'Chaque orbite chante quand elle franchit le méridien. Kepler l\'entendait déjà en 1619.',
    hint: ['Glisse puis lâche · pour lancer une planète', 'Touche · pour une orbite parfaite'] },
  { id: 'marais', file: './realms/marais.js', ready: true, color: '#7fe0c8', short: 'Marais',
    kicker: 'Tableau IV · Chimie', title: 'Le Marais de Turing', sub: 'Deux substances qui se poursuivent, et la matière se met à dessiner. Turing l\'avait écrit en 1952.',
    hint: ['Peins · une chimie du bout du doigt', 'Touche un feu follet · pour le faire éclater'] },
  { id: 'recif', file: './realms/recif.js', ready: true, color: '#5fa8ff', short: 'Récif',
    kicker: 'Tableau V · Nombres', title: 'Le Récif de Collatz', sub: 'Si pair, divise par deux. Sinon, triple et ajoute un. Chaque nombre rentre à 1, et une algue pousse.',
    hint: ['Touche une branche · pour lire le voyage d\'un nombre', 'Effleure l\'eau · le plancton s\'allume'] },
  { id: 'flocons', file: './realms/flocons.js', ready: true, color: '#cfe8ff', short: 'Flocons',
    kicker: 'Tableau VI · Cristaux', title: 'La Chambre des Flocons', sub: "Un flocon est l'histoire exacte des nuages qu'il a traversés. Choisis-les.",
    hint: ['Déplace-toi · pour changer le ciel', 'Touche · pour souffler', 'Maintiens · pour le laisser tomber'] },
  { id: 'etang', file: './realms/etang.js', ready: true, color: '#ff9ec7', short: 'Étang',
    kicker: 'Tableau VII · Ondes', title: "L'Étang au Crépuscule", sub: "L'eau se souvient de chaque geste, le temps d'une onde. Les carpes, elles, se souviennent de toi.",
    hint: ['Touche · l\'eau', 'Glisse · pour tracer un sillage', 'Maintiens · pour nourrir les carpes'] },
  { id: 'blob', file: './realms/blob.js', ready: true, color: '#f5e663', short: 'Blob',
    kicker: 'Tableau VIII · Intelligence', title: 'Les Chemins du Blob', sub: 'Physarum polycephalum : pas de cerveau, et pourtant il trouve le chemin le plus court.',
    hint: ['Touche · pour poser ou retirer de l\'avoine', 'Glisse · pour tracer du sel', 'Maintiens · la lumière le fait fuir'] },
  { id: 'alchimie', file: './realms/alchimie.js', ready: true, color: '#ff6b5a', short: 'Alchimie',
    kicker: 'Tableau IX · Matière', title: "L'Atelier d'Alchimie", sub: 'Sable, eau, feu, glace, graines : chaque rencontre change la matière.',
    hint: ['Choisis · un élément en bas', 'Dessine · pour le verser'] },
  { id: 'racines', file: './realms/racines.js', ready: true, hidden: true, color: '#b48cff', short: 'Racines',
    kicker: 'Tableau secret', title: 'Les Racines', sub: 'Sous l\'arbre, ce qui relie tout. Et tout au fond, un cœur qui bat.',
    hint: ['Promène ta lanterne', 'Touche une racine · pour y envoyer la sève', 'Touche le cœur · pour y plonger'] },
];

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const engine = createEngine($('world'));
secrets.setRealms(REALMS);

let current = null, busy = false, pending = null, started = false, pendingRegrow = false;
const ROOTS_AT = 8; // secrets qu'il faut pour que le passage sous l'arbre s'ouvre
const rootsOpen = () => secrets.count() >= ROOTS_AT || secrets.wasVisited('racines');

const api = {
  engine,
  get W() { return engine.W; },
  get H() { return engine.H; },
  input: engine.input,
  audio, secrets, toast,
  realms: REALMS,
  noise: makeNoise(7),
  rng, glow,
  go(id) { if (id === 'arbre') { if (location.hash) location.hash = ''; else go('arbre'); } else location.hash = id; },
  eclipse,
  label(text) { if (current) { current.extra = text; updateChrome(); } },
  showTitle() { if (current) titleCard(current.meta); },
  // L'Arbre prévient quand la graine a germé
  germinated() {
    started = true;
    document.body.classList.remove('pre');
    const target = realmFromHash();
    if (target !== 'arbre') go(target);
    else titleCard(REALMS[0], { hold: 5200 });
  },
  startAudio() { audio.init(); if (current) audio.setMood(current.mood, true); },
  rootsOpen,
  // après la Graine d'Or : l'Arbre-Monde repousse, différent
  regrow() { pendingRegrow = true; if (location.hash) location.hash = ''; else go('arbre', { force: true }); },
};

function realmFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const r = REALMS.find(x => x.id === id && x.ready);
  if (r && r.id === 'racines' && !rootsOpen()) return 'arbre';
  return r ? r.id : 'arbre';
}

async function go(id, opts = {}) {
  if (busy) { pending = id; return; }
  if (id === 'arbre' && pendingRegrow) { pendingRegrow = false; opts = { ...opts, regrow: true, force: true }; }
  if (current && current.id === id && !opts.force) return;
  const meta = REALMS.find(r => r.id === id && r.ready);
  if (!meta) return;
  busy = true;
  const veil = $('veil');
  if (current) { veil.classList.add('on'); await wait(480); }
  hideTitleCard();
  let mod;
  try { mod = await import(meta.file); } catch (err) {
    console.error(err);
    toast({ kicker: 'Passage fermé', title: meta.title, text: "Ce monde n'a pas pu pousser. Recharge la page pour réessayer." });
    veil.classList.remove('on');
    busy = false;
    return;
  }
  try { current?.instance?.destroy?.(); } catch (err) { console.error(err); }
  current = { id, meta, instance: null, mood: mod.mood, extra: '' };
  const instance = mod.create(api, meta, opts);
  current.instance = instance;
  engine.setScene(instance);
  document.documentElement.style.setProperty('--accent', meta.color);
  audio.setMood(mod.mood);
  secrets.visit(id);
  updateChrome();
  if (!opts.intro) titleCard(meta);
  veil.classList.remove('on');
  busy = false;
  if (pending) { const p = pending; pending = null; if (p !== id) go(p); }
}

function updateChrome() {
  const back = $('back'), label = $('back-label');
  if (!current || current.id === 'arbre') {
    back.href = '../accueil/';
    back.setAttribute('aria-label', "Retour à l'accueil");
    label.textContent = 'Accueil';
  } else {
    back.href = '#';
    back.setAttribute('aria-label', "Retour à l'Arbre-Monde");
    label.textContent = "L'Arbre";
  }
  setRealmLabel(current ? current.meta.title + (current.extra ? ' · ' + current.extra : '') : '');
}

window.addEventListener('hashchange', () => { if (started) go(realmFromHash()); });

// Boutons
$('btn-sound').addEventListener('click', () => {
  if (!audio.ctx) { audio.setMuted(!audio.muted); }
  else audio.toggle();
  document.body.classList.toggle('muted', audio.muted);
  $('btn-sound').setAttribute('aria-label', audio.muted ? 'Activer le son' : 'Couper le son');
});
document.body.classList.toggle('muted', audio.muted);
$('btn-help').addEventListener('click', () => api.showTitle());
const carnet = $('carnet');
function openCarnet() {
  const shown = REALMS.filter(r => !r.hidden || r.ready).map(r => ({ ...r, locked: r.id === 'racines' && !rootsOpen() }));
  renderCarnet({ realms: shown, secrets, lockedText: `scellé · ${ROOTS_AT} secrets l'ouvrent`, onGo: id => { closeCarnet(); api.go(id); } });
  carnet.hidden = false;
  $('carnet-close').focus();
}
function closeCarnet() { carnet.hidden = true; }
$('btn-carnet').addEventListener('click', openCarnet);
$('carnet-close').addEventListener('click', closeCarnet);
carnet.addEventListener('click', e => { if (e.target === carnet) closeCarnet(); });

// Éclipse : le passage d'Umbra
function eclipse() {
  const el = $('eclipse');
  el.classList.remove('run');
  void el.offsetWidth;
  el.classList.add('run');
  audio.play(audio.freq(0, -2), { type: 'soft', vel: 0.25, dur: 7, send: 0.8 });
  audio.play(audio.freq(4, 1), { type: 'glass', vel: 0.08, dur: 6, send: 0.9, at: 1.2 });
  setTimeout(() => el.classList.remove('run'), 9300);
}

// Clavier : mots secrets et vieux codes
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
let konamiIdx = 0, typed = '';
window.addEventListener('keydown', e => {
  engine.touchInput();
  if (e.key === 'Escape' && !carnet.hidden) { closeCarnet(); return; }
  if (!started && (e.key === 'Enter' || e.key === ' ')) { seuilStart(); return; }
  const k = e.key.toLowerCase();
  konamiIdx = k === KONAMI[konamiIdx] ? konamiIdx + 1 : (k === KONAMI[0] ? 1 : 0);
  if (konamiIdx === KONAMI.length) {
    konamiIdx = 0;
    document.body.classList.add('inverse');
    setTimeout(() => document.body.classList.remove('inverse'), 20000);
    secrets.find('konami');
  }
  if (k.length === 1 && /[a-z0-9éèàç]/.test(k)) {
    typed = (typed + k).slice(-24);
    if (typed.endsWith('umbra')) { eclipse(); secrets.find('umbra'); }
    const words = current?.instance?.words;
    if (words) for (const w in words) if (typed.endsWith(w)) { typed = ''; words[w](); break; }
  }
  current?.instance?.key?.(e);
});

// Patience, et l'heure du cercle
engine.listeners.frame.push(() => {
  if (started && current && carnet.hidden && engine.idle() > 50) secrets.find('patience');
});
function checkClock() {
  const d = new Date();
  if (started && d.getHours() % 12 === 3 && d.getMinutes() === 14) secrets.find('cercle');
}
setInterval(checkClock, 15000);

// Départ : la graine attend sur le Seuil. Un toucher (ou Entrée) la fait germer.
function seuilStart() {
  const s = $('seuil');
  if (s.classList.contains('gone') || !current) return;
  s.classList.add('gone');
  api.startAudio();
  current.instance.germinate?.();
}
api.seuilStart = seuilStart;
document.body.classList.add('pre');
setBadge(secrets.count());
engine.start();
go('arbre', { intro: true }).then(checkClock);
