-- Tarifa de compra por proveedor y producto (P1-B / D2). Precio al que un proveedor
-- sirve un producto. Una tarifa por (proveedor, producto). Habilita la comparativa
-- de precios entre proveedores para productos del mismo arquetipo.

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: una tarifa por (proveedor, producto).
CREATE UNIQUE INDEX "SupplierPrice_supplierId_productId_key" ON "SupplierPrice"("supplierId", "productId");

-- CreateIndex: comparativa por producto dentro del tenant.
CREATE INDEX "SupplierPrice_organizationId_productId_idx" ON "SupplierPrice"("organizationId", "productId");

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS para SupplierPrice (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "SupplierPrice" TO app, app_admin;

ALTER TABLE "SupplierPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierPrice" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "SupplierPrice";
CREATE POLICY tenant_isolation ON "SupplierPrice"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
