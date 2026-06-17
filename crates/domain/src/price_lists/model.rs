//! Modelos de tarifas (listas de precios) B2B (#154, IT-17). `PriceList` no tiene
//! `updatedAt` (solo `createdAt`). Los precios son `Decimal` (string en JSON).

use rust_decimal::Decimal;
use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Tarifa "plana" (respuesta de create/update).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceList {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Resumen para el listado: + nº de items y de clientes con esta tarifa.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceListSummary {
    pub id: Uuid,
    pub name: String,
    pub active: bool,
    pub item_count: i64,
    pub customer_count: i64,
}

/// Producto referenciado por un item (paridad con `product: {name, salePrice}`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductBrief {
    pub name: String,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub sale_price: Decimal,
}

/// Item de la tarifa con el producto anidado (respuesta de `get`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceListItemDetail {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub price_list_id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub price: Decimal,
    pub product: ProductBrief,
}

/// Tarifa con sus items (respuesta de `get`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceListDetail {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    pub items: Vec<PriceListItemDetail>,
}

/// Item "plano" (respuesta de `setItem`).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceListItem {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub price_list_id: Uuid,
    pub product_id: Uuid,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub price: Decimal,
}

/// Fila del JOIN item+producto.
#[derive(sqlx::FromRow)]
pub(crate) struct ItemRow {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub price_list_id: Uuid,
    pub product_id: Uuid,
    pub price: Decimal,
    pub product_name: String,
    pub product_sale_price: Decimal,
}

impl From<ItemRow> for PriceListItemDetail {
    fn from(r: ItemRow) -> Self {
        PriceListItemDetail {
            id: r.id,
            organization_id: r.organization_id,
            price_list_id: r.price_list_id,
            product_id: r.product_id,
            price: r.price,
            product: ProductBrief {
                name: r.product_name,
                sale_price: r.product_sale_price,
            },
        }
    }
}
