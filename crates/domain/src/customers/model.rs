//! Modelos de clientes B2B (#154, IT-17). Cada cliente puede tener una tarifa
//! (price list) asignada, que se devuelve anidada `{id, name}` (paridad con el
//! `include` de Prisma).

use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Referencia mínima a la tarifa asignada (paridad con `priceList: {id, name}`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceListRef {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub nif: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub price_list_id: Option<Uuid>,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
    pub price_list: Option<PriceListRef>,
}

/// Fila del LEFT JOIN con `PriceList` (la tarifa puede ser NULL).
#[derive(sqlx::FromRow)]
pub(crate) struct CustomerRow {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub nif: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub price_list_id: Option<Uuid>,
    pub active: bool,
    pub created_at: PrimitiveDateTime,
    pub updated_at: PrimitiveDateTime,
    pub pl_id: Option<Uuid>,
    pub pl_name: Option<String>,
}

impl From<CustomerRow> for Customer {
    fn from(r: CustomerRow) -> Self {
        let price_list = match (r.pl_id, r.pl_name) {
            (Some(id), Some(name)) => Some(PriceListRef { id, name }),
            _ => None,
        };
        Customer {
            id: r.id,
            organization_id: r.organization_id,
            name: r.name,
            nif: r.nif,
            email: r.email,
            phone: r.phone,
            address: r.address,
            price_list_id: r.price_list_id,
            active: r.active,
            created_at: r.created_at,
            updated_at: r.updated_at,
            price_list,
        }
    }
}
