//! Bootstrap del backend (Fase 0): Axum + Tokio + tracing + graceful shutdown.
//!
//! Mínimo deliberado: solo prueba que el stack arranca y conecta a la base de
//! datos. La lógica de dominio y las rutas se añaden en fases posteriores
//! (doc 02 §4). Las capas siguen el principio de doc 02 §3.

use std::net::SocketAddr;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::Router;
use secrecy::ExposeSecret;
use simpletpv_shared::AppConfig;
use sqlx::PgPool;
use tokio::net::TcpListener;
use tokio::signal;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Fail-fast: sin configuración válida, no se arranca (doc 07 §5).
    let config = AppConfig::from_env()?;
    let pool = simpletpv_db::build_pool(config.database_url_app.expose_secret()).await?;
    tracing::info!("conectado a la base de datos");

    // TODO(Fase 1): cabeceras de seguridad (CSP/HSTS/nosniff/Referrer-Policy) y
    // CORS fail-fast vía tower-http antes de exponer rutas de negocio (doc 06).
    let app = Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .with_state(pool)
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = config.bind_addr.parse()?;
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "escuchando");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

/// Liveness: el proceso está vivo.
async fn health() -> &'static str {
    "ok"
}

/// Readiness: la base de datos responde.
async fn ready(State(pool): State<PgPool>) -> Result<&'static str, StatusCode> {
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map(|_| "ready")
        .map_err(|e| {
            // Se registra el detalle en el servidor; al cliente solo el status.
            tracing::error!(error = %e, "readiness check falló");
            StatusCode::SERVICE_UNAVAILABLE
        })
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
