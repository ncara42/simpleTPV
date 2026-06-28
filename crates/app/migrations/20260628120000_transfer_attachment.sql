-- Adjuntos de traspaso (#-): fotos de la recepción (incidencias, prueba de estado).
-- La imagen viaja y se guarda como data-URL base64 en TEXT (mismo enfoque que el
-- logo de marca en Organization.logoUrl); el frontend comprime antes de subir.
-- Asociable a una línea concreta (producto con incidencia) o al traspaso entero.

-- CreateTable
CREATE TABLE "TransferAttachment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "transferLineId" UUID,
    "mimeType" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "caption" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferAttachment_transferId_idx" ON "TransferAttachment"("transferId");

-- AddForeignKey
ALTER TABLE "TransferAttachment" ADD CONSTRAINT "TransferAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAttachment" ADD CONSTRAINT "TransferAttachment_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAttachment" ADD CONSTRAINT "TransferAttachment_transferLineId_fkey" FOREIGN KEY ("transferLineId") REFERENCES "TransferLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS por tenant (mismo patrón que Transfer/TransferLine). Sin contexto de tenant
-- → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "TransferAttachment" TO app, app_admin;
ALTER TABLE "TransferAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransferAttachment" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TransferAttachment";
CREATE POLICY tenant_isolation ON "TransferAttachment"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
