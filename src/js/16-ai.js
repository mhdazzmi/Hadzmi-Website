/* =========================================================
   16 · NEXA AI — asisten tanya-jawab & analisis (Google Gemini)
   - API key Gemini hanya ada di server (Cloudflare secret GEMINI_API_KEY); web memanggil /api/ai.
   - Nexa membaca ringkasan datamu (tugas, catatan, kas, tidur, dll) untuk menjawab & menganalisis.
   - TIDAK pernah dikirim: Galeri Tersembunyi, nomor lengkap & CVV kartu Wallet, nomor HP kontak,
     nama nasabah di Bukti Kas, PIN.
   - Riwayat chat disimpan di perangkat ini saja (localStorage).
   ========================================================= */
const AI_LS_KEY = 'nexa_ai_chat_v1';
const AI_MAX_TURNS_SENT = 30;
let aiHistory = readLS(AI_LS_KEY, []);     // format "contents" Gemini: [{role:'user'|'model', parts:[...]}]
let aiActions = readLS(AI_LS_KEY + '_act', {}); // hasil aksi per indeks pesan, untuk chip "Urungkan"
let aiBusy = false, aiRecog = null, aiTurnModel = null;

const AI_SUGGESTIONS = [
  'Ringkas agenda & tugasku hari ini',
  'Analisis selisih kas bulan ini',
  'Bagaimana pola tidurku 7 hari terakhir?',
  'Event apa saja dalam 30 hari ke depan?',
  'Ingatkan aku bayar listrik tanggal 20 jam 8 pagi',
  'Rangkum Mind Dump-ku jadi poin-poin penting'
];

function aiReady() { return !!(pushConfig && pushConfig.ai && pushConfig.ai.ready); }
function saveAiHistory() {
  if (aiHistory.length > 80) { const cut = aiHistory.length - 80; aiHistory = aiHistory.slice(cut); const a = {}; Object.keys(aiActions).forEach(k => { if (+k >= cut) a[+k - cut] = aiActions[k]; }); aiActions = a; }
  writeLS(AI_LS_KEY, aiHistory); writeLS(AI_LS_KEY + '_act', aiActions);
}

// ---------- Konteks data (dibangun ulang setiap pertanyaan) ----------
function aiClip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
function buildAiContext() {
  const now = getWIBDate(), today = wibDateStr(now);
  const hari = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const jam = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const S = appState, out = [];
  out.push(`Sekarang: ${hari}, pukul ${jam} WIB (tanggal ISO ${today}).`);
  const todos = (S.todos || []).slice(0, 150).map(t => ({ id: t.id, judul: aiClip(t.title, 120), deadline: t.deadline || null, jam: t.time || null, status: t.status || 'Pending', prioritas: t.priority || 'Normal', catatan: aiClip(t.desc, 200) || undefined }));
  out.push(`TO-DO (${todos.length}):\n` + JSON.stringify(todos));
  const cds = (S.countdowns || []).slice(0, 80).map(c => ({ id: c.id, nama: aiClip(c.nama, 100), tanggal: c.tanggal, jam: c.jam || null, kategori: c.kategori || undefined, arsip: !!c.isArchived, catatan: aiClip(c.catatan, 160) || undefined }));
  out.push(`COUNTDOWN / EVENT (${cds.length}):\n` + JSON.stringify(cds));
  const notes = coll => (S[coll] || []).slice(0, 60).map(n => ({ judul: aiClip(n.title, 100) || undefined, isi: aiClip(n.content, 600), tag: n.tag || undefined, tanggal: n.date || undefined }));
  out.push(`MIND DUMP (catatan pribadi):\n` + JSON.stringify(notes('notes')));
  out.push(`CATATAN KERJA:\n` + JSON.stringify(notes('workNotes')));
  const kas = (S.kas || []).slice(0, 300).map(k => ({ tanggal: k.tanggal, jam: k.jam || undefined, jenis: k.jenis, nominal: k.jumlah, ket: aiClip(k.keterangan, 80) || undefined }));
  out.push(`SELISIH KAS teller (jenis "Kurang" = uang kurang, "Lebih" = uang lebih; nominal dalam Rupiah) (${kas.length}):\n` + JSON.stringify(kas));
  const focus = (S.focusHistory || []).slice(0, 120).map(f => ({ tanggal: f.date, mulai: f.startTime, selesai: f.endTime, mode: f.mode, menit: Math.round((f.durationSeconds || 0) / 60), status: f.status || undefined }));
  out.push(`RIWAYAT FOCUS & TIDUR (mode "Sleep" = tidur) (${focus.length}):\n` + JSON.stringify(focus));
  const links = (S.links || []).slice(0, 60).map(l => ({ judul: aiClip(l.title, 80), url: l.url, kategori: l.category || undefined }));
  out.push(`BOOKMARKS:\n` + JSON.stringify(links));
  const wallet = (S.walletCards || []).map(c => ({ nama: c.name, penerbit: c.issuer || undefined, berlaku_sampai: c.expiry || undefined, catatan: aiClip(c.note, 120) || undefined }));
  out.push(`KARTU DI WALLET (nomor & CVV sengaja disembunyikan):\n` + JSON.stringify(wallet));
  const docs = (S.workDocs || []).slice(0, 150).map(d => ({ nama: d.name, kategori: d.folder || 'Umum', ukuran_kb: Math.round((d.size || 0) / 1024), diupload: d.createdAt ? wibDateStr(new Date(d.createdAt)) : undefined }));
  out.push(`FILE DI GUDANG FILE:\n` + JSON.stringify(docs));
  const songs = (S.musicLibrary || []);
  out.push(`MUSIK: ${songs.length} lagu. Contoh judul: ` + JSON.stringify(songs.slice(0, 40).map(s => `${s.title} – ${s.artist || s.category || ''}`)));
  out.push(`GALERI: ${(S.galleryPhotos || []).length} foto, ${(S.galleryAlbums || []).length} album. Bukti Kas: ${(S.workPhotos || []).length} foto. Kontak WA: ${(S.contacts || []).length} kontak.`);
  try { const st = streakStats(); out.push(`STREAK membuka Nexa: ${st.cur} hari berturut-turut (rekor ${st.best}).`); } catch (e) {}
  return out.join('\n\n');
}

