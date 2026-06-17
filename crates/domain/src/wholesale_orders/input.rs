//! Entradas y validación de pedidos mayoristas (#154, IT-17c) — port de los DTOs.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_quantity, MAX_ARRAY_SIZE};
use simpletpv_shared::AppError;
use uuid::Uuid;

const MAX_NOTES: usize = 1000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WholesaleOrderLineInput {
    pub product_id: Uuid,
    pub qty: Decimal,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWholesaleOrder {
    pub customer_id: Uuid,
    #[serde(default)]
    pub notes: Option<String>,
    pub lines: Vec<WholesaleOrderLineInput>,
}

impl CreateWholesaleOrder {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.lines.is_empty() || self.lines.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        if self
            .notes
            .as_ref()
            .is_some_and(|n| n.chars().count() > MAX_NOTES)
        {
            return Err(AppError::BadRequest);
        }
        let min_qty = Decimal::new(1, 3); // 0.001
        let max_qty = max_quantity();
        for l in &self.lines {
            if l.qty < min_qty || l.qty > max_qty {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}
