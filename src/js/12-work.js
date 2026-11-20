/* =========================================================
   12 · KERJA — Bukti Foto, Gudang File, penyimpanan file pribadi, panel Penyimpanan
   File disimpan di Cloudflare (Worker /api/files, wajib login). Metadata disinkronkan via Firebase.
   ========================================================= */
const FILE_MAX_BYTES = 25 * 1024 * 1024;
const PHOTO_TYPES = ['KTP', 'Buku Tabungan', 'Bukti Transaksi', 'Slip / Formulir', 'Lainnya'];
/** Sekali saja: kategori lama "Bukti Kas" → "Bukti Transaksi". */
function migratePhotoTypes() {
  const old = (appState.workPhotos || []).filter(p => p.type === 'Bukti Kas');
  if (!old.length) return;
  old.forEach(p => { p.type = 'Bukti Transaksi'; });
  saveStateToLocal();
}
const fileBlobCache = new Map();   // fileId -> Blob (hanya di memori, hilang saat dikunci/reload)
const fileUrlCache = new Map();    // fileId -> objectURL

// ---------------- File API (R2 / Google Drive / KV) ----------------
const STORE_NAMES = { r2: 'Cloudflare R2', drive: 'Google Drive', kv: 'Cloudflare KV' };
function storeStatus() { return (pushConfig && pushConfig.stores) || { r2: false, drive: false, kv: !!pushConfig }; }
function getDefaultStore() {
  const st = storeStatus(); const pref = readLS('app_default_store', 'auto');
  if (pref !== 'auto' && st[pref]) return pref;
  return st.r2 ? 'r2' : st.drive && pref === 'drive' ? 'drive' : 'kv';
}
function setDefaultStore(v) { writeLS('app_default_store', v); showToast(v === 'auto' ? 'Otomatis: R2 jika aktif' : 'File baru disimpan ke ' + STORE_NAMES[v]); fillStoreSelects(); }
function fillStoreSelects() {
  const st = storeStatus(), def = getDefaultStore(), pref = readLS('app_default_store', 'auto');
  const opts = ['r2', 'drive', 'kv'].map(k => `<option value="${k}" ${st[k] ? '' : 'disabled'}>${STORE_NAMES[k]}${st[k] ? '' : ' (belum aktif)'}</option>`).join('');
  document.querySelectorAll('select.store-select').forEach(sel => {
    if (sel.id === 'defaultStoreSelect') { sel.innerHTML = `<option value="auto">Otomatis</option>` + opts; sel.value = pref; }
    else { sel.innerHTML = opts; sel.value = def; }
  });
  const r = $('storeStatusR2'), d = $('storeStatusDrive');
  if (r) r.innerHTML = st.r2 ? '<span class="c-green">● Aktif</span> · tap untuk panduan' : 'Belum aktif · tap untuk langkah-langkah';
  if (d) d.innerHTML = st.drive ? '<span class="c-green">● Tersambung</span> · tap untuk panduan' : 'Belum tersambung · tap untuk langkah-langkah';
}
async function getIdTokenOrThrow() {
  const u = firebaseAuth && firebaseAuth.currentUser;
  if (!u) throw new Error('Tidak terhubung. Periksa internet lalu coba lagi.');
  return u.getIdToken();
}
function apiUploadFile(blob, name, onProgress, store) {
  store = store || getDefaultStore();
  const max = store === 'r2' ? 300 * 1048576 : store === 'drive' ? 30 * 1048576 : FILE_MAX_BYTES;
  return getIdTokenOrThrow().then(token => new Promise((resolve, reject) => {
    if (blob.size > max) return reject(new Error(`"${name}" terlalu besar untuk ${STORE_NAMES[store]} (maks ${formatBytes(max)})`));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files?store=' + store);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(name));
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && data.id) { fileBlobCache.set(data.id, blob); usageCache = null; resolve(data); }
      else reject(new Error(data.error || ('Upload gagal (' + xhr.status + ')')));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat upload'));
    xhr.send(blob);
  }));
}
// Link privat bertanda tangan (berlaku 7 hari) — bisa di-cache browser, dipakai untuk lagu, cover & galeri
const SIGNED_KEY = 'app_signed_urls';
let signedMap = readLS(SIGNED_KEY, {});
let signPending = new Set(), signTimer = null, signWaiters = [];
function signedUrlSync(id) {
  const e = signedMap[id];
  return e && e.exp * 1000 - Date.now() > 86400000 ? e.u : null;
}
function signIds(ids) {
  ids = (ids || []).filter(id => id && !signedUrlSync(id));
  if (!ids.length) return Promise.resolve();
  ids.forEach(id => signPending.add(id));
  return new Promise(resolve => {
    signWaiters.push(resolve);
    clearTimeout(signTimer);
    signTimer = setTimeout(async () => {
      const batch = Array.from(signPending); signPending = new Set();
      const waiters = signWaiters; signWaiters = [];
      try {
        for (let i = 0; i < batch.length; i += 400) {
          const r = await authFetch('/sign', { method: 'POST', body: JSON.stringify({ ids: batch.slice(i, i + 400), days: 7 }) });
          Object.keys(r.urls || {}).forEach(id => { signedMap[id] = { u: r.urls[id], exp: r.exp }; });
        }
        const now = Date.now() / 1000; Object.keys(signedMap).forEach(k => { if (signedMap[k].exp < now) delete signedMap[k]; });
        writeLS(SIGNED_KEY, signedMap);
      } catch (e) { console.warn('sign failed', e); }
      waiters.forEach(w => w());
    }, 60);
  });
}
async function signedUrl(id) { await signIds([id]); return signedUrlSync(id); }
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
  migratePhotoTypes();
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
  const sorted = list.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || b.createdAt - a.createdAt);
  box.className = photoSelecting ? 'selecting' : '';
  box.innerHTML = `<div class="photo-day"><span>${sorted.length} foto</span><span class="t-foot muted" style="font-weight:500">terbaru di atas</span></div>
    <div class="photo-grid">${sorted.map(p => `
      <button class="photo-cell ${selectedPhotos.has(p.id) ? 'sel' : ''}" data-id="${esc(p.id)}" title="${esc((p.label || p.type) + ' · ' + p.type + ' · ' + prettyDate(p.date))}">
        <span class="ph-load"><span class="spinner dark"></span></span>
        <img alt="" data-file="${esc(p.thumbId || p.fileId)}">
        <span class="ph-tag">${esc(p.label || p.type)}</span>
        <span class="ph-check"><i class="fas fa-check"></i></span>
      </button>`).join('')}</div>`;
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
    <button class="btn btn-tinted btn-sm" onclick="sharePhotos(['${esc(p.id)}'])"><i class="fas fa-arrow-up-from-bracket"></i> Bagikan</button>
    <button class="btn btn-gray btn-sm" onclick="downloadPhotos(['${esc(p.id)}'])"><i class="fas fa-download"></i> Unduh</button>
    <button class="btn btn-danger-tinted btn-sm" onclick="deletePhotos(['${esc(p.id)}'])"><i class="fas fa-trash"></i> Hapus</button>`;
  $('viewerMore').onclick = () => openActionSheet({ title: p.label || p.type, actions: [
    { text: 'Ubah Keterangan', icon: 'fas fa-pen', onClick: () => editPhotoMeta(p.id) },
    { text: 'Bagikan', icon: 'fas fa-arrow-up-from-bracket', onClick: () => sharePhotos([p.id]) },
    { text: 'Hapus', icon: 'fas fa-trash', destructive: true, onClick: () => deletePhotos([p.id]) }
  ] });
  openSheet('sheetViewer');
  try { const url = await fileObjectUrl(p.fileId); $('viewerBody').innerHTML = `<img src="${url}" alt="">`; }
  catch (err) { $('viewerBody').innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i><div class="e-sub">${esc(err.message)}</div></div>`; }
}
function closeViewer() { closeSheet('sheetViewer'); setViewerFullscreen(false); }

