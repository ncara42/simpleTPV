//! Handlers HTTP de pedidos a proveedor (`/purchase-orders`, #153). Crear/
//! sugerir/confirmar/recibir/export: ADMIN/MANAGER. Listar/consultar: cualquier rol.

use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::purchases::model::{PurchaseOrderWithLines, SuggestionRow};
use simpletpv_domain::purchases::{
    service, CreatePurchaseOrder, ReceivePurchaseOrder, SuggestPurchase,
};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const WRITE_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    supplier_id: Option<Uuid>,
}

/// `POST /purchase-orders`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreatePurchaseOrder>,
) -> Result<(StatusCode, Json<PurchaseOrderWithLines>), ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let po = service::create(state.db(), user.organization_id, user.user_id, body).await?;
    Ok((StatusCode::CREATED, Json(po)))
}

/// `POST /purchase-orders/suggest`.
pub async fn suggest(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SuggestPurchase>,
) -> Result<Json<Vec<SuggestionRow>>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let rows = service::suggest(state.db(), user.organization_id, body).await?;
    Ok(Json(rows))
}

/// `GET /purchase-orders?status=&supplierId=`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<PurchaseOrderWithLines>>, ApiError> {
    if let Some(s) = &q.status {
        if !matches!(
            s.as_str(),
            "DRAFT" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED"
        ) {
            return Err(AppError::BadRequest.into());
        }
    }
    let rows = service::list(state.db(), user.organization_id, q.status, q.supplier_id).await?;
    Ok(Json(rows))
}

/// `GET /purchase-orders/:id`.
pub async fn get_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<PurchaseOrderWithLines>, ApiError> {
    Ok(Json(
        service::get(state.db(), user.organization_id, id).await?,
    ))
}

/// `GET /purchase-orders/:id/export` — CSV del pedido.
pub async fn export(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let csv = service::export_csv(state.db(), user.organization_id, id).await?;
    let headers = [(header::CONTENT_TYPE, "text/csv; charset=utf-8")];
    Ok((headers, csv).into_response())
}

/// `POST /purchase-orders/:id/confirm`.
pub async fn confirm(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<PurchaseOrderWithLines>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    Ok(Json(
        service::confirm(state.db(), user.organization_id, id).await?,
    ))
}

/// `POST /purchase-orders/:id/receive`.
pub async fn receive(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ReceivePurchaseOrder>,
) -> Result<Json<PurchaseOrderWithLines>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let po = service::receive(state.db(), user.organization_id, user.user_id, id, body).await?;
    Ok(Json(po))
}
