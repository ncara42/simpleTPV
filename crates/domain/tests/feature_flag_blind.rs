//! Integración de feature flags (#152) contra Postgres con RLS: precedencia
//! override de tienda ?? default de org ?? default del código (true).
//!
//! Usa una KEY ÚNICA por test (no `blind_returns`) para no interferir con otros
//! tests que corren en paralelo y dependen del gate real de la devolución ciega.

use std::time::Duration;

use simpletpv_domain::feature_flags::{assert_flag_enabled, is_flag_enabled};
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
    store: Uuid,
    key: String,
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    let store = Uuid::new_v4();
    let code = format!("F{}", &store.simple().to_string()[..8]);
    sqlx::query(
        r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(store)
    .bind(org)
    .bind(format!("Tienda {code}"))
    .bind(&code)
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        key: format!("test_flag_{}", Uuid::new_v4().simple()),
    }
}

async fn set_flag(c: &Ctx, store_id: Option<Uuid>, enabled: bool) {
    sqlx::query(
        r#"INSERT INTO "FeatureFlag" (id, "organizationId", "storeId", key, enabled, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, now())"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(store_id)
    .bind(&c.key)
    .bind(enabled)
    .execute(&c.admin)
    .await
    .unwrap();
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "FeatureFlag" WHERE "organizationId" = $1 AND key = $2"#)
        .bind(c.org)
        .bind(&c.key)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Store" WHERE id = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn flag_ausente_esta_activo_por_default() {
    let c = setup().await;
    assert!(is_flag_enabled(&c.app, c.org, &c.key, Some(c.store))
        .await
        .unwrap());
    assert!(assert_flag_enabled(&c.app, c.org, &c.key, Some(c.store))
        .await
        .is_ok());
    teardown(&c).await;
}

#[tokio::test]
async fn flag_org_off_da_forbidden() {
    let c = setup().await;
    set_flag(&c, None, false).await; // default de org apagado
    assert!(!is_flag_enabled(&c.app, c.org, &c.key, Some(c.store))
        .await
        .unwrap());
    assert_eq!(
        assert_flag_enabled(&c.app, c.org, &c.key, Some(c.store))
            .await
            .err(),
        Some(AppError::Forbidden)
    );
    teardown(&c).await;
}

#[tokio::test]
async fn override_de_tienda_gana_sobre_org_off() {
    let c = setup().await;
    set_flag(&c, None, false).await; // org apagado
    set_flag(&c, Some(c.store), true).await; // pero esta tienda lo enciende
    assert!(is_flag_enabled(&c.app, c.org, &c.key, Some(c.store))
        .await
        .unwrap());
    teardown(&c).await;
}
