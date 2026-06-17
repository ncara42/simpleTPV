//! `ApiKeyAuth`: extractor para las rutas públicas autenticadas con `X-API-Key`
//! (equivalente al `ApiKeyGuard` de NestJS). Valida la clave contra el pool
//! `app_admin` (BYPASSRLS) — el lookup ocurre ANTES de conocer el tenant — y
//! expone `organization_id`/`price_list_id` al handler. NO usa JWT.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use simpletpv_domain::api_keys;
use simpletpv_shared::AppError;
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;

const API_KEY_HEADER: &str = "x-api-key";

pub struct ApiKeyAuth {
    pub organization_id: Uuid,
    pub price_list_id: Option<Uuid>,
}

impl FromRequestParts<AppState> for ApiKeyAuth {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // El formato `stpv_...` se exige antes de tocar la BD (rechazo barato).
        let raw = parts
            .headers
            .get(API_KEY_HEADER)
            .and_then(|v| v.to_str().ok())
            .filter(|s| s.starts_with("stpv_"))
            .ok_or(AppError::Unauthorized)?;

        let hashed = api_keys::hash_key(raw);
        let record = api_keys::find_by_hash(state.admin_db(), &hashed)
            .await?
            .ok_or(AppError::Unauthorized)?;

        if record.revoked_at.is_some() {
            return Err(AppError::Unauthorized.into());
        }
        if let Some(exp) = record.expires_at {
            let now = OffsetDateTime::now_utc();
            let now_pdt = PrimitiveDateTime::new(now.date(), now.time());
            if exp <= now_pdt {
                return Err(AppError::Unauthorized.into()); // caducada (KEY-02)
            }
        }

        // `lastUsedAt` es best-effort: la autenticación ya es válida, no se aborta
        // si el update falla (paridad con el `void ...catch()` del guard).
        let _ = api_keys::touch_last_used(state.admin_db(), record.id).await;

        Ok(ApiKeyAuth {
            organization_id: record.organization_id,
            price_list_id: record.price_list_id,
        })
    }
}
