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
use simpletpv_domain::chat::{self, CanvasOp, InsertConversation, InsertMessage, RecordUsageInput};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

/// Nombres de las herramientas de lienzo: el backend las reenvía al frontend como `canvas_op`
/// (no las ejecuta) y, fuera del dashboard, las retira de la lista que ve el LLM.
const CANVAS_OP_NAMES: [&str; 8] = [
    "add_widget",
    "add_shape",
    "add_text",
    "add_note",
    "add_insight",
    "remove_element",
    "arrange",
    "clear_canvas",
];

/// Nombres de las herramientas de pantalla: el backend las reenvía al frontend como `view_action`
/// (no las ejecuta) para actuar sobre la vista actual. Solo se ofrecen fuera del dashboard.
const VIEW_ACTION_NAMES: [&str; 2] = ["highlight_on_view", "filter_view"];

// ── Tipos de request / response ───────────────────────────────────────────────

/// Vista del backoffice donde está el usuario (id + etiqueta del sidebar). Acota el system
/// prompt y, fuera del dashboard, hace que el agente no reciba las herramientas de lienzo.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewContext {
    pub id: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChatBody {
    #[serde(default)]
    pub conversation_id: Option<Uuid>,
    pub message: String,
    pub model: String,
    #[serde(default = "default_effort")]
    pub effort: String,
    /// Estado del lienzo en el momento del mensaje (modo + elementos con id/label). Viaja
    /// fresco desde el frontend en cada mensaje para que el system prompt no use un snapshot
    /// stale. Forma libre: `{ mode, elements: [{ id, label, x?, y? }], totalElements }`.
    #[serde(default)]
    pub canvas_state: Option<serde_json::Value>,
    /// Vista activa del backoffice. Ausente ⇒ se asume dashboard (compatibilidad). Fuera del
    /// dashboard el agente solo informa: se le retiran las herramientas de lienzo.
    #[serde(default)]
    pub view_context: Option<ViewContext>,
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

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct UsageQuery {
    pub from: Option<String>,
    pub to: Option<String>,
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
        chat::get_conversation(pool, org, id)
            .await
            .map_err(ApiError::from)?;
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
    // Solo el Dashboard compone el tablero. Fuera de él (ausencia de vista ⇒ dashboard por
    // compat) el agente solo informa: se le retiran las herramientas de lienzo.
    let is_dashboard = body
        .view_context
        .as_ref()
        .is_none_or(|v| v.id == "dashboard");
    let mut tools = if is_admin {
        simpletpv_ai::tools::all_tools_for_admin()
    } else {
        simpletpv_ai::tools::all_tools_for_manager()
    };
    if !is_dashboard {
        // Fuera del dashboard: el agente no compone el tablero (se retiran las canvas ops) pero sí
        // puede actuar sobre la pantalla actual (scroll/resaltar/filtrar).
        tools.retain(|t| {
            let name = t
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str());
            name.is_none_or(|n| !CANVAS_OP_NAMES.contains(&n))
        });
        tools.extend(simpletpv_ai::tools::view_action_tools());
    }

    // System prompt dinámico (F5): contexto de la organización + catálogo de widgets + tools
    // por rol + allowlist de endpoints + estado actual del lienzo (fresco, del body). Fuera del
    // dashboard se acota a un prompt informativo de la vista activa.
    let org_ctx = chat::load_org_context(pool, org)
        .await
        .map_err(ApiError::from)?;
    let (view_id, view_label) = match body.view_context.as_ref() {
        Some(v) => (Some(v.id.as_str()), Some(v.label.as_str())),
        None => (None, None),
    };
    let system = chat::build_system_prompt(
        &org_ctx,
        is_admin,
        body.canvas_state.as_ref(),
        view_id,
        view_label,
    );

    let messages = build_chat_messages(&history);
    let req = simpletpv_ai::event::ChatRequest {
        model: body.model.clone(),
        effort,
        messages,
        tools,
        system,
    };

    let ai_config = ai.clone();
    let pool_clone = pool.clone();
    let model = body.model.clone();

    // Ejecutar el bucle agente + generar SSE stream
    let sse_stream = run_agent_stream(
        ai_config, pool_clone, org, uid, conv_id, req, is_admin, model,
    );

    let mut response = Sse::new(sse_stream)
        .keep_alive(KeepAlive::default())
        .into_response();
    // Evita que Cloudflare/Nginx bufericen el stream (si no, no llega en vivo).
    crate::events::apply_sse_no_buffer(response.headers_mut());
    Ok(response)
}

