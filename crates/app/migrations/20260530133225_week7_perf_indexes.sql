-- CreateIndex
CREATE INDEX "SaleLine_organizationId_productId_idx" ON "SaleLine"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_storeId_type_createdAt_idx" ON "StockMovement"("organizationId", "storeId", "type", "createdAt");
