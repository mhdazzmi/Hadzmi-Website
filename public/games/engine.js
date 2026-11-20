/* =========================================================
   Nexo Games — mesin aturan "Nexo Kota Dunia" v2
   Gaya "bangun kota": beli tanah → 3 rumah → landmark, ambil alih kota lawan,
   festival, tur dunia, kartu keberuntungan, menang monopoli.
   Dipakai di server (Durable Object, sumber kebenaran) dan di browser (tampilan).
   ========================================================= */

export const ENGINE = 2;
const RB = 1000, JT = 1000000;
export const N = 32;                 // jumlah petak
export const SALARY = 2 * JT;        // lewat START
export const JAIL_POS = 8, FEST_POS = 16, TOUR_POS = 24;
export const JAIL_FINE = 500 * RB;
export const MAX_PLAYERS = 10;
export const LEVEL_NAMES = ['Tanah', '1 Rumah', '2 Rumah', '3 Rumah', 'Landmark'];
const TOLL_MULT = [0.3, 0.9, 1.8, 3.0, 4.5];
const round10 = n => Math.round(n / (10 * RB)) * 10 * RB;

export const GROUPS = {
  g1: { name: 'Afrika & Timur Tengah', color: '#B08155' },
  g2: { name: 'Asia Tenggara', color: '#5AC8FA' },
  g3: { name: 'Pantai & Musim Panas', color: '#FF2D92' },
  g4: { name: 'Eropa Klasik', color: '#FF9500' },
  g5: { name: 'Asia Timur', color: '#FF3B30' },
  g6: { name: 'Ikon Dunia', color: '#FFCC00' },
  g7: { name: 'Kota Megah', color: '#34C759' },
  g8: { name: 'Kota Termahal', color: '#3634A3' }
};

// wiki = judul artikel Wikipedia (bahasa Inggris) untuk foto asli kota/landmark
const C = (name, country, icon, group, price, landmark, wiki, sound) => ({ type: 'city', name, country, icon, group, price: price * RB, landmark, wiki, sound });
export const SPACES = [
  { type: 'start', name: 'START', sound: 'start' },
  C('Kairo', 'Mesir', 'pyramid', 'g1', 500, 'Piramida Giza', 'Giza_pyramid_complex', 'cairo'),
  { type: 'card', name: 'Kartu' },
  C('Istanbul', 'Turki', 'mosque', 'g1', 600, 'Hagia Sophia', 'Hagia_Sophia', 'istanbul'),
  { type: 'air', name: 'Bandara Soekarno-Hatta', short: 'CGK', price: 2 * JT, wiki: 'Soekarno–Hatta_International_Airport', sound: 'airport' },
  C('Bangkok', 'Thailand', 'wat', 'g2', 800, 'Wat Arun', 'Wat_Arun', 'bangkok'),
  C('Kuala Lumpur', 'Malaysia', 'petronas', 'g2', 800, 'Menara Petronas', 'Petronas_Towers', 'kl'),
  C('Jakarta', 'Indonesia', 'monas', 'g2', 1000, 'Monas', 'National_Monument_(Indonesia)', 'jakarta'),
  { type: 'jail', name: 'Penjara', sound: 'jail' },
  C('Rio de Janeiro', 'Brasil', 'christ', 'g3', 1200, 'Kristus Penebus', 'Christ_the_Redeemer_(statue)', 'rio'),
  { type: 'card', name: 'Kartu' },
  C('Sydney', 'Australia', 'opera', 'g3', 1200, 'Gedung Opera Sydney', 'Sydney_Opera_House', 'sydney'),
  C('Barcelona', 'Spanyol', 'sagrada', 'g3', 1400, 'Sagrada Família', 'Sagrada_Família', 'barcelona'),
  { type: 'air', name: 'Bandara Changi', short: 'SIN', price: 2 * JT, wiki: 'Singapore_Changi_Airport', sound: 'changi' },
  C('Berlin', 'Jerman', 'gate', 'g4', 1600, 'Gerbang Brandenburg', 'Brandenburg_Gate', 'berlin'),
  C('Roma', 'Italia', 'colosseum', 'g4', 1800, 'Colosseum', 'Colosseum', 'rome'),
  { type: 'festival', name: 'Festival', sound: 'festival' },
  C('Seoul', 'Korea Selatan', 'ntower', 'g5', 2000, 'N Seoul Tower', 'N_Seoul_Tower', 'seoul'),
  { type: 'card', name: 'Kartu' },
  C('Singapura', 'Singapura', 'mbs', 'g5', 2000, 'Marina Bay Sands', 'Marina_Bay_Sands', 'singapore'),
  C('Hong Kong', 'Tiongkok', 'hk', 'g5', 2200, 'Victoria Harbour', 'Victoria_Harbour', 'hongkong'),
  { type: 'air', name: 'Bandara Haneda', short: 'HND', price: 2 * JT, wiki: 'Haneda_Airport', sound: 'airport' },
  C('Agra', 'India', 'taj', 'g6', 2400, 'Taj Mahal', 'Taj_Mahal', 'agra'),
  C('San Francisco', 'Amerika Serikat', 'goldengate', 'g6', 2600, 'Golden Gate', 'Golden_Gate_Bridge', 'sf'),
  { type: 'tour', name: 'Tur Dunia', sound: 'tour' },
  C('Dubai', 'Uni Emirat Arab', 'burj', 'g7', 2800, 'Burj Khalifa', 'Burj_Khalifa', 'dubai'),
  C('Tokyo', 'Jepang', 'tokyotower', 'g7', 2800, 'Tokyo Tower', 'Tokyo_Tower', 'tokyo'),
  C('Paris', 'Prancis', 'eiffel', 'g7', 3000, 'Menara Eiffel', 'Eiffel_Tower', 'paris'),
  { type: 'tax', name: 'Pajak', sound: 'tax' },
  { type: 'air', name: 'Bandara JFK', short: 'JFK', price: 2 * JT, wiki: 'John_F._Kennedy_International_Airport', sound: 'airport' },
  C('London', 'Inggris', 'bigben', 'g8', 3500, 'Big Ben', 'Big_Ben', 'london'),
  C('New York', 'Amerika Serikat', 'liberty', 'g8', 4000, 'Patung Liberty', 'Statue_of_Liberty', 'newyork')
];
SPACES.forEach((s, i) => { s.i = i; if (!s.short) s.short = s.name.replace('Rio de Janeiro', 'Rio').replace('San Francisco', 'San Fran').replace('Kuala Lumpur', 'K. Lumpur'); if (s.type === 'city') s.key = s.icon; if (s.type === 'air') s.key = 'air' + s.short; });
export const OWNABLE = new Set(['city', 'air']);
export const AIRPORTS = SPACES.filter(s => s.type === 'air').map(s => s.i);
export const groupSpaces = g => SPACES.filter(s => s.group === g).map(s => s.i);
export const sideOf = i => (i % 8 === 0 ? -1 : Math.floor(i / 8));
const SIDE_PROPS = [0, 1, 2, 3].map(sd => SPACES.filter(s => OWNABLE.has(s.type) && sideOf(s.i) === sd).map(s => s.i));

