//! Soporte con escalado a humano (Ayuda). Disponible a cualquier rol autenticado.
//!
//! Flujo: el usuario escribe → la IA triagea con conocimiento del producto. Si
//! puede, responde; si no, llama a la tool `escalar_a_humano` y la conversación
//! pasa a modo `human`: el mensaje se reenvía al tema de Telegram de ese cliente.
//! Soporte responde en el tema → el webhook (`POST /telegram/webhook`) persiste la
//! respuesta como autor `agent` y la publica por el bus de eventos (`/events`),
//! apareciendo en la web como un mensaje más del asistente.
//!
//! "Chat por cliente": UNA conversación por organización, con historial completo
//! en ambos lados (web y tema de Telegram).

use axum::extract::State;
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

// ── POST /support/chat ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SupportChatBody {
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportChatResponse {
    /// True si la consulta se derivó a soporte humano (modo `human`).
    pub escalated: bool,
    /// `ai` o `human`: estado de la conversación tras este turno.
    pub mode: String,
    /// Texto a mostrar como respuesta del asistente (respuesta de la IA o aviso de
    /// escalado). Ausente en modo `human` puro (la persona responderá vía SSE).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply: Option<String>,
    pub conversation_id: Uuid,
}

pub async fn chat(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SupportChatBody>,
) -> Result<Response, ApiError> {
    let message = body.message.trim();
    if message.is_empty() {
        return Err(AppError::BadRequest.into());
    }
    let message: String = message.chars().take(MAX_MESSAGE_CHARS).collect();

    let org = user.organization_id;
    let uid = user.user_id;
    let pool = state.db();

    let conv = support::get_or_create_conversation(pool, org)
        .await
        .map_err(ApiError::from)?;

    // Persistir el mensaje del usuario.
    support::append_message(
        pool,
        org,
        InsertSupportMessage {
            id: Uuid::new_v4(),
            conversation_id: conv.id,
            organization_id: org,
            author: Author::User,
            author_user_id: Some(uid),
            body: message.clone(),
            telegram_message_id: None,
        },
    )
    .await
    .map_err(ApiError::from)?;

    let mode = Mode::from_db(&conv.mode);

    // Modo humano: ya hay una persona al cargo. El mensaje va directo a su tema de
    // Telegram; la IA no se entromete.
    if mode == Mode::Human {
        forward_to_support(&state, pool, org, &conv, &message, None).await;
        return Ok(Json(SupportChatResponse {
            escalated: true,
            mode: "human".to_owned(),
            reply: None,
            conversation_id: conv.id,
        })
        .into_response());
    }

    // Modo IA: triage. Sin IA configurada, escalamos directamente.
    let Some(ai) = state.ai() else {
        return Ok(escalate(&state, pool, org, &conv, &message, None)
            .await
            .into_response());
    };

    let history = support::get_messages(pool, org, conv.id)
        .await
        .map_err(ApiError::from)?;
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
            // La IA resolvió: persistimos su respuesta y la devolvemos.
            support::append_message(
                pool,
                org,
                InsertSupportMessage {
                    id: Uuid::new_v4(),
                    conversation_id: conv.id,
                    organization_id: org,
                    author: Author::Ai,
                    author_user_id: None,
                    body: text.clone(),
                    telegram_message_id: None,
                },
            )
            .await
            .map_err(ApiError::from)?;
            Ok(Json(SupportChatResponse {
                escalated: false,
                mode: "ai".to_owned(),
                reply: Some(text),
                conversation_id: conv.id,
            })
            .into_response())
        }
        Triage::Escalate { summary } => {
            Ok(escalate(&state, pool, org, &conv, &message, Some(summary))
                .await
                .into_response())
        }
        // Fallo del proveedor: mejor escalar a humano que dejar al usuario colgado.
        Triage::Failed => Ok(escalate(&state, pool, org, &conv, &message, None)
            .await
            .into_response()),
    }
}

// ── GET /support/messages ────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportThread {
    pub conversation: SupportConversationRow,
    pub messages: Vec<SupportMessageRow>,
}

