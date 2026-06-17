//! Servicio de tarifas B2B (#154, IT-17) — port de `price-lists.service.ts`.
//! Función de central (ADMIN/MANAGER en HTTP). `create` gatea el módulo B2B
//! (#127 B). Tarifa y producto referenciados deben ser del propio tenant
//! (requireOwned → 400). Todo bajo `with_tenant_tx` (RLS) + filtro org explícito.

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::feature_flags::assert_flag_enabled;

use super::input::{CreatePriceList, SetPriceListItem, UpdatePriceList};
use super::model::{
    ItemRow, PriceList, PriceListDetail, PriceListItem, PriceListItemDetail, PriceListSummary,
};

async fn owned_in_org(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    id: Uuid,
    org: Uuid,
) -> Result<bool, sqlx::Error> {
    let found: Option<(Uuid,)> = sqlx::query_as(&format!(
        r#"SELECT id FROM "{table}" WHERE id = $1 AND "organizationId" = $2"#
    ))
    .bind(id)
    .bind(org)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(found.is_some())
}

pub async fn list(pool: &PgPool, org: Uuid) -> Result<Vec<PriceListSummary>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(
            r#"SELECT pl.id, pl.name, pl.active,
                 (SELECT count(*) FROM "PriceListItem" i WHERE i."priceListId" = pl.id) AS item_count,
                 (SELECT count(*) FROM "Customer" c WHERE c."priceListId" = pl.id) AS customer_count
               FROM "PriceList" pl
               WHERE pl."organizationId" = $1
               ORDER BY pl.name ASC"#,
        )
        .bind(org)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

pub async fn get(pool: &PgPool, org: Uuid, id: Uuid) -> Result<PriceListDetail, AppError> {
    let result: Result<PriceListDetail, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let pl: Option<PriceList> = sqlx::query_as(
                r#"SELECT id, "organizationId" AS organization_id, name, active,
                     "createdAt" AS created_at
                   FROM "PriceList" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let Some(pl) = pl else {
                return Ok(Err(AppError::NotFound));
            };
            let items: Vec<ItemRow> = sqlx::query_as(
                r#"SELECT i.id, i."organizationId" AS organization_id, i."priceListId" AS price_list_id,
                     i."productId" AS product_id, i.price, p.name AS product_name,
                     p."salePrice" AS product_sale_price
                   FROM "PriceListItem" i
                   JOIN "Product" p ON p.id = i."productId"
                   WHERE i."priceListId" = $1 AND i."organizationId" = $2
                   ORDER BY p.name ASC"#,
            )
            .bind(id)
            .bind(org)
            .fetch_all(&mut **tx)
            .await?;
            Ok(Ok(PriceListDetail {
                id: pl.id,
                organization_id: pl.organization_id,
                name: pl.name,
                active: pl.active,
                created_at: pl.created_at,
                items: items.into_iter().map(PriceListItemDetail::from).collect(),
            }))
        })
        .await?;
    result
}

pub async fn create(
    pool: &PgPool,
    org: Uuid,
    input: CreatePriceList,
) -> Result<PriceList, AppError> {
    input.validate()?;
    assert_flag_enabled(pool, org, "b2b", None).await?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(
            r#"INSERT INTO "PriceList" (id, "organizationId", name)
               VALUES ($1, $2, $3)
               RETURNING id, "organizationId" AS organization_id, name, active, "createdAt" AS created_at"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(input.name.trim())
        .fetch_one(&mut **tx)
        .await
    })
    .await
}

pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    input: UpdatePriceList,
) -> Result<PriceList, AppError> {
    input.validate()?;
    let found: Option<PriceList> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(
            r#"UPDATE "PriceList" SET
                 name = COALESCE($3, name),
                 active = COALESCE($4, active)
               WHERE id = $1 AND "organizationId" = $2
               RETURNING id, "organizationId" AS organization_id, name, active, "createdAt" AS created_at"#,
        )
        .bind(id)
        .bind(org)
        .bind(input.name.map(|n| n.trim().to_owned()))
        .bind(input.active)
        .fetch_optional(&mut **tx)
        .await
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// Borrado idempotente (cascada de items; los clientes con esta tarifa quedan a null).
pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(r#"DELETE FROM "PriceList" WHERE id = $1 AND "organizationId" = $2"#)
            .bind(id)
            .bind(org)
            .execute(&mut **tx)
            .await?;
        Ok(())
    })
    .await
}

/// Upsert del precio de un producto en la tarifa (tarifa y producto del tenant).
pub async fn set_item(
    pool: &PgPool,
    org: Uuid,
    price_list_id: Uuid,
    input: SetPriceListItem,
) -> Result<PriceListItem, AppError> {
    input.validate()?;
    let result: Result<PriceListItem, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !owned_in_org(tx, "PriceList", price_list_id, org).await?
                || !owned_in_org(tx, "Product", input.product_id, org).await?
            {
                return Ok(Err(AppError::BadRequest));
            }
            let item: PriceListItem = sqlx::query_as(
                r#"INSERT INTO "PriceListItem" (id, "organizationId", "priceListId", "productId", price)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT ("priceListId", "productId") DO UPDATE SET price = EXCLUDED.price
                   RETURNING id, "organizationId" AS organization_id, "priceListId" AS price_list_id,
                     "productId" AS product_id, price"#,
            )
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(price_list_id)
            .bind(input.product_id)
            .bind(input.price)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(item))
        })
        .await?;
    result
}

/// Borrado idempotente de un item de la tarifa.
pub async fn remove_item(
    pool: &PgPool,
    org: Uuid,
    price_list_id: Uuid,
    product_id: Uuid,
) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(
            r#"DELETE FROM "PriceListItem"
               WHERE "priceListId" = $1 AND "productId" = $2 AND "organizationId" = $3"#,
        )
        .bind(price_list_id)
        .bind(product_id)
        .bind(org)
        .execute(&mut **tx)
        .await?;
        Ok(())
    })
    .await
}
