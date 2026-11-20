/* Nexo Games — suara (Web Audio, disintesis langsung, tanpa file audio) */
import { LS } from './core.js';

let ac = null, master = null, enabled = LS.get('nexo.sound', true);
export const soundOn = () => enabled;
export function setSound(v) { enabled = !!v; LS.set('nexo.sound', enabled); if (enabled) { unlock(); ctx(); } else stopMusic(); }

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ac = new C();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
// iOS: audio harus "dibuka" dari sentuhan pengguna. Selain itu, iPhone/iPad membisukan
// Web Audio saat tombol senyap aktif — memutar <audio> senyap + audioSession "playback"
// membuat suara game tetap terdengar (seperti suara video).
let unlocked = false, silentEl = null;
function silentWavUrl() {
  const n = 2205, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
const unlock = () => {
  if (!enabled) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  const c = ctx(); if (!c) return;
  if (!unlocked) {
    unlocked = true;
    try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    try { silentEl = document.createElement('audio'); silentEl.setAttribute('playsinline', ''); silentEl.loop = true; silentEl.src = silentWavUrl(); silentEl.volume = 0.01; silentEl.play().catch(() => { unlocked = false; }); } catch (e) {}
  } else if (silentEl && silentEl.paused) silentEl.play().catch(() => {});
};
['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ac && ac.state !== 'running') ac.resume().catch(() => {}); if (document.visibilityState === 'hidden') stopMusic(); else if (musicWanted) startMusic(); });

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const now = () => ac.currentTime + 0.02;
let noiseBuf = null;
function noiseBuffer() { if (noiseBuf) return noiseBuf; noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf; }

function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(freq, t, dur, o = {}) {
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + (o.slideT || dur));
  if (o.detune) osc.detune.value = o.detune;
  let node = osc;
  if (o.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = o.vib; lg.gain.value = freq * (o.vibDepth || 0.012); l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.1); }
  if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur); f.Q.value = o.q || 1; node.connect(f); node = f; }
  if (o.trem) { const l = ac.createOscillator(), lg = ac.createGain(), tg = ac.createGain(); l.frequency.value = o.trem; lg.gain.value = 0.35; tg.gain.value = 0.65; l.connect(lg); lg.connect(tg.gain); node.connect(tg); node = tg; l.start(t); l.stop(t + dur + 0.1); }
  node.connect(g); g.connect(master);
  env(g, t, o.a || 0.005, dur, o.vol || 0.3);
  osc.start(t); osc.stop(t + (o.a || 0.005) + dur + 0.05);
}
function noise(t, dur, o = {}) {
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  s.buffer = noiseBuffer(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 2000, t); f.Q.value = o.q || 1;
  if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  env(g, t, o.a || 0.002, dur, o.vol || 0.3);
  s.start(t, Math.random() * 0.5); s.stop(t + (o.a || 0.002) + dur + 0.05);
}
// Instrumen
const pluck = (m, t, d = 0.5, v = 0.25, bright = 3500) => tone(mtof(m), t, d, { type: 'sawtooth', lp: bright, lpTo: 300, vol: v });
const bell = (m, t, d = 1.2, v = 0.18) => { const f = mtof(m); tone(f, t, d, { vol: v }); tone(f * 2.76, t, d * 0.5, { vol: v * 0.35 }); tone(f * 5.4, t, d * 0.25, { vol: v * 0.15 }); };
const marimba = (m, t, d = 0.35, v = 0.25) => { const f = mtof(m); tone(f, t, d, { vol: v, type: 'sine' }); tone(f * 4, t, 0.06, { vol: v * 0.3 }); };
const flute = (m, t, d, v = 0.16) => { tone(mtof(m), t, d, { vol: v, a: 0.06, vib: 5.5, vibDepth: 0.01 }); noise(t, Math.min(0.12, d), { f: mtof(m) * 2, q: 4, vol: 0.03 }); };
const accordion = (m, t, d, v = 0.08) => { tone(mtof(m), t, d, { type: 'square', lp: 2600, vol: v, a: 0.03, trem: 6 }); tone(mtof(m), t, d, { type: 'sawtooth', lp: 2000, vol: v * 0.7, detune: 9, a: 0.03 }); };
const brass = (m, t, d, v = 0.14) => tone(mtof(m), t, d, { type: 'sawtooth', lp: 900, lpTo: 2400, vol: v, a: 0.03 });
const erhu = (m, t, d, v = 0.12) => tone(mtof(m), t, d, { type: 'sawtooth', lp: 1800, vol: v, a: 0.05, vib: 6, vibDepth: 0.018 });
const sitar = (m, t, d = 0.7, v = 0.15) => { tone(mtof(m), t, d, { type: 'sawtooth', lp: 5000, lpTo: 900, q: 6, vol: v }); tone(mtof(m) * 1.003, t, d, { type: 'square', lp: 3000, lpTo: 600, vol: v * 0.4 }); };
const kick = (t, v = 0.6) => tone(150, t, 0.25, { slide: 45, slideT: 0.18, vol: v });
const snare = (t, v = 0.25) => { noise(t, 0.14, { ft: 'highpass', f: 1500, vol: v }); tone(200, t, 0.08, { vol: v * 0.5 }); };
const hat = (t, v = 0.12) => noise(t, 0.04, { ft: 'highpass', f: 7000, vol: v });
const clap = (t, v = 0.25) => { [0, 0.012, 0.024].forEach(o => noise(t + o, 0.05, { f: 1200, q: 0.8, vol: v })); };
const click = (t, v = 0.3) => noise(t, 0.03, { f: 3500, q: 3, vol: v });
const tom = (t, f = 180, v = 0.4) => tone(f, t, 0.22, { slide: f * 0.6, vol: v });
const gong = (t, v = 0.3) => { tone(73, t, 3, { vol: v }); tone(73 * 2.3, t, 2, { vol: v * 0.3 }); tone(73 * 3.9, t, 1.2, { vol: v * 0.15 }); };
const whoosh = (t, d = 1.2, v = 0.25, up = true) => noise(t, d, { ft: 'bandpass', f: up ? 300 : 3000, fTo: up ? 3500 : 250, q: 0.7, vol: v, a: d * 0.4 });
function seq(notes, inst, bpm, t0, extra) { const beat = 60 / bpm; let t = t0; for (const [m, b, v] of notes) { if (m != null) inst(m, t, b * beat * 1.1, v); t += b * beat; } return t; }
function chord(ms, t, inst, spread = 0.018) { ms.forEach((m, i) => inst(m, t + i * spread)); }

