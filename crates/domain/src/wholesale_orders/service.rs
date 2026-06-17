//! Servicio de pedidos mayoristas (#154, IT-17c) — port de
//! `wholesale-orders.service.ts`. El precio de cada línea se CONGELA al crear:
//! tarifa del cliente (`PriceListItem`) ?? PVP del producto. `create` gatea el
//! módulo `b2b` y valida que cliente y productos sean del tenant. Estados:
//! DRAFT→CONFIRMED→SHIPPED o CANCELLED; SHIPPED/CANCELLED están cerrados.

use std::collections::HashMap;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use time::PrimitiveDateTime;
use uuid::Uuid;

use crate::feature_flags::assert_flag_enabled;

use super::input::CreateWholesaleOrder;
use super::model::{
    CustomerName, CustomerNameNif, OrderLine, OrderLineDetail, ProductName, StatusResult,
    WholesaleOrderCreated, WholesaleOrderDetail, WholesaleOrderListItem, WholesaleOrderPage,
    WholesaleOrderStatus,
};

const PAGE_SIZE: i64 = 20;
const MAX_PAGE: i64 = 10_000;
const VALID_STATUS: [&str; 4] = ["DRAFT", "CONFIRMED", "SHIPPED", "CANCELLED"];

fn is_valid_status(s: &str) -> bool {
    VALID_STATUS.contains(&s)
}

pub async fn create(
    pool: &PgPool,
    org: Uuid,
    input: CreateWholesaleOrder,
) -> Result<WholesaleOrderCreated, AppError> {
    input.validate()?;
    assert_flag_enabled(pool, org, "b2b", None).await?;
    let result: Result<WholesaleOrderCreated, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            // 1. Cliente del tenant (requireOwned → 400).
            let customer: Option<(String, Option<Uuid>)> = sqlx::query_as(
                r#"SELECT name, "priceListId" FROM "Customer" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(input.customer_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let Some((customer_name, price_list_id)) = customer else {
                return Ok(Err(AppError::BadRequest));
            };

            // 2. Productos activos del tenant → PVP por id.
            let mut product_ids: Vec<Uuid> = input.lines.iter().map(|l| l.product_id).collect();
            product_ids.sort();
            product_ids.dedup();
            let products: Vec<(Uuid, Decimal)> = sqlx::query_as(
                r#"SELECT id, "salePrice" FROM "Product"
                   WHERE id = ANY($1) AND "organizationId" = $2 AND active = true"#,
            )
            .bind(product_ids.as_slice())
            .bind(org)
            .fetch_all(&mut **tx)
            .await?;
            let sale_by: HashMap<Uuid, Decimal> = products.into_iter().collect();

            // 3. Precio mayorista desde la tarifa del cliente (si la tiene).
            let mut tariff_by: HashMap<Uuid, Decimal> = HashMap::new();
            if let Some(plid) = price_list_id {
                let items: Vec<(Uuid, Decimal)> = sqlx::query_as(
                    r#"SELECT "productId", price FROM "PriceListItem"
                       WHERE "priceListId" = $1 AND "productId" = ANY($2) AND "organizationId" = $3"#,
                )
                .bind(plid)
                .bind(product_ids.as_slice())
                .bind(org)
                .fetch_all(&mut **tx)
                .await?;
                tariff_by = items.into_iter().collect();
            }

            // 4. Construye las líneas con el precio congelado.
            struct Built {
                product_id: Uuid,
                qty: Decimal,
                unit_price: Decimal,
                line_total: Decimal,
            }
            let mut built: Vec<Built> = Vec::with_capacity(input.lines.len());
            for l in &input.lines {
                let Some(sale) = sale_by.get(&l.product_id).copied() else {
                    return Ok(Err(AppError::BadRequest)); // producto no encontrado/inactivo
                };
                let unit_price = tariff_by.get(&l.product_id).copied().unwrap_or(sale);
                let line_total = (unit_price * l.qty).round_dp(2);
                built.push(Built {
                    product_id: l.product_id,
                    qty: l.qty,
                    unit_price,
                    line_total,
                });
            }
            let total: Decimal = built
                .iter()
                .map(|b| b.line_total)
                .sum::<Decimal>()
                .round_dp(2);

            // 5. Cabecera (DRAFT).
            let order_id = Uuid::new_v4();
            let header: (Decimal, Option<String>, PrimitiveDateTime, PrimitiveDateTime) =
                sqlx::query_as(
                    r#"INSERT INTO "WholesaleOrder"
                         (id, "organizationId", "customerId", status, total, notes, "updatedAt")
                       VALUES ($1, $2, $3, 'DRAFT'::"WholesaleOrderStatus", $4, $5, now())
                       RETURNING total, notes, "createdAt", "updatedAt""#,
                )
                .bind(order_id)
                .bind(org)
                .bind(input.customer_id)
                .bind(total)
                .bind(input.notes.as_deref())
                .fetch_one(&mut **tx)
                .await?;

            // 6. Líneas.
            let mut lines_out: Vec<OrderLine> = Vec::with_capacity(built.len());
            for b in &built {
                let line_id = Uuid::new_v4();
                sqlx::query(
                    r#"INSERT INTO "WholesaleOrderLine"
                         (id, "organizationId", "orderId", "productId", qty, "unitPrice", "lineTotal")
                       VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
                )
                .bind(line_id)
                .bind(org)
                .bind(order_id)
                .bind(b.product_id)
                .bind(b.qty)
                .bind(b.unit_price)
                .bind(b.line_total)
                .execute(&mut **tx)
                .await?;
                lines_out.push(OrderLine {
                    id: line_id,
                    organization_id: org,
                    order_id,
                    product_id: b.product_id,
                    qty: b.qty,
                    unit_price: b.unit_price,
                    line_total: b.line_total,
                });
            }

            Ok(Ok(WholesaleOrderCreated {
                id: order_id,
                organization_id: org,
                customer_id: input.customer_id,
                status: WholesaleOrderStatus::Draft,
                total: header.0,
                notes: header.1,
                created_at: header.2,
                updated_at: header.3,
                customer: CustomerName { name: customer_name },
                lines: lines_out,
            }))
        })
        .await?;
    result
}

