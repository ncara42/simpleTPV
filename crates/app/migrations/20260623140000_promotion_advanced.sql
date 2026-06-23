-- S-22 (#275): promociones avanzadas. Extiende el `Promotion` básico (#99) con
-- los 4 tipos de promo: (a) % o € sobre ticket por umbral (ya existía), (b)
-- descuento por producto/familia (N:M), (c) franja horaria/días (happy hour:
-- startTime/endTime/weekdays) y (d) lleva X paga Y / 2x1 (por cantidad).
--
-- Interacción GANA LA MEJOR (exclusiva): el matching elige por línea/ticket SOLO
-- la promo más ventajosa; no se acumulan (campo `stackable` reservado para una
-- fase futura, default false). Las promos automáticas NO cuentan contra el
-- límite de descuento del rol; `clerkCanSkip` permitirá al cajero quitarlas en
-- caja (lo consume el TPV en otra fase).
--
-- Aditiva e IDEMPOTENTE: NO toca filas existentes y puede re-ejecutarse sin error
-- (CREATE ... IF NOT EXISTS / guards DO) — robustez ante un apply parcial previo.
-- Las promos antiguas quedan con appliesTo = TICKET, amountScope = TICKET, sin
-- franja/scopes → mismo comportamiento de hoy. RLS por tenant en las 3 tablas
-- N:M, espejo del patrón with_check (20260616120000_rls_with_check): USING +
-- WITH CHECK con la forma NULLIF fail-safe (sin contexto → 0 filas y ningún
-- INSERT/UPDATE pasa el check).

-- CreateEnum: a qué se aplica la promo (alcance del descuento). Idempotente.
DO $$ BEGIN
  CREATE TYPE "PromoAppliesTo" AS ENUM ('TICKET', 'PRODUCT', 'FAMILY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum: si el importe del descuento se calcula sobre el ticket o por línea.
DO $$ BEGIN
  CREATE TYPE "PromoAmountScope" AS ENUM ('TICKET', 'LINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum: nuevo tipo de condición para "lleva X paga Y / 2x1" (por cantidad).
-- `ADD VALUE IF NOT EXISTS` es idempotente; no se usa en esta misma migración.
ALTER TYPE "PromoConditionType" ADD VALUE IF NOT EXISTS 'qty_xy';

-- AlterTable: campos avanzados de Promotion (todos con DEFAULT o NULLABLE → las
-- filas existentes no se rompen). `IF NOT EXISTS` por columna → re-ejecutable.
ALTER TABLE "Promotion"
  ADD COLUMN IF NOT EXISTS "appliesTo"    "PromoAppliesTo"   NOT NULL DEFAULT 'TICKET',
  ADD COLUMN IF NOT EXISTS "amountScope"  "PromoAmountScope" NOT NULL DEFAULT 'TICKET',
  ADD COLUMN IF NOT EXISTS "startTime"    TIME,
  ADD COLUMN IF NOT EXISTS "endTime"      TIME,
  ADD COLUMN IF NOT EXISTS "weekdays"     SMALLINT[],
  ADD COLUMN IF NOT EXISTS "stackable"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "clerkCanSkip" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "buyQty"       INTEGER,
  ADD COLUMN IF NOT EXISTS "payQty"       INTEGER,
  -- Desempate determinista cuando dos promos dan el MISMO descuento (gana la de
  -- mayor prioridad; a igualdad, la más reciente por createdAt). Default 0.
  ADD COLUMN IF NOT EXISTS "priority"     INTEGER NOT NULL DEFAULT 0;

-- CreateTable: scope N:M promo → producto.
CREATE TABLE IF NOT EXISTS "PromotionProduct" (
    "promotionId"    UUID NOT NULL,
    "productId"      UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("promotionId", "productId")
);

-- CreateTable: scope N:M promo → familia.
CREATE TABLE IF NOT EXISTS "PromotionFamily" (
    "promotionId"    UUID NOT NULL,
    "familyId"       UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "PromotionFamily_pkey" PRIMARY KEY ("promotionId", "familyId")
);

-- CreateTable: scope N:M promo → tienda (si vacío, aplica a todas las tiendas).
CREATE TABLE IF NOT EXISTS "PromotionStore" (
    "promotionId"    UUID NOT NULL,
    "storeId"        UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "PromotionStore_pkey" PRIMARY KEY ("promotionId", "storeId")
);

-- CreateIndex: listado de scopes por organización (RLS) y por promo. Idempotente.
CREATE INDEX IF NOT EXISTS "PromotionProduct_organizationId_idx" ON "PromotionProduct"("organizationId");
CREATE INDEX IF NOT EXISTS "PromotionProduct_productId_idx" ON "PromotionProduct"("productId");
CREATE INDEX IF NOT EXISTS "PromotionFamily_organizationId_idx" ON "PromotionFamily"("organizationId");
CREATE INDEX IF NOT EXISTS "PromotionFamily_familyId_idx" ON "PromotionFamily"("familyId");
CREATE INDEX IF NOT EXISTS "PromotionStore_organizationId_idx" ON "PromotionStore"("organizationId");
CREATE INDEX IF NOT EXISTS "PromotionStore_storeId_idx" ON "PromotionStore"("storeId");

-- AddForeignKey: borrar la promo (o el producto/familia/tienda) limpia sus scopes.
-- Guard DO (ADD CONSTRAINT no admite IF NOT EXISTS) → re-ejecutable.
DO $$ BEGIN
  ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PromotionFamily" ADD CONSTRAINT "PromotionFamily_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionFamily" ADD CONSTRAINT "PromotionFamily_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionFamily" ADD CONSTRAINT "PromotionFamily_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PromotionStore" ADD CONSTRAINT "PromotionStore_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionStore" ADD CONSTRAINT "PromotionStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionStore" ADD CONSTRAINT "PromotionStore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS por tenant en las 3 tablas N:M (espejo del patrón with_check: USING +
-- WITH CHECK con NULLIF fail-safe). Sin contexto → 0 filas y ningún INSERT pasa.
GRANT ALL ON "PromotionProduct" TO app, app_admin;
GRANT ALL ON "PromotionFamily"  TO app, app_admin;
GRANT ALL ON "PromotionStore"   TO app, app_admin;

ALTER TABLE "PromotionProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionProduct" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "PromotionFamily"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionFamily"  FORCE  ROW LEVEL SECURITY;
ALTER TABLE "PromotionStore"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionStore"   FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "PromotionProduct";
CREATE POLICY tenant_isolation ON "PromotionProduct"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "PromotionFamily";
CREATE POLICY tenant_isolation ON "PromotionFamily"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "PromotionStore";
CREATE POLICY tenant_isolation ON "PromotionStore"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
