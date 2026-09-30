# Fase 13 -- Las 4 ideas pendientes del cierre de la Fase 12

Complementa a `ARQUITECTURA.md` y `CAMBIOS-FASE12.md` (no los reemplaza).
Implementa las cuatro "ideas adicionales" que quedaron anotadas al final de
la Fase 12, todas del lado de `/admin/`. **No se tocó `app/index.html`,
`404.html` ni `index.html` (raíz)** -- ninguna de estas funciones es visible
ni necesaria para el asociado, mismo criterio que se ha seguido en todas las
fases anteriores. Tampoco se tocó el esquema de Supabase: las cuatro se
construyen con columnas que ya existían (`estatus`, `seguimiento_actualizado_en`,
`fecha`, `hora`, `num_empleado`, `tipo_reporte`, `unidad`, `situaciones`).

## 1) Alertas de antigüedad (Historial)

Un reporte con estatus "Enviado" o "En revisión" que lleva mucho tiempo sin
que nadie toque su seguimiento ahora se marca visualmente en cada tarjeta de
la Lista de Historial, sin necesidad de aplicar el filtro de estatus:

- **48 horas o más** -> borde/fondo ámbar + badge "Sin actualizar: mas de 48h (Xh)".
- **72 horas o más** -> borde/fondo rojo + badge "Sin actualizar: mas de 72h (Xh)".

El "reloj" usa `seguimiento_actualizado_en` si el reporte ya tuvo algún
seguimiento guardado; si nunca se ha tocado, usa `fecha` + `hora` de cuando
se recibió. Los umbrales son dos constantes al inicio del script
(`ALERTA_ANTIGUEDAD_ADVERTENCIA_HORAS`, `ALERTA_ANTIGUEDAD_CRITICA_HORAS`) --
cambiarlos es editar dos números, no tocar lógica.

**No se agregó ninguna consulta nueva a Supabase**: el cálculo se hace en el
navegador sobre los mismos datos que la Lista ya trae (`select('*')`).

## 2) Tendencia por LT Transportista

La pestaña Historial -> Tendencia semanal tenía filtro de nave, situación y
tipo de reporte, pero no de LT. Se agregó un selector "LT Transportista"
arriba de la gráfica (opciones pobladas desde la tabla `transportistas`,
solo las activas). Al elegir una LT, la gráfica de 8 semanas queda acotada a
esa sola línea -- así se puede ver mes a mes si una LT mejora o empeora, algo
que hoy solo existía como comparativo puntual en la pestaña Nivel de
Servicio (que mira un periodo, no una evolución semana a semana).

Seleccionar "Todas las LT" regresa al comportamiento de siempre (global).

## 3) Resumen imprimible / PDF de la sesión mensual

Nuevo botón en Nivel de Servicio: **"Resumen imprimible / PDF de la sesión"**,
junto al de exportar CSV. Al presionarlo:

1. Vuelve a consultar Supabase con el mismo periodo y nave que ya están
   elegidos en la pestaña (no duplica lo que el usuario ya configuró).
2. Abre una ventana nueva con una página lista para imprimir: encabezado con
   CEDIS/nave/periodo/fecha de generación, la tabla comparativa por LT (la
   misma que ya se ve en pantalla), y debajo, por cada LT, hasta 3 de sus
   reportes "más graves" del periodo.
3. La ventana trae su propio botón "Imprimir / Guardar como PDF"
   (`window.print()`); desde el diálogo de impresión del navegador se elige
   "Guardar como PDF" si no se quiere imprimir en papel.

**Qué significa "más grave" aquí (decisión explícita, documentada porque no
existe un campo de severidad en la base de datos):** se usa un orden fijo de
situaciones (`SEVERIDAD_SITUACION`: Accidente > Mecánico > Velocidad > Trato
> Retraso > Clima > Limpieza > Otro) y se le da prioridad a cualquier
reporte que **todavía no esté "Resuelto"** sobre los ya cerrados, sin importar
su situación. Es un criterio razonable para una reunión mensual (lo urgente
primero), pero es una aproximación, no una calificación oficial de
severidad -- si más adelante se agrega un campo real de prioridad/severidad
en el formulario del asociado, este orden se reemplaza fácil por ese campo.

**Requiere permitir ventanas emergentes** en el navegador del admin; si el
navegador la bloquea, se muestra una alerta explicándolo en vez de fallar en
silencio.

## 4) Reportes recurrentes por asociado

Si el mismo número de empleado reportó el mismo `tipo_reporte` **3 veces o
más en los últimos 90 días**, cada una de esas tarjetas en el Historial
ahora muestra un aviso: "RECURRENTE: [nombre] (No. [empleado]) ha reportado
'[tipo]' N veces en los últimos 90 días -- revisa si es una ruta/parada
puntual, no solo la LT." Esto es justo la idea original: muchos reportes del
mismo tipo por la misma persona pueden apuntar a un problema de una
ruta/parada específica, no necesariamente de la línea de transporte en
general.

El umbral (3) y la ventana de días (90) son dos constantes
(`RECURRENCIA_UMBRAL`, `RECURRENCIA_DIAS_VENTANA`) fáciles de ajustar.

**Costo de esta función:** una consulta adicional y ligera (solo
`num_empleado, tipo_reporte` de los últimos 90 días, sin traer el resto de
las columnas) cada vez que se renderiza la Lista de Historial, en paralelo
con la consulta normal (`Promise.all`) para no duplicar el tiempo de espera.

## Lo que NO se hizo (a propósito, por si se quiere después)

- No se agregó un quinto indicador (KPI) arriba de Historial contando
  reportes "atrasados" -- la cuadrícula de indicadores actual es de 2
  columnas fijas y ya tiene 4 tarjetas; se prefirió no forzar una quinta
  fuera de lugar visualmente sin pedirlo explícitamente. La marca roja/ámbar
  en cada tarjeta ya resuelve el objetivo de "saltar a la vista sin
  filtrar". Si se quiere ese contador aparte, es un cambio pequeño y
  aislado.
- La "gravedad" del resumen imprimible es una heurística basada en
  `situaciones` + estatus abierto/cerrado, no una tabla de severidad real en
  Supabase -- ver nota en el punto 3.
