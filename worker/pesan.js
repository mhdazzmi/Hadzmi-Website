/* =========================================================
   Pesan Online Kedai Thai Tea — halaman customer /pesan/
   Halaman customer TIDAK memakai Firebase langsung (kunci database kasir tidak ikut terbuka).
   Semua lewat route ini; Worker memeriksa jam buka, menghitung harga sendiri, lalu menulis ke
   Firebase kasir (project kasir-thai-tea) lewat REST:
     thaitea/online_settings            { open, toppingOff: {Keju:true}, photos: {menuId: url} }  ← diubah dari web kasir
     thaitea/online_orders/<id>         pesanan online (status diubah dari web kasir)
     thaitea/online_customers/<cid>     { nick, gender, orders: {<id>: createdAt} }
   Status pesanan:
     bayar   → menunggu customer membayar QRIS (kedaluwarsa setelah PAY_WINDOW_MIN menit)
     cek     → customer menekan "Saya Sudah Bayar", kasir mencocokkan di ShopeePay Partner
     proses  → pembayaran diterima, sedang disiapkan
     siap    → siap dijemput (kasir: Menunggu Customer Datang)
     selesai → sudah diambil
     batal   → dibatalkan (customer / kasir)
   Route:
     GET  /api/pesan/info                 status toko, menu, topping
     POST /api/pesan/order                buat pesanan → { order, qris }
     POST /api/pesan/paid                 { cid, id, payerName }  customer sudah bayar
     POST /api/pesan/cancel               { cid, id }             batalkan (hanya yang belum dibayar)
     GET  /api/pesan/orders?cid=          riwayat pesanan HP ini
   Cron tiap menit (nudgeKasir): pesanan berstatus "cek" yang belum ditangani kasir
   dikirimi notifikasi ulang ke HP kasir tiap menit, maksimal NUDGE_MAX kali.
   Daftarnya disimpan di KV pesan_cek (kosong = tidak ada pekerjaan, tanpa baca Firebase).
   Variabel opsional (Dashboard Cloudflare):
     TT_FIREBASE_URL     URL Realtime Database kasir (bawaan: kasir-thai-tea)
     TT_FIREBASE_SECRET  (Secret) database secret, wajib diisi kalau rules Firebase kasir dikunci
     TT_QRIS             isi QRIS statis (bawaan: QRIS ShopeePay Partner Thai Tea)
   ========================================================= */
import { pushKasir } from './thaitea.js';

const DB_URL = 'https://kasir-thai-tea-default-rtdb.asia-southeast1.firebasedatabase.app';
const QRIS_STATIC = '00020101021126610016ID.CO.SHOPEE.WWW01189360091800239822980208239822980303UMI51440014ID.CO.QRIS.WWW0215ID10266222846970303UMI5204581253033605802ID5925Thai Tea - Authentic Thai6009PEKANBARU61052829162070703A01630403C3';

export const STORE = {
  name: 'Kedai Thai Tea',
  qrisName: 'Thai Tea - Authentic Thai Milk Tea',
  address: 'Jln Swakarya, Kota Pekanbaru (dekat Jln HR Soebrantas)',
  maps: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Jalan Swakarya, Pekanbaru')
};
const OPEN_MIN = 12 * 60;          // 12.00
const CLOSE_MIN = 23 * 60 + 40;    // 23.40
const PAY_WINDOW_MIN = 20;         // batas waktu bayar QRIS
const MAX_CUPS = 30;
const MAX_UNPAID = 2;              // pesanan belum dibayar per HP
const ORDERS_PER_MIN = 20;         // semua customer
const TOPPING_PRICE = 3000;
const NUDGE_MAX = 10;              // jumlah notifikasi ke kasir per pesanan (termasuk yang pertama)
const NUDGE_KEY = 'pesan_cek';

