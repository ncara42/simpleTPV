//! Servicio de ventas — port (core) de `sales.service.ts`. Todo bajo
//! `with_tenant_tx` (RLS). El `create` integra el stock vía las primitivas ya
//! portadas (`apply_fefo_outflow` / `apply_movement`).
//!
//! Patrón de errores: el cierre de `with_tenant_tx` devuelve
//! `Result<Result<T, AppError>, sqlx::Error>` — el `Ok(Err(..))` lleva el error de
//! NEGOCIO (validación) y el `Err` (vía `?`) el de BD; ambos se desempaquetan
//! fuera. Las validaciones de negocio ocurren ANTES de cualquier escritura.

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use time::PrimitiveDateTime;
use uuid::Uuid;

use crate::stock::model::MovementType;
use crate::stock::service::{
    apply_batched_return, apply_fefo_outflow, apply_movement, ApplyMovementInput,
};
use crate::store_access::has_store_access;

use super::domain::{
    assert_discount_within_limit, build_tax_breakdown, compute_change, compute_totals,
    format_ticket, PricedLine, TaxLine, TicketDiscount,
};
use super::input::CreateSale;
use super::model::{
    OrgInfo, Sale, SaleLine, SaleListItem, SaleStatus, SaleWithLines, SalesPage, SalesTotals,
    StoreInfo, TicketBlock, TicketData, TicketLine,
};

const MAX_SALES_PAGE_SIZE: i64 = 100;

/// Columnas de `Sale` con alias snake_case para `FromRow` (enums como texto).
const SALE_COLS: &str = r#"id, "organizationId" AS organization_id, "storeId" AS store_id,
    "userId" AS user_id, "ticketNumber" AS ticket_number, subtotal,
    "discountTotal" AS discount_total, total, "paymentMethod"::text AS payment_method,
    "cashGiven" AS cash_given, "cashChange" AS cash_change, status::text AS status,
    "voidedAt" AS voided_at, "voidedBy" AS voided_by, "clientId" AS client_id,
    "createdAt" AS created_at"#;

const LINE_COLS: &str = r#"id, "organizationId" AS organization_id, "saleId" AS sale_id,
    "productId" AS product_id, name, "unitPrice" AS unit_price, qty,
    "discountPct" AS discount_pct, "discountAmt" AS discount_amt, "taxRate" AS tax_rate,
    "costPrice" AS cost_price, "discountSource"::text AS discount_source,
    "lineTotal" AS line_total"#;

#[derive(sqlx::FromRow)]
struct ProductRow {
    id: Uuid,
    name: String,
    sale_price: Decimal,
    tax_rate: Decimal,
    cost_price: Decimal,
    tracks_batch: bool,
}

/// Límite de % de descuento efectivo por rol (paridad NestJS): ADMIN sin límite,
/// MANAGER 50%, CLERK 10%.
fn discount_limit(role: simpletpv_auth::Role) -> Option<Decimal> {
    match role {
        simpletpv_auth::Role::Admin => None,
        simpletpv_auth::Role::Manager => Some(Decimal::from(50)),
        simpletpv_auth::Role::Clerk => Some(Decimal::from(10)),
    }
}

