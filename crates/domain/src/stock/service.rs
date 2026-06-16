//! Servicio de stock — port de `stock.service.ts`. Toda escritura pasa por
//! [`with_tenant_tx`] (RLS). `apply_movement`/`apply_fefo_outflow` son la
//! primitiva atómica que reusarán ventas/devoluciones/traspasos (operan sobre una
//! tx ya abierta; nunca abren la suya).
//!
//! NOTA: los efectos post-commit (cache Redis, eventos SSE `stock.changed`/
//! `alert.created`) se difieren a cuando se porten esas infra (la tx y las alertas
//! ya quedan consistentes; el `AfterCommit` está disponible para engancharlos).

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use time::{Date, OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::domain::{
    alert_type_for, allocate_fefo, days_until, expiry_cutoff, expiry_status, stock_level,
    FefoBatch, EXPIRY_THRESHOLD_DAYS,
};
use super::input::{Adjust, InventoryCount, SetMin};
use super::model::{
    AlertType, ExpiringBatch, InventoryCountResult, MovementType, MovementsPage, StockMovement,
    StockView,
};

/// Tope del tamaño de página de `GET /stock/movements` (SEC-09).
const MAX_MOVEMENTS_PAGE_SIZE: i64 = 100;

/// Lote afectado por un movimiento (#126).
pub struct BatchRef {
    pub lot_code: String,
    /// Solo se aplica si llega `Some` (una reposición sin fecha no borra la existente).
    pub expiry_date: Option<Date>,
}

/// Entrada de [`apply_movement`]. `quantity` positiva = entrada, negativa = salida.
pub struct ApplyMovementInput {
    pub organization_id: Uuid,
    pub product_id: Uuid,
    pub store_id: Uuid,
    pub movement_type: MovementType,
    pub quantity: Decimal,
    pub reference_id: Option<Uuid>,
    pub reason: Option<String>,
    pub user_id: Option<Uuid>,
    pub batch: Option<BatchRef>,
}

/// Columnas de `StockMovement` con alias snake_case para `FromRow` (enum como texto).
const MOVEMENT_COLS: &str = r#"id, "organizationId" AS organization_id, "productId" AS product_id,
    "storeId" AS store_id, "userId" AS user_id, type::text AS movement_type, quantity,
    "referenceId" AS reference_id, "batchId" AS batch_id, reason, "createdAt" AS created_at"#;

/// Aplica un movimiento de stock de forma atómica dentro de `tx`: upsert de Stock
/// (incrementa/decrementa quantity), upsert opcional de StockBatch (#126), registro
/// del StockMovement y reevaluación de la alerta. Devuelve el stock resultante.
/// DEBE llamarse dentro de un [`with_tenant_tx`] (tenant fijado).
pub async fn apply_movement(
    tx: &mut Transaction<'_, Postgres>,
    input: ApplyMovementInput,
) -> Result<Decimal, sqlx::Error> {
    // Upsert del agregado Stock; incrementa por la cantidad (delta con signo).
    let (quantity, min_stock): (Decimal, Decimal) = sqlx::query_as(
        r#"INSERT INTO "Stock" (id, "organizationId", "productId", "storeId", quantity, "minStock", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 0, now())
           ON CONFLICT ("productId", "storeId")
             DO UPDATE SET quantity = "Stock".quantity + EXCLUDED.quantity, "updatedAt" = now()
           RETURNING quantity, "minStock""#,
    )
    .bind(Uuid::new_v4())
    .bind(input.organization_id)
    .bind(input.product_id)
    .bind(input.store_id)
    .bind(input.quantity)
    .fetch_one(&mut **tx)
    .await?;

    // Lote (#126): upsert del StockBatch por (producto, tienda, lotCode); la
    // caducidad solo se sobrescribe si llega una fecha real (COALESCE).
    let mut batch_id: Option<Uuid> = None;
    if let Some(batch) = &input.batch {
        let id: Uuid = sqlx::query_scalar(
            r#"INSERT INTO "StockBatch" (id, "organizationId", "productId", "storeId", "lotCode", "expiryDate", quantity, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
               ON CONFLICT ("productId", "storeId", "lotCode")
                 DO UPDATE SET quantity = "StockBatch".quantity + EXCLUDED.quantity,
                   "expiryDate" = COALESCE(EXCLUDED."expiryDate", "StockBatch"."expiryDate"),
                   "updatedAt" = now()
               RETURNING id"#,
        )
        .bind(Uuid::new_v4())
        .bind(input.organization_id)
        .bind(input.product_id)
        .bind(input.store_id)
        .bind(&batch.lot_code)
        .bind(batch.expiry_date)
        .bind(input.quantity)
        .fetch_one(&mut **tx)
        .await?;
        batch_id = Some(id);
    }

    sqlx::query(
        r#"INSERT INTO "StockMovement" (id, "organizationId", "productId", "storeId", "userId", type, quantity, "referenceId", "batchId", reason, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6::"MovementType", $7, $8, $9, $10, now())"#,
    )
    .bind(Uuid::new_v4())
    .bind(input.organization_id)
    .bind(input.product_id)
    .bind(input.store_id)
    .bind(input.user_id)
    .bind(input.movement_type)
    .bind(input.quantity)
    .bind(input.reference_id)
    .bind(batch_id)
    .bind(input.reason)
    .execute(&mut **tx)
    .await?;

    reevaluate_alert(
        tx,
        input.organization_id,
        input.product_id,
        input.store_id,
        quantity,
        min_stock,
    )
    .await?;

    Ok(quantity)
}

/// Reevalúa la alerta de stock mínimo dentro de `tx` (#29): crea/actualiza si el
/// stock cruza el mínimo, resuelve si vuelve por encima. Idempotente (una activa
/// por par, índice único parcial). Devuelve el tipo de alerta CREADA (nueva), o
/// `None` si solo se actualizó/resolvió/no cambió.
pub async fn reevaluate_alert(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    product_id: Uuid,
    store_id: Uuid,
    quantity: Decimal,
    min_stock: Decimal,
) -> Result<Option<AlertType>, sqlx::Error> {
    let wanted = alert_type_for(quantity, min_stock);
    let active: Option<(Uuid, AlertType)> = sqlx::query_as(
        r#"SELECT id, "alertType"::text FROM "StockAlert"
           WHERE "productId" = $1 AND "storeId" = $2 AND "organizationId" = $3 AND resolved = false
           LIMIT 1"#,
    )
    .bind(product_id)
    .bind(store_id)
    .bind(organization_id)
    .fetch_optional(&mut **tx)
    .await?;

    match (wanted, active) {
        // Por encima del mínimo: resolver la alerta activa si existe.
        (None, Some((id, _))) => {
            sqlx::query(
                r#"UPDATE "StockAlert" SET resolved = true, "resolvedAt" = now() WHERE id = $1"#,
            )
            .bind(id)
            .execute(&mut **tx)
            .await?;
            Ok(None)
        }
        (None, None) => Ok(None),
        // Sin alerta activa: crear una nueva del tipo correspondiente.
        (Some(wanted), None) => {
            sqlx::query(
                r#"INSERT INTO "StockAlert" (id, "organizationId", "productId", "storeId", "alertType", "createdAt")
                   VALUES ($1, $2, $3, $4, $5::"AlertType", now())"#,
            )
            .bind(Uuid::new_v4())
            .bind(organization_id)
            .bind(product_id)
            .bind(store_id)
            .bind(wanted)
            .execute(&mut **tx)
            .await?;
            Ok(Some(wanted))
        }
        // Ya hay alerta activa: si cambió el tipo, actualizar (no es alerta nueva).
        (Some(wanted), Some((id, current))) => {
            if current != wanted {
                sqlx::query(
                    r#"UPDATE "StockAlert" SET "alertType" = $2::"AlertType" WHERE id = $1"#,
                )
                .bind(id)
                .bind(wanted)
                .execute(&mut **tx)
                .await?;
            }
            Ok(None)
        }
    }
}

/// Salida de stock por FEFO (#126): consume lotes por caducidad ascendente (NULLs
/// al final), un movimiento por lote; el faltante sale SIN lote (no bloquea, Q3).
/// `quantity` es la cantidad POSITIVA a retirar. DEBE correr dentro de un `with_tenant_tx`.
// Primitiva interna reutilizada por ventas/traspasos; firma plana a propósito
// (todos los argumentos son obligatorios y del mismo origen, la venta).
#[allow(clippy::too_many_arguments)]
pub async fn apply_fefo_outflow(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    product_id: Uuid,
    store_id: Uuid,
    movement_type: MovementType,
    quantity: Decimal,
    reference_id: Option<Uuid>,
    user_id: Option<Uuid>,
) -> Result<Decimal, sqlx::Error> {
    let batches: Vec<(String, Decimal)> = sqlx::query_as(
        r#"SELECT "lotCode", quantity FROM "StockBatch"
           WHERE "organizationId" = $1 AND "productId" = $2 AND "storeId" = $3 AND quantity > 0
           ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC"#,
    )
    .bind(organization_id)
    .bind(product_id)
    .bind(store_id)
    .fetch_all(&mut **tx)
    .await?;

    let fefo: Vec<FefoBatch> = batches
        .into_iter()
        .map(|(lot_code, quantity)| FefoBatch { lot_code, quantity })
        .collect();
    let allocation = allocate_fefo(&fefo, quantity);

    // Stock de partida (por si la cantidad fuese 0 y no hubiese movimientos).
    let mut resulting: Decimal = sqlx::query_scalar(
        r#"SELECT quantity FROM "Stock" WHERE "productId" = $1 AND "storeId" = $2"#,
    )
    .bind(product_id)
    .bind(store_id)
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or(Decimal::ZERO);

    for consumed in &allocation.consumed {
        resulting = apply_movement(
            tx,
            ApplyMovementInput {
                organization_id,
                product_id,
                store_id,
                movement_type,
                quantity: -consumed.qty,
                reference_id,
                reason: None,
                user_id,
                batch: Some(BatchRef {
                    lot_code: consumed.lot_code.clone(),
                    expiry_date: None,
                }),
            },
        )
        .await?;
    }
    if allocation.shortfall > Decimal::ZERO {
        resulting = apply_movement(
            tx,
            ApplyMovementInput {
                organization_id,
                product_id,
                store_id,
                movement_type,
                quantity: -allocation.shortfall,
                reference_id,
                reason: None,
                user_id,
                batch: None,
            },
        )
        .await?;
    }
    Ok(resulting)
}

/// `PUT /stock/min`: configura el stock mínimo (upsert) y reevalúa la alerta.
pub async fn set_min(pool: &PgPool, org: Uuid, input: SetMin) -> Result<StockView, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let (quantity, min_stock): (Decimal, Decimal) = sqlx::query_as(
            r#"INSERT INTO "Stock" (id, "organizationId", "productId", "storeId", quantity, "minStock", "updatedAt")
               VALUES ($1, $2, $3, $4, 0, $5, now())
               ON CONFLICT ("productId", "storeId")
                 DO UPDATE SET "minStock" = EXCLUDED."minStock", "updatedAt" = now()
               RETURNING quantity, "minStock""#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(input.product_id)
        .bind(input.store_id)
        .bind(input.min_stock)
        .fetch_one(&mut **tx)
        .await?;
        reevaluate_alert(tx, org, input.product_id, input.store_id, quantity, min_stock).await?;
        Ok(StockView {
            product_id: input.product_id,
            store_id: input.store_id,
            quantity,
            min_stock,
            level: stock_level(quantity, min_stock),
        })
    })
    .await
}

