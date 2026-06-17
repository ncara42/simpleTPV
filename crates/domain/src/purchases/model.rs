//! Modelos de pedidos a proveedor (#153).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

pg_text_enum! {
    /// Estado del pedido (enum `PurchaseOrderStatus`).
    pub enum PurchaseOrderStatus {
        Draft = "DRAFT",
        Confirmed = "CONFIRMED",
        PartiallyReceived = "PARTIALLY_RECEIVED",
        Received = "RECEIVED",
    }
}

/// Cabecera del pedido (salida JSON, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrder {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub supplier_id: Uuid,
    pub store_id: Uuid,
    pub status: PurchaseOrderStatus,
    pub notes: Option<String>,
    pub created_by: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub confirmed_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub received_at: Option<PrimitiveDateTime>,
}

/// Línea del pedido (cantidades/coste como string, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderLine {
    pub id: Uuid,
    pub purchase_order_id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity_ordered: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity_received: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub unit_cost: Option<Decimal>,
}

/// KPIs del pedido (ratios/días como número, paridad NestJS).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Kpis {
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_float")]
    pub lead_time_days: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_float")]
    pub fill_rate: Option<Decimal>,
}

/// Pedido con líneas (+ KPIs en `get`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderWithLines {
    #[serde(flatten)]
    pub order: PurchaseOrder,
    pub lines: Vec<PurchaseOrderLine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kpis: Option<Kpis>,
}

/// Fila de la propuesta de reposición (#45). Números (paridad NestJS).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionRow {
    pub product_id: Uuid,
    pub product_name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub stock_actual: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub min_stock: Decimal,
    #[serde(
        rename = "ventaMedia30d",
        serialize_with = "crate::serde_helpers::decimal_float"
    )]
    pub venta_media_30d: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub venta_media_diaria: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_float")]
    pub rotacion: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_float")]
    pub cobertura_dias: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub cantidad_sugerida: Decimal,
}
