/* STARDOM — profiles (owner & virtual), follow lists, edit profile, saved, archive */
import { api, esc, icon, avatar, uname, richText, fmt, toast, act, S, go, $, $$, topbar, skeleton, empty, actionSheet, confirmBox, aiBadge, verifiedBadge, activeLabel, upload, sheet, dateLabel } from './core.js';
import { openStories } from './stories.js';
import { posts as postCache } from './feed.js';
import { processImage } from './create.js';

export function gridHtml(list, { reels = false } = {}) {
  for (const p of list) postCache.set(p.id, p);
  return list.map(p => {
    const m = p.media[0] || {};
    const src = m.thumb || (m.kind === 'image' ? m.url : '');
    const badge = p.media.length > 1 ? `<span class="g-b">${icon('grid', 'sm')}</span>` : p.type === 'reel' || m.kind === 'video' ? `<span class="g-b">${icon('reels', 'sm')}</span>` : '';
    return `<a class="g-i ${reels ? 'tall' : ''}" href="#/p/${p.id}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<video src="${esc(m.url)}" muted preload="metadata"></video>`}${badge}${reels ? `<span class="g-v">${icon('play', 'sm')} ${fmt(p.views)}</span>` : `<span class="g-h"><b>${icon('heartFill', 'sm')} ${fmt(p.likes)}</b><b>${icon('comment', 'sm')} ${fmt(p.comments)}</b></span>`}</a>`;
  }).join('');
}

export function profileView(view, [ref]) {
  const own = !ref || ref === S.owner.username || ref === S.owner.id;
  const key = own ? S.owner.id : ref;
  view.innerHTML = topbar({ title: own ? `${icon('lock', 'sm')} ${esc(S.owner.username)}` : esc(ref), back: !own, left: '', right: own ? `<a class="ib" href="#/create" aria-label="Create">${icon('plus')}</a><a class="ib" href="#/settings" aria-label="Menu">${icon('menu')}</a>` : `<button class="ib" data-act="prof-more" aria-label="More">${icon('more')}</button>` }) + `<div class="prof">${skeleton(1)}</div>`;
  load();
  async function load() {
    let r;
    try { r = await api('/u/' + encodeURIComponent(key)); } catch (e) { $('.prof', view).innerHTML = empty('user', 'Account not found', e.message); return; }
    const a = r.account;
    if (own) S.owner = Object.assign(S.owner, a);
    view.dataset.acc = a.id; view.dataset.username = a.username;
    const hl = await api(`/u/${a.id}/highlights`).catch(() => ({ highlights: [] }));
    const ring = a.has_story ? (a.story_seen ? 'seen' : 'new') : null;
    const meta = a.virtual ? [a.occupation, [a.city, a.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : '';
    $('.prof', view).innerHTML = `
      <div class="prof-top">
        <button class="prof-av" data-act="${a.has_story ? 'prof-story' : own ? 'edit-avatar' : 'noop'}">${avatar(a, 86, { ring })}${own && !a.has_story ? '' : ''}</button>
        <div class="prof-stats">
          <a href="#/u/${encodeURIComponent(a.username)}" data-act="noop"><b>${fmt(a.posts)}</b><span>posts</span></a>
          <a href="#/u/${encodeURIComponent(a.username)}/followers"><b>${fmt(a.followers)}</b><span>followers</span></a>
          <a href="#/u/${encodeURIComponent(a.username)}/following"><b>${fmt(a.following)}</b><span>following</span></a>
        </div>
      </div>
      <div class="prof-info">
        <div class="prof-name">${esc(a.display_name)} ${a.verified ? verifiedBadge() : ''}</div>
        ${a.virtual ? `<div class="prof-cat">${aiBadge(true)} ${esc(meta)}</div>` : ''}
        ${a.bio ? `<div class="prof-bio">${richText(a.bio)}</div>` : ''}
        ${a.website ? `<a class="prof-link" href="${esc(a.website)}" target="_blank" rel="noopener noreferrer">${icon('link', 'sm')} ${esc(a.website.replace(/^https?:\/\//, ''))}</a>` : ''}
        ${a.virtual && a.mutual_count ? `<a class="mutuals" href="#/u/${encodeURIComponent(a.username)}/mutuals"><span class="stack">${a.mutuals.map(m => avatar(m, 20)).join('')}</span>Followed by <b>${esc(a.mutuals[0].username)}</b>${a.mutual_count > 1 ? ` and <b>${fmt(a.mutual_count - 1)} other${a.mutual_count > 2 ? 's' : ''}</b>` : ''}</a>` : ''}
        ${a.virtual ? `<div class="persona-note">${icon('sparkle', 'sm')}<span>Simulated AI persona inside your STARDOM universe. Not a real person, and messages are AI-generated. ${a.follows_you ? '<b>Follows you.</b>' : ''} <span class="muted">${esc(activeLabel(a.last_active))}${a.relationship && a.relationship !== 'none' ? ' · ' + esc(a.relationship.replace('_', ' ')) : ''}</span></span></div>` : ''}
      </div>
      <div class="prof-btns">${own
        ? `<a class="btn" href="#/edit">Edit profile</a><button class="btn" data-act="share-profile">Share profile</button><a class="btn" href="#/insights">Insights</a>`
        : `<button class="btn ${a.is_following ? '' : 'primary'}" data-act="follow" data-id="${a.id}">${a.is_following ? 'Following' : a.follows_you ? 'Follow back' : 'Follow'}</button><button class="btn" data-act="message" data-id="${a.id}">Message</button>`}</div>
      ${hl.highlights.length || own ? `<div class="hls">${own ? `<a class="hl" href="#/archive"><span class="hl-c add">+</span><span>New</span></a>` : ''}${hl.highlights.map((h, i) => `<button class="hl" data-act="hl-open" data-i="${i}"><span class="hl-c">${h.stories[0].media ? `<img src="${esc(h.stories[0].media.thumb || h.stories[0].media.url)}" alt="">` : `<span class="hl-t" style="background:${esc(h.stories[0].bg)}">Aa</span>`}</span><span>${esc(h.name)}</span></button>`).join('')}</div>` : ''}
      <div class="tabs" role="tablist"><button class="on" data-tab="posts" aria-label="Posts">${icon('grid')}</button><button data-tab="reels" aria-label="Reels">${icon('reels')}</button><button data-tab="tagged" aria-label="Tagged">${icon('tag')}</button></div>
      <div class="grid"></div>`;
    view._hl = hl.highlights;
    loadTab('posts');
  }
  async function loadTab(tab) {
    $$('.tabs button', view).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const g = $('.grid', view);
    g.className = 'grid' + (tab === 'reels' ? ' reels' : '');
    g.innerHTML = '<div class="spinner"></div>';
    const r = await api(`/u/${view.dataset.acc}/posts?tab=${tab}`).catch(() => ({ posts: [] }));
    g.innerHTML = r.posts.length ? gridHtml(r.posts, { reels: tab === 'reels' })
      : tab === 'posts' ? (own ? empty('camera', 'Share your first photo', 'When you share photos and videos, they\'ll appear on your profile.', '<a class="btn primary" href="#/create">Create post</a>') : empty('camera', 'No posts yet'))
      : tab === 'reels' ? empty('reels', 'No reels yet') : empty('tag', 'No tagged posts', 'Posts where this account is @mentioned in the comments appear here.');
  }
  view.addEventListener('click', e => { const t = e.target.closest('.tabs button'); if (t) loadTab(t.dataset.tab); });
}
act('noop', () => {});
act('prof-story', () => { const v = $('#view [data-acc]') || $('#view'); openStories(v.dataset.acc, { single: true }); });
act('hl-open', el => { const v = el.closest('[data-acc]'); const h = v._hl[+el.dataset.i]; openStories(v.dataset.acc, { stories: h.stories, title: h.name }); });
act('follow', async el => {
  const r = await api(`/u/${el.dataset.id}/follow`, { method: 'POST' });
  el.classList.toggle('primary', !r.following);
  el.textContent = r.following ? 'Following' : r.account.follows_you ? 'Follow back' : 'Follow';
  const v = el.closest('#view'); const fl = v && $(`a[href$="/followers"] b`, v); if (fl) fl.textContent = fmt(r.account.followers);
  S.owner.following += r.following ? 1 : -1;
});
act('message', async el => { const r = await api('/conversations', { method: 'POST', body: { peer_id: el.dataset.id } }); go('#/dm/' + r.id); });
act('share-profile', async () => {
  const link = location.origin + location.pathname + '#/u/' + S.owner.username;
  if (navigator.share) { try { await navigator.share({ title: 'STARDOM', text: `@${S.owner.username} on STARDOM (private)`, url: link }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(link); toast('Profile link copied. It opens only for you, the owner.'); } catch (e) { toast(link); }
});
act('prof-more', async () => {
  const v = $('#view .prof') && $('#view').querySelector('[data-acc]') || $('#view');
  const id = v.dataset.acc, uname_ = v.dataset.username;
  const choice = await actionSheet([{ label: 'View mutual followers', icon: 'users', value: 'mut' }, { label: 'Manage in Control Center', icon: 'sliders', value: 'admin' }, { label: 'Copy profile link', icon: 'link', value: 'copy' }, { label: 'Deactivate account', icon: 'pause', value: 'inactive' }, { label: 'Block', icon: 'close', value: 'blocked', danger: true }]);
  if (choice === 'mut') go(`#/u/${uname_}/mutuals`);
  if (choice === 'admin') go('#/control/account/' + id);
  if (choice === 'copy') { try { await navigator.clipboard.writeText(location.origin + location.pathname + '#/u/' + uname_); toast('Link copied'); } catch (e) {} }
  if (choice === 'inactive' || choice === 'blocked') {
    if (!await confirmBox(choice === 'blocked' ? `Block ${uname_}?` : `Deactivate ${uname_}?`, choice === 'blocked' ? 'They will stop interacting with you and disappear from your feed. You can undo this in Control Center.' : 'The character pauses all activity until you reactivate it in Control Center.', choice === 'blocked' ? 'Block' : 'Deactivate', true)) return;
    await api('/admin/accounts/' + id, { method: 'PATCH', body: { status: choice } });
    toast(choice === 'blocked' ? 'Blocked' : 'Deactivated');
    go('#/');
  }
});

