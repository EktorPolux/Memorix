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

// Carnet de voyage : lieux visités, secrets trouvés, et indices pour les autres
export function renderCarnet({ realms, secrets, onGo, lockedText = 'scellé' }) {
  const list = $('carnet-list');
  list.textContent = '';
  const ready = realms.filter(r => r.ready);
  const groups = [{ id: 'monde', title: 'Partout', color: '#efe9ff', ready: true }, ...realms];
  let total = 0, got = 0;
  for (const g of groups) {
    const items = secrets.all().filter(s => s.realm === g.id);
    if (!g.ready && !items.length) continue;
    const block = document.createElement('section');
    block.className = 'realm-block';
    const head = document.createElement('div');
    head.className = 'realm-head';
    const h = document.createElement('h3');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = g.color;
    h.append(dot, g.title);
    head.append(h);
    if (g.id !== 'monde') {
      if (g.locked) {
        const s = document.createElement('span');
        s.className = 'soon';
        s.textContent = lockedText;
        head.append(s);
      } else if (g.ready) {
        const go = document.createElement('button');
        go.className = 'go';
        go.type = 'button';
        go.textContent = secrets.wasVisited(g.id) ? 'Y retourner' : 'Découvrir';
        go.addEventListener('click', () => onGo(g.id));
        head.append(go);
      } else {
        const s = document.createElement('span');
        s.className = 'soon';
        s.textContent = 'pas encore mûr';
        head.append(s);
      }
    }
    block.append(head);
    if (g.ready) {
      for (const s of items) {
        total++;
        const found = secrets.has(s.id);
        if (found) got++;
        const row = document.createElement('div');
        row.className = 'secret' + (found ? ' found' : '');
        const star = document.createElement('span'); star.className = 's'; star.textContent = found ? '✦' : '✧';
        const body = document.createElement('div');
        const n = document.createElement('p'); n.className = 'n'; n.textContent = found ? s.name : '???';
        const x = document.createElement('p'); x.className = 'x'; x.textContent = found ? s.text : s.hint;
        body.append(n, x);
        row.append(star, body);
        block.append(row);
      }
    }
    list.append(block);
  }
  const seen = ready.filter(r => secrets.wasVisited(r.id)).length;
  $('carnet-stats').textContent = `✦ ${got} / ${total} secrets · ${seen} / ${ready.length} lieux visités`;
}
