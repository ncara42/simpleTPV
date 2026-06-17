//! Modelos de dispositivos oficiales (TPV) (#154, Fase 4). El token de
//! emparejamiento se guarda SOLO como hash SHA-256 (KEY-01); el plano se
//! devuelve una única vez al crear. Las vistas públicas nunca exponen el hash.

use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Columnas de `OfficialDevice` con alias snake_case para `FromRow`.
pub(crate) const DEVICE_COLS: &str = r#"id, "organizationId" AS organization_id,
    "storeId" AS store_id, name, "pairingToken" AS pairing_token, authorized,
    "pairedAt" AS paired_at, "lastSeenAt" AS last_seen_at, "createdAt" AS created_at"#;

/// Fila interna (incluye el hash del token; NUNCA se serializa al cliente).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeviceRow {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub store_id: Uuid,
    pub name: String,
    pub pairing_token: String,
    pub authorized: bool,
    pub paired_at: Option<PrimitiveDateTime>,
    pub last_seen_at: Option<PrimitiveDateTime>,
    pub created_at: PrimitiveDateTime,
}

/// Vista pública (sin token ni hash) — paridad con `publicDevice`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicDevice {
    pub id: Uuid,
    pub store_id: Uuid,
    pub name: String,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub paired_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub last_seen_at: Option<PrimitiveDateTime>,
}

impl From<&DeviceRow> for PublicDevice {
    fn from(d: &DeviceRow) -> Self {
        PublicDevice {
            id: d.id,
            store_id: d.store_id,
            name: d.name.clone(),
            paired_at: d.paired_at,
            last_seen_at: d.last_seen_at,
        }
    }
}

/// Item de listado: vista pública + estado de autorización.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceListItem {
    #[serde(flatten)]
    pub device: PublicDevice,
    pub authorized: bool,
}

/// Respuesta de creación: pública + authorized + token en claro (una sola vez).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedDevice {
    #[serde(flatten)]
    pub device: PublicDevice,
    pub pairing_token: String,
    pub authorized: bool,
}

/// Estado de emparejamiento (`current`/`pair`). `device` es null si no autorizado.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub authorized: bool,
    pub device: Option<PublicDevice>,
}
