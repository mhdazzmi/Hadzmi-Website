/* Nexo Games — Chat ala iMessage: grup + pesan pribadi, foto, balas, reaksi, dibaca, mengetik */
import { $, $$, esc, S, LS, on, emit, call, fire, avatar, user, hm, dayLabel, listTime, lastSeen, pushScreen, popScreen, topScreen, setView,
  toast, sheet, banner, popMenu, viewer, compressImage, uploadImage, pickFile, mediaUrl, linkify, confirmBox, haptic } from './core.js';

const scr = $('#scr-chat');
let cur = null;           // id percakapan yang sedang dibuka
let replyTo = null, editing = null;
let showTimeFor = null;
const REACTS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const isTouch = matchMedia('(pointer: coarse)').matches;

export const dmId = (a, b) => 'dm:' + [a, b].sort().join(':');
const otherOf = id => id.split(':').slice(1).find(x => x !== S.me.id);
export function unreadCount(c) { if (!c || !S.me) return 0; return Math.max(0, (c.seq || 0) - ((c.reads || {})[S.me.id] || 0)); }
export function totalUnread() { return Object.values(S.convs).reduce((n, c) => n + (c.id === cur && document.visibilityState === 'visible' ? 0 : unreadCount(c)), 0); }
function convTitle(id) { return id === 'group' ? 'Grup Nexo' : user(otherOf(id)).name; }
function convAvatar(id, size) { return id === 'group' ? `<span class="av group-av" style="--s:${size}px"><i class="fa-solid fa-user-group" style="font-size:${size * .4}px"></i></span>` : avatar(otherOf(id), size, { dot: true }); }
function store(id) { return S.msgs[id] || (S.msgs[id] = { list: [], more: true, loaded: false }); }
function isEmojiOnly(t) { if (!t || t.length > 16) return false; return /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(t) && /\p{Extended_Pictographic}/u.test(t); }

export function initChat() {
  on('init', () => {
    // setelah tersambung ulang, muat ulang percakapan yang sedang dibuka
    for (const k of Object.keys(S.msgs)) if (k !== cur) delete S.msgs[k];
    if (cur) loadLatest(cur);
  });
  on('msg', ({ conv, msg, meta }) => {
    S.convs[conv] = meta;
    const st = S.msgs[conv];
    if (st && st.loaded) {
      const i = msg.cid ? st.list.findIndex(x => x.cid === msg.cid && !x.seq) : -1;
      if (i >= 0) st.list[i] = msg; else if (!st.list.some(x => x.seq === msg.seq)) st.list.push(msg);
    }
    if (S.typing[conv]) delete S.typing[conv][msg.from];
    const viewing = cur === conv && topScreen() === scr && document.visibilityState === 'visible';
    if (cur === conv) { renderMsgs(true); if (viewing) markRead(); }
    if (msg.from !== S.me.id && !viewing && msg.from !== 'sys') {
      const u = user(msg.from);
      banner({ title: conv === 'group' ? `${u.name} · Grup Nexo` : u.name, body: msg.text || '📷 Foto', av: avatar(u, 38), onClick: () => openConv(conv) });
      haptic(20);
    }
    emit('chat-list');
  });
  on('msgUpdate', ({ conv, msg, meta }) => {
    S.convs[conv] = meta;
    const st = S.msgs[conv];
    if (st) { const i = st.list.findIndex(x => x.seq === msg.seq); if (i >= 0) st.list[i] = msg; }
    if (cur === conv) renderMsgs(false);
    emit('chat-list');
  });
  on('read', ({ conv, uid, seq }) => {
    const c = S.convs[conv]; if (!c) return;
    c.reads = c.reads || {}; c.reads[uid] = Math.max(c.reads[uid] || 0, seq);
    if (cur === conv) renderMsgs(false);
    if (uid === S.me.id) emit('chat-list');
  });
  on('typing', ({ conv, uid }) => {
    (S.typing[conv] = S.typing[conv] || {})[uid] = Date.now() + 4500;
    if (cur === conv) renderTyping();
    setTimeout(() => { if (cur === conv) renderTyping(); }, 4700);
  });
  on('presence-ui', () => { if (cur) renderHead(); });
  on('chat-list', () => { emit('refresh-badges'); if ($('#v-chat').classList.contains('on')) renderChatList($('#v-chat')); if (cur) renderBackLabel(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cur && topScreen() === scr) markRead(); });
}

// ================= Daftar chat =================
export function renderChatList(el) {
  const me = S.me;
  const convs = Object.values(S.convs).filter(c => c.id === 'group' || (c.last && S.users[otherOf(c.id)]));
  const group = convs.find(c => c.id === 'group') || { id: 'group', seq: 0, reads: {} };
  const dms = convs.filter(c => c.id !== 'group').sort((a, b) => (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0));
  const friends = Object.values(S.users).filter(u => u.id !== me.id).sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || ((b.lastSeen || 0) - (a.lastSeen || 0)));
  const row = c => {
    const n = unreadCount(c), l = c.last;
    let prev = l ? (l.from === 'sys' ? l.text : (l.from === me.id ? 'Kamu: ' : c.id === 'group' ? user(l.from).name + ': ' : '') + (l.voice ? '🎤 Pesan suara' : l.img && !l.text ? '📷 Foto' : l.text)) : (c.id === 'group' ? 'Ngobrol bareng semua teman di sini 👋' : '');
    return `<button class="chat-row" data-conv="${esc(c.id)}">${convAvatar(c.id, 52)}<div class="main"><div class="top"><span class="name ell">${esc(convTitle(c.id))}</span><span class="time">${l ? listTime(l.ts) : ''}</span></div>
      <div style="display:flex;gap:8px;align-items:center"><div class="prev" style="flex:1">${esc(prev)}</div>${n ? `<span class="ubadge">${n > 99 ? '99+' : n}</span>` : ''}</div></div></button>`;
  };
  el.innerHTML = `<div class="nav"><div class="nav-row"><span style="min-width:36px"></span><span class="nav-title"></span><button class="icon-btn" id="c-new" aria-label="Pesan baru"><i class="fa-solid fa-pen-to-square"></i></button></div></div>
  <div class="page"><h1 class="large-title">Chat</h1>
    ${friends.length ? `<div class="friends-strip" style="margin-top:8px">${friends.map(u => `<button data-dm="${u.id}">${avatar(u, 56, { dot: true })}<span class="ell" style="max-width:62px">${esc(u.name)}</span></button>`).join('')}</div>` : ''}
    <div class="list" style="margin-top:6px">${row(group)}${dms.map(row).join('')}</div>
    ${!friends.length ? `<div class="empty"><i class="fa-solid fa-user-group"></i>Teman-temanmu belum bergabung.<br>Bagikan link dari tab <b>Saya</b>.</div>` : ''}
  </div>`;
  el.onclick = e => {
    const c = e.target.closest('[data-conv]'); if (c) return openConv(c.dataset.conv);
    const d = e.target.closest('[data-dm]'); if (d) return openConv(dmId(me.id, d.dataset.dm));
    if (e.target.closest('#c-new')) pickFriend();
  };
}

