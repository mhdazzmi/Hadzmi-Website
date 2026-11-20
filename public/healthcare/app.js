/* =========================================================
   HADZMI HEALTHCARE — kontrol makan (kalori, purin, lemak) + AI Gemini
   Data teks : Firebase Realtime DB  → node "hadzmi_healthcare_data" (terpisah dari Assistant)
   Foto      : Cloudflare R2 (lewat /api/files, sama dengan Assistant) + thumbnail kecil di Firebase
   AI        : /api/healthcare/ai (kunci di server)  → cadangan: kunci Gemini di perangkat ini
   ========================================================= */
import { callGemini } from './ai-core.js';

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
const OWNER_EMAIL = 'hadzmi-hub@example.com'; // sama dengan Hadzmi Assistant (login PIN)
const PIN_LEN = 8;
const DB_PATH = 'hadzmi_healthcare_data';
const CACHE_KEY = 'healthcare_cache_v1';
const PENDING_KEY = 'healthcare_pending_v1';
const GEMINI_KEY_LS = 'healthcare_gemini_key';
const SESSION_KEY = 'hz_session'; // dipakai bersama Assistant → login sekali untuk keduanya
const WIB = 7 * 3600 * 1000;

const CATS = [
  { k: 'sarapan', label: 'Sarapan', icon: 'fa-mug-hot', color: 'bg-orange' },
  { k: 'siang', label: 'Makan Siang', icon: 'fa-sun', color: 'bg-yellow' },
  { k: 'malam', label: 'Makan Malam', icon: 'fa-moon', color: 'bg-indigo' },
  { k: 'camilan', label: 'Camilan', icon: 'fa-cookie-bite', color: 'bg-pink' }
];
const CAT = Object.fromEntries(CATS.map(c => [c.k, c]));

// type: max = batas atas (berlebih = merah), min = target minimal (kurang/cukup)
const NUTR = {
  kcal: { label: 'Kalori', unit: 'kcal', type: 'max' },
  protein: { label: 'Protein', unit: 'g', type: 'min', hint: 'Jaga & bangun otot (skinny fat)' },
  carbs: { label: 'Karbohidrat', unit: 'g', type: 'max', hint: 'Utamakan karbo kompleks' },
  fat: { label: 'Lemak total', unit: 'g', type: 'max', hint: 'Lemak visceral' },
  satFat: { label: 'Lemak jenuh', unit: 'g', type: 'max', hint: 'Pemicu lemak visceral' },
  sugar: { label: 'Gula', unit: 'g', type: 'max', hint: 'Fruktosa menaikkan asam urat' },
  fiber: { label: 'Serat', unit: 'g', type: 'min', hint: 'Bantu turunkan lemak perut' },
  sodium: { label: 'Natrium', unit: 'mg', type: 'max', hint: 'Garam & penyedap' },
  purine: { label: 'Purin', unit: 'mg', type: 'max', hint: 'Pemicu asam urat' }
};
const NKEYS = Object.keys(NUTR);

const DEFAULT_SETTINGS = {
  kcal: 1900, protein: 0, proteinPerKg: 1.6, purineMax: 400, sugarMax: 25, sodiumMax: 2000, fiberMin: 30,
  fatPct: 30, satFatPct: 7, carbPct: 40, waterGoal: 10,
  height: 170, age: 28, sex: 'm', activity: 1.375, goalWeight: 0,
  warnAt: 90, notifyOver: true, mealRemind: false, remindTimes: { sarapan: '08:00', siang: '13:00', malam: '19:30' },
  savePhotos: true, autoAiWeight: true, aiModel: ''
};

