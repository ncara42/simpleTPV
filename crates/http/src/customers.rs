//! Handlers HTTP de clientes B2B (`/customers`, #154, IT-17). Función de central
//! → ADMIN/MANAGER en todas las operaciones.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::customers::model::Customer;
use simpletpv_domain::customers::{service, CreateCustomer, CustomerLedgerRow, UpdateCustomer};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<Customer>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(service::list(state.db(), user.organization_id).await?))
}

/// `GET /customers/ledger` — agregado de cartera por cliente (saldo, vencido,
/// facturado 12m, nº de pedidos, último pedido). Alimenta la ficha maestro-detalle.
pub async fn ledger(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<CustomerLedgerRow>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::ledger(state.db(), user.organization_id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateCustomer>,
) -> Result<(StatusCode, Json<Customer>), ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateCustomer>,
) -> Result<Json<Customer>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::update(state.db(), user.organization_id, id, body).await?,
    ))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
