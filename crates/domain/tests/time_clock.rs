//! Integración del control horario (#153) contra Postgres con RLS: fichaje con
//! dispositivo oficial, validación de secuencia (máquina de estados), estado de
//! hoy e historial agregado por jornada.

use std::time::Duration;

use simpletpv_domain::time_clock::{service, CreateEntry};
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
    device: Uuid,
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
    let code = format!("C{}", &store.simple().to_string()[..8]);
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
    let device = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "OfficialDevice" (id, "organizationId", "storeId", name, "pairingToken", authorized)
           VALUES ($1, $2, $3, 'Disp Test', $4, true)"#,
    )
    .bind(device)
    .bind(org)
    .bind(store)
    .bind(Uuid::new_v4().to_string())
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        user,
        device,
    }
}

async fn teardown(c: &Ctx) {
    for sql in [
        r#"DELETE FROM "TimeClockEntry" WHERE "storeId" = $1"#,
        r#"DELETE FROM "OfficialDevice" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Store" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(c.store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
}

fn entry(store: Uuid, device: Option<Uuid>, kind: &str) -> CreateEntry {
    CreateEntry {
        store_id: store,
        device_id: device,
        entry_type: kind.into(),
    }
}

#[tokio::test]
async fn fichaje_maquina_de_estados_y_dispositivo() {
    let c = setup().await;
    // CLOCK_IN OK.
    let e = service::create(
        &c.app,
        c.org,
        c.user,
        true,
        entry(c.store, Some(c.device), "CLOCK_IN"),
    )
    .await
    .unwrap();
    assert_eq!(e.entry_type.as_str(), "CLOCK_IN");

    // Doble entrada → Conflict (máquina de estados).
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            c.user,
            true,
            entry(c.store, Some(c.device), "CLOCK_IN")
        )
        .await
        .err(),
        Some(AppError::Conflict)
    );

    // Sin dispositivo → Forbidden.
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            c.user,
            true,
            entry(c.store, None, "BREAK_START")
        )
        .await
        .err(),
        Some(AppError::Forbidden)
    );
    // Dispositivo inexistente → NotFound.
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            c.user,
            true,
            entry(c.store, Some(Uuid::new_v4()), "BREAK_START")
        )
        .await
        .err(),
        Some(AppError::NotFound)
    );

    // current → la última (CLOCK_IN).
    let cur = service::current(&c.app, c.org, c.store, c.user)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cur.entry_type.as_str(), "CLOCK_IN");

    // today → estado IN, en curso.
    let today = service::today(&c.app, c.org, c.store, c.user)
        .await
        .unwrap();
    assert_eq!(today.status, "IN");
    assert!(today.running_since.is_some());

    // CLOCK_OUT → today pasa a OUT.
    service::create(
        &c.app,
        c.org,
        c.user,
        true,
        entry(c.store, Some(c.device), "CLOCK_OUT"),
    )
    .await
    .unwrap();
    let today = service::today(&c.app, c.org, c.store, c.user)
        .await
        .unwrap();
    assert_eq!(today.status, "OUT");

    teardown(&c).await;
}

#[tokio::test]
async fn historial_agrega_por_jornada() {
    let c = setup().await;
    service::create(
        &c.app,
        c.org,
        c.user,
        true,
        entry(c.store, Some(c.device), "CLOCK_IN"),
    )
    .await
    .unwrap();
    service::create(
        &c.app,
        c.org,
        c.user,
        true,
        entry(c.store, Some(c.device), "CLOCK_OUT"),
    )
    .await
    .unwrap();

    let rows = service::history(&c.app, c.org, c.user, true, c.store, None, None, None, 7)
        .await
        .unwrap();
    let mine = rows
        .iter()
        .find(|r| r.user_id == c.user && r.store_id == c.store);
    let j = mine.expect("una jornada del usuario en la tienda");
    assert!(j.first_in.is_some());
    assert!(j.last_out.is_some());
    assert!(j.worked_ms >= 0);

    teardown(&c).await;
}
