/* =========================================================
   01 · CORE — config, state, Firebase, UI primitives, navigation
   ========================================================= */

// ---------- KONFIGURASI ----------
const firebaseConfig = {
  apiKey: "AIzaSyBoTr_A9JQsRTHri47o0ZPIQH21SxlBjh0",
  authDomain: "web-hadzmi-new.firebaseapp.com",
  databaseURL: "https://web-hadzmi-new-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-hadzmi-new",
  storageBucket: "web-hadzmi-new.firebasestorage.app",
  messagingSenderId: "664176294351",
  appId: "1:664176294351:web:5706e50b47d9cec546baba",
  measurementId: "G-Q0TPNLKSHK"
};

const APP_AUTH = {
  enabled: true,          // false = matikan kunci login (tidak disarankan)
  loginMode: 'pin',       // 'pin' = keypad PIN 6 angka | 'password' = email + sandi
  pinLength: 8,
  ownerEmail: 'hadzmi-hub@example.com', // akun Firebase KHUSUS login PIN (bukan email pribadi); PIN = sandi akun ini
  sessionMode: 'midnight' // 'midnight' = berlaku sampai 00:00 WIB | 'rolling24h' = 24 jam sejak login
};

const DB_PATH = 'hadzmi_assistant_data';
const WIB_OFFSET_MS = 7 * 3600 * 1000;
const DEFAULT_CATEGORIES = ["Sleep", "Working", "Focus"];

// ---------- STATE (struktur sama dengan versi sebelumnya) ----------
function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
function writeLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
function writeRawLS(key, val) { try { localStorage.setItem(key, String(val)); } catch (e) {} }

const savedShowFloatingDock = (() => { try { return localStorage.getItem('app_show_floating_dock'); } catch (e) { return null; } })();

let appState = {
  todos: readLS('app_todos', []),
  countdowns: readLS('app_countdowns', []),
  notes: readLS('app_notes', []),
  kas: readLS('app_kas', []),
  links: readLS('app_links', []),
  contacts: readLS('app_contacts', []),
  uploads: readLS('app_uploads', []),
  customWebLinks: readLS('app_custom_web_links', []),
  focusHistory: readLS('app_focus_history', []),
  musicCategories: readLS('app_music_categories', DEFAULT_CATEGORIES.slice()),
  musicLibrary: readLS('app_music_library', [
    { id: "song_1", title: "Lofi Rain & Focus", artist: "Chill Beats", url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3", category: "Working", cover: "", lyrics: "" },
    { id: "song_2", title: "Deep Ocean Sleep", artist: "Nature Ambience", url: "https://cdn.pixabay.com/download/audio/2021/09/06/audio-14534.mp3?filename=relaxing-ocean-waves-14534.mp3", category: "Sleep", cover: "", lyrics: "" }
  ]),
  workPhotos: readLS('app_work_photos', []),
  workDocs: readLS('app_work_docs', []),
  workNotes: readLS('app_work_notes', []),
  customLabels: readLS('app_custom_labels', {}),
  galleryPhotos: readLS('app_gallery_photos', []),
  galleryAlbums: readLS('app_gallery_albums', []),
  visitDays: readLS('app_visit_days', []),
  vault: readLS('app_vault', null),
  walletCards: readLS('app_wallet_cards', []),
  showFloatingMusicDock: savedShowFloatingDock !== null ? savedShowFloatingDock === 'true' : false
};

let firebaseDbRef = null;
let firebaseAuth = null;
let isFirebaseReady = false;
let appStarted = false;
let defaultDocTitle = "Hadzmi Assistant";

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if (firebase.auth) firebaseAuth = firebase.auth();
    isFirebaseReady = true;
  }
} catch (e) {
  console.error('Firebase initialization error:', e);
}

// ---------- UTIL ----------
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return esc(u);
  if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return esc('https://' + u);
  return '#';
}
function $(id) { return document.getElementById(id); }
/** Teks → HTML aman dengan link otomatis (http(s)://, www., domain.com/…) yang bisa diklik. */
function linkify(text) {
  return esc(text).replace(/(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+|\b[a-z0-9-]+\.(?:com|id|co\.id|net|org|io|app|dev|me|ly|gl|link|ai|xyz)(?:\/[^\s<]*)?)/gi, m => {
    const trail = (m.match(/[.,!?;:)\]]+$/) || [''])[0]; const url = m.slice(0, m.length - trail.length);
    const href = /^https?:/i.test(url) ? url : 'https://' + url;
    return `<a href="${href}" target="_blank" rel="noopener" class="auto-link" onclick="event.stopPropagation()">${url}</a>${trail}`;
  });
}
function pad2(n) { return String(n).padStart(2, '0'); }

function getWIBDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + WIB_OFFSET_MS);
}
function wibDateStr(d) {
  const w = d || getWIBDate();
  return `${w.getFullYear()}-${pad2(w.getMonth() + 1)}-${pad2(w.getDate())}`;
}
function wibAddDays(n) { const w = getWIBDate(); w.setDate(w.getDate() + n); return wibDateStr(w); }
// 'YYYY-MM-DD' + 'HH:MM' (interpretasi WIB) -> epoch ms
function wibToEpoch(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0) - WIB_OFFSET_MS;
}
const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ID_MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function prettyDate(dateStr, withDay) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const base = `${d} ${ID_MONTHS[m - 1]} ${y}`;
  return withDay ? `${ID_DAYS[dt.getUTCDay()]}, ${base}` : base;
}
function relativeDayLabel(dateStr) {
  if (!dateStr) return '';
  if (dateStr === wibDateStr()) return 'Hari ini';
  if (dateStr === wibAddDays(1)) return 'Besok';
  if (dateStr === wibAddDays(-1)) return 'Kemarin';
  return prettyDate(dateStr, true);
}
function rupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  return Math.floor(s / 86400) + ' hr lalu';
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
}
const AVATAR_COLORS = ['#FF9500', '#34C759', '#007AFF', '#5856D6', '#FF2D55', '#AF52DE', '#30B0C7', '#A2845E', '#FF3B30', '#00C7BE'];
function colorFor(str) {
  let h = 0; const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  fallbackCopy(text); return Promise.resolve();
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
}
function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} }

// ---------- TOAST (iOS banner) ----------
let toastTimer = null;
function showToast(message, isSuccess = true) {
  const toast = $('toast'); if (!toast) return;
  $('toastMsg').textContent = message;
  $('toastIconWrap').className = 'b-icon ' + (isSuccess ? 'bg-blue' : 'bg-red');
  $('toastIcon').className = isSuccess ? 'fas fa-check' : 'fas fa-exclamation';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ---------- ALERT / CONFIRM (iOS) ----------
function iosAlert(opts) {
  return new Promise(resolve => {
    const host = $('iosAlert');
    const actions = opts.actions || [{ text: 'OK', value: true, bold: true }];
    host.innerHTML = `
      <div class="alert" role="alertdialog">
        <div class="al-body">
          <div class="al-title">${esc(opts.title || '')}</div>
          ${opts.message ? `<div class="al-msg">${esc(opts.message)}</div>` : ''}
          ${opts.input ? `<input id="iosAlertInput" type="${opts.input.type || 'text'}" placeholder="${esc(opts.input.placeholder || '')}" value="${esc(opts.input.value || '')}"${opts.input.inputmode ? ` inputmode="${opts.input.inputmode}"` : ''}${opts.input.maxlength ? ` maxlength="${opts.input.maxlength}"` : ''} autocomplete="off">` : ''}
        </div>
        <div class="al-actions" style="${actions.length > 2 ? 'flex-direction:column' : ''}">
          ${actions.map((a, i) => `<button data-i="${i}" class="${a.bold ? 'bold' : ''} ${a.destructive ? 'destructive' : ''}" style="${actions.length > 2 && i ? 'border-left:0;border-top:.5px solid var(--sep)' : ''}">${esc(a.text)}</button>`).join('')}
        </div>
      </div>`;
    host.querySelectorAll('button[data-i]').forEach(btn => {
      btn.onclick = () => {
        const a = actions[+btn.dataset.i];
        const inputEl = $('iosAlertInput');
        host.classList.remove('open');
        setTimeout(() => { if (!host.classList.contains('open')) host.innerHTML = ''; }, 250);
        resolve(opts.input ? (a.value ? (inputEl ? inputEl.value : '') : null) : a.value);
      };
    });
    requestAnimationFrame(() => host.classList.add('open'));
    const inp = $('iosAlertInput'); if (inp) setTimeout(() => inp.focus(), 250);
  });
}
function iosConfirm(title, message, confirmText = 'OK', destructive = false) {
  return iosAlert({ title, message, actions: [{ text: 'Batal', value: false }, { text: confirmText, value: true, bold: !destructive, destructive }] });
}

// ---------- ACTION SHEET ----------
let actionSheetResolver = null;
function openActionSheet(opts) {
  return new Promise(resolve => {
    actionSheetResolver = resolve;
    const host = $('iosActionSheet');
    host.innerHTML = `
      <div class="action-sheet">
        <div class="as-group">
          ${opts.title || opts.message ? `<div class="as-head">${opts.title ? `<b>${esc(opts.title)}</b>` : ''}${esc(opts.message || '')}</div>` : ''}
          ${opts.actions.map((a, i) => `<button class="as-btn ${a.destructive ? 'destructive' : ''}" data-i="${i}">${a.icon ? `<i class="${a.icon}"></i>` : ''}<span>${esc(a.text)}</span></button>`).join('')}
        </div>
        <div class="as-group"><button class="as-btn cancel" data-cancel="1">Batal</button></div>
      </div>`;
    host.querySelectorAll('.as-btn').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.cancel) return closeActionSheet(null);
        const a = opts.actions[+btn.dataset.i];
        closeActionSheet(a.value !== undefined ? a.value : a.text);
        if (typeof a.onClick === 'function') setTimeout(a.onClick, 10);
      };
    });
    requestAnimationFrame(() => host.classList.add('open'));
  });
}
function closeActionSheet(val) {
  const host = $('iosActionSheet');
  host.classList.remove('open');
  setTimeout(() => { if (!host.classList.contains('open')) host.innerHTML = ''; }, 350);
  if (actionSheetResolver) { const r = actionSheetResolver; actionSheetResolver = null; r(val); }
}

