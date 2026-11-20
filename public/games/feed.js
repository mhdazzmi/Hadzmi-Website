/* Nexo Games — Beranda: feed postingan, story 24 jam, profil teman */
import { $, $$, esc, S, LS, on, emit, call, avatar, user, hm, dayLabel, toast, sheet, confirmBox, viewer, compressImage, uploadImage,
  pickFile, mediaUrl, linkify, haptic, lastSeen } from './core.js';
import { openConv, dmId } from './chat.js';
import { startCall } from './call.js';

let posts = [], more = true, loaded = false, loading = false, stories = [];
const COLORS = ['#007AFF', '#FF2D55', '#AF52DE', '#34C759', '#FF9500', '#5856D6', '#00C7BE', '#1C1C1E'];
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'baru saja'; if (m < 60) return m + ' mnt'; const h = Math.round(m / 60); if (h < 24) return h + ' jam'; return dayLabel(ts); };

export function initFeed() {
  on('init', () => { loaded = false; refreshStories(); if (isOpen()) loadFeed(true); });
  on('post', ({ post }) => { if (!posts.some(p => p.seq === post.seq)) posts.unshift(post); if (isOpen()) paint(); });
  on('postUpdate', ({ post }) => { const i = posts.findIndex(p => p.seq === post.seq); if (i >= 0) posts[i] = post; if (isOpen()) paintPost(post); emit('post-updated', post); });
  on('postGone', ({ seq }) => { posts = posts.filter(p => p.seq !== seq); if (isOpen()) paint(); });
  on('stories', m => { stories = m.stories || []; if (isOpen()) paintStories(); });
}
const isOpen = () => $('#v-feed') && $('#v-feed').classList.contains('on');
async function refreshStories() { try { stories = (await call('story.list')).stories; if (isOpen()) paintStories(); } catch (e) {} }
async function loadFeed(reset) {
  if (loading) return; loading = true;
  try {
    const r = await call('feed.list', reset || !posts.length ? {} : { before: posts[posts.length - 1].seq });
    posts = reset ? r.posts : posts.concat(r.posts.filter(p => !posts.some(x => x.seq === p.seq)));
    more = r.more; loaded = true;
  } catch (e) { toast(e.message); }
  loading = false; if (isOpen()) paint();
}

export function renderFeed(el) {
  el.innerHTML = `<div class="nav"><div class="nav-row"><span style="min-width:36px"></span><span class="nav-title"></span><button class="icon-btn" id="f-new" aria-label="Posting"><i class="fa-solid fa-square-plus"></i></button></div></div>
  <div class="page"><h1 class="large-title">Beranda</h1>
    <div class="stories" id="f-stories"></div>
    <button class="compose-card" id="f-compose">${avatar(S.me, 40)}<span>Apa kabar, ${esc(S.me.name)}?</span><i class="fa-regular fa-image c-green"></i></button>
    <div id="f-posts"></div></div>`;
  $('#f-new').onclick = newPost; $('#f-compose').onclick = newPost;
  paintStories(); paint();
  if (!loaded) loadFeed(true);
  refreshStories();
}

