/* =========================================================
   Nexo Games — mesin aturan "Nexo Kota Dunia" (game properti)
   Dipakai di server (Durable Object, sumber kebenaran) dan di browser (tampilan).
   Semua uang dalam Rupiah.
   ========================================================= */

const K = 10000; // 1 "unit" papan = Rp 10.000
export const GO_SALARY = 200 * K;
export const JAIL_FINE = 50 * K;
export const JAIL_POS = 10;
export const MAX_PLAYERS = 10;

export const GROUPS = {
  brown:  { name: 'Cokelat',     color: '#A2845E', house: 50 * K },
  sky:    { name: 'Biru Muda',   color: '#5AC8FA', house: 50 * K },
  pink:   { name: 'Merah Muda',  color: '#FF2D92', house: 100 * K },
  orange: { name: 'Oranye',      color: '#FF9500', house: 100 * K },
  red:    { name: 'Merah',       color: '#FF3B30', house: 150 * K },
  yellow: { name: 'Kuning',      color: '#FFCC00', house: 150 * K },
  green:  { name: 'Hijau',       color: '#34C759', house: 200 * K },
  navy:   { name: 'Biru Tua',    color: '#3634A3', house: 200 * K }
};

const R = (...a) => a.map(v => v * K);
// type: go | prop | air | util | chest | chance | tax | jail | park | gotojail
export const SPACES = [
  { type: 'go', name: 'START', short: 'START' },
  { type: 'prop', name: 'Kairo', country: 'Mesir', icon: 'pyramid', group: 'brown', price: 60 * K, rent: R(2, 10, 30, 90, 160, 250), landmark: 'Piramida Giza' },
  { type: 'chest', name: 'Dana Umum', short: 'Dana' },
  { type: 'prop', name: 'Istanbul', country: 'Turki', icon: 'mosque', group: 'brown', price: 60 * K, rent: R(4, 20, 60, 180, 320, 450), landmark: 'Hagia Sophia' },
  { type: 'tax', name: 'Pajak Penghasilan', short: 'Pajak', amount: 200 * K },
  { type: 'air', name: 'Bandara Soekarno-Hatta', short: 'CGK', code: 'CGK', price: 200 * K },
  { type: 'prop', name: 'Bangkok', country: 'Thailand', icon: 'wat', group: 'sky', price: 100 * K, rent: R(6, 30, 90, 270, 400, 550), landmark: 'Wat Arun' },
  { type: 'chance', name: 'Kesempatan', short: '?' },
  { type: 'prop', name: 'Kuala Lumpur', country: 'Malaysia', icon: 'petronas', group: 'sky', price: 100 * K, rent: R(6, 30, 90, 270, 400, 550), landmark: 'Menara Petronas' },
  { type: 'prop', name: 'Jakarta', country: 'Indonesia', icon: 'monas', group: 'sky', price: 120 * K, rent: R(8, 40, 100, 300, 450, 600), landmark: 'Monas' },
  { type: 'jail', name: 'Penjara', short: 'Penjara' },
  { type: 'prop', name: 'Rio de Janeiro', short: 'Rio', country: 'Brasil', icon: 'christ', group: 'pink', price: 140 * K, rent: R(10, 50, 150, 450, 625, 750), landmark: 'Patung Kristus Penebus' },
  { type: 'util', name: 'Perusahaan Listrik', short: 'Listrik', icon: 'bolt', price: 150 * K },
  { type: 'prop', name: 'Sydney', country: 'Australia', icon: 'opera', group: 'pink', price: 140 * K, rent: R(10, 50, 150, 450, 625, 750), landmark: 'Gedung Opera Sydney' },
  { type: 'prop', name: 'Barcelona', country: 'Spanyol', icon: 'sagrada', group: 'pink', price: 160 * K, rent: R(12, 60, 180, 500, 700, 900), landmark: 'Sagrada Família' },
  { type: 'air', name: 'Bandara Changi', short: 'SIN', code: 'SIN', price: 200 * K },
  { type: 'prop', name: 'Amsterdam', country: 'Belanda', icon: 'windmill', group: 'orange', price: 180 * K, rent: R(14, 70, 200, 550, 750, 950), landmark: 'Kincir Angin' },
  { type: 'chest', name: 'Dana Umum', short: 'Dana' },
  { type: 'prop', name: 'Berlin', country: 'Jerman', icon: 'gate', group: 'orange', price: 180 * K, rent: R(14, 70, 200, 550, 750, 950), landmark: 'Gerbang Brandenburg' },
  { type: 'prop', name: 'Roma', country: 'Italia', icon: 'colosseum', group: 'orange', price: 200 * K, rent: R(16, 80, 220, 600, 800, 1000), landmark: 'Colosseum' },
  { type: 'park', name: 'Parkir Bebas', short: 'Parkir' },
  { type: 'prop', name: 'Seoul', country: 'Korea Selatan', icon: 'ntower', group: 'red', price: 220 * K, rent: R(18, 90, 250, 700, 875, 1050), landmark: 'N Seoul Tower' },
  { type: 'chance', name: 'Kesempatan', short: '?' },
  { type: 'prop', name: 'Singapura', country: 'Singapura', icon: 'mbs', group: 'red', price: 220 * K, rent: R(18, 90, 250, 700, 875, 1050), landmark: 'Marina Bay Sands' },
  { type: 'prop', name: 'Toronto', country: 'Kanada', icon: 'cntower', group: 'red', price: 240 * K, rent: R(20, 100, 300, 750, 925, 1100), landmark: 'CN Tower' },
  { type: 'air', name: 'Bandara Haneda', short: 'HND', code: 'HND', price: 200 * K },
  { type: 'prop', name: 'Agra', country: 'India', icon: 'taj', group: 'yellow', price: 260 * K, rent: R(22, 110, 330, 800, 975, 1150), landmark: 'Taj Mahal' },
  { type: 'prop', name: 'San Francisco', short: 'San Fran', country: 'Amerika Serikat', icon: 'goldengate', group: 'yellow', price: 260 * K, rent: R(22, 110, 330, 800, 975, 1150), landmark: 'Golden Gate' },
  { type: 'util', name: 'Perusahaan Air', short: 'Air', icon: 'water', price: 150 * K },
  { type: 'prop', name: 'Hong Kong', country: 'Tiongkok', icon: 'hk', group: 'yellow', price: 280 * K, rent: R(24, 120, 360, 850, 1025, 1200), landmark: 'Victoria Harbour' },
  { type: 'gotojail', name: 'Masuk Penjara', short: 'Penjara!' },
  { type: 'prop', name: 'Dubai', country: 'Uni Emirat Arab', icon: 'burj', group: 'green', price: 300 * K, rent: R(26, 130, 390, 900, 1100, 1275), landmark: 'Burj Khalifa' },
  { type: 'prop', name: 'Tokyo', country: 'Jepang', icon: 'tokyotower', group: 'green', price: 300 * K, rent: R(26, 130, 390, 900, 1100, 1275), landmark: 'Tokyo Tower' },
  { type: 'chest', name: 'Dana Umum', short: 'Dana' },
  { type: 'prop', name: 'Paris', country: 'Prancis', icon: 'eiffel', group: 'green', price: 320 * K, rent: R(28, 150, 450, 1000, 1200, 1400), landmark: 'Menara Eiffel' },
  { type: 'air', name: 'Bandara JFK', short: 'JFK', code: 'JFK', price: 200 * K },
  { type: 'chance', name: 'Kesempatan', short: '?' },
  { type: 'prop', name: 'London', country: 'Inggris', icon: 'bigben', group: 'navy', price: 350 * K, rent: R(35, 175, 500, 1100, 1300, 1500), landmark: 'Big Ben' },
  { type: 'tax', name: 'Pajak Mewah', short: 'Pajak', amount: 100 * K },
  { type: 'prop', name: 'New York', country: 'Amerika Serikat', icon: 'liberty', group: 'navy', price: 400 * K, rent: R(50, 200, 600, 1400, 1700, 2000), landmark: 'Patung Liberty' }
];
SPACES.forEach((s, i) => { s.i = i; if (!s.short) s.short = s.name; });
export const OWNABLE = new Set(['prop', 'air', 'util']);
export const AIR_RENT = R(25, 50, 100, 200);
export const groupSpaces = g => SPACES.filter(s => s.group === g).map(s => s.i);

