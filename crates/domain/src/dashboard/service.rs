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

use crate::store_access::has_store_access;

use super::model::{
    ArchetypeRotationItem, CumulativeMonth, DiscountByEmployeeItem, MarginKpis, PeriodTotals,
    ProductRankings, ProductRotationItem, RankByMargin, RankBySales, RankByUnits, RecentSaleItem,
    SalesByDayItem, SalesByEmployeeItem, SalesByFamilyItem, SalesByHourItem, SalesByPaymentItem,
    SalesByStoreItem, SalesGoal, SalesKpiSeries, SalesKpis, SalesToday, StockoutKpis, StoreSales,
};
use super::period::{
    comparison_starts, delta_pct, month_cumulative_bounds, CompareMode, DateRange,
};
use crate::sales::model::PaymentMethod;

const ROTATION_LIMIT: i64 = 8;
const NEW_PRODUCT_DAYS: i64 = 21;

// Filas crudas de queries con muchas columnas (evita el lint type_complexity).
type FamilyRow = (Option<Uuid>, Option<String>, Option<String>, Decimal);
type RotationSummaryRow = (
    Uuid,
    String,
    Option<Uuid>,
    PrimitiveDateTime,
    Decimal,
    Option<PrimitiveDateTime>,
);
type ArchetypeSummaryRow = (
    Option<Uuid>,
    Option<String>,
    i64,
    Decimal,
    Option<PrimitiveDateTime>,
);

/// Días enteros transcurridos entre `then` y `now` (floor, como `Math.floor`).
fn days_since(now: PrimitiveDateTime, then: PrimitiveDateTime) -> i64 {
    (now - then).whole_days()
}

/// Días con tienda abierta en el periodo (IT-14); si no hay sesiones, días naturales.
async fn dias_disponibles(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<i64, sqlx::Error> {
    let days: Vec<time::Date> = sqlx::query_scalar(
        r#"SELECT DISTINCT DATE("openedAt") FROM "CashSession"
           WHERE "organizationId" = $1 AND "openedAt" >= $2 AND "openedAt" < $3
             AND ($4::uuid IS NULL OR "storeId" = $4)"#,
    )
    .bind(org)
    .bind(range.from)
    .bind(range.to)
    .bind(store_id)
    .fetch_all(&mut **tx)
    .await?;
    let session_days = days.len() as i64;
    let period_days = (((range.to - range.from).whole_seconds() as f64) / 86_400.0)
        .round()
        .max(1.0) as i64;
    Ok(if session_days > 0 {
        session_days
    } else {
        period_days
    })
}

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

/// Variante TPV de `sales_today` (#STAT-01 para cajeros): accesible a CLERK pero
/// acotada a SU tienda (SEC-01, cierra el IDOR horizontal). Con `store_id`: un
/// rol no org-wide debe tener acceso a esa tienda. Sin `store_id`: un rol no
/// org-wide no puede ver el agregado de la organización → Forbidden.
pub async fn sales_today_tpv(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    store_id: Option<Uuid>,
    compare: CompareMode,
) -> Result<SalesToday, AppError> {
    match store_id {
        Some(sid) if !is_org_wide => {
            let allowed: bool = with_tenant_tx(pool, org, async move |tx, _after| {
                has_store_access(tx, user_id, sid).await
            })
            .await?;
            if !allowed {
                return Err(AppError::Forbidden);
            }
        }
        None if !is_org_wide => return Err(AppError::Forbidden),
        _ => {}
    }
    sales_today(pool, org, store_id, compare).await
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

/// Ventas netas por familia de producto (sin familia → "Sin familia").
pub async fn sales_by_family(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<SalesByFamilyItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<FamilyRow> = sqlx::query_as(
            r#"SELECT pf.id AS family_id, pf.name AS family_name, pf.color AS color,
                 COALESCE(SUM(sl."lineTotal"), 0) AS total
               FROM "SaleLine" sl
               JOIN "Sale" sa ON sa.id = sl."saleId"
               JOIN "Product" p ON p.id = sl."productId"
               LEFT JOIN "ProductFamily" pf ON pf.id = p."familyId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY pf.id, pf.name, pf.color
               ORDER BY total DESC"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(family_id, family_name, color, total)| SalesByFamilyItem {
                family_id,
                family_name: family_name.unwrap_or_else(|| "Sin familia".to_owned()),
                color,
                total: f(total),
            })
            .collect())
    })
    .await
}

