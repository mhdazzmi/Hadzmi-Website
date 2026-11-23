// Lekat — statistik: hari ini, kalender, ulasan, perkiraan beban, jumlah kartu, interval, retensi, FSRS, jam belajar.
(function (G) {
  'use strict';
  const { DB, Col, UI } = G;
  const { $, $$, esc, icon } = UI;
  const st = { range: 30, deckId: 0 };

  // Grafik batang satu seri (satu hue), tooltip saat hover/tap
  function bars(data, opts) {
    opts = opts || {};
    const W = 360, H = opts.h || 150, padL = 26, padB = 18, n = data.length;
    const max = Math.max(1, ...data.map(d => d.v));
    const nice = niceMax(max);
    const bw = (W - padL) / n, gap = Math.min(2, bw * 0.2);
    const grid = [0, 0.5, 1].map(f => { const y = H - padB - (H - padB - 6) * f; return `<line class="grid" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis" x="${padL - 5}" y="${y + 3}" text-anchor="end">${fmtNum(nice * f)}</text>`; }).join('');
    const labEvery = Math.ceil(n / 6);
    const rects = data.map((d, i) => {
      const h = (H - padB - 6) * d.v / nice, x = padL + i * bw, y = H - padB - h;
      const r = Math.min(4, (bw - gap) / 2, h);
      const path = h > 0 ? `M${x + gap / 2},${H - padB} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - gap - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
      return `<g data-i="${i}"><rect class="hit" x="${x}" y="0" width="${bw}" height="${H - padB}"/>${path ? `<path class="bar ${opts.alt ? 'alt' : ''}" d="${path}"/>` : ''}${i % labEvery === 0 ? `<text class="axis" x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(d.l)}</text>` : ''}</g>`;
    }).join('');
    return { html: `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'grafik')}">${grid}${rects}</svg></div>`, data };
  }
  function niceMax(m) { const p = Math.pow(10, Math.floor(Math.log10(m))); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= m) return k * p; return m; }
  function fmtNum(x) { return x >= 1000 ? (x / 1000).toFixed(x >= 10000 ? 0 : 1) + 'k' : String(Math.round(x * 10) / 10); }
  function bindTips(card, data) {
    const tip = document.createElement('div'); tip.className = 'chart-tip hidden'; card.appendChild(tip);
    const svg = card.querySelector('svg');
    const show = (g) => {
      const i = +g.dataset.i; const d = data[i];
      svg.querySelectorAll('.bar.hl').forEach(x => x.classList.remove('hl'));
      const b = g.querySelector('.bar'); if (b) b.classList.add('hl');
      tip.innerHTML = d.tip; tip.classList.remove('hidden');
      const r = g.querySelector('.hit').getBoundingClientRect(), cr = card.getBoundingClientRect();
      tip.style.left = Math.min(cr.width - 60, Math.max(60, r.left - cr.left + r.width / 2)) + 'px';
      tip.style.top = (svg.getBoundingClientRect().top - cr.top + 10) + 'px';
    };
    svg.addEventListener('pointerover', e => { const g = e.target.closest('g[data-i]'); if (g) show(g); });
    svg.addEventListener('pointerdown', e => { const g = e.target.closest('g[data-i]'); if (g) show(g); });
    svg.addEventListener('pointerleave', () => { tip.classList.add('hidden'); svg.querySelectorAll('.bar.hl').forEach(x => x.classList.remove('hl')); });
  }
  const dname = (day) => new Date(Col.dayStart(day) + 12 * 3600000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  function render(v) {
    const today = Col.today(), now = Date.now();
    const deck = st.deckId ? DB.get('decks', st.deckId) : null;
    const cards = deck ? Col.studyCards(deck) : DB.list('cards');
    const cids = new Set(cards.map(c => c.id));
    const logsAll = DB.list('revlog').filter(r => cids.has(r.cid) && r.type !== 3);
    const range = st.range || 3650;
    const since = today - range + 1;
    const logs = logsAll.filter(r => Col.dayOf(r.id) >= since);
    const tLogs = logsAll.filter(r => Col.dayOf(r.id) === today);
    const tCorrect = tLogs.filter(r => r.ease > 1).length;
    const tMin = Math.round(tLogs.reduce((a, r) => a + (r.time || 0), 0) / 60000);

    // per hari
    const perDay = new Map(); logs.forEach(r => { const d = Col.dayOf(r.id); perDay.set(d, (perDay.get(d) || 0) + 1); });
    const days = Math.min(range, Math.max(7, logs.length ? today - Math.min(...logs.map(r => Col.dayOf(r.id))) + 1 : 7));
    const revData = []; for (let d = today - days + 1; d <= today; d++) revData.push({ l: dname(d), v: perDay.get(d) || 0, tip: `<b>${dname(d)}</b><br>${perDay.get(d) || 0} ulasan` });
    // forecast
    const fDays = Math.min(range, 60) < 30 ? 30 : Math.min(range, 60);
    const fc = new Array(fDays).fill(0);
    cards.forEach(c => { if (c.suspended) return; if (c.state === 'review') { const d = Math.max(0, c.due - today); if (d < fDays) fc[d]++; } else if (c.state === 'learning' || c.state === 'relearning') { const d = Math.max(0, Col.dayOf(c.due) - today); if (d < fDays) fc[d]++; } });
    const fcData = fc.map((v2, i) => ({ l: i === 0 ? 'Hari ini' : '+' + i, v: v2, tip: `<b>${i === 0 ? 'Hari ini' : dname(today + i)}</b><br>${v2} kartu jatuh tempo` }));
    // jumlah kartu
    const cnt = { new: 0, learn: 0, relearn: 0, young: 0, mature: 0, susp: 0 };
    cards.forEach(c => { if (c.suspended) cnt.susp++; else if (c.state === 'new') cnt.new++; else if (c.state === 'learning') cnt.learn++; else if (c.state === 'relearning') cnt.relearn++; else if (c.ivl >= 21) cnt.mature++; else cnt.young++; });
    const CNT = [['new', 'Belum dipelajari', '#0A84FF'], ['learn', 'Sedang dihafal', '#FF9500'], ['relearn', 'Belajar lagi (sempat lupa)', '#FF3B30'], ['young', 'Mulai hafal (< 21 hari)', '#34C759'], ['mature', 'Sudah hafal (≥ 21 hari)', '#1E7A35'], ['susp', 'Disembunyikan', '#8E8E93']];
    const total = cards.length || 1;
    // interval
    const ivls = cards.filter(c => c.state === 'review' && !c.suspended).map(c => c.ivl);
    const buckets = [[1, 1], [2, 3], [4, 7], [8, 14], [15, 30], [31, 60], [61, 120], [121, 365], [366, 1e9]];
    const ivData = buckets.map(([a, b]) => { const n = ivls.filter(x => x >= a && x <= b).length; const l = b > 1e8 ? '>1th' : a === b ? a + 'h' : a + '–' + b; return { l, v: n, tip: `<b>${l} hari</b><br>${n} kartu` }; });
    // retensi
    const rv = logs.filter(r => r.type === 1);
    const young = rv.filter(r => r.lastIvl < 21), mature = rv.filter(r => r.lastIvl >= 21);
    const pct = (a) => a.length ? Math.round(a.filter(r => r.ease > 1).length / a.length * 1000) / 10 + '%' : '–';
    // FSRS
    const withS = cards.filter(c => c.s && c.state !== 'new' && !c.suspended);
    const avgR = withS.length ? withS.reduce((a, c) => a + Col.retr(c, now), 0) / withS.length : null;
    const dData = []; for (let i = 0; i < 10; i++) { const n = withS.filter(c => Math.min(9, Math.floor((c.d - 1) / 0.9)) === i).length; dData.push({ l: (i * 10) + '%', v: n, tip: `<b>Difficulty ${i * 10}–${i * 10 + 10}%</b><br>${n} kartu` }); }
    // jam
    const hours = new Array(24).fill(0).map(() => [0, 0]);
    logs.forEach(r => { const h = new Date(r.id).getHours(); hours[h][0]++; if (r.ease > 1) hours[h][1]++; });
    const hData = hours.map(([n, ok], h) => ({ l: h + '', v: n, tip: `<b>Jam ${h}:00</b><br>${n} ulasan · ${n ? Math.round(ok / n * 100) : 0}% benar` }));
    // tombol
    const btn = (type) => { const a = logs.filter(r => r.type === type); return [1, 2, 3, 4].map(g => a.filter(r => r.ease === g).length); };
    // heatmap
    const allDays = new Map(); logsAll.forEach(r => { const d = Col.dayOf(r.id); allDays.set(d, (allDays.get(d) || 0) + 1); });
    const weeks = 26; const dow = (new Date(Col.dayStart(today) + 12 * 3600000).getDay() + 6) % 7;
    const startDay = today - dow - (weeks - 1) * 7;
    const maxD = Math.max(1, ...[...allDays.values()]);
    let heat = ''; for (let d = startDay; d < startDay + weeks * 7; d++) { const n = allDays.get(d) || 0; const l = d > today ? 'fut' : n === 0 ? '' : 'l' + Math.min(4, Math.ceil(n / maxD * 4)); heat += `<i class="${l}" title="${dname(d)}: ${n} ulasan"></i>`; }
    const activeDays = [...allDays.keys()].filter(d => d >= since).length;
    let streak = 0; { let d = today; if (!allDays.has(d)) d--; while (allDays.has(d)) { streak++; d--; } }

    const rev = bars(revData, { label: 'Ulasan per hari' }), fcb = bars(fcData, { label: 'Perkiraan', alt: true }), ivb = bars(ivData, { label: 'Interval' }), db = bars(dData, { label: 'Difficulty', h: 120 }), hb = bars(hData, { label: 'Jam', h: 120 });
    const decks = Col.decks().filter(d => !d.filtered);
    v.innerHTML = `
      <div class="navbar"></div>
      <h1 class="large-title">Progres</h1>
      <div class="list" style="margin-bottom:10px"><div class="row"><div class="grow">Deck</div><select id="stDeck"><option value="0">Seluruh koleksi</option>${decks.map(d => `<option value="${d.id}" ${d.id === st.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div></div>
      ${UI.seg('range', [[30, '1 bulan'], [90, '3 bulan'], [365, '1 tahun'], [0, 'Semua']], st.range)}
      <div class="summary-card">
        <div><b>${cnt.mature}</b><span>kartu sudah hafal</span></div>
        <div><b>${rv.length ? pct(rv) : '–'}</b><span>tingkat ingat saat diulang</span></div>
        <div><b>${(fc[1] || 0)}</b><span>kartu muncul besok</span></div>
      </div>
      <div class="section-h"><span>Hari ini</span></div>
      <div class="tiles">
        <div class="tile"><div class="v">${tLogs.length}</div><div class="k">${icon('check')} kartu dijawab</div></div>
        <div class="tile"><div class="v">${tMin}<span style="font-size:16px"> mnt</span></div><div class="k">${icon('clock')} waktu belajar</div></div>
        <div class="tile"><div class="v">${tLogs.length ? Math.round(tCorrect / tLogs.length * 100) : 0}%</div><div class="k">${icon('sparkle')} benar</div></div>
        <div class="tile"><div class="v">${streak}</div><div class="k">${icon('flame')} hari beruntun</div></div>
      </div>
      <div class="section-h"><span>Kalender</span><span>${activeDays} hari aktif</span></div>
      <div class="chart-card"><div class="heat">${heat}</div><div class="heat-legend">Sedikit <i style="background:var(--fill)"></i><i class="l1" style="background:#B3D7FF"></i><i style="background:#66AFFF"></i><i style="background:#0A84FF"></i><i style="background:#0058B8"></i> Banyak</div></div>
      <div class="section-h"><span>Aktivitas</span></div>
      <div class="chart-card" id="cRev"><h3>Kartu dijawab per hari</h3><div class="cap">Total ${logs.length} · rata-rata ${(logs.length / Math.max(1, days)).toFixed(1)}/hari</div>${rev.html}</div>
      <div class="chart-card" id="cFc" style="margin-top:10px"><h3>Jadwal ke depan</h3><div class="cap">Kartu yang akan muncul ${fDays} hari ke depan · rata-rata ${(fc.reduce((a, b) => a + b, 0) / fDays).toFixed(1)}/hari · besok ${fc[1] || 0}</div>${fcb.html}</div>
      <div class="section-h"><span>Kartu</span><span>${cards.length} total</span></div>
      <div class="chart-card"><h3>Jumlah kartu</h3>
        <div class="stack-bar">${CNT.filter(([k]) => cnt[k]).map(([k, l, c]) => `<i style="width:${cnt[k] / total * 100}%;background:${c}" title="${l}: ${cnt[k]}"></i>`).join('')}</div>
        <table class="stat-table">${CNT.map(([k, l, c]) => `<tr><td><span class="legend"><span><i style="background:${c}"></i>${l}</span></span></td><td>${cnt[k]} <span class="muted" style="font-weight:400">(${Math.round(cnt[k] / total * 100)}%)</span></td></tr>`).join('')}</table></div>
      <div class="chart-card" id="cIv" style="margin-top:10px"><h3>Jarak ulang kartu</h3><div class="cap">${ivls.length ? `Rata-rata ${(ivls.reduce((a, b) => a + b, 0) / ivls.length).toFixed(1)} hari · terpanjang ${Math.max(...ivls)} hari` : 'Belum ada kartu review'}</div>${ivb.html}</div>
      <details class="adv"><summary>Detail lanjutan (retensi, tombol, FSRS)</summary>
      <div class="section-h"><span>Retensi</span></div>
      <div class="chart-card"><h3>True retention</h3><div class="cap">Persentase kartu review yang diingat (Hard/Good/Easy) dalam periode ini</div>
        <table class="stat-table"><tr><td>Muda (interval &lt; 21 hari)</td><td>${pct(young)} <span class="muted" style="font-weight:400">· ${young.length}</span></td></tr><tr><td>Matang (≥ 21 hari)</td><td>${pct(mature)} <span class="muted" style="font-weight:400">· ${mature.length}</span></td></tr><tr><td>Semua review</td><td>${pct(rv)}</td></tr>
        <tr><td>Rata-rata retrievability saat ini (FSRS)</td><td>${avgR == null ? '–' : Math.round(avgR * 1000) / 10 + '%'}</td></tr></table></div>
      <div class="chart-card" style="margin-top:10px"><h3>Tombol jawaban</h3>
        <table class="stat-table"><tr style="color:var(--label2)"><td>Tipe</td><td>Again · Hard · Good · Easy</td></tr>
        ${[[0, 'Learning'], [1, 'Review'], [2, 'Relearning']].map(([t, l]) => { const b = btn(t); const s = b.reduce((x, y) => x + y, 0); return `<tr><td>${l}</td><td>${b.join(' · ')}${s ? ` <span class="muted" style="font-weight:400">(${Math.round((s - b[0]) / s * 100)}% benar)</span>` : ''}</td></tr>`; }).join('')}</table></div>
      <div class="section-h"><span>FSRS</span></div>
      <div class="chart-card" id="cD"><h3>Distribusi difficulty</h3><div class="cap">${withS.length ? `Rata-rata ${Math.round(withS.reduce((a, c) => a + (c.d - 1) / 9, 0) / withS.length * 100)}% · stabilitas rata-rata ${(withS.reduce((a, c) => a + c.s, 0) / withS.length).toFixed(1)} hari` : 'Belum ada data'}</div>${db.html}</div>
      <div class="chart-card" id="cH" style="margin-top:10px"><h3>Jam belajar</h3><div class="cap">Jumlah ulasan per jam (ketuk batang untuk % benar)</div>${hb.html}</div></details>`;
    bindTips($('#cRev', v), rev.data); bindTips($('#cFc', v), fcb.data); bindTips($('#cIv', v), ivb.data); bindTips($('#cD', v), db.data); bindTips($('#cH', v), hb.data);
    UI.bindSeg(v, (n, val) => { st.range = +val; render(v); });
    $('#stDeck', v).onchange = e => { st.deckId = +e.target.value; render(v); };
  }
  G.Stats = { render };
})(window);
