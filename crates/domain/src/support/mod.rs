//! Soporte con escalado a humano (Ayuda). Una conversación por organización;
//! la IA triagea y, si no puede resolver, escala a Telegram (ver `simpletpv-http`).

pub mod model;
pub mod service;

pub use model::{Author, InsertSupportMessage, Mode, SupportConversationRow, SupportMessageRow};
pub use service::{
    append_message, close_stale_tickets, close_ticket, create_ticket, find_ticket_by_topic,
    get_messages, get_ticket, list_tickets, reopen_ticket, set_mode, set_topic,
};
