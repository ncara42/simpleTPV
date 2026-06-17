//! Integración de la devolución CIEGA (sin ticket) con PIN/4-ojos (slice 2):
//! PIN inválido → Forbidden; PIN de un MANAGER (distinto del iniciador) → repone
//! stock SIN lote con authorizedBy; el iniciador NO puede autoaprobarse (4-ojos).

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::returns::{service, BlindReturnLine, CreateBlindReturn};
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

#[tokio::test]
async fn devolucion_ciega_pin_4ojos() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif='B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    let manager: Uuid =
        sqlx::query_scalar(r#"SELECT id FROM "User" WHERE email='manager@org1.test'"#)
            .fetch_one(&admin)
            .await
            .unwrap();
    let clerk: Uuid = sqlx::query_scalar(r#"SELECT id FROM "User" WHERE email='clerk@org1.test'"#)
        .fetch_one(&admin)
        .await
        .unwrap();

    // Tienda propia + PIN del manager + acceso del clerk.
    let store = Uuid::new_v4();
    let code = format!("B{}", &store.simple().to_string()[..8]);
    sqlx::query(r#"INSERT INTO "Store" (id,"organizationId",name,code) VALUES ($1,$2,$3,$4)"#)
        .bind(store)
        .bind(org)
        .bind(format!("T {code}"))
        .bind(&code)
        .execute(&admin)
        .await
        .unwrap();
    let pin_hash = bcrypt::hash("4321", 4).unwrap();
    sqlx::query(r#"UPDATE "User" SET "pinHash"=$2 WHERE id=$1"#)
        .bind(manager)
        .bind(&pin_hash)
        .execute(&admin)
        .await
        .unwrap();
    sqlx::query(
        r#"INSERT INTO "UserStore" ("userId","storeId") VALUES ($1,$2) ON CONFLICT DO NOTHING"#,
    )
    .bind(clerk)
    .bind(store)
    .execute(&admin)
    .await
    .unwrap();

    let product = products::service::create(
        &app,
        org,
        NewProduct {
            name: format!("BLIND-{}", Uuid::new_v4()),
            sale_price: Decimal::new(500, 2),
            description: None,
            barcode: None,
            sku: None,
            cost_price: None,
            tax_rate: None,
            sale_unit: None,
            unit_symbol: None,
            family_id: None,
            active: None,
        },
    )
    .await
    .unwrap()
    .id;

    let body = |pin: &str| CreateBlindReturn {
        store_id: store,
        reason: "sin ticket".into(),
        manager_pin: pin.to_owned(),
        lines: vec![BlindReturnLine {
            product_id: product,
            qty: Decimal::from(2),
        }],
    };

    // CLERK con PIN inválido → Forbidden.
    assert_eq!(
        service::create_blind(&app, org, clerk, false, body("0000"))
            .await
            .err(),
        Some(AppError::Forbidden)
    );

    // CLERK con el PIN del MANAGER → OK: authorizedBy = manager, stock +2 (sin lote).
    let r = service::create_blind(&app, org, clerk, false, body("4321"))
        .await
        .unwrap();
    assert_eq!(r.return_.authorized_by, Some(manager));
    assert!(r.return_.sale_id.is_none());
    let stock: Decimal =
        sqlx::query_scalar(r#"SELECT quantity FROM "Stock" WHERE "productId"=$1 AND "storeId"=$2"#)
            .bind(product)
            .bind(store)
            .fetch_one(&admin)
            .await
            .unwrap();
    assert_eq!(stock, Decimal::from(2));

    // 4-OJOS: el MANAGER no puede autoaprobarse con su propio PIN (id != userId).
    assert_eq!(
        service::create_blind(&app, org, manager, true, body("4321"))
            .await
            .err(),
        Some(AppError::Forbidden)
    );

    // limpieza.
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "storeId"=$1"#,
        r#"DELETE FROM "StockAlert" WHERE "storeId"=$1"#,
        r#"DELETE FROM "Stock" WHERE "storeId"=$1"#,
        r#"DELETE FROM "ReturnLine" WHERE "returnId" IN (SELECT id FROM "Return" WHERE "storeId"=$1)"#,
        r#"DELETE FROM "Return" WHERE "storeId"=$1"#,
        r#"DELETE FROM "UserStore" WHERE "storeId"=$1"#,
        r#"DELETE FROM "Store" WHERE id=$1"#,
    ] {
        sqlx::query(sql).bind(store).execute(&admin).await.unwrap();
    }
    sqlx::query(r#"DELETE FROM "Product" WHERE id=$1"#)
        .bind(product)
        .execute(&admin)
        .await
        .unwrap();
    sqlx::query(r#"UPDATE "User" SET "pinHash"=NULL WHERE id=$1"#)
        .bind(manager)
        .execute(&admin)
        .await
        .unwrap();
}
