/* Nexo Games — inti: state, koneksi realtime, router layar, komponen UI ala iOS */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
export { LS };

// ---------- State ----------
export const S = {
  token: LS.get('nexo.token', null), me: null, users: {}, online: new Set(), convs: {}, games: {}, settings: {}, vapid: null,
  msgs: {}, typing: {}, game: null, connected: false, serverSkew: 0
};
export const user = id => S.users[id] || { id, name: id === 'sys' ? 'Nexo' : 'Teman', avatar: { emoji: '👤', color: '#8E8E93' } };

// ---------- Event bus ----------
const handlers = {};
export function on(t, fn) { (handlers[t] = handlers[t] || []).push(fn); }
export function emit(t, data) { (handlers[t] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(t, e); } }); }

// ---------- HTTP ----------
export async function api(path, body, method) {
  const headers = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (body !== undefined && !(body instanceof Blob)) headers['Content-Type'] = 'application/json';
  if (body instanceof Blob) headers['Content-Type'] = body.type || 'image/jpeg';
  const res = await fetch(path, { method: method || (body !== undefined ? 'POST' : 'GET'), headers, body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body), cache: 'no-store' });
  let data = null; try { data = await res.json(); } catch (e) {}
  if (!res.ok) { const err = new Error((data && data.error) || `Gagal (${res.status})`); err.status = res.status; throw err; }
  return data;
}

