/* STARDOM — app shell: lock screen, navigation, routing, real-time sync */
import { closeAllSheets, api, initAuth, signIn, signOut, S, $, $$, esc, icon, avatar, route, matchRoute, setBadge, go, topbar, toast, PIN_LEN, act, empty, aiBadge, DEV } from './core.js';
import { homeView, postView, likesView, refreshHome } from './feed.js';
import { createView } from './create.js';
import { profileView, followsView, editView, savedView, archiveView } from './profile.js';
import { exploreView, searchView, tagView, directoryView } from './explore.js';
import { activityView } from './activity.js';
import { inboxView, chatView } from './messages.js';
import { reelsView } from './reels.js';
import { insightsView } from './insights.js';
import { controlView, accountAdminView } from './control.js';

// ---------- Routes ----------
route('/', homeView, { tab: 'home' });
route('/explore', exploreView, { tab: 'explore' });
route('/search', searchView, { tab: 'explore' });
route('/tag/:tag', tagView, { tab: 'explore' });
route('/directory', directoryView, { tab: 'explore' });
route('/create', createView, { tab: 'create', bare: true });
route('/activity', activityView, { tab: 'activity' });
route('/profile', (v) => profileView(v, []), { tab: 'profile' });
route('/u/:u', (v, [u]) => profileView(v, [u]), { tab: 'profile' });
route('/u/:u/(followers|following|mutuals)', followsView, { tab: 'profile' });
route('/edit', editView, { tab: 'profile' });
route('/saved', savedView, { tab: 'profile' });
route('/archive', archiveView, { tab: 'profile' });
route('/p/:id', postView, { tab: 'home' });
route('/likes/:id', likesView, { tab: 'home' });
route('/dm', inboxView, { tab: 'dm' });
route('/dm/:id', chatView, { tab: 'dm', bare: true });
route('/reels', reelsView, { tab: 'reels', dark: true });
route('/insights', insightsView, { tab: 'profile' });
route('/control', controlView, { tab: 'control' });
route('/control/account/:id', accountAdminView, { tab: 'control' });
route('/settings', settingsView, { tab: 'profile' });

// ---------- Shell ----------
const NAV = [
  ['home', '#/', 'home', 'Home'], ['explore', '#/explore', 'search', 'Explore'], ['reels', '#/reels', 'reels', 'Reels'],
  ['dm', '#/dm', 'send', 'Messages'], ['activity', '#/activity', 'heart', 'Activity'], ['create', '#/create', 'plus', 'Create'],
  ['profile', '#/profile', 'user', 'Profile'], ['insights', '#/insights', 'chart', 'Insights'], ['control', '#/control', 'sliders', 'Control Center'],
];
function shell() {
  const app = $('#app');
  app.innerHTML = `<nav class="side">
      <a class="side-brand" href="#/"><span class="logo-mark">${icon('star')}</span><span class="wordmark">Stardom</span></a>
      ${NAV.map(([k, h, ic, l]) => `<a class="side-i" data-tab="${k}" href="${h}">${k === 'profile' ? `<span class="me-av">${avatar(S.owner, 26)}</span>` : icon(ic)}<span>${l}</span>${k === 'activity' ? '<i class="dot" data-badge="notifications"></i>' : k === 'dm' ? '<i class="num" data-badge="messages"></i>' : ''}</a>`).join('')}
      <a class="side-i bottom" href="#/settings">${icon('menu')}<span>More</span></a>
    </nav>
    <main id="main"></main>
    <aside class="rail"></aside>
    <nav class="tabbar">
      <a data-tab="home" href="#/" aria-label="Home">${icon('home')}</a>
      <a data-tab="explore" href="#/explore" aria-label="Explore">${icon('search')}</a>
      <a data-tab="create" href="#/create" aria-label="Create">${icon('plus')}</a>
      <a data-tab="activity" href="#/activity" aria-label="Activity">${icon('heart')}<i class="dot" data-badge="notifications"></i></a>
      <a data-tab="profile" href="#/profile" aria-label="Profile"><span class="me-av">${avatar(S.owner, 26)}</span></a>
    </nav>`;
}
function refreshMeAvatars() { $$('.me-av').forEach(el => { el.innerHTML = avatar(S.owner, 26); }); }

