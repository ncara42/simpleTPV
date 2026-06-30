//! Modelos de promociones (#154 base + #275 S-22 avanzado). Catálogo de central
//! (org-wide). Las fechas `@db.Date` se emiten como `YYYY-MM-DD` (mismo criterio
//! que el stock); las horas `@db.Time` como `HH:MM` (franja horaria, S-22).

use rust_decimal::Decimal;
use serde::Serialize;
use time::{PrimitiveDateTime, Time};
use uuid::Uuid;

pg_text_enum! {
    pub enum PromoConditionType {
        MinQty = "min_qty",
        MinTicket = "min_ticket",
        // S-22: lleva X paga Y / 2x1 (por cantidad).
        QtyXy = "qty_xy",
    }
}

pg_text_enum! {
    pub enum PromoDiscountType {
        Percent = "percent",
        Amount = "amount",
    }
}

pg_text_enum! {
    /// A qué se aplica la promo (S-22). TICKET = umbral global; PRODUCT/FAMILY =
    /// scope N:M (`PromotionProduct`/`PromotionFamily`).
    pub enum PromoAppliesTo {
        Ticket = "TICKET",
        Product = "PRODUCT",
        Family = "FAMILY",
    }
}

pg_text_enum! {
    /// Si el importe del descuento se calcula sobre el ticket completo o por línea (S-22).
    pub enum PromoAmountScope {
        Ticket = "TICKET",
        Line = "LINE",
    }
}

/// Serializa `time::Time` como `HH:MM` (franja horaria; segundos irrelevantes).
fn time_hhmm<S: serde::Serializer>(t: &Option<Time>, s: S) -> Result<S::Ok, S::Error> {
    match t {
        Some(t) => s.serialize_some(&format!("{:02}:{:02}", t.hour(), t.minute())),
        None => s.serialize_none(),
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
    // S-22.
    pub applies_to: PromoAppliesTo,
    pub amount_scope: PromoAmountScope,
    #[serde(serialize_with = "time_hhmm")]
    pub start_time: Option<Time>,
    #[serde(serialize_with = "time_hhmm")]
    pub end_time: Option<Time>,
    /// Días de la semana 0=Dom..6=Sáb. Vacío = todos los días.
    pub weekdays: Vec<i16>,
    pub stackable: bool,
    pub clerk_can_skip: bool,
    pub buy_qty: Option<i32>,
    pub pay_qty: Option<i32>,
    pub priority: i32,
    // Scopes N:M agregados en la propia query (array_agg + COALESCE → siempre
    // presentes como columna, vacíos si la promo no tiene scope).
    pub product_ids: Vec<Uuid>,
    pub family_ids: Vec<Uuid>,
    pub store_ids: Vec<Uuid>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
}
