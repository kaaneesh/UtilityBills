const CACHE_NAME = 'gasreading-v1';
// only cache static assets that rarely change; JS/config files should
// always be fetched from network so that edits take effect immediately.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Bypass cache for JS files and firestore-config.js so edits are always
  // reflected immediately. Also skip if it's a navigation to force network
  // for index.html (but index.html is already in ASSETS).
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('firestore-config.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Try cache first, then network, and update cache
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response.clone ? response : new Response(response.body, response);
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
