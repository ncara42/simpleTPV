-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Transfer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "originStoreId" UUID NOT NULL,
    "destStoreId" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantitySent" DECIMAL(12,3) NOT NULL,
    "quantityReceived" DECIMAL(12,3),
    "discrepancy" DECIMAL(12,3),
    "discrepancyNote" TEXT,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transfer_organizationId_status_createdAt_idx" ON "Transfer"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TransferLine_transferId_idx" ON "TransferLine"("transferId");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_originStoreId_fkey" FOREIGN KEY ("originStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destStoreId_fkey" FOREIGN KEY ("destStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para Transfer (mismo patrón que Sale/Return).
-- Sin contexto de tenant → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "Transfer" TO app, app_admin;
ALTER TABLE "Transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transfer" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Transfer";
CREATE POLICY tenant_isolation ON "Transfer"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- RLS para TransferLine (organizationId propio + policy, igual que SaleLine).
GRANT ALL ON "TransferLine" TO app, app_admin;
ALTER TABLE "TransferLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransferLine" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TransferLine";
CREATE POLICY tenant_isolation ON "TransferLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
