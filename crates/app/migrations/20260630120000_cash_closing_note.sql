-- Nota de cierre de caja: anotación libre del cajero cuando el arqueo no cuadra
-- (sobra o falta dinero). Opcional; null cuando el cierre es exacto o sin comentario.
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "closingNote" TEXT;
