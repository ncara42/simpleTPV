//! Handlers HTTP de pedidos mayoristas (`/wholesale-orders`, #154, IT-17c).
//! Función de central → ADMIN/MANAGER en todas las operaciones.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::wholesale_orders::model::{
    StatusResult, WholesaleOrderCreated, WholesaleOrderDetail, WholesaleOrderPage,
};
use simpletpv_domain::wholesale_orders::{service, CreateWholesaleOrder};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    customer_id: Option<Uuid>,
    #[serde(default)]
    page: Option<i64>,
}

#[derive(Deserialize)]
pub struct StatusBody {
    status: String,
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<WholesaleOrderPage>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::list(
            state.db(),
            user.organization_id,
            q.status,
            q.customer_id,
            q.page.unwrap_or(1),
        )
        .await?,
    ))
}

pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<WholesaleOrderDetail>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::get(state.db(), user.organization_id, id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateWholesaleOrder>,
) -> Result<(StatusCode, Json<WholesaleOrderCreated>), ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `PATCH /wholesale-orders/:id/status`.
pub async fn update_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<StatusBody>,
) -> Result<Json<StatusResult>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::update_status(state.db(), user.organization_id, id, body.status).await?,
    ))
}

/// `POST /wholesale-orders/:id/collect` — registra el cobro de un pedido a crédito
/// (ADMIN/MANAGER): lo marca PAID y sella `paidAt`. Tesorería, no fiscal.
pub async fn collect(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<WholesaleOrderDetail>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::collect_order(state.db(), user.organization_id, id).await?,
    ))
}
