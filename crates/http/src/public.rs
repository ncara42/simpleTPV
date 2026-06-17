//! Handler HTTP de la API pública (`/public`, #154, IT-18). Autenticada con
//! `X-API-Key` (sin JWT); rate limit estricto en el router. Expone stock +
//! precio mayorista de la tarifa de la key.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use simpletpv_domain::public::{service, PublicStockItem};
use uuid::Uuid;

use crate::api_key_extractor::ApiKeyAuth;
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicStockQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
}

/// `GET /public/stock?storeId=` — stock de productos activos + precio mayorista.
pub async fn stock(
    State(state): State<AppState>,
    api_key: ApiKeyAuth,
    Query(q): Query<PublicStockQuery>,
) -> Result<Json<Vec<PublicStockItem>>, ApiError> {
    let items = service::stock(
        state.db(),
        api_key.organization_id,
        api_key.price_list_id,
        q.store_id,
    )
    .await?;
    Ok(Json(items))
}
