/* Nexo Games — aplikasi utama: masuk/daftar, tab, pengaturan, notifikasi */
import { $, $$, esc, S, LS, on, emit, api, connect, disconnect, call, applyTheme, themePref, avatar, user, toast, alertBox, confirmBox,
  sheet, banner, compressImage, uploadImage, pickFile, lastSeen, setView, getView, topScreen, haptic } from './core.js';
import { renderChatList, openConv, unreadCount, totalUnread, initChat } from './chat.js';
import { renderGamesTab, openGame, initGame, myTurnCount } from './game.js';

applyTheme();
const EMOJIS = ['😎', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🐨', '🐙', '🦄', '🐧', '🐶', '🐱', '🐰', '🐻', '🐮', '🐷', '🐲', '👻', '🤖', '👽', '🎃', '🌸', '⚡️'];
const COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#00C7BE', '#FF3B30', '#FFCC00', '#8E8E93'];
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ================= AUTH =================
const authEl = $('#auth');
let authState = {};
function known() { return LS.get('nexo.known', []); }
function remember(u) { const k = known().filter(x => x.name.toLowerCase() !== u.name.toLowerCase()); k.unshift({ name: u.name, avatar: u.avatar }); LS.set('nexo.known', k.slice(0, 6)); }

function showAuth(step = 'name', data = {}) {
  authState = Object.assign(authState, data, { step });
  $('#app').classList.add('hidden'); authEl.classList.remove('hidden');
  const logo = `<img class="app-logo" src="icons/icon-192.png" alt="">`;
  if (step === 'name') {
    const k = known();
    authEl.innerHTML = `<div class="auth-card">${logo}<h1>Nexo Games</h1><p class="lead">Main game & ngobrol bareng teman,<br>sejauh apa pun jaraknya.</p>
      ${k.length ? `<div class="known">${k.map((u, i) => `<button data-k="${i}">${avatar(u, 56)}<span class="ell" style="max-width:64px">${esc(u.name)}</span></button>`).join('')}</div><div class="small muted" style="margin-bottom:6px">atau ketik namamu</div>` : ''}
      <input class="field" id="a-name" placeholder="Nama kamu" autocomplete="nickname" autocapitalize="words" maxlength="24" value="${esc(authState.name || '')}">
      <div class="err" id="a-err"></div>
      <button class="btn block" id="a-next">Lanjut</button>
      <p class="small muted" style="margin-top:10px;line-height:1.45">Belum punya akun? Ketik nama yang kamu mau,<br>nanti kami bantu buat akunnya.</p></div>`;
    const inp = $('#a-name');
    $$('[data-k]', authEl).forEach(b => b.onclick = () => lookup(k[+b.dataset.k].name));
    $('#a-next').onclick = () => lookup(inp.value);
    inp.onkeydown = e => { if (e.key === 'Enter') lookup(inp.value); };
    if (!k.length) setTimeout(() => inp.focus(), 300);
  } else if (step === 'pin' || step === 'newpin' || step === 'confirmpin') {
    const u = authState.user || { name: authState.name, avatar: authState.avatar };
    const title = step === 'pin' ? `Hai, ${u.name}!` : step === 'newpin' ? 'Buat PIN' : 'Ulangi PIN';
    const sub = step === 'pin' ? 'Masukkan PIN 4 angka kamu' : step === 'newpin' ? 'PIN 4 angka untuk masuk dari HP / laptop lain' : 'Ketik sekali lagi untuk konfirmasi';
    authEl.innerHTML = `<div class="auth-card">${avatar(u, 76)}<h1 style="font-size:24px;margin-top:8px">${esc(title)}</h1><p class="lead" style="margin:0">${esc(sub)}</p>
      <div class="pin-dots" id="dots">${'<span></span>'.repeat(4)}</div>
      <div class="pin-pad" id="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-d="${n}">${n}</button>`).join('')}
        <button class="plain" data-back>${step === 'pin' ? 'Bukan aku' : 'Kembali'}</button><button data-d="0">0</button><button class="plain" data-del aria-label="Hapus"><i class="fa-solid fa-delete-left" style="font-size:22px"></i></button></div>
      <div class="err" id="a-err" style="margin-top:14px"></div></div>`;
    let pin = '';
    const dots = $('#dots'), err = $('#a-err');
    const paint = () => $$('span', dots).forEach((s, i) => s.classList.toggle('on', i < pin.length));
    const press = async d => {
      if (pin.length >= 4 || dots.classList.contains('busy')) return;
      pin += d; paint(); haptic(5);
      if (pin.length < 4) return;
      if (step === 'newpin') { setTimeout(() => showAuth('confirmpin', { pin1: pin }), 150); return; }
      if (step === 'confirmpin' && pin !== authState.pin1) { shakeErr('PIN tidak sama. Ulangi.'); setTimeout(() => showAuth('newpin'), 700); return; }
      dots.classList.add('busy'); err.textContent = '';
      try {
        const res = step === 'pin' ? await api('/api/nexo/login', { name: u.name, pin }) : await api('/api/nexo/signup', { name: authState.name, pin, avatar: authState.avatar, invite: authState.invite });
        await loggedIn(res);
      } catch (e) {
        dots.classList.remove('busy');
        if (e.status === 403 && /undangan/i.test(e.message)) { await alertBox({ title: 'Kode undangan salah', message: 'Minta kode ke admin, lalu coba lagi.' }); showAuth('create'); return; }
        if (e.status === 409) { await alertBox({ title: 'Nama sudah dipakai', message: 'Pilih nama lain.' }); showAuth('create'); return; }
        shakeErr(e.message);
      }
    };
    const shakeErr = msg => { err.textContent = msg; const c = $('.auth-card', authEl); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); pin = ''; setTimeout(paint, 300); haptic(60); };
    $('#pad').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d !== undefined) press(b.dataset.d);
      else if (b.hasAttribute('data-del')) { pin = pin.slice(0, -1); paint(); }
      else if (b.hasAttribute('data-back')) showAuth(step === 'pin' ? 'name' : step === 'newpin' ? 'create' : 'newpin');
    };
    document.onkeydown = e => { if (authEl.classList.contains('hidden')) return; if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); } };
  } else if (step === 'create') {
    const av = authState.avatar || { emoji: EMOJIS[Math.floor(Math.random() * 12)], color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    authState.avatar = av;
    authEl.innerHTML = `<div class="auth-card" style="max-width:400px"><h1 style="font-size:26px">Buat Akun</h1><p class="lead" style="margin-bottom:4px">Pilih avatar yang paling kamu banget.</p>
      <div id="av-prev" style="cursor:pointer">${authState.photoUrl ? `<span class="av" style="--s:96px"><img src="${authState.photoUrl}"></span>` : avatar({ avatar: av }, 96)}</div>
      <button class="btn sm tint" id="a-photo"><i class="fa-solid fa-camera"></i> ${authState.photoUrl ? 'Ganti foto' : 'Pakai foto'}</button>
      <div class="emoji-grid" id="a-emojis" style="width:100%;margin-top:8px">${EMOJIS.map(e => `<button data-e="${e}" class="${!authState.photoUrl && av.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
      <div class="color-row" id="a-colors" style="margin:6px 0 8px">${COLORS.map(c => `<button style="background:${c}" class="${av.color === c ? 'on' : ''}" data-c="${c}"></button>`).join('')}</div>
      <input class="field" id="a-name" placeholder="Nama" maxlength="24" value="${esc(authState.name || '')}">
      ${authState.needInvite ? `<input class="field" id="a-inv" placeholder="Kode undangan" autocapitalize="none" value="${esc(authState.invite || '')}">` : ''}
      <div class="err" id="a-err"></div>
      <button class="btn block" id="a-next">Lanjut</button><button class="link" id="a-back" style="font-size:15px">Sudah punya akun? Masuk</button></div>`;
    const refreshPrev = () => { $('#av-prev').innerHTML = authState.photoUrl ? `<span class="av" style="--s:96px"><img src="${authState.photoUrl}"></span>` : avatar({ avatar: authState.avatar }, 96); };
    $('#a-emojis').onclick = e => { const b = e.target.closest('button'); if (!b) return; authState.photoFile = null; authState.photoUrl = null; authState.avatar.emoji = b.dataset.e; $$('#a-emojis button').forEach(x => x.classList.toggle('on', x === b)); refreshPrev(); };
    $('#a-colors').onclick = e => { const b = e.target.closest('button'); if (!b) return; authState.avatar.color = b.dataset.c; $$('#a-colors button').forEach(x => x.classList.toggle('on', x === b)); refreshPrev(); };
    const choosePhoto = async () => { const f = await pickFile(); if (!f) return; authState.photoFile = f; authState.photoUrl = URL.createObjectURL(f); showAuth('create', { name: $('#a-name').value }); };
    $('#a-photo').onclick = choosePhoto; $('#av-prev').onclick = choosePhoto;
    $('#a-back').onclick = () => showAuth('name');
    $('#a-next').onclick = () => {
      const name = $('#a-name').value.trim();
      if (name.length < 2) { $('#a-err').textContent = 'Nama minimal 2 huruf.'; return; }
      authState.name = name; authState.user = null;
      if (authState.needInvite) { authState.invite = $('#a-inv').value.trim(); if (!authState.invite) { $('#a-err').textContent = 'Isi kode undangan dari admin.'; return; } }
      showAuth('newpin');
    };
  }
}

async function lookup(name) {
  name = String(name || '').trim();
  const err = $('#a-err');
  if (name.length < 2) { if (err) err.textContent = 'Ketik namamu dulu.'; return; }
  const btn = $('#a-next'); if (btn) btn.disabled = true;
  try {
    const r = await api('/api/nexo/lookup', { name });
    if (r.found) showAuth('pin', { user: r.user, name: r.user.name });
    else {
      const ok = await alertBox({ title: `“${name}” belum terdaftar`, message: 'Mau buat akun baru dengan nama ini?', buttons: [{ text: 'Batal', value: false }, { text: 'Buat Akun', value: true, bold: true }] });
      if (ok) showAuth('create', { name, needInvite: r.needInvite, user: null });
    }
  } catch (e) { if (err) err.textContent = e.message; }
  finally { if (btn) btn.disabled = false; }
}

async function loggedIn(res) {
  S.token = res.token; LS.set('nexo.token', res.token);
  remember(res.user);
  document.onkeydown = null;
  const photo = authState.photoFile;
  authState = {};
  startApp();
  if (photo) {
    try {
      const { blob } = await compressImage(photo, 480, .86);
      const up = await uploadImage(blob);
      const me = await call('profile', { avatar: { photo: up.id } });
      remember(me);
    } catch (e) { toast('Foto profil gagal diunggah'); }
  }
}

on('logout', ({ reason }) => logout(reason));
on('refresh-badges', () => updateBadges());
on('photos', m => { if (m && m.photos) S.settings.photos = m.photos; });
async function logout(reason) {
  try { if (S.token) await api('/api/nexo/logout', {}); } catch (e) {}
  disconnect(); S.token = null; LS.del('nexo.token'); S.me = null;
  $$('.screen').forEach(s => s.classList.remove('on', 'under'));
  showAuth('name', { name: '' });
  if (reason) toast(reason);
}

// ================= APP =================
let tab = LS.get('nexo.tab', 'games');
let started = false;
function startApp() {
  authEl.classList.add('hidden'); $('#app').classList.remove('hidden');
  if (!started) {
    started = true;
    $('#tabbar').onclick = e => { const b = e.target.closest('.tab'); if (b) switchTab(b.dataset.tab); };
    initChat(); initGame();
  }
  switchTab(tab);
  connect();
}
function switchTab(t) {
  tab = t; LS.set('nexo.tab', t);
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + t));
  renderTab();
  if (!topScreen()) setView('tab:' + t);
  window.scrollTo(0, 0);
}
export function renderTab() {
  if (!S.me) { $('#v-' + tab).innerHTML = `<div class="empty" style="padding-top:40vh"><span class="spin"></span></div>`; return; }
  if (tab === 'games') renderGamesTab($('#v-games'));
  else if (tab === 'chat') renderChatList($('#v-chat'));
  else renderMe($('#v-me'));
  updateBadges();
}
export function updateBadges() {
  const c = totalUnread(), g = myTurnCount();
  const bc = $('#b-chat'), bg = $('#b-games');
  bc.textContent = c > 99 ? '99+' : c; bc.classList.toggle('hidden', !c);
  bg.textContent = g; bg.classList.toggle('hidden', !g);
  try { if (navigator.setAppBadge) (c + g) ? navigator.setAppBadge(c + g) : navigator.clearAppBadge(); } catch (e) {}
  emit('badges', { chat: c, games: g });
}
window.addEventListener('scroll', () => { $$('.view.on .nav').forEach(n => n.classList.toggle('scrolled', window.scrollY > 4)); }, { passive: true });

