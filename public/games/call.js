/* Nexo Games — telepon suara & video 1 lawan 1 (WebRTC, sinyal lewat server Nexo) */
import { $, esc, S, on, call, avatar, user, toast, haptic } from './core.js';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
let C = null;           // panggilan aktif
let ringT = null, ringCtx = null;

export function initCall() {
  on('call', ({ from, data }) => handleSignal(from, data));
}

function ui() {
  let el = $('#call-ui');
  if (!el) { el = document.createElement('div'); el.id = 'call-ui'; el.className = 'call-ui'; document.body.appendChild(el); }
  return el;
}
function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function render() {
  const el = ui(); if (!C) { el.classList.remove('on'); setTimeout(() => { if (!C) el.innerHTML = ''; }, 300); return; }
  const u = user(C.peer), video = C.video;
  const status = C.state === 'incoming' ? (video ? 'Panggilan video masuk…' : 'Panggilan suara masuk…') : C.state === 'calling' ? 'Memanggil…' : C.state === 'connecting' ? 'Menyambungkan…' : C.state === 'connected' ? fmt((Date.now() - C.t0) / 1000) : 'Panggilan berakhir';
  el.innerHTML = `<div class="call-bg" style="${u.avatar && u.avatar.photo ? `background-image:url('/api/nexo/media/${u.avatar.photo}')` : `background:${(u.avatar && u.avatar.color) || '#333'}`}"></div>
    <video class="call-remote ${video && C.state === 'connected' ? '' : 'hidden'}" autoplay playsinline></video>
    <div class="call-top ${video && C.state === 'connected' ? 'mini' : ''}">${avatar(u, video && C.state === 'connected' ? 44 : 110)}<div class="call-name">${esc(u.name)}</div><div class="call-st" id="call-st">${status}</div></div>
    <video class="call-local ${video && C.local ? '' : 'hidden'}" autoplay playsinline muted></video>
    <div class="call-ctrl">${C.state === 'incoming' ? `
      <div><button class="cbtn red" data-c="decline"><i class="fa-solid fa-phone-slash"></i></button><span>Tolak</span></div>
      <div><button class="cbtn green" data-c="accept"><i class="fa-solid ${video ? 'fa-video' : 'fa-phone'}"></i></button><span>Terima</span></div>` : `
      <div><button class="cbtn ${C.muted ? 'on' : ''}" data-c="mute"><i class="fa-solid ${C.muted ? 'fa-microphone-slash' : 'fa-microphone'}"></i></button><span>Bisu</span></div>
      ${video ? `<div><button class="cbtn ${C.camOff ? 'on' : ''}" data-c="cam"><i class="fa-solid ${C.camOff ? 'fa-video-slash' : 'fa-video'}"></i></button><span>Kamera</span></div><div><button class="cbtn" data-c="flip"><i class="fa-solid fa-camera-rotate"></i></button><span>Putar</span></div>` : ''}
      <div><button class="cbtn red" data-c="end"><i class="fa-solid fa-phone-slash"></i></button><span>Tutup</span></div>`}</div>`;
  el.classList.add('on');
  const rv = el.querySelector('.call-remote'), lv = el.querySelector('.call-local');
  if (C.remote) { rv.srcObject = C.remote; if (!video) { const a = el.querySelector('audio') || document.createElement('audio'); a.autoplay = true; a.srcObject = C.remote; el.appendChild(a); } }
  if (C.local && video) lv.srcObject = C.local;
  el.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; ({ accept, decline: () => end('decline'), end: () => end('end'), mute: toggleMute, cam: toggleCam, flip })[b.dataset.c](); };
}
function tickTimer() { if (C && C.state === 'connected') { const s = $('#call-st'); if (s) s.textContent = fmt((Date.now() - C.t0) / 1000); } }
setInterval(tickTimer, 1000);

function ring(incoming) {
  stopRing();
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ringCtx = new AC();
  const beep = () => {
    if (!ringCtx) return;
    const t = ringCtx.currentTime;
    [0, 0.45].forEach((o, i) => {
      const osc = ringCtx.createOscillator(), g = ringCtx.createGain();
      osc.frequency.value = incoming ? (i ? 659 : 784) : 440; osc.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.18, t + o + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.38);
      osc.connect(g); g.connect(ringCtx.destination); osc.start(t + o); osc.stop(t + o + 0.4);
    });
    if (incoming) haptic([200, 100, 200]);
  };
  beep(); ringT = setInterval(beep, incoming ? 2000 : 3000);
}
function stopRing() { clearInterval(ringT); ringT = null; if (ringCtx) { ringCtx.close().catch(() => {}); ringCtx = null; } }

async function media(video) {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false });
}
function newPeer() {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  pc.onicecandidate = e => { if (e.candidate && C) signal({ type: 'ice', id: C.id, cand: e.candidate.toJSON() }); };
  pc.ontrack = e => { if (!C) return; C.remote = e.streams[0]; render(); };
  pc.onconnectionstatechange = () => {
    if (!C) return;
    if (pc.connectionState === 'connected' && C.state !== 'connected') { C.state = 'connected'; C.t0 = Date.now(); stopRing(); render(); }
    if (pc.connectionState === 'failed') { toast('Sambungan gagal. Jaringan mungkin memblokir panggilan.'); end('end'); }
  };
  return pc;
}
function signal(data) { return call('call.signal', { to: C.peer, data }); }

