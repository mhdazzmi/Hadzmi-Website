/* STARDOM — core: auth, API client, router, UI primitives */
const firebaseConfig = {
  apiKey: 'AIzaSyBoTr_A9JQsRTHri47o0ZPIQH21SxlBjh0',
  authDomain: 'web-hadzmi-new.firebaseapp.com',
  projectId: 'web-hadzmi-new',
  appId: '1:664176294351:web:5706e50b47d9cec546baba',
};
export const OWNER_EMAIL = 'hadzmi-hub@example.com'; // same owner login as Nexa (PIN)
export const PIN_LEN = 8;
const SESSION_KEY = 'hz_session';
const WIB = 7 * 3600 * 1000;
export const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('dev');

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const S = { owner: null, counts: { notifications: 0, messages: 0 }, meta: {}, lastSync: 0 };
const readLS = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
export const store = { get: readLS, set: writeLS };

// ---------------- Auth ----------------
let auth = null;
export function initAuth(onIn, onOut) {
  if (DEV) { onIn(); return; }
  try { if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); auth = firebase.auth(); }
  catch (e) { onOut('Could not load sign-in. Check your connection and reload.'); return; }
  auth.onAuthStateChanged(u => { if (u && sessionValid(u)) onIn(); else onOut(); });
  setInterval(() => { if (auth && auth.currentUser && !sessionValid(auth.currentUser)) { auth.signOut(); onOut('Session ended at 00:00 WIB. Enter your PIN again.'); } }, 30000);
}
function sessionValid(user) { const r = readLS(SESSION_KEY, null); return !!(r && r.expiresAt && Date.now() < r.expiresAt && (!user || !r.uid || r.uid === user.uid)); }
function nextMidnight() { const n = Date.now() + WIB; return Math.floor(n / 86400000) * 86400000 + 86400000 - WIB; }
export async function signIn(pin) {
  if (!auth) throw new Error('Sign-in is not ready yet');
  const cred = await auth.signInWithEmailAndPassword(OWNER_EMAIL, pin);
  writeLS(SESSION_KEY, { uid: cred.user.uid, email: OWNER_EMAIL, loginAt: Date.now(), expiresAt: nextMidnight() });
}
export function signOut() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} if (auth) auth.signOut(); location.hash = ''; location.reload(); }
async function token() { if (DEV) return 'dev'; if (!auth || !auth.currentUser) throw new Error('Not signed in'); return auth.currentUser.getIdToken(); }

// ---------------- API ----------------
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/stardom' + path, {
    method, headers: Object.assign({ Authorization: 'Bearer ' + await token() }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Request failed (' + res.status + ')'); e.status = res.status; throw e; }
  return data;
}
export async function upload(blob, onProgress) {
  const t = await token();
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/stardom/upload');
    x.setRequestHeader('Authorization', 'Bearer ' + t);
    x.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) {} x.status < 300 ? resolve(d) : reject(new Error(d.error || 'Upload failed (' + x.status + ')')); };
    x.onerror = () => reject(new Error('Network error while uploading'));
    x.send(blob);
  });
}

// ---------------- Formatting ----------------
export function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-US');
}
export function timeAgo(t, long) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return long ? 'Just now' : 'now';
  const u = [[31536000, 'y', 'year'], [604800, 'w', 'week'], [86400, 'd', 'day'], [3600, 'h', 'hour'], [60, 'm', 'minute']];
  for (const [n, a, b] of u) if (s >= n) { const v = Math.floor(s / n); return long ? `${v} ${b}${v > 1 ? 's' : ''} ago` : v + a; }
}
export const clock = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
export const dateLabel = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
export function activeLabel(t) { if (!t) return ''; const m = (Date.now() - t) / 60000; return m < 6 ? 'Active now' : 'Active ' + timeAgo(t) + ' ago'; }

