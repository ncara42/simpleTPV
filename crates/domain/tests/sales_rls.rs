//! Integración del core de ventas (slice 1) contra Postgres con RLS: creación
//! (totales, cambio, decremento de stock, nº ticket), idempotencia por clientId,
//! caja obligatoria y límite de descuento por rol. Cada test usa una tienda
//! propia (creada al vuelo) para aislarse de la caja/contador de otros tests.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::{service, CreateSale, CreateSaleLine, PaymentMethod};
use simpletpv_domain::stock::{service as stock, Adjust};
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
    // Tienda dedicada (código único) para aislar caja/contador.
    let store = Uuid::new_v4();
    let code = format!("S{}", &store.simple().to_string()[..8]);
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
    Ctx {
        admin,
        app,
        org,
        store,
        user,
    }
}

async fn open_cash_session(c: &Ctx) {
    sqlx::query(
        r#"INSERT INTO "CashSession" (id, "organizationId", "storeId", "userId", "openingAmount", status)
           VALUES ($1, $2, $3, $4, 0, 'OPEN'::"CashSessionStatus")"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(c.store)
    .bind(c.user)
    .execute(&c.admin)
    .await
    .unwrap();
}

async fn make_product(c: &Ctx, price: Decimal) -> Uuid {
    products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("SALE-{}", Uuid::new_v4()),
            sale_price: price,
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
    .id
}

async fn stock_qty(c: &Ctx, product: Uuid) -> Decimal {
    sqlx::query_scalar(r#"SELECT quantity FROM "Stock" WHERE "productId" = $1 AND "storeId" = $2"#)
        .bind(product)
        .bind(c.store)
        .fetch_one(&c.admin)
        .await
        .unwrap()
}

async fn teardown(c: &Ctx, products: &[Uuid]) {
    // Borra el rastro de la tienda creada (orden FK): las líneas de venta de esta
    // tienda se borran antes que los productos para liberar la FK.
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
    // Solo los productos de ESTE test (ya sin líneas que los referencien).
    sqlx::query(r#"DELETE FROM "Product" WHERE id = ANY($1)"#)
        .bind(products)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn line(product: Uuid, qty: i64, pct: Option<Decimal>) -> CreateSaleLine {
    CreateSaleLine {
        product_id: product,
        qty: Decimal::from(qty),
        discount_pct: pct,
        discount_amt: None,
    }
}

#[tokio::test]
async fn venta_feliz_calcula_totales_cambio_y_decrementa_stock() {
    let c = setup().await;
    open_cash_session(&c).await;
    let product = make_product(&c, Decimal::new(100, 2)).await; // 1.00
    stock::adjust(
        &c.app,
        c.org,
        c.user,
        Adjust {
            product_id: product,
            store_id: c.store,
            new_quantity: Decimal::from(100),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();

    let sale = service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        CreateSale {
            store_id: c.store,
            client_id: None,
            ticket_number: None,
            lines: vec![line(product, 2, None)],
            payment_method: PaymentMethod::Cash,
            cash_given: Some(Decimal::from(5)),
            ticket_discount_pct: None,
            ticket_discount_amt: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(sale.sale.total, Decimal::new(200, 2)); // 2.00
    assert_eq!(sale.sale.cash_change, Some(Decimal::new(300, 2))); // 3.00
    assert_eq!(sale.lines.len(), 1);
    assert!(
        sale.sale.ticket_number.starts_with('T'),
        "{}",
        sale.sale.ticket_number
    );
    assert_eq!(stock_qty(&c, product).await, Decimal::from(98)); // 100 - 2

    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn idempotencia_por_client_id_devuelve_la_misma_venta() {
    let c = setup().await;
    open_cash_session(&c).await;
    let product = make_product(&c, Decimal::new(150, 2)).await;
    let client_id = Uuid::new_v4();
    let body = || CreateSale {
        store_id: c.store,
        client_id: Some(client_id),
        ticket_number: None,
        lines: vec![line(product, 1, None)],
        payment_method: PaymentMethod::Card,
        cash_given: None,
        ticket_discount_pct: None,
        ticket_discount_amt: None,
    };

    let first = service::create(&c.app, c.org, c.user, Role::Admin, body())
        .await
        .unwrap();
    let second = service::create(&c.app, c.org, c.user, Role::Admin, body())
        .await
        .unwrap();
    assert_eq!(
        first.sale.id, second.sale.id,
        "mismo clientId → misma venta"
    );

    let count: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Sale" WHERE "clientId" = $1"#)
        .bind(client_id)
        .fetch_one(&c.admin)
        .await
        .unwrap();
    assert_eq!(count, 1, "solo una fila pese al reintento");

    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn sin_caja_abierta_rechaza_con_conflict() {
    let c = setup().await; // NO abrimos caja
    let product = make_product(&c, Decimal::new(100, 2)).await;
    let res = service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        CreateSale {
            store_id: c.store,
            client_id: None,
            ticket_number: None,
            lines: vec![line(product, 1, None)],
            payment_method: PaymentMethod::Card,
            cash_given: None,
            ticket_discount_pct: None,
            ticket_discount_amt: None,
        },
    )
    .await;
    assert_eq!(res.err(), Some(AppError::Conflict));
    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn clerk_supera_el_limite_de_descuento() {
    let c = setup().await;
    open_cash_session(&c).await;
    let clerk: Uuid =
        sqlx::query_scalar(r#"SELECT id FROM "User" WHERE email = 'clerk@org1.test'"#)
            .fetch_one(&c.admin)
            .await
            .unwrap();
    // El CLERK necesita acceso a la tienda (SEC-01) para llegar al cálculo.
    sqlx::query(
        r#"INSERT INTO "UserStore" ("userId", "storeId") VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
    )
    .bind(clerk)
    .bind(c.store)
    .execute(&c.admin)
    .await
    .unwrap();
    let product = make_product(&c, Decimal::new(100, 2)).await;

    // Descuento de línea 50% > límite CLERK 10% → Forbidden.
    let res = service::create(
        &c.app,
        c.org,
        clerk,
        Role::Clerk,
        CreateSale {
            store_id: c.store,
            client_id: None,
            ticket_number: None,
            lines: vec![line(product, 1, Some(Decimal::from(50)))],
            payment_method: PaymentMethod::Card,
            cash_given: None,
            ticket_discount_pct: None,
            ticket_discount_amt: None,
        },
    )
    .await;
    assert_eq!(res.err(), Some(AppError::Forbidden));
    teardown(&c, &[product]).await;
}
