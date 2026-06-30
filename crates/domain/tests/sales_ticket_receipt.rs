//! Integración del ticket/factura simplificada (#152) contra Postgres con RLS:
//! `get_ticket` carga datos fiscales (org/tienda), cuadra el desglose de IVA
//! (Σ(base+cuota)==total, con y sin descuento de ticket), devuelve 404 y no
//! cruza tenants. Cada test usa una tienda propia para aislarse.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::receipt::render_receipt_html;
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
    let id = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("TICKET-{}", Uuid::new_v4()),
            sale_price: price,
            description: None,
            barcode: None,
            sku: None,
            cost_price: None,
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
    // Stock suficiente para que el create no falle por inventario.
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

async fn teardown(c: &Ctx, products: &[Uuid]) {
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
    sqlx::query(r#"DELETE FROM "Product" WHERE id = ANY($1)"#)
        .bind(products)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn line(product: Uuid, qty: i64) -> CreateSaleLine {
    CreateSaleLine {
        product_id: product,
        qty: Decimal::from(qty),
        discount_pct: None,
        discount_amt: None,
    }
}

fn body(store: Uuid, product: Uuid, qty: i64, ticket_pct: Option<Decimal>) -> CreateSale {
    CreateSale {
        store_id: store,
        client_id: None,
        ticket_number: None,
        lines: vec![line(product, qty)],
        payment_method: PaymentMethod::Cash,
        cash_given: Some(Decimal::from(1000)),
        ticket_discount_pct: ticket_pct,
        ticket_discount_amt: None,
        customer_tax_id: None,
        customer_name: None,
        channel: None,
        credit_due_date: None,
        skipped_promotions: vec![],
    }
}

/// Suma Σ(base+cuota) del desglose de IVA.
fn tax_sum(t: &simpletpv_domain::sales::TicketData) -> Decimal {
    t.tax_breakdown.iter().map(|i| i.base + i.cuota).sum()
}

#[tokio::test]
async fn ticket_datos_fiscales_y_cuadre_de_iva_sin_descuento() {
    let c = setup().await;
    open_cash_session(&c).await;
    let product = make_product(&c, Decimal::new(2490, 2)).await; // 24.90

    let sale = service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        body(c.store, product, 2, None),
    )
    .await
    .unwrap();

    let ticket = service::get_ticket(&c.app, c.org, sale.sale.id)
        .await
        .unwrap();

    assert_eq!(ticket.ticket_number, sale.sale.ticket_number);
    assert_eq!(ticket.organization.nif.as_deref(), Some("B11111111"));
    assert_eq!(ticket.lines.len(), 1);
    assert!(!ticket.tax_breakdown.is_empty(), "hay desglose de IVA");
    // Invariante fiscal: Σ(base+cuota) == total EXACTO.
    assert_eq!(tax_sum(&ticket), ticket.total);
    assert_eq!(ticket.total, sale.sale.total);

    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn ticket_con_descuento_de_ticket_prorratea_y_cuadra() {
    let c = setup().await;
    open_cash_session(&c).await;
    let product = make_product(&c, Decimal::new(10000, 2)).await; // 100.00

    // 10% de descuento de ticket.
    let sale = service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        body(c.store, product, 2, Some(Decimal::from(10))),
    )
    .await
    .unwrap();

    let ticket = service::get_ticket(&c.app, c.org, sale.sale.id)
        .await
        .unwrap();
    assert!(
        ticket.discount_total > Decimal::ZERO,
        "hay descuento de ticket"
    );
    // Con descuento de ticket, el desglose debe seguir cuadrando con el total.
    assert_eq!(tax_sum(&ticket), ticket.total);

    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn ticket_404_si_la_venta_no_existe() {
    let c = setup().await;
    let res = service::get_ticket(&c.app, c.org, Uuid::new_v4()).await;
    assert_eq!(res.err(), Some(AppError::NotFound));
    teardown(&c, &[]).await;
}

#[tokio::test]
async fn ticket_no_cruza_tenants_rls() {
    let c = setup().await;
    open_cash_session(&c).await;
    let product = make_product(&c, Decimal::new(500, 2)).await;
    let sale = service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        body(c.store, product, 1, None),
    )
    .await
    .unwrap();

    // Otra organización (org2) NO puede ver el ticket de org1 → NotFound (RLS).
    let org2: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B22222222'"#)
        .fetch_one(&c.admin)
        .await
        .unwrap();
    let res = service::get_ticket(&c.app, org2, sale.sale.id).await;
    assert_eq!(res.err(), Some(AppError::NotFound));

    teardown(&c, &[product]).await;
}

#[tokio::test]
async fn ticket_render_html_contiene_documento_fiscal() {
    let c = setup().await;
    open_cash_session(&c).await;
    let product = make_product(&c, Decimal::new(2490, 2)).await;
    let sale = service::create(
        &c.app,
        c.org,
        c.user,
        Role::Admin,
        body(c.store, product, 1, None),
    )
    .await
    .unwrap();

    let ticket = service::get_ticket(&c.app, c.org, sale.sale.id)
        .await
        .unwrap();
    let html = render_receipt_html(&ticket);
    assert!(html.contains("<!DOCTYPE html>"));
    assert!(html.contains("Desglose de IVA"));
    assert!(html.contains("IVA 21%"));
    assert!(html.contains(&ticket.ticket_number));

    teardown(&c, &[product]).await;
}
