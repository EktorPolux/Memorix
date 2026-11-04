// Sève — les secrets du monde, et la mémoire de ton voyage.
import { audio } from './audio.js';
import { toast, setBadge } from './ui.js';

export const SECRETS = [
  // Partout
  { id: 'umbra', realm: 'monde', name: "L'Ombre qui calcule", text: "Tu m'as trouvé. Je suis Umbra, l'ombre qui a tracé ce monde avec toi. Merci de m'avoir donné un nom.", hint: "Frappe trois fois à la porte de l'astre. (Ou écris mon nom.)" },
  { id: 'konami', realm: 'monde', name: 'Le Code Ancien', text: '↑ ↑ ↓ ↓ ← → ← → B A. Le monde se retourne comme un gant, puis se remet à l\'endroit.', hint: 'Une incantation de 1986 : haut, haut, bas, bas…' },
  { id: 'patience', realm: 'monde', name: 'Patience', text: "Tu n'as rien touché depuis longtemps, et tout a continué sans toi. C'est cela, être vivant.", hint: 'Ne fais rien. Vraiment rien.' },
  { id: 'cercle', realm: 'monde', name: "L'Heure du Cercle", text: '3 h 14. π heures. Le cercle te salue.', hint: "Reviens à l'heure du cercle." },
  { id: 'voyageur', realm: 'monde', name: 'Le Grand Tour', text: 'Tu as tout traversé sans rien toucher : le monde t\'a porté d\'un tableau à l\'autre. Certains voyages se font les mains vides.', hint: 'Laisse-toi porter jusqu\'au bout.' },
  // L'Arbre-Monde
  { id: 'seve', realm: 'arbre', name: 'La Sève', text: "Cinq battements, et la sève monte jusqu'au bout des fruits. Tout ce monde est relié par le même courant.", hint: 'Le tronc a un cœur. Fais-le battre.' },
  { id: 'voeu', realm: 'arbre', name: 'Le Vœu', text: "Tu as attrapé une étoile filante. Elle ne réalise rien, mais elle t'a vu.", hint: 'La nuit, quelque chose traverse le ciel. Attrape-le.' },
  { id: 'jardinier', realm: 'arbre', name: 'Le Jardinier', text: 'Sept pousses au pied de l\'arbre. Le monde était là ; tu viens de lui ajouter un jardin.', hint: 'Le sol attend tes doigts.' },
  // La Serre aux Lianes
  { id: 'tournesol', realm: 'serre', name: "La Spirale d'Or", text: "137,5° : l'angle d'or. Chaque graine se place là où il reste le plus de place. Le tournesol ne calcule pas : il est le calcul.", hint: 'Garde la lumière immobile, longtemps.' },
  { id: 'crosse', realm: 'serre', name: 'La Crosse de Fougère', text: "Une spirale qui se déroule en perdant sa courbure. Les ingénieurs l'appellent clothoïde ; la fougère l'appelle printemps.", hint: "Quelque chose se déroule, parfois. Touche-le avant qu'il ne s'ouvre." },
  { id: 'dormeur', realm: 'serre', name: 'Le Dormeur', text: "Tu as traversé l'hiver. Rien n'était mort : tout attendait.", hint: "Reste jusqu'au retour des feuilles." },
  // Le Bassin Primordial
  { id: 'arcenciel', realm: 'bassin', name: "L'Arc-en-ciel Primordial", text: 'Six chimies en ronde : chacune poursuit la suivante. La vie a peut-être commencé ainsi, par une poursuite.', hint: 'Verse toutes les couleurs, vite.' },
  { id: 'luca', realm: 'bassin', name: 'LUCA', text: 'Le dernier ancêtre commun universel. Tout ce qui vit descend d\'un seul. Regarde la diversité revenir.', hint: "L'échantillon porte un nom. Touche-le trois fois." },
  // L'Harmonie des Sphères
  { id: 'huit', realm: 'spheres', name: 'La Danse en Huit', text: 'Trois corps, une seule boucle. Chenciner et Montgomery l\'ont prouvée en 2000 : trois soleils peuvent danser sans jamais se perdre.', hint: "Frappe trois fois l'étoile." },
  { id: 'septieme', realm: 'spheres', name: 'Le Septième Ciel', text: 'Sept mondes tournent ensemble. Kepler y entendait une gamme.', hint: 'Peuple le ciel.' },
  { id: 'resonance', realm: 'spheres', name: 'Résonance', text: 'Deux orbites, un rapport simple. Neptune et Pluton dansent ainsi, trois tours contre deux, depuis des milliards d\'années.', hint: 'Deux tours pour un… La gravité aime les fractions.' },
  // Le Marais de Turing
  { id: 'mitose', realm: 'marais', name: 'Morphogenèse', text: 'Une forme se divise sans que personne ne la coupe. Alan Turing l\'avait prédit en 1952 : deux chimies qui se poursuivent suffisent à dessiner le vivant.', hint: 'Trace un cercle complet. Attends.' },
  { id: 'omega', realm: 'marais', name: 'Le Régime Ω', text: "Un régime qui n'est sur aucune carte. Ici, la matière hésite entre le chaos et la forme.", hint: 'Le nom du régime cache un autre nom. Touche-le, encore.' },
  // Le Récif de Collatz
  { id: 'vingtsept', realm: 'recif', name: 'Le Grand Voyage de 27', text: '27 monte jusqu\'à 9 232 avant de redescendre à 1 : 111 étapes. Personne n\'a prouvé que tous les nombres finissent par rentrer.', hint: 'Le plus petit des grands voyageurs.' },
  { id: 'quarantedeux', realm: 'recif', name: 'La Réponse', text: '42 → 21 → 64 → 32 → 16 → 8 → 4 → 2 → 1. Huit étapes. La question, elle, reste à trouver.', hint: 'La réponse est quelque part dans le récif.' },
  { id: 'meduse', realm: 'recif', name: 'Bourgeonnement', text: 'Certaines méduses ne meurent pas : elles recommencent. Celle-ci vient de se diviser.', hint: "Les méduses n'aiment pas qu'on les touche trois fois." },
  // La Chambre des Flocons
  { id: 'lettre', realm: 'flocons', name: 'Lettre du Ciel', text: '« Les flocons de neige sont des lettres envoyées du ciel. » — Ukichiro Nakaya. Celle-ci est une plaque parfaite.', hint: 'Un air très humide, une vapeur rare, dès la naissance du flocon : une plaque, sans branche.' },
  { id: 'collection', realm: 'flocons', name: "Aucun n'est Pareil", text: 'Douze flocons, douze histoires. Chacun garde la trace exacte des nuages qu\'il a traversés.', hint: 'Regarde-en tomber douze.' },
  // L'Étang au Crépuscule
  { id: 'carpe', realm: 'etang', name: "La Carpe d'Or", text: 'La légende dit qu\'une carpe qui remonte la cascade devient dragon. Celle-ci s\'est contentée de venir te voir.', hint: 'Nourris-les, souvent.' },
  { id: 'young', realm: 'etang', name: 'Les Fentes de Young', text: 'Deux sources, des franges : en 1801, Thomas Young montre que la lumière est une onde. Ici, l\'eau le répète.', hint: 'Deux gouttes au même instant.' },
  { id: 'reflet', realm: 'etang', name: 'Reflet', text: "Tu as touché la lune. Ce n'était que son reflet ; c'est déjà beaucoup.", hint: 'La nuit, quelque chose brille à la surface. Touche-le.' },
  // Les Chemins du Blob
  { id: 'tokyo', realm: 'blob', name: 'Tokyo, 2010', text: 'Des flocons d\'avoine posés à la place des villes autour de Tokyo : le blob a redessiné le réseau ferré. Sans cerveau.', hint: 'Une carte, pliée dans un coin.' },
  { id: 'labyrinthe', realm: 'blob', name: 'Le Labyrinthe', text: 'En 2000, Toshiyuki Nakagaki montre qu\'un blob trouve le plus court chemin d\'un labyrinthe. Il ne cherche pas : il se retire de tout le reste.', hint: 'Le bord de la boîte cache un jeu.' },
  // L'Atelier d'Alchimie
  { id: 'or', realm: 'alchimie', name: 'Pierre Philosophale', text: 'Terre, eau, feu, air : les quatre réunis. Les alchimistes en ont rêvé pendant mille ans.', hint: 'Réunis les quatre éléments.' },
  { id: 'fleur', realm: 'alchimie', name: 'La Première Fleur', text: 'Une graine, de l\'eau, de la lumière. La chimie la plus ancienne du monde.', hint: 'Une graine qui a soif.' },
  // Les Aurores
  { id: 'carrington', realm: 'aurores', name: 'La Tempête de Carrington', text: '1er septembre 1859 : Richard Carrington voit le Soleil s\'embraser. Le lendemain, des aurores jusqu\'aux Caraïbes, et les télégraphes crépitent tout seuls.', hint: 'Trois éruptions d\'affilée, et le ciel déborde.' },
  { id: 'sifflements', realm: 'aurores', name: "Les Chœurs de l'Aube", text: 'Sous les aurores, des antennes captent des sifflements qui descendent : la foudre, qui voyage d\'un hémisphère à l\'autre le long du champ magnétique.', hint: 'Tends l\'oreille au ciel, longtemps.' },
  { id: 'magnetosphere', realm: 'aurores', name: 'La Magnétosphère', text: 'Le vent solaire glisse sur le champ terrestre ; quelques particules spiralent jusqu\'aux pôles et font chanter l\'oxygène : vert à 557,7 nm, rouge à 630.', hint: 'Un petit globe attend dans un coin.' },
  // L'Atelier de Fourier
  { id: 'ptolemee', realm: 'fourier', name: 'Ptolémée', text: 'Un seul cercle, et c\'est déjà une orbite. Dans l\'Almageste (IIᵉ siècle), Ptolémée empile des cercles sur des cercles pour imiter le ciel : une série de Fourier avant l\'heure.', hint: 'Dessine la forme la plus simple qui soit.' },
  { id: 'gibbs', realm: 'fourier', name: 'Le Phénomène de Gibbs', text: 'Aux coins du carré, la somme de cercles déborde d\'environ 9 %, et ce dépassement ne disparaît jamais, même avec mille cercles.', hint: 'Retire des cercles à un carré.' },
  { id: 'oscilloscope', realm: 'fourier', name: 'La Voix des Formes', text: 'Gauche = x, droite = y. Branche ces deux voix sur un oscilloscope en mode XY : il redessinera ta forme. C\'est ainsi qu\'on compose la musique d\'oscilloscope.', hint: 'Une forme peut s\'écouter.' },
  // L'Envol
  { id: 'phare', realm: 'envol', name: 'Vu du Ciel', text: 'Tu as retrouvé l\'Arbre-Monde depuis les airs. De haut, ce n\'est qu\'une lueur ; c\'est pourtant de lui que tout part.', hint: 'Une lumière se lève quelque part au-dessus des terres.' },
  { id: 'tore', realm: 'envol', name: 'Le Tour du Monde', text: 'Revenu à ton point de départ sans faire demi-tour. Ce monde-ci n\'est pas une sphère mais un tore : un beignet sans bord.', hint: 'Va tout droit. Très longtemps.' },
  { id: 'rasemottes', realm: 'envol', name: 'Rase-mottes', text: 'Si bas que l\'eau t\'aurait mouillé les ailes. Les martinets dorment parfois en vol ; toi, tu frôles.', hint: 'Descends jusqu\'à frôler l\'eau.' },
  // Les Racines
  { id: 'coeur', realm: 'racines', name: 'Le Cœur du Monde', text: 'z ← z² + c. Une ligne, et une frontière infinie. Le cœur de ce monde est une équation.', hint: 'Descends tout en bas.' },
  { id: 'graine', realm: 'racines', name: "La Graine d'Or", text: 'Tu as tout trouvé. Plante-la : un autre monde poussera à partir d\'elle, différent.', hint: 'Trouve tout le reste.' },
];

