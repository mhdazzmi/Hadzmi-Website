/* =========================================================
   NEXA SOCIAL — workspace Social Media Manager (Instagram klien)
   Tanpa login: semua perangkat yang membuka /social/ memakai data yang sama.
   Data teks : Firebase Realtime DB → node "hadzmi_social_data" (dibuka di aturan Firebase)
   Media     : Cloudflare R2 lewat rute publik /api/social/files (prefix social/) + thumbnail kecil di Firebase
   Mode demo : tambahkan ?demo=1 di alamat (data contoh, tidak menyentuh Firebase/R2)
   ========================================================= */
(function () {
'use strict';

// ---------------- KONFIGURASI ----------------
const firebaseConfig = {
  apiKey: "AIzaSyBoTr_A9JQsRTHri47o0ZPIQH21SxlBjh0",
  authDomain: "web-hadzmi-new.firebaseapp.com",
  databaseURL: "https://web-hadzmi-new-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-hadzmi-new",
  storageBucket: "web-hadzmi-new.firebasestorage.app",
  messagingSenderId: "664176294351",
  appId: "1:664176294351:web:5706e50b47d9cec546baba"
};
const DB_PATH = 'hadzmi_social_data';
const DEMO = !!window.SOCIAL_DEMO || /[?&]demo\b/.test(location.search);
const CACHE_KEY = DEMO ? 'social_demo_v1' : 'social_cache_v1';
const PENDING_KEY = 'social_pending_v1';
const UI_KEY = 'social_ui_v1';
const WIB = 7 * 3600 * 1000;
const COLS = ['clients', 'posts', 'media', 'ideas', 'templates', 'reports', 'invoices', 'tasks'];

const STATUS = [
  { k: 'ide', label: 'Ide' },
  { k: 'draft', label: 'Draft' },
  { k: 'review', label: 'Review' },
  { k: 'klien', label: 'Menunggu Klien' },
  { k: 'revisi', label: 'Revisi' },
  { k: 'setuju', label: 'Disetujui' },
  { k: 'jadwal', label: 'Terjadwal' },
  { k: 'posted', label: 'Terposting' }
];
const ST = Object.fromEntries(STATUS.map(s => [s.k, s]));
const TYPES = { feed: { label: 'Feed', icon: 'photo' }, carousel: { label: 'Carousel', icon: 'carousel' }, reels: { label: 'Reels', icon: 'reels' }, story: { label: 'Story', icon: 'story' } };
const CLIENT_COLORS = ['#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7', '#007AFF', '#5856D6', '#AF52DE', '#A2845E', '#8E8E93', '#FF3B30'];
const CAPTION_MAX = 2200, HASHTAG_MAX = 30;

// ---------------- IKON (gaya SF Symbols) ----------------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  stack: '<rect x="3" y="7" width="14" height="14" rx="2.5"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.7 2.6 2.4 3 5.2"/>',
  more: '<circle cx="12" cy="12" r="9.5"/><circle cx="7.5" cy="12" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="16.5" cy="12" r=".9" fill="currentColor"/>',
  plus: 'M12 5v14M5 12h14',
  photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 15.5-4.8-4.8L7 20"/>',
  carousel: '<rect x="7" y="3" width="14" height="14" rx="2.5"/><path d="M3 7v11a3 3 0 0 0 3 3h11"/>',
  reels: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8.5h18M8.5 3l2.5 5.5M14.5 3l2.5 5.5"/><path d="m10 12 4.5 2.7L10 17.4z"/>',
  story: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 2.2"/><path d="M12 8.5v7M8.5 12h7"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  hash: 'M5 9h15M4 15h15M10 3 8 21M16 3l-2 18',
  chart: 'M4 20V11M10 20V5M16 20v-6M21 20H3',
  wallet: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 9.5v.01M18 15.5v.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevL: 'm15 18-6-6 6-6', chevR: 'm9 18 6-6-6-6', chevD: 'm6 9 6 6 6-6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  checkc: '<circle cx="12" cy="12" r="9.5"/><path d="m7.5 12.3 3 3 6-6.3"/>',
  circle: '<circle cx="12" cy="12" r="9.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  upload: 'M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  download: 'M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  x: 'M6 6l12 12M18 6 6 18',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  pencil: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z',
  ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".7" fill="currentColor"/>',
  heart: 'M12 20s-7.5-4.6-9-9.3C2 7.3 4.4 4.5 7.4 4.5c2 0 3.5 1.1 4.6 2.7 1.1-1.6 2.6-2.7 4.6-2.7 3 0 5.4 2.8 4.4 6.2C19.5 15.4 12 20 12 20z',
  comment: 'M20.5 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z',
  send: 'M21.5 3 10 14.5M21.5 3l-7 18-4.5-6.5L3.5 10z',
  bookmark: 'M6 3.5h12v17l-6-4.5-6 4.5z',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4.8 4.8 0 0 1-.5 9.5z',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  task: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 3 3 5-6"/>',
  wa: 'M20.5 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z',
  back: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  refresh: 'M20 11a8 8 0 0 0-14.8-3.5M4 4v4h4M4 13a8 8 0 0 0 14.8 3.5M20 20v-4h-4',
  tray: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z'
};
const ic = (n, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${(ICONS[n] || '').charAt(0) === '<' ? ICONS[n] : `<path d="${ICONS[n] || ''}"/>`}</svg>`;

// ---------------- UTIL ----------------
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pad = n => String(n).padStart(2, '0');
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmt = (n, d = 0) => num(n).toLocaleString('id-ID', { maximumFractionDigits: d });
const rp = n => 'Rp ' + Math.round(num(n)).toLocaleString('id-ID');
const short = n => { n = num(n); if (Math.abs(n) >= 1e6) return fmt(n / 1e6, 1) + ' jt'; if (Math.abs(n) >= 1e4) return fmt(n / 1e3, 1) + ' rb'; return fmt(n); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const readLS = (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const haptic = ms => { try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (e) {} };
const clone = v => JSON.parse(JSON.stringify(v === undefined ? null : v));
const wibNow = () => new Date(Date.now() + WIB);
function today() { const w = wibNow(); return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`; }
function nowTime() { const w = wibNow(); return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`; }
function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function addMonths(month, n) { const [y, m] = month.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; }
function dayDiff(a, b) { const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 86400000); }
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAYS_S = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function dow(date) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function prettyDate(date, withDay, shortDay) { if (!date) return 'Tanpa tanggal'; const [y, m, d] = date.split('-').map(Number); return (withDay ? (shortDay ? DAYS_S : DAYS)[dow(date)] + ', ' : '') + `${d} ${MON[m - 1]}${y !== Number(today().slice(0, 4)) ? ' ' + y : ''}`; }
function relDay(date) { if (!date) return 'Tanpa tanggal'; const t = today(); if (date === t) return 'Hari ini'; if (date === addDays(t, 1)) return 'Besok'; if (date === addDays(t, -1)) return 'Kemarin'; return prettyDate(date, true, true); }
function monthLabel(month, shortM) { const [y, m] = month.split('-').map(Number); return (shortM ? MON : MONL)[m - 1] + ' ' + y; }
function agoText(ts) { const d = Math.floor((Date.now() - ts) / 86400000); if (d <= 0) { const h = Math.floor((Date.now() - ts) / 3600000); return h <= 0 ? 'baru saja' : h + ' jam lalu'; } return d + ' hari lalu'; }
function stampText(ts) { const w = new Date(ts + WIB); return `${w.getUTCDate()} ${MON[w.getUTCMonth()]} · ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`; }
function bytesText(b) { b = num(b); if (b >= 1024 ** 3) return fmt(b / 1024 ** 3, 2) + ' GB'; if (b >= 1024 ** 2) return fmt(b / 1024 ** 2, 1) + ' MB'; return fmt(b / 1024, 0) + ' KB'; }
const hashtags = s => (String(s || '').match(/#[\p{L}\p{N}_]+/gu) || []);
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const sortBy = (arr, f) => arr.slice().sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });

// ---------------- STATE ----------------
function blank() { const o = { settings: {} }; COLS.forEach(c => { o[c] = {}; }); return o; }
let S = Object.assign(blank(), readLS(CACHE_KEY, {}));
COLS.forEach(c => { if (!S[c] || typeof S[c] !== 'object') S[c] = {}; });
let pending = DEMO ? {} : readLS(PENDING_KEY, {});
const UI = Object.assign({ tab: 'home', fClient: '', calMonth: today().slice(0, 7), calSel: today(), cView: 'board', cStatus: '', q: '', mKind: '', tKind: 'caption', repClient: '', finFilter: 'all' }, readLS(UI_KEY, {}));
UI.calMonth = today().slice(0, 7); UI.calSel = today();
let stack = [];   // halaman detail di atas tab (mis. detail klien)
let dbRef = null, authed = false, started = false, syncMode = DEMO ? 'demo' : 'local';
const localUrls = {}; // mode demo: blob URL hasil unggah
const uploads = {};   // id media → persen unggahan
let saveTimer = null;
function saveCache() { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeLS(CACHE_KEY, S), 150); }
function saveUI() { writeLS(UI_KEY, { tab: UI.tab, fClient: UI.fClient, cView: UI.cView, mKind: UI.mKind, tKind: UI.tKind, repClient: UI.repClient, finFilter: UI.finFilter }); }

function setLocal(path, val) {
  const [col, key] = path.split('/');
  if (key === undefined) { S[col] = val == null ? {} : val; return; }
  if (!S[col] || typeof S[col] !== 'object') S[col] = {};
  if (val == null) delete S[col][key]; else S[col][key] = val;
}
function dbSet(path, val) {
  val = val == null ? null : clone(val);
  setLocal(path, val); saveCache();
  if (DEMO) return;
  pending[path] = val; writeLS(PENDING_KEY, pending);
  pushPath(path);
}
function pushPath(path) {
  if (!dbRef || !authed) return;
  const val = pending[path];
  dbRef.child(path).set(val === undefined ? null : val).then(() => {
    if (JSON.stringify(pending[path]) === JSON.stringify(val)) { delete pending[path]; writeLS(PENDING_KEY, pending); }
  }).catch(err => {
    console.warn('sync', path, err);
    if (/permission/i.test(String(err && (err.code || err.message)))) setSync('err');
  });
}
function flushPending() { Object.keys(pending).forEach(pushPath); }
function applyRemote(v) {
  v = v || {};
  COLS.forEach(c => { S[c] = v[c] && typeof v[c] === 'object' ? v[c] : {}; });
  S.settings = v.settings && typeof v.settings === 'object' ? v.settings : (S.settings || {});
  Object.keys(pending).forEach(p => setLocal(p, pending[p] == null ? null : clone(pending[p])));
  saveCache(); flushPending(); render();
}

// ---------------- SELECTORS ----------------
const clients = () => sortBy(Object.values(S.clients), c => (c.status === 'jeda' ? '1' : '0') + (c.name || '').toLowerCase());
const activeClients = () => clients().filter(c => c.status !== 'jeda');
const clientOf = id => S.clients[id] || null;
const cColor = id => (S.clients[id] && S.clients[id].color) || '#8E8E93';
const postsAll = () => Object.values(S.posts);
const postsF = () => postsAll().filter(p => !UI.fClient || p.clientId === UI.fClient);
const postKey = p => (p.date || '9999-99-99') + ' ' + (p.time || '99:99');
function isLate(p) { if (!p.date || p.status === 'posted' || p.status === 'ide') return false; const t = today(); return p.date < t || (p.date === t && p.time && p.time < nowTime() && p.status !== 'jadwal'); }
function postTitle(p) { if (p.title) return p.title; const l = String(p.caption || '').split('\n').find(x => x.trim()); return l ? l.slice(0, 60) : TYPES[p.type || 'feed'].label + ' tanpa judul'; }
function monthPosts(clientId, month) { return postsAll().filter(p => p.clientId === clientId && (p.date || '').slice(0, 7) === month); }
function pkgTotal(c) { const k = c.pkg || {}; return num(k.feed) + num(k.reels) + num(k.story); }
function pkgDone(clientId, month, type) { return monthPosts(clientId, month).filter(p => (p.status === 'posted' || p.status === 'jadwal') && (!type || (type === 'feed' ? (p.type === 'feed' || p.type === 'carousel') : p.type === type))).length; }
function needAction() { return postsAll().filter(p => p.status === 'revisi' || isLate(p)).length; }
function overdueInvoices() { const t = today(); return Object.values(S.invoices).filter(i => i.status !== 'lunas' && i.due && i.due < t); }
function mediaOfPost(p) { return (p.media || []).map(id => S.media[id]).filter(Boolean); }

// ---------------- SHELL ----------------
function shellHTML() {
  return `
<div id="app" class="shell hidden">
  <aside class="side" id="side"></aside>
  <div class="content">
    <header class="nav" id="nav"><div class="nav-left" id="navL"></div><div class="nav-title" id="navTitle"></div><div class="nav-right" id="navR"></div></header>
    <main class="page" id="page"></main>
  </div>
  <nav class="tabbar" id="tabbar"></nav>
</div>
<div id="sheets"></div>
<div class="toast" id="toast"></div>
<input type="file" id="fileInput" accept="image/*,video/*" multiple hidden>
<input type="file" id="importInput" accept="application/json,.json" hidden>`;
}

const TABS = [
  { k: 'home', label: 'Beranda', icon: 'home', tile: '#007AFF' },
  { k: 'calendar', label: 'Kalender', icon: 'cal', tile: '#FF3B30' },
  { k: 'content', label: 'Konten', icon: 'stack', tile: '#AF52DE' },
  { k: 'clients', label: 'Klien', icon: 'people', tile: '#34C759' },
  { k: 'more', label: 'Lainnya', icon: 'more', tile: '#8E8E93' }
];
const MORE = [
  { k: 'media', label: 'Media Library', icon: 'photo', tile: '#FF9500', sub: 'Foto & video di Cloudflare R2' },
  { k: 'ideas', label: 'Bank Ide', icon: 'bulb', tile: '#FFCC00', sub: 'Ide, tren & referensi' },
  { k: 'templates', label: 'Template', icon: 'doc', tile: '#5856D6', sub: 'Caption & grup hashtag' },
  { k: 'reports', label: 'Laporan', icon: 'chart', tile: '#30B0C7', sub: 'Insight bulanan per klien' },
  { k: 'finance', label: 'Keuangan', icon: 'wallet', tile: '#34C759', sub: 'Paket, tagihan & pembayaran' },
  { k: 'settings', label: 'Pengaturan', icon: 'gear', tile: '#8E8E93', sub: 'Sinkron, cadangan, keamanan' }
];
const ALL_PAGES = Object.fromEntries([...TABS, ...MORE].map(t => [t.k, t]));

function badgeFor(k) {
  if (k === 'content') return needAction();
  if (k === 'finance') return overdueInvoices().length;
  return 0;
}
function renderSide() {
  const btn = t => { const b = badgeFor(t.k); return `<button class="${UI.tab === t.k && !stack.length ? 'on' : ''}" data-a="tab" data-k="${t.k}"><span class="tile" style="background:${t.tile}">${ic(t.icon)}</span>${t.label}${b ? `<span class="badge">${b}</span>` : ''}</button>`; };
  $('side').innerHTML = `<div class="side-head"><div class="app-logo">${ic('ig')}</div><div><div class="b">Nexa Social</div><div class="t-cap muted">Social Media Manager</div></div></div>
    ${TABS.filter(t => t.k !== 'more').map(btn).join('')}
    <div class="side-sec">Alat</div>${MORE.map(btn).join('')}
    <div class="side-sec">Klien</div>${clients().map(c => `<button data-a="client" data-id="${c.id}"><span class="avatar sm" style="background:${c.color}">${esc(initials(c.name))}</span>${esc(c.name)}</button>`).join('') || '<div class="t-foot muted" style="padding:4px 10px">Belum ada klien</div>'}
    <a class="t-foot" href="../" style="padding:18px 10px 0">${ic('chevL')} Kembali ke Nexa</a>`;
}
function renderTabbar() {
  const cur = stack.length ? (stack[stack.length - 1].tab || UI.tab) : UI.tab;
  const isMore = MORE.some(m => m.k === cur);
  $('tabbar').innerHTML = TABS.map(t => { const b = badgeFor(t.k); const on = cur === t.k || (t.k === 'more' && isMore); return `<button class="${on ? 'on' : ''}" data-a="tab" data-k="${t.k}">${ic(t.icon)}${b ? `<span class="badge">${b}</span>` : ''}<span>${t.label}</span></button>`; }).join('');
}
function setSync(mode) {
  syncMode = mode;
  const el = $('syncPill'); if (!el) return;
  el.className = 'sync-pill ' + mode;
  $('syncText').textContent = { on: 'Sinkron', off: 'Offline', err: 'Ditolak', local: 'Lokal', demo: 'Demo' }[mode] || mode;
}
function syncPill() { return `<button class="sync-pill ${syncMode}" id="syncPill" data-a="explainSync"><span class="dot"></span><span id="syncText">${{ on: 'Sinkron', off: 'Offline', err: 'Ditolak', local: 'Lokal', demo: 'Demo' }[syncMode]}</span></button>`; }

function render() {
  if (!started) return;
  renderSide(); renderTabbar();
  const top = stack[stack.length - 1];
  const v = top ? VIEWS[top.v](top) : VIEWS[UI.tab]();
  $('navL').innerHTML = top ? `<button class="nav-back" data-a="back">${ic('chevL')}<span>${esc(top.backLabel || 'Kembali')}</span></button>` : (v.left || '');
  $('navTitle').textContent = v.title || '';
  $('navR').innerHTML = (v.right || '') ;
  $('nav').classList.toggle('always', !!v.navAlways);
  $('page').innerHTML = v.html;
  onScroll();
}
function go(tab) { UI.tab = tab; stack = []; saveUI(); render(); window.scrollTo(0, 0); }
function push(v) { stack.push(v); render(); window.scrollTo(0, 0); }
function onScroll() { $('nav').classList.toggle('scrolled', window.scrollY > 24); }

// ---------------- KOMPONEN ----------------
const avatar = (c, cls) => `<span class="avatar ${cls || ''}" style="background:${c ? c.color : '#8E8E93'}">${esc(initials(c ? c.name : '?'))}</span>`;
const pillSt = k => `<span class="pill st-${k}">${esc(ST[k] ? ST[k].label : k)}</span>`;
function phStyle(m, fallbackColor) {
  if (m && m.thumb) return '';
  const a = (m && m.ph && m.ph[0]) || fallbackColor || '#C7C7CC', b = (m && m.ph && m.ph[1]) || '#8E8E93';
  return `background:linear-gradient(135deg,${a},${b})`;
}
function mediaInner(m, iconFallback) {
  if (m && m.thumb) return `<img src="${m.thumb}" alt="" loading="lazy">`;
  if (m && localUrls[m.id] && m.kind === 'image') return `<img src="${localUrls[m.id]}" alt="">`;
  return ic(m && m.kind === 'video' ? 'play' : (iconFallback || 'photo'));
}
function postThumb(p, cls) {
  const m = mediaOfPost(p)[0];
  const t = TYPES[p.type || 'feed'];
  const multi = (p.media || []).length > 1 ? ic('carousel', 'tbadge') : (p.type === 'reels' ? ic('play', 'tbadge') : '');
  return `<span class="${cls || 'thumb'}" style="${m ? phStyle(m, cColor(p.clientId)) : ''}">${m ? mediaInner(m) + multi : ic(t.icon)}</span>`;
}
function postRow(p, opt) {
  opt = opt || {};
  const c = clientOf(p.clientId);
  const late = isLate(p);
  const when = opt.timeCol ? '' : ` · ${relDay(p.date)}${p.time ? ' ' + p.time : ''}`;
  return `<button class="row" data-a="post" data-id="${p.id}">
    ${opt.timeCol ? `<span class="time-col">${esc(p.time || '—')}<small>${TYPES[p.type || 'feed'].label}</small></span>` : ''}
    ${postThumb(p)}
    <span class="grow"><div class="ttl">${esc(postTitle(p))}</div>
      <div class="sub">${c ? '@' + esc(c.handle || c.name) : 'Tanpa klien'}${opt.timeCol ? '' : ' · ' + TYPES[p.type || 'feed'].label}${when}</div>
      ${opt.reason ? `<div class="row-meta">${opt.reason}</div>` : ''}</span>
    ${late && !opt.reason ? '<span class="pill warn">Terlambat</span>' : pillSt(p.status || 'draft')}
  </button>`;
}
function clientChips() {
  const cs = clients();
  if (!cs.length) return '';
  return `<div class="chips">${[`<button class="chip ${!UI.fClient ? 'on' : ''}" data-a="fClient" data-id="">Semua klien</button>`].concat(cs.map(c => `<button class="chip ${UI.fClient === c.id ? 'on' : ''}" data-a="fClient" data-id="${c.id}"><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}</button>`)).join('')}</div>`;
}
const empty = (icon, text, btn) => `<div class="list"><div class="empty">${ic(icon)}<div>${text}</div>${btn || ''}</div></div>`;
const group = (title, body, opt) => `<section class="group">${title ? `<div class="group-head"><h2>${title}</h2>${opt && opt.action ? opt.action : ''}</div>` : ''}${body}${opt && opt.foot ? `<div class="group-foot">${opt.foot}</div>` : ''}</section>`;
const largeTitle = (title, eyebrow, btn) => `<div class="large-title-row"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1 class="large-title">${esc(title)}</h1></div>${btn || ''}</div>`;
const plusBtn = (a, extra) => `<button class="round-btn" data-a="${a}" ${extra || ''} aria-label="Tambah">${ic('plus')}</button>`;
const demoBar = () => DEMO ? `<div class="demo-bar">${ic('sparkle')}<span><b>Mode pratinjau.</b> Semua data di bawah adalah contoh. Perubahan hanya tersimpan di browser ini.</span></div>` : '';

// ---------------- VIEW: BERANDA ----------------
const VIEWS = {};
VIEWS.home = () => {
  const t = today(), now = nowTime();
  const all = postsAll();
  const todayPosts = sortBy(all.filter(p => p.date === t && p.status !== 'ide'), postKey);
  const waiting = all.filter(p => p.status === 'klien');
  const revisi = all.filter(p => p.status === 'revisi');
  const late = all.filter(isLate);
  const next7 = sortBy(all.filter(p => p.date > t && p.date <= addDays(t, 7) && p.status !== 'ide'), postKey);
  const month = t.slice(0, 7);
  const name = (S.settings && S.settings.name) || 'Hadzmi';
  const h = Number(now.slice(0, 2));
  const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  const stat = (n, label, icon, color, a, k) => `<button class="stat" data-a="${a}" data-k="${k || ''}"><div class="stat-top"><span class="tile" style="background:${color}">${ic(icon)}</span><span class="stat-num">${n}</span></div><div class="stat-lbl">${label}</div></button>`;

  const action = [];
  late.forEach(p => action.push({ p, r: `<span class="pill warn">Terlambat</span><span class="t-cap muted">jadwal ${relDay(p.date)}${p.time ? ' ' + p.time : ''}</span>` }));
  revisi.forEach(p => { if (!isLate(p)) action.push({ p, r: `${pillSt('revisi')}<span class="t-cap muted">${p.stAt ? agoText(p.stAt) : ''}</span>` }); });
  waiting.forEach(p => { if (!isLate(p) && p.stAt && Date.now() - p.stAt > 2 * 86400000) action.push({ p, r: `${pillSt('klien')}<span class="t-cap muted">belum dibalas ${agoText(p.stAt)}</span>` }); });

  const tasks = sortBy(Object.values(S.tasks).filter(x => !x.done), x => x.due || '9999');
  const doneTasks = Object.values(S.tasks).filter(x => x.done).length;
  const unpaid = sortBy(Object.values(S.invoices).filter(i => i.status !== 'lunas'), i => i.due || '9999');

  const targets = activeClients().map(c => {
    const total = pkgTotal(c), done = pkgDone(c.id, month), pct = total ? Math.min(100, done / total * 100) : 0;
    return `<button class="row" data-a="client" data-id="${c.id}">${avatar(c)}<span class="grow prog-row"><span class="prog-line"><span class="b" style="color:var(--label)">${esc(c.name)}</span><span class="num">${done}/${total || '—'} post</span></span><span class="progress"><span style="width:${pct}%;background:${c.color}"></span></span></span></button>`;
  }).join('');

  return {
    title: 'Beranda',
    right: syncPill(),
    html: `${largeTitle(greet + ', ' + name, prettyDate(t, true))}
      ${demoBar()}
      <div class="stats">
        ${stat(todayPosts.length, 'Jadwal hari ini', 'cal', 'var(--blue)', 'tab', 'calendar')}
        ${stat(waiting.length, 'Menunggu klien', 'clock', 'var(--orange)', 'statFilter', 'klien')}
        ${stat(revisi.length, 'Perlu revisi', 'pencil', 'var(--purple)', 'statFilter', 'revisi')}
        ${stat(late.length, 'Terlambat', 'alert', 'var(--red)', 'statFilter', 'late')}
      </div>
      ${group('Hari ini', todayPosts.length ? `<div class="list">${todayPosts.map(p => postRow(p, { timeCol: true })).join('')}</div>` : empty('cal', 'Tidak ada jadwal posting hari ini.', `<button class="btn-tinted" data-a="newPost" data-date="${t}">${ic('plus')} Buat konten</button>`), { action: `<button data-a="tab" data-k="calendar">Kalender</button>` })}
      ${action.length ? group('Perlu tindakan', `<div class="list">${action.slice(0, 8).map(x => postRow(x.p, { reason: x.r })).join('')}</div>`) : ''}
      ${group('7 hari ke depan', next7.length ? `<div class="list">${next7.slice(0, 8).map(p => postRow(p)).join('')}</div>` : empty('tray', 'Belum ada konten terjadwal minggu ini.'), { foot: next7.length > 8 ? `+${next7.length - 8} konten lainnya di Kalender` : '' })}
      ${group('Tugas', `<div class="list">${tasks.map(taskRow).join('')}<button class="row action plain" data-a="newTask">${ic('plus')} Tambah tugas</button></div>`, { action: doneTasks ? `<button data-a="clearTasks">Hapus ${doneTasks} selesai</button>` : '' })}
      ${targets ? group('Target ' + monthLabel(month), `<div class="list">${targets}</div>`, { foot: 'Dihitung dari konten berstatus Terjadwal dan Terposting dibanding paket bulanan.' }) : ''}
      ${unpaid.length ? group('Tagihan belum lunas', `<div class="list">${unpaid.slice(0, 4).map(invoiceRow).join('')}</div>`, { action: `<button data-a="tab" data-k="finance">Keuangan</button>` }) : ''}
      ${!clients().length ? group('', empty('people', 'Mulai dengan menambahkan klien pertamamu.', `<button class="btn-tinted" data-a="newClient">${ic('plus')} Tambah klien</button>`)) : ''}`
  };
};
function taskRow(x) {
  const c = clientOf(x.clientId), t = today();
  const due = x.due ? (x.due < t ? `<span class="c-red">${relDay(x.due)}</span>` : relDay(x.due)) : '';
  return `<div class="row"><button data-a="toggleTask" data-id="${x.id}" style="font-size:24px;color:${x.done ? 'var(--green)' : 'var(--label3)'};display:flex" aria-label="Tandai selesai">${ic(x.done ? 'checkc' : 'circle')}</button>
    <button class="grow" data-a="editTask" data-id="${x.id}" style="text-align:left"><div class="ttl">${esc(x.text)}</div><div class="sub">${[c ? esc(c.name) : '', due].filter(Boolean).join(' · ') || 'Tanpa tenggat'}</div></button></div>`;
}

// ---------------- VIEW: KALENDER ----------------
VIEWS.calendar = () => {
  const [y, m] = UI.calMonth.split('-').map(Number);
  const first = `${UI.calMonth}-01`;
  const lead = (dow(first) + 6) % 7;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((lead + dim) / 7);
  const start = addDays(first, -lead), t = today();
  const byDate = {};
  postsF().forEach(p => { if (p.date && p.status !== 'ide') (byDate[p.date] = byDate[p.date] || []).push(p); });
  let cells = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), ps = sortBy(byDate[d] || [], postKey);
    cells += `<button class="cal-day ${d.slice(0, 7) !== UI.calMonth ? 'out' : ''} ${d === t ? 'today' : ''} ${d === UI.calSel ? 'sel' : ''}" data-a="calSel" data-d="${d}" aria-label="${prettyDate(d, true)}, ${ps.length} konten">
      <span class="d">${Number(d.slice(8))}</span><span class="cal-dots">${ps.slice(0, 3).map(p => `<i style="background:${cColor(p.clientId)}">${esc((p.time || '') + ' ' + (clientOf(p.clientId) || { name: '' }).name)}</i>`).join('')}${ps.length > 3 ? `<i style="background:var(--gray)">+${ps.length - 3}</i>` : ''}</span></button>`;
  }
  const sel = sortBy(byDate[UI.calSel] || [], postKey);
  const monthCount = postsF().filter(p => (p.date || '').slice(0, 7) === UI.calMonth && p.status !== 'ide').length;
  return {
    title: 'Kalender',
    right: `<button class="nav-btn" data-a="calToday" style="font-size:17px">Hari ini</button>`,
    html: `${largeTitle('Kalender', monthCount + ' konten bulan ini', plusBtn('newPost', `data-date="${UI.calSel}"`))}
      ${clientChips()}
      <div class="cal"><div class="cal-head"><span class="m">${monthLabel(UI.calMonth)}</span><span class="arrows"><button data-a="calNav" data-n="-1" aria-label="Bulan sebelumnya">${ic('chevL')}</button><button data-a="calNav" data-n="1" aria-label="Bulan berikutnya">${ic('chevR')}</button></span></div>
      <div class="cal-grid">${cells}</div></div>
      ${group(relDay(UI.calSel) === prettyDate(UI.calSel, true, true) ? prettyDate(UI.calSel, true) : relDay(UI.calSel) + ' · ' + prettyDate(UI.calSel), sel.length ? `<div class="list">${sel.map(p => postRow(p, { timeCol: true })).join('')}</div>` : empty('cal', 'Kosong. Ketuk + untuk menjadwalkan konten di tanggal ini.'), { action: `<button data-a="newPost" data-date="${UI.calSel}">Tambah</button>` })}`
  };
};

// ---------------- VIEW: KONTEN ----------------
VIEWS.content = () => {
  let ps = postsF();
  const counts = {}; STATUS.forEach(s => { counts[s.k] = 0; }); ps.forEach(p => { counts[p.status || 'draft']++; });
  const lateN = ps.filter(isLate).length;
  let body;
  if (UI.cView === 'board') {
    body = `<div class="board">${STATUS.map(s => {
      const items = sortBy(ps.filter(p => (p.status || 'draft') === s.k), postKey);
      if (s.k === 'posted') items.reverse();
      return `<div class="col"><div class="col-head">${pillSt(s.k)}<span class="n">${items.length}</span></div>
        ${items.slice(0, 30).map(kcard).join('') || `<div class="col-empty">Kosong</div>`}
        ${items.length > 30 ? `<div class="t-foot muted" style="padding:0 4px">+${items.length - 30} lainnya, lihat di Daftar</div>` : ''}</div>`;
    }).join('')}</div>`;
  } else {
    const q = UI.q.trim().toLowerCase();
    if (UI.cStatus === 'late') ps = ps.filter(isLate); else if (UI.cStatus) ps = ps.filter(p => (p.status || 'draft') === UI.cStatus);
    if (q) ps = ps.filter(p => (postTitle(p) + ' ' + (p.caption || '') + ' ' + (p.pillar || '') + ' ' + ((clientOf(p.clientId) || {}).name || '')).toLowerCase().includes(q));
    ps = sortBy(ps, postKey);
    const groups = {};
    ps.forEach(p => { const k = p.date ? p.date.slice(0, 7) : 'none'; (groups[k] = groups[k] || []).push(p); });
    const chips = `<div class="chips"><button class="chip ${!UI.cStatus ? 'on' : ''}" data-a="cStatus" data-k="">Semua <span class="n">${postsF().length}</span></button>${lateN ? `<button class="chip ${UI.cStatus === 'late' ? 'on' : ''}" data-a="cStatus" data-k="late"><span class="cdot" style="background:var(--red)"></span>Terlambat <span class="n">${lateN}</span></button>` : ''}${STATUS.map(s => `<button class="chip ${UI.cStatus === s.k ? 'on' : ''}" data-a="cStatus" data-k="${s.k}">${esc(s.label)} <span class="n">${counts[s.k]}</span></button>`).join('')}</div>`;
    body = `<div class="form"><div class="field">${ic('search', 'faint')}<input id="qInput" type="search" placeholder="Cari judul, caption, pilar…" value="${esc(UI.q)}" style="text-align:left" autocomplete="off"></div></div>${chips}
      ${Object.keys(groups).length ? Object.keys(groups).sort().map(k => group(k === 'none' ? 'Tanpa tanggal' : monthLabel(k), `<div class="list">${groups[k].map(p => postRow(p)).join('')}</div>`)).join('') : empty('stack', 'Tidak ada konten yang cocok.')}`;
  }
  return {
    title: 'Konten',
    html: `${largeTitle('Konten', ps.length + ' konten' + (lateN ? ` · <span class="c-red">${lateN} terlambat</span>` : ''), plusBtn('newPost'))}
      ${clientChips()}
      <div class="seg" style="max-width:280px"><button class="${UI.cView === 'board' ? 'on' : ''}" data-a="cView" data-k="board">Papan alur</button><button class="${UI.cView === 'list' ? 'on' : ''}" data-a="cView" data-k="list">Daftar</button></div>
      ${body}`
  };
};
function kcard(p) {
  const c = clientOf(p.clientId), m = mediaOfPost(p)[0], t = TYPES[p.type || 'feed'];
  const multi = (p.media || []).length > 1 ? ic('carousel', 'tbadge') : (p.type === 'reels' ? ic('play', 'tbadge') : '');
  return `<button class="kcard" data-a="post" data-id="${p.id}">
    <span class="media ${p.type || ''}" style="${m ? phStyle(m, cColor(p.clientId)) : ''}">${m ? mediaInner(m) + multi : ic(t.icon)}</span>
    <span class="k-title">${esc(postTitle(p))}</span>
    ${p.caption ? `<span class="k-cap">${esc(p.caption)}</span>` : ''}
    <span class="k-foot"><span style="display:flex;align-items:center;gap:6px;min-width:0">${avatar(c, 'sm')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.label)}</span></span><span class="${isLate(p) ? 'c-red b' : ''}">${p.date ? relDay(p.date) + (p.time ? ' ' + p.time : '') : '—'}</span></span>
  </button>`;
}

// ---------------- VIEW: KLIEN ----------------
VIEWS.clients = () => {
  const month = today().slice(0, 7);
  const cs = clients();
  return {
    title: 'Klien',
    html: `${largeTitle('Klien', cs.length + ' akun Instagram', plusBtn('newClient'))}
      ${cs.length ? `<div class="list">${cs.map(c => {
        const total = pkgTotal(c), done = pkgDone(c.id, month);
        return `<button class="row" data-a="client" data-id="${c.id}">${avatar(c)}<span class="grow"><div class="ttl">${esc(c.name)}</div><div class="sub">@${esc(c.handle || '')}${c.niche ? ' · ' + esc(c.niche) : ''}</div></span>${c.status === 'jeda' ? '<span class="pill st-ide">Jeda</span>' : `<span class="val num">${done}/${total || '—'}</span>`}${ic('chevR', 'chev')}</button>`;
      }).join('')}</div>` : empty('people', 'Belum ada klien.', `<button class="btn-tinted" data-a="newClient">${ic('plus')} Tambah klien</button>`)}`
  };
};
VIEWS.client = (v) => {
  const c = clientOf(v.id);
  if (!c) return { title: '', html: empty('people', 'Klien ini sudah dihapus.') };
  const t = today(), month = t.slice(0, 7), k = c.pkg || {}, b = c.brand || {};
  const prog = (label, type, target) => { const done = pkgDone(c.id, month, type); const pct = target ? Math.min(100, done / target * 100) : 0; return `<div class="row plain"><span class="grow prog-row"><span class="prog-line"><span style="color:var(--label)">${label}</span><span class="num">${done} / ${target || 0}</span></span><span class="progress"><span style="width:${pct}%;background:${c.color}"></span></span></span></div>`; };
  const upcoming = sortBy(postsAll().filter(p => p.clientId === c.id && p.status !== 'posted' && p.status !== 'ide'), postKey).slice(0, 6);
  const invs = sortBy(Object.values(S.invoices).filter(i => i.clientId === c.id), i => i.period || '').reverse().slice(0, 3);
  const reps = sortBy(Object.values(S.reports).filter(r => r.clientId === c.id), r => r.month);
  const lastRep = reps[reps.length - 1];
  const kv = (kk, vv) => vv ? `<div class="kv"><div class="k">${kk}</div><div class="v">${vv}</div></div>` : '';
  const colors = (b.colors || []).filter(Boolean);
  return {
    title: c.name, navAlways: false,
    right: `<button class="nav-btn" data-a="editClient" data-id="${c.id}" style="font-size:17px">Edit</button>`,
    html: `<div class="client-hero">${avatar(c, 'lg')}<div class="t-title2">${esc(c.name)}</div><div class="handle">@${esc(c.handle || '')}${c.niche ? ' · ' + esc(c.niche) : ''}</div>
        ${c.status === 'jeda' ? '<span class="pill st-ide">Kontrak dijeda</span>' : ''}
        <div class="btn-row"><button class="btn-tinted" data-a="newPost" data-client="${c.id}">${ic('plus')} Konten</button><button class="btn-tinted gray" data-a="gridPreview" data-id="${c.id}">${ic('grid')} Grid IG</button>${c.handle ? `<a class="btn-tinted gray" href="https://instagram.com/${encodeURIComponent(c.handle)}" target="_blank" rel="noopener">${ic('ig')} Profil</a>` : ''}</div></div>
      ${group('Paket ' + monthLabel(month), `<div class="list flat">${prog('Feed & Carousel', 'feed', num(k.feed))}${prog('Reels', 'reels', num(k.reels))}${prog('Story', 'story', num(k.story))}</div>`, { foot: k.price ? `Nilai kontrak ${rp(k.price)} per bulan.` : '' })}
      ${group('Konten berikutnya', upcoming.length ? `<div class="list">${upcoming.map(p => postRow(p)).join('')}</div>` : empty('tray', 'Tidak ada konten dalam antrean.'), { action: `<button data-a="clientPosts" data-id="${c.id}">Semua</button>` })}
      ${group('Brand kit', `<div class="list">
        ${colors.length ? `<div class="kv"><div class="k">Palet warna</div><div class="palette" style="margin-top:6px">${colors.map(x => `<div class="swatch"><span style="background:${esc(x)}"></span>${esc(x.toUpperCase())}</div>`).join('')}</div></div>` : ''}
        ${kv('Font', esc(b.fonts))}${kv('Tone of voice', esc(b.tone))}${kv('Pilar konten', esc(c.pillars))}
        ${b.hashtags ? `<div class="kv"><div class="k">Hashtag andalan</div><div class="tags" style="margin-top:4px">${hashtags(b.hashtags).map(h => `<span class="tag">${esc(h)}</span>`).join('')}</div></div>` : ''}
        ${kv('Lakukan', esc(b.dos))}${kv('Hindari', esc(b.donts))}
        ${!colors.length && !b.fonts && !b.tone && !b.hashtags && !b.dos && !b.donts ? `<div class="empty">Brand kit belum diisi.<button class="btn-tinted" data-a="editClient" data-id="${c.id}">Isi brand kit</button></div>` : ''}
        </div>`, { action: b.hashtags ? `<button data-a="copyText" data-text="${esc(hashtags(b.hashtags).join(' '))}">Salin hashtag</button>` : '' })}
      ${group('Kontak', `<div class="list">${kv('PIC', esc(c.pic))}${c.phone ? `<div class="row plain"><span class="grow"><div class="t-foot muted">WhatsApp</div><div class="ttl num" style="user-select:all">${esc(c.phone)}</div></span><button class="btn-tinted gray" data-a="copyText" data-text="${esc(c.phone)}">${ic('copy')}</button><a class="btn-tinted green" href="${waLink(c.phone, '')}" target="_blank" rel="noopener">${ic('wa')} Chat</a></div>` : ''}${kv('Folder aset', c.drive ? `<a href="${esc(c.drive)}" target="_blank" rel="noopener">${esc(c.drive)}</a>` : '')}${kv('Mulai kontrak', c.start ? prettyDate(c.start) : '')}${kv('Catatan', esc(c.notes))}${!c.pic && !c.phone && !c.drive && !c.notes ? '<div class="empty">Belum ada info kontak.</div>' : ''}</div>`)}
      ${group('Laporan terakhir', lastRep ? `<div class="list"><button class="row" data-a="openReports" data-id="${c.id}"><span class="tile" style="background:var(--teal)">${ic('chart')}</span><span class="grow"><div class="ttl">${monthLabel(lastRep.month)}</div><div class="sub">${short(lastRep.followers)} followers · ER ${fmt(erOf(lastRep), 2)}%</div></span>${ic('chevR', 'chev')}</button></div>` : empty('chart', 'Belum ada laporan.', `<button class="btn-tinted" data-a="newReport" data-client="${c.id}">Isi laporan</button>`))}
      ${group('Tagihan', invs.length ? `<div class="list">${invs.map(invoiceRow).join('')}</div>` : empty('wallet', 'Belum ada tagihan.', `<button class="btn-tinted" data-a="newInvoice" data-client="${c.id}">Buat tagihan</button>`))}`
  };
};

// ---------------- VIEW: LAINNYA ----------------
VIEWS.more = () => ({
  title: 'Lainnya',
  html: `${largeTitle('Lainnya')}
    <div class="list">${MORE.map(m => { const b = badgeFor(m.k); return `<button class="row" data-a="tab" data-k="${m.k}"><span class="tile" style="background:${m.tile}">${ic(m.icon)}</span><span class="grow"><div class="ttl">${m.label}</div><div class="sub">${m.sub}</div></span>${b ? `<span class="badge">${b}</span>` : ''}${ic('chevR', 'chev')}</button>`; }).join('')}</div>
    <div class="list"><a class="row" href="../"><span class="tile" style="background:#1C1C1E">${ic('back')}</span><span class="grow"><div class="ttl">Kembali ke Nexa</div></span>${ic('chevR', 'chev')}</a></div>`
});

// ---------------- VIEW: MEDIA ----------------
VIEWS.media = () => {
  let ms = sortBy(Object.values(S.media), m => -(m.at || 0));
  if (UI.fClient) ms = ms.filter(m => m.clientId === UI.fClient);
  const nImg = ms.filter(m => m.kind !== 'video').length, nVid = ms.length - nImg;
  if (UI.mKind) ms = ms.filter(m => (m.kind === 'video') === (UI.mKind === 'video'));
  const used = usedMediaIds();
  const total = Object.values(S.media).reduce((a, m) => a + num(m.size), 0);
  return {
    title: 'Media Library',
    html: `${largeTitle('Media', `${Object.keys(S.media).length} file · ${bytesText(total)}`, plusBtn('upload'))}
      ${clientChips()}
      <div class="seg" style="max-width:320px"><button class="${!UI.mKind ? 'on' : ''}" data-a="mKind" data-k="">Semua</button><button class="${UI.mKind === 'image' ? 'on' : ''}" data-a="mKind" data-k="image">Foto ${nImg}</button><button class="${UI.mKind === 'video' ? 'on' : ''}" data-a="mKind" data-k="video">Video ${nVid}</button></div>
      ${ms.length ? `<div class="mgrid">${ms.map(m => mediaCell(m, { used: used.has(m.id) })).join('')}</div>` : empty('photo', 'Belum ada media. Unggah foto atau video, disimpan di Cloudflare R2.', `<button class="btn-tinted" data-a="upload">${ic('upload')} Unggah</button>`)}
      <div class="group-foot">Titik warna menandai klien. Media yang belum dipakai di konten mana pun diberi label "Baru".</div>`
  };
};
function usedMediaIds() { const s = new Set(); postsAll().forEach(p => (p.media || []).forEach(id => s.add(id))); return s; }
function mediaCell(m, opt) {
  opt = opt || {};
  const pct = uploads[m.id];
  return `<button class="mcell ${opt.picked ? 'picked' : ''}" data-a="${opt.pick ? 'pickToggle' : 'mediaView'}" data-id="${m.id}" style="${phStyle(m, cColor(m.clientId))}" aria-label="${esc(m.name || 'media')}">
    ${mediaInner(m)}
    ${m.kind === 'video' ? `<span class="mbadge">${ic('play')}${m.dur ? fmtDur(m.dur) : ''}</span>` : (opt.used === false ? '<span class="mbadge">Baru</span>' : '')}
    ${m.clientId && !opt.pick ? `<span class="cdot" style="background:${cColor(m.clientId)}"></span>` : ''}
    ${opt.pick ? `<span class="sel">${opt.picked ? opt.order : ''}</span>` : ''}
    ${pct != null ? `<span class="prog" id="prog-${m.id}"><span style="width:${pct}%"></span></span>` : ''}
  </button>`;
}
const fmtDur = s => { s = Math.round(num(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };

// ---------------- VIEW: IDE ----------------
VIEWS.ideas = () => {
  let xs = sortBy(Object.values(S.ideas), x => (x.done ? '1' : '0') + (9e15 - (x.at || 0)));
  if (UI.fClient) xs = xs.filter(x => x.clientId === UI.fClient || !x.clientId);
  return {
    title: 'Bank Ide',
    html: `${largeTitle('Bank Ide', Object.values(S.ideas).filter(x => !x.done).length + ' ide aktif', plusBtn('newIdea'))}
      ${clientChips()}
      <div class="form"><div class="field">${ic('bulb', 'faint')}<input id="quickIdea" placeholder="Tulis ide cepat lalu Enter…" style="text-align:left" autocomplete="off"></div></div>
      ${xs.length ? `<div class="list">${xs.map(x => { const c = clientOf(x.clientId); return `<button class="row" data-a="ideaMenu" data-id="${x.id}" style="${x.done ? 'opacity:.5' : ''}"><span class="tile" style="background:${x.done ? 'var(--gray)' : 'var(--yellow)'}">${ic(x.done ? 'check' : 'bulb')}</span><span class="grow"><div class="ttl" style="white-space:normal">${esc(x.text)}</div><div class="sub">${[c ? esc(c.name) : 'Umum', x.tag ? '#' + esc(x.tag) : '', x.ref ? 'ada referensi' : '', x.at ? agoText(x.at) : ''].filter(Boolean).join(' · ')}</div></span>${ic('chevR', 'chev')}</button>`; }).join('')}</div>` : empty('bulb', 'Simpan ide konten, tren audio, atau referensi akun lain di sini.')}`
  };
};

// ---------------- VIEW: TEMPLATE ----------------
VIEWS.templates = () => {
  let xs = sortBy(Object.values(S.templates).filter(x => (x.kind || 'caption') === UI.tKind), x => (x.title || '').toLowerCase());
  if (UI.fClient) xs = xs.filter(x => x.clientId === UI.fClient || !x.clientId);
  return {
    title: 'Template',
    html: `${largeTitle('Template', 'Ketuk untuk menyalin', plusBtn('newTemplate'))}
      ${clientChips()}
      <div class="seg" style="max-width:280px"><button class="${UI.tKind === 'caption' ? 'on' : ''}" data-a="tKind" data-k="caption">Caption</button><button class="${UI.tKind === 'hashtag' ? 'on' : ''}" data-a="tKind" data-k="hashtag">Grup hashtag</button></div>
      ${xs.length ? `<div class="list">${xs.map(x => { const c = clientOf(x.clientId); const n = hashtags(x.body).length; return `<button class="row" data-a="tplMenu" data-id="${x.id}"><span class="tile" style="background:${x.kind === 'hashtag' ? 'var(--indigo)' : 'var(--purple)'}">${ic(x.kind === 'hashtag' ? 'hash' : 'doc')}</span><span class="grow"><div class="ttl">${esc(x.title || 'Tanpa judul')}</div><div class="sub">${c ? esc(c.name) + ' · ' : ''}${x.kind === 'hashtag' ? n + ' hashtag' : esc(String(x.body || '').replace(/\s+/g, ' ').slice(0, 80))}</div></span>${ic('copy', 'chev')}</button>`; }).join('')}</div>` : empty(UI.tKind === 'hashtag' ? 'hash' : 'doc', UI.tKind === 'hashtag' ? 'Simpan grup hashtag per niche supaya tinggal sisip.' : 'Simpan struktur caption yang sering dipakai, misalnya promo atau edukasi.')}
      <div class="group-foot">Tulis {nama}, {handle} atau {tanggal} di template. Saat disisipkan ke konten, otomatis diganti sesuai klien.</div>`
  };
};

// ---------------- VIEW: LAPORAN ----------------
function erOf(r) { const reach = num(r.reach); return reach ? num(r.engagement) / reach * 100 : 0; }
VIEWS.reports = () => {
  const cs = clients();
  if (!cs.length) return { title: 'Laporan', html: `${largeTitle('Laporan')}${empty('chart', 'Tambahkan klien dulu untuk mengisi laporan.')}` };
  if (!UI.repClient || !S.clients[UI.repClient]) UI.repClient = (UI.fClient && S.clients[UI.fClient]) ? UI.fClient : cs[0].id;
  const c = S.clients[UI.repClient];
  const reps = sortBy(Object.values(S.reports).filter(r => r.clientId === c.id), r => r.month);
  const last = reps[reps.length - 1], prev = reps[reps.length - 2];
  const chips = `<div class="chips">${cs.map(x => `<button class="chip ${x.id === c.id ? 'on' : ''}" data-a="repClient" data-id="${x.id}"><span class="cdot" style="background:${x.color}"></span>${esc(x.name)}</button>`).join('')}</div>`;
  let body = '';
  if (last) {
    const growth = prev ? num(last.followers) - num(prev.followers) : 0;
    const dlt = (a, b, pct) => { if (b == null) return ''; const d = pct ? a - b : (b ? (a - b) / b * 100 : 0); if (!Number.isFinite(d) || (!b && !pct)) return ''; return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 1)}${pct ? ' poin' : '%'}</span>`; };
    const postedN = monthPosts(c.id, last.month).filter(p => p.status === 'posted').length;
    body = `
      <div class="chart-card"><div class="ct"><div><div class="t-foot muted">Followers · ${monthLabel(last.month, true)}</div><div class="big">${fmt(last.followers)}</div></div>${prev ? `<span class="delta ${growth >= 0 ? 'up' : 'down'}">${growth >= 0 ? '+' : ''}${fmt(growth)} dari bulan lalu</span>` : ''}</div>${lineChart(reps.slice(-6))}</div>
      <div class="metrics">
        <div class="metric"><div class="k">Reach</div><div class="v">${short(last.reach)}</div>${dlt(num(last.reach), prev && num(prev.reach))}</div>
        <div class="metric"><div class="k">Impressions</div><div class="v">${short(last.impressions)}</div>${dlt(num(last.impressions), prev && num(prev.impressions))}</div>
        <div class="metric"><div class="k">Interaksi</div><div class="v">${short(last.engagement)}</div>${dlt(num(last.engagement), prev && num(prev.engagement))}</div>
        <div class="metric"><div class="k">Engagement rate</div><div class="v">${fmt(erOf(last), 2)}%</div>${dlt(erOf(last), prev ? erOf(prev) : null, true)}</div>
        <div class="metric"><div class="k">Kunjungan profil</div><div class="v">${short(last.visits)}</div>${dlt(num(last.visits), prev && num(prev.visits))}</div>
        <div class="metric"><div class="k">Konten terposting</div><div class="v">${postedN}</div><span class="t-cap muted">dari kalender</span></div>
      </div>
      ${last.top || last.notes ? `<div class="list">${last.top ? `<div class="kv"><div class="k">Konten terbaik</div><div class="v">${esc(last.top)}</div></div>` : ''}${last.notes ? `<div class="kv"><div class="k">Catatan & rencana</div><div class="v">${esc(last.notes)}</div></div>` : ''}</div>` : ''}
      <div class="btn-row"><button class="btn-tinted" data-a="shareReport" data-id="${last.id}">${ic('send')} Kirim ringkasan ke klien</button></div>`;
  } else body = empty('chart', `Belum ada laporan untuk ${esc(c.name)}. Salin angka dari Instagram Insights setiap akhir bulan.`);
  return {
    title: 'Laporan',
    html: `${largeTitle('Laporan', 'Insight bulanan', plusBtn('newReport', `data-client="${c.id}"`))}${chips}${body}
      ${reps.length ? group('Riwayat', `<div class="list">${reps.slice().reverse().map(r => `<button class="row" data-a="editReport" data-id="${r.id}"><span class="grow"><div class="ttl">${monthLabel(r.month)}</div><div class="sub">${fmt(r.followers)} followers · reach ${short(r.reach)} · ER ${fmt(erOf(r), 2)}%</div></span>${ic('chevR', 'chev')}</button>`).join('')}</div>`) : ''}`
  };
};
function lineChart(reps) {
  if (reps.length < 2) return `<div class="t-foot muted" style="padding:8px 0">Grafik muncul setelah ada 2 bulan data.</div>`;
  const W = 320, H = 120, L = 34, R = 8, T = 10, B = 20;
  const vals = reps.map(r => num(r.followers));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || hi * .1 || 1; lo = Math.max(0, lo - span * .15); hi = hi + span * .15;
  const x = i => L + i * (W - L - R) / (reps.length - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const ticks = [lo, (lo + hi) / 2, hi];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik followers">
    <defs><linearGradient id="fgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#007AFF" stop-opacity=".22"/><stop offset="1" stop-color="#007AFF" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(tv => `<line x1="${L}" x2="${W - R}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}" stroke="rgba(60,60,67,.12)" stroke-width="1"/><text x="${L - 6}" y="${(y(tv) + 3).toFixed(1)}" text-anchor="end">${short(tv)}</text>`).join('')}
    <polygon points="${x(0).toFixed(1)},${H - B} ${pts.join(' ')} ${x(reps.length - 1).toFixed(1)},${H - B}" fill="url(#fgr)"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="#007AFF" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === vals.length - 1 ? 4 : 2.5}" fill="${i === vals.length - 1 ? '#007AFF' : '#fff'}" stroke="#007AFF" stroke-width="1.8"/>`).join('')}
    ${reps.map((r, i) => `<text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle">${MON[Number(r.month.slice(5)) - 1]}</text>`).join('')}
  </svg>`;
}

// ---------------- VIEW: KEUANGAN ----------------
function invoiceRow(i) {
  const c = clientOf(i.clientId), t = today();
  const late = i.status !== 'lunas' && i.due && i.due < t;
  return `<button class="row" data-a="editInvoice" data-id="${i.id}">${avatar(c)}<span class="grow"><div class="ttl">${esc(c ? c.name : 'Klien dihapus')}</div><div class="sub">${esc(i.no || '')}${i.period ? ' · ' + monthLabel(i.period, true) : ''}${i.status === 'lunas' ? (i.paidAt ? ' · dibayar ' + prettyDate(i.paidAt) : '') : (i.due ? ' · tempo ' + prettyDate(i.due) : '')}</div></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:3px"><span class="b num" style="font-size:15px">${rp(i.amount)}</span>${i.status === 'lunas' ? '<span class="pill st-posted">Lunas</span>' : late ? '<span class="pill warn">Terlambat</span>' : '<span class="pill st-klien">Belum</span>'}</span></button>`;
}
VIEWS.finance = () => {
  const month = today().slice(0, 7);
  const all = Object.values(S.invoices);
  const thisM = all.filter(i => i.period === month);
  const sum = xs => xs.reduce((a, i) => a + num(i.amount), 0);
  const unpaid = all.filter(i => i.status !== 'lunas'), late = overdueInvoices();
  const paidM = all.filter(i => i.status === 'lunas' && (i.paidAt || '').slice(0, 7) === month);
  const mrr = activeClients().reduce((a, c) => a + num((c.pkg || {}).price), 0);
  let xs = sortBy(all, i => (i.status === 'lunas' ? '1' : '0') + (i.due || i.period || '')).filter(i => UI.finFilter === 'all' || (UI.finFilter === 'lunas' ? i.status === 'lunas' : i.status !== 'lunas'));
  const stat = (v, label, color, icon) => `<div class="stat"><div class="stat-top"><span class="tile" style="background:${color}">${ic(icon)}</span></div><div class="stat-num" style="font-size:20px">${v}</div><div class="stat-lbl">${label}</div></div>`;
  const missing = activeClients().filter(c => num((c.pkg || {}).price) && !thisM.some(i => i.clientId === c.id));
  return {
    title: 'Keuangan',
    html: `${largeTitle('Keuangan', monthLabel(month), plusBtn('newInvoice'))}
      <div class="stats">
        ${stat(rp(mrr), 'Nilai kontrak per bulan', 'var(--indigo)', 'wallet')}
        ${stat(rp(sum(paidM)), 'Diterima bulan ini', 'var(--green)', 'check')}
        ${stat(rp(sum(unpaid)), unpaid.length + ' tagihan belum lunas', 'var(--orange)', 'clock')}
        ${stat(rp(sum(late)), late.length + ' lewat jatuh tempo', 'var(--red)', 'alert')}
      </div>
      ${missing.length ? `<div class="list"><button class="row action" data-a="bulkInvoice">${ic('plus')}<span class="grow">Buat tagihan ${monthLabel(month, true)} untuk ${missing.length} klien</span></button></div>` : ''}
      <div class="seg" style="max-width:320px"><button class="${UI.finFilter === 'all' ? 'on' : ''}" data-a="finFilter" data-k="all">Semua</button><button class="${UI.finFilter === 'belum' ? 'on' : ''}" data-a="finFilter" data-k="belum">Belum lunas</button><button class="${UI.finFilter === 'lunas' ? 'on' : ''}" data-a="finFilter" data-k="lunas">Lunas</button></div>
      ${xs.length ? `<div class="list">${xs.map(invoiceRow).join('')}</div>` : empty('wallet', 'Belum ada tagihan di sini.')}`
  };
};

