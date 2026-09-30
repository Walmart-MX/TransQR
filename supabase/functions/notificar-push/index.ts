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

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:transporte@example.com';
// Secreto compartido para verificar que la llamada viene del Webhook de
// Supabase y no de cualquiera que adivine la URL de la funcion.
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function resumenSituacion(record: Record<string, unknown>): string {
  const tipo = (record.tipo_reporte as string) || 'Reporte';
  const desc = ((record.descripcion as string) || '').slice(0, 80);
  return desc ? `${tipo}: ${desc}` : tipo;
}

async function enviarATodas(subs: { endpoint: string; p256dh: string; auth_key: string; id: string }[], payload: unknown) {
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify(payload)
      );
    } catch (err) {
      // 404/410 = el navegador invalido la suscripcion (usuario desinstalo,
      // limpio datos, etc.) -- se desactiva para no reintentar por siempre.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').update({ activo: false }).eq('id', s.id);
      } else {
        console.error('Error enviando push a', s.endpoint, err);
      }
    }
  }));
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('No autorizado', { status: 401 });
  }

  const body = await req.json();
  const { type, table, record, old_record } = body as {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    record: Record<string, unknown>;
    old_record?: Record<string, unknown>;
  };

  if (table !== 'reportes_transporte') {
    return new Response('Tabla no manejada, se ignora.', { status: 200 });
  }

  if (type === 'INSERT') {
    const { data: subsAdmin } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('rol', 'admin')
      .eq('activo', true);

    if (subsAdmin?.length) {
      await enviarATodas(subsAdmin, {
        title: 'Nuevo reporte de transporte',
        body: resumenSituacion(record),
        url: `./?folio=${record.folio}`,
      });
    }
  }

  if (type === 'UPDATE' && old_record && record.estatus !== old_record.estatus && record.num_empleado) {
    const { data: subsAsociado } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('rol', 'asociado')
      .eq('num_empleado', record.num_empleado as string)
      .eq('activo', true);

    if (subsAsociado?.length) {
      await enviarATodas(subsAsociado, {
        title: 'Tu reporte cambio de estatus',
        body: `Ahora esta: ${record.estatus}`,
        url: './',
      });
    }
  }

  return new Response('OK', { status: 200 });
});
