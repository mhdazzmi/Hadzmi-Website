/* STARDOM — stories tray & full-screen viewer */
import { api, esc, icon, avatar, uname, timeAgo, fmt, toast, sheet, act, S, go, $, $$, confirmBox, haptic } from './core.js';

let trayData = [];
export async function storyTray(el) {
  if (!el) return;
  try {
    const r = await api('/stories');
    trayData = r.tray;
    const own = r.tray.find(t => t.own);
    const others = r.tray.filter(t => !t.own);
    el.innerHTML = `<div class="tray-in">
      <button class="tray-i" data-act="${own ? 'story-open' : 'story-new'}" data-id="${S.owner.id}">
        ${avatar(S.owner, 64, { ring: own ? (own.seen ? 'seen' : 'new') : null })}${own ? '' : `<span class="tray-plus">+</span>`}<span class="tray-n">Your story</span></button>
      ${others.map(t => `<button class="tray-i" data-act="story-open" data-id="${t.account.id}">${avatar(t.account, 64, { ring: t.seen ? 'seen' : 'new' })}<span class="tray-n">${esc(t.account.username)}</span></button>`).join('')}
    </div>`;
  } catch (e) { el.innerHTML = ''; }
}
act('story-new', () => go('#/create?mode=story'));
act('story-open', el => openStories(el.dataset.id));

function closeViewerNow() { const v = $('.story-viewer'); if (v) v.dispatchEvent(new CustomEvent('sv-close')); }

