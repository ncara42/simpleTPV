//! Entradas de stock (DTOs de ENTRADA) — port de `stock.dto.ts`. Cantidades como
//! número JSON → `Decimal`; `deny_unknown_fields`; cotas iguales a NestJS.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_quantity, MAX_NOTES_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

/// Máximo de líneas por recuento de inventario (`@ArrayMaxSize(1000)`).
const MAX_INVENTORY_LINES: usize = 1000;

/// `PUT /stock/min`: configura el stock mínimo de un par producto+tienda.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetMin {
    pub product_id: Uuid,
    pub store_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub min_stock: Decimal,
}

impl SetMin {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_quantity(self.min_stock)
    }
}

/// `POST /stock/adjust`: fija el stock a `new_quantity` (el servicio calcula el delta).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Adjust {
    pub product_id: Uuid,
    pub store_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub new_quantity: Decimal,
    pub reason: String,
}

impl Adjust {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_quantity(self.new_quantity)?;
        validate_reason(&self.reason)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryCountLine {
    pub product_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub counted_quantity: Decimal,
}

/// `POST /stock/inventory-count`: recuento completo de una tienda (atómico).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryCount {
    pub store_id: Uuid,
    pub reason: String,
    pub lines: Vec<InventoryCountLine>,
}

impl InventoryCount {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_reason(&self.reason)?;
        if self.lines.is_empty() || self.lines.len() > MAX_INVENTORY_LINES {
            return Err(AppError::BadRequest);
        }
        for line in &self.lines {
            validate_quantity(line.counted_quantity)?;
        }
        Ok(())
    }
}

/// Cantidad de stock: 0 ≤ v ≤ MAX_QUANTITY y como mucho 3 decimales (`Decimal(12,3)`).
fn validate_quantity(v: Decimal) -> Result<(), AppError> {
    if v >= Decimal::ZERO && v <= max_quantity() && v.normalize().scale() <= 3 {
        Ok(())
    } else {
        Err(AppError::BadRequest)
    }
}

fn validate_reason(reason: &str) -> Result<(), AppError> {
    let len = reason.chars().count();
    if (1..=MAX_NOTES_LENGTH).contains(&len) {
        Ok(())
    } else {
        Err(AppError::BadRequest)
    }
}
