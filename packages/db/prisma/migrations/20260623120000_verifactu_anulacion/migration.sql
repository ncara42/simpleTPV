-- RegistroAnulacion VeriFactu (#230): una venta anulada (VOIDED) deja constancia
-- fiscal encadenada con un registro de tipo ANULACION (distinto de la rectificativa
-- R5 de una devolución: la anulación CANCELA una factura previamente emitida).
--
-- AlterEnum: añade el tercer tipo al enum existente. No se USA el valor en esta
-- misma migración, así que es seguro dentro de la transacción de Prisma/runner (PG16
-- solo prohíbe usar el nuevo valor en la tx que lo crea, no declararlo).
ALTER TYPE "VerifactuType" ADD VALUE IF NOT EXISTS 'ANULACION';
