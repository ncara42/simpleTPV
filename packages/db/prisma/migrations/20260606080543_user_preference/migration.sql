-- IT-16: personalización por usuario. Nueva tabla UserPreference (clave-valor JSON
-- por usuario) con RLS por tenant.
--
-- NOTA: se omiten a propósito los `ALTER COLUMN "id" DROP DEFAULT` de
-- CashMovement/OfficialDevice/TimeClockEntry que `migrate dev` propuso: son drift
-- preexistente ajeno a IT-16.

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPreference_organizationId_userId_idx" ON "UserPreference"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key_key" ON "UserPreference"("userId", "key");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS para UserPreference (mismo patrón NULLIF que el resto de tablas tenant).
GRANT ALL ON "UserPreference" TO app, app_admin;
ALTER TABLE "UserPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPreference" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UserPreference";
CREATE POLICY tenant_isolation ON "UserPreference"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
