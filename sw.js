// Service worker приложения «flashcards-imba».
//
// Он кэширует ТОЛЬКО файлы приложения: страницу, манифест, иконки.
// Прогресс (localStorage и запись 'doc' в IndexedDB) service worker не читает
// и никогда не трогает — обновление приложения не может задеть прогресс.
// Единственное, что он читает, — крошечную запись 'remind' (время напоминания
// и занимался ли сегодня), чтобы на Android показать напоминание в фоне.
const CACHE = 'fc-shell-3.15.1';
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

// ---- Напоминание (Android, установленное приложение: Periodic Background Sync) ----
function kv(key, val) {
  return new Promise(res => {
    try {
      const r = indexedDB.open('fcdb', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) { } };
      r.onerror = () => res(null);
      r.onsuccess = () => {
        try {
          const db = r.result, tx = db.transaction('kv', val === undefined ? 'readonly' : 'readwrite');
          const st = tx.objectStore('kv'), q = val === undefined ? st.get(key) : st.put(val, key);
          q.onsuccess = () => res(val === undefined ? q.result : true);
          q.onerror = () => res(null);
        } catch (e) { res(null); }
      };
    } catch (e) { res(null); }
  });
}
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
async function remindCheck() {
  let st = null;
  try { st = JSON.parse((await kv('remind')) || 'null'); } catch (e) { }
  if (!st || !st.on) return;
  const now = new Date(), today = dayKey(now);
  const [hh, mm] = String(st.time || '20:00').split(':').map(n => +n || 0);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return;   // ещё рано
  if (st.studied === today) return;                                     // сегодня уже занимался
  if ((await kv('remind-shown')) === today) return;                     // уже напоминали
  await kv('remind-shown', today);
  const n = st.cards || 0;
  const body = n ? 'Сегодня ' + n + ' карточ' + (n % 10 === 1 && n % 100 !== 11 ? 'ка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'ки' : 'ек') + ' — это пара минут.'
                 : 'Загляни на пару минут — слова любят повторение.';
  await self.registration.showNotification((st.name || 'Лекси') + ' скучает 🌱', { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'fc-remind' });
}
self.addEventListener('periodicsync', e => { if (e.tag === 'fc-remind') e.waitUntil(remindCheck()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
