//! Handlers HTTP de traspasos (`/transfers`, #153). Crear/enviar/cerrar:
//! ADMIN/MANAGER. Recibir: ADMIN/MANAGER/CLERK (acotado por tienda destino).
//! Listar/consultar: cualquier rol con sesión.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::transfers::model::{TransferAttachment, TransferMessage, TransferWithLines};
use simpletpv_domain::transfers::{
    service, CreateAttachment, CreateMessage, CreateTransfer, EditMessage, ReceiveTransfer,
};
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

/// `POST /transfers/:id/attachments` (ADMIN/MANAGER/CLERK) — adjunta una foto de la
/// recepción. Mismas reglas de acceso que recibir (CLERK acotado a su tienda destino).
pub async fn add_attachment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateAttachment>,
) -> Result<(StatusCode, Json<TransferAttachment>), ApiError> {
    let a = service::add_attachment(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(a)))
}

/// `GET /transfers/:id/attachments` — fotos del traspaso (cualquier rol con sesión).
pub async fn list_attachments(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<TransferAttachment>>, ApiError> {
    Ok(Json(
        service::list_attachments(state.db(), user.organization_id, id).await?,
    ))
}

/// `POST /transfers/:id/messages` — añade un mensaje al chat (texto y/o foto). El autor
/// ('central'/'store') se deriva del rol; CLERK acotado a su tienda destino.
pub async fn add_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateMessage>,
) -> Result<(StatusCode, Json<TransferMessage>), ApiError> {
    let m = service::add_message(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(m)))
}

/// `PATCH /transfers/:id/messages/:messageId` — edita el texto de un mensaje.
pub async fn update_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, message_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<EditMessage>,
) -> Result<Json<TransferMessage>, ApiError> {
    let m = service::update_message(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        message_id,
        body,
    )
    .await?;
    Ok(Json(m))
}

/// `DELETE /transfers/:id/messages/:messageId` — borra un mensaje.
pub async fn delete_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, message_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    service::delete_message(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
        message_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /transfers/:id/resolve-incident` — marca la incidencia como solucionada.
pub async fn resolve_incident(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TransferWithLines>, ApiError> {
    let t = service::resolve_incident(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        id,
    )
    .await?;
    Ok(Json(t))
}

/// `GET /transfers/:id/messages` — hilo del chat (cualquier rol con sesión).
pub async fn list_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<TransferMessage>>, ApiError> {
    Ok(Json(
        service::list_messages(state.db(), user.organization_id, id).await?,
    ))
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
