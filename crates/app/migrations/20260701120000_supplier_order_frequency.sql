-- Periodicidad de compra por proveedor (Proveedores > Propuesta): cada cuántos
-- días se le compra (7 semanal, 14 quincenal, 30 mensual…). Alimenta la cobertura
-- por defecto de la propuesta de reposición y, más adelante, la automatización del
-- pedido y su envío por email. NULL = sin definir (la propuesta usa su default).
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "orderFrequencyDays" INTEGER;
