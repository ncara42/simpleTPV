//! Servicio del dashboard de KPIs (#154) — port de `dashboard.service.ts`.
//! Solo lectura, central (ADMIN/MANAGER en HTTP). Todo el cálculo se hace en
//! `f64` (paridad con el `Number` de NestJS); los importes vienen de la BD como
//! `Decimal` y se convierten en la frontera. RLS por tenant + filtro
//! `organizationId` explícito. El filtro opcional de tienda usa el patrón
//! `($n::uuid IS NULL OR col = $n)`.

use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::model::{PeriodTotals, SalesKpiSeries, SalesKpis, SalesToday, StoreSales};
use super::period::{comparison_starts, delta_pct, CompareMode, DateRange};

/// `Decimal` → `f64` en la frontera (equivalente a `num()` de NestJS).
fn f(d: Decimal) -> f64 {
    d.to_f64().unwrap_or(0.0)
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

fn now_utc() -> PrimitiveDateTime {
    let n = OffsetDateTime::now_utc();
    PrimitiveDateTime::new(n.date(), n.time())
}

/// Comparativa de ventas por tienda + total org (STAT-01): periodo en curso vs
/// anterior "a la misma altura". `compare` = day|month|year.
pub async fn sales_today(
    pool: &PgPool,
    org: Uuid,
    store_id: Option<Uuid>,
    compare: CompareMode,
) -> Result<SalesToday, AppError> {
    let now = now_utc();
    let cs = comparison_starts(compare, now);
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Totales por tienda y bucket (today=periodo en curso, yesterday=anterior).
        let rows: Vec<(Uuid, String, String, Decimal)> = sqlx::query_as(
            r#"SELECT s.id AS store_id, s.name AS store_name,
                 CASE WHEN sa."createdAt" >= $2 THEN 'today' ELSE 'yesterday' END AS bucket,
                 COALESCE(SUM(sa.total), 0) AS total
               FROM "Store" s
               LEFT JOIN "Sale" sa
                 ON sa."storeId" = s.id AND sa."organizationId" = $1
                AND sa.status = 'COMPLETED'::"SaleStatus"
                AND sa."createdAt" >= $3 AND sa."createdAt" < $4
                AND (sa."createdAt" >= $2 OR sa."createdAt" < $5)
               WHERE s."organizationId" = $1 AND s.active = true
                 AND ($6::uuid IS NULL OR s.id = $6)
               GROUP BY s.id, s.name, bucket"#,
        )
        .bind(org)
        .bind(cs.current_start)
        .bind(cs.previous_start)
        .bind(now)
        .bind(cs.previous_same_elapsed)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;

        // Agrega por tienda (today/yesterday); preserva orden de aparición.
        let mut order: Vec<Uuid> = Vec::new();
        let mut by_store: std::collections::HashMap<Uuid, (String, f64, f64)> =
            std::collections::HashMap::new();
        for (sid, sname, bucket, total) in rows {
            let entry = by_store.entry(sid).or_insert_with(|| {
                order.push(sid);
                (sname, 0.0, 0.0)
            });
            if bucket == "today" {
                entry.1 += f(total);
            } else {
                entry.2 += f(total);
            }
        }
        let by_store: Vec<StoreSales> = order
            .into_iter()
            .map(|sid| {
                let (name, today, yesterday) = by_store.remove(&sid).expect("presente");
                StoreSales {
                    store_id: sid,
                    store_name: name,
                    today,
                    yesterday,
                    delta_pct: delta_pct(today, yesterday),
                }
            })
            .collect();

        let today_total: f64 = by_store.iter().map(|s| s.today).sum();
        let yesterday_total: f64 = by_store.iter().map(|s| s.yesterday).sum();

        // Conteos org por bucket (separados para no duplicar por el LEFT JOIN).
        let counts: Vec<(String, i64)> = sqlx::query_as(
            r#"SELECT CASE WHEN "createdAt" >= $2 THEN 'today' ELSE 'yesterday' END AS bucket,
                 COUNT(*) AS count
               FROM "Sale"
               WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
                 AND "createdAt" >= $3 AND "createdAt" < $4
                 AND ("createdAt" >= $2 OR "createdAt" < $5)
                 AND ($6::uuid IS NULL OR "storeId" = $6)
               GROUP BY bucket"#,
        )
        .bind(org)
        .bind(cs.current_start)
        .bind(cs.previous_start)
        .bind(now)
        .bind(cs.previous_same_elapsed)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let today_count = counts.iter().find(|(b, _)| b == "today").map(|(_, c)| *c).unwrap_or(0);
        let yesterday_count =
            counts.iter().find(|(b, _)| b == "yesterday").map(|(_, c)| *c).unwrap_or(0);

        // Acumulado intradía de HOY por hora con ventas (solo compare=day).
        let mut intraday: Vec<f64> = Vec::new();
        if compare == CompareMode::Day {
            let hourly: Vec<(i32, Decimal)> = sqlx::query_as(
                r#"SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COALESCE(SUM(total), 0) AS total
                   FROM "Sale"
                   WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
                     AND "createdAt" >= $2 AND "createdAt" < $3
                     AND ($4::uuid IS NULL OR "storeId" = $4)
                   GROUP BY hour ORDER BY hour"#,
            )
            .bind(org)
            .bind(cs.current_start)
            .bind(now)
            .bind(store_id)
            .fetch_all(&mut **tx)
            .await?;
            let mut acc = 0.0;
            for (_, total) in hourly {
                acc += f(total);
                intraday.push(round2(acc));
            }
        }

        Ok(SalesToday {
            today: PeriodTotals {
                total: today_total,
                count: today_count,
            },
            yesterday: PeriodTotals {
                total: yesterday_total,
                count: yesterday_count,
            },
            delta_pct: delta_pct(today_total, yesterday_total),
            by_store,
            intraday,
        })
    })
    .await
}