// ---------- Story ----------
function storyGroups() {
  const by = {};
  stories.forEach(s => (by[s.uid] = by[s.uid] || []).push(s));
  Object.values(by).forEach(l => l.sort((a, b) => a.ts - b.ts));
  const seen = LS.get('nexo.storySeen', {});
  return Object.entries(by).map(([uid, list]) => ({ uid, list, unseen: list.some(s => !seen[s.id] && !s.views.includes(S.me.id)) }))
    .sort((a, b) => (a.uid === S.me.id ? -1 : b.uid === S.me.id ? 1 : 0) || (b.unseen - a.unseen) || (b.list[b.list.length - 1].ts - a.list[a.list.length - 1].ts));
}
function paintStories() {
  const el = $('#f-stories'); if (!el) return;
  const groups = storyGroups(), mine = groups.find(g => g.uid === S.me.id);
  el.innerHTML = `<button class="st-item" data-add>${avatar(S.me, 58)}<span class="st-plus"><i class="fa-solid fa-plus"></i></span><span class="st-n">Story kamu</span></button>
    ${mine ? `<button class="st-item" data-u="${S.me.id}"><span class="st-ring seen">${avatar(S.me, 58)}</span><span class="st-n">Lihat (${mine.list.length})</span></button>` : ''}
    ${groups.filter(g => g.uid !== S.me.id).map(g => `<button class="st-item" data-u="${g.uid}"><span class="st-ring ${g.unseen ? '' : 'seen'}">${avatar(g.uid, 58)}</span><span class="st-n">${esc(user(g.uid).name)}</span></button>`).join('')}`;
  el.onclick = e => { if (e.target.closest('[data-add]')) return newStory(); const b = e.target.closest('[data-u]'); if (b) openStories(b.dataset.u); };
}
async function newStory() {
  const sh = sheet({ title: 'Story Baru', left: 'Batal', right: 'Bagikan' });
  let img = null, bg = COLORS[0];
  const paint_ = () => {
    sh.body.innerHTML = `<div class="story-prev" style="background:${img ? '#000' : bg}">${img ? `<img src="${img.url}">` : ''}<textarea id="sn-t" maxlength="200" placeholder="${img ? 'Tambah teks…' : 'Ketik sesuatu…'}">${esc(($('#sn-t', sh.body) || {}).value || '')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="btn sm tint" id="sn-photo"><i class="fa-solid fa-image"></i> ${img ? 'Ganti foto' : 'Foto'}</button>${img ? '<button class="btn sm gray" id="sn-rm">Hapus foto</button>' : `<div class="color-row" style="flex:1;justify-content:flex-end">${COLORS.map(c => `<button data-c="${c}" style="background:${c}" class="${c === bg ? 'on' : ''}"></button>`).join('')}</div>`}</div>
      <p class="small muted" style="margin-top:10px">Story hilang otomatis setelah 24 jam.</p>`;
  };
  paint_();
  sh.body.onclick = async e => {
    if (e.target.closest('#sn-photo')) { const f = await pickFile(); if (!f) return; const p = await compressImage(f, 1440, .85); img = { blob: p.blob, w: p.w, h: p.h, url: URL.createObjectURL(p.blob) }; paint_(); }
    if (e.target.closest('#sn-rm')) { img = null; paint_(); }
    const c = e.target.closest('[data-c]'); if (c) { bg = c.dataset.c; paint_(); }
  };
  sh.onRight = async () => {
    const text = $('#sn-t', sh.body).value.trim();
    if (!img && !text) return toast('Isi teks atau pilih foto');
    sh.setRight('…', true);
    try {
      let im = null; if (img) { const up = await uploadImage(img.blob); im = { id: up.id, w: img.w, h: img.h }; }
      await call('story.create', { img: im, text, bg }); sh.close(); toast('Story dibagikan ✨');
    } catch (er) { sh.setRight('Bagikan', false); toast(er.message); }
  };
}
function openStories(uid) {
  const groups = storyGroups(); let gi = groups.findIndex(g => g.uid === uid); if (gi < 0) return;
  let si = 0, timer = null, t0 = 0, paused = false, left = 0;
  const el = document.createElement('div'); el.className = 'story-view'; document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { clearTimeout(timer); el.classList.remove('on'); setTimeout(() => el.remove(), 250); paintStories(); };
  const show = () => {
    const g = groups[gi]; if (!g) return close();
    if (si >= g.list.length) { gi++; si = 0; return show(); }
    if (si < 0) { gi--; si = 0; if (gi < 0) { gi = 0; } return show(); }
    const st = g.list[si], mine = st.uid === S.me.id;
    const seen = LS.get('nexo.storySeen', {}); seen[st.id] = Date.now(); LS.set('nexo.storySeen', seen);
    if (!mine) call('story.view', { id: st.id }).catch(() => {});
    el.innerHTML = `<div class="sv-bars">${g.list.map((x, i) => `<i class="${i < si ? 'done' : i === si ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="sv-head">${avatar(st.uid, 34)}<b>${esc(user(st.uid).name)}</b><span>${ago(st.ts)}</span><span style="flex:1"></span>${mine ? '<button data-del><i class="fa-solid fa-trash"></i></button>' : ''}<button data-x><i class="fa-solid fa-xmark"></i></button></div>
      <div class="sv-body" style="background:${st.img ? '#000' : st.bg}">${st.img ? `<img src="${mediaUrl(st.img.id)}">` : ''}${st.text ? `<div class="sv-text ${st.img ? 'cap' : ''}">${esc(st.text)}</div>` : ''}</div>
      <div class="sv-foot">${mine ? `<button data-views><i class="fa-solid fa-eye"></i> ${st.views.length} dilihat</button>` : `<input placeholder="Balas ke ${esc(user(st.uid).name)}…" data-reply><button data-send><i class="fa-solid fa-paper-plane"></i></button>`}</div>`;
    clearTimeout(timer); t0 = Date.now(); left = 5500;
    el.style.setProperty('--dur', left + 'ms');
    timer = setTimeout(() => { si++; show(); }, left);
  };
  const pause = () => { if (paused) return; paused = true; clearTimeout(timer); left -= Date.now() - t0; el.classList.add('paused'); };
  const resume = () => { if (!paused) return; paused = false; t0 = Date.now(); el.classList.remove('paused'); timer = setTimeout(() => { si++; show(); }, Math.max(300, left)); };
  el.onclick = async e => {
    if (e.target.closest('[data-x]')) return close();
    if (e.target.closest('[data-del]')) { const st = groups[gi].list[si]; pause(); if (await confirmBox('Hapus story ini?', '', 'Hapus', true)) { await call('story.delete', { id: st.id }).catch(er => toast(er.message)); return close(); } return resume(); }
    if (e.target.closest('[data-views]')) { const st = groups[gi].list[si]; pause(); sheet({ title: `${st.views.length} dilihat`, body: `<div class="list">${st.views.map(u => `<div class="row has-avatar">${avatar(u, 34)}<div class="main"><div class="t">${esc(user(u).name)}</div></div></div>`).join('') || '<div class="empty">Belum ada yang melihat.</div>'}</div>`, onClose: resume }); return; }
    if (e.target.closest('[data-send]')) { const inp = $('[data-reply]', el), st = groups[gi].list[si]; const txt = inp.value.trim(); if (!txt) return; await call('chat.send', { conv: dmId(S.me.id, st.uid), text: `↩️ Membalas story: ${txt}` }).catch(er => toast(er.message)); inp.value = ''; toast('Balasan terkirim'); resume(); return; }
    if (e.target.closest('.sv-foot') || e.target.closest('.sv-head')) return;
    const x = e.clientX / window.innerWidth;
    if (x < 0.3) { si--; if (si < 0 && gi > 0) { gi--; si = groups[gi].list.length - 1; } else if (si < 0) si = 0; } else si++;
    show();
  };
  el.addEventListener('focusin', e => { if (e.target.matches('[data-reply]')) pause(); });
  el.addEventListener('focusout', e => { if (e.target.matches('[data-reply]')) resume(); });
  let y0 = null;
  el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; if (!e.target.closest('.sv-foot')) pause(); }, { passive: true });
  el.addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 110) close(); else if (!e.target.closest('.sv-foot')) resume(); y0 = null; });
  show();
}

// ---------- Postingan ----------
function postHtml(p) {
  const liked = p.likes.includes(S.me.id), mine = p.uid === S.me.id;
  return `<article class="post" data-seq="${p.seq}"><div class="post-h"><button data-prof="${p.uid}">${avatar(p.uid, 40)}</button><div class="main"><button data-prof="${p.uid}" class="b">${esc(user(p.uid).name)}</button><div class="small muted">${ago(p.ts)}</div></div>${mine || S.me.admin ? '<button class="icon-btn" data-pmenu><i class="fa-solid fa-ellipsis"></i></button>' : ''}</div>
    ${p.text ? `<div class="post-t">${linkify(p.text)}</div>` : ''}
    ${p.img ? `<div class="post-img" data-dbl><img src="${mediaUrl(p.img.id)}" loading="lazy" style="${p.img.w && p.img.h ? `aspect-ratio:${p.img.w}/${p.img.h}` : ''}"><span class="heart-pop">❤️</span></div>` : ''}
    <div class="post-a"><button data-like class="${liked ? 'liked' : ''}"><i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i> ${p.likes.length || ''}</button><button data-cmt><i class="fa-regular fa-comment"></i> ${p.comments.length || ''}</button>
      ${p.likes.length ? `<span class="post-likers">${p.likes.slice(0, 3).map(u => avatar(u, 20)).join('')}</span>` : ''}</div>
    ${p.comments.length ? `<button class="post-c" data-cmt>${p.comments.slice(-2).map(c => `<div><b>${esc(user(c.uid).name)}</b> ${esc(c.text)}</div>`).join('')}${p.comments.length > 2 ? `<div class="muted">Lihat ${p.comments.length} komentar</div>` : ''}</button>` : ''}</article>`;
}
function paint() {
  const el = $('#f-posts'); if (!el) return;
  if (!loaded) { el.innerHTML = '<div class="empty"><span class="spin"></span></div>'; return; }
  el.innerHTML = posts.length ? posts.map(postHtml).join('') + (more ? '<button class="btn sm gray" id="f-more" style="margin:12px auto;display:flex">Muat lagi</button>' : '<p class="small muted" style="text-align:center;padding:16px">Sudah semua 🎉</p>')
    : '<div class="card" style="margin-top:12px"><div class="empty"><i class="fa-regular fa-newspaper"></i>Belum ada postingan. Jadilah yang pertama berbagi cerita!</div></div>';
  bindPosts(el);
}
function paintPost(p) { const a = $(`.post[data-seq="${p.seq}"]`); if (a) { a.outerHTML = postHtml(p); bindPosts($('#f-posts')); } }
let lastTap = 0;
function bindPosts(el) {
  if (!el) return;
  el.onclick = async e => {
    if (e.target.closest('#f-more')) return loadFeed(false);
    const art = e.target.closest('.post'); if (!art) return;
    const seq = +art.dataset.seq, p = posts.find(x => x.seq === seq); if (!p) return;
    const prof = e.target.closest('[data-prof]'); if (prof) return openProfile(prof.dataset.prof);
    if (e.target.closest('[data-like]')) { haptic(10); return call('post.like', { seq }).catch(er => toast(er.message)); }
    if (e.target.closest('[data-cmt]')) return comments(seq);
    if (e.target.closest('[data-pmenu]')) { if (await confirmBox('Hapus postingan ini?', '', 'Hapus', true)) call('post.delete', { seq }).catch(er => toast(er.message)); return; }
    const im = e.target.closest('[data-dbl]');
    if (im) {
      if (Date.now() - lastTap < 320) { if (!p.likes.includes(S.me.id)) call('post.like', { seq }).catch(() => {}); im.classList.remove('pop'); void im.offsetWidth; im.classList.add('pop'); haptic(15); lastTap = 0; }
      else { lastTap = Date.now(); setTimeout(() => { if (lastTap && Date.now() - lastTap >= 300) { lastTap = 0; viewer(mediaUrl(p.img.id)); } }, 330); }
    }
  };
}
function newPost() {
  const sh = sheet({ title: 'Postingan Baru', left: 'Batal', right: 'Posting' });
  let img = null;
  const paint_ = () => {
    const t = ($('#np-t', sh.body) || {}).value || '';
    sh.body.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-start">${avatar(S.me, 40)}<textarea id="np-t" class="np-t" maxlength="2000" placeholder="Apa yang lagi kamu pikirkan?">${esc(t)}</textarea></div>
      ${img ? `<div class="np-img"><img src="${img.url}"><button id="np-rm"><i class="fa-solid fa-xmark"></i></button></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm tint green" id="np-photo"><i class="fa-solid fa-image"></i> Foto</button><button class="btn sm tint" id="np-cam"><i class="fa-solid fa-camera"></i> Kamera</button></div>`;
    setTimeout(() => $('#np-t', sh.body) && $('#np-t', sh.body).focus(), 300);
  };
  paint_();
  sh.body.onclick = async e => {
    const pick = e.target.closest('#np-photo') ? null : e.target.closest('#np-cam') ? 'environment' : undefined;
    if (pick !== undefined) { const f = await pickFile('image/*', pick); if (!f) return; const p = await compressImage(f, 1600, .85); img = { blob: p.blob, w: p.w, h: p.h, url: URL.createObjectURL(p.blob) }; paint_(); }
    if (e.target.closest('#np-rm')) { img = null; paint_(); }
  };
  sh.onRight = async () => {
    const text = $('#np-t', sh.body).value.trim(); if (!text && !img) return toast('Tulis sesuatu atau pilih foto');
    sh.setRight('…', true);
    try { let im = null; if (img) { const up = await uploadImage(img.blob); im = { id: up.id, w: img.w, h: img.h }; } await call('post.create', { text, img: im }); sh.close(); toast('Terposting ✨'); }
    catch (er) { sh.setRight('Posting', false); toast(er.message); }
  };
}
function comments(seq) {
  const p = () => posts.find(x => x.seq === seq);
  const sh = sheet({ title: 'Komentar', tall: true });
  const paint_ = () => {
    const post = p(); if (!post) { sh.close(); return; }
    sh.body.innerHTML = `<div class="cmts">${post.comments.map(c => `<div class="cmt">${avatar(c.uid, 32)}<div class="cmt-b"><b>${esc(user(c.uid).name)}</b> <span>${linkify(c.text)}</span><div class="small muted">${ago(c.ts)}${c.uid === S.me.id || post.uid === S.me.id ? ` · <button class="link small" data-rm="${c.id}" style="font-size:12px;padding:0">Hapus</button>` : ''}</div></div></div>`).join('') || '<div class="empty">Belum ada komentar.</div>'}</div>
      <div class="cmt-in">${avatar(S.me, 30)}<input id="cm-t" placeholder="Tulis komentar…" maxlength="1000"><button class="send" id="cm-s"><i class="fa-solid fa-arrow-up"></i></button></div>`;
    const send = async () => { const i = $('#cm-t', sh.body); const t = i.value.trim(); if (!t) return; i.value = ''; await call('post.comment', { seq, text: t }).catch(er => toast(er.message)); };
    $('#cm-s', sh.body).onclick = send; $('#cm-t', sh.body).onkeydown = e => { if (e.key === 'Enter') send(); };
  };
  paint_();
  sh.body.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) call('post.uncomment', { seq, cid: r.dataset.rm }).catch(er => toast(er.message)); });
  const h = post => { if (post.seq === seq && document.body.contains(sh.el)) { const v = ($('#cm-t', sh.body) || {}).value; paint_(); if (v) $('#cm-t', sh.body).value = v; } };
  on('post-updated', h);
}

