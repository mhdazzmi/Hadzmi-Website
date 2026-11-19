/* =========================================================
   02 · AUTH — Lock screen, Firebase Auth, sesi harian per perangkat
   ========================================================= */
const SESSION_KEY = 'hz_session';
const AUTH_EMAIL_KEY = 'hz_auth_email';
let sessionWatchTimer = null;
let lockClockTimer = null;
let authResolved = false;
let loginInProgress = false;

function computeSessionExpiry() {
  const now = Date.now();
  if (APP_AUTH.sessionMode === 'rolling24h') return now + 24 * 3600 * 1000;
  // Tengah malam WIB berikutnya
  const wibNow = now + WIB_OFFSET_MS;
  const dayStart = Math.floor(wibNow / 86400000) * 86400000;
  return dayStart + 86400000 - WIB_OFFSET_MS;
}
function getSessionRecord() { return readLS(SESSION_KEY, null); }
function isSessionValid(user) {
  const rec = getSessionRecord();
  if (!rec || !rec.expiresAt || Date.now() >= rec.expiresAt) return false;
  if (user && rec.uid && rec.uid !== user.uid) return false;
  return true;
}
function formatExpiry(ts) {
  if (!ts) return '—';
  const w = new Date(ts + WIB_OFFSET_MS);
  const hh = pad2(w.getUTCHours()), mm = pad2(w.getUTCMinutes());
  const isTomorrowMidnight = hh === '00' && mm === '00';
  return isTomorrowMidnight ? `00:00 WIB (${w.getUTCDate()} ${ID_MONTHS[w.getUTCMonth()]})` : `${hh}:${mm} WIB, ${w.getUTCDate()} ${ID_MONTHS[w.getUTCMonth()]}`;
}
function getLoginEmail() {
  return APP_AUTH.ownerEmail || readLS(AUTH_EMAIL_KEY, '') || '';
}

// ---------- Lock screen UI ----------
function tickLockClock() {
  const w = getWIBDate();
  if ($('lockTime')) $('lockTime').textContent = `${pad2(w.getHours())}:${pad2(w.getMinutes())}`;
  if ($('lockDate')) $('lockDate').textContent = `${ID_DAYS[w.getDay()]}, ${w.getDate()} ${ID_MONTHS_LONG[w.getMonth()]}`;
}
function isPinMode() { return APP_AUTH.loginMode === 'pin' && !!APP_AUTH.ownerEmail; }
let pinBuffer = '';
let pinBusy = false;
function renderPinDots() {
  const dots = $('pinDots'); if (!dots) return;
  dots.querySelectorAll('span').forEach((d, i) => d.classList.toggle('on', i < pinBuffer.length));
}
function pinInput(digit) {
  if (pinBusy || $('lockScreen').classList.contains('hidden')) return;
  if (pinBuffer.length >= APP_AUTH.pinLength) return;
  pinBuffer += digit; haptic(6);
  if (pinBuffer.length === 1) setLockError('');
  renderPinDots();
  if (pinBuffer.length === APP_AUTH.pinLength) setTimeout(() => submitLogin(), 120);
}
function pinBackspace() {
  if (pinBusy) return;
  pinBuffer = pinBuffer.slice(0, -1); renderPinDots();
}
function bindPinPad() {
  const pad = $('pinPad'); if (!pad || pad.dataset.bound) return;
  pad.dataset.bound = '1';
  pad.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.del) pinBackspace(); else if (b.dataset.d) pinInput(b.dataset.d);
  });
  document.addEventListener('keydown', e => {
    if (!isPinMode() || $('lockScreen').classList.contains('hidden')) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pinInput(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); pinBackspace(); }
  });
}
function setupLockScreenFields() {
  $('lockSessionRule').textContent = APP_AUTH.sessionMode === 'rolling24h' ? '24 jam' : '00:00 WIB';
  if (isPinMode()) {
    $('lockPinWrap').classList.remove('hidden');
    $('lockPwWrap').classList.add('hidden');
    $('lockForm').classList.add('pin-mode');
    $('lockSubtitle').textContent = 'Masukkan PIN';
    pinBuffer = ''; renderPinDots(); bindPinPad();
    return;
  }
  $('lockPinWrap').classList.add('hidden');
  $('lockPwWrap').classList.remove('hidden');
  const email = getLoginEmail();
  if (email) {
    $('lockEmailWrap').classList.add('hidden');
    $('lockEmailShown').classList.remove('hidden');
    $('lockEmailLabel').textContent = email;
    $('lockEmail').value = email;
  } else {
    $('lockEmailWrap').classList.remove('hidden');
    $('lockEmailShown').classList.add('hidden');
  }
}
function showLockEmailField(e) {
  if (e) e.preventDefault();
  $('lockEmailWrap').classList.remove('hidden');
  $('lockEmailShown').classList.add('hidden');
  $('lockEmail').focus();
}
function setLockError(msg) {
  const el = $('lockError'); el.textContent = msg || '';
  if (msg) { const card = $('lockForm'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); haptic(40); }
}
function setLockBusy(busy) {
  pinBusy = busy;
  const dots = $('pinDots'); if (dots) dots.classList.toggle('busy', !!busy);
  const btn = $('lockGoBtn'); btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="spinner"></span>' : '<i class="fas fa-arrow-right"></i>';
}
function showLockScreen(message) {
  const ls = $('lockScreen');
  ls.classList.remove('hidden', 'unlocking');
  $('personalAppRoot').classList.add('is-locked');
  setupLockScreenFields();
  setLockBusy(false);
  if (message) setLockError(message);
  if (!isPinMode()) setTimeout(() => { const pw = $('lockPassword'); if (pw && window.innerWidth > 760) pw.focus(); }, 300);
}