export function pickFriend(title = 'Pesan Baru') {
  const friends = Object.values(S.users).filter(u => u.id !== S.me.id).sort((a, b) => a.name.localeCompare(b.name));
  const sh = sheet({ title, body: `<div class="list"><button class="row has-avatar tap" data-conv="group">${convAvatar('group', 40)}<div class="main"><div class="t">Grup Nexo</div><div class="s">Semua teman</div></div></button>
    ${friends.map(u => `<button class="row has-avatar tap" data-conv="${dmId(S.me.id, u.id)}">${avatar(u, 40, { dot: true })}<div class="main"><div class="t">${esc(u.name)}</div><div class="s">${esc(lastSeen(u.id))}</div></div></button>`).join('')}</div>` });
  sh.body.onclick = e => { const b = e.target.closest('[data-conv]'); if (b) { sh.close(); openConv(b.dataset.conv); } };
}

// ================= Percakapan =================
export async function openConv(id) {
  if (!S.me) return;
  if (id.startsWith('dm:')) { const parts = id.split(':'); if (!parts.includes(S.me.id)) return; id = dmId(parts[1], parts[2]); }
  if (!S.convs[id]) S.convs[id] = { id, seq: 0, last: null, reads: {} };
  if (cur !== id) { replyTo = null; showTimeFor = null; }
  cur = id;
  buildScreen();
  pushScreen(scr, () => { cur = null; setView(topScreen() ? topScreen().dataset.view || '' : 'tab'); emit('chat-list'); });
  scr.dataset.view = 'chat:' + id;
  setView('chat:' + id);
  const st = store(id);
  if (!st.loaded) { renderMsgs(true); await loadLatest(id); } else { renderMsgs(true, true); markRead(); }
  if (!isTouch) setTimeout(() => $('#c-text') && $('#c-text').focus(), 400);
}
async function loadLatest(id) {
  try {
    const r = await call('chat.history', { conv: id });
    const st = store(id);
    const pend = st.list.filter(x => !x.seq);
    st.list = r.msgs.concat(pend); st.more = r.more; st.loaded = true;
    if (cur === id) { renderMsgs(true, true); markRead(); }
  } catch (e) { if (cur === id) toast(e.message); }
}
async function loadOlder() {
  const st = store(cur); if (!st.more || st.loading) return;
  const first = st.list.find(x => x.seq); if (!first) return;
  st.loading = true;
  const body = $('#c-body'); const fromBottom = body.scrollHeight - body.scrollTop;
  try {
    const r = await call('chat.history', { conv: cur, before: first.seq });
    st.list = r.msgs.concat(st.list); st.more = r.more;
    renderMsgs(false); body.scrollTop = body.scrollHeight - fromBottom;
  } catch (e) {} finally { st.loading = false; }
}
function markRead() {
  const c = S.convs[cur]; if (!c || !c.seq) return;
  if (((c.reads || {})[S.me.id] || 0) >= c.seq) return;
  c.reads = c.reads || {}; c.reads[S.me.id] = c.seq;
  fire('chat.read', { conv: cur, seq: c.seq });
  emit('chat-list');
}