let cleanup = null;
function render() {
  const m = matchRoute(location.hash);
  if (!m) { go('#/'); return; }
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  closeAllSheets();
  const sv = $('.story-viewer'); if (sv) sv.dispatchEvent(new CustomEvent('sv-close'));
  const main = $('#main');
  const old = $('#view'); if (old) old.parentNode.removeChild(old);
  const view = document.createElement('div');
  view.id = 'view'; view.className = 'view';
  main.appendChild(view);
  document.body.classList.toggle('dark-route', !!m.r.opts.dark);
  document.body.classList.toggle('bare-route', !!m.r.opts.bare);
  document.body.dataset.tab = m.r.opts.tab;
  $$('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === m.r.opts.tab));
  $$('.tabbar [data-tab=home]').forEach(a => { a.innerHTML = icon(m.r.opts.tab === 'home' ? 'homeFill' : 'home'); });
  if (m.r.opts.tab !== 'home' || location.hash.startsWith('#/p/')) window.scrollTo(0, 0);
  S.navCount = (S.navCount || 0) + 1;
  try { const c = m.r.render(view, m.params, m.query); if (typeof c === 'function') cleanup = c; else if (c && c.then) c.then(fn => { if (typeof fn === 'function') cleanup = fn; }).catch(e => toast(e.message, 'err')); }
  catch (e) { view.innerHTML = empty('close', 'Something went wrong', e.message); }
  setBadge();
  rail(m.r.opts.tab);
}
window.addEventListener('hashchange', render);
document.addEventListener('click', e => { const a = e.target.closest('a[href^="#/"]'); if (a && a.getAttribute('href') === location.hash && a.closest('.tabbar,.side')) { window.scrollTo({ top: 0, behavior: 'smooth' }); if (location.hash === '#/' || location.hash === '') refreshHome(); } });

// Desktop right rail: suggestions + disclosure
let railLoaded = false;
async function rail(tab) {
  const el = $('.rail');
  if (!el || tab !== 'home' || railLoaded || window.innerWidth < 1264) return;
  railLoaded = true;
  const r = await api('/explore?limit=1').catch(() => null);
  if (!r) return;
  el.innerHTML = `<div class="rail-me">${avatar(S.owner, 44)}<div><b>${esc(S.owner.username)}</b><span>${esc(S.owner.display_name)}</span></div><a href="#/control">Control</a></div>
    <div class="sec-h">Suggested for you <a href="#/directory">See all</a></div>
    ${r.suggested.slice(0, 6).map(a => `<div class="urow sm">${avatar(a, 36)}<a class="urow-m" href="#/u/${encodeURIComponent(a.username)}"><b>${esc(a.username)} ${aiBadge()}</b><span>${esc(a.occupation)}</span></a><button class="txt-btn" data-act="follow" data-id="${a.id}">Follow</button></div>`).join('')}
    <p class="rail-foot">STARDOM is a private social simulator. Every account except yours is a fictional AI persona; numbers are simulated.</p>`;
}

// ---------- Real-time sync (polling while open) ----------
async function sync() {
  if (document.hidden) return;
  try {
    const r = await api('/sync?since=' + (S.lastSync || Date.now()));
    S.lastSync = r.now; S.counts = r.counts; setBadge();
    const inChat = location.hash.startsWith('#/dm/'), inAct = location.hash.startsWith('#/activity');
    const msg = r.messages[0];
    if (msg && !inChat) banner(msg.sender, `${msg.sender ? esc(msg.sender.display_name) : 'New message'}`, esc(msg.kind === 'story_reply' ? 'Replied to your story: ' + msg.text : msg.text), '#/dm/' + msg.conversation_id);
    else if (r.notifications[0] && !inAct) {
      const n = r.notifications[0];
      const t = { like: 'liked your post', comment: 'commented: ' + n.text, reply: 'replied: ' + n.text, follow: 'started following you', follow_back: 'followed you back', mention: 'mentioned you', story_reply: 'replied to your story', story_like: 'liked your story', dm: 'sent you a message', comment_like: 'liked your comment' }[n.type] || n.text;
      banner(n.actor, n.actor ? esc(n.actor.username) : 'STARDOM', esc(t), n.post_id ? '#/p/' + n.post_id : '#/activity');
    }
  } catch (e) { if (e.status === 401) location.reload(); }
}
function banner(actor, title, text, href) {
  const old = $('.banner-pop'); if (old) old.parentNode.removeChild(old);
  const b = document.createElement('a');
  b.className = 'banner-pop'; b.href = href;
  b.innerHTML = `${actor ? avatar(actor, 36) : `<span class="logo-mark">${icon('star')}</span>`}<div><b>${title}</b><span>${text.length > 110 ? text.slice(0, 110) + '…' : text}</span></div>`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add('in'));
  b.onclick = () => b.classList.remove('in');
  setTimeout(() => { b.classList.remove('in'); setTimeout(() => b.parentNode && b.parentNode.removeChild(b), 400); }, 4200);
}