function mapAuthError(err) {
  const code = (err && err.code) || '';
  if (isPinMode() && /wrong-password|invalid-credential|invalid-login-credentials/.test(code)) return 'PIN salah. Coba lagi.';
  if (isPinMode() && code === 'auth/user-not-found') return 'Akun PIN belum dibuat di Firebase.';
  const map = {
    'auth/weak-password': 'PIN/sandi minimal 6 karakter.',
    'auth/requires-recent-login': 'Demi keamanan, kunci lalu login ulang sebelum mengganti PIN.',
    'auth/wrong-password': 'Sandi salah. Coba lagi.',
    'auth/invalid-credential': 'Email atau sandi salah.',
    'auth/invalid-login-credentials': 'Email atau sandi salah.',
    'auth/user-not-found': 'Akun tidak ditemukan.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit.',
    'auth/network-request-failed': 'Tidak ada koneksi internet.',
    'auth/operation-not-allowed': 'Aktifkan Email/Password di Firebase Console → Authentication.',
    'auth/user-disabled': 'Akun dinonaktifkan.'
  };
  return map[code] || ('Gagal login' + (code ? ` (${code})` : '.'));
}

function submitLogin(e) {
  if (e) e.preventDefault();
  const pin = isPinMode();
  const pw = pin ? pinBuffer : $('lockPassword').value;
  const email = pin ? APP_AUTH.ownerEmail : ($('lockEmail').value || getLoginEmail()).trim();
  if (!email) { showLockEmailField(); return setLockError('Masukkan email akun dulu.'), false; }
  if (!pw) return setLockError('Masukkan sandi.'), false;
  if (!firebaseAuth) { setLockError('Firebase belum termuat. Periksa koneksi internet lalu muat ulang.'); return false; }
  setLockError(''); setLockBusy(true);
  loginInProgress = true;
  firebaseAuth.signInWithEmailAndPassword(email, pw)
    .then(cred => {
      loginInProgress = false;
      writeLS(AUTH_EMAIL_KEY, email);
      writeLS(SESSION_KEY, { uid: cred.user.uid, email, loginAt: Date.now(), expiresAt: computeSessionExpiry() });
      $('lockPassword').value = ''; pinBuffer = ''; setLockBusy(false); renderPinDots();
      unlockApp();
    })
    .catch(err => {
      loginInProgress = false; setLockBusy(false); setLockError(mapAuthError(err));
      if (pin) { pinBuffer = ''; renderPinDots(); } else $('lockPassword').select();
    });
  return false;
}

