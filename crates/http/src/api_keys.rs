//! Handlers HTTP de gestión de API keys (`/api-keys`, #154, IT-18). Solo ADMIN
//! crea/lista/revoca. La key en claro se devuelve una única vez al crear.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::api_keys::model::{ApiKeyListItem, GeneratedApiKey};
use simpletpv_domain::api_keys::{service, CreateApiKey};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<ApiKeyListItem>>, ApiError> {
    user.require_role(&[Role::Admin])?;
    Ok(Json(service::list(state.db(), user.organization_id).await?))
}

pub async fn generate(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateApiKey>,
) -> Result<(StatusCode, Json<GeneratedApiKey>), ApiError> {
    user.require_role(&[Role::Admin])?;
    let created = service::generate(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&[Role::Admin])?;
    service::revoke(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