/// Ventas por hora del día (nº de tickets e importe), solo horas con ventas.
pub async fn sales_by_hour(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<SalesByHourItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(i32, i64, Decimal)> = sqlx::query_as(
            r#"SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*) AS count,
                 COALESCE(SUM(total), 0) AS revenue
               FROM "Sale"
               WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
                 AND "createdAt" >= $2 AND "createdAt" < $3
                 AND ($4::uuid IS NULL OR "storeId" = $4)
               GROUP BY hour ORDER BY hour"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(hour, count, revenue)| SalesByHourItem {
                hour,
                count,
                revenue: f(revenue),
            })
            .collect())
    })
    .await
}

/// Ventas por día natural (nº de tickets e importe), solo días con ventas. Base del
/// acumulado diario del informe de ventas: el cliente alinea por día-del-mes y
/// acumula para comparar el periodo en curso contra el anterior.
pub async fn sales_by_day(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<SalesByDayItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(String, i64, Decimal)> = sqlx::query_as(
            r#"SELECT DATE("createdAt")::text AS day, COUNT(*) AS count,
                 COALESCE(SUM(total), 0) AS revenue
               FROM "Sale"
               WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
                 AND "createdAt" >= $2 AND "createdAt" < $3
                 AND ($4::uuid IS NULL OR "storeId" = $4)
               GROUP BY day ORDER BY day"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(day, count, revenue)| SalesByDayItem {
                day,
                count,
                revenue: f(revenue),
            })
            .collect())
    })
    .await
}

// ── sección 04 «Más exploraciones»: pago / tickets / objetivo / acumulado ────
// Suma de facturación COMPLETED en un rango (helper de `sales_goal`), sobre la tx del tenant.
async fn sum_revenue(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<f64, sqlx::Error> {
    let total: Decimal = sqlx::query_scalar(
        r#"SELECT COALESCE(SUM(total), 0) FROM "Sale"
           WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
             AND "createdAt" >= $2 AND "createdAt" < $3
             AND ($4::uuid IS NULL OR "storeId" = $4)"#,
    )
    .bind(org)
    .bind(range.from)
    .bind(range.to)
    .bind(store_id)
    .fetch_one(&mut **tx)
    .await?;
    Ok(f(total))
}

// Facturación COMPLETED por día-del-mes (1..31) en un rango (helper de `cumulative_month`).
async fn daily_by_dom(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<(i32, f64)>, sqlx::Error> {
    let rows: Vec<(i32, Decimal)> = sqlx::query_as(
        r#"SELECT EXTRACT(DAY FROM "createdAt")::int AS dom, COALESCE(SUM(total), 0) AS revenue
           FROM "Sale"
           WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
             AND "createdAt" >= $2 AND "createdAt" < $3
             AND ($4::uuid IS NULL OR "storeId" = $4)
           GROUP BY dom ORDER BY dom"#,
    )
    .bind(org)
    .bind(range.from)
    .bind(range.to)
    .bind(store_id)
    .fetch_all(&mut **tx)
    .await?;
    Ok(rows.into_iter().map(|(dom, rev)| (dom, f(rev))).collect())
}

/// Reparto de facturación por método de pago en el periodo (mayor a menor). Cada fila: método,
/// nº de tickets e importe. Base del donut «Métodos de pago» (#264, sección 04).
pub async fn sales_by_payment(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<SalesByPaymentItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(PaymentMethod, i64, Decimal)> = sqlx::query_as(
            r#"SELECT "paymentMethod"::text AS method, COUNT(*) AS count,
                 COALESCE(SUM(total), 0) AS revenue
               FROM "Sale"
               WHERE "organizationId" = $1 AND status = 'COMPLETED'::"SaleStatus"
                 AND "createdAt" >= $2 AND "createdAt" < $3
                 AND ($4::uuid IS NULL OR "storeId" = $4)
               GROUP BY "paymentMethod" ORDER BY revenue DESC"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(method, count, revenue)| SalesByPaymentItem {
                method,
                count,
                revenue: f(revenue),
            })
            .collect())
    })
    .await
}

