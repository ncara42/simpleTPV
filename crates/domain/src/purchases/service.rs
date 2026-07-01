//! Servicio de pedidos a proveedor (#153) — port de `purchases.service.ts`.
//! DRAFT→CONFIRMED→(PARTIALLY_RECEIVED)→RECEIVED. La recepción incrementa el
//! stock destino (PURCHASE_RECEIPT, con lote si el producto lo exige) y recalcula
//! el estado. Incluye la propuesta de reposición (#45). Todo bajo `with_tenant_tx`.

use std::collections::HashMap;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use time::macros::format_description;
use time::{Date, OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use crate::csv::escape_csv_field;
use crate::stock::model::MovementType;
use crate::stock::service::{apply_movement, ApplyMovementInput, BatchRef};

use super::domain::{fill_rate, lead_time_days, suggest_quantity, SALES_WINDOW_DAYS};
use super::input::{CreatePurchaseOrder, ReceivePurchaseOrder, SuggestPurchase};
use super::model::{Kpis, PurchaseOrder, PurchaseOrderLine, PurchaseOrderWithLines, SuggestionRow};

const PO_COLS: &str = r#"id, "organizationId" AS organization_id, "supplierId" AS supplier_id,
    "storeId" AS store_id, status::text AS status, notes, "createdBy" AS created_by,
    "createdAt" AS created_at, "confirmedAt" AS confirmed_at, "receivedAt" AS received_at"#;

const LINE_COLS: &str = r#"id, "purchaseOrderId" AS purchase_order_id, "productId" AS product_id,
    "quantityOrdered" AS quantity_ordered, "quantityReceived" AS quantity_received,
    "unitCost" AS unit_cost"#;

async fn load_order(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org: Uuid,
    id: Uuid,
) -> Result<Option<PurchaseOrder>, sqlx::Error> {
    let sql =
        format!(r#"SELECT {PO_COLS} FROM "PurchaseOrder" WHERE id = $1 AND "organizationId" = $2"#);
    sqlx::query_as(&sql)
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
}

async fn load_lines(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    order_id: Uuid,
) -> Result<Vec<PurchaseOrderLine>, sqlx::Error> {
    let sql = format!(
        r#"SELECT {LINE_COLS} FROM "PurchaseOrderLine" WHERE "purchaseOrderId" = $1 ORDER BY id"#
    );
    sqlx::query_as(&sql)
        .bind(order_id)
        .fetch_all(&mut **tx)
        .await
}

/// `POST /purchase-orders` — crea un pedido en DRAFT con líneas.
pub async fn create(
    pool: &sqlx::PgPool,
    org: Uuid,
    user_id: Uuid,
    input: CreatePurchaseOrder,
) -> Result<PurchaseOrderWithLines, AppError> {
    input.validate()?;
    let result: Result<PurchaseOrderWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let supplier: Option<(Uuid,)> = sqlx::query_as(
                r#"SELECT id FROM "Supplier" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(input.supplier_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let store: Option<(Uuid,)> = sqlx::query_as(
                r#"SELECT id FROM "Store" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(input.store_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            if supplier.is_none() || store.is_none() {
                return Ok(Err(AppError::BadRequest));
            }
            let id = Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO "PurchaseOrder" (id, "organizationId", "supplierId", "storeId", "createdBy", notes)
                   VALUES ($1, $2, $3, $4, $5, $6)"#,
            )
            .bind(id)
            .bind(org)
            .bind(input.supplier_id)
            .bind(input.store_id)
            .bind(user_id)
            .bind(input.notes.as_deref())
            .execute(&mut **tx)
            .await?;
            for l in &input.lines {
                sqlx::query(
                    r#"INSERT INTO "PurchaseOrderLine" (id, "organizationId", "purchaseOrderId", "productId", "quantityOrdered", "unitCost")
                       VALUES ($1, $2, $3, $4, $5, $6)"#,
                )
                .bind(Uuid::new_v4())
                .bind(org)
                .bind(id)
                .bind(l.product_id)
                .bind(l.quantity_ordered)
                .bind(l.unit_cost)
                .execute(&mut **tx)
                .await?;
            }
            let order = load_order(tx, org, id).await?.expect("recién creado");
            let lines = load_lines(tx, id).await?;
            Ok(Ok(PurchaseOrderWithLines { order, lines, kpis: None }))
        })
        .await?;
    result
}

