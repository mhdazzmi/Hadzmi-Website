/* =========================================================
   10 · PDF — ekspor catatan, countdown, laporan ke PDF + pratinjau, bagikan (WhatsApp), unduh
   ========================================================= */
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const scriptPromises = {};
function loadScriptOnce(url) {
  if (!scriptPromises[url]) scriptPromises[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = url; s.async = true;
    s.onload = resolve; s.onerror = () => { delete scriptPromises[url]; reject(new Error('Gagal memuat komponen PDF (cek internet)')); };
    document.head.appendChild(s);
  });
  return scriptPromises[url];
}
// Font PDF standar hanya mendukung huruf Latin — emoji & simbol khusus dibersihkan
function pdfText(s) {
  return String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/[•·]/g, '-').replace(/×/g, 'x').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

/** blocks: {heading} | {meta:[[label,value]]} | {para} | {table:{cols:[{h,w,align}], rows:[[...]]}} | {stats:[[label,value]]} */
async function buildPdf({ title, subtitle, blocks, fileName }) {
  await loadScriptOnce(JSPDF_URL);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16, CW = W - M * 2;
  const NAVY = [16, 37, 84], GREY = [110, 110, 118], LINE = [225, 226, 232];
  let y = 0;
  const header = (first) => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, first ? 34 : 14, 'F');
    doc.setTextColor(255, 255, 255);
    if (first) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(pdfText(L('app.name')).toUpperCase(), M, 11);
      doc.setFontSize(18); doc.text(doc.splitTextToSize(pdfText(title), CW)[0], M, 21);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); if (subtitle) doc.text(pdfText(subtitle), M, 28);
      y = 44;
    } else { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(pdfText(title), M, 9); y = 24; }
    doc.setTextColor(20, 20, 24);
  };
  const ensure = (h) => { if (y + h > H - 18) { doc.addPage(); header(false); } };
  header(true);
  for (const b of blocks || []) {
    if (b.heading) {
      ensure(14); y += 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...NAVY); doc.text(pdfText(b.heading), M, y);
      doc.setDrawColor(...LINE); doc.line(M, y + 2.2, W - M, y + 2.2); y += 8; doc.setTextColor(20, 20, 24);
    } else if (b.meta) {
      doc.setFontSize(10.5);
      b.meta.filter(r => r[1] !== '' && r[1] != null).forEach(([k, v]) => {
        const lines = doc.splitTextToSize(pdfText(v), CW - 38); ensure(lines.length * 5 + 2);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY); doc.text(pdfText(k), M, y);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 24); doc.text(lines, M + 38, y); y += lines.length * 5 + 1.5;
      });
      y += 3;
    } else if (b.para != null) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
      pdfText(b.para).split('\n').forEach(par => {
        const lines = par.trim() ? doc.splitTextToSize(par, CW) : [''];
        lines.forEach(ln => { ensure(5.6); doc.text(ln, M, y); y += 5.6; });
      });
      y += 3;
    } else if (b.stats) {
      ensure(22); const n = b.stats.length, gap = 4, w = (CW - gap * (n - 1)) / n;
      b.stats.forEach(([k, v, color], i) => {
        const x = M + i * (w + gap);
        doc.setFillColor(...(color || [240, 242, 248])); doc.roundedRect(x, y, w, 18, 3, 3, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY); doc.text(pdfText(k), x + 4, y + 6.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 24); doc.text(doc.splitTextToSize(pdfText(v), w - 8)[0], x + 4, y + 13.5);
      });
      y += 24;
    } else if (b.table) {
      const cols = b.table.cols, total = cols.reduce((s, c) => s + c.w, 0);
      const ws = cols.map(c => c.w / total * CW);
      const drawHead = () => {
        ensure(10); doc.setFillColor(...NAVY); doc.rect(M, y - 5, CW, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
        let x = M; cols.forEach((c, i) => { doc.text(pdfText(c.h), c.align === 'right' ? x + ws[i] - 2 : x + 2, y, { align: c.align === 'right' ? 'right' : 'left' }); x += ws[i]; });
        y += 6; doc.setTextColor(20, 20, 24);
      };
      drawHead();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      b.table.rows.forEach((row, ri) => {
        const cells = row.map((v, i) => doc.splitTextToSize(pdfText(v), ws[i] - 4));
        const h = Math.max(...cells.map(c => c.length)) * 4.6 + 2.5;
        if (y + h > H - 18) { doc.addPage(); header(false); drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); }
        if (ri % 2) { doc.setFillColor(246, 247, 251); doc.rect(M, y - 4, CW, h, 'F'); }
        let x = M; cells.forEach((c, i) => { doc.text(c, cols[i].align === 'right' ? x + ws[i] - 2 : x + 2, y, { align: cols[i].align === 'right' ? 'right' : 'left' }); x += ws[i]; });
        y += h;
      });
      y += 5;
    }
  }
  const pages = doc.getNumberOfPages();
  const stamp = `Dibuat ${new Date().toLocaleString('id-ID')}`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
    doc.text(pdfText(stamp), M, H - 8); doc.text(`Halaman ${i} / ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc.output('blob');
}

// ---------- Pratinjau PDF (pdf.js — semua halaman tampil, juga di iPad) ----------
async function renderPdfInto(box, blob) {
  box.innerHTML = '<span class="spinner dark"></span>';
  try {
    await loadScriptOnce(PDFJS_URL);
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    box.innerHTML = ''; box.classList.add('pdf-pages');
    // Render 1.5× lebih tajam agar tetap jelas saat di-zoom / layar penuh
    const width = Math.max(280, box.clientWidth - 16), dpr = Math.min(3, (window.devicePixelRatio || 1) * 1.5);
    for (let n = 1; n <= Math.min(pdf.numPages, 80); n++) {
      const page = await pdf.getPage(n);
      const vp1 = page.getViewport({ scale: 1 }), scale = width / vp1.width, vp = page.getViewport({ scale: scale * dpr });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = (viewerZoom * 100) + '%';
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
    if (pdf.numPages > 80) box.insertAdjacentHTML('beforeend', `<div class="t-foot muted center">Menampilkan 80 dari ${pdf.numPages} halaman — unduh untuk melihat semua.</div>`);
  } catch (err) {
    box.classList.remove('pdf-pages');
    box.innerHTML = `<iframe src="${URL.createObjectURL(blob)}" title="PDF"></iframe>`;
  }
}
let pdfViewerBlob = null, pdfViewerName = '';
async function openPdfPreview(blob, name, meta) {
  pdfViewerBlob = blob; pdfViewerName = name;
  $('viewerTitle').textContent = name;
  $('viewerMeta').textContent = meta || `PDF · ${formatBytes(blob.size)}`;
  $('viewerActions').innerHTML = `
    <button class="btn btn-green btn-sm" onclick="shareBlobFile(pdfViewerBlob, pdfViewerName, 'application/pdf')"><i class="fab fa-whatsapp"></i> WhatsApp</button>
    <button class="btn btn-tinted btn-sm" onclick="shareBlobFile(pdfViewerBlob, pdfViewerName, 'application/pdf')"><i class="fas fa-arrow-up-from-bracket"></i> Bagikan</button>
    <button class="btn btn-gray btn-sm" onclick="downloadBlob(pdfViewerBlob, pdfViewerName)"><i class="fas fa-download"></i> Unduh</button>`;
  $('viewerMore').onclick = () => downloadBlob(pdfViewerBlob, pdfViewerName);
  openSheet('sheetViewer');
  await renderPdfInto($('viewerBody'), blob);
}
/** Bagikan file lewat menu Bagikan perangkat (pilih WhatsApp, Gmail, Files, dll). */
async function shareBlobFile(blob, name, type) {
  const file = new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  downloadBlob(file, name);
  showToast('Perangkat tidak mendukung bagikan file — file diunduh, lampirkan manual di WhatsApp.');
}
async function makeAndShowPdf(spec) {
  try {
    showToast('Membuat PDF…');
    const blob = await buildPdf(spec);
    await openPdfPreview(blob, spec.fileName);
  } catch (err) { showToast(err.message || 'Gagal membuat PDF', false); }
}
function pdfName(s) { return safeFileName(s).replace(/\.pdf$/i, '') + '.pdf'; }

// ---------- Dokumen ----------
function pdfNote(id, coll) {
  const n = (appState[coll || 'notes'] || []).find(x => x.id === id); if (!n) return;
  const kind = coll === 'workNotes' ? L('work.notes') : L('hub.notes');
  makeAndShowPdf({
    title: n.title || 'Catatan', subtitle: `${kind}${n.date ? ' · ' + n.date : ''}`, fileName: pdfName(n.title || 'catatan'),
    blocks: [...(n.tag ? [{ meta: [['Tag', n.tag]] }] : []), { para: n.content }]
  });
}
function pdfCountdown(id) {
  const c = appState.countdowns.find(x => x.id === id); if (!c) return;
  const rel = formatRelativeTime(c.tanggal);
  makeAndShowPdf({
    title: c.nama, subtitle: L('hub.countdown'), fileName: pdfName('event-' + c.nama),
    blocks: [{ meta: [['Tanggal', prettyDate(c.tanggal, true) + (c.jam ? ' pukul ' + c.jam + ' WIB' : '')], ['Kategori', c.kategori || '-'], ['Status', rel.text], ['Arsip', c.isArchived ? 'Ya' : 'Tidak']] },
      ...(c.catatan && c.catatan.trim() ? [{ heading: 'Catatan' }, { para: c.catatan }] : [])]
  });
}
function pdfKasReport() {
  const list = getFilteredKas();
  if (!list.length) return showToast('Tidak ada catatan plus minus pada periode ini.', false);
  let lebih = 0, kurang = 0; list.forEach(k => { if (k.jenis === 'Lebih') lebih += k.jumlah; else kurang += k.jumlah; });
  const a = $('kasFilterAwal').value, b = $('kasFilterAkhir').value;
  const period = a || b ? `${a ? prettyDate(a) : 'awal'} s/d ${b ? prettyDate(b) : 'sekarang'}` : 'Semua periode';
  makeAndShowPdf({
    title: 'Laporan Plus Minus', subtitle: `Periode: ${period} · ${list.length} entri`, fileName: pdfName('laporan-plus-minus-' + wibDateStr()),
    blocks: [
      { stats: [['Total Plus', rupiah(lebih), [228, 247, 234]], ['Total Minus', rupiah(kurang), [253, 232, 232]], ['Net', rupiah(lebih - kurang), [229, 238, 255]]] },
      { heading: 'Rincian' },
      { table: { cols: [{ h: 'Tanggal', w: 26 }, { h: 'Jam', w: 11 }, { h: 'Jenis', w: 13 }, { h: 'Nominal', w: 22, align: 'right' }, { h: 'Keterangan', w: 40 }],
        rows: list.map(k => [prettyDate(k.tanggal), k.jam || '-', k.jenis, (k.jenis === 'Lebih' ? '+' : '-') + rupiah(k.jumlah), k.keterangan || '-']) } }
    ]
  });
}
function pdfFocusReport() {
  const hist = appState.focusHistory || [];
  if (!hist.length) return showToast('Belum ada riwayat fokus/tidur.', false);
  const fmt = s => `${Math.floor(s / 3600)}j ${Math.round((s % 3600) / 60)}m`;
  const sleep = hist.filter(f => f.mode === 'Sleep'), focus = hist.filter(f => f.mode !== 'Sleep');
  const avg = sleep.length ? fmt(Math.round(sleep.reduce((n, s) => n + s.durationSeconds, 0) / sleep.length)) : '-';
  const totalFocus = focus.reduce((n, f) => n + f.durationSeconds, 0);
  makeAndShowPdf({
    title: 'Laporan Fokus & Tidur', subtitle: `${hist.length} sesi tercatat`, fileName: pdfName('laporan-fokus-tidur-' + wibDateStr()),
    blocks: [
      { stats: [['Rata-rata tidur', avg], ['Sesi tidur', String(sleep.length)], ['Total fokus', Math.round(totalFocus / 60) + ' menit']] },
      ...(sleep.length ? [{ heading: 'Tidur' }, { table: { cols: [{ h: 'Tanggal', w: 30 }, { h: 'Mulai', w: 15 }, { h: 'Bangun', w: 15 }, { h: 'Durasi', w: 20, align: 'right' }], rows: sleep.map(s => [prettyDate(s.date), s.startTime, s.endTime, fmt(s.durationSeconds)]) } }] : []),
      ...(focus.length ? [{ heading: 'Fokus' }, { table: { cols: [{ h: 'Tanggal', w: 28 }, { h: 'Mode', w: 18 }, { h: 'Waktu', w: 22 }, { h: 'Durasi', w: 16, align: 'right' }, { h: 'Status', w: 18 }], rows: focus.map(f => [prettyDate(f.date), f.mode, `${f.startTime}-${f.endTime}`, Math.round(f.durationSeconds / 60) + ' mnt', f.status]) } }] : [])
    ]
  });
}
function pdfTaskList() {
  const smart = TA_SMART.find(s => s.key === taFilterStatus) || TA_SMART[0];
  const list = appState.todos.filter(t => taMatches(t, taFilterStatus));
  if (!list.length) return showToast('Tidak ada tugas di daftar ini.', false);
  makeAndShowPdf({
    title: `To-Do: ${smart.label}`, subtitle: `${list.length} tugas · ${prettyDate(wibDateStr(), true)}`, fileName: pdfName('todo-' + smart.label + '-' + wibDateStr()),
    blocks: [{ table: { cols: [{ h: 'Status', w: 17 }, { h: 'Tugas', w: 50 }, { h: 'Deadline', w: 28 }, { h: 'Prioritas', w: 15 }],
      rows: list.map(t => [t.status === 'Done' ? 'Selesai' : t.status === 'On Progress' ? 'Proses' : 'Pending', t.title + (t.desc ? '\n' + t.desc : ''), t.deadline ? prettyDate(t.deadline) + (t.time ? ' ' + t.time : '') : '-', t.priority === 'High' ? 'Tinggi' : 'Normal']) } }]
  });
}
