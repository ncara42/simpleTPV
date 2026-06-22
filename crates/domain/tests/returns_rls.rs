//! Integración de devoluciones con ticket (slice 1) contra Postgres con RLS:
//! parcial repone stock + listado, no exceder lo vendido (incl. encadenadas),
//! venta anulada, y reingreso al lote original. Cada test usa tienda+caja propias.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_db::with_tenant_tx;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::returns::{service as returns, CreateReturn, CreateReturnLine};
use simpletpv_domain::sales::{
    service as sales, CreateSale, CreateSaleLine, PaymentMethod, SaleWithLines,
};
use simpletpv_domain::stock::model::MovementType;
use simpletpv_domain::stock::service::{self as stock, ApplyMovementInput, BatchRef};
use simpletpv_domain::stock::Adjust;
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
    let store = Uuid::new_v4();
    let code = format!("R{}", &store.simple().to_string()[..8]);
    sqlx::query(r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1,$2,$3,$4)"#)
        .bind(store)
        .bind(org)
        .bind(format!("Tienda {code}"))
        .bind(&code)
        .execute(&admin)
        .await
        .unwrap();
    sqlx::query(r#"INSERT INTO "CashSession" (id,"organizationId","storeId","userId","openingAmount",status) VALUES ($1,$2,$3,$4,0,'OPEN'::"CashSessionStatus")"#)
        .bind(Uuid::new_v4()).bind(org).bind(store).bind(user).execute(&admin).await.unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        user,
    }
}

async fn make_product(c: &Ctx, price: Decimal) -> Uuid {
    products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("RET-{}", Uuid::new_v4()),
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

async fn sell(c: &Ctx, product: Uuid, qty: i64) -> SaleWithLines {
    sales::create(
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
            customer_tax_id: None,
            customer_name: None,
        },
    )
    .await
    .unwrap()
}

fn ret(sale_id: Uuid, sale_line_id: Uuid, qty: i64) -> CreateReturn {
    CreateReturn {
        sale_id,
        reason: "defectuoso".into(),
        lines: vec![CreateReturnLine {
            sale_line_id,
            qty: Decimal::from(qty),
        }],
    }
}

