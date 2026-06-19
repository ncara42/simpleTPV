-- Control plane (#127 B): feature flags por tienda/organización. Activa/desactiva un
-- módulo (key del catálogo en código) en una org (storeId NULL = default de la org) o
-- en una tienda (override). Resolución en el servicio: tienda ?? org ?? default del
-- código. Sin fila → default del código (comportamiento actual, nunca "apagado").

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: un override por (org, key, tienda) y un único default por (org, key).
-- NULLS NOT DISTINCT (PG15+) trata storeId NULL como un valor único: sin él, Postgres
-- consideraría cada NULL distinto y permitiría dos defaults de org para la misma key.
CREATE UNIQUE INDEX "FeatureFlag_organizationId_key_storeId_key"
  ON "FeatureFlag"("organizationId", "key", "storeId") NULLS NOT DISTINCT;

-- CreateIndex: resolución por (org, key).
CREATE INDEX "FeatureFlag_organizationId_key_idx" ON "FeatureFlag"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS para FeatureFlag (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe):
-- el servicio cae al default del código (comportamiento actual), nunca a "apagado".
GRANT ALL ON "FeatureFlag" TO app, app_admin;

ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "FeatureFlag";
CREATE POLICY tenant_isolation ON "FeatureFlag"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
