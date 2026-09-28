// Service worker приложения «flashcards-imba».
// Он кэширует ТОЛЬКО файлы приложения (index.html, манифест, иконка).
// localStorage и IndexedDB service worker вообще не видит и никогда не трогает —
// прогресс пользователя живёт там и обновлением приложения не задевается.
const CACHE = 'fc-shell-v144';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // HTML тянем мимо HTTP-кэша браузера, чтобы не закэшировать старую сборку
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith((async () => {
    if (isDoc) {
      // Страница: сначала сеть и всегда мимо кэша браузера — обновление приезжает сразу.
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'no-cache' }));
        if (fresh && fresh.ok) {
          const c = await caches.open(CACHE);
          c.put('./index.html', fresh.clone());
          return fresh;
        }
      } catch (err) { }
      return (await caches.match('./index.html')) || Response.error();
    }
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); } catch (err) { return Response.error(); }
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
