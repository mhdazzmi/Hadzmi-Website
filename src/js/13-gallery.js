/* =========================================================
   13 · GALERI — ala Photos iOS / Google Photos
   File di R2 / Google Drive (pilih saat upload); Firebase hanya menyimpan teks (keterangan, lokasi, album).
   ========================================================= */
let galleryView = 'library';
let galleryAlbumOpen = null;
let galleryPlaceOpen = null;
let gallerySelecting = false;
const gallerySelected = new Set();
let galleryCoverPick = false;
let galleryPicked = [];
let galleryViewerId = null;
let galleryViewerList = [];
let lastDeviceCoords = null;

function gPhotos() { return appState.galleryPhotos || (appState.galleryPhotos = []); }
function gAlbums() { return appState.galleryAlbums || (appState.galleryAlbums = []); }
function gPhoto(id) { return gPhotos().find(p => p.id === id); }
function gAlbum(id) { return gAlbums().find(a => a.id === id); }
function albumPhotos(a) { return gPhotos().filter(p => (p.albumIds || []).includes(a.id)).sort((x, y) => (y.takenAt || 0) - (x.takenAt || 0)); }
function albumCoverPhoto(a) { return (a.coverPhotoId && gPhoto(a.coverPhotoId) && (gPhoto(a.coverPhotoId).albumIds || []).includes(a.id)) ? gPhoto(a.coverPhotoId) : albumPhotos(a)[0]; }

// ---------- EXIF (tanggal ambil & GPS) ----------
async function readExif(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer(); const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return {};
    let off = 2;
    while (off < v.byteLength - 10) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + len;
    }
  } catch (e) {}
  return {};
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
  const readIFD = o => { const n = u16(o), tags = {}; for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; tags[u16(e)] = { count: u32(e + 4), at: e + 8 }; } return tags; };
  const ascii = tag => { const p = tag.count > 4 ? u32(tag.at) : tag.at; let s = ''; for (let i = 0; i < tag.count - 1; i++) { const c = v.getUint8(t + p + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const rats = tag => { const p = u32(tag.at), out = []; for (let i = 0; i < tag.count; i++) out.push(u32(p + i * 8) / (u32(p + i * 8 + 4) || 1)); return out; };
  const out = {};
  try {
    const ifd0 = readIFD(u32(4));
    if (ifd0[0x8769]) { const ex = readIFD(u32(ifd0[0x8769].at)); const dt = ex[0x9003] || ex[0x9004]; if (dt) out.dateTaken = ascii(dt); }
    if (!out.dateTaken && ifd0[0x0132]) out.dateTaken = ascii(ifd0[0x0132]);
    if (ifd0[0x8825]) {
      const g = readIFD(u32(ifd0[0x8825].at));
      if (g[2] && g[4]) {
        const a = rats(g[2]), b = rats(g[4]);
        let lat = a[0] + a[1] / 60 + a[2] / 3600, lng = b[0] + b[1] / 60 + b[2] / 3600;
        if (g[1] && ascii(g[1]) === 'S') lat = -lat;
        if (g[3] && ascii(g[3]) === 'W') lng = -lng;
        if (isFinite(lat) && isFinite(lng) && (lat || lng)) out.gps = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
      }
    }
  } catch (e) {}
  if (out.dateTaken) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(out.dateTaken);
    out.takenAt = m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : null;
  }
  return out;
}
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=id`);
    if (!r.ok) throw 0;
    const d = await r.json(), a = d.address || {};
    const place = d.name || a.attraction || a.tourism || a.suburb || a.village || a.neighbourhood || a.town || '';
    const city = a.city || a.town || a.county || a.regency || a.state || '';
    return [place, city].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (e) { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}
function fillLocationFromDevice(inputId) {
  if (!navigator.geolocation) return showToast('Perangkat tidak mendukung lokasi.', false);
  showToast('Mengambil lokasi…');
  navigator.geolocation.getCurrentPosition(async pos => {
    lastDeviceCoords = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
    $(inputId).value = await reverseGeocode(lastDeviceCoords.lat, lastDeviceCoords.lng);
    $(inputId).dataset.coords = JSON.stringify(lastDeviceCoords);
  }, err => showToast('Izin lokasi ditolak / tidak tersedia.', false), { enableHighAccuracy: true, timeout: 12000 });
}
function mapsLink(loc) {
  if (!loc) return '#';
  return loc.lat != null ? `https://maps.apple.com/?q=${encodeURIComponent(loc.name || '')}&ll=${loc.lat},${loc.lng}` : `https://maps.apple.com/?q=${encodeURIComponent(loc.name || '')}`;
}

