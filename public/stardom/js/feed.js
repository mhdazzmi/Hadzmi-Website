/* STARDOM — home feed, post cards, comments, sharing */
import { api, esc, icon, avatar, uname, richText, timeAgo, fmt, toast, sheet, actionSheet, confirmBox, act, S, go, $, $$, skeleton, empty, haptic, aiBadge, dateLabel } from './core.js';
import { storyTray } from './stories.js';

export const posts = new Map();
const remember = list => { for (const p of list) posts.set(p.id, p); return list; };

// ---------- Media ----------
function ratio(m) {
  if (!m || !m.width || !m.height) return 1;
  return Math.min(1.91, Math.max(0.8, m.width / m.height));
}
export function mediaBlock(p, { reelPreview = true } = {}) {
  const r = ratio(p.media[0]);
  const items = p.media.map((m, i) => m.kind === 'video'
    ? `<div class="pm-i"><video src="${esc(m.url)}" ${m.thumb ? `poster="${esc(m.thumb)}"` : ''} playsinline muted loop preload="metadata" data-autoplay></video><span class="pm-mute">${icon('mute')}</span></div>`
    : `<div class="pm-i"><img src="${esc(m.url)}" alt="" loading="${i ? 'lazy' : 'lazy'}" decoding="async"></div>`).join('');
  const dots = p.media.length > 1 ? `<div class="pm-dots">${p.media.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div><div class="pm-count">1/${p.media.length}</div>` : '';
  const reelTag = p.type === 'reel' && reelPreview ? `<span class="pm-reel">${icon('reels')}</span>` : '';
  return `<div class="pm" style="aspect-ratio:${r}" data-post="${p.id}"><div class="pm-track">${items}</div>${dots}${reelTag}<div class="pm-heart">${icon('heartFill')}</div></div>`;
}

// ---------- Post card ----------
function likesLine(p) {
  if (!p.likes) return '<div class="likes muted">Be the first to like this</div>';
  if (p.preview && p.preview.liked_by && p.likes > 1) return `<div class="likes">Liked by ${uname(p.preview.liked_by, { badge: false })} and <a href="#/likes/${p.id}"><b>${fmt(p.likes - 1)} other${p.likes - 1 === 1 ? '' : 's'}</b></a></div>`;
  return `<div class="likes"><a href="#/likes/${p.id}"><b>${fmt(p.likes)} like${p.likes === 1 ? '' : 's'}</b></a></div>`;
}
function captionHtml(p) {
  if (!p.caption) return '';
  const long = p.caption.length > 140 || p.caption.split('\n').length > 3;
  return `<div class="cap ${long ? 'clamp' : ''}">${uname(p.author, { badge: false })} ${richText(p.caption)}</div>${long ? `<button class="more-btn" data-act="expand">more</button>` : ''}`;
}
export function postCard(p) {
  posts.set(p.id, p);
  const a = p.author;
  const pv = p.preview && p.preview.comments ? p.preview.comments.map(c => `<div class="pv-c">${uname(c.author, { badge: false })} ${richText(c.text.length > 120 ? c.text.slice(0, 120) + '…' : c.text)}</div>`).join('') : '';
  return `<article class="post" id="post-${p.id}" data-id="${p.id}">
    <div class="post-h">
      <a href="#/u/${encodeURIComponent(a.username)}">${avatar(a, 32)}</a>
      <div class="post-hm"><div>${uname(a)}${p.viral ? '<span class="trend">Trending</span>' : ''}</div>${p.location ? `<div class="loc">${esc(p.location)}</div>` : p.audio ? `<div class="loc">♪ ${esc(p.audio)}</div>` : ''}</div>
      <button class="ib" data-act="post-more" aria-label="More">${icon('more')}</button>
    </div>
    ${mediaBlock(p)}
    <div class="post-a">
      <button class="ib like ${p.liked ? 'on' : ''}" data-act="like" aria-label="Like">${icon(p.liked ? 'heartFill' : 'heart')}</button>
      <button class="ib" data-act="comments" aria-label="Comment">${icon('comment')}</button>
      <button class="ib" data-act="share" aria-label="Share">${icon('send')}</button>
      <span class="sp"></span>
      <button class="ib save ${p.saved ? 'on' : ''}" data-act="save" aria-label="Save">${icon(p.saved ? 'bookmarkFill' : 'bookmark')}</button>
    </div>
    <div class="post-b">
      ${likesLine(p)}
      ${captionHtml(p)}
      ${p.comments_off ? '' : p.comments > 2 || (p.comments && !pv) ? `<button class="link-muted" data-act="comments">View all ${fmt(p.comments)} comments</button>` : ''}
      ${pv}
      <div class="ts">${timeAgo(p.created_at, true)}</div>
    </div>
  </article>`;
}
function refreshCard(p) {
  const el = document.getElementById('post-' + p.id);
  if (!el) return;
  el.querySelector('.like').outerHTML = `<button class="ib like ${p.liked ? 'on' : ''}" data-act="like" aria-label="Like">${icon(p.liked ? 'heartFill' : 'heart')}</button>`;
  el.querySelector('.likes').outerHTML = likesLine(p);
  el.querySelector('.save').outerHTML = `<button class="ib save ${p.saved ? 'on' : ''}" data-act="save" aria-label="Save">${icon(p.saved ? 'bookmarkFill' : 'bookmark')}</button>`;
}
const pid = el => el.closest('[data-id]').dataset.id;

