-- CRM + cartera de clientes B2B (vista Clientes B2B maestro-detalle).
--
-- Añade a Customer los campos comerciales que la ficha de cliente necesita
-- (segmentos/etiquetas, días de crédito, comercial asignado, límite de crédito) y
-- extiende WholesaleOrder con el ledger de cobro (igual que sale_cobro hizo con
-- Sale): estado de cobro, vencimiento y fecha de cobro. El saldo/vencido de un
-- cliente se deriva agregando sus pedidos PENDING.
--
-- El cobro mayorista es POST-fiscal igual que el retail: marcar un pedido cobrado
-- es tesorería, no fiscal (no toca VeriFactu).
--
-- Customer y WholesaleOrder ya tienen RLS tenant_isolation (USING + WITH CHECK) y
-- GRANT ALL a nivel de tabla → las columnas nuevas quedan cubiertas, no hace falta
-- política ni re-GRANT (mismo razonamiento que sale_cobro / sale_customer_fiscal).
--
-- El enum "PaymentStatus" ('PENDING','PAID') ya existe (creado en sale_cobro,
-- 20260626120000) → se reutiliza tal cual para el cobro mayorista.

-- AlterTable: campos CRM/cartera del cliente. tags es TEXT[] con DEFAULT '{}'
-- (convención PG para arrays opcionales: nunca NULL). paymentTerms en días
-- (NULL/0 = contado). creditLimit nullable (NULL = sin límite asignado).
ALTER TABLE "Customer"
  ADD COLUMN "tags"         TEXT[]        NOT NULL DEFAULT '{}',
  ADD COLUMN "paymentTerms" INTEGER,
  ADD COLUMN "salesRep"     TEXT,
  ADD COLUMN "creditLimit"  DECIMAL(12, 2);

-- AlterTable: ledger de cobro del pedido mayorista. A diferencia de Sale (que nace
-- PAID, al contado en TPV), un pedido mayorista nace PENDING (a crédito). dueDate
-- se rellena al crear desde paymentTerms del cliente; los pedidos históricos se
-- quedan sin vencimiento (NULL → no computan como vencidos).
ALTER TABLE "WholesaleOrder"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "dueDate"       DATE,
  ADD COLUMN "paidAt"        TIMESTAMP(3);

-- CreateIndex: cartera vencida/pendiente por tenant (PENDING AND dueDate<hoy).
-- Índice PARCIAL: las filas PAID quedan fuera → índice mínimo.
CREATE INDEX "WholesaleOrder_org_pending_dueDate_idx"
  ON "WholesaleOrder" ("organizationId", "dueDate") WHERE "paymentStatus" = 'PENDING';

-- CreateIndex: agregado del ledger por cliente (nº pedidos, último, facturado).
CREATE INDEX "WholesaleOrder_org_customerId_createdAt_idx"
  ON "WholesaleOrder" ("organizationId", "customerId", "createdAt");
