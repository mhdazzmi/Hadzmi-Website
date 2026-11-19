/* =========================================================
   12 · KERJA — Bukti Foto, Gudang File, penyimpanan file pribadi, panel Penyimpanan
   File disimpan di Cloudflare (Worker /api/files, wajib login). Metadata disinkronkan via Firebase.
   ========================================================= */
const FILE_MAX_BYTES = 25 * 1024 * 1024;
const PHOTO_TYPES = ['KTP', 'Buku Tabungan', 'Bukti Kas', 'Slip / Formulir', 'Lainnya'];
const fileBlobCache = new Map();   // fileId -> Blob (hanya di memori, hilang saat dikunci/reload)
const fileUrlCache = new Map();    // fileId -> objectURL

// ---------------- File API ----------------
async function getIdTokenOrThrow() {
  const u = firebaseAuth && firebaseAuth.currentUser;
  if (!u) throw new Error('Tidak terhubung. Periksa internet lalu coba lagi.');
  return u.getIdToken();
}
function apiUploadFile(blob, name, onProgress) {
  return getIdTokenOrThrow().then(token => new Promise((resolve, reject) => {
    if (blob.size > FILE_MAX_BYTES) return reject(new Error(`"${name}" lebih dari 25 MB`));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(name));
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && data.id) { fileBlobCache.set(data.id, blob); resolve(data); }
      else reject(new Error(data.error || ('Upload gagal (' + xhr.status + ')')));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat upload'));
    xhr.send(blob);
  }));
}
async function apiFetchBlob(id) {
  if (!id) throw new Error('File tidak ada');
  if (fileBlobCache.has(id)) return fileBlobCache.get(id);
  const token = await getIdTokenOrThrow();
  const res = await fetch('/api/files/' + id, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'File sudah tidak ada di server' : 'Gagal memuat file (' + res.status + ')');
  const blob = await res.blob();
  fileBlobCache.set(id, blob);
  return blob;
}
async function fileObjectUrl(id) {
  if (fileUrlCache.has(id)) return fileUrlCache.get(id);
  const url = URL.createObjectURL(await apiFetchBlob(id));
  fileUrlCache.set(id, url);
  return url;
}
async function apiDeleteFile(id) {
  if (!id) return;
  const token = await getIdTokenOrThrow();
  await fetch('/api/files/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
  fileBlobCache.delete(id);
  if (fileUrlCache.has(id)) { URL.revokeObjectURL(fileUrlCache.get(id)); fileUrlCache.delete(id); }
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function safeFileName(s) { return String(s || 'file').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file'; }

// Antrean muat thumbnail (maks 4 bersamaan)
const thumbQueue = []; let thumbActive = 0;
function queueThumb(img) {
  thumbQueue.push(img); pumpThumbs();
}
function pumpThumbs() {
  while (thumbActive < 4 && thumbQueue.length) {
    const img = thumbQueue.shift(); if (!img.isConnected) continue;
    thumbActive++;
    fileObjectUrl(img.dataset.file).then(url => { img.src = url; const l = img.parentElement && img.parentElement.querySelector('.ph-load'); if (l) l.remove(); })
      .catch(() => { const l = img.parentElement && img.parentElement.querySelector('.ph-load'); if (l) l.innerHTML = '<i class="fas fa-triangle-exclamation"></i>'; })
      .finally(() => { thumbActive--; pumpThumbs(); });
  }
}

// ---------------- Gambar: kompres ----------------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format gambar tidak didukung')); };
    img.src = url;
  });
}
function imageToJpeg(img, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return new Promise(res => c.toBlob(b => res({ blob: b, w, h }), 'image/jpeg', quality));
}

// ---------------- BUKTI FOTO ----------------
let pickedPhotos = [];
let photoPickType = 'KTP';
let photoTypeFilter = 'Semua';
let photoSelecting = false;
const selectedPhotos = new Set();

