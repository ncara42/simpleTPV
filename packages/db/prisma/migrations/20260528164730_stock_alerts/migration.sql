-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK');

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockAlert_organizationId_resolved_createdAt_idx" ON "StockAlert"("organizationId", "resolved", "createdAt");

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una sola alerta ACTIVA (resolved=false) por par producto+tienda. Índice único
-- parcial (Prisma no lo expresa en el schema): evita duplicar alertas mientras
-- una sigue abierta; al resolverla, una nueva caída de stock puede crear otra.
CREATE UNIQUE INDEX "StockAlert_active_unique"
  ON "StockAlert"("productId", "storeId") WHERE (resolved = false);

-- RLS para StockAlert (mismo patrón que Stock/StockMovement).
-- Sin contexto de tenant → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "StockAlert" TO app, app_admin;
ALTER TABLE "StockAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockAlert" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockAlert";
CREATE POLICY tenant_isolation ON "StockAlert"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
