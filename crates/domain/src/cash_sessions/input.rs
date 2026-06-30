//! Entradas y validación de caja/movimientos (#145/#146).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::max_amount;
use simpletpv_shared::AppError;
use uuid::Uuid;

use super::model::CashMovementType;

fn parse_movement_type(s: &str) -> Result<CashMovementType, AppError> {
    match s {
        "IN" => Ok(CashMovementType::In),
        "OUT" => Ok(CashMovementType::Out),
        "TRANSFER_OUT" => Ok(CashMovementType::TransferOut),
        _ => Err(AppError::BadRequest),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCashSession {
    pub store_id: Uuid,
    pub opening_amount: Decimal,
}

impl OpenCashSession {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.opening_amount < Decimal::ZERO || self.opening_amount > max_amount() {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseCashSession {
    pub counted_amount: Decimal,
    /// Anotación libre del cajero cuando el arqueo no cuadra (opcional, máx. 500).
    #[serde(default)]
    pub closing_note: Option<String>,
}

impl CloseCashSession {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.counted_amount < Decimal::ZERO || self.counted_amount > max_amount() {
            return Err(AppError::BadRequest);
        }
        if let Some(note) = &self.closing_note {
            if note.chars().count() > 500 {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

/// Alta directa o solicitud de movimiento (mismos campos: tipo, importe, motivo).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovementInput {
    #[serde(rename = "type")]
    pub movement_type: String,
    pub amount: Decimal,
    pub reason: String,
}

impl CashMovementInput {
    /// Valida y devuelve el tipo parseado. `amount` en (0, max]; `reason` ≥ 2.
    pub fn validate(&self) -> Result<CashMovementType, AppError> {
        if self.amount <= Decimal::ZERO || self.amount > max_amount() {
            return Err(AppError::BadRequest);
        }
        if self.reason.trim().chars().count() < 2 {
            return Err(AppError::BadRequest);
        }
        parse_movement_type(&self.movement_type)
    }
}
