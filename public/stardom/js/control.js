/* STARDOM — Owner Control Center (population, AI, simulation, engagement, logs) */
import { api, esc, icon, avatar, uname, fmt, timeAgo, S, $, $$, topbar, skeleton, empty, toast, confirmBox, go, aiBadge } from './core.js';

const TABS = [['overview', 'Overview'], ['population', 'Population'], ['ai', 'AI'], ['simulation', 'Simulation'], ['engagement', 'Engagement'], ['logs', 'Logs']];
const F = {
  ai: [
    ['ai_enabled', 'AI responses', 'toggle', 'Turn off to use built-in templates only. The rest of the platform keeps working.'],
    ['ai_vision', 'Let AI look at your photos', 'toggle', 'One small image description per post so comments refer to what is actually in the photo.'],
    ['ai_creativity', 'Conversation creativity', 'range', 'Lower is more predictable, higher is more playful.', 0, 1.6, 0.05],
    ['ai_comment_share', 'AI-written comments on your posts', 'range', 'Share of comments written by AI (the rest use templates).', 0, 1, 0.05, '%'],
    ['ai_bot_share', 'AI-written bot-to-bot comments', 'range', 'Keep low to save AI requests.', 0, 1, 0.01, '%'],
    ['dm_per_day', 'Messages characters may start per day', 'range', 'Characters message you on their own, based on relationship and memories.', 0, 20, 1],
    ['ai_daily_limit', 'Daily AI request limit', 'number', 'Hard cap. When reached, characters fall back to templates.', 0, 20000, 10],
    ['ai_monthly_limit', 'Monthly AI request limit', 'number', 'Spending guard for the month.', 0, 500000, 100],
    ['reply_while_paused', 'Answer DMs while simulation is paused', 'toggle', ''],
    ['boundaries', 'Interaction boundaries', 'text', 'Added to every AI prompt, e.g. topics to avoid or tone to keep.'],
  ],
  simulation: [
    ['intensity', 'Activity intensity', 'range', 'Global multiplier for everything the world does.', 0.1, 3, 0.05, '×'],
    ['daily_action_limit', 'Daily interaction limit', 'number', 'Maximum simulated actions per day across all accounts.', 0, 50000, 50],
    ['per_account_daily_limit', 'Per-account daily limit', 'number', 'Stops any single character from flooding you.', 1, 500, 1],
    ['auto_grow', 'Grow the audience automatically', 'toggle', 'Generates new community accounts when everyone already follows you.'],
    ['max_population', 'Maximum population', 'number', 'Upper bound for virtual accounts.', 50, 50000, 50],
  ],
  engagement: [
    ['like_rate', 'Average like activity', 'range', 'How likely followers are to like a post.', 0, 3, 0.05, '×'],
    ['comment_rate', 'Comment frequency', 'range', '', 0, 3, 0.05, '×'],
    ['follower_growth', 'Follower growth rate', 'range', 'Baseline ≈ 18 new followers per day at 1×, more after you post.', 0, 5, 0.05, '×'],
    ['viral_probability', 'Viral moment probability', 'range', 'Chance a new post breaks out to non-followers.', 0, 0.5, 0.01, '%'],
    ['bot_interaction', 'Bot-to-bot interaction', 'range', 'How lively the rest of the network is.', 0, 3, 0.05, '×'],
    ['story_reply_rate', 'Story reply frequency', 'range', '', 0, 3, 0.05, '×'],
  ],
};
const showVal = (v, unit) => unit === '%' ? Math.round(v * 100) + '%' : unit === '×' ? (+v).toFixed(2).replace(/0$/, '') + '×' : String(v);

