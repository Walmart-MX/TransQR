# Arquitectura — Fase 2: separación APP ASOCIADO / ADMIN

## Estructura de carpetas (estado actual)

```
/app/index.html      → App del Asociado (Formulario + Mis Reportes)
/admin/index.html     → Portal Administrativo (QR + Historial/Tendencia/Seguimiento)
```

Cada carpeta es un **paquete autocontenido**: no comparten JS ni HTML entre sí (cada
uno es un solo archivo con todo inline, como en el original). Esto es intencional
para esta etapa — evita duplicar lógica de negocio en un framework, mantiene el
despliegue simple (subir dos carpetas a cualquier hosting estático), y permite que
cada ruta reciba su propia regla de acceso en el paso siguiente.

Al desplegar, sube el contenido de `/app/` y `/admin/` como rutas independientes de
tu hosting (por ejemplo `tudominio.com/app/` y `tudominio.com/admin/`).

## Por qué esto es distinto a "esconder con CSS"

Antes de la Fase 1, un solo archivo HTML contenía las 4 vistas y un password de
JavaScript decidía qué mostrar — cualquiera con el HTML (que siempre es visible en
el navegador) podía leer el código de administración, la contraseña, y la lógica de
Historial, aunque no la viera en pantalla.

Con la separación en dos rutas:
- El código de `admin/` (contraseña, lógica de seguimiento, exportaciones) **ya no
  viaja al navegador de un asociado** que solo abre `/app/`. Reduce superficie de
  exposición, aunque todavía no es control de acceso real (ver siguiente sección).
- Cada ruta puede recibir una regla de acceso **a nivel de servidor/CDN**, algo que
  no es posible cuando todo vive en un único archivo/página.

## Lo que TODAVÍA falta para que `/admin/` esté realmente protegido

La contraseña fija (`6154`) dentro de `admin/index.html` sigue siendo una cortina de
JavaScript, no autenticación. Cualquiera que abra `/admin/` en su navegador y mire el
código fuente la encuentra. **Esto es una decisión pendiente de la Fase 10** y depende
de dónde vayas a hospedar la aplicación — no la implemento todavía porque no sé cuál
usarás y una de las opciones (Supabase Auth) implica cambios de base de datos/RLS que
te debo explicar antes de tocar, según tus reglas de trabajo.

Opciones, de más simple a más robusta:

1. **Netlify Identity + `_redirects` por rol** — bloquea `/admin/*` a nivel de CDN
   antes de que el HTML se sirva. Requiere invitar usuarios admin desde el panel de
   Netlify. Ejemplo de regla en `_redirects`:
   ```
   /admin/*  /admin/:splat  200!  Role=admin
   ```
2. **Cloudflare Access (Zero Trust)** — si usas Cloudflare Pages, puedes restringir
   `/admin/*` a una lista de correos autorizados sin escribir código.
3. **Supabase Auth (recomendado a mediano plazo, ya usas Supabase)** — reemplazar el
   campo de contraseña por un login real (correo + contraseña) contra Supabase Auth,
   y then usar políticas RLS que exijan `auth.role() = 'authenticated'` (o una tabla
   de roles) para leer/escribir `reportes_transporte` y `asociados`. Esto es lo único
   de esta lista que además resuelve el hueco de RLS documentado en el diagnóstico
   inicial (punto 11): hoy cualquiera con la anon key puede leer la tabla completa
   directamente contra la API de Supabase, sin pasar por el candado de la UI.

Ninguna de estas tres está implementada todavía — quedan como decisión tuya para
cuando definamos la Fase 10, o antes si prefieres adelantarla.

## Hosting: GitHub Pages (decisión confirmada)

GitHub Pages es hosting puramente estático: sin redirects por rol, sin funciones
serverless nativas, sin control de acceso por ruta. Esto cambia las recomendaciones
de la sección anterior:

- **Netlify Identity** → descartada (es específica de Netlify).
- **Cloudflare Access** → solo es viable si conectas un **dominio propio** a GitHub
  Pages y lo pasas por Cloudflare como DNS/proxy. Con el dominio gratuito
  `usuario.github.io` tal cual, no es posible (no tienes control de ese DNS).
- **Supabase Auth + RLS** → pasa de ser "recomendado a mediano plazo" a ser **la
  única opción real disponible** sin comprar un dominio propio, porque no depende
  del hosting: la protección deja de ser "bloquear la página" y pasa a ser "la
  página es inútil sin sesión válida", ya que sin login la API de Supabase rechaza
  las consultas (con RLS activo).