// ---------- Efek ----------
const SFX = {
  dice(t) { let x = 0; for (let i = 0; i < 9; i++) { x += 0.035 + i * 0.012; click(t + x, 0.18 + Math.random() * 0.15); tom(t + x, 300 + Math.random() * 300, 0.05); } click(t + x + 0.1, 0.35); click(t + x + 0.16, 0.3); },
  step(t, i = 0) { tone(700 + (i % 8) * 40, t, 0.05, { type: 'triangle', vol: 0.12 }); },
  buy(t) { bell(84, t, 0.5, 0.16); bell(88, t + 0.08, 0.7, 0.16); noise(t, 0.08, { f: 5000, vol: 0.12 }); },
  build(t) { [0, 0.14, 0.28].forEach(o => { tom(t + o, 120, 0.35); click(t + o, 0.2); }); seq([[72, 0.5], [76, 0.5], [79, 1]], marimba, 260, t + 0.4); },
  landmark(t) { tone(55, t, 0.6, { vol: 0.5, slide: 40 }); noise(t, 1.4, { ft: 'highpass', f: 5000, vol: 0.12 }); seq([[60, 0.5], [64, 0.5], [67, 0.5], [72, 1.5]], brass, 200, t + 0.05); seq([[72, 0.5], [76, 0.5], [79, 0.5], [84, 1.5]], bell, 200, t + 0.05); },
  toll(t) { [0, 0.09, 0.18, 0.27].forEach((o, i) => bell(88 - i * 3, t + o, 0.3, 0.12)); },
  gain(t) { [0, 0.07, 0.14, 0.21].forEach((o, i) => bell(84 + i * 2, t + o, 0.35, 0.12)); },
  salary(t) { SFX.gain(t); bell(96, t + 0.3, 0.6, 0.1); },
  card(t) { whoosh(t, 0.45, 0.2); [0, 0.06, 0.12, 0.18].forEach((o, i) => bell(91 + i * 3, t + 0.35 + o, 0.5, 0.07)); },
  jail(t) { tone(90, t, 0.25, { type: 'square', lp: 600, vol: 0.25 }); click(t, 0.4); seq([[55, 1], [54, 1], [53, 1], [52, 2]], brass, 220, t + 0.25); },
  turn(t) { bell(79, t, 0.5, 0.12); bell(84, t + 0.12, 0.8, 0.12); },
  takeover(t) { tone(65, t, 0.5, { type: 'sawtooth', lp: 400, vol: 0.4 }); seq([[60, 0.5], [63, 0.5], [67, 0.5], [72, 1]], brass, 240, t + 0.15); },
  storm(t) { whoosh(t, 1.4, 0.35, false); noise(t + 0.3, 1.2, { ft: 'lowpass', f: 400, vol: 0.3 }); },
  shield(t) { seq([[84, 0.5], [88, 0.5], [91, 0.5], [96, 1]], bell, 300, t); },
  festival(t) { tone(523, t, 0.4, { type: 'sawtooth', lp: 3000, slide: 880, vol: 0.12 }); [0.3, 0.45, 0.6, 0.75].forEach(o => clap(t + o, 0.2)); seq([[72, 0.5], [74, 0.5], [76, 0.5], [79, 1]], marimba, 280, t + 0.3); },
  swap(t) { whoosh(t, 0.4, 0.2); whoosh(t + 0.35, 0.4, 0.2, false); },
  win(t) { seq([[67, 0.5], [67, 0.5], [67, 0.5], [72, 2], [76, 0.75], [74, 0.25], [76, 0.5], [79, 2]], brass, 220, t); seq([[79, 0.5], [79, 0.5], [79, 0.5], [84, 2]], bell, 220, t); },
  bankrupt(t) { seq([[60, 1], [59, 1], [58, 1], [57, 3]], tone2('sawtooth', 700), 120, t); },
  pay(t) { SFX.toll(t); },
  'card-use'(t) { SFX.shield(t); },
  tax(t) { noise(t, 0.05, { f: 3000, vol: 0.2 }); bell(83, t + 0.05, 0.5, 0.15); SFX.toll(t + 0.3); }
};
function tone2(type, lp) { return (m, t, d, v = 0.15) => tone(mtof(m), t, d, { type, lp, vol: v, vib: 5, vibDepth: 0.02 }); }

