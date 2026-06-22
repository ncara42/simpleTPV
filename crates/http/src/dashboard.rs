//! Handlers HTTP del dashboard de KPIs (`/dashboard`, #154). Solo central →
//! ADMIN/MANAGER; todo lectura. Portados: sales-today y sales-kpis.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::dashboard::period::{
    resolve_period, CompareMode, DashboardPeriod, DateRange,
};
use simpletpv_domain::dashboard::{
    service, ArchetypeRotationItem, DiscountByEmployeeItem, MarginKpis, ProductRankings,
    ProductRotationItem, SalesByEmployeeItem, SalesByFamilyItem, SalesByHourItem, SalesByStoreItem,
    SalesKpis, SalesToday, StockoutKpis,
};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankingsQuery {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    limit: Option<i64>,
}

/// Resuelve el `DateRange` del periodo desde una `PeriodQuery` (valida `custom`).
impl PeriodQuery {
    fn range(&self) -> Result<DateRange, ApiError> {
        let period = match self.period.as_deref() {
            None => DashboardPeriod::Today,
            Some(s) => DashboardPeriod::parse(s).ok_or(AppError::BadRequest)?,
        };
        Ok(resolve_period(
            period,
            now_utc(),
            self.from.as_deref(),
            self.to.as_deref(),
        )?)
    }
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

/// `GET /tpv/dashboard/sales-today` — recuento diario del TPV. Cualquier rol;
/// un CLERK queda acotado a su tienda (SEC-01), nunca al agregado de la org.
pub async fn tpv_sales_today(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<SalesTodayQuery>,
) -> Result<Json<SalesToday>, ApiError> {
    let compare = match q.compare.as_deref() {
        None => CompareMode::Day,
        Some(s) => CompareMode::parse(s).ok_or(AppError::BadRequest)?,
    };
    Ok(Json(
        service::sales_today_tpv(
            state.db(),
            user.organization_id,
            user.user_id,
            user.role.is_org_wide(),
            q.store_id,
            compare,
        )
        .await?,
    ))
}

/// `GET /dashboard/sales-kpis?period=&from=&to=&storeId=`.
pub async fn sales_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<SalesKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-family`.
pub async fn sales_by_family(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByFamilyItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_family(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-hour`.
pub async fn sales_by_hour(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByHourItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_hour(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/discount-by-employee`.
pub async fn discount_by_employee(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<DiscountByEmployeeItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::discount_by_employee(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-employee`.
pub async fn sales_by_employee(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByEmployeeItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_employee(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-store` — desglose multitienda (facturación, ticket medio, margen).
pub async fn sales_by_store(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByStoreItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_store(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/margin-kpis`.
pub async fn margin_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<MarginKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::margin_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/stockout-kpis`.
pub async fn stockout_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<StockoutKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::stockout_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/product-rankings?limit=`.
pub async fn product_rankings(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<RankingsQuery>,
) -> Result<Json<ProductRankings>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let pq = PeriodQuery {
        period: q.period,
        from: q.from,
        to: q.to,
        store_id: q.store_id,
    };
    let range = pq.range()?;
    Ok(Json(
        service::product_rankings(
            state.db(),
            user.organization_id,
            range,
            pq.store_id,
            q.limit.unwrap_or(10),
        )
        .await?,
    ))
}

/// `GET /dashboard/product-rotation`.
pub async fn product_rotation(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<ProductRotationItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::product_rotation(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/archetype-rotation`.
pub async fn archetype_rotation(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<ArchetypeRotationItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::archetype_rotation(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `now` en UTC para resolver el periodo en la capa HTTP (frontera con el reloj).
fn now_utc() -> time::PrimitiveDateTime {
    let n = time::OffsetDateTime::now_utc();
    time::PrimitiveDateTime::new(n.date(), n.time())
}
