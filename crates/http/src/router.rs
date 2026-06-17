//! Ensamblado del router + stack de producción (doc 03 §6).

use std::sync::Arc;
use std::time::Duration;

use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::routing::{delete, get, patch, post, put};
use axum::Router;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::SmartIpKeyExtractor;
use tower_governor::GovernorLayer;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::sensitive_headers::SetSensitiveRequestHeadersLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::products;
use crate::returns;
use crate::routes;
use crate::sales;
use crate::sales_export;
use crate::state::AppState;
use crate::stock;
use crate::stores;
use crate::suppliers;
use crate::time_clock;
use crate::transfers;
use crate::users;

const REQUEST_TIMEOUT_SECS: u64 = 30;
// Límite de body (DoS backstop; NestJS usaba 512kb). 64kb sobra para JSON de API.
const MAX_BODY_BYTES: usize = 64 * 1024;
// Login: 5/min/IP (SEC, doc 06). Token bucket: burst 5 + repone 1 cada 12s.
const LOGIN_REFILL_SECS: u64 = 12;
const LOGIN_BURST: u32 = 5;
// Refresh: 10/min/IP (paridad con NestJS). Token bucket: burst 10 + repone 1 cada 6s.
const REFRESH_REFILL_SECS: u64 = 6;
const REFRESH_BURST: u32 = 10;
// Cacheo de preflight CORS en el navegador (1h): reduce OPTIONS repetidos.
const CORS_MAX_AGE_SECS: u64 = 3600;

