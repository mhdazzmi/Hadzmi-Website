/* Kartun untuk pop-up "berhasil" Kasir Thai Tea.
   Semua gambar dibuat dari bentuk sederhana (SVG), gaya & warna seragam (oranye thai tea, krem, cokelat).
   window.TT_CARTOONS.order[0..9]   → pop-up "Pesanan Sudah Ditambahkan"
   window.TT_CARTOONS.expense[0..9] → pop-up "Pengeluaran Sudah Ditambahkan" */
(function () {
  const O = '#5A2A07', TEA = '#F59A3C', TEA2 = '#E06A12', CREAM = '#FFF4E2', CREAM2 = '#FBE3C2', PINK = '#FF9AA2',
    GOLD = '#FFC83D', GREEN = '#34C759', ICE = '#CDEEFF', BROWN = '#8A4B14', RED = '#FF6B6B', BLUE = '#5AC8FA', LEAF = '#7ED957';
  const SW = 'stroke="' + O + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';

  function face(cx, cy, k, mood) {
    k = k || 1; mood = mood || 'smile';
    const ex = 12 * k, er = 4.6 * k;
    let eyes;
    if (mood === 'happy') eyes = `<path d="M${cx - ex - 5 * k} ${cy + 2 * k} q${5 * k} ${-8 * k} ${10 * k} 0 M${cx + ex - 5 * k} ${cy + 2 * k} q${5 * k} ${-8 * k} ${10 * k} 0" fill="none" ${SW}/>`;
    else if (mood === 'wink') eyes = `<path d="M${cx - ex - 5 * k} ${cy} q${5 * k} ${-7 * k} ${10 * k} 0" fill="none" ${SW}/><circle cx="${cx + ex}" cy="${cy}" r="${er}" fill="${O}"/>`;
    else if (mood === 'love') eyes = heart(cx - ex, cy, 5.5 * k, RED) + heart(cx + ex, cy, 5.5 * k, RED);
    else eyes = `<circle cx="${cx - ex}" cy="${cy}" r="${er}" fill="${O}"/><circle cx="${cx + ex}" cy="${cy}" r="${er}" fill="${O}"/><circle cx="${cx - ex + 1.6 * k}" cy="${cy - 1.6 * k}" r="${1.5 * k}" fill="#fff"/><circle cx="${cx + ex + 1.6 * k}" cy="${cy - 1.6 * k}" r="${1.5 * k}" fill="#fff"/>`;
    const mouth = (mood === 'open' || mood === 'happy' || mood === 'love')
      ? `<path d="M${cx - 8 * k} ${cy + 8 * k} q${8 * k} ${13 * k} ${16 * k} 0 z" fill="${RED}" stroke="${O}" stroke-width="${4 * k}" stroke-linejoin="round"/>`
      : `<path d="M${cx - 7 * k} ${cy + 8 * k} q${7 * k} ${8 * k} ${14 * k} 0" fill="none" stroke="${O}" stroke-width="${4.5 * k}" stroke-linecap="round"/>`;
    const cheeks = `<ellipse cx="${cx - 21 * k}" cy="${cy + 8 * k}" rx="${6 * k}" ry="${3.8 * k}" fill="${PINK}" opacity=".85"/><ellipse cx="${cx + 21 * k}" cy="${cy + 8 * k}" rx="${6 * k}" ry="${3.8 * k}" fill="${PINK}" opacity=".85"/>`;
    return cheeks + eyes + mouth;
  }
  function heart(x, y, r, c) {
    return `<path d="M${x} ${y + r} C${x - 2.2 * r} ${y - 0.4 * r} ${x - 1.1 * r} ${y - 1.9 * r} ${x} ${y - 0.7 * r} C${x + 1.1 * r} ${y - 1.9 * r} ${x + 2.2 * r} ${y - 0.4 * r} ${x} ${y + r} z" fill="${c || RED}"/>`;
  }
  function star(x, y, r, c) {
    return `<path d="M${x} ${y - r} Q${x + r * .18} ${y - r * .18} ${x + r} ${y} Q${x + r * .18} ${y + r * .18} ${x} ${y + r} Q${x - r * .18} ${y + r * .18} ${x - r} ${y} Q${x - r * .18} ${y - r * .18} ${x} ${y - r} z" fill="${c || GOLD}"/>`;
  }
  function confetti(seed) {
    const cols = [GOLD, TEA2, PINK, BLUE, GREEN, RED];
    let out = '', s = seed || 7;
    for (let i = 0; i < 14; i++) {
      s = (s * 9301 + 49297) % 233280; const x = 12 + (s / 233280) * 176;
      s = (s * 9301 + 49297) % 233280; const y = 8 + (s / 233280) * 60;
      s = (s * 9301 + 49297) % 233280; const a = (s / 233280) * 180;
      out += `<rect x="${x}" y="${y}" width="9" height="5" rx="2" fill="${cols[i % cols.length]}" transform="rotate(${a} ${x} ${y})"/>`;
    }
    return out;
  }
  function check(x, y, r) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${GREEN}" stroke="${O}" stroke-width="4"/><path d="M${x - r * .45} ${y} l${r * .3} ${r * .32} l${r * .55} ${-r * .6}" fill="none" stroke="#fff" stroke-width="${r * .26}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // gelas thai tea: cx tengah, top = y tutup, k = skala
  function cup(cx, top, k, mood, opts) {
    k = k || 1; opts = opts || {};
    const tw = 34 * k, bw = 26 * k, h = 92 * k, y0 = top + 14 * k, y1 = y0 + h;
    const tea = opts.tea || TEA;
    const straw = opts.noStraw ? '' : `<rect x="${cx + 4 * k}" y="${top - 34 * k}" width="${9 * k}" height="${50 * k}" rx="${4 * k}" fill="${RED}" ${SW} transform="rotate(14 ${cx + 8 * k} ${top})"/>`;
    const boba = [[-12, -14], [2, -10], [14, -16], [-4, -24], [9, -28]].map(([dx, dy]) => `<circle cx="${cx + dx * k}" cy="${y1 + dy * k}" r="${5.2 * k}" fill="#4A2508"/>`).join('');
    return straw +
      `<path d="M${cx - tw} ${y0} L${cx + tw} ${y0} L${cx + bw} ${y1} Q${cx + bw - 2 * k} ${y1 + 6 * k} ${cx + bw - 8 * k} ${y1 + 6 * k} L${cx - bw + 8 * k} ${y1 + 6 * k} Q${cx - bw + 2 * k} ${y1 + 6 * k} ${cx - bw} ${y1} Z" fill="${tea}" ${SW}/>` +
      `<path d="M${cx - tw + 3 * k} ${y0 + 4 * k} L${cx + tw - 3 * k} ${y0 + 4 * k} L${cx + tw - 6 * k} ${y0 + 24 * k} L${cx - tw + 6 * k} ${y0 + 24 * k} Z" fill="${CREAM}" opacity=".9"/>` +
      boba +
      `<path d="M${cx - tw - 6 * k} ${y0} Q${cx - tw - 6 * k} ${top - 4 * k} ${cx} ${top - 6 * k} Q${cx + tw + 6 * k} ${top - 4 * k} ${cx + tw + 6 * k} ${y0} Z" fill="#fff" ${SW}/>` +
      `<rect x="${cx - tw - 9 * k}" y="${y0 - 3 * k}" width="${(tw + 9 * k) * 2}" height="${9 * k}" rx="${4.5 * k}" fill="#fff" ${SW}/>` +
      face(cx, y0 + 46 * k, k, mood);
  }
  function arm(x1, y1, x2, y2) { return `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 8} ${x2} ${y2}" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/>`; }
  function hand(x, y) { return `<circle cx="${x}" cy="${y}" r="7" fill="${CREAM}" ${SW}/>`; }
  function bg(c) { return `<circle cx="100" cy="108" r="86" fill="${c || CREAM2}"/>`; }
  function svg(inner) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">${inner}</svg>`; }

  /* ================= PESANAN (10) ================= */
  const order = [
    // 1. Gelas boba senyum + kilau
    svg(bg() + star(40, 54, 13) + star(160, 62, 10) + star(152, 150, 8, TEA2) + cup(100, 52, 1, 'happy')),
    // 2. Gelas mengacungkan jempol
    svg(bg() + cup(92, 54, .95, 'wink') + arm(124, 120, 150, 96) + `<path d="M144 102 q2 -18 10 -18 q4 2 1 12 h12 q6 1 4 8 l-4 14 q-2 5 -8 5 h-14 z" fill="${CREAM}" ${SW}/>` + star(46, 60, 11)),
    // 3. Konfeti perayaan
    svg(bg('#FFE7C9') + confetti(11) + cup(100, 66, .92, 'open') + arm(70, 122, 48, 96) + hand(48, 94) + arm(130, 122, 152, 96) + hand(152, 94)),
    // 4. Dua gelas bersulang
    svg(bg() + cup(70, 64, .78, 'happy', { noStraw: false }) + cup(132, 64, .78, 'happy', { tea: '#7FC77A' }) + star(101, 52, 12) + `<path d="M92 40 l-6 -10 M101 36 v-12 M110 40 l6 -10" ${SW}/>`),
    // 5. Gelas bermata hati
    svg(bg('#FFE3E3') + heart(42, 64, 12) + heart(160, 54, 9) + heart(156, 150, 8, PINK) + cup(100, 54, 1, 'love')),
    // 6. Nampan + centang
    svg(bg() + cup(92, 48, .86, 'smile') + `<rect x="34" y="150" width="132" height="14" rx="7" fill="${GOLD}" ${SW}/><path d="M44 164 q56 18 112 0" fill="none" ${SW}/>` + check(152, 70, 20)),
    // 7. Gelas bermahkota "Yey"
    svg(bg() + cup(100, 66, .9, 'open', { noStraw: true }) + `<path d="M68 56 l10 -24 l12 16 l10 -22 l10 22 l12 -16 l10 24 z" fill="${GOLD}" ${SW}/><circle cx="100" cy="30" r="4" fill="${RED}"/>` + star(36, 110, 10) + star(166, 116, 9)),
    // 8. Gelas melompat + bintang
    svg(`<ellipse cx="100" cy="182" rx="40" ry="7" fill="#EBC9A0"/>` + bg('#FFF0DA') + star(30, 46, 10) + star(70, 26, 8, TEA2) + star(132, 24, 9) + star(172, 52, 11, TEA2) + cup(100, 46, .9, 'happy') + `<path d="M76 168 l-8 10 M124 168 l8 10" ${SW}/>`),
    // 9. Gelas memegang papan centang
    svg(bg() + cup(74, 56, .8, 'smile') + `<rect x="112" y="70" width="68" height="74" rx="12" fill="#fff" ${SW}/>` + check(146, 107, 22) + arm(100, 124, 116, 120) + hand(116, 120)),
    // 10. Boba menari mengelilingi gelas
    svg(bg() + cup(100, 56, .86, 'happy') + [[38, 70], [160, 74], [44, 146], [156, 150]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="#4A2508" ${SW}/>` + `<circle cx="${x - 5}" cy="${y - 3}" r="2.4" fill="#fff"/><circle cx="${x + 5}" cy="${y - 3}" r="2.4" fill="#fff"/><path d="M${x - 4} ${y + 4} q4 4 8 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`).join(''))
  ];

  /* ================= PENGELUARAN (10) ================= */
  const wallet = (x, y, k) => `<rect x="${x - 46 * k}" y="${y - 30 * k}" width="${92 * k}" height="${64 * k}" rx="${14 * k}" fill="${TEA2}" ${SW}/><rect x="${x + 14 * k}" y="${y - 10 * k}" width="${40 * k}" height="${24 * k}" rx="${10 * k}" fill="${GOLD}" ${SW}/><circle cx="${x + 30 * k}" cy="${y + 2 * k}" r="${4 * k}" fill="${O}"/>`;
  const coin = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" ${SW}/><text x="${x}" y="${y + r * .36}" text-anchor="middle" font-family="Arial" font-weight="900" font-size="${r}" fill="${BROWN}">Rp</text>`;
  const iceCube = (x, y, s, mood) => `<rect x="${x - s}" y="${y - s}" width="${2 * s}" height="${2 * s}" rx="${s * .3}" fill="${ICE}" ${SW}/><path d="M${x - s * .6} ${y - s * .55} h${s * .5}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` + face(x, y - s * .05, s / 34, mood);
  const milk = (x, y, k, mood) => `<path d="M${x - 26 * k} ${y - 20 * k} l${14 * k} ${-22 * k} h${24 * k} l${14 * k} ${22 * k} v${74 * k} h${-52 * k} z" fill="#fff" ${SW}/><rect x="${x - 26 * k}" y="${y + 8 * k}" width="${52 * k}" height="${22 * k}" fill="${BLUE}"/><path d="M${x - 26 * k} ${y - 20 * k} h${52 * k}" ${SW}/>` + face(x, y - 2 * k, .7 * k, mood);
  const expense = [
    // 1. Dompet senyum + koin
    svg(bg() + coin(48, 56, 16) + coin(150, 46, 13) + wallet(100, 118, 1.15) + face(76, 118, .8, 'happy')),
    // 2. Tas belanja (es, susu)
    svg(bg() + `<path d="M76 70 q0 -30 24 -30 q24 0 24 30" fill="none" ${SW}/><path d="M48 70 h104 l-10 104 h-84 z" fill="${TEA}" ${SW}/>` + iceCube(84, 56, 16, 'smile') + face(100, 118, 1, 'happy') + check(152, 156, 16)),
    // 3. Struk belanja dengan centang
    svg(bg() + `<path d="M58 30 h84 v138 l-10 -8 l-10 8 l-10 -8 l-10 8 l-10 -8 l-10 8 l-10 -8 l-14 8 z" fill="#fff" ${SW}/><path d="M74 104 h52 M74 120 h40 M74 136 h48" ${SW}/>` + face(100, 66, .8, 'smile') + check(146, 140, 20)),
    // 4. Troli belanja gembira
    svg(bg() + `<path d="M26 56 h22 l16 74 h84 l14 -56 h-104" fill="none" ${SW}/><path d="M56 74 h104 l-12 50 h-80 z" fill="${TEA}" ${SW}/><circle cx="76" cy="152" r="10" fill="${O}"/><circle cx="138" cy="152" r="10" fill="${O}"/>` + face(108, 98, .8, 'open') + star(162, 40, 11)),
    // 5. Celengan babi + koin
    svg(bg() + coin(100, 36, 15) + `<ellipse cx="100" cy="122" rx="58" ry="44" fill="${PINK}" ${SW}/><ellipse cx="150" cy="122" rx="12" ry="15" fill="#FFC0C5" ${SW}/><path d="M66 86 l-6 -18 l20 10 M126 82 l10 -16 l6 20" fill="${PINK}" ${SW}/><rect x="90" y="78" width="22" height="6" rx="3" fill="${O}"/><path d="M62 160 v14 M84 164 v12 M118 164 v12 M140 160 v14" ${SW}/>` + face(96, 116, .85, 'happy')),
    // 6. Buku catatan + pensil
    svg(bg() + `<rect x="50" y="42" width="92" height="124" rx="10" fill="#fff" ${SW}/><path d="M50 62 h92" ${SW}/><path d="M66 120 h58 M66 138 h44" ${SW}/>` + face(96, 92, .8, 'smile') + `<rect x="136" y="70" width="16" height="84" rx="4" fill="${GOLD}" ${SW} transform="rotate(24 144 112)"/><path d="M154 148 l-4 18 l-10 -12 z" fill="${CREAM}" ${SW}/>`),
    // 7. Keranjang (es, susu, keju, gula)
    svg(bg() + iceCube(62, 74, 15, 'smile') + `<path d="M96 52 h24 l10 16 v30 h-44 v-30 z" fill="#fff" ${SW}/><rect x="86" y="80" width="44" height="12" fill="${BLUE}"/>` + `<path d="M136 92 l34 -26 l6 34 z" fill="${GOLD}" ${SW}/><circle cx="160" cy="88" r="4" fill="${TEA2}"/>` + `<path d="M30 100 h140 l-14 70 h-112 z" fill="${TEA}" ${SW}/><path d="M50 114 h100 M58 136 h84 M66 156 h68" stroke="${TEA2}" stroke-width="5" stroke-linecap="round"/>` + face(100, 128, .8, 'happy')),
    // 8. Kalkulator tersenyum
    svg(bg() + `<rect x="56" y="30" width="88" height="140" rx="16" fill="${TEA2}" ${SW}/><rect x="70" y="44" width="60" height="30" rx="6" fill="#E8FFE8" ${SW}/>` + face(100, 59, .55, 'smile') + [0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${72 + c * 20}" y="${88 + r * 24}" width="14" height="16" rx="4" fill="${c === 2 && r === 2 ? GOLD : CREAM}" ${SW}/>`).join('')).join('')),
    // 9. Es batu & susu tos
    svg(bg() + iceCube(64, 118, 30, 'happy') + milk(140, 110, 1, 'happy') + star(102, 54, 13) + `<path d="M92 42 l-6 -10 M112 42 l6 -10" ${SW}/>`),
    // 10. Amplop uang + centang
    svg(bg() + `<rect x="34" y="66" width="132" height="90" rx="12" fill="#fff" ${SW}/><path d="M34 74 l66 44 l66 -44" fill="none" ${SW}/><rect x="60" y="48" width="80" height="40" rx="6" fill="${LEAF}" ${SW} transform="rotate(-8 100 68)"/>` + coin(100, 66, 12) + face(100, 134, .7, 'smile') + check(160, 150, 18))
  ];

  window.TT_CARTOONS = { order, expense };
})();
