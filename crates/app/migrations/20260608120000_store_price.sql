-- Control plane (#127 A): precio retail por tienda. Override del PVP del producto
-- (Product.salePrice) para una tienda concreta. Sin fila para (producto, tienda) →
-- se usa el PVP del producto. Solo afecta a la venta retail del TPV.

-- CreateTable: precio retail de un producto en una tienda.
CREATE TABLE "StorePrice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: un override por (producto, tienda).
CREATE UNIQUE INDEX "StorePrice_productId_storeId_key" ON "StorePrice"("productId", "storeId");

-- CreateIndex: lookup del override en la venta, por tienda.
CREATE INDEX "StorePrice_organizationId_storeId_idx" ON "StorePrice"("organizationId", "storeId");

-- AddForeignKey
ALTER TABLE "StorePrice" ADD CONSTRAINT "StorePrice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorePrice" ADD CONSTRAINT "StorePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorePrice" ADD CONSTRAINT "StorePrice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para StorePrice (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "StorePrice" TO app, app_admin;

ALTER TABLE "StorePrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorePrice" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "StorePrice";
CREATE POLICY tenant_isolation ON "StorePrice"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
