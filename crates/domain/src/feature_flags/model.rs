//! Modelos de salida de la gestión de feature flags (#154).

use serde::Serialize;
use uuid::Uuid;

/// Entrada del catálogo (clave + etiqueta + default del código), para la matriz UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub key: String,
    pub label: String,
    pub default: bool,
}

/// Fila explícita del tenant: default de org (`storeId` NULL) u override de tienda.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FlagRow {
    pub key: String,
    pub store_id: Option<Uuid>,
    pub enabled: bool,
}

/// Catálogo + filas explícitas, para pintar la matriz módulos × tiendas.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureFlagList {
    pub catalog: Vec<CatalogEntry>,
    pub flags: Vec<FlagRow>,
}
