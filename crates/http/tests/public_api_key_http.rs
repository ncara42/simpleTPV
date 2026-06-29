//! Integración HTTP del extractor `ApiKeyAuth` (`GET /public/stock`): es el
//! ÚNICO punto donde se aplican la caducidad (KEY-02) y la revocación de API
//! keys. El test de dominio (`domain/tests/api_keys.rs`) cubre el servicio
//! (alta/lookup/revoke); aquí se verifica la DECISIÓN de autenticación de la
//! capa http: key válida → 200, revocada/caducada/desconocida/ausente → 401.
//!
//! Usa la org `B22222222` (org2) para no colisionar con el test de dominio, que
//! limpia las keys de `B11111111` (org1). Cada test inserta keys con hash único
//! y solo borra las suyas → parallel-safe.

use std::time::Duration;

use axum::body::Body;
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use secrecy::SecretString;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_domain::api_keys;
use simpletpv_http::{build_router, AppState};
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

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

/// Router + pool admin (BYPASSRLS, para insertar/limpiar keys) + id de org2.
async fn build() -> (Router, PgPool, Uuid) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B22222222'"#)
        .fetch_one(&admin)
        .await
        .expect("org2 sembrada");
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(admin.clone(), auth_config());
    let router = build_router(AppState::new(
        auth,
        user_state,
        db,
        admin.clone(),
        false,
        Vec::new(),
        None,
        None,
    ));
    (router, admin, org)
}

/// Inserta una API key con estados controlados sobre el pool admin (BYPASSRLS).
/// `expires_sql`/`revoked_sql` son expresiones SQL crudas (`NULL`,
/// `now() - interval '1 day'`, ...). Devuelve la key en claro `stpv_...`.
async fn insert_key(admin: &PgPool, org: Uuid, expires_sql: &str, revoked_sql: &str) -> String {
    let rand = Uuid::new_v4().simple().to_string(); // 32 hex
    let prefix = &rand[..8];
    let raw = format!("stpv_{prefix}_{rand}");
    let hashed = api_keys::hash_key(&raw);
    let sql = format!(
        r#"INSERT INTO "ApiKey"
             (id, "organizationId", name, prefix, "hashedKey", "expiresAt", "revokedAt")
           VALUES ($1, $2, $3, $4, $5, {expires_sql}, {revoked_sql})"#
    );
    sqlx::query(&sql)
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(format!("apikey-http-test-{prefix}"))
        .bind(prefix)
        .bind(&hashed)
        .execute(admin)
        .await
        .expect("insertar API key de test");
    raw
}

/// Borra una key concreta por su hash (no toca el resto del tenant).
async fn delete_key(admin: &PgPool, raw: &str) {
    sqlx::query(r#"DELETE FROM "ApiKey" WHERE "hashedKey" = $1"#)
        .bind(api_keys::hash_key(raw))
        .execute(admin)
        .await
        .expect("limpiar API key de test");
}

async fn send(app: &Router, req: Request<Body>) -> (StatusCode, HeaderMap, String) {
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, headers, String::from_utf8(bytes.to_vec()).unwrap())
}

/// `GET /public/stock` con (o sin) cabecera `X-API-Key`. El `X-Forwarded-For`
/// alimenta al `SmartIpKeyExtractor` del rate-limit público.
fn public_stock(api_key: Option<&str>) -> Request<Body> {
    let mut b = Request::builder()
        .uri("/public/stock")
        .header("x-forwarded-for", "10.9.9.9");
    if let Some(k) = api_key {
        b = b.header("x-api-key", k);
    }
    b.body(Body::empty()).unwrap()
}

#[tokio::test]
async fn key_valida_autentica_y_devuelve_200() {
    let (app, admin, org) = build().await;
    let raw = insert_key(&admin, org, "NULL", "NULL").await;

    let (st, _, body) = send(&app, public_stock(Some(&raw))).await;
    assert_eq!(st, StatusCode::OK, "key válida debía autenticar: {body}");
    // El handler devuelve la lista de stock. El seed da 100 uds de cada producto
    // en cada tienda → array no vacío.
    let parsed: serde_json::Value = serde_json::from_str(&body).expect("body JSON");
    let items = parsed.as_array().expect("array de stock");
    assert!(!items.is_empty(), "el seed de org2 tiene stock: {body}");
    // Paridad con NestJS y regresión KEY/null-sku: los productos del seed no
    // tienen `sku` → `null` (no 500); `quantity` es número; sin tarifa en la key
    // → `wholesalePrice` null.
    let first = &items[0];
    assert!(
        first["sku"].is_null(),
        "sku debía ser null (sin referencia)"
    );
    assert!(first["quantity"].is_number(), "quantity como número");
    assert!(first["wholesalePrice"].is_null(), "sin tarifa → null");

    delete_key(&admin, &raw).await;
}

#[tokio::test]
async fn key_revocada_devuelve_401() {
    let (app, admin, org) = build().await;
    let raw = insert_key(&admin, org, "NULL", "now()").await;

    let (st, _, body) = send(&app, public_stock(Some(&raw))).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "key revocada → 401: {body}");

    delete_key(&admin, &raw).await;
}

#[tokio::test]
async fn key_caducada_devuelve_401() {
    let (app, admin, org) = build().await;
    // expiresAt en el pasado → caducada (KEY-02).
    let raw = insert_key(&admin, org, "now() - interval '1 day'", "NULL").await;

    let (st, _, body) = send(&app, public_stock(Some(&raw))).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "key caducada → 401: {body}");

    delete_key(&admin, &raw).await;
}

#[tokio::test]
async fn key_con_caducidad_futura_autentica() {
    let (app, admin, org) = build().await;
    let raw = insert_key(&admin, org, "now() + interval '1 day'", "NULL").await;

    let (st, _, body) = send(&app, public_stock(Some(&raw))).await;
    assert_eq!(
        st,
        StatusCode::OK,
        "key con caducidad futura debía autenticar: {body}"
    );

    delete_key(&admin, &raw).await;
}

#[tokio::test]
async fn key_desconocida_o_ausente_devuelve_401() {
    let (app, _admin, _org) = build().await;

    // Formato válido (stpv_) pero inexistente en BD.
    let unknown = format!("stpv_nope0000_{}", Uuid::new_v4().simple());
    let (st, _, _) = send(&app, public_stock(Some(&unknown))).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "key desconocida → 401");

    // Sin cabecera X-API-Key.
    let (st, _, _) = send(&app, public_stock(None)).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "sin cabecera → 401");

    // Cabecera presente pero sin el prefijo `stpv_` (rechazo barato pre-BD).
    let bad = Request::builder()
        .uri("/public/stock")
        .header("x-forwarded-for", "10.9.9.9")
        .header("x-api-key", "no-es-una-key")
        .header(CONTENT_TYPE, "application/json")
        .body(Body::empty())
        .unwrap();
    let (st, _, _) = send(&app, bad).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "formato inválido → 401");
}