/// Últimas ventas COMPLETED (feed de actividad, sección 04). `limit` se acota a [1, 50].
pub async fn recent_sales(
    pool: &PgPool,
    org: Uuid,
    limit: i64,
    store_id: Option<Uuid>,
) -> Result<Vec<RecentSaleItem>, AppError> {
    let lim = limit.clamp(1, 50);
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(
            Uuid,
            String,
            String,
            Decimal,
            PaymentMethod,
            PrimitiveDateTime,
        )> = sqlx::query_as(
            r#"SELECT sa.id, sa."ticketNumber", s.name AS store_name, sa.total,
                     sa."paymentMethod"::text AS payment_method, sa."createdAt"
                   FROM "Sale" sa
                   JOIN "Store" s ON s.id = sa."storeId"
                   WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                     AND ($2::uuid IS NULL OR sa."storeId" = $2)
                   ORDER BY sa."createdAt" DESC
                   LIMIT $3"#,
        )
        .bind(org)
        .bind(store_id)
        .bind(lim)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(
                |(id, ticket_number, store_name, total, payment_method, created_at)| {
                    RecentSaleItem {
                        id,
                        ticket_number,
                        store_name,
                        total: f(total),
                        payment_method,
                        created_at,
                    }
                },
            )
            .collect())
    })
    .await
}

/// Objetivo del periodo (sección 04): facturación en curso (`current`), objetivo = periodo
/// anterior COMPLETO (`target`) y proyección a fin de periodo extrapolando por el tiempo
/// transcurrido (`projection`). `current`, `prev_full`, `full_end` y `now` los resuelve el
/// handler con las primitivas de `period` (`previous_full_period` / `period_full_end`).
pub async fn sales_goal(
    pool: &PgPool,
    org: Uuid,
    current: DateRange,
    prev_full: DateRange,
    full_end: PrimitiveDateTime,
    now: PrimitiveDateTime,
    store_id: Option<Uuid>,
) -> Result<SalesGoal, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let current_rev = sum_revenue(tx, org, current, store_id).await?;
        let target = sum_revenue(tx, org, prev_full, store_id).await?;
        // Fracción de periodo transcurrida, acotada a (0, 1]: la proyección extrapola lo
        // facturado y nunca cae por debajo de lo ya hecho.
        let elapsed = (now - current.from).as_seconds_f64();
        let full = (full_end - current.from).as_seconds_f64();
        let frac = if full > 0.0 {
            (elapsed / full).clamp(1e-6, 1.0)
        } else {
            1.0
        };
        Ok(SalesGoal {
            current: round2(current_rev),
            target: round2(target),
            projection: round2((current_rev / frac).max(current_rev)),
        })
    })
    .await
}

