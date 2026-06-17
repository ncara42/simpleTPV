//! Entradas y validación de tarifas B2B (#154) — port de los DTOs.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::max_price;
use simpletpv_shared::AppError;
use uuid::Uuid;

const MAX_NAME: usize = 120;

fn name_ok(n: &str) -> bool {
    let t = n.trim();
    !t.is_empty() && t.chars().count() <= MAX_NAME
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePriceList {
    pub name: String,
}

impl CreatePriceList {
    pub fn validate(&self) -> Result<(), AppError> {
        if !name_ok(&self.name) {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePriceList {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub active: Option<bool>,
}

impl UpdatePriceList {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| !name_ok(n)) {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPriceListItem {
    pub product_id: Uuid,
    pub price: Decimal,
}

impl SetPriceListItem {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.price < Decimal::ZERO || self.price > max_price() {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