// ---------- Viewer: layar penuh + zoom (cubit, ketuk 2×, tombol −/+) ----------
let viewerZoom = 1;
const VIEWER_ZOOMS = [1, 1.5, 2, 3, 4];
function setViewerFullscreen(on) {
  const bd = $('sheetViewer'); if (!bd) return;
  bd.classList.toggle('fs', on);
  const i = $('viewerFsBtn') && $('viewerFsBtn').querySelector('i'); if (i) i.className = on ? 'fas fa-compress' : 'fas fa-expand';
}
function toggleViewerFullscreen() { setViewerFullscreen(!$('sheetViewer').classList.contains('fs')); }
function viewerZoomTarget() { const b = $('viewerBody'); return b.querySelector(':scope > img') || (b.querySelector('canvas') ? b : null); }
function setViewerZoom(z, anchor) {
  const body = $('viewerBody'), tgt = viewerZoomTarget(); if (!tgt) return;
  const old = viewerZoom; viewerZoom = Math.max(1, Math.min(4, z));
  const fx = anchor ? (body.scrollLeft + anchor.x) / Math.max(1, body.scrollWidth) : 0.5;
  const fy = anchor ? (body.scrollTop + anchor.y) / Math.max(1, body.scrollHeight) : (body.scrollTop + body.clientHeight / 2) / Math.max(1, body.scrollHeight);
  body.classList.toggle('zoomed', viewerZoom > 1);
  if (tgt.tagName === 'IMG') {
    if (viewerZoom > 1) { tgt.style.width = (body.clientWidth * viewerZoom) + 'px'; tgt.style.maxWidth = 'none'; tgt.style.maxHeight = 'none'; }
    else { tgt.style.width = ''; tgt.style.maxWidth = ''; tgt.style.maxHeight = ''; }
  } else body.querySelectorAll('canvas').forEach(c => { c.style.width = (viewerZoom * 100) + '%'; c.style.maxWidth = viewerZoom > 1 ? 'none' : ''; });
  if (old !== viewerZoom) {
    body.scrollLeft = fx * body.scrollWidth - (anchor ? anchor.x : body.clientWidth / 2);
    body.scrollTop = fy * body.scrollHeight - (anchor ? anchor.y : body.clientHeight / 2);
  }
  if ($('viewerZoomVal')) $('viewerZoomVal').textContent = Math.round(viewerZoom * 100) + '%';
}
function stepViewerZoom(dir) {
  const i = VIEWER_ZOOMS.findIndex(z => z >= viewerZoom - 0.01);
  const next = dir > 0 ? VIEWER_ZOOMS.find(z => z > viewerZoom + 0.01) : [...VIEWER_ZOOMS].reverse().find(z => z < viewerZoom - 0.01);
  setViewerZoom(next || (dir > 0 ? 4 : 1));
}
function initViewerZoom() {
  const body = $('viewerBody'); if (!body || body.dataset.zoomInit) return; body.dataset.zoomInit = '1';
  // Konten baru → reset zoom & tampilkan kontrol hanya untuk gambar / PDF
  let lastFirst = null;
  new MutationObserver(() => {
    const first = body.firstElementChild;
    if (first && first === lastFirst) { // halaman PDF berikutnya selesai dirender → ikut zoom saat ini
      body.querySelectorAll('canvas').forEach(c => { c.style.width = (viewerZoom * 100) + '%'; c.style.maxWidth = viewerZoom > 1 ? 'none' : ''; });
      $('viewerZoom').classList.toggle('hidden', !viewerZoomTarget()); return;
    }
    lastFirst = first;
    viewerZoom = 1; body.classList.remove('zoomed');
    if ($('viewerZoomVal')) $('viewerZoomVal').textContent = '100%';
    $('viewerZoom').classList.toggle('hidden', !viewerZoomTarget());
  }).observe(body, { childList: true });
  let pinch = null, lastTap = 0;
  const pt = (t) => { const r = body.getBoundingClientRect(); return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top }; };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  body.addEventListener('touchstart', e => {
    if (!viewerZoomTarget()) return;
    if (e.touches.length === 2) { pinch = { d: dist(e.touches), z: viewerZoom }; e.preventDefault(); }
    else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap < 300) { const r = body.getBoundingClientRect(); setViewerZoom(viewerZoom > 1 ? 1 : 2.5, { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }); e.preventDefault(); lastTap = 0; }
      else lastTap = now;
    }
  }, { passive: false });
  body.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault(); setViewerZoom(pinch.z * dist(e.touches) / pinch.d, pt(e.touches));
  }, { passive: false });
  body.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
  body.addEventListener('dblclick', e => { const r = body.getBoundingClientRect(); setViewerZoom(viewerZoom > 1 ? 1 : 2.5, { x: e.clientX - r.left, y: e.clientY - r.top }); });
  body.addEventListener('wheel', e => { if (!e.ctrlKey || !viewerZoomTarget()) return; e.preventDefault(); const r = body.getBoundingClientRect(); setViewerZoom(viewerZoom * (e.deltaY < 0 ? 1.1 : 0.9), { x: e.clientX - r.left, y: e.clientY - r.top }); }, { passive: false });
}
async function editPhotoMeta(id) {
  const p = photoById(id); if (!p) return;
  const v = await iosAlert({ title: 'Ubah keterangan', message: 'Nama nasabah / keterangan', input: { value: p.label || '' }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (v === null) return;
  p.label = v.trim(); saveStateToLocal(); renderPhotoGallery();
  if ($('sheetViewer').classList.contains('open')) $('viewerTitle').textContent = p.label || p.type;
}

/** Bagikan foto sebagai lampiran (pilih WhatsApp / Gmail / Files di menu Bagikan). */
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
  // Cadangan: perangkat tidak mendukung bagikan file → unduh
  files.forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 400));
  showToast('Perangkat tidak mendukung bagikan file — foto diunduh.');
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
let pendingDocs = [];
function docFolders() {
  const map = {};
  (appState.workDocs || []).forEach(d => { const f = (d.folder || 'Umum').trim(); map[f.toLowerCase()] = map[f.toLowerCase()] || { name: f, n: 0 }; map[f.toLowerCase()].n++; });
  return Object.values(map).sort((a, b) => b.n - a.n);
}
// Nama kategori sama (abaikan huruf besar/kecil & spasi) → masuk kelompok yang sama
function canonicalFolder(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Umum';
  const hit = docFolders().find(f => f.name.toLowerCase() === clean.toLowerCase());
  return hit ? hit.name : clean;
}
// Tebak kategori dari nama file (mis. "SOP Teller 2025.pdf" → kategori "SOP")
function guessFolderFor(fileNames) {
  const words = fileNames.join(' ').toLowerCase().replace(/[_\-.()]+/g, ' ');
  return docFolders().find(f => f.name.toLowerCase().split(/\s+/).every(w => w.length > 1 && words.includes(w)));
}
function onDocsPicked(e) { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) uploadDocFiles(files); }
function uploadDocFiles(files) {
  if (!pushConfig) return showToast('Penyimpanan cloud belum terhubung (cek internet).', false);
  pendingDocs = files;
  $('docUploadTitle').textContent = files.length > 1 ? `Upload ${files.length} File` : 'Upload File';
  $('docUploadList').innerHTML = files.map(f => { const [ic, bg] = fileIconFor(f.type, f.name); return `<div class="row"><span class="icon-tile ${bg}"><i class="fas ${ic}"></i></span><div class="flex-1"><div class="row-title truncate">${esc(f.name)}</div><div class="row-sub">${formatBytes(f.size)}</div></div></div>`; }).join('');
  const guess = guessFolderFor(files.map(f => f.name));
  $('docFolderInput').value = docFolderFilter !== 'Semua' ? docFolderFilter : guess ? guess.name : (readLS('app_last_doc_folder', '') || '');
  $('docFolderList').innerHTML = docFolders().map(f => `<option value="${esc(f.name)}">`).join('');
  $('docUploadProgress').classList.add('hidden');
  fillStoreSelects();
  renderDocFolderSuggest();
  openSheet('sheetDocUpload');
}
function renderDocFolderSuggest() {
  const q = $('docFolderInput').value.trim().toLowerCase();
  const list = docFolders().filter(f => !q || f.name.toLowerCase().includes(q)).slice(0, 8);
  $('docFolderSuggest').innerHTML = list.map(f => `<button type="button" class="chip ${f.name.toLowerCase() === q ? 'active blue' : ''}" data-f="${esc(f.name)}"><i class="fas fa-folder"></i> ${esc(f.name)} <span class="muted">${f.n}</span></button>`).join('');
  $('docFolderSuggest').querySelectorAll('button').forEach(b => b.onclick = () => { $('docFolderInput').value = b.dataset.f; renderDocFolderSuggest(); });
  const exists = q && docFolders().some(f => f.name.toLowerCase() === q);
  $('docFolderHint').textContent = !q ? 'Pilih kategori yang ada atau ketik nama baru.' : exists ? `✓ Masuk ke kategori yang sudah ada: "${canonicalFolder(q)}"` : `Kategori baru "${$('docFolderInput').value.trim()}" akan dibuat.`;
}
function cancelDocUpload() { if ($('docUploadBtn').disabled) return; pendingDocs = []; closeSheet('sheetDocUpload'); }
async function saveDocUpload() {
  const files = pendingDocs; if (!files.length) return;
  const folder = canonicalFolder($('docFolderInput').value);
  const store = $('docStoreSelect').value || getDefaultStore();
  writeLS('app_last_doc_folder', folder);
  const btn = $('docUploadBtn'), bar = $('docUploadProgress'), fill = bar.firstElementChild;
  btn.disabled = true; btn.innerHTML = '<span class="spinner dark" style="display:inline-block"></span>'; bar.classList.remove('hidden');
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const up = await apiUploadFile(f, f.name, p => { fill.style.width = Math.round(((i + p) / files.length) * 100) + '%'; }, store);
      appState.workDocs = appState.workDocs || [];
      appState.workDocs.unshift({ id: 'doc_' + Date.now() + '_' + i, fileId: up.id, name: f.name, type: f.type || '', size: f.size, folder, createdAt: Date.now() });
      ok++;
    } catch (err) { showToast(`Gagal: ${err.message}`, false); }
  }
  btn.disabled = false; btn.textContent = 'Upload';
  if (ok) { saveStateToLocal(); docFolderFilter = folder; renderDocs(); renderStoragePanel(); showToast(`${ok} file tersimpan di "${folder}" (${STORE_NAMES[store]})`); }
  if (ok === files.length) { pendingDocs = []; closeSheet('sheetDocUpload'); }
}
function docById(id) { return (appState.workDocs || []).find(d => d.id === id); }
function renderDocs() {
  const list = $('docList'); if (!list) return;
  const all = appState.workDocs || [];
  const folders = docFolders().map(f => f.name);
  if (docFolderFilter !== 'Semua' && !folders.some(f => f.toLowerCase() === docFolderFilter.toLowerCase())) docFolderFilter = 'Semua';
  const chips = $('docFolderChips');
  if (chips) {
    chips.innerHTML = ['Semua', ...folders].map(f => `<button class="chip ${docFolderFilter === f ? 'active blue' : ''}" data-f="${esc(f)}"><i class="fas ${f === 'Semua' ? 'fa-layer-group' : 'fa-folder'}"></i> ${esc(f)}</button>`).join('');
    chips.querySelectorAll('button').forEach(b => b.onclick = () => { docFolderFilter = b.dataset.f; renderDocs(); });
  }
  const q = ($('docSearch') ? $('docSearch').value : '').toLowerCase();
  const rows = all.filter(d => (docFolderFilter === 'Semua' || (d.folder || 'Umum').toLowerCase() === docFolderFilter.toLowerCase()) && (d.name + ' ' + (d.folder || '')).toLowerCase().includes(q));
  if ($('docCountBadge')) $('docCountBadge').textContent = `${all.length} file · ${formatBytes(all.reduce((n, d) => n + (d.size || 0), 0))}`;
  if (!rows.length) { list.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><div class="e-title">${all.length ? 'Tidak ada file yang cocok' : 'Gudang masih kosong'}</div><div class="e-sub">Upload materi, SOP, PDF, gambar, atau dokumen kerja.</div></div>`; return; }
  list.innerHTML = rows.map(d => {
    const [ic, bg] = fileIconFor(d.type, d.name);
    return `<div class="row tappable" onclick="openDocViewer('${esc(d.id)}')">
      <span class="icon-tile ${bg}"><i class="fas ${ic}"></i></span>
      <div class="flex-1"><div class="row-title truncate">${esc(d.name)}</div><div class="row-sub truncate"><i class="fas fa-folder" style="font-size:10px"></i> ${esc(d.folder || 'Umum')} · ${formatBytes(d.size)} · ${esc(new Date(d.createdAt).toLocaleDateString('id-ID'))}</div></div>
      <button class="icon-btn sm green" onclick="event.stopPropagation(); shareDoc('${esc(d.id)}')" title="Share ke WhatsApp"><i class="fab fa-whatsapp"></i></button>
      <button class="icon-btn sm clear" style="color:var(--label2)" onclick="event.stopPropagation(); openDocActions('${esc(d.id)}')"><i class="fas fa-ellipsis"></i></button>
    </div>`;
  }).join('');
}
function isTextDoc(d) { return /^text\/|json|csv|xml/.test(d.type || '') || /\.(txt|md|csv|json|log)$/i.test(d.name); }
async function openDocViewer(id) {
  const d = docById(id); if (!d) return;
  $('viewerTitle').textContent = d.name;
  $('viewerMeta').textContent = `${d.folder || 'Umum'} · ${formatBytes(d.size)} · ${new Date(d.createdAt).toLocaleString('id-ID')}`;
  $('viewerBody').classList.remove('pdf-pages');
  $('viewerBody').innerHTML = '<span class="spinner dark"></span>';
  $('viewerActions').innerHTML = `
    <button class="btn btn-green btn-sm" onclick="shareDoc('${esc(d.id)}')"><i class="fab fa-whatsapp"></i> WhatsApp</button>
    <button class="btn btn-tinted btn-sm" onclick="shareDoc('${esc(d.id)}')"><i class="fas fa-arrow-up-from-bracket"></i> Bagikan</button>
    <button class="btn btn-gray btn-sm" onclick="downloadDoc('${esc(d.id)}')"><i class="fas fa-download"></i> Unduh</button>`;
  $('viewerMore').onclick = () => openDocActions(d.id);
  openSheet('sheetViewer');
  try {
    const blob = await apiFetchBlob(d.fileId);
    if (/^image\//.test(d.type)) $('viewerBody').innerHTML = `<img src="${await fileObjectUrl(d.fileId)}" alt="">`;
    else if (/pdf/.test(d.type) || /\.pdf$/i.test(d.name)) await renderPdfInto($('viewerBody'), blob);
    else if (/^audio\//.test(d.type)) $('viewerBody').innerHTML = `<audio controls src="${await fileObjectUrl(d.fileId)}" style="width:90%"></audio>`;
    else if (/^video\//.test(d.type)) $('viewerBody').innerHTML = `<video controls playsinline src="${await fileObjectUrl(d.fileId)}" style="max-width:100%; max-height:70vh"></video>`;
    else if (isTextDoc(d)) { const t = await blob.text(); $('viewerBody').innerHTML = `<pre>${esc(t.slice(0, 200000))}</pre>`; }
    else $('viewerBody').innerHTML = `<div class="empty"><i class="fas ${fileIconFor(d.type, d.name)[0]}"></i><div class="e-sub">Pratinjau belum tersedia untuk jenis file ini (mis. Word/Excel).<br>Tap <b>Bagikan</b> → buka di aplikasi lain, atau <b>Unduh</b>.</div></div>`;
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
  if (!fileBlobCache.has(d.fileId)) { showToast('Menyiapkan file… tap sekali lagi untuk membagikan.'); apiFetchBlob(d.fileId).catch(err => showToast(err.message, false)); return; }
  shareBlobFile(fileBlobCache.get(d.fileId), d.name, d.type);
}
function openDocActions(id) {
  const d = docById(id); if (!d) return;
  openActionSheet({ title: d.name, message: `${d.folder || 'Umum'} · ${formatBytes(d.size)}`, actions: [
    { text: 'Lihat', icon: 'fas fa-eye', onClick: () => openDocViewer(id) },
    { text: 'Share ke WhatsApp', icon: 'fab fa-whatsapp', onClick: () => shareDoc(id) },
    { text: 'Unduh', icon: 'fas fa-download', onClick: () => downloadDoc(id) },
    { text: 'Buka di Tab Baru', icon: 'fas fa-up-right-from-square', onClick: () => openDocInTab(id) },
    { text: 'Ganti Nama', icon: 'fas fa-pen', onClick: () => renameDoc(id) },
    { text: 'Pindah Kategori', icon: 'fas fa-folder', onClick: () => moveDoc(id) },
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
  const v = await iosAlert({ title: 'Pindah ke kategori', message: docFolders().length ? 'Kategori: ' + docFolders().map(f => f.name).slice(0, 6).join(', ') : '', input: { value: d.folder || '', placeholder: 'Nama kategori' }, actions: [{ text: 'Batal', value: false }, { text: 'Pindah', value: true, bold: true }] });
  if (v === null) return;
  d.folder = canonicalFolder(v); saveStateToLocal(); renderDocs(); showToast(`Dipindah ke "${d.folder}"`);
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
let deviceEstimate = null, usageCache = null, usageLoading = false;
async function refreshStorageUsage(recount) {
  if (usageLoading || !firebaseAuth || !firebaseAuth.currentUser || !pushConfig) return;
  usageLoading = true;
  try { usageCache = await authFetch('/storage-usage' + (recount ? '?recount=1' : '')); if (recount) showToast('Pemakaian dihitung ulang.'); }
  catch (e) { usageCache = { error: e.message }; }
  usageLoading = false; deviceEstimate = null; renderStoragePanel(true);
}
function usageBlock(title, used, limit, parts, foot) {
  const pct = limit ? (used / limit) * 100 : 0;
  return `<div>
    <div class="flex justify-between items-end"><div><div class="t-foot muted semibold">${title}</div><div class="store-big">${formatBytes(used)} <span class="t-foot muted" style="font-weight:500">dari ${formatBytes(limit)}</span></div></div><span class="badge ${pct > 85 ? 'tint-red' : 'tint-green'}">sisa ${formatBytes(Math.max(0, limit - used))}</span></div>
    <div class="mt-8">${parts && used ? storageBar(parts, used) : `<div class="store-bar"><span style="background:var(--blue); width:${Math.min(100, pct)}%"></span></div>`}</div>
    <div class="t-cap muted mt-4">Terpakai ${pct.toFixed(pct < 1 ? 3 : 1)}%${foot ? ' · ' + foot : ''}</div></div>`;
}
function renderStoragePanel(fromRefresh) {
  const box = $('storagePanel'); if (!box) return;
  if (!fromRefresh && !usageCache && pushConfig) refreshStorageUsage(false);
  fillStoreSelects();
  const s = appState;
  const fb = [
    { label: 'Musik', bytes: jsonBytes(s.musicLibrary) + jsonBytes(s.musicCategories), color: '#FF2D55' },
    { label: 'To-Do', bytes: jsonBytes(s.todos), color: '#007AFF' },
    { label: 'Catatan', bytes: jsonBytes(s.notes) + jsonBytes(s.workNotes), color: '#FFCC00' },
    { label: 'Galeri', bytes: jsonBytes(s.galleryPhotos) + jsonBytes(s.galleryAlbums), color: '#34C759' },
    { label: 'Kerja', bytes: jsonBytes(s.kas) + jsonBytes(s.workPhotos) + jsonBytes(s.workDocs), color: '#00C7BE' },
    { label: 'Lainnya', bytes: jsonBytes(s.focusHistory) + jsonBytes(s.countdowns) + jsonBytes(s.links) + jsonBytes(s.contacts) + jsonBytes(s.uploads) + jsonBytes(s.customWebLinks) + jsonBytes(s.customLabels), color: '#8E8E93' }
  ];
  const fbTotal = fb.reduce((n, p) => n + p.bytes, 0);
  // Rincian file per jenis (dari daftar di Firebase)
  const byStore = { r2: 0, drive: 0, kv: 0 };
  const add = (id, bytes) => { if (!id || !bytes) return; const st = id.startsWith('r2-') ? 'r2' : id.startsWith('gd-') ? 'drive' : 'kv'; byStore[st] += bytes; };
  (s.workPhotos || []).forEach(p => add(p.fileId, p.size));
  (s.workDocs || []).forEach(d => add(d.fileId, d.size));
  (s.galleryPhotos || []).forEach(p => add(p.fileId, p.size));
  (s.musicLibrary || []).forEach(m => add(m.fileId, m.size));
  const u = usageCache || {};
  let html = usageBlock('FIREBASE · TEKS SAJA', fbTotal, GB, fb, 'unduhan maks 10 GB/bulan');
  if (u.r2) {
    const used = u.r2.bytes, gb = x => (x / GB).toFixed(2).replace('.', ',');
    const lvl = used >= 9 * GB ? 3 : used >= 8.5 * GB ? 2 : used >= 7 * GB ? 1 : 0;
    if (lvl) {
      const msg = lvl === 3 ? `R2 mencapai ${gb(used)} GB — upload baru diblokir agar tidak kena biaya. Hapus file lama atau pakai Google Drive.` : `R2 sudah ${gb(used)} GB dari 10 GB gratis. ${lvl === 2 ? 'Upload akan diblokir di 9 GB.' : 'Mulai hapus file yang tidak perlu.'}`;
      html = `<div class="badge ${lvl === 3 ? 'tint-red' : 'tint-orange'}" style="white-space:normal; padding:10px 12px; font-size:13px; line-height:1.4; border-radius:14px"><i class="fas fa-triangle-exclamation"></i> ${esc(msg)}</div>` + html;
      if (typeof pushNotification === 'function') pushNotification({ key: 'storage_r2_client_L' + lvl, title: lvl === 3 ? '🛑 Penyimpanan R2 penuh (9 GB)' : `⚠️ Penyimpanan R2 ${lvl === 2 ? '85' : '70'}%`, body: msg, icon: 'fa-hard-drive', color: lvl === 3 ? 'bg-red' : 'bg-orange', action: { tab: 'tab-backup' } });
    }
    html += '<div class="divider"></div>' + usageBlock('CLOUDFLARE R2', used, u.r2.limit, null, 'peringatan di 7 GB & 8,5 GB · upload berhenti di 9 GB (aman dari tagihan)');
  }
  else html += `<div class="divider"></div><div class="t-foot muted semibold">CLOUDFLARE R2</div><div class="t-sub muted">Belum aktif — <a href="#" onclick="openStorageGuide('r2'); return false">lihat langkah</a></div>`;
  if (u.drive && !u.drive.error) html += '<div class="divider"></div>' + usageBlock('GOOGLE DRIVE (seluruh akun)', u.drive.bytes, u.drive.limit, null, `folder Nexa: ${formatBytes(u.drive.folderBytes || 0)}`);
  else if (u.drive && u.drive.error) html += `<div class="divider"></div><div class="t-foot muted semibold">GOOGLE DRIVE</div><div class="t-sub c-red">${esc(u.drive.error)}</div>`;
  if (u.kv && u.kv.count) html += '<div class="divider"></div>' + usageBlock('CLOUDFLARE KV (LAMA)', u.kv.bytes, u.kv.limit, null, `${u.kv.count} file`);
  const off = typeof offlineTotalBytes === 'function' ? offlineTotalBytes() : 0;
  html += `<div class="divider"></div>
    <div class="flex justify-between items-center gap-8"><div><div class="t-foot muted semibold">PERANGKAT INI</div><div class="t-sub" id="deviceStorageText">${deviceEstimate ? `${formatBytes(deviceEstimate.usage)} dipakai` : 'Menghitung…'}</div><div class="t-cap muted">Lagu offline: ${formatBytes(off)}</div></div>
      <div class="flex gap-6">${off ? '<button class="btn btn-danger-tinted btn-xs" onclick="clearAllOfflineSongs()">Hapus lagu offline</button>' : ''}<a class="btn btn-gray btn-xs" href="https://console.firebase.google.com/project/web-hadzmi-new/database" target="_blank" rel="noopener">Firebase</a></div></div>
    <div class="t-cap muted">Rincian file: R2 ${formatBytes(byStore.r2)} · Drive ${formatBytes(byStore.drive)} · KV ${formatBytes(byStore.kv)}</div>`;
  box.innerHTML = html;
  if (!deviceEstimate && navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(e => { deviceEstimate = e; const t = $('deviceStorageText'); if (t) t.textContent = `${formatBytes(e.usage)} dipakai`; }).catch(() => {});
  }
}

// ---------------- PANDUAN PENYIMPANAN ----------------
const APPS_SCRIPT_CODE = `/** Nexa — Penyimpanan Google Drive */
const FOLDER_NAME = 'Nexa';
function getSecret_() { return PropertiesService.getScriptProperties().getProperty('SECRET'); }
function folder_() { const it = DriveApp.getFoldersByName(FOLDER_NAME); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME); }
function inFolder_(file) { const p = file.getParents(); const fid = folder_().getId(); while (p.hasNext()) if (p.next().getId() === fid) return true; return false; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, service: 'hadzmi-hub-drive' }); }
function doPost(e) {
  let body; try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const secret = getSecret_();
  if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });
  try {
    if (body.action === 'upload') { const blob = Utilities.newBlob(Utilities.base64Decode(body.data), body.mimeType || 'application/octet-stream', body.name || 'file'); const f = folder_().createFile(blob); return json_({ ok: true, id: f.getId(), size: f.getSize() }); }
    if (body.action === 'get') { const f = DriveApp.getFileById(body.id); if (!inFolder_(f)) return json_({ ok: false, error: 'not found' }); const b = f.getBlob(); return json_({ ok: true, name: f.getName(), mimeType: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) }); }
    if (body.action === 'delete') { const f = DriveApp.getFileById(body.id); if (inFolder_(f)) f.setTrashed(true); return json_({ ok: true }); }
    if (body.action === 'usage') { let folderBytes = 0; const files = folder_().getFiles(); while (files.hasNext()) folderBytes += files.next().getSize(); return json_({ ok: true, used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit(), folderBytes: folderBytes }); }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
}`;
function guideSteps(steps) {
  return `<div class="list">${steps.map((st, i) => `<div class="row" style="align-items:flex-start; padding:14px 16px"><span class="icon-tile bg-blue" style="border-radius:99px; width:26px; height:26px; font-size:13px; font-weight:700">${i + 1}</span><div class="flex-1 t-sub" style="line-height:1.45">${st}</div></div>`).join('')}</div>`;
}
function openStorageGuide(kind) {
  const st = storeStatus();
  if (kind === 'r2') {
    $('guideTitle').textContent = 'Aktifkan Cloudflare R2';
    $('guideBody').innerHTML = `
      <div class="card card-pad"><div class="flex items-center gap-10"><span class="icon-tile lg" style="background:#F38020"><i class="fas fa-cloud"></i></span><div><div class="t-headline">Status: ${st.r2 ? '<span class="c-green">Aktif ✓</span>' : '<span class="c-orange">Belum aktif</span>'}</div><div class="t-foot muted">Gratis 10 GB/bulan · upload otomatis berhenti di 9 GB</div></div></div></div>
      ${st.r2 ? `<div class="list"><div class="row" style="padding:16px"><span class="icon-tile bg-green"><i class="fas fa-check"></i></span><div class="flex-1 t-sub" style="line-height:1.45"><b>R2 sudah aktif — tidak perlu langkah apa pun lagi.</b><br>Semua upload baru (lagu, Galeri, Foto Bukti, Gudang File) otomatis masuk R2. Kamu akan dapat notifikasi di 7 GB & 8,5 GB, dan upload berhenti otomatis di 9 GB supaya tetap gratis.</div></div></div>` : guideSteps([
        'Buka <b>dash.cloudflare.com</b> → menu kiri <b>Storage & Databases → R2 Object Storage</b>.',
        'Tap <b>Purchase R2 Plan</b> / <b>Add payment method</b> → masukkan kartu debit/kredit atau PayPal → pilih paket <b>Free</b>. Tidak ada tagihan selama di bawah 10 GB.',
        'Buka GitHub repo <b>Hadzmi-Website</b> → file <b>wrangler.jsonc</b> → tap ✏️ (Edit).',
        'Di bagian <b>CLOUDFLARE R2</b>, hapus <code>// </code> di depan 3 baris <code>"r2_buckets"</code>, <code>{ "binding": "FILES" … }</code>, dan <code>],</code> → <b>Commit changes</b>. (Atau cukup bilang ke Claude: "R2 sudah aktif".)',
        'Cloudflare otomatis deploy ulang & membuat bucket <b>hadzmi-hub-files</b> (±2 menit).',
        'Kembali ke sini → muat ulang halaman. Status R2 berubah jadi <b>● Aktif</b> dan semua upload baru otomatis masuk R2.'
      ])}
      ${st.r2 ? '' : '<div class="t-cap muted center">Langkah 3–4 sudah dikerjakan Claude (R2 sudah dinyalakan di konfigurasi). Jika status belum Aktif, cek tab Deployments di Cloudflare lalu muat ulang.</div>'}`;
  } else {
    $('guideTitle').textContent = 'Sambungkan Google Drive';
    $('guideBody').innerHTML = `
      <div class="card card-pad"><div class="flex items-center gap-10"><span class="icon-tile lg" style="background:linear-gradient(135deg,#34A853,#4285F4 55%,#FBBC05)"><i class="fab fa-google-drive"></i></span><div><div class="t-headline">Status: ${st.drive ? '<span class="c-green">Tersambung ✓</span>' : '<span class="c-orange">Belum tersambung</span>'}</div><div class="t-foot muted">Memakai kuota akun Google-mu (15 GB) · file masuk folder "Nexa"</div></div></div></div>
      ${guideSteps([
        'Buka <b>script.google.com</b> dengan akun Google yang akan dipakai → <b>New project</b>. Beri nama "Nexa Drive".',
        'Hapus isi editor, lalu tap <b>Salin Kode</b> di bawah ini dan tempel ke editor → tap 💾 <b>Save</b>.',
        'Tap ⚙️ <b>Project Settings</b> → <b>Script Properties</b> → <b>Add script property</b>: Property <code>SECRET</code>, Value: kata rahasia panjang buatanmu (mis. 30 huruf/angka acak) → Save.',
        'Tap <b>Deploy → New deployment</b> → ⚙️ pilih <b>Web app</b> → Execute as: <b>Me</b> · Who has access: <b>Anyone</b> → <b>Deploy</b> → izinkan akses (Authorize) → salin <b>Web app URL</b>.',
        'Buka Cloudflare → Worker <b>hadzmi-website-utama</b> → Settings → Variables and Secrets → tambah: <code>DRIVE_SCRIPT_URL</code> (Text) = Web app URL, dan <code>DRIVE_SECRET</code> (<b>Secret</b>) = kata rahasia yang sama → Deploy.',
        'Muat ulang halaman ini → status Google Drive jadi <b>● Tersambung</b>. Pilih "Google Drive" di kolom <b>Simpan di</b> saat upload.'
      ])}
      <button class="btn btn-filled btn-block" onclick="copyText(APPS_SCRIPT_CODE); showToast('Kode Apps Script disalin!')"><i class="far fa-copy"></i> Salin Kode Apps Script</button>
      <div class="t-cap muted center">Kata rahasia hanya disimpan di Apps Script & Cloudflare — tidak pernah dikirim ke browser.</div>`;
  }
  openSheet('sheetGuide');
}
