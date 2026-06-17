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

use crate::api_keys;
use crate::branding;
use crate::cash_sessions;
use crate::customers;
use crate::devices;
use crate::feature_flags;
use crate::me;
use crate::product_families;
use crate::products;
use crate::promotions;
use crate::public;
use crate::purchases;
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
// API pública: 30/min/IP (paridad con el Throttle del PublicController, estricto
// frente a los 120 del API privado). Token bucket: burst 30 + repone 1 cada 2s.
const PUBLIC_REFILL_SECS: u64 = 2;
const PUBLIC_BURST: u32 = 30;
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
    let public_rl = GovernorConfigBuilder::default()
        .period(Duration::from_secs(PUBLIC_REFILL_SECS))
        .burst_size(PUBLIC_BURST)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("config de rate-limit de la API pública válida");

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
        // Recursos del usuario autenticado (Fase 4, #154): perfil, tiendas (selector
        // TPV), feature flags efectivos y preferencias. Rutas estáticas antes de
        // `/me/preferences/{key}`.
        .route("/me", get(me::profile))
        .route("/me/stores", get(me::stores))
        .route("/me/features", get(me::features))
        .route("/me/preferences", get(me::preferences_get))
        .route("/me/preferences/{key}", put(me::preferences_set))
        // Gestión de feature flags (Fase 4, #154 / #127 B): ADMIN/MANAGER.
        .route(
            "/feature-flags",
            get(feature_flags::list).put(feature_flags::set_flag),
        )
        .route("/feature-flags/{key}", delete(feature_flags::clear_flag))
        // API keys (Fase 4, #154, IT-18): gestión solo ADMIN.
        .route("/api-keys", get(api_keys::list).post(api_keys::generate))
        .route("/api-keys/{id}", delete(api_keys::revoke))
        // API pública (Fase 4, #154, IT-18): autenticada con X-API-Key (sin JWT) y
        // con rate limit estricto (30/min/IP) propio.
        .route(
            "/public/stock",
            get(public::stock).route_layer(GovernorLayer {
                config: Arc::new(public_rl),
            }),
        )
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
        // Marca corporativa (Fase 4, #154, U-08): lectura abierta a la sesión,
        // escritura solo ADMIN.
        .route(
            "/organization/branding",
            get(branding::get).patch(branding::update),
        )
        // Dispositivos TPV (Fase 4, #154): rutas estáticas (current/pair) antes de
        // `{id}`. Estado/emparejado cualquier rol; alta/listado/revocado ADMIN/MANAGER.
        .route("/devices/current", get(devices::current))
        .route("/devices/pair", post(devices::pair))
        .route("/devices", get(devices::find_all).post(devices::create))
        .route("/devices/{id}", delete(devices::revoke))
        // Familias de producto (Fase 4, #154): árbol jerárquico. Lectura abierta a
        // la sesión; escritura solo ADMIN.
        .route(
            "/product-families",
            get(product_families::find_tree).post(product_families::create),
        )
        .route(
            "/product-families/{id}",
            patch(product_families::update).delete(product_families::remove),
        )
        // Clientes B2B (Fase 4, #154, IT-17): función de central → ADMIN/MANAGER.
        .route("/customers", get(customers::list).post(customers::create))
        .route(
            "/customers/{id}",
            patch(customers::update).delete(customers::remove),
        )
        // Promociones (Fase 4, #154): catálogo de central. Lectura abierta a la
        // sesión; escritura ADMIN/MANAGER.
        .route(
            "/promotions",
            get(promotions::find_all).post(promotions::create),
        )
        .route(
            "/promotions/{id}",
            get(promotions::find_one)
                .patch(promotions::update)
                .delete(promotions::remove),
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
        // Compras (Fase 3): pedidos a proveedor. `/suggest` estática antes de `/{id}`.
        .route(
            "/purchase-orders",
            post(purchases::create).get(purchases::list),
        )
        .route("/purchase-orders/suggest", post(purchases::suggest))
        .route("/purchase-orders/{id}", get(purchases::get_one))
        .route("/purchase-orders/{id}/export", get(purchases::export))
        .route("/purchase-orders/{id}/confirm", post(purchases::confirm))
        .route("/purchase-orders/{id}/receive", post(purchases::receive))
        // Caja (Fase 3, #145/#146): apertura/cierre + flujo de aprobación. Rutas
        // estáticas (open/closed/current/movements/*) y `{id}` conviven (axum
        // prioriza el segmento estático).
        .route("/cash-sessions/open", post(cash_sessions::open))
        .route("/cash-sessions/closed", get(cash_sessions::list_closed))
        .route("/cash-sessions/current", get(cash_sessions::current))
        .route(
            "/cash-sessions/movements/pending",
            get(cash_sessions::list_pending),
        )
        .route(
            "/cash-sessions/movements/{mov_id}/approve",
            post(cash_sessions::approve),
        )
        .route(
            "/cash-sessions/movements/{mov_id}/deny",
            post(cash_sessions::deny),
        )
        .route("/cash-sessions/{id}/close", post(cash_sessions::close))
        .route(
            "/cash-sessions/{id}/movements",
            get(cash_sessions::movements).post(cash_sessions::create_movement),
        )
        .route(
            "/cash-sessions/{id}/movements/request",
            post(cash_sessions::request_movement),
        )
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
