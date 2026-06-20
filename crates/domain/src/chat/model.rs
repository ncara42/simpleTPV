use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use time::PrimitiveDateTime;
use uuid::Uuid;

// Las columnas en BD son camelCase (convención Prisma); las queries del módulo
// usan `SELECT *`/`RETURNING *`, así que `FromRow` necesita `#[sqlx(rename)]`
// para casar cada campo snake_case con su columna (los `#[serde(rename)]` solo
// afectan a la serialización JSON, no a la decodificación de SQLx).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChatConversationRow {
    pub id: Uuid,
    #[serde(rename = "organizationId")]
    #[sqlx(rename = "organizationId")]
    pub organization_id: Uuid,
    #[serde(rename = "userId")]
    #[sqlx(rename = "userId")]
    pub user_id: Uuid,
    pub title: Option<String>,
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "createdAt")]
    pub created_at: PrimitiveDateTime,
    #[serde(rename = "updatedAt")]
    #[sqlx(rename = "updatedAt")]
    pub updated_at: PrimitiveDateTime,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChatMessageRow {
    pub id: Uuid,
    #[serde(rename = "conversationId")]
    #[sqlx(rename = "conversationId")]
    pub conversation_id: Uuid,
    #[serde(rename = "organizationId")]
    #[sqlx(rename = "organizationId")]
    pub organization_id: Uuid,
    pub role: String,
    pub content: serde_json::Value,
    #[serde(rename = "toolCalls")]
    #[sqlx(rename = "toolCalls")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(rename = "toolResults")]
    #[sqlx(rename = "toolResults")]
    pub tool_results: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "createdAt")]
    pub created_at: PrimitiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct InsertConversation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InsertMessage {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub organization_id: Uuid,
    pub role: String,
    pub content: serde_json::Value,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_results: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    #[serde(rename = "inputTokens")]
    pub input_tokens: i64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: i64,
    #[serde(rename = "costEur")]
    pub cost_eur: String,
}

#[derive(Debug, Serialize)]
pub struct ConversationUsage {
    pub total: UsageSummary,
    pub turns: i64,
}

#[derive(Debug, Serialize)]
pub struct OrgUsageByModel {
    pub model: String,
    pub provider: String,
    #[serde(rename = "costEur")]
    pub cost_eur: String,
    pub turns: i64,
}

#[derive(Debug, Serialize)]
pub struct OrgUsageSummary {
    #[serde(rename = "totalCostEur")]
    pub total_cost_eur: String,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: i64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: i64,
    #[serde(rename = "byModel")]
    pub by_model: Vec<OrgUsageByModel>,
}

// Ops de lienzo que el frontend necesita deshacer al truncar historial.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasOp {
    pub op: String,
    #[serde(rename = "elementId", skip_serializing_if = "Option::is_none")]
    pub element_id: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct PruneResult {
    pub pruned: i64,
    #[serde(rename = "canvasOpsToUndo")]
    pub canvas_ops_to_undo: Vec<CanvasOp>,
}

#[derive(Debug, Deserialize)]
pub struct RecordUsageInput {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub conversation_id: Option<Uuid>,
    pub provider: String,
    pub model: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cost_eur: Decimal,
    pub aborted: bool,
}
