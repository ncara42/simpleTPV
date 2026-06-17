//! Servicio del cierre Z (#124) — port de `z-report.service.ts`. Carga las
//! ventas del día de una tienda del tenant y delega el cálculo en el dominio
//! puro. RLS por tenant + `organizationId` explícito; `has_store_access` acota a
//! un CLERK a sus tiendas (SEC-01, defensa en profundidad). El día se interpreta
//! en UTC (misma deuda del MVP que el filtro `date` del historial de ventas).

use std::collections::HashMap;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::macros::format_description;
use time::{Date, PrimitiveDateTime, Time};
use uuid::Uuid;

use crate::store_access::has_store_access;

use super::domain::build_z_report;
use super::model::{ZReport, ZReportSale, ZReportSaleLine, ZReportStore};

/// `YYYY-MM-DD` → rango `[medianoche, medianoche del día siguiente)` en UTC.
/// `None` si la fecha es inválida (p. ej. `2026-13-45`).
fn day_range(date: &str) -> Option<(PrimitiveDateTime, PrimitiveDateTime)> {
    let fmt = format_description!("[year]-[month]-[day]");
    let d = Date::parse(date, fmt).ok()?;
    let gte = PrimitiveDateTime::new(d, Time::MIDNIGHT);
    let lt = PrimitiveDateTime::new(d.next_day()?, Time::MIDNIGHT);
    Some((gte, lt))
}

#[derive(sqlx::FromRow)]
struct SaleRow {
    id: Uuid,
    ticket_number: String,
    status: String,
    payment_method: String,
    subtotal: Decimal,
    total: Decimal,
    discount_total: Decimal,
}

#[derive(sqlx::FromRow)]
struct SaleLineRow {
    sale_id: Uuid,
    tax_rate: Decimal,
    line_total: Decimal,
}

pub async fn get_z_report(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    store_id: Uuid,
    date: String,
) -> Result<ZReport, AppError> {
    let Some((gte, lt)) = day_range(&date) else {
        return Err(AppError::BadRequest);
    };
    let result: Result<ZReport, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        // Aislamiento por tienda (SEC-01): un CLERK solo consulta el Z de sus tiendas.
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        let store: Option<(String, String)> = sqlx::query_as(
            r#"SELECT name, code FROM "Store" WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(store_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((name, code)) = store else {
            return Ok(Err(AppError::NotFound));
        };

        let sales: Vec<SaleRow> = sqlx::query_as(
            r#"SELECT id, "ticketNumber" AS ticket_number, status::text AS status,
                 "paymentMethod"::text AS payment_method, subtotal, total,
                 "discountTotal" AS discount_total
               FROM "Sale"
               WHERE "organizationId" = $1 AND "storeId" = $2
                 AND "createdAt" >= $3 AND "createdAt" < $4"#,
        )
        .bind(org)
        .bind(store_id)
        .bind(gte)
        .bind(lt)
        .fetch_all(&mut **tx)
        .await?;

        // Líneas de esas ventas, agrupadas por venta.
        let sale_ids: Vec<Uuid> = sales.iter().map(|s| s.id).collect();
        let mut lines_by_sale: HashMap<Uuid, Vec<ZReportSaleLine>> = HashMap::new();
        if !sale_ids.is_empty() {
            let lines: Vec<SaleLineRow> = sqlx::query_as(
                r#"SELECT "saleId" AS sale_id, "taxRate" AS tax_rate, "lineTotal" AS line_total
                   FROM "SaleLine"
                   WHERE "organizationId" = $1 AND "saleId" = ANY($2)"#,
            )
            .bind(org)
            .bind(sale_ids.as_slice())
            .fetch_all(&mut **tx)
            .await?;
            for l in lines {
                lines_by_sale
                    .entry(l.sale_id)
                    .or_default()
                    .push(ZReportSaleLine {
                        tax_rate: l.tax_rate,
                        line_total: l.line_total,
                    });
            }
        }

        let mapped: Vec<ZReportSale> = sales
            .into_iter()
            .map(|s| {
                let lines = lines_by_sale.remove(&s.id).unwrap_or_default();
                ZReportSale {
                    ticket_number: s.ticket_number,
                    status: s.status,
                    payment_method: s.payment_method,
                    subtotal: s.subtotal,
                    total: s.total,
                    discount_total: s.discount_total,
                    lines,
                }
            })
            .collect();

        let store = ZReportStore {
            id: store_id,
            name,
            code,
        };
        Ok(Ok(build_z_report(store, date.clone(), mapped)))
    })
    .await?;
    result
}
