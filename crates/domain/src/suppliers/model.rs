//! Modelos de proveedores y tarifas de compra (#153).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Proveedor (salida JSON, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub nif: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub lead_time_days: i32,
    /// Periodicidad de compra (días): 7 semanal, 14 quincenal, 30 mensual…
    /// `None` = sin definir (la propuesta usa su cobertura por defecto).
    pub order_frequency_days: Option<i32>,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Tarifa de compra con nombres resueltos. `price` como NÚMERO (paridad NestJS,
/// que hace `Number(r.price)`).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPriceRow {
    pub id: Uuid,
    pub supplier_id: Uuid,
    pub supplier_name: String,
    pub product_id: Uuid,
    pub product_name: String,
    pub sku: Option<String>,
    #[serde(serialize_with = "rust_decimal::serde::float::serialize")]
    pub price: Decimal,
}

/// Tarifa de un proveedor concreto dentro de la comparativa.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceEntry {
    pub supplier_id: Uuid,
    pub supplier_name: String,
    #[serde(serialize_with = "rust_decimal::serde::float::serialize")]
    pub price: Decimal,
}

/// Fila de la comparativa: un producto y sus tarifas por proveedor + la mejor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonRow {
    pub product_id: Uuid,
    pub product_name: String,
    pub sku: Option<String>,
    pub prices: Vec<PriceEntry>,
    pub best: Option<PriceEntry>,
}
