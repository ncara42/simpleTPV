//! Integración HTTP del middleware de auditoría (#156, SEC-22): una mutación
//! exitosa (POST) registra una fila en AuditLog; una lectura (GET) no. Port del
//! audit.integration.spec.ts de NestJS.

use std::time::Duration;

use axum::body::Body;
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use secrecy::SecretString;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

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

fn auth_config() -> AuthConfig {
    AuthConfig {
        access_secret: SecretString::from("test-access-secret".to_owned()),
        refresh_secret: SecretString::from("test-refresh-secret".to_owned()),
        access_ttl: Duration::from_secs(900),
        refresh_ttl: Duration::from_secs(604_800),
    }
}

/// Router + pool admin + (org1, id del usuario admin@org1.test).
async fn build() -> (Router, PgPool, Uuid, Uuid) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .expect("org1 sembrada");
    let user: Uuid = sqlx::query_scalar(r#"SELECT id FROM "User" WHERE email = 'admin@org1.test'"#)
        .fetch_one(&admin)
        .await
        .expect("admin@org1.test sembrado");
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(admin.clone(), auth_config());
    let router = build_router(AppState::new(
        auth,
        user_state,
        db,
        admin.clone(),
        false,
        Vec::new(),
    ));
    (router, admin, org, user)
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
        .header("x-forwarded-for", "10.0.0.5")
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

/// Filas de AuditLog del tenant para (action, entity), del usuario admin.
async fn audit_count(admin: &PgPool, org: Uuid, user: Uuid, action: &str, entity: &str) -> i64 {
    sqlx::query_scalar(
        r#"SELECT count(*)::bigint FROM "AuditLog"
           WHERE "organizationId" = $1 AND "userId" = $2 AND action = $3 AND entity = $4"#,
    )
    .bind(org)
    .bind(user)
    .bind(action)
    .bind(entity)
    .fetch_one(admin)
    .await
    .unwrap()
}

#[tokio::test]
async fn mutacion_post_se_audita_get_no() {
    let (app, admin, org, user) = build().await;
    let token = login(&app, "admin@org1.test").await;

    let before = audit_count(&admin, org, user, "POST", "products").await;

    // POST /products (mutación) → debe registrarse en AuditLog.
    let name = format!("AUD-{}", Uuid::new_v4());
    let code = format!("AUDC{}", &Uuid::new_v4().simple().to_string()[..6]);
    let body = format!(r#"{{"name":"{name}","salePrice":9.99,"barcode":"{code}"}}"#);
    let req = Request::builder()
        .method("POST")
        .uri("/products")
        .header("authorization", format!("Bearer {token}"))
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap();
    let (st, _, resp) = send(&app, req).await;
    assert_eq!(st, StatusCode::CREATED, "crear producto: {resp}");
    let product_id = serde_json::from_str::<serde_json::Value>(&resp).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    // La auditoría se escribe inline en el middleware (antes de responder).
    let after = audit_count(&admin, org, user, "POST", "products").await;
    assert!(
        after >= before + 1,
        "el POST debe haber añadido ≥1 fila de auditoría (before={before}, after={after})"
    );

    // GET /products (lectura) NO se audita: ningún test crea filas action=GET.
    let get = Request::builder()
        .uri("/products")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let (st, _, _) = send(&app, get).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        audit_count(&admin, org, user, "GET", "products").await,
        0,
        "las lecturas no se auditan"
    );

    // Limpieza del producto creado (las filas de AuditLog son traza, se dejan).
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(Uuid::parse_str(&product_id).unwrap())
        .execute(&admin)
        .await
        .unwrap();
}
