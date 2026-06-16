//! Handlers HTTP del catálogo (`/products`) — port de `products.controller.ts`.
//!
//! Todas las rutas exigen sesión (extractor [`AuthUser`], que aporta el
//! `organization_id` del token para el RLS). La escritura, además, rol
//! ADMIN/MANAGER. La lógica vive en `simpletpv_domain::products`.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct, Product, ProductPatch};
use simpletpv_domain::ImportResult;
use simpletpv_shared::limits::{MAX_BARCODE_LENGTH, MAX_SEARCH_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::json::ValidatedJson;
use crate::state::AppState;

/// Roles autorizados a mutar el catálogo (`@Roles('ADMIN','MANAGER')`).
const WRITE_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductQuery {
    #[serde(default)]
    search: Option<String>,
    #[serde(default)]
    family_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportBody {
    csv: String,
}

/// `GET /products` — listado/búsqueda (cualquier rol autenticado).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ProductQuery>,
) -> Result<Json<Vec<Product>>, ApiError> {
    // Acota el término de búsqueda (paridad `@MaxLength(MAX_SEARCH_LENGTH)`): evita
    // un ILIKE con un patrón enorme como DoS autenticado.
    if q.search.as_deref().map(str::len).unwrap_or(0) > MAX_SEARCH_LENGTH {
        return Err(AppError::BadRequest.into());
    }
    let items = products::service::find_all(
        state.db(),
        user.organization_id,
        q.search.as_deref(),
        q.family_id,
    )
    .await?;
    Ok(Json(items))
}

/// `GET /products/barcode/:code`.
pub async fn get_by_barcode(
    State(state): State<AppState>,
    user: AuthUser,
    Path(code): Path<String>,
) -> Result<Json<Product>, ApiError> {
    // Acota la longitud del código (paridad `MAX_BARCODE_LENGTH`): un path enorme
    // no debe generar tráfico de BD inútil.
    if code.len() > MAX_BARCODE_LENGTH {
        return Err(AppError::BadRequest.into());
    }
    let product =
        products::service::find_by_barcode(state.db(), user.organization_id, &code).await?;
    Ok(Json(product))
}

/// `GET /products/:id`.
pub async fn get_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Product>, ApiError> {
    let product = products::service::find_one(state.db(), user.organization_id, id).await?;
    Ok(Json(product))
}

/// `POST /products` — crea (ADMIN/MANAGER).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<NewProduct>,
) -> Result<(StatusCode, Json<Product>), ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let product = products::service::create(state.db(), user.organization_id, body).await?;
    Ok((StatusCode::CREATED, Json(product)))
}

/// `POST /products/import` — importación CSV (ADMIN/MANAGER).
pub async fn import(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<ImportBody>,
) -> Result<Json<ImportResult>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let result = products::service::import_csv(state.db(), user.organization_id, &body.csv).await?;
    Ok(Json(result))
}

/// `PATCH /products/:id` — actualización parcial (ADMIN/MANAGER).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(patch): ValidatedJson<ProductPatch>,
) -> Result<Json<Product>, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    let product = products::service::update(state.db(), user.organization_id, id, patch).await?;
    Ok(Json(product))
}

/// `DELETE /products/:id` — borrado físico (ADMIN/MANAGER) → 204.
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_role(&WRITE_ROLES)?;
    products::service::remove(state.db(), user.organization_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
