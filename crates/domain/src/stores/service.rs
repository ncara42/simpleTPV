//! Servicio de tiendas y overrides de precio por tienda (#153) — port de
//! `stores.service.ts` y `store-prices.service.ts`. Todo bajo `with_tenant_tx`
//! (RLS); las rutas de ops/precios acotan por tienda (SEC-01) salvo roles
//! org-wide (ADMIN/MANAGER).

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::limits::max_price;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use crate::csv::{parse_csv, row_number, ImportResult, RowError};
use crate::store_access::has_store_access;

use super::input::{CreateStore, SetStorePrice, UpdateStore, UpdateStoreOps};
use super::model::{Store, StorePriceFlat, StorePriceItem};

const STORE_COLS: &str = r#"id, "organizationId" AS organization_id, name, address, active, code,
    "ticketCounter" AS ticket_counter, "opsVerified" AS ops_verified,
    "opsIncident" AS ops_incident, "opsUpdatedAt" AS ops_updated_at,
    "isCentral" AS is_central, "createdAt" AS created_at"#;

// ─── Tiendas (CRUD, solo ADMIN en HTTP) ───────────────────────────────────────

pub async fn create(pool: &PgPool, org: Uuid, input: CreateStore) -> Result<Store, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let s: Store = sqlx::query_as(&format!(
            r#"INSERT INTO "Store" (id, "organizationId", name, code, address, active)
               VALUES ($1, $2, $3, $4, $5, COALESCE($6, true))
               RETURNING {STORE_COLS}"#,
        ))
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(input.name.trim())
        .bind(input.code.trim())
        .bind(input.address)
        .bind(input.active)
        .fetch_one(&mut **tx)
        .await?;
        Ok(s)
    })
    .await
}

pub async fn find_all(pool: &PgPool, org: Uuid) -> Result<Vec<Store>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<Store> = sqlx::query_as(&format!(
            r#"SELECT {STORE_COLS} FROM "Store" WHERE "organizationId" = $1 ORDER BY name ASC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows)
    })
    .await
}

pub async fn find_one(pool: &PgPool, org: Uuid, id: Uuid) -> Result<Store, AppError> {
    let found: Option<Store> = with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<Store> = sqlx::query_as(&format!(
            r#"SELECT {STORE_COLS} FROM "Store" WHERE id = $1 AND "organizationId" = $2"#,
        ))
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row)
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    input: UpdateStore,
) -> Result<Store, AppError> {
    input.validate()?;
    let found: Option<Store> = with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<Store> = sqlx::query_as(&format!(
            r#"UPDATE "Store" SET
                 name = COALESCE($2, name),
                 code = COALESCE($3, code),
                 address = COALESCE($4, address),
                 active = COALESCE($5, active)
               WHERE id = $1
               RETURNING {STORE_COLS}"#,
        ))
        .bind(id)
        .bind(input.name.map(|n| n.trim().to_owned()))
        .bind(input.code.map(|c| c.trim().to_owned()))
        .bind(input.address)
        .bind(input.active)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row)
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected = sqlx::query(r#"DELETE FROM "Store" WHERE id = $1"#)
            .bind(id)
            .execute(&mut **tx)
            .await?
            .rows_affected();
        Ok(if affected == 0 {
            Err(AppError::NotFound)
        } else {
            Ok(())
        })
    })
    .await?
}

/// `PATCH /stores/:id/central` — designa (o desmarca) la tienda central. Una sola
/// central por org (índice único parcial): desmarca la anterior ANTES de marcar.
pub async fn set_central(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    is_central: bool,
) -> Result<Store, AppError> {
    let found: Option<Store> = with_tenant_tx(pool, org, async move |tx, _after| {
        let exists: Option<(Uuid,)> =
            sqlx::query_as(r#"SELECT id FROM "Store" WHERE id = $1 AND "organizationId" = $2"#)
                .bind(id)
                .bind(org)
                .fetch_optional(&mut **tx)
                .await?;
        if exists.is_none() {
            return Ok(None);
        }
        if is_central {
            sqlx::query(
                r#"UPDATE "Store" SET "isCentral" = false
                   WHERE "organizationId" = $1 AND "isCentral" = true AND id <> $2"#,
            )
            .bind(org)
            .bind(id)
            .execute(&mut **tx)
            .await?;
        }
        let s: Store = sqlx::query_as(&format!(
            r#"UPDATE "Store" SET "isCentral" = $2 WHERE id = $1 RETURNING {STORE_COLS}"#,
        ))
        .bind(id)
        .bind(is_central)
        .fetch_one(&mut **tx)
        .await?;
        Ok(Some(s))
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// `PATCH /stores/:id/ops` — estado operativo manual (verificada + incidencia).
/// Acota por tienda (SEC-01) salvo roles org-wide.
pub async fn update_ops(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: UpdateStoreOps,
) -> Result<Store, AppError> {
    input.validate()?;
    let incident_provided = input.incident.is_some();
    let incident_value = input.incident.filter(|s| !s.is_empty());
    let verified = input.verified;
    let result: Result<Store, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if !is_org_wide && !has_store_access(tx, user_id, id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        let row: Option<Store> = sqlx::query_as(&format!(
            r#"UPDATE "Store" SET
                 "opsVerified" = COALESCE($2, "opsVerified"),
                 "opsIncident" = CASE WHEN $3 THEN $4 ELSE "opsIncident" END,
                 "opsUpdatedAt" = now()
               WHERE id = $1
               RETURNING {STORE_COLS}"#,
        ))
        .bind(id)
        .bind(verified)
        .bind(incident_provided)
        .bind(incident_value)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row.ok_or(AppError::NotFound))
    })
    .await?;
    result
}

// ─── Overrides de precio por tienda ───────────────────────────────────────────

pub async fn list_prices(
    pool: &PgPool,
    org: Uuid,
    store_id: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
) -> Result<Vec<StorePriceItem>, AppError> {
    let result: Result<Vec<StorePriceItem>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let rows: Vec<StorePriceFlat> = sqlx::query_as(
                r#"SELECT sp.id, sp."productId" AS product_id, sp.price,
                     p.name AS product_name, p."salePrice" AS product_sale_price
                   FROM "StorePrice" sp JOIN "Product" p ON p.id = sp."productId"
                   WHERE sp."storeId" = $1 AND sp."organizationId" = $2
                   ORDER BY p.name ASC"#,
            )
            .bind(store_id)
            .bind(org)
            .fetch_all(&mut **tx)
            .await?;
            Ok(Ok(rows.into_iter().map(StorePriceItem::from).collect()))
        })
        .await?;
    result
}

