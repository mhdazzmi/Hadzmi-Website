/* STARDOM — Direct Messages (inbox + chat) */
import { api, upload, esc, icon, avatar, uname, timeAgo, clock, activeLabel, S, $, $$, topbar, skeleton, empty, toast, go, setBadge, aiBadge, verifiedBadge, haptic, dateLabel } from './core.js';
import { processImage } from './create.js';

export function inboxView(view) {
  view.innerHTML = topbar({ title: `<b>${esc(S.owner.username)}</b>`, back: true, right: `<a class="ib" href="#/explore" aria-label="New message">${icon('edit')}</a>` }) +
    `<div class="pad"><div class="search-box">${icon('search', 'sm')}<input id="dmq" placeholder="Search"></div></div><div class="dm-sugs"></div><div class="sec-h pad">Messages</div><div class="dm-list">${skeleton(3)}</div>`;
  let q = '', t;
  async function load() {
    const r = await api('/conversations' + (q ? '?q=' + encodeURIComponent(q) : '')).catch(e => ({ conversations: [], suggestions: [], error: e.message }));
    $('.dm-sugs', view).innerHTML = !q && r.suggestions.length ? `<div class="sugs mini">${r.suggestions.map(a => `<button class="dm-sug" data-act="message" data-id="${a.id}">${avatar(a, 60)}${Date.now() - a.last_active < 6 * 60000 ? '<i class="online"></i>' : ''}<span>${esc(a.display_name.split(' ')[0])}</span></button>`).join('')}</div>` : '';
    $('.dm-list', view).innerHTML = r.conversations.map(c => `<a class="dm-row ${c.unread ? 'unread' : ''}" href="#/dm/${c.id}">
      <span class="dm-av">${avatar(c.peer, 56)}${Date.now() - c.peer.last_active < 6 * 60000 ? '<i class="online"></i>' : ''}</span>
      <div class="dm-m"><div class="dm-n">${esc(c.peer.display_name)} ${c.peer.verified ? verifiedBadge() : ''} ${aiBadge()}</div>
      <div class="dm-p">${c.typing ? '<i>typing…</i>' : `${esc(c.preview)} · ${timeAgo(c.last_message_at)}`}</div></div>${c.unread ? '<i class="udot"></i>' : icon('camera', 'muted')}</a>`).join('')
      || empty('send', 'No messages yet', 'Start a conversation with someone you follow.');
  }
  $('#dmq', view).oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  load();
  const iv = setInterval(() => { if (!view.isConnected) return clearInterval(iv); if (!document.hidden) load(); }, 8000);
  return () => clearInterval(iv);
}

