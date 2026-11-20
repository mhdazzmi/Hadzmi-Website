/* =========================================================
   15 · WALLET — kartu member ala Apple Wallet, QR / barcode bisa di-scan dari layar
   Teks kartu disimpan di Firebase; foto kartu di R2/Drive (link privat).
   ========================================================= */
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const BARCODE_LIB = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
const JSQR_LIB = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const WALLET_COLORS = ['#1C1C1E', '#102554', '#0A84FF', '#30B0C7', '#34C759', '#FF9500', '#FF3B30', '#FF2D55', '#AF52DE', '#A2845E'];
let walletOpenId = null, walletPending = { front: null, back: null }, walletColor = WALLET_COLORS[1], wakeLock = null;

function wCards() { return appState.walletCards || (appState.walletCards = []); }
function wCard(id) { return wCards().find(c => c.id === id); }
// Nomor kartu (angka saja, ≥8 digit) diformat per 4 & disamarkan; selain itu (plat nomor, kode member huruf) tampil apa adanya.
function isCardNum(n) { return /^\d{8,}$/.test(String(n || '').replace(/[\s-]+/g, '')); }
function cleanNum(n) { return String(n || '').trim().replace(/\s+/g, ' '); }
function maskNum(n) { if (!isCardNum(n)) return cleanNum(n); const s = String(n).replace(/[\s-]+/g, ''); return '•••• ' + s.slice(-4); }
function groupNum(n) { if (!isCardNum(n)) return cleanNum(n); return String(n).replace(/[\s-]+/g, '').replace(/(.{4})/g, '$1 ').trim(); }
function wCardHTML(c, opts = {}) {
  const img = c.frontId ? signedUrlSync(c.frontId) : (opts.frontPreview || '');
  const hasPhoto = !!(c.frontId || opts.frontPreview);
  const codeIcon = c.codeType && c.codeType !== 'none' && c.code ? `<i class="fas ${c.codeType === 'qr' ? 'fa-qrcode' : 'fa-barcode'}"></i>` : '';
  const num = opts.full ? groupNum(c.number) : maskNum(c.number);
  // Kartu berfoto: foto tampil bersih seperti Apple Wallet (teks aslinya sudah ada di foto); info lengkap ada di detail.
  if (hasPhoto && !c.textOver) {
    return `<div class="wcard has-img photo-only" aria-label="${esc(c.name || 'Kartu')}" style="background:linear-gradient(145deg, ${c.color || '#102554'}, ${shade(c.color || '#102554', -28)})" ${opts.onclick ? `onclick="${opts.onclick}"` : ''}>
      ${img ? `<img class="wc-bg" src="${esc(img)}" alt="">` : '<span class="wc-loading"><span class="spinner"></span></span>'}
    </div>`;
  }
  return `<div class="wcard ${hasPhoto ? 'has-img text-over' : ''}" style="background:linear-gradient(145deg, ${c.color || '#102554'}, ${shade(c.color || '#102554', -28)})" ${opts.onclick ? `onclick="${opts.onclick}"` : ''}>
    ${img ? `<img class="wc-bg" src="${esc(img)}" alt=""><div class="wc-shade"></div>` : ''}
    <div class="wc-top"><div class="wc-plate"><div class="wc-issuer">${esc(c.issuer || '')}</div><div class="wc-name">${esc(c.name || 'Kartu')}</div></div>${codeIcon ? `<span class="wc-icon">${codeIcon}</span>` : ''}</div>
    <div class="wc-plate">${isCardNum(c.number) ? '<div class="wc-chip"></div>' : ''}<div class="wc-num" style="margin-top:10px">${esc(num)}</div>
      <div class="flex justify-between items-end gap-12"><div class="wc-holder truncate">${esc(c.holder || '')}</div>${c.expiry ? `<div class="wc-exp"><small>VALID THRU</small>${esc(c.expiry)}</div>` : ''}</div></div>
  </div>`;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, v + amt));
  return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}
