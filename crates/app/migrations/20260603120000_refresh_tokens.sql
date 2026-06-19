-- Sesiones de refresh (SEC-06): rotación + detección de reuso + revocación.
-- id = jti del refresh JWT. La expiración la valida el propio JWT; aquí solo vive
-- el estado de rotación (usedAt/revokedAt) por familia.

CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT ALL ON "RefreshToken" TO app, app_admin;

-- RLS por convención (defensa en profundidad). El flujo de auth accede con el rol
-- app_admin (BYPASSRLS) porque login/refresh corren sin contexto de tenant; el rol
-- `app` (runtime) nunca toca esta tabla. La policy fija el aislamiento por si acaso.
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RefreshToken";
CREATE POLICY tenant_isolation ON "RefreshToken"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
