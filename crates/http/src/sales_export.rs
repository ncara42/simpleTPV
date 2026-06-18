//! Handlers HTTP de exportación de ventas (#152): pide el export (ventas o
//! contable), consulta su estado y descarga el CSV. Generación SÍNCRONA (el
//! export se crea ya COMPLETED). Los POST exigen ADMIN/MANAGER (control de
//! central); el CLERK queda acotado a sus tiendas en el servicio (SEC-01).

use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::sales::export_service::{self, ExportFormat, SalesExportFilter};
use simpletpv_domain::sales::model::SalesExportMeta;
use simpletpv_shared::AppError;
use time::macros::format_description;
use time::{Date, PrimitiveDateTime, Time};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    user_id: Option<Uuid>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
}

fn parse_day(s: &str) -> Result<Date, ApiError> {
    Date::parse(s, format_description!("[year]-[month]-[day]"))
        .map_err(|_| AppError::BadRequest.into())
}

fn start_of(day: Date) -> PrimitiveDateTime {
    PrimitiveDateTime::new(day, Time::MIDNIGHT)
}

fn next_day(day: Date) -> Date {
    day.saturating_add(time::Duration::days(1))
}

fn to_filter(q: ExportQuery) -> Result<SalesExportFilter, ApiError> {
    if let Some(s) = &q.status {
        if s != "COMPLETED" && s != "VOIDED" {
            return Err(AppError::BadRequest.into());
        }
    }
    let (from, to) = if let Some(d) = &q.date {
        let day = parse_day(d)?;
        (Some(start_of(day)), Some(start_of(next_day(day))))
    } else {
        let from = q.from.as_deref().map(parse_day).transpose()?.map(start_of);
        let to =
            q.to.as_deref()
                .map(parse_day)
                .transpose()?
                .map(|d| start_of(next_day(d)));
        (from, to)
    };
    Ok(SalesExportFilter {
        store_id: q.store_id,
        user_id: q.user_id,
        status: q.status,
        from,
        to,
    })
}

async fn request(
    state: AppState,
    user: AuthUser,
    q: ExportQuery,
    format: ExportFormat,
) -> Result<(StatusCode, Json<SalesExportMeta>), ApiError> {
    user.require_role(&[Role::Admin, Role::Manager])?;
    let filter = to_filter(q)?;
    let meta = export_service::create_sales_export(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        filter,
        format,
    )
    .await?;
    Ok((StatusCode::ACCEPTED, Json(meta)))
}

/// `POST /sales/export` — export del historial de ventas (CSV). Los filtros van en
/// el CUERPO JSON (paridad NestJS `@Body() ListSalesQueryDto`), no en la query.
pub async fn request_export(
    State(state): State<AppState>,
    user: AuthUser,
    Json(q): Json<ExportQuery>,
) -> Result<(StatusCode, Json<SalesExportMeta>), ApiError> {
    request(state, user, q, ExportFormat::Sales).await
}

/// `POST /sales/export/accounting` — export contable (libro de IVA). Filtros en el
/// cuerpo JSON (paridad NestJS).
pub async fn request_accounting_export(
    State(state): State<AppState>,
    user: AuthUser,
    Json(q): Json<ExportQuery>,
) -> Result<(StatusCode, Json<SalesExportMeta>), ApiError> {
    request(state, user, q, ExportFormat::Accounting).await
}

/// `GET /sales/export/:id` — estado/metadatos del export (ADMIN/MANAGER: central).
pub async fn get_export(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<SalesExportMeta>, ApiError> {
    user.require_role(&[Role::Admin, Role::Manager])?;
    let meta = export_service::get_sales_export(state.db(), user.organization_id, id).await?;
    Ok(Json(meta))
}

/// `GET /sales/export/:id/download` — descarga el CSV (409 si no está listo).
/// ADMIN/MANAGER: el CSV lleva datos financieros de toda la organización.
pub async fn download(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    user.require_role(&[Role::Admin, Role::Manager])?;
    let (csv, filename) =
        export_service::download_sales_export(state.db(), user.organization_id, id).await?;
    let headers = [
        (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_owned()),
        (
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        ),
    ];
    Ok((headers, csv).into_response())
}