// ---------- WebSocket ----------
let sock = null, seq = 0, backoff = 600, want = false, pingT = null, everOpened = false, failCount = 0, reconnectT = null;
const waits = new Map();
let openWaiters = [];
export function connect() { want = true; openSock(); }
export function disconnect() { want = false; clearTimeout(reconnectT); if (sock) try { sock.close(); } catch (e) {} sock = null; }
function openSock() {
  if (!want || !S.token) return;
  if (sock && (sock.readyState === 0 || sock.readyState === 1)) return;
  clearTimeout(reconnectT);
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/nexo/ws?t=${encodeURIComponent(S.token)}`;
  let opened = false;
  const s = sock = new WebSocket(url);
  s.onopen = () => {
    opened = true; everOpened = true; backoff = 600; failCount = 0;
    clearInterval(pingT); pingT = setInterval(() => { try { s.readyState === 1 && s.send('ping'); } catch (e) {} }, 25000);
  };
  s.onmessage = e => {
    if (e.data === 'pong') return;
    let m; try { m = JSON.parse(e.data); } catch (er) { return; }
    if (m.re) { const w = waits.get(m.re); if (w) { waits.delete(m.re); clearTimeout(w.t); m.ok ? w.res(m.data) : w.rej(new Error(m.error || 'Gagal')); } return; }
    if (m.t === 'init') {
      S.connected = true; setConn(true);
      openWaiters.forEach(f => f()); openWaiters = [];
    }
    emit(m.t, m);
  };
  s.onclose = async ev => {
    clearInterval(pingT);
    if (sock !== s) return;
    S.connected = false; setConn(false);
    for (const [id, w] of waits) { clearTimeout(w.t); w.rej(new Error('Koneksi terputus')); waits.delete(id); }
    if (ev.code === 4001) { emit('logout', { reason: 'Akunmu tidak ditemukan.' }); return; }
    if (!opened) {
      failCount++;
      if (failCount >= 2) {
        try { await api('/api/nexo/me'); } catch (e) { if (e.status === 401) { emit('logout', { reason: e.message }); return; } }
      }
    }
    if (want) { reconnectT = setTimeout(openSock, backoff); backoff = Math.min(backoff * 1.8, 10000); }
  };
}
function whenOpen(ms) {
  if (sock && sock.readyState === 1 && S.connected) return Promise.resolve();
  openSock();
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('Tidak ada koneksi. Coba lagi.')), ms); openWaiters.push(() => { clearTimeout(t); res(); }); });
}
export async function call(t, data = {}, timeout = 15000) {
  await whenOpen(timeout);
  const id = ++seq;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => { waits.delete(id); rej(new Error('Server tidak merespons.')); }, timeout);
    waits.set(id, { res, rej, t: timer });
    sock.send(JSON.stringify(Object.assign({}, data, { rid: id, t })));
  });
}
export function fire(t, data = {}) { try { if (sock && sock.readyState === 1) sock.send(JSON.stringify(Object.assign({ t }, data))); } catch (e) {} }
let connT = null;
function setConn(ok) {
  const el = $('#conn'); if (!el) return;
  clearTimeout(connT);
  if (ok) { el.classList.remove('on'); return; }
  connT = setTimeout(() => { if (!S.connected && want) el.classList.add('on'); }, 1800);
}
document.addEventListener('visibilitychange', () => {
  const vis = document.visibilityState === 'visible';
  if (vis && want && (!sock || sock.readyState > 1)) { backoff = 600; openSock(); }
  sendVis();
});
window.addEventListener('online', () => { if (want) { backoff = 600; openSock(); } });
let curView = '';
export function setView(v) { curView = v; sendVis(); }
export function getView() { return curView; }
export function sendVis() { fire('vis', { visible: document.visibilityState === 'visible', view: curView }); }
on('init', () => sendVis());

// ---------- Tema ----------
const mq = window.matchMedia('(prefers-color-scheme: dark)');
export function themePref() { return LS.get('nexo.theme', 'light'); }
export function applyTheme(pref) {
  if (pref) LS.set('nexo.theme', pref);
  pref = themePref();
  const t = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#000000' : '#F2F2F7';
  emit('theme', t);
}
mq.addEventListener && mq.addEventListener('change', () => applyTheme());

// ---------- Format waktu ----------
const pad = n => String(n).padStart(2, '0');
export const hm = ts => { const d = new Date(ts); return pad(d.getHours()) + '.' + pad(d.getMinutes()); };
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function dayDiff(ts) { const a = new Date(ts); a.setHours(0, 0, 0, 0); const b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((b - a) / 86400000); }
export function dayLabel(ts) {
  const dd = dayDiff(ts), d = new Date(ts);
  if (dd === 0) return 'Hari ini'; if (dd === 1) return 'Kemarin';
  if (dd < 7) return HARI[d.getDay()];
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
export function listTime(ts) {
  if (!ts) return '';
  const dd = dayDiff(ts), d = new Date(ts);
  if (dd === 0) return hm(ts); if (dd === 1) return 'Kemarin'; if (dd < 7) return HARI[d.getDay()];
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}
export function lastSeen(uid) {
  if (S.online.has(uid)) return 'Online';
  const ts = user(uid).lastSeen; if (!ts) return '';   // hanya admin yang menerima data "terakhir online"
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'Baru saja online'; if (m < 60) return `Online ${m} mnt lalu`;
  const h = Math.round(m / 60); if (h < 24) return `Online ${h} jam lalu`;
  return 'Online ' + dayLabel(ts).toLowerCase();
}

// ---------- Avatar ----------
export const mediaUrl = id => '/api/nexo/media/' + encodeURIComponent(id);
export function avatar(u, size = 40, opts = {}) {
  if (typeof u === 'string') u = user(u);
  const a = (u && u.avatar) || {};
  const dot = opts.dot && u && S.online.has(u.id) ? '<span class="dot"></span>' : '';
  const ring = opts.ring ? ` ring" style="--s:${size}px;--ring:${opts.ring}` : `" style="--s:${size}px`;
  if (a.photo) return `<span class="av${ring}"><img src="${mediaUrl(a.photo)}" alt="" loading="lazy" decoding="async">${dot}</span>`;
  return `<span class="av${ring};background:${esc(a.color || '#8E8E93')}">${esc(a.emoji || '🙂')}${dot}</span>`;
}

// ---------- Router layar (iOS push) ----------
const stack = [];
export function pushScreen(el, onPop) {
  // Layar ini sudah terbuka di bawah layar lain → tutup layar di atasnya dulu
  const idx = stack.findIndex(s => s.el === el);
  if (idx >= 0 && idx < stack.length - 1) {
    while (stack.length - 1 > idx) { const s = stack.pop(); s.el.classList.remove('on', 'under'); s.onPop && s.onPop(); }
    stack[idx].el.classList.remove('under');
    history.replaceState({ d: stack.length }, '');
  }
  const top = stack[stack.length - 1];
  if (top && top.el === el) { top.onPop && top.onPop(); stack.pop(); history.replaceState({ d: stack.length + 1 }, ''); stack.push({ el, onPop }); el.classList.add('on'); return; }
  if (top) top.el.classList.add('under');
  stack.push({ el, onPop });
  el.classList.add('on');
  history.pushState({ d: stack.length }, '');
}
export function popScreen() { if (stack.length) history.back(); }
export function topScreen() { return stack.length ? stack[stack.length - 1].el : null; }
function closeTop() {
  const s = stack.pop(); if (!s) return;
  s.el.classList.remove('on', 'under');
  s.onPop && s.onPop();
  const top = stack[stack.length - 1];
  if (top) top.el.classList.remove('under');
  emit('screen', topScreen());
}
window.addEventListener('popstate', e => {
  const d = (e.state && e.state.d) || 0;
  while (stack.length > d) closeTop();
});

// ---------- Toast / alert / sheet / banner / menu ----------
let toastT = null;
export function toast(msg, icon) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = (icon ? `<i class="fa-solid ${icon}"></i>` : '') + `<span>${esc(msg)}</span>`;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400);
}
export function alertBox({ title, message, buttons = [{ text: 'OK', bold: true, value: true }], input, vertical } = {}) {
  return new Promise(resolve => {
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.style.zIndex = 69;
    const el = document.createElement('div'); el.className = 'alert';
    el.innerHTML = `<div class="a-body"><div class="a-title">${esc(title || '')}</div>${message ? `<div class="a-msg">${esc(message)}</div>` : ''}
      ${input ? `<input class="field a-input" type="${input.type || 'text'}" ${input.inputmode ? `inputmode="${input.inputmode}"` : ''} maxlength="${input.max || 40}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">` : ''}</div>
      <div class="a-btns ${vertical || buttons.length > 2 ? 'v' : ''}">${buttons.map((b, i) => `<button data-i="${i}" class="${b.bold ? 'bold' : ''} ${b.destructive ? 'destructive' : ''}">${esc(b.text)}</button>`).join('')}</div>`;
    document.body.append(scrim, el);
    requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); });
    const inp = el.querySelector('input'); if (inp) setTimeout(() => inp.focus(), 250);
    const close = v => { el.classList.remove('on'); scrim.classList.remove('on'); setTimeout(() => { el.remove(); scrim.remove(); }, 250); resolve(v); };
    el.querySelectorAll('button').forEach(btn => btn.onclick = () => { const b = buttons[+btn.dataset.i]; close(input && b.value ? (inp.value) : b.value); });
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = buttons.find(x => x.bold) || buttons[buttons.length - 1]; close(b.value ? inp.value : b.value); } });
  });
}
export const confirmBox = (title, message, okText = 'OK', destructive = false) =>
  alertBox({ title, message, buttons: [{ text: 'Batal', value: false }, { text: okText, value: true, bold: !destructive, destructive }] });

export function sheet({ title, left, right, body, onOpen, onClose, tall }) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const el = document.createElement('div'); el.className = 'sheet';
  if (tall) el.style.height = '92dvh';
  el.innerHTML = `<div class="grab"></div><div class="sheet-head">${left ? `<button class="link" data-act="left">${esc(left)}</button>` : '<span style="min-width:64px"></span>'}
    <div class="nav-title">${esc(title || '')}</div>${right ? `<button class="link b" data-act="right">${esc(right)}</button>` : '<button class="link" data-act="close" aria-label="Tutup"><i class="fa-solid fa-circle-xmark" style="color:var(--label3);font-size:24px"></i></button>'}</div>
    <div class="sheet-body"></div>`;
  const bodyEl = el.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  document.body.append(scrim, el);
  let closed = false;
  const api = {
    el, body: bodyEl,
    close(v) { if (closed) return; closed = true; el.classList.remove('on'); scrim.classList.remove('on'); setTimeout(() => { el.remove(); scrim.remove(); }, 400); onClose && onClose(v); },
    setRight(text, disabled) { const b = el.querySelector('[data-act="right"]'); if (b) { if (text) b.textContent = text; b.disabled = !!disabled; } }
  };
  scrim.onclick = () => api.close();
  el.querySelector('.sheet-head').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'close' || b.dataset.act === 'left') api.close();
    if (b.dataset.act === 'right') api.onRight ? api.onRight() : api.close();
  });
  // swipe down untuk menutup
  let y0 = null, dy = 0;
  const grabZone = el.querySelector('.grab'), head = el.querySelector('.sheet-head');
  [grabZone, head].forEach(z => {
    z.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
    z.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
    z.addEventListener('touchend', () => { el.style.transition = ''; el.style.transform = ''; if (dy > 110) api.close(); y0 = null; });
  });
  requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); }));
  onOpen && onOpen(api);
  return api;
}

let bannerT = null;
export function banner({ title, body, av, time = 'sekarang', onClick }) {
  let el = $('#banner');
  if (!el) { el = document.createElement('div'); el.id = 'banner'; el.className = 'banner'; document.body.appendChild(el); }
  el.innerHTML = `${av || ''}<div style="flex:1;min-width:0"><div class="bt"><span class="ell">${esc(title)}</span><small>${esc(time)}</small></div><div class="bb">${esc(body)}</div></div>`;
  el.onclick = () => { el.classList.remove('on'); onClick && onClick(); };
  let y0 = null;
  el.ontouchstart = e => { y0 = e.touches[0].clientY; };
  el.ontouchmove = e => { if (y0 !== null && e.touches[0].clientY - y0 < -20) { el.classList.remove('on'); y0 = null; } };
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('on'), 4200);
}

export function popMenu(anchorEl, html, bind) {
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.style.zIndex = 74; scrim.style.background = 'rgba(0,0,0,.12)';
  scrim.style.backdropFilter = 'blur(2px)'; scrim.style.webkitBackdropFilter = 'blur(2px)';
  const el = document.createElement('div'); el.className = 'menu-pop'; el.innerHTML = html;
  document.body.append(scrim, el);
  const r = anchorEl.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  const w = Math.max(250, el.offsetWidth), h = el.offsetHeight;
  let left = Math.min(Math.max(10, r.left + r.width / 2 - w / 2), W - w - 10);
  let top = r.bottom + 8; if (top + h > H - 20) top = Math.max(10, r.top - h - 8);
  Object.assign(el.style, { left: left + 'px', top: top + 'px', width: w + 'px', transformOrigin: `${r.left + r.width / 2 - left}px ${top > r.top ? 0 : h}px` });
  requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); });
  const close = () => { el.classList.remove('on'); scrim.classList.remove('on'); setTimeout(() => { el.remove(); scrim.remove(); }, 200); };
  scrim.onclick = close;
  bind && bind(el, close);
  return close;
}

export function viewer(src) {
  const el = document.createElement('div'); el.className = 'viewer';
  el.innerHTML = `<div class="vbar"><button data-x><i class="fa-solid fa-xmark"></i></button><button data-dl><i class="fa-solid fa-arrow-up-from-bracket"></i></button></div><div class="vimg"><img src="${esc(src)}" alt=""></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
  el.querySelector('[data-x]').onclick = close;
  el.querySelector('.vimg').onclick = e => { if (e.target.tagName !== 'IMG') close(); };
  el.querySelector('[data-dl]').onclick = async () => {
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], 'nexo-foto.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch (e) { if (e.name !== 'AbortError') toast('Gagal menyimpan foto'); }
  };
  let y0 = null;
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 120) close(); y0 = null; });
}

