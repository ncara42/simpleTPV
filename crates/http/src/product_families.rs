//! Handlers HTTP de familias de producto (`/product-families`, #154). Lectura
//! del árbol: cualquier sesión. Crear/actualizar/borrar: solo ADMIN.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::product_families::model::{FamilyNode, ProductFamily};
use simpletpv_domain::product_families::{service, CreateFamily, UpdateFamily};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

/// `GET /product-families` — árbol completo del tenant.
pub async fn find_tree(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<FamilyNode>>, ApiError> {
    Ok(Json(
        service::find_tree(state.db(), user.organization_id).await?,
    ))
}

/// `POST /product-families` (ADMIN).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateFamily>,
) -> Result<(StatusCode, Json<ProductFamily>), ApiError> {
    user.require_role(&[Role::Admin])?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `PATCH /product-families/:id` (ADMIN).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateFamily>,
) -> Result<Json<ProductFamily>, ApiError> {
    user.require_role(&[Role::Admin])?;
    Ok(Json(
        service::update(state.db(), user.organization_id, id, body).await?,
    ))
}

/// `DELETE /product-families/:id` (ADMIN).
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&[Role::Admin])?;
    service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
