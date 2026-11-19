// Hadzmi Hub service worker: Web Push + klik notifikasi.
// Push dari server dikirim tanpa payload; isi notifikasi diambil dari /api/pending.
const STATE_CACHE = 'hz-sw-state';
const STATE_URL = '/__sw_state';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function readState() {
  try { const c = await caches.open(STATE_CACHE); const r = await c.match(STATE_URL); return r ? await r.json() : {}; } catch (e) { return {}; }
}
async function writeState(s) {
  try { const c = await caches.open(STATE_CACHE); await c.put(STATE_URL, new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } })); } catch (e) {}
}
function goUrl(action) {
  if (!action || !action.tab) return './';
  return './?go=' + encodeURIComponent([action.tab, action.sub || '', action.filter || ''].join(':'));
}
const ICON = 'icons/icon-192.png';

async function handlePush(event) {
  let items = [];
  if (event.data) { try { const d = event.data.json(); items = d.items || [d]; } catch (e) {} }
  if (!items.length) {
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const state = await readState();
      if (sub) {
        const res = await fetch('/api/pending?endpoint=' + encodeURIComponent(sub.endpoint) + '&since=' + (state.lastTs || 0), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          items = data.items || [];
          const maxTs = items.reduce((m, i) => Math.max(m, i.ts || 0), state.lastTs || 0);
          await writeState({ ...state, lastTs: maxTs });
        }
      }
    } catch (e) {}
  }
  if (!items.length) {
    // Browser mewajibkan setiap push menampilkan notifikasi
    return self.registration.showNotification('Hadzmi Hub', { body: 'Ada pengingat baru. Buka untuk melihat.', icon: ICON, badge: ICON, tag: 'hz-generic' });
  }
  await Promise.all(items.map(i => self.registration.showNotification(i.title || 'Hadzmi Hub', {
    body: i.body || '', icon: ICON, badge: ICON, tag: i.key || i.id, data: { action: i.action || null, key: i.key }, renotify: false
  })));
  // Beri tahu tab yang sedang terbuka (supaya inbox in-app ikut terisi)
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ type: 'hz-push', items }));
}

self.addEventListener('push', (event) => event.waitUntil(handlePush(event)));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.notification.data && event.notification.data.action;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if (action) c.postMessage({ type: 'hz-navigate', action }); return; }
    }
    if (self.clients.openWindow) return self.clients.openWindow(goUrl(action));
  })());
});
