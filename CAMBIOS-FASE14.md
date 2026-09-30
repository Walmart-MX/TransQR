# Fase 14 -- PWA (asociado + admin), notificaciones push, seguridad y limpieza

Complementa a `ARQUITECTURA.md`, `CAMBIOS-FASE12.md` y `CAMBIOS-FASE13.md`
(no los reemplaza). Resultado de la auditoria completa pedida antes de tocar
codigo (ver el diagnostico entregado en la conversacion: viabilidad, que se
reutiliza, arquitectura recomendada, plan por fases, riesgos). Aqui se
implementa lo que ya fue autorizado explicitamente:

1. Crear infraestructura de notificaciones push (tabla + Edge Function).
2. Eliminar `404.html`.
3. Dejar el retiro de WhatsApp para despues, silencioso, hasta que el push
   este probado en campo (todavia NO se hizo -- ver seccion final).

## 1) PWA -- instalable en `/app/` y `/admin/`

Dos PWAs independientes, cada una con su propio `manifest.json` y `sw.js`
dentro de su propia carpeta (el *scope* de un Service Worker es la carpeta
donde vive el archivo, asi que uno nunca controla al otro):

- `app/manifest.json`, `app/sw.js`, `app/icons/` (192px, 512px, maskable).
- `admin/manifest.json`, `admin/sw.js`, `admin/icons/` (mismos tamanios).
- Icones generados por primera vez para este proyecto (antes no existia ni
  una sola imagen en el repo, todo eran emojis inline). Asociado = azul con
  un camion; Admin = azul oscuro con un portapapeles, para distinguirlos si
  alguien instala ambos en el mismo telefono.
- `<head>` de ambos archivos: `<link rel="manifest">`, `theme-color`,
  `apple-touch-icon` y las meta de `apple-mobile-web-app-*` (necesarias para
  que iOS trate la app como "standalone" al agregarla a inicio).
- Banner de instalacion con dos variantes:
  - **Android/desktop:** aparece solo si el navegador dispara
    `beforeinstallprompt`; el boton "Instalar" llama a `instalarPWA()`.
  - **iOS/Safari:** ese evento no existe en iOS, asi que se detecta
    `iPhone|iPad|iPod` por user-agent y se muestra un banner con las
    instrucciones manuales (Compartir -> Agregar a inicio).
  - Ambos se pueden cerrar y quedan ocultos permanentemente en ese
    dispositivo (`localStorage`), mismo patron que ya usa el resto del app.
- Estrategia del Service Worker: solo cachea el shell (HTML/manifest/icons
  de su propia carpeta) con network-first + respaldo en cache. Todo lo que
  va a Supabase o al CDN de `supabase-js` pasa derecho a la red, sin
  cachear -- no queremos servir datos viejos de una API que cambia
  constantemente (estatus de reportes, catalogos).
- Ya vienen listos (aunque inertes hasta la seccion 2) los manejadores
  `push` y `notificationclick` en ambos `sw.js`, para no tener que volver a
  tocar ese archivo cuando se conecte el backend de notificaciones.

**Nota de mantenimiento:** este proyecto no tiene build step a proposito
(ver `ARQUITECTURA.md`). Si el shell cambia de forma relevante, hay que
subir manualmente el numero en `CACHE_VERSION` dentro del `sw.js`
correspondiente para que los navegadores ya instalados descarten la cache
vieja.

## 2) Notificaciones push -- infraestructura lista, falta un paso tuyo

No se puede mandar Web Push desde el navegador solo: hace falta una pieza
con una llave privada (VAPID) que jamas debe viajar al cliente. Se uso lo
que el proyecto ya tiene (Supabase), sin agregar Firebase ni ninguna cuenta
externa nueva:

- `fase14-notificaciones-push.sql`: tabla `push_subscriptions` + RLS (mismo
  estilo que `fase10-seguridad.sql`). Se ejecuta en el SQL Editor de
  Supabase.
- `supabase/functions/notificar-push/index.ts`: Edge Function en Deno que
  Supabase llama via un *Database Webhook* cuando hay INSERT o UPDATE en
  `reportes_transporte`. Manda push a los admins suscritos en un reporte
  nuevo, y al asociado dueno del reporte cuando cambia su `estatus`.
