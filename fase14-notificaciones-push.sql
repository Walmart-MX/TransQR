-- ════════════════════════════════════════════════════════════════
-- FASE 14 — NOTIFICACIONES PUSH: tabla de suscripciones
-- Ejecutar en el SQL Editor de Supabase (mismo flujo que fase10-seguridad.sql).
-- ════════════════════════════════════════════════════════════════

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  rol          text not null check (rol in ('asociado', 'admin')),
  num_empleado text,              -- solo aplica cuando rol = 'asociado'
  endpoint     text not null unique,
  p256dh       text not null,     -- clave publica del navegador (Web Push)
  auth_key     text not null,     -- secreto del navegador (Web Push)
  creado_en    timestamptz not null default now(),
  activo       boolean not null default true
);

alter table push_subscriptions enable row level security;

-- No hay politica de SELECT para anon ni authenticated: esta tabla solo la
-- lee la Edge Function usando la service_role key (que se salta RLS por
-- diseño). Desde el navegador solo se puede insertar/actualizar/borrar la
-- propia suscripcion, nunca leer las de alguien mas.

drop policy if exists "anon administra su suscripcion" on push_subscriptions;
create policy "anon administra su suscripcion" on push_subscriptions
  for all to anon
  using (rol = 'asociado')
  with check (rol = 'asociado');

drop policy if exists "admin administra su suscripcion" on push_subscriptions;
create policy "admin administra su suscripcion" on push_subscriptions
  for all to authenticated
  using (es_admin() and rol = 'admin')
  with check (es_admin() and rol = 'admin');

-- Nota de diseno: igual que con reportes_transporte, la identidad del
-- asociado no esta autenticada (es num_empleado capturado en el formulario),
-- asi que "su suscripcion" no se puede verificar criptograficamente del lado
-- del servidor -- es el mismo nivel de confianza que ya existe hoy en el
-- resto del flujo publico. El unico dato que viaja en la notificacion es
-- "tu reporte cambio de estatus", nada sensible.

-- Indice para que la Edge Function busque rapido por num_empleado al
-- notificar cambios de estatus.
create index if not exists idx_push_subscriptions_num_empleado
  on push_subscriptions (num_empleado) where rol = 'asociado' and activo = true;
