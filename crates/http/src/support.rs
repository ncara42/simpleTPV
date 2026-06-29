//! Soporte con escalado a humano (Ayuda) — sistema de TICKETS. Cualquier rol
//! autenticado. Cada ticket tiene número, título (= primer mensaje del usuario),
//! estado abierto/cerrado y su propio tema de foro en Telegram.
//!
//! Flujo: el usuario abre un ticket → la IA triagea con conocimiento del producto.
//! Si puede, responde; si no, escala a Telegram (modo `human`). Soporte responde en
//! el tema del ticket → el webhook persiste la respuesta como `agent` y la publica
//! por el bus de eventos (`support.message`) → aparece en la web en vivo. Cierre:
//! por el usuario, por soporte (`/cerrar` en el tema) o auto a las 24h de inactividad.

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use simpletpv_ai::event::{ChatMessage, ContentBlock};
use simpletpv_ai::{stream_chat, AiConfig, ChatRequest, Effort, LlmEvent};
use simpletpv_domain::support::{
    self, Author, InsertSupportMessage, Mode, SupportConversationRow, SupportMessageRow,
};
use simpletpv_shared::AppError;
use simpletpv_telegram::TelegramClient;
use uuid::Uuid;

use crate::error::ApiError;
use crate::events::AppEvent;
use crate::extractor::AuthUser;
use crate::state::AppState;

const TELEGRAM_SECRET_HEADER: &str = "x-telegram-bot-api-secret-token";
const MAX_MESSAGE_CHARS: usize = 4000;
/// Aviso que ve el usuario en la web cuando su consulta se deriva a una persona.
const ESCALATION_NOTICE: &str = "He pasado tu consulta a nuestro equipo de soporte. \
Te responderemos por aquí en cuanto la revisemos. También puedes escribirnos por los \
canales de contacto de más abajo si lo prefieres.";

