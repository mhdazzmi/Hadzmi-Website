// Lekat — layar belajar: tampil pertanyaan → jawaban → Again/Hard/Good/Easy, undo, audio/TTS, bury/suspend/flag.
(function (G) {
  'use strict';
  const { DB, Col, UI, Sched, Render } = G;
  const { $, esc, icon } = UI;
  let S = null; // state sesi
  const FLAGS = [[1, 'Merah'], [2, 'Oranye'], [3, 'Hijau'], [4, 'Biru'], [5, 'Pink'], [6, 'Toska'], [7, 'Ungu']];

  // ---------- Audio ----------
  let audioQueue = [], curAudio = null;
  function stopAudio() { audioQueue = []; if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; } if (window.speechSynthesis) speechSynthesis.cancel(); document.querySelectorAll('.play-btn.playing').forEach(b => b.classList.remove('playing')); }
  function pickVoice(lang) {
    if (!window.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices(); const want = DB.meta('voice');
    return vs.find(v => v.name === want) || vs.find(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase() && /google|samantha|natural|premium|enhanced/i.test(v.name)) || vs.find(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) || vs.find(v => v.lang.slice(0, 2) === lang.slice(0, 2));
  }
  function speak(text, lang, rate, btn) {
    return new Promise(res => {
      if (!window.speechSynthesis) return res();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'en-US'; u.rate = rate || 0.95;
      const v = pickVoice(u.lang); if (v) u.voice = v;
      if (btn) btn.classList.add('playing');
      const done = () => { if (btn) btn.classList.remove('playing'); res(); };
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    });
  }
  function playBtn(btn, rate) {
    if (btn.dataset.tts) return speak(btn.dataset.tts, btn.dataset.lang, rate, btn);
    return new Promise(res => {
      const a = new Audio(Render.mediaUrl(btn.dataset.sound)); curAudio = a;
      btn.classList.add('playing');
      const done = () => { btn.classList.remove('playing'); res(); };
      a.onended = done; a.onerror = done; a.play().catch(done);
    });
  }
  async function playAll(root, rate) {
    stopAudio();
    const btns = [...root.querySelectorAll('.play-btn')];
    const token = audioQueue = btns.slice();
    for (const b of btns) { if (audioQueue !== token) return; await playBtn(b, rate); }
  }

  // ---------- Sesi ----------
  function start(deck, opts) {
    if (S) close();
    const el = UI.h(`<div class="review" role="dialog" aria-label="Belajar">
      <div class="rv-top">
        <button type="button" class="circle-btn glass" id="rvClose" aria-label="Keluar">${icon('close')}</button>
        <div class="rv-status"><div class="rv-left" id="rvCounts"></div><div class="rv-prog"><i id="rvProg"></i></div></div>
        <button type="button" class="circle-btn glass" id="rvUndo" aria-label="Undo">${icon('undo')}</button>
        <button type="button" class="circle-btn glass" id="rvMore" aria-label="Lainnya">${icon('more')}</button>
      </div>
      <div class="rv-scroll" id="rvScroll"><div class="rv-kindwrap" id="rvKind"></div><div class="rv-card" id="rvCard"></div><div class="rv-meta" id="rvMeta"></div></div>
      <div class="rv-bottom" id="rvBottom"></div></div>`);
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => el.classList.add('in'));
    S = { deck, el, card: null, side: 'q', t0: 0, undo: [], session: { shown: 0, revSinceNew: 0 }, done: 0, chain: (opts && opts.chain) || null, typed: '', timer: null };
    $('#rvClose', el).onclick = close;
    $('#rvUndo', el).onclick = undo;
    $('#rvMore', el).onclick = moreMenu;
    el.addEventListener('click', e => {
      const b = e.target.closest('.play-btn'); if (b) { e.preventDefault(); stopAudio(); playBtn(b, Col.preset(S.card ? S.card.deckId : 1).ttsRate); }
    });
    nextCard();
  }
  function active() { return !!S; }
  function close() {
    if (!S) return;
    stopAudio(); clearInterval(S.timer); clearTimeout(S.waitT);
    const el = S.el; S = null;
    el.classList.remove('in'); document.body.style.overflow = '';
    setTimeout(() => el.remove(), 450);
    G.App.refresh();
  }

  function updateTop(q) {
    let c = q ? { n: q.news.length, l: q.learnNow.length + q.learnToday.length, r: q.reviews.length } : Col.counts(S.deck);
    if (S.chain) { c = { n: 0, l: 0, r: 0 }; S.chain.forEach(id => { const d = DB.get('decks', id); if (!d) return; const k = Col.counts(d); c.n += k.n; c.l += k.l; c.r += k.r; }); }
    const cur = S.card ? (S.card.state === 'new' ? 'n' : S.card.state === 'review' ? 'r' : 'l') : '';
    $('#rvCounts', S.el).textContent = (c.n + c.l + c.r) ? `${c.n + c.l + c.r} lagi` + (S.done ? ` · ${S.done} selesai` : '') : (S.done ? `${S.done} selesai` : '');
    const left = c.n + c.l + c.r;
    $('#rvProg', S.el).style.width = (S.done + left ? (S.done / (S.done + left)) * 100 : 100) + '%';
    $('#rvUndo', S.el).disabled = !S.undo.length; $('#rvUndo', S.el).style.opacity = S.undo.length ? 1 : .35;
  }

  function nextCard() {
    clearTimeout(S.waitT);
    const r = Col.next(S.deck, S.session);
    if (!r.card) {
      if (S.chain) {
        const rest = S.chain.map(id => DB.get('decks', id)).filter(d => d && d.id !== S.deck.id && (() => { const c = Col.counts(d); return c.n + c.l + c.r > 0; })());
        if (rest.length) { S.deck = rest[0]; return nextCard(); }
      }
      S.card = null; updateTop(r.q);
      return finished(r.waitUntil);
    }
    S.card = r.card; S.side = 'q'; S.typed = ''; S.t0 = Date.now();
    if (r.card.state === 'new') S.session.revSinceNew = 0; else if (r.card.state === 'review') S.session.revSinceNew++;
    S.session.shown++;
    updateTop(r.q);
    showQuestion();
  }

  function cardHtml(html, card, nt) {
    const css = G.App.scopeCss(nt.css || '', '#rvCard .card');
    const flag = card.flag ? `<i class="rv-flag f${card.flag}"></i>` : '';
    return `<style>${css}</style>${flag}<div class="card card-content">${html}</div>`;
  }
  function showQuestion() {
    const card = S.card;
    let r;
    try { r = Render.renderCard(card); } catch (e) { console.error(e); UI.toast('Kartu rusak, dilewati'); card.buriedDay = Col.today(); DB.put('cards', card); return nextCard(); }
    S.render = r;
    const box = $('#rvCard', S.el);
    box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip');
    box.innerHTML = cardHtml(r.q, card, r.nt);
    const deck = DB.get('decks', card.deckId);
    const p = Col.preset(card.deckId);
    $('#rvMeta', S.el).textContent = deck ? deck.name.split('::').join(' › ') : '';
    const kind = card.state === 'new' ? ['k-new', 'Kartu baru'] : card.state === 'review' ? ['k-rev', 'Ulangan'] : card.state === 'relearning' ? ['k-lrn', 'Belajar lagi'] : ['k-lrn', 'Sedang dihafal'];
    $('#rvKind', S.el).innerHTML = `<span class="rv-kind ${kind[0]}">${kind[1]}</span>`;
    $('#rvBottom', S.el).innerHTML = `<button type="button" class="btn primary rv-show" id="rvShow">Lihat jawaban${p.showTimer ? ' <small id="rvTimer" style="opacity:.8;font-weight:500">0:00</small>' : ''}</button><div class="kbd-hint">Spasi: lihat jawaban · R: putar suara · E: edit · U: urungkan</div>`;
    $('#rvShow', S.el).onclick = showAnswer;
    const inp = box.querySelector('.type-input');
    if (inp) { setTimeout(() => inp.focus(), 350); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); showAnswer(); } }); }
    $('#rvScroll', S.el).scrollTop = 0;
    clearInterval(S.timer);
    if (p.showTimer) S.timer = setInterval(() => { const t = $('#rvTimer', S.el); if (!t) return; const s = Math.floor((Date.now() - S.t0) / 1000); t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
    if (p.autoplay) setTimeout(() => S && S.card === card && S.side === 'q' && playAll(box, p.ttsRate), 250);
    else stopAudio();
  }
  function showAnswer() {
    if (!S || !S.card || S.side === 'a') return;
    const card = S.card;
    const inp = $('#rvCard .type-input', S.el);
    S.typed = inp ? inp.value : '';
    const r = Render.renderCard(card, { typed: S.typed });
    S.side = 'a';
    const box = $('#rvCard', S.el);
    box.innerHTML = cardHtml(r.a, card, r.nt);
    const ans = box.querySelector('#answer');
    if (ans) setTimeout(() => { const sc = $('#rvScroll', S.el); const top = ans.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 80; if (top > sc.clientHeight * 0.4) sc.scrollTo({ top, behavior: 'smooth' }); }, 40);
    const p = Col.preset(card.deckId);
    const pv = Sched.preview(card, p, Date.now(), Col.today(), Col.dayOffset());
    const lab = ['Lupa', 'Susah', 'Ingat', 'Gampang'];
    $('#rvBottom', S.el).innerHTML = `<div class="ease-row">${[1, 2, 3, 4].map(g => `<button type="button" class="ease-btn e${g}" data-g="${g}">${p.showIntervals ? `<small>${Sched.fmtIvl(pv[g])}</small>` : ''}${lab[g - 1]}</button>`).join('')}</div>${(DB.meta('helpSeen') || 0) < 15 ? '<p class="ease-help">Seberapa ingat kamu? Jujur saja, Lekat akan atur kapan kartu ini muncul lagi.</p>' : ''}<div class="kbd-hint">1 Lupa · 2 Susah · 3/Spasi Ingat · 4 Gampang</div>`;
    S.el.querySelectorAll('.ease-btn').forEach(b => b.onclick = () => answer(+b.dataset.g));
    if (p.autoplay) {
      // putar audio yang hanya muncul di sisi belakang
      const qTexts = new Set([...new DOMParser().parseFromString(S.render.q, 'text/html').querySelectorAll('.play-btn')].map(b => b.dataset.tts || b.dataset.sound));
      const backOnly = [...box.querySelectorAll('.play-btn')].filter(b => !qTexts.has(b.dataset.tts || b.dataset.sound));
      stopAudio();
      (async () => { const token = audioQueue = backOnly.slice(); for (const b of backOnly) { if (audioQueue !== token) return; await playBtn(b, p.ttsRate); } })();
    }
  }
  function answer(g) {
    if (!S || !S.card || S.side !== 'a') return;
    UI.haptic(); stopAudio();
    const think = Date.now() - S.t0;
    const res = Col.answerCard(S.card, g, think, S.deck);
    S.undo.push(Object.assign(res.undo, { session: Object.assign({}, S.session), deckId0: S.deck.id }));
    if (S.undo.length > 30) S.undo.shift();
    S.done++;
    DB.meta('helpSeen', (DB.meta('helpSeen') || 0) + 1);
    if (res.leech) UI.toast('Kartu ini sering lupa. Coba tambahkan contoh kalimat atau gambar supaya lebih mudah diingat.');
    nextCard();
  }
  function undo() {
    if (!S || !S.undo.length) return;
    const u = S.undo.pop();
    const card = Col.undo(u);
    S.session = u.session; S.done = Math.max(0, S.done - 1);
    if (u.deckId0 !== S.deck.id) S.deck = DB.get('decks', u.deckId0) || S.deck;
    if (S.deck.filtered && card && !(S.deck.filtered.cids || []).includes(card.id)) { S.deck.filtered.cids.push(card.id); DB.put('decks', S.deck); }
    if (!card) return nextCard();
    S.card = card; S.side = 'q'; S.t0 = Date.now();
    updateTop(); showQuestion();
    UI.toast('Dibatalkan');
  }

  function finished(waitUntil) {
    const box = $('#rvCard', S.el);
    $('#rvMeta', S.el).textContent = ''; $('#rvKind', S.el).innerHTML = '';
    const today = Col.today();
    const logs = DB.list('revlog').filter(r => Col.dayOf(r.id) === today);
    const correct = logs.filter(r => r.ease > 1).length;
    const mins = Math.round(logs.reduce((a, r) => a + (r.time || 0), 0) / 60000);
    if (waitUntil) {
      const upd = () => {
        if (!S) return;
        const s = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
        const t = $('#rvWait', S.el); if (t) t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        if (s <= 0) nextCard(); else S.waitT = setTimeout(upd, 1000);
      };
      box.innerHTML = `<div class="rv-done"><div class="big">⏳</div><h2>Istirahat sebentar</h2><p class="muted">Kartu yang sedang dihafal muncul lagi dalam</p><div style="font-size:40px;font-weight:700;font-variant-numeric:tabular-nums" id="rvWait"></div><p class="muted" style="font-size:14px">Biarkan layar ini terbuka, atau kembali nanti.</p></div>`;
      $('#rvBottom', S.el).innerHTML = `<button type="button" class="btn secondary block" id="rvLater">Selesai untuk sekarang</button>`;
      $('#rvLater', S.el).onclick = close;
      upd(); return;
    }
    const st = (() => { const days = new Set(DB.list('revlog').map(r => Col.dayOf(r.id))); let d = today, n = 0; while (days.has(d)) { n++; d--; } return n; })();
    box.innerHTML = `<div class="rv-done"><div class="big">🎉</div><h2>Beres untuk hari ini!</h2>
      <p class="muted">${S.done} kartu di sesi ini · ${logs.length} ulasan hari ini · ${logs.length ? Math.round(correct / logs.length * 100) : 0}% benar · ${mins} menit</p>
      <p style="font-weight:600">🔥 ${st} hari beruntun</p>
      <p class="muted" style="font-size:14px">Mau lanjut? Pilih Latihan tambahan untuk menambah kartu baru atau mengulangi yang sulit.</p></div>`;
    $('#rvBottom', S.el).innerHTML = `<div style="display:flex;gap:10px;max-width:700px;margin:0 auto"><button type="button" class="btn secondary" style="flex:1" id="rvCustom">Latihan tambahan</button><button type="button" class="btn primary" style="flex:1" id="rvDone">Selesai</button></div>`;
    $('#rvDone', S.el).onclick = close;
    $('#rvCustom', S.el).onclick = () => { const d = S.deck; close(); setTimeout(() => G.App.deckOverview(d), 300); };
  }

  // ---------- Menu ----------
  function moreMenu() {
    if (!S) return;
    const c = S.card;
    UI.actions([
      c && { label: 'Edit kartu', icon: 'edit', fn: editCurrent },
      c && { label: 'Tandai dengan warna', icon: 'flag', fn: flagMenu },
      c && { label: 'Tunda ke besok', icon: 'moon', fn: () => buryCard(false) },
      c && { label: 'Tunda semua kartu dari kata ini', icon: 'moon', fn: () => buryCard(true) },
      c && { label: 'Sembunyikan kartu ini', icon: 'pause', fn: () => suspend(false) },
      c && { label: 'Sembunyikan semua kartu dari kata ini', icon: 'pause', fn: () => suspend(true) },
      c && { label: 'Putar suara lagi', icon: 'speaker', fn: replay },
      c && { label: 'Riwayat & info kartu', icon: 'info', fn: () => cardInfo(c) },
      c && { label: 'Ulang dari awal', icon: 'reset', fn: async () => { if (await UI.confirm('Ulang dari awal?', 'Kartu ini dianggap baru lagi.', 'Ulang')) { Col.resetCard(c); nextCard(); } } },
      { label: 'Pengaturan deck', icon: 'gear', fn: () => G.App.simpleOptions(DB.get('decks', c ? c.deckId : S.deck.id)) },
      c && { label: 'Hapus kartu ini', icon: 'trash', danger: true, fn: async () => { if (await UI.confirm('Hapus kartu ini?', 'Semua kartu dari kata/catatan ini ikut terhapus.', 'Hapus', true)) { Col.deleteNotes([c.noteId]); UI.toast('Note dihapus'); nextCard(); } } }
    ]);
  }
  function flagMenu() {
    const c = S.card;
    UI.actions([...FLAGS.map(([n, l]) => ({ label: (c.flag === n ? '✓ ' : '') + 'Tandai ' + l, fn: () => setFlag(n) })), { label: 'Hapus tanda', fn: () => setFlag(0) }]);
  }
  function setFlag(n) { const c = S.card; c.flag = c.flag === n ? 0 : n; DB.put('cards', c); const f = $('#rvCard .rv-flag', S.el); if (f) f.remove(); if (c.flag) $('#rvCard', S.el).insertAdjacentHTML('afterbegin', `<i class="rv-flag f${c.flag}"></i>`); UI.toast(c.flag ? 'Ditandai' : 'Tanda dihapus'); }
  function buryCard(note) {
    const t = Col.today();
    const list = note ? DB.list('cards').filter(x => x.noteId === S.card.noteId) : [S.card];
    list.forEach(x => { x.buriedDay = t; DB.put('cards', x); });
    UI.toast('Ditunda sampai besok'); nextCard();
  }
  function suspend(note) {
    const list = note ? DB.list('cards').filter(x => x.noteId === S.card.noteId) : [S.card];
    list.forEach(x => { x.suspended = true; DB.put('cards', x); });
    const ids = list.map(x => x.id);
    UI.toast('Kartu disembunyikan', { label: 'Urungkan', fn: () => { ids.forEach(id => { const x = DB.get('cards', id); if (x) { x.suspended = false; DB.put('cards', x); } }); if (S) updateTop(); } });
    nextCard();
  }
  function replay() { const box = $('#rvCard', S.el); playAll(box, Col.preset(S.card.deckId).ttsRate); }
  function editCurrent() {
    const c = S.card;
    G.Editor.editNote(c.noteId, () => {
      if (!S) return;
      const still = DB.get('cards', c.id);
      if (!still) return nextCard();
      S.card = still; const side = S.side; S.side = 'q'; showQuestion(); if (side === 'a') showAnswer();
    });
  }

  // ---------- Info kartu ----------
  function fmtDate(ms) { return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function cardInfo(card) {
    const note = DB.get('notes', card.noteId), nt = DB.get('notetypes', note.typeId), deck = DB.get('decks', card.deckId);
    const logs = DB.list('revlog').filter(r => r.cid === card.id).sort((a, b) => b.id - a.id);
    const today = Col.today();
    const R = Col.retr(card, Date.now());
    const due = card.state === 'new' ? 'Baru #' + card.due : card.state === 'review' ? fmtDate(Col.dayStart(card.due) + 3600000) + ` (${card.due - today >= 0 ? card.due - today + ' hari lagi' : 'terlambat ' + (today - card.due) + ' hari'})` : new Date(card.due).toLocaleString('id-ID');
    const avg = logs.length ? (logs.reduce((a, r) => a + (r.time || 0), 0) / logs.length / 1000).toFixed(1) + ' dtk' : '-';
    const tname = nt.kind === 'std' ? (nt.tmpls[card.ord] || {}).name : nt.kind === 'cloze' ? 'Cloze ' + (card.ord + 1) : 'Occlusion ' + (card.ord + 1);
    const typeLbl = ['Hafalan', 'Ulangan', 'Belajar lagi', 'Manual'];
    UI.sheet({ title: 'Info kartu', body: `
      <div class="list"><div class="row" style="display:block"><div class="info-grid">
        <div>Ditambahkan</div><div>${fmtDate(card.created || card.id)}</div>
        <div>Pertama diulas</div><div>${logs.length ? fmtDate(logs[logs.length - 1].id) : '-'}</div>
        <div>Terakhir diulas</div><div>${logs.length ? fmtDate(logs[0].id) : '-'}</div>
        <div>Status</div><div>${card.state}${card.suspended ? ' · suspended' : ''}${Col.isBuried(card, today) ? ' · buried' : ''}</div>
        <div>Jatuh tempo</div><div>${due}</div>
        <div>Interval</div><div>${card.ivl ? card.ivl + ' hari' : '-'}</div>
        <div>Ease (SM-2)</div><div>${card.ease ? Math.round(card.ease * 100) + '%' : '-'}</div>
        <div>Stability (FSRS)</div><div>${card.s ? card.s.toFixed(1) + ' hari' : '-'}</div>
        <div>Difficulty (FSRS)</div><div>${card.d ? (card.d * 10).toFixed(0) + '%' : '-'}</div>
        <div>Retrievability</div><div>${card.s ? Math.round(R * 100) + '%' : '-'}</div>
        <div>Ulasan / Lupa</div><div>${card.reps || 0} / ${card.lapses || 0}</div>
        <div>Rata-rata waktu</div><div>${avg}</div>
        <div>Note type / kartu</div><div>${esc(nt.name)} · ${esc(tname || '')}</div>
        <div>Deck</div><div>${esc(deck ? deck.name : '-')}</div>
        <div>ID kartu / note</div><div style="font-family:var(--mono);font-size:12px">${card.id} / ${note.id}</div>
      </div></div></div>
      <div class="section-h"><span>Riwayat ulasan</span></div>
      <div class="list"><div class="row" style="display:block">${logs.length ? `<table class="stat-table"><tr style="color:var(--label2)"><td>Tanggal</td><td>Tipe</td><td>Nilai</td><td>Interval</td></tr>${logs.map(r => `<tr><td>${fmtDate(r.id)}</td><td>${typeLbl[r.type] || ''}</td><td style="color:${['', 'var(--red-ink)', 'var(--label2)', 'var(--green-ink)', 'var(--tint-ink)'][r.ease]}">${['', 'Lupa', 'Susah', 'Ingat', 'Gampang'][r.ease]}</td><td>${r.ivl > 0 ? r.ivl + 'h' : Math.round(-r.ivl / 60) + 'm'}</td></tr>`).join('')}</table>` : '<div class="muted">Belum pernah diulas</div>'}</div></div>` });
  }

  // ---------- Keyboard ----------
  document.addEventListener('keydown', e => {
    if (!S || document.querySelector('.sheet, .alert-back, .actsheet')) return;
    const inInput = e.target.closest('input,textarea,[contenteditable]');
    if (e.key === 'Escape') { e.preventDefault(); return close(); }
    if (inInput) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
    if ((e.ctrlKey || e.metaKey) && /^[0-7]$/.test(e.key) && S.card) { e.preventDefault(); return setFlag(+e.key); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); if (S.side === 'q') showAnswer(); else if (S.card) answer(3); return; }
    if (/^[1-4]$/.test(k) && S.side === 'a') { e.preventDefault(); return answer(+k); }
    if (!S.card) return;
    const lk = k.toLowerCase();
    if (lk === 'r' || k === 'F5') { e.preventDefault(); replay(); }
    else if (lk === 'e') { e.preventDefault(); editCurrent(); }
    else if (lk === 'u') { e.preventDefault(); undo(); }
    else if (k === '-') { e.preventDefault(); buryCard(false); }
    else if (k === '=') { e.preventDefault(); buryCard(true); }
    else if (k === '@') { e.preventDefault(); suspend(false); }
    else if (k === '!') { e.preventDefault(); suspend(true); }
    else if (lk === 'i') { e.preventDefault(); cardInfo(S.card); }
  });

  G.Review = { start, active, close, speak, cardInfo, stopAudio, playAll };
})(window);
