-- Soporte con escalado a humano vía Telegram (Ayuda).
-- Idempotente (IF NOT EXISTS) como el resto de migraciones del repo.
--
-- Modelo "chat por cliente": UNA conversación de soporte por organización
-- (UNIQUE "organizationId"). El historial completo vive aquí y se refleja en el
-- tema de foro de Telegram correspondiente (telegramTopicId). `mode`:
--   'ai'    → el agente intenta resolver; si no puede, escala (crea/usa el tema).
--   'human' → tras escalar, manda el humano; los mensajes del usuario van directos
--             al tema de Telegram hasta que soporte cierra con /cerrar.
CREATE TABLE IF NOT EXISTS "support_conversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "telegramTopicId" BIGINT,
    "mode" TEXT NOT NULL DEFAULT 'ai',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_conversation_pkey" PRIMARY KEY ("id")
);

-- Una conversación por organización: el upsert de get_or_create se apoya en esto.
CREATE UNIQUE INDEX IF NOT EXISTS "support_conversation_org_key"
    ON "support_conversation" ("organizationId");
-- Lookup pre-tenant del webhook (BYPASSRLS) por tema de Telegram.
CREATE INDEX IF NOT EXISTS "support_conversation_topic_idx"
    ON "support_conversation" ("telegramTopicId");

CREATE TABLE IF NOT EXISTS "support_message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    -- 'user' (el comerciante), 'ai' (el agente), 'agent' (soporte humano vía Telegram).
    "author" TEXT NOT NULL,
    "authorUserId" UUID,
    "body" TEXT NOT NULL,
    "telegramMessageId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_message_conversation_idx"
    ON "support_message" ("conversationId", "createdAt");

-- El rol runtime `app` (RLS) opera estas tablas; `app_admin` (BYPASSRLS) las usa
-- para el lookup pre-tenant del webhook (org desconocida hasta resolver el tema).
GRANT ALL ON "support_conversation" TO app, app_admin;
GRANT ALL ON "support_message" TO app, app_admin;

ALTER TABLE "support_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_message" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "support_conversation";
CREATE POLICY "tenant_isolation" ON "support_conversation"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "support_message";
CREATE POLICY "tenant_isolation" ON "support_message"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