**Nota sobre repos públicos:** si tu repositorio de GitHub es público (el caso por
defecto en GitHub Pages gratis), todo el código — incluida la contraseña fija
`6154` — es visible en el repo aunque nadie visite la página. Otra razón más para
no tratar esa contraseña como protección real.

### Ajustes de higiene ya aplicados (sin tocar Supabase)
- `index.html` en la raíz del repo: redirige a `/cedis/villahermosa/`, la ruta
  canónica del asociado desde la Fase 4 (antes redirigía a `/app/`).
- `robots.txt`: excluye `/admin/` de motores de búsqueda. **Esto no es seguridad**,
  solo evita que la ruta aparezca indexada — cualquiera con el link directo sigue
  pudiendo abrirla.

### Estructura de repo esperada (ver también la sección "Fase 4" más abajo)
```
tu-repo/
├── index.html        (redirige a /cedis/villahermosa/)
├── 404.html           (copia de app/index.html — ver Fase 4)
├── robots.txt
├── app/
│   └── index.html    → tuusuario.github.io/tu-repo/app/ (acceso directo, sin slug)
└── admin/
    └── index.html    → tuusuario.github.io/tu-repo/admin/
```
Si usas Pages con fuente `/docs`, mueve estas mismas carpetas dentro de `/docs/`.

### Pendiente de tu decisión
Implementar Supabase Auth (login real de correo/contraseña) en `/admin/` en lugar
del candado de JavaScript, más las políticas RLS correspondientes. No lo hago
todavía porque toca autenticación y reglas de base de datos — te lo planteo como
paso siguiente concreto de la Fase 10, o antes si prefieres adelantarlo.



## Fase 4 — URL / directorio por CEDIS (implementada)

### El problema con GitHub Pages
GitHub Pages es hosting estático puro: no hay rewrites ni rutas dinámicas del lado
del servidor. Una URL como `/cedis/villahermosa/` solo "existe" si hay un archivo
físico ahí — lo cual obligaría a duplicar el HTML completo por cada CEDIS, justo
lo que se pidió evitar.

### La solución: el truco del `404.html`
GitHub Pages, cuando no encuentra un archivo, sirve el `404.html` del repo **sin
cambiar la URL que el usuario ve en el navegador**. Aprovechamos esto: `404.html`
es una copia exacta de `app/index.html`. El flujo queda así:

```
Usuario visita /cedis/villahermosa/
        ↓
GitHub Pages no encuentra ese archivo físico
        ↓
Sirve 404.html (copia de app/index.html) — la URL en el navegador NO cambia
        ↓
resolverCedisDesdeURL() lee window.location.pathname, extrae "villahermosa"
        ↓
Busca ese slug en DIRECTORIO_CEDIS
        ↓
Encontrado  → carga esa configuración y sigue normal
No encontrado → muestra la pantalla "CEDIS no encontrado", nunca carga
                 silenciosamente el CEDIS piloto por error
```

Cero archivos duplicados por CEDIS: agregar un CEDIS nuevo es agregar una entrada
en `DIRECTORIO_CEDIS` (hoy solo vive `villahermosa` — no se inventó ningún otro).

### Mantener `404.html` sincronizado
Como `404.html` es una copia de `app/index.html`, **cada vez que se edite
`app/index.html` hay que copiar el mismo contenido a `404.html`**. Es el único
costo de este enfoque; si prefieres evitarlo más adelante, la alternativa es un
build step (ej. GitHub Action) que genere `404.html` automáticamente a partir de
`app/index.html` en cada `push` — no lo implemento todavía porque es infraestructura
adicional (CI) que no pediste y que vale la pena evaluar aparte.

### Límite importante: esto es UX, no seguridad
Que la URL determine qué CEDIS se muestra **no impide que alguien edite la URL a
mano** y vea el formulario de otro CEDIS. Eso está bien mientras el formulario en
sí no exponga datos de otros CEDIS (hoy no lo hace: cada carga es independiente).
El verdadero aislamiento de datos —que un admin de un CEDIS no pueda leer reportes
de otro— depende de dos cosas que siguen pendientes:
- **Fase 7**: que cada reporte guarde `cedis_id`, no solo el nombre en texto.
- **Fase 10**: políticas RLS en Supabase que filtren por `cedis_id` según el
  usuario autenticado.

