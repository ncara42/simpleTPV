//! Marca corporativa de la organización (#154, Fase 4, U-08). Color primario y
//! logo (data-URL acotada). `null` = valor por defecto del sistema.

use serde::Serialize;

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branding {
    pub brand_color: Option<String>,
    pub logo_url: Option<String>,
}
