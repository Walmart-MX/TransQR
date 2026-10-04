// supabase/functions/notificar-push/index.ts
//
// Edge Function que Supabase llama automaticamente via un Database Webhook
// cuando hay un INSERT o UPDATE en `reportes_transporte`. Ver
// CAMBIOS-FASE14.md para los pasos de despliegue (generar VAPID keys,
// `supabase secrets set`, `supabase functions deploy`, crear el webhook).
//
// No se puede mandar Web Push directo desde el navegador: se necesita una
// llave privada (VAPID) que jamas debe viajar al cliente, por eso esto vive
// en una Edge Function y no en app/index.html ni admin/index.html.
//
// La respuesta HTTP de esta funcion queda registrada en
// `net._http_response.content` (la tabla de pg_net) -- por eso aqui se
// devuelve siempre un JSON con el detalle de que paso, en vez de un simple
// "OK": es la forma mas facil de diagnosticar sin acceso directo a los
// logs de la funcion.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:transporte@example.com';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function resumenSituacion(record: Record<string, unknown>): string {
  const tipo = (record.tipo_reporte as string) || 'Reporte';
  const desc = ((record.descripcion as string) || '').slice(0, 80);
  return desc ? `${tipo}: ${desc}` : tipo;
}

type Suscripcion = { id: string; endpoint: string; p256dh: string; auth_key: string };
type ResultadoEnvio = { endpoint: string; ok: boolean; detalle: string };

// urgency 'high' + TTL corto: evita que Android/FCM retenga el push bajo
// Doze/App Standby hasta que el telefono "despierte" (que normalmente pasa
// justo cuando el usuario abre la app -- el sintoma que motivo este cambio).
// TTL de 1 hora: si el dispositivo esta offline mas tiempo que eso, FCM
// descarta el mensaje en vez de entregar algo ya viejo.
const OPCIONES_ENVIO = { TTL: 3600, urgency: 'high' as const };

async function enviarATodas(subs: Suscripcion[], payload: unknown): Promise<ResultadoEnvio[]> {
  return Promise.all(subs.map(async (s): Promise<ResultadoEnvio> => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify(payload),
        OPCIONES_ENVIO
      );
      return { endpoint: s.endpoint, ok: true, detalle: 'enviado' };
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      const mensaje = (err as { message?: string }).message ?? String(err);
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').update({ activo: false }).eq('id', s.id);
        return { endpoint: s.endpoint, ok: false, detalle: `suscripcion invalida (${statusCode}), desactivada` };
      }
      return { endpoint: s.endpoint, ok: false, detalle: `error ${statusCode ?? ''}: ${mensaje}` };
    }
  }));
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, motivo: 'secreto invalido' }), { status: 401 });
  }

  let body: { type: string; table: string; record: Record<string, unknown>; old_record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, motivo: 'body no es JSON valido', error: String(e) }), { status: 400 });
  }

  const { type, table, record, old_record } = body;

  if (table !== 'reportes_transporte') {
    return new Response(JSON.stringify({ ok: true, motivo: 'tabla no manejada, se ignora', table }), { status: 200 });
  }

  const diagnostico: Record<string, unknown> = { ok: true, type, table };

  if (type === 'INSERT') {
    const { data: subsAdmin, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('rol', 'admin')
      .eq('activo', true);

    diagnostico.consulta_admin_error = error ? error.message : null;
    diagnostico.suscriptores_admin_encontrados = subsAdmin?.length ?? 0;

    if (error) {
      diagnostico.ok = false;
    } else if (subsAdmin?.length) {
      diagnostico.resultados = await enviarATodas(subsAdmin, {
        title: 'Nuevo reporte de transporte',
        body: resumenSituacion(record),
        url: `./?folio=${record.folio}`,
        tag: `reporte-${record.folio}`,
      });
    }
  }

  if (type === 'UPDATE' && old_record && record.estatus !== old_record.estatus && record.num_empleado) {
    const { data: subsAsociado, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('rol', 'asociado')
      .eq('num_empleado', record.num_empleado as string)
      .eq('activo', true);

    diagnostico.consulta_asociado_error = error ? error.message : null;
    diagnostico.suscriptores_asociado_encontrados = subsAsociado?.length ?? 0;

    if (error) {
      diagnostico.ok = false;
    } else if (subsAsociado?.length) {
      diagnostico.resultados_asociado = await enviarATodas(subsAsociado, {
        title: 'Tu reporte cambio de estatus',
        body: `Ahora esta: ${record.estatus}`,
        url: `./?folio=${record.folio}`,
        tag: `estatus-${record.folio}`,
      });
    }
  }

  return new Response(JSON.stringify(diagnostico), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
