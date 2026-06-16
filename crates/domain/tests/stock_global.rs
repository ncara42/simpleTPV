//! Integración de la vista global de stock (slice C): agregación por producto en
//! varias tiendas + rotación. Requiere el Postgres dev sembrado (2 tiendas/org).

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::stock::model::Rotation;
use simpletpv_domain::stock::{service, Adjust};
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
async fn global_agrega_por_producto_en_varias_tiendas() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    let stores: Vec<Uuid> = sqlx::query_scalar(
        r#"SELECT id FROM "Store" WHERE "organizationId" = $1 ORDER BY code LIMIT 2"#,
    )
    .bind(org1)
    .fetch_all(&admin)
    .await
    .unwrap();
    assert!(stores.len() >= 2, "el seed trae 2 tiendas por org");
    let user: Uuid = sqlx::query_scalar(
        r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
    )
    .bind(org1)
    .fetch_one(&admin)
    .await
    .unwrap();

    let product = products::service::create(
        &app,
        org1,
        NewProduct {
            name: format!("GLB-{}", Uuid::new_v4()),
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
    .unwrap()
    .id;

    // Stock 10 en la tienda A y 5 en la B.
    service::adjust(
        &app,
        org1,
        user,
        Adjust {
            product_id: product,
            store_id: stores[0],
            new_quantity: Decimal::new(10, 0),
            reason: "a".into(),
        },
    )
    .await
    .unwrap();
    service::adjust(
        &app,
        org1,
        user,
        Adjust {
            product_id: product,
            store_id: stores[1],
            new_quantity: Decimal::new(5, 0),
            reason: "b".into(),
        },
    )
    .await
    .unwrap();

    let global = service::global(&app, org1).await.unwrap();
    let entry = global
        .iter()
        .find(|e| e.product_id == product)
        .expect("producto en global");
    assert_eq!(entry.total, Decimal::new(15, 0), "total = suma de tiendas");
    assert_eq!(entry.stores.len(), 2, "dos tiendas con stock");
    assert_eq!(
        entry.rotation,
        Rotation::Baja,
        "sin ventas recientes → baja"
    );

    cleanup(&admin, product).await;
}
