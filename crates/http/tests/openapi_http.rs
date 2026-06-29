//! Integración HTTP del documento OpenAPI (#155): `GET /openapi.json` es público
//! y devuelve un documento OpenAPI 3.x con las rutas anotadas y el esquema de
//! seguridad Bearer JWT.

use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use secrecy::SecretString;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower::ServiceExt;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

async fn pool(env: &str, default: &str) -> PgPool {
    let url = std::env::var(env).unwrap_or_else(|_| default.to_owned());
    PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .expect("conectar a Postgres")
}

async fn build() -> Router {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(
        admin.clone(),
        AuthConfig {
            access_secret: SecretString::from("test-access-secret".to_owned()),
            refresh_secret: SecretString::from("test-refresh-secret".to_owned()),
            access_ttl: Duration::from_secs(900),
            refresh_ttl: Duration::from_secs(604_800),
        },
    );
    build_router(AppState::new(
        auth,
        user_state,
        db,
        admin,
        false,
        Vec::new(),
        None,
        None,
    ))
}

#[tokio::test]
async fn health_es_publico_sin_token() {
    // app-bootstrap (paridad NestJS): /health responde 200 sin autenticación.
    // El rechazo 401 sin token de las rutas protegidas lo cubre fase3_roles_http.
    let app = build().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK, "/health es público");
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..], b"ok");
}

#[tokio::test]
async fn openapi_json_documenta_rutas_y_seguridad() {
    let app = build().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK, "openapi.json es público");

    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let doc: serde_json::Value = serde_json::from_slice(&bytes).expect("OpenAPI JSON válido");

    // Documento OpenAPI 3.x con info.
    assert!(
        doc["openapi"]
            .as_str()
            .unwrap_or_default()
            .starts_with("3."),
        "versión OpenAPI 3.x: {}",
        doc["openapi"]
    );
    assert_eq!(doc["info"]["title"], "simpleTPV API");

    // Rutas anotadas presentes.
    let paths = &doc["paths"];
    assert!(paths.get("/auth/login").is_some(), "documenta /auth/login");
    assert!(paths.get("/health").is_some(), "documenta /health");
    assert!(paths.get("/ready").is_some(), "documenta /ready");

    // login: request body + respuestas 200/401.
    let login = &doc["paths"]["/auth/login"]["post"];
    assert!(login["requestBody"].is_object(), "login lleva requestBody");
    assert!(login["responses"]["200"].is_object());
    assert!(login["responses"]["401"].is_object());

    // Esquema de seguridad Bearer JWT.
    let scheme = &doc["components"]["securitySchemes"]["bearer_jwt"];
    assert_eq!(scheme["type"], "http");
    assert_eq!(scheme["scheme"], "bearer");
    assert_eq!(scheme["bearerFormat"], "JWT");
}
