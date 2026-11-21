/* =========================================================
   Nexa — Cloudflare Worker
   - Melayani file statis (folder public/) lewat binding ASSETS
   - API /api/* : langganan push, jadwal pengingat, inbox
   - Cron tiap menit: kirim Web Push (VAPID) untuk pengingat yang jatuh tempo,
     sehingga notifikasi tetap masuk walau website tertutup.

   Binding & variabel (lihat wrangler.jsonc):
     HUB_KV               KV namespace
     FIREBASE_PROJECT_ID  id project Firebase (untuk verifikasi login)
     OWNER_UID            UID akun Firebase pemilik (WAJIB)
     VAPID_SUBJECT        "mailto:emailkamu@gmail.com"
     VAPID_PRIVATE_JWK    (opsional, secret) — jika kosong, kunci dibuat otomatis & disimpan di KV
   ========================================================= */

import { healthcareAi } from './healthcare.js';
import { handleNexo } from './nexo.js';
import { handleThaiTea } from './thaitea.js';
export { NexoHub } from './nexo.js';

const GOOGLE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_EVENTS = 400;
const OUTBOX_MAX = 60;
const SUBS_MAX = 12;
const SENT_TTL_MS = 40 * 86400000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;         // batas nilai KV
const MAX_R2_FILE = 300 * 1024 * 1024;            // per file di R2
const MAX_DRIVE_FILE = 30 * 1024 * 1024;          // batas aman Apps Script
const R2_SAFE_LIMIT = 9 * 1024 * 1024 * 1024;     // berhenti di 9 GB agar tidak lewat kuota gratis 10 GB
const FILE_ID_RE = /^(r2-[0-9a-f-]{36}|gd-[A-Za-z0-9_-]{10,120}|[0-9a-f-]{36})$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!env.ASSETS) return new Response('Not found', { status: 404 });
      const res = await env.ASSETS.fetch(request);
      // Link preview (WhatsApp/Telegram/iMessage) butuh URL gambar absolut
      if (/^\/games\/?(index\.html)?$/.test(url.pathname) && (res.headers.get('Content-Type') || '').includes('text/html')) {
        return new HTMLRewriter().on('meta[data-abs]', { element(e) { const v = e.getAttribute('content') || ''; if (v.startsWith('/')) e.setAttribute('content', url.origin + v); } }).transform(res);
      }
      return res;
    }
    try {
      return await handleApi(request, env, url, ctx);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      if (status >= 500) console.error('API error', err && err.stack || err);
      return json({ error: (err && err.message) || 'Internal error' }, status);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).catch(err => console.error('cron error', err && err.stack || err)));
    ctx.waitUntil(checkStorageAlerts(env).catch(err => console.error('storage alert error', err)));
  }
};