// ---------------- Icons (line set) ----------------
const P = {
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7V20a.5.5 0 0 1-.5.5h-5.5v-6h-5v6H4a.5.5 0 0 1-.5-.5z"/>',
  homeFill: '<path fill="currentColor" d="M3.5 10.2 12 3.5l8.5 6.7V20a.5.5 0 0 1-.5.5h-5.5v-6h-5v6H4a.5.5 0 0 1-.5-.5z"/>',
  search: '<circle cx="10.8" cy="10.8" r="7"/><path d="m21 21-5.2-5.2"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><path d="M12 7.5v9M7.5 12h9"/>',
  heart: '<path d="M12 20.3s-7.6-4.5-9.3-9.2C1.5 7.8 3.5 4.4 7 4.4c2.1 0 3.7 1.2 5 3.1 1.3-1.9 2.9-3.1 5-3.1 3.5 0 5.5 3.4 4.3 6.7-1.7 4.7-9.3 9.2-9.3 9.2z"/>',
  heartFill: '<path fill="currentColor" d="M12 20.3s-7.6-4.5-9.3-9.2C1.5 7.8 3.5 4.4 7 4.4c2.1 0 3.7 1.2 5 3.1 1.3-1.9 2.9-3.1 5-3.1 3.5 0 5.5 3.4 4.3 6.7-1.7 4.7-9.3 9.2-9.3 9.2z"/>',
  user: '<circle cx="12" cy="8" r="4.2"/><path d="M3.8 21c1.3-4 4.4-6.2 8.2-6.2s6.9 2.2 8.2 6.2"/>',
  send: '<path d="M21.5 3 10.2 13.8M21.5 3l-7 18-4.3-7.2L3 9.5z"/>',
  comment: '<path d="M20.7 12a8.6 8.6 0 0 1-12.6 7.6L3 21l1.5-4.8A8.6 8.6 0 1 1 20.7 12z"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4.6-6 4.6z"/>',
  bookmarkFill: '<path fill="currentColor" d="M6 3.5h12v17l-6-4.6-6 4.6z"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  reels: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><path d="M3 8.5h18M8 3.2l3 5.3M14 3.2l3 5.3"/><path d="M10 12v5.2l4.4-2.6z"/>',
  back: '<path d="m15 18.5-6.5-6.5L15 5.5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2h5.8l1.6 2h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.5" r="3.8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="9" r="1.8"/><path d="m21 15.5-5.2-5.2L5 21"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M2.5 20.5h19"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sparkle: '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 2L12 18.5l-1.9-5.6-5.6-2L10.1 9z"/><path d="M19 3v3M17.5 4.5h3"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v7.5h14V12"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  tag: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="12" cy="10" r="3"/><path d="M6.5 20c1-2.6 3-4 5.5-4s4.5 1.4 5.5 4"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  archive: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5s-1.1 6.1-3.6 8.5c-2.5-2.4-3.6-5.2-3.6-8.5S9.5 5.9 12 3.5z"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.9-3.4 3.4-5.4 6.5-5.4s5.6 2 6.5 5.4"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><circle cx="9" cy="10" r=".8" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  text: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10.5 5-3v9l-5-3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3.5 9M4 13a8 8 0 0 0 14.6 4.5l1.9-2.5"/><path d="M3.5 4.5V9H8M20.5 19.5V15H16"/>',
  logout: '<path d="M15 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H15M10 16.5 14.5 12 10 7.5M14.5 12H4"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.5-5.1-2.7-5 2.7.9-5.5-4-4 5.6-.8z"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
export const verifiedBadge = () => `<svg class="vbadge" viewBox="0 0 24 24" aria-label="Verified"><path fill="#1d6ff2" d="M12 1.8l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22.2l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z"/><path d="m8 12.3 2.7 2.7L16.2 9.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const aiBadge = (long) => `<span class="aib" title="Virtual AI persona — simulated account">${long ? 'AI persona' : 'AI'}</span>`;

// ---------------- Components ----------------
export function avatar(a, size = 32, { ring = null, cls = '' } = {}) {
  const src = a && a.avatar ? esc(a.avatar) : '';
  const initials = esc(((a && (a.display_name || a.username)) || '?').trim().slice(0, 1).toUpperCase());
  const img = src ? `<img src="${src}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'av-fb',textContent:'${initials}'}))">` : `<span class="av-fb">${initials}</span>`;
  return `<span class="av ${ring ? 'ring ring-' + ring : ''} ${cls}" style="--s:${size}px">${img}</span>`;
}
export function uname(a, { badge = true, link = true } = {}) {
  if (!a) return '<b>unknown</b>';
  const inner = `<b>${esc(a.username)}</b>${a.verified ? verifiedBadge() : ''}${badge && a.virtual ? aiBadge() : ''}`;
  return link ? `<a class="un" href="#/u/${encodeURIComponent(a.username)}">${inner}</a>` : `<span class="un">${inner}</span>`;
}
export function richText(text) {
  return esc(text).replace(/(^|[\s(])#([\p{L}\p{N}_]{2,40})/gu, '$1<a class="tagl" href="#/tag/$2">#$2</a>')
    .replace(/(^|[\s(])@([A-Za-z0-9._]{2,30})/g, '$1<a class="tagl" href="#/u/$2">@$2</a>').replace(/\n/g, '<br>');
}
export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 2600);
}
export function haptic(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

const openSheets = new Set();
export function closeAllSheets() { for (const c of [...openSheets]) c(); }
/** Bottom sheet (mobile) / centered dialog (desktop). Returns { el, close }. */
export function sheet({ title = '', html = '', full = false, cls = '', onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${full ? 'full' : ''} ${cls}" role="dialog" aria-modal="true"><div class="grab"></div>${title ? `<div class="sheet-h"><span>${esc(title)}</span><button class="ib sheet-x" aria-label="Close">${icon('close')}</button></div>` : ''}<div class="sheet-b">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => wrap.classList.add('in'));
  let closed = false;
  const close = () => { if (closed) return; closed = true; openSheets.delete(close); wrap.classList.remove('in'); setTimeout(() => { wrap.remove(); if (!$('.sheet-wrap') && !$('.story-viewer')) document.body.classList.remove('noscroll'); }, 260); onClose && onClose(); };
  openSheets.add(close);
  wrap.querySelector('.sheet-bg').onclick = close;
  const x = wrap.querySelector('.sheet-x'); if (x) x.onclick = close;
  // drag down to dismiss
  const sh = wrap.querySelector('.sheet'), grab = wrap.querySelector('.grab');
  let y0 = null;
  const start = e => { if (sh.querySelector('.sheet-b').scrollTop > 0 && e.target !== grab) return; y0 = e.touches[0].clientY; };
  sh.addEventListener('touchstart', start, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; sh.style.transform = ''; if (dy > 110) close(); });
  return { el: wrap.querySelector('.sheet'), body: wrap.querySelector('.sheet-b'), close };
}
export function actionSheet(items) {
  return new Promise(resolve => {
    const s = sheet({ html: `<div class="as">${items.map((it, i) => `<button class="as-i ${it.danger ? 'danger' : ''}" data-i="${i}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}<button class="as-i cancel" data-i="-1"><span>Cancel</span></button></div>`, onClose: () => resolve(null) });
    s.body.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const i = +b.dataset.i; s.close(); resolve(i >= 0 ? items[i].value ?? i : null); });
  });
}
export function confirmBox(title, msg, ok = 'OK', danger = false) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    wrap.innerHTML = `<div class="alert"><div class="alert-t">${esc(title)}</div>${msg ? `<div class="alert-m">${esc(msg)}</div>` : ''}<div class="alert-b"><button data-v="0">Cancel</button><button data-v="1" class="${danger ? 'danger' : 'strong'}">${esc(ok)}</button></div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    wrap.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b && e.target !== wrap) return; wrap.remove(); resolve(!!(b && b.dataset.v === '1')); });
  });
}

// ---------------- Delegated actions ----------------
export const actions = {};
export const act = (name, fn) => { actions[name] = fn; };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  e.preventDefault();
  Promise.resolve(actions[el.dataset.act](el, e)).catch(err => toast(err.message || 'Something went wrong', 'err'));
});

// ---------------- Router ----------------
const routes = [];
export const route = (pattern, render, opts = {}) => routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), render, opts });
export function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
export function back(fallback = '#/') { if (history.length > 1 && S.navCount > 0) history.back(); else go(fallback); }
export function matchRoute(hash) {
  const path = (hash || '#/').replace(/^#/, '').split('?')[0] || '/';
  for (const r of routes) { const m = r.re.exec(path); if (m) return { r, params: m.slice(1).map(decodeURIComponent), query: new URLSearchParams((hash.split('?')[1]) || '') }; }
  return null;
}
export function setBadge() {
  for (const el of $$('[data-badge="notifications"]')) { el.classList.toggle('on', S.counts.notifications > 0); }
  for (const el of $$('[data-badge="messages"]')) { el.textContent = S.counts.messages > 9 ? '9+' : S.counts.messages; el.classList.toggle('on', S.counts.messages > 0); }
}
export const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="skel"><div class="skel-h"><span class="skel-c"></span><span class="skel-l"></span></div><div class="skel-m"></div></div>').join('');
export const empty = (ic, title, sub = '', extra = '') => `<div class="empty">${icon(ic, 'big')}<div class="empty-t">${esc(title)}</div>${sub ? `<div class="empty-s">${esc(sub)}</div>` : ''}${extra}</div>`;
export function topbar({ title = '', back: b = false, left = '', right = '', cls = '' } = {}) {
  return `<header class="topbar ${cls}">${b ? `<button class="ib" data-act="back" aria-label="Back">${icon('back')}</button>` : left}<div class="tb-title">${title}</div><div class="tb-r">${right}</div></header>`;
}
act('back', () => back());
