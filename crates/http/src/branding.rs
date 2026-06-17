//! Handlers HTTP de marca corporativa (`/organization/branding`, #154, U-08).
//! Lectura: cualquier sesión. Escritura: solo ADMIN.

use axum::extract::State;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::branding::{service, Branding, UpdateBranding};

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

/// `GET /organization/branding`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Branding>, ApiError> {
    Ok(Json(service::get(state.db(), user.organization_id).await?))
}

/// `PATCH /organization/branding` (ADMIN).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdateBranding>,
) -> Result<Json<Branding>, ApiError> {
    user.require_role(&[Role::Admin])?;
    Ok(Json(
        service::update(state.db(), user.organization_id, body).await?,
    ))
}