export const houseCost = pos => round10(SPACES[pos].price * 0.5);
export const landmarkCost = pos => round10(SPACES[pos].price * 1.5);
export function stepCost(pos, toLevel) { return toLevel === 0 ? SPACES[pos].price : toLevel === 4 ? landmarkCost(pos) : houseCost(pos); }
export function buildCost(pos, from, to) { let c = 0; for (let l = from + 1; l <= to; l++) c += stepCost(pos, l); return c; }

// ---------- Kartu Keberuntungan (semuanya menguntungkan) ----------
export const CARDS = [
  { id: 'shield', icon: '😇', title: 'Perisai Malaikat', text: 'Batalkan 1x bayar sewa di kota lawan. Disimpan & dipakai otomatis.', keep: true, color: ['#FFD60A', '#FF9F0A'] },
  { id: 'shield', icon: '😇', title: 'Perisai Malaikat', text: 'Batalkan 1x bayar sewa di kota lawan. Disimpan & dipakai otomatis.', keep: true, color: ['#FFD60A', '#FF9F0A'] },
  { id: 'discount', icon: '🏷️', title: 'Kupon Diskon 50%', text: 'Sewa berikutnya cuma setengah harga. Dipakai otomatis.', keep: true, color: ['#64D2FF', '#0A84FF'] },
  { id: 'discount', icon: '🏷️', title: 'Kupon Diskon 50%', text: 'Sewa berikutnya cuma setengah harga. Dipakai otomatis.', keep: true, color: ['#64D2FF', '#0A84FF'] },
  { id: 'jailfree', icon: '🗝️', title: 'Kunci Bebas Penjara', text: 'Keluar dari penjara kapan saja tanpa bayar.', keep: true, color: ['#BF5AF2', '#5E5CE6'] },
  { id: 'bonus', icon: '💰', title: 'Bonus Akhir Tahun', text: 'Terima Rp 1 jt dari bank!', amount: 1 * JT, color: ['#30D158', '#00A86B'] },
  { id: 'dividend', icon: '📈', title: 'Dividen Properti', text: 'Terima Rp 300 rb untuk setiap properti milikmu (minimal Rp 600 rb).', color: ['#30D158', '#0A84FF'] },
  { id: 'lottery', icon: '🎰', title: 'Menang Undian', text: 'Hadiah acak Rp 500 rb – Rp 3 jt!', color: ['#FF375F', '#FF9F0A'] },
  { id: 'salary', icon: '💵', title: 'Gaji Tambahan', text: 'Terima gaji ekstra Rp 2 jt.', amount: 2 * JT, color: ['#34C759', '#30B0C7'] },
  { id: 'fly', icon: '✈️', title: 'Tiket Pesawat Gratis', text: 'Pilih petak mana saja di papan dan terbang ke sana sekarang!', color: ['#5AC8FA', '#5856D6'] },
  { id: 'fly', icon: '✈️', title: 'Tiket Pesawat Gratis', text: 'Pilih petak mana saja di papan dan terbang ke sana sekarang!', color: ['#5AC8FA', '#5856D6'] },
  { id: 'festival', icon: '🎉', title: 'Panggung Festival', text: 'Pilih kotamu untuk jadi tuan rumah festival: sewanya ×2!', color: ['#FF2D92', '#AF52DE'] },
  { id: 'renov', icon: '🏗️', title: 'Renovasi Gratis', text: 'Naikkan 1 level bangunan di salah satu kotamu, gratis!', color: ['#FF9F0A', '#FF453A'] },
  { id: 'renov', icon: '🏗️', title: 'Renovasi Gratis', text: 'Naikkan 1 level bangunan di salah satu kotamu, gratis!', color: ['#FF9F0A', '#FF453A'] },
  { id: 'storm', icon: '🌪️', title: 'Badai Tropis', text: 'Turunkan 1 level bangunan di kota lawan (landmark kebal).', color: ['#8E8E93', '#3A3A3C'] },
  { id: 'swap', icon: '🔄', title: 'Tukar Kota', text: 'Tukar satu kotamu dengan satu kota lawan (tanpa landmark).', color: ['#00C7BE', '#007AFF'] },
  { id: 'start', icon: '⚡', title: 'Kilat ke START', text: 'Langsung ke START: terima gaji & bonus renovasi gratis.', color: ['#FFD60A', '#34C759'] }
];

export const PLAYER_COLORS = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#00C7BE', '#FFCC00',
  '#5856D6', '#A2845E', '#30B0C7', '#8E8E93', '#1C1C1E', '#FF6482', '#64D2FF', '#7D7AFF'];
export const COLOR_NAMES = { '#007AFF': 'Biru', '#FF3B30': 'Merah', '#34C759': 'Hijau', '#FF9500': 'Oranye', '#AF52DE': 'Ungu', '#FF2D55': 'Pink', '#00C7BE': 'Mint', '#FFCC00': 'Kuning',
  '#5856D6': 'Indigo', '#A2845E': 'Cokelat', '#30B0C7': 'Teal', '#8E8E93': 'Abu', '#1C1C1E': 'Hitam', '#FF6482': 'Salem', '#64D2FF': 'Langit', '#7D7AFF': 'Lavender' };