// ---------------- UTIL ----------------
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pad = n => String(n).padStart(2, '0');
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (n, d = 0) => num(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const readLS = (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const haptic = ms => { try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (e) {} };
const wibNow = () => new Date(Date.now() + WIB); // gunakan getUTC* untuk komponen WIB
function today() { const w = wibNow(); return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`; }
function nowTime() { const w = wibNow(); return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`; }
function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function toEpoch(date, time) { const [y, m, d] = date.split('-').map(Number); const [hh, mm] = (time || '00:00').split(':').map(Number); return Date.UTC(y, m - 1, d, hh || 0, mm || 0) - WIB; }
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function prettyDate(date, withDay) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return (withDay ? DAYS[t.getUTCDay()] + ', ' : '') + `${d} ${MON[m - 1]} ${y}`; }
function shortDate(date) { const [, m, d] = date.split('-').map(Number); return `${d}/${m}`; }
function relDay(date) { const t = today(); if (date === t) return 'Hari ini'; if (date === addDays(t, -1)) return 'Kemarin'; return prettyDate(date, true); }
function autoCat(time) { const h = Number((time || nowTime()).split(':')[0]); if (h >= 4 && h < 10) return 'sarapan'; if (h >= 10 && h < 15) return 'siang'; if (h >= 17 && h < 22) return 'malam'; return 'camilan'; }
function normKey(s) { return String(s || '').toLowerCase().replace(/[.#$\[\]\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100); }
const clone = v => JSON.parse(JSON.stringify(v === undefined ? null : v));

// ---------------- STATE ----------------
let S = Object.assign({ settings: {}, meals: {}, weights: {}, uric: {}, foods: {}, water: {}, notes: {} }, readLS(CACHE_KEY, {}));
S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings || {});
S.settings.remindTimes = Object.assign({}, DEFAULT_SETTINGS.remindTimes, S.settings.remindTimes || {});
let pending = readLS(PENDING_KEY, {}); // path → nilai yang belum terkirim ke Firebase
let viewDate = today(), followToday = true, currentTab = 'today', range = 7, bodyView = 'weight', guideView = 'aman';
let auth = null, dbRef = null, authed = false, started = false, syncMode = 'local', serverGemini = null;
let saveCacheTimer = null;
function saveCache() { clearTimeout(saveCacheTimer); saveCacheTimer = setTimeout(() => writeLS(CACHE_KEY, S), 150); }

function setLocal(path, val) {
  const parts = path.split('/');
  if (parts.length === 1) { S[parts[0]] = val == null ? (parts[0] === 'settings' ? {} : {}) : val; return; }
  const [col, key] = parts;
  if (!S[col] || typeof S[col] !== 'object') S[col] = {};
  if (val == null) delete S[col][key]; else S[col][key] = val;
}
function dbSet(path, val) {
  val = val == null ? null : clone(val);
  setLocal(path, val); saveCache();
  pending[path] = val; writeLS(PENDING_KEY, pending);
  pushPath(path);
}
function pushPath(path) {
  if (!dbRef || !authed) return;
  const val = pending[path];
  dbRef.child(path).set(val === undefined ? null : val).then(() => {
    if (pending[path] === val || JSON.stringify(pending[path]) === JSON.stringify(val)) { delete pending[path]; writeLS(PENDING_KEY, pending); }
  }).catch(err => {
    console.warn('sync', path, err);
    if (/permission/i.test(String(err && (err.code || err.message)))) setSync('err');
  });
}
function flushPending() { Object.keys(pending).forEach(pushPath); }
function applyRemote(v) {
  v = v || {};
  ['meals', 'weights', 'uric', 'foods', 'water', 'notes'].forEach(c => { S[c] = v[c] && typeof v[c] === 'object' ? v[c] : {}; });
  if (v.settings) {
    S.settings = Object.assign({}, DEFAULT_SETTINGS, v.settings);
    S.settings.remindTimes = Object.assign({}, DEFAULT_SETTINGS.remindTimes, v.settings.remindTimes || {});
  } else if (!pending.settings) { pending.settings = clone(S.settings); }
  Object.keys(pending).forEach(p => setLocal(p, pending[p] == null ? null : clone(pending[p])));
  saveCache();
  flushPending();
  renderAll();
}

// ---------------- FIREBASE & LOGIN ----------------
function sessionValid(user) {
  const r = readLS(SESSION_KEY, null);
  return !!(r && r.expiresAt && Date.now() < r.expiresAt && (!user || !r.uid || r.uid === user.uid));
}
function nextMidnight() { const n = Date.now() + WIB; return Math.floor(n / 86400000) * 86400000 + 86400000 - WIB; }

function boot() {
  bindUI();
  let fbOk = false;
  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      auth = firebase.auth(); fbOk = true;
    }
  } catch (e) { console.error(e); }
  if (!fbOk) {
    // Firebase tidak termuat (offline / diblokir) → pakai data di perangkat
    if (sessionValid()) startApp(); else showLock('Firebase tidak termuat. Periksa internet lalu muat ulang.');
    return;
  }
  let resolved = false;
  setTimeout(() => { if (!resolved && sessionValid()) startApp(); }, 5000); // offline: buka dari cache
  auth.onAuthStateChanged(user => {
    resolved = true;
    if (user && sessionValid(user)) { authed = true; startApp(); attachDb(); }
    else { authed = false; detachDb(); showLock(); }
  });
  setInterval(() => { if (started && !sessionValid()) { started = false; detachDb(); showLock('Sesi berakhir pukul 00:00 WIB. Masukkan PIN lagi.'); } }, 30000);
}
function attachDb() {
  if (dbRef || !authed) return;
  try {
    dbRef = firebase.database().ref(DB_PATH);
    setSync('off');
    dbRef.on('value', snap => { setSync(navigator.onLine === false ? 'off' : 'on'); applyRemote(snap.val()); },
      err => { console.warn(err); setSync('err'); });
    firebase.database().ref('.info/connected').on('value', s => { if (syncMode !== 'err') setSync(s.val() ? 'on' : 'off'); if (s.val()) flushPending(); });
  } catch (e) { console.error(e); setSync('err'); }
}
function detachDb() { if (dbRef) { try { dbRef.off(); firebase.database().ref('.info/connected').off(); } catch (e) {} } dbRef = null; }
function setSync(mode) {
  syncMode = mode;
  const p = $('syncPill'); if (!p) return;
  p.className = 'sync-pill ' + mode;
  $('syncText').textContent = { on: 'Sync', off: 'Offline', err: 'Ditolak', local: 'Lokal' }[mode] || mode;
}

let pinBuf = '', pinBusy = false;
function showLock(msg) {
  $('app').classList.add('hidden'); $('lock').classList.remove('hidden');
  pinBuf = ''; renderPin(); $('lockErr').textContent = msg || '';
}
function renderPin() {
  const d = $('pinDots');
  if (d.children.length !== PIN_LEN) d.innerHTML = '<span></span>'.repeat(PIN_LEN);
  [...d.children].forEach((s, i) => s.classList.toggle('on', i < pinBuf.length));
  d.classList.toggle('busy', pinBusy);
}
function pinKey(k) {
  if (pinBusy || $('lock').classList.contains('hidden')) return;
  if (k === 'del') pinBuf = pinBuf.slice(0, -1);
  else if (pinBuf.length < PIN_LEN) { pinBuf += k; haptic(5); }
  if (pinBuf.length === 1) $('lockErr').textContent = '';
  renderPin();
  if (pinBuf.length === PIN_LEN) setTimeout(submitPin, 120);
}
function submitPin() {
  if (!auth) { $('lockErr').textContent = 'Firebase belum termuat. Periksa koneksi.'; return; }
  pinBusy = true; renderPin();
  auth.signInWithEmailAndPassword(OWNER_EMAIL, pinBuf).then(cred => {
    writeLS(SESSION_KEY, { uid: cred.user.uid, email: OWNER_EMAIL, loginAt: Date.now(), expiresAt: nextMidnight() });
    pinBusy = false; pinBuf = ''; authed = true; startApp(); attachDb();
  }).catch(err => {
    pinBusy = false; pinBuf = ''; renderPin();
    const c = err && err.code || '';
    $('lockErr').textContent = /too-many/.test(c) ? 'Terlalu banyak percobaan. Tunggu sebentar.' : /network/.test(c) ? 'Tidak ada koneksi internet.' : 'PIN salah.';
    const card = $('lockCard'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); haptic(40);
  });
}
function startApp() {
  $('lock').classList.add('hidden'); $('app').classList.remove('hidden');
  if (started) return;
  started = true;
  if (!authed) setSync(auth ? 'off' : 'local');
  renderAll();
  checkServer();
}

// ---------------- KALKULASI ----------------
const itemVal = (it, k) => num(it && it[k]) * (num(it && it.q) || 1);
function sumItems(items) { const t = {}; NKEYS.forEach(k => { t[k] = (items || []).reduce((s, it) => s + itemVal(it, k), 0); }); return t; }
function mealsOn(date) { return Object.values(S.meals || {}).filter(m => m && m.date === date).sort((a, b) => num(a.ts) - num(b.ts)); }
function totalsOn(date) { const t = sumItems([]); mealsOn(date).forEach(m => { const s = sumItems(m.items); NKEYS.forEach(k => { t[k] += s[k]; }); }); return t; }
function sortedWeights() { return Object.values(S.weights || {}).filter(w => w && num(w.kg) > 0).sort((a, b) => num(a.ts) - num(b.ts)); }
function latestWeight() { const w = sortedWeights(); return w[w.length - 1] || null; }
function targets() {
  const s = S.settings, kcal = num(s.kcal) || 1900, lw = latestWeight(), w = lw ? num(lw.kg) : 65;
  return {
    kcal, protein: num(s.protein) > 0 ? num(s.protein) : Math.round(w * (num(s.proteinPerKg) || 1.6)),
    carbs: Math.round(kcal * num(s.carbPct) / 100 / 4), fat: Math.round(kcal * num(s.fatPct) / 100 / 9),
    satFat: Math.round(kcal * num(s.satFatPct) / 100 / 9), sugar: num(s.sugarMax), fiber: num(s.fiberMin),
    sodium: num(s.sodiumMax), purine: num(s.purineMax)
  };
}
function status(k, v, t) {
  const pct = t > 0 ? v / t * 100 : 0;
  if (NUTR[k].type === 'min') return pct >= 100 ? { s: 'cukup', label: 'Cukup', color: 'var(--green)', pct } : { s: 'kurang', label: 'Kurang', color: 'var(--teal)', pct };
  if (pct > 100) return { s: 'berlebih', label: 'Berlebih', color: 'var(--red)', pct };
  if (pct >= num(S.settings.warnAt || 90)) return { s: 'waspada', label: 'Hampir batas', color: 'var(--orange)', pct };
  return { s: 'aman', label: 'Aman', color: 'var(--green)', pct };
}
const VERDICT = { baik: { label: 'Baik', cls: 'v-baik', color: 'var(--green)' }, batasi: { label: 'Batasi', cls: 'v-batasi', color: 'var(--orange)' }, hindari: { label: 'Hindari', cls: 'v-hindari', color: 'var(--red)' } };
const PUR = { rendah: 'st-aman', sedang: 'st-waspada', tinggi: 'st-berlebih' };

// ---------------- RENDER: HARI INI ----------------
function renderAll() {
  if (!started) return;
  renderToday();
  if (currentTab === 'progress') renderProgress();
  if (currentTab === 'body') renderBody();
  if (currentTab === 'guide') renderGuide();
  if (!$('sheetSettings').classList.contains('hidden') && !document.activeElement.closest('#settingsBody')) renderSettings();
}
function renderToday() {
  const t = targets(), tot = totalsOn(viewDate), isToday = viewDate === today();
  $('todayEyebrow').textContent = prettyDate(viewDate, true);
  $('todayTitle').textContent = isToday ? 'Hari Ini' : relDay(viewDate) === 'Kemarin' ? 'Kemarin' : 'Riwayat';
  $('dayPicker').value = viewDate; $('dayPicker').max = today();
  $('dayNextBtn').disabled = viewDate >= today();

  // Ring kalori
  const st = status('kcal', tot.kcal, t.kcal), remain = t.kcal - tot.kcal, pct = Math.min(1, tot.kcal / (t.kcal || 1));
  const R = 70, C = 2 * Math.PI * R;
  $('kcalRing').innerHTML = `<svg viewBox="0 0 168 168" role="img" aria-label="Kalori ${fmt(tot.kcal)} dari ${fmt(t.kcal)}">
    <circle cx="84" cy="84" r="${R}" fill="none" stroke="var(--fill)" stroke-width="16"/>
    <circle cx="84" cy="84" r="${R}" fill="none" stroke="${st.s === 'aman' ? 'var(--blue)' : st.color}" stroke-width="16" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .6s cubic-bezier(.32,.72,0,1)"/></svg>
    <div class="ring-center"><div class="big" style="color:${remain < 0 ? 'var(--red)' : 'inherit'}">${remain < 0 ? '+' : ''}${fmt(Math.abs(remain))}</div><div class="lbl">${remain < 0 ? 'kcal berlebih' : 'kcal tersisa'}</div></div>`;
  $('heroTarget').innerHTML = `${fmt(t.kcal)} <small class="t-foot muted">kcal</small>`;
  $('heroEaten').innerHTML = `${fmt(tot.kcal)} <small class="t-foot muted">kcal</small>`;
  $('heroStatus').innerHTML = `<span class="badge st-${st.s}">${st.s === 'berlebih' ? '<i class="fas fa-triangle-exclamation"></i>' : st.s === 'aman' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-circle-exclamation"></i>'} ${st.label}</span>`;
  $('heroStatusDot').style.background = st.color;

  // Panel khusus kondisi
  $('focusGrid').innerHTML = ['purine', 'satFat', 'sugar', 'fat'].map(k => nTile(k, tot[k], t[k])).join('');
  $('nutriList').innerHTML = ['protein', 'fiber', 'carbs', 'sodium'].map(k => nRow(k, tot[k], t[k])).join('');

  // Peringatan
  const over = NKEYS.filter(k => NUTR[k].type === 'max' && status(k, tot[k], t[k]).s === 'berlebih');
  const near = NKEYS.filter(k => NUTR[k].type === 'max' && status(k, tot[k], t[k]).s === 'waspada');
  let strip = '';
  if (over.length) strip += `<div class="alert-strip"><i class="fas fa-triangle-exclamation"></i><div><b>Berlebih:</b> ${over.map(k => `${NUTR[k].label} ${fmt(tot[k])}/${fmt(t[k])} ${NUTR[k].unit}`).join(' · ')}.${over.includes('purine') ? ' Perbanyak air putih & hindari makanan tinggi purin sisa hari ini.' : ''}</div></div>`;
  if (near.length) strip += `<div class="alert-strip warn"><i class="fas fa-circle-exclamation"></i><div><b>Hampir batas:</b> ${near.map(k => NUTR[k].label).join(', ')}. Pilih makanan yang ringan.</div></div>`;
  const pendingCount = Object.keys(pending).length;
  if (syncMode === 'err') strip += `<div class="alert-strip info"><i class="fas fa-database"></i><div>Firebase menolak data Healthcare. Tambahkan aturan <b>hadzmi_healthcare_data</b> di Rules (lihat Pengaturan → Penyimpanan). Data aman tersimpan di perangkat${pendingCount ? ` (${pendingCount} menunggu)` : ''}.</div></div>`;
  $('alertStrip').innerHTML = strip;

  // Air
  const water = num(S.water[viewDate]), goal = num(S.settings.waterGoal) || 10;
  $('waterText').textContent = `${water} / ${goal} gelas · ${fmt(water * 0.25, 2)} L`;
  $('waterGlasses').innerHTML = Array.from({ length: Math.max(goal, water) }, (_, i) => `<i class="fas fa-glass-water ${i < water ? 'on' : ''}"></i>`).join('');

  // Makanan per kategori
  const meals = mealsOn(viewDate);
  $('mealSections').innerHTML = CATS.map(c => {
    const list = meals.filter(m => (m.cat || 'camilan') === c.k);
    const kc = list.reduce((s, m) => s + sumItems(m.items).kcal, 0);
    return `<div class="card list meal-sec">
      <div class="head"><div class="t"><span class="icon-tile ${c.color}"><i class="fas ${c.icon}"></i></span>${c.label}</div><div class="k">${list.length ? fmt(kc) + ' kcal' : ''}</div></div>
      ${list.map(mealRow).join('')}
      <button class="meal-add" data-action="openLog" data-cat="${c.k}"><i class="fas fa-plus-circle"></i> Tambah ${c.label.toLowerCase()}</button>
    </div>`;
  }).join('');

  const note = S.notes && S.notes[viewDate];
  $('dayNote').innerHTML = note ? noteCard(note, 'Ringkasan AI · ' + relDay(viewDate)) : '';
}
function nTile(k, v, t) {
  const st = status(k, v, t), d = NUTR[k], diff = t - v;
  return `<div class="ntile ${st.s === 'berlebih' ? 'over' : ''}">
    <div class="top"><span class="name">${d.label}</span><span class="badge st-${st.s}">${st.label}</span></div>
    <div class="val">${fmt(v)} <small>/ ${fmt(t)} ${d.unit}</small></div>
    <div class="bar"><i style="width:${Math.min(100, st.pct)}%;background:${st.color}"></i></div>
    <div class="t-cap muted">${diff >= 0 ? `sisa ${fmt(diff)} ${d.unit}` : `lebih ${fmt(-diff)} ${d.unit}`} · ${d.hint}</div>
  </div>`;
}
function nRow(k, v, t) {
  const st = status(k, v, t), d = NUTR[k];
  return `<div class="row nrow"><div class="grow">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="title">${d.label}</span><span class="badge st-${st.s}">${st.label}</span></div>
    <div class="bar"><i style="width:${Math.min(100, st.pct)}%;background:${st.color}"></i></div>
    <div class="t-cap muted" style="margin-top:4px">${fmt(v)} / ${fmt(t)} ${d.unit} ${d.type === 'min' ? '(target minimal)' : '(batas maks)'} · ${d.hint}</div>
  </div></div>`;
}
function mealRow(m) {
  const s = sumItems(m.items), v = VERDICT[m.verdict] || VERDICT.batasi;
  const img = m.thumb ? `<img class="thumb" src="${esc(m.thumb)}" alt="">` : `<span class="thumb"><i class="fas ${m.source === 'photo' ? 'fa-image' : 'fa-utensils'}"></i></span>`;
  return `<button class="row" data-action="openMeal" data-id="${esc(m.id)}">${img}
    <div class="grow"><div class="title">${esc(m.title || 'Makanan')}</div>
    <div class="sub"><span class="vdot" style="background:${v.color}"></span>${esc(m.time || '')} · P ${fmt(s.protein)} g · Purin ${fmt(s.purine)} mg</div></div>
    <div class="val"><b style="color:var(--label)">${fmt(s.kcal)}</b><div class="t-cap">kcal</div></div><i class="fas fa-chevron-right chev"></i></button>`;
}
function noteCard(n, title) {
  const color = n.status === 'baik' ? 'var(--green)' : n.status === 'buruk' ? 'var(--red)' : 'var(--orange)';
  return `<div class="card note-card"><div class="nh"><i class="fas fa-wand-magic-sparkles" style="color:${color}"></i>${esc(n.headline || title)}</div>
    <div>${esc(n.analysis || '')}</div>${(n.points || []).length ? `<ul>${n.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    <div class="meta">${esc(title)}${n.at ? ' · ' + new Date(n.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</div></div>`;
}

// ---------------- CATAT MAKANAN ----------------
let draft = null;
function openLog(cat) {
  const t = viewDate === today() ? nowTime() : '12:00';
  draft = { cat: cat || autoCat(t), image: null, result: null, items: null, source: null, editId: null };
  $('logDate').value = viewDate; $('logDate').max = today(); $('logTime').value = t;
  $('logText').value = ''; $('logResult').innerHTML = '';
  clearPhoto(); renderCatSeg(); renderSuggest(); setSaveEnabled(false);
  $('logTitle').textContent = 'Catat Makanan';
  openSheet('sheetLog');
}
function renderCatSeg() { $('catSeg').innerHTML = CATS.map(c => `<button data-cat="${c.k}" class="${draft.cat === c.k ? 'on' : ''}">${c.label.replace('Makan ', '')}</button>`).join(''); }
function setSaveEnabled(on) { $('logSaveTop').disabled = !on; }
function clearPhoto() { if (draft) draft.image = null; $('photoPreview').classList.add('hidden'); $('photoImg').removeAttribute('src'); $('textLabel').textContent = 'Tulis makanan (pisahkan dengan koma)'; }

// Kamera bawaan (getUserMedia) — foto hanya di memori, TIDAK tersimpan ke galeri
let camStream = null, camFacing = 'environment';
async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('camInput').click(); return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    const v = $('camVideo'); v.srcObject = camStream; $('camera').classList.remove('hidden'); await v.play().catch(() => {});
  } catch (e) {
    console.warn('camera', e); stopCamera();
    $('camInput').click(); // cadangan: kamera sistem (iOS tidak menyimpan ke Rol Kamera)
  }
}
function stopCamera() { if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; $('camera').classList.add('hidden'); }
async function flipCamera() { camFacing = camFacing === 'environment' ? 'user' : 'environment'; stopCamera(); openCamera(); }
function shoot() {
  const v = $('camVideo'); if (!v.videoWidth) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  $('camera').classList.add('flash'); haptic(15);
  setTimeout(() => { $('camera').classList.remove('flash'); stopCamera(); useImageSource(c, c.width, c.height); }, 180);
}
function loadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { useImageSource(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
  img.onerror = () => { URL.revokeObjectURL(url); banner('Gagal membuka foto', 'Format tidak didukung, coba foto lain.', 'fa-image', 'bg-red'); };
  img.src = url;
}
function resize(src, w, h, max, q) {
  const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
function squareThumb(src, w, h, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const s = Math.min(w, h); c.getContext('2d').drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.6);
}
function useImageSource(src, w, h) {
  const ai = resize(src, w, h, 1024, 0.82);
  draft.image = { ai, b64: ai.split(',')[1], full: resize(src, w, h, 900, 0.78), thumb: squareThumb(src, w, h, 120) };
  $('photoImg').src = ai; $('photoPreview').classList.remove('hidden');
  $('textLabel').textContent = 'Keterangan tambahan (opsional, mis. porsi, cara masak)';
  draft.result = null; $('logResult').innerHTML = ''; setSaveEnabled(false);
  analyze(); // langsung analisis — real time
}

// Auto-suggest dari riwayat
function lastSegment(v) { const parts = v.split(/[,;\n]/); return parts[parts.length - 1].trim(); }
function suggestions(q, limit) {
  const nq = normKey(q);
  return Object.entries(S.foods || {}).map(([key, f]) => ({ key, ...f }))
    .filter(f => f && f.name && (!nq || normKey(f.name).includes(nq)) && normKey(f.name) !== nq)
    .sort((a, b) => (normKey(b.name).startsWith(nq) - normKey(a.name).startsWith(nq)) || (num(b.count) - num(a.count)) || (num(b.last) - num(a.last)))
    .slice(0, limit || 8);
}
function chip(f, action) { const k = sumItems(f.items).kcal; return `<button class="chip" data-action="${action}" data-key="${esc(f.key)}">${esc(f.name)} <small>${fmt(k)} kcal</small></button>`; }
function renderSuggest() { $('logSuggest').innerHTML = suggestions(lastSegment($('logText').value)).map(f => chip(f, 'pickSuggest')).join(''); }
function pickSuggest(key) {
  const f = S.foods[key]; if (!f) return;
  const ta = $('logText'), parts = ta.value.split(/([,;\n])/);
  parts[parts.length - 1] = (parts.length > 1 ? ' ' : '') + f.name;
  ta.value = parts.join('') + ', ';
  ta.focus(); renderSuggest(); haptic(5);
}
function fromCache(text) {
  const whole = S.foods[normKey(text.replace(/[,;\s]+$/, ''))];
  if (whole && whole.items) return { ...whole, title: whole.name, items: clone(whole.items) };
  const segs = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  const found = segs.map(s => S.foods[normKey(s)]);
  if (found.some(f => !f || !f.items)) return null;
  const order = ['baik', 'batasi', 'hindari'];
  const verdict = found.reduce((w, f) => order.indexOf(f.verdict) > order.indexOf(w) ? f.verdict : w, 'baik');
  return {
    isFood: true, title: segs.join(', '), items: found.flatMap(f => clone(f.items)), verdict,
    score: Math.round(found.reduce((s, f) => s + num(f.score || 6), 0) / found.length),
    summary: found.length === 1 ? found[0].summary || '' : 'Dihitung dari riwayat makananmu (tanpa memanggil AI).',
    goutNote: found.map(f => f.goutNote).filter(Boolean).slice(0, 1).join(''), fatNote: found.map(f => f.fatNote).filter(Boolean).slice(0, 1).join(''),
    tips: [], swaps: [], confidence: 'tinggi'
  };
}
async function analyze(forceAi) {
  const text = $('logText').value.trim().replace(/[,;\s]+$/, '');
  if (!draft.image && !text) { banner('Belum ada makanan', 'Ambil foto atau tulis makanannya dulu.', 'fa-utensils', 'bg-orange'); return; }
  if (!draft.image && !forceAi) {
    const c = fromCache(text);
    if (c) { draft.result = c; draft.items = c.items.map(it => ({ ...it, q: num(it.q) || 1 })); draft.source = 'cache'; renderLogResult(true); return; }
  }
  const btn = $('analyzeBtn'); btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${draft.image ? 'Menganalisis foto…' : 'Menghitung nutrisi…'}`;
  $('logResult').innerHTML = skeleton();
  try {
    const t = targets(), tot = totalsOn($('logDate').value || viewDate);
    const r = await ai('food', { text, image: draft.image ? { mime: 'image/jpeg', data: draft.image.b64 } : null, context: profileCtx({ sisaHariIni: Object.fromEntries(['kcal', 'purine', 'satFat', 'sugar'].map(k => [k, Math.round(t[k] - tot[k])])) }) });
    if (!r || r.isFood === false || !(r.items || []).length) { $('logResult').innerHTML = `<div class="card note-card"><div class="nh"><i class="fas fa-circle-question c-orange"></i>Bukan makanan?</div><div>${esc(r && r.summary || 'AI tidak mengenali makanan. Coba foto lebih dekat atau tulis nama makanannya.')}</div></div>`; return; }
    draft.result = r; draft.items = r.items.map(it => ({ ...it, q: 1 })); draft.source = draft.image ? 'photo' : 'text';
    renderLogResult(true);
  } catch (e) {
    $('logResult').innerHTML = `<div class="card note-card"><div class="nh"><i class="fas fa-triangle-exclamation c-red"></i>Analisis gagal</div><div>${esc(e.message)}</div><button class="btn btn-gray btn-sm" data-action="analyze">Coba lagi</button></div>`;
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Analisis ulang dengan AI'; }
}
function skeleton() { return `<div class="card note-card"><div class="nh"><span class="spinner c-blue"></span> AI sedang menghitung kalori, purin & lemak…</div><div class="t-foot muted">Biasanya 3–10 detik.</div></div>`; }
function renderLogResult(anim) {
  const r = draft.result;
  $('logResult').innerHTML = analysisHtml(r, draft.items, { editable: true, anim, date: $('logDate').value || viewDate }) +
    (draft.source === 'cache' ? `<button class="btn btn-gray btn-sm" style="align-self:center" data-action="analyzeAi"><i class="fas fa-rotate"></i> Hitung ulang dengan AI</button>` : '') +
    `<button class="btn btn-green" data-action="saveMeal"><i class="fas fa-check"></i> Simpan ke ${esc(CAT[draft.cat].label)}</button>`;
  setSaveEnabled(true);
}
function analysisHtml(r, items, opt) {
  const v = VERDICT[r.verdict] || VERDICT.batasi, s = sumItems(items);
  const t = targets();
  let impact = '';
  if (opt.editable) {
    const before = totalsOn(opt.date);
    const after = {}; NKEYS.forEach(k => { after[k] = before[k] + s[k]; });
    const overs = ['kcal', 'purine', 'satFat', 'sugar', 'fat', 'sodium'].filter(k => after[k] > t[k]);
    impact = `<div class="alert-strip ${overs.length ? '' : 'info'}"><i class="fas ${overs.length ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i><div>
      Setelah ini: sisa kalori <b>${fmt(t.kcal - after.kcal)}</b> kcal · purin <b>${fmt(after.purine)}</b>/${fmt(t.purine)} mg.
      ${overs.length ? `<br><b>Akan melewati batas:</b> ${overs.map(k => NUTR[k].label).join(', ')}.` : ''}</div></div>`;
  }
  const tot = [['kcal', 'Kalori'], ['protein', 'Protein'], ['carbs', 'Karbo'], ['fat', 'Lemak'], ['satFat', 'L. jenuh'], ['sugar', 'Gula'], ['fiber', 'Serat'], ['purine', 'Purin']]
    .map(([k, l]) => `<div><div class="v">${fmt(s[k])}</div><div class="l">${l} (${NUTR[k].unit})</div></div>`).join('');
  const qs = [0.5, 1, 1.5, 2];
  const rows = items.map((it, i) => `<div class="item-row">
    <div class="item-top"><div><div class="item-name">${esc(it.name)}</div><div class="item-meta">${esc(it.portion || '')}${it.grams ? ` · ${fmt(num(it.grams) * (num(it.q) || 1))} g` : ''}</div></div>
      <div style="text-align:right"><div class="b">${fmt(itemVal(it, 'kcal'))} kcal</div><span class="pur-tag ${PUR[it.purineLevel] || 'st-kurang'}">purin ${esc(it.purineLevel || '?')} · ${fmt(itemVal(it, 'purine'))} mg</span></div></div>
    <div class="item-meta">P ${fmt(itemVal(it, 'protein'), 1)} g · K ${fmt(itemVal(it, 'carbs'), 1)} g · L ${fmt(itemVal(it, 'fat'), 1)} g (jenuh ${fmt(itemVal(it, 'satFat'), 1)}) · Gula ${fmt(itemVal(it, 'sugar'), 1)} g · Na ${fmt(itemVal(it, 'sodium'))} mg</div>
    ${opt.editable || opt.qtyEdit ? `<div class="qty">${qs.map(q => `<button data-action="qty" data-i="${i}" data-q="${q}" class="${(num(it.q) || 1) === q ? 'on' : ''}">×${String(q).replace('.', ',')}</button>`).join('')}
      <button class="del" data-action="delItem" data-i="${i}" aria-label="Hapus item"><i class="fas fa-trash"></i></button></div>` : ''}
  </div>`).join('');
  const bullets = (title, arr, icon) => (arr || []).length ? `<div class="card note-card"><div class="nh"><i class="fas ${icon}"></i>${title}</div><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  return `<div class="result${opt.anim ? ' anim' : ''}">
    <div class="card res-head"><div class="score ${v.cls}">${fmt(r.score)}<small>/10</small></div>
      <div style="min-width:0"><div class="res-title">${esc(r.title || 'Makanan')}</div>
      <div class="t-foot"><span class="badge st-${r.verdict === 'baik' ? 'aman' : r.verdict === 'hindari' ? 'berlebih' : 'waspada'}">${v.label}</span>
      <span class="muted"> · akurasi ${esc(r.confidence || 'sedang')}</span></div></div></div>
    ${impact}
    <div class="totals">${tot}</div>
    <div class="card list">${rows || '<div class="empty">Tidak ada item</div>'}</div>
    ${r.summary ? `<div class="card note-card"><div class="nh"><i class="fas fa-clipboard-list c-blue"></i>Ringkasan</div><div>${esc(r.summary)}</div></div>` : ''}
    ${r.goutNote ? `<div class="card note-card"><div class="nh"><i class="fas fa-bone c-purple"></i>Asam urat</div><div>${esc(r.goutNote)}</div></div>` : ''}
    ${r.fatNote ? `<div class="card note-card"><div class="nh"><i class="fas fa-droplet c-orange"></i>Lemak visceral</div><div>${esc(r.fatNote)}</div></div>` : ''}
    ${bullets('Saran', r.tips, 'fa-lightbulb c-green')}
    ${bullets('Alternatif lebih sehat', r.swaps, 'fa-right-left c-blue')}
  </div>`;
}
async function saveMeal() {
  if (!draft || !draft.result || !draft.items || !draft.items.length) return;
  const r = draft.result, date = $('logDate').value || viewDate, time = $('logTime').value || nowTime();
  const before = totalsOn(date);
  const prev = draft.editId ? S.meals[draft.editId] : null;
  const id = draft.editId || uid();
  const meal = {
    id, date, time, ts: toEpoch(date, time), cat: draft.cat,
    title: r.title || (draft.items[0] && draft.items[0].name) || 'Makanan',
    text: $('logText').value.trim().replace(/[,;\s]+$/, '') || (prev ? prev.text || '' : ''),
    items: draft.items.map(it => { const o = {}; ['name', 'portion', 'purineLevel'].forEach(k => { o[k] = String(it[k] || ''); }); ['grams', ...NKEYS].forEach(k => { o[k] = Math.round(num(it[k]) * 10) / 10; }); o.q = num(it.q) || 1; return o; }),
    verdict: r.verdict || 'batasi', score: num(r.score), summary: r.summary || '', goutNote: r.goutNote || '', fatNote: r.fatNote || '',
    tips: r.tips || [], swaps: r.swaps || [], confidence: r.confidence || '', source: prev ? prev.source : draft.source,
    thumb: (draft.image && draft.image.thumb) || (prev ? prev.thumb || '' : ''), photoId: prev ? prev.photoId || '' : '',
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(), updatedAt: Date.now()
  };
  if (prev && prev.date === date) NKEYS.forEach(k => { before[k] -= sumItems(prev.items)[k]; });
  dbSet('meals/' + id, meal);
  if (!prev) learn(meal);
  const full = draft.image && draft.image.full;
  closeSheet();
  if (date !== viewDate) { viewDate = date; followToday = date === today(); }
  renderAll();
  banner(prev ? 'Perubahan disimpan' : 'Tersimpan', `${meal.title} · ${fmt(sumItems(meal.items).kcal)} kcal`, 'fa-check', 'bg-green');
  checkExceed(date, before, totalsOn(date));
  if (full && S.settings.savePhotos && authed) uploadPhoto(full, id).catch(e => console.warn('upload foto', e));
}
function learn(meal) {
  const put = (name, items, extra) => {
    const key = normKey(name); if (!key || key.length < 2) return;
    const prev = S.foods[key] || {};
    dbSet('foods/' + key, {
      name: String(name).trim().slice(0, 100), items: items.map(it => ({ ...it, q: 1 })), count: num(prev.count) + 1, last: Date.now(),
      verdict: extra.verdict || 'batasi', score: num(extra.score) || 6, summary: extra.summary || '', goutNote: extra.goutNote || '', fatNote: extra.fatNote || ''
    });
  };
  // Simpan dengan porsi yang dipilih (q dibakukan) agar pemakaian berikutnya sama
  const baked = meal.items.map(it => { const o = { ...it }; ['grams', ...NKEYS].forEach(k => { o[k] = Math.round(num(it[k]) * (num(it.q) || 1) * 10) / 10; }); if ((num(it.q) || 1) !== 1) o.portion = `${it.portion} ×${String(it.q).replace('.', ',')}`; o.q = 1; return o; });
  if (meal.text) put(meal.text, baked, meal); else if (meal.source === 'photo') put(meal.title, baked, meal);
  if (baked.length > 1 || !meal.text) baked.forEach(it => put(it.name, [it], {
    verdict: it.purineLevel === 'tinggi' ? 'hindari' : it.purineLevel === 'sedang' ? 'batasi' : meal.verdict === 'hindari' ? 'batasi' : 'baik', score: meal.score
  }));
}
function dataUrlToBlob(d) { const [h, b] = d.split(','), bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: (h.match(/:(.*?);/) || [])[1] || 'image/jpeg' }); }
async function token() { if (!auth || !auth.currentUser) throw new Error('Belum login'); return auth.currentUser.getIdToken(); }
async function uploadPhoto(dataUrl, mealId) {
  const res = await fetch('/api/files?store=auto', { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('healthcare-' + mealId + '.jpg') }, body: dataUrlToBlob(dataUrl) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data.error || 'upload ' + res.status);
  const m = S.meals[mealId];
  if (m) dbSet('meals/' + mealId, { ...m, photoId: data.id });
}
const photoCache = new Map();
async function photoUrl(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const res = await fetch('/api/files/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + await token() } });
  if (!res.ok) throw new Error('foto ' + res.status);
  const url = URL.createObjectURL(await res.blob()); photoCache.set(id, url); return url;
}

// Peringatan berlebih
function checkExceed(date, before, after) {
  if (!S.settings.notifyOver) return;
  const t = targets(), warnAt = num(S.settings.warnAt) || 90, over = [], near = [];
  ['kcal', 'purine', 'satFat', 'fat', 'sugar', 'sodium', 'carbs'].forEach(k => {
    const b = before[k] / (t[k] || 1) * 100, a = after[k] / (t[k] || 1) * 100;
    if (a > 100 && b <= 100) over.push(`${NUTR[k].label}: ${fmt(after[k])} / ${fmt(t[k])} ${NUTR[k].unit}`);
    else if (a >= warnAt && b < warnAt && a <= 100) near.push(NUTR[k].label);
  });
  if (!over.length && !near.length) return;
  const isToday = date === today();
  if (over.length) {
    haptic([60, 40, 60]);
    iosAlert('⚠️ Melebihi batas harian', over.join('\n') + (over.some(x => x.startsWith('Purin')) ? '\n\nMinum air putih lebih banyak & hindari makanan tinggi purin sisa hari ini.' : '\n\nPilih makanan ringan & rendah lemak untuk sisa hari ini.'), [{ label: 'Mengerti', bold: true }]);
    if (isToday) sysNotify('Hadzmi Healthcare: melebihi batas', over.join(' · '), 'healthcare-over-' + date);
  } else {
    banner('Hampir mencapai batas', near.join(', ') + ` sudah ≥ ${warnAt}% batas harian.`, 'fa-circle-exclamation', 'bg-orange');
  }
}

// Detail makanan tersimpan
let openMealId = null, mealEdit = null;
function openMeal(id) {
  const m = S.meals[id]; if (!m) return;
  openMealId = id; mealEdit = { cat: m.cat, items: clone(m.items || []), time: m.time, date: m.date };
  renderMealDetail(); openSheet('sheetMeal');
  if (m.photoId && authed) photoUrl(m.photoId).then(u => { const im = $('mealPhoto'); if (im && openMealId === id) im.src = u; }).catch(() => {});
}
function renderMealDetail() {
  const m = S.meals[openMealId]; if (!m) return;
  $('mealDetail').innerHTML = `
    ${m.thumb || m.photoId ? `<div class="photo-preview"><img id="mealPhoto" src="${esc(m.thumb || '')}" alt=""></div>` : ''}
    <div class="segmented" id="mealCatSeg">${CATS.map(c => `<button data-mcat="${c.k}" class="${mealEdit.cat === c.k ? 'on' : ''}">${c.label.replace('Makan ', '')}</button>`).join('')}</div>
    <div class="grid2"><label class="fld"><span>Tanggal</span><input type="date" id="mDate" value="${esc(mealEdit.date)}" max="${today()}"></label>
      <label class="fld"><span>Jam</span><input type="time" id="mTime" value="${esc(mealEdit.time || '')}"></label></div>
    ${analysisHtml(m, mealEdit.items, { qtyEdit: true })}
    ${m.text ? `<div class="t-foot muted">Ditulis: “${esc(m.text)}”</div>` : ''}
    <button class="btn btn-filled" data-action="saveMealEdit"><i class="fas fa-check"></i> Simpan perubahan</button>
    <button class="btn btn-gray" data-action="reanalyzeMeal"><i class="fas fa-rotate"></i> Analisis ulang dengan AI</button>`;
}
function saveMealEdit() {
  const m = S.meals[openMealId]; if (!m) return;
  if (!mealEdit.items.length) return deleteMeal();
  const date = $('mDate').value || m.date, time = $('mTime').value || m.time;
  const before = totalsOn(date); if (m.date === date) NKEYS.forEach(k => { before[k] -= sumItems(m.items)[k]; });
  const next = { ...m, cat: mealEdit.cat, items: mealEdit.items, date, time, ts: toEpoch(date, time), updatedAt: Date.now() };
  dbSet('meals/' + m.id, next); closeSheet(); renderAll();
  banner('Perubahan disimpan', next.title, 'fa-check', 'bg-green');
  checkExceed(date, before, totalsOn(date));
}
async function reanalyzeMeal() {
  const m = S.meals[openMealId]; if (!m) return;
  closeSheet();
  setTimeout(async () => {
    openLog(m.cat); draft.editId = m.id;
    $('logTitle').textContent = 'Analisis Ulang'; $('logDate').value = m.date; $('logTime').value = m.time;
    $('logText').value = m.text || m.title;
    if (m.photoId && authed) {
      try {
        const u = await photoUrl(m.photoId), img = new Image();
        img.onload = () => {
          const ai = resize(img, img.naturalWidth, img.naturalHeight, 1024, 0.82);
          draft.image = { ai, b64: ai.split(',')[1], full: null, thumb: m.thumb };
          $('photoImg').src = ai; $('photoPreview').classList.remove('hidden'); analyze(true);
        };
        img.src = u; return;
      } catch (e) {}
    }
    analyze(true);
  }, 320);
}
async function deleteMeal() {
  const m = S.meals[openMealId]; if (!m) return;
  const ok = await iosAlert('Hapus makanan ini?', m.title, [{ label: 'Batal' }, { label: 'Hapus', danger: true, value: true }]);
  if (!ok) return;
  dbSet('meals/' + m.id, null);
  if (m.photoId && authed) token().then(t => fetch('/api/files/' + encodeURIComponent(m.photoId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } })).catch(() => {});
  closeSheet(); renderAll(); banner('Dihapus', m.title, 'fa-trash', 'bg-gray');
}

// ---------------- AI ----------------
function profileCtx(extra) {
  const s = S.settings, w = latestWeight(), t = targets();
  return Object.assign({ tinggiCm: s.height, usia: s.age, kelamin: s.sex === 'f' ? 'perempuan' : 'laki-laki', beratKg: w ? w.kg : null, targetHarian: t }, extra || {});
}
async function checkServer() {
  try { const r = await fetch('/api/config', { cache: 'no-store' }); const d = await r.json(); serverGemini = !!d.gemini; } catch (e) { serverGemini = false; }
}
async function ai(mode, { text, image, context }) {
  const model = S.settings.aiModel || undefined;
  let serverErr = '';
  if (authed && auth && auth.currentUser) {
    let res = null, data = null;
    try {
      res = await fetch('/api/healthcare/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify({ mode, text, image, context, model }) });
      data = await res.json().catch(() => null);
    } catch (e) { serverErr = 'Server tidak terjangkau'; }
    if (res && res.ok && data && data.result) return data.result;
    if (res && data && data.error && !(res.status === 503 && data.code === 'NO_KEY') && res.status !== 404 && res.status !== 405) throw new Error(data.error);
    serverErr = serverErr || (data && data.error) || 'Server AI belum aktif';
  }
  const key = readLS(GEMINI_KEY_LS, '');
  if (key) return (await callGemini({ key, mode, text, image, context, model })).result;
  throw new Error(`${serverErr || 'AI belum diatur'}. Isi GEMINI_API_KEY di Cloudflare, atau masukkan kunci Gemini di Pengaturan → AI.`);
}
async function aiDay() {
  const meals = mealsOn(viewDate);
  if (!meals.length) return banner('Belum ada makanan', 'Catat makanan dulu untuk ringkasan hari ini.', 'fa-utensils', 'bg-orange');
  $('dayNote').innerHTML = skeleton();
  try {
    const tot = totalsOn(viewDate);
    const r = await ai('day', { context: profileCtx({ tanggal: viewDate, total: roundObj(tot), airGelas: num(S.water[viewDate]), makanan: meals.map(m => ({ kategori: CAT[m.cat] ? CAT[m.cat].label : m.cat, jam: m.time, nama: m.title, kcal: Math.round(sumItems(m.items).kcal), purin: Math.round(sumItems(m.items).purine), penilaian: m.verdict })) }) });
    dbSet('notes/' + viewDate, { ...r, at: Date.now() }); renderToday();
  } catch (e) { $('dayNote').innerHTML = `<div class="alert-strip"><i class="fas fa-triangle-exclamation"></i><div>${esc(e.message)}</div></div>`; }
}
const roundObj = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));

// ---------------- PROGRES ----------------
function rangeDays(n) { const t = today(); return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1)); }
function renderProgress() {
  const days = rangeDays(range), t = targets();
  const data = days.map(d => ({ date: d, tot: totalsOn(d), n: mealsOn(d).length }));
  const logged = data.filter(d => d.n > 0);
  const avg = k => logged.length ? logged.reduce((s, d) => s + d.tot[k], 0) / logged.length : 0;
  const onTarget = logged.filter(d => d.tot.kcal <= t.kcal && d.tot.purine <= t.purine).length;
  let streak = 0; for (let d = mealsOn(today()).length ? today() : addDays(today(), -1); mealsOn(d).length; d = addDays(d, -1)) streak++;
  const ws = sortedWeights().filter(w => w.date >= days[0]);
  const wDelta = ws.length >= 2 ? num(ws[ws.length - 1].kg) - num(ws[0].kg) : null;
  $('progStats').innerHTML = [
    [fmt(avg('kcal')), 'kcal', 'Rata-rata kalori/hari'],
    [fmt(avg('purine')), 'mg', 'Rata-rata purin/hari'],
    [`${onTarget}<small>/${logged.length}</small>`, '', 'Hari sesuai target'],
    [wDelta == null ? '—' : (wDelta > 0 ? '+' : '') + fmt(wDelta, 1), wDelta == null ? '' : 'kg', 'Perubahan berat'],
    [`${streak}`, 'hari', 'Streak mencatat'],
    [fmt(avg('protein')), 'g', 'Rata-rata protein/hari']
  ].map(([v, u, l]) => `<div class="stat"><div class="num">${v} <small>${u}</small></div><div class="lbl">${l}</div></div>`).join('');
  const bars = k => data.map(d => ({ label: shortDate(d.date), date: d.date, value: Math.round(d.tot[k]), empty: !d.n }));
  $('kcalChartSub').textContent = `target ${fmt(t.kcal)} kcal · merah = melewati target`;
  $('purChartSub').textContent = `batas ${fmt(t.purine)} mg · merah = melewati batas`;
  $('proChartSub').textContent = `target minimal ${fmt(t.protein)} g`;
  barChart($('chartKcal'), bars('kcal'), { target: t.kcal, unit: 'kcal', kind: 'max' });
  barChart($('chartPurine'), bars('purine'), { target: t.purine, unit: 'mg', kind: 'max' });
  barChart($('chartProtein'), bars('protein'), { target: t.protein, unit: 'g', kind: 'min' });
  weightChart($('chartWeight2'), ws, $('wChartSub'));
  const pk = 'p' + range + '-' + today();
  $('periodNote').innerHTML = S.notes[pk] ? noteCard(S.notes[pk], `Analisis ${range} hari`) : '';

  const dates = [...new Set(Object.values(S.meals || {}).map(m => m && m.date).filter(Boolean))].sort().reverse().slice(0, 120);
  $('historyList').innerHTML = dates.length ? dates.map(d => {
    const tot = totalsOn(d), st = status('kcal', tot.kcal, t.kcal), pst = status('purine', tot.purine, t.purine);
    return `<button class="row" data-action="gotoDay" data-date="${d}"><span class="icon-tile ${st.s === 'berlebih' || pst.s === 'berlebih' ? 'bg-red' : st.s === 'waspada' ? 'bg-orange' : 'bg-green'}"><i class="fas ${st.s === 'berlebih' || pst.s === 'berlebih' ? 'fa-triangle-exclamation' : 'fa-check'}"></i></span>
      <div class="grow"><div class="title">${relDay(d)}</div><div class="sub">${mealsOn(d).length} makanan · purin ${fmt(tot.purine)} mg · protein ${fmt(tot.protein)} g</div></div>
      <div class="val"><b style="color:var(--label)">${fmt(tot.kcal)}</b><div class="t-cap">kcal</div></div><i class="fas fa-chevron-right chev"></i></button>`;
  }).join('') : '<div class="empty">Belum ada riwayat. Catat makanan pertamamu dengan tombol +</div>';
}
async function aiPeriod() {
  const days = rangeDays(range), logged = days.filter(d => mealsOn(d).length);
  if (!logged.length) return banner('Belum ada data', 'Catat makanan beberapa hari dulu.', 'fa-chart-line', 'bg-orange');
  const pk = 'p' + range + '-' + today();
  $('periodNote').innerHTML = skeleton();
  try {
    const r = await ai('period', { context: profileCtx({
      periodeHari: range, hariTercatat: logged.length,
      harian: logged.map(d => ({ tgl: d, ...roundObj(totalsOn(d)), air: num(S.water[d]) })),
      beratBadan: sortedWeights().filter(w => w.date >= days[0]).map(w => ({ tgl: w.date, kg: w.kg, lemakPersen: w.fat || null, visceral: w.visc || null })),
      asamUrat: Object.values(S.uric || {}).filter(u => u && u.date >= days[0]).map(u => ({ tgl: u.date, mgdl: u.value }))
    }) });
    dbSet('notes/' + pk, { ...r, at: Date.now() }); renderProgress();
  } catch (e) { $('periodNote').innerHTML = `<div class="alert-strip"><i class="fas fa-triangle-exclamation"></i><div>${esc(e.message)}</div></div>`; }
}

// ---------------- GRAFIK (SVG, tanpa library) ----------------
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function roundedBar(x, y, w, h, r) { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
function barChart(el, data, opt) {
  if (!data.some(d => d.value > 0)) { el.innerHTML = '<div class="chart-empty">Belum ada data di periode ini</div>'; return; }
  const W = Math.max(280, el.clientWidth || 320), H = 180, L = 38, R = 8, T = 12, B = 22;
  const max = niceMax(Math.max(opt.target || 0, ...data.map(d => d.value)) * 1.08);
  const iw = W - L - R, ih = H - T - B, step = iw / data.length, bw = Math.max(3, Math.min(24, step * 0.62));
  const y = v => T + ih - v / max * ih;
  let g = '';
  [0, 0.5, 1].forEach(f => { const v = max * f; g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${fmt(v)}</text>`; });
  const every = Math.ceil(data.length / 7);
  let bars = '', hits = '', labels = '';
  data.forEach((d, i) => {
    const x = L + step * i + (step - bw) / 2, h = Math.max(d.value > 0 ? 2 : 0, ih - (y(d.value) - T));
    const over = opt.kind === 'max' && opt.target && d.value > opt.target;
    const color = over ? 'var(--red)' : opt.kind === 'min' && opt.target && d.value >= opt.target ? 'var(--green)' : 'var(--blue)';
    if (h > 0) bars += `<path d="${roundedBar(x, T + ih - h, bw, h, 4)}" fill="${color}"/>`;
    if (i % every === 0 || i === data.length - 1) labels += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d.label}</text>`;
    const pct = opt.target ? Math.round(d.value / opt.target * 100) : null;
    hits += `<rect class="hit" x="${L + step * i}" y="${T}" width="${step}" height="${ih}" data-tt="${esc(prettyDate(d.date, true))}" data-tv="${d.empty ? 'Belum dicatat' : fmt(d.value) + ' ' + opt.unit}" data-ts="${d.empty || pct == null ? '' : pct + '% dari ' + (opt.kind === 'min' ? 'target' : 'batas')}"/>`;
  });
  const tl = opt.target ? `<line class="target" x1="${L}" x2="${W - R}" y1="${y(opt.target)}" y2="${y(opt.target)}"/><text x="${L + 4}" y="${y(opt.target) - 4}" text-anchor="start" style="font-weight:600;paint-order:stroke;stroke:var(--card);stroke-width:3px">${opt.kind === 'min' ? 'Target' : 'Batas'} ${fmt(opt.target)}</text>` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}${bars}${tl}${labels}${hits}</svg>`;
}
function lineChart(el, pts, opt) {
  if (!pts.length) { el.innerHTML = `<div class="chart-empty">${opt.empty || 'Belum ada data'}</div>`; return; }
  const W = Math.max(280, el.clientWidth || 320), H = 180, L = 38, R = 12, T = 14, B = 22;
  const vals = pts.map(p => p.v).concat(opt.target ? [opt.target] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); const padv = Math.max((hi - lo) * 0.15, opt.minPad || 0.5); lo -= padv; hi += padv;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
  const iw = W - L - R, ih = H - T - B;
  const x = t => pts.length === 1 ? L + iw / 2 : L + (t - t0) / span * iw, y = v => T + ih - (v - lo) / (hi - lo) * ih;
  let g = '';
  [0, 0.5, 1].forEach(f => { const v = lo + (hi - lo) * f; g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${fmt(v, 1)}</text>`; });
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = pts.length > 1 ? `<path d="${path}L${x(t1)},${T + ih}L${x(t0)},${T + ih}Z" fill="var(--blue)" opacity=".08"/>` : '';
  const showDots = pts.length <= 40;
  const dots = pts.map(p => `${showDots ? `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="4" fill="${p.color || 'var(--blue)'}" stroke="var(--card)" stroke-width="2"/>` : ''}<circle class="hit" cx="${x(p.t)}" cy="${y(p.v)}" r="14" data-tt="${esc(p.label)}" data-tv="${fmt(p.v, 1)} ${opt.unit}" data-ts="${esc(p.sub || '')}"/>`).join('');
  const n = Math.min(5, pts.length), lbls = Array.from({ length: n }, (_, i) => pts[Math.round(i * (pts.length - 1) / Math.max(1, n - 1))])
    .map(p => `<text x="${x(p.t)}" y="${H - 6}" text-anchor="middle">${shortDate(p.date)}</text>`).join('');
  const tl = opt.target ? `<line class="target" x1="${L}" x2="${W - R}" y1="${y(opt.target)}" y2="${y(opt.target)}"/><text x="${L + 4}" y="${y(opt.target) - 4}" text-anchor="start" style="font-weight:600;paint-order:stroke;stroke:var(--card);stroke-width:3px">${opt.targetLabel || 'Target'} ${fmt(opt.target, 1)}</text>` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}${area}${tl}${pts.length > 1 ? `<path d="${path}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${lbls}${dots}</svg>`;
}
function weightChart(el, ws, subEl) {
  const goal = num(S.settings.goalWeight);
  lineChart(el, ws.map(w => ({ t: num(w.ts), v: num(w.kg), date: w.date, label: `${prettyDate(w.date, true)} ${w.time || ''}`, sub: [w.fat ? `lemak ${fmt(w.fat, 1)}%` : '', w.visc ? `visceral ${fmt(w.visc, 1)}` : ''].filter(Boolean).join(' · ') })),
    { unit: 'kg', target: goal || null, targetLabel: 'Target', empty: 'Belum ada catatan berat badan' });
  if (subEl) { const l = ws[ws.length - 1]; subEl.textContent = l ? `terakhir ${fmt(l.kg, 1)} kg · ${relDay(l.date)}${goal ? ` · target ${fmt(goal, 1)} kg` : ''}` : ''; }
}
function showTip(target) {
  const tt = $('tooltip'), r = target.getBoundingClientRect();
  tt.innerHTML = `<div class="t-cap muted">${esc(target.dataset.tt)}</div><div class="tt-v">${esc(target.dataset.tv)}</div>${target.dataset.ts ? `<div class="t-cap muted">${esc(target.dataset.ts)}</div>` : ''}`;
  tt.style.left = Math.min(window.innerWidth - 115, Math.max(115, r.left + r.width / 2)) + 'px'; tt.style.top = Math.max(70, r.top + 6) + 'px';
  tt.classList.remove('hidden');
}
const hideTip = () => $('tooltip').classList.add('hidden');

// ---------------- TUBUH ----------------
function renderBody() {
  $('bodySeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.body === bodyView));
  $('bodyWeight').classList.toggle('hidden', bodyView !== 'weight');
  $('bodyUric').classList.toggle('hidden', bodyView !== 'uric');
  ['wDate', 'uDate'].forEach(id => { const e = $(id); if (!e.value) e.value = today(); e.max = today(); });
  ['wTime', 'uTime'].forEach(id => { const e = $(id); if (!e.dataset.touched) e.value = nowTime(); });
  const ws = sortedWeights(), last = ws[ws.length - 1], first = ws[0], h = num(S.settings.height) / 100;
  const bmi = last && h ? num(last.kg) / (h * h) : 0;
  const week = last ? ws.filter(w => num(w.ts) >= num(last.ts) - 7 * 86400000) : [];
  const wk = week.length >= 2 ? num(last.kg) - num(week[0].kg) : null;
  $('bodyStats').innerHTML = [
    [last ? fmt(last.kg, 1) : '—', 'kg', 'Berat terakhir'],
    [bmi ? fmt(bmi, 1) : '—', '', 'BMI' + (bmi ? (bmi < 18.5 ? ' · kurang' : bmi < 23 ? ' · normal (Asia)' : bmi < 25 ? ' · berlebih' : ' · obesitas') : '')],
    [wk == null ? '—' : (wk > 0 ? '+' : '') + fmt(wk, 1), wk == null ? '' : 'kg', '7 hari terakhir'],
    [first && last && first !== last ? ((num(last.kg) - num(first.kg) > 0 ? '+' : '') + fmt(num(last.kg) - num(first.kg), 1)) : '—', first && last && first !== last ? 'kg' : '', 'Sejak awal catat']
  ].map(([v, u, l]) => `<div class="stat"><div class="num">${v} <small>${u}</small></div><div class="lbl">${l}</div></div>`).join('');
  weightChart($('chartWeight'), ws.slice(-90), $('wChartSub1'));
  const vs = ws.filter(w => num(w.visc) > 0);
  $('viscCard').classList.toggle('hidden', vs.length < 1);
  if (vs.length) lineChart($('chartVisc'), vs.map(w => ({ t: num(w.ts), v: num(w.visc), date: w.date, label: prettyDate(w.date, true), color: num(w.visc) > 9 ? 'var(--red)' : 'var(--blue)' })), { unit: '', target: 9, targetLabel: 'Batas', minPad: 1 });

  const notes = ws.filter(w => w.ai).slice(-5).reverse();
  $('weightAi').innerHTML = notes.length ? notes.map((w, i) => i === 0 ? noteCard(w.ai, `Analisis ${prettyDate(w.date)} · ${fmt(w.kg, 1)} kg`) : `<details class="card note-card"><summary class="b" style="cursor:pointer">${esc(w.ai.headline || '')} <span class="t-cap muted">· ${prettyDate(w.date)}</span></summary><div>${esc(w.ai.analysis || '')}</div></details>`).join('')
    : `<div class="card empty">${ws.length ? 'Tap “Analisis ulang” untuk catatan AI.' : 'Simpan berat badan pertama untuk mendapat analisis AI.'}</div>`;
  $('weightList').innerHTML = ws.length ? ws.slice().reverse().slice(0, 60).map((w, i, arr) => {
    const prev = arr[i + 1], d = prev ? num(w.kg) - num(prev.kg) : null;
    return `<div class="row"><span class="icon-tile bg-blue"><i class="fas fa-weight-scale"></i></span><div class="grow">
      <div class="title">${fmt(w.kg, 1)} kg ${d == null ? '' : `<span class="t-foot" style="color:${d > 0 ? 'var(--red)' : d < 0 ? 'var(--green)' : 'var(--label2)'}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${fmt(Math.abs(d), 1)}</span>`}</div>
      <div class="sub">${prettyDate(w.date, true)} · ${esc(w.time || '')}${w.fat ? ` · lemak ${fmt(w.fat, 1)}%` : ''}${w.visc ? ` · visceral ${fmt(w.visc, 1)}` : ''}${w.waist ? ` · pinggang ${fmt(w.waist, 1)} cm` : ''}${w.note ? ' · ' + esc(w.note) : ''}</div></div>
      <button class="link c-red" data-action="delWeight" data-id="${esc(w.id)}" aria-label="Hapus"><i class="fas fa-trash"></i></button></div>`;
  }).join('') : '<div class="empty">Belum ada data</div>';

  const us = Object.values(S.uric || {}).filter(u => u && num(u.value) > 0).sort((a, b) => num(a.ts) - num(b.ts));
  lineChart($('chartUric'), us.map(u => ({ t: num(u.ts), v: num(u.value), date: u.date, label: `${prettyDate(u.date, true)} ${u.time || ''}`, sub: uricStatus(u.value).label, color: uricStatus(u.value).color })), { unit: 'mg/dL', target: 6, targetLabel: 'Target <', empty: 'Belum ada catatan asam urat' });
  $('uricList').innerHTML = us.length ? us.slice().reverse().map(u => {
    const st = uricStatus(u.value);
    return `<div class="row"><span class="icon-tile bg-purple"><i class="fas fa-vial"></i></span><div class="grow">
      <div class="title">${fmt(u.value, 1)} mg/dL <span class="badge ${st.cls}">${st.label}</span></div>
      <div class="sub">${prettyDate(u.date, true)} · ${esc(u.time || '')}${u.note ? ' · ' + esc(u.note) : ''}</div></div>
      <button class="link c-red" data-action="delUric" data-id="${esc(u.id)}" aria-label="Hapus"><i class="fas fa-trash"></i></button></div>`;
  }).join('') : '<div class="empty">Belum ada data</div>';
}
function uricStatus(v) { v = num(v); return v < 6 ? { label: 'Terkontrol', cls: 'st-aman', color: 'var(--green)' } : v <= 7 ? { label: 'Waspada', cls: 'st-waspada', color: 'var(--orange)' } : { label: 'Tinggi', cls: 'st-berlebih', color: 'var(--red)' }; }
async function saveWeight() {
  const kg = num(String($('wKg').value).replace(',', '.'));
  if (kg < 20 || kg > 300) { banner('Berat belum diisi', 'Masukkan berat badan dalam kg.', 'fa-weight-scale', 'bg-orange'); $('wKg').focus(); return; }
  const date = $('wDate').value || today(), time = $('wTime').value || nowTime(), id = uid();
  const opt = k => { const v = num(String($(k).value).replace(',', '.')); return v > 0 ? v : null; };
  const w = { id, date, time, ts: toEpoch(date, time), kg, fat: opt('wFat'), visc: opt('wVisc'), muscle: opt('wMuscle'), waist: opt('wWaist'), note: $('wNote').value.trim() };
  dbSet('weights/' + id, w);
  ['wKg', 'wFat', 'wVisc', 'wMuscle', 'wWaist', 'wNote'].forEach(k => { $(k).value = ''; });
  $('wDate').value = today(); delete $('wTime').dataset.touched;
  renderBody(); banner('Berat badan tersimpan', `${fmt(kg, 1)} kg · ${relDay(date)} ${time}`, 'fa-check', 'bg-green');
  if (S.settings.autoAiWeight) aiWeight(id);
}
async function aiWeight(id) {
  const ws = sortedWeights(); if (!ws.length) return banner('Belum ada data', 'Simpan berat badan dulu.', 'fa-weight-scale', 'bg-orange');
  const target = id ? S.weights[id] : ws[ws.length - 1]; if (!target) return;
  $('weightAi').innerHTML = skeleton().replace('kalori, purin & lemak', 'tren berat badan');
  try {
    const r = await ai('weight', { text: target.note || '', context: profileCtx({
      targetBeratKg: num(S.settings.goalWeight) || null,
      riwayat: ws.slice(-40).map(w => ({ tgl: w.date, jam: w.time, kg: w.kg, lemakPersen: w.fat, visceral: w.visc, ototKg: w.muscle, pinggangCm: w.waist })),
      rataKaloriTerakhir7Hari: Math.round(rangeDays(7).map(d => totalsOn(d).kcal).filter(v => v > 0).reduce((s, v, _, a) => s + v / a.length, 0)),
      asamUratTerakhir: Object.values(S.uric || {}).sort((a, b) => num(b.ts) - num(a.ts)).slice(0, 3).map(u => ({ tgl: u.date, mgdl: u.value }))
    }) });
    dbSet('weights/' + target.id, { ...S.weights[target.id], ai: { ...r, at: Date.now() } }); renderBody();
  } catch (e) { $('weightAi').innerHTML = `<div class="alert-strip"><i class="fas fa-triangle-exclamation"></i><div>${esc(e.message)}</div></div>`; }
}
function saveUric() {
  const v = num(String($('uVal').value).replace(',', '.'));
  if (v <= 0 || v > 25) { banner('Kadar belum diisi', 'Masukkan kadar asam urat (mg/dL).', 'fa-vial', 'bg-orange'); $('uVal').focus(); return; }
  const date = $('uDate').value || today(), time = $('uTime').value || nowTime(), id = uid();
  dbSet('uric/' + id, { id, date, time, ts: toEpoch(date, time), value: v, note: $('uNote').value.trim() });
  $('uVal').value = ''; $('uNote').value = ''; delete $('uTime').dataset.touched;
  renderBody();
  const st = uricStatus(v);
  banner('Asam urat tersimpan', `${fmt(v, 1)} mg/dL · ${st.label}`, 'fa-vial', v < 6 ? 'bg-green' : v <= 7 ? 'bg-orange' : 'bg-red');
}

// ---------------- PANDUAN ----------------
const GUIDE = {
  aman: [
    ['Telur (rebus/kukus)', 'Protein tinggi, purin sangat rendah. Ideal untuk otot.'], ['Susu & yogurt rendah lemak', 'Terbukti membantu menurunkan asam urat.'],
    ['Tahu & tempe', 'Purin nabati, aman dalam porsi wajar (2–3 potong/makan).'], ['Nasi merah, oat, ubi, kentang rebus', 'Karbo kompleks, kenyang lebih lama.'],
    ['Sayur: wortel, timun, tomat, labu, sawi, brokoli, buncis', 'Serat tinggi, rendah kalori.'], ['Buah: ceri, jeruk, pepaya, apel, semangka, pisang', 'Ceri & vitamin C bantu turunkan asam urat.'],
    ['Air putih 2,5–3 L/hari', 'Membantu ginjal membuang asam urat.'], ['Kopi hitam / teh tawar', 'Kopi tanpa gula dikaitkan dengan asam urat lebih rendah.'],
    ['Kacang almond, kenari (segenggam)', 'Lemak sehat, purin rendah.'], ['Minyak zaitun / masak kukus, rebus, panggang', 'Kurangi lemak jenuh & gorengan.']
  ],
  batasi: [
    ['Dada ayam tanpa kulit', 'Purin sedang — maks ±100 g sekali makan.'], ['Ikan nila, kakap, tuna, salmon', 'Purin sedang — maks ±100 g, 1× sehari.'],
    ['Daging sapi tanpa lemak', 'Purin sedang & lemak jenuh — maks 2×/minggu.'], ['Udang & cumi', 'Purin sedang-tinggi — porsi kecil, jarang.'],
    ['Kacang-kacangan kering (kedelai, kacang merah)', 'Purin sedang — porsi kecil.'], ['Bayam, kangkung, asparagus, jamur, kembang kol', 'Purin sedang tapi aman dalam porsi wajar.'],
    ['Nasi putih, mie, roti putih', 'Untuk lemak visceral — porsi kecil (½–1 centong).'], ['Santan & masakan bersantan', 'Lemak jenuh tinggi — pilih kuah bening.'],
    ['Buah sangat manis: mangga matang, durian, nangka', 'Gula/fruktosa & lemak (durian) — 1 porsi kecil.'], ['Gorengan sesekali', 'Maks 1 potong, tiriskan minyak.']
  ],
  hindari: [
    ['Jeroan: hati, ampela, usus, babat, otak, paru', 'Purin sangat tinggi — pemicu serangan gout.'], ['Emping & melinjo', 'Purin sangat tinggi.'],
    ['Sarden, teri, ikan makarel, ikan asin', 'Purin sangat tinggi.'], ['Kerang, remis, tiram', 'Purin tinggi.'],
    ['Bebek, angsa, kambing berlemak', 'Purin & lemak jenuh tinggi.'], ['Kaldu kental, sop sumsum, ekstrak daging', 'Purin larut dalam kaldu.'],
    ['Minuman manis, soda, sirup, jus kemasan, boba', 'Fruktosa menaikkan asam urat & lemak perut.'], ['Alkohol (terutama bir)', 'Menghambat pembuangan asam urat.'],
    ['Daging olahan: sosis, kornet, nugget', 'Lemak jenuh, natrium & pengawet tinggi.'], ['Kulit ayam, lemak sapi, gajih', 'Lemak jenuh — memperburuk lemak visceral.'],
    ['Kue manis, martabak manis, donat', 'Gula + lemak trans — lemak visceral.']
  ]
};
function renderGuide() {
  $('guideSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === guideView));
  const q = normKey($('guideSearch').value);
  const icon = { aman: ['bg-green', 'fa-check'], batasi: ['bg-orange', 'fa-minus'], hindari: ['bg-red', 'fa-xmark'] }[guideView];
  const list = GUIDE[guideView].filter(([n, d]) => !q || normKey(n + ' ' + d).includes(q));
  $('guideList').innerHTML = list.length ? list.map(([n, d]) => `<div class="row"><span class="icon-tile ${icon[0]}"><i class="fas ${icon[1]}"></i></span><div class="grow"><div class="title" style="white-space:normal">${esc(n)}</div><div class="sub" style="white-space:normal">${esc(d)}</div></div></div>`).join('') : '<div class="empty">Tidak ditemukan. Coba “Cek Makanan” di atas.</div>';
  $('tipsCard').innerHTML = `<div class="b"><i class="fas fa-lightbulb c-orange"></i> Kunci untuk skinny fat + asam urat</div><ul>
    <li><b>Latihan beban 3×/minggu</b> — skinny fat butuh tambah otot, bukan sekadar turun berat.</li>
    <li>Protein ±1,6 g/kg berat badan dibagi rata tiap makan (telur, susu rendah lemak, tahu/tempe, ayam tanpa kulit).</li>
    <li>Defisit kalori ringan (300–500 kcal), jangan ekstrem — diet ketat & puasa panjang bisa memicu serangan gout.</li>
    <li>Jalan kaki 7.000–10.000 langkah/hari untuk membakar lemak visceral.</li>
    <li>Minum air 2,5–3 L, hindari fruktosa & alkohol, tidur 7–8 jam.</li></ul>`;
  $('askSuggest').innerHTML = suggestions($('askInput').value, 6).map(f => chip(f, 'askPick')).join('');
}
let askResult = null;
async function askAi() {
  const q = $('askInput').value.trim(); if (!q) return $('askInput').focus();
  $('askResult').innerHTML = skeleton();
  try {
    const r = await ai('ask', { text: q, context: profileCtx() });
    askResult = { q, r };
    $('askResult').innerHTML = analysisHtml(r, r.items || [], {}) + ((r.items || []).length ? `<button class="btn btn-tinted" data-action="logAsk"><i class="fas fa-plus"></i> Catat ke ${relDay(viewDate).toLowerCase()}</button>` : '');
  } catch (e) { $('askResult').innerHTML = `<div class="alert-strip"><i class="fas fa-triangle-exclamation"></i><div>${esc(e.message)}</div></div>`; }
}
function logAsk() {
  if (!askResult) return;
  openLog(); $('logText').value = askResult.q;
  draft.result = askResult.r; draft.items = (askResult.r.items || []).map(it => ({ ...it, q: 1 })); draft.source = 'text';
  renderLogResult();
}

// ---------------- PENGATURAN ----------------
function sNum(key, label, unit, step, hint) { return `<div class="srow"><div class="grow">${label}${hint ? `<div class="t-cap muted">${hint}</div>` : ''}</div><input type="number" inputmode="decimal" step="${step || 1}" data-set="${key}" value="${esc(S.settings[key])}"><span class="muted t-foot" style="min-width:34px">${unit || ''}</span></div>`; }
function sSwitch(key, label, hint) { return `<div class="srow"><div class="grow">${label}${hint ? `<div class="t-cap muted">${hint}</div>` : ''}</div><label class="switch"><input type="checkbox" data-set="${key}" ${S.settings[key] ? 'checked' : ''}><span></span></label></div>`; }
function renderSettings() {
  const s = S.settings, t = targets(), perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const hasKey = !!readLS(GEMINI_KEY_LS, '');
  const group = (h, rows, f) => `<div class="set-group"><div class="gh">${h}</div><div class="card list">${rows}</div>${f ? `<div class="gf">${f}</div>` : ''}</div>`;
  $('settingsBody').innerHTML = [
    group('Target harian', sNum('kcal', 'Kalori', 'kcal', 10) +
      `<div class="srow"><div class="grow">Protein<div class="t-cap muted">0 = otomatis ${fmt(s.proteinPerKg, 1)} g/kg → ${fmt(t.protein)} g</div></div><input type="number" data-set="protein" value="${esc(s.protein)}"><span class="muted t-foot" style="min-width:34px">g</span></div>` +
      sNum('purineMax', 'Purin maksimal', 'mg', 10, 'Diet rendah purin: ±400 mg/hari') + sNum('satFatPct', 'Lemak jenuh', '% kcal', 1, `= ${fmt(t.satFat)} g · AHA: 5–7% untuk lemak visceral`) +
      sNum('fatPct', 'Lemak total', '% kcal', 1, `= ${fmt(t.fat)} g`) + sNum('carbPct', 'Karbohidrat', '% kcal', 1, `= ${fmt(t.carbs)} g`) +
      sNum('sugarMax', 'Gula maksimal', 'g', 1) + sNum('fiberMin', 'Serat minimal', 'g', 1) + sNum('sodiumMax', 'Natrium maksimal', 'mg', 50) + sNum('waterGoal', 'Air putih', 'gelas', 1, '1 gelas = 250 ml'),
      'Ubah angka lalu tutup — tersimpan otomatis & tersinkron ke semua perangkat.'),
    group('Profil', sNum('height', 'Tinggi badan', 'cm', 1) + sNum('age', 'Usia', 'th', 1) +
      `<div class="srow"><div class="grow">Jenis kelamin</div><select data-set="sex"><option value="m" ${s.sex !== 'f' ? 'selected' : ''}>Laki-laki</option><option value="f" ${s.sex === 'f' ? 'selected' : ''}>Perempuan</option></select></div>` +
      `<div class="srow"><div class="grow">Aktivitas</div><select data-set="activity">${[[1.2, 'Jarang gerak'], [1.375, 'Ringan (1–3×/mgg)'], [1.55, 'Sedang (3–5×/mgg)'], [1.725, 'Aktif']].map(([v, l]) => `<option value="${v}" ${num(s.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
      sNum('goalWeight', 'Target berat', 'kg', 0.1) +
      `<button class="srow c-blue" data-action="autoKcal" style="width:100%"><i class="fas fa-calculator"></i><div class="grow" style="text-align:left">Hitung target kalori otomatis</div></button>`,
      'Rumus Mifflin-St Jeor × aktivitas − 400 kcal (defisit ringan, aman untuk asam urat).'),
    group('Pengingat', sSwitch('notifyOver', 'Peringatan saat berlebih', 'Alert + notifikasi saat melewati batas') +
      `<div class="srow"><div class="grow">Peringatan “hampir batas” di</div><select data-set="warnAt">${[80, 90, 95].map(v => `<option value="${v}" ${num(s.warnAt) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></div>` +
      sSwitch('mealRemind', 'Pengingat jam makan', 'Jika belum mencatat (saat web terbuka)') +
      CATS.filter(c => c.k !== 'camilan').map(c => `<div class="srow"><div class="grow">${c.label}</div><input type="time" data-time="${c.k}" value="${esc(s.remindTimes[c.k])}"></div>`).join('') +
      `<button class="srow" data-action="askNotif" style="width:100%"><i class="fas fa-bell c-blue"></i><div class="grow" style="text-align:left">Izin notifikasi</div><span class="muted t-foot">${{ granted: 'Diizinkan', denied: 'Ditolak', default: 'Tap untuk izinkan', unsupported: 'Tidak didukung' }[perm]}</span></button>`,
      'Di iPhone: buka dari ikon di Layar Utama (Share → Tambah ke Layar Utama) agar notifikasi bisa muncul.'),
    group('AI (Gemini)',
      `<div class="srow"><i class="fas fa-server ${serverGemini ? 'c-green' : 'muted'}"></i><div class="grow">Server Cloudflare<div class="t-cap muted">${serverGemini ? 'Aktif — kunci aman di server' : 'Belum aktif: isi Secret GEMINI_API_KEY di Cloudflare'}</div></div></div>` +
      `<div class="srow"><div class="grow">Kunci cadangan di perangkat ini<div class="t-cap muted">${hasKey ? 'Tersimpan (hanya di perangkat ini)' : 'Opsional, dipakai jika server belum aktif'}</div></div><input type="password" id="geminiKeyInput" placeholder="${hasKey ? '••••••••' : 'AIza…'}" autocomplete="off"></div>` +
      `<div class="srow"><div class="grow">Model</div><input type="text" data-set="aiModel" placeholder="otomatis" value="${esc(s.aiModel)}"></div>` +
      sSwitch('savePhotos', 'Simpan foto makanan ke cloud', 'Cloudflare R2 (10 GB gratis). Thumbnail kecil tetap di Firebase.') +
      sSwitch('autoAiWeight', 'Analisis AI otomatis setelah timbang'),
      'Kunci gratis: aistudio.google.com/apikey. Foto dari kamera di sini tidak disimpan ke galeri HP.'),
    group('Penyimpanan',
      `<div class="srow"><i class="fas fa-database c-orange"></i><div class="grow">Firebase · node hadzmi_healthcare_data<div class="t-cap muted">${{ on: '● Tersinkron realtime', off: 'Offline — akan sinkron otomatis', err: 'Ditolak Rules — tambahkan hadzmi_healthcare_data', local: 'Mode lokal' }[syncMode]}${Object.keys(pending).length ? ` · ${Object.keys(pending).length} menunggu` : ''}</div></div></div>` +
      `<div class="srow"><i class="fas fa-cloud c-blue"></i><div class="grow">Cloudflare R2<div class="t-cap muted">Foto makanan (sama dengan Galeri Assistant)</div></div></div>` +
      `<div class="srow"><i class="fas fa-file-lines c-gray"></i><div class="grow">Data tercatat<div class="t-cap muted">${Object.keys(S.meals).length} makanan · ${Object.keys(S.weights).length} timbang · ${Object.keys(S.uric).length} asam urat · ${Object.keys(S.foods).length} kamus</div></div></div>` +
      `<button class="srow c-blue" data-action="exportData" style="width:100%"><i class="fas fa-download"></i><div class="grow" style="text-align:left">Ekspor data (JSON)</div></button>` +
      `<button class="srow c-red" data-action="clearDict" style="width:100%"><i class="fas fa-eraser"></i><div class="grow" style="text-align:left">Hapus kamus auto-suggest</div></button>`),
    group('Akun', `<a class="srow" href="../" style="width:100%"><i class="fas fa-house c-blue"></i><div class="grow">Buka Hadzmi Assistant</div><i class="fas fa-chevron-right chev muted"></i></a>` +
      `<button class="srow c-red" data-action="lockNow" style="width:100%"><i class="fas fa-lock"></i><div class="grow" style="text-align:left">Kunci sekarang</div></button>`)
  ].join('');
}
function onSettingChange(e) {
  const el = e.target;
  if (el.id === 'geminiKeyInput') { const v = el.value.trim(); if (v) { writeLS(GEMINI_KEY_LS, v); el.value = ''; banner('Kunci Gemini tersimpan', 'Hanya di perangkat ini.', 'fa-key', 'bg-green'); renderSettings(); } return; }
  if (el.dataset.time) { S.settings.remindTimes = { ...S.settings.remindTimes, [el.dataset.time]: el.value }; dbSet('settings', S.settings); return; }
  const key = el.dataset.set; if (!key) return;
  let v = el.type === 'checkbox' ? el.checked : el.type === 'number' || key === 'warnAt' || key === 'activity' ? num(el.value) : el.value.trim();
  if (key === 'kcal' && v < 800) v = 800;
  S.settings[key] = v; dbSet('settings', S.settings);
  if (key === 'mealRemind' && v) askNotif();
  renderToday();
}
function autoKcal() {
  const s = S.settings, w = latestWeight();
  if (!w) return iosAlert('Butuh berat badan', 'Catat berat badan dulu di tab Tubuh.', [{ label: 'OK', bold: true }]);
  const bmr = 10 * num(w.kg) + 6.25 * num(s.height) - 5 * num(s.age) + (s.sex === 'f' ? -161 : 5);
  const k = Math.max(s.sex === 'f' ? 1300 : 1500, Math.round((bmr * (num(s.activity) || 1.375) - 400) / 10) * 10);
  S.settings.kcal = k; dbSet('settings', S.settings); renderSettings(); renderToday();
  banner('Target kalori diperbarui', `${fmt(k)} kcal/hari (BMR ${fmt(bmr)})`, 'fa-calculator', 'bg-blue');
}
async function askNotif() {
  if (!('Notification' in window)) return banner('Tidak didukung', 'Browser ini tidak mendukung notifikasi. Di iPhone, tambahkan ke Layar Utama dulu.', 'fa-bell-slash', 'bg-gray');
  const p = await Notification.requestPermission(); renderSettings();
  if (p === 'granted') sysNotify('Notifikasi aktif ✅', 'Hadzmi Healthcare akan mengingatkan saat berlebih.', 'healthcare-test');
}
async function sysNotify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration('/').catch(() => null);
    const opt = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/healthcare/' } };
    if (reg && reg.showNotification) await reg.showNotification(title, opt); else new Notification(title, opt);
  } catch (e) { console.warn('notify', e); }
}
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `hadzmi-healthcare-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function lockNow() {
  const ok = await iosAlert('Kunci sekarang?', 'Hadzmi Assistant di perangkat ini juga ikut terkunci.', [{ label: 'Batal' }, { label: 'Kunci', danger: true, value: true }]);
  if (!ok) return;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  closeSheet(); started = false; detachDb(); authed = false;
  if (auth) auth.signOut().catch(() => {});
  showLock();
}

// Pengingat jam makan (saat halaman terbuka)
function remindTick() {
  if (!started) return;
  const t = today();
  if (followToday && viewDate !== t) { viewDate = t; renderAll(); }
  if (!S.settings.mealRemind) return;
  const now = nowTime(), meals = mealsOn(t);
  ['sarapan', 'siang', 'malam'].forEach(c => {
    const at = S.settings.remindTimes[c]; if (!at) return;
    const [h, m] = at.split(':').map(Number), [nh, nm] = now.split(':').map(Number), diff = (nh * 60 + nm) - (h * 60 + m);
    const flag = 'healthcare_rem_' + t + c;
    if (diff >= 0 && diff < 120 && !meals.some(x => x.cat === c) && !readLS(flag, false)) {
      writeLS(flag, true);
      banner(`Sudah ${CAT[c].label.toLowerCase()}?`, 'Jangan lupa catat makananmu.', 'fa-utensils', CAT[c].color);
      sysNotify(`Catat ${CAT[c].label.toLowerCase()}`, `Belum ada catatan ${CAT[c].label.toLowerCase()} hari ini.`, flag);
    }
  });
}

// ---------------- UI PRIMITIVES ----------------
let bannerTimer = null;
function banner(title, msg, icon, color) {
  const b = $('banner');
  b.innerHTML = `<span class="icon-tile ${color || 'bg-blue'}"><i class="fas ${icon || 'fa-bell'}"></i></span><div style="min-width:0"><div class="bt">${esc(title)}</div><div class="muted">${esc(msg || '')}</div></div>`;
  b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 3200);
}
function iosAlert(title, msg, buttons) {
  return new Promise(resolve => {
    $('alertTitle').textContent = title; $('alertMsg').innerHTML = esc(msg).replace(/\n/g, '<br>');
    $('alertBtns').innerHTML = buttons.map((b, i) => `<button data-i="${i}" class="${b.bold ? 'bold' : ''} ${b.danger ? 'danger bold' : ''}">${esc(b.label)}</button>`).join('');
    $('alertWrap').classList.remove('hidden');
    $('alertBtns').onclick = e => { const btn = e.target.closest('button'); if (!btn) return; $('alertWrap').classList.add('hidden'); resolve(buttons[+btn.dataset.i].value); };
  });
}
let openSheetId = null;
function openSheet(id) { openSheetId = id; const el = $(id); el.classList.remove('hidden', 'closing'); el.querySelector('.sheet-body').scrollTop = 0; document.body.style.overflow = 'hidden'; }
function closeSheet() {
  const id = openSheetId; if (!id) return; openSheetId = null;
  const el = $(id); el.classList.add('closing'); document.body.style.overflow = '';
  setTimeout(() => { el.classList.add('hidden'); el.classList.remove('closing'); }, 260);
  if (id === 'sheetLog') stopCamera();
}
function switchTab(tab) {
  currentTab = tab; hideTip();
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + tab));
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('navTitle').textContent = { today: 'Hari Ini', progress: 'Progres', body: 'Tubuh', guide: 'Panduan' }[tab];
  window.scrollTo({ top: 0 });
  renderAll();
}
function setViewDate(d) { if (!d) return; viewDate = d > today() ? today() : d; followToday = viewDate === today(); renderToday(); }

// ---------------- EVENT BINDING ----------------
const ACTIONS = {
  openLog: el => openLog(el.dataset.cat), openSettings: () => { renderSettings(); openSheet('sheetSettings'); }, closeSheet,
  tab: el => switchTab(el.dataset.tab), dayShift: el => setViewDate(addDays(viewDate, +el.dataset.n)),
  water: el => { const v = Math.max(0, num(S.water[viewDate]) + +el.dataset.n); dbSet('water/' + viewDate, v || null); haptic(6); renderToday(); },
  openCamera, closeCamera: stopCamera, flipCamera, shoot, pickPhoto: () => $('fileInput').click(), clearPhoto: () => { clearPhoto(); draft.result = null; $('logResult').innerHTML = ''; setSaveEnabled(false); },
  analyze: () => analyze(), analyzeAi: () => analyze(true), saveMeal, pickSuggest: el => pickSuggest(el.dataset.key),
  qty: el => { const list = openSheetId === 'sheetMeal' ? mealEdit.items : draft.items; list[+el.dataset.i].q = +el.dataset.q; haptic(5); openSheetId === 'sheetMeal' ? renderMealDetail() : renderLogResult(); },
  delItem: el => { const list = openSheetId === 'sheetMeal' ? mealEdit.items : draft.items; list.splice(+el.dataset.i, 1); openSheetId === 'sheetMeal' ? renderMealDetail() : list.length ? renderLogResult() : ($('logResult').innerHTML = '', setSaveEnabled(false)); },
  openMeal: el => openMeal(el.dataset.id), deleteMeal, saveMealEdit, reanalyzeMeal,
  aiDay, aiPeriod, gotoDay: el => { setViewDate(el.dataset.date); switchTab('today'); },
  saveWeight, saveUric, aiWeight: () => aiWeight(),
  delWeight: async el => { if (await iosAlert('Hapus data timbang?', '', [{ label: 'Batal' }, { label: 'Hapus', danger: true, value: true }])) { dbSet('weights/' + el.dataset.id, null); renderBody(); } },
  delUric: async el => { if (await iosAlert('Hapus data asam urat?', '', [{ label: 'Batal' }, { label: 'Hapus', danger: true, value: true }])) { dbSet('uric/' + el.dataset.id, null); renderBody(); } },
  askAi, askPick: el => { $('askInput').value = S.foods[el.dataset.key] ? S.foods[el.dataset.key].name : ''; askAi(); }, logAsk,
  autoKcal, askNotif, exportData, lockNow,
  clearDict: async () => { if (await iosAlert('Hapus kamus auto-suggest?', 'Riwayat makanan tetap ada.', [{ label: 'Batal' }, { label: 'Hapus', danger: true, value: true }])) { dbSet('foods', {}); renderSettings(); } },
  explainSync: () => iosAlert('Status sinkron', { on: 'Tersambung ke Firebase. Data tersinkron realtime ke semua perangkat.', off: 'Sedang offline. Data disimpan di perangkat dan dikirim otomatis saat online.', err: 'Firebase menolak akses ke node hadzmi_healthcare_data. Tempel ulang isi database.rules.json (sudah diperbarui) ke Firebase Console → Realtime Database → Rules, lalu Publish. Sementara itu data tersimpan di perangkat ini.', local: 'Firebase tidak termuat. Data hanya di perangkat ini.' }[syncMode] || '', [{ label: 'OK', bold: true }])
};
function bindUI() {
  document.addEventListener('click', e => {
    const tt = e.target.closest('.chart .hit'); if (tt) { showTip(tt); return; } else hideTip();
    const tabBtn = e.target.closest('#tabbar [data-tab]'); if (tabBtn) { switchTab(tabBtn.dataset.tab); haptic(4); return; }
    const a = e.target.closest('[data-action]');
    if (a && ACTIONS[a.dataset.action]) { e.preventDefault(); ACTIONS[a.dataset.action](a, e); return; }
    const cat = e.target.closest('#catSeg [data-cat]'); if (cat) { draft.cat = cat.dataset.cat; renderCatSeg(); if (draft.result) renderLogResult(); return; }
    const mcat = e.target.closest('#mealCatSeg [data-mcat]'); if (mcat) { mealEdit.cat = mcat.dataset.mcat; renderMealDetail(); return; }
    const rg = e.target.closest('#rangeSeg [data-range]'); if (rg) { range = +rg.dataset.range; $('rangeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === rg)); renderProgress(); return; }
    const bs = e.target.closest('#bodySeg [data-body]'); if (bs) { bodyView = bs.dataset.body; renderBody(); return; }
    const gs = e.target.closest('#guideSeg [data-g]'); if (gs) { guideView = gs.dataset.g; renderGuide(); return; }
    if (e.target.classList.contains('backdrop')) closeSheet();
  });
  document.addEventListener('mouseover', e => { const tt = e.target.closest('.chart .hit'); if (tt) showTip(tt); });
  document.addEventListener('mouseout', e => { if (e.target.closest('.chart .hit')) hideTip(); });
  window.addEventListener('scroll', () => { $('nav').classList.toggle('scrolled', window.scrollY > 40); hideTip(); }, { passive: true });
  $('pinPad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pinKey(b.dataset.del ? 'del' : b.dataset.d); });
  document.addEventListener('keydown', e => {
    if (!$('lock').classList.contains('hidden')) { if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('del'); return; }
    if (e.key === 'Escape') { if (!$('camera').classList.contains('hidden')) stopCamera(); else closeSheet(); }
  });
  $('dayPicker').addEventListener('change', e => setViewDate(e.target.value));
  $('fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('camInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('logText').addEventListener('input', () => { renderSuggest(); const t = $('logText'); t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; });
  $('logText').addEventListener('focus', renderSuggest);
  $('logText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyze(); } });
  $('askInput').addEventListener('input', () => { $('askSuggest').innerHTML = suggestions($('askInput').value, 6).map(f => chip(f, 'askPick')).join(''); });
  $('askInput').addEventListener('keydown', e => { if (e.key === 'Enter') askAi(); });
  $('guideSearch').addEventListener('input', renderGuide);
  ['wTime', 'uTime'].forEach(id => $(id).addEventListener('input', e => { e.target.dataset.touched = '1'; }));
  $('settingsBody').addEventListener('change', onSettingChange);
  // Geser ke bawah untuk menutup sheet
  document.querySelectorAll('.sheet').forEach(sh => {
    let y0 = null, dy = 0;
    const head = sh.querySelectorAll('.grabber, .sheet-head');
    head.forEach(h => {
      h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
      h.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
      h.addEventListener('touchend', () => { sh.style.transition = ''; sh.style.transform = ''; if (dy > 110) closeSheet(); y0 = null; });
    });
  });
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (currentTab === 'progress') renderProgress(); if (currentTab === 'body') renderBody(); }, 200); });
  window.addEventListener('online', () => { if (syncMode === 'off') flushPending(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) remindTick(); });
  setInterval(remindTick, 60000);
}

boot();
