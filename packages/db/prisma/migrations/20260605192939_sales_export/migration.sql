-- IT-05: export asíncrono del historial de ventas a CSV. Tabla SalesExport que
-- guarda el estado del job (PENDING→PROCESSING→COMPLETED/FAILED), los filtros con
-- los que se pidió y el CSV resultante. Patrón de artefacto+estado como VerifactuRecord.
--
-- NOTA: se omiten a propósito los `ALTER COLUMN "id" DROP DEFAULT` de
-- CashMovement/OfficialDevice/TimeClockEntry que `migrate dev` propuso: son drift
-- preexistente ajeno a IT-05 y no deben colarse en este cambio.

-- CreateEnum
CREATE TYPE "SalesExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "SalesExport" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "SalesExportStatus" NOT NULL DEFAULT 'PENDING',
    "filters" JSONB NOT NULL,
    "rowCount" INTEGER,
    "csv" TEXT,
    "error" TEXT,
    "requestedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SalesExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesExport_organizationId_status_createdAt_idx" ON "SalesExport"("organizationId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "SalesExport" ADD CONSTRAINT "SalesExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para SalesExport (mismo patrón NULLIF que el resto de tablas tenant).
GRANT ALL ON "SalesExport" TO app, app_admin;
ALTER TABLE "SalesExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesExport" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SalesExport";
CREATE POLICY tenant_isolation ON "SalesExport"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