// ---------- Musik pendek tiap tempat (±2 detik) ----------
const PLACES = {
  start(t) { seq([[72, 0.5], [76, 0.5], [79, 0.5], [84, 1.5]], bell, 260, t); SFX.gain(t + 0.6); },
  cairo(t) { seq([[62, 0.5], [63, 0.5], [66, 0.5], [67, 0.5], [69, 1], [70, 0.5], [69, 0.5], [67, 0.5], [66, 1]], (m, tt) => pluck(m, tt, 0.45, 0.2, 2500), 300, t); [0, 0.4, 0.6, 1.0, 1.2, 1.6].forEach((o, i) => tom(t + o, i % 3 === 0 ? 110 : 320, 0.3)); },
  istanbul(t) { tone(mtof(50), t, 2.2, { type: 'sawtooth', lp: 500, vol: 0.06, a: 0.2 }); seq([[69, 1], [70, 0.5], [73, 0.5], [74, 1.5], [73, 0.5], [70, 0.5], [69, 1.5]], flute, 220, t); },
  bangkok(t) { seq([[72, 0.5], [74, 0.5], [76, 0.5], [79, 0.5], [81, 0.5], [79, 0.5], [76, 0.5], [74, 0.5], [72, 1]], marimba, 360, t); [0, 0.66, 1.33].forEach(o => bell(96, t + o, 0.3, 0.06)); },
  kl(t) { seq([[64, 0.5], [67, 0.5], [69, 1], [71, 0.5], [69, 0.5], [67, 1], [64, 1.5]], (m, tt) => bell(m, tt, 0.8, 0.12), 240, t); [0, 0.5, 1, 1.5].forEach(o => tom(t + o, 150, 0.25)); },
  jakarta(t) { seq([[62, 0.5], [64, 0.5], [67, 0.5], [69, 0.5], [72, 0.5], [69, 0.5], [67, 0.5], [64, 0.5]], (m, tt) => { bell(m, tt, 0.7, 0.13); tone(mtof(m) * 1.007, tt, 0.6, { vol: 0.05 }); }, 280, t); gong(t + 1.6, 0.35); },
  rio(t) { tone(2600, t, 0.12, { vib: 30, vibDepth: 0.05, vol: 0.12 }); tone(2600, t + 0.18, 0.12, { vib: 30, vibDepth: 0.05, vol: 0.12 }); for (let i = 0; i < 8; i++) { const tt = t + 0.35 + i * 0.2; kick(tt, i % 2 ? 0.25 : 0.45); hat(tt + 0.1, 0.1); bell(i % 4 < 2 ? 79 : 84, tt, 0.15, 0.08); } },
  sydney(t) { tone(65, t, 2.2, { type: 'sawtooth', lp: 300, lpTo: 900, q: 8, vol: 0.18, a: 0.15, vib: 1.5, vibDepth: 0.01 }); [0.3, 0.6, 0.9, 1.2, 1.35, 1.5].forEach(o => click(t + o, 0.35)); },
  barcelona(t) { const strum = (ms, tt) => chord(ms, tt, (m, x) => pluck(m, x, 0.6, 0.12, 4000), 0.022); strum([52, 59, 64, 67, 71], t); strum([53, 60, 65, 69, 72], t + 0.45); strum([55, 62, 67, 71, 74], t + 0.9); strum([53, 60, 65, 69, 72], t + 1.2); strum([52, 59, 64, 68, 71], t + 1.5); [0.2, 0.3, 0.65, 1.05, 1.35].forEach(o => click(t + o, 0.25)); },
  berlin(t) { for (let i = 0; i < 8; i++) { kick(t + i * 0.25, 0.5); hat(t + i * 0.25 + 0.125); } seq([[45, 0.5], [45, 0.5], [57, 0.5], [45, 0.5], [48, 0.5], [45, 0.5], [55, 0.5], [57, 0.5]], (m, tt, d) => tone(mtof(m), tt, d, { type: 'sawtooth', lp: 400, lpTo: 2500, q: 12, vol: 0.12 }), 240, t); },
  rome(t) { const mel = [76, 76, 74, 72, 74, 76, 79, 77, 76]; mel.forEach((m, i) => { for (let r = 0; r < 3; r++) pluck(m, t + i * 0.22 + r * 0.07, 0.1, 0.1, 5000); }); },
  seoul(t) { seq([[79, 0.5], [76, 0.5], [79, 0.5], [81, 0.5], [79, 0.5], [76, 0.5], [74, 1], [76, 1]], (m, tt, d) => tone(mtof(m), tt, d * 0.8, { type: 'square', lp: 3000, vol: 0.09 }), 300, t); [0, 0.4, 0.8, 1.2].forEach(o => { kick(t + o, 0.35); clap(t + o + 0.2, 0.15); }); },
  singapore(t) { chord([60, 64, 67, 71], t, (m, x) => tone(mtof(m), x, 1.8, { type: 'triangle', vol: 0.06, a: 0.3 }), 0); seq([[72, 0.5], [76, 0.5], [79, 0.5], [83, 0.5], [84, 1], [79, 1]], marimba, 280, t + 0.1); },
  hongkong(t) { seq([[69, 1], [72, 0.5], [74, 0.5], [76, 1.5], [74, 0.5], [72, 1]], erhu, 200, t); gong(t + 1.7, 0.2); },
  agra(t) { tone(mtof(48), t, 2.2, { type: 'sawtooth', lp: 400, vol: 0.07, a: 0.2 }); seq([[60, 0.5], [61, 0.5], [64, 0.5], [65, 0.5], [67, 1], [68, 0.5], [67, 1.5]], sitar, 240, t); [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5].forEach((o, i) => tom(t + o, i % 2 ? 380 : 140, 0.25)); },
  sf(t) { bell(93, t, 0.25, 0.2); bell(93, t + 0.18, 0.4, 0.2); seq([[60, 0.5], [64, 0.5], [67, 0.5], [70, 0.5], [69, 1], [67, 1]], (m, tt) => pluck(m, tt, 0.4, 0.12, 2000), 220, t + 0.5); },
  dubai(t) { chord([50, 57, 62], t, (m, x) => tone(mtof(m), x, 2, { type: 'sawtooth', lp: 700, vol: 0.05, a: 0.4 }), 0); seq([[74, 0.5], [75, 0.5], [78, 0.5], [79, 0.5], [81, 1], [79, 0.5], [78, 1]], (m, tt) => pluck(m, tt, 0.5, 0.16, 2200), 260, t + 0.2); },
  tokyo(t) { seq([[76, 0.5], [77, 0.5], [81, 0.5], [83, 0.5], [84, 1], [83, 0.5], [81, 0.5], [77, 1]], (m, tt) => pluck(m, tt, 0.8, 0.13, 6000), 260, t); [0.1, 1.0].forEach(o => tom(t + o, 90, 0.5)); },
  paris(t) { [0, 0.6, 1.2].forEach(o => { tone(mtof(48), t + o, 0.2, { type: 'triangle', vol: 0.18 }); chord([64, 67, 72], t + o + 0.2, (m, x) => accordion(m, x, 0.15, 0.04), 0); chord([64, 67, 72], t + o + 0.4, (m, x) => accordion(m, x, 0.15, 0.04), 0); }); seq([[67, 1], [72, 0.5], [76, 0.5], [74, 1], [72, 0.5], [71, 0.5], [72, 1.5]], accordion, 210, t); },
  london(t) { seq([[68, 1], [66, 1], [64, 1], [59, 2]], (m, tt) => bell(m, tt, 1.5, 0.2), 170, t); },
  newyork(t) { [0, 0.3, 0.6, 0.9, 1.2, 1.5].forEach((o, i) => tone(mtof([41, 45, 48, 50, 51, 50][i]), t + o, 0.25, { type: 'triangle', vol: 0.22 })); [0.15, 0.75, 1.35].forEach(o => chord([65, 69, 72, 75], t + o, (m, x) => tone(mtof(m), x, 0.2, { type: 'triangle', vol: 0.05 }), 0)); seq([[72, 0.75], [75, 0.25], [77, 0.5], [78, 0.5], [77, 1.5]], (m, tt, d) => tone(mtof(m), tt, d, { type: 'sawtooth', lp: 1400, vol: 0.09, vib: 5, vibDepth: 0.015, a: 0.03 }), 200, t + 0.2); [0.3, 0.9, 1.5].forEach(o => hat(t + o, 0.08)); },
  airport(t) { seq([[84, 1], [79, 1], [76, 1], [72, 2]], (m, tt) => bell(m, tt, 1, 0.13), 260, t); whoosh(t + 0.4, 1.5, 0.18); },
  changi(t) { seq([[79, 1], [84, 1], [88, 1], [91, 2]], (m, tt) => bell(m, tt, 1.1, 0.12), 250, t); [1.2, 1.35, 1.5].forEach(o => tone(3200, t + o, 0.06, { slide: 4200, vol: 0.05 })); whoosh(t + 0.5, 1.4, 0.16); },
  jail(t) { SFX.jail(t); },
  festival(t) { SFX.festival(t); },
  tour(t) { whoosh(t, 1.6, 0.3); seq([[72, 0.5], [77, 0.5], [81, 1]], bell, 240, t + 0.2); },
  tax(t) { SFX.tax(t); },
  card(t) { SFX.card(t); }
};

