//! Tests de integración HTTP de la capa auth, vía `tower::oneshot` (sin servidor
//! real) contra el Postgres sembrado. Cada test que escribe usa un usuario
//! distinto del seed para ser seguro en paralelo.

use std::time::Duration;

use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE, SET_COOKIE};
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

/// Devuelve el router y el pool admin (para limpieza de tokens).
async fn build() -> (Router, PgPool) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    // Revalidación A-04 contra el MISMO pool admin (lookup real del seed).
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(admin.clone(), auth_config());
    // cookie_secure=false: los tests van sobre http (oneshot). CORS vacío: los
    // tests no envían cabecera Origin.
    let state = AppState::new(auth, user_state, db, false, Vec::new());
    (build_router(state), admin)
}

async fn cleanup(admin: &PgPool, email: &str) {
    sqlx::query(
        "DELETE FROM \"RefreshToken\" WHERE \"userId\" = (SELECT id FROM \"User\" WHERE email = $1)",
    )
    .bind(email)
    .execute(admin)
    .await
    .expect("limpiar tokens");
}

fn login_req(email: &str, password: &str, ip: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        // El rate-limit usa SmartIpKeyExtractor (X-Forwarded-For tras proxy).
        .header("x-forwarded-for", ip)
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{password}"}}"#
        )))
        .unwrap()
}

