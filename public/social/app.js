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
const CACHE_KEY = DEMO ? 'social_demo_v2' : 'social_cache_v1';
const PENDING_KEY = 'social_pending_v1';
const UI_KEY = 'social_ui_v1';
const WIB = 7 * 3600 * 1000;
const COLS = ['clients', 'posts', 'media', 'ideas', 'templates', 'reports', 'invoices', 'tasks', 'guests'];

const STATUS = [
  { k: 'draft', label: 'Draft' },
  { k: 'edit', label: 'Sedang Diedit' },
  { k: 'klien', label: 'Menunggu Klien' },
  { k: 'revisi', label: 'Revisi' },
  { k: 'jadwal', label: 'Terjadwal' },
  { k: 'posted', label: 'Terposting' }
];
// Status lama dipetakan ke 5 status baru (data lama otomatis diperbarui saat dibuka)
const LEGACY_ST = { ide: 'draft', review: 'draft', setuju: 'jadwal' };
const ST = Object.fromEntries(STATUS.concat([{ k: 'ide', label: 'Draft' }, { k: 'review', label: 'Draft' }, { k: 'setuju', label: 'Terjadwal' }]).map(s => [s.k, s]));
// Kategori konten sesuai jobdesk (podcast sustainability). min/max = frekuensi per minggu.
const CATS = [
  { k: 'intro', label: 'Guest Intro Call Carousel', short: 'Intro', type: 'carousel', min: 0, max: 7, color: '#30B0C7', icon: 'people', hint: 'Foto, nama, jabatan, organisasi, intro singkat (5 slide)' },
  { k: 'announce', label: 'Webisode Release Date Post', short: 'Release Date', type: 'feed', min: 1, max: 1, color: '#5856D6', icon: 'cal', hint: 'Template siap pakai: ganti foto, nama, tanggal' },
  { k: 'live', label: 'Webisode is Live Post', short: 'Live Post', type: 'feed', min: 1, max: 1, color: '#FF2D55', icon: 'mic', hint: 'Template siap pakai: foto tamu, judul episode, headline' },
  { k: 'livestory', label: 'Webisode is Live Story', short: 'Live Story', type: 'story', min: 1, max: 1, color: '#FF6B81', icon: 'story', hint: 'Story 9:16 bersamaan dengan post episode tayang' },
  { k: 'summary', label: 'Webisode Summary Carousel', short: 'Summary', type: 'carousel', min: 1, max: 1, color: '#FF9500', icon: 'list', hint: 'Poin diskusi, insight, takeaway dari transkrip' },
  { k: 'quote', label: 'Guest Quotes Post', short: 'Quote', type: 'feed', min: 2, max: 2, color: '#AF52DE', icon: 'quote', hint: 'Template siap pakai: foto tamu + kutipan sustainability' },
  { k: 'news', label: 'Trending Sustainability News / History', short: 'News', type: 'carousel', min: 4, max: 4, color: '#34C759', icon: 'leaf', hint: 'Berita tren / sejarah sustainability, fokus US' }
];
// Jadwal posting dari klien ("Webisodes Monthly Content"), dalam jam klien (Eastern). days: 0 = Minggu … 6 = Sabtu
const DEFAULT_SLOTS = {
  intro: { days: [0, 1, 2, 3, 4, 5, 6], time: '14:00' },
  announce: { days: [1], time: '14:00' },
  live: { days: [4], time: '08:00' },
  livestory: { days: [4], time: '08:00' },
  summary: { days: [0], time: '14:00' },
  quote: { days: [2, 6], time: '14:00' },
  news: { days: [2, 3, 5, 0], time: '17:00' }
};
const CAT = Object.fromEntries(CATS.map(c => [c.k, c]));
const GUEST_CATS = ['intro', 'announce', 'live', 'livestory', 'summary', 'quote'];
// Narasumber "Webisode saja" (noIntro) tidak butuh Guest Intro Call Carousel
const guestCats = g => GUEST_CATS.filter(k => !(k === 'intro' && g && g.noIntro));
const STAGES = [
  { k: 'intro', label: 'Intro call', short: 'Intro', color: '#30B0C7' },
  { k: 'jadwal', label: 'Rekaman dijadwalkan', short: 'Dijadwalkan', color: '#5856D6' },
  { k: 'rekam', label: 'Sudah rekaman', short: 'Direkam', color: '#FF9500' },
  { k: 'tayang', label: 'Episode tayang', short: 'Tayang', color: '#34C759' }
];
const STG = Object.fromEntries(STAGES.map(x => [x.k, x]));
const DONE_ST = ['setuju', 'jadwal', 'posted'];
const CHECKS = [['format', 'Format & ukuran sesuai'], ['tag', 'Tag tamu & kolaborator'], ['caption', 'Caption, hashtag & keyword'], ['story', 'Dibagikan ke Story']];
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
  tray: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  quote: 'M10 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3v1a3 3 0 0 1-3 3M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3v1a3 3 0 0 1-3 3',
  leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7'
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
const EN_D = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], EN_M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function enDate(date) { if (!date) return ''; const [, m, d] = date.split('-').map(Number); return `${EN_D[dow(date)]}, ${EN_M[m - 1]} ${d}`; }
// ---------------- ZONA WAKTU KLIEN ----------------
const LOCAL_TZ = 'Asia/Jakarta';
const TZ_OPTS = [['America/New_York', 'New York · Eastern (EST/EDT)'], ['America/Chicago', 'Chicago · Central (CST/CDT)'], ['America/Denver', 'Denver · Mountain (MST/MDT)'], ['America/Los_Angeles', 'Los Angeles · Pacific (PST/PDT)'], ['Europe/London', 'London (GMT/BST)'], ['Asia/Jakarta', 'Jakarta (WIB)']];
const clientTz = () => ((activeClients()[0] || {}).tz) || 'America/New_York';
function tzParts(tz, ms) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).forEach(x => { o[x.type] = x.value; });
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` };
}
function tzOffsetMin(tz, ms) { const p = tzParts(tz, ms); const [y, m, d] = p.date.split('-').map(Number), [hh, mm] = p.time.split(':').map(Number); return (Date.UTC(y, m - 1, d, hh, mm) - Math.floor(ms / 60000) * 60000) / 60000; }
function wallToUtc(tz, date, time) { const [y, m, d] = date.split('-').map(Number), [hh, mm] = (time || '00:00').split(':').map(Number); const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0); let u = guess - tzOffsetMin(tz, guess) * 60000; u = guess - tzOffsetMin(tz, u) * 60000; return u; }
function convertTz(fromTz, toTz, date, time) { return tzParts(toTz, wallToUtc(fromTz, date, time)); }
function tzAbbr(tz, ms) { if (tz === LOCAL_TZ) return 'WIB'; try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms || Date.now())).find(x => x.type === 'timeZoneName').value; } catch (e) { return 'ET'; } }
function tzDiffText(tz, ms) { const h = (tzOffsetMin(LOCAL_TZ, ms) - tzOffsetMin(tz, ms)) / 60; return (h >= 0 ? 'WIB lebih cepat ' : 'WIB lebih lambat ') + fmt(Math.abs(h), 1) + ' jam'; }
const fmt12 = t => { const [h, m] = String(t || '00:00').split(':').map(Number); return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
// Waktu klien untuk jadwal WIB: { date, time, abbr }
function toClient(date, time) { if (!date || !time) return null; const tz = clientTz(); const r = convertTz(LOCAL_TZ, tz, date, time); return Object.assign(r, { abbr: tzAbbr(tz, wallToUtc(LOCAL_TZ, date, time)) }); }
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
const UI = Object.assign({ gStage: '', cCat: '', tab: 'home', fClient: '', calMonth: today().slice(0, 7), calSel: today(), cView: 'board', cStatus: '', q: '', mKind: '', tKind: 'caption', repClient: '', finFilter: 'all' }, readLS(UI_KEY, {}));
UI.calMonth = today().slice(0, 7); UI.calSel = today();
let stack = [];   // halaman detail di atas tab (mis. detail klien)
let dbRef = null, authed = false, started = false, syncMode = DEMO ? 'demo' : 'local';
const localUrls = {}; // mode demo: blob URL hasil unggah
const uploads = {};   // id media → persen unggahan
let saveTimer = null;
function saveCache() { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeLS(CACHE_KEY, S), 150); }
function saveUI() { writeLS(UI_KEY, { gStage: UI.gStage, tab: UI.tab, fClient: UI.fClient, cView: UI.cView, mKind: UI.mKind, tKind: UI.tKind, repClient: UI.repClient, finFilter: UI.finFilter }); }

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
function migrateStatuses() { Object.values(S.posts || {}).forEach(p => { const n = LEGACY_ST[p.status]; if (n) dbSet('posts/' + p.id, Object.assign(clone(p), { status: n })); }); }
function applyRemote(v) {
  v = v || {};
  COLS.forEach(c => { S[c] = v[c] && typeof v[c] === 'object' ? v[c] : {}; });
  S.settings = v.settings && typeof v.settings === 'object' ? v.settings : (S.settings || {});
  Object.keys(pending).forEach(p => setLocal(p, pending[p] == null ? null : clone(pending[p])));
  migrateStatuses();
  saveCache(); flushPending(); render();
  if (!cleaned) { cleaned = true; setTimeout(autoClean, 4000); }
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
function postTitle(p) { if (p.title) return p.title; if (p.cat && CAT[p.cat]) { const g = guestOf(p.guestId); return CAT[p.cat].short + (g ? ' · ' + g.name : ''); } const l = String(p.caption || '').split('\n').find(x => x.trim()); return l ? l.slice(0, 60) : TYPES[p.type || 'feed'].label + ' tanpa judul'; }
function monthPosts(clientId, month) { return postsAll().filter(p => p.clientId === clientId && (p.date || '').slice(0, 7) === month); }
function pkgTotal(c) { const k = c.pkg || {}; return num(k.feed) + num(k.reels) + num(k.story); }
function pkgDone(clientId, month, type) { return monthPosts(clientId, month).filter(p => (p.status === 'posted' || p.status === 'jadwal') && (!type || (type === 'feed' ? (p.type === 'feed' || p.type === 'carousel') : p.type === type))).length; }
function needAction() { return postsAll().filter(p => p.status === 'revisi' || isLate(p)).length; }
function overdueInvoices() { const t = today(); return Object.values(S.invoices).filter(i => i.status !== 'lunas' && i.due && i.due < t); }
function weekStart(d) { return addDays(d, -((dow(d) + 6) % 7)); }
const guestsAll = () => Object.values(S.guests);
const guestOf = id => S.guests[id] || null;
const catOf = p => CAT[p.cat] || null;
const colorOf = p => (clients().length <= 1 && CAT[p.cat]) ? CAT[p.cat].color : cColor(p.clientId);
function slotsOf(c) { const s0 = (c && c.slots) || {}; return Object.fromEntries(CATS.map(k => { const x = s0[k.k] || DEFAULT_SLOTS[k.k]; return [k.k, { days: (x.days || []).map(Number), time: x.time || '14:00' }]; })); }
// Target mingguan = jumlah slot posting per minggu
function weeklyTarget(c) { const sl = slotsOf(c); return Object.fromEntries(CATS.map(k => [k.k, sl[k.k].days.length])); }
// Semua kemunculan slot (dalam WIB) antara dua tanggal WIB
function slotOccurrences(c, k, fromW, toW) {
  const sl = slotsOf(c)[k], tz = (c && c.tz) || 'America/New_York', out = [];
  if (!sl.days.length) return out;
  for (let d = addDays(fromW, -1); d <= addDays(toW, 1); d = addDays(d, 1)) {
    if (!sl.days.includes(dow(d))) continue;
    const w = convertTz(tz, LOCAL_TZ, d, sl.time);
    if (w.date >= fromW && w.date <= toW) out.push({ date: w.date, time: w.time, cDate: d, cTime: sl.time });
  }
  return out;
}
const slotTaken = (c, k, o, exceptId) => postsAll().some(p => p.id !== exceptId && p.cat === k && p.clientId === c.id && p.date === o.date && p.time === o.time);
function nextFreeSlot(c, k, fromW, exceptId) {
  if (!c) return null;
  const t = today(), now = nowTime(), start = fromW && fromW > t ? fromW : t;
  return slotOccurrences(c, k, start, addDays(start, 35)).find(o => !(o.date === t && o.time <= now) && !slotTaken(c, k, o, exceptId)) || null;
}
function weekStats(ws, clientId) {
  const we = addDays(ws, 6);
  const ps = postsAll().filter(p => p.cat && p.date >= ws && p.date <= we && (!clientId || p.clientId === clientId));
  const cs = clientId ? [clientOf(clientId)].filter(Boolean) : activeClients();
  const target = {}; CATS.forEach(k => { target[k.k] = 0; }); cs.forEach(c => { const t = weeklyTarget(c); CATS.forEach(k => { target[k.k] += t[k.k]; }); });
  const out = {}; CATS.forEach(k => { const mine = ps.filter(p => p.cat === k.k); out[k.k] = { done: mine.filter(p => DONE_ST.includes(p.status)).length, wip: mine.filter(p => !DONE_ST.includes(p.status) && p.status !== 'ide').length, target: target[k.k] }; });
  return out;
}
// Rotasi template Canva: tiap minggu pakai template berikutnya (A → B → C → A …)
const ROT_CATS = ['announce', 'live', 'livestory', 'quote'];
function weekIndex(d) { const [y, m, dd] = weekStart(d).split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, dd) / (7 * 86400000)); }
function rotList(c, k) { return String(((c || {}).rot || {})[k] || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [n, ...r] = x.split('|'); const link = r.join('|').trim(); return { name: n.trim() || 'Template', link: /^https?:\/\//.test(link) ? link : (/^https?:\/\//.test(n.trim()) ? n.trim() : '') }; }); }
function rotFor(c, k, d) { const xs = rotList(c, k); if (!xs.length) return null; const i = weekIndex(d || today()) % xs.length; return Object.assign({ i: i + 1, n: xs.length }, xs[i]); }
function sourceList(c) { return String((c || {}).sources || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [n, ...r] = x.split('|'); const link = r.join('|').trim(); return { name: n.trim(), link: /^https?:\/\//.test(link) ? link : '' }; }); }
function aiPrompt(kind, g, p) {
  const c = clientOf((g && g.clientId) || (p && p.clientId)) || {};
  const brand = `Brand: ${c.name || 'our podcast'} (Instagram @${c.handle || ''}), an independent, sustainability-focused podcast and media platform featuring entrepreneurs, environmental advocates, sustainability professionals and change-makers. Mission: make sustainability, innovation and positive impact accessible. Tone: ${((c.brand || {}).tone) || 'warm, optimistic, easy to understand'}. Language: English.`;
  const who = g ? `Guest: ${g.name}${g.role ? ', ' + g.role : ''}${g.org ? ' at ' + g.org : ''}${g.handle ? ' (Instagram @' + g.handle + ')' : ''}.` : '';
  const ht = hashtags((c.brand || {}).hashtags).join(' ');
  const capRule = `Then write an Instagram caption (max 150 words) with a strong first line, a call to action, ${g && g.handle ? 'a tag to @' + g.handle + ', ' : ''}3–5 relevant keywords, and these hashtags: ${ht || '#sustainability #podcast'}.`;
  if (kind === 'intro') return `${brand}\n\n${who}\n\nWe just had an intro call with this guest and agreed to record an episode together. Our audience doesn't know the guest yet, and the guest's audience doesn't know us, so this carousel introduces the collaboration and builds hype before we record.\n\nWrite the copy for a 5-slide Instagram carousel:\nSlide 1: the guest's photo with name, title and organization plus a short hook (the guest has authority, lead with them).\nSlide 2: what we're doing together (an upcoming podcast collaboration).\nSlide 3: who the guest is and why their work matters.\nSlide 4: the topics we plan to explore.\nSlide 5: call to action (follow both accounts, stay tuned, drop questions).\nKeep each slide under 30 words.\n\n${capRule}\n\nTopics we discussed:\n${g && g.topics ? g.topics : '[paste topics]'}\n\nIntro call transcript:\n${g && g.introTr ? g.introTr : '[paste transcript]'}`;
  if (kind === 'summary') return `${brand}\n\n${who}${g && g.epTitle ? ' Episode: "' + g.epTitle + '".' : ''}\n\nBelow is the transcript of our latest episode. Focus on the sustainability side of the conversation and ignore unrelated small talk.\n\n1) Write the copy for an Instagram carousel summarizing the episode: a cover slide with a hook, then 5–7 slides with the key discussion points, insights and takeaways (max 30 words each), and a final slide inviting people to listen to the full episode.\n2) Pick the ONE best, most thought-provoking quote the guest said about sustainability, word for word, for a quote graphic.\n3) ${capRule}\n\nTranscript:\n${g && g.epTr ? g.epTr : '[paste the YouTube transcript]'}`;
  if (kind === 'quote') return `${brand}\n\n${who}\n\nFrom the transcript below, pick the ONE best, most thought-provoking quote the guest said about sustainability, word for word (max 35 words). Give 2 alternatives too.\n\n${capRule}\n\nTranscript:\n${g && g.epTr ? g.epTr : '[paste the YouTube transcript]'}`;
  if (kind === 'news') return `${brand}\n\nCreate an educational, news-style Instagram carousel about this trending sustainability story${p && p.title ? ': "' + p.title + '"' : ''}. Our focus is mainly the US, but global stories are welcome. Rewrite everything in our own words (do not copy the source).\n\nWrite: a cover slide with a clear headline, slides explaining what happened, why it matters, and what people can do, and a final slide with the source name. Use as many slides as needed, max 30 words each. Only use facts from the source below.\n\n${capRule}\n\nSource: ${p && p.source ? p.source : '[paste link or article text]'}`;
  const cat = CAT[kind];
  return `${brand}\n\n${who}${g && g.epTitle ? ' Episode: "' + g.epTitle + '".' : ''}${g && g.recDate && kind === 'announce' ? ' Recording date: ' + enDate(g.recDate) + '.' : ''}${g && g.epLink && kind === 'live' ? ' Episode link: ' + g.epLink + '.' : ''}\n\nWrite an Instagram caption for our "${cat ? cat.label : 'post'}" graphic. ${capRule}`;
}
// ---------------- LINK PROGRESS UNTUK KLIEN ----------------
function shareToken() { const a = new Uint8Array(9); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); }
function ensureGuestShare(g) { if (g.share) return g.share; const tok = shareToken(); dbSet('guests/' + g.id, Object.assign(clone(g), { share: tok })); return tok; }
function ensureClientShare(c) {
  guestsAll().filter(g => g.clientId === c.id || !g.clientId).forEach(ensureGuestShare);
  if (c.share) return c.share; const tok = shareToken(); dbSet('clients/' + c.id, Object.assign(clone(c), { share: tok })); return tok;
}
const progressUrl = (key, tok) => `${location.origin}${location.pathname.replace(/\/[^/]*$/, '/')}progress/?${key}=${tok}${DEMO ? '&demo=1' : ''}`;
function greetOf(c) { const n = String((c && c.greet) || '').trim(); return n ? 'Hi ' + n + '!' : 'Hi!'; }
function progressMsg(kind, obj) {
  if (kind === 'g') { const c = clientOf(obj.clientId) || activeClients()[0]; return `${greetOf(c)} Right now I'm working on the designs for ${obj.name}. You can see my progress here, and you can also approve each design directly through this link:\n${progressUrl('g', ensureGuestShare(obj))}`; }
  return `${greetOf(obj)} Here's the progress for all our upcoming guests. You can open each guest to review and approve the designs directly:\n${progressUrl('c', ensureClientShare(obj))}`;
}
function openPrompt(kind, g, p) {
  const text = aiPrompt(kind, g, p);
  const w = openSheet({
    title: 'Prompt AI', left: 'Tutup',
    body: `<div><div class="form"><div class="field stack"><label for="aiText">Salin lalu tempel ke ChatGPT, Gemini, atau Grok</label><textarea id="aiText" rows="14">${esc(text)}</textarea></div></div><div class="form-foot">Transkrip dan topik diambil dari data tamu. Kalau masih kosong, tempel dulu di Edit tamu atau langsung di kotak ini.</div></div>
      <div class="btn-row" style="flex-direction:column"><button class="btn" id="aiCopy">${ic('copy')} Salin prompt</button>
      <div class="btn-row"><a class="btn-tinted gray" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a><a class="btn-tinted gray" href="https://gemini.google.com/" target="_blank" rel="noopener">Gemini</a><a class="btn-tinted gray" href="https://grok.com/" target="_blank" rel="noopener">Grok</a></div></div>`
  });
  w.querySelector('#aiCopy').addEventListener('click', () => copyText(w.querySelector('#aiText').value, w.querySelector('#aiText')));
}
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
<input type="file" id="thumbInput" accept="image/*,video/*" hidden>
<input type="file" id="photoInput" accept="image/*" hidden>
<input type="file" id="importInput" accept="application/json,.json" hidden>`;
}

const TABS = [
  { k: 'home', label: 'Hari ini', icon: 'home', tile: '#007AFF' },
  { k: 'calendar', label: 'Kalender', icon: 'cal', tile: '#FF3B30' },
  { k: 'content', label: 'Konten', icon: 'stack', tile: '#AF52DE' },
  { k: 'guests', label: 'Tamu', icon: 'mic', tile: '#FF2D55' },
  { k: 'more', label: 'Lainnya', icon: 'more', tile: '#8E8E93' }
];
const MORE = [
  { k: 'clients', label: 'Klien', icon: 'people', tile: '#34C759', sub: 'Akun Instagram yang kamu pegang' },
  { k: 'media', label: 'Media Library', icon: 'photo', tile: '#FF9500', sub: 'Opsional · file di Cloudflare R2' },
  { k: 'ideas', label: 'Ide & Berita', icon: 'bulb', tile: '#FFCC00', sub: 'Ide konten & bahan berita sustainability' },
  { k: 'templates', label: 'Template', icon: 'doc', tile: '#5856D6', sub: 'Caption & grup hashtag' },
  { k: 'reports', label: 'Laporan', icon: 'chart', tile: '#30B0C7', sub: 'Insight bulanan per klien' },
  { k: 'finance', label: 'Keuangan', icon: 'wallet', tile: '#34C759', sub: 'Paket, tagihan & pembayaran' },
  { k: 'settings', label: 'Pengaturan', icon: 'gear', tile: '#8E8E93', sub: 'Sinkron, cadangan, keamanan' }
];
const SIMPLE = () => !S.settings || S.settings.simple !== false;
const ADV_PAGES = ['media', 'templates', 'reports', 'finance'];
const morePages = () => MORE.filter(m => !SIMPLE() || !ADV_PAGES.includes(m.k));
const ALL_PAGES = Object.fromEntries([...TABS, ...MORE].map(t => [t.k, t]));

function badgeFor(k) {
  if (k === 'content') return needAction();
  if (k === 'finance') return overdueInvoices().length;
  return 0;
}
// ---------------- LOGO APP ----------------
const curLogo = () => (S.settings && S.settings.logo) || (window.NS_DEFAULT_LOGO || 'bubble');
const logoHTML = size => window.nsLogoSVG ? window.nsLogoSVG(curLogo(), size) : '';
let iconKey = '';
// Ikon tab browser & Layar Utama mengikuti logo terpilih (PNG dari SVG lewat canvas)
function applyIcons() {
  if (!window.nsLogoSVG || iconKey === curLogo()) return;
  iconKey = curLogo();
  const svg = window.nsLogoSVG(iconKey, 180).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/<rect width="100" height="100" rx="22.5"/, '<rect width="100" height="100" rx="0"');
  const img = new Image();
  img.onload = () => {
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 180; cv.getContext('2d').drawImage(img, 0, 0, 180, 180);
      const url = cv.toDataURL('image/png');
      ['apple-touch-icon', 'icon'].forEach(rel => { let l = document.querySelector(`link[rel="${rel}"]`); if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); } l.href = url; });
    } catch (e) {}
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function renderSide() {
  const btn = t => { const b = badgeFor(t.k); return `<button class="${UI.tab === t.k && !stack.length ? 'on' : ''}" data-a="tab" data-k="${t.k}"><span class="tile" style="background:${t.tile}">${ic(t.icon)}</span>${t.label}${b ? `<span class="badge">${b}</span>` : ''}</button>`; };
  $('side').innerHTML = `<div class="side-head"><div class="app-logo-svg">${logoHTML(38)}</div><div><div class="b">Nexa Social</div><div class="t-cap muted">Social Media Manager</div></div></div>
    ${TABS.filter(t => t.k !== 'more').map(btn).join('')}
    <div class="side-sec">Alat</div>${morePages().map(btn).join('')}
    <div class="side-sec">Klien</div>${clients().map(c => `<button data-a="client" data-id="${c.id}">${avatar(c, 'sm')}${esc(c.name)}</button>`).join('') || '<div class="t-foot muted" style="padding:4px 10px">Belum ada klien</div>'}
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
  try { renderInner(); } catch (e) { showFatal(e); }
}
// Jangan biarkan layar kosong: tampilkan error + jalan keluar
function showFatal(e) {
  console.error(e);
  const msg = esc((e && (e.message || e)) + '') + (e && e.stack ? '<br><small>' + esc(String(e.stack).split('\n').slice(0, 3).join(' · ')) + '</small>' : '');
  const box = `<div class="fatal"><b>Ada yang error saat menampilkan halaman.</b><span>Screenshot pesan ini untuk perbaikan:</span><code>${msg}</code><button class="btn" onclick="location.reload()">Muat ulang</button><button class="btn-tinted red" onclick="try{localStorage.removeItem('${CACHE_KEY}');localStorage.removeItem('${UI_KEY}')}catch(x){};location.reload()">Hapus cache di HP ini lalu muat ulang</button><span class="t-foot muted">Menghapus cache tidak menghapus data di Firebase.</span></div>`;
  const pg = document.getElementById('page');
  if (pg && document.getElementById('app')) { document.getElementById('app').classList.remove('hidden'); pg.innerHTML = box; }
  else document.body.insertAdjacentHTML('afterbegin', box);
}
window.addEventListener('error', ev => { const r = document.getElementById('root'); if (!r || !r.innerHTML.trim() || !document.getElementById('page') || !document.getElementById('page').innerHTML.trim()) showFatal(ev.error || ev.message); });
function renderInner() {
  applyIcons();
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
const avatar = (c, cls) => c && c.photo ? `<span class="avatar has-photo ${cls || ''}"><img src="${c.photo}" alt=""></span>` : `<span class="avatar ${cls || ''}" style="background:${c ? c.color : '#8E8E93'}">${esc(initials(c ? c.name : '?'))}</span>`;
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
// Gambar penanda konten: screenshot kecil (Firebase) → media R2 → gradasi contoh → ikon jenis
function postVis(p) {
  const t = TYPES[p.type || 'feed'];
  const badge = ((p.media || []).length > 1 || p.type === 'carousel') ? ic('carousel', 'tbadge') : (p.type === 'reels' ? ic('play', 'tbadge') : '');
  if (p.thumb) return { style: '', inner: `<img src="${p.thumb}" alt="" loading="lazy">` + badge };
  const m = mediaOfPost(p)[0];
  if (m) return { style: phStyle(m, cColor(p.clientId)), inner: mediaInner(m) + badge };
  if (p.ph) return { style: `background:linear-gradient(135deg,${p.ph[0]},${p.ph[1]});color:rgba(255,255,255,.9)`, inner: ic(t.icon) + badge };
  return { style: '', inner: ic(t.icon) };
}
function postThumb(p, cls) { const v = postVis(p); return `<span class="${cls || 'thumb'}" style="${v.style}">${v.inner}</span>`; }
function postRow(p, opt) {
  opt = opt || {};
  const c = clientOf(p.clientId);
  const late = isLate(p);
  const when = opt.timeCol ? '' : ` · ${relDay(p.date)}${p.time ? ' ' + p.time : ''}`;
  return `<button class="row" data-a="post" data-id="${p.id}">
    ${opt.timeCol ? `<span class="time-col">${esc(p.time || '—')}<small>${TYPES[p.type || 'feed'].label}</small></span>` : ''}${opt.bar ? `<span class="evbar" style="background:${colorOf(p)}"></span>` : ''}
    ${postThumb(p)}
    <span class="grow"><div class="ttl">${esc(postTitle(p))}</div>
      <div class="sub">${catOf(p) ? `<span class="cdot-in" style="background:${catOf(p).color}"></span>${esc(catOf(p).short)}` : (c ? '@' + esc(c.handle || c.name) : 'Tanpa klien')}${opt.timeCol ? '' : ' · ' + TYPES[p.type || 'feed'].label}${when}</div>
      ${opt.reason ? `<div class="row-meta">${opt.reason}</div>` : ''}</span>
    ${late && !opt.reason ? '<span class="pill warn">Terlambat</span>' : pillSt(p.status || 'draft')}
  </button>`;
}
function clientChips() {
  const cs = clients();
  if (cs.length <= 1) return '';
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
  const t = today(), now = nowTime(), month = t.slice(0, 7);
  const all = postsAll();
  const todayPosts = sortBy(all.filter(p => p.date === t && p.status !== 'ide'), postKey);
  const waiting = sortBy(all.filter(p => p.status === 'klien'), p => p.stAt || 0);
  const revisi = all.filter(p => p.status === 'revisi');
  const late = sortBy(all.filter(isLate), postKey);
  const tasks = sortBy(Object.values(S.tasks).filter(x => !x.done), x => x.due || '9999');
  const doneTasks = Object.values(S.tasks).filter(x => x.done).length;
  const unpaid = Object.values(S.invoices).filter(i => i.status !== 'lunas');
  const name = (S.settings && S.settings.name) || 'Hadzmi';
  const h = Number(now.slice(0, 2));
  const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  const act = activeClients();
  const tot = act.reduce((x, c) => x + pkgTotal(c), 0), done = act.reduce((x, c) => x + pkgDone(c.id, month), 0);
  if (!clients().length) return { title: 'Hari ini', right: syncPill(), html: `${largeTitle('Hari ini', prettyDate(t, true) + ' · ' + greet + ', ' + esc(name))}${demoBar()}${empty('people', 'Mulai dengan menambahkan klien pertamamu.', `<button class="btn-tinted" data-a="newClient">${ic('plus')} Tambah klien</button>`)}` };

  // Live Activity: konten berikutnya hari ini yang tayang dalam 3 jam
  const minsTo = p => { const [a1, b1] = (p.time || '00:00').split(':').map(Number), [a2, b2] = now.split(':').map(Number); return a1 * 60 + b1 - (a2 * 60 + b2); };
  const live = todayPosts.find(p => p.status !== 'posted' && p.time && minsTo(p) >= 0 && minsTo(p) <= 180);
  let liveW = '';
  if (live) {
    const c = clientOf(live.clientId) || {}, m = minsTo(live);
    const ck = live.check || {};
    const checks = [['Caption', !!live.caption], ['Desain', !!(live.thumb || live.design || (live.media || []).length)], ['Tag', !!(ck.tag || (!live.guestId && !live.tags))], ['Approval', ['setuju', 'jadwal'].includes(live.status)]];
    const pct = checks.filter(x => x[1]).length / checks.length * 100;
    liveW = `<button class="w md live" data-a="post" data-id="${live.id}" style="--lc:${c.color || '#3A3A3C'}">
      <div class="live-top"><span class="tile live-ic">${ic('ig')}</span><span class="grow" style="min-width:0"><span class="live-k">Tayang ${esc(live.time)} · ${m < 60 ? m + ' menit lagi' : Math.floor(m / 60) + ' jam ' + (m % 60) + ' menit lagi'}</span><span class="live-t">${esc(postTitle(live))} · ${esc(c.name || '')}</span></span>${postThumb(live, 'wthumb sm')}</div>
      <div class="live-checks">${checks.map(x => `<span class="${x[1] ? 'ok' : ''}">${x[0]} ${ic(x[1] ? 'check' : 'circle')}</span>`).join('')}</div>
      <div class="live-bar"><span style="width:${pct}%"></span></div></button>`;
  }
  const ws = weekStart(t), wk = weekStats(ws);
  const wDone = CATS.reduce((x, k) => x + wk[k.k].done, 0), wTarget = CATS.reduce((x, k) => x + wk[k.k].target, 0), wWip = CATS.reduce((x, k) => x + wk[k.k].wip, 0);
  const ringPct = wTarget ? wDone / wTarget : 0;
  // Matriks slot posting minggu ini, dalam hari klien (Senin–Minggu)
  const mc = activeClients()[0];
  let weekTargetW = '';
  if (mc) {
    const tzc = mc.tz || 'America/New_York', cToday = tzParts(tzc, Date.now()).date, cws = weekStart(cToday);
    const cdays = Array.from({ length: 7 }, (_, i) => addDays(cws, i));
    const sl = slotsOf(mc);
    let filled = 0, total = 0;
    const rows = CATS.filter(k => sl[k.k].days.length).map(k => `<span class="sm-row"><span class="sm-l"><span class="cdot" style="background:${k.color}"></span><span class="ell">${esc(k.short)}</span></span>${cdays.map(cd => {
      if (!sl[k.k].days.includes(dow(cd))) return '<span class="sm-c none"></span>';
      total++;
      const w = convertTz(tzc, LOCAL_TZ, cd, sl[k.k].time);
      const p = postsAll().find(x => x.cat === k.k && x.clientId === mc.id && x.date === w.date && x.time === w.time) || postsAll().find(x => x.cat === k.k && x.clientId === mc.id && x.date === w.date);
      const past = w.date < t || (w.date === t && w.time <= now);
      if (p) { const st = p.status === 'posted' ? 'posted' : DONE_ST.includes(p.status) ? 'done' : 'wip'; if (st !== 'wip') filled++; return `<span class="sm-c ${st}" data-a="post" data-id="${p.id}" style="--c:${k.color}" title="${esc(postTitle(p))}"></span>`; }
      return `<span class="sm-c free ${past ? 'missed' : ''}" data-a="slotNew" data-k="${k.k}" data-date="${w.date}" data-time="${w.time}" data-client="${mc.id}" style="--c:${k.color}" title="Slot kosong ${prettyDate(w.date, true)} ${w.time} WIB"></span>`;
    }).join('')}</span>`).join('');
    weekTargetW = `<div class="w lg slotmx"><div class="w-head"><span style="color:var(--green)">Slot posting minggu ini</span><span class="muted num">${filled}/${total}</span></div>
      <span class="sm-row sm-h"><span class="sm-l muted">Hari klien (${esc(tzAbbr(tzc))})</span>${cdays.map(cd => `<span class="sm-d ${cd === cToday ? 'on' : ''}">${'MSSRKJS'[dow(cd)]}<small>${Number(cd.slice(8))}</small></span>`).join('')}</span>
      ${rows}
      <span class="sm-legend"><i class="posted"></i>Terposting <i class="done"></i>Siap <i class="wip"></i>Dikerjakan <i class="free"></i>Kosong (ketuk untuk buat)</span></div>`;
  }
  const rc = activeClients()[0];
  const rots = ROT_CATS.map(k => [k, rotFor(rc, k, t)]).filter(x => x[1]);
  const rotW = rots.length ? `<div class="w md"><div class="w-head"><span style="color:var(--indigo)">Template minggu ini</span><span class="muted">rotasi mingguan</span></div>${rots.map(([k, r]) => `<div class="wrow"><span class="wbar" style="background:${CAT[k].color}"></span><span class="grow" style="min-width:0"><span class="ell b" style="display:block;font-size:15px">${esc(CAT[k].short)}</span><span class="w-sub">${esc(r.name)} · ${r.i}/${r.n}</span></span>${r.link ? `<a class="btn-tinted gray" href="${esc(r.link)}" target="_blank" rel="noopener">Canva</a>` : ''}</div>`).join('')}</div>` : '';
  const upG = sortBy(guestsAll().filter(g => (g.introDate >= t && g.introDate <= addDays(t, 6)) || (g.recDate >= t && g.recDate <= addDays(t, 6)) || (g.pubDate >= t && g.pubDate <= addDays(t, 6))), g => [g.introDate, g.recDate, g.pubDate].filter(d => d && d >= t).sort()[0] || '');
  const guestW = `<div class="w md"><div class="w-head"><span style="color:var(--pink)">Tamu minggu ini</span><button class="muted" data-a="tab" data-k="guests" style="font-size:12px;text-transform:none;letter-spacing:0">Semua</button></div>
    ${upG.length ? upG.slice(0, 4).map(g => { const ev = [[g.introDate, 'Intro call'], [g.recDate, 'Rekaman'], [g.pubDate, 'Tayang']].filter(x => x[0] && x[0] >= t && x[0] <= addDays(t, 6)).sort()[0]; return `<button class="wrow" data-a="guest" data-id="${g.id}">${guestAv(g, 34)}<span class="grow" style="min-width:0"><span class="ell b" style="display:block;font-size:15px">${esc(g.name)}</span><span class="w-sub ell" style="display:block">${esc(ev[1])} · ${relDay(ev[0])}${ev[1] === 'Rekaman' && g.recTime ? ' ' + esc(g.recTime) : ''}</span></span>${packDots(g)}</button>`; }).join('') : `<div class="w-empty">Belum ada intro call, rekaman, atau episode minggu ini.<button class="btn-tinted" data-a="newGuest">${ic('plus')} Tambah tamu</button></div>`}</div>`;
  const wait = waiting[0];
  const waitW = wait ? (() => { const c = clientOf(wait.clientId) || {}; return `<div class="w md"><div class="wsplit">${postThumb(wait, 'wthumb lg')}<div class="grow" style="min-width:0;display:flex;flex-direction:column;gap:3px">
      <span class="w-k" style="color:var(--orange)">Menunggu klien${waiting.length > 1 ? ' · ' + waiting.length : ''}</span><button class="w-title" data-a="post" data-id="${wait.id}">${esc(postTitle(wait))}</button>
      <span class="w-sub">${esc(c.name || '')} · ${wait.date ? relDay(wait.date) + (wait.time ? ' ' + wait.time : '') : 'tanpa jadwal'}${wait.stAt ? ' · ' + agoText(wait.stAt) : ''}</span>
      <span style="margin-top:6px"><button class="btn-tinted green" data-a="followUp" data-id="${wait.id}">${ic('send')} Follow up</button></span></div></div></div>`; })()
    : `<div class="w md"><span class="w-k" style="color:var(--green)">Approval</span><div class="w-title">Semua approval beres</div><span class="w-sub">Tidak ada konten yang menunggu balasan klien.</span></div>`;
  const sched = `<div class="w lg"><div class="w-head"><span style="color:var(--red)">Jadwal hari ini</span><span class="muted">${todayPosts.length} konten</span></div>
    ${todayPosts.length ? todayPosts.slice(0, 6).map(p => `<button class="wrow" data-a="post" data-id="${p.id}"><span class="wbar" style="background:${colorOf(p)}"></span><span class="grow" style="min-width:0"><span class="ell b" style="display:block;font-size:15px">${esc(postTitle(p))}</span><span class="w-sub num">${esc(p.time || '—')} · ${esc(catOf(p) ? catOf(p).short : (clientOf(p.clientId) || {}).name || '')} · ${TYPES[p.type || 'feed'].label}</span></span>${p.status === 'posted' ? `<span style="color:var(--green);font-size:20px">${ic('checkc')}</span>` : isLate(p) ? '<span class="pill warn">Terlambat</span>' : pillSt(p.status)}</button>`).join('') + (todayPosts.length > 6 ? `<button class="w-more" data-a="tab" data-k="calendar">+${todayPosts.length - 6} lainnya</button>` : '')
      : `<div class="w-empty">Tidak ada jadwal hari ini.<button class="btn-tinted" data-a="newPost" data-date="${t}">${ic('plus')} Buat konten</button></div>`}</div>`;
  // 7 hari ke depan
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const cnt = days.map(d => all.filter(p => p.date === d && p.status !== 'ide'));
  const mx = Math.max(1, ...cnt.map(x => x.length));
  const weekW = `<button class="w md" data-a="tab" data-k="calendar"><div class="w-head"><span style="color:var(--blue)">7 hari ke depan</span><span class="muted">${cnt.reduce((x, y) => x + y.length, 0)} konten</span></div>
    <div class="wweek">${days.map((d, i) => `<span class="wday ${i === 0 ? 'on' : ''}"><span class="wcol">${cnt[i].map(p => `<i style="background:${colorOf(p)}"></i>`).join('') || '<i class="none"></i>'}</span><span class="wn num">${cnt[i].length}</span><span class="wd">${DAYS_S[dow(d)]}</span></span>`).join('')}</div></button>`;
  const taskW = `<div class="w md"><div class="w-head"><span style="color:var(--indigo)">Tugas</span>${doneTasks ? `<button class="muted" data-a="clearTasks" style="font-size:12px;text-transform:none;letter-spacing:0">Hapus ${doneTasks} selesai</button>` : `<span class="muted">${tasks.length}</span>`}</div>
    ${tasks.slice(0, 4).map(x => { const c = clientOf(x.clientId); return `<div class="wrow"><button data-a="toggleTask" data-id="${x.id}" style="font-size:22px;color:var(--label3);display:flex" aria-label="Tandai selesai">${ic('circle')}</button><button class="grow" data-a="editTask" data-id="${x.id}" style="text-align:left;min-width:0"><span class="ell" style="display:block;font-size:15px">${esc(x.text)}</span><span class="w-sub">${[c ? esc(c.name) : '', x.due ? (x.due < t ? `<span class="c-red">${relDay(x.due)}</span>` : relDay(x.due)) : ''].filter(Boolean).join(' · ') || 'Tanpa tenggat'}</span></button></div>`; }).join('')}
    <button class="w-more" data-a="newTask">${ic('plus')} Tambah tugas</button></div>`;
  const smallW = (n, label, sub, icon, color, a, k, blue) => `<button class="w sm ${blue ? 'blue' : ''}" data-a="${a}" data-k="${k || ''}"><span class="tile round" style="background:${blue ? 'rgba(255,255,255,.22)' : color}">${ic(icon)}</span><span><span class="w-big ${blue ? '' : 'mid'}">${n}</span><span class="w-lbl">${label}</span>${sub ? `<span class="w-sub ell" style="display:block">${sub}</span>` : ''}</span></button>`;
  return {
    title: 'Hari ini',
    right: syncPill(),
    html: `${largeTitle('Hari ini', prettyDate(t, true) + ' · ' + greet + ', ' + esc(name))}
      ${demoBar()}
      <div class="widgets">
        ${liveW}
        ${smallW(todayPosts.length, 'posting hari ini', '', 'cal', '', 'tab', 'calendar', true)}
        ${(() => { const tz = clientTz(), ms = Date.now(), cp = tzParts(tz, ms); return `<button class="w sm" data-a="tzOpen"><span class="w-head"><span style="color:var(--orange)">Jam klien</span>${ic('clock')}</span><span><span class="w-big mid num">${fmt12(cp.time)}</span><span class="w-lbl">${esc(tzAbbr(tz, ms))} · ${cp.date === today() ? 'hari yang sama' : cp.date < today() ? 'masih kemarin' : 'besok'}</span><span class="w-sub">WIB ${nowTime()} · ketuk untuk konversi</span></span></button>`; })()}
        ${SIMPLE() ? '' : `<button class="w sm" data-a="tab" data-k="content"><span class="ring-wrap">${ringSvg(ringPct, 'var(--green)', 96, 11)}<span class="ring-num"><b class="num">${wDone}</b><small>dari ${wTarget}</small></span></span><span class="w-lbl" style="text-align:center">Minggu ini${wWip ? ` · ${wWip} proses` : ''}</span></button>`}
        ${SIMPLE() && !waiting.length ? '' : waitW}
        ${sched}
        ${weekTargetW}
        ${SIMPLE() && !late.length ? '' : smallW(late.length, late.length ? 'terlambat' : 'tidak ada yang telat', late[0] ? esc(postTitle(late[0])) : '', 'alert', 'var(--red)', 'statFilter', 'late')}
        ${SIMPLE() && !revisi.length ? '' : smallW(revisi.length, 'perlu revisi', revisi[0] ? esc(postTitle(revisi[0])) : '', 'pencil', 'var(--orange)', 'statFilter', 'revisi')}
        ${SIMPLE() ? '' : guestW + rotW + taskW + weekW + smallW(short(unpaid.reduce((x, i) => x + num(i.amount), 0)), unpaid.length + ' tagihan belum lunas', overdueInvoices().length ? `<span class="c-red">${overdueInvoices().length} lewat tempo</span>` : '', 'wallet', 'var(--green)', 'tab', 'finance')}

      </div>`
  };
};
function ringSvg(pct, col, sz, sw) { const r = (sz - sw) / 2, c = 2 * Math.PI * r; return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" style="transform:rotate(-90deg);display:block" aria-hidden="true"><circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="rgba(120,120,128,.16)" stroke-width="${sw}"/><circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(c * Math.min(1, pct)).toFixed(1)} ${c.toFixed(1)}"/></svg>`; }
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
  let cells = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d, i) => `<div class="cal-dow ${i > 4 ? 'we' : ''}">${d}</div>`).join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), ps = sortBy(byDate[d] || [], postKey);
    const evs = ps.slice(0, 3).map(p => `<span class="ev" style="background:${colorOf(p)};--evc:${colorOf(p)}"><b><small>${esc(p.time || '')}</small>${esc(clients().length <= 1 && catOf(p) ? catOf(p).short : (clientOf(p.clientId) || { name: '' }).name)}</b></span>`).join('');
    cells += `<button class="cal-day ${d.slice(0, 7) !== UI.calMonth ? 'out' : ''} ${i % 7 > 4 ? 'we' : ''} ${d === t ? 'today' : ''} ${d === UI.calSel ? 'sel' : ''}" data-a="calSel" data-d="${d}" aria-label="${prettyDate(d, true)}, ${ps.length} konten">
      <span class="d">${Number(d.slice(8))}</span><span class="cal-evs">${evs}${ps.length > 3 ? `<span class="more">+${ps.length - 3} lagi</span>` : ''}</span></button>`;
  }
  const sel = sortBy(byDate[UI.calSel] || [], postKey);
  const sc = activeClients()[0];
  const freeSlots = sc ? sortBy(CATS.flatMap(k => slotOccurrences(sc, k.k, UI.calSel, UI.calSel).filter(o => !slotTaken(sc, k.k, o)).map(o => Object.assign(o, { k: k.k }))), o => o.time) : [];
  const freeHTML = freeSlots.length ? `<div class="list">${freeSlots.map(o => `<button class="row slot-row" data-a="slotNew" data-k="${o.k}" data-date="${o.date}" data-time="${o.time}" data-client="${sc.id}"><span class="time-col">${o.time}<small>WIB</small></span><span class="evbar" style="background:${CAT[o.k].color};opacity:.4"></span><span class="grow"><div class="ttl muted">${esc(CAT[o.k].short)}</div><div class="sub">Slot kosong · ${fmt12(o.cTime)} ${esc(tzAbbr(sc.tz || 'America/New_York'))}</div></span><span class="btn-tinted" style="font-size:13px;padding:5px 10px">${ic('plus')} Buat</span></button>`).join('')}</div>` : '';
  const monthCount = postsF().filter(p => (p.date || '').slice(0, 7) === UI.calMonth && p.status !== 'ide').length;
  return {
    title: 'Kalender',
    right: `<button class="nav-btn" data-a="calToday" style="font-size:17px">Hari ini</button>`,
    html: `${largeTitle('Kalender', monthCount + ' konten bulan ini', plusBtn('newPost', `data-date="${UI.calSel}"`))}
      ${clientChips()}
      <div class="cal"><div class="cal-head"><span class="m">${MONL[m - 1]} <span>${y}</span></span><span class="arrows"><button data-a="calNav" data-n="-1" aria-label="Bulan sebelumnya">${ic('chevL')}</button><button data-a="calNav" data-n="1" aria-label="Bulan berikutnya">${ic('chevR')}</button></span></div>
      <div class="cal-grid">${cells}</div></div>
      ${clients().length <= 1 ? `<div class="cat-legend">${CATS.map(k => `<span><i style="background:${k.color}"></i>${esc(k.short)}</span>`).join('')}</div>` : ''}
      ${group(relDay(UI.calSel) === prettyDate(UI.calSel, true, true) ? prettyDate(UI.calSel, true) : relDay(UI.calSel) + ' · ' + prettyDate(UI.calSel), (sel.length ? `<div class="list">${sel.map(p => postRow(p, { timeCol: true, bar: true })).join('')}</div>` : (freeHTML ? '' : empty('cal', 'Kosong. Ketuk + untuk menjadwalkan konten di tanggal ini.'))) + freeHTML, { action: `<button data-a="newPost" data-date="${UI.calSel}">Tambah</button>` })}`
  };
};

// ---------------- VIEW: KONTEN ----------------
VIEWS.content = () => {
  let ps = postsF();
  const catChips = `<div class="chips"><button class="chip ${!UI.cCat ? 'on' : ''}" data-a="cCat" data-k="">Semua kategori</button>${CATS.map(k => `<button class="chip ${UI.cCat === k.k ? 'on' : ''}" data-a="cCat" data-k="${k.k}"><span class="cdot" style="background:${k.color}"></span>${esc(k.short)} <span class="n">${ps.filter(p => p.cat === k.k).length}</span></button>`).join('')}</div>`;
  if (UI.cCat) ps = ps.filter(p => p.cat === UI.cCat);
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
    body = `<label class="searchbar">${ic('search')}<input id="qInput" type="search" placeholder="Cari judul, caption, pilar" value="${esc(UI.q)}" autocomplete="off"></label>${chips}
      ${Object.keys(groups).length ? Object.keys(groups).sort().map(k => group(k === 'none' ? 'Tanpa tanggal' : monthLabel(k), `<div class="list">${groups[k].map(p => postRow(p)).join('')}</div>`)).join('') : empty('stack', 'Tidak ada konten yang cocok.')}`;
  }
  return {
    title: 'Konten',
    html: `${largeTitle('Konten', ps.length + ' konten' + (lateN ? ` · <span class="c-red">${lateN} terlambat</span>` : ''), plusBtn('newPost'))}
      ${clientChips()}
      ${catChips}
      <div class="seg" style="max-width:280px"><button class="${UI.cView === 'board' ? 'on' : ''}" data-a="cView" data-k="board">Papan alur</button><button class="${UI.cView === 'list' ? 'on' : ''}" data-a="cView" data-k="list">Daftar</button></div>
      ${body}`
  };
};
function kcard(p) {
  const c = clientOf(p.clientId), t = TYPES[p.type || 'feed'], v = postVis(p);
  return `<button class="kcard" data-a="post" data-id="${p.id}">
    <span class="media ${p.type || ''}" style="${v.style}">${v.inner}</span>
    <span class="k-title">${esc(postTitle(p))}</span>
    ${p.caption ? `<span class="k-cap">${esc(p.caption)}</span>` : ''}
    <span class="k-foot"><span style="display:flex;align-items:center;gap:6px;min-width:0">${catOf(p) ? `<span class="cdot" style="background:${catOf(p).color}"></span>` : avatar(c, 'sm')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(catOf(p) ? catOf(p).short : t.label)}</span></span><span class="${isLate(p) ? 'c-red b' : ''}">${p.date ? relDay(p.date) + (p.time ? ' ' + p.time : '') : '—'}</span></span>
  </button>`;
}

// ---------------- VIEW: KLIEN ----------------
VIEWS.clients = () => {
  const t = today(), month = t.slice(0, 7);
  const cs = clients();
  return {
    title: 'Klien',
    html: `${largeTitle('Klien', cs.length + ' akun Instagram', plusBtn('newClient'))}
      ${cs.length ? `<div class="stack-list">${cs.map(c => {
        const total = pkgTotal(c), done = pkgDone(c.id, month), pct = total ? done / total : 0;
        const mine = postsAll().filter(p => p.clientId === c.id && p.status !== 'ide');
        const upcoming = sortBy(mine.filter(p => p.status !== 'posted'), postKey);
        const recent = sortBy(mine.filter(p => p.status === 'posted'), postKey).reverse();
        const strip = upcoming.concat(recent).slice(0, 5);
        const nW = mine.filter(p => p.status === 'klien').length, nR = mine.filter(p => p.status === 'revisi').length;
        const nx = upcoming.find(p => p.date >= t);
        return `<button class="w stackcard ${c.status === 'jeda' ? 'paused' : ''}" data-a="client" data-id="${c.id}">
          <div class="sc-head">${avatar(c, 'md')}<span class="grow" style="min-width:0"><span class="w-title ell" style="display:block">${esc(c.name)}</span><span class="w-sub ell" style="display:block">@${esc(c.handle || '')}${c.niche ? ' · ' + esc(c.niche) : ''}</span></span>
            ${c.status === 'jeda' ? '<span class="pill st-ide">Jeda</span>' : `<span class="ring-wrap">${ringSvg(pct, c.color, 48, 6)}<span class="ring-num"><small class="b num" style="color:var(--label)">${Math.round(pct * 100)}%</small></span></span>`}</div>
          <div class="strip">${strip.map(p => postThumb(p, 'sthumb')).join('')}${Array.from({ length: Math.max(0, 5 - strip.length) }, () => '<span class="sthumb blank"></span>').join('')}</div>
          <div class="sc-foot"><span class="pill st-klien">${nW} menunggu</span><span class="pill st-revisi">${nR} revisi</span><span class="w-sub" style="margin-left:auto">${nx ? 'Berikutnya: ' + relDay(nx.date) + (nx.time ? ' ' + nx.time : '') : 'Antrean kosong'} · ${done}/${total || '—'}</span></div>
        </button>`;
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
        <div class="btn-row"><button class="btn-tinted" data-a="newPost" data-client="${c.id}">${ic('plus')} Konten</button>${SIMPLE() ? '' : `<button class="btn-tinted gray" data-a="gridPreview" data-id="${c.id}">${ic('grid')} Grid IG</button>`}${c.handle ? `<a class="btn-tinted gray" href="https://instagram.com/${encodeURIComponent(c.handle)}" target="_blank" rel="noopener">${ic('ig')} Profil</a>` : ''}</div>
        <div class="btn-row" style="justify-content:center"><button class="btn-tinted green" data-a="copyProgress" data-k="c" data-id="${c.id}">${ic('copy')} Salin link progress semua narasumber</button><button class="btn-tinted gray" data-a="openProgress" data-k="c" data-id="${c.id}">Buka</button></div></div>
      ${SIMPLE() ? '' : group('Paket ' + monthLabel(month), `<div class="list flat">${prog('Feed & Carousel', 'feed', num(k.feed))}${prog('Reels', 'reels', num(k.reels))}${prog('Story', 'story', num(k.story))}</div>`, { foot: k.price ? `Nilai kontrak ${rp(k.price)} per bulan.` : '' })}
      ${group('Konten berikutnya', upcoming.length ? `<div class="list">${upcoming.map(p => postRow(p)).join('')}</div>` : empty('tray', 'Tidak ada konten dalam antrean.'), { action: `<button data-a="clientPosts" data-id="${c.id}">Semua</button>` })}
      ${group('Brand kit', `<div class="list">
        ${colors.length ? `<div class="kv"><div class="k">Palet warna</div><div class="palette" style="margin-top:6px">${colors.map(x => `<div class="swatch"><span style="background:${esc(x)}"></span>${esc(x.toUpperCase())}</div>`).join('')}</div></div>` : ''}
        ${kv('Font', esc(b.fonts))}${kv('Tone of voice', esc(b.tone))}${kv('Pilar konten', esc(c.pillars))}
        ${b.hashtags ? `<div class="kv"><div class="k">Hashtag andalan</div><div class="tags" style="margin-top:4px">${hashtags(b.hashtags).map(h => `<span class="tag">${esc(h)}</span>`).join('')}</div></div>` : ''}
        ${kv('Lakukan', esc(b.dos))}${kv('Hindari', esc(b.donts))}
        ${!colors.length && !b.fonts && !b.tone && !b.hashtags && !b.dos && !b.donts ? `<div class="empty">Brand kit belum diisi.<button class="btn-tinted" data-a="editClient" data-id="${c.id}">Isi brand kit</button></div>` : ''}
        </div>`, { action: b.hashtags ? `<button data-a="copyText" data-text="${esc(hashtags(b.hashtags).join(' '))}">Salin hashtag</button>` : '' })}
      ${group('Kontak', `<div class="list">${kv('PIC', esc(c.pic))}${c.phone ? `<div class="row plain"><span class="grow"><div class="t-foot muted">WhatsApp</div><div class="ttl num" style="user-select:all">${esc(c.phone)}</div></span><button class="btn-tinted gray" data-a="copyText" data-text="${esc(c.phone)}">${ic('copy')}</button><a class="btn-tinted green" href="${waLink(c.phone, '')}" target="_blank" rel="noopener">${ic('wa')} Chat</a></div>` : ''}${kv('Folder aset', c.drive ? `<a href="${esc(c.drive)}" target="_blank" rel="noopener">${esc(c.drive)}</a>` : '')}${kv('Mulai kontrak', c.start ? prettyDate(c.start) : '')}${kv('Catatan', esc(c.notes))}${!c.pic && !c.phone && !c.drive && !c.notes ? '<div class="empty">Belum ada info kontak.</div>' : ''}</div>`)}
      ${SIMPLE() ? '' : group('Laporan terakhir', lastRep ? `<div class="list"><button class="row" data-a="openReports" data-id="${c.id}"><span class="tile" style="background:var(--teal)">${ic('chart')}</span><span class="grow"><div class="ttl">${monthLabel(lastRep.month)}</div><div class="sub">${short(lastRep.followers)} followers · ER ${fmt(erOf(lastRep), 2)}%</div></span>${ic('chevR', 'chev')}</button></div>` : empty('chart', 'Belum ada laporan.', `<button class="btn-tinted" data-a="newReport" data-client="${c.id}">Isi laporan</button>`))}
      ${SIMPLE() ? '' : group('Tagihan', invs.length ? `<div class="list">${invs.map(invoiceRow).join('')}</div>` : empty('wallet', 'Belum ada tagihan.', `<button class="btn-tinted" data-a="newInvoice" data-client="${c.id}">Buat tagihan</button>`))}`
  };
};

// ---------------- VIEW: TAMU & EPISODE ----------------
const guestAv = (g, sz) => g.photo ? `<span class="gav" style="width:${sz}px;height:${sz}px"><img src="${g.photo}" alt=""></span>` : `<span class="avatar" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * .36)}px;background:${(STG[g.stage] || STAGES[0]).color}">${esc(initials(g.name))}</span>`;
// Nomor urut narasumber: kolom "No. urut", atau nomor dari data impor (wb-guest-01 / "Nomor dokumen … 01")
function guestNo(g) { const n = num(g.order); if (n) return n; const m = /wb-guest-(\d+)/.exec(g.id || '') || /Nomor dokumen[^0-9]*(\d+)/i.exec(g.notes || ''); return m ? Number(m[1]) : 0; }
const guestSort = xs => sortBy(xs, g => String(guestNo(g) || 9999).padStart(4, '0') + String(g.name || '').toLowerCase());
const noLabel = g => guestNo(g) ? `<span class="gno">${pad(guestNo(g))}</span>` : '';
function guestPosts(g) { return postsAll().filter(p => p.guestId === g.id); }
function packState(g, k) { const ps = guestPosts(g).filter(p => p.cat === k); if (!ps.length) return 'none'; if (ps.some(p => p.status === 'posted')) return 'posted'; if (ps.some(p => DONE_ST.includes(p.status))) return 'done'; return 'wip'; }
function packDots(g) { return `<span class="pack">${guestCats(g).map(k => `<i class="pk-${packState(g, k)}" style="--pc:${CAT[k].color}" title="${esc(CAT[k].short)}"></i>`).join('')}</span>`; }
function guestNext(g) {
  const t = today();
  const ev = [[g.introDate, 'Intro call'], [g.recDate, 'Rekaman'], [g.pubDate, 'Tayang']].filter(x => x[0] && x[0] >= t).sort((a, b) => a[0] < b[0] ? -1 : 1)[0];
  return ev ? `${ev[1]} ${relDay(ev[0])}${ev[1] === 'Rekaman' && g.recTime ? ' ' + esc(g.recTime) : ''}` : (g.pubDate ? 'Tayang ' + prettyDate(g.pubDate) : '');
}
VIEWS.guests = () => {
  const all = guestSort(guestsAll());
  const xs = UI.gStage ? all.filter(g => g.stage === UI.gStage) : all;
  return {
    title: 'Tamu & Episode',
    html: `${largeTitle('Tamu & Episode', all.length + ' tamu podcast', plusBtn('newGuest'))}
      <div class="chips"><button class="chip ${!UI.gStage ? 'on' : ''}" data-a="gStage" data-k="">Semua <span class="n">${all.length}</span></button>${STAGES.map(x => `<button class="chip ${UI.gStage === x.k ? 'on' : ''}" data-a="gStage" data-k="${x.k}"><span class="cdot" style="background:${x.color}"></span>${x.label} <span class="n">${all.filter(g => g.stage === x.k).length}</span></button>`).join('')}</div>
      ${xs.length ? `<div class="stack-list">${xs.map(g => `<button class="w gcard" data-a="guest" data-id="${g.id}">
        <div class="sc-head">${guestAv(g, 52)}<span class="grow" style="min-width:0"><span class="w-title ell" style="display:block">${noLabel(g)}${esc(g.name)}</span><span class="w-sub ell" style="display:block">${esc([g.role, g.org].filter(Boolean).join(' · '))}</span>${g.handle ? `<span class="w-sub ell" style="display:block;color:var(--blue)">@${esc(g.handle)}</span>` : ''}</span><span class="pill" style="background:${(STG[g.stage] || STAGES[0]).color}22;color:${(STG[g.stage] || STAGES[0]).color}">${esc((STG[g.stage] || STAGES[0]).short)}</span></div>
        ${g.noIntro ? '<div class="t-cap muted">Webisode saja · tanpa Intro</div>' : ''}${g.epTitle ? `<div class="g-ep">${ic('mic')}<span class="ell">${g.epNo ? 'Ep ' + esc(g.epNo) + ' · ' : ''}${esc(g.epTitle)}</span></div>` : ''}
        <div class="sc-foot">${packDots(g)}<span class="w-sub" style="margin-left:auto">${guestNext(g)}</span></div></button>`).join('')}</div>`
        : empty('mic', 'Belum ada tamu. Tambahkan tamu dari jadwal intro call, lalu buat paket kontennya sekali ketuk.', `<button class="btn-tinted" data-a="newGuest">${ic('plus')} Tambah tamu</button>`)}
      <div class="group-foot">Titik di setiap kartu = paket konten tamu: Intro, Pengumuman, Episode Tayang, Ringkasan, Kutipan. Penuh = sudah tayang, setengah = disetujui/terjadwal, garis = sedang dikerjakan.</div>`
  };
};
VIEWS.guest = (v) => {
  const g = guestOf(v.id);
  if (!g) return { title: '', html: empty('mic', 'Tamu ini sudah dihapus.') };
  const kv = (k, val) => val ? `<div class="kv"><div class="k">${k}</div><div class="v">${val}</div></div>` : '';
  const quotes = String(g.quotes || '').split('\n').map(x => x.trim()).filter(Boolean);
  const takes = String(g.takeaways || '').split('\n').map(x => x.trim()).filter(Boolean);
  return {
    title: g.name,
    right: `<button class="nav-btn" data-a="editGuest" data-id="${g.id}" style="font-size:17px">Edit</button>`,
    html: `<div class="client-hero"><button class="photo-edit" data-a="guestPhoto" data-id="${g.id}" aria-label="Ubah foto narasumber">${guestAv(g, 84)}<span class="pe-badge">${ic('photo')}</span></button><button class="t-foot c-blue" data-a="guestPhoto" data-id="${g.id}">${g.photo ? 'Ubah foto' : 'Tambah foto'}</button><div class="t-title2">${esc(g.name)}</div><div class="handle">${esc([g.role, g.org].filter(Boolean).join(' · '))}</div>${g.handle ? `<a href="https://instagram.com/${encodeURIComponent(g.handle)}" target="_blank" rel="noopener" class="t-sub">@${esc(g.handle)}</a>` : ''}
        <div class="seg" style="margin-top:10px;width:100%;max-width:460px">${STAGES.map(x => `<button class="${g.stage === x.k ? 'on' : ''}" data-a="setStage" data-id="${g.id}" data-k="${x.k}">${esc(x.short)}</button>`).join('')}</div></div>
      <div class="list"><label class="field" for="quickIntro" style="cursor:pointer"><span style="flex:1;display:flex;flex-direction:column;gap:2px"><span>Butuh Intro carousel</span><span class="t-foot muted">${g.noIntro ? 'Mati: Webisode saja, paket 5 konten' : 'Nyala: paket lengkap 6 konten'}</span></span><input type="checkbox" id="quickIntro" data-id="${g.id}" ${g.noIntro ? '' : 'checked'}><span class="switch"></span></label></div>
      ${group('Link progress untuk klien', `<div class="list"><div class="row plain" style="flex-wrap:wrap;gap:8px"><span class="grow t-foot muted" style="flex-basis:100%">Klien bisa melihat progress desain ${esc(g.name)} dan langsung Approve / Request changes. Hasilnya otomatis masuk ke status konten di sini.</span><button class="btn-tinted" data-a="copyProgress" data-k="g" data-id="${g.id}">${ic('copy')} Salin pesan</button><button class="btn-tinted gray" data-a="copyProgress" data-k="gl" data-id="${g.id}">${ic('link')} Salin link</button><button class="btn-tinted gray" data-a="openProgress" data-k="g" data-id="${g.id}">Buka</button></div></div>`)}
      ${group('Paket konten', `<div class="list">${guestCats(g).map(k => { const ps = guestPosts(g).filter(p => p.cat === k); const c = CAT[k]; return ps.length ? ps.map(p => `<button class="row" data-a="post" data-id="${p.id}"><span class="tile" style="background:${c.color}">${ic(c.icon)}</span><span class="grow"><div class="ttl">${esc(c.short)}</div><div class="sub">${p.date ? relDay(p.date) + (p.time ? ' ' + p.time : '') : 'Tanpa jadwal'} · ${TYPES[p.type || 'feed'].label}</div></span>${isLate(p) ? '<span class="pill warn">Terlambat</span>' : pillSt(p.status)}</button>`).join('') : `<div class="row"><span class="tile" style="background:${c.color};opacity:.45">${ic(c.icon)}</span><span class="grow"><div class="ttl muted">${esc(c.short)}</div><div class="sub">Belum dibuat</div></span><button class="btn-tinted" data-a="makePack" data-id="${g.id}" data-k="${k}">${ic('plus')} Buat</button></div>`; }).join('')}</div>`, { action: ((({ intro: ['intro'], jadwal: ['intro', 'announce'] }[g.stage]) || GUEST_CATS).filter(k => guestCats(g).includes(k))).some(k => packState(g, k) === 'none') ? `<button data-a="makePack" data-id="${g.id}" data-k="all">Buat ${g.stage === 'intro' ? 'intro' : g.stage === 'jadwal' ? 'intro & pengumuman' : 'semua'}</button>` : '', foot: 'Draf berisi judul, caption, tag tamu, dan tanggal yang disarankan dari jadwal tamu. Konten episode (Tayang, Ringkasan, Kutipan) baru disarankan setelah rekaman.' })}
      ${group('Jadwal & episode', `<div class="list">${kv('Intro call', g.introDate ? prettyDate(g.introDate, true) : '')}${kv('Rekaman', g.recDate ? prettyDate(g.recDate, true) + (g.recTime ? ', ' + esc(g.recTime) + ' WIB' + (toClient(g.recDate, g.recTime) ? ` <span class="muted">(${fmt12(toClient(g.recDate, g.recTime).time)} ${esc(toClient(g.recDate, g.recTime).abbr)}, ${enDate(toClient(g.recDate, g.recTime).date)})</span>` : '') : '') : '')}${kv('Episode', g.epTitle ? (g.epNo ? 'Ep ' + esc(g.epNo) + ' · ' : '') + esc(g.epTitle) : '')}${kv('Tayang', g.pubDate ? prettyDate(g.pubDate, true) : '')}${kv('Link episode', g.epLink ? `<a href="${esc(g.epLink)}" target="_blank" rel="noopener">${esc(g.epLink)}</a>` : '')}${kv('Folder foto tamu', g.photoLink ? `<a href="${esc(g.photoLink)}" target="_blank" rel="noopener">${esc(g.photoLink)}</a>` : '')}${!g.introDate && !g.recDate && !g.epTitle ? '<div class="empty">Belum ada jadwal.</div>' : ''}</div>`)}
      ${group('Bahan & prompt AI', `<div class="list">
        ${g.topics ? `<div class="kv"><div class="k">Topik</div><div class="v">${esc(g.topics)}</div></div>` : ''}
        <div class="row plain"><span class="grow"><div class="t-foot muted">Transkrip intro call</div><div class="ttl" style="font-size:15px">${g.introTr ? fmt(g.introTr.split(/\s+/).length) + ' kata' : '<span class="muted">Belum ada</span>'}</div></span><button class="btn-tinted" data-a="aiGuest" data-id="${g.id}" data-k="intro">${ic('sparkle')} Prompt intro</button></div>
        <div class="row plain"><span class="grow"><div class="t-foot muted">Transkrip episode</div><div class="ttl" style="font-size:15px">${g.epTr ? fmt(g.epTr.split(/\s+/).length) + ' kata' : '<span class="muted">Belum ada</span>'}${g.yt ? ` · <a href="${esc(g.yt)}" target="_blank" rel="noopener">YouTube</a>` : ''}</div></span><button class="btn-tinted" data-a="aiGuest" data-id="${g.id}" data-k="summary">${ic('sparkle')} Prompt ringkasan</button></div>
        </div>`, { action: `<button data-a="editGuest" data-id="${g.id}">Isi bahan</button>`, foot: 'Salin prompt ke ChatGPT, Gemini, atau Grok, lalu tempel hasilnya ke Canva dan caption-nya ke editor konten.' })}
      ${g.intro ? group('Intro singkat', `<div class="list"><div class="kv"><div class="v">${esc(g.intro)}</div></div></div>`, { action: `<button data-a="copyText" data-text="${esc(g.intro)}">Salin</button>` }) : ''}
      ${group('Kutipan', quotes.length ? `<div class="list">${quotes.map((q, i) => `<div class="row"><span class="tile" style="background:var(--purple)">${ic('quote')}</span><span class="grow"><div class="ttl" style="white-space:normal">“${esc(q)}”</div></span><button class="btn-tinted gray" data-a="quotePost" data-id="${g.id}" data-i="${i}" aria-label="Jadikan quote graphic">${ic('plus')}</button></div>`).join('')}</div>` : empty('quote', 'Catat kutipan kuat dari wawancara di sini, lalu jadikan quote graphic.'), { action: `<button data-a="editGuest" data-id="${g.id}">Tambah</button>` })}
      ${group('Poin penting episode', takes.length ? `<div class="list flat">${takes.map((x, i) => `<div class="row plain"><span class="num b" style="width:20px;color:var(--orange)">${i + 1}</span><span class="grow" style="white-space:normal">${esc(x)}</span></div>`).join('')}</div>` : empty('list', 'Isi poin diskusi dan takeaway untuk carousel ringkasan.'))}
      ${g.notes ? group('Catatan', `<div class="list"><div class="kv"><div class="v">${esc(g.notes)}</div></div></div>`) : ''}`
  };
};
function guestCaption(g, k, quoteIdx) {
  const c = clientOf(g.clientId) || {};
  const tag = g.handle ? '@' + g.handle : g.name;
  const who = [g.role, g.org].filter(Boolean).join(' at ');
  const ht = hashtags((c.brand || {}).hashtags).join(' ') || '#sustainability #podcast';
  const takes = String(g.takeaways || '').split('\n').map(x => x.trim()).filter(Boolean);
  const quotes = String(g.quotes || '').split('\n').map(x => x.trim()).filter(Boolean);
  const ep = g.epTitle ? `"${g.epTitle}"` : 'our latest episode';
  if (k === 'intro') return `Meet our upcoming guest: ${g.name} 🌱\n\n${who ? who + '.\n' : ''}${g.intro || ''}\n\nStay tuned for a conversation on sustainability, innovation and positive impact.\n\n${tag}\n${ht}`;
  if (k === 'announce') return `📅 Recording day${g.recDate ? ': ' + enDate(g.recDate) : ''}!\n\nWe're sitting down with ${g.name}${who ? ', ' + who : ''}.\n\nWhat would you like us to ask? Drop your questions below 👇\n\n${tag}\n${ht}`;
  if (k === 'livestory') return `New episode out now 🎙️ ${g.name}${g.epTitle ? ' · ' + g.epTitle : ''}\n\n(Story: add link sticker to the episode${g.epLink ? ': ' + g.epLink : ''})\n\n${tag}`;
  if (k === 'live') return `🎙️ NEW EPISODE IS LIVE\n\n${ep} with ${g.name}${who ? ', ' + who : ''}.\n\nListen now, link in bio.\n\n${tag}\n${ht}`;
  if (k === 'summary') return `Key takeaways from our conversation with ${g.name} 👇\n\n${takes.length ? takes.map((x, i) => `${i + 1}. ${x}`).join('\n') : '1. \n2. \n3. '}\n\nWhich one resonates with you? Full episode, link in bio.\n\n${tag}\n${ht}`;
  if (k === 'quote') { const q = quotes[quoteIdx || 0] || ''; return `"${q}"\n\n— ${g.name}${who ? ', ' + who : ''}\n\nListen to the full conversation, link in bio.\n\n${tag}\n${ht}`; }
  return '';
}
function guestPreset(g, k, quoteIdx) {
  const t = today();
  const later = d => (d && d >= t) ? d : t;
  // Tanpa tanggal tayang, konten episode dibuat tanpa jadwal (diisi nanti saat episode sudah pasti)
  const from = { intro: later(g.introDate || t), announce: t, live: g.pubDate || '', livestory: g.pubDate || '', summary: g.pubDate ? addDays(g.pubDate, 1) : '', quote: g.pubDate ? addDays(g.pubDate, 1) : '' }[k];
  // Pakai slot posting klien berikutnya mulai tanggal yang disarankan (tanpa tanggal tayang = tanpa jadwal)
  const cl = clientOf(g.clientId) || activeClients()[0];
  const slot = from ? nextFreeSlot(cl, k, from) : null;
  const date = slot ? slot.date : from, time = slot ? slot.time : '19:00';
  const q = String(g.quotes || '').split('\n').map(x => x.trim()).filter(Boolean)[quoteIdx || 0];
  return { clientId: g.clientId || (activeClients()[0] || {}).id || '', cat: k, type: CAT[k].type, guestId: g.id, title: CAT[k].short + ' · ' + g.name + (k === 'quote' && q ? ': ' + q.slice(0, 40) + (q.length > 40 ? '…' : '') : ''), caption: guestCaption(g, k, quoteIdx), tags: g.handle ? '@' + g.handle : '', date, time, status: 'draft', check: {} };
}
function makePack(g, which) {
  // "Buat semua" menyesuaikan tahap tamu: konten episode baru dibuat setelah rekaman
  const allowed = ({ intro: ['intro'], jadwal: ['intro', 'announce'], rekam: GUEST_CATS, tayang: GUEST_CATS }[g.stage] || GUEST_CATS).filter(k => guestCats(g).includes(k));
  const ks = which === 'all' ? allowed.filter(k => packState(g, k) === 'none') : [which];
  if (!ks.length) { toast('Paket untuk tahap ini sudah lengkap', 'check'); return; }
  ks.forEach(k => { const id = uid(); dbSet('posts/' + id, Object.assign({ id, media: [], log: [{ t: Date.now(), text: 'Dibuat dari data tamu ' + g.name }], createdAt: Date.now(), stAt: Date.now() }, guestPreset(g, k))); });
  toast(ks.length + ' draf konten dibuat', 'check'); render();
}
function openGuest(id) {
  const isNew = !id || !S.guests[id];
  const g = isNew ? { id: uid(), clientId: UI.fClient || (activeClients()[0] || {}).id || '', name: '', role: '', org: '', handle: '', stage: 'intro', introDate: today(), at: Date.now() } : clone(S.guests[id]);
  let photo = g.photo || '';
  const w = openSheet({
    title: isNew ? 'Tamu baru' : 'Edit tamu', right: isNew ? 'Tambah' : 'Simpan', wide: true,
    body: `<div class="form"><div class="design-box"><div class="dthumb" id="gPhoto" style="border-radius:50%;width:84px;height:84px;aspect-ratio:auto">${photo ? `<img src="${photo}" alt="">` : ic('people')}</div><div class="dside"><button type="button" class="btn-tinted" id="gPhotoBtn">${ic('photo')} Pilih foto tamu</button><span class="t-foot muted">Foto kecil untuk penanda (±20 KB). File aslinya tetap di Canva/Drive.</span></div></div></div>
      ${fSec('Profil', fInput('gOrder', 'No. urut', guestNo(g) || '', { type: 'number', mode: 'numeric', ph: '01' }) + fInput('gName', 'Nama', g.name, { ph: 'Nama lengkap' }) + fInput('gRole', 'Jabatan', g.role, { ph: 'Founder, Head of…' }) + fInput('gOrg', 'Organisasi', g.org) + fInput('gHandle', 'Instagram', g.handle, { ph: 'tanpa @ (untuk tag)' }) + fInput('gPhotoLink', 'Folder foto', g.photoLink, { type: 'url', ph: 'Link Drive/Canva foto tamu' }) + (clients().length > 1 ? fSelect('gClient', 'Klien', g.clientId, clientOpts()) : ''))}
      ${fSec('Jenis narasumber', fSwitch('gNeedIntro', 'Butuh Intro carousel', !g.noIntro), 'Matikan untuk narasumber yang hanya ada di sheet Webisodes (Release Date, Live, Summary, Quote saja).')}
      ${fSec('Tahap', fSelect('gStage', 'Tahap', g.stage, STAGES.map(x => [x.k, x.label])) + fInput('gIntroDate', 'Intro call', g.introDate, { type: 'date' }) + fInput('gRecDate', 'Rekaman (WIB)', g.recDate, { type: 'date' }) + fInput('gRecTime', 'Jam rekaman (WIB)', g.recTime, { type: 'time' }) + `<div class="field tz-hint"><span class="t-foot muted" style="flex:1">Klien kirim jam rekaman dalam EST?</span><button type="button" class="btn-tinted gray" data-a="tzFill" data-d="gRecDate" data-t="gRecTime" style="font-size:13px;padding:6px 10px">${ic('clock')} Dari jam klien</button></div>`)}
      ${fSec('Episode', fInput('gEpNo', 'Nomor', g.epNo, { mode: 'numeric', ph: '12' }) + fInput('gEpTitle', 'Judul episode', g.epTitle, { stack: true }) + fInput('gPubDate', 'Tanggal tayang', g.pubDate, { type: 'date' }) + fInput('gEpLink', 'Link episode', g.epLink, { type: 'url', ph: 'Spotify / YouTube / web' }))}
      ${fSec('Bahan dari klien', fArea('gTopics', 'Topik podcast yang dibahas', g.topics, { rows: 3 }) + fArea('gIntroTr', 'Transkrip intro call', g.introTr, { rows: 4, ph: 'Tempel transkrip dari klien' }) + fInput('gYt', 'Episode YouTube', g.yt, { type: 'url', ph: 'Link episode untuk ambil transkrip' }) + fArea('gEpTr', 'Transkrip episode', g.epTr, { rows: 4, ph: 'Tempel transkrip YouTube' }), 'Dipakai untuk membuat prompt AI: intro carousel 5 slide, ringkasan episode, dan kutipan.')}
      ${fSec('Isi konten', fArea('gIntro', 'Intro singkat (untuk carousel intro)', g.intro, { rows: 3 }) + fArea('gQuotes', 'Kutipan (satu per baris)', g.quotes, { rows: 4 }) + fArea('gTakeaways', 'Poin penting / takeaway (satu per baris)', g.takeaways, { rows: 4 }) + fArea('gNotes', 'Catatan', g.notes, { rows: 2 }))}
      ${!isNew ? `<div class="list"><button class="row danger" data-a="delGuest" data-id="${g.id}">Hapus tamu</button></div>` : ''}`,
    onRight: wr => {
      const name = val(wr, 'gName');
      if (!name) { toast('Nama tamu wajib diisi', 'alert'); return false; }
      const out = Object.assign(g, { order: num(val(wr, 'gOrder')) || '', name, role: val(wr, 'gRole'), org: val(wr, 'gOrg'), handle: val(wr, 'gHandle').replace(/^@/, ''), photoLink: val(wr, 'gPhotoLink'), photo,
        clientId: clients().length > 1 ? val(wr, 'gClient') : g.clientId, stage: val(wr, 'gStage'), noIntro: !val(wr, 'gNeedIntro'), introDate: val(wr, 'gIntroDate'), recDate: val(wr, 'gRecDate'), recTime: val(wr, 'gRecTime'),
        epNo: val(wr, 'gEpNo'), epTitle: val(wr, 'gEpTitle'), pubDate: val(wr, 'gPubDate'), epLink: val(wr, 'gEpLink'), topics: val(wr, 'gTopics'), introTr: val(wr, 'gIntroTr'), yt: val(wr, 'gYt'), epTr: val(wr, 'gEpTr'), intro: val(wr, 'gIntro'), quotes: val(wr, 'gQuotes'), takeaways: val(wr, 'gTakeaways'), notes: val(wr, 'gNotes') });
      dbSet('guests/' + g.id, out);
      toast(isNew ? 'Tamu ditambahkan' : 'Tamu disimpan', 'check');
      if (isNew) push({ v: 'guest', id: g.id, backLabel: 'Tamu', tab: 'guests' }); else render();
    }
  });
  w.querySelector('#gPhotoBtn').addEventListener('click', () => {
    pickImage().then(f => f && openCropper(f, { round: true, outW: 320, title: 'Crop foto narasumber' })).then(url => { if (!url) return; photo = url; w.querySelector('#gPhoto').innerHTML = `<img src="${photo}" alt="">`; });
  });
}

// ---------------- VIEW: LAINNYA ----------------
VIEWS.more = () => ({
  title: 'Lainnya',
  html: `${largeTitle('Lainnya')}
    <div class="list">${morePages().map(m => { const b = badgeFor(m.k); return `<button class="row" data-a="tab" data-k="${m.k}"><span class="tile" style="background:${m.tile}">${ic(m.icon)}</span><span class="grow"><div class="ttl">${m.label}</div><div class="sub">${m.sub}</div></span>${b ? `<span class="badge">${b}</span>` : ''}${ic('chevR', 'chev')}</button>`; }).join('')}</div>
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
    title: 'Ide & Berita',
    html: `${largeTitle('Ide & Berita', Object.values(S.ideas).filter(x => !x.done).length + ' ide aktif', plusBtn('newIdea'))}
      ${clientChips()}
      <div class="form"><div class="field">${ic('bulb', 'faint')}<input id="quickIdea" placeholder="Tulis ide cepat lalu Enter…" style="text-align:left" autocomplete="off"></div></div>
      ${(() => { const src = activeClients().flatMap(c => sourceList(c)); const c0 = activeClients()[0]; return group('Sumber riset berita', src.length ? `<div class="list">${src.map(x => x.link ? `<a class="row" href="${esc(x.link)}" target="_blank" rel="noopener"><span class="tile" style="background:var(--green)">${ic('leaf')}</span><span class="grow"><div class="ttl">${esc(x.name)}</div><div class="sub">${esc(x.link.replace(/^https?:\/\//, '').slice(0, 50))}</div></span>${ic('chevR', 'chev')}</a>` : `<div class="row"><span class="tile" style="background:var(--green)">${ic('leaf')}</span><span class="grow ttl">${esc(x.name)}</span></div>`).join('')}</div>` : empty('leaf', 'Simpan akun Instagram, newsletter, atau situs berita sustainability yang kamu pantau.'), { action: c0 ? `<button data-a="editClient" data-id="${c0.id}">Edit</button>` : '', foot: 'Beri label "berita" pada ide supaya otomatis jadi konten Sustainability News. Tulis ulang dengan kata-kata sendiri dan cantumkan sumbernya.' }); })()}
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
      ${group('Logo aplikasi', `<div class="list"><div class="logo-pick">${(window.NS_LOGOS || []).map(L => `<button class="${curLogo() === L.k ? 'on' : ''}" data-a="setLogo" data-k="${L.k}" aria-label="Logo ${esc(L.n)}">${window.nsLogoSVG(L.k, 56)}<span>${esc(L.n)}</span></button>`).join('')}</div></div>`, { foot: 'Logo tampil di sidebar dan tab browser. Untuk ikon Layar Utama: pilih logo, lalu hapus ikon lama dan Tambah ke Layar Utama lagi dari Safari.' })}
      <div><div class="form-head">Profil</div><div class="form"><div class="field"><label for="setName">Nama panggilan</label><input id="setName" value="${esc((S.settings && S.settings.name) || '')}" placeholder="Hadzmi"></div></div><div class="form-foot">Dipakai di sapaan Beranda.</div></div>
      ${group('Penyimpanan', `<div class="list">
        <button class="row" data-a="explainSync"><span class="tile" style="background:var(--orange)">${ic('cloud')}</span><span class="grow"><div class="ttl">Firebase · teks</div><div class="sub">${{ on: 'Tersinkron realtime', off: 'Offline, sinkron otomatis saat online', err: 'Ditolak Rules, tambahkan hadzmi_social_data', local: 'Firebase tidak termuat', demo: 'Mode pratinjau, tidak tersambung' }[syncMode]}${nPend ? ` · ${nPend} menunggu` : ''}</div></span>${ic('chevR', 'chev')}</button>
        <div class="row"><span class="tile" style="background:#F38020">${ic('photo')}</span><span class="grow"><div class="ttl">Cloudflare R2 · media</div><div class="sub">${DEMO ? 'Mode pratinjau, file hanya di memori' : `${Object.keys(S.media).length} file · ${bytesText(Object.values(S.media).reduce((a, m) => a + num(m.size), 0))} · batas 200 MB per file`}</div></span></div>
      </div>`)}
      <div><div class="form">${fSwitch('setSimple', 'Mode sederhana', SIMPLE())}</div><div class="form-foot">Menyembunyikan menu yang jarang dipakai (Media Library, Template, Laporan, Keuangan, Grid IG) dan widget tambahan di Hari ini. Matikan untuk melihat semua fitur.</div></div>
      ${DEMO ? '' : `<div><div class="form">${fSwitch('setAutoClean', 'Hapus media R2 otomatis', !S.settings || S.settings.autoClean !== false)}</div><div class="form-foot">Media yang semua kontennya sudah Terposting lebih dari 30 hari dihapus dari R2. Gambar penanda di Firebase tetap ada.</div></div>`}
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
    <div class="sheet-head"><button class="sh-l" data-sh="left">${esc(o.left || 'Batal')}</button><div class="sh-title">${esc(o.title || '')}</div><span class="sh-rw">${o.headExtra || ''}${o.right ? `<button class="sh-r" data-sh="right">${esc(o.right)}</button>` : ''}</span></div>
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
  draft.media = draft.media || []; draft.log = draft.log || []; draft.check = draft.check || {};
  if (isNew && draft.cat && !(preset && preset.date)) { const sl = nextFreeSlot(clientOf(draft.clientId), draft.cat, today()); if (sl) { draft.date = sl.date; draft.time = sl.time; } }
  const pillars = [...new Set(clients().flatMap(c => String(c.pillars || '').split(',').map(s => s.trim()).filter(Boolean)))];
  const body = `
    ${fSec('', (clients().length > 1 ? fSelect('pClient', 'Klien', draft.clientId, clientOpts('Pilih klien'), { f: 'clientId' }) : '') +
      fSelect('pCat', 'Kategori', draft.cat || '', [['', 'Umum']].concat(CATS.map(k => [k.k, k.label])), { f: 'cat' }) +
      `<div class="field" id="pCatHint" style="min-height:0;padding:0 16px 10px" ${CAT[draft.cat] ? '' : 'hidden'}><span class="t-foot muted">${CAT[draft.cat] ? esc(CAT[draft.cat].hint) : ''}</span></div>` +
      `<div class="field" id="pRot" style="min-height:0;padding:0 16px 10px" ${rotFor(clientOf(draft.clientId), draft.cat, draft.date) ? '' : 'hidden'}>${rotHTML()}</div>` +
      fSelect('pGuest', 'Tamu', draft.guestId || '', [['', 'Tanpa tamu']].concat(guestSort(guestsAll()).map(g => [g.id, (guestNo(g) ? pad(guestNo(g)) + ' · ' : '') + g.name])), { f: 'guestId' }) +
      fInput('pDate', 'Tanggal (WIB)', draft.date, { f: 'date', type: 'date' }) + fInput('pTime', 'Jam tayang (WIB)', draft.time, { f: 'time', type: 'time' }) +
      `<div class="field tz-hint" id="pTz">${tzHint()}</div>`)}
    <div><div class="form-head">Status</div><div class="form"><div class="status-pick" id="pStatus">${statusPick()}</div></div></div>
    <div><div class="form-head">Desain</div><div class="form">
      ${fInput('pDesign', 'Link Canva', draft.design, { f: 'design', type: 'url', ph: 'Tempel link desain Canva', stack: true })}
      <div class="design-box"><div class="dthumb" id="pThumb">${thumbBox()}</div><div class="dside">
        <span class="t-foot muted" id="pPrevMsg">${draft.thumb ? 'Preview dari link Canva.' : 'Preview muncul otomatis setelah link Canva ditempel.'}</span>
        <button type="button" class="btn-tinted gray" data-a="canvaPreview">${ic('refresh')} Ambil ulang preview</button></div></div>
      <div class="field" id="pDesignOpen" ${/^https?:\/\//.test(draft.design || '') ? '' : 'hidden'}><a href="${esc(draft.design || '')}" target="_blank" rel="noopener" class="t-sub">${ic('link')} Buka desain</a></div>
      </div><div class="form-foot">Link Canva harus bisa dilihat siapa saja (Share → Anyone with the link · Can view) supaya preview bisa diambil.</div></div>
    <div><div class="form-head" style="display:flex;justify-content:space-between"><span>Caption</span><span style="display:flex;gap:14px;text-transform:none;letter-spacing:0"><button type="button" class="c-blue" data-a="fillFromGuest">Isi dari tamu</button><button type="button" class="c-blue" data-a="insertTpl" data-k="hashtag">Hashtag</button></span></div>
      <div class="form">${fArea('pCaption', 'Caption & hashtag', draft.caption, { f: 'caption', rows: 7, count: true, ph: 'Tulis caption…' })}</div></div>
    <div class="list">
      <button class="row action" data-a="sendPost">${ic('send')}<span class="grow">Minta review klien</span></button>
      <button class="row action" data-a="aiPost">${ic('sparkle')}<span class="grow">Prompt AI untuk caption</span></button>
    </div>
    <details class="opt more-det"><summary>${ic('chevD')} Detail lainnya</summary>
      ${fSec('', `<div class="field" style="padding:8px 16px"><div class="seg" id="pType" style="flex:1">${Object.keys(TYPES).map(k => `<button type="button" data-a="pType" data-k="${k}" class="${draft.type === k ? 'on' : ''}">${TYPES[k].label}</button>`).join('')}</div></div>` +
        fInput('pTitle', 'Judul', draft.title, { f: 'title', ph: 'Otomatis dari kategori & tamu', stack: true }) +
        fInput('pTags', 'Tag akun', draft.tags, { f: 'tags', ph: '@tamu @kolaborator', stack: true }) +
        fInput('pSource', 'Sumber berita', draft.source, { f: 'source', type: 'url', ph: 'Link artikel / riset', stack: true }) +
        fInput('pLink', 'Link post IG', draft.link, { f: 'link', ph: 'https://instagram.com/p/…', type: 'url', stack: true }))}
      <div><div class="form-head">Checklist publish</div><div class="form">${CHECKS.map(c => `<label class="field" style="cursor:pointer"><span style="flex:1">${c[1]}</span><input type="checkbox" data-chk="${c[0]}" ${(draft.check || {})[c[0]] ? 'checked' : ''}><span class="switch"></span></label>`).join('')}</div></div>
      ${fSec('Catatan', fArea('pNotes', 'Brief, ide visual, audio, dll.', draft.notes, { f: 'notes', rows: 3 }))}
      <div><div class="form-head">Revisi & komentar klien</div><div class="form"><div class="log" id="pLog">${logHTML()}</div><div class="log-add"><input id="pLogInput" placeholder="Catat masukan klien…" autocomplete="off"><button type="button" data-a="addLog">Tambah</button></div></div></div>
      <div class="list">
        <button class="row action" data-a="igPreview">${ic('ig')}<span class="grow">Pratinjau tampilan Instagram</span></button>
        <button class="row action" data-a="insertTpl" data-k="caption">${ic('doc')}<span class="grow">Sisipkan template caption</span></button>
        ${!isNew ? `<button class="row action" data-a="dupPost">${ic('copy')}<span class="grow">Duplikat konten</span></button>` : ''}
      </div>
      ${!isNew ? `<div class="list"><button class="row danger" data-a="delPost">Hapus konten</button></div>` : ''}
    </details>`;
  openSheet({
    title: isNew ? 'Konten baru' : 'Edit konten', right: isNew ? 'Tambah' : 'Simpan', wide: true, body,
    headExtra: isNew ? '' : `<button class="sh-del" data-a="delPost" aria-label="Hapus konten">${ic('trash')}</button>`,
    onOpen: w => updateCaptionCount(w),
    onRight: () => savePost(),
    onClose: () => { draft = null; }
  });
}
function rotHTML() { const r = draft && rotFor(clientOf(draft.clientId), draft.cat, draft.date); return r ? `<span class="t-foot">${ic('doc')} Template minggu ini: <b>${esc(r.name)}</b> (${r.i}/${r.n})${r.link ? ` · <a href="${esc(r.link)}" target="_blank" rel="noopener">Buka di Canva</a>` : ''}</span>` : ''; }
function tzHint() {
  const ct = draft && toClient(draft.date, draft.time), c = draft && clientOf(draft.clientId);
  const onSlot = draft && CAT[draft.cat] && c && slotOccurrences(c, draft.cat, draft.date || today(), draft.date || today()).some(o => o.time === draft.time);
  return `<span class="t-foot muted" style="flex:1">${ct ? `Jam klien: <b style="color:var(--label)">${fmt12(ct.time)} ${esc(ct.abbr)}</b>, ${enDate(ct.date)}` : 'Isi tanggal & jam untuk melihat jam klien'}${draft && CAT[draft.cat] ? (onSlot ? ' · <span class="c-green b">sesuai jadwal klien</span>' : ' · <span class="c-orange b">di luar jadwal klien</span>') : ''}</span>${draft && CAT[draft.cat] ? `<button type="button" class="btn-tinted" data-a="slotFill" style="font-size:13px;padding:6px 10px">${ic('cal')} Slot berikutnya</button>` : ''}<button type="button" class="btn-tinted gray" data-a="tzFill" data-d="pDate" data-t="pTime" style="font-size:13px;padding:6px 10px">${ic('clock')} Dari jam klien</button>`;
}
function fillSlot(manual) {
  const w = draftSheet(); if (!draft || !CAT[draft.cat]) return;
  const sl = nextFreeSlot(clientOf(draft.clientId), draft.cat, manual && draft.date > today() ? draft.date : today(), draft.id);
  if (!sl) { if (manual) toast('Tidak ada slot kosong 5 minggu ke depan', 'alert'); return; }
  draft.date = sl.date; draft.time = sl.time;
  const d = w && w.querySelector('#pDate'), t = w && w.querySelector('#pTime'); if (d) d.value = sl.date; if (t) t.value = sl.time;
  if (manual) { refreshDraftParts(); toast(`Slot ${prettyDate(sl.date, true, true)} ${sl.time} WIB`, 'cal'); }
}
// Preview desain otomatis dari link Canva (diambil server lewat /api/social/canva-preview)
let previewSeq = 0;
function fetchCanvaPreview(manual) {
  if (!draft) return;
  const link = String(draft.design || '').trim(), w = draftSheet(), msg = w && w.querySelector('#pPrevMsg');
  const say = t => { if (msg) msg.textContent = t; };
  if (!/^https?:\/\/([\w-]+\.)*canva\.(com|link)\//i.test(link)) { if (manual) toast('Tempel link Canva dulu', 'alert'); say(link ? 'Preview otomatis hanya untuk link Canva.' : 'Preview muncul otomatis setelah link Canva ditempel.'); return; }
  if (DEMO) { say('Di mode pratinjau, preview Canva tidak diambil.'); return; }
  const my = ++previewSeq, id = draft.id; say('Mengambil preview…');
  fetch('/api/social/canva-preview?url=' + encodeURIComponent(link)).then(r => r.ok ? r.blob() : r.json().then(d => { throw new Error(d.error || 'HTTP ' + r.status); }))
    .then(b => makeThumb(new File([b], 'canva.jpg', { type: b.type || 'image/jpeg' }), 640, .75))
    .then(r => { if (my !== previewSeq || !draft || draft.id !== id) return; if (!r.thumb) throw new Error('Gambar tidak bisa dibaca'); draft.thumb = r.thumb; refreshDraftParts(); say('Preview dari link Canva.'); })
    .catch(e => { if (my === previewSeq) say('Preview belum bisa diambil: ' + (e.message || e)); });
}
function thumbBox() { return draft.thumb ? `<img src="${draft.thumb}" alt="Gambar penanda">` : ic(TYPES[draft.type || 'feed'].icon); }
function setDraftThumb(file) {
  if (!draft || !file) return;
  const put = url => { if (!draft) return; draft.thumb = url; refreshDraftParts(); toast('Gambar disimpan · ' + Math.round(url.length * .75 / 1024) + ' KB', 'check'); };
  if (/^image\//.test(file.type)) {
    const start = draft.type === 'story' || draft.type === 'reels' ? '9:16' : draft.type === 'carousel' || draft.type === 'feed' ? '4:5' : '4:5';
    openCropper(file, { ratios: ['4:5', '1:1', '9:16', '1.91:1'], ratio: start, outW: 480, title: 'Crop desain' }).then(url => { if (url) put(url); });
    return;
  }
  makeThumb(file, 480, .62).then(r => { if (!r.thumb) { toast('Format tidak didukung, coba screenshot', 'alert'); return; } put(r.thumb); });
}
// Pilih foto lewat input permanen di halaman (andal di iPhone)
function pickImage() {
  return new Promise(res => {
    const fi = $('photoInput'); fi.value = '';
    fi.onchange = () => { const f = fi.files && fi.files[0]; fi.onchange = null; res(f || null); };
    fi.click();
  });
}
// Layar crop: geser untuk posisi, cubit/slider untuk zoom, pilih rasio. Hasil: data URL JPEG kecil.
function openCropper(file, o) {
  o = Object.assign({ ratios: ['1:1'], ratio: '1:1', round: false, outW: 320, title: 'Crop foto' }, o || {});
  const rv = r => { const [a, b] = r.split(':').map(Number); return a / b; };
  return new Promise(resolve => {
    const url = URL.createObjectURL(file), img = new Image();
    let done = false;
    const finish = v => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(v); };
    img.onerror = () => { toast('Foto tidak bisa dibuka. Coba format JPG/PNG.', 'alert'); finish(null); };
    img.onload = () => {
      let ratio = o.ratio, zoom = 1, x = 0, y = 0, k = 1, bw = 0, bh = 0;
      const w = openSheet({
        title: o.title, right: 'Pakai',
        body: `<div class="crop-wrap"><div class="crop-box ${o.round ? 'round' : ''}" id="cropBox"><img id="cropImg" src="${url}" alt="" draggable="false"></div></div>
          ${o.ratios.length > 1 ? `<div class="seg" id="cropRatio">${o.ratios.map(r => `<button type="button" data-r="${r}" class="${r === ratio ? 'on' : ''}">${r === '1.91:1' ? 'Lebar' : r}</button>`).join('')}</div>` : ''}
          <div class="form"><div class="field crop-zoom">${ic('photo', 'faint')}<input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span style="font-size:20px" class="faint">${ic('photo')}</span></div></div>
          <div class="form-foot" style="text-align:center">Geser foto untuk mengatur posisi. Cubit atau pakai slider untuk zoom.</div>`,
        onRight: () => {
          const outW = o.outW, outH = Math.round(outW / rv(ratio)), cv = document.createElement('canvas');
          cv.width = outW; cv.height = outH;
          const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
          ctx.drawImage(img, -x / k, -y / k, bw / k, bh / k, 0, 0, outW, outH);
          finish(cv.toDataURL('image/jpeg', .78));
        },
        onClose: () => finish(null)
      });
      const box = w.querySelector('#cropBox'), im = w.querySelector('#cropImg'), zr = w.querySelector('#cropZoom');
      const clamp = () => { const iw = img.naturalWidth * k, ih = img.naturalHeight * k; x = Math.min(0, Math.max(bw - iw, x)); y = Math.min(0, Math.max(bh - ih, y)); };
      const paint = () => { clamp(); im.style.width = img.naturalWidth * k + 'px'; im.style.height = img.naturalHeight * k + 'px'; im.style.transform = `translate(${x}px,${y}px)`; };
      const layout = keepCenter => {
        // Lebar kotak menyesuaikan supaya rasio selalu tepat dan tingginya muat di layar
        // Ukuran kotak dalam piksel (Safari iOS tidak menghitung tinggi dari aspect-ratio untuk kotak berisi gambar absolut)
        const pw = (box.parentNode && box.parentNode.clientWidth) || (w.querySelector('.sheet-body') || {}).clientWidth || window.innerWidth;
        const avail = Math.max(160, pw - 28), maxH = Math.max(220, (window.innerHeight || 700) * .55);
        const cwid = Math.round(Math.min(avail, 360, maxH * rv(ratio)));
        box.style.width = cwid + 'px'; box.style.height = Math.round(cwid / rv(ratio)) + 'px';
        const cx = bw ? (bw / 2 - x) / k : img.naturalWidth / 2, cy = bh ? (bh / 2 - y) / k : img.naturalHeight / 2;
        bw = box.clientWidth; bh = box.clientHeight;
        const base = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
        k = base * zoom;
        x = bw / 2 - cx * k; y = bh / 2 - cy * k; if (!keepCenter) { x = (bw - img.naturalWidth * k) / 2; y = (bh - img.naturalHeight * k) / 2; }
        paint();
      };
      const setZoom = (z, px, py) => {
        z = Math.min(4, Math.max(1, z));
        const base = Math.max(bw / img.naturalWidth, bh / img.naturalHeight), nk = base * z;
        px = px == null ? bw / 2 : px; py = py == null ? bh / 2 : py;
        x = px - (px - x) * nk / k; y = py - (py - y) * nk / k; k = nk; zoom = z; zr.value = z; paint();
      };
      requestAnimationFrame(() => requestAnimationFrame(() => layout(false)));
      setTimeout(() => layout(true), 450);   // ulang setelah animasi sheet selesai
      const onRs = () => { if (document.body.contains(box)) layout(true); else window.removeEventListener('resize', onRs); };
      window.addEventListener('resize', onRs);
      zr.addEventListener('input', () => setZoom(Number(zr.value)));
      const pts = new Map(); let last = null, pinch = null;
      box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; } });
      box.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], r = box.getBoundingClientRect(); setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return; }
        if (last) { x += e.clientX - last.x; y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; paint(); }
      });
      const up = e => { pts.delete(e.pointerId); pinch = null; last = pts.size ? [...pts.values()][0] : null; };
      box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
      box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      const rs = w.querySelector('#cropRatio');
      if (rs) rs.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; ratio = b.dataset.r; rs.querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); requestAnimationFrame(() => layout(true)); });
    };
    img.src = url;
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
  const g = guestOf(p.guestId), cat = catOf(p);
  const what = (cat ? cat.label : 'post') + (g ? ' for ' + g.name : (p.title ? ': ' + p.title : ''));
  const ct = toClient(p.date, p.time);
  const when = p.date ? (ct ? `${enDate(ct.date)}, ${fmt12(ct.time)} ${ct.abbr} (${p.time} WIB)` : enDate(p.date)) : '';
  const out = [`Hi! The ${what} is ready in our Canva folder, please take a look 🎨`];
  if (p.design) out.push('', 'Canva: ' + p.design);
  if (urls && urls.length) { out.push('', 'Files:'); urls.forEach((u, i) => out.push(`${i + 1}. ${u}`)); }
  if (when) out.push('', 'Planned to go live: ' + when);
  if (p.caption) out.push('', 'Caption:', p.caption);
  out.push('', "Let me know if anything needs to change, otherwise I'll schedule it 🙌");
  return out.join('\n');
}
function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}
async function sharePost(p) {
  const c = clientOf(p.clientId) || {};
  const wrap = shareSheet('Minta review klien', postShareText(p, null), c.phone, 'Klien mengecek desainnya langsung di folder Canva. Salin pesan ini ke chat Upwork. Status otomatis menjadi Menunggu Klien setelah kamu menyalin.', () => {
    if (S.posts[p.id] && ['draft', 'edit', 'review', 'revisi', 'ide'].includes(S.posts[p.id].status)) {
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
  const w = draftSheet() || topSheet(); if (!w || !draft) return;
  const s = w.querySelector('#pStatus'); if (s) s.innerHTML = statusPick();
  const m = w.querySelector('#pMedia'); if (m) m.innerHTML = mediaStrip();
  const l = w.querySelector('#pLog'); if (l) l.innerHTML = logHTML();
  const t = w.querySelector('#pType'); if (t) t.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === draft.type));
  const th = w.querySelector('#pThumb'); if (th) th.innerHTML = thumbBox();
  const tzh = w.querySelector('#pTz'); if (tzh) tzh.innerHTML = tzHint();
  const rt = w.querySelector('#pRot'); if (rt) { rt.innerHTML = rotHTML(); rt.hidden = !rotHTML(); }
  const cl = w.querySelector('#pThumbClear'); if (cl) cl.hidden = !draft.thumb;
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
      <div class="igp-media ${tall ? 'tall' : ''}" id="igpMedia">${ms.length ? ms.map(m => `<div class="slide" style="${phStyle(m, c.color)}" data-mid="${m.id}">${mediaInner(m)}</div>`).join('') : `<div class="slide" style="${p.thumb ? 'background:#000' : p.ph ? `background:linear-gradient(135deg,${p.ph[0]},${p.ph[1]})` : `background:linear-gradient(135deg,${c.color},#C7C7CC)`}">${p.thumb ? `<img src="${p.thumb}" alt="">` : ic(TYPES[p.type || 'feed'].icon)}</div>`}
      ${ms.length > 1 ? `<span class="igp-count" id="igpCount">1/${ms.length}</span>` : ''}</div>
      <div class="igp-actions">${ic('heart')}${ic('comment')}${ic('send')}<span class="sp"></span>${ic('bookmark')}</div>
      <div class="igp-cap"><b>${esc(c.handle || c.name)}</b> ${cap || '<span class="muted">Belum ada caption</span>'}</div>
      <div class="igp-time">${p.date ? prettyDate(p.date, true) + (p.time ? ' · ' + p.time : '') : 'Belum dijadwalkan'}</div></div>
      ${p.design ? `<div style="text-align:center"><a class="btn-tinted" href="${esc(p.design)}" target="_blank" rel="noopener">${ic('link')} Buka desain asli</a></div>` : ''}
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
      ${ps.length ? `<div class="ig-grid">${ps.map(p => { const v = postVis(p); const future = p.status !== 'posted'; return `<button class="cell ${future ? 'future' : ''}" data-a="post" data-id="${p.id}" style="${v.style || `background:linear-gradient(135deg,${c.color},#C7C7CC)`}">${v.inner}${future ? `<span class="when">${p.date ? (p.date === t ? 'Hari ini' : prettyDate(p.date)) : '—'}</span>` : ''}</button>`; }).join('')}</div>` : empty('grid', 'Belum ada konten feed.')}`
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
  for (let f of list) {
    f = await compressImage(f);
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
// Foto dikecilkan ke sisi terpanjang 1080 px (JPEG 85%) sebelum diunggah ke R2. Video & GIF tidak diubah.
function compressImage(file) {
  if (!/^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.type)) return Promise.resolve(file);
  return new Promise(res => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, 1080 / Math.max(w, h));
      if (s === 1 && file.size < 700 * 1024) { res(file); return; }
      const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      cv.toBlob(b => res(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', .85);
    };
    im.onerror = () => { URL.revokeObjectURL(url); res(file); };
    im.src = url;
  });
}
function makeThumb(file, max, q) {
  max = max || 360; q = q || .7;
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const done = o => { clearTimeout(tm); URL.revokeObjectURL(url); res(o || {}); };
    const tm = setTimeout(() => done({}), 10000);
    const draw = (el, w, h, extra) => {
      try {
        const s = Math.min(1, max / Math.max(w, h)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
        cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
        done(Object.assign({ thumb: cv.toDataURL('image/jpeg', q), w, h }, extra || {}));
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
async function deleteMedia(id, quiet) {
  const m = S.media[id]; if (!m) return;
  postsAll().forEach(p => { if ((p.media || []).includes(id)) dbSet('posts/' + p.id, Object.assign(clone(p), { media: p.media.filter(x => x !== id) })); });
  dbSet('media/' + id, null);
  if (m.fileId && !DEMO) { try { await fetch('/api/social/files/' + encodeURIComponent(m.fileId), { method: 'DELETE' }); } catch (e) {} }
  if (!quiet) { toast('Media dihapus', 'trash'); render(); }
}
// Hapus otomatis media R2 yang semua kontennya sudah Terposting lebih dari 30 hari
let cleaned = false;
function autoClean() {
  if (DEMO || (S.settings && S.settings.autoClean === false)) return;
  const limit = Date.now() - 30 * 86400000;
  const postedAt = p => p.postedAt || (p.date ? Date.parse(p.date + 'T00:00:00+07:00') : Date.now());
  let n = 0;
  Object.values(S.media).forEach(m => {
    if (!m.fileId) return;
    const refs = postsAll().filter(p => (p.media || []).includes(m.id));
    if (refs.length && refs.every(p => p.status === 'posted' && postedAt(p) < limit)) { deleteMedia(m.id, true); n++; }
  });
  if (n) { toast(n + ' media lama dihapus dari R2', 'trash'); render(); }
}

// ---------------- KONVERTER JAM KLIEN ⇄ WIB ----------------
function openConverter(target) {
  const tz = clientTz(), w0 = target ? topSheet() : null;
  const st = { dir: 'in', date: today(), time: '09:00' };
  const w = openSheet({
    title: 'Konversi jam', left: target ? 'Batal' : 'Tutup', right: target ? 'Pakai' : '',
    body: `<div class="seg" id="tzDir"><button class="on" data-dir="in">${esc(tzAbbr(tz))} → WIB</button><button data-dir="out">WIB → ${esc(tzAbbr(tz))}</button></div>
      <div class="form"><div class="field"><label for="tzD" id="tzDl">Tanggal</label><input id="tzD" type="date" value="${st.date}"></div><div class="field"><label for="tzT" id="tzTl">Jam</label><input id="tzT" type="time" value="${st.time}"></div></div>
      <div class="tz-result" id="tzRes"></div>
      <div><div class="form-head">Tempel pesan klien</div><div class="form"><div class="field stack"><label for="tzPaste">Semua jam di pesan otomatis dikonversi (memakai tanggal di atas)</label><textarea id="tzPaste" rows="3" placeholder="Mis. Recording is Thursday at 3:30 PM EST, intro call 10am"></textarea></div><div id="tzList"></div></div></div>
      <div class="form-foot">Zona klien: ${esc((TZ_OPTS.find(x => x[0] === tz) || [tz, tz])[1])}. Pergantian EST/EDT (daylight saving) dihitung otomatis. Ubah di Edit klien.</div>`,
    onRight: () => {
      if (!target || !w0) return;
      const r = st.dir === 'in' ? convertTz(tz, LOCAL_TZ, st.date, st.time) : { date: st.date, time: st.time };
      const dEl = w0.querySelector('#' + target.d), tEl = w0.querySelector('#' + target.t);
      if (dEl) { dEl.value = r.date; dEl.dispatchEvent(new Event('input', { bubbles: true })); dEl.dispatchEvent(new Event('change', { bubbles: true })); }
      if (tEl) { tEl.value = r.time; tEl.dispatchEvent(new Event('input', { bubbles: true })); tEl.dispatchEvent(new Event('change', { bubbles: true })); }
      toast(`Diisi ${r.time} WIB`, 'clock');
    }
  });
  const res = () => {
    st.date = w.querySelector('#tzD').value || today(); st.time = w.querySelector('#tzT').value || '00:00';
    const from = st.dir === 'in' ? tz : LOCAL_TZ, to = st.dir === 'in' ? LOCAL_TZ : tz;
    const ms = wallToUtc(from, st.date, st.time), r = tzParts(to, ms);
    const dd = dayDiff(st.date, r.date);
    w.querySelector('#tzDl').textContent = 'Tanggal (' + tzAbbr(from, ms) + ')'; w.querySelector('#tzTl').textContent = 'Jam (' + tzAbbr(from, ms) + ')';
    w.querySelector('#tzRes').innerHTML = `<div class="tz-big num">${st.dir === 'in' ? r.time : fmt12(r.time)} <small>${esc(tzAbbr(to, ms))}</small></div><div class="tz-sub">${st.dir === 'in' ? prettyDate(r.date, true) : enDate(r.date)}${dd ? ` · <b>${dd > 0 ? 'hari berikutnya' : 'hari sebelumnya'}</b>` : ''}</div><div class="tz-sub muted">${st.dir === 'in' ? fmt12(st.time) : st.time} ${esc(tzAbbr(from, ms))} · ${tzDiffText(tz, ms)}</div>`;
    const txt = w.querySelector('#tzPaste').value, out = [];
    const re = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\W|$)/gi; let mt;
    while ((mt = re.exec(txt))) {
      let h = Number(mt[1]); const mi = mt[2] ? Number(mt[2]) : 0, ap = (mt[3] || '').toLowerCase().replace(/\./g, '');
      if (!ap && !mt[2]) continue; if (h > 23 || mi > 59) continue;
      if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
      const t0 = `${pad(h)}:${pad(mi)}`, m2 = wallToUtc(tz, st.date, t0), r2 = tzParts(LOCAL_TZ, m2), d2 = dayDiff(st.date, r2.date);
      out.push(`<div class="row plain"><span class="grow"><span class="b">${esc(mt[0].trim())}</span> ${esc(tzAbbr(tz, m2))}</span><span class="val num">→ <b style="color:var(--label)">${r2.time} WIB</b>${d2 ? ` <small class="c-orange">${d2 > 0 ? '+1 hari' : '−1 hari'}</small>` : ''}</span></div>`);
    }
    w.querySelector('#tzList').innerHTML = out.join('') || (txt.trim() ? '<div class="row plain muted t-foot">Tidak ada jam yang terbaca. Tulis seperti 3 PM, 3:30pm, atau 15:00.</div>' : '');
  };
  w.querySelector('#tzDir').addEventListener('click', e => {
    const b = e.target.closest('[data-dir]'); if (!b || b.dataset.dir === st.dir) return;
    const from = st.dir === 'in' ? tz : LOCAL_TZ, to = st.dir === 'in' ? LOCAL_TZ : tz;
    const r = convertTz(from, to, w.querySelector('#tzD').value || today(), w.querySelector('#tzT').value || '00:00');
    st.dir = b.dataset.dir; w.querySelector('#tzD').value = r.date; w.querySelector('#tzT').value = r.time;
    w.querySelectorAll('#tzDir button').forEach(x => x.classList.toggle('on', x === b)); res();
  });
  ['tzD', 'tzT', 'tzPaste'].forEach(id => w.querySelector('#' + id).addEventListener('input', res));
  // Dari editor: mulai dari jadwal WIB yang sudah ada, ditampilkan dalam jam klien
  if (target && w0) { const d = (w0.querySelector('#' + target.d) || {}).value, t = (w0.querySelector('#' + target.t) || {}).value; if (d && t) { const r = convertTz(LOCAL_TZ, tz, d, t); w.querySelector('#tzD').value = r.date; w.querySelector('#tzT').value = r.time; } }
  res();
}

// ---------------- EDITOR KLIEN ----------------
function openClient(id) {
  const isNew = !id || !S.clients[id];
  const used = clients().map(c => c.color);
  const c = isNew ? { id: uid(), name: '', handle: '', niche: '', color: CLIENT_COLORS.find(x => !used.includes(x)) || CLIENT_COLORS[0], pkg: { feed: 12, reels: 4, story: 20, price: '' }, brand: { colors: [] }, status: 'aktif', start: today() } : clone(S.clients[id]);
  c.pkg = c.pkg || {}; c.brand = c.brand || {}; c.brand.colors = c.brand.colors || [];
  let color = c.color, cPhoto = c.photo || '';
  const bc = [0, 1, 2, 3].map(i => c.brand.colors[i] || '');
  const w = openSheet({
    title: isNew ? 'Klien baru' : 'Edit klien', right: isNew ? 'Tambah' : 'Simpan', wide: true,
    body: `<div class="form"><div class="design-box"><div class="dthumb" id="cPhoto" style="border-radius:50%;width:84px;height:84px;aspect-ratio:auto">${c.photo ? `<img src="${c.photo}" alt="">` : ic('people')}</div><div class="dside"><button type="button" class="btn-tinted" id="cPhotoBtn">${ic('photo')} Pilih foto profil</button><button type="button" class="c-red t-foot" id="cPhotoDel" ${c.photo ? '' : 'hidden'}>Hapus foto</button><span class="t-foot muted">Tampil di web ini dan di link progress klien. Dikecilkan otomatis (±20 KB).</span></div></div></div>
      ${fSec('Akun', fInput('cName', 'Nama brand', c.name, { ph: 'Kopi Senja' }) + fInput('cHandle', 'Username IG', c.handle, { ph: 'tanpa @' }) + fInput('cNiche', 'Niche', c.niche, { ph: 'F&B, skincare…' }) + fSelect('cStatus', 'Status', c.status, [['aktif', 'Aktif'], ['jeda', 'Dijeda']]) + fSelect('cTz', 'Zona waktu', c.tz || 'America/New_York', TZ_OPTS))}
      <div><div class="form-head">Warna penanda</div><div class="form"><div class="color-pick" id="cColor">${CLIENT_COLORS.map(x => `<button type="button" data-col="${x}" class="${x === color ? 'on' : ''}" style="background:${x}" aria-label="Warna ${x}"></button>`).join('')}</div></div></div>
      ${fSec('Paket per bulan', fInput('kFeed', 'Feed/Carousel', c.pkg.feed, { type: 'number', mode: 'numeric' }) + fInput('kReels', 'Reels', c.pkg.reels, { type: 'number', mode: 'numeric' }) + fInput('kStory', 'Story', c.pkg.story, { type: 'number', mode: 'numeric' }) + fInput('kPrice', 'Harga (Rp)', c.pkg.price, { mode: 'numeric', ph: '2500000' }) + fInput('cStart', 'Mulai kontrak', c.start, { type: 'date' }))}
      ${fSec('Jadwal posting (jam klien)', CATS.map(k => { const sl = slotsOf(c)[k.k]; return `<div class="field slot-ed" data-slot="${k.k}"><span class="slot-l"><span class="cdot" style="background:${k.color}"></span>${esc(k.label)}</span><span class="slot-days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" data-day="${d}" class="${sl.days.includes(d) ? 'on' : ''}">${'MSSRKJS'[d]}</button>`).join('')}</span><input type="time" id="sl_${k.k}" value="${sl.time}" aria-label="Jam ${esc(k.short)}"></div>`; }).join(''), 'Hari dan jam dalam zona klien (lihat Zona waktu di atas). Target mingguan dihitung dari jumlah slot. Default sesuai sheet "Webisodes Monthly Content" dari klien.')}
      ${fSec('Rotasi template Canva', ROT_CATS.map(k => fArea('rot_' + k, CAT[k].label + ' (satu per baris: nama | link)', ((c.rot || {})[k]) || '', { rows: 3, ph: 'Template A | https://canva.com/…' })).join(''), 'Satu template per baris. Tiap minggu web menyarankan template berikutnya, lalu kembali ke awal.')}
      ${fSec('Sumber riset berita', fArea('cSources', 'Satu per baris: nama | link', c.sources, { rows: 4, ph: 'Newsletter iklim | https://…' }), 'Akun Instagram, newsletter, atau situs berita sustainability yang kamu pantau. Fokus US, tapi global boleh.')}
      ${fSec('Kontak', fInput('cGreet', 'Nama sapaan', c.greet, { ph: 'Mis. Tafreed (untuk "Hi …!")' }) + fInput('cPic', 'PIC', c.pic, { ph: 'Nama & jabatan' }) + fInput('cPhone', 'WhatsApp', c.phone, { type: 'tel', ph: '0812…' }) + fInput('cDrive', 'Folder aset', c.drive, { type: 'url', ph: 'Link Google Drive' }))}
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
      const out = Object.assign(c, { photo: cPhoto,
        name, handle: val(wr, 'cHandle').replace(/^@/, ''), niche: val(wr, 'cNiche'), status: val(wr, 'cStatus'), tz: val(wr, 'cTz'), color,
        pkg: { feed: num(val(wr, 'kFeed')), reels: num(val(wr, 'kReels')), story: num(val(wr, 'kStory')), price: num(val(wr, 'kPrice')) },
        slots: Object.fromEntries(CATS.map(k => { const row = wr.querySelector(`[data-slot="${k.k}"]`); return [k.k, { days: [...row.querySelectorAll('[data-day].on')].map(b => Number(b.dataset.day)), time: val(wr, 'sl_' + k.k) || '14:00' }]; })),
        rot: Object.fromEntries(ROT_CATS.map(k => [k, val(wr, 'rot_' + k)])), sources: val(wr, 'cSources'),
        start: val(wr, 'cStart'), greet: val(wr, 'cGreet'), pic: val(wr, 'cPic'), phone: val(wr, 'cPhone'), drive: val(wr, 'cDrive'), pillars: val(wr, 'cPillars'), notes: val(wr, 'cNotes'),
        brand: { colors, fonts: val(wr, 'bFonts'), tone: val(wr, 'bTone'), hashtags: val(wr, 'bHash'), dos: val(wr, 'bDos'), donts: val(wr, 'bDonts') }
      });
      dbSet('clients/' + c.id, out);
      toast(isNew ? 'Klien ditambahkan' : 'Klien disimpan', 'check');
      if (isNew) push({ v: 'client', id: c.id, backLabel: 'Klien', tab: 'clients' }); else render();
    }
  });
  w.querySelector('#cPhotoBtn').addEventListener('click', () => {
    pickImage().then(f => f && openCropper(f, { round: true, outW: 320, title: 'Crop foto profil' })).then(url => { if (!url) return; cPhoto = url; w.querySelector('#cPhoto').innerHTML = `<img src="${cPhoto}" alt="">`; w.querySelector('#cPhotoDel').hidden = false; });
  });
  w.querySelector('#cPhotoDel').addEventListener('click', () => { cPhoto = ''; w.querySelector('#cPhoto').innerHTML = ic('people'); w.querySelector('#cPhotoDel').hidden = true; });
  w.querySelectorAll('.slot-days').forEach(el => el.addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) b.classList.toggle('on'); }));
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
  guest: el => { if (sheets.length) [...sheets].forEach(r => closeSheet(r)); const cur = stack[stack.length - 1]; if (cur && cur.v === 'guest' && cur.id === el.dataset.id) return; stack = (cur && cur.v === 'guest') ? stack.slice(0, -1) : stack; push({ v: 'guest', id: el.dataset.id, backLabel: stack.length ? 'Kembali' : (ALL_PAGES[UI.tab] ? ALL_PAGES[UI.tab].label : 'Kembali'), tab: 'guests' }); },
  newGuest: () => openGuest(),
  guestPhoto: el => { const id = el.dataset.id; pickImage().then(f => f && openCropper(f, { round: true, outW: 320, title: 'Crop foto narasumber' })).then(url => { const g = guestOf(id); if (!url || !g) return; dbSet('guests/' + id, Object.assign(clone(g), { photo: url })); render(); toast('Foto narasumber disimpan', 'check'); }); },
  editGuest: el => openGuest(el.dataset.id),
  gStage: el => { UI.gStage = el.dataset.k; saveUI(); render(); },
  setStage: el => { const g = guestOf(el.dataset.id); if (!g) return; dbSet('guests/' + g.id, Object.assign(clone(g), { stage: el.dataset.k })); render(); },
  makePack: el => { const g = guestOf(el.dataset.id); if (g) makePack(g, el.dataset.k); },
  quotePost: el => { const g = guestOf(el.dataset.id); if (!g) return; openPost(null, guestPreset(g, 'quote', Number(el.dataset.i))); },
  delGuest: el => { const id = el.dataset.id, n = postsAll().filter(p => p.guestId === id).length; iosAlert('Hapus tamu?', n ? `${n} konten tetap ada, hanya tidak lagi terhubung ke tamu ini.` : 'Tindakan ini tidak bisa dibatalkan.', [{ label: 'Batal' }, { label: 'Hapus', red: true, bold: true, fn: () => { postsAll().filter(p => p.guestId === id).forEach(p => dbSet('posts/' + p.id, Object.assign(clone(p), { guestId: '' }))); dbSet('guests/' + id, null); closeSheet(); stack = []; go('guests'); toast('Tamu dihapus', 'trash'); } }]); },
  cCat: el => { UI.cCat = el.dataset.k; render(); },
  fillFromGuest: () => {
    const g = guestOf(draft.guestId);
    if (!g) { toast('Pilih tamu dulu', 'alert'); return; }
    const k = CAT[draft.cat] && GUEST_CATS.includes(draft.cat) ? draft.cat : 'intro';
    const pre = guestPreset(g, k);
    const apply = () => { const w = draftSheet(); Object.assign(draft, { cat: k, type: pre.type, title: pre.title, caption: pre.caption, tags: draft.tags || pre.tags }); [['pTitle', 'title'], ['pCaption', 'caption'], ['pTags', 'tags'], ['pCat', 'cat']].forEach(([id, f]) => { const el = w && w.querySelector('#' + id); if (el) el.value = draft[f] || ''; }); refreshDraftParts(); updateCaptionCount(w); toast('Diisi dari data ' + g.name, 'sparkle'); };
    if (draft.caption && draft.caption.trim()) iosAlert('Ganti caption?', 'Caption yang sudah ditulis akan diganti dengan template dari data tamu.', [{ label: 'Batal' }, { label: 'Ganti', bold: true, fn: apply }]); else apply();
  },
  followUp: el => { const p = S.posts[el.dataset.id]; if (p) sharePost(p); },
  newPost: el => { if (!clients().length) { iosAlert('Belum ada klien', 'Tambahkan klien dulu sebelum membuat konten.', [{ label: 'Nanti' }, { label: 'Tambah klien', bold: true, fn: () => openClient() }]); return; } const pre = {}; if (el.dataset.date) pre.date = el.dataset.date; if (el.dataset.client) pre.clientId = el.dataset.client; openPost(null, pre); },
  pType: el => { draft.type = el.dataset.k; refreshDraftParts(); },
  pStatus: el => { const k = el.dataset.k; if (draft.status !== k) { draft.log.push({ t: Date.now(), text: `Status: ${ST[draft.status] ? ST[draft.status].label : '—'} → ${ST[k].label}` }); draft.status = k; refreshDraftParts(); } },
  addLog: () => { const w = draftSheet(); const inp = w && w.querySelector('#pLogInput'); if (!inp || !inp.value.trim()) return; draft.log.push({ t: Date.now(), text: inp.value.trim() }); inp.value = ''; refreshDraftParts(); },
  pickMedia: () => openPicker(),
  pickThumb: () => { const fi = $('thumbInput'); fi.value = ''; fi.click(); },
  clearThumb: () => { draft.thumb = ''; refreshDraftParts(); },
  pasteThumb: async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('x');
      const items = await navigator.clipboard.read();
      for (const it of items) { const tp = it.types.find(t => t.startsWith('image/')); if (tp) { setDraftThumb(new File([await it.getType(tp)], 'paste.png', { type: tp })); return; } }
      toast('Clipboard tidak berisi gambar', 'alert');
    } catch (e) { toast('Salin gambarnya dulu, lalu tekan Ctrl+V di sini', 'copy'); }
  },
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
  tzOpen: () => openConverter(null),
  setLogo: el => { dbSet('settings', Object.assign({}, S.settings, { logo: el.dataset.k })); render(); toast('Logo diganti', 'check'); },
  slotFill: () => fillSlot(true),
  canvaPreview: () => fetchCanvaPreview(true),
  slotNew: el => openPost(null, { cat: el.dataset.k, type: CAT[el.dataset.k].type, date: el.dataset.date, time: el.dataset.time, clientId: el.dataset.client }),
  tzFill: el => openConverter({ d: el.dataset.d, t: el.dataset.t }),
  copyProgress: el => {
    const k = el.dataset.k;
    if (k === 'c') { const c = clientOf(el.dataset.id); if (c) copyText(progressMsg('c', c)); return; }
    const g = guestOf(el.dataset.id); if (!g) return;
    copyText(k === 'gl' ? progressUrl('g', ensureGuestShare(g)) : progressMsg('g', g));
  },
  openProgress: el => {
    const url = el.dataset.k === 'c' ? (clientOf(el.dataset.id) ? progressUrl('c', ensureClientShare(clientOf(el.dataset.id))) : '') : (guestOf(el.dataset.id) ? progressUrl('g', ensureGuestShare(guestOf(el.dataset.id))) : '');
    if (url) { const w = window.open(url, '_blank'); if (!w) location.href = url; }
  },
  aiPost: () => { const k = CAT[draft.cat] ? draft.cat : 'post'; openPrompt(k === 'post' ? 'live' : k, guestOf(draft.guestId), draft); },
  aiGuest: el => { const g = guestOf(el.dataset.id); if (g) openPrompt(el.dataset.k, g, null); },
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
      { label: 'Jadikan konten', bold: true, fn: () => { const isNews = /berita|news/i.test(x.tag || ''); openPost(null, Object.assign({ clientId: x.clientId || UI.fClient || '', title: x.text.slice(0, 60), notes: x.text + (x.ref ? '\nReferensi: ' + x.ref : ''), status: 'draft' }, isNews ? { cat: 'news', type: 'carousel', source: x.ref || '' } : {})); dbSet('ideas/' + x.id, Object.assign(clone(x), { done: true })); render(); } },
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
  migrateStatuses();
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
    if (el.dataset && el.dataset.f && draft) {
      draft[el.dataset.f] = el.value;
      if (el.dataset.f === 'caption') updateCaptionCount();
      if (el.dataset.f === 'design') { const box = (draftSheet() || document).querySelector('#pDesignOpen'); if (box) { box.hidden = !/^https?:\/\//.test(el.value.trim()); const a = box.querySelector('a'); if (a) a.href = el.value.trim(); } }
    }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'quickIntro') { const g = guestOf(el.dataset.id); if (g) { dbSet('guests/' + g.id, Object.assign(clone(g), { noIntro: !el.checked })); render(); toast(el.checked ? 'Intro carousel dibutuhkan' : 'Webisode saja, tanpa Intro', 'check'); } return; }
    if (el.id === 'setSimple') { dbSet('settings', Object.assign({}, S.settings, { simple: el.checked })); if (el.checked && ADV_PAGES.includes(UI.tab)) UI.tab = 'more'; render(); toast(el.checked ? 'Mode sederhana aktif' : 'Semua fitur ditampilkan', 'check'); return; }
    if (el.id === 'setAutoClean') { dbSet('settings', Object.assign({}, S.settings, { autoClean: el.checked })); toast('Disimpan', 'check'); }
    if (el.id === 'setName') { dbSet('settings', Object.assign({}, S.settings, { name: el.value.trim() })); toast('Disimpan', 'check'); }
    if (el.dataset && el.dataset.chk && draft) { draft.check = Object.assign({}, draft.check, { [el.dataset.chk]: el.checked }); return; }
    if (el.dataset && el.dataset.f && draft) {
      draft[el.dataset.f] = el.value;
      if (el.dataset.f === 'clientId' && pickState) renderPicker();
      const w = draftSheet();
      if (el.dataset.f === 'cat' && CAT[el.value]) { draft.type = CAT[el.value].type; if (!S.posts[draft.id]) fillSlot(); refreshDraftParts(); }
      if (el.dataset.f === 'date' || el.dataset.f === 'time') refreshDraftParts();
      if (el.dataset.f === 'design') fetchCanvaPreview(false);
      if (el.dataset.f === 'cat' && w) { const h = w.querySelector('#pCatHint'); if (h) { h.hidden = !CAT[el.value]; h.querySelector('span').textContent = CAT[el.value] ? CAT[el.value].hint : ''; } }
      if (el.dataset.f === 'guestId') { const g = guestOf(el.value); if (g && g.handle && !draft.tags) { draft.tags = '@' + g.handle; const ti = w && w.querySelector('#pTags'); if (ti) ti.value = draft.tags; } }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheets.length) { closeSheet(); return; }
    if (e.key === 'Enter' && e.target.id === 'quickIdea' && e.target.value.trim()) { const id = uid(); dbSet('ideas/' + id, { id, text: e.target.value.trim(), clientId: UI.fClient || '', tag: '', ref: '', done: false, at: Date.now() }); render(); const q = $('quickIdea'); if (q) q.focus(); toast('Ide disimpan', 'bulb'); }
    if (e.key === 'Enter' && e.target.id === 'pLogInput') { e.preventDefault(); A.addLog(); }
  });
  $('fileInput').addEventListener('change', e => { if (e.target.files.length) handleFiles(e.target.files); });
  $('thumbInput').addEventListener('change', e => { if (e.target.files[0]) setDraftThumb(e.target.files[0]); });
  document.addEventListener('paste', e => {
    if (!draft || !draftSheet()) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find(x => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); setDraftThumb(f); }
  });
  $('importInput').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      const d = JSON.parse(t); const data = d.data || d;
      if (!data || typeof data !== 'object' || !data.clients) throw new Error('Bukan file cadangan Nexa Social');
      iosAlert('Pulihkan data?', 'Data dari file digabung dengan data sekarang. Untuk item dengan ID sama, hanya kolom yang ada di file yang diperbarui.', [{ label: 'Batal' }, { label: 'Pulihkan', bold: true, fn: () => {
        // Digabung dengan data yang sudah ada: kolom di file menimpa, kolom lain tetap
        COLS.forEach(c => Object.entries(data[c] || {}).forEach(([k, v]) => dbSet(c + '/' + k, v && typeof v === 'object' && S[c] && S[c][k] ? Object.assign({}, S[c][k], v) : v)));
        if (data.settings) dbSet('settings', data.settings);
        render(); toast('Data dipulihkan', 'check');
      } }]);
    }).catch(err => iosAlert('Gagal membaca file', err.message));
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  // Mode demo: halaman progress klien menulis ke localStorage yang sama → muat ulang data
  window.addEventListener('storage', e => { if (DEMO && e.key === CACHE_KEY && e.newValue) { try { S = Object.assign(blank(), JSON.parse(e.newValue)); render(); } catch (x) {} } });
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
  const D = blank(), t = today(), m = t.slice(0, 7), now = Date.now(), ws = weekStart(t);
  D.settings = { name: 'Hadzmi' };
  D.clients.c1 = { id: 'c1', name: 'Sustain Talks', handle: 'sustaintalks.pod', niche: 'Podcast sustainability', color: '#2E8B57', status: 'aktif', start: addMonths(m, -1) + '-04',
    pkg: { feed: 0, reels: 0, story: 0, price: 6000000 }, weekly: { intro: 7, announce: 2, live: 2, summary: 2, quote: 2, news: 4 },
    pic: 'Host & produser (review di Canva, chat di Upwork)', phone: '',
    rot: { announce: 'Template A | https://www.canva.com/\nTemplate B | https://www.canva.com/\nTemplate C | https://www.canva.com/', live: 'Template A | https://www.canva.com/\nTemplate B | https://www.canva.com/\nTemplate C | https://www.canva.com/', quote: 'Template A | https://www.canva.com/\nTemplate B | https://www.canva.com/\nTemplate C | https://www.canva.com/' },
    sources: 'Google News: sustainability (US) | https://news.google.com/search?q=sustainability&hl=en-US&gl=US\nGoogle News: climate innovation | https://news.google.com/search?q=climate%20innovation&hl=en-US&gl=US\nGoogle News: circular economy | https://news.google.com/search?q=circular%20economy&hl=en-US&gl=US', drive: 'https://www.canva.com/', pillars: 'Guest, Episode, News',
    notes: 'Akses admin Instagram langsung (bukan Business Suite) dan anggota tim Canva workspace. Setelah desain jadi, kabari klien lewat Upwork untuk dicek di folder Canva. Konten yang butuh approval wajib disetujui sebelum publish. Hati-hati memakai akses akun.',
    brand: { colors: ['#1F3D2B', '#2E8B57', '#E8F1E4', '#F2B544'], fonts: 'Brand template di Canva workspace', tone: 'Warm, optimistic and easy to understand', hashtags: '#sustainability #podcast #changemakers #circulareconomy #climateaction', dos: 'Pakai template brand di Canva. Tag tamu & organisasinya. Foto tamu wajib ada di Intro, Tayang, dan Kutipan.', donts: 'Jangan publish sebelum approval. Hindari klaim tanpa sumber di konten berita.' } };
  const G = [
    ['g1', 'Maya Prasetyo', 'Founder', 'Loop Circular Studio', 'maya.loops', 'tayang', -20, -12, '10:00', -1, 12, 'Designing Out Waste',
      'Maya builds circular product systems for small brands and helps them design waste out from day one.',
      'Waste is a design flaw, not an inevitability.\nThe most sustainable product is the one you can repair.',
      'Start circular design at the sketch stage\nRepairability builds customer loyalty\nSmall brands can lead with take-back programs'],
    ['g2', 'Daniel Okafor', 'Head of Sustainability', 'Northwind Logistics', 'dan.okafor', 'rekam', -14, -3, '14:00', 4, 13, 'Greener Supply Chains',
      'Daniel leads decarbonisation across a regional logistics network.',
      'You cannot manage what you do not measure.', 'Measure scope 3 first\nElectric fleets need charging partners\nSuppliers respond to clear targets'],
    ['g3', 'Sofia Lindqvist', 'Climate Tech Investor', 'Fjord Ventures', 'sofia.invests', 'jadwal', -9, 2, '16:00', '', '', '', 'Sofia backs early-stage climate tech founders across the Nordics.', '', ''],
    ['g4', 'Arif Hidayat', 'Co-founder', 'Rimba Regenerative Farm', 'arif.rimba', 'jadwal', -5, 6, '09:30', '', '', '', 'Arif restores degraded land with regenerative agriculture.', '', ''],
    ['g5', 'Lena Ortiz', 'Sustainable Fashion Designer', 'Thread Again', 'lena.threads', 'intro', 1, '', '', '', '', '', 'Lena turns textile waste into modern, timeless collections.', '', ''],
    ['g6', 'Kenji Watanabe', 'Circular Economy Researcher', 'Urban Futures Lab', 'kenji.circular', 'intro', 3, '', '', '', '', '', 'Kenji studies how cities can keep materials in use for longer.', '', ''],
    ['g7', 'Priya Raman', 'ESG Consultant', 'Impact Bridge', 'priya.esg', 'intro', 0, '', '', '', '', '', 'Priya helps companies turn ESG commitments into everyday practice.', '', '']
  ];
  G.forEach(x => { D.guests[x[0]] = { topics: x[0] === 'g5' ? 'Textile waste, upcycling, slow fashion business models' : '', introTr: x[0] === 'g5' ? '(Contoh) Host: Thanks for joining the intro call... Lena: We collect offcuts from local factories and turn them into...' : '', yt: ['g1', 'g2'].includes(x[0]) ? 'https://www.youtube.com/' : '', epTr: x[0] === 'g2' ? '(Contoh) Transkrip episode ditempel di sini dari YouTube.' : '', id: x[0], clientId: 'c1', name: x[1], role: x[2], org: x[3], handle: x[4], stage: x[5], introDate: addDays(t, x[6]), recDate: x[7] === '' ? '' : addDays(t, x[7]), recTime: x[8], pubDate: x[9] === '' ? '' : addDays(t, x[9]), epNo: String(x[10] || ''), epTitle: x[11], intro: x[12], quotes: x[13], takeaways: x[14], at: now }; });
  const ph = { intro: ['#BFE6EE', '#2C8FA3'], announce: ['#D9D8FF', '#5856D6'], live: ['#FFC7D3', '#E0264E'], livestory: ['#FFD9DF', '#FF6B81'], summary: ['#FFE0B2', '#E07B00'], quote: ['#EBD3F7', '#8E44AD'], news: ['#CFEBD6', '#2E8B57'] };
  // Konten contoh mengikuti slot jadwal klien: minggu lalu, minggu ini, dan awal minggu depan
  S = D;
  const tz = 'America/New_York', cToday = tzParts(tz, now).date, cws = weekStart(cToday), nowT = nowTime();
  const introG = ['g6', 'g5', 'g7', 'g4', 'g3', 'g2', 'g1'];
  const news = ['Plastics treaty: what is at stake', 'Why repair cafés are growing', 'Circular fashion: rental vs resale', 'Heat pumps, explained simply', 'This week in climate history', 'Fast fashion and textile waste', 'What is a carbon budget?', 'Corporate net zero: claims vs action', 'The first Earth Day, 1970', 'Refill stores across the US', 'Green jobs report, simply put', 'How cities cut food waste'];
  const futureSt = ['jadwal', 'klien', 'draft', 'revisi', 'jadwal', 'klien', 'draft', 'draft', 'jadwal'];
  let n = 0, ni = 0, ii = 0, fi = 0;
  for (let day = -7; day < 10; day++) {
    const cd = addDays(cws, day);
    CATS.forEach(k => {
      const sl = DEFAULT_SLOTS[k.k]; if (!sl.days.includes(dow(cd))) return;
      const w = convertTz(tz, LOCAL_TZ, cd, sl.time);
      const past = w.date < t || (w.date === t && w.time <= nowT);
      if (!past && day >= 7 && !['intro', 'announce'].includes(k.k)) return;
      if (!past && day < 7 && k.k === 'quote' && dow(cd) === 6) return;   // sengaja dibiarkan kosong
      if (!past && day < 7 && k.k === 'news' && dow(cd) === 0) return;
      const thisWeekEp = day >= 0;
      const gid = k.k === 'intro' ? introG[ii++ % introG.length] : k.k === 'announce' ? (thisWeekEp ? 'g3' : 'g2') : ['live', 'livestory', 'summary'].includes(k.k) ? (thisWeekEp ? 'g2' : 'g1') : k.k === 'quote' ? 'g1' : null;
      const g = gid ? D.guests[gid] : null;
      const status = past ? 'posted' : (day >= 7 ? 'draft' : futureSt[fi++ % futureSt.length]);
      const base = g ? guestPreset(g, k.k) : { clientId: 'c1', cat: k.k, type: k.type, title: news[ni % news.length], caption: news[ni++ % news.length] + ' 🌍\n\nSwipe to learn what it means and why it matters 👉\n\nSource in the last slide.\n\n#sustainability #climateaction', tags: '', source: 'https://example.org/sumber-berita' };
      const id = 'p' + (++n);
      D.posts[id] = Object.assign({ id, media: [], log: [], createdAt: now - 9 * 86400000, stAt: now - 7 * 3600000, notes: '', link: status === 'posted' ? 'https://instagram.com/p/contoh' + n : '', check: status === 'posted' ? { format: true, tag: true, caption: true, story: k.k === 'livestory' } : {}, design: 'https://www.canva.com/design/contoh-' + n, ph: ph[k.k] }, base, { date: w.date, time: w.time, status });
      if (status === 'revisi') D.posts[id].log = [{ t: now - 5 * 3600000, text: 'Klien: slide 3 terlalu padat, pecah jadi 2 slide ya.' }, { t: now - 5 * 3600000 + 60000, text: 'Status: Menunggu Klien → Revisi' }];
    });
  }
  D.ideas.i1 = { id: 'i1', text: 'EU rules on unsold clothes: explainer carousel', clientId: 'c1', tag: 'berita', ref: 'https://example.org/riset', done: false, at: now - 86400000 };
  D.ideas.i2 = { id: 'i2', text: 'Myth vs fact: recycling symbols', clientId: 'c1', tag: 'berita', ref: '', done: false, at: now - 2 * 86400000 };
  D.ideas.i3 = { id: 'i3', text: 'Behind the mic: recording day story', clientId: 'c1', tag: 'story', ref: '', done: false, at: now - 3 * 86400000 };
  D.ideas.i4 = { id: 'i4', text: 'Monthly recap: all guests in one carousel', clientId: 'c1', tag: 'recap', ref: '', done: false, at: now - 4 * 86400000 };
  [['caption', 'News carousel', '{judul} 🌍\n\nSwipe to learn what it means and why it matters 👉\n\nSource in the last slide.'], ['caption', 'Episode is live', '🎙️ NEW EPISODE IS LIVE\n\n[judul episode] with [nama tamu].\n\nListen now, link in bio.'], ['hashtag', 'Sustainability umum', '#sustainability #climateaction #circulareconomy #sustainableliving #greenbusiness #changemakers'], ['hashtag', 'Fashion berkelanjutan', '#sustainablefashion #slowfashion #circularfashion #textilewaste']].forEach((x, i) => { const id = 't' + i; D.templates[id] = { id, kind: x[0], title: x[1], body: x[2], clientId: '' }; });
  for (let k = 3; k >= 1; k--) { const mm = addMonths(m, -k), f = 1 + (3 - k) * .09, id = 'r' + k; D.reports[id] = { id, clientId: 'c1', month: mm, followers: Math.round(2400 * f), reach: Math.round(9800 * f), impressions: Math.round(16500 * f), engagement: Math.round(820 * f), visits: Math.round(310 * f), top: k === 1 ? 'Episode is live · Maya Prasetyo' : '', notes: k === 1 ? 'Quote graphic dan intro tamu paling banyak disimpan. Pertahankan foto tamu besar di slide pertama.' : '' }; }
  D.invoices.v0 = { id: 'v0', clientId: 'c1', period: addMonths(m, -1), no: 'INV/' + addMonths(m, -1).replace('-', '') + '/01', amount: 6000000, status: 'lunas', due: addDays(t, -25), paidAt: addDays(t, -27), note: '' };
  D.invoices.v1 = { id: 'v1', clientId: 'c1', period: m, no: 'INV/' + m.replace('-', '') + '/01', amount: 6000000, status: 'belum', due: addDays(t, 5), paidAt: '', note: '' };
  [['Minta foto resolusi tinggi Lena Ortiz', 0], ['Riset 4 berita sustainability minggu depan', 2], ['Konfirmasi jam rekaman Sofia ke klien', 1], ['Kumpulkan kutipan dari episode Daniel', 4]].forEach((x, i) => { const id = 'k' + i; D.tasks[id] = { id, text: x[0], clientId: 'c1', due: addDays(t, x[1]), done: false, at: now }; });
  return D;
}

function safeBoot() { try { boot(); } catch (e) { showFatal(e); } }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeBoot); else safeBoot();
})();