// ---------- Format ----------
export function rp(n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  let s;
  if (n >= JT) { const v = n / JT; s = (Number.isInteger(v) ? String(v) : v.toFixed(v >= 100 ? 0 : 2).replace(/0+$/, '').replace(/\.$/, '')).replace('.', ',') + ' jt'; }
  else if (n >= RB) s = Math.round(n / RB) + ' rb';
  else s = String(n);
  return (neg ? '-' : '') + 'Rp ' + s;
}

// ---------- Utilitas ----------
class GameError extends Error { constructor(m) { super(m); this.user = true; } }
const fail = m => { throw new GameError(m); };
export const player = (g, id) => g.players.find(p => p.id === id);
export const current = g => player(g, g.order[g.turn]);
const alive = g => g.players.filter(p => !p.bankrupt);
const pname = (g, id) => (player(g, id) || {}).name || 'Pemain';
function log(g, text, kind = 'info') {
  g.logSeq = (g.logSeq || 0) + 1;
  g.log.push({ id: g.logSeq, ts: g._now || Date.now(), text, kind });
  if (g.log.length > 150) g.log.splice(0, g.log.length - 150);
}
function notify(g, to, title, body, tag) { (g._notify = g._notify || []).push({ to, title, body, tag }); }
// efek suara/animasi untuk klien
function fx(g, type, data = {}) {
  if (g._fxAction !== g.ver) { g.fx = []; g._fxAction = g.ver; g.fxSeq = (g.fxSeq || 0) + 1; }
  g.fx.push(Object.assign({ type }, data));
}
export const ownerOf = (g, pos) => (g.props[pos] ? g.props[pos].owner : null);
export const levelOf = (g, pos) => (g.props[pos] ? g.props[pos].level : -1);
export const ownsGroup = (g, uid, grp) => groupSpaces(grp).every(i => ownerOf(g, i) === uid);
export const myProps = (g, uid) => Object.keys(g.props).map(Number).filter(i => g.props[i].owner === uid).sort((a, b) => a - b);

export function tollFor(g, pos) {
  const s = SPACES[pos], o = g.props[pos];
  if (!o) return 0;
  let t;
  if (s.type === 'air') { const n = AIRPORTS.filter(i => ownerOf(g, i) === o.owner).length; t = [400, 1000, 2000, 4000][n - 1] * RB; }
  else {
    t = s.price * TOLL_MULT[o.level];
    if (ownsGroup(g, o.owner, s.group)) t *= 2;
  }
  if (g.festival === pos) t *= 2;
  return round10(t);
}
export const takeoverCost = (g, pos) => (g.props[pos] ? g.props[pos].invested * 2 : 0);
export function netWorth(g, uid) {
  const p = player(g, uid); if (!p || p.bankrupt) return 0;
  return p.cash + myProps(g, uid).reduce((s, i) => s + g.props[i].invested, 0);
}
export function maxBuildLevel(g, uid, pos) {
  const s = SPACES[pos], o = g.props[pos];
  if (s.type === 'air') return o ? -1 : 0;
  if (!o) return 3;
  if (o.owner !== uid || o.level >= 4) return -1;
  return o.level < 3 ? 3 : 4;
}

// ---------- Membuat & lobi ----------
export function newGame({ id, name, host, hostName, mode, settings, now }) {
  const st = Object.assign({ startCash: 20 * JT, maxPlayers: 6, turnSec: 60, timeLimitMin: 0, monopolyWin: true }, settings || {});
  st.maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(st.maxPlayers) || 6));
  st.turnSec = Math.max(20, Math.min(300, Number(st.turnSec) || 60));
  const g = {
    engine: ENGINE, id, name: String(name || 'Room').slice(0, 40), host, mode: mode === 'live' ? 'live' : 'santai', status: 'lobby',
    createdAt: now, startedAt: null, endedAt: null, updatedAt: now, settings: st,
    players: [], order: [], turn: 0, phase: 'lobby', props: {}, debts: [], pending: null, festival: null,
    dice: null, diceSeq: 0, moves: [], moveSeq: 0, card: null, cardSeq: 0, fx: [], fxSeq: 0, rolledDouble: false,
    deck: null, log: [], logSeq: 0, deadline: null, winner: null, ranking: null, winType: null, ver: 0
  };
  addPlayer(g, host, hostName);
  log(g, `${hostName} membuat room.`, 'sys');
  return g;
}
export function addPlayer(g, uid, name, color) {
  if (g.status !== 'lobby') fail('Game sudah dimulai.');
  if (player(g, uid)) return;
  if (g.players.length >= g.settings.maxPlayers) fail('Room sudah penuh.');
  const used = new Set(g.players.map(p => p.color));
  const c = color && PLAYER_COLORS.includes(color) && !used.has(color) ? color : PLAYER_COLORS.find(x => !used.has(x));
  g.players.push({ id: uid, name, color: c, cash: 0, pos: 0, jail: false, jailTurns: 0, cards: [], bankrupt: false, dbl: 0, timeouts: 0, tour: false, laps: 0 });
}
export function removePlayer(g, uid) {
  if (g.status !== 'lobby') fail('Game sudah dimulai.');
  g.players = g.players.filter(p => p.id !== uid);
}
export function setColor(g, uid, color) {
  if (g.status !== 'lobby') fail('Warna hanya bisa diganti di lobi.');
  const p = player(g, uid); if (!p) fail('Gabung dulu ke room.');
  if (!PLAYER_COLORS.includes(color)) fail('Warna tidak tersedia.');
  if (g.players.some(o => o.id !== uid && o.color === color)) fail('Warna ini sudah dipakai teman.');
  p.color = color;
}
function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