async function toggleLike(id, force) {
  const p = posts.get(id); if (!p) return;
  const want = force != null ? force : !p.liked;
  if (want === p.liked) return;
  p.liked = want; p.likes += want ? 1 : -1; refreshCard(p); haptic();
  try { const r = await api(`/posts/${id}/like`, { method: 'POST', body: { like: want } }); p.likes = r.likes; refreshCard(p); }
  catch (e) { p.liked = !want; p.likes += want ? -1 : 1; refreshCard(p); throw e; }
}
act('like', el => toggleLike(pid(el)));
act('save', async el => {
  const p = posts.get(pid(el));
  p.saved = !p.saved; refreshCard(p);
  const r = await api(`/posts/${p.id}/save`, { method: 'POST', body: {} });
  p.saved = r.saved; refreshCard(p);
  if (r.saved) toast('Saved to your collection');
});
act('expand', el => { el.previousElementSibling.classList.remove('clamp'); el.remove(); });
act('comments', el => openComments(pid(el)));
act('share', el => openShare(pid(el)));
act('post-more', async el => {
  const p = posts.get(pid(el));
  const own = p.author.id === S.owner.id;
  const items = own
    ? [{ label: 'Edit', icon: 'edit', value: 'edit' }, { label: p.comments_off ? 'Turn on commenting' : 'Turn off commenting', icon: 'comment', value: 'toggle' }, { label: 'View likes', icon: 'heart', value: 'likes' }, { label: 'Copy link', icon: 'link', value: 'copy' }, { label: 'Delete', icon: 'trash', value: 'delete', danger: true }]
    : [{ label: 'About this account', icon: 'user', value: 'profile' }, { label: p.saved ? 'Remove from saved' : 'Save', icon: 'bookmark', value: 'save' }, { label: 'Send in a message', icon: 'send', value: 'share' }, { label: 'Copy link', icon: 'link', value: 'copy' }, { label: 'Unfollow', icon: 'close', value: 'unfollow', danger: true }];
  const v = await actionSheet(items);
  if (v === 'edit') editPost(p);
  else if (v === 'toggle') { const r = await api(`/posts/${p.id}`, { method: 'PATCH', body: { comments_off: !p.comments_off } }); Object.assign(p, r.post); toast(p.comments_off ? 'Commenting turned off' : 'Commenting turned on'); }
  else if (v === 'likes') go('#/likes/' + p.id);
  else if (v === 'copy') { const link = location.origin + location.pathname + '#/p/' + p.id; try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { toast(link); } }
  else if (v === 'delete') {
    if (!await confirmBox('Delete post?', 'Likes, comments and saves on this post will be removed too.', 'Delete', true)) return;
    await api(`/posts/${p.id}`, { method: 'DELETE' });
    posts.delete(p.id); const card = document.getElementById('post-' + p.id); if (card) card.remove();
    S.owner.posts = Math.max(0, S.owner.posts - 1);
    toast('Post deleted');
    if (location.hash.startsWith('#/p/')) go('#/profile');
  }
  else if (v === 'profile') go('#/u/' + p.author.username);
  else if (v === 'save') actions_save(p);
  else if (v === 'share') openShare(p.id);
  else if (v === 'unfollow') { const r = await api(`/u/${p.author.id}/follow`, { method: 'POST' }); toast(r.following ? `Following ${p.author.username}` : `Unfollowed ${p.author.username}`); }
});
async function actions_save(p) { const r = await api(`/posts/${p.id}/save`, { method: 'POST', body: {} }); p.saved = r.saved; refreshCard(p); toast(r.saved ? 'Saved' : 'Removed from saved'); }

