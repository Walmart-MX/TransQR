/*
 * Service Worker - TransQR (vista Asociado).
 * Alcance: solo /app/ (se registra desde app/index.html con scope relativo,
 * nunca toca /admin/ ni la raiz del repo).
 *
 * Estrategia:
 *  - Shell (HTML/manifest/icons de esta misma carpeta): network-first con
 *    respaldo en cache, para que abrir la PWA sin internet siga mostrando
 *    el formulario (enviar reportes offline ya lo resuelve la cola local
 *    que existe en index.html - CLAVE_PENDIENTES - esto solo cubre que la
 *    pantalla misma cargue).
 *  - Todo lo demas (Supabase API, CDN de supabase-js): pasa directo a la
 *    red, sin cachear. No queremos servir respuestas viejas de una API que
 *    cambia todo el tiempo (estatus de reportes, catalogos, etc).
 *
 * Bump manual de CACHE_VERSION cada vez que cambie el shell de forma
 * relevante (no hay build step en este proyecto, es intencional).
 */
const CACHE_VERSION = 'transqr-app-shell-v10';
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
    return; // Deja pasar a la red tal cual: APIs, CDN, POST/insert de Supabase.
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
   NOTIFICACIONES PUSH (Fase 3/4 del plan de evolucion)
   Inertes hasta que exista la tabla push_subscriptions + la Edge Function
   que las dispare - se dejan listas de una vez para no volver a tocar este
   archivo cuando se conecte esa parte del backend.
════════════════════════════════ */
self.addEventListener('push', (event) => {
  let datos = { title: 'TransQR', body: 'Tienes una actualizacion de tu reporte.', url: './' };
  try { if (event.data) datos = { ...datos, ...event.data.json() }; } catch (e) { /* payload no-JSON, se usa el default */ }

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
