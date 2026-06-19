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
}

impl AiConfig {
    pub fn from_env() -> Result<Self, AiError> {
        let openai_key = std::env::var("OPENAI_API_KEY").ok();
        let anthropic_key = std::env::var("ANTHROPIC_API_KEY").ok();
        if openai_key.is_none() && anthropic_key.is_none() {
            return Err(AiError::Config(
                "OPENAI_API_KEY o ANTHROPIC_API_KEY deben estar configurados".into(),
            ));
        }
        Ok(Self { openai_key, anthropic_key })
    }

    pub fn is_anthropic(model: &str) -> bool {
        model.starts_with("claude")
    }
}

pub fn stream_chat(config: &AiConfig, req: ChatRequest) -> Result<AiStream, AiError> {
    let client = Client::new();

    if AiConfig::is_anthropic(&req.model) {
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
        Ok(Box::pin(openai::stream_openai(client, key, req)))
    }
}

// Lista de modelos disponibles por provider.
#[derive(Debug, serde::Serialize)]
pub struct ModelInfo {
    pub id: &'static str,
    pub provider: &'static str,
    pub label: &'static str,
    pub supports_thinking: bool,
}

pub fn available_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "gpt-4.1",
            provider: "openai",
            label: "OpenAI · GPT-4.1",
            supports_thinking: false,
        },
        ModelInfo {
            id: "gpt-4.1-mini",
            provider: "openai",
            label: "OpenAI · GPT-4.1 Mini",
            supports_thinking: false,
        },
        ModelInfo {
            id: "o4-mini",
            provider: "openai",
            label: "OpenAI · o4-mini",
            supports_thinking: false,
        },
        ModelInfo {
            id: "claude-opus-4-8",
            provider: "anthropic",
            label: "Anthropic · Claude Opus 4.8",
            supports_thinking: true,
        },
        ModelInfo {
            id: "claude-sonnet-4-6",
            provider: "anthropic",
            label: "Anthropic · Claude Sonnet 4.6",
            supports_thinking: true,
        },
    ]
}
