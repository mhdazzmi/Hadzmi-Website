// Lekat — mesin penjadwalan: FSRS-5 + SM-2 (gaya Anki v3), fuzz, dan optimizer FSRS sederhana.
(function (G) {
  'use strict';
  const MIN = 60000, DAY_MS = 86400000;
  const FSRS_DEFAULT = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ---------- FSRS ----------
  const fsrs = {
    R(t, S) { return Math.pow(1 + FACTOR * t / S, DECAY); },
    interval(S, r, maxIvl) { const i = S / FACTOR * (Math.pow(r, 1 / DECAY) - 1); return clamp(Math.round(i), 1, maxIvl || 36500); },
    S0(w, g) { return Math.max(0.1, w[g - 1]); },
    D0(w, g) { return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10); },
    nextD(w, D, g) {
      const dd = -w[6] * (g - 3);
      const Dp = D + dd * (10 - D) / 9;
      return clamp(w[7] * fsrs.D0(w, 4) + (1 - w[7]) * Dp, 1, 10);
    },
    sRecall(w, D, S, R, g) {
      const hard = g === 2 ? w[15] : 1, easy = g === 4 ? w[16] : 1;
      return S * (Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) * hard * easy + 1);
    },
    sForget(w, D, S, R) {
      const s = w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
      return Math.min(s, S / Math.exp(w[17] * w[18]));
    },
    sShort(w, S, g) {
      let inc = Math.exp(w[17] * (g - 3 + w[18]));
      if (g >= 3) inc = Math.max(1, inc);
      return S * inc;
    },
    // Memperbarui memori (S,D) dari satu jawaban. elapsedDays = hari sejak ulasan terakhir.
    step(w, mem, g, elapsedDays) {
      if (!mem || !mem.s) return { s: fsrs.S0(w, g), d: fsrs.D0(w, g) };
      const D = mem.d, S = mem.s;
      let s;
      if (elapsedDays < 1) s = fsrs.sShort(w, S, g);
      else {
        const R = fsrs.R(elapsedDays, S);
        s = g === 1 ? fsrs.sForget(w, D, S, R) : fsrs.sRecall(w, D, S, R, g);
      }
      return { s: clamp(s, 0.01, 36500), d: fsrs.nextD(w, D, g) };
    }
  };

  // ---------- Fuzz (rentang ala Anki) ----------
  function fuzzRange(ivl) {
    if (ivl < 2.5) return [ivl, ivl];
    let delta = 1;
    const ranges = [[2.5, 7, 0.15], [7, 20, 0.1], [20, Infinity, 0.05]];
    for (const [a, b, f] of ranges) delta += f * Math.max(0, Math.min(ivl, b) - a);
    return [Math.max(2, Math.round(ivl - delta)), Math.round(ivl + delta)];
  }
  function fuzz(ivl, on, seed) {
    ivl = Math.round(ivl);
    if (!on || ivl < 3) return ivl;
    const [a, b] = fuzzRange(ivl);
    const r = seed == null ? Math.random() : seed;
    return a + Math.floor(r * (b - a + 1));
  }

  // ---------- Inti penjadwal ----------
  // card: {state:'new'|'learning'|'review'|'relearning', step, ivl(hari), ease, s, d, due, lastReview(ms), reps, lapses}
  // opt: preset deck. Mengembalikan {card, log} tanpa menyentuh input.
  function answer(card, g, opt, now, today, dayStartMs, seed) {
    const c = Object.assign({}, card);
    const w = (opt.w && opt.w.length === 19) ? opt.w : FSRS_DEFAULT;
    const useFsrs = opt.algorithm === 'fsrs';
    const maxIvl = opt.maxIvl || 36500;
    const learn = opt.learnSteps && opt.learnSteps.length ? opt.learnSteps : [1, 10];
    const relearn = opt.relearnSteps || [10];
    const prevState = c.state, prevIvl = c.ivl || 0, prevEase = c.ease || opt.startEase || 2.5;
    const elapsed = c.lastReview ? Math.max(0, (dayOf(now, dayStartMs) - dayOf(c.lastReview, dayStartMs))) : 0;
    const elapsedReal = c.lastReview ? (now - c.lastReview) / DAY_MS : 0;
    const logType = prevState === 'new' || prevState === 'learning' ? 0 : prevState === 'review' ? 1 : 2;

    // FSRS: selalu perbarui memori (juga saat SM-2 aktif, supaya bisa pindah algoritma kapan saja)
    const mem = fsrs.step(w, c.s ? { s: c.s, d: c.d } : null, g, c.lastReview ? (elapsed >= 1 ? elapsed : elapsedReal >= 1 ? 1 : 0) : 0);
    const R = c.s && c.lastReview ? fsrs.R(Math.max(elapsed, 0), c.s) : null;
    c.s = mem.s; c.d = mem.d;

    const fsrsIvl = (S) => fsrs.interval(S, opt.retention || 0.9, maxIvl);
    const setLearn = (mins) => { c.due = now + mins * MIN; };
    const toReview = (ivl) => {
      ivl = clamp(Math.round(ivl), 1, maxIvl);
      c.state = 'review'; c.step = 0; c.ivl = ivl; c.due = today + ivl;
    };
    const hardStep = (steps, i) => {
      if (i === 0) return steps.length > 1 ? (steps[0] + steps[1]) / 2 : Math.min(steps[0] * 1.5, steps[0] + 1440);
      return steps[i];
    };

    c.reps = (c.reps || 0) + 1;
    if (prevState === 'new') { c.state = 'learning'; c.step = 0; c.ease = opt.startEase || 2.5; }

    if (c.state === 'learning' || c.state === 'relearning') {
      const steps = c.state === 'learning' ? learn : relearn;
      const relearning = c.state === 'relearning';
      const gradIvl = () => {
        if (relearning) {
          if (useFsrs) return Math.min(fsrsIvl(c.s), Math.max(1, c.ivl || 1));
          return Math.max(1, c.ivl || 1);
        }
        return useFsrs ? fsrsIvl(c.s) : (opt.gradIvl || 1);
      };
      if (g === 1) { c.step = 0; setLearn(steps[0] || 1); }
      else if (g === 2) { setLearn(hardStep(steps, c.step || 0)); }
      else if (g === 3) {
        const next = (c.step || 0) + 1;
        if (next >= steps.length) toReview(fuzz(gradIvl(), opt.fuzz !== false, seed));
        else { c.step = next; setLearn(steps[next]); }
      } else {
        let ivl;
        if (relearning) ivl = Math.max(gradIvl() + 1, useFsrs ? fsrsIvl(c.s) : (c.ivl || 1) + 1);
        else ivl = useFsrs ? Math.max(fsrsIvl(c.s), fsrsIvl(fsrs.step(w, null, 3).s) + 1) : (opt.easyIvl || 4);
        toReview(fuzz(ivl, opt.fuzz !== false, seed));
      }
    } else if (c.state === 'review') {
      const ivl = Math.max(1, c.ivl || 1);
      const delay = Math.max(0, today - (c.due || today));
      if (g === 1) {
        c.lapses = (c.lapses || 0) + 1;
        c.ease = Math.max(1.3, prevEase - 0.2);
        const newIvl = useFsrs ? fsrsIvl(c.s) : Math.max(opt.minLapseIvl || 1, Math.round(ivl * (opt.lapseNewIvl || 0)));
        c.ivl = Math.max(1, newIvl);
        if (relearn.length) { c.state = 'relearning'; c.step = 0; setLearn(relearn[0]); }
        else toReview(c.ivl);
      } else {
        let hard, good, easy;
        if (useFsrs) {
          const base = { s: card.s || mem.s, d: card.d || mem.d };
          const sFor = (gg) => fsrs.step(w, card.s ? base : null, gg, elapsed).s;
          hard = fsrsIvl(sFor(2)); good = fsrsIvl(sFor(3)); easy = fsrsIvl(sFor(4));
          hard = Math.min(hard, good); good = Math.max(good, hard + 1); easy = Math.max(easy, good + 1);
        } else {
          const mod = opt.ivlMod || 1;
          hard = Math.max(ivl + 1, ivl * (opt.hardIvl || 1.2) * mod);
          good = Math.max(hard + 1, (ivl + delay / 2) * prevEase * mod);
          easy = Math.max(good + 1, (ivl + delay) * prevEase * (opt.easyBonus || 1.3) * mod);
        }
        const pick = g === 2 ? hard : g === 3 ? good : easy;
        if (g === 2) c.ease = Math.max(1.3, prevEase - 0.15);
        if (g === 4) c.ease = prevEase + 0.15;
        toReview(fuzz(Math.min(pick, maxIvl), opt.fuzz !== false, seed));
      }
    }
    c.lastReview = now;
    const leech = g === 1 && prevState === 'review' && opt.leechThreshold && c.lapses >= opt.leechThreshold && (c.lapses - opt.leechThreshold) % Math.ceil(opt.leechThreshold / 2) === 0;
    const log = { id: now, ease: g, type: logType, ivl: c.state === 'review' ? c.ivl : -Math.round((c.due - now) / 1000), lastIvl: prevIvl, factor: Math.round((c.ease || 0) * 1000), s: c.s, d: c.d, r: R, elapsed };
    return { card: c, log, leech };
  }

  function dayOf(ms, dayStartMs) { return Math.floor((ms - dayStartMs) / DAY_MS); }

  // Pratinjau interval untuk 4 tombol (tanpa fuzz)
  function preview(card, opt, now, today, dayStartMs) {
    const out = {};
    for (const g of [1, 2, 3, 4]) {
      const r = answer(card, g, Object.assign({}, opt, { fuzz: false }), now, today, dayStartMs, 0.5).card;
      out[g] = r.state === 'review' ? { days: r.due - today } : { mins: Math.max(1, Math.round((r.due - now) / MIN)) };
    }
    return out;
  }
  function fmtIvl(p) {
    if (!p) return '';
    const n = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',').replace(/,0$/, '');
    if (p.mins != null) {
      const m = p.mins;
      if (m < 60) return m + ' mnt';
      if (m < 1440) return n(m / 60) + ' jam';
      return Math.round(m / 1440) + ' hari';
    }
    const d = p.days;
    if (d < 30) return d + ' hari';
    if (d < 365) return n(d / 30) + ' bln';
    return n(d / 365) + ' thn';
  }

  // ---------- Optimizer FSRS (coordinate descent pada log-loss) ----------
  // histories: Array<Array<{t:ms, g:1..4}>> urut waktu per kartu.
  function buildItems(histories, dayStartMs) {
    const items = [];
    for (const h of histories) {
      if (h.length < 2) continue;
      // hanya kartu yang riwayatnya dimulai dari kartu baru (tidak ada data lama yang hilang)
      items.push(h.map(x => ({ day: dayOf(x.t, dayStartMs), g: x.g })));
    }
    return items;
  }
  function loss(w, items) {
    let L = 0, n = 0;
    for (const h of items) {
      let mem = null, last = null;
      for (const r of h) {
        const el = last == null ? 0 : r.day - last;
        if (mem && el >= 1) {
          const p = clamp(fsrs.R(el, mem.s), 1e-4, 1 - 1e-4);
          const y = r.g > 1 ? 1 : 0;
          L -= y * Math.log(p) + (1 - y) * Math.log(1 - p); n++;
        }
        mem = fsrs.step(w, mem, r.g, last == null ? 0 : el);
        last = r.day;
      }
    }
    return n ? { loss: L / n, n } : { loss: NaN, n: 0 };
  }
  const BOUNDS = [[0.01, 100], [0.01, 100], [0.01, 100], [0.01, 100], [1, 10], [0.001, 4], [0.001, 4], [0.001, 0.75], [0, 4.5], [0, 0.8], [0.001, 3.5], [0.001, 5], [0.001, 0.25], [0.001, 0.9], [0, 4], [0, 1], [1, 6], [0, 2], [0, 2]];
  async function optimize(histories, dayStartMs, start, onProgress) {
    const items = buildItems(histories, dayStartMs);
    let w = (start && start.length === 19 ? start : FSRS_DEFAULT).slice();
    let best = loss(w, items);
    if (best.n < 50) return { ok: false, reason: 'Butuh minimal ±50 ulasan antar-hari (saat ini ' + best.n + ').', n: best.n };
    const before = best.loss;
    const passes = 4;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < 19; i++) {
        let stepSize = (BOUNDS[i][1] - BOUNDS[i][0]) * 0.05 / (p + 1);
        for (let k = 0; k < 6; k++) {
          let improved = false;
          for (const dir of [1, -1]) {
            const t = w.slice(); t[i] = clamp(t[i] + dir * stepSize, BOUNDS[i][0], BOUNDS[i][1]);
            const l = loss(t, items);
            if (l.loss < best.loss - 1e-6) { w = t; best = l; improved = true; break; }
          }
          if (!improved) stepSize /= 2;
        }
        if (onProgress) onProgress((p * 19 + i + 1) / (passes * 19));
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return { ok: true, w: w.map(x => Math.round(x * 10000) / 10000), before, after: best.loss, n: best.n };
  }

  G.Sched = { answer, preview, fmtIvl, fsrs, FSRS_DEFAULT, fuzz, fuzzRange, optimize, loss, DAY_MS, MIN };
})(window);
