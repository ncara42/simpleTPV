//! Soporte con escalado a humano (Ayuda). Una conversación por organización;
//! la IA triagea y, si no puede resolver, escala a Telegram (ver `simpletpv-http`).

pub mod model;
pub mod service;

pub use model::{
    Author, InsertSupportMessage, Mode, SupportConversationRow, SupportMessageRow,
};
pub use service::{
    append_message, find_conversation_by_topic, get_messages, get_or_create_conversation,
    set_mode, set_topic,
};
