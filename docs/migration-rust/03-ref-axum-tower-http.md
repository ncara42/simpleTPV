# Migración backend a Rust — 03. Referencia Axum 0.8 + tower-http

> Documentación **oficial** recogida vía Context7. Código verbatim de la doc; nada inventado.
> Fuentes: `/tokio-rs/axum` (versión axum_v0_8_4) y `/tower-rs/tower-http`.
> Capa web objetivo para sustituir NestJS + Express.

---

## 1. Setup: Router, rutas y arranque

```rust
use axum::{
    routing::{get, post},
    http::StatusCode,
    Json, Router,
};
use serde::{Deserialize, Serialize};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/", get(root))
        .route("/users", post(create_user));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await;
}

async fn root() -> &'static str { "Hello, World!" }

async fn create_user(Json(payload): Json<CreateUser>) -> (StatusCode, Json<User>) {
    let user = User { id: 1337, username: payload.username };
    (StatusCode::CREATED, Json(user))
}
```

### Rutas con parámetros y modularización (`merge` / `nest`)

```rust
let app = Router::new()
    .route("/users", get(list_users).post(create_user))
    .route("/users/{id}", get(show_user))                       // 0.8: llaves {id}
    .route("/api/{version}/users/{id}/action", delete(do_action))
    .route("/assets/{*path}", get(serve_asset));                // wildcard {*path}

async fn show_user(Path(id): Path<u64>) {}
async fn do_action(Path((version, id)): Path<(String, u64)>) {}

// merge = mismo nivel; nest = prefijo
let api = Router::new()
    .nest("/users", user_routes)
    .nest("/teams", team_routes);
let app = Router::new().nest("/api", api);   // GET /api/users/{id}
```

> Mapea directamente los 32 módulos NestJS a routers `nest`-eados por prefijo (`/sales`, `/stock`, ...).

---

## 2. Extractors

```rust
async fn path(Path(user_id): Path<u32>) {}
async fn query(Query(params): Query<HashMap<String, String>>) {}
async fn headers(headers: HeaderMap) {}
async fn json(Json(payload): Json<Value>) {}          // parsea body JSON
async fn extension(Extension(state): Extension<MyState>) {}  // datos por-request
```

Combinar varios en un handler:

```rust
async fn get_user_things(
    Path(user_id): Path<Uuid>,
    Query(pagination): Query<Pagination>,
) {}
```

**ORDEN CRÍTICO:** los extractors que consumen el body (`Json`, `String`, `Bytes`) deben ir **al final**. State, Method y HeaderMap van antes:

```rust
async fn handler(
    method: Method,
    headers: HeaderMap,
    State(state): State<AppState>,
    body: String,   // consume el body → último
) {}
```

Rechazo tipado del JSON (validación de boundary):

```rust
async fn handler(result: Result<Json<Value>, JsonRejection>) -> Result<Json<Value>, (StatusCode, String)> {
    match result {
        Ok(Json(payload)) => Ok(Json(json!({ "payload": payload }))),
        Err(JsonRejection::MissingJsonContentType(_)) =>
            Err((StatusCode::BAD_REQUEST, "Missing `Content-Type: application/json`".into())),
        Err(_) => Err((StatusCode::BAD_REQUEST, "invalid json".into())),
    }
}
```

---

## 3. Estado compartido (`AppState` + `Arc` + `with_state`)

```rust
#[derive(Clone)]
struct AppState { inner: Arc<InnerState> }      // Clone barato vía Arc

struct InnerState { db: DbPool, config: AppConfig }

let state = AppState { inner: Arc::new(InnerState { db: create_pool().await, config: AppConfig::from_env() }) };

let app = Router::new().route("/users", get(list_users)).with_state(state);

async fn list_users(State(state): State<AppState>) { let db = &state.inner.db; }
```

