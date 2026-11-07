// Service Worker.
//
// אסטרטגיה:
//  * קבצי המסגרת (HTML/CSS/JS/אייקונים) - cache first, כדי שהאפליקציה תיפתח גם ברשת גרועה.
//  * קריאות API - network first בלבד. נתוני בריאות ותוכניות אינם נשמרים במטמון הדפדפן.
//  * בקשות POST/PUT/DELETE לא עוברות דרך המטמון כלל.

const VERSION = 'coach-v2';
const SHELL = [
  '/app',
  '/styles.css',
  '/app.js',
  '/api.js',
  '/ui.js',
  '/screens-core.js',
  '/screens-more.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: תמיד מהרשת. אין שמירת נתוני משתמש במטמון.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ error: 'אין חיבור לרשת כרגע. הנתונים שהוזנו באימון נשמרים מקומית וייסגרו כשהחיבור יחזור.' }),
            { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } },
          ),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // רענון ברקע כדי שהגרסה הבאה תהיה עדכנית
        fetch(req)
          .then((res) => res.ok && caches.open(VERSION).then((c) => c.put(req, res.clone())))
          .catch(() => {});
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match('/app'));
    }),
  );
});
