const CACHE_NAME = 'erzurum-harita-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

// Service Worker kurulumu
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Eski cache'leri temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Network first, cache fallback
self.addEventListener('fetch', (event) => {
  // Socket.IO isteklerini cache'leme
  if (event.request.url.includes('socket.io')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Başarılı response'u cache'e kaydet
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline ise cache'den sun
        return caches.match(event.request);
      })
  );
});
