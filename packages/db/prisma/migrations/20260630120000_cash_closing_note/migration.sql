-- Nota de cierre de caja: anotación libre del cajero cuando el arqueo no cuadra (sobra o falta
-- dinero). Opcional; null cuando el cierre es exacto o sin comentario.
--
-- Espejo del lado Prisma de la migración sqlx crates/app/migrations/20260630120000_cash_closing_note.sql
-- (esa es la fuente de verdad del runtime, aplicada por el binario al arrancar). Prisma solo alimenta
-- el schema de seeds/tests: `cargo test` (rust.yml) construye la BD con `prisma migrate deploy`, así que
-- sin esta migración la columna no existe y los tests de cash_sessions fallan («closingNote does not exist»).
ALTER TABLE "CashSession" ADD COLUMN "closingNote" TEXT;
