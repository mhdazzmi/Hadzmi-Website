/* Nexo Games — game properti "Nexo Kota Dunia": lobi, papan, aksi, lelang, tawar-menawar */
import { $, $$, esc, S, LS, on, emit, call, fire, avatar, user, hm, pushScreen, popScreen, topScreen, setView, toast, alertBox, confirmBox,
  sheet, popMenu, banner, confetti, haptic, sleep } from './core.js';
import * as E from './engine.js';
import { landmarkSvg } from './landmarks.js';
import { openConv, pickFriend, totalUnread, dmId } from './chat.js';

const scr = $('#scr-game');
let G = null, gid = null, built = false, panelTab = LS.get('nexo.ptab', 'players');
let shown = { moveSeq: 0, diceSeq: 0, cardSeq: 0 };
let disp = {};                // posisi bidak yang sedang ditampilkan
let queue = [], busy = false;
const rp = E.rp;
const me = () => S.me && S.me.id;
const pl = id => G && E.player(G, id);
const SPECIAL = {
  go: { icon: 'fa-flag-checkered', text: `Setiap melewati atau berhenti di START, kamu menerima ${rp(E.GO_SALARY)}.` },
  chest: { icon: 'fa-gift', text: 'Ambil kartu Dana Umum: bisa dapat uang, bayar tagihan, atau kartu Bebas Penjara.' },
  chance: { icon: 'fa-question', text: 'Ambil kartu Kesempatan: bisa terbang ke kota lain, mundur, atau kejutan lainnya!' },
  tax: { icon: 'fa-receipt', text: 'Bayar pajak ke bank.' },
  jail: { icon: 'fa-building-shield', text: `Kalau cuma mampir, aman. Kalau dipenjara: bayar ${rp(E.JAIL_FINE)}, pakai kartu Bebas Penjara, atau lempar dadu dobel (maks 3x).` },
  park: { icon: 'fa-square-parking', text: 'Istirahat gratis. Kalau aturan Jackpot Parkir Bebas aktif, semua pajak & denda terkumpul di sini untuk yang berhenti.' },
  gotojail: { icon: 'fa-handcuffs', text: 'Langsung masuk penjara tanpa melewati START.' }
};
const AIR_ICON = 'fa-plane-departure';
const groupColor = s => s.group ? E.GROUPS[s.group].color : s.type === 'air' ? '#5856D6' : s.type === 'util' ? '#FFB800' : '#8E8E93';

export function myTurnCount() { if (!S.me) return 0; return Object.values(S.games).filter(g => g.status === 'playing' && (g.waiting || []).includes(S.me.id)).length; }

export function initGame() {
  on('game', ({ game }) => { if (game.id === gid) enqueue(game); });
  on('init', async () => { if (gid && topScreen() === scr) { try { const g = await call('game.get', { id: gid }); queue = []; applyNow(g); } catch (e) {} } });
  on('emote', m => { if (m.id === gid) showEmote(m.uid, m.emoji); });
  on('create-room', ({ invite }) => createRoom(invite));
  on('badges', () => paintChatBadge());
  on('gindex', m => { if (m.remove && m.remove === gid && topScreen() === scr) { toast('Room dihapus'); popScreen(); } });
  setInterval(tick, 1000);
}

// ================= TAB GAMES =================
export function renderGamesTab(el) {
  const uid = me();
  const games = Object.values(S.games).sort((a, b) => b.updatedAt - a.updatedAt);
  const mine = games.filter(g => g.players.includes(uid) && g.status !== 'ended');
  const myTurn = mine.filter(g => g.status === 'playing' && (g.waiting || []).includes(uid));
  const others = mine.filter(g => !myTurn.includes(g));
  const open = games.filter(g => g.status === 'lobby' && !g.players.includes(uid) && g.players.length < g.max);
  const watching = games.filter(g => g.status === 'playing' && !g.players.includes(uid));
  const history = games.filter(g => g.status === 'ended' && g.players.includes(uid)).slice(0, 6);
  const board = Object.values(S.users).filter(u => (u.stats || {}).played).sort((a, b) => (b.stats.wins - a.stats.wins) || (b.stats.played - a.stats.played)).slice(0, 10);
  const skyline = ['eiffel', 'bigben', 'monas', 'burj', 'liberty', 'tokyotower'].map(k => landmarkSvg(k)).join('');
  el.innerHTML = `<div class="nav"><div class="nav-row"><span style="min-width:36px"></span><span class="nav-title"></span><button class="icon-btn" id="gt-me" aria-label="Saya">${avatar(S.me, 32)}</button></div></div>
  <div class="page"><h1 class="large-title">Games</h1>
    <div class="hero"><div class="skyline">${skyline}</div>
      <h2>Nexo Kota Dunia</h2><p>Keliling 22 kota dunia, beli properti, bangun hotel, dan bikin temanmu bangkrut 😈</p>
      <div class="chips"><span class="chip">2–10 pemain</span><span class="chip">⚡ Live</span><span class="chip">☕ Santai</span></div>
      <button class="btn white md" id="gt-new"><i class="fa-solid fa-plus"></i> Buat Room</button></div>
    ${myTurn.length ? `<div class="section-h big">Giliranmu 🔥</div><div class="list">${myTurn.map(roomRow).join('')}</div>` : ''}
    ${others.length ? `<div class="section-h big">Room Kamu</div><div class="list">${others.map(roomRow).join('')}</div>` : ''}
    ${open.length ? `<div class="section-h big">Room Terbuka</div><div class="list">${open.map(roomRow).join('')}</div>` : ''}
    ${!mine.length && !open.length ? `<div class="list" style="margin-top:18px"><div class="empty"><i class="fa-solid fa-dice"></i>Belum ada room. Buat room, lalu ajak teman-temanmu!</div></div>` : ''}
    ${watching.length ? `<div class="section-h big">Sedang Berlangsung</div><div class="list">${watching.map(roomRow).join('')}</div>` : ''}
    ${board.length ? `<div class="section-h big">Papan Juara 🏆</div><div class="list">${board.map((u, i) => `<div class="row has-avatar"><span class="lb-rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(u, 36)}<div class="main"><div class="t">${esc(u.name)}</div><div class="s">${u.stats.played} main · ${Math.round(u.stats.wins / u.stats.played * 100)}% menang</div></div><b>${u.stats.wins}</b></div>`).join('')}</div>` : ''}
    ${history.length ? `<div class="section-h big">Riwayat</div><div class="list">${history.map(roomRow).join('')}</div>` : ''}
    <div class="section-h big">Segera Hadir</div>
    <div class="soon">${[['Ludo Seru', 'fa-chess-board', 'bg-red'], ['Kartu Uno-an', 'fa-layer-group', 'bg-orange'], ['Tebak Gambar', 'fa-pen-nib', 'bg-purple'], ['Kuis Teman', 'fa-circle-question', 'bg-teal']].map(([t, i, c]) => `<div class="card"><span class="ico ${c}"><i class="fa-solid ${i}"></i></span><div class="b">${t}</div><div class="small muted">Segera</div></div>`).join('')}</div>
  </div>`;
  $('#gt-new').onclick = () => createRoom();
  $('#gt-me').onclick = () => $('[data-tab="me"]').click();
  el.querySelectorAll('[data-room]').forEach(b => b.onclick = () => openGame(b.dataset.room));
}
function roomRow(g) {
  const uid = me();
  let status;
  if (g.status === 'lobby') status = `Menunggu pemain · ${g.players.length}/${g.max}`;
  else if (g.status === 'ended') status = g.winner ? `🏆 ${user(g.winner).name} menang` : 'Selesai';
  else status = (g.waiting || []).includes(uid) ? 'Giliranmu!' : `Menunggu ${(g.waiting || []).map(x => user(x).name).join(', ')}`;
  const right = g.status === 'playing' && (g.waiting || []).includes(uid) ? '<span class="pill turn">Main</span>' : g.status === 'lobby' && !g.players.includes(uid) ? '<span class="btn sm tint">Gabung</span>' : '<i class="fa-solid fa-chevron-right chev"></i>';
  return `<button class="row tap room" data-room="${g.id}"><span class="room-ico" style="${g.status === 'ended' ? 'background:linear-gradient(140deg,#FFCC00,#FF9500)' : g.mode === 'live' ? 'background:linear-gradient(140deg,#FF3B30,#FF2D55)' : ''}"><i class="fa-solid ${g.status === 'ended' ? 'fa-trophy' : 'fa-city'}"></i></span>
    <div class="main" style="padding:0"><div class="t b ell">${esc(g.name)}</div><div class="s" style="display:flex;gap:6px;align-items:center;margin-top:3px"><span class="pill ${g.mode}">${g.mode === 'live' ? 'Live' : 'Santai'}</span><span class="ell">${esc(status)}</span></div>
    <div class="av-stack" style="margin-top:6px">${g.players.slice(0, 8).map(p => avatar(p, 22)).join('')}</div></div>${right}</button>`;
}

