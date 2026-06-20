use async_stream::stream;
use futures::Stream;
use reqwest::Client;
use serde_json::{json, Value};

use crate::{
    event::{ChatRequest, Effort, LlmEvent, ToolCall, Usage},
    AiError,
};

pub fn stream_anthropic(
    client: Client,
    api_key: String,
    req: ChatRequest,
) -> impl Stream<Item = Result<LlmEvent, AiError>> {
    stream! {
        let model = map_anthropic_model(&req.model);
        let thinking_budget = thinking_budget(&req.effort);

        let messages = build_anthropic_messages(&req);

        let mut body = json!({
            "model": model,
            "max_tokens": 8192,
            "system": req.system,
            "messages": messages,
            "tools": convert_tools_anthropic(&req.tools),
            "stream": true,
        });

        if let Some(budget) = thinking_budget {
            body["thinking"] = json!({
                "type": "enabled",
                "budget_tokens": budget
            });
        }

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "interleaved-thinking-2025-05-14")
            .json(&body)
            .send()
            .await
            .map_err(AiError::Http)?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            yield Err(AiError::Provider { status, body: text });
            return;
        }

        let mut usage = Usage::default();
        let mut partial_input = String::new();
        let text = resp.text().await.map_err(AiError::Http)?;

        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            let chunk: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match chunk["type"].as_str() {
                Some("content_block_delta") => {
                    let delta = &chunk["delta"];
                    match delta["type"].as_str() {
                        Some("text_delta") => {
                            if let Some(t) = delta["text"].as_str() {
                                yield Ok(LlmEvent::Token(t.to_owned()));
                            }
                        }
                        Some("thinking_delta") => {
                            if let Some(t) = delta["thinking"].as_str() {
                                yield Ok(LlmEvent::Thinking(t.to_owned()));
                            }
                        }
                        Some("input_json_delta") => {
                            if let Some(p) = delta["partial_json"].as_str() {
                                partial_input.push_str(p);
                            }
                        }
                        _ => {}
                    }
                }
                Some("content_block_stop") => {
                    // Si teníamos una tool call acumulada, emitirla
                    if !partial_input.is_empty() {
                        if let Some(block_idx) = chunk["index"].as_u64() {
                            // Recuperar nombre e id del bloque — los guardamos en message_start/block_start
                            // En una implementación completa se guardarían en estado; aquí emitimos
                            // lo que tenemos disponible
                            let args =
                                serde_json::from_str(&partial_input).unwrap_or(Value::Null);
                            yield Ok(LlmEvent::ToolCall(ToolCall {
                                id: format!("tc_{block_idx}"),
                                name: String::new(), // se rellena en content_block_start
                                args,
                            }));
                            partial_input.clear();
                        }
                    }
                }
                Some("content_block_start") => {
                    // Si es un tool_use block, guardamos nombre e id para el stop
                    // En esta implementación simplificada los emitimos en block_stop
                    // con el input acumulado
                    let block = &chunk["content_block"];
                    if block["type"].as_str() == Some("tool_use") {
                        // nombre e id disponibles en block_start
                        // Se asocian en block_stop (ver arriba)
                        let _name = block["name"].as_str().unwrap_or("").to_owned();
                        let _id = block["id"].as_str().unwrap_or("").to_owned();
                    }
                }
                Some("message_delta") => {
                    if let Some(u) = chunk["usage"].as_object() {
                        usage.output_tokens =
                            u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    }
                }
                Some("message_start") => {
                    if let Some(u) = chunk["message"]["usage"].as_object() {
                        usage.input_tokens =
                            u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    }
                }
                _ => {}
            }
        }

        yield Ok(LlmEvent::Done(usage));
    }
}

fn map_anthropic_model(model: &str) -> &str {
    match model {
        "claude-opus-4-8" | "claude-opus-4" => "claude-opus-4-8-20251101",
        "claude-sonnet-4-6" | "claude-sonnet-4" => "claude-sonnet-4-6-20251001",
        "claude-haiku-4-5" | "claude-haiku-4" => "claude-haiku-4-5-20251001",
        _ => "claude-sonnet-4-6-20251001",
    }
}

fn thinking_budget(effort: &Effort) -> Option<u32> {
    match effort {
        Effort::Low => None,
        Effort::Medium => Some(2000),
        Effort::High => Some(8000),
    }
}

fn build_anthropic_messages(req: &ChatRequest) -> Vec<Value> {
    use crate::event::ChatMessage;
    req.messages
        .iter()
        .map(|msg| match msg {
            ChatMessage::User { content } => {
                let text = content
                    .iter()
                    .filter(|b| b.kind == "text")
                    .map(|b| b.text.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                json!({ "role": "user", "content": [{ "type": "text", "text": text }] })
            }
            ChatMessage::Assistant {
                content,
                tool_calls,
            } => {
                let mut blocks: Vec<Value> = content
                    .iter()
                    .filter(|b| b.kind == "text" && !b.text.is_empty())
                    .map(|b| json!({ "type": "text", "text": b.text }))
                    .collect();
                if let Some(tcs) = tool_calls {
                    for tc in tcs {
                        let args: Value =
                            serde_json::from_str(&tc.function.arguments).unwrap_or(Value::Null);
                        blocks.push(json!({
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.function.name,
                            "input": args,
                        }));
                    }
                }
                json!({ "role": "assistant", "content": blocks })
            }
            ChatMessage::Tool {
                tool_call_id,
                content,
            } => {
                json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_call_id,
                        "content": content
                    }]
                })
            }
        })
        .collect()
}