// ---------------- VIEW: PENGATURAN ----------------
VIEWS.settings = () => {
  const nPend = Object.keys(pending).length;
  return {
    title: 'Pengaturan',
    html: `${largeTitle('Pengaturan')}
      <div><div class="form-head">Profil</div><div class="form"><div class="field"><label for="setName">Nama panggilan</label><input id="setName" value="${esc((S.settings && S.settings.name) || '')}" placeholder="Hadzmi"></div></div><div class="form-foot">Dipakai di sapaan Beranda.</div></div>
      ${group('Penyimpanan', `<div class="list">
        <button class="row" data-a="explainSync"><span class="tile" style="background:var(--orange)">${ic('cloud')}</span><span class="grow"><div class="ttl">Firebase · teks</div><div class="sub">${{ on: 'Tersinkron realtime', off: 'Offline, sinkron otomatis saat online', err: 'Ditolak Rules, tambahkan hadzmi_social_data', local: 'Firebase tidak termuat', demo: 'Mode pratinjau, tidak tersambung' }[syncMode]}${nPend ? ` · ${nPend} menunggu` : ''}</div></span>${ic('chevR', 'chev')}</button>
        <div class="row"><span class="tile" style="background:#F38020">${ic('photo')}</span><span class="grow"><div class="ttl">Cloudflare R2 · media</div><div class="sub">${DEMO ? 'Mode pratinjau, file hanya di memori' : `${Object.keys(S.media).length} file · ${bytesText(Object.values(S.media).reduce((a, m) => a + num(m.size), 0))} · batas 200 MB per file`}</div></span></div>
      </div>`)}
      ${group('Cadangan', `<div class="list"><button class="row action" data-a="exportJson">${ic('download')}<span class="grow">Ekspor semua data (JSON)</span></button><button class="row action" data-a="importJson">${ic('upload')}<span class="grow">Pulihkan dari file JSON</span></button></div>`, { foot: 'Cadangan berisi teks dan thumbnail. File media asli tetap di R2.' })}
      ${DEMO ? group('Pratinjau', `<div class="list"><button class="row action" data-a="resetDemo">${ic('refresh')}<span class="grow">Muat ulang data contoh</span></button></div>`) : ''}
      <div class="group-foot" style="text-align:center">Nexa Social · tanpa login. Siapa pun yang tahu alamat web ini bisa membuka datanya, jadi jangan bagikan linknya.</div>`
  };
};

