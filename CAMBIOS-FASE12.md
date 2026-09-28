# Fase 12 — Reversión de multi-CEDIS + cierre de sesión por inactividad

Complementa a `ARQUITECTURA.md` (no lo reemplaza). Resume lo que cambió y,
sobre todo, lo que **no** se tocó.

## 1) La app vuelve a ser de un solo CEDIS (Villahermosa, Perecederos + SECOS)

Se quitó toda la plumbing que existía para poder agregar otros CEDIS más
adelante (Fases 3–5 y parte de la 7):

- **`app/index.html`, `404.html`, `index.html` (raíz):** ya no hay
  resolución de CEDIS por URL (`/cedis/{slug}/`) ni la pantalla "CEDIS no
  encontrado". `CONFIG_CEDIS` ahora es una constante fija con Villahermosa
  y sus dos naves — no se consulta ninguna tabla `cedis` con múltiples
  filas. Los tres archivos quedaron idénticos otra vez (mismo patrón que
  ya usaban `app/index.html` y `404.html`).
- **`admin/index.html`:** se quitó el selector de CEDIS del panel de QR, del
  alta de asociados, del filtro de Historial y del panel de Rutas y
  Paradas. En su lugar hay una constante `CEDIS_SLUG = 'villahermosa'`. Lo
  que antes era "elige tu CEDIS y luego tu almacén" ahora es solo "elige tu
  nave" (Perecederos / SECOS), que es justo lo que pediste.
- El QR ahora apunta siempre a `.../app/` (ya no a `.../cedis/villahermosa/`).
  Si ya repartiste QR o imprimiste letreros con la URL vieja
  `/cedis/villahermosa/`, **siguen funcionando**: como `404.html` es idéntico
  a `app/index.html`, GitHub Pages lo sirve igual y la app carga normal — solo
  que ya no lee el slug de la URL, porque no lo necesita.

## 2) Lo que NO se tocó (a propósito)

Siguiendo la misma regla de siempre — no tocar esquema/base de datos sin
explicarlo primero —, **no se modificó nada en Supabase**:

- Las columnas `cedis_slug` siguen existiendo en `reportes_transporte`,
  `asociados`, `rutas` y `almacenes`. Simplemente ahora el código de la app
  y del admin *siempre* manda/filtra `'villahermosa'` — nunca lo deja
  elegir. No hay riesgo para los datos ya guardados.
- La tabla `cedis` (con la fila `villahermosa`) puede quedarse tal cual;
  ya no se consulta desde el frontend, pero borrarla o no es indistinto
  para que la app funcione.
- Las políticas RLS de la Fase 10 (`fase10-seguridad.sql`) no cambian: no
  dependían de que hubiera más de un CEDIS.

Si más adelante quieres limpiar esas columnas/tabla porque ya nunca se van
a usar, es un cambio de esquema aparte que te lo planteo primero — no lo
hice aquí porque no lo pediste y toca base de datos en producción.

## 3) Cierre de sesión del panel admin por inactividad (30 minutos)

Antes, la sesión de Supabase Auth se guardaba en el navegador y el panel
quedaba abierto indefinidamente entre visitas (mientras el token no
expirara). Ahora, además:

- Se vigila la actividad real en la pantalla (mouse, toques, teclado,
  scroll). Sin ninguna de esas señales durante **30 minutos**, la sesión se
  cierra sola (`cerrarSesionAdmin()` + `supabase.auth.signOut()`) y aparece
  un aviso ("Sesión cerrada por inactividad") seguido de la pantalla de
  login normal.
- Cualquier actividad reinicia el conteo — no es un cierre a las 30 minutos
  exactos desde que se inició sesión, sino 30 minutos *sin tocar nada*.
- Esto es control del lado del navegador, pensado para que el panel no
  quede abierto en un equipo compartido. No cambia ni acorta la duración
  real del token de Supabase Auth (eso se sigue rigiendo por la
  configuración de tu proyecto de Supabase); si además quieres que el
  *token* expire a los 30 minutos exactos del lado del servidor, eso se
  ajusta en Supabase (Authentication → Settings → JWT expiry) y te lo
  puedo explicar aparte si te interesa.

## Archivos entregados en esta fase
- `app/index.html`, `404.html`, `index.html` (idénticos, un solo CEDIS)
- `admin/index.html` (sin selector de CEDIS + cierre por inactividad)