// ---------- Gambar ----------
export async function compressImage(file, max = 1600, quality = 0.84) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak bisa dibaca')); i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    if (file.type === 'image/gif' && file.size < 6e6) return { blob: file, w, h };
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    return { blob, w, h };
  } finally { URL.revokeObjectURL(url); }
}
export async function uploadImage(blob) { return api('/api/nexo/upload', blob); }
export function pickFile(accept = 'image/*', capture) {
  return new Promise(resolve => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; if (capture) i.capture = capture;
    i.onchange = () => resolve(i.files && i.files[0] ? i.files[0] : null);
    i.click();
  });
}

export function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw'; p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2 + Math.random() * 2.5 + 's'; p.style.animationDelay = Math.random() * .8 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 6000);
}
export function haptic(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
export function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'); }

// ---------- Emoji ala iOS di semua perangkat ----------
// iPhone/iPad/Mac sudah memakai emoji Apple. Di Windows/Android, emoji diganti gambar emoji Apple.
const APPLE_EMOJI = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/';
const EMO_TEST = /[\p{Emoji_Presentation}\p{Regional_Indicator}️]/u;
const isEmojiG = g => /\p{Emoji_Presentation}|\p{Regional_Indicator}/u.test(g) || (g.includes('️') && /\p{Extended_Pictographic}/u.test(g));
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'TITLE']);
const badCodes = new Set();
function emojiImg(g) {
  const code = [...g].map(c => c.codePointAt(0).toString(16)).join('-');
  const cands = [...new Set([code, code.replace(/-fe0f/g, ''), code.includes('-') ? code.replace(/-200d/g, '-fe0f-200d') : code + '-fe0f'])].filter(c => !badCodes.has(c));
  if (!cands.length) return null;
  const img = document.createElement('img');
  img.className = 'emj'; img.alt = g; img.draggable = false; img.decoding = 'async';
  let i = 0;
  img.onerror = () => {
    badCodes.add(cands[i]); i++;
    if (i < cands.length) { img.src = EMOJI_CDN + cands[i] + '.png'; return; }
    // gagal semua: kembalikan ke teks biasa (dibungkus agar tidak diproses ulang)
    const sp = document.createElement('span'); sp.className = 'no-emj'; sp.textContent = g; img.replaceWith(sp);
  };
  img.src = EMOJI_CDN + cands[0] + '.png';
  return img;
}
function emojifyText(node) {
  const t = node.nodeValue;
  if (!t || !EMO_TEST.test(t)) return;
  const p = node.parentNode;
  if (!p || SKIP_TAGS.has(p.nodeName) || (p.closest && p.closest('.no-emj,[contenteditable]'))) return;
  const frag = document.createDocumentFragment();
  let buf = '', changed = false;
  for (const { segment } of segmenter.segment(t)) {
    const img = isEmojiG(segment) ? emojiImg(segment) : null;
    if (img) { if (buf) frag.appendChild(document.createTextNode(buf)); buf = ''; frag.appendChild(img); changed = true; }
    else buf += segment;
  }
  if (!changed) return;
  if (buf) frag.appendChild(document.createTextNode(buf));
  p.replaceChild(frag, node);
}
function emojifyTree(root) {
  if (root.nodeType === 3) return emojifyText(root);
  if (root.nodeType !== 1 || SKIP_TAGS.has(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list = []; let n;
  while ((n = w.nextNode())) if (EMO_TEST.test(n.nodeValue)) list.push(n);
  list.forEach(emojifyText);
}
// Teks untuk tooltip/salin: gambar emoji dikembalikan ke karakter aslinya
export function plainText(el) { const c = el.cloneNode(true); c.querySelectorAll('img.emj').forEach(i => i.replaceWith(i.alt)); return c.textContent; }
if (!APPLE_EMOJI && segmenter && typeof MutationObserver !== 'undefined') {
  const start = () => {
    emojifyTree(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') emojifyText(m.target);
        else m.addedNodes.forEach(emojifyTree);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}

// ---------- Crop foto profil (geser + cubit/slider untuk zoom) ----------
export function cropImage(file, size = 512) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    let done = false;
    const sh = sheet({ title: 'Sesuaikan Foto', left: 'Batal', right: 'Pakai',
      body: `<div class="crop-stage"><img class="crop-img" alt="" draggable="false"><div class="crop-mask"></div></div>
        <div class="crop-zoom"><i class="fa-solid fa-minus"></i><input type="range" min="1" max="4" step="0.01" value="1"><i class="fa-solid fa-plus"></i></div>
        <p class="small muted" style="text-align:center;margin-top:6px">Geser foto & cubit / slider untuk zoom</p>`,
      onClose: () => { if (!done) resolve(null); setTimeout(() => URL.revokeObjectURL(url), 2000); } });
    const stage = sh.body.querySelector('.crop-stage'), im = stage.querySelector('img'), slider = sh.body.querySelector('input');
    const img = new Image();
    img.onload = () => {
      im.src = url;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      let z = 1, x = 0, y = 0;
      const S0 = () => stage.clientWidth;
      const base = () => Math.max(S0() / iw, S0() / ih);
      const paint = () => {
        const w = iw * base() * z, h = ih * base() * z, mx = (w - S0()) / 2, my = (h - S0()) / 2;
        x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
        im.style.width = w + 'px'; im.style.height = h + 'px';
        im.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        slider.value = z;
      };
      paint();
      const pts = new Map(); let pinch0 = null;
      stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z }; } });
      stage.addEventListener('pointermove', e => {
        const prev = pts.get(e.pointerId); if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, cur);
        if (pts.size === 1) { x += cur.x - prev.x; y += cur.y - prev.y; }
        else if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; z = Math.max(1, Math.min(4, pinch0.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d)); }
        paint();
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', e => { e.preventDefault(); z = Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.08 : 0.93))); paint(); }, { passive: false });
      slider.oninput = () => { z = Number(slider.value); paint(); };
      sh.onRight = () => {
        const w = iw * base() * z, k = iw / w, left = S0() / 2 + x - w / 2, top = S0() / 2 + y - (ih * base() * z) / 2;
        const c = document.createElement('canvas'); c.width = c.height = size;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, -left * k, -top * k, S0() * k, S0() * k, 0, 0, size, size);
        c.toBlob(b => { done = true; sh.close(); resolve(b); }, 'image/jpeg', 0.88);
      };
    };
    img.onerror = () => { toast('Foto tidak bisa dibuka'); sh.close(); };
    img.src = url;
  });
}
