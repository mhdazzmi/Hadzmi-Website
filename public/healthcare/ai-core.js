/* =========================================================
   Nexa Health — inti AI (dipakai bersama oleh Cloudflare Worker & browser)
   Satu sumber untuk prompt, skema JSON, dan pemanggilan Gemini.
   ========================================================= */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-flash-latest';
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
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
export async function callGemini({ key, mode, text, image, context, model, fetchFn }) {
  const f = fetchFn || fetch;
  const payload = buildGeminiPayload(mode, text, image, context);
  const wanted = MODEL_RE.test(String(model || '')) ? String(model) : DEFAULT_MODEL;
  const models = [wanted].concat(FALLBACK_MODELS.filter(m => m !== wanted));
  let lastErr = 'Gagal menghubungi Gemini';
  for (const m of models) {
    const res = await f(GEMINI_BASE + encodeURIComponent(m) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    const errText = JSON.stringify(data.error || '');
    if (res.status === 404 || (res.status === 400 && /not found|not supported|is not available/i.test(errText))) { lastErr = 'Model ' + m + ' tidak tersedia'; continue; }
    if (!res.ok) {
      if (res.status === 429) throw aiError(429, 'Kuota Gemini habis / terlalu sering. Coba lagi sebentar.');
      if (res.status === 400 && /API key/i.test(errText)) throw aiError(401, 'Kunci Gemini tidak valid');
      throw aiError(502, (data.error && data.error.message) || ('Gemini error ' + res.status));
    }
    const cand = (data.candidates || [])[0] || {};
    if (cand.finishReason === 'SAFETY') throw aiError(422, 'AI menolak menganalisis gambar ini');
    const raw = ((cand.content || {}).parts || []).map(x => x.text || '').join('');
    try { return { result: JSON.parse(raw), model: m }; }
    catch (e) { throw aiError(502, 'Jawaban AI tidak terbaca, coba lagi'); }
  }
  throw aiError(502, lastErr);
}