// Sama dengan MENU_DATABASE di public/thaitea/index.html (Es Teler sudah tidak dijual)
const MENU = [
  ['ttp-ori', 'Thai Tea Ori Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-matcha', 'Matcha Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-coklat', 'Coklat Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-tarro', 'Tarro Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-cappuccino', 'Cappuccino Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-redvelvet', 'Red Velvet Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-mangga', 'Mangga Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttp-vanilla', 'Vanilla Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
  ['ttr-ori', 'Thai Tea Original', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-matcha', 'Matcha', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-coklat', 'Coklat', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-tarro', 'Tarro', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-cappuccino', 'Cappuccino', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-redvelvet', 'Red Velvet', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-mangga', 'Mangga', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['ttr-vanilla', 'Vanilla', 10000, 'thai-regular', 'Thai Tea Regular'],
  ['tea-lemon', 'Lemon Tea', 7000, 'tea', 'Tea Buah'],
  ['tea-peach', 'Peach Tea', 7000, 'tea', 'Tea Buah']
].map(([id, name, price, category, catLabel]) => ({ id, name, price, category, catLabel }));
const TOPPINGS = ['Keju', 'Boba', 'Cream', 'Jelly', 'Oreo'];

export async function handlePesan(request, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  if (path === '/api/pesan/info' && method === 'GET') {
    const settings = (await fb(env, 'GET', 'online_settings')) || {};
    return json(infoFrom(settings));
  }

  if (path === '/api/pesan/order' && method === 'POST') {
    const b = await readJson(request);
    const cid = cleanCid(b.cid);
    if (!cid) return json({ error: 'Data HP tidak dikenali, muat ulang halaman.' }, 400);
    const nick = cleanText(b.nick, 24);
    const gender = b.gender === 'L' ? 'L' : b.gender === 'P' ? 'P' : '';
    const name = cleanText(b.name, 30);
    if (!name) return json({ error: 'Isi dulu pesanan atas nama siapa.' }, 400);

    const settings = (await fb(env, 'GET', 'online_settings')) || {};
    const info = infoFrom(settings);
    if (!info.canOrder) return json({ error: info.closedReason || 'Kedai sedang tutup.' }, 409);

    // Jam jemput: "now" atau "HH:MM" (12.00 – 23.40, tidak boleh sudah lewat)
    const nowMin = wibMinutes();
    let pickup = 'now', pickupMin = nowMin;
    if (b.pickup === 'now') {
      if (nowMin < OPEN_MIN || nowMin > CLOSE_MIN) return json({ error: 'Pilihan "Sekarang" hanya bisa jam 12.00 – 23.40. Pilih jam jemput.' }, 400);
    } else {
      const m = /^(\d{2}):(\d{2})$/.exec(String(b.pickup || ''));
      if (!m) return json({ error: 'Pilih dulu jam jemputnya.' }, 400);
      pickupMin = Number(m[1]) * 60 + Number(m[2]);
      if (pickupMin < OPEN_MIN || pickupMin > CLOSE_MIN) return json({ error: 'Jam jemput hanya bisa 12.00 – 23.40.' }, 400);
      if (pickupMin < nowMin - 2) return json({ error: 'Jam jemput sudah lewat, pilih jam lain.' }, 400);
      pickup = m[1] + ':' + m[2];
    }

    // Hitung ulang harga di server (harga dari HP tidak dipakai)
    const off = settings.toppingOff || {};
    const lines = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
    const items = [];
    for (const l of lines) {
      const menu = MENU.find(x => x.id === l.menuId);
      const qty = Math.floor(Number(l.qty));
      if (!menu || !(qty >= 1 && qty <= MAX_CUPS)) return json({ error: 'Ada menu yang tidak valid, muat ulang halaman.' }, 400);
      const tops = [...new Set(Array.isArray(l.toppings) ? l.toppings : [])];
      for (const t of tops) {
        if (!TOPPINGS.includes(t)) return json({ error: 'Ada topping yang tidak valid.' }, 400);
        if (off[t]) return json({ error: `Topping ${t} sedang habis, hapus dari pesanan ya.` }, 409);
      }
      const pricePerCup = menu.price + tops.length * TOPPING_PRICE;
      items.push({ menuId: menu.id, name: menu.name, category: menu.category, catLabel: menu.catLabel, toppings: tops, qty, pricePerCup, total: pricePerCup * qty });
    }
    if (!items.length) return json({ error: 'Keranjang masih kosong.' }, 400);
    const totalCups = items.reduce((a, i) => a + i.qty, 0);
    if (totalCups > MAX_CUPS) return json({ error: `Maksimal ${MAX_CUPS} cup per pesanan.` }, 400);
    const totalPrice = items.reduce((a, i) => a + i.total, 0);

    // Batas: semua customer per menit, dan pesanan belum dibayar per HP
    const minute = Math.floor(Date.now() / 60000);
    const rate = (await env.HUB_KV.get('pesan_rate', 'json')) || { minute: 0, count: 0 };
    if (rate.minute === minute && rate.count >= ORDERS_PER_MIN) return json({ error: 'Lagi ramai banget, coba sebentar lagi ya.' }, 429);
    const mine = await customerOrders(env, cid, 6);
    if (mine.filter(o => o.status === 'bayar').length >= MAX_UNPAID) return json({ error: 'Selesaikan atau batalkan dulu pesanan yang belum dibayar (lihat menu Pesananku).' }, 429);
    await env.HUB_KV.put('pesan_rate', JSON.stringify({ minute, count: rate.minute === minute ? rate.count + 1 : 1 }));

    const date = wibDate();
    const seqKey = 'pesan_seq_' + date;
    const no = (Number(await env.HUB_KV.get(seqKey)) || 0) + 1;
    await env.HUB_KV.put(seqKey, String(no), { expirationTtl: 3 * 86400 });

    const now = Date.now();
    const id = 'ON-' + now + '-' + Math.random().toString(36).slice(2, 6);
    const order = {
      id, no, cid, nick, gender, name, date,
      pickup, pickupMin, pickupLabel: pickup === 'now' ? 'Sekarang' : pickup.replace(':', '.'),
      items, totalCups, totalPrice,
      status: 'bayar', createdAt: now
    };
    await fb(env, 'PUT', 'online_orders/' + id, order);
    await fb(env, 'PATCH', 'online_customers/' + cid, { nick, gender, lastAt: now, ['orders/' + id]: now });
    return json({ order: publicOrder(order), qris: qrisWithAmount(env.TT_QRIS || QRIS_STATIC, totalPrice) });
  }

  if (path === '/api/pesan/paid' && method === 'POST') {
    const b = await readJson(request);
    const { order, error } = await ownOrder(env, b);
    if (error) return error;
    if (order.status !== 'bayar') return json({ order: publicOrder(order) });
    if (Date.now() - order.createdAt > (PAY_WINDOW_MIN + 30) * 60000) return json({ error: 'Pesanan ini sudah kedaluwarsa. Kalau sudah terlanjur bayar, tunjukkan bukti bayar ke kasir.' }, 409);
    const patch = { status: 'cek', paidClaimAt: Date.now(), payerName: cleanText(b.payerName, 40) };
    await fb(env, 'PATCH', 'online_orders/' + order.id, patch);
    Object.assign(order, patch);
    await pushKasir(env, ctx, notifPesanan(order, 1)).catch(() => {});
    // masuk daftar pengingat: dikirim ulang tiap menit oleh cron sampai kasir menanganinya
    const list = ((await env.HUB_KV.get(NUDGE_KEY, 'json')) || []).filter(x => x.id !== order.id);
    list.push({ id: order.id, sent: 1, last: Date.now() });
    await env.HUB_KV.put(NUDGE_KEY, JSON.stringify(list.slice(-30)));
    return json({ order: publicOrder(order) });
  }

  if (path === '/api/pesan/cancel' && method === 'POST') {
    const b = await readJson(request);
    const { order, error } = await ownOrder(env, b);
    if (error) return error;
    if (order.status !== 'bayar') return json({ error: 'Pesanan yang sudah dibayar tidak bisa dibatalkan dari sini. Hubungi kasir ya.' }, 409);
    const patch = { status: 'batal', cancelAt: Date.now(), cancelReason: 'Dibatalkan customer' };
    await fb(env, 'PATCH', 'online_orders/' + order.id, patch);
    return json({ order: publicOrder(Object.assign(order, patch)) });
  }

  if (path === '/api/pesan/orders' && method === 'GET') {
    const cid = cleanCid(url.searchParams.get('cid'));
    if (!cid) return json({ orders: [] });
    const list = await customerOrders(env, cid, 25);
    const qrisBase = env.TT_QRIS || QRIS_STATIC;
    return json({
      now: Date.now(),
      orders: list.map(o => {
        const p = publicOrder(o);
        if (p.status === 'bayar') p.qris = qrisWithAmount(qrisBase, o.totalPrice);
        return p;
      })
    });
  }

  return json({ error: 'Not found' }, 404);
}

// ---------- notifikasi berulang ke HP kasir ----------
function notifPesanan(order, ke) {
  return {
    title: (ke > 1 ? `⏰ PENGINGAT ${ke}/${NUDGE_MAX} · ` : '🔔 ') + 'PESANAN ONLINE #' + order.no,
    body: `${order.name} · ${rp(order.totalPrice)} · jemput ${order.pickupLabel}. ` + (ke > 1 ? 'Belum dicek! ' : '') + `Cek pembayaran QRIS${order.payerName ? ' a.n. ' + order.payerName : ''}.`,
    urgent: true, tag: 'online-' + order.id
  };
}
export async function nudgeKasir(env, ctx) {
  if (!env.HUB_KV) return;
  const list = await env.HUB_KV.get(NUDGE_KEY, 'json');
  if (!list || !list.length) return;
  const now = Date.now(), next = [];
  for (const it of list) {
    if (now - it.last < 50000) { next.push(it); continue; }
    const order = await fb(env, 'GET', 'online_orders/' + it.id).catch(() => undefined);
    if (order === undefined) { next.push(it); continue; }        // Firebase gagal: coba menit depan
    if (!order || order.status !== 'cek') continue;               // sudah ditangani / dihapus
    const ke = it.sent + 1;
    await pushKasir(env, ctx, notifPesanan(order, ke)).catch(() => {});
    if (ke < NUDGE_MAX) next.push({ ...it, sent: ke, last: now });
  }
  await env.HUB_KV.put(NUDGE_KEY, JSON.stringify(next));
}

// ---------- data ----------
function infoFrom(settings) {
  const nowMin = wibMinutes();
  const open = settings.open === true;
  let closedReason = '';
  if (!open) closedReason = 'Kedai sedang tutup. Coba lagi nanti ya!';
  else if (nowMin > CLOSE_MIN) closedReason = 'Pesanan online hari ini sudah ditutup (jam jemput terakhir 23.40). Sampai besok ya!';
  const photos = settings.photos || {};
  const off = settings.toppingOff || {};
  return {
    now: Date.now(),
    open, canOrder: !closedReason, closedReason,
    hours: { open: OPEN_MIN, close: CLOSE_MIN },
    payWindowMin: PAY_WINDOW_MIN, maxCups: MAX_CUPS,
    store: STORE,
    menu: MENU.map(m => ({ ...m, photo: safePhoto(photos[m.id]) || `/pesan/img/${m.id}.jpg` })),
    toppings: TOPPINGS.filter(t => !off[t]).map(t => ({ name: t, price: TOPPING_PRICE, photo: `/pesan/img/top-${t.toLowerCase()}.jpg` }))
  };
}
function safePhoto(u) {
  return typeof u === 'string' && /^\/api\/thaitea\/file\/[0-9a-f-]{36}\.(jpg|webp|png)$/.test(u) ? u : '';
}
async function customerOrders(env, cid, limit) {
  const idx = await fb(env, 'GET', 'online_customers/' + cid + '/orders');
  if (!idx) return [];
  const ids = Object.entries(idx).sort((a, b) => b[1] - a[1]).slice(0, limit).map(e => e[0]).filter(i => /^ON-[0-9a-z-]{10,40}$/.test(i));
  const orders = await Promise.all(ids.map(i => fb(env, 'GET', 'online_orders/' + i).catch(() => null)));
  return orders.filter(o => o && o.cid === cid).map(withExpiry);
}
async function ownOrder(env, b) {
  const cid = cleanCid(b.cid);
  const id = String(b.id || '');
  if (!cid || !/^ON-[0-9a-z-]{10,40}$/.test(id)) return { error: json({ error: 'Pesanan tidak ditemukan.' }, 404) };
  const order = await fb(env, 'GET', 'online_orders/' + id);
  if (!order || order.cid !== cid) return { error: json({ error: 'Pesanan tidak ditemukan.' }, 404) };
  return { order };
}
function withExpiry(o) {
  if (o.status === 'bayar' && Date.now() - (o.createdAt || 0) > PAY_WINDOW_MIN * 60000) o.status = 'kedaluwarsa';
  return o;
}
function publicOrder(o) {
  withExpiry(o);
  const keys = ['id', 'no', 'nick', 'gender', 'name', 'date', 'pickup', 'pickupLabel', 'items', 'totalCups', 'totalPrice', 'status',
    'createdAt', 'paidClaimAt', 'paidAt', 'readyAt', 'doneAt', 'cancelAt', 'cancelReason', 'payerName'];
  const out = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = o[k];
  out.expiresAt = (o.createdAt || 0) + PAY_WINDOW_MIN * 60000;
  return out;
}
async function fb(env, method, path, body) {
  const base = String(env.TT_FIREBASE_URL || DB_URL).replace(/\/+$/, '');
  let u = base + '/thaitea/' + path + '.json';
  if (env.TT_FIREBASE_SECRET) u += '?auth=' + encodeURIComponent(env.TT_FIREBASE_SECRET);
  const init = { method };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'Content-Type': 'application/json' }; }
  const res = await fetch(u, init);
  if (!res.ok) {
    console.error('firebase', method, path, res.status, await res.text().catch(() => ''));
    const e = new Error('Server kedai sedang bermasalah, coba lagi sebentar.'); e.status = 502; throw e;
  }
  return res.json();
}

