//! Modelos de devoluciones: filas `Return`/`ReturnLine` y la respuesta con líneas.

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Fila de `Return`. Solo SALIDA: `FromRow` + `Serialize`.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Return {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub store_id: Uuid,
    pub user_id: Uuid,
    /// `None` en devoluciones ciegas (sin ticket de origen).
    pub sale_id: Option<Uuid>,
    /// MANAGER/ADMIN que autorizó (devoluciones ciegas, 4-ojos); `None` con ticket.
    pub authorized_by: Option<Uuid>,
    pub reason: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Fila de `ReturnLine`. Solo SALIDA.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnLine {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub return_id: Uuid,
    /// `None` en devoluciones ciegas (sin línea de venta de referencia).
    pub sale_line_id: Option<Uuid>,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub qty: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub line_total: Decimal,
}

/// Devolución con sus líneas (respuesta de creación / listado).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnWithLines {
    #[serde(flatten)]
    pub return_: Return,
    pub lines: Vec<ReturnLine>,
}