// ---------------- API ----------------
async function handleApi(request, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  if (path === '/api/config' && method === 'GET') {
    const ready = isConfigured(env);
    let vapidPublicKey = null;
    if (ready.ok) { try { const v = await getVapid(env, false); vapidPublicKey = v ? v.publicKey : null; } catch (e) { console.error('vapid', e && e.stack || e); } }
    return json({ pushReady: ready.ok, missing: ready.missing, vapidPublicKey, gemini: !!env.GEMINI_API_KEY, stores: { r2: !!env.FILES, drive: !!(env.DRIVE_SCRIPT_URL && env.DRIVE_SECRET), kv: !!env.HUB_KV } });
  }

  // ---- Nexo Games (akun teman sendiri, tidak memakai login Firebase pemilik) ----
  if (path.startsWith('/api/nexo/')) return handleNexo(request, env, url);
  // ---- Kasir Thai Tea: notifikasi untuk HP orang tua (tanpa login Nexa) ----
  if (path.startsWith('/api/thaitea/')) return handleThaiTea(request, env, url, ctx);

  // Dipanggil service worker (tanpa token login): endpoint langganan berfungsi sebagai kunci akses.
  if (path === '/api/pending' && method === 'GET') {
    requireKV(env);
    const endpoint = url.searchParams.get('endpoint') || '';
    const since = Number(url.searchParams.get('since') || 0);
    const subs = await kvGet(env, 'subs', []);
    if (!endpoint || !subs.some(s => s.endpoint === endpoint)) throw httpError(403, 'Unknown subscription');
    const outbox = await kvGet(env, 'outbox', []);
    const minTs = since > 0 ? since : Date.now() - 15 * 60000;
    const items = outbox.filter(i => i.ts > minTs).slice(-10);
    return json({ items, now: Date.now() });
  }

  const fileMatch = /^\/api\/files\/([A-Za-z0-9_-]{8,200})$/.exec(path);
  if (fileMatch && method === 'GET') {
    const id = fileMatch[1];
    if (!FILE_ID_RE.test(id)) throw httpError(404, 'Not found');
    const exp = Number(url.searchParams.get('exp') || 0), sig = url.searchParams.get('sig');
    let signed = false;
    if (sig && exp) {
      if (exp < Date.now() / 1000) throw httpError(403, 'Link kedaluwarsa');
      const key = await getSignKey(env, false);
      if (!key || (await hmac(key, id + '.' + exp)) !== sig) throw httpError(403, 'Link tidak valid');
      signed = true;
    } else {
      await requireAuth(request, env);
    }
    return getFile(id, env, request, signed);
  }

  // ---- Semua route di bawah ini wajib login (Firebase ID token milik OWNER_UID) ----
  const user = await requireAuth(request, env);
  requireKV(env);

  // ---- Nexa Health: analisis gizi dengan Gemini ----
  if (path === '/api/healthcare/ai' && method === 'POST') return healthcareAi(request, env);

  // ---- Penyimpanan file (R2 / Google Drive / KV lama) ----
  if (path === '/api/files' && method === 'POST') return uploadFile(request, env, url);
  if (fileMatch && method === 'DELETE') { await deleteFile(fileMatch[1], env); return json({ ok: true }); }
  if (path === '/api/sign' && method === 'POST') {
    const body = await readJson(request);
    const ids = (body.ids || []).filter(id => FILE_ID_RE.test(id)).slice(0, 500);
    const days = Math.min(30, Math.max(1, Number(body.days) || 7));
    const exp = Math.floor(Date.now() / 1000) + days * 86400;
    const key = await getSignKey(env, true);
    const urls = {};
    for (const id of ids) urls[id] = `/api/files/${id}?exp=${exp}&sig=${await hmac(key, id + '.' + exp)}`;
    return json({ urls, exp });
  }
  if (path === '/api/storage-usage' && method === 'GET') return json(await storageUsage(env, url.searchParams.get('recount') === '1'));
  if (path === '/api/proxy' && method === 'GET') {
    const target = url.searchParams.get('url') || '';
    if (!/^https?:\/\//i.test(target)) throw httpError(400, 'URL tidak valid');
    const res = await fetch(target, { redirect: 'follow' });
    if (!res.ok) throw httpError(502, 'Sumber menolak (' + res.status + ')');
    return new Response(res.body, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
  }


  if (path === '/api/setup-vapid' && method === 'POST') {
    const v = await getVapid(env, true);
    return json({ vapidPublicKey: v.publicKey });
  }

  if (path === '/api/subscribe' && method === 'POST') {
    const body = await readJson(request);
    const sub = body && body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) && !env.ALLOW_INSECURE_ENDPOINTS) throw httpError(400, 'Invalid subscription');
    let subs = (await kvGet(env, 'subs', [])).filter(s => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: sub.keys || null, label: String(body.label || '').slice(0, 60), createdAt: Date.now() });
    subs = subs.slice(-SUBS_MAX);
    await env.HUB_KV.put('subs', JSON.stringify(subs));
    return json({ ok: true, devices: subs.length });
  }

  if (path === '/api/unsubscribe' && method === 'POST') {
    const body = await readJson(request);
    const subs = await kvGet(env, 'subs', []);
    const next = subs.filter(s => s.endpoint !== (body && body.endpoint));
    if (next.length !== subs.length) await env.HUB_KV.put('subs', JSON.stringify(next));
    return json({ ok: true, devices: next.length });
  }

  if (path === '/api/schedule' && method === 'POST') {
    const body = await readJson(request);
    const events = sanitizeEvents(body && body.events);
    await env.HUB_KV.put('schedule', JSON.stringify({ events, updatedAt: Date.now(), by: user.uid }));
    return json({ ok: true, count: events.length });
  }

  if (path === '/api/inbox' && method === 'GET') {
    const outbox = await kvGet(env, 'outbox', []);
    return json({ items: outbox.slice(-50) });
  }

  if (path === '/api/status' && method === 'GET') {
    const [subs, schedule] = await Promise.all([kvGet(env, 'subs', []), kvGet(env, 'schedule', { events: [] })]);
    const now = Date.now();
    const upcoming = (schedule.events || []).filter(e => e.until > now).sort((a, b) => a.at - b.at).slice(0, 5)
      .map(e => ({ title: e.title, body: e.body, at: e.at }));
    return json({ devices: subs.map(s => ({ label: s.label, createdAt: s.createdAt })), scheduleUpdatedAt: schedule.updatedAt || null, scheduled: (schedule.events || []).length, upcoming });
  }

  if (path === '/api/test-push' && method === 'POST') {
    const now = Date.now();
    const item = { id: 'test:' + now, key: 'test_' + now, title: 'Tes Push dari Server ✅', body: 'Push notification Nexa berfungsi, walau website tertutup.', icon: 'fa-paper-plane', color: 'bg-green', action: null, ts: now };
    const outbox = (await kvGet(env, 'outbox', [])).concat(item).slice(-OUTBOX_MAX);
    await env.HUB_KV.put('outbox', JSON.stringify(outbox));
    const results = await pushAll(env);
    return json({ ok: true, results });
  }

  throw httpError(404, 'Not found');
}

