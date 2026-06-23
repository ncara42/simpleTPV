//! Integración de `sales_stats` (S-10): la serie temporal diaria y la comparativa
//! con el periodo anterior se calculan sobre el MISMO `SalesFilter` que `GET /sales`
//! y SOLO sobre ventas COMPLETED. Cubre: serie no vacía con un punto por día,
//! `current` = KPIs del rango, `previous` desplazado atrás su propia duración, filtro
//! por tienda que acota, y `previous = None` cuando el filtro no acota un rango.
//!
//! Las ventas de prueba se insertan DIRECTAMENTE (admin pool) con `createdAt`/`total`
//! controlados — no se pasa por `service::create`. Así el test ejercita la consulta
//! de estadística (el código real de S-10) sobre datos repartidos por día/periodo de
//! forma determinista, sin depender de caja abierta, stock ni del flujo de creación.
//! La LECTURA va por el pool `app` con contexto de tenant (RLS), igual que en prod.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::sales::service::{self, SalesFilter};
use sqlx::postgres::{PgPool, PgPoolOptions};
use time::macros::format_description;
use time::{Date, PrimitiveDateTime, Time};
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
    store2: Uuid,
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
    let store = make_store(&admin, org).await;
    let store2 = make_store(&admin, org).await;
    Ctx {
        admin,
        app,
        org,
        store,
        store2,
        user,
    }
}

