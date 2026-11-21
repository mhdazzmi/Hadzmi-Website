/* STARDOM — Insights (simulated analytics). Charts: one series each, thin marks, hover tooltips, table view. */
import { api, esc, icon, avatar, uname, fmt, $, $$, topbar, skeleton, empty } from './core.js';
import { gridHtml } from './profile.js';

const W = 640, H = 200, PAD = { l: 40, r: 12, t: 12, b: 26 };
function niceMax(v) { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
const short = d => { const [, m, dd] = d.split('-'); return `${+dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}`; };

/** Single-series chart (bars or line) with axis, recessive grid, hover tooltip and an accessible table. */
function chart({ id, title, data, key, label = d => d.day, kind = 'bar', unit = '' }) {
  const vals = data.map(d => d[key]);
  const max = niceMax(Math.max(1, ...vals)), min = kind === 'line' ? Math.max(0, Math.min(...vals) - (Math.max(...vals) - Math.min(...vals)) * 0.2) : 0;
  const lo = kind === 'line' ? Math.floor(min) : 0, hi = kind === 'line' ? Math.max(lo + 4, Math.ceil(Math.max(...vals) * 1.05)) : max;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b, n = data.length;
  const x = i => PAD.l + (n === 1 ? iw / 2 : kind === 'bar' ? (i + 0.5) * iw / n : i * iw / (n - 1));
  const y = v => PAD.t + ih - (v - lo) / (hi - lo || 1) * ih;
  const ticks = [0, 0.5, 1].map(f => lo + (hi - lo) * f);
  const grid = ticks.map(v => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${PAD.l - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${fmt(Math.round(v))}</text>`).join('');
  const every = Math.ceil(n / 6);
  const xl = data.map((d, i) => i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(label(d))}</text>` : '').join('');
  let marks = '';
  if (kind === 'bar') {
    const bw = Math.min(24, iw / n - 2);
    marks = data.map((d, i) => { const h = Math.max(0, y(lo) - y(d[key])); if (!h) return ''; const x0 = x(i) - bw / 2, y0 = y(d[key]), r = Math.min(4, bw / 2, h);
      return `<path class="mk" d="M${x0},${y(lo)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(lo)} Z"/>`; }).join('');
  } else {
    marks = `<path class="ln" d="${data.map((d, i) => (i ? 'L' : 'M') + x(i) + ',' + y(d[key])).join(' ')}"/><circle class="end" cx="${x(n - 1)}" cy="${y(vals[n - 1])}" r="4"/>`;
  }
  const hits = data.map((d, i) => `<rect class="hit" x="${x(i) - iw / n / 2}" y="${PAD.t}" width="${iw / n}" height="${ih}" data-i="${i}"/>`).join('');
  const table = `<details class="tbl"><summary>View as table</summary><table><thead><tr><th>${kind === 'bar' && data[0] && data[0].hour != null ? 'Hour' : 'Day'}</th><th>${esc(title)}</th></tr></thead><tbody>${data.map(d => `<tr><td>${esc(label(d))}</td><td>${fmt(d[key])}${unit}</td></tr>`).join('')}</tbody></table></details>`;
  return `<section class="card chart" id="${id}"><div class="ch-t">${esc(title)}</div><div class="ch-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${marks}${xl}<line class="cross hidden" y1="${PAD.t}" y2="${PAD.t + ih}"/>${hits}</svg><div class="tip hidden"></div></div>${table}</section>`;
}
function bindChart(root, data, key, label, unit = '', kind = 'bar') {
  const svg = $('svg', root), tip = $('.tip', root), cross = $('.cross', root);
  const show = el => {
    const i = +el.dataset.i, d = data[i];
    tip.innerHTML = `<b>${esc(label(d))}</b>${fmt(d[key])}${unit}`;
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect(), w = root.querySelector('.ch-wrap').getBoundingClientRect();
    const cx = r.left + r.width / 2 - w.left;
    tip.style.left = Math.max(40, Math.min(w.width - 40, cx)) + 'px';
    if (kind === 'line') { const sx = +el.getAttribute('x') + +el.getAttribute('width') / 2; cross.setAttribute('x1', sx); cross.setAttribute('x2', sx); cross.classList.remove('hidden'); }
    $$('.mk', root).forEach((m, j) => m.classList.toggle('dim', j !== i));
  };
  const hide = () => { tip.classList.add('hidden'); cross.classList.add('hidden'); $$('.mk', root).forEach(m => m.classList.remove('dim')); };
  svg.addEventListener('pointermove', e => { const h = e.target.closest('.hit'); if (h) show(h); });
  svg.addEventListener('pointerdown', e => { const h = e.target.closest('.hit'); if (h) show(h); });
  svg.addEventListener('pointerleave', hide);
}

const delta = (cur, prev) => {
  if (!prev) return cur ? '<span class="dl up">new</span>' : '<span class="dl">–</span>';
  const p = Math.round((cur - prev) / prev * 100);
  return `<span class="dl ${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p > 0 ? '▲' : p < 0 ? '▼' : ''} ${Math.abs(p)}%</span>`;
};

export function insightsView(view, params, query) {
  let days = +(query.get('d') || 30);
  view.innerHTML = topbar({ title: 'Insights', back: true }) + `<div class="banner">${icon('sparkle', 'sm')} Simulated metrics from your private STARDOM universe. They are not real social-media analytics.</div>
    <div class="seg"><button data-d="7">7 days</button><button data-d="30">30 days</button><button data-d="90">90 days</button></div><div class="ins">${skeleton(2)}</div>`;
  const load = async () => {
    $$('.seg button', view).forEach(b => b.classList.toggle('on', +b.dataset.d === days));
    const r = await api('/insights?days=' + days).catch(e => null);
    if (!r) { $('.ins', view).innerHTML = empty('chart', 'Insights unavailable'); return; }
    const p = r.period, pv = r.previous;
    const newF = (p.follows || 0) - (p.unfollows || 0);
    const hours = Array.from({ length: 24 }, (_, h) => { const x = r.audience_hours.find(a => a.hour === h) || {}; return { hour: h, total: (x.likes || 0) + (x.comments || 0) }; });
    $('.ins', view).innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Followers</span><b>${fmt(r.followers)}</b><small>${newF >= 0 ? '+' : ''}${fmt(newF)} in ${days} days</small></div>
        <div class="kpi"><span>Likes received</span><b>${fmt(p.likes || 0)}</b><small>${delta(p.likes || 0, pv.likes)} vs previous</small></div>
        <div class="kpi"><span>Comments</span><b>${fmt(p.comments || 0)}</b><small>${delta(p.comments || 0, pv.comments)} vs previous</small></div>
        <div class="kpi"><span>Engagement rate</span><b>${r.engagement_rate}%</b><small>avg per post ÷ followers</small></div>
        <div class="kpi"><span>Story views</span><b>${fmt(p.story_views || 0)}</b><small>${delta(p.story_views || 0, pv.story_views)} vs previous</small></div>
        <div class="kpi"><span>All-time</span><b>${fmt(r.totals.likes)}</b><small>likes on ${fmt(r.totals.posts)} posts</small></div>
      </div>
      ${chart({ id: 'c-fol', title: 'Follower growth', data: r.follower_series, key: 'followers', label: d => short(d.day), kind: 'line' })}
      ${chart({ id: 'c-likes', title: 'Likes per day', data: r.series, key: 'likes', label: d => short(d.day) })}
      ${chart({ id: 'c-com', title: 'Comments per day', data: r.series, key: 'comments', label: d => short(d.day) })}
      ${chart({ id: 'c-hours', title: 'When your audience is active (WIB)', data: hours, key: 'total', label: d => String(d.hour).padStart(2, '0') + ':00' })}
      <section class="card"><div class="ch-t">Best posting times</div>${r.best_hours.length ? `<div class="bh">${r.best_hours.sort((a, b) => b.avg - a.avg).slice(0, 5).map((h, i, arr) => `<div class="bh-r"><span>${String(h.hour).padStart(2, '0')}:00</span><div class="bh-b"><i style="width:${Math.max(4, h.avg / arr[0].avg * 100)}%"></i></div><b>${fmt(h.avg)}</b><small>${h.posts} post${h.posts > 1 ? 's' : ''}</small></div>`).join('')}</div><div class="note">Average likes + comments per post, by the hour you published.</div>` : '<div class="note">Publish a few posts to compare posting times.</div>'}</section>
      <section class="card"><div class="ch-t">Top posts</div>${r.top_posts.length ? `<div class="grid">${gridHtml(r.top_posts)}</div>` : '<div class="note">No posts yet.</div>'}</section>
      <section class="card"><div class="ch-t">Most active followers</div>${r.active_followers.length ? r.active_followers.map((a, i) => `<div class="urow"><span class="rank">${i + 1}</span>${avatar(a, 40)}<div class="urow-m">${uname(a)}<span>${fmt(a.interactions)} interactions</span></div></div>`).join('') : '<div class="note">No interactions yet in this period.</div>'}</section>
      <section class="card"><div class="ch-t">Top follower countries</div>${r.countries.length ? `<div class="bh">${r.countries.map(c => `<div class="bh-r"><span>${esc(c.country)}</span><div class="bh-b"><i style="width:${c.n / r.countries[0].n * 100}%"></i></div><b>${fmt(c.n)}</b><small>${Math.round(c.n / Math.max(1, r.followers) * 100)}%</small></div>`).join('')}</div>` : '<div class="note">No followers yet.</div>'}</section>`;
    bindChart($('#c-fol', view), r.follower_series, 'followers', d => short(d.day), '', 'line');
    bindChart($('#c-likes', view), r.series, 'likes', d => short(d.day));
    bindChart($('#c-com', view), r.series, 'comments', d => short(d.day));
    bindChart($('#c-hours', view), hours, 'total', d => String(d.hour).padStart(2, '0') + ':00');
  };
  $('.seg', view).onclick = e => { const b = e.target.closest('[data-d]'); if (b) { days = +b.dataset.d; load(); } };
  load();
}
