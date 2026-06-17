//! Handlers HTTP de gestión de feature flags (`/feature-flags`, #154 / #127 B).
//! Función de central → ADMIN/MANAGER. Un flag a nivel org (sin tienda) solo
//! ADMIN; uno de tienda exige acceso a esa tienda (SEC-01). La RESOLUCIÓN
//! efectiva para el frontend está en `GET /me/features`.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::feature_flags::{service, FeatureFlagList, FlagRow};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFlag {
    key: String,
    enabled: bool,
    #[serde(default)]
    store_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
}

/// `GET /feature-flags` — catálogo + filas explícitas (ADMIN/MANAGER).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<FeatureFlagList>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(service::list(state.db(), user.organization_id).await?))
}

/// `PUT /feature-flags` — upsert de un flag (ADMIN/MANAGER).
pub async fn set_flag(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SetFlag>,
) -> Result<Json<FlagRow>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let row = service::set_flag(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role == Role::Admin,
        user.role.is_org_wide(),
        body.key,
        body.enabled,
        body.store_id,
    )
    .await?;
    Ok(Json(row))
}

/// `DELETE /feature-flags/:key?storeId=` — quita el flag explícito (ADMIN/MANAGER).
pub async fn clear_flag(
    State(state): State<AppState>,
    user: AuthUser,
    Path(key): Path<String>,
    Query(q): Query<StoreQuery>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    service::clear_flag(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role == Role::Admin,
        user.role.is_org_wide(),
        key,
        q.store_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
