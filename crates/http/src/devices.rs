//! Handlers HTTP de dispositivos (`/devices`, #154). Estado (`current`) y
//! emparejado: ADMIN/MANAGER/CLERK (acotado por tienda). Alta, listado y
//! revocado: ADMIN/MANAGER.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::devices::model::{CreatedDevice, DeviceListItem, DeviceStatus};
use simpletpv_domain::devices::{service, CreateDevice, PairDevice};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentQuery {
    #[serde(default)]
    pairing_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
}

/// `GET /devices/current?pairingToken=` — estado del TPV (cualquier rol).
pub async fn current(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<CurrentQuery>,
) -> Result<Json<DeviceStatus>, ApiError> {
    Ok(Json(
        service::status(state.db(), user.organization_id, q.pairing_token).await?,
    ))
}

/// `GET /devices?storeId=` — listado (ADMIN/MANAGER).
pub async fn find_all(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<DeviceListItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::find_all(state.db(), user.organization_id, q.store_id).await?,
    ))
}

/// `POST /devices` — alta (ADMIN/MANAGER). Devuelve el token en claro una vez.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateDevice>,
) -> Result<(StatusCode, Json<CreatedDevice>), ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `POST /devices/pair` — empareja/autoriza (cualquier rol; CLERK solo su tienda).
pub async fn pair(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PairDevice>,
) -> Result<Json<DeviceStatus>, ApiError> {
    let s = service::pair(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        body,
    )
    .await?;
    Ok(Json(s))
}

/// `DELETE /devices/:id` — revoca (ADMIN/MANAGER).
pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    service::revoke(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
