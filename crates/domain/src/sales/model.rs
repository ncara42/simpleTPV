//! Modelos de ventas: enums Postgres, filas `Sale`/`SaleLine` y la respuesta con
//! líneas. Importes como string normalizado (paridad Prisma), fechas ISO-8601.

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

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
