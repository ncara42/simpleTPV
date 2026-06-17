//! Modelos de salida del dashboard (#154). Los KPIs se calculaban en NestJS con
//! `Number`, así que se emiten como NÚMERO JSON: aquí los campos son `f64` y
//! serde los serializa directamente como número (paridad con el contrato).

use serde::Serialize;
use uuid::Uuid;

// ── sales-today (comparativa por tienda + intradía) ──────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodTotals {
    pub total: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreSales {
    pub store_id: Uuid,
    pub store_name: String,
    pub today: f64,
    pub yesterday: f64,
    pub delta_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesToday {
    pub today: PeriodTotals,
    pub yesterday: PeriodTotals,
    pub delta_pct: Option<f64>,
    pub by_store: Vec<StoreSales>,
    pub intraday: Vec<f64>,
}

// ── sales-kpis (KPIs de venta + series intra-periodo) ────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesKpiSeries {
    pub avg_ticket: Vec<f64>,
    pub upt: Vec<f64>,
    pub discount_rate: Vec<f64>,
    pub return_rate: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesKpis {
    pub sales_count: i64,
    pub revenue: f64,
    pub avg_ticket: f64,
    pub upt: f64,
    pub discount_rate: f64,
    pub return_rate: f64,
    pub series: SalesKpiSeries,
}
