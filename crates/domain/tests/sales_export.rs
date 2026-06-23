//! Integración del export de ventas (#152) contra Postgres con RLS: genera el
//! CSV (ventas y contable) de forma SÍNCRONA → COMPLETED, lo descarga (con el
//! nombre de fichero según formato), no cruza tenants, y devuelve 409 si el
//! export no está listo.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::export_service::{self, ExportFormat, SalesExportFilter};
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
    let code = format!("X{}", &store.simple().to_string()[..8]);
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

async fn make_sale(c: &Ctx) -> Uuid {
    let product = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("EXP-{}", Uuid::new_v4()),
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
            product_id: product,
            store_id: c.store,
            new_quantity: Decimal::from(100),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
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
    product
}

async fn teardown(c: &Ctx, product: Uuid, export_id: Uuid) {
    // Borra solo el export de ESTE test (por id) para evitar la carrera con
    // tests concurrentes que comparten el mismo usuario.
    sqlx::query(r#"DELETE FROM "SalesExport" WHERE id = $1"#)
        .bind(export_id)
        .execute(&c.admin)
        .await
        .unwrap();
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
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(product)
        .execute(&c.admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn export_ventas_completed_y_descarga() {
    let c = setup().await;
    let product = make_sale(&c).await;

    let meta = export_service::create_sales_export(
        &c.app,
        c.org,
        c.user,
        true,
        SalesExportFilter {
            store_id: Some(c.store),
            ..Default::default()
        },
        ExportFormat::Sales,
    )
    .await
    .unwrap();
    assert_eq!(meta.status.as_str(), "COMPLETED");
    assert_eq!(meta.row_count, Some(1), "una venta exportada");

    let (csv, filename) = export_service::download_sales_export(&c.app, c.org, meta.id)
        .await
        .unwrap();
    assert_eq!(filename, "ventas.csv");
    assert!(csv.starts_with("ticket,fecha,tienda,vendedor,estado,metodo_pago"));
    assert_eq!(csv.lines().count(), 2, "cabecera + 1 venta");

    teardown(&c, product, meta.id).await;
}

#[tokio::test]
async fn export_contable_libro_de_iva() {
    let c = setup().await;
    let product = make_sale(&c).await;

    let meta = export_service::create_sales_export(
        &c.app,
        c.org,
        c.user,
        true,
        SalesExportFilter {
            store_id: Some(c.store),
            ..Default::default()
        },
        ExportFormat::Accounting,
    )
    .await
    .unwrap();
    assert_eq!(meta.status.as_str(), "COMPLETED");

    let (csv, filename) = export_service::download_sales_export(&c.app, c.org, meta.id)
        .await
        .unwrap();
    assert_eq!(filename, "libro-iva.csv");
    assert!(csv.starts_with("fecha,numero,tienda,metodo_pago,tipo_iva,base,cuota,total"));
    assert!(csv.contains(",21,"), "desglose con tipo 21%");

    teardown(&c, product, meta.id).await;
}

#[tokio::test]
async fn export_no_cruza_tenants_rls() {
    let c = setup().await;
    let product = make_sale(&c).await;
    let meta = export_service::create_sales_export(
        &c.app,
        c.org,
        c.user,
        true,
        SalesExportFilter::default(),
        ExportFormat::Sales,
    )
    .await
    .unwrap();

    let org2: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B22222222'"#)
        .fetch_one(&c.admin)
        .await
        .unwrap();
    assert_eq!(
        export_service::get_sales_export(&c.app, org2, meta.id)
            .await
            .err(),
        Some(AppError::NotFound)
    );
    assert_eq!(
        export_service::download_sales_export(&c.app, org2, meta.id)
            .await
            .err(),
        Some(AppError::NotFound)
    );

    teardown(&c, product, meta.id).await;
}

#[tokio::test]
async fn descarga_pendiente_devuelve_conflict() {
    let c = setup().await;
    // Inserta un export PENDING a mano (simula un job aún sin completar).
    let id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "SalesExport" (id, "organizationId", status, filters, "requestedById")
           VALUES ($1, $2, 'PENDING'::"SalesExportStatus", '{}'::jsonb, $3)"#,
    )
    .bind(id)
    .bind(c.org)
    .bind(c.user)
    .execute(&c.admin)
    .await
    .unwrap();

    assert_eq!(
        export_service::download_sales_export(&c.app, c.org, id)
            .await
            .err(),
        Some(AppError::Conflict)
    );

    sqlx::query(r#"DELETE FROM "SalesExport" WHERE id = $1"#)
        .bind(id)
        .execute(&c.admin)
        .await
        .unwrap();
    // Borra la caja (FK→Store) antes de la tienda.
    sqlx::query(r#"DELETE FROM "CashSession" WHERE "storeId" = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Store" WHERE id = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
}