// ---------------- SHEET ----------------
const sheets = [];
function openSheet(o) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
    <div class="sheet-head"><button class="sh-l" data-sh="left">${esc(o.left || 'Batal')}</button><div class="sh-title">${esc(o.title || '')}</div>${o.right ? `<button class="sh-r" data-sh="right">${esc(o.right)}</button>` : '<span></span>'}</div>
    <div class="sheet-body">${o.body || ''}</div></div>`;
  $('sheets').appendChild(wrap);
  const rec = { wrap, o };
  sheets.push(rec);
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => closeSheet(rec));
  wrap.querySelector('[data-sh="left"]').addEventListener('click', () => { if (o.onLeft) o.onLeft(); closeSheet(rec); });
  const r = wrap.querySelector('[data-sh="right"]');
  if (r) r.addEventListener('click', () => { if (!o.onRight || o.onRight(wrap) !== false) closeSheet(rec); });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('show')));
  document.body.style.overflow = 'hidden';
  if (o.onOpen) o.onOpen(wrap);
  return wrap;
}
function closeSheet(rec) {
  rec = rec || sheets[sheets.length - 1];
  if (!rec) return;
  const i = sheets.indexOf(rec); if (i < 0) return;
  sheets.splice(i, 1);
  rec.wrap.classList.remove('show');
  setTimeout(() => rec.wrap.remove(), 320);
  if (rec.o.onClose) rec.o.onClose();
  if (!sheets.length) document.body.style.overflow = '';
}
function topSheet() { const r = sheets[sheets.length - 1]; return r ? r.wrap : null; }
function iosAlert(title, msg, buttons) {
  const w = document.createElement('div');
  w.className = 'alert-wrap';
  const btns = buttons || [{ label: 'OK', bold: true }];
  w.innerHTML = `<div class="alert" role="alertdialog"><div class="at">${esc(title)}</div>${msg ? `<div class="am">${esc(msg)}</div>` : ''}<div class="ab ${btns.length > 2 ? 'col' : ''}">${btns.map((b, i) => `<button data-i="${i}" class="${b.bold ? 'bold' : ''} ${b.red ? 'red' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
  document.body.appendChild(w);
  w.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) { if (e.target === w) w.remove(); return; } w.remove(); const f = btns[Number(b.dataset.i)].fn; if (f) f(); });
}
const confirmDel = (what, fn) => iosAlert(`Hapus ${what}?`, 'Tindakan ini tidak bisa dibatalkan.', [{ label: 'Batal' }, { label: 'Hapus', red: true, bold: true, fn }]);
function actionSheet(title, items) { iosAlert(title, '', items.concat([{ label: 'Batal', bold: true }])); }
let toastTimer;
function toast(msg, icon) { const t = $('toast'); t.innerHTML = (icon ? ic(icon) : '') + esc(msg); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000); }

// form helpers
const fInput = (id, label, val, o) => { o = o || {}; return `<div class="field ${o.stack ? 'stack' : ''}"><label for="${id}">${label}</label><input id="${id}" ${o.f ? `data-f="${o.f}"` : ''} type="${o.type || 'text'}" value="${esc(val == null ? '' : val)}" placeholder="${esc(o.ph || '')}" ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.list ? `list="${o.list}"` : ''} autocomplete="off"></div>`; };
const fArea = (id, label, val, o) => { o = o || {}; return `<div class="field stack"><label for="${id}">${label}</label><textarea id="${id}" ${o.f ? `data-f="${o.f}"` : ''} placeholder="${esc(o.ph || '')}" rows="${o.rows || 4}">${esc(val || '')}</textarea>${o.count ? `<div class="count" id="${id}Count"></div>` : ''}</div>`; };
const fSelect = (id, label, val, opts, o) => { o = o || {}; return `<div class="field"><label for="${id}">${label}</label><select id="${id}" ${o.f ? `data-f="${o.f}"` : ''}>${opts.map(x => `<option value="${esc(x[0])}" ${String(x[0]) === String(val == null ? '' : val) ? 'selected' : ''}>${esc(x[1])}</option>`).join('')}</select>${ic('chevD', 'faint')}</div>`; };
const fSwitch = (id, label, on) => `<label class="field" for="${id}" style="cursor:pointer"><span class="grow" style="flex:1">${label}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="switch"></span></label>`;
const fSec = (head, inner, foot) => `<div>${head ? `<div class="form-head">${head}</div>` : ''}<div class="form">${inner}</div>${foot ? `<div class="form-foot">${foot}</div>` : ''}</div>`;
const clientOpts = (none) => (none ? [['', none]] : []).concat(clients().map(c => [c.id, c.name]));
const val = (w, id) => { const el = w.querySelector('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };

// ---------------- EDITOR KONTEN ----------------
let draft = null;
function openPost(id, preset) {
  const isNew = !id || !S.posts[id];
  const first = activeClients()[0];
  draft = isNew ? Object.assign({ id: uid(), clientId: UI.fClient || (first && first.id) || '', type: 'feed', title: '', caption: '', date: today(), time: '19:00', status: 'draft', media: [], pillar: '', notes: '', link: '', log: [], createdAt: Date.now() }, preset || {}) : clone(S.posts[id]);
  draft.media = draft.media || []; draft.log = draft.log || [];
  const pillars = [...new Set(clients().flatMap(c => String(c.pillars || '').split(',').map(s => s.trim()).filter(Boolean)))];
  const body = `
    ${fSec('', fSelect('pClient', 'Klien', draft.clientId, clientOpts('Pilih klien'), { f: 'clientId' }) +
      `<div class="field" style="padding:8px 16px"><div class="seg" id="pType" style="flex:1">${Object.keys(TYPES).map(k => `<button type="button" data-a="pType" data-k="${k}" class="${draft.type === k ? 'on' : ''}">${TYPES[k].label}</button>`).join('')}</div></div>` +
      fInput('pTitle', 'Judul', draft.title, { f: 'title', ph: 'Mis. Promo menu baru', stack: true }) +
      fInput('pDate', 'Tanggal', draft.date, { f: 'date', type: 'date' }) + fInput('pTime', 'Jam tayang', draft.time, { f: 'time', type: 'time' }) +
      fInput('pPillar', 'Pilar konten', draft.pillar, { f: 'pillar', ph: 'Edukasi, promo…', list: 'pillarList' }) + `<datalist id="pillarList">${pillars.map(p => `<option value="${esc(p)}">`).join('')}</datalist>`)}
    <div><div class="form-head">Status</div><div class="form"><div class="status-pick" id="pStatus">${statusPick()}</div></div></div>
    <div><div class="form-head">Media · ${draft.type === 'carousel' ? 'maks 20 slide' : draft.type === 'reels' ? 'video vertikal 9:16' : draft.type === 'story' ? '9:16' : 'rasio 4:5 disarankan'}</div><div class="form"><div class="media-strip" id="pMedia">${mediaStrip()}</div></div></div>
    <div><div class="form-head" style="display:flex;justify-content:space-between"><span>Caption</span><span style="display:flex;gap:14px;text-transform:none;letter-spacing:0"><button type="button" class="c-blue" data-a="insertTpl" data-k="caption">Template</button><button type="button" class="c-blue" data-a="insertTpl" data-k="hashtag">Hashtag</button></span></div>
      <div class="form">${fArea('pCaption', 'Caption & hashtag', draft.caption, { f: 'caption', rows: 7, count: true, ph: 'Tulis caption…' })}</div></div>
    ${fSec('Catatan internal', fArea('pNotes', 'Brief, ide visual, audio, dll.', draft.notes, { f: 'notes', rows: 3 }) + fInput('pLink', 'Link post', draft.link, { f: 'link', ph: 'https://instagram.com/p/…', type: 'url' }))}
    <div><div class="form-head">Revisi & komentar klien</div><div class="form"><div class="log" id="pLog">${logHTML()}</div><div class="log-add"><input id="pLogInput" placeholder="Catat masukan klien…" autocomplete="off"><button type="button" data-a="addLog">Tambah</button></div></div></div>
    <div class="list">
      <button class="row action" data-a="igPreview">${ic('ig')}<span class="grow">Pratinjau tampilan Instagram</span></button>
      <button class="row action" data-a="sendPost">${ic('send')}<span class="grow">Kirim ke klien untuk approval</span></button>
      ${!isNew ? `<button class="row action" data-a="dupPost">${ic('copy')}<span class="grow">Duplikat konten</span></button>` : ''}
    </div>
    ${!isNew ? `<div class="list"><button class="row danger" data-a="delPost">Hapus konten</button></div>` : ''}`;
  openSheet({
    title: isNew ? 'Konten baru' : 'Edit konten', right: isNew ? 'Tambah' : 'Simpan', wide: true, body,
    onOpen: w => updateCaptionCount(w),
    onRight: () => savePost(),
    onClose: () => { draft = null; }
  });
}
function statusPick() { return STATUS.map(s => `<button type="button" class="pill st-${s.k} ${draft.status === s.k ? 'on' : ''}" data-a="pStatus" data-k="${s.k}">${esc(s.label)}</button>`).join(''); }
function mediaStrip() {
  return draft.media.map((id, i) => { const m = S.media[id]; if (!m) return ''; return `<div class="ms" style="${phStyle(m, cColor(draft.clientId))}">${mediaInner(m)}<span class="ord">${i + 1}</span><button type="button" class="x" data-a="unpickMedia" data-i="${i}" aria-label="Lepas">${ic('x')}</button></div>`; }).join('') +
    `<button type="button" class="ms add" data-a="pickMedia">${ic('plus')}<span>Library</span></button><button type="button" class="ms add" data-a="uploadToPost">${ic('upload')}<span>Unggah</span></button>`;
}
function logHTML() { return draft.log.length ? draft.log.slice().reverse().map(l => `<div class="log-item"><span class="when">${stampText(l.t)}</span><span class="txt">${esc(l.text)}</span></div>`).join('') : '<div class="log-item"><span class="txt muted" style="font-size:14px">Belum ada catatan. Perubahan status otomatis tercatat di sini.</span></div>'; }
function updateCaptionCount(w) {
  w = w || topSheet(); if (!w) return;
  const el = w.querySelector('#pCaptionCount'); if (!el || !draft) return;
  const n = (draft.caption || '').length, h = hashtags(draft.caption).length;
  el.textContent = `${h}/${HASHTAG_MAX} hashtag · ${n}/${CAPTION_MAX} karakter`;
  el.classList.toggle('over', n > CAPTION_MAX || h > HASHTAG_MAX);
}
function savePost() {
  if (!draft) return;
  if (!draft.clientId) { toast('Pilih klien dulu', 'alert'); return false; }
  const old = S.posts[draft.id];
  if (old && old.status !== draft.status) draft.stAt = Date.now();
  if (!old) draft.stAt = Date.now();
  if (draft.status === 'posted' && !draft.postedAt) draft.postedAt = Date.now();
  draft.updatedAt = Date.now();
  const v = clone(draft);
  dbSet('posts/' + v.id, v);
  toast(old ? 'Konten disimpan' : 'Konten ditambahkan', 'check');
  render();
}
function postShareText(p, urls) {
  const c = clientOf(p.clientId) || {};
  const lines = [`*${c.name || ''} · ${TYPES[p.type || 'feed'].label}*`, p.date ? `Jadwal tayang: ${prettyDate(p.date, true)}${p.time ? ', ' + p.time + ' WIB' : ''}` : '', ''];
  if (p.title) lines.push(`Judul: ${p.title}`, '');
  lines.push('Caption:', p.caption || '(belum ada caption)');
  if (urls && urls.length) { lines.push('', `Materi (${urls.length} file):`); urls.forEach((u, i) => lines.push(`${i + 1}. ${u}`)); }
  lines.push('', 'Mohon dicek ya. Balas *OK* kalau sudah sesuai, atau tulis bagian yang perlu direvisi. Terima kasih!');
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}
async function sharePost(p) {
  const c = clientOf(p.clientId) || {};
  const wrap = shareSheet('Kirim ke klien', postShareText(p, null), c.phone, 'Status otomatis menjadi Menunggu Klien setelah kamu menyalin atau membuka WhatsApp.', () => {
    if (S.posts[p.id] && ['draft', 'review', 'revisi', 'ide'].includes(S.posts[p.id].status)) {
      const np = Object.assign(clone(S.posts[p.id]), { status: 'klien', stAt: Date.now() });
      np.log = (np.log || []).concat({ t: Date.now(), text: 'Dikirim ke klien untuk approval' });
      dbSet('posts/' + p.id, np);
      if (draft && draft.id === p.id) { draft.status = 'klien'; draft.stAt = np.stAt; draft.log = clone(np.log); refreshDraftParts(); }
      render();
    }
  });
  const files = mediaOfPost(p);
  if (!files.length) return;
  try {
    const urls = await mediaUrls(files);
    const ta = wrap.querySelector('#shareText');
    if (ta) { ta.value = postShareText(p, files.map(m => urls[m.id]).filter(Boolean)); ta.dispatchEvent(new Event('input')); }
  } catch (e) { toast('Link media gagal dibuat', 'alert'); }
}
function shareSheet(title, text, phone, foot, onSent) {
  const w = openSheet({
    title, left: 'Tutup',
    body: `<div><div class="form"><div class="field stack"><label for="shareText">Pesan (bisa diedit)</label><textarea id="shareText" rows="12">${esc(text)}</textarea></div></div>${foot ? `<div class="form-foot">${esc(foot)}</div>` : ''}</div>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn" id="shareCopy">${ic('copy')} Salin pesan</button>
        ${phone ? `<a class="btn" id="shareWa" style="background:#25D366" target="_blank" rel="noopener" href="${waLink(phone, text)}">${ic('wa')} Buka WhatsApp ${esc(phone)}</a>` : '<div class="form-foot">Isi nomor WhatsApp di data klien untuk membuka chat langsung.</div>'}
      </div>`
  });
  const ta = w.querySelector('#shareText');
  ta.addEventListener('input', () => { const a = w.querySelector('#shareWa'); if (a) a.href = waLink(phone, ta.value); });
  w.querySelector('#shareCopy').addEventListener('click', () => { copyText(ta.value, ta); if (onSent) onSent(); });
  const a = w.querySelector('#shareWa'); if (a) a.addEventListener('click', () => { if (onSent) onSent(); });
  return w;
}
function copyText(text, fallbackEl) {
  const done = () => toast('Disalin', 'check');
  const fail = () => {
    if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); toast('Tekan Salin dari menu', 'copy'); return; }
    const w = openSheet({ title: 'Salin teks', left: 'Tutup', body: `<div class="form"><div class="field stack"><textarea id="cpTa" rows="6">${esc(text)}</textarea></div></div>` });
    const ta = w.querySelector('#cpTa'); setTimeout(() => { ta.focus(); ta.select(); }, 350);
  };
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail(); } catch (e) { fail(); }
}
function refreshDraftParts() {
  const w = topSheet(); if (!w || !draft) return;
  const s = w.querySelector('#pStatus'); if (s) s.innerHTML = statusPick();
  const m = w.querySelector('#pMedia'); if (m) m.innerHTML = mediaStrip();
  const l = w.querySelector('#pLog'); if (l) l.innerHTML = logHTML();
  const t = w.querySelector('#pType'); if (t) t.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === draft.type));
}
function draftSheet() { return sheets.map(r => r.wrap).reverse().find(w => w.querySelector('#pStatus')); }

// ---------------- PRATINJAU INSTAGRAM ----------------
function igPreview(p) {
  const c = clientOf(p.clientId) || { name: '?', color: '#8E8E93', handle: '' };
  const ms = mediaOfPost(p);
  const tall = p.type === 'reels' || p.type === 'story';
  const cap = esc(p.caption || '').replace(/#[\p{L}\p{N}_]+/gu, m => `<span class="ht">${m}</span>`).replace(/@[\w.]+/g, m => `<span class="ht">${m}</span>`);
  const w = openSheet({
    title: 'Pratinjau', left: 'Tutup',
    body: `<div class="igp"><div class="igp-head"><span class="ring">${avatar(c)}</span><span class="grow" style="flex:1"><b>${esc(c.handle || c.name)}</b>${p.pillar ? `<div class="t-cap muted">${esc(p.pillar)}</div>` : ''}</span>${ic('more')}</div>
      <div class="igp-media ${tall ? 'tall' : ''}" id="igpMedia">${ms.length ? ms.map(m => `<div class="slide" style="${phStyle(m, c.color)}" data-mid="${m.id}">${mediaInner(m)}</div>`).join('') : `<div class="slide" style="background:linear-gradient(135deg,${c.color},#C7C7CC)">${ic(TYPES[p.type || 'feed'].icon)}</div>`}
      ${ms.length > 1 ? `<span class="igp-count" id="igpCount">1/${ms.length}</span>` : ''}</div>
      <div class="igp-actions">${ic('heart')}${ic('comment')}${ic('send')}<span class="sp"></span>${ic('bookmark')}</div>
      <div class="igp-cap"><b>${esc(c.handle || c.name)}</b> ${cap || '<span class="muted">Belum ada caption</span>'}</div>
      <div class="igp-time">${p.date ? prettyDate(p.date, true) + (p.time ? ' · ' + p.time : '') : 'Belum dijadwalkan'}</div></div>
      <div class="form-foot" style="text-align:center">${hashtags(p.caption).length} hashtag · ${(p.caption || '').length} karakter${p.type === 'story' ? ' · caption tidak tampil di Story' : ''}</div>`
  });
  const box = w.querySelector('#igpMedia');
  box.addEventListener('scroll', () => { const n = w.querySelector('#igpCount'); if (n) n.textContent = `${Math.round(box.scrollLeft / box.clientWidth) + 1}/${ms.length}`; });
  if (ms.length) mediaUrls(ms).then(urls => {
    ms.forEach(m => { const el = box.querySelector(`[data-mid="${m.id}"]`); const u = urls[m.id]; if (!el || !u) return; el.innerHTML = m.kind === 'video' ? `<video src="${u}" playsinline muted loop controls preload="metadata" ${m.thumb ? `poster="${m.thumb}"` : ''}></video>` : `<img src="${u}" alt="">`; el.style.background = '#000'; });
  }).catch(() => {});
}
function gridPreview(clientId) {
  const c = clientOf(clientId); if (!c) return;
  const t = today();
  const ps = sortBy(postsAll().filter(p => p.clientId === clientId && p.type !== 'story' && p.status !== 'ide'), postKey).reverse();
  openSheet({
    title: 'Grid @' + (c.handle || c.name), left: 'Tutup',
    body: `<div class="form-foot" style="padding:0">Urutan sama dengan feed Instagram: terbaru di kiri atas. Garis putus-putus = belum tayang. Cek apakah warna & komposisi grid sudah selaras.</div>
      ${ps.length ? `<div class="ig-grid">${ps.map(p => { const m = mediaOfPost(p)[0]; const future = p.status !== 'posted'; return `<button class="cell ${future ? 'future' : ''}" data-a="post" data-id="${p.id}" style="${m ? phStyle(m, c.color) : `background:linear-gradient(135deg,${c.color},#C7C7CC)`}">${m ? mediaInner(m) : ic(TYPES[p.type || 'feed'].icon)}${(p.media || []).length > 1 ? ic('carousel', 'tbadge') : p.type === 'reels' ? ic('play', 'tbadge') : ''}${future ? `<span class="when">${p.date ? (p.date === t ? 'Hari ini' : prettyDate(p.date)) : '—'}</span>` : ''}</button>`; }).join('')}</div>` : empty('grid', 'Belum ada konten feed.')}`
  });
}

// ---------------- MEDIA: PILIH, UNGGAH, LIHAT ----------------
let pickState = null;
function openPicker() {
  pickState = { ids: [], all: false };
  const w = openSheet({
    title: 'Pilih media', right: 'Tambah', wide: true,
    body: `<div class="seg" style="max-width:280px"><button data-a="pickScope" data-k="0" class="on">Klien ini</button><button data-a="pickScope" data-k="1">Semua media</button></div><div id="pickGrid"></div>`,
    onRight: () => { if (draft) { draft.media = draft.media.concat(pickState.ids.filter(id => !draft.media.includes(id))); refreshDraftParts(); } },
    onClose: () => { pickState = null; }
  });
  renderPicker(w);
}
function renderPicker(w) {
  w = w || topSheet(); if (!w || !pickState) return;
  let ms = sortBy(Object.values(S.media), m => -(m.at || 0));
  if (!pickState.all && draft && draft.clientId) ms = ms.filter(m => m.clientId === draft.clientId);
  w.querySelector('#pickGrid').innerHTML = ms.length ? `<div class="mgrid">${ms.map(m => { const i = pickState.ids.indexOf(m.id); return mediaCell(m, { pick: true, picked: i >= 0, order: i + 1 }); }).join('')}</div>` : empty('photo', 'Belum ada media untuk klien ini. Unggah dari editor konten.');
  const r = w.querySelector('[data-sh="right"]'); r.textContent = pickState.ids.length ? `Tambah (${pickState.ids.length})` : 'Tambah'; r.disabled = !pickState.ids.length;
}
let uploadTarget = null; // { clientId, toDraft }
function startUpload(clientId, toDraft) { uploadTarget = { clientId: clientId || '', toDraft: !!toDraft }; const fi = $('fileInput'); fi.value = ''; fi.click(); }
async function handleFiles(files) {
  const tgt = uploadTarget || { clientId: UI.fClient }; uploadTarget = null;
  const list = [...files].filter(f => /^(image|video)\//.test(f.type));
  if (!list.length) { toast('Pilih foto atau video', 'alert'); return; }
  for (const f of list) {
    const id = uid();
    const rec = { id, clientId: tgt.clientId || '', name: f.name, mime: f.type, kind: f.type.startsWith('video') ? 'video' : 'image', size: f.size, at: Date.now() };
    Object.assign(rec, await makeThumb(f));
    if (DEMO) { localUrls[id] = URL.createObjectURL(f); dbSet('media/' + id, rec); }
    else {
      S.media[id] = rec; uploads[id] = 0;
      if (tgt.toDraft && draft) { draft.media.push(id); refreshDraftParts(); }
      render();
      try {
        const r = await uploadFile(f, pct => { uploads[id] = pct; const el = document.querySelectorAll(`#prog-${id} span`); el.forEach(s => { s.style.width = pct + '%'; }); });
        delete uploads[id];
        dbSet('media/' + id, Object.assign(rec, { fileId: r.id }));
      } catch (e) {
        delete uploads[id]; delete S.media[id];
        if (draft) { draft.media = draft.media.filter(x => x !== id); refreshDraftParts(); }
        iosAlert('Unggah gagal', `${f.name}: ${e.message || e}`);
      }
      render(); if (pickState) renderPicker();
      continue;
    }
    if (tgt.toDraft && draft) { draft.media.push(id); refreshDraftParts(); }
  }
  toast(list.length + ' file diunggah', 'check');
  render(); if (pickState) renderPicker();
}
function makeThumb(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const done = o => { clearTimeout(tm); URL.revokeObjectURL(url); res(o || {}); };
    const tm = setTimeout(() => done({}), 10000);
    const draw = (el, w, h, extra) => {
      try {
        const s = Math.min(1, 360 / Math.max(w, h)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
        cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
        done(Object.assign({ thumb: cv.toDataURL('image/jpeg', .7), w, h }, extra || {}));
      } catch (e) { done(Object.assign({ w, h }, extra || {})); }
    };
    if (file.type.startsWith('image')) { const im = new Image(); im.onload = () => draw(im, im.naturalWidth, im.naturalHeight); im.onerror = () => done({}); im.src = url; }
    else {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadedmetadata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch (e) { done({ dur: v.duration }); } };
      v.onseeked = () => draw(v, v.videoWidth, v.videoHeight, { dur: v.duration });
      v.onerror = () => done({});
      v.src = url;
    }
  });
}
function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/social/files');
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.setRequestHeader('X-File-Name', encodeURIComponent('social-' + file.name));
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) {} if (x.status >= 200 && x.status < 300 && d.id) resolve(d); else reject(new Error(d.error || 'HTTP ' + x.status)); };
    x.onerror = () => reject(new Error('Koneksi terputus'));
    x.send(file);
  });
}
async function mediaUrls(list) {
  const out = {};
  list.forEach(m => { if (localUrls[m.id]) out[m.id] = localUrls[m.id]; else if (m.fileId) out[m.id] = location.origin + '/api/social/files/' + encodeURIComponent(m.fileId); });
  return out;
}
function mediaViewer(id) {
  const m = S.media[id]; if (!m) return;
  const usedIn = postsAll().filter(p => (p.media || []).includes(id));
  const w = openSheet({
    title: m.kind === 'video' ? 'Video' : 'Foto', right: 'Simpan',
    body: `<div id="mvBox">${m.thumb ? `<img class="viewer-img" src="${m.thumb}" alt="">` : `<div class="viewer-ph" style="${phStyle(m, cColor(m.clientId))}">${ic(m.kind === 'video' ? 'play' : 'photo')}</div>`}</div>
      ${fSec('', fInput('mvName', 'Nama', m.name) + fSelect('mvClient', 'Klien', m.clientId, clientOpts('Tanpa klien')))}
      <div class="list flat">
        <div class="row plain"><span class="grow muted">Ukuran</span><span class="val num">${bytesText(m.size)}${m.w ? ` · ${m.w}×${m.h}` : ''}${m.dur ? ' · ' + fmtDur(m.dur) : ''}</span></div>
        <div class="row plain"><span class="grow muted">Diunggah</span><span class="val">${m.at ? stampText(m.at) : '—'}</span></div>
        <div class="row plain"><span class="grow muted">Dipakai di</span><span class="val">${usedIn.length ? usedIn.length + ' konten' : 'Belum dipakai'}</span></div>
      </div>
      ${usedIn.length ? `<div class="list">${usedIn.map(p => postRow(p)).join('')}</div>` : ''}
      <div class="list">
        <button class="row action" data-a="mediaLink" data-id="${id}">${ic('link')}<span class="grow">Salin link</span></button>
        <button class="row action" data-a="mediaToPost" data-id="${id}">${ic('plus')}<span class="grow">Buat konten dari media ini</span></button>
      </div>
      <div class="list"><button class="row danger" data-a="delMedia" data-id="${id}">Hapus dari R2</button></div>`,
    onRight: wr => { dbSet('media/' + id, Object.assign(clone(S.media[id]), { name: val(wr, 'mvName') || m.name, clientId: val(wr, 'mvClient') })); render(); }
  });
  mediaUrls([m]).then(u => { const url = u[id]; const box = w.querySelector('#mvBox'); if (url && box) box.innerHTML = m.kind === 'video' ? `<video class="viewer-img" src="${url}" controls playsinline ${m.thumb ? `poster="${m.thumb}"` : ''}></video>` : `<img class="viewer-img" src="${url}" alt="">`; }).catch(() => {});
}
async function deleteMedia(id) {
  const m = S.media[id]; if (!m) return;
  postsAll().forEach(p => { if ((p.media || []).includes(id)) dbSet('posts/' + p.id, Object.assign(clone(p), { media: p.media.filter(x => x !== id) })); });
  dbSet('media/' + id, null);
  if (m.fileId && !DEMO) { try { await fetch('/api/social/files/' + encodeURIComponent(m.fileId), { method: 'DELETE' }); } catch (e) {} }
  toast('Media dihapus', 'trash'); render();
}

