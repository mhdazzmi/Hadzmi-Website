/* STARDOM — Explore, search, hashtags, celebrity directory */
import { api, esc, icon, avatar, uname, fmt, S, $, $$, topbar, skeleton, empty, aiBadge, verifiedBadge, go, store } from './core.js';
import { gridHtml } from './profile.js';

const card = a => `<div class="sug">
  <a href="#/u/${encodeURIComponent(a.username)}">${avatar(a, 64)}</a>
  <a class="sug-n" href="#/u/${encodeURIComponent(a.username)}"><b>${esc(a.username)}</b>${a.verified ? verifiedBadge() : ''}</a>
  <span class="sug-s">${esc(a.occupation || '')}</span><span class="sug-s">${fmt(a.followers)} followers ${aiBadge()}</span>
  <button class="btn sm ${a.is_following ? '' : 'primary'} block" data-act="follow" data-id="${a.id}">${a.is_following ? 'Following' : a.follows_you ? 'Follow back' : 'Follow'}</button></div>`;
const row = a => `<div class="urow">${avatar(a, 48)}<a class="urow-m" href="#/u/${encodeURIComponent(a.username)}">${uname(a, { link: false })}<span>${esc(a.display_name)} · ${esc(a.occupation || '')} · ${esc(a.country || '')}</span><span>${fmt(a.followers)} followers</span></a>${a.is_following === undefined ? '' : `<button class="btn sm ${a.is_following ? '' : 'primary'}" data-act="follow" data-id="${a.id}">${a.is_following ? 'Following' : 'Follow'}</button>`}</div>`;

