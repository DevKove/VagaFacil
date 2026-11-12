const BASE = new URL('./', self.registration.scope).pathname;
const CACHE = 'vagafacil-shell-v14';
const INDEX = `${BASE}index.html`;
const SHELL = [BASE, INDEX, `${BASE}manifest.webmanifest`, `${BASE}IMG/favicon.ico`, `${BASE}IMG/logo.png`, `${BASE}icons/icon-192.svg`, `${BASE}icons/icon-512.svg`, `${BASE}icons/icon-maskable.svg`];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Um único recurso ausente não pode impedir a ativação do Service Worker.
    await Promise.all(SHELL.map(async asset => {
      try { await cache.add(asset); }
      catch (error) { console.warn('Recurso opcional não armazenado no cache:', asset, error); }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vagafacil-shell-') && key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
 const request=event.request, url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE)) return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(INDEX,response.clone()));return response;}).catch(()=>caches.match(INDEX).then(cached=>cached||caches.match(BASE))));return;}
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok&&(url.pathname.startsWith(`${BASE}assets/`)||/\\.(svg|png|jpe?g|webp|ico|woff2?)$/i.test(url.pathname)))caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response;})));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = payload.title || 'Alerta do VagaFácil';
  const options = {
    body: payload.body || 'Você recebeu um novo aviso.',
    icon: `${BASE}IMG/logo.png`,
    badge: `${BASE}IMG/favicon.ico`,
    tag: payload.tag || `vagafacil-${Date.now()}`,
    renotify: true,
    timestamp: Date.now(),
    data: { url: payload.url || BASE },
    requireInteraction: true,
    silent: false,
    vibrate: [250, 120, 250, 120, 350],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const requestedUrl = event.notification.data?.url || BASE;
    const target = new URL(requestedUrl === '/' ? BASE : requestedUrl, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    return self.clients.openWindow(target);
  })());
});