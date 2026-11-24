// Lekat — aplikasi utama: tab, daftar deck, opsi deck (preset), filtered deck, setelan, note type.
(function (G) {
  'use strict';
  const { DB, Col, UI, Sched } = G;
  const { $, $$, esc, icon } = UI;

  const TABS = [['decks', 'stack', 'Hari ini'], ['add', 'plus', 'Tambah'], ['browse', 'search', 'Koleksi'], ['stats', 'chart', 'Progres'], ['settings', 'gear', 'Setelan']];
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

  // ---------- Streak & ringkasan ----------
  function streak() {
    const days = new Set(DB.list('revlog').map(r => Col.dayOf(r.id)));
    let d = Col.today(), n = 0;
    if (!days.has(d)) d--;
    while (days.has(d)) { n++; d--; }
    return { n, todayDone: days.has(Col.today()) };
  }
  function avgSecs() {
    const logs = DB.list('revlog').slice(-300).filter(r => r.time > 0);
    return logs.length ? Math.max(4, logs.reduce((a, r) => a + r.time, 0) / logs.length / 1000) : 8;
  }
  // perkiraan menit: kartu baru butuh ±3 kali tampil di hari pertama
  function estMinutes(c) { return Math.max(1, Math.round((c.n * 3 + c.l * 1.5 + c.r) * avgSecs() / 60)); }
  function countsAll(decks) { const t = { n: 0, l: 0, r: 0 }; for (const d of decks) { const c = Col.counts(d); t.n += c.n; t.l += c.l; t.r += c.r; } return t; }
  const total = c => c.n + c.l + c.r;
  function planText(c) {
    const parts = [];
    if (c.n) parts.push(`${c.n} kartu baru`);
    if (c.r) parts.push(`${c.r} ulangan`);
    if (c.l) parts.push(`${c.l} sedang dihafal`);
    return parts.join(' · ');
  }
  function tomorrowCount(decks) {
    const ids = new Set(decks.flatMap(d => Col.subtreeIds(d.id)));
    const t = Col.today() + 1;
    return DB.list('cards').filter(c => ids.has(c.deckId) && !c.suspended && c.state === 'review' && c.due === t).length;
  }
  // progres hafalan sebuah deck: belum dipelajari / sedang / sudah hafal
  function mastery(deck) {
    const cards = Col.studyCards(deck).filter(c => !c.suspended);
    const m = { total: cards.length, fresh: 0, learning: 0, known: 0 };
    for (const c of cards) { if (c.state === 'new') m.fresh++; else if (c.state === 'review' && c.ivl >= 21) m.known++; else m.learning++; }
    return m;
  }
  // ikon & warna deck dipilih otomatis dari namanya
  const DECK_COLORS = ['#0A84FF', '#5E5CE6', '#FF9F0A', '#30B0C7', '#FF375F', '#32ADE6', '#BF5AF2', '#34C759'];
  function deckLook(name) {
    const n = name.toLowerCase();
    const ic = /listen|dengar|audio/.test(n) ? 'speaker' : /grammar|tata/.test(n) ? 'edit' : /idiom|phrasal|ungkapan/.test(n) ? 'sparkle' : /vocab|kosakata|kata|word/.test(n) ? 'book' : 'stack';
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { ic, color: DECK_COLORS[h % DECK_COLORS.length] };
  }
  const ring = (pct, size, stroke, cls) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<svg class="ring ${cls || ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, pct))}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  };
  const shortName = d => d.filtered ? d.name : d.name.split('::').pop();

  // ---------- Hari ini (beranda) ----------
  function renderDecks() {
    const v = $('#v-decks');
    const today = Col.today();
    const tops = Col.decks().filter(d => !d.filtered && !d.name.includes('::'));
    const visibleTops = tops.filter(d => d.id !== 1 || Col.studyCards(d).length || tops.length === 1);
    const filtered = Col.decks().filter(d => d.filtered);
    const t = countsAll(tops);
    const due = total(t);
    const st = streak();
    const todayLogs = DB.list('revlog').filter(r => Col.dayOf(r.id) === today);
    const mins = Math.round(todayLogs.reduce((a, r) => a + (r.time || 0), 0) / 60000);
    const doneCards = new Set(todayLogs.map(r => r.cid)).size;
    const pct = due + doneCards ? doneCards / (due + doneCards) : 1;
    const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    const hero = due ? `
      <div class="today-card">
        <div class="today-top">
          <div class="today-ring">${ring(pct, 84, 9, 'on-dark')}<span class="ring-lbl">${Math.round(pct * 100)}%<small>selesai</small></span></div>
          <div class="today-txt"><div class="today-num">${due} <small>kartu</small></div><div class="today-sub">${esc(planText(t))}</div><div class="today-sub">± ${estMinutes(t)} menit</div></div>
        </div>
        <button type="button" class="btn today-btn" id="studyAll">${icon('play')} Mulai belajar</button>
      </div>` : `
      <div class="today-card done">
        <div class="today-top">
          <div class="today-ring">${ring(1, 84, 9, 'on-dark')}<span>${icon('check')}</span></div>
          <div class="today-txt"><div class="today-num" style="font-size:26px">${todayLogs.length ? 'Beres untuk hari ini' : 'Belum ada kartu hari ini'}</div><div class="today-sub">${todayLogs.length ? `Besok ada ${tomorrowCount(tops)} kartu. Sampai jumpa!` : 'Tambah kata baru, atau pasang paket kata awal di bawah.'}</div></div>
        </div>
        ${!todayLogs.length ? `<button type="button" class="btn today-btn" id="goAdd">${icon('plus')} Tambah kartu</button>` : ''}
      </div>`;
    v.innerHTML = `
      <div class="navbar nav-split">
        ${G.Sync ? G.Sync.pillHtml() : ''}
        <button type="button" class="circle-btn glass" id="dkAdd" aria-label="Tambah">${icon('plus')}</button>
      </div>
      <div class="eyebrow">${esc(dateStr)}</div>
      <h1 class="large-title">Hari ini</h1>
      ${hero}
      <div class="mini-stats">
        <div class="mini"><b>${st.n}</b><span>hari beruntun</span></div>
        <div class="mini"><b>${todayLogs.length}</b><span>dijawab hari ini</span></div>
        <div class="mini"><b>${mins}</b><span>menit hari ini</span></div>
      </div>
      <div class="section-h"><span>Deck kamu</span></div>
      <div class="deck-grid">
        ${visibleTops.map(d => {
          const c = Col.counts(d), n = total(c), m = mastery(d), lk = deckLook(d.name);
          const prog = m.total ? (m.total - m.fresh) / m.total : 0;
          return `<button type="button" class="deck-card" data-id="${d.id}">
            <div class="dc-top"><span class="dc-ico" style="background:${lk.color}">${icon(lk.ic)}</span>${n ? `<span class="dc-due">${n}</span>` : `<span class="dc-ok">${icon('check')}</span>`}</div>
            <div class="dc-name">${esc(d.name)}</div>
            <div class="dc-sub">${m.total} kartu · ${m.known} hafal</div>
            <div class="dc-bar"><i style="width:${Math.round(prog * 100)}%;background:${lk.color}"></i></div>
          </button>`;
        }).join('')}
        <button type="button" class="deck-card add" id="newDeckCard">${icon('plus')}<span>Deck baru</span></button>
      </div>
      ${filtered.length ? `<div class="section-h"><span>Sesi khusus</span></div><div class="list">${filtered.map(d => { const n = total(Col.counts(d)); return `<button type="button" class="row" data-fid="${d.id}"><div class="row-ico" style="background:var(--purple)">${icon('filter')}</div><div class="grow"><div class="t1">${esc(d.name)}</div><div class="t2">${n ? n + ' kartu tersisa' : 'Selesai'}</div></div>${icon('chevR', 'chev')}</button>`; }).join('')}</div>` : ''}
      ${!DB.meta('starterInstalled') ? `<div class="section-h"><span>Mulai cepat</span></div><div class="list"><button type="button" class="row" id="installStarter"><div class="row-ico" style="background:var(--tint)">${icon('book')}</div><div class="grow"><div class="t1">Pasang paket kata awal</div><div class="t2">50 kosakata, phrasal verbs, grammar, latihan dengar</div></div>${icon('chevR', 'chev')}</button></div>` : ''}`;
    $$('.deck-card[data-id]', v).forEach(b => b.onclick = () => deckOverview(DB.get('decks', +b.dataset.id)));
    $$('[data-fid]', v).forEach(b => b.onclick = () => deckOverview(DB.get('decks', +b.dataset.fid)));
    const sa = $('#studyAll');
    if (sa) sa.onclick = () => {
      const withCards = tops.filter(d => total(Col.counts(d)) > 0);
      if (!withCards.length) return UI.toast('Tidak ada kartu untuk hari ini');
      G.Review.start(withCards[0], { chain: withCards.map(d => d.id) });
    };
    const ga = $('#goAdd'); if (ga) ga.onclick = () => go('add');
    $('#newDeckCard').onclick = () => newDeck();
    $('#dkAdd').onclick = () => UI.actions([
      { label: 'Tambah kartu', icon: 'plus', fn: () => go('add') },
      { label: 'Deck baru', icon: 'stack', fn: () => newDeck() },
      { label: 'Impor file', icon: 'download', fn: () => G.IO.importMenu() }
    ]);
    const ins = $('#installStarter');
    if (ins) ins.onclick = () => { G.Starter.installStarter(); UI.toast('Paket kata awal dipasang'); renderDecks(); };
  }
  async function newDeck(parent) {
    const name = await UI.prompt(parent ? 'Bagian baru di ' + parent.split('::').pop() : 'Deck baru', '', parent ? 'Contoh: Kata kerja' : 'Contoh: TOEFL, Kerja, Traveling');
    if (!name || !name.trim()) return;
    const d = Col.deckByName(parent ? parent + '::' + name : name, true); App.refresh(); UI.toast('Deck dibuat');
    return d;
  }
  App.newDeck = newDeck;

  function deckMenu(deck, parentSheet) {
    const close = () => parentSheet && parentSheet.close();
    const items = deck.filtered ? [
      { label: 'Ambil ulang kartunya', icon: 'reset', fn: () => { const n = Col.buildFiltered(deck); UI.toast(n + ' kartu diambil'); close(); App.refresh(); } },
      { label: 'Ubah aturan sesi (lanjutan)', icon: 'filter', fn: () => { close(); filteredDeckDialog(deck); } },
      { label: 'Akhiri sesi', icon: 'trash', danger: true, fn: async () => { if (await UI.confirm('Akhiri sesi khusus?', 'Kartunya tetap aman di deck asal.', 'Akhiri', true)) { Col.deleteDeck(deck.id); close(); App.refresh(); } } }
    ] : [
      { label: 'Ganti nama', icon: 'edit', fn: async () => { const n = await UI.prompt('Ganti nama', shortName(deck)); if (n) { const parts = deck.name.split('::'); parts[parts.length - 1] = n; Col.renameDeck(deck.id, parts.join('::')); close(); App.refresh(); } } },
      { label: 'Tambah bagian di dalamnya', icon: 'folder', fn: () => { close(); newDeck(deck.name); } },
      { label: 'Tulis deskripsi', icon: 'info', fn: async () => { const r = await UI.alertBox({ title: 'Deskripsi', input: true, multiline: true, value: deck.desc || '', buttons: [{ label: 'Batal' }, { label: 'Simpan', style: 'bold' }] }); if (r.i === 1) { deck.desc = r.value; DB.put('decks', deck); close(); deckOverview(deck); } } },
      { label: 'Ekspor / bagikan deck', icon: 'upload', fn: () => G.IO.exportDeck(deck) },
      { label: 'Hapus deck', icon: 'trash', danger: true, fn: async () => {
        const n = DB.list('cards').filter(c => Col.subtreeIds(deck.id).includes(c.deckId)).length;
        if (await UI.confirm('Hapus "' + shortName(deck) + '"?', `${n} kartu di dalamnya ikut terhapus permanen.`, 'Hapus', true)) { Col.deleteDeck(deck.id); close(); App.refresh(); UI.toast('Deck dihapus'); }
      } }
    ];
    UI.actions(items, shortName(deck));
  }
  App.deckMenu = deckMenu;

  // ---------- Detail deck ----------
  function deckOverview(deck) {
    const c = Col.counts(deck), n = total(c);
    const today = Col.today();
    const cards = Col.studyCards(deck);
    const buried = cards.filter(x => Col.isBuried(x, today)).length;
    const hidden = cards.filter(x => x.suspended).length;
    const m = mastery(deck), lk = deckLook(deck.name);
    const kids = deck.filtered ? [] : Col.decks().filter(d => !d.filtered && d.name.toLowerCase().startsWith(deck.name.toLowerCase() + '::') && d.name.split('::').length === deck.name.split('::').length + 1);
    const p = Col.preset(deck);
    const sh = UI.sheet({ title: '', right: `<button type="button" class="btn-txt" id="ovMore" aria-label="Lainnya">${icon('more')}</button>`, body: `
      <div class="ov-head">
        <span class="dc-ico big" style="background:${deck.filtered ? 'var(--purple)' : lk.color}">${icon(deck.filtered ? 'filter' : lk.ic)}</span>
        <h2>${esc(shortName(deck))}</h2>
        ${deck.name.includes('::') ? `<div class="muted" style="font-size:13px">${esc(deck.name.split('::').slice(0, -1).join(' › '))}</div>` : ''}
        ${deck.desc ? `<p class="ov-desc">${esc(deck.desc)}</p>` : ''}
      </div>
      ${n ? `<button type="button" class="btn primary block" id="ovStudy">${icon('play')} Belajar · ${n} kartu</button>
        <p class="section-f" style="text-align:center">${esc(planText(c))} · ± ${estMinutes(c)} menit</p>`
        : `<div class="ov-done">${icon('check')} Beres untuk hari ini</div>`}
      <div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-top:14px">
        <div class="tile tc"><div class="v">${m.fresh}</div><div class="k">Belum dipelajari</div></div>
        <div class="tile tc"><div class="v">${m.learning}</div><div class="k">Sedang dihafal</div></div>
        <div class="tile tc"><div class="v" style="color:var(--green-ink)">${m.known}</div><div class="k">Sudah hafal</div></div>
      </div>
      ${kids.length ? `<div class="section-h"><span>Bagian</span></div><div class="list">${kids.map(k => { const kc = total(Col.counts(k)); const kl = deckLook(k.name); return `<button type="button" class="row ind" data-kid="${k.id}"><span class="row-ico" style="background:${kl.color}">${icon(kl.ic)}</span><div class="grow"><div class="t1">${esc(shortName(k))}</div><div class="t2">${mastery(k).total} kartu</div></div>${kc ? `<span class="due-pill">${kc}</span>` : `<span class="muted">${icon('check')}</span>`}${icon('chevR', 'chev')}</button>`; }).join('')}</div>` : ''}
      <div class="list" style="margin-top:18px">
        ${!deck.filtered ? `<button type="button" class="row ind" id="ovAdd"><div class="row-ico" style="background:var(--green)">${icon('plus')}</div><div class="grow">Tambah kartu</div>${icon('chevR', 'chev')}</button>` : ''}
        <button type="button" class="row ind" id="ovBrowse"><div class="row-ico" style="background:var(--tint)">${icon('search')}</div><div class="grow">Lihat semua kartu</div>${icon('chevR', 'chev')}</button>
        ${!deck.filtered ? `<button type="button" class="row ind" id="ovCustom"><div class="row-ico" style="background:var(--purple)">${icon('sparkle')}</div><div class="grow">Latihan tambahan<div class="t2">Tambah jatah, ulangi yang lupa, belajar duluan</div></div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="ovOpts"><div class="row-ico" style="background:#8E8E93">${icon('gear')}</div><div class="grow">Pengaturan<div class="t2">${p.newPerDay} kartu baru per hari · target ingat ${Math.round(p.retention * 100)}%</div></div>${icon('chevR', 'chev')}</button>` : ''}
        ${buried ? `<button type="button" class="row ind" id="ovUnbury"><div class="row-ico" style="background:var(--teal)">${icon('eye')}</div><div class="grow">Munculkan lagi ${buried} kartu yang ditunda</div></button>` : ''}
      </div>
      ${hidden ? `<p class="section-f">${hidden} kartu disembunyikan. Munculkan lagi lewat "Lihat semua kartu" → filter Disembunyikan.</p>` : ''}` });
    const b = sh.body;
    const on = (id, fn) => { const e = $(id, b); if (e) e.onclick = fn; };
    on('#ovStudy', () => { sh.close(); G.Review.start(deck); });
    $('#ovMore', sh.el).onclick = () => deckMenu(deck, sh);
    $$('[data-kid]', b).forEach(x => x.onclick = () => deckOverview(DB.get('decks', +x.dataset.kid)));
    on('#ovOpts', () => simpleOptions(deck, sh));
    on('#ovCustom', () => customStudy(deck, sh));
    on('#ovAdd', () => { sh.close(); go('add', { deckId: deck.id }); });
    on('#ovBrowse', () => { sh.close(); go('browse', { q: deck.filtered ? 'cid:' + (deck.filtered.cids || []).join(',') : `"deck:${deck.name}"` }); });
    on('#ovUnbury', () => { for (const x of cards) if (x.buriedDay != null) { x.buriedDay = null; DB.put('cards', x); } sh.close(); deckOverview(deck); App.refresh(); });
  }
  App.deckOverview = deckOverview;

  // ---------- Pengaturan sederhana (di atas preset ala Anki) ----------
  function simpleOptions(deck, parentSheet) {
    const preset = Object.assign({}, Col.DEFAULT_PRESET, DB.get('presets', deck.presetId) || DB.get('presets', 1));
    const shared = DB.list('decks').filter(d => !d.filtered && d.presetId === preset.id && d.id !== deck.id).length;
    const ret = preset.retention <= 0.86 ? '0.85' : preset.retention >= 0.94 ? '0.95' : '0.9';
    const speed = preset.ttsRate <= 0.85 ? '0.8' : '0.95';
    const stepper = (k, label, val, step, sub) => `<div class="row"><div class="grow">${label}${sub ? `<div class="t2">${sub}</div>` : ''}</div><div class="stepper" data-k="${k}" data-step="${step}"><button type="button" data-d="-1" aria-label="Kurangi">−</button><output>${val}</output><button type="button" data-d="1" aria-label="Tambah">+</button></div></div>`;
    const sh = UI.sheet({ title: 'Pengaturan', right: `<button type="button" class="btn-txt bold" id="soSave">Simpan</button>`, body: `
      <p class="section-f" style="text-align:center;margin:0 0 12px">${esc(shortName(deck))}${shared ? ' · pengaturan ini dipakai bersama deck lain' : ''}</p>
      <div class="list">
        ${stepper('newPerDay', 'Kartu baru per hari', preset.newPerDay, 5, '10–20 cukup untuk mulai')}
        ${stepper('revPerDay', 'Batas ulangan per hari', preset.revPerDay, 50)}
      </div>
      <div class="section-h"><span>Seberapa kuat mau ingat</span></div>
      <div class="list"><div class="row" style="display:block">
        ${UI.seg('ret', [['0.85', 'Santai'], ['0.9', 'Seimbang'], ['0.95', 'Kuat']], ret)}
        <div class="t2" id="retTxt" style="margin-top:8px"></div></div></div>
      <div class="section-h"><span>Suara</span></div>
      <div class="list">
        <div class="row"><div class="grow">Putar suara otomatis</div>${UI.sw('autoplay', preset.autoplay)}</div>
        <div class="row"><div class="grow">Kecepatan suara</div>${UI.seg('speed', [['0.8', 'Pelan'], ['0.95', 'Normal']], speed)}</div>
      </div>
      <div class="list" style="margin-top:22px">
        <button type="button" class="row ind" id="soAdv"><div class="row-ico" style="background:#8E8E93">${icon('gear')}</div><div class="grow">Pengaturan lanjutan<div class="t2">Algoritma FSRS/SM-2, langkah belajar, urutan, dan lainnya (seperti Anki)</div></div>${icon('chevR', 'chev')}</button>
      </div>` });
    const b = sh.body;
    const txt = { '0.85': 'Kartu lebih jarang muncul. Cocok kalau waktumu sedikit, tapi kamu akan lebih sering lupa (±15%).', '0.9': 'Rekomendasi. Kamu ingat ±90% kartu saat muncul lagi, dengan beban yang wajar.', '0.95': 'Kartu lebih sering muncul. Cocok sebelum ujian, tapi ulangan harian jauh lebih banyak.' };
    const upd = () => { $('#retTxt', b).textContent = txt[UI.segVal(b, 'ret')]; };
    UI.bindSeg(b, upd); upd();
    $$('.stepper', b).forEach(s => s.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const o = $('output', s); const step = +s.dataset.step;
      o.textContent = Math.max(0, Math.min(9999, (+o.textContent || 0) + step * +btn.dataset.d)); UI.haptic();
    }));
    $('#soAdv', b).onclick = () => { sh.close(); deckOptions(deck); };
    $('#soSave', sh.el).onclick = () => {
      const p = DB.get('presets', preset.id) || preset;
      $$('.stepper', b).forEach(s => { p[s.dataset.k] = +$('output', s).textContent; });
      p.retention = +UI.segVal(b, 'ret');
      p.ttsRate = +UI.segVal(b, 'speed');
      p.autoplay = b.querySelector('[name=autoplay]').checked;
      DB.put('presets', p);
      sh.close(); parentSheet && parentSheet.close(); UI.toast('Tersimpan'); App.refresh();
    };
  }
  App.simpleOptions = simpleOptions;

  // ---------- Latihan tambahan (Custom study Anki) ----------
  function customStudy(deck, parentSheet) {
    const q = `"deck:${deck.name}"`;
    UI.actions([
      { label: 'Tambah kartu baru hari ini', icon: 'plus', fn: () => addQuota('new') },
      { label: 'Tambah jatah ulangan hari ini', icon: 'reset', fn: () => addQuota('rev') },
      { label: 'Ulangi yang lupa minggu ini', icon: 'undo', fn: () => makeFiltered('Ulangi yang lupa', `${q} rated:7:1`, 100, 'random') },
      { label: 'Belajar duluan (kartu minggu depan)', icon: 'clock', fn: () => makeFiltered('Belajar duluan', `${q} is:review prop:due<=7 -is:due`, 100, 'due') },
      { label: 'Latih kartu yang paling sulit', icon: 'flame', fn: () => makeFiltered('Kartu sulit', `${q} prop:lapses>=2`, 50, 'lapses') },
      { label: 'Lihat-lihat kartu baru dulu', icon: 'eye', fn: () => makeFiltered('Intip kartu baru', `${q} is:new`, 30, 'added') },
      { label: 'Buat sesi sendiri (lanjutan)', icon: 'filter', fn: () => filteredDeckDialog(null, { search: `${q} is:due` }) }
    ], 'Latihan tambahan');
    async function addQuota(kind) {
      const r = await UI.actions([5, 10, 20, 50].map(x => ({ label: '+' + x + (kind === 'new' ? ' kartu baru' : ' ulangan') })), 'Tambah berapa untuk hari ini?');
      if (r < 0) return;
      const n = [5, 10, 20, 50][r];
      const c = Col.counter(deck, Col.today());
      if (kind === 'new') c.newDone -= n; else c.revDone -= n;
      DB.put('decks', deck); parentSheet && parentSheet.close(); App.refresh(); UI.toast(`Ditambah ${n} untuk hari ini`);
    }
    function makeFiltered(name, search, limit, order) {
      const d = DB.put('decks', { id: DB.newId(), name: name + ' · ' + shortName(deck), filtered: { search, limit, order, cids: [] }, today: {} });
      const n = Col.buildFiltered(d);
      parentSheet && parentSheet.close();
      if (!n) { Col.deleteDeck(d.id); UI.info('Tidak ada kartu', 'Belum ada kartu yang cocok untuk latihan ini.'); App.refresh(); return; }
      App.refresh(); G.Review.start(d);
    }
  }

  // ---------- Filtered deck ----------
  function filteredDeckDialog(deck, preset) {
    const f = deck ? deck.filtered : Object.assign({ search: 'is:due', limit: 100, order: 'due' }, preset || {});
    const sh = UI.sheet({ title: deck ? 'Ubah sesi khusus' : 'Sesi khusus', right: `<button type="button" class="btn-txt bold" id="fdSave">${deck ? 'Simpan' : 'Buat'}</button>`, body: `
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
    const sh = UI.sheet({ title: 'Pengaturan lanjutan', full: true, right: `<button type="button" class="btn-txt bold" id="optSave">Simpan</button>`, body: '<div id="optBody"></div>' });
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
      <div class="section-h"><span>Akun & sinkron</span></div>
      <div class="list">
        <button type="button" class="row ind" id="setSync"><div class="row-ico" style="background:var(--tint)">${icon('upload')}</div><div class="grow">Sinkron cloud<div class="t2">Teks di Firebase · media di Cloudflare R2</div></div><div class="detail" id="setSyncState">${G.Sync ? esc({ local: 'Di perangkat', login: 'Belum masuk', syncing: 'Menyinkron…', on: 'Aktif', offline: 'Offline', error: 'Gagal' }[G.Sync.state()] || '') : ''}</div>${icon('chevR', 'chev')}</button>
      </div>
      <div class="section-h"><span>Tampilan</span></div>
      <div class="list">
        <div class="row"><div class="grow">Tema</div>${UI.seg('theme', [['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']], theme)}</div>
      </div>
      <div class="section-h"><span>Belajar</span></div>
      <div class="list">
        <div class="row"><div class="grow">Hari baru mulai jam<div class="t2">Belajar lewat tengah malam masih dihitung hari ini</div></div><input type="number" id="setRoll" min="0" max="23" value="${Col.rollover()}" style="width:60px"></div>
        <div class="row"><div class="grow">Tampilkan lebih awal (menit)<div class="t2">Kartu yang sedang dihafal boleh muncul lebih cepat bila tidak ada kartu lain</div></div><input type="number" id="setAhead" min="0" max="240" value="${DB.meta('learnAhead') ?? 20}" style="width:60px"></div>
        <div class="row"><div class="grow">Suara bahasa Inggris (TTS)</div><select id="setVoice"><option value="">Otomatis (en-US)</option>${voices.map(x => `<option value="${esc(x.name)}" ${x.name === curVoice ? 'selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`).join('')}</select></div>
        <button type="button" class="row tint" id="setTestVoice">${icon('speaker')} Tes suara</button>
      </div>
      <div class="section-h"><span>Koleksi</span></div>
      <div class="list">
        <button type="button" class="row ind" id="setTypes"><div class="row-ico" style="background:var(--purple)">${icon('copy')}</div><div class="grow">Jenis kartu & template (lanjutan)</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="setPresets"><div class="row-ico" style="background:#8E8E93">${icon('gear')}</div><div class="grow">Pengaturan belajar default</div>${icon('chevR', 'chev')}</button>
        <button type="button" class="row ind" id="setUnbury"><div class="row-ico" style="background:var(--teal)">${icon('eye')}</div><div class="grow">Munculkan semua kartu yang ditunda</div></button>
        <button type="button" class="row ind" id="setEmpty"><div class="row-ico" style="background:var(--orange)">${icon('trash')}</div><div class="grow">Periksa & perbaiki data</div></button>
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
        <button type="button" class="row ind" id="setHelp"><div class="row-ico" style="background:var(--pink)">${icon('info')}</div><div class="grow">Cara kerja Lekat</div>${icon('chevR', 'chev')}</button>
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
    $('#setPresets').onclick = () => simpleOptions(DB.get('decks', 1) || Col.decks()[0]);
    $('#setUnbury').onclick = () => { Col.unburyAll(); UI.toast('Semua kartu yang ditunda muncul lagi'); };
    $('#setEmpty').onclick = checkDatabase;
    $('#setBackup').onclick = () => G.IO.exportBackup();
    $('#setImport').onclick = () => G.IO.importMenu();
    $('#setCsv').onclick = () => G.IO.exportCsv();
    $('#setHelp').onclick = helpSheet;
    $('#setSync').onclick = () => G.Sync && G.Sync.statusSheet();
    $('#setWipe').onclick = async () => {
      const cloud = G.Sync && G.Sync.isOn();
      if (!await UI.confirm('Hapus semua data?', 'Semua deck, kartu, riwayat, dan media akan hilang' + (cloud ? ' di perangkat ini DAN di cloud (Firebase).' : '.') + ' Ekspor cadangan dulu jika perlu.', 'Hapus semua', true)) return;
      const r = await UI.prompt('Ketik HAPUS untuk konfirmasi', ''); if (r !== 'HAPUS') return;
      if (cloud) { try { await G.Sync.wipeRemote(); } catch (e) { UI.info('Gagal', 'Data cloud tidak bisa dihapus: ' + e.message); return; } }
      await DB.wipe(); Col.ensureDefaults(); go('decks'); UI.toast('Semua data dihapus');
      if (cloud) G.Sync.start();
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
      <b style="color:var(--red-ink)">Lupa</b> tidak ingat · <b style="color:var(--orange-ink)">Susah</b> ingat tapi lama · <b style="color:var(--green-ink)">Ingat</b> ingat dengan wajar · <b style="color:var(--tint-ink)">Gampang</b> langsung ingat.<br>Jujur saat menilai. Kalau menebak lalu pilih Ingat, kartu akan jarang muncul dan kamu jadi cepat lupa.<br><span class="muted">(Di Anki: Again, Hard, Good, Easy.)</span></div></div>
      <div class="section-h"><span>Status kartu</span></div>
      <div class="list"><div class="row" style="display:block"><b class="c-new">Belum dipelajari</b> (New) · <b class="c-lrn">Sedang dihafal</b> (Learning) diulang dalam hitungan menit · <b class="c-rev">Ulangan</b> (Review) dijadwalkan dalam hitungan hari · <b>Sudah hafal</b> jarak ulangnya ≥ 21 hari. <b>Ditunda</b> (Buried) muncul lagi besok, <b>Disembunyikan</b> (Suspended) tidak muncul sampai kamu munculkan lagi.</div></div>
      <div class="section-h"><span>FSRS vs SM-2</span></div>
      <div class="list"><div class="row" style="display:block"><b>FSRS</b> memodelkan Difficulty, Stability, Retrievability dan menjadwalkan sesuai <i>desired retention</i> (default 90%). Tekan "Optimalkan" setelah punya ratusan ulasan agar parameternya menyesuaikan otakmu. <b>SM-2</b> memakai ease factor klasik (250%).</div></div>
      <div class="section-h"><span>Pintasan keyboard (saat belajar)</span></div>
      <div class="list"><div class="row" style="display:block"><kbd>Spasi</kbd>/<kbd>Enter</kbd> lihat jawaban / Ingat · <kbd>1</kbd>–<kbd>4</kbd> Lupa–Gampang · <kbd>R</kbd> putar audio · <kbd>E</kbd> edit · <kbd>U</kbd>/<kbd>Ctrl+Z</kbd> undo · <kbd>-</kbd> bury · <kbd>@</kbd> suspend · <kbd>Ctrl+1..7</kbd> flag · <kbd>I</kbd> info kartu · <kbd>Esc</kbd> keluar</div></div>
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
    if (G.Sync) G.Sync.init();
    initTabs();
    let tab = 'decks'; try { tab = localStorage.getItem('lekat.tab') || 'decks'; } catch (e) {}
    if (!TABS.some(t => t[0] === tab)) tab = 'decks';
    go(tab);
    // refresh daftar deck saat kembali ke tab (hari berganti, learning jatuh tempo)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !G.Review.active() && App.tab === 'decks') renderDecks(); });
    setInterval(() => { if (!document.hidden && !G.Review.active() && App.tab === 'decks' && !document.querySelector('.sheet')) renderDecks(); }, 60000);
    G.IO.autoBackup();
    // tunggu sebentar: kalau sudah login, data dari cloud masuk dulu sebelum layar sambutan
    setTimeout(() => { if (!DB.meta('onboarded') && !DB.mem.cards.size && !document.querySelector('.sheet') && !(G.Sync && G.Sync.isOn())) onboarding(); }, 2500);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  function onboarding() {
    let goal = 10, starter = true;
    const sh = UI.sheet({ title: '', left: ' ', onClose: () => DB.meta('onboarded', true), body: `
      <div class="ob">
        <div class="logo">L</div>
        <h2>Selamat datang di Lekat</h2>
        <p class="muted">Hafal kosakata bahasa Inggris tanpa harus menghafal ulang terus.</p>
        <div class="ob-steps">
          <div><span class="row-ico" style="background:var(--tint)">${icon('book')}</span><div><b>Lihat kartu</b><br><span class="muted">Coba ingat jawabannya dulu, baru buka.</span></div></div>
          <div><span class="row-ico" style="background:var(--green)">${icon('check')}</span><div><b>Jujur menilai</b><br><span class="muted">Pilih Lupa, Susah, Ingat, atau Gampang.</span></div></div>
          <div><span class="row-ico" style="background:var(--purple)">${icon('sparkle')}</span><div><b>Lekat yang atur jadwal</b><br><span class="muted">Kartu muncul lagi tepat sebelum kamu lupa.</span></div></div>
        </div>
        <div class="section-h" style="margin-left:4px"><span>Kartu baru per hari</span></div>
        ${UI.seg('goal', [['5', '5 · santai'], ['10', '10 · normal'], ['20', '20 · serius']], '10')}
        <div class="list" style="margin-top:14px"><div class="row"><div class="grow">Pasang paket kata awal<div class="t2">50 kosakata + grammar + latihan dengar</div></div>${UI.sw('starter', true)}</div></div>
        <button type="button" class="btn primary block" id="obGo" style="margin-top:20px">Mulai</button>
        ${G.Sync && G.Sync.state() !== 'local' ? '<button type="button" class="btn secondary block" id="obLogin" style="margin-top:10px">Sudah punya data? Masuk</button>' : ''}
      </div>` });
    UI.bindSeg(sh.body, (n, v) => { goal = +v; });
    const ol = $('#obLogin', sh.body); if (ol) ol.onclick = () => { DB.meta('onboarded', true); sh.close(); G.Sync.loginSheet(); };
    $('#obGo', sh.body).onclick = () => {
      starter = sh.body.querySelector('[name=starter]').checked;
      const p = DB.get('presets', 1); p.newPerDay = goal; DB.put('presets', p);
      if (starter && !DB.meta('starterInstalled')) G.Starter.installStarter();
      DB.meta('onboarded', true); sh.close(); renderDecks();
    };
  }

  G.App = App;
  boot();
})(window);
