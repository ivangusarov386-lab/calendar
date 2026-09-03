'use strict';

// Service worker только для того, чтобы сайт можно было "установить" на
// экран телефона (это требование браузеров для PWA) и чтобы он открывался
// с последней увиденной версией офлайн. Данные календаря (Apps Script)
// сюда не попадают вообще — они всегда идут напрямую в сеть, свежими, как
// того требует ТЗ сайта; кэшируется только статика (HTML/CSS/JS/иконки).

const CACHE_NAME = 'calendar-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Данные из Google Таблицы — всегда напрямую из сети, никогда не кэшируем.
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
