//! Estado compartido del router (doc 03 §3). `Clone` barato vía `Arc`.

use std::sync::Arc;

use simpletpv_auth::{AuthService, DbUserStateLookup, UserStateService};
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    auth: AuthService,
    /// Revalidación A-04 por petición (lookup `active`/`role` + caché TTL corto).
    /// Tipo CONCRETO a propósito (no se hace `AppState` genérico): la política
    /// fail-closed/fail-open se testea aislada en `extractor::revalidation_decision`
    /// y la caché en `auth::user_state`, así que no hace falta inyectar lookups de
    /// prueba a través de `AppState`. Mantiene el estado simple y monomórfico.
    user_state: UserStateService<DbUserStateLookup>,
    /// Pool del rol `app` (RLS). Para readiness y futuras rutas de dominio.
    db: PgPool,
    /// Si la cookie del refresh lleva el flag `Secure` (solo HTTPS). En runtime
    /// (no compile-time): un binario release tras un proxy http debe poder
    /// desactivarlo, y dev sobre https activarlo.
    cookie_secure: bool,
    /// Orígenes CORS permitidos (resueltos al arranque; fail-fast en prod).
    cors_origins: Vec<String>,
}

impl AppState {
    pub fn new(
        auth: AuthService,
        user_state: UserStateService<DbUserStateLookup>,
        db: PgPool,
        cookie_secure: bool,
        cors_origins: Vec<String>,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                auth,
                user_state,
                db,
                cookie_secure,
                cors_origins,
            }),
        }
    }

    pub fn auth(&self) -> &AuthService {
        &self.inner.auth
    }

    pub fn user_state(&self) -> &UserStateService<DbUserStateLookup> {
        &self.inner.user_state
    }

    pub fn db(&self) -> &PgPool {
        &self.inner.db
    }

    pub fn cookie_secure(&self) -> bool {
        self.inner.cookie_secure
    }

    pub fn cors_origins(&self) -> &[String] {
        &self.inner.cors_origins
    }
}
