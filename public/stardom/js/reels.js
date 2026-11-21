/* STARDOM — Reels: full-screen vertical short videos */
import { api, esc, icon, avatar, uname, fmt, S, $, $$, empty, toast, haptic, richText } from './core.js';
import { posts as cache, openComments, openShare } from './feed.js';

export function reelsView(view) {
  view.classList.add('reels-view');
  view.innerHTML = `<header class="reels-h"><b>Reels</b><a class="ib light" href="#/create?mode=reel" aria-label="New reel">${icon('camera')}</a></header><div class="reels"></div>`;
  const box = $('.reels', view);
  let cursor = null, loading = false, done = false;
  const viewed = new Set();
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      const r = en.target, v = $('video', r);
      if (en.isIntersecting && en.intersectionRatio > 0.7) {
        if (v) { v.muted = !S.unmuted; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
        r.classList.add('playing');
        const id = r.dataset.id;
        if (!viewed.has(id)) { viewed.add(id); api(`/reels/${id}/view`, { method: 'POST', body: {} }).catch(() => {}); }
        if (r === box.lastElementChild || r === box.lastElementChild.previousElementSibling) more();
      } else { if (v) v.pause(); r.classList.remove('playing'); }
    }
  }, { root: box, threshold: [0, 0.7] });
  const reel = p => {
    cache.set(p.id, p);
    const m = p.media[0] || {};
    const media = m.kind === 'video'
      ? `<video src="${esc(m.url)}" ${m.thumb ? `poster="${esc(m.thumb)}"` : ''} playsinline loop muted preload="metadata"></video>`
      : `<img class="kb" src="${esc(m.url)}" alt="">`;
    return `<section class="reel" data-id="${p.id}">${media}<div class="reel-shade"></div><span class="reel-mute">${icon('mute')}</span>
      <div class="reel-side">
        <button data-r="like" class="${p.liked ? 'on' : ''}">${icon(p.liked ? 'heartFill' : 'heart')}<span>${fmt(p.likes)}</span></button>
        <button data-r="comments">${icon('comment')}<span>${fmt(p.comments)}</span></button>
        <button data-r="share">${icon('send')}</button>
        <button data-r="save" class="${p.saved ? 'on' : ''}">${icon(p.saved ? 'bookmarkFill' : 'bookmark')}</button>
      </div>
      <div class="reel-info"><div class="reel-who"><a href="#/u/${encodeURIComponent(p.author.username)}">${avatar(p.author, 32)}</a>${uname(p.author)}</div>
        ${p.caption ? `<div class="reel-cap">${richText(p.caption.slice(0, 160))}</div>` : ''}
        <div class="reel-meta">♪ ${esc(p.audio || 'Original audio')} · ${fmt(p.views)} views${m.kind !== 'video' ? ' · motion photo' : ''}</div></div>
      <div class="pm-heart">${icon('heartFill')}</div></section>`;
  };
  async function more() {
    if (loading || done) return;
    loading = true;
    const r = await api('/reels' + (cursor ? '?cursor=' + cursor : '')).catch(e => ({ reels: [], error: e.message }));
    if (!cursor && !r.reels.length) box.innerHTML = empty('reels', 'No reels yet', r.error || 'Share a vertical video to start the reels feed.', '<a class="btn primary" href="#/create?mode=reel">Create reel</a>');
    box.insertAdjacentHTML('beforeend', r.reels.map(reel).join(''));
    $$('.reel:not([data-o])', box).forEach(el => { el.dataset.o = 1; io.observe(el); });
    cursor = r.cursor; done = !r.cursor; loading = false;
  }
  const upd = (el, p) => {
    const l = $('[data-r=like]', el); l.className = p.liked ? 'on' : ''; l.innerHTML = `${icon(p.liked ? 'heartFill' : 'heart')}<span>${fmt(p.likes)}</span>`;
    const s = $('[data-r=save]', el); s.className = p.saved ? 'on' : ''; s.innerHTML = icon(p.saved ? 'bookmarkFill' : 'bookmark');
  };
  async function like(el, force) {
    const p = cache.get(el.dataset.id);
    const want = force != null ? force : !p.liked; if (want === p.liked) return;
    p.liked = want; p.likes += want ? 1 : -1; upd(el, p); haptic();
    const r = await api(`/posts/${p.id}/like`, { method: 'POST', body: { like: want } }).catch(e => { toast(e.message, 'err'); return null; });
    if (r) { p.likes = r.likes; upd(el, p); }
  }
  let lastTap = 0;
  box.addEventListener('click', async e => {
    const el = e.target.closest('.reel'); if (!el) return;
    const b = e.target.closest('[data-r]');
    const p = cache.get(el.dataset.id);
    if (b) {
      if (b.dataset.r === 'like') return like(el);
      if (b.dataset.r === 'comments') return openComments(p.id);
      if (b.dataset.r === 'share') return openShare(p.id);
      if (b.dataset.r === 'save') { const r = await api(`/posts/${p.id}/save`, { method: 'POST', body: {} }); p.saved = r.saved; upd(el, p); toast(r.saved ? 'Saved' : 'Removed'); return; }
    }
    if (e.target.closest('a')) return;
    const t = Date.now();
    if (t - lastTap < 300) { lastTap = 0; const h = $('.pm-heart', el); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); return like(el, true); }
    lastTap = t;
    setTimeout(() => { if (lastTap !== t) return; const v = $('video', el); if (v) { v.muted = !v.muted; S.unmuted = !v.muted; $('.reel-mute', el).innerHTML = icon(v.muted ? 'mute' : 'volume'); $('.reel-mute', el).classList.add('show'); setTimeout(() => $('.reel-mute', el).classList.remove('show'), 700); } }, 320);
  });
  more();
  return () => io.disconnect();
}
