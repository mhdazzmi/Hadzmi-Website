// Service worker Kasir Thai Tea (scope /thaitea/): hanya untuk notifikasi.
// Push dikirim tanpa isi; isi notifikasi diambil dari /api/thaitea/pending.
const STATE_CACHE = 'tt-sw-state';
const STATE_URL = '/thaitea/__sw_state';
const ICON = 'icon-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function readState() {
  try { const c = await caches.open(STATE_CACHE); const r = await c.match(STATE_URL); return r ? await r.json() : {}; } catch (e) { return {}; }
}
async function writeState(s) {
  try { const c = await caches.open(STATE_CACHE); await c.put(STATE_URL, new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } })); } catch (e) {}
}

async function handlePush() {
  let items = [];
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const state = await readState();
    if (sub) {
      const res = await fetch('/api/thaitea/pending?endpoint=' + encodeURIComponent(sub.endpoint) + '&since=' + (state.lastTs || 0), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        items = data.items || [];
        const maxTs = items.reduce((m, i) => Math.max(m, i.ts || 0), state.lastTs || 0);
        await writeState({ ...state, lastTs: maxTs });
      }
    }
  } catch (e) {}
  if (!items.length) {
    // Browser mewajibkan setiap push menampilkan notifikasi
    return self.registration.showNotification('Thai Tea', { body: 'Ada catatan baru. Ketuk untuk melihat.', icon: ICON, badge: ICON, tag: 'tt-generic' });
  }
  // Pesanan online (urgent): tetap tampil sampai disentuh + getar panjang
  await Promise.all(items.map(i => self.registration.showNotification(i.title || 'Thai Tea', i.urgent ? {
    body: i.body || '', icon: ICON, badge: ICON, tag: i.id, requireInteraction: true, renotify: true,
    vibrate: [600, 200, 600, 200, 600, 200, 600, 200, 900], data: { url: './#online' }
  } : {
    body: i.body || '', icon: ICON, badge: ICON, tag: i.id, renotify: false
  })));
}

self.addEventListener('push', (event) => event.waitUntil(handlePush()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = (event.notification.data && event.notification.data.url) || './';
    const open = all.find(c => c.url && c.url.indexOf('/thaitea/') !== -1 && 'focus' in c);
    if (open) {
      if (target !== './') open.postMessage({ type: 'open-online' });
      return open.focus();
    }
    return self.clients.openWindow(target);
  })());
});
