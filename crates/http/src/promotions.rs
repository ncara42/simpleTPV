//! Handlers HTTP de promociones (`/promotions`, #154). Catálogo de central:
//! lectura para cualquier sesión; crear/actualizar/borrar ADMIN/MANAGER.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::promotions::model::Promotion;
use simpletpv_domain::promotions::{service, CreatePromotion, UpdatePromotion};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

pub async fn find_all(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<Promotion>>, ApiError> {
    Ok(Json(
        service::find_all(state.db(), user.organization_id).await?,
    ))
}

pub async fn find_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Promotion>, ApiError> {
    Ok(Json(
        service::find_one(state.db(), user.organization_id, id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreatePromotion>,
) -> Result<(StatusCode, Json<Promotion>), ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdatePromotion>,
) -> Result<Json<Promotion>, ApiError> {
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
