//! Integración de pedidos a proveedor (#153) contra Postgres con RLS: flujo
//! DRAFT→CONFIRMED→PARTIALLY_RECEIVED→RECEIVED (incrementa stock), tope de lo
//! pedido, propuesta de reposición y export CSV.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::purchases::model::PurchaseOrderStatus;
use simpletpv_domain::purchases::{
    service, CreatePurchaseOrder, CreatePurchaseOrderLine, ReceivePurchaseOrder,
    ReceivePurchaseOrderLine, SuggestPurchase,
};
use simpletpv_domain::stock::{service as stock, Adjust, SetMin};
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
    user: Uuid,
    store: Uuid,
    supplier: Uuid,
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
    let code = format!("P{}", &store.simple().to_string()[..8]);
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
    let supplier = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Supplier" (id, "organizationId", name) VALUES ($1, $2, 'Prov PO')"#,
    )
    .bind(supplier)
    .bind(org)
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        user,
        store,
        supplier,
    }
}

async fn make_product(c: &Ctx) -> Uuid {
    products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("PO-{}", Uuid::new_v4()),
            sale_price: Decimal::from(10),
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
        .fetch_optional(&c.admin)
        .await
        .unwrap()
        .unwrap_or(Decimal::ZERO)
}

async fn teardown(c: &Ctx, products: &[Uuid]) {
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockBatch" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "storeId" = $1"#,
        r#"DELETE FROM "PurchaseOrder" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Store" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(c.store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
    sqlx::query(r#"DELETE FROM "Supplier" WHERE id = $1"#)
        .bind(c.supplier)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Product" WHERE id = ANY($1)"#)
        .bind(products)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn order_body(c: &Ctx, product: Uuid, qty: i64) -> CreatePurchaseOrder {
    CreatePurchaseOrder {
        supplier_id: c.supplier,
        store_id: c.store,
        notes: None,
        lines: vec![CreatePurchaseOrderLine {
            product_id: product,
            quantity_ordered: Decimal::from(qty),
            unit_cost: Some(Decimal::new(550, 2)),
        }],
    }
}

#[tokio::test]
async fn flujo_pedido_confirmar_recibir() {
    let c = setup().await;
    let product = make_product(&c).await;

    let po = service::create(&c.app, c.org, c.user, order_body(&c, product, 10))
        .await
        .unwrap();
    assert_eq!(po.order.status, PurchaseOrderStatus::Draft);
    let line_id = po.lines[0].id;

    // Recibir en DRAFT → Conflict (debe confirmarse antes).
    assert_eq!(
        service::receive(
            &c.app,
            c.org,
            c.user,
            po.order.id,
            ReceivePurchaseOrder {
                lines: vec![ReceivePurchaseOrderLine {
                    line_id,
                    quantity_received: Decimal::from(5),
                    lot_code: None,
                    expiry_date: None
                }],
            }
        )
        .await
        .err(),
        Some(AppError::Conflict)
    );

    // Confirmar; doble confirmación → Conflict.
    let conf = service::confirm(&c.app, c.org, po.order.id).await.unwrap();
    assert_eq!(conf.order.status, PurchaseOrderStatus::Confirmed);
    assert_eq!(
        service::confirm(&c.app, c.org, po.order.id).await.err(),
        Some(AppError::Conflict)
    );

    // Recepción parcial (5) → PARTIALLY_RECEIVED, stock +5.
    let p1 = service::receive(
        &c.app,
        c.org,
        c.user,
        po.order.id,
        ReceivePurchaseOrder {
            lines: vec![ReceivePurchaseOrderLine {
                line_id,
                quantity_received: Decimal::from(5),
                lot_code: None,
                expiry_date: None,
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(p1.order.status, PurchaseOrderStatus::PartiallyReceived);
    assert_eq!(stock_qty(&c, product).await, Decimal::from(5));

    // Recibir de más (6 > 5 restantes) → BadRequest.
    assert_eq!(
        service::receive(
            &c.app,
            c.org,
            c.user,
            po.order.id,
            ReceivePurchaseOrder {
                lines: vec![ReceivePurchaseOrderLine {
                    line_id,
                    quantity_received: Decimal::from(6),
                    lot_code: None,
                    expiry_date: None
                }],
            }
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Completar (5 más) → RECEIVED, stock 10.
    let p2 = service::receive(
        &c.app,
        c.org,
        c.user,
        po.order.id,
        ReceivePurchaseOrder {
            lines: vec![ReceivePurchaseOrderLine {
                line_id,
                quantity_received: Decimal::from(5),
                lot_code: None,
                expiry_date: None,
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(p2.order.status, PurchaseOrderStatus::Received);
    assert!(p2.order.received_at.is_some());
    assert_eq!(stock_qty(&c, product).await, Decimal::from(10));

    // get → KPIs: fillRate 1.0 (recibido == pedido).
    let got = service::get(&c.app, c.org, po.order.id).await.unwrap();
    assert_eq!(got.kpis.as_ref().unwrap().fill_rate, Some(Decimal::ONE));

    // export CSV.
    let csv = service::export_csv(&c.app, c.org, po.order.id)
        .await
        .unwrap();
    assert!(csv.starts_with("producto,cantidad_pedida,cantidad_recibida,coste_unitario"));
    assert!(csv.contains(",10,10,5.5"));

    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn sugerencia_de_reposicion() {
    let c = setup().await;
    let product = make_product(&c).await;
    // Stock 5, mínimo 20, sin ventas → sugerida = 20-5 = 15.
    stock::adjust(
        &c.app,
        c.org,
        c.user,
        Adjust {
            product_id: product,
            store_id: c.store,
            new_quantity: Decimal::from(5),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
    stock::set_min(
        &c.app,
        c.org,
        SetMin {
            product_id: product,
            store_id: c.store,
            min_stock: Decimal::from(20),
        },
    )
    .await
    .unwrap();

    let rows = service::suggest(
        &c.app,
        c.org,
        SuggestPurchase {
            store_id: c.store,
            supplier_id: None,
            days_coverage: None,
        },
    )
    .await
    .unwrap();
    let mine = rows
        .iter()
        .find(|r| r.product_id == product)
        .expect("sugerencia");
    assert_eq!(mine.cantidad_sugerida, Decimal::from(15));

    teardown(&c, &[product]).await;
}
