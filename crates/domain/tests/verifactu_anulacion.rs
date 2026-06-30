//! Integración del `RegistroAnulacion` VeriFactu (#230): anular una venta
//! (VOIDED) crea, en la MISMA tx (atómico, SEC-02), un `VerifactuRecord` tipo
//! ANULACION en estado PENDING que CANCELA la factura original (distinto de la
//! rectificativa R5 de una devolución). La anulación referencia la factura anulada
//! tal cual se registró en su RegistroAlta y encadena su propia huella oficial.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::service::{self};
use simpletpv_domain::sales::{
    CreateSale, CreateSaleLine, PaymentMethod, SaleStatus, SaleWithLines,
};
use simpletpv_domain::stock::{service as stock, Adjust};
use simpletpv_domain::verifactu::{compute_anulacion_hash, AnulacionHashInput};
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
    let code = format!("A{}", &store.simple().to_string()[..8]);
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
            name: format!("VFA-{}", Uuid::new_v4()),
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
            customer_tax_id: None,
            customer_name: None,
            channel: None,
            credit_due_date: None,
            skipped_promotions: vec![],
        },
    )
    .await
    .unwrap()
}

/// Campos de la factura (INVOICE) registrados en su RegistroAlta.
struct Invoice {
    id_emisor: String,
    num_serie: String,
    fecha_expedicion: String,
    hash: String,
}

async fn invoice_record(c: &Ctx, sale_id: Uuid) -> Invoice {
    let (id_emisor, num_serie, fecha_expedicion, hash): (String, String, String, String) =
        sqlx::query_as(
            r#"SELECT payload->>'idEmisorFactura', payload->>'numSerieFactura',
                 payload->>'fechaExpedicionFactura', hash
               FROM "VerifactuRecord"
               WHERE "saleId" = $1 AND type = 'INVOICE'::"VerifactuType""#,
        )
        .bind(sale_id)
        .fetch_one(&c.admin)
        .await
        .expect("un registro INVOICE por venta");
    Invoice {
        id_emisor,
        num_serie,
        fecha_expedicion,
        hash,
    }
}

/// Campos del registro ANULACION: (status, qrData, hash, previousHash,
/// numSerieAnulada, idEmisorAnulada, fechaExpedicionAnulada, fechaHoraHuso).
#[allow(clippy::type_complexity)]
async fn anulacion_record(
    c: &Ctx,
    sale_id: Uuid,
) -> (
    String,
    Option<String>,
    String,
    Option<String>,
    String,
    String,
    String,
    String,
) {
    sqlx::query_as(
        r#"SELECT status::text, "qrData", hash, "previousHash",
             payload->>'numSerieFacturaAnulada', payload->>'idEmisorFacturaAnulada',
             payload->>'fechaExpedicionFacturaAnulada', payload->>'fechaHoraHusoGenRegistro'
           FROM "VerifactuRecord"
           WHERE "saleId" = $1 AND type = 'ANULACION'::"VerifactuType""#,
    )
    .bind(sale_id)
    .fetch_one(&c.admin)
    .await
    .expect("un registro ANULACION por venta anulada")
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
async fn anular_venta_crea_registro_verifactu_anulacion() {
    let c = setup().await;
    let product = make_product(&c).await;

    // Venta → su RegistroAlta (INVOICE). Luego se anula → RegistroAnulacion.
    let s = sell(&c, product, 2).await;
    let invoice = invoice_record(&c, s.sale.id).await;

    let voided = service::void(&c.app, c.org, s.sale.id, c.user)
        .await
        .unwrap();
    assert_eq!(voided.status, SaleStatus::Voided, "la venta queda anulada");

    let (status, qr, hash, previous_hash, num_serie, id_emisor, fecha_exp, fecha_huso) =
        anulacion_record(&c, s.sale.id).await;

    assert_eq!(
        status, "PENDING",
        "el registro nace PENDING (envío diferido)"
    );
    assert!(
        qr.is_none(),
        "la anulación no lleva QR de cotejo (es de la factura)"
    );
    assert_eq!(hash.len(), 64, "huella SHA-256 en hex");
    assert_ne!(
        hash, invoice.hash,
        "la huella de la anulación difiere de la de la factura"
    );

    // La anulación referencia la factura anulada EXACTAMENTE como se registró.
    assert_eq!(id_emisor, invoice.id_emisor, "IDEmisorFacturaAnulada");
    assert_eq!(num_serie, invoice.num_serie, "NumSerieFacturaAnulada");
    assert_eq!(
        fecha_exp, invoice.fecha_expedicion,
        "FechaExpedicionFacturaAnulada = fecha de expedición de la factura original"
    );

    // Huella oficial de la anulación re-derivada de los campos almacenados +
    // su `previousHash` real: prueba el cableado extremo a extremo de forma
    // determinista (sin depender del vecino de cadena).
    let expected = compute_anulacion_hash(
        &AnulacionHashInput {
            id_emisor: &id_emisor,
            num_serie: &num_serie,
            fecha_expedicion: &fecha_exp,
            fecha_hora_huso_gen: &fecha_huso,
        },
        previous_hash.as_deref(),
    );
    assert_eq!(
        hash, expected,
        "huella de anulación oficial bien encadenada"
    );

    teardown(&c, product).await;
}
