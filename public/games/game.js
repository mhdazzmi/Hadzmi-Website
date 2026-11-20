/* Nexo Games — "Nexo Kota Dunia" v2: papan 3D, bangunan bertingkat, kartu 3D, suara, bot */
import { $, $$, esc, S, LS, on, emit, call, fire, avatar, user, hm, pushScreen, popScreen, topScreen, setView, toast, confirmBox,
  sheet, popMenu, confetti, haptic, sleep, compressImage, uploadImage, pickFile } from './core.js';
import * as E from './engine.js';
import { landmarkSvg } from './landmarks.js';
import { openConv, pickFriend, totalUnread, dmId } from './chat.js';
import { sfx, place, soundOn, setSound, musicOn, setMusic, startMusic, stopMusic, testSound } from './sound.js';
import { cropImage } from './core.js';
import { photoOf, loadPhoto, preloadAll } from './photos.js';

const scr = $('#scr-game');
let G = null, gid = null, built = false, panelTab = LS.get('nexo.ptab2', 'players');
let shown = { moveSeq: 0, diceSeq: 0, cardSeq: 0, fxSeq: 0 };
let disp = {}, queue = [], busy = false, picked = null, buildSel = null, wasMyTurn = false;
const rp = E.rp;
const me = () => S.me && S.me.id;
const pl = id => G && E.player(G, id);
const isBot = id => String(id || '').startsWith('bot_');
const T = 9.8, CW = 1.4;
const TOLLM = [0.3, 0.9, 1.8, 3, 4.5];
const LVL_IC = ['🚩', '🏠', '🏘️', '🏢', '🏛️'];

function pav(id, size, opts = {}) {
  if (isBot(id)) { const p = pl(id) || {}; return avatar({ id, avatar: p.avatar || { emoji: '🤖', color: p.color || '#8E8E93' } }, size, opts); }
  return avatar(id, size, opts);
}
let viewMode = LS.get('nexo.view', '3d');
function applyView() { const w = $('#b3wrap'); if (w) { w.classList.toggle('top', viewMode === 'top'); sizeBoard(); } }
const pname = id => (pl(id) || {}).name || user(id).name;
export function myTurnCount() { if (!S.me) return 0; return Object.values(S.games).filter(g => g.status === 'playing' && (g.waiting || []).includes(S.me.id)).length; }

