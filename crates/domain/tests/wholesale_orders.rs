//! Integración de pedidos mayoristas (#154, IT-17c) contra Postgres con RLS:
//! creación con precio congelado (tarifa ?? PVP), listado paginado, detalle y
//! máquina de estados.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::wholesale_orders::model::WholesaleOrderStatus;
use simpletpv_domain::wholesale_orders::{
    service, CreateWholesaleOrder, WholesaleOrderLineInput,
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
    customer: Uuid,
    price_list: Uuid,
    p_tarifa: Uuid, // producto con precio en tarifa
    p_pvp: Uuid,    // producto sin tarifa (cae al PVP)
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    let mk_product = |id: Uuid, sale: &str| {
        let sku = format!("WO{}", &id.simple().to_string()[..8]);
        (id, sku, sale.to_owned())
    };
    let p_tarifa = Uuid::new_v4();
    let p_pvp = Uuid::new_v4();
    for (id, sku, sale) in [mk_product(p_tarifa, "10.00"), mk_product(p_pvp, "20.00")] {
        sqlx::query(
            r#"INSERT INTO "Product" (id, "organizationId", sku, name, "salePrice", "updatedAt")
               VALUES ($1, $2, $3, $4, $5::numeric, now())"#,
        )
        .bind(id)
        .bind(org)
        .bind(&sku)
        .bind(format!("Prod {sku}"))
        .bind(sale)
        .execute(&admin)
        .await
        .unwrap();
    }
    // Tarifa con precio mayorista solo para p_tarifa (6.00).
    let price_list = Uuid::new_v4();
    sqlx::query(r#"INSERT INTO "PriceList" (id, "organizationId", name) VALUES ($1, $2, $3)"#)
        .bind(price_list)
        .bind(org)
        .bind(format!("WO-{}", &price_list.simple().to_string()[..6]))
        .execute(&admin)
        .await
        .unwrap();
    sqlx::query(
        r#"INSERT INTO "PriceListItem" (id, "organizationId", "priceListId", "productId", price)
           VALUES ($1, $2, $3, $4, 6.00)"#,
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .bind(price_list)
    .bind(p_tarifa)
    .execute(&admin)
    .await
    .unwrap();
    // Cliente con esa tarifa.
    let customer = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Customer" (id, "organizationId", name, "priceListId", "updatedAt")
           VALUES ($1, $2, $3, $4, now())"#,
    )
    .bind(customer)
    .bind(org)
    .bind("Mayorista WO")
    .bind(price_list)
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        customer,
        price_list,
        p_tarifa,
        p_pvp,
    }
}

