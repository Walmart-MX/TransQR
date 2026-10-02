-- ════════════════════════════════════════════════════════════════
-- FASE 14b -- Database Webhook via SQL (alternativa a crearlo a mano en
-- el Dashboard -> Database -> Webhooks). Ya se corrio una vez contra el
-- proyecto real (ver CAMBIOS-FASE14.md); este archivo queda como registro
-- reproducible, con el secreto reemplazado por un placeholder -- NUNCA
-- pegues aqui el valor real antes de hacer commit.
-- ════════════════════════════════════════════════════════════════

-- 1) pg_net: permite que Postgres haga peticiones HTTP salientes de forma
--    asincrona. No viene instalado por defecto en todos los proyectos.
create extension if not exists pg_net schema extensions;

-- 2) El esquema/funcion que el Dashboard crea automaticamente la primera
--    vez que usas su boton de Webhooks. Aqui se crea a mano porque este
--    proyecto nunca habia usado esa funcion del Dashboard.
create schema if not exists supabase_functions;

create or replace function supabase_functions.http_request()
returns trigger
language plpgsql
as $$
declare
  request_id bigint;
  payload jsonb;
  v_url text := TG_ARGV[0];
  v_method text := TG_ARGV[1];
  v_headers jsonb := TG_ARGV[2]::jsonb;
  v_params jsonb := TG_ARGV[3]::jsonb;
  v_timeout integer := TG_ARGV[4]::integer;
begin
  payload := jsonb_build_object(
    'old_record', OLD,
    'record', NEW,
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  if v_method = 'POST' then
    select net.http_post(v_url, payload, v_params, v_headers, v_timeout) into request_id;
  elsif v_method = 'GET' then
    select net.http_get(v_url, v_params, v_headers, v_timeout) into request_id;
  else
    raise exception 'metodo % no soportado', v_method;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- 3) Los triggers que de verdad disparan la Edge Function. Reemplaza
--    REEMPLAZA-CON-TU-WEBHOOK-SECRET por el valor real de tu secreto
--    (`supabase secrets set WEBHOOK_SECRET=...`) antes de correr esto --
--    y no lo dejes pegado aqui si vas a hacer commit del archivo editado.
drop trigger if exists "reportes_transporte_webhook_insert" on "public"."reportes_transporte";
create trigger "reportes_transporte_webhook_insert"
  after insert on "public"."reportes_transporte"
  for each row execute function "supabase_functions"."http_request"(
    'https://dxixxpyfpenubyefztvz.supabase.co/functions/v1/notificar-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"REEMPLAZA-CON-TU-WEBHOOK-SECRET"}',
    '{}',
    '5000'
  );

drop trigger if exists "reportes_transporte_webhook_update" on "public"."reportes_transporte";
create trigger "reportes_transporte_webhook_update"
  after update on "public"."reportes_transporte"
  for each row execute function "supabase_functions"."http_request"(
    'https://dxixxpyfpenubyefztvz.supabase.co/functions/v1/notificar-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"REEMPLAZA-CON-TU-WEBHOOK-SECRET"}',
    '{}',
    '5000'
  );

-- 4) Para revisar si los disparos estan respondiendo bien despues de
--    correr esto (pg_net es asincrono, espera 2-3 segundos tras un
--    insert/update de prueba antes de consultar):
--    select id, status_code, content, created from net._http_response
--    order by id desc limit 5;
