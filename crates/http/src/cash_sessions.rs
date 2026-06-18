//! Handlers HTTP de caja (`/cash-sessions`, #145/#146). open/close/current/
//! movements(list)/request: cualquier rol (acotado por tienda). Alta directa,
//! pendientes, approve/deny: ADMIN/MANAGER.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::cash_sessions::model::{CashMovement, CashSession, PendingMovement};
use simpletpv_domain::cash_sessions::{
    service, CashMovementInput, CloseCashSession, OpenCashSession,
};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClosedQuery {
    store_id: Uuid,
    #[serde(default)]
    limit: Option<i64>,
}

/// `POST /cash-sessions/open`.
pub async fn open(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<OpenCashSession>,
) -> Result<Json<CashSession>, ApiError> {
    let s = service::open(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        body,
    )
    .await?;
    Ok(Json(s))
}

/// `POST /cash-sessions/:id/close`.
pub async fn close(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CloseCashSession>,
) -> Result<Json<CashSession>, ApiError> {
    let s = service::close(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        body,
    )
    .await?;
    Ok(Json(s))
}

/// `GET /cash-sessions/current?storeId=`.
pub async fn current(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<StoreQuery>,
) -> Result<Json<Option<CashSession>>, ApiError> {
    let s = service::current(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        q.store_id,
    )
    .await?;
    Ok(Json(s))
}

/// `GET /cash-sessions/closed?storeId=&limit=`.
pub async fn list_closed(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ClosedQuery>,
) -> Result<Json<Vec<CashSession>>, ApiError> {
    let rows = service::list_closed(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        q.store_id,
        q.limit.unwrap_or(30),
    )
    .await?;
    Ok(Json(rows))
}

/// `GET /cash-sessions/:id/movements`.
pub async fn movements(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<CashMovement>>, ApiError> {
    let rows = service::movements(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
    )
    .await?;
    Ok(Json(rows))
}

/// `POST /cash-sessions/:id/movements` — alta directa (ADMIN/MANAGER).
pub async fn create_movement(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CashMovementInput>,
) -> Result<Json<CashMovement>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let m = service::create_movement(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        body,
    )
    .await?;
    Ok(Json(m))
}

/// `POST /cash-sessions/:id/movements/request` — solicitud (cualquier rol).
pub async fn request_movement(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CashMovementInput>,
) -> Result<Json<CashMovement>, ApiError> {
    let m = service::request_movement(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        body,
    )
    .await?;
    // Evento SSE cash.movement.requested (#146, #154) para la campana de
    // aprobaciones: after-commit (la solicitud ya está confirmada). Best-effort.
    state.events().publish(
        user.organization_id,
        crate::events::AppEvent {
            event_type: "cash.movement.requested".to_owned(),
            data: serde_json::json!({
                "movementId": m.id,
                "storeId": m.store_id,
                "type": m.movement_type,
                "amount": m.amount.to_string(),
            }),
        },
    );
    Ok(Json(m))
}

/// `GET /cash-sessions/movements/pending` — solicitudes pendientes (ADMIN/MANAGER).
pub async fn list_pending(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<PendingMovement>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let rows = service::list_pending(state.db(), user.organization_id).await?;
    Ok(Json(rows))
}

/// `POST /cash-sessions/movements/:movId/approve` (ADMIN/MANAGER).
pub async fn approve(
    State(state): State<AppState>,
    user: AuthUser,
    Path(mov_id): Path<Uuid>,
) -> Result<Json<CashMovement>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let m = service::approve_movement(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        mov_id,
    )
    .await?;
    Ok(Json(m))
}

/// `POST /cash-sessions/movements/:movId/deny` (ADMIN/MANAGER).
pub async fn deny(
    State(state): State<AppState>,
    user: AuthUser,
    Path(mov_id): Path<Uuid>,
) -> Result<Json<CashMovement>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let m = service::deny_movement(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        mov_id,
    )
    .await?;
    Ok(Json(m))
}