// ---------------- CRON ----------------
export async function runCron(env, nowOverride) {
  if (!env.HUB_KV) return { skipped: true };
  const now = nowOverride || Date.now();
  const schedule = await kvGet(env, 'schedule', null);
  if (!schedule || !Array.isArray(schedule.events)) return { due: 0 };
  const due = schedule.events.filter(e => e.at <= now && now < e.until);
  if (!due.length) return { due: 0 };

  const sent = await kvGet(env, 'sent', {});
  const fresh = due.filter(e => !sent[e.key]);
  if (!fresh.length) return { due: 0 };

  const outbox = await kvGet(env, 'outbox', []);
  fresh.forEach((e, i) => {
    sent[e.key] = now;
    outbox.push({ id: e.key + ':' + now, key: e.key, title: e.title, body: e.body, icon: e.icon, color: e.color, action: e.action || null, ts: now + i });
  });
  for (const k of Object.keys(sent)) if (now - sent[k] > SENT_TTL_MS) delete sent[k];
  await Promise.all([
    env.HUB_KV.put('sent', JSON.stringify(sent)),
    env.HUB_KV.put('outbox', JSON.stringify(outbox.slice(-OUTBOX_MAX)))
  ]);
  const results = await pushAll(env);
  return { due: fresh.length, results };
}

async function pushAll(env) {
  const subs = await kvGet(env, 'subs', []);
  if (!subs.length) return [];
  const vapid = await getVapid(env, false);
  if (!vapid) return [];
  const results = await Promise.all(subs.map(async s => {
    try { return { label: s.label, status: await sendPush(s, env, vapid) }; }
    catch (e) { return { label: s.label, status: 0, error: String(e && e.message || e) }; }
  }));
  const gone = new Set(subs.filter((s, i) => results[i].status === 404 || results[i].status === 410).map(s => s.endpoint));
  if (gone.size) await env.HUB_KV.put('subs', JSON.stringify(subs.filter(s => !gone.has(s.endpoint))));
  return results;
}