function fieldsHtml(list, s) {
  return list.map(([k, label, type, help, min, max, step, unit]) => {
    const v = s[k];
    if (type === 'toggle') return `<label class="tg"><span>${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</span><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}><i></i></label>`;
    if (type === 'range') return `<label class="rg"><span><b>${esc(label)}</b><output>${showVal(v, unit)}</output></span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}" data-unit="${unit || ''}">${help ? `<small>${esc(help)}</small>` : ''}</label>`;
    if (type === 'number') return `<label class="fl">${esc(label)}<input type="number" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}" inputmode="numeric">${help ? `<small>${esc(help)}</small>` : ''}</label>`;
    return `<label class="fl">${esc(label)}<textarea data-k="${k}" rows="3" maxlength="600">${esc(v || '')}</textarea>${help ? `<small>${esc(help)}</small>` : ''}</label>`;
  }).join('');
}
function bindFields(root) {
  root.addEventListener('input', e => { const r = e.target.closest('input[type=range]'); if (r) r.parentElement.querySelector('output').textContent = showVal(r.value, r.dataset.unit); });
  root.addEventListener('change', async e => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    try { await api('/admin/settings', { method: 'PATCH', body: { [el.dataset.k]: v } }); toast('Saved'); } catch (er) { toast(er.message, 'err'); }
  });
}

export function controlView(view, params, query) {
  let tab = query.get('tab') || 'overview';
  view.innerHTML = topbar({ title: 'Control Center', back: true }) + `<div class="chips sticky">${TABS.map(([k, l]) => `<button class="chip ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="cc"></div>`;
  const box = $('.cc', view);
  const show = async t => {
    tab = t; $$('[data-tab]', view).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    history.replaceState(null, '', '#/control?tab=' + t);
    box.innerHTML = skeleton(2);
    try { await R[t](box); } catch (e) { box.innerHTML = empty('sliders', 'Could not load', e.message); }
  };
  view.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  show(tab);
}

const R = {};
R.overview = async box => {
  const o = await api('/admin/overview');
  const c = o.counts, statusTxt = { healthy: 'Running', idle: 'Waiting for next tick', paused: 'Paused' }[o.status];
  box.innerHTML = `<div class="card sim-state ${o.status}"><div><span class="pulse"></span><b>${statusTxt}</b><small>${o.sim.last_tick ? 'Last activity ' + timeAgo(o.sim.last_tick, true) : 'No ticks yet'} · ${fmt(o.sim.actions_today)} / ${fmt(o.sim.daily_limit)} actions today</small></div>
      <button class="btn ${o.sim.running ? '' : 'primary'}" data-sim="${o.sim.running ? 'pause' : 'resume'}">${o.sim.running ? 'Pause' : 'Start'}</button></div>
    <div class="kpis">
      <div class="kpi"><span>Virtual accounts</span><b>${fmt(c.total)}</b><small>${fmt(c.active)} active · ${fmt(c.inactive)} inactive · ${fmt(c.blocked)} blocked</small></div>
      <div class="kpi"><span>Online now</span><b>${fmt(c.online)}</b><small>active in the last hour</small></div>
      <div class="kpi"><span>Your followers</span><b>${fmt(o.owner_followers)}</b><small>simulated</small></div>
      <div class="kpi"><span>Interactions today</span><b>${fmt((o.today.likes || 0) + (o.today.comments || 0) + (o.today.follows || 0))}</b><small>${fmt(o.today.likes || 0)} likes · ${fmt(o.today.comments || 0)} comments</small></div>
      <div class="kpi"><span>Posts</span><b>${fmt(c.posts)}</b><small>${fmt(c.owner_posts)} by you</small></div>
      <div class="kpi"><span>AI requests</span><b>${fmt(o.ai.today)}</b><small>today · ${fmt(o.ai.month)} this month (limit ${fmt(o.ai.daily_limit)}/day)</small></div>
      <div class="kpi"><span>Pending events</span><b>${fmt(c.pending)}</b><small>${fmt(c.failed24)} failed in 24h</small></div>
      <div class="kpi"><span>Memories</span><b>${fmt(c.memories)}</b><small>stored character memories</small></div>
    </div>
    <div class="card ai-state">${icon('sparkle')}<div><b>AI engine: ${!o.ai.key ? 'not configured' : !o.ai.enabled ? 'disabled' : o.ai.available ? 'ready' : 'limit reached'}</b><small>${!o.ai.key ? 'Add GEMINI_API_KEY in Cloudflare to enable contextual comments and conversations. Templates are used meanwhile.' : 'Gemini is used for comments, DMs, story replies and memory summaries only. Likes, views and follows never call AI.'}</small></div></div>
    <div class="quick"><a class="btn" href="#/control?tab=population">${icon('users', 'sm')} Generate accounts</a><a class="btn" href="#/insights">${icon('chart', 'sm')} Insights</a><a class="btn" href="#/directory">${icon('star', 'sm')} Directory</a></div>`;
  box.onclick = async e => { const b = e.target.closest('[data-sim]'); if (b) { await api('/admin/sim', { method: 'POST', body: { action: b.dataset.sim } }); S.simRunning = b.dataset.sim !== 'pause'; toast(b.dataset.sim === 'pause' ? 'Simulation paused' : 'Simulation running'); R.overview(box); } };
};

