//! Modelos de pedidos mayoristas B2B (#154, IT-17c). El precio de cada línea se
//! congela al crear (desde la tarifa del cliente o el PVP). Importes `Decimal`
//! (string en JSON, paridad Prisma).

use rust_decimal::Decimal;
use serde::Serialize;
use time::{Date, PrimitiveDateTime};
use uuid::Uuid;

// El cobro mayorista reutiliza el enum del ledger retail (PENDING/PAID): un pedido
// nace PENDING (a crédito) y se marca PAID al cobrar. VENCIDO es virtual.
pub use crate::sales::model::PaymentStatus;

pg_text_enum! {
    pub enum WholesaleOrderStatus {
        Draft = "DRAFT",
        Confirmed = "CONFIRMED",
        Shipped = "SHIPPED",
        Cancelled = "CANCELLED",
    }
}

/// Línea "plana" (respuesta de `create`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderLine {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub order_id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub qty: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub unit_price: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub line_total: Decimal,
}

/// Cliente anidado en `create` (solo nombre).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerName {
    pub name: String,
}

/// Respuesta de `create`: cabecera + cliente {name} + líneas planas.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WholesaleOrderCreated {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub customer_id: Uuid,
    pub status: WholesaleOrderStatus,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    pub notes: Option<String>,
    pub payment_status: PaymentStatus,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_date")]
    pub due_date: Option<Date>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub paid_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
    pub customer: CustomerName,
    pub lines: Vec<OrderLine>,
}

/// Cliente anidado en `get` (nombre + NIF).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerNameNif {
    pub name: String,
    pub nif: Option<String>,
}

/// Producto anidado en una línea de `get`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductName {
    pub name: String,
}

/// Línea con producto anidado (respuesta de `get`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderLineDetail {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub order_id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub qty: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub unit_price: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub line_total: Decimal,
    pub product: ProductName,
}

/// Respuesta de `get`: cabecera + cliente {name, nif} + líneas con producto.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WholesaleOrderDetail {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub customer_id: Uuid,
    pub status: WholesaleOrderStatus,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    pub notes: Option<String>,
    pub payment_status: PaymentStatus,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_date")]
    pub due_date: Option<Date>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub paid_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
    pub customer: CustomerNameNif,
    pub lines: Vec<OrderLineDetail>,
}

/// Item del listado paginado.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WholesaleOrderListItem {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub customer_name: String,
    pub status: WholesaleOrderStatus,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    pub line_count: i64,
    pub payment_status: PaymentStatus,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_date")]
    pub due_date: Option<Date>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub paid_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WholesaleOrderPage {
    pub items: Vec<WholesaleOrderListItem>,
    pub page: i64,
    pub page_size: i64,
    pub total_items: i64,
}

/// Respuesta de `updateStatus` (solo id + estado).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResult {
    pub id: Uuid,
    pub status: WholesaleOrderStatus,
}