// ---------- Kartu ----------
export const CHANCE = [
  { text: 'Tiket promo! Terbang ke START dan terima Rp 2 jt.', fx: 'goto', to: 0 },
  { text: 'Liburan romantis ke Paris. Kalau lewat START, terima Rp 2 jt.', fx: 'goto', to: 34 },
  { text: 'Nonton konser di Tokyo! Kalau lewat START, terima Rp 2 jt.', fx: 'goto', to: 32 },
  { text: 'Wisata sejarah ke Kairo. Kalau lewat START, terima Rp 2 jt.', fx: 'goto', to: 1 },
  { text: 'Jalan-jalan ke Seoul. Kalau lewat START, terima Rp 2 jt.', fx: 'goto', to: 21 },
  { text: 'Terbang ke bandara terdekat. Kalau sudah dimiliki orang, bayar 2× sewa.', fx: 'nearAir' },
  { text: 'Transit! Ke bandara terdekat. Kalau sudah dimiliki orang, bayar 2× sewa.', fx: 'nearAir' },
  { text: 'Ke perusahaan terdekat. Kalau sudah dimiliki, lempar dadu dan bayar 10× angkanya.', fx: 'nearUtil' },
  { text: 'Kontenmu viral! Terima endorse Rp 500 rb.', fx: 'cash', amount: 50 * K },
  { text: 'Kartu Bebas Penjara. Simpan sampai dibutuhkan.', fx: 'jailfree' },
  { text: 'Salah naik kereta, mundur 3 langkah.', fx: 'back', steps: 3 },
  { text: 'Ketahuan nyebrang sembarangan! Langsung masuk penjara.', fx: 'jail' },
  { text: 'Renovasi properti: bayar Rp 250 rb per rumah dan Rp 1 jt per hotel.', fx: 'repairs', house: 25 * K, hotel: 100 * K },
  { text: 'Kena tilang ngebut: bayar Rp 150 rb.', fx: 'cash', amount: -15 * K },
  { text: 'Kamu jadi ketua grup liburan. Bayar ke tiap pemain Rp 500 rb.', fx: 'payEach', amount: 50 * K },
  { text: 'Investasi kripto lagi cuan! Terima Rp 1,5 jt.', fx: 'cash', amount: 150 * K }
];
export const CHEST = [
  { text: 'Maju ke START, terima Rp 2 jt.', fx: 'goto', to: 0 },
  { text: 'Bank salah hitung, untungnya buat kamu. Terima Rp 2 jt.', fx: 'cash', amount: 200 * K },
  { text: 'Periksa ke dokter: bayar Rp 500 rb.', fx: 'cash', amount: -50 * K },
  { text: 'Jual saham, terima Rp 500 rb.', fx: 'cash', amount: 50 * K },
  { text: 'Kartu Bebas Penjara. Simpan sampai dibutuhkan.', fx: 'jailfree' },
  { text: 'Lupa bayar parkir berbulan-bulan… masuk penjara!', fx: 'jail' },
  { text: 'THR cair! Terima Rp 1 jt.', fx: 'cash', amount: 100 * K },
  { text: 'Restitusi pajak: terima Rp 200 rb.', fx: 'cash', amount: 20 * K },
  { text: 'Kamu ulang tahun! Tiap pemain kasih kado Rp 100 rb.', fx: 'collectEach', amount: 10 * K },
  { text: 'Asuransi cair: terima Rp 1 jt.', fx: 'cash', amount: 100 * K },
  { text: 'Biaya rumah sakit: bayar Rp 1 jt.', fx: 'cash', amount: -100 * K },
  { text: 'Bayar uang kuliah Rp 500 rb.', fx: 'cash', amount: -50 * K },
  { text: 'Dapat proyek desain, terima Rp 250 rb.', fx: 'cash', amount: 25 * K },
  { text: 'Perbaikan jalan: bayar Rp 400 rb per rumah dan Rp 1,15 jt per hotel.', fx: 'repairs', house: 40 * K, hotel: 115 * K },
  { text: 'Juara 2 lomba karaoke! Terima Rp 100 rb.', fx: 'cash', amount: 10 * K },
  { text: 'Dapat warisan Rp 1 jt.', fx: 'cash', amount: 100 * K }
];

