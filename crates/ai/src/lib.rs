pub mod anthropic;
pub mod event;
pub mod openai;
pub mod pricing;
pub mod tools;

use futures::Stream;
use reqwest::Client;
use std::pin::Pin;

pub use event::{ChatRequest, Effort, LlmEvent, ToolCall, Usage};

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Provider error {status}: {body}")]
    Provider { status: u16, body: String },
    #[error("Config error: {0}")]
    Config(String),
}

pub type AiStream = Pin<Box<dyn Stream<Item = Result<LlmEvent, AiError>> + Send>>;

#[derive(Clone)]
pub struct AiConfig {
    pub openai_key: Option<String>,
    pub anthropic_key: Option<String>,
    /// Base URL del endpoint compatible con OpenAI. `None` → `https://api.openai.com/v1`.
    /// Permite gateways OpenAI-compatibles (p.ej. OpenCode Zen: `https://opencode.ai/zen/v1`).
    pub openai_base_url: Option<String>,
}

impl AiConfig {
    pub fn from_env() -> Result<Self, AiError> {
        let openai_key = std::env::var("OPENAI_API_KEY").ok();
        let anthropic_key = std::env::var("ANTHROPIC_API_KEY").ok();
        let openai_base_url = std::env::var("OPENAI_BASE_URL")
            .ok()
            .filter(|s| !s.trim().is_empty());
        if openai_key.is_none() && anthropic_key.is_none() {
            return Err(AiError::Config(
                "OPENAI_API_KEY o ANTHROPIC_API_KEY deben estar configurados".into(),
            ));
        }
        Ok(Self {
            openai_key,
            anthropic_key,
            openai_base_url,
        })
    }

    pub fn is_anthropic(model: &str) -> bool {
        model.starts_with("claude")
    }
}

pub fn stream_chat(config: &AiConfig, req: ChatRequest) -> Result<AiStream, AiError> {
    let client = Client::new();

    // Con un gateway OpenAI-compatible (base_url custom) TODOS los modelos —incluidos los
    // `claude-*` que el gateway sirve bajo su propia API— van por el endpoint OpenAI. El path
    // de Anthropic directo (api.anthropic.com) solo se usa cuando NO hay gateway.
    let use_anthropic_direct =
        config.openai_base_url.is_none() && AiConfig::is_anthropic(&req.model);

    if use_anthropic_direct {
        let key = config
            .anthropic_key
            .clone()
            .ok_or_else(|| AiError::Config("ANTHROPIC_API_KEY no configurado".into()))?;
        Ok(Box::pin(anthropic::stream_anthropic(client, key, req)))
    } else {
        let key = config
            .openai_key
            .clone()
            .ok_or_else(|| AiError::Config("OPENAI_API_KEY no configurado".into()))?;
        Ok(Box::pin(openai::stream_openai(
            client,
            key,
            config.openai_base_url.clone(),
            req,
        )))
    }
}

// Lista de modelos disponibles por provider. Los campos son owned (`String`) porque la lista
// de modelos OpenAI puede venir de `OPENAI_MODELS` (gateway configurable), no solo del catálogo
// fijo.
#[derive(Debug, serde::Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
    pub label: String,
    pub supports_thinking: bool,
}

/// Modelos OpenAI del catálogo por defecto (cuando no hay `OPENAI_MODELS`).
fn default_openai_models() -> Vec<ModelInfo> {
    [
        ("gpt-4.1", "OpenAI · GPT-4.1"),
        ("gpt-4.1-mini", "OpenAI · GPT-4.1 Mini"),
        ("o4-mini", "OpenAI · o4-mini"),
    ]
    .into_iter()
    .map(|(id, label)| ModelInfo {
        id: id.to_string(),
        provider: "openai".to_string(),
        label: label.to_string(),
        supports_thinking: false,
    })
    .collect()
}

/// Lista los modelos OpenAI a exponer. Si `OPENAI_MODELS` (CSV de ids) está definida, sustituye
/// al catálogo por defecto — útil para apuntar a un gateway OpenAI-compatible (OpenCode Zen) cuyos
/// ids no son los de OpenAI. El label se deriva del id.
fn openai_models() -> Vec<ModelInfo> {
    match std::env::var("OPENAI_MODELS") {
        Ok(csv) if !csv.trim().is_empty() => csv
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|id| ModelInfo {
                id: id.to_string(),
                provider: "openai".to_string(),
                label: id.to_string(),
                supports_thinking: false,
            })
            .collect(),
        _ => default_openai_models(),
    }
}

pub fn available_models() -> Vec<ModelInfo> {
    let mut models = openai_models();
    models.extend([
        ModelInfo {
            id: "claude-opus-4-8".to_string(),
            provider: "anthropic".to_string(),
            label: "Anthropic · Claude Opus 4.8".to_string(),
            supports_thinking: true,
        },
        ModelInfo {
            id: "claude-sonnet-4-6".to_string(),
            provider: "anthropic".to_string(),
            label: "Anthropic · Claude Sonnet 4.6".to_string(),
            supports_thinking: true,
        },
    ]);
    models
}

/// Descubre los modelos de un gateway OpenAI-compatible vía su endpoint `/v1/models`
/// (`{base_url}/models`). Devuelve todos los ids que sirva, como provider `openai`. Permite que
/// modelos nuevos del gateway (p.ej. OpenCode Zen) aparezcan en el selector sin tocar código.
pub async fn fetch_openai_models(base_url: &str, api_key: &str) -> Result<Vec<ModelInfo>, AiError> {
    let client = Client::new();
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(AiError::Http)?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(AiError::Provider { status, body });
    }
    let body: serde_json::Value = resp.json().await.map_err(AiError::Http)?;
    let models = body["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str())
                .map(|id| ModelInfo {
                    id: id.to_string(),
                    provider: "openai".to_string(),
                    label: id.to_string(),
                    supports_thinking: false,
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(models)
}
