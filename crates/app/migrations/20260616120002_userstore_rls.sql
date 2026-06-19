-- Defensa en profundidad (RLS-05): añade RLS a "UserStore", la única tabla
-- multi-tenant que quedaba sin ENABLE/FORCE ROW LEVEL SECURITY.
--
-- "UserStore" no tiene columna "organizationId" propia (es la join table
-- User <-> Store con PK compuesta). En vez de añadir la columna + backfill,
-- la política deriva el tenant vía "storeId" -> "Store"."organizationId",
-- consistente con el resto de policies (NULLIF para tratar '' como NULL).
--
-- Fail-safe: sin app.current_organization_id, el setting es '' -> NULL; el
-- subselect sobre "Store" no devuelve filas (además "Store" tiene su propia
-- RLS), así que "UserStore" filtra a 0 filas. Nunca cruza tenants porque
-- cada fila solo es visible si su "storeId" pertenece a un "Store" de la
-- organización activa.

GRANT ALL ON "UserStore" TO app, app_admin;
ALTER TABLE "UserStore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserStore" FORCE  ROW LEVEL SECURITY;

-- USING gobierna SELECT/UPDATE/DELETE; WITH CHECK gobierna INSERT/UPDATE para
-- que tampoco se pueda insertar una fila con un "storeId" de otro tenant
-- (los INSERT de app ya validan el storeId, pero esto lo blinda en la DB).
DROP POLICY IF EXISTS tenant_isolation ON "UserStore";
CREATE POLICY tenant_isolation ON "UserStore"
  USING (
    "storeId" IN (
      SELECT "id" FROM "Store"
      WHERE "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    )
  )
  WITH CHECK (
    "storeId" IN (
      SELECT "id" FROM "Store"
      WHERE "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    )
  );