export const PLAYER_COLORS = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#00C7BE', '#FFCC00', '#5856D6', '#8E8E93'];

// ---------- Format ----------
export function rp(n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  let s;
  if (n >= 1000000) { const v = n / 1000000; s = (Number.isInteger(v) ? v : v.toFixed(v >= 100 ? 0 : 2).replace(/0+$/, '').replace(/\.$/, '')).toString().replace('.', ',') + ' jt'; }
  else if (n >= 1000) s = Math.round(n / 1000) + ' rb';
  else s = String(n);
  return (neg ? '-' : '') + 'Rp ' + s;
}
export const rpFull = n => (n < 0 ? '-' : '') + 'Rp ' + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- Utilitas ----------
class GameError extends Error { constructor(m) { super(m); this.user = true; } }
const fail = m => { throw new GameError(m); };
export const player = (g, id) => g.players.find(p => p.id === id);
export const current = g => player(g, g.order[g.turn]);
const alive = g => g.players.filter(p => !p.bankrupt);
const pname = (g, id) => (player(g, id) || {}).name || 'Pemain';

function log(g, text, kind = 'info', extra) {
  g.logSeq = (g.logSeq || 0) + 1;
  g.log.push(Object.assign({ id: g.logSeq, ts: g._now || Date.now(), text, kind }, extra || {}));
  if (g.log.length > 150) g.log.splice(0, g.log.length - 150);
}
function notify(g, to, title, body, tag) { (g._notify = g._notify || []).push({ to, title, body, tag }); }

export function ownerOf(g, pos) { const o = g.props[pos]; return o ? o.owner : null; }
export function ownsGroup(g, uid, group) { return groupSpaces(group).every(i => ownerOf(g, i) === uid); }
export function housesOn(g, pos) { return (g.props[pos] && g.props[pos].houses) || 0; }
export function mortgageValue(pos) { return Math.round(SPACES[pos].price / 2); }
export function unmortgageCost(pos) { return Math.ceil(mortgageValue(pos) * 1.1 / K) * K; }

export function rentFor(g, pos, diceTotal, opts = {}) {
  const s = SPACES[pos], o = g.props[pos];
  if (!o || o.mortgaged) return 0;
  if (s.type === 'prop') {
    const h = o.houses || 0;
    if (h > 0) return s.rent[h];
    return ownsGroup(g, o.owner, s.group) ? s.rent[0] * 2 : s.rent[0];
  }
  if (s.type === 'air') {
    const n = SPACES.filter(x => x.type === 'air' && ownerOf(g, x.i) === o.owner).length;
    return AIR_RENT[n - 1] * (opts.double ? 2 : 1);
  }
  if (s.type === 'util') {
    const n = SPACES.filter(x => x.type === 'util' && ownerOf(g, x.i) === o.owner).length;
    const mult = opts.utilTen ? 10 : (n === 2 ? 10 : 4);
    return mult * (diceTotal || 7) * K;
  }
  return 0;
}

export function netWorth(g, uid) {
  const p = player(g, uid); if (!p || p.bankrupt) return 0;
  let w = p.cash;
  for (const [pos, o] of Object.entries(g.props)) {
    if (o.owner !== uid) continue;
    const s = SPACES[pos];
    w += o.mortgaged ? s.price - mortgageValue(pos) : s.price;
    if (s.group) w += (o.houses || 0) * GROUPS[s.group].house;
  }
  return w;
}

// ---------- Membuat & lobi ----------
export function newGame({ id, name, host, hostName, mode, settings, now }) {
  const st = Object.assign({ startCash: 1500 * K, maxPlayers: 6, freeParking: false, auction: true, turnSec: 60, timeLimitMin: 0 }, settings || {});
  st.maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(st.maxPlayers) || 6));
  st.turnSec = Math.max(20, Math.min(300, Number(st.turnSec) || 60));
  const g = {
    id, name: String(name || 'Room').slice(0, 40), host, mode: mode === 'live' ? 'live' : 'santai', status: 'lobby',
    createdAt: now, startedAt: null, endedAt: null, updatedAt: now, settings: st,
    players: [], order: [], turn: 0, phase: 'lobby', props: {}, debts: [], trades: [], auction: null, pending: null,
    dice: null, diceSeq: 0, moves: [], moveSeq: 0, card: null, cardSeq: 0, pot: 0, rolledDouble: false,
    decks: null, log: [], logSeq: 0, deadline: null, winner: null, ranking: null, ver: 0, tradeSeq: 0
  };
  addPlayer(g, host, hostName);
  log(g, `${hostName} membuat room.`, 'sys');
  return g;
}

export function addPlayer(g, uid, name) {
  if (g.status !== 'lobby') fail('Game sudah dimulai.');
  if (player(g, uid)) return;
  if (g.players.length >= g.settings.maxPlayers) fail('Room sudah penuh.');
  const used = new Set(g.players.map(p => p.color));
  const color = PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0];
  g.players.push({ id: uid, name, color, cash: 0, pos: 0, jail: false, jailTurns: 0, jailCards: [], bankrupt: false, dbl: 0, timeouts: 0 });
}
export function removePlayer(g, uid) {
  if (g.status !== 'lobby') fail('Game sudah dimulai.');
  g.players = g.players.filter(p => p.id !== uid);
}

function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

export function startGame(g, ctx) {
  if (g.status !== 'lobby') fail('Game sudah dimulai.');
  if (g.players.length < 2) fail('Minimal 2 pemain.');
  g._now = ctx.now;
  g.status = 'playing'; g.startedAt = ctx.now;
  g.players.forEach(p => { p.cash = g.settings.startCash; p.pos = 0; });
  g.order = shuffle(g.players.map(p => p.id), ctx.rng);
  g.turn = 0;
  g.decks = { chance: shuffle(CHANCE.map((_, i) => i), ctx.rng), chest: shuffle(CHEST.map((_, i) => i), ctx.rng) };
  log(g, `Game dimulai! Urutan: ${g.order.map(id => pname(g, id)).join(' → ')}.`, 'sys');
  beginTurn(g, ctx);
}

