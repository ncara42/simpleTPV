//! Integración de los totales/márgenes de `GET /sales` (#152): agregan SOLO las
//! ventas COMPLETED del filtro (las VOIDED se listan pero no suman) y la división
//! por cero (sin ventas) no rompe.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::service::{self, SalesFilter};
use simpletpv_domain::sales::{CreateSale, CreateSaleLine, PaymentMethod};
use simpletpv_domain::stock::{service as stock, Adjust};
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
    let code = format!("T{}", &store.simple().to_string()[..8]);
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
    sqlx::query(
        r#"INSERT INTO "CashSession" (id, "organizationId", "storeId", "userId", "openingAmount", status)
           VALUES ($1, $2, $3, $4, 0, 'OPEN'::"CashSessionStatus")"#,
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .bind(store)
    .bind(user)
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        user,
    }
}

async fn make_product(c: &Ctx) -> Uuid {
    let id = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("TOT-{}", Uuid::new_v4()),
            sale_price: Decimal::from(100),
            description: None,
            barcode: None,
            sku: None,
            cost_price: Some(Decimal::from(60)),
            tax_rate: Some(Decimal::from(21)),
            sale_unit: None,
            unit_symbol: None,
            family_id: None,
            active: None,
        },
    )
    .await
    .unwrap()
    .id;
    stock::adjust(
        &c.app,
        c.org,
        c.user,
        Adjust {
            product_id: id,
            store_id: c.store,
            new_quantity: Decimal::from(100),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
    id
}

async fn sell(c: &Ctx, product: Uuid, qty: i64) -> Uuid {
    service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        CreateSale {
            store_id: c.store,
            client_id: None,
            ticket_number: None,
            lines: vec![CreateSaleLine {
                product_id: product,
                qty: Decimal::from(qty),
                discount_pct: None,
                discount_amt: None,
            }],
            payment_method: PaymentMethod::Card,
            cash_given: None,
            ticket_discount_pct: None,
            ticket_discount_amt: None,
        },
    )
    .await
    .unwrap()
    .sale
    .id
}

fn filter(store: Uuid) -> SalesFilter {
    SalesFilter {
        store_id: Some(store),
        page: 1,
        page_size: 50,
        ..Default::default()
    }
}

async fn teardown(c: &Ctx, product: Uuid) {
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockBatch" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "storeId" = $1"#,
        r#"DELETE FROM "SaleLine" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "storeId" = $1)"#,
        r#"DELETE FROM "Sale" WHERE "storeId" = $1"#,
        r#"DELETE FROM "CashSession" WHERE "storeId" = $1"#,
        r#"DELETE FROM "UserStore" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Store" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(c.store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(product)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn totales_solo_cuentan_ventas_completed() {
    let c = setup().await;
    let product = make_product(&c).await;
    // Dos ventas: una se queda COMPLETED, otra se anula (VOIDED).
    let _keep = sell(&c, product, 2).await; // total 200, margen (100-60)*2=80
    let voided = sell(&c, product, 1).await;
    service::void(&c.app, c.org, voided, c.user).await.unwrap();

    let page = service::list(&c.app, c.org, c.user, true, filter(c.store))
        .await
        .unwrap();

    // items lista AMBAS (auditoría), pero totals solo la COMPLETED.
    assert_eq!(page.items.len(), 2, "ambas se listan");
    assert_eq!(page.totals.count, 1, "solo la COMPLETED suma");
    assert_eq!(page.totals.total_amount, Decimal::from(200));
    // Margen: 80 / 200 = 0.4.
    assert_eq!(page.totals.avg_margin_pct, Decimal::new(4, 1)); // 0.4

    teardown(&c, product).await;
}

#[tokio::test]
async fn totales_sin_ventas_no_dividen_por_cero() {
    let c = setup().await;
    let product = make_product(&c).await; // sin ventas
    let page = service::list(&c.app, c.org, c.user, true, filter(c.store))
        .await
        .unwrap();
    assert_eq!(page.totals.count, 0);
    assert_eq!(page.totals.total_amount, Decimal::ZERO);
    assert_eq!(page.totals.avg_discount_pct, Decimal::ZERO);
    assert_eq!(page.totals.avg_margin_pct, Decimal::ZERO);
    teardown(&c, product).await;
}
