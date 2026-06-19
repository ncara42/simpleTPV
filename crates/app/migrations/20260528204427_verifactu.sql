-- CreateEnum
CREATE TYPE "VerifactuType" AS ENUM ('INVOICE', 'RECTIFICATION');

-- CreateEnum
CREATE TYPE "VerifactuStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "VerifactuRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "saleId" UUID,
    "returnId" UUID,
    "type" "VerifactuType" NOT NULL,
    "status" "VerifactuStatus" NOT NULL DEFAULT 'PENDING',
    "hash" TEXT NOT NULL,
    "previousHash" TEXT,
    "qrData" TEXT,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifactuRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerifactuRecord_organizationId_status_createdAt_idx" ON "VerifactuRecord"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VerifactuRecord_organizationId_createdAt_idx" ON "VerifactuRecord"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "VerifactuRecord" ADD CONSTRAINT "VerifactuRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para VerifactuRecord (patrón NULLIF).
-- Sin contexto de tenant → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "VerifactuRecord" TO app, app_admin;
ALTER TABLE "VerifactuRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerifactuRecord" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VerifactuRecord";
CREATE POLICY tenant_isolation ON "VerifactuRecord"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
