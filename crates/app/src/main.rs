//! Bootstrap del backend: Axum + Tokio + tracing + Sentry + graceful shutdown.
//!
//! Compone las capas (doc 02 §3): carga config (fail-fast), abre los dos pools
//! (`app` con RLS y `app_admin` BYPASSRLS para el login), construye `AuthService`
//! y el router de `simpletpv-http`, y sirve con apagado ordenado.

use std::net::SocketAddr;
use std::time::Duration;

use secrecy::ExposeSecret;
use simpletpv_ai::AiConfig;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use simpletpv_shared::AppConfig;
use simpletpv_telegram::{TelegramClient, TelegramConfig};
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
    // Las migraciones van embebidas en el binario (include_str!). El runner propio
    // comprueba solo versiones en _sqlx_migrations, sin validar checksums: así el
    // corte Prisma → sqlx es indoloro (el script de cutover marca versiones, no
    // checksums). Las migraciones ya aplicadas se saltan; las nuevas se ejecutan
    // en orden dentro de una transacción.
    //
    // SKIP_MIGRATE=true omite este paso (solo para emergencias o cortes manuales).
    let skip_migrate = std::env::var("SKIP_MIGRATE")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false);
    if skip_migrate {
        tracing::warn!("SKIP_MIGRATE=true: migraciones sqlx omitidas (corte temporal)");
    } else {
        run_migrations(&admin).await?;
    }

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
    let ai = AiConfig::from_env().ok();
    if ai.is_none() {
        tracing::info!("chatbot IA deshabilitado (sin OPENAI_API_KEY ni ANTHROPIC_API_KEY)");
    }
    // Soporte por Telegram (Ayuda). Sin las variables TELEGRAM_* el escalado a
    // humano queda inactivo (la IA sigue resolviendo lo que pueda).
    let telegram = TelegramConfig::from_env().map(TelegramClient::new);
    match &telegram {
        Some(client) => {
            // Registro best-effort del webhook al arrancar si se indica la URL pública
            // (idempotente en Telegram). Si no, se registra manualmente con setWebhook.
            if let Some(url) = std::env::var("TELEGRAM_WEBHOOK_URL")
                .ok()
                .filter(|s| !s.trim().is_empty())
            {
                let client = client.clone();
                tokio::spawn(async move {
                    match client.set_webhook(url.trim()).await {
                        Ok(()) => tracing::info!("webhook de Telegram registrado"),
                        Err(e) => tracing::error!(error = %e, "fallo registrando el webhook de Telegram"),
                    }
                });
            }
        }
        None => tracing::info!(
            "soporte por Telegram deshabilitado (faltan TELEGRAM_BOT_TOKEN / TELEGRAM_SUPPORT_CHAT_ID / TELEGRAM_WEBHOOK_SECRET)"
        ),
    }
    let app = build_router(AppState::new(
        auth,
        user_state,
        db,
        admin_db,
        cookie_secure,
        config.cors_origins,
        ai,
        telegram,
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

struct Migration {
    version: i64,
    desc: &'static str,
    sql: &'static str,
}

macro_rules! m {
    ($file:literal, $ver:expr, $desc:expr) => {
        Migration {
            version: $ver,
            desc: $desc,
            sql: include_str!($file),
        }
    };
}

async fn run_migrations(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMPTZ NOT NULL DEFAULT now(),
            success BOOLEAN NOT NULL,
            checksum BYTEA NOT NULL DEFAULT ''::bytea,
            execution_time BIGINT NOT NULL DEFAULT 0
        )"#,
    )
    .execute(pool)
    .await?;

    let migrations: &[Migration] = &[
        m!(
            "../migrations/20260527233848_initial.sql",
            20260527233848,
            "initial"
        ),
        m!(
            "../migrations/20260527233947_add_rls.sql",
            20260527233947,
            "add_rls"
        ),
        m!(
            "../migrations/20260527234721_app_login.sql",
            20260527234721,
            "app_login"
        ),
        m!(
            "../migrations/20260527235720_rls_nullif_fix.sql",
            20260527235720,
            "rls_nullif_fix"
        ),
        m!(
            "../migrations/20260528001929_remove_app_password.sql",
            20260528001929,
            "remove_app_password"
        ),
        m!(
            "../migrations/20260528062610_product_catalog_fields.sql",
            20260528062610,
            "product_catalog_fields"
        ),
        m!(
            "../migrations/20260528065732_product_families.sql",
            20260528065732,
            "product_families"
        ),
        m!(
            "../migrations/20260528071759_users_pin_audit.sql",
            20260528071759,
            "users_pin_audit"
        ),
        m!(
            "../migrations/20260528095500_sales.sql",
            20260528095500,
            "sales"
        ),
        m!(
            "../migrations/20260528100000_sale_payment.sql",
            20260528100000,
            "sale_payment"
        ),
        m!(
            "../migrations/20260528122034_sale_discounts.sql",
            20260528122034,
            "sale_discounts"
        ),
        m!(
            "../migrations/20260528130000_saleline_tax_rate.sql",
            20260528130000,
            "saleline_tax_rate"
        ),
        m!(
            "../migrations/20260528140000_sale_void.sql",
            20260528140000,
            "sale_void"
        ),
        m!(
            "../migrations/20260528150000_cash_sessions.sql",
            20260528150000,
            "cash_sessions"
        ),
        m!(
            "../migrations/20260528160000_returns.sql",
            20260528160000,
            "returns"
        ),
        m!(
            "../migrations/20260528162206_stock_base.sql",
            20260528162206,
            "stock_base"
        ),
        m!(
            "../migrations/20260528164730_stock_alerts.sql",
            20260528164730,
            "stock_alerts"
        ),
        m!(
            "../migrations/20260528170337_transfers.sql",
            20260528170337,
            "transfers"
        ),
        m!(
            "../migrations/20260528201442_suppliers_purchases.sql",
            20260528201442,
            "suppliers_purchases"
        ),
        m!(
            "../migrations/20260528204427_verifactu.sql",
            20260528204427,
            "verifactu"
        ),
        m!(
            "../migrations/20260529111906_blind_returns.sql",
            20260529111906,
            "blind_returns"
        ),
        m!(
            "../migrations/20260530133225_week7_perf_indexes.sql",
            20260530133225,
            "week7_perf_indexes"
        ),
        m!(
            "../migrations/20260603110000_tpv_operational_flows.sql",
            20260603110000,
            "tpv_operational_flows"
        ),
        m!(
            "../migrations/20260603120000_refresh_tokens.sql",
            20260603120000,
            "refresh_tokens"
        ),
        m!(
            "../migrations/20260605120000_time_clock_breaks.sql",
            20260605120000,
            "time_clock_breaks"
        ),
        m!(
            "../migrations/20260605163332_saleline_cost_source.sql",
            20260605163332,
            "saleline_cost_source"
        ),
        m!(
            "../migrations/20260605192939_sales_export.sql",
            20260605192939,
            "sales_export"
        ),
        m!(
            "../migrations/20260606080543_user_preference.sql",
            20260606080543,
            "user_preference"
        ),
        m!(
            "../migrations/20260606090657_b2b_wholesale.sql",
            20260606090657,
            "b2b_wholesale"
        ),
        m!(
            "../migrations/20260606092916_api_key.sql",
            20260606092916,
            "api_key"
        ),
        m!(
            "../migrations/20260607150000_sale_client_id.sql",
            20260607150000,
            "sale_client_id"
        ),
        m!(
            "../migrations/20260607220000_stock_batch_fefo.sql",
            20260607220000,
            "stock_batch_fefo"
        ),
        m!(
            "../migrations/20260608120000_store_price.sql",
            20260608120000,
            "store_price"
        ),
        m!(
            "../migrations/20260608140000_feature_flag.sql",
            20260608140000,
            "feature_flag"
        ),
        m!(
            "../migrations/20260608150000_promotion.sql",
            20260608150000,
            "promotion"
        ),
        m!(
            "../migrations/20260609100000_family_archetype.sql",
            20260609100000,
            "family_archetype"
        ),
        m!(
            "../migrations/20260609160000_supplier_price.sql",
            20260609160000,
            "supplier_price"
        ),
        m!(
            "../migrations/20260610200000_store_ops.sql",
            20260610200000,
            "store_ops"
        ),
        m!(
            "../migrations/20260611200000_org_branding.sql",
            20260611200000,
            "org_branding"
        ),
        m!(
            "../migrations/20260616120000_api_key_ttl.sql",
            20260616120000,
            "api_key_ttl"
        ),
        m!(
            "../migrations/20260616120001_rls_with_check.sql",
            20260616120001,
            "rls_with_check"
        ),
        m!(
            "../migrations/20260616120002_userstore_rls.sql",
            20260616120002,
            "userstore_rls"
        ),
        m!(
            "../migrations/20260616130000_cash_movement_approval.sql",
            20260616130000,
            "cash_movement_approval"
        ),
        m!(
            "../migrations/20260620120000_chat.sql",
            20260620120000,
            "chat"
        ),
        m!(
            "../migrations/20260623120000_verifactu_anulacion.sql",
            20260623120000,
            "verifactu_anulacion"
        ),
        m!(
            "../migrations/20260623130000_sale_customer_fiscal.sql",
            20260623130000,
            "sale_customer_fiscal"
        ),
        m!(
            "../migrations/20260629120000_support.sql",
            20260629120000,
            "support"
        ),
    ];

    for m in migrations {
        let applied: Option<(i64,)> =
            sqlx::query_as("SELECT version FROM _sqlx_migrations WHERE version = $1")
                .bind(m.version)
                .fetch_optional(pool)
                .await?;
        if applied.is_some() {
            tracing::debug!(
                version = m.version,
                desc = m.desc,
                "migración ya aplicada, saltando"
            );
            continue;
        }
        tracing::info!(version = m.version, desc = m.desc, "aplicando migración");
        sqlx::raw_sql(m.sql)
            .execute(pool)
            .await
            .map_err(|e| anyhow::anyhow!("migración {} ({}): {}", m.version, m.desc, e))?;
        // checksum/execution_time EXPLÍCITOS (no por DEFAULT): la _sqlx_migrations de
        // prod la creó el sqlx real SIN defaults en esas columnas (NOT NULL), así que
        // omitirlas metía NULL → violación. Este runner no valida checksums (ver arriba),
        // por eso basta un bytea vacío. Robusto en cualquier BD (con o sin defaults).
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) \
             VALUES ($1, $2, true, ''::bytea, 0)",
        )
        .bind(m.version)
        .bind(m.desc)
        .execute(pool)
        .await?;
    }

    tracing::info!("migraciones OK ({} archivos)", migrations.len());
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
