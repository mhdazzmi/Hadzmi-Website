/* STARDOM — composer: posts (single/carousel), reels, stories, drafts */
import { api, upload, esc, icon, toast, S, go, $, $$, confirmBox, topbar, timeAgo } from './core.js';
import { resetHome } from './feed.js';

const MAX_VIDEO = 120 * 1024 * 1024;
const BGS = ['linear-gradient(160deg,#1d6ff2,#6a5cff)', 'linear-gradient(160deg,#ff8a65,#ff3d71)', 'linear-gradient(160deg,#111,#3a3a3a)', 'linear-gradient(160deg,#00b894,#00a8ff)', 'linear-gradient(160deg,#f6d365,#fda085)', 'linear-gradient(160deg,#a18cd1,#fbc2eb)', '#f2f2f2'];

// ---------- Media processing (in the browser, before upload) ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image format is not supported by your browser')); };
    img.src = url;
  });
}
function toJpeg(src, w, h, maxEdge, q) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r({ blob: b, width: c.width, height: c.height }), 'image/jpeg', q));
}
export async function processImage(file) {
  const { img, url } = await loadImage(file);
  const main = await toJpeg(img, img.naturalWidth, img.naturalHeight, 1600, 0.86);
  const thumb = await toJpeg(img, img.naturalWidth, img.naturalHeight, 540, 0.78);
  return { kind: 'image', blob: main.blob, thumbBlob: thumb.blob, width: main.width, height: main.height, preview: url };
}
export function processVideo(file) {
  if (file.size > MAX_VIDEO) return Promise.reject(new Error('Video is too large (max 120 MB)'));
  if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) return Promise.reject(new Error('Use an MP4, MOV or WEBM video'));
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    let done = false;
    const finish = async thumbBlob => { if (done) return; done = true; resolve({ kind: 'video', blob: file, thumbBlob, width: v.videoWidth || 1080, height: v.videoHeight || 1920, duration: v.duration || null, preview: url }); };
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); } catch (e) { finish(null); } };
    v.onseeked = async () => { try { const t = await toJpeg(v, v.videoWidth, v.videoHeight, 720, 0.8); finish(t.blob); } catch (e) { finish(null); } };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
  });
}
async function uploadItem(it, onProgress) {
  if (it.uploaded) return it.uploaded;
  const main = await upload(it.blob, p => onProgress(p * 0.9));
  let thumb = null;
  if (it.thumbBlob) thumb = (await upload(it.thumbBlob, () => {})).url;
  onProgress(1);
  it.uploaded = { kind: it.kind, url: main.url, thumb, width: it.width, height: it.height, duration: it.duration || null };
  return it.uploaded;
}

