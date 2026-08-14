/* Service Worker: legt die App vollstaendig lokal ab, damit sie ohne Netz
   laeuft. Nach dem einmaligen Installieren auf dem Smartphone ist keine
   Verbindung mehr noetig -- es wird nichts an einen Server geschickt. */
/* Muss mit APP_VERSION in index.html und mit version.json uebereinstimmen. */
const CACHE = 'beerenzaehler-2026-08-13.4';
const FILES = [
  '.', 'index.html', 'vision.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* einzelne fehlende Datei darf die Installation nicht kippen */ })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Erst aus dem Netz, bei Ausfall aus dem Cache.
   Umgekehrt (Cache zuerst) waere der Start minimal schneller, aber eine neue
   Programmversion wuerde erst einen Start spaeter greifen -- bei einem
   Laborwerkzeug ist die aktuelle Fassung wichtiger als eine Zehntelsekunde. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // version.json darf nie aus dem Cache kommen -- sonst meldet die Pruefung
  // "aktuell", obwohl auf dem Server laengst eine neue Fassung liegt.
  if (e.request.url.indexOf('version.json') >= 0) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(function () {
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
