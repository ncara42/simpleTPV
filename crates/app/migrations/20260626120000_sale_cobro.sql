-- Cobro (cuentas por cobrar) sobre la venta: canal, estado de cobro y vencimiento.
--
-- Hasta ahora una Sale solo conocía su `status` (COMPLETED/VOIDED) y su
-- `paymentMethod` (CASH/CARD): toda venta se daba por cobrada en el acto (TPV). El
-- ledger de Ventas necesita además seguir el COBRO de las facturas a crédito (B2B):
-- en qué canal se emitió, si está pagada o pendiente, y cuándo vence.
--
-- El cobro es POST-fiscal: NO toca VeriFactu. La huella del RegistroAlta no usa el
-- método de pago ni el estado de cobro, así que marcar una factura como cobrada es
-- un evento de tesorería, no fiscal.
--
-- La tabla Sale ya tiene RLS tenant_isolation (USING + WITH CHECK) y el GRANT ALL a
-- nivel de tabla cubre las columnas nuevas → no hace falta política ni re-GRANT
-- (mismo razonamiento que sale_customer_fiscal).

-- CreateEnum: canal de la venta y estado de cobro.
CREATE TYPE "SaleChannel"   AS ENUM ('TPV', 'ONLINE', 'B2B');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterEnum: métodos de pago de facturas a crédito (transferencia, Bizum,
-- domiciliación). Aditivo. Los valores NO se usan en esta misma migración, así que
-- es seguro dentro de la transacción implícita del runner (PG16, igual que
-- cash_movement_approval con TRANSFER_OUT).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BIZUM';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DIRECT_DEBIT';

-- AlterTable: canal + estado de cobro + vencimiento + fecha de cobro.
-- Los DEFAULT se MANTIENEN a propósito (a diferencia de sale_payment, que los
-- retira): toda venta histórica y todo INSERT directo en "Sale" que no mencione
-- estas columnas es, por definición, una venta TPV cobrada en el acto.
ALTER TABLE "Sale"
  ADD COLUMN "channel"       "SaleChannel"   NOT NULL DEFAULT 'TPV',
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "dueDate"       DATE,
  ADD COLUMN "paidAt"        TIMESTAMP(3);

-- Back-fill: las ventas históricas se cobraron en el momento de la venta.
-- channel/paymentStatus toman su DEFAULT automáticamente; solo paidAt necesita
-- rellenarse explícitamente (= createdAt).
UPDATE "Sale" SET "paidAt" = "createdAt" WHERE "paidAt" IS NULL;

-- CreateIndex: cartera vencida/pendiente (paymentStatus='PENDING' AND dueDate<hoy).
-- Índice PARCIAL: las filas PAID (la inmensa mayoría) quedan fuera → índice mínimo.
CREATE INDEX "Sale_org_pending_dueDate_idx"
  ON "Sale" ("organizationId", "dueDate") WHERE "paymentStatus" = 'PENDING';

-- CreateIndex: ledger filtrado por canal/estado de cobro, ordenado por fecha.
CREATE INDEX "Sale_org_channel_paymentStatus_createdAt_idx"
  ON "Sale" ("organizationId", "channel", "paymentStatus", "createdAt");
