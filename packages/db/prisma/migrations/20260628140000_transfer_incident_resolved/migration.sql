-- Incidencia de recepción marcada como solucionada (#-). Cuando se resuelve la
-- incidencia desde el chat («¿Ha sido solucionado este problema? Sí»), el traspaso
-- deja de contar como incidencia abierta pero el hilo de mensajes se conserva.
ALTER TABLE "Transfer" ADD COLUMN "incidentResolvedAt" TIMESTAMP(3);
