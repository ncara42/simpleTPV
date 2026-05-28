-- Fix policy: current_setting('...', true) devuelve '' (string vacío) cuando
-- el setting no existe, no NULL. Casting '' a uuid lanza error 22P02. Usamos
-- NULLIF para convertir '' a NULL antes del cast → la comparación con NULL
-- devuelve FALSE y filtra a 0 filas (fail-safe correcto).

DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Store";
CREATE POLICY tenant_isolation ON "Store"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Product";
CREATE POLICY tenant_isolation ON "Product"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
