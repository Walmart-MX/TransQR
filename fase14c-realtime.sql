-- ════════════════════════════════════════════════════════════════
-- FASE 14c -- Tiempo real para el admin (Supabase Realtime)
-- ════════════════════════════════════════════════════════════════
--
-- Por defecto ninguna tabla transmite cambios via Realtime; hay que
-- agregarla a la publicacion `supabase_realtime` explicitamente. Ya se
-- corrio esto contra el proyecto real (ver CAMBIOS-FASE14.md), se deja
-- aqui para que quede documentado y reproducible.
--
-- Nota de seguridad: Realtime respeta RLS. Como el asociado (rol anon) NO
-- tiene politica de SELECT sobre reportes_transporte (a proposito, para
-- que no pueda ver reportes de otros), esta tabla transmite cambios SOLO
-- a clientes autenticados que pasen `es_admin()` -- el admin logueado. El
-- lado del asociado (app/index.html) usa polling + refresco al volver a
-- la pestana en vez de Realtime, por esa misma razon.

alter publication supabase_realtime add table reportes_transporte;
