// Lekat — koleksi: note type, pembuatan kartu, deck & preset, antrean belajar harian, pencarian, bury/suspend/flag.
(function (G) {
  'use strict';
  const { DB, Sched } = G;
  const DAY = 86400000;

  // ---------- Note type bawaan ----------
  const CSS_BASE = '.card{font-size:24px;text-align:center;line-height:1.45}';
  const BUILTIN_TYPES = [
    { key: 'basic', name: 'Basic', kind: 'std', fields: ['Front', 'Back'], tmpls: [
      { name: 'Kartu 1', q: '{{Front}}', a: '{{FrontSide}}\n<hr id="answer">\n{{Back}}' }] },
    { key: 'basic-rev', name: 'Basic (and reversed card)', kind: 'std', fields: ['Front', 'Back'], tmpls: [
      { name: 'Kartu 1', q: '{{Front}}', a: '{{FrontSide}}\n<hr id="answer">\n{{Back}}' },
      { name: 'Kartu 2', q: '{{Back}}', a: '{{FrontSide}}\n<hr id="answer">\n{{Front}}' }] },
    { key: 'basic-opt', name: 'Basic (optional reversed card)', kind: 'std', fields: ['Front', 'Back', 'Add Reverse'], tmpls: [
      { name: 'Kartu 1', q: '{{Front}}', a: '{{FrontSide}}\n<hr id="answer">\n{{Back}}' },
      { name: 'Kartu 2', q: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', a: '{{FrontSide}}\n<hr id="answer">\n{{Front}}' }] },
    { key: 'basic-type', name: 'Basic (type in the answer)', kind: 'std', fields: ['Front', 'Back'], tmpls: [
      { name: 'Kartu 1', q: '{{Front}}\n\n{{type:Back}}', a: '{{Front}}\n<hr id="answer">\n{{type:Back}}' }] },
    { key: 'cloze', name: 'Cloze', kind: 'cloze', fields: ['Text', 'Back Extra'], tmpls: [
      { name: 'Cloze', q: '{{cloze:Text}}', a: '{{cloze:Text}}<br>\n<div class="extra">{{Back Extra}}</div>' }] },
    { key: 'io', name: 'Image Occlusion', kind: 'io', fields: ['Image', 'Header', 'Back Extra', 'Occlusions'], tmpls: [
      { name: 'Occlusion', q: '{{#Header}}<div class="io-header">{{Header}}</div>{{/Header}}\n{{image-occlusion}}', a: '{{#Header}}<div class="io-header">{{Header}}</div>{{/Header}}\n{{image-occlusion}}\n<div class="extra">{{Back Extra}}</div>' }] },
    { key: 'en-vocab', name: 'English Vocab', kind: 'std', fields: ['Word', 'Meaning', 'Pronunciation', 'Example', 'Example Meaning', 'Notes'], tmpls: [
      { name: 'Kata → Arti', q: '<div class="word">{{Word}}</div>\n{{#Pronunciation}}<div class="ipa">{{Pronunciation}}</div>{{/Pronunciation}}\n{{tts en_US:Word}}',
        a: '{{FrontSide}}\n<hr id="answer">\n<div class="meaning">{{Meaning}}</div>\n{{#Example}}<div class="example">{{Example}} {{tts en_US:Example}}</div>{{/Example}}\n{{#Example Meaning}}<div class="example-id">{{Example Meaning}}</div>{{/Example Meaning}}\n{{#Notes}}<div class="extra">{{Notes}}</div>{{/Notes}}' },
      { name: 'Arti → Kata (ketik)', q: '<div class="meaning">{{Meaning}}</div>\n{{#Example Meaning}}<div class="example-id">{{Example Meaning}}</div>{{/Example Meaning}}\n{{type:Word}}',
        a: '<div class="meaning">{{Meaning}}</div>\n<hr id="answer">\n{{type:Word}}\n<div class="word">{{Word}}</div>\n{{#Pronunciation}}<div class="ipa">{{Pronunciation}}</div>{{/Pronunciation}}\n{{tts en_US:Word}}\n{{#Example}}<div class="example">{{Example}}</div>{{/Example}}' }] },
    { key: 'en-listen', name: 'English Listening', kind: 'std', fields: ['Sentence', 'Meaning', 'Notes'], tmpls: [
      { name: 'Dengar → Tulis', q: '<div class="listen-hint">🎧 Dengarkan lalu ketik kalimatnya</div>\n{{tts en_US:Sentence}}\n{{type:Sentence}}',
        a: '{{tts en_US:Sentence}}\n<hr id="answer">\n{{type:Sentence}}\n<div class="meaning">{{Meaning}}</div>\n{{#Notes}}<div class="extra">{{Notes}}</div>{{/Notes}}' }] }
  ];

  const DEFAULT_PRESET = {
    name: 'Default', newPerDay: 20, revPerDay: 200, learnSteps: [1, 10], relearnSteps: [10],
    gradIvl: 1, easyIvl: 4, startEase: 2.5, easyBonus: 1.3, hardIvl: 1.2, ivlMod: 1, maxIvl: 36500, lapseNewIvl: 0, minLapseIvl: 1,
    leechThreshold: 8, leechAction: 'tag', algorithm: 'fsrs', retention: 0.9, w: null, fuzz: true,
    newOrder: 'sequential', mixOrder: 'mix', reviewOrder: 'due', buryNew: true, buryReview: true, newIgnoreReviewLimit: true,
    autoplay: true, ttsRate: 0.95, showTimer: false, showIntervals: true
  };

  const Col = {
    BUILTIN_TYPES, DEFAULT_PRESET,
    rollover() { return DB.meta('rollover') ?? 4; },
    dayOffset() { return new Date().getTimezoneOffset() * 60000 + Col.rollover() * 3600000; },
    today(now) { return Math.floor(((now || Date.now()) - Col.dayOffset()) / DAY); },
    dayStart(day) { return day * DAY + Col.dayOffset(); },
    dayOf(ms) { return Math.floor((ms - Col.dayOffset()) / DAY); },

    ensureDefaults() {
      if (!DB.get('presets', 1)) DB.put('presets', Object.assign({ id: 1 }, JSON.parse(JSON.stringify(DEFAULT_PRESET))));
      for (const t of BUILTIN_TYPES) {
        if (!DB.list('notetypes').some(n => n.key === t.key)) {
          DB.put('notetypes', Object.assign({ id: DB.newId(), builtin: true, css: CSS_BASE }, JSON.parse(JSON.stringify(t))));
        }
      }
      if (!DB.list('decks').some(d => !d.filtered)) DB.put('decks', { id: 1, name: 'Default', presetId: 1, desc: '', today: {} });
      if (DB.meta('nextPos') == null) DB.meta('nextPos', 1);
    },
    typeByKey(k) { return DB.list('notetypes').find(t => t.key === k); },

    // ---------- Deck ----------
    decks() { return DB.list('decks').sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })); },
    deckByName(name, create) {
      name = name.split('::').map(s => s.trim()).filter(Boolean).join('::') || 'Default';
      let d = DB.list('decks').find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!d && create) {
        // buat parent juga
        const parts = name.split('::');
        for (let i = 1; i < parts.length; i++) Col.deckByName(parts.slice(0, i).join('::'), true);
        d = DB.put('decks', { id: DB.newId(), name, presetId: 1, desc: '', today: {} });
      }
      return d;
    },
    subtreeIds(deckId) {
      const d = DB.get('decks', deckId); if (!d) return [];
      const pre = d.name.toLowerCase() + '::';
      return DB.list('decks').filter(x => !x.filtered && (x.id === d.id || x.name.toLowerCase().startsWith(pre))).map(x => x.id);
    },
    preset(deckOrId) {
      const d = typeof deckOrId === 'object' ? deckOrId : DB.get('decks', deckOrId);
      return Object.assign({}, DEFAULT_PRESET, DB.get('presets', d && d.presetId) || DB.get('presets', 1));
    },
    renameDeck(id, newName) {
      const d = DB.get('decks', id); const old = d.name;
      newName = newName.split('::').map(s => s.trim()).filter(Boolean).join('::');
      if (!newName) return;
      for (const x of DB.list('decks')) {
        if (x.id === id) { x.name = newName; DB.put('decks', x); }
        else if (x.name.toLowerCase().startsWith(old.toLowerCase() + '::')) { x.name = newName + x.name.slice(old.length); DB.put('decks', x); }
      }
      const parts = newName.split('::');
      for (let i = 1; i < parts.length; i++) Col.deckByName(parts.slice(0, i).join('::'), true);
    },
    deleteDeck(id) {
      const d = DB.get('decks', id);
      if (d.filtered) { DB.del('decks', id); return; }
      const ids = Col.subtreeIds(id);
      const notes = new Set();
      for (const c of DB.list('cards')) if (ids.includes(c.deckId)) { DB.del('cards', c.id); notes.add(c.noteId); }
      for (const nid of notes) if (!DB.list('cards').some(c => c.noteId === nid)) DB.del('notes', nid);
      ids.forEach(i => DB.del('decks', i));
      Col.ensureDefaults();
    },
    counter(deck, today) {
      if (!deck.today || deck.today.day !== today) deck.today = { day: today, newDone: 0, revDone: 0, ms: 0 };
      return deck.today;
    },
    bumpCounters(deckId, kind, ms) {
      const today = Col.today();
      const d = DB.get('decks', deckId); if (!d) return;
      const parts = d.name.split('::');
      for (let i = 1; i <= parts.length; i++) {
        const dd = Col.deckByName(parts.slice(0, i).join('::'));
        if (!dd) continue;
        const c = Col.counter(dd, today);
        if (kind === 'new') c.newDone++; else if (kind === 'rev') c.revDone++;
        c.ms += ms || 0;
        DB.put('decks', dd);
      }
    },

    // ---------- Note & kartu ----------
    fieldsUsedNonEmpty(nt, note, tmpl) {
      const html = G.Render.renderTemplate(tmpl.q, note, nt, { ord: 0, side: 'q', probe: true });
      return G.Render.stripHtml(html).trim().length > 0 || /<img|\[sound:|data-tts/i.test(html);
    },
    cardOrds(nt, note) {
      if (nt.kind === 'cloze') {
        const set = new Set();
        for (const f of nt.fields) (note.fields[f] || '').replace(/\{\{c(\d+)::/g, (_, n) => set.add(+n - 1));
        return [...set].sort((a, b) => a - b);
      }
      if (nt.kind === 'io') {
        const occ = G.Render.parseOcc(note.fields.Occlusions);
        const set = new Set(occ.shapes.map(s => (s.c || 1) - 1));
        return [...set].sort((a, b) => a - b);
      }
      return nt.tmpls.map((t, i) => Col.fieldsUsedNonEmpty(nt, note, t) ? i : -1).filter(i => i >= 0);
    },
    addNote(typeId, fields, tags, deckId) {
      const nt = DB.get('notetypes', typeId);
      const note = { id: DB.newId(), typeId, fields: {}, tags: (tags || []).filter(Boolean), created: Date.now() };
      nt.fields.forEach(f => note.fields[f] = fields[f] || '');
      const ords = Col.cardOrds(nt, note);
      if (!ords.length) return { error: nt.kind === 'cloze' ? 'Tidak ada cloze. Tandai teks dengan {{c1::...}}' : 'Kartu kosong: isi field yang dipakai di sisi depan.' };
      DB.put('notes', note);
      ords.forEach(o => Col.newCard(note, o, deckId));
      return { note, count: ords.length };
    },
    newCard(note, ord, deckId) {
      const pos = DB.meta('nextPos') || 1; DB.meta('nextPos', pos + 1);
      return DB.put('cards', { id: DB.newId(), noteId: note.id, ord, deckId, state: 'new', due: pos, ivl: 0, ease: 0, step: 0, reps: 0, lapses: 0, flag: 0, suspended: false, buriedDay: null, s: null, d: null, lastReview: null, created: Date.now() });
    },
    updateNote(note) {
      const nt = DB.get('notetypes', note.typeId);
      DB.put('notes', note);
      const cards = DB.list('cards').filter(c => c.noteId === note.id);
      const ords = Col.cardOrds(nt, note);
      const deckId = cards[0] ? cards[0].deckId : 1;
      for (const o of ords) if (!cards.some(c => c.ord === o)) Col.newCard(note, o, deckId);
      // kartu kosong (ord yang tak lagi ada) dihapus — seperti "Empty Cards" di Anki
      for (const c of cards) if (!ords.includes(c.ord) && ords.length) DB.del('cards', c.id);
    },
    deleteNotes(noteIds) {
      const set = new Set(noteIds);
      for (const c of DB.list('cards')) if (set.has(c.noteId)) DB.del('cards', c.id);
      set.forEach(id => DB.del('notes', id));
    },
    siblings(card) { return DB.list('cards').filter(c => c.noteId === card.noteId && c.id !== card.id); },
    isBuried(c, today) { return c.buriedDay != null && c.buriedDay >= today; },
    resetCard(c) { const pos = DB.meta('nextPos') || 1; DB.meta('nextPos', pos + 1); Object.assign(c, { state: 'new', due: pos, ivl: 0, ease: 0, step: 0, reps: 0, lapses: 0, s: null, d: null, lastReview: null }); DB.put('cards', c); },

    // ---------- Antrean harian ----------
    hashOrder(id, day) { let x = (id ^ (day * 2654435761)) >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; },
    studyCards(deck) {
      if (deck.filtered) {
        const set = new Set(deck.filtered.cids || []);
        return DB.list('cards').filter(c => set.has(c.id));
      }
      const ids = new Set(Col.subtreeIds(deck.id));
      return DB.list('cards').filter(c => ids.has(c.deckId));
    },
    // Hitung batas per deck (deck terpilih dan sub-deck masing-masing dibatasi preset-nya sendiri)
    limits(deck, today) {
      const p = Col.preset(deck);
      const c = Col.counter(deck, today);
      return { newLeft: Math.max(0, p.newPerDay - c.newDone), revLeft: Math.max(0, p.revPerDay - c.revDone), p };
    },
    queues(deck, now) {
      now = now || Date.now();
      const today = Col.today(now), endOfDay = Col.dayStart(today + 1);
      const cards = Col.studyCards(deck).filter(c => !c.suspended && !Col.isBuried(c, today));
      const learnNow = [], learnToday = [];
      let reviews = [], news = [];
      for (const c of cards) {
        if (c.state === 'learning' || c.state === 'relearning') { if (c.due <= now) learnNow.push(c); else if (c.due < endOfDay) learnToday.push(c); }
        else if (c.state === 'review' && (deck.filtered || c.due <= today)) reviews.push(c);
        else if (c.state === 'new') news.push(c);
      }
      learnNow.sort((a, b) => a.due - b.due); learnToday.sort((a, b) => a.due - b.due);
      if (deck.filtered) {
        return { learnNow, learnToday, reviews: reviews.sort((a, b) => a.due - b.due), news: news.sort((a, b) => a.due - b.due), today };
      }
      // batas per sub-deck
      const top = Col.limits(deck, today);
      const p = top.p;
      const perDeckNew = {}, perDeckRev = {};
      const leftNew = (id) => { if (!(id in perDeckNew)) perDeckNew[id] = Col.limits(DB.get('decks', id), today).newLeft; return perDeckNew[id]; };
      const leftRev = (id) => { if (!(id in perDeckRev)) perDeckRev[id] = Col.limits(DB.get('decks', id), today).revLeft; return perDeckRev[id]; };
      // urutan ulasan: jatuh tempo (terlambat duluan), lalu acak stabil per hari
      if (p.reviewOrder === 'random') reviews.sort((a, b) => Col.hashOrder(a.id, today) - Col.hashOrder(b.id, today));
      else if (p.reviewOrder === 'retrievability') reviews.sort((a, b) => Col.retr(a, now) - Col.retr(b, now));
      else reviews.sort((a, b) => (a.due - b.due) || (Col.hashOrder(a.id, today) - Col.hashOrder(b.id, today)));
      const outRev = [];
      for (const c of reviews) { if (outRev.length >= top.revLeft) break; if (leftRev(c.deckId) > 0) { perDeckRev[c.deckId]--; outRev.push(c); } }
      // kartu baru: urut posisi / acak; urut deck sesuai pohon
      const order = Col.decks().map(d => d.id);
      if (p.newOrder === 'random') news.sort((a, b) => Col.hashOrder(a.noteId, today) - Col.hashOrder(b.noteId, today) || a.ord - b.ord);
      else news.sort((a, b) => (order.indexOf(a.deckId) - order.indexOf(b.deckId)) || (a.due - b.due) || a.ord - b.ord);
      let newCap = top.newLeft;
      if (!p.newIgnoreReviewLimit) newCap = Math.min(newCap, Math.max(0, top.revLeft - outRev.length));
      const outNew = [];
      const seenNote = new Set();
      for (const c of news) {
        if (outNew.length >= newCap) break;
        if (p.buryNew && seenNote.has(c.noteId)) continue; // satu kartu baru per note per hari
        if (leftNew(c.deckId) > 0) { perDeckNew[c.deckId]--; outNew.push(c); seenNote.add(c.noteId); }
      }
      return { learnNow, learnToday, reviews: outRev, news: outNew, today };
    },
    counts(deck) {
      const q = Col.queues(deck);
      return { n: q.news.length, l: q.learnNow.length + q.learnToday.length, r: q.reviews.length };
    },
    retr(c, now) { if (!c.s || !c.lastReview) return 1; return Sched.fsrs.R(Math.max(0, (now - c.lastReview) / DAY), c.s); },
    // Ambil kartu berikutnya. session: {shown, revSinceNew}
    next(deck, session) {
      const now = Date.now();
      const q = Col.queues(deck, now);
      if (q.learnNow.length) return { card: q.learnNow[0], q };
      const p = Col.preset(deck);
      const hasR = q.reviews.length, hasN = q.news.length;
      let pick = null;
      if (hasR && hasN) {
        if (p.mixOrder === 'newFirst') pick = q.news[0];
        else if (p.mixOrder === 'reviewFirst') pick = q.reviews[0];
        else {
          const every = Math.max(1, Math.floor((hasR + hasN) / hasN));
          pick = (session.revSinceNew + 1 >= every) ? q.news[0] : q.reviews[0];
        }
      } else pick = q.reviews[0] || q.news[0];
      if (pick) return { card: pick, q };
      // learn ahead 20 menit
      const ahead = (DB.meta('learnAhead') ?? 20) * 60000;
      if (q.learnToday.length && q.learnToday[0].due <= now + ahead) return { card: q.learnToday[0], q };
      return { card: null, q, waitUntil: q.learnToday.length ? q.learnToday[0].due : null };
    },
    answerCard(card, g, thinkMs, deck) {
      const p = Col.preset(card.deckId);
      const now = Date.now(), today = Col.today(now);
      const before = JSON.parse(JSON.stringify(card));
      const wasNew = card.state === 'new', wasReview = card.state === 'review';
      const res = Sched.answer(card, g, p, now, today, Col.dayOffset());
      const c = res.card;
      Object.assign(card, c);
      const log = Object.assign({}, res.log, { id: DB.newId(), cid: card.id, time: Math.min(thinkMs || 0, 60000) }); // id unik walau jawaban dalam ms yang sama
      DB.putRaw('revlog', log);
      let leechHit = false;
      if (res.leech) {
        leechHit = true;
        const note = DB.get('notes', card.noteId);
        if (note && !note.tags.includes('leech')) { note.tags.push('leech'); DB.put('notes', note); }
        if (p.leechAction === 'suspend') card.suspended = true;
      }
      // filtered deck: kartu keluar dari deck saat sudah kembali ke tahap review
      if (deck && deck.filtered && card.state === 'review') {
        deck.filtered.cids = (deck.filtered.cids || []).filter(id => id !== card.id); DB.put('decks', deck);
      }
      DB.put('cards', card);
      // bury sibling
      const sib = Col.siblings(card);
      const buried = [];
      for (const s of sib) {
        if (s.suspended || Col.isBuried(s, today)) continue;
        if ((s.state === 'new' && p.buryNew) || (s.state === 'review' && p.buryReview)) { buried.push(JSON.parse(JSON.stringify(s))); s.buriedDay = today; DB.put('cards', s); }
      }
      Col.bumpCounters(card.deckId, wasNew ? 'new' : wasReview ? 'rev' : 'learn', log.time);
      return { undo: { before, logId: log.id, buried, wasNew, wasReview, deckId: card.deckId, ms: log.time }, leech: leechHit };
    },
    undo(u) {
      const card = DB.get('cards', u.before.id);
      if (card) { Object.assign(card, u.before); DB.put('cards', card); }
      DB.del('revlog', u.logId);
      for (const b of u.buried) { const s = DB.get('cards', b.id); if (s) { Object.assign(s, b); DB.put('cards', s); } }
      const today = Col.today();
      const d = DB.get('decks', u.deckId);
      if (d) {
        const parts = d.name.split('::');
        for (let i = 1; i <= parts.length; i++) {
          const dd = Col.deckByName(parts.slice(0, i).join('::')); if (!dd) continue;
          const c = Col.counter(dd, today);
          if (u.wasNew) c.newDone = Math.max(0, c.newDone - 1); else if (u.wasReview) c.revDone = Math.max(0, c.revDone - 1);
          c.ms = Math.max(0, c.ms - (u.ms || 0));
          DB.put('decks', dd);
        }
      }
      return card;
    },
    unburyAll() { for (const c of DB.list('cards')) if (c.buriedDay != null) { c.buriedDay = null; DB.put('cards', c); } },

    // ---------- Filtered deck ----------
    buildFiltered(deck) {
      const f = deck.filtered;
      let cards = Col.search(f.search || '').filter(c => !c.suspended && !Col.isBuried(c, Col.today()));
      const now = Date.now();
      if (f.order === 'random') cards.sort(() => Math.random() - 0.5);
      else if (f.order === 'due') cards.sort((a, b) => (a.state === 'review' ? a.due : 1e12) - (b.state === 'review' ? b.due : 1e12));
      else if (f.order === 'lapses') cards.sort((a, b) => (b.lapses || 0) - (a.lapses || 0));
      else if (f.order === 'retr') cards.sort((a, b) => Col.retr(a, now) - Col.retr(b, now));
      else if (f.order === 'added') cards.sort((a, b) => b.id - a.id);
      f.cids = cards.slice(0, f.limit || 100).map(c => c.id);
      DB.put('decks', deck);
      return f.cids.length;
    },

    // ---------- Pencarian (sintaks mirip Anki) ----------
    tokenize(q) {
      const out = []; let cur = '', quote = false;
      for (const ch of q) {
        if (ch === '"') { quote = !quote; continue; }
        if (!quote && /\s/.test(ch)) { if (cur) out.push(cur); cur = ''; continue; }
        cur += ch;
      }
      if (cur) out.push(cur);
      return out;
    },
    wild(s) { return new RegExp('^' + s.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/_/g, '.') + '$', 'i'); },
    search(query) {
      const toks = Col.tokenize(query || '');
      const today = Col.today(), now = Date.now();
      const notes = DB.mem.notes, types = DB.mem.notetypes, decks = DB.mem.decks;
      const groups = [[]]; // dukung "or" antar grup
      for (const t of toks) { if (t.toLowerCase() === 'or') groups.push([]); else if (t.toLowerCase() !== 'and') groups[groups.length - 1].push(t); }
      const textCache = new Map();
      const noteText = (n) => { if (!textCache.has(n.id)) textCache.set(n.id, G.Render.stripHtml(Object.values(n.fields).join(' \u001f ')).toLowerCase()); return textCache.get(n.id); };
      const deckMatch = (c, val) => {
        const d = decks.get(c.deckId); if (!d) return false;
        const re = Col.wild(val), name = d.name;
        if (re.test(name)) return true;
        const parts = name.split('::');
        for (let i = 1; i < parts.length; i++) if (re.test(parts.slice(0, i).join('::'))) return true;
        return false;
      };
      const cmp = (a, op, b) => op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : op === '<=' ? a <= b : op === '!=' ? a !== b : a === b;
      const test = (c, tok) => {
        let neg = false;
        if (tok[0] === '-' && tok.length > 1) { neg = true; tok = tok.slice(1); }
        const n = notes.get(c.noteId); if (!n) return false;
        let ok;
        const m = tok.match(/^([a-z_ ]+):(.*)$/i);
        if (m) {
          const k = m[1].toLowerCase(), v = m[2];
          if (k === 'deck') ok = v === '*' || deckMatch(c, v);
          else if (k === 'tag') ok = v === 'none' ? !n.tags.length : n.tags.some(t => Col.wild(v).test(t) || t.toLowerCase().startsWith(v.toLowerCase() + '::'));
          else if (k === 'is') {
            const vv = v.toLowerCase();
            ok = vv === 'new' ? c.state === 'new' : vv === 'learn' ? (c.state === 'learning' || c.state === 'relearning') : vv === 'review' ? (c.state === 'review' || c.state === 'relearning')
              : vv === 'due' ? (!c.suspended && ((c.state === 'review' && c.due <= today) || ((c.state === 'learning' || c.state === 'relearning') && c.due <= now)))
              : vv === 'suspended' ? c.suspended : vv === 'buried' ? Col.isBuried(c, today) : vv === 'leech' ? n.tags.includes('leech')
              : vv === 'flagged' ? c.flag > 0 : false;
          } else if (k === 'flag') ok = c.flag === +v;
          else if (k === 'note') ok = Col.wild(v).test((types.get(n.typeId) || {}).name || '');
          else if (k === 'card') { const nt = types.get(n.typeId); ok = (/^\d+$/.test(v) ? c.ord === +v - 1 : nt && nt.tmpls[c.ord] && Col.wild(v).test(nt.tmpls[c.ord].name)); }
          else if (k === 'added') ok = Col.dayOf(c.created || c.id) > today - (+v || 1);
          else if (k === 'rated' || k === 'introduced') {
            const [days, ease] = v.split(':'); const since = Col.dayStart(today - (+days || 1) + 1);
            ok = DB.list('revlog').some(r => r.cid === c.id && r.id >= since && (!ease || r.ease === +ease) && (k === 'rated' || r.type === 0));
          } else if (k === 'prop') {
            const pm = v.match(/^(ivl|due|reps|lapses|ease|s|d|r|pos)(>=|<=|!=|>|<|=)(-?[\d.]+)$/);
            if (!pm) ok = false; else {
              const [, key, op, num] = pm; const x = +num;
              const val = key === 'ivl' ? c.ivl : key === 'due' ? (c.state === 'review' ? c.due - today : 1e9) : key === 'ease' ? c.ease : key === 'r' ? Col.retr(c, now) : key === 'pos' ? (c.state === 'new' ? c.due : -1) : key === 's' ? (c.s || 0) : key === 'd' ? (c.d || 0) : c[key];
              ok = cmp(val, op, x);
            }
          } else if (k === 'cid') ok = v.split(',').map(Number).includes(c.id);
          else if (k === 'nid') ok = v.split(',').map(Number).includes(c.noteId);
          else {
            // field:nilai
            const f = Object.keys(n.fields).find(f => f.toLowerCase() === k);
            ok = f ? Col.wild(v.includes('*') ? v : v).test(G.Render.stripHtml(n.fields[f]).trim()) || (!v.includes('*') && G.Render.stripHtml(n.fields[f]).toLowerCase().includes(v.toLowerCase()))
              : noteText(n).includes(tok.toLowerCase());
          }
        } else {
          const s = tok.toLowerCase();
          ok = s.includes('*') ? new RegExp(s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')).test(noteText(n)) : noteText(n).includes(s);
        }
        return neg ? !ok : ok;
      };
      return DB.list('cards').filter(c => groups.some(g => g.every(t => test(c, t))));
    }
  };
  G.Col = Col;
})(window);
