use async_stream::stream;
use futures::Stream;
use reqwest::Client;
use serde_json::{json, Value};

use crate::{
    AiError,
    event::{ChatRequest, Effort, LlmEvent, ToolCall, Usage},
};

pub fn stream_openai(
    client: Client,
    api_key: String,
    req: ChatRequest,
) -> impl Stream<Item = Result<LlmEvent, AiError>> {
    stream! {
        let model = map_openai_model(&req.model);
        let effort = map_effort(&req.effort);

        // Convertir mensajes al formato OpenAI
        let messages = build_openai_messages(&req);

        let body = json!({
            "model": model,
            "messages": messages,
            "tools": req.tools,
            "tool_choice": "auto",
            "reasoning_effort": effort,
            "stream": true,
            "stream_options": { "include_usage": true },
        });

        let resp = client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&api_key)
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
        let mut partial_tool_calls: std::collections::HashMap<u32, PartialTool> =
            std::collections::HashMap::new();

        let mut text = resp.text().await.map_err(AiError::Http)?;
        // OpenAI SSE: cada línea empieza con "data: " o es vacía
        let lines: Vec<&str> = text.lines().collect();
        // Re-streaming real: procesamos el body como texto (simplificado para
        // evitar dep extra de bytes stream; en producción usar bytes_stream()).
        for line in &lines {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                break;
            }
            let chunk: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // usage chunk (stream_options: include_usage)
            if let Some(u) = chunk.get("usage") {
                usage.input_tokens = u["prompt_tokens"].as_u64().unwrap_or(0) as u32;
                usage.output_tokens = u["completion_tokens"].as_u64().unwrap_or(0) as u32;
            }

            let choices = match chunk["choices"].as_array() {
                Some(c) => c,
                None => continue,
            };
            for choice in choices {
                let delta = &choice["delta"];
                // Token de texto
                if let Some(content) = delta["content"].as_str() {
                    if !content.is_empty() {
                        yield Ok(LlmEvent::Token(content.to_owned()));
                    }
                }
                // Tool calls acumulados por índice
                if let Some(tc_arr) = delta["tool_calls"].as_array() {
                    for tc in tc_arr {
                        let idx = tc["index"].as_u64().unwrap_or(0) as u32;
                        let entry = partial_tool_calls.entry(idx).or_default();
                        if let Some(id) = tc["id"].as_str() {
                            entry.id = id.to_owned();
                        }
                        if let Some(name) = tc["function"]["name"].as_str() {
                            entry.name = name.to_owned();
                        }
                        if let Some(args) = tc["function"]["arguments"].as_str() {
                            entry.args.push_str(args);
                        }
                    }
                }
                // finish_reason: tool_calls → emitir ToolCall completo
                if choice["finish_reason"].as_str() == Some("tool_calls") {
                    let mut sorted: Vec<_> = partial_tool_calls.drain().collect();
                    sorted.sort_by_key(|(k, _)| *k);
                    for (_, pt) in sorted {
                        let args = serde_json::from_str(&pt.args).unwrap_or(Value::Null);
                        yield Ok(LlmEvent::ToolCall(ToolCall {
                            id: pt.id,
                            name: pt.name,
                            args,
                        }));
                    }
                }
            }
        }
        // Suprimir warning de variable no usada cuando el stream termina sin error
        let _ = text.drain(..);
        yield Ok(LlmEvent::Done(usage));
    }
}

#[derive(Default)]
struct PartialTool {
    id: String,
    name: String,
    args: String,
}

fn map_openai_model(model: &str) -> &str {
    match model {
        "gpt-4.1" | "gpt-4.1-mini" | "gpt-4.1-nano" | "gpt-4o" | "gpt-4o-mini"
        | "o3" | "o4-mini" => model,
        _ => "gpt-4.1",
    }
}

fn map_effort(effort: &Effort) -> &'static str {
    match effort {
        Effort::Low => "low",
        Effort::Medium => "medium",
        Effort::High => "high",
    }
}

fn build_openai_messages(req: &ChatRequest) -> Vec<Value> {
    use crate::event::ChatMessage;
    let mut msgs: Vec<Value> = vec![json!({ "role": "system", "content": req.system })];
    for msg in &req.messages {
        let v = match msg {
            ChatMessage::User { content } => {
                let text = content
                    .iter()
                    .filter(|b| b.kind == "text")
                    .map(|b| b.text.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                json!({ "role": "user", "content": text })
            }
            ChatMessage::Assistant { content, tool_calls } => {
                let text = content
                    .iter()
                    .filter(|b| b.kind == "text")
                    .map(|b| b.text.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                if let Some(tcs) = tool_calls {
                    let tc_arr: Vec<Value> = tcs
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                }
                            })
                        })
                        .collect();
                    json!({ "role": "assistant", "content": text, "tool_calls": tc_arr })
                } else {
                    json!({ "role": "assistant", "content": text })
                }
            }
            ChatMessage::Tool { tool_call_id, content } => {
                json!({ "role": "tool", "tool_call_id": tool_call_id, "content": content })
            }
        };
        msgs.push(v);
    }
    msgs
}
