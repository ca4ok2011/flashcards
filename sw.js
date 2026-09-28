// Service worker приложения «flashcards-imba».
//
// Он кэширует ТОЛЬКО файлы приложения: страницу, манифест, иконки.
// localStorage и IndexedDB, где лежит весь прогресс, service worker
// не видит в принципе и никогда не трогает. Обновление приложения
// не может задеть прогресс.
const CACHE = 'fc-shell-v145';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-180.png', './favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // тянем мимо HTTP-кэша браузера, чтобы не закэшировать старую сборку
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
      // Страница: сначала сеть и всегда мимо кэша браузера, чтобы новая
      // версия приезжала сразу же. Кэш — только запасной вариант офлайн.
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'no-cache' }));
        if (fresh && fresh.ok) {
          (await caches.open(CACHE)).put('./index.html', fresh.clone());
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

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
