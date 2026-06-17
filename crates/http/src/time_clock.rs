//! Handlers HTTP del control horario (`/time-clock`, #153). current/today/
//! history-me/POST: cualquier rol con sesión (acotado por tienda/dispositivo en el
//! servicio). history/history-all/entries: ADMIN/MANAGER (gestión).

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::time_clock::model::{EntryLog, JornadaRow, TimeClockEntry, TodaySummary};
use simpletpv_domain::time_clock::{service, CreateEntry, HistoryQuery};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreQuery {
    store_id: Uuid,
}

/// `GET /time-clock/current?storeId=`.
pub async fn current(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<StoreQuery>,
) -> Result<Json<Option<TimeClockEntry>>, ApiError> {
    let entry =
        service::current(state.db(), user.organization_id, q.store_id, user.user_id).await?;
    Ok(Json(entry))
}

/// `GET /time-clock/today?storeId=`.
pub async fn today(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<StoreQuery>,
) -> Result<Json<TodaySummary>, ApiError> {
    let summary =
        service::today(state.db(), user.organization_id, q.store_id, user.user_id).await?;
    Ok(Json(summary))
}

/// `POST /time-clock` — registra un fichaje.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateEntry>,
) -> Result<Json<TimeClockEntry>, ApiError> {
    let entry = service::create(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        body,
    )
    .await?;
    Ok(Json(entry))
}

/// `GET /time-clock/history?storeId=&userId=&from=&to=` (ADMIN/MANAGER).
pub async fn history(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HistoryQuery>,
) -> Result<Json<Vec<JornadaRow>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let store_id = q.store_id.ok_or(AppError::BadRequest)?;
    let rows = service::history(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        store_id,
        q.user_id,
        q.from,
        q.to,
        7,
    )
    .await?;
    Ok(Json(rows))
}

/// `GET /time-clock/history/me?storeId=&from=&to=` (cualquier rol; userId del token).
pub async fn history_me(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HistoryQuery>,
) -> Result<Json<Vec<JornadaRow>>, ApiError> {
    let store_id = q.store_id.ok_or(AppError::BadRequest)?;
    let rows = service::history(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        store_id,
        Some(user.user_id),
        q.from,
        q.to,
        30,
    )
    .await?;
    Ok(Json(rows))
}

/// `GET /time-clock/history-all?storeId=&userId=&from=&to=` (ADMIN/MANAGER).
pub async fn history_all(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HistoryQuery>,
) -> Result<Json<Vec<JornadaRow>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let rows = service::history_all(
        state.db(),
        user.organization_id,
        q.store_id,
        q.user_id,
        q.from,
        q.to,
    )
    .await?;
    Ok(Json(rows))
}

/// `GET /time-clock/entries?storeId=&userId=&from=&to=` (ADMIN/MANAGER).
pub async fn entries(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HistoryQuery>,
) -> Result<Json<Vec<EntryLog>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let store_id = q.store_id.ok_or(AppError::BadRequest)?;
    let rows = service::entries(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        store_id,
        q.user_id,
        q.from,
        q.to,
    )
    .await?;
    Ok(Json(rows))
}
