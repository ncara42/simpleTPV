//! Modelo de la API pública (#154, IT-18). Expone cantidad + precio mayorista
//! (de la tarifa de la API key). Sin márgenes ni costes. Cantidades y precios
//! como NÚMERO JSON (paridad con el `Number(...)` del controlador).

use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicStockItem {
    pub product_id: Uuid,
    /// `Product.sku` es opcional en BD; NestJS devuelve `sku: null` cuando falta
    /// (no todos los productos tienen referencia). Paridad: `Option` → `null`.
    pub sku: Option<String>,
    pub name: String,
    pub store_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_float")]
    pub quantity: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_float")]
    pub wholesale_price: Option<Decimal>,
}
