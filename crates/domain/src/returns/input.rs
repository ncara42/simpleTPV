//! Entradas de devoluciones (DTOs) — port de `returns.dto.ts` (con ticket).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_quantity, MAX_NOTES_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

const MAX_LINES: usize = 200;
const MAX_PIN_LEN: usize = 8;

/// Línea de devolución contra una `SaleLine`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateReturnLine {
    pub sale_line_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub qty: Decimal,
}

/// `POST /returns`: devolución contra un ticket de venta.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateReturn {
    pub sale_id: Uuid,
    pub reason: String,
    pub lines: Vec<CreateReturnLine>,
}

impl CreateReturn {
    pub fn validate(&self) -> Result<(), AppError> {
        let reason_len = self.reason.chars().count();
        if !(1..=MAX_NOTES_LENGTH).contains(&reason_len) {
            return Err(AppError::BadRequest);
        }
        if self.lines.is_empty() || self.lines.len() > MAX_LINES {
            return Err(AppError::BadRequest);
        }
        for l in &self.lines {
            validate_qty(l.qty)?;
        }
        Ok(())
    }
}

/// Línea de devolución ciega (sin venta de origen): por producto.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlindReturnLine {
    pub product_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub qty: Decimal,
}

/// `POST /returns/blind`: devolución SIN ticket, requiere PIN de MANAGER/ADMIN.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateBlindReturn {
    pub store_id: Uuid,
    pub reason: String,
    pub manager_pin: String,
    pub lines: Vec<BlindReturnLine>,
}

impl CreateBlindReturn {
    pub fn validate(&self) -> Result<(), AppError> {
        let reason_len = self.reason.chars().count();
        if !(1..=MAX_NOTES_LENGTH).contains(&reason_len) {
            return Err(AppError::BadRequest);
        }
        let pin_len = self.manager_pin.chars().count();
        if !(1..=MAX_PIN_LEN).contains(&pin_len) {
            return Err(AppError::BadRequest);
        }
        if self.lines.is_empty() || self.lines.len() > MAX_LINES {
            return Err(AppError::BadRequest);
        }
        for l in &self.lines {
            validate_qty(l.qty)?;
        }
        Ok(())
    }
}

/// qty > 0, ≤ MAX_QUANTITY, máx 3 decimales.
fn validate_qty(qty: Decimal) -> Result<(), AppError> {
    if qty <= Decimal::ZERO || qty > max_quantity() || qty.normalize().scale() > 3 {
        Err(AppError::BadRequest)
    } else {
        Ok(())
    }
}
