use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::model::{
    CanvasOp, ChatConversationRow, ChatMessageRow, ConversationUsage, InsertConversation,
    InsertMessage, OrgUsageByModel, OrgUsageSummary, PruneResult, RecordUsageInput, UsageSummary,
};

// ── Conversations ─────────────────────────────────────────────────────────────

pub async fn create_conversation(
    pool: &PgPool,
    org: Uuid,
    input: InsertConversation,
) -> Result<ChatConversationRow, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, ChatConversationRow>(
            r#"INSERT INTO "chat_conversation"
               ("id","organizationId","userId","title","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,NOW(),NOW())
               RETURNING *"#,
        )
        .bind(input.id)
        .bind(input.organization_id)
        .bind(input.user_id)
        .bind(input.title)
        .fetch_one(&mut **tx)
        .await
    })
    .await
}

pub async fn get_conversation(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
) -> Result<ChatConversationRow, AppError> {
    let result: Result<Result<ChatConversationRow, AppError>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            sqlx::query_as::<_, ChatConversationRow>(
                r#"SELECT * FROM "chat_conversation" WHERE id=$1"#,
            )
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map(|opt| opt.ok_or(AppError::NotFound))
        })
        .await;
    result?
}

pub async fn list_conversations(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
) -> Result<Vec<ChatConversationRow>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, ChatConversationRow>(
            r#"SELECT * FROM "chat_conversation"
               WHERE "userId"=$1 ORDER BY "updatedAt" DESC LIMIT 100"#,
        )
        .bind(user_id)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

pub async fn update_conversation_title(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    title: &str,
) -> Result<(), AppError> {
    let title = title.to_owned();
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(r#"UPDATE "chat_conversation" SET title=$1,"updatedAt"=NOW() WHERE id=$2"#)
            .bind(&title)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await
}

pub async fn touch_conversation(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(r#"UPDATE "chat_conversation" SET "updatedAt"=NOW() WHERE id=$1"#)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await
}

pub async fn delete_conversation(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(r#"DELETE FROM "chat_conversation" WHERE id=$1"#)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await
}

// ── Messages ──────────────────────────────────────────────────────────────────

pub async fn append_message(
    pool: &PgPool,
    org: Uuid,
    input: InsertMessage,
) -> Result<ChatMessageRow, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, ChatMessageRow>(
            r#"INSERT INTO "chat_message"
               ("id","conversationId","organizationId","role","content",
                "toolCalls","toolResults","createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
               RETURNING *"#,
        )
        .bind(input.id)
        .bind(input.conversation_id)
        .bind(input.organization_id)
        .bind(&input.role)
        .bind(&input.content)
        .bind(&input.tool_calls)
        .bind(&input.tool_results)
        .fetch_one(&mut **tx)
        .await
    })
    .await
}

pub async fn get_messages(
    pool: &PgPool,
    org: Uuid,
    conversation_id: Uuid,
) -> Result<Vec<ChatMessageRow>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as::<_, ChatMessageRow>(
            r#"SELECT * FROM "chat_message"
               WHERE "conversationId"=$1 ORDER BY "createdAt" ASC"#,
        )
        .bind(conversation_id)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

// Trunca mensajes posteriores a `message_id` y devuelve las canvas_ops a deshacer.
pub async fn prune_after(
    pool: &PgPool,
    org: Uuid,
    conversation_id: Uuid,
    message_id: Uuid,
) -> Result<PruneResult, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let ref_ts: Option<PrimitiveDateTime> = sqlx::query_scalar(
            r#"SELECT "createdAt" FROM "chat_message" WHERE id=$1 AND "conversationId"=$2"#,
        )
        .bind(message_id)
        .bind(conversation_id)
        .fetch_optional(&mut **tx)
        .await?;

        let Some(ref_ts) = ref_ts else {
            return Ok(PruneResult {
                pruned: 0,
                canvas_ops_to_undo: vec![],
            });
        };

        let tool_calls_rows: Vec<Option<serde_json::Value>> = sqlx::query_scalar(
            r#"SELECT "toolCalls" FROM "chat_message"
               WHERE "conversationId"=$1 AND "createdAt" > $2 AND role='assistant'"#,
        )
        .bind(conversation_id)
        .bind(ref_ts)
        .fetch_all(&mut **tx)
        .await?;

        let canvas_ops_to_undo = extract_canvas_ops_to_undo(tool_calls_rows);

        let res = sqlx::query(
            r#"DELETE FROM "chat_message" WHERE "conversationId"=$1 AND "createdAt" > $2"#,
        )
        .bind(conversation_id)
        .bind(ref_ts)
        .execute(&mut **tx)
        .await?;

        Ok(PruneResult {
            pruned: res.rows_affected() as i64,
            canvas_ops_to_undo,
        })
    })
    .await
}