export async function startCall(uid, video) {
  if (C) return toast('Sedang ada panggilan');
  if (!window.RTCPeerConnection || !navigator.mediaDevices) return toast('Browser ini belum mendukung telepon');
  C = { peer: uid, video, id: Math.random().toString(36).slice(2), state: 'calling', pending: [] };
  render();
  try { C.local = await media(video); } catch (e) { toast('Izinkan mikrofon' + (video ? ' & kamera' : '') + ' untuk menelepon'); C = null; return render(); }
  C.pc = newPeer();
  C.local.getTracks().forEach(t => C.pc.addTrack(t, C.local));
  const offer = await C.pc.createOffer();
  await C.pc.setLocalDescription(offer);
  render(); ring(false);
  try { await signal({ type: 'invite', id: C.id, video, sdp: C.pc.localDescription }); }
  catch (e) { toast(e.message); return end('end', true); }
  C.timeout = setTimeout(() => { if (C && C.state === 'calling') { toast('Tidak dijawab'); end('end'); } }, 45000);
}

async function handleSignal(from, data) {
  if (data.type === 'invite') {
    if (C) { if (C.peer !== from) call('call.signal', { to: from, data: { type: 'busy', id: data.id } }).catch(() => {}); return; }
    C = { peer: from, video: !!data.video, id: data.id, state: 'incoming', offer: data.sdp, pending: [] };
    call('call.signal', { to: from, data: { type: 'ringing', id: data.id } }).catch(() => {});
    render(); ring(true);
    C.timeout = setTimeout(() => { if (C && C.state === 'incoming') end('decline', true); }, 45000);
    return;
  }
  if (!C || C.peer !== from || (data.id && data.id !== C.id)) return;
  if (data.type === 'ringing') { const s = $('#call-st'); if (s && C.state === 'calling') s.textContent = 'Berdering…'; }
  else if (data.type === 'answer') { C.state = 'connecting'; stopRing(); render(); await C.pc.setRemoteDescription(data.sdp); flushIce(); }
  else if (data.type === 'ice') { if (C.pc && C.pc.remoteDescription) C.pc.addIceCandidate(data.cand).catch(() => {}); else C.pending.push(data.cand); }
  else if (data.type === 'decline') { toast(`${user(from).name} menolak panggilan`); end('x', true); }
  else if (data.type === 'busy') { toast(`${user(from).name} sedang di panggilan lain`); end('x', true); }
  else if (data.type === 'end') { toast('Panggilan berakhir'); end('x', true); }
}
function flushIce() { if (!C || !C.pc) return; C.pending.forEach(c => C.pc.addIceCandidate(c).catch(() => {})); C.pending = []; }
async function accept() {
  if (!C || C.state !== 'incoming') return;
  stopRing(); C.state = 'connecting'; render();
  try { C.local = await media(C.video); } catch (e) { toast('Izinkan mikrofon' + (C.video ? ' & kamera' : '')); return end('decline'); }
  C.pc = newPeer();
  C.local.getTracks().forEach(t => C.pc.addTrack(t, C.local));
  await C.pc.setRemoteDescription(C.offer); flushIce();
  const ans = await C.pc.createAnswer(); await C.pc.setLocalDescription(ans);
  await signal({ type: 'answer', id: C.id, sdp: C.pc.localDescription }).catch(() => {});
  render();
}
function end(kind, silent) {
  if (!C) return;
  const c = C; C = null;
  clearTimeout(c.timeout); stopRing();
  if (!silent && kind !== 'x') call('call.signal', { to: c.peer, data: { type: kind === 'decline' ? 'decline' : 'end', id: c.id } }).catch(() => {});
  try { c.pc && c.pc.close(); } catch (e) {}
  if (c.local) c.local.getTracks().forEach(t => t.stop());
  render();
}
function toggleMute() { if (!C || !C.local) return; C.muted = !C.muted; C.local.getAudioTracks().forEach(t => t.enabled = !C.muted); render(); }
function toggleCam() { if (!C || !C.local) return; C.camOff = !C.camOff; C.local.getVideoTracks().forEach(t => t.enabled = !C.camOff); render(); }
async function flip() {
  if (!C || !C.local || !C.pc) return;
  C.facing = C.facing === 'environment' ? 'user' : 'environment';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: C.facing } });
    const track = s.getVideoTracks()[0];
    const sender = C.pc.getSenders().find(x => x.track && x.track.kind === 'video');
    if (sender) await sender.replaceTrack(track);
    C.local.getVideoTracks().forEach(t => { t.stop(); C.local.removeTrack(t); });
    C.local.addTrack(track); render();
  } catch (e) { toast('Gagal mengganti kamera'); }
}
export function inCall() { return !!C; }
