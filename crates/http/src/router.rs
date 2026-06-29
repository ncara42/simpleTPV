//! Ensamblado del router + stack de producción (doc 03 §6).

use std::sync::Arc;
use std::time::Duration;

use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::routing::{delete, get, patch, post, put};
use axum::Router;
use std::net::{IpAddr, Ipv4Addr};

use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::{KeyExtractor, SmartIpKeyExtractor};
use tower_governor::{GovernorError, GovernorLayer};
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::sensitive_headers::SetSensitiveRequestHeadersLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::api_keys;
use crate::audit;
use crate::branding;
use crate::cash_sessions;
use crate::chat;
use crate::customers;
use crate::dashboard;
use crate::devices;
use crate::events;
use crate::feature_flags;
use crate::me;
use crate::openapi;
use crate::price_lists;
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
use crate::support;
use crate::time_clock;
use crate::transfers;
use crate::users;
use crate::verifactu;
use crate::wholesale_orders;
use crate::z_report;

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
// Import CSV de usuarios: 2/min/IP (paridad NestJS @Throttle, DOS-03). Hashea hasta
// 500 bcrypt por petición (CPU-bound) → límite mucho más estricto que el global.
// Token bucket: burst 2 + repone 1 cada 30s.
const USERS_IMPORT_REFILL_SECS: u64 = 30;
const USERS_IMPORT_BURST: u32 = 2;
// Rate-limit GLOBAL del API privado (paridad con el ThrottlerGuard global de NestJS,
// que limitaba TODA ruta autenticada). Configurable por env `THROTTLE_LIMIT`
// (peticiones/min/IP); default 120. Los route_layer más estrictos (login/refresh/
// public) siguen mandando sobre sus rutas. Backstop anti-scraping/enumeración/DoS.
const DEFAULT_THROTTLE_PER_MIN: u32 = 120;
// Cacheo de preflight CORS en el navegador (1h): reduce OPTIONS repetidos.
const CORS_MAX_AGE_SECS: u64 = 3600;

/// Extractor de clave del rate-limit GLOBAL. Reusa la lógica de `SmartIpKeyExtractor`
/// (X-Forwarded-For / X-Real-Ip / IP del peer) pero, si no hay ninguna fuente —p.ej.
/// el healthcheck local del contenedor (curl directo, sin proxy) o un test con
/// `oneshot`—, cae a una clave fija en vez de devolver `500 Unable To Extract Key`.
/// Solo lo usa el limitador global; los de auth/public siguen con `SmartIp` estricto.
#[derive(Clone)]
struct FallbackIpKeyExtractor;

