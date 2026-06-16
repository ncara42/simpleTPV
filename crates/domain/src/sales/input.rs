//! Entradas de ventas (DTOs) — port de `sales.dto.ts`. Importes como número JSON
//! → `Decimal`; `deny_unknown_fields`; cotas iguales a NestJS.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_amount, max_quantity};
use simpletpv_shared::AppError;
use uuid::Uuid;

use super::model::PaymentMethod;

const MAX_LINES: usize = 200;
const HUNDRED: i64 = 100;

/// Línea de venta.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSaleLine {
    pub product_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub qty: Decimal,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub discount_pct: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub discount_amt: Option<Decimal>,
}

/// `POST /sales`: crea una venta.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSale {
    pub store_id: Uuid,
    #[serde(default)]
    pub client_id: Option<Uuid>,
    #[serde(default)]
    pub ticket_number: Option<String>,
    pub lines: Vec<CreateSaleLine>,
    pub payment_method: PaymentMethod,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub cash_given: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub ticket_discount_pct: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub ticket_discount_amt: Option<Decimal>,
}

impl CreateSale {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.lines.is_empty() || self.lines.len() > MAX_LINES {
            return Err(AppError::BadRequest);
        }
        if let Some(tn) = &self.ticket_number {
            if !is_valid_ticket_number(tn) {
                return Err(AppError::BadRequest);
            }
        }
        for line in &self.lines {
            // qty > 0, ≤ MAX_QUANTITY, máx 3 decimales.
            if line.qty <= Decimal::ZERO
                || line.qty > max_quantity()
                || line.qty.normalize().scale() > 3
            {
                return Err(AppError::BadRequest);
            }
            check_pct(line.discount_pct)?;
            check_amt(line.discount_amt)?;
        }
        if let Some(c) = self.cash_given {
            // > 0 y ≤ MAX_AMOUNT, 2 decimales.
            if c <= Decimal::ZERO || c > max_amount() || c.normalize().scale() > 2 {
                return Err(AppError::BadRequest);
            }
        }
        check_pct(self.ticket_discount_pct)?;
        check_amt(self.ticket_discount_amt)?;
        Ok(())
    }
}

/// `POST /sales/ticket-block`: reserva un bloque de números de ticket.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReserveTicketBlock {
    pub store_id: Uuid,
    pub size: i64,
}

impl ReserveTicketBlock {
    pub fn validate(&self) -> Result<(), AppError> {
        if (1..=200).contains(&self.size) {
            Ok(())
        } else {
            Err(AppError::BadRequest)
        }
    }
}

fn is_valid_ticket_number(tn: &str) -> bool {
    let len = tn.chars().count();
    (1..=40).contains(&len)
        && tn
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Porcentaje de descuento: 0 ≤ v ≤ 100, máx 2 decimales.
fn check_pct(v: Option<Decimal>) -> Result<(), AppError> {
    match v {
        Some(p) if p < Decimal::ZERO || p > Decimal::from(HUNDRED) || p.normalize().scale() > 2 => {
            Err(AppError::BadRequest)
        }
        _ => Ok(()),
    }
}

/// Importe de descuento: 0 ≤ v ≤ MAX_AMOUNT, máx 2 decimales.
fn check_amt(v: Option<Decimal>) -> Result<(), AppError> {
    match v {
        Some(a) if a < Decimal::ZERO || a > max_amount() || a.normalize().scale() > 2 => {
            Err(AppError::BadRequest)
        }
        _ => Ok(()),
    }
}
