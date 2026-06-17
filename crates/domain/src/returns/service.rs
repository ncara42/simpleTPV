//! Servicio de devoluciones — port (con ticket) de `returns.service.ts`. Todo bajo
//! `with_tenant_tx` (RLS). Repone stock al lote original vía
//! `stock::apply_batched_return`. La devolución ciega (con PIN) y el registro
//! VeriFactu llegan en slices posteriores.

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::stock::service::apply_batched_return;
use crate::store_access::has_store_access;

use super::domain::{compute_return_line_total, compute_returnable};
use super::input::CreateReturn;
use super::model::{Return, ReturnLine, ReturnWithLines};

const RETURN_COLS: &str = r#"id, "organizationId" AS organization_id, "storeId" AS store_id,
    "userId" AS user_id, "saleId" AS sale_id, "authorizedBy" AS authorized_by, reason, total,
    "createdAt" AS created_at"#;

const RETURN_LINE_COLS: &str = r#"id, "organizationId" AS organization_id, "returnId" AS return_id,
    "saleLineId" AS sale_line_id, "productId" AS product_id, qty, "lineTotal" AS line_total"#;

#[derive(sqlx::FromRow)]
struct SaleLineRow {
    id: Uuid,
    qty: Decimal,
    line_total: Decimal,
    product_id: Uuid,
}

/// `POST /returns` — devolución parcial/total contra un ticket de venta.
pub async fn create(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: CreateReturn,
) -> Result<ReturnWithLines, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Lock pesimista sobre la venta (serializa devoluciones concurrentes).
        sqlx::query(r#"SELECT id FROM "Sale" WHERE id = $1 FOR UPDATE"#)
            .bind(input.sale_id)
            .execute(&mut **tx)
            .await?;

        // Venta + estado + tienda (para el acceso por tienda y el storeId del Return).
        let sale: Option<(Uuid, String)> = sqlx::query_as(
            r#"SELECT "storeId", status::text FROM "Sale" WHERE id = $1"#,
        )
        .bind(input.sale_id)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((store_id, status)) = sale else {
            return Ok(Err(AppError::NotFound));
        };
        if status == "VOIDED" {
            return Ok(Err(AppError::BadRequest)); // no se devuelve una venta anulada
        }
        // Acceso por tienda (SEC-01): el CLERK solo devuelve de sus tiendas.
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }

        // Líneas de la venta (por id) y lo ya devuelto por línea.
        let sale_lines: Vec<SaleLineRow> = sqlx::query_as(
            r#"SELECT id, qty, "lineTotal" AS line_total, "productId" AS product_id
               FROM "SaleLine" WHERE "saleId" = $1"#,
        )
        .bind(input.sale_id)
        .fetch_all(&mut **tx)
        .await?;
        let line_by_id: std::collections::HashMap<Uuid, &SaleLineRow> =
            sale_lines.iter().map(|l| (l.id, l)).collect();

        let sale_line_ids: Vec<Uuid> = sale_lines.iter().map(|l| l.id).collect();
        let returned: Vec<(Uuid, Decimal)> = sqlx::query_as(
            r#"SELECT "saleLineId", COALESCE(SUM(qty), 0) FROM "ReturnLine"
               WHERE "saleLineId" = ANY($1) GROUP BY "saleLineId""#,
        )
        .bind(&sale_line_ids)
        .fetch_all(&mut **tx)
        .await?;
        let returned_by_line: std::collections::HashMap<Uuid, Decimal> =
            returned.into_iter().collect();

        // Valida cada línea y calcula su importe proporcional.
        struct Resolved {
            sale_line_id: Uuid,
            product_id: Uuid,
            qty: Decimal,
            line_total: Decimal,
        }
        let mut resolved = Vec::with_capacity(input.lines.len());
        for l in &input.lines {
            let Some(sale_line) = line_by_id.get(&l.sale_line_id) else {
                return Ok(Err(AppError::BadRequest)); // línea ajena a la venta
            };
            let already = returned_by_line
                .get(&l.sale_line_id)
                .copied()
                .unwrap_or(Decimal::ZERO);
            let available = compute_returnable(sale_line.qty, already);
            if l.qty > available {
                return Ok(Err(AppError::BadRequest)); // más de lo devolvible
            }
            let line_total = compute_return_line_total(sale_line.line_total, sale_line.qty, l.qty);
            resolved.push(Resolved {
                sale_line_id: l.sale_line_id,
                product_id: sale_line.product_id,
                qty: l.qty,
                line_total,
            });
        }
        let total: Decimal = resolved
            .iter()
            .map(|r| r.line_total)
            .sum::<Decimal>()
            .round_dp(2);

        // INSERT del Return (authorizedBy null: devolución con ticket).
        let return_id = Uuid::new_v4();
        let return_row: Return = sqlx::query_as(&format!(
            r#"INSERT INTO "Return" (id, "organizationId", "storeId", "userId", "saleId", reason, total, "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, now())
               RETURNING {RETURN_COLS}"#,
        ))
        .bind(return_id)
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .bind(input.sale_id)
        .bind(&input.reason)
        .bind(total)
        .fetch_one(&mut **tx)
        .await?;

        // INSERT de las líneas + reposición de stock al lote original.
        let mut lines = Vec::with_capacity(resolved.len());
        for r in &resolved {
            let line: ReturnLine = sqlx::query_as(&format!(
                r#"INSERT INTO "ReturnLine" (id, "organizationId", "returnId", "saleLineId", "productId", qty, "lineTotal")
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   RETURNING {RETURN_LINE_COLS}"#,
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(return_id)
            .bind(r.sale_line_id)
            .bind(r.product_id)
            .bind(r.qty)
            .bind(r.line_total)
            .fetch_one(&mut **tx)
            .await?;
            lines.push(line);

            apply_batched_return(
                tx,
                org,
                r.product_id,
                store_id,
                Some(input.sale_id),
                r.qty,
                Some(return_id),
                Some(user_id),
            )
            .await?;
        }

        Ok(Ok(ReturnWithLines { return_: return_row, lines }))
    })
    .await?
}

/// `GET /returns?saleId=` — devoluciones de una venta (más recientes primero).
pub async fn list(
    pool: &PgPool,
    org: Uuid,
    sale_id: Uuid,
) -> Result<Vec<ReturnWithLines>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let returns: Vec<Return> = sqlx::query_as(&format!(
            r#"SELECT {RETURN_COLS} FROM "Return" WHERE "saleId" = $1 ORDER BY "createdAt" DESC"#,
        ))
        .bind(sale_id)
        .fetch_all(&mut **tx)
        .await?;

        let mut out = Vec::with_capacity(returns.len());
        for r in returns {
            let lines = load_return_lines(tx, r.id).await?;
            out.push(ReturnWithLines { return_: r, lines });
        }
        Ok(out)
    })
    .await
}

async fn load_return_lines(
    tx: &mut Transaction<'_, Postgres>,
    return_id: Uuid,
) -> Result<Vec<ReturnLine>, sqlx::Error> {
    let sql =
        format!(r#"SELECT {RETURN_LINE_COLS} FROM "ReturnLine" WHERE "returnId" = $1 ORDER BY id"#);
    sqlx::query_as(&sql)
        .bind(return_id)
        .fetch_all(&mut **tx)
        .await
}
