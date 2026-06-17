//! Integración de caja (#145/#146) contra Postgres con RLS: apertura (una OPEN
//! por tienda), movimientos directos y por aprobación (request→approve), cierre
//! con cuadre (esperado/diferencia) y registro de cierres.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::cash_sessions::model::{CashMovementStatus, CashSessionStatus};
use simpletpv_domain::cash_sessions::{
    service, CashMovementInput, CloseCashSession, OpenCashSession,
};
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
    let code = format!("K{}", &store.simple().to_string()[..8]);
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
    for sql in [
        r#"DELETE FROM "CashMovement" WHERE "storeId" = $1"#,
        r#"DELETE FROM "CashSession" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Store" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(c.store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
}

fn mov(kind: &str, amount: i64, reason: &str) -> CashMovementInput {
    CashMovementInput {
        movement_type: kind.into(),
        amount: Decimal::from(amount),
        reason: reason.into(),
    }
}

#[tokio::test]
async fn apertura_movimientos_aprobacion_y_cuadre() {
    let c = setup().await;

    let session = service::open(
        &c.app,
        c.org,
        c.user,
        true,
        OpenCashSession {
            store_id: c.store,
            opening_amount: Decimal::from(100),
        },
    )
    .await
    .unwrap();
    assert_eq!(session.status, CashSessionStatus::Open);

    // Segunda apertura de la misma tienda → BadRequest.
    assert_eq!(
        service::open(
            &c.app,
            c.org,
            c.user,
            true,
            OpenCashSession {
                store_id: c.store,
                opening_amount: Decimal::from(50),
            }
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // current → la sesión abierta.
    let cur = service::current(&c.app, c.org, c.user, true, c.store)
        .await
        .unwrap();
    assert_eq!(cur.unwrap().id, session.id);

    // Alta directa de un IN de 50 (APPROVED).
    let m_in = service::create_movement(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        mov("IN", 50, "fondo"),
    )
    .await
    .unwrap();
    assert_eq!(m_in.status, CashMovementStatus::Approved);

    // Solicitud de un OUT de 30 (PENDING) y su aprobación.
    let m_out = service::request_movement(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        mov("OUT", 30, "gasto"),
    )
    .await
    .unwrap();
    assert_eq!(m_out.status, CashMovementStatus::Pending);
    let pending = service::list_pending(&c.app, c.org).await.unwrap();
    assert!(pending.iter().any(|p| p.id == m_out.id));
    let approved = service::approve_movement(&c.app, c.org, c.user, true, m_out.id)
        .await
        .unwrap();
    assert_eq!(approved.status, CashMovementStatus::Approved);

    // Cierre: esperado = 100 + ventas(0) + (50 IN - 30 OUT = 20) - reembolsos(0) = 120.
    let closed = service::close(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        CloseCashSession {
            counted_amount: Decimal::from(120),
        },
    )
    .await
    .unwrap();
    assert_eq!(closed.status, CashSessionStatus::Closed);
    assert_eq!(closed.expected_amount, Some(Decimal::from(120)));
    assert_eq!(closed.difference, Some(Decimal::ZERO));

    // Registro de cierres incluye la sesión.
    let log = service::list_closed(&c.app, c.org, c.user, true, c.store, 30)
        .await
        .unwrap();
    assert!(log.iter().any(|s| s.id == session.id));

    // Movimiento sobre caja cerrada → BadRequest.
    assert_eq!(
        service::create_movement(
            &c.app,
            c.org,
            c.user,
            true,
            session.id,
            mov("IN", 10, "tarde")
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    teardown(&c).await;
}

#[tokio::test]
async fn denegar_solicitud_no_afecta_cuadre() {
    let c = setup().await;
    let session = service::open(
        &c.app,
        c.org,
        c.user,
        true,
        OpenCashSession {
            store_id: c.store,
            opening_amount: Decimal::from(200),
        },
    )
    .await
    .unwrap();

    let req = service::request_movement(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        mov("OUT", 75, "dudoso"),
    )
    .await
    .unwrap();
    let denied = service::deny_movement(&c.app, c.org, c.user, true, req.id)
        .await
        .unwrap();
    assert_eq!(denied.status, CashMovementStatus::Denied);
    // Reaprobar un denegado → BadRequest (ya no está pendiente).
    assert_eq!(
        service::approve_movement(&c.app, c.org, c.user, true, req.id)
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    // Cierre: el DENIED no cuenta → esperado = 200, contado 200 → diff 0.
    let closed = service::close(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        CloseCashSession {
            counted_amount: Decimal::from(200),
        },
    )
    .await
    .unwrap();
    assert_eq!(closed.difference, Some(Decimal::ZERO));

    teardown(&c).await;
}

/// #146 D-6: al cerrar caja, las solicitudes que siguen PENDING se auto-deniegan
/// y NO entran en el cuadre (solo cuentan las APPROVED).
#[tokio::test]
async fn cierre_autodeniega_pendientes_y_no_afectan_cuadre() {
    let c = setup().await;
    let session = service::open(
        &c.app,
        c.org,
        c.user,
        true,
        OpenCashSession {
            store_id: c.store,
            opening_amount: Decimal::from(100),
        },
    )
    .await
    .unwrap();

    // Una solicitud que queda PENDING (nunca se aprueba ni deniega).
    let req = service::request_movement(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        mov("OUT", 40, "pendiente al cierre"),
    )
    .await
    .unwrap();
    assert_eq!(req.status, CashMovementStatus::Pending);

    // Cierre con el PENDING vivo: esperado = 100 (el OUT no cuenta), contado 100 → diff 0.
    let closed = service::close(
        &c.app,
        c.org,
        c.user,
        true,
        session.id,
        CloseCashSession {
            counted_amount: Decimal::from(100),
        },
    )
    .await
    .unwrap();
    assert_eq!(closed.expected_amount, Some(Decimal::from(100)));
    assert_eq!(closed.difference, Some(Decimal::ZERO));

    // El movimiento que estaba PENDING ha quedado auto-denegado.
    let movs = service::movements(&c.app, c.org, c.user, true, session.id)
        .await
        .unwrap();
    let m = movs
        .iter()
        .find(|m| m.id == req.id)
        .expect("movimiento presente");
    assert_eq!(m.status, CashMovementStatus::Denied);

    teardown(&c).await;
}