/** Open the viewer at a given account; continues through the tray order. */
export async function openStories(accountId, { single = false, stories = null, title = null } = {}) {
  const order = single || stories ? [accountId] : (() => { const ids = trayData.map(t => t.account.id); const i = ids.indexOf(accountId); return i >= 0 ? ids.slice(i) : [accountId]; })();
  const ov = document.createElement('div');
  ov.className = 'story-viewer';
  ov.innerHTML = `<div class="sv-stage"><div class="sv-bars"></div><div class="sv-h"></div><div class="sv-media"></div><div class="sv-tap l"></div><div class="sv-tap r"></div><div class="sv-f"></div></div>`;
  document.body.appendChild(ov); document.body.classList.add('noscroll');
  requestAnimationFrame(() => ov.classList.add('in'));
  let ui = 0, si = 0, list = null, acc = null, timer = null, t0 = 0, dur = 5000, elapsed = 0, paused = false, closed = false;
  const close = () => {
    if (closed) return;
    closed = true; cancelAnimationFrame(timer); ov.classList.remove('in');
    setTimeout(() => { ov.parentNode && ov.parentNode.removeChild(ov); if (!$('.sheet-wrap')) document.body.classList.remove('noscroll'); }, 220);
    const tr = $('.tray'); if (tr) storyTray(tr);
  };
  ov.addEventListener('sv-close', close);
  async function loadUser() {
    if (ui >= order.length) return close();
    if (stories) { list = stories; acc = S.owner; }
    else { const r = await api('/stories/u/' + order[ui]).catch(() => null); if (!r || !r.stories.length) { ui++; return loadUser(); } list = r.stories; acc = r.account; }
    si = single || stories ? 0 : Math.max(0, list.findIndex(s => !s.seen));
    show();
  }
  function show() {
    if (closed) return;
    const s = list[si];
    const own = acc.id === S.owner.id;
    $('.sv-bars', ov).innerHTML = list.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('');
    $('.sv-h', ov).innerHTML = `<a href="#/u/${encodeURIComponent(acc.username)}" class="sv-who" data-close>${avatar(acc, 32)}${uname(acc, { link: false })}<span class="sv-t">${title ? esc(title) : timeAgo(s.created_at)}</span></a><button class="ib light" data-x aria-label="Close">${icon('close')}</button>`;
    const m = $('.sv-media', ov);
    const cap = s.text || s.caption ? `<div class="sv-cap">${esc(s.text || s.caption)}</div>` : '';
    if (s.kind === 'text') m.innerHTML = `<div class="sv-text" style="background:${esc(s.bg || '#111')}"><p>${esc(s.text)}</p></div>`;
    else if (s.media && s.media.kind === 'video') m.innerHTML = `<video src="${esc(s.media.url)}" playsinline autoplay ${S.unmuted ? '' : 'muted'}></video>${cap}`;
    else m.innerHTML = `<img src="${esc(s.media ? s.media.url : '')}" alt="">${cap}`;
    $('.sv-f', ov).innerHTML = own
      ? `<button class="sv-seen" data-viewers>${icon('users')} Seen by ${fmt(s.views)}</button><span class="sp"></span><button class="ib light" data-hl aria-label="Add to highlight">${icon('star')}</button><button class="ib light" data-del aria-label="Delete">${icon('trash')}</button>`
      : `<form class="sv-reply"><input placeholder="Reply to ${esc(acc.username)}…" maxlength="500"><button class="ib light" type="button" data-heart aria-label="Send a heart">${icon('heart')}</button><button class="ib light" type="submit" aria-label="Send">${icon('send')}</button></form>`;
    if (!own && !s.seen) { s.seen = true; api(`/stories/${s.id}/view`, { method: 'POST', body: {} }).catch(() => {}); }
    elapsed = 0; dur = 5000; paused = false;
    const v = $('video', m);
    if (v) { v.onloadedmetadata = () => { dur = Math.min(60000, (v.duration || 5) * 1000); }; v.onwaiting = () => { paused = true; }; v.onplaying = () => { paused = false; }; }
    t0 = performance.now();
    cancelAnimationFrame(timer);
    const step = now => {
      if (closed) return;
      if (!paused) elapsed += now - t0;
      t0 = now;
      const bar = $$('.sv-bars i b', ov)[si]; if (bar) bar.style.width = Math.min(100, elapsed / dur * 100) + '%';
      if (elapsed >= dur) return next();
      timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step);
  }
  function next() { if (si < list.length - 1) { si++; show(); } else { ui++; if (single || stories) return close(); loadUser(); } }
  function prev() { if (si > 0) { si--; show(); } else if (ui > 0 && !single) { ui--; loadUser(); } else { elapsed = 0; } }
  const setPause = p => { paused = p; const v = $('.sv-media video', ov); if (v) p ? v.pause() : v.play().catch(() => {}); };
  ov.addEventListener('click', async e => {
    if (e.target.closest('[data-x]') || e.target.closest('[data-close]')) return close();
    if (e.target.closest('.sv-tap.l')) return prev();
    if (e.target.closest('.sv-tap.r')) return next();
    const s = list && list[si];
    if (!s) return;
    if (e.target.closest('[data-viewers]')) { setPause(true); viewersSheet(s, () => setPause(false)); }
    if (e.target.closest('[data-hl]')) {
      setPause(true);
      const name = prompt('Add to highlight. Name:', s.highlight || 'Highlights');
      if (name != null) { await api(`/stories/${s.id}/highlight`, { method: 'POST', body: { name } }); s.highlight = name; toast('Added to highlight'); }
      setPause(false);
    }
    if (e.target.closest('[data-del]')) {
      setPause(true);
      if (await confirmBox('Delete story?', '', 'Delete', true)) { await api(`/stories/${s.id}`, { method: 'DELETE' }); list.splice(si, 1); toast('Story deleted'); if (!list.length) return close(); si = Math.min(si, list.length - 1); show(); }
      else setPause(false);
    }
    if (e.target.closest('[data-heart]')) { await sendReply(s, '❤️'); haptic(15); }
  });
  ov.addEventListener('focusin', e => { if (e.target.matches('.sv-reply input')) setPause(true); });
  ov.addEventListener('focusout', e => { if (e.target.matches('.sv-reply input')) setPause(false); });
  ov.addEventListener('submit', async e => { e.preventDefault(); const inp = $('.sv-reply input', ov); const t = inp.value.trim(); if (!t) return; inp.value = ''; inp.blur(); await sendReply(list[si], t); });
  async function sendReply(s, text) { const r = await api(`/stories/${s.id}/reply`, { method: 'POST', body: { text } }).catch(er => { toast(er.message, 'err'); return null; }); if (r) toast('Reply sent'); }
  // hold to pause, swipe down to close
  let hold = null, y0 = null;
  const stage = $('.sv-stage', ov);
  stage.addEventListener('pointerdown', e => { if (e.target.closest('.sv-f,.sv-h')) return; y0 = e.clientY; hold = setTimeout(() => setPause(true), 200); });
  stage.addEventListener('pointerup', e => { clearTimeout(hold); if (y0 != null && e.clientY - y0 > 90) close(); else if (paused && !$('.sheet-wrap') && !$('.sv-reply input:focus')) setTimeout(() => setPause(false), 10); y0 = null; });
  const onKey = e => { if (closed) return document.removeEventListener('keydown', onKey); if (e.target.matches('input')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
  document.addEventListener('keydown', onKey);
  loadUser();
}

async function viewersSheet(s, onClose) {
  const sh = sheet({ title: `${fmt(s.views)} viewers`, html: '<div class="ulist"><div class="spinner"></div></div>', onClose });
  const r = await api(`/stories/${s.id}/viewers`);
  sh.body.innerHTML = `<div class="ulist">${r.accounts.map(a => `<a class="urow" href="#/u/${encodeURIComponent(a.username)}" data-closesheet>${avatar(a, 44)}<div class="urow-m">${uname(a, { link: false })}<span>${esc(a.display_name)}</span></div>${a.liked ? `<span class="hearted">${icon('heartFill')}</span>` : ''}</a>`).join('') || '<div class="note">No viewers yet. Your audience is on its way.</div>'}</div>`;
  sh.body.addEventListener('click', e => { if (e.target.closest('[data-closesheet]')) { sh.close(); closeViewerNow(); } });
}
