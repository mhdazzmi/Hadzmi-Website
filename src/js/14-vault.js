/* =========================================================
   14 · GALERI TERSEMBUNYI (terenkripsi) + EDITOR FOTO (putar & potong)
   Foto tersembunyi dienkripsi AES-256-GCM DI PERANGKAT sebelum di-upload.
   Kunci berasal dari sandi khusus (PBKDF2) — sandi tidak pernah disimpan / dikirim ke mana pun.
   ========================================================= */
let vaultKey = null, vaultRaw = null, vaultTimer = null;
const vaultUrls = new Map();
let vaultViewerId = null, vaultList = [];
const PBKDF2_ITER = 310000;

const b64e = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = str => { const bin = atob(str); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
async function deriveKek(pw, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function aesEnc(key, data) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data); return { iv: b64e(iv), ct: new Uint8Array(ct) }; }
async function aesDec(key, iv, ct) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) }, key, ct)); }
function vaultItems() { return (appState.vault && appState.vault.items) || []; }
function touchVault() { clearTimeout(vaultTimer); vaultTimer = setTimeout(() => lockVault(true), 5 * 60 * 1000); }
function lockVault(auto) {
  vaultKey = null; vaultRaw = null; clearTimeout(vaultTimer);
  vaultUrls.forEach(u => URL.revokeObjectURL(u)); vaultUrls.clear();
  closeVaultViewer();
  if (galleryView === 'hidden') renderGallery();
  if (auto === true) showToast('Galeri Tersembunyi dikunci otomatis.');
}
async function createVault(pw, pw2) {
  if (!pw || pw.length < 6) return showToast('Sandi minimal 6 karakter.', false);
  if (pw !== pw2) return showToast('Ulangi sandi tidak sama.', false);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const kek = await deriveKek(pw, salt);
  const w = await aesEnc(kek, raw);
  appState.vault = { v: 1, salt: b64e(salt), wrapIv: w.iv, wrapped: b64e(w.ct), items: [] };
  saveStateToLocal();
  await openVaultWithRaw(raw);
  showToast('Galeri Tersembunyi dibuat & terbuka.');
}
async function openVaultWithRaw(raw) {
  vaultRaw = raw;
  vaultKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  touchVault(); renderGallery();
}
async function unlockVault(pw) {
  const v = appState.vault; if (!v) return false;
  try {
    const kek = await deriveKek(pw, b64d(v.salt));
    const raw = await aesDec(kek, v.wrapIv, b64d(v.wrapped));
    await openVaultWithRaw(raw); return true;
  } catch (e) { return false; }
}
async function changeVaultPassword() {
  if (!vaultRaw) return showToast('Buka Galeri Tersembunyi dulu.', false);
  const p1 = await iosAlert({ title: 'Sandi baru', message: 'Minimal 6 karakter', input: { type: 'password' }, actions: [{ text: 'Batal', value: false }, { text: 'Lanjut', value: true, bold: true }] });
  if (!p1) return; if (p1.length < 6) return showToast('Sandi minimal 6 karakter.', false);
  const p2 = await iosAlert({ title: 'Ulangi sandi baru', input: { type: 'password' }, actions: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (p2 !== p1) return showToast('Sandi tidak sama.', false);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const w = await aesEnc(await deriveKek(p1, salt), vaultRaw);
  Object.assign(appState.vault, { salt: b64e(salt), wrapIv: w.iv, wrapped: b64e(w.ct) });
  saveStateToLocal(); showToast('Sandi Galeri Tersembunyi diganti.');
}
async function vaultMeta(item) {
  if (item._meta) return item._meta;
  const m = JSON.parse(new TextDecoder().decode(await aesDec(vaultKey, item.iv.m, b64d(item.meta))));
  Object.defineProperty(item, '_meta', { value: m, enumerable: false, configurable: true });
  return m;
}
async function vaultBlobUrl(item, which) {
  const k = item.id + ':' + which; if (vaultUrls.has(k)) return vaultUrls.get(k);
  const fid = which === 'thumb' ? item.thumbId : item.fileId;
  const token = await getIdTokenOrThrow();
  const r = await fetch('/api/files/' + fid, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Gagal memuat (' + r.status + ')');
  const plain = await aesDec(vaultKey, which === 'thumb' ? item.iv.t : item.iv.f, new Uint8Array(await r.arrayBuffer()));
  const u = URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' })); vaultUrls.set(k, u); return u;
}
async function addImageToVault(fullBlob, thumbBlob, meta, store) {
  const fe = await aesEnc(vaultKey, new Uint8Array(await fullBlob.arrayBuffer()));
  const te = await aesEnc(vaultKey, new Uint8Array(await thumbBlob.arrayBuffer()));
  const me = await aesEnc(vaultKey, new TextEncoder().encode(JSON.stringify(meta)));
  const rnd = () => 'v_' + Math.random().toString(36).slice(2, 12) + '.bin';
  const up = await apiUploadFile(new Blob([fe.ct], { type: 'application/octet-stream' }), rnd(), null, store);
  const upT = await apiUploadFile(new Blob([te.ct], { type: 'application/octet-stream' }), rnd(), null, store);
  appState.vault.items = vaultItems();
  appState.vault.items.unshift({ id: 'vt_' + Date.now() + Math.random().toString(36).slice(2, 6), fileId: up.id, thumbId: upT.id, iv: { f: fe.iv, t: te.iv, m: me.iv }, meta: b64e(me.ct), size: up.size + upT.size });
}

// ---------- UI Galeri Tersembunyi ----------
function galleryAddClick() {
  if (galleryView === 'hidden') { if (!vaultKey) return showToast('Buka Galeri Tersembunyi dulu.', false); return $('vaultFileInput').click(); }
  $('galleryFileInput').click();
}
async function onVaultPicked(e) {
  const files = Array.from(e.target.files || []); e.target.value = '';
  if (!files.length || !vaultKey) return;
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      showToast(`Mengenkripsi & mengunggah ${i + 1}/${files.length}…`);
      const exif = await readExif(files[i]); const img = await loadImage(files[i]);
      const full = await imageToJpeg(img, 2560, 0.9), thumb = await imageToJpeg(img, 480, 0.74);
      await addImageToVault(full.blob, thumb.blob, { name: files[i].name, caption: '', takenAt: exif.takenAt || files[i].lastModified || Date.now(), createdAt: Date.now(), w: full.w, h: full.h }, getDefaultStore());
      ok++;
    } catch (err) { showToast('Gagal: ' + err.message, false); }
  }
  if (ok) { saveStateToLocal(); renderGallery(); renderStoragePanel(); showToast(`${ok} foto disimpan terenkripsi di Tersembunyi 🔒`); }
  touchVault();
}
function renderVault(body) {
  body.className = '';
  if (!appState.vault) {
    body.innerHTML = `<div class="vault-panel"><div class="vault-lock"><div class="vl-icon"><i class="fas fa-user-lock"></i></div>
      <div class="t-title3">Galeri Tersembunyi</div>
      <div class="t-foot muted" style="max-width:360px; margin:6px auto 4px">Buat sandi khusus (berbeda dari PIN). Foto dienkripsi di perangkat sebelum disimpan — tanpa sandi ini tidak ada yang bisa melihatnya, termasuk dari dashboard.</div>
      <input type="password" id="vaultNewPw" placeholder="Buat sandi" autocomplete="new-password"><br>
      <input type="password" id="vaultNewPw2" placeholder="Ulangi sandi" autocomplete="new-password"><br>
      <button class="btn btn-filled mt-16" onclick="createVault($('vaultNewPw').value, $('vaultNewPw2').value)"><i class="fas fa-lock"></i> Buat & Buka</button>
      <div class="t-cap muted mt-12">Sandi tidak bisa dipulihkan jika lupa.</div></div></div>`;
    return;
  }
  if (!vaultKey) {
    body.innerHTML = `<div class="vault-panel"><form class="vault-lock" onsubmit="event.preventDefault(); submitVaultUnlock()"><div class="vl-icon"><i class="fas fa-lock"></i></div>
      <div class="t-title3">Tersembunyi</div><div class="t-foot muted">${vaultItems().length} foto terenkripsi</div>
      <input type="password" id="vaultPw" placeholder="Sandi Galeri Tersembunyi" autocomplete="current-password"><br>
      <button type="submit" class="btn btn-filled mt-16" id="vaultUnlockBtn"><i class="fas fa-unlock"></i> Buka</button></form></div>`;
    setTimeout(() => { const i = $('vaultPw'); if (i && window.innerWidth > 760) i.focus(); }, 200);
    return;
  }
  const items = vaultItems();
  body.innerHTML = `<div class="vault-panel">
    <div class="vault-head"><div><div class="t-headline"><i class="fas fa-lock-open"></i> Tersembunyi</div><div class="t-cap muted">${items.length} foto · terkunci otomatis 5 menit</div></div>
      <div class="flex gap-6"><button class="btn btn-gray btn-sm" onclick="$('vaultFileInput').click()"><i class="fas fa-plus"></i></button><button class="btn btn-gray btn-sm" onclick="changeVaultPassword()"><i class="fas fa-key"></i></button><button class="btn btn-gray btn-sm" onclick="lockVault()"><i class="fas fa-lock"></i> Kunci</button></div></div>
    ${items.length ? `<div class="g-grid">${items.map(it => `<button class="photo-cell" data-id="${esc(it.id)}"><span class="ph-load"><span class="spinner"></span></span><img alt=""></button>`).join('')}</div>`
      : `<div class="empty" style="color:rgba(235,235,245,.6)"><i class="fas fa-eye-slash"></i><div class="e-sub">Belum ada foto. Tap + atau pilih foto di Pustaka lalu "Sembunyikan".</div></div>`}</div>`;
  vaultList = items.map(i => i.id);
  body.querySelectorAll('.photo-cell').forEach(cell => {
    const it = items.find(x => x.id === cell.dataset.id);
    cell.onclick = () => openVaultViewer(it.id);
    vaultBlobUrl(it, 'thumb').then(u => { cell.querySelector('img').src = u; const l = cell.querySelector('.ph-load'); if (l) l.remove(); })
      .catch(() => { const l = cell.querySelector('.ph-load'); if (l) l.innerHTML = '<i class="fas fa-triangle-exclamation"></i>'; });
  });
  touchVault();
}
async function submitVaultUnlock() {
  const btn = $('vaultUnlockBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const ok = await unlockVault($('vaultPw').value);
  if (!ok) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock"></i> Buka'; const f = btn.closest('form'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); showToast('Sandi salah.', false); $('vaultPw').select(); }
}
async function ensureVaultOpen() {
  if (vaultKey) return true;
  if (!appState.vault) { setGalleryView('hidden'); showToast('Buat sandi Galeri Tersembunyi dulu.', false); return false; }
  const pw = await iosAlert({ title: 'Buka Tersembunyi', message: 'Masukkan sandi Galeri Tersembunyi', input: { type: 'password' }, actions: [{ text: 'Batal', value: false }, { text: 'Buka', value: true, bold: true }] });
  if (!pw) return false;
  if (!(await unlockVault(pw))) { showToast('Sandi salah.', false); return false; }
  return true;
}
/** Pindahkan foto dari Galeri ke Tersembunyi (dienkripsi ulang, file asli dihapus). */
async function hideGalleryPhotos(ids) {
  const items = ids.map(gPhoto).filter(Boolean); if (!items.length) return showToast('Pilih foto dulu.', false);
  if (!(await ensureVaultOpen())) return;
  let ok = 0;
  for (const p of items) {
    try {
      showToast(`Menyembunyikan ${ok + 1}/${items.length}…`);
      const full = await galleryBlob(p);
      const tu = await signedUrl(p.thumbId); const tr = await fetch(tu); const thumb = await tr.blob();
      await addImageToVault(full, thumb, { name: p.name, caption: p.caption || '', takenAt: p.takenAt, createdAt: p.createdAt, w: p.w, h: p.h, location: p.location || null }, storeOfId(p.fileId) || getDefaultStore());
      apiDeleteFile(p.fileId).catch(() => {}); apiDeleteFile(p.thumbId).catch(() => {});
      appState.galleryPhotos = gPhotos().filter(x => x.id !== p.id); gallerySelected.delete(p.id);
      ok++;
    } catch (err) { showToast('Gagal: ' + err.message, false); }
  }
  if (ok) { saveStateToLocal(); exitGallerySelect(); closeGalleryViewer(); renderGallery(); showToast(`${ok} foto dipindah ke Tersembunyi 🔒`); }
}
async function unhideVaultItems(ids) {
  if (!vaultKey) return;
  let ok = 0;
  for (const id of ids) {
    const it = vaultItems().find(x => x.id === id); if (!it) continue;
    try {
      const m = await vaultMeta(it);
      const fullU = await vaultBlobUrl(it, 'full'), thU = await vaultBlobUrl(it, 'thumb');
      const full = await (await fetch(fullU)).blob(), th = await (await fetch(thU)).blob();
      const store = storeOfId(it.fileId) || getDefaultStore();
      const up = await apiUploadFile(full, m.name || 'foto.jpg', null, store), upT = await apiUploadFile(th, 'thumb_' + (m.name || 'foto.jpg'), null, store);
      gPhotos().unshift({ id: 'gp_' + Date.now() + '_' + ok, fileId: up.id, thumbId: upT.id, name: m.name || 'foto.jpg', w: m.w, h: m.h, size: up.size + upT.size, takenAt: m.takenAt, createdAt: m.createdAt || Date.now(), caption: m.caption || '', location: m.location || null, albumIds: [], fav: false });
      apiDeleteFile(it.fileId).catch(() => {}); apiDeleteFile(it.thumbId).catch(() => {});
      appState.vault.items = vaultItems().filter(x => x.id !== id);
      ok++;
    } catch (err) { showToast('Gagal: ' + err.message, false); }
  }
  if (ok) { saveStateToLocal(); closeVaultViewer(); renderGallery(); showToast(`${ok} foto dikembalikan ke Pustaka.`); }
}
async function deleteVaultItems(ids) {
  if (!(await iosConfirm(`Hapus ${ids.length} foto tersembunyi?`, 'Dihapus permanen.', 'Hapus', true))) return;
  ids.forEach(id => { const it = vaultItems().find(x => x.id === id); if (it) { apiDeleteFile(it.fileId).catch(() => {}); apiDeleteFile(it.thumbId).catch(() => {}); } });
  appState.vault.items = vaultItems().filter(x => !ids.includes(x.id));
  saveStateToLocal(); closeVaultViewer(); renderGallery(); renderStoragePanel(); showToast('Foto dihapus.');
}
async function openVaultViewer(id) {
  vaultViewerId = id; $('vaultViewer').classList.add('open'); touchVault();
  const it = vaultItems().find(x => x.id === id); if (!it) return;
  $('vvSpin').classList.remove('hidden'); $('vvImg').removeAttribute('src');
  try {
    const m = await vaultMeta(it);
    const d = new Date(m.takenAt || m.createdAt || Date.now());
    $('vvDate').textContent = `${d.getDate()} ${ID_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
    const th = vaultUrls.get(it.id + ':thumb'); if (th) $('vvImg').src = th;
    $('vvImg').src = await vaultBlobUrl(it, 'full');
  } catch (err) { showToast(err.message, false); }
  $('vvSpin').classList.add('hidden');
}
function closeVaultViewer() { const v = $('vaultViewer'); if (v) v.classList.remove('open'); vaultViewerId = null; }
function stepVaultViewer(dir) { const i = vaultList.indexOf(vaultViewerId), j = i + dir; if (j >= 0 && j < vaultList.length) openVaultViewer(vaultList[j]); }
async function shareVaultItem() {
  const it = vaultItems().find(x => x.id === vaultViewerId); if (!it) return;
  const u = vaultUrls.get(it.id + ':full'); if (!u) return showToast('Tunggu foto selesai dimuat.', false);
  const m = await vaultMeta(it); shareBlobFile(await (await fetch(u)).blob(), m.name || 'foto.jpg', 'image/jpeg');
}
function openVaultItemActions() {
  const id = vaultViewerId; if (!id) return;
  openActionSheet({ title: 'Foto Tersembunyi', actions: [
    { text: 'Tampilkan di Pustaka', icon: 'fas fa-eye', onClick: () => unhideVaultItems([id]) },
    { text: 'Bagikan', icon: 'fas fa-arrow-up-from-bracket', onClick: shareVaultItem },
    { text: 'Hapus', icon: 'fas fa-trash', destructive: true, onClick: () => deleteVaultItems([id]) }
  ] });
}
(function bindVaultViewer() {
  document.addEventListener('DOMContentLoaded', () => {
    const st = $('vvStage'); if (!st) return; let x0 = null, y0 = 0;
    st.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    st.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) stepVaultViewer(dx < 0 ? 1 : -1); else if (dy > 110) closeVaultViewer(); });
    document.addEventListener('keydown', e => { if (!$('vaultViewer').classList.contains('open')) return; if (e.key === 'ArrowRight') stepVaultViewer(1); if (e.key === 'ArrowLeft') stepVaultViewer(-1); if (e.key === 'Escape') closeVaultViewer(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && vaultKey) lockVault(); });
  });
})();

// ---------- EDITOR FOTO: putar & potong ----------
let pe = null;
async function openPhotoEditor(id) {
  const p = gPhoto(id); if (!p) return;
  try {
    showToast('Memuat foto…');
    const img = await loadImage(await galleryBlob(p));
    pe = { id, img, rot: 0, aspect: null, crop: { x: 0, y: 0, w: 1, h: 1 } };
    openSheet('sheetPhotoEdit');
    $('peAspect').querySelectorAll('button').forEach(b => { b.classList.toggle('active', b.dataset.a === 'free'); b.onclick = () => peSetAspect(b.dataset.a); });
    setTimeout(peDraw, 60);
    bindPeCrop();
  } catch (err) { showToast(err.message, false); }
}
function closePhotoEditor() { closeSheet('sheetPhotoEdit'); pe = null; }
function peDims() { const r = pe.rot % 180 !== 0; return { w: r ? pe.img.naturalHeight : pe.img.naturalWidth, h: r ? pe.img.naturalWidth : pe.img.naturalHeight }; }
function peRender(canvas, maxW, maxH) {
  const d = peDims(), sc = Math.min(1, maxW / d.w, maxH / d.h);
  canvas.width = Math.round(d.w * sc); canvas.height = Math.round(d.h * sc);
  const c = canvas.getContext('2d'); c.save(); c.translate(canvas.width / 2, canvas.height / 2); c.rotate(pe.rot * Math.PI / 180);
  const iw = pe.img.naturalWidth * sc, ih = pe.img.naturalHeight * sc; c.drawImage(pe.img, -iw / 2, -ih / 2, iw, ih); c.restore();
}
function peDraw() {
  if (!pe) return;
  const stage = $('peStage'), cv = $('peCanvas');
  peRender(cv, stage.clientWidth, stage.clientHeight);
  const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), box = $('peCrop');
  box.style.left = (r.left - sr.left + pe.crop.x * r.width) + 'px'; box.style.top = (r.top - sr.top + pe.crop.y * r.height) + 'px';
  box.style.width = (pe.crop.w * r.width) + 'px'; box.style.height = (pe.crop.h * r.height) + 'px';
}
function peRotate(deg) { if (!pe) return; pe.rot = (pe.rot + deg + 360) % 360; pe.crop = { x: 0, y: 0, w: 1, h: 1 }; if (pe.aspect) peSetAspect(String(pe.aspect)); else peDraw(); }
function peReset() { if (!pe) return; pe.rot = 0; pe.aspect = null; pe.crop = { x: 0, y: 0, w: 1, h: 1 }; $('peAspect').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.a === 'free')); peDraw(); }
function peSetAspect(a) {
  if (!pe) return;
  $('peAspect').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.a === a));
  pe.aspect = a === 'free' ? null : parseFloat(a);
  if (pe.aspect) {
    const d = peDims(), imgA = d.w / d.h; let w = 1, h = 1;
    if (pe.aspect > imgA) h = imgA / pe.aspect; else w = pe.aspect / imgA;
    pe.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }
  peDraw();
}
function bindPeCrop() {
  const box = $('peCrop'); if (box.dataset.bound) return; box.dataset.bound = '1';
  let drag = null;
  const start = e => {
    if (!pe) return; e.preventDefault();
    const t = e.target.classList.contains('pe-h') ? [...e.target.classList].find(c => c.length === 2) : 'move';
    const r = $('peCanvas').getBoundingClientRect();
    drag = { t, x0: e.clientX, y0: e.clientY, c: { ...pe.crop }, rw: r.width, rh: r.height };
    box.setPointerCapture && box.setPointerCapture(e.pointerId);
  };
  const move = e => {
    if (!drag || !pe) return;
    const dx = (e.clientX - drag.x0) / drag.rw, dy = (e.clientY - drag.y0) / drag.rh, c = { ...drag.c }, min = 0.08;
    if (drag.t === 'move') { c.x = Math.min(1 - c.w, Math.max(0, c.x + dx)); c.y = Math.min(1 - c.h, Math.max(0, c.y + dy)); }
    else {
      if (drag.t.includes('l')) { const nx = Math.min(c.x + c.w - min, Math.max(0, c.x + dx)); c.w += c.x - nx; c.x = nx; }
      if (drag.t.includes('r')) c.w = Math.min(1 - c.x, Math.max(min, c.w + dx));
      if (drag.t.includes('t')) { const ny = Math.min(c.y + c.h - min, Math.max(0, c.y + dy)); c.h += c.y - ny; c.y = ny; }
      if (drag.t.includes('b')) c.h = Math.min(1 - c.y, Math.max(min, c.h + dy));
      if (pe.aspect) { const d = peDims(); const want = pe.aspect * d.h / d.w; c.h = Math.min(1 - c.y, c.w / want); c.w = c.h * want; }
    }
    pe.crop = c; peDraw();
  };
  box.addEventListener('pointerdown', start);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('resize', () => { if (pe) peDraw(); });
}
async function savePhotoEdit() {
  if (!pe) return;
  const p = gPhoto(pe.id); if (!p) return closePhotoEditor();
  const btn = $('peSaveBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner" style="display:inline-block"></span>';
  try {
    const full = document.createElement('canvas'); peRender(full, 4096, 4096);
    const c = pe.crop, sx = Math.round(c.x * full.width), sy = Math.round(c.y * full.height), sw = Math.round(c.w * full.width), sh = Math.round(c.h * full.height);
    const out = document.createElement('canvas'); out.width = sw; out.height = sh; out.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.9));
    const img = await loadImage(blob); const thumb = await imageToJpeg(img, 480, 0.74);
    const store = storeOfId(p.fileId) || getDefaultStore();
    const up = await apiUploadFile(blob, p.name || 'foto.jpg', null, store), upT = await apiUploadFile(thumb.blob, 'thumb_' + (p.name || 'foto.jpg'), null, store);
    const old = [p.fileId, p.thumbId];
    Object.assign(p, { fileId: up.id, thumbId: upT.id, w: sw, h: sh, size: up.size + upT.size });
    saveStateToLocal(); old.forEach(f => apiDeleteFile(f).catch(() => {}));
    closePhotoEditor(); renderGallery();
    if (galleryViewerId === p.id) showViewerPhoto();
    showToast('Foto diperbarui ✓');
  } catch (err) { showToast('Gagal menyimpan: ' + err.message, false); }
  btn.disabled = false; btn.textContent = 'Simpan';
}
