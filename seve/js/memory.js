// Sève — la mémoire des tableaux. Chacun range un petit souvenir (un objet simple) qui l'attend au retour,
// même après avoir fermé la page. Rien ne quitte ton appareil.

const PREFIX = 'seve.souvenir.';

export const memory = {
  get(id) {
    try { return JSON.parse(localStorage.getItem(PREFIX + id)) ?? null; } catch (_) { return null; }
  },
  set(id, value) {
    try {
      if (value == null) localStorage.removeItem(PREFIX + id);
      else localStorage.setItem(PREFIX + id, JSON.stringify(value));
    } catch (_) { /* stockage plein ou indisponible : le tableau oubliera, voilà tout */ }
  },
};

// Petits outils pour ranger des grilles sans gaspiller : des octets en base64, et des suites répétées compressées
export function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
// [valeur, longueur] répétés : une grille de sable ou de cellules tient alors en quelques kilo-octets
export function rle(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 65535) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}
export function unrle(runs, into) {
  let k = 0;
  for (let i = 0; i < runs.length && k < into.length; i += 2) for (let n = 0; n < runs[i + 1] && k < into.length; n++) into[k++] = runs[i];
  return into;
}