function aiSystemInstruction() {
  const name = (typeof L === 'function' && L('user.name')) || 'Hadzmi';
  return { parts: [{ text:
`Kamu adalah Nexa, asisten pribadi milik ${name} di aplikasi web "Nexa". ${name} bekerja sebagai teller bank di Indonesia.
Gaya: bahasa Indonesia santai tapi sopan, hangat, ringkas, langsung ke inti. Panggil dia "${name}" atau "kamu". Boleh pakai emoji secukupnya.
Format jawaban dengan Markdown sederhana: **tebal**, daftar "-", tabel bila membandingkan angka. Nominal uang pakai format Rupiah (Rp 1.250.000). Tanggal pakai format Indonesia (Senin, 24 Nov 2026).

Kemampuan:
- Menjawab pertanyaan apa pun (umum maupun tentang datanya).
- Menganalisis data di bawah: pola, tren, total, rata-rata, perbandingan, saran yang praktis. Hitung dengan teliti; jika data tidak cukup, katakan terus terang.
- Membuat To-Do / pengingat, Countdown, catatan, menandai tugas selesai, dan membuka menu aplikasi memakai fungsi (tools) yang tersedia. Panggil fungsinya langsung bila permintaannya jelas; bila tanggal/jam ambigu, tanya dulu. Tanggal relatif ("besok", "Jumat depan", "tanggal 20") hitung dari tanggal hari ini. Setelah fungsi berhasil, konfirmasi singkat apa yang dibuat.
- Jangan mengarang data yang tidak ada. Jangan pernah mengaku bisa mengirim pesan, email, atau melakukan transaksi.

DATA ${name.toUpperCase()} SAAT INI:
${buildAiContext()}` }] };
}

