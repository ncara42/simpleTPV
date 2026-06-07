-- Trazabilidad por lote/caducidad (#126): lote opt-in por producto, lote afectado
-- por movimiento (trazabilidad lote → ticket) y tabla de lotes con FEFO.

-- AlterTable: lote opt-in por producto.
ALTER TABLE "Product" ADD COLUMN "tracksBatch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: lote afectado por el movimiento (nullable: productos sin lote / faltante FEFO).
ALTER TABLE "StockMovement" ADD COLUMN "batchId" UUID;

-- CreateTable: lote de stock (producto, tienda, nº de lote, caducidad → cantidad).
CREATE TABLE "StockBatch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "lotCode" TEXT NOT NULL,
    "expiryDate" DATE,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: un lote por (producto, tienda, nº de lote) → la recepción del mismo lote suma.
CREATE UNIQUE INDEX "StockBatch_productId_storeId_lotCode_key" ON "StockBatch"("productId", "storeId", "lotCode");

-- CreateIndex: FEFO (consumo por caducidad ascendente) y barrido de próximos a caducar.
CREATE INDEX "StockBatch_organizationId_storeId_expiryDate_idx" ON "StockBatch"("organizationId", "storeId", "expiryDate");

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: el movimiento referencia su lote (SET NULL si el lote se borrara;
-- en la práctica los lotes no se borran, se consumen a 0 y quedan para auditoría).
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS para StockBatch (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "StockBatch" TO app, app_admin;

ALTER TABLE "StockBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockBatch" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "StockBatch";
CREATE POLICY tenant_isolation ON "StockBatch"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
