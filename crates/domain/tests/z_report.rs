//! Integración del cierre Z (#124) contra Postgres con RLS: arqueo del día de
//! una tienda (ventas COMPLETED/VOIDED), totales, desgloses y validaciones.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::z_report::service;
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
    product: Uuid,
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
    let code = format!("Z{}", &store.simple().to_string()[..7]);
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
    let product = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Product" (id, "organizationId", sku, name, "salePrice", "updatedAt")
           VALUES ($1, $2, $3, 'Prod Z', 10.00, now())"#,
    )
    .bind(product)
    .bind(org)
    .bind(format!("ZP{}", &product.simple().to_string()[..7]))
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        user,
        product,
    }
}

async fn teardown(c: &Ctx) {
    // SaleLine cascadea al borrar Sale; luego producto y tienda quedan libres.
    sqlx::query(r#"DELETE FROM "Sale" WHERE "storeId" = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(c.product)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Store" WHERE id = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
}

/// Venta del día con una línea (IVA 21%, total con IVA incluido).
async fn insert_sale(
    c: &Ctx,
    ticket: &str,
    status: &str,
    payment: &str,
    total: &str,
    created: &str,
) {
    let sale_id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Sale"
             (id, "organizationId", "storeId", "userId", "ticketNumber", status, "paymentMethod",
              subtotal, total, "discountTotal", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6::"SaleStatus", $7::"PaymentMethod",
              $8::numeric, $8::numeric, 0, $9::timestamp)"#,
    )
    .bind(sale_id)
    .bind(c.org)
    .bind(c.store)
    .bind(c.user)
    .bind(ticket)
    .bind(status)
    .bind(payment)
    .bind(total)
    .bind(created)
    .execute(&c.admin)
    .await
    .unwrap();
    sqlx::query(
        r#"INSERT INTO "SaleLine"
             (id, "organizationId", "saleId", "productId", name, "unitPrice", qty, "taxRate", "lineTotal")
           VALUES ($1, $2, $3, $4, 'Linea', $5::numeric, 1, 21, $5::numeric)"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(sale_id)
    .bind(c.product)
    .bind(total)
    .execute(&c.admin)
    .await
    .unwrap();
}

fn dec(s: &str) -> Decimal {
    s.parse().unwrap()
}

#[tokio::test]
async fn arqueo_del_dia_totales_y_validaciones() {
    let c = setup().await;

    // Dos COMPLETED (10 + 20) y una VOIDED el mismo día; otra venta de OTRO día.
    insert_sale(
        &c,
        "TZ-000001",
        "COMPLETED",
        "CASH",
        "10.00",
        "2026-06-01 09:00:00",
    )
    .await;
    insert_sale(
        &c,
        "TZ-000002",
        "VOIDED",
        "CARD",
        "5.00",
        "2026-06-01 10:00:00",
    )
    .await;
    insert_sale(
        &c,
        "TZ-000003",
        "COMPLETED",
        "CARD",
        "20.00",
        "2026-06-01 11:00:00",
    )
    .await;
    insert_sale(
        &c,
        "TZ-000004",
        "COMPLETED",
        "CASH",
        "99.00",
        "2026-06-02 09:00:00",
    )
    .await;

    let z = service::get_z_report(&c.app, c.org, c.user, true, c.store, "2026-06-01".into())
        .await
        .unwrap();
    assert_eq!(z.date, "2026-06-01");
    assert_eq!(z.ticket_count, 2); // solo COMPLETED del día
    assert_eq!(z.voided_count, 1);
    assert_eq!(z.total, dec("30.00")); // 10 + 20 (no la anulada, no el otro día)
    assert_eq!(z.first_ticket_number.as_deref(), Some("TZ-000001"));
    assert_eq!(z.last_ticket_number.as_deref(), Some("TZ-000003"));
    assert_eq!(z.payment_breakdown.len(), 2); // CASH + CARD
    assert_eq!(z.tax_breakdown.len(), 1); // todo 21%
    assert_eq!(z.tax_breakdown[0].tax_rate, dec("21"));

    // Tienda inexistente → NotFound.
    assert_eq!(
        service::get_z_report(
            &c.app,
            c.org,
            c.user,
            true,
            Uuid::new_v4(),
            "2026-06-01".into()
        )
        .await
        .err(),
        Some(AppError::NotFound)
    );

    // Fecha imposible → BadRequest.
    assert_eq!(
        service::get_z_report(&c.app, c.org, c.user, true, c.store, "2026-13-45".into())
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    teardown(&c).await;
}
