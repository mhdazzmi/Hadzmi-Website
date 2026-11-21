/* =====================================================================
   GAME Kasir Thai Tea: Ludo (3D), Domino Gaple, Congklak
   - Main Lawan Komputer (bot) atau Main Online (Firebase: thaitea/games/rooms)
   - Online 2–4 pemain; kalau kursi belum penuh: Lanjutkan (default) atau Isi dengan Komputer
   - Live: menonton meja yang sedang main
   - Jeda untuk semua game; meja kosong > 2 menit (tidak dijeda) tertutup otomatis
   - Animasi & suara (Web Audio, tanpa file suara)
   Bergantung pada global dari index.html: db, myKey, deviceName, esc, triggerToast,
   iosConfirm, kirimNotif, avaHtml, lsGet, lsSet, firebase.
   ===================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rnd = n => Math.floor(Math.random() * n);
  const clone = o => JSON.parse(JSON.stringify(o));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const BOT_NAMES = ['Robo Tea', 'Bot Boba', 'Bot Matcha'];
  const roomsRef = db.ref('thaitea/games/rooms');
  const ROOM_TTL = 6 * 3600 * 1000;
  const IDLE_CLOSE = 2 * 60 * 1000;      // meja kosong 2 menit → tutup (kecuali dijeda)
  const FRESH = 70 * 1000;               // tanda "masih di dalam meja"
  const BOT_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#fff" d="M11 2h2v3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2zm-2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';

  /* =====================================================================
     SUARA (disintesis dengan Web Audio)
     ===================================================================== */
  const SFX = (() => {
    let ac = null;
    let muted = (typeof lsGet === 'function' && lsGet('tt_game_mute') === '1');
    function ctx() {
      if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f, d, type, vol, when, slide) {
      const a = ctx(); if (!a || muted) return;
      const t = a.currentTime + (when || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(vol || .2, t); g.gain.exponentialRampToValueAtTime(.0008, t + d);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .03);
    }
    function noise(d, vol, when, freq, q) {
      const a = ctx(); if (!a || muted) return;
      const t = a.currentTime + (when || 0);
      const len = Math.max(1, Math.floor(a.sampleRate * d));
      const buf = a.createBuffer(1, len, a.sampleRate); const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = q || 1.2;
      const g = a.createGain(); g.gain.value = vol || .3;
      src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
    }
    return {
      unlock() { ctx(); },
      get muted() { return muted; },
      toggle() { muted = !muted; try { lsSet('tt_game_mute', muted ? '1' : '0'); } catch (e) {} return muted; },
      clack() { noise(.06, .55, 0, 2600, 2); tone(1400, .04, 'square', .04); noise(.04, .3, .045, 1800, 2); },
      dice() { for (let i = 0; i < 8; i++) noise(.035, .4, i * .075 + Math.random() * .02, 1400 + Math.random() * 1600, 3); },
      land() { noise(.05, .5, 0, 900, 2); },
      step() { tone(620, .06, 'triangle', .16); tone(930, .05, 'sine', .06, .02); },
      capture() { tone(520, .32, 'sawtooth', .1, 0, 110); noise(.12, .25, .05, 600); },
      home() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, 'triangle', .17, i * .08)); },
      win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .3, 'triangle', .2, i * .12)); [262, 330, 392].forEach(f => tone(f, .9, 'sine', .08, .5)); },
      seed() { tone(1500 + Math.random() * 500, .035, 'sine', .14); noise(.025, .18, 0, 5000, 4); },
      pick() { noise(.09, .25, 0, 3500, 1); },
      pass() { tone(340, .18, 'sine', .1, 0, 220); },
      tap() { tone(900, .035, 'sine', .07); },
      turn() { tone(784, .08, 'sine', .1); tone(1047, .1, 'sine', .1, .08); }
    };
  })();

  /* ---------------- ikon gaya iOS ---------------- */
  const ICON = {
    ludo: '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="17" height="17" rx="3" fill="#FF4D4D"/><rect x="25" y="6" width="17" height="17" rx="3" fill="#34C759"/><rect x="6" y="25" width="17" height="17" rx="3" fill="#1E88E5"/><rect x="25" y="25" width="17" height="17" rx="3" fill="#FFD60A"/><rect x="15" y="15" width="18" height="18" rx="4" fill="#fff"/><circle cx="20" cy="20" r="2" fill="#1C1C1E"/><circle cx="28" cy="28" r="2" fill="#1C1C1E"/><circle cx="24" cy="24" r="2" fill="#1C1C1E"/></svg>',
    domino: '<svg viewBox="0 0 48 48"><rect x="13" y="5" width="22" height="38" rx="5" fill="#fff"/><path d="M14 24h20" stroke="#1C1C1E" stroke-width="2"/><circle cx="19" cy="11" r="2.4" fill="#1C1C1E"/><circle cx="29" cy="18" r="2.4" fill="#1C1C1E"/><circle cx="24" cy="14.5" r="2.4" fill="#1C1C1E"/><circle cx="19" cy="30" r="2.4" fill="#1C1C1E"/><circle cx="29" cy="30" r="2.4" fill="#1C1C1E"/><circle cx="19" cy="37" r="2.4" fill="#1C1C1E"/><circle cx="29" cy="37" r="2.4" fill="#1C1C1E"/></svg>',
    congklak: '<svg viewBox="0 0 48 48"><rect x="4" y="13" width="40" height="22" rx="11" fill="#E8B678"/><ellipse cx="9.5" cy="24" rx="3.5" ry="7" fill="#8A5527"/><ellipse cx="38.5" cy="24" rx="3.5" ry="7" fill="#8A5527"/><g fill="#8A5527"><circle cx="17" cy="19" r="2.6"/><circle cx="24" cy="19" r="2.6"/><circle cx="31" cy="19" r="2.6"/><circle cx="17" cy="29" r="2.6"/><circle cx="24" cy="29" r="2.6"/><circle cx="31" cy="29" r="2.6"/></g><g fill="#fff"><circle cx="16.5" cy="18.5" r=".9"/><circle cx="24.5" cy="29.5" r=".9"/><circle cx="38" cy="22" r="1"/></g></svg>'
  };
  const GAMES = {
    ludo: { name: 'Ludo', desc: 'Lempar dadu 3D, bawa 4 bidak pulang', bg: 'linear-gradient(160deg,#FF8A5C,#EA4C2A)', min: 2, max: 4 },
    domino: { name: 'Domino Gaple', desc: 'Sambung kartu, habiskan duluan', bg: 'linear-gradient(160deg,#4A4A52,#1C1C1E)', min: 2, max: 4 },
    congklak: { name: 'Congklak', desc: 'Sebar biji, isi lumbung terbanyak', bg: 'linear-gradient(160deg,#D99A55,#9C5A22)', min: 2, max: 2 }
  };

  /* =====================================================================
     DOMINO GAPLE
     ===================================================================== */
  const Domino = {
    init(n) {
      const tiles = [];
      for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push([a, b]);
      shuffle(tiles);
      const hands = {};
      for (let s = 0; s < n; s++) hands[s] = tiles.splice(0, 7);
      let turn = 0, best = -1;
      for (let s = 0; s < n; s++) hands[s].forEach(t => { if (t[0] === t[1] && t[0] > best) { best = t[0]; turn = s; } });
      return { n, hands, chain: [], ends: null, turn, passes: 0, winner: null, last: null, v: 1, gid: Date.now() + '' + rnd(1000) };
    },
    norm(st) {
      st.chain = arr(st.chain).map(t => arr(t));
      const h = {};
      for (let s = 0; s < st.n; s++) h[s] = arr((st.hands || {})[s]).map(t => arr(t));
      st.hands = h;
      st.ends = st.ends ? arr(st.ends) : null;
      if (st.winner === undefined) st.winner = null;
      return st;
    },
    moves(st, s) {
      const h = st.hands[s] || [];
      if (!st.ends) return h.map((t, i) => ({ i, side: 'R' }));
      const [l, r] = st.ends, out = [];
      h.forEach((t, i) => {
        if (t[0] === l || t[1] === l) out.push({ i, side: 'L' });
        if ((t[0] === r || t[1] === r) && !(l === r && (t[0] === l || t[1] === l))) out.push({ i, side: 'R' });
      });
      return out;
    },
    apply(st, s, mv) {
      st = this.norm(clone(st));
      if (st.winner !== null || st.turn !== s) return st;
      if (mv.pass) { st.passes++; st.last = { s, pass: true }; }
      else {
        const t = st.hands[s].splice(mv.i, 1)[0];
        if (!t) return st;
        let at;
        if (!st.ends) { st.chain = [t.slice()]; st.ends = [t[0], t[1]]; at = 0; }
        else if (mv.side === 'L') { const l = st.ends[0]; const tt = t[1] === l ? [t[0], t[1]] : [t[1], t[0]]; st.chain.unshift(tt); st.ends[0] = tt[0]; at = 0; }
        else { const r = st.ends[1]; const tt = t[0] === r ? [t[0], t[1]] : [t[1], t[0]]; st.chain.push(tt); st.ends[1] = tt[1]; at = st.chain.length - 1; }
        st.passes = 0; st.last = { s, t, at };
        if (!st.hands[s].length) { st.winner = s; st.reason = 'Kartunya habis duluan'; }
      }
      if (st.winner === null && st.passes >= st.n) {
        let best = 0, bs = 1e9;
        for (let k = 0; k < st.n; k++) { const sum = st.hands[k].reduce((a, t) => a + t[0] + t[1], 0); if (sum < bs) { bs = sum; best = k; } }
        st.winner = best; st.reason = 'Permainan buntu, nilai kartu paling kecil';
      }
      if (st.winner === null) st.turn = (st.turn + 1) % st.n;
      st.v++;
      return st;
    },
    bot(st, s) {
      const m = this.moves(st, s);
      if (!m.length) return { pass: true };
      const h = st.hands[s];
      const sc = mv => h[mv.i][0] + h[mv.i][1] + (h[mv.i][0] === h[mv.i][1] ? 3 : 0);
      m.sort((a, b) => sc(b) - sc(a));
      return m[0];
    }
  };
  // kartu domino presisi (rasio 1:2), pip 3×3, gradasi & paku tengah
  const PIPS = { 0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]] };
  function tileSvg(a, b, horiz, cls) {
    const half = (v, ox, oy) => PIPS[v].map(([r, c]) => horiz
      ? `<circle cx="${ox + 25 + c * 25}" cy="${oy + 25 + r * 25}" r="8.5" fill="url(#ttPip)"/>`
      : `<circle cx="${ox + 25 + c * 25}" cy="${oy + 25 + r * 25}" r="8.5" fill="url(#ttPip)"/>`).join('');
    if (horiz) {
      return `<svg class="${cls || ''}" viewBox="0 0 200 100"><rect x="3" y="3" width="194" height="94" rx="14" fill="url(#ttTile)" stroke="#C9BFAF" stroke-width="3"/><rect x="7" y="7" width="186" height="86" rx="11" fill="none" stroke="#fff" stroke-width="2" opacity=".8"/>${half(a, 0, 0)}<line x1="100" y1="14" x2="100" y2="86" stroke="#B9AE9C" stroke-width="3"/>${half(b, 100, 0)}<circle cx="100" cy="50" r="5" fill="url(#ttRivet)"/></svg>`;
    }
    return `<svg class="${cls || ''}" viewBox="0 0 100 200"><rect x="3" y="3" width="94" height="194" rx="14" fill="url(#ttTile)" stroke="#C9BFAF" stroke-width="3"/><rect x="7" y="7" width="86" height="186" rx="11" fill="none" stroke="#fff" stroke-width="2" opacity=".8"/>${half(a, 0, 0)}<line x1="14" y1="100" x2="86" y2="100" stroke="#B9AE9C" stroke-width="3"/>${half(b, 0, 100)}<circle cx="50" cy="100" r="5" fill="url(#ttRivet)"/></svg>`;
  }
  function renderDomino(box, st, ctx) {
    st = Domino.norm(clone(st));
    const me = ctx.mySeat;
    const chips = [];
    for (let s = 0; s < st.n; s++) if (s !== me) chips.push(`<div class="gp-chip ${st.turn === s && st.winner === null ? 'turn' : ''}">${seatAva(ctx, s)}<div><b>${esc(seatName(ctx, s))}</b><small>${st.hands[s].length} kartu</small></div><div class="dm-back">${Array.from({ length: Math.min(7, st.hands[s].length) }, () => '<i></i>').join('')}</div></div>`);
    const newAt = ctx.anim && ctx.anim.newAt;
    const chain = st.chain.length
      ? st.chain.map((t, i) => tileSvg(t[0], t[1], t[0] !== t[1], (t[0] === t[1] ? 'dbl' : 'hz') + (i === newAt ? ' dm-new' : ''))).join('')
      : `<div class="dm-empty">${st.turn === me && !ctx.spectator ? 'Kamu jalan duluan.<br>Pilih kartu mana saja.' : esc(seatName(ctx, st.turn)) + ' jalan duluan…'}</div>`;
    let myPart = '';
    if (me !== null && me !== undefined && !ctx.spectator) {
      const mv = ctx.canAct && st.turn === me && st.winner === null ? Domino.moves(st, me) : [];
      const ok = new Set(mv.map(m => m.i));
      myPart = `<div class="gp-label">Kartu Kamu ${st.turn === me && st.winner === null ? '<span class="gp-yourturn">GILIRANMU</span>' : ''}</div>
        <div class="dm-hand">${st.hands[me].map((t, i) => `<button type="button" class="dm-tile ${ok.has(i) ? 'ok' : ''}" data-i="${i}" ${ok.has(i) ? '' : 'disabled'}>${tileSvg(t[0], t[1], false)}</button>`).join('')}</div>
        <div id="dmSide" class="dm-side hidden"></div>`;
    }
    let status = '';
    if (st.winner === null) {
      if (st.last && st.last.pass) status = `${esc(seatName(ctx, st.last.s))} lewat, tidak punya kartu cocok.`;
      else if (st.ends) status = `Ujung kiri <b class="dm-end">${st.ends[0]}</b> · ujung kanan <b class="dm-end">${st.ends[1]}</b>`;
    }
    box.innerHTML = `<div class="gp-others">${chips.join('')}</div><div class="gp-status">${status}</div>
      <div class="dm-board"><div class="dm-felt">${chain}</div></div>${myPart}${resultHtml(ctx, st.winner, st.reason)}`;
    box.querySelectorAll('.dm-tile.ok').forEach(b => b.onclick = () => {
      SFX.tap();
      const i = +b.dataset.i;
      const opts = Domino.moves(st, me).filter(m => m.i === i);
      if (opts.length === 1) return ctx.act(opts[0]);
      box.querySelectorAll('.dm-tile').forEach(x => x.classList.toggle('picked', x === b));
      const side = $('dmSide');
      side.classList.remove('hidden');
      side.innerHTML = `<span>Taruh di mana?</span><button type="button" class="btn btn-primary btn-sm" data-s="L">◀ Kiri (${st.ends[0]})</button><button type="button" class="btn btn-primary btn-sm" data-s="R">Kanan (${st.ends[1]}) ▶</button>`;
      side.querySelectorAll('button').forEach(x => x.onclick = () => ctx.act({ i, side: x.dataset.s }));
    });
    if (ctx.canAct && st.turn === me && st.winner === null && !Domino.moves(st, me).length) ctx.autoPass('Tidak ada kartu yang cocok, kamu lewat…');
  }
  async function animDomino(prev, next, redraw) {
    const l = next.last;
    if (next.gid !== (prev && prev.gid)) { redraw(next); return; }
    if (l && l.pass) { SFX.pass(); redraw(next); await sleep(700); }
    else if (l && l.t) { redraw(next, { newAt: l.at }); SFX.clack(); await sleep(480); }
    else redraw(next);
    if (next.winner !== null && next.winner !== undefined) SFX.win();
  }

  /* =====================================================================
     LUDO (gaya Ludo King, papan & bidak 3D, dadu 3D)
     ===================================================================== */
  const LUDO_PATH = [[6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0]];
  const LUDO_HOME = { 0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], 1: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], 2: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], 3: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]] };
  const LUDO_BASE = { 0: [0, 0], 1: [0, 9], 2: [9, 9], 3: [9, 0] };
  const LUDO_COL = ['#F2453D', '#2DB84D', '#F7C21B', '#1F7FE0'];
  const LUDO_DARK = ['#A31F18', '#16772D', '#B88600', '#0E4F99'];
  const LUDO_LIGHT = ['#FF8A84', '#7BE495', '#FFE27A', '#7CB8FF'];
  const LUDO_SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
  const Ludo = {
    colorsFor(n) { return n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]; },
    init(n) {
      const tokens = {};
      for (let s = 0; s < n; s++) tokens[s] = [-1, -1, -1, -1];
      return { n, colors: this.colorsFor(n), tokens, turn: 0, dice: 0, rolled: false, winner: null, last: null, v: 1, gid: Date.now() + '' + rnd(1000) };
    },
    norm(st) {
      st.colors = arr(st.colors).map(Number);
      const t = {};
      for (let s = 0; s < st.n; s++) t[s] = arr((st.tokens || {})[s]).map(Number);
      st.tokens = t;
      if (st.winner === undefined) st.winner = null;
      if (st.last && st.last.caps) st.last.caps = arr(st.last.caps);
      return st;
    },
    abs(st, s, step) { return (st.colors[s] * 13 + step) % 52; },
    movable(st, s) {
      if (!st.rolled) return [];
      return st.tokens[s].map((t, i) => ((t === -1 && st.dice === 6) || (t >= 0 && t + st.dice <= 56)) ? i : -1).filter(i => i >= 0);
    },
    apply(st, s, mv) {
      st = this.norm(clone(st));
      if (st.winner !== null || st.turn !== s) return st;
      const next = () => { st.turn = (st.turn + 1) % st.n; };
      if (mv.roll) {
        if (st.rolled) return st;
        st.dice = 1 + rnd(6); st.rolled = true; st.last = { s, roll: st.dice };
        if (!this.movable(st, s).length) { st.rolled = false; st.last.none = true; next(); }
      } else if (mv.token !== undefined) {
        if (!this.movable(st, s).includes(mv.token)) return st;
        const old = st.tokens[s][mv.token];
        const step = old === -1 ? 0 : old + st.dice;
        st.tokens[s][mv.token] = step;
        const caps = [];
        if (step <= 50) {
          const a = this.abs(st, s, step);
          if (!LUDO_SAFE.includes(a)) for (let o = 0; o < st.n; o++) if (o !== s) st.tokens[o] = st.tokens[o].map((ts, k) => { if (ts >= 0 && ts <= 50 && this.abs(st, o, ts) === a) { caps.push({ s: o, i: k, from: ts }); return -1; } return ts; });
        }
        const finished = step === 56;
        st.last = { s, token: mv.token, from: old, to: step, captured: caps.length > 0, caps, finished, dice: st.dice };
        if (st.tokens[s].every(x => x === 56)) { st.winner = s; st.reason = 'Semua bidak sampai rumah'; }
        st.rolled = false;
        if (st.winner === null && !(st.dice === 6 || caps.length || finished)) next();
      }
      st.v++;
      return st;
    },
    bot(st, s) {
      if (!st.rolled) return { roll: true };
      const opts = this.movable(st, s);
      let best = opts[0], bs = -1e9;
      opts.forEach(i => {
        const t = st.tokens[s][i], step = t === -1 ? 0 : t + st.dice;
        let sc = step;
        if (t === -1) sc += 50;
        if (step === 56) sc += 80;
        if (step > 50) sc += 30;
        if (step <= 50) {
          const a = this.abs(st, s, step);
          if (LUDO_SAFE.includes(a)) sc += 15;
          else for (let o = 0; o < st.n; o++) if (o !== s && st.tokens[o].some(ts => ts >= 0 && ts <= 50 && this.abs(st, o, ts) === a)) sc += 100;
        }
        if (sc > bs) { bs = sc; best = i; }
      });
      return { token: best };
    },
    cell(st, s, step, i) {
      if (step === -1) { const [r0, c0] = LUDO_BASE[st.colors[s]]; const off = [[1.75, 1.75], [1.75, 4.25], [4.25, 1.75], [4.25, 4.25]][i]; return [r0 + off[0], c0 + off[1]]; }
      if (step <= 50) { const [r, c] = LUDO_PATH[this.abs(st, s, step)]; return [r + .5, c + .5]; }
      if (step <= 55) { const [r, c] = LUDO_HOME[st.colors[s]][step - 51]; return [r + .5, c + .5]; }
      const fin = [[6.9, 7.5], [7.5, 8.1], [8.1, 7.5], [7.5, 6.9]][st.colors[s]];
      return [fin[0] + (i - 1.5) * .12, fin[1] + (i - 1.5) * .12];
    }
  };
  // dadu 3D (CSS)
  const DICE_FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const DICE_PIP_POS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function diceHtml() {
    const face = (n, cls) => `<div class="dc-f ${cls}">${Array.from({ length: 9 }, (_, k) => `<i class="${DICE_PIP_POS[n].includes(k + 1) ? 'on' : ''}"></i>`).join('')}</div>`;
    return `<div class="dc-scene"><div class="dc-cube" id="dcCube">${face(1, 'f1')}${face(2, 'f2')}${face(3, 'f3')}${face(4, 'f4')}${face(5, 'f5')}${face(6, 'f6')}</div><div class="dc-shadow"></div></div>`;
  }
  let diceSpin = { x: 0, y: 0 };
  function diceShow(v, roll) {
    const cube = $('dcCube'); if (!cube) return;
    const [fx, fy] = DICE_FACE_ROT[v] || [0, 0];
    if (roll) { diceSpin.x += 720 + 360 * rnd(2); diceSpin.y += 720 + 360 * rnd(2); }
    const bx = Math.round(diceSpin.x / 360) * 360, by = Math.round(diceSpin.y / 360) * 360;
    diceSpin = { x: bx, y: by };
    cube.style.transition = roll ? 'transform .95s cubic-bezier(.15,.85,.25,1)' : 'none';
    cube.style.transform = `rotateX(${bx + fx}deg) rotateY(${by + fy}deg)`;
    const sc = cube.parentElement;
    if (roll) { sc.classList.remove('bounce'); void sc.offsetWidth; sc.classList.add('bounce'); }
  }
  function renderLudo(box, st, ctx) {
    st = Ludo.norm(clone(st));
    // saat bidak melompat: cukup gambar ulang kanvas (lebih ringan & mulus)
    if (ctx.anim && ctx.anim.hop && $('luCanvas')) {
      const cv = $('luCanvas');
      drawLudo(cv, parseInt(cv.style.width), window.devicePixelRatio || 1, st, ctx.anim.tokens, ctx.mySeat, [], ctx.anim.hop, ctx.anim.glow);
      return;
    }
    const me = ctx.mySeat;
    const myTurn = ctx.canAct && st.turn === me && st.winner === null;
    const mv = myTurn ? Ludo.movable(st, me) : [];
    const chips = [];
    for (let s = 0; s < st.n; s++) chips.push(`<div class="gp-chip ${st.turn === s && st.winner === null ? 'turn' : ''}" style="${st.turn === s && st.winner === null ? `box-shadow:inset 0 0 0 2.5px ${LUDO_COL[st.colors[s]]},var(--shadow)` : ''}"><span class="lu-pawn" style="--c:${LUDO_COL[st.colors[s]]};--d:${LUDO_DARK[st.colors[s]]}"></span><div><b>${esc(seatName(ctx, s))}</b><small>${st.tokens[s].filter(x => x === 56).length}/4 pulang</small></div></div>`);
    let status = '';
    if (st.winner === null) {
      const l = st.last;
      if (l && l.roll && l.none) status = `${esc(seatName(ctx, l.s))} dapat ${l.roll}, tidak ada bidak yang bisa jalan.`;
      else if (l && l.captured) status = `${esc(seatName(ctx, l.s))} memakan bidak lawan! Main lagi.`;
      else if (l && l.finished) status = `${esc(seatName(ctx, l.s))} membawa bidak pulang! Main lagi.`;
      else if (ctx.anim) status = 'Melempar dadu…';
      else if (myTurn) status = st.rolled ? `Dapat <b>${st.dice}</b>. Ketuk bidak yang menyala.` : '<b>Giliranmu!</b> Ketuk dadu untuk melempar.';
      else status = `Giliran ${esc(seatName(ctx, st.turn))}…`;
    }
    const turnCol = LUDO_COL[st.colors[st.turn]];
    box.innerHTML = `<div class="gp-others">${chips.join('')}</div><div class="gp-status">${status}</div>
      <div class="lu-wrap"><canvas id="luCanvas"></canvas></div>
      <div class="lu-ctrl" style="--tc:${turnCol}">
        <button type="button" id="luDiceBtn" class="lu-dicebtn ${myTurn && !st.rolled ? 'ready' : ''}" ${myTurn && !st.rolled ? '' : 'disabled'} aria-label="Lempar dadu">${diceHtml()}</button>
        <div class="lu-dicetxt">${myTurn && !st.rolled ? '<b>Ketuk dadu</b><br>untuk melempar' : (st.dice ? `Dadu: <b>${st.dice}</b>` : '')}</div>
      </div>
      ${resultHtml(ctx, st.winner, st.reason)}`;
    diceShow(st.dice || 6, false);
    const cv = $('luCanvas');
    const size = Math.min(box.clientWidth || 360, 540);
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr; cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const disp = (ctx.anim && ctx.anim.tokens) || st.tokens;
    const hop = (ctx.anim && ctx.anim.hop) || null;
    const hits = drawLudo(cv, size, dpr, st, disp, me, mv, hop, ctx.anim && ctx.anim.glow !== undefined ? ctx.anim.glow : st.turn);
    if (myTurn && st.rolled) cv.onclick = e => {
      const rc = cv.getBoundingClientRect(); const px = e.clientX - rc.left, py = e.clientY - rc.top;
      let best = null, bd = 1e9;
      hits.forEach(h => { const dd = Math.hypot(h.x - px, h.y - py); if (dd < bd) { bd = dd; best = h; } });
      if (best && bd < size / 15 * 1.4) { SFX.tap(); ctx.act({ token: best.i }); }
    };
    const db_ = $('luDiceBtn'); if (db_ && myTurn && !st.rolled) db_.onclick = () => { SFX.unlock(); ctx.act({ roll: true }); };
    if (myTurn && st.rolled && mv.length && new Set(mv.map(i => st.tokens[me][i])).size === 1) ctx.auto(() => ctx.act({ token: mv[0] }), 900);
  }
  function drawLudo(cv, S, dpr, st, tokens, me, mv, hop, glowSeat) {
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = S * .022, u = (S - 2 * m) / 15;
    const X = c => m + c * u, Y = r => m + r * u;
    // bingkai kayu
    let gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#C98A4B'); gr.addColorStop(1, '#7A4520');
    g.fillStyle = gr; roundRect(g, 0, 0, S, S, S * .04); g.fill();
    g.fillStyle = '#FBF8F2'; roundRect(g, m, m, S - 2 * m, S - 2 * m, S * .02); g.fill();
    // basis tiap warna
    [0, 1, 2, 3].forEach(c => {
      const [r0, c0] = LUDO_BASE[c];
      const active = st.colors[glowSeat] === c && st.winner === null;
      g.save();
      if (active) { g.shadowColor = LUDO_COL[c]; g.shadowBlur = u * .9; }
      gr = g.createLinearGradient(X(c0), Y(r0), X(c0 + 6), Y(r0 + 6)); gr.addColorStop(0, LUDO_LIGHT[c]); gr.addColorStop(.45, LUDO_COL[c]); gr.addColorStop(1, LUDO_DARK[c]);
      g.fillStyle = gr; roundRect(g, X(c0) + 1, Y(r0) + 1, 6 * u - 2, 6 * u - 2, u * .55); g.fill();
      g.restore();
      g.fillStyle = '#FFFFFF'; roundRect(g, X(c0 + .9), Y(r0 + .9), 4.2 * u, 4.2 * u, u * .5); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; roundRect(g, X(c0 + .9) + 1, Y(r0 + .9) + 1, 4.2 * u - 2, 4.2 * u - 2, u * .5); g.stroke();
      [[1.75, 1.75], [1.75, 4.25], [4.25, 1.75], [4.25, 4.25]].forEach(([dr, dc]) => {
        const x = X(c0 + dc), y = Y(r0 + dr);
        const rg = g.createRadialGradient(x - u * .15, y - u * .15, u * .1, x, y, u * .7); rg.addColorStop(0, LUDO_LIGHT[c] + '66'); rg.addColorStop(1, LUDO_COL[c] + '88');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, u * .66, 0, 7); g.fill();
        g.strokeStyle = LUDO_DARK[c] + '55'; g.lineWidth = 1.5; g.stroke();
      });
    });
    // jalur
    LUDO_PATH.forEach(([r, c], i) => {
      const start = [0, 13, 26, 39].indexOf(i);
      g.fillStyle = start >= 0 ? LUDO_COL[start] : '#FFFFFF';
      g.fillRect(X(c), Y(r), u, u);
      g.strokeStyle = '#D8D0C3'; g.lineWidth = 1; g.strokeRect(X(c) + .5, Y(r) + .5, u - 1, u - 1);
      if ([8, 21, 34, 47].includes(i)) { g.fillStyle = '#B8B0A3'; star(g, X(c + .5), Y(r + .5), u * .34); }
      if (start >= 0) { g.fillStyle = 'rgba(255,255,255,.9)'; star(g, X(c + .5), Y(r + .5), u * .32); }
    });
    [0, 1, 2, 3].forEach(c => LUDO_HOME[c].forEach(([r, cc]) => {
      gr = g.createLinearGradient(X(cc), Y(r), X(cc + 1), Y(r + 1)); gr.addColorStop(0, LUDO_LIGHT[c]); gr.addColorStop(1, LUDO_COL[c]);
      g.fillStyle = gr; g.fillRect(X(cc), Y(r), u, u);
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.strokeRect(X(cc) + .5, Y(r) + .5, u - 1, u - 1);
    }));
    // panah masuk rumah
    const arrow = (r, c, rot, col) => { g.save(); g.translate(X(c + .5), Y(r + .5)); g.rotate(rot); g.fillStyle = col; g.beginPath(); g.moveTo(-u * .28, -u * .2); g.lineTo(u * .3, 0); g.lineTo(-u * .28, u * .2); g.closePath(); g.fill(); g.restore(); };
    arrow(7, 0, 0, LUDO_COL[0]); arrow(0, 7, Math.PI / 2, LUDO_COL[1]); arrow(7, 14, Math.PI, LUDO_COL[2]); arrow(14, 7, -Math.PI / 2, LUDO_COL[3]);
    // tengah
    const tri = (c, pts) => { g.beginPath(); g.moveTo(X(pts[0][1]), Y(pts[0][0])); pts.slice(1).forEach(p => g.lineTo(X(p[1]), Y(p[0]))); g.closePath(); const tg = g.createLinearGradient(X(pts[0][1]), Y(pts[0][0]), X(7.5), Y(7.5)); tg.addColorStop(0, LUDO_COL[c]); tg.addColorStop(1, LUDO_DARK[c]); g.fillStyle = tg; g.fill(); };
    tri(0, [[6, 6], [7.5, 7.5], [9, 6]]); tri(1, [[6, 6], [7.5, 7.5], [6, 9]]); tri(2, [[6, 9], [7.5, 7.5], [9, 9]]); tri(3, [[9, 6], [7.5, 7.5], [9, 9]]);
    g.fillStyle = 'rgba(255,255,255,.9)'; star(g, X(7.5), Y(7.5), u * .45);
    // bidak (pion 3D)
    const spots = {}, draw = [];
    for (let s = 0; s < st.n; s++) (tokens[s] || []).forEach((t, i) => {
      let [r, c] = Ludo.cell(st, s, t, i);
      let lift = 0;
      if (hop && hop.s === s && hop.i === i) { r = hop.r; c = hop.c; lift = hop.lift; }
      const k = Math.round(r * 10) + ',' + Math.round(c * 10);
      spots[k] = (spots[k] || 0) + 1;
      draw.push({ s, i, r, c, k, n: spots[k], lift, step: t });
    });
    draw.sort((a, b) => a.r - b.r);
    const hits = [];
    const now = performance.now();
    draw.forEach(d => {
      const many = spots[d.k] > 1 && d.step >= 0 && d.step < 56;
      const off = many ? (d.n - 1 - (spots[d.k] - 1) / 2) * u * .3 : 0;
      const x = X(d.c) + off, y = Y(d.r);
      const can = d.s === me && mv.includes(d.i);
      const scale = many ? .78 : 1;
      if (can) { const p = (Math.sin(now / 180) + 1) / 2; g.beginPath(); g.ellipse(x, y + u * .18, u * (.48 + p * .1), u * (.2 + p * .04), 0, 0, 7); g.fillStyle = `rgba(255,255,255,${.75 - p * .3})`; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#EA6A0A'; g.stroke(); }
      pawn(g, x, y - (can ? Math.abs(Math.sin(now / 180)) * u * .12 : 0), u * scale, LUDO_COL[st.colors[d.s]], LUDO_DARK[st.colors[d.s]], LUDO_LIGHT[st.colors[d.s]], d.lift * u);
      if (can) hits.push({ x, y, i: d.i });
    });
    return hits;
  }
  function pawn(g, x, y, u, col, dark, light, lift) {
    const baseY = y + u * .22;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x, baseY + u * .02, u * .32 * (1 - lift / u * .3), u * .12, 0, 0, 7); g.fill();
    const yb = baseY - lift;
    // badan kerucut
    let gr = g.createLinearGradient(x - u * .3, 0, x + u * .3, 0); gr.addColorStop(0, light); gr.addColorStop(.45, col); gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - u * .3, yb); g.quadraticCurveTo(x - u * .3, yb + u * .09, x, yb + u * .09); g.quadraticCurveTo(x + u * .3, yb + u * .09, x + u * .3, yb);
    g.lineTo(x + u * .1, yb - u * .45); g.lineTo(x - u * .1, yb - u * .45); g.closePath(); g.fill();
    g.strokeStyle = dark; g.lineWidth = 1; g.stroke();
    // kepala bola
    const hy = yb - u * .55;
    gr = g.createRadialGradient(x - u * .08, hy - u * .08, u * .03, x, hy, u * .24); gr.addColorStop(0, '#fff'); gr.addColorStop(.25, light); gr.addColorStop(.7, col); gr.addColorStop(1, dark);
    g.fillStyle = gr; g.beginPath(); g.arc(x, hy, u * .22, 0, 7); g.fill();
    g.strokeStyle = dark; g.lineWidth = 1; g.stroke();
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
  async function animLudo(prev, next, redraw) {
    const l = next.last;
    if (!prev || next.gid !== prev.gid || !l) { redraw(next); return; }
    if (l.roll) {
      redraw(prev, { tokens: prev.tokens, glow: l.s });
      diceShow(l.roll, true); SFX.dice();
      await sleep(1000); SFX.land();
      redraw(next);
      if (l.none) await sleep(900);
      return;
    }
    if (l.token !== undefined) {
      const tokens = clone(prev.tokens);
      const s = l.s, i = l.token;
      const path = [];
      if (l.from === -1) path.push(0); else for (let k = l.from + 1; k <= l.to; k++) path.push(k);
      let [pr, pc] = Ludo.cell(next, s, l.from, i);
      for (const step of path) {
        const [nr, nc] = Ludo.cell(next, s, step, i);
        const t0 = performance.now(), D = 170;
        await new Promise(res => {
          const f = () => {
            const k = Math.min(1, (performance.now() - t0) / D);
            const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            redraw(next, { tokens, glow: s, hop: { s, i, r: pr + (nr - pr) * e, c: pc + (nc - pc) * e, lift: Math.sin(k * Math.PI) * .45 } });
            if (k < 1) requestAnimationFrame(f); else res();
          };
          requestAnimationFrame(f);
        });
        SFX.step();
        tokens[s][i] = step; pr = nr; pc = nc;
      }
      if (l.captured) { await sleep(120); SFX.capture(); (l.caps || []).forEach(c => { tokens[c.s][c.i] = -1; }); redraw(next, { tokens, glow: s }); await sleep(350); }
      if (l.finished) SFX.home();
      redraw(next);
      if (next.winner !== null && next.winner !== undefined) SFX.win();
    } else redraw(next);
  }

  /* =====================================================================
     CONGKLAK (2 pemain, 7 lubang + 1 lumbung masing-masing, 7 biji per lubang)
     Indeks: 0–6 lubang P0, 7 lumbung P0, 8–14 lubang P1, 15 lumbung P1.
     ===================================================================== */
  const Congklak = {
    init() { const b = []; for (let i = 0; i < 16; i++) b.push(i === 7 || i === 15 ? 0 : 7); return { n: 2, b, turn: 0, winner: null, last: null, v: 1, gid: Date.now() + '' + rnd(1000) }; },
    norm(st) { st.b = arr(st.b).map(Number); if (st.winner === undefined) st.winner = null; if (st.last && st.last.trace) st.last.trace = arr(st.last.trace); return st; },
    store(s) { return s === 0 ? 7 : 15; },
    side(st, s) { return st.b.slice(s * 8, s * 8 + 7).reduce((a, x) => a + x, 0); },
    moves(st, s) { const out = []; for (let p = 0; p < 7; p++) if (st.b[s * 8 + p] > 0) out.push({ pit: p }); return out; },
    apply(st, s, mv) {
      st = this.norm(clone(st));
      if (st.winner !== null || st.turn !== s) return st;
      const b = st.b, my = this.store(s), opp = this.store(1 - s);
      let idx = s * 8 + mv.pit;
      if (!(mv.pit >= 0 && mv.pit < 7) || !b[idx]) return st;
      let seeds = b[idx]; b[idx] = 0;
      const trace = [{ p: idx }];
      let pos = idx, extra = false, cap = null, guard = 0;
      while (guard++ < 2000) {
        while (seeds > 0) { pos = (pos + 1) % 16; if (pos === opp) continue; b[pos]++; seeds--; trace.push({ d: pos }); }
        if (pos === my) { extra = true; break; }
        if (b[pos] > 1) { seeds = b[pos]; b[pos] = 0; trace.push({ p: pos }); continue; }
        if (Math.floor(pos / 8) === s) { const o = 14 - pos; if (b[o] > 0) { cap = { at: pos, from: o, n: b[o] + 1 }; b[my] += b[o] + 1; b[o] = 0; b[pos] = 0; trace.push({ c: pos, o }); } }
        break;
      }
      st.last = { s, pit: mv.pit, trace, extra, cap };
      let nxt = extra ? s : 1 - s;
      if (this.side(st, nxt) === 0) nxt = 1 - nxt;
      if (this.side(st, nxt) === 0) {
        for (let k = 0; k < 2; k++) { for (let p = 0; p < 7; p++) { b[this.store(k)] += b[k * 8 + p]; b[k * 8 + p] = 0; } }
        st.winner = b[7] === b[15] ? -1 : (b[7] > b[15] ? 0 : 1);
        st.reason = b[7] === b[15] ? `Seri ${b[7]} : ${b[15]}` : `Lumbung ${Math.max(b[7], b[15])} biji lawan ${Math.min(b[7], b[15])}`;
      } else st.turn = nxt;
      st.v++;
      return st;
    },
    bot(st, s) {
      const ms = this.moves(st, s);
      let best = ms[0], bs = -1e9;
      ms.forEach(m => { const nx = this.apply(st, s, m); const sc = (nx.b[this.store(s)] - st.b[this.store(s)]) - (nx.b[this.store(1 - s)] - st.b[this.store(1 - s)]) + (nx.last.extra ? 6 : 0) + Math.random(); if (sc > bs) { bs = sc; best = m; } });
      return best;
    }
  };
  function seedsHtml(n, idx, big) {
    const show = Math.min(n, big ? 40 : 14);
    let h = '', sd = idx * 97 + 13;
    const R = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
    const cols = ['#FFF8EC', '#F3E3C8', '#FFFFFF', '#EAD7B7'];
    for (let k = 0; k < show; k++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * (big ? 38 : 30);
      h += `<i style="left:${50 + Math.cos(a) * rr}%;top:${50 + Math.sin(a) * rr * (big ? .55 : 1)}%;background:${cols[k % 4]};transform:translate(-50%,-50%) rotate(${R() * 180}deg)"></i>`;
    }
    return h;
  }
  function renderCongklak(box, st, ctx) {
    st = Congklak.norm(clone(st));
    const b = (ctx.anim && ctx.anim.b) || st.b;
    const hi = ctx.anim && ctx.anim.hi;
    const me = (ctx.mySeat === null || ctx.mySeat === undefined) ? 0 : ctx.mySeat;
    const op = 1 - me;
    const myTurn = ctx.canAct && st.turn === me && st.winner === null && !ctx.spectator;
    const hole = (i, mine) => {
      const can = mine && myTurn && !ctx.anim && b[i] > 0;
      return `<button type="button" class="ck-hole ${can ? 'ok' : ''} ${hi === i ? 'hi' : ''}" data-p="${i - (mine ? me * 8 : 0)}" ${can ? '' : 'disabled'}><span class="ck-seeds">${seedsHtml(b[i], i, false)}</span><span class="ck-num">${b[i]}</span></button>`;
    };
    let left = '', right = '';
    for (let p = 0; p < 7; p++) left += hole(me * 8 + p, true);            // kolom kiri: lubang kita, atas → bawah
    for (let p = 6; p >= 0; p--) right += hole(op * 8 + p, false);         // kolom kanan: lubang lawan, atas (6) → bawah (0)
    const storeEl = (i, who) => `<div class="ck-store ${hi === i ? 'hi' : ''}"><span class="ck-seeds">${seedsHtml(b[i], i, true)}</span><span class="ck-snum">${b[i]}</span><span class="ck-who">${who}</span></div>`;
    const chip = s => `<div class="gp-chip ${st.turn === s && st.winner === null ? 'turn' : ''}">${seatAva(ctx, s)}<div><b>${esc(seatName(ctx, s))}</b><small>Lumbung ${st.b[Congklak.store(s)]} biji</small></div></div>`;
    let status = '';
    if (st.winner === null && !ctx.anim) {
      const l = st.last;
      if (l && l.cap) status = `${esc(seatName(ctx, l.s))} menembak ${l.cap.n} biji ke lumbung!`;
      else if (l && l.extra) status = `${esc(seatName(ctx, l.s))} berhenti di lumbung, jalan lagi.`;
      else status = myTurn ? '<b>Giliranmu!</b> Ketuk lubang di kolom kiri.' : `Giliran ${esc(seatName(ctx, st.turn))}…`;
    } else if (ctx.anim) status = 'Menyebar biji…';
    box.innerHTML = `<div class="gp-others">${chip(op)}${chip(me)}</div><div class="gp-status">${status}</div>
      <div class="ck-board">${storeEl(Congklak.store(op), 'Lumbung ' + esc(seatName(ctx, op)))}
        <div class="ck-cols"><div class="ck-col"><div class="ck-lbl">${ctx.spectator ? esc(seatName(ctx, me)) : 'Lubang Kamu'} ↓</div>${left}</div><div class="ck-col"><div class="ck-lbl">↑ ${esc(seatName(ctx, op))}</div>${right}</div></div>
        ${storeEl(Congklak.store(me), 'Lumbung ' + esc(seatName(ctx, me)))}</div>
      ${st.winner === -1 ? `<div class="gp-result"><div class="gr-title">Seri!</div><div class="gr-sub">${esc(st.reason || '')}</div>${ctx.spectator ? '' : '<button type="button" class="btn btn-primary btn-block" onclick="TTG.mainLagi()">Main Lagi</button>'}</div>` : resultHtml(ctx, st.winner, st.reason)}`;
    box.querySelectorAll('.ck-hole.ok').forEach(h => h.onclick = () => { SFX.unlock(); SFX.tap(); ctx.act({ pit: +h.dataset.p }); });
  }
  async function animCongklak(prev, next, redraw) {
    const l = next.last;
    if (!prev || next.gid !== prev.gid || !l || !l.trace) { redraw(next); if (next.winner !== null && next.winner !== undefined) SFX.win(); return; }
    const b = prev.b.slice();
    const drops = l.trace.filter(t => t.d !== undefined).length;
    const D = Math.max(55, Math.min(170, 4200 / Math.max(1, drops)));
    for (const t of l.trace) {
      if (t.p !== undefined) { b[t.p] = 0; redraw(next, { b: b.slice(), hi: t.p }); SFX.pick(); await sleep(D * 1.6); }
      else if (t.d !== undefined) { b[t.d]++; redraw(next, { b: b.slice(), hi: t.d }); SFX.seed(); await sleep(D); }
      else if (t.c !== undefined) { const st = Congklak.store(l.s); b[st] += b[t.o] + b[t.c]; b[t.o] = 0; b[t.c] = 0; redraw(next, { b: b.slice(), hi: st }); SFX.capture(); await sleep(500); }
    }
    redraw(next);
    if (next.winner !== null && next.winner !== undefined) SFX.win(); else if (l.extra) SFX.home();
  }

  /* =====================================================================
     SESI GAME
     ===================================================================== */
  const ENG = { domino: Domino, ludo: Ludo, congklak: Congklak };
  const RENDER = { domino: renderDomino, ludo: renderLudo, congklak: renderCongklak };
  const ANIM = { domino: animDomino, ludo: animLudo, congklak: animCongklak };
  let cur = null;   // { game, mode, roomId, seats, mySeat, state (terbaru), shown (sedang tampil), queue, anim }
  let rooms = {};
  let botTimer = null, autoTimer = null, beatTimer = null, rafLoop = 0;

  function seatName(ctx, s) { const x = (ctx.seats || [])[s]; return x ? (x.key === myKey && !ctx.spectator ? 'Kamu' : x.name) : 'Kosong'; }
  function seatAva(ctx, s) {
    const x = (ctx.seats || [])[s];
    if (!x) return '';
    if (x.bot) return `<span class="ava" style="width:32px;height:32px;background:#8E8E93">${BOT_SVG}</span>`;
    return avaHtml(x.key, x.name).replace('class="ava', 'style="width:32px;height:32px;font-size:14px" class="ava');
  }
  function resultHtml(ctx, winner, reason) {
    if (winner === null || winner === undefined || winner < 0) return '';
    const iWin = !ctx.spectator && winner === ctx.mySeat;
    return `<div class="gp-result ${iWin ? 'win' : ''}">${iWin ? '<div class="gr-confetti"></div>' : ''}<div class="gr-title">${iWin ? 'Kamu Menang!' : esc(seatName(ctx, winner)) + ' Menang!'}</div><div class="gr-sub">${esc(reason || '')}</div>
      ${ctx.spectator ? '' : `<button type="button" class="btn btn-primary btn-block" onclick="TTG.mainLagi()">Main Lagi</button>`}</div>`;
  }
  const fresh = v => { const t = typeof v === 'number' ? v : (v && v.at) || 0; return Date.now() - t < FRESH; };
  function isDriver() {
    if (!cur || cur.mode === 'bot') return true;
    const room = rooms[cur.roomId]; if (!room) return false;
    const online = room.online || {};
    const seats = arr(room.seats);
    for (let s = 0; s < seats.length; s++) if (seats[s] && !seats[s].bot && fresh(online[seats[s].key])) return seats[s].key === myKey;
    return room.host === myKey;
  }

  /* ---------- jeda & keluar ---------- */
  function pauseInfo() {
    if (!cur) return null;
    if (cur.mode === 'bot') return cur.paused || null;
    const r = rooms[cur.roomId];
    return (r && r.status === 'playing' && r.paused) || null;
  }
  const isPaused = () => !!pauseInfo();
  function gameRunning() {
    if (!cur || !cur.state) return false;
    if (cur.mode !== 'bot') { const r = rooms[cur.roomId]; if (!r || r.status !== 'playing') return false; }
    return cur.state.winner === null || cur.state.winner === undefined;
  }
  function refreshHead() {
    const inGame = !!(cur && (cur.state || cur.roomId));
    $('gvExitTxt').textContent = inGame ? 'Keluar' : 'Kembali';
    $('gvPauseBtn').classList.toggle('hidden', !(gameRunning() && cur.mode !== 'watch' && !isPaused()));
    $('gvSoundBtn').innerHTML = SFX.muted ? '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  }
  function renderPause() {
    const p = pauseInfo();
    $('gvPause').classList.toggle('hidden', !p);
    if (p) {
      $('gvPauseBy').textContent = cur.mode === 'bot' ? 'Komputer ikut berhenti.' : (p.by === deviceName ? 'Kamu menjeda permainan untuk semua pemain.' : `Dijeda oleh ${p.by}.`);
      $('gvPauseResume').classList.toggle('hidden', cur.mode === 'watch');
    }
    refreshHead();
  }
  function jeda() {
    if (!cur || cur.mode === 'watch' || !gameRunning() || isPaused()) return;
    const p = { by: deviceName || 'Seseorang', at: Date.now() };
    if (cur.mode === 'bot') { cur.paused = p; clearTimeout(botTimer); clearTimeout(autoTimer); renderPause(); }
    else roomsRef.child(cur.roomId).update({ paused: p, activeAt: Date.now() });
  }
  function lanjut() {
    if (!cur || !pauseInfo()) return;
    if (cur.mode === 'bot') { cur.paused = null; renderPause(); tampil(); }
    else roomsRef.child(cur.roomId).update({ paused: null, activeAt: Date.now() });
  }
  async function keluar() {
    if (cur && gameRunning() && cur.mode !== 'watch') {
      const msg = cur.mode === 'bot' ? 'Permainan ini akan berakhir.' : 'Kursimu akan dilanjutkan oleh komputer.';
      if (!(await iosConfirm(msg, { title: 'Keluar dari Game?', okText: 'Keluar', destructive: true }))) return;
      const p = pauseInfo();
      if (p && cur.mode === 'online' && p.by === deviceName) lanjut();
    }
    closeView();
  }

  /* ---------- layar game ---------- */
  function openView(title) {
    $('gameView').classList.remove('hidden');
    $('gvTitle').textContent = title;
    $('gvBody').innerHTML = '';
    $('gvPause').classList.add('hidden');
    $('gvLive').classList.add('hidden');
    refreshHead();
  }
  function closeView() {
    stopAll();
    if (cur && cur.roomId) {
      const r = rooms[cur.roomId];
      db.ref(`thaitea/games/rooms/${cur.roomId}/online/${myKey}`).remove();
      db.ref(`thaitea/games/rooms/${cur.roomId}/viewers/${myKey}`).remove();
      if (r && cur.mode === 'online') {
        const seats = arr(r.seats);
        const mine = seats.findIndex(x => x && x.key === myKey);
        if (r.status === 'waiting') {
          if (r.host === myKey) roomsRef.child(cur.roomId).remove();
          else if (mine >= 0) db.ref(`thaitea/games/rooms/${cur.roomId}/seats/${mine}`).remove();
        } else if (r.status === 'playing' && mine >= 0) {
          db.ref(`thaitea/games/rooms/${cur.roomId}/seats/${mine}`).update({ bot: true, name: seats[mine].name + ' (bot)' });
        }
        roomsRef.child(cur.roomId).update({ activeAt: Date.now() });
      }
    }
    cur = null;
    $('gameView').classList.add('hidden');
    renderPane();
  }
  function stopAll() { clearTimeout(botTimer); clearTimeout(autoTimer); clearInterval(beatTimer); cancelAnimationFrame(rafLoop); rafLoop = 0; }
  function setLive(room) {
    const b = $('gvLive');
    if (!room || room.status !== 'playing') { b.classList.add('hidden'); return; }
    const n = Object.values(room.viewers || {}).filter(fresh).length;
    b.classList.remove('hidden');
    b.innerHTML = `<span class="live-dot"></span>LIVE${n ? ' · ' + n : ''}`;
  }

  /* ---------- alur tampilan: antrean state + animasi ---------- */
  function ctxFor(anim) {
    return {
      seats: cur.seats, mySeat: cur.mySeat, spectator: cur.mode === 'watch', anim,
      canAct: !cur.anim && !cur.queue.length && !isPaused() && cur.mode !== 'watch',
      act: mv => act(mv),
      auto: (fn, ms) => { clearTimeout(autoTimer); autoTimer = setTimeout(fn, ms); },
      autoPass: msg => { const sEl = document.querySelector('#gvBody .gp-status'); if (sEl) sEl.textContent = msg; clearTimeout(autoTimer); autoTimer = setTimeout(() => act({ pass: true }), 1500); }
    };
  }
  function draw(st, anim) { if (cur) RENDER[cur.game]($('gvBody'), st, ctxFor(anim)); }
  function tampil() {
    if (!cur || !cur.shown) return;
    draw(cur.shown);
    refreshHead();
    jadwalBot();
    // animasi kecil berulang (bidak yang bisa dipilih berdenyut)
    cancelAnimationFrame(rafLoop);
    if (cur.game === 'ludo') {
      const st = cur.shown;
      const loop = () => {
        if (!cur || cur.anim || cur.shown !== st) return;
        const cv = $('luCanvas'); if (!cv) return;
        const me = cur.mySeat, s2 = Ludo.norm(clone(st));
        const myTurn = !cur.anim && !isPaused() && cur.mode !== 'watch' && s2.turn === me && s2.winner === null;
        if (myTurn && s2.rolled) drawLudo(cv, parseInt(cv.style.width), window.devicePixelRatio || 1, s2, s2.tokens, me, Ludo.movable(s2, me), null, s2.turn);
        rafLoop = requestAnimationFrame(loop);
      };
      rafLoop = requestAnimationFrame(loop);
    }
  }
  function terima(st) {
    if (!cur) return;
    const eng = ENG[cur.game];
    st = eng.norm(clone(st));
    if (!cur.state || st.gid !== cur.state.gid) { cur.state = st; cur.shown = st; cur.queue = []; tampil(); return; }
    if (st.v <= cur.state.v) return;
    cur.state = st;
    cur.queue.push(st);
    jalankanAntrean();
  }
  async function jalankanAntrean() {
    if (!cur || cur.anim) return;
    const next = cur.queue.shift();
    if (!next) { tampil(); return; }
    cur.anim = true;
    clearTimeout(autoTimer); cancelAnimationFrame(rafLoop);
    const c = cur;
    try { await ANIM[cur.game](cur.shown, next, (st, anim) => { if (cur === c) draw(st, anim); }); } catch (e) { console.warn(e); }
    if (cur !== c) return;
    cur.shown = next; cur.anim = false;
    if (next.turn !== undefined && next.winner === null && cur.seats[next.turn] && cur.seats[next.turn].key === myKey && cur.mode !== 'watch' && (!cur.queue.length)) SFX.turn();
    jalankanAntrean();
  }
  function act(mv) {
    if (!cur || cur.mode === 'watch' || isPaused() || cur.anim || cur.queue.length) return;
    const eng = ENG[cur.game];
    const after = eng.apply(cur.state, cur.mySeat, mv);
    if (after.v === cur.state.v) return;
    commit(after);
  }
  function commit(st) {
    if (cur.mode === 'online') {
      roomsRef.child(cur.roomId).update({ state: st, activeAt: Date.now(), ...(st.winner !== null && st.winner !== undefined ? { status: 'done', winnerName: st.winner >= 0 ? seatName({ seats: cur.seats, spectator: true }, st.winner) : 'Seri' } : {}) });
    }
    terima(st);
  }
  function jadwalBot() {
    clearTimeout(botTimer);
    const st = cur && cur.state;
    if (!st || (st.winner !== null && st.winner !== undefined) || cur.anim || cur.queue.length) return;
    const seat = cur.seats[st.turn];
    if (!seat || !seat.bot || !isDriver() || isPaused()) return;
    const v = st.v;
    botTimer = setTimeout(() => {
      if (!cur || !cur.state || cur.state.v !== v || isPaused() || cur.anim) return;
      const eng = ENG[cur.game];
      const s = cur.state.turn;
      const after = eng.apply(cur.state, s, eng.bot(eng.norm(clone(cur.state)), s));
      if (after.v !== v) commit(after);
    }, cur.game === 'domino' ? 1100 : 750);
  }

  /* ---------- lawan komputer ---------- */
  function mulaiBot(game, n) {
    stopAll();
    if (game === 'congklak') n = 2;
    const seats = [{ key: myKey, name: deviceName || 'Kamu' }];
    for (let i = 1; i < n; i++) seats.push({ bot: true, name: BOT_NAMES[i - 1] });
    cur = { game, mode: 'bot', seats, mySeat: 0, queue: [], anim: false };
    openView(GAMES[game].name + ' · Lawan Komputer');
    SFX.unlock();
    terima(ENG[game].init(n));
  }

  /* ---------- online: meja ---------- */
  function buatMeja(game, max) {
    if (!myKey) { triggerToast('Pilih nama pengguna dulu', true); return; }
    if (game === 'congklak') max = 2;
    const id = 'R' + Date.now() + Math.random().toString(36).slice(2, 5);
    const room = { id, game, host: myKey, hostName: deviceName, status: 'waiting', max, createdAt: Date.now(), activeAt: Date.now(), seats: { 0: { key: myKey, name: deviceName } }, online: { [myKey]: Date.now() } };
    rooms[id] = room;
    roomsRef.child(id).set(room).then(() => {
      kirimNotif(`${deviceName} membuka meja ${GAMES[game].name}. Ayo ikut main!`, '🎮 Game');
      masukMeja(id, 'online');
    });
  }
  function gabungMeja(id) {
    const r = rooms[id];
    if (!r || r.status !== 'waiting') { triggerToast('Meja sudah mulai atau ditutup', true); return; }
    const seats = arr(r.seats);
    if (seats.some(x => x && x.key === myKey)) return masukMeja(id, 'online');
    let free = -1;
    for (let i = 0; i < r.max; i++) if (!seats[i]) { free = i; break; }
    if (free < 0) { triggerToast('Meja sudah penuh', true); return; }
    db.ref(`thaitea/games/rooms/${id}/seats/${free}`).set({ key: myKey, name: deviceName }).then(() => { roomsRef.child(id).update({ activeAt: Date.now() }); masukMeja(id, 'online'); });
  }
  function masukMeja(id, mode) {
    stopAll();
    const r = rooms[id];
    cur = { game: r ? r.game : 'ludo', mode, roomId: id, seats: [], mySeat: null, state: null, shown: null, queue: [], anim: false, enteredAt: Date.now() };
    openView((r ? GAMES[r.game].name : 'Game') + (mode === 'watch' ? ' · Menonton' : ' · Online'));
    SFX.unlock();
    const path = `thaitea/games/rooms/${id}/${mode === 'watch' ? 'viewers' : 'online'}/${myKey}`;
    const beat = () => db.ref(path).set(mode === 'watch' ? { name: deviceName, at: Date.now() } : Date.now());
    db.ref(path).onDisconnect().remove();
    beat();
    beatTimer = setInterval(beat, 25000);
    onRoomUpdate();
  }
  function onRoomUpdate() {
    if (!cur || !cur.roomId) return;
    const r = rooms[cur.roomId];
    if (!r && Date.now() - (cur.enteredAt || 0) < 4000) return;
    if (!r) { triggerToast('Meja ditutup'); stopAll(); cur = null; $('gameView').classList.add('hidden'); renderPane(); return; }
    cur.seats = arr(r.seats).map(x => x || null);
    const mine = cur.seats.findIndex(x => x && x.key === myKey);
    cur.mySeat = cur.mode === 'watch' ? null : (mine >= 0 ? mine : null);
    setLive(r);
    renderPause();
    if (r.status === 'waiting') { renderLobbyMeja(r); refreshHead(); return; }
    if (r.state) terima(r.state);
    if (!cur.anim && !cur.queue.length) tampil();
  }
  function renderLobbyMeja(r) {
    const seats = arr(r.seats);
    const g = GAMES[r.game];
    const isHost = r.host === myKey;
    const ada = seats.filter(Boolean).length;
    let rows = '';
    for (let i = 0; i < r.max; i++) {
      const x = seats[i];
      rows += `<div class="user-row">${x ? avaHtml(x.key, x.name) : '<span class="ava" style="background:#E5E5EA;color:#8E8E93">?</span>'}<div style="flex:1"><div class="un">${x ? esc(x.name) + (x.key === r.host ? ' <span class="pill pill-orange" style="font-size:11px">PEMBUAT</span>' : '') : 'Kursi kosong'}</div><div class="us">${x ? 'Siap' : 'Menunggu pemain…'}</div></div></div>`;
    }
    $('gvBody').innerHTML = `<div class="gl-hero" style="background:${g.bg}"><span class="gl-ico">${ICON[r.game]}</span><div><div class="gl-title">${g.name}</div><div class="gl-sub">Menunggu pemain · ${ada}/${r.max}</div></div></div>
      <div class="list" style="margin-top:12px">${rows}</div>
      <p class="card-sub" style="margin:10px 4px">Pengguna lain bisa ikut dari Hiburan → Game. Meja kosong lebih dari 2 menit akan tertutup otomatis.</p>
      ${isHost ? `<button type="button" class="btn btn-primary btn-lg btn-block" onclick="TTG.mulaiOnline()">Mulai Sekarang</button>` : `<div class="gp-hint">Menunggu ${esc(r.hostName || 'pembuat meja')} memulai…</div>`}
      <div id="glStartOpt"></div>
      <button type="button" class="btn btn-gray btn-block" style="margin-top:10px" onclick="TTG.tutup()">${isHost ? 'Batalkan Meja' : 'Keluar'}</button>`;
  }
  function mulaiOnline() {
    const r = rooms[cur.roomId]; if (!r || r.host !== myKey) return;
    const humans = arr(r.seats).filter(Boolean);
    const g = GAMES[r.game];
    if (humans.length >= r.max) return mulaiDengan(false);
    const box = $('glStartOpt');
    const bisaLanjut = humans.length >= g.min;
    box.innerHTML = `<div class="card" style="margin-top:12px"><div class="toggle-title">Baru ${humans.length} dari ${r.max} pemain yang ikut</div>
      <div class="toggle-desc">${bisaLanjut ? 'Mau langsung main berdua/bertiga, atau kursi kosong diisi komputer?' : 'Minimal 2 pemain. Kursi kosong bisa diisi komputer.'}</div>
      ${bisaLanjut ? `<button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:12px" onclick="TTG._mulai(false)">Lanjutkan dengan ${humans.length} Pemain</button>` : ''}
      <button type="button" class="btn ${bisaLanjut ? 'btn-tinted' : 'btn-primary'} btn-lg btn-block" style="margin-top:10px" onclick="TTG._mulai(true)">Isi Kursi Kosong dengan Komputer</button></div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function mulaiDengan(isiBot) {
    const r = rooms[cur.roomId]; if (!r || r.host !== myKey) return;
    const humans = arr(r.seats).filter(Boolean);
    const seats = humans.slice();
    if (isiBot) { let b = 0; while (seats.length < r.max) seats.push({ bot: true, name: BOT_NAMES[b++ % 3] }); }
    const n = Math.max(GAMES[r.game].min, seats.length);
    while (seats.length < n) seats.push({ bot: true, name: BOT_NAMES[seats.length % 3] });
    roomsRef.child(cur.roomId).update({ status: 'playing', seats, startedAt: Date.now(), activeAt: Date.now(), paused: null, state: ENG[r.game].init(n) });
  }
  function mainLagi() {
    if (!cur) return;
    if (cur.mode === 'bot') return mulaiBot(cur.game, cur.seats.length);
    const r = rooms[cur.roomId]; if (!r) return;
    roomsRef.child(cur.roomId).update({ status: 'playing', paused: null, activeAt: Date.now(), winnerName: null, state: ENG[r.game].init(arr(r.seats).length) });
  }

  /* ---------- tutup otomatis meja yang kosong ---------- */
  let lastClean = 0;
  function bersihkanMeja() {
    const now = Date.now();
    if (now - lastClean < 15000) return;
    lastClean = now;
    Object.values(rooms).forEach(r => {
      if (!r || !r.id) return;
      const inside = [...Object.values(r.online || {}), ...Object.values(r.viewers || {})].map(v => typeof v === 'number' ? v : (v && v.at) || 0);
      const life = Math.max(r.activeAt || r.createdAt || 0, ...inside);
      if (now - (r.createdAt || 0) > ROOM_TTL && now - life > IDLE_CLOSE) roomsRef.child(r.id).remove();
      else if (!r.paused && now - life > IDLE_CLOSE) roomsRef.child(r.id).remove();
    });
  }

  /* ---------- panel Game di menu Hiburan ---------- */
  function daftarMeja() {
    const now = Date.now();
    return Object.values(rooms).filter(r => r && r.id && GAMES[r.game] && now - (r.createdAt || 0) < ROOM_TTL);
  }
  function renderPane() {
    const box = $('gameList');
    if (!box) return;
    const list = daftarMeja();
    const live = list.filter(r => r.status === 'playing');
    const wait = list.filter(r => r.status === 'waiting');
    const liveHtml = live.length ? `<div class="section-label"><span><span class="live-dot"></span> Live Sekarang</span></div><div class="list">${live.map(r => {
      const seats = arr(r.seats).filter(Boolean);
      const v = Object.values(r.viewers || {}).filter(fresh).length;
      return `<div class="room-row" style="cursor:default"><span class="gl-mini" style="background:${GAMES[r.game].bg}">${ICON[r.game]}</span><div class="room-main"><div class="room-name">${GAMES[r.game].name}${r.paused ? ' <span class="pill" style="font-size:11px">DIJEDA</span>' : ''}</div><div class="room-last">${esc(seats.map(s => s.name).join(', '))}${v ? ' · ' + v + ' menonton' : ''}</div></div>
        <button type="button" class="btn btn-tinted btn-sm" onclick="TTG.tonton('${r.id}')">Tonton</button></div>`;
    }).join('')}</div>` : '';
    const waitHtml = wait.length ? `<div class="section-label"><span>Meja Menunggu Pemain</span></div><div class="list">${wait.map(r => {
      const seats = arr(r.seats).filter(Boolean);
      const mine = seats.some(s => s.key === myKey);
      return `<div class="room-row" style="cursor:default"><span class="gl-mini" style="background:${GAMES[r.game].bg}">${ICON[r.game]}</span><div class="room-main"><div class="room-name">${GAMES[r.game].name}</div><div class="room-last">Dibuat ${esc(r.hostName || '')} · ${seats.length}/${r.max} pemain</div></div>
        <button type="button" class="btn btn-primary btn-sm" onclick="TTG.gabung('${r.id}')">${mine ? 'Buka' : 'Ikut'}</button></div>`;
    }).join('')}</div>` : '';
    box.innerHTML = `${liveHtml}${waitHtml}<div class="section-label"><span>Pilih Game</span></div>
      <div class="game-grid">${Object.entries(GAMES).map(([k, g]) => `<button type="button" class="game-card" onclick="TTG.pilih('${k}')"><span class="gl-ico big" style="background:${g.bg}">${ICON[k]}</span><span class="gc-name">${g.name}</span><span class="gc-desc">${g.desc}</span></button>`).join('')}</div>`;
  }
  function pilih(game) {
    const g = GAMES[game];
    cur = null;
    openView(g.name);
    SFX.unlock();
    const nList = g.max === 2 ? [] : [2, 3, 4];
    $('gvBody').innerHTML = `<div class="gl-hero" style="background:${g.bg}"><span class="gl-ico">${ICON[game]}</span><div><div class="gl-title">${g.name}</div><div class="gl-sub">${g.desc}</div></div></div>
      <div class="card" style="margin-top:12px">${nList.length ? `<span class="field-label">Jumlah pemain</span><div class="segmented" id="glN">${nList.map(n => `<button type="button" data-n="${n}" class="${n === 2 ? 'active' : ''}">${n} pemain</button>`).join('')}</div>` : '<div class="toggle-desc" style="margin-bottom:4px">Dimainkan 2 orang.</div>'}
        <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:14px" id="glBot">${BOT_SVG.replace('#fff', 'currentColor').replace('width="18" height="18"', 'width="22" height="22"')} Main Lawan Komputer</button>
        <button type="button" class="btn btn-tinted btn-lg btn-block" style="margin-top:10px" id="glOnline"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg> Main Online</button>
        <p class="card-sub" style="margin-top:10px"><b>Main Online</b>: pengguna lain dapat pemberitahuan dan bisa ikut. Kalau saat mulai kursinya belum penuh, kamu bisa pilih lanjut atau isi dengan komputer.</p></div>`;
    let n = 2;
    document.querySelectorAll('#glN button').forEach(b => b.onclick = () => { n = +b.dataset.n; SFX.tap(); document.querySelectorAll('#glN button').forEach(x => x.classList.toggle('active', x === b)); });
    $('glBot').onclick = () => mulaiBot(game, n);
    $('glOnline').onclick = () => buatMeja(game, n);
  }

  /* ---------- gaya ---------- */
  const css = `
  .game-view{position:fixed;inset:0;z-index:1000000;background:var(--bg);display:flex;flex-direction:column}
  .gv-head{display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 10px 4px;background:rgba(247,247,247,.94);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-bottom:.5px solid var(--sep);flex:none}
  .gv-title{flex:1;font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gv-exit{display:flex;align-items:center;gap:2px;color:var(--accent);font-size:17px;font-weight:700;min-height:44px;padding:0 6px 0 2px;flex:none}
  .gv-pausebtn,.gv-soundbtn{width:42px;height:42px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex:none}
  .gv-soundbtn{background:var(--fill);color:var(--text2)}
  .gv-pausebtn:active,.gv-exit:active,.gv-soundbtn:active{opacity:.6}
  .gv-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px calc(env(safe-area-inset-bottom,0px) + 24px);max-width:600px;width:100%;margin:0 auto}
  .gv-pause{position:absolute;inset:0;z-index:5;background:rgba(242,242,247,.82);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:24px}
  .gvp-card{width:100%;max-width:360px;background:#fff;border-radius:26px;padding:26px 20px 20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.15);animation:gpop .3s cubic-bezier(.2,1.3,.4,1)}
  .gvp-ico{width:84px;height:84px;border-radius:50%;background:var(--accent);margin:0 auto 12px;display:flex;align-items:center;justify-content:center}
  .gvp-title{font-size:26px;font-weight:900}
  .gvp-sub{color:var(--text2);margin:6px 0 20px;font-size:16px}
  @keyframes gpop{from{transform:scale(.8);opacity:0}to{transform:none;opacity:1}}
  .live-badge{display:inline-flex;align-items:center;gap:6px;background:#FF3B30;color:#fff;font-size:12px;font-weight:800;padding:5px 9px;border-radius:8px;letter-spacing:.03em;flex:none}
  .live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF3B30;box-shadow:0 0 0 3px rgba(255,59,48,.25);animation:blink 1.2s infinite;vertical-align:1px}
  .live-badge .live-dot{background:#fff;box-shadow:none}
  .game-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .game-card{background:#fff;border-radius:20px;padding:16px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:var(--shadow);text-align:center;width:100%}
  .game-card:active{transform:scale(.97)}
  .gc-name{font-size:17px;font-weight:800}
  .gc-desc{font-size:13px;color:var(--text2);line-height:1.3}
  .gl-ico{width:56px;height:56px;border-radius:15px;display:flex;align-items:center;justify-content:center;flex:none}
  .gl-ico.big{width:68px;height:68px;border-radius:18px}
  .gl-ico svg,.gl-mini svg{width:76%;height:76%}
  .gl-mini{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}
  .gl-hero{border-radius:22px;padding:16px;display:flex;align-items:center;gap:14px;color:#fff}
  .gl-hero .gl-ico{background:rgba(255,255,255,.18)}
  .gl-title{font-size:22px;font-weight:800}
  .gl-sub{font-size:14px;opacity:.9}
  .gp-others{display:flex;flex-wrap:wrap;gap:8px}
  .gp-chip{display:flex;align-items:center;gap:8px;background:#fff;border-radius:14px;padding:6px 10px 6px 6px;box-shadow:var(--shadow);flex:1;min-width:130px;transition:box-shadow .2s}
  .gp-chip b{display:block;font-size:14px}.gp-chip small{font-size:12px;color:var(--text2)}
  .gp-chip.turn{box-shadow:inset 0 0 0 2.5px var(--accent),var(--shadow)}
  .gp-status{min-height:22px;margin:10px 4px;font-size:15px;color:var(--text2);text-align:center}
  .gp-hint{background:#fff;border-radius:14px;padding:14px;text-align:center;color:var(--text2);margin:10px 0}
  .gp-label{font-weight:800;margin:16px 4px 10px;display:flex;align-items:center;gap:8px}
  .gp-yourturn{background:var(--accent);color:#fff;font-size:11px;padding:3px 8px;border-radius:7px;letter-spacing:.04em;animation:blink 1.4s infinite}
  .gp-result{position:relative;overflow:hidden;margin-top:14px;background:#fff;border-radius:20px;padding:18px;text-align:center;box-shadow:var(--shadow);animation:gpop .4s cubic-bezier(.2,1.3,.4,1)}
  .gp-result.win{background:linear-gradient(160deg,#FFF3E2,#FFE0BD)}
  .gr-title{font-size:26px;font-weight:900;color:var(--accent)}
  .gr-sub{color:var(--text2);margin:4px 0 14px}
  /* Domino */
  .dm-back{display:flex;gap:2px;margin-left:auto}
  .dm-back i{width:7px;height:13px;border-radius:2px;background:linear-gradient(#5A5A62,#2C2C2E)}
  .dm-board{background:linear-gradient(160deg,#8C5A2B,#5E3714);border-radius:24px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.22)}
  .dm-felt{background:radial-gradient(circle at 50% 35%,#3DA36A,#1F6B41);border-radius:16px;min-height:min(62vh,420px);padding:14px 10px;display:flex;flex-wrap:wrap;gap:5px;align-items:center;align-content:center;justify-content:center;box-shadow:inset 0 3px 14px rgba(0,0,0,.35)}
  .dm-felt svg{filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
  .dm-felt svg.hz{width:66px;height:33px}.dm-felt svg.dbl{width:33px;height:66px}
  .dm-felt svg.dm-new{animation:dmIn .45s cubic-bezier(.2,1.2,.4,1)}
  @keyframes dmIn{0%{transform:translateY(-40px) scale(1.5) rotate(-12deg);opacity:0}60%{opacity:1}100%{transform:none}}
  .dm-empty{color:#fff;font-weight:700;font-size:18px;text-align:center;opacity:.9}
  .dm-end{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#fff;color:var(--text);align-items:center;justify-content:center;box-shadow:var(--shadow)}
  .dm-hand{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
  .dm-tile{padding:0;border-radius:10px;transition:transform .18s}
  .dm-tile svg{width:46px;height:92px;display:block;filter:drop-shadow(0 3px 3px rgba(0,0,0,.25))}
  .dm-tile:disabled{opacity:.45}
  .dm-tile.ok{transform:translateY(-8px);filter:drop-shadow(0 6px 8px rgba(234,106,10,.55))}
  .dm-tile.picked{transform:translateY(-16px) scale(1.06)}
  .dm-side{display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;font-weight:700;flex-wrap:wrap}
  /* Ludo */
  .lu-wrap{display:flex;justify-content:center}
  .lu-wrap canvas{border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.25);touch-action:manipulation}
  .lu-pawn{width:22px;height:26px;flex:none;position:relative}
  .lu-pawn::before{content:'';position:absolute;left:50%;top:0;width:13px;height:13px;margin-left:-6.5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,var(--c) 45%,var(--d))}
  .lu-pawn::after{content:'';position:absolute;left:50%;bottom:0;width:20px;height:14px;margin-left:-10px;background:linear-gradient(90deg,var(--c),var(--d));clip-path:polygon(30% 0,70% 0,100% 100%,0 100%);border-radius:0 0 8px 8px}
  .lu-ctrl{display:flex;align-items:center;gap:16px;margin-top:16px;padding:10px 16px;background:#fff;border-radius:20px;box-shadow:var(--shadow)}
  .lu-dicetxt{font-size:16px;color:var(--text2);line-height:1.35}
  .lu-dicetxt b{color:var(--text)}
  .lu-dicebtn{padding:6px;border-radius:18px;background:var(--bg)}
  .lu-dicebtn.ready{background:var(--tc);box-shadow:0 0 0 4px #fff,0 0 0 7px var(--tc);animation:pulse 1.2s infinite}
  .lu-dicebtn:disabled{cursor:default}
  @keyframes pulse{50%{transform:scale(1.06)}}
  .dc-scene{width:64px;height:64px;perspective:420px;position:relative}
  .dc-scene.bounce{animation:dcb .95s cubic-bezier(.3,1.4,.5,1)}
  @keyframes dcb{0%{transform:translateY(0)}25%{transform:translateY(-26px)}55%{transform:translateY(0)}70%{transform:translateY(-8px)}100%{transform:translateY(0)}}
  .dc-cube{width:100%;height:100%;position:relative;transform-style:preserve-3d}
  .dc-f{position:absolute;inset:0;border-radius:13px;background:linear-gradient(145deg,#FFFFFF,#ECE7DF);box-shadow:inset 0 0 0 2px rgba(0,0,0,.06),inset -4px -4px 10px rgba(0,0,0,.08);display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:9px;backface-visibility:hidden}
  .dc-f i{display:block;width:12px;height:12px;margin:auto;border-radius:50%}
  .dc-f i.on{background:radial-gradient(circle at 35% 35%,#555,#111);box-shadow:inset 0 1px 1px rgba(255,255,255,.3)}
  .dc-f.f1 i.on{background:radial-gradient(circle at 35% 35%,#FF6B5E,#B3140B);width:15px;height:15px}
  .dc-f.f1{transform:rotateY(0deg) translateZ(32px)}.dc-f.f2{transform:rotateY(90deg) translateZ(32px)}.dc-f.f6{transform:rotateY(180deg) translateZ(32px)}
  .dc-f.f5{transform:rotateY(-90deg) translateZ(32px)}.dc-f.f3{transform:rotateX(90deg) translateZ(32px)}.dc-f.f4{transform:rotateX(-90deg) translateZ(32px)}
  .dc-shadow{position:absolute;left:8px;right:8px;bottom:-10px;height:10px;border-radius:50%;background:rgba(0,0,0,.18);filter:blur(3px)}
  /* Congklak */
  .ck-board{background:linear-gradient(90deg,#B9783C,#D99A55 30%,#E7B272 50%,#D99A55 70%,#B9783C);border-radius:90px;padding:16px 14px;box-shadow:0 12px 30px rgba(90,50,15,.35),inset 0 2px 0 rgba(255,255,255,.3),inset 0 -4px 10px rgba(0,0,0,.2);display:flex;flex-direction:column;align-items:center;gap:10px;max-width:420px;margin:0 auto}
  .ck-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%}
  .ck-col{display:flex;flex-direction:column;align-items:center;gap:7px}
  .ck-store .ck-seeds{left:46%;right:50px;top:12%;bottom:12%}
  .ck-lbl{font-size:12px;font-weight:800;color:#5A3210;opacity:.8;text-transform:uppercase;letter-spacing:.04em}
  .ck-hole{position:relative;width:min(24vw,92px);height:min(11.5vw,48px);border-radius:50%;background:radial-gradient(ellipse at 50% 35%,#6E3E16,#8E5525 60%,#A8682F);box-shadow:inset 0 5px 10px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.35);padding:0;transition:transform .15s,box-shadow .2s}
  .ck-hole.ok{box-shadow:inset 0 5px 10px rgba(0,0,0,.55),0 0 0 3px #fff,0 0 0 6px var(--accent);animation:pulse 1.4s infinite}
  .ck-hole.hi,.ck-store.hi{box-shadow:inset 0 5px 10px rgba(0,0,0,.55),0 0 0 4px #FFE08A}
  .ck-hole:disabled{cursor:default}
  .ck-seeds{position:absolute;inset:8% 10%}
  .ck-seeds i{position:absolute;width:10px;height:7px;border-radius:50%;box-shadow:inset 0 -1px 1px rgba(0,0,0,.25),0 1px 1px rgba(0,0,0,.4)}
  .ck-num{position:absolute;right:-6px;top:-6px;min-width:24px;height:24px;padding:0 5px;border-radius:12px;background:#fff;color:#5A3210;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}
  .ck-store{position:relative;width:min(62vw,250px);height:min(14vw,58px);border-radius:40px;background:radial-gradient(ellipse at 50% 35%,#6E3E16,#8E5525 60%,#A8682F);box-shadow:inset 0 6px 12px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.35)}
  .ck-snum{position:absolute;right:10px;top:50%;transform:translateY(-50%);min-width:34px;height:34px;padding:0 6px;border-radius:17px;background:var(--accent);color:#fff;font-weight:900;font-size:17px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .ck-who{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#FFE7C4;font-size:12px;font-weight:800;max-width:55%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  // gradasi bersama untuk kartu domino
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.style.position = 'absolute';
  defs.innerHTML = '<defs><linearGradient id="ttTile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEE7DB"/></linearGradient><radialGradient id="ttPip" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#4A4A4A"/><stop offset="1" stop-color="#0D0D0D"/></radialGradient><radialGradient id="ttRivet" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#FFE7A3"/><stop offset="1" stop-color="#B07A12"/></radialGradient></defs>';
  document.body.appendChild(defs);
  const view = document.createElement('div');
  view.id = 'gameView'; view.className = 'game-view hidden';
  view.innerHTML = `<div class="gv-head">
      <button type="button" class="gv-exit" onclick="TTG.keluar()"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="gvExitTxt">Kembali</span></button>
      <div id="gvTitle" class="gv-title"></div><span id="gvLive" class="live-badge hidden"></span>
      <button type="button" id="gvSoundBtn" class="gv-soundbtn" onclick="TTG.suara()" aria-label="Suara"></button>
      <button type="button" id="gvPauseBtn" class="gv-pausebtn hidden" onclick="TTG.jeda()" aria-label="Jeda"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button>
    </div>
    <div id="gvBody" class="gv-body"></div>
    <div id="gvPause" class="gv-pause hidden"><div class="gvp-card">
      <div class="gvp-ico"><svg viewBox="0 0 24 24" width="44" height="44"><path fill="#fff" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></div>
      <div class="gvp-title">Permainan Dijeda</div>
      <div id="gvPauseBy" class="gvp-sub"></div>
      <button type="button" id="gvPauseResume" class="btn btn-primary btn-lg btn-block" onclick="TTG.lanjut()"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> Lanjutkan</button>
      <button type="button" class="btn btn-red-tinted btn-lg btn-block" style="margin-top:10px" onclick="TTG.keluar()">Keluar dari Game</button>
    </div></div>`;
  (document.getElementById('thaiTeaAppRoot') || document.body).appendChild(view);
  view.addEventListener('pointerdown', () => SFX.unlock(), { passive: true });

  roomsRef.on('value', snap => {
    rooms = snap.val() || {};
    bersihkanMeja();
    if (cur && cur.roomId) onRoomUpdate();
    if (!document.getElementById('tab-hiburan').classList.contains('hidden')) renderPane();
  });
  setInterval(() => { lastClean = 0; bersihkanMeja(); }, 30000);

  window.TTG = {
    renderPane, pilih, tutup: closeView, keluar, jeda, lanjut, mulaiOnline, _mulai: mulaiDengan, mainLagi,
    gabung: gabungMeja, tonton: id => masukMeja(id, 'watch'),
    suara: () => { SFX.toggle(); refreshHead(); if (!SFX.muted) SFX.tap(); },
    _engines: { Domino, Ludo, Congklak }
  };
})();
