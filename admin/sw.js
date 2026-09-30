/*
 * Service Worker - TransQR Admin.
 * Alcance: solo /admin/. Mismo patron que app/sw.js (ver comentarios ahi),
 * pero con su propio nombre de cache y su propio comportamiento de clic en
 * notificacion (abre el Historial, no el formulario).
 */
const CACHE_VERSION = 'transqr-admin-shell-v1';
const ASSETS_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => c !== CACHE_VERSION).map((c) => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const esMismoOrigen = url.origin === self.location.origin;

  if (event.request.method !== 'GET' || !esMismoOrigen) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});

/* ════════════════════════════════
   NOTIFICACIONES PUSH (Fase 3 del plan de evolucion)
   Inertes hasta que exista la Edge Function que dispare el push al admin
   cuando llegue un reporte nuevo.
════════════════════════════════ */
self.addEventListener('push', (event) => {
  let datos = { title: 'TransQR Admin', body: 'Nuevo movimiento en Historial.', url: './' };
  try { if (event.data) datos = { ...datos, ...event.data.json() }; } catch (e) { /* payload no-JSON */ }

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: datos.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const existente = lista.find((c) => c.url.includes(self.registration.scope));
      if (existente) return existente.focus();
      return self.clients.openWindow(destino);
    })
  );
});