// ---------------- WEB PUSH (VAPID, tanpa payload) ----------------
// Push dikirim tanpa isi; service worker mengambil isi notifikasi dari /api/pending.
// Dengan begitu tidak perlu enkripsi payload (RFC 8291) dan isi tetap privat di server ini.
let vapidCache = null;
// Kunci VAPID: dari secret VAPID_PRIVATE_JWK jika ada; jika tidak, dibuat SEKALI lewat POST /api/setup-vapid
// (dipanggil otomatis saat pertama kali mengaktifkan push) lalu disimpan di KV.
// Pembacaan biasa/cron TIDAK pernah membuat kunci baru, agar kunci tidak berganti karena KV eventually-consistent.
async function loadVapidJwk(env, create) {
  if (env.VAPID_PRIVATE_JWK) return JSON.parse(env.VAPID_PRIVATE_JWK);
  if (!env.HUB_KV) throw httpError(503, 'KV belum diatur');
  let jwk = await env.HUB_KV.get('vapid_jwk', 'json');
  if (!jwk && !create) return null;
  if (!jwk) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const full = await crypto.subtle.exportKey('jwk', kp.privateKey);
    jwk = { kty: 'EC', crv: 'P-256', x: full.x, y: full.y, d: full.d };
    await env.HUB_KV.put('vapid_jwk', JSON.stringify(jwk));
  }
  return jwk;
}
export async function getVapid(env, create) {
  if (vapidCache && !env.VAPID_PRIVATE_JWK) return vapidCache;
  const jwk = await loadVapidJwk(env, create);
  if (!jwk) return null;
  if (vapidCache && vapidCache.x === jwk.x) return vapidCache;
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const pub = concatBytes(new Uint8Array([4]), b64urlDecode(jwk.x), b64urlDecode(jwk.y));
  vapidCache = { x: jwk.x, key, publicKey: b64urlEncode(pub) };
  return vapidCache;
}

export async function vapidJwt(audience, env, vapid) {
  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(enc.encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:hadzmi-hub@example.com'
  })));
  const data = enc.encode(header + '.' + payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.key, data));
  return header + '.' + payload + '.' + b64urlEncode(sig);
}

export async function sendPush(sub, env, vapid) {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(audience, env, vapid);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`, 'Content-Length': '0' }
  });
  if (res.status >= 400) console.warn('push failed', res.status, await res.text().catch(() => ''));
  return res.status;
}

// ---------------- FIREBASE ID TOKEN ----------------
let jwksCache = { at: 0, keys: null };
async function getJwks(env) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600000) return jwksCache.keys;
  const res = await fetch(env.JWKS_URL || GOOGLE_JWKS, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw httpError(503, 'Cannot fetch Firebase signing keys');
  const data = await res.json();
  jwksCache = { at: Date.now(), keys: data.keys || [] };
  return jwksCache.keys;
}

export async function verifyFirebaseToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Malformed token');
  const dec = new TextDecoder();
  const header = JSON.parse(dec.decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(dec.decode(b64urlDecode(parts[1])));
  if (header.alg !== 'RS256') throw httpError(401, 'Bad token algorithm');
  const keys = await getJwks(env);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw httpError(401, 'Unknown token key');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw httpError(401, 'Bad token signature');
  const now = Math.floor(Date.now() / 1000);
  const project = env.FIREBASE_PROJECT_ID;
  if (payload.aud !== project || payload.iss !== `https://securetoken.google.com/${project}`) throw httpError(401, 'Token for another project');
  if (!payload.exp || payload.exp < now - 30) throw httpError(401, 'Token expired');
  if (payload.iat && payload.iat > now + 300) throw httpError(401, 'Token from the future');
  if (!payload.sub) throw httpError(401, 'Token without user');
  return { uid: payload.sub, email: payload.email || null };
}

