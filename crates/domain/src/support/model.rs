use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

// Columnas camelCase (convención del repo). `SELECT *`/`RETURNING *` ⇒ `FromRow`
// necesita `#[sqlx(rename)]` para casar snake_case con la columna.
// Una fila de support_conversation = un TICKET de soporte.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SupportConversationRow {
    pub id: Uuid,
    #[serde(rename = "organizationId")]
    #[sqlx(rename = "organizationId")]
    pub organization_id: Uuid,
    /// Número de ticket secuencial dentro de la organización (#1, #2, …).
    pub number: Option<i32>,
    /// Título del ticket (= primer mensaje del usuario).
    pub title: Option<String>,
    /// Usuario que abrió el ticket (la lista de tickets se filtra por él).
    #[serde(rename = "authorUserId")]
    #[sqlx(rename = "authorUserId")]
    pub author_user_id: Option<Uuid>,
    #[serde(rename = "telegramTopicId")]
    #[sqlx(rename = "telegramTopicId")]
    pub telegram_topic_id: Option<i64>,
    pub mode: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "createdAt")]
    pub created_at: PrimitiveDateTime,
    #[serde(rename = "updatedAt")]
    #[sqlx(rename = "updatedAt")]
    pub updated_at: PrimitiveDateTime,
    #[serde(rename = "closedAt")]
    #[sqlx(rename = "closedAt")]
    pub closed_at: Option<PrimitiveDateTime>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SupportMessageRow {
    pub id: Uuid,
    #[serde(rename = "conversationId")]
    #[sqlx(rename = "conversationId")]
    pub conversation_id: Uuid,
    #[serde(rename = "organizationId")]
    #[sqlx(rename = "organizationId")]
    pub organization_id: Uuid,
    /// 'user' | 'ai' | 'agent'.
    pub author: String,
    #[serde(rename = "authorUserId")]
    #[sqlx(rename = "authorUserId")]
    pub author_user_id: Option<Uuid>,
    pub body: String,
    #[serde(rename = "telegramMessageId")]
    #[sqlx(rename = "telegramMessageId")]
    pub telegram_message_id: Option<i64>,
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "createdAt")]
    pub created_at: PrimitiveDateTime,
}

/// Autor de un mensaje de soporte. Tipado para no esparcir strings mágicos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Author {
    User,
    Ai,
    Agent,
}

impl Author {
    pub fn as_str(self) -> &'static str {
        match self {
            Author::User => "user",
            Author::Ai => "ai",
            Author::Agent => "agent",
        }
    }
}

/// Modo de la conversación. `ai` = el agente triagea; `human` = manda soporte.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Ai,
    Human,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Ai => "ai",
            Mode::Human => "human",
        }
    }

    /// Desde el valor de la columna `mode`. No es `FromStr` (no falla: cualquier
    /// valor desconocido degrada a `Ai`).
    pub fn from_db(s: &str) -> Self {
        match s {
            "human" => Mode::Human,
            _ => Mode::Ai,
        }
    }
}

pub struct InsertSupportMessage {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub organization_id: Uuid,
    pub author: Author,
    pub author_user_id: Option<Uuid>,
    pub body: String,
    pub telegram_message_id: Option<i64>,
}