/// `POST /stock/adjust`: fija el stock a `new_quantity` (delta como ADJUSTMENT).
pub async fn adjust(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    input: Adjust,
) -> Result<StockView, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        adjust_in_tx(
            tx,
            org,
            user_id,
            input.product_id,
            input.store_id,
            input.new_quantity,
            &input.reason,
        )
        .await
    })
    .await
}

/// `POST /stock/inventory-count`: recuento completo en UNA tx (atómico, S-11).
pub async fn confirm_inventory_count(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    input: InventoryCount,
) -> Result<InventoryCountResult, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let mut adjusted = Vec::with_capacity(input.lines.len());
        for line in &input.lines {
            let view = adjust_in_tx(
                tx,
                org,
                user_id,
                line.product_id,
                input.store_id,
                line.counted_quantity,
                &input.reason,
            )
            .await?;
            adjusted.push(view);
        }
        Ok(InventoryCountResult {
            store_id: input.store_id,
            adjusted,
        })
    })
    .await
}

/// Ajuste de un par dentro de una tx, con lock pesimista (`FOR UPDATE`) para
/// serializar ajustes concurrentes. Compartido por `adjust` y el recuento.
async fn adjust_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    user_id: Uuid,
    product_id: Uuid,
    store_id: Uuid,
    new_quantity: Decimal,
    reason: &str,
) -> Result<StockView, sqlx::Error> {
    let current: Decimal = sqlx::query_scalar(
        r#"SELECT quantity FROM "Stock" WHERE "productId" = $1 AND "storeId" = $2 FOR UPDATE"#,
    )
    .bind(product_id)
    .bind(store_id)
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or(Decimal::ZERO);
    let delta = new_quantity - current;

    let quantity = apply_movement(
        tx,
        ApplyMovementInput {
            organization_id: org,
            product_id,
            store_id,
            movement_type: MovementType::Adjustment,
            quantity: delta,
            reference_id: None,
            reason: Some(reason.to_owned()),
            user_id: Some(user_id),
            batch: None,
        },
    )
    .await?;

    let min_stock: Decimal = sqlx::query_scalar(
        r#"SELECT "minStock" FROM "Stock" WHERE "productId" = $1 AND "storeId" = $2"#,
    )
    .bind(product_id)
    .bind(store_id)
    .fetch_one(&mut **tx)
    .await?;

    Ok(StockView {
        product_id,
        store_id,
        quantity,
        min_stock,
        level: stock_level(quantity, min_stock),
    })
}

