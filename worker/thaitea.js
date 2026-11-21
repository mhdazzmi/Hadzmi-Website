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
     GET  /api/thaitea/pending?endpoint=&since=
   ========================================================= */
import { getVapid, sendPush } from './index.js';

const SUBS = 'tt_subs';
const OUTBOX = 'tt_outbox';
const MAX_SUBS = 60;
const OUTBOX_MAX = 40;
const RATE_PER_MIN = 30;

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
    next.push({ endpoint, name: cleanText(b.name, 30) || 'Seseorang', at: Date.now() });
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
    const title = cleanText(b.title, 60) || 'Thai Tea';
    const body = cleanText(b.body, 240);
    if (!body) return json({ error: 'Isi kosong' }, 400);
    const now = Date.now();
    const outbox = await kvGet(env, OUTBOX, []);
    if (outbox.filter(i => i.ts > now - 60000).length >= RATE_PER_MIN) return json({ error: 'Terlalu banyak notifikasi' }, 429);
    outbox.push({ id: 'tt-' + now + '-' + Math.random().toString(36).slice(2, 6), ts: now, title, body });
    await env.HUB_KV.put(OUTBOX, JSON.stringify(outbox.slice(-OUTBOX_MAX)));

    const from = cleanEndpoint(b.from);
    const subs = await kvGet(env, SUBS, []);
    const targets = subs.filter(s => s.endpoint !== from);
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
    return json({ ok: true, sentTo: targets.length });
  }

  if (path === '/api/thaitea/pending' && method === 'GET') {
    const endpoint = cleanEndpoint(url.searchParams.get('endpoint'));
    const since = Number(url.searchParams.get('since') || 0);
    const subs = await kvGet(env, SUBS, []);
    if (!endpoint || !subs.some(s => s.endpoint === endpoint)) return json({ error: 'Unknown subscription' }, 403);
    const outbox = await kvGet(env, OUTBOX, []);
    const minTs = since > 0 ? since : Date.now() - 15 * 60000;
    return json({ items: outbox.filter(i => i.ts > minTs).slice(-10), now: Date.now() });
  }

  return json({ error: 'Not found' }, 404);
}

function cleanEndpoint(v) {
  const s = String(v || '');
  if (s.length > 1000 || !/^https:\/\/[^\s]+$/.test(s)) return '';
  return s;
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
