-- U-08: marca corporativa por organización — color primario y logo (data-URL).
-- Columnas nuevas sobre tabla con RLS y GRANT ALL ya vigentes (add_rls): no
-- requieren policy ni grants adicionales.
ALTER TABLE "Organization" ADD COLUMN "brandColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT;
