-- Inmutabilidad de los campos fiscales de VerifactuRecord (#156; deuda D2 de la
-- auditoría 2026-06-03). La cadena de huellas ya hace la manipulación DETECTABLE
-- (verify_chain), pero `GRANT ALL` al rol `app` permitía MODIFICAR hash/previousHash/
-- payload directamente en BD. Este trigger BEFORE UPDATE la hace además IMPEDIDA:
-- rechaza cualquier cambio de los campos fiscales/identidad, dejando pasar los updates
-- legítimos de estado y transporte (status, attempts, csv, aeatState, errorCode,
-- lastError, nextAttemptAt, sentAt, subsanacion, rechazoPrevio) que hacen la cola y el
-- worker.
--
-- No se bloquea DELETE: el borrado en cascada por organización y la limpieza de tests
-- lo necesitan; en producción la política es append-only (no se borran registros).
-- Idempotente (CREATE OR REPLACE / DROP TRIGGER IF EXISTS): seguro de reaplicar.

CREATE OR REPLACE FUNCTION verifactu_record_inmutable() RETURNS trigger AS $$
BEGIN
  IF NEW.hash             IS DISTINCT FROM OLD.hash
     OR NEW."previousHash"   IS DISTINCT FROM OLD."previousHash"
     OR NEW.payload          IS DISTINCT FROM OLD.payload
     OR NEW.type             IS DISTINCT FROM OLD.type
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."saleId"         IS DISTINCT FROM OLD."saleId"
     OR NEW."returnId"       IS DISTINCT FROM OLD."returnId"
     OR NEW."qrData"         IS DISTINCT FROM OLD."qrData" THEN
    RAISE EXCEPTION 'VerifactuRecord: campos fiscales inmutables (hash, previousHash, payload, type, organizationId, saleId, returnId, qrData)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verifactu_record_inmutable_trg ON "VerifactuRecord";
CREATE TRIGGER verifactu_record_inmutable_trg
  BEFORE UPDATE ON "VerifactuRecord"
  FOR EACH ROW EXECUTE FUNCTION verifactu_record_inmutable();
