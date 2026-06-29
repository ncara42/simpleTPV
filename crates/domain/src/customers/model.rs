//! Modelos de clientes B2B (#154, IT-17). Cada cliente puede tener una tarifa
//! (price list) asignada, que se devuelve anidada `{id, name}` (paridad con el
//! `include` de Prisma). Además lleva campos CRM/cartera (segmentos, días de
//! crédito, comercial, límite de crédito) para la ficha maestro-detalle.

use rust_decimal::Decimal;
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
    /// Segmentos/etiquetas libres (VIP, HORECA, Farmacia…). Nunca `null` (DEFAULT `{}`).
    pub tags: Vec<String>,
    /// Días de crédito (`null`/0 = contado). Define el vencimiento del pedido.
    pub payment_terms: Option<i32>,
    /// Comercial asignado.
    pub sales_rep: Option<String>,
    /// Límite de crédito en € (`null` = sin límite).
    #[serde(serialize_with = "crate::serde_helpers::decimal_opt_str")]
    pub credit_limit: Option<Decimal>,
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
    pub tags: Vec<String>,
    pub payment_terms: Option<i32>,
    pub sales_rep: Option<String>,
    pub credit_limit: Option<Decimal>,
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
            tags: r.tags,
            payment_terms: r.payment_terms,
            sales_rep: r.sales_rep,
            credit_limit: r.credit_limit,
            active: r.active,
            created_at: r.created_at,
            updated_at: r.updated_at,
            price_list,
        }
    }
}

/// Agregado de cartera por cliente para la ficha maestro-detalle. Suma los pedidos
/// mayoristas del cliente: nº total, último, facturado 12m, saldo (PENDING) y
/// vencido (PENDING con `dueDate` < hoy). Los clientes sin pedidos devuelven 0 / `null`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerRow {
    pub customer_id: Uuid,
    /// Nº de pedidos no anulados.
    pub order_count: i64,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub last_order_at: Option<PrimitiveDateTime>,
    /// Facturado en los últimos 12 meses (pedidos no anulados).
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub billed12m: Decimal,
    /// Saldo pendiente de cobro (pedidos PENDING, no anulados).
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub balance: Decimal,
    /// Importe vencido (PENDING con `dueDate` anterior a hoy).
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub overdue: Decimal,
}
