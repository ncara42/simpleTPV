//! Modelos de ventas: enums Postgres, filas `Sale`/`SaleLine` y la respuesta con
//! líneas. Importes como string normalizado (paridad Prisma), fechas ISO-8601.

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

use super::domain::TaxBreakdownItem;

pg_text_enum! {
    /// Método de pago (enum `PaymentMethod` de Prisma/Postgres).
    pub enum PaymentMethod {
        Cash = "CASH",
        Card = "CARD",
    }
}

pg_text_enum! {
    /// Estado de la venta (enum `SaleStatus`).
    pub enum SaleStatus {
        Completed = "COMPLETED",
        Voided = "VOIDED",
    }
}

pg_text_enum! {
    /// Origen del descuento de una línea (enum `DiscountSource`).
    pub enum DiscountSource {
        Voluntary = "VOLUNTARY",
        Promotion = "PROMOTION",
    }
}

pg_text_enum! {
    /// Estado de un export de ventas (`SalesExportStatus`).
    pub enum SalesExportStatus {
        Pending = "PENDING",
        Processing = "PROCESSING",
        Completed = "COMPLETED",
        Failed = "FAILED",
    }
}

/// Fila de `Sale`. Solo SALIDA: `FromRow` + `Serialize`.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sale {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub store_id: Uuid,
    pub user_id: Uuid,
    pub ticket_number: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub subtotal: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_total: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    pub payment_method: PaymentMethod,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub cash_given: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub cash_change: Option<Decimal>,
    pub status: SaleStatus,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub voided_at: Option<PrimitiveDateTime>,
    pub voided_by: Option<Uuid>,
    pub client_id: Option<Uuid>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Fila de `SaleLine`. Solo SALIDA.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleLine {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub sale_id: Uuid,
    pub product_id: Uuid,
    pub name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub unit_price: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub qty: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_pct: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_amt: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub tax_rate: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub cost_price: Decimal,
    pub discount_source: DiscountSource,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub line_total: Decimal,
}

/// Venta con sus líneas (respuesta de creación / consulta por ticket).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleWithLines {
    #[serde(flatten)]
    pub sale: Sale,
    pub lines: Vec<SaleLine>,
}

/// Rango de números de ticket reservado para uso offline.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketBlock {
    pub code: String,
    pub from: i64,
    pub to: i64,
}

/// Página del historial de ventas.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesPage {
    pub items: Vec<Sale>,
    pub page: i64,
    pub page_size: i64,
    pub total_items: i64,
}

/// Metadatos de un export de ventas (sin el CSV, que puede ser grande).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesExportMeta {
    pub id: Uuid,
    pub status: SalesExportStatus,
    pub row_count: Option<i32>,
    pub error: Option<String>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub completed_at: Option<PrimitiveDateTime>,
}

/// Datos fiscales de la organización para el ticket (#152).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgInfo {
    pub name: String,
    pub nif: Option<String>,
}

/// Datos de la tienda para el ticket.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreInfo {
    pub name: String,
    pub code: String,
}

/// Línea del ticket fiscal (importes como string normalizado).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketLine {
    pub name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub qty: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub unit_price: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_pct: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_amt: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub line_total: Decimal,
}

/// Datos completos del ticket/factura simplificada (#152). Salida JSON de
/// `GET /sales/:id/ticket` y entrada de `render_receipt_html`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketData {
    pub organization: OrgInfo,
    pub store: StoreInfo,
    pub ticket_number: String,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    pub lines: Vec<TicketLine>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub subtotal: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_total: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    pub payment_method: PaymentMethod,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub cash_given: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub cash_change: Option<Decimal>,
    pub tax_breakdown: Vec<TaxBreakdownItem>,
}