/// Acumulado diario del mes en curso (parcial) vs. el mes anterior completo, con proyección a
/// fin de mes (sección 04). Las series son acumulados crecientes en euros; la proyección sigue
/// la FORMA del mes anterior (acumulado anterior a la misma altura), con run-rate lineal de
/// reserva si el mes anterior no tiene datos a esa altura. `now` lo pasa el handler (testeable).
pub async fn cumulative_month(
    pool: &PgPool,
    org: Uuid,
    now: PrimitiveDateTime,
    store_id: Option<Uuid>,
) -> Result<CumulativeMonth, AppError> {
    let b = month_cumulative_bounds(now);
    with_tenant_tx(pool, org, async move |tx, _after| {
        let cur_daily = daily_by_dom(
            tx,
            org,
            DateRange {
                from: b.cur_start,
                to: b.cur_to_date_end,
            },
            store_id,
        )
        .await?;
        let prev_daily = daily_by_dom(
            tx,
            org,
            DateRange {
                from: b.prev_start,
                to: b.prev_end,
            },
            store_id,
        )
        .await?;

        // Densifica por día-del-mes (días sin ventas = 0) y acumula.
        let cumulate = |daily: &[(i32, f64)], days: i64| -> Vec<f64> {
            let mut by_dom = vec![0.0_f64; (days.max(0) as usize) + 1];
            for &(dom, rev) in daily {
                if dom >= 1 && (dom as i64) <= days {
                    by_dom[dom as usize] += rev;
                }
            }
            let mut acc = 0.0;
            let mut out = Vec::with_capacity(days.max(0) as usize);
            for slot in by_dom.iter().skip(1) {
                acc += *slot;
                out.push(round2(acc));
            }
            out
        };

        let actual = cumulate(&cur_daily, b.elapsed_days);
        let prev_days = (b.prev_end - b.prev_start).whole_days();
        let compare = cumulate(&prev_daily, prev_days);

        let actual_last = actual.last().copied().unwrap_or(0.0);
        let prev_at_elapsed = compare
            .get((b.elapsed_days as usize).saturating_sub(1))
            .copied()
            .unwrap_or(0.0);
        let prev_full = compare.last().copied().unwrap_or(0.0);
        let projection_end = if prev_at_elapsed > 0.0 {
            actual_last * (prev_full / prev_at_elapsed)
        } else if b.elapsed_days > 0 {
            actual_last / b.elapsed_days as f64 * b.days_in_month as f64
        } else {
            actual_last
        };

        Ok(CumulativeMonth {
            actual,
            compare,
            projection_end: round2(projection_end.max(actual_last)),
            total_points: b.days_in_month,
        })
    })
    .await
}

/// Descuento VOLUNTARIO medio por vendedor / precio de tarifa (excluye promociones).
pub async fn discount_by_employee(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<DiscountByEmployeeItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(Uuid, String, i64, Decimal, Decimal, Decimal)> = sqlx::query_as(
            r#"SELECT u.id AS user_id, u.name AS user_name, COUNT(sa.id) AS count,
                 COALESCE(SUM(sa."discountTotal"), 0) AS discount,
                 COALESCE(SUM((
                   SELECT COALESCE(SUM(sl."discountAmt"), 0) FROM "SaleLine" sl
                   WHERE sl."saleId" = sa.id AND sl."discountSource" = 'PROMOTION'::"DiscountSource"
                 )), 0) AS promo,
                 COALESCE(SUM(sa.subtotal), 0) AS subtotal
               FROM "Sale" sa
               JOIN "User" u ON u.id = sa."userId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY u.id, u.name"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let mut out: Vec<DiscountByEmployeeItem> = rows
            .into_iter()
            .map(|(user_id, user_name, count, discount, promo, subtotal)| {
                let total_discount = f(discount);
                let voluntary = total_discount - f(promo);
                let tarifa = f(subtotal) + total_discount;
                DiscountByEmployeeItem {
                    user_id,
                    user_name,
                    sales_count: count,
                    avg_discount_pct: if tarifa > 0.0 {
                        voluntary / tarifa
                    } else {
                        0.0
                    },
                }
            })
            .collect();
        out.sort_by(|a, b| {
            b.avg_discount_pct
                .partial_cmp(&a.avg_discount_pct)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(out)
    })
    .await
}

/// Ventas por vendedor (facturación + nº de tickets), de mayor a menor.
pub async fn sales_by_employee(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<SalesByEmployeeItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(Uuid, String, i64, Decimal)> = sqlx::query_as(
            r#"SELECT u.id AS user_id, u.name AS user_name, COUNT(sa.id) AS count,
                 COALESCE(SUM(sa.total), 0) AS total
               FROM "Sale" sa
               JOIN "User" u ON u.id = sa."userId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY u.id, u.name ORDER BY SUM(sa.total) DESC"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(user_id, user_name, count, total)| SalesByEmployeeItem {
                user_id,
                user_name,
                sales_count: count,
                total: f(total),
            })
            .collect())
    })
    .await
}