/// `POST /sales`: crea una venta (idempotente por `clientId`).
pub async fn create(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    role: simpletpv_auth::Role,
    input: CreateSale,
) -> Result<SaleWithLines, AppError> {
    input.validate()?;
    let limit = discount_limit(role);
    let is_org_wide = role.is_org_wide();

    with_tenant_tx(pool, org, async move |tx, _after| {
        // 1. Idempotencia offline: si el clientId ya existe, devolver la venta.
        if let Some(cid) = input.client_id {
            if let Some(existing) = load_sale_by_client(tx, cid).await? {
                let lines = load_lines(tx, existing.id).await?;
                return Ok(Ok(SaleWithLines { sale: existing, lines }));
            }
        }
        // 2. Acceso a la tienda (SEC-01).
        if !is_org_wide && !has_store_access(tx, user_id, input.store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        // 3. Caja abierta obligatoria.
        let open: Option<(Uuid,)> = sqlx::query_as(
            r#"SELECT id FROM "CashSession" WHERE "storeId" = $1 AND status = 'OPEN'::"CashSessionStatus" LIMIT 1"#,
        )
        .bind(input.store_id)
        .fetch_optional(&mut **tx)
        .await?;
        if open.is_none() {
            return Ok(Err(AppError::Conflict));
        }
        // 4. Productos + precios por tienda.
        let product_ids: Vec<Uuid> = input.lines.iter().map(|l| l.product_id).collect();
        let products: Vec<ProductRow> = sqlx::query_as(
            r#"SELECT id, name, "salePrice" AS sale_price, "taxRate" AS tax_rate,
                 "costPrice" AS cost_price, "tracksBatch" AS tracks_batch
               FROM "Product" WHERE id = ANY($1)"#,
        )
        .bind(&product_ids)
        .fetch_all(&mut **tx)
        .await?;
        let pmap: std::collections::HashMap<Uuid, ProductRow> =
            products.into_iter().map(|p| (p.id, p)).collect();

        let store_prices: Vec<(Uuid, Decimal)> = sqlx::query_as(
            r#"SELECT "productId", price FROM "StorePrice"
               WHERE "storeId" = $1 AND "productId" = ANY($2)"#,
        )
        .bind(input.store_id)
        .bind(&product_ids)
        .fetch_all(&mut **tx)
        .await?;
        let spmap: std::collections::HashMap<Uuid, Decimal> = store_prices.into_iter().collect();

        // 5. Líneas preciadas (precio = override por tienda o salePrice).
        let mut priced = Vec::with_capacity(input.lines.len());
        for l in &input.lines {
            let Some(p) = pmap.get(&l.product_id) else {
                return Ok(Err(AppError::BadRequest)); // producto inexistente
            };
            let unit_price = spmap.get(&l.product_id).copied().unwrap_or(p.sale_price);
            priced.push(PricedLine {
                product_id: l.product_id,
                name: p.name.clone(),
                unit_price,
                qty: l.qty,
                discount_pct: l.discount_pct,
                discount_amt: l.discount_amt,
                tax_rate: p.tax_rate,
                cost_price: p.cost_price,
            });
        }

        // 6. Totales + límite de descuento por rol + cambio.
        let totals = compute_totals(
            priced,
            TicketDiscount {
                pct: input.ticket_discount_pct,
                amt: input.ticket_discount_amt,
            },
        );
        if let Err(e) = assert_discount_within_limit(limit, totals.discount_total, totals.gross_total) {
            return Ok(Err(e));
        }
        let (cash_given, cash_change) =
            match compute_change(input.payment_method, totals.total, input.cash_given) {
                Ok(v) => v,
                Err(e) => return Ok(Err(e)),
            };

        // 7. Número de ticket: pre-asignado (offline) o contador atómico.
        let ticket_number = if let Some(tn) = &input.ticket_number {
            tn.clone()
        } else {
            let row: Option<(String, i64)> = sqlx::query_as(
                r#"UPDATE "Store" SET "ticketCounter" = "ticketCounter" + 1
                   WHERE id = $1 RETURNING code, "ticketCounter"::bigint"#,
            )
            .bind(input.store_id)
            .fetch_optional(&mut **tx)
            .await?;
            let Some((code, counter)) = row else {
                return Ok(Err(AppError::NotFound)); // tienda inexistente
            };
            format_ticket(&code, counter)
        };

        // 8. INSERT de la venta.
        let sale_id = Uuid::new_v4();
        let sale: Sale = sqlx::query_as(&format!(
            r#"INSERT INTO "Sale" (id, "organizationId", "storeId", "userId", "ticketNumber",
                 subtotal, "discountTotal", total, "paymentMethod", "cashGiven", "cashChange",
                 status, "clientId", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::"PaymentMethod", $10, $11,
                 'COMPLETED'::"SaleStatus", $12, now())
               RETURNING {SALE_COLS}"#,
        ))
        .bind(sale_id)
        .bind(org)
        .bind(input.store_id)
        .bind(user_id)
        .bind(&ticket_number)
        .bind(totals.subtotal)
        .bind(totals.discount_total)
        .bind(totals.total)
        .bind(input.payment_method)
        .bind(cash_given)
        .bind(cash_change)
        .bind(input.client_id)
        .fetch_one(&mut **tx)
        .await?;

        // 9. INSERT de las líneas.
        let mut lines = Vec::with_capacity(totals.lines.len());
        for cl in &totals.lines {
            let line: SaleLine = sqlx::query_as(&format!(
                r#"INSERT INTO "SaleLine" (id, "organizationId", "saleId", "productId", name,
                     "unitPrice", qty, "discountPct", "discountAmt", "taxRate", "costPrice",
                     "discountSource", "lineTotal")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'VOLUNTARY'::"DiscountSource", $12)
                   RETURNING {LINE_COLS}"#,
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(sale_id)
            .bind(cl.priced.product_id)
            .bind(&cl.priced.name)
            .bind(cl.priced.unit_price)
            .bind(cl.priced.qty)
            .bind(cl.priced.discount_pct.unwrap_or(Decimal::ZERO))
            .bind(cl.discount_amt)
            .bind(cl.priced.tax_rate)
            .bind(cl.priced.cost_price)
            .bind(cl.line_total)
            .fetch_one(&mut **tx)
            .await?;
            lines.push(line);
        }

        // 10. Salida de stock por línea (FEFO si el producto lleva lote).
        for cl in &totals.lines {
            let p = &pmap[&cl.priced.product_id];
            if p.tracks_batch {
                apply_fefo_outflow(
                    tx,
                    org,
                    p.id,
                    input.store_id,
                    MovementType::Sale,
                    cl.priced.qty,
                    Some(sale_id),
                    Some(user_id),
                )
                .await?;
            } else {
                apply_movement(
                    tx,
                    ApplyMovementInput {
                        organization_id: org,
                        product_id: p.id,
                        store_id: input.store_id,
                        movement_type: MovementType::Sale,
                        quantity: -cl.priced.qty,
                        reference_id: Some(sale_id),
                        reason: None,
                        user_id: Some(user_id),
                        batch: None,
                    },
                )
                .await?;
            }
        }

        // 11. Registro VeriFactu de la venta (INVOICE) DENTRO de la tx (#155,
        // SEC-02): atómico con la venta. Si la creación del registro fiscal
        // encadenado falla, toda la venta hace rollback → nunca queda una factura
        // sin su registro. El ENVÍO a la AEAT es best-effort y lo procesa la cola.
        crate::verifactu::record_invoice(tx, org, sale_id, &ticket_number, totals.total).await?;

        Ok(Ok(SaleWithLines { sale, lines }))
    })
    .await?
}

