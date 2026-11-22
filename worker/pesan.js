/* =========================================================
   Pesan Online Kedai Thai Tea — halaman customer /pesan/
   Halaman customer TIDAK memakai Firebase langsung (kunci database kasir tidak ikut terbuka).
   Semua lewat route ini; Worker memeriksa jam buka, menghitung harga sendiri, lalu menulis ke
   Firebase kasir (project kasir-thai-tea) lewat REST:
     thaitea/online_settings            { mode: 'auto'|'tutup', toppingOff: {Keju:true}, photos: {menuId: url} }  ← diubah dari web kasir
                                        (auto = buka 11.30 AM – 11.45 PM WIB; tutup = tertutup terus)
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
     GET  /api/pesan/chat?cid=            Chat Resto: pesan antara customer & kedai
     POST /api/pesan/chat                 { cid, nick, gender, text } atau { ..., type:'image', url }  kirim pesan ke kedai
     POST /api/pesan/chat-del             { cid, id }  customer menghapus pesannya sendiri
     GET  /api/pesan/reviews?cid=         ulasan terbaru + rata-rata bintang (+ ulasan milik HP ini)
     POST /api/pesan/review               { cid, id, stars 1-5, text }  ulasan untuk pesanan yang sudah selesai
   Ulasan: thaitea/reviews/<orderId>  { id, orderId, no, ts, stars, text, nick, gender, items }
   Chat Resto disimpan di tempat yang sama dengan chat kasir supaya tampil di menu Chat kasir:
     thaitea/chat/cs_<hash cid>/<id>    { id, ts, from: 'cs', name, text }  (balasan kasir: from = nama kasir)
     thaitea/cs_rooms/cs_<hash cid>     { nick, gender, lastTs, lastText }
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
const OPEN_MIN = 11 * 60 + 30;     // 11.30 AM WIB — buka otomatis
const CLOSE_MIN = 23 * 60 + 45;    // 11.45 PM WIB — tutup otomatis
// format 12 jam: 690 → "11.30 AM"
const jam12 = m => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return `${((h + 11) % 12) + 1}.${mm} ${h < 12 ? 'AM' : 'PM'}`; };
const JAM_TXT = `${jam12(OPEN_MIN)} – ${jam12(CLOSE_MIN)}`;
const PAY_WINDOW_MIN = 20;         // batas waktu bayar QRIS
const MAX_CUPS = 30;
const MAX_UNPAID = 2;              // pesanan belum dibayar per HP
const ORDERS_PER_MIN = 20;         // semua customer
const TOPPING_PRICE = 3000;
const NUDGE_MAX = 10;              // jumlah notifikasi ke kasir per pesanan (termasuk yang pertama)
const NUDGE_KEY = 'pesan_cek';

// Sama dengan MENU_DATABASE di public/thaitea/index.html (Es Teler sudah tidak dijual)
const MENU = [
  ['ttp-ori', 'Thai Tea Premium', 15000, 'thai-premium', 'Thai Tea Premium'],
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

    // Jam jemput: "now" atau "HH:MM" (11.30 AM – 11.45 PM, tidak boleh sudah lewat)
    const nowMin = wibMinutes();
    let pickup = 'now', pickupMin = nowMin;
    if (b.pickup === 'now') {
      if (nowMin < OPEN_MIN || nowMin > CLOSE_MIN) return json({ error: `Pilihan "Sekarang" hanya bisa jam ${JAM_TXT}. Pilih jam jemput.` }, 400);
    } else {
      const m = /^(\d{2}):(\d{2})$/.exec(String(b.pickup || ''));
      if (!m) return json({ error: 'Pilih dulu jam jemputnya.' }, 400);
      pickupMin = Number(m[1]) * 60 + Number(m[2]);
      if (pickupMin < OPEN_MIN || pickupMin > CLOSE_MIN) return json({ error: `Jam jemput hanya bisa ${JAM_TXT}.` }, 400);
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
      pickup, pickupMin, pickupLabel: pickup === 'now' ? 'Sekarang' : jam12(pickupMin),
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

  if (path === '/api/pesan/chat' && method === 'GET') {
    const cid = cleanCid(url.searchParams.get('cid'));
    if (!cid) return json({ msgs: [] });
    const room = await roomOf(cid);
    const data = await fb(env, 'GET', 'chat/' + room, undefined, 'orderBy="$key"&limitToLast=150');
    const msgs = Object.values(data || {}).filter(m => m && m.ts).sort((a, b) => a.ts - b.ts).map(m => ({
      id: m.id, ts: m.ts, me: m.from === 'cs', name: '',   // nama HP kasir tidak ditampilkan ke customer
      type: m.type || 'text', text: m.text || '', url: safeFile(m.url), dur: m.dur || 0
    }));
    return json({ now: Date.now(), msgs });
  }

  if (path === '/api/pesan/chat' && method === 'POST') {
    const b = await readJson(request);
    const cid = cleanCid(b.cid);
    const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 600);
    const isImg = b.type === 'image';
    const furl = isImg ? safeFile(b.url) : '';
    if (!cid) return json({ error: 'Data HP tidak dikenali, muat ulang halaman.' }, 400);
    if (isImg ? !furl : !text) return json({ error: isImg ? 'Foto gagal dikirim, coba lagi.' : 'Pesan kosong.' }, 400);
    const nick = cleanText(b.nick, 24) || 'Customer';
    const gender = b.gender === 'L' ? 'L' : b.gender === 'P' ? 'P' : '';
    const minute = Math.floor(Date.now() / 60000);
    const rate = (await env.HUB_KV.get('pesan_chat_rate', 'json')) || { minute: 0, count: 0 };
    if (rate.minute === minute && rate.count >= 60) return json({ error: 'Lagi ramai, coba kirim lagi sebentar ya.' }, 429);
    await env.HUB_KV.put('pesan_chat_rate', JSON.stringify({ minute, count: rate.minute === minute ? rate.count + 1 : 1 }));
    const room = await roomOf(cid);
    const ts = Date.now();
    const id = 'M' + ts + Math.random().toString(36).slice(2, 6);
    const msg = isImg ? { id, ts, from: 'cs', name: nick, type: 'image', url: furl } : { id, ts, from: 'cs', name: nick, text };
    await fb(env, 'PUT', 'chat/' + room + '/' + id, msg);
    const preview = isImg ? 'Mengirim foto' : text;
    const meta = (await fb(env, 'GET', 'cs_rooms/' + room)) || {};
    await fb(env, 'PATCH', 'cs_rooms/' + room, { nick, gender, lastTs: ts, lastText: preview.slice(0, 80) });
    // notifikasi ke HP kasir, paling sering sekali per 30 detik per customer
    if (!meta.lastPush || ts - meta.lastPush > 30000) {
      await fb(env, 'PATCH', 'cs_rooms/' + room, { lastPush: ts });
      await pushKasir(env, ctx, { title: '💬 Chat Resto · ' + nick, body: preview.slice(0, 200), tag: 'chat-' + room }).catch(() => {});
    }
    return json({ ok: true, msg: { id, ts, me: true, name: '', type: isImg ? 'image' : 'text', text: isImg ? '' : text, url: furl } });
  }

  if (path === '/api/pesan/chat-del' && method === 'POST') {
    const b = await readJson(request);
    const cid = cleanCid(b.cid);
    const id = String(b.id || '');
    if (!cid || !/^M[0-9a-z]{8,30}$/.test(id)) return json({ error: 'Pesan tidak ditemukan.' }, 404);
    const room = await roomOf(cid);
    const m = await fb(env, 'GET', 'chat/' + room + '/' + id);
    if (!m || m.from !== 'cs') return json({ error: 'Hanya pesanmu sendiri yang bisa dihapus.' }, 403);
    await fb(env, 'DELETE', 'chat/' + room + '/' + id);
    return json({ ok: true });
  }

  if (path === '/api/pesan/reviews' && method === 'GET') {
    const cid = cleanCid(url.searchParams.get('cid'));
    const data = (await fb(env, 'GET', 'reviews')) || {};
    const all = Object.values(data).filter(v => v && v.stars).sort((a, b) => b.ts - a.ts);
    const avg = all.length ? all.reduce((a, v) => a + v.stars, 0) / all.length : 0;
    const pub = v => ({ id: v.orderId, ts: v.ts, stars: v.stars, text: v.text || '', nick: v.nick || 'Customer', gender: v.gender || '', reply: v.reply || '' });
    const mine = cid ? all.filter(v => v.cid === cid).map(v => v.orderId) : [];
    return json({ avg: Math.round(avg * 10) / 10, count: all.length, list: all.slice(0, 40).map(pub), mine });
  }

  if (path === '/api/pesan/review' && method === 'POST') {
    const b = await readJson(request);
    const { order, error } = await ownOrder(env, b);
    if (error) return error;
    if (order.status !== 'selesai') return json({ error: 'Ulasan bisa diberikan setelah pesanan diambil.' }, 409);
    const stars = Math.round(Number(b.stars));
    if (!(stars >= 1 && stars <= 5)) return json({ error: 'Pilih jumlah bintang dulu ya.' }, 400);
    const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').trim().slice(0, 400);
    const old = await fb(env, 'GET', 'reviews/' + order.id);
    if (old && old.stars) return json({ error: 'Pesanan ini sudah kamu beri ulasan. Terima kasih!' }, 409);
    const rev = { id: order.id, orderId: order.id, no: order.no || '', cid: order.cid, ts: Date.now(), stars, text, nick: order.nick || order.name || 'Customer', gender: order.gender || '',
      items: (order.items || []).map(it => `${it.qty || 1}× ${it.name}`).join(', ').slice(0, 200) };
    await fb(env, 'PUT', 'reviews/' + order.id, rev);
    await pushKasir(env, ctx, { title: `⭐ Ulasan baru ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, body: `${rev.nick}: ${text || '(tanpa komentar)'}`.slice(0, 200), tag: 'review-' + order.id }).catch(() => {});
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

async function roomOf(cid) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tt-chat:' + cid)));
  return 'cs_' + Array.from(h.slice(0, 10), x => x.toString(16).padStart(2, '0')).join('');
}
function safeFile(u) { return typeof u === 'string' && /^\/api\/thaitea\/file\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(u) ? u : ''; }

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
  const mode = settings.mode === 'tutup' ? 'tutup' : 'auto';
  const open = mode === 'auto' && nowMin >= OPEN_MIN && nowMin <= CLOSE_MIN;
  let closedReason = '';
  if (mode === 'tutup') closedReason = 'Kedai sedang tutup. Coba lagi nanti ya!';
  else if (nowMin < OPEN_MIN || nowMin > CLOSE_MIN) closedReason = `Pesanan online buka jam ${jam12(OPEN_MIN)}. Coba lagi nanti ya!`;
  const photos = settings.photos || {};
  const off = settings.toppingOff || {};
  return {
    now: Date.now(),
    open, mode, canOrder: !closedReason, closedReason,
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
async function fb(env, method, path, body, query) {
  const base = String(env.TT_FIREBASE_URL || DB_URL).replace(/\/+$/, '');
  const q = [];
  if (query) q.push(query);
  if (env.TT_FIREBASE_SECRET) q.push('auth=' + encodeURIComponent(env.TT_FIREBASE_SECRET));
  const u = base + '/thaitea/' + path + '.json' + (q.length ? '?' + q.join('&') : '');
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
