/* =========================================================
   Kasir Thai Tea — notifikasi Web Push (terpisah dari akun Nexa)
   Tidak memakai login Nexa. Daftar HP disimpan di KV dengan kunci sendiri:
     tt_subs   = HP yang mengaktifkan notifikasi
     tt_outbox = isi notifikasi terakhir (diambil service worker /thaitea/sw.js)
   Route:
     GET  /api/thaitea/config       → kunci publik VAPID
     POST /api/thaitea/subscribe    { endpoint, name }
     POST /api/thaitea/unsubscribe  { endpoint }
     POST /api/thaitea/notify       { title, body, from }   (from = endpoint pengirim, tidak ikut dikirimi)
                                    (pesanan online memakai pushKasir() langsung, lihat worker/pesan.js)
     GET  /api/thaitea/pending?endpoint=&since=
     POST /api/thaitea/upload       (body = file mentah; Content-Type image/* (maks 4 MB) atau audio/* (maks 60 MB)) → { url }
     GET  /api/thaitea/file/<id>    → foto / pesan suara chat & foto profil (Cloudflare R2, folder thaitea/)
   ========================================================= */
import { getVapid, sendPush } from './index.js';

const SUBS = 'tt_subs';
const OUTBOX = 'tt_outbox';
const MAX_SUBS = 60;
const OUTBOX_MAX = 40;
const RATE_PER_MIN = 30;
const MAX_UPLOAD = 4 * 1024 * 1024;               // 4 MB per foto (foto sudah dikecilkan di HP)
const MAX_AUDIO = 60 * 1024 * 1024;               // 60 MB per suara (lagu / bacaan ayat di menu Hiburan)
const UPLOAD_PER_MIN = 40;
const R2_SAFE_LIMIT = 9 * 1024 * 1024 * 1024;     // sama dengan batas aman Nexa (kuota gratis 10 GB)
const FILE_ID_RE = /^[0-9a-f-]{36}\.(jpg|webp|png|webm|m4a|ogg|mp3|aac|wav|flac)$/;
const TYPES = {
  'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png',
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/flac': 'flac'
};
const EXT_TYPE = { jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png', webm: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac' };

export async function handleThaiTea(request, env, url, ctx) {
  if (!env.HUB_KV) return json({ error: 'KV belum diatur' }, 503);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  if (path === '/api/thaitea/config' && method === 'GET') {
    let v = await getVapid(env, false);
    if (!v) v = await getVapid(env, true);
    return json({ vapidPublicKey: v ? v.publicKey : null });
  }

  if (path === '/api/thaitea/subscribe' && method === 'POST') {
    const b = await readJson(request);
    const endpoint = cleanEndpoint(b.endpoint);
    if (!endpoint) return json({ error: 'Endpoint tidak valid' }, 400);
    const subs = await kvGet(env, SUBS, []);
    const next = subs.filter(s => s.endpoint !== endpoint);
    next.push({ endpoint, name: cleanText(b.name, 30) || 'Seseorang', user: cleanKey(b.user), at: Date.now() });
    await env.HUB_KV.put(SUBS, JSON.stringify(next.slice(-MAX_SUBS)));
    return json({ ok: true, devices: next.length });
  }

  if (path === '/api/thaitea/unsubscribe' && method === 'POST') {
    const b = await readJson(request);
    const endpoint = cleanEndpoint(b.endpoint);
    const subs = await kvGet(env, SUBS, []);
    const next = subs.filter(s => s.endpoint !== endpoint);
    if (next.length !== subs.length) await env.HUB_KV.put(SUBS, JSON.stringify(next));
    return json({ ok: true });
  }

  if (path === '/api/thaitea/notify' && method === 'POST') {
    const b = await readJson(request);
    const r = await pushKasir(env, ctx, { title: b.title, body: b.body, to: b.to, from: b.from });
    if (r.error) return json({ error: r.error }, r.status);
    return json({ ok: true, sentTo: r.sentTo });
  }

  if (path === '/api/thaitea/pending' && method === 'GET') {
    const endpoint = cleanEndpoint(url.searchParams.get('endpoint'));
    const since = Number(url.searchParams.get('since') || 0);
    const subs = await kvGet(env, SUBS, []);
    if (!endpoint || !subs.some(s => s.endpoint === endpoint)) return json({ error: 'Unknown subscription' }, 403);
    const outbox = await kvGet(env, OUTBOX, []);
    const minTs = since > 0 ? since : Date.now() - 15 * 60000;
    const me = subs.find(s => s.endpoint === endpoint);
    const items = outbox.filter(i => i.ts > minTs && (!i.to || i.to === me.user)).slice(-10);
    return json({ items, now: Date.now() });
  }

  if (path === '/api/thaitea/upload' && method === 'POST') {
    if (!env.FILES) return json({ error: 'Penyimpanan R2 belum aktif' }, 503);
    const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return json({ error: 'Jenis file tidak didukung' }, 415);
    const len = Number(request.headers.get('Content-Length') || 0);
    const maxSize = type.startsWith('audio/') ? MAX_AUDIO : MAX_UPLOAD;
    if (len > maxSize) return json({ error: 'File terlalu besar (maks ' + Math.round(maxSize / 1048576) + ' MB)' }, 413);
    // batas unggahan per menit (mencegah penyalahgunaan)
    const minute = Math.floor(Date.now() / 60000);
    const rate = await kvGet(env, 'tt_upload_rate', { minute: 0, count: 0 });
    if (rate.minute === minute && rate.count >= UPLOAD_PER_MIN) return json({ error: 'Terlalu banyak unggahan, coba sebentar lagi' }, 429);
    await env.HUB_KV.put('tt_upload_rate', JSON.stringify({ minute, count: rate.minute === minute ? rate.count + 1 : 1 }));
    const used = Number(await env.HUB_KV.get('r2_bytes')) || 0;
    if (used + (len || maxSize) > R2_SAFE_LIMIT) return json({ error: 'Penyimpanan hampir penuh' }, 507);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > maxSize) return json({ error: 'File kosong atau terlalu besar' }, 413);
    const id = crypto.randomUUID() + '.' + ext;
    await env.FILES.put('thaitea/' + id, buf, { httpMetadata: { contentType: type } });
    await env.HUB_KV.put('r2_bytes', String(used + buf.byteLength));
    return json({ ok: true, url: '/api/thaitea/file/' + id, size: buf.byteLength });
  }

  const fileMatch = /^\/api\/thaitea\/file\/([A-Za-z0-9.-]{20,60})$/.exec(path);
  if (fileMatch && method === 'GET') {
    const id = fileMatch[1];
    if (!FILE_ID_RE.test(id) || !env.FILES) return json({ error: 'Not found' }, 404);
    const obj = await env.FILES.get('thaitea/' + id, { range: request.headers });
    if (!obj) return json({ error: 'Not found' }, 404);
    const headers = new Headers();
    headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || EXT_TYPE[id.split('.').pop()] || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('ETag', obj.httpEtag);
    if (obj.range && request.headers.get('Range')) {
      const off = obj.range.offset || 0, ln = obj.range.length || obj.size - off;
      headers.set('Content-Range', `bytes ${off}-${off + ln - 1}/${obj.size}`);
      headers.set('Content-Length', String(ln));
      return new Response(obj.body, { status: 206, headers });
    }
    headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers });
  }

  return json({ error: 'Not found' }, 404);
}

