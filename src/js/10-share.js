/* =========================================================
   10 · SEND TO GMAIL — compose via Gmail web/app, mailto, copy, share
   ========================================================= */
const GMAIL_DEFAULT_KEY = 'app_gmail_default_to';
const MAX_MAIL_BODY = 5500;

function getGmailDefault() { return readLS(GMAIL_DEFAULT_KEY, '') || ''; }
function saveGmailDefault(v) {
  const val = String(v || '').trim();
  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return showToast('Format email tidak valid.', false);
  writeLS(GMAIL_DEFAULT_KEY, val);
  showToast(val ? 'Penerima default disimpan.' : 'Penerima default dikosongkan.');
}
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isMobile() { return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || isIOS(); }

function buildMailBody(body) {
  const footer = `\n\n—\nDikirim dari Hadzmi Hub · ${prettyDate(wibDateStr(), true)}`;
  let b = String(body || '');
  if (b.length > MAX_MAIL_BODY) b = b.slice(0, MAX_MAIL_BODY) + '\n\n[…dipotong karena terlalu panjang]';
  return b + footer;
}

function openShareSheet(subject, rawBody) {
  const to = getGmailDefault();
  const body = buildMailBody(rawBody);
  const enc = encodeURIComponent;
  const gmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&tf=1${to ? '&to=' + enc(to) : ''}&su=${enc(subject)}&body=${enc(body)}`;
  const gmailIOS = `googlegmail:///co?${to ? 'to=' + enc(to) + '&' : ''}subject=${enc(subject)}&body=${enc(body)}`;
  const mailto = `mailto:${to ? enc(to) : ''}?subject=${enc(subject)}&body=${enc(body)}`;
  const actions = [
    { text: isMobile() ? 'Gmail (Browser)' : 'Kirim lewat Gmail', icon: 'fas fa-envelope', onClick: () => window.open(gmailWeb, '_blank', 'noopener') }
  ];
  if (isIOS()) actions.push({ text: 'Aplikasi Gmail', icon: 'fab fa-google', onClick: () => { location.href = gmailIOS; } });
  actions.push({ text: isMobile() ? 'Aplikasi Email (Gmail/Mail)' : 'Aplikasi Email Default', icon: 'fas fa-paper-plane', onClick: () => { location.href = mailto; } });
  if (navigator.share) actions.push({ text: 'Bagikan…', icon: 'fas fa-arrow-up-from-bracket', onClick: () => navigator.share({ title: subject, text: body }).catch(() => {}) });
  actions.push({ text: 'Salin Teks', icon: 'far fa-copy', onClick: () => { copyText(subject + '\n\n' + body); showToast('Teks disalin ke clipboard!'); } });
  openActionSheet({ title: 'Kirim ke Gmail', message: subject + (to ? `\nKe: ${to}` : ''), actions });
}

