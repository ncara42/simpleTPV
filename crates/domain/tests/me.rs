//! Integración de los recursos del usuario (#154) contra Postgres con RLS:
//! perfil (rol/identidad) y preferencias (upsert JSON, clave válida, cota).

use std::time::Duration;

use serde_json::json;
use simpletpv_domain::me::{preferences, profile};
use simpletpv_shared::AppError;
use sqlx::postgres::{PgPool, PgPoolOptions};
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

struct Ctx {
    admin: PgPool,
    app: PgPool,
    org: Uuid,
    user: Uuid,
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    let user: Uuid = sqlx::query_scalar(
        r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
    )
    .bind(org)
    .fetch_one(&admin)
    .await
    .unwrap();
    sqlx::query(r#"DELETE FROM "UserPreference" WHERE "userId" = $1"#)
        .bind(user)
        .execute(&admin)
        .await
        .unwrap();
    Ctx {
        admin,
        app,
        org,
        user,
    }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "UserPreference" WHERE "userId" = $1"#)
        .bind(c.user)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn perfil_devuelve_rol_e_identidad() {
    let c = setup().await;
    let me = profile(&c.app, c.org, c.user, "ADMIN").await.unwrap();
    assert_eq!(me.role, "ADMIN");
    assert!(!me.email.is_empty()); // el usuario semilla tiene email
    teardown(&c).await;
}

#[tokio::test]
async fn preferencias_upsert_validacion_y_cota() {
    let c = setup().await;

    // Vacío al principio.
    let empty = preferences::get_all(&c.app, c.org, c.user).await.unwrap();
    assert!(empty.is_empty());

    // Upsert de un objeto JSON.
    let saved = preferences::set(
        &c.app,
        c.org,
        c.user,
        "dashboard.cards".into(),
        json!({ "order": ["ventas", "stock"], "compact": true }),
    )
    .await
    .unwrap();
    assert_eq!(saved.key, "dashboard.cards");
    assert_eq!(saved.value["compact"], json!(true));

    // Se relee como mapa key→value.
    let all = preferences::get_all(&c.app, c.org, c.user).await.unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all["dashboard.cards"]["order"][0], json!("ventas"));

    // Upsert sobre la misma clave reemplaza el valor.
    let saved2 = preferences::set(&c.app, c.org, c.user, "dashboard.cards".into(), json!(42))
        .await
        .unwrap();
    assert_eq!(saved2.value, json!(42));
    let all = preferences::get_all(&c.app, c.org, c.user).await.unwrap();
    assert_eq!(all.len(), 1); // sigue siendo una sola fila

    // Clave inválida → BadRequest.
    assert_eq!(
        preferences::set(&c.app, c.org, c.user, "clave con espacios".into(), json!(1))
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    // Valor que supera la cota (16KB) → BadRequest.
    let big = "x".repeat(17 * 1024);
    assert_eq!(
        preferences::set(&c.app, c.org, c.user, "grande".into(), json!(big))
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    teardown(&c).await;
}
