//! Servicio de proveedores y tarifas de compra (#153) — port de
//! `suppliers.service.ts` y `supplier-prices.service.ts`. Todo bajo
//! `with_tenant_tx` (RLS); pertenencia al tenant validada también de forma
//! explícita antes de escribir (defensa en profundidad).

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::limits::max_price;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::csv::{parse_csv, row_number, ImportResult, RowError};

use super::input::{CreateSupplier, UpdateSupplier, UpsertSupplierPrice};
use super::model::{ComparisonRow, PriceEntry, Supplier, SupplierPriceRow};

const SUPPLIER_COLS: &str = r#"id, "organizationId" AS organization_id, name, nif, email, phone,
    "leadTimeDays" AS lead_time_days, "orderFrequencyDays" AS order_frequency_days,
    active, "createdAt" AS created_at"#;

const PRICE_COLS: &str = r#"sp.id, sp."supplierId" AS supplier_id, s.name AS supplier_name,
    sp."productId" AS product_id, p.name AS product_name, p.sku, sp.price"#;

const PRICE_JOIN: &str = r#"FROM "SupplierPrice" sp
    JOIN "Supplier" s ON s.id = sp."supplierId"
    JOIN "Product" p ON p.id = sp."productId""#;

// ─── Proveedores (CRUD) ───────────────────────────────────────────────────────

pub async fn create(pool: &PgPool, org: Uuid, input: CreateSupplier) -> Result<Supplier, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let s: Supplier = sqlx::query_as(&format!(
            r#"INSERT INTO "Supplier" (id, "organizationId", name, nif, email, phone, "leadTimeDays", "orderFrequencyDays")
               VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 7), NULLIF($8, 0))
               RETURNING {SUPPLIER_COLS}"#,
        ))
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(input.name.trim())
        .bind(input.nif)
        .bind(input.email)
        .bind(input.phone)
        .bind(input.lead_time_days)
        .bind(input.order_frequency_days)
        .fetch_one(&mut **tx)
        .await?;
        Ok(s)
    })
    .await
}

pub async fn find_all(pool: &PgPool, org: Uuid) -> Result<Vec<Supplier>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<Supplier> = sqlx::query_as(&format!(
            r#"SELECT {SUPPLIER_COLS} FROM "Supplier" WHERE "organizationId" = $1 ORDER BY name ASC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows)
    })
    .await
}

pub async fn find_one(pool: &PgPool, org: Uuid, id: Uuid) -> Result<Supplier, AppError> {
    let found: Option<Supplier> = with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<Supplier> = sqlx::query_as(&format!(
            r#"SELECT {SUPPLIER_COLS} FROM "Supplier" WHERE id = $1 AND "organizationId" = $2"#,
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
    input: UpdateSupplier,
) -> Result<Supplier, AppError> {
    input.validate()?;
    let found: Option<Supplier> = with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<Supplier> = sqlx::query_as(&format!(
            r#"UPDATE "Supplier" SET
                 name = COALESCE($2, name),
                 nif = COALESCE($3, nif),
                 email = COALESCE($4, email),
                 phone = COALESCE($5, phone),
                 "leadTimeDays" = COALESCE($6, "leadTimeDays"),
                 -- Periodicidad: NULL = sin cambios; 0 = quitar (queda NULL); n>0 = fijar.
                 "orderFrequencyDays" = CASE WHEN $7::int IS NULL THEN "orderFrequencyDays" ELSE NULLIF($7, 0) END
               WHERE id = $1
               RETURNING {SUPPLIER_COLS}"#,
        ))
        .bind(id)
        .bind(input.name.map(|n| n.trim().to_owned()))
        .bind(input.nif)
        .bind(input.email)
        .bind(input.phone)
        .bind(input.lead_time_days)
        .bind(input.order_frequency_days)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row)
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected = sqlx::query(r#"DELETE FROM "Supplier" WHERE id = $1"#)
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

// ─── Tarifas de compra ────────────────────────────────────────────────────────

pub async fn list_prices(
    pool: &PgPool,
    org: Uuid,
    supplier_id: Option<Uuid>,
    product_id: Option<Uuid>,
) -> Result<Vec<SupplierPriceRow>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(format!(
            "SELECT {PRICE_COLS} {PRICE_JOIN} WHERE sp.\"organizationId\" = "
        ));
        qb.push_bind(org);
        if let Some(s) = supplier_id {
            qb.push(r#" AND sp."supplierId" = "#).push_bind(s);
        }
        if let Some(p) = product_id {
            qb.push(r#" AND sp."productId" = "#).push_bind(p);
        }
        qb.push(" ORDER BY p.name ASC, sp.price ASC");
        let rows: Vec<SupplierPriceRow> = qb.build_query_as().fetch_all(&mut **tx).await?;
        Ok(rows)
    })
    .await
}

pub async fn comparison(
    pool: &PgPool,
    org: Uuid,
    family_id: Option<Uuid>,
) -> Result<Vec<ComparisonRow>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(format!(
            "SELECT {PRICE_COLS} {PRICE_JOIN} WHERE sp.\"organizationId\" = "
        ));
        qb.push_bind(org);
        if let Some(f) = family_id {
            qb.push(r#" AND p."familyId" = "#).push_bind(f);
        }
        qb.push(" ORDER BY sp.price ASC");
        let rows: Vec<SupplierPriceRow> = qb.build_query_as().fetch_all(&mut **tx).await?;

        // Agrupa por producto preservando el orden; el primero de cada uno (precio
        // asc) es el mejor.
        let mut out: Vec<ComparisonRow> = Vec::new();
        for r in rows {
            let entry = PriceEntry {
                supplier_id: r.supplier_id,
                supplier_name: r.supplier_name,
                price: r.price,
            };
            if let Some(cr) = out.iter_mut().find(|c| c.product_id == r.product_id) {
                if cr.best.as_ref().is_none_or(|b| entry.price < b.price) {
                    cr.best = Some(entry.clone());
                }
                cr.prices.push(entry);
            } else {
                out.push(ComparisonRow {
                    product_id: r.product_id,
                    product_name: r.product_name,
                    sku: r.sku,
                    best: Some(entry.clone()),
                    prices: vec![entry],
                });
            }
        }
        out.sort_by(|a, b| a.product_name.cmp(&b.product_name));
        Ok(out)
    })
    .await
}