async function requireAuth(request, env) {
  const cfg = isConfigured(env);
  if (!env.OWNER_UID || /GANTI/i.test(env.OWNER_UID)) throw httpError(503, 'OWNER_UID belum diatur di Cloudflare');
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) throw httpError(401, 'Login required');
  const user = await verifyFirebaseToken(m[1], env);
  if (user.uid !== env.OWNER_UID) throw httpError(403, 'Not the owner');
  if (!cfg.ok && cfg.missing.includes('HUB_KV')) throw httpError(503, 'KV belum diatur');
  return user;
}

// ---------------- HELPERS ----------------
function isConfigured(env) {
  const missing = [];
  if (!env.HUB_KV) missing.push('HUB_KV');
  if (!env.OWNER_UID || /GANTI/i.test(env.OWNER_UID)) missing.push('OWNER_UID');
  if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  return { ok: missing.length === 0, missing };
}
function requireKV(env) { if (!env.HUB_KV) throw httpError(503, 'KV belum diatur'); }
function sanitizeEvents(list) {
  if (!Array.isArray(list)) throw httpError(400, 'events must be an array');
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  return list.slice(0, MAX_EVENTS).filter(e => e && e.key && Number.isFinite(+e.at) && Number.isFinite(+e.until)).map(e => ({
    key: str(e.key, 160), at: +e.at, until: +e.until, title: str(e.title, 120), body: str(e.body, 300),
    icon: str(e.icon, 40), color: str(e.color, 20),
    action: e.action && typeof e.action === 'object' ? { tab: str(e.action.tab, 30), sub: str(e.action.sub, 30), filter: str(e.action.filter, 30) } : null
  }));
}
async function kvGet(env, key, fallback) {
  const v = await env.HUB_KV.get(key, 'json');
  return v == null ? fallback : v;
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > 512 * 1024) throw httpError(413, 'Payload too large');
  try { return JSON.parse(text || '{}'); } catch (e) { throw httpError(400, 'Invalid JSON'); }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function b64urlEncode(bytes) {
  let s = ''; const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concatBytes(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}


// ---------------- STORAGE BACKENDS ----------------
function storeOf(id) { return id.startsWith('r2-') ? 'r2' : id.startsWith('gd-') ? 'drive' : 'kv'; }
async function uploadFile(request, env, url) {
  let store = url.searchParams.get('store') || 'auto';
  if (store === 'auto') store = env.FILES ? 'r2' : 'kv';
  const len = Number(request.headers.get('Content-Length') || 0);
  let name = 'file';
  try { name = decodeURIComponent(request.headers.get('X-File-Name') || 'file').slice(0, 200); } catch (e) {}
  const type = (request.headers.get('Content-Type') || 'application/octet-stream').slice(0, 100);

  if (store === 'r2') {
    if (!env.FILES) throw httpError(503, 'R2 belum diaktifkan');
    if (len > MAX_R2_FILE) throw httpError(413, 'File terlalu besar (maks 300 MB)');
    const used = Number(await env.HUB_KV.get('r2_bytes')) || 0;
    if (used + len > R2_SAFE_LIMIT) throw httpError(507, 'Penyimpanan R2 hampir penuh (batas aman 9 GB). Hapus file lama dulu.');
    const id = 'r2-' + crypto.randomUUID();
    const obj = await env.FILES.put('f/' + id, request.body, { httpMetadata: { contentType: type }, customMetadata: { name } });
    await env.HUB_KV.put('r2_bytes', String(used + (obj ? obj.size : len)));
    await checkStorageAlerts(env).catch(() => {});
    return json({ id, size: obj ? obj.size : len, store });
  }
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) throw httpError(400, 'File kosong');
  if (store === 'drive') {
    if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_SECRET) throw httpError(503, 'Google Drive belum disambungkan');
    if (buf.byteLength > MAX_DRIVE_FILE) throw httpError(413, 'File terlalu besar untuk Drive (maks 30 MB)');
    const r = await driveCall(env, { action: 'upload', name, mimeType: type, data: bytesToBase64(new Uint8Array(buf)) });
    return json({ id: 'gd-' + r.id, size: buf.byteLength, store });
  }
  if (buf.byteLength > MAX_FILE_BYTES) throw httpError(413, 'File terlalu besar (maks 25 MB)');
  const id = crypto.randomUUID();
  await env.HUB_KV.put('file:' + id, buf, { metadata: { name, type, size: buf.byteLength, createdAt: Date.now() } });
  return json({ id, size: buf.byteLength, store: 'kv' });
}

