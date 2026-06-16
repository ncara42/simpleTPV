//! Integración del catálogo contra Postgres con RLS (port de
//! `products.integration.spec.ts`). Verifica el invariante clave: aislamiento por
//! tenant (org1 no ve ni toca productos de org2) + búsqueda ILIKE + CRUD.
//!
//! Requiere el Postgres dev sembrado (orgs B11111111 / B22222222).

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::service;
use simpletpv_domain::products::NewProduct;
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

/// Id de organización por NIF, vía el rol BYPASSRLS (como el test de NestJS).
async fn org_id(admin: &PgPool, nif: &str) -> Uuid {
    sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = $1"#)
        .bind(nif)
        .fetch_one(admin)
        .await
        .expect("seed ejecutado (organización presente)")
}

fn new_product(name: &str, price: Decimal, sku: Option<String>) -> NewProduct {
    NewProduct {
        name: name.to_owned(),
        sale_price: price,
        description: None,
        barcode: None,
        sku,
        cost_price: None,
        tax_rate: None,
        sale_unit: None,
        unit_symbol: None,
        family_id: None,
        active: None,
    }
}

#[tokio::test]
async fn un_producto_de_org1_no_es_visible_para_org2() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let org2 = org_id(&admin, "B22222222").await;

    let unique = format!("ITEST-{}", Uuid::new_v4());
    let created = service::create(
        &app,
        org1,
        new_product(&unique, Decimal::new(999, 2), Some(unique.clone())),
    )
    .await
    .expect("crear en org1");

    // org1 lo ve por búsqueda.
    let seen1 = service::find_all(&app, org1, Some(&unique), None)
        .await
        .expect("buscar org1");
    assert!(seen1.iter().any(|p| p.id == created.id), "org1 debe verlo");

    // org2 NO lo ve.
    let seen2 = service::find_all(&app, org2, Some(&unique), None)
        .await
        .expect("buscar org2");
    assert!(seen2.is_empty(), "org2 no debe ver productos de org1");

    // org2 no puede leerlo por id (404 por RLS).
    assert_eq!(
        service::find_one(&app, org2, created.id).await,
        Err(AppError::NotFound)
    );

    // Limpieza.
    service::remove(&app, org1, created.id)
        .await
        .expect("borrar en org1");
}

#[tokio::test]
async fn crud_completo_en_un_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;

    let unique = format!("CRUD-{}", Uuid::new_v4());
    let created = service::create(&app, org1, new_product(&unique, Decimal::new(150, 2), None))
        .await
        .expect("crear");
    assert_eq!(created.sale_price, Decimal::new(150, 2));
    assert_eq!(created.tax_rate, Decimal::new(21, 0), "default taxRate 21");
    assert_eq!(created.unit_symbol, "ud", "default unitSymbol");

    // find_one lo recupera.
    let fetched = service::find_one(&app, org1, created.id)
        .await
        .expect("leer");
    assert_eq!(fetched.id, created.id);

    // update parcial: cambia el precio, conserva el resto.
    let patch = serde_json::from_value(serde_json::json!({ "salePrice": 2.5 })).unwrap();
    let updated = service::update(&app, org1, created.id, patch)
        .await
        .expect("actualizar");
    assert_eq!(updated.sale_price, Decimal::new(250, 2));
    assert_eq!(updated.name, unique, "el nombre se conserva");

    // remove → luego find_one da NotFound.
    service::remove(&app, org1, created.id)
        .await
        .expect("borrar");
    assert_eq!(
        service::find_one(&app, org1, created.id).await,
        Err(AppError::NotFound)
    );
}
