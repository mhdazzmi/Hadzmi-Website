// Nexa Social — media (foto/video konten klien) di Cloudflare R2, tanpa login.
// Objek disimpan di prefix "social/" sehingga rute publik ini TIDAK bisa membaca file pribadi Nexa (prefix "f/").
//   POST   /api/social/files        body = isi file, header Content-Type & X-File-Name → { id, size }
//   GET    /api/social/files/:id    → isi file (mendukung Range untuk video di iPhone)
//   DELETE /api/social/files/:id    → hapus file
const MAX_BYTES = 200 * 1024 * 1024;              // per file (video Reels)
const R2_SAFE_LIMIT = 9 * 1024 * 1024 * 1024;     // sama dengan batas aman Nexa (kuota gratis 10 GB)
const UPLOADS_PER_HOUR = 300;                      // per alamat IP, mencegah penyalahgunaan
const ID_RE = /^sm-[0-9a-f-]{36}$/;
const TYPE_RE = /^(image\/(png|jpe?g|gif|webp|heic|heif|avif)|video\/(mp4|quicktime|webm|x-m4v|3gpp))$/i;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function handleSocial(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  if (!env.FILES) return json({ error: 'R2 belum diaktifkan' }, 503);

  if (path === '/api/social/files' && method === 'POST') {
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPE_RE.test(type)) return json({ error: 'Hanya foto atau video' }, 415);
    const len = Number(request.headers.get('Content-Length') || 0);
    if (!len) return json({ error: 'File kosong' }, 400);
    if (len > MAX_BYTES) return json({ error: 'File terlalu besar (maks 200 MB)' }, 413);
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    const rlKey = `sm_rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const n = Number(await env.HUB_KV.get(rlKey)) || 0;
    if (n >= UPLOADS_PER_HOUR) return json({ error: 'Terlalu banyak unggahan, coba lagi nanti' }, 429);
    const used = Number(await env.HUB_KV.get('r2_bytes')) || 0;
    if (used + len > R2_SAFE_LIMIT) return json({ error: 'Penyimpanan R2 hampir penuh (batas aman 9 GB). Hapus media lama dulu.' }, 507);
    let name = 'file';
    try { name = decodeURIComponent(request.headers.get('X-File-Name') || 'file').slice(0, 200); } catch (e) {}
    const id = 'sm-' + crypto.randomUUID();
    const obj = await env.FILES.put('social/' + id, request.body, { httpMetadata: { contentType: type }, customMetadata: { name } });
    const size = obj ? obj.size : len;
    await env.HUB_KV.put('r2_bytes', String(used + size));
    await env.HUB_KV.put(rlKey, String(n + 1), { expirationTtl: 7200 });
    return json({ id, size });
  }

  const m = /^\/api\/social\/files\/([\w-]+)$/.exec(path);
  if (!m || !ID_RE.test(m[1])) return json({ error: 'Not found' }, 404);
  const key = 'social/' + m[1];

  if (method === 'DELETE') {
    const head = await env.FILES.head(key);
    if (head) {
      await env.FILES.delete(key);
      const used = Number(await env.HUB_KV.get('r2_bytes')) || 0;
      await env.HUB_KV.put('r2_bytes', String(Math.max(0, used - head.size)));
    }
    return json({ ok: true });
  }

  if (method === 'GET' || method === 'HEAD') {
    const range = request.headers.get('Range');
    const obj = await env.FILES.get(key, range ? { range: request.headers } : undefined);
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