// ---------- Giliran ----------
function setDeadline(g, ctx, mult = 1) {
  g.deadline = g.mode === 'live' && g.status === 'playing' ? ctx.now + g.settings.turnSec * 1000 * mult : null;
}

function beginTurn(g, ctx) {
  const p = current(g);
  g.phase = 'roll'; g.rolledDouble = false; p.dbl = 0;
  setDeadline(g, ctx);
  notify(g, p.id, `Giliranmu di ${g.name}! 🎲`, p.jail ? 'Kamu masih di penjara. Bayar denda, pakai kartu, atau coba dadu dobel.' : 'Ayo lempar dadu.', 'turn-' + g.id);
}

function nextTurn(g, ctx) {
  if (g.status !== 'playing') return;
  if (alive(g).length <= 1) return finish(g, ctx, 'last');
  if (g.settings.timeLimitMin > 0 && ctx.now - g.startedAt >= g.settings.timeLimitMin * 60000) return finish(g, ctx, 'time');
  const n = g.order.length;
  for (let k = 1; k <= n; k++) {
    const idx = (g.turn + k) % n;
    if (!player(g, g.order[idx]).bankrupt) { g.turn = idx; break; }
  }
  beginTurn(g, ctx);
}

function finish(g, ctx, why) {
  g.status = 'ended'; g.phase = 'ended'; g.endedAt = ctx.now; g.deadline = null; g.auction = null; g.pending = null;
  const ranking = g.players.map(p => ({ id: p.id, worth: netWorth(g, p.id), bankrupt: p.bankrupt, out: p.outAt || 0 }))
    .sort((a, b) => (a.bankrupt - b.bankrupt) || (b.worth - a.worth) || (b.out - a.out));
  g.ranking = ranking;
  g.winner = ranking[0] ? ranking[0].id : null;
  const reason = why === 'time' ? 'Waktu habis! ' : why === 'host' ? 'Game diakhiri host. ' : '';
  log(g, `${reason}🏆 ${pname(g, g.winner)} menang dengan kekayaan ${rp(ranking[0].worth)}!`, 'win');
  g.players.forEach(p => notify(g, p.id, `${g.name} selesai 🏆`, p.id === g.winner ? 'Selamat, kamu menang!' : `${pname(g, g.winner)} menang.`, 'end-' + g.id));
}

// Lanjutkan alur setelah sebuah langkah selesai.
function proceed(g, ctx) {
  if (g.status !== 'playing') return;
  if (g.debts.length) {
    g.phase = 'debt'; setDeadline(g, ctx, 2);
    return;
  }
  if (g.auction) { g.phase = 'auction'; setDeadline(g, ctx, 0.5); return; }
  if (g.pending && g.pending.type === 'buy') { g.phase = 'buy'; setDeadline(g, ctx); return; }
  const p = current(g);
  if (p.bankrupt) return nextTurn(g, ctx);
  g.phase = g.rolledDouble && !p.jail ? 'roll' : 'end';
  setDeadline(g, ctx);
}

const die = rng => 1 + Math.floor(rng() * 6);

function doRoll(g, p, ctx) {
  const d = [die(ctx.rng), die(ctx.rng)], total = d[0] + d[1], dbl = d[0] === d[1];
  g.dice = { d, seq: ++g.diceSeq, by: p.id };
  if (p.jail) {
    if (dbl) {
      p.jail = false; p.jailTurns = 0; g.rolledDouble = false;
      log(g, `${p.name} melempar ${d[0]}+${d[1]} dobel dan bebas dari penjara!`, 'roll');
      moveBy(g, p, total, ctx);
    } else {
      p.jailTurns++;
      if (p.jailTurns >= 3) {
        log(g, `${p.name} gagal dobel 3 kali, bayar denda ${rp(JAIL_FINE)} lalu keluar.`, 'roll');
        p.jail = false; p.jailTurns = 0; g.rolledDouble = false;
        charge(g, p, null, JAIL_FINE, 'Denda penjara', ctx);
        moveBy(g, p, total, ctx);
      } else {
        log(g, `${p.name} melempar ${d[0]}+${d[1]}, belum dobel. Tetap di penjara (${p.jailTurns}/3).`, 'roll');
        g.rolledDouble = false;
      }
    }
    return proceed(g, ctx);
  }
  if (dbl) {
    p.dbl = (p.dbl || 0) + 1;
    if (p.dbl >= 3) {
      log(g, `${p.name} dobel 3 kali berturut-turut! Langsung masuk penjara 🚓`, 'jail');
      sendToJail(g, p);
      return proceed(g, ctx);
    }
  } else p.dbl = 0;
  g.rolledDouble = dbl;
  log(g, `${p.name} melempar ${d[0]}+${d[1]} = ${total}${dbl ? ' (dobel!)' : ''}.`, 'roll');
  moveBy(g, p, total, ctx);
  proceed(g, ctx);
}

function addMove(g, p, from, to, kind) {
  if (g._moveAction !== g.ver) { g.moves = []; g._moveAction = g.ver; g.moveSeq++; }
  g.moves.push({ uid: p.id, from, to, kind });
}

function moveBy(g, p, steps, ctx, landOpts) {
  const from = p.pos;
  const to = ((from + steps) % 40 + 40) % 40;
  if (steps > 0 && from + steps >= 40) { p.cash += GO_SALARY; log(g, `${p.name} melewati START, terima ${rp(GO_SALARY)}.`, 'money'); }
  addMove(g, p, from, to, steps > 0 ? 'walk' : 'back');
  p.pos = to;
  land(g, p, ctx, landOpts);
}

function moveTo(g, p, to, ctx, landOpts) {
  const steps = (to - p.pos + 40) % 40;
  if (steps === 0 && to !== 0) { land(g, p, ctx, landOpts); return; }
  moveBy(g, p, steps || 40, ctx, landOpts);
}

function sendToJail(g, p) {
  addMove(g, p, p.pos, JAIL_POS, 'jump');
  p.pos = JAIL_POS; p.jail = true; p.jailTurns = 0; p.dbl = 0; g.rolledDouble = false;
}