function unlockApp() {
  const ls = $('lockScreen');
  ls.classList.add('unlocking');
  setTimeout(() => ls.classList.add('hidden'), 550);
  $('personalAppRoot').classList.remove('is-locked');
  startApp();
  updateSessionUI();
}

function updateSessionUI() {
  const rec = getSessionRecord();
  const exp = rec && rec.expiresAt;
  if ($('settingsSessionExpiry')) $('settingsSessionExpiry').textContent = APP_AUTH.enabled ? formatExpiry(exp) : 'Kunci nonaktif';
  if ($('settingsAccountEmail')) $('settingsAccountEmail').textContent = !APP_AUTH.enabled ? 'Mode tanpa login' : isPinMode() ? 'Login dengan PIN ' + APP_AUTH.pinLength + ' angka' : ((rec && rec.email) || getLoginEmail() || '—');
  if ($('changeCredLabel')) $('changeCredLabel').textContent = isPinMode() ? 'Ganti PIN' : 'Ganti Sandi';
  const chip = $('heroSessionChip');
  if (chip) chip.innerHTML = APP_AUTH.enabled && exp ? `<i class="fas fa-lock-open"></i> Sesi s/d ${formatExpiry(exp).split(' (')[0]}` : '<i class="fas fa-lock-open"></i> Sesi aktif';
}

async function lockAppNow(auto) {
  if (!APP_AUTH.enabled) return showToast('Kunci login sedang dinonaktifkan di konfigurasi.', false);
  if (auto !== true) {
    const ok = await iosConfirm('Kunci Hadzmi Hub?', 'Kamu perlu memasukkan sandi lagi untuk membuka di perangkat ini.', 'Kunci', true);
    if (!ok) return;
  }
  performLock(auto === true ? 'Sesi berakhir. Silakan login kembali.' : '');
}

function performLock(message) {
  try { if (typeof audioEngine !== 'undefined') audioEngine.pause(); } catch (e) {}
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { sessionStorage.setItem('hz_lock_msg', message || ''); } catch (e) {}
  const done = () => location.reload();
  if (firebaseAuth && firebaseAuth.currentUser) firebaseAuth.signOut().then(done, done);
  else done();
}

function checkSessionExpiry() {
  if (!APP_AUTH.enabled || !appStarted) return;
  const rec = getSessionRecord();
  if (!rec || Date.now() >= rec.expiresAt) performLock('Sesi harian berakhir (00:00 WIB). Silakan login kembali.');
  else if (rec.expiresAt - Date.now() < 10 * 60 * 1000 && typeof pushNotification === 'function') {
    pushNotification({ key: 'session_' + rec.expiresAt, title: 'Sesi segera berakhir', body: 'Hadzmi Hub akan terkunci otomatis dalam < 10 menit.', icon: 'fa-lock', color: 'bg-gray', system: false });
  }
}

function openAccountMenu() {
  const rec = getSessionRecord();
  openActionSheet({
    title: isPinMode() ? 'Hadzmi Hub' : ((rec && rec.email) || 'Hadzmi Hub'),
    message: APP_AUTH.enabled ? `Sesi aktif hingga ${formatExpiry(rec && rec.expiresAt)}` : 'Kunci login nonaktif',
    actions: [
      { text: 'Kunci Sekarang', icon: 'fas fa-lock', destructive: true, onClick: () => lockAppNow() },
      { text: 'Pengaturan', icon: 'fas fa-gear', onClick: () => switchTab('tab-backup') }
    ]
  });
}

