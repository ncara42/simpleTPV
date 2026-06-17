//! Handlers HTTP de tarifas B2B (`/price-lists`, #154, IT-17). Función de central
//! → ADMIN/MANAGER en todas las operaciones.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::price_lists::model::{
    PriceList, PriceListDetail, PriceListItem, PriceListSummary,
};
use simpletpv_domain::price_lists::{service, CreatePriceList, SetPriceListItem, UpdatePriceList};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<PriceListSummary>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(service::list(state.db(), user.organization_id).await?))
}

pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<PriceListDetail>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::get(state.db(), user.organization_id, id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreatePriceList>,
) -> Result<(StatusCode, Json<PriceList>), ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdatePriceList>,
) -> Result<Json<PriceList>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::update(state.db(), user.organization_id, id, body).await?,
    ))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /price-lists/:id/items` — fija (upsert) el precio de un producto.
pub async fn set_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetPriceListItem>,
) -> Result<Json<PriceListItem>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::set_item(state.db(), user.organization_id, id, body).await?,
    ))
}

/// `DELETE /price-lists/:id/items/:productId`.
pub async fn remove_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, product_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    service::remove_item(state.db(), user.organization_id, id, product_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