pub async fn get_messages(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<SupportThread>, ApiError> {
    let org = user.organization_id;
    let pool = state.db();
    let conversation = support::get_or_create_conversation(pool, org)
        .await
        .map_err(ApiError::from)?;
    let messages = support::get_messages(pool, org, conversation.id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(SupportThread {
        conversation,
        messages,
    }))
}

// ── POST /telegram/webhook (público, validado por secreto) ─────────────────────────

pub async fn telegram_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(update): Json<simpletpv_telegram::Update>,
) -> StatusCode {
    // Sin Telegram configurado, ignoramos en silencio (200 para que Telegram no reintente).
    let Some(tg) = state.telegram() else {
        return StatusCode::OK;
    };
    // Anti-spoofing: el secreto de la cabecera debe casar con el configurado.
    let provided = headers
        .get(TELEGRAM_SECRET_HEADER)
        .and_then(|v| v.to_str().ok());
    if provided != Some(tg.config().webhook_secret.as_str()) {
        return StatusCode::UNAUTHORIZED;
    }

    let Some(msg) = update.message else {
        return StatusCode::OK;
    };
    // Ignoramos el eco de nuestros propios envíos y los mensajes sin texto.
    if msg.is_from_bot() {
        return StatusCode::OK;
    }
    let (Some(thread_id), Some(text)) = (msg.message_thread_id, msg.text_trimmed()) else {
        return StatusCode::OK;
    };

    // Lookup pre-tenant (BYPASSRLS): el tema nos da la organización.
    let found = support::find_conversation_by_topic(state.admin_db(), thread_id)
        .await
        .ok()
        .flatten();
    let Some((org, conv_id, _)) = found else {
        return StatusCode::OK;
    };

    // Comando /cerrar: soporte devuelve la conversación al asistente automático.
    if text.starts_with("/cerrar") {
        let _ = support::set_mode(state.db(), org, conv_id, Mode::Ai).await;
        let _ = tg
            .send_message(
                Some(thread_id),
                "✅ Conversación devuelta al asistente automático.",
            )
            .await;
        state.events().publish(
            org,
            AppEvent {
                event_type: "support.closed".to_owned(),
                data: json!({ "conversationId": conv_id }),
            },
        );
        return StatusCode::OK;
    }

    // Respuesta de la persona de soporte: persistir como `agent` y empujar a la web.
    let message_id = Uuid::new_v4();
    let stored = support::append_message(
        state.db(),
        org,
        InsertSupportMessage {
            id: message_id,
            conversation_id: conv_id,
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
    // Una persona ha intervenido → la conversación queda en modo humano.
    let _ = support::set_mode(state.db(), org, conv_id, Mode::Human).await;

    state.events().publish(
        org,
        AppEvent {
            event_type: "support.message".to_owned(),
            data: json!({
                "conversationId": conv_id,
                "messageId": message_id,
                "author": "agent",
                "body": text,
            }),
        },
    );
    StatusCode::OK
}

// ── Lógica de escalado / reenvío ───────────────────────────────────────────────

/// Escala la conversación a soporte humano: asegura el tema de Telegram del cliente,
/// reenvía la consulta (con el resumen de la IA si lo hay), marca modo `human` y
/// persiste el aviso para el usuario. Devuelve la respuesta a servir en la web.
async fn escalate(
    state: &AppState,
    pool: &sqlx::PgPool,
    org: Uuid,
    conv: &SupportConversationRow,
    user_message: &str,
    summary: Option<String>,
) -> Json<SupportChatResponse> {
    forward_to_support(state, pool, org, conv, user_message, summary).await;
    let _ = support::set_mode(pool, org, conv.id, Mode::Human).await;
    // Persistir el aviso como mensaje del asistente para que quede en el historial.
    let _ = support::append_message(
        pool,
        org,
        InsertSupportMessage {
            id: Uuid::new_v4(),
            conversation_id: conv.id,
            organization_id: org,
            author: Author::Ai,
            author_user_id: None,
            body: ESCALATION_NOTICE.to_owned(),
            telegram_message_id: None,
        },
    )
    .await;
    Json(SupportChatResponse {
        escalated: true,
        mode: "human".to_owned(),
        reply: Some(ESCALATION_NOTICE.to_owned()),
        conversation_id: conv.id,
    })
}

/// Envía el mensaje del usuario al tema de Telegram del cliente (creándolo si no
/// existe). Best-effort: registra y sigue si Telegram falla o no está configurado.
async fn forward_to_support(
    state: &AppState,
    pool: &sqlx::PgPool,
    org: Uuid,
    conv: &SupportConversationRow,
    user_message: &str,
    summary: Option<String>,
) {
    let Some(tg) = state.telegram() else {
        tracing::warn!(%org, "escalado de soporte sin Telegram configurado: no se notifica");
        return;
    };
    let Some(thread_id) = ensure_topic(pool, org, conv, tg).await else {
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

/// Devuelve el `message_thread_id` del cliente, creándolo en Telegram la primera vez.
async fn ensure_topic(
    pool: &sqlx::PgPool,
    org: Uuid,
    conv: &SupportConversationRow,
    tg: &TelegramClient,
) -> Option<i64> {
    if let Some(t) = conv.telegram_topic_id {
        return Some(t);
    }
    let name = simpletpv_domain::chat::load_org_context(pool, org)
        .await
        .ok()
        .map(|c| c.name)
        .unwrap_or_else(|| format!("Cliente {org}"));
    match tg.create_forum_topic(&name).await {
        Ok(topic_id) => {
            let _ = support::set_topic(pool, org, conv.id, topic_id).await;
            Some(topic_id)
        }
        Err(e) => {
            tracing::error!(%org, error = %e, "fallo creando tema de foro en Telegram");
            None
        }
    }
}

// ── Triage con la IA ───────────────────────────────────────────────────────────

enum Triage {
    /// La IA resolvió: texto a devolver.
    Answer(String),
    /// La IA pide derivar a humano (con resumen opcional).
    Escalate { summary: String },
    /// Fallo del proveedor o respuesta vacía.
    Failed,
}

/// Ejecuta un único turno de IA y decide: responder o escalar. Consume el stream
/// del proveedor por completo (no es streaming hacia el cliente: el soporte es
/// pregunta-respuesta + seguimiento humano por SSE).
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

/// Modelo para el triage de soporte. `SUPPORT_MODEL` lo fija al despliegue (debe
/// existir en el gateway/proveedor configurado); por defecto un modelo económico.
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

/// System prompt del asistente de soporte. Incluye el conocimiento de producto
/// (espejo de la FAQ de Ayuda) para que resuelva lo común, y la regla de escalado.
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

/// Mapea el historial de soporte a mensajes del LLM. `user` → user; `ai` y `agent`
/// (la persona de soporte) → assistant, para que la IA tenga todo el contexto al
/// reentrar en modo `ai` tras un `/cerrar`.
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
        let ts = datetime!(2026-06-29 10:00:00);
        SupportMessageRow {
            id: Uuid::nil(),
            conversation_id: Uuid::nil(),
            organization_id: Uuid::nil(),
            author: author.to_owned(),
            author_user_id: None,
            body: body.to_owned(),
            telegram_message_id: None,
            created_at: ts,
        }
    }

    #[test]
    fn build_messages_mapea_autores() {
        let history = [
            msg("user", "hola"),
            msg("ai", "¿en qué te ayudo?"),
            msg("agent", "soy del equipo de soporte"),
        ];
        let mapped = build_messages(&history);
        assert!(matches!(mapped[0], ChatMessage::User { .. }));
        // ai y agent (humano) llegan como assistant para dar contexto a la IA.
        assert!(matches!(mapped[1], ChatMessage::Assistant { .. }));
        assert!(matches!(mapped[2], ChatMessage::Assistant { .. }));
    }

    #[test]
    fn escalate_tool_tiene_estructura_valida() {
        let t = escalate_tool();
        assert_eq!(t["type"], "function");
        assert_eq!(t["function"]["name"], "escalar_a_humano");
        assert_eq!(t["function"]["parameters"]["type"], "object");
        assert!(t["function"]["parameters"]["required"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v == "resumen"));
    }

    #[test]
    fn support_prompt_incluye_nombre_y_regla_de_escalado() {
        let p = build_support_prompt(Some("CBD Premium"));
        assert!(p.contains("CBD Premium"));
        assert!(p.contains("escalar_a_humano"));
    }
}
