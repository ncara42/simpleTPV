//! Entradas y validación de tiendas (#153) — port de los DTOs.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_price, MAX_ADDRESS_LENGTH, MAX_CODE_LENGTH, MAX_NAME_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

fn name_ok(n: &str) -> bool {
    let t = n.trim();
    !t.is_empty() && t.chars().count() <= MAX_NAME_LENGTH
}
fn code_ok(c: &str) -> bool {
    let t = c.trim();
    !t.is_empty() && t.chars().count() <= MAX_CODE_LENGTH
}
fn addr_ok(a: &Option<String>) -> bool {
    a.as_ref()
        .map(|s| s.chars().count() <= MAX_ADDRESS_LENGTH)
        .unwrap_or(true)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStore {
    pub name: String,
    pub code: String,
    pub address: Option<String>,
    pub active: Option<bool>,
}

impl CreateStore {
    pub fn validate(&self) -> Result<(), AppError> {
        if !name_ok(&self.name) || !code_ok(&self.code) || !addr_ok(&self.address) {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStore {
    pub name: Option<String>,
    pub code: Option<String>,
    pub address: Option<String>,
    pub active: Option<bool>,
}

impl UpdateStore {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| !name_ok(n))
            || self.code.as_ref().is_some_and(|c| !code_ok(c))
            || !addr_ok(&self.address)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkCentral {
    pub is_central: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStoreOps {
    pub verified: Option<bool>,
    pub incident: Option<String>,
}

impl UpdateStoreOps {
    pub fn validate(&self) -> Result<(), AppError> {
        if self
            .incident
            .as_ref()
            .is_some_and(|s| s.chars().count() > 500)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetStorePrice {
    pub product_id: Uuid,
    pub price: Decimal,
}

impl SetStorePrice {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.price < Decimal::ZERO || self.price > max_price() {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct ImportStorePrices {
    pub csv: String,
}
