/* =========================================================
   NEXA SOCIAL — 20 pilihan logo (ikon app gaya iOS, SVG 100×100)
   window.NS_LOGOS: daftar logo · window.nsLogoSVG(key, size): markup SVG
   ========================================================= */
(function () {
'use strict';
const W = '#fff';
const LOGOS = [
  { k: 'bubble', n: 'Chat Spark', g: ['#FF2D55', '#AF52DE'],
    s: `<path d="M27 28h46a11 11 0 0 1 11 11v21a11 11 0 0 1-11 11H47L33 82V71h-6a11 11 0 0 1-11-11V39a11 11 0 0 1 11-11z" fill="${W}"/><path d="M50 36.5l3.6 9.2 9.2 3.6-9.2 3.6L50 62.1l-3.6-9.2-9.2-3.6 9.2-3.6z" fill="url(#G)"/>` },
  { k: 'megaphone', n: 'Megaphone', g: ['#FF9F0A', '#FF375F'],
    s: `<path d="M22 44v13a5 5 0 0 0 5 5h7l22 13V26L34 39h-7a5 5 0 0 0-5 5z" fill="${W}"/><path d="M34 62l4 14" stroke="${W}" stroke-width="7" stroke-linecap="round"/><path d="M65 40a13 13 0 0 1 0 21M72 31a25 25 0 0 1 0 39" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round"/>` },
  { k: 'mono', n: 'Monogram N', g: ['#0A84FF', '#5E5CE6'],
    s: `<path d="M29 75V25h11.5l19 29.5V25H71v50H59.5l-19-29.5V75z" fill="${W}"/>` },
  { k: 'calendar', n: 'Kalender', g: ['#FF3B30', '#FF9500'],
    s: `<rect x="22" y="26" width="56" height="52" rx="10" fill="${W}"/><rect x="22" y="26" width="56" height="13" rx="6" fill="${W}" opacity=".55"/><path d="M36 20v12M64 20v12" stroke="${W}" stroke-width="6" stroke-linecap="round"/><path d="M50 69s-12-7.3-12-15.3c0-4 3-6.7 6.3-6.7 2.4 0 4.4 1.3 5.7 3.3 1.3-2 3.3-3.3 5.7-3.3 3.3 0 6.3 2.7 6.3 6.7C62 61.7 50 69 50 69z" fill="url(#G)"/>` },
  { k: 'grid', n: 'Feed Grid', g: ['#5856D6', '#AF52DE'],
    s: [0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${24 + c * 18}" y="${24 + r * 18}" width="15" height="15" rx="4" fill="${W}" opacity="${[1, .7, .45, .7, 1, .7, .45, .7, 1][r * 3 + c]}"/>`).join('')).join('') },
  { k: 'micleaf', n: 'Mic Leaf', g: ['#34C759', '#30B0C7'],
    s: `<rect x="38" y="20" width="22" height="38" rx="11" fill="${W}"/><path d="M29 49a20 20 0 0 0 40 0M49 69v10M39 80h20" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round"/><path d="M64 26c8-6 17-5 17-5s1 9-5 16c-4 4-9 4-11 3-1-3-1-9-1-14z" fill="${W}" opacity=".85"/>` },
  { k: 'leaf', n: 'Leaf', g: ['#1F7A4D', '#34C759'],
    s: `<path d="M24 76c0-30 19-52 54-52 0 33-20 54-50 54" fill="${W}"/><path d="M26 76l30-30" stroke="url(#G)" stroke-width="5" stroke-linecap="round"/>` },
  { k: 'orbit', n: 'Orbit', g: ['#1C1C1E', '#48484A'],
    s: `<circle cx="50" cy="50" r="13" fill="${W}"/><ellipse cx="50" cy="50" rx="31" ry="13" fill="none" stroke="${W}" stroke-width="4.5" transform="rotate(-28 50 50)" opacity=".85"/><circle cx="75" cy="37" r="5" fill="#FF9F0A"/>` },
  { k: 'stack', n: 'Stack', g: ['#FF9500', '#FF2D55'],
    s: `<rect x="34" y="20" width="40" height="40" rx="10" fill="${W}" opacity=".45"/><rect x="29" y="28" width="40" height="40" rx="10" fill="${W}" opacity=".7"/><rect x="24" y="36" width="40" height="40" rx="10" fill="${W}"/>` },
  { k: 'plane', n: 'Paper Plane', g: ['#32ADE6', '#007AFF'],
    s: `<path d="M20 48l58-25-20 58-11-22z" fill="${W}"/><path d="M47 59l31-36" stroke="url(#G)" stroke-width="4" stroke-linecap="round" opacity=".7"/>` },
  { k: 'sunrise', n: 'Sunrise', g: ['#FFCC00', '#FF9500'],
    s: `<path d="M27 64a23 23 0 0 1 46 0z" fill="${W}"/><path d="M20 72h60" stroke="${W}" stroke-width="6" stroke-linecap="round"/><path d="M50 26v8M27 37l6 6M73 37l-6 6M18 56h7M82 56h-7" stroke="${W}" stroke-width="5.5" stroke-linecap="round"/>` },
  { k: 'heart', n: 'Love', g: ['#FF2D55', '#FF6B81'],
    s: `<path d="M50 78S20 60 20 40c0-10 7.5-17 16-17 6 0 11 3.3 14 8.3 3-5 8-8.3 14-8.3 8.5 0 16 7 16 17 0 20-30 38-30 38z" fill="${W}"/>` },
  { k: 'hash', n: 'Hashtag', g: ['#5E5CE6', '#0A84FF'],
    s: `<path d="M40 22l-6 56M64 22l-6 56M24 40h56M21 61h56" stroke="${W}" stroke-width="8" stroke-linecap="round"/>` },
  { k: 'play', n: 'Play', g: ['#FF3B30', '#FF2D55'],
    s: `<path d="M38 27.5c0-4 4.4-6.4 7.8-4.3l30 20.5c3 2 3 6.6 0 8.6l-30 20.5c-3.4 2.1-7.8-.3-7.8-4.3z" fill="${W}"/>` },
  { k: 'sparkle', n: 'Sparkles', g: ['#AF52DE', '#5856D6'],
    s: `<path d="M44 22l5.5 15.5L65 43l-15.5 5.5L44 64l-5.5-15.5L23 43l15.5-5.5z" fill="${W}"/><path d="M70 54l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="${W}" opacity=".8"/><path d="M71 22l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" fill="${W}" opacity=".65"/>` },
  { k: 'check', n: 'Check', g: ['#34C759', '#00C7BE'],
    s: `<circle cx="50" cy="50" r="28" fill="none" stroke="${W}" stroke-width="7"/><path d="M37 51l9 9 18-19" fill="none" stroke="${W}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` },
  { k: 'wave', n: 'Soundwave', g: ['#00C7BE', '#007AFF'],
    s: [[24, 16], [34, 30], [44, 46], [54, 24], [64, 38], [74, 18]].map(([x, h]) => `<rect x="${x - 3.5}" y="${50 - h / 2 - 4}" width="7" height="${h + 8}" rx="3.5" fill="${W}"/>`).join('') },
  { k: 'bolt', n: 'Bolt', g: ['#FFCC00', '#FF9F0A'],
    s: `<path d="M55 18L27 56h20l-5 26 30-39H52z" fill="${W}"/>` },
  { k: 'bloom', n: 'Bloom', g: ['#FF9500', '#FF2D55', '#AF52DE'],
    s: [0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="50" cy="33" rx="10" ry="15" fill="${W}" opacity=".55" transform="rotate(${a} 50 50)"/>`).join('') + `<circle cx="50" cy="50" r="7" fill="${W}"/>` },
  { k: 'minimal', n: 'Minimal', g: ['#FFFFFF', '#E9E9EE'], light: true,
    s: `<defs><linearGradient id="T" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF2D55"/><stop offset="1" stop-color="#5856D6"/></linearGradient></defs><path d="M29 75V25h11.5l19 29.5V25H71v50H59.5l-19-29.5V75z" fill="url(#T)"/>` }
];
let seq = 0;
function logoSVG(key, size) {
  const L = LOGOS.find(x => x.k === key) || LOGOS[0];
  const id = 'nsl' + (++seq);
  const stops = L.g.map((c, i) => `<stop offset="${L.g.length === 1 ? 0 : i / (L.g.length - 1)}" stop-color="${c}"/>`).join('');
  const glyph = L.s.replace(/url\(#G\)/g, `url(#${id}g)`).replace(/id="T"/g, `id="${id}t"`).replace(/url\(#T\)/g, `url(#${id}t)`);
  return `<svg class="ns-logo" width="${size || 60}" height="${size || 60}" viewBox="0 0 100 100" role="img" aria-label="Logo ${L.n}"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs><rect width="100" height="100" rx="22.5" fill="url(#${id}g)"/>${L.light ? '<rect x=".5" y=".5" width="99" height="99" rx="22" fill="none" stroke="rgba(0,0,0,.08)"/>' : ''}${glyph}</svg>`;
}
window.NS_LOGOS = LOGOS;
window.nsLogoSVG = logoSVG;
window.NS_DEFAULT_LOGO = 'bubble';
})();