### Estructura de repo actualizada
```
tu-repo/
├── index.html         (redirige a /cedis/villahermosa/)
├── 404.html            (copia de app/index.html — habilita /cedis/{slug}/)
├── robots.txt
├── app/
│   └── index.html      → acceso directo, sin slug en la URL (usa el CEDIS por defecto)
└── admin/
    └── index.html
```

## Fase 5 — QR individual por CEDIS (implementada)

El panel `/admin/` ya no genera un QR fijo. Ahora:

- Un **selector de CEDIS** se llena desde `DIRECTORIO_CEDIS_ADMIN` (hoy una sola
  entrada: Villahermosa). Al agregar un CEDIS nuevo hay que agregar su
  `{ slug, nombre }` ahí — es una lista reducida, separada de la que usa
  `asociado.html`, porque admin solo necesita slug + nombre para armar la URL del
  QR (no almacenes, ni paradas, ni WhatsApp).
- Un campo de **URL base de tu sitio** (ej. `https://tuusuario.github.io/turepo`),
  que se guarda en `localStorage` de ese navegador para no volver a escribirla.
- El QR se arma como `URL base + /cedis/{slug}/` y se redibuja automáticamente al
  cambiar el CEDIS o la URL base.
- Nuevo botón **Descargar QR (PNG)**, además del botón de imprimir que ya existía.

**Deuda técnica reconocida (a propósito, no por descuido):** hoy existen DOS listas
de CEDIS que hay que mantener sincronizadas a mano —`DIRECTORIO_CEDIS` completo en
`asociado.html` y `DIRECTORIO_CEDIS_ADMIN` (reducido) en `admin.html`—, porque
todavía no existe la tabla `cedis` en Supabase que ambos archivos puedan consultar.
En cuanto se apruebe el esquema de la Fase 3 y exista esa tabla, ambas listas se
reemplazan por una sola consulta a Supabase y esta duplicación desaparece.

## Fase 6 — Directorio de asociados (implementada)

Nueva pestaña **👥 Asociados** en `/admin/`, con:

- **Crear / editar** — un solo formulario que sirve para ambos casos: si el No. de
  empleado ya existe, `upsert` lo actualiza; si no, lo crea. En edición, el número
  se bloquea (no tiene sentido "cambiar" la llave que identifica al asociado).
- **Activar / desactivar** — botón directo en cada fila de la lista, sin pasar por
  el formulario.
- **Importar por CSV** — sube un archivo con encabezados
  `numero_asociado,nombre,area,celular,cedis_slug` y hace `upsert` masivo. Las filas
  sin `cedis_slug` caen al primer CEDIS del directorio. El parser de CSV es
  deliberadamente simple (soporta comillas para comas dentro de un campo, no soporta
  saltos de línea dentro de un campo) — suficiente para una exportación estándar de
  Excel/Sheets.
- **Filtros** por CEDIS, por estado (activo/inactivo/todos) y búsqueda por número o
  nombre.

**Depende del esquema SQL propuesto en esta fase** (`cedis_slug`, `activo` en
`asociados`) — si no lo has corrido todavía, la pantalla lo detecta (Supabase
regresa error de columna inexistente) y te lo dice en vez de fallar en silencio.

**No se tocó `asociado.html`.** La lógica de búsqueda por número de empleado y
precarga automática sigue exactamente igual — el formulario del asociado no filtra
todavía por `activo`, a propósito: bloquear a un asociado inactivo para que no
pueda reportar es una decisión de negocio que vale la pena confirmar contigo antes
de implementarla (¿debe ver un mensaje?, ¿debe poder seguir reportando pero marcado
de otra forma?), no algo que asumo por mi cuenta.

## Fase 7 — Reportes multi-CEDIS (implementada)

Se aclaró una confusión que veníamos arrastrando desde el diagnóstico inicial:
la columna `cedis` en `reportes_transporte` (valores "Perecederos"/"SECOS") es
en realidad el **almacén**, no el CEDIS. No se renombró — cambiarla habría roto
el Historial, el CSV y los filtros que ya dependen de ese nombre — pero se
agregó una columna nueva, separada, para el CEDIS real:

```sql
alter table reportes_transporte
  add column if not exists cedis_slug text not null default 'villahermosa';
```

Cambios de código:
- `asociado.html` ahora guarda `cedis_slug: CONFIG_CEDIS.slug` en cada reporte,
  además del `cedis` (almacén) que ya guardaba.
