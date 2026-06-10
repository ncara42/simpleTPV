-- Arquetipo como tipo de nodo del árbol de clasificación (informe UX). Un arquetipo
-- es la "hoja de clasificación" que solo contiene productos (no subfamilias); la
-- regla de contención se aplica en el servicio product-families.
-- ProductFamily ya tiene RLS habilitada; añadir una columna no cambia la policy.
ALTER TABLE "ProductFamily" ADD COLUMN "isArchetype" BOOLEAN NOT NULL DEFAULT false;
