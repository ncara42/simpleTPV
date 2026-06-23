//! Integración del registro VeriFactu rectificativo (#152) + gate `blind_returns`:
//! una devolución con ticket crea un `VerifactuRecord` RECTIFICATION (hash no
//! vacío) en la misma tx; la devolución ciega con el flag APAGADO (override de la
//! tienda) devuelve Forbidden antes de tocar nada.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::returns::{
    service as returns_svc, BlindReturnLine, CreateBlindReturn, CreateReturn, CreateReturnLine,
};
use simpletpv_domain::sales::{service as sales_svc, CreateSale, CreateSaleLine, PaymentMethod};
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
    let code = format!("V{}", &store.simple().to_string()[..8]);
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
            name: format!("VF-{}", Uuid::new_v4()),
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

async fn teardown(c: &Ctx, product: Uuid) {
    for sql in [
        r#"DELETE FROM "VerifactuRecord" WHERE "returnId" IN (SELECT id FROM "Return" WHERE "storeId" = $1)"#,
        // Las ventas ahora crean su registro INVOICE (#155): limpiarlo también.
        r#"DELETE FROM "VerifactuRecord" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "storeId" = $1)"#,
        r#"DELETE FROM "ReturnLine" WHERE "returnId" IN (SELECT id FROM "Return" WHERE "storeId" = $1)"#,
        r#"DELETE FROM "Return" WHERE "storeId" = $1"#,
        r#"DELETE FROM "FeatureFlag" WHERE "storeId" = $1"#,
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
async fn devolucion_con_ticket_crea_registro_rectificativo() {
    let c = setup().await;
    let product = make_product(&c).await;

    let sale = sales_svc::create(
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
                qty: Decimal::from(2),
                discount_pct: None,
                discount_amt: None,
            }],
            payment_method: PaymentMethod::Cash,
            cash_given: Some(Decimal::from(1000)),
            ticket_discount_pct: None,
            ticket_discount_amt: None,
            customer_tax_id: None,
            customer_name: None,
            skipped_promotions: vec![],
        },
    )
    .await
    .unwrap();

    let ret = returns_svc::create(
        &c.app,
        c.org,
        c.user,
        true,
        CreateReturn {
            sale_id: sale.sale.id,
            reason: "defecto".into(),
            lines: vec![CreateReturnLine {
                sale_line_id: sale.lines[0].id,
                qty: Decimal::from(1),
            }],
        },
    )
    .await
    .unwrap();

    // Hay exactamente UN registro RECTIFICATION para esta devolución, con hash y
    // payload coherente con el abono (paridad spec NestJS SEC-07): importe NEGATIVO
    // igual a -total de la devolución, e invoiceNumber referenciando el ticket de la
    // venta original. Replica el rigor de verifactu_invoice.rs (que sí asevera signo).
    let (count, hash, total_str, invoice_number): (
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = sqlx::query_as(
        r#"SELECT count(*)::bigint, MAX(hash),
                      MAX(payload->>'importeTotal'), MAX(payload->>'numSerieFactura')
               FROM "VerifactuRecord"
               WHERE "returnId" = $1 AND type = 'RECTIFICATION'::"VerifactuType""#,
    )
    .bind(ret.return_.id)
    .fetch_one(&c.admin)
    .await
    .unwrap();
    assert_eq!(count, 1, "un rectificativo por devolución");
    assert!(hash.is_some_and(|h| h.len() == 64), "hash SHA-256 hex");

    // El importe del rectificativo es un abono: negativo y exactamente -total devuelto.
    let payload_total: Decimal = total_str
        .expect("payload->>'importeTotal' presente")
        .parse()
        .expect("importeTotal numérico en el payload");
    assert!(payload_total < Decimal::ZERO, "abono: importe negativo");
    assert_eq!(
        payload_total, -ret.return_.total,
        "el abono = -total de la devolución"
    );

    // El rectificativo referencia la factura original (nº de ticket de la venta).
    let original_ticket: String =
        sqlx::query_scalar(r#"SELECT "ticketNumber" FROM "Sale" WHERE id = $1"#)
            .bind(sale.sale.id)
            .fetch_one(&c.admin)
            .await
            .unwrap();
    assert_eq!(
        invoice_number.as_deref(),
        Some(original_ticket.as_str()),
        "invoiceNumber referencia el ticket de la venta original"
    );

    teardown(&c, product).await;
}

#[tokio::test]
async fn devolucion_ciega_con_flag_apagado_da_forbidden() {
    let c = setup().await;
    let product = make_product(&c).await;
    // Apaga blind_returns SOLO en esta tienda (override de tienda) → scoped.
    sqlx::query(
        r#"INSERT INTO "FeatureFlag" (id, "organizationId", "storeId", key, enabled, "updatedAt")
           VALUES ($1, $2, $3, 'blind_returns', false, now())"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(c.store)
    .execute(&c.admin)
    .await
    .unwrap();

    let res = returns_svc::create_blind(
        &c.app,
        c.org,
        c.user,
        true,
        CreateBlindReturn {
            store_id: c.store,
            reason: "x".into(),
            manager_pin: "0000".into(),
            lines: vec![BlindReturnLine {
                product_id: product,
                qty: Decimal::from(1),
            }],
        },
    )
    .await;
    assert_eq!(
        res.err(),
        Some(AppError::Forbidden),
        "flag apagado → Forbidden"
    );

    teardown(&c, product).await;
}
