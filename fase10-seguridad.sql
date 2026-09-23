-- ════════════════════════════════════════════════════════════════
-- FASE 10 — SEGURIDAD: RLS + autenticación real de administradores
-- ════════════════════════════════════════════════════════════════

-- 1) Tabla de administradores (allowlist contra auth.users de Supabase)
create table if not exists admins (
  user_id    uuid primary key references auth.users(id),
  creado_en  timestamptz not null default now()
);
alter table admins enable row level security;
-- Sin políticas de SELECT para nadie desde el cliente: esta tabla solo se
-- consulta DENTRO de la función es_admin() de abajo (security definer).

create or replace function es_admin()
returns boolean
language sql security definer stable as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

-- 2) Activar RLS en todas las tablas
alter table reportes_transporte enable row level security;
alter table asociados            enable row level security;
alter table cedis                enable row level security;
alter table almacenes            enable row level security;
alter table rutas                enable row level security;
alter table paradas              enable row level security;

-- 3) reportes_transporte: el asociado solo puede INSERTAR (nunca leer/editar
--    directo); el admin puede leer y actualizar (seguimiento).
drop policy if exists "anon inserta reportes" on reportes_transporte;
create policy "anon inserta reportes" on reportes_transporte
  for insert to anon with check (true);

drop policy if exists "admin lee reportes" on reportes_transporte;
create policy "admin lee reportes" on reportes_transporte
  for select to authenticated using (es_admin());

drop policy if exists "admin actualiza reportes" on reportes_transporte;
create policy "admin actualiza reportes" on reportes_transporte
  for update to authenticated using (es_admin()) with check (es_admin());

-- 4) asociados: SIN políticas para anon — todo pasa por funciones controladas
--    (ver sección 6). El admin tiene acceso completo.
drop policy if exists "admin gestiona asociados" on asociados;
create policy "admin gestiona asociados" on asociados
  for all to authenticated using (es_admin()) with check (es_admin());

-- 5) cedis / almacenes / rutas / paradas: lectura pública de lo activo
--    (la app del asociado los necesita para el formulario), escritura solo admin.
drop policy if exists "lectura publica cedis" on cedis;
create policy "lectura publica cedis" on cedis
  for select to anon using (activo = true);
drop policy if exists "admin gestiona cedis" on cedis;
create policy "admin gestiona cedis" on cedis
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "lectura publica almacenes" on almacenes;
create policy "lectura publica almacenes" on almacenes
  for select to anon using (activo = true);
drop policy if exists "admin gestiona almacenes" on almacenes;
create policy "admin gestiona almacenes" on almacenes
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "lectura publica rutas" on rutas;
create policy "lectura publica rutas" on rutas
  for select to anon using (activo = true);
drop policy if exists "admin gestiona rutas" on rutas;
create policy "admin gestiona rutas" on rutas
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "lectura publica paradas" on paradas;
create policy "lectura publica paradas" on paradas
  for select to anon using (activo = true);
drop policy if exists "admin gestiona paradas" on paradas;
create policy "admin gestiona paradas" on paradas
  for all to authenticated using (es_admin()) with check (es_admin());

-- 6) Funciones controladas para lo que el asociado sí necesita hacer sobre
--    `asociados` y `reportes_transporte`, sin abrir la tabla completa.

-- Buscar un asociado por su número (para precargar el formulario).
create or replace function f_buscar_asociado(p_numero text)
returns table(numero_asociado text, nombre text, area text, celular text, cedis_slug text, activo boolean)
language sql security definer as $$
  select numero_asociado, nombre, area, celular, cedis_slug, activo
  from asociados
  where numero_asociado = p_numero;
$$;
grant execute on function f_buscar_asociado(text) to anon;

-- Guardar el celular tras un reporte. Si el número no existía, lo crea con
-- los datos que envió; si YA existía, solo actualiza el celular — nunca
-- sobrescribe nombre/área/activo/cedis_slug de un registro ya administrado.
create or replace function f_guardar_asociado_desde_reporte(
  p_numero text, p_nombre text, p_area text, p_celular text, p_cedis_slug text
) returns void
language plpgsql security definer as $$
begin
  insert into asociados (numero_asociado, nombre, area, celular, cedis_slug, activo)
  values (p_numero, p_nombre, p_area, p_celular, p_cedis_slug, true)
  on conflict (numero_asociado) do update
    set celular = excluded.celular;
end;
$$;
grant execute on function f_guardar_asociado_desde_reporte(text,text,text,text,text) to anon;

-- Consultar el estatus/comentario de "Mis Reportes" por folio (sin abrir
-- SELECT general sobre reportes_transporte).
create or replace function f_obtener_estatus_reportes(p_folios uuid[])
returns table(folio uuid, estatus text, comentario_seguimiento text)
language sql security definer as $$
  select folio, estatus, comentario_seguimiento
  from reportes_transporte
  where folio = any(p_folios);
$$;
grant execute on function f_obtener_estatus_reportes(uuid[]) to anon;