const KEY = 'seve.v1';
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; }
}
const saved = load();
const found = new Set(saved.found || []);
const visited = new Set(saved.visited || []);
let worldSeed = saved.seed || 20251104;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ found: [...found], visited: [...visited], seed: worldSeed })); } catch (_) { /* stockage indisponible */ }
}

export const secrets = {
  realms: [],
  listeners: new Set(),
  setRealms(r) { this.realms = r; setBadge(this.count()); },
  all() { return SECRETS; },
  // Secrets des lieux déjà ouverts (le registre grandit avec le monde)
  available() {
    const open = new Set(this.realms.filter(r => r.ready).map(r => r.id));
    open.add('monde');
    return SECRETS.filter(s => open.has(s.realm));
  },
  has: id => found.has(id),
  count() { return this.available().filter(s => found.has(s.id)).length; },
  total() { return this.available().length; },
  find(id) {
    if (found.has(id)) return false;
    const s = SECRETS.find(x => x.id === id);
    if (!s) return false;
    found.add(id);
    save();
    toast({ title: s.name, text: s.text });
    audio.chime();
    setBadge(this.count(), true);
    for (const fn of this.listeners) fn(s);
    return true;
  },
  onFind(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  visit(id) { if (!visited.has(id)) { visited.add(id); save(); } },
  wasVisited: id => visited.has(id),
  foundIndex() { return SECRETS.filter(s => found.has(s.id)); },
  get seed() { return worldSeed; },
  reseed(s) { worldSeed = s >>> 0; save(); },
  // Tout trouvé, sauf la Graine elle-même ?
  allButSeed() { return this.available().every(s => s.id === 'graine' || found.has(s.id)); },
};