function buildScreen() {
  scr.innerHTML = `<div class="nav conv-nav"><div class="nav-row"><button class="back" id="c-back"><i class="fa-solid fa-chevron-left"></i><span id="c-bl"></span></button>
    <div class="who" id="c-who"></div><span style="min-width:70px;display:flex;justify-content:flex-end"><button class="icon-btn" id="c-info" aria-label="Info"><i class="fa-solid fa-circle-info"></i></button></span></div></div>
    <div class="screen-body" id="c-body"><div class="msgs" id="c-msgs"></div></div>
    <div class="composer"><div id="c-reply"></div><div class="bar"><button class="plus" id="c-plus" aria-label="Kirim foto"><i class="fa-solid fa-image"></i></button>
      <div class="input-wrap"><button class="emo-btn" id="c-emo" aria-label="Emoji"><i class="fa-regular fa-face-smile"></i></button><textarea id="c-text" rows="1" placeholder="Pesan" enterkeyhint="${isTouch ? 'enter' : 'send'}"></textarea><button class="send hidden" id="c-send" aria-label="Kirim"><i class="fa-solid fa-arrow-up"></i></button><button class="mic" id="c-mic" aria-label="Rekam suara"><i class="fa-solid fa-microphone"></i></button></div></div><div id="c-rec"></div><div id="c-emojis"></div></div>`;
  renderHead(); renderBackLabel(); renderReply();
  $('#c-back').onclick = () => popScreen();
  $('#c-info').onclick = convInfo;
  const ta = $('#c-text'), send = $('#c-send');
  let lastTyping = 0;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(128, ta.scrollHeight) + 'px'; const has = !!ta.value.trim(); send.classList.toggle('hidden', !has && !editing); $('#c-mic').classList.toggle('hidden', has || !!editing); };
  ta.oninput = () => { grow(); if (Date.now() - lastTyping > 2500 && ta.value.trim()) { lastTyping = Date.now(); fire('typing', { conv: cur }); } };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.isComposing) { e.preventDefault(); sendText(); } };
  ta.onpaste = e => { const f = [...(e.clipboardData && e.clipboardData.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); sendImage(f); } };
  send.onclick = () => { sendText(); if (isTouch) ta.focus(); };
  $('#c-plus').onclick = async () => { const f = await pickFile('image/*'); if (f) sendImage(f); };
  $('#c-mic').onclick = startRecording;
  $('#c-emo').onclick = () => toggleEmojiPanel();
  ta.onfocus = () => { if (isTouch) toggleEmojiPanel(false); };
  const body = $('#c-body');
  body.onscroll = () => { if (body.scrollTop < 80) loadOlder(); if (nearBottom()) markRead(); };
  const msgs = $('#c-msgs');
  // Tekan lama / klik kanan = menu reaksi
  let lpT = null, lpFired = false, sx = 0, sy = 0;
  msgs.addEventListener('pointerdown', e => {
    const b = e.target.closest('.bubble[data-seq]'); if (!b) return;
    lpFired = false; sx = e.clientX; sy = e.clientY;
    lpT = setTimeout(() => { lpFired = true; haptic(15); msgMenu(b); }, 430);
  });
  const cancelLp = e => { if (e && e.type === 'pointermove' && Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return; clearTimeout(lpT); };
  ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(t => msgs.addEventListener(t, cancelLp));
  msgs.addEventListener('contextmenu', e => { const b = e.target.closest('.bubble[data-seq]'); if (b) { e.preventDefault(); clearTimeout(lpT); msgMenu(b); } });
  msgs.addEventListener('click', e => {
    if (lpFired) { lpFired = false; return; }
    const older = e.target.closest('.older'); if (older) return loadOlder();
    const img = e.target.closest('.bubble.img img'); if (img) return viewer(img.dataset.full || img.src);
    const vp = e.target.closest('[data-play]'); if (vp) return playVoice(vp.dataset.play, vp.closest('.bubble'));
    const fail = e.target.closest('.bubble.failed'); if (fail) return retry(fail.dataset.cid);
    const q = e.target.closest('.quote[data-ref]'); if (q) { const t = $(`.bubble[data-seq="${q.dataset.ref}"]`, msgs); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('lift'); setTimeout(() => t.classList.remove('lift'), 600); } return; }
    const b = e.target.closest('.bubble[data-seq]'); if (b && !e.target.closest('a')) { showTimeFor = showTimeFor === +b.dataset.seq ? null : +b.dataset.seq; renderMsgs(false); }
  });
}
function renderHead() {
  const el = $('#c-who'); if (!el || !cur) return;
  if (cur === 'group') {
    const n = Object.keys(S.users).length, on = [...S.online].filter(id => S.users[id]).length;
    el.innerHTML = `${convAvatar('group', 36)}<span class="n">Grup Nexo <i class="fa-solid fa-chevron-right" style="font-size:9px;color:var(--label3)"></i></span><span class="nav-sub" style="font-size:11px">${n} anggota · ${on} online</span>`;
  } else {
    const o = otherOf(cur);
    el.innerHTML = `${avatar(o, 36, { dot: true })}<span class="n">${esc(user(o).name)} <i class="fa-solid fa-chevron-right" style="font-size:9px;color:var(--label3)"></i></span><span class="nav-sub" style="font-size:11px">${esc(lastSeen(o))}</span>`;
  }
  el.onclick = convInfo;
}
function renderBackLabel() {
  const el = $('#c-bl'); if (!el) return;
  const n = Object.values(S.convs).filter(c => c.id !== cur).reduce((s, c) => s + unreadCount(c), 0);
  const under = $('#scr-game').classList.contains('on');
  el.textContent = n ? String(n > 99 ? '99+' : n) : (under ? 'Game' : 'Chat');
}
function renderReply() {
  const el = $('#c-reply'); if (!el) return;
  if (editing) {
    el.innerHTML = `<div class="replying"><i class="fa-solid fa-pen c-blue"></i><div class="q"><b>Mengedit pesan</b><div class="ell muted">${esc(editing.text)}</div></div><button class="icon-btn" id="c-rx"><i class="fa-solid fa-circle-xmark" style="color:var(--label3)"></i></button></div>`;
    $('#c-rx').onclick = () => { editing = null; const ta = $('#c-text'); ta.value = ''; ta.dispatchEvent(new Event('input')); renderReply(); };
    return;
  }
  if (!replyTo) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="replying"><i class="fa-solid fa-reply c-blue"></i><div class="q"><b>${esc(replyTo.from === S.me.id ? 'Kamu' : user(replyTo.from).name)}</b><div class="ell muted">${esc(replyTo.text || '📷 Foto')}</div></div><button class="icon-btn" id="c-rx"><i class="fa-solid fa-circle-xmark" style="color:var(--label3)"></i></button></div>`;
  $('#c-rx').onclick = () => { replyTo = null; renderReply(); };
}
function nearBottom() { const b = $('#c-body'); return b && b.scrollHeight - b.scrollTop - b.clientHeight < 140; }

function renderMsgs(stick, force) {
  const box = $('#c-msgs'); if (!box || !cur) return;
  const wasBottom = force || nearBottom();
  const st = store(cur), c = S.convs[cur] || { reads: {} }, me = S.me.id, isGroup = cur === 'group';
  const list = st.list;
  let h = '';
  if (!st.loaded) h = `<div class="empty"><span class="spin"></span></div>`;
  else if (st.more) h += `<button class="btn sm gray older">Muat pesan lama</button>`;
  else h += `<div class="sys-msg" style="margin:18px 30px 6px">${isGroup ? '👋 Awal obrolan Grup Nexo. Semua teman bisa melihat pesan di sini.' : `Awal obrolanmu dengan ${esc(user(otherOf(cur)).name)}. Hanya kalian berdua yang bisa melihat.`}</div>`;
  let prev = null;
  const lastMineIdx = (() => { for (let i = list.length - 1; i >= 0; i--) if (list[i].from === me && !list[i].sys) return i; return -1; })();
  list.forEach((m, i) => {
    const next = list[i + 1];
    if (!prev || m.ts - prev.ts > 3600000 || dayLabel(m.ts) !== dayLabel(prev.ts)) h += `<div class="day-sep"><b>${esc(dayLabel(m.ts))}</b> ${hm(m.ts)}</div>`;
    if (m.sys || m.from === 'sys') { h += `<div class="sys-msg">${esc(m.text)}</div>`; prev = m; return; }
    const sameAsPrev = prev && prev.from === m.from && !prev.sys && prev.from !== 'sys' && m.ts - prev.ts < 300000;
    const sameAsNext = next && next.from === m.from && !next.sys && next.from !== 'sys' && next.ts - m.ts < 300000 && dayLabel(next.ts) === dayLabel(m.ts);
    const mine = m.from === me;
    const cls = ['mrow', mine ? 'me' : '', !sameAsPrev ? 'first' : '', !sameAsNext ? 'last' : ''].join(' ');
    const emojiOnly = !m.img && !m.del && isEmojiOnly(m.text);
    const bcls = ['bubble', m.img ? 'img' : '', m.voice && !m.del ? 'voice' : '', m.link && !m.img && !m.del ? 'has-link' : '', emojiOnly ? 'emoji-only' : '', !m.seq ? (m.failed ? 'failed' : 'pending') : '', m.del ? 'deleted' : ''].join(' ');
    let inner = '';
    if (m.del) inner = '<i class="fa-solid fa-ban"></i> Pesan dihapus';
    else {
      if (m.reply) inner += `<div class="quote" data-ref="${m.reply.seq}"><b>${esc(m.reply.from === me ? 'Kamu' : user(m.reply.from).name)}</b>${esc(m.reply.text)}</div>`;
      if (m.img) {
        const src = m.img.local || mediaUrl(m.img.id);
        const ratio = m.img.w && m.img.h ? `aspect-ratio:${m.img.w}/${m.img.h};` : '';
        inner += `<img src="${esc(src)}" alt="Foto" style="${ratio}" loading="lazy" decoding="async">`;
        if (m.text) inner += `<div class="cap">${linkify(m.text)}</div>`;
      } else if (m.voice) {
        inner += voiceHtml(m);
      } else if (m.link) {
        const onlyUrl = m.text.trim() === m.link.url;
        if (!onlyUrl) inner += `<div class="txt">${linkify(m.text)}</div>`;
        inner += linkCard(m.link);
      } else inner += linkify(m.text);
    }
    const reacts = Object.entries(m.react || {}).filter(([, l]) => l.length);
    const rp = reacts.length ? `<div class="reacts-pill">${reacts.map(([e]) => e).join('')}${reacts.reduce((n, [, l]) => n + l.length, 0) > 1 ? `<small>${reacts.reduce((n, [, l]) => n + l.length, 0)}</small>` : ''}</div>` : '';
    let meta = '';
    if (!m.seq && m.failed) meta = `<div class="mmeta c-red">Gagal terkirim. Tap untuk coba lagi.</div>`;
    else if (showTimeFor && m.seq === showTimeFor) meta = `<div class="mmeta">${hm(m.ts)}${m.edited ? ' · Diedit' : ''}</div>`;
    else if (m.edited && !m.del) meta = `<div class="mmeta">Diedit</div>`;
    if (mine && i === lastMineIdx && m.seq && i === list.length - 1) {
      const readers = Object.entries(c.reads || {}).filter(([u, s]) => u !== me && s >= m.seq).map(([u]) => u);
      meta = `<div class="mmeta">${isGroup ? (readers.length ? `Dibaca oleh ${readers.length === Object.keys(S.users).length - 1 ? 'semua' : readers.length}` : 'Terkirim') : (readers.length ? 'Dibaca' : 'Terkirim')}</div>`;
    }
    h += `<div class="${cls}">${!mine && isGroup ? avatar(m.from, 28) : ''}<div class="mcol">${!mine && isGroup && !sameAsPrev ? `<div class="mname">${esc(user(m.from).name)}</div>` : ''}
      <div class="${bcls}" data-seq="${m.seq || ''}" ${m.cid ? `data-cid="${esc(m.cid)}"` : ''}>${inner}</div>${rp}${meta}</div></div>`;
    prev = m;
  });
  h += '<div id="c-typing"></div>';
  box.innerHTML = h;
  renderTyping(true);
  if (stick && wasBottom) requestAnimationFrame(() => { const b = $('#c-body'); if (b) b.scrollTop = b.scrollHeight; });
  // Gambar yang selesai dimuat dapat menggeser posisi — tetap di bawah
  if (stick && wasBottom) $$('img', box).forEach(img => { if (!img.complete) img.addEventListener('load', () => { const b = $('#c-body'); if (b && b.scrollHeight - b.scrollTop - b.clientHeight < 400) b.scrollTop = b.scrollHeight; }, { once: true }); });
}
function linkCard(l) {
  let host = ''; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch (e) {}
  return `<a class="lp" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${l.image ? `<img class="lp-img" src="${esc(l.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div class="lp-t"><b>${esc(l.title || host)}</b><span>${esc(l.site && l.site !== host ? l.site + ' · ' + host : host)}</span></div></a>`;
}
function renderTyping(silent) {
  const el = $('#c-typing'); if (!el || !cur) return;
  const t = S.typing[cur] || {}, now = Date.now();
  const who = Object.entries(t).filter(([u, until]) => until > now && u !== S.me.id).map(([u]) => u);
  const was = el.innerHTML !== '';
  el.innerHTML = who.length ? `<div class="sys-msg" style="text-align:left;margin:6px 0 0 36px">${esc(who.map(u => user(u).name).join(', '))} sedang mengetik</div><div class="typing"><span></span><span></span><span></span></div>` : '';
  if (!silent && who.length && !was && nearBottom()) { const b = $('#c-body'); b.scrollTop = b.scrollHeight; }
}

// ---------- Kirim ----------
const newCid = () => Math.random().toString(36).slice(2, 12);
async function sendText() {
  const ta = $('#c-text'); const text = ta.value.trim();
  if (editing) {
    const ed = editing; editing = null; renderReply();
    ta.value = ''; ta.dispatchEvent(new Event('input'));
    if (text && text !== ed.text) call('chat.edit', { conv: cur, seq: ed.seq, text }).catch(e => toast(e.message));
    return;
  }
  if (!text) return;
  ta.value = ''; ta.dispatchEvent(new Event('input'));
  await doSend({ text });
}
async function sendImage(file) {
  let prep;
  try { prep = await compressImage(file); } catch (e) { toast(e.message); return; }
  const local = URL.createObjectURL(prep.blob);
  const caption = ($('#c-text').value || '').trim();
  if (caption) { $('#c-text').value = ''; $('#c-text').dispatchEvent(new Event('input')); }
  await doSend({ text: caption, img: { local, w: prep.w, h: prep.h }, blob: prep.blob });
}
async function doSend(p, existing) {
  const conv = cur, st = store(conv);
  const m = existing || { cid: newCid(), from: S.me.id, text: p.text || '', img: p.img || null, voice: p.voice || null, ts: Date.now() + S.serverSkew, react: {},
    reply: replyTo ? { seq: replyTo.seq, from: replyTo.from, text: replyTo.text || '📷 Foto' } : null, _blob: p.blob, _reply: replyTo ? replyTo.seq : null };
  m.failed = false;
  if (!existing) st.list.push(m);
  replyTo = null; renderReply();
  renderMsgs(true, true);
  try {
    let img = null;
    if (m.img) {
      if (!m.img.id) { const up = await uploadImage(m._blob); m.img.id = up.id; }
      img = { id: m.img.id, w: m.img.w, h: m.img.h };
    }
    let voice = null;
    if (m.voice) {
      if (!m.voice.id) { const up = await uploadImage(m._blob); m.voice.id = up.id; }
      voice = { id: m.voice.id, dur: m.voice.dur, peaks: m.voice.peaks };
    }
    await call('chat.send', { conv, text: m.text, img, voice, reply: m._reply, cid: m.cid });
  } catch (e) {
    m.failed = true; if (cur === conv) renderMsgs(false); toast(e.message);
  }
}
function retry(cid) { const st = store(cur); const m = st.list.find(x => x.cid === cid && !x.seq); if (m) doSend({}, m); }

// ---------- Menu pesan ----------
function msgMenu(b) {
  const seq = +b.dataset.seq; if (!seq) return;
  const m = store(cur).list.find(x => x.seq === seq); if (!m || m.del) return;
  const mine = m.from === S.me.id;
  const myReact = Object.entries(m.react || {}).find(([, l]) => l.includes(S.me.id));
  b.classList.add('lift');
  const html = `<div class="reacts">${REACTS.map(e => `<button data-r="${e}" class="${myReact && myReact[0] === e ? 'on' : ''}">${e}</button>`).join('')}</div>
    <button class="mi" data-a="reply">Balas <i class="fa-solid fa-reply"></i></button>
    ${mine && m.text && !m.voice && Date.now() - m.ts < 24 * 3600000 ? `<button class="mi" data-a="edit">Edit <i class="fa-solid fa-pen"></i></button>` : ''}
    ${m.text ? `<button class="mi" data-a="copy">Salin <i class="fa-regular fa-copy"></i></button>` : ''}
    ${m.img ? `<button class="mi" data-a="view">Lihat foto <i class="fa-regular fa-image"></i></button>` : ''}
    ${Object.keys(m.react || {}).length ? `<button class="mi" data-a="who">Lihat reaksi <i class="fa-regular fa-face-smile"></i></button>` : ''}
    <div class="mi small muted" style="justify-content:flex-start;padding:8px 16px">${dayLabel(m.ts)} ${hm(m.ts)}</div>
    ${mine ? `<button class="mi destructive" data-a="del">Hapus untuk semua <i class="fa-regular fa-trash-can"></i></button>` : ''}`;
  const close = popMenu(b, html, (el, done) => {
    el.onclick = async e => {
      const r = e.target.closest('[data-r]'), a = e.target.closest('[data-a]');
      if (!r && !a) return;
      done(); b.classList.remove('lift');
      if (r) { const remove = myReact && myReact[0] === r.dataset.r; call('chat.react', { conv: cur, seq, emoji: r.dataset.r, remove }).catch(er => toast(er.message)); haptic(10); return; }
      const act = a.dataset.a;
      if (act === 'reply') { replyTo = { seq, from: m.from, text: m.text || (m.img ? '📷 Foto' : '') }; renderReply(); $('#c-text').focus(); }
      if (act === 'edit') { editing = { seq, text: m.text }; replyTo = null; const ta = $('#c-text'); ta.value = m.text; ta.dispatchEvent(new Event('input')); renderReply(); ta.focus(); }
      if (act === 'copy') { try { await navigator.clipboard.writeText(m.text); toast('Disalin', 'fa-copy'); } catch (er) { toast('Gagal menyalin'); } }
      if (act === 'view') viewer(mediaUrl(m.img.id));
      if (act === 'who') sheet({ title: 'Reaksi', body: `<div class="list">${Object.entries(m.react).flatMap(([e, l]) => l.map(u => `<div class="row has-avatar">${avatar(u, 36)}<div class="main"><div class="t">${esc(user(u).name)}</div></div><span style="font-size:24px">${e}</span></div>`)).join('')}</div>` });
      if (act === 'del' && await confirmBox('Hapus pesan ini?', 'Pesan akan dihapus untuk semua orang.', 'Hapus', true)) call('chat.delete', { conv: cur, seq }).catch(er => toast(er.message));
    };
  });
  const obs = new MutationObserver(() => { if (!document.querySelector('.menu-pop')) { b.classList.remove('lift'); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
  return close;
}

function convInfo() {
  if (cur === 'group') {
    const members = Object.values(S.users).sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || a.name.localeCompare(b.name));
    const sh = sheet({ title: 'Grup Nexo', body: `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0 4px">${convAvatar('group', 80)}<div class="b" style="font-size:22px">Grup Nexo</div><div class="muted small">${members.length} anggota</div></div>
      <div class="list" style="margin-top:14px"><button class="row has-icon tap" id="ci-media"><span class="ico bg-blue"><i class="fa-solid fa-photo-film"></i></span><div class="main"><div class="t">Media, Link & Suara</div></div><i class="fa-solid fa-chevron-right chev"></i></button></div>
      <div class="section-h">Anggota</div><div class="list">${members.map(u => `<button class="row has-avatar tap" data-u="${u.id}">${avatar(u, 40, { dot: true })}<div class="main"><div class="t">${esc(u.name)}${u.id === S.me.id ? ' (kamu)' : ''}</div><div class="s">${esc(lastSeen(u.id))}</div></div>${u.id !== S.me.id ? '<i class="fa-solid fa-comment c-blue"></i>' : ''}</button>`).join('')}</div>` });
    sh.body.onclick = e => { if (e.target.closest('#ci-media')) { mediaSheet(cur, 'Grup Nexo'); return; } const b = e.target.closest('[data-u]'); if (!b || b.dataset.u === S.me.id) return; sh.close(); openConv(dmId(S.me.id, b.dataset.u)); };
  } else {
    const o = otherOf(cur), u = user(o), st = u.stats || { played: 0, wins: 0 };
    const sh = sheet({ title: '', body: `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0 4px">${avatar(u, 90, { dot: true })}<div class="b" style="font-size:24px">${esc(u.name)}</div>${u.bio ? `<div class="small" style="text-align:center;max-width:280px">${esc(u.bio)}</div>` : ''}<div class="muted small">${esc(lastSeen(o))}</div></div>
      <div class="list" style="margin-top:16px"><button class="row has-icon tap" id="ci-media"><span class="ico bg-blue"><i class="fa-solid fa-photo-film"></i></span><div class="main"><div class="t">Media, Link & Suara</div></div><i class="fa-solid fa-chevron-right chev"></i></button></div>
      <div class="list" style="margin-top:16px"><div class="row"><div class="main"><div class="t">🏆 Menang</div></div><span class="val">${st.wins}</span></div><div class="row"><div class="main"><div class="t">🎲 Total main</div></div><span class="val">${st.played}</span></div></div>
      <div style="margin-top:16px"><button class="btn block tint" id="ci-play"><i class="fa-solid fa-dice"></i> Ajak main</button></div>` });
    $('#ci-play', sh.body).onclick = () => { sh.close(); emit('create-room', { invite: [o] }); };
    $('#ci-media', sh.body).onclick = () => mediaSheet(cur, u.name);
  }
}

// ================= Voice note =================
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function voiceHtml(m) {
  const peaks = m.voice.peaks && m.voice.peaks.length ? m.voice.peaks : Array.from({ length: 28 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7)));
  const src = m.voice.local || (m.voice.id ? mediaUrl(m.voice.id) : '');
  return `<div class="vn"><button class="vplay" data-play="${esc(src)}" aria-label="Putar"><i class="fa-solid fa-play"></i></button><div class="vbars">${peaks.map(p => `<i style="height:${Math.max(12, Math.round(p * 100))}%"></i>`).join('')}</div><span class="vdur">${fmtDur(m.voice.dur || 0)}</span></div>`;
}
let audioEl = null, playingBubble = null;
function playVoice(src, bubble) {
  if (!src) return;
  if (!audioEl) {
    audioEl = new Audio(); audioEl.preload = 'auto';
    audioEl.ontimeupdate = () => { if (playingBubble && audioEl.duration) playingBubble.style.setProperty('--vp', (audioEl.currentTime / audioEl.duration * 100) + '%'); const d = playingBubble && playingBubble.querySelector('.vdur'); if (d) d.textContent = fmtDur(audioEl.currentTime); };
    audioEl.onended = () => stopVoiceUi();
    audioEl.onerror = () => { stopVoiceUi(); toast('Pesan suara tidak bisa diputar di perangkat ini'); };
  }
  if (playingBubble === bubble && !audioEl.paused) { audioEl.pause(); stopVoiceUi(true); return; }
  stopVoiceUi();
  playingBubble = bubble; bubble.classList.add('playing');
  const ic = bubble.querySelector('.vplay i'); if (ic) ic.className = 'fa-solid fa-pause';
  if (audioEl.src !== new URL(src, location.href).href) audioEl.src = src;
  audioEl.play().catch(() => { stopVoiceUi(); toast('Gagal memutar suara'); });
}
function stopVoiceUi(keep) {
  if (!playingBubble) return;
  const ic = playingBubble.querySelector('.vplay i'); if (ic) ic.className = 'fa-solid fa-play';
  playingBubble.classList.remove('playing');
  if (!keep) { playingBubble.style.removeProperty('--vp'); playingBubble = null; }
}
let rec = null;
async function startRecording() {
  if (rec) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Browser ini belum bisa merekam suara'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { toast('Izinkan akses mikrofon untuk mengirim pesan suara'); return; }
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [], peaks = [];
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = AC ? new AC() : null; let an = null, buf = null;
  if (ac) { const src = ac.createMediaStreamSource(stream); an = ac.createAnalyser(); an.fftSize = 512; buf = new Uint8Array(an.fftSize); src.connect(an); }
  rec = { mr, stream, chunks, peaks, t0: Date.now(), cancel: false, ac };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); if (ac) ac.close().catch(() => {});
    const r = rec; rec = null; clearInterval(r.timer); renderRec();
    if (r.cancel) return;
    const dur = Math.round((Date.now() - r.t0) / 1000);
    if (dur < 1) { toast('Terlalu singkat'); return; }
    const mime = (mr.mimeType || type || 'audio/webm').split(';')[0];
    const blob = new Blob(chunks, { type: mime });
    const n = 32, step = Math.max(1, Math.floor(peaks.length / n));
    const ds = []; for (let i = 0; i < peaks.length && ds.length < n; i += step) ds.push(Math.max(...peaks.slice(i, i + step)));
    const max = Math.max(0.05, ...ds);
    await doSend({ voice: { local: URL.createObjectURL(blob), dur, peaks: ds.map(v => Math.round(v / max * 100) / 100) }, blob });
  };
  mr.start(250);
  rec.timer = setInterval(() => {
    if (an) { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); peaks.push(m / 128); }
    renderRec();
    if (Date.now() - rec.t0 > 5 * 60000) stopRecording(false);
  }, 100);
  haptic(15); renderRec();
}
function stopRecording(cancel) { if (!rec) return; rec.cancel = cancel; try { rec.mr.stop(); } catch (e) {} }
function renderRec() {
  const el = $('#c-rec'); if (!el) return;
  const bar = el.closest('.composer') && el.closest('.composer').querySelector('.bar');
  if (!rec) { el.innerHTML = ''; if (bar) bar.classList.remove('hidden'); return; }
  if (bar) bar.classList.add('hidden');
  const secs = (Date.now() - rec.t0) / 1000;
  const last = rec.peaks.slice(-30);
  el.innerHTML = `<div class="rec-bar"><button class="rec-x" id="rec-x" aria-label="Batal"><i class="fa-solid fa-trash"></i></button><span class="rec-dot"></span><span class="rec-t">${fmtDur(secs)}</span>
    <div class="rec-bars">${last.map(v => `<i style="height:${Math.max(10, Math.min(100, v * 160))}%"></i>`).join('')}</div><button class="send" id="rec-send" aria-label="Kirim"><i class="fa-solid fa-arrow-up"></i></button></div>`;
  $('#rec-x').onclick = () => stopRecording(true);
  $('#rec-send').onclick = () => stopRecording(false);
}