// ---------- Fungsi (tools) yang boleh dipakai Nexa ----------
const AI_TOOLS = [{ functionDeclarations: [
  { name: 'buat_todo', description: 'Membuat To-Do / pengingat baru. Pengingat notifikasi otomatis aktif bila ada tanggal (dan jam).',
    parameters: { type: 'object', properties: {
      judul: { type: 'string', description: 'Judul tugas singkat' },
      tanggal: { type: 'string', description: 'Tanggal deadline format YYYY-MM-DD (opsional)' },
      jam: { type: 'string', description: 'Jam format HH:MM 24 jam (opsional)' },
      catatan: { type: 'string', description: 'Detail tambahan (opsional)' },
      prioritas_tinggi: { type: 'boolean', description: 'true bila penting/mendesak' } }, required: ['judul'] } },
  { name: 'buat_countdown', description: 'Membuat event Countdown (hitung mundur) untuk tanggal penting.',
    parameters: { type: 'object', properties: {
      nama: { type: 'string' }, tanggal: { type: 'string', description: 'YYYY-MM-DD' },
      jam: { type: 'string', description: 'HH:MM (opsional)' }, catatan: { type: 'string' } }, required: ['nama', 'tanggal'] } },
  { name: 'buat_catatan', description: 'Menyimpan catatan baru ke Mind Dump (pribadi) atau Catatan Kerja.',
    parameters: { type: 'object', properties: {
      judul: { type: 'string' }, isi: { type: 'string' },
      jenis: { type: 'string', enum: ['mind_dump', 'kerja'], description: 'Default mind_dump' } }, required: ['isi'] } },
  { name: 'tandai_todo_selesai', description: 'Menandai To-Do sebagai selesai berdasarkan id dari data.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'buka_menu', description: 'Membuka menu/halaman tertentu di aplikasi Nexa untuk pengguna.',
    parameters: { type: 'object', properties: { menu: { type: 'string', enum: ['home', 'todo', 'mind_dump', 'countdown', 'bookmarks', 'focus', 'wallet', 'music', 'galeri', 'bukti_kas', 'selisih_kas', 'catatan_kerja', 'gudang_file', 'kontak', 'settings'] } }, required: ['menu'] } }
] }];

const AI_MENU = {
  home: () => switchTab('tab-dashboard'), todo: () => navigateFromQuickMenu('tab-hub', 'sub-todo'), mind_dump: () => navigateFromQuickMenu('tab-hub', 'sub-notes'),
  countdown: () => navigateFromQuickMenu('tab-hub', 'sub-countdown'), bookmarks: () => navigateFromQuickMenu('tab-hub', 'sub-links'), focus: () => navigateFromQuickMenu('tab-hub', 'sub-focus'),
  wallet: () => navigateFromQuickMenu('tab-hub', 'sub-wallet'), music: () => { switchTab('tab-music'); switchMediaSub('sub-music'); }, galeri: () => { switchTab('tab-music'); switchMediaSub('sub-gallery'); },
  bukti_kas: () => navigateFromQuickMenu('tab-workfin', 'sub-photos'), selisih_kas: () => navigateFromQuickMenu('tab-workfin', 'sub-kas'), catatan_kerja: () => navigateFromQuickMenu('tab-workfin', 'sub-worknotes'),
  gudang_file: () => navigateFromQuickMenu('tab-workfin', 'sub-docs'), kontak: () => navigateFromQuickMenu('tab-workfin', 'sub-contacts'), settings: () => switchTab('tab-backup')
};
const isoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : '';
const hhmm = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')) ? s : '';

