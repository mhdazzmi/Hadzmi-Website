// Lekat — editor note: tambah & edit, toolbar format, cloze, gambar, audio, rekam suara, kamus Inggris, image occlusion.
(function (G) {
  'use strict';
  const { DB, Col, UI, Render } = G;
  const { $, $$, esc, icon } = UI;
  const state = { typeId: null, deckId: null, sticky: {}, stickyVals: {}, tags: '' };

  // ---------- Media ----------
  async function saveMedia(blob, name) {
    const ext = (name && name.includes('.') ? name.split('.').pop() : (blob.type.split('/')[1] || 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const base = (name ? name.replace(/\.[^.]+$/, '') : 'media').replace(/[^\w-]+/g, '_').slice(0, 40);
    let id = `${base}-${Date.now().toString(36)}.${ext}`;
    if (blob.type.startsWith('image/') && blob.size > 600 * 1024 && !/gif|svg/.test(blob.type)) { blob = await shrink(blob); id = id.replace(/\.[^.]+$/, '.jpg'); }
    DB.putRaw('media', { id, blob, type: blob.type, size: blob.size });
    return id;
  }
  function shrink(blob) {
    return new Promise(res => {
      const img = new Image(); const u = URL.createObjectURL(blob);
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => { URL.revokeObjectURL(u); res(b || blob); }, 'image/jpeg', 0.85);
      };
      img.onerror = () => res(blob); img.src = u;
    });
  }
  function pickFile(accept) {
    return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); });
  }
  // HTML field disimpan memakai nama file media; saat tampil diganti ke blob URL
  function toDisplay(html) {
    return String(html || '').replace(/(<img[^>]*?\ssrc=)(["'])([^"']+)\2/gi, (all, a, q, src) => /^(https?:|data:|blob:)/i.test(src) ? all : `${a}${q}${esc(Render.mediaUrl(src))}${q} data-name="${esc(src)}"`);
  }
  function fromDisplay(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('img').forEach(img => { const n = img.getAttribute('data-name'); if (n) img.setAttribute('src', n); img.removeAttribute('data-name'); });
    let h = clone.innerHTML.replace(/<br\s*\/?>\s*$/i, '').replace(/&nbsp;/g, ' ').trim();
    if (h === '<br>') h = '';
    return h;
  }


  // ---------- Komponen editor field ----------
  function buildEditor(root, nt, values, opts) {
    opts = opts || {};
    const isIO = nt.kind === 'io';
    root.innerHTML = `
      <div class="toolbar glass ${isIO ? 'no-stick' : ''}" id="edTools">
        <button type="button" data-cmd="bold" aria-label="Tebal"><b>B</b></button>
        <button type="button" data-cmd="italic" aria-label="Miring"><i>I</i></button>
        <button type="button" data-cmd="underline" aria-label="Garis bawah"><u>U</u></button>
        ${nt.kind === 'cloze' ? `<button type="button" data-act="cloze" title="Cloze baru (Ctrl+Shift+C)">[…]+</button><button type="button" data-act="cloze-same" title="Cloze nomor sama (Ctrl+Alt+Shift+C)">[…]=</button>` : ''}
        <button type="button" data-act="img" aria-label="Sisipkan gambar">${icon('image')}</button>
        <button type="button" data-act="audio" aria-label="Sisipkan audio">${icon('speaker')}</button>
        <button type="button" data-act="rec" class="rec" aria-label="Rekam suara">${icon('mic')}</button>
        <button type="button" data-cmd="removeFormat" aria-label="Hapus format">Tx</button>
        <button type="button" data-act="html" aria-label="Edit HTML">&lt;/&gt;</button>
        ${nt.key === 'en-vocab' ? `<button type="button" data-act="dict" style="color:var(--tint-ink)">${icon('sparkle')}&nbsp;Kamus</button>` : ''}
      </div>
      ${isIO ? '<div id="ioBox"></div>' : ''}
      <div id="edFields">${nt.fields.map((f, i) => {
        if (isIO && (f === 'Image' || f === 'Occlusions')) return '';
        return `<div class="field-box"><label><span>${esc(f)}</span>${opts.sticky ? `<button type="button" data-pin="${esc(f)}" title="Tetap isi field ini setelah menambah">${state.sticky[nt.id + ':' + f] ? '📌 Tetap' : 'Pin'}</button>` : ''}</label>
          <div class="fed" contenteditable="true" data-f="${esc(f)}" data-ph="${esc(placeholder(nt, f))}" spellcheck="${/word|front|text|sentence|example/i.test(f) ? 'true' : 'false'}" lang="${/meaning|arti/i.test(f) ? 'id' : 'en'}">${toDisplay(values[f] || '')}</div></div>`;
      }).join('')}</div>
      ${opts.dupWarn ? '<div id="dupWarn" class="section-f hidden" style="color:var(--orange-ink);margin-top:-4px">⚠️ Duplikat: field pertama sudah ada di koleksi</div>' : ''}`;
    let focused = $('.fed', root);
    let io = null;
    if (isIO) io = ioEditor($('#ioBox', root), values.Image || '', values.Occlusions || '');
    $$('.fed', root).forEach(el => {
      el.addEventListener('focus', () => { focused = el; });
      el.addEventListener('paste', async e => {
        const items = [...(e.clipboardData && e.clipboardData.items || [])];
        const img = items.find(i => i.type.startsWith('image/'));
        if (img) { e.preventDefault(); const name = await saveMedia(img.getAsFile(), 'paste.png'); insertHtml(el, `<img src="${esc(Render.mediaUrl(name))}" data-name="${esc(name)}">`); return; }
        const html = e.clipboardData.getData('text/html');
        e.preventDefault();
        if (html) insertHtml(el, cleanHtml(html)); else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      });
      el.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); cloze(el, e.altKey); }
      });
    });
    $$('[data-pin]', root).forEach(b => b.onclick = () => { const k = nt.id + ':' + b.dataset.pin; state.sticky[k] = !state.sticky[k]; b.textContent = state.sticky[k] ? '📌 Tetap' : 'Pin'; });
    $('#edTools', root).addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    $('#edTools', root).addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cmd) { (focused || $('.fed', root)).focus(); document.execCommand(b.dataset.cmd); return; }
      const a = b.dataset.act;
      const target = focused || $('.fed', root);
      if (a === 'cloze' || a === 'cloze-same') { cloze(target, a === 'cloze-same'); }
      else if (a === 'img') { const f = await pickFile('image/*'); if (!f) return; const n = await saveMedia(f, f.name); target.focus(); insertHtml(target, `<img src="${esc(Render.mediaUrl(n))}" data-name="${esc(n)}">`); }
      else if (a === 'audio') { const f = await pickFile('audio/*'); if (!f) return; const n = await saveMedia(f, f.name); target.focus(); insertHtml(target, `[sound:${esc(n)}]`); }
      else if (a === 'rec') record(b, target);
      else if (a === 'html') {
        const box = target.closest('.field-box');
        const ta = box.querySelector('textarea');
        if (ta) { target.innerHTML = toDisplay(ta.value); ta.remove(); target.classList.remove('hidden'); b.classList.remove('on'); }
        else { const t = document.createElement('textarea'); t.className = 'fed-html'; t.value = fromDisplay(target); target.classList.add('hidden'); box.appendChild(t); b.classList.add('on'); t.focus(); }
      } else if (a === 'dict') dictionary(root, b);
    });
    if (opts.dupWarn) {
      const first = $(`.fed[data-f="${CSS.escape(nt.fields[0])}"]`, root);
      if (first) first.addEventListener('input', () => {
        const v = Render.stripHtml(fromDisplay(first)).trim().toLowerCase();
        const dup = v && DB.list('notes').some(n => n.typeId === nt.id && Render.stripHtml(n.fields[nt.fields[0]] || '').trim().toLowerCase() === v && n.id !== opts.noteId);
        $('#dupWarn', root).classList.toggle('hidden', !dup);
      });
    }
    return {
      values() {
        const out = {};
        $$('.field-box', root).forEach(box => {
          const el = box.querySelector('.fed'); const ta = box.querySelector('textarea');
          out[el.dataset.f] = ta ? ta.value : fromDisplay(el);
        });
        if (io) Object.assign(out, io.values());
        return out;
      },
      focus() { const f = $('.fed', root); if (f) f.focus(); },
      clear(keep) {
        $$('.fed', root).forEach(el => { if (!keep || !keep(el.dataset.f)) el.innerHTML = ''; });
        if (io) io.reset();
        const d = $('#dupWarn', root); if (d) d.classList.add('hidden');
      }
    };
  }
  function placeholder(nt, f) {
    const map = { Word: 'contoh: resilient', Meaning: 'arti dalam bahasa Indonesia', Pronunciation: '/rɪˈzɪliənt/', Example: 'She is resilient after failure.', 'Example Meaning': 'terjemahan contoh kalimat', Text: 'Tulis kalimat, lalu blok kata & tekan […]+', Sentence: 'kalimat bahasa Inggris untuk didengar', Front: 'pertanyaan / kata', Back: 'jawaban / arti' };
    return map[f] || f;
  }
  function insertHtml(el, html) { el.focus(); document.execCommand('insertHTML', false, html); }
  function cleanHtml(html) {
    const d = document.createElement('div'); d.innerHTML = html.replace(/<!--[\s\S]*?-->/g, '');
    d.querySelectorAll('script,style,meta,link').forEach(x => x.remove());
    d.querySelectorAll('*').forEach(x => { [...x.attributes].forEach(a => { if (!['src', 'href'].includes(a.name)) x.removeAttribute(a.name); }); if (/^(SPAN|FONT)$/.test(x.tagName)) x.replaceWith(...x.childNodes); });
    return d.innerHTML;
  }
  function cloze(el, same) {
    const root = el.closest('#edFields') || document;
    let max = 0;
    $$('.fed', root).forEach(f => (f.innerText || '').replace(/\{\{c(\d+)::/g, (_, n) => { max = Math.max(max, +n); }));
    const n = same ? Math.max(1, max) : max + 1;
    el.focus();
    const sel = window.getSelection();
    const text = sel.rangeCount ? sel.toString() : '';
    if (text) document.execCommand('insertText', false, `{{c${n}::${text}}}`);
    else { document.execCommand('insertText', false, `{{c${n}::}}`); const s = window.getSelection(); for (let i = 0; i < 2; i++) s.modify && s.modify('move', 'backward', 'character'); }
  }
  let rec = null;
  async function record(btn, target) {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = []; const mr = new MediaRecorder(stream); rec = mr;
      btn.classList.add('on'); btn.innerHTML = '■ Stop';
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); rec = null; btn.classList.remove('on'); btn.innerHTML = icon('mic');
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        const n = await saveMedia(blob, 'rekaman.' + ((mr.mimeType || '').includes('mp4') ? 'm4a' : 'webm'));
        target.focus(); insertHtml(target, `[sound:${esc(n)}]`); UI.toast('Rekaman disisipkan');
      };
      mr.start();
    } catch (e) { UI.toast('Mikrofon tidak tersedia'); }
  }
  // Kamus Inggris gratis (dictionaryapi.dev) + terjemahan (MyMemory)
  async function dictionary(root, btn) {
    const get = f => $(`.fed[data-f="${f}"]`, root);
    const word = Render.stripHtml(fromDisplay(get('Word'))).trim();
    if (!word) return UI.toast('Isi field Word dulu');
    btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '…';
    let found = false;
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
      if (r.ok) {
        const j = await r.json(); const e = j[0] || {};
        const ipa = e.phonetic || (e.phonetics || []).map(p => p.text).find(Boolean);
        if (ipa && !Render.stripHtml(get('Pronunciation').innerHTML).trim()) get('Pronunciation').textContent = ipa;
        const means = e.meanings || [];
        const ex = means.flatMap(m => m.definitions || []).map(d => d.example).find(Boolean);
        if (ex && !Render.stripHtml(get('Example').innerHTML).trim()) get('Example').textContent = ex;
        const defs = means.slice(0, 2).map(m => `<i>${esc(m.partOfSpeech)}</i> — ${esc((m.definitions[0] || {}).definition || '')}`).join('<br>');
        if (defs && !Render.stripHtml(get('Notes').innerHTML).trim()) get('Notes').innerHTML = defs;
        found = true;
      }
    } catch (e) {}
    try {
      if (!Render.stripHtml(get('Meaning').innerHTML).trim()) {
        const r = await fetch('https://api.mymemory.translated.net/get?langpair=en|id&q=' + encodeURIComponent(word));
        const j = await r.json(); const t = j && j.responseData && j.responseData.translatedText;
        if (t && t.toLowerCase() !== word.toLowerCase()) { get('Meaning').textContent = t.toLowerCase(); found = true; }
      }
      const exT = Render.stripHtml(get('Example').innerHTML).trim();
      if (exT && !Render.stripHtml(get('Example Meaning').innerHTML).trim()) {
        const r = await fetch('https://api.mymemory.translated.net/get?langpair=en|id&q=' + encodeURIComponent(exT));
        const j = await r.json(); const t = j && j.responseData && j.responseData.translatedText;
        if (t) get('Example Meaning').textContent = t;
      }
    } catch (e) {}
    btn.disabled = false; btn.innerHTML = old;
    UI.toast(found ? 'Diisi dari kamus — cek lagi ya' : 'Kata tidak ditemukan / offline');
  }

  // ---------- Image occlusion editor ----------
  function ioEditor(box, imageField, occField) {
    const occ = Render.parseOcc(occField);
    let imgName = (imageField.match(/src=["']([^"']+)["']/) || [])[1] || '';
    let shapes = occ.shapes.map(s => Object.assign({}, s)), mode = occ.mode, sel = -1;
    let tool = 'pan'; // 'pan' = geser/scroll aman, 'draw' = gambar kotak baru
    const history = [];
    const snap = () => { history.push(JSON.stringify(shapes)); if (history.length > 40) history.shift(); };
    function draw() {
      const nCards = new Set(shapes.map(s => s.c)).size;
      box.innerHTML = imgName ? `
        <div class="io-tools">
          ${UI.seg('iotool', [['pan', '✋ Geser'], ['draw', '✏️ Gambar kotak']], tool)}
        </div>
        <div class="io-hint">${tool === 'draw' ? 'Seret jari di atas label untuk menutupnya. Di mode ini gambar tidak ikut scroll.' : 'Mode aman: scroll bebas. Ketuk kotak untuk memilih, seret untuk memindah, tarik titik biru untuk ubah ukuran.'}</div>
        <div style="text-align:center"><div class="io-editor ${tool === 'draw' ? 'drawing' : ''}" id="ioEd"><img src="${esc(Render.mediaUrl(imgName))}" alt="">${shapes.map((s, i) => `<div class="shape ${i === sel ? 'sel' : ''}" data-i="${i}" style="left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;height:${s.h * 100}%">${s.c}${i === sel ? '<i class="handle" data-h="1"></i>' : ''}</div>`).join('')}</div></div>
        <div class="io-tools" style="justify-content:center">
          <button type="button" class="btn sm secondary" data-io="undo" ${!history.length ? 'disabled' : ''}>${icon('undo')} Urungkan</button>
          <button type="button" class="btn sm secondary" data-io="del" ${sel < 0 ? 'disabled' : ''}>${icon('trash')} Hapus kotak</button>
          <button type="button" class="btn sm secondary" data-io="group" ${sel < 0 || shapes.length < 2 ? 'disabled' : ''}>Gabung nomor</button>
          <button type="button" class="btn sm secondary" data-io="clear" ${!shapes.length ? 'disabled' : ''}>Hapus semua</button>
        </div>
        <div class="list" style="margin:6px 0 10px">
          <div class="row" style="flex-wrap:wrap"><div class="grow">Saat belajar<div class="t2">${mode === 'hideAll' ? 'Semua kotak tertutup, kamu menebak yang merah' : 'Hanya kotak yang ditanya yang tertutup'}</div></div>${UI.seg('iomode', [['hideAll', 'Tutup semua'], ['hideOne', 'Tutup satu']], mode)}</div>
          <button type="button" class="row tint" data-io="img">${icon('image')} Ganti gambar</button>
        </div>
        <p class="section-f" style="text-align:center;margin:0 0 12px">${shapes.length ? `<b>${shapes.length} kotak → ${nCards} kartu</b> (satu nomor = satu kartu)` : 'Belum ada kotak. Pilih ✏️ Gambar kotak lalu seret di atas gambar.'}</p>`
        : `<button type="button" class="field-box" data-io="img" style="width:100%;padding:30px;text-align:center;color:var(--tint-ink)">${icon('image')}<div style="margin-top:6px">Pilih gambar (diagram, peta, catatan…)</div></button>`;
      UI.bindSeg(box, (n, v) => { if (n === 'iomode') { mode = v; draw(); } if (n === 'iotool') { tool = v; sel = -1; draw(); } });
      $$('[data-io]', box).forEach(b => b.onclick = async () => {
        const a = b.dataset.io;
        if (a === 'img') { const f = await pickFile('image/*'); if (!f) return; imgName = await saveMedia(f, f.name); shapes = []; sel = -1; history.length = 0; tool = 'pan'; draw(); UI.toast('Pilih ✏️ Gambar kotak untuk mulai menutup label'); }
        if (a === 'undo' && history.length) { shapes = JSON.parse(history.pop()); sel = -1; draw(); }
        if (a === 'del' && sel >= 0) { snap(); shapes.splice(sel, 1); sel = -1; renumber(); draw(); }
        if (a === 'group' && sel >= 0) {
          const opts = [...new Set(shapes.map(s => s.c))].filter(c => c !== shapes[sel].c).sort((x, y) => x - y);
          const i = await UI.actions(opts.map(c => ({ label: 'Gabung ke nomor ' + c })), 'Kotak bernomor sama ditanya di kartu yang sama');
          if (i >= 0) { snap(); shapes[sel].c = opts[i]; renumber(); draw(); }
        }
        if (a === 'clear' && await UI.confirm('Hapus semua kotak?', '', 'Hapus', true)) { snap(); shapes = []; sel = -1; draw(); }
      });
      const ed = $('#ioEd', box); if (!ed) return;
      let op = null; // {kind:'new'|'move'|'resize', start, orig, el, moved, cur}
      const pt = (e) => { const r = ed.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
      const px = (dx, dy) => { const r = ed.getBoundingClientRect(); return Math.hypot(dx * r.width, dy * r.height); };
      ed.addEventListener('pointerdown', e => {
        const sh = e.target.closest('.shape');
        const p = pt(e);
        if (sh) {
          const i = +sh.dataset.i;
          if (i !== sel) { sel = i; draw(); return; } // ketuk pertama hanya memilih
          e.preventDefault(); ed.setPointerCapture(e.pointerId);
          op = { kind: e.target.dataset.h ? 'resize' : 'move', start: p, orig: Object.assign({}, shapes[i]), el: sh, moved: false };
          return;
        }
        if (tool !== 'draw') { if (sel >= 0) { sel = -1; draw(); } return; }
        e.preventDefault(); ed.setPointerCapture(e.pointerId);
        const g = document.createElement('div'); g.className = 'shape sel'; g.style.width = '0'; ed.appendChild(g);
        op = { kind: 'new', start: p, el: g, moved: false };
      });
      ed.addEventListener('pointermove', e => {
        if (!op) return;
        const p = pt(e), dx = p.x - op.start.x, dy = p.y - op.start.y;
        if (!op.moved && px(dx, dy) < 8) return; // abaikan sentuhan kecil / jari goyang
        op.moved = true;
        let x, y, w, h;
        if (op.kind === 'new') { x = Math.min(op.start.x, p.x); y = Math.min(op.start.y, p.y); w = Math.abs(dx); h = Math.abs(dy); }
        else if (op.kind === 'move') { w = op.orig.w; h = op.orig.h; x = Math.min(1 - w, Math.max(0, op.orig.x + dx)); y = Math.min(1 - h, Math.max(0, op.orig.y + dy)); }
        else { x = op.orig.x; y = op.orig.y; w = Math.max(0.03, Math.min(1 - x, op.orig.w + dx)); h = Math.max(0.03, Math.min(1 - y, op.orig.h + dy)); }
        op.cur = { x, y, w, h };
        Object.assign(op.el.style, { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%' });
      });
      const end = () => {
        if (!op) return;
        const o = op; op = null;
        if (o.moved && o.cur) {
          const c = o.cur;
          if (o.kind === 'new') {
            if (px(c.w, 0) >= 14 && px(0, c.h) >= 10) { snap(); const n = shapes.reduce((m, s) => Math.max(m, s.c), 0) + 1; shapes.push({ x: r4(c.x), y: r4(c.y), w: r4(c.w), h: r4(c.h), c: n }); sel = shapes.length - 1; }
          } else { snap(); Object.assign(shapes[sel], { x: r4(c.x), y: r4(c.y), w: r4(c.w), h: r4(c.h) }); }
        }
        draw();
      };
      ed.addEventListener('pointerup', end); ed.addEventListener('pointercancel', end);
    }
    function renumber() { const map = new Map(); let n = 0; shapes.forEach(s => { if (!map.has(s.c)) map.set(s.c, ++n); }); shapes.forEach(s => s.c = map.get(s.c)); }
    const r4 = x => Math.round(x * 10000) / 10000;
    draw();
    return {
      values() { return { Image: imgName ? `<img src="${imgName}">` : '', Occlusions: JSON.stringify({ mode, shapes }) }; },
      reset() { imgName = ''; shapes = []; sel = -1; history.length = 0; tool = 'pan'; draw(); }
    };
  }

  // ---------- Tampilan "Tambah" ----------
  function renderAddView(v, opts) {
    opts = opts || {};
    const types = DB.list('notetypes');
    if (!state.typeId || !DB.get('notetypes', state.typeId)) state.typeId = DB.meta('lastType') || (Col.typeByKey('en-vocab') || types[0]).id;
    if (!DB.get('notetypes', state.typeId)) state.typeId = types[0].id;
    if (opts.deckId) state.deckId = opts.deckId;
    if (!state.deckId || !DB.get('decks', state.deckId) || DB.get('decks', state.deckId).filtered) state.deckId = DB.meta('lastDeck') || (Col.decks().find(d => !d.filtered) || {}).id;
    if (!DB.get('decks', state.deckId)) state.deckId = Col.decks().find(d => !d.filtered).id;
    const nt = DB.get('notetypes', state.typeId), deck = DB.get('decks', state.deckId);
    v.innerHTML = `
      <div class="navbar"><button type="button" class="circle-btn glass" id="adHist" aria-label="Riwayat">${icon('clock')}</button></div>
      <h1 class="large-title">Tambah</h1>
      <div class="picker-row">
        <button type="button" class="picker" id="pkType"><small>Tipe</small><b>${esc(nt.name)}</b></button>
        <button type="button" class="picker" id="pkDeck"><small>Deck</small><b>${esc(deck.name)}</b></button>
      </div>
      <div id="adEditor"></div>
      <div class="field-box"><label><span>Tag</span></label><input class="tags-input" id="adTags" placeholder="pisahkan dengan spasi, mis. vocab toefl" value="${esc(state.tags)}" autocapitalize="off"></div>
      <div class="add-bar"><button type="button" class="btn secondary" id="adPrev">${icon('eye')} Pratinjau</button><button type="button" class="btn primary" style="flex:1" id="adAdd">${icon('plus')} Tambah</button></div>
      <p class="section-f">Ctrl/⌘+Enter untuk menambah. ${nt.kind === 'cloze' ? 'Blok teks lalu tekan […]+ (Ctrl+Shift+C) untuk membuat cloze; setiap nomor jadi satu kartu.' : nt.key === 'en-vocab' ? 'Tiap kata menghasilkan 2 kartu: Kata → Arti dan Arti → Kata (ketik ejaan). Tekan ✨ Kamus untuk isi otomatis IPA, contoh, dan arti.' : ''}</p>`;
    const vals = {};
    nt.fields.forEach(f => { if (state.sticky[nt.id + ':' + f]) vals[f] = state.stickyVals[nt.id + ':' + f] || ''; });
    const ed = buildEditor($('#adEditor', v), nt, vals, { sticky: true, dupWarn: true });
    $('#pkType', v).onclick = async () => {
      const i = await UI.actions(types.map(t => ({ label: (t.id === nt.id ? '✓ ' : '') + t.name })), 'Pilih note type');
      if (i >= 0) { state.typeId = types[i].id; DB.meta('lastType', state.typeId); renderAddView(v); }
    };
    $('#pkDeck', v).onclick = () => pickDeck(state.deckId, id => { state.deckId = id; DB.meta('lastDeck', id); renderAddView(v); });
    $('#adTags', v).oninput = e => { state.tags = e.target.value; };
    const add = () => {
      const values = ed.values();
      const tags = $('#adTags', v).value.split(/\s+/).filter(Boolean);
      const r = Col.addNote(nt.id, values, tags, state.deckId);
      if (r.error) return UI.info('Belum bisa ditambah', r.error);
      DB.meta('lastDeck', state.deckId);
      nt.fields.forEach(f => { if (state.sticky[nt.id + ':' + f]) state.stickyVals[nt.id + ':' + f] = values[f]; });
      ed.clear(f => state.sticky[nt.id + ':' + f]);
      ed.focus();
      const hist = DB.meta('addHist') || []; hist.unshift(r.note.id); DB.meta('addHist', hist.slice(0, 50));
      UI.toast(`Ditambahkan · ${r.count} kartu`, { label: 'Urungkan', fn: () => { Col.deleteNotes([r.note.id]); UI.toast('Dibatalkan'); } });
    };
    $('#adAdd', v).onclick = add;
    $('#adPrev', v).onclick = () => previewNote(nt, ed.values());
    $('#adHist', v).onclick = () => {
      const ids = (DB.meta('addHist') || []).filter(id => DB.get('notes', id));
      if (!ids.length) return UI.toast('Belum ada riwayat');
      G.App.go('browse', { q: 'nid:' + ids.join(',') });
    };
    v.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); add(); } };
  }

  function pickDeck(cur, cb) {
    const decks = Col.decks().filter(d => !d.filtered);
    const sh = UI.sheet({ title: 'Pilih deck', right: `<button type="button" class="btn-txt" id="pdNew">Baru</button>`, body: `<div class="searchbar" style="margin-top:4px">${icon('search')}<input id="pdQ" placeholder="Cari deck"></div><div class="list" id="pdList"></div>` });
    const draw = (q) => {
      $('#pdList', sh.body).innerHTML = decks.filter(d => !q || d.name.toLowerCase().includes(q.toLowerCase())).map(d => `<button type="button" class="row" data-id="${d.id}" style="padding-left:${16 + (d.name.split('::').length - 1) * 16}px"><div class="grow">${esc(d.name.split('::').pop())}${d.name.includes('::') ? `<div class="t2">${esc(d.name)}</div>` : ''}</div>${d.id === cur ? icon('check') : ''}</button>`).join('');
      $$('#pdList [data-id]', sh.body).forEach(b => b.onclick = () => { sh.close(); cb(+b.dataset.id); });
    };
    $('#pdQ', sh.body).oninput = e => draw(e.target.value);
    $('#pdNew', sh.el).onclick = async () => { const n = await UI.prompt('Deck baru', '', 'English::Vocabulary'); if (n) { const d = Col.deckByName(n, true); sh.close(); cb(d.id); } };
    draw('');
  }

  function previewNote(nt, values) {
    const note = { id: 0, typeId: nt.id, fields: values, tags: [] };
    const ords = Col.cardOrds(nt, note);
    if (!ords.length) return UI.info('Pratinjau', 'Belum ada kartu yang terbentuk dari isian ini.');
    let i = 0, side = 'q';
    const sh = UI.sheet({ title: 'Pratinjau', body: `<div class="seg" id="pvSide" style="margin:4px 0 12px"><button type="button" class="on" data-v="q">Depan</button><button type="button" data-v="a">Belakang</button></div>
      ${ords.length > 1 ? `<div class="chips" id="pvOrd">${ords.map((o, k) => `<button type="button" class="chip ${k === 0 ? 'on' : ''}" data-k="${k}">Kartu ${o + 1}</button>`).join('')}</div>` : ''}
      <div class="preview-card"><style id="pvS"></style><div class="card card-content" id="pvC"></div></div>` });
    const draw = () => {
      const t = nt.kind === 'std' ? nt.tmpls[ords[i]] : nt.tmpls[0];
      const q = Render.renderTemplate(t.q, note, nt, { ord: ords[i], side: 'q' });
      const html = side === 'q' ? q : Render.renderTemplate(t.a, note, nt, { ord: ords[i], side: 'a', frontSide: q });
      $('#pvS', sh.body).textContent = G.App.scopeCss(nt.css || '', '#pvC');
      $('#pvC', sh.body).innerHTML = Render.resolveMedia(html);
    };
    sh.body.addEventListener('click', e => {
      const s = e.target.closest('#pvSide button'); if (s) { side = s.dataset.v; $$('#pvSide button', sh.body).forEach(x => x.classList.toggle('on', x === s)); draw(); }
      const o = e.target.closest('#pvOrd .chip'); if (o) { i = +o.dataset.k; $$('#pvOrd .chip', sh.body).forEach(x => x.classList.toggle('on', x === o)); draw(); }
      const p = e.target.closest('.play-btn'); if (p) { G.Review.stopAudio(); if (p.dataset.tts) G.Review.speak(p.dataset.tts, p.dataset.lang, 0.95, p); else new Audio(Render.mediaUrl(p.dataset.sound)).play(); }
    });
    draw();
  }

  // ---------- Edit note (dari browser / review) ----------
  function editNote(noteId, onSave) {
    const note = DB.get('notes', noteId); if (!note) return;
    const nt = DB.get('notetypes', note.typeId);
    const cards = DB.list('cards').filter(c => c.noteId === noteId);
    let deckId = cards[0] ? cards[0].deckId : 1;
    const sh = UI.sheet({ title: 'Edit note', full: true, left: `<button type="button" class="btn-txt" data-close>Batal</button>`, right: `<button type="button" class="btn-txt bold" id="enSave">Simpan</button>`, body: `
      <div class="picker-row"><div class="picker"><small>Tipe</small><b>${esc(nt.name)}</b></div><button type="button" class="picker" id="enDeck"><small>Deck</small><b>${esc((DB.get('decks', deckId) || {}).name || '')}</b></button></div>
      <div id="enEd"></div>
      <div class="field-box"><label><span>Tag</span></label><input class="tags-input" id="enTags" value="${esc(note.tags.join(' '))}" autocapitalize="off"></div>
      <div class="list" style="margin-top:14px">
        <button type="button" class="row tint" id="enPrev">Pratinjau kartu</button>
        <button type="button" class="row tint" id="enInfo">Info kartu (${cards.length} kartu)</button>
        <button type="button" class="row danger" id="enDel">Hapus note</button>
      </div>` });
    const ed = buildEditor($('#enEd', sh.body), nt, note.fields, { dupWarn: false, noteId });
    $('#enDeck', sh.body).onclick = () => pickDeck(deckId, id => { deckId = id; $('#enDeck b', sh.body).textContent = DB.get('decks', id).name; });
    $('#enPrev', sh.body).onclick = () => previewNote(nt, ed.values());
    $('#enInfo', sh.body).onclick = () => cards[0] && G.Review.cardInfo(cards[0]);
    $('#enDel', sh.body).onclick = async () => { if (await UI.confirm('Hapus note?', `${cards.length} kartu akan dihapus.`, 'Hapus', true)) { Col.deleteNotes([noteId]); sh.close(); UI.toast('Note dihapus'); onSave && onSave(); } };
    $('#enSave', sh.el).onclick = () => {
      const vals = ed.values();
      const test = Object.assign({}, note, { fields: Object.assign({}, note.fields, vals) });
      if (!Col.cardOrds(nt, test).length) return UI.info('Tidak bisa disimpan', 'Note ini tidak akan menghasilkan kartu apa pun.');
      note.fields = test.fields;
      note.tags = $('#enTags', sh.body).value.split(/\s+/).filter(Boolean);
      Col.updateNote(note);
      DB.list('cards').filter(c => c.noteId === noteId).forEach(c => { if (c.deckId !== deckId) { c.deckId = deckId; DB.put('cards', c); } });
      sh.close(); UI.toast('Disimpan'); onSave && onSave();
    };
  }

  G.Editor = { renderAddView, editNote, pickDeck, saveMedia };
})(window);
