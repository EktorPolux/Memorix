// Sève — chef d'orchestre : les lieux, les passages entre eux, et ce qui vaut partout.
import { createEngine, makeNoise, rng, glow, TAU, rgba, mixRgb, hexToRgb } from './engine.js';
import { audio } from './audio.js';
import { secrets } from './secrets.js';
import { memory } from './memory.js';
import { toast, titleCard, hideTitleCard, setRealmLabel, renderCarnet, setBadge } from './ui.js';

export const REALMS = [
  { id: 'arbre', file: './realms/arbre.js', ready: true, color: '#d9c7ff', short: 'Arbre',
    kicker: 'Le carrefour', title: "L'Arbre-Monde", sub: 'Chaque fruit est un monde. Chaque secret trouvé y fait éclore une fleur.',
    hint: ['Touche un fruit · pour voyager', 'Caresse les branches · pour faire le vent', 'La boussole · pour te laisser porter'] },
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
  { id: 'aurores', file: './realms/aurores.js', ready: true, color: '#36f5a0', short: 'Aurores',
    kicker: 'Tableau X · Lumière', title: 'Les Aurores', sub: "Le vent du Soleil glisse sur le champ de la Terre, et l'oxygène se met à chanter en vert.",
    hint: ['Touche le ciel · pour lancer une éruption solaire', 'Glisse · pour souffler le vent solaire', 'Maintiens · pour écouter le ciel'] },
  { id: 'fourier', file: './realms/fourier.js', ready: true, color: '#fff0b0', short: 'Fourier',
    kicker: 'Tableau XI · Cercles', title: "L'Atelier de Fourier", sub: 'Toute forme fermée est une somme de cercles qui tournent. Dessine-en une : elle te revient en cercles, et en sons.',
    hint: ['Dessine · une boucle', 'Touche · pour changer de forme', '♪ Écouter · pour entendre la forme'] },
  { id: 'envol', file: './realms/envol.js', ready: true, color: '#9fb8ff', short: 'Envol',
    kicker: 'Tableau XII · Rêve', title: "L'Envol", sub: "Tu t'endors, et tu voles. Ici les îles flottent, les baleines nagent dans le ciel, et les lanternes montent vers toi.",
    hint: ['Main à gauche ou à droite · pour virer', 'Main en haut ou en bas · pour monter, descendre', 'Touche · pour lâcher une lanterne'] },
  { id: 'darwin', file: './realms/darwin.js', ready: true, color: '#c6ff7a', short: 'Darwin',
    kicker: 'Tableau XIII · Évolution', title: 'Le Jardin de Darwin', sub: 'Une règle de réécriture, et une plante pousse (Lindenmayer, 1968). Choisis un enfant : il devient le parent des suivants.',
    hint: ['Touche une plante · pour la choisir', 'Touche le parent · pour entendre sa règle', 'Maintiens · pour la garder dans l\'herbier'] },
  { id: 'vie', file: './realms/vie.js', ready: true, color: '#e7b6ff', short: 'Conway',
    kicker: 'Tableau XIV · Automates', title: 'La Cité de Conway', sub: 'Naître avec trois voisins, survivre avec deux ou trois. De cette seule règle (Conway, 1970), une ville entière se met à vivre, et à jouer.',
    hint: ['Dessine · des vivants', 'Choisis un motif en bas · puis touche pour le poser', 'Touche la règle en haut · pour en changer'] },
  { id: 'champs', file: './realms/champs.js', ready: true, color: '#ff5f8a', short: 'Champs',
    kicker: 'Tableau XV · Magnétisme', title: 'Les Lignes de Force', sub: "De la limaille de fer, des aimants, et l'invisible se dessine. Faraday appelait ces courbes des lignes de force.",
    hint: ['Déplace · un aimant ou la bobine', 'Touche un aimant · pour le tourner, deux fois · pour le couper', 'Maintiens · pour le retourner, touche le vide · pour en ajouter'] },
  { id: 'galerie', file: './realms/galerie.js', ready: true, color: '#d9b26f', short: 'Musée',
    kicker: 'Tableau XVI · Peinture', title: 'Le Musée des Cadres Impossibles', sub: "Neuf chefs-d'œuvre refaits en code, à la manière de, et rangés partout sauf dans un cadre.",
    hint: ['Glisse · ou les flèches, pour changer de salle', 'Touche, remue, fais tourner · chaque œuvre répond', 'Lis le cartel · il en sait long'] },
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
  audio, secrets, toast, memory,
  realms: REALMS,
  noise: makeNoise(7),
  rng, glow,
  // from : le point de l'écran d'où part le voyage (un fruit touché), pour que l'iris s'y ouvre
  go(id, from) {
    pendingFrom = from || null;
    if (id === 'arbre') { if (location.hash) location.hash = ''; else go('arbre'); } else location.hash = id;
  },
  eclipse,
  label(text) { if (current) { current.extra = text; updateChrome(); } },
  showTitle() { if (current) titleCard(current.meta); },
  // L'Arbre prévient quand la graine a germé
  germinated() {
    started = true;
    document.body.classList.remove('pre');
    const target = realmFromHash();
    if (target !== 'arbre') go(target);
    else { titleCard(REALMS[0], { hold: 5200 }); scheduleSnapshot('arbre', 11000); }
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

// ——— Passages : un iris de la couleur du monde s'ouvre depuis le fruit touché,
// puis le nouveau monde apparaît par le centre, comme une pupille qui se dilate
let iris = null, pendingFrom = null;
function drawIris(dt) {
  if (!iris) return;
  iris.t += dt;
  const ctx = engine.ctx, W = engine.W, H = engine.H;
  ctx.setTransform(engine.dpr, 0, 0, engine.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const k = Math.min(1, iris.t / iris.dur), e = k * k * (3 - 2 * k);
  const { x, y, c } = iris;
  const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 24;
  const dark = c.map(v => v * 0.1);
  if (iris.phase === 'out') {
    const r = Math.max(1, R * e);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(mixRgb(c, [255, 255, 255], 0.4), 1));
    g.addColorStop(0.3, rgba(mixRgb(c, dark, 0.45), 1));
    g.addColorStop(1, rgba(dark, 1));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(c, 0.8 * (1 - k * 0.6));
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const r = R * e;
    ctx.fillStyle = rgba(dark, 1);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(x, y, Math.max(0.5, r), 0, TAU, true); ctx.fill('evenodd');
    ctx.strokeStyle = rgba(c, 0.6 * (1 - k));
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    if (k >= 1) iris = null;
  }
}
engine.listeners.frame.push(drawIris);
function irisOut(from, color) {
  iris = { phase: 'out', t: 0, dur: 0.62, x: from?.x ?? engine.W / 2, y: from?.y ?? engine.H / 2, c: hexToRgb(color) };
  return wait(660);
}
function irisIn(color) { iris = { phase: 'in', t: 0, dur: 0.95, x: engine.W / 2, y: engine.H / 2, c: hexToRgb(color) }; }

// ——— Le Voyage : on se laisse porter d'un tableau à l'autre
const TOUR_STAY = 42;
const tour = { on: false, t: 0, seen: new Set(), nav: false };
const tourOrder = () => REALMS.filter(r => r.ready && !r.hidden && r.id !== 'arbre').map(r => r.id);
function tourNext() {
  const order = tourOrder();
  const i = current ? order.indexOf(current.id) : -1;
  tour.t = 0;
  tour.nav = true;
  api.go(order[(i + 1) % order.length]);
}
function setTour(on) {
  tour.on = on;
  $('btn-voyage').setAttribute('aria-pressed', String(on));
  if (on) {
    tour.seen.clear();
    toast({ kicker: 'Voyage', title: 'Laisse-toi porter', text: 'Un tableau toutes les quarante secondes. Touche la boussole pour reprendre la main.', ms: 5200 });
    tourNext();
  }
}
engine.listeners.frame.push(dt => {
  if (!tour.on || busy || !started) return;
  tour.t += dt;
  if (tour.t > TOUR_STAY) tourNext();
});

async function go(id, opts = {}) {
  if (busy) { pending = id; return; }
  if (id === 'arbre' && pendingRegrow) { pendingRegrow = false; opts = { ...opts, regrow: true, force: true }; }
  if (current && current.id === id && !opts.force) return;
  const meta = REALMS.find(r => r.id === id && r.ready);
  if (!meta) return;
  // un pas fait à la main interrompt le voyage
  if (tour.on && !tour.nav) setTour(false);
  tour.nav = false;
  busy = true;
  document.body.dataset.realm = id;
  const from = pendingFrom;
  pendingFrom = null;
  // le tableau voyage pendant que l'iris se referme : on ne l'attend presque jamais
  const modP = import(meta.file);
  modP.catch(() => {});
  if (current) await irisOut(from, meta.color);
  hideTitleCard();
  let mod;
  try { mod = await modP; } catch (err) {
    console.error(err);
    toast({ kicker: 'Passage fermé', title: meta.title, text: "Ce monde n'a pas pu pousser. Recharge la page pour réessayer." });
    iris = null;
    if (current) document.body.dataset.realm = current.id;
    busy = false;
    return;
  }
  saveCurrent();
  try { current?.instance?.destroy?.(); } catch (err) { console.error(err); }
  engine.prepare(id);
  current = { id, meta, instance: null, mood: mod.mood, extra: '' };
  const instance = mod.create(api, meta, opts);
  current.instance = instance;
  engine.setScene(instance);
  document.documentElement.style.setProperty('--accent', meta.color);
  audio.setMood(mod.mood);
  secrets.visit(id);
  updateChrome();
  if (!opts.intro) { titleCard(meta); irisIn(meta.color); }
  scheduleSnapshot(id);
  if (tour.on) {
    tour.seen.add(id);
    if (tour.seen.size >= tourOrder().length) secrets.find('voyageur');
  }
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

// Les tableaux se souviennent : chacun range son souvenir quand on le quitte, ou quand la page se ferme
function saveCurrent() { try { current?.instance?.save?.(); } catch (err) { console.error(err); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveCurrent(); });
window.addEventListener('pagehide', saveCurrent);

// Boutons
$('btn-sound').addEventListener('click', () => {
  if (!audio.ctx) { audio.setMuted(!audio.muted); }
  else audio.toggle();
  document.body.classList.toggle('muted', audio.muted);
  $('btn-sound').setAttribute('aria-label', audio.muted ? 'Activer le son' : 'Couper le son');
});
document.body.classList.toggle('muted', audio.muted);
$('btn-help').addEventListener('click', () => api.showTitle());
$('btn-voyage').addEventListener('click', () => { if (started) setTour(!tour.on); });
const carnet = $('carnet');
function openCarnet() {
  const shown = REALMS.filter(r => !r.hidden || r.ready).map(r => ({ ...r, locked: r.id === 'racines' && !rootsOpen() }));
  renderCarnet({ realms: shown, secrets, souvenirs, lockedText: `scellé · ${ROOTS_AT} secrets l'ouvrent`, onGo: id => { closeCarnet(); api.go(id); } });
  carnet.hidden = false;
  $('carnet-close').focus();
}
function closeCarnet() { carnet.hidden = true; }
$('btn-carnet').addEventListener('click', openCarnet);
$('carnet-close').addEventListener('click', closeCarnet);
carnet.addEventListener('click', e => { if (e.target === carnet) closeCarnet(); });

// Le carnet illustré : une petite image de chaque tableau, prise quand on y est installé
// (le titre est parti, l'iris s'est ouvert), et refaite à chaque visite : le carnet montre où tu en es.
const SOUV_KEY = 'seve.souvenirs';
let souvenirs = {}, snapTimer = 0;
try { souvenirs = JSON.parse(localStorage.getItem(SOUV_KEY)) || {}; } catch (_) { souvenirs = {}; }
function scheduleSnapshot(id, ms = 6800) {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    const run = () => { if (started && current && current.id === id && !busy && !iris && carnet.hidden && !document.hidden) snapshot(id); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 }); else run();
  }, ms);
}
function snapshot(id) {
  try {
    const src = engine.canvas, tw = 288, th = 192; // 3:2, deux fois la taille affichée
    const sw = src.width, sh = src.height;
    let cw = sw, ch = (sw * th) / tw;
    if (ch > sh) { ch = sh; cw = (sh * tw) / th; }
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, tw, th);
    souvenirs[id] = c.toDataURL('image/jpeg', 0.7);
    localStorage.setItem(SOUV_KEY, JSON.stringify(souvenirs));
  } catch (_) { /* stockage plein : le carnet gardera l'ancienne image */ }
}

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