/// `GET /purchase-orders?status=&supplierId=` — listado del tenant.
pub async fn list(
    pool: &sqlx::PgPool,
    org: Uuid,
    status: Option<String>,
    supplier_id: Option<Uuid>,
) -> Result<Vec<PurchaseOrderWithLines>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let mut qb: sqlx::QueryBuilder<sqlx::Postgres> = sqlx::QueryBuilder::new(format!(
            r#"SELECT {PO_COLS} FROM "PurchaseOrder" WHERE "organizationId" = "#
        ));
        qb.push_bind(org);
        if let Some(s) = &status {
            qb.push(r#" AND status = "#)
                .push_bind(s.clone())
                .push(r#"::"PurchaseOrderStatus""#);
        }
        if let Some(sup) = supplier_id {
            qb.push(r#" AND "supplierId" = "#).push_bind(sup);
        }
        qb.push(r#" ORDER BY "createdAt" DESC"#);
        let orders: Vec<PurchaseOrder> = qb.build_query_as().fetch_all(&mut **tx).await?;
        let mut out = Vec::with_capacity(orders.len());
        for order in orders {
            let lines = load_lines(tx, order.id).await?;
            out.push(PurchaseOrderWithLines {
                order,
                lines,
                kpis: None,
            });
        }
        Ok(out)
    })
    .await
}

/// `GET /purchase-orders/:id` — pedido con líneas + KPIs (lead time, fill rate).
pub async fn get(
    pool: &sqlx::PgPool,
    org: Uuid,
    id: Uuid,
) -> Result<PurchaseOrderWithLines, AppError> {
    let found: Option<PurchaseOrderWithLines> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(order) = load_order(tx, org, id).await? else {
                return Ok(None);
            };
            let lines = load_lines(tx, id).await?;
            let ordered: Decimal = lines.iter().map(|l| l.quantity_ordered).sum();
            let received: Decimal = lines.iter().map(|l| l.quantity_received).sum();
            let kpis = Kpis {
                lead_time_days: lead_time_days(order.confirmed_at, order.received_at),
                fill_rate: fill_rate(ordered, received),
            };
            Ok(Some(PurchaseOrderWithLines {
                order,
                lines,
                kpis: Some(kpis),
            }))
        })
        .await?;
    found.ok_or(AppError::NotFound)
}

/// `POST /purchase-orders/:id/confirm` — DRAFT→CONFIRMED (transición atómica).
pub async fn confirm(
    pool: &sqlx::PgPool,
    org: Uuid,
    id: Uuid,
) -> Result<PurchaseOrderWithLines, AppError> {
    let result: Result<PurchaseOrderWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(order) = load_order(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if order.status != super::model::PurchaseOrderStatus::Draft {
                return Ok(Err(AppError::Conflict));
            }
            let updated = sqlx::query(
                r#"UPDATE "PurchaseOrder" SET status = 'CONFIRMED'::"PurchaseOrderStatus", "confirmedAt" = now()
                   WHERE id = $1 AND "organizationId" = $2 AND status = 'DRAFT'::"PurchaseOrderStatus""#,
            )
            .bind(id)
            .bind(org)
            .execute(&mut **tx)
            .await?
            .rows_affected();
            if updated == 0 {
                return Ok(Err(AppError::Conflict));
            }
            let order = load_order(tx, org, id).await?.expect("confirmado");
            let lines = load_lines(tx, id).await?;
            Ok(Ok(PurchaseOrderWithLines { order, lines, kpis: None }))
        })
        .await?;
    result
}

