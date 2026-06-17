//! Integración HTTP de devoluciones (`/returns`, slice 1) vía `tower::oneshot`:
//! crear contra ticket, listar por venta y rechazo sin sesión.

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

async fn build() -> (Router, PgPool) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(admin.clone(), auth_config());
    (
        build_router(AppState::new(auth, user_state, db, false, Vec::new())),
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

fn json(b: &str) -> serde_json::Value {
    serde_json::from_str(b).expect("json")
}

async fn login(app: &Router, email: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "10.0.0.4")
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{PASSWORD}"}}"#
        )))
        .unwrap();
    let (st, _, b) = send(app, req).await;
    assert_eq!(st, StatusCode::OK, "login: {b}");
    json(&b)["accessToken"].as_str().unwrap().to_owned()
}

fn get(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}
fn post(uri: &str, token: Option<&str>, body: &str) -> Request<Body> {
    let mut b = Request::builder()
        .method("POST")
        .uri(uri)
        .header(CONTENT_TYPE, "application/json");
    if let Some(t) = token {
        b = b.header(AUTHORIZATION, format!("Bearer {t}"));
    }
    b.body(Body::from(body.to_owned())).unwrap()
}

async fn store_with_session(admin: &PgPool) -> Uuid {
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif='B11111111'"#)
        .fetch_one(admin)
        .await
        .unwrap();
    let user: Uuid = sqlx::query_scalar(
        r#"SELECT id FROM "User" WHERE "organizationId"=$1 ORDER BY email LIMIT 1"#,
    )
    .bind(org)
    .fetch_one(admin)
    .await
    .unwrap();
    let store = Uuid::new_v4();
    let code = format!("RH{}", &store.simple().to_string()[..7]);
    sqlx::query(r#"INSERT INTO "Store" (id,"organizationId",name,code) VALUES ($1,$2,$3,$4)"#)
        .bind(store)
        .bind(org)
        .bind(format!("T {code}"))
        .bind(&code)
        .execute(admin)
        .await
        .unwrap();
    sqlx::query(r#"INSERT INTO "CashSession" (id,"organizationId","storeId","userId","openingAmount",status) VALUES ($1,$2,$3,$4,0,'OPEN'::"CashSessionStatus")"#).bind(Uuid::new_v4()).bind(org).bind(store).bind(user).execute(admin).await.unwrap();
    store
}

async fn cleanup(admin: &PgPool, store: Uuid, product: &str) {
    let pid = Uuid::parse_str(product).unwrap();
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "storeId"=$1"#,
        r#"DELETE FROM "StockAlert" WHERE "storeId"=$1"#,
        r#"DELETE FROM "Stock" WHERE "storeId"=$1"#,
        r#"DELETE FROM "ReturnLine" WHERE "returnId" IN (SELECT id FROM "Return" WHERE "storeId"=$1)"#,
        r#"DELETE FROM "Return" WHERE "storeId"=$1"#,
        r#"DELETE FROM "SaleLine" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "storeId"=$1)"#,
        r#"DELETE FROM "Sale" WHERE "storeId"=$1"#,
        r#"DELETE FROM "CashSession" WHERE "storeId"=$1"#,
        r#"DELETE FROM "Store" WHERE id=$1"#,
    ] {
        sqlx::query(sql).bind(store).execute(admin).await.unwrap();
    }
    sqlx::query(r#"DELETE FROM "Product" WHERE id=$1"#)
        .bind(pid)
        .execute(admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn create_and_list_return() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = store_with_session(&admin).await;
    // producto
    let (stp, _, bp) = send(
        &app,
        post(
            "/products",
            Some(&token),
            &format!(r#"{{"name":"RETH-{}","salePrice":2.0}}"#, Uuid::new_v4()),
        ),
    )
    .await;
    assert_eq!(stp, StatusCode::CREATED, "{bp}");
    let product = json(&bp)["id"].as_str().unwrap().to_owned();
    // venta de 3
    let (sts, _, bs) = send(&app, post("/sales", Some(&token), &format!(r#"{{"storeId":"{store}","paymentMethod":"CARD","lines":[{{"productId":"{product}","qty":3}}]}}"#))).await;
    assert_eq!(sts, StatusCode::CREATED, "{bs}");
    let sale = json(&bs);
    let sale_id = sale["id"].as_str().unwrap();
    let sale_line_id = sale["lines"][0]["id"].as_str().unwrap();
    // devolución de 2 → 201, total proporcional 4.00 (6.00/3*2)
    let (str_, _, br) = send(&app, post("/returns", Some(&token), &format!(r#"{{"saleId":"{sale_id}","reason":"defecto","lines":[{{"saleLineId":"{sale_line_id}","qty":2}}]}}"#))).await;
    assert_eq!(str_, StatusCode::CREATED, "{br}");
    assert_eq!(json(&br)["total"], "4");
    // listar por venta
    let (stl, _, bl) = send(&app, get(&format!("/returns?saleId={sale_id}"), &token)).await;
    assert_eq!(stl, StatusCode::OK, "{bl}");
    assert_eq!(json(&bl).as_array().unwrap().len(), 1);
    cleanup(&admin, store, &product).await;
}

#[tokio::test]
async fn unauthenticated_return_is_rejected() {
    let (app, _admin) = build().await;
    let body = r#"{"saleId":"00000000-0000-0000-0000-000000000000","reason":"x","lines":[]}"#;
    assert_eq!(
        send(&app, post("/returns", None, body)).await.0,
        StatusCode::UNAUTHORIZED
    );
}