function runAiTool(name, a) {
  a = a || {};
  const refresh = () => { saveStateToLocal(); renderAllModules(); };
  if (name === 'buat_todo') {
    if (!a.judul) return { ok: false, error: 'judul kosong' };
    const t = { id: 'td_' + Date.now() + Math.floor(Math.random() * 1000), title: aiClip(a.judul, 200), desc: String(a.catatan || '').slice(0, 2000), deadline: isoDate(a.tanggal), time: hhmm(a.jam), status: '', links: [], priority: a.prioritas_tinggi ? 'High' : 'Normal' };
    appState.todos.unshift(t); refresh();
    return { ok: true, undo: { coll: 'todos', id: t.id }, label: `To-Do dibuat: ${t.title}${t.deadline ? ' · ' + prettyDate(t.deadline, true) : ''}${t.time ? ' ' + t.time : ''}`, icon: 'fa-list-check' };
  }
  if (name === 'buat_countdown') {
    if (!a.nama || !isoDate(a.tanggal)) return { ok: false, error: 'nama/tanggal tidak valid (YYYY-MM-DD)' };
    const c = { id: 'cd_' + Date.now(), nama: aiClip(a.nama, 120), kategori: '', catatan: String(a.catatan || '').slice(0, 1000), tanggal: a.tanggal, jam: hhmm(a.jam), isArchived: false };
    appState.countdowns.unshift(c); refresh();
    return { ok: true, undo: { coll: 'countdowns', id: c.id }, label: `Countdown dibuat: ${c.nama} · ${prettyDate(c.tanggal, true)}`, icon: 'fa-hourglass-half' };
  }
  if (name === 'buat_catatan') {
    if (!a.isi) return { ok: false, error: 'isi kosong' };
    const coll = a.jenis === 'kerja' ? 'workNotes' : 'notes';
    const n = { id: 'note_' + Date.now(), title: aiClip(a.judul || '', 120), content: String(a.isi).slice(0, 20000), tag: '', isPinned: false, date: new Date().toLocaleDateString('en-US') };
    (appState[coll] || (appState[coll] = [])).unshift(n); refresh();
    return { ok: true, undo: { coll, id: n.id }, label: `${coll === 'workNotes' ? 'Catatan Kerja' : 'Mind Dump'} disimpan${n.title ? ': ' + n.title : ''}`, icon: 'fa-note-sticky' };
  }
  if (name === 'tandai_todo_selesai') {
    const t = (appState.todos || []).find(x => x.id === a.id); if (!t) return { ok: false, error: 'To-Do tidak ditemukan' };
    const prev = t.status; t.status = 'Done'; refresh();
    return { ok: true, undo: { coll: 'todos', id: t.id, restore: { status: prev } }, label: `Ditandai selesai: ${t.title}`, icon: 'fa-circle-check' };
  }
  if (name === 'buka_menu') {
    const fn = AI_MENU[a.menu]; if (!fn) return { ok: false, error: 'menu tidak dikenal' };
    return { ok: true, label: `Buka menu: ${a.menu.replace(/_/g, ' ')}`, icon: 'fa-arrow-up-right-from-square', open: a.menu };
  }
  return { ok: false, error: 'fungsi tidak dikenal' };
}
function undoAiAction(msgIdx, k) {
  const act = (aiActions[msgIdx] || [])[k]; if (!act || !act.undo || act.undone) return;
  const u = act.undo, list = appState[u.coll] || [];
  if (u.restore) { const it = list.find(x => x.id === u.id); if (it) Object.assign(it, u.restore); }
  else appState[u.coll] = list.filter(x => x.id !== u.id);
  act.undone = true; saveAiHistory(); saveStateToLocal(); renderAllModules(); renderAiChat(); showToast('Dibatalkan.');
}
function openAiMenu(menu) { const fn = AI_MENU[menu]; if (fn) { closeAiChat(); fn(); } }

