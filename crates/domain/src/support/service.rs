//! Persistencia del soporte (Ayuda). Igual que el resto del dominio, las
//! lecturas/escrituras por tenant pasan por [`with_tenant_tx`] (RLS). La única
//! excepción es [`find_conversation_by_topic`]: el webhook de Telegram no conoce
//! la organización hasta resolver el tema, así que ese lookup va por el pool
//! `app_admin` (BYPASSRLS), como el lookup pre-tenant de API keys.

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::model::{InsertSupportMessage, Mode, SupportConversationRow, SupportMessageRow};

/// Devuelve la (única) conversación de soporte de la organización, creándola si no
/// existía. El `UNIQUE("organizationId")` sostiene el upsert.
pub async fn get_or_create_conversation(
    pool: &PgPool,
    org: Uuid,
) -> Result<SupportConversationRow, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, SupportConversationRow>(
            r#"INSERT INTO "support_conversation"
                   ("id","organizationId","mode","status","createdAt","updatedAt")
               VALUES ($1,$2,'ai','open',NOW(),NOW())
               ON CONFLICT ("organizationId")
                   DO UPDATE SET "updatedAt" = NOW()
               RETURNING *"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .fetch_one(&mut **tx)
        .await
    })
    .await
}

pub async fn get_messages(
    pool: &PgPool,
    org: Uuid,
    conversation_id: Uuid,
) -> Result<Vec<SupportMessageRow>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, SupportMessageRow>(
            r#"SELECT * FROM "support_message"
               WHERE "conversationId"=$1 ORDER BY "createdAt" ASC"#,
        )
        .bind(conversation_id)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

pub async fn append_message(
    pool: &PgPool,
    org: Uuid,
    input: InsertSupportMessage,
) -> Result<SupportMessageRow, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row = sqlx::query_as::<_, SupportMessageRow>(
            r#"INSERT INTO "support_message"
                   ("id","conversationId","organizationId","author","authorUserId",
                    "body","telegramMessageId","createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
               RETURNING *"#,
        )
        .bind(input.id)
        .bind(input.conversation_id)
        .bind(input.organization_id)
        .bind(input.author.as_str())
        .bind(input.author_user_id)
        .bind(&input.body)
        .bind(input.telegram_message_id)
        .fetch_one(&mut **tx)
        .await?;
        // Toca la conversación para ordenar por actividad reciente.
        sqlx::query(r#"UPDATE "support_conversation" SET "updatedAt"=NOW() WHERE id=$1"#)
            .bind(input.conversation_id)
            .execute(&mut **tx)
            .await?;
        Ok(row)
    })
    .await
}

pub async fn set_topic(
    pool: &PgPool,
    org: Uuid,
    conversation_id: Uuid,
    topic_id: i64,
) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(
            r#"UPDATE "support_conversation"
               SET "telegramTopicId"=$1,"updatedAt"=NOW() WHERE id=$2"#,
        )
        .bind(topic_id)
        .bind(conversation_id)
        .execute(&mut **tx)
        .await
        .map(|_| ())
    })
    .await
}

pub async fn set_mode(
    pool: &PgPool,
    org: Uuid,
    conversation_id: Uuid,
    mode: Mode,
) -> Result<(), AppError> {
    let mode = mode.as_str();
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(r#"UPDATE "support_conversation" SET "mode"=$1,"updatedAt"=NOW() WHERE id=$2"#)
            .bind(mode)
            .bind(conversation_id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await
}

/// Conversación referenciada por un tema de Telegram. Lookup PRE-TENANT (el webhook
/// no tiene contexto de organización): va por el pool `app_admin` (BYPASSRLS).
/// Devuelve `(organizationId, conversationId, Mode)`.
pub async fn find_conversation_by_topic(
    admin_pool: &PgPool,
    topic_id: i64,
) -> Result<Option<(Uuid, Uuid, Mode)>, AppError> {
    let row: Option<(Uuid, Uuid, String)> = sqlx::query_as(
        r#"SELECT "organizationId", id, mode FROM "support_conversation"
           WHERE "telegramTopicId"=$1"#,
    )
    .bind(topic_id)
    .fetch_optional(admin_pool)
    .await
    .map_err(|_| AppError::Internal)?;
    Ok(row.map(|(org, id, mode)| (org, id, Mode::from_db(&mode))))
}