- `admin.html` — Historial tiene **dos filtros separados**: "Almacén" (el que
  ya existía, renombrado para que ya no diga "CEDIS" sobre datos de almacén) y
  "CEDIS" (nuevo, usa `cedis_slug` y `DIRECTORIO_CEDIS_ADMIN` — hoy una sola
  opción). Ambos filtros aplican también a la vista de Tendencia semanal.
- El nombre del CEDIS aparece ahora en cada tarjeta del Historial y en el CSV
  exportado (columna `CEDIS`, separada de `Almacén`).

**Lo que falta para el modelo completo de la Fase 7** (`asociado_id`, `ruta_id`,
`parada_id` como relaciones reales en vez de texto): depende de que existan las
tablas `asociados` (ya con esquema propuesto en la Fase 6) y de una futura tabla
`rutas`/`paradas` (Fase 8) — no lo adelanto todavía porque son cambios de esquema
adicionales que, siguiendo la misma regla de todas las fases anteriores, prefiero
proponerte antes de implementar.

## Fase 8 — Rutas y paradas dinámicas (implementada)

Se desacopló la lista de paradas del código. Esquema:

```sql
create table rutas (
  id           uuid primary key default gen_random_uuid(),
  cedis_slug   text not null default 'villahermosa',
  almacen_slug text not null,           -- 'perecederos' | 'secos'
  nombre       text not null,
  orden        int not null default 0,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

create table paradas (
  id       uuid primary key default gen_random_uuid(),
  ruta_id  uuid not null references rutas(id) on delete cascade,
  nombre   text not null,
  orden    int not null default 0,
  activo   boolean not null default true
);
```

Se incluye un script de migración opcional (correrlo o no es tu decisión) que
mete las paradas que ya existen hoy en el código bajo una sola "Ruta general"
por almacén — preserva el comportamiento actual exactamente, sin inventar
agrupaciones geográficas que no conozco. Se reorganiza después desde la
pantalla nueva de administración.

**Cambios de comportamiento (importante):**
- `asociado.html`: el `<select>` de "Parada / Ruta" ya no se llena instantáneo
  desde un array fijo — ahora consulta Supabase (agrupado por ruta, con
  `<optgroup>`) al elegir el almacén. Muestra "Cargando paradas…" mientras
  resuelve. Se cachea en `localStorage` por CEDIS+almacén para funcionar sin
  internet con la última lista conocida. **El array fijo original se conserva
  como último respaldo** — si Supabase no está configurado, las tablas no
  existen, o falla la consulta y no hay caché, la app sigue funcionando
  exactamente como antes de esta fase.
- `admin.html`: nueva pestaña **🛣️ Rutas y Paradas** — crear/renombrar/
  activar-desactivar/eliminar rutas, y agregar/quitar paradas dentro de cada
  una. Eliminar una ruta borra sus paradas en cascada (con confirmación).

## Fase 3 — Cierre (implementada)

Se consolidó todo el SQL pendiente de las Fases 3, 6, 7 y 8 en un solo script:
**`fase3-cierre.sql`**, en la raíz de este paquete. Es seguro de correr aunque
ya hayas aplicado partes sueltas antes (usa `IF NOT EXISTS` / `ON CONFLICT DO
NOTHING`, y las llaves foráneas están envueltas para ignorar el error si ya
existen). Crea `cedis`, `almacenes`, agrega las columnas de `asociados` y
`reportes_transporte` con sus FK reales a `cedis`, y crea `rutas`/`paradas` ya
enlazadas desde el inicio. Incluye un bloque opcional de migración que mete
tus paradas actuales bajo una "Ruta general" por almacén (bórralo si prefieres
empezar de cero).

### El cambio de código: configuración dinámica de verdad

Tanto `asociado.html` como `admin.html` tenían un objeto `DIRECTORIO_CEDIS`
escrito a mano. Ahora ambos:

1. Se resuelven **de forma síncrona** (como siempre) leyendo primero una
   copia en `localStorage` de una visita anterior, o el objeto fijo original
   (ahora renombrado `..._FALLBACK`) si no hay caché — así el flujo de la
   Fase 4 (URL → CEDIS) sigue siendo instantáneo, sin pantallas de carga.
2. En paralelo, sin bloquear nada, disparan una consulta a la tabla `cedis`
   de Supabase. Si responde, actualiza la caché para la **próxima** carga.

**Esto significa que agregar un CEDIS nuevo ya no requiere tocar código**: se
inserta en la tabla `cedis` (+ sus `almacenes`), y aparece solo la siguiente
vez que alguien abra la app o el panel admin — en ambos.

