//! Modelos de caja y movimientos de efectivo (#145/#146).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

pg_text_enum! {
    pub enum CashSessionStatus {
        Open = "OPEN",
        Closed = "CLOSED",
    }
}

pg_text_enum! {
    pub enum CashMovementType {
        In = "IN",
        Out = "OUT",
        TransferOut = "TRANSFER_OUT",
    }
}

pg_text_enum! {
    pub enum CashMovementStatus {
        Pending = "PENDING",
        Approved = "APPROVED",
        Denied = "DENIED",
    }
}

/// Sesión de caja (salida JSON, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSession {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub store_id: Uuid,
    pub user_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub opening_amount: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub closing_amount: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub expected_amount: Option<Decimal>,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub difference: Option<Decimal>,
    pub status: CashSessionStatus,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub opened_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub closed_at: Option<PrimitiveDateTime>,
}

/// Movimiento de efectivo (salida JSON, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovement {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub cash_session_id: Uuid,
    pub store_id: Uuid,
    pub user_id: Uuid,
    #[serde(rename = "type")]
    pub movement_type: CashMovementType,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub amount: Decimal,
    pub reason: String,
    pub status: CashMovementStatus,
    pub requested_by_id: Uuid,
    pub reviewed_by_id: Option<Uuid>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub reviewed_at: Option<PrimitiveDateTime>,
    pub target_store_id: Option<Uuid>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Solicitud PENDING enriquecida con nombre de tienda y de solicitante (campana,
/// #146 D-7). `storeName`/`requestedByName` son campos planos (el frontend los
/// lee directamente); divergencia de forma menor frente al `store:{name}` anidado.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMovement {
    pub id: Uuid,
    pub cash_session_id: Uuid,
    pub store_id: Uuid,
    pub store_name: String,
    #[serde(rename = "type")]
    pub movement_type: CashMovementType,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub amount: Decimal,
    pub reason: String,
    pub requested_by_id: Uuid,
    pub requested_by_name: String,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}
