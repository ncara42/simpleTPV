-- RLS-06: añade WITH CHECK a las 33 policies tenant_isolation que solo tenían
-- USING. Sin WITH CHECK, una policy filtra la LECTURA pero NO bloquea que un
-- INSERT/UPDATE escriba una fila con un "organizationId" ajeno al contexto.
-- Hoy no es explotable (todas las escrituras toman el organizationId de
-- requireTenant(), nunca de un DTO del cliente), pero es la única defensa en la
-- capa DB ante un endpoint futuro que tome el organizationId del input.
--
-- Las 4 tablas recientes (CashMovement, OfficialDevice, TimeClockEntry,
-- RefreshToken) ya nacieron con WITH CHECK y NO se tocan aquí.
--
-- Patrón: se recrea cada policy con USING + WITH CHECK usando la forma NULLIF
-- (fail-safe: sin contexto, current_setting(...) devuelve '' → NULL → la
-- comparación es FALSE → 0 filas y ningún INSERT/UPDATE pasa el check).
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.

-- Tablas raíz (Organization se filtra por su propia "id").
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Store";
CREATE POLICY tenant_isolation ON "Store"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Product";
CREATE POLICY tenant_isolation ON "Product"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "ProductFamily";
CREATE POLICY tenant_isolation ON "ProductFamily"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Ventas.
DROP POLICY IF EXISTS tenant_isolation ON "Sale";
CREATE POLICY tenant_isolation ON "Sale"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "SaleLine";
CREATE POLICY tenant_isolation ON "SaleLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Caja.
DROP POLICY IF EXISTS tenant_isolation ON "CashSession";
CREATE POLICY tenant_isolation ON "CashSession"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Devoluciones.
DROP POLICY IF EXISTS tenant_isolation ON "Return";
CREATE POLICY tenant_isolation ON "Return"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "ReturnLine";
CREATE POLICY tenant_isolation ON "ReturnLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Stock.
DROP POLICY IF EXISTS tenant_isolation ON "Stock";
CREATE POLICY tenant_isolation ON "Stock"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "StockMovement";
CREATE POLICY tenant_isolation ON "StockMovement"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "StockAlert";
CREATE POLICY tenant_isolation ON "StockAlert"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Traspasos.
DROP POLICY IF EXISTS tenant_isolation ON "Transfer";
CREATE POLICY tenant_isolation ON "Transfer"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "TransferLine";
CREATE POLICY tenant_isolation ON "TransferLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Proveedores y compras.
DROP POLICY IF EXISTS tenant_isolation ON "Supplier";
CREATE POLICY tenant_isolation ON "Supplier"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "PurchaseOrder";
CREATE POLICY tenant_isolation ON "PurchaseOrder"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "PurchaseOrderLine";
CREATE POLICY tenant_isolation ON "PurchaseOrderLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Verifactu.
DROP POLICY IF EXISTS tenant_isolation ON "VerifactuRecord";
CREATE POLICY tenant_isolation ON "VerifactuRecord"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Exportaciones de ventas.
DROP POLICY IF EXISTS tenant_isolation ON "SalesExport";
CREATE POLICY tenant_isolation ON "SalesExport"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Preferencias de usuario.
DROP POLICY IF EXISTS tenant_isolation ON "UserPreference";
CREATE POLICY tenant_isolation ON "UserPreference"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- B2B / mayorista.
DROP POLICY IF EXISTS tenant_isolation ON "Customer";
CREATE POLICY tenant_isolation ON "Customer"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "PriceList";
CREATE POLICY tenant_isolation ON "PriceList"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "PriceListItem";
CREATE POLICY tenant_isolation ON "PriceListItem"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "WholesaleOrder";
CREATE POLICY tenant_isolation ON "WholesaleOrder"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "WholesaleOrderLine";
CREATE POLICY tenant_isolation ON "WholesaleOrderLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- API keys.
DROP POLICY IF EXISTS tenant_isolation ON "ApiKey";
CREATE POLICY tenant_isolation ON "ApiKey"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Lotes FEFO.
DROP POLICY IF EXISTS tenant_isolation ON "StockBatch";
CREATE POLICY tenant_isolation ON "StockBatch"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Precios por tienda.
DROP POLICY IF EXISTS tenant_isolation ON "StorePrice";
CREATE POLICY tenant_isolation ON "StorePrice"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Feature flags.
DROP POLICY IF EXISTS tenant_isolation ON "FeatureFlag";
CREATE POLICY tenant_isolation ON "FeatureFlag"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Promociones.
DROP POLICY IF EXISTS tenant_isolation ON "Promotion";
CREATE POLICY tenant_isolation ON "Promotion"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Precios de proveedor.
DROP POLICY IF EXISTS tenant_isolation ON "SupplierPrice";
CREATE POLICY tenant_isolation ON "SupplierPrice"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