// ================= BUAT ROOM =================
function createRoom(invite = []) {
  const st = { name: `Room ${S.me.name}`, mode: 'santai', maxPlayers: 6, startCash: 15000000, turnSec: 60, timeLimitMin: 0, auction: true, freeParking: true, invite: new Set(invite) };
  const friends = Object.values(S.users).filter(u => u.id !== me());
  const sh = sheet({ title: 'Room Baru', left: 'Batal', right: 'Buat', tall: true });
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(st[key]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const paint = () => {
    sh.body.innerHTML = `<div class="list"><div class="row"><div class="main"><div class="t">Nama room</div></div><input class="inline" id="cr-name" maxlength="40" value="${esc(st.name)}"></div></div>
      <div class="section-h">Mode</div>
      <div class="list"><div class="row" style="display:block;padding:12px">${seg('mode', [['santai', '☕ Santai'], ['live', '⚡ Live']])}
        <p class="small muted" style="margin-top:10px;line-height:1.4">${st.mode === 'live' ? 'Main bareng di waktu yang sama. Ada batas waktu tiap giliran; kalau habis, giliran berjalan otomatis.' : 'Cocok buat beda zona waktu. Main kapan saja; kamu dapat notifikasi saat giliranmu tiba. Satu game bisa berhari-hari.'}</p></div></div>
      <div class="section-h">Pengaturan</div>
      <div class="list">
        <div class="row"><div class="main"><div class="t">Maks. pemain</div></div><b style="min-width:28px;text-align:center">${st.maxPlayers}</b><div class="stepper"><button data-step="-1">−</button><button data-step="1">+</button></div></div>
        <div class="row" style="display:block;padding:10px 16px"><div class="t" style="margin-bottom:8px">Uang awal</div>${seg('startCash', [[10000000, 'Rp 10 jt'], [15000000, 'Rp 15 jt'], [20000000, 'Rp 20 jt'], [25000000, 'Rp 25 jt']])}</div>
        ${st.mode === 'live' ? `<div class="row" style="display:block;padding:10px 16px"><div class="t" style="margin-bottom:8px">Waktu per giliran</div>${seg('turnSec', [[30, '30 dtk'], [60, '1 mnt'], [90, '1,5 mnt'], [120, '2 mnt']])}</div>` : ''}
        <div class="row" style="display:block;padding:10px 16px"><div class="t" style="margin-bottom:8px">Batas waktu game</div>${seg('timeLimitMin', [[0, 'Tanpa'], [30, '30 mnt'], [60, '1 jam'], [90, '1,5 jam']])}
          <p class="small muted" style="margin-top:8px">Kalau waktu habis, pemain terkaya yang menang.</p></div>
        <div class="row"><div class="main"><div class="t">Lelang</div><div class="s">Kota yang tidak dibeli akan dilelang</div></div><label class="switch"><input type="checkbox" data-tg="auction" ${st.auction ? 'checked' : ''}><span></span></label></div>
        <div class="row"><div class="main"><div class="t">Jackpot Parkir Bebas</div><div class="s">Pajak & denda dikumpulkan untuk yang berhenti di Parkir</div></div><label class="switch"><input type="checkbox" data-tg="freeParking" ${st.freeParking ? 'checked' : ''}><span></span></label></div>
      </div>
      <div class="section-h">Ajak teman (dapat notifikasi)</div>
      ${friends.length ? `<div class="chips-select">${friends.map(u => `<button data-inv="${u.id}" class="${st.invite.has(u.id) ? 'on' : ''}">${avatar(u, 22)}${esc(u.name)}</button>`).join('')}</div>` : '<p class="small muted">Belum ada teman yang terdaftar.</p>'}
      <div style="height:20px"></div>`;
  };
  paint();
  sh.body.addEventListener('click', e => {
    const segBtn = e.target.closest('.seg button');
    if (segBtn) { const key = segBtn.parentElement.dataset.key; const v = segBtn.dataset.v; st[key] = key === 'mode' ? v : Number(v); keepName(); paint(); return; }
    const step = e.target.closest('[data-step]'); if (step) { st.maxPlayers = Math.max(2, Math.min(10, st.maxPlayers + Number(step.dataset.step))); keepName(); paint(); return; }
    const inv = e.target.closest('[data-inv]'); if (inv) { st.invite.has(inv.dataset.inv) ? st.invite.delete(inv.dataset.inv) : st.invite.add(inv.dataset.inv); inv.classList.toggle('on'); }
  });
  sh.body.addEventListener('change', e => { const t = e.target.closest('[data-tg]'); if (t) st[t.dataset.tg] = t.checked; });
  const keepName = () => { const n = $('#cr-name', sh.body); if (n) st.name = n.value; };
  sh.onRight = async () => {
    keepName(); sh.setRight('…', true);
    try {
      const g = await call('game.create', { name: st.name, mode: st.mode, invite: [...st.invite], settings: { maxPlayers: st.maxPlayers, startCash: st.startCash, turnSec: st.turnSec, timeLimitMin: st.timeLimitMin, auction: st.auction, freeParking: st.freeParking } });
      sh.close(); openGame(g.id, g);
    } catch (e) { sh.setRight('Buat', false); toast(e.message); }
  };
}

// ================= LAYAR GAME =================
export async function openGame(id, preload) {
  if (!S.me) return;
  if (gid !== id) { built = false; G = null; disp = {}; queue = []; busy = false; }
  gid = id;
  scr.innerHTML = `<div class="nav g-nav"><div class="nav-row"><button class="back" id="g-back"><i class="fa-solid fa-chevron-left"></i>Games</button>
    <div class="nav-title"><span class="ell" id="g-title" style="max-width:100%">…</span><span class="nav-sub" id="g-sub"></span></div>
    <span style="min-width:70px;display:flex;justify-content:flex-end;gap:2px"><button class="icon-btn" id="g-chat" aria-label="Chat"><i class="fa-solid fa-comment"></i><span class="badge hidden" id="g-cb"></span></button><button class="icon-btn" id="g-more" aria-label="Menu"><i class="fa-solid fa-ellipsis"></i></button></span></div></div>
    <div class="screen-body" id="g-body"><div id="g-root"><div class="empty" style="padding-top:30vh"><span class="spin"></span></div></div></div>`;
  $('#g-back').onclick = () => popScreen();
  $('#g-chat').onclick = () => pickFriend('Kirim Pesan');
  $('#g-more').onclick = e => moreMenu(e.currentTarget);
  paintChatBadge();
  pushScreen(scr, () => { fire('game.unwatch'); gid = null; G = null; built = false; setView('tab'); });
  scr.dataset.view = 'game:' + id; setView('game:' + id);
  try {
    const g = preload || await call('game.get', { id });
    if (gid === id) applyNow(g);
  } catch (e) { toast(e.message); popScreen(); }
}
function paintChatBadge() { const b = $('#g-cb'); if (!b) return; const n = totalUnread(); b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); }

function enqueue(g) { queue.push(g); if (!busy) drain(); }
async function drain() {
  busy = true;
  while (queue.length) {
    const g = queue.shift();
    if (!G || G.status !== g.status || !built || queue.length > 2) { applyNow(g); continue; }
    await animateTo(g);
  }
  busy = false;
}
function applyNow(g) {
  const statusChanged = !G || G.status !== g.status;
  G = g;
  shown = { moveSeq: g.moveSeq, diceSeq: g.diceSeq, cardSeq: g.cardSeq };
  g.players.forEach(p => disp[p.id] = p.pos);
  render(statusChanged);
}
async function animateTo(g) {
  const old = G;
  const newDice = g.diceSeq !== shown.diceSeq && g.dice;
  const newMoves = g.moveSeq !== shown.moveSeq ? g.moves || [] : [];
  const newCard = g.cardSeq !== shown.cardSeq && g.card;
  G = g;
  if (newDice) { renderCenterDiceRoll(g.dice.d); await sleep(700); }
  for (const mv of newMoves) await animateMove(mv);
  shown = { moveSeq: g.moveSeq, diceSeq: g.diceSeq, cardSeq: g.cardSeq };
  g.players.forEach(p => disp[p.id] = p.pos);
  render(false);
  if (newCard) await showCard(g.card);
  if (old && g.status === 'ended') render(true);
}
async function animateMove(mv) {
  const tok = $(`.token[data-uid="${mv.uid}"]`); if (!tok) return;
  if (mv.kind === 'jump') { disp[mv.uid] = mv.to; placeTokens(); await sleep(350); highlight(mv.to); return; }
  const dir = mv.kind === 'back' ? -1 : 1;
  let pos = mv.from, guard = 0;
  while (pos !== mv.to && guard++ < 45) {
    pos = (pos + dir + 40) % 40; disp[mv.uid] = pos; placeTokens();
    tok.classList.remove('hop'); void tok.offsetWidth; tok.classList.add('hop');
    await sleep(170);
  }
  highlight(mv.to); haptic(8);
  await sleep(120);
}
function highlight(pos) { const t = $(`.tile[data-i="${pos}"]`); if (t) { t.classList.remove('landed'); void t.offsetWidth; t.classList.add('landed'); } }

