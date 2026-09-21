const CACHE = 'yueword-offline-20260921224028';
const ASSETS = ['./', './index.html', './styles.css?20260921224028', './core.js?20260921224028', './cloud.js?20260921224028', './charlists.js?20260921224028', './wordbooks.js?20260921224028', './app.js?20260921224028', './math.js?20260921224028', './vertical.js?20260921224028', './decomp.js?20260921224028', './hanziwriter.min.js?20260921224028', './strokes.js?20260921224028', './stroke_data.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === location.origin) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
