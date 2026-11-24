// Lekat — impor/ekspor: CSV/TXT, paket Anki (.apkg/.colpkg legacy), cadangan .lekat, cadangan otomatis harian.
(function (G) {
  'use strict';
  const { DB, Col, UI, Render } = G;
  const { $, $$, esc, icon } = UI;
  const STORES = ['notes', 'cards', 'decks', 'presets', 'notetypes', 'revlog'];

  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function pick(accept) { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); }); }
  const blobToB64 = (b) => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(b); });
  const b64ToBlob = (s, type) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || '' }); };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const loadScript = (src) => new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src)); document.head.appendChild(s); });

  // ---------- Cadangan .lekat ----------
  async function snapshot(filter, withMedia) {
    const data = { app: 'lekat', version: 1, exported: Date.now(), stores: {}, media: [] };
    for (const s of STORES) data.stores[s] = DB.list(s).filter(o => !filter || filter(s, o));
    data.stores.meta = filter ? [] : DB.list('meta').filter(m => !String(m.id).startsWith('backup:'));
    if (withMedia) {
      const used = filter ? new Set(data.stores.notes.flatMap(n => Object.values(n.fields).join(' ').match(/(?:src=["']|\[sound:)([^"'\]]+)/g) || []).map(x => x.replace(/^(src=["']|\[sound:)/, ''))) : null;
      for (const m of DB.list('media')) if (!used || used.has(m.id)) data.media.push({ id: m.id, type: m.type, data: await blobToB64(m.blob) });
    }
    return data;
  }
  async function exportBackup() {
    UI.toast('Menyiapkan cadangan…');
    const data = await snapshot(null, true);
    download(`lekat-backup-${stamp()}.lekat`, JSON.stringify(data), 'application/json');
    DB.meta('lastExport', Date.now());
  }
  async function exportDeck(deck) {
    const ids = new Set(Col.subtreeIds(deck.id));
    const cardIds = new Set(DB.list('cards').filter(c => ids.has(c.deckId)).map(c => c.id));
    const noteIds = new Set(DB.list('cards').filter(c => cardIds.has(c.id)).map(c => c.noteId));
    const typeIds = new Set(DB.list('notes').filter(n => noteIds.has(n.id)).map(n => n.typeId));
    const r = await UI.alertBox({ title: 'Ekspor deck', msg: 'Sertakan progres belajar (jadwal & riwayat)?', buttons: [{ label: 'Batal' }, { label: 'Tanpa progres' }, { label: 'Dengan progres', style: 'bold' }] });
    if (r.i === 0) return;
    const withSched = r.i === 2;
    const presetIds = new Set(DB.list('decks').filter(d => ids.has(d.id)).map(d => d.presetId));
    const data = await snapshot((s, o) => s === 'decks' ? ids.has(o.id) : s === 'cards' ? cardIds.has(o.id) : s === 'notes' ? noteIds.has(o.id) : s === 'notetypes' ? typeIds.has(o.id) : s === 'revlog' ? withSched && cardIds.has(o.cid) : s === 'presets' ? presetIds.has(o.id) && o.id !== 1 : false, true);
    if (!withSched) data.stores.cards = data.stores.cards.map(c => Object.assign({}, c, { state: 'new', ivl: 0, ease: 0, step: 0, reps: 0, lapses: 0, s: null, d: null, lastReview: null, buriedDay: null, suspended: false, flag: 0 }));
    data.deckExport = true;
    download(`${deck.name.replace(/::/g, '-').replace(/[^\w-]+/g, '_')}.lekat`, JSON.stringify(data), 'application/json');
  }
  async function importLekat(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return UI.info('Gagal', 'File .lekat rusak.'); }
    if (data.app !== 'lekat') return UI.info('Gagal', 'Bukan file Lekat.');
    let replace = false;
    if (!data.deckExport) {
      const r = await UI.alertBox({ title: 'Impor cadangan', msg: 'Ganti seluruh koleksi di perangkat ini dengan cadangan ini, atau gabungkan?', buttons: [{ label: 'Batal' }, { label: 'Gabungkan' }, { label: 'Ganti semua', style: 'danger bold' }] });
      if (r.i === 0) return; replace = r.i === 2;
    }
    if (replace && G.Sync && G.Sync.isOn()) { try { await G.Sync.wipeRemote(); } catch (e) { return UI.info('Gagal', 'Data cloud tidak bisa diganti: ' + e.message); } }
    if (replace) await DB.wipe();
    let n = 0, upd = 0;
    for (const s of STORES) for (const o of data.stores[s] || []) {
      const ex = DB.get(s, o.id);
      if (ex && !replace) {
        if (s === 'notes' && (o.mod || 0) > (ex.mod || 0)) { DB.putRaw(s, o); upd++; }
        else if (s === 'cards' && (o.mod || 0) > (ex.mod || 0) && o.reps >= (ex.reps || 0)) DB.putRaw(s, o);
        continue;
      }
      if (s === 'decks' && !replace) { const same = DB.list('decks').find(d => d.name.toLowerCase() === o.name.toLowerCase() && d.id !== o.id); if (same) { remapDeck(data, o.id, same.id); continue; } }
      if (s === 'notetypes' && !replace) { const same = DB.list('notetypes').find(t => t.key && t.key === o.key && t.id !== o.id); if (same) { remapType(data, o.id, same.id); continue; } }
      DB.putRaw(s, o); if (s === 'notes') n++;
    }
    if (replace) for (const m of data.stores.meta || []) DB.putRaw('meta', m);
    for (const m of data.media || []) if (!DB.get('media', m.id)) DB.putRaw('media', { id: m.id, type: m.type, blob: b64ToBlob(m.data, m.type) });
    // pastikan posisi kartu baru berikutnya tidak bertabrakan
    const maxPos = Math.max(0, ...DB.list('cards').filter(c => c.state === 'new').map(c => c.due));
    if ((DB.meta('nextPos') || 0) <= maxPos) DB.meta('nextPos', maxPos + 1);
    Col.ensureDefaults(); await DB.flush();
    UI.info('Impor selesai', replace ? 'Koleksi dipulihkan dari cadangan.' : `${n} note baru${upd ? `, ${upd} diperbarui` : ''}.`);
    if (replace && G.Sync && G.Sync.state() !== 'local') G.Sync.start();
    G.App.refresh();
  }
  function remapDeck(data, from, to) { (data.stores.cards || []).forEach(c => { if (c.deckId === from) c.deckId = to; }); }
  function remapType(data, from, to) { (data.stores.notes || []).forEach(n => { if (n.typeId === from) n.typeId = to; }); }

  // cadangan otomatis harian (tanpa media), disimpan 3 terakhir di perangkat
  function autoBackup() {
    const today = Col.today();
    if (DB.meta('lastAutoBackupDay') === today || !DB.mem.cards.size) return;
    setTimeout(async () => {
      const data = await snapshot(null, false);
      DB.putRaw('meta', { id: 'backup:' + today, v: JSON.stringify(data), t: Date.now() });
      DB.meta('lastAutoBackupDay', today); DB.meta('lastAutoBackup', Date.now());
      DB.list('meta').filter(m => String(m.id).startsWith('backup:')).sort((a, b) => b.t - a.t).slice(3).forEach(m => DB.del('meta', m.id));
    }, 4000);
  }
  async function restoreAuto() {
    const list = DB.list('meta').filter(m => String(m.id).startsWith('backup:')).sort((a, b) => b.t - a.t);
    if (!list.length) return UI.info('Cadangan otomatis', 'Belum ada cadangan otomatis.');
    const i = await UI.actions(list.map(m => ({ label: new Date(m.t).toLocaleString('id-ID') })), 'Pulihkan cadangan otomatis');
    if (i < 0) return;
    if (!await UI.confirm('Pulihkan?', 'Koleksi saat ini diganti dengan cadangan ini (media tetap).', 'Pulihkan', true)) return;
    const data = JSON.parse(list[i].v);
    const keep = DB.list('meta');
    for (const s of STORES) { DB.list(s).forEach(o => DB.del(s, o.id)); (data.stores[s] || []).forEach(o => DB.putRaw(s, o)); }
    keep.forEach(m => DB.putRaw('meta', m));
    await DB.flush(); UI.toast('Dipulihkan'); G.App.refresh();
  }

  // ---------- CSV ----------
  function parseDelimited(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const opts = { sep: null, html: true, tagsCol: null, deckCol: null, notetype: null };
    const body = [];
    for (const l of lines) {
      const m = l.match(/^#(separator|html|tags column|deck column|notetype):(.*)$/i);
      if (m) { const k = m[1].toLowerCase(), v = m[2].trim(); if (k === 'separator') opts.sep = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ' }[v.toLowerCase()] || v; else if (k === 'html') opts.html = v === 'true'; else if (k === 'tags column') opts.tagsCol = +v - 1; else if (k === 'deck column') opts.deckCol = +v - 1; else opts.notetype = v; continue; }
      if (l.startsWith('#')) continue;
      body.push(l);
    }
    const txt = body.join('\n');
    if (!opts.sep) { const first = body.find(Boolean) || ''; const c = { '\t': (first.match(/\t/g) || []).length, ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '|': (first.match(/\|/g) || []).length }; opts.sep = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; if (!c[opts.sep]) opts.sep = '\t'; }
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"' && cur === '') { q = true; continue; }
      if (ch === opts.sep) { row.push(cur); cur = ''; continue; }
      if (ch === '\n') { row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; continue; }
      cur += ch;
    }
    row.push(cur); if (row.some(x => x.trim())) rows.push(row);
    return { rows, opts };
  }
  async function importCsv(file) {
    const { rows, opts } = parseDelimited(await file.text());
    if (!rows.length) return UI.info('Kosong', 'Tidak ada baris yang bisa diimpor.');
    const types = DB.list('notetypes');
    let nt = (opts.notetype && types.find(t => t.name.toLowerCase() === opts.notetype.toLowerCase())) || (rows[0].length >= 4 ? Col.typeByKey('en-vocab') : Col.typeByKey('basic')) || types[0];
    let deckId = (DB.meta('lastDeck') && DB.get('decks', DB.meta('lastDeck'))) ? DB.meta('lastDeck') : Col.decks().find(d => !d.filtered).id;
    const ncol = Math.max(...rows.map(r => r.length));
    let map = [];
    const autoMap = () => { map = []; for (let i = 0; i < ncol; i++) map.push(i === opts.tagsCol ? '__tags' : i === opts.deckCol ? '__deck' : (nt.fields.filter(f => f !== 'Occlusions')[i - [opts.tagsCol, opts.deckCol].filter(x => x != null && x < i).length] || '')); };
    autoMap();
    let header = false, dup = 'skip', allowHtml = opts.html;
    const sh = UI.sheet({ title: 'Impor ' + file.name, full: true, right: `<button type="button" class="btn-txt bold" id="ciGo">Impor</button>`, body: '<div id="ciB"></div>' });
    const b = $('#ciB', sh.body);
    function draw() {
      const sample = rows.slice(header ? 1 : 0, (header ? 1 : 0) + 3);
      b.innerHTML = `
        <div class="picker-row"><button type="button" class="picker" id="ciType"><small>Note type</small><b>${esc(nt.name)}</b></button><button type="button" class="picker" id="ciDeck"><small>Deck</small><b>${esc(DB.get('decks', deckId).name)}</b></button></div>
        <div class="list">
          <div class="row"><div class="grow">${rows.length} baris · pemisah "${opts.sep === '\t' ? 'Tab' : esc(opts.sep)}"</div></div>
          <div class="row"><div class="grow">Baris pertama adalah judul kolom</div>${UI.sw('hdr', header)}</div>
          <div class="row"><div class="grow">Izinkan HTML</div>${UI.sw('html', allowHtml)}</div>
          <div class="row"><div class="grow">Jika duplikat</div><select id="ciDup">${[['skip', 'Lewati'], ['update', 'Perbarui'], ['allow', 'Tetap tambah']].map(([v, l]) => `<option value="${v}" ${dup === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="section-h"><span>Pemetaan kolom</span></div>
        <div class="list">${Array.from({ length: ncol }, (_, i) => `<div class="row"><div class="grow"><div class="t1">Kolom ${i + 1}</div><div class="t2">${esc(Render.stripHtml(sample[0] ? sample[0][i] || '' : '').slice(0, 50))}</div></div>
          <select data-col="${i}"><option value="">(abaikan)</option>${nt.fields.filter(f => f !== 'Occlusions').map(f => `<option ${map[i] === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__tags" ${map[i] === '__tags' ? 'selected' : ''}>Tag</option><option value="__deck" ${map[i] === '__deck' ? 'selected' : ''}>Deck</option></select></div>`).join('')}</div>
        <p class="section-f">Tips: buat di Google Sheets/Excel dengan kolom <i>word, meaning, IPA, example, example meaning</i>, unduh sebagai CSV/TSV lalu impor dengan tipe English Vocab. File .txt hasil ekspor Anki ("Notes in Plain Text") juga didukung.</p>`;
      $('#ciType', b).onclick = async () => { const i = await UI.actions(types.map(t => ({ label: t.name }))); if (i >= 0) { nt = types[i]; autoMap(); draw(); } };
      $('#ciDeck', b).onclick = () => G.Editor.pickDeck(deckId, id => { deckId = id; draw(); });
      b.querySelector('[name=hdr]').onchange = e => { header = e.target.checked; draw(); };
      b.querySelector('[name=html]').onchange = e => { allowHtml = e.target.checked; };
      $('#ciDup', b).onchange = e => { dup = e.target.value; };
      $$('[data-col]', b).forEach(s => s.onchange = () => { map[+s.dataset.col] = s.value; });
    }
    draw();
    $('#ciGo', sh.el).onclick = () => {
      let added = 0, skipped = 0, updated = 0, failed = 0;
      const firstF = nt.fields[0];
      const existing = new Map(DB.list('notes').filter(n => n.typeId === nt.id).map(n => [Render.stripHtml(n.fields[firstF] || '').trim().toLowerCase(), n]));
      for (const r of rows.slice(header ? 1 : 0)) {
        const fields = {}; let tags = ['import']; let dId = deckId;
        r.forEach((val, i) => {
          const m = map[i]; if (!m) return;
          if (m === '__tags') tags = tags.concat(val.split(/\s+/).filter(Boolean));
          else if (m === '__deck') { if (val.trim()) dId = Col.deckByName(val, true).id; }
          else fields[m] = allowHtml ? val.trim() : esc(val.trim()).replace(/\n/g, '<br>');
        });
        const key = Render.stripHtml(fields[firstF] || '').trim().toLowerCase();
        const ex = existing.get(key);
        if (ex && key && dup !== 'allow') {
          if (dup === 'update') { Object.assign(ex.fields, fields); ex.tags = [...new Set([...ex.tags, ...tags])]; Col.updateNote(ex); updated++; } else skipped++;
          continue;
        }
        const res = Col.addNote(nt.id, fields, tags, dId);
        if (res.error) failed++; else { added++; existing.set(key, res.note); }
      }
      sh.close(); G.App.refresh();
      UI.info('Impor selesai', `${added} note ditambahkan${updated ? `\n${updated} diperbarui` : ''}${skipped ? `\n${skipped} duplikat dilewati` : ''}${failed ? `\n${failed} baris kosong/gagal` : ''}`);
    };
  }
  function exportCsv() {
    const types = DB.list('notetypes').filter(t => DB.list('notes').some(n => n.typeId === t.id));
    if (!types.length) return UI.toast('Belum ada note');
    UI.actions(types.map(t => ({ label: t.name, fn: () => {
      const notes = DB.list('notes').filter(n => n.typeId === t.id);
      const q = (s) => /[\t"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      const deckOf = (n) => { const c = DB.list('cards').find(c => c.noteId === n.id); const d = c && DB.get('decks', c.deckId); return d ? d.name : ''; };
      const lines = ['#separator:tab', '#html:true', '#notetype:' + t.name, `#deck column:${t.fields.length + 1}`, `#tags column:${t.fields.length + 2}`];
      notes.forEach(n => lines.push([...t.fields.map(f => n.fields[f] || ''), deckOf(n), n.tags.join(' ')].map(q).join('\t')));
      download(`lekat-${t.name.replace(/[^\w]+/g, '_')}-${stamp()}.txt`, lines.join('\n'), 'text/plain');
    } })), 'Ekspor note type');
  }

  // ---------- Paket Anki (.apkg / .colpkg) ----------
  async function importApkg(file) {
    UI.toast('Membaca paket Anki…');
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js');
    } catch (e) { return UI.info('Gagal', 'Perlu koneksi internet untuk membaca .apkg pertama kali.'); }
    const zip = await window.JSZip.loadAsync(file);
    const newFmt = zip.file('collection.anki21b') && !zip.file('collection.anki21');
    const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
    if (!dbFile || newFmt) return UI.info('Format belum didukung', 'Paket ini memakai format Anki terbaru (terkompresi). Di Anki desktop, ekspor ulang dengan mencentang "Support older Anki versions", lalu impor lagi.');
    const SQL = await window.initSqlJs({ locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/' + f });
    const db = new SQL.Database(new Uint8Array(await dbFile.async('arraybuffer')));
    const q = (sql) => { try { const r = db.exec(sql)[0]; return r ? r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []; } catch (e) { return []; } };
    const col = q('select crt, models, decks from col')[0] || {};
    let models = {}; try { models = JSON.parse(col.models || '{}'); } catch (e) {}
    let decks = {}; try { decks = JSON.parse(col.decks || '{}'); } catch (e) {}
    if (!Object.keys(models).length) {
      // skema baru: tabel notetypes/fields/templates (config protobuf diabaikan)
      for (const nt of q('select id, name from notetypes')) models[nt.id] = { id: nt.id, name: nt.name, type: 0, flds: q(`select name, ord from fields where ntid=${nt.id} order by ord`).map(f => ({ name: f.name })), tmpls: q(`select name, ord from templates where ntid=${nt.id} order by ord`).map(t => ({ name: t.name, qfmt: '', afmt: '' })), css: '' };
    }
    if (!Object.keys(decks).length) for (const d of q('select id, name from decks')) decks[d.id] = { id: d.id, name: String(d.name).replace(/\x1f/g, '::') };
    // media
    let mediaMap = {};
    const mf = zip.file('media'); if (mf) { try { mediaMap = JSON.parse(await mf.async('string')); } catch (e) { mediaMap = {}; } }
    let mediaN = 0;
    for (const [k, name] of Object.entries(mediaMap)) {
      const f = zip.file(k); if (!f || DB.get('media', name)) continue;
      const blob = await f.async('blob'); const ext = name.split('.').pop().toLowerCase();
      const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', webm: 'audio/webm' }[ext] || '';
      DB.putRaw('media', { id: name, blob: type ? new Blob([blob], { type }) : blob, type, size: blob.size }); mediaN++;
    }
    // note types
    const typeMap = {};
    for (const m of Object.values(models)) {
      const isCloze = m.type === 1;
      const fields = (m.flds || []).map(f => f.name);
      const tmpls = (m.tmpls || []).map(t => ({ name: t.name, q: t.qfmt || '{{' + fields[0] + '}}', a: t.afmt || '{{FrontSide}}<hr id="answer">{{' + (fields[1] || fields[0]) + '}}' }));
      const key = 'anki-' + m.id;
      let nt = DB.list('notetypes').find(t => t.key === key);
      if (!nt) nt = DB.put('notetypes', { id: DB.newId(), key, name: m.name + (DB.list('notetypes').some(t => t.name === m.name) ? ' (Anki)' : ''), kind: isCloze ? 'cloze' : 'std', fields, tmpls: isCloze ? [tmpls[0] || { name: 'Cloze', q: '{{cloze:' + fields[0] + '}}', a: '{{cloze:' + fields[0] + '}}' }] : tmpls, css: m.css || '', builtin: false });
      typeMap[m.id] = nt;
    }
    const deckMap = {};
    for (const d of Object.values(decks)) { if (d.dyn) continue; deckMap[d.id] = Col.deckByName(d.name, true).id; }
    const fallbackDeck = Object.values(deckMap)[0] || 1;
    const crt = (col.crt || 0) * 1000;
    const ankiToday = crt ? Math.floor((Date.now() - crt) / 86400000) : 0;
    const today = Col.today(), now = Date.now();
    const noteMap = {};
    let nNotes = 0, nCards = 0;
    const r = await UI.alertBox({ title: 'Impor paket Anki', msg: 'Sertakan progres belajar dari Anki (jadwal & riwayat)?', buttons: [{ label: 'Batal' }, { label: 'Mulai dari nol' }, { label: 'Sertakan', style: 'bold' }] });
    if (r.i === 0) return;
    const withSched = r.i === 2;
    for (const n of q('select id, mid, flds, tags, mod from notes')) {
      const nt = typeMap[n.mid]; if (!nt) continue;
      const vals = String(n.flds).split('\x1f');
      const fields = {}; nt.fields.forEach((f, i) => fields[f] = vals[i] || '');
      let id = n.id; if (DB.get('notes', id)) { if (DB.get('notes', id).typeId === nt.id) { noteMap[n.id] = id; continue; } id = DB.newId(); }
      DB.putRaw('notes', { id, typeId: nt.id, fields, tags: String(n.tags || '').trim().split(/\s+/).filter(Boolean), created: n.id, mod: n.mod * 1000 });
      noteMap[n.id] = id; nNotes++;
    }
    let pos = DB.meta('nextPos') || 1;
    for (const c of q('select id, nid, did, odid, ord, type, queue, due, ivl, factor, reps, lapses, left, flags, data from cards order by due')) {
      const nid = noteMap[c.nid]; if (!nid) continue;
      if (DB.get('cards', c.id)) continue;
      const deckId = deckMap[c.odid || c.did] || fallbackDeck;
      const card = { id: c.id, noteId: nid, ord: c.ord, deckId, state: 'new', due: pos++, ivl: 0, ease: 0, step: 0, reps: 0, lapses: 0, flag: (c.flags || 0) & 7, suspended: c.queue === -1, buriedDay: null, s: null, d: null, lastReview: null, created: c.id };
      if (withSched && c.type !== 0) {
        card.reps = c.reps; card.lapses = c.lapses; card.ease = (c.factor || 2500) / 1000; card.ivl = c.ivl > 0 ? c.ivl : 0;
        try { const dd = JSON.parse(c.data || '{}'); if (dd.s) { card.s = dd.s; card.d = dd.d; } } catch (e) {}
        if (c.type === 2) { card.state = 'review'; card.due = today + (c.due - ankiToday); card.lastReview = Col.dayStart(card.due - card.ivl) + 3600000; }
        else { card.state = c.type === 3 ? 'relearning' : 'learning'; card.due = now; card.lastReview = now - 600000; }
      }
      DB.putRaw('cards', card); nCards++;
    }
    DB.meta('nextPos', pos);
    if (withSched) for (const l of q('select id, cid, ease, ivl, lastIvl, factor, time, type from revlog')) {
      if (!DB.get('cards', l.cid) || DB.get('revlog', l.id)) continue;
      DB.putRaw('revlog', { id: l.id, cid: l.cid, ease: l.ease, ivl: l.ivl, lastIvl: l.lastIvl, factor: l.factor, time: l.time, type: l.type > 3 ? 3 : l.type });
    }
    db.close(); await DB.flush();
    G.App.refresh();
    UI.info('Impor Anki selesai', `${nNotes} note, ${nCards} kartu${mediaN ? `, ${mediaN} media` : ''} diimpor.`);
  }

  // ---------- Menu ----------
  async function importMenu() {
    UI.actions([
      { label: 'File CSV / TSV / TXT', icon: 'download', fn: async () => { const f = await pick('.csv,.tsv,.txt,text/csv,text/plain'); if (f) importCsv(f); } },
      { label: 'Paket Anki (.apkg / .colpkg)', icon: 'download', fn: async () => { const f = await pick('.apkg,.colpkg,application/zip'); if (f) importApkg(f).catch(e => UI.info('Gagal impor', String(e.message || e))); } },
      { label: 'Cadangan / deck Lekat (.lekat)', icon: 'download', fn: async () => { const f = await pick('.lekat,.json,application/json'); if (f) importLekat(f); } },
      { label: 'Pulihkan cadangan otomatis', icon: 'reset', fn: restoreAuto }
    ], 'Impor');
  }

  G.IO = { importMenu, exportBackup, exportDeck, exportCsv, autoBackup, importCsv, importApkg, importLekat, parseDelimited };
})(window);
