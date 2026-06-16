//! Ensamblado del router + stack de producción (doc 03 §6).

use std::sync::Arc;
use std::time::Duration;

use axum::http::{header, HeaderValue, StatusCode};
use axum::routing::{get, post, put};
use axum::Router;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::SmartIpKeyExtractor;
use tower_governor::GovernorLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::sensitive_headers::SetSensitiveRequestHeadersLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::products;
use crate::routes;
use crate::state::AppState;
use crate::stock;

const REQUEST_TIMEOUT_SECS: u64 = 30;
// Límite de body (DoS backstop; NestJS usaba 512kb). 64kb sobra para JSON de API.
const MAX_BODY_BYTES: usize = 64 * 1024;
// Login: 5/min/IP (SEC, doc 06). Token bucket: burst 5 + repone 1 cada 12s.
const LOGIN_REFILL_SECS: u64 = 12;
const LOGIN_BURST: u32 = 5;

pub fn build_router(state: AppState) -> Router {
    let login_rl = GovernorConfigBuilder::default()
        .period(Duration::from_secs(LOGIN_REFILL_SECS))
        .burst_size(LOGIN_BURST)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("config de rate-limit de login válida");

    let auth = Router::new()
        .route(
            "/login",
            post(routes::login).route_layer(GovernorLayer {
                config: Arc::new(login_rl),
            }),
        )
        // TODO(hardening): rate-limit también /refresh (NestJS 10/min) — diferido
        // (los tests por cookie tendrían que aportar X-Forwarded-For); bajo riesgo
        // porque el refresh exige un token válido y rotatorio.
        .route("/refresh", post(routes::refresh))
        .route("/logout", post(routes::logout));

    // TODO(integración frontends): CORS fail-fast por env (CORS_ORIGINS) +
    // allow_credentials, antes de exponer la API a los SPA (doc 06 SEC-18).
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
        .route("/stock/product/{product_id}", get(stock::by_product))
        .route("/health", get(routes::health))
        .route("/ready", get(routes::ready))
        .with_state(state)
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
