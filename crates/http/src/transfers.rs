//! Handlers HTTP de traspasos (`/transfers`, #153). Crear/enviar/cerrar:
//! ADMIN/MANAGER. Recibir: ADMIN/MANAGER/CLERK (acotado por tienda destino).
//! Listar/consultar: cualquier rol con sesión.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::transfers::model::TransferWithLines;
use simpletpv_domain::transfers::{service, CreateTransfer, ReceiveTransfer};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const WRITE_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    status: Option<String>,
}

/// `POST /transfers` — crea un traspaso en DRAFT.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateTransfer>,
) -> Result<(StatusCode, Json<TransferWithLines>), ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let t = service::create(state.db(), user.organization_id, user.user_id, body).await?;
    Ok((StatusCode::CREATED, Json(t)))
}

/// `GET /transfers?status=`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<TransferWithLines>>, ApiError> {
    if let Some(s) = &q.status {
        if !matches!(s.as_str(), "DRAFT" | "SENT" | "RECEIVED" | "CLOSED") {
            return Err(AppError::BadRequest.into());
        }
    }
    let rows = service::list(state.db(), user.organization_id, q.status).await?;
    Ok(Json(rows))
}

/// `GET /transfers/:id`.
pub async fn get_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TransferWithLines>, ApiError> {
    Ok(Json(
        service::get(state.db(), user.organization_id, id).await?,
    ))
}

/// `POST /transfers/:id/send` (ADMIN/MANAGER).
pub async fn send(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TransferWithLines>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let t = service::send(state.db(), user.organization_id, user.user_id, id).await?;
    Ok(Json(t))
}

/// `POST /transfers/:id/receive` (ADMIN/MANAGER/CLERK).
pub async fn receive(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ReceiveTransfer>,
) -> Result<Json<TransferWithLines>, ApiError> {
    let t = service::receive(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        body,
    )
    .await?;
    Ok(Json(t))
}

/// `POST /transfers/:id/close` (ADMIN/MANAGER).
pub async fn close(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TransferWithLines>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let t = service::close(state.db(), user.organization_id, id).await?;
    Ok(Json(t))
}
