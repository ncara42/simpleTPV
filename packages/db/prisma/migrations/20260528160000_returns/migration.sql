-- CreateTable
CREATE TABLE "Return" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnLine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "saleLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Return_organizationId_saleId_idx" ON "Return"("organizationId", "saleId");

-- CreateIndex
CREATE INDEX "ReturnLine_returnId_idx" ON "ReturnLine"("returnId");

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS para Return (mismo patrón que Sale/SaleLine).
-- Sin contexto de tenant → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "Return" TO app, app_admin;
ALTER TABLE "Return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Return" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Return";
CREATE POLICY tenant_isolation ON "Return"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- RLS para ReturnLine (organizationId propio + policy, igual que SaleLine).
-- Sin contexto de tenant → NULLIF(...) = NULL → 0 filas (fail-safe).
GRANT ALL ON "ReturnLine" TO app, app_admin;
ALTER TABLE "ReturnLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReturnLine" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReturnLine";
CREATE POLICY tenant_isolation ON "ReturnLine"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
