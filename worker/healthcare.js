/* =========================================================
   Hadzmi Healthcare — endpoint AI di Cloudflare Worker
   POST /api/healthcare/ai  (wajib login; kunci Gemini tidak pernah dikirim ke browser)
   body: { mode: 'food'|'ask'|'weight'|'day'|'period', text?, image?: {mime, data}, context?, model? }

   Variabel Cloudflare (Settings → Variables and Secrets):
     GEMINI_API_KEY (Secret)          = kunci gratis dari aistudio.google.com/apikey
     GEMINI_MODEL   (Text, opsional)  = mis. "gemini-2.5-flash" (default: gemini-flash-latest)
   ========================================================= */
import { callGemini } from '../public/healthcare/ai-core.js';

export async function healthcareAi(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { const er = new Error('Body harus JSON'); er.status = 400; throw er; }
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY belum diatur di Cloudflare', code: 'NO_KEY' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const out = await callGemini({
    key: env.GEMINI_API_KEY, mode: String(body.mode || ''), text: body.text, image: body.image,
    context: body.context, model: body.model || env.GEMINI_MODEL
  });
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
