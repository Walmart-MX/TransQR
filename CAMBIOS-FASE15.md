# Fase 15 -- Auditoria UX/UI y rediseno movil (admin + asociado)

Complementa `ARQUITECTURA.md` y `CAMBIOS-FASE12/13/14.md`. Cubre la
auditoria de experiencia de usuario pedida (seccion 11 del brief): diagnostico,
propuesta e implementacion en la misma sesion, dado que el propio pedido
autoriza pasar a Etapa C sin aprobacion adicional una vez presentado el
diagnostico, y ninguno de los cambios aqui toca infraestructura, costos
recurrentes, identidad del asociado ni seguridad -- son cambios de interfaz
sobre la logica y los datos existentes, que no se tocaron.

## ETAPA A+B -- Diagnostico y propuesta (resumen; el detalle completo se dio en
el chat)

**Hallazgos concretos en el admin (no genericos, encontrados leyendo el codigo):**

1. Navegacion de 6 pestañas horizontales con scroll lateral -- funciona, pero
   obliga a "buscar" la pestaña que necesitas en vez de tenerla a un toque.
2. La pestaña por defecto al abrir era **QR** (una tarea de configuracion
   inicial), no **Historial** (la tarea diaria real). Ver seccion 11 del
   brief: los 10 puntos de "experiencia esperada" son casi todos sobre
   Historial; QR no aparece.
3. **Bug real encontrado:** la descripcion de cada reporte se pintaba truncada
   a una sola linea con `text-overflow: ellipsis` **sin ninguna forma de ver
   el texto completo** -- ni tooltip, ni boton, nada. El admin literalmente no
   podia leer reportes largos sin exportar el CSV.
4. **Gap real encontrado:** el campo "Buscar por asociado" solo buscaba por
   `nombre`/`num_empleado` -- nunca por `folio`, aunque el folio es justo el
   dato que un asociado comparte cuando pregunta por su reporte.
5. **Gap real encontrado:** el link de la notificacion push
   (`./?folio=...`) no hacia nada -- no existia ningun codigo que leyera
   `location.search`. Tocar la notificacion solo abria el panel en su vista
   por defecto, ignorando el reporte especifico.
6. Botones de gestion (select de estatus, boton "Guardar seguimiento") mas
   chicos del minimo recomendado de 44px para controles tactiles.
7. Cada tarjeta de reporte mostraba *siempre* el editor completo (estatus +
   textarea + boton) para **todos** los reportes de la lista a la vez --
   mucho scroll cuando hay muchos reportes.
8. Lo que **ya estaba bien** y no se toco: el Historial ya usa tarjetas, no
   tablas (cero problema de scroll horizontal en listas); los modales ya usan
   `max-width + width:100%` (no desbordan en pantallas chicas); ya existe un
   filtro de "Buscar por asociado"; ya existen `<details>` nativos para
   filtros avanzados (patron ligero, sin JS extra).

**Hallazgos en la vista del asociado (`app/`):**

- Ya esta construida "mobile-first" de origen (los estilos base, no solo los
  media queries, ya estan pensados para telefono) -- consistente con que es
  la interfaz que de verdad usan los asociados a diario. Por eso aqui el
  trabajo fue de **pulido**, no de rediseno.
- Los chips de seleccion (tipo de reporte, situaciones) tenian un area
  tactil un poco chica (~34px). Unico ajuste real necesario.
- El boton principal (WhatsApp) ya es grande y comodo (56px+).
- Flujo de reporte ya es corto: modal una sola vez -> formulario -> enviar.
  "Mis Reportes" ya permite consultar seguimiento sin volver a llenar nada.