// ── Tipos de request/response ────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct MessageBody {
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnResult {
    /// True si el turno se derivó a soporte humano.
    pub escalated: bool,
    /// `ai` o `human`: estado del ticket tras el turno.
    pub mode: String,
    /// Texto a mostrar (respuesta de la IA o aviso de escalado). Ausente en modo
    /// humano puro (la persona responderá vía SSE).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedTicket {
    pub ticket: SupportConversationRow,
    #[serde(flatten)]
    pub turn: TurnResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketThread {
    pub ticket: SupportConversationRow,
    pub messages: Vec<SupportMessageRow>,
}

#[derive(Serialize)]
pub struct TicketList {
    pub tickets: Vec<SupportConversationRow>,
}

// ── GET /support/tickets ─────────────────────────────────────────────────────────

pub async fn list_tickets(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<TicketList>, ApiError> {
    let tickets = support::list_tickets(state.db(), user.organization_id, user.user_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(TicketList { tickets }))
}

// ── POST /support/tickets ────────────────────────────────────────────────────────

pub async fn create_ticket(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<MessageBody>,
) -> Result<Response, ApiError> {
    let message = clean_message(&body.message)?;
    let org = user.organization_id;
    let pool = state.db();

    let ticket = support::create_ticket(pool, org, user.user_id, &message)
        .await
        .map_err(ApiError::from)?;

    // El primer mensaje es el título Y el primer mensaje (en la web se pinta solo
    // como título, no se repite como burbuja).
    persist_message(
        pool,
        org,
        &ticket,
        Author::User,
        Some(user.user_id),
        &message,
        None,
    )
    .await
    .map_err(ApiError::from)?;

    let turn = handle_user_turn(&state, pool, org, &ticket, &message).await;
    Ok(Json(CreatedTicket { ticket, turn }).into_response())
}

// ── POST /support/tickets/{id}/messages ──────────────────────────────────────────

pub async fn send_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<MessageBody>,
) -> Result<Json<TurnResult>, ApiError> {
    let message = clean_message(&body.message)?;
    let org = user.organization_id;
    let pool = state.db();

    let ticket = get_owned_ticket(pool, org, user.user_id, id).await?;
    // Ticket cerrado = solo lectura: para seguir, el usuario abre uno nuevo.
    if ticket.status == "closed" {
        return Err(AppError::Conflict.into());
    }

    persist_message(
        pool,
        org,
        &ticket,
        Author::User,
        Some(user.user_id),
        &message,
        None,
    )
    .await
    .map_err(ApiError::from)?;

    let turn = handle_user_turn(&state, pool, org, &ticket, &message).await;
    Ok(Json(turn))
}

// ── GET /support/tickets/{id}/messages ───────────────────────────────────────────

pub async fn get_ticket_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TicketThread>, ApiError> {
    let org = user.organization_id;
    let pool = state.db();
    let ticket = get_owned_ticket(pool, org, user.user_id, id).await?;
    let messages = support::get_messages(pool, org, id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(TicketThread { ticket, messages }))
}

// ── POST /support/tickets/{id}/close ─────────────────────────────────────────────

pub async fn close_ticket(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let org = user.organization_id;
    let ticket = get_owned_ticket(state.db(), org, user.user_id, id).await?;
    support::close_ticket(state.db(), org, id)
        .await
        .map_err(ApiError::from)?;
    // Avisar en el tema de Telegram (best-effort).
    if let (Some(topic), Some(tg)) = (ticket.telegram_topic_id, state.telegram()) {
        let _ = tg
            .send_message(Some(topic), "🔒 Ticket cerrado por el usuario.")
            .await;
    }
    state.events().publish(
        org,
        AppEvent {
            event_type: "support.closed".to_owned(),
            data: json!({ "ticketId": id }),
        },
    );
    Ok(StatusCode::NO_CONTENT)
}

// ── POST /telegram/webhook (público, validado por secreto) ─────────────────────────

pub async fn telegram_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(update): Json<simpletpv_telegram::Update>,
) -> StatusCode {
    let Some(tg) = state.telegram() else {
        return StatusCode::OK;
    };
    let provided = headers
        .get(TELEGRAM_SECRET_HEADER)
        .and_then(|v| v.to_str().ok());
    if provided != Some(tg.config().webhook_secret.as_str()) {
        return StatusCode::UNAUTHORIZED;
    }

    let Some(msg) = update.message else {
        return StatusCode::OK;
    };
    if msg.is_from_bot() {
        return StatusCode::OK;
    }
    let (Some(thread_id), Some(text)) = (msg.message_thread_id, msg.text_trimmed()) else {
        return StatusCode::OK;
    };

    let found = support::find_ticket_by_topic(state.admin_db(), thread_id)
        .await
        .ok()
        .flatten();
    let Some((org, ticket_id, _mode, status)) = found else {
        return StatusCode::OK;
    };

    // /cerrar: soporte cierra el ticket desde Telegram.
    if text.starts_with("/cerrar") {
        let _ = support::close_ticket(state.db(), org, ticket_id).await;
        let _ = tg.send_message(Some(thread_id), "✅ Ticket cerrado.").await;
        state.events().publish(
            org,
            AppEvent {
                event_type: "support.closed".to_owned(),
                data: json!({ "ticketId": ticket_id }),
            },
        );
        return StatusCode::OK;
    }

    let message_id = Uuid::new_v4();
    let stored = support::append_message(
        state.db(),
        org,
        InsertSupportMessage {
            id: message_id,
            conversation_id: ticket_id,
            organization_id: org,
            author: Author::Agent,
            author_user_id: None,
            body: text.to_owned(),
            telegram_message_id: Some(msg.message_id),
        },
    )
    .await;
    if stored.is_err() {
        return StatusCode::OK;
    }
    // Una persona ha intervenido: si el ticket estaba cerrado, se reabre; si no,
    // queda en modo humano.
    if status == "closed" {
        let _ = support::reopen_ticket(state.db(), org, ticket_id).await;
    } else {
        let _ = support::set_mode(state.db(), org, ticket_id, Mode::Human).await;
    }

    state.events().publish(
        org,
        AppEvent {
            event_type: "support.message".to_owned(),
            data: json!({
                "ticketId": ticket_id,
                "messageId": message_id,
                "author": "agent",
                "body": text,
            }),
        },
    );
    StatusCode::OK
}

// ── Turno del usuario: triage IA o reenvío a humano ───────────────────────────────

