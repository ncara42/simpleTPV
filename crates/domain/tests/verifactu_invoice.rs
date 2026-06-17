//! Integración del registro VeriFactu de FACTURA (#155): cada venta COMPLETED
//! crea, en la MISMA tx (atómico, SEC-02), un `VerifactuRecord` tipo INVOICE en
//! estado PENDING con huella encadenada y QR. Complementa el test de
//! rectificativos (devoluciones) de `verifactu_rectification.rs`.

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
    let code = format!("F{}", &store.simple().to_string()[..8]);
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
            name: format!("VFI-{}", Uuid::new_v4()),
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

async fn sell(c: &Ctx, product: Uuid, qty: i64) -> SaleWithLines {
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
}

/// El único registro INVOICE de una venta: (status, qrData, hash, total del payload).
async fn invoice_record(c: &Ctx, sale_id: Uuid) -> (String, Option<String>, String, String) {
    sqlx::query_as(
        r#"SELECT status::text, "qrData", hash, payload->>'total'
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
async fn cada_venta_crea_registro_verifactu_invoice() {
    let c = setup().await;
    let product = make_product(&c).await;

    // Dos ventas: 200 y 100. Cada una debe dejar su registro INVOICE/PENDING.
    let s1 = sell(&c, product, 2).await;
    let s2 = sell(&c, product, 1).await;

    let (st1, qr1, hash1, total1) = invoice_record(&c, s1.sale.id).await;
    let (st2, qr2, hash2, total2) = invoice_record(&c, s2.sale.id).await;

    for (st, qr, hash, total, sale) in [
        (&st1, &qr1, &hash1, &total1, &s1.sale),
        (&st2, &qr2, &hash2, &total2, &s2.sale),
    ] {
        assert_eq!(st, "PENDING", "el registro nace PENDING (envío diferido)");
        assert!(qr.is_some(), "qrData de cotejo presente");
        assert_eq!(hash.len(), 64, "huella SHA-256 en hex");
        // payload->>'total' = total de la venta con 2 decimales, positivo (factura).
        let parsed: Decimal = total.parse().expect("total numérico en el payload");
        assert!(parsed > Decimal::ZERO, "factura: importe positivo");
        assert_eq!(
            parsed, sale.total,
            "el importe del registro = total de la venta"
        );
    }

    // Dos facturas distintas → huellas distintas (encadenamiento real).
    assert_ne!(hash1, hash2, "cada factura encadena con huella propia");

    teardown(&c, product).await;
}
