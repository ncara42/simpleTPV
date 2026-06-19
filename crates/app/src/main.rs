//! Bootstrap del backend: Axum + Tokio + tracing + Sentry + graceful shutdown.
//!
//! Compone las capas (doc 02 §3): carga config (fail-fast), abre los dos pools
//! (`app` con RLS y `app_admin` BYPASSRLS para el login), construye `AuthService`
//! y el router de `simpletpv-http`, y sirve con apagado ordenado.

use std::net::SocketAddr;
use std::time::Duration;

use secrecy::ExposeSecret;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use simpletpv_shared::AppConfig;
use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};

/// Cada cuánto el worker VeriFactu sondea la cola de registros PENDING.
const VERIFACTU_POLL_SECS: u64 = 5;
/// Registros por ciclo del worker (cota del lote `SKIP LOCKED`).
const VERIFACTU_BATCH: i64 = 50;

fn main() -> anyhow::Result<()> {
    // Sentry se inicializa ANTES del runtime async (doc oficial): su transporte
    // arranca un hilo de fondo. El guard vive todo el proceso y hace flush de los
    // eventos pendientes al caer. Inicializa `tracing` con la capa de Sentry.
    let _sentry = init_observability();

    // Runtime construido a mano (en vez de #[tokio::main]) para poder inicializar
    // Sentry antes. `enable_all` activa los drivers de IO y tiempo (worker + net).
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run())
}

/// Inicializa Sentry (errores/panics + trazas) y el subscriber de `tracing` con
/// la capa de Sentry. No-op de envío si falta `SENTRY_DSN` (cliente deshabilitado);
/// `tracing` queda igualmente montado para los logs de consola.
fn init_observability() -> sentry::ClientInitGuard {
    let dsn = std::env::var("SENTRY_DSN").ok().filter(|d| !d.is_empty());
    let enabled = dsn.is_some();
    // Muestreo de trazas de rendimiento (transacciones): 0.0 por defecto (solo
    // errores + breadcrumbs). Subir en prod con SENTRY_TRACES_SAMPLE_RATE.
    let traces_sample_rate = std::env::var("SENTRY_TRACES_SAMPLE_RATE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0);
    let guard = sentry::init(sentry::ClientOptions {
        dsn: dsn.and_then(|d| d.parse().ok()),
        release: sentry::release_name!(),
        traces_sample_rate,
        send_default_pii: false, // nada de PII/secretos a Sentry (#155)
        environment: std::env::var("SENTRY_ENVIRONMENT").ok().map(Into::into),
        ..Default::default()
    });

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer())
        .with(sentry::integrations::tracing::layer())
        .init();

    if enabled {
        tracing::info!("Sentry activado (envío de errores/trazas)");
    }
    guard
}

async fn run() -> anyhow::Result<()> {
    // Fail-fast: sin config válida (URLs de BD + secretos JWT), no se arranca.
    let config = AppConfig::from_env()?;
    let auth_config = AuthConfig::from_env()?;

    let db = simpletpv_db::build_pool(config.database_url_app.expose_secret()).await?;
    let admin = simpletpv_db::build_pool(config.database_url_admin.expose_secret()).await?;
    tracing::info!("conectado a la base de datos (roles app + app_admin)");

    // Aplica migraciones pendientes al arrancar, antes de que el router escuche.
    // sqlx::migrate!() embebe los SQL del directorio migrations/ en el binario:
    // no se necesita Prisma Migrate ni Node.js al desplegar. Las migraciones ya
    // aplicadas son no-op gracias a la tabla _sqlx_migrations que sqlx gestiona.
    sqlx::migrate!("./migrations")
        .run(&admin)
        .await
        .map_err(|e| anyhow::anyhow!("migraciones fallidas: {e}"))?;
    tracing::info!("migraciones OK");

    // Revalidación A-04: lookup BYPASSRLS sobre el MISMO pool admin (clon barato:
    // PgPool es Arc por dentro) + caché TTL corto. Se construye antes de mover
    // `admin` a `AuthService`.
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    // El pool admin también alimenta el lookup pre-tenant de API keys en AppState
    // (clon barato: PgPool es Arc). Se clona antes de mover `admin` a AuthService.
    let admin_db = admin.clone();
    // Mismo pool admin (BYPASSRLS) para el worker de envío VeriFactu (#155), que
    // drena la cola PENDING de todos los tenants. Se clona antes de mover `admin`.
    let verifactu_db = admin.clone();
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

    // Worker de envío VeriFactu (#155): drena la cola de registros PENDING con
    // `FOR UPDATE SKIP LOCKED` y los envía. SOLO se arranca con el flag explícito
    // `VERIFACTU_SANDBOX_SEND=true` (H-01): el único proveedor disponible es el
    // SANDBOX, que marca SENT sin declarar a la AEAT. En PRODUCCIÓN, sin proveedor
    // certificado, debe quedar APAGADO → los registros se quedan PENDING (no se
    // marcan SENT falsamente, lo que incumpliría la obligación fiscal). Cuando
    // exista proveedor real, se inyecta aquí y el flag deja de ser necesario.
    let sandbox_send = std::env::var("VERIFACTU_SANDBOX_SEND")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false);
    if sandbox_send {
        tracing::warn!(
            "VeriFactu: worker de envío SANDBOX ACTIVO — marca SENT sin declarar a la AEAT (solo dev/piloto)"
        );
        tokio::spawn(async move {
            let provider = simpletpv_domain::verifactu::SandboxProvider;
            let mut tick = tokio::time::interval(Duration::from_secs(VERIFACTU_POLL_SECS));
            loop {
                tick.tick().await;
                match simpletpv_domain::verifactu::process_pending_batch(
                    &verifactu_db,
                    &provider,
                    VERIFACTU_BATCH,
                    None,
                )
                .await
                {
                    Ok(n) if n > 0 => tracing::info!(procesados = n, "ciclo de envío VeriFactu"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!(error = %e, "ciclo del worker VeriFactu falló"),
                }
            }
        });
    } else {
        tracing::info!(
            "VeriFactu: envío deshabilitado (sin proveedor AEAT certificado); los registros quedan PENDING"
        );
    }

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
