//! Integración del cobro (cuentas por cobrar): una factura a crédito B2B nace
//! PENDING (y SIN exigir caja abierta), mientras que una venta TPV al contado nace
//! PAID con `paidAt`. Cubre además los filtros de estado de cobro (PAID/PENDING/
//! OVERDUE, donde OVERDUE = PENDING + dueDate pasada), el split de totales
//! (cobrado/pendiente/vencido sobre ventas COMPLETED) y `collect` (PENDING→PAID,
//! idempotente, anulada→BadRequest, desconocida→NotFound). Espeja el patrón
//! Postgres-efímero de `sales_totals.rs` (tienda dedicada por test + DELETEs).

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::model::{PaymentStatus, Sale, SaleChannel};
use simpletpv_domain::sales::service::{self, SalesFilter};
use simpletpv_domain::sales::{CreateSale, CreateSaleLine, PaymentMethod};
use simpletpv_domain::stock::{service as stock, Adjust};
use simpletpv_shared::AppError;
use sqlx::postgres::{PgPool, PgPoolOptions};
use time::{Date, OffsetDateTime};
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

/// Crea una tienda propia **SIN caja abierta** para aislar el test. Las facturas a
/// crédito (B2B) no requieren caja; las ventas TPV sí → `open_session` la abre.
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
    let code = format!("C{}", &store.simple().to_string()[..8]);
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

/// Abre una caja para la tienda del contexto (necesaria solo para ventas TPV).
async fn open_session(c: &Ctx) {
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

async fn make_product(c: &Ctx) -> Uuid {
    let id = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("COBRO-{}", Uuid::new_v4()),
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
            new_quantity: Decimal::from(1000),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
    id
}

/// Venta TPV al contado (canal por defecto): nace PAID con `paidAt`. Requiere caja.
async fn sell_cash(c: &Ctx, product: Uuid, qty: i64) -> Sale {
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
            customer_tax_id: None,
            customer_name: None,
            channel: None,
            credit_due_date: None,
            skipped_promotions: vec![],
        },
    )
    .await
    .unwrap()
    .sale
}

/// Factura a crédito B2B con vencimiento `due` (YYYY-MM-DD): nace PENDING, sin
/// `paidAt`, sin requerir caja abierta.
async fn sell_credit(c: &Ctx, product: Uuid, qty: i64, due: &str) -> Sale {
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
            payment_method: PaymentMethod::Transfer,
            cash_given: None,
            ticket_discount_pct: None,
            ticket_discount_amt: None,
            customer_tax_id: None,
            customer_name: None,
            channel: Some(SaleChannel::B2b),
            credit_due_date: Some(due.to_owned()),
            skipped_promotions: vec![],
        },
    )
    .await
    .unwrap()
    .sale
}

fn filter(store: Uuid) -> SalesFilter {
    SalesFilter {
        store_id: Some(store),
        page: 1,
        page_size: 50,
        ..Default::default()
    }
}

/// Fecha de calendario → `YYYY-MM-DD` (sin depender de features de formato de `time`).
fn ymd(d: Date) -> String {
    format!("{:04}-{:02}-{:02}", d.year(), u8::from(d.month()), d.day())
}

fn future_due() -> Date {
    OffsetDateTime::now_utc()
        .date()
        .saturating_add(time::Duration::days(30))
}

fn past_due() -> Date {
    OffsetDateTime::now_utc()
        .date()
        .saturating_sub(time::Duration::days(30))
}

async fn cleanup(c: &Ctx, products: &[Uuid]) {
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
    for p in products {
        sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
            .bind(p)
            .execute(&c.admin)
            .await
            .unwrap();
    }
}

/// Una factura a crédito B2B nace PENDING (con `dueDate`, sin `paidAt`) y NO exige
/// caja abierta: el gate de caja es un concepto de la terminal de tienda, no de la
/// facturación. Lo VENCIDO no se almacena (un vencimiento pasado sigue siendo
/// PENDING; la vencidez se deriva en consulta).
#[tokio::test]
async fn factura_credito_b2b_nace_pendiente_sin_caja() {
    let c = setup().await; // tienda SIN caja
    let product = make_product(&c).await;

    let future = future_due();
    let past = past_due();

    // Vencimiento FUTURO: PENDING, dueDate fijada, sin paidAt — y sin caja abierta.
    let s = sell_credit(&c, product, 1, &ymd(future)).await;
    assert_eq!(s.payment_status, PaymentStatus::Pending);
    assert_eq!(s.channel, SaleChannel::B2b);
    assert_eq!(s.due_date, Some(future));
    assert!(s.paid_at.is_none());

    // Vencimiento PASADO: también PENDING (la vencidez es virtual, no se persiste).
    let s2 = sell_credit(&c, product, 1, &ymd(past)).await;
    assert_eq!(s2.payment_status, PaymentStatus::Pending);
    assert_eq!(s2.due_date, Some(past));
    assert!(s2.paid_at.is_none());

    cleanup(&c, &[product]).await;
}

/// Una venta TPV al contado (canal por defecto) con caja abierta nace PAID, con
/// `paidAt` sellado y sin `dueDate`.
#[tokio::test]
async fn venta_tpv_nace_cobrada() {
    let c = setup().await;
    open_session(&c).await;
    let product = make_product(&c).await;

    let s = sell_cash(&c, product, 1).await;
    assert_eq!(s.payment_status, PaymentStatus::Paid);
    assert_eq!(s.channel, SaleChannel::Tpv);
    assert!(s.paid_at.is_some());
    assert!(s.due_date.is_none());

    cleanup(&c, &[product]).await;
}

