-- KEY-02: caducidad opcional (TTL) para API keys. Null = sin caducidad.
-- Columna nueva sobre tabla con RLS y GRANT ALL ya vigentes (add_rls): no
-- requiere policy ni grants adicionales.
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" TIMESTAMP(3);
