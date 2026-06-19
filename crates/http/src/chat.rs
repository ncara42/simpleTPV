//! Endpoints del chatbot agente (#188). Requiere ADMIN o MANAGER.
//! Documentación completa del sistema en Desktop/plan-dashboard-chatbot.md.

use std::convert::Infallible;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures::Stream;
use serde::Deserialize;
use simpletpv_ai::{event::Effort, stream_chat, AiConfig, LlmEvent};
use simpletpv_auth::Role;
use simpletpv_domain::chat::{
    self, CanvasOp, InsertConversation, InsertMessage, RecordUsageInput,
};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

// ── Tipos de request / response ───────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChatBody {
    #[serde(default)]
    pub conversation_id: Option<Uuid>,
    pub message: String,
    pub model: String,
    #[serde(default = "default_effort")]
    pub effort: String,
}

fn default_effort() -> String {
    "medium".to_owned()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeBody {
    pub partial_content: Vec<serde_json::Value>,
    pub model: String,
    #[serde(default = "default_effort")]
    pub _effort: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasResultBody {
    pub tool_call_id: String,
    pub accepted: bool,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(default)]
pub struct UsageQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

impl Default for UsageQuery {
    fn default() -> Self {
        Self { from: None, to: None }
    }
}

// ── POST /chat/stream ──────────────────────────────────────────────────────────

pub async fn stream(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<StreamChatBody>,
) -> Result<Response, ApiError> {
    user.require_role(&MGMT_ROLES)?;

    let ai = state.ai().ok_or(ApiError::from(AppError::BadRequest))?;
    let pool = state.db();
    let org = user.organization_id;
    let uid = user.user_id;
    let is_admin = user.role == Role::Admin;

    // Crear o recuperar conversación
    let conv_id = if let Some(id) = body.conversation_id {
        // Verificar que existe y pertenece al usuario
        chat::get_conversation(pool, org, id).await.map_err(ApiError::from)?;
        id
    } else {
        // Nueva conversación — auto-título heurístico
        let title = auto_title(&body.message);
        let new_conv = chat::create_conversation(
            pool,
            org,
            InsertConversation {
                id: Uuid::new_v4(),
                organization_id: org,
                user_id: uid,
                title: Some(title),
            },
        )
        .await
        .map_err(ApiError::from)?;
        new_conv.id
    };

    // Guardar mensaje de usuario
    let user_msg_id = Uuid::new_v4();
    chat::append_message(
        pool,
        org,
        InsertMessage {
            id: user_msg_id,
            conversation_id: conv_id,
            organization_id: org,
            role: "user".to_owned(),
            content: serde_json::json!([{ "type": "text", "text": body.message }]),
            tool_calls: None,
            tool_results: None,
        },
    )
    .await
    .map_err(ApiError::from)?;

    // Cargar historial
    let history = chat::get_messages(pool, org, conv_id)
        .await
        .map_err(ApiError::from)?;

    // Construir ChatRequest
    let effort = parse_effort(&body.effort);
    let tools = if is_admin {
        simpletpv_ai::tools::all_tools_for_admin()
    } else {
        simpletpv_ai::tools::all_tools_for_manager()
    };

    let messages = build_chat_messages(&history);
    let req = simpletpv_ai::event::ChatRequest {
        model: body.model.clone(),
        effort,
        messages,
        tools,
        system: system_prompt(),
    };

    let ai_config = ai.clone();
    let pool_clone = pool.clone();
    let model = body.model.clone();

    // Ejecutar el bucle agente + generar SSE stream
    let sse_stream = run_agent_stream(
        ai_config,
        pool_clone,
        org,
        uid,
        conv_id,
        req,
        is_admin,
        model,
    );

    Ok(Sse::new(sse_stream)
        .keep_alive(KeepAlive::default())
        .into_response())
}

// Bucle agente: hasta MAX_TOOL_ROUNDS iteraciones de LLM → tools → LLM.
fn run_agent_stream(
    ai_config: AiConfig,
    pool: sqlx::PgPool,
    org: Uuid,
    uid: Uuid,
    conv_id: Uuid,
    initial_req: simpletpv_ai::event::ChatRequest,
    is_admin: bool,
    model: String,
) -> impl Stream<Item = Result<Event, Infallible>> {
    async_stream::stream! {
        use futures::StreamExt;
        use simpletpv_ai::pricing::calculate_cost;
        use simpletpv_domain::chat::InsertMessage;

        const MAX_TOOL_ROUNDS: usize = 8;
        let mut req = initial_req;
        let mut total_input = 0u32;
        let mut total_output = 0u32;
        let mut tool_rounds = 0usize;

        loop {
            let llm_stream = match stream_chat(&ai_config, req.clone()) {
                Ok(s) => s,
                Err(e) => {
                    yield Ok(sse_error(&format!("Error iniciando el stream: {e}")));
                    return;
                }
            };

            let mut tokens = String::new();
            let mut tool_calls: Vec<simpletpv_ai::ToolCall> = Vec::new();

            tokio::pin!(llm_stream);
            while let Some(ev) = llm_stream.next().await {
                match ev {
                    Ok(LlmEvent::Token(t)) => {
                        tokens.push_str(&t);
                        yield Ok(Event::default()
                            .event("token")
                            .data(serde_json::json!({ "text": t }).to_string()));
                    }
                    Ok(LlmEvent::Thinking(_)) => {
                        // No se reenvía al frontend (solo para razonamiento interno)
                    }
                    Ok(LlmEvent::ToolCall(tc)) => {
                        yield Ok(Event::default()
                            .event("tool_call")
                            .data(serde_json::json!({
                                "id": tc.id,
                                "name": tc.name,
                                "args": tc.args,
                            })
                            .to_string()));
                        tool_calls.push(tc);
                    }
                    Ok(LlmEvent::Done(usage)) => {
                        total_input += usage.input_tokens;
                        total_output += usage.output_tokens;
                    }
                    Err(e) => {
                        yield Ok(sse_error(&format!("Error del proveedor: {e}")));
                        return;
                    }
                }
            }

            // Guardar mensaje del asistente
            let assistant_msg_id = Uuid::new_v4();
            let tool_calls_json = if tool_calls.is_empty() {
                None
            } else {
                Some(serde_json::to_value(&tool_calls).unwrap_or(serde_json::Value::Null))
            };
            let content_json = serde_json::json!([{ "type": "text", "text": tokens }]);
            let _ = chat::append_message(
                &pool,
                org,
                InsertMessage {
                    id: assistant_msg_id,
                    conversation_id: conv_id,
                    organization_id: org,
                    role: "assistant".to_owned(),
                    content: content_json,
                    tool_calls: tool_calls_json,
                    tool_results: None,
                },
            )
            .await;

            // Si no hay tool calls o se alcanzó el límite → fin del turno
            if tool_calls.is_empty() || tool_rounds >= MAX_TOOL_ROUNDS {
                // Registrar uso
                let cost = calculate_cost(&model, total_input, total_output);
                let _ = chat::record_usage(
                    &pool,
                    org,
                    RecordUsageInput {
                        id: Uuid::new_v4(),
                        organization_id: org,
                        user_id: uid,
                        conversation_id: Some(conv_id),
                        provider: provider_from_model(&model),
                        model: model.clone(),
                        input_tokens: total_input as i32,
                        output_tokens: total_output as i32,
                        cost_eur: cost,
                        aborted: false,
                    },
                )
                .await;

                let _ = chat::touch_conversation(&pool, org, conv_id).await;

                let usage_summary = serde_json::json!({
                    "inputTokens": total_input,
                    "outputTokens": total_output,
                    "costEur": cost.to_string(),
                });
                yield Ok(Event::default()
                    .event("done")
                    .data(
                        serde_json::json!({
                            "messageId": assistant_msg_id,
                            "conversationId": conv_id,
                            "usage": usage_summary,
                        })
                        .to_string(),
                    ));
                return;
            }

            // Ejecutar tools y construir tool_results
            tool_rounds += 1;
            let mut tool_result_msgs: Vec<simpletpv_ai::event::ChatMessage> = Vec::new();

            for tc in &tool_calls {
                // Canvas ops → reenviar al frontend como canvas_op, NO ejecutar en backend
                let canvas_ops = [
                    "add_widget", "add_shape", "add_text", "add_note", "add_insight",
                    "remove_element", "arrange", "set_mode", "clear_canvas",
                ];
                if canvas_ops.contains(&tc.name.as_str()) {
                    let op = CanvasOp {
                        op: tc.name.clone(),
                        element_id: tc.args["element_id"].as_str().map(|s| s.to_owned()),
                        extra: tc.args.clone(),
                    };
                    yield Ok(Event::default()
                        .event("canvas_op")
                        .data(
                            serde_json::json!({
                                "toolCallId": tc.id,
                                "op": op,
                            })
                            .to_string(),
                        ));
                    // El resultado real llega por POST /canvas-result; aquí usamos ACK provisional
                    tool_result_msgs.push(simpletpv_ai::event::ChatMessage::Tool {
                        tool_call_id: tc.id.clone(),
                        content: "canvas_op_pending".to_owned(),
                    });
                    continue;
                }

                // Data tools → ejecutar en backend
                match simpletpv_domain::chat::dispatch_tool(
                    &pool,
                    org,
                    &tc.name,
                    &tc.args,
                    is_admin,
                )
                .await
                {
                    Ok(result) => {
                        tool_result_msgs.push(simpletpv_ai::event::ChatMessage::Tool {
                            tool_call_id: tc.id.clone(),
                            content: result.to_string(),
                        });
                    }
                    Err(e) => {
                        tool_result_msgs.push(simpletpv_ai::event::ChatMessage::Tool {
                            tool_call_id: tc.id.clone(),
                            content: format!("{{\"error\":\"{e}\"}}"),
                        });
                    }
                }
            }

            // Añadir tool_results al historial del request para la siguiente iteración
            req.messages.extend(tool_result_msgs);
        }
    }
}

fn sse_error(msg: &str) -> Event {
    Event::default()
        .event("error")
        .data(serde_json::json!({ "message": msg }).to_string())
}

// ── POST /chat/conversations/:id/finalize ─────────────────────────────────────

pub async fn finalize(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<FinalizeBody>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let pool = state.db();
    let org = user.organization_id;
    let uid = user.user_id;

    // Guardar mensaje parcial con aborted=true
    let msg_id = Uuid::new_v4();
    chat::append_message(
        pool,
        org,
        InsertMessage {
            id: msg_id,
            conversation_id: conv_id,
            organization_id: org,
            role: "assistant".to_owned(),
            content: serde_json::to_value(&body.partial_content)
                .unwrap_or(serde_json::Value::Null),
            tool_calls: None,
            tool_results: None,
        },
    )
    .await
    .map_err(ApiError::from)?;

    // Estimar tokens y registrar usage con aborted=true
    let text_len: usize = body
        .partial_content
        .iter()
        .filter_map(|b| b["text"].as_str())
        .map(|s| s.len())
        .sum();
    let (input_tokens, output_tokens) =
        simpletpv_ai::pricing::estimate_tokens(body.model.len() * 100, text_len);
    let cost = simpletpv_ai::pricing::calculate_cost(&body.model, input_tokens, output_tokens);

    let _ = chat::record_usage(
        pool,
        org,
        RecordUsageInput {
            id: Uuid::new_v4(),
            organization_id: org,
            user_id: uid,
            conversation_id: Some(conv_id),
            provider: provider_from_model(&body.model),
            model: body.model.clone(),
            input_tokens: input_tokens as i32,
            output_tokens: output_tokens as i32,
            cost_eur: cost,
            aborted: true,
        },
    )
    .await;

    chat::touch_conversation(pool, org, conv_id)
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

// ── POST /chat/conversations/:id/canvas-result ────────────────────────────────

pub async fn canvas_result(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<CanvasResultBody>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let pool = state.db();
    let org = user.organization_id;

    // El canvas_result se registra como un tool_result en el último mensaje de tool
    // del assistant. En esta implementación simplificada lo guardamos como mensaje
    // separado de tipo "tool" para que el próximo turno del LLM lo vea en el historial.
    let result_content = serde_json::json!({
        "accepted": body.accepted,
        "reason": body.reason,
    });

    chat::append_message(
        pool,
        org,
        InsertMessage {
            id: Uuid::new_v4(),
            conversation_id: conv_id,
            organization_id: org,
            role: "tool".to_owned(),
            content: result_content.clone(),
            tool_calls: None,
            tool_results: Some(serde_json::json!([{
                "toolCallId": body.tool_call_id,
                "content": result_content,
            }])),
        },
    )
    .await
    .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

// ── DELETE /chat/conversations/:id/after/:message_id ─────────────────────────

pub async fn prune_after(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, message_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<simpletpv_domain::chat::PruneResult>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let result = chat::prune_after(state.db(), user.organization_id, conv_id, message_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(result))
}

// ── GET /chat/conversations ───────────────────────────────────────────────────

pub async fn list_conversations(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<simpletpv_domain::chat::ChatConversationRow>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let convs =
        chat::list_conversations(state.db(), user.organization_id, user.user_id)
            .await
            .map_err(ApiError::from)?;
    Ok(Json(convs))
}

// ── GET /chat/conversations/:id/messages ─────────────────────────────────────

pub async fn get_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
) -> Result<Json<Vec<simpletpv_domain::chat::ChatMessageRow>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let msgs =
        chat::get_messages(state.db(), user.organization_id, conv_id)
            .await
            .map_err(ApiError::from)?;
    Ok(Json(msgs))
}

// ── GET /chat/conversations/:id/usage ────────────────────────────────────────

pub async fn get_conversation_usage(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
) -> Result<Json<simpletpv_domain::chat::ConversationUsage>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let usage =
        chat::get_conversation_usage(state.db(), user.organization_id, conv_id)
            .await
            .map_err(ApiError::from)?;
    Ok(Json(usage))
}

// ── DELETE /chat/conversations/:id ───────────────────────────────────────────

pub async fn delete_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    chat::delete_conversation(state.db(), user.organization_id, conv_id)
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── GET /chat/models ──────────────────────────────────────────────────────────

pub async fn list_models(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<simpletpv_ai::ModelInfo>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let models = simpletpv_ai::available_models()
        .into_iter()
        .filter(|m| {
            // Filtrar por providers configurados
            let ai = state.ai();
            match m.provider {
                "openai" => ai.map(|c| c.openai_key.is_some()).unwrap_or(false),
                "anthropic" => ai.map(|c| c.anthropic_key.is_some()).unwrap_or(false),
                _ => false,
            }
        })
        .collect::<Vec<_>>();
    Ok(Json(models))
}

// ── GET /chat/usage ───────────────────────────────────────────────────────────

pub async fn get_org_usage(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<UsageQuery>,
) -> Result<Json<simpletpv_domain::chat::OrgUsageSummary>, ApiError> {
    user.require_role(&MGMT_ROLES)?;

    let from = q.from.as_deref().and_then(|s| {
        time::Date::parse(s, time::macros::format_description!("[year]-[month]-[day]"))
            .ok()
            .map(|d| {
                time::OffsetDateTime::new_utc(d, time::Time::MIDNIGHT)
            })
    });
    let to = q.to.as_deref().and_then(|s| {
        time::Date::parse(s, time::macros::format_description!("[year]-[month]-[day]"))
            .ok()
            .map(|d| {
                time::OffsetDateTime::new_utc(d, time::Time::MIDNIGHT)
            })
    });

    let usage = chat::get_org_usage(state.db(), user.organization_id, from, to)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(usage))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn parse_effort(s: &str) -> Effort {
    match s {
        "low" => Effort::Low,
        "high" => Effort::High,
        _ => Effort::Medium,
    }
}

fn provider_from_model(model: &str) -> String {
    if model.starts_with("claude") {
        "anthropic".to_owned()
    } else {
        "openai".to_owned()
    }
}

fn auto_title(message: &str) -> String {
    let stop_words = ["el", "la", "los", "las", "un", "una", "de", "del", "en", "a", "y",
        "o", "que", "se", "me", "te", "le", "lo", "es", "por", "con", "para", "como",
        "más", "si", "no", "al", "su", "sus"];
    let words: Vec<&str> = message
        .split_whitespace()
        .filter(|w| w.len() > 2 && !stop_words.contains(&w.to_lowercase().as_str()))
        .take(6)
        .collect();
    if words.is_empty() {
        return format!(
            "Conversación {}",
            time::OffsetDateTime::now_utc()
                .format(time::macros::format_description!("[day]/[month] [hour]:[minute]"))
                .unwrap_or_default()
        );
    }
    let s = words.join(" ");
    let mut c = s.chars();
    match c.next() {
        None => s,
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

fn system_prompt() -> String {
    include_str!("chat_system_prompt.txt").to_owned()
}

fn build_chat_messages(
    rows: &[simpletpv_domain::chat::ChatMessageRow],
) -> Vec<simpletpv_ai::event::ChatMessage> {
    use simpletpv_ai::event::{ChatMessage, ContentBlock, FunctionCall, ToolCallDef};

    rows.iter()
        .map(|row| match row.role.as_str() {
            "user" => {
                let text = row.content[0]["text"]
                    .as_str()
                    .unwrap_or("")
                    .to_owned();
                ChatMessage::User {
                    content: vec![ContentBlock { kind: "text".to_owned(), text }],
                }
            }
            "assistant" => {
                let text = row.content[0]["text"]
                    .as_str()
                    .unwrap_or("")
                    .to_owned();
                let tool_calls = row.tool_calls.as_ref().and_then(|tc| {
                    tc.as_array().map(|arr| {
                        arr.iter()
                            .filter_map(|t| {
                                Some(ToolCallDef {
                                    id: t["id"].as_str()?.to_owned(),
                                    kind: "function".to_owned(),
                                    name: t["name"].as_str()?.to_owned(),
                                    function: FunctionCall {
                                        name: t["name"].as_str()?.to_owned(),
                                        arguments: t["args"].to_string(),
                                    },
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                });
                ChatMessage::Assistant {
                    content: vec![ContentBlock { kind: "text".to_owned(), text }],
                    tool_calls: tool_calls.filter(|tc| !tc.is_empty()),
                }
            }
            "tool" => {
                let tool_call_id = row
                    .tool_results
                    .as_ref()
                    .and_then(|tr| tr[0]["toolCallId"].as_str().map(|s| s.to_owned()))
                    .unwrap_or_default();
                ChatMessage::Tool {
                    tool_call_id,
                    content: row.content.to_string(),
                }
            }
            _ => ChatMessage::User {
                content: vec![ContentBlock {
                    kind: "text".to_owned(),
                    text: row.content.to_string(),
                }],
            },
        })
        .collect()
}