impl KeyExtractor for FallbackIpKeyExtractor {
    type Key = IpAddr;

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        Ok(SmartIpKeyExtractor
            .extract(req)
            .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED)))
    }
}

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
    // Rate-limit global: N/min/IP (env `THROTTLE_LIMIT`, default 120). Token bucket:
    // burst N + repone 1 token cada (60/N) segundos.
    let throttle_per_min = std::env::var("THROTTLE_LIMIT")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(DEFAULT_THROTTLE_PER_MIN);
    let global_rl = GovernorConfigBuilder::default()
        .period(Duration::from_nanos(
            60_000_000_000 / throttle_per_min as u64,
        ))
        .burst_size(throttle_per_min)
        .key_extractor(FallbackIpKeyExtractor)
        .finish()
        .expect("config de rate-limit global válida");
    let users_import_rl = GovernorConfigBuilder::default()
        .period(Duration::from_secs(USERS_IMPORT_REFILL_SECS))
        .burst_size(USERS_IMPORT_BURST)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("config de rate-limit de import de usuarios válida");

    // CORS desde la config (orígenes resueltos con fail-fast en prod, SEC-18).
    // Con `allow_credentials` los orígenes deben ser explícitos (nunca `Any`).
    let cors = build_cors(state.cors_origins());
    // Estado para el middleware de auditoría (#156): clon barato (Arc) antes de
    // que `with_state` consuma el original.
    let audit_state = state.clone();

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
        // Webhook de Telegram para el soporte (Ayuda): SIN JWT (lo llama Telegram).
        // Se autentica con el secreto compartido en la cabecera
        // `X-Telegram-Bot-Api-Secret-Token`, validado dentro del handler.
        .route("/telegram/webhook", post(support::telegram_webhook))
        // VeriFactu (Fase 5, #155): estado y reintento de registros (ADMIN/MANAGER).
        // El envío real lo procesa el worker de fondo (cola Postgres SKIP LOCKED).
        .route("/verifactu/records", get(verifactu::list))
        .route("/verifactu/records/{id}/retry", post(verifactu::retry))
        // Config VERI*FACTU por comercio (#156): modalidad, razón social, exención,
        // entorno AEAT. Solo ADMIN.
        .route(
            "/verifactu/config",
            get(verifactu::config_get).put(verifactu::config_put),
        )
        // Certificado de cliente (modo DIRECT_OWN_CERT, #156): subida cifrada + estado.
        .route(
            "/verifactu/certificate",
            get(verifactu::cert_status).put(verifactu::cert_put),
        )
        .route("/verifactu/verify", get(verifactu::verify_chain))
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
        // `/customers/ledger` (agregado de cartera) antes que `/customers/{id}`.
        .route("/customers", get(customers::list).post(customers::create))
        .route("/customers/ledger", get(customers::ledger))
        .route(
            "/customers/{id}",
            patch(customers::update).delete(customers::remove),
        )
        // Tarifas B2B (Fase 4, #154, IT-17): listas de precios + items. ADMIN/MANAGER.
        .route(
            "/price-lists",
            get(price_lists::list).post(price_lists::create),
        )
        .route(
            "/price-lists/{id}",
            get(price_lists::get)
                .patch(price_lists::update)
                .delete(price_lists::remove),
        )
        .route("/price-lists/{id}/items", put(price_lists::set_item))
        .route(
            "/price-lists/{id}/items/{product_id}",
            delete(price_lists::remove_item),
        )
        // Pedidos mayoristas B2B (Fase 4, #154, IT-17c): salientes con precio
        // congelado por línea. ADMIN/MANAGER. `/{id}/status` antes de `/{id}`.
        .route(
            "/wholesale-orders",
            get(wholesale_orders::list).post(wholesale_orders::create),
        )
        .route(
            "/wholesale-orders/{id}/status",
            patch(wholesale_orders::update_status),
        )
        .route(
            "/wholesale-orders/{id}/collect",
            post(wholesale_orders::collect),
        )
        .route("/wholesale-orders/{id}", get(wholesale_orders::get))
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
        // Estadísticas embebidas de Ventas (S-10): serie temporal + comparativa.
        // Ruta estática antes de `/sales/{id}`; mismo guard de sesión que `/sales`.
        .route("/sales/stats", get(sales::stats))
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
        // Cobro (cuentas por cobrar): registra el pago de una factura a crédito.
        .route("/sales/{id}/collect", post(sales::collect))
        // Devoluciones (Fase 2): con ticket + ciega (PIN) + listado.
        .route("/returns", post(returns::create).get(returns::list))
        .route("/returns/blind", post(returns::create_blind))
        // Usuarios (Fase 3): gestión solo ADMIN. `/import` estática antes de `/{id}`.
        .route("/users", get(users::list).post(users::create))
        .route(
            "/users/import",
            post(users::import_csv).route_layer(GovernorLayer {
                config: Arc::new(users_import_rl),
            }),
        )
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
        .route(
            "/transfers/{id}/attachments",
            post(transfers::add_attachment).get(transfers::list_attachments),
        )
        .route(
            "/transfers/{id}/messages",
            post(transfers::add_message).get(transfers::list_messages),
        )
        .route(
            "/transfers/{id}/messages/{messageId}",
            patch(transfers::update_message).delete(transfers::delete_message),
        )
        .route(
            "/transfers/{id}/resolve-incident",
            post(transfers::resolve_incident),
        )
        // Pedidos de tienda (Fase 4, #154): ALIAS de traspasos en otra ruta — el
        // StoreOrdersController de NestJS delega entero en TransfersService con los
        // mismos DTOs. Mismos handlers, mismas reglas de rol.
        .route(
            "/store-orders",
            post(transfers::create).get(transfers::list),
        )
        .route("/store-orders/{id}", get(transfers::get_one))
        .route("/store-orders/{id}/send", post(transfers::send))
        .route("/store-orders/{id}/receive", post(transfers::receive))
        .route("/store-orders/{id}/close", post(transfers::close))
        .route(
            "/store-orders/{id}/attachments",
            post(transfers::add_attachment).get(transfers::list_attachments),
        )
        .route(
            "/store-orders/{id}/messages",
            post(transfers::add_message).get(transfers::list_messages),
        )
        .route(
            "/store-orders/{id}/messages/{messageId}",
            patch(transfers::update_message).delete(transfers::delete_message),
        )
        .route(
            "/store-orders/{id}/resolve-incident",
            post(transfers::resolve_incident),
        )
        // Cierre Z (Fase 4, #124): arqueo fiscal diario por tienda. ADMIN/MANAGER.
        .route("/z-report", get(z_report::get))
        // Dashboard de KPIs (Fase 4, #154): solo central (ADMIN/MANAGER), lectura.
        // Portados sales-today y sales-kpis; el resto de KPIs llega después.
        .route("/dashboard/sales-today", get(dashboard::sales_today))
        .route("/dashboard/sales-kpis", get(dashboard::sales_kpis))
        .route(
            "/dashboard/sales-by-family",
            get(dashboard::sales_by_family),
        )
        .route("/dashboard/sales-by-hour", get(dashboard::sales_by_hour))
        .route("/dashboard/sales-by-day", get(dashboard::sales_by_day))
        .route(
            "/dashboard/discount-by-employee",
            get(dashboard::discount_by_employee),
        )
        .route(
            "/dashboard/sales-by-employee",
            get(dashboard::sales_by_employee),
        )
        .route("/dashboard/sales-by-store", get(dashboard::sales_by_store))
        .route("/dashboard/margin-kpis", get(dashboard::margin_kpis))
        .route("/dashboard/stockout-kpis", get(dashboard::stockout_kpis))
        .route(
            "/dashboard/product-rankings",
            get(dashboard::product_rankings),
        )
        .route(
            "/dashboard/product-rotation",
            get(dashboard::product_rotation),
        )
        .route(
            "/dashboard/archetype-rotation",
            get(dashboard::archetype_rotation),
        )
        // Recuento diario del TPV (Fase 4, #154): variante de sales-today accesible
        // a CLERK pero acotada a SU tienda (SEC-01). Ruta propia `tpv/dashboard`.
        .route(
            "/tpv/dashboard/sales-today",
            get(dashboard::tpv_sales_today),
        )
        // Chat agente (#188): ADMIN/MANAGER. SSE para el turno de streaming;
        // rutas REST para historial, uso y gestión de conversaciones.
        .route("/chat/stream", post(chat::stream))
        .route("/chat/conversations", get(chat::list_conversations))
        .route("/chat/conversations/{id}/finalize", post(chat::finalize))
        .route(
            "/chat/conversations/{id}/canvas-result",
            post(chat::canvas_result),
        )
        .route(
            "/chat/conversations/{id}/after/{message_id}",
            delete(chat::prune_after),
        )
        .route("/chat/conversations/{id}/messages", get(chat::get_messages))
        .route(
            "/chat/conversations/{id}/usage",
            get(chat::get_conversation_usage),
        )
        .route(
            "/chat/conversations/{id}",
            delete(chat::delete_conversation),
        )
        .route("/chat/models", get(chat::list_models))
        .route("/chat/usage", get(chat::get_org_usage))
        // Soporte (Ayuda): sistema de tickets. Cualquier rol autenticado; cada
        // usuario ve los suyos. La IA triagea y, si no puede, escala al tema de
        // Telegram del ticket.
        .route(
            "/support/tickets",
            get(support::list_tickets).post(support::create_ticket),
        )
        .route(
            "/support/tickets/{id}/messages",
            get(support::get_ticket_messages).post(support::send_message),
        )
        .route("/support/tickets/{id}/close", post(support::close_ticket))
        // Eventos en tiempo real (Fase 4, #32): stream SSE filtrado por tenant del
        // JWT. Cualquier rol; tope de conexiones por usuario (SEC-03).
        .route("/events", get(events::stream))
        .route("/health", get(routes::health))
        .route("/ready", get(routes::ready))
        // Documento OpenAPI (#155): público, sin auth.
        .route("/openapi.json", get(openapi::openapi_json))
        .with_state(state)
        // Auditoría (#156, SEC-22): capa MÁS INTERNA, ve el estado real del
        // handler (2xx) y registra cada mutación en AuditLog. Va dentro del
        // timeout para no auditar 408 sintéticos.
        .layer(axum::middleware::from_fn_with_state(
            audit_state,
            audit::record,
        ))
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
        // HSTS: solo lo honra el navegador sobre HTTPS; inocuo sobre http. Con
        // `preload` para entrar en la lista HSTS preload de los navegadores (M-03).
        .layer(SetResponseHeaderLayer::if_not_present(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        ))
        // Permissions-Policy (M-03): desactiva APIs del navegador que el API no usa.
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
        ))
        // Límite de tamaño del body (backstop DoS).
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(REQUEST_TIMEOUT_SECS),
        ))
        // Rate-limit global del API privado (paridad ThrottlerGuard de NestJS).
        // Outer respecto al timeout/handler: rechaza con 429 antes de hacer trabajo;
        // inner respecto al TraceLayer: las peticiones limitadas se siguen trazando.
        .layer(GovernorLayer {
            config: Arc::new(global_rl),
        })
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