/// Procesa un mensaje del usuario sobre `ticket`: si el ticket está en modo humano
/// lo reenvía a Telegram; si no, la IA triagea (responde o escala). Devuelve el
/// resultado a servir en la web.
async fn handle_user_turn(
    state: &AppState,
    pool: &sqlx::PgPool,
    org: Uuid,
    ticket: &SupportConversationRow,
    user_message: &str,
) -> TurnResult {
    if Mode::from_db(&ticket.mode) == Mode::Human {
        forward_to_support(state, pool, org, ticket, user_message, None).await;
        return TurnResult {
            escalated: true,
            mode: "human".to_owned(),
            reply: None,
        };
    }

    let Some(ai) = state.ai() else {
        let notice = escalate(state, pool, org, ticket, user_message, None).await;
        return TurnResult {
            escalated: true,
            mode: "human".to_owned(),
            reply: Some(notice),
        };
    };

    let history = support::get_messages(pool, org, ticket.id)
        .await
        .unwrap_or_default();
    let org_name = simpletpv_domain::chat::load_org_context(pool, org)
        .await
        .ok()
        .map(|c| c.name);
    let req = ChatRequest {
        model: support_model(),
        effort: Effort::Low,
        messages: build_messages(&history),
        tools: vec![escalate_tool()],
        system: build_support_prompt(org_name.as_deref()),
    };

    match run_triage(ai, req).await {
        Triage::Answer(text) => {
            let _ = persist_message(pool, org, ticket, Author::Ai, None, &text, None).await;
            TurnResult {
                escalated: false,
                mode: "ai".to_owned(),
                reply: Some(text),
            }
        }
        Triage::Escalate { summary } => {
            let notice = escalate(state, pool, org, ticket, user_message, Some(summary)).await;
            TurnResult {
                escalated: true,
                mode: "human".to_owned(),
                reply: Some(notice),
            }
        }
        Triage::Failed => {
            let notice = escalate(state, pool, org, ticket, user_message, None).await;
            TurnResult {
                escalated: true,
                mode: "human".to_owned(),
                reply: Some(notice),
            }
        }
    }
}

/// Escala el ticket: asegura su tema de Telegram, reenvía la consulta, marca modo
/// humano y persiste el aviso para el usuario. Devuelve el aviso.
async fn escalate(
    state: &AppState,
    pool: &sqlx::PgPool,
    org: Uuid,
    ticket: &SupportConversationRow,
    user_message: &str,
    summary: Option<String>,
) -> String {
    forward_to_support(state, pool, org, ticket, user_message, summary).await;
    let _ = support::set_mode(pool, org, ticket.id, Mode::Human).await;
    let _ = persist_message(pool, org, ticket, Author::Ai, None, ESCALATION_NOTICE, None).await;
    ESCALATION_NOTICE.to_owned()
}

/// Envía el mensaje del usuario al tema de Telegram del ticket (creándolo si no
/// existe). Best-effort: registra y sigue si Telegram falla o no está configurado.
async fn forward_to_support(
    state: &AppState,
    pool: &sqlx::PgPool,
    org: Uuid,
    ticket: &SupportConversationRow,
    user_message: &str,
    summary: Option<String>,
) {
    let Some(tg) = state.telegram() else {
        tracing::warn!(%org, "escalado de soporte sin Telegram configurado: no se notifica");
        return;
    };
    let Some(thread_id) = ensure_topic(pool, org, ticket, tg).await else {
        return;
    };
    let text = match summary {
        Some(s) if !s.trim().is_empty() => {
            format!("💬 {user_message}\n\n🤖 Resumen del asistente: {s}")
        }
        _ => format!("💬 {user_message}"),
    };
    if let Err(e) = tg.send_message(Some(thread_id), &text).await {
        tracing::error!(%org, error = %e, "fallo enviando mensaje de soporte a Telegram");
    }
}

/// Devuelve el `message_thread_id` del ticket, creando el tema de foro la primera
/// vez. Nombre del tema: «#N · título · comercio».
async fn ensure_topic(
    pool: &sqlx::PgPool,
    org: Uuid,
    ticket: &SupportConversationRow,
    tg: &TelegramClient,
) -> Option<i64> {
    if let Some(t) = ticket.telegram_topic_id {
        return Some(t);
    }
    let org_name = simpletpv_domain::chat::load_org_context(pool, org)
        .await
        .ok()
        .map(|c| c.name)
        .unwrap_or_else(|| format!("Cliente {org}"));
    let title = ticket.title.as_deref().unwrap_or("Consulta");
    let name = format!("#{} · {title} · {org_name}", ticket.number.unwrap_or(0));
    match tg.create_forum_topic(&name).await {
        Ok(topic_id) => {
            let _ = support::set_topic(pool, org, ticket.id, topic_id).await;
            Some(topic_id)
        }
        Err(e) => {
            tracing::error!(%org, error = %e, "fallo creando tema de foro en Telegram");
            None
        }
    }
}