export function initGame() {
  on('game', ({ game }) => { if (game.id === gid) enqueue(game); });
  on('init', async () => { if (gid && topScreen() === scr) { try { const g = await call('game.get', { id: gid }); queue = []; applyNow(g); } catch (e) {} } });
  on('emote', m => { if (m.id === gid) showEmote(m.uid, m.emoji); });
  on('create-room', ({ invite }) => createRoom(invite));
  on('badges', () => paintChatBadge());
  on('gindex', m => { if (m.remove && m.remove === gid && topScreen() === scr) { toast('Room dihapus'); popScreen(); } });
  on('photo', key => { if (built) paintPhotos(key); });
  on('photos', () => { if (built) paintPhotos(); });
  setInterval(tick, 1000);
  window.addEventListener('resize', () => { if (built) sizeBoard(); });
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
      <h2>Nexo Kota Dunia</h2><p>Keliling 20 kota dunia, bangun rumah sampai landmark 3D, ambil alih kota teman, dan menangkan monopoli!</p>
      <div class="chips"><span class="chip">2–10 pemain</span><span class="chip">🤖 Bisa lawan bot</span><span class="chip">⚡ Live · ☕ Santai</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><button class="btn white md" id="gt-new"><i class="fa-solid fa-plus"></i> Buat Room</button><button class="btn md" style="background:rgba(255,255,255,.22)" id="gt-bot"><i class="fa-solid fa-robot"></i> Main vs Bot</button></div></div>
    ${myTurn.length ? `<div class="section-h big">Giliranmu 🔥</div><div class="list">${myTurn.map(roomRow).join('')}</div>` : ''}
    ${others.length ? `<div class="section-h big">Room Kamu</div><div class="list">${others.map(roomRow).join('')}</div>` : ''}
    ${open.length ? `<div class="section-h big">Room Terbuka</div><div class="list">${open.map(roomRow).join('')}</div>` : ''}
    ${!mine.length && !open.length ? `<div class="list" style="margin-top:18px"><div class="empty"><i class="fa-solid fa-dice"></i>Belum ada room. Buat room & ajak teman, atau main dulu lawan bot!</div></div>` : ''}
    ${watching.length ? `<div class="section-h big">Sedang Berlangsung</div><div class="list">${watching.map(roomRow).join('')}</div>` : ''}
    ${board.length ? `<div class="section-h big">Papan Juara 🏆</div><div class="list">${board.map((u, i) => `<div class="row has-avatar"><span class="lb-rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(u, 36)}<div class="main"><div class="t">${esc(u.name)}</div><div class="s">${u.stats.played} main · ${Math.round(u.stats.wins / u.stats.played * 100)}% menang</div></div><b>${u.stats.wins}</b></div>`).join('')}</div>` : ''}
    ${history.length ? `<div class="section-h big">Riwayat</div><div class="list">${history.map(roomRow).join('')}</div>` : ''}
    <div class="section-h big">Segera Hadir</div>
    <div class="soon">${[['Ludo Seru', 'fa-chess-board', 'bg-red'], ['Kartu Uno-an', 'fa-layer-group', 'bg-orange'], ['Tebak Gambar', 'fa-pen-nib', 'bg-purple'], ['Kuis Teman', 'fa-circle-question', 'bg-teal']].map(([t, i, c]) => `<div class="card"><span class="ico ${c}"><i class="fa-solid ${i}"></i></span><div class="b">${t}</div><div class="small muted">Segera</div></div>`).join('')}</div>
  </div>`;
  $('#gt-new').onclick = () => createRoom();
  $('#gt-bot').onclick = () => createRoom([], { bots: 2, name: `Latihan ${S.me.name}` });
  $('#gt-me').onclick = () => $('[data-tab="me"]').click();
  el.querySelectorAll('[data-room]').forEach(b => b.onclick = () => openGame(b.dataset.room));
}
function roomRow(g) {
  const uid = me();
  const nm = id => isBot(id) ? 'Bot' : user(id).name;
  let status;
  if (g.status === 'lobby') status = `Menunggu pemain · ${g.players.length}/${g.max}`;
  else if (g.status === 'ended') status = g.winner ? `🏆 ${nm(g.winner)} menang` : 'Selesai';
  else status = (g.waiting || []).includes(uid) ? 'Giliranmu!' : `Menunggu ${(g.waiting || []).map(nm).join(', ')}`;
  const right = g.status === 'playing' && (g.waiting || []).includes(uid) ? '<span class="pill turn">Main</span>' : g.status === 'lobby' && !g.players.includes(uid) ? '<span class="btn sm tint">Gabung</span>' : '<i class="fa-solid fa-chevron-right chev"></i>';
  const avs = g.players.slice(0, 8).map(p => isBot(p) ? `<span class="av" style="--s:22px;background:#8E8E93">🤖</span>` : avatar(p, 22)).join('');
  return `<button class="row tap room" data-room="${g.id}"><span class="room-ico" style="${g.status === 'ended' ? 'background:linear-gradient(140deg,#FFCC00,#FF9500)' : g.mode === 'live' ? 'background:linear-gradient(140deg,#FF3B30,#FF2D55)' : ''}"><i class="fa-solid ${g.status === 'ended' ? 'fa-trophy' : 'fa-city'}"></i></span>
    <div class="main" style="padding:0"><div class="t b ell">${esc(g.name)}</div><div class="s" style="display:flex;gap:6px;align-items:center;margin-top:3px"><span class="pill ${g.mode}">${g.mode === 'live' ? 'Live' : 'Santai'}</span><span class="ell">${esc(status)}</span></div>
    <div class="av-stack" style="margin-top:6px">${avs}</div></div>${right}</button>`;
}

// ================= BUAT ROOM =================
function colorGrid(selected, taken = {}) {
  return `<div class="color-grid">${E.PLAYER_COLORS.map(c => `<button data-color="${c}" class="${c === selected ? 'on' : ''} ${taken[c] ? 'taken' : ''}" style="--c:${c}" title="${E.COLOR_NAMES[c]}">${taken[c] || ''}</button>`).join('')}</div>`;
}
function createRoom(invite = [], preset = {}) {
  const st = { name: preset.name || `Room ${S.me.name}`, mode: 'santai', maxPlayers: 6, startCash: 20000000, turnSec: 60, timeLimitMin: 0, monopolyWin: true, invite: new Set(invite), color: LS.get('nexo.color', E.PLAYER_COLORS[0]), bots: preset.bots || 0 };
  const friends = Object.values(S.users).filter(u => u.id !== me());
  const sh = sheet({ title: 'Room Baru', left: 'Batal', right: 'Buat', tall: true });
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(st[key]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const keepName = () => { const n = $('#cr-name', sh.body); if (n) st.name = n.value; };
  const paint = () => {
    sh.body.innerHTML = `<div class="list"><div class="row"><div class="main"><div class="t">Nama room</div></div><input class="inline" id="cr-name" maxlength="40" value="${esc(st.name)}"></div></div>
      <div class="section-h">Warnamu</div><div class="list" style="padding:12px">${colorGrid(st.color)}</div>
      <div class="section-h">Mode</div>
      <div class="list"><div class="row" style="display:block;padding:12px">${seg('mode', [['santai', '☕ Santai'], ['live', '⚡ Live']])}
        <p class="small muted" style="margin-top:10px;line-height:1.4">${st.mode === 'live' ? 'Main bareng di waktu yang sama. Ada batas waktu tiap giliran; kalau habis, jalan otomatis.' : 'Cocok buat beda zona waktu. Main kapan saja; notifikasi datang saat giliranmu.'}</p></div></div>
      <div class="section-h">Pemain</div>
      <div class="list">
        <div class="row"><div class="main"><div class="t">Maks. pemain</div></div><b style="min-width:28px;text-align:center">${st.maxPlayers}</b><div class="stepper"><button data-step="maxPlayers" data-d="-1">−</button><button data-step="maxPlayers" data-d="1">+</button></div></div>
        <div class="row"><div class="main"><div class="t">🤖 Bot komputer</div><div class="s">Langsung ikut main di room</div></div><b style="min-width:28px;text-align:center">${st.bots}</b><div class="stepper"><button data-step="bots" data-d="-1">−</button><button data-step="bots" data-d="1">+</button></div></div>
      </div>
      <div class="section-h">Aturan</div>
      <div class="list">
        <div class="row" style="display:block;padding:10px 16px"><div class="t" style="margin-bottom:8px">Uang awal</div>${seg('startCash', [[15000000, 'Rp 15 jt'], [20000000, 'Rp 20 jt'], [30000000, 'Rp 30 jt']])}</div>
        ${st.mode === 'live' ? `<div class="row" style="display:block;padding:10px 16px"><div class="t" style="margin-bottom:8px">Waktu per giliran</div>${seg('turnSec', [[30, '30 dtk'], [60, '1 mnt'], [90, '1,5 mnt'], [120, '2 mnt']])}</div>` : ''}
        <div class="row" style="display:block;padding:10px 16px"><div class="t" style="margin-bottom:8px">Batas waktu game</div>${seg('timeLimitMin', [[0, 'Tanpa'], [30, '30 mnt'], [60, '1 jam'], [90, '1,5 jam']])}</div>
        <div class="row"><div class="main"><div class="t">Menang Monopoli</div><div class="s">3 grup warna / 1 sisi papan / 4 bandara = langsung menang</div></div><label class="switch"><input type="checkbox" data-tg="monopolyWin" ${st.monopolyWin ? 'checked' : ''}><span></span></label></div>
      </div>
      <div class="section-h">Ajak teman (dapat notifikasi)</div>
      ${friends.length ? `<div class="chips-select">${friends.map(u => `<button data-inv="${u.id}" class="${st.invite.has(u.id) ? 'on' : ''}">${avatar(u, 22)}${esc(u.name)}</button>`).join('')}</div>` : '<p class="small muted">Belum ada teman yang terdaftar.</p>'}
      <div style="height:20px"></div>`;
  };
  paint();
  sh.body.addEventListener('click', e => {
    const segBtn = e.target.closest('.seg button');
    if (segBtn) { const key = segBtn.parentElement.dataset.key; st[key] = key === 'mode' ? segBtn.dataset.v : Number(segBtn.dataset.v); keepName(); paint(); return; }
    const step = e.target.closest('[data-step]');
    if (step) { const k = step.dataset.step, d = Number(step.dataset.d); if (k === 'maxPlayers') { st.maxPlayers = Math.max(2, Math.min(10, st.maxPlayers + d)); st.bots = Math.min(st.bots, st.maxPlayers - 1); } else st.bots = Math.max(0, Math.min(st.maxPlayers - 1, st.bots + d)); keepName(); paint(); return; }
    const c = e.target.closest('[data-color]'); if (c) { st.color = c.dataset.color; LS.set('nexo.color', st.color); keepName(); paint(); return; }
    const inv = e.target.closest('[data-inv]'); if (inv) { st.invite.has(inv.dataset.inv) ? st.invite.delete(inv.dataset.inv) : st.invite.add(inv.dataset.inv); inv.classList.toggle('on'); }
  });
  sh.body.addEventListener('change', e => { const t = e.target.closest('[data-tg]'); if (t) st[t.dataset.tg] = t.checked; });
  sh.onRight = async () => {
    keepName(); sh.setRight('…', true);
    try {
      const g = await call('game.create', { name: st.name, mode: st.mode, color: st.color, bots: st.bots, invite: [...st.invite], settings: { maxPlayers: st.maxPlayers, startCash: st.startCash, turnSec: st.turnSec, timeLimitMin: st.timeLimitMin, monopolyWin: st.monopolyWin } });
      sh.close(); openGame(g.id, g);
    } catch (e) { sh.setRight('Buat', false); toast(e.message); }
  };
}

// ================= LAYAR GAME =================
export async function openGame(id, preload) {
  if (!S.me) return;
  if (gid !== id) { built = false; G = null; disp = {}; queue = []; busy = false; picked = null; buildSel = null; }
  gid = id;
  scr.innerHTML = `<div class="nav g-nav"><div class="nav-row"><button class="back" id="g-back"><i class="fa-solid fa-chevron-left"></i>Games</button>
    <div class="nav-title"><span class="ell" id="g-title" style="max-width:100%">…</span><span class="nav-sub" id="g-sub"></span></div>
    <span style="min-width:70px;display:flex;justify-content:flex-end;gap:0"><button class="icon-btn" id="g-snd" aria-label="Suara"><i class="fa-solid ${soundOn() ? 'fa-volume-high' : 'fa-volume-xmark'}"></i></button><button class="icon-btn" id="g-chat" aria-label="Chat"><i class="fa-solid fa-comment"></i><span class="badge hidden" id="g-cb"></span></button><button class="icon-btn" id="g-more" aria-label="Menu"><i class="fa-solid fa-ellipsis"></i></button></span></div></div>
    <div class="screen-body" id="g-body"><div id="g-root"><div class="empty" style="padding-top:30vh"><span class="spin"></span></div></div></div>`;
  $('#g-back').onclick = () => popScreen();
  $('#g-chat').onclick = () => pickFriend('Kirim Pesan');
  $('#g-more').onclick = e => moreMenu(e.currentTarget);
  $('#g-snd').onclick = e => soundMenu(e.currentTarget);
  paintChatBadge();
  pushScreen(scr, () => { fire('game.unwatch'); gid = null; G = null; built = false; setView('tab'); stopMusic(true); });
  scr.dataset.view = 'game:' + id; setView('game:' + id);
  preloadAll(E.SPACES);
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
    if (!G || G.status !== g.status || !built || queue.length > 3) { applyNow(g, true); continue; }
    try { await animateTo(g); } catch (e) { console.error(e); applyNow(g); }
  }
  busy = false;
}
function applyNow(g, playFx) {
  const statusChanged = !G || G.status !== g.status;
  const prevFx = shown.fxSeq;
  G = g;
  shown = { moveSeq: g.moveSeq, diceSeq: g.diceSeq, cardSeq: g.cardSeq, fxSeq: g.fxSeq };
  g.players.forEach(p => disp[p.id] = p.pos);
  render(statusChanged);
  if (playFx && g.fxSeq !== prevFx && (g.fx || []).some(f => f.type === 'win')) celebrate();
}
async function animateTo(g) {
  const newDice = g.diceSeq !== shown.diceSeq && g.dice;
  const newMoves = g.moveSeq !== shown.moveSeq ? g.moves || [] : [];
  const newCard = g.cardSeq !== shown.cardSeq && g.card;
  const newFx = g.fxSeq !== shown.fxSeq ? g.fx || [] : [];
  G = g;
  if (newDice) { rollDice3D(g.dice.d); sfx('dice'); await sleep(1000); }
  for (const mv of newMoves) await animateMove(mv);
  const lastMove = newMoves[newMoves.length - 1];
  if (lastMove) { const s = E.SPACES[lastMove.to]; place(s.sound || (s.type === 'card' ? 'card' : null)); }
  shown = { moveSeq: g.moveSeq, diceSeq: g.diceSeq, cardSeq: g.cardSeq, fxSeq: g.fxSeq };
  g.players.forEach(p => disp[p.id] = p.pos);
  render(false);
  playFxSounds(newFx, !!lastMove);
  if (newCard) await showCard3D(g.card);
  if (newFx.some(f => f.type === 'win')) celebrate();
}
function playFxSounds(list, afterPlace) {
  let d = afterPlace ? 1.6 : 0;
  for (const f of list) {
    const name = { buy: 'buy', build: 'build', landmark: 'landmark', toll: 'toll', gain: 'gain', salary: 'salary', takeover: 'takeover', storm: 'storm', shield: 'shield', festival: 'festival', swap: 'swap', bankrupt: 'bankrupt', pay: 'pay', 'card-use': 'card-use' }[f.type];
    if (name) { sfx(name, d); d += 0.35; }
    if (['build', 'landmark', 'buy', 'takeover', 'storm', 'festival'].includes(f.type) && f.pos !== undefined) pop(f.pos);
  }
}
async function animateMove(mv) {
  if (mv.kind === 'jump' || mv.kind === 'fly') {
    if (mv.kind === 'fly') place('tour');
    const tk = $(`.tk[data-uid="${mv.uid}"]`); if (tk) tk.classList.add('flying');
    disp[mv.uid] = mv.to; placeTokens(); await sleep(mv.kind === 'fly' ? 900 : 450);
    if (tk) tk.classList.remove('flying');
    highlight(mv.to); return;
  }
  const dir = mv.kind === 'back' ? -1 : 1;
  let pos = mv.from, guard = 0, i = 0;
  while (pos !== mv.to && guard++ < 40) {
    pos = (pos + dir + E.N) % E.N; disp[mv.uid] = pos; placeTokens();
    const tk = $(`.tk[data-uid="${mv.uid}"]`); if (tk) { tk.classList.remove('hop'); void tk.offsetWidth; tk.classList.add('hop'); }
    sfx('step', 0, i++);
    await sleep(190);
  }
  highlight(mv.to); haptic(8);
  await sleep(150);
}
function highlight(pos) { const t = $(`.t3[data-i="${pos}"]`); if (t) { t.classList.remove('landed'); void t.offsetWidth; t.classList.add('landed'); } }
function pop(pos) { const b = $(`.t3[data-i="${pos}"] .bld`); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } }

function render(full) {
  if (!G) return;
  $('#g-title').textContent = G.name;
  $('#g-sub').innerHTML = `<span class="pill ${G.mode}" style="font-size:10px">${G.mode === 'live' ? 'Live' : 'Santai'}</span> ${G.status === 'lobby' ? 'Lobi' : G.status === 'ended' ? 'Selesai' : `${G.players.filter(p => !p.bankrupt).length} pemain`}`;
  const root = $('#g-root');
  if (G.engine !== E.ENGINE) { built = false; root.innerHTML = legacyHtml(); bindLegacy(); return; }
  if (G.status === 'lobby') { built = false; root.innerHTML = lobbyHtml(); bindLobby(); return; }
  if (!built || full) { root.innerHTML = shellHtml(); built = true; bindShell(); sizeBoard(); paintPhotos(); }
  paintTiles(); placeTokens(); renderHud(); renderPanel(); paintCorners();
  if (G.status === 'playing') startMusic(); else stopMusic(true);
  const myTurn = E.waitingFor(G).includes(me()) && G.status === 'playing';
  if (myTurn && !wasMyTurn) { sfx('turn', 0.2); haptic(30); }
  wasMyTurn = myTurn;
}
function legacyHtml() {
  return `<div class="page"><div class="list" style="margin-top:30px"><div class="empty"><i class="fa-solid fa-box-archive"></i>Room ini dibuat dengan versi game lama.<br>Hapus room ini lalu buat room baru untuk main versi 3D terbaru.</div></div>
    <div style="padding-top:16px"><button class="btn block tint red" id="lg-del">Hapus room</button></div></div>`;
}
function bindLegacy() { $('#lg-del').onclick = async () => { try { await call('game.delete', { id: gid }); popScreen(); } catch (e) { toast(e.message); } }; }

// ---------- Lobi ----------
function lobbyHtml() {
  const uid = me(), mine = pl(uid), host = G.host === uid, full = G.players.length >= G.settings.maxPlayers, s = G.settings;
  const taken = {}; G.players.forEach(p => { if (p.id !== uid) taken[p.color] = isBot(p.id) ? '🤖' : '•'; });
  return `<div class="page" style="padding-bottom:40px">
    <div class="lobby-top"><span class="room-ico" style="${G.mode === 'live' ? 'background:linear-gradient(140deg,#FF3B30,#FF2D55)' : ''}"><i class="fa-solid fa-city"></i></span>
      <div class="b" style="font-size:24px">${esc(G.name)}</div><div class="muted small">Dibuat oleh ${esc(user(G.host).name)} · <span class="pill ${G.mode}">${G.mode === 'live' ? '⚡ Live' : '☕ Santai'}</span></div></div>
    <div class="section-h">Pemain ${G.players.length}/${s.maxPlayers}</div>
    <div class="list">${G.players.map(p => `<div class="row has-avatar">${pav(p.id, 40, { ring: p.color })}<div class="main"><div class="t">${esc(isBot(p.id) ? p.name : user(p.id).name)}${p.id === uid ? ' (kamu)' : ''}</div><div class="s"><span class="sw" style="background:${p.color}"></span> ${E.COLOR_NAMES[p.color] || ''} · ${p.id === G.host ? '👑 Host' : isBot(p.id) ? 'Komputer' : 'Siap main'}</div></div>${host && isBot(p.id) ? `<button class="icon-btn" data-botedit="${p.id}" aria-label="Ubah bot"><i class="fa-solid fa-pen"></i></button>` : ''}${host && p.id !== uid ? `<button class="icon-btn" data-kick="${p.id}" aria-label="Keluarkan"><i class="fa-solid fa-circle-minus c-red"></i></button>` : ''}</div>`).join('')}
      ${Array.from({ length: Math.max(0, Math.min(3, s.maxPlayers - G.players.length)) }, () => `<div class="row has-avatar"><span class="av" style="--s:40px;background:var(--fill3);color:var(--label3);font-size:16px"><i class="fa-solid fa-user-plus"></i></span><div class="main"><div class="t faint">Menunggu teman…</div></div></div>`).join('')}</div>
    <div style="display:flex;gap:8px;padding:12px 0 0"><button class="btn md tint" style="flex:1" id="lb-invite"><i class="fa-solid fa-paper-plane"></i> Ajak teman</button>${host && !full ? '<button class="btn md tint" style="flex:1" id="lb-bot"><i class="fa-solid fa-robot"></i> Tambah bot</button>' : ''}</div>
    ${mine ? `<div class="section-h">Pilih warnamu</div><div class="list" style="padding:12px">${colorGrid(mine.color, taken)}<p class="small muted" style="margin-top:10px">Rumah & landmark yang kamu bangun akan berwarna ini.</p></div>` : ''}
    <div class="section-h">Aturan</div>
    <div class="list">
      <div class="row"><div class="main"><div class="t">Uang awal</div></div><span class="val">${rp(s.startCash)}</span></div>
      ${G.mode === 'live' ? `<div class="row"><div class="main"><div class="t">Waktu per giliran</div></div><span class="val">${s.turnSec} dtk</span></div>` : ''}
      <div class="row"><div class="main"><div class="t">Batas waktu game</div></div><span class="val">${s.timeLimitMin ? s.timeLimitMin + ' mnt' : 'Tanpa'}</span></div>
      <div class="row"><div class="main"><div class="t">Menang Monopoli</div></div><span class="val">${s.monopolyWin ? 'Aktif' : 'Mati'}</span></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;padding-top:22px">
      ${host ? `<button class="btn block green" id="lb-start" ${G.players.length < 2 ? 'disabled' : ''}><i class="fa-solid fa-play"></i> Mulai Game</button>${G.players.length < 2 ? '<p class="small muted" style="text-align:center">Minimal 2 pemain. Tambah bot kalau mau main sendiri.</p>' : ''}` : ''}
      ${!mine ? `<button class="btn block" id="lb-join" ${full ? 'disabled' : ''}>${full ? 'Room penuh' : 'Gabung'}</button>` : ''}
      ${mine && !host ? `<p class="small muted" style="text-align:center">Menunggu ${esc(user(G.host).name)} memulai game…</p><button class="btn block gray" id="lb-leave">Keluar dari room</button>` : ''}
      ${host ? `<button class="btn block tint red" id="lb-del">Hapus room</button>` : ''}
      <button class="link" id="lb-rules" style="font-size:15px"><i class="fa-regular fa-circle-question"></i> Cara main</button>
    </div></div>`;
}
function bindLobby() {
  const act_ = async (t, extra = {}) => { try { const g = await call(t, Object.assign({ id: gid }, extra)); if (g && g.id) applyNow(g); } catch (e) { toast(e.message); } };
  const b = id => $('#' + id);
  if (b('lb-start')) b('lb-start').onclick = () => act_('game.start');
  if (b('lb-join')) b('lb-join').onclick = () => act_('game.join', { color: LS.get('nexo.color', null) });
  if (b('lb-leave')) b('lb-leave').onclick = async () => { await act_('game.leave'); popScreen(); };
  if (b('lb-del')) b('lb-del').onclick = async () => { if (await confirmBox('Hapus room?', '', 'Hapus', true)) { try { await call('game.delete', { id: gid }); popScreen(); } catch (e) { toast(e.message); } } };
  if (b('lb-bot')) b('lb-bot').onclick = () => act_('game.addbot');
  $$('[data-botedit]').forEach(k => k.onclick = () => editBot(k.dataset.botedit));
  b('lb-invite').onclick = inviteSheet;
  b('lb-rules').onclick = rulesSheet;
  $$('[data-kick]').forEach(k => k.onclick = () => act_('game.kick', { uid: k.dataset.kick }));
  $$('#g-root [data-color]').forEach(c => c.onclick = () => { if (c.classList.contains('taken')) return toast('Warna sudah dipakai'); LS.set('nexo.color', c.dataset.color); act_('game.color', { color: c.dataset.color }); });
}
function inviteSheet() {
  const friends = Object.values(S.users).filter(u => u.id !== me() && !(G && pl(u.id)));
  const sel = new Set();
  const sh = sheet({ title: 'Ajak Teman', left: 'Batal', right: 'Kirim', body: friends.length ? `<p class="small muted" style="padding:0 4px 10px">Teman yang dipilih akan dapat notifikasi ajakan.</p><div class="list">${friends.map(u => `<button class="row has-avatar tap" data-u="${u.id}">${avatar(u, 40, { dot: true })}<div class="main"><div class="t">${esc(u.name)}</div></div><i class="fa-regular fa-circle" style="font-size:22px;color:var(--label3)"></i></button>`).join('')}</div>` : '<div class="empty">Semua teman sudah ada di room ini.</div>' });
  sh.body.onclick = e => { const r = e.target.closest('[data-u]'); if (!r) return; const id = r.dataset.u; const i = r.querySelector('i'); if (sel.has(id)) { sel.delete(id); i.className = 'fa-regular fa-circle'; i.style.color = 'var(--label3)'; } else { sel.add(id); i.className = 'fa-solid fa-circle-check'; i.style.color = 'var(--blue)'; } };
  sh.onRight = async () => { if (!sel.size) return sh.close(); try { await call('game.invite', { id: gid, uids: [...sel] }); toast('Ajakan terkirim', 'fa-paper-plane'); sh.close(); } catch (e) { toast(e.message); } };
}

// ---------- Papan 3D ----------
function rect(i) {
  if (i === 0) return [T - CW, T - CW, CW, CW];
  if (i < 8) return [CW + (7 - i), T - CW, 1, CW];
  if (i === 8) return [0, T - CW, CW, CW];
  if (i < 16) return [0, CW + (15 - i), CW, 1];
  if (i === 16) return [0, 0, CW, CW];
  if (i < 24) return [CW + (i - 17), 0, 1, CW];
  if (i === 24) return [T - CW, 0, CW, CW];
  return [T - CW, CW + (i - 25), CW, 1];
}
const sideCls = i => (i % 8 === 0 ? 'c' : i < 8 ? 'b' : i < 16 ? 'l' : i < 24 ? 't' : 'r');
const pct = v => (v / T * 100) + '%';
const groupColor = s => s.group ? E.GROUPS[s.group].color : s.type === 'air' ? '#5856D6' : '#8E8E93';
const CORNER = { start: ['fa-flag-checkered', 'START', '#34C759'], jail: ['fa-building-shield', 'Penjara', '#FF9500'], festival: ['fa-champagne-glasses', 'Festival', '#FF2D92'], tour: ['fa-plane-departure', 'Tur Dunia', '#007AFF'] };
const SPECIAL_ICON = { card: ['fa-star', '#FF9F0A'], tax: ['fa-receipt', '#FF3B30'] };

function tileHtml(s) {
  const [x, y, w, h] = rect(s.i), side = sideCls(s.i);
  const st = `left:${pct(x)};top:${pct(y)};width:${pct(w)};height:${pct(h)};--gc:${groupColor(s)}`;
  if (side === 'c') {
    const [ic, nm, col] = CORNER[s.type];
    return `<div class="t3 corner" data-i="${s.i}" style="${st};--cc:${col}"><div class="t3-face"><i class="fa-solid ${ic}"></i><span class="t3-cn">${nm}</span>${s.type === 'start' ? `<span class="t3-pr">+${rp(E.SALARY).replace('Rp ', '')}</span>` : ''}</div><div class="bld"></div></div>`;
  }
  if (s.type === 'card' || s.type === 'tax') {
    const [ic, col] = SPECIAL_ICON[s.type];
    return `<div class="t3 s-${side} special" data-i="${s.i}" style="${st};--cc:${col}"><div class="t3-face"><i class="fa-solid ${ic}"></i><span class="t3-nm">${s.type === 'card' ? 'Kartu' : 'Pajak'}</span></div><div class="bld"></div></div>`;
  }
  return `<div class="t3 s-${side} prop" data-i="${s.i}" style="${st}"><div class="t3-face"><div class="t3-photo"></div><div class="t3-band"></div>
    <div class="t3-label">${s.type === 'air' ? '<i class="fa-solid fa-plane"></i> ' : ''}<span class="t3-nm">${esc(s.short)}</span><span class="t3-pr">${rp(s.price).replace('Rp ', '')}</span></div></div>
    <div class="t3-own"></div><div class="bld"></div></div>`;
}
function shellHtml() {
  const faces = n => `<div class="die-f f${n}">${dieFace(n)}</div>`;
  return `<div class="g-wrap"><div class="g-main"><div class="b3-wrap ${viewMode === 'top' ? 'top' : ''}" id="b3wrap"><button class="view-btn" id="view-btn" aria-label="Ganti tampilan"><i class="fa-solid ${viewMode === 'top' ? 'fa-cube' : 'fa-square'}"></i><span>${viewMode === 'top' ? '3D' : 'Atas'}</span></button><div class="b3-stage"><div class="b3-plane" id="board">
      <div class="b3-center"><div class="b3-logo">NEXO</div><div class="b3-sub">KOTA DUNIA</div></div>
      ${E.SPACES.map(tileHtml).join('')}
      <div class="dice3" id="dice3"><div class="cube" id="cubeA">${[1, 2, 3, 4, 5, 6].map(faces).join('')}</div><div class="cube" id="cubeB">${[1, 2, 3, 4, 5, 6].map(faces).join('')}</div></div>
      <div class="stack3" style="left:-14%;top:50%" data-st="0"></div><div class="stack3" style="left:50%;top:-14%" data-st="1"></div><div class="stack3" style="left:114%;top:50%" data-st="2"></div><div class="stack3" style="left:50%;top:114%" data-st="3"></div>
      <div class="sign3"><div class="sign3-in"><div class="sign3-k" id="sign-k">Giliran</div><div class="sign3-v" id="sign-v">-</div></div></div>
      <div class="tokens" id="tokens"></div></div></div><div class="corner-hud" id="corner-hud"></div><div id="b3-over" class="b3-over"></div></div>
      <div class="hud" id="hud"></div></div>
    <div class="g-side"><div class="g-panel"><div class="seg" id="p-seg">
      <button data-p="players">Pemain</button><button data-p="assets">Asetku</button><button data-p="log">Riwayat</button></div><div id="p-body"></div></div></div></div>`;
}
function bindShell() {
  $('#board').addEventListener('click', e => {
    const t = e.target.closest('.t3'); if (!t) return;
    const i = +t.dataset.i;
    if (G.phase === 'choose' && G.pending && E.waitingFor(G).includes(me()) && G.pending.options.includes(i)) { picked = i; renderHud(); paintTiles(); haptic(10); return; }
    propertySheet(i);
  });
  $('#p-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; panelTab = b.dataset.p; LS.set('nexo.ptab2', panelTab); renderPanel(); };
  $('#view-btn').onclick = e => { viewMode = viewMode === 'top' ? '3d' : 'top'; LS.set('nexo.view', viewMode); e.currentTarget.innerHTML = `<i class="fa-solid ${viewMode === 'top' ? 'fa-cube' : 'fa-square'}"></i><span>${viewMode === 'top' ? '3D' : 'Atas'}</span>`; applyView(); haptic(8); };
}
function sizeBoard() {
  const wrap = $('#b3wrap'); if (!wrap) return;
  const W = wrap.clientWidth;
  wrap.style.setProperty('--bw', W + 'px');
  const plane = $('#board');
  wrap.style.setProperty('--u', ((plane ? plane.offsetWidth : W * .94) / T) + 'px');
}
function paintPhotos(onlyKey) {
  for (const s of E.SPACES) {
    if (!s.wiki || (onlyKey && s.key !== onlyKey)) continue;
    const el = $(`.t3[data-i="${s.i}"] .t3-photo`); if (!el) continue;
    const ph = photoOf(s);
    if (ph) { el.style.backgroundImage = `url("${ph.thumb}")`; el.innerHTML = ''; }
    else { el.style.backgroundImage = ''; el.innerHTML = s.type === 'city' ? landmarkSvg(s.icon) : ''; loadPhoto(s); }
  }
}

// Bangunan 3D (balok CSS) — warna mengikuti warna pemilik
const box = (w, d, h, o = {}) => `<div class="box ${o.cls || ''}" style="--w:${w};--d:${d};--h:${h};--x:${o.x || 0};--y:${o.y || 0};--z:${o.z || 0}${o.wall ? `;--wall:${o.wall}` : ''}${o.roof ? `;--roof:${o.roof}` : ''}"><i class="f-top"></i><i class="f-front"></i><i class="f-left"></i><i class="f-right"></i></div>`;
// Atap limas 3D (4 sisi segitiga) — sudut dihitung dari ukuran
function roof(w, d, r, z, o = {}) {
  const deg = x => x * 180 / Math.PI;
  const Lf = Math.hypot(r, d / 2), tf = deg(Math.atan2(r, d / 2)), Ls = Math.hypot(r, w / 2), ts = deg(Math.atan2(r, w / 2));
  const U = v => `calc(${v} * var(--u))`;
  return `<div class="roof3 ${o.cls || ''}" style="--x:${o.x || 0};--y:${o.y || 0};--z:${z}">
    <i class="rf" style="width:${U(w)};height:${U(Lf)};left:${U(-w / 2)};top:${U(d / 2 - Lf)};transform:rotateX(${-tf}deg)"></i>
    <i class="rb" style="width:${U(w)};height:${U(Lf)};left:${U(-w / 2)};top:${U(-d / 2)};transform:rotateX(${tf}deg)"></i>
    <i class="rr" style="width:${U(Ls)};height:${U(d)};left:${U(w / 2 - Ls)};top:${U(-d / 2)};transform:rotateY(${ts}deg)"></i>
    <i class="rl" style="width:${U(Ls)};height:${U(d)};left:${U(-w / 2)};top:${U(-d / 2)};transform:rotateY(${-ts}deg)"></i></div>`;
}
function buildingHtml(level, s) {
  const shadow = `<div class="bshadow" style="--sw:${[0.5, 0.6, 0.66, 0.7, 0.9][level] || 0.6}"></div>`;
  if (s.type === 'air') return shadow + box(0.56, 0.3, 0.16, { cls: 'win glassy', y: 0.08, wall: '#E5E5EA' }) + roof(0.6, 0.34, 0.08, 0.16, { y: 0.08, cls: 'rglass' }) + box(0.1, 0.1, 0.62, { x: 0.22, y: -0.14, wall: '#D1D1D6', roof: '#fff' }) + box(0.24, 0.24, 0.1, { x: 0.22, y: -0.14, z: 0.62, cls: 'glass' });
  if (level === 0) return shadow + box(0.34, 0.26, 0.04, { cls: 'plot' }) + box(0.035, 0.035, 0.62, { wall: '#F2F2F7', roof: '#fff', x: -0.1 }) + box(0.3, 0.02, 0.18, { x: 0.06, z: 0.42, cls: 'flag' });
  if (level === 1) return shadow + box(0.42, 0.34, 0.24, { cls: 'win1' }) + roof(0.5, 0.42, 0.24, 0.24) + box(0.06, 0.06, 0.16, { x: 0.12, y: -0.06, z: 0.3, cls: 'chim' });
  if (level === 2) return shadow + box(0.48, 0.38, 0.46, { cls: 'win' }) + box(0.5, 0.4, 0.04, { z: 0.22, cls: 'band' }) + roof(0.56, 0.46, 0.28, 0.46) + box(0.07, 0.07, 0.2, { x: 0.14, y: -0.08, z: 0.52, cls: 'chim' });
  if (level === 3) return shadow + box(0.36, 0.3, 0.3, { x: -0.18, y: 0.12, cls: 'win' }) + box(0.48, 0.4, 0.95, { x: 0.06, y: -0.04, cls: 'win' }) + box(0.52, 0.44, 0.05, { x: 0.06, y: -0.04, z: 0.95, cls: 'band' }) + box(0.26, 0.22, 0.16, { x: 0.06, y: -0.04, z: 1, cls: 'glass' }) + box(0.03, 0.03, 0.3, { x: 0.06, y: -0.04, z: 1.16, wall: '#ddd', roof: '#fff' });
  const layers = [0.1, 0.07, 0.04, 0.01].map((y, i) => `<div class="lm3" style="--ly:${y}"><div class="lm3-in ${i === 3 ? 'front' : 'back'}">${landmarkSvg(s.icon, i === 3 ? 'lm-main' : 'lm-shade')}</div></div>`).join('');
  return shadow + box(0.78, 0.6, 0.08, { cls: 'gold' }) + box(0.66, 0.5, 0.06, { z: 0.08, cls: 'gold' }) + layers;
}
function paintTiles() {
  const pk = G.pending, mineChoose = G.phase === 'choose' && pk && E.waitingFor(G).includes(me());
  for (const s of E.SPACES) {
    const t = $(`.t3[data-i="${s.i}"]`); if (!t) continue;
    const o = G.props[s.i];
    const col = o ? (pl(o.owner) || {}).color || '#888' : null;
    t.style.setProperty('--oc', col || 'transparent');
    t.classList.toggle('owned', !!o);
    t.classList.toggle('fest', G.festival === s.i);
    t.classList.toggle('pick', !!(mineChoose && pk.options.includes(s.i)));
    t.classList.toggle('picked', !!(mineChoose && picked === s.i));
    const bld = t.querySelector('.bld');
    const sig = o ? `${o.level}|${col}` : '';
    if (bld.dataset.sig !== sig) { bld.dataset.sig = sig; bld.innerHTML = o ? buildingHtml(o.level, s) : ''; bld.style.setProperty('--wall', col || '#999'); }
  }
}
function tileCenter(i) { const [x, y, w, h] = rect(i); return [(x + w / 2) / T * 100, (y + h / 2) / T * 100]; }
function placeTokens() {
  const box_ = $('#tokens'); if (!box_ || !G) return;
  const byPos = {};
  G.players.filter(p => !p.bankrupt).forEach(p => { const pos = disp[p.id] ?? p.pos; (byPos[pos] = byPos[pos] || []).push(p); });
  const seen = new Set(), waiting = E.waitingFor(G);
  for (const [pos, list] of Object.entries(byPos)) {
    const [cx, cy] = tileCenter(+pos);
    list.forEach((p, k) => {
      seen.add(p.id);
      let tk = box_.querySelector(`.tk[data-uid="${p.id}"]`);
      if (!tk) { tk = document.createElement('div'); tk.className = 'tk'; tk.dataset.uid = p.id; tk.innerHTML = `<div class="tk-shadow"></div><div class="tk-body"><div class="tk-head"></div><div class="tk-cone"></div></div>`; box_.appendChild(tk); }
      const html = pav(p.id, 30);
      const head = tk.querySelector('.tk-head'); if (head.dataset.av !== html) { head.innerHTML = html; head.dataset.av = html; }
      tk.style.setProperty('--pc', p.color);
      const n = list.length, ang = n > 1 ? (k / n) * Math.PI * 2 : 0, rad = n > 1 ? (n > 4 ? 2.6 : 2) : 0;
      tk.style.left = (cx + Math.cos(ang) * rad) + '%'; tk.style.top = (cy + Math.sin(ang) * rad * 0.9) + '%';
      tk.classList.toggle('jailed', !!p.jail && +pos === E.JAIL_POS);
      tk.classList.toggle('me', p.id === me());
      tk.classList.toggle('cur', waiting.includes(p.id));
    });
  }
  $$('.tk', box_).forEach(t => { if (!seen.has(t.dataset.uid)) t.remove(); });
}

// ---------- Panel sudut, tumpukan uang, papan tanda ----------
function paintCorners() {
  const el = $('#corner-hud'); if (!el || !G) return;
  const order = (G.order.length ? G.order : G.players.map(p => p.id)).slice(0, 4);
  const rank = G.players.filter(p => !p.bankrupt).map(p => p.id).sort((a, b) => E.netWorth(G, b) - E.netWorth(G, a));
  const waiting = E.waitingFor(G);
  el.innerHTML = order.map((id, k) => {
    const p = pl(id), r = rank.indexOf(id) + 1;
    return `<div class="ch p${k} ${waiting.includes(id) ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" style="--pc:${p.color}" data-pl="${id}">${pav(id, 30)}<div style="min-width:0"><div class="ch-n">${esc(p.name)}</div><div class="ch-c">${p.bankrupt ? 'Bangkrut' : rp(p.cash).replace('Rp ', '')}</div></div></div>`;
  }).join('');
  el.onclick = e => { const c = e.target.closest('[data-pl]'); if (c) playerSheet(c.dataset.pl); };
  $$('.stack3').forEach(st => {
    const k = +st.dataset.st, id = order[k], p = id && pl(id);
    const n = !p || p.bankrupt ? 0 : Math.max(1, Math.min(12, Math.round(p.cash / 3000000)));
    const sig = String(n);
    if (st.dataset.sig === sig) return;
    st.dataset.sig = sig;
    let h = '';
    for (let i = 0; i < n; i++) h += box(0.62, 0.32, 0.13, { x: (i % 2 ? 0.36 : -0.36), y: (i % 4 > 1 ? 0.4 : 0), z: Math.floor(i / 4) * 0.135 });
    st.innerHTML = h;
  });
  const who = waiting.length === 1 ? pl(waiting[0]) : null;
  const kk = $('#sign-k'), v = $('#sign-v');
  if (kk && v) {
    if (G.status === 'ended') { kk.textContent = 'Pemenang'; v.textContent = (pl(G.winner) || {}).name || '-'; }
    else { kk.textContent = who ? (who.id === me() ? 'Giliranmu' : 'Giliran ' + who.name) : 'Menunggu'; v.textContent = who ? rp(who.cash).replace('Rp ', '') : '-'; }
  }
}

// ---------- Dadu 3D ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieFace = n => Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');
const FACE_ROT = { 1: [0, 0], 6: [180, 0], 2: [90, 0], 5: [-90, 0], 3: [0, -90], 4: [0, 90] };
const spin = { A: 0, B: 0 };
function setCube(el, n, key, roll) {
  if (!el) return;
  const [rx, ry] = FACE_ROT[n];
  if (roll) spin[key] += 2;
  const extra = spin[key] * 360;
  el.style.transform = `translateZ(calc(var(--u) * .36)) rotateZ(${key === 'B' ? 32 : 12}deg) rotateX(${rx + extra}deg) rotateY(${ry + extra}deg)`;
}
function rollDice3D(d) {
  const box_ = $('#dice3'); if (!box_) return;
  box_.classList.remove('rolling'); void box_.offsetWidth; box_.classList.add('rolling');
  setCube($('#cubeA'), d[0], 'A', true); setCube($('#cubeB'), d[1], 'B', true);
  haptic(20);
}

// ---------- HUD (panel aksi) ----------
function timeLeft() { return G && G.deadline ? Math.max(0, Math.ceil((G.deadline - Date.now() - S.serverSkew) / 1000)) : null; }
function tick() {
  if (!G || G.status !== 'playing') return;
  const el = $('#c-tm'); if (!el) return;
  const t = timeLeft(); if (t === null) { el.textContent = ''; return; }
  el.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  el.classList.toggle('hot', t <= 10);
}
const CHOOSE_TEXT = { tour: '✈️ Tur Dunia: tap petak tujuanmu di papan', fly: '✈️ Tiket gratis: tap petak tujuanmu', festival: '🎉 Pilih kotamu untuk festival (sewa ×2)', renov: '🏗️ Pilih kotamu untuk renovasi gratis', storm: '🌪️ Pilih kota lawan yang diterjang badai', swap1: '🔄 Pilih kotamu yang mau ditukar', swap2: '🔄 Pilih kota lawan yang mau kamu ambil' };
function renderHud() {
  const el = $('#hud'); if (!el || !G) return;
  const uid = me(), p = pl(uid), waiting = E.waitingFor(G), myWait = waiting.includes(uid);
  if (!busy) { const d = G.dice ? G.dice.d : [1, 6]; setCube($('#cubeA'), d[0], 'A'); setCube($('#cubeB'), d[1], 'B'); }
  const tools = `<div class="hud-tools">${p && G.status === 'playing' ? '<button id="c-emo" aria-label="Emoji">😀</button>' : ''}<button id="c-help" aria-label="Cara main"><i class="fa-regular fa-circle-question"></i></button></div>`;
  if (G.status === 'ended') {
    const w = pl(G.winner);
    const why = { color: 'Monopoli Warna', side: 'Monopoli Jalur', air: 'Monopoli Wisata', time: 'Waktu habis', host: 'Diakhiri host', last: 'Pemain terakhir' }[G.winType] || '';
    el.innerHTML = `${tools}<div class="hud-win">🏆</div><div class="hud-msg"><b>${esc(w ? w.name : '')}</b> menang! <span class="muted">${why}</span></div>
      <div class="hud-acts"><button class="btn" id="c-res">Lihat hasil</button><button class="btn gray" id="c-again">Main lagi</button></div>`;
    return bindHud();
  }
  const who = waiting.length === 1 ? pl(waiting[0]) : null;
  const chip = `<div class="turn-chip" style="--pc:${who ? who.color : '#8E8E93'}">${who ? pav(who.id, 26) : ''}<span class="ell">${esc(myWait ? 'Giliranmu!' : who ? who.name + (isBot(who.id) ? ' sedang berpikir…' : '') : waiting.length + ' pemain')}</span><span class="tm" id="c-tm"></span></div>`;
  const ll = G.log[G.log.length - 1];
  let msg = ll ? esc(ll.text) : '', acts = '', extra = '';
  const pd = G.pending;
  if (G.phase === 'roll' && myWait) {
    if (p.jail) {
      msg = `🔒 Kamu di penjara (${p.jailTurns}/3). Lempar dobel untuk kabur, atau:`;
      acts = `<button class="btn orange" data-a="jail-pay" ${p.cash < E.JAIL_FINE ? 'disabled' : ''}>Bayar ${rp(E.JAIL_FINE)}</button>${p.cards.includes('jailfree') ? '<button class="btn green" data-a="jail-card">🗝️ Pakai kunci</button>' : ''}<button class="btn" data-a="roll">🎲 Coba dobel</button>`;
    } else {
      if (G.rolledDouble) msg = 'Dobel! Lempar sekali lagi 🎉';
      acts = `<button class="btn big-roll" data-a="roll">🎲 Lempar Dadu</button>`;
    }
  } else if (G.phase === 'build' && pd && myWait) {
    const s = E.SPACES[pd.pos];
    const opts = []; for (let l = Math.max(0, pd.from + 1); l <= pd.max; l++) opts.push(l);
    if (buildSel === null || !opts.includes(buildSel)) { let best = opts[0]; for (const l of opts) if (E.buildCost(pd.pos, pd.from, l) <= p.cash) best = l; buildSel = best; }
    const ph = photoOf(s);
    msg = '';
    extra = `<div class="buy-card"><div class="bc-photo" style="${ph ? `background-image:url('${ph.thumb}')` : `background:${groupColor(s)}`}"></div><div class="bc-main"><div class="bc-k">${pd.from < 0 ? (s.type === 'air' ? 'Beli bandara' : 'Beli kota') : buildSel === 4 ? 'Bangun landmark' : 'Upgrade kota'}</div><div class="bc-t">${esc(s.name)}</div><div class="bc-s">${s.country ? esc(s.country) + ' · ' : ''}${pd.from >= 0 ? 'Sekarang: ' + E.LEVEL_NAMES[pd.from] + ' · ' : ''}Uangmu ${rp(p.cash)}</div></div></div>
      ${s.type === 'city' ? `<div class="lvl-pick">${opts.map(l => { const c = E.buildCost(pd.pos, pd.from, l); return `<button data-lvl="${l}" class="${l === buildSel ? 'on' : ''}" ${c > p.cash ? 'disabled' : ''}><span class="lp-ic">${LVL_IC[l]}</span><b>${E.LEVEL_NAMES[l]}</b><small>${rp(c)}</small></button>`; }).join('')}</div>` : ''}`;
    const cost = E.buildCost(pd.pos, pd.from, buildSel);
    acts = `<button class="btn green" data-a="build" ${cost > p.cash ? 'disabled' : ''}>${pd.from < 0 ? 'Beli' : 'Bangun'} · ${rp(cost)}</button><button class="btn gray" data-a="skip">Lewati</button>`;
    if (s.type === 'city') extra += `<div class="hud-sub">Sewa dasar jadi ${rp(Math.round(s.price * TOLLM[buildSel] / 10000) * 10000)}${buildSel === 3 ? ' · Mampir lagi nanti untuk bangun LANDMARK 🏛️' : ''}</div>`;
  } else if (G.phase === 'takeover' && pd && myWait) {
    const s = E.SPACES[pd.pos], o = G.props[pd.pos];
    msg = `Ambil alih <b>${esc(s.name)}</b> dari ${esc(pname(o.owner))} seharga <b>${rp(pd.cost)}</b>? 😎`;
    acts = `<button class="btn orange" data-a="takeover">Ambil Alih</button><button class="btn gray" data-a="skip">Tidak</button>`;
  } else if (G.phase === 'choose' && pd && myWait) {
    msg = CHOOSE_TEXT[pd.kind] || 'Pilih petak';
    if (pd.kind === 'swap2') msg += ` (ditukar dengan ${esc(E.SPACES[pd.mine].name)})`;
    acts = picked !== null && pd.options.includes(picked) ? `<button class="btn" data-choose="${picked}">Pilih ${esc(E.SPACES[picked].name)}</button>` : '<span class="hud-sub">Petak yang bisa dipilih menyala di papan.</span>';
    if (pd.skip) acts += `<button class="btn gray" data-a="skip">Lewati</button>`;
  } else if (G.phase === 'debt') {
    const d = G.debts.find(x => x.from === uid);
    if (d) {
      const props = E.myProps(G, uid);
      msg = `Kamu harus bayar <b>${rp(d.amount)}</b> ${d.to ? 'ke ' + esc(pname(d.to)) : 'ke bank'}. Uangmu ${rp(p.cash)}. Jual properti (dapat 50%):`;
      extra = `<div class="sell-list">${props.map(i => `<button data-sell="${i}"><span class="sw" style="background:${groupColor(E.SPACES[i])}"></span>${esc(E.SPACES[i].short)} <b>+${rp(Math.round(G.props[i].invested / 2))}</b></button>`).join('') || '<span class="hud-sub">Tidak ada properti lagi.</span>'}</div>`;
      acts = `<button class="btn green" data-a="pay-debt" ${p.cash < d.amount ? 'disabled' : ''}>Bayar</button><button class="btn tint red" data-a="bankrupt">Bangkrut</button>`;
    } else msg = `Menunggu ${waiting.map(x => esc(pname(x))).join(', ')} membayar utang…`;
  } else if (!myWait) {
    if (who && G.phase !== 'roll') msg = `${esc(who.name)} sedang memutuskan…`;
    if (p && !p.bankrupt && who && !isBot(who.id) && (G.mode === 'santai' || !G.deadline)) acts = `<button class="btn sm tint" id="c-nudge">👋 Colek</button>`;
  }
  if (!p) acts = `<span class="hud-sub">Kamu menonton game ini 👀</span>`;
  else if (p.bankrupt) acts = `<span class="hud-sub">Kamu sudah bangkrut. Tonton sampai selesai 👀</span>`;
  const cards = p && p.cards.length ? `<div class="my-cards">${p.cards.map(c => { const cd = E.CARDS.find(x => x.id === c); return `<span title="${esc(cd.title)}">${cd.icon}</span>`; }).join('')}</div>` : '';
  el.innerHTML = `${tools}${chip}${cards}${msg ? `<div class="hud-msg">${msg}</div>` : ''}${extra}<div class="hud-acts">${acts}</div>`;
  bindHud(); tick();
}
function bindHud() {
  const el = $('#hud');
  el.onclick = async e => {
    const a = e.target.closest('[data-a]'), lv = e.target.closest('[data-lvl]'), ch = e.target.closest('[data-choose]'), sell = e.target.closest('[data-sell]');
    if (lv) { buildSel = +lv.dataset.lvl; renderHud(); haptic(5); return; }
    if (a) {
      if (a.dataset.a === 'bankrupt' && !await confirmBox('Nyatakan bangkrut?', 'Semua asetmu diserahkan dan kamu keluar dari permainan.', 'Bangkrut', true)) return;
      const payload = { type: a.dataset.a };
      if (a.dataset.a === 'build') payload.level = buildSel;
      buildSel = null; picked = null;
      return act(payload, a);
    }
    if (ch) { const pos = +ch.dataset.choose; picked = null; return act({ type: 'choose', pos }, ch); }
    if (sell) return act({ type: 'sell', pos: +sell.dataset.sell }, sell);
    if (e.target.closest('#c-help')) return rulesSheet();
    if (e.target.closest('#c-emo')) return emotePicker(e.target.closest('#c-emo'));
    if (e.target.closest('#c-nudge')) { try { await call('game.nudge', { id: gid }); toast('Colekan terkirim 👋'); } catch (er) { toast(er.message); } return; }
    if (e.target.closest('#c-res')) return resultsSheet();
    if (e.target.closest('#c-again')) return playAgain();
  };
}
async function act(a, btn) {
  if (btn) btn.disabled = true;
  try { await call('game.act', { id: gid, a }); haptic(8); }
  catch (e) { toast(e.message); if (btn) btn.disabled = false; }
}

// ---------- Panel bawah ----------
function renderPanel() {
  const body = $('#p-body'); if (!body) return;
  const uid = me();
  $$('#p-seg button').forEach(b => b.classList.toggle('on', b.dataset.p === panelTab));
  if (panelTab === 'players') {
    const order = G.order.length ? G.order : G.players.map(p => p.id);
    const waiting = E.waitingFor(G);
    body.innerHTML = order.map(id => {
      const p = pl(id); if (!p) return '';
      const props = E.myProps(G, id), lms = props.filter(i => G.props[i].level === 4).length;
      const rank = G.ranking ? G.ranking.findIndex(r => r.id === id) + 1 : 0;
      const cards = p.cards.map(c => E.CARDS.find(x => x.id === c).icon).join('');
      return `<button class="p-row ${waiting.includes(id) ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" data-pl="${id}" style="--pc:${p.color}">${pav(id, 38)}<div class="main"><div class="nm"><span class="ell">${esc(p.name)}${id === uid ? ' (kamu)' : ''}</span>${waiting.includes(id) && G.status === 'playing' ? '<i class="fa-solid fa-circle-play c-blue" style="font-size:12px"></i>' : ''}${rank === 1 ? '🏆' : ''}</div>
        <div class="sub">${p.bankrupt ? 'Bangkrut 💥' : `${p.jail ? '🔒 ' : ''}${p.tour ? '✈️ ' : ''}📍 ${esc(E.SPACES[p.pos].short)} · 🏙️ ${props.length}${lms ? ` · 🏛️ ${lms}` : ''}${cards ? ' · ' + cards : ''}`}</div></div>
        <div class="cash">${p.bankrupt ? '—' : rp(p.cash)}<small>${p.bankrupt ? '' : 'aset ' + rp(E.netWorth(G, id))}</small></div></button>`;
    }).join('');
    body.onclick = e => { const r = e.target.closest('[data-pl]'); if (r) playerSheet(r.dataset.pl); };
  } else if (panelTab === 'assets') {
    const p = pl(uid);
    if (!p) { body.innerHTML = '<div class="empty">Kamu bukan pemain di room ini.</div>'; return; }
    const mine = E.myProps(G, uid);
    body.innerHTML = `<div style="padding:0 14px 10px"><div class="small muted">Uang · Total aset</div><div class="b" style="font-size:18px">${rp(p.cash)} · ${rp(E.netWorth(G, uid))}</div>
      ${p.cards.length ? `<div class="small" style="margin-top:6px">Kartu: ${p.cards.map(c => { const cd = E.CARDS.find(x => x.id === c); return cd.icon + ' ' + esc(cd.title); }).join(', ')}</div>` : ''}</div>
      ${mine.length ? `<div class="pc-list" style="padding:0 12px 14px">${mine.map(pcard).join('')}</div>` : '<div class="empty"><i class="fa-solid fa-city"></i>Belum punya kota. Berhenti di kota kosong untuk membelinya.</div>'}`;
    body.onclick = e => { const c = e.target.closest('[data-i]'); if (c) propertySheet(+c.dataset.i); };
  } else {
    body.innerHTML = `<div class="log">${G.log.slice().reverse().map(l => `<div class="k-${l.kind}"><time>${hm(l.ts)}</time><span>${esc(l.text)}</span></div>`).join('')}</div>`;
    body.onclick = null;
  }
}
function pcard(i) {
  const s = E.SPACES[i], o = G.props[i], ph = photoOf(s);
  return `<button class="pcard" data-i="${i}" style="--gc:${groupColor(s)}"><span class="pc-ph" style="${ph ? `background-image:url('${ph.thumb}')` : `background:${groupColor(s)}`}"></span><div style="min-width:0"><div class="t ell">${esc(s.name)}${G.festival === i ? ' 🎉' : ''}</div><div class="s">${s.type === 'air' ? 'Bandara' : LVL_IC[o.level] + ' ' + E.LEVEL_NAMES[o.level]} · sewa ${rp(E.tollFor(G, i))}</div></div></button>`;
}

// ---------- Sheet properti ----------
function propertySheet(i) {
  const s = E.SPACES[i];
  if (!E.OWNABLE.has(s.type)) {
    const info = {
      start: `Setiap melewati START kamu terima gaji ${rp(E.SALARY)}. Berhenti tepat di START = bonus renovasi gratis 1 kota!`,
      jail: `Berhenti di sini = dipenjara maks 3 giliran. Keluar dengan lempar dadu dobel, bayar ${rp(E.JAIL_FINE)}, atau Kunci Bebas Penjara.`,
      festival: 'Pilih salah satu kotamu jadi tuan rumah festival: sewa kota itu jadi ×2!',
      tour: 'Giliran berikutnya kamu bebas terbang ke petak mana saja.',
      card: 'Ambil Kartu Keberuntungan: bonus uang, perisai sewa, tiket pesawat, renovasi gratis, dan lainnya. Semuanya menguntungkan!',
      tax: 'Bayar pajak 10% dari total nilai propertimu (min Rp 200 rb).'
    }[s.type];
    const [ic, , col] = CORNER[s.type] || [SPECIAL_ICON[s.type][0], '', SPECIAL_ICON[s.type][1]];
    sheet({ title: s.name, body: `<div style="text-align:center;padding:10px 6px 20px;display:flex;flex-direction:column;gap:12px;align-items:center"><span class="ico" style="width:70px;height:70px;border-radius:18px;font-size:30px;background:${col}"><i class="fa-solid ${ic}"></i></span>
      <div class="b" style="font-size:22px">${esc(s.name)}</div><p class="muted" style="line-height:1.45">${esc(info)}</p>${playersHere(i)}</div>` });
    return;
  }
  const o = G && G.props[i], owner = o ? pl(o.owner) : null, gc = groupColor(s), ph = photoOf(s);
  if (!ph) loadPhoto(s);
  const head = `<div class="deed-head photo" style="${ph ? `background-image:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.72)),url('${ph.full}')` : `background:linear-gradient(150deg, ${gc}, color-mix(in srgb, ${gc} 55%, #000))`}">
    ${!ph && s.type === 'city' ? landmarkSvg(s.icon) : ''}<span class="deed-chip" style="background:${gc}">${s.type === 'air' ? 'Bandara · Wisata' : esc(E.GROUPS[s.group].name)}</span>
    <div class="k">${s.type === 'city' ? esc(s.country) : 'Bandara'}</div><h2>${esc(s.name)}</h2>${s.landmark ? `<div class="lmname">🏛️ ${esc(s.landmark)}</div>` : ''}</div>
    <div class="small muted" style="text-align:right;margin-top:4px">${ph && ph.custom ? 'Foto diunggah admin' : ph && ph.page ? `Foto: <a href="${esc(ph.page)}" target="_blank" rel="noopener">Wikipedia</a>` : ''}</div>`;
  let rows = '';
  if (s.type === 'city') {
    const lvl = o ? o.level : -1;
    rows = [0, 1, 2, 3, 4].map(l => `<div class="row ${lvl === l ? 'now' : ''}"><div class="main">${LVL_IC[l]} ${E.LEVEL_NAMES[l]}</div><span class="val">Sewa ${rp(Math.round(s.price * TOLLM[l] / 10000) * 10000)}</span></div>`).join('')
      + `<div class="row"><div class="main">Harga tanah</div><span class="val">${rp(s.price)}</span></div><div class="row"><div class="main">Harga per rumah</div><span class="val">${rp(E.houseCost(i))}</span></div><div class="row"><div class="main">Harga landmark</div><span class="val">${rp(E.landmarkCost(i))}</span></div>`;
  } else rows = [1, 2, 3, 4].map(n => `<div class="row"><div class="main">Punya ${n} bandara</div><span class="val">${rp([400, 1000, 2000, 4000][n - 1] * 1000)}</span></div>`).join('') + `<div class="row"><div class="main">Harga beli</div><span class="val">${rp(s.price)}</span></div>`;
  const extraInfo = o ? `<div class="list" style="margin-top:12px"><div class="row"><div class="main">Sewa sekarang</div><span class="val b">${rp(E.tollFor(G, i))}${G.festival === i ? ' 🎉' : ''}</span></div>${o.level < 4 ? `<div class="row"><div class="main">Harga ambil alih</div><span class="val">${rp(E.takeoverCost(G, i))}</span></div>` : '<div class="row"><div class="main">Landmark</div><span class="val">Tidak bisa diambil alih 🛡️</span></div>'}</div>` : '';
  const admin = S.me && S.me.admin ? `<div style="display:flex;gap:8px;margin-top:14px"><button class="btn md tint" style="flex:1" id="ph-up"><i class="fa-solid fa-image"></i> Ganti foto</button>${ph && ph.custom ? '<button class="btn md gray" style="flex:1" id="ph-reset">Pakai foto asli</button>' : ''}</div>` : '';
  const sh = sheet({ title: '', body: `${head}
    <div class="list" style="margin-top:10px"><div class="row has-avatar">${owner ? pav(owner.id, 34, { ring: owner.color }) : '<span class="ico bg-gray" style="width:34px;height:34px;border-radius:50%"><i class="fa-solid fa-building-columns"></i></span>'}<div class="main"><div class="t">${owner ? esc(owner.name) : 'Belum dimiliki'}</div><div class="s">${o ? (s.type === 'air' ? 'Pemilik bandara' : E.LEVEL_NAMES[o.level]) : 'Berhenti di sini untuk membeli'}</div></div></div></div>
    ${extraInfo}<div class="list rent-table" style="margin-top:12px">${rows}</div>${admin}${playersHere(i)}<div style="height:8px"></div>` });
  const up = $('#ph-up', sh.body);
  if (up) up.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { up.disabled = true; const { blob } = await compressImage(f, 1280, .85); const r = await uploadImage(blob); const res = await call('photo.set', { key: s.key, media: r.id }); S.settings.photos = res.photos; emit('photos'); sh.close(); toast('Foto kota diganti 📸'); }
    catch (e) { up.disabled = false; toast(e.message); }
  };
  const rs = $('#ph-reset', sh.body);
  if (rs) rs.onclick = async () => { try { const res = await call('photo.set', { key: s.key, media: null }); S.settings.photos = res.photos; emit('photos'); sh.close(); toast('Kembali ke foto asli'); } catch (e) { toast(e.message); } };
}
function playersHere(i) {
  if (!G || G.status === 'lobby') return '';
  const here = G.players.filter(p => !p.bankrupt && p.pos === i);
  return here.length ? `<div class="small muted" style="margin-top:14px;display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap">Di sini: ${here.map(p => pav(p.id, 22, { ring: p.color }) + esc(p.name)).join(' ')}</div>` : '';
}
function playerSheet(id) {
  const p = pl(id), uid = me(); if (!p) return;
  const props = E.myProps(G, id);
  const sh = sheet({ title: '', body: `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 0 10px">${pav(id, 76, { ring: p.color })}<div class="b" style="font-size:22px">${esc(p.name)}</div>
      <div class="muted small">${p.bankrupt ? 'Bangkrut' : `Uang ${rp(p.cash)} · Aset ${rp(E.netWorth(G, id))}`}</div></div>
    ${id !== uid && !isBot(id) ? `<div style="display:flex;gap:8px;margin:6px 0 14px"><button class="btn md tint" style="flex:1" id="ps-dm"><i class="fa-solid fa-comment"></i> Kirim pesan</button></div>` : ''}
    <div class="section-h" style="padding-left:4px">Properti (${props.length})</div>${props.length ? `<div class="pc-list">${props.map(pcard).join('')}</div>` : '<p class="small muted">Belum punya properti.</p>'}<div style="height:10px"></div>` });
  sh.body.onclick = e => {
    if (e.target.closest('#ps-dm')) { sh.close(); openConv(dmId(uid, id)); return; }
    const c = e.target.closest('[data-i]'); if (c) { sh.close(); propertySheet(+c.dataset.i); }
  };
}

// ---------- Kartu 3D di samping bidak ----------
function showCard3D(c) {
  return new Promise(resolve => {
    const over = $('#b3-over'), wrap = $('#b3wrap'); if (!over || !wrap) return resolve();
    const cd = E.CARDS[c.idx] || E.CARDS.find(x => x.id === c.id);
    const tk = $(`.tk[data-uid="${c.uid}"] .tk-head`);
    const wr = wrap.getBoundingClientRect();
    let x = wr.width / 2, y = wr.height / 2;
    if (tk) { const r = tk.getBoundingClientRect(); x = r.left - wr.left + r.width / 2; y = r.top - wr.top; }
    const cw = Math.min(170, wr.width * 0.42), ch = cw * 1.42;
    const left = x > wr.width / 2 ? x - cw - 22 : x + 22;
    const el = document.createElement('div');
    el.className = 'card3';
    el.style.cssText = `left:${Math.max(6, Math.min(wr.width - cw - 6, left))}px;top:${Math.max(6, Math.min(wr.height - ch - 6, y - ch * 0.5))}px;width:${cw}px;height:${ch}px;--c1:${cd.color[0]};--c2:${cd.color[1]}`;
    el.innerHTML = `<div class="card3-in"><div class="card3-back"><span>NEXO</span><small>Kartu Keberuntungan</small></div>
      <div class="card3-front"><div class="c3-ic">${cd.icon}</div><div class="c3-t">${esc(cd.title)}</div><div class="c3-x">${esc(cd.text)}</div>${cd.keep ? '<div class="c3-keep">Disimpan</div>' : ''}<div class="c3-who">${esc(pname(c.uid))}</div></div></div>`;
    over.appendChild(el);
    sfx('card');
    let done = false;
    const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 450); };
    el.onclick = close; setTimeout(close, 3800);
  });
}
const EMOTES = ['😂', '🔥', '😭', '😡', '👏', '💸', '🙏', '😎', '🤣', '💀'];
function emotePicker(btn) {
  popMenu(btn, `<div class="emote-bar" style="flex-wrap:wrap;justify-content:center;box-shadow:none;background:none">${EMOTES.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`, (el, close) => {
    el.onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; close(); fire('game.emote', { id: gid, emoji: b.dataset.e }); };
  });
}
function showEmote(uid, emoji) {
  const over = $('#b3-over'), wrap = $('#b3wrap'); if (!over) return;
  const tk = $(`.tk[data-uid="${uid}"] .tk-head`), wr = wrap.getBoundingClientRect();
  let x = wr.width / 2, y = wr.height / 2;
  if (tk) { const r = tk.getBoundingClientRect(); x = r.left - wr.left + r.width / 2; y = r.top - wr.top; }
  const el = document.createElement('div'); el.className = 'emote';
  el.style.left = (x - 24) + 'px'; el.style.top = (y - 50) + 'px';
  el.innerHTML = `${esc(emoji)}<small>${esc(pname(uid))}</small>`;
  over.appendChild(el); setTimeout(() => el.remove(), 2300);
}
function celebrate() {
  const key = 'nexo.celebrated.' + G.id;
  if (LS.get(key, false)) return;
  LS.set(key, true);
  sfx('win'); confetti(); haptic(200);
  const w = pl(G.winner), over = $('#b3-over');
  if (over && w) {
    const why = { color: 'MONOPOLI WARNA!', side: 'MONOPOLI JALUR!', air: 'MONOPOLI WISATA!' }[G.winType] || 'JUARA!';
    const el = document.createElement('div'); el.className = 'win-banner';
    el.innerHTML = `<div class="wb-trophy">🏆</div><div class="wb-why">${why}</div><div class="wb-av">${pav(w.id, 64, { ring: w.color })}</div><div class="wb-name">${esc(w.name)} menang!</div>`;
    over.appendChild(el); setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
  }
  setTimeout(resultsSheet, 4600);
}
function resultsSheet() {
  if (!G || !G.ranking) return;
  sheet({ title: 'Hasil Akhir', body: `<div class="result"><div class="trophy">🏆</div><div class="b" style="font-size:24px">${esc((pl(G.winner) || {}).name || '')} menang!</div><div class="muted small">${G.endedAt && G.startedAt ? `Durasi ${Math.max(1, Math.round((G.endedAt - G.startedAt) / 60000))} menit` : ''}</div></div>
    <div class="list">${G.ranking.map((r, k) => { const p = pl(r.id); return `<div class="row has-avatar"><span class="lb-rank">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${pav(r.id, 36, { ring: p.color })}<div class="main"><div class="t">${esc(p.name)}</div><div class="s">${r.bankrupt ? 'Bangkrut' : 'Kekayaan ' + rp(r.worth)}</div></div></div>`; }).join('')}</div>
    <div style="padding-top:16px"><button class="btn block" id="rs-again">Main lagi dengan pemain yang sama</button></div>`, onOpen: s => { $('#rs-again', s.body).onclick = () => { s.close(); playAgain(); }; } });
}
async function playAgain() {
  try {
    const bots = G.players.filter(p => isBot(p.id)).length;
    const g = await call('game.create', { name: G.name, mode: G.mode, settings: G.settings, bots, color: (pl(me()) || {}).color, invite: G.players.map(p => p.id).filter(x => x !== me() && !isBot(x)) });
    toast('Room baru dibuat');
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
    <p>🎯 <b>Menang:</b> jadi pemain terakhir yang tidak bangkrut, <b>atau</b> langsung menang dengan <b>Monopoli</b>: 3 grup warna lengkap, semua properti di 1 sisi papan, atau ke-4 bandara.</p>
    <p>🎲 <b>Giliran otomatis:</b> lempar dadu → jalan → putuskan beli/bangun → giliran langsung pindah. Dobel = lempar lagi (3x dobel masuk penjara).</p>
    <p>🏙️ <b>Beli & bangun:</b> di kota kosong kamu bisa beli Tanah sampai 3 Rumah sekaligus. Setiap tingkat, bangunannya makin tinggi (3D) & sewa makin mahal.</p>
    <p>🏛️ <b>Landmark:</b> kalau kotamu sudah 3 Rumah, mampir lagi ke sana untuk membangun Landmark. Sewa paling mahal & tidak bisa diambil alih!</p>
    <p>😎 <b>Ambil alih:</b> setelah bayar sewa di kota lawan, kamu boleh membelinya seharga 2× nilai investasinya (kecuali landmark).</p>
    <p>🎨 <b>Grup warna lengkap</b> = sewa ×2. <b>Festival</b> = sewa kota pilihan ×2.</p>
    <p>✈️ <b>Tur Dunia:</b> giliran berikutnya bebas terbang ke mana saja. Berhenti tepat di <b>START</b> = renovasi gratis.</p>
    <p>🃏 <b>Kartu Keberuntungan:</b> semuanya menguntungkan, misalnya Perisai Malaikat (bebas sewa), Diskon 50%, Tiket Pesawat, Renovasi, Badai, Tukar Kota, dan bonus uang.</p>
    <p>🔒 <b>Penjara:</b> maks 3 giliran. Kabur dengan dobel, bayar ${rp(E.JAIL_FINE)}, atau Kunci Bebas Penjara.</p>
    <p>🏦 <b>Uang kurang?</b> Jual properti ke bank (dapat 50%). Kalau tetap kurang, bangkrut.</p>
    <p>🤖 <b>Bot:</b> host bisa menambahkan bot komputer di lobi untuk latihan atau menggenapi pemain.</p></div>` });
}

