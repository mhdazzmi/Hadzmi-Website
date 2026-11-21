/* STARDOM — Worker entry for /api/stardom/*
   - Media (R2): POST /api/stardom/upload (owner only), GET /api/stardom/media/:id (unguessable capability URL)
   - Everything else: owner-authenticated, forwarded to the StardomHub Durable Object. */
export { StardomHub } from './hub.js';

const MEDIA_ID = /^[a-z0-9-]{20,80}$/;
const TYPES = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image', 'image/heic': 'image',
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video',
};
const MAX = { image: 15 * 1024 * 1024, video: 120 * 1024 * 1024 };
const j = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function sniff(bytes, type) {
  const b = bytes, hex = [...b.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
  if (type === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (type === 'image/png') return hex.startsWith('89504e47');
  if (type === 'image/gif') return hex.startsWith('474946');
  if (type === 'image/webp') return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
  if (type === 'video/webm') return hex.startsWith('1a45dfa3');
  if (type === 'video/mp4' || type === 'video/quicktime' || type === 'image/heic') return hex.slice(8, 16) === '66747970'; // ....ftyp
  return false;
}

export async function handleStardom(request, env, url, requireAuth) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const media = /^\/api\/stardom\/media\/([a-z0-9-]+)$/.exec(path);
  if (media && method === 'GET') {
    if (!MEDIA_ID.test(media[1]) || !env.FILES) return new Response('Not found', { status: 404 });
    const key = 'stardom/' + media[1];
    const rh = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
    let range;
    if (rh) {
      const head = await env.FILES.head(key);
      if (!head) return new Response('Not found', { status: 404 });
      const size = head.size, start = rh[1] === '' ? Math.max(0, size - Number(rh[2])) : Number(rh[1]);
      const end = rh[1] !== '' && rh[2] !== '' ? Math.min(size - 1, Number(rh[2])) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      range = { offset: start, length: end - start + 1, size };
    }
    const obj = await env.FILES.get(key, range ? { range: { offset: range.offset, length: range.length } } : undefined);
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = { 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable', ETag: obj.httpEtag, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
    if (range) return new Response(obj.body, { status: 206, headers: Object.assign(headers, { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${range.size}`, 'Content-Length': String(range.length) }) });
    return new Response(obj.body, { headers: Object.assign(headers, { 'Content-Length': String(obj.size) }) });
  }

  // ---- owner only from here ----
  let user;
  if (env.STARDOM_DEV_AUTH === '1' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) user = { uid: 'dev-owner' };
  else user = await requireAuth(request, env);
  if (!env.STARDOM) return j({ error: 'Durable Object STARDOM is not configured (see README).' }, 503);

  if (path === '/api/stardom/upload' && method === 'POST') {
    if (!env.FILES) return j({ error: 'R2 bucket FILES is not configured' }, 503);
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    const kind = TYPES[type];
    if (!kind) return j({ error: 'Unsupported file type. Use JPG, PNG, WEBP, GIF, MP4, MOV or WEBM.' }, 415);
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX[kind]) return j({ error: `File too large (max ${MAX[kind] / 1048576} MB)` }, 413);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX[kind]) return j({ error: 'File is empty or too large' }, 413);
    if (!sniff(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)), type)) return j({ error: 'File content does not match its type' }, 415);
    const id = crypto.randomUUID() + '-' + crypto.randomUUID().slice(0, 8);
    await env.FILES.put('stardom/' + id, buf, { httpMetadata: { contentType: type }, customMetadata: { owner: user.uid, app: 'stardom' } });
    return j({ url: '/api/stardom/media/' + id, kind, size: buf.byteLength });
  }

  const stub = env.STARDOM.get(env.STARDOM.idFromName('stardom-universe'));
  const headers = new Headers(request.headers);
  headers.set('X-Stardom-Uid', user.uid);
  headers.delete('Authorization');
  return stub.fetch(new Request(request.url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : request.body }));
}

/** Called from the Worker cron: keeps the simulation alarm alive (cheap, idempotent). */
export async function pokeStardom(env) {
  if (!env.STARDOM) return;
  const stub = env.STARDOM.get(env.STARDOM.idFromName('stardom-universe'));
  await stub.fetch('https://stardom.internal/api/stardom/tick', { method: 'POST' });
}
