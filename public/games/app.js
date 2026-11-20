/* Nexo Games — aplikasi utama: masuk/daftar, tab, pengaturan, notifikasi */
import { $, $$, esc, S, LS, on, emit, api, connect, disconnect, call, applyTheme, themePref, avatar, user, toast, alertBox, confirmBox,
  sheet, banner, compressImage, uploadImage, pickFile, cropImage, lastSeen, setView, getView, topScreen, haptic } from './core.js';
import { soundOn, setSound, sfx } from './sound.js';
import { renderFeed, initFeed, openProfile } from './feed.js';
import { initCall, startCall } from './call.js';
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

// Masuk: nama + PIN dalam satu layar. Sesi tersimpan di browser, jadi cukup sekali.
function showAuth(step = 'login', data = {}) {
  authState = Object.assign(authState, data, { step });
  $('#app').classList.add('hidden'); authEl.classList.remove('hidden');
  const logo = `<img class="app-logo" src="icons/icon-192.png" alt="">`;
  if (step === 'login') {
    const k = known();
    authEl.innerHTML = `<form class="auth-card" id="a-form" autocomplete="on">${logo}<h1>Nexo Games</h1><p class="lead">Main game & ngobrol bareng teman,<br>sejauh apa pun jaraknya.</p>
      ${k.length ? `<div class="known">${k.map((u, i) => `<button type="button" data-k="${i}">${avatar(u, 56)}<span class="ell" style="max-width:64px">${esc(u.name)}</span></button>`).join('')}</div>` : ''}
      <div class="list auth-fields" style="width:100%">
        <div class="row"><i class="fa-solid fa-user faint" style="width:20px"></i><input class="inline left" id="a-name" name="username" placeholder="Nama" autocomplete="username" autocapitalize="words" maxlength="24" value="${esc(authState.name || '')}"></div>
        <div class="row"><i class="fa-solid fa-lock faint" style="width:20px"></i><input class="inline left" id="a-pin" name="password" type="password" inputmode="numeric" pattern="[0-9]*" placeholder="PIN 4 angka" autocomplete="current-password" maxlength="4"></div>
      </div>
      <div class="err" id="a-err"></div>
      <button class="btn block" id="a-next" type="submit">Masuk</button>
      <p class="small muted" style="margin-top:10px;line-height:1.45">Belum punya akun? Isi nama & PIN yang kamu mau,<br>nanti kami bantu buat akunnya. Cukup sekali, berikutnya otomatis masuk.</p></form>`;
    const nameI = $('#a-name'), pinI = $('#a-pin');
    $$('[data-k]', authEl).forEach(b => b.onclick = () => { nameI.value = k[+b.dataset.k].name; pinI.value = ''; pinI.focus(); });
    pinI.oninput = () => { pinI.value = pinI.value.replace(/\D/g, '').slice(0, 4); if (pinI.value.length === 4 && nameI.value.trim().length >= 2) submitLogin(); };
    $('#a-form').onsubmit = e => { e.preventDefault(); submitLogin(); };
    setTimeout(() => (nameI.value ? pinI : nameI).focus(), 300);
  } else if (step === 'create') {
    const av = authState.avatar || { emoji: EMOJIS[Math.floor(Math.random() * 12)], color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    authState.avatar = av;
    authEl.innerHTML = `<div class="auth-card" style="max-width:400px"><h1 style="font-size:26px">Buat Akun</h1><p class="lead" style="margin-bottom:4px">Pilih avatar yang paling kamu banget.</p>
      <div id="av-prev" style="cursor:pointer">${authState.photoUrl ? `<span class="av" style="--s:96px"><img src="${authState.photoUrl}"></span>` : avatar({ avatar: av }, 96)}</div>
      <button class="btn sm tint" id="a-photo"><i class="fa-solid fa-camera"></i> ${authState.photoUrl ? 'Ganti foto' : 'Pakai foto'}</button>
      <div class="emoji-grid" id="a-emojis" style="width:100%;margin-top:8px">${EMOJIS.map(e => `<button data-e="${e}" class="${!authState.photoUrl && av.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
      <div class="color-row" id="a-colors" style="margin:6px 0 8px">${COLORS.map(c => `<button style="background:${c}" class="${av.color === c ? 'on' : ''}" data-c="${c}"></button>`).join('')}</div>
      <div class="list auth-fields" style="width:100%">
        <div class="row"><i class="fa-solid fa-user faint" style="width:20px"></i><input class="inline left" id="a-name" placeholder="Nama" maxlength="24" value="${esc(authState.name || '')}"></div>
        <div class="row"><i class="fa-solid fa-lock faint" style="width:20px"></i><input class="inline left" id="a-pin" type="password" inputmode="numeric" placeholder="PIN 4 angka" autocomplete="new-password" maxlength="4" value="${esc(authState.pin || '')}"></div>
        <div class="row"><i class="fa-solid fa-lock faint" style="width:20px"></i><input class="inline left" id="a-pin2" type="password" inputmode="numeric" placeholder="Ulangi PIN" autocomplete="new-password" maxlength="4"></div>
        ${authState.needInvite ? `<div class="row"><i class="fa-solid fa-key faint" style="width:20px"></i><input class="inline left" id="a-inv" placeholder="Kode undangan" autocapitalize="none" value="${esc(authState.invite || '')}"></div>` : ''}
      </div>
      <div class="err" id="a-err"></div>
      <button class="btn block" id="a-next">Buat Akun</button><button class="link" id="a-back" style="font-size:15px">Sudah punya akun? Masuk</button></div>`;
    const keep = () => { authState.name = $('#a-name').value; authState.pin = $('#a-pin').value; };
    const refreshPrev = () => { $('#av-prev').innerHTML = authState.photoUrl ? `<span class="av" style="--s:96px"><img src="${authState.photoUrl}"></span>` : avatar({ avatar: authState.avatar }, 96); };
    $('#a-emojis').onclick = e => { const b = e.target.closest('button'); if (!b) return; authState.photoBlob = null; authState.photoUrl = null; authState.avatar.emoji = b.dataset.e; $$('#a-emojis button').forEach(x => x.classList.toggle('on', x === b)); refreshPrev(); };
    $('#a-colors').onclick = e => { const b = e.target.closest('button'); if (!b) return; authState.avatar.color = b.dataset.c; $$('#a-colors button').forEach(x => x.classList.toggle('on', x === b)); refreshPrev(); };
    const choosePhoto = async () => { const f = await pickFile(); if (!f) return; const blob = await cropImage(f); if (!blob) return; keep(); authState.photoBlob = blob; authState.photoUrl = URL.createObjectURL(blob); showAuth('create'); };
    $('#a-photo').onclick = choosePhoto; $('#av-prev').onclick = choosePhoto;
    $('#a-back').onclick = () => { keep(); showAuth('login'); };
    $('#a-next').onclick = async () => {
      const name = $('#a-name').value.trim(), pin = $('#a-pin').value, pin2 = $('#a-pin2').value, err = $('#a-err');
      if (name.length < 2) { err.textContent = 'Nama minimal 2 huruf.'; return; }
      if (!/^\d{4}$/.test(pin)) { err.textContent = 'PIN harus 4 angka.'; return; }
      if (pin !== pin2) { err.textContent = 'PIN dan ulangi PIN tidak sama.'; return; }
      if (authState.needInvite) { authState.invite = $('#a-inv').value.trim(); if (!authState.invite) { err.textContent = 'Isi kode undangan dari admin.'; return; } }
      const btn = $('#a-next'); btn.disabled = true; err.textContent = '';
      try { await loggedIn(await api('/api/nexo/signup', { name, pin, avatar: authState.avatar, invite: authState.invite })); }
      catch (e) { btn.disabled = false; err.textContent = e.status === 409 ? 'Nama sudah dipakai. Pilih nama lain atau masuk.' : e.message; }
    };
  }
}

async function submitLogin() {
  const nameI = $('#a-name'), pinI = $('#a-pin'), err = $('#a-err'), btn = $('#a-next');
  const name = nameI.value.trim(), pin = pinI.value;
  if (name.length < 2) { err.textContent = 'Ketik namamu dulu.'; nameI.focus(); return; }
  if (!/^\d{4}$/.test(pin)) { err.textContent = 'PIN harus 4 angka.'; pinI.focus(); return; }
  if (btn.disabled) return;
  btn.disabled = true; err.textContent = '';
  try {
    const r = await api('/api/nexo/lookup', { name });
    if (!r.found) {
      btn.disabled = false;
      const ok = await alertBox({ title: `“${name}” belum terdaftar`, message: 'Mau buat akun baru dengan nama & PIN ini?', buttons: [{ text: 'Batal', value: false }, { text: 'Buat Akun', value: true, bold: true }] });
      if (ok) showAuth('create', { name, pin, needInvite: r.needInvite });
      return;
    }
    await loggedIn(await api('/api/nexo/login', { name: r.user.name, pin }));
  } catch (e) {
    btn.disabled = false; err.textContent = e.message; pinI.value = '';
    const c = $('.auth-card', authEl); c.classList.toggle('shake', false); void c.offsetWidth; c.classList.add('shake'); haptic(60);
  }
}

async function loggedIn(res) {
  S.token = res.token; LS.set('nexo.token', res.token);
  remember(res.user);
  const photo = authState.photoBlob;
  authState = {};
  startApp();
  if (photo) {
    try { const up = await uploadImage(photo); const me = await call('profile', { avatar: { photo: up.id } }); remember(me); }
    catch (e) { toast('Foto profil gagal diunggah'); }
  }
}

on('logout', ({ reason }) => logout(reason));
on('refresh-badges', () => updateBadges());
on('photos', m => { if (m && m.photos) S.settings.photos = m.photos; });
async function logout(reason) {
  try { if (S.token) await api('/api/nexo/logout', {}); } catch (e) {}
  disconnect(); S.token = null; LS.del('nexo.token'); S.me = null;
  $$('.screen').forEach(s => s.classList.remove('on', 'under'));
  showAuth('login', { name: '' });
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
    initChat(); initGame(); initFeed(); initCall();
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
  else if (tab === 'feed') renderFeed($('#v-feed'));
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
on('user', ({ user: u }) => { u = S.users[u.id] = Object.assign({}, S.users[u.id], u); if (S.me && u.id === S.me.id) { S.me = u; remember(u); } if (tab === 'me' || tab === 'chat') renderTab(); });
on('users', ({ users }) => { users.forEach(u => S.users[u.id] = Object.assign({}, S.users[u.id], u)); if (S.me) S.me = S.users[S.me.id]; if (tab !== 'chat') renderTab(); });
on('userGone', ({ uid }) => { delete S.users[uid]; renderTab(); });
on('presence', ({ uid, online, lastSeen: ls }) => {
  online ? S.online.add(uid) : S.online.delete(uid);
  if (S.users[uid] && ls) S.users[uid].lastSeen = ls;
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
  const chat = q.get('chat'), game = q.get('game'), post = q.get('post'), callFrom = q.get('call');
  if (chat || game || post || callFrom) history.replaceState(history.state, '', location.pathname);
  if (game) openGame(game); else if (chat) openConv(chat); else if (post || callFrom) switchTab('feed');
}
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'nexo-open' && d.url) {
    const u = new URL(d.url, location.href); const chat = u.searchParams.get('chat'), game = u.searchParams.get('game');
    if (game) openGame(game); else if (chat) openConv(chat); else if (u.searchParams.get('post')) switchTab('feed');
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
    <div class="list" style="margin-top:10px"><button class="row has-avatar tap" id="m-prof" style="padding:12px 16px">${avatar(me, 60)}<div class="main"><div class="t b" style="font-size:20px">${esc(me.name)}${me.admin ? ' <span class="pill">Admin</span>' : ''}</div>${me.bio ? `<div class="s">${esc(me.bio)}</div>` : ''}<div class="s">🏆 ${st.wins} menang · 🎲 ${st.played} main</div></div><span class="small c-blue">Edit</span></button></div>

    <div class="section-h">Tampilan</div>
    <div class="list"><div class="row" style="padding:10px 12px;display:block"><div class="seg" id="m-theme">
      <button data-v="light" class="${pref === 'light' ? 'on' : ''}"><i class="fa-solid fa-sun"></i> Terang</button>
      <button data-v="dark" class="${pref === 'dark' ? 'on' : ''}"><i class="fa-solid fa-moon"></i> Gelap</button>
      <button data-v="system" class="${pref === 'system' ? 'on' : ''}"><i class="fa-solid fa-circle-half-stroke"></i> Otomatis</button></div></div></div>

    <div class="section-h">Suara</div>
    <div class="list"><div class="row has-icon"><span class="ico bg-pink"><i class="fa-solid fa-volume-high"></i></span><div class="main"><div class="t">Suara game</div><div class="s">Dadu, langkah, musik tiap kota, menang</div></div><label class="switch"><input type="checkbox" id="m-snd" ${soundOn() ? 'checked' : ''}><span></span></label></div></div>

    <div class="section-h">Notifikasi</div>
    <div class="list">
      <div class="row has-icon"><span class="ico bg-red"><i class="fa-solid fa-bell"></i></span><div class="main"><div class="t">Notifikasi push</div><div class="s">${pushOn ? 'Aktif di perangkat ini' : perm === 'denied' ? 'Diblokir di pengaturan browser' : 'Chat & giliran main masuk walau web ditutup'}</div></div>
        <label class="switch"><input type="checkbox" id="m-push" ${pushOn ? 'checked' : ''}><span></span></label></div>
      ${pushOn ? `<button class="row has-icon tap" id="m-test"><span class="ico bg-green"><i class="fa-solid fa-paper-plane"></i></span><div class="main"><div class="t">Kirim tes notifikasi</div></div><i class="fa-solid fa-chevron-right chev"></i></button>` : ''}
      ${isIOS && !isStandalone() ? `<button class="row has-icon tap" id="m-ios"><span class="ico bg-blue"><i class="fa-solid fa-mobile-screen"></i></span><div class="main"><div class="t">Pasang di iPhone</div><div class="s">Wajib agar notifikasi iPhone bisa masuk</div></div><i class="fa-solid fa-chevron-right chev"></i></button>` : ''}
    </div>

    <div class="section-h">Keamanan</div>
    <div class="list"><button class="row has-icon tap" id="m-pin"><span class="ico bg-gray"><i class="fa-solid fa-lock"></i></span><div class="main"><div class="t">Ganti PIN / Password</div><div class="s">PIN 4 angka untuk masuk</div></div><i class="fa-solid fa-chevron-right chev"></i></button></div>

    <div class="section-h">Teman (${friends.length})</div>
    <div class="list">${friends.length ? friends.map(u => `<button class="row has-avatar tap" data-dm="${u.id}">${avatar(u, 40, { dot: true })}<div class="main"><div class="t">${esc(u.name)}</div><div class="s">${[lastSeen(u.id), '🏆 ' + ((u.stats || {}).wins || 0)].filter(Boolean).map(esc).join(' · ')}</div></div><i class="fa-solid fa-comment c-blue"></i></button>`).join('')
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
  $('#m-snd').onchange = e => { setSound(e.target.checked); if (e.target.checked) sfx('turn'); };
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
  const fields = { name: me.name, bio: me.bio || '' };
  const keepFields = () => { const n = $('#p-name', sh.body), b = $('#p-bio', sh.body); if (n) fields.name = n.value; if (b) fields.bio = b.value; };
  const sh = sheet({ title: 'Edit Profil', left: 'Batal', right: 'Simpan', body: '' });
  const paint = () => {
    sh.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 16px">
      <div id="p-prev">${photoUrl ? `<span class="av" style="--s:96px"><img src="${photoUrl}"></span>` : avatar({ avatar: av }, 96)}</div>
      <button class="btn sm tint" id="p-photo"><i class="fa-solid fa-camera"></i> ${photoUrl ? 'Ganti foto' : 'Pakai foto'}</button></div>
      <div class="list"><div class="row"><div class="main"><div class="t">Nama</div></div><input class="inline" id="p-name" maxlength="24" value="${esc(fields.name)}"></div>
        <div class="row"><div class="main"><div class="t">Bio</div></div><input class="inline" id="p-bio" maxlength="140" placeholder="Tulis sesuatu tentangmu" value="${esc(fields.bio)}"></div></div>
      <div class="section-h">Atau pakai emoji</div>
      <div class="emoji-grid" id="p-emojis">${EMOJIS.map(e => `<button data-e="${e}" class="${!photoUrl && av.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
      <div class="color-row" id="p-colors" style="margin-top:14px">${COLORS.map(c => `<button style="background:${c}" class="${av.color === c ? 'on' : ''}" data-c="${c}"></button>`).join('')}</div>`;
    $('#p-photo', sh.body).onclick = async () => { const f = await pickFile(); if (!f) return; const blob = await cropImage(f); if (!blob) return; photoFile = blob; photoUrl = URL.createObjectURL(blob); keepFields(); paint(); };
    $('#p-emojis', sh.body).onclick = e => { const b = e.target.closest('button'); if (!b) return; av = { emoji: b.dataset.e, color: av.color || COLORS[0] }; photoFile = null; photoUrl = null; keepFields(); paint(); };
    $('#p-colors', sh.body).onclick = e => { const b = e.target.closest('button'); if (!b) return; av = { emoji: av.emoji || '😎', color: b.dataset.c }; photoFile = null; photoUrl = null; keepFields(); paint(); };
  };
  paint();
  sh.onRight = async () => {
    sh.setRight('Menyimpan…', true);
    try {
      keepFields();
      const payload = { name: fields.name, bio: fields.bio };
      if (photoFile) { const up = await uploadImage(photoFile); payload.avatar = { photo: up.id }; }
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
if (S.token) startApp(); else showAuth('login');
export { switchTab };
