-- ════════════════════════════════════════════════════════════════
-- CIERRE DE LA FASE 3 — script consolidado y seguro de re-ejecutar
-- Junta lo propuesto en las Fases 3, 6, 7 y 8. Usa IF NOT EXISTS /
-- ON CONFLICT DO NOTHING donde se puede; las restricciones de llave
-- foránea (que Postgres no soporta con IF NOT EXISTS) están en
-- bloques que ignoran el error si ya existen. Puedes correrlo aunque
-- ya hayas aplicado partes sueltas antes.
-- ════════════════════════════════════════════════════════════════

-- 1) Tabla maestra de CEDIS (Fase 3)
create table if not exists cedis (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  codigo      text not null unique,
  ciudad      text not null,
  slug        text not null unique,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

insert into cedis (nombre, codigo, ciudad, slug, activo)
values ('CEDIS Walmart Villahermosa', 'VSA', 'Villahermosa', 'villahermosa', true)
on conflict (slug) do nothing;

-- 2) Almacenes dentro de un CEDIS (Fase 3 — el nivel que faltaba: Perecederos/
--    SECOS son almacenes, no CEDIS)
create table if not exists almacenes (
  id         uuid primary key default gen_random_uuid(),
  cedis_slug text not null references cedis(slug),
  nombre     text not null,
  slug       text not null,
  whatsapp   text not null,
  activo     boolean not null default true,
  unique (cedis_slug, slug)
);

insert into almacenes (cedis_slug, nombre, slug, whatsapp, activo) values
  ('villahermosa', 'Perecederos', 'perecederos', '529931365046', true),
  ('villahermosa', 'SECOS',       'secos',       '529931004567', true)
on conflict (cedis_slug, slug) do nothing;

-- 3) Directorio de asociados (Fase 6)
alter table asociados
  add column if not exists cedis_slug text not null default 'villahermosa',
  add column if not exists activo     boolean not null default true;

do $$ begin
  alter table asociados
    add constraint fk_asociados_cedis foreign key (cedis_slug) references cedis(slug);
exception when duplicate_object then null;
end $$;

-- 4) Reportes multi-CEDIS (Fase 7)
alter table reportes_transporte
  add column if not exists cedis_slug text not null default 'villahermosa';

do $$ begin
  alter table reportes_transporte
    add constraint fk_reportes_cedis foreign key (cedis_slug) references cedis(slug);
exception when duplicate_object then null;
end $$;

-- 5) Rutas y paradas (Fase 8) — con FK real a cedis desde el inicio
create table if not exists rutas (
  id           uuid primary key default gen_random_uuid(),
  cedis_slug   text not null default 'villahermosa' references cedis(slug),
  almacen_slug text not null,
  nombre       text not null,
  orden        int not null default 0,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

create table if not exists paradas (
  id       uuid primary key default gen_random_uuid(),
  ruta_id  uuid not null references rutas(id) on delete cascade,
  nombre   text not null,
  orden    int not null default 0,
  activo   boolean not null default true
);

-- 6) OPCIONAL: migra las paradas actuales del código a una "Ruta general" por
--    almacén, para no partir de cero. Preserva el comportamiento de hoy, sin
--    inventar agrupaciones geográficas reales. Bórralo de este script si
--    prefieres empezar las rutas desde cero en el panel de administración.
with r as (
  insert into rutas (cedis_slug, almacen_slug, nombre, orden)
  values ('villahermosa', 'perecederos', 'Ruta general', 0)
  on conflict do nothing
  returning id
)
insert into paradas (ruta_id, nombre, orden)
select r.id, p.nombre, p.orden
from r, (values
  ('UNIVERSIDAD',0),('JOLOCHEROS',1),('BUENA VISTA',2),('TAMULTE - LIBRAMIENTO',3),
  ('SOYATACO - NICOLÁS BRAVO',4),('GALEANA - AYAPA',5),('CAÑALES - CENTRO',6),
  ('TULIPÁN',7),('UPCH - SAM''S',8),('CUNDUACÁN',9)
) as p(nombre, orden);

with r as (
  insert into rutas (cedis_slug, almacen_slug, nombre, orden)
  values ('villahermosa', 'secos', 'Ruta general', 0)
  on conflict do nothing
  returning id
)
insert into paradas (ruta_id, nombre, orden)
select r.id, p.nombre, p.orden
from r, (values
  ('BUENAVISTA',0),('UNIVERSIDAD',1),('CUNDUACÁN',2),('JALPA - NACAJUCA',3),('SOYATACO',4),
  ('NICOLÁS BRAVO',5),('AYAPA - GALEANA',6),('SAN FERNANDO',7),('CÁRDENAS CENTRO',8),
  ('TULIPÁN',9),('CAÑALES',10)
) as p(nombre, orden);
