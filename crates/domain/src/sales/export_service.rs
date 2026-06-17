//! Servicio de exportación de ventas (#152) — port (síncrono) de
//! `SalesExportService` / `generateExportCsv` / `generateAccountingCsv`.
//!
//! A diferencia de NestJS (cola BullMQ), aquí el CSV se genera EN EL MOMENTO
//! dentro de la petición: se crea el `SalesExport` ya en estado COMPLETED. El
//! worker asíncrono queda como deuda (TODO: cola al escalar). Todo bajo
//! `with_tenant_tx` (RLS). Filtros: tienda/vendedor/estado/rango + acotado por
//! tienda al CLERK. (Los filtros `familyId`/`q` quedan pendientes, ver #152.)

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{Postgres, QueryBuilder, Transaction};
use time::PrimitiveDateTime;
use uuid::Uuid;

use crate::feature_flags::assert_flag_enabled;

use super::domain::TaxLine;
use super::export::{build_accounting_csv, build_sales_csv, AccountingSaleRow, SalesExportRow};
use super::model::{PaymentMethod, SaleStatus, SalesExportMeta};

/// Formato del export: historial de ventas o libro de IVA contable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Sales,
    Accounting,
}

impl ExportFormat {
    fn as_str(self) -> &'static str {
        match self {
            ExportFormat::Sales => "sales",
            ExportFormat::Accounting => "accounting",
        }
    }
    fn filename(self) -> &'static str {
        match self {
            ExportFormat::Sales => "ventas.csv",
            ExportFormat::Accounting => "libro-iva.csv",
        }
    }
}

/// Filtros del export (los mismos del listado, sin paginación).
#[derive(Debug, Clone, Default)]
pub struct SalesExportFilter {
    pub store_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub status: Option<String>,
    pub from: Option<PrimitiveDateTime>,
    pub to: Option<PrimitiveDateTime>,
}

#[derive(sqlx::FromRow)]
struct ExportSaleRow {
    id: Uuid,
    ticket_number: String,
    created_at: PrimitiveDateTime,
    store_name: String,
    user_name: String,
    status: SaleStatus,
    payment_method: PaymentMethod,
    subtotal: Decimal,
    discount_total: Decimal,
    total: Decimal,
}

