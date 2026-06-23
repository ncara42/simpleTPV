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
    /// Factura completa F1: NIF y razón social del destinatario (NULL en F2).
    pub customer_tax_id: Option<String>,
    pub customer_name: Option<String>,
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

/// Agregados del listado de ventas (SOLO sobre ventas COMPLETED del filtro; las
/// VOIDED se listan pero no suman). `avg_*_pct` son ratios (0..1).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesTotals {
    pub count: i64,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total_amount: Decimal,
    // Ratios (0..1): el frontend los consume como NÚMERO (paridad NestJS, que los
    // emite como float). Serializarlos como string los rompería (`fmtRate` → '—').
    #[serde(serialize_with = "rust_decimal::serde::float::serialize")]
    pub avg_discount_pct: Decimal,
    #[serde(serialize_with = "rust_decimal::serde::float::serialize")]
    pub avg_margin_pct: Decimal,
}

/// KPIs de un periodo para la comparativa de estadísticas (S-10). Mismos importes
/// que `SalesTotals` pero sin las tasas de descuento/margen (la comparativa pinta
/// total facturado, nº de tickets y ticket medio). `total_amount` como string
/// normalizado (paridad Prisma); `count` como número.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesStatsTotals {
    pub count: i64,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total_amount: Decimal,
}

/// Punto de la serie temporal de ventas (S-10): un bucket diario
/// (`date_trunc('day', createdAt)`) con su nº de tickets e importe. Solo días con
/// ventas COMPLETED (la BD no rellena los huecos). `bucket` es la fecha ISO
/// `YYYY-MM-DD` del día.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesSeriesPoint {
    pub bucket: String,
    pub count: i64,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
}

/// Estadísticas de ventas embebidas en la page Ventas (S-10): serie temporal +
/// KPIs del periodo actual + KPIs del periodo anterior equivalente (comparativa).
/// Se calcula sobre el MISMO `SalesFilter` que `GET /sales`, solo ventas COMPLETED.
/// `previous` es `None` cuando el filtro no acota un rango de fechas (sin
/// `from`/`to`/`date`): sin rango no hay "periodo anterior" bien definido, así que
/// la comparativa se omite en lugar de inventar una ventana arbitraria.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesStats {
    pub series: Vec<SalesSeriesPoint>,
    pub current: SalesStatsTotals,
    pub previous: Option<SalesStatsTotals>,
}

/// Fila del historial: venta + nombres denormalizados de tienda y vendedor (el frontend
/// los pinta como columnas «Tienda»/«Vendedor»). NestJS los servía como relaciones anidadas;
/// aquí van planos (`storeName`/`sellerName`) para no re-anidar en SQL.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleListItem {
    #[serde(flatten)]
    pub sale: Sale,
    pub store_name: String,
    pub seller_name: String,
}

/// Página del historial de ventas.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesPage {
    pub items: Vec<SaleListItem>,
    pub page: i64,
    pub page_size: i64,
    pub total_items: i64,
    pub totals: SalesTotals,
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
