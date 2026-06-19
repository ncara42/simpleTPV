-- AlterTable
-- `Store.code` es NOT NULL sin default y puede haber filas existentes (seed),
-- así que NO se puede añadir directamente como NOT NULL. Patrón en tres pasos:
-- 1) añadir nullable, 2) backfill por organización ("01", "02", ...), 3) SET NOT NULL.
ALTER TABLE "Store" ADD COLUMN "code" TEXT;
ALTER TABLE "Store" ADD COLUMN "ticketCounter" INTEGER NOT NULL DEFAULT 0;

-- Backfill: numera las tiendas por organización, "01", "02", ... según createdAt.
WITH numbered AS (
  SELECT id, LPAD((ROW_NUMBER() OVER (
    PARTITION BY "organizationId" ORDER BY "createdAt", id
  ))::text, 2, '0') AS code
  FROM "Store"
)
UPDATE "Store" s SET "code" = n.code FROM numbered n WHERE s.id = n.id;

ALTER TABLE "Store" ALTER COLUMN "code" SET NOT NULL;

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,4) NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_organizationId_storeId_createdAt_idx" ON "Sale"("organizationId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_organizationId_ticketNumber_key" ON "Sale"("organizationId", "ticketNumber");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_organizationId_code_key" ON "Store"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para Sale (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "Sale" TO app, app_admin;

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "Sale";
CREATE POLICY tenant_isolation ON "Sale"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- RLS para SaleLine (mismo patrón directo que el resto de tablas: organizationId + policy).
-- Sin contexto de tenant → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "SaleLine" TO app, app_admin;
ALTER TABLE "SaleLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleLine" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SaleLine";
CREATE POLICY tenant_isolation ON "SaleLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
