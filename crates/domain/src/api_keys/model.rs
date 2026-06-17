//! Modelos de API keys (#154, IT-18). La key en claro se muestra UNA vez al
//! crear; en BD solo vive `sha256(key)` (hex). Las vistas nunca exponen el hash.

use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Respuesta de creación: incluye la key en claro (única vez).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedApiKey {
    pub id: Uuid,
    pub name: String,
    pub prefix: String,
    pub key: String,
}

/// Item de listado (sin hash ni key en claro).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyListItem {
    pub id: Uuid,
    pub name: String,
    pub prefix: String,
    pub price_list_id: Option<Uuid>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub last_used_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub revoked_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub expires_at: Option<PrimitiveDateTime>,
}

/// Registro mínimo para la autenticación pre-tenant (lookup por hash, BYPASSRLS).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ApiKeyRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub price_list_id: Option<Uuid>,
    pub revoked_at: Option<PrimitiveDateTime>,
    pub expires_at: Option<PrimitiveDateTime>,
}
