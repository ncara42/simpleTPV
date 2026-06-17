//! Handlers HTTP de tiendas (`/stores`, #153). CRUD: solo ADMIN. Estado operativo
//! y overrides de precio: ADMIN/MANAGER (acotado por tienda salvo org-wide).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use simpletpv_auth::Role;
use simpletpv_domain::csv::ImportResult;
use simpletpv_domain::stores::model::{Store, StorePriceItem};
use simpletpv_domain::stores::{
    service, CreateStore, ImportStorePrices, MarkCentral, SetStorePrice, UpdateStore,
    UpdateStoreOps,
};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const OPS_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

// ─── CRUD (solo ADMIN) ────────────────────────────────────────────────────────

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<Store>>, ApiError> {
    user.require_role(&[Role::Admin])?;
    Ok(Json(
        service::find_all(state.db(), user.organization_id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateStore>,
) -> Result<(StatusCode, Json<Store>), ApiError> {
    user.require_role(&[Role::Admin])?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateStore>,
) -> Result<Json<Store>, ApiError> {
    user.require_role(&[Role::Admin])?;
    Ok(Json(
        service::update(state.db(), user.organization_id, id, body).await?,
    ))
}

pub async fn set_central(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<MarkCentral>,
) -> Result<Json<Store>, ApiError> {
    user.require_role(&[Role::Admin])?;
    let is_central = body.is_central.unwrap_or(true);
    Ok(Json(
        service::set_central(state.db(), user.organization_id, id, is_central).await?,
    ))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&[Role::Admin])?;
    service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Ops + precios (ADMIN/MANAGER) ────────────────────────────────────────────

pub async fn update_ops(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateStoreOps>,
) -> Result<Json<Store>, ApiError> {
    user.require_role(&OPS_ROLES)?;
    let store = service::update_ops(
        state.db(),
        user.organization_id,
        id,
        user.user_id,
        user.role.is_org_wide(),
        body,
    )
    .await?;
    Ok(Json(store))
}

pub async fn list_prices(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<StorePriceItem>>, ApiError> {
    user.require_role(&OPS_ROLES)?;
    let rows = service::list_prices(
        state.db(),
        user.organization_id,
        id,
        user.user_id,
        user.role.is_org_wide(),
    )
    .await?;
    Ok(Json(rows))
}

pub async fn set_price(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetStorePrice>,
) -> Result<Json<StorePriceItem>, ApiError> {
    user.require_role(&OPS_ROLES)?;
    let item = service::set_price(
        state.db(),
        user.organization_id,
        id,
        user.user_id,
        user.role.is_org_wide(),
        body,
    )
    .await?;
    Ok(Json(item))
}

pub async fn import_prices(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ImportStorePrices>,
) -> Result<Json<ImportResult>, ApiError> {
    user.require_role(&OPS_ROLES)?;
    let res = service::import_prices_csv(
        state.db(),
        user.organization_id,
        id,
        user.user_id,
        user.role.is_org_wide(),
        &body.csv,
    )
    .await?;
    Ok(Json(res))
}

pub async fn remove_price(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, product_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&OPS_ROLES)?;
    service::remove_price(
        state.db(),
        user.organization_id,
        id,
        product_id,
        user.user_id,
        user.role.is_org_wide(),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
