//! Entradas y validación de promociones (#154) — port de los DTOs.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::max_price;
use simpletpv_shared::AppError;

use super::model::{PromoConditionType, PromoDiscountType};

const MAX_THRESHOLD: i32 = 1_000_000;

/// `YYYY-MM-DD` (10 chars, dígitos y guiones en posición).
fn date_ok(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..].iter().all(u8::is_ascii_digit)
}

fn threshold_ok(t: i32) -> bool {
    (1..=MAX_THRESHOLD).contains(&t)
}

fn discount_ok(d: Decimal) -> bool {
    d >= Decimal::ZERO && d <= max_price()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePromotion {
    pub name: String,
    pub condition_type: PromoConditionType,
    pub threshold: i32,
    pub discount_type: PromoDiscountType,
    pub discount_value: Decimal,
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub active: Option<bool>,
}

impl CreatePromotion {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty()
            || !threshold_ok(self.threshold)
            || !discount_ok(self.discount_value)
            || !date_ok(&self.start_date)
            || !date_ok(&self.end_date)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePromotion {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub condition_type: Option<PromoConditionType>,
    #[serde(default)]
    pub threshold: Option<i32>,
    #[serde(default)]
    pub discount_type: Option<PromoDiscountType>,
    #[serde(default)]
    pub discount_value: Option<Decimal>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub active: Option<bool>,
}

impl UpdatePromotion {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| n.trim().is_empty())
            || self.threshold.is_some_and(|t| !threshold_ok(t))
            || self.discount_value.is_some_and(|d| !discount_ok(d))
            || self.start_date.as_ref().is_some_and(|s| !date_ok(s))
            || self.end_date.as_ref().is_some_and(|s| !date_ok(s))
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
