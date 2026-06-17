//! Handlers HTTP de usuarios (`/users`, #153). TODOS exigen ADMIN (gestión de
//! usuarios). La validación de entrada la hace el servicio de dominio.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::csv::ImportResult;
use simpletpv_domain::users::model::{PublicUser, UserListItem};
use simpletpv_domain::users::{service, AssignStores, CreateUser, ImportUsers, SetPin, UpdateUser};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

/// `GET /users` — lista con tiendas asignadas.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<UserListItem>>, ApiError> {
    user.require_role(&[Role::Admin])?;
    let users = service::find_all(state.db(), user.organization_id).await?;
    Ok(Json(users))
}

/// `POST /users` — alta de usuario.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateUser>,
) -> Result<(StatusCode, Json<PublicUser>), ApiError> {
    user.require_role(&[Role::Admin])?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `POST /users/import` — alta en lote desde CSV.
pub async fn import_csv(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ImportUsers>,
) -> Result<Json<ImportResult>, ApiError> {
    user.require_role(&[Role::Admin])?;
    let result = service::import_csv(state.db(), user.organization_id, &body.csv).await?;
    Ok(Json(result))
}

/// `PATCH /users/:id` — actualiza un usuario.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUser>,
) -> Result<Json<PublicUser>, ApiError> {
    user.require_role(&[Role::Admin])?;
    let updated = service::update(state.db(), user.organization_id, id, body).await?;
    Ok(Json(updated))
}

/// `DELETE /users/:id` — borra un usuario.
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&[Role::Admin])?;
    service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /users/:id/pin` — fija el PIN del usuario.
pub async fn set_pin(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetPin>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&[Role::Admin])?;
    body.validate()?;
    service::set_pin(state.db(), user.organization_id, id, body.pin).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /users/:id/stores` — reemplaza las tiendas asignadas.
pub async fn assign_stores(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AssignStores>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&[Role::Admin])?;
    body.validate()?;
    service::assign_stores(state.db(), user.organization_id, id, body.store_ids).await?;
    Ok(StatusCode::NO_CONTENT)
}
