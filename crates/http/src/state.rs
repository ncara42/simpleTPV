//! Estado compartido del router (doc 03 §3). `Clone` barato vía `Arc`.

use std::sync::Arc;

use simpletpv_ai::AiConfig;
use simpletpv_auth::{AuthService, DbUserStateLookup, UserStateService};
use simpletpv_telegram::TelegramClient;
use sqlx::PgPool;

use crate::events::EventHub;

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
    /// Pool del rol `app_admin` (BYPASSRLS). Para lookups pre-tenant (API key de
    /// la API pública): la key se busca por hash ANTES de conocer la organización,
    /// donde la RLS devolvería 0 filas. NUNCA para rutas autenticadas con JWT.
    admin_db: PgPool,
    /// Si la cookie del refresh lleva el flag `Secure` (solo HTTPS). En runtime
    /// (no compile-time): un binario release tras un proxy http debe poder
    /// desactivarlo, y dev sobre https activarlo.
    cookie_secure: bool,
    /// Orígenes CORS permitidos (resueltos al arranque; fail-fast en prod).
    cors_origins: Vec<String>,
    /// Bus de eventos in-process para SSE (#32). Se construye aquí (no se inyecta):
    /// no hay publishers cableados todavía, así que no necesita compartirse fuera.
    events: EventHub,
    /// Configuración de proveedores LLM (claves de API). None si no se configuró.
    ai: Option<AiConfig>,
    /// Cliente del bot de Telegram para el soporte con escalado humano (Ayuda).
    /// None si no se configuró (TELEGRAM_*): el escalado a humano queda inactivo.
    telegram: Option<TelegramClient>,
}

impl AppState {
    // El estado agrupa las dependencias del router (auth, pools, config, IA,
    // Telegram). Pasarlas explícitas es más claro que un struct de config aparte.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        auth: AuthService,
        user_state: UserStateService<DbUserStateLookup>,
        db: PgPool,
        admin_db: PgPool,
        cookie_secure: bool,
        cors_origins: Vec<String>,
        ai: Option<AiConfig>,
        telegram: Option<TelegramClient>,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                auth,
                user_state,
                db,
                admin_db,
                cookie_secure,
                cors_origins,
                events: EventHub::new(),
                ai,
                telegram,
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

    /// Pool `app_admin` (BYPASSRLS) — solo para lookups pre-tenant (API key).
    pub fn admin_db(&self) -> &PgPool {
        &self.inner.admin_db
    }

    pub fn cookie_secure(&self) -> bool {
        self.inner.cookie_secure
    }

    pub fn cors_origins(&self) -> &[String] {
        &self.inner.cors_origins
    }

    /// Bus de eventos in-process (SSE, #32).
    pub fn events(&self) -> &EventHub {
        &self.inner.events
    }

    /// Configuración de proveedores LLM. None si no hay claves configuradas.
    pub fn ai(&self) -> Option<&AiConfig> {
        self.inner.ai.as_ref()
    }

    /// Cliente de Telegram para el soporte (Ayuda). None si no se configuró.
    pub fn telegram(&self) -> Option<&TelegramClient> {
        self.inner.telegram.as_ref()
    }
}
