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

// ── sales-kpis ───────────────────────────────────────────────────────────────

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

// ── sales-by-family / hour / employee + discount-by-employee ─────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesByFamilyItem {
    pub family_id: Option<Uuid>,
    pub family_name: String,
    pub color: Option<String>,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesByHourItem {
    pub hour: i32,
    pub count: i64,
    pub revenue: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscountByEmployeeItem {
    pub user_id: Uuid,
    pub user_name: String,
    pub sales_count: i64,
    pub avg_discount_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesByEmployeeItem {
    pub user_id: Uuid,
    pub user_name: String,
    pub sales_count: i64,
    pub total: f64,
}

// ── margin-kpis / stockout-kpis ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginKpis {
    pub gross_margin: f64,
    pub real_margin: f64,
    pub margin_pct: f64,
    pub revenue: f64,
    pub series: Vec<f64>,
    pub real_margin_series: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockoutKpis {
    pub events: i64,
    pub resolved: i64,
    pub open: i64,
    pub avg_duration_hours: Option<f64>,
    pub rate: f64,
    pub estimated_lost_sales: f64,
}

// ── product-rankings ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankBySales {
    pub product_id: Uuid,
    pub name: String,
    pub total: f64,
    pub units: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankByMargin {
    pub product_id: Uuid,
    pub name: String,
    pub margin: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankByUnits {
    pub product_id: Uuid,
    pub name: String,
    pub units: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductRankings {
    pub top_sales: Vec<RankBySales>,
    pub top_margin: Vec<RankByMargin>,
    pub worst_rotation: Vec<RankByUnits>,
}

/// Una fila de ranking proyectada a una forma uniforme (`value`) para que las piezas
/// de gráfica la rendericen vía `valueField:'value'`. Ver #225: el endpoint completo
/// devuelve tres listas y `toRecords` solo alcanza la primera; con `?rankBy=` se
/// devuelve una única lista `items` con esta forma común.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedProduct {
    pub product_id: Uuid,
    pub name: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedProducts {
    pub items: Vec<RankedProduct>,
}

// ── product-rotation / archetype-rotation ────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductRotationItem {
    pub product_id: Uuid,
    pub name: String,
    pub units: f64,
    pub days_since_last_sale: Option<i64>,
    pub trend: Vec<f64>,
    pub is_new: bool,
    pub archetype_avg_daily: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypeRotationItem {
    pub family_id: Option<Uuid>,
    pub family_name: String,
    pub product_count: i64,
    pub units: f64,
    pub venta_media_diaria: f64,
    pub days_since_last_sale: Option<i64>,
    pub trend: Vec<f64>,
}