function render(full) {
  if (!G) return;
  $('#g-title').textContent = G.name;
  $('#g-sub').innerHTML = `<span class="pill ${G.mode}" style="font-size:10px">${G.mode === 'live' ? 'Live' : 'Santai'}</span> ${G.status === 'lobby' ? 'Lobi' : G.status === 'ended' ? 'Selesai' : `${G.players.filter(p => !p.bankrupt).length} pemain`}`;
  const root = $('#g-root');
  if (G.status === 'lobby') { built = false; root.innerHTML = lobbyHtml(); bindLobby(); return; }
  if (!built || full) { root.innerHTML = gameShellHtml(); built = true; bindShell(); }
  updateTiles(); placeTokens(); renderCenter(); renderPanel();
  if (G.status === 'ended') celebrate();
}

// ---------- Lobi ----------
function lobbyHtml() {
  const uid = me(), joined = !!pl(uid), host = G.host === uid || (S.me.admin && false), full = G.players.length >= G.settings.maxPlayers;
  const s = G.settings;
  return `<div class="page" style="padding-bottom:40px">
    <div class="lobby-top"><span class="room-ico" style="${G.mode === 'live' ? 'background:linear-gradient(140deg,#FF3B30,#FF2D55)' : ''}"><i class="fa-solid fa-city"></i></span>
      <div class="b" style="font-size:24px">${esc(G.name)}</div><div class="muted small">Dibuat oleh ${esc(user(G.host).name)} · <span class="pill ${G.mode}">${G.mode === 'live' ? '⚡ Live' : '☕ Santai'}</span></div></div>
    <div class="section-h">Pemain ${G.players.length}/${s.maxPlayers}</div>
    <div class="list">${G.players.map(p => `<div class="row has-avatar">${avatar(p.id, 40, { ring: p.color, dot: true })}<div class="main"><div class="t">${esc(user(p.id).name)}${p.id === uid ? ' (kamu)' : ''}</div><div class="s">${p.id === G.host ? '👑 Host' : 'Siap main'}</div></div>${host && p.id !== uid ? `<button class="icon-btn" data-kick="${p.id}" aria-label="Keluarkan"><i class="fa-solid fa-circle-minus c-red"></i></button>` : ''}</div>`).join('')}
      ${Array.from({ length: Math.max(0, Math.min(3, s.maxPlayers - G.players.length)) }, () => `<div class="row has-avatar"><span class="av" style="--s:40px;background:var(--fill3);color:var(--label3);font-size:16px"><i class="fa-solid fa-user-plus"></i></span><div class="main"><div class="t faint">Menunggu teman…</div></div></div>`).join('')}</div>
    <div style="padding:12px 0 0"><button class="btn block tint" id="lb-invite"><i class="fa-solid fa-paper-plane"></i> Ajak teman</button></div>
    <div class="section-h">Aturan</div>
    <div class="list">
      <div class="row"><div class="main"><div class="t">Uang awal</div></div><span class="val">${rp(s.startCash)}</span></div>
      ${G.mode === 'live' ? `<div class="row"><div class="main"><div class="t">Waktu per giliran</div></div><span class="val">${s.turnSec} dtk</span></div>` : ''}
      <div class="row"><div class="main"><div class="t">Batas waktu game</div></div><span class="val">${s.timeLimitMin ? s.timeLimitMin + ' mnt' : 'Tanpa'}</span></div>
      <div class="row"><div class="main"><div class="t">Lelang</div></div><span class="val">${s.auction ? 'Aktif' : 'Mati'}</span></div>
      <div class="row"><div class="main"><div class="t">Jackpot Parkir Bebas</div></div><span class="val">${s.freeParking ? 'Aktif' : 'Mati'}</span></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;padding-top:22px">
      ${host ? `<button class="btn block green" id="lb-start" ${G.players.length < 2 ? 'disabled' : ''}><i class="fa-solid fa-play"></i> Mulai Game</button>${G.players.length < 2 ? '<p class="small muted" style="text-align:center">Minimal 2 pemain untuk mulai.</p>' : ''}` : ''}
      ${!joined ? `<button class="btn block" id="lb-join" ${full ? 'disabled' : ''}>${full ? 'Room penuh' : 'Gabung'}</button>` : ''}
      ${joined && !host ? `<p class="small muted" style="text-align:center">Menunggu ${esc(user(G.host).name)} memulai game…</p><button class="btn block gray" id="lb-leave">Keluar dari room</button>` : ''}
      ${host ? `<button class="btn block tint red" id="lb-del">Hapus room</button>` : ''}
      <button class="link" id="lb-rules" style="font-size:15px"><i class="fa-regular fa-circle-question"></i> Cara main</button>
    </div></div>`;
}
function bindLobby() {
  const act = async (t, extra = {}) => { try { const g = await call(t, Object.assign({ id: gid }, extra)); if (g && g.id) applyNow(g); } catch (e) { toast(e.message); } };
  const b = id => $('#' + id);
  if (b('lb-start')) b('lb-start').onclick = () => act('game.start');
  if (b('lb-join')) b('lb-join').onclick = () => act('game.join');
  if (b('lb-leave')) b('lb-leave').onclick = async () => { await act('game.leave'); popScreen(); };
  if (b('lb-del')) b('lb-del').onclick = async () => { if (await confirmBox('Hapus room?', '', 'Hapus', true)) { try { await call('game.delete', { id: gid }); popScreen(); } catch (e) { toast(e.message); } } };
  b('lb-invite').onclick = inviteSheet;
  b('lb-rules').onclick = rulesSheet;
  $$('[data-kick]').forEach(k => k.onclick = () => act('game.kick', { uid: k.dataset.kick }));
}
function inviteSheet() {
  const friends = Object.values(S.users).filter(u => u.id !== me() && !(G && pl(u.id)));
  const sel = new Set();
  const sh = sheet({ title: 'Ajak Teman', left: 'Batal', right: 'Kirim', body: friends.length ? `<p class="small muted" style="padding:0 4px 10px">Teman yang dipilih akan dapat notifikasi ajakan.</p><div class="list">${friends.map(u => `<button class="row has-avatar tap" data-u="${u.id}">${avatar(u, 40, { dot: true })}<div class="main"><div class="t">${esc(u.name)}</div></div><i class="fa-regular fa-circle" style="font-size:22px;color:var(--label3)"></i></button>`).join('')}</div>` : '<div class="empty">Semua teman sudah ada di room ini.</div>' });
  sh.body.onclick = e => { const r = e.target.closest('[data-u]'); if (!r) return; const id = r.dataset.u; const i = r.querySelector('i'); if (sel.has(id)) { sel.delete(id); i.className = 'fa-regular fa-circle'; i.style.color = 'var(--label3)'; } else { sel.add(id); i.className = 'fa-solid fa-circle-check'; i.style.color = 'var(--blue)'; } };
  sh.onRight = async () => { if (!sel.size) return sh.close(); try { await call('game.invite', { id: gid, uids: [...sel] }); toast('Ajakan terkirim', 'fa-paper-plane'); sh.close(); } catch (e) { toast(e.message); } };
}

