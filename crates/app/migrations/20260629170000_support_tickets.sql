-- Soporte: de "una conversación por organización" a SISTEMA DE TICKETS.
-- Cada fila de support_conversation pasa a ser un ticket: número (secuencial por
-- organización), título (= primer mensaje del usuario), autor (quien lo abre),
-- estado abierto/cerrado y fecha de cierre. Un cliente puede tener varios.
-- Idempotente como el resto de migraciones del repo.

-- Ya no hay UNIQUE por organización (varios tickets por org).
DROP INDEX IF EXISTS "support_conversation_org_key";

ALTER TABLE "support_conversation" ADD COLUMN IF NOT EXISTS "number" INT;
ALTER TABLE "support_conversation" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "support_conversation" ADD COLUMN IF NOT EXISTS "authorUserId" UUID;
ALTER TABLE "support_conversation" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Backfill de los tickets que ya existían (como mucho uno por org por el UNIQUE
-- anterior): número 1, título y autor desde el primer mensaje del usuario.
UPDATE "support_conversation" sc SET
    "number" = COALESCE(sc."number", 1),
    "title" = COALESCE(
        sc."title",
        (SELECT m."body" FROM "support_message" m
         WHERE m."conversationId" = sc.id AND m."author" = 'user'
         ORDER BY m."createdAt" ASC LIMIT 1),
        'Consulta de soporte'
    ),
    "authorUserId" = COALESCE(
        sc."authorUserId",
        (SELECT m."authorUserId" FROM "support_message" m
         WHERE m."conversationId" = sc.id AND m."author" = 'user' AND m."authorUserId" IS NOT NULL
         ORDER BY m."createdAt" ASC LIMIT 1)
    );

-- Lista de tickets del usuario en el sidebar (por org + autor, recientes primero).
CREATE INDEX IF NOT EXISTS "support_conversation_author_idx"
    ON "support_conversation" ("organizationId", "authorUserId", "updatedAt" DESC);
-- Barrido de auto-cierre por inactividad (tickets abiertos por updatedAt).
CREATE INDEX IF NOT EXISTS "support_conversation_open_idx"
    ON "support_conversation" ("status", "updatedAt");
