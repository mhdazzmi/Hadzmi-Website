/* =========================================================
   Nexa Health — inti AI (dipakai bersama oleh Cloudflare Worker & browser)
   Satu sumber untuk prompt, skema JSON, dan pemanggilan Gemini.
   ========================================================= */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-flash-latest';
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
const BUSY = new Set([429, 500, 503, 504]); // model penuh / kuota per menit → coba model lain
const MAX_IMAGE_B64 = 6 * 1024 * 1024; // ±4.5 MB gambar
const MODEL_RE = /^gemini-[a-z0-9.\-]{2,60}$/i;

const S = (type, extra) => Object.assign({ type }, extra || {});
const NUM = S('NUMBER');
const STR = S('STRING');

const FOOD_ITEM = S('OBJECT', {
  properties: {
    name: STR, portion: STR, grams: NUM, kcal: NUM, protein: NUM, carbs: NUM, fat: NUM, satFat: NUM,
    sugar: NUM, fiber: NUM, sodium: NUM, purine: NUM,
    purineLevel: S('STRING', { enum: ['rendah', 'sedang', 'tinggi'] })
  },
  required: ['name', 'portion', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'satFat', 'sugar', 'fiber', 'sodium', 'purine', 'purineLevel']
});

export const FOOD_SCHEMA = S('OBJECT', {
  properties: {
    isFood: S('BOOLEAN'),
    title: STR,
    items: S('ARRAY', { items: FOOD_ITEM }),
    verdict: S('STRING', { enum: ['baik', 'batasi', 'hindari'] }),
    score: NUM,
    summary: STR,
    goutNote: STR,
    fatNote: STR,
    tips: S('ARRAY', { items: STR }),
    swaps: S('ARRAY', { items: STR }),
    confidence: S('STRING', { enum: ['tinggi', 'sedang', 'rendah'] })
  },
  required: ['isFood', 'title', 'items', 'verdict', 'score', 'summary', 'goutNote', 'fatNote', 'tips', 'swaps', 'confidence']
});

export const NOTE_SCHEMA = S('OBJECT', {
  properties: {
    headline: STR,
    status: S('STRING', { enum: ['baik', 'perhatian', 'buruk'] }),
    analysis: STR,
    points: S('ARRAY', { items: STR })
  },
  required: ['headline', 'status', 'analysis', 'points']
});

const PERSONA = `Kamu adalah ahli gizi klinis Indonesia di aplikasi "Nexa Health".
Kondisi pengguna: SKINNY FAT (berat badan normal/kurus tetapi persentase lemak tubuh tinggi & massa otot rendah),
LEMAK VISCERAL TINGGI, dan penderita ASAM URAT (gout/hiperurisemia).
Tujuan: menurunkan lemak (terutama visceral) sambil menjaga/menambah otot, dan menurunkan kadar asam urat.
Prinsip yang kamu pakai:
- Purin: makanan rendah purin <50 mg/100 g, sedang 50–150 mg/100 g, tinggi >150 mg/100 g. Batas harian ±400 mg.
  Tinggi purin: jeroan, hati, emping/melinjo, sarden, teri, kerang, udang (sedang-tinggi), ikan makarel, kaldu kental, ekstrak daging, bebek, angsa.
  Fruktosa (minuman manis, sirup, jus kemasan, madu berlebih) dan alkohol (terutama bir) menaikkan asam urat.
  Susu/yogurt rendah lemak, ceri, sayuran, air putih membantu. Sayur tinggi purin (bayam, kangkung, asparagus, kembang kol, jamur) aman dalam porsi wajar.
- Lemak visceral: batasi gorengan, lemak jenuh/trans, gula tambahan, tepung olahan, santan kental berlebihan; utamakan protein tanpa lemak, serat, karbo kompleks.
- Skinny fat: protein cukup (±1,6 g/kg BB/hari) penting untuk otot; jangan sarankan diet terlalu rendah kalori.
Gunakan pengetahuan masakan Indonesia (nasi padang, pecel lele, soto, bakso, gorengan, dll) dan porsi khas Indonesia.
Selalu jawab dalam Bahasa Indonesia yang singkat, jelas, ramah. Angka berupa estimasi realistis (bukan 0 kecuali memang 0).
Sodium dalam mg, purin dalam mg, gram untuk zat gizi lainnya, kcal untuk energi.`;

