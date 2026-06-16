//! Entradas de devoluciones (DTOs) — port de `returns.dto.ts` (con ticket).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_quantity, MAX_NOTES_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

const MAX_LINES: usize = 200;

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
            // qty > 0, ≤ MAX_QUANTITY, máx 3 decimales.
            if l.qty <= Decimal::ZERO || l.qty > max_quantity() || l.qty.normalize().scale() > 3 {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}
