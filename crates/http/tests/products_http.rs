//! Integración HTTP del catálogo (`/products`) vía `tower::oneshot` contra el
//! Postgres dev sembrado. Cubre el CRUD por ADMIN, la exigencia de rol en
//! escritura, el rechazo sin sesión y la importación CSV.

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

fn auth_config() -> AuthConfig {
    AuthConfig {
        access_secret: SecretString::from("test-access-secret".to_owned()),
        refresh_secret: SecretString::from("test-refresh-secret".to_owned()),
        access_ttl: Duration::from_secs(900),
        refresh_ttl: Duration::from_secs(604_800),
    }
}

/// Router + pool admin (para limpiar productos creados por los tests).
async fn build() -> (Router, PgPool) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(admin.clone(), auth_config());
    (
        build_router(AppState::new(
            auth,
            user_state,
            db,
            admin.clone(),
            false,
            Vec::new(),
            None,
            None,
        )),
        admin,
    )
}

async fn send(app: &Router, req: Request<Body>) -> (StatusCode, HeaderMap, String) {
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, headers, String::from_utf8(bytes.to_vec()).unwrap())
}

fn json(body: &str) -> serde_json::Value {
    serde_json::from_str(body).expect("body JSON")
}

/// Inicia sesión y devuelve el access token del usuario indicado.
async fn login(app: &Router, email: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "10.0.0.1")
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{PASSWORD}"}}"#
        )))
        .unwrap();
    let (st, _, body) = send(app, req).await;
    assert_eq!(st, StatusCode::OK, "login {email}: {body}");
    json(&body)["accessToken"].as_str().unwrap().to_owned()
}

fn get(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

fn body_req(method: &str, uri: &str, token: Option<&str>, json_body: &str) -> Request<Body> {
    let mut b = Request::builder()
        .method(method)
        .uri(uri)
        .header(CONTENT_TYPE, "application/json");
    if let Some(t) = token {
        b = b.header(AUTHORIZATION, format!("Bearer {t}"));
    }
    b.body(Body::from(json_body.to_owned())).unwrap()
}

async fn cleanup_name(admin: &PgPool, name: &str) {
    sqlx::query(r#"DELETE FROM "Product" WHERE name = $1"#)
        .bind(name)
        .execute(admin)
        .await
        .expect("limpiar productos");
}

#[tokio::test]
async fn crud_flow_as_admin() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let name = format!("HTTP-{}", uuid_like());
    let code = format!("BC-{name}");

    // Crear → 201.
    let create_body = format!(r#"{{"name":"{name}","salePrice":9.99,"barcode":"{code}"}}"#);
    let (st, _, body) = send(
        &app,
        body_req("POST", "/products", Some(&token), &create_body),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED, "{body}");
    let created = json(&body);
    let id = created["id"].as_str().unwrap().to_owned();
    assert_eq!(created["name"], name);
    assert_eq!(
        created["salePrice"], "9.99",
        "Decimal como string (paridad Prisma)"
    );

    // Listar con búsqueda → contiene el creado.
    let (st, _, body) = send(&app, get(&format!("/products?search={name}"), &token)).await;
    assert_eq!(st, StatusCode::OK);
    let list = json(&body);
    assert!(list
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["id"] == created["id"]));

    // Leer por id y por barcode.
    assert_eq!(
        send(&app, get(&format!("/products/{id}"), &token)).await.0,
        StatusCode::OK
    );
    let (st_bc, _, body_bc) = send(&app, get(&format!("/products/barcode/{code}"), &token)).await;
    assert_eq!(st_bc, StatusCode::OK);
    assert_eq!(json(&body_bc)["id"], created["id"]);

    // Actualizar precio → 200, nuevo precio.
    let (st_u, _, body_u) = send(
        &app,
        body_req(
            "PATCH",
            &format!("/products/{id}"),
            Some(&token),
            r#"{"salePrice":3.5}"#,
        ),
    )
    .await;
    assert_eq!(st_u, StatusCode::OK, "{body_u}");
    assert_eq!(json(&body_u)["salePrice"], "3.5");

    // Borrar → 204; luego 404.
    assert_eq!(
        send(
            &app,
            body_req("DELETE", &format!("/products/{id}"), Some(&token), "")
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        send(&app, get(&format!("/products/{id}"), &token)).await.0,
        StatusCode::NOT_FOUND
    );

    cleanup_name(&admin, &name).await;
}

#[tokio::test]
async fn write_requires_admin_or_manager() {
    let (app, _admin) = build().await;
    let clerk = login(&app, "clerk@org1.test").await;
    let body = r#"{"name":"no-debe-crearse","salePrice":1.0}"#;
    let (st, _, _) = send(&app, body_req("POST", "/products", Some(&clerk), body)).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "CLERK no puede crear");
}

#[tokio::test]
async fn unauthenticated_write_is_rejected() {
    let (app, _admin) = build().await;
    let body = r#"{"name":"x","salePrice":1.0}"#;
    let (st, _, _) = send(&app, body_req("POST", "/products", None, body)).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn import_reports_inserted_and_errors() {
    let (app, admin) = build().await;
    let token = login(&app, "manager@org1.test").await;
    let name = format!("IMP-{}", uuid_like());

    // 1 fila válida + 1 sin nombre + 1 con precio inválido.
    let csv = format!("name,salePrice\n{name},2.50\n,3.00\nMalo,abc");
    let import_body = serde_json::json!({ "csv": csv }).to_string();
    let (st, _, body) = send(
        &app,
        body_req("POST", "/products/import", Some(&token), &import_body),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{body}");
    let result = json(&body);
    assert_eq!(result["inserted"], 1);
    assert_eq!(result["errors"].as_array().unwrap().len(), 2);

    cleanup_name(&admin, &name).await;
}

#[tokio::test]
async fn malformed_body_is_400() {
    let (app, _admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let (st, _, _) = send(
        &app,
        body_req("POST", "/products", Some(&token), "{ not json"),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    // Falta salePrice (campo obligatorio) → 400 sin filtrar el detalle de serde.
    let (st2, _, body2) = send(
        &app,
        body_req("POST", "/products", Some(&token), r#"{"name":"x"}"#),
    )
    .await;
    assert_eq!(st2, StatusCode::BAD_REQUEST);
    assert!(
        !body2.to_lowercase().contains("saleprice"),
        "fuga serde: {body2}"
    );
}

/// Sufijo único para nombres de test (evita colisiones entre tests en paralelo).
fn uuid_like() -> String {
    uuid::Uuid::new_v4().to_string()
}