// ---------- Profil teman ----------
export async function openProfile(uid) {
  const u = user(uid), st = u.stats || { played: 0, wins: 0 }, me = uid === S.me.id;
  const sh = sheet({ title: '', tall: true, body: `<div class="prof-h">${avatar(u, 92, { dot: true })}<div class="b" style="font-size:24px">${esc(u.name)}</div>${u.bio ? `<div class="small" style="text-align:center;max-width:300px">${esc(u.bio)}</div>` : ''}<div class="small muted">${esc(lastSeen(uid))}</div>
    <div class="prof-stats"><div><b>${st.wins}</b><span>Menang</span></div><div><b>${st.played}</b><span>Main</span></div><div><b id="pf-n">…</b><span>Postingan</span></div></div>
    ${me ? '' : `<div class="prof-acts"><button class="btn md tint" data-a="chat"><i class="fa-solid fa-comment"></i> Pesan</button><button class="btn md tint" data-a="voice"><i class="fa-solid fa-phone"></i></button><button class="btn md tint" data-a="video"><i class="fa-solid fa-video"></i></button><button class="btn md tint" data-a="play"><i class="fa-solid fa-dice"></i></button></div>`}</div>
    <div class="media-grid" id="pf-grid" style="margin-top:14px"></div><div id="pf-txt"></div>` });
  sh.body.onclick = e => {
    const a = e.target.closest('[data-a]');
    if (a) { sh.close(); const k = a.dataset.a; if (k === 'chat') openConv(dmId(S.me.id, uid)); if (k === 'voice') startCall(uid, false); if (k === 'video') startCall(uid, true); if (k === 'play') emit('create-room', { invite: [uid] }); return; }
    const g = e.target.closest('[data-img]'); if (g) viewer(mediaUrl(g.dataset.img));
  };
  try {
    const r = await call('feed.list', { uid });
    $('#pf-n', sh.body).textContent = r.posts.length + (r.more ? '+' : '');
    const withImg = r.posts.filter(p => p.img), txt = r.posts.filter(p => !p.img);
    $('#pf-grid', sh.body).innerHTML = withImg.map(p => `<button data-img="${p.img.id}" style="background-image:url('${mediaUrl(p.img.id)}')"></button>`).join('');
    $('#pf-txt', sh.body).innerHTML = txt.length ? `<div class="section-h">Tulisan</div><div class="list">${txt.map(p => `<div class="row"><div class="main"><div class="t" style="white-space:pre-wrap">${linkify(p.text)}</div><div class="s">${ago(p.ts)} · ❤️ ${p.likes.length} · 💬 ${p.comments.length}</div></div></div>`).join('')}</div>` : (withImg.length ? '' : '<div class="empty">Belum ada postingan.</div>');
  } catch (e) {}
}