// ---------------- EDITOR KLIEN ----------------
function openClient(id) {
  const isNew = !id || !S.clients[id];
  const used = clients().map(c => c.color);
  const c = isNew ? { id: uid(), name: '', handle: '', niche: '', color: CLIENT_COLORS.find(x => !used.includes(x)) || CLIENT_COLORS[0], pkg: { feed: 12, reels: 4, story: 20, price: '' }, brand: { colors: [] }, status: 'aktif', start: today() } : clone(S.clients[id]);
  c.pkg = c.pkg || {}; c.brand = c.brand || {}; c.brand.colors = c.brand.colors || [];
  let color = c.color;
  const bc = [0, 1, 2, 3].map(i => c.brand.colors[i] || '');
  const w = openSheet({
    title: isNew ? 'Klien baru' : 'Edit klien', right: isNew ? 'Tambah' : 'Simpan', wide: true,
    body: `${fSec('Akun', fInput('cName', 'Nama brand', c.name, { ph: 'Kopi Senja' }) + fInput('cHandle', 'Username IG', c.handle, { ph: 'tanpa @' }) + fInput('cNiche', 'Niche', c.niche, { ph: 'F&B, skincare…' }) + fSelect('cStatus', 'Status', c.status, [['aktif', 'Aktif'], ['jeda', 'Dijeda']]))}
      <div><div class="form-head">Warna penanda</div><div class="form"><div class="color-pick" id="cColor">${CLIENT_COLORS.map(x => `<button type="button" data-col="${x}" class="${x === color ? 'on' : ''}" style="background:${x}" aria-label="Warna ${x}"></button>`).join('')}</div></div></div>
      ${fSec('Paket per bulan', fInput('kFeed', 'Feed/Carousel', c.pkg.feed, { type: 'number', mode: 'numeric' }) + fInput('kReels', 'Reels', c.pkg.reels, { type: 'number', mode: 'numeric' }) + fInput('kStory', 'Story', c.pkg.story, { type: 'number', mode: 'numeric' }) + fInput('kPrice', 'Harga (Rp)', c.pkg.price, { mode: 'numeric', ph: '2500000' }) + fInput('cStart', 'Mulai kontrak', c.start, { type: 'date' }))}
      ${fSec('Kontak', fInput('cPic', 'PIC', c.pic, { ph: 'Nama & jabatan' }) + fInput('cPhone', 'WhatsApp', c.phone, { type: 'tel', ph: '0812…' }) + fInput('cDrive', 'Folder aset', c.drive, { type: 'url', ph: 'Link Google Drive' }))}
      ${fSec('Brand kit', `<div class="field" style="gap:10px;padding:10px 16px"><label style="min-width:0;flex:1">Palet warna</label>${bc.map((x, i) => `<input type="color" id="bc${i}" value="${x || '#FFFFFF'}" data-set="${x ? 1 : 0}" aria-label="Warna brand ${i + 1}">`).join('')}</div>` +
        fInput('bFonts', 'Font', c.brand.fonts, { ph: 'Judul / isi' }) + fArea('bTone', 'Tone of voice', c.brand.tone, { rows: 2, ph: 'Santai, hangat, pakai "kamu"…' }) +
        fInput('cPillars', 'Pilar konten', c.pillars, { ph: 'Edukasi, Promo, Testimoni (pisahkan koma)', stack: true }) +
        fArea('bHash', 'Hashtag andalan', c.brand.hashtags, { rows: 2, ph: '#brand #niche' }) + fArea('bDos', 'Lakukan', c.brand.dos, { rows: 2 }) + fArea('bDonts', 'Hindari', c.brand.donts, { rows: 2 }), 'Ketuk kotak warna untuk mengisi palet. Warna putih yang tidak diubah tidak disimpan.')}
      ${fSec('', fArea('cNotes', 'Catatan & brief umum', c.notes, { rows: 3 }))}
      ${!isNew ? `<div class="list"><button class="row danger" data-a="delClient" data-id="${c.id}">Hapus klien</button></div>` : ''}`,
    onRight: wr => {
      const name = val(wr, 'cName');
      if (!name) { toast('Nama brand wajib diisi', 'alert'); return false; }
      const colors = [0, 1, 2, 3].map(i => { const el = wr.querySelector('#bc' + i); return el.dataset.set === '1' ? el.value : ''; }).filter(Boolean);
      const out = Object.assign(c, {
        name, handle: val(wr, 'cHandle').replace(/^@/, ''), niche: val(wr, 'cNiche'), status: val(wr, 'cStatus'), color,
        pkg: { feed: num(val(wr, 'kFeed')), reels: num(val(wr, 'kReels')), story: num(val(wr, 'kStory')), price: num(val(wr, 'kPrice')) },
        start: val(wr, 'cStart'), pic: val(wr, 'cPic'), phone: val(wr, 'cPhone'), drive: val(wr, 'cDrive'), pillars: val(wr, 'cPillars'), notes: val(wr, 'cNotes'),
        brand: { colors, fonts: val(wr, 'bFonts'), tone: val(wr, 'bTone'), hashtags: val(wr, 'bHash'), dos: val(wr, 'bDos'), donts: val(wr, 'bDonts') }
      });
      dbSet('clients/' + c.id, out);
      toast(isNew ? 'Klien ditambahkan' : 'Klien disimpan', 'check');
      if (isNew) push({ v: 'client', id: c.id, backLabel: 'Klien', tab: 'clients' }); else render();
    }
  });
  w.querySelector('#cColor').addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (!b) return; color = b.dataset.col; w.querySelectorAll('#cColor button').forEach(x => x.classList.toggle('on', x === b)); });
  w.querySelectorAll('input[type="color"]').forEach(el => el.addEventListener('input', () => { el.dataset.set = '1'; }));
}