/// Petición a `/auth/refresh` con la cookie del refresh. Aporta X-Forwarded-For
/// porque la ruta está rate-limited por IP (SmartIpKeyExtractor).
fn refresh_req(cookie: &str, ip: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/auth/refresh")
        .header(COOKIE, cookie)
        .header("x-forwarded-for", ip)
        .body(Body::empty())
        .unwrap()
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

/// Extrae `refreshToken=<valor>` del Set-Cookie para reenviarlo como Cookie.
fn refresh_cookie_pair(headers: &HeaderMap) -> String {
    let sc = headers
        .get(SET_COOKIE)
        .and_then(|v| v.to_str().ok())
        .expect("Set-Cookie presente");
    let pair = sc.split(';').next().expect("par cookie");
    assert!(pair.starts_with("refreshToken="), "cookie inesperada: {sc}");
    pair.to_owned()
}

#[tokio::test]
async fn login_sets_cookie_and_protected_route_works() {
    let email = "admin@org1.test";
    let (app, admin) = build().await;
    cleanup(&admin, email).await;

    let (st, headers, body) = send(&app, login_req(email, PASSWORD, "9.9.9.1")).await;
    assert_eq!(st, StatusCode::OK);
    let token = json(&body)["accessToken"].as_str().unwrap().to_owned();
    assert!(!token.is_empty());

    // Cookie del refresh: httpOnly + SameSite=Strict.
    let set_cookie = headers.get(SET_COOKIE).unwrap().to_str().unwrap();
    assert!(set_cookie.contains("refreshToken="));
    assert!(set_cookie.to_lowercase().contains("httponly"));
    assert!(set_cookie.contains("SameSite=Strict"));

    // Ruta protegida: 401 sin token.
    let no_auth = Request::builder().uri("/me").body(Body::empty()).unwrap();
    assert_eq!(send(&app, no_auth).await.0, StatusCode::UNAUTHORIZED);

    // 200 con el access token; expone el rol.
    let me = Request::builder()
        .uri("/me")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let (st_me, _, body_me) = send(&app, me).await;
    assert_eq!(st_me, StatusCode::OK);
    assert_eq!(json(&body_me)["role"], "ADMIN");

    cleanup(&admin, email).await;
}

#[tokio::test]
async fn login_rejects_wrong_password() {
    let (app, _admin) = build().await;
    let (st, _, _) = send(&app, login_req("admin@org1.test", "mala", "9.9.9.2")).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn refresh_over_cookie_rotates_and_detects_reuse() {
    let email = "manager@org1.test";
    let (app, admin) = build().await;
    cleanup(&admin, email).await;

    let (_, headers, _) = send(&app, login_req(email, PASSWORD, "9.9.9.3")).await;
    let cookie1 = refresh_cookie_pair(&headers);

    // Refresh con la cookie → 200 + nueva cookie.
    let (st_r, headers_r, _) = send(&app, refresh_req(&cookie1, "9.9.9.3")).await;
    assert_eq!(st_r, StatusCode::OK);
    let cookie2 = refresh_cookie_pair(&headers_r);
    assert_ne!(cookie1, cookie2, "la rotación cambia el refresh token");

    // Reuso de la cookie vieja → 401 (familia revocada).
    assert_eq!(
        send(&app, refresh_req(&cookie1, "9.9.9.3")).await.0,
        StatusCode::UNAUTHORIZED
    );

    cleanup(&admin, email).await;
}

#[tokio::test]
async fn login_is_rate_limited_per_ip() {
    let (app, _admin) = build().await;
    // Credenciales inválidas (no escribe en BD); el rate-limit actúa igual.
    // burst 5 ⇒ las 5 primeras llegan al handler (401), la 6ª la corta el limiter.
    let ip = "9.9.9.250";
    let mut statuses = Vec::new();
    for _ in 0..6 {
        let (st, _, _) = send(&app, login_req("nadie@x.test", "x", ip)).await;
        statuses.push(st);
    }
    assert!(
        statuses
            .iter()
            .take(5)
            .all(|s| *s == StatusCode::UNAUTHORIZED),
        "las primeras 5 deben pasar el limiter: {statuses:?}"
    );
    assert_eq!(
        statuses[5],
        StatusCode::TOO_MANY_REQUESTS,
        "la 6ª petición debe ser rechazada por rate-limit"
    );
}

#[tokio::test]
async fn logout_revokes_and_clears_cookie_securely() {
    let email = "clerk@org1.test";
    let (app, admin) = build().await;
    cleanup(&admin, email).await;

    let (_, headers, _) = send(&app, login_req(email, PASSWORD, "9.9.9.4")).await;
    let cookie = refresh_cookie_pair(&headers);

    // Logout con la cookie → 200 + Set-Cookie de borrado con atributos seguros.
    let logout_req = Request::builder()
        .method("POST")
        .uri("/auth/logout")
        .header(COOKIE, &cookie)
        .body(Body::empty())
        .unwrap();
    let (st, headers_out, _) = send(&app, logout_req).await;
    assert_eq!(st, StatusCode::OK);
    let removal = headers_out.get(SET_COOKIE).unwrap().to_str().unwrap();
    assert!(removal.contains("refreshToken="));
    assert!(
        removal.to_lowercase().contains("httponly"),
        "removal sin HttpOnly: {removal}"
    );
    assert!(
        removal.contains("SameSite=Strict"),
        "removal sin SameSite: {removal}"
    );
    assert!(
        removal.contains("Max-Age=0"),
        "removal sin Max-Age=0: {removal}"
    );

    // Tras logout, la familia está revocada → refresh con la cookie vieja 401.
    assert_eq!(
        send(&app, refresh_req(&cookie, "9.9.9.4")).await.0,
        StatusCode::UNAUTHORIZED
    );

    cleanup(&admin, email).await;
}

#[tokio::test]
async fn refresh_is_rate_limited_per_ip() {
    let (app, _admin) = build().await;
    // Cookie inexistente ⇒ el handler responde 401 sin tocar la BD; el limiter
    // actúa igual sobre la ruta. burst 10 ⇒ las 10 primeras llegan al handler
    // (401), la 11ª la corta el limiter (429).
    let ip = "9.9.9.240";
    let mut statuses = Vec::new();
    for _ in 0..11 {
        let (st, _, _) = send(&app, refresh_req("refreshToken=nope", ip)).await;
        statuses.push(st);
    }
    assert!(
        statuses
            .iter()
            .take(10)
            .all(|s| *s == StatusCode::UNAUTHORIZED),
        "las primeras 10 deben pasar el limiter: {statuses:?}"
    );
    assert_eq!(
        statuses[10],
        StatusCode::TOO_MANY_REQUESTS,
        "la 11ª petición debe ser rechazada por rate-limit"
    );
}

#[tokio::test]
async fn login_malformed_body_is_400_without_serde_leak() {
    let (app, _admin) = build().await;
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "9.9.9.5")
        .body(Body::from("{ not valid json"))
        .unwrap();
    let (st, _, body) = send(&app, req).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    // No debe filtrar nombres de campo serde ni posiciones del parser.
    let low = body.to_lowercase();
    assert!(!low.contains("email"), "fuga serde: {body}");
    assert!(!low.contains("password"), "fuga serde: {body}");
    assert!(!low.contains("missing field"), "fuga serde: {body}");
    assert!(!low.contains("column"), "fuga serde: {body}");
}
