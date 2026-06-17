//! Modelos de los recursos del usuario autenticado (#154).

use serde::Serialize;
use uuid::Uuid;

/// Perfil del usuario autenticado: rol (del JWT) + tiendas asignadas + identidad.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeProfile {
    pub role: String,
    pub store_ids: Vec<Uuid>,
    pub name: String,
    pub email: String,
}

/// Preferencia persistida (clave + valor JSON arbitrario del propio usuario).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPreference {
    pub key: String,
    pub value: serde_json::Value,
}
