//! Persistencia del soporte (Ayuda) — sistema de tickets. Las lecturas/escrituras
//! por tenant pasan por [`with_tenant_tx`] (RLS). Excepciones que van por el pool
//! `app_admin` (BYPASSRLS) porque no hay contexto de organización: el lookup del
//! webhook de Telegram ([`find_ticket_by_topic`]) y el barrido de auto-cierre
//! cross-tenant ([`close_stale_tickets`]).

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::model::{InsertSupportMessage, Mode, SupportConversationRow, SupportMessageRow};

/// Crea un ticket nuevo con número secuencial por organización. `title` = primer
/// mensaje del usuario (el handler persiste ese mensaje aparte).
pub async fn create_ticket(
    pool: &PgPool,
    org: Uuid,
    author_user_id: Uuid,
    title: &str,
) -> Result<SupportConversationRow, AppError> {
    let title = title.to_owned();
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, SupportConversationRow>(
            r#"INSERT INTO "support_conversation"
                   ("id","organizationId","number","title","authorUserId",
                    "mode","status","createdAt","updatedAt")
               VALUES ($1,$2,
                   (SELECT COALESCE(MAX("number"),0)+1 FROM "support_conversation"),
                   $3,$4,'ai','open',NOW(),NOW())
               RETURNING *"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(&title)
        .bind(author_user_id)
        .fetch_one(&mut **tx)
        .await
    })
    .await
}

/// Tickets del usuario (sidebar), recientes primero.
pub async fn list_tickets(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
) -> Result<Vec<SupportConversationRow>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, SupportConversationRow>(
            r#"SELECT * FROM "support_conversation"
               WHERE "authorUserId"=$1 ORDER BY "updatedAt" DESC LIMIT 100"#,
        )
        .bind(user_id)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

pub async fn get_ticket(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
) -> Result<SupportConversationRow, AppError> {
    let result: Result<Result<SupportConversationRow, AppError>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            sqlx::query_as::<_, SupportConversationRow>(
                r#"SELECT * FROM "support_conversation" WHERE id=$1"#,
            )
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map(|opt| opt.ok_or(AppError::NotFound))
        })
        .await;
    result?
}

pub async fn close_ticket(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(
            r#"UPDATE "support_conversation"
               SET "status"='closed',"closedAt"=NOW(),"updatedAt"=NOW() WHERE id=$1"#,
        )
        .bind(id)
        .execute(&mut **tx)
        .await
        .map(|_| ())
    })
    .await
}

/// Reabre un ticket (lo usa el webhook cuando soporte responde a uno cerrado) y lo
/// pone en modo humano.
pub async fn reopen_ticket(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(
            r#"UPDATE "support_conversation"
               SET "status"='open',"closedAt"=NULL,"mode"='human',"updatedAt"=NOW()
               WHERE id=$1"#,
        )
        .bind(id)
        .execute(&mut **tx)
        .await
        .map(|_| ())
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
        // Toca el ticket para ordenar por actividad reciente (reinicia el reloj de
        // auto-cierre por inactividad).
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

/// Ticket referenciado por un tema de Telegram. Lookup PRE-TENANT (el webhook no
/// tiene contexto de organización): pool `app_admin` (BYPASSRLS). Devuelve
/// `(organizationId, ticketId, Mode, status)`.
pub async fn find_ticket_by_topic(
    admin_pool: &PgPool,
    topic_id: i64,
) -> Result<Option<(Uuid, Uuid, Mode, String)>, AppError> {
    let row: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
        r#"SELECT "organizationId", id, mode, status FROM "support_conversation"
           WHERE "telegramTopicId"=$1"#,
    )
    .bind(topic_id)
    .fetch_optional(admin_pool)
    .await
    .map_err(|_| AppError::Internal)?;
    Ok(row.map(|(org, id, mode, status)| (org, id, Mode::from_db(&mode), status)))
}

/// Cierra los tickets abiertos sin actividad desde hace `hours` horas. Barrido
/// cross-tenant por el pool `app_admin` (BYPASSRLS). Devuelve cuántos cerró.
pub async fn close_stale_tickets(admin_pool: &PgPool, hours: i32) -> Result<u64, AppError> {
    let res = sqlx::query(
        r#"UPDATE "support_conversation"
           SET "status"='closed',"closedAt"=NOW()
           WHERE "status"='open' AND "updatedAt" < NOW() - make_interval(hours => $1)"#,
    )
    .bind(hours)
    .execute(admin_pool)
    .await
    .map_err(|_| AppError::Internal)?;
    Ok(res.rows_affected())
}
