-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterTable
-- Anulación de venta: aditivo. status con DEFAULT COMPLETED para las filas
-- existentes (quedan como ventas completadas); voidedAt/voidedBy nullable.
ALTER TABLE "Sale" ADD COLUMN     "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedBy" UUID;