function prompts(mode, text, ctx) {
  const c = ctx ? `\nData pengguna (JSON): ${JSON.stringify(ctx).slice(0, 6000)}` : '';
  switch (mode) {
    case 'food':
      return {
        schema: FOOD_SCHEMA,
        text: `Analisis makanan/minuman yang ${text ? 'dideskripsikan' : 'ada di foto'} ini.${text ? `\nDeskripsi pengguna: "${text}"` : ''}
Pecah menjadi item-item terpisah (mis. nasi, lauk, sayur, sambal, minuman), perkirakan porsi & berat (gram) masing-masing,
lalu hitung kcal, protein, karbo, lemak, lemak jenuh, gula, serat, sodium, dan purin per item sesuai porsi.
Jika ada foto DAN deskripsi, gunakan deskripsi untuk memperjelas porsi/jenis.
verdict: "baik" (aman & mendukung tujuan), "batasi" (boleh sesekali/porsi kecil), "hindari" (buruk untuk asam urat/lemak visceral).
score 1–10 (10 paling sehat untuk kondisi pengguna). summary 2–3 kalimat. goutNote: dampak ke asam urat. fatNote: dampak ke lemak visceral/skinny fat.
tips: maksimal 3 saran praktis. swaps: maksimal 3 alternatif lebih sehat. Jika bukan makanan, isFood=false dan items kosong.${c}`
      };
    case 'ask':
      return {
        schema: FOOD_SCHEMA,
        text: `Pengguna bertanya apakah makanan/minuman ini boleh dikonsumsi: "${text}".
Berikan item dengan porsi umum 1 sajian, verdict, score, summary yang langsung menjawab "boleh/batasi/hindari" dan berapa porsi aman,
goutNote, fatNote, tips, dan swaps.${c}`
      };
    case 'weight':
      return {
        schema: NOTE_SCHEMA,
        text: `Analisis riwayat pengukuran tubuh pengguna (berat badan, dan jika ada: % lemak tubuh, level lemak visceral, lingkar pinggang, massa otot).
Jelaskan tren (naik/turun/stabil, laju per minggu), apakah perubahan berasal dari lemak atau otot jika datanya ada,
dan apakah sesuai tujuan skinny fat (turun lemak, jaga otot). headline 1 kalimat. analysis 3–5 kalimat. points: 3–5 saran konkret.
Catatan pengguna: "${text || '-'}"${c}`
      };
    case 'day':
      return {
        schema: NOTE_SCHEMA,
        text: `Buat ringkasan & evaluasi asupan makan pengguna untuk satu hari berdasarkan data berikut (total gizi, target, daftar makanan).
Sebutkan apa yang sudah baik, nutrisi yang berlebih/kurang, dampak ke asam urat & lemak visceral, dan saran untuk sisa hari / besok.
headline 1 kalimat. analysis 3–5 kalimat. points 3–5 poin.${c}`
      };
    case 'period':
      return {
        schema: NOTE_SCHEMA,
        text: `Evaluasi progres pengguna selama periode ini (rata-rata kalori & gizi harian, kepatuhan target, berat badan, asam urat).
headline 1 kalimat. analysis 3–6 kalimat. points 3–5 saran prioritas minggu depan.${c}`
      };
    default:
      return null;
  }
}


/** Bangun body request generateContent. image = {mime, data(base64)} */
export function buildGeminiPayload(mode, text, image, context) {
  text = String(text || '').slice(0, 1500);
  const p = prompts(mode, text, context || null);
  if (!p) throw aiError(400, 'Mode tidak dikenal');
  const parts = [{ text: p.text }];
  if (image && image.data) {
    const mime = String(image.mime || 'image/jpeg');
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) throw aiError(400, 'Format gambar tidak didukung');
    if (String(image.data).length > MAX_IMAGE_B64) throw aiError(413, 'Gambar terlalu besar');
    parts.push({ inline_data: { mime_type: mime, data: String(image.data) } });
  } else if (mode === 'food' && !text) throw aiError(400, 'Isi foto atau teks makanan');
  return {
    systemInstruction: { parts: [{ text: PERSONA }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: p.schema }
  };
}

function aiError(status, message) { const e = new Error(message); e.status = status; return e; }

/** Panggil Gemini dengan fallback model. fetchFn = fetch. Return {result, model}. */
// Ambil teks JSON dari jawaban Gemini (abaikan bagian "thought", buang ```json pagar)
function extractJson(cand) {
  const raw = ((cand.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  try { return JSON.parse(raw); } catch (e) {}
  const s = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(s.slice(i, j + 1)); } catch (e) {} }
  return null;
}

