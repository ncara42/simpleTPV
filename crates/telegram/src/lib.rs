//! Cliente mínimo del Bot API de Telegram para el soporte con escalado humano.
//!
//! Modelo "chat por cliente": el grupo de soporte es un **supergrupo con temas de
//! foro** (`TELEGRAM_SUPPORT_CHAT_ID`). Cada organización tiene su propio tema
//! (`message_thread_id`), creado bajo demanda al primer escalado. Soporte responde
//! dentro del tema; el webhook recibe esos mensajes con su `message_thread_id` y
//! los enruta de vuelta a la conversación web de esa organización.
//!
//! No toca la BD: solo HTTP. La persistencia y el enrutado por tenant viven en
//! `simpletpv-domain` / `simpletpv-http`.

use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};

const API_BASE: &str = "https://api.telegram.org";

#[derive(Debug, thiserror::Error)]
pub enum TelegramError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Telegram API error: {0}")]
    Api(String),
}

/// Configuración del bot. `from_env` devuelve `None` si falta cualquier variable:
/// el soporte por Telegram queda deshabilitado (la IA sigue respondiendo lo que
/// pueda, pero el escalado a humano se desactiva con un aviso al arrancar).
#[derive(Clone)]
pub struct TelegramConfig {
    pub bot_token: String,
    /// ID del supergrupo de soporte (negativo, p. ej. -1001234567890).
    pub support_chat_id: i64,
    /// Secreto compartido: se envía a Telegram en `setWebhook` y se valida en cada
    /// update vía la cabecera `X-Telegram-Bot-Api-Secret-Token` (anti-spoofing).
    pub webhook_secret: String,
}

impl TelegramConfig {
    pub fn from_env() -> Option<Self> {
        let bot_token = non_empty_env("TELEGRAM_BOT_TOKEN")?;
        let support_chat_id = non_empty_env("TELEGRAM_SUPPORT_CHAT_ID")?.parse().ok()?;
        let webhook_secret = non_empty_env("TELEGRAM_WEBHOOK_SECRET")?;
        Some(Self {
            bot_token,
            support_chat_id,
            webhook_secret,
        })
    }
}

fn non_empty_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
}

/// Cliente HTTP del Bot API. Clonable barato (reqwest::Client es Arc por dentro).
#[derive(Clone)]
pub struct TelegramClient {
    http: reqwest::Client,
    config: TelegramConfig,
}

impl TelegramClient {
    pub fn new(config: TelegramConfig) -> Self {
        Self {
            http: reqwest::Client::new(),
            config,
        }
    }

    pub fn config(&self) -> &TelegramConfig {
        &self.config
    }

    fn url(&self, method: &str) -> String {
        format!("{API_BASE}/bot{}/{method}", self.config.bot_token)
    }

    async fn call<T: DeserializeOwned>(
        &self,
        method: &str,
        body: &Value,
    ) -> Result<T, TelegramError> {
        let resp = self.http.post(self.url(method)).json(body).send().await?;
        let parsed: ApiResponse<T> = resp.json().await?;
        if parsed.ok {
            parsed
                .result
                .ok_or_else(|| TelegramError::Api("respuesta ok sin result".to_owned()))
        } else {
            Err(TelegramError::Api(
                parsed.description.unwrap_or_else(|| "error desconocido".to_owned()),
            ))
        }
    }

    /// Crea un tema de foro en el supergrupo de soporte y devuelve su
    /// `message_thread_id`. Requiere que el grupo tenga los temas activados y que
    /// el bot sea administrador con permiso de gestión de temas.
    pub async fn create_forum_topic(&self, name: &str) -> Result<i64, TelegramError> {
        let topic: ForumTopic = self
            .call(
                "createForumTopic",
                &json!({ "chat_id": self.config.support_chat_id, "name": truncate(name, 128) }),
            )
            .await?;
        Ok(topic.message_thread_id)
    }