**Decisión de diseño explícita:** se mantiene `slug` (texto) como identificador
en todas las relaciones (`asociados.cedis_slug`, `reportes_transporte.cedis_slug`,
`rutas.cedis_slug`) en vez de migrar a `cedis.id` (uuid). No es un atajo — es
la elección correcta para esta app: las URLs (Fase 4), el QR (Fase 5) y todos
los directorios en memoria ya usan `slug` como llave natural y legible; forzar
un `uuid` interno ahí solo agregaría una traducción extra en cada capa sin
beneficio real. `cedis.slug` es `UNIQUE`, así que las llaves foráneas son
igual de válidas que si apuntaran al `id`.

## Fase 9 — Administración de reportes (implementada)

El Historial ya vivía completo en `/admin/` desde la Fase 1 (lista, filtros de
fecha/almacén/CEDIS/situación, seguimiento, tendencia, concentrado, CSV). Lo
que faltaba del checklist original de esta fase eran tres filtros específicos,
ahora agregados:

- **Filtrar por tipo de reporte** — select con el mismo catálogo de 12 tipos
  que usan los chips del formulario en `asociado.html` (`TIPOS_REPORTE_CATALOGO`,
  duplicado a propósito por ahora — ver nota de deuda técnica abajo). Aplica
  tanto a la Lista como a la Tendencia semanal.
- **Filtrar por estatus** — select con `ESTATUS_CATALOGO` (ya existente).
  Aplica solo a la Lista: no tiene sentido filtrar la Tendencia semanal por
  estatus de seguimiento, que cambia después de que el reporte ya se contó.
- **Buscar por asociado** — texto libre que busca por nombre O número de
  empleado (`ilike` en Supabase, sin distinguir mayúsculas), con una pequeña
  espera (400 ms) antes de consultar para no disparar una petición por cada
  tecla.

**Deuda técnica reconocida:** `TIPOS_REPORTE_CATALOGO` en `admin.html` es una
copia de los mismos 12 valores que ya viven como chips en el formulario de
`asociado.html`. Si agregas un tipo de reporte nuevo, hay que actualizar los
dos lugares. Se resuelve solo cuando ese catálogo pase a vivir en una tabla de
Supabase (mismo patrón que `cedis`/`almacenes`/`rutas` — no lo hice ahora
porque no lo pediste explícitamente y ya son varias tablas nuevas en esta
migración; lo señalo para cuando quieras cerrarlo).

**Nada cambió en `asociado.html`** — como pide la Fase 9, estas funciones
administrativas nunca aparecieron ahí y siguen sin aparecer.

## Corrección de bug — pantalla "CEDIS no encontrado" siempre visible

**Reportado en producción** (`walmart-mx.github.io/TransQR/cedis/villahermosa/`):
la pantalla de error de la Fase 4 aparecía siempre, con el link vacío
(`"El enlace que abriste () no corresponde..."`), y debajo — hasta con scroll —
se veía el formulario funcionando con normalidad.

**Causa:** el `style` inline de esa pantalla tenía la propiedad `display`
escrita dos veces:
```html
style="display:none; min-height:100vh; display:flex; ..."
```
En CSS, cuando una propiedad se repite en el mismo bloque, gana la última —
así que `display:flex` anulaba el `display:none` inicial y el banner quedaba
visible desde el primer render, sin importar si el CEDIS se encontraba o no.
Como el texto del slug solo se llena por JavaScript en el caso "no
encontrado", en el caso normal (CEDIS sí encontrado) ese texto se quedaba
vacío — de ahí el link vacío en el mensaje.

**Corrección:** se quitó la segunda declaración de `display`, dejando el
control de visibilidad exclusivamente en manos del JavaScript de
`resolverCedisDesdeURL()`, como estaba pensado desde el inicio. Se revisó
sistemáticamente todo el archivo por si el mismo patrón (`style` con una
propiedad repetida) aparecía en otro lugar — no se encontró ningún otro caso.

**Archivos corregidos:** `app/index.html` y `404.html` (deben ser copias
idénticas — ver Fase 4 sobre por qué existen ambos).

## Siguiente paso natural (Fase 10)

Con el checklist de administración de reportes completo, solo queda la Fase
10: seguridad real. Es, con diferencia, el pendiente más importante del
proyecto — la contraseña fija de Historial (`6154`, visible en el código
fuente de un repo público de GitHub) y la ausencia de políticas RLS en
Supabase siguen siendo el riesgo más grande tal como está la aplicación hoy.