on('init', m => {
  S.me = m.me; S.users = {}; m.users.forEach(u => S.users[u.id] = u);
  S.online = new Set(m.online); S.convs = {}; m.convs.forEach(c => S.convs[c.id] = c);
  S.games = {}; m.games.forEach(g => S.games[g.id] = g);
  S.settings = m.settings || {}; S.vapid = m.vapidPublicKey; S.serverSkew = m.now - Date.now();
  remember(S.me);
  renderTab();
  autoPush();
  handleDeepLink();
});
on('user', ({ user: u }) => { S.users[u.id] = u; if (S.me && u.id === S.me.id) { S.me = u; remember(u); } if (tab === 'me' || tab === 'chat') renderTab(); });
on('users', ({ users }) => { users.forEach(u => S.users[u.id] = u); if (S.me) S.me = S.users[S.me.id]; if (tab !== 'chat') renderTab(); });
on('userGone', ({ uid }) => { delete S.users[uid]; renderTab(); });
on('presence', ({ uid, online, lastSeen: ls }) => {
  online ? S.online.add(uid) : S.online.delete(uid);
  if (S.users[uid]) S.users[uid].lastSeen = ls;
  if (tab === 'chat' || tab === 'me') renderTab();
  emit('presence-ui', uid);
});
on('gindex', m => { if (m.remove) delete S.games[m.remove]; else S.games[m.entry.id] = m.entry; if (tab === 'games') renderTab(); else updateBadges(); });
on('invite', m => {
  const u = user(m.from);
  banner({ title: `${u.name} mengajakmu main 🎲`, body: `Room “${m.name}”. Tap untuk gabung.`, av: avatar(u, 38), onClick: () => openGame(m.id) });
});
on('nudge', m => { const u = user(m.from); haptic(200); banner({ title: `👋 ${u.name} mencolekmu`, body: 'Giliranmu! Yuk lanjut main.', av: avatar(u, 38), onClick: () => openGame(m.id) }); });