// ---------- Papan ----------
function gridPos(i) {
  if (i === 0) return [11, 11]; if (i < 10) return [11, 11 - i]; if (i === 10) return [11, 1]; if (i < 20) return [11 - (i - 10), 1];
  if (i === 20) return [1, 1]; if (i < 30) return [1, i - 19]; if (i === 30) return [1, 11]; return [i - 29, 11];
}
const sideOf = i => (i % 10 === 0 ? 'c' : i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r');
const CW = 1.6, TOTAL = 9 + CW * 2;
const span = c => c === 1 ? [0, CW] : c === 11 ? [CW + 9, TOTAL] : [CW + c - 2, CW + c - 1];
function tileCenter(i) { const [r, c] = gridPos(i); const x = span(c), y = span(r); return [(x[0] + x[1]) / 2 / TOTAL * 100, (y[0] + y[1]) / 2 / TOTAL * 100]; }

function tileHtml(s) {
  const [r, c] = gridPos(s.i), side = sideOf(s.i);
  const st = `grid-area:${r}/${c};--gc:${groupColor(s)}`;
  if (side === 'c') {
    const ic = { go: 'fa-arrow-left', jail: 'fa-building-shield', park: 'fa-square-parking', gotojail: 'fa-handcuffs' }[s.type];
    const nm = { go: 'START', jail: 'Penjara', park: 'Parkir', gotojail: 'Masuk Penjara' }[s.type];
    return `<div class="tile corner t-${s.type}" data-i="${s.i}" style="${st}"><div class="in"><i class="fas ${ic}"></i><span class="nm">${nm}</span>${s.type === 'go' ? `<span class="pr">+${rp(E.GO_SALARY).replace('Rp ', '')}</span>` : ''}</div></div>`;
  }
  let inner;
  if (s.type === 'prop') inner = `${landmarkSvg(s.icon)}<span class="nm">${esc(s.short)}</span><span class="pr">${rp(s.price).replace('Rp ', '')}</span>`;
  else if (s.type === 'air') inner = `<i class="fas ${AIR_ICON}"></i><span class="nm">${esc(s.code)}</span><span class="pr">${rp(s.price).replace('Rp ', '')}</span>`;
  else if (s.type === 'util') inner = `<i class="fas ${s.icon === 'bolt' ? 'fa-bolt' : 'fa-droplet'}"></i><span class="nm">${esc(s.short)}</span>`;
  else if (s.type === 'chance') inner = `<i class="fas fa-question"></i><span class="nm">Kesempatan</span>`;
  else if (s.type === 'chest') inner = `<i class="fas fa-gift"></i><span class="nm">Dana</span>`;
  else if (s.type === 'tax') inner = `<i class="fas fa-receipt"></i><span class="nm">Pajak</span><span class="pr">${rp(s.amount).replace('Rp ', '')}</span>`;
  return `<div class="tile s-${side} t-${s.type}" data-i="${s.i}" style="${st}">${s.type === 'prop' ? '<div class="bar"></div>' : ''}<div class="own hidden"></div><div class="in">${inner}</div></div>`;
}
function gameShellHtml() {
  return `<div class="g-wrap"><div class="board-wrap"><div class="board" id="board">${E.SPACES.map(tileHtml).join('')}<div class="center" id="center"></div><div class="tokens" id="tokens"></div></div></div>
    <div class="g-side"><div class="g-panel"><div class="seg" id="p-seg">
      <button data-p="players">Pemain</button><button data-p="assets">Asetku</button><button data-p="trades">Tawaran</button><button data-p="log">Riwayat</button></div><div id="p-body"></div></div></div></div>`;
}
function bindShell() {
  $('#board').addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) propertySheet(+t.dataset.i); });
  $('#p-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; panelTab = b.dataset.p; LS.set('nexo.ptab', panelTab); renderPanel(); };
}
function updateTiles() {
  for (const s of E.SPACES) {
    if (!E.OWNABLE.has(s.type)) continue;
    const t = $(`.tile[data-i="${s.i}"]`); if (!t) continue;
    const o = G.props[s.i];
    const own = t.querySelector('.own');
    if (o) { own.classList.remove('hidden'); own.style.setProperty('--oc', (pl(o.owner) || {}).color || '#888'); } else own.classList.add('hidden');
    t.classList.toggle('mort', !!(o && o.mortgaged));
    const bar = t.querySelector('.bar');
    if (bar) { const h = o ? o.houses || 0 : 0; bar.innerHTML = h === 5 ? '<i class="hotel"></i>' : '<i></i>'.repeat(h); }
  }
}
function placeTokens() {
  const box = $('#tokens'); if (!box || !G) return;
  const alive = G.players.filter(p => !p.bankrupt);
  const byPos = {};
  alive.forEach(p => { const pos = disp[p.id] ?? p.pos; (byPos[pos] = byPos[pos] || []).push(p); });
  const existing = new Set();
  for (const [pos, list] of Object.entries(byPos)) {
    const [cx, cy] = tileCenter(+pos);
    const n = list.length;
    list.forEach((p, k) => {
      existing.add(p.id);
      let tok = box.querySelector(`.token[data-uid="${p.id}"]`);
      if (!tok) { tok = document.createElement('div'); tok.className = 'token'; tok.dataset.uid = p.id; box.appendChild(tok); }
      const html = avatar(p.id, 20);
      if (tok.dataset.av !== html) { tok.innerHTML = html; tok.dataset.av = html; }
      tok.style.setProperty('--pc', p.color);
      const ang = n > 1 ? (k / n) * Math.PI * 2 - Math.PI / 2 : 0, rad = n > 1 ? (n > 4 ? 2.6 : 2) : 0;
      tok.style.left = (cx + Math.cos(ang) * rad) + '%'; tok.style.top = (cy + Math.sin(ang) * rad) + '%';
      tok.classList.toggle('jailed', !!p.jail && +pos === E.JAIL_POS);
      tok.classList.toggle('me', p.id === me());
    });
  }
  $$('.token', box).forEach(t => { if (!existing.has(t.dataset.uid)) t.remove(); });
}

