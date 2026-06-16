//! Handlers HTTP del stock (`/stock`) — port (parcial) de `stock.controller.ts`.
//! Slice A: ajustes/mínimos/recuento (ADMIN/MANAGER) + caducidad/movimientos
//! (cualquier rol). Las vistas byStore/global/alerts (con acceso por tienda,
//! rotación y arquetipo) llegan en el siguiente sub-PR.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::stock::service::{self, MovementsFilter};
use simpletpv_domain::stock::{
    Adjust, ExpiringBatch, InventoryCount, InventoryCountResult, MovementsPage, SetMin, StockView,
};
use time::format_description::well_known::Rfc3339;
use time::{OffsetDateTime, PrimitiveDateTime, UtcOffset};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::json::ValidatedJson;
use crate::state::AppState;

const WRITE_ROLES: [Role; 2] = [Role::Admin, Role::Manager];
const DEFAULT_MOVEMENTS_PAGE_SIZE: i64 = 50;

/// `PUT /stock/min` (ADMIN/MANAGER).
pub async fn set_min(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<SetMin>,
) -> Result<Json<StockView>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let view = service::set_min(state.db(), user.organization_id, body).await?;
    Ok(Json(view))
}

/// `POST /stock/adjust` (ADMIN/MANAGER). El `userId` sale del token.
pub async fn adjust(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<Adjust>,
) -> Result<Json<StockView>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let view = service::adjust(state.db(), user.organization_id, user.user_id, body).await?;
    Ok(Json(view))
}

/// `POST /stock/inventory-count` (ADMIN/MANAGER).
pub async fn inventory_count(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<InventoryCount>,
) -> Result<Json<InventoryCountResult>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let result =
        service::confirm_inventory_count(state.db(), user.organization_id, user.user_id, body)
            .await?;
    Ok(Json(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpiringQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    within_days: Option<i64>,
}

/// `GET /stock/expiring` (cualquier rol).
pub async fn expiring(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ExpiringQuery>,
) -> Result<Json<Vec<ExpiringBatch>>, ApiError> {
    let batches =
        service::expiring_batches(state.db(), user.organization_id, q.store_id, q.within_days)
            .await?;
    Ok(Json(batches))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementsQuery {
    #[serde(default)]
    product_id: Option<Uuid>,
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    page_size: Option<i64>,
}

/// `GET /stock/movements` (cualquier rol).
pub async fn movements(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<MovementsQuery>,
) -> Result<Json<MovementsPage>, ApiError> {
    let filter = MovementsFilter {
        product_id: q.product_id,
        store_id: q.store_id,
        from: parse_dt(q.from.as_deref())?,
        to: parse_dt(q.to.as_deref())?,
        page: q.page.unwrap_or(1),
        page_size: q.page_size.unwrap_or(DEFAULT_MOVEMENTS_PAGE_SIZE),
    };
    let page = service::movements(state.db(), user.organization_id, filter).await?;
    Ok(Json(page))
}

/// Parsea un instante ISO-8601 (RFC 3339) a `PrimitiveDateTime` en UTC (la columna
/// `createdAt` es TIMESTAMP sin tz). Entrada inválida → 400.
fn parse_dt(value: Option<&str>) -> Result<Option<PrimitiveDateTime>, ApiError> {
    match value {
        None => Ok(None),
        Some(s) => {
            let odt = OffsetDateTime::parse(s, &Rfc3339)
                .map_err(|_| simpletpv_shared::AppError::BadRequest)?
                .to_offset(UtcOffset::UTC);
            Ok(Some(PrimitiveDateTime::new(odt.date(), odt.time())))
        }
    }
}
