/* =========================================================
   Thai Tea — Game tambahan: Sambung Kata, Monopoli, Werewolf
   Memakai sistem meja/bot/Live/jeda/podium dari games.js (TTG.daftarGame).
   ========================================================= */
(function () {
  if (!window.TTG || !TTG.daftarGame) return;
  const H = TTG._h;
  const { SFX, $, rnd, clone, shuffle, arr, sleep, seatName, seatAva } = H;
  const now = () => Date.now();
  const fmt = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
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
        <div class="sk-row"><button type="button" class="btn btn-tinted sk-help" id="skHelp">💡 Bantu (poin ½)</button><div class="sk-timer"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="bg"/><circle cx="18" cy="18" r="15.5" class="fg" id="skRing"/></svg><b id="skSec">30</b></div></div>
        <div id="skSug" class="sk-sug"></div>`;
      else action = `<div class="sk-wait"><span class="sk-dots"><i></i><i></i><i></i></span>${esc(seatName(ctx, st.turn))} sedang berpikir…<div class="sk-timer small"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="bg"/><circle cx="18" cy="18" r="15.5" class="fg" id="skRing"/></svg><b id="skSec">30</b></div></div>`;
    }
    box.innerHTML = `<div class="gp-others">${chips}</div>
      <div class="sk-meta"><span class="sk-pill">${st.mode === 'suku' ? 'Mode Seru · suku kata' : 'Mode Mudah · huruf terakhir'}</span><span class="sk-pill">Putaran ${round}/${st.rounds}</span></div>
      <div class="sk-card ${pop ? 'pop' : ''}"><div class="sk-lbl">Kata sebelumnya</div><div class="sk-word">${tiles(prevWord, hiFrom, pop ? 'in' : '')}</div>
        <div class="sk-arrow">⬇</div><div class="sk-lbl">Kata berikutnya diawali</div><div class="sk-need">${tiles(st.need, 0, 'need')}</div>${st.mudah ? '<div class="sk-note">Suku katanya sulit, cukup huruf terakhir.</div>' : ''}</div>
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
  const MP_N = MP_TILES.length, MP_START_CASH = 1000, MP_SALARY = 100, MP_JAIL = 6, MP_MAX_ROUND = 60;
  const MP_CARD = {
    kesempatan: [
      { x: 'Maju ke START, terima gaji', go: 0 },
      { x: 'Menang lomba masak!', cash: 100 },
      { x: 'Kena tilang di jalan', cash: -50 },
      { x: 'Mundur 3 langkah', back: 3 },
      { x: 'Ketahuan parkir liar, masuk penjara!', jail: true },
      { x: 'Liburan ke Bali!', go: 21 },
      { x: 'Dapat bonus dari tetangga', cash: 50 },
      { x: 'Servis motor', cash: -80 },
      { x: 'Pulang kampung ke Pekanbaru', go: 23 }
    ],
    dana: [
      { x: 'Ulang tahun! Terima 20 dari setiap pemain', each: 20 },
      { x: 'Bayar uang sekolah', cash: -100 },
      { x: 'Tabungan cair', cash: 150 },
      { x: 'Menang arisan!', cash: 120 },
      { x: 'Biaya dokter', cash: -60 },
      { x: 'Jual barang bekas', cash: 40 },
      { x: 'Traktir teman, bayar 30 ke setiap pemain', each: -30 }
    ]
  };
  const MP_COL = ['#FF4D4D', '#2DB84D', '#1F7FE0', '#F7B500'];
  const MP_DARK = ['#A31F18', '#16772D', '#0E4F99', '#A06A00'];
  const sewa = (st, i) => { const tl = MP_TILES[i], o = st.own[i]; if (o === undefined || o === null) return 0; const full = MP_TILES.every((x, k) => x.g !== tl.g || st.own[k] === o); return Math.round(tl.p * .35 / 5) * 5 * (full ? 2 : 1); };
  const Mono = {
    init(n) {
      return { n, pos: Array(n).fill(0), cash: Array(n).fill(MP_START_CASH), own: {}, jail: Array(n).fill(0), out: Array(n).fill(false), turn: 0, phase: 'roll', dice: [3, 4], round: 1, last: null, winner: null, deadline: now() + 12000, v: 1, gid: gid() };
    },
    norm(st) {
      st.pos = arr(st.pos).map(Number); st.cash = arr(st.cash).map(Number); st.jail = arr(st.jail).map(Number); st.out = arr(st.out).map(Boolean);
      st.dice = arr(st.dice).map(Number); const o = {}; Object.keys(st.own || {}).forEach(k => { if (st.own[k] !== null && st.own[k] !== undefined) o[k] = Number(st.own[k]); }); st.own = o;
      if (st.winner === undefined) st.winner = null; if (st.last) { if (st.last.path) st.last.path = arr(st.last.path).map(Number); if (st.last.dice) st.last.dice = arr(st.last.dice).map(Number); }
      return st;
    },
    bayar(st, s, amt, to, L) {
      st.cash[s] -= amt;
      if (to !== undefined && to !== null) st.cash[to] += amt;
      if (st.cash[s] >= 0) return;
      // jual tanah (setengah harga) mulai dari yang termurah
      const milik = Object.keys(st.own).map(Number).filter(k => st.own[k] === s).sort((a, b) => MP_TILES[a].p - MP_TILES[b].p);
      for (const k of milik) { if (st.cash[s] >= 0) break; st.cash[s] += Math.round(MP_TILES[k].p / 2); delete st.own[k]; (L.sold = L.sold || []).push(k); }
      if (st.cash[s] < 0) {
        if (to !== undefined && to !== null) st.cash[to] += st.cash[s];   // penerima hanya dapat sebanyak yang ada
        st.cash[s] = 0; st.out[s] = true; L.bankrupt = s;
        Object.keys(st.own).forEach(k => { if (st.own[k] === s) delete st.own[k]; });
      }
    },
    mendarat(st, s, L, depth) {
      const i = st.pos[s], tl = MP_TILES[i];
      if (tl.t === 'kota') {
        const o = st.own[i];
        if (o === undefined) { if (st.cash[s] >= tl.p) { st.phase = 'buy'; return; } L.cantBuy = true; }
        else if (o !== s && !st.out[o]) { const r = sewa(st, i); L.rent = { to: o, amt: r, tile: i }; this.bayar(st, s, r, o, L); }
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
        if (mv.buy && st.own[i] === undefined && st.cash[a] >= MP_TILES[i].p) { st.cash[a] -= MP_TILES[i].p; st.own[i] = a; L.buy = i; } else L.skipBuy = i;
        this.lanjut(st);
      } else if (st.phase === 'jail' && (mv.pay || mv.wait)) {
        if (mv.pay && st.cash[a] >= 50) { st.cash[a] -= 50; st.jail[a] = 0; st.phase = 'roll'; L.payJail = true; st.deadline = now() + 12000; }
        else { st.jail[a] = 0; L.waitJail = true; this.lanjut(st); }
      } else return st;
      st.last = L; st.v++;
      return st;
    },
    bot(st, s) {
      if (st.phase === 'buy') { const p = MP_TILES[st.pos[s]].p; return st.cash[s] - p >= 120 || Math.random() < .25 && st.cash[s] >= p ? { buy: true } : { skip: true }; }
      if (st.phase === 'jail') return st.cash[s] > 400 ? { pay: true } : { wait: true };
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
  function renderMono(box, st, ctx) {
    st = Mono.norm(clone(st));
    const A = ctx.anim || {};
    const pos = A.pos || st.pos;
    const me = ctx.mySeat;
    const myTurn = ctx.canAct && st.turn === me && st.winner === null && !ctx.spectator && !ctx.anim;
    const chips = Array.from({ length: st.n }, (_, s) => `<div class="gp-chip mp-chip ${st.turn === s && st.winner === null ? 'turn' : ''} ${st.out[s] ? 'out' : ''}" style="--c:${MP_COL[s]}"><span class="mp-pawn sm" style="--c:${MP_COL[s]};--d:${MP_DARK[s]}"></span><div><b>${esc(seatName(ctx, s))}</b><small>${st.out[s] ? 'Bangkrut' : fmt((A.cash || st.cash)[s])}</small></div></div>`).join('');
    // papan
    let cells = '';
    MP_TILES.forEach((tl, i) => {
      const [r, c] = mpCell(i);
      const o = st.own[i];
      const corner = i % 6 === 0;
      const hi = A.hi === i || (!A.hi && A.hi !== 0 && st.winner === null && i === pos[st.turn]);
      cells += `<div class="mp-cell ${corner ? 'corner' : ''} t-${tl.t} ${hi ? 'hi' : ''}" style="grid-row:${r + 1};grid-column:${c + 1}">
        ${tl.g ? `<span class="mp-band" style="background:${MP_GRP[tl.g]}"></span>` : ''}
        ${tl.ic ? `<span class="mp-ic">${tl.ic}</span>` : ''}<span class="mp-nm">${tl.sn || tl.n}</span>
        ${tl.t === 'kota' ? `<span class="mp-pr">${o !== undefined ? '' : tl.p}</span>` : ''}
        ${o !== undefined ? `<span class="mp-own" style="background:${MP_COL[o]}"></span>` : ''}</div>`;
    });
    const cnt = {}; pos.forEach((p, s) => { if (!st.out[s]) cnt[p] = (cnt[p] || 0) + 1; });
    const seen = {};
    const tokens = pos.map((p, s) => {
      if (st.out[s]) return '';
      const k = seen[p] = (seen[p] || 0); seen[p]++;
      const [x, y] = mpTokenXY(p, k, cnt[p]);
      const hop = A.hop === s;
      return `<span class="mp-tok ${hop ? 'hop' : ''} ${st.turn === s ? 'cur' : ''}" style="left:${x}%;top:${y}%"><span class="mp-pawn" style="--c:${MP_COL[s]};--d:${MP_DARK[s]}"></span></span>`;
    }).join('');
    // panel petak saat ini
    const curPos = pos[st.turn], tl = MP_TILES[curPos];
    const own = st.own[curPos];
    let tileInfo = `<div class="mp-tcard" style="--g:${tl.g ? MP_GRP[tl.g] : '#8E8E93'}"><div class="mp-tband">${tl.ic || '🏙️'} ${tl.n}</div><div class="mp-tbody">`;
    if (tl.t === 'kota') tileInfo += `<div>Harga <b>${fmt(tl.p)}</b></div><div>Sewa <b>${fmt(Math.round(tl.p * .35 / 5) * 5)}</b> <small>(×2 jika punya 2 kota sewarna)</small></div><div>Pemilik: <b>${own !== undefined ? esc(seatName(ctx, own)) : 'belum ada'}</b></div>`;
    else if (tl.t === 'pajak') tileInfo += `<div>Bayar pajak <b>${fmt(tl.p)}</b></div>`;
    else if (tl.t === 'start') tileInfo += `<div>Lewat START dapat gaji <b>${fmt(MP_SALARY)}</b></div>`;
    else if (tl.t === 'penjara') tileInfo += `<div>Hanya mampir 👋</div>`;
    else if (tl.t === 'kepenjara') tileInfo += `<div>Langsung masuk penjara!</div>`;
    else if (tl.t === 'parkir') tileInfo += `<div>Istirahat sebentar ☕</div>`;
    else tileInfo += `<div>Ambil kartu ${tl.n}</div>`;
    tileInfo += '</div></div>';
    // tombol
    let actions = '', status = '';
    const l = st.last;
    if (st.winner === null && !ctx.anim) {
      if (l) {
        const who = esc(seatName(ctx, l.s));
        const bits = [];
        if (l.dice) bits.push(`${who} dapat ${l.dice[0] + l.dice[1]}`);
        if (l.salary) bits.push(`gaji +${fmt(MP_SALARY)}`);
        if (l.buy !== undefined) bits.push(`${who} membeli ${MP_TILES[l.buy].n} 🏠`);
        if (l.rent) bits.push(`bayar sewa ${fmt(l.rent.amt)} ke ${esc(seatName(ctx, l.rent.to))}`);
        if (l.tax) bits.push(`bayar pajak ${fmt(l.tax)}`);
        if (l.card) bits.push(`kartu: “${MP_CARD[l.card.t][l.card.i].x}”`);
        if (l.jail) bits.push(`${who} masuk penjara 🚔`);
        if (l.waitJail) bits.push(`${who} menunggu di penjara`);
        if (l.payJail) bits.push(`${who} bayar ${fmt(50)} keluar penjara`);
        if (l.bankrupt !== undefined) bits.push(`💥 ${esc(seatName(ctx, l.bankrupt))} BANGKRUT`);
        status = bits.join(' · ');
      }
      if (myTurn) {
        if (st.phase === 'roll') actions = `<button type="button" class="btn btn-primary btn-lg btn-block mp-btn" id="mpRoll">🎲 Lempar Dadu</button><div class="mp-hint" id="mpHint"></div>`;
        else if (st.phase === 'buy') actions = `<div class="mp-q">Beli <b>${tl.n}</b> seharga <b>${fmt(tl.p)}</b>?</div><div class="mp-two"><button type="button" class="btn btn-gray btn-lg" id="mpSkip">Lewati</button><button type="button" class="btn btn-primary btn-lg" id="mpBuy">🏠 Beli</button></div><div class="mp-hint" id="mpHint"></div>`;
        else if (st.phase === 'jail') actions = `<div class="mp-q">Kamu di penjara 🚔</div><div class="mp-two"><button type="button" class="btn btn-gray btn-lg" id="mpWait">Tunggu 1 giliran</button><button type="button" class="btn btn-primary btn-lg" id="mpPay" ${st.cash[me] < 50 ? 'disabled' : ''}>Bayar ${fmt(50)}</button></div><div class="mp-hint" id="mpHint"></div>`;
      } else actions = `<div class="mp-wait">${st.phase === 'buy' ? `${esc(seatName(ctx, st.turn))} sedang menimbang beli ${tl.n}…` : st.phase === 'jail' ? `${esc(seatName(ctx, st.turn))} di penjara…` : `Giliran ${esc(seatName(ctx, st.turn))}…`}</div>`;
    }
    const card = A.card ? `<div class="mp-cardpop"><div class="mp-flip ${A.cardOpen ? 'open' : ''}"><div class="mp-cf back ${A.card.t}">${A.card.t === 'dana' ? '💝<b>DANA UMUM</b>' : '❓<b>KESEMPATAN</b>'}</div><div class="mp-cf front ${A.card.t}"><small>${A.card.t === 'dana' ? 'Dana Umum' : 'Kesempatan'}</small><b>${MP_CARD[A.card.t][A.card.i].x}</b></div></div></div>` : '';
    const flash = A.flash ? `<div class="mp-flash">${A.flash}</div>` : '';
    box.innerHTML = `<div class="gp-others">${chips}</div><div class="gp-status mp-status">${status || (st.winner === null ? `Putaran ${st.round}` : '')}</div>
      <div class="mp-stage"><div class="mp-board">${cells}<div class="mp-center"><div class="mp-logo">MONOPOLI<br><span>Nusantara</span></div><div class="mp-dice">${dieHtml('mpD1')}${dieHtml('mpD2')}</div></div>${tokens}</div>${card}${flash}</div>
      ${tileInfo}<div class="mp-act">${actions}</div>
      ${H.resultHtml(ctx, st.winner, st.reason)}`;
    const d = A.dice || st.dice;
    dieShow('mpD1', d[0], false); dieShow('mpD2', d[1], false);
    if (A.rolling) { dieShow('mpD1', d[0], true); dieShow('mpD2', d[1], true); }
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
      if (l.salary) { S.coin(); redraw(next, { pos, cash, dice: l.dice, hi: pos[l.s], flash: `💰 Lewat START +${fmt(MP_SALARY)}` }); await sleep(900); }
    }
    if (l.card) {
      const A = { pos, cash, hi: pos[l.s], card: l.card, cardOpen: false };
      redraw(next, A); S.flip(); await sleep(550);
      A.cardOpen = true; redraw(next, A); S.magic(); await sleep(1900);
      if (l.jump) { pos[l.s] = l.jump.to; redraw(next, { pos, cash, hop: l.s, hi: l.jump.to }); SFX.step(); await sleep(500); }
    }
    if (l.rent) { S.cash(); redraw(next, { pos: next.pos, hi: next.pos[l.s], flash: `💸 Sewa ${fmt(l.rent.amt)}` }); await sleep(1000); }
    if (l.tax) { S.cash(); redraw(next, { pos: next.pos, hi: next.pos[l.s], flash: `🧾 Pajak ${fmt(l.tax)}` }); await sleep(900); }
    if (l.buy !== undefined) { S.cash(); redraw(next, { pos: next.pos, hi: l.buy, flash: `🏠 ${MP_TILES[l.buy].n} terbeli!` }); await sleep(950); }
    if (l.jail) { S.jail(); redraw(next, { pos: next.pos, hi: MP_JAIL, flash: '🚔 Masuk penjara!' }); await sleep(1100); }
    if (l.bankrupt !== undefined) { SFX.capture(); redraw(next, { flash: '💥 Bangkrut!' }); await sleep(1300); }
    redraw(next);
    if (next.winner !== null && next.winner !== undefined) SFX.win();
  }
  const iconMono = '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="#E9F7EF"/><rect x="6" y="6" width="36" height="8" rx="3" fill="#E53935"/><rect x="6" y="34" width="36" height="8" rx="3" fill="#1E5BD8"/><rect x="6" y="6" width="8" height="36" rx="3" fill="#FF9800"/><rect x="34" y="6" width="8" height="36" rx="3" fill="#29B6F6"/><path d="M19 30v-7l5-4 5 4v7z" fill="#2DB84D"/><rect x="22" y="25" width="4" height="5" fill="#fff"/></svg>';
  TTG.daftarGame('monopoli', {
    meta: { name: 'Monopoli', desc: 'Keliling Nusantara, beli kota', bg: 'linear-gradient(160deg,#34C77B,#12865A)', min: 2, max: 4, nNote: 'Lewat START dapat gaji. Berhenti di kota orang bayar sewa. Main sampai tinggal 1 pemain yang tidak bangkrut.' },
    engine: Mono, render: renderMono, anim: animMono, icon: iconMono,
    css: `
    .mp-chip.out{opacity:.45;filter:grayscale(1)}
    .mp-status{font-weight:700;color:#1C1C1E;min-height:40px}
    .mp-stage{position:relative;perspective:1100px;margin:6px auto 0;width:min(100%,560px)}
    .mp-board{position:relative;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(7,1fr);gap:3px;aspect-ratio:1;background:linear-gradient(160deg,#CFEFD9,#A9DFBF);border-radius:18px;padding:5px;transform:rotateX(24deg);transform-origin:50% 60%;box-shadow:0 26px 30px -10px rgba(0,60,30,.45),0 6px 0 #6BB98A,inset 0 0 0 2px rgba(255,255,255,.6)}
    .mp-cell{position:relative;background:#FFFDF7;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;box-shadow:0 2px 0 rgba(0,0,0,.12);padding:2px;min-width:0}
    .mp-cell.corner{background:linear-gradient(160deg,#FFF4D6,#FFE1A6)}
    .mp-cell.t-kesempatan{background:#FFF1E0}.mp-cell.t-dana{background:#FCE8F3}.mp-cell.t-pajak{background:#EEF0F4}
    .mp-cell.hi{box-shadow:0 0 0 3px #FFD60A,0 4px 10px rgba(255,180,0,.6);z-index:2;animation:mphi 1s ease-in-out infinite}
    @keyframes mphi{50%{box-shadow:0 0 0 3px #FF9F0A,0 4px 14px rgba(255,140,0,.8)}}
    .mp-band{position:absolute;left:0;right:0;top:0;height:22%}
    .mp-ic{font-size:clamp(12px,4vw,20px);line-height:1}
    .mp-nm{font-size:clamp(7px,2.1vw,10.5px);font-weight:800;line-height:1.05;margin-top:22%;color:#1C1C1E;word-break:normal;overflow-wrap:normal;hyphens:manual;-webkit-hyphens:manual}
    .mp-cell.corner .mp-nm,.mp-cell:not(.t-kota) .mp-nm{margin-top:2px}
    .mp-pr{font-size:clamp(6px,1.8vw,9px);color:#6E6E73;font-weight:700}
    .mp-own{position:absolute;left:3px;right:3px;bottom:3px;height:5px;border-radius:3px;box-shadow:0 1px 2px rgba(0,0,0,.3)}
    .mp-center{grid-row:2/7;grid-column:2/7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10%;background:radial-gradient(circle at 50% 40%,#E9FBF0,#C3EBD2);border-radius:12px}
    .mp-logo{font-weight:900;font-size:clamp(16px,5vw,28px);color:#C62828;text-align:center;line-height:1;letter-spacing:.04em;transform:rotate(-8deg);text-shadow:0 2px 0 #fff,0 4px 0 rgba(0,0,0,.12)}
    .mp-logo span{font-size:.62em;color:#12865A;letter-spacing:.02em}
    .mp-dice{display:flex;gap:14px}
    .mp-die{width:clamp(32px,9vw,46px);height:clamp(32px,9vw,46px);perspective:400px}
    .mp-cube{position:relative;width:100%;height:100%;transform-style:preserve-3d}
    .mp-f{position:absolute;inset:0;background:linear-gradient(145deg,#fff,#ECECEC);border-radius:20%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:14%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
    .mp-f i{width:62%;height:62%;margin:auto;border-radius:50%}
    .mp-f i.on{background:radial-gradient(circle at 35% 35%,#555,#111)}
    .mp-f.f1 i.on{background:radial-gradient(circle at 35% 35%,#FF6B6B,#C62828)}
    .mp-f.f1{transform:translateZ(calc(clamp(32px,9vw,46px)/2))}.mp-f.f6{transform:rotateY(180deg) translateZ(calc(clamp(32px,9vw,46px)/2))}
    .mp-f.f2{transform:rotateY(90deg) translateZ(calc(clamp(32px,9vw,46px)/2))}.mp-f.f5{transform:rotateY(-90deg) translateZ(calc(clamp(32px,9vw,46px)/2))}
    .mp-f.f3{transform:rotateX(90deg) translateZ(calc(clamp(32px,9vw,46px)/2))}.mp-f.f4{transform:rotateX(-90deg) translateZ(calc(clamp(32px,9vw,46px)/2))}
    .mp-tok{position:absolute;width:0;height:0;z-index:5;transition:left .2s ease,top .2s ease}
    .mp-tok .mp-pawn{position:absolute;left:0;top:0;transform:translate(-50%,-88%) rotateX(-24deg)}
    .mp-tok.hop .mp-pawn{animation:mphop .23s ease-out}
    .mp-tok.cur .mp-pawn{filter:drop-shadow(0 0 6px rgba(255,214,10,.95))}
    @keyframes mphop{50%{transform:translate(-50%,-150%) rotateX(-24deg)}}
    .mp-pawn{display:inline-block;width:clamp(14px,4.2vw,22px);height:clamp(20px,6vw,30px);background:radial-gradient(circle at 50% 22%,#fff 0 6%,transparent 7%),radial-gradient(circle at 50% 24%,var(--c) 0 30%,transparent 31%),radial-gradient(ellipse at 50% 100%,var(--d) 0 48%,transparent 50%),linear-gradient(90deg,transparent 28%,var(--c) 29% 71%,transparent 72%);background-repeat:no-repeat;background-size:100% 100%,100% 100%,100% 40%,100% 70%;background-position:0 0,0 0,0 100%,0 30%;filter:drop-shadow(0 3px 2px rgba(0,0,0,.35))}
    .mp-pawn.sm{width:16px;height:24px;flex:none;margin-left:6px}
    .mp-tcard{margin-top:16px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:var(--shadow)}
    .mp-tband{background:var(--g);color:#fff;font-weight:900;font-size:19px;padding:10px 14px;text-shadow:0 1px 2px rgba(0,0,0,.25)}
    .mp-tbody{padding:10px 14px 12px;font-size:16px;line-height:1.55}
    .mp-tbody small{color:var(--text2)}
    .mp-act{margin-top:12px}
    .mp-btn{font-size:20px;min-height:60px}
    .mp-q{text-align:center;font-size:18px;margin-bottom:10px}
    .mp-two{display:flex;gap:10px}.mp-two .btn{flex:1;min-height:58px;font-size:18px}
    .mp-hint{text-align:center;color:var(--text2);font-size:13px;margin-top:8px}
    .mp-wait{text-align:center;color:var(--text2);font-size:17px;font-weight:700;padding:12px}
    .mp-cardpop{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9;perspective:900px}
    .mp-flip{width:min(72%,300px);aspect-ratio:1.45;position:relative;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.2,.9,.3,1);animation:mpcardin .45s cubic-bezier(.2,1.3,.4,1)}
    .mp-flip.open{transform:rotateY(180deg)}
    @keyframes mpcardin{from{transform:translateY(60px) scale(.4) rotate(-10deg);opacity:0}}
    .mp-cf{position:absolute;inset:0;border-radius:18px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:14px;text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.35);font-size:34px}
    .mp-cf b{font-size:18px;letter-spacing:.06em}
    .mp-cf.back.kesempatan{background:linear-gradient(150deg,#FFB340,#EA6A0A);color:#fff}
    .mp-cf.back.dana{background:linear-gradient(150deg,#FF7EB3,#D63384);color:#fff}
    .mp-cf.front{background:#FFFDF6;transform:rotateY(180deg);border:4px solid #EA6A0A;color:#1C1C1E}
    .mp-cf.front.dana{border-color:#D63384}
    .mp-cf.front small{font-size:13px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.08em}
    .mp-cf.front b{font-size:19px;letter-spacing:0;line-height:1.3}
    .mp-flash{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);z-index:10;background:rgba(28,28,30,.88);color:#fff;font-weight:900;font-size:20px;padding:14px 20px;border-radius:18px;white-space:nowrap;animation:mpflash 1s cubic-bezier(.2,1.3,.4,1) both}
    @keyframes mpflash{0%{transform:translate(-50%,-20%) scale(.5);opacity:0}25%{transform:translate(-50%,-50%) scale(1.05);opacity:1}100%{transform:translate(-50%,-60%) scale(1);opacity:1}}
    `
  });

  /* =====================================================================
     3. WEREWOLF (5–8 pemain, kursi kosong diisi bot; tanpa diskusi)
     ===================================================================== */
  const WW_ROLE = {
    w: { n: 'Serigala', ic: '🐺', c: '#C62828', d: 'Tiap malam pilih 1 warga untuk dimangsa. Jangan sampai ketahuan!' },
    s: { n: 'Peramal', ic: '🔮', c: '#7B3FE4', d: 'Tiap malam intip peran 1 orang. Bantu warga menemukan serigala.' },
    d: { n: 'Dokter', ic: '💉', c: '#0A84FF', d: 'Tiap malam lindungi 1 orang (boleh diri sendiri) dari serigala.' },
    v: { n: 'Warga', ic: '🧑‍🌾', c: '#2E7D32', d: 'Siang hari pilih siapa yang dicurigai sebagai serigala.' }
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
      return { iWin, html: `<div class="ww-win ${wolfWin ? 'wolf' : 'vil'}"><div class="ww-win-ic">${wolfWin ? '🐺' : '🏡'}</div><div class="pd-title" style="color:#fff">${wolfWin ? 'Serigala Menang!' : 'Warga Menang!'}</div><div class="pd-sub" style="color:rgba(255,255,255,.85)">${esc(st.reason || '')}${ctx.spectator ? '' : iWin ? ' · Timmu menang 🎉' : ' · Timmu kalah'}</div></div><div class="ww-endlist">${list}</div>` };
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
        <span class="ww-av">${seatAva(ctx, i).replace('width:32px;height:32px', 'width:54px;height:54px;font-size:22px')}${dead ? '<span class="ww-skull">💀</span>' : ''}</span>
        <span class="ww-nm">${esc(seatName(ctx, i))}</span>
        ${show ? `<span class="ww-badge" style="--rc:${r.c}">${r.ic} ${r.n}</span>` : '<span class="ww-badge unk">❔</span>'}
        ${votedBy ? `<span class="ww-votes">${'🗳️'.repeat(Math.min(votedBy, 4))}${votedBy > 4 ? '+' : ''}</span>` : ''}</button>`;
    }).join('');
    let head = '', sub = '';
    const nm = i => esc(seatName(ctx, i));
    if (st.winner !== null) { head = st.winner === 'w' ? '🐺 Serigala menang' : '🏡 Warga menang'; }
    else if (st.phase === 'intro') { head = `🌙 Malam ke-${st.night} tiba`; sub = 'Lihat peranmu. Rahasiakan dari yang lain!'; }
    else if (st.phase === 'wolf') { head = myAct ? '🐺 Pilih mangsamu malam ini' : '🐺 Serigala sedang berburu…'; sub = myAct ? 'Ketuk satu warga.' : 'Semua warga tertidur 😴'; }
    else if (st.phase === 'seer') { head = myAct ? '🔮 Pilih 1 orang untuk diintip' : '🔮 Peramal sedang meramal…'; sub = myAct ? 'Perannya akan terlihat hanya olehmu.' : 'Semua warga tertidur 😴'; }
    else if (st.phase === 'doctor') { head = myAct ? '💉 Pilih 1 orang untuk dilindungi' : '💉 Dokter sedang berjaga…'; sub = myAct ? 'Boleh melindungi diri sendiri.' : 'Semua warga tertidur 😴'; }
    else if (st.phase === 'dawn') {
      head = '☀️ Pagi hari';
      sub = st.dawn && st.dawn.killed >= 0 ? `Semalam <b>${nm(st.dawn.killed)}</b> dimangsa serigala… Ia adalah <b>${WW_ROLE[st.roles[st.dawn.killed]].n}</b>.` : st.dawn && st.dawn.saved ? 'Serigala menyerang, tapi Dokter berhasil menyelamatkan! 🎉' : 'Malam ini tidak ada korban. 🎉';
    } else if (st.phase === 'vote') { head = myAct ? '🗳️ Giliranmu memilih' : `🗳️ ${nm(st.turn)} sedang memilih…`; sub = myAct ? 'Ketuk orang yang kamu curigai sebagai serigala.' : 'Siapa yang paling dicurigai?'; }
    else if (st.phase === 'verdict') { head = '⚖️ Hasil pemilihan'; sub = st.verdict && st.verdict.out >= 0 ? `<b>${nm(st.verdict.out)}</b> diusir dari desa (${st.verdict.n} suara). Ia adalah <b>${WW_ROLE[st.roles[st.verdict.out]].ic} ${WW_ROLE[st.roles[st.verdict.out]].n}</b>.` : 'Suara seri, tidak ada yang diusir.'; }
    // info rahasia
    let secret = '';
    if (myRole && st.winner === null) {
      const r = WW_ROLE[myRole];
      let extra = '';
      if (myRole === 'w') { const mates = st.roles.map((x, i) => x === 'w' && i !== me ? i : -1).filter(i => i >= 0); if (mates.length) extra = `Temanmu: ${mates.map(nm).join(', ')}`; }
      if (myRole === 's') { const sn = Object.keys(st.seen[me] || {}); if (sn.length) extra = sn.map(k => `${nm(+k)}: ${WW_ROLE[st.seen[me][k]].ic} ${WW_ROLE[st.seen[me][k]].n}`).join(' · '); }
      secret = `<div class="ww-me" style="--rc:${r.c}"><span class="ww-me-ic">${r.ic}</span><div><small>Peranmu ${alive ? '' : '(sudah tersingkir)'}</small><b>${r.n}</b>${extra ? `<div class="ww-me-x">${extra}</div>` : ''}</div></div>`;
    }
    const intro = st.phase === 'intro' && myRole ? `<div class="ww-rolecard"><div class="ww-flip"><div class="ww-rf back">🌙<b>PERANMU</b></div><div class="ww-rf front" style="--rc:${WW_ROLE[myRole].c}"><span>${WW_ROLE[myRole].ic}</span><b>${WW_ROLE[myRole].n}</b><small>${WW_ROLE[myRole].d}</small></div></div></div>` : '';
    const stars = Array.from({ length: 26 }, (_, k) => `<i style="left:${(k * 37) % 100}%;top:${(k * 53) % 60}%;animation-delay:${(k % 7) * .3}s"></i>`).join('');
    box.innerHTML = `<div class="ww-scene ${isNight || st.phase === 'intro' ? 'night' : 'day'} ${st.phase}">
        <div class="ww-sky"><div class="ww-stars">${stars}</div><div class="ww-moon"></div><div class="ww-sun"></div><div class="ww-hill h1"></div><div class="ww-hill h2"></div><div class="ww-houses">🏠🏡🏠</div></div>
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
    const tick = () => { const left = Math.max(0, Math.ceil((st.deadline - now()) / 1000)); if (tEl) tEl.textContent = `⏳ ${left} detik (otomatis dipilih acak)`; };
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
    .ww-houses{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:30px;letter-spacing:18px;opacity:.9}
    .ww-head{text-align:center;padding:4px 70px 4px 4px;min-height:74px}
    .ww-h{font-size:21px;font-weight:900;line-height:1.25;animation:gpop .5s}
    .ww-sub{font-size:16px;margin-top:6px;opacity:.9;line-height:1.4}
    .ww-timer{font-size:13px;margin-top:6px;opacity:.75;font-weight:700}
    .ww-me{display:flex;align-items:center;gap:12px;margin:12px 0 4px;background:rgba(255,255,255,.14);border:2px solid var(--rc);border-radius:18px;padding:10px 12px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
    .ww-scene.day .ww-me{background:rgba(255,255,255,.75)}
    .ww-me-ic{font-size:34px}
    .ww-me small{display:block;font-size:12px;opacity:.8;font-weight:700}
    .ww-me b{font-size:19px}
    .ww-me-x{font-size:13px;margin-top:2px;opacity:.9}
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