export async function exploreView(view) {
  view.innerHTML = `<header class="topbar search-bar"><a class="search-fake" href="#/search">${icon('search', 'sm')}<span>Search people, places, #tags</span></a></header>
    <div class="chips cats"></div><div class="ex-sec ex-sug"></div><div class="ex-sec ex-trend"></div><div class="grid explore">${'<div class="g-i skel-b"></div>'.repeat(12)}</div>`;
  const r = await api('/explore').catch(e => null);
  if (!r) { $('.grid', view).innerHTML = empty('search', 'Explore is unavailable', 'Check your connection.'); return; }
  $('.cats', view).innerHTML = `<a class="chip" href="#/directory">${icon('star', 'sm')} Directory</a>` + r.categories.map(c => `<a class="chip" href="#/directory?c=${c.key}">${esc(c.label)}</a>`).join('');
  $('.ex-sug', view).innerHTML = r.suggested.length ? `<div class="sec-h">Suggested for you <a href="#/directory">See all</a></div><div class="sugs">${r.suggested.map(card).join('')}</div>` : '';
  $('.ex-trend', view).innerHTML = r.trending.length ? `<div class="sec-h">Trending this week</div><div class="chips wrap">${r.trending.map(t => `<a class="chip tag" href="#/tag/${encodeURIComponent(t.tag)}">#${esc(t.tag)} <small>${fmt(t.n)}</small></a>`).join('')}</div>
    ${r.newest.length ? `<div class="sec-h">New on STARDOM</div><div class="sugs">${r.newest.map(card).join('')}</div>` : ''}` : '';
  $('.grid', view).innerHTML = gridHtml(r.posts);
}

export function searchView(view) {
  const last = store.get('stardom_search', { country: '', industry: '', sort: 'relevance' });
  view.innerHTML = `<header class="topbar search-bar"><button class="ib" data-act="back">${icon('back')}</button><div class="search-box">${icon('search', 'sm')}<input id="sq" placeholder="Search" autocapitalize="off" enterkeyhint="search"></div></header>
    <div class="filters"><select id="sf-country"><option value="">All countries</option>${(S.meta.countries || []).map(c => `<option ${c === last.country ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="sf-ind"><option value="">All industries</option>${(S.meta.industries || []).map(c => `<option ${c === last.industry ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="sf-sort">${[['relevance', 'Relevance'], ['followers', 'Most followed'], ['active', 'Recently active'], ['newest', 'Newest']].map(([v, l]) => `<option value="${v}" ${v === last.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="res"><div class="note pad">Search by username, name, country, occupation, interest or #hashtag.</div></div>`;
  const q = $('#sq', view); q.focus();
  let t;
  const run = async () => {
    const f = { country: $('#sf-country', view).value, industry: $('#sf-ind', view).value, sort: $('#sf-sort', view).value };
    store.set('stardom_search', f);
    const v = q.value.trim();
    if (!v && !f.country && !f.industry) { $('.res', view).innerHTML = '<div class="note pad">Search by username, name, country, occupation, interest or #hashtag.</div>'; return; }
    $('.res', view).innerHTML = skeleton(2);
    const r = await api(`/search?q=${encodeURIComponent(v)}&country=${encodeURIComponent(f.country)}&industry=${encodeURIComponent(f.industry)}&sort=${f.sort}`);
    $('.res', view).innerHTML = (r.tags && r.tags.length ? `<div class="sec-h pad">Tags</div>${r.tags.map(x => `<a class="urow" href="#/tag/${encodeURIComponent(x.tag)}"><span class="tag-ic">#</span><div class="urow-m"><b>#${esc(x.tag)}</b><span>${fmt(x.post_count)} posts</span></div></a>`).join('')}` : '')
      + (r.accounts ? (r.accounts.length ? `<div class="sec-h pad">Accounts</div>${r.accounts.map(row).join('')}` : (!r.tags || !r.tags.length ? empty('search', 'No results', 'Try another name, country or interest.') : '')) : '');
  };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  $$('select', view).forEach(s => s.onchange = run);
  if (last.country || last.industry) run();
}

export async function tagView(view, [tag]) {
  view.innerHTML = topbar({ title: '#' + esc(tag), back: true }) + `<div class="tag-h"><span class="tag-ic big">#</span><div><b>#${esc(tag)}</b><span class="cnt"></span></div></div><div class="seg"><button class="on" data-s="top">Top</button><button data-s="recent">Recent</button></div><div class="grid"></div>`;
  const load = async s => {
    $$('.seg button', view).forEach(b => b.classList.toggle('on', b.dataset.s === s));
    $('.grid', view).innerHTML = '<div class="spinner"></div>';
    const r = await api(`/tags/${encodeURIComponent(tag)}?sort=${s}`);
    $('.cnt', view).textContent = `${fmt(r.count)} posts`;
    $('.grid', view).innerHTML = r.posts.length ? gridHtml(r.posts) : empty('search', 'No posts with this hashtag yet');
  };
  $('.seg', view).onclick = e => { const b = e.target.closest('button'); if (b) load(b.dataset.s); };
  load('top');
}

export async function directoryView(view, params, query) {
  let cat = query.get('c') || '', sort = 'followers', offset = 0;
  view.innerHTML = topbar({ title: 'Directory', back: true }) + `<div class="note pad">${icon('sparkle', 'sm')} Every personality here is a fictional AI persona simulated inside your universe.</div><div class="chips cats sticky"></div><div class="dir-sort"><select>${[['followers', 'Most followed'], ['active', 'Recently active'], ['newest', 'Newest'], ['name', 'Name A–Z']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div><div class="ulist"></div><div class="ul-more"></div>`;
  const load = async reset => {
    if (reset) { offset = 0; $('.ulist', view).innerHTML = skeleton(3); }
    const r = await api(`/directory?category=${cat}&sort=${sort}&offset=${offset}`);
    $('.cats', view).innerHTML = `<button class="chip ${cat ? '' : 'on'}" data-c="">All</button>` + r.categories.map(c => `<button class="chip ${cat === c.key ? 'on' : ''}" data-c="${c.key}">${esc(c.label)} <small>${r.counts[c.key] || 0}</small></button>`).join('');
    const html = r.accounts.map(row).join('');
    if (reset) $('.ulist', view).innerHTML = html || empty('users', 'No personalities in this category yet', 'Generate some in Control Center → Population.', '<a class="btn primary" href="#/control?tab=population">Generate</a>');
    else $('.ulist', view).insertAdjacentHTML('beforeend', html);
    offset = r.next;
    $('.ul-more', view).innerHTML = r.next ? '<button class="btn block ghost">Load more</button>' : '';
    const on = $('.cats .chip.on', view); if (on && reset) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  };
  view.addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (c) { cat = c.dataset.c; load(true); } if (e.target.closest('.ul-more button')) load(false); });
  $('.dir-sort select', view).onchange = e => { sort = e.target.value; load(true); };
  load(true);
}