export function startGame(g, ctx) {
  if (g.status !== 'lobby') fail('Game sudah dimulai.');
  if (g.players.length < 2) fail('Minimal 2 pemain.');
  g._now = ctx.now; g._notify = [];
  g.status = 'playing'; g.startedAt = ctx.now;
  g.players.forEach(p => { p.cash = g.settings.startCash; p.pos = 0; });
  g.order = shuffle(g.players.map(p => p.id), ctx.rng);
  g.turn = 0;
  g.deck = shuffle(CARDS.map((_, i) => i), ctx.rng);
  log(g, `Game dimulai! Urutan: ${g.order.map(id => pname(g, id)).join(' → ')}.`, 'sys');
  beginTurn(g, ctx);
}

// ---------- Giliran ----------
function setDeadline(g, ctx, mult = 1) { g.deadline = g.mode === 'live' && g.status === 'playing' ? ctx.now + g.settings.turnSec * 1000 * mult : null; }
const allTiles = () => SPACES.map(s => s.i);

function beginTurn(g, ctx) {
  const p = current(g);
  g.rolledDouble = false; p.dbl = 0; g.pending = null;
  if (p.tour) {
    p.tour = false;
    g.pending = { type: 'choose', kind: 'tour', options: allTiles().filter(i => i !== TOUR_POS), skip: true };
    g.phase = 'choose';
    notify(g, p.id, `Giliranmu di ${g.name}! ✈️`, 'Tur Dunia: pilih kota tujuanmu.', 'turn-' + g.id);
  } else {
    g.phase = 'roll';
    notify(g, p.id, `Giliranmu di ${g.name}! 🎲`, p.jail ? 'Kamu di penjara. Coba dadu dobel atau bayar.' : 'Ayo lempar dadu.', 'turn-' + g.id);
  }
  setDeadline(g, ctx);
}
function nextTurn(g, ctx) {
  if (g.status !== 'playing') return;
  if (alive(g).length <= 1) return finish(g, ctx, 'last');
  if (g.settings.timeLimitMin > 0 && ctx.now - g.startedAt >= g.settings.timeLimitMin * 60000) return finish(g, ctx, 'time');
  const n = g.order.length;
  for (let k = 1; k <= n; k++) { const idx = (g.turn + k) % n; if (!player(g, g.order[idx]).bankrupt) { g.turn = idx; break; } }
  beginTurn(g, ctx);
}
function finish(g, ctx, why, winnerId) {
  g.status = 'ended'; g.phase = 'ended'; g.endedAt = ctx.now; g.deadline = null; g.pending = null;
  const ranking = g.players.map(p => ({ id: p.id, worth: netWorth(g, p.id), bankrupt: p.bankrupt, out: p.outAt || 0 }))
    .sort((a, b) => (a.id === winnerId ? -1 : b.id === winnerId ? 1 : 0) || (a.bankrupt - b.bankrupt) || (b.worth - a.worth) || (b.out - a.out));
  g.ranking = ranking; g.winner = ranking[0] ? ranking[0].id : null; g.winType = why;
  const reason = { time: 'Waktu habis! ', host: 'Game diakhiri host. ', color: 'MONOPOLI WARNA! ', side: 'MONOPOLI JALUR! ', air: 'MONOPOLI WISATA! ' }[why] || '';
  log(g, `${reason}🏆 ${pname(g, g.winner)} menang dengan kekayaan ${rp(ranking[0].worth)}!`, 'win');
  fx(g, 'win', { uid: g.winner, why });
  g.players.forEach(p => notify(g, p.id, `${g.name} selesai 🏆`, p.id === g.winner ? 'Selamat, kamu menang!' : `${pname(g, g.winner)} menang.`, 'end-' + g.id));
}
function checkMonopoly(g, ctx, uid) {
  if (!g.settings.monopolyWin || g.status !== 'playing' || !uid) return false;
  const full = Object.keys(GROUPS).filter(k => ownsGroup(g, uid, k)).length;
  if (full >= 3) { finish(g, ctx, 'color', uid); return true; }
  if (SIDE_PROPS.some(list => list.every(i => ownerOf(g, i) === uid))) { finish(g, ctx, 'side', uid); return true; }
  if (AIRPORTS.every(i => ownerOf(g, i) === uid)) { finish(g, ctx, 'air', uid); return true; }
  return false;
}

function proceed(g, ctx) {
  if (g.status !== 'playing') return;
  if (g.debts.length) { g.phase = 'debt'; setDeadline(g, ctx, 2); return; }
  if (g.pending) { g.phase = g.pending.type; setDeadline(g, ctx); return; }
  const p = current(g);
  if (p.bankrupt) return nextTurn(g, ctx);
  if (g.rolledDouble && !p.jail && !p.tour) { g.phase = 'roll'; setDeadline(g, ctx); return; }
  nextTurn(g, ctx);
}