async fn stock_qty(c: &Ctx, product: Uuid) -> Decimal {
    sqlx::query_scalar(r#"SELECT quantity FROM "Stock" WHERE "productId"=$1 AND "storeId"=$2"#)
        .bind(product)
        .bind(c.store)
        .fetch_one(&c.admin)
        .await
        .unwrap()
}
async fn batch_qty(c: &Ctx, product: Uuid, lot: &str) -> Decimal {
    sqlx::query_scalar(r#"SELECT quantity FROM "StockBatch" WHERE "productId"=$1 AND "lotCode"=$2"#)
        .bind(product)
        .bind(lot)
        .fetch_one(&c.admin)
        .await
        .unwrap()
}

async fn teardown(c: &Ctx, products: &[Uuid]) {
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockBatch" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "storeId" = $1"#,
        r#"DELETE FROM "ReturnLine" WHERE "returnId" IN (SELECT id FROM "Return" WHERE "storeId" = $1)"#,
        r#"DELETE FROM "Return" WHERE "storeId" = $1"#,
        r#"DELETE FROM "SaleLine" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "storeId" = $1)"#,
        r#"DELETE FROM "Sale" WHERE "storeId" = $1"#,
        r#"DELETE FROM "CashSession" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Store" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(c.store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
    sqlx::query(r#"DELETE FROM "Product" WHERE id = ANY($1)"#)
        .bind(products)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn devolucion_parcial_repone_stock_y_aparece_en_listado() {
    let c = setup().await;
    let product = make_product(&c, Decimal::new(100, 2)).await; // 1.00
    stock::adjust(
        &c.app,
        c.org,
        c.user,
        Adjust {
            product_id: product,
            store_id: c.store,
            new_quantity: Decimal::from(100),
            reason: "i".into(),
        },
    )
    .await
    .unwrap();
    let sale = sell(&c, product, 3).await; // stock 97
    let sale_line = sale.lines[0].id;

    let r = returns::create(&c.app, c.org, c.user, true, ret(sale.sale.id, sale_line, 2))
        .await
        .unwrap();
    assert_eq!(r.return_.total, Decimal::new(200, 2)); // 3.00/3*2 = 2.00
    assert_eq!(r.lines[0].qty, Decimal::from(2));
    assert_eq!(stock_qty(&c, product).await, Decimal::from(99)); // 97 + 2

    let list = returns::list(&c.app, c.org, sale.sale.id).await.unwrap();
    assert!(list.iter().any(|x| x.return_.id == r.return_.id));
    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn no_se_puede_devolver_mas_de_lo_vendido() {
    let c = setup().await;
    let product = make_product(&c, Decimal::new(100, 2)).await;
    let sale = sell(&c, product, 2).await;
    let res = returns::create(
        &c.app,
        c.org,
        c.user,
        true,
        ret(sale.sale.id, sale.lines[0].id, 3),
    )
    .await;
    assert_eq!(res.err(), Some(AppError::BadRequest));
    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn devoluciones_encadenadas_no_exceden_lo_vendido() {
    let c = setup().await;
    let product = make_product(&c, Decimal::new(100, 2)).await;
    let sale = sell(&c, product, 3).await;
    let sl = sale.lines[0].id;
    returns::create(&c.app, c.org, c.user, true, ret(sale.sale.id, sl, 2))
        .await
        .unwrap();
    // ya devueltas 2 de 3 → devolvible 1; pedir 2 → BadRequest.
    assert_eq!(
        returns::create(&c.app, c.org, c.user, true, ret(sale.sale.id, sl, 2))
            .await
            .err(),
        Some(AppError::BadRequest)
    );
    // pedir 1 (el resto) → OK.
    returns::create(&c.app, c.org, c.user, true, ret(sale.sale.id, sl, 1))
        .await
        .unwrap();
    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn no_se_devuelve_contra_venta_anulada() {
    let c = setup().await;
    let product = make_product(&c, Decimal::new(100, 2)).await;
    stock::adjust(
        &c.app,
        c.org,
        c.user,
        Adjust {
            product_id: product,
            store_id: c.store,
            new_quantity: Decimal::from(10),
            reason: "i".into(),
        },
    )
    .await
    .unwrap();
    let sale = sell(&c, product, 1).await;
    sales::void(&c.app, c.org, sale.sale.id, c.user)
        .await
        .unwrap();
    let res = returns::create(
        &c.app,
        c.org,
        c.user,
        true,
        ret(sale.sale.id, sale.lines[0].id, 1),
    )
    .await;
    assert_eq!(res.err(), Some(AppError::BadRequest));
    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn devolucion_reingresa_al_lote_original() {
    let c = setup().await;
    let product = make_product(&c, Decimal::new(100, 2)).await;
    sqlx::query(r#"UPDATE "Product" SET "tracksBatch" = true WHERE id = $1"#)
        .bind(product)
        .execute(&c.admin)
        .await
        .unwrap();
    // recibe lote L1 = 10
    let org = c.org;
    let store = c.store;
    with_tenant_tx(&c.app, org, async move |tx, _a| {
        stock::apply_movement(
            tx,
            ApplyMovementInput {
                organization_id: org,
                product_id: product,
                store_id: store,
                movement_type: MovementType::PurchaseReceipt,
                quantity: Decimal::from(10),
                reference_id: None,
                reason: None,
                user_id: None,
                batch: Some(BatchRef {
                    lot_code: "L1".into(),
                    expiry_date: None,
                }),
            },
        )
        .await
    })
    .await
    .unwrap();
    let sale = sell(&c, product, 4).await; // FEFO consume 4 de L1 → L1 = 6
    assert_eq!(batch_qty(&c, product, "L1").await, Decimal::from(6));
    returns::create(
        &c.app,
        c.org,
        c.user,
        true,
        ret(sale.sale.id, sale.lines[0].id, 4),
    )
    .await
    .unwrap();
    assert_eq!(
        batch_qty(&c, product, "L1").await,
        Decimal::from(10),
        "reingreso al lote original"
    );
    teardown(&c, &[product]).await;
}
