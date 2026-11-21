/* =====================================================================
   GAME Kasir Thai Tea: Domino Gaple, Ludo, Snake, Potong Buah
   - Lawan Komputer (bot, tanpa internet untuk logika game)
   - Online bareng pengguna (Firebase: thaitea/games/rooms), 2–4 pemain, kursi kosong diisi bot
   - Live: pengguna lain bisa menonton meja yang sedang main
   Bergantung pada variabel global dari index.html: db, myKey, deviceName, usersData, esc,
   triggerToast, iosConfirm, kirimNotif, warnaNama, avaHtml, firebase.
   ===================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rnd = n => Math.floor(Math.random() * n);
  const clone = o => JSON.parse(JSON.stringify(o));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const TS = () => (firebase.database && firebase.database.ServerValue) ? firebase.database.ServerValue.TIMESTAMP : Date.now();
  const BOT_NAMES = ['Robo Tea', 'Bot Boba', 'Bot Matcha'];
  const roomsRef = db.ref('thaitea/games/rooms');
  const BOT_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#fff" d="M11 2h2v3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2zm-2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';
  const ROOM_TTL = 6 * 3600 * 1000;

  /* ---------------- ikon gaya iOS ---------------- */
  const ICON = {
    domino: '<svg viewBox="0 0 48 48"><rect x="13" y="5" width="22" height="38" rx="5" fill="#fff"/><path d="M14 24h20" stroke="#1C1C1E" stroke-width="2"/><circle cx="19" cy="11" r="2.4" fill="#1C1C1E"/><circle cx="29" cy="18" r="2.4" fill="#1C1C1E"/><circle cx="24" cy="14.5" r="2.4" fill="#1C1C1E"/><circle cx="19" cy="30" r="2.4" fill="#1C1C1E"/><circle cx="29" cy="30" r="2.4" fill="#1C1C1E"/><circle cx="19" cy="37" r="2.4" fill="#1C1C1E"/><circle cx="29" cy="37" r="2.4" fill="#1C1C1E"/></svg>',
    ludo: '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="17" height="17" rx="3" fill="#FF4D4D"/><rect x="25" y="6" width="17" height="17" rx="3" fill="#34C759"/><rect x="6" y="25" width="17" height="17" rx="3" fill="#1E88E5"/><rect x="25" y="25" width="17" height="17" rx="3" fill="#FFD60A"/><rect x="15" y="15" width="18" height="18" rx="4" fill="#fff"/><circle cx="20" cy="20" r="2" fill="#1C1C1E"/><circle cx="28" cy="28" r="2" fill="#1C1C1E"/><circle cx="24" cy="24" r="2" fill="#1C1C1E"/></svg>',
    snake: '<svg viewBox="0 0 48 48"><path d="M10 36c0-6 5-8 10-8h8c4 0 6-2 6-5s-2-5-6-5h-6" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="20" cy="18" r="5" fill="#fff"/><circle cx="18.5" cy="16.5" r="1.4" fill="#1C1C1E"/><circle cx="38" cy="12" r="3.5" fill="#FF3B30"/></svg>',
    buah: '<svg viewBox="0 0 48 48"><path d="M8 22a16 16 0 0 0 32 0z" fill="#34C759"/><path d="M11 22a13 13 0 0 0 26 0z" fill="#FF4D6D"/><circle cx="18" cy="27" r="1.4" fill="#1C1C1E"/><circle cx="24" cy="30" r="1.4" fill="#1C1C1E"/><circle cx="30" cy="27" r="1.4" fill="#1C1C1E"/><path d="M34 6L14 40" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/></svg>'
  };
  const GAMES = {
    domino: { name: 'Domino Gaple', desc: 'Sambung kartu, habiskan duluan', bg: 'linear-gradient(160deg,#4A4A52,#1C1C1E)', turn: true, min: 2, max: 4 },
    ludo: { name: 'Ludo', desc: 'Lempar dadu, bawa 4 bidak pulang', bg: 'linear-gradient(160deg,#FF8A5C,#EA4C2A)', turn: true, min: 2, max: 4 },
    snake: { name: 'Snake', desc: 'Makan sebanyak-banyaknya, 90 detik', bg: 'linear-gradient(160deg,#4CD964,#1E9E4A)', turn: false, min: 1, max: 4, dur: 90 },
    buah: { name: 'Potong Buah', desc: 'Geser jari memotong buah, 60 detik', bg: 'linear-gradient(160deg,#FF6B8B,#E8325A)', turn: false, min: 1, max: 4, dur: 60 }
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
        if (!st.ends) { st.chain = [t.slice()]; st.ends = [t[0], t[1]]; }
        else if (mv.side === 'L') { const l = st.ends[0]; const tt = t[1] === l ? [t[0], t[1]] : [t[1], t[0]]; st.chain.unshift(tt); st.ends[0] = tt[0]; }
        else { const r = st.ends[1]; const tt = t[0] === r ? [t[0], t[1]] : [t[1], t[0]]; st.chain.push(tt); st.ends[1] = tt[1]; }
        st.passes = 0; st.last = { s, t };
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
      m.sort((a, b) => (h[b.i][0] + h[b.i][1] + (h[b.i][0] === h[b.i][1] ? 3 : 0)) - (h[a.i][0] + h[a.i][1] + (h[a.i][0] === h[a.i][1] ? 3 : 0)));
      return m[0];
    }
  };
  const PIPS = { 0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]] };
  function tileSvg(a, b, horiz, cls) {
    const W = horiz ? 64 : 32, H = horiz ? 32 : 64;
    const half = (v, ox, oy) => PIPS[v].map(([r, c]) => `<circle cx="${ox + 7 + c * 9}" cy="${oy + 7 + r * 9}" r="3" fill="#1C1C1E"/>`).join('');
    const body = horiz
      ? `${half(a, 0, 0)}<line x1="32" y1="4" x2="32" y2="28" stroke="#C7C7CC" stroke-width="1.5"/>${half(b, 32, 0)}`
      : `${half(a, 0, 0)}<line x1="4" y1="32" x2="28" y2="32" stroke="#C7C7CC" stroke-width="1.5"/>${half(b, 0, 32)}`;
    return `<svg class="${cls || ''}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="#FFFDF8" stroke="#D9D2C8" stroke-width="1.5"/>${body}</svg>`;
  }
  function renderDomino(box, st, ctx) {
    st = Domino.norm(clone(st));
    const me = ctx.mySeat;
    const others = [];
    for (let s = 0; s < st.n; s++) if (s !== me) others.push(s);
    const head = others.map(s => `<div class="gp-chip ${st.turn === s && st.winner === null ? 'turn' : ''}">${seatAva(ctx, s)}<div><b>${esc(seatName(ctx, s))}</b><small>${st.hands[s].length} kartu</small></div></div>`).join('');
    const chain = st.chain.length ? st.chain.map(t => tileSvg(t[0], t[1], t[0] !== t[1], t[0] === t[1] ? 'dbl' : '')).join('') : '<div class="gp-hint">Meja masih kosong. ' + (st.turn === me ? 'Kamu jalan duluan, pilih kartu mana saja.' : `${esc(seatName(ctx, st.turn))} jalan duluan.`) + '</div>';
    let myPart = '';
    if (me !== null && me !== undefined && !ctx.spectator) {
      const mv = st.turn === me && st.winner === null ? Domino.moves(st, me) : [];
      const ok = new Set(mv.map(m => m.i));
      myPart = `<div class="gp-label">Kartu ${esc(seatName(ctx, me))} ${st.turn === me && st.winner === null ? '<span class="gp-yourturn">GILIRANMU</span>' : ''}</div>
        <div class="dm-hand">${st.hands[me].map((t, i) => `<button type="button" class="dm-tile ${ok.has(i) ? 'ok' : ''}" data-i="${i}" ${ok.has(i) ? '' : 'disabled'}>${tileSvg(t[0], t[1], false)}</button>`).join('')}</div>
        <div id="dmSide" class="dm-side hidden"></div>`;
    }
    const status = st.winner !== null ? '' : (st.last && st.last.pass ? `${esc(seatName(ctx, st.last.s))} lewat (tidak punya kartu cocok).` : (st.ends ? `Ujung: <b>${st.ends[0]}</b> dan <b>${st.ends[1]}</b>` : ''));
    box.innerHTML = `<div class="gp-others">${head}</div><div class="gp-status">${status}</div><div class="dm-chain">${chain}</div>${myPart}${resultHtml(ctx, st.winner, st.reason)}`;
    box.querySelectorAll('.dm-tile.ok').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      const opts = Domino.moves(st, me).filter(m => m.i === i);
      if (opts.length === 1) return ctx.act(opts[0]);
      const side = $('dmSide');
      side.classList.remove('hidden');
      side.innerHTML = `<span>Taruh di mana?</span><button type="button" class="btn btn-tinted btn-sm" data-s="L">Kiri (${st.ends[0]})</button><button type="button" class="btn btn-tinted btn-sm" data-s="R">Kanan (${st.ends[1]})</button>`;
      side.querySelectorAll('button').forEach(x => x.onclick = () => ctx.act({ i, side: x.dataset.s }));
    });
    if (!ctx.spectator && st.turn === me && st.winner === null && !Domino.moves(st, me).length) ctx.autoPass('Tidak ada kartu yang cocok, kamu lewat…');
  }

  /* =====================================================================
     LUDO
     ===================================================================== */
  const LUDO_PATH = [[6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0]];
  const LUDO_HOME = { 0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], 1: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], 2: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], 3: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]] };
  const LUDO_BASE = { 0: [0, 0], 1: [0, 9], 2: [9, 9], 3: [9, 0] };
  const LUDO_COL = ['#FF4D4D', '#34C759', '#FFC300', '#1E88E5'];
  const LUDO_COL_NAME = ['Merah', 'Hijau', 'Kuning', 'Biru'];
  const LUDO_SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
  const Ludo = {
    colorsFor(n) { return n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]; },
    init(n) {
      const tokens = {};
      for (let s = 0; s < n; s++) tokens[s] = [-1, -1, -1, -1];
      return { n, colors: this.colorsFor(n), tokens, turn: 0, dice: 0, rolled: false, winner: null, last: null, v: 1, gid: Date.now() + '' + rnd(1000) };
    },
    norm(st) {
      st.colors = arr(st.colors);
      const t = {};
      for (let s = 0; s < st.n; s++) t[s] = arr((st.tokens || {})[s]).map(Number);
      st.tokens = t;
      if (st.winner === undefined) st.winner = null;
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
        let captured = false;
        if (step <= 50) {
          const a = this.abs(st, s, step);
          if (!LUDO_SAFE.includes(a)) {
            for (let o = 0; o < st.n; o++) if (o !== s) st.tokens[o] = st.tokens[o].map(ts => (ts >= 0 && ts <= 50 && this.abs(st, o, ts) === a) ? (captured = true, -1) : ts);
          }
        }
        const finished = step === 56;
        st.last = { s, token: mv.token, from: old, to: step, captured, finished, dice: st.dice };
        if (st.tokens[s].every(x => x === 56)) { st.winner = s; st.reason = 'Semua bidak sampai rumah'; }
        st.rolled = false;
        if (st.winner === null && !(st.dice === 6 || captured || finished)) next();
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
      if (step === -1) { const [r0, c0] = LUDO_BASE[st.colors[s]]; const off = [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]][i]; return [r0 + off[0], c0 + off[1]]; }
      if (step <= 50) { const [r, c] = LUDO_PATH[this.abs(st, s, step)]; return [r + .5, c + .5]; }
      if (step <= 55) { const [r, c] = LUDO_HOME[st.colors[s]][step - 51]; return [r + .5, c + .5]; }
      return [7.5, 7.5];
    }
  };
  const DICE_PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]] };
  function diceSvg(v, color) {
    return `<svg viewBox="0 0 48 48" width="56" height="56"><rect x="3" y="3" width="42" height="42" rx="10" fill="#fff" stroke="${color || '#1C1C1E'}" stroke-width="3"/>${(DICE_PIPS[v] || []).map(([r, c]) => `<circle cx="${12 + c * 12}" cy="${12 + r * 12}" r="4.2" fill="${color || '#1C1C1E'}"/>`).join('')}</svg>`;
  }
  function renderLudo(box, st, ctx) {
    st = Ludo.norm(clone(st));
    const me = ctx.mySeat;
    const turnCol = LUDO_COL[st.colors[st.turn]];
    const myTurn = !ctx.spectator && st.turn === me && st.winner === null;
    const mv = myTurn ? Ludo.movable(st, me) : [];
    const chips = [];
    for (let s = 0; s < st.n; s++) chips.push(`<div class="gp-chip ${st.turn === s && st.winner === null ? 'turn' : ''}"><span class="lu-dot" style="background:${LUDO_COL[st.colors[s]]}"></span><div><b>${esc(seatName(ctx, s))}</b><small>${st.tokens[s].filter(x => x === 56).length}/4 pulang</small></div></div>`);
    let status = '';
    if (st.winner === null) {
      const l = st.last;
      if (l && l.roll && l.none) status = `${esc(seatName(ctx, l.s))} dapat ${l.roll}, tidak ada bidak yang bisa jalan.`;
      else if (l && l.captured) status = `${esc(seatName(ctx, l.s))} memakan bidak lawan! Dapat giliran lagi.`;
      else if (l && l.finished) status = `${esc(seatName(ctx, l.s))} membawa bidak pulang!`;
      else if (myTurn) status = st.rolled ? `Dadu ${st.dice}. Ketuk bidak yang menyala.` : 'Giliranmu, ketuk Lempar Dadu.';
      else status = `Giliran ${esc(seatName(ctx, st.turn))}…`;
    }
    box.innerHTML = `<div class="gp-others">${chips.join('')}</div><div class="gp-status">${status}</div>
      <div class="lu-wrap"><canvas id="luCanvas"></canvas></div>
      <div class="lu-ctrl"><div class="lu-dice">${st.dice ? diceSvg(st.dice, turnCol) : diceSvg(6, '#C7C7CC')}</div>
        ${myTurn && !st.rolled ? `<button type="button" id="luRoll" class="btn btn-primary btn-lg" style="flex:1">Lempar Dadu</button>` : `<div class="gp-hint" style="flex:1;margin:0">${myTurn ? 'Pilih bidak' : 'Menunggu…'}</div>`}</div>
      ${resultHtml(ctx, st.winner, st.reason)}`;
    const cv = $('luCanvas');
    const size = Math.min(box.clientWidth || 360, 520);
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr; cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const u = size / 15;
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    [0, 1, 2, 3].forEach(c => {
      const [r0, c0] = LUDO_BASE[c];
      g.fillStyle = LUDO_COL[c]; roundRect(g, c0 * u, r0 * u, 6 * u, 6 * u, u * .6); g.fill();
      g.fillStyle = '#fff'; roundRect(g, (c0 + .8) * u, (r0 + .8) * u, 4.4 * u, 4.4 * u, u * .5); g.fill();
      [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]].forEach(([dr, dc]) => { g.beginPath(); g.arc((c0 + dc) * u, (r0 + dr) * u, u * .55, 0, 7); g.fillStyle = LUDO_COL[c] + '55'; g.fill(); });
      LUDO_HOME[c].forEach(([r, cc]) => { g.fillStyle = LUDO_COL[c]; g.fillRect(cc * u, r * u, u, u); });
    });
    LUDO_PATH.forEach(([r, c], i) => {
      const start = [0, 13, 26, 39].indexOf(i);
      g.fillStyle = start >= 0 ? LUDO_COL[start] : '#fff';
      g.fillRect(c * u, r * u, u, u);
      g.strokeStyle = '#D9D2C8'; g.lineWidth = 1; g.strokeRect(c * u + .5, r * u + .5, u - 1, u - 1);
      if ([8, 21, 34, 47].includes(i)) { g.fillStyle = '#C7C7CC'; star(g, (c + .5) * u, (r + .5) * u, u * .32); }
    });
    const tri = (c, pts) => { g.beginPath(); g.moveTo(pts[0][1] * u, pts[0][0] * u); pts.slice(1).forEach(p => g.lineTo(p[1] * u, p[0] * u)); g.closePath(); g.fillStyle = LUDO_COL[c]; g.fill(); };
    tri(0, [[6, 6], [7.5, 7.5], [9, 6]]); tri(1, [[6, 6], [7.5, 7.5], [6, 9]]); tri(2, [[6, 9], [7.5, 7.5], [9, 9]]); tri(3, [[9, 6], [7.5, 7.5], [9, 9]]);
    // bidak
    const spots = {};
    const draw = [];
    for (let s = 0; s < st.n; s++) st.tokens[s].forEach((t, i) => {
      const [r, c] = Ludo.cell(st, s, t, i);
      const k = r + ',' + c; spots[k] = (spots[k] || 0) + 1;
      draw.push({ s, i, r, c, k, n: spots[k] });
    });
    const hits = [];
    draw.forEach(d => {
      const off = d.n > 1 && d.k !== '7.5,7.5' ? (d.n - 1) * u * .18 : 0;
      const x = d.c * u + off, y = d.r * u - off;
      const col = LUDO_COL[st.colors[d.s]];
      const can = d.s === me && mv.includes(d.i);
      if (can) { g.beginPath(); g.arc(x, y, u * .62, 0, 7); g.fillStyle = 'rgba(234,106,10,.35)'; g.fill(); }
      g.beginPath(); g.arc(x, y, u * .38, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.arc(x, y, u * .38, 0, 7); g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
      if (can) hits.push({ x, y, i: d.i });
    });
    if (myTurn && st.rolled) cv.onclick = e => {
      const rc = cv.getBoundingClientRect(); const px = e.clientX - rc.left, py = e.clientY - rc.top;
      let best = null, bd = 1e9;
      hits.forEach(h => { const dd = Math.hypot(h.x - px, h.y - py); if (dd < bd) { bd = dd; best = h; } });
      if (best && bd < u * 1.3) ctx.act({ token: best.i });
    };
    const rb = $('luRoll'); if (rb) rb.onclick = () => ctx.act({ roll: true });
    // kalau cuma satu pilihan (atau semua bidak yang bisa jalan posisinya sama), jalan sendiri
    if (myTurn && st.rolled && mv.length && new Set(mv.map(i => st.tokens[me][i])).size === 1) { clearTimeout(autoTimer); autoTimer = setTimeout(() => ctx.act({ token: mv[0] }), 900); }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

  /* =====================================================================
     SNAKE (ular makan) – setiap pemain punya papan sendiri, adu skor
     ===================================================================== */
  const SN = 18;
  function snakeNew() { return { body: [[8, 9], [7, 9], [6, 9]], dir: [1, 0], next: [1, 0], food: snakeFood([[8, 9], [7, 9], [6, 9]]), score: 0, alive: true, deadAt: 0 }; }
  function snakeFood(body) { let f; do { f = [rnd(SN), rnd(SN)]; } while (body.some(b => b[0] === f[0] && b[1] === f[1])); return f; }
  function snakeStep(s, now) {
    if (!s.alive) { if (now - s.deadAt > 1800) { const sc = s.score; Object.assign(s, snakeNew()); s.score = sc; } return; }
    if (!(s.next[0] === -s.dir[0] && s.next[1] === -s.dir[1])) s.dir = s.next;
    const h = [s.body[0][0] + s.dir[0], s.body[0][1] + s.dir[1]];
    if (h[0] < 0 || h[1] < 0 || h[0] >= SN || h[1] >= SN || s.body.some((b, i) => i < s.body.length - 1 && b[0] === h[0] && b[1] === h[1])) { s.alive = false; s.deadAt = now; return; }
    s.body.unshift(h);
    if (h[0] === s.food[0] && h[1] === s.food[1]) { s.score++; s.food = snakeFood(s.body); } else s.body.pop();
  }
  function snakeBot(s) {
    if (!s.alive) return;
    const h = s.body[0];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => !(d[0] === -s.dir[0] && d[1] === -s.dir[1]));
    const safe = dirs.filter(d => { const n = [h[0] + d[0], h[1] + d[1]]; return n[0] >= 0 && n[1] >= 0 && n[0] < SN && n[1] < SN && !s.body.some((b, i) => i < s.body.length - 1 && b[0] === n[0] && b[1] === n[1]); });
    const pool = safe.length ? safe : dirs;
    pool.sort((a, b) => (Math.abs(h[0] + a[0] - s.food[0]) + Math.abs(h[1] + a[1] - s.food[1])) - (Math.abs(h[0] + b[0] - s.food[0]) + Math.abs(h[1] + b[1] - s.food[1])));
    s.next = Math.random() < .08 && pool.length > 1 ? pool[1] : pool[0];
  }
  const snakeSnap = s => s.body.map(b => b.join('.')).join('_') + '|' + s.food.join('.') + '|' + (s.alive ? 1 : 0);
  function snakeFromSnap(str) {
    const [b, f, a] = String(str || '').split('|');
    return { body: (b || '').split('_').filter(Boolean).map(p => p.split('.').map(Number)), food: (f || '0.0').split('.').map(Number), alive: a === '1' };
  }
  function drawSnake(cv, s, color, big) {
    const size = cv._size; const g = cv.getContext('2d'); const u = size / SN;
    g.setTransform(cv._dpr, 0, 0, cv._dpr, 0, 0);
    g.fillStyle = '#F4FBF2'; g.fillRect(0, 0, size, size);
    if (big) { g.fillStyle = '#E8F5E4'; for (let x = 0; x < SN; x++) for (let y = 0; y < SN; y++) if ((x + y) % 2) g.fillRect(x * u, y * u, u, u); }
    g.fillStyle = '#FF3B30'; g.beginPath(); g.arc((s.food[0] + .5) * u, (s.food[1] + .5) * u, u * .38, 0, 7); g.fill();
    s.body.forEach((b, i) => { g.fillStyle = i === 0 ? shade(color, -25) : color; roundRect(g, b[0] * u + 1, b[1] * u + 1, u - 2, u - 2, u * .3); g.fill(); });
    if (!s.alive && !big) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 0, size, size); }
    if (!s.alive && big) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(0, 0, size, size); g.fillStyle = '#1C1C1E'; g.font = `800 ${Math.max(12, size / 14)}px Inter, sans-serif`; g.textAlign = 'center'; g.fillText('Tabrakan! Mulai lagi…', size / 2, size / 2); }
  }
  function shade(hex, p) { const n = parseInt(hex.slice(1), 16); const c = v => Math.max(0, Math.min(255, v + p)); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }
  function setupCanvas(cv, size) { const dpr = window.devicePixelRatio || 1; cv.width = size * dpr; cv.height = size * dpr; cv.style.width = size + 'px'; cv.style.height = size + 'px'; cv._size = size; cv._dpr = dpr; }
  const SEAT_COL = ['#EA6A0A', '#1E88E5', '#8E44AD', '#16A085'];

  /* =====================================================================
     POTONG BUAH
     ===================================================================== */
  const FRUITS = [
    { r: 30, out: '#2E9E3E', in: '#FF4D6D', seed: '#1C1C1E', pts: 1 },   // semangka
    { r: 24, out: '#FF9F0A', in: '#FFC46B', seed: null, pts: 1 },       // jeruk
    { r: 22, out: '#E53935', in: '#FFF1D6', seed: '#8A4B14', pts: 1 },  // apel
    { r: 20, out: '#7E57C2', in: '#D1C4E9', seed: null, pts: 2 },       // anggur besar
    { r: 26, out: '#FBC02D', in: '#FFF59D', seed: null, pts: 1 },       // mangga
  ];
  function buahGame(cv, size, onScore) {
    const g = cv.getContext('2d');
    const W = size.w, H = size.h;
    const st = { items: [], halves: [], parts: [], trail: [], score: 0, last: 0, spawn: 0, combo: 0, comboT: 0, msg: '', msgT: 0 };
    function spawn(now) {
      const n = 1 + rnd(3);
      for (let i = 0; i < n; i++) {
        const bomb = Math.random() < .12;
        const f = bomb ? { r: 22, bomb: true } : FRUITS[rnd(FRUITS.length)];
        const x = W * (.15 + Math.random() * .7);
        st.items.push({ ...f, x, y: H + f.r, vx: (W / 2 - x) * (.25 + Math.random() * .35), vy: -(H * (1.05 + Math.random() * .35)), rot: Math.random() * 6, vr: (Math.random() - .5) * 4, cut: false });
      }
      st.spawn = now + 650 + Math.random() * 650;
    }
    function segHit(p1, p2, c, r) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y; const l2 = dx * dx + dy * dy || 1;
      let t = ((c.x - p1.x) * dx + (c.y - p1.y) * dy) / l2; t = Math.max(0, Math.min(1, t));
      return Math.hypot(p1.x + t * dx - c.x, p1.y + t * dy - c.y) < r;
    }
    function cut(it, ang, now) {
      it.cut = true;
      if (it.bomb) { st.score = Math.max(0, st.score - 5); st.msg = 'BOM! −5'; st.msgT = now + 900; burst(it, '#555', 24); }
      else {
        st.combo = now < st.comboT ? st.combo + 1 : 1; st.comboT = now + 350;
        st.score += it.pts + (st.combo >= 3 ? 1 : 0);
        if (st.combo >= 3) { st.msg = `Kombo ${st.combo}!`; st.msgT = now + 700; }
        const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
        [-1, 1].forEach(sg => st.halves.push({ ...it, vx: it.vx + sg * nx * 120, vy: it.vy * .3 + sg * ny * 120, side: sg, ang }));
        burst(it, it.in, 14);
      }
      onScore(st.score);
    }
    function burst(it, col, n) { for (let i = 0; i < n; i++) st.parts.push({ x: it.x, y: it.y, vx: (Math.random() - .5) * 420, vy: (Math.random() - .5) * 420, life: .6, col }); }
    function drawFruit(it, half) {
      g.save(); g.translate(it.x, it.y); g.rotate(it.rot);
      if (it.bomb) {
        g.fillStyle = '#2C2C2E'; g.beginPath(); g.arc(0, 0, it.r, 0, 7); g.fill();
        g.strokeStyle = '#8A4B14'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -it.r); g.quadraticCurveTo(8, -it.r - 12, 14, -it.r - 8); g.stroke();
        g.fillStyle = '#FF9F0A'; g.beginPath(); g.arc(15, -it.r - 9, 4, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = `900 ${it.r}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, 2);
      } else {
        if (half) { g.rotate(it.ang - it.rot); g.beginPath(); g.arc(0, 0, it.r, half > 0 ? 0 : Math.PI, half > 0 ? Math.PI : Math.PI * 2); g.closePath(); g.fillStyle = it.out; g.fill(); g.beginPath(); g.arc(0, 0, it.r * .82, half > 0 ? 0 : Math.PI, half > 0 ? Math.PI : Math.PI * 2); g.closePath(); g.fillStyle = it.in; g.fill(); }
        else {
          g.fillStyle = it.out; g.beginPath(); g.arc(0, 0, it.r, 0, 7); g.fill();
          g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-it.r * .35, -it.r * .35, it.r * .3, it.r * .18, -.6, 0, 7); g.fill();
          g.fillStyle = '#5D3A1A'; g.fillRect(-2, -it.r - 6, 4, 8);
        }
      }
      g.restore();
    }
    let raf = 0, prev = 0, running = true, down = false, paused = false;
    function frame(now) {
      if (!running) return;
      if (paused) { prev = now; raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(.05, (now - (prev || now)) / 1000); prev = now;
      if (now > st.spawn) spawn(now);
      const grav = H * 1.15;
      [st.items, st.halves].forEach(list => list.forEach(it => { it.vy += grav * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt; }));
      st.items = st.items.filter(it => !it.cut && it.y < H + 80);
      st.halves = st.halves.filter(it => it.y < H + 80);
      st.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += grav * .5 * dt; p.life -= dt; });
      st.parts = st.parts.filter(p => p.life > 0);
      st.trail = st.trail.filter(p => now - p.t < 160);
      g.setTransform(cv._dpr, 0, 0, cv._dpr, 0, 0);
      const bgr = g.createLinearGradient(0, 0, 0, H); bgr.addColorStop(0, '#FFF3E6'); bgr.addColorStop(1, '#FFE0C2'); g.fillStyle = bgr; g.fillRect(0, 0, W, H);
      st.items.forEach(it => drawFruit(it));
      st.halves.forEach(it => drawFruit(it, it.side));
      st.parts.forEach(p => { g.globalAlpha = Math.max(0, p.life / .6); g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill(); });
      g.globalAlpha = 1;
      if (st.trail.length > 1) { g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round'; g.shadowColor = '#EA6A0A'; g.shadowBlur = 10; g.beginPath(); st.trail.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.shadowBlur = 0; }
      if (now < st.msgT) { g.fillStyle = st.msg.startsWith('BOM') ? '#E0352B' : '#EA6A0A'; g.font = '900 30px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(st.msg, W / 2, H * .3); }
      raf = requestAnimationFrame(frame);
    }
    const pos = e => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top, t: performance.now() }; };
    const move = e => {
      if (!down || paused) return; e.preventDefault();
      const p = pos(e); const last = st.trail[st.trail.length - 1]; st.trail.push(p);
      if (last) st.items.forEach(it => { if (!it.cut && segHit(last, p, it, it.r + 4)) cut(it, Math.atan2(p.y - last.y, p.x - last.x), p.t); });
    };
    cv.addEventListener('pointerdown', e => { down = true; st.trail = [pos(e)]; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', () => { down = false; });
    cv.addEventListener('pointercancel', () => { down = false; });
    raf = requestAnimationFrame(frame);
    return { stop() { running = false; cancelAnimationFrame(raf); }, pause() { paused = true; down = false; }, resume() { paused = false; }, get score() { return st.score; } };
  }

  /* =====================================================================
     SESI GAME (lawan komputer / online / menonton)
     ===================================================================== */
  let cur = null;          // { game, mode: 'bot'|'online'|'watch', roomId, seats, mySeat, state, room }
  let rooms = {};
  let botTimer = null, autoTimer = null, rtTimer = null, rtLocal = null;

  function seatName(ctx, s) { const x = (ctx.seats || [])[s]; return x ? (x.key === myKey && !ctx.spectator ? 'Kamu' : x.name) : 'Kosong'; }
  function seatAva(ctx, s) {
    const x = (ctx.seats || [])[s];
    if (!x) return '';
    if (x.bot) return `<span class="ava" style="width:32px;height:32px;background:#8E8E93">${BOT_SVG}</span>`;
    return avaHtml(x.key, x.name).replace('class="ava', 'style="width:32px;height:32px;font-size:14px" class="ava');
  }
  function resultHtml(ctx, winner, reason) {
    if (winner === null || winner === undefined) return '';
    const iWin = !ctx.spectator && winner === ctx.mySeat;
    return `<div class="gp-result ${iWin ? 'win' : ''}"><div class="gr-title">${iWin ? 'Kamu Menang!' : esc(seatName(ctx, winner)) + ' Menang!'}</div><div class="gr-sub">${esc(reason || '')}</div>
      ${ctx.spectator ? '' : `<button type="button" class="btn btn-primary btn-block" onclick="TTG.mainLagi()">Main Lagi</button>`}</div>`;
  }
  function engine(game) { return game === 'domino' ? Domino : game === 'ludo' ? Ludo : null; }
  function isDriver() {
    if (!cur || cur.mode === 'bot') return true;
    const room = rooms[cur.roomId]; if (!room) return false;
    const online = room.online || {};
    const seats = arr(room.seats);
    for (let s = 0; s < seats.length; s++) if (seats[s] && !seats[s].bot && online[seats[s].key]) return seats[s].key === myKey;
    return room.host === myKey;
  }

  /* ---------- jeda & keluar ---------- */
  function pauseInfo() {
    if (!cur) return null;
    if (cur.mode === 'bot') return cur.paused || null;
    const r = rooms[cur.roomId];
    return (r && r.status === 'playing' && r.paused) || null;
  }
  function isPaused() { return !!pauseInfo(); }
  function pausedTotal() {
    if (!cur) return 0;
    let t = cur.mode === 'bot' ? (cur.pauseTotal || 0) : ((((rooms[cur.roomId] || {}).rt) || {}).pauseTotal || 0);
    const p = pauseInfo();
    if (p) t += Math.max(0, Date.now() - p.at);
    return t;
  }
  function gameRunning() {
    if (!cur) return false;
    if (cur.mode !== 'bot') { const r = rooms[cur.roomId]; if (!r || r.status !== 'playing') return false; }
    if (cur.state) return cur.state.winner === null || cur.state.winner === undefined;
    if (cur.rt) return !cur.rtEnded;
    return false;
  }
  function refreshHead() {
    const inGame = !!(cur && (cur.state || cur.rt || cur.roomId));
    $('gvExitTxt').textContent = inGame ? 'Keluar' : 'Kembali';
    $('gvPauseBtn').classList.toggle('hidden', !(gameRunning() && cur.mode !== 'watch' && !isPaused()));
  }
  function renderPause() {
    const p = pauseInfo();
    const box = $('gvPause');
    box.classList.toggle('hidden', !p);
    if (p) {
      $('gvPauseBy').textContent = cur.mode === 'bot' ? 'Waktu dan komputer ikut berhenti.' : (p.by === deviceName ? 'Kamu menjeda permainan untuk semua pemain.' : `Dijeda oleh ${p.by}.`);
      $('gvPauseResume').classList.toggle('hidden', cur.mode === 'watch');
    }
    refreshHead();
  }
  function jeda() {
    if (!cur || cur.mode === 'watch' || !gameRunning() || isPaused()) return;
    const p = { by: deviceName || 'Seseorang', at: Date.now() };
    if (cur.mode === 'bot') { cur.paused = p; clearTimeout(botTimer); clearTimeout(autoTimer); renderPause(); }
    else roomsRef.child(cur.roomId).update({ paused: p });
  }
  function lanjut() {
    const p = pauseInfo();
    if (!p || !cur) return;
    const add = Math.max(0, Date.now() - p.at);
    if (cur.mode === 'bot') {
      cur.pauseTotal = (cur.pauseTotal || 0) + add; cur.paused = null;
      renderPause();
      if (cur.state) renderTurn();
    } else {
      const r = rooms[cur.roomId] || {};
      const upd = { paused: null };
      if (r.rt) upd['rt/pauseTotal'] = (r.rt.pauseTotal || 0) + add;
      roomsRef.child(cur.roomId).update(upd);
    }
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

  /* ---------- tampilan layar game ---------- */
  function openView(title) {
    $('gameView').classList.remove('hidden');
    $('gvTitle').textContent = title;
    $('gvBody').innerHTML = '';
    $('gvPause').classList.add('hidden');
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
      }
    }
    cur = null;
    $('gameView').classList.add('hidden');
    renderPane();
  }
  function stopAll() {
    clearTimeout(botTimer); clearTimeout(autoTimer); clearInterval(rtTimer);
    if (rtLocal && rtLocal.stop) rtLocal.stop();
    rtLocal = null;
    if (snakeKeys) { document.removeEventListener('keydown', snakeKeys); snakeKeys = null; }
  }
  function setLive(room) {
    const b = $('gvLive');
    if (!room || room.status !== 'playing') { b.classList.add('hidden'); return; }
    const n = Object.keys(room.viewers || {}).length;
    b.classList.remove('hidden');
    b.innerHTML = `<span class="live-dot"></span>LIVE${n ? ' · ' + n + ' menonton' : ''}`;
  }

  /* ---------- lawan komputer ---------- */
  function mulaiBot(game, n) {
    stopAll();
    const seats = [{ key: myKey, name: deviceName || 'Kamu' }];
    for (let i = 1; i < n; i++) seats.push({ bot: true, name: BOT_NAMES[i - 1] });
    cur = { game, mode: 'bot', seats, mySeat: 0 };
    openView(GAMES[game].name + ' · Lawan Komputer');
    $('gvLive').classList.add('hidden');
    if (GAMES[game].turn) { cur.state = engine(game).init(n); renderTurn(); }
    else startRealtime(Date.now() + 3000);
  }

  /* ---------- game bergiliran ---------- */
  function ctxFor() {
    return {
      seats: cur.seats, mySeat: cur.mySeat, spectator: cur.mode === 'watch',
      act: mv => act(mv),
      autoPass: msg => { const sEl = document.querySelector('#gvBody .gp-status'); if (sEl) sEl.textContent = msg; clearTimeout(autoTimer); autoTimer = setTimeout(() => act({ pass: true }), 1500); }
    };
  }
  function renderTurn() {
    if (!cur || !cur.state) return;
    const box = $('gvBody');
    (cur.game === 'domino' ? renderDomino : renderLudo)(box, cur.state, ctxFor());
    jadwalBot();
    refreshHead();
  }
  function act(mv) {
    if (!cur || cur.mode === 'watch' || isPaused()) return;
    const eng = engine(cur.game);
    const before = cur.state;
    const after = eng.apply(before, cur.mySeat, mv);
    if (after.v === before.v) return;
    commit(after);
  }
  function commit(st) {
    if (cur.mode === 'bot') { cur.state = st; renderTurn(); return; }
    cur.state = st;
    roomsRef.child(cur.roomId).update({ state: st, updatedAt: TS(), ...(st.winner !== null && st.winner !== undefined ? { status: 'done', winnerName: seatName({ seats: cur.seats, spectator: true }, st.winner) } : {}) });
    renderTurn();
  }
  function jadwalBot() {
    clearTimeout(botTimer);
    const st = cur && cur.state;
    if (!st || st.winner !== null && st.winner !== undefined) return;
    const seat = cur.seats[st.turn];
    if (!seat || !seat.bot || !isDriver() || isPaused()) return;
    const v = st.v;
    botTimer = setTimeout(() => {
      if (!cur || !cur.state || cur.state.v !== v || isPaused()) return;
      const eng = engine(cur.game);
      const s = cur.state.turn;
      const after = eng.apply(eng.norm(clone(cur.state)), s, eng.bot(eng.norm(clone(cur.state)), s));
      if (after.v !== v) commit(after);
    }, cur.game === 'ludo' ? 750 : 1000);
  }

  /* ---------- game waktu-nyata (Snake, Potong Buah) ---------- */
  let snakeKeys = null;
  function startRealtime(startAt) {
    stopAll();
    const game = cur.game, dur = GAMES[game].dur * 1000;
    const T0 = () => startAt + pausedTotal();      // mulai (bergeser sesuai lama jeda)
    const T1 = () => T0() + dur;                   // selesai
    cur.rt = { startAt, players: {} };
    cur.rtEnded = false;
    const box = $('gvBody');
    const spectator = cur.mode === 'watch';
    const n = cur.seats.length;
    const W = Math.min(box.clientWidth || 360, 520);
    box.innerHTML = `<div class="rt-top"><div id="rtTimer" class="rt-timer">--</div><div id="rtBoard" class="rt-board"></div></div>
      ${spectator ? '' : `<div class="rt-main"><canvas id="rtCanvas"></canvas><div id="rtCount" class="rt-count">3</div></div>`}
      ${game === 'snake' ? `<div id="rtMinis" class="rt-minis"></div>` : ''}
      ${!spectator && game === 'snake' ? `<div class="sn-pad"><button type="button" data-d="0,-1" class="up">▲</button><button type="button" data-d="-1,0" class="left">◀</button><button type="button" data-d="1,0" class="right">▶</button><button type="button" data-d="0,1" class="down">▼</button></div>` : ''}
      <div id="rtResult"></div>`;
    // papan lokal & bot
    const boards = {};
    for (let s = 0; s < n; s++) {
      const seat = cur.seats[s];
      const mine = !spectator && s === cur.mySeat;
      const simBot = seat.bot && isDriver();
      if (game === 'snake' && (mine || simBot)) boards[s] = snakeNew();
      if (game === 'buah' && simBot) boards[s] = { score: 0, next: 0 };
    }
    let myScore = 0, buah = null;
    if (!spectator) {
      const cv = $('rtCanvas');
      if (game === 'snake') {
        setupCanvas(cv, W);
        const setDir = d => { const b = boards[cur.mySeat]; if (b) b.next = d; };
        box.querySelectorAll('.sn-pad button').forEach(bt => bt.onclick = () => setDir(bt.dataset.d.split(',').map(Number)));
        let sx = 0, sy = 0;
        cv.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        cv.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) setDir(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); });
        snakeKeys = e => { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (m) { e.preventDefault(); setDir(m); } };
        document.addEventListener('keydown', snakeKeys);
        drawSnake(cv, boards[cur.mySeat], SEAT_COL[cur.mySeat], true);
      } else {
        const H = Math.round(Math.min(window.innerHeight * .55, W * 1.25));
        const dpr = window.devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv._dpr = dpr;
        cv.style.touchAction = 'none';
      }
    }
    let lastTick = 0, lastSync = 0, ended = false;
    const sync = (s, data) => { if (cur.mode === 'online') db.ref(`thaitea/games/rooms/${cur.roomId}/players/${s}`).set(data); else cur.rt.players[s] = data; };
    rtTimer = setInterval(() => {
      const now = Date.now();
      if (isPaused()) { if (buah) buah.pause(); return; }
      if (buah) buah.resume();
      const startAt = T0(), endAt = T1();
      const left = Math.ceil((endAt - now) / 1000);
      const cnt = $('rtCount');
      if (now < startAt) { if (cnt) { cnt.textContent = Math.ceil((startAt - now) / 1000); cnt.classList.remove('hidden'); } $('rtTimer').textContent = GAMES[game].dur + ' dtk'; renderBoard(); return; }
      if (cnt && !cnt.classList.contains('hidden')) { cnt.classList.add('hidden'); if (game === 'buah' && !spectator && !buah) buah = buahGame($('rtCanvas'), { w: W, h: parseInt($('rtCanvas').style.height) }, sc => { myScore = sc; }); }
      $('rtTimer').textContent = Math.max(0, left) + ' dtk';
      if (game === 'snake' && now - lastTick >= 140) {
        lastTick = now;
        Object.keys(boards).forEach(s => { const b = boards[s]; if (cur.seats[s].bot) snakeBot(b); snakeStep(b, now); });
        if (!spectator && boards[cur.mySeat]) { drawSnake($('rtCanvas'), boards[cur.mySeat], SEAT_COL[cur.mySeat], true); myScore = boards[cur.mySeat].score; }
      }
      if (game === 'buah') Object.keys(boards).forEach(s => { const b = boards[s]; if (now > b.next) { b.score += Math.random() < .75 ? 1 : (Math.random() < .5 ? 2 : -1); b.score = Math.max(0, b.score); b.next = now + 700 + rnd(900); } });
      if (now - lastSync > (cur.mode === 'online' ? 350 : 120)) {
        lastSync = now;
        Object.keys(boards).forEach(s => sync(s, game === 'snake' ? { score: boards[s].score, snap: snakeSnap(boards[s]) } : { score: boards[s].score }));
        if (!spectator) sync(cur.mySeat, game === 'snake' ? { score: myScore, snap: snakeSnap(boards[cur.mySeat]) } : { score: myScore });
      }
      renderBoard();
      if (now >= endAt && !ended) {
        ended = true; cur.rtEnded = true; clearInterval(rtTimer); if (buah) buah.stop(); refreshHead();
        setTimeout(() => selesaiRealtime(), cur.mode === 'online' ? 900 : 50);
      }
    }, 50);
    rtLocal = { stop() { if (buah) buah.stop(); } };
    refreshHead();
  }
  function rtPlayers() { return cur.mode === 'bot' ? cur.rt.players : ((rooms[cur.roomId] || {}).players || {}); }
  function renderBoard() {
    if (!cur) return;
    const pl = rtPlayers();
    const rows = cur.seats.map((s, i) => ({ i, name: seatName({ seats: cur.seats, mySeat: cur.mySeat, spectator: cur.mode === 'watch' }, i), score: (pl[i] || {}).score || 0 })).sort((a, b) => b.score - a.score);
    const bd = $('rtBoard');
    if (bd) bd.innerHTML = rows.map((r, k) => `<div class="rt-row ${r.i === cur.mySeat && cur.mode !== 'watch' ? 'me' : ''}"><span class="rt-rank">${k + 1}</span><span class="rt-dot" style="background:${SEAT_COL[r.i]}"></span><span class="rt-name">${esc(r.name)}</span><b>${r.score}</b></div>`).join('');
    const minis = $('rtMinis');
    if (minis) {
      const others = cur.seats.map((s, i) => i).filter(i => cur.mode === 'watch' || i !== cur.mySeat);
      if (minis.childElementCount !== others.length) minis.innerHTML = others.map(i => `<div class="rt-mini"><canvas data-s="${i}"></canvas><small>${esc(seatName({ seats: cur.seats, mySeat: cur.mySeat, spectator: cur.mode === 'watch' }, i))}</small></div>`).join('');
      minis.querySelectorAll('canvas').forEach(cv => {
        const s = +cv.dataset.s; const p = pl[s]; if (!p || !p.snap) return;
        const sz = cur.mode === 'watch' ? Math.min(240, (minis.clientWidth - 12) / 2) : 104;
        if (cv._size !== sz) setupCanvas(cv, sz);
        drawSnake(cv, snakeFromSnap(p.snap), SEAT_COL[s], false);
      });
    }
  }
  function selesaiRealtime() {
    if (!cur) return;
    const pl = rtPlayers();
    let best = 0, bs = -1;
    cur.seats.forEach((s, i) => { const sc = (pl[i] || {}).score || 0; if (sc > bs) { bs = sc; best = i; } });
    const ctx = { seats: cur.seats, mySeat: cur.mySeat, spectator: cur.mode === 'watch' };
    $('rtResult').innerHTML = resultHtml(ctx, best, `Skor tertinggi: ${bs}`);
    if (cur.mode === 'online' && isDriver()) roomsRef.child(cur.roomId).update({ status: 'done', winnerName: seatName({ seats: cur.seats, spectator: true }, best), updatedAt: TS() });
  }

  /* ---------- online: meja ---------- */
  function buatMeja(game, max) {
    if (!myKey) { triggerToast('Pilih nama pengguna dulu', true); return; }
    const id = 'R' + Date.now() + Math.random().toString(36).slice(2, 5);
    const room = { id, game, host: myKey, hostName: deviceName, status: 'waiting', max, createdAt: Date.now(), seats: { 0: { key: myKey, name: deviceName } } };
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
    let free = -1;
    for (let i = 0; i < r.max; i++) if (!seats[i]) { free = i; break; }
    if (seats.some(x => x && x.key === myKey)) return masukMeja(id, 'online');
    if (free < 0) { triggerToast('Meja sudah penuh', true); return; }
    db.ref(`thaitea/games/rooms/${id}/seats/${free}`).set({ key: myKey, name: deviceName }).then(() => masukMeja(id, 'online'));
  }
  function tontonMeja(id) { masukMeja(id, 'watch'); }
  function masukMeja(id, mode) {
    stopAll();
    const r = rooms[id];
    cur = { game: r ? r.game : 'domino', mode, roomId: id, seats: [], mySeat: null, state: null, enteredAt: Date.now() };
    openView((r ? GAMES[r.game].name : 'Game') + (mode === 'watch' ? ' · Menonton' : ' · Online'));
    const on = db.ref(`thaitea/games/rooms/${id}/${mode === 'watch' ? 'viewers' : 'online'}/${myKey}`);
    on.onDisconnect().remove();
    on.set(mode === 'watch' ? deviceName : true);
    onRoomUpdate();
  }
  function onRoomUpdate() {
    if (!cur || !cur.roomId) return;
    const r = rooms[cur.roomId];
    if (!r && Date.now() - (cur.enteredAt || 0) < 4000) return;   // data meja belum sampai
    if (!r) { triggerToast('Meja ditutup'); const c = cur; cur = null; stopAll(); $('gameView').classList.add('hidden'); renderPane(); return c; }
    cur.seats = arr(r.seats).map(x => x || null);
    const mine = cur.seats.findIndex(x => x && x.key === myKey);
    cur.mySeat = cur.mode === 'watch' ? null : (mine >= 0 ? mine : null);
    setLive(r);
    renderPause();
    if (r.status === 'waiting') { renderLobbyMeja(r); refreshHead(); return; }
    const g = GAMES[r.game];
    if (g.turn) {
      if (!r.state) return;
      const eng = engine(r.game);
      const st = eng.norm(clone(r.state));
      if (!cur.state || st.gid !== cur.state.gid || st.v >= cur.state.v) { cur.state = st; renderTurn(); }
    } else {
      if (r.rt && r.rt.startAt !== cur.rtStartAt) { cur.rtStartAt = r.rt.startAt; startRealtime(r.rt.startAt); }
      else renderBoard();
    }
  }
  function renderLobbyMeja(r) {
    const seats = arr(r.seats);
    const g = GAMES[r.game];
    const isHost = r.host === myKey;
    let rows = '';
    for (let i = 0; i < r.max; i++) {
      const x = seats[i];
      rows += `<div class="user-row">${x ? avaHtml(x.key, x.name) : '<span class="ava" style="background:#E5E5EA;color:#8E8E93">?</span>'}<div style="flex:1"><div class="un">${x ? esc(x.name) + (x.key === r.host ? ' <span class="pill pill-orange" style="font-size:11px">PEMBUAT</span>' : '') : 'Kursi kosong'}</div><div class="us">${x ? 'Siap' : 'Akan diisi komputer kalau tidak ada yang ikut'}</div></div></div>`;
    }
    $('gvBody').innerHTML = `<div class="gl-hero" style="background:${g.bg}"><span class="gl-ico">${ICON[r.game]}</span><div><div class="gl-title">${g.name}</div><div class="gl-sub">Menunggu pemain · ${seats.filter(Boolean).length}/${r.max}</div></div></div>
      <div class="list" style="margin-top:12px">${rows}</div>
      <p class="card-sub" style="margin:10px 4px">Pengguna lain bisa bergabung dari menu Hiburan → Game. Pemberitahuan sudah dikirim ke semua HP.</p>
      ${isHost ? `<button type="button" class="btn btn-primary btn-lg btn-block" onclick="TTG.mulaiOnline()">Mulai Sekarang</button>` : `<div class="gp-hint">Menunggu ${esc(r.hostName || 'pembuat meja')} memulai…</div>`}
      <button type="button" class="btn btn-gray btn-block" style="margin-top:10px" onclick="TTG.tutup()">${isHost ? 'Batalkan Meja' : 'Keluar'}</button>`;
  }
  function mulaiOnline() {
    const r = rooms[cur.roomId]; if (!r || r.host !== myKey) return;
    const seats = arr(r.seats);
    const g = GAMES[r.game];
    const filled = [];
    let b = 0;
    for (let i = 0; i < r.max; i++) filled.push(seats[i] || { bot: true, name: BOT_NAMES[b++ % 3] });
    const n = Math.max(g.min, filled.length);
    const upd = { status: 'playing', seats: filled.slice(0, n), startedAt: Date.now(), updatedAt: TS() };
    if (g.turn) upd.state = engine(r.game).init(n);
    else upd.rt = { startAt: Date.now() + 4000 };
    roomsRef.child(cur.roomId).update(upd);
  }
  function mainLagi() {
    if (!cur) return;
    if (cur.mode === 'bot') return mulaiBot(cur.game, cur.seats.length);
    const r = rooms[cur.roomId]; if (!r) return;
    const g = GAMES[r.game];
    cur.state = null;
    const upd = { status: 'playing', players: null, paused: null, updatedAt: TS(), winnerName: null };
    if (g.turn) upd.state = engine(r.game).init(arr(r.seats).length);
    else upd.rt = { startAt: Date.now() + 4000 };
    roomsRef.child(cur.roomId).update(upd);
  }

  /* ---------- panel Game di menu Hiburan ---------- */
  function daftarMeja() {
    const now = Date.now();
    return Object.values(rooms).filter(r => r && r.id && now - (r.createdAt || 0) < ROOM_TTL);
  }
  function renderPane() {
    const box = $('gameList');
    if (!box) return;
    const list = daftarMeja();
    const live = list.filter(r => r.status === 'playing');
    const wait = list.filter(r => r.status === 'waiting');
    const liveHtml = live.length ? `<div class="section-label"><span><span class="live-dot"></span> Live Sekarang</span></div><div class="list">${live.map(r => {
      const seats = arr(r.seats).filter(Boolean);
      const v = Object.keys(r.viewers || {}).length;
      return `<div class="room-row" style="cursor:default"><span class="gl-mini" style="background:${GAMES[r.game].bg}">${ICON[r.game]}</span><div class="room-main"><div class="room-name">${GAMES[r.game].name}</div><div class="room-last">${esc(seats.map(s => s.name).join(', '))}${v ? ' · ' + v + ' menonton' : ''}</div></div>
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
    $('gvLive').classList.add('hidden');
    const opsi = n => `<button type="button" data-n="${n}" class="${n === 2 ? 'active' : ''}">${n} pemain</button>`;
    const nList = g.min === 1 ? [1, 2, 3, 4] : [2, 3, 4];
    $('gvBody').innerHTML = `<div class="gl-hero" style="background:${g.bg}"><span class="gl-ico">${ICON[game]}</span><div><div class="gl-title">${g.name}</div><div class="gl-sub">${g.desc}</div></div></div>
      <div class="card" style="margin-top:12px"><span class="field-label">Jumlah pemain</span><div class="segmented" id="glN">${nList.map(opsi).join('')}</div>
        <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:14px" id="glBot"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11 2h2v3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2zm-2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg> Main Lawan Komputer</button>
        <button type="button" class="btn btn-tinted btn-lg btn-block" style="margin-top:10px" id="glOnline"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg> Main Online</button>
        <p class="card-sub" style="margin-top:10px"><b>Main Online</b>: pengguna lain dapat pemberitahuan dan bisa ikut. Kursi yang kosong saat dimulai otomatis dimainkan komputer.</p></div>`;
    let n = 2;
    document.querySelectorAll('#glN button').forEach(b => b.onclick = () => { n = +b.dataset.n; document.querySelectorAll('#glN button').forEach(x => x.classList.toggle('active', x === b)); });
    $('glBot').onclick = () => mulaiBot(game, n);
    $('glOnline').onclick = () => buatMeja(game, Math.max(2, n));
  }

  /* ---------- gaya ---------- */
  const css = `
  .game-view{position:fixed;inset:0;z-index:1000000;background:var(--bg);display:flex;flex-direction:column}
  .gv-head{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 10px 4px;background:rgba(247,247,247,.94);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-bottom:.5px solid var(--sep);flex:none}
  .gv-title{flex:1;font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gv-exit{display:flex;align-items:center;gap:2px;color:var(--accent);font-size:17px;font-weight:700;min-height:44px;padding:0 6px 0 2px;flex:none}
  .gv-pausebtn{width:44px;height:44px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex:none}
  .gv-pausebtn:active,.gv-exit:active{opacity:.6}
  .gv-pause{position:absolute;inset:0;z-index:5;background:rgba(242,242,247,.82);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:24px}
  .gvp-card{width:100%;max-width:360px;background:#fff;border-radius:26px;padding:26px 20px 20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.15)}
  .gvp-ico{width:84px;height:84px;border-radius:50%;background:var(--accent);margin:0 auto 12px;display:flex;align-items:center;justify-content:center}
  .gvp-title{font-size:26px;font-weight:900}
  .gvp-sub{color:var(--text2);margin:6px 0 20px;font-size:16px}
  .gv-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px calc(env(safe-area-inset-bottom,0px) + 24px);max-width:560px;width:100%;margin:0 auto}
  .live-badge{display:inline-flex;align-items:center;gap:6px;background:#FF3B30;color:#fff;font-size:12px;font-weight:800;padding:5px 10px;border-radius:8px;letter-spacing:.03em;flex:none}
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
  .gp-chip{display:flex;align-items:center;gap:8px;background:#fff;border-radius:14px;padding:6px 10px 6px 6px;box-shadow:var(--shadow);flex:1;min-width:120px}
  .gp-chip b{display:block;font-size:14px}.gp-chip small{font-size:12px;color:var(--text2)}
  .gp-chip.turn{box-shadow:inset 0 0 0 2.5px var(--accent),var(--shadow)}
  .gp-status{min-height:22px;margin:10px 4px;font-size:15px;color:var(--text2);text-align:center}
  .gp-hint{background:#fff;border-radius:14px;padding:14px;text-align:center;color:var(--text2);margin:10px 0}
  .gp-label{font-weight:800;margin:14px 4px 8px;display:flex;align-items:center;gap:8px}
  .gp-yourturn{background:var(--accent);color:#fff;font-size:11px;padding:3px 8px;border-radius:7px;letter-spacing:.04em}
  .dm-chain{background:#2E7D4F;border-radius:18px;padding:12px;min-height:120px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center;box-shadow:inset 0 2px 10px rgba(0,0,0,.25)}
  .dm-chain svg{width:44px;height:22px}.dm-chain svg.dbl{width:22px;height:44px}
  .dm-chain .gp-hint{background:rgba(255,255,255,.9);margin:0}
  .dm-hand{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
  .dm-tile{padding:0;border-radius:8px;transition:transform .15s}
  .dm-tile svg{width:40px;height:80px;display:block}
  .dm-tile:disabled{opacity:.45}
  .dm-tile.ok{transform:translateY(-6px);filter:drop-shadow(0 4px 6px rgba(234,106,10,.45))}
  .dm-side{display:flex;align-items:center;gap:8px;justify-content:center;margin-top:12px;font-weight:700}
  .lu-wrap{display:flex;justify-content:center}
  .lu-wrap canvas{border-radius:16px;box-shadow:var(--shadow);touch-action:manipulation}
  .lu-ctrl{display:flex;align-items:center;gap:12px;margin-top:12px}
  .lu-dot{width:22px;height:22px;border-radius:50%;flex:none;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)}
  .gp-result{margin-top:14px;background:#fff;border-radius:20px;padding:18px;text-align:center;box-shadow:var(--shadow)}
  .gp-result.win{background:linear-gradient(160deg,#FFF3E2,#FFE0BD)}
  .gr-title{font-size:24px;font-weight:900;color:var(--accent)}
  .gr-sub{color:var(--text2);margin:4px 0 14px}
  .rt-top{display:flex;gap:10px;align-items:flex-start}
  .rt-timer{background:var(--accent);color:#fff;font-weight:900;font-size:20px;border-radius:14px;padding:10px 12px;min-width:84px;text-align:center}
  .rt-board{flex:1;background:#fff;border-radius:14px;padding:6px 10px;box-shadow:var(--shadow)}
  .rt-row{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:15px}
  .rt-row.me{font-weight:800}
  .rt-rank{width:16px;color:var(--text2);font-size:13px}
  .rt-dot{width:10px;height:10px;border-radius:50%}
  .rt-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rt-main{position:relative;margin-top:12px;display:flex;justify-content:center}
  .rt-main canvas{border-radius:16px;box-shadow:var(--shadow);touch-action:none}
  .rt-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:90px;font-weight:900;color:var(--accent);text-shadow:0 4px 20px rgba(255,255,255,.9)}
  .rt-minis{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:12px}
  .rt-mini{text-align:center;font-size:12px;color:var(--text2)}
  .rt-mini canvas{border-radius:10px;box-shadow:var(--shadow);display:block;margin-bottom:3px}
  .sn-pad{display:grid;grid-template-columns:repeat(3,72px);grid-template-rows:repeat(2,60px);gap:8px;justify-content:center;margin-top:14px}
  .sn-pad button{background:#fff;border-radius:16px;font-size:24px;box-shadow:var(--shadow);color:var(--accent)}
  .sn-pad button:active{background:var(--accent-soft)}
  .sn-pad .up{grid-column:2;grid-row:1}.sn-pad .left{grid-column:1;grid-row:2}.sn-pad .down{grid-column:2;grid-row:2}.sn-pad .right{grid-column:3;grid-row:2}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const view = document.createElement('div');
  view.id = 'gameView'; view.className = 'game-view hidden';
  view.innerHTML = `<div class="gv-head">
      <button type="button" class="gv-exit" onclick="TTG.keluar()"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="gvExitTxt">Kembali</span></button>
      <div id="gvTitle" class="gv-title"></div><span id="gvLive" class="live-badge hidden"></span>
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

  roomsRef.on('value', snap => {
    rooms = snap.val() || {};
    if (cur && cur.roomId) onRoomUpdate();
    if (!document.getElementById('tab-hiburan').classList.contains('hidden')) renderPane();
  });

  window.TTG = {
    renderPane, pilih, tutup: closeView, keluar, jeda, lanjut, mulaiOnline, mainLagi, gabung: gabungMeja, tonton: tontonMeja,
    _engines: { Domino, Ludo }
  };
})();