// ---------- SHEETS ----------
const openSheets = [];
function openSheet(id) {
  const el = $(id); if (!el) return;
  el.classList.add('open');
  if (!openSheets.includes(id)) openSheets.push(id);
  attachSheetDrag(el, id);
}
function closeSheet(id) {
  const el = $(id); if (!el) return;
  el.classList.remove('open');
  const i = openSheets.indexOf(id); if (i > -1) openSheets.splice(i, 1);
}
function attachSheetDrag(backdrop, id) {
  const sheet = backdrop.querySelector('.sheet'); const grab = backdrop.querySelector('.sheet-grabber');
  if (!sheet || !grab || grab.dataset.bound) return;
  grab.dataset.bound = '1';
  const zone = [grab, backdrop.querySelector('.sheet-head')].filter(Boolean);
  let startY = 0, dy = 0, dragging = false;
  zone.forEach(z => {
    z.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dy = 0; dragging = true; sheet.style.transition = 'none'; }, { passive: true });
    z.addEventListener('touchmove', e => { if (!dragging) return; dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    z.addEventListener('touchend', () => {
      if (!dragging) return; dragging = false; sheet.style.transition = ''; sheet.style.transform = '';
      if (dy > 110) {
        if (id === 'quickUploadSongModal') closeQuickUploadSongModal();
        else if (id === 'musicLyricsModal') closeLyricsFullScreenModal();
        else closeSheet(id);
      }
    });
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('iosActionSheet').classList.contains('open')) return closeActionSheet(null);
    if ($('fullPlayer').classList.contains('open')) return closeFullPlayer();
    const last = openSheets[openSheets.length - 1];
    if (last) closeSheet(last);
  }
});

// ---------- STORAGE & SYNC (logika sama: localStorage + Firebase set) ----------
function syncToLocalStorageOnly() {
  writeLS('app_todos', appState.todos);
  writeLS('app_countdowns', appState.countdowns);
  writeLS('app_notes', appState.notes);
  writeLS('app_kas', appState.kas);
  writeLS('app_links', appState.links);
  writeLS('app_contacts', appState.contacts);
  writeLS('app_uploads', appState.uploads);
  writeLS('app_custom_web_links', appState.customWebLinks);
  writeLS('app_focus_history', appState.focusHistory);
  writeLS('app_music_categories', appState.musicCategories);
  writeLS('app_music_library', appState.musicLibrary);
  writeLS('app_work_photos', appState.workPhotos);
  writeLS('app_work_docs', appState.workDocs);
  writeLS('app_work_notes', appState.workNotes);
  writeLS('app_custom_labels', appState.customLabels || {});
  writeLS('app_gallery_photos', appState.galleryPhotos || []);
  writeLS('app_gallery_albums', appState.galleryAlbums || []);
  writeLS('app_visit_days', appState.visitDays || []);
  writeLS('app_vault', appState.vault || null);
  writeLS('app_wallet_cards', appState.walletCards || []);
  writeRawLS('app_show_floating_dock', appState.showFloatingMusicDock === true);
}