**Pendiente real, documentado pero NO corregido en esta pasada (ver "Lo que
queda pendiente" abajo):** los chips de seleccion en ambos archivos son
`<div onclick=...>`, no `<button>` -- no son alcanzables por teclado ni se
anuncian como controles a un lector de pantalla. Es un hallazgo de
accesibilidad real, pero corregirlo bien implica tocar todas las plantillas
que generan chips dinamicamente en los dos archivos -- un cambio mas amplio
y con mas superficie de riesgo del que me parecio prudente hacer sin
aislarlo en su propia revision. Queda senalado, no resuelto.

## ETAPA C -- Que se implemento

### Admin: navegacion movil

- **Nueva barra de navegacion inferior fija**, visible solo en pantallas
  `<=720px` (las pestañas de arriba se ocultan ahi, sigue igual en
  escritorio): **Historial, Servicio, Asociados, Mas**. "Mas" abre una hoja
  deslizable desde abajo con **QR, Rutas y Paradas, LT Transportista**
  (las tres secciones de configuracion menos frecuentes).
- `showTab()` se reescribio para sincronizar el estado activo via
  `data-tab` en vez de un indice de arreglo fragil -- ahora un solo mecanismo
  sirve para las pestañas de escritorio Y el nav inferior.
- **La pestaña por defecto ahora es Historial**, no QR (ver hallazgo #2).

### Admin: tarjetas de reportes rediseñadas (colapsables)

- Cada tarjeta ahora muestra, **colapsada por defecto**: fecha/hora, tipo,
  nombre + primeras 2 lineas de la descripcion, y un **badge de estatus
  visible siempre** (antes el estatus solo se veia abriendo el selector).
- Al tocar la tarjeta se expande mostrando la **descripcion completa sin
  truncar** (arregla el bug #3), las situaciones, el selector de estatus, el
  campo de comentario y el boton de guardar.
- Esto reduce drasticamente el scroll cuando hay muchos reportes, sin perder
  ninguna funcion -- todo lo que existia sigue estando, solo que bajo un toque.

### Admin: busqueda por folio + deep-link desde notificacion

- El campo "Buscar por asociado" ahora **tambien** acepta un folio completo
  (se detecta por formato UUID y usa coincidencia exacta en vez de texto
  parcial, ya que un folio siempre se copia/pega completo). Arregla el gap #4.
- Tocar una notificacion push de "nuevo reporte" ahora **abre el panel
  directo en Historial, con el filtro de fecha en "Todo", busca ese folio
  especifico, y expande la tarjeta automaticamente** -- arregla el gap #5 y
  cumple el punto 5 de la experiencia esperada ("abrir un reporte... sin
  tener que ampliar constantemente la pantalla").

### Admin: objetivos tactiles

- Selector de estatus y boton "Guardar seguimiento" agrandados a >=44px de
  alto en pantallas moviles (antes ~30px).
- Pestañas y chips de filtro rapido con mas area de toque.

### Asociado: pulido menor

- Chips de seleccion (tipo de reporte, situaciones) con mas padding y altura
  minima de 40px (antes ~34px). Sin tocar el flujo, la logica ni el resto del
  diseno, que ya funcionaba bien.

### Limpieza de codigo obsoleto (seccion 11.4)

- `404.html` -- **ya se habia eliminado en la Fase 14**, con el analisis
  completo de por que ya no cumplia ninguna funcion (dejo de ser necesario
  desde la Fase 12, cuando se quito el ruteo `/cedis/{slug}/`). No hay nada
  pendiente aqui.
- `index.html` (raiz) -- sigue siendo una copia identica de `app/index.html`,
  **sigue sin resolverse** (fue senalado desde la Fase 14 y el usuario no ha
  dado instruccion de que hacer con el). Se deja intacto.
- No se encontraron otros archivos HTML huerfanos, CSS no usado evidente, ni
  bibliotecas duplicadas -- el proyecto ya es bastante magro (solo 2
  dependencias CDN: `supabase-js` y `qrcodejs`, ambas en uso activo).
- Se evaluo agregar `defer` a los scripts del CDN para acelerar la carga
  inicial, pero se descarto: el script principal (inline, al final del
  `<body>`) depende de que `supabase`/`QRCode` ya esten cargados de forma
  sincrona: diferirlos rompia ese orden. El riesgo superaba la ganancia de
  rendimiento, que ademas no esta confirmada como un problema real (no se
  detecto evidencia de carga lenta).

## ETAPA D -- Validacion

- **Verificacion estatica:** conteo de llaves/parentesis/corchetes/backticks/
  comentarios balanceado en ambos archivos despues de cada cambio (no hay
  Node disponible en esta maquina para un linter real de JS).
- **Verificacion visual emulada** (Playwright, via el agente de QA visual,
  **no es un dispositivo fisico real**): se sirvio el proyecto en un servidor
  HTTP local temporal y se revisaron:
  - `admin/index.html` en 375x812, 414x896 y 1280x800 -- sin login (no hay
    credenciales de prueba). La pantalla de login se ve correcta, sin
    scroll horizontal, sin cortes, en los 3 tamanos. **No se pudo verificar
    visualmente el nav inferior ni las tarjetas colapsables porque requieren
    sesion autenticada** -- queda pendiente de que el usuario lo confirme en
    su propio navegador ya logueado.
  - `app/index.html` en 375x812 y 414x896 -- modal de bienvenida y formulario
    principal, ambos sin overflow horizontal, sin cortes, boton de WhatsApp
    completo.
  - Sin errores de JavaScript visibles en consola durante estas pruebas (con
    la limitacion de que la herramienta no expone la consola DevTools
    directamente).

## Lo que queda pendiente (honesto, no se resolvio en esta pasada)

1. **Accesibilidad de teclado en los chips** (`<div onclick>` en vez de
   `<button>`): afecta tanto a `app/` como a `admin/`. Requiere su propia
   revision enfocada por el volumen de plantillas dinamicas que tocaria.
2. **`index.html` (raiz):** sigue siendo un duplicado sin resolver, pendiente
   de que el usuario decida su destino (redirect, PWA propia, o eliminacion).
3. **Verificacion en dispositivo fisico real:** todo lo de esta fase se
   valido por analisis de codigo + emulacion de navegador. No hay forma de
   probar en un iPhone/Android fisico desde este entorno -- se recomienda que
   el usuario lo revise en su propio telefono antes de darlo por cerrado al
   100%.
4. **Nav inferior y tarjetas colapsables sin verificar visualmente
   post-login** (ver Etapa D) -- la logica y el CSS estan implementados y
   pasan la verificacion estatica, pero nadie los ha *visto* renderizados
   todavia.

## Archivos modificados en esta fase

- `admin/index.html`: nav inferior movil + hoja "Mas", tarjetas de historial
  colapsables, busqueda por folio, deep-link desde notificacion, objetivos
  tactiles agrandados, pestaña por defecto cambiada a Historial.
- `app/index.html`: chips con area tactil mas grande.
- Ningun archivo eliminado en esta fase (404.html ya se habia eliminado en
  la Fase 14).
- Ningun cambio en Supabase, RLS, Edge Functions ni el esquema de datos --
  esta fase es 100% interfaz.
