//! Handlers HTTP de devoluciones (`/returns`) — slice 1: con ticket + listado.
//! Todas exigen sesión; el CLERK queda acotado a sus tiendas (SEC-01) dentro del
//! servicio. La devolución ciega (con PIN) llega en un slice posterior.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_domain::returns::model::ReturnWithLines;
use simpletpv_domain::returns::{service, CreateReturn};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::json::ValidatedJson;
use crate::state::AppState;

/// `POST /returns` — devolución contra un ticket de venta.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<CreateReturn>,
) -> Result<(StatusCode, Json<ReturnWithLines>), ApiError> {
    let r = service::create(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(r)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    sale_id: Uuid,
}

/// `GET /returns?saleId=` — devoluciones de una venta.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<ReturnWithLines>>, ApiError> {
    let items = service::list(state.db(), user.organization_id, q.sale_id).await?;
    Ok(Json(items))
}