// ---------- Kirim pertanyaan ----------
/** Percakapan yang dikirim ke Gemini: tanpa pesan error, mulai dari pesan user, dan pesan user teks berturut-turut digabung. */
function aiContentsForSend() {
  const isText = m => (m.parts || []).every(p => typeof p.text === 'string');
  const out = [];
  aiHistory.filter(m => !m.error).slice(-AI_MAX_TURNS_SENT).forEach(m => {
    const prev = out[out.length - 1];
    if (prev && prev.role === 'user' && m.role === 'user' && isText(prev) && isText(m)) prev.parts = [{ text: prev.parts.map(p => p.text).concat(m.parts.map(p => p.text)).join('\n\n') }];
    else out.push({ role: m.role, parts: m.parts });
  });
  while (out.length && (out[0].role !== 'user' || !isText(out[0]))) out.shift();
  return out;
}
function aiNetworkError(err) { return err && (err.name === 'AbortError' || /load failed|failed to fetch|networkerror|network connection|internet/i.test(err.message || '')); }
let aiLiveText = '', aiStartedAt = 0, aiTick = null;
/** Kirim ke /api/ai dan baca jawaban sebagai aliran (NDJSON): teks tampil sedikit demi sedikit. */
async function aiStreamOnce(body, signal) {
  const user = firebaseAuth && firebaseAuth.currentUser;
  if (!user) throw new Error('Belum login ke Firebase');
  const res = await fetch(PUSH_API + '/ai', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() }, body });
  if (!res.ok) { let msg = 'HTTP ' + res.status; try { msg = (await res.json()).error || msg; } catch (e) {} throw new Error(msg); }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', final = null;
  const line = (ln) => {
    ln = ln.trim(); if (!ln) return;
    let o; try { o = JSON.parse(ln); } catch (e) { return; }
    if (o.d) { aiLiveText += o.d; updateAiLive(); }
    else if (o.error) { const e = new Error(o.error); e.status = o.status; e.server = true; throw e; }
    else if (o.done) final = o;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) { buf += dec.decode(value, { stream: true }); let k; while ((k = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, k); buf = buf.slice(k + 1); line(ln); } }
    if (done) break;
  }
  line(buf);
  if (!final) { const e = new Error('Load failed'); throw e; }
  return final;
}
async function aiRequest() {
  const body = JSON.stringify({ contents: aiContentsForSend(), systemInstruction: aiSystemInstruction(), tools: AI_TOOLS, model: aiTurnModel });
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 120000);
    aiLiveText = ''; updateAiLive();
    try {
      return await aiStreamOnce(body, ctrl.signal);
    } catch (err) {
      if (err.server) throw err;
      // Coba ulang otomatis 1× bila koneksi putus sebelum ada teks yang tampil
      if (attempt === 0 && !aiLiveText && aiNetworkError(err) && document.visibilityState === 'visible') { await new Promise(r => setTimeout(r, 1500)); continue; }
      if (err.name === 'AbortError') throw new Error('Nexa terlalu lama menjawab (lebih dari 2 menit). Coba lagi atau persingkat pertanyaanmu.');
      if (aiNetworkError(err)) throw new Error('Koneksi terputus sebelum Nexa selesai menjawab. Pastikan internet stabil dan aplikasi tetap terbuka saat menunggu.');
      throw err;
    } finally { clearTimeout(timer); }
  }
}
/** Perbarui gelembung jawaban yang sedang ditulis (tanpa render ulang seluruh chat). */
function updateAiLive() {
  const el = $('aiLive'); if (!el) return;
  if (aiLiveText) { el.classList.remove('ai-typing-wrap'); el.innerHTML = aiMarkdown(aiLiveText) + '<span class="ai-caret"></span>'; }
  else { const sec = aiStartedAt ? Math.floor((Date.now() - aiStartedAt) / 1000) : 0; el.innerHTML = `<span class="ai-typing"><span></span><span></span><span></span></span>${sec >= 3 ? `<span class="ai-wait">Nexa sedang berpikir… ${sec} dtk</span>` : ''}`; }
  const b = $('aiMessages'); if (b && b.scrollHeight - b.scrollTop - b.clientHeight < 160) b.scrollTop = b.scrollHeight;
}
async function sendAiMessage(text) {
  text = String(text == null ? $('aiInput').value : text).trim();
  if (!text || aiBusy) return;
  if (!aiReady()) { renderAiChat(); return showToast('Nexa AI belum diaktifkan. Lihat panduan di layar.', false); }
  $('aiInput').value = ''; autoGrowAi();
  aiHistory = aiHistory.filter(m => !m.error); // error lama tidak perlu disimpan
  aiHistory.push({ role: 'user', parts: [{ text }] }); saveAiHistory();
  await runAiTurn();
}
/** Ulangi pertanyaan terakhir setelah gagal (tanpa mengetik ulang). */
async function retryAi() {
  if (aiBusy) return;
  aiHistory = aiHistory.filter(m => !m.error); saveAiHistory();
  if (!aiHistory.length || aiHistory[aiHistory.length - 1].role !== 'user') return;
  await runAiTurn();
}
async function runAiTurn() {
  aiBusy = true; aiTurnModel = null; aiLiveText = ''; aiStartedAt = Date.now(); renderAiChat(); scrollAiBottom();
  clearInterval(aiTick); aiTick = setInterval(() => { if (!aiLiveText) updateAiLive(); }, 1000);
  try {
    for (let step = 0; step < 5; step++) {
      const res = await aiRequest();
      if (res.model) aiTurnModel = res.model;
      const parts = (res.parts || []).filter(p => p && (p.text != null || p.functionCall || p.thoughtSignature));
      if (!parts.length) {
        aiHistory.push({ role: 'model', parts: [{ text: res.blocked ? 'Maaf, pertanyaan ini tidak bisa aku jawab.' : 'Maaf, aku belum bisa menjawab itu. Coba tanyakan dengan kalimat lain ya.' }] });
        break;
      }
      aiHistory.push({ role: 'model', parts });
      const calls = parts.filter(p => p.functionCall);
      if (!calls.length) break;
      const results = [], acts = [];
      for (const p of calls) {
        let r; try { r = runAiTool(p.functionCall.name, p.functionCall.args); } catch (e) { r = { ok: false, error: e.message }; }
        if (r.ok) acts.push({ label: r.label, icon: r.icon, undo: r.undo || null, open: r.open || null });
        results.push({ functionResponse: { name: p.functionCall.name, response: r.ok ? { hasil: 'berhasil', keterangan: r.label } : { hasil: 'gagal', error: r.error } } });
      }
      if (acts.length) aiActions[aiHistory.length - 1] = acts;
      aiHistory.push({ role: 'user', parts: results });
      saveAiHistory(); renderAiChat(); scrollAiBottom();
    }
  } catch (err) {
    aiHistory.push({ role: 'model', parts: [{ text: '⚠️ ' + (err.message || 'Gagal menghubungi Nexa AI') }], error: true });
  }
  clearInterval(aiTick); aiLiveText = '';
  aiBusy = false; saveAiHistory(); renderAiChat(); scrollAiBottom();
}

