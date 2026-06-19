-- #99: promociones de descuento programables (org-wide). Regla condición → descuento
-- con vigencia (startDate/endDate) y activación manual. El estado efectivo
-- (activa/programada/expirada/pausada) se deriva en el cliente. RLS por tenant, mismo
-- patrón que el resto de tablas (sin contexto → 0 filas, fail-safe).

-- CreateEnum
CREATE TYPE "PromoConditionType" AS ENUM ('min_qty', 'min_ticket');
CREATE TYPE "PromoDiscountType" AS ENUM ('percent', 'amount');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "conditionType" "PromoConditionType" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValue" DECIMAL(10,4) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: nombre único por organización.
CREATE UNIQUE INDEX "Promotion_organizationId_name_key" ON "Promotion"("organizationId", "name");

-- CreateIndex: listado por organización.
CREATE INDEX "Promotion_organizationId_idx" ON "Promotion"("organizationId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para Promotion (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "Promotion" TO app, app_admin;

ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Promotion" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "Promotion";
CREATE POLICY tenant_isolation ON "Promotion"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