// ---------- Tengah papan ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHtml = (n, red) => `<div class="die ${red ? 'red' : ''}">${Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[n] || []).includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
function renderCenterDiceRoll(d) {
  const el = $('#c-dice'); if (!el) return;
  el.innerHTML = dieHtml(d[0]) + dieHtml(d[1], d[0] === d[1]);
  el.classList.remove('rolling'); void el.offsetWidth; el.classList.add('rolling'); haptic(20);
}
function timeLeft() { return G && G.deadline ? Math.max(0, Math.ceil((G.deadline - Date.now() - S.serverSkew) / 1000)) : null; }
function tick() {
  if (!G || G.status !== 'playing') return;
  const el = $('#c-tm'); if (!el) return;
  const t = timeLeft(); if (t === null) { el.textContent = ''; return; }
  el.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  el.classList.toggle('hot', t <= 10);
}
function lastLog() { for (let i = G.log.length - 1; i >= 0; i--) if (G.log[i].kind !== 'sys' || /dimulai|menang|habis/.test(G.log[i].text)) return G.log[i]; return null; }
function renderCenter() {
  const el = $('#center'); if (!el) return;
  const uid = me(), p = pl(uid), waiting = E.waitingFor(G), myWait = waiting.includes(uid);
  const d = G.dice ? G.dice.d : [1, 1];
  let h = `<div class="logo">NEXO</div>`;
  if (G.settings.freeParking && G.status === 'playing') h += `<div class="c-pot"><i class="fa-solid fa-square-parking"></i> ${rp(G.pot)}</div>`;
  h += `<div class="c-tools">${p && G.status === 'playing' ? '<button id="c-emo" aria-label="Emoji">😀</button>' : ''}<button id="c-help" aria-label="Cara main"><i class="fa-regular fa-circle-question"></i></button></div>`;
  if (G.status === 'ended') {
    const w = pl(G.winner);
    h += `<div style="font-size:12cqw">🏆</div><div class="c-msg"><b>${esc(w ? w.name : '')}</b> menang!</div><div class="c-sub">Kekayaan ${rp((G.ranking || [])[0] ? G.ranking[0].worth : 0)}</div>
      <div class="c-actions"><button class="btn" id="c-res">Lihat hasil</button><button class="btn gray" id="c-again">Main lagi</button></div>`;
    el.innerHTML = h; bindCenter(); return;
  }
  const who = waiting.length === 1 ? pl(waiting[0]) : null;
  const chipName = myWait ? 'Giliranmu!' : who ? who.name : `${waiting.length} pemain`;
  h += `<div class="turn-chip" style="--pc:${who ? who.color : '#8E8E93'}">${who ? avatar(who.id, 22) : ''}<span class="ell">${esc(chipName)}</span><span class="tm" id="c-tm"></span></div>`;
  h += `<div class="dice" id="c-dice">${dieHtml(d[0])}${dieHtml(d[1], d[0] === d[1])}</div>`;
  const ll = lastLog();
  let msg = ll ? esc(ll.text) : '', acts = '';
  const ph = G.phase;
  if (ph === 'roll') {
    const cp = E.current(G);
    if (myWait) {
      if (p.jail) {
        msg = `Kamu di penjara (${p.jailTurns}/3). Pilih cara keluar:`;
        acts = `<button class="btn orange sm" data-a="jail-pay" ${p.cash < E.JAIL_FINE ? 'disabled' : ''}>Bayar ${rp(E.JAIL_FINE)}</button>${p.jailCards.length ? '<button class="btn green sm" data-a="jail-card">Pakai kartu</button>' : ''}<button class="btn sm" data-a="roll">🎲 Coba dobel</button>`;
      } else acts = `<button class="btn" data-a="roll">🎲 Lempar Dadu</button>`;
      if (G.rolledDouble && p.dbl > 0) msg = `Dobel! Lempar sekali lagi 🎉`;
    } else if (cp && cp.jail) msg = `${esc(cp.name)} di penjara… ` + msg;
  } else if (ph === 'buy' && G.pending) {
    const s = E.SPACES[G.pending.pos];
    if (myWait) {
      msg = `Beli <b>${esc(s.name)}</b> seharga <b>${rp(s.price)}</b>?`;
      acts = `<button class="btn green" data-a="buy" ${p.cash < s.price ? 'disabled' : ''}>Beli</button><button class="btn gray" data-a="decline">${G.settings.auction ? 'Lelang' : 'Lewati'}</button><button class="btn tint sm" data-info="${s.i}">Info</button>`;
      if (p.cash < s.price) msg += `<div class="c-sub">Uangmu kurang. Gadai aset dulu atau lelang.</div>`;
    } else msg = `${esc(who.name)} sedang memutuskan membeli <b>${esc(s.name)}</b>…`;
  } else if (ph === 'auction' && G.auction) {
    const a = G.auction, s = E.SPACES[a.pos], leader = pl(a.leader);
    msg = '';
    h += `<div class="auc"><div class="c-sub">🔨 Lelang ${esc(s.name)}</div><div class="big">${rp(a.bid)}</div><div class="c-sub">${leader ? `Tertinggi: ${esc(leader.name)}` : 'Belum ada tawaran'} · ${a.bidders.length} peserta</div></div>`;
    if (myWait) {
      const inc = [10000, 50000, 100000, 500000].filter(x => a.bid + x <= p.cash);
      acts = inc.map(x => `<button class="btn sm" data-bid="${a.bid + x}">+${rp(x).replace('Rp ', '')}</button>`).join('') + `<button class="btn sm tint" data-bidc>Tawar…</button><button class="btn sm gray" data-a="pass">Mundur</button>`;
    } else msg = `Menunggu ${esc(who ? who.name : '')} menawar…`;
  } else if (ph === 'debt') {
    const myDebt = G.debts.find(x => x.from === uid);
    if (myDebt) {
      const to = myDebt.to ? pl(myDebt.to) : null;
      msg = `Kamu harus bayar <b>${rp(myDebt.amount)}</b> ${to ? 'ke ' + esc(to.name) : 'ke bank'} (${esc(myDebt.reason)}). Uangmu ${rp(p.cash)}.`;
      acts = `<button class="btn green sm" data-a="pay-debt" ${p.cash < myDebt.amount ? 'disabled' : ''}>Bayar</button><button class="btn sm" data-tab="assets">Gadai / jual</button><button class="btn sm tint red" data-a="bankrupt">Bangkrut</button>`;
    } else msg = `Menunggu ${waiting.map(x => esc(pl(x).name)).join(', ')} melunasi utang…`;
  } else if (ph === 'end') {
    if (myWait) { acts = `<button class="btn" data-a="end">Selesai Giliran</button><button class="btn sm tint" data-tab="assets">Bangun / Aset</button>`; }
  }
  if (!myWait && G.status === 'playing' && p && !p.bankrupt && ph !== 'debt') {
    if (!acts) msg = msg || `Menunggu ${esc(who ? who.name : '')}…`;
    if (G.mode === 'santai' || !G.deadline) acts += `<button class="btn sm tint" id="c-nudge">👋 Colek</button>`;
  }
  if (!p) acts = `<span class="c-sub">Kamu menonton game ini 👀</span>`;
  else if (p.bankrupt) acts = `<span class="c-sub">Kamu sudah bangkrut. Tonton sampai selesai 👀</span>`;
  h += `<div class="c-msg">${msg}</div><div class="c-actions">${acts}</div>`;
  el.innerHTML = h;
  bindCenter(); tick();
}
function bindCenter() {
  const el = $('#center');
  el.onclick = async e => {
    const a = e.target.closest('[data-a]'), bid = e.target.closest('[data-bid]'), info = e.target.closest('[data-info]'), tb = e.target.closest('[data-tab]');
    if (a) {
      if (a.dataset.a === 'bankrupt' && !await confirmBox('Nyatakan bangkrut?', 'Semua asetmu akan diserahkan. Kamu keluar dari permainan.', 'Bangkrut', true)) return;
      return act({ type: a.dataset.a }, a);
    }
    if (bid) return act({ type: 'bid', amount: +bid.dataset.bid }, bid);
    if (e.target.closest('[data-bidc]')) {
      const v = await alertBox({ title: 'Tawaran kamu', message: `Tertinggi sekarang ${rp(G.auction.bid)}. Ketik angka dalam ribuan (mis. 750 = Rp 750 rb).`, input: { inputmode: 'numeric', placeholder: 'ribu rupiah' }, buttons: [{ text: 'Batal', value: false }, { text: 'Tawar', value: true, bold: true }] });
      const n = Math.round(Number(String(v || '').replace(/\D/g, ''))) * 1000; if (n) act({ type: 'bid', amount: n });
      return;
    }
    if (info) return propertySheet(+info.dataset.info);
    if (tb) { panelTab = tb.dataset.tab; renderPanel(); $('#p-seg').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.closest('#c-help')) return rulesSheet();
    if (e.target.closest('#c-emo')) return emotePicker(e.target.closest('#c-emo'));
    if (e.target.closest('#c-nudge')) { try { await call('game.nudge', { id: gid }); toast('Colekan terkirim 👋'); } catch (er) { toast(er.message); } return; }
    if (e.target.closest('#c-res')) return resultsSheet();
    if (e.target.closest('#c-again')) return playAgain();
  };
}
async function act(a, btn) {
  if (btn) { btn.disabled = true; }
  try { await call('game.act', { id: gid, a }); haptic(8); }
  catch (e) { toast(e.message); if (btn) btn.disabled = false; }
}

