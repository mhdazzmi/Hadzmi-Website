/* =========================================================
   Thai Tea — Game tambahan: Sambung Kata, Monopoli, Werewolf
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
     1. SAMBUNG KATA
     ===================================================================== */
  const KAMUS = { set: null, umum: null, all: null, loading: null };
  function muatKamus() {
    if (KAMUS.set) return Promise.resolve();
    if (!KAMUS.loading) KAMUS.loading = Promise.all([fetch('kata.txt').then(r => r.text()), fetch('kata-umum.txt').then(r => r.text())])
      .then(([a, b]) => { KAMUS.all = a.split('\n').map(x => x.trim()).filter(Boolean); KAMUS.set = new Set(KAMUS.all); KAMUS.umum = b.split('\n').map(x => x.trim()).filter(Boolean); })
      .catch(e => { KAMUS.loading = null; throw e; });
    return KAMUS.loading;
  }
  const VOK = 'aeiou';
  // suku kata terakhir (aturan sederhana bahasa Indonesia): makan→kan, bunga→nga, pantai→tai, main→in
  function sukuAkhir(w) {
    let i = w.length - 1;
    while (i >= 0 && !VOK.includes(w[i])) i--;
    if (i < 0) return w.slice(-2);
    let j = i;
    if (j > 0 && VOK.includes(w[j - 1])) {
      const pair = w[j - 1] + w[j];
      if (['ai', 'au', 'oi', 'ei'].includes(pair) && i === w.length - 1) j--;
      else return w.slice(j);
    }
    const k = j - 1;
    if (k < 0) return w.slice(j);
    if (k >= 1 && ['ng', 'ny', 'kh', 'sy'].includes(w.slice(k - 1, k + 1))) return w.slice(k - 1);
    if (VOK.includes(w[k])) return w.slice(j);
    return w.slice(k);
  }
  const KATA_TIME = 30000;
  function adaLanjutan(pre, used) { return KAMUS.all.some(w => w.length > pre.length && w.startsWith(pre) && !(used && used[w])); }
  function syaratDari(w, mode, used) {
    if (mode === 'suku') { const s = sukuAkhir(w); if (s.length < w.length && adaLanjutan(s, used)) return { need: s, mudah: false }; }
    const h = w.slice(-1);
    return { need: h, mudah: mode === 'suku' };
  }
  function saran(need, used, k) {
    const pick = list => shuffle(list.filter(w => w.startsWith(need) && w.length > need.length && !used[w]));
    let a = pick(KAMUS.umum);
    if (a.length < k) a = a.concat(pick(KAMUS.all.filter(w => w.length >= 4 && w.length <= 9)).slice(0, k - a.length));
    return a.slice(0, k);
  }
  const Kata = {
    init(n, opt) {
      const mode = (opt && opt.mode) || 'huruf';
      const rounds = (opt && opt.rounds) || 10;
      let start = 'makan';
      if (KAMUS.umum) { const c = shuffle(KAMUS.umum.filter(w => w.length >= 4 && w.length <= 7)); start = c.find(w => mode !== 'suku' || adaLanjutan(sukuAkhir(w))) || start; }
      const sy = KAMUS.all ? syaratDari(start, mode, {}) : { need: start.slice(-1), mudah: false };
      return { n, mode, rounds, turn: 0, t: 0, words: [{ w: start, s: -1, pts: 0 }], used: { [start]: 1 }, need: sy.need, mudah: sy.mudah, scores: Array(n).fill(0), deadline: now() + KATA_TIME + 2500, last: null, winner: null, v: 1, gid: gid() };
    },
    norm(st) { st.words = arr(st.words); st.scores = arr(st.scores).map(Number); st.used = st.used || {}; if (st.winner === undefined) st.winner = null; return st; },
    cek(st, w) {
      w = String(w || '').toLowerCase().replace(/[^a-z]/g, '');
      if (w.length < 2) return 'Kata terlalu pendek';
      if (!w.startsWith(st.need)) return `Kata harus diawali "${st.need.toUpperCase()}"`;
      if (w === st.need) return 'Tambahkan huruf lagi';
      if (st.used[w]) return 'Kata ini sudah dipakai';
      if (KAMUS.set && !KAMUS.set.has(w)) return 'Kata tidak ada di kamus';
      return null;
    },
    apply(st, s, mv) {
      st = this.norm(clone(st));
      if (st.winner !== null) return st;
      const actor = st.turn;
      if (mv.timeout) { if (s !== actor && s !== -1) return st; st.last = { s: actor, timeout: true }; }
      else {
        if (s !== actor) return st;
        const w = String(mv.w || '').toLowerCase().replace(/[^a-z]/g, '');
        if (this.cek(st, w)) return st;
        let pts = 10 + Math.max(0, w.length - 4) * 2;
        if (mv.help) pts = Math.ceil(pts / 2);
        st.scores[actor] += pts;
        st.used[w] = 1;
        st.words.push({ w, s: actor, pts, help: !!mv.help });
        if (st.words.length > 40) st.words = st.words.slice(-40);
        const sy = syaratDari(w, st.mode, st.used);
        st.need = sy.need; st.mudah = sy.mudah;
        st.last = { s: actor, w, pts, help: !!mv.help };
      }
      st.t++;
      if (st.t >= st.rounds * st.n) {
        let best = 0; st.scores.forEach((x, i) => { if (x > st.scores[best]) best = i; });
        st.winner = best; st.reason = `Skor ${st.scores[best]} poin`;
      } else { st.turn = (st.turn + 1) % st.n; st.deadline = now() + KATA_TIME; }
      st.v++;
      return st;
    },
    bot(st, s) {
      if (Math.random() < .1) return { timeout: true };     // kadang bot "lupa" biar tidak selalu menang
      const c = saran(st.need, st.used, 6);
      if (!c.length) return { timeout: true };
      const easy = c.filter(w => w.length <= 7);
      return { w: (easy.length && Math.random() < .7 ? easy : c)[0] };
    },
    botDelay() { return 2200 + rnd(1800); },
    pending(st, seats) {
      if (st.winner !== null) return null;
      const seat = seats[st.turn];
      if (seat && !seat.bot && st.deadline) return { mv: { timeout: true }, ms: Math.max(1500, st.deadline - now() + 5000) };
      return null;
    },
    rank(st) { return Array.from({ length: st.n }, (_, i) => i).sort((a, b) => st.scores[b] - st.scores[a]); },
    rankVal(st, s) { return `${st.scores[s]} poin`; }
  };
  const tiles = (w, hiFrom, cls) => w.toUpperCase().split('').map((c, i) => `<span class="sk-tile ${i >= hiFrom ? 'hi' : ''} ${cls || ''}" style="--i:${i}">${c}</span>`).join('');
  function renderKata(box, st, ctx) {
    if (!KAMUS.set) {
      box.innerHTML = '<div class="sk-load"><div class="sk-spin"></div>Menyiapkan kamus…</div>';
      muatKamus().then(() => { if (box.isConnected) renderKata(box, st, ctx); }).catch(() => { box.innerHTML = '<div class="sk-load">Kamus gagal dimuat. Periksa internet lalu buka lagi.</div>'; });
      return;
    }
    st = Kata.norm(clone(st));
    const me = ctx.mySeat;
    const myTurn = ctx.canAct && st.turn === me && st.winner === null && !ctx.spectator;
    const lastW = st.words[st.words.length - 1];
    const prevWord = lastW.w;
    const hiFrom = prevWord.length - st.need.length;
    const chips = Array.from({ length: st.n }, (_, s) => `<div class="gp-chip ${st.turn === s && st.winner === null ? 'turn' : ''}">${seatAva(ctx, s)}<div><b>${esc(seatName(ctx, s))}</b><small>${st.scores[s]} poin</small></div></div>`).join('');
    const round = Math.min(st.rounds, Math.floor(st.t / st.n) + 1);
    const pop = ctx.anim && ctx.anim.pop;
    const l = st.last;
    let info = '';
    if (l && l.timeout && !ctx.anim) info = `<div class="sk-info bad">${esc(seatName(ctx, l.s))} kehabisan waktu, tidak dapat poin.</div>`;
    else if (l && l.w) info = `<div class="sk-info good ${pop ? 'pop' : ''}">+${l.pts} poin untuk ${esc(seatName(ctx, l.s))}${l.help ? ' (pakai bantuan)' : ''}</div>`;
    const hist = st.words.slice(-8).reverse().map((x, i) => `<span class="sk-h ${i === 0 ? 'new' : ''}">${esc(x.w)}${x.s >= 0 ? `<small>${esc(seatName(ctx, x.s))}</small>` : '<small>kata awal</small>'}</span>`).join('');
    let action = '';
    if (st.winner === null) {
      if (myTurn) action = `<div class="sk-turn">Giliranmu! Sambung kata di atas</div>
        <form class="sk-form" id="skForm" autocomplete="off"><span class="sk-pre">${esc(st.need.toUpperCase())}</span><input id="skIn" class="sk-in" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="lanjutkan…" maxlength="16"><button type="submit" class="btn btn-primary sk-send">Kirim</button></form>
        <div id="skErr" class="sk-err"></div>
        <div class="sk-row"><button type="button" class="btn btn-tinted sk-help" id="skHelp"><svg viewBox="0 0 24 24" width="22" height="22" style="vertical-align:-5px"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" fill="#FFC107"/><rect x="8.5" y="18" width="7" height="2" rx="1" fill="#8E8E93"/><rect x="9.5" y="21" width="5" height="1.6" rx=".8" fill="#8E8E93"/></svg> Bantu (poin ½)</button><div class="sk-timer"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="bg"/><circle cx="18" cy="18" r="15.5" class="fg" id="skRing"/></svg><b id="skSec">30</b></div></div>
        <div id="skSug" class="sk-sug"></div>`;
      else action = `<div class="sk-wait"><span class="sk-dots"><i></i><i></i><i></i></span>${esc(seatName(ctx, st.turn))} sedang berpikir…<div class="sk-timer small"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="bg"/><circle cx="18" cy="18" r="15.5" class="fg" id="skRing"/></svg><b id="skSec">30</b></div></div>`;
    }
    box.innerHTML = `<div class="gp-others">${chips}</div>
      <div class="sk-meta"><span class="sk-pill">${st.mode === 'suku' ? 'Mode Seru · suku kata' : 'Mode Mudah · huruf terakhir'}</span><span class="sk-pill">Putaran ${round}/${st.rounds}</span></div>
      <div class="sk-card ${pop ? 'pop' : ''}"><div class="sk-lbl">Kata sebelumnya</div><div class="sk-word">${tiles(prevWord, hiFrom, pop ? 'in' : '')}</div>
        <div class="sk-arrow"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 4v15m-6-6l6 6 6-6" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="sk-lbl">Kata berikutnya diawali</div><div class="sk-need">${tiles(st.need, 0, 'need')}</div>${st.mudah ? '<div class="sk-note">Suku katanya sulit, cukup huruf terakhir.</div>' : ''}</div>
      ${info}${action}
      <div class="sk-hist-lbl">Rantai kata</div><div class="sk-hist">${hist}</div>
      ${H.resultHtml(ctx, st.winner, st.reason)}`;
    // hitung mundur
    const ring = $('skRing'), sec = $('skSec');
    if (ring && st.deadline) {
      const C = 2 * Math.PI * 15.5;
      ring.style.strokeDasharray = C;
      let lastS = -1;
      const tick = () => {
        const left = Math.max(0, st.deadline - now());
        const sLeft = Math.ceil(left / 1000);
        if (sec) sec.textContent = sLeft;
        ring.style.strokeDashoffset = C * (1 - left / KATA_TIME);
        ring.classList.toggle('low', sLeft <= 5);
        if (myTurn && sLeft <= 5 && sLeft !== lastS && sLeft > 0) S.tick();
        lastS = sLeft;
      };
      tick(); H.autoTick = setInterval(tick, 200);
    }
    if (!myTurn) return;
    ctx.auto(() => ctx.act({ timeout: true }), Math.max(500, st.deadline - now()));
    const inp = $('skIn'), err = $('skErr');
    let usedHelp = false;
    setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (e) { } }, 250);
    inp.oninput = () => { err.textContent = ''; inp.value = inp.value.toLowerCase().replace(/[^a-z]/g, ''); };
    $('skForm').onsubmit = e => {
      e.preventDefault();
      const w = st.need + inp.value.trim().toLowerCase();
      const bad = Kata.cek(st, w);
      if (bad) { err.textContent = bad; S.buzz(); const f = $('skForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); return; }
      S.ding();
      ctx.act({ w, help: usedHelp });
    };
    $('skHelp').onclick = () => {
      usedHelp = true; SFX.tap();
      const c = saran(st.need, st.used, 3);
      $('skSug').innerHTML = c.length ? c.map(w => `<button type="button" class="sk-chip" data-w="${w}">${w.toUpperCase()}</button>`).join('') : '<span class="sk-note">Tidak ada saran. Coba kata lain.</span>';
      $('skSug').querySelectorAll('.sk-chip').forEach(b => b.onclick = () => { inp.value = b.dataset.w.slice(st.need.length); SFX.tap(); inp.focus(); });
    };
  }
  async function animKata(prev, next, redraw) {
    const l = next.last;
    if (!prev || prev.gid !== next.gid || !l) { redraw(next); return; }
    if (l.timeout) { S.buzz(); redraw(next); await sleep(500); return; }
    redraw(next, { pop: true });
    const n = l.w.length;
    for (let i = 0; i < n; i++) { S.pop(i); await sleep(70); }
    S.coin();
    await sleep(500);
  }
  const iconKata = '<svg viewBox="0 0 48 48"><rect x="4" y="12" width="12" height="14" rx="3" fill="#fff"/><rect x="18" y="12" width="12" height="14" rx="3" fill="#fff"/><rect x="32" y="12" width="12" height="14" rx="3" fill="#FFE27A"/><text x="10" y="23.5" font-size="10" font-weight="900" text-anchor="middle" fill="#5856D6" font-family="Arial">K</text><text x="24" y="23.5" font-size="10" font-weight="900" text-anchor="middle" fill="#5856D6" font-family="Arial">A</text><text x="38" y="23.5" font-size="10" font-weight="900" text-anchor="middle" fill="#8A5A00" font-family="Arial">TA</text><path d="M14 34h20l-4-4m4 4-4 4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  TTG.daftarGame('kata', {
    meta: {
      name: 'Sambung Kata', desc: 'Lanjutkan kata, kumpulkan poin', bg: 'linear-gradient(160deg,#7B6CF6,#4B3BD6)', min: 2, max: 4,
      optHtml: () => `<span class="field-label" style="margin-top:14px;display:block">Mode</span><div class="segmented" id="skMode"><button type="button" data-m="huruf" class="active">Mudah · huruf</button><button type="button" data-m="suku">Seru · suku kata</button></div>
        <p class="card-sub" id="skModeNote" style="margin:8px 2px 0">Kata berikutnya diawali <b>huruf terakhir</b>. Contoh: makaN → Nasi → Ikan.</p>
        <p class="card-sub" style="margin:6px 2px 0">10 putaran · 30 detik per giliran · kata panjang = poin lebih besar.</p><div id="skLoad" class="card-sub" style="margin-top:6px"></div>`,
      bindOpt: () => {
        document.querySelectorAll('#skMode button').forEach(b => b.onclick = () => {
          SFX.tap(); document.querySelectorAll('#skMode button').forEach(x => x.classList.toggle('active', x === b));
          $('skModeNote').innerHTML = b.dataset.m === 'suku' ? 'Kata berikutnya diawali <b>suku kata terakhir</b>. Contoh: maKAN → KANtor → TORpedo.' : 'Kata berikutnya diawali <b>huruf terakhir</b>. Contoh: makaN → Nasi → Ikan.';
        });
      },
      readOpt: () => { const b = document.querySelector('#skMode button.active'); return { mode: b ? b.dataset.m : 'huruf', rounds: 10 }; },
      onLobby: () => {
        if (KAMUS.set) return;
        const bt = [$('glBot'), $('glOnline')]; bt.forEach(b => b && (b.disabled = true));
        if ($('skLoad')) $('skLoad').textContent = 'Menyiapkan kamus…';
        muatKamus().then(() => { bt.forEach(b => b && (b.disabled = false)); if ($('skLoad')) $('skLoad').textContent = ''; })
          .catch(() => { if ($('skLoad')) $('skLoad').textContent = 'Kamus gagal dimuat, periksa internet.'; });
      }
    },
    engine: Kata, render: renderKata, anim: animKata, icon: iconKata,
    css: `
    .sk-load{padding:40px 10px;text-align:center;color:var(--text2);font-size:17px}
    .sk-spin{width:34px;height:34px;border-radius:50%;border:4px solid #E5E5EA;border-top-color:#5856D6;margin:0 auto 12px;animation:skspin 1s linear infinite}
    @keyframes skspin{to{transform:rotate(360deg)}}
    .sk-meta{display:flex;gap:8px;justify-content:center;margin:12px 0 0;flex-wrap:wrap}
    .sk-pill{background:#EEEBFF;color:#4B3BD6;font-weight:800;font-size:13px;padding:6px 12px;border-radius:999px}
    .sk-card{margin-top:12px;background:linear-gradient(165deg,#FFFFFF,#F3F0FF);border-radius:24px;padding:18px 14px 16px;text-align:center;box-shadow:0 10px 28px rgba(75,59,214,.15),inset 0 0 0 1px rgba(75,59,214,.08)}
    .sk-card.pop{animation:gpop .45s cubic-bezier(.2,1.3,.4,1)}
    .sk-lbl{font-size:13px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em}
    .sk-word,.sk-need{display:flex;justify-content:center;flex-wrap:wrap;gap:5px;margin:10px 0 4px}
    .sk-tile{display:inline-flex;align-items:center;justify-content:center;min-width:clamp(30px,9vw,44px);height:clamp(38px,11vw,52px);padding:0 4px;border-radius:12px;background:#fff;color:#1C1C1E;font-weight:900;font-size:clamp(20px,6vw,28px);box-shadow:0 4px 0 #D6D2F5,0 6px 14px rgba(0,0,0,.08);transform-origin:50% 80%}
    .sk-tile.hi{background:linear-gradient(160deg,#FFB340,#EA6A0A);color:#fff;box-shadow:0 4px 0 #B24D00,0 6px 14px rgba(234,106,10,.35)}
    .sk-tile.in{animation:sktile .42s cubic-bezier(.2,1.5,.4,1) both;animation-delay:calc(var(--i)*70ms)}
    .sk-tile.need{background:linear-gradient(160deg,#8E80FF,#5846E0);color:#fff;box-shadow:0 4px 0 #3427A8,0 8px 18px rgba(75,59,214,.35);animation:skpulse 1.6s ease-in-out infinite}
    @keyframes sktile{from{transform:translateY(-26px) scale(.3) rotate(-12deg);opacity:0}to{transform:none;opacity:1}}
    @keyframes skpulse{50%{transform:translateY(-3px)}}
    .sk-arrow{font-size:22px;color:#8E80FF;margin:4px 0;animation:skpulse 1.2s infinite}
    .sk-note{font-size:13px;color:#B24D00;font-weight:700;margin-top:6px}
    .sk-info{margin:12px auto 0;text-align:center;font-weight:800;font-size:16px;padding:8px 14px;border-radius:14px;width:fit-content;max-width:100%}
    .sk-info.good{background:#E3F8E8;color:#1E8E3E}.sk-info.bad{background:#FFE9E7;color:#C62828}
    .sk-info.pop{animation:gpop .5s cubic-bezier(.2,1.4,.4,1)}
    .sk-turn{text-align:center;font-size:19px;font-weight:900;color:#4B3BD6;margin:16px 0 8px}
    .sk-form{display:flex;align-items:stretch;gap:8px;background:#fff;border-radius:18px;padding:8px;box-shadow:var(--shadow)}
    .sk-form.shake{animation:skshake .4s}
    @keyframes skshake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
    .sk-pre{display:flex;align-items:center;padding:0 14px;border-radius:12px;background:#5846E0;color:#fff;font-weight:900;font-size:22px;letter-spacing:.04em}
    .sk-in{flex:1;min-width:0;border:0;outline:0;font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:transparent;color:#1C1C1E;padding:0 4px}
    .sk-send{padding:0 18px;font-size:17px;border-radius:12px;min-height:52px}
    .sk-err{min-height:22px;text-align:center;color:#C62828;font-weight:800;font-size:15px;margin-top:6px}
    .sk-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px}
    .sk-help{flex:1;min-height:52px;font-size:16px}
    .sk-timer{position:relative;width:56px;height:56px;flex:none}
    .sk-timer.small{width:40px;height:40px;margin:10px auto 0}
    .sk-timer svg{width:100%;height:100%;transform:rotate(-90deg)}
    .sk-timer circle{fill:none;stroke-width:4}
    .sk-timer .bg{stroke:#E5E5EA}.sk-timer .fg{stroke:#5846E0;stroke-linecap:round;transition:stroke-dashoffset .2s linear,stroke .3s}
    .sk-timer .fg.low{stroke:#FF3B30}
    .sk-timer b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900}
    .sk-timer.small b{font-size:13px}
    .sk-sug{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}
    .sk-chip{background:#FFF4E0;color:#8A4B00;border-radius:14px;padding:12px 16px;font-weight:900;font-size:17px;box-shadow:0 3px 0 #F2C98A;animation:gpop .3s}
    .sk-wait{text-align:center;color:var(--text2);font-size:17px;font-weight:700;margin:18px 0 6px}
    .sk-dots{display:inline-flex;gap:4px;margin-right:8px;vertical-align:middle}
    .sk-dots i{width:8px;height:8px;border-radius:50%;background:#8E80FF;animation:skdot 1s infinite}
    .sk-dots i:nth-child(2){animation-delay:.15s}.sk-dots i:nth-child(3){animation-delay:.3s}
    @keyframes skdot{40%{transform:translateY(-6px);opacity:.5}}
    .sk-hist-lbl{margin:18px 4px 6px;font-size:13px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.05em}
    .sk-hist{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;-webkit-overflow-scrolling:touch}
    .sk-h{flex:none;background:#fff;border-radius:14px;padding:8px 12px;font-weight:900;font-size:16px;text-transform:uppercase;box-shadow:var(--shadow);text-align:center}
    .sk-h small{display:block;font-size:11px;font-weight:600;color:var(--text2);text-transform:none}
    .sk-h.new{background:#EEEBFF;animation:gpop .4s}
    `
  });

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
  /* =====================================================================
     3. WEREWOLF (5–8 pemain, kursi kosong diisi bot; tanpa diskusi)
     ===================================================================== */
  const WSV = b => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
  const WI = {
    wolf: WSV('<path d="M3 3l5 4h8l5-4-1 8c0 6-4 10-8 10s-8-4-8-10z" fill="#5E5E6E"/><path d="M8 13l2 1M16 13l-2 1" stroke="#FFD60A" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 17.5c1.5 1 3.5 1 5 0l-2.5 2z" fill="#1C1C1E"/><path d="M5 5l2 4M19 5l-2 4" stroke="#3A3A46" stroke-width="1.3"/>'),
    seer: WSV('<circle cx="12" cy="10.5" r="7.5" fill="#B388FF"/><circle cx="9.5" cy="8" r="2.4" fill="#fff" opacity=".6"/><path d="M6 19h12l-1.5 3h-9z" fill="#6A3FB5"/><path d="M14 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#fff"/>'),
    doctor: WSV('<path d="M12 2l8 3v6c0 5.5-3.6 9.5-8 11-4.4-1.5-8-5.5-8-11V5z" fill="#0A84FF"/><path d="M10.5 7.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="#fff"/>'),
    villager: WSV('<ellipse cx="12" cy="7.5" rx="10" ry="2.6" fill="#E0B44C"/><path d="M7 7.5c0-3 2.2-5 5-5s5 2 5 5z" fill="#F2CB61"/><circle cx="12" cy="11" r="4" fill="#F5C9A0"/><path d="M4 22c0-4.5 3.6-7 8-7s8 2.5 8 7z" fill="#43A047"/>'),
    skull: WSV('<path d="M12 2c5 0 8.5 3.4 8.5 8 0 2.8-1.4 4.6-3 5.6V19a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19v-3.4C4.9 14.6 3.5 12.8 3.5 10c0-4.6 3.5-8 8.5-8z" fill="#F2F2F7" stroke="#8E8E93" stroke-width="1"/><circle cx="9" cy="10.5" r="2.2" fill="#1C1C1E"/><circle cx="15" cy="10.5" r="2.2" fill="#1C1C1E"/><path d="M11 15h2l-1-1.8z" fill="#1C1C1E"/>'),
    vote: WSV('<rect x="3" y="11" width="18" height="10" rx="2" fill="#0A84FF"/><path d="M7 4h10v9H7z" fill="#fff" stroke="#8E8E93" stroke-width="1"/><path d="M9.5 8.5l1.8 1.8 3.4-3.6" stroke="#34C759" stroke-width="1.8" fill="none" stroke-linecap="round"/><rect x="6" y="13" width="12" height="1.6" rx=".8" fill="#0057B8"/>'),
    moon: WSV('<path d="M15.5 2.5A9.5 9.5 0 1 0 21.5 17 8 8 0 0 1 15.5 2.5z" fill="#FFE08A"/>'),
    sun: WSV('<circle cx="12" cy="12" r="5" fill="#FFC107"/><g stroke="#FFC107" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>'),
    scale: WSV('<path d="M12 3v17M5 20h14M4 7h16" stroke="#8D6E63" stroke-width="2" stroke-linecap="round"/><path d="M4 7l-3 6h6zM20 7l-3 6h6z" fill="#FFB74D"/>'),
    house: WSV('<path d="M3 11L12 3.5 21 11v9.5a1 1 0 0 1-1 1h-5.5V15h-5v6.5H4a1 1 0 0 1-1-1z" fill="#FF9500"/><path d="M1.5 11.5L12 2.5l10.5 9" stroke="#C93400" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
    unknown: WSV('<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.1-1.5 2.4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="currentColor"/>'),
    clock: WSV('<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>')
  };
  const WW_HOUSES = `<svg viewBox="0 0 160 40" class="ww-hs"><g fill="currentColor"><path d="M10 40V22l14-12 14 12v18z"/><path d="M60 40V18l18-14 18 14v22z"/><path d="M116 40V24l13-10 13 10v16z"/></g><g fill="#FFD54F" class="ww-win-l"><rect x="20" y="26" width="7" height="7"/><rect x="72" y="22" width="9" height="9"/><rect x="125" y="28" width="7" height="6"/></g></svg>`;
  const WW_ROLE = {
    w: { n: 'Serigala', ic: WI.wolf, c: '#C62828', d: 'Tiap malam pilih 1 warga untuk dimangsa. Jangan sampai ketahuan!' },
    s: { n: 'Peramal', ic: WI.seer, c: '#7B3FE4', d: 'Tiap malam intip peran 1 orang. Bantu warga menemukan serigala.' },
    d: { n: 'Dokter', ic: WI.doctor, c: '#0A84FF', d: 'Tiap malam lindungi 1 orang (boleh diri sendiri) dari serigala.' },
    v: { n: 'Warga', ic: WI.villager, c: '#2E7D32', d: 'Siang hari pilih siapa yang dicurigai sebagai serigala.' }
  };
  const WW_ACT = 30000;
  const WW = {
    init(n) {
      const wolves = n >= 7 ? 2 : 1;
      const roles = shuffle([...Array(wolves).fill('w'), 's', 'd', ...Array(n - wolves - 2).fill('v')]);
      return { n, roles, alive: Array(n).fill(true), phase: 'intro', night: 1, turn: 0, picks: {}, seen: {}, votes: {}, order: [], last: null, winner: null, deadline: 0, v: 1, gid: gid() };
    },
    norm(st) {
      st.roles = arr(st.roles); st.alive = arr(st.alive).map(Boolean); st.order = arr(st.order).map(Number);
      st.picks = st.picks || {}; st.seen = st.seen || {}; st.votes = st.votes || {};
      if (st.winner === undefined) st.winner = null; return st;
    },
    hidup: st => st.alive.map((a, i) => a ? i : -1).filter(i => i >= 0),
    cekMenang(st) {
      const al = this.hidup(st), w = al.filter(i => st.roles[i] === 'w').length;
      if (w === 0) { st.winner = 'v'; st.reason = 'Semua serigala tertangkap'; }
      else if (w >= al.length - w) { st.winner = 'w'; st.reason = 'Serigala menguasai desa'; }
      return st.winner !== null;
    },
    pelaku(st, role, seats) {
      const al = this.hidup(st).filter(i => st.roles[i] === role);
      if (!al.length) return -1;
      if (seats) { const h = al.find(i => seats[i] && !seats[i].bot); if (h !== undefined) return h; }
      return al[0];
    },
    // pindah ke fase malam berikutnya yang punya pelaku
    keMalam(st, from) {
      const urut = ['wolf', 'seer', 'doctor'];
      const role = { wolf: 'w', seer: 's', doctor: 'd' };
      let k = from === null ? 0 : urut.indexOf(from) + 1;
      for (; k < urut.length; k++) {
        const p = this.pelaku(st, role[urut[k]], this._seats);
        if (p >= 0) { st.phase = urut[k]; st.turn = p; st.deadline = now() + WW_ACT; return; }
      }
      // fajar: hitung hasil malam
      const korban = st.picks.w, lindung = st.picks.d;
      st.phase = 'dawn'; st.deadline = 0;
      if (korban !== undefined && korban !== null && korban !== lindung) { st.alive[korban] = false; st.dawn = { killed: korban }; }
      else st.dawn = { killed: -1, saved: korban !== undefined && korban === lindung };
      this.cekMenang(st);
    },
    targets(st, s) {
      const al = this.hidup(st);
      if (st.phase === 'wolf') return al.filter(i => st.roles[i] !== 'w');
      if (st.phase === 'seer') return al.filter(i => i !== s && !(st.seen[s] && st.seen[s][i]));
      if (st.phase === 'doctor') return al;
      if (st.phase === 'vote') return al.filter(i => i !== s);
      return [];
    },
    apply(st, s, mv, seats) {
      st = this.norm(clone(st));
      if (st.winner !== null) return st;
      this._seats = seats || this._seatsCache;
      const L = { phase: st.phase };
      if (mv.next) {
        if (s !== -1) return st;
        if (st.phase === 'intro') { st.picks = {}; this.keMalam(st, null); }
        else if (st.phase === 'dawn') {
          const al = this.hidup(st); const off = rnd(al.length);
          st.order = al.slice(off).concat(al.slice(0, off)); st.votes = {};
          st.phase = 'vote'; st.turn = st.order[0]; st.deadline = now() + WW_ACT;
        } else if (st.phase === 'verdict') { st.night++; st.picks = {}; st.dawn = null; this.keMalam(st, null); }
        else return st;
      } else {
        if (!['wolf', 'seer', 'doctor', 'vote'].includes(st.phase)) return st;
        const a = st.turn;
        if (s !== a && !(s === -1 && mv.timeout)) return st;
        const opts = this.targets(st, a);
        let tg = mv.target;
        if (mv.timeout || !opts.includes(tg)) { if (!mv.timeout) return st; tg = opts[rnd(opts.length)]; }
        L.s = a; L.target = tg;
        if (st.phase === 'wolf') { st.picks.w = tg; this.keMalam(st, 'wolf'); }
        else if (st.phase === 'seer') { st.seen[a] = st.seen[a] || {}; st.seen[a][tg] = st.roles[tg]; st.picks.s = tg; this.keMalam(st, 'seer'); }
        else if (st.phase === 'doctor') { st.picks.d = tg; this.keMalam(st, 'doctor'); }
        else {
          st.votes[a] = tg;
          const idx = st.order.indexOf(a);
          const nx = st.order.slice(idx + 1).find(i => st.alive[i]);
          if (nx !== undefined) { st.turn = nx; st.deadline = now() + WW_ACT; }
          else {
            const tally = {}; Object.values(st.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
            const max = Math.max(...Object.values(tally));
            const top = Object.keys(tally).filter(k => tally[k] === max).map(Number);
            st.phase = 'verdict'; st.deadline = 0;
            if (top.length === 1) { st.alive[top[0]] = false; st.verdict = { out: top[0], n: max }; }
            else st.verdict = { out: -1, tie: top };
            this.cekMenang(st);
          }
        }
      }
      st.last = L; st.v++;
      return st;
    },
    bot(st, s) {
      const opts = this.targets(st, s);
      if (!opts.length) return { timeout: true };
      if (st.phase === 'seer') return { target: opts[rnd(opts.length)] };
      if (st.phase === 'doctor') return { target: Math.random() < .35 && st.alive[s] ? s : opts[rnd(opts.length)] };
      if (st.phase === 'wolf') { const known = Object.keys(st.seen || {}).map(Number).filter(k => st.alive[k]); const pick = known.length && Math.random() < .5 ? known[0] : opts[rnd(opts.length)]; return { target: opts.includes(pick) ? pick : opts[0] }; }
      // memilih saat siang
      const role = st.roles[s];
      if (role === 's') { const w = Object.keys(st.seen[s] || {}).map(Number).find(k => st.seen[s][k] === 'w' && st.alive[k]); if (w !== undefined) return { target: w }; }
      let pool = opts;
      if (role === 'w') pool = opts.filter(i => st.roles[i] !== 'w');
      if (role === 's') pool = opts.filter(i => !(st.seen[s] && st.seen[s][i] && st.seen[s][i] !== 'w'));
      const tally = {}; Object.values(st.votes).forEach(t => { if (pool.includes(t)) tally[t] = (tally[t] || 0) + 1; });
      const lead = Object.keys(tally).map(Number).sort((a, b) => tally[b] - tally[a])[0];
      if (lead !== undefined && Math.random() < .55) return { target: lead };
      const p = pool.length ? pool : opts;
      return { target: p[rnd(p.length)] };
    },
    botDelay(st) { return st.phase === 'vote' ? 1400 + rnd(900) : 1800 + rnd(1000); },
    pending(st, seats) {
      this._seatsCache = seats;
      if (st.winner !== null) return null;
      if (st.phase === 'intro') return { mv: { next: true }, ms: 7000 };
      if (st.phase === 'dawn') return { mv: { next: true }, ms: 5200 };
      if (st.phase === 'verdict') return { mv: { next: true }, ms: 5800 };
      const seat = seats[st.turn];
      if (seat && !seat.bot && st.deadline) return { mv: { timeout: true }, ms: Math.max(1500, st.deadline - now() + 6000) };
      return null;
    },
    winnerName: st => st.winner === 'w' ? 'Tim Serigala' : 'Tim Warga',
    rank(st) { const win = i => (st.winner === 'w') === (st.roles[i] === 'w'); return Array.from({ length: st.n }, (_, i) => i).sort((a, b) => win(b) - win(a) || st.alive[b] - st.alive[a]); },
    rankVal(st, s) { return WW_ROLE[st.roles[s]].n; },
    winHtml(st, ctx) {
      const wolfWin = st.winner === 'w';
      const me = ctx.mySeat;
      const iWin = !ctx.spectator && me !== null && me !== undefined && ((st.roles[me] === 'w') === wolfWin);
      const list = Array.from({ length: st.n }, (_, i) => { const r = WW_ROLE[st.roles[i]]; const win = (st.roles[i] === 'w') === wolfWin; return `<div class="ww-end ${win ? 'win' : ''} ${st.alive[i] ? '' : 'dead'}">${seatAva(ctx, i)}<span class="ww-en">${esc(seatName(ctx, i))}</span><span class="ww-badge" style="--rc:${r.c}">${r.ic} ${r.n}</span></div>`; }).join('');
      return { iWin, html: `<div class="ww-win ${wolfWin ? 'wolf' : 'vil'}"><div class="ww-win-ic">${wolfWin ? WI.wolf : WI.house}</div><div class="pd-title" style="color:#fff">${wolfWin ? 'Serigala Menang!' : 'Warga Menang!'}</div><div class="pd-sub" style="color:rgba(255,255,255,.85)">${esc(st.reason || '')}${ctx.spectator ? '' : iWin ? ' · Timmu menang!' : ' · Timmu kalah'}</div></div><div class="ww-endlist">${list}</div>` };
    }
  };
  function renderWW(box, st, ctx) {
    st = WW.norm(clone(st));
    const me = ctx.spectator ? null : ctx.mySeat;
    const myRole = me !== null && me !== undefined ? st.roles[me] : null;
    const alive = me !== null && me !== undefined && st.alive[me];
    const all = ctx.spectator || (me !== null && !alive) || st.winner !== null;
    const night = ['intro', 'wolf', 'seer', 'doctor'].includes(st.phase) && st.phase !== 'intro' || (st.phase === 'intro');
    const isNight = ['wolf', 'seer', 'doctor'].includes(st.phase);
    const myAct = ctx.canAct && alive && st.turn === me && ['wolf', 'seer', 'doctor', 'vote'].includes(st.phase) && st.winner === null;
    const opts = myAct ? WW.targets(st, me) : [];
    const lihat = i => all || i === me || (myRole === 'w' && st.roles[i] === 'w') || (myRole === 's' && st.seen[me] && st.seen[me][i]) || !st.alive[i];
    const tally = {}; if (st.phase === 'vote' || st.phase === 'verdict') Object.values(st.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    const A = ctx.anim || {};
    const cards = Array.from({ length: st.n }, (_, i) => {
      const r = WW_ROLE[st.roles[i]];
      const show = lihat(i);
      const can = opts.includes(i);
      const dead = !st.alive[i];
      const justDied = A.died === i;
      const votedBy = (st.phase === 'vote' || st.phase === 'verdict') ? Object.keys(st.votes).filter(k => st.votes[k] === i).length : 0;
      const voting = st.phase === 'vote' && st.turn === i && st.winner === null;
      return `<button type="button" class="ww-p ${can ? 'can' : ''} ${dead ? 'dead' : ''} ${justDied ? 'die' : ''} ${i === me ? 'me' : ''} ${voting ? 'voting' : ''}" data-i="${i}" ${can ? '' : 'disabled'}>
        <span class="ww-av">${seatAva(ctx, i).replace('width:32px;height:32px', 'width:54px;height:54px;font-size:22px')}${dead ? `<span class="ww-skull">${WI.skull}</span>` : ''}</span>
        <span class="ww-nm">${esc(seatName(ctx, i))}</span>
        ${show ? `<span class="ww-badge" style="--rc:${r.c}">${r.ic} ${r.n}</span>` : `<span class="ww-badge unk">${WI.unknown}</span>`}
        ${votedBy ? `<span class="ww-votes">${WI.vote}<b>${votedBy}</b></span>` : ''}</button>`;
    }).join('');
    let head = '', sub = '';
    const nm = i => esc(seatName(ctx, i));
    if (st.winner !== null) { head = st.winner === 'w' ? `${WI.wolf} Serigala menang` : `${WI.house} Warga menang`; }
    else if (st.phase === 'intro') { head = `${WI.moon} Malam ke-${st.night} tiba`; sub = 'Lihat peranmu. Rahasiakan dari yang lain!'; }
    else if (st.phase === 'wolf') { head = myAct ? `${WI.wolf} Pilih mangsamu malam ini` : `${WI.wolf} Serigala sedang berburu…`; sub = myAct ? 'Ketuk satu warga.' : 'Semua warga tertidur…'; }
    else if (st.phase === 'seer') { head = myAct ? `${WI.seer} Pilih 1 orang untuk diintip` : `${WI.seer} Peramal sedang meramal…`; sub = myAct ? 'Perannya akan terlihat hanya olehmu.' : 'Semua warga tertidur…'; }
    else if (st.phase === 'doctor') { head = myAct ? `${WI.doctor} Pilih 1 orang untuk dilindungi` : `${WI.doctor} Dokter sedang berjaga…`; sub = myAct ? 'Boleh melindungi diri sendiri.' : 'Semua warga tertidur…'; }
    else if (st.phase === 'dawn') {
      head = `${WI.sun} Pagi hari`;
      sub = st.dawn && st.dawn.killed >= 0 ? `Semalam <b>${nm(st.dawn.killed)}</b> dimangsa serigala… Ia adalah <b>${WW_ROLE[st.roles[st.dawn.killed]].n}</b>.` : st.dawn && st.dawn.saved ? 'Serigala menyerang, tapi Dokter berhasil menyelamatkan!' : 'Malam ini tidak ada korban.';
    } else if (st.phase === 'vote') { head = myAct ? `${WI.vote} Giliranmu memilih` : `${WI.vote} ${nm(st.turn)} sedang memilih…`; sub = myAct ? 'Ketuk orang yang kamu curigai sebagai serigala.' : 'Siapa yang paling dicurigai?'; }
    else if (st.phase === 'verdict') { head = `${WI.scale} Hasil pemilihan`; sub = st.verdict && st.verdict.out >= 0 ? `<b>${nm(st.verdict.out)}</b> diusir dari desa (${st.verdict.n} suara). Ia adalah <b>${WW_ROLE[st.roles[st.verdict.out]].ic} ${WW_ROLE[st.roles[st.verdict.out]].n}</b>.` : 'Suara seri, tidak ada yang diusir.'; }
    // info rahasia
    let secret = '';
    if (myRole && st.winner === null) {
      const r = WW_ROLE[myRole];
      let extra = '';
      if (myRole === 'w') { const mates = st.roles.map((x, i) => x === 'w' && i !== me ? i : -1).filter(i => i >= 0); if (mates.length) extra = `Temanmu: ${mates.map(nm).join(', ')}`; }
      if (myRole === 's') { const sn = Object.keys(st.seen[me] || {}); if (sn.length) extra = sn.map(k => `${nm(+k)}: ${WW_ROLE[st.seen[me][k]].ic} ${WW_ROLE[st.seen[me][k]].n}`).join(' · '); }
      secret = `<div class="ww-me" style="--rc:${r.c}"><span class="ww-me-ic">${r.ic}</span><div><small>Peranmu ${alive ? '' : '(sudah tersingkir)'}</small><b>${r.n}</b>${extra ? `<div class="ww-me-x">${extra}</div>` : ''}</div></div>`;
    }
    const intro = st.phase === 'intro' && myRole ? `<div class="ww-rolecard"><div class="ww-flip"><div class="ww-rf back">${WI.moon}<b>PERANMU</b></div><div class="ww-rf front" style="--rc:${WW_ROLE[myRole].c}"><span>${WW_ROLE[myRole].ic}</span><b>${WW_ROLE[myRole].n}</b><small>${WW_ROLE[myRole].d}</small></div></div></div>` : '';
    const stars = Array.from({ length: 26 }, (_, k) => `<i style="left:${(k * 37) % 100}%;top:${(k * 53) % 60}%;animation-delay:${(k % 7) * .3}s"></i>`).join('');
    box.innerHTML = `<div class="ww-scene ${isNight || st.phase === 'intro' ? 'night' : 'day'} ${st.phase}">
        <div class="ww-sky"><div class="ww-stars">${stars}</div><div class="ww-moon"></div><div class="ww-sun"></div><div class="ww-hill h1"></div><div class="ww-hill h2"></div><div class="ww-houses">${WW_HOUSES}</div></div>
        <div class="ww-head"><div class="ww-h">${head}</div>${sub ? `<div class="ww-sub">${sub}</div>` : ''}<div class="ww-timer" id="wwT"></div></div>
        ${intro}${secret}
        <div class="ww-grid">${cards}</div>
        <div class="ww-legend">Malam ke-${st.night} · ${WW.hidup(st).length} masih hidup</div>
      </div>`;
    if (night) { /* tema malam lewat kelas CSS */ }
    if (!myAct) return;
    box.querySelectorAll('.ww-p.can').forEach(b => b.onclick = () => {
      SFX.unlock();
      if (st.phase === 'wolf') S.howl(); else if (st.phase === 'seer') S.magic(); else if (st.phase === 'doctor') S.shield(); else SFX.tap();
      clearInterval(H.autoTick); ctx.act({ target: +b.dataset.i });
    });
    const tEl = $('wwT');
    const tick = () => { const left = Math.max(0, Math.ceil((st.deadline - now()) / 1000)); if (tEl) tEl.innerHTML = `${WI.clock} ${left} detik (otomatis dipilih acak)`; };
    tick(); H.autoTick = setInterval(tick, 300);
    ctx.auto(() => ctx.act({ timeout: true }), Math.max(500, st.deadline - now()));
  }
  async function animWW(prev, next, redraw) {
    if (!prev || prev.gid !== next.gid) { redraw(next); if (next.phase === 'intro') { S.howl(); } return; }
    if (prev.phase !== next.phase) {
      if (next.phase === 'wolf' && prev.phase !== 'wolf') { redraw(next); S.howl(); await sleep(400); return; }
      if (next.phase === 'dawn') {
        redraw(next); S.rooster(); await sleep(900);
        if (next.dawn && next.dawn.killed >= 0) { SFX.capture(); redraw(next, { died: next.dawn.killed }); await sleep(900); }
        else if (next.dawn && next.dawn.saved) S.shield();
        return;
      }
      if (next.phase === 'verdict') {
        redraw(next, {}); S.drum(); await sleep(1200);
        if (next.verdict && next.verdict.out >= 0) { SFX.capture(); redraw(next, { died: next.verdict.out }); await sleep(900); }
        return;
      }
    }
    if (next.phase === 'vote' && prev.phase === 'vote') SFX.tap();
    redraw(next);
    if (next.winner !== null && next.winner !== undefined) await sleep(600);
  }
  const iconWW = '<svg viewBox="0 0 48 48"><circle cx="34" cy="13" r="8" fill="#FFE9A8"/><circle cx="31" cy="11" r="7" fill="#2B2D6E"/><path d="M8 40l5-17 5 6 6-12 6 12 5-6 5 17z" fill="#1A1A2E"/><path d="M17 31l2-6 3 3 2-5 2 5 3-3 2 6-7 4z" fill="#8E8E93"/><circle cx="21.5" cy="29" r="1.2" fill="#FF3B30"/><circle cx="26.5" cy="29" r="1.2" fill="#FF3B30"/><circle cx="12" cy="10" r="1" fill="#fff"/><circle cx="20" cy="6" r=".8" fill="#fff"/><circle cx="42" cy="26" r=".8" fill="#fff"/></svg>';
  TTG.daftarGame('werewolf', {
    meta: { name: 'Werewolf', desc: 'Tebak siapa serigala di desa', bg: 'linear-gradient(160deg,#3B3F8F,#141633)', min: 5, max: 8, nList: [5, 6, 7, 8], nDef: 6, nNote: 'Kursi kosong otomatis diisi komputer. Peran: Serigala, Peramal, Dokter, Warga. Siang hari langsung memilih tanpa diskusi.' },
    engine: WW, render: renderWW, anim: animWW, icon: iconWW,
    css: `
    .ww-scene{position:relative;border-radius:26px;overflow:hidden;padding:16px 12px 92px;min-height:70vh;transition:background 1.2s;isolation:isolate}
    .ww-scene.night{background:linear-gradient(180deg,#0B1030 0%,#1B1F5C 55%,#2B2F7A 100%);color:#fff}
    .ww-scene.day{background:linear-gradient(180deg,#7FD3FF 0%,#BDEBFF 55%,#E9F9FF 100%);color:#1C1C1E}
    .ww-sky{position:absolute;inset:0;z-index:-1;pointer-events:none}
    .ww-stars i{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;opacity:0;animation:wwtw 2.4s ease-in-out infinite}
    .ww-scene.night .ww-stars i{opacity:.8}
    @keyframes wwtw{50%{opacity:.15;transform:scale(.6)}}
    .ww-moon{position:absolute;right:8%;top:5%;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FFF9DB,#FFE08A);box-shadow:0 0 40px 10px rgba(255,236,160,.45);transition:transform 1.2s,opacity 1.2s}
    .ww-sun{position:absolute;right:10%;top:6%;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle,#FFF3B0,#FFC107);box-shadow:0 0 50px 16px rgba(255,200,40,.55);transition:transform 1.2s,opacity 1.2s}
    .ww-scene.night .ww-sun{transform:translateY(160px);opacity:0}
    .ww-scene.day .ww-moon{transform:translateY(-140px);opacity:0}
    .ww-scene.day.dawn .ww-sun{animation:wwrise 1.6s cubic-bezier(.2,.9,.3,1)}
    @keyframes wwrise{from{transform:translateY(160px)}}
    .ww-hill{position:absolute;bottom:-40px;border-radius:50%;transition:background 1.2s}
    .ww-hill.h1{left:-20%;width:90%;height:140px}.ww-hill.h2{right:-25%;width:95%;height:120px}
    .ww-scene.night .ww-hill.h1{background:#14173F}.ww-scene.night .ww-hill.h2{background:#1A1E4E}
    .ww-scene.day .ww-hill.h1{background:#7ED492}.ww-scene.day .ww-hill.h2{background:#5CC274}
    .ww-houses{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);opacity:.95}
    .ww-head{text-align:center;padding:4px 70px 4px 4px;min-height:74px}
    .ww-h{font-size:21px;font-weight:900;line-height:1.25;animation:gpop .5s}
    .ww-sub{font-size:16px;margin-top:6px;opacity:.9;line-height:1.4}
    .ww-timer{font-size:13px;margin-top:6px;opacity:.75;font-weight:700}
    .ww-me{display:flex;align-items:center;gap:12px;margin:12px 0 4px;background:rgba(255,255,255,.14);border:2px solid var(--rc);border-radius:18px;padding:10px 12px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
    .ww-scene.day .ww-me{background:rgba(255,255,255,.75)}
    .ww-me-ic{font-size:34px}
    .ww-me small{display:block;font-size:12px;opacity:.8;font-weight:700}
    .ww-me b{font-size:19px}
    .ww-me-x{font-size:13px;margin-top:2px;opacity:.9}.ww-me-x svg{width:15px;height:15px;vertical-align:-3px}
    .ww-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;margin-top:14px}
    .ww-p{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 6px 10px;border-radius:20px;background:rgba(255,255,255,.12);color:inherit;transition:transform .2s,box-shadow .2s,opacity .4s,filter .4s}
    .ww-scene.day .ww-p{background:rgba(255,255,255,.8);box-shadow:0 4px 14px rgba(0,80,140,.12)}
    .ww-p.me{box-shadow:inset 0 0 0 2px rgba(255,214,10,.9)}
    .ww-p.can{cursor:pointer;animation:wwcan 1.4s ease-in-out infinite;box-shadow:0 0 0 3px #FFD60A,0 8px 20px rgba(255,214,10,.35)}
    .ww-p.can:active{transform:scale(.94)}
    @keyframes wwcan{50%{transform:translateY(-4px)}}
    .ww-p.voting{box-shadow:0 0 0 3px #0A84FF}
    .ww-p.dead{opacity:.45;filter:grayscale(1)}
    .ww-p.die{animation:wwdie .9s ease both}
    @keyframes wwdie{0%{transform:scale(1);filter:none;opacity:1}30%{transform:scale(1.12) rotate(-4deg)}60%{transform:scale(.96) rotate(3deg)}100%{transform:none;opacity:.45;filter:grayscale(1)}}
    .ww-av{position:relative}
    .ww-skull{position:absolute;right:-8px;bottom:-6px;font-size:22px}
    .ww-nm{font-weight:800;font-size:15px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ww-badge{font-size:12px;font-weight:800;padding:3px 8px;border-radius:999px;background:var(--rc);color:#fff;white-space:nowrap}
    .ww-badge.unk{background:rgba(128,128,128,.35)}
    .ww-votes{position:absolute;top:4px;right:6px;font-size:13px;animation:gpop .3s}
    .ww-h svg{width:26px;height:26px;vertical-align:-5px;margin-right:2px}
    .ww-badge svg{width:14px;height:14px;vertical-align:-2.5px}
    .ww-me-ic svg{width:40px;height:40px;display:block}
    .ww-skull svg{width:24px;height:24px;display:block}
    .ww-votes{display:flex;align-items:center;gap:2px;background:#fff;color:#0A84FF;border-radius:999px;padding:1px 6px 1px 3px;box-shadow:0 1px 4px rgba(0,0,0,.2)}
    .ww-votes svg{width:16px;height:16px}.ww-votes b{font-size:12px}
    .ww-timer svg{width:14px;height:14px;vertical-align:-2px}
    .ww-rf svg{width:72px;height:72px}
    .ww-win-ic svg{width:92px;height:92px}
    .ww-hs{width:200px;height:50px;display:block}
    .ww-scene.night .ww-hs{color:#0B0E2A}.ww-scene.day .ww-hs{color:#B23B1E}.ww-scene.day .ww-win-l{fill:#FFF3E0}
    .ww-legend{text-align:center;font-size:13px;opacity:.75;margin-top:14px;font-weight:700}
    .ww-rolecard{display:flex;justify-content:center;margin:10px 0;perspective:900px}
    .ww-flip{width:200px;height:250px;position:relative;transform-style:preserve-3d;animation:wwflip 1.4s .5s cubic-bezier(.2,.9,.3,1) both}
    @keyframes wwflip{from{transform:rotateY(0)}to{transform:rotateY(180deg)}}
    .ww-rf{position:absolute;inset:0;border-radius:22px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.4)}
    .ww-rf.back{background:linear-gradient(150deg,#3B3F8F,#141633);border:3px solid #FFE08A;font-size:54px}
    .ww-rf.back b{font-size:16px;letter-spacing:.12em;color:#FFE08A}
    .ww-rf.front{background:#fff;color:#1C1C1E;transform:rotateY(180deg);border:4px solid var(--rc)}
    .ww-rf.front span{font-size:62px}
    .ww-rf.front b{font-size:24px;color:var(--rc)}
    .ww-rf.front small{font-size:13px;color:#3A3A3C;line-height:1.35}
    .ww-win{border-radius:24px;padding:22px 16px;color:#fff;animation:gpop .5s}
    .ww-win.wolf{background:radial-gradient(circle at 50% 20%,#4A2C7A,#141633)}
    .ww-win.vil{background:radial-gradient(circle at 50% 20%,#5CC274,#1E7A3C)}
    .ww-win-ic{font-size:80px;animation:wwbig 1.2s ease-in-out infinite}
    @keyframes wwbig{50%{transform:scale(1.1) rotate(-4deg)}}
    .ww-endlist{display:flex;flex-direction:column;gap:8px;margin-top:14px}
    .ww-end{display:flex;align-items:center;gap:10px;background:#fff;border-radius:14px;padding:8px 10px;box-shadow:var(--shadow);text-align:left}
    .ww-end.win{box-shadow:inset 0 0 0 2px #FFD60A,var(--shadow)}
    .ww-end.dead{opacity:.6}
    .ww-en{flex:1;font-weight:800}
    `
  });
})();
