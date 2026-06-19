-- Aislamiento multi-tenant vía Row-Level Security.
-- Prisma no expresa RLS; esta migración la añade a mano sobre las tablas
-- creadas por la migración initial.
--
-- Hecha idempotente con DO blocks para no romper si:
--   - Los roles ya existen (otra DB del cluster los creó, intento previo).
--   - Una ejecución anterior se quedó a mitad.

-- Roles
--   postgres  : superuser (usado por DATABASE_URL para migraciones)
--   app_admin : BYPASSRLS (usado por seed y operaciones de admin)
--   app       : RLS aplicada (usado por el API en runtime)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app, app_admin;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO app, app_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO app, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO app, app_admin;

-- Habilitar y forzar RLS. FORCE evita que el owner escape RLS.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "Store"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "Product"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product"      FORCE  ROW LEVEL SECURITY;

-- Política única por tabla. Si app.current_organization_id no está set,
-- current_setting(..., true) devuelve NULL → filtra a 0 filas (fail-safe).
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Store";
CREATE POLICY tenant_isolation ON "Store"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Product";
CREATE POLICY tenant_isolation ON "Product"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- UserStore se filtra por join a User; sin política directa hasta que un
-- caso real lo exija.
