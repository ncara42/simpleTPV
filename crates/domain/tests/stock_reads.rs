//! Integración de las lecturas dashboard de stock (slice B): by_store, by_product,
//! to_reorder, alerts y el aislamiento por tienda (SEC-01) para CLERK.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::stock::model::AlertType;
use simpletpv_domain::stock::{service, Adjust, SetMin, StockLevel};
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

async fn scalar_uuid(admin: &PgPool, sql: &str, bind: &str) -> Uuid {
    sqlx::query_scalar(sql)
        .bind(bind)
        .fetch_one(admin)
        .await
        .expect("fila presente")
}

async fn make_product(app: &PgPool, org: Uuid) -> Uuid {
    products::service::create(
        app,
        org,
        NewProduct {
            name: format!("STKR-{}", Uuid::new_v4()),
            sale_price: Decimal::new(100, 2),
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
    .expect("crear producto")
    .id
}

async fn cleanup(admin: &PgPool, product: Uuid) {
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "productId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "productId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "productId" = $1"#,
        r#"DELETE FROM "Product" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(product)
            .execute(admin)
            .await
            .expect("limpiar");
    }
}

#[tokio::test]
async fn lecturas_org_wide_by_store_by_product_to_reorder_y_alerts() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = scalar_uuid(
        &admin,
        r#"SELECT id FROM "Organization" WHERE nif = $1"#,
        "B11111111",
    )
    .await;
    let store = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM "Store" WHERE "organizationId" = $1 ORDER BY code LIMIT 1"#,
    )
    .bind(org1)
    .fetch_one(&admin)
    .await
    .unwrap();
    let user = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
    )
    .bind(org1)
    .fetch_one(&admin)
    .await
    .unwrap();
    let product = make_product(&app, org1).await;

    // Stock 42 en la tienda.
    service::adjust(
        &app,
        org1,
        user,
        Adjust {
            product_id: product,
            store_id: store,
            new_quantity: Decimal::new(42, 0),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();

    // by_store (org-wide): contiene el producto, nivel green.
    let rows = service::by_store(&app, org1, store, user, true)
        .await
        .unwrap();
    let mine = rows
        .iter()
        .find(|r| r.product_id == product)
        .expect("producto en la tienda");
    assert_eq!(mine.quantity, Decimal::new(42, 0));
    assert_eq!(mine.level, StockLevel::Green);

    // by_product: aparece la tienda.
    let by_prod = service::by_product(&app, org1, product).await.unwrap();
    assert!(by_prod
        .iter()
        .any(|r| r.store_id == store && r.quantity == Decimal::new(42, 0)));

    // to_reorder: con mínimo 100, el nivel pasa a yellow → entra en "para pedir".
    service::set_min(
        &app,
        org1,
        SetMin {
            product_id: product,
            store_id: store,
            min_stock: Decimal::new(100, 0),
        },
    )
    .await
    .unwrap();
    let reorder = service::to_reorder(&app, org1, store, user, true)
        .await
        .unwrap();
    assert!(
        reorder.iter().any(|r| r.product_id == product),
        "stock bajo entra en to-reorder"
    );

    // alerts: el mínimo 100 > 42 disparó LOW_STOCK; sin sustituto → critical.
    let alerts = service::alerts(&app, org1, Some(store), false)
        .await
        .unwrap();
    let alert = alerts
        .iter()
        .find(|a| a.product_id == product)
        .expect("alerta presente");
    assert_eq!(alert.alert_type, AlertType::LowStock);
    assert!(!alert.has_substitute_stock);

    cleanup(&admin, product).await;
}

#[tokio::test]
async fn clerk_solo_ve_stock_de_sus_tiendas() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = scalar_uuid(
        &admin,
        r#"SELECT id FROM "Organization" WHERE nif = $1"#,
        "B11111111",
    )
    .await;
    let store = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM "Store" WHERE "organizationId" = $1 ORDER BY code LIMIT 1"#,
    )
    .bind(org1)
    .fetch_one(&admin)
    .await
    .unwrap();
    let admin_user = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
    )
    .bind(org1)
    .fetch_one(&admin)
    .await
    .unwrap();
    let clerk = scalar_uuid(
        &admin,
        r#"SELECT id FROM "User" WHERE email = $1"#,
        "clerk@org1.test",
    )
    .await;
    let product = make_product(&app, org1).await;
    service::adjust(
        &app,
        org1,
        admin_user,
        Adjust {
            product_id: product,
            store_id: store,
            new_quantity: Decimal::new(5, 0),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();

    // CLERK sin asignación a la tienda → 403 (is_org_wide=false).
    let denied = service::by_store(&app, org1, store, clerk, false).await;
    assert_eq!(denied.err(), Some(AppError::Forbidden));

    // Asignamos la tienda al CLERK → ya puede verla.
    sqlx::query(
        r#"INSERT INTO "UserStore" ("userId", "storeId") VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
    )
    .bind(clerk)
    .bind(store)
    .execute(&admin)
    .await
    .unwrap();
    let allowed = service::by_store(&app, org1, store, clerk, false)
        .await
        .unwrap();
    assert!(allowed.iter().any(|r| r.product_id == product));

    sqlx::query(r#"DELETE FROM "UserStore" WHERE "userId" = $1 AND "storeId" = $2"#)
        .bind(clerk)
        .bind(store)
        .execute(&admin)
        .await
        .unwrap();
    cleanup(&admin, product).await;
}