// ---------- View ----------
export function createView(view, params, query) {
  const st = { mode: query.get('mode') || 'post', items: [], storyBg: BGS[0], draftId: null, busy: false };
  view.innerHTML = `${topbar({ title: 'New post', back: true, right: '<button class="txt-btn" id="cr-share" disabled>Share</button>' })}
    <div class="seg" id="cr-seg"><button data-m="post">Post</button><button data-m="story">Story</button><button data-m="reel">Reel</button></div>
    <div class="cr"></div>
    <input type="file" id="cr-file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple hidden>`;
  const body = $('.cr', view), file = $('#cr-file', view), share = $('#cr-share', view);
  const setMode = m => {
    st.mode = m;
    $$('#cr-seg button', view).forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('.tb-title', view).textContent = { post: 'New post', story: 'Add to story', reel: 'New reel' }[m];
    file.multiple = m === 'post';
    file.accept = m === 'reel' ? 'video/mp4,video/quicktime,video/webm' : 'image/*,video/mp4,video/quicktime,video/webm';
    if (m !== 'post' && st.items.length > 1) st.items = st.items.slice(0, 1);
    if (m === 'reel' && st.items[0] && st.items[0].kind !== 'video') st.items = [];
    render();
  };
  const valid = () => st.mode === 'story' ? (st.items.length || ($('#cr-stext', view) && $('#cr-stext', view).value.trim())) : st.items.length > 0;
  const render = () => {
    const picker = `<button class="pick" data-pick>${icon(st.mode === 'reel' ? 'video' : 'image', 'big')}<b>${st.mode === 'reel' ? 'Select a video' : st.mode === 'story' ? 'Photo or video' : 'Select photos or a video'}</b><span>${st.mode === 'post' ? 'Up to 10 items for a carousel' : st.mode === 'reel' ? 'Vertical video works best' : 'Or write a text story below'}</span></button>`;
    const first = st.items[0];
    const preview = first ? `<div class="cr-prev ${st.mode !== 'post' ? 'tall' : ''}">${first.kind === 'video' ? `<video src="${first.preview}" playsinline muted loop autoplay></video>` : `<img src="${first.preview}" alt="">`}</div>` : '';
    const strip = st.mode === 'post' && st.items.length ? `<div class="strip">${st.items.map((it, i) => `<div class="strip-i">${it.kind === 'video' ? `<video src="${it.preview}" muted></video>` : `<img src="${it.preview}" alt="">`}<span class="strip-n">${i + 1}</span>
        <div class="strip-c">${i > 0 ? `<button data-mv="${i}" data-d="-1" aria-label="Move left">‹</button>` : ''}<button data-rm="${i}" aria-label="Remove">✕</button>${i < st.items.length - 1 ? `<button data-mv="${i}" data-d="1" aria-label="Move right">›</button>` : ''}</div></div>`).join('')}${st.items.length < 10 ? `<button class="strip-add" data-pick>+</button>` : ''}</div>` : '';
    let fields = '';
    if (st.mode === 'story') {
      fields = st.items.length
        ? `<label class="fl">Text on story<input id="cr-stext" maxlength="300" placeholder="Say something…"></label>`
        : `<div class="text-story" id="cr-tprev" style="background:${st.storyBg}"><textarea id="cr-stext" maxlength="300" placeholder="Type something…"></textarea></div>
           <div class="bgs">${BGS.map(b => `<button data-bg="${esc(b)}" style="background:${b}" class="${b === st.storyBg ? 'on' : ''}" aria-label="Background"></button>`).join('')}</div>`;
    } else {
      fields = `<label class="fl">Caption<textarea id="cr-cap" rows="4" maxlength="2200" placeholder="Write a caption… use #hashtags and @mentions"></textarea></label>
        <label class="fl">Location<input id="cr-loc" maxlength="100" placeholder="Add location"></label>
        ${st.mode === 'reel' ? `<label class="fl">♪ Audio<input id="cr-audio" maxlength="100" placeholder="Original audio"></label>` : ''}
        <label class="tg"><span>Turn off commenting</span><input type="checkbox" id="cr-off"><i></i></label>`;
    }
    const keep = {};
    for (const id of ['cr-cap', 'cr-loc', 'cr-audio', 'cr-stext']) { const el = $('#' + id, view); if (el) keep[id] = el.value; }
    body.innerHTML = `${preview || picker}${strip}${first && st.mode !== 'post' ? '<button class="btn ghost block" data-pick>Replace</button>' : ''}<div class="form">${fields}</div>
      <div class="cr-prog hidden"><div class="bar"><i></i></div><span>Uploading…</span></div>
      ${st.mode !== 'story' ? `<div class="cr-actions"><button class="btn block" id="cr-draft" ${st.items.length ? '' : 'disabled'}>Save draft</button></div><div class="drafts"></div>` : ''}`;
    for (const id in keep) { const el = $('#' + id, view); if (el) el.value = keep[id]; }
    share.disabled = !valid() || st.busy;
    const stx = $('#cr-stext', view); if (stx) stx.oninput = () => { share.disabled = !valid() || st.busy; };
    if (st.mode !== 'story') loadDrafts();
  };
  async function loadDrafts() {
    const box = $('.drafts', view); if (!box) return;
    const r = await api('/drafts').catch(() => ({ drafts: [] }));
    const list = r.drafts.filter(d => d.type === st.mode);
    box.innerHTML = list.length ? `<div class="sec-h">Drafts</div>${list.map(d => `<div class="draft" data-id="${d.id}"><img src="${esc(d.media[0].thumb || d.media[0].url)}" alt=""><div class="draft-m"><b>${esc(d.caption || 'No caption')}</b><span>${d.media.length} item${d.media.length > 1 ? 's' : ''} · ${timeAgo(d.updated_at, true)}</span></div><button class="txt-btn" data-open-d="${d.id}">Open</button><button class="ib" data-del-d="${d.id}" aria-label="Delete draft">${icon('trash')}</button></div>`).join('')}` : '';
    box.onclick = async e => {
      const o = e.target.closest('[data-open-d]'), d = e.target.closest('[data-del-d]');
      if (d && await confirmBox('Delete draft?', '', 'Delete', true)) { await api('/drafts/' + d.dataset.delD, { method: 'DELETE' }); loadDrafts(); }
      if (o) {
        const dr = list.find(x => x.id === o.dataset.openD);
        st.draftId = dr.id;
        st.items = dr.media.map(m => ({ kind: m.kind, preview: m.kind === 'video' ? m.url : m.url, uploaded: m, width: m.width, height: m.height }));
        render();
        $('#cr-cap', view).value = dr.caption || ''; $('#cr-loc', view).value = dr.location || '';
        share.disabled = false;
      }
    };
  }
  view.addEventListener('click', async e => {
    const seg = e.target.closest('#cr-seg button');
    if (seg) return setMode(seg.dataset.m);
    if (e.target.closest('[data-pick]')) return file.click();
    const rm = e.target.closest('[data-rm]'), mv = e.target.closest('[data-mv]'), bg = e.target.closest('[data-bg]');
    if (rm) { st.items.splice(+rm.dataset.rm, 1); render(); }
    if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.d; [st.items[i], st.items[j]] = [st.items[j], st.items[i]]; render(); }
    if (bg) { st.storyBg = bg.dataset.bg; $('#cr-tprev', view).style.background = st.storyBg; $$('.bgs button', view).forEach(b => b.classList.toggle('on', b === bg)); }
    if (e.target.closest('#cr-draft')) saveDraft();
  });
  file.onchange = async () => {
    const files = [...file.files]; file.value = '';
    if (!files.length) return;
    const room = st.mode === 'post' ? 10 - st.items.length : 1;
    if (st.mode !== 'post') st.items = [];
    for (const f of files.slice(0, room)) {
      try {
        const isVid = /^video\//.test(f.type);
        if (st.mode === 'reel' && !isVid) { toast('Reels need a video', 'err'); continue; }
        if (st.mode === 'post' && isVid && st.items.length + files.length > 1 && files.length > 1) { /* videos allowed inside carousels */ }
        st.items.push(isVid ? await processVideo(f) : await processImage(f));
      } catch (er) { toast(er.message, 'err'); }
    }
    render();
  };
  async function uploadAll() {
    const prog = $('.cr-prog', view), bar = $('.cr-prog i', view), label = $('.cr-prog span', view);
    prog.classList.remove('hidden');
    const out = [];
    for (let i = 0; i < st.items.length; i++) {
      label.textContent = st.items.length > 1 ? `Uploading ${i + 1} of ${st.items.length}…` : 'Uploading…';
      out.push(await uploadItem(st.items[i], p => { bar.style.width = ((i + p) / st.items.length * 100) + '%'; }));
    }
    label.textContent = 'Publishing…';
    return out;
  }
  async function saveDraft() {
    if (st.busy) return;
    st.busy = true;
    try {
      const media = await uploadAll();
      const r = await api('/drafts', { method: 'POST', body: { id: st.draftId, type: st.mode, caption: $('#cr-cap', view).value, location: $('#cr-loc', view).value, media } });
      st.draftId = r.id; toast('Draft saved');
      $('.cr-prog', view).classList.add('hidden');
      loadDrafts();
    } catch (er) { toast(er.message, 'err'); $('.cr-prog', view).classList.add('hidden'); }
    st.busy = false;
  }
  share.onclick = async () => {
    if (st.busy || !valid()) return;
    st.busy = true; share.disabled = true;
    try {
      if (st.mode === 'story') {
        const text = ($('#cr-stext', view) || {}).value || '';
        if (st.items.length) {
          const [m] = await uploadAll();
          await api('/stories', { method: 'POST', body: { kind: m.kind === 'video' ? 'video' : 'photo', url: m.url, thumb: m.thumb, duration: m.duration, text } });
        } else await api('/stories', { method: 'POST', body: { kind: 'text', text, bg: st.storyBg } });
        toast('Added to your story');
        resetHome(); go('#/');
      } else {
        const media = await uploadAll();
        const r = await api('/posts', { method: 'POST', body: { type: st.mode, caption: $('#cr-cap', view).value, location: $('#cr-loc', view).value, audio: ($('#cr-audio', view) || {}).value || '', comments_off: $('#cr-off', view).checked, media, draft_id: st.draftId } });
        S.owner.posts++;
        toast(r.simulation && r.simulation.paused ? 'Shared. Simulation is paused, so no one will react yet.' : 'Shared! Your audience is starting to see it.');
        resetHome(); go('#/p/' + r.post.id);
      }
    } catch (er) { toast(er.message, 'err'); share.disabled = false; $('.cr-prog', view).classList.add('hidden'); }
    st.busy = false;
  };
  setMode(st.mode);
}