async fn make_store(admin: &PgPool, org: Uuid) -> Uuid {
    let store = Uuid::new_v4();
    let code = format!("S{}", &store.simple().to_string()[..8]);
    sqlx::query(
        r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(store)
    .bind(org)
    .bind(format!("Tienda {code}"))
    .bind(&code)
    .execute(admin)
    .await
    .unwrap();
    store
}

fn at_noon(day: &str) -> PrimitiveDateTime {
    PrimitiveDateTime::new(
        Date::parse(day, format_description!("[year]-[month]-[day]")).unwrap(),
        Time::from_hms(12, 0, 0).unwrap(),
    )
}

fn at_midnight(day: &str) -> PrimitiveDateTime {
    PrimitiveDateTime::new(
        Date::parse(day, format_description!("[year]-[month]-[day]")).unwrap(),
        Time::MIDNIGHT,
    )
}

/// Inserta una venta (admin, sin RLS de escritura en el test) en `store` con
/// `createdAt` y `total` controlados. `status` 'COMPLETED' o 'VOIDED'.
async fn insert_sale(c: &Ctx, store: Uuid, day: &str, total: i64, status: &str) -> Uuid {
    let id = Uuid::new_v4();
    let ticket = format!("S10-{}", &id.simple().to_string()[..10]);
    sqlx::query(
        r#"INSERT INTO "Sale"
             (id, "organizationId", "storeId", "userId", "ticketNumber", subtotal,
              "discountTotal", total, "paymentMethod", status, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'CARD'::"PaymentMethod",
             $7::"SaleStatus", $8)"#,
    )
    .bind(id)
    .bind(c.org)
    .bind(store)
    .bind(c.user)
    .bind(&ticket)
    .bind(Decimal::from(total))
    .bind(status)
    .bind(at_noon(day))
    .execute(&c.admin)
    .await
    .unwrap();
    id
}

fn filter(store: Uuid) -> SalesFilter {
    SalesFilter {
        store_id: Some(store),
        page: 1,
        page_size: 50,
        ..Default::default()
    }
}

async fn teardown(c: &Ctx) {
    for store in [c.store, c.store2] {
        sqlx::query(r#"DELETE FROM "Sale" WHERE "storeId" = $1"#)
            .bind(store)
            .execute(&c.admin)
            .await
            .unwrap();
        sqlx::query(r#"DELETE FROM "Store" WHERE id = $1"#)
            .bind(store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
}

/// La serie diaria tiene un punto por día con ventas COMPLETED y `current` agrega el
/// rango; `previous` (rango anterior equivalente) cuenta el periodo previo. Las
/// VOIDED no suman.
#[tokio::test]
async fn serie_diaria_y_comparativa_periodo_anterior() {
    let c = setup().await;

    // Periodo actual [10-mar, 12-mar): 10-mar → 1 venta (200); 11-mar → 2 ventas (100 + 100).
    insert_sale(&c, c.store, "2026-03-10", 200, "COMPLETED").await;
    insert_sale(&c, c.store, "2026-03-11", 100, "COMPLETED").await;
    insert_sale(&c, c.store, "2026-03-11", 100, "COMPLETED").await;
    // Una VOIDED el 11-mar: se ignora en serie y totales.
    insert_sale(&c, c.store, "2026-03-11", 999, "VOIDED").await;

    // Periodo anterior equivalente [08-mar, 10-mar): 1 venta de 300.
    insert_sale(&c, c.store, "2026-03-08", 300, "COMPLETED").await;

    let f = SalesFilter {
        from: Some(at_midnight("2026-03-10")),
        to: Some(at_midnight("2026-03-12")),
        ..filter(c.store)
    };
    let stats = service::sales_stats(&c.app, c.org, c.user, true, f)
        .await
        .unwrap();

    // Serie: dos buckets (10 y 11), ordenados; la VOIDED no añade ni infla el 11-mar.
    assert_eq!(
        stats.series.len(),
        2,
        "un punto por día con ventas COMPLETED"
    );
    assert_eq!(stats.series[0].bucket, "2026-03-10");
    assert_eq!(stats.series[0].count, 1);
    assert_eq!(stats.series[0].total, Decimal::from(200));
    assert_eq!(stats.series[1].bucket, "2026-03-11");
    assert_eq!(stats.series[1].count, 2);
    assert_eq!(stats.series[1].total, Decimal::from(200));

    // current: 3 tickets COMPLETED, 400 € (la VOIDED no suma).
    assert_eq!(stats.current.count, 3);
    assert_eq!(stats.current.total_amount, Decimal::from(400));

    // previous: rango [08-mar, 10-mar) → 1 ticket, 300 €.
    let prev = stats.previous.expect("hay rango → previous calculado");
    assert_eq!(prev.count, 1);
    assert_eq!(prev.total_amount, Decimal::from(300));

    teardown(&c).await;
}

/// El filtro por tienda acota la serie y los KPIs: las ventas de la otra tienda no
/// cuentan aunque caigan en el mismo rango.
#[tokio::test]
async fn filtro_por_tienda_reduce_la_estadistica() {
    let c = setup().await;

    insert_sale(&c, c.store, "2026-04-05", 100, "COMPLETED").await;
    insert_sale(&c, c.store, "2026-04-05", 100, "COMPLETED").await;
    insert_sale(&c, c.store2, "2026-04-05", 100, "COMPLETED").await;

    let range = |store: Uuid| SalesFilter {
        from: Some(at_midnight("2026-04-05")),
        to: Some(at_midnight("2026-04-06")),
        ..filter(store)
    };

    // Solo la tienda filtrada: 2 tickets, 200 €.
    let stats = service::sales_stats(&c.app, c.org, c.user, true, range(c.store))
        .await
        .unwrap();
    assert_eq!(stats.series.len(), 1);
    assert_eq!(stats.series[0].count, 2);
    assert_eq!(stats.current.count, 2);
    assert_eq!(stats.current.total_amount, Decimal::from(200));

    // Sin filtro de tienda → las 3 ventas (ambas tiendas) en el rango.
    let f_all = SalesFilter {
        store_id: None,
        from: Some(at_midnight("2026-04-05")),
        to: Some(at_midnight("2026-04-06")),
        page: 1,
        page_size: 50,
        ..Default::default()
    };
    let all = service::sales_stats(&c.app, c.org, c.user, true, f_all)
        .await
        .unwrap();
    assert_eq!(all.current.count, 3, "sin filtro de tienda suma ambas");

    teardown(&c).await;
}

/// Sin rango de fechas en el filtro, la comparativa se omite (`previous = None`); la
/// serie y `current` siguen calculándose.
#[tokio::test]
async fn sin_rango_no_hay_periodo_anterior() {
    let c = setup().await;

    insert_sale(&c, c.store, "2026-05-20", 150, "COMPLETED").await;

    let stats = service::sales_stats(&c.app, c.org, c.user, true, filter(c.store))
        .await
        .unwrap();

    assert!(stats.previous.is_none(), "sin from/to → sin comparativa");
    assert_eq!(stats.current.count, 1);
    assert_eq!(stats.current.total_amount, Decimal::from(150));
    assert_eq!(stats.series.len(), 1);
    assert_eq!(stats.series[0].bucket, "2026-05-20");

    teardown(&c).await;
}
