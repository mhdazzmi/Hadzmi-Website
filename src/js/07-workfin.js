/* =========================================================
   07 · WORK & FINANCE — Contacts WA, Upload log, Cash Ledger, Focus/Sleep
   ========================================================= */

// ---------------- CONTACTS & WA ----------------
function openContactSheet() { resetContactForm(); openSheet('sheetContact'); setTimeout(() => $('contactName').focus(), 350); }
function updateContactAvatarPreview() {
  const name = $('contactName').value.trim(); const av = $('contactAvatarPreview');
  av.style.background = name ? colorFor(name) : 'var(--green)';
  av.innerHTML = name ? esc(initials(name)) : '<i class="fas fa-user"></i>';
}
function saveContactRecord(e) {
  e.preventDefault();
  const name = $('contactName').value.trim(), phone = $('contactPhone').value.trim(), role = $('contactRole').value.trim();
  const editId = $('contactEditId') ? $('contactEditId').value : '';
  if (!name || !phone) return;
  if (editId) {
    const existing = appState.contacts.find(c => c.id === editId);
    if (existing) { existing.name = name; existing.phone = phone; existing.role = role; }
    showToast('WA Contact updated & synced!');
  } else {
    appState.contacts.unshift({ id: 'ct_' + Date.now(), name, phone, role });
    showToast('WA Contact saved & synced!');
  }
  saveStateToLocal(); renderContactsList(); resetContactForm();
  closeSheet('sheetContact');
}
function editContactRecord(id) {
  const c = appState.contacts.find(x => x.id === id); if (!c) return;
  $('contactEditId').value = c.id; $('contactName').value = c.name || ''; $('contactPhone').value = c.phone || ''; $('contactRole').value = c.role || '';
  $('contactFormTitle').textContent = 'Edit Kontak';
  $('contactSubmitBtn').textContent = 'Update';
  updateContactAvatarPreview();
  openSheet('sheetContact');
}
function resetContactForm() {
  const form = $('contactForm'); if (form) form.reset();
  $('contactEditId').value = '';
  $('contactFormTitle').textContent = 'Kontak Baru';
  $('contactSubmitBtn').textContent = 'Simpan';
  updateContactAvatarPreview();
}
function waNumber(phone) {
  let clean = String(phone || '').replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  return clean;
}
function renderContactsList() {
  const container = $('contactsGridContainer'); if (!container) return;
  const search = ($('searchContactInput').value || '').toLowerCase();
  const filtered = appState.contacts.filter(c => (c.name + ' ' + c.phone + ' ' + (c.role || '')).toLowerCase().includes(search))
    .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><i class="fas fa-address-book"></i><div class="e-title">Belum ada kontak</div><div class="e-sub">Tambah kontak WhatsApp dengan tombol + Baru.</div></div>`;
    return;
  }
  let lastLetter = '';
  container.innerHTML = filtered.map(c => {
    const letter = (c.name || '#')[0].toUpperCase();
    const header = letter !== lastLetter ? `<div class="row-wrap" style="padding:6px 16px 2px; background:var(--fill3); font-size:13px; font-weight:600; color:var(--label2)">${esc(letter)}</div>` : '';
    lastLetter = letter;
    const id = esc(c.id);
    return `${header}
      <div class="row">
        <span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span>
        <div class="flex-1 tappable" onclick="editContactRecord('${id}')" style="cursor:pointer">
          <div class="row-title semibold truncate">${esc(c.name)}</div>
          <div class="row-sub truncate">${esc(c.phone)}${c.role ? ' · ' + esc(c.role) : ''}</div>
        </div>
        <a href="tel:${esc(c.phone)}" class="icon-btn sm blue" title="Telepon"><i class="fas fa-phone"></i></a>
        <a href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener" class="btn btn-green btn-xs" style="color:#fff"><i class="fab fa-whatsapp"></i> Chat</a>
        <button type="button" onclick="deleteContactRecord('${id}')" class="icon-btn sm clear" style="color:var(--red)" title="Hapus"><i class="far fa-trash-can"></i></button>
      </div>`;
  }).join('');
}
async function deleteContactRecord(id) {
  if (await iosConfirm('Hapus kontak WhatsApp ini?', (appState.contacts.find(c => c.id === id) || {}).name || '', 'Hapus', true)) {
    appState.contacts = appState.contacts.filter(c => c.id !== id);
    saveStateToLocal(); renderContactsList(); showToast('Contact deleted.');
  }
}

// ---------------- UPLOAD KE GOOGLE DRIVE (logika sama dengan uploader lama "ulad") ----------------
const DRIVE_UPLOAD_URL = "https://script.google.com/macros/s/AKfycbxtVei4HVuq0WWAO54IVthwl1AJIbSqXstWOogjobEqQkZBs_-VcNxMiZ9iDodzJ5X9bg/exec";
function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
function logUploadedFile(file) {
  const fileSize = (file.size / 1024).toFixed(1) + ' KB'; const fileDate = new Date().toLocaleDateString('en-US');
  appState.uploads.unshift({ id: 'up_' + Date.now() + Math.random().toString(36).slice(2, 5), name: file.name, size: fileSize, type: file.type || 'Document', date: fileDate });
}
function renderDriveSelection() {
  const input = $('fileInput'), list = $('driveFileList');
  const files = Array.from(input.files || []);
  $('driveDropTitle').textContent = files.length ? `${files.length} file dipilih` : 'Pilih file';
  $('driveDropSub').textContent = files.length ? formatBytes(files.reduce((n, f) => n + f.size, 0)) + ' total · tap untuk ganti' : 'Bisa pilih banyak file sekaligus';
  list.classList.toggle('hidden', !files.length);
  list.innerHTML = files.map((f, i) => {
    const [ic, bg] = fileIconFor(f.type, f.name);
    return `<div class="row" style="background:transparent" id="driveRow${i}"><span class="icon-tile ${bg}"><i class="fas ${ic}"></i></span><div class="flex-1"><div class="row-title truncate">${esc(f.name)}</div><div class="row-sub">${formatBytes(f.size)}</div></div><span class="t-cap muted" id="driveRowState${i}"></span></div>`;
  }).join('');
  if ($('statusText')) $('statusText').textContent = '';
}
function setDriveStatus(text, color) { const el = $('statusText'); el.textContent = text; el.style.color = color || ''; }
function startDriveUpload() {
  const uploadBtn = $('uploadBtn'), fileInput = $('fileInput'), customNameInput = $('customName');
  if (!fileInput.files.length) { iosAlert({ title: 'Pilih minimal 1 file!' }); return; }
  const files = Array.from(fileInput.files);
  let index = 0;
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '<span class="spinner"></span> Uploading...';
  setDriveStatus('', 'var(--blue)');

  function uploadNext() {
    if (index >= files.length) {
      setDriveStatus('YEAYYY! File berhasil di-upload!', 'var(--green)');
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fas fa-arrow-up-from-bracket"></i> Upload';
      saveStateToLocal(); renderUploadHistory();
      fileInput.value = ""; customNameInput.value = '';
      setTimeout(renderDriveSelection, 2500);
      showToast(`${files.length} file berhasil di-upload ke Drive!`);
      return;
    }
    const file = files[index];
    const reader = new FileReader();
    setDriveStatus(files.length > 1 ? `Mohon menunggu yaaa... (${index + 1}/${files.length})` : 'Mohon menunggu yaaa...', 'var(--blue)');
    const st = $('driveRowState' + index); if (st) st.innerHTML = '<span class="spinner dark" style="display:inline-block"></span>';

    reader.onload = function () {
      const base64Data = reader.result.split(",")[1];
      const ext = file.name.split(".").pop();
      let finalCustomName = "";
      if (customNameInput.value.trim() !== "") {
        if (files.length > 1) finalCustomName = `${customNameInput.value}-${index + 1}.${ext}`;
        else finalCustomName = `${customNameInput.value}.${ext}`;
      }
      fetch(DRIVE_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ filename: file.name, customName: finalCustomName, mimeType: file.type, fileData: base64Data })
      })
        .then(() => {
          const st2 = $('driveRowState' + index); if (st2) st2.innerHTML = '<i class="fas fa-circle-check c-green"></i>';
          logUploadedFile({ name: finalCustomName || file.name, size: file.size, type: file.type });
          index++;
          uploadNext();
        })
        .catch(err => {
          console.error(err);
          const st3 = $('driveRowState' + index); if (st3) st3.innerHTML = '<i class="fas fa-circle-xmark c-red"></i>';
          setDriveStatus('Waduh, file gagal diupload!', 'var(--red)');
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = '<i class="fas fa-arrow-up-from-bracket"></i> Upload';
          if (index > 0) { saveStateToLocal(); renderUploadHistory(); }
        });
    };
    reader.readAsDataURL(file);
  }
  uploadNext();
}
function fileIconFor(type, name) {
  const t = (type || '') + ' ' + (name || '');
  if (/image|\.(png|jpe?g|gif|webp|heic)/i.test(t)) return ['fa-file-image', 'bg-pink'];
  if (/pdf/i.test(t)) return ['fa-file-pdf', 'bg-red'];
  if (/sheet|excel|csv|\.xlsx?/i.test(t)) return ['fa-file-excel', 'bg-green'];
  if (/word|\.docx?/i.test(t)) return ['fa-file-word', 'bg-blue'];
  if (/audio|\.(mp3|m4a|wav)/i.test(t)) return ['fa-file-audio', 'bg-purple'];
  if (/video/i.test(t)) return ['fa-file-video', 'bg-indigo'];
  if (/zip|rar|7z/i.test(t)) return ['fa-file-zipper', 'bg-brown'];
  return ['fa-file-lines', 'bg-cyan'];
}
function renderUploadHistory() {
  const container = $('uploadHistoryList'); if (!container) return;
  if (appState.uploads.length === 0) { container.innerHTML = `<div class="empty"><i class="fas fa-clock-rotate-left"></i><div class="e-sub">Belum ada riwayat upload.</div></div>`; return; }
  container.innerHTML = appState.uploads.map(u => {
    const [ic, bg] = fileIconFor(u.type, u.name);
    return `<div class="row"><span class="icon-tile ${bg}"><i class="fas ${ic}"></i></span><div class="flex-1"><div class="row-title truncate">${esc(u.name)}</div><div class="row-sub">${esc(u.size)} · ${esc(u.date)}</div></div></div>`;
  }).join('');
}
async function clearUploadHistory() {
  if (!appState.uploads.length) return;
  if (!(await iosConfirm('Hapus riwayat upload?', `${appState.uploads.length} catatan file akan dihapus.`, 'Hapus', true))) return;
  appState.uploads = []; saveStateToLocal(); renderUploadHistory(); showToast('Upload history cleared.');
}
function bindDrop(id, onFiles) {
  const dz = $(id); if (!dz) return;
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) onFiles(fl); });
}
function initDropzone() {
  bindDrop('uploadDropzone', fl => { $('fileInput').files = fl; renderDriveSelection(); });
  bindDrop('docDropzone', fl => uploadDocFiles(Array.from(fl)));
}

// ---------------- SELISIH KAS ----------------
function parseRupiahInput(v) { return parseFloat(String(v || '').replace(/[^0-9]/g, '')); }
function formatRupiahInput(el) {
  const n = parseRupiahInput(el.value);
  el.value = isNaN(n) ? '' : n.toLocaleString('id-ID');
}
function setKasJenis(v) {
  $('kasJenis').value = v;
  $('kasJenisSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
}
function resetKasFilter() { $('kasFilterAwal').value = ''; $('kasFilterAkhir').value = ''; renderKasData(); }
function saveKasRecord(e) {
  e.preventDefault();
  const tgl = $('kasTanggal').value, jenis = $('kasJenis').value;
  const jumlah = parseRupiahInput($('kasJumlah').value), ket = $('kasKeterangan').value.trim();
  const jam = $('kasJam') ? $('kasJam').value : '';
  if (!tgl || isNaN(jumlah) || jumlah <= 0) return showToast('Tanggal dan nominal wajib diisi!', false);
  appState.kas.unshift({ id: 'kas_' + Date.now(), tanggal: tgl, jam: jam || '', jenis, jumlah, keterangan: ket });
  saveStateToLocal(); renderKasData(); renderDashboardStats();
  $('tellerKasForm').reset(); setKasJenis('Kurang'); $('kasTanggal').value = wibDateStr();
  showToast(`Selisih ${jenis.toLowerCase()} ${rupiah(jumlah)} tersimpan & tersinkron!`);
}
function getFilteredKas() {
  const a = $('kasFilterAwal') ? $('kasFilterAwal').value : '', b = $('kasFilterAkhir') ? $('kasFilterAkhir').value : '';
  return appState.kas.filter(k => { if (a && k.tanggal < a) return false; if (b && k.tanggal > b) return false; return true; });
}
function renderKasData() {
  const list = $('kasTableBody'); if (!list) return;
  let totalLebih = 0, totalKurang = 0;
  const filtered = getFilteredKas();
  filtered.forEach(k => { if (k.jenis === 'Lebih') totalLebih += k.jumlah; else totalKurang += k.jumlah; });
  list.innerHTML = filtered.length === 0
    ? `<div class="empty"><i class="fas fa-receipt"></i><div class="e-sub">Belum ada catatan selisih${$('kasFilterAwal').value || $('kasFilterAkhir').value ? ' pada periode ini' : ''}.</div></div>`
    : filtered.map(k => {
      const plus = k.jenis === 'Lebih';
      return `<div class="row">
        <span class="icon-tile ${plus ? 'bg-green' : 'bg-red'}"><i class="fas ${plus ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i></span>
        <div class="flex-1"><div class="row-title truncate">${esc(k.keterangan || (plus ? 'Kelebihan kas' : 'Kekurangan kas'))}</div><div class="row-sub">${esc(prettyDate(k.tanggal, true))}${k.jam ? ' · ' + esc(k.jam) : ''} · ${esc(k.jenis)}</div></div>
        <span class="money ${plus ? 'c-green' : 'c-red'}">${plus ? '+' : '−'}${esc(rupiah(k.jumlah))}</span>
        <button onclick="deleteKasRecord('${esc(k.id)}')" class="icon-btn sm clear" style="color:var(--label3)" title="Hapus"><i class="fas fa-xmark"></i></button>
      </div>`;
    }).join('');
  $('kasTotalLebih').textContent = rupiah(totalLebih);
  $('kasTotalKurang').textContent = rupiah(totalKurang);
  $('kasTotalNet').textContent = rupiah(totalLebih - totalKurang);
  if ($('kasCountLabel')) $('kasCountLabel').textContent = `${filtered.length} entri`;
}
async function deleteKasRecord(id) {
  const k = appState.kas.find(x => x.id === id); if (!k) return;
  if (!(await iosConfirm('Hapus entri kas?', `${k.jenis} ${rupiah(k.jumlah)} · ${k.tanggal}`, 'Hapus', true))) return;
  appState.kas = appState.kas.filter(x => x.id !== id);
  saveStateToLocal(); renderKasData(); renderDashboardStats(); showToast('Ledger entry deleted.');
}

// ---------------- FOCUS ROOM & SLEEP TRACKER ----------------
let focusMode = 'timer';
let focusTimerInterval = null;
let focusTimeSeconds = 25 * 60;
let focusInitialSeconds = 25 * 60;
let isFocusRunning = false;
let focusStartTimeStr = '';
let focusStartTimestamp = null;
let focusEndAt = null;
const RING_LEN = 326.73;

function setFocusMode(mode) {
  if (isFocusRunning) return showToast('Please pause or reset current session first.', false);
  focusMode = mode;
  ['timer', 'stopwatch', 'sleep'].forEach(m => $('focusMode' + (m === 'timer' ? 'Timer' : m === 'stopwatch' ? 'Stopwatch' : 'Sleep') + 'Btn').classList.toggle('active', m === mode));
  const card = $('focusRoomCard'); card.classList.toggle('sleep', mode === 'sleep');
  $('focusDurationSelectGroup').classList.toggle('hidden', mode !== 'timer');
  $('sleepModeBannerInfo').classList.toggle('hidden', mode !== 'sleep');
  const head = $('focusRoomHeaderTitle'), badge = $('focusModeBadge'), status = $('mainFocusStatusText'), start = $('mainFocusStartBtn'), reset = $('mainFocusResetBtn');
  if (mode === 'timer') {
    head.innerHTML = '<i class="fas fa-clock c-indigo"></i> Focus Timer'; badge.textContent = 'Pomodoro'; badge.className = 'badge tint-indigo';
    status.textContent = 'Ready to Focus'; start.className = 'btn btn-indigo flex-1'; start.innerHTML = '<i class="fas fa-play"></i> Start Session'; reset.textContent = 'Reset';
    focusTimeSeconds = parseInt($('focusDurationSelect').value) * 60;
  } else if (mode === 'stopwatch') {
    head.innerHTML = '<i class="fas fa-stopwatch c-blue"></i> Focus Stopwatch'; badge.textContent = 'Stopwatch'; badge.className = 'badge tint-blue';
    status.textContent = 'Ready to Focus'; start.className = 'btn btn-filled flex-1'; start.innerHTML = '<i class="fas fa-play"></i> Start Session'; reset.textContent = 'Reset';
    focusTimeSeconds = 0;
  } else {
    head.innerHTML = '<i class="fas fa-moon" style="color:#A5B4FC"></i> Sleep Tracker'; badge.textContent = 'iOS Sleep'; badge.className = 'badge'; badge.style.cssText = 'background:rgba(255,255,255,.15); color:#E0E7FF';
    status.textContent = 'Ready to Sleep'; start.className = 'btn flex-1'; start.style.cssText = 'background:#fff; color:#1E1B4B'; start.innerHTML = '<i class="fas fa-moon"></i> Start Sleep'; reset.textContent = 'Wake & Save';
    focusTimeSeconds = 0;
  }
  if (mode !== 'sleep') { badge.style.cssText = ''; start.style.cssText = ''; }
  focusInitialSeconds = focusTimeSeconds;
  updateFocusDisplay();
}
function changeFocusDuration(mins) {
  if (isFocusRunning) return;
  focusTimeSeconds = parseInt(mins) * 60; focusInitialSeconds = focusTimeSeconds;
  updateFocusDisplay();
}
function formatSleepOrFocusClock(totalSec) {
  if (focusMode === 'sleep') {
    const hrs = Math.floor(totalSec / 3600), mins = Math.floor((totalSec % 3600) / 60), secs = totalSec % 60;
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;
  }
  return `${pad2(Math.floor(totalSec / 60))}:${pad2(totalSec % 60)}`;
}
function updateFocusDisplay() {
  const el = $('mainFocusDisplay'); if (el) el.textContent = formatSleepOrFocusClock(focusTimeSeconds);
  const ring = $('focusRingFg'); if (!ring) return;
  let frac;
  if (focusMode === 'timer') frac = focusInitialSeconds > 0 ? focusTimeSeconds / focusInitialSeconds : 1;
  else if (focusMode === 'sleep') frac = Math.min(1, focusTimeSeconds / (8 * 3600));
  else frac = (focusTimeSeconds % 3600) / 3600;
  ring.style.strokeDashoffset = String(RING_LEN * (1 - frac));
  if (isFocusRunning && focusMode !== 'sleep') document.title = `${formatSleepOrFocusClock(focusTimeSeconds)} · Focus`;
}
function setFocusButtonsRunning(running) {
  const btn = $('mainFocusStartBtn'), st = $('mainFocusStatusText');
  if (focusMode === 'sleep') {
    btn.innerHTML = running ? '<i class="fas fa-pause"></i> Pause Sleep' : (focusStartTimeStr ? '<i class="fas fa-play"></i> Resume Sleep' : '<i class="fas fa-moon"></i> Start Sleep');
    st.textContent = running ? 'Sleep Tracking Active…' : (focusStartTimeStr ? 'Sleep Paused' : 'Ready to Sleep');
  } else {
    btn.innerHTML = running ? '<i class="fas fa-pause"></i> Pause Session' : (focusStartTimeStr ? '<i class="fas fa-play"></i> Resume Session' : '<i class="fas fa-play"></i> Start Session');
    st.textContent = running ? 'Session Active (Focusing…)' : (focusStartTimeStr ? 'Session Paused' : 'Ready to Focus');
  }
}
function toggleFocusTimer() {
  if (isFocusRunning) {
    clearInterval(focusTimerInterval); isFocusRunning = false; focusEndAt = null;
    setFocusButtonsRunning(false);
    document.title = defaultDocTitle;
  } else {
    if (!focusStartTimeStr) {
      const gmt7 = getWIBDate();
      focusStartTimeStr = `${pad2(gmt7.getHours())}:${pad2(gmt7.getMinutes())}`;
      focusStartTimestamp = Date.now() - (focusTimeSeconds * 1000);
    } else if (focusMode === 'sleep' || focusMode === 'stopwatch') {
      focusStartTimestamp = Date.now() - (focusTimeSeconds * 1000);
    }
    if (focusMode === 'timer') focusEndAt = Date.now() + focusTimeSeconds * 1000;
    isFocusRunning = true;
    setFocusButtonsRunning(true);
    // Timestamp-based agar akurat walau tab di background
    focusTimerInterval = setInterval(() => {
      if (focusMode === 'timer') {
        focusTimeSeconds = Math.max(0, Math.round((focusEndAt - Date.now()) / 1000));
        updateFocusDisplay();
        if (focusTimeSeconds <= 0) completeFocusSession('Completed');
      } else {
        focusTimeSeconds = Math.floor((Date.now() - focusStartTimestamp) / 1000);
        updateFocusDisplay();
      }
    }, 1000);
  }
}
function dashToggleFocus() { toggleFocusTimer(); }
function resetFocusTimer() {
  const hadDuration = focusTimeSeconds > 5;
  if (isFocusRunning || (focusMode === 'sleep' && hadDuration)) {
    clearInterval(focusTimerInterval); isFocusRunning = false;
    completeFocusSession(focusMode === 'sleep' ? 'Completed' : 'Stopped');
  }
  focusStartTimeStr = ''; focusStartTimestamp = null; focusEndAt = null;
  focusTimeSeconds = focusMode === 'timer' ? parseInt($('focusDurationSelect').value) * 60 : 0;
  focusInitialSeconds = focusTimeSeconds;
  setFocusButtonsRunning(false);
  document.title = defaultDocTitle;
  updateFocusDisplay();
}
function completeFocusSession(statusStr) {
  clearInterval(focusTimerInterval); isFocusRunning = false;
  const actualDuration = focusMode === 'timer' ? (focusInitialSeconds - focusTimeSeconds) : focusTimeSeconds;
  document.title = defaultDocTitle;
  if (actualDuration > 5) {
    const gmt7 = getWIBDate();
    const endTimeStr = `${pad2(gmt7.getHours())}:${pad2(gmt7.getMinutes())}`;
    const modeLabel = focusMode === 'timer' ? 'Timer' : (focusMode === 'sleep' ? 'Sleep' : 'Stopwatch');
    appState.focusHistory.unshift({
      id: 'focus_' + Date.now(), date: wibDateStr(gmt7), startTime: focusStartTimeStr || endTimeStr, endTime: endTimeStr,
      mode: modeLabel, durationSeconds: actualDuration, status: statusStr
    });
    saveStateToLocal(); renderFocusHistory(); renderSleepLineChart(); renderDashboardStats();
    if (focusMode === 'sleep') {
      const hrs = Math.floor(actualDuration / 3600), mins = Math.round((actualDuration % 3600) / 60);
      showToast(`Sleep session recorded (${hrs}h ${mins}m)!`);
    } else {
      showToast(`Focus session saved (${Math.round(actualDuration / 60)} mins)!`);
    }
    if (focusMode === 'timer' && statusStr === 'Completed') {
      playChime();
      if (typeof pushNotification === 'function') pushNotification({ key: 'focus_' + Date.now(), title: 'Sesi fokus selesai 🎉', body: `${Math.round(actualDuration / 60)} menit fokus tercatat. Waktunya istirahat sejenak.`, icon: 'fa-stopwatch', color: 'bg-indigo', pref: 'focus', action: { tab: 'tab-hub', sub: 'sub-focus' } });
      focusStartTimeStr = ''; focusTimeSeconds = focusInitialSeconds; setFocusButtonsRunning(false); updateFocusDisplay();
    }
  }
}
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1175, 1568].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.start(t); o.stop(t + 0.65);
    });
  } catch (e) {}
}

function renderSleepLineChart() {
  const container = $('sleepLineChartContainer'), avgBadge = $('avgSleepDurationBadge');
  if (!container) return;
  const sleepSessions = (appState.focusHistory || []).filter(f => f.mode === 'Sleep').slice(0, 7).reverse();
  if (sleepSessions.length === 0) {
    if (avgBadge) avgBadge.textContent = '0j 0m';
    container.innerHTML = `<div class="empty" style="padding:22px 8px"><i class="fas fa-bed" style="color:#A5B4FC"></i><div class="e-title" style="font-size:15px">Belum ada data tidur</div><div class="e-sub">Pilih mode <b>Sleep</b> dan mulai ukur tidurmu.</div></div>`;
    return;
  }
  const totalSec = sleepSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const avgSec = Math.round(totalSec / sleepSessions.length);
  if (avgBadge) avgBadge.textContent = `${Math.floor(avgSec / 3600)}j ${Math.round((avgSec % 3600) / 60)}m`;

  const width = 460, height = 160, padLeft = 30, padRight = 16, padTop = 24, padBottom = 26;
  const chartW = width - padLeft - padRight, chartH = height - padTop - padBottom;
  const maxVal = Math.max(8, ...sleepSessions.map(s => s.durationSeconds / 3600));
  const barW = Math.min(38, chartW / sleepSessions.length * 0.56);
  const goalY = padTop + chartH - (8 / maxVal) * chartH;
  const bars = sleepSessions.map((s, idx) => {
    const slot = chartW / sleepSessions.length;
    const cx = padLeft + slot * idx + slot / 2;
    const val = s.durationSeconds / 3600;
    const h = Math.max(3, (val / maxVal) * chartH);
    const y = padTop + chartH - h;
    const hrs = Math.floor(s.durationSeconds / 3600), mins = Math.round((s.durationSeconds % 3600) / 60);
    const good = val >= 7;
    return `<g>
      <rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${good ? '#5856D6' : '#A5B4FC'}"><title>${s.date}: ${hrs}j ${mins}m</title></rect>
      <text x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#3C3C43">${hrs}j${mins}m</text>
      <text x="${cx.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10" font-weight="600" fill="#8E8E93">${s.date ? s.date.slice(5).replace('-', '/') : '#' + (idx + 1)}</text>
    </g>`;
  }).join('');
  const grid = [0, 0.5, 1].map(r => {
    const y = padTop + chartH - r * chartH;
    return `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="rgba(60,60,67,.12)" stroke-width="1"/><text x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" font-weight="600" fill="#8E8E93">${Math.round(r * maxVal)}j</text>`;
  }).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; display:block; overflow:visible" role="img" aria-label="Grafik durasi tidur">
    ${grid}
    <line x1="${padLeft}" y1="${goalY.toFixed(1)}" x2="${width - padRight}" y2="${goalY.toFixed(1)}" stroke="#34C759" stroke-dasharray="4 4" stroke-width="1.2"/>
    <text x="${width - padRight}" y="${(goalY - 4).toFixed(1)}" text-anchor="end" font-size="9" font-weight="700" fill="#248A3D">target 8j</text>
    ${bars}</svg>`;
}

function renderFocusHistory() {
  const container = $('focusHistoryContainer'); if (!container) return;
  if (!appState.focusHistory || appState.focusHistory.length === 0) { container.innerHTML = `<div class="empty"><i class="fas fa-stopwatch"></i><div class="e-sub">Belum ada sesi fokus atau tidur.</div></div>`; return; }
  container.innerHTML = appState.focusHistory.map(f => {
    const isSleep = f.mode === 'Sleep';
    const hrs = Math.floor(f.durationSeconds / 3600), mins = Math.floor((f.durationSeconds % 3600) / 60), secs = f.durationSeconds % 60;
    const durationLabel = isSleep ? `${hrs}h ${mins}m ${secs}s` : `${Math.floor(f.durationSeconds / 60)}m ${secs}s`;
    const icon = isSleep ? ['fa-moon', 'bg-indigo'] : f.mode === 'Stopwatch' ? ['fa-stopwatch', 'bg-blue'] : ['fa-clock', 'bg-orange'];
    const badge = isSleep ? 'tint-indigo' : (f.status === 'Completed' ? 'tint-green' : 'tint-orange');
    return `<div class="row">
      <span class="icon-tile ${icon[1]}"><i class="fas ${icon[0]}"></i></span>
      <div class="flex-1"><div class="row-title">${esc(f.mode)} · <span class="semibold tabular">${esc(durationLabel)}</span></div><div class="row-sub">${esc(prettyDate(f.date))} · ${esc(f.startTime)}–${esc(f.endTime)}</div></div>
      <span class="badge ${badge}">${isSleep ? 'Sleep' : esc(f.status)}</span>
    </div>`;
  }).join('');
}
async function clearFocusHistory() {
  if (await iosConfirm('Hapus semua riwayat?', 'Semua log fokus & tidur akan dihapus.', 'Hapus', true)) {
    appState.focusHistory = []; saveStateToLocal(); renderFocusHistory(); renderSleepLineChart(); renderDashboardStats();
    showToast('Focus & sleep history cleared.');
  }
}
