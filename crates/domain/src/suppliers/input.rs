//! Entradas y validación de proveedores/tarifas (#153) — port de los DTOs.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_price, MAX_NAME_LENGTH, MAX_NIF_LENGTH, MAX_PHONE_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::users::input::valid_email;

fn opt_len_ok(v: &Option<String>, max: usize) -> bool {
    v.as_ref().map(|s| s.chars().count() <= max).unwrap_or(true)
}

fn opt_email_ok(v: &Option<String>) -> bool {
    v.as_ref().map(|s| valid_email(s)).unwrap_or(true)
}

/// Tope de la periodicidad de compra (días). Alineado con el máximo de cobertura
/// de la propuesta (`MAX_COVERAGE_DAYS` en compras): un año.
const MAX_ORDER_FREQUENCY_DAYS: i32 = 365;

/// Periodicidad válida: `None` = sin tocar, `0` = quitar, `1..=365` = fijar.
fn order_frequency_ok(v: Option<i32>) -> bool {
    v.is_none_or(|d| (0..=MAX_ORDER_FREQUENCY_DAYS).contains(&d))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSupplier {
    pub name: String,
    pub nif: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub lead_time_days: Option<i32>,
    /// Periodicidad de compra (días): 7 semanal, 14 quincenal, 30 mensual…
    pub order_frequency_days: Option<i32>,
}

impl CreateSupplier {
    pub fn validate(&self) -> Result<(), AppError> {
        let n = self.name.trim();
        if n.is_empty()
            || n.chars().count() > MAX_NAME_LENGTH
            || !opt_len_ok(&self.nif, MAX_NIF_LENGTH)
            || !opt_email_ok(&self.email)
            || !opt_len_ok(&self.phone, MAX_PHONE_LENGTH)
            || self.lead_time_days.is_some_and(|d| d < 0)
            || !order_frequency_ok(self.order_frequency_days)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupplier {
    pub name: Option<String>,
    pub nif: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub lead_time_days: Option<i32>,
    /// `None` = sin cambios; `0` = quitar la periodicidad; `1..=365` = fijarla.
    pub order_frequency_days: Option<i32>,
}

impl UpdateSupplier {
    pub fn validate(&self) -> Result<(), AppError> {
        if let Some(n) = &self.name {
            if n.trim().is_empty() || n.chars().count() > MAX_NAME_LENGTH {
                return Err(AppError::BadRequest);
            }
        }
        if !opt_len_ok(&self.nif, MAX_NIF_LENGTH)
            || !opt_email_ok(&self.email)
            || !opt_len_ok(&self.phone, MAX_PHONE_LENGTH)
            || self.lead_time_days.is_some_and(|d| d < 0)
            || !order_frequency_ok(self.order_frequency_days)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSupplierPricesQuery {
    pub supplier_id: Option<Uuid>,
    pub product_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSupplierPrice {
    pub supplier_id: Uuid,
    pub product_id: Uuid,
    pub price: Decimal,
}

impl UpsertSupplierPrice {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.price < Decimal::ZERO || self.price > max_price() {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSupplierPrices {
    pub supplier_id: Uuid,
    pub csv: String,
}
