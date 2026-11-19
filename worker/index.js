/* =========================================================
   Hadzmi Hub — Cloudflare Worker
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

const GOOGLE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_EVENTS = 400;
const OUTBOX_MAX = 60;
const SUBS_MAX = 12;
const SENT_TTL_MS = 40 * 86400000;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // batas nilai KV

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      if (status >= 500) console.error('API error', err && err.stack || err);
      return json({ error: (err && err.message) || 'Internal error' }, status);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).catch(err => console.error('cron error', err && err.stack || err)));
  }
};

// ---------------- API ----------------
async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  if (path === '/api/config' && method === 'GET') {
    const ready = isConfigured(env);
    let vapidPublicKey = null;
    if (ready.ok) { try { const v = await getVapid(env, false); vapidPublicKey = v ? v.publicKey : null; } catch (e) { console.error('vapid', e && e.stack || e); } }
    return json({ pushReady: ready.ok, missing: ready.missing, vapidPublicKey });
  }

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

  // ---- Semua route di bawah ini wajib login (Firebase ID token milik OWNER_UID) ----
  const user = await requireAuth(request, env);
  requireKV(env);

  // ---- Penyimpanan file pribadi (Bukti Foto & Gudang File) di KV ----
  if (path === '/api/files' && method === 'POST') {
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_FILE_BYTES) throw httpError(413, 'File terlalu besar (maks 25 MB)');
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) throw httpError(400, 'File kosong');
    if (buf.byteLength > MAX_FILE_BYTES) throw httpError(413, 'File terlalu besar (maks 25 MB)');
    let name = 'file';
    try { name = decodeURIComponent(request.headers.get('X-File-Name') || 'file').slice(0, 200); } catch (e) {}
    const type = (request.headers.get('Content-Type') || 'application/octet-stream').slice(0, 100);
    const id = crypto.randomUUID();
    await env.HUB_KV.put('file:' + id, buf, { metadata: { name, type, size: buf.byteLength, createdAt: Date.now() } });
    return json({ id, size: buf.byteLength });
  }
  const fm = /^\/api\/files\/([0-9a-f-]{36})$/.exec(path);
  if (fm && method === 'GET') {
    const { value, metadata } = await env.HUB_KV.getWithMetadata('file:' + fm[1], 'arrayBuffer');
    if (!value) throw httpError(404, 'File tidak ditemukan');
    const meta = metadata || {};
    return new Response(value, { headers: {
      'Content-Type': meta.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.name || 'file')}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
    } });
  }
  if (fm && method === 'DELETE') {
    await env.HUB_KV.delete('file:' + fm[1]);
    return json({ ok: true });
  }
  if (path === '/api/files-usage' && method === 'GET') {
    let cursor, count = 0, bytes = 0;
    do {
      const page = await env.HUB_KV.list({ prefix: 'file:', cursor });
      page.keys.forEach(k => { count++; bytes += (k.metadata && k.metadata.size) || 0; });
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return json({ count, bytes });
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
    const item = { id: 'test:' + now, key: 'test_' + now, title: 'Tes Push dari Server ✅', body: 'Push notification Hadzmi Hub berfungsi, walau website tertutup.', icon: 'fa-paper-plane', color: 'bg-green', action: null, ts: now };
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
async function getVapid(env, create) {
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

async function sendPush(sub, env, vapid) {
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
