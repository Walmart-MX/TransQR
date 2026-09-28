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

## 4) Ajustes pedidos después de la primera entrega

- **QR:** se restauró el diseño ilustrado completo (ciudad, camión, bus, tren,
  logo Walmart) que se había simplificado por accidente al quitar el
  selector de CEDIS. Se agregó una franja "🥦 Perecederos · 📦 SECOS" y el
  pie dice "CEDIS Villahermosa", para que quede claro que ese mismo QR sirve
  para las dos naves (el asociado elige adentro de la app).

- **Nueva pestaña "📊 Nivel de Servicio":** antes vivía colapsada dentro de
  Historial y se recalculaba sobre el mismo rango de fechas que la lista.
  Ahora es su propia pestaña con:
  - Periodo propio (Este mes / Mes pasado / Últimos 3 meses / Personalizado)
    — pensado para abrir la pestaña el día de la sesión mensual y ya tener
    "Mes pasado" con un clic.
  - Filtro de nave (Perecederos / SECOS / Ambas).
  - Dos indicadores (total de reportes del periodo, % resueltos global) y el
    comparativo por LT debajo.
  - Exportar a CSV ese comparativo, por separado del CSV general de Historial.

- **Historial — se acabó la lista infinita:** la lista de reportes ahora se
  pagina de 15 en 15 con "Anterior / Siguiente" y un contador
  ("Mostrando 1–15 de 42"). Los filtros, el concentrado por situación y el
  CSV siguen trabajando sobre el rango completo — solo lo que se *pinta en
  pantalla* está paginado, así que no se pierde nada al exportar.

### Ideas adicionales para cuando quieras (no implementadas todavía)
- **Alertas de antigüedad:** marcar en rojo los reportes "Enviado"/"En
  revisión" con más de 48–72 horas sin actualizarse, para que salten a la
  vista en Historial sin tener que filtrar por estatus.
- **Tendencia por LT:** hoy la Tendencia semanal es global; podría filtrarse
  también por LT Transportista para ver si una línea mejora o empeora mes a
  mes — natural complemento de la nueva pestaña de Nivel de Servicio.
- **Resumen imprimible/PDF de la sesión mensual:** un botón en "Nivel de
  Servicio" que arme una vista lista para imprimir/PDF con el periodo, el
  comparativo y los reportes más graves de cada LT, para llevar a la reunión
  sin tener que armar el CSV a mano.
- **Reportes recurrentes por asociado:** si un mismo número de empleado
  reporta muchas veces el mismo tipo de incidente, marcarlo (podría indicar
  un problema puntual de una ruta/parada, no solo del transportista).