function renderWallet() {
  const box = $('walletStack'); if (!box) return;
  const cards = wCards();
  if ($('walletCount')) $('walletCount').textContent = `${cards.length} kartu`;
  if (!cards.length) { box.innerHTML = `<div class="card w-full"><div class="empty"><i class="fas fa-wallet"></i><div class="e-title">Wallet masih kosong</div><div class="e-sub">Tambahkan kartu member, kartu anggota, voucher, dll. QR/barcode-nya bisa langsung di-scan dari layar HP.</div></div></div>`; return; }
  box.innerHTML = cards.map(c => `<div class="wc-slot">${wCardHTML(c, { onclick: `openWalletCard('${esc(c.id)}')` })}</div>`).join('');
  const missing = cards.map(c => c.frontId).filter(id => id && !signedUrlSync(id));
  if (missing.length && firebaseAuth && firebaseAuth.currentUser && pushConfig) signIds(missing).then(() => { if (missing.some(id => signedUrlSync(id))) renderWallet(); });
}

// ---------- Kode QR / barcode ----------
async function renderCodeInto(el, type, value) {
  el.innerHTML = '';
  if (!value || type === 'none') return false;
  try {
    if (type === 'qr') {
      await loadScriptOnce(QR_LIB);
      const qr = qrcode(0, 'M'); qr.addData(String(value)); qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } else {
      await loadScriptOnce(BARCODE_LIB);
      el.innerHTML = '<svg></svg>';
      JsBarcode(el.querySelector('svg'), String(value), { format: type === 'ean13' ? 'EAN13' : 'CODE128', displayValue: false, height: 100, width: 2.6, margin: 12, background: '#ffffff' });
    }
    return true;
  } catch (err) {
    el.innerHTML = `<div class="t-foot c-red">${type === 'ean13' ? 'EAN-13 harus 12–13 angka yang valid.' : 'Kode tidak valid.'}</div>`;
    return false;
  }
}