/// Inserta un mensaje del ticket. Pequeño wrapper sobre el servicio para no repetir
/// la construcción del `InsertSupportMessage` en cada sitio.
async fn persist_message(
    pool: &sqlx::PgPool,
    org: Uuid,
    ticket: &SupportConversationRow,
    author: Author,
    author_user_id: Option<Uuid>,
    body: &str,
    telegram_message_id: Option<i64>,
) -> Result<SupportMessageRow, AppError> {
    support::append_message(
        pool,
        org,
        InsertSupportMessage {
            id: Uuid::new_v4(),
            conversation_id: ticket.id,
            organization_id: org,
            author,
            author_user_id,
            body: body.to_owned(),
            telegram_message_id,
        },
    )
    .await
}

/// Obtiene un ticket comprobando que pertenece al usuario (tickets por usuario): un
/// usuario no puede ver/escribir/cerrar tickets de otro de su misma organización. Si
/// el ticket es de otro, responde 404 (no se filtra su existencia). `author_user_id`
/// None = legacy: se permite dentro de la organización.
async fn get_owned_ticket(
    pool: &sqlx::PgPool,
    org: Uuid,
    user_id: Uuid,
    id: Uuid,
) -> Result<SupportConversationRow, ApiError> {
    let ticket = support::get_ticket(pool, org, id)
        .await
        .map_err(ApiError::from)?;
    if ticket.author_user_id.is_some_and(|a| a != user_id) {
        return Err(AppError::NotFound.into());
    }
    Ok(ticket)
}

fn clean_message(raw: &str) -> Result<String, ApiError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest.into());
    }
    Ok(trimmed.chars().take(MAX_MESSAGE_CHARS).collect())
}

// ── Triage con la IA ───────────────────────────────────────────────────────────

enum Triage {
    Answer(String),
    Escalate { summary: String },
    Failed,
}

async fn run_triage(ai: &AiConfig, req: ChatRequest) -> Triage {
    let stream = match stream_chat(ai, req) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "fallo iniciando el triage de soporte");
            return Triage::Failed;
        }
    };
    tokio::pin!(stream);

    let mut text = String::new();
    let mut escalate_summary: Option<String> = None;
    while let Some(ev) = stream.next().await {
        match ev {
            Ok(LlmEvent::Token(t)) => text.push_str(&t),
            Ok(LlmEvent::ToolCall(tc)) if tc.name == "escalar_a_humano" => {
                let summary = tc
                    .args
                    .get("resumen")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_owned();
                escalate_summary = Some(summary);
            }
            Ok(_) => {}
            Err(e) => {
                tracing::error!(error = %e, "error del proveedor durante el triage de soporte");
                return Triage::Failed;
            }
        }
    }

    if let Some(summary) = escalate_summary {
        Triage::Escalate { summary }
    } else if text.trim().is_empty() {
        Triage::Failed
    } else {
        Triage::Answer(text)
    }
}

fn support_model() -> String {
    std::env::var("SUPPORT_MODEL")
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "gpt-4.1-mini".to_owned())
}

fn escalate_tool() -> serde_json::Value {
    json!({
        "type": "function",
        "function": {
            "name": "escalar_a_humano",
            "description": "Deriva la consulta al equipo de soporte humano. Úsala SOLO cuando NO puedas resolver tú: incidencias técnicas, errores o bugs del producto, datos que el usuario ve incorrectos, problemas de cuenta o facturación, peticiones que exigen que intervengamos nosotros, o cualquier asunto fuera de tu conocimiento del producto. NO la uses para preguntas de uso normales que puedas contestar con tu conocimiento.",
            "parameters": {
                "type": "object",
                "properties": {
                    "resumen": {
                        "type": "string",
                        "description": "Resumen en una frase del problema del usuario, para el equipo de soporte."
                    }
                },
                "required": ["resumen"]
            }
        }
    })
}