/// Granularidad de las series intra-periodo: hora si ≤ ~36h, día si más.
fn bucket_unit(range: DateRange) -> &'static str {
    let span = range.to - range.from;
    if span <= time::Duration::hours(36) {
        "hour"
    } else {
        "day"
    }
}

/// KPIs de venta del periodo + series intra-periodo (sparklines).
pub async fn sales_kpis(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<SalesKpis, AppError> {
    let unit = bucket_unit(range);
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Agregado del periodo (ventas, ingresos, neto, descuento, unidades).
        let agg: (i64, Decimal, Decimal, Decimal, Decimal) = sqlx::query_as(
            r#"SELECT COUNT(sa.id) AS sales_count,
                 COALESCE(SUM(sa.total), 0) AS revenue,
                 COALESCE(SUM(sa.subtotal), 0) AS subtotal,
                 COALESCE(SUM(sa."discountTotal"), 0) AS discount,
                 COALESCE((
                   SELECT SUM(sl.qty) FROM "SaleLine" sl
                   JOIN "Sale" s2 ON s2.id = sl."saleId"
                   WHERE s2."organizationId" = $1 AND s2.status = 'COMPLETED'::"SaleStatus"
                     AND s2."createdAt" >= $2 AND s2."createdAt" < $3
                     AND ($4::uuid IS NULL OR s2."storeId" = $4)
                 ), 0) AS units
               FROM "Sale" sa
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_one(&mut **tx)
        .await?;

        let returns_total: Decimal = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(total), 0) FROM "Return"
               WHERE "organizationId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
                 AND ($4::uuid IS NULL OR "storeId" = $4)"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_one(&mut **tx)
        .await?;

        let (sales_count, revenue_d, subtotal_d, discount_d, units_d) = agg;
        let revenue = f(revenue_d);
        let subtotal = f(subtotal_d);
        let discount = f(discount_d);
        let units = f(units_d);
        let returns = f(returns_total);
        let n = sales_count as f64;

        // Series intra-periodo: ventas/unidades/devoluciones por bucket temporal.
        let sales_rows: Vec<(PrimitiveDateTime, i64, Decimal, Decimal, Decimal)> = sqlx::query_as(
            &format!(
                r#"SELECT date_trunc('{unit}', sa."createdAt") AS bucket, COUNT(*) AS count,
                     COALESCE(SUM(sa.total), 0) AS revenue, COALESCE(SUM(sa.subtotal), 0) AS subtotal,
                     COALESCE(SUM(sa."discountTotal"), 0) AS discount
                   FROM "Sale" sa
                   WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                     AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                     AND ($4::uuid IS NULL OR sa."storeId" = $4)
                   GROUP BY bucket ORDER BY bucket"#
            ),
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let units_rows: Vec<(PrimitiveDateTime, Decimal)> = sqlx::query_as(&format!(
            r#"SELECT date_trunc('{unit}', sa."createdAt") AS bucket, COALESCE(SUM(sl.qty), 0) AS units
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY bucket"#
        ))
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let returns_rows: Vec<(PrimitiveDateTime, Decimal)> = sqlx::query_as(&format!(
            r#"SELECT date_trunc('{unit}', "createdAt") AS bucket, COALESCE(SUM(total), 0) AS returns
               FROM "Return"
               WHERE "organizationId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
                 AND ($4::uuid IS NULL OR "storeId" = $4)
               GROUP BY bucket"#
        ))
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;

        let units_by: std::collections::HashMap<PrimitiveDateTime, f64> =
            units_rows.into_iter().map(|(b, u)| (b, f(u))).collect();
        let returns_by: std::collections::HashMap<PrimitiveDateTime, f64> =
            returns_rows.into_iter().map(|(b, r)| (b, f(r))).collect();

        let mut s_avg = Vec::new();
        let mut s_upt = Vec::new();
        let mut s_disc = Vec::new();
        let mut s_ret = Vec::new();
        for (bucket, count, rev, sub, disc) in sales_rows {
            let c = count as f64;
            let rev = f(rev);
            let sub = f(sub);
            let disc = f(disc);
            let u = units_by.get(&bucket).copied().unwrap_or(0.0);
            let ret = returns_by.get(&bucket).copied().unwrap_or(0.0);
            s_avg.push(if c > 0.0 { round2(rev / c) } else { 0.0 });
            s_upt.push(if c > 0.0 { round2(u / c) } else { 0.0 });
            s_disc.push(if sub + disc > 0.0 {
                round3(disc / (sub + disc))
            } else {
                0.0
            });
            s_ret.push(if rev > 0.0 { round3(ret / rev) } else { 0.0 });
        }

        Ok(SalesKpis {
            sales_count,
            revenue,
            avg_ticket: if n > 0.0 { revenue / n } else { 0.0 },
            upt: if n > 0.0 { units / n } else { 0.0 },
            discount_rate: if subtotal + discount > 0.0 {
                discount / (subtotal + discount)
            } else {
                0.0
            },
            return_rate: if revenue > 0.0 { returns / revenue } else { 0.0 },
            series: SalesKpiSeries {
                avg_ticket: s_avg,
                upt: s_upt,
                discount_rate: s_disc,
                return_rate: s_ret,
            },
        })
    })
    .await
}
