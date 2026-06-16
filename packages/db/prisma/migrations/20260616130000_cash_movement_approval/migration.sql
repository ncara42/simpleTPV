-- Flujo de aprobación de movimientos de efectivo + tienda central (#146).
--
-- El cajero (CLERK) SOLICITA un ingreso/retirada/traspaso desde la tienda y un
-- ADMIN/MANAGER lo aprueba o deniega. El cuadre solo cuenta los APPROVED. Los
-- traspasos (TRANSFER_OUT) van siempre a la tienda central de la organización.
--
-- Las columnas nuevas viven en tablas existentes (CashMovement, Store) que YA
-- tienen RLS tenant_isolation con USING + WITH CHECK (migración rls_with_check y
-- la propia de CashMovement): no necesitan política nueva ni re-GRANT (el GRANT
-- ALL a nivel de tabla cubre las columnas nuevas).

-- CreateEnum: máquina de estados del movimiento (D-2).
CREATE TYPE "CashMovementStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- AlterEnum: traspaso de efectivo a la central (D-3). No se usa el valor en esta
-- misma migración, así que es seguro dentro de la transacción de Prisma (PG16).
ALTER TYPE "CashMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';

-- AlterTable: designación de tienda central (D-1).
ALTER TABLE "Store" ADD COLUMN "isCentral" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: estado + autoría/revisión + destino del traspaso (D-2/D-4).
-- requestedById se añade NULLABLE para poder rellenarlo (back-fill) antes de
-- imponer el NOT NULL en filas preexistentes.
ALTER TABLE "CashMovement"
  ADD COLUMN "status"        "CashMovementStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "requestedById" UUID,
  ADD COLUMN "reviewedById"  UUID,
  ADD COLUMN "reviewedAt"    TIMESTAMP(3),
  ADD COLUMN "targetStoreId" UUID;

-- Back-fill (D-8): las filas existentes se daban por aprobadas de facto (las creaba
-- directamente un ADMIN/MANAGER), así que el cuadre histórico no debe cambiar.
-- requestedById = userId (autor original). targetStore/reviewed* quedan NULL.
UPDATE "CashMovement" SET "status" = 'APPROVED', "requestedById" = "userId";

-- Una vez rellenado, requestedById es obligatorio (coincide con el schema Prisma).
ALTER TABLE "CashMovement" ALTER COLUMN "requestedById" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_targetStoreId_fkey" FOREIGN KEY ("targetStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: listado de solicitudes pendientes de la organización (campana, D-7).
CREATE INDEX "CashMovement_organizationId_status_createdAt_idx" ON "CashMovement"("organizationId", "status", "createdAt");

-- Una sola tienda central por organización (D-1). Prisma no expresa índices
-- únicos parciales en el schema, así que vive aquí (mismo patrón que
-- "CashSession_one_open_per_store").
CREATE UNIQUE INDEX "one_central_per_org" ON "Store"("organizationId") WHERE "isCentral" = true;