/// `POST /purchase-orders/suggest` — propuesta de reposición de una tienda (#45).
///
/// Con `supplier_id`, la propuesta se acota a los productos que ese proveedor sirve
/// (tabla `SupplierPrice`) y usa su `leadTimeDays` para ampliar el horizonte de
/// demanda —evita la rotura de stock durante el tránsito del pedido—. Sin proveedor
/// cubre toda la tienda y sin plazo de entrega (comportamiento previo).
pub async fn suggest(
    pool: &sqlx::PgPool,
    org: Uuid,
    input: SuggestPurchase,
) -> Result<Vec<SuggestionRow>, AppError> {
    input.validate()?;
    let days = input
        .days_coverage
        .unwrap_or(super::domain::DEFAULT_DAYS_COVERAGE);
    let now = OffsetDateTime::now_utc();
    let since = {
        let d = now
            .date()
            .saturating_sub(time::Duration::days(SALES_WINDOW_DAYS));
        PrimitiveDateTime::new(d, now.time())
    };
    let store_id = input.store_id;
    let supplier_id = input.supplier_id;
    let result: Result<Vec<SuggestionRow>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            // Lead time del proveedor si se filtra por él; proveedor inexistente o
            // fuera del tenant → BadRequest (fail-fast, no una propuesta vacía muda).
            let lead_time_days: i64 = if let Some(sup) = supplier_id {
                let row: Option<(i32,)> = sqlx::query_as(
                    r#"SELECT "leadTimeDays" FROM "Supplier" WHERE id = $1 AND "organizationId" = $2"#,
                )
                .bind(sup)
                .bind(org)
                .fetch_optional(&mut **tx)
                .await?;
                match row {
                    Some((lt,)) => i64::from(lt),
                    None => return Ok(Err(AppError::BadRequest)),
                }
            } else {
                0
            };

            // Stock de la tienda; con proveedor, solo los productos que sirve
            // (SupplierPrice) — no tiene sentido proponerle lo que no vende.
            let mut qb: sqlx::QueryBuilder<sqlx::Postgres> = sqlx::QueryBuilder::new(
                r#"SELECT s."productId", s.quantity, s."minStock", p.name
                   FROM "Stock" s JOIN "Product" p ON p.id = s."productId"
                   WHERE s."storeId" = "#,
            );
            qb.push_bind(store_id)
                .push(r#" AND s."organizationId" = "#)
                .push_bind(org);
            if let Some(sup) = supplier_id {
                qb.push(
                    r#" AND EXISTS (SELECT 1 FROM "SupplierPrice" sp
                        WHERE sp."productId" = s."productId" AND sp."organizationId" = "#,
                )
                .push_bind(org)
                .push(r#" AND sp."supplierId" = "#)
                .push_bind(sup)
                .push(")");
            }
            let stock_rows: Vec<(Uuid, Decimal, Decimal, String)> =
                qb.build_query_as().fetch_all(&mut **tx).await?;

            let sales: Vec<(Uuid, Decimal)> = sqlx::query_as(
                r#"SELECT "productId", quantity FROM "StockMovement"
                   WHERE "storeId" = $1 AND "organizationId" = $2
                     AND type = 'SALE'::"MovementType" AND "createdAt" >= $3"#,
            )
            .bind(store_id)
            .bind(org)
            .bind(since)
            .fetch_all(&mut **tx)
            .await?;

            // Agrega las ventas por producto UNA vez (O(N+M)); antes se recorría el
            // vector de ventas entero por cada producto (O(N·M)).
            let mut sold_by_product: HashMap<Uuid, Decimal> = HashMap::new();
            for (product_id, quantity) in sales {
                *sold_by_product.entry(product_id).or_insert(Decimal::ZERO) += quantity.abs();
            }

            let window = Decimal::from(SALES_WINDOW_DAYS);
            let mut rows: Vec<SuggestionRow> = stock_rows
                .into_iter()
                .map(|(product_id, stock_actual, min_stock, product_name)| {
                    let sold30 = sold_by_product
                        .get(&product_id)
                        .copied()
                        .unwrap_or(Decimal::ZERO);
                    let venta_media_diaria = (sold30 / window).round_dp(3);
                    let cantidad_sugerida = suggest_quantity(
                        min_stock,
                        stock_actual,
                        venta_media_diaria,
                        days,
                        lead_time_days,
                    );
                    let rotacion = if stock_actual > Decimal::ZERO {
                        Some((venta_media_diaria / stock_actual).round_dp(3))
                    } else {
                        None
                    };
                    let cobertura_dias = if venta_media_diaria > Decimal::ZERO {
                        Some((stock_actual / venta_media_diaria).round_dp(3))
                    } else {
                        None
                    };
                    SuggestionRow {
                        product_id,
                        product_name,
                        stock_actual,
                        min_stock,
                        venta_media_30d: sold30,
                        venta_media_diaria,
                        rotacion,
                        cobertura_dias,
                        cantidad_sugerida,
                    }
                })
                .filter(|r| r.cantidad_sugerida > Decimal::ZERO)
                .collect();
            rows.sort_by_key(|r| std::cmp::Reverse(r.cantidad_sugerida));
            Ok(Ok(rows))
        })
        .await?;
    result
}