// ---------- Settings ----------
async function settingsView(view) {
  const st = await api('/admin/settings').catch(() => null);
  const n = st ? st.settings.notif : {};
  const N = [['like', 'Likes'], ['comment', 'Comments'], ['reply', 'Comment replies'], ['follow', 'New followers'], ['mention', 'Mentions'], ['story', 'Story views, likes & replies'], ['dm', 'Messages started by characters'], ['recommendation', 'New account recommendations'], ['bot', 'Bot activity related to you'], ['milestone', 'Milestones & trending']];
  view.innerHTML = topbar({ title: 'Settings', back: true }) + `<div class="settings">
    <div class="list-g"><a href="#/edit">${icon('user')}<span>Edit profile</span>${icon('right', 'chev')}</a><a href="#/saved">${icon('bookmark')}<span>Saved</span>${icon('right', 'chev')}</a><a href="#/archive">${icon('archive')}<span>Story archive & highlights</span>${icon('right', 'chev')}</a><a href="#/insights">${icon('chart')}<span>Insights</span>${icon('right', 'chev')}</a></div>
    <div class="list-g"><a href="#/control">${icon('sliders')}<span>Owner Control Center</span>${icon('right', 'chev')}</a><a href="#/directory">${icon('star')}<span>Celebrity directory</span>${icon('right', 'chev')}</a><a href="#/reels">${icon('reels')}<span>Reels</span>${icon('right', 'chev')}</a><a href="#/dm">${icon('send')}<span>Messages</span>${icon('right', 'chev')}</a></div>
    <div class="sec-h pad">In-app notifications</div>
    <div class="list-g form">${N.map(([k, l]) => `<label class="tg"><span>${l}</span><input type="checkbox" data-n="${k}" ${n[k] !== false ? 'checked' : ''}><i></i></label>`).join('')}</div>
    <div class="sec-h pad">About</div>
    <div class="list-g about"><p><b>STARDOM</b> · Your own social universe.</p><p>Every account except yours is a <b>fictional, AI-simulated persona</b>. They do not represent real people, and nothing here is posted to real social networks. All likes, comments, followers and analytics are simulated inside this private app.</p></div>
    <div class="list-g"><button data-act="lock">${icon('lock')}<span>Lock STARDOM</span></button><a href="../">${icon('logout')}<span>Back to Nexa</span></a></div></div>`;
  view.addEventListener('change', async e => {
    const el = e.target.closest('[data-n]'); if (!el) return;
    await api('/admin/settings', { method: 'PATCH', body: { notif: { [el.dataset.n]: el.checked } } }).catch(er => toast(er.message, 'err'));
    toast('Saved');
  });
}
act('lock', () => signOut());

// ---------- Lock screen ----------
let pin = '';
function showLock(msg) {
  $('#app').classList.add('hidden'); $('#lock').classList.remove('hidden');
  $('#lock-err').textContent = msg || '';
  pin = ''; dots();
}
function dots() { const d = $('#pin-dots'); d.innerHTML = Array.from({ length: PIN_LEN }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); }
$('#pin-pad').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || $('#lock').classList.contains('busy')) return;
  if (b.dataset.del) pin = pin.slice(0, -1); else if (pin.length < PIN_LEN) pin += b.dataset.d;
  $('#lock-err').textContent = ''; dots();
  if (pin.length === PIN_LEN) {
    $('#lock').classList.add('busy');
    try { await signIn(pin); } catch (er) {
      const c = er.code || '';
      $('#lock-err').textContent = /too-many/.test(c) ? 'Too many attempts. Wait a moment.' : /network/.test(c) ? 'No internet connection.' : 'Wrong PIN.';
      const card = $('.lock-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      pin = ''; dots();
    }
    $('#lock').classList.remove('busy');
  }
});
document.addEventListener('keydown', e => { if ($('#lock').classList.contains('hidden')) return; const b = /^\d$/.test(e.key) ? $(`#pin-pad [data-d="${e.key}"]`) : e.key === 'Backspace' ? $('#pin-pad [data-del]') : null; if (b) b.click(); });

// ---------- Boot ----------
let started = false;
async function start() {
  $('#lock').classList.add('hidden');
  if (started) return;
  started = true;
  $('#app').classList.remove('hidden');
  $('#app').innerHTML = '<div class="boot"><span class="logo-mark big">' + icon('star') + '</span><span class="wordmark">Stardom</span><span class="boot-s">Preparing your universe…</span></div>';
  try {
    const b = await api('/bootstrap');
    S.owner = b.owner; S.counts = b.counts; S.meta = b; S.lastSync = b.server_time;
    S.owner.interests = [];
    shell(); render();
    setInterval(sync, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    if (location.hash === '#/' || !location.hash) { /* first open */ }
  } catch (e) {
    $('#app').innerHTML = `<div class="boot">${empty('close', e.status === 403 ? 'Not the owner account' : 'Could not open STARDOM', e.message)}<button class="btn" onclick="location.reload()">Try again</button></div>`;
    started = false;
  }
}
dots();
initAuth(start, msg => { started = false; showLock(msg); });
if ('serviceWorker' in navigator && !DEV) navigator.serviceWorker.register('sw.js').catch(() => {});
