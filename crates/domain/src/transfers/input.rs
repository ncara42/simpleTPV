//! Entradas y validación de traspasos (#153).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_quantity, MAX_ARRAY_SIZE, MAX_NOTES_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransferLine {
    pub product_id: Uuid,
    pub quantity_sent: Decimal,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransfer {
    pub origin_store_id: Uuid,
    pub dest_store_id: Uuid,
    pub notes: Option<String>,
    pub lines: Vec<CreateTransferLine>,
}

impl CreateTransfer {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.origin_store_id == self.dest_store_id {
            return Err(AppError::BadRequest); // origen y destino distintos
        }
        if self.lines.is_empty() || self.lines.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        if self
            .notes
            .as_ref()
            .is_some_and(|n| n.chars().count() > MAX_NOTES_LENGTH)
        {
            return Err(AppError::BadRequest);
        }
        let max = max_quantity();
        for l in &self.lines {
            if l.quantity_sent <= Decimal::ZERO || l.quantity_sent > max {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveTransferLine {
    pub line_id: Uuid,
    pub quantity_received: Decimal,
    pub discrepancy_note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveTransfer {
    pub lines: Vec<ReceiveTransferLine>,
}

impl ReceiveTransfer {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.lines.is_empty() || self.lines.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        let max = max_quantity();
        for l in &self.lines {
            if l.quantity_received < Decimal::ZERO || l.quantity_received > max {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}