function editPost(p) {
  const s = sheet({ title: 'Edit info', full: true, html: `<div class="form">
    <label class="fl">Caption<textarea id="ep-cap" rows="6" maxlength="2200">${esc(p.caption)}</textarea></label>
    <label class="fl">Location<input id="ep-loc" maxlength="100" value="${esc(p.location)}"></label>
    <button class="btn primary block" id="ep-save">Save</button></div>` });
  s.body.querySelector('#ep-save').onclick = async () => {
    const r = await api(`/posts/${p.id}`, { method: 'PATCH', body: { caption: s.body.querySelector('#ep-cap').value, location: s.body.querySelector('#ep-loc').value } }).catch(e => toast(e.message, 'err'));
    if (!r) return;
    Object.assign(p, r.post); s.close(); toast('Post updated');
    const card = document.getElementById('post-' + p.id); if (card) card.outerHTML = postCard(p);
  };
}

// ---------- Double tap to like, carousel dots, video tap-to-mute ----------
let lastTap = { t: 0, id: null };
document.addEventListener('click', e => {
  const pm = e.target.closest('.pm');
  if (!pm || e.target.closest('[data-act]')) return;
  const id = pm.dataset.post, t = Date.now();
  if (lastTap.id === id && t - lastTap.t < 320) {
    lastTap = { t: 0, id: null };
    const h = pm.querySelector('.pm-heart'); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
    toggleLike(id, true).catch(err => toast(err.message, 'err'));
    return;
  }
  lastTap = { t, id };
  const v = e.target.closest('.pm-i') && e.target.closest('.pm-i').querySelector('video');
  if (v) setTimeout(() => { if (lastTap.t === t) { v.muted = !v.muted; S.unmuted = !v.muted; pm.querySelector('.pm-mute').innerHTML = icon(v.muted ? 'mute' : 'volume'); } }, 330);
});
document.addEventListener('scroll', e => {
  const tr = e.target.classList && e.target.classList.contains('pm-track') ? e.target : null;
  if (!tr) return;
  const i = Math.round(tr.scrollLeft / tr.clientWidth);
  const pm = tr.parentElement;
  $$('.pm-dots i', pm).forEach((d, j) => d.classList.toggle('on', i === j));
  const c = pm.querySelector('.pm-count'); if (c) c.textContent = `${i + 1}/${pm.querySelectorAll('.pm-i').length}`;
}, true);
const vio = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const en of entries) { const v = en.target; if (en.isIntersecting && en.intersectionRatio > 0.6) { v.muted = !S.unmuted; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); } else v.pause(); }
}, { threshold: [0, 0.6] }) : null;
export function watchVideos(root) { if (vio) $$('video[data-autoplay]', root).forEach(v => { if (!v._w) { v._w = 1; vio.observe(v); } }); }

