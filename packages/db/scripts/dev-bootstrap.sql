-- Bootstrap de los roles `app` y `app_admin` para DESARROLLO y CI.
--
-- USO:
--   En local (con docker-compose arriba):
--     docker compose exec -T postgres psql -U postgres -d simpletpv -f /scripts/dev-bootstrap.sql
--   o vía el script de package.json:
--     pnpm --filter @simpletpv/db db:bootstrap-dev
--
--   En CI (job E2E): se invoca ANTES del arranque del backend (que auto-migra).
--   Las migraciones crean los roles con NOLOGIN; aquí les damos LOGIN + password.
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

-- Crea los roles si no existen (entornos frescos sin migraciones previas, como CI).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app_dev_password';
  ELSE
    ALTER ROLE app LOGIN PASSWORD 'app_dev_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN PASSWORD 'app_admin_dev_password' BYPASSRLS;
  ELSE
    ALTER ROLE app_admin LOGIN PASSWORD 'app_admin_dev_password';
  END IF;
END $$;

-- El auto-migrate (runner propio) necesita CREATE en public para crear _sqlx_migrations.
GRANT USAGE, CREATE ON SCHEMA public TO app_admin;
