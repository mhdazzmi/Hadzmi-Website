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
function setupLockScreenFields() {
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
  $('lockSessionRule').textContent = APP_AUTH.sessionMode === 'rolling24h' ? '24 jam' : '00:00 WIB';
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
  setTimeout(() => { const pw = $('lockPassword'); if (pw && window.innerWidth > 760) pw.focus(); }, 300);
}

function mapAuthError(err) {
  const code = (err && err.code) || '';
  const map = {
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
  const pw = $('lockPassword').value;
  const email = ($('lockEmail').value || getLoginEmail()).trim();
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
      $('lockPassword').value = '';
      unlockApp();
    })
    .catch(err => { loginInProgress = false; setLockBusy(false); setLockError(mapAuthError(err)); $('lockPassword').select(); });
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
  if ($('settingsAccountEmail')) $('settingsAccountEmail').textContent = (rec && rec.email) || getLoginEmail() || (APP_AUTH.enabled ? '—' : 'Mode tanpa login');
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
    title: (rec && rec.email) || 'Hadzmi Hub',
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