// Bayar: dari pemain ke pemain lain / bank (to=null) / pot parkir ('pot').
function charge(g, from, to, amount, reason, ctx) {
  if (amount <= 0) return;
  if (to === null && g.settings.freeParking && /pajak|denda|bayar|biaya|renovasi|perbaikan|tilang|kuliah/i.test(reason)) to = 'pot';
  if (from.cash >= amount) {
    from.cash -= amount;
    credit(g, to, amount);
    return true;
  }
  g.debts.push({ id: (g.debtSeq = (g.debtSeq || 0) + 1), from: from.id, to: to && to !== 'pot' ? to.id || to : to, amount, reason });
  log(g, `${from.name} harus bayar ${rp(amount)} (${reason}) tapi uangnya kurang. Jual/gadai aset atau bangkrut.`, 'warn');
  notify(g, from.id, `Uangmu kurang di ${g.name} 😬`, `Kamu harus bayar ${rp(amount)}. Gadai/jual aset dulu.`, 'debt-' + g.id);
  return false;
}
function credit(g, to, amount) {
  if (to === 'pot') g.pot += amount;
  else if (to) { const t = typeof to === 'string' ? player(g, to) : to; if (t) t.cash += amount; }
}

function land(g, p, ctx, opts = {}) {
  const s = SPACES[p.pos];
  switch (s.type) {
    case 'prop': case 'air': case 'util': {
      const o = g.props[p.pos];
      if (!o) { g.pending = { type: 'buy', pos: p.pos }; return; }
      if (o.owner === p.id) { log(g, `${p.name} mampir ke properti sendiri, ${s.name}.`); return; }
      if (o.mortgaged) { log(g, `${s.name} sedang digadai, ${p.name} tidak bayar sewa.`); return; }
      let total = g.dice ? g.dice.d[0] + g.dice.d[1] : 7;
      if (s.type === 'util' && opts.utilTen) {
        const d = [die(ctx.rng), die(ctx.rng)]; total = d[0] + d[1];
        g.dice = { d, seq: ++g.diceSeq, by: p.id };
      }
      const rent = rentFor(g, p.pos, total, opts);
      const owner = player(g, o.owner);
      log(g, `${p.name} bayar sewa ${rp(rent)} ke ${owner.name} (${s.name}).`, 'rent', { amount: rent });
      charge(g, p, owner, rent, 'Sewa ' + s.name, ctx);
      return;
    }
    case 'tax':
      log(g, `${p.name} bayar ${s.name} ${rp(s.amount)}.`, 'money');
      charge(g, p, null, s.amount, s.name, ctx);
      return;
    case 'chance': case 'chest': return drawCard(g, p, s.type, ctx);
    case 'gotojail':
      log(g, `${p.name} masuk penjara! 🚓`, 'jail');
      sendToJail(g, p); return;
    case 'park':
      if (g.settings.freeParking && g.pot > 0) {
        log(g, `${p.name} dapat jackpot Parkir Bebas ${rp(g.pot)}! 🎉`, 'money');
        p.cash += g.pot; g.pot = 0;
      }
      return;
    default: return;
  }
}

function drawCard(g, p, deck, ctx) {
  const list = deck === 'chance' ? CHANCE : CHEST;
  const d = g.decks[deck];
  const idx = d.shift();
  const c = list[idx];
  if (c.fx !== 'jailfree') d.push(idx);
  g.card = { seq: ++g.cardSeq, deck, idx, text: c.text, uid: p.id };
  log(g, `${p.name} ambil kartu ${deck === 'chance' ? 'Kesempatan' : 'Dana Umum'}: “${c.text}”`, 'card');
  switch (c.fx) {
    case 'goto': return moveTo(g, p, c.to, ctx);
    case 'cash':
      if (c.amount > 0) p.cash += c.amount; else charge(g, p, null, -c.amount, 'Bayar kartu', ctx);
      return;
    case 'jailfree': p.jailCards.push(deck); return;
    case 'back': moveBy(g, p, -c.steps, ctx); return;
    case 'jail': sendToJail(g, p); return;
    case 'nearAir': { const t = [5, 15, 25, 35].find(x => x > p.pos) ?? 5; return moveTo(g, p, t, ctx, { double: true }); }
    case 'nearUtil': { const t = [12, 28].find(x => x > p.pos) ?? 12; return moveTo(g, p, t, ctx, { utilTen: true }); }
    case 'repairs': {
      let cost = 0;
      for (const o of Object.values(g.props)) if (o.owner === p.id && o.houses) cost += o.houses === 5 ? c.hotel : o.houses * c.house;
      if (cost) charge(g, p, null, cost, 'Biaya renovasi', ctx); else log(g, `${p.name} belum punya rumah, tidak bayar apa-apa.`);
      return;
    }
    case 'payEach':
      alive(g).filter(o => o.id !== p.id).forEach(o => charge(g, p, o, c.amount, 'Bayar ke ' + o.name, ctx));
      return;
    case 'collectEach':
      alive(g).filter(o => o.id !== p.id).forEach(o => charge(g, o, p, c.amount, 'Kado ulang tahun ' + p.name, ctx));
      return;
  }
}

// ---------- Kebangkrutan ----------
function bankrupt(g, p, creditorId, ctx) {
  const cred = creditorId && creditorId !== 'pot' ? player(g, creditorId) : null;
  // jual semua rumah ke bank
  for (const [pos, o] of Object.entries(g.props)) {
    if (o.owner !== p.id) continue;
    if (o.houses) { p.cash += o.houses * GROUPS[SPACES[pos].group].house / 2; o.houses = 0; }
  }
  if (cred && !cred.bankrupt) {
    cred.cash += Math.max(0, p.cash);
    for (const o of Object.values(g.props)) if (o.owner === p.id) o.owner = cred.id;
    cred.jailCards.push(...p.jailCards);
    log(g, `💥 ${p.name} bangkrut! Semua asetnya jadi milik ${cred.name}.`, 'bankrupt');
  } else {
    for (const [pos, o] of Object.entries(g.props)) if (o.owner === p.id) delete g.props[pos];
    p.jailCards.forEach(dk => g.decks[dk].push((dk === 'chance' ? CHANCE : CHEST).findIndex(c => c.fx === 'jailfree')));
    log(g, `💥 ${p.name} bangkrut! Propertinya kembali ke bank.`, 'bankrupt');
  }
  p.cash = 0; p.jailCards = []; p.bankrupt = true; p.outAt = ctx.now; p.jail = false;
  g.debts = g.debts.filter(d => d.from !== p.id).map(d => d.to === p.id ? Object.assign(d, { to: null }) : d);
  g.trades = g.trades.filter(t => t.from !== p.id && t.to !== p.id);
  if (g.auction) {
    const a = g.auction;
    const cur = a.bidders[a.idx];
    a.bidders = a.bidders.filter(id => id !== p.id);
    if (a.leader === p.id) { a.leader = null; a.bid = 0; }
    a.idx = Math.max(0, a.bidders.indexOf(cur)); if (a.idx >= a.bidders.length) a.idx = 0;
    settleAuction(g, ctx);
  }
  if (g.pending && current(g).id === p.id) g.pending = null;
  if (alive(g).length <= 1) finish(g, ctx, 'last');
}

