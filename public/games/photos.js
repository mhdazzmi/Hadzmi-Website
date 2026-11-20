/* Foto asli kota/landmark: dari Wikipedia (gratis), atau foto pengganti yang diunggah Admin */
import { S, LS, emit, mediaUrl } from './core.js';

const KEY = 'nexo.wiki.v2';
const TTL = 14 * 86400000;
let cache = LS.get(KEY, {});
const inflight = {};

function sized(url, w, maxW) {
  if (!url) return null;
  if (maxW && maxW <= w) return null;
  return /\/\d+px-/.test(url) ? url.replace(/\/\d+px-/, `/${w}px-`) : url;
}
// Kembalikan {thumb, full, page, custom} dari cache (sinkron) — null jika belum dimuat
export function photoOf(space) {
  if (!space || !space.key) return null;
  const ov = S.settings && S.settings.photos && S.settings.photos[space.key];
  if (ov) return { thumb: mediaUrl(ov), full: mediaUrl(ov), page: null, custom: true };
  const c = cache[space.wiki];
  return c && c.thumb ? c : null;
}
export async function loadPhoto(space) {
  if (!space || !space.wiki) return null;
  const have = photoOf(space);
  if (have && (have.custom || Date.now() - (cache[space.wiki] || {}).t < TTL)) return have;
  if (inflight[space.wiki]) return inflight[space.wiki];
  inflight[space.wiki] = (async () => {
    try {
      const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(space.wiki), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('wiki ' + r.status);
      const j = await r.json();
      const orig = j.originalimage || {}, th = j.thumbnail || {};
      const base = th.source || orig.source;
      if (!base) throw new Error('no image');
      const ow = orig.width || 4000;
      const entry = {
        thumb: sized(base, 330, ow) || orig.source || base,
        full: sized(base, 960, ow) || orig.source || base,
        page: j.content_urls && j.content_urls.desktop ? j.content_urls.desktop.page : 'https://en.wikipedia.org/wiki/' + encodeURIComponent(space.wiki),
        t: Date.now()
      };
      cache[space.wiki] = entry; LS.set(KEY, cache);
      emit('photo', space.key);
      return entry;
    } catch (e) { return null; }
    finally { delete inflight[space.wiki]; }
  })();
  return inflight[space.wiki];
}
export function preloadAll(spaces) { spaces.filter(s => s.wiki).forEach((s, i) => setTimeout(() => loadPhoto(s), i * 60)); }