function saveStateToLocal() {
  syncToLocalStorageOnly();
  if (firebaseDbRef) {
    firebaseDbRef.set(appState).catch(err => {
      console.error('Firebase save error:', err);
      if (err && /permission/i.test(String(err.code || err.message))) showToast('Gagal sinkron: akses Firebase ditolak.', false);
    });
  }
  if (typeof scheduleReminderCheck === 'function') scheduleReminderCheck();
}

function applyRemoteSnapshot(val) {
  appState.todos = val.todos || [];
  appState.countdowns = val.countdowns || [];
  appState.notes = val.notes || [];
  appState.kas = val.kas || [];
  appState.links = val.links || [];
  appState.contacts = val.contacts || [];
  appState.uploads = val.uploads || [];
  appState.customWebLinks = val.customWebLinks || [];
  appState.focusHistory = val.focusHistory || [];
  appState.musicCategories = val.musicCategories || DEFAULT_CATEGORIES.slice();
  appState.musicLibrary = val.musicLibrary || [];
  appState.workPhotos = val.workPhotos || [];
  appState.workDocs = val.workDocs || [];
  appState.workNotes = val.workNotes || [];
  appState.customLabels = val.customLabels || {};
  appState.galleryPhotos = val.galleryPhotos || [];
  appState.galleryAlbums = val.galleryAlbums || [];
  appState.visitDays = val.visitDays || [];
  appState.vault = val.vault || null;
  appState.walletCards = val.walletCards || [];
  if (typeof val.showFloatingMusicDock === 'boolean') appState.showFloatingMusicDock = val.showFloatingMusicDock;
}

function attachRealtimeSync() {
  if (!isFirebaseReady || firebaseDbRef) return;
  try {
    firebaseDbRef = firebase.database().ref(DB_PATH);
  } catch (e) { console.error(e); return; }

  firebaseDbRef.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val) {
      applyRemoteSnapshot(val);
      recordVisit(true);
      syncToLocalStorageOnly();
      resyncCurrentSongIndex();
      applyFloatingMusicDockVisibility();
      renderAllModules();
      updateCurrentSongDisplayUI();
    } else {
      saveStateToLocal();
      renderAllModules();
    }
    if (typeof scheduleReminderCheck === 'function') scheduleReminderCheck();
  }, (err) => {
    console.warn('Firebase sync read warning:', err);
    setConnectionStatus('denied');
    renderAllModules();
  });

  try {
    firebase.database().ref('.info/connected').on('value', snap => setConnectionStatus(snap.val() === true ? 'on' : 'off'));
  } catch (e) {}
}

let lastSyncState = 'off';
function explainSyncStatus() {
  const uid = firebaseAuth && firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : '(belum login)';
  const msg = {
    on: 'Data tersinkron realtime dengan Firebase.',
    off: 'Sedang offline. Perubahan disimpan di perangkat dan akan tersinkron saat online.',
    denied: `Firebase MENOLAK akun ini.\nPastikan Realtime Database → Rules memakai UID ini (di 2 tempat) lalu tekan Publish:\n\n${uid}`
  }[lastSyncState] || '';
  iosAlert({ title: lastSyncState === 'denied' ? 'Akses Ditolak' : lastSyncState === 'on' ? 'Tersinkron' : 'Offline', message: msg,
    actions: lastSyncState === 'denied' ? [{ text: 'Tutup', value: false }, { text: 'Salin UID', value: true, bold: true }] : [{ text: 'OK', value: false, bold: true }] })
    .then(v => { if (v) copyLoginUid(); });
}
function copyLoginUid() {
  const uid = firebaseAuth && firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : '';
  if (!uid) return showToast('Belum login.', false);
  copyText(uid); showToast('UID disalin: ' + uid.slice(0, 8) + '…');
}
function setConnectionStatus(state) {
  lastSyncState = state;
  const dot = $('firebaseStatusDot'), txt = $('firebaseStatusText'), st = $('settingsDbStatus');
  const map = { on: ['on', 'Sync', 'Terhubung'], off: ['off', 'Offline', 'Offline (cache lokal)'], denied: ['off', 'Ditolak', 'Akses ditolak (cek Rules)'] };
  const m = map[state] || map.off;
  if (dot) dot.className = 'status-dot ' + m[0];
  if (txt) txt.textContent = m[1];
  if (st) st.textContent = m[2];
}

