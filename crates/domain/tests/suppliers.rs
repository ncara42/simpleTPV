//! Integración de proveedores y tarifas (#153) contra Postgres con RLS: CRUD de
//! proveedor, upsert/list/comparativa/import/borrado de tarifas, validación de
//! pertenencia al tenant.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::suppliers::{service, CreateSupplier, UpdateSupplier, UpsertSupplierPrice};
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
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    Ctx { admin, app, org }
}

async fn make_product(c: &Ctx, sku: &str) -> Uuid {
    products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("PROD-{sku}"),
            sale_price: Decimal::from(10),
            description: None,
            barcode: None,
            sku: Some(sku.to_owned()),
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
    .id
}

async fn cleanup(c: &Ctx, supplier: Uuid, product: Uuid) {
    sqlx::query(r#"DELETE FROM "SupplierPrice" WHERE "supplierId" = $1"#)
        .bind(supplier)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Supplier" WHERE id = $1"#)
        .bind(supplier)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(product)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn crud_proveedor() {
    let c = setup().await;
    let sup = service::create(
        &c.app,
        c.org,
        CreateSupplier {
            name: "Proveedor Test".into(),
            nif: Some("B99999999".into()),
            email: Some("prov@x.test".into()),
            phone: None,
            lead_time_days: None,
            order_frequency_days: Some(7),
        },
    )
    .await
    .unwrap();
    assert_eq!(sup.lead_time_days, 7, "default 7 días");
    assert_eq!(sup.order_frequency_days, Some(7), "periodicidad semanal");

    let all = service::find_all(&c.app, c.org).await.unwrap();
    assert!(all.iter().any(|s| s.id == sup.id));

    let upd = service::update(
        &c.app,
        c.org,
        sup.id,
        UpdateSupplier {
            name: Some("Proveedor Editado".into()),
            nif: None,
            email: None,
            phone: None,
            lead_time_days: Some(14),
            order_frequency_days: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(upd.name, "Proveedor Editado");
    assert_eq!(upd.lead_time_days, 14);
    assert_eq!(
        upd.order_frequency_days,
        Some(7),
        "None = periodicidad sin cambios"
    );

    // 0 = quitar la periodicidad (vuelve a NULL); fuera de rango → BadRequest.
    let sin_frecuencia = service::update(
        &c.app,
        c.org,
        sup.id,
        UpdateSupplier {
            name: None,
            nif: None,
            email: None,
            phone: None,
            lead_time_days: None,
            order_frequency_days: Some(0),
        },
    )
    .await
    .unwrap();
    assert_eq!(sin_frecuencia.order_frequency_days, None);
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            sup.id,
            UpdateSupplier {
                name: None,
                nif: None,
                email: None,
                phone: None,
                lead_time_days: None,
                order_frequency_days: Some(366),
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    service::remove(&c.app, c.org, sup.id).await.unwrap();
    assert_eq!(
        service::find_one(&c.app, c.org, sup.id).await.err(),
        Some(AppError::NotFound)
    );
}

#[tokio::test]
async fn tarifas_upsert_list_comparativa_import() {
    let c = setup().await;
    let sup = service::create(
        &c.app,
        c.org,
        CreateSupplier {
            name: "Prov Tarifas".into(),
            nif: None,
            email: None,
            phone: None,
            lead_time_days: None,
            order_frequency_days: None,
        },
    )
    .await
    .unwrap();
    let sku = format!("SKU-{}", Uuid::new_v4().simple());
    let product = make_product(&c, &sku).await;

    // Upsert (crea) y luego upsert (actualiza) la misma tarifa.
    let row = service::upsert_price(
        &c.app,
        c.org,
        UpsertSupplierPrice {
            supplier_id: sup.id,
            product_id: product,
            price: Decimal::new(1050, 2), // 10.50
        },
    )
    .await
    .unwrap();
    assert_eq!(row.price, Decimal::new(1050, 2));
    assert_eq!(row.supplier_name, "Prov Tarifas");

    service::upsert_price(
        &c.app,
        c.org,
        UpsertSupplierPrice {
            supplier_id: sup.id,
            product_id: product,
            price: Decimal::new(900, 2), // 9.00 (update, no duplica)
        },
    )
    .await
    .unwrap();
    let list = service::list_prices(&c.app, c.org, Some(sup.id), None)
        .await
        .unwrap();
    assert_eq!(list.len(), 1, "upsert no duplica");
    assert_eq!(list[0].price, Decimal::new(900, 2));

    // Comparativa: el producto aparece con su mejor precio.
    let cmp = service::comparison(&c.app, c.org, None).await.unwrap();
    let prod_cmp = cmp.iter().find(|r| r.product_id == product).unwrap();
    assert_eq!(prod_cmp.best.as_ref().unwrap().price, Decimal::new(900, 2));

    // Upsert con producto inexistente → BadRequest.
    assert_eq!(
        service::upsert_price(
            &c.app,
            c.org,
            UpsertSupplierPrice {
                supplier_id: sup.id,
                product_id: Uuid::new_v4(),
                price: Decimal::ONE,
            }
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Import CSV por SKU: una fila válida + una con SKU inexistente.
    let csv = format!("sku,price\n{sku},8.50\nNOEXISTE,5.00\n");
    let res = service::import_prices_csv(&c.app, c.org, sup.id, &csv)
        .await
        .unwrap();
    assert_eq!(res.inserted, 1);
    assert_eq!(res.errors.len(), 1);

    // Borrado de tarifa.
    service::remove_price(&c.app, c.org, row.id).await.unwrap();
    assert_eq!(
        service::remove_price(&c.app, c.org, row.id).await.err(),
        Some(AppError::NotFound)
    );

    cleanup(&c, sup.id, product).await;
}
