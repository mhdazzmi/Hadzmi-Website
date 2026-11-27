/* =========================================================
   NEXA SOCIAL — halaman progress untuk klien (bahasa Inggris)
   ?g=<token tamu>  → progress satu narasumber + approval
   ?c=<token klien> → ringkasan semua narasumber
   Data: Firebase node "hadzmi_social_data" (sama dengan /social/). ?demo=1 memakai data contoh di browser ini.
   ========================================================= */
(function () {
'use strict';
const firebaseConfig = {
  apiKey: "AIzaSyBoTr_A9JQsRTHri47o0ZPIQH21SxlBjh0",
  authDomain: "web-hadzmi-new.firebaseapp.com",
  databaseURL: "https://web-hadzmi-new-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-hadzmi-new",
  storageBucket: "web-hadzmi-new.firebasestorage.app",
  messagingSenderId: "664176294351",
  appId: "1:664176294351:web:5706e50b47d9cec546baba"
};
const DB_PATH = 'hadzmi_social_data';
const q = new URLSearchParams(location.search);
const DEMO = q.has('demo');
const DEMO_KEY = 'social_demo_v2';
const G_TOKEN = q.get('g') || '', C_TOKEN = q.get('c') || '', G_ID = q.get('id') || '';
const LOCAL_TZ = 'Asia/Jakarta';

const CATS = {
  intro: { label: 'Guest Intro Call Carousel', color: '#30B0C7' },
  announce: { label: 'Webisode Release Date Post', color: '#5856D6' },
  live: { label: 'Webisode is Live Post', color: '#FF2D55' },
  livestory: { label: 'Webisode is Live Story', color: '#FF6B81' },
  summary: { label: 'Webisode Summary Carousel', color: '#FF9500' },
  quote: { label: 'Guest Quotes Post', color: '#AF52DE' },
  news: { label: 'Trending Sustainability News / History', color: '#34C759' }
};
const GUEST_CATS = ['intro', 'announce', 'live', 'livestory', 'summary', 'quote'];
const guestCats = g => GUEST_CATS.filter(k => !(k === 'intro' && g && g.noIntro));
const EPISODE_CATS = ['live', 'livestory', 'summary', 'quote'];
const STAGE_ORDER = ['intro', 'jadwal', 'rekam', 'tayang'];
const STATUS = {
  ide: ['planned', 'Planned'], draft: ['planned', 'Planned'], edit: ['designing', 'In design'], review: ['designing', 'In design'],
  klien: ['review', 'Ready for your review'], revisi: ['revise', 'Revising your feedback'],
  setuju: ['approved', 'Approved'], jadwal: ['scheduled', 'Scheduled'], posted: ['posted', 'Posted']
};
const DONE = ['setuju', 'jadwal', 'posted'];

// ---------- util ----------
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pad = n => String(n).padStart(2, '0');
const IC = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".7" fill="currentColor"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>', photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 15.5-4.8-4.8L7 20"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const EN_D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], EN_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dow(date) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function enDate(date) { if (!date) return ''; const [, m, d] = date.split('-').map(Number); return `${EN_D[dow(date)]}, ${EN_M[m - 1]} ${d}`; }
const fmt12 = t => { const [h, m] = String(t || '00:00').split(':').map(Number); return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
function tzParts(tz, ms) { const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).forEach(x => { o[x.type] = x.value; }); return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` }; }
function tzOffsetMin(tz, ms) { const p = tzParts(tz, ms); const [y, m, d] = p.date.split('-').map(Number), [hh, mm] = p.time.split(':').map(Number); return (Date.UTC(y, m - 1, d, hh, mm) - Math.floor(ms / 60000) * 60000) / 60000; }
function wallToUtc(tz, date, time) { const [y, m, d] = date.split('-').map(Number), [hh, mm] = (time || '00:00').split(':').map(Number); const g = Date.UTC(y, m - 1, d, hh || 0, mm || 0); let u = g - tzOffsetMin(tz, g) * 60000; u = g - tzOffsetMin(tz, u) * 60000; return u; }
function tzAbbr(tz, ms) { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find(x => x.type === 'timeZoneName').value; } catch (e) { return ''; } }
function clientWhen(date, time, tz) {
  if (!date) return '';
  if (!time) return enDate(date);
  const ms = wallToUtc(LOCAL_TZ, date, time), p = tzParts(tz, ms);
  return `${enDate(p.date)} · ${fmt12(p.time)} ${tzAbbr(tz, ms)}`;
}
function ago(ts) { const m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'just now'; if (m < 60) return m + ' minutes ago'; const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago'); const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); }
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

// ---------- data ----------
let D = null, dbRef = null;
const openFb = {};   // kartu yang sedang membuka form feedback
function writePost(id, patch) {
  const p = Object.assign({}, D.posts[id], patch);
  if (DEMO) {
    try { const all = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); all.posts = all.posts || {}; all.posts[id] = p; localStorage.setItem(DEMO_KEY, JSON.stringify(all)); } catch (e) {}
    D.posts[id] = p; render(); return Promise.resolve();
  }
  return dbRef.child('posts/' + id).update(patch);
}
function decide(id, approve, note) {
  const p = D.posts[id]; if (!p) return;
  const now = Date.now();
  const log = (p.log || []).concat(approve
    ? [{ t: now, text: 'Disetujui klien lewat link progress' + (note ? ': ' + note : '') }]
    : [{ t: now, text: 'Klien minta revisi lewat link progress: ' + note }]);
  const patch = approve ? { status: 'jadwal', stAt: now, updatedAt: now, log, clientNote: note || '' } : { status: 'revisi', stAt: now, updatedAt: now, log, clientNote: note };
  return writePost(id, patch).then(() => { delete openFb[id]; toast(approve ? 'Approved. Thank you!' : 'Feedback sent. Thank you!'); }).catch(() => toast('Could not save. Please check your connection and try again.'));
}

// ---------- render ----------
const brandMark = c => c.photo ? `<span class="pg-bphoto"><img src="${c.photo}" alt=""></span>` : `<span class="dot" style="background:${esc(c.color || '#34C759')}"></span>`;
const photo = (g, cls) => `<div class="pg-photo ${cls || ''}" style="${g.photo ? '' : 'background:' + ({ intro: '#30B0C7', jadwal: '#5856D6', rekam: '#FF9500', tayang: '#34C759' }[g.stage] || '#30B0C7')}">${g.photo ? `<img src="${g.photo}" alt="">` : esc(initials(g.name))}</div>`;
function thumb(p) {
  const st = p.type === 'story' ? 'story' : '';
  if (p.thumb) return `<div class="pg-thumb ${st}"><img src="${p.thumb}" alt=""></div>`;
  const g = p.ph ? `background:linear-gradient(135deg,${p.ph[0]},${p.ph[1]})` : `background:linear-gradient(135deg,${(CATS[p.cat] || {}).color || '#C7C7CC'},#C7C7CC)`;
  return `<div class="pg-thumb ${st}" style="${g}">${ic('photo')}</div>`;
}
function guestPosts(g) { return Object.values(D.posts || {}).filter(p => p.guestId === g.id && GUEST_CATS.includes(p.cat)); }
// Progress desain: Designing → Ready for review → Approved → Posted (dari status konten)
const DSTEPS = [['Designing', ['draft', 'edit', 'ide', 'review', 'revisi']], ['Ready for review', ['klien']], ['Approved', ['jadwal', 'setuju']], ['Posted', ['posted']]];
function designCounts(g) { const ps = guestPosts(g); return DSTEPS.map(st => ps.filter(p => st[1].includes(p.status)).length); }
function designSummary(g) {
  const ps = guestPosts(g), cnt = sts => ps.filter(p => sts.includes(p.status)).length;
  const parts = [[cnt(['klien']), 'to review', 'sum-review'], [cnt(['edit', 'review', 'revisi']), 'in design', 'sum-design'], [cnt(['draft', 'ide']), 'planned', 'sum-planned'], [cnt(['jadwal', 'setuju']), 'approved', 'sum-approved'], [cnt(['posted']), 'posted', 'sum-posted']].filter(x => x[0]);
  return parts.length ? parts.map(x => `<b class="${x[2]}">${x[0]} ${x[1]}</b>`).join(' · ') : '<span class="sum-planned">Not started yet</span>';
}
function guestScore(g) { const ps = guestPosts(g); const cats = guestCats(g); const doneCats = cats.filter(k => ps.some(p => p.cat === k && DONE.includes(p.status))).length; return { done: doneCats, total: cats.length, review: ps.filter(p => p.status === 'klien').length }; }
const openCap = {};   // caption yang sedang dibuka
function postCard(p, c) {
  const tz = c.tz || 'America/New_York';
  const [cls, label] = STATUS[p.status] || STATUS.draft;
  const cat = CATS[p.cat] || { label: 'Post', color: '#8E8E93' };
  const when = clientWhen(p.date, p.time, tz);
  const isReview = p.status === 'klien';
  const fb = openFb[p.id];
  const title = p.cat === 'quote' && String(p.title || '').includes(': ') ? '“' + String(p.title).split(': ').slice(1).join(': ') + '”' : (p.cat === 'news' && p.title ? p.title : '');
  const chipIcon = cls === 'posted' ? ic('check') : cls === 'designing' ? ic('pencil') : cls === 'revise' ? ic('alert') : '';
  const acts = [
    p.design ? `<a class="pc-act" href="${esc(p.design)}" target="_blank" rel="noopener">${ic('link')} Canva</a>` : '',
    p.status === 'posted' && p.link ? `<a class="pc-act" href="${esc(p.link)}" target="_blank" rel="noopener">${ic('ig')} Instagram</a>` : '',
    p.caption ? `<button class="pc-act ${openCap[p.id] ? 'on' : ''}" data-act="cap" data-id="${esc(p.id)}">Caption ${openCap[p.id] ? '▴' : '▾'}</button>` : ''
  ].filter(Boolean).join('');
  return `<article class="pg-card tone-${cls} ${isReview ? 'review' : ''}" id="post-${esc(p.id)}">
    <div class="pc-head"><span class="pg-cat" style="color:${cat.color}">${esc(cat.label)}</span><span class="chip ${cls}">${chipIcon}${esc(label)}</span></div>
    ${title ? `<div class="pg-title">${esc(title)}</div>` : ''}
    <div class="pg-when">${when ? (p.status === 'posted' ? 'Posted ' : 'Goes live ') + esc(when) : 'Date to be confirmed'}</div>
    ${acts ? `<div class="pc-acts">${acts}</div>` : ''}
    ${openCap[p.id] && p.caption ? `<p class="pc-caption">${esc(p.caption)}</p>` : ''}
    ${p.status === 'revisi' && p.clientNote ? `<div class="pg-note">Your feedback: <b>${esc(p.clientNote)}</b><br>I'm working on it now.</div>` : ''}
    ${isReview ? (fb ? `<div class="pg-fb"><textarea id="fb-${esc(p.id)}" placeholder="What should I change?">${esc(fb.text || '')}</textarea><div class="pg-actions"><button class="pg-btn" data-act="cancel" data-id="${esc(p.id)}">Cancel</button><button class="pg-btn change" data-act="send" data-id="${esc(p.id)}">Send feedback</button></div></div>`
      : `<div class="pg-actions"><button class="pg-btn approve" data-act="approve" data-id="${esc(p.id)}">${ic('check')} Approve</button><button class="pg-btn change" data-act="change" data-id="${esc(p.id)}">${ic('pencil')} Request changes</button></div>`) : ''}
  </article>`;
}
function missingCard(k, g) {
  const cat = CATS[k];
  const waitEp = EPISODE_CATS.includes(k) && STAGE_ORDER.indexOf(g.stage) < 2;
  return `<article class="pg-card untouched"><div class="pc-head"><span class="pg-cat">${esc(cat.label)}</span><span class="chip waiting">${waitEp ? 'After recording' : 'Not started'}</span></div></article>`;
}
function renderGuest() {
  // Lewat link narasumber (?g=) atau dari link ringkasan (?c=token klien&id=narasumber)
  const viaClient = !G_TOKEN && C_TOKEN && Object.values(D.clients || {}).find(x => x.share && x.share === C_TOKEN);
  const g = G_TOKEN ? Object.values(D.guests || {}).find(x => x.share && x.share === G_TOKEN)
    : (viaClient ? Object.values(D.guests || {}).find(x => x.id === G_ID && (x.clientId === viaClient.id || !x.clientId)) : null);
  if (!g) return `<div class="pg-msg">This progress link is not valid anymore.<br>Please ask for a new link.</div>`;
  const c = (D.clients || {})[g.clientId] || Object.values(D.clients || {})[0] || {};
  const tz = c.tz || 'America/New_York';
  document.title = g.name + ' · Guest Progress';
  const dc = designCounts(g);
  const reached = dc.reduce((m, n, i) => n ? i : m, -1);   // tahap terjauh yang sudah dicapai salah satu desain
  const working = guestPosts(g).some(p => ['edit', 'review', 'revisi'].includes(p.status));
  const step = i => `<div class="pg-step ${dc[i] ? (i === reached ? 'now' : 'done') : (i < reached ? 'pass' : '')}"><i>${dc[i] ? dc[i] : (i < reached ? ic('check') : '')}</i><b>${DSTEPS[i][0]}</b><span>${dc[i] ? dc[i] + (dc[i] > 1 ? ' designs' : ' design') : '&nbsp;'}</span></div>`;
  const barW = reached <= 0 ? 0 : reached * 25;   // titik ada di 12.5%, 37.5%, 62.5%, 87.5%
  const ps = guestPosts(g).sort((a, b) => GUEST_CATS.indexOf(a.cat) - GUEST_CATS.indexOf(b.cat) || ((a.date || '9') + (a.time || '')).localeCompare((b.date || '9') + (b.time || '')));
  const sc = guestScore(g);
  const review = ps.filter(p => p.status === 'klien');
  const cards = guestCats(g).map(k => { const mine = ps.filter(p => p.cat === k); return mine.length ? mine.map(p => postCard(p, c)).join('') : missingCard(k, g); }).join('');
  const last = Math.max(g.at || 0, ...ps.map(p => p.updatedAt || p.stAt || 0));
  return `${viaClient ? `<a class="pg-back" href="?c=${encodeURIComponent(C_TOKEN)}${DEMO ? '&demo=1' : ''}">‹ All guests</a>` : ''}<div class="pg-brand">${brandMark(c)}${esc(c.name || 'Podcast')} · Guest progress</div>
    <section class="pg-hero">${photo(g)}<div class="pg-name">${esc(g.name)}</div>${g.role || g.org ? `<div class="pg-role">${esc([g.role, g.org].filter(Boolean).join(' · '))}</div>` : ''}${g.handle ? `<a class="pg-handle" href="https://instagram.com/${encodeURIComponent(g.handle)}" target="_blank" rel="noopener">@${esc(g.handle)}</a>` : ''}
      ${g.epTitle ? `<div class="pg-role" style="margin-top:6px">🎙️ ${g.epNo ? 'Episode ' + esc(g.epNo) + ' · ' : ''}${esc(g.epTitle)}</div>` : ''}
      <div class="pg-steps four"><span class="bar" style="width:${barW}%"></span>${step(0)}${step(1)}${step(2)}${step(3)}</div></section>
    ${review.length ? `<a class="pg-alert" href="#post-${esc(review[0].id)}">${ic('alert')}<span>${review.length} design${review.length > 1 ? 's' : ''} ready for your review</span></a>` : (sc.done === sc.total ? `<div class="pg-alert ok">${ic('check')}<span>All content for this guest is done</span></div>` : '')}
    <div class="pg-sec"><h2>Content</h2><span>${sc.done} of ${sc.total} ready</span></div>
    <div class="pg-prog"><span style="width:${sc.done / sc.total * 100}%;background:var(--green)"></span></div>
    ${cards}
    <div class="pg-foot">Times shown in ${esc(tzAbbr(tz, Date.now()))} · Updated ${last ? ago(last) : 'recently'}</div>`;
}
function renderOverview() {
  const c = Object.values(D.clients || {}).find(x => x.share && x.share === C_TOKEN);
  if (!c) return `<div class="pg-msg">This progress link is not valid anymore.<br>Please ask for a new link.</div>`;
  document.title = (c.name || 'Podcast') + ' · Guest Progress';
  const stageTxt = { intro: 'Intro call', jadwal: 'Recording scheduled', rekam: 'Recorded', tayang: 'Episode live' };
  const gNo = g => { const n = Number(g.order); if (n) return n; const m = /wb-guest-(\d+)/.exec(g.id || '') || /Nomor dokumen[^0-9]*(\d+)/i.exec(g.notes || ''); return m ? Number(m[1]) : 9999; };
  const gs = Object.values(D.guests || {}).filter(g => g.clientId === c.id).sort((a, b) => gNo(a) - gNo(b) || String(a.name || '').localeCompare(String(b.name || '')));
  // Postingan News tidak terkait narasumber: tampilkan 7 hari terakhir s/d 21 hari ke depan (WIB)
  const tdy = tzParts(LOCAL_TZ, Date.now()).date;
  const addD = (d, n) => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, dd + n)); return t.toISOString().slice(0, 10); };
  const news = Object.values(D.posts || {}).filter(p => p.cat === 'news' && p.clientId === c.id && p.date && p.date >= addD(tdy, -7) && p.date <= addD(tdy, 21))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const newsReview = news.filter(p => p.status === 'klien').length;
  const totalReview = gs.reduce((x, g) => x + guestScore(g).review, 0) + newsReview;
  return `<header class="pg-client">${c.photo ? `<span class="pg-cphoto"><img src="${c.photo}" alt=""></span>` : `<span class="pg-cphoto" style="background:${esc(c.color || '#34C759')}">${esc(initials(c.name))}</span>`}<span><span class="pg-brand" style="margin:0">${esc(c.name || 'Podcast')}</span><h1 class="pg-name" style="font-size:30px">Guest progress</h1></span></header>
    ${totalReview ? `<div class="pg-alert">${ic('alert')}<span>${totalReview} design${totalReview > 1 ? 's' : ''} ready for your review</span></div>` : ''}
    ${gs.length ? gs.map(g => { const sc = guestScore(g); const inner = `${photo(g)}<span class="g"><span class="n">${esc(g.name)}</span><span class="s">${designSummary(g)} · ${sc.done} of ${sc.total} ready</span><span class="pg-prog"><span style="width:${sc.done / sc.total * 100}%;background:var(--green)"></span></span></span>${sc.review ? `<span class="badge-r">${sc.review} to review</span>` : ic('chevR')}`; const href = `?c=${encodeURIComponent(C_TOKEN)}&id=${encodeURIComponent(g.id)}${DEMO ? '&demo=1' : ''}`; return `<a class="pg-guest" href="${href}">${inner}</a>`; }).join('') : '<div class="pg-msg">No guests yet.</div>'}
    <div class="pg-foot">Tap a guest to see each design and approve it.</div>
    <div class="pg-sec" style="margin-top:10px"><h2>${esc(CATS.news.label)}</h2><span>${news.length ? news.filter(p => DONE.includes(p.status)).length + ' of ' + news.length + ' ready' : ''}</span></div>
    ${news.length ? news.map(p => postCard(p, c)).join('') : '<div class="pg-card"><span class="pg-empty">No news posts scheduled for the next few weeks yet.</span></div>'}`;
}
function render() {
  if (!D) return;
  const keepFb = {}; Object.keys(openFb).forEach(id => { const ta = $('fb-' + id); keepFb[id] = { text: ta ? ta.value : (openFb[id].text || '') }; }); Object.assign(openFb, keepFb);
  try { $('root').innerHTML = (G_TOKEN || (C_TOKEN && G_ID)) ? renderGuest() : C_TOKEN ? renderOverview() : '<div class="pg-msg">Missing progress link.</div>'; }
  catch (e) { console.error(e); $('root').innerHTML = `<div class="pg-msg">Something went wrong while loading this page.<br><small>${esc(e && e.message)}</small><br><br><button class="pg-btn link" onclick="location.reload()">Reload</button></div>`; }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  if (act === 'approve') { b.disabled = true; decide(id, true, ''); }
  if (act === 'change') { openFb[id] = { text: '' }; render(); const ta = $('fb-' + id); if (ta) ta.focus(); }
  if (act === 'cancel') { delete openFb[id]; render(); }
  if (act === 'cap') { openCap[id] = !openCap[id]; render(); }
  if (act === 'send') { const ta = $('fb-' + id); const v = ta ? ta.value.trim() : ''; if (!v) { toast('Please write what should change'); return; } b.disabled = true; decide(id, false, v); }
});

function boot() {
  if (DEMO) {
    try { D = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { D = null; }
    if (!D) { $('root').innerHTML = '<div class="pg-msg">Open /social/?demo=1 first to create the sample data.</div>'; return; }
    ['posts', 'guests', 'clients'].forEach(k => { D[k] = D[k] || {}; });
    render(); return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    dbRef = firebase.database().ref(DB_PATH);
    dbRef.on('value', s => { D = s.val() || {}; ['posts', 'guests', 'clients'].forEach(k => { D[k] = D[k] || {}; }); render(); }, () => { $('root').innerHTML = '<div class="pg-msg">Could not load progress right now. Please try again later.</div>'; });
  } catch (e) { $('root').innerHTML = '<div class="pg-msg">Could not load progress right now. Please try again later.</div>'; }
}
boot();
})();
