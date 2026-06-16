//! `AuthUser`: extractor de usuario autenticado (equivalente al `AuthGuard` de
//! NestJS, doc 03 §4). Verifica el access token del header `Authorization:
//! Bearer`, **revalida el estado del usuario por petición (A-04)** y expone los
//! claims tipados al handler.
//!
//! Revalidación A-04: tras verificar la firma, comprueba contra la BD (caché TTL
//! corto, `UserStateService`) que el usuario sigue `active` y con el mismo `role`.
//! Cierra la ventana en la que un usuario desactivado o degradado conserva
//! privilegios hasta caducar su access token. Ante un fallo de infraestructura
//! aplica **fail-closed selectivo**: deniega a roles privilegiados (ADMIN/MANAGER)
//! y deja pasar al resto (la firma del token ya garantiza autenticidad y para
//! roles de bajo privilegio priorizamos disponibilidad).

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use simpletpv_auth::{Role, UserState};
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

/// Roles privilegiados para los que la revalidación es fail-closed ante un fallo
/// de infraestructura (BD de auth caída): denegamos en vez de dejar pasar.
fn is_fail_closed_role(role: Role) -> bool {
    matches!(role, Role::Admin | Role::Manager)
}

/// Decide si una petición pasa la revalidación A-04, dado el rol del token y el
/// resultado del lookup de estado. Función pura (sin I/O) para poder testear la
/// política fail-closed/fail-open aislada (port de `auth.guard.spec.ts`).
fn revalidation_decision(
    token_role: Role,
    lookup: Result<Option<UserState>, AppError>,
) -> Result<(), AppError> {
    match lookup {
        // Usuario presente: debe seguir activo y con el mismo rol.
        Ok(Some(state)) => {
            if !state.active || state.role != token_role {
                return Err(AppError::Unauthorized);
            }
            Ok(())
        }
        // Usuario borrado tras emitir el token → sesión inválida.
        Ok(None) => Err(AppError::Unauthorized),
        // Fallo de infraestructura → fail-closed selectivo por rol.
        Err(_) => {
            if is_fail_closed_role(token_role) {
                Err(AppError::Unauthorized)
            } else {
                Ok(()) // roles no privilegiados → fail-open
            }
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
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
        let organization_id =
            Uuid::parse_str(&claims.organization_id).map_err(|_| AppError::Unauthorized)?;

        // Revalidación A-04 por petición (con caché TTL corto).
        let lookup = state.user_state().get_state(user_id).await;
        revalidation_decision(claims.role, lookup)?;

        Ok(AuthUser {
            user_id,
            organization_id,
            role: claims.role,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(active: bool, role: Role) -> Result<Option<UserState>, AppError> {
        Ok(Some(UserState { active, role }))
    }

    #[test]
    fn acepta_si_sigue_activo_con_el_mismo_rol() {
        assert!(revalidation_decision(Role::Admin, state(true, Role::Admin)).is_ok());
    }

    #[test]
    fn rechaza_si_el_usuario_fue_desactivado() {
        assert_eq!(
            revalidation_decision(Role::Admin, state(false, Role::Admin)),
            Err(AppError::Unauthorized)
        );
    }

    #[test]
    fn rechaza_si_el_usuario_ya_no_existe() {
        assert_eq!(
            revalidation_decision(Role::Admin, Ok(None)),
            Err(AppError::Unauthorized)
        );
    }

    #[test]
    fn rechaza_si_el_rol_cambio() {
        assert_eq!(
            revalidation_decision(Role::Admin, state(true, Role::Clerk)),
            Err(AppError::Unauthorized)
        );
    }

    #[test]
    fn fail_closed_para_admin_ante_fallo_de_infra() {
        assert_eq!(
            revalidation_decision(Role::Admin, Err(AppError::Internal)),
            Err(AppError::Unauthorized)
        );
    }

    #[test]
    fn fail_closed_para_manager_ante_fallo_de_infra() {
        assert_eq!(
            revalidation_decision(Role::Manager, Err(AppError::Internal)),
            Err(AppError::Unauthorized)
        );
    }

    #[test]
    fn fail_open_para_clerk_ante_fallo_de_infra() {
        assert!(revalidation_decision(Role::Clerk, Err(AppError::Internal)).is_ok());
    }
}