function handleDeepLink() {
  const q = new URLSearchParams(location.search);
  const chat = q.get('chat'), game = q.get('game');
  if (chat || game) history.replaceState(history.state, '', location.pathname);
  if (game) openGame(game); else if (chat) openConv(chat);
}
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'nexo-open' && d.url) {
    const u = new URL(d.url, location.href); const chat = u.searchParams.get('chat'), game = u.searchParams.get('game');
    if (game) openGame(game); else if (chat) openConv(chat);
  }
});

// ================= SAYA (pengaturan) =================
function renderMe(el) {
  const me = S.me, st = me.stats || { played: 0, wins: 0 };
  const pref = themePref();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const pushOn = LS.get('nexo.push', false) && perm === 'granted';
  const friends = Object.values(S.users).filter(u => u.id !== me.id).sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || a.name.localeCompare(b.name));
  el.innerHTML = `<div class="nav"><div class="nav-row"><span class="nav-title"></span></div></div>
  <div class="page"><h1 class="large-title">Saya</h1>
    <div class="list" style="margin-top:10px"><button class="row has-avatar tap" id="m-prof" style="padding:12px 16px">${avatar(me, 60)}<div class="main"><div class="t b" style="font-size:20px">${esc(me.name)}${me.admin ? ' <span class="pill">Admin</span>' : ''}</div><div class="s">🏆 ${st.wins} menang · 🎲 ${st.played} main</div></div><span class="small c-blue">Edit</span></button></div>

    <div class="section-h">Tampilan</div>
    <div class="list"><div class="row" style="padding:10px 12px;display:block"><div class="seg" id="m-theme">
      <button data-v="light" class="${pref === 'light' ? 'on' : ''}"><i class="fa-solid fa-sun"></i> Terang</button>
      <button data-v="dark" class="${pref === 'dark' ? 'on' : ''}"><i class="fa-solid fa-moon"></i> Gelap</button>
      <button data-v="system" class="${pref === 'system' ? 'on' : ''}"><i class="fa-solid fa-circle-half-stroke"></i> Otomatis</button></div></div></div>

    <div class="section-h">Notifikasi</div>
    <div class="list">
      <div class="row has-icon"><span class="ico bg-red"><i class="fa-solid fa-bell"></i></span><div class="main"><div class="t">Notifikasi push</div><div class="s">${pushOn ? 'Aktif di perangkat ini' : perm === 'denied' ? 'Diblokir di pengaturan browser' : 'Chat & giliran main masuk walau web ditutup'}</div></div>
        <label class="switch"><input type="checkbox" id="m-push" ${pushOn ? 'checked' : ''}><span></span></label></div>
      ${pushOn ? `<button class="row has-icon tap" id="m-test"><span class="ico bg-green"><i class="fa-solid fa-paper-plane"></i></span><div class="main"><div class="t">Kirim tes notifikasi</div></div><i class="fa-solid fa-chevron-right chev"></i></button>` : ''}
      ${isIOS && !isStandalone() ? `<button class="row has-icon tap" id="m-ios"><span class="ico bg-blue"><i class="fa-solid fa-mobile-screen"></i></span><div class="main"><div class="t">Pasang di iPhone</div><div class="s">Wajib agar notifikasi iPhone bisa masuk</div></div><i class="fa-solid fa-chevron-right chev"></i></button>` : ''}
    </div>

    <div class="section-h">Keamanan</div>
    <div class="list"><button class="row has-icon tap" id="m-pin"><span class="ico bg-gray"><i class="fa-solid fa-lock"></i></span><div class="main"><div class="t">Ganti PIN</div></div><i class="fa-solid fa-chevron-right chev"></i></button></div>

    <div class="section-h">Teman (${friends.length})</div>
    <div class="list">${friends.length ? friends.map(u => `<button class="row has-avatar tap" data-dm="${u.id}">${avatar(u, 40, { dot: true })}<div class="main"><div class="t">${esc(u.name)}</div><div class="s">${esc(lastSeen(u.id))} · 🏆 ${(u.stats || {}).wins || 0}</div></div><i class="fa-solid fa-comment c-blue"></i></button>`).join('')
      : `<div class="empty"><i class="fa-solid fa-user-plus"></i>Belum ada teman. Bagikan link web ini, lalu minta mereka mengetik nama untuk membuat akun.</div>`}</div>
    <div class="section-f">Bagikan link: <b>${esc(location.origin + location.pathname)}</b></div>
    <div style="padding:10px 0 0"><button class="btn sm tint" id="m-share"><i class="fa-solid fa-share"></i> Bagikan link ke teman</button></div>

    ${me.admin ? `<div class="section-h">Admin</div><div class="list">
      <button class="row has-icon tap" id="m-inv"><span class="ico bg-purple"><i class="fa-solid fa-key"></i></span><div class="main"><div class="t">Kode undangan</div><div class="s">${S.settings.inviteCode ? 'Teman baru wajib memasukkan kode ini' : 'Mati: siapa saja yang punya link bisa daftar'}</div></div><span class="val">${esc(S.settings.inviteCode || 'Mati')}</span><i class="fa-solid fa-chevron-right chev"></i></button>
      <button class="row has-icon tap" id="m-manage"><span class="ico bg-orange"><i class="fa-solid fa-users-gear"></i></span><div class="main"><div class="t">Kelola akun teman</div></div><i class="fa-solid fa-chevron-right chev"></i></button></div>` : ''}

    <div class="section-h"></div>
    <div class="list"><button class="row danger tap" id="m-out">Keluar</button></div>
    <p class="section-f" style="text-align:center;padding-top:18px">Nexo Games · dibuat untuk main bareng teman jauh 💙</p>
  </div>`;
  $('#m-prof').onclick = editProfile;
  $('#m-theme').onclick = e => { const b = e.target.closest('button'); if (!b) return; applyTheme(b.dataset.v); $$('#m-theme button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#m-push').onchange = async e => {
    if (e.target.checked) { const ok = await enablePush(true); e.target.checked = ok; }
    else { await disablePush(); }
    renderMe(el);
  };
  const t = $('#m-test'); if (t) t.onclick = async () => { try { const r = await api('/api/nexo/test-push', {}); toast(r.sent ? 'Tes dikirim! Tutup web untuk melihatnya.' : 'Belum ada perangkat yang terdaftar', 'fa-paper-plane'); } catch (er) { toast(er.message); } };
  const ios = $('#m-ios'); if (ios) ios.onclick = iosGuide;
  $('#m-pin').onclick = changePin;
  $$('[data-dm]', el).forEach(b => b.onclick = () => openConv('dm:' + [me.id, b.dataset.dm].sort().join(':')));
  $('#m-share').onclick = shareLink;
  const inv = $('#m-inv'); if (inv) inv.onclick = async () => {
    const v = await alertBox({ title: 'Kode undangan', message: 'Kosongkan untuk mematikan. Teman baru harus memasukkan kode ini saat daftar.', input: { value: S.settings.inviteCode || '', placeholder: 'mis. nexo2026', max: 20 }, buttons: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
    if (v === false || v === undefined) return;
    try { const r = await call('invite.set', { code: v }); S.settings.inviteCode = r.inviteCode; renderMe(el); toast('Tersimpan'); } catch (er) { toast(er.message); }
  };
  const mg = $('#m-manage'); if (mg) mg.onclick = manageUsers;
  $('#m-out').onclick = async () => { if (await confirmBox('Keluar dari Nexo?', 'Kamu bisa masuk lagi dengan nama & PIN.', 'Keluar', true)) logout(); };
}

function editProfile() {
  const me = S.me;
  let av = Object.assign({}, me.avatar), photoFile = null, photoUrl = me.avatar.photo ? '/api/nexo/media/' + me.avatar.photo : null;
  const sh = sheet({ title: 'Edit Profil', left: 'Batal', right: 'Simpan', body: '' });
  const paint = () => {
    sh.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 16px">
      <div id="p-prev">${photoUrl ? `<span class="av" style="--s:96px"><img src="${photoUrl}"></span>` : avatar({ avatar: av }, 96)}</div>
      <button class="btn sm tint" id="p-photo"><i class="fa-solid fa-camera"></i> ${photoUrl ? 'Ganti foto' : 'Pakai foto'}</button></div>
      <div class="list"><div class="row"><div class="main"><div class="t">Nama</div></div><input class="inline" id="p-name" maxlength="24" value="${esc(me.name)}"></div></div>
      <div class="section-h">Atau pakai emoji</div>
      <div class="emoji-grid" id="p-emojis">${EMOJIS.map(e => `<button data-e="${e}" class="${!photoUrl && av.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
      <div class="color-row" id="p-colors" style="margin-top:14px">${COLORS.map(c => `<button style="background:${c}" class="${av.color === c ? 'on' : ''}" data-c="${c}"></button>`).join('')}</div>`;
    $('#p-photo', sh.body).onclick = async () => { const f = await pickFile(); if (!f) return; photoFile = f; photoUrl = URL.createObjectURL(f); const n = $('#p-name', sh.body).value; paint(); $('#p-name', sh.body).value = n; };
    $('#p-emojis', sh.body).onclick = e => { const b = e.target.closest('button'); if (!b) return; av = { emoji: b.dataset.e, color: av.color || COLORS[0] }; photoFile = null; photoUrl = null; const n = $('#p-name', sh.body).value; paint(); $('#p-name', sh.body).value = n; };
    $('#p-colors', sh.body).onclick = e => { const b = e.target.closest('button'); if (!b) return; av = { emoji: av.emoji || '😎', color: b.dataset.c }; photoFile = null; photoUrl = null; const n = $('#p-name', sh.body).value; paint(); $('#p-name', sh.body).value = n; };
  };
  paint();
  sh.onRight = async () => {
    sh.setRight('Menyimpan…', true);
    try {
      const payload = { name: $('#p-name', sh.body).value };
      if (photoFile) { const { blob } = await compressImage(photoFile, 480, .86); const up = await uploadImage(blob); payload.avatar = { photo: up.id }; }
      else if (!photoUrl) payload.avatar = av;
      const u = await call('profile', payload);
      S.me = u; S.users[u.id] = u; remember(u);
      sh.close(); renderTab(); toast('Profil diperbarui', 'fa-check');
    } catch (e) { sh.setRight('Simpan', false); toast(e.message); }
  };
}

async function changePin() {
  const old = await alertBox({ title: 'PIN lama', input: { type: 'password', inputmode: 'numeric', max: 4, placeholder: '••••' }, buttons: [{ text: 'Batal', value: false }, { text: 'Lanjut', value: true, bold: true }] });
  if (!old) return;
  const pin = await alertBox({ title: 'PIN baru (4 angka)', input: { type: 'password', inputmode: 'numeric', max: 4, placeholder: '••••' }, buttons: [{ text: 'Batal', value: false }, { text: 'Simpan', value: true, bold: true }] });
  if (!pin) return;
  try { await call('pin', { old, pin }); toast('PIN diganti', 'fa-check'); } catch (e) { alertBox({ title: 'Gagal', message: e.message }); }
}

function manageUsers() {
  const list = Object.values(S.users).filter(u => u.id !== S.me.id);
  const sh = sheet({ title: 'Kelola Akun', body: `<p class="section-f" style="padding:0 4px 10px">Hapus akun yang tidak dikenal. Riwayat chat tetap tersimpan.</p><div class="list">${list.map(u => `<div class="row has-avatar">${avatar(u, 36)}<div class="main"><div class="t">${esc(u.name)}</div><div class="s">Daftar ${new Date(u.createdAt).toLocaleDateString('id-ID')}</div></div><button class="btn sm tint red" data-del="${u.id}">Hapus</button></div>`).join('') || '<div class="empty">Belum ada akun lain.</div>'}</div>` });
  sh.body.onclick = async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const u = S.users[b.dataset.del];
    if (!await confirmBox(`Hapus akun ${u.name}?`, 'Akun ini tidak bisa masuk lagi.', 'Hapus', true)) return;
    try { await call('user.delete', { uid: u.id }); b.closest('.row').remove(); toast('Akun dihapus'); } catch (er) { toast(er.message); }
  };
}

async function shareLink() {
  const url = location.origin + location.pathname;
  const text = 'Yuk main Nexo Games bareng aku! Buka link ini, ketik namamu, lalu buat akun 🎲';
  try { if (navigator.share) { await navigator.share({ title: 'Nexo Games', text, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link disalin', 'fa-link'); } catch (e) { alertBox({ title: 'Link Nexo Games', message: url }); }
}

// ================= PUSH =================
function b64ToBytes(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
function deviceLabel() { const ua = navigator.userAgent; return (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Perangkat') + (isStandalone() ? ' (app)' : ''); }
async function swReg() { if (!('serviceWorker' in navigator)) return null; try { return await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) { return null; } }
swReg();
async function enablePush(interactive) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (interactive) { if (isIOS && !isStandalone()) iosGuide(); else alertBox({ title: 'Belum didukung', message: 'Browser ini belum mendukung notifikasi push. Coba Chrome / Edge / Safari terbaru.' }); }
    return false;
  }
  if (!S.vapid) { if (interactive) alertBox({ title: 'Server push belum siap', message: 'Admin perlu mengaktifkan KV & push di Cloudflare (lihat README).' }); return false; }
  try {
    const reg = await swReg(); await navigator.serviceWorker.ready;
    let perm = Notification.permission;
    if (perm !== 'granted' && interactive) perm = await Notification.requestPermission();
    if (perm !== 'granted') { if (interactive && perm === 'denied') alertBox({ title: 'Notifikasi diblokir', message: 'Izinkan notifikasi untuk situs ini di pengaturan browser, lalu coba lagi.' }); return false; }
    let sub = await reg.pushManager.getSubscription();
    const key = b64ToBytes(S.vapid);
    if (sub && sub.options && sub.options.applicationServerKey) {
      const cur = new Uint8Array(sub.options.applicationServerKey);
      if (cur.length !== key.length || cur.some((v, i) => v !== key[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api('/api/nexo/subscribe', { subscription: sub.toJSON(), label: deviceLabel() });
    LS.set('nexo.push', true);
    if (interactive) toast('Notifikasi aktif', 'fa-bell');
    return true;
  } catch (e) { if (interactive) alertBox({ title: 'Gagal mengaktifkan', message: e.message }); return false; }
}
async function disablePush() {
  LS.set('nexo.push', false);
  try { const reg = await navigator.serviceWorker.getRegistration('./'); const sub = reg && await reg.pushManager.getSubscription(); if (sub) { await api('/api/nexo/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch (e) {}
  toast('Notifikasi dimatikan');
}
let pushAsked = false;
async function autoPush() {
  if (LS.get('nexo.push', false) && 'Notification' in window && Notification.permission === 'granted') { enablePush(false); return; }
  if (pushAsked || LS.get('nexo.pushAsked', 0) > Date.now() - 3 * 86400000) return;
  pushAsked = true;
  setTimeout(async () => {
    if (!S.me || !S.vapid) return;
    LS.set('nexo.pushAsked', Date.now());
    if (isIOS && !isStandalone()) { const ok = await confirmBox('Biar chat & giliran main masuk notifikasi', 'Di iPhone, pasang Nexo Games ke Layar Utama dulu. Mau lihat caranya?', 'Lihat caranya'); if (ok) iosGuide(); return; }
    if (!('Notification' in window) || Notification.permission === 'denied') return;
    const ok = await confirmBox('Aktifkan notifikasi? 🔔', 'Supaya kamu tahu kalau ada chat baru atau giliranmu main, walau web sedang ditutup.', 'Aktifkan');
    if (ok) { await enablePush(true); if (tab === 'me') renderTab(); }
  }, 2500);
}
function iosGuide() {
  sheet({ title: 'Pasang di iPhone', body: `<div style="display:flex;flex-direction:column;gap:14px;padding:6px 4px 10px">
    <p class="muted" style="line-height:1.45">Apple hanya mengizinkan notifikasi untuk web yang dipasang di Layar Utama (iOS 16.4 ke atas).</p>
    <div class="list">
      <div class="row has-icon"><span class="ico bg-blue">1</span><div class="main"><div class="t">Buka web ini di <b>Safari</b></div></div></div>
      <div class="row has-icon"><span class="ico bg-blue"><i class="fa-solid fa-arrow-up-from-bracket"></i></span><div class="main"><div class="t">Tap tombol <b>Bagikan</b></div><div class="s">Ikon kotak dengan panah di bawah layar</div></div></div>
      <div class="row has-icon"><span class="ico bg-blue"><i class="fa-regular fa-square-plus"></i></span><div class="main"><div class="t">Pilih <b>Tambah ke Layar Utama</b></div></div></div>
      <div class="row has-icon"><span class="ico bg-green"><i class="fa-solid fa-bell"></i></span><div class="main"><div class="t">Buka <b>Nexo Games</b> dari ikon</div><div class="s">Lalu Saya → Notifikasi push → nyalakan</div></div></div>
    </div>
    <p class="small muted">Di laptop Windows: buka di Chrome atau Edge, lalu izinkan notifikasi. Bisa juga “Install app” dari menu browser.</p></div>` });
}

// ================= BOOT =================
if (S.token) startApp(); else showAuth('name');
export { switchTab };