async function getFile(id, env, request, signed) {
  const cache = signed ? 'private, max-age=604800, immutable' : 'private, no-store';
  const store = storeOf(id);
  if (store === 'r2') {
    if (!env.FILES) throw httpError(503, 'R2 belum diaktifkan');
    const range = request.headers.get('Range');
    const obj = await env.FILES.get('f/' + id, range ? { range: request.headers } : undefined);
    if (!obj) throw httpError(404, 'File tidak ditemukan');
    const h = new Headers({ 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', ETag: obj.httpEtag });
    if (range && obj.range) {
      const off = obj.range.offset || 0, ln = obj.range.length != null ? obj.range.length : obj.size - off;
      h.set('Content-Range', `bytes ${off}-${off + ln - 1}/${obj.size}`); h.set('Content-Length', String(ln));
      return new Response(obj.body, { status: 206, headers: h });
    }
    h.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers: h });
  }
  let buf, type;
  if (store === 'drive') {
    if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_SECRET) throw httpError(503, 'Google Drive belum disambungkan');
    const c = caches && caches.default ? caches.default : null;
    const ck = new Request('https://hz-cache.internal/drive/' + id);
    const hit = c ? await c.match(ck).catch(() => null) : null;
    if (hit) { buf = await hit.arrayBuffer(); type = hit.headers.get('Content-Type'); }
    else {
      const r = await driveCall(env, { action: 'get', id: id.slice(3) });
      buf = base64ToBytes(r.data).buffer; type = r.mimeType;
      if (c) await c.put(ck, new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=2592000' } })).catch(() => {});
    }
  } else {
    const { value, metadata } = await env.HUB_KV.getWithMetadata('file:' + id, 'arrayBuffer');
    if (!value) throw httpError(404, 'File tidak ditemukan');
    buf = value; type = (metadata || {}).type;
  }
  return rangeResponse(buf, type || 'application/octet-stream', request, cache);
}
function rangeResponse(buf, type, request, cache) {
  const total = buf.byteLength;
  const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('Range') || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : total - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    start = Math.max(0, start); end = Math.min(total - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(buf, { headers: { ...h, 'Content-Length': String(total) } });
}
async function deleteFile(id, env) {
  if (!FILE_ID_RE.test(id)) throw httpError(404, 'Not found');
  const store = storeOf(id);
  if (store === 'r2') {
    if (!env.FILES) return;
    const head = await env.FILES.head('f/' + id);
    await env.FILES.delete('f/' + id);
    if (head) { const used = Number(await env.HUB_KV.get('r2_bytes')) || 0; await env.HUB_KV.put('r2_bytes', String(Math.max(0, used - head.size))); }
  } else if (store === 'drive') {
    if (env.DRIVE_SCRIPT_URL && env.DRIVE_SECRET) await driveCall(env, { action: 'delete', id: id.slice(3) }).catch(() => {});
  } else {
    await env.HUB_KV.delete('file:' + id);
  }
}
async function storageUsage(env, recount) {
  const out = { r2: null, kv: null, drive: null };
  if (env.FILES) {
    let bytes = Number(await env.HUB_KV.get('r2_bytes')) || 0, count = null;
    if (recount) {
      bytes = 0; count = 0; let cursor;
      do { const page = await env.FILES.list({ prefix: 'f/', cursor }); page.objects.forEach(o => { bytes += o.size; count++; }); cursor = page.truncated ? page.cursor : null; } while (cursor);
      await env.HUB_KV.put('r2_bytes', String(bytes));
    }
    out.r2 = { bytes, count, limit: 10 * 1024 * 1024 * 1024, safeLimit: R2_SAFE_LIMIT, alertLevels: [7 * 1024 ** 3, 8.5 * 1024 ** 3, R2_SAFE_LIMIT] };
  }
  if (env.HUB_KV) {
    let cursor, count = 0, bytes = 0;
    do { const page = await env.HUB_KV.list({ prefix: 'file:', cursor }); page.keys.forEach(k => { count++; bytes += (k.metadata && k.metadata.size) || 0; }); cursor = page.list_complete ? null : page.cursor; } while (cursor);
    out.kv = { bytes, count, limit: 1024 * 1024 * 1024 };
  }
  if (env.DRIVE_SCRIPT_URL && env.DRIVE_SECRET) {
    try { const r = await driveCall(env, { action: 'usage' }); out.drive = { bytes: r.used, limit: r.limit, folderBytes: r.folderBytes }; }
    catch (e) { out.drive = { error: e.message }; }
  }
  return out;
}
async function driveCall(env, payload) {
  const res = await fetch(env.DRIVE_SCRIPT_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, secret: env.DRIVE_SECRET }) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { throw httpError(502, 'Google Drive tidak merespons dengan benar (cek deploy Apps Script)'); }
  if (!data.ok) throw httpError(data.error === 'unauthorized' ? 502 : 404, 'Google Drive: ' + (data.error || 'gagal'));
  return data;
}
let signKeyCache = null;
async function getSignKey(env, create) {
  if (signKeyCache) return signKeyCache;
  let raw = await env.HUB_KV.get('sign_key');
  if (!raw) {
    if (!create) return null;
    raw = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
    await env.HUB_KV.put('sign_key', raw);
  }
  signKeyCache = await crypto.subtle.importKey('raw', b64urlDecode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return signKeyCache;
}
async function hmac(key, data) { return b64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))); }
function bytesToBase64(bytes) { let s = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); }
function base64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

