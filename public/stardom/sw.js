// STARDOM service worker: enables "Add to Home Screen". Network only (no offline caching of private data).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