const die = rng => 1 + Math.floor(rng() * 6);
function addMove(g, p, from, to, kind) {
  if (g._moveAction !== g.ver) { g.moves = []; g._moveAction = g.ver; g.moveSeq++; }
  g.moves.push({ uid: p.id, from, to, kind });
}
function doRoll(g, p, ctx) {
  const d = [die(ctx.rng), die(ctx.rng)], total = d[0] + d[1], dbl = d[0] === d[1];
  g.dice = { d, seq: ++g.diceSeq, by: p.id };
  if (p.jail) {
    if (dbl) { p.jail = false; p.jailTurns = 0; g.rolledDouble = false; log(g, `${p.name} dapat dobel ${d[0]}+${d[1]} dan kabur dari penjara! 🎉`, 'roll'); moveBy(g, p, total, ctx); }
    else {
      p.jailTurns++;
      if (p.jailTurns >= 3) { p.jail = false; p.jailTurns = 0; g.rolledDouble = false; log(g, `${p.name} sudah 3 giliran di penjara, akhirnya bebas!`, 'roll'); moveBy(g, p, total, ctx); }
      else { log(g, `${p.name} melempar ${d[0]}+${d[1]}, belum dobel. Masih di penjara (${p.jailTurns}/3).`, 'roll'); g.rolledDouble = false; }
    }
    return proceed(g, ctx);
  }
  if (dbl) {
    p.dbl = (p.dbl || 0) + 1;
    if (p.dbl >= 3) { log(g, `${p.name} dobel 3 kali! Langsung masuk penjara 🚓`, 'jail'); sendToJail(g, p); return proceed(g, ctx); }
  } else p.dbl = 0;
  g.rolledDouble = dbl;
  log(g, `${p.name} melempar ${d[0]}+${d[1]} = ${total}${dbl ? ' (dobel!)' : ''}.`, 'roll');
  moveBy(g, p, total, ctx);
  proceed(g, ctx);
}
function passStart(g, p) { p.cash += SALARY; p.laps = (p.laps || 0) + 1; log(g, `${p.name} melewati START, terima gaji ${rp(SALARY)}.`, 'money'); fx(g, 'salary', { uid: p.id, amount: SALARY }); }
function moveBy(g, p, steps, ctx) {
  const from = p.pos, to = ((from + steps) % N + N) % N;
  if (steps > 0 && from + steps >= N) passStart(g, p);
  addMove(g, p, from, to, steps > 0 ? 'walk' : 'back');
  p.pos = to;
  land(g, p, ctx);
}
function flyTo(g, p, to, ctx) {
  const from = p.pos;
  if (to <= from && to !== from) passStart(g, p);
  addMove(g, p, from, to, 'fly');
  p.pos = to;
  land(g, p, ctx);
}
function sendToJail(g, p) { addMove(g, p, p.pos, JAIL_POS, 'jump'); p.pos = JAIL_POS; p.jail = true; p.jailTurns = 0; p.dbl = 0; g.rolledDouble = false; fx(g, 'jail', { uid: p.id }); }

function charge(g, from, toId, amount, reason) {
  amount = Math.round(amount);
  if (amount <= 0) return true;
  if (from.cash >= amount) { from.cash -= amount; if (toId) { const t = player(g, toId); if (t) t.cash += amount; } return true; }
  g.debts.push({ id: (g.debtSeq = (g.debtSeq || 0) + 1), from: from.id, to: toId || null, amount, reason });
  log(g, `${from.name} harus bayar ${rp(amount)} (${reason}) tapi uangnya kurang. Jual properti atau bangkrut.`, 'warn');
  notify(g, from.id, `Uangmu kurang di ${g.name} 😬`, `Kamu harus bayar ${rp(amount)}. Jual properti dulu.`, 'debt-' + g.id);
  return false;
}
function useCard(p, id) { const i = p.cards.indexOf(id); if (i < 0) return false; p.cards.splice(i, 1); return true; }
function returnCard(g, id) { const idx = CARDS.findIndex((c, i) => c.id === id && !g.deck.includes(i)); if (idx >= 0) g.deck.push(idx); }

function land(g, p, ctx) {
  const s = SPACES[p.pos];
  fx(g, 'land', { uid: p.id, pos: p.pos });
  switch (s.type) {
    case 'city': case 'air': {
      const o = g.props[p.pos];
      if (!o) {
        if (p.cash >= s.price) g.pending = { type: 'build', pos: p.pos, from: -1, max: s.type === 'air' ? 0 : 3 };
        else log(g, `${p.name} belum cukup uang untuk membeli ${s.name}.`);
        return;
      }
      if (o.owner === p.id) {
        const max = maxBuildLevel(g, p.id, p.pos);
        if (max > o.level && p.cash >= stepCost(p.pos, o.level + 1)) g.pending = { type: 'build', pos: p.pos, from: o.level, max };
        else log(g, `${p.name} mampir ke ${s.name} miliknya.`);
        return;
      }
      const owner = player(g, o.owner);
      let toll = tollFor(g, p.pos);
      if (useCard(p, 'shield')) { returnCard(g, 'shield'); log(g, `😇 Perisai Malaikat melindungi ${p.name}! Tidak bayar sewa ${rp(toll)} di ${s.name}.`, 'card'); fx(g, 'shield', { uid: p.id }); toll = 0; }
      else if (useCard(p, 'discount')) { returnCard(g, 'discount'); toll = round10(toll / 2); log(g, `🏷️ Kupon diskon dipakai, sewa jadi ${rp(toll)}.`, 'card'); }
      if (toll > 0) {
        log(g, `${p.name} bayar sewa ${rp(toll)} ke ${owner.name} (${s.name}${g.festival === p.pos ? ' 🎉 festival' : ''}).`, 'rent');
        fx(g, 'toll', { uid: p.id, to: owner.id, amount: toll, pos: p.pos });
        if (!charge(g, p, owner.id, toll, 'Sewa ' + s.name)) return;
      }
      if (o.level < 4) {
        const cost = takeoverCost(g, p.pos);
        if (p.cash >= cost) g.pending = { type: 'takeover', pos: p.pos, cost };
      }
      return;
    }
    case 'card': return drawCard(g, p, ctx);
    case 'tax': {
      const props = myProps(g, p.id).reduce((t, i) => t + g.props[i].invested, 0);
      const amt = Math.max(200 * RB, round10(props * 0.1));
      log(g, `${p.name} bayar pajak ${rp(amt)} (10% nilai properti).`, 'money');
      fx(g, 'tax', { uid: p.id, amount: amt });
      charge(g, p, null, amt, 'Pajak');
      return;
    }
    case 'jail': log(g, `${p.name} masuk penjara! 🚓 (maks 3 giliran)`, 'jail'); p.jail = true; p.jailTurns = 0; g.rolledDouble = false; fx(g, 'jail', { uid: p.id }); return;
    case 'festival': {
      const mine = myProps(g, p.id).filter(i => SPACES[i].type === 'city');
      if (mine.length) g.pending = { type: 'choose', kind: 'festival', options: mine, skip: true };
      else log(g, `${p.name} menikmati festival 🎉 (belum punya kota untuk jadi tuan rumah).`);
      return;
    }
    case 'tour': log(g, `${p.name} siap Tur Dunia ✈️ Giliran berikutnya bebas pilih tujuan.`, 'sys'); p.tour = true; g.rolledDouble = false; return;
    case 'start': {
      const opts = myProps(g, p.id).filter(i => SPACES[i].type === 'city' && g.props[i].level < 3);
      if (opts.length) { log(g, `${p.name} berhenti tepat di START: bonus renovasi gratis! 🏗️`, 'money'); g.pending = { type: 'choose', kind: 'renov', options: opts, skip: true }; }
      return;
    }
  }
}

