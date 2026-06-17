//! Integración de gestión de feature flags (#154) contra Postgres con RLS:
//! resolución efectiva, precedencia tienda > org > código, y set/clear con
//! restricción de nivel (org-wide solo ADMIN).

use std::time::Duration;

use simpletpv_domain::feature_flags::service;
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
    sqlx::query(r#"DELETE FROM "FeatureFlag" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(&admin)
        .await
        .unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        user,
    }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "FeatureFlag" WHERE "organizationId" = $1"#)
        .bind(c.org)
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
async fn resolucion_precedencia_y_gestion() {
    let c = setup().await;

    // Sin filas: todo el catálogo cae al default del código (true).
    let all = service::resolve_all(&c.app, c.org, None).await.unwrap();
    assert_eq!(all.get("blind_returns"), Some(&true));
    assert_eq!(all.get("b2b"), Some(&true));

    // Apaga b2b a nivel ORG (solo ADMIN). is_admin=true, is_org_wide=true.
    service::set_flag(&c.app, c.org, c.user, true, true, "b2b".into(), false, None)
        .await
        .unwrap();
    let all = service::resolve_all(&c.app, c.org, None).await.unwrap();
    assert_eq!(all.get("b2b"), Some(&false)); // override de org gana sobre el default

    // Un no-ADMIN no puede tocar el nivel org → Forbidden.
    assert_eq!(
        service::set_flag(&c.app, c.org, c.user, false, true, "b2b".into(), true, None)
            .await
            .err(),
        Some(AppError::Forbidden)
    );

    // Override de TIENDA reactiva b2b solo en esa tienda (precedencia tienda > org).
    service::set_flag(
        &c.app,
        c.org,
        c.user,
        true,
        true,
        "b2b".into(),
        true,
        Some(c.store),
    )
    .await
    .unwrap();
    let store_view = service::resolve_all(&c.app, c.org, Some(c.store))
        .await
        .unwrap();
    assert_eq!(store_view.get("b2b"), Some(&true)); // tienda gana
    let org_view = service::resolve_all(&c.app, c.org, None).await.unwrap();
    assert_eq!(org_view.get("b2b"), Some(&false)); // org sigue apagada

    // list incluye catálogo (4) + las 2 filas explícitas.
    let listed = service::list(&c.app, c.org).await.unwrap();
    assert_eq!(listed.catalog.len(), 4);
    assert_eq!(listed.flags.len(), 2);

    // Key fuera del catálogo → BadRequest.
    assert_eq!(
        service::set_flag(
            &c.app,
            c.org,
            c.user,
            true,
            true,
            "inventada".into(),
            false,
            None
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Quita el override de tienda → vuelve al default de org (apagado).
    service::clear_flag(
        &c.app,
        c.org,
        c.user,
        true,
        true,
        "b2b".into(),
        Some(c.store),
    )
    .await
    .unwrap();
    let store_view = service::resolve_all(&c.app, c.org, Some(c.store))
        .await
        .unwrap();
    assert_eq!(store_view.get("b2b"), Some(&false));

    // Quita el default de org → vuelve al default del código (encendido).
    service::clear_flag(&c.app, c.org, c.user, true, true, "b2b".into(), None)
        .await
        .unwrap();
    let all = service::resolve_all(&c.app, c.org, None).await.unwrap();
    assert_eq!(all.get("b2b"), Some(&true));

    teardown(&c).await;
}
