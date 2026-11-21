/* STARDOM — Activity center (notifications) */
import { api, esc, icon, avatar, uname, fmt, timeAgo, S, $, $$, topbar, skeleton, empty, setBadge, go, act, confirmBox, toast } from './core.js';

const FILTERS = [['', 'All'], ['likes', 'Likes'], ['comments', 'Comments'], ['follows', 'Follows'], ['stories', 'Stories'], ['messages', 'Messages'], ['system', 'Updates']];

function line(n) {
  const u = n.actor ? uname(n.actor) : '';
  const others = n.count > 1 ? ` and <b>${fmt(n.count - 1)} other${n.count > 2 ? 's' : ''}</b>` : '';
  const q = n.text ? ` <span class="nq">${esc(n.text.length > 90 ? n.text.slice(0, 90) + '…' : n.text)}</span>` : '';
  switch (n.type) {
    case 'like': return `${u}${others} liked your post.`;
    case 'comment': return `${u} commented:${q}`;
    case 'reply': return `${u} replied to your comment:${q}`;
    case 'comment_like': return `${u} liked your comment:${q}`;
    case 'follow': return `${u}${others} started following you.`;
    case 'follow_back': return `${u} followed you back.`;
    case 'mention': return `${u} mentioned you in a comment:${q}`;
    case 'story_like': return `${u}${others} liked your story.`;
    case 'story_reply': return `${u} replied to your story:${q}`;
    case 'story_view': return `${icon('users', 'sm')} ${esc(n.text)}`;
    case 'dm': return `${u} sent you a message:${q}`;
    case 'recommendation': return `${u ? u + ' · ' : ''}${esc(n.text || 'New personalities you might like')}`;
    case 'bot': return `${u} ${esc(n.text)}`;
    case 'milestone': return `<b>STARDOM</b> ${esc(n.text)}`;
    default: return esc(n.text);
  }
}
function bucket(t) { const d = (Date.now() - t) / 86400000; return d < 1 ? 'Today' : d < 7 ? 'This week' : d < 30 ? 'This month' : 'Earlier'; }

export function activityView(view, params, query) {
  let filter = query.get('f') || '', cursor = null;
  view.innerHTML = topbar({ title: 'Activity', right: `<button class="txt-btn" data-clear>Clear</button>` }) + `<div class="chips sticky">${FILTERS.map(([k, l]) => `<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div><div class="nlist">${skeleton(3)}</div><div class="ul-more"></div>`;
  const list = $('.nlist', view);
  async function load(reset) {
    const r = await api(`/notifications?type=${filter}${!reset && cursor ? '&before=' + cursor : ''}`).catch(e => ({ notifications: [], error: e.message }));
    let html = '', last = reset ? null : list.dataset.last;
    for (const n of r.notifications) {
      const b = bucket(n.created_at);
      if (b !== last) { html += `<div class="sec-h pad">${b}</div>`; last = b; }
      const right = n.thumb ? `<img class="n-th" src="${esc(n.thumb)}" alt="">`
        : (n.type === 'follow' || n.type === 'follow_back') && n.actor && n.count === 1 ? `<button class="btn sm ${n.following ? '' : 'primary'}" data-act="follow" data-id="${n.actor.id}">${n.following ? 'Following' : 'Follow back'}</button>` : '';
      html += `<div class="nrow ${n.read ? '' : 'unread'}" data-n='${esc(JSON.stringify({ t: n.type, p: n.post_id, s: n.story_id, a: n.actor && n.actor.id, u: n.actor && n.actor.username }))}'>
        ${n.actor ? avatar(n.actor, 44) : `<span class="n-ic">${icon(n.type === 'story_view' ? 'users' : 'star')}</span>`}
        <div class="n-m">${line(n)} <span class="n-t">${timeAgo(n.created_at)}</span></div>${right}</div>`;
    }
    list.dataset.last = last || '';
    if (reset) list.innerHTML = html || empty('heart', 'No activity yet', 'When your audience likes, comments or follows, you\'ll see it here.');
    else list.insertAdjacentHTML('beforeend', html);
    cursor = r.cursor;
    $('.ul-more', view).innerHTML = cursor ? '<button class="btn block ghost">Load more</button>' : '';
    if (reset) { const c = await api('/notifications/read', { method: 'POST', body: {} }).catch(() => null); if (c) { S.counts = c.counts; setBadge(); } }
  }
  view.addEventListener('click', async e => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; $$('.chip', view).forEach(c => c.classList.toggle('on', c === f)); list.innerHTML = skeleton(3); return load(true); }
    if (e.target.closest('.ul-more button')) return load(false);
    if (e.target.closest('[data-clear]')) { if (await confirmBox('Clear all notifications?', '', 'Clear', true)) { await api('/notifications/clear', { method: 'POST', body: {} }); load(true); } return; }
    if (e.target.closest('[data-act], a')) return;
    const row = e.target.closest('.nrow'); if (!row) return;
    const d = JSON.parse(row.dataset.n);
    if (d.t === 'dm' || d.t === 'story_reply') { const r = await api('/conversations', { method: 'POST', body: { peer_id: d.a } }).catch(er => { toast(er.message, 'err'); return null; }); if (r) go('#/dm/' + r.id); }
    else if (d.p) go('#/p/' + d.p);
    else if (d.t === 'recommendation') go('#/directory');
    else if (d.t === 'story_view' || d.t === 'story_like') go('#/profile');
    else if (d.u) go('#/u/' + encodeURIComponent(d.u));
  });
  load(true);
}
