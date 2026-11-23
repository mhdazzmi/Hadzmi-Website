// Lekat — Browser: cari dengan sintaks Anki, filter cepat, pilih banyak, edit massal.
(function (G) {
  'use strict';
  const { DB, Col, UI, Render } = G;
  const { $, $$, esc, icon } = UI;
  const st = { q: '', sort: 'added', desc: true, sel: new Set(), selecting: false, limit: 200, mode: 'cards' };
  let root = null, results = [];

  const QUICK = [['', 'Semua'], ['is:due', 'Jatuh tempo'], ['is:new', 'Baru'], ['is:learn', 'Learning'], ['is:review', 'Review'], ['is:suspended', 'Suspended'], ['is:buried', 'Buried'], ['is:leech', 'Leech'], ['added:1', 'Ditambah hari ini'], ['rated:1', 'Diulas hari ini'], ['rated:7:1', 'Lupa 7 hari'], ['flag:1', '🔴'], ['flag:2', '🟠'], ['flag:3', '🟢'], ['flag:4', '🔵']];
  const SORTS = [['added', 'Tanggal ditambah'], ['due', 'Jatuh tempo'], ['ivl', 'Interval'], ['ease', 'Ease'], ['d', 'Difficulty'], ['lapses', 'Lupa'], ['reps', 'Jumlah ulasan'], ['field', 'Field pertama (A–Z)']];

  function render(v, opts) {
    root = v;
    if (opts && opts.q != null) { st.q = opts.q; st.sel.clear(); st.selecting = false; }
    v.innerHTML = `
      <div class="navbar">
        <button type="button" class="circle-btn glass" id="brSort" aria-label="Urutkan">${icon('filter')}</button>
        <button type="button" class="btn-txt glass" id="brSelect" style="padding:8px 14px;border-radius:20px;font-weight:600">${st.selecting ? 'Selesai' : 'Pilih'}</button>
      </div>
      <h1 class="large-title">Cari</h1>
      <div class="searchbar">${icon('search')}<input id="brSearch" type="search" placeholder="deck:English tag:vocab is:due" value="${esc(st.q)}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <div class="chips" id="brChips">${QUICK.map(([q, l]) => `<button type="button" class="chip ${st.q === q ? 'on' : ''}" data-q="${esc(q)}">${l}</button>`).join('')}
        <button type="button" class="chip" id="brDecks">${icon('stack', '')} Deck</button><button type="button" class="chip" id="brTags"># Tag</button><button type="button" class="chip" id="brNotes">${st.mode === 'notes' ? 'Mode: Note' : 'Mode: Kartu'}</button></div>
      <div class="br-count" id="brCount"></div>
      <div class="list" id="brList"></div>
      <div id="brMore"></div>`;
    const inp = $('#brSearch', v);
    let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = inp.value; st.limit = 200; run(); syncChips(); }, 180); };
    $$('#brChips [data-q]', v).forEach(b => b.onclick = () => { st.q = b.dataset.q; inp.value = st.q; st.limit = 200; run(); syncChips(); });
    $('#brDecks', v).onclick = () => { const ds = Col.decks(); UI.actions(ds.map(d => ({ label: d.name, fn: () => setQ(d.filtered ? 'cid:' + (d.filtered.cids || []).join(',') : `"deck:${d.name}"`) })), 'Filter deck'); };
    $('#brTags', v).onclick = () => { const tags = [...new Set(DB.list('notes').flatMap(n => n.tags))].sort(); if (!tags.length) return UI.toast('Belum ada tag'); UI.actions(tags.map(tg => ({ label: tg, fn: () => setQ('tag:' + tg) })), 'Filter tag'); };
    $('#brNotes', v).onclick = () => { st.mode = st.mode === 'cards' ? 'notes' : 'cards'; render(v); };
    $('#brSelect', v).onclick = () => { st.selecting = !st.selecting; st.sel.clear(); render(v); };
    $('#brSort', v).onclick = () => UI.actions(SORTS.map(([k, l]) => ({ label: (st.sort === k ? (st.desc ? '↓ ' : '↑ ') : '') + l, fn: () => { if (st.sort === k) st.desc = !st.desc; else { st.sort = k; st.desc = k === 'added'; } run(); } })), 'Urutkan');
    run();
    function setQ(q) { st.q = q; inp.value = q; st.limit = 200; run(); syncChips(); }
  }
  function syncChips() { $$('#brChips [data-q]', root).forEach(b => b.classList.toggle('on', b.dataset.q === st.q)); }

  function sortVal(c, n) {
    switch (st.sort) {
      case 'due': return c.state === 'new' ? 1e9 + c.due : c.state === 'review' ? Col.dayStart(c.due) : c.due;
      case 'ivl': return c.ivl || 0; case 'ease': return c.ease || 0; case 'd': return c.d || 0;
      case 'lapses': return c.lapses || 0; case 'reps': return c.reps || 0;
      case 'field': return Render.stripHtml(Object.values(n.fields)[0] || '').trim().toLowerCase();
      default: return c.noteId * 100 + c.ord;
    }
  }
  function run() {
    let cards = Col.search(st.q);
    if (st.mode === 'notes') { const seen = new Set(); cards = cards.filter(c => seen.has(c.noteId) ? false : seen.add(c.noteId)); }
    const notes = DB.mem.notes;
    cards.sort((a, b) => { const x = sortVal(a, notes.get(a.noteId)), y = sortVal(b, notes.get(b.noteId)); const r = x < y ? -1 : x > y ? 1 : 0; return st.desc ? -r : r; });
    results = cards;
    draw();
  }
  function stateLabel(c, today) {
    if (c.suspended) return 'Suspended';
    if (Col.isBuried(c, today)) return 'Buried';
    if (c.state === 'new') return 'Baru #' + c.due;
    if (c.state === 'review') { const d = c.due - today; return d <= 0 ? (d === 0 ? 'Hari ini' : 'Telat ' + (-d) + 'h') : d + ' hari lagi'; }
    return c.state === 'relearning' ? 'Relearning' : 'Learning';
  }
  function draw() {
    const today = Col.today();
    const list = $('#brList', root);
    const shown = results.slice(0, st.limit);
    $('#brCount', root).innerHTML = `<span>${results.length} ${st.mode === 'notes' ? 'note' : 'kartu'}${st.selecting ? ` · ${st.sel.size} dipilih` : ''}</span>${st.selecting ? `<button type="button" class="btn-txt" id="brAll" style="font-size:14px">${st.sel.size === results.length && results.length ? 'Batal pilih' : 'Pilih semua'}</button>` : ''}`;
    list.innerHTML = shown.length ? shown.map(c => {
      const n = DB.mem.notes.get(c.noteId); const nt = DB.mem.notetypes.get(n.typeId);
      let q, a;
      if (nt.kind === 'cloze') { q = Render.stripHtml(Render.renderCloze(n.fields.Text || '', c.ord, 'q')); a = Render.clozeAnswers(n.fields.Text, c.ord).join(', '); }
      else if (nt.kind === 'io') { q = '🖼 ' + (Render.stripHtml(n.fields.Header) || 'Image occlusion') + ' #' + (c.ord + 1); a = ''; }
      else { const vals = nt.fields.map(f => Render.stripHtml(n.fields[f] || '').trim()).filter(Boolean); q = vals[0] || ''; a = vals.slice(1, 3).join(' · '); if (c.ord === 1 && nt.tmpls.length > 1) q = '↩ ' + q; }
      const sel = st.sel.has(c.id);
      return `<div class="br-row ${sel ? 'sel' : ''} ${c.suspended ? 'susp' : ''}" data-id="${c.id}">
        ${st.selecting ? `<div class="chk">${sel ? icon('check') : ''}</div>` : ''}
        <div class="br-main"><div class="br-q">${c.flag ? `<i class="flag-dot f${c.flag}"></i>` : ''}${esc(q)}</div><div class="br-a">${esc(a)}</div></div>
        <div class="br-meta">${esc(stateLabel(c, today))}<br>${c.ivl ? c.ivl + 'h' : ''}${n.tags.length ? ' · #' + esc(n.tags[0]) : ''}</div></div>`;
    }).join('') : `<div class="empty"><div class="big">🔍</div>Tidak ada hasil</div>`;
    $('#brMore', root).innerHTML = results.length > st.limit ? `<button type="button" class="btn secondary block" style="margin-top:12px" id="brMoreBtn">Tampilkan lebih banyak (${results.length - st.limit})</button>` : '';
    const mb = $('#brMoreBtn', root); if (mb) mb.onclick = () => { st.limit += 300; draw(); };
    const all = $('#brAll', root); if (all) all.onclick = () => { if (st.sel.size === results.length) st.sel.clear(); else results.forEach(c => st.sel.add(c.id)); draw(); };
    list.onclick = e => {
      const r = e.target.closest('.br-row'); if (!r) return;
      const id = +r.dataset.id;
      if (st.selecting) { st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); draw(); return; }
      rowMenu(DB.get('cards', id));
    };
    // tekan lama = mulai memilih
    let lp; list.onpointerdown = e => { const r = e.target.closest('.br-row'); if (!r || st.selecting) return; lp = setTimeout(() => { st.selecting = true; st.sel.add(+r.dataset.id); UI.haptic(); render(root); }, 520); };
    list.onpointerup = list.onpointerleave = list.onpointercancel = () => clearTimeout(lp);
    drawBulk();
  }
  function rowMenu(c) {
    G.Editor.editNote(c.noteId, () => run());
  }
  function drawBulk() {
    let bar = $('#bulkbar');
    if (!st.selecting || G.App.tab !== 'browse') { if (bar) bar.remove(); return; }
    if (!bar) { bar = UI.h('<div class="bulkbar glass-strong" id="bulkbar"></div>'); document.body.appendChild(bar); }
    const dis = st.sel.size ? '' : 'disabled style="opacity:.35"';
    bar.innerHTML = `
      <button type="button" data-b="deck" ${dis}>${icon('stack')}Deck</button>
      <button type="button" data-b="tag" ${dis}>${icon('tag')}Tag</button>
      <button type="button" data-b="flag" ${dis}>${icon('flag')}Flag</button>
      <button type="button" data-b="susp" ${dis}>${icon('pause')}Suspend</button>
      <button type="button" data-b="more" ${dis}>${icon('more')}Lainnya</button>
      <button type="button" data-b="del" class="danger" ${dis}>${icon('trash')}Hapus</button>`;
    bar.onclick = e => { const b = e.target.closest('[data-b]'); if (b && st.sel.size) bulk(b.dataset.b); };
  }
  // hapus bulkbar saat pindah tab
  document.addEventListener('click', e => { if (e.target.closest('#tabbar')) setTimeout(drawBulk, 0); });

  function selCards() { return [...st.sel].map(id => DB.get('cards', id)).filter(Boolean); }
  function selNotes() { return [...new Set(selCards().map(c => c.noteId))].map(id => DB.get('notes', id)).filter(Boolean); }
  async function bulk(kind) {
    const cards = selCards();
    if (kind === 'deck') G.Editor.pickDeck(null, id => { cards.forEach(c => { c.deckId = id; DB.put('cards', c); }); UI.toast(cards.length + ' kartu dipindah'); run(); });
    else if (kind === 'tag') UI.actions([
      { label: 'Tambah tag', fn: async () => { const t = await UI.prompt('Tambah tag', '', 'pisahkan spasi'); if (!t) return; const add = t.split(/\s+/).filter(Boolean); selNotes().forEach(n => { n.tags = [...new Set([...n.tags, ...add])]; DB.put('notes', n); }); UI.toast('Tag ditambah'); run(); } },
      { label: 'Hapus tag', fn: async () => { const t = await UI.prompt('Hapus tag', '', 'pisahkan spasi'); if (!t) return; const rm = new Set(t.split(/\s+/).map(x => x.toLowerCase())); selNotes().forEach(n => { n.tags = n.tags.filter(x => !rm.has(x.toLowerCase())); DB.put('notes', n); }); UI.toast('Tag dihapus'); run(); } },
      { label: 'Hapus semua tag', danger: true, fn: () => { selNotes().forEach(n => { n.tags = []; DB.put('notes', n); }); run(); } }
    ]);
    else if (kind === 'flag') UI.actions([[1, '🔴 Merah'], [2, '🟠 Oranye'], [3, '🟢 Hijau'], [4, '🔵 Biru'], [5, 'Pink'], [6, 'Toska'], [7, 'Ungu'], [0, 'Hapus flag']].map(([n, l]) => ({ label: l, fn: () => { cards.forEach(c => { c.flag = n; DB.put('cards', c); }); run(); } })));
    else if (kind === 'susp') { const all = cards.every(c => c.suspended); cards.forEach(c => { c.suspended = !all; DB.put('cards', c); }); UI.toast(all ? 'Unsuspend' : 'Suspended'); run(); }
    else if (kind === 'del') { const ns = selNotes(); if (await UI.confirm(`Hapus ${ns.length} note?`, 'Semua kartu dari note ini terhapus permanen.', 'Hapus', true)) { Col.deleteNotes(ns.map(n => n.id)); st.sel.clear(); UI.toast('Dihapus'); run(); } }
    else if (kind === 'more') UI.actions([
      { label: 'Bury sampai besok', icon: 'moon', fn: () => { const t = Col.today(); cards.forEach(c => { c.buriedDay = t; DB.put('cards', c); }); run(); } },
      { label: 'Batal bury', icon: 'eye', fn: () => { cards.forEach(c => { c.buriedDay = null; DB.put('cards', c); }); run(); } },
      { label: 'Atur jatuh tempo (Set due date)', icon: 'clock', fn: async () => {
        const v = await UI.prompt('Jatuh tempo dalam … hari', '0', 'mis. 0 = hari ini, 3-7 = acak 3 s/d 7'); if (v == null) return;
        const m = v.match(/^(\d+)(?:-(\d+))?$/); if (!m) return UI.toast('Format tidak valid');
        const a = +m[1], b = m[2] ? +m[2] : a, today = Col.today();
        cards.forEach(c => { const d = a + Math.floor(Math.random() * (b - a + 1)); if (c.state !== 'review') { c.state = 'review'; c.ivl = Math.max(1, d); c.ease = c.ease || 2.5; c.lastReview = c.lastReview || Date.now(); } c.due = today + d; DB.put('cards', c); });
        UI.toast('Jatuh tempo diatur'); run();
      } },
      { label: 'Lupakan (reset jadi kartu baru)', icon: 'reset', fn: async () => { if (await UI.confirm('Reset ' + cards.length + ' kartu?', 'Progres belajar kartu ini hilang (riwayat tetap ada).', 'Reset', true)) { cards.sort((a, b) => a.id - b.id).forEach(c => Col.resetCard(c)); run(); } } },
      { label: 'Ubah posisi kartu baru (reposition)', icon: 'stack', fn: async () => { const v = await UI.prompt('Mulai dari posisi', '0'); if (v == null) return; let p = +v || 0; cards.filter(c => c.state === 'new').sort((a, b) => a.due - b.due).forEach(c => { c.due = p++; DB.put('cards', c); }); run(); } },
      { label: 'Cari & ganti teks', icon: 'search', fn: () => findReplace(selNotes()) },
      { label: 'Buat filtered deck dari pilihan', icon: 'filter', fn: () => { const d = DB.put('decks', { id: DB.newId(), name: 'Pilihan ' + new Date().toLocaleDateString('id-ID'), filtered: { search: 'cid:' + cards.map(c => c.id).join(','), limit: cards.length, order: 'due', cids: [] }, today: {} }); Col.buildFiltered(d); UI.toast('Filtered deck dibuat'); } }
    ]);
  }
  async function findReplace(notes) {
    const r = await UI.alertBox({ title: 'Cari & ganti', msg: 'Format: cari => ganti (mendukung teks biasa)', input: true, placeholder: 'colour => color', buttons: [{ label: 'Batal' }, { label: 'Ganti', style: 'bold' }] });
    if (r.i !== 1 || !r.value.includes('=>')) return;
    const [a, b] = r.value.split('=>').map(s => s.trim());
    if (!a) return;
    let n = 0;
    notes.forEach(note => { let ch = false; for (const f in note.fields) { const v = note.fields[f].split(a).join(b); if (v !== note.fields[f]) { note.fields[f] = v; ch = true; } } if (ch) { Col.updateNote(note); n++; } });
    UI.toast(n + ' note diubah'); run();
  }

  G.Browse = { render };
})(window);