async fn teardown(c: &Ctx) {
    // Las líneas cascadean al borrar el pedido.
    sqlx::query(
        r#"DELETE FROM "WholesaleOrder" WHERE "organizationId" = $1 AND "customerId" = $2"#,
    )
    .bind(c.org)
    .bind(c.customer)
    .execute(&c.admin)
    .await
    .unwrap();
    sqlx::query(r#"DELETE FROM "Customer" WHERE id = $1"#)
        .bind(c.customer)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "PriceListItem" WHERE "priceListId" = $1"#)
        .bind(c.price_list)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "PriceList" WHERE id = $1"#)
        .bind(c.price_list)
        .execute(&c.admin)
        .await
        .unwrap();
    for p in [c.p_tarifa, c.p_pvp] {
        sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
            .bind(p)
            .execute(&c.admin)
            .await
            .unwrap();
    }
}

fn dec(s: &str) -> Decimal {
    s.parse().unwrap()
}

#[tokio::test]
async fn crea_con_precio_congelado_lista_detalle_y_estados() {
    let c = setup().await;

    // Pedido: 2× p_tarifa (precio tarifa 6.00) + 3× p_pvp (sin tarifa → PVP 20.00).
    let created = service::create(
        &c.app,
        c.org,
        CreateWholesaleOrder {
            customer_id: c.customer,
            notes: Some("Pedido de prueba".into()),
            lines: vec![
                WholesaleOrderLineInput {
                    product_id: c.p_tarifa,
                    qty: dec("2"),
                },
                WholesaleOrderLineInput {
                    product_id: c.p_pvp,
                    qty: dec("3"),
                },
            ],
        },
    )
    .await
    .unwrap();
    assert_eq!(created.status, WholesaleOrderStatus::Draft);
    assert_eq!(created.customer.name, "Mayorista WO");
    assert_eq!(created.lines.len(), 2);
    // total = 2*6.00 + 3*20.00 = 12 + 60 = 72.00
    assert_eq!(created.total, dec("72.00"));
    let tarifa_line = created
        .lines
        .iter()
        .find(|l| l.product_id == c.p_tarifa)
        .unwrap();
    assert_eq!(tarifa_line.unit_price, dec("6.00")); // congelado desde tarifa
    assert_eq!(tarifa_line.line_total, dec("12.00"));
    let pvp_line = created
        .lines
        .iter()
        .find(|l| l.product_id == c.p_pvp)
        .unwrap();
    assert_eq!(pvp_line.unit_price, dec("20.00")); // fallback al PVP

    // Detalle: cliente {name, nif} + líneas con producto anidado.
    let detail = service::get(&c.app, c.org, created.id).await.unwrap();
    assert_eq!(detail.lines.len(), 2);
    assert!(detail.lines.iter().all(|l| !l.product.name.is_empty()));

    // Listado paginado filtrando por cliente.
    let page = service::list(&c.app, c.org, None, Some(c.customer), 1)
        .await
        .unwrap();
    assert_eq!(page.page, 1);
    assert_eq!(page.page_size, 20);
    let item = page.items.iter().find(|i| i.id == created.id).unwrap();
    assert_eq!(item.line_count, 2);
    assert_eq!(item.customer_name, "Mayorista WO");

    // Producto inexistente en una línea → BadRequest.
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            CreateWholesaleOrder {
                customer_id: c.customer,
                notes: None,
                lines: vec![WholesaleOrderLineInput {
                    product_id: Uuid::new_v4(),
                    qty: dec("1")
                }],
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Estados: DRAFT → CONFIRMED → SHIPPED; luego cerrado → BadRequest.
    let confirmed = service::update_status(&c.app, c.org, created.id, "CONFIRMED".into())
        .await
        .unwrap();
    assert_eq!(confirmed.status, WholesaleOrderStatus::Confirmed);
    let shipped = service::update_status(&c.app, c.org, created.id, "SHIPPED".into())
        .await
        .unwrap();
    assert_eq!(shipped.status, WholesaleOrderStatus::Shipped);
    assert_eq!(
        service::update_status(&c.app, c.org, created.id, "CANCELLED".into())
            .await
            .err(),
        Some(AppError::BadRequest) // ya cerrado
    );

    // Estado no válido → BadRequest; pedido inexistente → NotFound.
    assert_eq!(
        service::update_status(&c.app, c.org, created.id, "RARO".into())
            .await
            .err(),
        Some(AppError::BadRequest)
    );
    assert_eq!(
        service::update_status(&c.app, c.org, Uuid::new_v4(), "CONFIRMED".into())
            .await
            .err(),
        Some(AppError::NotFound)
    );

    // Killswitch del módulo b2b (#127 B): si el flag b2b está en false a nivel org,
    // crear un pedido mayorista → Forbidden (gate antes de la tx).
    sqlx::query(
        r#"INSERT INTO "FeatureFlag" (id, "organizationId", "storeId", key, enabled, "updatedAt")
           VALUES ($1, $2, NULL, 'b2b', false, now())"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .execute(&c.admin)
    .await
    .unwrap();
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            CreateWholesaleOrder {
                customer_id: c.customer,
                notes: None,
                lines: vec![WholesaleOrderLineInput {
                    product_id: c.p_pvp,
                    qty: dec("1")
                }],
            },
        )
        .await
        .err(),
        Some(AppError::Forbidden)
    );
    sqlx::query(r#"DELETE FROM "FeatureFlag" WHERE "organizationId" = $1 AND key = 'b2b'"#)
        .bind(c.org)
        .execute(&c.admin)
        .await
        .unwrap();

    teardown(&c).await;
}

/// Un pedido de org1 es invisible desde el contexto RLS de org2 (y viceversa).
/// Cubre el aislamiento de comportamiento que `fase4_rls.rs` solo cubre
/// estructuralmente para `WholesaleOrder`.
#[tokio::test]
async fn pedido_no_cruza_tenants_rls() {
    let c = setup().await;

    let created = service::create(
        &c.app,
        c.org,
        CreateWholesaleOrder {
            customer_id: c.customer,
            notes: None,
            lines: vec![WholesaleOrderLineInput {
                product_id: c.p_pvp,
                qty: dec("1"),
            }],
        },
    )
    .await
    .unwrap();

    // org2 no puede ver el pedido creado por org1.
    let org2: Uuid =
        sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B22222222'"#)
            .fetch_one(&c.admin)
            .await
            .unwrap();
    assert_eq!(
        service::get(&c.app, org2, created.id).await.err(),
        Some(AppError::NotFound),
        "org2 no debe ver pedidos de org1"
    );

    // El listado de org2 tampoco incluye el pedido de org1.
    let page = service::list(&c.app, org2, None, None, 1).await.unwrap();
    assert!(
        page.items.iter().all(|i| i.id != created.id),
        "listado de org2 no debe incluir pedidos de org1"
    );

    teardown(&c).await;
}
