-- Factura completa F1 (#230): datos fiscales del destinatario en la venta.
--
-- Un ticket normal es una **factura simplificada F2** (no exige identificar al
-- cliente). Cuando el cliente pide **factura completa F1**, se captura su NIF y su
-- razón social/nombre; ese snapshot vive en la propia venta (no se acopla al
-- Customer B2B). La presencia del NIF es lo que convierte el RegistroAlta VeriFactu
-- en `F1` (con bloque Destinatario) en vez de `F2`.
--
-- AlterTable: ambas columnas NULLABLE (las ventas F2 no las llevan). La tabla Sale
-- ya tiene RLS tenant_isolation (USING + WITH CHECK); el GRANT a nivel de tabla
-- cubre las columnas nuevas → no hace falta política ni re-GRANT.
ALTER TABLE "Sale"
  ADD COLUMN "customerTaxId" TEXT,
  ADD COLUMN "customerName"  TEXT;
