-- Chat de traspaso (#-): hilo de mensajes entre la tienda que recibe ('store', el
-- dependiente) y central ('central', backoffice). Cada mensaje lleva texto y/o una
-- foto (data-URL base64 en TEXT, mismo enfoque que el logo de marca / adjuntos).
-- Sustituye a la galería de adjuntos en el detalle: las fotos viajan como mensajes.

-- CreateTable
CREATE TABLE "TransferMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT,
    "dataUrl" TEXT,
    "mimeType" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferMessage_transferId_createdAt_idx" ON "TransferMessage"("transferId", "createdAt");

-- AddForeignKey
ALTER TABLE "TransferMessage" ADD CONSTRAINT "TransferMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMessage" ADD CONSTRAINT "TransferMessage_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS por tenant (mismo patrón que Transfer/TransferLine/TransferAttachment).
GRANT ALL ON "TransferMessage" TO app, app_admin;
ALTER TABLE "TransferMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransferMessage" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TransferMessage";
CREATE POLICY tenant_isolation ON "TransferMessage"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