fn extract_canvas_ops_to_undo(rows: Vec<Option<serde_json::Value>>) -> Vec<CanvasOp> {
    let add_ops = [
        "add_widget",
        "add_shape",
        "add_text",
        "add_note",
        "add_insight",
    ];
    rows.into_iter()
        .flatten()
        .filter_map(|v| v.as_array().cloned())
        .flatten()
        .filter_map(|tc| {
            let name = tc["name"].as_str()?;
            if !add_ops.contains(&name) {
                return None;
            }
            Some(CanvasOp::from_tool_call(name, &tc["args"]))
        })
        .collect()
}

// ── Usage ─────────────────────────────────────────────────────────────────────

pub async fn record_usage(
    pool: &PgPool,
    org: Uuid,
    input: RecordUsageInput,
) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(
            r#"INSERT INTO "ai_usage"
               ("id","organizationId","userId","conversationId","provider","model",
                "inputTokens","outputTokens","costEur","aborted","createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())"#,
        )
        .bind(input.id)
        .bind(input.organization_id)
        .bind(input.user_id)
        .bind(input.conversation_id)
        .bind(&input.provider)
        .bind(&input.model)
        .bind(input.input_tokens)
        .bind(input.output_tokens)
        .bind(input.cost_eur)
        .bind(input.aborted)
        .execute(&mut **tx)
        .await
        .map(|_| ())
    })
    .await
}

pub async fn get_conversation_usage(
    pool: &PgPool,
    org: Uuid,
    conversation_id: Uuid,
) -> Result<ConversationUsage, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row: (Option<i64>, Option<i64>, Option<Decimal>, i64) = sqlx::query_as(
            r#"SELECT
                 SUM("inputTokens")::bigint,
                 SUM("outputTokens")::bigint,
                 SUM("costEur"),
                 COUNT(*)::bigint
               FROM "ai_usage"
               WHERE "conversationId"=$1"#,
        )
        .bind(conversation_id)
        .fetch_one(&mut **tx)
        .await?;

        Ok(ConversationUsage {
            total: UsageSummary {
                input_tokens: row.0.unwrap_or(0),
                output_tokens: row.1.unwrap_or(0),
                cost_eur: row.2.unwrap_or(Decimal::ZERO).to_string(),
            },
            turns: row.3,
        })
    })
    .await
}

pub async fn get_org_usage(
    pool: &PgPool,
    org: Uuid,
    from: Option<OffsetDateTime>,
    to: Option<OffsetDateTime>,
) -> Result<OrgUsageSummary, AppError> {
    let from_dt = from.map(|t| PrimitiveDateTime::new(t.date(), t.time()));
    let to_dt = to.map(|t| PrimitiveDateTime::new(t.date(), t.time()));

    with_tenant_tx(pool, org, async move |tx, _after| {
        let totals: (Option<i64>, Option<i64>, Option<Decimal>) = sqlx::query_as(
            r#"SELECT SUM("inputTokens")::bigint, SUM("outputTokens")::bigint, SUM("costEur")
               FROM "ai_usage"
               WHERE ($1::timestamp IS NULL OR "createdAt" >= $1)
                 AND ($2::timestamp IS NULL OR "createdAt" <= $2)"#,
        )
        .bind(from_dt)
        .bind(to_dt)
        .fetch_one(&mut **tx)
        .await?;

        let by_model: Vec<(String, Option<Decimal>, i64)> = sqlx::query_as(
            r#"SELECT model, SUM("costEur"), COUNT(*)::bigint
               FROM "ai_usage"
               WHERE ($1::timestamp IS NULL OR "createdAt" >= $1)
                 AND ($2::timestamp IS NULL OR "createdAt" <= $2)
               GROUP BY model"#,
        )
        .bind(from_dt)
        .bind(to_dt)
        .fetch_all(&mut **tx)
        .await?;

        let by_model = by_model
            .into_iter()
            .map(|(model, cost, turns)| {
                let provider = if model.starts_with("claude") {
                    "anthropic"
                } else {
                    "openai"
                };
                OrgUsageByModel {
                    model: model.clone(),
                    provider: provider.to_owned(),
                    cost_eur: cost.unwrap_or(Decimal::ZERO).to_string(),
                    turns,
                }
            })
            .collect();

        Ok(OrgUsageSummary {
            total_cost_eur: totals.2.unwrap_or(Decimal::ZERO).to_string(),
            total_input_tokens: totals.0.unwrap_or(0),
            total_output_tokens: totals.1.unwrap_or(0),
            by_model,
        })
    })
    .await
}
