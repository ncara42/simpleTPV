-- Idempotente (IF NOT EXISTS) a propósito: estas tablas pueden existir ya en la BD
-- creadas por la migración Prisma equivalente (20260620120000_chat) durante el corte
-- Prisma→Rust. Sin esto, el binario Rust crashea al arrancar ("relation already exists")
-- y Dokploy mantiene el contenedor viejo. GRANT/ENABLE RLS y DROP+CREATE POLICY ya son
-- idempotentes. Mismo esquema que la copia Prisma (INT≡INTEGER).
CREATE TABLE IF NOT EXISTS "chat_conversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chat_message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_usage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INT NOT NULL,
    "outputTokens" INT NOT NULL,
    "costEur" DECIMAL(10,4) NOT NULL,
    "aborted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_conversation_org_user_idx" ON "chat_conversation" ("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "chat_message_conversation_idx" ON "chat_message" ("conversationId");
CREATE INDEX IF NOT EXISTS "ai_usage_org_created_idx" ON "ai_usage" ("organizationId", "createdAt");

-- El rol runtime `app` (RLS) opera estas tablas; `app_admin` (BYPASSRLS) las usa
-- para lookups/limpieza. Mismo patrón que el resto de migraciones del repo.
GRANT ALL ON "chat_conversation" TO app, app_admin;
GRANT ALL ON "chat_message" TO app, app_admin;
GRANT ALL ON "ai_usage" TO app, app_admin;

ALTER TABLE "chat_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "chat_conversation";
CREATE POLICY "tenant_isolation" ON "chat_conversation"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "chat_message";
CREATE POLICY "tenant_isolation" ON "chat_message"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "ai_usage";
CREATE POLICY "tenant_isolation" ON "ai_usage"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