let lastPlace = 0;
export function sfx(name, delay = 0, arg) {
  if (!enabled) return; const c = ctx(); if (!c || !SFX[name]) return;
  try { SFX[name](now() + delay, arg); } catch (e) {}
}
export function place(key, delay = 0) {
  if (!enabled || !key) return; const c = ctx(); if (!c) return;
  if (Date.now() - lastPlace < 600) return; lastPlace = Date.now();
  try { (PLACES[key] || PLACES.card)(now() + delay); } catch (e) {}
}

// ---------- Musik latar (lounge santai, berulang) ----------
let musicT = null, musicWanted = false, musicOnPref = LS.get('nexo.music', true), musicBar = 0, musicGain = null;
export const musicOn = () => musicOnPref;
export function setMusic(v) { musicOnPref = !!v; LS.set('nexo.music', musicOnPref); if (musicOnPref && musicWanted) startMusic(); else stopMusic(); }
const PROG = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]]; // Am7 Fmaj7 Cmaj7 G7
function musicBarAt(t) {
  const beat = 60 / 92, ch = PROG[musicBar % 4];
  const out = musicGain;
  const padTone = (m, tt, d, v) => { const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = 1200; g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(v, tt + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, tt + d); o.connect(f); f.connect(g); g.connect(out); o.start(tt); o.stop(tt + d + 0.1); };
  ch.forEach(m => padTone(m, t, beat * 4, 0.05));
  padTone(ch[0] - 12, t, beat * 2, 0.09); padTone(ch[0] - 12, t + beat * 2, beat * 2, 0.07);
  const arp = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 12];
  arp.forEach((m, i) => { const tt = t + i * beat / 2; const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = mtof(m); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.035, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.45); o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.5); });
  musicBar++;
  return beat * 4;
}
export function startMusic() {
  musicWanted = true;
  if (!enabled || !musicOnPref || musicT || document.visibilityState === 'hidden') return;
  const c = ctx(); if (!c) return;
  musicGain = c.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
  musicGain.gain.exponentialRampToValueAtTime(1, c.currentTime + 2);
  let next = c.currentTime + 0.1;
  const tick = () => { while (next < ac.currentTime + 1.2) next += musicBarAt(next); };
  tick(); musicT = setInterval(tick, 400);
}
export function stopMusic(forget) {
  if (forget) musicWanted = false;
  clearInterval(musicT); musicT = null;
  if (musicGain && ac) { const g = musicGain; try { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(g.gain.value, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6); } catch (e) {} setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 900); musicGain = null; }
}
export function testSound() { unlock(); sfx('landmark'); }