// ---------- Comments ----------
export async function openComments(id) {
  const s = sheet({ title: 'Comments', full: true, cls: 'comments-sheet', html: `<div class="cm-list">${skeleton(2)}</div>
    <div class="cm-reply hidden"><span></span><button class="ib" data-x>${icon('close')}</button></div>
    <form class="cm-in">${avatar(S.owner, 32)}<input placeholder="Add a comment…" maxlength="1000" enterkeyhint="send"><button class="txt-btn" disabled>Post</button></form>` });
  const list = s.body.querySelector('.cm-list'), form = s.body.querySelector('.cm-in'), input = form.querySelector('input'), postBtn = form.querySelector('button');
  const replyBar = s.body.querySelector('.cm-reply');
  let parent = null, data;
  const render = () => {
    const roots = data.comments.filter(c => !c.parent_id), kids = {};
    data.comments.filter(c => c.parent_id).forEach(c => (kids[c.parent_id] = kids[c.parent_id] || []).push(c));
    const own = data.post.author.id === S.owner.id;
    const row = c => `<div class="cm ${c.parent_id ? 'kid' : ''}" data-cid="${c.id}">${avatar(c.author, c.parent_id ? 24 : 32)}
      <div class="cm-b"><div>${uname(c.author)} ${c.by_author ? '<span class="cm-auth">Author</span>' : ''} <span class="cm-t">${richText(c.text)}</span></div>
      <div class="cm-meta"><span>${timeAgo(c.created_at)}</span>${c.likes ? `<span>${fmt(c.likes)} like${c.likes > 1 ? 's' : ''}</span>` : ''}<button data-reply="${c.id}" data-u="${esc(c.author.username)}">Reply</button>${c.author.id === S.owner.id || own ? `<button data-del="${c.id}">Delete</button>` : ''}</div></div>
      <button class="ib cm-like ${c.liked ? 'on' : ''}" data-clike="${c.id}">${icon(c.liked ? 'heartFill' : 'heart', 'sm')}</button></div>`;
    const cap = data.post.caption ? `<div class="cm cap-row">${avatar(data.post.author, 32)}<div class="cm-b"><div>${uname(data.post.author)} <span class="cm-t">${richText(data.post.caption)}</span></div><div class="cm-meta"><span>${timeAgo(data.post.created_at)}</span></div></div></div>` : '';
    list.innerHTML = cap + (roots.length ? roots.map(c => row(c) + ((kids[c.id] || []).length ? `<div class="kids">${kids[c.id].map(row).join('')}</div>` : '')).join('') : empty('comment', 'No comments yet', 'Start the conversation.'));
  };
  const load = async () => { data = await api(`/posts/${id}/comments`); render(); if (data.post.comments_off) { form.classList.add('hidden'); list.insertAdjacentHTML('beforeend', '<div class="note">Commenting is turned off.</div>'); } };
  load().catch(e => { list.innerHTML = empty('comment', 'Could not load comments', e.message); });
  input.oninput = () => { postBtn.disabled = !input.value.trim(); };
  s.body.querySelector('[data-x]').onclick = () => { parent = null; replyBar.classList.add('hidden'); };
  list.addEventListener('click', async e => {
    const r = e.target.closest('[data-reply]'), d = e.target.closest('[data-del]'), l = e.target.closest('[data-clike]');
    if (r) { parent = r.dataset.reply; replyBar.querySelector('span').textContent = 'Replying to ' + r.dataset.u; replyBar.classList.remove('hidden'); input.value = '@' + r.dataset.u + ' '; input.focus(); postBtn.disabled = false; }
    if (d && await confirmBox('Delete comment?', '', 'Delete', true)) { await api(`/comments/${d.dataset.del}`, { method: 'DELETE' }).catch(err => toast(err.message, 'err')); await load(); bumpCount(id, -1); }
    if (l) { const c = data.comments.find(x => x.id === l.dataset.clike); const res = await api(`/comments/${c.id}/like`, { method: 'POST' }); c.liked = res.liked; c.likes = res.likes; render(); haptic(); }
  });
  form.onsubmit = async e => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    postBtn.disabled = true;
    try {
      const r = await api(`/posts/${id}/comments`, { method: 'POST', body: { text, parent_id: parent } });
      data.comments.push(r.comment); render(); input.value = ''; parent = null; replyBar.classList.add('hidden');
      bumpCount(id, 1);
      const el = list.querySelector(`[data-cid="${r.comment.id}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (err) { toast(err.message, 'err'); postBtn.disabled = false; }
  };
}
function bumpCount(id, d) {
  const p = posts.get(id); if (!p) return;
  p.comments = Math.max(0, p.comments + d);
  const card = document.getElementById('post-' + id);
  if (card) { const b = card.querySelector('.link-muted'); if (b) b.textContent = `View all ${fmt(p.comments)} comments`; }
}

// ---------- Share via DM ----------
export async function openShare(id) {
  const s = sheet({ title: 'Share', html: `<input class="search-in" placeholder="Search">${skeleton(1)}` });
  const [conv, fol] = await Promise.all([api('/conversations'), api(`/u/${S.owner.id}/following`)]);
  const people = [], seen = new Set();
  for (const c of conv.conversations) if (!seen.has(c.peer.id)) { seen.add(c.peer.id); people.push(c.peer); }
  for (const a of fol.accounts) if (!seen.has(a.id)) { seen.add(a.id); people.push(a); }
  const chosen = new Set();
  s.body.innerHTML = `<input class="search-in" placeholder="Search">
    <div class="share-grid">${people.map(a => `<button class="share-p" data-id="${a.id}" data-n="${esc((a.username + ' ' + a.display_name).toLowerCase())}">${avatar(a, 56)}<span>${esc(a.display_name)}</span><i class="tick">${icon('check')}</i></button>`).join('') || '<div class="note">Follow someone to share posts with them.</div>'}</div>
    <div class="share-f"><input class="msg-in" placeholder="Write a message…" maxlength="500"><button class="btn primary block" disabled>Send</button>
    <button class="btn block ghost" data-copy>${icon('link')} Copy link</button></div>`;
  const send = s.body.querySelector('.btn.primary');
  s.body.querySelector('.search-in').oninput = e => { const q = e.target.value.toLowerCase(); $$('.share-p', s.body).forEach(b => b.style.display = b.dataset.n.includes(q) ? '' : 'none'); };
  s.body.addEventListener('click', async e => {
    const b = e.target.closest('.share-p');
    if (b) { b.classList.toggle('on'); chosen.has(b.dataset.id) ? chosen.delete(b.dataset.id) : chosen.add(b.dataset.id); send.disabled = !chosen.size; send.textContent = chosen.size > 1 ? `Send separately (${chosen.size})` : 'Send'; }
    if (e.target.closest('[data-copy]')) { const link = location.origin + location.pathname + '#/p/' + id; try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (er) { toast(link); } }
  });
  send.onclick = async () => {
    send.disabled = true;
    const r = await api(`/posts/${id}/share`, { method: 'POST', body: { to: [...chosen], text: s.body.querySelector('.msg-in').value } }).catch(e => toast(e.message, 'err'));
    if (r) { s.close(); toast(`Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`); }
  };
}

// ---------- Home ----------
let home = null;
export function homeView(view) {
  if (home && home.el) {
    view.appendChild(home.el);
    requestAnimationFrame(() => window.scrollTo(0, home.scroll || 0));
    if (Date.now() - home.loadedAt > 5 * 60000) refreshHome(); else storyTray($('.tray', home.el));
    return () => { home.scroll = window.scrollY; home.el.remove(); };
  }
  const el = document.createElement('div');
  el.className = 'home';
  el.innerHTML = `<header class="topbar home-bar"><button class="brand" data-act="feed-mode">Stardom ${icon('down', 'sm')}</button><div class="tb-r">
      <a class="ib" href="#/activity" aria-label="Activity">${icon('heart')}<i class="dot" data-badge="notifications"></i></a>
      <a class="ib" href="#/dm" aria-label="Messages">${icon('send')}<i class="num" data-badge="messages"></i></a></div></header>
    <div class="feed-mode-label hidden"></div>
    <div class="tray"></div>
    <div class="feed">${skeleton(2)}</div>
    <div class="feed-more"></div>`;
  home = { el, mode: 'foryou', cursor: null, loading: false, loadedAt: 0 };
  view.appendChild(el);
  storyTray($('.tray', el));
  loadFeed(true);
  return () => { home.scroll = window.scrollY; el.remove(); };
}
export function refreshHome() { if (!home) return; storyTray($('.tray', home.el)); loadFeed(true); }
export function resetHome() { home = null; }
async function loadFeed(reset) {
  if (!home || home.loading) return;
  if (!reset && !home.cursor) return;
  home.loading = true;
  const feed = $('.feed', home.el), more = $('.feed-more', home.el);
  if (reset) { home.cursor = null; }
  more.innerHTML = reset ? '' : '<div class="spinner"></div>';
  try {
    const r = await api(`/feed?mode=${home.mode}${home.cursor ? '&cursor=' + home.cursor : ''}`);
    remember(r.posts);
    const html = r.posts.map(postCard).join('');
    if (reset) feed.innerHTML = html || empty('home', 'Your feed is quiet', 'Follow some personalities in Explore.', '<a class="btn primary" href="#/explore">Explore</a>');
    else feed.insertAdjacentHTML('beforeend', html);
    home.cursor = r.cursor; home.loadedAt = Date.now();
    more.innerHTML = r.cursor ? '' : (r.posts.length || !reset ? `<div class="caught">${icon('check')}<b>You're all caught up</b><span>You've seen the ${home.mode === 'foryou' ? 'top' : 'latest'} posts.</span></div>` : '');
    watchVideos(feed);
  } catch (e) { if (reset) feed.innerHTML = empty('home', 'Could not load your feed', e.message); more.innerHTML = ''; }
  home.loading = false;
}
window.addEventListener('scroll', () => {
  if (home && home.el.isConnected && window.innerHeight + window.scrollY > document.body.scrollHeight - 1200) loadFeed(false);
}, { passive: true });
act('feed-mode', async () => {
  const v = await actionSheet([{ label: 'For You', icon: 'sparkle', value: 'foryou' }, { label: 'Following', icon: 'users', value: 'following' }, { label: 'Latest', icon: 'archive', value: 'latest' }]);
  if (!v || !home) return;
  home.mode = v;
  const l = $('.feed-mode-label', home.el);
  l.textContent = { foryou: '', following: 'Following', latest: 'Latest from everyone' }[v];
  l.classList.toggle('hidden', v === 'foryou');
  window.scrollTo(0, 0);
  $('.feed', home.el).innerHTML = skeleton(2);
  loadFeed(true);
});

// ---------- Single post & likes ----------
export async function postView(view, [id]) {
  view.innerHTML = `<header class="topbar"><button class="ib" data-act="back">${icon('back')}</button><div class="tb-title">Post</div><div class="tb-r"></div></header><div class="feed single">${skeleton(1)}</div>`;
  try { const r = await api('/posts/' + id); $('.feed', view).innerHTML = postCard(r.post); watchVideos(view); }
  catch (e) { $('.feed', view).innerHTML = empty('image', 'Post not available', e.message); }
}
export async function likesView(view, [id]) {
  view.innerHTML = `<header class="topbar"><button class="ib" data-act="back">${icon('back')}</button><div class="tb-title">Likes</div><div class="tb-r"></div></header><div class="ulist">${skeleton(3)}</div>`;
  const { accountList } = await import('./profile.js');
  accountList($('.ulist', view), `/posts/${id}/likers`);
}
