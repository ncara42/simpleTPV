-- CreateTable
CREATE TABLE "ProductFamily" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFamily_organizationId_parentId_idx" ON "ProductFamily"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "Product_organizationId_familyId_idx" ON "Product"("organizationId", "familyId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFamily" ADD CONSTRAINT "ProductFamily_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFamily" ADD CONSTRAINT "ProductFamily_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS para la nueva tabla (replica el patrón de la migración add_rls).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "ProductFamily" TO app, app_admin;

ALTER TABLE "ProductFamily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductFamily" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "ProductFamily";
CREATE POLICY tenant_isolation ON "ProductFamily"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);