// ---------- Lelang ----------
function startAuction(g, pos, ctx) {
  const n = g.order.length, bidders = [];
  for (let k = 0; k < n; k++) { const id = g.order[(g.turn + k) % n]; if (!player(g, id).bankrupt) bidders.push(id); }
  g.auction = { pos, bid: 0, leader: null, bidders, idx: 0 };
  log(g, `🔨 ${SPACES[pos].name} dilelang!`, 'auction');
  if (g.mode === 'santai') notify(g, bidders[0], `Lelang ${SPACES[pos].name}`, 'Giliranmu menawar.', 'auc-' + g.id);
}
function settleAuction(g, ctx) {
  const a = g.auction; if (!a) return;
  const done = a.bidders.length === 0 || (a.bidders.length === 1 && a.leader === a.bidders[0]);
  if (!done) {
    if (a.bidders[a.idx] === a.leader && a.bidders.length > 1) a.idx = (a.idx + 1) % a.bidders.length;
    if (g.mode === 'santai') notify(g, a.bidders[a.idx], `Lelang ${SPACES[a.pos].name}`, `Tawaran tertinggi ${rp(a.bid)}. Giliranmu menawar.`, 'auc-' + g.id);
    return;
  }
  const s = SPACES[a.pos];
  if (a.leader) {
    const w = player(g, a.leader);
    w.cash -= a.bid;
    g.props[a.pos] = { owner: w.id, houses: 0, mortgaged: false };
    log(g, `🔨 ${w.name} memenangkan lelang ${s.name} seharga ${rp(a.bid)}.`, 'auction');
  } else log(g, `Tidak ada yang menawar ${s.name}. Tetap milik bank.`, 'auction');
  g.auction = null;
}

// ---------- Validasi bangunan ----------
export function buildCheck(g, uid, pos) {
  const s = SPACES[pos], o = g.props[pos];
  if (!s || s.type !== 'prop' || !o || o.owner !== uid) return 'Bukan propertimu.';
  if (!ownsGroup(g, uid, s.group)) return `Kumpulkan semua kota ${GROUPS[s.group].name} dulu.`;
  const grp = groupSpaces(s.group);
  if (grp.some(i => g.props[i].mortgaged)) return 'Ada kota di grup ini yang sedang digadai.';
  if ((o.houses || 0) >= 5) return 'Sudah ada hotel.';
  const min = Math.min(...grp.map(i => g.props[i].houses || 0));
  if ((o.houses || 0) > min) return 'Bangun merata dulu di kota lain satu grup.';
  if (player(g, uid).cash < GROUPS[s.group].house) return 'Uang tidak cukup.';
  return null;
}
export function sellCheck(g, uid, pos) {
  const s = SPACES[pos], o = g.props[pos];
  if (!o || o.owner !== uid || !o.houses) return 'Tidak ada bangunan.';
  const max = Math.max(...groupSpaces(s.group).map(i => housesOn(g, i)));
  if (o.houses < max) return 'Jual merata dulu dari kota lain satu grup.';
  return null;
}
export function mortgageCheck(g, uid, pos) {
  const s = SPACES[pos], o = g.props[pos];
  if (!o || o.owner !== uid) return 'Bukan propertimu.';
  if (o.mortgaged) return 'Sudah digadai.';
  if (s.group && groupSpaces(s.group).some(i => housesOn(g, i) > 0)) return 'Jual semua bangunan di grup ini dulu.';
  return null;
}
function tradableCheck(g, uid, pos) {
  const s = SPACES[pos], o = g.props[pos];
  if (!o || o.owner !== uid) return `${s ? s.name : 'Properti'} bukan milik pemain itu lagi.`;
  if (s.group && groupSpaces(s.group).some(i => housesOn(g, i) > 0)) return `Jual bangunan di grup ${s.name} dulu.`;
  return null;
}

function cleanSide(x) {
  x = x || {};
  return { cash: Math.max(0, Math.round(Number(x.cash) || 0)), props: [...new Set((x.props || []).map(Number).filter(n => n >= 0 && n < 40))], cards: Math.max(0, Math.min(4, Number(x.cards) || 0)) };
}

