// Sève — interface autour du canvas : notifications, carte de titre, carnet.

const $ = id => document.getElementById(id);

export function toast({ kicker = 'Secret trouvé', title = '', text = '', ms = 7000 } = {}) {
  const box = $('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const k = document.createElement('p'); k.className = 'k'; k.textContent = '✦ ' + kicker;
  const t = document.createElement('p'); t.className = 't'; t.textContent = title;
  el.append(k, t);
  if (text) { const d = document.createElement('p'); d.className = 'd'; d.textContent = text; el.append(d); }
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 900); }, ms + 5000); // le temps de lire, et de rêver un peu
}

export function setBadge(n, pop = false) {
  const b = $('secret-count');
  if (!b) return;
  b.textContent = n;
  if (pop) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
}

let tcTimer = 0;
export function titleCard(meta, { hold = 4200 } = {}) {
  const card = $('title-card');
  $('tc-kicker').textContent = meta.kicker || '';
  $('tc-title').textContent = meta.title || '';
  $('tc-sub').textContent = meta.sub || '';
  const hint = $('tc-hint');
  hint.textContent = '';
  (meta.hint || []).forEach((h, i) => {
    if (i) hint.append(document.createElement('br'));
    const [verb, rest] = h.split(' · ');
    const b = document.createElement('b'); b.textContent = verb;
    hint.append(b);
    if (rest) hint.append(' · ' + rest);
  });
  card.classList.add('show');
  clearTimeout(tcTimer);
  tcTimer = setTimeout(() => card.classList.remove('show'), hold);
}
export function hideTitleCard() { clearTimeout(tcTimer); $('title-card').classList.remove('show'); }

export function setRealmLabel(text) { const el = $('realm-label'); if (el) el.textContent = text; }

// Carnet de voyage : un souvenir en image de chaque lieu visité, ses secrets trouvés, et des indices pour les autres
export function renderCarnet({ realms, secrets, onGo, lockedText = 'scellé', souvenirs = {} }) {
  const list = $('carnet-list');
  list.textContent = '';
  const ready = realms.filter(r => r.ready);
  const groups = [{ id: 'monde', title: 'Partout', kicker: 'Dans tout le monde', color: '#efe9ff', ready: true }, ...realms];
  let total = 0, got = 0;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  for (const g of groups) {
    const items = secrets.all().filter(s => s.realm === g.id);
    if (!g.ready && !items.length) continue;
    const visited = g.id === 'monde' || secrets.wasVisited(g.id);
    const block = el('section', 'realm-block');
    block.style.setProperty('--c', g.color);
    const card = el('div', 'realm-card');
    // la vignette : la photo du lieu, prise à ta dernière visite ; sinon un cadre qui attend
    const canGo = g.id !== 'monde' && g.ready && !g.locked;
    const thumb = el(canGo ? 'button' : 'div', 'thumb');
    if (canGo) {
      thumb.type = 'button';
      thumb.setAttribute('aria-label', (visited ? 'Retourner à ' : 'Découvrir ') + g.title);
      thumb.addEventListener('click', () => onGo(g.id));
    }
    const src = souvenirs[g.id];
    if (g.id === 'monde') { thumb.classList.add('emblem'); thumb.setAttribute('aria-hidden', 'true'); thumb.append(el('span', '', '✦')); }
    else if (g.locked) { thumb.classList.add('sealed'); thumb.append(el('span', '', 'scellé')); }
    else if (src) { const img = el('img'); img.src = src; img.alt = 'Souvenir : ' + g.title; img.decoding = 'async'; thumb.append(img); }
    else { thumb.classList.add(visited ? 'pale' : 'empty'); thumb.append(el('span', '', visited ? '' : '?')); }
    const meta = el('div', 'realm-meta');
    const found = items.filter(s => secrets.has(s.id)).length;
    meta.append(el('p', 'rk', g.kicker || ''));
    meta.append(el('h3', '', g.title));
    const line = el('p', 'rs', items.length ? `${found} / ${items.length} secret${items.length > 1 ? 's' : ''}` : '');
    meta.append(line);
    if (g.id !== 'monde') {
      if (g.locked) meta.append(el('span', 'soon', lockedText));
      else if (g.ready) {
        const go = el('button', 'go', visited ? 'Y retourner' : 'Découvrir');
        go.type = 'button';
        go.addEventListener('click', () => onGo(g.id));
        meta.append(go);
      } else meta.append(el('span', 'soon', 'pas encore mûr'));
    }
    card.append(thumb, meta);
    block.append(card);
    if (g.ready) {
      for (const s of items) {
        total++;
        const isFound = secrets.has(s.id);
        if (isFound) got++;
        const row = el('div', 'secret' + (isFound ? ' found' : ''));
        const body = el('div');
        body.append(el('p', 'n', isFound ? s.name : '???'), el('p', 'x', isFound ? s.text : s.hint));
        row.append(el('span', 's', isFound ? '✦' : '✧'), body);
        block.append(row);
      }
    }
    list.append(block);
  }
  const seen = ready.filter(r => secrets.wasVisited(r.id)).length;
  $('carnet-stats').textContent = `✦ ${got} / ${total} secrets · ${seen} / ${ready.length} lieux visités`;
  const bar = $('carnet-progress');
  if (bar) bar.style.setProperty('--k', total ? (got / total).toFixed(3) : 0);
}