function drawCard(g, p, ctx) {
  if (!g.deck.length) g.deck = shuffle(CARDS.map((_, i) => i).filter(i => !g.players.some(pl => pl.cards.includes(CARDS[i].id) && CARDS[i].keep)), ctx.rng);
  const idx = g.deck.shift(), c = CARDS[idx];
  g.card = { seq: ++g.cardSeq, idx, id: c.id, uid: p.id };
  log(g, `🃏 ${p.name} dapat kartu “${c.title}”.`, 'card');
  if (!c.keep) g.deck.push(idx);
  const bonus = amt => { p.cash += amt; log(g, `${p.name} menerima ${rp(amt)}.`, 'money'); fx(g, 'gain', { uid: p.id, amount: amt }); };
  const mineCities = myProps(g, p.id).filter(i => SPACES[i].type === 'city');
  switch (c.id) {
    case 'shield': case 'discount': case 'jailfree':
      p.cards.push(c.id);
      if (p.cards.length > 3) { const old = p.cards.shift(); returnCard(g, old); }
      return;
    case 'bonus': case 'salary': return bonus(c.amount);
    case 'dividend': return bonus(Math.max(600 * RB, myProps(g, p.id).length * 300 * RB));
    case 'lottery': return bonus(round10((500 + Math.floor(ctx.rng() * 26) * 100) * RB));
    case 'fly': g.pending = { type: 'choose', kind: 'fly', options: allTiles().filter(i => i !== p.pos), skip: true }; return;
    case 'festival':
      if (mineCities.length) g.pending = { type: 'choose', kind: 'festival', options: mineCities, skip: true }; else bonus(500 * RB);
      return;
    case 'renov': {
      const opts = mineCities.filter(i => g.props[i].level < 3);
      if (opts.length) g.pending = { type: 'choose', kind: 'renov', options: opts, skip: true }; else bonus(700 * RB);
      return;
    }
    case 'storm': {
      const opts = Object.keys(g.props).map(Number).filter(i => g.props[i].owner !== p.id && SPACES[i].type === 'city' && g.props[i].level > 0 && g.props[i].level < 4);
      if (opts.length) g.pending = { type: 'choose', kind: 'storm', options: opts, skip: true }; else bonus(500 * RB);
      return;
    }
    case 'swap': {
      const mine = mineCities.filter(i => g.props[i].level < 4);
      const theirs = Object.keys(g.props).map(Number).filter(i => g.props[i].owner !== p.id && SPACES[i].type === 'city' && g.props[i].level < 4);
      if (mine.length && theirs.length) g.pending = { type: 'choose', kind: 'swap1', options: mine, skip: true }; else bonus(500 * RB);
      return;
    }
    case 'start': flyTo(g, p, 0, ctx); return;
  }
}

// ---------- Kebangkrutan & utang ----------
const sellValue = (g, pos) => Math.round(g.props[pos].invested / 2);
function bankrupt(g, p, creditorId, ctx) {
  const cred = creditorId ? player(g, creditorId) : null;
  const props = myProps(g, p.id);
  if (cred && !cred.bankrupt) {
    cred.cash += Math.max(0, p.cash);
    props.forEach(i => { g.props[i].owner = cred.id; });
    log(g, `💥 ${p.name} bangkrut! Semua kotanya jadi milik ${cred.name}.`, 'bankrupt');
  } else {
    props.forEach(i => { delete g.props[i]; if (g.festival === i) g.festival = null; });
    log(g, `💥 ${p.name} bangkrut! Propertinya kembali ke bank.`, 'bankrupt');
  }
  p.cards.forEach(id => returnCard(g, id));
  p.cash = 0; p.cards = []; p.bankrupt = true; p.outAt = ctx.now; p.jail = false; p.tour = false;
  fx(g, 'bankrupt', { uid: p.id });
  g.debts = g.debts.filter(d => d.from !== p.id).map(d => d.to === p.id ? Object.assign(d, { to: null }) : d);
  if (g.pending && current(g).id === p.id) g.pending = null;
  if (alive(g).length <= 1) return finish(g, ctx, 'last');
  if (cred) checkMonopoly(g, ctx, cred.id);
}

function chooseAct(g, p, pos, ctx) {
  const pd = g.pending;
  if (!pd || pd.type !== 'choose') fail('Tidak ada pilihan.');
  if (!pd.options.includes(pos)) fail('Petak itu tidak bisa dipilih.');
  const s = SPACES[pos];
  g.pending = null;
  switch (pd.kind) {
    case 'tour': case 'fly':
      log(g, `✈️ ${p.name} terbang ke ${s.name}.`, 'sys');
      flyTo(g, p, pos, ctx); break;
    case 'festival':
      g.festival = pos; log(g, `🎉 Festival di ${s.name}! Sewanya jadi ×2.`, 'buy'); fx(g, 'festival', { pos }); break;
    case 'renov': {
      const o = g.props[pos]; o.level++; o.invested += stepCost(pos, o.level);
      log(g, `🏗️ ${p.name} merenovasi ${s.name} gratis jadi ${LEVEL_NAMES[o.level]}.`, 'build'); fx(g, 'build', { pos, level: o.level }); break;
    }
    case 'storm': {
      const o = g.props[pos]; o.invested -= stepCost(pos, o.level); o.level--;
      log(g, `🌪️ Badai menerjang ${s.name} milik ${pname(g, o.owner)}! Turun jadi ${LEVEL_NAMES[o.level]}.`, 'warn'); fx(g, 'storm', { pos }); break;
    }
    case 'swap1': {
      const theirs = Object.keys(g.props).map(Number).filter(i => g.props[i].owner !== p.id && SPACES[i].type === 'city' && g.props[i].level < 4);
      g.pending = { type: 'choose', kind: 'swap2', options: theirs, skip: true, mine: pos };
      break;
    }
    case 'swap2': {
      const a = g.props[pd.mine], b = g.props[pos], other = b.owner;
      a.owner = other; b.owner = p.id;
      log(g, `🔄 ${p.name} menukar ${SPACES[pd.mine].name} dengan ${s.name} milik ${pname(g, other)}!`, 'trade'); fx(g, 'swap', { a: pd.mine, b: pos });
      if (!checkMonopoly(g, ctx, p.id)) checkMonopoly(g, ctx, other);
      break;
    }
  }
}

