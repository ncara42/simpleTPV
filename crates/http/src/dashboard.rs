//! Handlers HTTP del dashboard de KPIs (`/dashboard`, #154). Solo central →
//! ADMIN/MANAGER; todo lectura. Portados: sales-today y sales-kpis.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::dashboard::period::{resolve_period, CompareMode, DashboardPeriod};
use simpletpv_domain::dashboard::{service, SalesKpis, SalesToday};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesTodayQuery {
    #[serde(default)]
    compare: Option<String>,
    #[serde(default)]
    store_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodQuery {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    store_id: Option<Uuid>,
}

/// `GET /dashboard/sales-today?compare=&storeId=`.
pub async fn sales_today(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<SalesTodayQuery>,
) -> Result<Json<SalesToday>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let compare = match q.compare.as_deref() {
        None => CompareMode::Day,
        Some(s) => CompareMode::parse(s).ok_or(AppError::BadRequest)?,
    };
    Ok(Json(
        service::sales_today(state.db(), user.organization_id, q.store_id, compare).await?,
    ))
}

/// `GET /dashboard/sales-kpis?period=&from=&to=&storeId=`.
pub async fn sales_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<SalesKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let period = match q.period.as_deref() {
        None => DashboardPeriod::Today,
        Some(s) => DashboardPeriod::parse(s).ok_or(AppError::BadRequest)?,
    };
    let range = resolve_period(period, now_utc(), q.from.as_deref(), q.to.as_deref())?;
    Ok(Json(
        service::sales_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `now` en UTC para resolver el periodo en la capa HTTP (frontera con el reloj).
fn now_utc() -> time::PrimitiveDateTime {
    let n = time::OffsetDateTime::now_utc();
    time::PrimitiveDateTime::new(n.date(), n.time())
}