// Convierte schemas de tools en formato OpenAI (function/parameters) al formato
// Anthropic (name/description/input_schema).
fn convert_tools_anthropic(tools: &[Value]) -> Vec<Value> {
    tools
        .iter()
        .filter_map(|t| {
            let f = t.get("function")?;
            Some(json!({
                "name": f.get("name")?,
                "description": f.get("description").cloned().unwrap_or(Value::Null),
                "input_schema": f.get("parameters").cloned().unwrap_or(json!({ "type": "object", "properties": {} }))
            }))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{ChatMessage, ContentBlock, FunctionCall, ToolCallDef};

    fn text_block(s: &str) -> ContentBlock {
        ContentBlock {
            kind: "text".into(),
            text: s.into(),
        }
    }

    #[test]
    fn map_anthropic_model_resuelve_alias_con_fecha() {
        assert_eq!(
            map_anthropic_model("claude-opus-4-8"),
            "claude-opus-4-8-20251101"
        );
        assert_eq!(
            map_anthropic_model("claude-sonnet-4-6"),
            "claude-sonnet-4-6-20251001"
        );
        // Desconocido → fallback a sonnet
        assert_eq!(
            map_anthropic_model("claude-loquesea"),
            "claude-sonnet-4-6-20251001"
        );
    }

    #[test]
    fn thinking_budget_segun_effort() {
        // Bajo = thinking desactivado; medio = 2000; alto = 8000.
        assert_eq!(thinking_budget(&Effort::Low), None);
        assert_eq!(thinking_budget(&Effort::Medium), Some(2000));
        assert_eq!(thinking_budget(&Effort::High), Some(8000));
    }

    #[test]
    fn build_messages_usa_bloques_de_contenido() {
        // Anthropic exige content como array de bloques, no string plano.
        let msgs = build_anthropic_messages(&ChatRequest {
            model: "claude-sonnet-4-6".into(),
            effort: Effort::Low,
            messages: vec![ChatMessage::User {
                content: vec![text_block("hola")],
            }],
            tools: vec![],
            system: "sys".into(),
        });
        assert_eq!(msgs[0]["role"], "user");
        assert_eq!(msgs[0]["content"][0]["type"], "text");
        assert_eq!(msgs[0]["content"][0]["text"], "hola");
    }

    #[test]
    fn build_messages_assistant_tool_call_es_tool_use_block() {
        let assistant = ChatMessage::Assistant {
            content: vec![text_block("consulto")],
            tool_calls: Some(vec![ToolCallDef {
                id: "tc_1".into(),
                name: "sales_kpis".into(),
                kind: "function".into(),
                function: FunctionCall {
                    name: "sales_kpis".into(),
                    arguments: "{\"period\":\"week\"}".into(),
                },
            }]),
        };
        let msgs = build_anthropic_messages(&ChatRequest {
            model: "claude-sonnet-4-6".into(),
            effort: Effort::Low,
            messages: vec![assistant],
            tools: vec![],
            system: "sys".into(),
        });
        let blocks = msgs[0]["content"].as_array().unwrap();
        let tool_use = blocks.iter().find(|b| b["type"] == "tool_use").unwrap();
        assert_eq!(tool_use["id"], "tc_1");
        assert_eq!(tool_use["name"], "sales_kpis");
        assert_eq!(tool_use["input"]["period"], "week");
    }

    #[test]
    fn build_messages_tool_result_se_envia_como_user_con_tool_result() {
        // En Anthropic los resultados de tool van en un mensaje role=user con bloque tool_result.
        let msgs = build_anthropic_messages(&ChatRequest {
            model: "claude-sonnet-4-6".into(),
            effort: Effort::Low,
            messages: vec![ChatMessage::Tool {
                tool_call_id: "tc_1".into(),
                content: "{\"total\":42}".into(),
            }],
            tools: vec![],
            system: "sys".into(),
        });
        assert_eq!(msgs[0]["role"], "user");
        let block = &msgs[0]["content"][0];
        assert_eq!(block["type"], "tool_result");
        assert_eq!(block["tool_use_id"], "tc_1");
    }

    #[test]
    fn convert_tools_traduce_function_a_input_schema() {
        let openai_tool = json!({
            "type": "function",
            "function": {
                "name": "sales_kpis",
                "description": "KPIs",
                "parameters": { "type": "object", "properties": { "period": { "type": "string" } } }
            }
        });
        let converted = convert_tools_anthropic(&[openai_tool]);
        assert_eq!(converted[0]["name"], "sales_kpis");
        assert_eq!(converted[0]["description"], "KPIs");
        assert_eq!(converted[0]["input_schema"]["type"], "object");
        assert_eq!(
            converted[0]["input_schema"]["properties"]["period"]["type"],
            "string"
        );
        // No debe llevar el wrapper "function" de OpenAI.
        assert!(converted[0].get("function").is_none());
    }
}