// ---------- Panel bawah ----------
function renderPanel() {
  const body = $('#p-body'); if (!body) return;
  const uid = me();
  const incoming = G.trades.filter(t => t.to === uid).length;
  $$('#p-seg button').forEach(b => { b.classList.toggle('on', b.dataset.p === panelTab); if (b.dataset.p === 'trades') b.innerHTML = 'Tawaran' + (incoming ? ` <span class="pill turn" style="padding:0 5px">${incoming}</span>` : ''); });
  if (panelTab === 'players') {
    const order = G.order.length ? G.order : G.players.map(p => p.id);
    const waiting = E.waitingFor(G);
    body.innerHTML = order.map(id => {
      const p = pl(id); if (!p) return '';
      const props = Object.values(G.props).filter(o => o.owner === id).length;
      const worth = E.netWorth(G, id);
      const rank = G.ranking ? G.ranking.findIndex(r => r.id === id) + 1 : 0;
      return `<button class="p-row ${waiting.includes(id) ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" data-pl="${id}" style="--pc:${p.color}">${avatar(id, 38)}<div class="main"><div class="nm"><span class="ell">${esc(p.name)}${id === uid ? ' (kamu)' : ''}</span>${waiting.includes(id) && G.status === 'playing' ? '<i class="fa-solid fa-circle-play c-blue" style="font-size:12px"></i>' : ''}${rank === 1 ? '🏆' : ''}</div>
        <div class="sub">${p.bankrupt ? 'Bangkrut 💥' : `${p.jail ? '🔒 Penjara · ' : ''}📍 ${esc(E.SPACES[p.pos].short)} · 🏙️ ${props}${p.jailCards.length ? ` · 🎟️ ${p.jailCards.length}` : ''}`}</div></div>
        <div class="cash">${p.bankrupt ? '—' : rp(p.cash)}<small>${p.bankrupt ? '' : 'aset ' + rp(worth)}</small></div></button>`;
    }).join('');
    body.onclick = e => { const r = e.target.closest('[data-pl]'); if (r) playerSheet(r.dataset.pl); };
  } else if (panelTab === 'assets') {
    const p = pl(uid);
    if (!p) { body.innerHTML = '<div class="empty">Kamu bukan pemain di room ini.</div>'; return; }
    const mine = Object.keys(G.props).map(Number).filter(i => G.props[i].owner === uid).sort((a, b) => a - b);
    const groups = {};
    mine.forEach(i => { const s = E.SPACES[i]; const k = s.group || s.type; (groups[k] = groups[k] || []).push(i); });
    const gname = k => E.GROUPS[k] ? E.GROUPS[k].name : k === 'air' ? 'Bandara' : 'Perusahaan';
    body.innerHTML = `<div style="padding:0 14px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div class="small muted">Uang · Total aset</div><div class="b" style="font-size:18px">${rp(p.cash)} · ${rp(E.netWorth(G, uid))}</div></div>${G.status === 'playing' && !p.bankrupt ? '<button class="btn sm tint" id="as-trade"><i class="fa-solid fa-handshake"></i> Tawar</button>' : ''}</div>
      ${mine.length ? `<div class="prop-groups">${Object.entries(groups).map(([k, list]) => {
        const full = E.GROUPS[k] && E.ownsGroup(G, uid, k);
        return `<div class="pg"><div class="pg-h"><span class="sw" style="background:${E.GROUPS[k] ? E.GROUPS[k].color : k === 'air' ? '#5856D6' : '#FFB800'}"></span>${gname(k)}${full ? ' <span class="pill" style="text-transform:none">Lengkap ✓ bisa bangun</span>' : ''}</div><div class="pc-list">${list.map(pcard).join('')}</div></div>`;
      }).join('')}</div>` : '<div class="empty"><i class="fa-solid fa-city"></i>Belum punya properti. Berhenti di kota yang belum dimiliki untuk membelinya.</div>'}
      ${p.jailCards.length ? `<p class="small muted" style="padding:0 14px 14px">🎟️ Kartu Bebas Penjara: ${p.jailCards.length}</p>` : ''}`;
    body.onclick = e => { const c = e.target.closest('[data-i]'); if (c) return propertySheet(+c.dataset.i); if (e.target.closest('#as-trade')) tradeSheet(); };
  } else if (panelTab === 'trades') {
    const list = G.trades.filter(t => t.to === uid || t.from === uid);
    const others = G.trades.filter(t => t.to !== uid && t.from !== uid);
    const side = (x) => [x.cash ? rp(x.cash) : '', ...x.props.map(i => E.SPACES[i].short), x.cards ? `🎟️×${x.cards}` : ''].filter(Boolean).map(esc).join('<br>') || '<span class="faint">—</span>';
    body.innerHTML = (list.length ? list.map(t => {
      const inc = t.to === uid, other = pl(inc ? t.from : t.to);
      return `<div class="trade"><div class="small"><b>${inc ? `${esc(other.name)} menawarkan` : `Tawaranmu ke ${esc(other.name)}`}</b></div>${t.note ? `<div class="small muted">“${esc(t.note)}”</div>` : ''}
        <div class="sides"><div class="side"><b>${inc ? 'Kamu dapat' : 'Kamu kasih'}</b>${side(t.give)}</div><div class="side"><b>${inc ? 'Kamu kasih' : 'Kamu dapat'}</b>${side(t.get)}</div></div>
        <div style="display:flex;gap:8px">${inc ? `<button class="btn sm green" data-ta="trade-accept" data-id="${t.id}">Terima</button><button class="btn sm tint red" data-ta="trade-reject" data-id="${t.id}">Tolak</button>` : `<button class="btn sm gray" data-ta="trade-cancel" data-id="${t.id}">Batalkan</button>`}</div></div>`;
    }).join('') : '<div class="empty"><i class="fa-solid fa-handshake"></i>Belum ada tawaran. Tap nama pemain untuk menawar tukar properti.</div>')
      + (others.length ? `<p class="small muted" style="padding:6px 14px 14px">${others.length} tawaran lain sedang berlangsung antar pemain.</p>` : '')
      + (pl(uid) && G.status === 'playing' && !pl(uid).bankrupt ? '<div style="padding:0 14px 14px"><button class="btn sm tint" id="tr-new"><i class="fa-solid fa-plus"></i> Buat tawaran</button></div>' : '');
    body.onclick = e => {
      const b = e.target.closest('[data-ta]'); if (b) return act({ type: b.dataset.ta, id: +b.dataset.id }, b);
      if (e.target.closest('#tr-new')) tradeSheet();
    };
  } else {
    body.innerHTML = `<div class="log">${G.log.slice().reverse().map(l => `<div class="k-${l.kind}"><time>${hm(l.ts)}</time><span>${esc(l.text)}</span></div>`).join('')}</div>`;
    body.onclick = null;
  }
}
function pcard(i) {
  const s = E.SPACES[i], o = G.props[i];
  const sub = o.mortgaged ? 'Digadai' : s.type === 'prop' ? (o.houses === 5 ? '🏨 Hotel' : o.houses ? '🏠'.repeat(o.houses) : `Sewa ${rp(E.rentFor(G, i, 7))}`) : s.type === 'air' ? `Sewa ${rp(E.rentFor(G, i, 7))}` : 'Sewa ×dadu';
  const icon = s.type === 'prop' ? landmarkSvg(s.icon) : `<i class="fa-solid ${s.type === 'air' ? AIR_ICON : s.icon === 'bolt' ? 'fa-bolt' : 'fa-droplet'}" style="font-size:20px;width:26px;text-align:center;color:${groupColor(s)}"></i>`;
  return `<button class="pcard ${o.mortgaged ? 'mort' : ''}" data-i="${i}" style="--gc:${groupColor(s)}">${icon}<div style="min-width:0"><div class="t ell">${esc(s.name)}</div><div class="s">${sub}</div></div></button>`;
}

