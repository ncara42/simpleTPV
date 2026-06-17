//! Integración de API keys (#154, IT-18) contra Postgres con RLS: alta (key en
//! claro una vez + hash en BD), listado, lookup por hash (BYPASSRLS), caducidad
//! y revocado.

use std::time::Duration;

use simpletpv_domain::api_keys::{service, CreateApiKey};
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
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "ApiKey" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(&admin)
        .await
        .unwrap();
    Ctx { admin, app, org }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "ApiKey" WHERE "organizationId" = $1"#)
        .bind(c.org)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn alta_lookup_caducidad_y_revocado() {
    let c = setup().await;

    // Alta sin TTL: key en claro stpv_..., y en BD vive el hash.
    let created = service::generate(
        &c.app,
        c.org,
        CreateApiKey {
            name: "Integración mayorista".into(),
            price_list_id: None,
            ttl_days: None,
        },
    )
    .await
    .unwrap();
    assert!(created.key.starts_with("stpv_"));
    assert_eq!(created.prefix.len(), 8);

    // Lookup por hash (BYPASSRLS) resuelve org y la key no está revocada/caducada.
    let hashed = service::hash_key(&created.key);
    let rec = service::find_by_hash(&c.admin, &hashed)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(rec.organization_id, c.org);
    assert!(rec.revoked_at.is_none());
    assert!(rec.expires_at.is_none());

    // touch_last_used no falla.
    service::touch_last_used(&c.admin, rec.id).await.unwrap();

    // Una key con TTL fija expiresAt en el futuro.
    let ttl = service::generate(
        &c.app,
        c.org,
        CreateApiKey {
            name: "Con TTL".into(),
            price_list_id: None,
            ttl_days: Some(30),
        },
    )
    .await
    .unwrap();
    let ttl_rec = service::find_by_hash(&c.admin, &service::hash_key(&ttl.key))
        .await
        .unwrap()
        .unwrap();
    assert!(ttl_rec.expires_at.is_some());

    // Listado: 2 keys, ninguna expone el hash (el modelo no lo lleva).
    let listed = service::list(&c.app, c.org).await.unwrap();
    assert_eq!(listed.len(), 2);

    // TTL inválido → BadRequest.
    assert_eq!(
        service::generate(
            &c.app,
            c.org,
            CreateApiKey {
                name: "Mala".into(),
                price_list_id: None,
                ttl_days: Some(0)
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Revocar marca revokedAt (visible en el lookup); revocar inexistente → NotFound.
    service::revoke(&c.app, c.org, created.id).await.unwrap();
    let revoked = service::find_by_hash(&c.admin, &hashed)
        .await
        .unwrap()
        .unwrap();
    assert!(revoked.revoked_at.is_some());
    assert_eq!(
        service::revoke(&c.app, c.org, Uuid::new_v4()).await.err(),
        Some(AppError::NotFound)
    );

    teardown(&c).await;
}