// ---------- Text builders ----------
function taskLine(t) {
  const st = t.status === 'Done' ? '✅' : t.status === 'On Progress' ? '🟠' : '⬜';
  return `${st} ${t.priority === 'High' ? '🔥 ' : ''}${t.title}${t.deadline ? ` — ${prettyDate(t.deadline, true)}${t.time ? ' ' + t.time : ''}` : ''}`;
}
function shareTask(id) {
  const t = appState.todos.find(x => x.id === id); if (!t) return;
  const status = t.status === 'Done' ? 'Selesai' : t.status === 'On Progress' ? 'In Progress' : 'Pending';
  const body = [
    `📌 ${t.title}`, '',
    `Status    : ${status}`,
    `Prioritas : ${t.priority === 'High' ? 'Tinggi 🔥' : 'Normal'}`,
    `Deadline  : ${t.deadline ? prettyDate(t.deadline, true) + (t.time ? ' pukul ' + t.time + ' WIB' : '') : '-'}`,
    t.desc ? `\nDeskripsi:\n${t.desc}` : '',
    (t.links || []).filter(Boolean).length ? `\nTautan:\n${t.links.filter(Boolean).map(l => '• ' + l).join('\n')}` : ''
  ].join('\n');
  openShareSheet(`[Tugas] ${t.title}`, body);
}
function shareTaskList() {
  const smart = TA_SMART.find(s => s.key === taFilterStatus) || TA_SMART[0];
  const list = appState.todos.filter(t => taMatches(t, taFilterStatus));
  if (!list.length) return showToast('Tidak ada tugas di daftar ini.', false);
  openShareSheet(`[To-Do] ${smart.label} — ${prettyDate(wibDateStr())}`, `Daftar "${smart.label}" (${list.length} tugas):\n\n` + list.map(taskLine).join('\n'));
}
function shareDailyDigest() {
  const today = wibDateStr();
  const agenda = appState.todos.filter(t => t.deadline === today && t.status !== 'Done');
  const overdue = appState.todos.filter(t => taIsOverdue(t) && t.deadline !== today);
  const pending = appState.todos.filter(t => t.status !== 'Done' && t.deadline !== today && !taIsOverdue(t));
  const events = appState.countdowns.filter(c => !c.isArchived && c.tanggal >= today).sort((a, b) => a.tanggal.localeCompare(b.tanggal)).slice(0, 5);
  let net = 0; appState.kas.forEach(k => { net += k.jenis === 'Lebih' ? k.jumlah : -k.jumlah; });
  const body = [
    `Ringkasan ${prettyDate(today, true)}`, '',
    `📅 AGENDA HARI INI (${agenda.length})`, agenda.length ? agenda.map(taskLine).join('\n') : '— tidak ada —', '',
    overdue.length ? `⚠️ TERLAMBAT (${overdue.length})\n${overdue.map(taskLine).join('\n')}\n` : '',
    `🗂 PENDING LAINNYA (${pending.length})`, pending.slice(0, 15).map(taskLine).join('\n') || '— tidak ada —', '',
    `⏳ EVENT MENDATANG`, events.length ? events.map(c => `• ${c.nama} — ${prettyDate(c.tanggal, true)} (${daysUntil(c.tanggal)} hari lagi)`).join('\n') : '— tidak ada —', '',
    `💰 Net Ledger: ${rupiah(net)}`
  ].join('\n');
  openShareSheet(`[Hadzmi Hub] Ringkasan ${prettyDate(today)}`, body);
}
function shareNote(id) {
  const n = appState.notes.find(x => x.id === id); if (!n) return;
  openShareSheet(`[Catatan] ${n.title || n.content.slice(0, 40)}`, `${n.title ? n.title + '\n\n' : ''}${n.content}${n.tag ? `\n\n#${n.tag}` : ''}`);
}
function shareCountdown(id) {
  const c = appState.countdowns.find(x => x.id === id); if (!c) return;
  const rel = formatRelativeTime(c.tanggal);
  openShareSheet(`[Event] ${c.nama} — ${prettyDate(c.tanggal)}`, [`🎯 ${c.nama}`, `Tanggal : ${prettyDate(c.tanggal, true)}${c.jam ? ' pukul ' + c.jam + ' WIB' : ''}`, `Kategori: ${c.kategori || '-'}`, `Status  : ${rel.text}`, c.catatan ? `\nCatatan:\n${c.catatan}` : ''].join('\n'));
}
function shareBookmark(id) {
  const l = appState.links.find(x => x.id === id); if (!l) return;
  openShareSheet(`[Bookmark] ${l.title}`, `${l.title}${l.category ? ' (' + l.category + ')' : ''}\n\n${(l.urls || [l.url]).map(u => '• ' + u).join('\n')}`);
}
function shareKasReport() {
  const list = getFilteredKas();
  if (!list.length) return showToast('Tidak ada entri kas pada periode ini.', false);
  let lebih = 0, kurang = 0; list.forEach(k => { if (k.jenis === 'Lebih') lebih += k.jumlah; else kurang += k.jumlah; });
  const a = $('kasFilterAwal').value, b = $('kasFilterAkhir').value;
  const period = a || b ? `${a ? prettyDate(a) : 'awal'} s/d ${b ? prettyDate(b) : 'sekarang'}` : 'Semua periode';
  const body = [`LAPORAN SELISIH KAS`, `Periode: ${period}`, '',
    `Total Lebih  : ${rupiah(lebih)}`, `Total Kurang : ${rupiah(kurang)}`, `Net Balance  : ${rupiah(lebih - kurang)}`, '',
    `RINCIAN (${list.length} entri):`,
    ...list.map(k => `${k.tanggal}  ${k.jenis === 'Lebih' ? '+' : '−'}${rupiah(k.jumlah).padEnd(14)} ${k.keterangan || ''}`)].join('\n');
  openShareSheet(`[Kas] Laporan Selisih — ${period}`, body);
}
function shareFocusReport() {
  const hist = appState.focusHistory || [];
  if (!hist.length) return showToast('Belum ada riwayat fokus/tidur.', false);
  const sleep = hist.filter(f => f.mode === 'Sleep').slice(0, 7);
  const focus = hist.filter(f => f.mode !== 'Sleep').slice(0, 15);
  const fmt = s => `${Math.floor(s / 3600)}j ${Math.round((s % 3600) / 60)}m`;
  const avg = sleep.length ? fmt(Math.round(sleep.reduce((a, s) => a + s.durationSeconds, 0) / sleep.length)) : '-';
  const totalFocus = focus.reduce((a, f) => a + f.durationSeconds, 0);
  const body = [`LAPORAN FOKUS & TIDUR`, '',
    `😴 Tidur (7 sesi terakhir) — rata-rata ${avg}`, ...(sleep.length ? sleep.map(s => `• ${s.date}  ${s.startTime}–${s.endTime}  ${fmt(s.durationSeconds)}`) : ['— belum ada —']), '',
    `🎯 Fokus (15 sesi terakhir) — total ${Math.round(totalFocus / 60)} menit`, ...(focus.length ? focus.map(f => `• ${f.date}  ${f.mode}  ${Math.round(f.durationSeconds / 60)} mnt  (${f.status})`) : ['— belum ada —'])].join('\n');
  openShareSheet(`[Hadzmi Hub] Laporan Fokus & Tidur`, body);
}
function shareSong(id) {
  const s = appState.musicLibrary.find(x => x.id === id); if (!s) return;
  openShareSheet(`[Musik] ${s.title}${s.artist ? ' — ' + s.artist : ''}`, `🎵 ${s.title}\nArtis: ${s.artist || '-'}\nKategori: ${s.category || '-'}\n\nLink audio:\n${s.url}${s.lyrics ? `\n\nLirik:\n${s.lyrics.replace(/\[[^\]]*\]/g, '').trim()}` : ''}`);
}
