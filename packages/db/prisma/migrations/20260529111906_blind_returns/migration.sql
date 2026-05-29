-- DropForeignKey
ALTER TABLE "Return" DROP CONSTRAINT "Return_saleId_fkey";

-- DropForeignKey
ALTER TABLE "ReturnLine" DROP CONSTRAINT "ReturnLine_saleLineId_fkey";

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "authorizedBy" UUID,
ALTER COLUMN "saleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ReturnLine" ALTER COLUMN "saleLineId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