// ================= Emoji picker (gaya iOS) =================
const EMOJI_CATS = [
  ['fa-regular fa-clock', 'Terakhir', null],
  ['fa-regular fa-face-smile', 'Smiley & Orang', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 💪 🫡 🫣 🫠 🙈 🙉 🙊 💋 💌 💘 💝 💖 💗 💓 💞 💕 💟 ❣️ 💔 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💯 💢 💥 💫 💦 💨 💬 💭 💤'],
  ['fa-solid fa-paw', 'Hewan & Alam', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦑 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦒 🐪 🐫 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🕊️ 🐇 🦝 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌸 🌺 🌻 🌹 🌷 🌼 💐 🍄 🌎 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 🌊'],
  ['fa-solid fa-burger', 'Makanan', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥔 🥕 🌽 🌶️ 🥒 🥬 🥦 🧄 🧅 🍞 🥐 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥜 🍯 🥛 ☕ 🍵 🧋 🥤 🍺 🍻 🥂 🍷 🍹 🧉 🧊'],
  ['fa-solid fa-futbol', 'Aktivitas', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥅 🏒 🏏 ⛳ 🏹 🎣 🥊 🥋 🛹 ⛸️ 🎿 🏂 🏋️ 🤸 ⛹️ 🤺 🏊 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🧩'],
  ['fa-solid fa-plane', 'Perjalanan', '🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🛵 🏍️ 🚲 🛴 🚨 🚃 🚄 🚅 🚇 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🛳️ 🚢 ⚓ 🗺️ 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ 🏠 🏡 🏢 🏬 🏨 🏦 🏥 🏫 🕌 🛕 ⛪ 🕋 🌇 🌆 🌃 🌉 🌌 🎆 🎇'],
  ['fa-regular fa-lightbulb', 'Benda', '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 📷 📸 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⌛ 🔋 🔌 💡 🔦 🕯️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🔧 🔨 🛠️ 🔩 ⚙️ 🧲 🔫 💣 🔪 🛡️ 🔮 💊 💉 🧬 🧪 🌡️ 🧹 🧺 🧻 🧼 🛁 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🎁 🎈 🎀 🎊 🎉 🪄 ✉️ 📦 📝 📌 📎 ✂️ 📚 📖 🔒 🔓'],
  ['fa-solid fa-heart', 'Simbol', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 ☮️ ✝️ ☪️ 🕉️ ☯️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⛎ 🆗 🆒 🆕 🆓 🆙 🔝 🔙 ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ♾️ ‼️ ⁉️ ❓ ❔ ❗ ❕ 〰️ 💲 ©️ ®️ ™️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🔶 🔷 🔺 🔻 💠 🔘 🔳 🔲 🏁 🚩'],
  ['fa-regular fa-flag', 'Bendera', '🇮🇩 🇲🇾 🇸🇬 🇹🇭 🇵🇭 🇻🇳 🇯🇵 🇰🇷 🇨🇳 🇭🇰 🇹🇼 🇮🇳 🇸🇦 🇦🇪 🇹🇷 🇪🇬 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇳🇱 🇵🇹 🇺🇸 🇨🇦 🇧🇷 🇦🇷 🇲🇽 🇦🇺 🇳🇿 🇷🇺 🇿🇦 🏳️‍🌈 🏴‍☠️']
];
let emoCat = 1;
function toggleEmojiPanel(force) {
  const el = $('#c-emojis'); if (!el) return;
  const open = force === undefined ? !el.classList.contains('on') : force;
  el.classList.toggle('on', open);
  if (!open) { el.innerHTML = ''; return; }
  const recent = LS.get('nexo.emoRecent', []);
  if (!recent.length && emoCat === 0) emoCat = 1;
  const list = emoCat === 0 ? recent : EMOJI_CATS[emoCat][2].split(' ');
  el.innerHTML = `<div class="emo-panel"><div class="emo-title">${EMOJI_CATS[emoCat][1]}</div><div class="emo-grid">${list.map(e => `<button data-emo="${e}">${e}</button>`).join('') || '<p class="small muted" style="grid-column:1/-1;padding:10px">Belum ada emoji yang dipakai.</p>'}</div>
    <div class="emo-tabs">${EMOJI_CATS.map((c, i) => `<button data-cat="${i}" class="${i === emoCat ? 'on' : ''}" aria-label="${c[1]}"><i class="${c[0]}"></i></button>`).join('')}<button data-bksp aria-label="Hapus"><i class="fa-solid fa-delete-left"></i></button></div></div>`;
  el.onclick = e => {
    const b = e.target.closest('[data-emo]'), c = e.target.closest('[data-cat]');
    const ta = $('#c-text');
    if (c) { emoCat = +c.dataset.cat; toggleEmojiPanel(true); return; }
    if (e.target.closest('[data-bksp]')) { const v = [...ta.value]; v.pop(); ta.value = v.join(''); ta.dispatchEvent(new Event('input')); return; }
    if (!b) return;
    const em = b.dataset.emo, st = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, st) + em + ta.value.slice(en);
    try { ta.selectionStart = ta.selectionEnd = st + em.length; } catch (er) {}
    ta.dispatchEvent(new Event('input'));
    LS.set('nexo.emoRecent', [em, ...LS.get('nexo.emoRecent', []).filter(x => x !== em)].slice(0, 32));
    haptic(5);
  };
  if (isTouch) $('#c-text').blur();
}

// ================= Media, Link & Suara =================
async function mediaSheet(conv, title) {
  const sh = sheet({ title: title || 'Media', tall: true, body: '<div class="empty"><span class="spin"></span></div>' });
  let data;
  try { data = await call('chat.media', { conv }); } catch (e) { sh.body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  let tab = 'media';
  const paint = () => {
    const seg = `<div class="seg" style="margin:4px 0 12px">${[['media', 'Media', data.media.length], ['links', 'Link', data.links.length], ['voice', 'Suara', data.voice.length]].map(([k, t, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${t} (${n})</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'media') body = data.media.length ? `<div class="media-grid">${data.media.map(x => `<button data-img="${esc(x.img.id)}" style="background-image:url('${mediaUrl(x.img.id)}')"></button>`).join('')}</div>` : '<div class="empty"><i class="fa-regular fa-image"></i>Belum ada foto.</div>';
    else if (tab === 'links') body = data.links.length ? `<div class="list">${data.links.map(x => { let host = ''; try { host = new URL(x.url).hostname.replace(/^www\./, ''); } catch (e) {} return `<a class="row has-icon tap link-row" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${x.link && x.link.image ? `<span class="lr-img" style="background-image:url('${esc(x.link.image)}')"></span>` : '<span class="ico bg-gray"><i class="fa-solid fa-link"></i></span>'}<div class="main"><div class="t ell">${esc((x.link && x.link.title) || host)}</div><div class="s ell">${esc(x.url)}</div><div class="s">${esc(user(x.from).name)} · ${dayLabel(x.ts)}</div></div></a>`; }).join('')}</div>` : '<div class="empty"><i class="fa-solid fa-link"></i>Belum ada link.</div>';
    else body = data.voice.length ? `<div class="list">${data.voice.map(x => `<div class="row has-avatar">${avatar(x.from, 34)}<div class="main"><div class="t">${esc(user(x.from).name)}</div><div class="s">${dayLabel(x.ts)} ${hm(x.ts)} · ${fmtDur(x.voice.dur)}</div></div><button class="btn sm tint vplay-row" data-src="${mediaUrl(x.voice.id)}"><i class="fa-solid fa-play"></i></button></div>`).join('')}</div>` : '<div class="empty"><i class="fa-solid fa-microphone"></i>Belum ada pesan suara.</div>';
    sh.body.innerHTML = seg + body + '<div style="height:16px"></div>';
  };
  paint();
  sh.body.onclick = e => {
    const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; paint(); return; }
    const im = e.target.closest('[data-img]'); if (im) return viewer(mediaUrl(im.dataset.img));
    const v = e.target.closest('.vplay-row'); if (v) { const a = new Audio(v.dataset.src); a.play().catch(() => toast('Gagal memutar')); }
  };
}
