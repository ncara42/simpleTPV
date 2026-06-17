//! Entradas y validación de pedidos a proveedor (#153).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_price, max_quantity, MAX_ARRAY_SIZE, MAX_NOTES_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

/// Tope de días de cobertura de la sugerencia (evita aritmética contaminada).
const MAX_COVERAGE_DAYS: i64 = 365;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseOrderLine {
    pub product_id: Uuid,
    pub quantity_ordered: Decimal,
    pub unit_cost: Option<Decimal>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseOrder {
    pub supplier_id: Uuid,
    pub store_id: Uuid,
    pub notes: Option<String>,
    pub lines: Vec<CreatePurchaseOrderLine>,
}

impl CreatePurchaseOrder {
    pub fn validate(&self) -> Result<(), AppError> {
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
        let (mq, mp) = (max_quantity(), max_price());
        for l in &self.lines {
            if l.quantity_ordered <= Decimal::ZERO || l.quantity_ordered > mq {
                return Err(AppError::BadRequest);
            }
            if l.unit_cost.is_some_and(|c| c < Decimal::ZERO || c > mp) {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseOrderLine {
    pub line_id: Uuid,
    pub quantity_received: Decimal,
    pub lot_code: Option<String>,
    pub expiry_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseOrder {
    pub lines: Vec<ReceivePurchaseOrderLine>,
}

impl ReceivePurchaseOrder {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.lines.is_empty() || self.lines.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        let mq = max_quantity();
        for l in &self.lines {
            if l.quantity_received < Decimal::ZERO || l.quantity_received > mq {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestPurchase {
    pub store_id: Uuid,
    pub supplier_id: Option<Uuid>,
    pub days_coverage: Option<i64>,
}

impl SuggestPurchase {
    pub fn validate(&self) -> Result<(), AppError> {
        if self
            .days_coverage
            .is_some_and(|d| d <= 0 || d > MAX_COVERAGE_DAYS)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
