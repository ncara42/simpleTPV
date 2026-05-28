-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "CashSession" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "openingAmount" DECIMAL(12,2) NOT NULL,
    "closingAmount" DECIMAL(12,2),
    "expectedAmount" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashSession_organizationId_storeId_status_idx" ON "CashSession"("organizationId", "storeId", "status");

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para CashSession (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "CashSession" TO app, app_admin;

ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashSession" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "CashSession";
CREATE POLICY tenant_isolation ON "CashSession"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