function sendPasswordReset() {
  const email = ((getSessionRecord() || {}).email) || getLoginEmail();
  if (!firebaseAuth || !email) return showToast('Email akun tidak diketahui.', false);
  firebaseAuth.sendPasswordResetEmail(email)
    .then(() => showToast('Link reset sandi dikirim ke ' + email))
    .catch(err => showToast(mapAuthError(err), false));
}

// ---------- Boot ----------
function bootAuth() {
  tickLockClock();
  lockClockTimer = setInterval(tickLockClock, 1000);
  setupLockScreenFields();

  let lockMsg = '';
  try { lockMsg = sessionStorage.getItem('hz_lock_msg') || ''; sessionStorage.removeItem('hz_lock_msg'); } catch (e) {}

  if (!APP_AUTH.enabled) { unlockApp(); return; }

  if (!firebaseAuth) {
    // Offline / SDK gagal dimuat: izinkan hanya jika sesi perangkat ini masih berlaku
    if (isSessionValid(null)) { unlockApp(); setConnectionStatus('off'); }
    else showLockScreen('Tidak bisa memuat Firebase. Periksa koneksi lalu muat ulang.');
    return;
  }

  // Tampilkan lock screen sambil menunggu status auth
  showLockScreen(lockMsg);
  if (isSessionValid(null)) $('lockSubtitle').innerHTML = '<span class="spinner dark" style="display:inline-block;vertical-align:middle"></span> Memeriksa sesi…';

  firebaseAuth.onAuthStateChanged(user => {
    authResolved = true;
    if (loginInProgress) return; // ditangani oleh submitLogin()
    $('lockSubtitle').textContent = 'Masukkan sandi untuk membuka';
    if (user && isSessionValid(user)) {
      if (!appStarted) unlockApp();
      else updateSessionUI();
    } else if (user && !isSessionValid(user)) {
      // Sesi kadaluarsa: paksa logout, wajib sandi lagi
      firebaseAuth.signOut();
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
      if (appStarted) performLock('Sesi berakhir. Silakan login kembali.');
      else showLockScreen(lockMsg || '');
    } else {
      if (appStarted) performLock('Kamu telah keluar.');
      else showLockScreen(lockMsg || '');
    }
  });
}

async function changePinFlow() {
  const user = firebaseAuth && firebaseAuth.currentUser;
  if (!user) return showToast('Login dulu untuk mengganti PIN.', false);
  const pin = isPinMode(), n = APP_AUTH.pinLength;
  const label = pin ? 'PIN' : 'sandi';
  const numeric = pin ? { type: 'password', inputmode: 'numeric', maxlength: n } : { type: 'password' };
  const ask = (title, message, input) => iosAlert({ title, message, input, actions: [{ text: 'Batal', value: false }, { text: 'Lanjut', value: true, bold: true }] });
  const oldVal = await ask(`Ganti ${label}`, `Masukkan ${label} saat ini.`, { type: 'password' });
  if (oldVal === null || oldVal === '') return;
  const newVal = await ask(`${label[0].toUpperCase() + label.slice(1)} baru`, pin ? `Masukkan ${n} angka.` : 'Minimal 6 karakter.', numeric);
  if (newVal === null) return;
  if (pin ? !new RegExp('^\\d{' + n + '}$').test(newVal) : newVal.length < 6) return showToast(pin ? `PIN harus tepat ${n} angka.` : 'Sandi minimal 6 karakter.', false);
  const confirmVal = await ask(`Ulangi ${label} baru`, '', numeric);
  if (confirmVal === null) return;
  if (confirmVal !== newVal) return showToast(`${label} baru tidak sama.`, false);
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, oldVal);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(newVal);
    showToast(`${label[0].toUpperCase() + label.slice(1)} berhasil diganti. Berlaku di semua perangkat.`);
  } catch (err) {
    showToast(mapAuthError(err).replace('PIN salah. Coba lagi.', `${label} lama salah.`), false);
  }
}