/// El filtro de estado de cobro acota el listado: PENDING devuelve ambas pendientes
/// (futura y pasada), OVERDUE solo la de vencimiento pasado, PAID solo la cobrada.
#[tokio::test]
async fn filtro_estado_de_cobro_acota_listado() {
    let c = setup().await;
    open_session(&c).await; // la venta PAID es TPV (requiere caja)
    let product = make_product(&c).await;

    let future = ymd(future_due());
    let past = ymd(past_due());

    let paid = sell_cash(&c, product, 1).await.id;
    let pending_future = sell_credit(&c, product, 1, &future).await.id;
    let pending_past = sell_credit(&c, product, 1, &past).await.id;

    // PENDING → ambas pendientes.
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            payment_status: Some("PENDING".into()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(page.total_items, 2, "las dos pendientes");
    let ids: Vec<Uuid> = page.items.iter().map(|i| i.sale.id).collect();
    assert!(ids.contains(&pending_future) && ids.contains(&pending_past));
    assert!(!ids.contains(&paid), "la cobrada no es PENDING");

    // OVERDUE → solo la de vencimiento pasado.
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            payment_status: Some("OVERDUE".into()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(page.total_items, 1, "solo la vencida");
    assert_eq!(page.items[0].sale.id, pending_past);

    // PAID → solo la cobrada.
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            payment_status: Some("PAID".into()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(page.total_items, 1, "solo la cobrada");
    assert_eq!(page.items[0].sale.id, paid);

    cleanup(&c, &[product]).await;
}

/// El split de totales (cobrado/pendiente/vencido) refleja una mezcla conocida y
/// IGNORA las ventas anuladas: una venta PAID anulada (VOIDED) no suma en ninguno de
/// los tres importes ni en el total agregado (los totales solo cuentan COMPLETED).
#[tokio::test]
async fn totales_de_cobro_reflejan_la_mezcla_y_excluyen_anuladas() {
    let c = setup().await;
    open_session(&c).await;
    let product = make_product(&c).await;

    let future = ymd(future_due());
    let past = ymd(past_due());

    // Mezcla conocida (precio 100/ud):
    //  - PAID  TPV       qty 1 → 100
    //  - PENDING futura  qty 2 → 200 (no vencida)
    //  - PENDING pasada  qty 3 → 300 (vencida)
    //  - ANULADA TPV     qty 5 → 500 (nace PAID; tras VOID, fuera de TODO el split)
    let _paid = sell_cash(&c, product, 1).await;
    let _pending_future = sell_credit(&c, product, 2, &future).await;
    let _pending_past = sell_credit(&c, product, 3, &past).await;
    let voided = sell_cash(&c, product, 5).await;
    service::void(&c.app, c.org, voided.id, c.user)
        .await
        .unwrap();

    let page = service::list(&c.app, c.org, c.user, true, filter(c.store))
        .await
        .unwrap();

    // Las 4 se listan (auditoría), pero los agregados solo cuentan COMPLETED.
    assert_eq!(page.total_items, 4, "las 4 se listan (la anulada también)");
    assert_eq!(page.totals.count, 3, "3 COMPLETED (la anulada no cuenta)");
    assert_eq!(page.totals.total_amount, Decimal::from(600));
    assert_eq!(
        page.totals.paid_total,
        Decimal::from(100),
        "solo la PAID viva (la anulada de 500 queda fuera)"
    );
    assert_eq!(
        page.totals.pending_total,
        Decimal::from(500),
        "futura 200 + pasada 300"
    );
    assert_eq!(
        page.totals.overdue_total,
        Decimal::from(300),
        "solo la pasada vencida"
    );

    cleanup(&c, &[product]).await;
}

/// `collect` marca una factura PENDING como PAID y sella `paidAt`; volver a cobrarla
/// es idempotente (no-op: sigue PAID y devuelve Ok).
#[tokio::test]
async fn collect_marca_pagada_y_es_idempotente() {
    let c = setup().await; // crédito B2B no requiere caja
    let product = make_product(&c).await;
    let future = ymd(future_due());

    let pending = sell_credit(&c, product, 1, &future).await;
    assert_eq!(pending.payment_status, PaymentStatus::Pending);
    assert!(pending.paid_at.is_none());

    // PENDING → PAID, sella paidAt.
    let paid = service::collect(&c.app, c.org, pending.id, c.user)
        .await
        .unwrap();
    assert_eq!(paid.payment_status, PaymentStatus::Paid);
    assert!(paid.paid_at.is_some(), "collect sella paidAt");

    // Idempotente: volver a cobrar es Ok y sigue PAID.
    let again = service::collect(&c.app, c.org, pending.id, c.user)
        .await
        .unwrap();
    assert_eq!(again.payment_status, PaymentStatus::Paid);

    cleanup(&c, &[product]).await;
}

/// `collect` sobre una venta ANULADA (VOIDED) → BadRequest (no se cobra una anulada).
#[tokio::test]
async fn collect_venta_anulada_es_bad_request() {
    let c = setup().await;
    let product = make_product(&c).await;
    let future = ymd(future_due());

    let pending = sell_credit(&c, product, 1, &future).await;
    service::void(&c.app, c.org, pending.id, c.user)
        .await
        .unwrap();

    let res = service::collect(&c.app, c.org, pending.id, c.user).await;
    assert_eq!(res.err(), Some(AppError::BadRequest));

    cleanup(&c, &[product]).await;
}

/// `collect` sobre un id inexistente → NotFound.
#[tokio::test]
async fn collect_id_desconocido_es_not_found() {
    let c = setup().await;
    let res = service::collect(&c.app, c.org, Uuid::new_v4(), c.user).await;
    assert_eq!(res.err(), Some(AppError::NotFound));
    cleanup(&c, &[]).await;
}