// Daftar model yang benar-benar tersedia untuk kunci ini (Google rutin mempensiunkan model lama)
const rank = n => /pro/.test(n) ? 2 : /lite/.test(n) ? 1 : 0; // flash dulu, lalu lite, terakhir pro
async function listFlashModels(f, key) {
  try {
    const res = await f(GEMINI_BASE.replace(/\/models\/$/, '/models') + '?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(n => /^gemini-[\d.]+-(flash|flash-lite|pro)$|^gemini-(flash|flash-lite|pro)-latest$/.test(n))
      .sort((x, y) => rank(x) - rank(y) || y.localeCompare(x, undefined, { numeric: true }));
  } catch (e) { return []; }
}

/** Panggil Gemini dengan coba ulang & model cadangan. Return {result, model}. */
export async function callGemini({ key, mode, text, image, context, model, fetchFn, budgetMs }) {
  const f = fetchFn || fetch;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Disiapkan sekali (hemat CPU server gratis); dipakai ulang di setiap percobaan
  const payload = new TextEncoder().encode(JSON.stringify(buildGeminiPayload(mode, text, image, context)));
  const started = Date.now(), budget = budgetMs || 25000; // batas waktu total agar koneksi HP tidak putus
  const left = () => budget - (Date.now() - started);
  let timedOut = false;
  const wanted = MODEL_RE.test(String(model || '')) ? String(model) : DEFAULT_MODEL;
  const tried = new Set(), log = [];
  let busy = false, quota = false;

  async function tryModel(m) {
    tried.add(m);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (left() < 3000) { timedOut = true; return null; }
      let res, data;
      try {
        const opt = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: payload };
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opt.signal = AbortSignal.timeout(Math.max(3000, left()));
        res = await f(GEMINI_BASE + encodeURIComponent(m) + ':generateContent', opt);
        data = await res.json().catch(() => ({}));
      } catch (e) {
        if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) { timedOut = true; log.push(m + ': terlalu lama'); return null; }
        log.push(m + ': koneksi terputus'); return null;
      }
      const msg = String((data.error && data.error.message) || '');
      if (res.status === 404 || (res.status === 400 && /not found|not supported|is not available|no longer available/i.test(msg))) { log.push(m + ': tidak tersedia'); return null; }
      if (BUSY.has(res.status)) {
        if (res.status === 429) quota = true; else busy = true;
        if (attempt === 0 && res.status !== 429 && left() > 6000) { await wait(800); continue; }
        log.push(m + (res.status === 429 ? ': batas kuota' : ': sibuk')); return null;
      }
      if (!res.ok) {
        if (/API key|API_KEY|PERMISSION_DENIED|unregistered callers/i.test(msg) || res.status === 401 || res.status === 403)
          throw aiError(401, 'Kunci Gemini ditolak Google: ' + (msg.replace(/\.\s*$/, '') || res.status) + '. Periksa GEMINI_API_KEY di Cloudflare.');
        log.push(m + ': error ' + res.status + (msg ? ' (' + msg.slice(0, 120) + ')' : '')); return null;
      }
      const cand = (data.candidates || [])[0] || {};
      if (cand.finishReason === 'SAFETY' || (data.promptFeedback && data.promptFeedback.blockReason)) throw aiError(422, 'AI menolak menganalisis gambar ini');
      const result = extractJson(cand);
      if (result) return { result, model: m };
      log.push(m + ': jawaban tidak terbaca (' + (cand.finishReason || 'tanpa isi') + ')'); return null;
    }
    return null;
  }

  for (const m of [wanted].concat(FALLBACK_MODELS)) {
    if (tried.has(m) || timedOut) continue;
    const r = await tryModel(m); if (r) return r;
  }
  // Semua nama bawaan gagal → tanya Google model flash apa yang tersedia untuk kunci ini
  for (const m of (timedOut || left() < 5000 ? [] : await listFlashModels(f, key)).slice(0, 5)) {
    if (tried.has(m) || timedOut) continue;
    const r = await tryModel(m); if (r) return r;
  }
  const detail = log.length ? ' Rincian: ' + log.join('; ') + '.' : '';
  if (busy || timedOut) throw aiError(503, 'Server Gemini sedang sibuk (banyak pengguna). Tunggu 1–2 menit lalu tap Coba lagi.' + detail);
  if (quota) throw aiError(429, 'Batas pemakaian gratis Gemini tercapai untuk sementara. Coba lagi beberapa menit lagi.' + detail);
  throw aiError(502, 'AI belum bisa dihubungi.' + detail);
}
