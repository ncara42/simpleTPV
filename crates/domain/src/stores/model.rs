//! Modelos de tiendas y overrides de precio por tienda (#153).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Tienda (salida JSON, paridad Prisma).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub address: Option<String>,
    pub active: bool,
    pub code: String,
    pub ticket_counter: i32,
    pub ops_verified: bool,
    pub ops_incident: Option<String>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub ops_updated_at: Option<PrimitiveDateTime>,
    pub is_central: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Fila plana del override (join con Product) para mapear a [`StorePriceItem`].
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StorePriceFlat {
    pub id: Uuid,
    pub product_id: Uuid,
    pub price: Decimal,
    pub product_name: String,
    pub product_sale_price: Decimal,
}

/// Producto resumido dentro del override.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorePriceProductInfo {
    pub name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub sale_price: Decimal,
}

/// Override de precio por tienda (precio y PVP como string, paridad Prisma).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorePriceItem {
    pub id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub price: Decimal,
    pub product: StorePriceProductInfo,
}

impl From<StorePriceFlat> for StorePriceItem {
    fn from(r: StorePriceFlat) -> Self {
        StorePriceItem {
            id: r.id,
            product_id: r.product_id,
            price: r.price,
            product: StorePriceProductInfo {
                name: r.product_name,
                sale_price: r.product_sale_price,
            },
        }
    }
}
