//! Modelos de stock: enums Postgres (`MovementType`, `AlertType`), la fila
//! `StockMovement` y los DTOs de salida (respuestas JSON con formato Prisma).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

use super::domain::{ExpiryStatus, StockLevel};

pg_text_enum! {
    /// Tipo de movimiento de stock (enum `MovementType` de Prisma/Postgres).
    pub enum MovementType {
        Sale = "SALE",
        Return = "RETURN",
        TransferIn = "TRANSFER_IN",
        TransferOut = "TRANSFER_OUT",
        PurchaseReceipt = "PURCHASE_RECEIPT",
        Adjustment = "ADJUSTMENT",
    }
}

pg_text_enum! {
    /// Tipo de alerta de stock (enum `AlertType` de Prisma/Postgres).
    pub enum AlertType {
        LowStock = "LOW_STOCK",
        OutOfStock = "OUT_OF_STOCK",
    }
}

/// Fila de `StockMovement` (trazabilidad). Solo SALIDA: `FromRow` + `Serialize`.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMovement {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub product_id: Uuid,
    pub store_id: Uuid,
    pub user_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub movement_type: MovementType,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity: Decimal,
    pub reference_id: Option<Uuid>,
    pub batch_id: Option<Uuid>,
    pub reason: Option<String>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Vista de stock de un par producto+tienda (respuesta de ajuste/mínimo).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockView {
    pub product_id: Uuid,
    pub store_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub min_stock: Decimal,
    pub level: StockLevel,
}

/// Resultado de un recuento de inventario (varios pares ajustados).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryCountResult {
    pub store_id: Uuid,
    pub adjusted: Vec<StockView>,
}

/// Lote caducado o próximo a caducar (vista de Notificaciones).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpiringBatch {
    pub id: Uuid,
    pub product_id: Uuid,
    pub product_name: String,
    pub store_id: Uuid,
    pub store_name: String,
    pub lot_code: String,
    /// `YYYY-MM-DD` (la columna es `@db.Date`).
    pub expiry_date: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity: Decimal,
    pub days_to_expiry: i64,
    pub status: ExpiryStatus,
}

/// Página del historial de movimientos.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementsPage {
    pub items: Vec<StockMovement>,
    pub page: i64,
    pub page_size: i64,
    pub total_items: i64,
}

/// Fila de stock por tienda (vista `GET /stock` y `to-reorder`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockByStore {
    pub product_id: Uuid,
    pub product_name: String,
    pub store_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub min_stock: Decimal,
    pub level: StockLevel,
}

/// Fila de stock de un producto por tienda (vista `GET /stock/product/:id`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockByProduct {
    pub product_id: Uuid,
    pub store_id: Uuid,
    pub store_name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub min_stock: Decimal,
    pub level: StockLevel,
}

/// Severidad de una alerta tras el anti-rotura por arquetipo (IT-13).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Critical,
    Soft,
}

/// Rotación (velocidad de venta) de un producto en la ventana reciente.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Rotation {
    Alta,
    Media,
    Baja,
}

/// Stock de un producto en una tienda (dentro de la vista global).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStoreEntry {
    pub store_id: Uuid,
    pub store_name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub min_stock: Decimal,
    pub level: StockLevel,
}

/// Stock agregado por producto (todas las tiendas + total + rotación) — vista
/// `GET /stock/global`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStockEntry {
    pub product_id: Uuid,
    pub product_name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub total: Decimal,
    pub stores: Vec<GlobalStoreEntry>,
    pub rotation: Rotation,
}

/// Alerta de stock enriquecida (vista `GET /stock/alerts`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertView {
    pub id: Uuid,
    pub product_id: Uuid,
    pub product_name: String,
    pub store_id: Uuid,
    pub store_name: String,
    pub alert_type: AlertType,
    pub has_substitute_stock: bool,
    pub severity: AlertSeverity,
    pub resolved: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}
