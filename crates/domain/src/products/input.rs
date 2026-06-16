//! Entradas de catálogo (DTOs de ENTRADA) — port de `products.dto.ts`.
//!
//! Claves camelCase, `deny_unknown_fields` (paridad con el `ValidationPipe`
//! `whitelist + forbidNonWhitelisted` de Nest). Los campos numéricos llegan como
//! número JSON y se convierten a `Decimal`; la validación aplica las mismas cotas
//! que NestJS (longitudes de `limits`, rangos y nº de decimales). Un fallo de
//! validación es `AppError::BadRequest` (mensaje neutro, doc 02 §5).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{
    max_price, max_tax_rate, MAX_BARCODE_LENGTH, MAX_CODE_LENGTH, MAX_NAME_LENGTH, MAX_NOTES_LENGTH,
};
use simpletpv_shared::AppError;
use uuid::Uuid;

use super::model::SaleUnit;

/// Cuerpo de creación de producto. `name` y `salePrice` obligatorios. Los campos
/// numéricos llegan como NÚMERO JSON (paridad con `@IsNumber` de NestJS), no como
/// string. `imageUrl` y `tracksBatch` NO se aceptan aquí (igual que
/// `CreateProductDto`): toman sus defaults y se gestionan en otros flujos.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewProduct {
    pub name: String,
    #[serde(with = "rust_decimal::serde::float")]
    pub sale_price: Decimal,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub barcode: Option<String>,
    #[serde(default)]
    pub sku: Option<String>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub cost_price: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub tax_rate: Option<Decimal>,
    #[serde(default)]
    pub sale_unit: Option<SaleUnit>,
    #[serde(default)]
    pub unit_symbol: Option<String>,
    #[serde(default)]
    pub family_id: Option<Uuid>,
    #[serde(default)]
    pub active: Option<bool>,
}

impl NewProduct {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_name(&self.name)?;
        validate_price(self.sale_price)?;
        validate_opt_len(self.description.as_deref(), MAX_NOTES_LENGTH)?;
        validate_opt_len(self.barcode.as_deref(), MAX_BARCODE_LENGTH)?;
        validate_opt_len(self.sku.as_deref(), MAX_BARCODE_LENGTH)?;
        validate_opt_len(self.unit_symbol.as_deref(), MAX_CODE_LENGTH)?;
        if let Some(c) = self.cost_price {
            validate_price(c)?;
        }
        if let Some(t) = self.tax_rate {
            validate_tax_rate(t)?;
        }
        Ok(())
    }
}

/// Cuerpo de actualización parcial (PATCH). Cada campo es opcional; en los campos
/// anulables, `Option<Option<T>>` distingue ausente (mantener) de `null` (borrar).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub sale_price: Option<Decimal>,
    #[serde(default)]
    pub description: Option<Option<String>>,
    #[serde(default)]
    pub barcode: Option<Option<String>>,
    #[serde(default)]
    pub sku: Option<Option<String>>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub cost_price: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub tax_rate: Option<Decimal>,
    #[serde(default)]
    pub sale_unit: Option<SaleUnit>,
    #[serde(default)]
    pub unit_symbol: Option<String>,
    #[serde(default)]
    pub family_id: Option<Option<Uuid>>,
    #[serde(default)]
    pub active: Option<bool>,
}

impl ProductPatch {
    pub fn validate(&self) -> Result<(), AppError> {
        if let Some(name) = &self.name {
            validate_name(name)?;
        }
        if let Some(p) = self.sale_price {
            validate_price(p)?;
        }
        if let Some(c) = self.cost_price {
            validate_price(c)?;
        }
        if let Some(t) = self.tax_rate {
            validate_tax_rate(t)?;
        }
        validate_opt_len(opt_inner(&self.description), MAX_NOTES_LENGTH)?;
        validate_opt_len(opt_inner(&self.barcode), MAX_BARCODE_LENGTH)?;
        validate_opt_len(opt_inner(&self.sku), MAX_BARCODE_LENGTH)?;
        validate_opt_len(self.unit_symbol.as_deref(), MAX_CODE_LENGTH)?;
        Ok(())
    }
}

/// Vista del valor interno de un `Option<Option<String>>` para validar longitud
/// solo cuando se está ASIGNANDO un valor concreto (no al borrar ni al omitir).
fn opt_inner(field: &Option<Option<String>>) -> Option<&str> {
    field.as_ref().and_then(|o| o.as_deref())
}

fn validate_name(name: &str) -> Result<(), AppError> {
    let len = name.chars().count();
    if (1..=MAX_NAME_LENGTH).contains(&len) {
        Ok(())
    } else {
        Err(AppError::BadRequest)
    }
}

fn validate_opt_len(value: Option<&str>, max: usize) -> Result<(), AppError> {
    match value {
        Some(s) if s.chars().count() > max => Err(AppError::BadRequest),
        _ => Ok(()),
    }
}

fn validate_price(v: Decimal) -> Result<(), AppError> {
    // 0 ≤ v ≤ MAX_PRICE y como mucho 4 decimales (escala normalizada).
    if v >= Decimal::ZERO && v <= max_price() && v.normalize().scale() <= 4 {
        Ok(())
    } else {
        Err(AppError::BadRequest)
    }
}

fn validate_tax_rate(v: Decimal) -> Result<(), AppError> {
    if v >= Decimal::ZERO && v <= max_tax_rate() && v.normalize().scale() <= 2 {
        Ok(())
    } else {
        Err(AppError::BadRequest)
    }
}
