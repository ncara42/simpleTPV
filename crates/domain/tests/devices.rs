//! Integración de dispositivos (#154) contra Postgres con RLS: alta con token,
//! emparejado/autorización, estado por token y revocado.

use std::time::Duration;

use simpletpv_domain::devices::{service, CreateDevice, PairDevice};
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
    let code = format!("D{}", &store.simple().to_string()[..8]);
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
        user,
    }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "OfficialDevice" WHERE "storeId" = $1"#)
        .bind(c.store)
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
async fn alta_emparejado_estado_y_revocado() {
    let c = setup().await;

    // Alta: devuelve token en claro y nace no autorizado.
    let created = service::create(
        &c.app,
        c.org,
        CreateDevice {
            store_id: c.store,
            name: "Caja 1".into(),
        },
    )
    .await
    .unwrap();
    assert!(!created.authorized);
    assert_eq!(created.pairing_token.len(), 12);
    let token = created.pairing_token.clone();

    // Antes de emparejar, el estado por token es no autorizado.
    let st = service::status(&c.app, c.org, Some(token.clone()))
        .await
        .unwrap();
    assert!(!st.authorized);
    assert!(st.device.is_none());

    // Sin token → no autorizado.
    let st_none = service::status(&c.app, c.org, None).await.unwrap();
    assert!(!st_none.authorized);

    // Emparejar (org-wide) autoriza y fija pairedAt/lastSeenAt.
    let paired = service::pair(
        &c.app,
        c.org,
        c.user,
        true,
        PairDevice {
            pairing_token: token.clone(),
        },
    )
    .await
    .unwrap();
    assert!(paired.authorized);
    let dev = paired.device.expect("device");
    assert_eq!(dev.id, created.device.id);
    assert!(dev.paired_at.is_some());

    // Ahora el estado por token es autorizado.
    let st2 = service::status(&c.app, c.org, Some(token.clone()))
        .await
        .unwrap();
    assert!(st2.authorized);
    assert!(st2.device.unwrap().last_seen_at.is_some());

    // Listado incluye el dispositivo autorizado.
    let list = service::find_all(&c.app, c.org, Some(c.store))
        .await
        .unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].authorized);

    // Token inexistente al emparejar → NotFound.
    assert_eq!(
        service::pair(
            &c.app,
            c.org,
            c.user,
            true,
            PairDevice {
                pairing_token: "ABCDEF012345".into()
            },
        )
        .await
        .err(),
        Some(AppError::NotFound)
    );

    // Token con formato inválido → BadRequest.
    assert_eq!(
        service::pair(
            &c.app,
            c.org,
            c.user,
            true,
            PairDevice {
                pairing_token: "nope".into()
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Revocado: desaparece y un segundo intento es NotFound.
    service::revoke(&c.app, c.org, created.device.id)
        .await
        .unwrap();
    assert_eq!(
        service::revoke(&c.app, c.org, created.device.id)
            .await
            .err(),
        Some(AppError::NotFound)
    );
    let empty = service::find_all(&c.app, c.org, Some(c.store))
        .await
        .unwrap();
    assert!(empty.is_empty());

    teardown(&c).await;
}
