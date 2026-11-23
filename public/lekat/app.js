// Lekat — aplikasi utama: tab, daftar deck, opsi deck (preset), filtered deck, setelan, note type.
(function (G) {
  'use strict';
  const { DB, Col, UI, Sched } = G;
  const { $, $$, esc, icon } = UI;

  const TABS = [['decks', 'stack', 'Deck'], ['add', 'plus', 'Tambah'], ['browse', 'search', 'Cari'], ['stats', 'chart', 'Statistik'], ['settings', 'gear', 'Setelan']];
  const App = { tab: 'decks', collapsed: new Set() };

  // ---------- Tema ----------
  function applyTheme() {
    const t = DB.meta('theme') || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- Tab ----------
  function initTabs() {
    $$('#tabbar button').forEach(b => {
      const t = TABS.find(x => x[0] === b.dataset.tab);
      b.innerHTML = icon(t[1]) + `<span>${t[2]}</span>`;
      b.onclick = () => go(t[0]);
    });
  }
  function go(tab, opts) {
    App.tab = tab;
    $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + tab));
    try { localStorage.setItem('lekat.tab', tab); } catch (e) {}
    render(tab, opts);
    window.scrollTo(0, 0);
  }
  function render(tab, opts) {
    if (tab === 'decks') renderDecks();
    else if (tab === 'add') G.Editor.renderAddView($('#v-add'), opts);
    else if (tab === 'browse') G.Browse.render($('#v-browse'), opts);
    else if (tab === 'stats') G.Stats.render($('#v-stats'));
    else if (tab === 'settings') renderSettings();
  }
  App.go = go; App.refresh = () => render(App.tab);

  // ---------- Streak ----------
  function streak() {
    const days = new Set(DB.list('revlog').map(r => Col.dayOf(r.id)));
    let d = Col.today(), n = 0;
    if (!days.has(d)) d--;
    while (days.has(d)) { n++; d--; }
    return { n, todayDone: days.has(Col.today()) };
  }

  // ---------- Daftar deck ----------
  function deckTree() {
    const decks = Col.decks();
    const nodes = decks.map(d => ({ d, depth: d.filtered ? 0 : d.name.split('::').length - 1, parent: d.filtered ? null : d.name.split('::').slice(0, -1).join('::') }));
    return nodes;
  }
  function renderDecks() {
    const v = $('#v-decks');
    const today = Col.today();
    const tops = Col.decks().filter(d => !d.filtered && !d.name.includes('::'));
    let total = { n: 0, l: 0, r: 0 };
    for (const d of tops) { const c = Col.counts(d); total.n += c.n; total.l += c.l; total.r += c.r; }
    const due = total.n + total.l + total.r;
    const st = streak();
    const todayLogs = DB.list('revlog').filter(r => Col.dayOf(r.id) === today);
    const mins = Math.round(todayLogs.reduce((a, r) => a + (r.time || 0), 0) / 60000);
    const nodes = deckTree();
    const hasChildren = (name) => nodes.some(n => n.parent && n.parent.toLowerCase() === name.toLowerCase());
    const isHidden = (n) => {
      if (n.d.filtered) return false;
      const parts = n.d.name.split('::');
      for (let i = 1; i < parts.length; i++) if (App.collapsed.has(parts.slice(0, i).join('::').toLowerCase())) return true;
      return false;
    };
    const rows = nodes.filter(n => !isHidden(n)).map(n => {
      const c = Col.counts(n.d);
      const name = n.d.filtered ? n.d.name : n.d.name.split('::').pop();
      const kids = !n.d.filtered && hasChildren(n.d.name);
      const closed = App.collapsed.has(n.d.name.toLowerCase());
      const num = (x, cls) => `<span class="${x ? cls : 'zero'}">${x}</span>`;
      return `<div class="deck-row" data-id="${n.d.id}" style="padding-left:${8 + n.depth * 18}px" role="button" tabindex="0">
        <button type="button" class="deck-tog ${kids ? (closed ? 'closed' : '') : 'none'}" data-tog="${esc(n.d.name)}" aria-label="Buka/tutup sub-deck">${icon('chevD')}</button>
        <div class="deck-name">${esc(name)}${n.d.filtered ? '<small class="filt">Filtered deck</small>' : ''}</div>
        <div class="counts">${num(c.n, 'c-new')}${num(c.l, 'c-lrn')}${num(c.r, 'c-rev')}</div>
        <button type="button" class="deck-more" data-more="${n.d.id}" aria-label="Opsi deck">${icon('more')}</button></div>`;
    }).join('');
    v.innerHTML = `
      <div class="navbar">
        <button type="button" class="circle-btn glass" id="dkImport" aria-label="Impor">${icon('download')}</button>
        <button type="button" class="circle-btn glass" id="dkAdd" aria-label="Deck baru">${icon('plus')}</button>
      </div>
      <h1 class="large-title">Lekat</h1>
      <div class="hero">
        <div class="hero-top">
          <div><div class="hero-num">${due}</div><div class="hero-lbl">${due ? 'kartu menunggu hari ini' : 'Semua beres untuk hari ini 🎉'}</div></div>
          <div class="counts hero-counts">${`<span class="c-new">${total.n}</span><span class="c-lrn">${total.l}</span><span class="c-rev">${total.r}</span>`}</div>
        </div>
        <div class="hero-stats">
          <div class="hero-chip">${icon('flame')} ${st.n} hari beruntun</div>
          <div class="hero-chip">${icon('check')} ${todayLogs.length} ulasan</div>
          <div class="hero-chip">${icon('clock')} ${mins} menit</div>
        </div>
        ${tops.length ? `<button type="button" class="btn" id="studyAll">${icon('play')} Belajar ${tops.length === 1 ? esc(tops[0].name) : 'semua deck'}</button>` : ''}
      </div>
      <div class="section-h"><span>Deck</span><span><span class="c-new">Baru</span> · <span class="c-lrn">Belajar</span> · <span class="c-rev">Ulas</span></span></div>
      <div class="list">${rows || '<div class="empty">Belum ada deck</div>'}</div>
      ${!DB.meta('starterInstalled') ? `<div class="section-h"><span>Mulai cepat</span></div><div class="list"><button type="button" class="row" id="installStarter"><div class="row-ico" style="background:var(--tint)">${icon('book')}</div><div class="grow"><div class="t1">Pasang deck contoh English</div><div class="t2">50 kosakata, phrasal verbs, grammar cloze, listening</div></div>${icon('chevR', 'chev')}</button></div>` : ''}
      <p class="section-f">Ketuk deck untuk mulai. Tekan ••• untuk opsi, ganti nama, sub-deck, atau ekspor.</p>`;
    v.querySelectorAll('.deck-row').forEach(r => {
      r.onclick = (e) => {
        const tog = e.target.closest('[data-tog]'), more = e.target.closest('[data-more]');
        if (tog) { e.stopPropagation(); const k = tog.dataset.tog.toLowerCase(); App.collapsed.has(k) ? App.collapsed.delete(k) : App.collapsed.add(k); saveCollapsed(); renderDecks(); return; }
        if (more) { e.stopPropagation(); deckMenu(DB.get('decks', +more.dataset.more)); return; }
        deckOverview(DB.get('decks', +r.dataset.id));
      };
      r.onkeydown = e => { if (e.key === 'Enter') r.click(); };
    });
    const sa = $('#studyAll');
    if (sa) sa.onclick = () => {
      if (tops.length === 1) return G.Review.start(tops[0]);
      // belajar semua: pakai deck virtual? gunakan deck teratas yang masih ada kartunya
      const first = tops.find(d => { const c = Col.counts(d); return c.n + c.l + c.r > 0; });
      if (!first) return UI.toast('Tidak ada kartu jatuh tempo');
      G.Review.start(first, { chain: tops.map(d => d.id) });
    };
    $('#dkAdd').onclick = () => UI.actions([
      { label: 'Deck baru', icon: 'stack', fn: newDeck },
      { label: 'Filtered deck / Custom study', icon: 'filter', fn: () => filteredDeckDialog() },
      { label: 'Tambah kartu', icon: 'plus', fn: () => go('add') }
    ]);
    $('#dkImport').onclick = () => G.IO.importMenu();
    const ins = $('#installStarter');
    if (ins) ins.onclick = () => { G.Starter.installStarter(); UI.toast('Deck English dipasang'); renderDecks(); };
  }
  function saveCollapsed() { DB.meta('collapsed', [...App.collapsed]); }
  async function newDeck(parent) {
    const name = await UI.prompt('Deck baru', parent ? parent + '::' : '', 'Contoh: English::Vocabulary', 'Pakai :: untuk membuat sub-deck');
    if (!name || !name.trim()) return;
    Col.deckByName(name, true); renderDecks(); UI.toast('Deck dibuat');
  }
  App.newDeck = newDeck;

  function deckMenu(deck) {
    const items = deck.filtered ? [
      { label: 'Bangun ulang (Rebuild)', icon: 'reset', fn: () => { const n = Col.buildFiltered(deck); UI.toast(n + ' kartu ditarik'); renderDecks(); } },
      { label: 'Ubah filter', icon: 'filter', fn: () => filteredDeckDialog(deck) },
      { label: 'Kosongkan & hapus', icon: 'trash', danger: true, fn: async () => { if (await UI.confirm('Hapus filtered deck?', 'Kartu kembali ke deck asalnya.', 'Hapus', true)) { Col.deleteDeck(deck.id); renderDecks(); } } }
    ] : [
      { label: 'Opsi deck', icon: 'gear', fn: () => deckOptions(deck) },
      { label: 'Ganti nama', icon: 'edit', fn: async () => { const n = await UI.prompt('Ganti nama deck', deck.name); if (n) { Col.renameDeck(deck.id, n); renderDecks(); } } },
      { label: 'Sub-deck baru', icon: 'folder', fn: () => newDeck(deck.name) },
      { label: 'Cari kartu di deck ini', icon: 'search', fn: () => go('browse', { q: `"deck:${deck.name}"` }) },
      { label: 'Ekspor deck', icon: 'upload', fn: () => G.IO.exportDeck(deck) },
      { label: 'Hapus deck', icon: 'trash', danger: true, fn: async () => {
        const n = DB.list('cards').filter(c => Col.subtreeIds(deck.id).includes(c.deckId)).length;
        if (await UI.confirm('Hapus "' + deck.name + '"?', `${n} kartu (termasuk sub-deck) akan terhapus permanen.`, 'Hapus', true)) { Col.deleteDeck(deck.id); renderDecks(); UI.toast('Deck dihapus'); }
      } }
    ];
    UI.actions(items, deck.name);
  }
  App.deckMenu = deckMenu;

  // ---------- Ringkasan deck ----------
  function deckOverview(deck) {
    const c = Col.counts(deck);
    const p = Col.preset(deck);
    const cards = Col.studyCards(deck);
    const today = Col.today();
    const total = cards.length, susp = cards.filter(x => x.suspended).length, buried = cards.filter(x => Col.isBuried(x, today)).length;
    const nw = cards.filter(x => x.state === 'new').length;
    const mature = cards.filter(x => x.state === 'review' && x.ivl >= 21).length;
    const sh = UI.sheet({ title: deck.filtered ? deck.name : deck.name.split('::').pop(), right: `<button type="button" class="btn-txt" id="ovMore">${icon('more')}</button>`, body: `
      <div style="text-align:center;margin:8px 0 18px">
        <div class="muted" style="font-size:13px">${esc(deck.name)}</div>
        ${deck.desc ? `<div style="margin-top:6px;font-size:15px">${esc(deck.desc)}</div>` : ''}
      </div>
      <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
        <div class="tile" style="text-align:center"><div class="v c-new">${c.n}</div><div class="k" style="justify-content:center">Baru</div></div>
        <div class="tile" style="text-align:center"><div class="v c-lrn">${c.l}</div><div class="k" style="justify-content:center">Belajar</div></div>
        <div class="tile" style="text-align:center"><div class="v c-rev">${c.r}</div><div class="k" style="justify-content:center">Ulas</div></div>
      </div>
      <button type="button" class="btn primary block" id="ovStudy" style="margin-top:18px">${icon('play')} Belajar Sekarang</button>
      <div class="section-h"><span>Isi deck</span></div>
      <div class="list">
        <div class="row"><div class="grow">Total kartu</div><div class="detail">${total}</div></div>
        <div class="row"><div class="grow">Belum dipelajari</div><div class="detail">${nw}</div></div>
        <div class="row"><div class="grow">Matang (interval ≥ 21 hari)</div><div class="detail">${mature}</div></div>
        <div class="row"><div class="grow">Ditangguhkan (suspended)</div><div class="detail">${susp}</div></div>
        <div class="row"><div class="grow">Dikubur hari ini (buried)</div><div class="detail">${buried}</div></div>
        ${!deck.filtered ? `<div class="row"><div class="grow">Preset</div><div class="detail">${esc(p.name)} · ${p.algorithm === 'fsrs' ? 'FSRS ' + Math.round(p.retention * 100) + '%' : 'SM-2'}</div></div>` : ''}
      </div>
      <div class="section-h"><span>Aksi</span></div>
      <div class="list">
        ${!deck.filtered ? `<button type="button" class="row ind" id="ovOpts"><div class="row-ico" style="background:#8E8E93">${icon('gear')}</div><div class="grow">Opsi deck</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="ovCustom"><div class="row-ico" style="background:var(--purple)">${icon('filter')}</div><div class="grow">Custom study</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="ovAdd"><div class="row-ico" style="background:var(--green)">${icon('plus')}</div><div class="grow">Tambah kartu ke deck ini</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="ovDesc"><div class="row-ico" style="background:var(--orange)">${icon('edit')}</div><div class="grow">Deskripsi</div>${icon('chevR', 'chev')}</button>` :
        `<button type="button" class="row ind" id="ovRebuild"><div class="row-ico" style="background:var(--purple)">${icon('reset')}</div><div class="grow">Bangun ulang</div></button>`}
        ${buried ? `<button type="button" class="row ind" id="ovUnbury"><div class="row-ico" style="background:var(--teal)">${icon('eye')}</div><div class="grow">Batal kubur (unbury)</div></button>` : ''}
      </div>` });
    const b = sh.body;
    $('#ovStudy', b).onclick = () => { sh.close(); G.Review.start(deck); };
    $('#ovMore', sh.el).onclick = () => deckMenu(deck);
    const on = (id, fn) => { const e = $(id, b); if (e) e.onclick = fn; };
    on('#ovOpts', () => deckOptions(deck));
    on('#ovCustom', () => customStudy(deck, sh));
    on('#ovAdd', () => { sh.close(); go('add', { deckId: deck.id }); });
    on('#ovDesc', async () => { const r = await UI.alertBox({ title: 'Deskripsi deck', input: true, multiline: true, value: deck.desc || '', buttons: [{ label: 'Batal' }, { label: 'Simpan', style: 'bold' }] }); if (r.i === 1) { deck.desc = r.value; DB.put('decks', deck); sh.close(); deckOverview(deck); } });
    on('#ovRebuild', () => { Col.buildFiltered(deck); sh.close(); deckOverview(deck); renderDecks(); });
    on('#ovUnbury', () => { for (const x of cards) if (x.buriedDay != null) { x.buriedDay = null; DB.put('cards', x); } sh.close(); deckOverview(deck); renderDecks(); });
  }
  App.deckOverview = deckOverview;

  // ---------- Custom study (seperti Anki) ----------
  function customStudy(deck, parentSheet) {
    const q = `"deck:${deck.name}"`;
    UI.actions([
      { label: 'Tambah kuota kartu baru hari ini', icon: 'plus', fn: async () => {
        const n = await UI.prompt('Tambah kartu baru hari ini', '10', 'jumlah'); if (!n) return;
        const c = Col.counter(deck, Col.today()); c.newDone -= (+n || 0); DB.put('decks', deck); parentSheet && parentSheet.close(); renderDecks(); UI.toast('Kuota kartu baru ditambah ' + n);
      } },
      { label: 'Tambah kuota ulasan hari ini', icon: 'reset', fn: async () => {
        const n = await UI.prompt('Tambah ulasan hari ini', '50', 'jumlah'); if (!n) return;
        const c = Col.counter(deck, Col.today()); c.revDone -= (+n || 0); DB.put('decks', deck); parentSheet && parentSheet.close(); renderDecks(); UI.toast('Kuota ulasan ditambah ' + n);
      } },
      { label: 'Ulang kartu yang lupa (7 hari)', icon: 'undo', fn: () => makeFiltered('Lupa 7 hari', `${q} rated:7:1`, 100, 'random') },
      { label: 'Belajar lebih awal (review ahead)', icon: 'clock', fn: () => makeFiltered('Lebih awal', `${q} is:review prop:due<=7 -is:due`, 100, 'due') },
      { label: 'Kartu paling sulit (sering lupa)', icon: 'flame', fn: () => makeFiltered('Kartu sulit', `${q} prop:lapses>=2`, 50, 'lapses') },
      { label: 'Pratinjau kartu baru', icon: 'eye', fn: () => makeFiltered('Pratinjau baru', `${q} is:new`, 30, 'added') },
      { label: 'Filter kustom…', icon: 'filter', fn: () => filteredDeckDialog(null, { search: `${q} is:due` }) }
    ], 'Custom study — ' + deck.name);
    function makeFiltered(name, search, limit, order) {
      const d = DB.put('decks', { id: DB.newId(), name: 'Custom: ' + name, filtered: { search, limit, order, cids: [] }, today: {} });
      const n = Col.buildFiltered(d);
      parentSheet && parentSheet.close();
      if (!n) { Col.deleteDeck(d.id); UI.toast('Tidak ada kartu yang cocok'); renderDecks(); return; }
      renderDecks(); G.Review.start(d);
    }
  }

  // ---------- Filtered deck ----------
  function filteredDeckDialog(deck, preset) {
    const f = deck ? deck.filtered : Object.assign({ search: 'is:due', limit: 100, order: 'due' }, preset || {});
    const sh = UI.sheet({ title: deck ? 'Ubah filtered deck' : 'Filtered deck', right: `<button type="button" class="btn-txt bold" id="fdSave">${deck ? 'Simpan' : 'Buat'}</button>`, body: `
      <div class="section-h"><span>Nama</span></div>
      <div class="list"><div class="row"><input id="fdName" style="text-align:left;width:100%;color:var(--label)" value="${esc(deck ? deck.name : 'Filtered Deck ' + (DB.list('decks').filter(d => d.filtered).length + 1))}"></div></div>
      <div class="section-h"><span>Pencarian</span></div>
      <div class="list"><div class="row"><input id="fdSearch" style="text-align:left;width:100%;color:var(--label);font-family:var(--mono);font-size:15px" value="${esc(f.search)}"></div>
        <div class="row"><div class="grow">Batas kartu</div><input id="fdLimit" type="number" min="1" value="${f.limit}"></div>
        <div class="row"><div class="grow">Urutan</div><select id="fdOrder">${[['due', 'Jatuh tempo'], ['random', 'Acak'], ['lapses', 'Paling sering lupa'], ['retr', 'Retrievability terendah'], ['added', 'Terbaru ditambah']].map(([v, l]) => `<option value="${v}" ${f.order === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <p class="section-f">Contoh: <kbd>deck:English* is:due</kbd>, <kbd>tag:vocab rated:3:1</kbd>, <kbd>prop:lapses&gt;3</kbd>, <kbd>flag:1</kbd>, <kbd>is:new added:7</kbd>. Kartu ditarik sementara; jadwalnya tetap diperbarui sesuai jawabanmu dan kembali ke deck asal setelah lulus.</p>` });
    $('#fdSave', sh.el).onclick = () => {
      const data = { search: $('#fdSearch', sh.body).value, limit: +$('#fdLimit', sh.body).value || 100, order: $('#fdOrder', sh.body).value, cids: [] };
      const name = $('#fdName', sh.body).value.trim() || 'Filtered Deck';
      const d = deck || { id: DB.newId(), today: {} };
      d.name = name; d.filtered = data; DB.put('decks', d);
      const n = Col.buildFiltered(d);
      sh.close(); renderDecks(); UI.toast(n + ' kartu ditarik ke "' + name + '"');
    };
  }
  App.filteredDeckDialog = filteredDeckDialog;

  // ---------- Opsi deck (preset) ----------
  function deckOptions(deck) {
    let p = Object.assign({}, Col.DEFAULT_PRESET, DB.get('presets', deck.presetId) || DB.get('presets', 1));
    const presets = DB.list('presets');
    const usedBy = (pid) => DB.list('decks').filter(d => !d.filtered && d.presetId === pid).length;
    const steps = a => (a || []).map(m => m >= 1440 ? (m / 1440) + 'd' : m >= 60 && m % 60 === 0 ? (m / 60) + 'h' : m + 'm').join(' ');
    const parseSteps = s => s.split(/[\s,]+/).filter(Boolean).map(x => { const m = x.match(/^([\d.]+)\s*([smhd]?)$/i); if (!m) return null; const n = +m[1]; const u = (m[2] || 'm').toLowerCase(); return u === 's' ? n / 60 : u === 'h' ? n * 60 : u === 'd' ? n * 1440 : n; }).filter(x => x != null && x > 0);
    const numRow = (k, label, val, step, extra) => `<div class="row"><div class="grow">${label}${extra ? `<div class="t2">${extra}</div>` : ''}</div><input type="number" name="${k}" value="${val}" step="${step || 1}" inputmode="decimal"></div>`;
    const sel = (k, label, opts, val) => `<div class="row"><div class="grow">${label}</div><select name="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    const swRow = (k, label, on, sub) => `<div class="row"><div class="grow">${label}${sub ? `<div class="t2">${sub}</div>` : ''}</div>${UI.sw(k, on)}</div>`;
    const sh = UI.sheet({ title: 'Opsi Deck', full: true, right: `<button type="button" class="btn-txt bold" id="optSave">Simpan</button>`, body: '<div id="optBody"></div>' });
    const body = $('#optBody', sh.body);
    function draw() {
      body.innerHTML = `
      <p class="section-f" style="margin:0 4px 10px;text-align:center">${esc(deck.name)}</p>
      <div class="section-h"><span>Preset</span><span>${usedBy(p.id)} deck memakai</span></div>
      <div class="list">
        <div class="row"><div class="grow">Preset</div><select id="presetSel">${presets.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <button type="button" class="row tint" id="presetMore">Kelola preset (tambah / ganti nama / salin / hapus)</button>
      </div>
      <div class="section-h"><span>Batas harian</span></div>
      <div class="list">
        ${numRow('newPerDay', 'Kartu baru / hari', p.newPerDay)}
        ${numRow('revPerDay', 'Ulasan maksimum / hari', p.revPerDay)}
        ${swRow('newIgnoreReviewLimit', 'Kartu baru abaikan batas ulasan', p.newIgnoreReviewLimit)}
      </div>
      <p class="section-f">Untuk bahasa Inggris, 10–20 kata baru/hari biasanya menghasilkan ±100–200 ulasan/hari setelah sebulan.</p>
      <div class="section-h"><span>Kartu baru & learning</span></div>
      <div class="list">
        <div class="row"><div class="grow">Learning steps</div><input name="learnSteps" value="${steps(p.learnSteps)}" style="width:140px"></div>
        ${p.algorithm === 'sm2' ? numRow('gradIvl', 'Graduating interval (hari)', p.gradIvl) + numRow('easyIvl', 'Easy interval (hari)', p.easyIvl) : ''}
        ${sel('newOrder', 'Urutan kartu baru', [['sequential', 'Urut ditambah'], ['random', 'Acak']], p.newOrder)}
      </div>
      <div class="section-h"><span>Lupa (lapses)</span></div>
      <div class="list">
        <div class="row"><div class="grow">Relearning steps</div><input name="relearnSteps" value="${steps(p.relearnSteps)}" style="width:140px"></div>
        ${p.algorithm === 'sm2' ? numRow('lapseNewIvl', 'Interval baru setelah lupa (×)', p.lapseNewIvl, 0.05) + numRow('minLapseIvl', 'Interval minimum (hari)', p.minLapseIvl) : ''}
        ${numRow('leechThreshold', 'Ambang leech', p.leechThreshold, 1, 'Kartu ditandai "leech" setelah lupa sebanyak ini')}
        ${sel('leechAction', 'Aksi leech', [['tag', 'Tandai saja'], ['suspend', 'Tandai + suspend']], p.leechAction)}
      </div>
      <div class="section-h"><span>Urutan tampil</span></div>
      <div class="list">
        ${sel('mixOrder', 'Kartu baru vs ulasan', [['mix', 'Campur'], ['newFirst', 'Baru dulu'], ['reviewFirst', 'Ulasan dulu']], p.mixOrder)}
        ${sel('reviewOrder', 'Urutan ulasan', [['due', 'Jatuh tempo'], ['random', 'Acak'], ['retrievability', 'Retrievability terendah']], p.reviewOrder)}
      </div>
      <div class="section-h"><span>Bury (kubur sibling)</span></div>
      <div class="list">
        ${swRow('buryNew', 'Kubur sibling kartu baru', p.buryNew, 'Kartu lain dari note yang sama ditunda ke besok')}
        ${swRow('buryReview', 'Kubur sibling kartu ulasan', p.buryReview)}
      </div>
      <div class="section-h"><span>Penjadwal</span></div>
      <div class="list">
        <div class="row"><div class="grow">Algoritma</div>${UI.seg('algorithm', [['fsrs', 'FSRS'], ['sm2', 'SM-2']], p.algorithm)}</div>
        ${p.algorithm === 'fsrs' ? `
        <div class="row" style="flex-wrap:wrap"><div class="grow">Desired retention</div><div class="detail" id="retVal">${Math.round(p.retention * 100)}%</div>
          <input type="range" class="slider" name="retention" min="0.70" max="0.97" step="0.01" value="${p.retention}" style="flex-basis:100%"></div>
        <div class="row" style="display:block"><div class="t2" id="retHint"></div></div>
        <div class="row" style="display:block"><div class="t2" style="margin-bottom:6px">Parameter FSRS (19 angka, kosong = default)</div>
          <textarea name="w" class="code" style="min-height:70px;box-shadow:none;background:var(--fill)">${p.w ? p.w.join(', ') : ''}</textarea></div>
        <button type="button" class="row tint" id="fsrsOpt">${icon('sparkle')} Optimalkan parameter dari riwayatmu</button>
        <div class="row hidden" id="optProg" style="display:block"><div class="prog"><i></i></div><div class="t2" id="optMsg" style="margin-top:6px"></div></div>
        <button type="button" class="row tint" id="fsrsEval">Evaluasi (log loss)</button>
        <button type="button" class="row tint" id="fsrsReset">Kembalikan parameter default</button>
        ` : `
        ${numRow('startEase', 'Starting ease', p.startEase, 0.05)}
        ${numRow('easyBonus', 'Easy bonus', p.easyBonus, 0.05)}
        ${numRow('hardIvl', 'Hard interval (×)', p.hardIvl, 0.05)}
        ${numRow('ivlMod', 'Interval modifier', p.ivlMod, 0.05)}`}
        ${numRow('maxIvl', 'Interval maksimum (hari)', p.maxIvl)}
        ${swRow('fuzz', 'Fuzz factor', p.fuzz, 'Acak sedikit interval agar ulasan tidak menumpuk di satu hari')}
      </div>
      <div class="section-h"><span>Audio & tampilan</span></div>
      <div class="list">
        ${swRow('autoplay', 'Putar audio otomatis', p.autoplay, 'TTS & [sound:] diputar saat kartu muncul')}
        ${numRow('ttsRate', 'Kecepatan suara TTS', p.ttsRate, 0.05)}
        ${swRow('showIntervals', 'Tampilkan interval di tombol', p.showIntervals)}
        ${swRow('showTimer', 'Tampilkan timer', p.showTimer)}
      </div>
      ${p.id !== 1 || presets.length > 1 ? '' : ''}
      <p class="section-f">Preset dibagikan ke semua deck yang memakainya — persis seperti Deck Options di Anki.</p>`;
      UI.bindSeg(body, (name, val) => { collect(); p[name] = val; draw(); });
      $('#presetSel', body).onchange = (e) => { collect(); p = Object.assign({}, Col.DEFAULT_PRESET, DB.get('presets', +e.target.value)); draw(); };
      $('#presetMore', body).onclick = presetMenu;
      const ret = body.querySelector('[name=retention]');
      if (ret) {
        const upd = () => { $('#retVal', body).textContent = Math.round(ret.value * 100) + '%'; const S = 10; const i = Sched.fsrs.interval(S, +ret.value); $('#retHint', body).textContent = `Kartu dengan stabilitas 10 hari dijadwalkan ${i} hari lagi. Retensi lebih tinggi = ulasan lebih sering. 85–92% ideal.`; };
        ret.oninput = upd; upd();
      }
      const fo = $('#fsrsOpt', body);
      if (fo) fo.onclick = async () => {
        collect();
        const hist = histories(deck);
        $('#optProg', body).classList.remove('hidden');
        const res = await Sched.optimize(hist, Col.dayOffset(), p.w, x => { $('#optProg i', body).style.width = (x * 100) + '%'; $('#optMsg', body).textContent = 'Mengoptimalkan… ' + Math.round(x * 100) + '%'; });
        if (!res.ok) { $('#optMsg', body).textContent = res.reason; return; }
        p.w = res.w; $('#optMsg', body).textContent = `Selesai dari ${res.n} ulasan. Log loss ${res.before.toFixed(4)} → ${res.after.toFixed(4)}. Tekan Simpan.`;
        body.querySelector('[name=w]').value = res.w.join(', ');
      };
      const fe = $('#fsrsEval', body);
      if (fe) fe.onclick = () => { collect(); const it = histories(deck); const l = Sched.loss(p.w && p.w.length === 19 ? p.w : Sched.FSRS_DEFAULT, it.map(h => h.map(x => ({ day: Col.dayOf(x.t), g: x.g })))); UI.info('Evaluasi FSRS', l.n ? `Log loss: ${l.loss.toFixed(4)}\nDari ${l.n} ulasan antar-hari.\nSemakin kecil semakin akurat.` : 'Belum cukup riwayat ulasan.'); };
      const fr = $('#fsrsReset', body);
      if (fr) fr.onclick = () => { p.w = null; body.querySelector('[name=w]').value = ''; UI.toast('Parameter default'); };
    }
    function collect() {
      $$('input,select,textarea', body).forEach(el => {
        const k = el.name; if (!k) return;
        if (el.type === 'checkbox') p[k] = el.checked;
        else if (k === 'learnSteps' || k === 'relearnSteps') { const v = parseSteps(el.value); p[k] = k === 'learnSteps' && !v.length ? [1] : v; }
        else if (k === 'w') { const arr = el.value.split(/[\s,]+/).filter(Boolean).map(Number); p.w = arr.length === 19 && arr.every(x => isFinite(x)) ? arr : null; }
        else if (el.type === 'number' || el.type === 'range') p[k] = +el.value;
        else p[k] = el.value;
      });
      p.retention = Math.min(0.99, Math.max(0.7, +p.retention || 0.9));
    }
    async function presetMenu() {
      collect();
      UI.actions([
        { label: 'Tambah preset', icon: 'plus', fn: async () => { const n = await UI.prompt('Nama preset baru', ''); if (!n) return; const np = DB.put('presets', Object.assign(JSON.parse(JSON.stringify(Col.DEFAULT_PRESET)), { id: DB.newId(), name: n })); presets.push(np); p = Object.assign({}, np); draw(); } },
        { label: 'Salin preset ini', icon: 'copy', fn: async () => { const n = await UI.prompt('Nama salinan', p.name + ' (salinan)'); if (!n) return; const np = DB.put('presets', Object.assign(JSON.parse(JSON.stringify(p)), { id: DB.newId(), name: n })); presets.push(np); p = Object.assign({}, np); draw(); } },
        { label: 'Ganti nama', icon: 'edit', fn: async () => { const n = await UI.prompt('Nama preset', p.name); if (n) { p.name = n; const o = presets.find(x => x.id === p.id); if (o) o.name = n; draw(); } } },
        p.id !== 1 ? { label: 'Hapus preset', icon: 'trash', danger: true, fn: async () => {
          if (!await UI.confirm('Hapus preset "' + p.name + '"?', 'Deck yang memakainya kembali ke Default.', 'Hapus', true)) return;
          DB.list('decks').forEach(d => { if (d.presetId === p.id) { d.presetId = 1; DB.put('decks', d); } });
          DB.del('presets', p.id); presets.splice(presets.findIndex(x => x.id === p.id), 1); p = Object.assign({}, Col.DEFAULT_PRESET, DB.get('presets', 1)); draw();
        } } : null
      ]);
    }
    draw();
    $('#optSave', sh.el).onclick = () => {
      collect();
      DB.put('presets', p);
      deck.presetId = p.id; DB.put('decks', deck);
      sh.close(); UI.toast('Opsi disimpan'); App.refresh();
    };
  }
  function histories(deck) {
    const ids = new Set(Col.studyCards(deck).map(c => c.id));
    const by = new Map();
    for (const r of DB.list('revlog')) { if (!ids.has(r.cid) || r.type === 3) continue; if (!by.has(r.cid)) by.set(r.cid, []); by.get(r.cid).push({ t: r.id, g: r.ease, type: r.type }); }
    const out = [];
    for (const h of by.values()) { h.sort((a, b) => a.t - b.t); if (h[0].type === 0) out.push(h); }
    return out;
  }
  App.deckOptions = deckOptions;

  // ---------- Setelan ----------
  function renderSettings() {
    const v = $('#v-settings');
    const theme = DB.meta('theme') || 'auto';
    const nCards = DB.mem.cards.size, nNotes = DB.mem.notes.size, nRev = DB.mem.revlog.size;
    const voices = (window.speechSynthesis && speechSynthesis.getVoices().filter(x => /^en/i.test(x.lang))) || [];
    const curVoice = DB.meta('voice') || '';
    v.innerHTML = `
      <div class="navbar"></div>
      <h1 class="large-title">Setelan</h1>
      <div class="list"><div class="row" style="padding:16px"><div class="logo">L</div><div class="grow"><div class="t1" style="font-weight:600;font-size:20px">Lekat</div><div class="t2">${nNotes} note · ${nCards} kartu · ${nRev} ulasan tersimpan di perangkat ini</div></div></div></div>
      <div class="section-h"><span>Tampilan</span></div>
      <div class="list">
        <div class="row"><div class="grow">Tema</div>${UI.seg('theme', [['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']], theme)}</div>
      </div>
      <div class="section-h"><span>Belajar</span></div>
      <div class="list">
        <div class="row"><div class="grow">Hari berikutnya mulai jam<div class="t2">Seperti Anki: ulasan setelah tengah malam masih dihitung "hari ini"</div></div><input type="number" id="setRoll" min="0" max="23" value="${Col.rollover()}" style="width:60px"></div>
        <div class="row"><div class="grow">Learn-ahead limit (menit)<div class="t2">Kartu learning ditampilkan lebih awal bila tidak ada kartu lain</div></div><input type="number" id="setAhead" min="0" max="240" value="${DB.meta('learnAhead') ?? 20}" style="width:60px"></div>
        <div class="row"><div class="grow">Suara bahasa Inggris (TTS)</div><select id="setVoice"><option value="">Otomatis (en-US)</option>${voices.map(x => `<option value="${esc(x.name)}" ${x.name === curVoice ? 'selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`).join('')}</select></div>
        <button type="button" class="row tint" id="setTestVoice">${icon('speaker')} Tes suara</button>
      </div>
      <div class="section-h"><span>Koleksi</span></div>
      <div class="list">
        <button type="button" class="row ind" id="setTypes"><div class="row-ico" style="background:var(--purple)">${icon('copy')}</div><div class="grow">Note types & template kartu</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="setPresets"><div class="row-ico" style="background:#8E8E93">${icon('gear')}</div><div class="grow">Opsi deck default</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="setUnbury"><div class="row-ico" style="background:var(--teal)">${icon('eye')}</div><div class="grow">Batal kubur semua kartu</div></button>
        <button type="button" class="row ind" id="setEmpty"><div class="row-ico" style="background:var(--orange)">${icon('trash')}</div><div class="grow">Cek & bersihkan (Check Database)</div></button>
      </div>
      <div class="section-h"><span>Sinkron & cadangan</span></div>
      <div class="list">
        <button type="button" class="row ind" id="setBackup"><div class="row-ico" style="background:var(--tint)">${icon('upload')}</div><div class="grow">Ekspor cadangan lengkap (.lekat)<div class="t2">Pindahkan ke HP/laptop lain lalu impor</div></div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="setImport"><div class="row-ico" style="background:var(--green)">${icon('download')}</div><div class="grow">Impor (CSV / TXT / .apkg / .lekat)</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="setCsv"><div class="row-ico" style="background:var(--orange)">${icon('upload')}</div><div class="grow">Ekspor note ke CSV</div>${icon('chevR', 'chev')}</button>
      </div>
      <p class="section-f">Semua data tersimpan lokal di browser (IndexedDB) dan bekerja offline. Cadangan otomatis terakhir: ${DB.meta('lastAutoBackup') ? new Date(DB.meta('lastAutoBackup')).toLocaleString('id-ID') : 'belum'}.</p>
      <div class="section-h"><span>Bantuan</span></div>
      <div class="list">
        <button type="button" class="row ind" id="setHelp"><div class="row-ico" style="background:var(--pink)">${icon('info')}</div><div class="grow">Cara kerja Lekat & sintaks pencarian</div>${icon('chevR', 'chev')}</button>
      </div>
      <div class="section-h"><span>Zona bahaya</span></div>
      <div class="list"><button type="button" class="row danger" id="setWipe">Hapus semua data</button></div>
      <p class="section-f" style="text-align:center;margin-top:20px">Lekat · FSRS-5 & SM-2 · offline-first</p>`;
    UI.bindSeg(v, (name, val) => { if (name === 'theme') { DB.meta('theme', val); applyTheme(); } });
    $('#setRoll').onchange = e => { DB.meta('rollover', Math.min(23, Math.max(0, +e.target.value || 0))); UI.toast('Disimpan'); };
    $('#setAhead').onchange = e => { DB.meta('learnAhead', Math.max(0, +e.target.value || 0)); UI.toast('Disimpan'); };
    $('#setVoice').onchange = e => DB.meta('voice', e.target.value);
    $('#setTestVoice').onclick = () => G.Review.speak('Hello! Practice makes progress.', 'en-US', 0.95);
    $('#setTypes').onclick = noteTypesSheet;
    $('#setPresets').onclick = () => deckOptions(DB.get('decks', 1) || Col.decks()[0]);
    $('#setUnbury').onclick = () => { Col.unburyAll(); UI.toast('Semua kartu dibatalkan kuburnya'); };
    $('#setEmpty').onclick = checkDatabase;
    $('#setBackup').onclick = () => G.IO.exportBackup();
    $('#setImport').onclick = () => G.IO.importMenu();
    $('#setCsv').onclick = () => G.IO.exportCsv();
    $('#setHelp').onclick = helpSheet;
    $('#setWipe').onclick = async () => {
      if (!await UI.confirm('Hapus semua data?', 'Semua deck, kartu, riwayat, dan media akan hilang. Ekspor cadangan dulu jika perlu.', 'Hapus semua', true)) return;
      const r = await UI.prompt('Ketik HAPUS untuk konfirmasi', ''); if (r !== 'HAPUS') return;
      await DB.wipe(); Col.ensureDefaults(); go('decks'); UI.toast('Semua data dihapus');
    };
    if (window.speechSynthesis && !voices.length) speechSynthesis.onvoiceschanged = () => { if (App.tab === 'settings') renderSettings(); speechSynthesis.onvoiceschanged = null; };
  }
  function checkDatabase() {
    let fixed = 0;
    const notes = DB.mem.notes, decks = DB.mem.decks, types = DB.mem.notetypes;
    for (const c of DB.list('cards')) {
      if (!notes.has(c.noteId)) { DB.del('cards', c.id); fixed++; continue; }
      if (!decks.has(c.deckId) || decks.get(c.deckId).filtered) { c.deckId = 1; DB.put('cards', c); fixed++; }
    }
    for (const n of DB.list('notes')) {
      if (!types.has(n.typeId)) { DB.del('notes', n.id); fixed++; continue; }
      if (!DB.list('cards').some(c => c.noteId === n.id)) { DB.del('notes', n.id); fixed++; }
    }
    const cids = new Set(DB.mem.cards.keys());
    for (const d of DB.list('decks')) if (d.filtered && d.filtered.cids) { const before = d.filtered.cids.length; d.filtered.cids = d.filtered.cids.filter(id => cids.has(id)); if (before !== d.filtered.cids.length) { DB.put('decks', d); fixed++; } }
    Col.ensureDefaults();
    UI.info('Check Database', fixed ? `${fixed} masalah diperbaiki.` : 'Koleksi sehat, tidak ada masalah.');
  }

  // ---------- Note types ----------
  function noteTypesSheet() {
    const sh = UI.sheet({ title: 'Note Types', right: `<button type="button" class="btn-txt" id="ntAdd">${icon('plus')}</button>`, body: '<div id="ntList"></div>' });
    function draw() {
      const list = DB.list('notetypes');
      $('#ntList', sh.body).innerHTML = `<div class="list" style="margin-top:6px">${list.map(t => {
        const n = DB.list('notes').filter(x => x.typeId === t.id).length;
        return `<button type="button" class="row" data-id="${t.id}"><div class="grow"><div class="t1">${esc(t.name)}</div><div class="t2">${t.fields.length} field · ${t.kind === 'cloze' ? 'cloze' : t.kind === 'io' ? 'image occlusion' : t.tmpls.length + ' template'} · ${n} note</div></div>${icon('chevR', 'chev')}</button>`;
      }).join('')}</div><p class="section-f">Note type menentukan field dan template kartu (HTML/CSS) — sama seperti Anki. Mendukung {{Field}}, {{FrontSide}}, {{#Field}}…{{/Field}}, {{cloze:Field}}, {{type:Field}}, {{tts en_US:Field}}, {{hint:Field}}.</p>`;
      $$('#ntList [data-id]', sh.body).forEach(b => b.onclick = () => editNoteType(DB.get('notetypes', +b.dataset.id), draw));
    }
    $('#ntAdd', sh.el).onclick = async () => {
      const list = DB.list('notetypes');
      const r = await UI.actions(list.map(t => ({ label: 'Salin dari: ' + t.name })), 'Buat note type baru');
      if (r < 0) return;
      const base = list[r];
      const name = await UI.prompt('Nama note type', base.name + ' (kustom)'); if (!name) return;
      const nt = JSON.parse(JSON.stringify(base)); nt.id = DB.newId(); nt.name = name; nt.builtin = false; nt.key = 'custom-' + nt.id;
      DB.put('notetypes', nt); draw(); editNoteType(nt, draw);
    };
    draw();
  }
  function editNoteType(nt, onDone) {
    let ti = 0;
    const sh = UI.sheet({ title: nt.name, full: true, right: `<button type="button" class="btn-txt bold" id="ntSave">Simpan</button>`, body: '<div id="ntBody"></div>' });
    const body = $('#ntBody', sh.body);
    const work = JSON.parse(JSON.stringify(nt));
    function draw() {
      const t = work.tmpls[ti] || work.tmpls[0];
      body.innerHTML = `
        <div class="section-h"><span>Field</span></div>
        <div class="list">${work.fields.map((f, i) => `<div class="row"><div class="grow">${esc(f)}</div>
          <button type="button" class="btn-txt" data-ren="${i}">Ganti</button>${i > 0 ? `<button type="button" class="btn-txt" data-up="${i}">↑</button>` : ''}${work.fields.length > 1 && work.kind === 'std' ? `<button type="button" class="btn-txt" style="color:var(--red-ink)" data-delf="${i}">Hapus</button>` : ''}</div>`).join('')}
          ${work.kind === 'std' ? '<button type="button" class="row tint" id="fAdd">Tambah field</button>' : ''}</div>
        <div class="section-h"><span>Template kartu</span>${work.kind === 'std' ? '<button type="button" class="btn-txt" id="tAdd" style="font-size:13px">+ Template</button>' : ''}</div>
        ${work.tmpls.length > 1 ? `<div class="chips">${work.tmpls.map((x, i) => `<button type="button" class="chip ${i === ti ? 'on' : ''}" data-t="${i}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        <div class="list"><div class="row"><div class="grow">Nama template</div><input id="tName" value="${esc(t.name)}" style="width:180px"></div>
        ${work.kind === 'std' && work.tmpls.length > 1 ? '<button type="button" class="row danger" id="tDel">Hapus template ini</button>' : ''}</div>
        <div class="section-h"><span>Depan (Front template)</span></div>
        <textarea class="code" id="tQ">${esc(t.q)}</textarea>
        <div class="section-h"><span>Belakang (Back template)</span></div>
        <textarea class="code" id="tA">${esc(t.a)}</textarea>
        <div class="section-h"><span>Styling (CSS, berlaku untuk .card)</span></div>
        <textarea class="code" id="tCss" style="min-height:100px">${esc(work.css || '')}</textarea>
        <div class="section-h"><span>Pratinjau</span>${UI.seg('pv', [['q', 'Depan'], ['a', 'Belakang']], 'q')}</div>
        <div class="preview-card"><style id="pvCss"></style><div class="card card-content" id="pvOut"></div></div>
        ${!work.builtin ? '<div class="list" style="margin-top:20px"><button type="button" class="row danger" id="ntDel">Hapus note type</button></div>' : ''}`;
      const pv = (side) => {
        syncT();
        const fake = { fields: {}, tags: ['contoh'] };
        work.fields.forEach(f => fake.fields[f] = f === 'Text' ? 'This is a {{c1::sample}} sentence.' : f === 'Occlusions' ? '' : '(' + f + ')');
        const cur = work.tmpls[ti];
        const q = G.Render.renderTemplate(cur.q, fake, work, { ord: 0, side: 'q' });
        const out = side === 'q' ? q : G.Render.renderTemplate(cur.a, fake, work, { ord: 0, side: 'a', frontSide: q });
        $('#pvCss', body).textContent = scopeCss(work.css || '', '#pvOut');
        $('#pvOut', body).innerHTML = out;
      };
      UI.bindSeg(body, (n, v) => pv(v));
      ['#tQ', '#tA', '#tCss'].forEach(id => $(id, body).addEventListener('input', () => pv(UI.segVal(body, 'pv'))));
      pv('q');
      $$('[data-t]', body).forEach(b => b.onclick = () => { syncT(); ti = +b.dataset.t; draw(); });
      $$('[data-ren]', body).forEach(b => b.onclick = async () => { const i = +b.dataset.ren; const n = await UI.prompt('Nama field', work.fields[i]); if (!n || work.fields.includes(n)) return; syncT(); renameField(work, work.fields[i], n); draw(); });
      $$('[data-up]', body).forEach(b => b.onclick = () => { const i = +b.dataset.up; syncT(); [work.fields[i - 1], work.fields[i]] = [work.fields[i], work.fields[i - 1]]; draw(); });
      $$('[data-delf]', body).forEach(b => b.onclick = async () => { const i = +b.dataset.delf; if (await UI.confirm('Hapus field "' + work.fields[i] + '"?', 'Isinya di semua note akan hilang saat disimpan.', 'Hapus', true)) { syncT(); work.fields.splice(i, 1); draw(); } });
      const fa = $('#fAdd', body); if (fa) fa.onclick = async () => { const n = await UI.prompt('Nama field baru', ''); if (n && !work.fields.includes(n)) { syncT(); work.fields.push(n); draw(); } };
      const ta = $('#tAdd', body); if (ta) ta.onclick = () => { syncT(); work.tmpls.push({ name: 'Kartu ' + (work.tmpls.length + 1), q: '{{' + (work.fields[1] || work.fields[0]) + '}}', a: '{{FrontSide}}\n<hr id="answer">\n{{' + work.fields[0] + '}}' }); ti = work.tmpls.length - 1; draw(); };
      const td = $('#tDel', body); if (td) td.onclick = async () => { if (await UI.confirm('Hapus template?', 'Kartu dari template ini akan dihapus saat disimpan.', 'Hapus', true)) { work.tmpls.splice(ti, 1); work._delOrd = (work._delOrd || []).concat(ti); ti = 0; draw(); } };
      const nd = $('#ntDel', body); if (nd) nd.onclick = async () => {
        const n = DB.list('notes').filter(x => x.typeId === nt.id);
        if (!await UI.confirm('Hapus note type?', `${n.length} note beserta kartunya ikut terhapus.`, 'Hapus', true)) return;
        Col.deleteNotes(n.map(x => x.id)); DB.del('notetypes', nt.id); sh.close(); onDone && onDone();
      };
    }
    function syncT() {
      const t = work.tmpls[ti]; if (!t) return;
      const q = $('#tQ', body), a = $('#tA', body), n = $('#tName', body), css = $('#tCss', body);
      if (q) t.q = q.value; if (a) t.a = a.value; if (n) t.name = n.value; if (css) work.css = css.value;
    }
    function renameField(w, from, to) {
      w.fields[w.fields.indexOf(from)] = to;
      const re = new RegExp('(\\{\\{[#^/]?(?:[^}:]*:)*)' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}', 'g');
      w.tmpls.forEach(t => { t.q = t.q.replace(re, '$1' + to + '}}'); t.a = t.a.replace(re, '$1' + to + '}}'); });
      w._ren = (w._ren || []).concat([[from, to]]);
    }
    draw();
    $('#ntSave', sh.el).onclick = () => {
      syncT();
      const ren = work._ren || [], delOrd = work._delOrd || [];
      delete work._ren; delete work._delOrd;
      Object.assign(nt, work);
      DB.put('notetypes', nt);
      // perbarui note: rename field, hapus field, regenerasi kartu
      for (const n of DB.list('notes').filter(x => x.typeId === nt.id)) {
        for (const [a, b] of ren) { if (a in n.fields) { n.fields[b] = n.fields[a]; delete n.fields[a]; } }
        const nf = {}; nt.fields.forEach(f => nf[f] = n.fields[f] || ''); n.fields = nf;
        if (delOrd.length) {
          for (const c of DB.list('cards').filter(c => c.noteId === n.id)) {
            let o = c.ord; let removed = false;
            for (const d of delOrd) { if (o === d) removed = true; else if (o > d) o--; }
            if (removed) DB.del('cards', c.id); else if (o !== c.ord) { c.ord = o; DB.put('cards', c); }
          }
        }
        Col.updateNote(n);
      }
      sh.close(); UI.toast('Note type disimpan'); onDone && onDone();
    };
  }
  function scopeCss(css, scope) {
    return css.replace(/(^|\})\s*([^{}@]+)\{/g, (m, a, sel) => a + ' ' + sel.split(',').map(s => { s = s.trim(); if (!s) return s; return s === '.card' ? scope : s.startsWith('.card') ? scope + s.slice(5) : scope + ' ' + s; }).join(', ') + '{');
  }
  App.scopeCss = scopeCss;

  function helpSheet() {
    UI.sheet({ title: 'Cara kerja Lekat', full: true, body: `<div style="font-size:15px;line-height:1.55">
      <div class="section-h"><span>Spaced repetition</span></div>
      <div class="list"><div class="row" style="display:block">Lekat menampilkan kartu tepat sebelum kamu diperkirakan lupa. Setiap jawaban menentukan interval berikutnya:<br>
      <b style="color:var(--red-ink)">Again</b> lupa · <b>Hard</b> ingat dengan susah · <b style="color:var(--green-ink)">Good</b> ingat · <b style="color:var(--tint-ink)">Easy</b> sangat mudah.<br>Jujurlah saat menilai — menebak lalu tekan Good membuat kartu cepat lupa nanti.</div></div>
      <div class="section-h"><span>Status kartu</span></div>
      <div class="list"><div class="row" style="display:block"><b class="c-new">New</b> belum pernah dilihat · <b class="c-lrn">Learning/Relearning</b> sedang dihafal lewat langkah pendek (mis. 1m 10m) · <b class="c-rev">Review</b> dijadwalkan dalam hitungan hari. <b>Buried</b> ditunda ke besok, <b>Suspended</b> dibekukan.</div></div>
      <div class="section-h"><span>FSRS vs SM-2</span></div>
      <div class="list"><div class="row" style="display:block"><b>FSRS</b> memodelkan Difficulty, Stability, Retrievability dan menjadwalkan sesuai <i>desired retention</i> (default 90%). Tekan "Optimalkan" setelah punya ratusan ulasan agar parameternya menyesuaikan otakmu. <b>SM-2</b> memakai ease factor klasik (250%).</div></div>
      <div class="section-h"><span>Pintasan keyboard (saat belajar)</span></div>
      <div class="list"><div class="row" style="display:block"><kbd>Spasi</kbd>/<kbd>Enter</kbd> tampilkan jawaban / Good · <kbd>1</kbd>–<kbd>4</kbd> nilai · <kbd>R</kbd> putar audio · <kbd>E</kbd> edit · <kbd>U</kbd>/<kbd>Ctrl+Z</kbd> undo · <kbd>-</kbd> bury · <kbd>@</kbd> suspend · <kbd>Ctrl+1..7</kbd> flag · <kbd>I</kbd> info kartu · <kbd>Esc</kbd> keluar</div></div>
      <div class="section-h"><span>Sintaks pencarian</span></div>
      <div class="list"><div class="row" style="display:block;font-size:14px">
        <kbd>dog</kbd> teks di field mana pun · <kbd>"a phrase"</kbd> frasa · <kbd>d*g</kbd> wildcard · <kbd>-cat</kbd> kecualikan · <kbd>dog or cat</kbd><br>
        <kbd>deck:English</kbd> (termasuk sub-deck) · <kbd>tag:vocab</kbd> · <kbd>tag:none</kbd> · <kbd>note:Cloze</kbd> · <kbd>card:2</kbd> · <kbd>word:run*</kbd> per field<br>
        <kbd>is:new</kbd> <kbd>is:learn</kbd> <kbd>is:review</kbd> <kbd>is:due</kbd> <kbd>is:suspended</kbd> <kbd>is:buried</kbd> <kbd>is:leech</kbd> <kbd>flag:1</kbd><br>
        <kbd>added:7</kbd> <kbd>rated:1</kbd> <kbd>rated:7:1</kbd> (Again 7 hari) <kbd>introduced:3</kbd><br>
        <kbd>prop:ivl&gt;=30</kbd> <kbd>prop:due=1</kbd> <kbd>prop:lapses&gt;3</kbd> <kbd>prop:ease&lt;2</kbd> <kbd>prop:r&lt;0.8</kbd> <kbd>prop:d&gt;7</kbd></div></div>
      <div class="section-h"><span>Tips belajar bahasa Inggris</span></div>
      <div class="list"><div class="row" style="display:block">1 kartu = 1 hal kecil (minimum information principle). Pakai kalimat contoh, dengarkan pelafalan (TTS), dan gunakan kartu <i>Arti → Kata (ketik)</i> untuk melatih ejaan. Konsisten setiap hari lebih penting daripada banyak sekaligus.</div></div>
    </div>` });
  }

  // ---------- Keyboard global ----------
  document.addEventListener('keydown', e => {
    if (G.Review.active() || document.querySelector('.sheet, .alert-back, .actsheet')) return;
    if (e.target.closest('input,textarea,[contenteditable]')) return;
    const map = { '1': 'decks', '2': 'add', '3': 'browse', '4': 'stats', '5': 'settings' };
    if (e.altKey && map[e.key]) { e.preventDefault(); go(map[e.key]); }
    if (e.key === '/' && App.tab === 'browse') { e.preventDefault(); const s = $('#brSearch'); s && s.focus(); }
  });

  // ---------- Start ----------
  async function boot() {
    try { await DB.init(); }
    catch (e) { document.body.innerHTML = '<div class="empty" style="padding-top:30vh">Browser ini memblokir penyimpanan lokal (IndexedDB). Coba keluar dari mode private.</div>'; return; }
    Col.ensureDefaults();
    App.collapsed = new Set(DB.meta('collapsed') || []);
    applyTheme();
    initTabs();
    let tab = 'decks'; try { tab = localStorage.getItem('lekat.tab') || 'decks'; } catch (e) {}
    if (!TABS.some(t => t[0] === tab)) tab = 'decks';
    go(tab);
    // refresh daftar deck saat kembali ke tab (hari berganti, learning jatuh tempo)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !G.Review.active() && App.tab === 'decks') renderDecks(); });
    setInterval(() => { if (!document.hidden && !G.Review.active() && App.tab === 'decks' && !document.querySelector('.sheet')) renderDecks(); }, 60000);
    G.IO.autoBackup();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  G.App = App;
  boot();
})(window);
