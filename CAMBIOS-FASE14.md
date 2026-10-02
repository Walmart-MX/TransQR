# Fase 14 -- PWA (asociado + admin), notificaciones push, seguridad y limpieza

## Fase 14d -- Sesion de depuracion real (push + tiempo real)

Despues del despliegue inicial, se probo en vivo y aparecieron 3 cosas por
resolver. Diagnostico y arreglo de cada una:

1. **El admin SI pudo activar notificaciones, el asociado NO.** La causa
   mas probable: en iPhone, Apple solo permite Web Push si la app ya fue
   agregada a la pantalla de inicio (estandalone) -- en una pestana normal
   de Safari la suscripcion falla aunque el boton se vea. Se agrego una
   validacion explicita que detecta ese caso ANTES de intentar suscribir y
   muestra un mensaje claro ("agrega esta app a tu pantalla de inicio
   primero") en vez de un error generico. Tambien se mejoro el mensaje de
   error en ambos archivos (`app/index.html` y `admin/index.html`) para que
   muestre el motivo real (`e.name` + `e.message`) en vez de "No se pudo
   activar, intenta de nuevo" -- la proxima vez que algo falle, el mensaje
   en pantalla va a decir por que.
2. **No llego la notificacion push esperada.** Se investigo de punta a
   punta insertando un reporte de prueba real contra el proyecto (borrado
   despues) y leyendo la respuesta de la Edge Function (se reescribio para
   devolver un diagnostico JSON detallado en vez de un simple "OK", visible
   en `net._http_response.content`). Resultado: **la funcion SI mando el
   push y FCM (el servicio de Google detras de Chrome/Edge) lo acepto sin
   error** (`{"ok":true,"detalle":"enviado"}`). Es decir, todo el lado del
   servidor (trigger -> Edge Function -> VAPID -> FCM) funciona. Si no se
   vio la notificacion en pantalla, el punto a revisar ahora es el lado del
   sistema operativo/navegador de ese dispositivo especifico: permisos de
   notificacion de Windows para Edge/Chrome, Focus Assist/"No molestar", o
   que la notificacion haya caido silenciosa al Centro de actividades en
   vez de mostrar banner. No es algo que se arregle con mas codigo del lado
   del proyecto.
3. **"Tenia que actualizar manualmente", se pidio lo mas en tiempo real
   posible.** Aclaracion importante: esto NO es una limitante de GitHub
   Pages -- el hosting estatico solo afecta los archivos HTML/CSS/JS, los
   datos siempre fueron dinamicos (Supabase). Se agrego:
   - **Admin:** suscripcion real a Supabase Realtime
     (`postgres_changes` sobre `reportes_transporte`, ver
     `fase14c-realtime.sql`) -- en cuanto hay un INSERT/UPDATE/DELETE en
     cualquier reporte, el Historial (indicadores + lista o tendencia,
     segun lo que este viendo) se refresca solo, sin recargar la pagina.
     Esto es ademas e independiente del push: mientras el panel este
     abierto, esto es instantaneo.
   - **Asociado:** Realtime **no es posible aqui a proposito** --
     `reportes_transporte` no tiene politica de SELECT para `anon` (RLS
     evita que un asociado pueda ver reportes ajenos), y Realtime respeta
     RLS. En su lugar, "Mis Reportes" se refresca solo cada 25 segundos
     mientras esa pestana este abierta, y de inmediato al volver a la app
     (evento `visibilitychange`). Combinado con el push (que avisa aunque
     la app este cerrada), cubre el mismo objetivo sin abrir una via para
     ver datos de otros asociados.

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
2. Generar un par de llaves VAPID (gratis, una sola vez). Dos formas, elige
   la que tengas disponible:
   - Con Node: `npx web-push generate-vapid-keys`.
   - Sin Node (esta maquina no lo tiene instalado), con Python +
     `cryptography` (ya viene en este entorno): genera un par EC P-256,
     codifica ambas mitades en base64url sin padding (formato RFC 8292,
     identico al que produce `web-push`). Si algun dia hay que rotarlas,
     se repite este mismo calculo.
   - **Ya se generaron unas llaves reales para este proyecto y YA ESTAN
     aplicadas** (ver estado al final de esta seccion). La publica ya
     quedo pegada en `app/index.html` y `admin/index.html`. La privada
     **nunca se escribio en ningun archivo del repo** -- solo vivio en el
     chat el tiempo necesario para correr `supabase secrets set`, y de ahi
     en adelante solo existe dentro de Supabase (los secretos de una Edge
     Function no se pueden volver a leer en texto plano ni con la propia
     CLI, solo reemplazar). Si necesitas rotarla algun dia, se genera un
     par nuevo y se vuelve a correr `supabase secrets set`.
3. Configurar secretos de la funcion:
   `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu-correo WEBHOOK_SECRET=un-texto-largo-al-azar`.
4. Desplegar: `supabase functions deploy notificar-push --no-verify-jwt`
   (el `--no-verify-jwt` es porque quien la llama es el Webhook de
   Supabase, no un usuario logueado).
5. Dashboard de Supabase -> Database -> Webhooks -> crear uno sobre
   `reportes_transporte`, eventos Insert + Update, apuntando a la URL de la
   funcion desplegada, con el header `x-webhook-secret` = el mismo valor
   que pusiste en `WEBHOOK_SECRET` (asi la funcion rechaza cualquier
   llamada que no venga de tu propio Webhook).
6. ~~Pegar la llave publica de VAPID en `VAPID_PUBLIC_KEY`~~ -- **ya hecho**,
   la llave publica de arriba ya esta en ambos archivos.

### Estado real al cierre de esta fase (corrido desde la CLI, en vivo)

- [x] Paso 1 -- `fase14-notificaciones-push.sql` corrido contra el proyecto
      real (via `supabase link` + Management API). Tabla `push_subscriptions`
      confirmada con una consulta de verificacion.
- [x] Paso 2 -- llaves VAPID generadas (metodo Python, ver arriba).
- [x] Paso 3 -- los 4 secretos (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
      `VAPID_SUBJECT`, `WEBHOOK_SECRET`) configurados con
      `supabase secrets set` y confirmados con `supabase secrets list`.
- [x] Paso 4 -- `notificar-push` desplegada con
      `supabase functions deploy --no-verify-jwt` (no hizo falta Docker).
- [x] **Paso 5 -- HECHO, via SQL directo (no se necesito el Dashboard).**
      El intento inicial fallo porque el esquema `supabase_functions` no
      existia (ver mas abajo). En vez de usar el boton del Dashboard, se
      investigo la causa real: faltaba la extension `pg_net`. Se instalo
      (`create extension pg_net`), se reviso la firma real de
      `net.http_post` en esta version especifica antes de escribir nada
      (no se adivino de memoria), se recreo la funcion
      `supabase_functions.http_request()` y se crearon los 2 triggers
      (`reportes_transporte_webhook_insert`/`_update`) sobre
      `reportes_transporte`. Todo esto quedo documentado, reproducible y
      con el secreto reemplazado por un placeholder, en
      `fase14b-webhook-trigger.sql`.
      **Prueba real de punta a punta:** se inserto un reporte de prueba
      (`num_empleado = 'TEST-WEBHOOK'`), se confirmo en
      `net._http_response` que el trigger de INSERT disparo la funcion y
      respondio `200 OK`; se actualizo el `estatus` de ese mismo reporte y
      se confirmo el mismo `200 OK` para el trigger de UPDATE; despues se
      borro el reporte de prueba. El pipeline completo (trigger -> Edge
      Function -> respuesta) esta verificado en el proyecto real, no solo
      en teoria.
- [x] Paso 6 -- llave publica ya pegada en ambos `index.html`.

Con esto, **las 6 piezas de infraestructura de notificaciones push ya
estan funcionando en el proyecto real** -- lo unico que falta para que
alguien reciba un push de verdad es que un asociado o un admin presione
"Activar notificaciones" al menos una vez (eso llena `push_subscriptions`,
que hoy esta vacia).




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
  `fase14-notificaciones-push.sql`, `fase14b-webhook-trigger.sql`,
  `fase14c-realtime.sql`, `supabase/functions/notificar-push/index.ts`,
  `CAMBIOS-FASE14.md`.
- Modificados: `app/index.html` (head PWA, banner instalacion, boton
  notificaciones, escapeHtml en Mis Reportes, reintento offline al
  reconectar), `admin/index.html` (head PWA, banner instalacion, boton
  notificaciones, escapeHtml en Historial y Asociados, reintento offline al
  reconectar).
- Eliminado: `404.html`.
