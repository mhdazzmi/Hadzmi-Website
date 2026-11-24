// Lekat — media (gambar/audio) di Cloudflare R2, tanpa login.
// Objek disimpan di prefix "lekat/" sehingga rute publik ini TIDAK bisa membaca file pribadi Nexa (prefix "f/").
//   POST /api/lekat/files          body = isi file, header Content-Type & X-File-Name → { id, size }
//   GET  /api/lekat/files/:id      → isi file (mendukung Range untuk audio di iPhone)
const MAX_BYTES = 15 * 1024 * 1024;               // per file
const R2_SAFE_LIMIT = 9 * 1024 * 1024 * 1024;     // sama dengan batas aman Nexa (kuota gratis 10 GB)
const UPLOADS_PER_HOUR = 300;                      // per alamat IP, mencegah penyalahgunaan
const ID_RE = /^lk-[0-9a-f-]{36}$/;
const TYPE_RE = /^(image\/(png|jpe?g|gif|webp|svg\+xml|heic|heif|avif)|audio\/[\w.+-]+|video\/webm)$/i;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function handleLekat(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  if (!env.FILES) return json({ error: 'R2 belum diaktifkan' }, 503);

  if (path === '/api/lekat/files' && method === 'POST') {
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPE_RE.test(type)) return json({ error: 'Hanya gambar atau audio' }, 415);
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES) return json({ error: 'File terlalu besar (maks 15 MB)' }, 413);
    // batas unggahan per IP per jam
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    const rlKey = `lk_rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const n = Number(await env.HUB_KV.get(rlKey)) || 0;
    if (n >= UPLOADS_PER_HOUR) return json({ error: 'Terlalu banyak unggahan, coba lagi nanti' }, 429);
    const used = Number(await env.HUB_KV.get('r2_bytes')) || 0;
    if (used + len > R2_SAFE_LIMIT) return json({ error: 'Penyimpanan R2 hampir penuh (batas aman 9 GB)' }, 507);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: 'File kosong' }, 400);
    if (buf.byteLength > MAX_BYTES) return json({ error: 'File terlalu besar (maks 15 MB)' }, 413);
    let name = 'file';
    try { name = decodeURIComponent(request.headers.get('X-File-Name') || 'file').slice(0, 200); } catch (e) {}
    const id = 'lk-' + crypto.randomUUID();
    await env.FILES.put('lekat/' + id, buf, { httpMetadata: { contentType: type }, customMetadata: { name } });
    await env.HUB_KV.put('r2_bytes', String(used + buf.byteLength));
    await env.HUB_KV.put(rlKey, String(n + 1), { expirationTtl: 7200 });
    return json({ id, size: buf.byteLength });
  }

  const m = /^\/api\/lekat\/files\/([\w-]+)$/.exec(path);
  if (m && (method === 'GET' || method === 'HEAD')) {
    const id = m[1];
    if (!ID_RE.test(id)) return json({ error: 'Not found' }, 404);
    const range = request.headers.get('Range');
    const obj = await env.FILES.get('lekat/' + id, range ? { range: request.headers } : undefined);
    if (!obj) return json({ error: 'File tidak ditemukan' }, 404);
    const h = new Headers({
      'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
      'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", ETag: obj.httpEtag
    });
    if (range && obj.range) {
      const off = obj.range.offset || 0, ln = obj.range.length != null ? obj.range.length : obj.size - off;
      h.set('Content-Range', `bytes ${off}-${off + ln - 1}/${obj.size}`); h.set('Content-Length', String(ln));
      return new Response(method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
    }
    h.set('Content-Length', String(obj.size));
    return new Response(method === 'HEAD' ? null : obj.body, { headers: h });
  }
  return json({ error: 'Not found' }, 404);
}