pub fn build_router(state: AppState) -> Router {
    let login_rl = GovernorConfigBuilder::default()
        .period(Duration::from_secs(LOGIN_REFILL_SECS))
        .burst_size(LOGIN_BURST)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("config de rate-limit de login válida");
    let refresh_rl = GovernorConfigBuilder::default()
        .period(Duration::from_secs(REFRESH_REFILL_SECS))
        .burst_size(REFRESH_BURST)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("config de rate-limit de refresh válida");

    // CORS desde la config (orígenes resueltos con fail-fast en prod, SEC-18).
    // Con `allow_credentials` los orígenes deben ser explícitos (nunca `Any`).
    let cors = build_cors(state.cors_origins());

    let auth = Router::new()
        .route(
            "/login",
            post(routes::login).route_layer(GovernorLayer {
                config: Arc::new(login_rl),
            }),
        )
        // Rate-limit del refresh: exige IP (X-Forwarded-For tras proxy, o la del
        // peer vía ConnectInfo). 10/min/IP, defensa ante abuso de rotación.
        .route(
            "/refresh",
            post(routes::refresh).route_layer(GovernorLayer {
                config: Arc::new(refresh_rl),
            }),
        )
        .route("/logout", post(routes::logout));

    Router::new()
        .nest("/auth", auth)
        .route("/me", get(routes::me))
        // Catálogo (Fase 2). `/import` y `/barcode/{code}` son estáticas y no
        // colisionan con `/{id}` (axum prioriza el segmento estático).
        .route("/products", get(products::list).post(products::create))
        .route("/products/import", post(products::import))
        .route("/products/barcode/{code}", get(products::get_by_barcode))
        .route(
            "/products/{id}",
            get(products::get_one)
                .patch(products::update)
                .delete(products::remove),
        )
        // Stock (Fase 2, slice A): ajustes/mínimos/recuento + caducidad/movimientos.
        .route("/stock/min", put(stock::set_min))
        .route("/stock/adjust", post(stock::adjust))
        .route("/stock/inventory-count", post(stock::inventory_count))
        .route("/stock/expiring", get(stock::expiring))
        .route("/stock/movements", get(stock::movements))
        // Stock (slice B): lecturas dashboard (byStore/to-reorder/byProduct/alerts).
        .route("/stock", get(stock::by_store))
        .route("/stock/to-reorder", get(stock::to_reorder))
        .route("/stock/alerts", get(stock::alerts))
        .route("/stock/global", get(stock::global))
        .route("/stock/product/{product_id}", get(stock::by_product))
        // Ventas (Fase 2, slice 1): crear, reservar bloque, listar, consultar.
        .route("/sales", post(sales::create).get(sales::list))
        .route("/sales/ticket-block", post(sales::ticket_block))
        // Export (#152): rutas estáticas `/sales/export*` antes que `/sales/{id}`.
        .route("/sales/export", post(sales_export::request_export))
        .route(
            "/sales/export/accounting",
            post(sales_export::request_accounting_export),
        )
        .route("/sales/export/{id}", get(sales_export::get_export))
        .route("/sales/export/{id}/download", get(sales_export::download))
        .route("/sales/by-ticket/{ticket}", get(sales::by_ticket))
        .route("/sales/{id}/ticket", get(sales::ticket))
        .route("/sales/{id}/receipt", get(sales::receipt))
        .route("/sales/{id}/void", post(sales::void))
        // Devoluciones (Fase 2): con ticket + ciega (PIN) + listado.
        .route("/returns", post(returns::create).get(returns::list))
        .route("/returns/blind", post(returns::create_blind))
        // Usuarios (Fase 3): gestión solo ADMIN. `/import` estática antes de `/{id}`.
        .route("/users", get(users::list).post(users::create))
        .route("/users/import", post(users::import_csv))
        .route("/users/{id}", patch(users::update).delete(users::remove))
        .route("/users/{id}/pin", put(users::set_pin))
        .route("/users/{id}/stores", put(users::assign_stores))
        // Proveedores + tarifas (Fase 3). `/comparison` e `/import` estáticas
        // antes de `/{id}`.
        .route("/suppliers", get(suppliers::list).post(suppliers::create))
        .route(
            "/suppliers/{id}",
            patch(suppliers::update)
                .delete(suppliers::remove)
                .get(suppliers::get_one),
        )
        .route(
            "/supplier-prices",
            get(suppliers::list_prices).put(suppliers::upsert_price),
        )
        .route("/supplier-prices/comparison", get(suppliers::comparison))
        .route("/supplier-prices/import", post(suppliers::import_prices))
        .route("/supplier-prices/{id}", delete(suppliers::remove_price))
        // Tiendas (Fase 3): CRUD ADMIN + ops/central + precios por tienda. Param
        // `{id}` consistente para no chocar en el árbol de rutas.
        .route("/stores", get(stores::list).post(stores::create))
        .route("/stores/{id}", patch(stores::update).delete(stores::remove))
        .route("/stores/{id}/central", patch(stores::set_central))
        .route("/stores/{id}/ops", patch(stores::update_ops))
        .route(
            "/stores/{id}/prices",
            get(stores::list_prices).put(stores::set_price),
        )
        .route("/stores/{id}/prices/import", post(stores::import_prices))
        .route(
            "/stores/{id}/prices/{product_id}",
            delete(stores::remove_price),
        )
        // Control horario (Fase 3): fichaje + estado + historial agregado.
        .route("/time-clock", post(time_clock::create))
        .route("/time-clock/current", get(time_clock::current))
        .route("/time-clock/today", get(time_clock::today))
        .route("/time-clock/history", get(time_clock::history))
        .route("/time-clock/history/me", get(time_clock::history_me))
        .route("/time-clock/history-all", get(time_clock::history_all))
        .route("/time-clock/entries", get(time_clock::entries))
        // Traspasos (Fase 3): DRAFT→SENT→RECEIVED→CLOSED.
        .route("/transfers", post(transfers::create).get(transfers::list))
        .route("/transfers/{id}", get(transfers::get_one))
        .route("/transfers/{id}/send", post(transfers::send))
        .route("/transfers/{id}/receive", post(transfers::receive))
        .route("/transfers/{id}/close", post(transfers::close))
        .route("/health", get(routes::health))
        .route("/ready", get(routes::ready))
        .with_state(state)
        // CORS para los SPA (TPV y backoffice). Antes que las cabeceras de
        // seguridad para que la respuesta de preflight las arrastre también.
        .layer(cors)
        // Capas (outermost = la última). Cabeceras de seguridad (sustituye parte
        // de Helmet): nosniff, frame DENY, referrer-policy.
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        // HSTS: solo lo honra el navegador sobre HTTPS; inocuo sobre http.
        .layer(SetResponseHeaderLayer::if_not_present(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        // Límite de tamaño del body (backstop DoS).
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(REQUEST_TIMEOUT_SECS),
        ))
        .layer(TraceLayer::new_for_http())
        // Outermost: marca Authorization/Cookie como sensibles ANTES de que el
        // TraceLayer registre, para que no aparezcan en logs.
        .layer(SetSensitiveRequestHeadersLayer::new([
            header::AUTHORIZATION,
            header::COOKIE,
        ]))
}

/// Construye la capa CORS con orígenes explícitos + credenciales. Los orígenes
/// inválidos (no parseables como `HeaderValue`) se descartan con aviso: la lista
/// ya se validó al resolver la config, esto es defensa en profundidad.
fn build_cors(origins: &[String]) -> CorsLayer {
    let allowed: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|o| match o.parse::<HeaderValue>() {
            Ok(v) => Some(v),
            Err(_) => {
                tracing::error!(origin = %o, "origen CORS inválido, ignorado");
                None
            }
        })
        .collect();

    if allowed.is_empty() {
        // En prod la config ya habría abortado el arranque (SEC-18); aquí solo
        // puede ocurrir en dev/test. Avisar para no diagnosticar a ciegas un
        // "todas las peticiones cross-origin rechazadas".
        tracing::warn!(
            "ningún origen CORS válido configurado: se rechazarán las peticiones cross-origin"
        );
    }

    CorsLayer::new()
        .allow_origin(allowed)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_credentials(true)
        .max_age(Duration::from_secs(CORS_MAX_AGE_SECS))
}