// ---------- Upload ----------
async function onGalleryPicked(e) {
  const files = Array.from(e.target.files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name));
  e.target.value = '';
  if (!files.length) return;
  if (!pushConfig) return showToast('Penyimpanan cloud belum terhubung (cek internet).', false);
  galleryPicked.forEach(p => URL.revokeObjectURL(p.preview));
  galleryPicked = await Promise.all(files.map(async f => ({ file: f, preview: URL.createObjectURL(f), exif: await readExif(f) })));
  $('galleryPickPreview').innerHTML = galleryPicked.map(p => `<img src="${p.preview}" alt="">`).join('');
  $('galleryUploadTitle').textContent = `Tambah ${files.length} Foto`;
  $('gUpCaption').value = ''; $('gUpLocation').value = ''; delete $('gUpLocation').dataset.coords;
  $('gUpAlbum').innerHTML = `<option value="">Tanpa album</option>` + gAlbums().map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('') + `<option value="__new">+ Album baru…</option>`;
  if (galleryAlbumOpen) $('gUpAlbum').value = galleryAlbumOpen;
  fillStoreSelects();
  const withGps = galleryPicked.find(p => p.exif.gps);
  $('galleryUploadStatus').textContent = withGps ? 'Lokasi terdeteksi dari foto…' : `${files.length} foto · tanggal diambil dari info foto bila ada`;
  openSheet('sheetGalleryUpload');
  if (withGps) { $('gUpLocation').value = await reverseGeocode(withGps.exif.gps.lat, withGps.exif.gps.lng); $('galleryUploadStatus').textContent = '📍 Lokasi diisi otomatis dari GPS foto'; }
}
function cancelGalleryUpload() {
  if ($('galleryUploadBtn').disabled) return;
  galleryPicked.forEach(p => URL.revokeObjectURL(p.preview)); galleryPicked = [];
  closeSheet('sheetGalleryUpload');
}
async function saveGalleryUpload() {
  if (!galleryPicked.length) return;
  const btn = $('galleryUploadBtn'), status = $('galleryUploadStatus');
  let albumId = $('gUpAlbum').value;
  if (albumId === '__new') { albumId = await promptNewAlbum(); if (!albumId) return; }
  const caption = $('gUpCaption').value.trim(), locName = $('gUpLocation').value.trim();
  const devCoords = $('gUpLocation').dataset.coords ? JSON.parse($('gUpLocation').dataset.coords) : null;
  const store = $('gUpStore').value || getDefaultStore(), quality = $('gUpQuality').value;
  btn.disabled = true; btn.innerHTML = '<span class="spinner dark" style="display:inline-block"></span>';
  let ok = 0; const errs = [];
  for (let i = 0; i < galleryPicked.length; i++) {
    const { file, exif } = galleryPicked[i];
    try {
      status.textContent = `Memproses ${i + 1}/${galleryPicked.length}…`;
      const img = await loadImage(file);
      let full = file, w = img.naturalWidth, h = img.naturalHeight;
      if (quality === 'saver' || !/jpe?g|png|webp/i.test(file.type)) { const r = await imageToJpeg(img, 2560, 0.88); if (quality === 'saver' || r.blob.size < file.size) { full = r.blob; w = r.w; h = r.h; } }
      const thumb = await imageToJpeg(img, 480, 0.74);
      const base = safeFileName(file.name.replace(/\.[^.]+$/, '')) + (full === file ? (file.name.match(/\.[^.]+$/) || ['.jpg'])[0] : '.jpg');
      const up = await apiUploadFile(full, base, p => { status.textContent = `Mengunggah ${i + 1}/${galleryPicked.length}… ${Math.round(p * 100)}%`; }, store);
      const upT = await apiUploadFile(thumb.blob, 'thumb_' + base.replace(/\.[^.]+$/, '') + '.jpg', null, store);
      const gps = exif.gps || devCoords;
      gPhotos().unshift({
        id: 'gp_' + Date.now() + '_' + i, fileId: up.id, thumbId: upT.id, name: base, w, h,
        size: up.size + upT.size, takenAt: exif.takenAt || file.lastModified || Date.now(), createdAt: Date.now(),
        caption, location: locName || gps ? { name: locName || (gps ? `${gps.lat}, ${gps.lng}` : ''), lat: gps ? gps.lat : null, lng: gps ? gps.lng : null } : null,
        albumIds: albumId ? [albumId] : [], fav: false
      });
      ok++;
    } catch (err) { errs.push(err.message || String(err)); }
  }
  btn.disabled = false; btn.textContent = 'Simpan';
  if (ok) { saveStateToLocal(); renderGallery(); renderStoragePanel(); }
  if (errs.length) { status.textContent = errs[0]; showToast(ok ? `${ok} foto tersimpan, ${errs.length} gagal` : 'Gagal: ' + errs[0], false); if (!ok) return; }
  else showToast(`${ok} foto ditambahkan ke ${L('media.gallery')}!`);
  galleryPicked.forEach(p => URL.revokeObjectURL(p.preview)); galleryPicked = [];
  closeSheet('sheetGalleryUpload');
}