// ---------- Aksi pemain ----------
export function act(g, uid, a, ctx) {
  g._now = ctx.now; g._notify = [];
  if (g.engine !== ENGINE) fail('Room ini versi lama. Buat room baru ya.');
  if (g.status !== 'playing') fail('Game tidak sedang berjalan.');
  const p = player(g, uid);
  if (!p) fail('Kamu bukan pemain di room ini.');
  if (p.bankrupt) fail('Kamu sudah bangkrut.');
  const isCur = current(g).id === uid;
  g.ver++;
  p.timeouts = 0;
  const needCur = ph => { if (!isCur || g.phase !== ph) fail('Belum giliranmu.'); };
  switch (a.type) {
    case 'roll': needCur('roll'); doRoll(g, p, ctx); break;
    case 'jail-pay':
      needCur('roll'); if (!p.jail) fail('Kamu tidak di penjara.');
      if (p.cash < JAIL_FINE) fail('Uang tidak cukup.');
      p.cash -= JAIL_FINE; p.jail = false; p.jailTurns = 0;
      log(g, `${p.name} bayar ${rp(JAIL_FINE)} dan bebas dari penjara.`, 'money'); fx(g, 'pay', { uid }); setDeadline(g, ctx); break;
    case 'jail-card':
      needCur('roll'); if (!p.jail || !useCard(p, 'jailfree')) fail('Tidak bisa sekarang.');
      returnCard(g, 'jailfree'); p.jail = false; p.jailTurns = 0;
      log(g, `🗝️ ${p.name} pakai Kunci Bebas Penjara.`, 'card'); fx(g, 'card-use', { uid }); setDeadline(g, ctx); break;
    case 'build': {
      needCur('build');
      const pd = g.pending, s = SPACES[pd.pos], to = Number(a.level);
      if (!(to > pd.from && to <= pd.max)) fail('Level tidak valid.');
      const cost = buildCost(pd.pos, pd.from, to);
      if (p.cash < cost) fail('Uangmu tidak cukup.');
      p.cash -= cost;
      if (!g.props[pd.pos]) g.props[pd.pos] = { owner: uid, level: to, invested: cost };
      else { g.props[pd.pos].level = to; g.props[pd.pos].invested += cost; }
      g.pending = null;
      const what = s.type === 'air' ? 'membeli' : pd.from < 0 ? `membeli ${s.name} (${LEVEL_NAMES[to]})` : to === 4 ? `membangun LANDMARK ${s.landmark} di` : `membangun ${LEVEL_NAMES[to]} di`;
      log(g, s.type === 'air' ? `✈️ ${p.name} membeli ${s.name} seharga ${rp(cost)}.` : `🏗️ ${p.name} ${what}${pd.from < 0 ? '' : ' ' + s.name} seharga ${rp(cost)}.`, to === 4 ? 'win' : 'buy');
      fx(g, to === 4 ? 'landmark' : pd.from < 0 ? 'buy' : 'build', { uid, pos: pd.pos, level: to });
      if (!checkMonopoly(g, ctx, uid)) proceed(g, ctx);
      break;
    }
    case 'takeover': {
      needCur('takeover');
      const pd = g.pending, o = g.props[pd.pos], prev = player(g, o.owner);
      if (p.cash < pd.cost) fail('Uangmu tidak cukup.');
      p.cash -= pd.cost; prev.cash += pd.cost; o.owner = uid;
      log(g, `😎 ${p.name} mengambil alih ${SPACES[pd.pos].name} dari ${prev.name} seharga ${rp(pd.cost)}!`, 'trade');
      fx(g, 'takeover', { uid, pos: pd.pos, from: prev.id });
      notify(g, prev.id, `${SPACES[pd.pos].name} diambil alih! 😱`, `${p.name} membeli kotamu seharga ${rp(pd.cost)}.`, 'take-' + g.id);
      const max = maxBuildLevel(g, uid, pd.pos);
      g.pending = max > o.level && p.cash >= stepCost(pd.pos, o.level + 1) ? { type: 'build', pos: pd.pos, from: o.level, max } : null;
      if (!checkMonopoly(g, ctx, uid)) proceed(g, ctx);
      break;
    }
    case 'skip':
      if (!isCur || !g.pending || !['build', 'takeover', 'choose'].includes(g.phase)) fail('Tidak ada yang bisa dilewati.');
      if (g.pending.type === 'choose' && !g.pending.skip) fail('Harus memilih.');
      g.pending = null; proceed(g, ctx); break;
    case 'choose':
      needCur('choose'); chooseAct(g, p, Number(a.pos), ctx);
      if (g.status === 'playing') proceed(g, ctx);
      break;
    case 'sell': {
      const d = g.debts.find(x => x.from === uid); if (!d) fail('Kamu hanya bisa menjual saat kekurangan uang.');
      const pos = Number(a.pos), o = g.props[pos];
      if (!o || o.owner !== uid) fail('Bukan propertimu.');
      const val = sellValue(g, pos);
      p.cash += val; delete g.props[pos]; if (g.festival === pos) g.festival = null;
      log(g, `${p.name} menjual ${SPACES[pos].name} ke bank (+${rp(val)}).`, 'money'); fx(g, 'gain', { uid, amount: val });
      if (p.cash >= d.amount) payDebt(g, p, d, ctx);
      break;
    }
    case 'pay-debt': {
      const d = g.debts.find(x => x.from === uid); if (!d) fail('Tidak ada utang.');
      if (p.cash < d.amount) fail(`Uangmu masih kurang ${rp(d.amount - p.cash)}.`);
      payDebt(g, p, d, ctx); break;
    }
    case 'bankrupt': case 'resign': {
      const d = g.debts.find(x => x.from === uid);
      if (a.type === 'resign') log(g, `🏳️ ${p.name} menyerah.`, 'bankrupt');
      const wasCur = isCur;
      bankrupt(g, p, a.type === 'bankrupt' && d ? d.to : null, ctx);
      if (g.status === 'playing') { if (wasCur && !g.debts.length) { g.pending = null; nextTurn(g, ctx); } else proceed(g, ctx); }
      break;
    }
    default: fail('Aksi tidak dikenal.');
  }
  g.updatedAt = ctx.now;
  return g._notify;
}
function payDebt(g, p, d, ctx) {
  p.cash -= d.amount;
  if (d.to) { const t = player(g, d.to); if (t) t.cash += d.amount; }
  g.debts = g.debts.filter(x => x !== d);
  log(g, `${p.name} melunasi ${rp(d.amount)} (${d.reason}).`, 'money');
  // setelah lunas, tawaran ambil alih tidak berlaku (giliran lanjut)
  proceed(g, ctx);
}