pub async fn set_price(
    pool: &PgPool,
    org: Uuid,
    store_id: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: SetStorePrice,
) -> Result<StorePriceItem, AppError> {
    input.validate()?;
    let result: Result<StorePriceItem, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            // La tienda y el producto deben ser del tenant (RLS + organizationId
            // explícito, defensa en profundidad como el original NestJS).
            let store: Option<(Uuid,)> = sqlx::query_as(
                r#"SELECT id FROM "Store" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(store_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let product: Option<(Uuid,)> = sqlx::query_as(
                r#"SELECT id FROM "Product" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(input.product_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            if store.is_none() || product.is_none() {
                // Paridad NestJS: requireOwned lanza 400 (no 404).
                return Ok(Err(AppError::BadRequest));
            }
            sqlx::query(
                r#"INSERT INTO "StorePrice" (id, "organizationId", "storeId", "productId", price, "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, now())
                   ON CONFLICT ("productId", "storeId")
                   DO UPDATE SET price = EXCLUDED.price, "updatedAt" = now()"#,
            )
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(store_id)
            .bind(input.product_id)
            .bind(input.price)
            .execute(&mut **tx)
            .await?;
            // Devuelve la tarifa resultante (200 con cuerpo, paridad NestJS).
            let row: StorePriceFlat = sqlx::query_as(
                r#"SELECT sp.id, sp."productId" AS product_id, sp.price,
                     p.name AS product_name, p."salePrice" AS product_sale_price
                   FROM "StorePrice" sp JOIN "Product" p ON p.id = sp."productId"
                   WHERE sp."storeId" = $1 AND sp."productId" = $2"#,
            )
            .bind(store_id)
            .bind(input.product_id)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(StorePriceItem::from(row)))
        })
        .await?;
    result
}

pub async fn remove_price(
    pool: &PgPool,
    org: Uuid,
    store_id: Uuid,
    product_id: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
) -> Result<(), AppError> {
    let result: Result<(), AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        sqlx::query(
            r#"DELETE FROM "StorePrice" WHERE "storeId" = $1 AND "productId" = $2 AND "organizationId" = $3"#,
        )
        .bind(store_id)
        .bind(product_id)
        .bind(org)
        .execute(&mut **tx)
        .await?;
        Ok(Ok(()))
    })
    .await?;
    result
}

pub async fn import_prices_csv(
    pool: &PgPool,
    org: Uuid,
    store_id: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    csv: &str,
) -> Result<ImportResult, AppError> {
    let rows = parse_csv(csv)?;
    let max = max_price();
    let result: Result<ImportResult, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let store: Option<(Uuid,)> = sqlx::query_as(
                r#"SELECT id FROM "Store" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(store_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            if store.is_none() {
                return Ok(Err(AppError::BadRequest)); // paridad: requireOwned 400
            }
            let mut errors: Vec<RowError> = Vec::new();
            let mut inserted: u64 = 0;
            for (idx, cells) in rows.iter().enumerate() {
                let row = row_number(idx);
                let sku = cells.get("sku").map(|s| s.trim()).unwrap_or("");
                let price_raw = cells.get("price").map(|s| s.trim()).unwrap_or("");
                if sku.is_empty() {
                    errors.push(RowError { row, message: "Falta el SKU".into() });
                    continue;
                }
                let price: Option<Decimal> = price_raw.parse().ok();
                let Some(price) = price.filter(|p| *p >= Decimal::ZERO && *p <= max) else {
                    errors.push(RowError { row, message: "Precio inválido".into() });
                    continue;
                };
                let product: Option<(Uuid,)> = sqlx::query_as(
                    r#"SELECT id FROM "Product" WHERE sku = $1 AND "organizationId" = $2"#,
                )
                .bind(sku)
                .bind(org)
                .fetch_optional(&mut **tx)
                .await?;
                let Some((product_id,)) = product else {
                    errors.push(RowError { row, message: format!("Sin producto con SKU \"{sku}\"") });
                    continue;
                };
                sqlx::query(
                    r#"INSERT INTO "StorePrice" (id, "organizationId", "storeId", "productId", price, "updatedAt")
                       VALUES ($1, $2, $3, $4, $5, now())
                       ON CONFLICT ("productId", "storeId")
                       DO UPDATE SET price = EXCLUDED.price, "updatedAt" = now()"#,
                )
                .bind(Uuid::new_v4())
                .bind(org)
                .bind(store_id)
                .bind(product_id)
                .bind(price)
                .execute(&mut **tx)
                .await?;
                inserted += 1;
            }
            Ok(Ok(ImportResult { inserted, errors }))
        })
        .await?;
    result
}