function onPhotosPicked(e) {
  const files = Array.from(e.target.files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
  e.target.value = '';
  if (!files.length) return;
  pickedPhotos.forEach(p => URL.revokeObjectURL(p.preview));
  pickedPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
  $('photoPickPreview').innerHTML = pickedPhotos.map(p => `<img src="${p.preview}" alt="">`).join('');
  $('photoLabel').value = ''; $('photoNote').value = ''; $('photoDate').value = wibDateStr();
  $('photoSaveStatus').textContent = `${files.length} foto akan dikompres & disimpan aman`;
  renderPhotoTypePick();
  openSheet('sheetPhotoSave');
  setTimeout(() => $('photoLabel').focus(), 350);
}
function renderPhotoTypePick() {
  $('photoTypePick').innerHTML = PHOTO_TYPES.map(t => `<button type="button" class="chip ${photoPickType === t ? 'active blue' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  $('photoTypePick').querySelectorAll('button').forEach(b => b.onclick = () => { photoPickType = b.dataset.t; renderPhotoTypePick(); });
}
function cancelPhotoSave() {
  if ($('photoSaveBtn').disabled) return;
  pickedPhotos.forEach(p => URL.revokeObjectURL(p.preview)); pickedPhotos = [];
  closeSheet('sheetPhotoSave');
}
async function savePickedPhotos() {
  if (!pickedPhotos.length) return;
  const btn = $('photoSaveBtn'), status = $('photoSaveStatus');
  const label = $('photoLabel').value.trim(), note = $('photoNote').value.trim(), date = $('photoDate').value || wibDateStr();
  const w = getWIBDate(); const time = `${pad2(w.getHours())}:${pad2(w.getMinutes())}`;
  btn.disabled = true; btn.innerHTML = '<span class="spinner dark" style="display:inline-block"></span>';
  let ok = 0; const errors = [];
  for (let i = 0; i < pickedPhotos.length; i++) {
    const src = pickedPhotos[i].file;
    try {
      status.textContent = `Mengompres foto ${i + 1}/${pickedPhotos.length}…`;
      const img = await loadImage(src);
      const full = await imageToJpeg(img, 2200, 0.86);
      const thumb = await imageToJpeg(img, 420, 0.72);
      const base = safeFileName(`${label || photoPickType}_${date}${pickedPhotos.length > 1 ? '_' + (i + 1) : ''}`);
      const up = await apiUploadFile(full.blob, base + '.jpg', p => { status.textContent = `Mengunggah foto ${i + 1}/${pickedPhotos.length}… ${Math.round(p * 100)}%`; });
      const upThumb = await apiUploadFile(thumb.blob, base + '_thumb.jpg');
      appState.workPhotos = appState.workPhotos || [];
      appState.workPhotos.unshift({
        id: 'ph_' + Date.now() + '_' + i, fileId: up.id, thumbId: upThumb.id, name: base + '.jpg',
        label, type: photoPickType, note, date, time, w: full.w, h: full.h,
        size: full.blob.size + thumb.blob.size, createdAt: Date.now()
      });
      ok++;
    } catch (err) { errors.push(err.message || String(err)); }
  }
  btn.disabled = false; btn.textContent = 'Simpan';
  if (ok) { saveStateToLocal(); renderPhotoGallery(); renderStoragePanel(); }
  if (errors.length) {
    status.textContent = errors[0];
    showToast(ok ? `${ok} foto tersimpan, ${errors.length} gagal: ${errors[0]}` : `Gagal: ${errors[0]}`, false);
    if (!ok) return;
  } else showToast(`${ok} foto tersimpan di ${L('work.photos')}!`);
  pickedPhotos.forEach(p => URL.revokeObjectURL(p.preview)); pickedPhotos = [];
  closeSheet('sheetPhotoSave');
}

function filteredPhotos() {
  const q = ($('photoSearch') ? $('photoSearch').value : '').toLowerCase();
  return (appState.workPhotos || []).filter(p => (photoTypeFilter === 'Semua' || p.type === photoTypeFilter) &&
    ((p.label || '') + ' ' + (p.note || '') + ' ' + p.type + ' ' + p.date).toLowerCase().includes(q));
}
function renderPhotoGallery() {
  const box = $('photoGallery'); if (!box) return;
  const all = appState.workPhotos || [];
  const chips = $('photoTypeChips');
  if (chips) {
    chips.innerHTML = ['Semua', ...PHOTO_TYPES].map(t => {
      const n = t === 'Semua' ? all.length : all.filter(p => p.type === t).length;
      return `<button class="chip ${photoTypeFilter === t ? 'active blue' : ''}" data-t="${esc(t)}">${esc(t)} <span class="muted" style="${photoTypeFilter === t ? 'color:rgba(255,255,255,.8)' : ''}">${n}</span></button>`;
    }).join('');
    chips.querySelectorAll('button').forEach(b => b.onclick = () => { photoTypeFilter = b.dataset.t; renderPhotoGallery(); });
  }
  const list = filteredPhotos();
  if (!list.length) {
    box.innerHTML = `<div class="card"><div class="empty"><i class="fas fa-camera"></i><div class="e-title">${all.length ? 'Tidak ada foto yang cocok' : 'Belum ada foto ' + esc(L('work.photos'))}</div><div class="e-sub">Foto KTP, buku tabungan, atau bukti kas nasabah dengan tombol <b>Ambil Foto</b>.</div></div></div>`;
    return;
  }
  const groups = {};
  list.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || b.createdAt - a.createdAt)
    .forEach(p => (groups[p.date] = groups[p.date] || []).push(p));
  box.className = photoSelecting ? 'selecting' : '';
  box.innerHTML = Object.keys(groups).sort().reverse().map(d => `
    <div class="photo-day"><span>${esc(relativeDayLabel(d))}</span><span class="t-foot muted" style="font-weight:500">${groups[d].length} foto</span></div>
    <div class="photo-grid">${groups[d].map(p => `
      <button class="photo-cell ${selectedPhotos.has(p.id) ? 'sel' : ''}" data-id="${esc(p.id)}" title="${esc((p.label || p.type) + ' · ' + p.type)}">
        <span class="ph-load"><span class="spinner dark"></span></span>
        <img alt="" data-file="${esc(p.thumbId || p.fileId)}">
        <span class="ph-tag">${esc(p.label || p.type)}</span>
        <span class="ph-check"><i class="fas fa-check"></i></span>
      </button>`).join('')}</div>`).join('');
  box.querySelectorAll('.photo-cell').forEach(cell => {
    cell.onclick = () => photoSelecting ? togglePhotoPick(cell.dataset.id, cell) : openPhotoViewer(cell.dataset.id);
    queueThumb(cell.querySelector('img'));
  });
}
function togglePhotoSelect() {
  photoSelecting = !photoSelecting;
  if (!photoSelecting) selectedPhotos.clear();
  $('photoSelectBtn').textContent = photoSelecting ? 'Batal' : 'Pilih';
  $('photoSelectBar').classList.toggle('hidden', !photoSelecting);
  updatePhotoSelCount(); renderPhotoGallery();
}
function exitPhotoSelect() { if (photoSelecting) togglePhotoSelect(); }
function togglePhotoPick(id, cell) {
  if (selectedPhotos.has(id)) selectedPhotos.delete(id); else {
    selectedPhotos.add(id);
    const p = (appState.workPhotos || []).find(x => x.id === id); if (p) apiFetchBlob(p.fileId).catch(() => {}); // siapkan untuk dibagikan
  }
  if (cell) cell.classList.toggle('sel', selectedPhotos.has(id));
  updatePhotoSelCount();
}
function updatePhotoSelCount() { if ($('photoSelCount')) $('photoSelCount').textContent = `${selectedPhotos.size} dipilih`; }
function selectedPhotoIds() { return Array.from(selectedPhotos); }
function photoById(id) { return (appState.workPhotos || []).find(p => p.id === id); }

async function openPhotoViewer(id) {
  const p = photoById(id); if (!p) return;
  $('viewerTitle').textContent = p.label || p.type;
  $('viewerBody').innerHTML = '<span class="spinner dark"></span>';
  $('viewerMeta').innerHTML = `${esc(p.type)} · ${esc(prettyDate(p.date, true))}${p.time ? ' · ' + esc(p.time) : ''} · ${formatBytes(p.size)}${p.note ? `<br>${esc(p.note)}` : ''}`;
  $('viewerActions').innerHTML = `
    <button class="btn btn-tinted btn-sm" onclick="sharePhotos(['${esc(p.id)}'])"><i class="fas fa-envelope"></i> Kirim</button>
    <button class="btn btn-gray btn-sm" onclick="downloadPhotos(['${esc(p.id)}'])"><i class="fas fa-download"></i> Unduh</button>
    <button class="btn btn-danger-tinted btn-sm" onclick="deletePhotos(['${esc(p.id)}'])"><i class="fas fa-trash"></i> Hapus</button>`;
  $('viewerMore').onclick = () => openActionSheet({ title: p.label || p.type, actions: [
    { text: 'Ubah Keterangan', icon: 'fas fa-pen', onClick: () => editPhotoMeta(p.id) },
    { text: 'Kirim / Bagikan', icon: 'fas fa-envelope', onClick: () => sharePhotos([p.id]) },
    { text: 'Hapus', icon: 'fas fa-trash', destructive: true, onClick: () => deletePhotos([p.id]) }
  ] });
  openSheet('sheetViewer');
  try { const url = await fileObjectUrl(p.fileId); $('viewerBody').innerHTML = `<img src="${url}" alt="">`; }
  catch (err) { $('viewerBody').innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i><div class="e-sub">${esc(err.message)}</div></div>`; }
}
function closeViewer() { closeSheet('sheetViewer'); }
async function editPhotoMeta(id) {
  const p = photoById(id); if (!p) return;
  const v = await iosAlert({ title: 'Ubah keterangan', message: 'Nama nasabah / keterangan', input: { value: p.label || '' }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (v === null) return;
  p.label = v.trim(); saveStateToLocal(); renderPhotoGallery();
  if ($('sheetViewer').classList.contains('open')) $('viewerTitle').textContent = p.label || p.type;
}

/** Bagikan foto sebagai lampiran (pilih Gmail di menu Bagikan). */
async function sharePhotos(ids) {
  const items = ids.map(photoById).filter(Boolean);
  if (!items.length) return showToast('Pilih foto dulu.', false);
  const missing = items.filter(p => !fileBlobCache.has(p.fileId));
  if (missing.length) {
    showToast('Menyiapkan foto… tap Kirim sekali lagi.');
    await Promise.all(missing.map(p => apiFetchBlob(p.fileId).catch(() => {})));
    return;
  }
  const files = items.map(p => new File([fileBlobCache.get(p.fileId)], p.name || (safeFileName(p.label || p.type) + '.jpg'), { type: 'image/jpeg' }));
  const text = items.map(p => `• ${p.type}${p.label ? ' — ' + p.label : ''} (${prettyDate(p.date)}${p.time ? ' ' + p.time : ''})`).join('\n');
  const subject = `Bukti ${items.length > 1 ? items.length + ' foto' : items[0].type}${items[0].label ? ' — ' + items[0].label : ''}`;
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: subject, text }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  // Cadangan: unduh lalu buka Gmail (lampirkan file yang terunduh secara manual)
  files.forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 400));
  setTimeout(() => openShareSheet(subject, text + '\n\n(Lampirkan foto yang baru saja terunduh)'), files.length * 400 + 300);
}
async function downloadPhotos(ids) {
  const items = ids.map(photoById).filter(Boolean); if (!items.length) return showToast('Pilih foto dulu.', false);
  showToast(`Mengunduh ${items.length} foto…`);
  for (let i = 0; i < items.length; i++) {
    try { downloadBlob(await apiFetchBlob(items[i].fileId), items[i].name || 'bukti.jpg'); await new Promise(r => setTimeout(r, 450)); }
    catch (err) { showToast(err.message, false); }
  }
}
async function deletePhotos(ids, silent) {
  const items = ids.map(photoById).filter(Boolean); if (!items.length) return;
  if (!silent && !(await iosConfirm(`Hapus ${items.length} foto?`, 'Foto akan dihapus permanen dari semua perangkat.', 'Hapus', true))) return;
  for (const p of items) { try { await apiDeleteFile(p.fileId); await apiDeleteFile(p.thumbId); } catch (e) {} }
  const del = new Set(items.map(p => p.id));
  appState.workPhotos = (appState.workPhotos || []).filter(p => !del.has(p.id));
  del.forEach(id => selectedPhotos.delete(id));
  saveStateToLocal(); updatePhotoSelCount(); renderPhotoGallery(); renderStoragePanel();
  if (!silent) { closeViewer(); showToast(`${items.length} foto dihapus.`); }
}
function setPhotoRetention(v) { writeLS('app_photo_retention', parseInt(v) || 0); showToast(+v ? `Foto lebih dari ${v} hari akan dihapus otomatis.` : 'Hapus otomatis dimatikan.'); applyPhotoRetention(); }
let retentionRunning = false;
async function applyPhotoRetention() {
  const days = readLS('app_photo_retention', 0);
  if (!days || retentionRunning || !firebaseAuth || !firebaseAuth.currentUser) return;
  const cutoff = Date.now() - days * 86400000;
  const old = (appState.workPhotos || []).filter(p => (p.createdAt || 0) < cutoff).map(p => p.id);
  if (!old.length) return;
  retentionRunning = true;
  try { await deletePhotos(old, true); showToast(`${old.length} bukti foto lama dihapus otomatis.`); } finally { retentionRunning = false; }
}

