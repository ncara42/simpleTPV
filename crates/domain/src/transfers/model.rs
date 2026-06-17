//! Modelos de traspasos entre tiendas (#153).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

pg_text_enum! {
    /// Estado del traspaso (enum `TransferStatus`).
    pub enum TransferStatus {
        Draft = "DRAFT",
        Sent = "SENT",
        Received = "RECEIVED",
        Closed = "CLOSED",
    }
}

/// Cabecera del traspaso (salida JSON, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub origin_store_id: Uuid,
    pub dest_store_id: Uuid,
    pub status: TransferStatus,
    pub notes: Option<String>,
    pub created_by: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub sent_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub received_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub closed_at: Option<PrimitiveDateTime>,
}

/// Fila plana de línea (con datos del producto) para mapear a [`TransferLine`].
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TransferLineRow {
    pub id: Uuid,
    pub transfer_id: Uuid,
    pub product_id: Uuid,
    pub quantity_sent: Decimal,
    pub quantity_received: Option<Decimal>,
    pub discrepancy: Option<Decimal>,
    pub discrepancy_note: Option<String>,
    pub product_name: String,
    pub product_barcode: Option<String>,
    pub product_tracks_batch: bool,
}

/// Producto resumido dentro de la línea del traspaso.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductBrief {
    pub name: String,
    pub barcode: Option<String>,
    pub tracks_batch: bool,
}

/// Línea del traspaso (cantidades como string, paridad Prisma).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferLine {
    pub id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub quantity_sent: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub quantity_received: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub discrepancy: Option<Decimal>,
    pub discrepancy_note: Option<String>,
    pub product: ProductBrief,
}

impl From<TransferLineRow> for TransferLine {
    fn from(r: TransferLineRow) -> Self {
        TransferLine {
            id: r.id,
            product_id: r.product_id,
            quantity_sent: r.quantity_sent,
            quantity_received: r.quantity_received,
            discrepancy: r.discrepancy,
            discrepancy_note: r.discrepancy_note,
            product: ProductBrief {
                name: r.product_name,
                barcode: r.product_barcode,
                tracks_batch: r.product_tracks_batch,
            },
        }
    }
}

/// Traspaso con sus líneas (respuesta de todas las operaciones).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferWithLines {
    #[serde(flatten)]
    pub transfer: Transfer,
    pub lines: Vec<TransferLine>,
}
