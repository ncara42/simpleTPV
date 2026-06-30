-- VERI*FACTU transporte AEAT (#156): estado de remisión en el registro, configuración
-- por comercio, certificados de cliente (modo directo) y traza append-only de envíos.
-- Complementa la huella/registro encadenado ya existentes (#155). Sin tocar la cadena
-- de huellas: el envío es un efecto posterior reintentable.
--
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS): seguro de reaplicar.

-- 1) Estado de remisión a la AEAT en el propio registro.
ALTER TABLE "VerifactuRecord"
  ADD COLUMN IF NOT EXISTS "csv"           TEXT,           -- justificante (CSV) devuelto por la AEAT al aceptar
  ADD COLUMN IF NOT EXISTS "aeatState"     TEXT,           -- EstadoRegistro: Correcto|AceptadoConErrores|Incorrecto
  ADD COLUMN IF NOT EXISTS "errorCode"     TEXT,           -- CodigoErrorRegistro de la AEAT (si lo hay)
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3),   -- control de flujo/backoff: no reenviar antes de esta marca
  ADD COLUMN IF NOT EXISTS "subsanacion"   BOOLEAN NOT NULL DEFAULT false,  -- RegistroAlta de subsanación (Subsanacion=S)
  ADD COLUMN IF NOT EXISTS "rechazoPrevio" BOOLEAN NOT NULL DEFAULT false;  -- RechazoPrevio=S (el registro previo fue rechazado)

-- Índice para el worker: PENDING ya vencidos (nextAttemptAt nulo o pasado), por antigüedad.
CREATE INDEX IF NOT EXISTS "VerifactuRecord_pending_due_idx"
  ON "VerifactuRecord" ("status", "nextAttemptAt", "createdAt");

-- 2) Configuración VERI*FACTU por comercio (1:1 con Organization).
CREATE TABLE IF NOT EXISTS "VerifactuConfig" (
  "organizationId" UUID PRIMARY KEY,
  "mode"          TEXT NOT NULL DEFAULT 'DISABLED',  -- DISABLED|ASSISTED|DIRECT_OWN_CERT|COLLAB_SOCIAL
  "razonSocial"   TEXT,                              -- NombreRazon del obligado (Cabecera del envío)
  "obligadoTipo"  TEXT,                              -- IS|OTHERS (solo para avisos de plazo 2027)
  "exento"        BOOLEAN NOT NULL DEFAULT false,    -- fuera de ámbito (SII / foral / facturación manual)
  "exentoMotivo"  TEXT,
  "environment"   TEXT NOT NULL DEFAULT 'preprod',   -- preprod|prod (selección de endpoint AEAT)
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerifactuConfig_org_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
GRANT ALL ON "VerifactuConfig" TO app, app_admin;
ALTER TABLE "VerifactuConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerifactuConfig" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VerifactuConfig";
CREATE POLICY tenant_isolation ON "VerifactuConfig"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- 3) Certificado de cliente (solo modo DIRECT_OWN_CERT). El PKCS#12 viaja CIFRADO
--    (AES-256-GCM): nonce(12 bytes) || ciphertext. La clave de cifrado vive FUERA de
--    la BD (variable de entorno / gestor de secretos), nunca en claro ni en el repo.
CREATE TABLE IF NOT EXISTS "VerifactuCertificate" (
  "id"             UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "encBlob"        BYTEA NOT NULL,   -- PKCS#12 cifrado (nunca en claro)
  "subject"        TEXT,
  "validFrom"      TIMESTAMP(3),
  "validTo"        TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerifactuCertificate_org_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VerifactuCertificate_org_validTo_idx" ON "VerifactuCertificate" ("organizationId", "validTo");
GRANT ALL ON "VerifactuCertificate" TO app, app_admin;
ALTER TABLE "VerifactuCertificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerifactuCertificate" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VerifactuCertificate";
CREATE POLICY tenant_isolation ON "VerifactuCertificate"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- 4) Traza APPEND-ONLY de cada envío a la AEAT (prueba de remisión + diagnóstico).
--    Una fila por intento; nunca se actualiza ni borra (salvo cascada por borrado del
--    registro/organización). El CSV de aceptación es el justificante legal.
CREATE TABLE IF NOT EXISTS "VerifactuSubmission" (
  "id"             UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "recordId"       UUID NOT NULL,
  "attemptedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endpoint"       TEXT,
  "httpStatus"     INTEGER,
  "estadoEnvio"    TEXT,             -- Correcto|ParcialmenteCorrecto|Incorrecto
  "estadoRegistro" TEXT,             -- Correcto|AceptadoConErrores|Incorrecto
  "csv"            TEXT,
  "errorCode"      TEXT,
  "errorDesc"      TEXT,
  CONSTRAINT "VerifactuSubmission_org_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VerifactuSubmission_record_fkey" FOREIGN KEY ("recordId")
    REFERENCES "VerifactuRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VerifactuSubmission_record_idx" ON "VerifactuSubmission" ("recordId", "attemptedAt");
GRANT ALL ON "VerifactuSubmission" TO app, app_admin;
ALTER TABLE "VerifactuSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerifactuSubmission" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VerifactuSubmission";
CREATE POLICY tenant_isolation ON "VerifactuSubmission"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
