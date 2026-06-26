//! Entradas y validación de clientes B2B (#154) — port de los DTOs.
//!
//! `priceListId` en el PATCH usa "doble opción": ausente = no tocar, `null` =
//! desasignar, valor = asignar. Los strings opcionales son patch simple (no se
//! pueden poner a `null` vía PATCH; divergencia menor documentada).
//!
//! Campos CRM/cartera (`tags`, `paymentTerms`, `salesRep`, `creditLimit`) siguen el
//! mismo patch simple: presentes = reemplazan, ausentes = no tocan.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::serde_helpers::double_option;

const MAX_NAME: usize = 200;
const MAX_NIF: usize = 20;
const MAX_EMAIL: usize = 200;
const MAX_PHONE: usize = 50;
const MAX_ADDRESS: usize = 500;
const MAX_SALES_REP: usize = 200;
const MAX_TAG: usize = 60;
const MAX_TAGS: usize = 12;
/// Tope de días de crédito (≈ 2 años) — defensa contra entradas absurdas.
const MAX_PAYMENT_TERMS: i32 = 730;

fn opt_len_ok(s: &Option<String>, max: usize) -> bool {
    s.as_ref().map(|v| v.chars().count() <= max).unwrap_or(true)
}

fn name_ok(n: &str) -> bool {
    let t = n.trim();
    !t.is_empty() && t.chars().count() <= MAX_NAME
}

/// Etiquetas: como mucho `MAX_TAGS`, cada una no vacía y ≤ `MAX_TAG`.
fn tags_ok(tags: &Option<Vec<String>>) -> bool {
    match tags {
        None => true,
        Some(list) => {
            list.len() <= MAX_TAGS
                && list
                    .iter()
                    .all(|t| !t.trim().is_empty() && t.chars().count() <= MAX_TAG)
        }
    }
}

/// Días de crédito y límite de crédito: no negativos; días dentro de un tope.
fn terms_ok(payment_terms: Option<i32>, credit_limit: Option<Decimal>) -> bool {
    payment_terms.is_none_or(|d| (0..=MAX_PAYMENT_TERMS).contains(&d))
        && credit_limit.is_none_or(|c| c >= Decimal::ZERO)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomer {
    pub name: String,
    #[serde(default)]
    pub nif: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub price_list_id: Option<Uuid>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub payment_terms: Option<i32>,
    #[serde(default)]
    pub sales_rep: Option<String>,
    #[serde(default)]
    pub credit_limit: Option<Decimal>,
    #[serde(default)]
    pub active: Option<bool>,
}

impl CreateCustomer {
    pub fn validate(&self) -> Result<(), AppError> {
        if !name_ok(&self.name)
            || !opt_len_ok(&self.nif, MAX_NIF)
            || !opt_len_ok(&self.email, MAX_EMAIL)
            || !opt_len_ok(&self.phone, MAX_PHONE)
            || !opt_len_ok(&self.address, MAX_ADDRESS)
            || !opt_len_ok(&self.sales_rep, MAX_SALES_REP)
            || !tags_ok(&self.tags)
            || !terms_ok(self.payment_terms, self.credit_limit)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomer {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub nif: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub price_list_id: Option<Option<Uuid>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub payment_terms: Option<i32>,
    #[serde(default)]
    pub sales_rep: Option<String>,
    #[serde(default)]
    pub credit_limit: Option<Decimal>,
    #[serde(default)]
    pub active: Option<bool>,
}

impl UpdateCustomer {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| !name_ok(n))
            || !opt_len_ok(&self.nif, MAX_NIF)
            || !opt_len_ok(&self.email, MAX_EMAIL)
            || !opt_len_ok(&self.phone, MAX_PHONE)
            || !opt_len_ok(&self.address, MAX_ADDRESS)
            || !opt_len_ok(&self.sales_rep, MAX_SALES_REP)
            || !tags_ok(&self.tags)
            || !terms_ok(self.payment_terms, self.credit_limit)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
