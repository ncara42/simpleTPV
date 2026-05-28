-- CreateEnum
CREATE TYPE "SaleUnit" AS ENUM ('UNIT', 'WEIGHT', 'VOLUME', 'LENGTH');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "costPrice" DECIMAL(10,4) NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "familyId" UUID,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "saleUnit" "SaleUnit" NOT NULL DEFAULT 'UNIT',
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 21,
ADD COLUMN     "unitSymbol" TEXT NOT NULL DEFAULT 'ud';

-- CreateIndex
CREATE INDEX "Product_organizationId_barcode_idx" ON "Product"("organizationId", "barcode");
