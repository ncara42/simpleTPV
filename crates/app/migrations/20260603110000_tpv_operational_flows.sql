CREATE TYPE "CashMovementType" AS ENUM ('IN', 'OUT');
CREATE TYPE "TimeClockType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT');

CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "cashSessionId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialDevice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pairingToken" TEXT NOT NULL,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeClockEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID,
    "type" "TimeClockType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficialDevice_pairingToken_key" ON "OfficialDevice"("pairingToken");
CREATE INDEX "CashMovement_organizationId_cashSessionId_createdAt_idx" ON "CashMovement"("organizationId", "cashSessionId", "createdAt");
CREATE INDEX "CashMovement_organizationId_storeId_createdAt_idx" ON "CashMovement"("organizationId", "storeId", "createdAt");
CREATE INDEX "OfficialDevice_organizationId_storeId_authorized_idx" ON "OfficialDevice"("organizationId", "storeId", "authorized");
CREATE INDEX "TimeClockEntry_organizationId_storeId_userId_createdAt_idx" ON "TimeClockEntry"("organizationId", "storeId", "userId", "createdAt");

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfficialDevice" ADD CONSTRAINT "OfficialDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficialDevice" ADD CONSTRAINT "OfficialDevice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT ALL ON "CashMovement" TO app, app_admin;
GRANT ALL ON "OfficialDevice" TO app, app_admin;
GRANT ALL ON "TimeClockEntry" TO app, app_admin;

ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashMovement" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CashMovement";
CREATE POLICY tenant_isolation ON "CashMovement"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "OfficialDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfficialDevice" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OfficialDevice";
CREATE POLICY tenant_isolation ON "OfficialDevice"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "TimeClockEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeClockEntry" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TimeClockEntry";
CREATE POLICY tenant_isolation ON "TimeClockEntry"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