/// `GET /purchase-orders/:id/export` — CSV del pedido (producto, pedido, recibido,
/// coste). Texto escapado (anti CSV/formula injection).
pub async fn export_csv(pool: &sqlx::PgPool, org: Uuid, id: Uuid) -> Result<String, AppError> {
    let order = get(pool, org, id).await?;
    let product_ids: Vec<Uuid> = order.lines.iter().map(|l| l.product_id).collect();
    let names: Vec<(Uuid, String)> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(r#"SELECT id, name FROM "Product" WHERE id = ANY($1)"#)
            .bind(product_ids)
            .fetch_all(&mut **tx)
            .await
    })
    .await?;

    let header = "producto,cantidad_pedida,cantidad_recibida,coste_unitario";
    let mut out = vec![header.to_owned()];
    for l in &order.lines {
        let name = names
            .iter()
            .find(|(id, _)| *id == l.product_id)
            .map(|(_, n)| n.clone())
            .unwrap_or_else(|| l.product_id.to_string());
        out.push(
            [
                escape_csv_field(&name),
                l.quantity_ordered.normalize().to_string(),
                l.quantity_received.normalize().to_string(),
                l.unit_cost
                    .map(|c| c.normalize().to_string())
                    .unwrap_or_default(),
            ]
            .join(","),
        );
    }
    Ok(out.join("\n"))
}

fn parse_expiry(s: &str) -> Result<Date, AppError> {
    Date::parse(s, format_description!("[year]-[month]-[day]")).map_err(|_| AppError::BadRequest)
}