// Kirim notifikasi ke HP kasir. Dipakai /api/thaitea/notify dan pesanan online (/api/pesan/*).
// urgent = notifikasi tetap tampil sampai disentuh (pesanan online baru)
export async function pushKasir(env, ctx, { title, body, to, from, urgent }) {
  title = cleanText(title, 60) || 'Thai Tea';
  body = cleanText(body, 240);
  if (!body) return { error: 'Isi kosong', status: 400 };
  to = cleanKey(to);
  const now = Date.now();
  const outbox = await kvGet(env, OUTBOX, []);
  if (outbox.filter(i => i.ts > now - 60000).length >= RATE_PER_MIN) return { error: 'Terlalu banyak notifikasi', status: 429 };
  outbox.push({ id: 'tt-' + now + '-' + Math.random().toString(36).slice(2, 6), ts: now, title, body, to: to || undefined, urgent: urgent ? true : undefined });
  await env.HUB_KV.put(OUTBOX, JSON.stringify(outbox.slice(-OUTBOX_MAX)));

  from = cleanEndpoint(from);
  const subs = await kvGet(env, SUBS, []);
  const targets = subs.filter(s => s.endpoint !== from && (!to || s.user === to));
  const work = (async () => {
    const vapid = await getVapid(env, true);
    const results = await Promise.all(targets.map(s => sendPush(s, env, vapid).then(st => ({ s, st })).catch(() => ({ s, st: 0 }))));
    const gone = new Set(results.filter(r => r.st === 404 || r.st === 410).map(r => r.s.endpoint));
    if (gone.size) {
      const fresh = await kvGet(env, SUBS, []);
      await env.HUB_KV.put(SUBS, JSON.stringify(fresh.filter(s => !gone.has(s.endpoint))));
    }
  })().catch(err => console.error('thaitea push', err && err.stack || err));
  if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
  return { sentTo: targets.length };
}

function cleanEndpoint(v) {
  const s = String(v || '');
  if (s.length > 1000 || !/^https:\/\/[^\s]+$/.test(s)) return '';
  return s;
}
function cleanKey(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}
function cleanText(v, max) {
  return String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}
async function kvGet(env, key, fallback) {
  const v = await env.HUB_KV.get(key, 'json');
  return v === null || v === undefined ? fallback : v;
}
async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
