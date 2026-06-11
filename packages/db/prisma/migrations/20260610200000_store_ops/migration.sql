-- Estado operativo MANUAL de la tienda (I-09 / D-10): verificada + nota de
-- incidencia, persistidos. El estado del dispositivo NO se guarda aquí: lo
-- deriva la API de devices (D-10b). Store ya tiene RLS; solo se añaden columnas.
ALTER TABLE "Store" ADD COLUMN "opsVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "opsIncident" TEXT;
ALTER TABLE "Store" ADD COLUMN "opsUpdatedAt" TIMESTAMP(3);
