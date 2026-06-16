//! `AuthUser`: extractor de usuario autenticado (equivalente al `AuthGuard` de
//! NestJS, doc 03 §4). Verifica el access token del header `Authorization:
//! Bearer` y expone los claims tipados al handler.
//!
//! TODO(A-04): revalidación por request del estado del usuario (activo/rol) con
//! caché corta y fail-closed por rol. Por ahora se valida firma + `exp` (base
//! sólida); la revalidación cierra la ventana de desactivación y se añade luego.

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use simpletpv_auth::Role;
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;

pub struct AuthUser {
    pub user_id: Uuid,
    pub organization_id: Uuid,
    pub role: Role,
}

impl AuthUser {
    /// Exige que el rol esté en `allowed` (equivalente a `@Roles(...)`).
    pub fn require_role(&self, allowed: &[Role]) -> Result<(), ApiError> {
        if allowed.contains(&self.role) {
            Ok(())
        } else {
            Err(AppError::Forbidden.into())
        }
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;

        let claims = state.auth().verify_access_token(token)?;

        Ok(AuthUser {
            user_id: Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?,
            organization_id: Uuid::parse_str(&claims.organization_id)
                .map_err(|_| AppError::Unauthorized)?,
            role: claims.role,
        })
    }
}
