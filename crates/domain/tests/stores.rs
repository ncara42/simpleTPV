//! Integración de tiendas (#153) contra Postgres con RLS: CRUD, central única por
//! org, estado operativo y overrides de precio por tienda.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::stores::{service, CreateStore, SetStorePrice, UpdateStore, UpdateStoreOps};
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
    user: Uuid,
    tag: String,
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
    Ctx {
        admin,
        app,
        org,
        user,
        tag: Uuid::new_v4().simple().to_string()[..10].to_owned(),
    }
}

fn create_store(tag: &str, n: u8) -> CreateStore {
    CreateStore {
        name: format!("Tienda {tag}-{n}"),
        code: format!("{}{}", &tag[..6], n),
        address: None,
        active: None,
    }
}

async fn cleanup(c: &Ctx) {
    sqlx::query(
        r#"DELETE FROM "StorePrice" WHERE "storeId" IN (SELECT id FROM "Store" WHERE name LIKE $1)"#,
    )
    .bind(format!("Tienda {}%", c.tag))
    .execute(&c.admin)
    .await
    .unwrap();
    sqlx::query(r#"DELETE FROM "Store" WHERE name LIKE $1"#)
        .bind(format!("Tienda {}%", c.tag))
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Product" WHERE name LIKE $1"#)
        .bind(format!("SP-{}%", c.tag))
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn crud_central_y_ops() {
    let c = setup().await;
    let a = service::create(&c.app, c.org, create_store(&c.tag, 1))
        .await
        .unwrap();
    assert!(a.active && !a.is_central && !a.ops_verified);

    let upd = service::update(
        &c.app,
        c.org,
        a.id,
        UpdateStore {
            name: Some("Tienda Editada".into()),
            code: None,
            address: Some("Calle 1".into()),
            active: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(upd.name, "Tienda Editada");
    assert_eq!(upd.address.as_deref(), Some("Calle 1"));

    // Central única: marcar B desmarca A.
    let b = service::create(&c.app, c.org, create_store(&c.tag, 2))
        .await
        .unwrap();
    service::set_central(&c.app, c.org, a.id, true)
        .await
        .unwrap();
    service::set_central(&c.app, c.org, b.id, true)
        .await
        .unwrap();
    assert!(
        !service::find_one(&c.app, c.org, a.id)
            .await
            .unwrap()
            .is_central
    );
    assert!(
        service::find_one(&c.app, c.org, b.id)
            .await
            .unwrap()
            .is_central
    );

    // Estado operativo.
    let ops = service::update_ops(
        &c.app,
        c.org,
        a.id,
        c.user,
        true,
        UpdateStoreOps {
            verified: Some(true),
            incident: Some("puerta rota".into()),
        },
    )
    .await
    .unwrap();
    assert!(ops.ops_verified);
    assert_eq!(ops.ops_incident.as_deref(), Some("puerta rota"));
    assert!(ops.ops_updated_at.is_some());

    cleanup(&c).await;
}

#[tokio::test]
async fn overrides_de_precio_por_tienda() {
    let c = setup().await;
    let store = service::create(&c.app, c.org, create_store(&c.tag, 3))
        .await
        .unwrap();
    let sku = format!("SK{}", &c.tag[..8]);
    let product = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("SP-{}", c.tag),
            sale_price: Decimal::from(10),
            description: None,
            barcode: None,
            sku: Some(sku.clone()),
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

    // Set + list.
    service::set_price(
        &c.app,
        c.org,
        store.id,
        c.user,
        true,
        SetStorePrice {
            product_id: product,
            price: Decimal::new(550, 2), // 5.50
        },
    )
    .await
    .unwrap();
    let list = service::list_prices(&c.app, c.org, store.id, c.user, true)
        .await
        .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].price, Decimal::new(550, 2));
    assert_eq!(list[0].product.name, format!("SP-{}", c.tag));

    // Import CSV (sku,price): una válida.
    let csv = format!("sku,price\n{sku},3.25\n");
    let res = service::import_prices_csv(&c.app, c.org, store.id, c.user, true, &csv)
        .await
        .unwrap();
    assert_eq!(res.inserted, 1);
    // El upsert por SKU actualiza la misma fila (no duplica).
    let list = service::list_prices(&c.app, c.org, store.id, c.user, true)
        .await
        .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].price, Decimal::new(325, 2));

    // Remove.
    service::remove_price(&c.app, c.org, store.id, product, c.user, true)
        .await
        .unwrap();
    assert!(service::list_prices(&c.app, c.org, store.id, c.user, true)
        .await
        .unwrap()
        .is_empty());

    cleanup(&c).await;
}