pub async fn list(
    pool: &PgPool,
    org: Uuid,
    status: Option<String>,
    customer_id: Option<Uuid>,
    page: i64,
) -> Result<WholesaleOrderPage, AppError> {
    let page = page.clamp(1, MAX_PAGE);
    let status = status.filter(|s| is_valid_status(s)); // un estado no válido se ignora
    with_tenant_tx(pool, org, async move |tx, _after| {
        let total_items: i64 = sqlx::query_scalar(
            r#"SELECT count(*) FROM "WholesaleOrder"
               WHERE "organizationId" = $1
                 AND ($2::text IS NULL OR status = $2::"WholesaleOrderStatus")
                 AND ($3::uuid IS NULL OR "customerId" = $3)"#,
        )
        .bind(org)
        .bind(status.as_deref())
        .bind(customer_id)
        .fetch_one(&mut **tx)
        .await?;
        let items: Vec<WholesaleOrderListItem> = sqlx::query_as(
            r#"SELECT o.id, o."customerId" AS customer_id, c.name AS customer_name,
                 o.status::text AS status, o.total, o."createdAt" AS created_at,
                 (SELECT count(*) FROM "WholesaleOrderLine" l WHERE l."orderId" = o.id) AS line_count
               FROM "WholesaleOrder" o
               JOIN "Customer" c ON c.id = o."customerId"
               WHERE o."organizationId" = $1
                 AND ($2::text IS NULL OR o.status = $2::"WholesaleOrderStatus")
                 AND ($3::uuid IS NULL OR o."customerId" = $3)
               ORDER BY o."createdAt" DESC
               LIMIT $4 OFFSET $5"#,
        )
        .bind(org)
        .bind(status.as_deref())
        .bind(customer_id)
        .bind(PAGE_SIZE)
        .bind((page - 1) * PAGE_SIZE)
        .fetch_all(&mut **tx)
        .await?;
        Ok(WholesaleOrderPage {
            items,
            page,
            page_size: PAGE_SIZE,
            total_items,
        })
    })
    .await
}