// ---------- Markdown sederhana → HTML (aman: semua teks di-escape dulu) ----------
function aiInline(s) {
  return s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="auto-link">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener" class="auto-link">$2</a>');
}
function aiMarkdown(md) {
  const lines = esc(md).split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^```/.test(ln)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); out.push(`<pre>${buf.join('\n')}</pre>`); continue; }
    if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => aiInline(c.trim()));
      const head = row(ln); i += 2; const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++])); i--;
      out.push(`<div class="ai-table"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(ln)) {
      const ordered = /^\s*\d+[.)]/.test(ln), items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(aiInline(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))); i--;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(t => `<li>${t}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln); if (h) { out.push(`<div class="ai-h">${aiInline(h[2])}</div>`); continue; }
    if (!ln.trim()) { out.push('<div class="ai-gap"></div>'); continue; }
    out.push(`<p>${aiInline(ln)}</p>`);
  }
  return out.join('');
}

// ---------- Tampilan ----------
function openAiChat(prefill) {
  openSheet('sheetAi'); renderAiChat(); scrollAiBottom();
  if (prefill) { $('aiInput').value = prefill; autoGrowAi(); }
  if (!pushConfig) loadPushConfig().then(renderAiChat);
  setTimeout(() => { if (window.innerWidth > 760) $('aiInput').focus(); }, 350);
}
function closeAiChat() { closeSheet('sheetAi'); stopAiVoice(); }
function scrollAiBottom() { const b = $('aiMessages'); if (b) setTimeout(() => b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }), 30); }
function autoGrowAi() { const t = $('aiInput'); if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }
function renderAiChat() {
  const box = $('aiMessages'); if (!box) return;
  if ($('aiModelLabel')) $('aiModelLabel').textContent = aiReady() ? 'Gemini · ' + (pushConfig.ai.model || '') : 'belum aktif';
  if (!aiReady()) { box.innerHTML = aiSetupHTML(); return; }
  const name = (typeof L === 'function' && L('user.name')) || 'Hadzmi';
  let html = '';
  if (!aiHistory.length) {
    html = `<div class="ai-hello"><img src="icons/icon-192.png?v=4" alt=""><div class="t-title3">Hai ${esc(name)}, aku Nexa ✨</div>
      <div class="t-foot muted">Tanya apa saja, minta analisis data kamu, atau suruh aku bikin pengingat.</div></div>
      <div class="ai-suggest">${AI_SUGGESTIONS.map(s => `<button class="chip" onclick="sendAiMessage(${esc(JSON.stringify(s))})">${esc(s)}</button>`).join('')}</div>`;
  }
  aiHistory.forEach((m, idx) => {
    const texts = (m.parts || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('\n').trim();
    if (m.role === 'user') { if (texts) html += `<div class="ai-msg me"><div class="ai-bubble">${esc(texts).replace(/\n/g, '<br>')}</div></div>`; return; }
    if (texts) html += `<div class="ai-msg bot ${m.error ? 'err' : ''}"><div class="ai-bubble">${m.error ? esc(texts) + (idx === aiHistory.length - 1 && !aiBusy ? `<div><button class="ai-retry" onclick="retryAi()"><i class="fas fa-rotate-right"></i> Coba lagi</button></div>` : '') : aiMarkdown(texts)}</div>${!m.error ? `<button class="ai-copy" onclick="copyText(${esc(JSON.stringify(texts))}); showToast('Jawaban disalin')"><i class="far fa-copy"></i></button>` : ''}</div>`;
    (aiActions[idx] || []).forEach((a, k) => {
      html += `<div class="ai-action ${a.undone ? 'undone' : ''}"><i class="fas ${a.icon || 'fa-check'}"></i><span class="flex-1">${esc(a.label)}${a.undone ? ' (dibatalkan)' : ''}</span>
        ${a.open ? `<button onclick="openAiMenu('${esc(a.open)}')">Buka</button>` : ''}${a.undo && !a.undone ? `<button onclick="undoAiAction(${idx}, ${k})">Urungkan</button>` : ''}</div>`;
    });
  });
  if (aiBusy) html += `<div class="ai-msg bot"><div class="ai-bubble" id="aiLive"></div></div>`;
  box.innerHTML = html;
  if (aiBusy) updateAiLive();
  $('aiSendBtn').disabled = aiBusy;
}
function aiSetupHTML() {
  const offline = pushConfig === false;
  return `<div class="ai-hello"><img src="icons/icon-192.png?v=4" alt=""><div class="t-title3">Aktifkan Nexa AI</div>
    <div class="t-foot muted">${offline ? 'Server Nexa tidak terjangkau. Cek koneksi internet lalu buka lagi.' : 'Nexa AI memakai Google Gemini (gratis). Cukup 1× setup, ±5 menit:'}</div></div>
    ${offline ? '' : `<div class="card card-pad ai-setup"><ol>
      <li>Buka <b>aistudio.google.com</b> → login akun Google → <b>Get API key</b> → <b>Create API key</b> → salin.</li>
      <li>Buka <b>dash.cloudflare.com</b> → Workers & Pages → <b>hadzmi-website-utama</b> → <b>Settings</b> → <b>Variables and Secrets</b> → <b>Add</b>.</li>
      <li>Type: <b>Secret</b> · Name: <code>GEMINI_API_KEY</code> · Value: tempel API key → <b>Deploy</b>.</li>
      <li>Tutup lalu buka lagi Nexa. Selesai ✨</li></ol>
      <div class="t-cap muted mt-8">API key tersimpan aman di server, tidak terlihat dari web. Jangan kirim API key lewat chat ke siapa pun.</div></div>`}`;
}
function clearAiChat() {
  iosConfirm('Hapus percakapan?', 'Riwayat chat Nexa di perangkat ini akan dihapus. Data yang sudah dibuat (To-Do, catatan) tidak ikut terhapus.', 'Hapus', true)
    .then(ok => { if (!ok) return; aiHistory = []; aiActions = {}; saveAiHistory(); renderAiChat(); });
}

// ---------- Input suara ----------
function aiVoiceSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function toggleAiVoice() {
  if (aiRecog) return stopAiVoice();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return showToast('Input suara tidak didukung di browser ini.', false);
  const r = new SR(); r.lang = 'id-ID'; r.interimResults = true; r.continuous = false;
  const base = $('aiInput').value ? $('aiInput').value.trim() + ' ' : '';
  r.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; $('aiInput').value = base + t; autoGrowAi(); };
  r.onend = () => { aiRecog = null; $('aiMicBtn').classList.remove('rec'); };
  r.onerror = e => { if (e.error === 'not-allowed') showToast('Izinkan akses mikrofon untuk input suara.', false); };
  aiRecog = r; $('aiMicBtn').classList.add('rec'); r.start();
}
function stopAiVoice() { if (aiRecog) { try { aiRecog.stop(); } catch (e) {} aiRecog = null; } const b = $('aiMicBtn'); if (b) b.classList.remove('rec'); }
function initAiChat() {
  const t = $('aiInput'); if (!t || t.dataset.init) return; t.dataset.init = '1';
  t.addEventListener('input', autoGrowAi);
  t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 760) { e.preventDefault(); sendAiMessage(); } });
  if (!aiVoiceSupported() && $('aiMicBtn')) $('aiMicBtn').classList.add('hidden');
}