/// `GET /stock/expiring`: lotes caducados o próximos a caducar (ventana `within_days`).
pub async fn expiring_batches(
    pool: &PgPool,
    org: Uuid,
    store_id: Option<Uuid>,
    within_days: Option<i64>,
) -> Result<Vec<ExpiringBatch>, AppError> {
    let days = within_days
        .filter(|d| *d >= 0)
        .unwrap_or(EXPIRY_THRESHOLD_DAYS);
    let today = OffsetDateTime::now_utc().date();
    let cutoff = expiry_cutoff(today, days);

    let rows: Vec<ExpiringRow> = with_tenant_tx(pool, org, async move |tx, _after| {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
            r#"SELECT b.id, b."productId" AS product_id, p.name AS product_name,
                 b."storeId" AS store_id, s.name AS store_name, b."lotCode" AS lot_code,
                 b."expiryDate" AS expiry_date, b.quantity
               FROM "StockBatch" b
               JOIN "Product" p ON p.id = b."productId"
               JOIN "Store" s ON s.id = b."storeId"
               WHERE b.quantity > 0 AND b."expiryDate" IS NOT NULL AND b."expiryDate" <= "#,
        );
        qb.push_bind(cutoff);
        if let Some(sid) = store_id {
            qb.push(r#" AND b."storeId" = "#).push_bind(sid);
        }
        qb.push(r#" ORDER BY b."expiryDate" ASC, b."lotCode" ASC"#);
        qb.build_query_as::<ExpiringRow>()
            .fetch_all(&mut **tx)
            .await
    })
    .await?;

    let fmt = time::macros::format_description!("[year]-[month]-[day]");
    Ok(rows
        .into_iter()
        .map(|r| ExpiringBatch {
            id: r.id,
            product_id: r.product_id,
            product_name: r.product_name,
            store_id: r.store_id,
            store_name: r.store_name,
            lot_code: r.lot_code,
            expiry_date: r.expiry_date.format(&fmt).unwrap_or_default(),
            quantity: r.quantity,
            days_to_expiry: days_until(r.expiry_date, today),
            status: expiry_status(r.expiry_date, today, days),
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct ExpiringRow {
    id: Uuid,
    product_id: Uuid,
    product_name: String,
    store_id: Uuid,
    store_name: String,
    lot_code: String,
    expiry_date: Date,
    quantity: Decimal,
}

/// Filtros de `GET /stock/movements`.
#[derive(Default)]
pub struct MovementsFilter {
    pub product_id: Option<Uuid>,
    pub store_id: Option<Uuid>,
    pub from: Option<PrimitiveDateTime>,
    pub to: Option<PrimitiveDateTime>,
    pub page: i64,
    pub page_size: i64,
}

/// `GET /stock/movements`: historial paginado (createdAt desc), filtrable.
pub async fn movements(
    pool: &PgPool,
    org: Uuid,
    filter: MovementsFilter,
) -> Result<MovementsPage, AppError> {
    let page = filter.page.max(1);
    let page_size = filter.page_size.clamp(1, MAX_MOVEMENTS_PAGE_SIZE);

    with_tenant_tx(pool, org, async move |tx, _after| {
        // WHERE compartido por el count y el select.
        let push_where = |qb: &mut QueryBuilder<Postgres>| {
            qb.push(r#" WHERE "organizationId" = "#).push_bind(org);
            if let Some(p) = filter.product_id {
                qb.push(r#" AND "productId" = "#).push_bind(p);
            }
            if let Some(s) = filter.store_id {
                qb.push(r#" AND "storeId" = "#).push_bind(s);
            }
            if let Some(f) = filter.from {
                qb.push(r#" AND "createdAt" >= "#).push_bind(f);
            }
            if let Some(t) = filter.to {
                qb.push(r#" AND "createdAt" < "#).push_bind(t);
            }
        };

        let mut count_qb: QueryBuilder<Postgres> =
            QueryBuilder::new(r#"SELECT count(*) FROM "StockMovement""#);
        push_where(&mut count_qb);
        let total_items: i64 = count_qb.build_query_scalar().fetch_one(&mut **tx).await?;

        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("SELECT ");
        qb.push(MOVEMENT_COLS).push(r#" FROM "StockMovement""#);
        push_where(&mut qb);
        qb.push(r#" ORDER BY "createdAt" DESC LIMIT "#)
            .push_bind(page_size)
            .push(" OFFSET ")
            .push_bind((page - 1) * page_size);
        let items: Vec<StockMovement> = qb
            .build_query_as::<StockMovement>()
            .fetch_all(&mut **tx)
            .await?;

        Ok(MovementsPage {
            items,
            page,
            page_size,
            total_items,
        })
    })
    .await
}