// ---------- Aksi pemain ----------
// a = { type, ... }. ctx = { now, rng }
export function act(g, uid, a, ctx) {
  g._now = ctx.now; g._notify = [];
  if (g.status !== 'playing') fail('Game tidak sedang berjalan.');
  const p = player(g, uid);
  if (!p) fail('Kamu bukan pemain di room ini.');
  if (p.bankrupt) fail('Kamu sudah bangkrut.');
  const isCur = current(g).id === uid;
  g.ver++;
  p.timeouts = 0;
  switch (a.type) {
    case 'roll':
      if (!isCur || g.phase !== 'roll') fail('Belum giliranmu melempar.');
      doRoll(g, p, ctx); break;
    case 'jail-pay':
      if (!isCur || g.phase !== 'roll' || !p.jail) fail('Tidak bisa sekarang.');
      if (p.cash < JAIL_FINE) fail('Uang tidak cukup.');
      p.cash -= JAIL_FINE; credit(g, g.settings.freeParking ? 'pot' : null, JAIL_FINE);
      p.jail = false; p.jailTurns = 0;
      log(g, `${p.name} bayar denda ${rp(JAIL_FINE)} dan keluar dari penjara.`, 'money');
      setDeadline(g, ctx); break;
    case 'jail-card': {
      if (!isCur || g.phase !== 'roll' || !p.jail || !p.jailCards.length) fail('Tidak bisa sekarang.');
      const dk = p.jailCards.shift();
      g.decks[dk].push((dk === 'chance' ? CHANCE : CHEST).findIndex(c => c.fx === 'jailfree'));
      p.jail = false; p.jailTurns = 0;
      log(g, `${p.name} pakai Kartu Bebas Penjara 🎟️`, 'sys');
      setDeadline(g, ctx); break;
    }
    case 'buy': {
      if (!isCur || g.phase !== 'buy' || !g.pending) fail('Tidak ada yang bisa dibeli.');
      const s = SPACES[g.pending.pos];
      if (p.cash < s.price) fail('Uang tidak cukup. Gadai aset atau lelang.');
      p.cash -= s.price;
      g.props[s.i] = { owner: p.id, houses: 0, mortgaged: false };
      g.pending = null;
      log(g, `🏙️ ${p.name} membeli ${s.name} seharga ${rp(s.price)}.`, 'buy');
      proceed(g, ctx); break;
    }
    case 'decline': {
      if (!isCur || g.phase !== 'buy' || !g.pending) fail('Tidak bisa sekarang.');
      const pos = g.pending.pos; g.pending = null;
      if (g.settings.auction && alive(g).length > 1) startAuction(g, pos, ctx);
      else log(g, `${p.name} tidak membeli ${SPACES[pos].name}.`);
      proceed(g, ctx); break;
    }
    case 'bid': {
      const au = g.auction;
      if (!au || g.phase !== 'auction') fail('Tidak ada lelang.');
      if (au.bidders[au.idx] !== uid) fail('Belum giliranmu menawar.');
      const amt = Math.round(Number(a.amount) || 0);
      if (amt <= au.bid || amt < K) fail('Tawaran harus lebih tinggi.');
      if (amt > p.cash) fail('Uangmu tidak cukup.');
      au.bid = amt; au.leader = uid;
      au.idx = (au.idx + 1) % au.bidders.length;
      log(g, `${p.name} menawar ${rp(amt)}.`, 'auction');
      settleAuction(g, ctx); proceed(g, ctx); break;
    }
    case 'pass': {
      const au = g.auction;
      if (!au || g.phase !== 'auction') fail('Tidak ada lelang.');
      if (au.bidders[au.idx] !== uid) fail('Belum giliranmu.');
      au.bidders.splice(au.idx, 1);
      if (au.idx >= au.bidders.length) au.idx = 0;
      log(g, `${p.name} mundur dari lelang.`, 'auction');
      settleAuction(g, ctx); proceed(g, ctx); break;
    }
    case 'end':
      if (!isCur || g.phase !== 'end') fail('Belum bisa mengakhiri giliran.');
      nextTurn(g, ctx); break;
    case 'build': {
      const pos = Number(a.pos), err = buildCheck(g, uid, pos);
      if (err) fail(err);
      const s = SPACES[pos], cost = GROUPS[s.group].house;
      p.cash -= cost; g.props[pos].houses = (g.props[pos].houses || 0) + 1;
      log(g, `🏠 ${p.name} membangun ${g.props[pos].houses === 5 ? 'hotel' : 'rumah'} di ${s.name}.`, 'build');
      break;
    }
    case 'sell': {
      const pos = Number(a.pos), err = sellCheck(g, uid, pos);
      if (err) fail(err);
      const s = SPACES[pos], val = GROUPS[s.group].house / 2;
      g.props[pos].houses--; p.cash += val;
      log(g, `${p.name} menjual bangunan di ${s.name} (+${rp(val)}).`, 'build');
      break;
    }
    case 'mortgage': {
      const pos = Number(a.pos), err = mortgageCheck(g, uid, pos);
      if (err) fail(err);
      g.props[pos].mortgaged = true; p.cash += mortgageValue(pos);
      log(g, `${p.name} menggadaikan ${SPACES[pos].name} (+${rp(mortgageValue(pos))}).`, 'money');
      break;
    }
    case 'unmortgage': {
      const pos = Number(a.pos), o = g.props[pos];
      if (!o || o.owner !== uid || !o.mortgaged) fail('Tidak bisa ditebus.');
      const cost = unmortgageCost(pos);
      if (p.cash < cost) fail('Uang tidak cukup.');
      p.cash -= cost; o.mortgaged = false;
      log(g, `${p.name} menebus ${SPACES[pos].name} (${rp(cost)}).`, 'money');
      break;
    }
    case 'pay-debt': {
      const d = g.debts.find(x => x.from === uid);
      if (!d) fail('Tidak ada utang.');
      if (p.cash < d.amount) fail(`Uangmu masih kurang ${rp(d.amount - p.cash)}.`);
      p.cash -= d.amount; credit(g, d.to, d.amount);
      g.debts = g.debts.filter(x => x !== d);
      log(g, `${p.name} melunasi ${rp(d.amount)} (${d.reason}).`, 'money');
      proceed(g, ctx); break;
    }
    case 'bankrupt': {
      const d = g.debts.find(x => x.from === uid);
      bankrupt(g, p, d ? d.to : null, ctx);
      if (g.status === 'playing') {
        if (current(g).id === uid && !g.debts.length && !g.auction) nextTurn(g, ctx);
        else proceed(g, ctx);
      }
      break;
    }
    case 'resign': {
      if (g.debts.some(x => x.from === uid)) fail('Selesaikan utang dulu (pilih Bangkrut).');
      log(g, `🏳️ ${p.name} menyerah.`, 'bankrupt');
      const wasCur = current(g).id === uid;
      bankrupt(g, p, null, ctx);
      if (g.status === 'playing') { if (wasCur && !g.debts.length && !g.auction) nextTurn(g, ctx); else proceed(g, ctx); }
      break;
    }
    case 'trade-offer': {
      const to = player(g, a.to);
      if (!to || to.bankrupt || to.id === uid) fail('Pilih pemain lain.');
      if (g.trades.filter(t => t.from === uid).length >= 3) fail('Maksimal 3 tawaran aktif.');
      const give = cleanSide(a.give), get = cleanSide(a.get);
      if (!give.cash && !give.props.length && !give.cards && !get.cash && !get.props.length && !get.cards) fail('Tawaran masih kosong.');
      for (const pos of give.props) { const e = tradableCheck(g, uid, pos); if (e) fail(e); }
      for (const pos of get.props) { const e = tradableCheck(g, to.id, pos); if (e) fail(e); }
      if (give.cash > p.cash) fail('Uangmu tidak cukup.');
      if (give.cards > p.jailCards.length) fail('Kartu Bebas Penjara tidak cukup.');
      if (get.cards > to.jailCards.length) fail(`${to.name} tidak punya kartu sebanyak itu.`);
      const t = { id: ++g.tradeSeq, from: uid, to: to.id, give, get, ts: ctx.now, note: String(a.note || '').slice(0, 120) };
      g.trades.push(t);
      log(g, `🤝 ${p.name} mengajukan tawaran ke ${to.name}.`, 'trade');
      notify(g, to.id, `Tawaran dari ${p.name} 🤝`, `Ada tawaran tukar properti di ${g.name}.`, 'trade-' + g.id);
      break;
    }
    case 'trade-accept': case 'trade-reject': case 'trade-cancel': {
      const t = g.trades.find(x => x.id === Number(a.id));
      if (!t) fail('Tawaran sudah tidak ada.');
      if (a.type === 'trade-cancel') { if (t.from !== uid) fail('Bukan tawaranmu.'); g.trades = g.trades.filter(x => x !== t); log(g, `${p.name} membatalkan tawaran.`, 'trade'); break; }
      if (t.to !== uid) fail('Tawaran ini bukan untukmu.');
      g.trades = g.trades.filter(x => x !== t);
      const from = player(g, t.from);
      if (a.type === 'trade-reject') { log(g, `${p.name} menolak tawaran ${from.name}.`, 'trade'); notify(g, from.id, 'Tawaran ditolak', `${p.name} menolak tawaranmu.`, 'trade-' + g.id); break; }
      for (const pos of t.give.props) { const e = tradableCheck(g, from.id, pos); if (e) fail(e); }
      for (const pos of t.get.props) { const e = tradableCheck(g, uid, pos); if (e) fail(e); }
      if (from.cash < t.give.cash) fail(`Uang ${from.name} sudah tidak cukup.`);
      if (p.cash < t.get.cash) fail('Uangmu tidak cukup.');
      if (from.jailCards.length < t.give.cards || p.jailCards.length < t.get.cards) fail('Kartu Bebas Penjara sudah berubah.');
      from.cash += t.get.cash - t.give.cash; p.cash += t.give.cash - t.get.cash;
      t.give.props.forEach(pos => { g.props[pos].owner = p.id; });
      t.get.props.forEach(pos => { g.props[pos].owner = from.id; });
      p.jailCards.push(...from.jailCards.splice(0, t.give.cards));
      from.jailCards.push(...p.jailCards.splice(0, t.get.cards));
      // tawaran lain yang sudah tidak valid dihapus
      g.trades = g.trades.filter(x => [...x.give.props].every(pos => ownerOf(g, pos) === x.from) && [...x.get.props].every(pos => ownerOf(g, pos) === x.to));
      log(g, `🤝 ${p.name} menerima tawaran ${from.name}. Deal!`, 'trade');
      notify(g, from.id, 'Deal! 🤝', `${p.name} menerima tawaranmu.`, 'trade-' + g.id);
      break;
    }
    default: fail('Aksi tidak dikenal.');
  }
  g.updatedAt = ctx.now;
  return g._notify;
}

