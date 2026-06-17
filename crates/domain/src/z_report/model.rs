//! Modelos del cierre Z (arqueo fiscal diario por tienda, #124, Fase 4). El
//! informe se calculaba en NestJS con `Number`, así que los importes se emiten
//! como NÚMERO JSON (no string) — `decimal_float`.

use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZReportStore {
    pub id: Uuid,
    pub name: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZReportTaxRow {
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub tax_rate: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub base: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub cuota: Decimal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZReportPaymentRow {
    pub payment_method: String,
    pub count: i64,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub total: Decimal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZReport {
    pub store: ZReportStore,
    pub date: String,
    pub ticket_count: i64,
    pub voided_count: i64,
    pub first_ticket_number: Option<String>,
    pub last_ticket_number: Option<String>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub subtotal: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub discount_total: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub total: Decimal,
    pub tax_breakdown: Vec<ZReportTaxRow>,
    pub payment_breakdown: Vec<ZReportPaymentRow>,
}

/// Línea de una venta para el cálculo (tipo de IVA + total de línea con IVA).
#[derive(Debug, Clone)]
pub struct ZReportSaleLine {
    pub tax_rate: Decimal,
    pub line_total: Decimal,
}

/// Venta del día que entra al cálculo del cierre Z.
#[derive(Debug, Clone)]
pub struct ZReportSale {
    pub ticket_number: String,
    pub status: String,
    pub payment_method: String,
    pub subtotal: Decimal,
    pub total: Decimal,
    pub discount_total: Decimal,
    pub lines: Vec<ZReportSaleLine>,
}
