//! Integración HTTP del stock (`/stock`, slice A) vía `tower::oneshot` contra el
//! Postgres dev sembrado: ajuste + movimientos por ADMIN, exigencia de rol,
//! rechazo sin sesión.

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

async fn login(app: &Router, email: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "10.0.0.2")
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

/// Crea un producto vía la API y devuelve su id.
async fn create_product(app: &Router, token: &str, name: &str) -> String {
    let body = format!(r#"{{"name":"{name}","salePrice":1.0}}"#);
    let (st, _, b) = send(app, body_req("POST", "/products", Some(token), &body)).await;
    assert_eq!(st, StatusCode::CREATED, "{b}");
    json(&b)["id"].as_str().unwrap().to_owned()
}

async fn a_store(admin: &PgPool) -> String {
    let id: uuid::Uuid = sqlx::query_scalar(
        r#"SELECT s.id FROM "Store" s JOIN "Organization" o ON o.id = s."organizationId"
           WHERE o.nif = 'B11111111' ORDER BY s.code LIMIT 1"#,
    )
    .fetch_one(admin)
    .await
    .unwrap();
    id.to_string()
}

async fn cleanup(admin: &PgPool, product: &str) {
    let id = uuid::Uuid::parse_str(product).unwrap();
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "productId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "productId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "productId" = $1"#,
        r#"DELETE FROM "Product" WHERE id = $1"#,
    ] {
        sqlx::query(sql).bind(id).execute(admin).await.unwrap();
    }
}

#[tokio::test]
async fn adjust_and_movements_as_admin() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = a_store(&admin).await;
    let product = create_product(&app, &token, &format!("STKHTTP-{}", uuid::Uuid::new_v4())).await;

    // Ajuste a 42 → 200 con la vista (quantity string normalizado).
    let body = format!(
        r#"{{"productId":"{product}","storeId":"{store}","newQuantity":42,"reason":"recuento"}}"#
    );
    let (st, _, b) = send(&app, body_req("POST", "/stock/adjust", Some(&token), &body)).await;
    assert_eq!(st, StatusCode::OK, "{b}");
    let view = json(&b);
    assert_eq!(view["quantity"], "42");
    assert_eq!(view["level"], "green");

    // Movimientos del producto → contiene el ADJUSTMENT.
    let (stm, _, bm) = send(
        &app,
        get(&format!("/stock/movements?productId={product}"), &token),
    )
    .await;
    assert_eq!(stm, StatusCode::OK, "{bm}");
    let page = json(&bm);
    assert!(page["totalItems"].as_i64().unwrap() >= 1);
    assert_eq!(page["items"][0]["type"], "ADJUSTMENT");

    cleanup(&admin, &product).await;
}

#[tokio::test]
async fn set_min_returns_view_as_manager() {
    let (app, admin) = build().await;
    let token = login(&app, "manager@org1.test").await;
    let store = a_store(&admin).await;
    let product = create_product(&app, &token, &format!("MINHTTP-{}", uuid::Uuid::new_v4())).await;

    let body = format!(r#"{{"productId":"{product}","storeId":"{store}","minStock":5}}"#);
    let (st, _, b) = send(&app, body_req("PUT", "/stock/min", Some(&token), &body)).await;
    assert_eq!(st, StatusCode::OK, "{b}");
    assert_eq!(json(&b)["minStock"], "5");

    cleanup(&admin, &product).await;
}

#[tokio::test]
async fn dashboard_reads_as_admin() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = a_store(&admin).await;
    let product = create_product(&app, &token, &format!("RDHTTP-{}", uuid::Uuid::new_v4())).await;

    // Genera stock para que el producto aparezca en las vistas.
    let body = format!(
        r#"{{"productId":"{product}","storeId":"{store}","newQuantity":7,"reason":"init"}}"#
    );
    assert_eq!(
        send(&app, body_req("POST", "/stock/adjust", Some(&token), &body))
            .await
            .0,
        StatusCode::OK
    );

    // GET /stock?storeId= → lista con el producto y su nivel.
    let (st, _, b) = send(&app, get(&format!("/stock?storeId={store}"), &token)).await;
    assert_eq!(st, StatusCode::OK, "{b}");
    let list = json(&b);
    let mine = list
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["productId"] == serde_json::json!(product))
        .expect("producto en byStore");
    assert_eq!(mine["quantity"], "7");
    assert_eq!(mine["level"], "green");

    // GET /stock/product/:id → contiene la tienda.
    let (stp, _, bp) = send(&app, get(&format!("/stock/product/{product}"), &token)).await;
    assert_eq!(stp, StatusCode::OK, "{bp}");
    assert!(json(&bp)
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["storeId"] == serde_json::json!(store)));

    // GET /stock/alerts → 200 (lista, posiblemente vacía para este producto).
    assert_eq!(
        send(&app, get("/stock/alerts", &token)).await.0,
        StatusCode::OK
    );

    cleanup(&admin, &product).await;
}

#[tokio::test]
async fn adjust_requires_admin_or_manager() {
    let (app, _admin) = build().await;
    let clerk = login(&app, "clerk@org1.test").await;
    let body = r#"{"productId":"00000000-0000-0000-0000-000000000000","storeId":"00000000-0000-0000-0000-000000000000","newQuantity":1,"reason":"x"}"#;
    let (st, _, _) = send(&app, body_req("POST", "/stock/adjust", Some(&clerk), body)).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "CLERK no puede ajustar");
}

#[tokio::test]
async fn unauthenticated_is_rejected() {
    let (app, _admin) = build().await;
    let req = Request::builder()
        .uri("/stock/movements")
        .body(Body::empty())
        .unwrap();
    let (st, _, _) = send(&app, req).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}
