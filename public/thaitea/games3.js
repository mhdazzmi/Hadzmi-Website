/* =========================================================
   Thai Tea — Game: LARI PASAR (3D, sendiri / berdua / bertiga)
   Tampilan 3D & simulasi ada di lari3d.js (dimuat saat dibutuhkan).
   Meja online, bot, jeda, Live & podium memakai sistem games.js (TTG.daftarGame).
   Posisi pelari dikirim realtime ke thaitea/games/lari/{meja} (terpisah dari data meja
   supaya daftar meja tidak ikut ramai).
   ========================================================= */
(function () {
  if (!window.TTG || !TTG.daftarGame) return;
  const H = TTG._h;
  const { SFX, $, rnd, clone, arr } = H;
  const liveRoot = db.ref('thaitea/games/lari');

  let L3 = null, loading = null;
  function muat() {
    if (L3) return Promise.resolve(L3);
    if (!loading) loading = import('./lari3d.js').then(m => (L3 = m)).catch(e => { loading = null; throw e; });
    return loading;
  }
  const bisa3D = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };
  const myChar = () => (typeof lsGet === 'function' && lsGet('tt_lari_char')) || 'oren';

  /* ---------- aturan game (hasil akhir ditulis 1 HP saja: si "driver") ---------- */
  const Lari = {
    init(n, opt) { return { gid: Date.now() + '' + rnd(1000), v: 1, n, seed: 1 + rnd(2e9), startAt: Date.now() + 4500, winner: null, done: null, opt: opt || null }; },
    norm(st) {
      st.n = Number(st.n) || 1;
      if (st.winner === undefined) st.winner = null;
      st.done = st.done ? arr(st.done).map(x => ({ d: Number((x || {}).d) || 0, k: Number((x || {}).k) || 0 })) : null;
      return st;
    },
    apply(st, s, mv) {
      st = clone(st);
      if (!mv || !mv.res || (st.winner !== null && st.winner !== undefined)) return st;
      st.done = mv.res;
      let w = 0;
      mv.res.forEach((r, i) => { const b = mv.res[w]; if (r.d > b.d || (r.d === b.d && r.k > b.k)) w = i; });
      st.winner = w; st.v++;
      return st;
    },
    bot() { return {}; },
    rank(st) { const D = st.done || []; return Array.from({ length: st.n }, (_, i) => i).sort((a, b) => ((D[b] || {}).d || 0) - ((D[a] || {}).d || 0) || ((D[b] || {}).k || 0) - ((D[a] || {}).k || 0)); },
    // main sendiri: tampilkan skor & rekor, bukan podium
    winHtml(st, ctx) {
      if (st.n > 1 || ctx.spectator) return null;
      const r = (st.done || [])[0] || { d: 0, k: 0 }, m = Math.floor(r.d / 2);
      let best = 0; try { best = Number(lsGet('tt_lari_best')) || 0; } catch (e) { }
      const rekor = m > best && st.gid !== lastBestGid;
      if (rekor) { lastBestGid = st.gid; try { lsSet('tt_lari_best', String(m)); } catch (e) { } }
      return { iWin: rekor, html: `<div class="pd-title">${rekor ? 'Rekor Baru! 🏆' : 'Tertabrak!'}</div><div class="pd-sub">Lari Pasar</div>
        <div class="lr-score">${m} m</div><div class="pd-sub">${r.k} koin dikumpulkan</div><div class="lr-best">Rekor terbaikmu: <b>${Math.max(m, best)} m</b></div>` };
    },
    rankVal(st, s) { const r = (st.done || [])[s]; return r ? `${Math.floor(r.d / 2)} m · ${r.k} koin` : ''; },
  };

  let lastBestGid = null;
  /* ---------- karakter tiap kursi ---------- */
  function hashStr(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
  function susunPelari(m, st, ctx, live) {
    const seats = ctx.seats || [];
    const dipakai = new Set();
    const out = [];
    for (let s = 0; s < st.n; s++) {
      const x = seats[s] || { name: 'Pemain ' + (s + 1), bot: true };
      let id = null;
      if (!x.bot) id = s === ctx.mySeat ? myChar() : ((live[s] || {}).c || null);
      else { const c = m.CHARS.find(c => c.name === x.name); if (c && !dipakai.has(c.id)) id = c.id; }
      if (!id) { const sisa = m.CHARS.filter(c => !dipakai.has(c.id)); id = (sisa.length ? sisa : m.CHARS)[hashStr(x.key || x.name) % (sisa.length || m.CHARS.length)].id; }
      dipakai.add(id);
      out.push({ seat: s, label: x.name || 'Pemain', char: m.charById(id), bot: !!(x.bot || x.away) });
    }
    return out;
  }

  /* ---------- tampilan ---------- */
  let R = null;     // { key, root, ctx, st, race, ref, timer }
  function berhenti() {
    if (!R) return;
    clearInterval(R.timer);
    if (R.ref) R.ref.off();
    if (R.race && !R.race.dead) R.race.destroy();
    R = null;
  }
  function render(box, st, ctx) {
    box.classList.add('lr-mode');
    const key = (ctx.roomId || 'lokal') + ':' + st.gid;
    if (R && R.key === key && R.root.isConnected && box.contains(R.root)) { R.ctx = ctx; R.st = st; return; }
    berhenti();
    box.innerHTML = '';
    const root = document.createElement('div'); root.className = 'lr-root';
    root.innerHTML = '<div class="lr-loading"><span class="rq-spin"></span> Memuat jalan pasar…</div>';
    box.appendChild(root);
    const me = R = { key, root, ctx, st, race: null, ref: null, timer: 0, recv: {}, sent: false };
    if (!bisa3D()) { root.innerHTML = '<div class="lr-loading">HP ini tidak mendukung tampilan 3D.</div>'; return; }
    muat().then(m => mulai(m, me)).catch(() => { if (R === me) root.innerHTML = '<div class="lr-loading">Gagal memuat game. Cek internet lalu buka lagi.</div>'; });
  }
  async function mulai(m, me) {
    const { st, ctx } = me;
    let live = {};
    if (ctx.roomId) {
      me.ref = liveRoot.child(ctx.roomId);
      try {
        const v = (await me.ref.once('value')).val();
        if (v && v.gid === st.gid) live = v.s || {};
        else if (H.isDriver()) await me.ref.set({ gid: st.gid, s: {} });
      } catch (e) { }
      bersihkanSisa();
    }
    if (R !== me) return;
    const pelari = susunPelari(m, st, ctx, live);
    me.race = m.createRace({
      root: me.root, seed: st.seed, startAt: st.startAt || Date.now(),
      me: ctx.spectator ? null : ctx.mySeat,
      runners: pelari, lanes: st.n === 1 ? [1] : st.n === 2 ? [0, 2] : [1, 0, 2],
      bots: new Set(pelari.filter(p => p.bot).map(p => p.seat)),
      driver: () => H.isDriver(), paused: () => H.isPaused(),
      sfx: SFX, myChar: myChar(), restore: live,
      send: (seat, data) => { if (me.ref) me.ref.child('s/' + seat).update(data).catch(() => { }); },
      fin: () => { },
    });
    me.root.querySelector('.lr-loading') && me.root.querySelector('.lr-loading').remove();
    if (me.ref) me.ref.on('value', snap => {
      const v = snap.val();
      if (!v || v.gid !== st.gid || !me.race) return;
      const now = performance.now();
      Object.entries(v.s || {}).forEach(([k, x]) => { const sig = JSON.stringify(x); if ((me.recv[k] || {}).sig !== sig) me.recv[k] = { sig, at: now }; });
      me.race.setLive(v.s || {});
    });
    me.t0 = performance.now();
    // HP "driver" menutup balapan kalau semua pelari sudah selesai
    me.timer = setInterval(() => periksaSelesai(me), 600);
  }
  function periksaSelesai(me) {
    if (R !== me || !me.race || me.sent) return;
    const st = me.st;
    if (st.winner !== null && st.winner !== undefined) return;
    if (!H.isDriver() || H.isPaused()) return;
    const now = performance.now();
    const hasil = me.race.results();
    const selesai = hasil.every(r => {
      if (r.fin) return true;
      const seat = (me.ctx.seats || [])[r.seat];
      if (!seat || seat.bot || seat.away || r.seat === me.ctx.mySeat) return false;
      const rc = me.recv[r.seat];
      return now - (rc ? rc.at : me.t0) > 12000 && now - me.t0 > 15000;     // orangnya terputus lama: anggap selesai
    });
    if (!selesai) return;
    me.sent = true;
    me.ctx.act({ res: hasil.map(r => ({ d: Math.round(r.d * 100) / 100, k: r.k })) });
  }
  // hapus data posisi meja yang sudah tidak ada (sekali per buka aplikasi)
  let sudahBersih = false;
  function bersihkanSisa() {
    if (sudahBersih) return; sudahBersih = true;
    Promise.all([liveRoot.once('value'), db.ref('thaitea/games/rooms').once('value')]).then(([a, b]) => {
      const rooms = b.val() || {};
      Object.keys(a.val() || {}).forEach(id => { if (!rooms[id]) liveRoot.child(id).remove(); });
    }).catch(() => { });
  }

  /* ---------- pilihan karakter di layar persiapan ---------- */
  function pilihanHtml() {
    const sel = myChar();
    const daftar = L3 ? L3.CHARS : [{ id: 'oren', name: 'Cello' }, { id: 'hitam', name: 'Itam Buruak' }, { id: 'abu', name: 'Celek' }, { id: 'kelinci', name: 'Momoy' }, { id: 'bapak', name: 'Alang' }, { id: 'ibu', name: 'Manis' }, { id: 'anak', name: 'Ujang' }];
    return `<span class="field-label" style="margin-top:12px">Pilih karakter</span><div class="lr-pick" id="lrPick">${daftar.map(c => `<button type="button" class="${c.id === sel ? 'on' : ''}" data-id="${c.id}"><span class="lr-th" data-th="${c.id}"></span><b>${esc(c.name)}</b></button>`).join('')}</div>`;
  }
  function isiGambar() {
    muat().then(m => {
      let th = null; try { th = m.thumbnails(); } catch (e) { }
      if (!th) return;
      document.querySelectorAll('#lrPick .lr-th').forEach(el => { const u = th[el.dataset.th]; if (u) el.style.backgroundImage = `url(${u})`; });
    }).catch(() => { });
  }
  function ikatPilihan() {
    document.querySelectorAll('#lrPick button').forEach(b => b.onclick = () => {
      SFX.tap(); try { lsSet('tt_lari_char', b.dataset.id); } catch (e) { }
      document.querySelectorAll('#lrPick button').forEach(x => x.classList.toggle('on', x === b));
    });
  }

  const icon = '<svg viewBox="0 0 48 48"><path d="M6 42 18 8h12l12 34z" fill="#8A8A90"/><path d="M23 12h2v5h-2zm0 9h2v6h-2zm0 11h2v8h-2z" fill="#fff"/><circle cx="24" cy="21" r="9" fill="#FF9A2E"/><path d="M16.5 15.5l1.5-6 4 4zM31.5 15.5l-1.5-6-4 4z" fill="#FF9A2E"/><circle cx="21" cy="21" r="1.6" fill="#2C1A0C"/><circle cx="27" cy="21" r="1.6" fill="#2C1A0C"/><path d="M22 25q2 1.6 4 0" stroke="#2C1A0C" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M4 26h7M3 31h9M5 36h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';

  TTG.daftarGame('lari', {
    meta: {
      name: 'Lari Pasar', desc: 'Lari 3D lewat pasar, hindari gerobak', bg: 'linear-gradient(160deg,#FFB547,#F0730F)', min: 1, max: 3,
      nList: [1, 2, 3], nDef: 2, nUnit: 'pemain',
      nNote: 'Ketuk kiri/kanan untuk pindah jalur, tengah untuk lompat. Gerobak & motor harus dihindari, peti/karung/ban bisa dilompati. Yang larinya paling jauh menang.',
      optHtml: pilihanHtml,
      bindOpt: ikatPilihan,
      readOpt: () => null,
      onLobby: isiGambar,
    },
    engine: Lari, render, anim: async (p, n, redraw) => redraw(n), icon,
    css: `
    .gv-body.lr-mode{padding:0;max-width:none;overflow:hidden;display:flex;flex-direction:column}
    .lr-root{position:relative;flex:1;min-height:0;overflow:hidden;background:#FFC58F;touch-action:none;-webkit-user-select:none;user-select:none}
    .lr-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}
    .lr-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:800;color:#8A4300;padding:20px;text-align:center}
    .lr-hud{position:absolute;top:10px;left:12px;right:12px;display:flex;justify-content:space-between;pointer-events:none;z-index:2}
    .lr-chip{background:rgba(255,255,255,.92);border-radius:16px;padding:6px 12px;font-weight:800;font-size:17px;color:#1C1C1E;box-shadow:0 2px 8px rgba(0,0,0,.1);display:flex;align-items:center;gap:6px}
    .lr-coin{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FFE98A,#E3A500);display:inline-block}
    .lr-race{position:absolute;top:56px;left:12px;right:12px;z-index:2;pointer-events:none;background:rgba(255,255,255,.92);border-radius:14px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,.1);font-size:14px;font-weight:700;display:flex;flex-direction:column;gap:4px}
    .lr-row{display:flex;align-items:center;gap:8px}
    .lr-row span:first-child{width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lr-trk{flex:1;height:8px;border-radius:4px;background:#EEE;position:relative;overflow:hidden}
    .lr-trk b{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .2s linear}
    .lr-row small{width:62px;text-align:right;color:#6E6E73}
    .lr-msg{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);z-index:3;background:rgba(28,28,30,.82);color:#fff;padding:10px 18px;border-radius:16px;font-weight:800;font-size:17px;pointer-events:none;white-space:nowrap}
    .lr-count{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:3;font-size:72px;font-weight:900;color:#fff;text-shadow:0 4px 0 #EA6A0A,0 8px 18px rgba(0,0,0,.25);pointer-events:none;animation:gpop .4s}
    .lr-help{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:2;display:flex;justify-content:space-between;gap:6px;pointer-events:none}
    .lr-help span{background:rgba(255,255,255,.88);border-radius:12px;padding:6px 10px;font-size:13px;font-weight:800;color:#8A4300}
    .lr-root .hidden{display:none!important}
    .lr-score{font-size:64px;font-weight:900;color:var(--accent);margin:18px 0 0;letter-spacing:-.02em}
    .lr-best{display:inline-block;margin-top:10px;background:#fff;border-radius:14px;padding:8px 14px;font-weight:700;box-shadow:var(--shadow)}
    .lr-pick{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
    .lr-pick button{background:#F2F2F7;border-radius:14px;padding:6px 2px 8px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0}
    .lr-pick button.on{background:#FFF3E6;box-shadow:inset 0 0 0 2.5px var(--accent)}
    .lr-pick b{font-size:12px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lr-th{width:56px;height:70px;background:center/contain no-repeat}
    `
  });
})();
