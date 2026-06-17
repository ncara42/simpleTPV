//! Servicio de la API pública (#154, IT-18) — port de `public.controller.ts`.
//! Stock de productos activos + precio mayorista de la tarifa asociada a la API
//! key. La autenticación (lookup de la key) ocurre en la capa HTTP; aquí ya se
//! conoce el `org` y se consulta bajo `with_tenant_tx` (RLS).

use std::collections::HashMap;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::model::PublicStockItem;

pub async fn stock(
    pool: &PgPool,
    org: Uuid,
    price_list_id: Option<Uuid>,
    store_id: Option<Uuid>,
) -> Result<Vec<PublicStockItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(Uuid, String, String, Uuid, Decimal)> = sqlx::query_as(
            r#"SELECT p.id, p.sku, p.name, s."storeId", s.quantity
               FROM "Stock" s
               JOIN "Product" p ON p.id = s."productId"
               WHERE s."organizationId" = $1 AND p.active = true
                 AND ($2::uuid IS NULL OR s."storeId" = $2)
               ORDER BY p.name ASC, s."storeId" ASC"#,
        )
        .bind(org)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;

        // Precios de la tarifa asociada a la key (si la hay).
        let mut price_by_product: HashMap<Uuid, Decimal> = HashMap::new();
        if let Some(plid) = price_list_id {
            let items: Vec<(Uuid, Decimal)> = sqlx::query_as(
                r#"SELECT "productId", price FROM "PriceListItem"
                   WHERE "priceListId" = $1 AND "organizationId" = $2"#,
            )
            .bind(plid)
            .bind(org)
            .fetch_all(&mut **tx)
            .await?;
            for (pid, price) in items {
                price_by_product.insert(pid, price);
            }
        }

        Ok(rows
            .into_iter()
            .map(
                |(product_id, sku, name, store_id, quantity)| PublicStockItem {
                    product_id,
                    sku,
                    name,
                    store_id,
                    quantity,
                    wholesale_price: price_by_product.get(&product_id).copied(),
                },
            )
            .collect())
    })
    .await
}