#[derive(sqlx::FromRow)]
struct DetailHeaderRow {
    id: Uuid,
    customer_id: Uuid,
    status: WholesaleOrderStatus,
    total: Decimal,
    notes: Option<String>,
    created_at: PrimitiveDateTime,
    updated_at: PrimitiveDateTime,
    customer_name: String,
    customer_nif: Option<String>,
}

#[derive(sqlx::FromRow)]
struct LineDetailRow {
    id: Uuid,
    organization_id: Uuid,
    order_id: Uuid,
    product_id: Uuid,
    qty: Decimal,
    unit_price: Decimal,
    line_total: Decimal,
    product_name: String,
}

async fn load_lines(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    order_id: Uuid,
) -> Result<Vec<OrderLineDetail>, sqlx::Error> {
    let rows: Vec<LineDetailRow> = sqlx::query_as(
        r#"SELECT l.id, l."organizationId" AS organization_id, l."orderId" AS order_id,
             l."productId" AS product_id, l.qty, l."unitPrice" AS unit_price,
             l."lineTotal" AS line_total, p.name AS product_name
           FROM "WholesaleOrderLine" l
           JOIN "Product" p ON p.id = l."productId"
           WHERE l."orderId" = $1 AND l."organizationId" = $2
           ORDER BY p.name ASC"#,
    )
    .bind(order_id)
    .bind(org)
    .fetch_all(&mut **tx)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| OrderLineDetail {
            id: r.id,
            organization_id: r.organization_id,
            order_id: r.order_id,
            product_id: r.product_id,
            qty: r.qty,
            unit_price: r.unit_price,
            line_total: r.line_total,
            product: ProductName {
                name: r.product_name,
            },
        })
        .collect())
}

pub async fn get(pool: &PgPool, org: Uuid, id: Uuid) -> Result<WholesaleOrderDetail, AppError> {
    let result: Result<WholesaleOrderDetail, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let header: Option<DetailHeaderRow> = sqlx::query_as(
                r#"SELECT o.id, o."customerId" AS customer_id, o.status::text AS status,
                     o.total, o.notes, o."createdAt" AS created_at, o."updatedAt" AS updated_at,
                     c.name AS customer_name, c.nif AS customer_nif
                   FROM "WholesaleOrder" o
                   JOIN "Customer" c ON c.id = o."customerId"
                   WHERE o.id = $1 AND o."organizationId" = $2"#,
            )
            .bind(id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let Some(h) = header else {
                return Ok(Err(AppError::NotFound));
            };
            let lines = load_lines(tx, org, h.id).await?;
            Ok(Ok(WholesaleOrderDetail {
                id: h.id,
                organization_id: org,
                customer_id: h.customer_id,
                status: h.status,
                total: h.total,
                notes: h.notes,
                created_at: h.created_at,
                updated_at: h.updated_at,
                customer: CustomerNameNif {
                    name: h.customer_name,
                    nif: h.customer_nif,
                },
                lines,
            }))
        })
        .await?;
    result
}

pub async fn update_status(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    status: String,
) -> Result<StatusResult, AppError> {
    if !is_valid_status(&status) {
        return Err(AppError::BadRequest);
    }
    let result: Result<StatusResult, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let current: Option<String> = sqlx::query_scalar(
                r#"SELECT status::text FROM "WholesaleOrder" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let Some(current) = current else {
                return Ok(Err(AppError::NotFound));
            };
            if current == "SHIPPED" || current == "CANCELLED" {
                return Ok(Err(AppError::BadRequest)); // pedido cerrado
            }
            let row: StatusResult = sqlx::query_as(
                r#"UPDATE "WholesaleOrder" SET status = $3::"WholesaleOrderStatus", "updatedAt" = now()
                   WHERE id = $1 AND "organizationId" = $2
                   RETURNING id, status::text AS status"#,
            )
            .bind(id)
            .bind(org)
            .bind(&status)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(row))
        })
        .await?;
    result
}
