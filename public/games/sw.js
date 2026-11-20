// Nexo Games service worker: Web Push + klik notifikasi.
// Push dikirim tanpa isi; isi notifikasi diambil dari /api/nexo/pending.
const STATE_CACHE = 'nexo-sw-state';
const STATE_URL = '/__nexo_sw_state';
const ICON = 'icons/icon-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function readState() { try { const c = await caches.open(STATE_CACHE); const r = await c.match(STATE_URL); return r ? await r.json() : {}; } catch (e) { return {}; } }
async function writeState(s) { try { const c = await caches.open(STATE_CACHE); await c.put(STATE_URL, new Response(JSON.stringify(s))); } catch (e) {} }

async function handlePush(event) {
  let items = [];
  if (event.data) { try { const d = event.data.json(); items = d.items || [d]; } catch (e) {} }
  if (!items.length) {
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const state = await readState();
      if (sub) {
        const res = await fetch('/api/nexo/pending?endpoint=' + encodeURIComponent(sub.endpoint) + '&since=' + (state.lastTs || 0), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          items = data.items || [];
          const maxTs = items.reduce((m, i) => Math.max(m, i.ts || 0), state.lastTs || 0);
          await writeState(Object.assign({}, state, { lastTs: maxTs }));
        }
      }
    } catch (e) {}
  }
  if (!items.length) return self.registration.showNotification('Nexo Games', { body: 'Ada kabar baru dari teman-temanmu.', icon: ICON, badge: ICON, tag: 'nexo-generic' });
  // Satu notifikasi per tag (chat yang sama tidak menumpuk)
  const byTag = {};
  items.forEach(i => { byTag[i.tag || i.id] = i; });
  await Promise.all(Object.values(byTag).map(i => self.registration.showNotification(i.title || 'Nexo Games', {
    body: i.body || '', icon: ICON, badge: ICON, tag: i.tag || i.id, renotify: true, data: { url: i.url || './' }
  })));
  try { if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(); } catch (e) {}
}
self.addEventListener('push', event => event.waitUntil(handlePush(event)));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const rel = (event.notification.data && event.notification.data.url) || './';
  const url = new URL(rel, self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = all.find(c => c.url.startsWith(self.registration.scope));
    if (mine) { await mine.focus(); mine.postMessage({ type: 'nexo-open', url }); return; }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