/// `POST /purchase-orders/:id/receive` — recepción (parcial o total): acumula lo
/// recibido por línea, incrementa el stock destino (PURCHASE_RECEIPT, con lote si
/// el producto lo exige) y recalcula el estado. Solo desde CONFIRMED/PARTIALLY.
pub async fn receive(
    pool: &sqlx::PgPool,
    org: Uuid,
    user_id: Uuid,
    id: Uuid,
    input: ReceivePurchaseOrder,
) -> Result<PurchaseOrderWithLines, AppError> {
    input.validate()?;
    let result: Result<PurchaseOrderWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            use super::model::PurchaseOrderStatus::*;
            let Some(order) = load_order(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if !matches!(order.status, Confirmed | PartiallyReceived) {
                return Ok(Err(AppError::Conflict));
            }
            let lines = load_lines(tx, id).await?;
            // tracksBatch por producto.
            let product_ids: Vec<Uuid> = lines.iter().map(|l| l.product_id).collect();
            let tracks: Vec<(Uuid, bool)> = sqlx::query_as(
                r#"SELECT id, "tracksBatch" FROM "Product" WHERE id = ANY($1)"#,
            )
            .bind(&product_ids)
            .fetch_all(&mut **tx)
            .await?;
            let tracks_of = |pid: Uuid| tracks.iter().find(|(i, _)| *i == pid).map(|(_, t)| *t).unwrap_or(false);

            // Validación: línea del pedido, no excede lo pedido, lote si exige.
            for r in &input.lines {
                let Some(line) = lines.iter().find(|l| l.id == r.line_id) else {
                    return Ok(Err(AppError::BadRequest));
                };
                if line.quantity_received + r.quantity_received > line.quantity_ordered {
                    return Ok(Err(AppError::BadRequest));
                }
                if r.quantity_received > Decimal::ZERO
                    && tracks_of(line.product_id)
                    && r.lot_code.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true)
                {
                    return Ok(Err(AppError::BadRequest)); // lote obligatorio
                }
            }

            for r in &input.lines {
                let line = lines.iter().find(|l| l.id == r.line_id).expect("validada");
                if r.quantity_received <= Decimal::ZERO {
                    continue;
                }
                let touched = sqlx::query(
                    r#"UPDATE "PurchaseOrderLine" SET "quantityReceived" = "quantityReceived" + $2
                       WHERE id = $1 AND "organizationId" = $3"#,
                )
                .bind(line.id)
                .bind(r.quantity_received)
                .bind(org)
                .execute(&mut **tx)
                .await?
                .rows_affected();
                if touched == 0 {
                    return Ok(Err(AppError::Conflict)); // recepción concurrente o fuera de tenant
                }

                let lot = r.lot_code.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
                let batch = if tracks_of(line.product_id) {
                    if let Some(lot_code) = lot {
                        let expiry_date = match &r.expiry_date {
                            Some(e) => match parse_expiry(e) {
                                Ok(d) => Some(d),
                                Err(_) => return Ok(Err(AppError::BadRequest)),
                            },
                            None => None,
                        };
                        Some(BatchRef {
                            lot_code: lot_code.to_owned(),
                            expiry_date,
                        })
                    } else {
                        None
                    }
                } else {
                    None
                };
                apply_movement(
                    tx,
                    ApplyMovementInput {
                        organization_id: org,
                        product_id: line.product_id,
                        store_id: order.store_id,
                        movement_type: MovementType::PurchaseReceipt,
                        quantity: r.quantity_received,
                        reference_id: Some(order.id),
                        reason: None,
                        user_id: Some(user_id),
                        batch,
                    },
                )
                .await?;
            }

            // Recalcula estado: RECEIVED si toda línea alcanza lo pedido.
            let fresh = load_lines(tx, id).await?;
            let complete = fresh.iter().all(|l| l.quantity_received >= l.quantity_ordered);
            if complete {
                sqlx::query(
                    r#"UPDATE "PurchaseOrder" SET status = 'RECEIVED'::"PurchaseOrderStatus", "receivedAt" = now()
                       WHERE id = $1 AND "organizationId" = $2"#,
                )
                .bind(id)
                .bind(org)
                .execute(&mut **tx)
                .await?;
            } else {
                sqlx::query(
                    r#"UPDATE "PurchaseOrder" SET status = 'PARTIALLY_RECEIVED'::"PurchaseOrderStatus"
                       WHERE id = $1 AND "organizationId" = $2"#,
                )
                .bind(id)
                .bind(org)
                .execute(&mut **tx)
                .await?;
            }
            let order = load_order(tx, org, id).await?.expect("recibido");
            Ok(Ok(PurchaseOrderWithLines { order, lines: fresh, kpis: None }))
        })
        .await?;
    result
}
