//! API keys (#154, IT-18): gestión (ADMIN) y autenticación pre-tenant para la
//! API pública. La key en claro se muestra una vez; en BD solo su hash SHA-256.

pub mod input;
pub mod model;
pub mod service;

pub use input::CreateApiKey;
pub use model::{ApiKeyListItem, ApiKeyRecord, GeneratedApiKey};
pub use service::{find_by_hash, generate, hash_key, list, revoke, touch_last_used};
