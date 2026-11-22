/* =========================================================
   Thai Tea — Game tambahan: Monopoli
   Memakai sistem meja/bot/Live/jeda/podium dari games.js (TTG.daftarGame).
   ========================================================= */
(function () {
  if (!window.TTG || !TTG.daftarGame) return;
  const H = TTG._h;
  const { SFX, $, rnd, clone, shuffle, arr, sleep, seatName, seatAva } = H;
  const now = () => Date.now();
  const fmtF = n => (n < 0 ? '-' : '') + 'Rp' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  const fmt = n => { const a = Math.abs(n), sg = n < 0 ? '-' : ''; if (a >= 1e6) return `${sg}Rp${(a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Jt`; if (a >= 1e3) return `${sg}Rp${(a / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Rb`; return sg + 'Rp' + Math.round(a); };
  const gid = () => Date.now() + '' + rnd(1000);

  /* ---------- suara tambahan ---------- */
  const S = {
    ding() { SFX.tone(880, .12, 'sine', .2); SFX.tone(1320, .2, 'sine', .16, .09); },
    buzz() { SFX.tone(190, .28, 'square', .07); SFX.tone(150, .3, 'square', .05, .05); },
    tick() { SFX.tone(1250, .03, 'square', .045); },
    pop(i) { SFX.tone(600 + i * 70, .06, 'triangle', .13); },
    coin() { SFX.tone(1568, .08, 'square', .06); SFX.tone(2093, .16, 'square', .06, .07); },
    cash() { [0, .07, .14].forEach((t, i) => SFX.tone(1300 + i * 260, .08, 'square', .05, t)); SFX.noise(.12, .2, .2, 5000, 2); },
    flip() { SFX.noise(.09, .35, 0, 3200, 1.2); SFX.tone(700, .06, 'sine', .06, .05); },
    jail() { [392, 330, 262].forEach((f, i) => SFX.tone(f, .22, 'triangle', .14, i * .16)); },
    howl() { SFX.tone(280, .55, 'sine', .16, 0, 600); SFX.tone(600, 1.1, 'sine', .13, .5, 380); SFX.tone(840, .9, 'sine', .04, .55, 520); },
    rooster() { [0, .14, .28].forEach((t, i) => SFX.tone(700 + i * 180, .12, 'square', .05, t, 900 + i * 200)); SFX.tone(1200, .5, 'square', .04, .44, 700); },
    drum() { for (let i = 0; i < 14; i++) SFX.noise(.05, .25 + i * .01, i * .07, 180, 1); SFX.noise(.25, .6, 1.02, 120, .8); },
    magic() { [1047, 1319, 1568, 2093].forEach((f, i) => SFX.tone(f, .18, 'sine', .08, i * .06)); },
    shield() { SFX.tone(520, .3, 'triangle', .12, 0, 780); }
  };

  /* =====================================================================
     2. MONOPOLI NUSANTARA (papan 24 petak, kota-kota Indonesia)
     ===================================================================== */
  const MP_GRP = { 1: '#8D5524', 2: '#29B6F6', 3: '#EC407A', 4: '#FF9800', 5: '#E53935', 6: '#FBC02D', 7: '#1E5BD8' };
  const MP_TILES = [
    { t: 'start', n: 'START', ic: '🏁' },
    { t: 'kota', n: 'Padang', g: 1, p: 60 },
    { t: 'dana', n: 'Dana Umum', ic: '💝' },
    { t: 'kota', n: 'Bukittinggi', sn: 'Bukit&shy;tinggi', g: 1, p: 60 },
    { t: 'pajak', n: 'Pajak', ic: '🧾', p: 100 },
    { t: 'kota', n: 'Palembang', sn: 'Palem&shy;bang', g: 2, p: 100 },
    { t: 'penjara', n: 'Penjara', ic: '🚔' },
    { t: 'kota', n: 'Lampung', g: 2, p: 100 },
    { t: 'kesempatan', n: 'Kesempatan', sn: 'Kesem&shy;patan', ic: '❓' },
    { t: 'kota', n: 'Medan', g: 3, p: 140 },
    { t: 'kota', n: 'Batam', g: 3, p: 140 },
    { t: 'dana', n: 'Dana Umum', ic: '💝' },
    { t: 'parkir', n: 'Parkir Bebas', ic: '🅿️' },
    { t: 'kota', n: 'Bandung', g: 4, p: 180 },
    { t: 'kesempatan', n: 'Kesempatan', sn: 'Kesem&shy;patan', ic: '❓' },
    { t: 'kota', n: 'Yogyakarta', sn: 'Yogya&shy;karta', g: 4, p: 180 },
    { t: 'kota', n: 'Semarang', sn: 'Sema&shy;rang', g: 5, p: 220 },
    { t: 'kota', n: 'Surabaya', sn: 'Sura&shy;baya', g: 5, p: 220 },
    { t: 'kepenjara', n: 'Masuk Penjara', ic: '👮' },
    { t: 'kota', n: 'Makassar', sn: 'Makas&shy;sar', g: 6, p: 260 },
    { t: 'pajak', n: 'Pajak Mewah', ic: '💎', p: 75 },
    { t: 'kota', n: 'Bali', g: 6, p: 260 },
    { t: 'kota', n: 'Jakarta', g: 7, p: 350 },
    { t: 'kota', n: 'Pekanbaru', sn: 'Pekan&shy;baru', g: 7, p: 400 }
  ];
  const MP_K = 100000;   // 1 satuan lama = Rp100 rb → harga kota jutaan
  MP_TILES.forEach(t => { if (t.p) t.p *= MP_K; });
  const MP_N = MP_TILES.length, MP_START_CASH = 1000 * MP_K, MP_SALARY = 100 * MP_K, MP_JAIL = 6, MP_MAX_ROUND = 60, MP_JAIL_FEE = 50 * MP_K;
  const sewaDasar = p => Math.round(p * .35 / 50000) * 50000;
  const MP_CARD = {
    kesempatan: [
      { x: 'Maju ke START, terima gaji', go: 0 },
      { x: 'Menang lomba masak!', cash: 100 * MP_K },
      { x: 'Kena tilang di jalan', cash: -50 * MP_K },
      { x: 'Mundur 3 langkah', back: 3 },
      { x: 'Ketahuan parkir liar, masuk penjara!', jail: true },
      { x: 'Liburan ke Bali!', go: 21 },
      { x: 'Dapat bonus dari tetangga', cash: 50 * MP_K },
      { x: 'Servis motor', cash: -80 * MP_K },
      { x: 'Pulang kampung ke Pekanbaru', go: 23 }
    ],
    dana: [
      { x: 'Ulang tahun! Terima Rp2 Jt dari setiap pemain', each: 20 * MP_K },
      { x: 'Bayar uang sekolah', cash: -100 * MP_K },
      { x: 'Tabungan cair', cash: 150 * MP_K },
      { x: 'Menang arisan!', cash: 120 * MP_K },
      { x: 'Biaya dokter', cash: -60 * MP_K },
      { x: 'Jual barang bekas', cash: 40 * MP_K },
      { x: 'Traktir teman, bayar Rp3 Jt ke setiap pemain', each: -30 * MP_K }
    ]
  };
  const MP_COL = ['#FF4D4D', '#2DB84D', '#1F7FE0', '#F7B500'];
  const MP_DARK = ['#A31F18', '#16772D', '#0E4F99', '#A06A00'];
  const sewa = (st, i) => { const tl = MP_TILES[i], o = st.own[i]; if (o === undefined || o === null) return 0; const full = MP_TILES.every((x, k) => x.g !== tl.g || st.own[k] === o); return sewaDasar(tl.p) * (full ? 2 : 1); };
  const Mono = {
    init(n) {
      return { n, pos: Array(n).fill(0), cash: Array(n).fill(MP_START_CASH), own: {}, inc: {}, m: 1, jail: Array(n).fill(0), out: Array(n).fill(false), turn: 0, phase: 'roll', dice: [3, 4], round: 1, last: null, winner: null, deadline: now() + 12000, v: 1, gid: gid() };
    },
    norm(st) {
      st.pos = arr(st.pos).map(Number); st.cash = arr(st.cash).map(Number); st.jail = arr(st.jail).map(Number); st.out = arr(st.out).map(Boolean);
      st.dice = arr(st.dice).map(Number); const o = {}; Object.keys(st.own || {}).forEach(k => { if (st.own[k] !== null && st.own[k] !== undefined) o[k] = Number(st.own[k]); }); st.own = o;
      if (!st.m) { st.cash = st.cash.map(c => c * MP_K); st.m = 1; }   // game tersimpan versi lama (angka kecil)
      const inc = {}; Object.keys(st.inc || {}).forEach(k => { inc[k] = Number(st.inc[k]) || 0; }); st.inc = inc;
      if (st.winner === undefined) st.winner = null; if (st.last) { if (st.last.path) st.last.path = arr(st.last.path).map(Number); if (st.last.dice) st.last.dice = arr(st.last.dice).map(Number); }
      return st;
    },
    bayar(st, s, amt, to, L) {
      st.cash[s] -= amt;
      if (to !== undefined && to !== null) st.cash[to] += amt;
      if (st.cash[s] >= 0) return;
      // jual tanah (setengah harga) mulai dari yang termurah
      const milik = Object.keys(st.own).map(Number).filter(k => st.own[k] === s).sort((a, b) => MP_TILES[a].p - MP_TILES[b].p);
      for (const k of milik) { if (st.cash[s] >= 0) break; st.cash[s] += Math.round(MP_TILES[k].p / 2); delete st.own[k]; delete st.inc[k]; (L.sold = L.sold || []).push(k); }
      if (st.cash[s] < 0) {
        if (to !== undefined && to !== null) st.cash[to] += st.cash[s];   // penerima hanya dapat sebanyak yang ada
        st.cash[s] = 0; st.out[s] = true; L.bankrupt = s;
        Object.keys(st.own).forEach(k => { if (st.own[k] === s) { delete st.own[k]; delete st.inc[k]; } });
      }
    },
    mendarat(st, s, L, depth) {
      const i = st.pos[s], tl = MP_TILES[i];
      if (tl.t === 'kota') {
        const o = st.own[i];
        if (o === undefined) { if (st.cash[s] >= tl.p) { st.phase = 'buy'; return; } L.cantBuy = true; }
        else if (o !== s && !st.out[o]) { const r = sewa(st, i); L.rent = { to: o, amt: r, tile: i }; const before = st.cash[o]; this.bayar(st, s, r, o, L); st.inc[i] = (st.inc[i] || 0) + Math.max(0, st.cash[o] - before); }
      } else if (tl.t === 'pajak') { L.tax = tl.p; this.bayar(st, s, tl.p, null, L); }
      else if (tl.t === 'kepenjara') { st.pos[s] = MP_JAIL; st.jail[s] = 1; L.jail = true; }
      else if ((tl.t === 'kesempatan' || tl.t === 'dana') && depth < 2) {
        const list = MP_CARD[tl.t], ci = rnd(list.length), c = list[ci];
        L.card = { t: tl.t, i: ci };
        if (c.cash) { if (c.cash > 0) st.cash[s] += c.cash; else this.bayar(st, s, -c.cash, null, L); }
        else if (c.each) {
          for (let k = 0; k < st.n; k++) if (k !== s && !st.out[k]) { if (c.each > 0) this.bayar(st, k, c.each, s, L); else this.bayar(st, s, -c.each, k, L); if (st.out[s]) break; }
        } else if (c.jail) { st.pos[s] = MP_JAIL; st.jail[s] = 1; L.jail = true; }
        else if (c.go !== undefined || c.back) {
          const from = st.pos[s];
          const to = c.back ? (from - c.back + MP_N) % MP_N : c.go;
          if (!c.back && to <= from) { st.cash[s] += MP_SALARY; L.salary2 = true; }
          st.pos[s] = to; L.jump = { from, to };
          this.mendarat(st, s, L, depth + 1);
        }
      }
    },
    lanjut(st) {
      st.phase = 'roll';
      const alive = st.out.map((o, i) => o ? -1 : i).filter(i => i >= 0);
      if (alive.length <= 1) { st.winner = alive[0] !== undefined ? alive[0] : 0; st.reason = 'Pemain lain bangkrut'; return; }
      let t = st.turn;
      do { t = (t + 1) % st.n; if (t === 0) st.round++; } while (st.out[t]);
      st.turn = t;
      if (st.round > MP_MAX_ROUND) {
        const kaya = s => st.cash[s] + Object.keys(st.own).filter(k => st.own[k] === s).reduce((a, k) => a + MP_TILES[k].p, 0);
        let best = alive[0]; alive.forEach(s => { if (kaya(s) > kaya(best)) best = s; });
        st.winner = best; st.reason = `Batas ${MP_MAX_ROUND} putaran, harta terbanyak`; return;
      }
      if (st.jail[t] > 0) st.phase = 'jail';
      st.deadline = now() + 12000;
    },
    apply(st, s, mv) {
      st = this.norm(clone(st));
      if (st.winner !== null) return st;
      const a = st.turn;
      if (s !== a && s !== -1) return st;
      if (mv.timeout) mv = st.phase === 'buy' ? { skip: true } : st.phase === 'jail' ? { wait: true } : { roll: true };
      const L = { s: a };
      if (st.phase === 'roll' && mv.roll) {
        const d = [1 + rnd(6), 1 + rnd(6)], steps = d[0] + d[1], from = st.pos[a];
        const path = []; for (let k = 1; k <= steps; k++) path.push((from + k) % MP_N);
        st.dice = d; st.pos[a] = path[path.length - 1];
        L.dice = d; L.path = path; L.from = from;
        if (from + steps >= MP_N) { st.cash[a] += MP_SALARY; L.salary = true; }
        this.mendarat(st, a, L, 0);
        if (st.phase !== 'buy') this.lanjut(st); else st.deadline = now() + 20000;
      } else if (st.phase === 'buy' && (mv.buy || mv.skip)) {
        const i = st.pos[a];
        if (mv.buy && st.own[i] === undefined && st.cash[a] >= MP_TILES[i].p) { st.cash[a] -= MP_TILES[i].p; st.own[i] = a; st.inc[i] = 0; L.buy = i; } else L.skipBuy = i;
        this.lanjut(st);
      } else if (st.phase === 'jail' && (mv.pay || mv.wait)) {
        if (mv.pay && st.cash[a] >= MP_JAIL_FEE) { st.cash[a] -= MP_JAIL_FEE; st.jail[a] = 0; st.phase = 'roll'; L.payJail = true; st.deadline = now() + 12000; }
        else { st.jail[a] = 0; L.waitJail = true; this.lanjut(st); }
      } else return st;
      st.last = L; st.v++;
      return st;
    },
    bot(st, s) {
      if (st.phase === 'buy') { const p = MP_TILES[st.pos[s]].p; return st.cash[s] - p >= 120 * MP_K || Math.random() < .25 && st.cash[s] >= p ? { buy: true } : { skip: true }; }
      if (st.phase === 'jail') return st.cash[s] > 400 * MP_K ? { pay: true } : { wait: true };
      return { roll: true };
    },
    botDelay(st) { return st.phase === 'roll' ? 900 : 1300; },
    pending(st, seats) {
      if (st.winner !== null) return null;
      const seat = seats[st.turn];
      if (seat && !seat.bot && st.deadline) return { mv: { timeout: true }, ms: Math.max(1500, st.deadline - now() + 6000) };
      return null;
    },
    kekayaan(st, s) { return st.cash[s] + Object.keys(st.own).filter(k => st.own[k] === s).reduce((a, k) => a + MP_TILES[k].p, 0); },
    rank(st) { return Array.from({ length: st.n }, (_, i) => i).sort((a, b) => (b === st.winner) - (a === st.winner) || this.kekayaan(st, b) - this.kekayaan(st, a)); },
    rankVal(st, s) { return st.out[s] ? 'bangkrut' : `harta ${fmt(this.kekayaan(st, s))}`; }
  };
  // posisi petak di grid 7×7
  function mpCell(i) {
    if (i <= 6) return [6, 6 - i];
    if (i <= 12) return [6 - (i - 6), 0];
    if (i <= 18) return [0, i - 12];
    return [i - 18, 6];
  }
  function mpTokenXY(i, k, cnt) {
    const [r, c] = mpCell(i);
    const off = cnt > 1 ? [[-.18, -.14], [.18, -.14], [-.18, .16], [.18, .16]][k] : [0, 0];
    return [(c + .5 + off[0]) / 7 * 100, (r + .5 + off[1]) / 7 * 100];
  }
  const DIE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const DIE_PIP = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const dieHtml = id => `<div class="mp-die"><div class="mp-cube" id="${id}">${[1, 2, 3, 4, 5, 6].map(n => `<div class="mp-f f${n}">${Array.from({ length: 9 }, (_, k) => `<i class="${DIE_PIP[n].includes(k + 1) ? 'on' : ''}"></i>`).join('')}</div>`).join('')}</div></div>`;
  const dieSpin = {};
  function dieShow(id, v, roll) {
    const el = $(id); if (!el) return;
    const sp = dieSpin[id] || { x: 0, y: 0 };
    if (roll) { sp.x += 720 + 360 * rnd(2); sp.y += 720 + 360 * rnd(2); }
    const bx = Math.round(sp.x / 360) * 360, by = Math.round(sp.y / 360) * 360; dieSpin[id] = { x: bx, y: by };
    const [fx, fy] = DIE_ROT[v] || [0, 0];
    el.style.transition = roll ? 'transform .75s cubic-bezier(.15,.85,.25,1)' : 'none';
    el.style.transform = `rotateX(${bx + fx}deg) rotateY(${by + fy}deg)`;
  }
  /* ---------- ikon & landmark SVG (tanpa emoji) ---------- */
  const SV = (body, vb) => `<svg viewBox="${vb || '0 0 40 40'}" aria-hidden="true">${body}</svg>`;
  const MP_ICON = {
    start: SV('<rect x="11" y="6" width="2.6" height="30" rx="1.3" fill="#6E4A2A"/><g><rect x="13.5" y="7" width="20" height="14" rx="2" fill="#fff" stroke="#1C1C1E" stroke-width="1.2"/><rect x="13.5" y="7" width="5" height="3.5" fill="#1C1C1E"/><rect x="23.5" y="7" width="5" height="3.5" fill="#1C1C1E"/><rect x="18.5" y="10.5" width="5" height="3.5" fill="#1C1C1E"/><rect x="28.5" y="10.5" width="5" height="3.5" fill="#1C1C1E"/><rect x="13.5" y="14" width="5" height="3.5" fill="#1C1C1E"/><rect x="23.5" y="14" width="5" height="3.5" fill="#1C1C1E"/><rect x="18.5" y="17.5" width="5" height="3.5" fill="#1C1C1E"/><rect x="28.5" y="17.5" width="5" height="3.5" fill="#1C1C1E"/></g><ellipse cx="12.3" cy="36" rx="6" ry="1.6" fill="#000" opacity=".15"/>'),
    penjara: SV('<rect x="6" y="12" width="28" height="22" rx="3" fill="#8E8E93"/><path d="M4 13l16-8 16 8z" fill="#636366"/><rect x="10" y="16" width="20" height="14" rx="2" fill="#2C2C2E"/><g fill="#C7C7CC"><rect x="12" y="16" width="2.2" height="14"/><rect x="17" y="16" width="2.2" height="14"/><rect x="22" y="16" width="2.2" height="14"/><rect x="27" y="16" width="2.2" height="14"/></g>'),
    parkir: SV('<rect x="18.5" y="22" width="3" height="14" fill="#8E8E93"/><rect x="7" y="4" width="26" height="22" rx="5" fill="#0A84FF"/><path d="M15 9h6a5 5 0 0 1 0 10h-3v4h-3zm3 3v4h3a2 2 0 0 0 0-4z" fill="#fff"/>'),
    kepenjara: SV('<path d="M8 20c0-7 5.5-12 12-12s12 5 12 12z" fill="#1E3A8A"/><rect x="6" y="19" width="28" height="5" rx="2.5" fill="#142659"/><path d="M14 24h12l-2 6h-8z" fill="#1C1C1E"/><circle cx="20" cy="14" r="3.2" fill="#FFD60A"/><path d="M20 11.5l.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.7.9.4-1.8-1.3-1.2 1.8-.2z" fill="#B8860B"/>'),
    kesempatan: SV('<rect x="9" y="5" width="22" height="30" rx="4" fill="#FF9F0A" transform="rotate(-8 20 20)"/><rect x="11" y="7" width="22" height="30" rx="4" fill="#FFB340" stroke="#fff" stroke-width="1.5"/><path d="M18.5 15.5a3.6 3.6 0 1 1 5.4 3.1c-1.3.8-1.9 1.4-1.9 2.9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="22" cy="27" r="1.7" fill="#fff"/>'),
    dana: SV('<rect x="7" y="17" width="26" height="17" rx="3" fill="#E84393"/><rect x="5" y="12" width="30" height="7" rx="2" fill="#FD79A8"/><rect x="18" y="12" width="4" height="22" fill="#FFE27A"/><path d="M20 12c-3-6-9-6-8-2s8 2 8 2zm0 0c3-6 9-6 8-2s-8 2-8 2z" fill="#FFE27A"/>'),
    pajak: SV('<path d="M10 4h20v32l-3-2-3 2-4-2-4 2-3-2-3 2z" fill="#fff" stroke="#8E8E93" stroke-width="1.4"/><g stroke="#8E8E93" stroke-width="1.6" stroke-linecap="round"><path d="M14 11h12M14 16h12M14 21h8"/></g><path d="M14 27h12" stroke="#E53935" stroke-width="2.2" stroke-linecap="round"/>'),
    mewah: SV('<path d="M10 8h20l6 8-16 18L4 16z" fill="#64D2FF"/><path d="M10 8l4 8h12l4-8M4 16h32M14 16l6 18 6-18" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round"/>'),
    // landmark kota
    Padang: SV('<path d="M3 18c4 1 8-1 10-7 1 4 4 6 7 6s6-2 7-6c2 6 6 8 10 7l-3 4H6z" fill="#7B3F00"/><rect x="7" y="21" width="26" height="11" fill="#C47A2C"/><g fill="#8E4B12"><rect x="10" y="24" width="4" height="5"/><rect x="18" y="24" width="4" height="8"/><rect x="26" y="24" width="4" height="5"/></g><rect x="5" y="32" width="30" height="3" fill="#6E4A2A"/>'),
    Bukittinggi: SV('<rect x="14" y="13" width="12" height="22" fill="#F2E8D5" stroke="#C9B48A" stroke-width=".8"/><path d="M11 14c2-1 3-5 3-8 1 3 3 4 6 4s5-1 6-4c0 3 1 7 3 8z" fill="#8E2C2C"/><circle cx="20" cy="19" r="4" fill="#fff" stroke="#1C1C1E" stroke-width="1"/><path d="M20 17v2.3l1.6 1" stroke="#1C1C1E" stroke-width="1" fill="none"/><rect x="17.5" y="28" width="5" height="7" rx="2.5" fill="#C9B48A"/><rect x="11" y="35" width="18" height="2" fill="#8E8E93"/>'),
    Palembang: SV('<rect x="2" y="27" width="36" height="5" fill="#C62828"/><rect x="9" y="8" width="4" height="24" fill="#E53935"/><rect x="27" y="8" width="4" height="24" fill="#E53935"/><rect x="8" y="12" width="6" height="2" fill="#B71C1C"/><rect x="26" y="12" width="6" height="2" fill="#B71C1C"/><path d="M11 9L2 27M11 9l9 18M29 9l-9 18M29 9l9 18" stroke="#B71C1C" stroke-width="1"/><path d="M0 34c4-2 8 2 12 0s8 2 12 0 8 2 12 0 4 0 4 0v4H0z" fill="#29B6F6"/>'),
    Lampung: SV('<path d="M20 4l3 6 6-3-1 7 6 1-4 5h-20l-4-5 6-1-1-7 6 3z" fill="#F5B700"/><rect x="11" y="19" width="18" height="16" fill="#FFD54F"/><rect x="8" y="35" width="24" height="2" fill="#8E8E93"/><g fill="#E53935"><rect x="14" y="23" width="3" height="5"/><rect x="18.5" y="23" width="3" height="5"/><rect x="23" y="23" width="3" height="5"/></g><circle cx="20" cy="8" r="1.6" fill="#E53935"/>'),
    Medan: SV('<rect x="6" y="20" width="28" height="15" fill="#F7D774"/><path d="M14 20a6 6 0 0 1 12 0z" fill="#2E7D32"/><rect x="19.4" y="9" width="1.2" height="6" fill="#2E7D32"/><path d="M6 20a3 3 0 0 1 6 0zm22 0a3 3 0 0 1 6 0z" fill="#2E7D32"/><g fill="#B8860B"><rect x="9" y="24" width="3" height="7" rx="1.5"/><rect x="15" y="24" width="3" height="7" rx="1.5"/><rect x="22" y="24" width="3" height="7" rx="1.5"/><rect x="28" y="24" width="3" height="7" rx="1.5"/></g><rect x="4" y="35" width="32" height="2" fill="#8E8E93"/>'),
    Batam: SV('<rect x="2" y="27" width="36" height="3" fill="#90A4AE"/><path d="M14 6v24M26 6v24" stroke="#ECEFF1" stroke-width="3"/><path d="M14 7L3 27M14 7l-6 20M14 7l6 20M26 7l-6 20M26 7l6 20M26 7l11 20" stroke="#B0BEC5" stroke-width=".9"/><path d="M0 32c4-2 8 2 12 0s8 2 12 0 8 2 12 0 4 0 4 0v6H0z" fill="#29B6F6"/>'),
    Bandung: SV('<rect x="4" y="22" width="32" height="13" fill="#F5F5F0" stroke="#D6D3C4" stroke-width=".8"/><rect x="15" y="14" width="10" height="21" fill="#FAFAF5" stroke="#D6D3C4" stroke-width=".8"/><path d="M14 14l6-4 6 4z" fill="#E57373"/><path d="M20 10V3" stroke="#555" stroke-width="1"/><g fill="#555"><circle cx="20" cy="4" r="1"/><circle cx="20" cy="6" r="1"/><circle cx="20" cy="8" r="1"/></g><path d="M3 22l3-3h28l3 3z" fill="#E57373"/><g fill="#90A4AE"><rect x="7" y="26" width="3" height="5"/><rect x="11" y="26" width="3" height="5"/><rect x="26" y="26" width="3" height="5"/><rect x="30" y="26" width="3" height="5"/><rect x="18.5" y="27" width="3" height="8"/></g>'),
    Yogyakarta: SV('<rect x="12" y="30" width="16" height="5" fill="#E0E0E0"/><rect x="14" y="20" width="12" height="10" fill="#FAFAFA" stroke="#CFCFCF" stroke-width=".8"/><path d="M16 20l1-8h6l1 8z" fill="#FAFAFA" stroke="#CFCFCF" stroke-width=".8"/><path d="M20 4c3 3 3 6 0 8-3-2-3-5 0-8z" fill="#F5B700"/><rect x="17" y="12" width="6" height="1.6" fill="#F5B700"/><rect x="15" y="23" width="10" height="1.4" fill="#2E7D32"/><rect x="10" y="35" width="20" height="2" fill="#8E8E93"/>'),
    Semarang: SV('<rect x="5" y="18" width="30" height="17" fill="#F3EDE2" stroke="#D8CBB3" stroke-width=".8"/><rect x="6" y="10" width="7" height="25" fill="#F7F1E6" stroke="#D8CBB3" stroke-width=".8"/><rect x="27" y="10" width="7" height="25" fill="#F7F1E6" stroke="#D8CBB3" stroke-width=".8"/><path d="M5.5 10a4 4 0 0 1 8 0zM26.5 10a4 4 0 0 1 8 0z" fill="#8D6E63"/><g fill="#8D6E63"><path d="M15 24a2 2 0 0 1 4 0v6h-4zM21 24a2 2 0 0 1 4 0v6h-4z"/><rect x="8" y="16" width="3" height="4"/><rect x="29" y="16" width="3" height="4"/></g><path d="M4 18h32" stroke="#B71C1C" stroke-width="1.5"/>'),
    Surabaya: SV('<path d="M17 34l1.5-26h3L23 34z" fill="#ECEFF1" stroke="#B0BEC5" stroke-width=".8"/><path d="M15.5 9h9l-1-3h-7z" fill="#CFD8DC"/><path d="M20 3v3" stroke="#E53935" stroke-width="1.4"/><path d="M20.7 3h4l-1 1.2 1 1.2h-4z" fill="#E53935"/><rect x="10" y="34" width="20" height="3" rx="1" fill="#90A4AE"/>'),
    Makassar: SV('<path d="M4 27h32l-5 7H9z" fill="#8D5524"/><rect x="19.3" y="4" width="1.4" height="23" fill="#5D3A1A"/><rect x="11.3" y="9" width="1.2" height="18" fill="#5D3A1A"/><path d="M20.7 5l11 20h-11zM12.5 10l6 15h-6z" fill="#FFF8E1"/><path d="M19.3 6L9 24h10.3z" fill="#FFECB3"/><path d="M0 34c4-2 8 2 12 0s8 2 12 0 8 2 12 0 4 0 4 0v6H0z" fill="#29B6F6"/>'),
    Bali: SV('<path d="M4 35V20l3-2v-4l3-2V8l4-3v30z" fill="#6D4C41"/><path d="M36 35V20l-3-2v-4l-3-2V8l-4-3v30z" fill="#6D4C41"/><path d="M4 20h10M4 14h10M30 20h6M26 14h10" stroke="#3E2723" stroke-width="1"/><rect x="16" y="28" width="8" height="7" fill="#81C784"/><circle cx="20" cy="25" r="3" fill="#FFB74D"/><rect x="2" y="35" width="36" height="2" fill="#8E8E93"/>'),
    Jakarta: SV('<rect x="8" y="31" width="24" height="5" fill="#ECEFF1" stroke="#B0BEC5" stroke-width=".7"/><rect x="11" y="28" width="18" height="3" fill="#ECEFF1" stroke="#B0BEC5" stroke-width=".7"/><path d="M18 28l1-19h2l1 19z" fill="#FAFAFA" stroke="#B0BEC5" stroke-width=".7"/><rect x="17" y="8" width="6" height="2" fill="#B0BEC5"/><path d="M20 1c3 3 2 5 0 7-2-2-3-4 0-7z" fill="#FFC107"/>'),
    Pekanbaru: SV('<rect x="8" y="22" width="24" height="13" fill="#FAFAF5" stroke="#D6D3C4" stroke-width=".8"/><path d="M12 22a8 8 0 0 1 16 0z" fill="#2E7D32"/><path d="M20 10v4" stroke="#C9A227" stroke-width="1.2"/><circle cx="20" cy="9.5" r="1.3" fill="#C9A227"/><path d="M8 22a3 3 0 0 1 6 0zM26 22a3 3 0 0 1 6 0z" fill="#43A047"/><rect x="3" y="12" width="3" height="23" fill="#FAFAF5" stroke="#D6D3C4" stroke-width=".7"/><rect x="34" y="12" width="3" height="23" fill="#FAFAF5" stroke="#D6D3C4" stroke-width=".7"/><path d="M3 12l1.5-4 1.5 4zM34 12l1.5-4 1.5 4z" fill="#2E7D32"/><path d="M18 35v-6a2 2 0 0 1 4 0v6z" fill="#8D6E63"/>')
  };
  const MP_UI = {
    coin: SV('<circle cx="12" cy="12" r="9" fill="#FFC107"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#FFE082" stroke-width="1.4"/><path d="M12 7.5v9M14.3 9.5c-.6-.8-1.4-1-2.3-1-1.3 0-2.2.7-2.2 1.7 0 2.3 4.7 1.2 4.7 3.6 0 1-.9 1.8-2.4 1.8-1 0-1.9-.4-2.5-1.1" stroke="#9C6B00" stroke-width="1.4" fill="none" stroke-linecap="round"/>', '0 0 24 24'),
    pay: SV('<rect x="2" y="6" width="20" height="13" rx="2.5" fill="#34C759"/><circle cx="12" cy="12.5" r="3.2" fill="#fff" opacity=".85"/><path d="M5 9.5h2M17 15.5h2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>', '0 0 24 24'),
    house: SV('<path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="#FF9500"/><path d="M1.5 12L12 3l10.5 9" stroke="#C93400" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 24 24'),
    jail: SV('<rect x="3" y="4" width="18" height="16" rx="2" fill="#636366"/><g fill="#D1D1D6"><rect x="6" y="4" width="2" height="16"/><rect x="11" y="4" width="2" height="16"/><rect x="16" y="4" width="2" height="16"/></g>', '0 0 24 24'),
    boom: SV('<path d="M12 1l2.2 5.6 5.8-2-2.3 5.6 5.3 2.8-5.9 1.4 1.6 5.8-5-3.4L12 23l-1.7-6.2-5 3.4 1.6-5.8L1 13l5.3-2.8L4 4.6l5.8 2z" fill="#FF3B30"/><circle cx="12" cy="12" r="4" fill="#FFD60A"/>', '0 0 24 24'),
    dice: SV('<rect x="3" y="3" width="18" height="18" rx="4.5" fill="#fff"/><g fill="#1C1C1E"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="16" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="8" cy="16" r="1.7"/></g>', '0 0 24 24'),
    side: SV('<path d="M3 15l9-5 9 5-9 5z" fill="currentColor" opacity=".35"/><path d="M3 15l9-5 9 5-9 5zM12 10V4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><circle cx="12" cy="4" r="2" fill="currentColor"/>', '0 0 24 24'),
    top: SV('<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" opacity=".35"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>', '0 0 24 24'),
    skip: SV('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>', '0 0 24 24'),
    wait: SV('<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>', '0 0 24 24'),
    tag: SV('<rect x="2.5" y="6" width="19" height="9" rx="4.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M7 10.5h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 15v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="20.5" r="1.5" fill="currentColor"/>', '0 0 24 24')
  };
  const tileIcon = (tl, i) => tl.t === 'kota' ? MP_ICON[tl.n] : tl.t === 'pajak' ? (i === 20 ? MP_ICON.mewah : MP_ICON.pajak) : MP_ICON[tl.t] || '';
  const pawnSvg = (s, top) => top
    ? `<svg viewBox="0 0 30 30" class="mp-disc"><ellipse cx="15" cy="17" rx="12" ry="11" fill="rgba(0,0,0,.25)"/><circle cx="15" cy="15" r="11" fill="${MP_DARK[s]}"/><circle cx="15" cy="14" r="9.5" fill="${MP_COL[s]}"/><circle cx="15" cy="14" r="5.2" fill="${MP_DARK[s]}" opacity=".45"/><circle cx="11.5" cy="10.5" r="2.6" fill="#fff" opacity=".7"/></svg>`
    : `<svg viewBox="0 0 30 44" class="mp-pin"><ellipse cx="15" cy="41" rx="10" ry="3" fill="rgba(0,0,0,.28)"/><path d="M6 39c0-4 4-6 5-10l1-6h6l1 6c1 4 5 6 5 10z" fill="${MP_DARK[s]}"/><path d="M7.5 38.5c0-3.4 3.6-5.3 4.6-9l.9-5.5h4l.9 5.5c1 3.7 4.6 5.6 4.6 9z" fill="${MP_COL[s]}"/><circle cx="15" cy="13" r="9" fill="${MP_DARK[s]}"/><circle cx="15" cy="12.4" r="8" fill="${MP_COL[s]}"/><circle cx="12" cy="9.5" r="2.6" fill="#fff" opacity=".75"/></svg>`;
  let mpView = (() => { try { return localStorage.getItem('tt_mp_view') || 'side'; } catch (e) { return 'side'; } })();
  let mpLast = null;
  let mpNames = (() => { try { return localStorage.getItem('tt_mp_names') !== '0'; } catch (e) { return true; } })();
  let mpAsetFor = null;
  // lembar aset pemain: kota, sewa, pendapatan sewa, modal & untung
  function asetHtml(st, ctx, s) {
    const milik = Object.keys(st.own).map(Number).filter(k => st.own[k] === s).sort((a, b) => a - b);
    const modal = milik.reduce((a, k) => a + MP_TILES[k].p, 0);
    const pend = milik.reduce((a, k) => a + (st.inc[k] || 0), 0);
    const selisih = pend - modal;
    const status = v => v >= 0 ? `<span class="mpa-ok">Sudah untung ${fmtF(v)}</span>` : `<span class="mpa-no">Belum balik modal, kurang ${fmtF(-v)}</span>`;
    const rows = milik.map(k => {
      const tl = MP_TILES[k], sw = sewa(st, k), full = sw > sewaDasar(tl.p), inc = st.inc[k] || 0;
      return `<div class="mpa-row" style="--g:${MP_GRP[tl.g]}"><img src="mp/${tl.n}.jpg" alt=""><div class="mpa-r"><div class="mpa-n">${tl.n}${full ? ' <span class="mpa-x2">Sewa ×2</span>' : ''}</div>
        <div class="mpa-g"><span>Harga beli</span><b>${fmtF(tl.p)}</b><span>Sewa</span><b>${fmtF(sw)}</b><span>Pendapatan sewa</span><b>${fmtF(inc)}</b></div>${status(inc - tl.p)}</div></div>`;
    }).join('');
    return `<div class="mpa-card"><div class="mpa-head" style="--c:${MP_COL[s]}"><span class="mp-chip-pawn">${pawnSvg(s, true)}</span><div><div class="mpa-name">${esc(seatName(ctx, s))}</div><div class="mpa-sub">${st.out[s] ? 'Bangkrut' : `Uang tunai ${fmtF(st.cash[s])}`}</div></div><button type="button" class="mpa-x" id="mpAsetX" aria-label="Tutup">${MP_UI.skip}</button></div>
      <div class="mpa-sum"><div><span>Kota dimiliki</span><b>${milik.length}</b></div><div><span>Total modal beli</span><b>${fmtF(modal)}</b></div><div><span>Total pendapatan sewa</span><b>${fmtF(pend)}</b></div><div><span>Total harta</span><b>${fmtF(Mono.kekayaan(st, s))}</b></div></div>
      ${milik.length ? `<div class="mpa-stat">${status(selisih)}</div><div class="mpa-list">${rows}</div>` : '<div class="mpa-empty">Belum punya kota.</div>'}</div>`;
  }
  function bukaAset(s) { mpAsetFor = s; SFX.tap(); if (mpLast) renderMono(...mpLast); }
  let M3 = null, m3Loading = false, m3Failed = false;
  function siap3D() {
    if (M3 || m3Failed || m3Loading) return;
    try { const c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) { m3Failed = true; return; } } catch (e) { m3Failed = true; return; }
    m3Loading = true;
    import('./mono3d.js').then(m => {
      M3 = m.createBoard({ tiles: MP_TILES, grp: MP_GRP, col: MP_COL, dark: MP_DARK, icons: MP_ICON, photos: 'mp/', fmt: v => fmt(v).replace('Rp', 'Rp '), onPick: bukaAset });
      if (mpLast && mpLast[0].isConnected) renderMono(...mpLast);
    }).catch(e => { console.warn('3D gagal dimuat', e); m3Failed = true; m3Loading = false; });
  }
  let mpGid = null;
  function renderMono(box, st, ctx) {
    siap3D();
    if (st && st.gid !== mpGid) { mpGid = st.gid; mpAsetFor = null; }
    mpLast = [box, st, ctx];
    box.classList.add('mp-mode');
    st = Mono.norm(clone(st));
    const A = ctx.anim || {};
    const pos = A.pos || st.pos;
    const cash = A.cash || st.cash;
    const me = ctx.mySeat;
    const top = mpView === 'top';
    const myTurn = ctx.canAct && st.turn === me && st.winner === null && !ctx.spectator && !ctx.anim;
    const chips = Array.from({ length: st.n }, (_, s) => `<div role="button" tabindex="0" data-s="${s}" class="mp-chip ${st.turn === s && st.winner === null ? 'turn' : ''} ${st.out[s] ? 'out' : ''}" style="--c:${MP_COL[s]}"><span class="mp-chip-pawn">${pawnSvg(s, true)}</span><span class="mp-chip-t"><b>${esc(seatName(ctx, s))}</b><small>${st.out[s] ? 'Bangkrut' : fmt(cash[s])}</small></span></div>`).join('');
    let cells = '';
    MP_TILES.forEach((tl, i) => {
      const [r, c] = mpCell(i);
      const o = st.own[i];
      const corner = i % 6 === 0;
      const hi = A.hi !== undefined ? A.hi === i : (st.winner === null && i === pos[st.turn]);
      const side = r === 6 ? 'b' : c === 0 ? 'l' : r === 0 ? 't' : 'r';
      cells += `<div class="mp-cell s-${side} ${corner ? 'corner' : ''} t-${tl.t} ${hi ? 'hi' : ''}" style="grid-row:${r + 1};grid-column:${c + 1}">
        ${tl.g ? `<span class="mp-band" style="background:${MP_GRP[tl.g]}"></span>` : ''}
        <span class="mp-lm">${tileIcon(tl, i)}</span><span class="mp-nm">${tl.sn || tl.n}</span>
        ${tl.t === 'kota' && o === undefined ? `<span class="mp-pr">${tl.p}</span>` : ''}
        ${o !== undefined ? `<span class="mp-own" style="background:${MP_COL[o]}"></span>` : ''}</div>`;
    });
    const cnt = {}; pos.forEach((p, s) => { if (!st.out[s]) cnt[p] = (cnt[p] || 0) + 1; });
    const seen = {};
    const tokens = pos.map((p, s) => {
      if (st.out[s]) return '';
      const k = seen[p] = (seen[p] || 0); seen[p]++;
      const [x, y] = mpTokenXY(p, k, cnt[p]);
      return `<span class="mp-tok ${A.hop === s ? 'hop' : ''} ${st.turn === s && st.winner === null ? 'cur' : ''}" data-s="${s}" style="left:${x}%;top:${y}%">${pawnSvg(s, top)}${mpNames ? `<i class="mp-tname" style="--c:${MP_COL[s]}">${esc(seatName(ctx, s))}</i>` : ''}</span>`;
    }).join('');
    const curPos = pos[st.turn], tl = MP_TILES[curPos], own = st.own[curPos];
    let det = '';
    if (tl.t === 'kota') det = `Harga <b>${fmt(tl.p)}</b> · Sewa <b>${fmt(sewaDasar(tl.p))}</b><br>Pemilik: <b>${own !== undefined ? esc(seatName(ctx, own)) : 'belum ada'}</b>`;
    else if (tl.t === 'pajak') det = `Bayar pajak <b>${fmt(tl.p)}</b>`;
    else if (tl.t === 'start') det = `Lewat START dapat gaji <b>${fmt(MP_SALARY)}</b>`;
    else if (tl.t === 'penjara') det = 'Hanya mampir';
    else if (tl.t === 'kepenjara') det = 'Langsung masuk penjara!';
    else if (tl.t === 'parkir') det = 'Istirahat sebentar';
    else det = `Ambil kartu ${tl.n}`;
    let status = '';
    const l = st.last;
    if (st.winner === null && !ctx.anim && l) {
      const who = esc(seatName(ctx, l.s)); const bits = [];
      if (l.dice) bits.push(`${who} dapat ${l.dice[0] + l.dice[1]}`);
      if (l.buy !== undefined) bits.push(`${who} membeli ${MP_TILES[l.buy].n}`);
      if (l.rent) bits.push(`bayar sewa ${fmt(l.rent.amt)} ke ${esc(seatName(ctx, l.rent.to))}`);
      if (l.tax) bits.push(`bayar pajak ${fmt(l.tax)}`);
      if (l.card) bits.push(`kartu: ${MP_CARD[l.card.t][l.card.i].x}`);
      if (l.jail) bits.push(`${who} masuk penjara`);
      if (l.waitJail) bits.push(`${who} menunggu di penjara`);
      if (l.payJail) bits.push(`${who} bayar ${fmt(MP_JAIL_FEE)} keluar penjara`);
      if (l.bankrupt !== undefined) bits.push(`${esc(seatName(ctx, l.bankrupt))} BANGKRUT`);
      status = bits.join(' · ');
    }
    let actions = '';
    if (st.winner === null && !ctx.anim) {
      if (myTurn && st.phase === 'roll') actions = `<button type="button" class="btn btn-primary mp-btn" id="mpRoll">${MP_UI.dice} Lempar Dadu</button>`;
      else if (myTurn && st.phase === 'buy') actions = `<div class="mp-two"><button type="button" class="btn btn-gray mp-btn" id="mpSkip">${MP_UI.skip} Lewati</button><button type="button" class="btn btn-primary mp-btn" id="mpBuy">${MP_UI.house} Beli ${fmt(tl.p)}</button></div>`;
      else if (myTurn && st.phase === 'jail') actions = `<div class="mp-two"><button type="button" class="btn btn-gray mp-btn" id="mpWait">${MP_UI.wait} Tunggu</button><button type="button" class="btn btn-primary mp-btn" id="mpPay" ${st.cash[me] < MP_JAIL_FEE ? 'disabled' : ''}>${MP_UI.pay} Bayar ${fmt(MP_JAIL_FEE)}</button></div>`;
      else actions = `<div class="mp-wait">${st.phase === 'buy' ? `${esc(seatName(ctx, st.turn))} menimbang beli ${tl.n}…` : st.phase === 'jail' ? `${esc(seatName(ctx, st.turn))} di penjara…` : `Giliran ${esc(seatName(ctx, st.turn))}…`}</div>`;
    } else if (ctx.anim) actions = '<div class="mp-wait">…</div>';
    const card = A.card ? `<div class="mp-cardpop"><div class="mp-flip ${A.cardOpen ? 'open' : ''}"><div class="mp-cf back ${A.card.t}">${MP_ICON[A.card.t]}<b>${A.card.t === 'dana' ? 'DANA UMUM' : 'KESEMPATAN'}</b></div><div class="mp-cf front ${A.card.t}"><small>${A.card.t === 'dana' ? 'Dana Umum' : 'Kesempatan'}</small><b>${MP_CARD[A.card.t][A.card.i].x}</b></div></div></div>` : '';
    const flash = A.flash ? `<div class="mp-flash">${MP_UI[A.flash[0]] || ''}<span>${A.flash[1]}</span></div>` : '';
    box.innerHTML = `<div class="mp-screen">
      <div class="mp-topbar"><div class="mp-chips">${chips}</div><div class="mp-btns"><button type="button" class="mp-view" id="mpView" aria-label="Ganti sudut pandang">${top ? MP_UI.top : MP_UI.side}<span>${top ? 'Atas' : 'Samping'}</span></button><button type="button" class="mp-view ${mpNames ? 'on' : ''}" id="mpNames" aria-label="Nama di atas bidak">${MP_UI.tag}<span>Nama</span></button></div></div>
      <div class="mp-status">${status || (st.winner === null ? `Putaran ${st.round}` : '')}</div>
      <div class="mp-stage ${top ? 'top' : 'side'} ${M3 ? 'gl' : ''}" id="mpStage">${M3 ? '<div class="mp-gl" id="mpGl"></div>' : `<div class="mp-board" id="mpBoard">${cells}<div class="mp-center"><div class="mp-logo">MONOPOLI<span>Nusantara</span></div><div class="mp-dice">${dieHtml('mpD1')}${dieHtml('mpD2')}</div></div>${tokens}</div>`}${card}${flash}</div>
      <div class="mp-bottom"><div class="mp-tile" style="--g:${tl.g ? MP_GRP[tl.g] : '#8E8E93'}"><span class="mp-tile-lm">${tl.t === 'kota' ? `<img src="mp/${tl.n}.jpg" alt="${tl.n}">` : tileIcon(tl, curPos)}</span><div class="mp-tile-t"><div class="mp-tile-n">${tl.n}</div><div class="mp-tile-d">${det}</div></div></div>
        <div class="mp-act">${actions}<div class="mp-hint" id="mpHint"></div></div></div>
      ${st.winner !== null ? H.resultHtml(ctx, st.winner, st.reason) : ''}
      ${mpAsetFor !== null && mpAsetFor < st.n ? `<div class="mpa-wrap" id="mpAset">${asetHtml(st, ctx, mpAsetFor)}</div>` : ''}</div>`;
    // ukuran papan pas 1 layar
    const fit = () => {
      const stage = $('mpStage'), board = $('mpBoard'); if (!stage || !board) return;
      const w = stage.clientWidth, h = stage.clientHeight;
      const size = Math.max(200, Math.min(w, top ? h : h * 1.1));
      board.style.width = board.style.height = size + 'px';
      board.style.setProperty('--u', size / 7 + 'px');
    };
    const d = A.dice || st.dice;
    if (M3) {
      M3.mount($('mpGl'));
      const fl = A.flash && (A.flash[0] === 'coin' || A.flash[0] === 'pay') && st.last ? { s: A.flash[0] === 'pay' && st.last.rent ? st.last.rent.to : st.last.s } : null;
      const focus = A.hop !== undefined ? A.hop : (ctx.anim && st.last ? st.last.s : st.turn);
      M3.update({ focus, names: mpNames ? Array.from({ length: st.n }, (_, s) => s === me && !ctx.spectator ? 'Kamu' : seatName(ctx, s)) : null, pos, out: st.out, own: st.own, turn: st.turn, hi: A.hi !== undefined ? A.hi : pos[st.turn], rolling: !!A.rolling, dice: d, view: mpView, burst: fl, burstKey: fl ? st.v + A.flash[1] : 0 });
    } else { fit(); requestAnimationFrame(fit); }
    if (!M3) { dieShow('mpD1', d[0], false); dieShow('mpD2', d[1], false); }
    if (!M3 && A.rolling) { dieShow('mpD1', d[0], true); dieShow('mpD2', d[1], true); }
    box.querySelectorAll('.mp-chip[data-s], .mp-tok[data-s]').forEach(el => el.onclick = () => bukaAset(+el.dataset.s));
    if ($('mpAset')) { $('mpAset').onclick = e => { if (e.target.id === 'mpAset' || e.target.closest('#mpAsetX')) { mpAsetFor = null; SFX.tap(); renderMono(...mpLast); } }; }
    $('mpNames').onclick = () => { mpNames = !mpNames; try { localStorage.setItem('tt_mp_names', mpNames ? '1' : '0'); } catch (e) { } SFX.tap(); if (mpLast) renderMono(...mpLast); };
    $('mpView').onclick = () => { mpView = top ? 'side' : 'top'; try { localStorage.setItem('tt_mp_view', mpView); } catch (e) { } SFX.tap(); if (mpLast) renderMono(...mpLast); };
    if (!myTurn) return;
    const go = mv => { SFX.unlock(); SFX.tap(); clearInterval(H.autoTick); ctx.act(mv); };
    if ($('mpRoll')) $('mpRoll').onclick = () => go({ roll: true });
    if ($('mpBuy')) $('mpBuy').onclick = () => go({ buy: true });
    if ($('mpSkip')) $('mpSkip').onclick = () => go({ skip: true });
    if ($('mpPay')) $('mpPay').onclick = () => go({ pay: true });
    if ($('mpWait')) $('mpWait').onclick = () => go({ wait: true });
    const until = st.deadline || now() + 12000;
    const hint = $('mpHint');
    const label = st.phase === 'roll' ? 'Dadu dilempar otomatis' : st.phase === 'buy' ? 'Otomatis dilewati' : 'Otomatis menunggu';
    const tick = () => { const left = Math.max(0, Math.ceil((until - now()) / 1000)); if (hint) hint.textContent = `${label} dalam ${left} detik`; };
    tick(); H.autoTick = setInterval(tick, 300);
    ctx.auto(() => ctx.act({ timeout: true }), Math.max(400, until - now()));
  }
  window.addEventListener('resize', () => { if (mpLast && mpLast[0].isConnected && document.getElementById('mpBoard') && !M3) renderMono(...mpLast); });
  async function animMono(prev, next, redraw) {
    const l = next.last;
    if (!prev || prev.gid !== next.gid || !l) { redraw(next); return; }
    const pos = prev.pos.slice(), cash = prev.cash.slice();
    if (l.dice) {
      redraw(next, { pos, cash, dice: l.dice, rolling: true, hi: pos[l.s] });
      SFX.dice(); await sleep(800); SFX.land();
      for (const p of l.path) {
        pos[l.s] = p;
        redraw(next, { pos, cash, dice: l.dice, hop: l.s, hi: p });
        SFX.step(); await sleep(230);
      }
      if (l.salary) { S.coin(); redraw(next, { pos, cash, dice: l.dice, hi: pos[l.s], flash: ['coin', `Lewat START +${fmt(MP_SALARY)}`] }); await sleep(900); }
    }
    if (l.card) {
      const A = { pos, cash, hi: pos[l.s], card: l.card, cardOpen: false };
      redraw(next, A); S.flip(); await sleep(550);
      A.cardOpen = true; redraw(next, A); S.magic(); await sleep(1900);
      if (l.jump) { pos[l.s] = l.jump.to; redraw(next, { pos, cash, hop: l.s, hi: l.jump.to }); SFX.step(); await sleep(500); }
    }
    if (l.rent) { S.cash(); redraw(next, { pos: next.pos, hi: next.pos[l.s], flash: ['pay', `Sewa ${fmt(l.rent.amt)}`] }); await sleep(1000); }
    if (l.tax) { S.cash(); redraw(next, { pos: next.pos, hi: next.pos[l.s], flash: ['pay', `Pajak ${fmt(l.tax)}`] }); await sleep(900); }
    if (l.buy !== undefined) { S.cash(); redraw(next, { pos: next.pos, hi: l.buy, flash: ['house', `${MP_TILES[l.buy].n} terbeli!`] }); await sleep(950); }
    if (l.jail) { S.jail(); redraw(next, { pos: next.pos, hi: MP_JAIL, flash: ['jail', 'Masuk penjara!'] }); await sleep(1100); }
    if (l.bankrupt !== undefined) { SFX.capture(); redraw(next, { flash: ['boom', 'Bangkrut!'] }); await sleep(1300); }
    redraw(next);
    if (next.winner !== null && next.winner !== undefined) SFX.win();
  }
  const iconMono = '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="#E9F7EF"/><rect x="6" y="6" width="36" height="8" rx="3" fill="#E53935"/><rect x="6" y="34" width="36" height="8" rx="3" fill="#1E5BD8"/><rect x="6" y="6" width="8" height="36" rx="3" fill="#FF9800"/><rect x="34" y="6" width="8" height="36" rx="3" fill="#29B6F6"/><path d="M19 30v-7l5-4 5 4v7z" fill="#2DB84D"/><rect x="22" y="25" width="4" height="5" fill="#fff"/></svg>';
  TTG.daftarGame('monopoli', {
    meta: {
      name: 'Monopoli', desc: 'Keliling Nusantara, beli kota', bg: 'linear-gradient(160deg,#34C77B,#12865A)', min: 2, max: 4, nNote: 'Lewat START dapat gaji. Berhenti di kota orang bayar sewa. Main sampai tinggal 1 pemain yang tidak bangkrut.',
      optHtml: () => `<details class="mp-kredit"><summary>Kredit foto landmark</summary><div id="mpKredit" class="card-sub">Memuat…</div></details>`,
      onLobby: () => {
        siap3D();
        fetch('mp/kredit.json').then(r => r.json()).then(k => {
          const el = $('mpKredit'); if (!el) return;
          el.innerHTML = 'Foto dari Wikimedia Commons:<br>' + Object.entries(k).map(([c, v]) => `${c}: <a href="${v.page}" target="_blank" rel="noopener">${esc(v.artist || 'Tanpa nama')}</a>, ${esc(v.lic)}`).join('<br>') + '<br>Foto dipotong & diperkecil.';
        }).catch(() => { const el = $('mpKredit'); if (el) el.textContent = 'Tidak bisa memuat kredit.'; });
      }
    },
    engine: Mono, render: renderMono, anim: animMono, icon: iconMono,
    css: `
    .gv-body.mp-mode{display:flex;flex-direction:column;overflow:hidden;padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 10px)}
    .mp-screen{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;gap:6px}
    .mp-topbar{display:flex;gap:8px;align-items:stretch;flex:none}
    .mp-chips{flex:1;min-width:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .mp-chip{display:flex;align-items:center;gap:6px;background:#fff;border-radius:12px;padding:5px 8px;box-shadow:var(--shadow);min-width:0}
    .mp-chip.turn{box-shadow:inset 0 0 0 2.5px var(--c),var(--shadow)}
    .mp-chip.out{opacity:.45;filter:grayscale(1)}
    .mp-chip-pawn svg{width:22px;height:22px;display:block}
    .mp-chip-t{min-width:0;line-height:1.15}.mp-chip-t b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-chip-t small{font-size:12.5px;color:var(--text2);font-weight:700}
    .mp-btns{flex:none;display:flex;flex-direction:column;gap:6px}
    .mp-btns .mp-view{flex:1}
    .mp-view.on{background:#12865A;color:#fff}
    .mp-chip{cursor:pointer}
    .mp-tname{position:absolute;left:0;top:0;transform:translate(-50%,-260%);font-style:normal;white-space:nowrap;font-size:10px;font-weight:800;background:#fff;color:#1C1C1E;border:2px solid var(--c);border-radius:999px;padding:1px 6px;pointer-events:none}
    .mpa-wrap{position:absolute;inset:-8px -10px;z-index:20;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;animation:gxfade .2s}
    @keyframes gxfade{from{opacity:0}}
    .mpa-card{width:100%;max-height:88%;overflow-y:auto;background:#F2F2F7;border-radius:24px 24px 0 0;padding:16px 14px calc(env(safe-area-inset-bottom,0px) + 16px);animation:gxup .3s cubic-bezier(.2,1,.3,1)}
    .mpa-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .mpa-head .mp-chip-pawn svg{width:36px;height:36px}
    .mpa-head>div{flex:1;min-width:0}
    .mpa-name{font-size:21px;font-weight:900}.mpa-sub{font-size:15px;color:var(--text2);font-weight:700}
    .mpa-x{width:40px;height:40px;border-radius:50%;background:#E5E5EA;color:#3A3A3C;display:flex;align-items:center;justify-content:center}.mpa-x svg{width:18px;height:18px}
    .mpa-sum{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mpa-sum>div{background:#fff;border-radius:14px;padding:10px 12px;box-shadow:var(--shadow)}
    .mpa-sum span{display:block;font-size:12.5px;color:var(--text2);font-weight:700}.mpa-sum b{font-size:17px}
    .mpa-stat{margin:12px 2px 4px;font-size:16px;font-weight:800;text-align:center}
    .mpa-ok{color:#1E8E3E}.mpa-no{color:#C25B00}
    .mpa-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
    .mpa-row{display:flex;gap:10px;background:#fff;border-radius:16px;padding:10px;box-shadow:var(--shadow);border-left:6px solid var(--g)}
    .mpa-row img{width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none}
    .mpa-r{min-width:0;flex:1}
    .mpa-n{font-size:17px;font-weight:900}
    .mpa-x2{font-size:11px;background:#FFE7C2;color:#8A4B00;border-radius:999px;padding:2px 7px;vertical-align:2px}
    .mpa-g{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;font-size:13.5px;margin:4px 0}
    .mpa-g span{color:var(--text2)}.mpa-g b{text-align:right}
    .mpa-r .mpa-ok,.mpa-r .mpa-no{font-size:13px;font-weight:800}
    .mpa-empty{text-align:center;color:var(--text2);padding:22px;font-size:16px}
    .mp-view{flex:none;width:62px;border-radius:12px;background:#fff;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#12865A;font-size:11px;font-weight:800}
    .mp-view svg{width:24px;height:24px}
    .mp-status{flex:none;text-align:center;font-size:14px;font-weight:700;color:#1C1C1E;min-height:19px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .mp-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;perspective:1000px}
    .mp-board{position:relative;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(7,1fr);gap:2px;background:linear-gradient(160deg,#CFEFD9,#A9DFBF);border-radius:16px;padding:4px;box-shadow:0 6px 0 #6BB98A,0 16px 26px -8px rgba(0,60,30,.4),inset 0 0 0 2px rgba(255,255,255,.6);transition:transform .6s cubic-bezier(.2,.9,.3,1)}
    .mp-stage.side .mp-board{transform:rotateX(34deg) scale(.95);transform-origin:50% 50%;box-shadow:0 10px 0 #6BB98A,0 34px 34px -12px rgba(0,60,30,.5),inset 0 0 0 2px rgba(255,255,255,.6)}
    .mp-cell{position:relative;background:#FFFDF7;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;overflow:hidden;box-shadow:0 1.5px 0 rgba(0,0,0,.12);padding:calc(var(--u,50px)*.1) 1px 1px;min-width:0}
    .mp-cell.corner{background:linear-gradient(160deg,#FFF4D6,#FFE1A6);justify-content:center;padding-top:1px}
    .mp-cell.t-kesempatan{background:#FFF1E0}.mp-cell.t-dana{background:#FCE8F3}.mp-cell.t-pajak{background:#EEF0F4}
    .mp-cell.hi{box-shadow:0 0 0 2.5px #FFD60A,0 3px 10px rgba(255,180,0,.6);z-index:2;animation:mphi 1s ease-in-out infinite}
    @keyframes mphi{50%{box-shadow:0 0 0 2.5px #FF9F0A,0 3px 14px rgba(255,140,0,.85)}}
    .mp-band{position:absolute;left:0;right:0;top:0;height:calc(var(--u,50px)*.09)}
    .mp-lm{display:block;width:calc(var(--u,50px)*.56);height:calc(var(--u,50px)*.5);flex:none}
    .mp-cell.corner .mp-lm{width:calc(var(--u,50px)*.62);height:calc(var(--u,50px)*.58)}
    .mp-lm svg{width:100%;height:100%;display:block}
    .mp-nm{font-size:calc(var(--u,50px)*.175);font-weight:800;line-height:1.02;color:#1C1C1E;word-break:normal;overflow-wrap:normal;hyphens:manual;-webkit-hyphens:manual;max-width:100%}
    .mp-pr{font-size:calc(var(--u,50px)*.15);color:#6E6E73;font-weight:800;line-height:1}
    .mp-own{position:absolute;left:2px;right:2px;bottom:2px;height:calc(var(--u,50px)*.09);border-radius:3px;box-shadow:0 1px 2px rgba(0,0,0,.3)}
    .mp-center{grid-row:2/7;grid-column:2/7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u,50px)*.35);background:radial-gradient(circle at 50% 40%,#E9FBF0,#C3EBD2);border-radius:12px}
    .mp-logo{font-weight:900;font-size:calc(var(--u,50px)*.5);color:#C62828;text-align:center;line-height:1;letter-spacing:.04em;transform:rotate(-8deg);text-shadow:0 2px 0 #fff,0 4px 0 rgba(0,0,0,.12)}
    .mp-logo span{display:block;font-size:.6em;color:#12865A;letter-spacing:.02em;margin-top:2px}
    .mp-dice{display:flex;gap:calc(var(--u,50px)*.3)}
    .mp-die{--ds:calc(var(--u,50px)*.8);width:var(--ds);height:var(--ds);perspective:400px}
    .mp-cube{position:relative;width:100%;height:100%;transform-style:preserve-3d}
    .mp-f{position:absolute;inset:0;background:linear-gradient(145deg,#fff,#ECECEC);border-radius:20%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:14%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
    .mp-f i{width:62%;height:62%;margin:auto;border-radius:50%}
    .mp-f i.on{background:radial-gradient(circle at 35% 35%,#555,#111)}
    .mp-f.f1 i.on{background:radial-gradient(circle at 35% 35%,#FF6B6B,#C62828)}
    .mp-f.f1{transform:translateZ(calc(var(--ds)/2))}.mp-f.f6{transform:rotateY(180deg) translateZ(calc(var(--ds)/2))}
    .mp-f.f2{transform:rotateY(90deg) translateZ(calc(var(--ds)/2))}.mp-f.f5{transform:rotateY(-90deg) translateZ(calc(var(--ds)/2))}
    .mp-f.f3{transform:rotateX(90deg) translateZ(calc(var(--ds)/2))}.mp-f.f4{transform:rotateX(-90deg) translateZ(calc(var(--ds)/2))}
    .mp-tok{position:absolute;width:0;height:0;z-index:5;transition:left .2s ease,top .2s ease}
    .mp-tok svg{position:absolute;left:0;top:0;display:block}
    .mp-tok .mp-pin{width:calc(var(--u,50px)*.46);height:calc(var(--u,50px)*.68);transform:translate(-50%,-90%) rotateX(-34deg);transform-origin:50% 100%}
    .mp-tok .mp-disc{width:calc(var(--u,50px)*.48);height:calc(var(--u,50px)*.48);transform:translate(-50%,-50%)}
    .mp-tok.hop .mp-pin{animation:mphop .23s ease-out}
    .mp-tok.hop .mp-disc{animation:mphopt .23s ease-out}
    .mp-tok.cur svg{filter:drop-shadow(0 0 5px rgba(255,214,10,.95))}
    @keyframes mphop{50%{transform:translate(-50%,-150%) rotateX(-34deg)}}
    @keyframes mphopt{50%{transform:translate(-50%,-50%) scale(1.35)}}
    .mp-bottom{flex:none;display:flex;flex-direction:column;gap:8px}
    .mp-tile{display:flex;align-items:center;gap:10px;background:#fff;border-radius:16px;padding:8px 12px;box-shadow:var(--shadow);border-left:6px solid var(--g)}
    .mp-tile-lm{width:56px;height:56px;flex:none;border-radius:12px;overflow:hidden}.mp-tile-lm svg,.mp-tile-lm img{width:100%;height:100%;object-fit:cover;display:block}
    .mp-stage.gl{background:radial-gradient(ellipse at 50% 30%,#E6F7FF,#BFE6F5 55%,#9AD3C0);border-radius:20px;overflow:hidden;perspective:none}
    .mp-gl{position:absolute;inset:0}.mp-gl canvas{display:block;width:100%;height:100%;touch-action:none}
    .mp-kredit{margin-top:12px;font-size:13px}.mp-kredit summary{color:var(--text2);font-weight:700;cursor:pointer}.mp-kredit a{color:var(--accent)}
    .mp-tile-t{min-width:0;line-height:1.3}.mp-tile-n{font-size:18px;font-weight:900}.mp-tile-d{font-size:14px;color:#3A3A3C}
    .mp-act{min-height:58px}
    .mp-btn{width:100%;min-height:56px;font-size:19px;display:flex;align-items:center;justify-content:center;gap:8px}
    .mp-btn svg{width:26px;height:26px}
    .mp-two{display:flex;gap:10px}.mp-two .mp-btn{flex:1;font-size:17px}
    .mp-hint{text-align:center;color:var(--text2);font-size:12.5px;margin-top:4px;min-height:15px}
    .mp-wait{text-align:center;color:var(--text2);font-size:17px;font-weight:700;padding:14px 4px}
    .mp-screen .gp-result{position:absolute;left:0;right:0;bottom:0;z-index:12}
    .mp-cardpop{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9;perspective:900px}
    .mp-flip{width:min(74%,300px);aspect-ratio:1.45;position:relative;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.2,.9,.3,1);animation:mpcardin .45s cubic-bezier(.2,1.3,.4,1)}
    .mp-flip.open{transform:rotateY(180deg)}
    @keyframes mpcardin{from{transform:translateY(60px) scale(.4) rotate(-10deg);opacity:0}}
    .mp-cf{position:absolute;inset:0;border-radius:18px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.35)}
    .mp-cf svg{width:64px;height:64px}
    .mp-cf b{font-size:18px;letter-spacing:.06em}
    .mp-cf.back.kesempatan{background:linear-gradient(150deg,#FFB340,#EA6A0A);color:#fff}
    .mp-cf.back.dana{background:linear-gradient(150deg,#FF7EB3,#D63384);color:#fff}
    .mp-cf.front{background:#FFFDF6;transform:rotateY(180deg);border:4px solid #EA6A0A;color:#1C1C1E}
    .mp-cf.front.dana{border-color:#D63384}
    .mp-cf.front small{font-size:13px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.08em}
    .mp-cf.front b{font-size:19px;letter-spacing:0;line-height:1.3}
    .mp-flash{position:absolute;left:50%;top:46%;z-index:10;display:flex;align-items:center;gap:10px;background:rgba(28,28,30,.9);color:#fff;font-weight:900;font-size:20px;padding:12px 18px;border-radius:18px;white-space:nowrap;animation:mpflash 1s cubic-bezier(.2,1.3,.4,1) both}
    .mp-flash svg{width:30px;height:30px;flex:none}
    @keyframes mpflash{0%{transform:translate(-50%,-20%) scale(.5);opacity:0}25%{transform:translate(-50%,-50%) scale(1.05);opacity:1}100%{transform:translate(-50%,-60%) scale(1);opacity:1}}
    `
  });
})();