// ---------- NAVIGATION ----------
let currentTabId = 'tab-dashboard';
// ---------- NAMA MENU (bisa diganti di Settings → Nama Menu) ----------
const LABEL_GROUPS = [
  ['Umum', [['app.name', 'Hadzmi Assistant', 'Nama aplikasi'], ['user.name', 'Hadzmi', 'Nama di sapaan']]],
  ['Tab Bawah', [['tab.home', 'Home'], ['tab.music', 'Media'], ['tab.hub', 'Planner'], ['tab.work', 'Kerja'], ['tab.settings', 'Settings']]],
  ['Menu Media', [['media.music', 'Music'], ['media.gallery', 'Galeri']]],
  ['Menu Hub', [['hub.space', 'Productivity', 'Judul kecil Hub'], ['hub.notes', 'Mind Dump'], ['hub.todo', 'To-Do'], ['hub.links', 'Bookmarks'], ['hub.countdown', 'Countdown'], ['hub.focus', 'Focus'], ['hub.wallet', 'Wallet']]],
  ['Menu Kerja', [['work.space', 'Work Space', 'Judul kecil Kerja'], ['work.photos', 'Bukti Kas'], ['work.kas', 'Selisih Kas'], ['work.notes', 'Catatan Kerja'], ['work.docs', 'Gudang File'], ['work.upload', 'Upload Drive'], ['work.contacts', 'Kontak WA']]]
];
const LABEL_DEFAULTS = {};
LABEL_GROUPS.forEach(([, items]) => items.forEach(([k, d]) => { LABEL_DEFAULTS[k] = d; }));
function L(key) { return LABEL_DEFAULTS[key] || key; }
function applyLabels() {
  document.querySelectorAll('[data-label]').forEach(el => { const t = L(el.dataset.label); if (el.textContent !== t) el.textContent = t; });
  if ($('hubTitle') && currentHubSub) $('hubTitle').textContent = L(HUB_KEYS[currentHubSub]);
  if ($('workTitle') && currentWorkSub) $('workTitle').textContent = L(WORK_KEYS[currentWorkSub]);
  if ($('mediaTitle') && currentMediaSub) $('mediaTitle').textContent = L(MEDIA_KEYS[currentMediaSub]);
  defaultDocTitle = L('app.name');
  if (typeof isMusicPlaying === 'undefined' || !isMusicPlaying) document.title = defaultDocTitle;
  updateNavSmallTitle();
}
function renderLabelEditor() {
  const box = $('labelEditor'); if (!box || box.contains(document.activeElement)) return;
  box.innerHTML = LABEL_GROUPS.map(([group, items]) => `<div class="fl-row" style="min-height:34px; background:var(--fill3)"><span class="t-cap muted semibold" style="text-transform:uppercase; letter-spacing:.04em">${esc(group)}</span></div>` +
    items.map(([k, d, hint]) => `<div class="fl-row"><span class="fl-label t-sub" style="min-width:118px; color:var(--label2)">${esc(hint || d)}</span><input type="text" maxlength="28" data-key="${k}" placeholder="${esc(d)}" value="${esc((appState.customLabels || {})[k] || '')}" enterkeyhint="done"></div>`).join('')).join('');
  box.querySelectorAll('input[data-key]').forEach(inp => {
    inp.addEventListener('change', () => setCustomLabel(inp.dataset.key, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
}
function setCustomLabel(key, value) {
  appState.customLabels = Object.assign({}, appState.customLabels || {});
  const v = String(value || '').trim();
  if (!v || v === LABEL_DEFAULTS[key]) delete appState.customLabels[key]; else appState.customLabels[key] = v.slice(0, 28);
  saveStateToLocal(); applyLabels(); updateDashboardGreeting();
  showToast(v ? `Nama diganti jadi "${L(key)}"` : `Kembali ke "${LABEL_DEFAULTS[key]}"`);
}
async function resetCustomLabels() {
  if (!(await iosConfirm('Kembalikan semua nama menu?', 'Semua nama kembali ke bawaan.', 'Kembalikan', true))) return;
  appState.customLabels = {}; saveStateToLocal(); applyLabels(); updateDashboardGreeting();
  const box = $('labelEditor'); if (box) box.innerHTML = ''; renderLabelEditor();
  showToast('Nama menu dikembalikan ke bawaan.');
}
const HUB_KEYS = { 'sub-todo': 'hub.todo', 'sub-notes': 'hub.notes', 'sub-links': 'hub.links', 'sub-countdown': 'hub.countdown', 'sub-focus': 'hub.focus', 'sub-wallet': 'hub.wallet' };
const WORK_KEYS = { 'sub-photos': 'work.photos', 'sub-kas': 'work.kas', 'sub-worknotes': 'work.notes', 'sub-docs': 'work.docs', 'sub-upload': 'work.upload', 'sub-contacts': 'work.contacts' };
let currentHubSub = 'sub-notes', currentWorkSub = 'sub-photos', currentMediaSub = 'sub-music';
const MEDIA_KEYS = { 'sub-music': 'media.music', 'sub-gallery': 'media.gallery' };
function switchMediaSub(subId) {
  if (subId !== 'sub-gallery' && typeof vaultKey !== 'undefined' && vaultKey) lockVault();
  document.querySelectorAll('.media-sub').forEach(el => el.classList.toggle('hidden', el.id !== subId));
  setSegActive(['sub-music', 'sub-gallery'], subId);
  currentMediaSub = subId;
  if ($('mediaTitle')) $('mediaTitle').textContent = L(MEDIA_KEYS[subId]);
  $('musicHeadActions').classList.toggle('hidden', subId !== 'sub-music');
  $('galleryHeadActions').classList.toggle('hidden', subId !== 'sub-gallery');
  if (subId === 'sub-gallery') renderGallery(); else if (typeof exitGallerySelect === 'function') exitGallerySelect();
  updateNavSmallTitle();
}

function switchTab(tabId) {
  if (tabId !== 'tab-music' && typeof vaultKey !== 'undefined' && vaultKey) lockVault();
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.ios-tab-item').forEach(btn => btn.classList.remove('active'));
  const selectedTab = $(tabId);
  if (selectedTab) selectedTab.classList.remove('hidden');
  const activeBtn = $('btn-' + tabId);
  if (activeBtn) activeBtn.classList.add('active');
  currentTabId = tabId;
  updateNavSmallTitle();
  const root = $('personalAppRoot'); if (root) root.scrollTo({ top: 0 });
  if (tabId === 'tab-dashboard') updateDashboardGreeting();
  if (tabId === 'tab-music') { renderMusicModule(); updateCurrentSongDisplayUI(); }
  if (tabId === 'tab-backup') renderSettingsPanel();
  try { sessionStorage.setItem('hz_last_tab', tabId); } catch (e) {}
}

function setSegActive(ids, activeId) {
  ids.forEach(id => { const b = $('btn-' + id); if (b) b.classList.toggle('active', id === activeId); });
}

function switchHubSubTab(subId) {
  document.querySelectorAll('.hub-sub-content').forEach(el => el.classList.add('hidden'));
  const target = $(subId); if (target) target.classList.remove('hidden');
  setSegActive(['sub-todo', 'sub-notes', 'sub-links', 'sub-countdown', 'sub-focus', 'sub-wallet'], subId);
  currentHubSub = subId;
  if ($('hubTitle')) $('hubTitle').textContent = L(HUB_KEYS[subId] || 'tab.hub');
  updateNavSmallTitle();
  if (subId === 'sub-focus') renderSleepLineChart();
  if (subId === 'sub-wallet') { walletSorting = false; renderWallet(); }
}

function switchWorkFinSubTab(subId) {
  document.querySelectorAll('.workfin-sub-content').forEach(el => el.classList.add('hidden'));
  const target = $(subId); if (target) target.classList.remove('hidden');
  setSegActive(['sub-kas', 'sub-photos', 'sub-worknotes', 'sub-docs', 'sub-upload', 'sub-contacts'], subId);
  currentWorkSub = subId;
  if ($('workTitle')) $('workTitle').textContent = L(WORK_KEYS[subId] || 'tab.work');
  updateNavSmallTitle();
  if (subId === 'sub-photos') renderPhotoGallery();
  if (subId === 'sub-docs') renderDocs();
  if (subId !== 'sub-photos' && typeof exitPhotoSelect === 'function') exitPhotoSelect();
}

function updateNavSmallTitle() {
  const el = $('navSmallTitle'); if (!el) return;
  if (currentTabId === 'tab-hub') el.textContent = $('hubTitle').textContent;
  else if (currentTabId === 'tab-workfin') el.textContent = $('workTitle').textContent;
  else if (currentTabId === 'tab-music') el.textContent = L(MEDIA_KEYS[currentMediaSub] || 'tab.music');
  else if (currentTabId === 'tab-backup') el.textContent = L('tab.settings');
  else el.textContent = L('tab.home');
}

function navigateFromQuickMenu(mainTabId, subTabId, labelText) {
  const labelEl = $('quickNavCurrentLabel');
  if (labelEl && labelText) labelEl.textContent = `Terakhir: ${labelText}`;
  switchTab(mainTabId);
  if (subTabId) {
    if (mainTabId === 'tab-music') switchMediaSub(subTabId);
    if (mainTabId === 'tab-hub') switchHubSubTab(subTabId);
    if (mainTabId === 'tab-workfin') switchWorkFinSubTab(subTabId);
  }
}

const SEARCH_MAP = [
  { label: 'Home / Dashboard', icon: 'fa-house', color: 'bg-blue', keys: ['home', 'dashboard', 'utama', 'widget'], action: () => switchTab('tab-dashboard') },
  { key: 'media.music', label: 'Music Library', icon: 'fa-music', color: 'bg-pink', keys: ['music', 'lagu', 'audio', 'song', 'lirik', 'offline'], action: () => { switchTab('tab-music'); switchMediaSub('sub-music'); } },
  { key: 'media.gallery', label: 'Galeri', icon: 'fa-images', color: 'bg-cyan', keys: ['galeri', 'gallery', 'foto', 'photos', 'album', 'lokasi'], action: () => { switchTab('tab-music'); switchMediaSub('sub-gallery'); } },
  { label: 'To-Do List', icon: 'fa-list-check', color: 'bg-blue', keys: ['todo', 'task', 'tugas', 'pengingat'], action: () => navigateFromQuickMenu('tab-hub', 'sub-todo') },
  { label: 'Mind Dump', icon: 'fa-note-sticky', color: 'bg-yellow', keys: ['note', 'mind', 'catatan'], action: () => navigateFromQuickMenu('tab-hub', 'sub-notes') },
  { label: 'Bookmarks', icon: 'fa-bookmark', color: 'bg-indigo', keys: ['bookmark', 'link', 'url'], action: () => navigateFromQuickMenu('tab-hub', 'sub-links') },
  { label: 'Countdown', icon: 'fa-hourglass-half', color: 'bg-purple', keys: ['countdown', 'timer', 'event'], action: () => navigateFromQuickMenu('tab-hub', 'sub-countdown') },
  { label: 'Focus & Sleep', icon: 'fa-moon', color: 'bg-indigo', keys: ['focus', 'pomodoro', 'stopwatch', 'sleep', 'tidur'], action: () => navigateFromQuickMenu('tab-hub', 'sub-focus') },
  { label: 'Wallet', icon: 'fa-wallet', color: 'bg-indigo', keys: ['wallet', 'kartu', 'member', 'qr', 'barcode', 'dompet'], action: () => navigateFromQuickMenu('tab-hub', 'sub-wallet') },
  { key: 'work.kas', label: 'Selisih Kas', icon: 'fa-scale-unbalanced', color: 'bg-mint', keys: ['kas', 'cash', 'selisih', 'uang', 'teller'], action: () => navigateFromQuickMenu('tab-workfin', 'sub-kas') },
  { key: 'work.photos', label: 'Bukti Kas', icon: 'fa-camera', color: 'bg-orange', keys: ['foto', 'photo', 'ktp', 'bukti', 'nasabah', 'galeri'], action: () => navigateFromQuickMenu('tab-workfin', 'sub-photos') },
  { key: 'work.notes', label: 'Catatan Kerja', icon: 'fa-clipboard', color: 'bg-brown', keys: ['kerja', 'catatan kerja', 'work'], action: () => navigateFromQuickMenu('tab-workfin', 'sub-worknotes') },
  { key: 'work.docs', label: 'Gudang File', icon: 'fa-box-archive', color: 'bg-indigo', keys: ['gudang', 'pdf', 'materi', 'dokumen', 'file'], action: () => navigateFromQuickMenu('tab-workfin', 'sub-docs') },
  { key: 'work.upload', label: 'Upload Drive', icon: 'fa-cloud-arrow-up', color: 'bg-green', keys: ['upload', 'drive'], action: () => navigateFromQuickMenu('tab-workfin', 'sub-upload') },
  { key: 'work.contacts', label: 'Kontak WA', icon: 'fa-address-book', color: 'bg-green', keys: ['contact', 'kontak', 'wa', 'whatsapp'], action: () => navigateFromQuickMenu('tab-workfin', 'sub-contacts') },
  { label: 'Settings & Backup', icon: 'fa-gear', color: 'bg-gray', keys: ['setting', 'backup', 'json', 'firebase', 'notif', 'gmail'], action: () => switchTab('tab-backup') }
];
function searchMatches(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  return SEARCH_MAP.filter(item => (item.key ? L(item.key) : item.label).toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.keys.some(k => k.includes(q) || q.includes(k)));
}
function filterTabs(query) {
  const found = searchMatches(query)[0];
  if (found) found.action();
}
function renderSearchSuggestions(query) {
  const box = $('searchSuggest'); if (!box) return;
  const items = searchMatches(query);
  if (!items.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = items.map((it, i) => `<button class="row" data-i="${i}"><span class="icon-tile ${it.color}"><i class="fas ${it.icon}"></i></span><span class="flex-1 row-title">${esc(it.key ? L(it.key) : it.label)}</span><i class="fas fa-chevron-right chev"></i></button>`).join('');
  box.querySelectorAll('button').forEach(b => b.onclick = () => { items[+b.dataset.i].action(); $('globalMenuSearch').value = ''; box.classList.add('hidden'); });
  box.classList.remove('hidden');
}

// ---------- RENDER ALL ----------
function renderAllModules() {
  const fns = [renderDashboardStats, renderCustomWebLinks, taRenderNotes, renderCountDownLog, renderNotesList, renderKasData,
    renderLinksList, renderContactsList, renderUploadHistory, renderDashboardTodayAgenda, renderDashboardUpcoming, renderFocusHistory,
    renderSleepLineChart, renderMusicModule, renderSettingsCategoryList, renderWorkNotes, renderPhotoGallery, renderDocs, renderStoragePanel, applyLabels, renderLabelEditor, renderGallery, renderStreak, renderWallet];
  fns.forEach(fn => { try { fn(); } catch (e) { console.error(fn.name, e); } });
}

// ---------- Scroll-driven nav bar ----------
function initNavbarScroll() {
  const root = $('personalAppRoot'), nav = $('topNavbar');
  if (!root || !nav) return;
  root.addEventListener('scroll', () => nav.classList.toggle('scrolled', root.scrollTop > 36), { passive: true });
}

// ---------- STREAK (hari berturut-turut membuka aplikasi) ----------
function recordVisit(fromRemote) {
  const today = wibDateStr();
  const days = appState.visitDays || (appState.visitDays = []);
  if (!days.includes(today)) {
    days.push(today); days.sort();
    if (days.length > 400) days.splice(0, days.length - 400);
    if (fromRemote) setTimeout(saveStateToLocal, 50); else saveStateToLocal();
  }
  renderStreak();
}
function streakStats() {
  const set = new Set(appState.visitDays || []);
  let cur = 0, d = set.has(wibDateStr()) ? 0 : -1;
  while (set.has(wibAddDays(d))) { cur++; d--; }
  let best = 0, run = 0, prev = null;
  Array.from(set).sort().forEach(day => {
    run = prev && addDaysToDateStr(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run); prev = day;
  });
  return { cur, best, total: set.size };
}
function renderStreak() {
  const el = $('streakCount'); if (!el) return;
  const { cur } = streakStats(); el.textContent = cur;
  $('streakPill').classList.toggle('cold', cur < 2);
}
function explainStreak() {
  const { cur, best, total } = streakStats();
  const last7 = Array.from({ length: 7 }, (_, i) => wibAddDays(i - 6)).map(d => (appState.visitDays || []).includes(d) ? '🔥' : '·').join(' ');
  iosAlert({ title: `🔥 ${cur} hari berturut-turut`, message: `Kamu membuka ${L('app.name')} ${cur} hari beruntun.\nRekor terbaik: ${best} hari · Total hari aktif: ${total}\n\n7 hari terakhir:\n${last7}\n\nBuka minimal sekali sehari agar streak tidak putus!` });
}
