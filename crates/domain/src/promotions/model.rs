//! Modelos de promociones (#154, Fase 4). Catálogo de central (org-wide). Las
//! fechas `@db.Date` se emiten como `YYYY-MM-DD` (mismo criterio que el stock).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

pg_text_enum! {
    pub enum PromoConditionType {
        MinQty = "min_qty",
        MinTicket = "min_ticket",
    }
}

pg_text_enum! {
    pub enum PromoDiscountType {
        Percent = "percent",
        Amount = "amount",
    }
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Promotion {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub condition_type: PromoConditionType,
    pub threshold: i32,
    pub discount_type: PromoDiscountType,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub discount_value: Decimal,
    pub start_date: String,
    pub end_date: String,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
}
