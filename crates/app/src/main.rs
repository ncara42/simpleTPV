//! Bootstrap del backend: Axum + Tokio + tracing + graceful shutdown.
//!
//! Compone las capas (doc 02 §3): carga config (fail-fast), abre los dos pools
//! (`app` con RLS y `app_admin` BYPASSRLS para el login), construye `AuthService`
//! y el router de `simpletpv-http`, y sirve con apagado ordenado.

use std::net::SocketAddr;

use secrecy::ExposeSecret;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use simpletpv_shared::AppConfig;
use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Fail-fast: sin config válida (URLs de BD + secretos JWT), no se arranca.
    let config = AppConfig::from_env()?;
    let auth_config = AuthConfig::from_env()?;

    let db = simpletpv_db::build_pool(config.database_url_app.expose_secret()).await?;
    let admin = simpletpv_db::build_pool(config.database_url_admin.expose_secret()).await?;
    tracing::info!("conectado a la base de datos (roles app + app_admin)");

    // Revalidación A-04: lookup BYPASSRLS sobre el MISMO pool admin (clon barato:
    // PgPool es Arc por dentro) + caché TTL corto. Se construye antes de mover
    // `admin` a `AuthService`.
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    // El pool admin también alimenta el lookup pre-tenant de API keys en AppState
    // (clon barato: PgPool es Arc). Se clona antes de mover `admin` a AuthService.
    let admin_db = admin.clone();
    let auth = AuthService::new(admin, auth_config);
    // Cookie `Secure` configurable en runtime (COOKIE_SECURE); por defecto activo
    // en release. Permite release-tras-proxy-http (off) y dev-sobre-https (on).
    let cookie_secure = std::env::var("COOKIE_SECURE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(cfg!(not(debug_assertions)));
    let app = build_router(AppState::new(
        auth,
        user_state,
        db,
        admin_db,
        cookie_secure,
        config.cors_origins,
    ));

    let addr: SocketAddr = config.bind_addr.parse()?;
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "escuchando");

    // `into_make_service_with_connect_info`: el rate-limit por IP necesita la IP
    // del peer cuando no llega `X-Forwarded-For` (conexión directa sin proxy).
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

/// Espera SIGINT (Ctrl-C) o SIGTERM para un apagado ordenado.
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("instalar handler de Ctrl-C");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("instalar handler de SIGTERM")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("apagando…");
}