/// Desglose por tienda (#224): facturación, nº de tickets, ticket medio y margen real
/// por tienda, de mayor a menor facturación. Incluye tiendas SIN ventas (LEFT JOIN desde
/// `Store`) para que el rezagado aparezca. El margen se agrega aparte (JOIN con `SaleLine`)
/// para no inflar la facturación por el fan-out de líneas, igual que en `sales_kpis`.
pub async fn sales_by_store(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<SalesByStoreItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        // A) Facturación + nº de tickets por tienda (sin SaleLine → sin fan-out).
        let sales_rows: Vec<(Uuid, String, i64, Decimal)> = sqlx::query_as(
            r#"SELECT s.id AS store_id, s.name AS store_name,
                 COUNT(sa.id) AS sales_count,
                 COALESCE(SUM(sa.total), 0) AS revenue
               FROM "Store" s
               LEFT JOIN "Sale" sa ON sa."storeId" = s.id AND sa."organizationId" = $1
                 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
               WHERE s."organizationId" = $1 AND s.active = true
                 AND ($4::uuid IS NULL OR s.id = $4)
               GROUP BY s.id, s.name
               ORDER BY revenue DESC, s.name ASC"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;

        // B) Margen real por tienda (ΣlineTotal − costPrice·qty) y base de margen (ΣlineTotal).
        let margin_rows: Vec<(Uuid, Decimal, Decimal)> = sqlx::query_as(
            r#"SELECT sa."storeId" AS store_id,
                 COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS margin,
                 COALESCE(SUM(sl."lineTotal"), 0) AS margin_base
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY sa."storeId""#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let margin_by: std::collections::HashMap<Uuid, (f64, f64)> = margin_rows
            .into_iter()
            .map(|(sid, margin, base)| (sid, (f(margin), f(base))))
            .collect();

        Ok(sales_rows
            .into_iter()
            .map(|(store_id, store_name, sales_count, revenue)| {
                let revenue = f(revenue);
                let (margin, margin_base) = margin_by.get(&store_id).copied().unwrap_or((0.0, 0.0));
                SalesByStoreItem {
                    store_id,
                    store_name,
                    revenue,
                    sales_count,
                    avg_ticket: if sales_count > 0 {
                        revenue / sales_count as f64
                    } else {
                        0.0
                    },
                    margin,
                    margin_pct: if margin_base > 0.0 {
                        margin / margin_base
                    } else {
                        0.0
                    },
                }
            })
            .collect())
    })
    .await
}

