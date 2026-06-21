-- CreateTable
CREATE TABLE "chat_conversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
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

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costEur" DECIMAL(10,4) NOT NULL,
    "aborted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_conversation_org_user_idx" ON "chat_conversation"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "chat_message_conversation_idx" ON "chat_message"("conversationId");

-- CreateIndex
CREATE INDEX "ai_usage_org_created_idx" ON "ai_usage"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permisos y RLS (mismo patrón que otras tablas del repo)
GRANT ALL ON "chat_conversation" TO app, app_admin;
GRANT ALL ON "chat_message" TO app, app_admin;
GRANT ALL ON "ai_usage" TO app, app_admin;

ALTER TABLE "chat_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "chat_conversation"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "tenant_isolation" ON "chat_message"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "tenant_isolation" ON "ai_usage"
    USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
