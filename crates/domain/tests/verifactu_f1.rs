//! Integración de la **factura completa F1** (#230): una venta con NIF + razón
//! social del destinatario registra un `RegistroAlta` con `TipoFactura = F1` y
//! bloque Destinatario en el payload; una venta normal (ticket) sigue siendo `F2`
//! simplificada sin destinatario. La huella oficial difiere (F1 ≠ F2) porque
//! `TipoFactura` entra en la cadena.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::service::{self};
use simpletpv_domain::sales::{CreateSale, CreateSaleLine, PaymentMethod, SaleWithLines};
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
    let code = format!("G{}", &store.simple().to_string()[..8]);
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
            name: format!("VF1-{}", Uuid::new_v4()),
            sale_price: Decimal::from(100),
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

/// Vende `qty` con un destinatario fiscal opcional (NIF, razón social).
async fn sell(c: &Ctx, product: Uuid, qty: i64, recipient: Option<(&str, &str)>) -> SaleWithLines {
    let (customer_tax_id, customer_name) = match recipient {
        Some((tax, name)) => (Some(tax.to_owned()), Some(name.to_owned())),
        None => (None, None),
    };
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
            customer_tax_id,
            customer_name,
            skipped_promotions: vec![],
        },
    )
    .await
    .unwrap()
}

/// (tipoFactura, destinatario.nif, destinatario.nombreRazon, hash) del INVOICE.
async fn invoice_record(
    c: &Ctx,
    sale_id: Uuid,
) -> (String, Option<String>, Option<String>, String) {
    sqlx::query_as(
        r#"SELECT payload->>'tipoFactura', payload->'destinatario'->>'nif',
             payload->'destinatario'->>'nombreRazon', hash
           FROM "VerifactuRecord"
           WHERE "saleId" = $1 AND type = 'INVOICE'::"VerifactuType""#,
    )
    .bind(sale_id)
    .fetch_one(&c.admin)
    .await
    .expect("un registro INVOICE por venta")
}

async fn teardown(c: &Ctx, product: Uuid) {
    for sql in [
        r#"DELETE FROM "VerifactuRecord" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "storeId" = $1)"#,
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
async fn factura_con_nif_es_f1_con_destinatario_y_ticket_es_f2() {
    let c = setup().await;
    let product = make_product(&c).await;

    // Venta CON NIF → factura completa F1 con bloque Destinatario.
    let f1 = sell(&c, product, 2, Some(("B11111111", "Cliente Empresa SL"))).await;
    let (tipo1, nif1, nombre1, hash1) = invoice_record(&c, f1.sale.id).await;
    assert_eq!(tipo1, "F1", "venta con NIF → factura completa F1");
    assert_eq!(nif1.as_deref(), Some("B11111111"), "Destinatario.NIF");
    assert_eq!(
        nombre1.as_deref(),
        Some("Cliente Empresa SL"),
        "Destinatario.NombreRazon"
    );
    // El snapshot fiscal queda también en la propia venta.
    assert_eq!(f1.sale.customer_tax_id.as_deref(), Some("B11111111"));
    assert_eq!(f1.sale.customer_name.as_deref(), Some("Cliente Empresa SL"));

    // Venta normal (sin NIF) → ticket = factura simplificada F2, sin destinatario.
    let f2 = sell(&c, product, 1, None).await;
    let (tipo2, nif2, _nombre2, hash2) = invoice_record(&c, f2.sale.id).await;
    assert_eq!(tipo2, "F2", "ticket sin NIF → factura simplificada F2");
    assert!(nif2.is_none(), "F2 no lleva bloque Destinatario");
    assert!(f2.sale.customer_tax_id.is_none(), "F2 sin NIF en la venta");

    // `TipoFactura` entra en la huella → F1 y F2 producen huellas distintas.
    assert_ne!(hash1, hash2, "F1 y F2 encadenan huellas distintas");

    teardown(&c, product).await;
}
