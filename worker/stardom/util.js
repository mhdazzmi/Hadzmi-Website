/* STARDOM — shared server helpers */
export const uuid = () => crypto.randomUUID();
export const now = () => Date.now();
export const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
export const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const pick = arr => arr[Math.floor(rnd() * arr.length)];
export const chance = p => rnd() < p;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** Standard normal (Box-Muller). */
export const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
export const lognormal = (mu, sigma) => Math.exp(mu + sigma * gauss());
/** Exponentially distributed delay with the given mean. */
export const expDelay = mean => -Math.log(1 - rnd()) * mean;
/** Weighted sample without replacement (Efraimidis–Spirakis). items: [{w, ...}] */
export function weightedSample(items, n, weight = x => x.w) {
  return items.map(it => ({ it, k: Math.pow(rnd(), 1 / Math.max(1e-6, weight(it))) }))
    .sort((a, b) => b.k - a.k).slice(0, n).map(x => x.it);
}
export const TZ_OFFSET = 7 * 3600 * 1000; // Asia/Jakarta (no DST)
export const jakartaHour = (t = Date.now(), off = TZ_OFFSET) => new Date(t + off).getUTCHours();
export const jakartaDay = (t = Date.now(), off = TZ_OFFSET) => new Date(t + off).toISOString().slice(0, 10);
export const parseJSON = (s, fb) => { if (s == null || s === '') return fb; try { return JSON.parse(s); } catch (e) { return fb; } };
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const fail = (status, msg) => { throw new HttpError(status, msg); };
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
export const HASHTAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;
export const MENTION_RE = /@([a-z0-9._]{2,30})/gi;
export const extractTags = text => [...new Set([...String(text || '').matchAll(HASHTAG_RE)].map(m => m[1].toLowerCase()))].slice(0, 30);
const STOP = new Set('the a an and or but to of in on at for with is are was were be been my your our this that it its i me we you so just very really from by as up out about into over after before what when where who how all any can will not no yes have has had do did done get got im ive ill dont cant yang dan di ke dari ini itu aku saya kamu kita kami ada untuk dengan juga sudah lagi aja banget nya yg dgn tak la je ke'.split(' '));
/** Lowercase keyword tokens for relevance and memory retrieval. */
export function keywords(text, max = 40) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u)) {
    if (w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
    if (out.size >= max) break;
  }
  return [...out];
}
export const fmtCount = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