const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];
export function chatView(view, [id]) {
  view.classList.add('chat-view');
  view.innerHTML = `<header class="topbar chat-h"><button class="ib" data-act="back">${icon('back')}</button><a class="chat-who" href="#/dm"></a><div class="tb-r"></div></header>
    <div class="chat"><div class="msgs"></div><div class="typing hidden"><span class="dots"><i></i><i></i><i></i></span></div></div>
    <form class="composer"><button type="button" class="ib cam" aria-label="Send photo">${icon('image')}</button><input placeholder="Message…" maxlength="2000" enterkeyhint="send"><button class="txt-btn" type="submit" disabled>Send</button><input type="file" accept="image/*" hidden></form>`;
  const msgsEl = $('.msgs', view), form = $('.composer', view), input = $('input[placeholder]', form), sendBtn = $('button[type=submit]', form), file = $('input[type=file]', form);
  let last = 0, peerRead = 0, messages = [], conv = null, stop = false;
  const near = () => window.innerHeight + window.scrollY > document.body.scrollHeight - 160;
  const scrollEnd = smooth => window.scrollTo({ top: document.body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  function bubble(m, prev, next) {
    const gap = !prev || m.created_at - prev.created_at > 20 * 60000;
    const grouped = next && next.mine === m.mine && next.created_at - m.created_at < 60000;
    const rx = m.reactions.length ? `<span class="rx">${m.reactions.map(r => r.emoji).join('')}</span>` : '';
    let inner;
    if (m.kind === 'image') inner = `<img class="b-img" src="${esc(m.media_url)}" alt="">${m.text ? `<div class="b-t">${esc(m.text)}</div>` : ''}`;
    else if (m.kind === 'post_share') inner = m.post && !m.post.deleted ? `<a class="b-post" href="#/p/${m.post.id}"><div class="bp-h">${avatar(m.post.author, 22)}<b>${esc(m.post.author.username)}</b></div><img src="${esc(m.post.media[0] && (m.post.media[0].thumb || m.post.media[0].url))}" alt=""><div class="bp-c">${esc((m.post.caption || '').slice(0, 80))}</div></a>${m.text ? `<div class="b-t">${esc(m.text)}</div>` : ''}` : '<div class="b-t muted">Post unavailable</div>';
    else if (m.kind === 'story_reply') inner = `<div class="b-story"><span>${m.mine ? 'You replied to their story' : 'Replied to your story'}</span>${m.story_thumb ? `<img src="${esc(m.story_thumb)}" alt="">` : ''}</div><div class="b-t">${esc(m.text)}</div>`;
    else inner = `<div class="b-t">${esc(m.text)}</div>`;
    const emojiOnly = m.kind === 'text' && /^\p{Extended_Pictographic}{1,3}$/u.test(m.text.replace(/\s|️/g, ''));
    return `${gap ? `<div class="m-time">${new Date(m.created_at).toDateString() === new Date().toDateString() ? clock(m.created_at) : dateLabel(m.created_at) + ' ' + clock(m.created_at)}</div>` : ''}
      <div class="m ${m.mine ? 'me' : 'them'} ${grouped ? 'grp' : ''} ${emojiOnly ? 'emoji' : ''} ${m.kind}" data-mid="${m.id}">${!m.mine && !grouped ? avatar(conv.peer, 28) : '<span class="m-sp"></span>'}<div class="b">${inner}${rx}</div></div>`;
  }
  function render(keepPos) {
    const wasNear = near();
    msgsEl.innerHTML = messages.map((m, i) => bubble(m, messages[i - 1], messages[i + 1])).join('');
    const lastMine = [...messages].reverse().find(m => m.mine);
    if (lastMine && messages[messages.length - 1] === lastMine) msgsEl.insertAdjacentHTML('beforeend', `<div class="seen">${peerRead >= lastMine.created_at ? 'Seen' : 'Sent'}</div>`);
    if (!keepPos || wasNear) scrollEnd(keepPos);
  }
  async function load(first) {
    const r = await api(`/conversations/${id}${!first && last ? '?after=' + last : ''}`).catch(e => { if (first) msgsEl.innerHTML = empty('send', 'Conversation not found', e.message); return null; });
    if (!r) return;
    conv = r.conversation;
    if (first) {
      const p = conv.peer;
      $('.chat-who', view).outerHTML = `<a class="chat-who" href="#/u/${encodeURIComponent(p.username)}">${avatar(p, 32)}<div><b>${esc(p.display_name)} ${p.verified ? verifiedBadge() : ''}${aiBadge()}</b><span class="act">${esc(activeLabel(p.last_active) || p.occupation || '')}</span></div></a>`;
      messages = r.messages;
      if (!messages.length) msgsEl.innerHTML = `<div class="chat-intro">${avatar(p, 88)}<b>${esc(p.display_name)}</b><span>${esc(p.username)} · ${esc(p.occupation || '')}</span><span class="persona-note small">${icon('sparkle', 'sm')} Simulated AI persona. Replies are generated and remembered only inside STARDOM.</span><a class="btn sm" href="#/u/${encodeURIComponent(p.username)}">View profile</a></div>`;
    } else if (r.messages.length) {
      const ids = new Set(messages.map(m => m.id));
      for (const m of r.messages) if (!ids.has(m.id)) messages.push(m);
      if (r.messages.some(m => !m.mine)) haptic(6);
    }
    const changed = first || r.messages.length || peerRead !== conv.peer_read_at;
    peerRead = conv.peer_read_at || 0;
    if (messages.length) last = Math.max(...messages.map(m => m.created_at));
    if (changed && messages.length) render(!first);
    $('.typing', view).classList.toggle('hidden', !conv.typing);
    if (conv.typing && near()) scrollEnd(true);
    $('.act', view) && ($('.act', view).textContent = conv.typing ? 'typing…' : activeLabel(conv.peer.last_active) || conv.peer.occupation || '');
  }
  // reactions on long-press / double-click
  let pressT;
  const openRx = el => {
    const mid = el.dataset.mid;
    $$('.rx-pick').forEach(x => x.parentNode.removeChild(x));
    el.insertAdjacentHTML('afterbegin', `<div class="rx-pick">${REACTIONS.map(r => `<button data-rx="${r}">${r}</button>`).join('')}</div>`);
    haptic(10);
    setTimeout(() => document.addEventListener('click', function off(e) { if (!e.target.closest('.rx-pick')) { $$('.rx-pick').forEach(x => x.parentNode.removeChild(x)); document.removeEventListener('click', off, true); } }, true), 0);
    el.dataset.rxFor = mid;
  };
  msgsEl.addEventListener('pointerdown', e => { const m = e.target.closest('.m'); if (!m) return; pressT = setTimeout(() => openRx(m), 450); });
  msgsEl.addEventListener('pointerup', () => clearTimeout(pressT));
  msgsEl.addEventListener('pointerleave', () => clearTimeout(pressT));
  msgsEl.addEventListener('dblclick', e => { const m = e.target.closest('.m'); if (m) openRx(m); });
  msgsEl.addEventListener('contextmenu', e => { if (e.target.closest('.m')) e.preventDefault(); });
  msgsEl.addEventListener('click', async e => {
    const b = e.target.closest('[data-rx]'); if (!b) return;
    const m = messages.find(x => x.id === b.closest('.m').dataset.mid);
    const mine = m.reactions.find(r => r.by === 'me');
    m.reactions = m.reactions.filter(r => r.by !== 'me');
    if (!mine || mine.emoji !== b.dataset.rx) m.reactions.push({ emoji: b.dataset.rx, by: 'me' });
    render(true);
    await api(`/messages/${m.id}/react`, { method: 'POST', body: { emoji: b.dataset.rx } }).catch(er => toast(er.message, 'err'));
  });
  input.oninput = () => { sendBtn.disabled = !input.value.trim(); };
  async function send(payload) {
    const tmp = { id: 'tmp' + Date.now(), mine: true, kind: payload.media_url ? 'image' : 'text', text: payload.text || '', media_url: payload.media_url, created_at: Date.now(), reactions: [] };
    if (!messages.length) msgsEl.innerHTML = '';
    messages.push(tmp); render(true);
    try { const r = await api(`/conversations/${id}/messages`, { method: 'POST', body: payload }); Object.assign(tmp, r.message); last = Math.max(last, r.message.created_at); render(true); setTimeout(() => load(false), 1500); }
    catch (er) { messages = messages.filter(m => m !== tmp); render(true); toast(er.message, 'err'); }
  }
  form.onsubmit = e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; sendBtn.disabled = true; send({ text: t }); };
  $('.cam', form).onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try { const img = await processImage(f); toast('Sending photo…'); const up = await upload(img.blob); send({ media_url: up.url, text: '' }); } catch (er) { toast(er.message, 'err'); }
  };
  load(true).then(() => {
    S.counts.messages = Math.max(0, S.counts.messages - 1); setBadge();
    const tick = async () => { if (stop || !view.isConnected) return; if (!document.hidden) await load(false); setTimeout(tick, conv && conv.typing ? 1200 : 2500); };
    setTimeout(tick, 2000);
  });
  return () => { stop = true; };
}