// ---------- Account lists ----------
export async function accountList(el, endpoint, { search = false } = {}) {
  let offset = 0, q = '', loading = false;
  el.innerHTML = `${search ? `<input class="search-in" placeholder="Search">` : ''}<div class="ul-rows"></div><div class="ul-more"></div>`;
  const rows = $('.ul-rows', el), more = $('.ul-more', el);
  const row = a => `<div class="urow">${avatar(a, 44)}<a class="urow-m" href="#/u/${encodeURIComponent(a.username)}">${uname(a, { link: false })}<span>${esc(a.display_name)}${a.occupation ? ' · ' + esc(a.occupation) : ''}</span></a>${a.is_owner ? '' : `<button class="btn sm ${a.is_following ? '' : 'primary'}" data-act="follow" data-id="${a.id}">${a.is_following ? 'Following' : 'Follow'}</button>`}</div>`;
  async function page(reset) {
    if (loading) return; loading = true;
    if (reset) { offset = 0; rows.innerHTML = skeleton(2); }
    const r = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}offset=${offset}${q ? '&q=' + encodeURIComponent(q) : ''}`).catch(e => ({ accounts: [], error: e.message }));
    if (reset) rows.innerHTML = '';
    rows.insertAdjacentHTML('beforeend', r.accounts.map(row).join(''));
    if (reset && !r.accounts.length) rows.innerHTML = `<div class="note">${esc(r.error || 'No one here yet.')}</div>`;
    offset = r.next; more.innerHTML = r.next ? '<button class="btn block ghost">Load more</button>' : '';
    loading = false;
  }
  more.onclick = () => page(false);
  if (search) { let t; $('.search-in', el).oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); page(true); }, 250); }; }
  page(true);
}
export function followsView(view, [username, kind]) {
  const titles = { followers: 'Followers', following: 'Following', mutuals: 'Mutual followers' };
  view.innerHTML = topbar({ title: `${esc(username)}`, back: true }) + `<div class="seg"><a href="#/u/${encodeURIComponent(username)}/followers" class="${kind === 'followers' ? 'on' : ''}">Followers</a><a href="#/u/${encodeURIComponent(username)}/following" class="${kind === 'following' ? 'on' : ''}">Following</a></div><div class="ulist"></div>`;
  accountList($('.ulist', view), `/u/${encodeURIComponent(username)}/${kind}`, { search: kind !== 'mutuals' });
  if (kind === 'mutuals') $('.seg', view).outerHTML = `<div class="sec-h pad">${titles[kind]}</div>`;
}

// ---------- Edit profile ----------
export function editView(view) {
  const o = S.owner;
  view.innerHTML = topbar({ title: 'Edit profile', back: true, right: '<button class="txt-btn" id="ed-save">Done</button>' }) + `
    <div class="edit">
      <div class="edit-av"><button data-pick-av>${avatar(o, 86)}</button><button class="txt-btn" data-pick-av>Change profile picture</button><input type="file" accept="image/*" hidden id="ed-file"></div>
      <div class="form">
        <label class="fl">Name<input id="ed-name" maxlength="40" value="${esc(o.display_name)}"></label>
        <label class="fl">Username<input id="ed-user" maxlength="30" value="${esc(o.username)}" autocapitalize="off"></label>
        <label class="fl">Bio<textarea id="ed-bio" rows="3" maxlength="300">${esc(o.bio)}</textarea></label>
        <label class="fl">Website<input id="ed-web" maxlength="200" value="${esc(o.website)}" inputmode="url" autocapitalize="off" placeholder="https://"></label>
        <label class="fl">City<input id="ed-city" maxlength="60" value="${esc(o.city || '')}"></label>
        <label class="fl">Country<input id="ed-country" maxlength="60" value="${esc(o.country || '')}"></label>
        <label class="fl">Interests (comma separated, used for your For You feed)<input id="ed-int" maxlength="300" value="${esc((o.interests || []).join(', '))}" placeholder="travel, music, food"></label>
        <label class="tg"><span>Private account<small>Visual only: STARDOM is always private to you.</small></span><input type="checkbox" id="ed-priv" ${o.is_private ? 'checked' : ''}><i></i></label>
      </div>
    </div>`;
  let newAvatar = null;
  const file = $('#ed-file', view);
  view.addEventListener('click', e => { if (e.target.closest('[data-pick-av]')) file.click(); });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const img = await processImage(f);
      $('.edit-av .av', view).outerHTML = `<span class="av" style="--s:86px"><img src="${img.preview}" alt=""></span>`;
      newAvatar = (await upload(img.thumbBlob)).url;
    } catch (er) { toast(er.message, 'err'); }
  };
  $('#ed-save', view).onclick = async () => {
    try {
      const r = await api('/me', { method: 'PATCH', body: { display_name: $('#ed-name', view).value, username: $('#ed-user', view).value, bio: $('#ed-bio', view).value, website: $('#ed-web', view).value, city: $('#ed-city', view).value, country: $('#ed-country', view).value, is_private: $('#ed-priv', view).checked, interests: $('#ed-int', view).value.split(',').map(s => s.trim()).filter(Boolean), ...(newAvatar ? { avatar: newAvatar } : {}) } });
      Object.assign(S.owner, r.owner, { interests: $('#ed-int', view).value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) });
      toast('Profile saved'); go('#/profile');
    } catch (er) { toast(er.message, 'err'); }
  };
}
act('edit-avatar', () => go('#/edit'));

// ---------- Saved ----------
export async function savedView(view, params, query) {
  const col = query.get('c');
  view.innerHTML = topbar({ title: 'Saved', back: true, right: '<button class="ib" data-new-col aria-label="New collection">' + icon('plus') + '</button>' }) + '<div class="cols"></div><div class="grid"></div>';
  const c = await api('/collections');
  const colEl = $('.cols', view);
  colEl.innerHTML = `<a class="col ${col ? '' : 'on'}" href="#/saved">${c.all.cover ? `<img src="${esc(c.all.cover)}" alt="">` : '<span></span>'}<b>All posts</b><small>${c.all.n}</small></a>` + c.collections.map(x => `<a class="col ${col === x.id ? 'on' : ''}" href="#/saved?c=${x.id}">${x.cover ? `<img src="${esc(x.cover)}" alt="">` : '<span></span>'}<b>${esc(x.name)}</b><small>${x.count}</small></a>`).join('');
  const r = await api('/saved' + (col ? '?collection=' + col : ''));
  $('.grid', view).innerHTML = r.posts.length ? gridHtml(r.posts) : empty('bookmark', 'Nothing saved yet', 'Tap the bookmark on any post to save it here.');
  if (col) $('.grid', view).insertAdjacentHTML('afterend', `<button class="btn block ghost danger-t" data-del-col>Delete collection</button>`);
  view.addEventListener('click', async e => {
    if (e.target.closest('[data-new-col]')) { const name = prompt('Collection name'); if (name) { await api('/collections', { method: 'POST', body: { name } }); savedView(view, params, query); } }
    if (e.target.closest('[data-del-col]') && await confirmBox('Delete collection?', 'Posts stay in All posts.', 'Delete', true)) { await api('/collections/' + col, { method: 'DELETE' }); go('#/saved'); }
  });
  // long-press-free "move to collection": tap-and-hold alternative via context menu
  view.addEventListener('contextmenu', async e => {
    const g = e.target.closest('.g-i'); if (!g || !c.collections.length) return;
    e.preventDefault();
    const id = g.getAttribute('href').split('/').pop();
    const v = await actionSheet(c.collections.map(x => ({ label: 'Move to ' + x.name, value: x.id })));
    if (v) { await api(`/posts/${id}/save`, { method: 'POST', body: { save: true, collection_id: v } }); toast('Moved'); }
  });
}

// ---------- Story archive (create highlights) ----------
export async function archiveView(view) {
  view.innerHTML = topbar({ title: 'Story archive', back: true }) + '<div class="note pad">Tap a story to watch it. Use the star in the viewer to add it to a highlight on your profile.</div><div class="grid reels arch"></div>';
  const r = await api('/stories/archive');
  const g = $('.grid', view);
  g.innerHTML = r.stories.length ? r.stories.map((s, i) => `<button class="g-i tall" data-i="${i}">${s.media ? `<img src="${esc(s.media.thumb || s.media.url)}" alt="">` : `<span class="arch-t" style="background:${esc(s.bg)}">${esc(s.text)}</span>`}<span class="g-d">${new Date(s.created_at).getDate()}<small>${new Date(s.created_at).toLocaleString('en', { month: 'short' })}</small></span>${s.highlight ? `<span class="g-b">${icon('star', 'sm')}</span>` : ''}</button>`).join('') : empty('archive', 'No stories yet', 'Stories you share are kept here privately after they expire.');
  g.onclick = e => { const b = e.target.closest('[data-i]'); if (b) openStories(S.owner.id, { stories: [r.stories[+b.dataset.i]], title: dateLabel(r.stories[+b.dataset.i].created_at) }); };
}