// ---------------- EDITOR LAIN ----------------
function openTask(id) {
  const x = id && S.tasks[id] ? clone(S.tasks[id]) : { id: uid(), text: '', clientId: UI.fClient || '', due: '', done: false, at: Date.now() };
  openSheet({
    title: id ? 'Edit tugas' : 'Tugas baru', right: id ? 'Simpan' : 'Tambah',
    body: fSec('', fInput('tText', 'Tugas', x.text, { stack: true, ph: 'Mis. Minta foto produk baru' }) + fSelect('tClient', 'Klien', x.clientId, clientOpts('Umum')) + fInput('tDue', 'Tenggat', x.due, { type: 'date' })) + (id ? `<div class="list"><button class="row danger" data-a="delTask" data-id="${id}">Hapus tugas</button></div>` : ''),
    onOpen: w => setTimeout(() => w.querySelector('#tText').focus(), 350),
    onRight: w => { const t = val(w, 'tText'); if (!t) return false; dbSet('tasks/' + x.id, Object.assign(x, { text: t, clientId: val(w, 'tClient'), due: val(w, 'tDue') })); render(); }
  });
}
function openIdea(id) {
  const x = id && S.ideas[id] ? clone(S.ideas[id]) : { id: uid(), text: '', clientId: UI.fClient || '', tag: '', ref: '', done: false, at: Date.now() };
  openSheet({
    title: id ? 'Edit ide' : 'Ide baru', right: id ? 'Simpan' : 'Tambah',
    body: fSec('', fArea('iText', 'Ide', x.text, { rows: 3, ph: 'Mis. POV barista bikin latte art' }) + fSelect('iClient', 'Klien', x.clientId, clientOpts('Umum')) + fInput('iTag', 'Label', x.tag, { ph: 'tren, audio, musiman' }) + fInput('iRef', 'Referensi', x.ref, { type: 'url', ph: 'Link Reels / TikTok / Pinterest' })),
    onRight: w => { const t = val(w, 'iText'); if (!t) return false; dbSet('ideas/' + x.id, Object.assign(x, { text: t, clientId: val(w, 'iClient'), tag: val(w, 'iTag').replace(/^#/, ''), ref: val(w, 'iRef') })); render(); }
  });
}
function openTemplate(id) {
  const x = id && S.templates[id] ? clone(S.templates[id]) : { id: uid(), kind: UI.tKind, title: '', body: '', clientId: UI.fClient || '' };
  openSheet({
    title: id ? 'Edit template' : 'Template baru', right: id ? 'Simpan' : 'Tambah',
    body: fSec('', fSelect('tpKind', 'Jenis', x.kind, [['caption', 'Caption'], ['hashtag', 'Grup hashtag']]) + fInput('tpTitle', 'Judul', x.title, { ph: 'Promo, edukasi…' }) + fSelect('tpClient', 'Klien', x.clientId, clientOpts('Semua klien')) + fArea('tpBody', 'Isi', x.body, { rows: 8 }), 'Bisa memakai {nama}, {handle}, {tanggal}.') + (id ? `<div class="list"><button class="row danger" data-a="delTpl" data-id="${id}">Hapus template</button></div>` : ''),
    onRight: w => { const b = val(w, 'tpBody'); if (!b) return false; dbSet('templates/' + x.id, Object.assign(x, { kind: val(w, 'tpKind'), title: val(w, 'tpTitle'), clientId: val(w, 'tpClient'), body: b })); render(); }
  });
}
function fillTpl(body, c, p) { return String(body || '').replace(/\{nama\}/g, c ? c.name : '').replace(/\{handle\}/g, c ? '@' + c.handle : '').replace(/\{tanggal\}/g, p && p.date ? prettyDate(p.date, true) : ''); }
function openReport(id, clientId) {
  const prevMonth = addMonths(today().slice(0, 7), -1);
  const x = id && S.reports[id] ? clone(S.reports[id]) : { id: uid(), clientId: clientId || UI.repClient, month: prevMonth };
  openSheet({
    title: id ? 'Edit laporan' : 'Laporan baru', right: id ? 'Simpan' : 'Tambah',
    body: fSec('', fSelect('rClient', 'Klien', x.clientId, clientOpts()) + fInput('rMonth', 'Bulan', x.month, { type: 'month' })) +
      fSec('Angka dari Instagram Insights', ['followers:Followers', 'reach:Reach (akun dijangkau)', 'impressions:Impressions/Views', 'engagement:Interaksi (like+komen+share+save)', 'visits:Kunjungan profil'].map(s => { const [k, l] = s.split(':'); return fInput('r_' + k, l, x[k], { mode: 'numeric', ph: '0' }); }).join(''), 'Engagement rate dihitung otomatis: interaksi ÷ reach.') +
      fSec('', fInput('rTop', 'Konten terbaik', x.top, { stack: true, ph: 'Judul / link konten paling perform' }) + fArea('rNotes', 'Catatan & rencana bulan depan', x.notes, { rows: 3 })) +
      (id ? `<div class="list"><button class="row danger" data-a="delReport" data-id="${id}">Hapus laporan</button></div>` : ''),
    onRight: w => {
      const cid = val(w, 'rClient'), month = val(w, 'rMonth');
      if (!cid || !month) { toast('Pilih klien & bulan', 'alert'); return false; }
      const dup = Object.values(S.reports).find(r => r.clientId === cid && r.month === month && r.id !== x.id);
      if (dup) { toast('Laporan bulan itu sudah ada', 'alert'); return false; }
      const o = Object.assign(x, { clientId: cid, month, top: val(w, 'rTop'), notes: val(w, 'rNotes') });
      ['followers', 'reach', 'impressions', 'engagement', 'visits'].forEach(k => { o[k] = num(val(w, 'r_' + k)); });
      dbSet('reports/' + o.id, o); UI.repClient = cid; render();
    }
  });
}
function reportText(r) {
  const c = clientOf(r.clientId) || {};
  const prev = sortBy(Object.values(S.reports).filter(x => x.clientId === r.clientId && x.month < r.month), x => x.month).pop();
  const g = prev ? num(r.followers) - num(prev.followers) : null;
  return [`*Laporan Instagram @${c.handle || c.name} · ${monthLabel(r.month)}*`, '',
    `Followers: ${fmt(r.followers)}${g != null ? ` (${g >= 0 ? '+' : ''}${fmt(g)})` : ''}`,
    `Reach: ${fmt(r.reach)}`, `Impressions: ${fmt(r.impressions)}`, `Interaksi: ${fmt(r.engagement)}`, `Engagement rate: ${fmt(erOf(r), 2)}%`, `Kunjungan profil: ${fmt(r.visits)}`,
    `Konten tayang: ${monthPosts(r.clientId, r.month).filter(p => p.status === 'posted').length}`,
    r.top ? `\nKonten terbaik: ${r.top}` : '', r.notes ? `\nCatatan & rencana:\n${r.notes}` : ''].filter(l => l !== '').join('\n');
}
function invoiceNo(period) { const n = Object.values(S.invoices).filter(i => i.period === period).length + 1; return `INV/${period.replace('-', '')}/${pad(n)}`; }
function openInvoice(id, clientId) {
  const period = today().slice(0, 7);
  const cid = clientId || UI.fClient || (activeClients()[0] || {}).id || '';
  const x = id && S.invoices[id] ? clone(S.invoices[id]) : { id: uid(), clientId: cid, period, no: invoiceNo(period), amount: num(((S.clients[cid] || {}).pkg || {}).price), due: addDays(today(), 7), status: 'belum', note: '' };
  openSheet({
    title: id ? 'Tagihan' : 'Tagihan baru', right: id ? 'Simpan' : 'Tambah',
    body: fSec('', fSelect('vClient', 'Klien', x.clientId, clientOpts()) + fInput('vNo', 'Nomor', x.no) + fInput('vPeriod', 'Periode', x.period, { type: 'month' }) + fInput('vAmount', 'Jumlah (Rp)', x.amount, { mode: 'numeric' }) + fInput('vDue', 'Jatuh tempo', x.due, { type: 'date' })) +
      fSec('', fSwitch('vPaid', 'Sudah dibayar', x.status === 'lunas') + fInput('vPaidAt', 'Tanggal bayar', x.paidAt || today(), { type: 'date' }) + fArea('vNote', 'Catatan', x.note, { rows: 2, ph: 'Transfer BCA, termin, dll.' })) +
      (id ? `<div class="list"><button class="row action" data-a="remindInvoice" data-id="${id}">${ic('wa')}<span class="grow">Kirim pengingat pembayaran</span></button></div><div class="list"><button class="row danger" data-a="delInvoice" data-id="${id}">Hapus tagihan</button></div>` : ''),
    onOpen: w => { const cs = w.querySelector('#vClient'); cs.addEventListener('change', () => { const p = num(((S.clients[cs.value] || {}).pkg || {}).price); if (p && !id) w.querySelector('#vAmount').value = p; }); },
    onRight: w => {
      if (!val(w, 'vClient')) { toast('Pilih klien', 'alert'); return false; }
      const paid = val(w, 'vPaid');
      dbSet('invoices/' + x.id, Object.assign(x, { clientId: val(w, 'vClient'), no: val(w, 'vNo'), period: val(w, 'vPeriod'), amount: num(val(w, 'vAmount')), due: val(w, 'vDue'), status: paid ? 'lunas' : 'belum', paidAt: paid ? val(w, 'vPaidAt') : '', note: val(w, 'vNote') }));
      render();
    }
  });
}

// ---------------- AKSI ----------------
const A = {
  tab: el => { if (sheets.length) closeSheet(); go(el.dataset.k); },
  back: () => { stack.pop(); render(); },
  client: el => { const cur = stack[stack.length - 1]; if (cur && cur.v === 'client' && cur.id === el.dataset.id) return; if (sheets.length) [...sheets].forEach(r => closeSheet(r)); stack = [{ v: 'client', id: el.dataset.id, backLabel: ALL_PAGES[UI.tab] ? ALL_PAGES[UI.tab].label : 'Kembali', tab: 'clients' }]; render(); window.scrollTo(0, 0); },
  fClient: el => { UI.fClient = el.dataset.id; saveUI(); render(); },
  statFilter: el => { UI.tab = 'content'; UI.cView = 'list'; UI.cStatus = el.dataset.k; stack = []; saveUI(); render(); window.scrollTo(0, 0); },
  explainSync: () => iosAlert('Status sinkron', { on: 'Tersambung ke Firebase. Data tersinkron realtime ke semua perangkatmu.', off: 'Sedang offline. Perubahan disimpan di perangkat dan dikirim otomatis saat online.', err: 'Firebase menolak node hadzmi_social_data. Tempel ulang isi database.rules.json (blok hadzmi_social_data sekarang terbuka tanpa login) ke Firebase Console → Realtime Database → Rules, lalu Publish. Sementara itu data tersimpan di perangkat ini.', local: 'Firebase tidak termuat. Data hanya tersimpan di perangkat ini.', demo: 'Ini mode pratinjau dengan data contoh. Tidak tersambung ke Firebase maupun R2.' }[syncMode] || ''),
  // kalender
  calSel: el => { UI.calSel = el.dataset.d; if (el.dataset.d.slice(0, 7) !== UI.calMonth) UI.calMonth = el.dataset.d.slice(0, 7); render(); },
  calNav: el => { UI.calMonth = addMonths(UI.calMonth, Number(el.dataset.n)); UI.calSel = UI.calMonth === today().slice(0, 7) ? today() : UI.calMonth + '-01'; render(); },
  calToday: () => { UI.calMonth = today().slice(0, 7); UI.calSel = today(); render(); },
  // konten
  cView: el => { UI.cView = el.dataset.k; saveUI(); render(); },
  cStatus: el => { UI.cStatus = el.dataset.k; render(); },
  post: el => openPost(el.dataset.id),
  newPost: el => { if (!clients().length) { iosAlert('Belum ada klien', 'Tambahkan klien dulu sebelum membuat konten.', [{ label: 'Nanti' }, { label: 'Tambah klien', bold: true, fn: () => openClient() }]); return; } const pre = {}; if (el.dataset.date) pre.date = el.dataset.date; if (el.dataset.client) pre.clientId = el.dataset.client; openPost(null, pre); },
  pType: el => { draft.type = el.dataset.k; refreshDraftParts(); },
  pStatus: el => { const k = el.dataset.k; if (draft.status !== k) { draft.log.push({ t: Date.now(), text: `Status: ${ST[draft.status] ? ST[draft.status].label : '—'} → ${ST[k].label}` }); draft.status = k; refreshDraftParts(); } },
  addLog: () => { const w = draftSheet(); const inp = w && w.querySelector('#pLogInput'); if (!inp || !inp.value.trim()) return; draft.log.push({ t: Date.now(), text: inp.value.trim() }); inp.value = ''; refreshDraftParts(); },
  pickMedia: () => openPicker(),
  uploadToPost: () => startUpload(draft && draft.clientId, true),
  unpickMedia: el => { draft.media.splice(Number(el.dataset.i), 1); refreshDraftParts(); },
  pickToggle: el => { const id = el.dataset.id, i = pickState.ids.indexOf(id); if (i >= 0) pickState.ids.splice(i, 1); else pickState.ids.push(id); renderPicker(); },
  pickScope: el => { pickState.all = el.dataset.k === '1'; el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); renderPicker(); },
  insertTpl: el => {
    const kind = el.dataset.k;
    const xs = Object.values(S.templates).filter(x => x.kind === kind && (!x.clientId || x.clientId === draft.clientId));
    const c = clientOf(draft.clientId);
    const items = xs.map(x => ({ label: x.title || 'Tanpa judul', fn: () => insertCaption(fillTpl(x.body, c, draft)) }));
    if (kind === 'hashtag' && c && c.brand && c.brand.hashtags) items.unshift({ label: 'Hashtag brand ' + c.name, fn: () => insertCaption(hashtags(c.brand.hashtags).join(' ')) });
    if (!items.length) { toast('Belum ada template ' + (kind === 'hashtag' ? 'hashtag' : 'caption'), 'doc'); return; }
    actionSheet(kind === 'hashtag' ? 'Sisipkan hashtag' : 'Sisipkan template', items);
  },
  igPreview: () => igPreview(draft),
  sendPost: () => { if (!draft.clientId) { toast('Pilih klien dulu', 'alert'); return; } sharePost(draft); },
  dupPost: () => { const src = clone(draft); closeSheet(); setTimeout(() => openPost(null, Object.assign(src, { id: uid(), status: 'draft', log: [], link: '', postedAt: null, title: (src.title || '') + ' (salinan)' })), 340); },
  delPost: () => confirmDel('konten ini', () => { const id = draft.id; closeSheet(); dbSet('posts/' + id, null); toast('Konten dihapus', 'trash'); render(); }),
  gridPreview: el => gridPreview(el.dataset.id),
  clientPosts: el => { UI.fClient = el.dataset.id; UI.cView = 'list'; UI.cStatus = ''; saveUI(); go('content'); },
  // klien
  newClient: () => openClient(),
  editClient: el => openClient(el.dataset.id),
  delClient: el => {
    const id = el.dataset.id, n = postsAll().filter(p => p.clientId === id).length;
    iosAlert('Hapus klien?', n ? `${n} konten milik klien ini ikut terhapus. Media di R2 tetap ada.` : 'Tindakan ini tidak bisa dibatalkan.', [{ label: 'Batal' }, { label: 'Hapus', red: true, bold: true, fn: () => {
      postsAll().filter(p => p.clientId === id).forEach(p => dbSet('posts/' + p.id, null));
      dbSet('clients/' + id, null); closeSheet(); stack = []; if (UI.fClient === id) UI.fClient = ''; go('clients'); toast('Klien dihapus', 'trash');
    } }]);
  },
  // media
  upload: () => {
    const cs = clients();
    if (UI.fClient || !cs.length) { startUpload(UI.fClient); return; }
    actionSheet('Unggah untuk klien', cs.map(c => ({ label: c.name, fn: () => startUpload(c.id) })).concat([{ label: 'Tanpa klien', fn: () => startUpload('') }]));
  },
  mKind: el => { UI.mKind = el.dataset.k; saveUI(); render(); },
  mediaView: el => mediaViewer(el.dataset.id),
  mediaLink: el => { const m = S.media[el.dataset.id]; mediaUrls([m]).then(u => { if (u[m.id]) copyText(u[m.id]); else toast('Link tidak tersedia', 'alert'); }).catch(e => toast(e.message, 'alert')); },
  mediaToPost: el => { const m = S.media[el.dataset.id]; closeSheet(); setTimeout(() => openPost(null, { clientId: m.clientId || '', media: [m.id], type: m.kind === 'video' ? 'reels' : 'feed' }), 340); },
  delMedia: el => { const id = el.dataset.id, n = postsAll().filter(p => (p.media || []).includes(id)).length; iosAlert('Hapus media?', n ? `Media ini dipakai di ${n} konten dan akan dilepas dari konten tersebut.` : 'File dihapus permanen dari Cloudflare R2.', [{ label: 'Batal' }, { label: 'Hapus', red: true, bold: true, fn: () => { closeSheet(); deleteMedia(id); } }]); },
  // tugas
  newTask: () => openTask(),
  editTask: el => openTask(el.dataset.id),
  toggleTask: el => { const x = S.tasks[el.dataset.id]; if (!x) return; haptic(); dbSet('tasks/' + x.id, Object.assign(clone(x), { done: !x.done, doneAt: Date.now() })); render(); },
  delTask: el => { closeSheet(); dbSet('tasks/' + el.dataset.id, null); render(); },
  clearTasks: () => { Object.values(S.tasks).filter(x => x.done).forEach(x => dbSet('tasks/' + x.id, null)); render(); },
  // ide
  newIdea: () => openIdea(),
  ideaMenu: el => {
    const x = S.ideas[el.dataset.id]; if (!x) return;
    const items = [
      { label: 'Jadikan konten', bold: true, fn: () => { openPost(null, { clientId: x.clientId || UI.fClient || '', title: x.text.slice(0, 60), notes: x.text + (x.ref ? '\nReferensi: ' + x.ref : ''), status: 'draft' }); dbSet('ideas/' + x.id, Object.assign(clone(x), { done: true })); render(); } },
      { label: 'Edit', fn: () => openIdea(x.id) },
      { label: x.done ? 'Tandai belum dipakai' : 'Tandai sudah dipakai', fn: () => { dbSet('ideas/' + x.id, Object.assign(clone(x), { done: !x.done })); render(); } },
      { label: 'Hapus', red: true, fn: () => { dbSet('ideas/' + x.id, null); render(); } }
    ];
    if (x.ref) items.splice(1, 0, { label: 'Salin link referensi', fn: () => copyText(x.ref) });
    actionSheet(x.text.slice(0, 80), items);
  },
  // template
  tKind: el => { UI.tKind = el.dataset.k; saveUI(); render(); },
  newTemplate: () => openTemplate(),
  tplMenu: el => { const x = S.templates[el.dataset.id]; if (!x) return; actionSheet(x.title || 'Template', [{ label: 'Salin', bold: true, fn: () => copyText(x.body) }, { label: 'Edit', fn: () => openTemplate(x.id) }, { label: 'Hapus', red: true, fn: () => { dbSet('templates/' + x.id, null); render(); } }]); },
  delTpl: el => { closeSheet(); dbSet('templates/' + el.dataset.id, null); render(); },
  copyText: el => copyText(el.dataset.text),
  // laporan
  repClient: el => { UI.repClient = el.dataset.id; saveUI(); render(); },
  openReports: el => { UI.repClient = el.dataset.id; go('reports'); },
  newReport: el => openReport(null, el.dataset.client),
  editReport: el => openReport(el.dataset.id),
  delReport: el => { closeSheet(); dbSet('reports/' + el.dataset.id, null); render(); },
  shareReport: el => { const r = S.reports[el.dataset.id]; if (!r) return; const c = clientOf(r.clientId) || {}; shareSheet('Kirim laporan', reportText(r), c.phone); },
  // keuangan
  finFilter: el => { UI.finFilter = el.dataset.k; saveUI(); render(); },
  newInvoice: el => openInvoice(null, el.dataset.client),
  editInvoice: el => openInvoice(el.dataset.id),
  delInvoice: el => { closeSheet(); dbSet('invoices/' + el.dataset.id, null); render(); },
  bulkInvoice: () => {
    const month = today().slice(0, 7);
    const missing = activeClients().filter(c => num((c.pkg || {}).price) && !Object.values(S.invoices).some(i => i.clientId === c.id && i.period === month));
    missing.forEach(c => { const id = uid(); dbSet('invoices/' + id, { id, clientId: c.id, period: month, no: invoiceNo(month), amount: num(c.pkg.price), due: addDays(today(), 7), status: 'belum', note: '' }); });
    toast(missing.length + ' tagihan dibuat', 'check'); render();
  },
  remindInvoice: el => { const i = S.invoices[el.dataset.id]; const c = clientOf(i.clientId) || {}; shareSheet('Pengingat pembayaran', `Halo ${c.pic ? c.pic.split(/[ (]/)[0] : 'Kak'}, mengingatkan tagihan jasa social media *${c.name}* periode ${monthLabel(i.period)}:\n\nNomor: ${i.no}\nJumlah: ${rp(i.amount)}\nJatuh tempo: ${i.due ? prettyDate(i.due, true) : '-'}\n\nTerima kasih!`, c.phone); },
  // pengaturan
  exportJson: () => {
    const blob = new Blob([JSON.stringify({ app: 'nexa-social', v: 1, at: new Date().toISOString(), data: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nexa-social-${today()}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
  importJson: () => { const fi = $('importInput'); fi.value = ''; fi.click(); },
  resetDemo: () => { S = seedDemo(); saveCache(); render(); toast('Data contoh dimuat ulang', 'refresh'); },
};
function insertCaption(text) {
  const w = draftSheet(); const ta = w && w.querySelector('#pCaption'); if (!ta) return;
  const s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
  const before = ta.value.slice(0, s), after = ta.value.slice(s);
  const sep = before && !/\n$/.test(before) ? '\n\n' : '';
  ta.value = before + sep + text + after; draft.caption = ta.value; updateCaptionCount(w);
}

// ---------------- FIREBASE (tanpa login) ----------------
function attachDb() {
  if (dbRef) return;
  try {
    dbRef = firebase.database().ref(DB_PATH); authed = true;
    dbRef.on('value', snap => { if (syncMode === 'err') setSync('on'); applyRemote(snap.val()); }, err => { console.warn('db', err); setSync('err'); });
    firebase.database().ref('.info/connected').on('value', snap => { if (syncMode !== 'err') setSync(snap.val() ? 'on' : 'off'); if (snap.val()) flushPending(); });
  } catch (e) { dbRef = null; authed = false; setSync('local'); }
}
function startApp() {
  $('app').classList.remove('hidden');
  if (started) return;
  started = true;
  render();
}

// ---------------- BOOT ----------------
function bind() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const fn = A[el.dataset.a]; if (!fn) return;
    if (el.tagName !== 'A') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'qInput') { UI.q = el.value; const pos = el.selectionStart; render(); const n = $('qInput'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } return; }
    if (el.dataset && el.dataset.f && draft) { draft[el.dataset.f] = el.value; if (el.dataset.f === 'caption') updateCaptionCount(); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'setName') { dbSet('settings', Object.assign({}, S.settings, { name: el.value.trim() })); toast('Disimpan', 'check'); }
    if (el.dataset && el.dataset.f && draft) { draft[el.dataset.f] = el.value; if (el.dataset.f === 'clientId' && pickState) renderPicker(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheets.length) { closeSheet(); return; }
    if (e.key === 'Enter' && e.target.id === 'quickIdea' && e.target.value.trim()) { const id = uid(); dbSet('ideas/' + id, { id, text: e.target.value.trim(), clientId: UI.fClient || '', tag: '', ref: '', done: false, at: Date.now() }); render(); const q = $('quickIdea'); if (q) q.focus(); toast('Ide disimpan', 'bulb'); }
    if (e.key === 'Enter' && e.target.id === 'pLogInput') { e.preventDefault(); A.addLog(); }
  });
  $('fileInput').addEventListener('change', e => { if (e.target.files.length) handleFiles(e.target.files); });
  $('importInput').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      const d = JSON.parse(t); const data = d.data || d;
      if (!data || typeof data !== 'object' || !data.clients) throw new Error('Bukan file cadangan Nexa Social');
      iosAlert('Pulihkan data?', 'Data dari file digabung dengan data sekarang. Item dengan ID sama akan ditimpa.', [{ label: 'Batal' }, { label: 'Pulihkan', bold: true, fn: () => {
        COLS.forEach(c => Object.entries(data[c] || {}).forEach(([k, v]) => dbSet(c + '/' + k, v)));
        if (data.settings) dbSet('settings', data.settings);
        render(); toast('Data dipulihkan', 'check');
      } }]);
    }).catch(err => iosAlert('Gagal membaca file', err.message));
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  // sheet: tombol kanan di picker disable awal
}
function boot() {
  $('root').innerHTML = shellHTML();
  bind();
  if (DEMO) {
    if (!Object.keys(S.clients).length) { S = seedDemo(); saveCache(); }
    syncMode = 'demo'; startApp(); return;
  }
  startApp();
  try { if (typeof firebase !== 'undefined') { if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); attachDb(); } } catch (e) { console.warn(e); }
  if (!dbRef) setSync('local');
}

// ---------------- DATA CONTOH (mode pratinjau) ----------------
function seedDemo() {
  const D = blank(), t = today(), m = t.slice(0, 7), now = Date.now();
  D.settings = { name: 'Hadzmi' };
  const cl = [
    { id: 'c1', name: 'Kopi Senja', handle: 'kopisenja.id', niche: 'Coffee shop', color: '#A2845E', pkg: { feed: 12, reels: 4, story: 20, price: 2500000 }, pic: 'Raka (owner)', phone: '0812 3456 7801', start: addMonths(m, -5) + '-03', pillars: 'Menu, Behind the bar, Promo, Komunitas', drive: 'https://drive.google.com/', notes: 'Approval lewat Raka, biasanya balas malam hari.',
      brand: { colors: ['#3B2A20', '#C8A27C', '#F3E9DC', '#7A8B6F'], fonts: 'Playfair Display (judul) · Inter (isi)', tone: 'Hangat dan santai, seperti ngobrol sore. Pakai "kamu".', hashtags: '#kopisenja #kopijakarta #ngopisore #coffeetime', dos: 'Foto natural light jam 3 sore. Sebut menu musiman.', donts: 'Jangan pakai emoji berlebihan. Hindari foto gelap.' } },
    { id: 'c2', name: 'Glowé Skin', handle: 'glowe.skin', niche: 'Skincare lokal', color: '#FF2D55', pkg: { feed: 16, reels: 8, story: 30, price: 4000000 }, pic: 'Nadia (brand manager)', phone: '0813 9876 5402', start: addMonths(m, -3) + '-10', pillars: 'Edukasi, Produk, Testimoni, Promo',
      brand: { colors: ['#FFE4EC', '#FF2D55', '#2B2B2B'], fonts: 'DM Serif Display · DM Sans', tone: 'Ramah, edukatif, tidak menggurui.', hashtags: '#gloweskin #skincarelokal #glowingskin #skincareroutine', dos: 'Selalu cantumkan kandungan aktif. Before-after dengan izin.', donts: 'Jangan klaim medis ("menyembuhkan").' } },
    { id: 'c3', name: 'Rumah Kayu Studio', handle: 'rumahkayu.studio', niche: 'Interior & furnitur', color: '#30B0C7', pkg: { feed: 8, reels: 4, story: 12, price: 2000000 }, pic: 'Bu Sari', phone: '0857 1122 3304', start: addMonths(m, -1) + '-01', pillars: 'Portofolio, Tips ruang, Proses produksi',
      brand: { colors: ['#E9E3D5', '#6B4F3A', '#30B0C7'], fonts: 'Cormorant · Manrope', tone: 'Tenang, elegan, detail.', hashtags: '#rumahkayu #interiorminimalis #furniturjati', dos: 'Tampilkan tekstur kayu dari dekat.', donts: 'Hindari watermark besar.' } }
  ];
  cl.forEach(c => { c.status = 'aktif'; D.clients[c.id] = c; });
  const grads = { c1: [['#C8A27C', '#3B2A20'], ['#F3E9DC', '#A2845E'], ['#7A8B6F', '#3B2A20'], ['#E8C9A0', '#8B5E3C']], c2: [['#FFE4EC', '#FF8FAB'], ['#FFB5C8', '#FF2D55'], ['#FFF0F3', '#E0A3B5'], ['#F7D6E0', '#B5838D']], c3: [['#E9E3D5', '#6B4F3A'], ['#D4C7B0', '#8C6E54'], ['#BFD8DC', '#30B0C7'], ['#F2EDE4', '#A38B6D']] };
  let mi = 0;
  const mk = (cid, kind, name, ago) => { const id = 'm' + (++mi); const g = grads[cid][mi % 4]; D.media[id] = { id, clientId: cid, name, mime: kind === 'video' ? 'video/mp4' : 'image/jpeg', kind, size: kind === 'video' ? 18e6 + mi * 7e5 : 2.1e6 + mi * 9e4, w: kind === 'video' ? 1080 : 1080, h: kind === 'video' ? 1920 : 1350, dur: kind === 'video' ? 14 + mi % 20 : undefined, ph: g, at: now - (ago || mi) * 86400000 / 2 }; return id; };
  const P = [
    ['c1', 'feed', 'Menu baru: Es Kopi Pandan', 'Sore-sore enaknya yang seger 🌿\nEs Kopi Pandan sudah bisa kamu pesan mulai hari ini.\n\n#kopisenja #ngopisore #kopijakarta', 0, '19:00', 'jadwal', 'Menu', 1],
    ['c2', 'reels', 'Urutan skincare pagi', 'Urutan skincare pagi yang benar, biar hasilnya maksimal ✨\n\n1. Cleanser\n2. Toner\n3. Serum Niacinamide 5%\n4. Moisturizer\n5. Sunscreen SPF 50\n\n#gloweskin #skincareroutine', 0, '12:00', 'klien', 'Edukasi', 1, 'video'],
    ['c3', 'carousel', 'Before-after ruang kerja 3x3 m', 'Ruang kerja 3x3 meter yang dulu sempit, sekarang lega dan hangat.\nGeser untuk lihat prosesnya →\n\n#rumahkayu #interiorminimalis', 0, '16:00', 'setuju', 'Portofolio', 4],
    ['c1', 'story', 'Polling: kopi susu vs kopi hitam', '', 0, '10:00', 'posted', 'Komunitas', 1],
    ['c2', 'feed', 'Kenalan sama Niacinamide', 'Niacinamide itu apa sih? Ini 3 manfaat utamanya buat kulit kamu 👇\n\n#gloweskin #skincarelokal', -1, '19:00', 'setuju', 'Edukasi', 1],
    ['c1', 'carousel', 'Behind the bar: cara seduh V60', 'Pernah penasaran gimana barista kita seduh V60? Geser ya ☕\n\n#kopisenja #coffeetime', 1, '15:30', 'review', 'Behind the bar', 5],
    ['c2', 'carousel', 'Testimoni pelanggan November', 'Kata mereka setelah 4 minggu pakai Glowé Brightening Serum 💗', 1, '19:00', 'revisi', 'Testimoni', 3],
    ['c3', 'reels', 'Proses finishing meja jati', 'Dari papan kasar sampai jadi meja makan keluarga. Ini proses finishing-nya.', 2, '18:00', 'draft', 'Proses produksi', 1, 'video'],
    ['c1', 'reels', 'POV: barista bikin latte art', 'POV kamu jadi barista 5 menit sebelum buka 😆', 3, '17:00', 'klien', 'Behind the bar', 1, 'video'],
    ['c2', 'feed', 'Promo 12.12', 'Diskon 25% semua serum, hanya 12 Desember!\n\n#gloweskin #promo1212', 4, '12:00', 'draft', 'Promo', 1],
    ['c3', 'feed', 'Tips memilih kayu untuk dapur', '3 jenis kayu yang tahan lembap untuk kabinet dapur.', 5, '19:30', 'ide', 'Tips ruang', 0],
    ['c1', 'feed', 'Kopi Senja ulang tahun ke-3', 'Tiga tahun nemenin sore kamu 🧡', 6, '19:00', 'draft', 'Komunitas', 1],
    ['c2', 'reels', 'Cara pakai sunscreen yang benar', 'Dua jari itu cukup? Yuk bahas takaran sunscreen.', 7, '19:00', 'review', 'Edukasi', 1, 'video'],
    ['c3', 'carousel', 'Portofolio: rumah Bu Ana, Bintaro', 'Ruang keluarga dengan panel kayu jati Belanda.', 9, '16:00', 'draft', 'Portofolio', 3],
    ['c1', 'feed', 'Promo gajian', 'Gajian tiba! Beli 2 gratis 1 kopi susu.', 11, '12:00', 'ide', 'Promo', 0],
    ['c2', 'feed', 'Produk baru: Glowé Barrier Cream', '', 13, '19:00', 'ide', 'Produk', 0],
    ['c1', 'feed', 'Biji kopi baru dari Gayo', 'Single origin Gayo sudah datang. Rasanya fruity dan manis.', -2, '19:00', 'posted', 'Menu', 1],
    ['c2', 'reels', 'Mitos vs fakta jerawat', 'Pasta gigi bisa hilangkan jerawat? Mitos!', -3, '19:00', 'posted', 'Edukasi', 1, 'video'],
    ['c3', 'feed', 'Detail sambungan kayu', 'Sambungan purus tanpa paku, kuat sampai puluhan tahun.', -4, '18:00', 'posted', 'Proses produksi', 1],
    ['c1', 'carousel', '5 menu favorit pelanggan', 'Ini 5 menu yang paling sering dipesan bulan ini.', -5, '19:00', 'posted', 'Menu', 5],
    ['c2', 'feed', 'Kandungan aktif yang tidak boleh dicampur', '', -6, '19:00', 'posted', 'Edukasi', 1],
    ['c1', 'reels', 'Sore di Kopi Senja', '', -8, '17:00', 'posted', 'Komunitas', 1, 'video'],
    ['c2', 'carousel', 'Routine kulit berminyak', '', -9, '12:00', 'posted', 'Edukasi', 4],
    ['c3', 'reels', 'Timelapse pemasangan kitchen set', '', -10, '18:00', 'posted', 'Portofolio', 1, 'video'],
    ['c1', 'feed', 'Live music Jumat malam', '', -12, '19:00', 'posted', 'Komunitas', 1],
    ['c2', 'feed', 'Giveaway 10K followers', '', -14, '19:00', 'posted', 'Promo', 1]
  ];
  P.forEach((r, i) => {
    const [cid, type, title, caption, day, time, status, pillar, nMedia, kind] = r;
    const id = 'p' + (i + 1);
    const media = []; for (let k = 0; k < nMedia; k++) media.push(mk(cid, kind || 'image', `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${k + 1}.${kind === 'video' ? 'mp4' : 'jpg'}`, Math.max(1, 6 - day)));
    const log = [];
    if (status === 'revisi') log.push({ t: now - 26 * 3600000, text: 'Status: Draft → Menunggu Klien' }, { t: now - 5 * 3600000, text: 'Nadia: foto testimoni ke-2 diganti yang lebih terang, dan nama pelanggan disamarkan ya.' }, { t: now - 5 * 3600000 + 60000, text: 'Status: Menunggu Klien → Revisi' });
    if (status === 'klien') log.push({ t: now - (cid === 'c1' ? 3 : 0.3) * 86400000, text: 'Dikirim ke klien untuk approval' });
    D.posts[id] = { id, clientId: cid, type, title, caption, date: addDays(t, day), time, status, pillar, media, notes: '', link: status === 'posted' ? 'https://instagram.com/p/contoh' + i : '', log, createdAt: now - 10 * 86400000, stAt: status === 'klien' && cid === 'c1' ? now - 3 * 86400000 : now - 5 * 3600000 };
  });
  mk('c1', 'image', 'stok-foto-interior-cafe.jpg', 1); mk('c2', 'image', 'flatlay-serum-baru.jpg', 1); mk('c3', 'video', 'raw-workshop-amplas.mov', 2);
  [['Trend audio "sore di kota" buat Reels suasana kafe', 'c1', 'tren', 'https://instagram.com/reels/'], ['Seri edukasi "1 menit 1 kandungan"', 'c2', 'seri', ''], ['Kolaborasi dengan florist sebelah untuk Valentine', 'c1', 'musiman', ''], ['Reels ASMR amplas kayu', 'c3', 'audio', ''], ['Carousel "salah kaprah skincare" format meme', 'c2', '', ''], ['Template story Q&A mingguan untuk semua klien', '', 'story', '']].forEach((x, i) => { const id = 'i' + i; D.ideas[id] = { id, text: x[0], clientId: x[1], tag: x[2], ref: x[3], done: false, at: now - i * 86400000 * 1.5 }; });
  [['caption', 'Promo produk', 'Ada yang baru di {nama}! 🎉\n\n[nama produk] sekarang bisa kamu dapatkan dengan harga spesial [harga] sampai {tanggal}.\n\nYuk mampir atau DM {handle} untuk order.', ''], ['caption', 'Edukasi carousel', 'Sering bingung soal [topik]? Geser untuk tahu 3 hal yang perlu kamu tahu 👉\n\nSimpan postingan ini biar nggak lupa, dan share ke temanmu yang butuh!', ''], ['caption', 'CTA komentar', 'Kamu tim yang mana? Tulis jawabanmu di kolom komentar 👇', ''], ['caption', 'Testimoni', '"[kutipan pelanggan]"\n— [nama], [kota]\n\nTerima kasih sudah percaya sama {nama} 🙏', 'c2'], ['hashtag', 'F&B Jakarta', '#kulinerjakarta #jakartafoodies #kopikekinian #cafejakarta #ngopidulu #jajanjakarta', 'c1'], ['hashtag', 'Skincare lokal', '#skincarelokal #skincareindonesia #reviewskincare #kulitsehat #skincaretips #glowup', 'c2'], ['hashtag', 'Interior', '#desaininterior #interiorrumah #rumahminimalis #homedecorindonesia #furniturkayu', 'c3']].forEach((x, i) => { const id = 't' + i; D.templates[id] = { id, kind: x[0], title: x[1], body: x[2], clientId: x[3] }; });
  const base = { c1: [8400, 31000, 52000, 2100, 640], c2: [18200, 64000, 120000, 5400, 1500], c3: [3100, 9800, 15000, 690, 210] };
  Object.keys(base).forEach(cid => { for (let k = 5; k >= 1; k--) { const mm = addMonths(m, -k); const f = 1 + (5 - k) * .07 + (cid === 'c2' ? (5 - k) * .03 : 0); const b = base[cid]; const id = 'r' + cid + k; D.reports[id] = { id, clientId: cid, month: mm, followers: Math.round(b[0] * f), reach: Math.round(b[1] * (f + (k % 2 ? .05 : -.03))), impressions: Math.round(b[2] * f), engagement: Math.round(b[3] * (f + (k === 2 ? .2 : 0))), visits: Math.round(b[4] * f), top: k === 1 ? (cid === 'c1' ? 'Reels "Sore di Kopi Senja", 18 rb views' : cid === 'c2' ? 'Reels "Mitos vs fakta jerawat", 64 rb views' : 'Timelapse kitchen set, 9 rb views') : '', notes: k === 1 ? 'Reels edukasi & suasana paling kuat. Bulan depan tambah 1 Reels per minggu.' : '' }; } });
  const inv = [['c1', m, 2500000, 'lunas', addDays(t, -10), addDays(t, -12)], ['c2', m, 4000000, 'belum', addDays(t, 3), ''], ['c3', m, 2000000, 'belum', addDays(t, -2), ''], ['c1', addMonths(m, -1), 2500000, 'lunas', addDays(t, -38), addDays(t, -40)], ['c2', addMonths(m, -1), 4000000, 'lunas', addDays(t, -35), addDays(t, -36)]];
  inv.forEach((x, i) => { const id = 'v' + i; D.invoices[id] = { id, clientId: x[0], period: x[1], no: `INV/${x[1].replace('-', '')}/${pad(i % 3 + 1)}`, amount: x[2], status: x[3], due: x[4], paidAt: x[5], note: '' }; });
  [['Minta foto produk Barrier Cream ke Nadia', 'c2', 0], ['Rekap insight bulanan semua klien', '', 3], ['Riset 5 akun kompetitor interior', 'c3', 5], ['Kirim invoice Rumah Kayu (sudah lewat tempo)', 'c3', -1]].forEach((x, i) => { const id = 'k' + i; D.tasks[id] = { id, text: x[0], clientId: x[1], due: addDays(t, x[2]), done: false, at: now }; });
  return D;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