/// KPIs de margen (bruto, real, % margen) + series intra-periodo (% y € por bucket).
pub async fn margin_kpis(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<MarginKpis, AppError> {
    let unit = bucket_unit(range);
    with_tenant_tx(pool, org, async move |tx, _after| {
        let (gross_d, real_d, revenue_d): (Decimal, Decimal, Decimal) = sqlx::query_as(
            r#"SELECT COALESCE(SUM((sl."unitPrice" - sl."costPrice") * sl.qty), 0) AS gross,
                 COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS real,
                 COALESCE(SUM(sl."lineTotal"), 0) AS revenue
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
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
        let revenue = f(revenue_d);

        let rows: Vec<(PrimitiveDateTime, Decimal, Decimal)> = sqlx::query_as(&format!(
            r#"SELECT date_trunc('{unit}', sa."createdAt") AS bucket,
                 COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS real,
                 COALESCE(SUM(sl."lineTotal"), 0) AS revenue
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY bucket ORDER BY bucket"#
        ))
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let mut series = Vec::new();
        let mut real_margin_series = Vec::new();
        for (_, real, rev) in rows {
            let real = f(real);
            let rev = f(rev);
            real_margin_series.push(round2(real));
            series.push(if rev > 0.0 { round3(real / rev) } else { 0.0 });
        }

        Ok(MarginKpis {
            gross_margin: f(gross_d),
            real_margin: f(real_d),
            margin_pct: if revenue > 0.0 {
                f(real_d) / revenue
            } else {
                0.0
            },
            revenue,
            series,
            real_margin_series,
        })
    })
    .await
}

/// KPIs de rotura de stock sobre StockAlert OUT_OF_STOCK del periodo.
pub async fn stockout_kpis(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<StockoutKpis, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let (events, resolved, open, avg_seconds): (i64, i64, i64, Option<Decimal>) =
            sqlx::query_as(
                r#"SELECT COUNT(*) AS events,
                     COUNT(*) FILTER (WHERE resolved = true) AS resolved,
                     COUNT(*) FILTER (WHERE resolved = false) AS open,
                     AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
                       FILTER (WHERE resolved = true) AS avg_seconds
                   FROM "StockAlert"
                   WHERE "organizationId" = $1 AND "alertType" = 'OUT_OF_STOCK'::"AlertType"
                     AND "createdAt" >= $2 AND "createdAt" < $3
                     AND ($4::uuid IS NULL OR "storeId" = $4)"#,
            )
            .bind(org)
            .bind(range.from)
            .bind(range.to)
            .bind(store_id)
            .fetch_one(&mut **tx)
            .await?;
        let active_products: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "Product" WHERE "organizationId" = $1 AND active = true"#,
        )
        .bind(org)
        .fetch_one(&mut **tx)
        .await?;
        let lost: Decimal = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(p."salePrice"), 0)
               FROM "StockAlert" al JOIN "Product" p ON p.id = al."productId"
               WHERE al."organizationId" = $1 AND al."alertType" = 'OUT_OF_STOCK'::"AlertType"
                 AND al.resolved = false AND al."createdAt" >= $2 AND al."createdAt" < $3
                 AND ($4::uuid IS NULL OR al."storeId" = $4)"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_one(&mut **tx)
        .await?;
        let ev = events as f64;
        Ok(StockoutKpis {
            events,
            resolved,
            open,
            avg_duration_hours: avg_seconds.map(|s| f(s) / 3600.0),
            rate: if active_products > 0 {
                ev / active_products as f64
            } else {
                0.0
            },
            estimated_lost_sales: f(lost),
        })
    })
    .await
}

