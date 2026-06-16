//! Estado compartido del router (doc 03 §3). `Clone` barato vía `Arc`.

use std::sync::Arc;

use simpletpv_auth::AuthService;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    auth: AuthService,
    /// Pool del rol `app` (RLS). Para readiness y futuras rutas de dominio.
    db: PgPool,
    /// Si la cookie del refresh lleva el flag `Secure` (solo HTTPS). En runtime
    /// (no compile-time): un binario release tras un proxy http debe poder
    /// desactivarlo, y dev sobre https activarlo.
    cookie_secure: bool,
}

impl AppState {
    pub fn new(auth: AuthService, db: PgPool, cookie_secure: bool) -> Self {
        Self {
            inner: Arc::new(Inner {
                auth,
                db,
                cookie_secure,
            }),
        }
    }

    pub fn auth(&self) -> &AuthService {
        &self.inner.auth
    }

    pub fn db(&self) -> &PgPool {
        &self.inner.db
    }

    pub fn cookie_secure(&self) -> bool {
        self.inner.cookie_secure
    }
}
