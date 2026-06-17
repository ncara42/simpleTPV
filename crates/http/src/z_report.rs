//! Handler HTTP del cierre Z (`/z-report`, #124). Informe fiscal de central →
//! ADMIN/MANAGER. `storeId` y `date` (YYYY-MM-DD) obligatorios en la query.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::z_report::{service, ZReport};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZReportQuery {
    store_id: Uuid,
    date: String,
}

/// `GET /z-report?storeId=&date=`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ZReportQuery>,
) -> Result<Json<ZReport>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let report = service::get_z_report(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        q.store_id,
        q.date,
    )
    .await?;
    Ok(Json(report))
}