- Frontend: `VAPID_PUBLIC_KEY` (constante placeholder, junto a
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` en ambos archivos), boton "Activar
  notificaciones" en "Mis Reportes" (asociado) y en Historial (admin), que
  piden permiso al navegador y guardan la suscripcion en
  `push_subscriptions`.

### Pasos que faltan por hacer del lado de Supabase (no se pueden hacer sin tus credenciales de servicio)

1. Correr `fase14-notificaciones-push.sql` en el SQL Editor.
2. Generar un par de llaves VAPID (gratis, una sola vez):
   `npx web-push generate-vapid-keys`.
3. Configurar secretos de la funcion:
   `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu-correo VAPID_SUBJECT=mailto:... WEBHOOK_SECRET=un-texto-largo-al-azar`.
4. Desplegar: `supabase functions deploy notificar-push --no-verify-jwt`
   (el `--no-verify-jwt` es porque quien la llama es el Webhook de
   Supabase, no un usuario logueado).
5. Dashboard de Supabase -> Database -> Webhooks -> crear uno sobre
   `reportes_transporte`, eventos Insert + Update, apuntando a la URL de la
   funcion desplegada, con el header `x-webhook-secret` = el mismo valor
   que pusiste en `WEBHOOK_SECRET` (asi la funcion rechaza cualquier
   llamada que no venga de tu propio Webhook).
6. Pegar la llave publica de VAPID en `VAPID_PUBLIC_KEY` dentro de
   `app/index.html` y `admin/index.html` (reemplazar
   `'TU-VAPID-PUBLIC-KEY-AQUI'`).

Mientras el paso 6 no este hecho, el boton "Activar notificaciones" ni
siquiera aparece (la app detecta la llave placeholder y no ofrece la
opcion) -- no hay riesgo de que alguien intente activarlo a medias.

### Limitacion de iOS (no es un bug, es una restriccion de Apple)

En iPhone, Web Push **solo funciona si la app ya fue "Agregada a inicio"**;
en una pestana normal de Safari no hay push posible, sin excepcion. Por eso
se dejo WhatsApp activo (ver seccion 4): mientras no todos los asociados
tengan la PWA instalada, WhatsApp sigue siendo el respaldo real para ese
grupo.

## 3) Correccion de seguridad -- XSS almacenado en Historial y Asociados (admin)

Hallazgo de la auditoria: `admin/index.html` pintaba `nombre`, `descripcion`,
`tipo_reporte`, `area`, `celular`, etc. directo en `innerHTML`, y esos
valores vienen de un formulario **publico y sin autenticacion**. Alguien
podia escribir HTML/JS en la descripcion de un reporte y que se ejecutara en
el navegador del administrador la siguiente vez que abriera Historial.

Se agrego una funcion `escapeHtml()` (una por archivo, mismo criterio de
"cada carpeta autocontenida" que ya usa el proyecto) y se aplico en:

- Historial: fecha, hora, tipo de reporte, nombre, descripcion, etiquetas de
  situacion, el textarea de comentario de seguimiento, y el badge de
  recurrente.
- Asociados: nombre, numero de asociado, area, celular, y el resumen por
  area.
- `app/index.html` -> "Mis Reportes": tipo_reporte, descripcion y el
  comentario de seguimiento (aqui el riesgo es mas bajo -- es el propio
  telefono del asociado -- pero se corrigio igual por consistencia, ya que
  el comentario SI lo escribe el admin).

**Lo que quedo pendiente, a proposito, para no arriesgar un cambio grande
sin pedirlo:** varios botones del admin arman su `onclick` interpolando
directamente un valor (ej. `onclick="editarAsociadoPorNumero('${a.numero_asociado}')"`).
Si ese valor trae una comilla, en teoria podria romper el atributo. Es un
riesgo mas dificil de explotar (requiere insertar datos por fuera del
formulario normal) y corregirlo bien implica cambiar el patron de "onclick
con datos interpolados" por `data-*` + `addEventListener` en decenas de
lugares del archivo -- es un refactor, no una correccion puntual. Se deja
anotado para una fase aparte si se decide hacerlo.

## 4) Cola offline -- se cerro un hueco chico

`sincronizarPendientes()` ya existia, pero solo se ejecutaba al cargar la
pagina. Se agrego `window.addEventListener('online', sincronizarPendientes)`
en `app/index.html` y `admin/index.html`, para que si el reporte se guardo
localmente por falta de senal, se reintente solo en cuanto vuelva el
internet, sin esperar a que alguien recargue.

## 5) `404.html` eliminado

Confirmado: su unica razon de ser (las rutas `/cedis/{slug}/` de fases
anteriores) ya no existe desde la Fase 12, y el generador de QR del admin
apunta directo a `/app/`. Se elimino el archivo. **Pendiente de tu parte:**
si todavia hay QR o letreros fisicos impresos con la URL vieja
`/cedis/villahermosa/`, dejaran de funcionar -- confirmaste que ya se puede
eliminar, asi que se asume que ese material ya esta retirado o no importa.

`index.html` (raiz) **no se toco** -- sigue siendo una copia identica de
`app/index.html`, tal como quedo en la Fase 12. Con `404.html` fuera, es el
unico archivo duplicado que queda en el repo. No se decidio nada sobre el
en esta fase (no se pidio); queda como pendiente de decision futura:
convertirlo en un redirect a `/app/`, darle el mismo tratamiento de PWA, o
eliminarlo tambien.

## 6) WhatsApp -- sigue exactamente igual (a proposito)

Tal como se acordo, no se toco `enviarWhatsApp()` ni el boton verde de
`app/index.html`. El reporte se sigue guardando en Supabase primero y
abriendo WhatsApp despues, igual que siempre. El retiro de WhatsApp del
flujo principal queda para cuando el push ya este probado en campo (ver
plan de migracion de la auditoria, Fase 5 y 6).

## Resumen de archivos nuevos/modificados

- Nuevos: `app/manifest.json`, `app/sw.js`, `app/icons/*.png`,
  `admin/manifest.json`, `admin/sw.js`, `admin/icons/*.png`,
  `fase14-notificaciones-push.sql`, `supabase/functions/notificar-push/index.ts`,
  `CAMBIOS-FASE14.md`.
- Modificados: `app/index.html` (head PWA, banner instalacion, boton
  notificaciones, escapeHtml en Mis Reportes, reintento offline al
  reconectar), `admin/index.html` (head PWA, banner instalacion, boton
  notificaciones, escapeHtml en Historial y Asociados, reintento offline al
  reconectar).
- Eliminado: `404.html`.