export function waitingFor(g) {
  if (!g || g.engine !== ENGINE || g.status !== 'playing') return [];
  if (g.phase === 'debt') return [...new Set(g.debts.map(d => d.from))];
  return [g.order[g.turn]];
}

// Mode Live: waktu habis → aksi otomatis
export function timeout(g, ctx) {
  if (g.engine !== ENGINE || g.status !== 'playing' || !g.deadline || ctx.now < g.deadline) return null;
  const uid = waitingFor(g)[0], p = player(g, uid);
  if (!p) return null;
  const n = (p.timeouts || 0) + 1;
  let a;
  if (g.phase === 'roll') a = { type: 'roll' };
  else if (g.phase === 'build' || g.phase === 'takeover') a = { type: 'skip' };
  else if (g.phase === 'choose') a = g.pending.skip ? { type: 'skip' } : { type: 'choose', pos: g.pending.options[Math.floor(ctx.rng() * g.pending.options.length)] };
  else if (g.phase === 'debt') {
    const d = g.debts.find(x => x.from === uid);
    const props = myProps(g, uid).sort((x, y) => g.props[x].invested - g.props[y].invested);
    for (const pos of props) { if (p.cash >= d.amount) break; p.cash += sellValue(g, pos); delete g.props[pos]; if (g.festival === pos) g.festival = null; }
    a = p.cash >= d.amount ? { type: 'pay-debt' } : { type: 'bankrupt' };
  }
  if (!a) return null;
  g._now = ctx.now;
  log(g, `⏱️ Waktu ${p.name} habis, jalan otomatis.`, 'sys');
  const out = act(g, uid, a, ctx);
  p.timeouts = n;
  return out;
}

export function endByHost(g, ctx) {
  if (g.status !== 'playing') fail('Game tidak berjalan.');
  g._now = ctx.now; g._notify = []; g.ver++;
  finish(g, ctx, 'host');
  return g._notify;
}

// ---------- Bot komputer ----------
export const BOT_NAMES = ['Bot Kiko', 'Bot Momo', 'Bot Bima', 'Bot Sari', 'Bot Jojo', 'Bot Lala', 'Bot Dodo', 'Bot Nana', 'Bot Riko'];
export function botAction(g, uid, rng) {
  const p = player(g, uid); if (!p) return null;
  const reserve = Math.max(1.5 * JT, g.settings.startCash * 0.12);
  const pd = g.pending;
  switch (g.phase) {
    case 'roll':
      if (p.jail && p.cards.includes('jailfree')) return { type: 'jail-card' };
      if (p.jail && p.cash > reserve * 3 && rng() < 0.5) return { type: 'jail-pay' };
      return { type: 'roll' };
    case 'build': {
      let best = -1;
      for (let l = Math.max(0, pd.from + 1); l <= pd.max; l++) { const c = buildCost(pd.pos, pd.from, l); if (c <= p.cash - (l === 0 || l === 4 ? 0 : reserve)) best = l; }
      if (best < 0 && pd.from < 0 && SPACES[pd.pos].price <= p.cash) best = 0;
      return best >= 0 ? { type: 'build', level: best } : { type: 'skip' };
    }
    case 'takeover': return pd.cost <= p.cash * 0.55 ? { type: 'takeover' } : { type: 'skip' };
    case 'choose': {
      const opts = pd.options;
      const score = i => {
        const o = g.props[i], s = SPACES[i];
        if (pd.kind === 'festival' || pd.kind === 'renov') return o ? s.price * (o.level + 1) : 0;
        if (pd.kind === 'storm' || pd.kind === 'swap2') return o ? o.invested : 0;
        if (pd.kind === 'swap1') return o ? -o.invested : 0;
        // tour/fly: kota kosong yang terjangkau, atau kota sendiri untuk dibangun
        if (!o && OWNABLE.has(s.type) && s.price <= p.cash) return 2 + s.price / JT;
        if (o && o.owner === uid && o.level < 4) return 1 + o.level;
        if (o && o.owner !== uid) return -5;
        return rng();
      };
      let best = opts[0];
      for (const i of opts) if (score(i) > score(best)) best = i;
      return { type: 'choose', pos: best };
    }
    case 'debt': {
      const d = g.debts.find(x => x.from === uid); if (!d) return null;
      if (p.cash >= d.amount) return { type: 'pay-debt' };
      const props = myProps(g, uid).sort((a, b) => g.props[a].invested - g.props[b].invested);
      return props.length ? { type: 'sell', pos: props[0] } : { type: 'bankrupt' };
    }
  }
  return null;
}
