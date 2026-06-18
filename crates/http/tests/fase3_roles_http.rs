//! Integración HTTP de la Fase 3: enforcement de ROLES por endpoint (el hueco
//! HIGH de la revisión — `require_role` no se ejercitaba). Verifica que un CLERK
//! recibe 403 en los endpoints de gestión (ADMIN / ADMIN-MANAGER) y que sin
//! sesión es 401, mientras que la lectura abierta (proveedores) sí le responde.

use std::time::Duration;

use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use secrecy::SecretString;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower::ServiceExt;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";
const PASSWORD: &str = "password123";

async fn pool(env: &str, default: &str) -> PgPool {
    let url = std::env::var(env).unwrap_or_else(|_| default.to_owned());
    PgPoolOptions::new()
        .max_connections(5)
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
    let state = AppState::new(auth, user_state, db, admin.clone(), false, Vec::new());
    build_router(state)
}

async fn send(app: &Router, req: Request<Body>) -> (StatusCode, HeaderMap, String) {
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, headers, String::from_utf8(bytes.to_vec()).unwrap())
}

async fn login(app: &Router, email: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "10.0.0.9")
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{PASSWORD}"}}"#
        )))
        .unwrap();
    let (st, _, body) = send(app, req).await;
    assert_eq!(st, StatusCode::OK, "login {email}: {body}");
    serde_json::from_str::<serde_json::Value>(&body).unwrap()["accessToken"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn get(uri: &str, token: Option<&str>) -> Request<Body> {
    let mut b = Request::builder().uri(uri);
    if let Some(t) = token {
        b = b.header(AUTHORIZATION, format!("Bearer {t}"));
    }
    b.body(Body::empty()).unwrap()
}

#[tokio::test]
async fn clerk_no_accede_a_endpoints_de_gestion() {
    let app = build().await;
    let clerk = login(&app, "clerk@org1.test").await;

    // ADMIN-only y ADMIN/MANAGER → 403 para CLERK.
    for uri in [
        "/users",                  // ADMIN
        "/stores",                 // ADMIN
        "/supplier-prices",        // ADMIN/MANAGER
        "/time-clock/history",     // ADMIN/MANAGER
        "/time-clock/history-all", // ADMIN/MANAGER
        "/time-clock/entries",     // ADMIN/MANAGER
    ] {
        let (st, _, _) = send(&app, get(uri, Some(&clerk))).await;
        assert_eq!(
            st,
            StatusCode::FORBIDDEN,
            "CLERK debería tener 403 en {uri}"
        );
    }
}

#[tokio::test]
async fn clerk_si_lee_proveedores_y_admin_si_gestiona() {
    let app = build().await;
    let clerk = login(&app, "clerk@org1.test").await;
    let admin = login(&app, "admin@org1.test").await;

    // Lectura abierta a cualquier rol.
    let (st_clerk, _, _) = send(&app, get("/suppliers", Some(&clerk))).await;
    assert_eq!(st_clerk, StatusCode::OK, "CLERK puede leer proveedores");

    // ADMIN sí entra a la gestión.
    let (st_admin, _, _) = send(&app, get("/users", Some(&admin))).await;
    assert_eq!(st_admin, StatusCode::OK, "ADMIN gestiona usuarios");
}

#[tokio::test]
async fn sin_sesion_es_401() {
    let app = build().await;
    for uri in [
        "/users",
        "/stores",
        "/suppliers",
        "/time-clock/current?storeId=x",
        "/products",
        "/sales",
        "/stock",
    ] {
        let (st, _, _) = send(&app, get(uri, None)).await;
        assert_eq!(
            st,
            StatusCode::UNAUTHORIZED,
            "sin token debería ser 401 en {uri}"
        );
    }
}
