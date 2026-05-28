-- Bootstrap de los roles `app` y `app_admin` para DESARROLLO y CI.
--
-- USO:
--   En local (con docker-compose arriba):
--     docker compose exec -T postgres psql -U postgres -d simpletpv -f /scripts/dev-bootstrap.sql
--   o vía el script de package.json:
--     pnpm --filter @simpletpv/db db:bootstrap-dev
--
--   En CI (job E2E): se invoca tras `prisma migrate deploy` y antes del seed.
--
-- NUNCA EJECUTAR EN PRODUCCIÓN:
--   En prod, el operador ejecuta UNA VEZ manualmente (o desde script de despliegue
--   inicial que lee los secrets de Dokploy):
--
--     ALTER ROLE app       LOGIN PASSWORD '<secret-app-de-dokploy>';
--     ALTER ROLE app_admin LOGIN PASSWORD '<secret-app-admin-de-dokploy>';
--
--   Los passwords de dev aquí son públicos intencionadamente (viven en el repo)
--   — solo dan acceso a Postgres en localhost.
--   - `app`       : RLS aplicada (requiere SET app.current_organization_id). Runtime del API.
--   - `app_admin` : BYPASSRLS. Lo usa SOLO el lookup de login del AuthService
--                   (buscar usuario por email antes de conocer su tenant) y el seed.

ALTER ROLE app       LOGIN PASSWORD 'app_dev_password';
ALTER ROLE app_admin LOGIN PASSWORD 'app_admin_dev_password';
