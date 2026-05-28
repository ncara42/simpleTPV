-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- AlterTable
-- `Sale.paymentMethod` es NOT NULL sin default en el schema, pero puede haber
-- ventas existentes (#8). Patrón aditivo seguro: añadir con DEFAULT 'CASH' para
-- backfill de filas existentes y luego DROP DEFAULT (toda venta nueva trae método).
ALTER TABLE "Sale" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" DROP DEFAULT;

-- Solo efectivo: nullable (null en tarjeta).
ALTER TABLE "Sale" ADD COLUMN "cashGiven" DECIMAL(12,2);
ALTER TABLE "Sale" ADD COLUMN "cashChange" DECIMAL(12,2);
