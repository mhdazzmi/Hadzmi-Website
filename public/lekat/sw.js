// Lekat — service worker: cache aplikasi agar bisa dipakai offline (network-first, fallback cache).
const CACHE = 'lekat-v2';
const ASSETS = ['./', 'index.html', 'app.css', 'db.js', 'sched.js', 'render.js', 'col.js', 'ui.js', 'starter.js', 'review.js', 'editor.js', 'browse.js', 'stats.js', 'io.js', 'sync.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lekat-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameScope = url.origin === location.origin && url.pathname.startsWith(new URL('./', self.registration.scope).pathname);
  const cdn = url.hostname === 'cdnjs.cloudflare.com';
  if (!sameScope && !cdn) return;
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
