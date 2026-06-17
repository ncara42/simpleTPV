//! Handlers HTTP de los recursos del usuario autenticado (`/me`, #154). Sin
//! restricción de rol más allá del AuthGuard: cualquier sesión (incluido CLERK)
//! accede a lo suyo. Reúne perfil, tiendas de la org (selector del TPV), feature
//! flags efectivos y preferencias.

use std::collections::BTreeMap;

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_domain::me::model::{MeProfile, SavedPreference};
use simpletpv_domain::me::preferences;
use simpletpv_domain::stores::model::Store;
use simpletpv_domain::{feature_flags, me, stores};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturesQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct SetPreferenceBody {
    value: serde_json::Value,
}

/// `GET /me` — perfil: rol + tiendas asignadas + nombre/email.
pub async fn profile(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<MeProfile>, ApiError> {
    Ok(Json(
        me::profile(
            state.db(),
            user.organization_id,
            user.user_id,
            user.role.as_str(),
        )
        .await?,
    ))
}

/// `GET /me/stores` — tiendas de la organización (selector del TPV; cualquier rol).
pub async fn stores(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<Store>>, ApiError> {
    Ok(Json(
        stores::service::find_all(state.db(), user.organization_id).await?,
    ))
}

/// `GET /me/features?storeId=` — estado efectivo de los feature flags.
pub async fn features(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<FeaturesQuery>,
) -> Result<Json<BTreeMap<String, bool>>, ApiError> {
    Ok(Json(
        feature_flags::resolve_all(state.db(), user.organization_id, q.store_id).await?,
    ))
}

/// `GET /me/preferences` — todas las preferencias del usuario.
pub async fn preferences_get(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<BTreeMap<String, serde_json::Value>>, ApiError> {
    Ok(Json(
        preferences::get_all(state.db(), user.organization_id, user.user_id).await?,
    ))
}

/// `PUT /me/preferences/:key` — upsert de una preferencia del usuario.
pub async fn preferences_set(
    State(state): State<AppState>,
    user: AuthUser,
    Path(key): Path<String>,
    Json(body): Json<SetPreferenceBody>,
) -> Result<Json<SavedPreference>, ApiError> {
    let saved = preferences::set(
        state.db(),
        user.organization_id,
        user.user_id,
        key,
        body.value,
    )
    .await?;
    Ok(Json(saved))
}
