//! Handlers HTTP de proveedores (`/suppliers`) y tarifas (`/supplier-prices`,
//! #153). Lectura de proveedores: cualquier rol con sesión. Escrituras y todas
//! las tarifas: ADMIN/MANAGER.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::csv::ImportResult;
use simpletpv_domain::suppliers::model::{ComparisonRow, Supplier, SupplierPriceRow};
use simpletpv_domain::suppliers::{
    service, CreateSupplier, ImportSupplierPrices, ListSupplierPricesQuery, UpdateSupplier,
    UpsertSupplierPrice,
};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const WRITE_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

// ─── Proveedores ──────────────────────────────────────────────────────────────

/// `GET /suppliers` — listado (cualquier rol con sesión).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<Supplier>>, ApiError> {
    Ok(Json(
        service::find_all(state.db(), user.organization_id).await?,
    ))
}

/// `GET /suppliers/:id`.
pub async fn get_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Supplier>, ApiError> {
    Ok(Json(
        service::find_one(state.db(), user.organization_id, id).await?,
    ))
}

/// `POST /suppliers` (ADMIN/MANAGER).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateSupplier>,
) -> Result<(StatusCode, Json<Supplier>), ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let created = service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `PATCH /suppliers/:id` (ADMIN/MANAGER).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSupplier>,
) -> Result<Json<Supplier>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    Ok(Json(
        service::update(state.db(), user.organization_id, id, body).await?,
    ))
}

/// `DELETE /suppliers/:id` (ADMIN/MANAGER).
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Tarifas de compra (todo ADMIN/MANAGER) ───────────────────────────────────

/// `GET /supplier-prices?supplierId=&productId=`.
pub async fn list_prices(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListSupplierPricesQuery>,
) -> Result<Json<Vec<SupplierPriceRow>>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let rows = service::list_prices(
        state.db(),
        user.organization_id,
        q.supplier_id,
        q.product_id,
    )
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonQuery {
    #[serde(default)]
    family_id: Option<Uuid>,
}

/// `GET /supplier-prices/comparison?familyId=`.
pub async fn comparison(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ComparisonQuery>,
) -> Result<Json<Vec<ComparisonRow>>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    Ok(Json(
        service::comparison(state.db(), user.organization_id, q.family_id).await?,
    ))
}

/// `PUT /supplier-prices` — crea/actualiza la tarifa de un (proveedor, producto).
pub async fn upsert_price(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpsertSupplierPrice>,
) -> Result<Json<SupplierPriceRow>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    Ok(Json(
        service::upsert_price(state.db(), user.organization_id, body).await?,
    ))
}

/// `POST /supplier-prices/import` — import CSV (sku,price) de un proveedor.
pub async fn import_prices(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ImportSupplierPrices>,
) -> Result<Json<ImportResult>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let res = service::import_prices_csv(
        state.db(),
        user.organization_id,
        body.supplier_id,
        &body.csv,
    )
    .await?;
    Ok(Json(res))
}

/// `DELETE /supplier-prices/:id`.
pub async fn remove_price(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    service::remove_price(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