> `Router<AppState>` = le falta el estado; tras `.with_state(...)` pasa a `Router<()>`, el único tipo que `axum::serve` acepta.
> **Nota de la doc:** `with_state` es global. Para datos derivados de un request (auth/**tenant**) usar `Extension` (ver §4) — encaja con nuestro `TenantContextInterceptor`.

---

## 4. Middleware y extensiones de request (clave para auth + tenant)

`middleware::from_fn` — patrón de autenticación que inyecta datos al handler:

```rust
async fn auth(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let header = req.headers().get(http::header::AUTHORIZATION).and_then(|h| h.to_str().ok());
    let header = header.ok_or(StatusCode::UNAUTHORIZED)?;
    if let Some(current_user) = authorize_current_user(header).await {
        req.extensions_mut().insert(current_user);   // pasa datos al handler
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
async fn handler(Extension(current_user): Extension<CurrentUser>) {}
let app = Router::new().route("/", get(handler)).route_layer(middleware::from_fn(auth));
```

`from_fn_with_state` cuando el middleware necesita el `AppState` (p.ej. el pool para verificar JWT/usuario activo):

```rust
async fn my_middleware(State(state): State<AppState>, request: Request, next: Next) -> Response {
    next.run(request).await
}
.route_layer(middleware::from_fn_with_state(state.clone(), my_middleware))
```

**Extractor de autenticación reutilizable** (`FromRequestParts`) — equivalente a un guard:

```rust
impl<S: Send + Sync> FromRequestParts<S> for AuthenticatedUser {
    type Rejection = Response;
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // verificar JWT, poblar usuario/tenant; rechazar con Response
    }
}
async fn handler(user: AuthenticatedUser) {}   // se usa como extractor
```

> **Estrategia de tenant en Rust:** middleware `from_fn_with_state` verifica el JWT, extrae `organization_id` y lo coloca en request extensions; el handler/capa de datos lo lee y lo pasa a la transacción RLS. Combinar con `tokio::task_local!` (ver doc Tokio) para emular `AsyncLocalStorage`.

---

## 5. Manejo de errores (`IntoResponse` + `AppError`)

Patrón recomendado para REST (combina piezas de `error_handling.md` y `response.md`):

```rust
pub enum AppError {
    NotFound(String),
    Unauthorized,
    BadRequest(String),
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound(m)   => (StatusCode::NOT_FOUND, m),
            AppError::Unauthorized  => (StatusCode::UNAUTHORIZED, "Unauthorized".into()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            AppError::Internal(err) => {
                tracing::error!("internal error: {err}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".into())
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

// `?` convierte cualquier error en AppError::Internal
impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(err: E) -> Self { AppError::Internal(err.into()) }
}

async fn get_user(Path(id): Path<u64>) -> Result<Json<User>, AppError> {
    let user = find_user(id).await.ok_or_else(|| AppError::NotFound(format!("user {id}")))?;
    Ok(Json(user))
}
```

> Este `AppError` reemplaza el `PrismaExceptionFilter`: el mapeo de violaciones únicas/FK (SQLx `ErrorKind`) → 409/404 se hace en `From`/`into_response`.

---

## 6. tower-http: stack de producción

```rust
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, timeout::TimeoutLayer,
    trace::{TraceLayer, DefaultMakeSpan, DefaultOnResponse},
    request_id::MakeRequestUuid, ServiceBuilderExt, LatencyUnit,
};

let sensitive: Arc<[_]> = vec![header::AUTHORIZATION, header::COOKIE].into();

let middleware = ServiceBuilder::new()
    .sensitive_request_headers(sensitive.clone())        // oculta Authorization/Cookie de logs
    .layer(TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().include_headers(true))
        .on_response(DefaultOnResponse::new().latency_unit(LatencyUnit::Micros)))
    .sensitive_response_headers(sensitive)
    .set_x_request_id(MakeRequestUuid).propagate_x_request_id()  // X-Request-Id
    .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_secs(30)))
    .layer(CompressionLayer::new())                       // gzip/br/zstd según Accept-Encoding
    .layer(CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|o, _| o.as_bytes().ends_with(b".tudominio.com")))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_credentials(true)
        .max_age(Duration::from_secs(3600)));

let app = Router::new().route("/health", get(health)).layer(middleware);
```

Headers de seguridad (sustituye parte de Helmet):

```rust
use tower_http::set_header::SetResponseHeaderLayer;
ServiceBuilder::new()
    .layer(SetResponseHeaderLayer::if_not_present(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff")))
    .layer(SetResponseHeaderLayer::overriding(header::SERVER, HeaderValue::from_static("")));
```

> CSP / X-Frame-Options / HSTS → añadir con `SetResponseHeaderLayer` (no hay un "Helmet" único; se componen capas). A confirmar cada header concreto contra doc al implementar.

---

## 7. Graceful shutdown (SIGTERM de Docker/Dokploy)

```rust
axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await;

async fn shutdown_signal() {
    let ctrl_c = async { signal::ctrl_c().await.expect("ctrl+c handler"); };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("signal handler").recv().await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}
```

---

## 8. Diferencias 0.7 → 0.8 (relevantes al portar)

| 0.7             | 0.8               |
| --------------- | ----------------- |
| `/users/:id`    | `/users/{id}`     |
| `/assets/*path` | `/assets/{*path}` |

Usar `:`/`*` en 0.8 **provoca panic en runtime** salvo `Router::without_v07_checks()` (escotilla para migración gradual, desaconsejada en código nuevo). El cambio `axum::Server` → `axum::serve` + `TcpListener` ya ocurrió en 0.7.

---

## Fuentes (Context7)

- `/tokio-rs/axum` (axum_v0_8_4): `README.md`, `docs/routing/{route,merge,nest,with_state,without_v07_checks}.md`, `docs/{extract,middleware,error_handling,response}.md`, `examples/graceful-shutdown`, `middleware/from_fn.rs`.
- `/tower-rs/tower-http`: `llms.txt`, `_autodocs/{quick-reference,cors-middleware,types-reference,integration-guide}.md`.