// ---------- QRIS: QRIS statis → QRIS dengan nominal (tag 54) ----------
export function qrisWithAmount(base, amount) {
  const tags = [];
  for (let i = 0; i + 4 <= base.length;) {
    const tag = base.substr(i, 2), len = parseInt(base.substr(i + 2, 2), 10);
    tags.push([tag, base.substr(i + 4, len)]);
    i += 4 + len;
  }
  const t = tags.filter(([k]) => k !== '54' && k !== '63').map(([k, v]) => (k === '01' ? [k, '12'] : [k, v]));
  const at = t.findIndex(([k]) => k > '54');
  t.splice(at < 0 ? t.length : at, 0, ['54', String(Math.round(amount))]);
  const s = t.map(([k, v]) => k + String(v.length).padStart(2, '0') + v).join('') + '6304';
  return s + crc16(s);
}
function crc16(str) {
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

// ---------- util ----------
function wibNow() { return new Date(Date.now() + 7 * 3600000); }
function wibMinutes() { const d = wibNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
function wibDate() { return wibNow().toISOString().slice(0, 10); }
function rp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function cleanCid(v) { const s = String(v || ''); return /^[a-z0-9-]{20,64}$/.test(s) ? s : ''; }
function cleanText(v, max) { return String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
async function readJson(request) { try { return await request.json(); } catch (e) { return {}; } }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