fn build_support_prompt(org_name: Option<&str>) -> String {
    let who = org_name
        .map(|n| format!(" del comercio «{n}»"))
        .unwrap_or_default();
    format!(
        "Eres el asistente de soporte de SimpleTPV, un TPV multitienda. Atiendes a un usuario{who} \
en la sección de Ayuda. Hablas en español de España (tuteo), con respuestas breves, claras y \
accionables.\n\n\
TU CONOCIMIENTO DEL PRODUCTO (resuelve con esto cuando aplique):\n\
- Alta de productos: Catálogo › «Nuevo producto». Carga masiva con «Importar CSV» (columnas name, salePrice, sku, barcode).\n\
- Familias: en Familias se crean familias y subfamilias, se marcan arquetipos, se reordena arrastrando y se mueven productos entre nodos.\n\
- Stock inicial: Stock › «Importar CSV»; existencias y mínimos por tienda se ajustan pulsando el contador de stock de un producto.\n\
- Traspasos entre tiendas: Stock › Traspasos (origen, destino y líneas; marcar como enviado para que la tienda destino lo reciba).\n\
- Ventas y márgenes: el Dashboard resume ventas, beneficio y comparativas; en Ventas está el detalle filtrable y exportable a CSV.\n\
- Usuarios y permisos: en Usuarios. Tres roles: Admin (todo), Responsable (su tienda) y Dependiente (venta en el TPV).\n\
- API keys: en Ayuda › Integraciones se generan claves de acceso externo de solo lectura al stock; se muestran una sola vez y son revocables.\n\
- Pedido mayorista B2B: en Mayorista se da de alta el cliente y su tarifa y se crea el pedido (precio por línea congelado desde la tarifa).\n\n\
REGLAS:\n\
1. Si puedes resolver la duda con tu conocimiento del producto, responde directamente y con concreción (di a qué sección ir y qué pulsar).\n\
2. Si NO puedes resolverla —incidencia técnica, error/bug, datos incorrectos, problema de cuenta o facturación, o algo que requiera que intervengamos— llama a la herramienta `escalar_a_humano` con un resumen. No inventes soluciones ni prometas plazos.\n\
3. No pidas datos sensibles (contraseñas, tokens). Sé honesto sobre lo que no sabes."
    )
}

/// Mapea el historial del ticket a mensajes del LLM. `user` → user; `ai` y `agent`
/// → assistant, para que la IA tenga todo el contexto.
fn build_messages(history: &[SupportMessageRow]) -> Vec<ChatMessage> {
    history
        .iter()
        .map(|m| {
            let block = vec![ContentBlock {
                kind: "text".to_owned(),
                text: m.body.clone(),
            }];
            if m.author == "user" {
                ChatMessage::User { content: block }
            } else {
                ChatMessage::Assistant {
                    content: block,
                    tool_calls: None,
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn msg(author: &str, body: &str) -> SupportMessageRow {
        SupportMessageRow {
            id: Uuid::nil(),
            conversation_id: Uuid::nil(),
            organization_id: Uuid::nil(),
            author: author.to_owned(),
            author_user_id: None,
            body: body.to_owned(),
            telegram_message_id: None,
            created_at: datetime!(2026-06-29 10:00:00),
        }
    }

    #[test]
    fn build_messages_mapea_autores() {
        let history = [
            msg("user", "hola"),
            msg("ai", "hey"),
            msg("agent", "soy soporte"),
        ];
        let mapped = build_messages(&history);
        assert!(matches!(mapped[0], ChatMessage::User { .. }));
        assert!(matches!(mapped[1], ChatMessage::Assistant { .. }));
        assert!(matches!(mapped[2], ChatMessage::Assistant { .. }));
    }

    #[test]
    fn escalate_tool_tiene_estructura_valida() {
        let t = escalate_tool();
        assert_eq!(t["function"]["name"], "escalar_a_humano");
        assert!(t["function"]["parameters"]["required"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v == "resumen"));
    }

    #[test]
    fn clean_message_recorta_y_rechaza_vacio() {
        assert!(clean_message("   ").is_err());
        assert_eq!(clean_message("  hola  ").ok(), Some("hola".to_owned()));
    }
}