R.population = async box => {
  const st = await api('/admin/settings');
  box.innerHTML = `<section class="card"><div class="ch-t">Generate accounts</div><div class="form grid2">
      <label class="fl">How many<input type="number" id="g-n" value="20" min="1" max="500"></label>
      <label class="fl">Country<select id="g-c"><option value="">Any</option>${(S.meta.countries || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="fl">Industry<select id="g-i"><option value="">Any</option>${(S.meta.industries || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="fl">Personality<select id="g-p"><option value="">Mixed</option>${st.archetypes.map(a => `<option>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="fl">Fame<select id="g-t"><option value="">Mixed</option><option value="megastar">Megastar</option><option value="star">Star</option><option value="rising">Rising</option><option value="fan">Community / fan</option></select></label>
      <label class="fl">Activity level<select id="g-a"><option value="">Natural mix</option><option value="0.2">Low</option><option value="0.5">Medium</option><option value="0.85">High</option></select></label>
      <label class="fl">Chance they follow you<select id="g-f"><option value="0.35">35%</option><option value="0">0%</option><option value="0.7">70%</option><option value="1">100%</option></select></label>
    </div><button class="btn primary block" id="g-go">${icon('sparkle', 'sm')} Generate</button><div class="note">All generated personas are fictional. Public figures get a few posts right away.</div><div class="g-res"></div></section>
    <section class="card"><div class="ch-t">Accounts</div><div class="row-f"><div class="search-box">${icon('search', 'sm')}<input id="a-q" placeholder="Search accounts"></div><select id="a-s"><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option></select></div><div class="a-list">${skeleton(2)}</div><div class="ul-more"></div></section>
    <section class="card"><div class="ch-t">Import / export</div><textarea id="imp" rows="4" placeholder='[{"username":"nova.sky","display_name":"Nova Sky","country":"Japan","industry":"Music","archetype":"Witty Joker","bio":"…","interests":["music","anime"]}]'></textarea><div class="row-b"><button class="btn" id="imp-go">Import JSON</button><button class="btn" id="exp-go">Export configurations</button></div></section>`;
  let offset = 0;
  const loadAcc = async reset => {
    if (reset) offset = 0;
    const r = await api(`/admin/accounts?q=${encodeURIComponent($('#a-q', box).value)}&status=${$('#a-s', box).value}&offset=${offset}`);
    const html = r.accounts.map(a => `<a class="urow" href="#/control/account/${a.id}">${avatar(a, 40)}<div class="urow-m">${uname(a, { link: false })}<span>${esc(a.occupation)} · ${esc(a.country)} · ${esc(a.archetype || '')}</span></div><span class="st st-${a.status}">${a.status}</span></a>`).join('');
    if (reset) $('.a-list', box).innerHTML = `<div class="note">${fmt(r.total)} virtual accounts</div>` + html; else $('.a-list', box).insertAdjacentHTML('beforeend', html);
    offset = r.next; $('.ul-more', box).innerHTML = r.next ? '<button class="btn block ghost" data-more>Load more</button>' : '';
  };
  let t; $('#a-q', box).oninput = () => { clearTimeout(t); t = setTimeout(() => loadAcc(true), 250); };
  $('#a-s', box).onchange = () => loadAcc(true);
  box.onclick = async e => {
    if (e.target.closest('[data-more]')) loadAcc(false);
    if (e.target.closest('#g-go')) {
      const b = e.target.closest('#g-go'); b.disabled = true;
      try {
        const r = await api('/admin/generate', { method: 'POST', body: { count: +$('#g-n', box).value, country: $('#g-c', box).value, industry: $('#g-i', box).value, personality: $('#g-p', box).value, tier: $('#g-t', box).value, activity: $('#g-a', box).value, follow_owner: +$('#g-f', box).value } });
        $('.g-res', box).innerHTML = `<div class="note ok">Created ${r.created} account${r.created > 1 ? 's' : ''}.</div><div class="sugs mini">${r.accounts.slice(0, 12).map(a => `<a class="dm-sug" href="#/u/${encodeURIComponent(a.username)}">${avatar(a, 52)}<span>${esc(a.username)}</span></a>`).join('')}</div>`;
        loadAcc(true);
      } catch (er) { toast(er.message, 'err'); }
      b.disabled = false;
    }
    if (e.target.closest('#imp-go')) {
      let list; try { list = JSON.parse($('#imp', box).value); } catch (er) { return toast('Invalid JSON', 'err'); }
      try { const r = await api('/admin/import', { method: 'POST', body: { accounts: Array.isArray(list) ? list : list.accounts } }); toast(`Imported ${r.created} accounts`); loadAcc(true); } catch (er) { toast(er.message, 'err'); }
    }
    if (e.target.closest('#exp-go')) {
      const r = await api('/admin/export');
      const blob = new Blob([JSON.stringify(r.accounts, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stardom-personas.json'; a.click();
    }
  };
  loadAcc(true);
};

R.ai = async box => {
  const r = await api('/admin/settings');
  box.innerHTML = `<section class="card form">${fieldsHtml(F.ai, r.settings)}</section>
    <section class="card"><div class="ch-t">Personality presets</div><div class="presets">${r.archetypes.map(a => `<div class="preset"><b>${esc(a.name)}</b>${a.builtin ? '' : '<span class="aib">custom</span>'}<small>${esc(a.config.tone)}</small><small class="muted">${esc((a.config.traits || []).join(' · '))}</small></div>`).join('')}</div>
    <details class="new-preset"><summary>Create a preset</summary><div class="form"><label class="fl">Name<input id="pr-n" maxlength="40"></label><label class="fl">Based on<select id="pr-b">${r.archetypes.filter(a => a.builtin).map(a => `<option>${esc(a.name)}</option>`).join('')}</select></label><label class="fl">Tone<input id="pr-t" maxlength="200" placeholder="e.g. nerdy, kind, loves puns"></label><label class="fl">Traits (comma separated)<input id="pr-tr" maxlength="200"></label><button class="btn primary" id="pr-go">Save preset</button></div></details></section>`;
  bindFields(box);
  $('#pr-go', box).onclick = async () => {
    await api('/admin/settings', { method: 'PATCH', body: { preset: { name: $('#pr-n', box).value, base: $('#pr-b', box).value, tone: $('#pr-t', box).value, traits: $('#pr-tr', box).value.split(',').map(s => s.trim()).filter(Boolean) } } }).catch(e => toast(e.message, 'err'));
    toast('Preset saved'); R.ai(box);
  };
};

R.simulation = async box => {
  const [r, ev] = await Promise.all([api('/admin/settings'), api('/admin/events')]);
  const s = r.settings;
  box.innerHTML = `<section class="card"><div class="ch-t">Controls</div><div class="row-b wrap">
      <button class="btn ${s.sim_running ? '' : 'primary'}" data-sim="${s.sim_running ? 'pause' : 'resume'}">${icon(s.sim_running ? 'pause' : 'play', 'sm')} ${s.sim_running ? 'Pause' : 'Start / resume'}</button>
      <button class="btn" data-sim="run_now">${icon('refresh', 'sm')} Run a tick now</button>
      <button class="btn" data-sim="clear_queue">Clear event queue</button>
      <button class="btn" data-sim="reset_settings">Reset settings</button>
      <button class="btn danger-t" data-sim="reset_world">Reset world…</button></div>
      <div class="note">The simulation runs on the server (Cloudflare Durable Object alarm), so activity continues while Safari is closed. Pausing stops all new activity; queued activity is shifted forward on resume so nothing bursts.</div></section>
    <section class="card form">${fieldsHtml(F.simulation, s)}
      <div class="fl">Peak hours (WIB)<div class="hours">${Array.from({ length: 24 }, (_, h) => `<button class="${(s.peak_hours || []).includes(h) ? 'on' : ''}" data-h="${h}">${String(h).padStart(2, '0')}</button>`).join('')}</div><small>Activity is boosted during these hours on top of the natural daily rhythm.</small></div>
      <label class="fl">Timezone<select id="tz">${[[420, 'Asia/Jakarta (GMT+7)'], [480, 'GMT+8 (Kuala Lumpur, Singapore)'], [540, 'GMT+9 (Tokyo, Seoul)'], [0, 'UTC'], [60, 'GMT+1 (Europe)'], [-300, 'GMT−5 (New York)'], [-480, 'GMT−8 (Los Angeles)']].map(([v, l]) => `<option value="${v}" ${+s.timezone_offset_min === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></section>
    <section class="card"><div class="ch-t">Event queue</div><div class="chips">${ev.by_type.map(t => `<span class="chip">${esc(t.type)} <small>${t.n}</small></span>`).join('') || '<span class="note">Queue is empty.</span>'}</div>
      <div class="seg small"><button class="on" data-q="pending">Pending</button><button data-q="done">Done</button><button data-q="failed">Failed</button><button data-q="skipped">Skipped</button></div><div class="evs"></div></section>`;
  bindFields(box);
  const evs = async st => {
    $$('[data-q]', box).forEach(b => b.classList.toggle('on', b.dataset.q === st));
    const r2 = st === 'pending' ? ev : await api('/admin/events?status=' + st);
    $('.evs', box).innerHTML = r2.events.length ? `<table class="evt"><tbody>${r2.events.map(e => `<tr><td><b>${esc(e.type)}</b>${e.remaining != null ? ` <small>${e.remaining} left</small>` : ''}</td><td>${e.actor ? esc(e.actor.username) : ''}</td><td>${e.status === 'pending' ? 'in ' + timeAgo(Date.now() - (e.due_at - Date.now())) : timeAgo(e.done_at || e.due_at) + ' ago'}</td><td class="muted">${esc(e.error || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="note">Nothing here.</div>';
  };
  box.onclick = async e => {
    const sim = e.target.closest('[data-sim]'), h = e.target.closest('[data-h]'), q = e.target.closest('[data-q]');
    if (q) evs(q.dataset.q);
    if (h) { h.classList.toggle('on'); await api('/admin/settings', { method: 'PATCH', body: { peak_hours: $$('[data-h].on', box).map(b => +b.dataset.h) } }); toast('Peak hours saved'); }
    if (sim) {
      const a = sim.dataset.sim; let body = { action: a };
      if (a === 'reset_world') {
        const c = prompt('This deletes every virtual account, their posts, likes, comments and conversations, then creates a fresh population. Your own posts stay. Type RESET to confirm.');
        if (c !== 'RESET') return; body.confirm = 'RESET';
      } else if (a === 'clear_queue' && !await confirmBox('Clear the event queue?', 'All scheduled likes, comments and replies that have not happened yet will be dropped.', 'Clear', true)) return;
      sim.disabled = true;
      try { await api('/admin/sim', { method: 'POST', body }); toast('Done'); } catch (er) { toast(er.message, 'err'); }
      R.simulation(box);
    }
  };
  $('#tz', box).onchange = async e => { await api('/admin/settings', { method: 'PATCH', body: { timezone_offset_min: +e.target.value } }); toast('Timezone saved'); };
  evs('pending');
};

R.engagement = async box => {
  const r = await api('/admin/settings');
  box.innerHTML = `<div class="banner">${icon('sliders', 'sm')} These settings change how the simulation behaves. Counts always come from stored interactions; nothing is faked on screen.</div><section class="card form">${fieldsHtml(F.engagement, r.settings)}</section>`;
  bindFields(box);
};

R.logs = async box => {
  const r = await api('/admin/logs');
  const t = (rows, cols) => rows.length ? `<table class="evt"><tbody>${rows.map(x => `<tr>${cols.map(c => `<td>${c(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="note">Empty.</div>';
  box.innerHTML = `<section class="card"><div class="ch-t">Background jobs</div>${t(r.jobs, [x => timeAgo(x.started_at) + ' ago', x => `${x.processed} processed`, x => x.failed ? `<b class="danger-t">${x.failed} failed</b>` : '', x => esc(x.note || '') + ` <span class="muted">${x.ms}ms</span>`])}</section>
    <section class="card"><div class="ch-t">AI requests</div>${t(r.ai, [x => timeAgo(x.created_at) + ' ago', x => esc(x.task), x => x.cached ? 'cache' : esc(x.model || '—'), x => x.ok ? `${x.tokens_in}→${x.tokens_out} tok · ${x.ms}ms` : `<span class="danger-t">${esc(x.error || 'failed')}</span>`])}</section>
    <section class="card"><div class="ch-t">System</div>${t(r.system, [x => timeAgo(x.created_at) + ' ago', x => esc(x.level), x => esc(x.message)])}</section>
    <section class="card"><div class="ch-t">Moderation</div>${t(r.moderation, [x => timeAgo(x.created_at) + ' ago', x => esc(x.action), x => esc(x.detail || '')])}</section>`;
};

// ---------- Single account management ----------
export async function accountAdminView(view, [id]) {
  view.innerHTML = topbar({ title: 'Manage character', back: true }) + `<div class="cc">${skeleton(2)}</div>`;
  const box = $('.cc', view);
  const render = r => {
    const a = r.account, p = r.personality;
    const slider = (k, l) => `<label class="rg"><span><b>${l}</b><output>${Math.round(p[k] * 10)}/10</output></span><input type="range" min="0" max="1" step="0.05" value="${p[k]}" data-p="${k}"></label>`;
    box.innerHTML = `<section class="card acc-h">${avatar(a, 64)}<div>${uname(a)}<div>${esc(a.display_name)} · ${esc(a.occupation)}</div><small class="muted">${esc(a.city)}, ${esc(a.country)} · ${fmt(a.followers)} followers · ${r.ai_calls} AI requests</small></div></section>
      <section class="card"><div class="ch-t">Status</div><div class="seg">${['active', 'inactive', 'blocked'].map(s => `<button class="${a.status === s ? 'on' : ''}" data-status="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
        <label class="rg"><span><b>Activity level</b><output>${Math.round(a.activity_level * 100)}%</output></span><input type="range" min="0.05" max="1" step="0.05" value="${a.activity_level}" data-a="activity_level"></label></section>
      <section class="card form"><div class="ch-t">Personality</div>
        <label class="fl">Preset<select data-p="archetype">${(S.meta.archetypes || []).map(x => `<option ${x === p.archetype ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="fl">Description<textarea rows="3" data-p="description">${esc(p.description)}</textarea></label>
        <label class="fl">Tone<input data-p="tone" value="${esc(p.tone)}"></label>
        <label class="fl">Writing style<input data-p="style" value="${esc(p.style)}"></label>
        <label class="fl">Interests (comma separated)<input data-p="interests" value="${esc(p.interests.join(', '))}"></label>
        <label class="fl">Language<select data-p="language">${[['en', 'English'], ['id', 'Indonesian'], ['ms', 'Malay'], ['ko', 'English, Korean-inspired']].map(([v, l]) => `<option value="${v}" ${a.language === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${slider('humor', 'Humour')}${slider('friendliness', 'Friendliness')}${slider('confidence', 'Social confidence')}${slider('emoji_rate', 'Emoji use')}${slider('initiation', 'Starts conversations')}
        <label class="fl">Boundaries<textarea rows="2" data-p="boundaries">${esc(p.boundaries)}</textarea></label></section>
      <section class="card"><div class="ch-t">Memory <button class="txt-btn danger-t" data-reset-mem>Reset memory</button></div>
        ${r.summary ? `<div class="mem-sum"><b>Conversation summary</b><p>${esc(r.summary.summary)}</p></div>` : ''}
        ${r.memories.map(m => `<div class="mem"><span class="aib">${esc(m.kind)}</span><span>${esc(m.content)}</span><small>${Math.round(m.importance * 10)}/10</small><button class="ib" data-del-mem="${m.id}" aria-label="Delete memory">${icon('trash', 'sm')}</button></div>`).join('') || '<div class="note">No memories yet. Characters learn from your conversations.</div>'}
        <div class="row-f"><input id="mem-new" placeholder="Add a memory, e.g. Owner loves sushi"><button class="btn" data-add-mem>Add</button></div></section>
      <section class="card"><div class="ch-t">Relationships</div>${r.relationships.map(x => `<div class="urow">${avatar(x.account, 36)}<div class="urow-m">${x.account && x.account.is_owner ? '<b>You</b>' : uname(x.account)}<span>${esc(x.type.replace('_', ' '))} · strength ${x.strength}</span></div></div>`).join('') || '<div class="note">No relationships yet.</div>'}</section>
      <section class="card"><div class="ch-t">Recent activity</div>${r.activity.map(x => `<div class="act-r"><b>${esc(x.verb)}</b><span class="muted">${timeAgo(x.created_at)} ago</span></div>`).join('') || '<div class="note">No activity yet.</div>'}</section>
      <button class="btn block danger-t" data-delete>Delete this account</button>`;
  };
  let r = await api('/admin/accounts/' + id).catch(e => { box.innerHTML = empty('user', 'Not found', e.message); return null; });
  if (!r) return;
  render(r);
  box.addEventListener('input', e => { const s = e.target.closest('input[type=range]'); if (s) s.parentElement.querySelector('output').textContent = s.dataset.a ? Math.round(s.value * 100) + '%' : Math.round(s.value * 10) + '/10'; });
  box.addEventListener('change', async e => {
    const el = e.target;
    let body = null;
    if (el.dataset.a) body = { activity_level: +el.value };
    if (el.dataset.p) { const k = el.dataset.p; let v = el.type === 'range' ? +el.value : el.value; if (k === 'interests') v = v.split(',').map(s => s.trim()).filter(Boolean); body = { personality: { [k]: v } }; }
    if (!body) return;
    try { r = await api('/admin/accounts/' + id, { method: 'PATCH', body }); toast('Saved'); if (el.dataset.p === 'archetype') render(r); } catch (er) { toast(er.message, 'err'); }
  });
  box.addEventListener('click', async e => {
    const st = e.target.closest('[data-status]');
    if (st) { r = await api('/admin/accounts/' + id, { method: 'PATCH', body: { status: st.dataset.status } }); render(r); toast('Status: ' + st.dataset.status); }
    const dm = e.target.closest('[data-del-mem]');
    if (dm) { await api('/admin/memory/' + dm.dataset.delMem, { method: 'DELETE' }); r = await api('/admin/accounts/' + id); render(r); }
    if (e.target.closest('[data-add-mem]')) { const v = $('#mem-new', box).value.trim(); if (v) { r = await api(`/admin/accounts/${id}/memory`, { method: 'POST', body: { content: v } }); render(r); } }
    if (e.target.closest('[data-reset-mem]') && await confirmBox('Reset memory?', 'The character forgets everything it learned from your conversations.', 'Reset', true)) { await api(`/admin/accounts/${id}/memory`, { method: 'DELETE' }); r = await api('/admin/accounts/' + id); render(r); toast('Memory reset'); }
    if (e.target.closest('[data-delete]') && await confirmBox('Delete account?', 'Their posts, likes, comments, messages and memories are removed and all counts are recalculated.', 'Delete', true)) { await api('/admin/accounts/' + id, { method: 'DELETE' }); toast('Account deleted'); go('#/control?tab=population'); }
  });
}