// ---------------- GUDANG FILE ----------------
let docFolderFilter = 'Semua';
function onDocsPicked(e) { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) uploadDocFiles(files); }
async function uploadDocFiles(files) {
  const big = files.filter(f => f.size > FILE_MAX_BYTES);
  if (big.length) showToast(`${big.length} file > 25 MB dilewati (${big[0].name})`, false);
  files = files.filter(f => f.size <= FILE_MAX_BYTES);
  if (!files.length) return;
  const folders = Array.from(new Set((appState.workDocs || []).map(d => d.folder).filter(Boolean)));
  const folder = await iosAlert({
    title: `Simpan ${files.length} file`, message: 'Masukkan ke folder apa?' + (folders.length ? `\nFolder yang ada: ${folders.slice(0, 6).join(', ')}` : ''),
    input: { placeholder: 'Mis. Materi BRI, SOP, Formulir', value: docFolderFilter !== 'Semua' ? docFolderFilter : (readLS('app_last_doc_folder', '') || '') },
    actions: [{ text: 'Batal', value: false }, { text: 'Upload', value: true, bold: true }]
  });
  if (folder === null) return;
  const fname = (folder || '').trim() || 'Umum';
  writeLS('app_last_doc_folder', fname);
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const up = await apiUploadFile(f, f.name, p => showToast(`Upload ${i + 1}/${files.length}: ${f.name} — ${Math.round(p * 100)}%`));
      appState.workDocs = appState.workDocs || [];
      appState.workDocs.unshift({ id: 'doc_' + Date.now() + '_' + i, fileId: up.id, name: f.name, type: f.type || '', size: f.size, folder: fname, createdAt: Date.now() });
      ok++;
    } catch (err) { showToast(`Gagal: ${err.message}`, false); }
  }
  if (ok) { saveStateToLocal(); renderDocs(); renderStoragePanel(); showToast(`${ok} file tersimpan di Gudang "${fname}"`); }
}
function docById(id) { return (appState.workDocs || []).find(d => d.id === id); }
function renderDocs() {
  const list = $('docList'); if (!list) return;
  const all = appState.workDocs || [];
  const folders = Array.from(new Set(all.map(d => d.folder || 'Umum'))).sort();
  if (docFolderFilter !== 'Semua' && !folders.includes(docFolderFilter)) docFolderFilter = 'Semua';
  const chips = $('docFolderChips');
  if (chips) {
    chips.innerHTML = ['Semua', ...folders].map(f => `<button class="chip ${docFolderFilter === f ? 'active blue' : ''}" data-f="${esc(f)}"><i class="fas ${f === 'Semua' ? 'fa-layer-group' : 'fa-folder'}"></i> ${esc(f)}</button>`).join('');
    chips.querySelectorAll('button').forEach(b => b.onclick = () => { docFolderFilter = b.dataset.f; renderDocs(); });
  }
  const q = ($('docSearch') ? $('docSearch').value : '').toLowerCase();
  const rows = all.filter(d => (docFolderFilter === 'Semua' || (d.folder || 'Umum') === docFolderFilter) && (d.name + ' ' + (d.folder || '')).toLowerCase().includes(q));
  if ($('docCountBadge')) $('docCountBadge').textContent = `${all.length} file · ${formatBytes(all.reduce((n, d) => n + (d.size || 0), 0))}`;
  if (!rows.length) { list.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><div class="e-title">${all.length ? 'Tidak ada file yang cocok' : 'Gudang masih kosong'}</div><div class="e-sub">Upload materi, SOP, PDF, gambar, atau dokumen kerja.</div></div>`; return; }
  list.innerHTML = rows.map(d => {
    const [ic, bg] = fileIconFor(d.type, d.name);
    return `<div class="row tappable" onclick="openDocViewer('${esc(d.id)}')">
      <span class="icon-tile ${bg}"><i class="fas ${ic}"></i></span>
      <div class="flex-1"><div class="row-title truncate">${esc(d.name)}</div><div class="row-sub truncate"><i class="fas fa-folder" style="font-size:10px"></i> ${esc(d.folder || 'Umum')} · ${formatBytes(d.size)} · ${esc(new Date(d.createdAt).toLocaleDateString('id-ID'))}</div></div>
      <button class="icon-btn sm clear" style="color:var(--label2)" onclick="event.stopPropagation(); openDocActions('${esc(d.id)}')"><i class="fas fa-ellipsis"></i></button>
    </div>`;
  }).join('');
}
function isTextDoc(d) { return /^text\/|json|csv|xml/.test(d.type || '') || /\.(txt|md|csv|json|log)$/i.test(d.name); }
async function openDocViewer(id) {
  const d = docById(id); if (!d) return;
  $('viewerTitle').textContent = d.name;
  $('viewerMeta').textContent = `${d.folder || 'Umum'} · ${formatBytes(d.size)} · ${new Date(d.createdAt).toLocaleString('id-ID')}`;
  $('viewerBody').innerHTML = '<span class="spinner dark"></span>';
  $('viewerActions').innerHTML = `
    <button class="btn btn-tinted btn-sm" onclick="openDocInTab('${esc(d.id)}')"><i class="fas fa-up-right-from-square"></i> Buka</button>
    <button class="btn btn-gray btn-sm" onclick="downloadDoc('${esc(d.id)}')"><i class="fas fa-download"></i> Unduh</button>
    <button class="btn btn-gray btn-sm" onclick="shareDoc('${esc(d.id)}')"><i class="fas fa-envelope"></i> Kirim</button>`;
  $('viewerMore').onclick = () => openDocActions(d.id);
  openSheet('sheetViewer');
  try {
    const blob = await apiFetchBlob(d.fileId);
    const url = await fileObjectUrl(d.fileId);
    if (/^image\//.test(d.type)) $('viewerBody').innerHTML = `<img src="${url}" alt="">`;
    else if (/pdf/.test(d.type) || /\.pdf$/i.test(d.name)) $('viewerBody').innerHTML = `<iframe src="${url}" title="${esc(d.name)}"></iframe>`;
    else if (isTextDoc(d)) { const t = await blob.text(); $('viewerBody').innerHTML = `<pre>${esc(t.slice(0, 200000))}</pre>`; }
    else $('viewerBody').innerHTML = `<div class="empty"><i class="fas ${fileIconFor(d.type, d.name)[0]}"></i><div class="e-sub">Pratinjau tidak tersedia untuk jenis file ini.<br>Tap <b>Buka</b> atau <b>Unduh</b>.</div></div>`;
  } catch (err) { $('viewerBody').innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i><div class="e-sub">${esc(err.message)}</div></div>`; }
}
async function openDocInTab(id) {
  const d = docById(id); if (!d) return;
  const w = window.open('', '_blank');
  try { const url = await fileObjectUrl(d.fileId); if (w) w.location.href = url; else location.assign(url); }
  catch (err) { if (w) w.close(); showToast(err.message, false); }
}
async function downloadDoc(id) { const d = docById(id); if (!d) return; try { downloadBlob(await apiFetchBlob(d.fileId), d.name); } catch (err) { showToast(err.message, false); } }
async function shareDoc(id) {
  const d = docById(id); if (!d) return;
  if (!fileBlobCache.has(d.fileId)) { showToast('Menyiapkan file… tap Kirim sekali lagi.'); apiFetchBlob(d.fileId).catch(() => {}); return; }
  const file = new File([fileBlobCache.get(d.fileId)], d.name, { type: d.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: d.name }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  downloadBlob(file, d.name);
  setTimeout(() => openShareSheet(`[File] ${d.name}`, `File: ${d.name}\nFolder: ${d.folder || 'Umum'}\n\n(Lampirkan file yang baru saja terunduh)`), 500);
}
function openDocActions(id) {
  const d = docById(id); if (!d) return;
  openActionSheet({ title: d.name, message: `${d.folder || 'Umum'} · ${formatBytes(d.size)}`, actions: [
    { text: 'Buka', icon: 'fas fa-up-right-from-square', onClick: () => openDocInTab(id) },
    { text: 'Unduh', icon: 'fas fa-download', onClick: () => downloadDoc(id) },
    { text: 'Kirim / Bagikan', icon: 'fas fa-envelope', onClick: () => shareDoc(id) },
    { text: 'Ganti Nama', icon: 'fas fa-pen', onClick: () => renameDoc(id) },
    { text: 'Pindah Folder', icon: 'fas fa-folder', onClick: () => moveDoc(id) },
    { text: 'Hapus', icon: 'fas fa-trash', destructive: true, onClick: () => deleteDoc(id) }
  ] });
}
async function renameDoc(id) {
  const d = docById(id); if (!d) return;
  const v = await iosAlert({ title: 'Ganti nama', input: { value: d.name }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (v === null || !v.trim()) return;
  d.name = v.trim(); saveStateToLocal(); renderDocs(); if ($('sheetViewer').classList.contains('open')) $('viewerTitle').textContent = d.name;
}
async function moveDoc(id) {
  const d = docById(id); if (!d) return;
  const v = await iosAlert({ title: 'Pindah ke folder', input: { value: d.folder || '' , placeholder: 'Nama folder' }, actions: [{ text: 'Batal', value: false }, { text: 'Pindah', value: true, bold: true }] });
  if (v === null) return;
  d.folder = v.trim() || 'Umum'; saveStateToLocal(); renderDocs(); showToast(`Dipindah ke "${d.folder}"`);
}
async function deleteDoc(id) {
  const d = docById(id); if (!d) return;
  if (!(await iosConfirm('Hapus file?', d.name, 'Hapus', true))) return;
  try { await apiDeleteFile(d.fileId); } catch (e) {}
  appState.workDocs = (appState.workDocs || []).filter(x => x.id !== id);
  saveStateToLocal(); renderDocs(); renderStoragePanel(); closeViewer(); showToast('File dihapus.');
}

// ---------------- PANEL PENYIMPANAN ----------------
const GB = 1024 * 1024 * 1024;
function jsonBytes(v) { try { return new Blob([JSON.stringify(v == null ? null : v)]).size; } catch (e) { return 0; } }
function storageBar(parts, total) {
  return `<div class="store-bar">${parts.filter(p => p.bytes > 0).map(p => `<span title="${esc(p.label)}" style="background:${p.color}; width:${Math.max(0.6, (p.bytes / total) * 100)}%"></span>`).join('')}</div>
    <div class="store-legend">${parts.filter(p => p.bytes > 0).map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)} ${formatBytes(p.bytes)}</span>`).join('')}</div>`;
}
let deviceEstimate = null;
function renderStoragePanel() {
  const box = $('storagePanel'); if (!box) return;
  const s = appState;
  const fb = [
    { label: 'Musik', bytes: jsonBytes(s.musicLibrary) + jsonBytes(s.musicCategories), color: '#FF2D55' },
    { label: 'To-Do', bytes: jsonBytes(s.todos), color: '#007AFF' },
    { label: 'Catatan', bytes: jsonBytes(s.notes) + jsonBytes(s.workNotes), color: '#FFCC00' },
    { label: 'Selisih Kas', bytes: jsonBytes(s.kas), color: '#00C7BE' },
    { label: 'Focus', bytes: jsonBytes(s.focusHistory), color: '#5856D6' },
    { label: 'Lainnya', bytes: jsonBytes(s.countdowns) + jsonBytes(s.links) + jsonBytes(s.contacts) + jsonBytes(s.uploads) + jsonBytes(s.customWebLinks) + jsonBytes(s.workPhotos) + jsonBytes(s.workDocs), color: '#8E8E93' }
  ];
  const fbTotal = fb.reduce((n, p) => n + p.bytes, 0);
  const photos = s.workPhotos || [], docs = s.workDocs || [];
  const cf = [
    { label: `${L('work.photos')} (${photos.length})`, bytes: photos.reduce((n, p) => n + (p.size || 0), 0), color: '#FF9500' },
    { label: `${L('work.docs')} (${docs.length})`, bytes: docs.reduce((n, d) => n + (d.size || 0), 0), color: '#5E5CE6' }
  ];
  const cfTotal = cf.reduce((n, p) => n + p.bytes, 0);
  const pct = b => ((b / GB) * 100).toFixed(b / GB < 0.01 ? 3 : 1);
  box.innerHTML = `
    <div>
      <div class="flex justify-between items-end"><div><div class="t-foot muted semibold">FIREBASE · DATA APLIKASI</div><div class="store-big">${formatBytes(fbTotal)} <span class="t-foot muted" style="font-weight:500">dari 1 GB</span></div></div><span class="badge tint-green">sisa ${formatBytes(GB - fbTotal)}</span></div>
      <div class="mt-8">${storageBar(fb, Math.max(fbTotal, 1))}</div>
      <div class="t-cap muted mt-4">Terpakai ${pct(fbTotal)}% · batas unduhan 10 GB/bulan</div>
    </div>
    <div class="divider"></div>
    <div>
      <div class="flex justify-between items-end"><div><div class="t-foot muted semibold">CLOUDFLARE · FOTO & FILE KERJA</div><div class="store-big">${formatBytes(cfTotal)} <span class="t-foot muted" style="font-weight:500">dari 1 GB</span></div></div><span class="badge tint-green">sisa ${formatBytes(GB - cfTotal)}</span></div>
      <div class="mt-8">${cfTotal ? storageBar(cf, cfTotal) : '<div class="store-bar"></div>'}</div>
      <div class="t-cap muted mt-4">Terpakai ${pct(cfTotal)}% · maks 25 MB per file</div>
    </div>
    <div class="divider"></div>
    <div class="flex justify-between items-center"><div><div class="t-foot muted semibold">PERANGKAT INI (CACHE)</div><div class="t-sub" id="deviceStorageText">${deviceEstimate ? `${formatBytes(deviceEstimate.usage)} dipakai` : 'Menghitung…'}</div></div>
      <a class="btn btn-gray btn-xs" href="https://console.firebase.google.com/project/web-hadzmi-new/database" target="_blank" rel="noopener">Firebase Console</a></div>`;
  if (!deviceEstimate && navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(e => { deviceEstimate = e; const t = $('deviceStorageText'); if (t) t.textContent = `${formatBytes(e.usage)} dipakai`; }).catch(() => {});
  }
}