/// Añade el WHERE común (org + filtros + acotado por tienda al CLERK) al builder.
/// `force_completed` ignora el filtro de estado y exige COMPLETED (export contable).
fn push_where(
    qb: &mut QueryBuilder<Postgres>,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    f: &SalesExportFilter,
    force_completed: bool,
) {
    qb.push(r#" WHERE s."organizationId" = "#).push_bind(org);
    if let Some(s) = f.store_id {
        qb.push(r#" AND s."storeId" = "#).push_bind(s);
    }
    if let Some(u) = f.user_id {
        qb.push(r#" AND s."userId" = "#).push_bind(u);
    }
    if force_completed {
        qb.push(r#" AND s.status = 'COMPLETED'::"SaleStatus""#);
    } else if let Some(st) = &f.status {
        qb.push(r#" AND s.status = "#)
            .push_bind(st.clone())
            .push(r#"::"SaleStatus""#);
    }
    if let Some(from) = f.from {
        qb.push(r#" AND s."createdAt" >= "#).push_bind(from);
    }
    if let Some(to) = f.to {
        qb.push(r#" AND s."createdAt" < "#).push_bind(to);
    }
    if !is_org_wide {
        qb.push(r#" AND s."storeId" IN (SELECT "storeId" FROM "UserStore" WHERE "userId" = "#)
            .push_bind(requester)
            .push(")");
    }
}

/// Carga las ventas que casan con el filtro (con nombres de tienda/vendedor),
/// orden `createdAt` desc. Comparte filtro con el listado.
async fn load_sales(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    f: &SalesExportFilter,
) -> Result<Vec<ExportSaleRow>, sqlx::Error> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT s.id, s."ticketNumber" AS ticket_number, s."createdAt" AS created_at,
             st.name AS store_name, u.name AS user_name, s.status::text AS status,
             s."paymentMethod"::text AS payment_method, s.subtotal,
             s."discountTotal" AS discount_total, s.total
           FROM "Sale" s
           JOIN "Store" st ON st.id = s."storeId"
           JOIN "User" u ON u.id = s."userId""#,
    );
    push_where(&mut qb, org, requester, is_org_wide, f, false);
    qb.push(r#" ORDER BY s."createdAt" DESC"#);
    qb.build_query_as::<ExportSaleRow>()
        .fetch_all(&mut **tx)
        .await
}

/// Genera el CSV del historial de ventas (todas las filas del filtro).
async fn generate_sales_csv(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    f: &SalesExportFilter,
) -> Result<(String, usize), sqlx::Error> {
    let sales = load_sales(tx, org, requester, is_org_wide, f).await?;
    let rows: Vec<SalesExportRow> = sales
        .into_iter()
        .map(|s| SalesExportRow {
            ticket_number: s.ticket_number,
            created_at: s.created_at,
            store_name: s.store_name,
            user_name: s.user_name,
            status: s.status,
            payment_method: s.payment_method,
            subtotal: s.subtotal,
            discount_total: s.discount_total,
            total: s.total,
        })
        .collect();
    Ok(build_sales_csv(&rows))
}

/// Genera el CSV contable (libro de IVA): solo COMPLETED, orden cronológico, con
/// las líneas de cada factura para desglosar el IVA por tipo.
async fn generate_accounting_csv(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    f: &SalesExportFilter,
) -> Result<(String, usize), sqlx::Error> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT s.id, s."ticketNumber" AS ticket_number, s."createdAt" AS created_at,
             st.name AS store_name, u.name AS user_name, s.status::text AS status,
             s."paymentMethod"::text AS payment_method, s.subtotal,
             s."discountTotal" AS discount_total, s.total
           FROM "Sale" s
           JOIN "Store" st ON st.id = s."storeId"
           JOIN "User" u ON u.id = s."userId""#,
    );
    push_where(&mut qb, org, requester, is_org_wide, f, true);
    qb.push(r#" ORDER BY s."createdAt" ASC"#);
    let headers = qb
        .build_query_as::<ExportSaleRow>()
        .fetch_all(&mut **tx)
        .await?;

    let mut sales = Vec::with_capacity(headers.len());
    for h in headers {
        let lines: Vec<(Decimal, Decimal)> =
            sqlx::query_as(r#"SELECT "taxRate", "lineTotal" FROM "SaleLine" WHERE "saleId" = $1"#)
                .bind(h.id)
                .fetch_all(&mut **tx)
                .await?;
        sales.push(AccountingSaleRow {
            ticket_number: h.ticket_number,
            created_at: h.created_at,
            store_name: h.store_name,
            payment_method: h.payment_method,
            subtotal: h.subtotal,
            total: h.total,
            lines: lines
                .into_iter()
                .map(|(tax_rate, line_total)| TaxLine {
                    tax_rate,
                    line_total,
                })
                .collect(),
        });
    }
    Ok(build_accounting_csv(&sales))
}

/// Pide un export: genera el CSV EN EL MOMENTO y crea el `SalesExport` ya en
/// estado COMPLETED (síncrono; el worker asíncrono es deuda). Devuelve los
/// metadatos (sin el CSV).
pub async fn create_sales_export(
    pool: &sqlx::PgPool,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    filter: SalesExportFilter,
    format: ExportFormat,
) -> Result<SalesExportMeta, AppError> {
    // Feature flag `data_export` (#127 B): la exportación es de central; gate a
    // nivel org (Forbidden si está apagada), FUERA de la tx de escritura.
    assert_flag_enabled(pool, org, "data_export", None).await?;

    let meta: SalesExportMeta = with_tenant_tx(pool, org, async move |tx, _after| {
        let (csv, row_count) = match format {
            ExportFormat::Sales => {
                generate_sales_csv(tx, org, requester, is_org_wide, &filter).await?
            }
            ExportFormat::Accounting => {
                generate_accounting_csv(tx, org, requester, is_org_wide, &filter).await?
            }
        };
        let filters_json = serde_json::json!({
            "format": format.as_str(),
            "storeId": filter.store_id.map(|u| u.to_string()),
            "userId": filter.user_id.map(|u| u.to_string()),
            "status": filter.status,
        })
        .to_string();

        let id = Uuid::new_v4();
        let row: SalesExportMeta = sqlx::query_as(
            r#"INSERT INTO "SalesExport"
                 (id, "organizationId", status, filters, "requestedById", "rowCount", csv, "completedAt")
               VALUES ($1, $2, 'COMPLETED'::"SalesExportStatus", $3::jsonb, $4, $5, $6, now())
               RETURNING id, status::text AS status, "rowCount" AS row_count, error,
                 "createdAt" AS created_at, "completedAt" AS completed_at"#,
        )
        .bind(id)
        .bind(org)
        .bind(&filters_json)
        .bind(requester)
        .bind(row_count as i32)
        .bind(&csv)
        .fetch_one(&mut **tx)
        .await?;
        Ok(row)
    })
    .await?;
    Ok(meta)
}

/// Estado/metadatos de un export (sin el CSV). 404 si no existe en el tenant.
pub async fn get_sales_export(
    pool: &sqlx::PgPool,
    org: Uuid,
    id: Uuid,
) -> Result<SalesExportMeta, AppError> {
    let found: Option<SalesExportMeta> = with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<SalesExportMeta> = sqlx::query_as(
            r#"SELECT id, status::text AS status, "rowCount" AS row_count, error,
                 "createdAt" AS created_at, "completedAt" AS completed_at
               FROM "SalesExport" WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row)
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// Descarga el CSV de un export COMPLETED + el nombre de fichero sugerido. 404 si
/// no existe; 409 (`Conflict`) si aún no está listo.
pub async fn download_sales_export(
    pool: &sqlx::PgPool,
    org: Uuid,
    id: Uuid,
) -> Result<(String, &'static str), AppError> {
    let row: Option<(String, Option<String>, Option<String>)> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let r: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
                r#"SELECT status::text, csv, filters->>'format'
                   FROM "SalesExport" WHERE id = $1 AND "organizationId" = $2"#,
            )
            .bind(id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            Ok(r)
        })
        .await?;
    let Some((status, csv, format)) = row else {
        return Err(AppError::NotFound);
    };
    if status != "COMPLETED" {
        return Err(AppError::Conflict);
    }
    let Some(csv) = csv else {
        return Err(AppError::Conflict);
    };
    let filename = if format.as_deref() == Some("accounting") {
        ExportFormat::Accounting.filename()
    } else {
        ExportFormat::Sales.filename()
    };
    Ok((csv, filename))
}