// ---------------- PERINGATAN KUOTA R2 (agar tidak kena biaya) ----------------
const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024;
const R2_ALERT_LEVELS = [
  { level: 1, at: 7 * 1024 ** 3, title: '⚠️ Penyimpanan R2 70%', body: 'Sudah dipakai sekitar 7 GB dari 10 GB gratis. Mulai hapus file yang tidak perlu.' },
  { level: 2, at: 8.5 * 1024 ** 3, title: '⚠️ Penyimpanan R2 85%', body: 'Sudah dipakai sekitar 8,5 GB dari 10 GB gratis. Upload akan diblokir di 9 GB.' },
  { level: 3, at: R2_SAFE_LIMIT, title: '🛑 Penyimpanan R2 mencapai 9 GB', body: 'Upload baru ke R2 diblokir agar tidak kena biaya. Hapus file lama atau pakai Google Drive.' }
];
async function checkStorageAlerts(env) {
  if (!env.FILES || !env.HUB_KV) return;
  const used = Number(await env.HUB_KV.get('r2_bytes')) || 0;
  const reached = R2_ALERT_LEVELS.filter(l => used >= l.at).pop();
  const level = reached ? reached.level : 0;
  const state = await kvGet(env, 'storage_alert', { level: 0 });
  if (level === state.level) return;
  await env.HUB_KV.put('storage_alert', JSON.stringify({ level, at: Date.now() }));
  if (level < state.level) return; // pemakaian turun — reset agar bisa memperingatkan lagi nanti
  const now = Date.now();
  const gb = (used / 1024 ** 3).toFixed(2).replace('.', ',');
  const item = { id: 'storage_r2_' + level + ':' + now, key: 'storage_r2_L' + level + '_' + now, title: reached.title, body: reached.body + ` (terpakai ${gb} GB)`, icon: 'fa-hard-drive', color: level === 3 ? 'bg-red' : 'bg-orange', action: { tab: 'tab-backup' }, ts: now };
  const outbox = (await kvGet(env, 'outbox', [])).concat(item).slice(-OUTBOX_MAX);
  await env.HUB_KV.put('outbox', JSON.stringify(outbox));
  await pushAll(env).catch(() => {});
}