/// `GET /sales/by-ticket/:ticketNumber` — venta con líneas (404 si no existe).
/// Org-scoped por RLS (NO acota por tienda al CLERK): paridad con NestJS
/// `findByTicket`, que tampoco llama a `assertStoreAccess` (la comprobación por
/// tienda en NestJS solo está en `create` y `reserveTicketBlock`).
pub async fn find_by_ticket(
    pool: &PgPool,
    org: Uuid,
    ticket_number: &str,
) -> Result<SaleWithLines, AppError> {
    let ticket_number = ticket_number.to_owned();
    let found: Option<SaleWithLines> = with_tenant_tx(pool, org, async move |tx, _after| {
        let Some(sale) = load_sale_by_ticket(tx, &ticket_number).await? else {
            return Ok(None);
        };
        let lines = load_lines(tx, sale.id).await?;
        Ok(Some(SaleWithLines { sale, lines }))
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// `GET /sales/:id/ticket` — datos del ticket / factura simplificada (#152).
/// Org-scoped por RLS y, además, filtro explícito por `organizationId` (defensa
/// anti-IDOR, paridad NestJS `loadTicketData`). 404 si no existe en el tenant.
/// El desglose de IVA se calcula con el descuento de ticket (`subtotal − total`).
pub async fn get_ticket(pool: &PgPool, org: Uuid, sale_id: Uuid) -> Result<TicketData, AppError> {
    let found: Option<TicketData> = with_tenant_tx(pool, org, async move |tx, _after| {
        let sql =
            format!(r#"SELECT {SALE_COLS} FROM "Sale" WHERE id = $1 AND "organizationId" = $2"#);
        let sale: Option<Sale> = sqlx::query_as(&sql)
            .bind(sale_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
        let Some(sale) = sale else {
            return Ok(None);
        };

        let (org_name, org_nif): (String, Option<String>) =
            sqlx::query_as(r#"SELECT name, nif FROM "Organization" WHERE id = $1"#)
                .bind(sale.organization_id)
                .fetch_one(&mut **tx)
                .await?;
        let (store_name, store_code): (String, String) =
            sqlx::query_as(r#"SELECT name, code FROM "Store" WHERE id = $1"#)
                .bind(sale.store_id)
                .fetch_one(&mut **tx)
                .await?;

        let sale_lines = load_lines(tx, sale.id).await?;
        let ticket_discount = sale.subtotal - sale.total;
        let tax_lines: Vec<TaxLine> = sale_lines
            .iter()
            .map(|l| TaxLine {
                tax_rate: l.tax_rate,
                line_total: l.line_total,
            })
            .collect();
        let tax_breakdown = build_tax_breakdown(&tax_lines, ticket_discount);

        let lines: Vec<TicketLine> = sale_lines
            .into_iter()
            .map(|l| TicketLine {
                name: l.name,
                qty: l.qty,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                discount_amt: l.discount_amt,
                line_total: l.line_total,
            })
            .collect();

        Ok(Some(TicketData {
            organization: OrgInfo {
                name: org_name,
                nif: org_nif,
            },
            store: StoreInfo {
                name: store_name,
                code: store_code,
            },
            ticket_number: sale.ticket_number,
            created_at: sale.created_at,
            lines,
            subtotal: sale.subtotal,
            discount_total: sale.discount_total,
            total: sale.total,
            payment_method: sale.payment_method,
            cash_given: sale.cash_given,
            cash_change: sale.cash_change,
            tax_breakdown,
        }))
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// `POST /sales/ticket-block` — reserva `size` números de ticket para uso offline.
/// Es una ESCRITURA sobre `Store.ticketCounter`: el CLERK solo puede reservar en
/// sus tiendas (SEC-01, paridad con NestJS `reserveTicketBlock`).
pub async fn reserve_ticket_block(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    store_id: Uuid,
    size: i64,
) -> Result<TicketBlock, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        let row: Option<(String, i64)> = sqlx::query_as(
            r#"UPDATE "Store" SET "ticketCounter" = "ticketCounter" + $2
               WHERE id = $1 RETURNING code, "ticketCounter"::bigint"#,
        )
        .bind(store_id)
        .bind(size)
        .fetch_optional(&mut **tx)
        .await?;
        match row {
            Some((code, counter)) => Ok(Ok(TicketBlock {
                code,
                from: counter - size + 1,
                to: counter,
            })),
            None => Ok(Err(AppError::NotFound)),
        }
    })
    .await?
}

/// Filtros de `GET /sales`.
#[derive(Default)]
pub struct SalesFilter {
    pub store_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub status: Option<String>,
    /// Familia de producto: la venta tiene alguna línea de un producto de esa familia.
    pub family_id: Option<Uuid>,
    /// Búsqueda libre (paridad NestJS): ILIKE sobre nº de ticket, nombre del
    /// vendedor y nombre de línea; y, si es numérico, `total` exacto.
    pub q: Option<String>,
    pub from: Option<PrimitiveDateTime>,
    pub to: Option<PrimitiveDateTime>,
    pub page: i64,
    pub page_size: i64,
}

/// Empuja los filtros de búsqueda libre (`q`) y de familia (`familyId`) — paridad
/// con `buildSalesFilter` de NestJS. `col_prefix` cualifica las columnas de `Sale`
/// (`""` o `"sa."`); `outer` es el cualificador de la fila externa para las
/// subconsultas correlacionadas (`"Sale"` o `sa`). Todo va por `push_bind` (sin
/// inyección); los `format!` solo expanden constantes de prefijo/alias.
fn push_sales_search(
    qb: &mut QueryBuilder<Postgres>,
    f: &SalesFilter,
    col_prefix: &str,
    outer: &str,
) {
    if let Some(fam) = f.family_id {
        qb.push(format!(
            r#" AND EXISTS (SELECT 1 FROM "SaleLine" slf JOIN "Product" pf ON pf.id = slf."productId"
                 WHERE slf."saleId" = {outer}.id AND pf."familyId" = "#
        ))
        .push_bind(fam)
        .push(")");
    }
    if let Some(term) = f.q.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        let like = format!("%{term}%");
        qb.push(" AND (")
            .push(format!(r#"{col_prefix}"ticketNumber" ILIKE "#))
            .push_bind(like.clone())
            .push(format!(
                r#" OR EXISTS (SELECT 1 FROM "User" uq WHERE uq.id = {outer}."userId" AND uq.name ILIKE "#
            ))
            .push_bind(like.clone())
            .push(")")
            .push(format!(
                r#" OR EXISTS (SELECT 1 FROM "SaleLine" slq WHERE slq."saleId" = {outer}.id AND slq.name ILIKE "#
            ))
            .push_bind(like)
            .push(")");
        // Término numérico → además casa el total exacto (paridad `{ total: Number(term) }`).
        if let Ok(n) = term.parse::<Decimal>() {
            qb.push(format!(r#" OR {col_prefix}total = "#)).push_bind(n);
        }
        qb.push(")");
    }
}

/// `GET /sales` — historial paginado (createdAt desc). Un CLERK (`!org_wide`) solo
/// ve las ventas de sus tiendas (UserStore).
pub async fn list(
    pool: &PgPool,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    filter: SalesFilter,
) -> Result<SalesPage, AppError> {
    let page = filter.page.max(1);
    let page_size = filter.page_size.clamp(1, MAX_SALES_PAGE_SIZE);

    with_tenant_tx(pool, org, async move |tx, _after| {
        let push_where = |qb: &mut QueryBuilder<Postgres>| {
            qb.push(r#" WHERE "organizationId" = "#).push_bind(org);
            if let Some(s) = filter.store_id {
                qb.push(r#" AND "storeId" = "#).push_bind(s);
            }
            if let Some(u) = filter.user_id {
                qb.push(r#" AND "userId" = "#).push_bind(u);
            }
            if let Some(st) = &filter.status {
                qb.push(r#" AND status = "#)
                    .push_bind(st.clone())
                    .push(r#"::"SaleStatus""#);
            }
            if let Some(f) = filter.from {
                qb.push(r#" AND "createdAt" >= "#).push_bind(f);
            }
            if let Some(t) = filter.to {
                qb.push(r#" AND "createdAt" < "#).push_bind(t);
            }
            push_sales_search(qb, &filter, "", r#""Sale""#);
            // SEC-01: el CLERK solo ve ventas de sus tiendas asignadas.
            if !is_org_wide {
                qb.push(
                    r#" AND "storeId" IN (SELECT "storeId" FROM "UserStore" WHERE "userId" = "#,
                )
                .push_bind(requester)
                .push(")");
            }
        };

        let mut count_qb: QueryBuilder<Postgres> =
            QueryBuilder::new(r#"SELECT count(*) FROM "Sale""#);
        push_where(&mut count_qb);
        let total_items: i64 = count_qb.build_query_scalar().fetch_one(&mut **tx).await?;

        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("SELECT ");
        qb.push(SALE_COLS).push(r#" FROM "Sale""#);
        push_where(&mut qb);
        qb.push(r#" ORDER BY "createdAt" DESC LIMIT "#)
            .push_bind(page_size)
            .push(" OFFSET ")
            .push_bind((page - 1) * page_size);
        let sales: Vec<Sale> = qb.build_query_as::<Sale>().fetch_all(&mut **tx).await?;

        // Nombres denormalizados (tienda/vendedor) para las columnas del historial. Una sola
        // query por id (página ≤100); evita ambigüedad de columnas en el JOIN del listado.
        let ids: Vec<Uuid> = sales.iter().map(|s| s.id).collect();
        let name_rows: Vec<(Uuid, String, String)> = sqlx::query_as(
            r#"SELECT s.id, st.name AS store_name, u.name AS seller_name
               FROM "Sale" s
               JOIN "Store" st ON st.id = s."storeId"
               JOIN "User" u ON u.id = s."userId"
               WHERE s.id = ANY($1)"#,
        )
        .bind(&ids)
        .fetch_all(&mut **tx)
        .await?;
        let mut names: std::collections::HashMap<Uuid, (String, String)> = name_rows
            .into_iter()
            .map(|(id, store_name, seller_name)| (id, (store_name, seller_name)))
            .collect();
        let items: Vec<SaleListItem> = sales
            .into_iter()
            .map(|sale| {
                let (store_name, seller_name) = names.remove(&sale.id).unwrap_or_default();
                SaleListItem {
                    sale,
                    store_name,
                    seller_name,
                }
            })
            .collect();

        // Totales: SOLO ventas COMPLETED del filtro (las VOIDED se listan pero no
        // suman). count + importe + ratios de descuento y margen.
        let mut agg_qb: QueryBuilder<Postgres> = QueryBuilder::new(
            r#"SELECT count(*)::bigint, COALESCE(SUM(total), 0), COALESCE(SUM(subtotal), 0),
                 COALESCE(SUM("discountTotal"), 0) FROM "Sale""#,
        );
        push_completed_where(&mut agg_qb, org, requester, is_org_wide, &filter, "");
        let (count, total_amount, sum_subtotal, sum_discount): (i64, Decimal, Decimal, Decimal) =
            agg_qb.build_query_as().fetch_one(&mut **tx).await?;

        // Margen real sobre el coste CONGELADO en la línea (IT-03): producto de
        // columnas que el agregado no expresa → SQL sobre SaleLine JOIN Sale.
        let mut margin_qb: QueryBuilder<Postgres> = QueryBuilder::new(
            r#"SELECT COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0),
                 COALESCE(SUM(sl."lineTotal"), 0)
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId""#,
        );
        push_completed_where(&mut margin_qb, org, requester, is_org_wide, &filter, "sa.");
        let (margin, revenue): (Decimal, Decimal) =
            margin_qb.build_query_as().fetch_one(&mut **tx).await?;

        let discount_base = sum_subtotal + sum_discount;
        let avg_discount_pct = if discount_base > Decimal::ZERO {
            (sum_discount / discount_base).round_dp(6)
        } else {
            Decimal::ZERO
        };
        let avg_margin_pct = if revenue > Decimal::ZERO {
            (margin / revenue).round_dp(6)
        } else {
            Decimal::ZERO
        };

        Ok(SalesPage {
            items,
            page,
            page_size,
            total_items,
            totals: SalesTotals {
                count,
                total_amount,
                avg_discount_pct,
                avg_margin_pct,
            },
        })
    })
    .await
}

/// Empuja el WHERE de los agregados (SIEMPRE `status = COMPLETED`, ignora el
/// filtro de estado del listado) con el prefijo de tabla dado (`""` para `Sale`,
/// `"sa."` para el JOIN del margen). Mismo filtro estructural que el listado.
fn push_completed_where(
    qb: &mut QueryBuilder<Postgres>,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    f: &SalesFilter,
    prefix: &str,
) {
    qb.push(format!(r#" WHERE {prefix}"organizationId" = "#))
        .push_bind(org);
    qb.push(format!(
        r#" AND {prefix}status = 'COMPLETED'::"SaleStatus""#
    ));
    if let Some(s) = f.store_id {
        qb.push(format!(r#" AND {prefix}"storeId" = "#))
            .push_bind(s);
    }
    if let Some(u) = f.user_id {
        qb.push(format!(r#" AND {prefix}"userId" = "#)).push_bind(u);
    }
    if let Some(from) = f.from {
        qb.push(format!(r#" AND {prefix}"createdAt" >= "#))
            .push_bind(from);
    }
    if let Some(to) = f.to {
        qb.push(format!(r#" AND {prefix}"createdAt" < "#))
            .push_bind(to);
    }
    // Cualificador de la fila externa para subconsultas correlacionadas: `"Sale"`
    // cuando no hay prefijo, o el alias `sa` del JOIN del margen.
    let outer = if prefix.is_empty() {
        r#""Sale""#
    } else {
        prefix.trim_end_matches('.')
    };
    push_sales_search(qb, f, prefix, outer);
    if !is_org_wide {
        qb.push(format!(
            r#" AND {prefix}"storeId" IN (SELECT "storeId" FROM "UserStore" WHERE "userId" = "#
        ))
        .push_bind(requester)
        .push(")");
    }
}

/// `POST /sales/:id/void` — anula una venta (ADMIN/MANAGER) y repone el stock al
/// lote original. Lock pesimista + transición condicional (status=COMPLETED) para
/// que dos anulaciones concurrentes no tengan ambas éxito. Rechaza si ya está
/// anulada (`BadRequest`) o si tiene devoluciones (`BadRequest`).
pub async fn void(
    pool: &PgPool,
    org: Uuid,
    sale_id: Uuid,
    user_id: Uuid,
) -> Result<Sale, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Lock pesimista sobre la fila (S-10): serializa con devoluciones concurrentes.
        sqlx::query(r#"SELECT id FROM "Sale" WHERE id = $1 FOR UPDATE"#)
            .bind(sale_id)
            .execute(&mut **tx)
            .await?;

        let Some(sale) = load_sale_by_id(tx, sale_id).await? else {
            return Ok(Err(AppError::NotFound));
        };
        if sale.status == SaleStatus::Voided {
            return Ok(Err(AppError::BadRequest)); // ya anulada
        }
        let returns: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Return" WHERE "saleId" = $1"#)
            .bind(sale_id)
            .fetch_one(&mut **tx)
            .await?;
        if returns > 0 {
            return Ok(Err(AppError::BadRequest)); // no se anula una venta con devoluciones
        }

        // Transición atómica condicionada al estado COMPLETED.
        let updated = sqlx::query(
            r#"UPDATE "Sale" SET status = 'VOIDED'::"SaleStatus", "voidedAt" = now(), "voidedBy" = $2
               WHERE id = $1 AND status = 'COMPLETED'::"SaleStatus""#,
        )
        .bind(sale_id)
        .bind(user_id)
        .execute(&mut **tx)
        .await?
        .rows_affected();
        if updated == 0 {
            return Ok(Err(AppError::BadRequest)); // anulada entre la lectura y el update
        }

        // Repone el stock de cada línea al lote original (sin devoluciones previas →
        // revierte el 100% del consumo). referenceId = saleId.
        let lines = load_lines(tx, sale_id).await?;
        for l in &lines {
            apply_batched_return(
                tx,
                org,
                l.product_id,
                sale.store_id,
                Some(sale_id),
                l.qty,
                Some(sale_id),
                Some(user_id),
            )
            .await?;
        }

        let voided = load_sale_by_id(tx, sale_id)
            .await?
            .expect("la venta existe; se acaba de anular en esta tx");
        Ok(Ok(voided))
    })
    .await?
}

async fn load_sale_by_id(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<Option<Sale>, sqlx::Error> {
    let sql = format!(r#"SELECT {SALE_COLS} FROM "Sale" WHERE id = $1 LIMIT 1"#);
    sqlx::query_as(&sql)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
}

async fn load_sale_by_client(
    tx: &mut Transaction<'_, Postgres>,
    client_id: Uuid,
) -> Result<Option<Sale>, sqlx::Error> {
    let sql = format!(r#"SELECT {SALE_COLS} FROM "Sale" WHERE "clientId" = $1 LIMIT 1"#);
    sqlx::query_as(&sql)
        .bind(client_id)
        .fetch_optional(&mut **tx)
        .await
}

async fn load_sale_by_ticket(
    tx: &mut Transaction<'_, Postgres>,
    ticket_number: &str,
) -> Result<Option<Sale>, sqlx::Error> {
    let sql = format!(r#"SELECT {SALE_COLS} FROM "Sale" WHERE "ticketNumber" = $1 LIMIT 1"#);
    sqlx::query_as(&sql)
        .bind(ticket_number)
        .fetch_optional(&mut **tx)
        .await
}

async fn load_lines(
    tx: &mut Transaction<'_, Postgres>,
    sale_id: Uuid,
) -> Result<Vec<SaleLine>, sqlx::Error> {
    let sql = format!("SELECT {LINE_COLS} FROM \"SaleLine\" WHERE \"saleId\" = $1 ORDER BY id");
    sqlx::query_as(&sql)
        .bind(sale_id)
        .fetch_all(&mut **tx)
        .await
}