// ---------- Album ----------
async function promptNewAlbum() {
  const name = await iosAlert({ title: 'Album Baru', message: 'Masukkan nama album', input: { placeholder: 'Mis. Liburan Bali' }, actions: [{ text: 'Batal', value: false }, { text: 'Buat', value: true, bold: true }] });
  if (!name || !name.trim()) return null;
  const a = { id: 'al_' + Date.now(), name: name.trim().slice(0, 40), coverPhotoId: '', createdAt: Date.now() };
  gAlbums().unshift(a); saveStateToLocal();
  return a.id;
}
async function createAlbumFromUI() { const id = await promptNewAlbum(); if (id) { renderGallery(); showToast('Album dibuat.'); } }
function openAlbum(id) { galleryAlbumOpen = id; galleryPlaceOpen = null; galleryView = 'albums'; renderGallery(); $('personalAppRoot').scrollTo({ top: 0 }); }
function openPlace(name) { galleryPlaceOpen = name; galleryAlbumOpen = null; galleryView = 'places'; renderGallery(); $('personalAppRoot').scrollTo({ top: 0 }); }
function closeGalleryContext() { galleryAlbumOpen = null; galleryPlaceOpen = null; galleryCoverPick = false; renderGallery(); }
function openAlbumActions(id) {
  const a = gAlbum(id); if (!a) return;
  openActionSheet({ title: a.name, message: `${albumPhotos(a).length} foto`, actions: [
    { text: 'Ganti Cover Album', icon: 'fas fa-image', onClick: () => { galleryCoverPick = true; renderGallery(); showToast('Tap foto yang ingin dijadikan cover'); } },
    { text: 'Tambah Foto ke Album', icon: 'fas fa-plus', onClick: () => document.getElementById('galleryFileInput').click() },
    { text: 'Ganti Nama', icon: 'fas fa-pen', onClick: () => renameAlbum(id) },
    { text: 'Hapus Album', icon: 'fas fa-trash', destructive: true, onClick: () => deleteAlbum(id) }
  ] });
}
async function renameAlbum(id) {
  const a = gAlbum(id); if (!a) return;
  const v = await iosAlert({ title: 'Ganti nama album', input: { value: a.name }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (!v || !v.trim()) return;
  a.name = v.trim().slice(0, 40); saveStateToLocal(); renderGallery();
}
async function deleteAlbum(id) {
  const a = gAlbum(id); if (!a) return;
  if (!(await iosConfirm(`Hapus album "${a.name}"?`, 'Foto di dalamnya TIDAK ikut terhapus dari Galeri.', 'Hapus Album', true))) return;
  appState.galleryAlbums = gAlbums().filter(x => x.id !== id);
  gPhotos().forEach(p => { if (p.albumIds) p.albumIds = p.albumIds.filter(x => x !== id); });
  galleryAlbumOpen = null; saveStateToLocal(); renderGallery(); showToast('Album dihapus.');
}
function setAlbumCover(albumId, photoId) {
  const a = gAlbum(albumId); if (!a) return;
  a.coverPhotoId = photoId; galleryCoverPick = false; saveStateToLocal(); renderGallery(); showToast(`Cover "${a.name}" diganti.`);
}
async function pickAlbum(title) {
  const acts = gAlbums().map(a => ({ text: a.name, icon: 'fas fa-images', value: a.id }));
  acts.push({ text: 'Album Baru…', icon: 'fas fa-plus', value: '__new' });
  let v = await openActionSheet({ title: title || 'Tambah ke Album', actions: acts });
  if (v === '__new') v = await promptNewAlbum();
  return v || null;
}
async function addPhotosToAlbum(ids) {
  const albumId = await pickAlbum(); if (!albumId) return;
  ids.forEach(id => { const p = gPhoto(id); if (p) { p.albumIds = p.albumIds || []; if (!p.albumIds.includes(albumId)) p.albumIds.push(albumId); } });
  saveStateToLocal(); exitGallerySelect(); renderGallery(); showToast(`${ids.length} foto ditambahkan ke "${gAlbum(albumId).name}"`);
}
function addSelectedToAlbum() { const ids = gallerySelectedIds(); if (!ids.length) return showToast('Pilih foto dulu.', false); addPhotosToAlbum(ids); }

// ---------- Render ----------
function setGalleryView(v) { if (galleryView === 'hidden' && v !== 'hidden' && typeof lockVault === 'function' && vaultKey) lockVault(); if (v === 'hidden') exitGallerySelect(); galleryView = v; galleryAlbumOpen = null; galleryPlaceOpen = null; galleryCoverPick = false; renderGallery(); }
function filteredGalleryPhotos() {
  const q = ($('gallerySearch') ? $('gallerySearch').value : '').toLowerCase().trim();
  let list = gPhotos().slice().sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
  if (galleryAlbumOpen) list = list.filter(p => (p.albumIds || []).includes(galleryAlbumOpen));
  else if (galleryPlaceOpen) list = list.filter(p => p.location && p.location.name === galleryPlaceOpen);
  else if (galleryView === 'favorites') list = list.filter(p => p.fav);
  if (q) list = list.filter(p => {
    const albums = (p.albumIds || []).map(id => (gAlbum(id) || {}).name || '').join(' ');
    const d = new Date(p.takenAt || p.createdAt);
    return [p.caption, p.location && p.location.name, albums, d.getDate() + ' ' + ID_MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear(), p.name].join(' ').toLowerCase().includes(q);
  });
  return list;
}
function photoCellHTML(p) {
  return `<button class="photo-cell ${gallerySelected.has(p.id) ? 'sel' : ''}" data-id="${esc(p.id)}">
    <span class="ph-load"><span class="spinner dark"></span></span>
    <img alt="" data-sid="${esc(p.thumbId || p.fileId)}">
    ${p.fav ? '<span class="ph-fav"><i class="fas fa-heart"></i></span>' : ''}
    <span class="ph-check"><i class="fas fa-check"></i></span></button>`;
}
function gridByMonth(list) {
  const groups = [];
  list.forEach(p => {
    const d = new Date(p.takenAt || p.createdAt); const key = d.getFullYear() + '-' + d.getMonth();
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push(g = { key, label: `${ID_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, items: [] });
    g.items.push(p);
  });
  return groups.map(g => `<div class="g-section"><span>${esc(g.label)}</span><small>${g.items.length} foto</small></div><div class="g-grid">${g.items.map(photoCellHTML).join('')}</div>`).join('');
}
function loadSignedImages(root) {
  const imgs = Array.from(root.querySelectorAll('img[data-sid]'));
  if (!imgs.length) return;
  const apply = () => imgs.forEach(img => {
    const u = signedUrlSync(img.dataset.sid);
    if (u && img.getAttribute('src') !== u) {
      img.onload = () => { const l = img.parentElement && img.parentElement.querySelector('.ph-load'); if (l) l.remove(); };
      img.onerror = () => { const l = img.parentElement && img.parentElement.querySelector('.ph-load'); if (l) l.innerHTML = '<i class="fas fa-triangle-exclamation"></i>'; };
      img.src = u;
    }
  });
  apply();
  const missing = imgs.map(i => i.dataset.sid).filter(id => !signedUrlSync(id));
  if (missing.length && firebaseAuth && firebaseAuth.currentUser && pushConfig) signIds(missing).then(apply);
}
function renderGallery() {
  const body = $('galleryBody'); if (!body) return;
  if ($('sub-gallery') && $('sub-gallery').classList.contains('hidden') && currentTabId !== 'tab-music') return;
  const seg = $('galleryViewSeg');
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === galleryView));
  const ctx = $('galleryContext');
  const all = gPhotos();
  if (galleryView === 'hidden') { ctx.classList.add('hidden'); ctx.innerHTML = ''; return renderVault(body); }
  // Bar konteks (album / tempat terbuka)
  if (galleryAlbumOpen || galleryPlaceOpen) {
    const a = galleryAlbumOpen && gAlbum(galleryAlbumOpen);
    if (galleryAlbumOpen && !a) { galleryAlbumOpen = null; return renderGallery(); }
    ctx.classList.remove('hidden');
    ctx.innerHTML = `<div class="ctx-bar">
      <button class="btn-plain" onclick="closeGalleryContext()" style="font-size:17px"><i class="fas fa-chevron-left"></i> ${a ? 'Album' : 'Tempat'}</button>
      <div class="flex gap-6">${a ? `<button class="btn btn-gray btn-sm" onclick="openAlbumActions('${esc(a.id)}')"><i class="fas fa-ellipsis"></i></button>` :
        `<a class="btn btn-tinted btn-sm" href="${mapsLink((all.find(p => p.location && p.location.name === galleryPlaceOpen) || {}).location)}" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Peta</a>`}</div></div>
      <div class="t-title1" style="padding:6px 4px 0">${esc(a ? a.name : galleryPlaceOpen)}</div>
      ${galleryCoverPick ? '<div class="badge tint-blue" style="margin:8px 4px 0">Tap foto untuk dijadikan cover</div>' : ''}`;
  } else { ctx.classList.add('hidden'); ctx.innerHTML = ''; }

  const q = ($('gallerySearch') ? $('gallerySearch').value : '').trim();
  if (galleryView === 'albums' && !galleryAlbumOpen && !q) {
    body.innerHTML = `<div class="album-grid mt-8">
      <button class="album-card new" onclick="createAlbumFromUI()"><div class="ac-cover"><i class="fas fa-plus"></i></div><div class="ac-name">Album Baru</div><div class="ac-count">&nbsp;</div></button>
      ${gAlbums().map(a => { const c = albumCoverPhoto(a); return `<button class="album-card" onclick="openAlbum('${esc(a.id)}')"><div class="ac-cover">${c ? `<img alt="" data-sid="${esc(c.thumbId || c.fileId)}">` : '<i class="fas fa-images"></i>'}</div><div class="ac-name truncate">${esc(a.name)}</div><div class="ac-count">${albumPhotos(a).length}</div></button>`; }).join('')}
    </div>`;
    loadSignedImages(body); return;
  }
  if (galleryView === 'places' && !galleryPlaceOpen && !q) {
    const places = {};
    all.forEach(p => { if (p.location && p.location.name) (places[p.location.name] = places[p.location.name] || []).push(p); });
    const names = Object.keys(places).sort((a, b) => places[b].length - places[a].length);
    body.innerHTML = names.length ? `<div class="list inset-icon mt-8">${names.map(n => { const c = places[n].sort((x, y) => (y.takenAt || 0) - (x.takenAt || 0))[0]; return `<button class="row place-row" onclick="openPlace('${esc(n).replace(/'/g, '&#39;')}')"><div class="thumb"><img alt="" data-sid="${esc(c.thumbId || c.fileId)}"></div><div class="flex-1"><div class="row-title truncate"><i class="fas fa-location-dot c-red" style="font-size:12px"></i> ${esc(n)}</div><div class="row-sub">${places[n].length} foto</div></div><i class="fas fa-chevron-right chev"></i></button>`; }).join('')}</div>`
      : `<div class="card"><div class="empty"><i class="fas fa-map-location-dot"></i><div class="e-title">Belum ada lokasi</div><div class="e-sub">Tambahkan lokasi saat upload, atau dari info foto (ⓘ).</div></div></div>`;
    loadSignedImages(body); return;
  }
  const list = filteredGalleryPhotos();
  galleryViewerList = list.map(p => p.id);
  if (!list.length) {
    body.innerHTML = `<div class="card"><div class="empty"><i class="fas fa-images"></i><div class="e-title">${all.length ? 'Tidak ada foto di sini' : 'Galeri masih kosong'}</div><div class="e-sub">Tap <b>+ Foto</b> untuk menambahkan foto dari perangkat.</div></div></div>`;
    return;
  }
  body.className = gallerySelecting ? 'selecting' : '';
  body.innerHTML = gridByMonth(list);
  body.querySelectorAll('.photo-cell').forEach(cell => cell.onclick = () => {
    const id = cell.dataset.id;
    if (galleryCoverPick && galleryAlbumOpen) return setAlbumCover(galleryAlbumOpen, id);
    if (gallerySelecting) { if (gallerySelected.has(id)) gallerySelected.delete(id); else gallerySelected.add(id); cell.classList.toggle('sel', gallerySelected.has(id)); updateGallerySelCount(); }
    else openGalleryViewer(id);
  });
  loadSignedImages(body);
}

// ---------- Pilih banyak ----------
function toggleGallerySelect() {
  gallerySelecting = !gallerySelecting; if (!gallerySelecting) gallerySelected.clear();
  $('gallerySelectBtn').textContent = gallerySelecting ? 'Batal' : 'Pilih';
  $('gallerySelectBar').classList.toggle('hidden', !gallerySelecting);
  updateGallerySelCount(); renderGallery();
}
function exitGallerySelect() { if (gallerySelecting) toggleGallerySelect(); }
function updateGallerySelCount() { if ($('gallerySelCount')) $('gallerySelCount').textContent = `${gallerySelected.size} dipilih`; }
function gallerySelectedIds() { return Array.from(gallerySelected); }
function favoriteSelected() {
  const ids = gallerySelectedIds(); if (!ids.length) return;
  const allFav = ids.every(id => (gPhoto(id) || {}).fav);
  ids.forEach(id => { const p = gPhoto(id); if (p) p.fav = !allFav; });
  saveStateToLocal(); renderGallery(); showToast(allFav ? 'Dihapus dari Favorit' : '♥ Ditambahkan ke Favorit');
}

// ---------- Viewer ----------
async function openGalleryViewer(id) {
  galleryViewerId = id;
  if (!galleryViewerList.includes(id)) galleryViewerList = filteredGalleryPhotos().map(p => p.id);
  $('galleryViewer').classList.add('open'); $('galleryViewer').classList.remove('chrome-off');
  $('gvInfo').classList.add('hidden');
  await showViewerPhoto();
}
async function showViewerPhoto() {
  const p = gPhoto(galleryViewerId); if (!p) return closeGalleryViewer();
  const d = new Date(p.takenAt || p.createdAt);
  $('gvDate').textContent = `${d.getDate()} ${ID_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  $('gvPlace').textContent = p.location && p.location.name ? '📍 ' + p.location.name : (p.caption || '');
  $('gvFav').classList.toggle('on', !!p.fav); $('gvFav').innerHTML = p.fav ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
  const img = $('gvImg'); $('gvSpin').classList.remove('hidden');
  const thumbU = signedUrlSync(p.thumbId); if (thumbU) img.src = thumbU;
  if (!$('gvInfo').classList.contains('hidden')) renderGalleryInfo();
  try {
    const u = await signedUrl(p.fileId);
    if (galleryViewerId !== p.id) return;
    const full = new Image(); full.onload = () => { if (galleryViewerId === p.id) { img.src = u; $('gvSpin').classList.add('hidden'); } }; full.onerror = () => $('gvSpin').classList.add('hidden'); full.src = u;
    // siapkan foto sebelah
    const i = galleryViewerList.indexOf(p.id);
    [galleryViewerList[i + 1], galleryViewerList[i - 1]].forEach(nid => { const n = nid && gPhoto(nid); if (n) signedUrl(n.fileId).then(nu => { if (nu) (new Image()).src = nu; }); });
  } catch (e) { $('gvSpin').classList.add('hidden'); showToast(e.message, false); }
}
function stepGalleryViewer(dir) {
  const i = galleryViewerList.indexOf(galleryViewerId), j = i + dir;
  if (j < 0 || j >= galleryViewerList.length) return;
  galleryViewerId = galleryViewerList[j]; showViewerPhoto();
}
function closeGalleryViewer() { $('galleryViewer').classList.remove('open'); galleryViewerId = null; }
function toggleGalleryInfo() { const el = $('gvInfo'); el.classList.toggle('hidden'); if (!el.classList.contains('hidden')) renderGalleryInfo(); }
function renderGalleryInfo() {
  const p = gPhoto(galleryViewerId); if (!p) return;
  const albums = (p.albumIds || []).map(gAlbum).filter(Boolean);
  const st = storeOfId(p.fileId);
  $('gvInfo').innerHTML = `
    <div class="gi-row"><i class="fas fa-align-left"></i><div class="flex-1">${p.caption ? esc(p.caption) : '<span style="opacity:.6">Tambah keterangan…</span>'}</div><button class="btn btn-xs" onclick="editGalleryCaption()">Edit</button></div>
    <div class="gi-row"><i class="fas fa-location-dot"></i><div class="flex-1">${p.location && p.location.name ? `<a href="${mapsLink(p.location)}" target="_blank" rel="noopener">${esc(p.location.name)}</a>` : '<span style="opacity:.6">Tanpa lokasi</span>'}</div><button class="btn btn-xs" onclick="editGalleryLocation()">Ubah</button></div>
    <div class="gi-row"><i class="fas fa-images"></i><div class="flex-1">${albums.length ? albums.map(a => esc(a.name)).join(', ') : '<span style="opacity:.6">Belum di album</span>'}</div><button class="btn btn-xs" onclick="addPhotosToAlbum([galleryViewerId])">+ Album</button></div>
    <div class="gi-row"><i class="fas fa-circle-info"></i><div class="flex-1" style="opacity:.75">${p.w}×${p.h} · ${formatBytes(p.size)} · ${STORE_NAMES[st] || st}</div></div>`;
}
async function editGalleryCaption() {
  const p = gPhoto(galleryViewerId); if (!p) return;
  const v = await iosAlert({ title: 'Keterangan', input: { value: p.caption || '' }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (v === null) return;
  p.caption = v.trim(); saveStateToLocal(); renderGalleryInfo(); showViewerPhoto();
}
async function editGalleryLocation() {
  const p = gPhoto(galleryViewerId); if (!p) return;
  const choice = await openActionSheet({ title: 'Lokasi Foto', actions: [
    { text: 'Ketik nama lokasi', icon: 'fas fa-keyboard', value: 'type' },
    { text: 'Pakai lokasi saat ini', icon: 'fas fa-location-crosshairs', value: 'here' },
    ...(p.location ? [{ text: 'Hapus lokasi', icon: 'fas fa-xmark', value: 'clear', destructive: true }] : [])
  ] });
  if (choice === 'clear') { p.location = null; }
  else if (choice === 'type') {
    const v = await iosAlert({ title: 'Nama lokasi', input: { value: (p.location && p.location.name) || '', placeholder: 'Mis. Pantai Kuta, Bali' }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
    if (v === null) return;
    p.location = v.trim() ? { name: v.trim(), lat: p.location ? p.location.lat : null, lng: p.location ? p.location.lng : null } : null;
  } else if (choice === 'here') {
    if (!navigator.geolocation) return showToast('Perangkat tidak mendukung lokasi.', false);
    showToast('Mengambil lokasi…');
    return navigator.geolocation.getCurrentPosition(async pos => {
      const lat = +pos.coords.latitude.toFixed(6), lng = +pos.coords.longitude.toFixed(6);
      p.location = { name: await reverseGeocode(lat, lng), lat, lng };
      saveStateToLocal(); renderGalleryInfo(); showViewerPhoto(); renderGallery();
    }, () => showToast('Izin lokasi ditolak / tidak tersedia.', false), { enableHighAccuracy: true, timeout: 12000 });
  } else return;
  saveStateToLocal(); renderGalleryInfo(); showViewerPhoto(); renderGallery();
}
function toggleGalleryFav(id) {
  const p = gPhoto(id); if (!p) return;
  p.fav = !p.fav; haptic(10); saveStateToLocal();
  if (galleryViewerId === id) { $('gvFav').classList.toggle('on', p.fav); $('gvFav').innerHTML = p.fav ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>'; }
  renderGallery();
}
function openGalleryPhotoActions() {
  const p = gPhoto(galleryViewerId); if (!p) return;
  const acts = [
    { text: 'Edit Keterangan', icon: 'fas fa-pen', onClick: editGalleryCaption },
    { text: 'Ubah Lokasi', icon: 'fas fa-location-dot', onClick: editGalleryLocation },
    { text: 'Tambah ke Album', icon: 'fas fa-images', onClick: () => addPhotosToAlbum([p.id]) }
  ];
  if ((p.albumIds || []).length) acts.push({ text: 'Jadikan Cover Album…', icon: 'fas fa-image', onClick: async () => {
    const ids = p.albumIds.filter(gAlbum);
    const albumId = ids.length === 1 ? ids[0] : await openActionSheet({ title: 'Cover untuk album', actions: ids.map(id => ({ text: gAlbum(id).name, value: id })) });
    if (albumId) setAlbumCover(albumId, p.id);
  } });
  if (galleryAlbumOpen && (p.albumIds || []).includes(galleryAlbumOpen)) acts.push({ text: 'Keluarkan dari Album Ini', icon: 'fas fa-folder-minus', onClick: () => { p.albumIds = p.albumIds.filter(x => x !== galleryAlbumOpen); saveStateToLocal(); renderGallery(); stepGalleryViewer(1); } });
  acts.push({ text: 'Unduh', icon: 'fas fa-download', onClick: () => downloadGalleryPhoto(p.id) });
  acts.push({ text: 'Hapus', icon: 'fas fa-trash', destructive: true, onClick: () => deleteGalleryPhotos([p.id]) });
  openActionSheet({ title: p.caption || 'Foto', actions: acts });
}
async function galleryBlob(p) {
  if (fileBlobCache.has(p.fileId)) return fileBlobCache.get(p.fileId);
  const u = await signedUrl(p.fileId); const r = await fetch(u); if (!r.ok) throw new Error('Gagal memuat foto');
  const b = await r.blob(); fileBlobCache.set(p.fileId, b); return b;
}
async function downloadGalleryPhoto(id) { const p = gPhoto(id); if (!p) return; try { downloadBlob(await galleryBlob(p), p.name || 'foto.jpg'); } catch (e) { showToast(e.message, false); } }
async function shareGalleryPhotos(ids) {
  const items = ids.map(gPhoto).filter(Boolean); if (!items.length) return showToast('Pilih foto dulu.', false);
  const missing = items.filter(p => !fileBlobCache.has(p.fileId));
  if (missing.length) { showToast('Menyiapkan foto… tap Bagikan sekali lagi.'); await Promise.all(missing.map(p => galleryBlob(p).catch(() => {}))); return; }
  const files = items.map(p => new File([fileBlobCache.get(p.fileId)], p.name || 'foto.jpg', { type: fileBlobCache.get(p.fileId).type || 'image/jpeg' }));
  if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  files.forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 400));
}
async function deleteGalleryPhotos(ids) {
  const items = ids.map(gPhoto).filter(Boolean); if (!items.length) return;
  if (!(await iosConfirm(`Hapus ${items.length} foto?`, 'Foto dihapus permanen dari Galeri & penyimpanan cloud.', 'Hapus', true))) return;
  for (const p of items) { apiDeleteFile(p.fileId).catch(() => {}); apiDeleteFile(p.thumbId).catch(() => {}); }
  const del = new Set(items.map(p => p.id));
  if (galleryViewerId && del.has(galleryViewerId)) {
    const i = galleryViewerList.indexOf(galleryViewerId);
    const next = galleryViewerList.slice(i + 1).concat(galleryViewerList.slice(0, i).reverse()).find(x => !del.has(x));
    galleryViewerList = galleryViewerList.filter(x => !del.has(x));
    if (next) { galleryViewerId = next; showViewerPhoto(); } else closeGalleryViewer();
  }
  appState.galleryPhotos = gPhotos().filter(p => !del.has(p.id));
  del.forEach(id => gallerySelected.delete(id));
  saveStateToLocal(); updateGallerySelCount(); renderGallery(); renderStoragePanel();
  showToast(`${items.length} foto dihapus.`);
}
// Gestur viewer: geser kiri/kanan, tap untuk sembunyikan tombol, panah keyboard
(function bindGalleryViewer() {
  document.addEventListener('DOMContentLoaded', () => {
    const stage = $('gvStage'); if (!stage) return;
    let x0 = null, y0 = null, moved = false, lastTouch = 0;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moved = false; }, { passive: true });
    stage.addEventListener('touchmove', e => { if (x0 === null) return; const dx = e.touches[0].clientX - x0; if (Math.abs(dx) > 10) moved = true; $('gvImg').style.transform = `translateX(${dx * 0.6}px)`; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (x0 === null) return; lastTouch = Date.now(); const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      $('gvImg').style.transform = '';
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) stepGalleryViewer(dx < 0 ? 1 : -1);
      else if (dy > 110) closeGalleryViewer();
      else if (!moved) $('galleryViewer').classList.toggle('chrome-off');
    });
    stage.addEventListener('click', e => { if (Date.now() - lastTouch > 700) { const r = stage.getBoundingClientRect(); const x = e.clientX - r.left; if (x < r.width * 0.25) stepGalleryViewer(-1); else if (x > r.width * 0.75) stepGalleryViewer(1); } });
    document.addEventListener('keydown', e => {
      if (!$('galleryViewer').classList.contains('open')) return;
      if (e.key === 'ArrowRight') stepGalleryViewer(1); else if (e.key === 'ArrowLeft') stepGalleryViewer(-1); else if (e.key === 'Escape') closeGalleryViewer();
    });
  });
})();
