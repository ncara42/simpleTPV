//! Entradas y validación de clientes B2B (#154) — port de los DTOs.
//!
//! `priceListId` en el PATCH usa "doble opción": ausente = no tocar, `null` =
//! desasignar, valor = asignar. Los strings opcionales son patch simple (no se
//! pueden poner a `null` vía PATCH; divergencia menor documentada).

use serde::Deserialize;
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::serde_helpers::double_option;

const MAX_NAME: usize = 200;
const MAX_NIF: usize = 20;
const MAX_EMAIL: usize = 200;
const MAX_PHONE: usize = 50;
const MAX_ADDRESS: usize = 500;

fn opt_len_ok(s: &Option<String>, max: usize) -> bool {
    s.as_ref().map(|v| v.chars().count() <= max).unwrap_or(true)
}

fn name_ok(n: &str) -> bool {
    let t = n.trim();
    !t.is_empty() && t.chars().count() <= MAX_NAME
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
    pub active: Option<bool>,
}

impl CreateCustomer {
    pub fn validate(&self) -> Result<(), AppError> {
        if !name_ok(&self.name)
            || !opt_len_ok(&self.nif, MAX_NIF)
            || !opt_len_ok(&self.email, MAX_EMAIL)
            || !opt_len_ok(&self.phone, MAX_PHONE)
            || !opt_len_ok(&self.address, MAX_ADDRESS)
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
    pub active: Option<bool>,
}

impl UpdateCustomer {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| !name_ok(n))
            || !opt_len_ok(&self.nif, MAX_NIF)
            || !opt_len_ok(&self.email, MAX_EMAIL)
            || !opt_len_ok(&self.phone, MAX_PHONE)
            || !opt_len_ok(&self.address, MAX_ADDRESS)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
