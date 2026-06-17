//! Integración de traspasos (#153) contra Postgres con RLS: flujo
//! DRAFT→SENT→RECEIVED→CLOSED (sin lote y con lote viajero), discrepancia y
//! transiciones de estado inválidas.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::stock::model::MovementType;
use simpletpv_domain::stock::service::{apply_movement, ApplyMovementInput, BatchRef};
use simpletpv_domain::stock::{service as stock, Adjust};
use simpletpv_domain::transfers::model::TransferStatus;
use simpletpv_domain::transfers::{
    service, CreateTransfer, CreateTransferLine, ReceiveTransfer, ReceiveTransferLine,
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
    user: Uuid,
    origin: Uuid,
    dest: Uuid,
}

async fn make_store(admin: &PgPool, org: Uuid) -> Uuid {
    let id = Uuid::new_v4();
    let code = format!("X{}", &id.simple().to_string()[..8]);
    sqlx::query(
        r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(id)
    .bind(org)
    .bind(format!("Tienda {code}"))
    .bind(&code)
    .execute(admin)
    .await
    .unwrap();
    id
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
    let origin = make_store(&admin, org).await;
    let dest = make_store(&admin, org).await;
    Ctx {
        admin,
        app,
        org,
        user,
        origin,
        dest,
    }
}

async fn make_product(c: &Ctx, tracked: bool) -> Uuid {
    let id = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("TR-{}", Uuid::new_v4()),
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
    .id;
    if tracked {
        sqlx::query(r#"UPDATE "Product" SET "tracksBatch" = true WHERE id = $1"#)
            .bind(id)
            .execute(&c.admin)
            .await
            .unwrap();
    }
    id
}

async fn stock_qty(c: &Ctx, store: Uuid, product: Uuid) -> Decimal {
    sqlx::query_scalar(r#"SELECT quantity FROM "Stock" WHERE "productId" = $1 AND "storeId" = $2"#)
        .bind(product)
        .bind(store)
        .fetch_optional(&c.admin)
        .await
        .unwrap()
        .unwrap_or(Decimal::ZERO)
}

async fn batch_qty(c: &Ctx, store: Uuid, product: Uuid, lot: &str) -> Decimal {
    sqlx::query_scalar(
        r#"SELECT quantity FROM "StockBatch" WHERE "productId" = $1 AND "storeId" = $2 AND "lotCode" = $3"#,
    )
    .bind(product)
    .bind(store)
    .bind(lot)
    .fetch_optional(&c.admin)
    .await
    .unwrap()
    .unwrap_or(Decimal::ZERO)
}

async fn receive_lot(c: &Ctx, product: Uuid, store: Uuid, lot: &str, qty: i64) {
    let lot = lot.to_owned();
    let org = c.org;
    with_tenant_tx(&c.app, org, async move |tx, _a| {
        apply_movement(
            tx,
            ApplyMovementInput {
                organization_id: org,
                product_id: product,
                store_id: store,
                movement_type: MovementType::PurchaseReceipt,
                quantity: Decimal::from(qty),
                reference_id: None,
                reason: None,
                user_id: None,
                batch: Some(BatchRef {
                    lot_code: lot,
                    expiry_date: None,
                }),
            },
        )
        .await
    })
    .await
    .unwrap();
}

async fn teardown(c: &Ctx, product: Uuid) {
    for store in [c.origin, c.dest] {
        for sql in [
            r#"DELETE FROM "StockMovement" WHERE "storeId" = $1"#,
            r#"DELETE FROM "StockAlert" WHERE "storeId" = $1"#,
            r#"DELETE FROM "StockBatch" WHERE "storeId" = $1"#,
            r#"DELETE FROM "Stock" WHERE "storeId" = $1"#,
            r#"DELETE FROM "TransferLine" WHERE "transferId" IN (SELECT id FROM "Transfer" WHERE "originStoreId" = $1 OR "destStoreId" = $1)"#,
            r#"DELETE FROM "Transfer" WHERE "originStoreId" = $1 OR "destStoreId" = $1"#,
            r#"DELETE FROM "Store" WHERE id = $1"#,
        ] {
            sqlx::query(sql)
                .bind(store)
                .execute(&c.admin)
                .await
                .unwrap();
        }
    }
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(product)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn create_body(c: &Ctx, product: Uuid, qty: i64) -> CreateTransfer {
    CreateTransfer {
        origin_store_id: c.origin,
        dest_store_id: c.dest,
        notes: None,
        lines: vec![CreateTransferLine {
            product_id: product,
            quantity_sent: Decimal::from(qty),
        }],
    }
}

#[tokio::test]
async fn flujo_completo_sin_lote_y_estados() {
    let c = setup().await;
    let product = make_product(&c, false).await;
    stock::adjust(
        &c.app,
        c.org,
        c.user,
        Adjust {
            product_id: product,
            store_id: c.origin,
            new_quantity: Decimal::from(100),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();

    let t = service::create(&c.app, c.org, c.user, create_body(&c, product, 10))
        .await
        .unwrap();
    assert_eq!(t.transfer.status, TransferStatus::Draft);
    let line_id = t.lines[0].id;

    // Recibir antes de enviar → Conflict.
    assert_eq!(
        service::receive(
            &c.app,
            c.org,
            c.user,
            true,
            t.transfer.id,
            ReceiveTransfer {
                lines: vec![ReceiveTransferLine {
                    line_id,
                    quantity_received: Decimal::from(10),
                    discrepancy_note: None
                }],
            }
        )
        .await
        .err(),
        Some(AppError::Conflict)
    );

    // Enviar → origen 90.
    let sent = service::send(&c.app, c.org, c.user, t.transfer.id)
        .await
        .unwrap();
    assert_eq!(sent.transfer.status, TransferStatus::Sent);
    assert_eq!(stock_qty(&c, c.origin, product).await, Decimal::from(90));
    // Doble envío → Conflict.
    assert_eq!(
        service::send(&c.app, c.org, c.user, t.transfer.id)
            .await
            .err(),
        Some(AppError::Conflict)
    );

    // Recibir 8 (merma de 2) → destino 8, discrepancia -2.
    let recv = service::receive(
        &c.app,
        c.org,
        c.user,
        true,
        t.transfer.id,
        ReceiveTransfer {
            lines: vec![ReceiveTransferLine {
                line_id,
                quantity_received: Decimal::from(8),
                discrepancy_note: Some("rotura".into()),
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(recv.transfer.status, TransferStatus::Received);
    assert_eq!(recv.lines[0].discrepancy, Some(Decimal::from(-2)));
    assert_eq!(stock_qty(&c, c.dest, product).await, Decimal::from(8));

    // Cerrar.
    let closed = service::close(&c.app, c.org, t.transfer.id).await.unwrap();
    assert_eq!(closed.transfer.status, TransferStatus::Closed);

    teardown(&c, product).await;
}

#[tokio::test]
async fn lote_viaja_origen_a_destino() {
    let c = setup().await;
    let product = make_product(&c, true).await;
    receive_lot(&c, product, c.origin, "L1", 10).await;

    let t = service::create(&c.app, c.org, c.user, create_body(&c, product, 6))
        .await
        .unwrap();
    service::send(&c.app, c.org, c.user, t.transfer.id)
        .await
        .unwrap();
    // FEFO sacó 6 del lote L1 del origen → L1 origen = 4.
    assert_eq!(
        batch_qty(&c, c.origin, product, "L1").await,
        Decimal::from(4)
    );

    service::receive(
        &c.app,
        c.org,
        c.user,
        true,
        t.transfer.id,
        ReceiveTransfer {
            lines: vec![ReceiveTransferLine {
                line_id: t.lines[0].id,
                quantity_received: Decimal::from(6),
                discrepancy_note: None,
            }],
        },
    )
    .await
    .unwrap();
    // El lote L1 se recrea en destino con lo recibido → L1 destino = 6.
    assert_eq!(batch_qty(&c, c.dest, product, "L1").await, Decimal::from(6));

    teardown(&c, product).await;
}

#[tokio::test]
async fn origen_igual_destino_es_bad_request() {
    let c = setup().await;
    let product = make_product(&c, false).await;
    let res = service::create(
        &c.app,
        c.org,
        c.user,
        CreateTransfer {
            origin_store_id: c.origin,
            dest_store_id: c.origin,
            notes: None,
            lines: vec![CreateTransferLine {
                product_id: product,
                quantity_sent: Decimal::from(1),
            }],
        },
    )
    .await;
    assert_eq!(res.err(), Some(AppError::BadRequest));
    teardown(&c, product).await;
}