    /// Envía un mensaje al supergrupo de soporte, opcionalmente dentro de un tema
    /// (`thread_id`). Devuelve el `message_id` del mensaje enviado.
    pub async fn send_message(
        &self,
        thread_id: Option<i64>,
        text: &str,
    ) -> Result<i64, TelegramError> {
        let mut body = json!({
            "chat_id": self.config.support_chat_id,
            "text": text,
        });
        if let Some(t) = thread_id {
            body["message_thread_id"] = json!(t);
        }
        let sent: SentMessage = self.call("sendMessage", &body).await?;
        Ok(sent.message_id)
    }

    /// Registra el webhook en Telegram con el secreto compartido. `allowed_updates`
    /// acotado a `message` (lo único que consumimos). Idempotente en Telegram.
    pub async fn set_webhook(&self, url: &str) -> Result<(), TelegramError> {
        let _: bool = self
            .call(
                "setWebhook",
                &json!({
                    "url": url,
                    "secret_token": self.config.webhook_secret,
                    "allowed_updates": ["message"],
                }),
            )
            .await?;
        Ok(())
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_owned()
    } else {
        s.chars().take(max).collect()
    }
}

// ── Tipos de respuesta del Bot API ─────────────────────────────────────────────

// `#[serde(bound)]` explícito: sin él, los campos `#[serde(default)]` hacen que
// serde infiera un bound espurio `T: Default` en el impl de Deserialize.
#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: DeserializeOwned"))]
struct ApiResponse<T> {
    ok: bool,
    #[serde(default)]
    result: Option<T>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ForumTopic {
    message_thread_id: i64,
}

#[derive(Debug, Deserialize)]
struct SentMessage {
    message_id: i64,
}

// ── Tipos de update del webhook (solo lo que consumimos) ────────────────────────

#[derive(Debug, Deserialize)]
pub struct Update {
    #[serde(default)]
    pub message: Option<IncomingMessage>,
}

#[derive(Debug, Deserialize)]
pub struct IncomingMessage {
    pub message_id: i64,
    /// Presente cuando el mensaje cae dentro de un tema de foro.
    #[serde(default)]
    pub message_thread_id: Option<i64>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub from: Option<TgUser>,
}

#[derive(Debug, Deserialize)]
pub struct TgUser {
    #[serde(default)]
    pub is_bot: bool,
}

impl IncomingMessage {
    /// Texto del mensaje recortado (None si vacío). Evita persistir mensajes sin
    /// cuerpo (fotos, stickers, eventos de servicio del foro).
    pub fn text_trimmed(&self) -> Option<&str> {
        self.text.as_deref().map(str::trim).filter(|s| !s.is_empty())
    }

    /// True si lo envió el propio bot (eco de nuestros `sendMessage`): se ignora
    /// para no reinyectar en la web lo que ya pusimos nosotros.
    pub fn is_from_bot(&self) -> bool {
        self.from.as_ref().is_some_and(|u| u.is_bot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsea_update_de_tema_de_foro() {
        let raw = r#"{
            "update_id": 1,
            "message": {
                "message_id": 42,
                "message_thread_id": 7,
                "text": "  Hola, ya lo miro  ",
                "from": { "is_bot": false }
            }
        }"#;
        let update: Update = serde_json::from_str(raw).unwrap();
        let msg = update.message.expect("hay message");
        assert_eq!(msg.message_id, 42);
        assert_eq!(msg.message_thread_id, Some(7));
        assert_eq!(msg.text_trimmed(), Some("Hola, ya lo miro"));
        assert!(!msg.is_from_bot());
    }

    #[test]
    fn ignora_mensaje_sin_texto_y_eco_del_bot() {
        let raw = r#"{ "message": { "message_id": 9, "from": { "is_bot": true } } }"#;
        let update: Update = serde_json::from_str(raw).unwrap();
        let msg = update.message.unwrap();
        assert_eq!(msg.text_trimmed(), None);
        assert!(msg.is_from_bot());
    }

    #[test]
    fn from_env_devuelve_none_sin_variables() {
        // Sin las variables configuradas, el soporte por Telegram queda deshabilitado.
        // (Test best-effort: si el entorno de CI las tuviera, se omite la aserción.)
        if non_empty_env("TELEGRAM_BOT_TOKEN").is_none() {
            assert!(TelegramConfig::from_env().is_none());
        }
    }
}
