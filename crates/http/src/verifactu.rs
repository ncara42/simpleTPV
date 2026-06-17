//! Handlers de estado/reintento de VeriFactu (`/verifactu/records`, #155). Solo
//! ADMIN/MANAGER (administración). El ENVÍO real lo procesa el worker de fondo;
//! aquí solo se consulta el estado y se re-encolan los registros fallidos.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use simpletpv_auth::Role;
use simpletpv_domain::verifactu::queue::{self, VerifactuRecordView};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    status: Option<String>,
}

/// `GET /verifactu/records?status=` — registros del tenant (ADMIN/MANAGER).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<VerifactuRecordView>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        queue::list(state.db(), user.organization_id, q.status).await?,
    ))
}

/// `POST /verifactu/records/:id/retry` — re-encola un registro (ADMIN/MANAGER).
pub async fn retry(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    queue::retry(state.db(), user.organization_id, id).await?;
    Ok(Json(json!({ "ok": true })))
}