// ---------- Ubah nama & foto bot ----------
const BOT_EMOJIS = ['🤖', '👾', '🦾', '🐱', '🐶', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐲', '👻', '🎃', '😎', '🤠', '🥷', '🧙', '🦸', '🧛', '👑', '⭐'];
const BOT_COLORS = ['#8E8E93', '#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#00C7BE', '#FF3B30', '#FFCC00'];
function editBot(id) {
  const p = pl(id); if (!p) return;
  let av = Object.assign({ emoji: '🤖', color: p.color }, p.avatar || {}), photoBlob = null, photoUrl = av.photo ? '/api/nexo/media/' + av.photo : null;
  let name = p.name;
  const sh = sheet({ title: 'Ubah Bot', left: 'Batal', right: 'Simpan' });
  const paint_ = () => {
    sh.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:6px 0 14px">${photoUrl ? `<span class="av" style="--s:90px"><img src="${photoUrl}"></span>` : avatar({ avatar: av }, 90)}
      <button class="btn sm tint" id="be-photo"><i class="fa-solid fa-camera"></i> ${photoUrl ? 'Ganti foto' : 'Pakai foto'}</button></div>
      <div class="list"><div class="row"><div class="main"><div class="t">Nama bot</div></div><input class="inline" id="be-name" maxlength="24" value="${esc(name)}"></div></div>
      <div class="section-h">Avatar</div><div class="emoji-grid" id="be-emo">${BOT_EMOJIS.map(e => `<button data-e="${e}" class="${!photoUrl && av.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
      <div class="color-row" id="be-col" style="margin-top:12px">${BOT_COLORS.map(c => `<button data-c="${c}" style="background:${c}" class="${av.color === c ? 'on' : ''}"></button>`).join('')}</div><div style="height:16px"></div>`;
  };
  paint_();
  sh.body.onclick = async e => {
    const keep = () => { const n = $('#be-name', sh.body); if (n) name = n.value; };
    if (e.target.closest('#be-photo')) { keep(); const f = await pickFile(); if (!f) return; const blob = await cropImage(f); if (!blob) return; photoBlob = blob; photoUrl = URL.createObjectURL(blob); paint_(); return; }
    const em = e.target.closest('[data-e]'); if (em) { keep(); av = { emoji: em.dataset.e, color: av.color || BOT_COLORS[0] }; photoBlob = null; photoUrl = null; paint_(); return; }
    const c = e.target.closest('[data-c]'); if (c) { keep(); av = { emoji: av.emoji || '🤖', color: c.dataset.c }; photoBlob = null; photoUrl = null; paint_(); }
  };
  sh.onRight = async () => {
    name = ($('#be-name', sh.body) || {}).value || name;
    sh.setRight('…', true);
    try {
      let avatar_ = photoUrl && !photoBlob && av.photo ? { photo: av.photo } : { emoji: av.emoji, color: av.color };
      if (photoBlob) { const up = await uploadImage(photoBlob); avatar_ = { photo: up.id }; }
      const g = await call('game.botedit', { id: gid, uid: id, name, avatar: avatar_ });
      if (g && g.id) applyNow(g);
      sh.close(); toast('Bot diperbarui 🤖');
    } catch (er) { sh.setRight('Simpan', false); toast(er.message); }
  };
}
function soundMenu(btn) {
  const html = `<button class="mi" data-s="fx">Efek suara <i class="fa-solid ${soundOn() ? 'fa-toggle-on c-green' : 'fa-toggle-off'}"></i></button>
    <button class="mi" data-s="music">Musik latar <i class="fa-solid ${musicOn() ? 'fa-toggle-on c-green' : 'fa-toggle-off'}"></i></button>
    <button class="mi" data-s="test">Tes suara <i class="fa-solid fa-volume-high"></i></button>
    <div class="mi small muted" style="justify-content:flex-start;padding:8px 16px;white-space:normal;max-width:260px">iPhone: naikkan volume. Suara tetap keluar walau mode senyap aktif.</div>`;
  popMenu(btn, html, (el, close) => {
    el.onclick = e => {
      const b = e.target.closest('[data-s]'); if (!b) return; close();
      if (b.dataset.s === 'fx') { setSound(!soundOn()); toast(soundOn() ? 'Suara aktif 🔊' : 'Suara mati 🔇'); if (soundOn() && G && G.status === 'playing') startMusic(); }
      if (b.dataset.s === 'music') { setMusic(!musicOn()); toast(musicOn() ? 'Musik latar aktif 🎵' : 'Musik latar mati'); }
      if (b.dataset.s === 'test') { if (!soundOn()) setSound(true); testSound(); }
      const ic = $('#g-snd'); if (ic) ic.innerHTML = `<i class="fa-solid ${soundOn() ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>`;
    };
  });
}
