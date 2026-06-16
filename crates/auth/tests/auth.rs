//! Tests de integración de auth contra el Postgres sembrado.
//!
//! Requisitos: Postgres con migraciones + seed (usuarios `*@org1.test` /
//! `*@org2.test` con contraseña `password123`, hash bcrypt cost 10). Usa el rol
//! `app_admin` (BYPASSRLS) para el lookup previo al tenant, igual que NestJS.
//!
//! Cada test que muta filas usa un USUARIO DISTINTO del seed para ser seguro
//! bajo la ejecución en paralelo de cargo (no comparten RefreshToken/active).

use std::time::Duration;

use secrecy::SecretString;
use simpletpv_auth::{AuthConfig, AuthService, Role};
use sqlx::postgres::{PgPool, PgPoolOptions};

const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";
const PASSWORD: &str = "password123";

fn admin_url() -> String {
    std::env::var("DATABASE_URL_ADMIN").unwrap_or_else(|_| DEV_ADMIN_URL.to_owned())
}

fn config() -> AuthConfig {
    AuthConfig {
        access_secret: SecretString::from("test-access-secret".to_owned()),
        refresh_secret: SecretString::from("test-refresh-secret".to_owned()),
        access_ttl: Duration::from_secs(900),
        refresh_ttl: Duration::from_secs(604_800),
    }
}

async fn admin_pool() -> PgPool {
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&admin_url())
        .await
        .expect("conectar como app_admin")
}

async fn cleanup_tokens(admin: &PgPool, email: &str) {
    sqlx::query(
        "DELETE FROM \"RefreshToken\" WHERE \"userId\" = (SELECT id FROM \"User\" WHERE email = $1)",
    )
    .bind(email)
    .execute(admin)
    .await
    .expect("limpiar refresh tokens del usuario de test");
}

async fn set_active(admin: &PgPool, email: &str, active: bool) {
    sqlx::query("UPDATE \"User\" SET active = $1 WHERE email = $2")
        .bind(active)
        .bind(email)
        .execute(admin)
        .await
        .expect("actualizar active del usuario de test");
}

#[tokio::test]
async fn login_succeeds_and_access_token_carries_claims() {
    let email = "admin@org1.test";
    let admin = admin_pool().await;
    let svc = AuthService::new(admin.clone(), config());

    let pair = svc.login(email, PASSWORD).await.expect("login válido");
    assert!(!pair.access_token.is_empty());
    assert!(!pair.refresh_token.is_empty());

    let claims = svc
        .verify_access_token(&pair.access_token)
        .expect("access token verificable");
    assert_eq!(claims.role, Role::Admin);
    assert!(uuid::Uuid::parse_str(&claims.sub).is_ok());

    // organizationId del token = la org del usuario (B11111111).
    let org1: uuid::Uuid =
        sqlx::query_scalar("SELECT id FROM \"Organization\" WHERE nif = 'B11111111'")
            .fetch_one(&admin)
            .await
            .unwrap();
    assert_eq!(claims.organization_id, org1.to_string());

    cleanup_tokens(&admin, email).await;
}

#[tokio::test]
async fn login_rejects_wrong_password() {
    // No crea tokens (falla) ⇒ no necesita limpieza ni colisiona con otros tests.
    let svc = AuthService::new(admin_pool().await, config());
    assert!(svc
        .login("admin@org1.test", "contraseña-incorrecta")
        .await
        .is_err());
}

#[tokio::test]
async fn login_rejects_unknown_user() {
    let svc = AuthService::new(admin_pool().await, config());
    // SEC-14: mismo error que con contraseña incorrecta (sin filtrar existencia).
    assert!(svc.login("nadie@ningunsitio.test", "x").await.is_err());
}

#[tokio::test]
async fn login_rejects_overlong_password() {
    // > 72 bytes: rechazado (bcrypt truncaría). No filtra existencia del usuario.
    let svc = AuthService::new(admin_pool().await, config());
    let long = "x".repeat(100);
    assert!(svc.login("admin@org1.test", &long).await.is_err());
}

#[tokio::test]
async fn refresh_rotates_and_detects_reuse() {
    let email = "manager@org1.test";
    let admin = admin_pool().await;
    cleanup_tokens(&admin, email).await; // estado limpio
    let svc = AuthService::new(admin.clone(), config());

    let pair1 = svc.login(email, PASSWORD).await.unwrap();
    let pair2 = svc
        .refresh(&pair1.refresh_token)
        .await
        .expect("rotación válida");
    assert_ne!(
        pair1.refresh_token, pair2.refresh_token,
        "la rotación debe emitir un refresh token distinto"
    );

    // Reuso del token ya rotado ⇒ 401 y revocación de la familia.
    assert!(
        svc.refresh(&pair1.refresh_token).await.is_err(),
        "reusar un refresh token rotado debe fallar"
    );
    // Tras revocar la familia, el token rotado válido tampoco sirve.
    assert!(
        svc.refresh(&pair2.refresh_token).await.is_err(),
        "la familia revocada invalida también el token vigente"
    );

    cleanup_tokens(&admin, email).await;
}

#[tokio::test]
async fn logout_revokes_family() {
    let email = "clerk@org1.test";
    let admin = admin_pool().await;
    cleanup_tokens(&admin, email).await;
    let svc = AuthService::new(admin.clone(), config());

    let pair = svc.login(email, PASSWORD).await.unwrap();
    svc.logout(&pair.refresh_token).await.expect("logout");
    assert!(
        svc.refresh(&pair.refresh_token).await.is_err(),
        "tras logout el refresh token está revocado"
    );

    cleanup_tokens(&admin, email).await;
}

#[tokio::test]
async fn refresh_rejected_when_user_deactivated() {
    // Usuario propio (org2) para no chocar con los tests de org1.
    let email = "clerk@org2.test";
    let admin = admin_pool().await;
    cleanup_tokens(&admin, email).await;
    let svc = AuthService::new(admin.clone(), config());

    let pair = svc.login(email, PASSWORD).await.unwrap();

    set_active(&admin, email, false).await;
    let result = svc.refresh(&pair.refresh_token).await;
    // Reactivar SIEMPRE antes de afirmar, para no dejar el seed corrupto.
    set_active(&admin, email, true).await;

    assert!(result.is_err(), "un usuario inactivo no puede rotar tokens");

    cleanup_tokens(&admin, email).await;
}
