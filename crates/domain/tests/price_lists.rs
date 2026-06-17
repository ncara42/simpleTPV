//! Integración de tarifas B2B (#154, IT-17) contra Postgres con RLS: CRUD,
//! items (upsert con producto anidado), recuentos y validación de pertenencia.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::price_lists::{service, CreatePriceList, SetPriceListItem, UpdatePriceList};
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
    product: Uuid,
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    // Producto de prueba con su salePrice.
    let product = Uuid::new_v4();
    let sku = format!("PL{}", &product.simple().to_string()[..8]);
    sqlx::query(
        r#"INSERT INTO "Product" (id, "organizationId", sku, name, "salePrice", "updatedAt")
           VALUES ($1, $2, $3, $4, 9.90, now())"#,
    )
    .bind(product)
    .bind(org)
    .bind(&sku)
    .bind(format!("Producto {sku}"))
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        product,
    }
}

async fn teardown(c: &Ctx) {
    // Los items cascadean al borrar la tarifa; limpiamos tarifas del tenant y el producto.
    sqlx::query(r#"DELETE FROM "PriceListItem" WHERE "productId" = $1"#)
        .bind(c.product)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "PriceList" WHERE "organizationId" = $1 AND name LIKE 'TT-%'"#)
        .bind(c.org)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(c.product)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn dec(s: &str) -> Decimal {
    s.parse().unwrap()
}

#[tokio::test]
async fn crud_tarifas_items_y_pertenencia() {
    let c = setup().await;

    // Alta + listado (con recuentos a 0).
    let pl = service::create(
        &c.app,
        c.org,
        CreatePriceList {
            name: "TT-Mayorista".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(pl.name, "TT-Mayorista");
    assert!(pl.active);
    let summaries = service::list(&c.app, c.org).await.unwrap();
    let s = summaries.iter().find(|s| s.id == pl.id).unwrap();
    assert_eq!(s.item_count, 0);
    assert_eq!(s.customer_count, 0);

    // Upsert de un item: devuelve el item plano.
    let item = service::set_item(
        &c.app,
        c.org,
        pl.id,
        SetPriceListItem {
            product_id: c.product,
            price: dec("5.5"),
        },
    )
    .await
    .unwrap();
    assert_eq!(item.price, dec("5.5"));
    assert_eq!(item.product_id, c.product);

    // get: la tarifa trae el item con el producto anidado (name + salePrice).
    let detail = service::get(&c.app, c.org, pl.id).await.unwrap();
    assert_eq!(detail.items.len(), 1);
    assert_eq!(detail.items[0].price, dec("5.5"));
    assert_eq!(detail.items[0].product.sale_price, dec("9.90"));

    // Upsert sobre el mismo producto reemplaza el precio (sigue habiendo 1 item).
    let item2 = service::set_item(
        &c.app,
        c.org,
        pl.id,
        SetPriceListItem {
            product_id: c.product,
            price: dec("4.25"),
        },
    )
    .await
    .unwrap();
    assert_eq!(item2.price, dec("4.25"));
    let detail = service::get(&c.app, c.org, pl.id).await.unwrap();
    assert_eq!(detail.items.len(), 1);

    // set_item con producto ajeno al tenant → BadRequest.
    assert_eq!(
        service::set_item(
            &c.app,
            c.org,
            pl.id,
            SetPriceListItem {
                product_id: Uuid::new_v4(),
                price: dec("1")
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // update (renombrar + desactivar).
    let updated = service::update(
        &c.app,
        c.org,
        pl.id,
        UpdatePriceList {
            name: Some("TT-Mayorista 2".into()),
            active: Some(false),
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.name, "TT-Mayorista 2");
    assert!(!updated.active);

    // update sobre id inexistente → NotFound (404). Divergencia CONSCIENTE de
    // paridad: NestJS hace updateMany+findFirst y devuelve `null` con 200; aquí
    // el `RETURNING` vacío se mapea a NotFound, que es la semántica REST correcta
    // para un PATCH a un recurso que no existe. Ver docs/migration-rust/HANDOFF.md.
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            Uuid::new_v4(),
            UpdatePriceList {
                name: Some("fantasma".into()),
                active: None,
            },
        )
        .await
        .err(),
        Some(AppError::NotFound)
    );

    // get de tarifa inexistente → NotFound.
    assert_eq!(
        service::get(&c.app, c.org, Uuid::new_v4()).await.err(),
        Some(AppError::NotFound)
    );

    // remove_item idempotente, luego remove de la tarifa.
    service::remove_item(&c.app, c.org, pl.id, c.product)
        .await
        .unwrap();
    service::remove_item(&c.app, c.org, pl.id, c.product)
        .await
        .unwrap();
    assert!(service::get(&c.app, c.org, pl.id)
        .await
        .unwrap()
        .items
        .is_empty());
    service::remove(&c.app, c.org, pl.id).await.unwrap();
    assert_eq!(
        service::get(&c.app, c.org, pl.id).await.err(),
        Some(AppError::NotFound)
    );

    teardown(&c).await;
}