// ---------- Sheet properti ----------
function propertySheet(i) {
  const s = E.SPACES[i], uid = me();
  if (!E.OWNABLE.has(s.type)) {
    const sp = SPECIAL[s.type] || {};
    sheet({ title: s.name, body: `<div style="text-align:center;padding:10px 6px 20px;display:flex;flex-direction:column;gap:12px;align-items:center"><span class="ico" style="width:70px;height:70px;border-radius:18px;font-size:30px;background:${s.type === 'chance' ? 'var(--orange)' : s.type === 'chest' ? 'var(--blue)' : s.type === 'tax' ? 'var(--red)' : 'var(--indigo)'}"><i class="fa-solid ${sp.icon || 'fa-circle-info'}"></i></span>
      <div class="b" style="font-size:22px">${esc(s.name)}</div><p class="muted" style="line-height:1.45">${esc(s.type === 'tax' ? `Bayar ${rp(s.amount)} ke bank${G && G.settings.freeParking ? ' (masuk jackpot Parkir Bebas)' : ''}.` : sp.text || '')}</p>
      ${playersHere(i)}</div>` });
    return;
  }
  const o = G && G.props[i], owner = o ? pl(o.owner) : null;
  const gc = groupColor(s);
  const head = `<div class="deed-head" style="background:linear-gradient(150deg, ${gc}, color-mix(in srgb, ${gc} 55%, #000))"><div class="sun"></div>
    ${s.type === 'prop' ? landmarkSvg(s.icon) : `<i class="fa-solid ${s.type === 'air' ? AIR_ICON : s.icon === 'bolt' ? 'fa-bolt' : 'fa-droplet'}" style="position:absolute;right:18px;bottom:14px;font-size:96px;color:rgba(255,255,255,.9)"></i>`}
    <div class="k">${s.type === 'prop' ? esc(s.country) : s.type === 'air' ? 'Bandara' : 'Perusahaan'}</div><h2>${esc(s.name)}</h2>${s.landmark ? `<div class="lmname">${esc(s.landmark)}</div>` : ''}</div>`;
  let rows = '';
  const level = o && !o.mortgaged ? (s.type === 'prop' ? (o.houses || 0) : null) : -1;
  if (s.type === 'prop') {
    const full = o && E.ownsGroup(G, o.owner, s.group);
    const labels = ['Sewa', 'Dengan 1 rumah', 'Dengan 2 rumah', 'Dengan 3 rumah', 'Dengan 4 rumah', 'Dengan hotel'];
    rows = s.rent.map((r, k) => `<div class="row ${level === k ? 'now' : ''}"><div class="main">${labels[k]}${k === 0 ? ' <span class="small muted">(×2 jika 1 warna lengkap)</span>' : ''}</div><span class="val">${rp(k === 0 && full ? r * 2 : r)}</span></div>`).join('')
      + `<div class="row"><div class="main">Harga rumah / hotel</div><span class="val">${rp(E.GROUPS[s.group].house)}</span></div>`;
  } else if (s.type === 'air') rows = E.AIR_RENT.map((r, k) => `<div class="row"><div class="main">Punya ${k + 1} bandara</div><span class="val">${rp(r)}</span></div>`).join('');
  else rows = `<div class="row"><div class="main">Punya 1 perusahaan</div><span class="val">4× angka dadu × 10 rb</span></div><div class="row"><div class="main">Punya 2 perusahaan</div><span class="val">10× angka dadu × 10 rb</span></div>`;
  rows += `<div class="row"><div class="main">Harga beli</div><span class="val">${rp(s.price)}</span></div><div class="row"><div class="main">Nilai gadai</div><span class="val">${rp(E.mortgageValue(i))}</span></div>`;
  let actions = '';
  const p = pl(uid);
  if (o && o.owner === uid && G.status === 'playing' && p && !p.bankrupt) {
    const bErr = s.type === 'prop' ? E.buildCheck(G, uid, i) : 'x', sErr = s.type === 'prop' ? E.sellCheck(G, uid, i) : 'x', mErr = E.mortgageCheck(G, uid, i);
    const btn = (type, label, cls, err) => `<button class="btn block ${cls}" data-pa="${type}" ${err ? 'disabled' : ''}>${label}</button>${err && err !== 'x' && type === 'build' ? `<p class="small muted" style="text-align:center;margin-top:-4px">${esc(err)}</p>` : ''}`;
    actions = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      ${s.type === 'prop' ? btn('build', `<i class="fa-solid fa-house"></i> Bangun ${(o.houses || 0) >= 4 ? 'hotel' : 'rumah'} · ${rp(E.GROUPS[s.group].house)}`, 'green', bErr) : ''}
      ${s.type === 'prop' && (o.houses || 0) > 0 ? btn('sell', `Jual bangunan · +${rp(E.GROUPS[s.group].house / 2)}`, 'gray', sErr) : ''}
      ${o.mortgaged ? btn('unmortgage', `Tebus gadai · ${rp(E.unmortgageCost(i))}`, 'tint', p.cash < E.unmortgageCost(i) ? 'Uang kurang' : null) : btn('mortgage', `Gadaikan · +${rp(E.mortgageValue(i))}`, 'tint red', mErr)}
      ${mErr && !o.mortgaged && mErr !== 'Sudah digadai.' ? `<p class="small muted" style="text-align:center">${esc(mErr)}</p>` : ''}</div>`;
  } else if (o && owner && owner.id !== uid && p && !p.bankrupt && G.status === 'playing') {
    actions = `<div style="margin-top:16px"><button class="btn block tint" data-trade="${owner.id}" data-want="${i}"><i class="fa-solid fa-handshake"></i> Tawar ke ${esc(owner.name)}</button></div>`;
  }
  const sh = sheet({ title: '', body: `${head}
    <div class="list" style="margin-top:12px"><div class="row has-avatar">${owner ? avatar(owner.id, 34, { ring: owner.color }) : '<span class="ico bg-gray" style="width:34px;height:34px;border-radius:50%"><i class="fa-solid fa-building-columns"></i></span>'}<div class="main"><div class="t">${owner ? esc(owner.name) : 'Milik bank'}</div><div class="s">${o ? (o.mortgaged ? 'Sedang digadai' : s.type === 'prop' ? (o.houses === 5 ? 'Ada hotel' : `${o.houses || 0} rumah`) : 'Pemilik') : 'Belum dimiliki'}</div></div></div></div>
    <div class="list rent-table" style="margin-top:12px">${rows}</div>${actions}${playersHere(i)}<div style="height:8px"></div>` });
  sh.body.onclick = async e => {
    const b = e.target.closest('[data-pa]');
    if (b) { b.disabled = true; try { await call('game.act', { id: gid, a: { type: b.dataset.pa, pos: i } }); sh.close(); haptic(10); } catch (er) { toast(er.message); b.disabled = false; } return; }
    const t = e.target.closest('[data-trade]'); if (t) { sh.close(); tradeSheet(t.dataset.trade, [+t.dataset.want]); }
  };
}
function playersHere(i) {
  if (!G || G.status === 'lobby') return '';
  const here = G.players.filter(p => !p.bankrupt && p.pos === i);
  return here.length ? `<div class="small muted" style="margin-top:14px;display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap">Di sini: ${here.map(p => avatar(p.id, 22, { ring: p.color }) + esc(p.name)).join(' ')}</div>` : '';
}

function playerSheet(id) {
  const p = pl(id), uid = me(); if (!p) return;
  const props = Object.keys(G.props).map(Number).filter(i => G.props[i].owner === id).sort((a, b) => a - b);
  const sh = sheet({ title: '', body: `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 0 10px">${avatar(id, 76, { ring: p.color })}<div class="b" style="font-size:22px">${esc(p.name)}</div>
      <div class="muted small">${p.bankrupt ? 'Bangkrut' : `Uang ${rp(p.cash)} · Aset ${rp(E.netWorth(G, id))}`}</div></div>
    ${id !== uid ? `<div style="display:flex;gap:8px;margin:6px 0 14px"><button class="btn md tint" style="flex:1" id="ps-dm"><i class="fa-solid fa-comment"></i> Pesan</button>${G.status === 'playing' && pl(uid) && !pl(uid).bankrupt && !p.bankrupt ? '<button class="btn md tint" style="flex:1" id="ps-trade"><i class="fa-solid fa-handshake"></i> Tawar</button>' : ''}</div>` : ''}
    <div class="section-h" style="padding-left:4px">Properti (${props.length})</div>${props.length ? `<div class="pc-list">${props.map(pcard).join('')}</div>` : '<p class="small muted">Belum punya properti.</p>'}<div style="height:10px"></div>` });
  sh.body.onclick = e => {
    if (e.target.closest('#ps-dm')) { sh.close(); openConv(dmId(uid, id)); return; }
    if (e.target.closest('#ps-trade')) { sh.close(); tradeSheet(id); return; }
    const c = e.target.closest('[data-i]'); if (c) { sh.close(); propertySheet(+c.dataset.i); }
  };
}

// ---------- Tawar-menawar ----------
function tradable(uid) {
  return Object.keys(G.props).map(Number).filter(i => G.props[i].owner === uid && !(E.SPACES[i].group && E.groupSpaces(E.SPACES[i].group).some(x => E.housesOn(G, x) > 0))).sort((a, b) => a - b);
}
function tradeSheet(target, want = []) {
  const uid = me(), others = G.players.filter(p => p.id !== uid && !p.bankrupt);
  if (!others.length) return;
  const st = { to: target || others[0].id, give: { props: new Set(), cash: 0, cards: 0 }, get: { props: new Set(want), cash: 0, cards: 0 }, note: '' };
  const sh = sheet({ title: 'Tawaran', left: 'Batal', right: 'Kirim', tall: true });
  const fmt = n => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  const chips = (uidX, set) => { const l = tradable(uidX); return l.length ? `<div class="chips-select">${l.map(i => { const s = E.SPACES[i]; return `<button data-side data-pos="${i}" class="${set.has(i) ? 'on' : ''}"><span class="sw" style="background:${groupColor(s)}"></span>${esc(s.short)}${G.props[i].mortgaged ? ' (gadai)' : ''}</button>`; }).join('')}</div>` : '<p class="small muted">Tidak ada properti yang bisa ditukar.</p>'; };
  const paint = () => {
    const me_ = pl(uid), them = pl(st.to);
    sh.body.innerHTML = `<div class="section-h" style="padding-top:4px">Tawar ke</div><div class="chips-select" id="tr-to">${others.map(p => `<button data-to="${p.id}" class="${p.id === st.to ? 'on' : ''}">${avatar(p.id, 22, { ring: p.color })}${esc(p.name)}</button>`).join('')}</div>
      <div class="section-h">Kamu kasih</div><div data-sidebox="give">${chips(uid, st.give.props)}</div>
      <div class="list" style="margin-top:8px"><div class="row"><div class="main"><div class="t">Uang</div><div class="s">Punyamu ${rp(me_.cash)}</div></div>Rp<input class="inline" data-cash="give" inputmode="numeric" placeholder="0" value="${fmt(st.give.cash)}"></div>
        ${me_.jailCards.length ? `<div class="row"><div class="main"><div class="t">Kartu Bebas Penjara</div></div><b>${st.give.cards}</b><div class="stepper"><button data-card="give" data-d="-1">−</button><button data-card="give" data-d="1">+</button></div></div>` : ''}</div>
      <div class="section-h">Kamu minta dari ${esc(them.name)}</div><div data-sidebox="get">${chips(st.to, st.get.props)}</div>
      <div class="list" style="margin-top:8px"><div class="row"><div class="main"><div class="t">Uang</div><div class="s">Punya ${esc(them.name)} ${rp(them.cash)}</div></div>Rp<input class="inline" data-cash="get" inputmode="numeric" placeholder="0" value="${fmt(st.get.cash)}"></div>
        ${them.jailCards.length ? `<div class="row"><div class="main"><div class="t">Kartu Bebas Penjara</div></div><b>${st.get.cards}</b><div class="stepper"><button data-card="get" data-d="-1">−</button><button data-card="get" data-d="1">+</button></div></div>` : ''}</div>
      <div class="list" style="margin-top:14px"><div class="row"><input class="inline" id="tr-note" style="text-align:left" maxlength="120" placeholder="Pesan (opsional), mis. 'Deal yuk 😁'" value="${esc(st.note)}"></div></div>
      <p class="small muted" style="margin-top:12px;line-height:1.4">Properti yang grupnya masih ada rumah/hotel tidak bisa ditukar. Jual bangunannya dulu.</p><div style="height:16px"></div>`;
  };
  paint();
  sh.body.addEventListener('click', e => {
    const to = e.target.closest('[data-to]'); if (to) { st.to = to.dataset.to; st.get = { props: new Set(), cash: 0, cards: 0 }; st.note = ($('#tr-note', sh.body) || {}).value || ''; paint(); return; }
    const pos = e.target.closest('[data-pos]');
    if (pos) { const side = pos.closest('[data-sidebox]').dataset.sidebox; const set = st[side].props; const i = +pos.dataset.pos; set.has(i) ? set.delete(i) : set.add(i); pos.classList.toggle('on'); return; }
    const cd = e.target.closest('[data-card]');
    if (cd) { const side = cd.dataset.card, max = pl(side === 'give' ? uid : st.to).jailCards.length; st[side].cards = Math.max(0, Math.min(max, st[side].cards + Number(cd.dataset.d))); st.note = ($('#tr-note', sh.body) || {}).value || ''; paint(); }
  });
  sh.body.addEventListener('input', e => { const c = e.target.closest('[data-cash]'); if (!c) return; const n = Number(c.value.replace(/\D/g, '')) || 0; st[c.dataset.cash].cash = n; c.value = fmt(n); });
  sh.onRight = async () => {
    st.note = ($('#tr-note', sh.body) || {}).value || '';
    sh.setRight('…', true);
    try {
      await call('game.act', { id: gid, a: { type: 'trade-offer', to: st.to, note: st.note, give: { props: [...st.give.props], cash: st.give.cash, cards: st.give.cards }, get: { props: [...st.get.props], cash: st.get.cash, cards: st.get.cards } } });
      sh.close(); toast('Tawaran terkirim 🤝'); panelTab = 'trades'; renderPanel();
    } catch (e) { sh.setRight('Kirim', false); toast(e.message); }
  };
}

// ---------- Kartu, emoji, hasil ----------
function showCard(c) {
  return new Promise(resolve => {
    const center = $('#center'); if (!center) return resolve();
    const el = document.createElement('div');
    el.className = 'game-card ' + c.deck;
    el.innerHTML = `<div class="k">${c.deck === 'chance' ? 'Kesempatan' : 'Dana Umum'}</div><div class="ci">${c.deck === 'chance' ? '❓' : '🎁'}</div><div class="tx">${esc(c.text)}</div><div class="who">${esc((pl(c.uid) || {}).name || '')}</div>`;
    center.appendChild(el);
    let done = false;
    const close = () => { if (done) return; done = true; el.style.transition = 'opacity .25s, transform .25s'; el.style.opacity = '0'; el.style.transform = 'scale(.9)'; setTimeout(() => { el.remove(); resolve(); }, 250); };
    el.onclick = close; setTimeout(close, 3600);
  });
}
const EMOTES = ['😂', '🔥', '😭', '😡', '👏', '💸', '🙏', '😎', '🤣', '💀'];
function emotePicker(btn) {
  popMenu(btn, `<div class="emote-bar" style="flex-wrap:wrap;justify-content:center;box-shadow:none;background:none">${EMOTES.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`, (el, close) => {
    el.onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; close(); fire('game.emote', { id: gid, emoji: b.dataset.e }); };
  });
}
function showEmote(uid, emoji) {
  const board = $('#board'); if (!board) return;
  const p = pl(uid);
  const pos = p ? (disp[uid] ?? p.pos) : 0;
  const [x, y] = tileCenter(pos);
  const el = document.createElement('div'); el.className = 'emote';
  el.style.left = `calc(${Math.min(88, Math.max(12, x))}% - 5cqw)`; el.style.top = `calc(${Math.min(85, Math.max(20, y))}% - 6cqw)`;
  el.innerHTML = `${esc(emoji)}<small>${esc(p ? p.name : user(uid).name)}</small>`;
  board.appendChild(el); setTimeout(() => el.remove(), 2300);
}
function celebrate() {
  const key = 'nexo.celebrated.' + G.id;
  if (LS.get(key, false)) return;
  LS.set(key, true);
  if (G.winner === me()) { confetti(); haptic(200); }
  setTimeout(resultsSheet, 600);
}
function resultsSheet() {
  if (!G || !G.ranking) return;
  sheet({ title: 'Hasil Akhir', body: `<div class="result"><div class="trophy">🏆</div><div class="b" style="font-size:24px">${esc((pl(G.winner) || {}).name || '')} menang!</div><div class="muted small">${G.endedAt && G.startedAt ? `Durasi ${Math.max(1, Math.round((G.endedAt - G.startedAt) / 60000))} menit` : ''}</div></div>
    <div class="list">${G.ranking.map((r, k) => { const p = pl(r.id); return `<div class="row has-avatar"><span class="lb-rank">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${avatar(r.id, 36, { ring: p.color })}<div class="main"><div class="t">${esc(p.name)}</div><div class="s">${r.bankrupt ? 'Bangkrut' : 'Kekayaan ' + rp(r.worth)}</div></div></div>`; }).join('')}</div>
    <div style="padding-top:16px"><button class="btn block" id="rs-again">Main lagi dengan pemain yang sama</button></div>`, onOpen: s => { $('#rs-again', s.body).onclick = () => { s.close(); playAgain(); }; } });
}
async function playAgain() {
  try {
    const g = await call('game.create', { name: G.name, mode: G.mode, settings: G.settings, invite: G.players.map(p => p.id).filter(x => x !== me()) });
    toast('Room baru dibuat, teman-teman sudah diajak');
    openGame(g.id, g);
  } catch (e) { toast(e.message); }
}

function moreMenu(btn) {
  const uid = me(), p = G && pl(uid), host = G && G.host === uid;
  const items = [['rules', 'Cara main', 'fa-circle-question']];
  if (G && G.status !== 'ended') items.push(['invite', 'Ajak teman', 'fa-paper-plane']);
  if (G && G.status === 'playing' && p && !p.bankrupt) items.push(['resign', 'Menyerah', 'fa-flag', true]);
  if (G && G.status === 'playing' && host) items.push(['end', 'Akhiri game sekarang', 'fa-stop', true]);
  if (G && G.status === 'ended' && host) items.push(['del', 'Hapus room', 'fa-trash-can', true]);
  popMenu(btn, items.map(([k, t, i, d]) => `<button class="mi ${d ? 'destructive' : ''}" data-m="${k}">${t} <i class="fa-solid ${i}"></i></button>`).join(''), (el, close) => {
    el.onclick = async e => {
      const b = e.target.closest('[data-m]'); if (!b) return; close();
      const k = b.dataset.m;
      if (k === 'rules') rulesSheet();
      if (k === 'invite') inviteSheet();
      if (k === 'resign' && await confirmBox('Menyerah?', 'Semua propertimu kembali ke bank dan kamu keluar dari permainan.', 'Menyerah', true)) act({ type: 'resign' });
      if (k === 'end' && await confirmBox('Akhiri game?', 'Pemenang ditentukan dari total kekayaan saat ini.', 'Akhiri', true)) { try { await call('game.end', { id: gid }); } catch (er) { toast(er.message); } }
      if (k === 'del' && await confirmBox('Hapus room ini?', '', 'Hapus', true)) { try { await call('game.delete', { id: gid }); popScreen(); } catch (er) { toast(er.message); } }
    };
  });
}

function rulesSheet() {
  sheet({ title: 'Cara Main', body: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 4px 20px;line-height:1.45;font-size:15px">
    <p>🎯 <b>Tujuan:</b> jadi pemain terakhir yang tidak bangkrut (atau terkaya saat waktu habis).</p>
    <p>🎲 <b>Giliran:</b> lempar 2 dadu dan jalan. Dapat <b>dobel</b>? Lempar lagi. Dobel 3x berturut-turut langsung masuk penjara.</p>
    <p>🏙️ <b>Beli kota:</b> berhenti di kota/bandara/perusahaan yang belum dimiliki untuk membelinya. Kalau tidak dibeli, kota dilelang ke semua pemain.</p>
    <p>💸 <b>Sewa:</b> berhenti di properti orang lain berarti bayar sewa. Punya semua kota satu warna = sewa ×2 dan boleh bangun rumah.</p>
    <p>🏠 <b>Bangun:</b> rumah dibangun merata dalam satu warna, maksimal 4 rumah lalu hotel. Sewa naik drastis!</p>
    <p>✈️ <b>Bandara:</b> sewa naik sesuai jumlah bandara yang dimiliki. <b>Perusahaan:</b> sewa = angka dadu × 4 (atau ×10 jika punya keduanya) × Rp 10 rb.</p>
    <p>🔒 <b>Penjara:</b> keluar dengan bayar ${rp(E.JAIL_FINE)}, kartu Bebas Penjara, atau dobel. Setelah 3x gagal, wajib bayar.</p>
    <p>🏦 <b>Uang kurang?</b> Jual rumah (setengah harga) atau gadaikan properti. Kalau tetap tidak cukup, bangkrut.</p>
    <p>🤝 <b>Tawar:</b> tukar properti, uang, dan kartu dengan pemain lain kapan saja.</p>
    <p>⚡ <b>Live</b> ada timer per giliran. ☕ <b>Santai</b> tanpa timer, giliranmu dikabari lewat notifikasi. Pakai 👋 <b>Colek</b> kalau temanmu kelamaan.</p></div>` });
}
