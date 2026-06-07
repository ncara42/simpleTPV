-- Idempotencia de ventas offline (offline slice 2): UUID de cliente por venta.
-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "clientId" UUID;

-- CreateIndex (NULL múltiples permitidos → ventas online sin clientId no chocan)
CREATE UNIQUE INDEX "Sale_organizationId_clientId_key" ON "Sale"("organizationId", "clientId");
