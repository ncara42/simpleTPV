//! Integración HTTP de los endpoints de VeriFactu (`/verifactu/records`, #155):
//! listado filtrable + reintento, gateados a ADMIN/MANAGER. Inserta un registro
//! PENDING propio (hash único) y solo lo borra a él → parallel-safe.

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

async fn build() -> (Router, PgPool, Uuid) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .expect("org1 sembrada");
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
    (router, admin, org)
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
        .header("x-forwarded-for", "10.0.0.7")
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

fn get(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

/// Inserta un registro FAILED para org1 y devuelve su id.
async fn insert_failed(admin: &PgPool, org: Uuid) -> Uuid {
    let id = Uuid::new_v4();
    let hash = format!("{:0>64}", id.simple());
    sqlx::query(
        r#"INSERT INTO "VerifactuRecord"
             (id, "organizationId", type, status, hash, "lastError", attempts, payload)
           VALUES ($1, $2, 'INVOICE'::"VerifactuType", 'FAILED'::"VerifactuStatus", $3,
             'rechazado', 5, '{"total":"10.00"}'::jsonb)"#,
    )
    .bind(id)
    .bind(org)
    .bind(&hash)
    .execute(admin)
    .await
    .expect("insertar registro FAILED");
    id
}

async fn status_of(admin: &PgPool, id: Uuid) -> String {
    sqlx::query_scalar(r#"SELECT status::text FROM "VerifactuRecord" WHERE id = $1"#)
        .bind(id)
        .fetch_one(admin)
        .await
        .unwrap()
}

#[tokio::test]
async fn list_y_retry_admin_clerk() {
    let (app, admin, org) = build().await;
    let id = insert_failed(&admin, org).await;

    // ADMIN: el listado filtrado por FAILED incluye mi registro.
    let admin_tok = login(&app, "admin@org1.test").await;
    let (st, _, body) = send(&app, get("/verifactu/records?status=FAILED", &admin_tok)).await;
    assert_eq!(st, StatusCode::OK, "admin lista: {body}");
    let arr: serde_json::Value = serde_json::from_str(&body).unwrap();
    let mine = arr
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == id.to_string());
    let mine = mine.expect("mi registro aparece en el listado FAILED");
    assert_eq!(mine["status"], "FAILED");
    assert_eq!(mine["type"], "INVOICE", "camelCase: type expuesto");

    // CLERK: la administración de VeriFactu está vetada → 403.
    let clerk_tok = login(&app, "clerk@org1.test").await;
    let (st, _, _) = send(&app, get("/verifactu/records", &clerk_tok)).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "CLERK no administra VeriFactu");

    // ADMIN: retry devuelve el registro a PENDING.
    let req = Request::builder()
        .method("POST")
        .uri(format!("/verifactu/records/{id}/retry"))
        .header("authorization", format!("Bearer {admin_tok}"))
        .body(Body::empty())
        .unwrap();
    let (st, _, body) = send(&app, req).await;
    assert_eq!(st, StatusCode::OK, "retry admin: {body}");
    assert_eq!(status_of(&admin, id).await, "PENDING", "retry → PENDING");

    sqlx::query(r#"DELETE FROM "VerifactuRecord" WHERE id = $1"#)
        .bind(id)
        .execute(&admin)
        .await
        .unwrap();
}
