/* Kartun untuk pop-up "berhasil" Kasir Thai Tea.
   Pesanan: gelas minuman tanpa boba, berwajah, dengan tanda centang. Pengeluaran: tanpa wajah & tanpa centang.
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
    const boba = opts.noBoba ? '' : [[-12, -14], [2, -10], [14, -16], [-4, -24], [9, -28]].map(([dx, dy]) => `<circle cx="${cx + dx * k}" cy="${y1 + dy * k}" r="${5.2 * k}" fill="#4A2508"/>`).join('');
    return straw +
      `<path d="M${cx - tw} ${y0} L${cx + tw} ${y0} L${cx + bw} ${y1} Q${cx + bw - 2 * k} ${y1 + 6 * k} ${cx + bw - 8 * k} ${y1 + 6 * k} L${cx - bw + 8 * k} ${y1 + 6 * k} Q${cx - bw + 2 * k} ${y1 + 6 * k} ${cx - bw} ${y1} Z" fill="${tea}" ${SW}/>` +
      (opts.noCream ? '' : `<path d="M${cx - tw + 3 * k} ${y0 + 4 * k} L${cx + tw - 3 * k} ${y0 + 4 * k} L${cx + tw - 6 * k} ${y0 + 24 * k} L${cx - tw + 6 * k} ${y0 + 24 * k} Z" fill="${CREAM}" opacity=".9"/>`) +
      boba +
      `<path d="M${cx - tw - 6 * k} ${y0} Q${cx - tw - 6 * k} ${top - 4 * k} ${cx} ${top - 6 * k} Q${cx + tw + 6 * k} ${top - 4 * k} ${cx + tw + 6 * k} ${y0} Z" fill="#fff" ${SW}/>` +
      `<rect x="${cx - tw - 9 * k}" y="${y0 - 3 * k}" width="${(tw + 9 * k) * 2}" height="${9 * k}" rx="${4.5 * k}" fill="#fff" ${SW}/>` +
      (opts.noFace ? '' : face(cx, y0 + 46 * k, k, mood));
  }
  function arm(x1, y1, x2, y2) { return `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 8} ${x2} ${y2}" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/>`; }
  function hand(x, y) { return `<circle cx="${x}" cy="${y}" r="7" fill="${CREAM}" ${SW}/>`; }
  function bg(c) { return `<circle cx="100" cy="108" r="86" fill="${c || CREAM2}"/>`; }
  function svg(inner) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">${inner}</svg>`; }

  /* ================= PESANAN (10): minuman tanpa boba, berwajah, ada centang ================= */
  const C = { thai: '#F59A3C', matcha: '#7CC46E', coklat: '#9A5A2B', taro: '#B58BE0', mango: '#FFC23D', redv: '#E4576A', vanilla: '#F6E7C8', lemon: '#FFE066', peach: '#FFAD8A', teler: '#8FD9B6' };
  const kup = (cx, top, k, mood, tea, extra) => cup(cx, top, k, mood, Object.assign({ tea, noBoba: true }, extra || {}));
  const lemonSlice = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFF3A6" ${SW}/><circle cx="${x}" cy="${y}" r="${r * .62}" fill="${GOLD}"/><path d="M${x - r * .6} ${y} h${r * 1.2} M${x} ${y - r * .6} v${r * 1.2} M${x - r * .42} ${y - r * .42} l${r * .84} ${r * .84} M${x + r * .42} ${y - r * .42} l${-r * .84} ${r * .84}" stroke="#FFF3A6" stroke-width="2.5"/>`;
  const order = [
    // 1. Thai tea tersenyum + centang
    svg(bg() + star(40, 58, 12) + star(158, 60, 9) + kup(96, 52, 1, 'happy', C.thai) + check(146, 150, 22)),
    // 2. Matcha mengedip + kilau + centang di atas
    svg(bg('#E7F6DF') + star(42, 120, 11) + star(56, 60, 8, TEA2) + kup(96, 56, .95, 'wink', C.matcha) + check(150, 64, 22)),
    // 3. Coklat mengacungkan jempol + centang
    svg(bg() + kup(86, 56, .92, 'smile', C.coklat) + arm(116, 122, 140, 98) + `<path d="M134 104 q2 -18 10 -18 q4 2 1 12 h12 q6 1 4 8 l-4 14 q-2 5 -8 5 h-14 z" fill="${CREAM}" ${SW}/>` + check(152, 156, 20)),
    // 4. Taro mengangkat papan centang
    svg(bg('#EFE4FB') + kup(78, 62, .82, 'open', C.taro) + `<rect x="118" y="44" width="62" height="62" rx="14" fill="#fff" ${SW}/>` + check(149, 75, 20) + arm(104, 120, 122, 100) + hand(122, 100)),
    // 5. Mangga ceria + bintang + centang kiri atas
    svg(bg('#FFF1C9') + star(160, 56, 12) + star(162, 140, 8, TEA2) + kup(104, 54, .95, 'happy', C.mango) + check(50, 64, 22)),
    // 6. Red velvet mata hati + centang
    svg(bg('#FFE3E3') + heart(44, 72, 11) + heart(160, 58, 8) + kup(98, 54, .95, 'love', C.redv) + check(150, 152, 21)),
    // 7. Vanilla + konfeti + centang
    svg(bg('#FFF4E2') + confetti(23) + kup(96, 64, .9, 'happy', C.vanilla) + check(148, 150, 21)),
    // 8. Lemon tea dengan irisan lemon + centang
    svg(bg('#FFF8D6') + kup(96, 56, .95, 'smile', C.lemon, { noCream: true }) + lemonSlice(56, 70, 18) + check(150, 150, 21)),
    // 9. Dua gelas bersama + centang di tengah atas
    svg(bg() + kup(64, 72, .74, 'happy', C.thai) + kup(136, 72, .74, 'happy', C.matcha) + check(100, 44, 22)),
    // 10. Peach bermahkota + centang
    svg(bg('#FFE7DC') + kup(96, 70, .88, 'open', C.peach, { noStraw: true }) + `<path d="M64 60 l10 -24 l12 16 l10 -22 l10 22 l12 -16 l10 24 z" fill="${GOLD}" ${SW}/><circle cx="96" cy="34" r="4" fill="${RED}"/>` + check(150, 152, 21))
  ];

  /* ================= PENGELUARAN (10): tanpa wajah, tanpa centang ================= */
  const wallet = (x, y, k) => `<rect x="${x - 46 * k}" y="${y - 30 * k}" width="${92 * k}" height="${64 * k}" rx="${14 * k}" fill="${TEA2}" ${SW}/><path d="M${x - 46 * k} ${y - 12 * k} h${92 * k}" stroke="#C25508" stroke-width="5"/><rect x="${x + 14 * k}" y="${y - 6 * k}" width="${40 * k}" height="${24 * k}" rx="${10 * k}" fill="${GOLD}" ${SW}/><circle cx="${x + 30 * k}" cy="${y + 6 * k}" r="${4 * k}" fill="${O}"/>`;
  const coin = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" ${SW}/><text x="${x}" y="${y + r * .36}" text-anchor="middle" font-family="Arial" font-weight="900" font-size="${r}" fill="${BROWN}">Rp</text>`;
  const note = (x, y, w, h, rot) => `<g transform="rotate(${rot || 0} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${LEAF}" ${SW}/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${h * .26}" fill="#C9F2B0" stroke="${O}" stroke-width="3"/></g>`;
  const ice = (x, y, s) => `<rect x="${x - s}" y="${y - s}" width="${2 * s}" height="${2 * s}" rx="${s * .3}" fill="${ICE}" ${SW}/><path d="M${x - s * .55} ${y - s * .5} h${s * .45} M${x - s * .55} ${y - s * .2} h${s * .2}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  const milk = (x, y, k) => `<path d="M${x - 24 * k} ${y - 18 * k} l${12 * k} ${-20 * k} h${24 * k} l${12 * k} ${20 * k} v${70 * k} h${-48 * k} z" fill="#fff" ${SW}/><rect x="${x - 24 * k}" y="${y + 6 * k}" width="${48 * k}" height="${22 * k}" fill="${BLUE}"/><path d="M${x - 24 * k} ${y - 18 * k} h${48 * k}" ${SW}/><text x="${x}" y="${y + 23 * k}" text-anchor="middle" font-family="Arial" font-weight="900" font-size="${13 * k}" fill="#fff">SUSU</text>`;
  const cheese = (x, y, k) => `<path d="M${x - 30 * k} ${y + 18 * k} l${60 * k} ${-36 * k} l${4 * k} ${36 * k} z" fill="${GOLD}" ${SW}/><circle cx="${x + 12 * k}" cy="${y + 6 * k}" r="${4 * k}" fill="#E5A800"/><circle cx="${x - 6 * k}" cy="${y + 12 * k}" r="${3 * k}" fill="#E5A800"/>`;
  const sugar = (x, y, k) => `<path d="M${x - 24 * k} ${y - 28 * k} q${24 * k} ${-10 * k} ${48 * k} 0 l${4 * k} ${58 * k} q${-28 * k} ${8 * k} ${-56 * k} 0 z" fill="#fff" ${SW}/><text x="${x}" y="${y + 8 * k}" text-anchor="middle" font-family="Arial" font-weight="900" font-size="${12 * k}" fill="${BROWN}">GULA</text>`;
  const expense = [
    // 1. Dompet + koin
    svg(bg() + coin(52, 60, 17) + coin(150, 50, 13) + coin(160, 150, 11) + wallet(100, 120, 1.2)),
    // 2. Tas belanja berisi es & susu
    svg(bg() + ice(80, 66, 18) + milk(120, 66, .8) + `<path d="M76 92 q0 -26 24 -26 q24 0 24 26" fill="none" ${SW}/><path d="M46 92 h108 l-10 84 h-88 z" fill="${TEA}" ${SW}/><path d="M60 120 h80" stroke="${TEA2}" stroke-width="6" stroke-linecap="round"/>`),
    // 3. Struk belanja
    svg(bg() + `<path d="M56 28 h88 v142 l-11 -8 l-11 8 l-11 -8 l-11 8 l-11 -8 l-11 8 l-11 -8 l-11 8 z" fill="#fff" ${SW}/><path d="M72 56 h56 M72 76 h40 M72 94 h52 M72 112 h36" ${SW}/><path d="M72 136 h56" stroke="${TEA2}" stroke-width="6" stroke-linecap="round"/><text x="100" y="158" text-anchor="middle" font-family="Arial" font-weight="900" font-size="15" fill="${BROWN}">TOTAL Rp</text>`),
    // 4. Troli belanja berisi barang
    svg(bg() + ice(82, 76, 13) + milk(116, 76, .6) + `<path d="M24 56 h22 l16 76 h86 l14 -58 h-104" fill="none" ${SW}/><path d="M54 86 h108 l-12 46 h-84 z" fill="${TEA}" ${SW}/><circle cx="76" cy="154" r="10" fill="${O}"/><circle cx="140" cy="154" r="10" fill="${O}"/>`),
    // 5. Tumpukan koin + uang kertas
    svg(bg() + note(38, 54, 92, 50, -12) + note(70, 72, 92, 50, 8) + [0, 1, 2, 3].map(i => `<ellipse cx="74" cy="${160 - i * 14}" rx="30" ry="10" fill="${GOLD}" ${SW}/>`).join('') + coin(146, 150, 18)),
    // 6. Buku catatan + pensil
    svg(bg() + `<rect x="48" y="38" width="96" height="128" rx="10" fill="#fff" ${SW}/><path d="M48 60 h96" ${SW}/>${[0, 1, 2, 3, 4].map(i => `<circle cx="60" cy="${50 + i * 0}" r="0"/>`).join('')}<path d="M64 82 h60 M64 102 h48 M64 122 h56 M64 142 h36" ${SW}/>` + `<rect x="138" y="66" width="16" height="88" rx="4" fill="${GOLD}" ${SW} transform="rotate(24 146 110)"/><path d="M156 148 l-4 18 l-10 -12 z" fill="${CREAM}" ${SW}/>`),
    // 7. Keranjang (es, susu, keju, gula)
    svg(bg() + ice(58, 76, 15) + milk(96, 74, .62) + sugar(132, 80, .62) + cheese(160, 88, .55) + `<path d="M28 102 h144 l-14 70 h-116 z" fill="${TEA}" ${SW}/><path d="M48 118 h104 M56 138 h88 M64 158 h72" stroke="${TEA2}" stroke-width="5" stroke-linecap="round"/>`),
    // 8. Kalkulator
    svg(bg() + `<rect x="56" y="28" width="88" height="144" rx="16" fill="${TEA2}" ${SW}/><rect x="70" y="42" width="60" height="32" rx="6" fill="#E8FFE8" ${SW}/><text x="124" y="66" text-anchor="end" font-family="Arial" font-weight="900" font-size="16" fill="${O}">Rp</text>` + [0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${72 + c * 20}" y="${88 + r * 26}" width="14" height="18" rx="4" fill="${c === 2 && r === 2 ? GOLD : CREAM}" ${SW}/>`).join('')).join('')),
    // 9. Bahan belanja: es, susu, keju, gula
    svg(bg() + milk(72, 98, 1) + sugar(134, 104, .95) + ice(58, 150, 17) + cheese(132, 152, .8) + star(170, 50, 10)),
    // 10. Amplop uang
    svg(bg() + note(52, 40, 96, 52, -8) + `<rect x="32" y="70" width="136" height="92" rx="12" fill="#fff" ${SW}/><path d="M32 78 l68 46 l68 -46" fill="none" ${SW}/>` + coin(100, 132, 16))
  ];

  // Logo "Chat Semua": gelas thai tea tanpa wajah
  const chatLogo = svg(`<circle cx="100" cy="100" r="100" fill="#FFE7C9"/>` + cup(100, 46, 1.05, 'smile', { noFace: true }));

  window.TT_CARTOONS = { order, expense, chatLogo };
})();