pub async fn upsert_price(
    pool: &PgPool,
    org: Uuid,
    input: UpsertSupplierPrice,
) -> Result<SupplierPriceRow, AppError> {
    input.validate()?;
    let result: Result<SupplierPriceRow, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            // Pertenencia al tenant (RLS + comprobación explícita).
            let supplier: Option<(Uuid,)> =
                sqlx::query_as(r#"SELECT id FROM "Supplier" WHERE id = $1 AND "organizationId" = $2"#)
                    .bind(input.supplier_id)
                    .bind(org)
                    .fetch_optional(&mut **tx)
                    .await?;
            let product: Option<(Uuid,)> =
                sqlx::query_as(r#"SELECT id FROM "Product" WHERE id = $1 AND "organizationId" = $2"#)
                    .bind(input.product_id)
                    .bind(org)
                    .fetch_optional(&mut **tx)
                    .await?;
            if supplier.is_none() || product.is_none() {
                return Ok(Err(AppError::BadRequest));
            }
            sqlx::query(
                r#"INSERT INTO "SupplierPrice" (id, "organizationId", "supplierId", "productId", price, "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, now())
                   ON CONFLICT ("supplierId", "productId")
                   DO UPDATE SET price = EXCLUDED.price, "updatedAt" = now()"#,
            )
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(input.supplier_id)
            .bind(input.product_id)
            .bind(input.price)
            .execute(&mut **tx)
            .await?;
            let row: SupplierPriceRow = sqlx::query_as(&format!(
                r#"SELECT {PRICE_COLS} {PRICE_JOIN}
                   WHERE sp."supplierId" = $1 AND sp."productId" = $2"#,
            ))
            .bind(input.supplier_id)
            .bind(input.product_id)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(row))
        })
        .await?;
    result
}

pub async fn remove_price(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected = sqlx::query(r#"DELETE FROM "SupplierPrice" WHERE id = $1"#)
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

pub async fn import_prices_csv(
    pool: &PgPool,
    org: Uuid,
    supplier_id: Uuid,
    csv: &str,
) -> Result<ImportResult, AppError> {
    let rows = parse_csv(csv)?;
    let max = max_price();
    let result: Result<ImportResult, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            // El proveedor debe pertenecer al tenant (RLS + comprobación explícita).
            let supplier: Option<(Uuid,)> =
                sqlx::query_as(r#"SELECT id FROM "Supplier" WHERE id = $1 AND "organizationId" = $2"#)
                    .bind(supplier_id)
                    .bind(org)
                    .fetch_optional(&mut **tx)
                    .await?;
            if supplier.is_none() {
                return Ok(Err(AppError::BadRequest));
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
                    r#"INSERT INTO "SupplierPrice" (id, "organizationId", "supplierId", "productId", price, "updatedAt")
                       VALUES ($1, $2, $3, $4, $5, now())
                       ON CONFLICT ("supplierId", "productId")
                       DO UPDATE SET price = EXCLUDED.price, "updatedAt" = now()"#,
                )
                .bind(Uuid::new_v4())
                .bind(org)
                .bind(supplier_id)
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