// Bucle agente: hasta MAX_TOOL_ROUNDS iteraciones de LLM → tools → LLM.
// Los parámetros son el contexto del turno (pool, tenant, request); agruparlos en
// un struct no aporta claridad sobre pasarlos explícitos.
#[allow(clippy::too_many_arguments)]
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
        // Métrica de calidad del agente v2 (#210): nº de tool-calls e iteraciones por turno, por
        // categoría. Se emiten al cerrar el turno (target `chat_metrics`) para medir sobre sesiones
        // reales el coste de tool-calling de la superficie v2 (block:/gen:panel).
        let mut total_tool_calls = 0usize;
        let mut total_canvas_ops = 0usize;
        let mut total_view_actions = 0usize;
        let mut total_data_tools = 0usize;

        loop {
            let llm_stream = match stream_chat(&ai_config, req.clone()) {
                Ok(s) => s,
                Err(e) => {
                    yield Ok(sse_error(&format!("Error iniciando el stream: {e}")));
                    return;
                }
            };

            let mut tokens = String::new();
            let mut thinking = String::new();
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
                    Ok(LlmEvent::Thinking(t)) => {
                        // Razonamiento del modelo (Anthropic thinking o `reasoning_content` de
                        // gateways OpenAI-compatibles): se reenvía como evento `reasoning` para
                        // pintarlo en el bloque colapsable del frontend y se persiste.
                        thinking.push_str(&t);
                        yield Ok(Event::default()
                            .event("reasoning")
                            .data(serde_json::json!({ "text": t }).to_string()));
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

            total_tool_calls += tool_calls.len();

            // Guardar mensaje del asistente
            let assistant_msg_id = Uuid::new_v4();
            let tool_calls_json = if tool_calls.is_empty() {
                None
            } else {
                Some(serde_json::to_value(&tool_calls).unwrap_or(serde_json::Value::Null))
            };
            // El bloque de razonamiento (si lo hubo) se persiste ANTES del texto, para que el
            // historial lo muestre en el bloque colapsable.
            let content_json = if thinking.is_empty() {
                serde_json::json!([{ "type": "text", "text": tokens }])
            } else {
                serde_json::json!([
                    { "type": "thinking", "text": thinking },
                    { "type": "text", "text": tokens },
                ])
            };
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

                // Métrica de calidad del agente v2 (#210): resumen del turno (iteraciones + nº de
                // tool-calls por categoría). Permite medir sobre sesiones reales el coste de
                // tool-calling antes/después de la superficie v2.
                tracing::info!(
                    target: "chat_metrics",
                    event = "turn",
                    conversation = %conv_id,
                    tool_rounds,
                    tool_calls = total_tool_calls,
                    canvas_ops = total_canvas_ops,
                    view_actions = total_view_actions,
                    data_tools = total_data_tools,
                    hit_round_limit = tool_rounds >= MAX_TOOL_ROUNDS,
                    "agent turn finished",
                );

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
                // View actions → reenviar al frontend como view_action (scroll/resaltar/filtrar),
                // NO ejecutar en backend. ACK inmediato: son fire-and-forget sobre la vista.
                if VIEW_ACTION_NAMES.contains(&tc.name.as_str()) {
                    total_view_actions += 1;
                    yield Ok(Event::default()
                        .event("view_action")
                        .data(
                            serde_json::json!({
                                "toolCallId": tc.id,
                                "action": tc.name,
                                "args": tc.args,
                            })
                            .to_string(),
                        ));
                    tool_result_msgs.push(simpletpv_ai::event::ChatMessage::Tool {
                        tool_call_id: tc.id.clone(),
                        content: "view_action_dispatched".to_owned(),
                    });
                    continue;
                }

                // Canvas ops → reenviar al frontend como canvas_op, NO ejecutar en backend
                if CANVAS_OP_NAMES.contains(&tc.name.as_str()) {
                    total_canvas_ops += 1;
                    let op = CanvasOp::from_tool_call(&tc.name, &tc.args);
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
                total_data_tools += 1;
                let tool_t0 = std::time::Instant::now();
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
                        // Telemetría por tool-call (observabilidad de fiabilidad: Anthropic
                        // recomienda monitorización en producción como "ground truth").
                        tracing::info!(
                            target: "chat_metrics",
                            event = "tool_call",
                            tool = %tc.name,
                            ok = true,
                            elapsed_ms = tool_t0.elapsed().as_millis() as u64,
                            "data tool",
                        );
                        tool_result_msgs.push(simpletpv_ai::event::ChatMessage::Tool {
                            tool_call_id: tc.id.clone(),
                            content: result.to_string(),
                        });
                    }
                    Err(e) => {
                        tracing::warn!(
                            target: "chat_metrics",
                            event = "tool_call",
                            tool = %tc.name,
                            ok = false,
                            elapsed_ms = tool_t0.elapsed().as_millis() as u64,
                            error = %e,
                            "data tool failed",
                        );
                        // Devolvemos el error como tool_result para que el modelo lo incorpore y
                        // se recupere (patrón OpenAI/Anthropic). JSON construido con serde, no a
                        // mano: `format!` rompía el JSON si el mensaje llevara comillas/saltos.
                        tool_result_msgs.push(simpletpv_ai::event::ChatMessage::Tool {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::json!({ "error": e.to_string() }).to_string(),
                        });
                    }
                }
            }

            // El historial debe llevar el mensaje del asistente CON sus tool_calls ANTES de los
            // mensajes `role:"tool"` (regla OpenAI). OpenAI es laxo, pero gateways estrictos
            // (DeepSeek vía OpenCode Zen) devuelven 400 "tool must be a response to a preceding
            // message with tool_calls" si falta. Reconstruimos ese assistant.
            let assistant_tool_calls: Vec<simpletpv_ai::event::ToolCallDef> = tool_calls
                .iter()
                .map(|tc| simpletpv_ai::event::ToolCallDef {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    kind: "function".to_owned(),
                    function: simpletpv_ai::event::FunctionCall {
                        name: tc.name.clone(),
                        arguments: tc.args.to_string(),
                    },
                })
                .collect();
            req.messages.push(simpletpv_ai::event::ChatMessage::Assistant {
                content: vec![simpletpv_ai::event::ContentBlock {
                    kind: "text".to_owned(),
                    text: tokens.clone(),
                }],
                tool_calls: Some(assistant_tool_calls),
            });

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
            content: serde_json::to_value(&body.partial_content).unwrap_or(serde_json::Value::Null),
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

    // Métrica de calidad del agente v2 (#210): cada resultado de canvas op vuelve aquí. Un
    // rechazo = panel que no se renderizó (respuesta vacía); aceptado-con-reason = la validación
    // REPARÓ la spec del agente (la hipótesis: las reparaciones reducen las respuestas vacías).
    // Target dedicado `chat_metrics` para filtrar/agregar sobre sesiones reales sin ruido.
    tracing::info!(
        target: "chat_metrics",
        event = "canvas_result",
        conversation = %conv_id,
        accepted = body.accepted,
        rejected = !body.accepted,
        repaired = body.accepted && body.reason.is_some(),
        reason = body.reason.as_deref().unwrap_or(""),
        "canvas op result",
    );

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
    let convs = chat::list_conversations(state.db(), user.organization_id, user.user_id)
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
    let msgs = chat::get_messages(state.db(), user.organization_id, conv_id)
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
    let usage = chat::get_conversation_usage(state.db(), user.organization_id, conv_id)
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
    let ai = state.ai();
    let mut models: Vec<simpletpv_ai::ModelInfo> = Vec::new();

    if let Some(cfg) = ai {
        // OpenAI / gateway. Con base_url custom se descubre la lista EN VIVO del gateway
        // (todos sus modelos); si la llamada falla O devuelve una lista vacía se cae al
        // catálogo estático.
        if let Some(key) = &cfg.openai_key {
            // `OPENAI_MODELS` fija la lista EXACTA (ids + etiquetas) → autoridad, sin descubrimiento
            // en vivo. Sin ella, se descubre la lista viva del gateway (fallback a catálogo estático).
            if let Some(pinned) = simpletpv_ai::pinned_models() {
                models.extend(pinned);
            } else {
                match &cfg.openai_base_url {
                    Some(base) => match simpletpv_ai::fetch_openai_models(base, key).await {
                        // Lista viva no vacía: la del gateway manda.
                        Ok(m) if !m.is_empty() => models.extend(m),
                        // 200 con `data` vacío o de formato inesperado: NO dejar el chat
                        // deshabilitado en silencio teniendo IA configurada — fallback.
                        Ok(_) => {
                            tracing::warn!("el gateway no devolvió modelos; uso catálogo estático");
                            models.extend(simpletpv_ai::static_openai_models());
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "no se pudieron listar los modelos del gateway; uso catálogo estático");
                            models.extend(simpletpv_ai::static_openai_models());
                        }
                    },
                    None => models.extend(simpletpv_ai::static_openai_models()),
                }
            }
        }
        // Anthropic directo solo cuando NO hay gateway (con gateway, sus claude-* ya vienen arriba).
        if cfg.anthropic_key.is_some() && cfg.openai_base_url.is_none() {
            models.extend(
                simpletpv_ai::available_models()
                    .into_iter()
                    .filter(|m| m.provider == "anthropic"),
            );
        }
    }
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
            .map(|d| time::OffsetDateTime::new_utc(d, time::Time::MIDNIGHT))
    });
    let to = q.to.as_deref().and_then(|s| {
        time::Date::parse(s, time::macros::format_description!("[year]-[month]-[day]"))
            .ok()
            .map(|d| time::OffsetDateTime::new_utc(d, time::Time::MIDNIGHT))
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
    let stop_words = [
        "el", "la", "los", "las", "un", "una", "de", "del", "en", "a", "y", "o", "que", "se", "me",
        "te", "le", "lo", "es", "por", "con", "para", "como", "más", "si", "no", "al", "su", "sus",
    ];
    let words: Vec<&str> = message
        .split_whitespace()
        .filter(|w| w.len() > 2 && !stop_words.contains(&w.to_lowercase().as_str()))
        .take(6)
        .collect();
    if words.is_empty() {
        return format!(
            "Conversación {}",
            time::OffsetDateTime::now_utc()
                .format(time::macros::format_description!(
                    "[day]/[month] [hour]:[minute]"
                ))
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

fn build_chat_messages(
    rows: &[simpletpv_domain::chat::ChatMessageRow],
) -> Vec<simpletpv_ai::event::ChatMessage> {
    use simpletpv_ai::event::{ChatMessage, ContentBlock};

    // Reconstrucción del historial para el siguiente turno. Se OMITEN los `tool_calls` de los
    // mensajes assistant: reemitir `tool_calls` históricos dejaría `assistant.tool_calls` SIN sus
    // mensajes `tool` → 400 en proveedores estrictos (DeepSeek vía OpenCode Zen: "insufficient tool
    // messages following tool_calls"). Las filas `role:"tool"` NO se reemiten como mensajes tool
    // (mismo motivo + alternancia Anthropic), PERO sí se SURFACEA su señal de autocorrección: el
    // resultado de una canvas-op (rechazo/reparación, persistido por POST /canvas-result) se anexa
    // como TEXTO al último mensaje del assistant, para que el modelo tenga el "ground truth del
    // entorno" y corrija en el siguiente turno (Anthropic, *Building effective agents*) sin romper
    // el emparejamiento tool_call/tool. Los assistant sin texto (solo-tool_calls) se descartan.
    let mut out: Vec<ChatMessage> = Vec::with_capacity(rows.len());
    for row in rows {
        match row.role.as_str() {
            "tool" => {
                // Resultados de tools de datos no se persisten como filas tool → solo llegan aquí
                // las canvas-result. Si aportan señal (rechazo/reparación), se anexan al assistant.
                if let Some(note) = canvas_result_note(&row.content) {
                    if let Some(ChatMessage::Assistant { content, .. }) = out.last_mut() {
                        if let Some(block) = content.first_mut() {
                            block.text.push_str(&note);
                        }
                    }
                }
            }
            "assistant" => {
                let text = row.content[0]["text"].as_str().unwrap_or("").to_owned();
                if !text.trim().is_empty() {
                    out.push(ChatMessage::Assistant {
                        content: vec![ContentBlock {
                            kind: "text".to_owned(),
                            text,
                        }],
                        tool_calls: None,
                    });
                }
            }
            "user" => {
                let text = row.content[0]["text"].as_str().unwrap_or("").to_owned();
                out.push(ChatMessage::User {
                    content: vec![ContentBlock {
                        kind: "text".to_owned(),
                        text,
                    }],
                });
            }
            _ => out.push(ChatMessage::User {
                content: vec![ContentBlock {
                    kind: "text".to_owned(),
                    text: row.content.to_string(),
                }],
            }),
        }
    }
    out
}

// Nota de texto del resultado de una canvas-op para ANEXAR al assistant (no es un mensaje `tool`).
// Solo cuando aporta señal de autocorrección: rechazo, o aceptación CON reparación. `None` si la
// fila no tiene forma de canvas-result o si fue aceptada sin reparar (nada que corregir). El
// `reason` viene del repair determinista del store (normalizePanelSpec), no es texto inventado.
fn canvas_result_note(content: &serde_json::Value) -> Option<String> {
    let accepted = content.get("accepted")?.as_bool()?;
    let reason = content
        .get("reason")
        .and_then(|r| r.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    match (accepted, reason) {
        (false, Some(r)) => Some(format!(
            "\n\n[Lienzo: el panel anterior se RECHAZÓ — {r}. Corrígelo en el siguiente intento.]"
        )),
        (false, None) => Some(
            "\n\n[Lienzo: el panel anterior se RECHAZÓ. Corrígelo en el siguiente intento.]"
                .to_owned(),
        ),
        (true, Some(r)) => Some(format!(
            "\n\n[Lienzo: el panel anterior se reparó automáticamente — {r}. Tenlo en cuenta.]"
        )),
        (true, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use simpletpv_ai::event::ChatMessage;

    fn row(role: &str, content: serde_json::Value) -> simpletpv_domain::chat::ChatMessageRow {
        simpletpv_domain::chat::ChatMessageRow {
            id: uuid::Uuid::nil(),
            conversation_id: uuid::Uuid::nil(),
            organization_id: uuid::Uuid::nil(),
            role: role.to_owned(),
            content,
            tool_calls: None,
            tool_results: None,
            created_at: time::PrimitiveDateTime::new(
                time::Date::from_calendar_date(2026, time::Month::June, 1).unwrap(),
                time::Time::MIDNIGHT,
            ),
        }
    }

    fn assistant_text(m: &ChatMessage) -> &str {
        match m {
            ChatMessage::Assistant { content, .. } => {
                content.first().map(|b| b.text.as_str()).unwrap_or("")
            }
            _ => "",
        }
    }

    #[test]
    fn canvas_result_note_solo_surfacea_rechazo_o_reparacion() {
        assert!(canvas_result_note(
            &serde_json::json!({ "accepted": false, "reason": "endpoint fuera de allowlist" })
        )
        .unwrap()
        .contains("RECHAZÓ"));
        assert!(
            canvas_result_note(&serde_json::json!({ "accepted": false, "reason": null }))
                .unwrap()
                .contains("RECHAZÓ")
        );
        assert!(canvas_result_note(
            &serde_json::json!({ "accepted": true, "reason": "receta reubicada" })
        )
        .unwrap()
        .contains("reparó"));
        // Aceptado sin reparar → nada que corregir.
        assert!(
            canvas_result_note(&serde_json::json!({ "accepted": true, "reason": null })).is_none()
        );
        // Fila sin forma de canvas-result → ignorada.
        assert!(canvas_result_note(&serde_json::json!({ "foo": 1 })).is_none());
    }

    #[test]
    fn build_chat_messages_anexa_resultado_del_lienzo_al_assistant_sin_emitir_tool() {
        let rows = vec![
            row(
                "user",
                serde_json::json!([{ "type": "text", "text": "muéstrame ventas" }]),
            ),
            row(
                "assistant",
                serde_json::json!([{ "type": "text", "text": "Te he montado el panel." }]),
            ),
            row(
                "tool",
                serde_json::json!({ "accepted": false, "reason": "endpoint no permitido" }),
            ),
        ];
        let msgs = build_chat_messages(&rows);
        // No se emite ningún mensaje role:"tool" → emparejamiento estricto del gateway intacto.
        assert_eq!(msgs.len(), 2);
        let a = msgs
            .iter()
            .find(|m| matches!(m, ChatMessage::Assistant { .. }))
            .unwrap();
        // El resultado del lienzo (rechazo) quedó anexado al texto del assistant.
        assert!(assistant_text(a).contains("RECHAZÓ"));
        assert!(assistant_text(a).contains("Te he montado el panel."));
    }

    #[test]
    fn build_chat_messages_aceptado_limpio_no_modifica_al_assistant() {
        let rows = vec![
            row(
                "assistant",
                serde_json::json!([{ "type": "text", "text": "Listo." }]),
            ),
            row(
                "tool",
                serde_json::json!({ "accepted": true, "reason": null }),
            ),
        ];
        let msgs = build_chat_messages(&rows);
        assert_eq!(msgs.len(), 1);
        assert_eq!(assistant_text(&msgs[0]), "Listo.");
    }
}