// Waktu habis (mode Live): jalankan aksi otomatis untuk pemain yang ditunggu.
export function waitingFor(g) {
  if (g.status !== 'playing') return [];
  if (g.phase === 'debt') return [...new Set(g.debts.map(d => d.from))];
  if (g.phase === 'auction' && g.auction) return [g.auction.bidders[g.auction.idx]];
  return [g.order[g.turn]];
}

export function timeout(g, ctx) {
  if (g.status !== 'playing' || !g.deadline || ctx.now < g.deadline) return null;
  const who = waitingFor(g);
  const uid = who[0];
  const p = player(g, uid);
  if (!p) return null;
  const n = (p.timeouts || 0) + 1;
  let a;
  if (g.phase === 'roll') a = { type: 'roll' };
  else if (g.phase === 'buy') a = { type: 'decline' };
  else if (g.phase === 'auction') a = { type: 'pass' };
  else if (g.phase === 'end') a = { type: 'end' };
  else if (g.phase === 'debt') {
    autoRaise(g, p, g.debts.find(d => d.from === uid).amount);
    a = p.cash >= g.debts.find(d => d.from === uid).amount ? { type: 'pay-debt' } : { type: 'bankrupt' };
  }
  if (!a) return null;
  g._now = ctx.now;
  log(g, `⏱️ Waktu ${p.name} habis, jalan otomatis.`, 'sys');
  const out = act(g, uid, a, ctx);
  p.timeouts = n;
  return out;
}

function autoRaise(g, p, need) {
  const mine = Object.keys(g.props).map(Number).filter(pos => g.props[pos].owner === p.id);
  let guard = 200;
  while (p.cash < need && guard-- > 0) {
    const sell = mine.filter(pos => !sellCheck(g, p.id, pos)).sort((a, b) => housesOn(g, b) - housesOn(g, a))[0];
    if (sell !== undefined) { g.props[sell].houses--; p.cash += GROUPS[SPACES[sell].group].house / 2; continue; }
    const mort = mine.filter(pos => !mortgageCheck(g, p.id, pos))[0];
    if (mort !== undefined) { g.props[mort].mortgaged = true; p.cash += mortgageValue(mort); continue; }
    break;
  }
}

// Host mengakhiri game → peringkat kekayaan
export function endByHost(g, ctx) {
  if (g.status !== 'playing') fail('Game tidak berjalan.');
  g._now = ctx.now; g._notify = []; g.ver++;
  finish(g, ctx, 'host');
  return g._notify;
}