/// Rankings de producto: top ventas (€), top margen (€), peor rotación (uds).
pub async fn product_rankings(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
    limit: i64,
) -> Result<ProductRankings, AppError> {
    let limit = limit.clamp(1, 50);
    with_tenant_tx(pool, org, async move |tx, _after| {
        let top_sales: Vec<(Uuid, String, Decimal, Decimal)> = sqlx::query_as(
            r#"SELECT p.id AS product_id, p.name AS name,
                 COALESCE(SUM(sl."lineTotal"), 0) AS total, COALESCE(SUM(sl.qty), 0) AS units
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               JOIN "Product" p ON p.id = sl."productId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY p.id, p.name ORDER BY total DESC LIMIT $5"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .bind(limit)
        .fetch_all(&mut **tx)
        .await?;
        let top_margin: Vec<(Uuid, String, Decimal)> = sqlx::query_as(
            r#"SELECT p.id AS product_id, p.name AS name,
                 COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS margin
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               JOIN "Product" p ON p.id = sl."productId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY p.id, p.name ORDER BY margin DESC LIMIT $5"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .bind(limit)
        .fetch_all(&mut **tx)
        .await?;
        let worst: Vec<(Uuid, String, Decimal)> = sqlx::query_as(
            r#"SELECT p.id AS product_id, p.name AS name, COALESCE(SUM(sl.qty), 0) AS units
               FROM "Product" p
               LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
               LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               WHERE p."organizationId" = $1 AND p.active = true
               GROUP BY p.id, p.name ORDER BY units ASC, p.name ASC LIMIT $5"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .bind(limit)
        .fetch_all(&mut **tx)
        .await?;
        Ok(ProductRankings {
            top_sales: top_sales
                .into_iter()
                .map(|(product_id, name, total, units)| RankBySales {
                    product_id,
                    name,
                    total: f(total),
                    units: f(units),
                })
                .collect(),
            top_margin: top_margin
                .into_iter()
                .map(|(product_id, name, margin)| RankByMargin {
                    product_id,
                    name,
                    margin: f(margin),
                })
                .collect(),
            worst_rotation: worst
                .into_iter()
                .map(|(product_id, name, units)| RankByUnits {
                    product_id,
                    name,
                    units: f(units),
                })
                .collect(),
        })
    })
    .await
}

/// Rotación + evolución por producto (top por unidades del periodo).
pub async fn product_rotation(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<ProductRotationItem>, AppError> {
    let now = now_utc();
    with_tenant_tx(pool, org, async move |tx, _after| {
        let summary: Vec<RotationSummaryRow> = sqlx::query_as(
                r#"SELECT p.id AS product_id, p.name AS name, p."familyId" AS family_id,
                     p."createdAt" AS created_at,
                     COALESCE(SUM(sl.qty) FILTER (
                       WHERE sa."createdAt" >= $2 AND sa."createdAt" < $3
                         AND ($4::uuid IS NULL OR sa."storeId" = $4)
                     ), 0) AS units,
                     MAX(sa."createdAt") AS last_sale
                   FROM "Product" p
                   LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
                   LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'::"SaleStatus"
                   WHERE p."organizationId" = $1 AND p.active = true
                   GROUP BY p.id, p.name, p."familyId", p."createdAt"
                   ORDER BY units DESC, p.name ASC LIMIT $5"#,
            )
            .bind(org)
            .bind(range.from)
            .bind(range.to)
            .bind(store_id)
            .bind(ROTATION_LIMIT)
            .fetch_all(&mut **tx)
            .await?;

        let family_agg: Vec<(Option<Uuid>, Decimal, i64)> = sqlx::query_as(
            r#"SELECT p."familyId" AS family_id,
                 COALESCE(SUM(sl.qty) FILTER (
                   WHERE sa."createdAt" >= $2 AND sa."createdAt" < $3
                     AND ($4::uuid IS NULL OR sa."storeId" = $4)
                 ), 0) AS units,
                 COUNT(DISTINCT p.id) AS product_count
               FROM "Product" p
               LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
               LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'::"SaleStatus"
               WHERE p."organizationId" = $1 AND p.active = true
               GROUP BY p."familyId""#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let family_by: std::collections::HashMap<Option<Uuid>, (f64, i64)> = family_agg
            .into_iter()
            .map(|(fid, units, count)| (fid, (f(units), count)))
            .collect();

        let dias = dias_disponibles(tx, org, range, store_id).await? as f64;

        let daily: Vec<(Uuid, Decimal)> = sqlx::query_as(
            r#"SELECT sl."productId" AS product_id, COALESCE(SUM(sl.qty), 0) AS units
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY sl."productId", DATE(sa."createdAt") ORDER BY DATE(sa."createdAt")"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let mut trend_by: std::collections::HashMap<Uuid, Vec<f64>> = std::collections::HashMap::new();
        for (pid, units) in daily {
            trend_by.entry(pid).or_default().push(f(units));
        }

        Ok(summary
            .into_iter()
            .map(|(product_id, name, family_id, created_at, units, last_sale)| {
                let archetype_avg_daily = family_by.get(&family_id).and_then(|(fu, fc)| {
                    if *fc > 0 && dias > 0.0 {
                        Some(round3(fu / dias / *fc as f64))
                    } else {
                        None
                    }
                });
                ProductRotationItem {
                    product_id,
                    name,
                    units: f(units),
                    days_since_last_sale: last_sale.map(|d| days_since(now, d)),
                    trend: trend_by.remove(&product_id).unwrap_or_default(),
                    is_new: days_since(now, created_at) < NEW_PRODUCT_DAYS,
                    archetype_avg_daily,
                }
            })
            .collect())
    })
    .await
}

/// Rotación agregada por arquetipo (familia); sin familia → "Sin arquetipo".
pub async fn archetype_rotation(
    pool: &PgPool,
    org: Uuid,
    range: DateRange,
    store_id: Option<Uuid>,
) -> Result<Vec<ArchetypeRotationItem>, AppError> {
    let now = now_utc();
    with_tenant_tx(pool, org, async move |tx, _after| {
        let summary: Vec<ArchetypeSummaryRow> = sqlx::query_as(
                r#"SELECT pf.id AS family_id, pf.name AS family_name,
                     COUNT(DISTINCT p.id) AS product_count,
                     COALESCE(SUM(sl.qty) FILTER (
                       WHERE sa."createdAt" >= $2 AND sa."createdAt" < $3
                         AND ($4::uuid IS NULL OR sa."storeId" = $4)
                     ), 0) AS units,
                     MAX(sa."createdAt") AS last_sale
                   FROM "Product" p
                   LEFT JOIN "ProductFamily" pf ON pf.id = p."familyId"
                   LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
                   LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'::"SaleStatus"
                   WHERE p."organizationId" = $1 AND p.active = true
                   GROUP BY pf.id, pf.name
                   ORDER BY units DESC, family_name ASC LIMIT $5"#,
            )
            .bind(org)
            .bind(range.from)
            .bind(range.to)
            .bind(store_id)
            .bind(ROTATION_LIMIT)
            .fetch_all(&mut **tx)
            .await?;

        let daily: Vec<(Option<Uuid>, Decimal)> = sqlx::query_as(
            r#"SELECT p."familyId" AS family_id, COALESCE(SUM(sl.qty), 0) AS units
               FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
               JOIN "Product" p ON p.id = sl."productId"
               WHERE sa."organizationId" = $1 AND sa.status = 'COMPLETED'::"SaleStatus"
                 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
                 AND ($4::uuid IS NULL OR sa."storeId" = $4)
               GROUP BY p."familyId", DATE(sa."createdAt") ORDER BY DATE(sa."createdAt")"#,
        )
        .bind(org)
        .bind(range.from)
        .bind(range.to)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        let mut trend_by: std::collections::HashMap<Option<Uuid>, Vec<f64>> =
            std::collections::HashMap::new();
        for (fid, units) in daily {
            trend_by.entry(fid).or_default().push(f(units));
        }

        let dias = dias_disponibles(tx, org, range, store_id).await? as f64;

        Ok(summary
            .into_iter()
            .map(|(family_id, family_name, product_count, units, last_sale)| {
                let units = f(units);
                ArchetypeRotationItem {
                    family_id,
                    family_name: family_name.unwrap_or_else(|| "Sin arquetipo".to_owned()),
                    product_count,
                    units,
                    venta_media_diaria: if dias > 0.0 { round3(units / dias) } else { 0.0 },
                    days_since_last_sale: last_sale.map(|d| days_since(now, d)),
                    trend: trend_by.remove(&family_id).unwrap_or_default(),
                }
            })
            .collect())
    })
    .await
}
