const BASE = new URL('./', self.registration.scope).pathname;
const CACHE = 'vagafacil-shell-v6';
const INDEX = `${BASE}index.html`;
const SHELL = [BASE, INDEX, `${BASE}manifest.webmanifest`, `${BASE}icons/icon-192.svg`, `${BASE}icons/icon-512.svg`, `${BASE}icons/icon-maskable.svg`];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('vagafacil-shell-') && key !== CACHE).map(key => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(INDEX, response.clone()));
        return response;
      }).catch(() => caches.match(INDEX).then(cached => cached || caches.match(BASE))),
    );
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && (url.pathname.startsWith(`${BASE}assets/`) || url.pathname.endsWith('.svg'))) {
      caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    }
    return response;
  })));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(BASE);
  })());
});
