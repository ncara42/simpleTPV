-- IT-03: congela el coste unitario y el origen del descuento en cada línea de venta.
-- costPrice → rentabilidad histórica fiable (el dashboard deja de usar Product.costPrice
-- actual). discountSource → distinguir descuento voluntario vs promoción (STAT-04).
--
-- NOTA: se omiten a propósito los `ALTER COLUMN "id" DROP DEFAULT` de
-- CashMovement/OfficialDevice/TimeClockEntry que `migrate dev` propuso: son drift
-- preexistente ajeno a IT-03 y no deben colarse en este cambio.

-- CreateEnum
CREATE TYPE "DiscountSource" AS ENUM ('VOLUNTARY', 'PROMOTION');

-- AlterTable: nuevas columnas congeladas (el default cubre las filas nuevas).
ALTER TABLE "SaleLine"
  ADD COLUMN "costPrice" DECIMAL(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN "discountSource" "DiscountSource" NOT NULL DEFAULT 'VOLUNTARY';

-- Backfill de líneas históricas con el coste ACTUAL del producto. Es la mejor
-- aproximación disponible (el coste del momento exacto de la venta es irrecuperable);
-- a partir de ahora cada venta congela su propio coste, así que el dato deja de
-- degradarse.
UPDATE "SaleLine" sl
SET "costPrice" = p."costPrice"
FROM "Product" p
WHERE p.id = sl."productId";