// ---------- Detail & mode scan ----------
function openWalletCard(id) {
  const c = wCard(id); if (!c) return;
  walletOpenId = id;
  $('wdTitle').textContent = c.name;
  const hasBack = !!c.backId;
  $('wdBody').innerHTML = `
    <div id="wdCardWrap" style="display:flex; justify-content:center">${wCardHTML(c, { full: true, onclick: hasBack ? 'flipWalletCard()' : '' })}</div>
    ${hasBack ? '<div class="t-cap muted center">Tap kartu untuk melihat sisi belakang</div>' : ''}
    ${c.codeType && c.codeType !== 'none' && c.code ? `<div class="wd-code ${c.codeType !== 'qr' ? 'barcode' : ''}" onclick="openWalletScan()"><div id="wdCode"></div><div class="wd-val">${esc(c.code)}</div></div>
      <button class="btn btn-dark btn-block btn-lg" onclick="openWalletScan()"><i class="fas fa-expand"></i> Mode Scan (layar penuh)</button>` : ''}
    <div class="list inset-icon">
      ${c.number ? `<button class="row" onclick="copyText('${esc(c.number)}'); showToast('Nomor disalin')"><span class="icon-tile bg-blue"><i class="fas fa-hashtag"></i></span><div class="flex-1"><div class="row-sub">Nomor</div><div class="row-title tabular">${esc(groupNum(c.number))}</div></div><i class="far fa-copy chev"></i></button>` : ''}
      ${c.holder ? `<div class="row"><span class="icon-tile bg-gray"><i class="fas fa-user"></i></span><div class="flex-1"><div class="row-sub">Atas nama</div><div class="row-title">${esc(c.holder)}</div></div></div>` : ''}
      ${c.expiry ? `<div class="row"><span class="icon-tile bg-indigo"><i class="fas fa-calendar"></i></span><div class="flex-1"><div class="row-sub">Berlaku sampai</div><div class="row-title tabular">${esc(c.expiry)}</div></div></div>` : ''}
      ${c.cvv ? `<button class="row" onclick="toggleCvv(this, '${esc(c.cvv)}')"><span class="icon-tile bg-red"><i class="fas fa-shield-halved"></i></span><div class="flex-1"><div class="row-sub">CVV · tap untuk lihat</div><div class="row-title tabular" data-cvv>•••</div></div><i class="fas fa-eye chev"></i></button>` : ''}
      ${c.note ? `<div class="row"><span class="icon-tile bg-orange"><i class="fas fa-note-sticky"></i></span><div class="flex-1"><div class="row-sub">Catatan</div><div class="row-title">${linkify(c.note)}</div></div></div>` : ''}
    </div>`;
  openSheet('sheetWalletCard');
  if (c.code && c.codeType !== 'none') renderCodeInto($('wdCode'), c.codeType, c.code);
  if ((c.frontId && !signedUrlSync(c.frontId)) || (c.backId && !signedUrlSync(c.backId))) signIds([c.frontId, c.backId].filter(Boolean)).then(() => { if (walletOpenId === id) $('wdCardWrap').innerHTML = wCardHTML(c, { full: true, onclick: hasBack ? 'flipWalletCard()' : '' }); });
}
let walletShowingBack = false;
function flipWalletCard() {
  const c = wCard(walletOpenId); if (!c || !c.backId) return;
  walletShowingBack = !walletShowingBack;
  const u = signedUrlSync(walletShowingBack ? c.backId : c.frontId);
  $('wdCardWrap').innerHTML = walletShowingBack
    ? `<div class="wcard has-img" style="background:#222" onclick="flipWalletCard()">${u ? `<img class="wc-bg" src="${esc(u)}" alt="">` : ''}</div>`
    : wCardHTML(c, { full: true, onclick: 'flipWalletCard()' });
}
function toggleCvv(btn, v) {
  const el = btn.querySelector('[data-cvv]'), shown = el.textContent !== '•••';
  el.textContent = shown ? '•••' : v;
  btn.querySelector('.chev').className = `fas ${shown ? 'fa-eye' : 'fa-eye-slash'} chev`;
  if (!shown) setTimeout(() => { if (el.isConnected) { el.textContent = '•••'; btn.querySelector('.chev').className = 'fas fa-eye chev'; } }, 10000);
}
function formatCardExpiry(inp) {
  let d = inp.value.replace(/\D/g, '').slice(0, 4);
  if (d.length === 1 && +d > 1) d = '0' + d;
  inp.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
}
function closeWalletCard() { closeSheet('sheetWalletCard'); walletOpenId = null; walletShowingBack = false; }
async function openWalletScan() {
  const c = wCard(walletOpenId); if (!c || !c.code) return;
  $('wsName').textContent = c.name; $('wsText').textContent = c.code;
  $('walletScan').classList.remove('hidden');
  await renderCodeInto($('wsCode'), c.codeType, c.code);
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function closeWalletScan() { $('walletScan').classList.add('hidden'); try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

// ---------- Tambah / edit ----------
function openWalletEditor(id) {
  const c = id ? wCard(id) : null;
  closeSheet('sheetWalletCard');
  $('wcId').value = c ? c.id : '';
  $('walletEditTitle').textContent = c ? 'Edit Kartu' : 'Kartu Baru';
  ['Name', 'Issuer', 'Number', 'Holder', 'Code', 'Note', 'Expiry', 'Cvv'].forEach(k => { $('wc' + k).value = c ? (c[k.toLowerCase()] || '') : ''; });
  $('wcCodeType').value = c ? (c.codeType || 'qr') : 'qr';
  $('wcTextOver').checked = !!(c && c.textOver);
  walletColor = c ? (c.color || WALLET_COLORS[1]) : WALLET_COLORS[1];
  walletPending = { front: null, back: null };
  $('wcFrontLabel').textContent = c && c.frontId ? 'Foto depan tersimpan ✓ — tap untuk ganti' : 'Foto sisi depan (opsional)';
  $('wcBackLabel').textContent = c && c.backId ? 'Foto belakang tersimpan ✓ — tap untuk ganti' : 'Foto sisi belakang (opsional)';
  $('wcDeleteBtn').classList.toggle('hidden', !c);
  $('wcColors').innerHTML = WALLET_COLORS.map(col => `<button type="button" class="swatch ${col === walletColor ? 'active' : ''}" style="background:${col}" data-c="${col}"></button>`).join('');
  $('wcColors').querySelectorAll('button').forEach(b => b.onclick = () => { walletColor = b.dataset.c; $('wcColors').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderWalletPreview(); });
  renderWalletPreview();
  openSheet('sheetWalletEdit');
}
function walletDraft() {
  const id = $('wcId').value, old = id ? wCard(id) : {};
  return { ...old, name: $('wcName').value.trim(), issuer: $('wcIssuer').value.trim(), number: $('wcNumber').value.trim(), holder: $('wcHolder').value.trim(), codeType: $('wcCodeType').value, code: $('wcCode').value.trim(), note: $('wcNote').value.trim(), expiry: $('wcExpiry').value.trim(), cvv: $('wcCvv').value.trim(), textOver: $('wcTextOver').checked, color: walletColor };
}
function renderWalletPreview() {
  const d = walletDraft();
  $('wcPreview').innerHTML = `<div style="display:flex; justify-content:center">${wCardHTML(d, { full: true, frontPreview: walletPending.front ? walletPending.front.url : '' })}</div>`;
}
async function pickWalletImage(e, side) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const img = await loadImage(f); const r = await imageToJpeg(img, 1400, 0.88);
    if (walletPending[side]) URL.revokeObjectURL(walletPending[side].url);
    walletPending[side] = { blob: r.blob, url: URL.createObjectURL(r.blob) };
    $(side === 'front' ? 'wcFrontLabel' : 'wcBackLabel').textContent = `Foto ${side === 'front' ? 'depan' : 'belakang'} dipilih ✓`;
    renderWalletPreview();
    // Coba baca QR otomatis dari foto kartu
    if (!$('wcCode').value.trim()) { const found = await decodeQrFromImage(img); if (found) { $('wcCode').value = found; $('wcCodeType').value = 'qr'; renderWalletPreview(); showToast('QR terbaca otomatis dari foto ✓'); } }
  } catch (err) { showToast(err.message, false); }
}
async function decodeQrFromImage(img) {
  try {
    await loadScriptOnce(JSQR_LIB);
    const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const res = jsQR(data.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    return res && res.data ? res.data : null;
  } catch (e) { return null; }
}
async function scanQrFromPhoto(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  showToast('Membaca QR…');
  const found = await decodeQrFromImage(await loadImage(f));
  if (found) { $('wcCode').value = found; $('wcCodeType').value = 'qr'; renderWalletPreview(); showToast('QR terbaca ✓'); }
  else showToast('QR tidak terbaca. Pastikan foto tajam & QR terlihat penuh.', false);
}
async function saveWalletCard() {
  const d = walletDraft();
  if (!d.name) return showToast('Nama kartu wajib diisi.', false);
  if (d.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(d.expiry)) return showToast('Format berlaku: BB/TT (mis. 08/29).', false);
  if (d.cvv && !/^\d{3,4}$/.test(d.cvv)) return showToast('CVV harus 3–4 angka.', false);
  if (d.codeType === 'ean13' && d.code && !/^\d{12,13}$/.test(d.code)) return showToast('EAN-13 harus 12–13 angka.', false);
  const btn = $('walletSaveBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner dark" style="display:inline-block"></span>';
  try {
    const old = [];
    for (const side of ['front', 'back']) {
      const p = walletPending[side]; if (!p) continue;
      const up = await apiUploadFile(p.blob, `kartu-${side}.jpg`, null, getDefaultStore());
      if (d[side + 'Id']) old.push(d[side + 'Id']);
      d[side + 'Id'] = up.id;
    }
    if (d.id) Object.assign(wCard(d.id), d);
    else wCards().unshift(Object.assign(d, { id: 'wc_' + Date.now(), createdAt: Date.now() }));
    saveStateToLocal(); old.forEach(f => apiDeleteFile(f).catch(() => {}));
    if (d.frontId || d.backId) await signIds([d.frontId, d.backId].filter(Boolean));
    closeSheet('sheetWalletEdit'); renderWallet(); showToast('Kartu tersimpan di Wallet ✓');
  } catch (err) { showToast('Gagal: ' + err.message, false); }
  btn.disabled = false; btn.textContent = 'Simpan';
}
async function deleteWalletCard(id) {
  const c = wCard(id); if (!c) return;
  if (!(await iosConfirm(`Hapus "${c.name}"?`, 'Kartu dihapus dari Wallet di semua perangkat.', 'Hapus', true))) return;
  [c.frontId, c.backId].filter(Boolean).forEach(f => apiDeleteFile(f).catch(() => {}));
  appState.walletCards = wCards().filter(x => x.id !== id);
  saveStateToLocal(); closeSheet('sheetWalletEdit'); renderWallet(); showToast('Kartu dihapus.');
}
