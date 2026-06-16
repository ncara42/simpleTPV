//! Integración del stock contra Postgres con RLS (port de los stock*.integration
//! specs, slice A): ajuste + movimiento + aislamiento, alertas (crear/resolver),
//! FEFO (early primero + faltante) y caducidad. Requiere el Postgres dev sembrado.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::stock::model::MovementType;
use simpletpv_domain::stock::service::{self, ApplyMovementInput, BatchRef};
use simpletpv_domain::stock::{Adjust, SetMin};
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

async fn org_id(admin: &PgPool, nif: &str) -> Uuid {
    sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = $1"#)
        .bind(nif)
        .fetch_one(admin)
        .await
        .expect("seed: organización presente")
}

async fn a_store(admin: &PgPool, org: Uuid) -> Uuid {
    sqlx::query_scalar(
        r#"SELECT id FROM "Store" WHERE "organizationId" = $1 ORDER BY code LIMIT 1"#,
    )
    .bind(org)
    .fetch_one(admin)
    .await
    .expect("seed: tienda presente")
}

/// Usuario real del seed (la FK `StockMovement.userId` exige que exista).
async fn a_user(admin: &PgPool, org: Uuid) -> Uuid {
    sqlx::query_scalar(
        r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
    )
    .bind(org)
    .fetch_one(admin)
    .await
    .expect("seed: usuario presente")
}

/// Crea un producto en `org` (vía el servicio de catálogo) y devuelve su id.
async fn make_product(app: &PgPool, org: Uuid) -> Uuid {
    let name = format!("STK-{}", Uuid::new_v4());
    let p = products::service::create(
        app,
        org,
        NewProduct {
            name,
            sale_price: Decimal::new(100, 2),
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
    .expect("crear producto");
    p.id
}

/// Borra todo el rastro de stock de un producto y el producto (orden FK).
async fn cleanup(admin: &PgPool, product: Uuid) {
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "productId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "productId" = $1"#,
        r#"DELETE FROM "StockBatch" WHERE "productId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "productId" = $1"#,
        r#"DELETE FROM "Product" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(product)
            .execute(admin)
            .await
            .expect("limpiar");
    }
}

async fn receive(
    app: &PgPool,
    org: Uuid,
    product: Uuid,
    store: Uuid,
    lot: &str,
    expiry: Option<Date>,
    qty: Decimal,
) {
    let lot = lot.to_owned();
    with_tenant_tx(app, org, async move |tx, _after| {
        service::apply_movement(
            tx,
            ApplyMovementInput {
                organization_id: org,
                product_id: product,
                store_id: store,
                movement_type: MovementType::PurchaseReceipt,
                quantity: qty,
                reference_id: None,
                reason: None,
                user_id: None,
                batch: Some(BatchRef {
                    lot_code: lot,
                    expiry_date: expiry,
                }),
            },
        )
        .await
    })
    .await
    .expect("recepción");
}

async fn batch_qty(admin: &PgPool, product: Uuid, lot: &str) -> Decimal {
    sqlx::query_scalar(
        r#"SELECT quantity FROM "StockBatch" WHERE "productId" = $1 AND "lotCode" = $2"#,
    )
    .bind(product)
    .bind(lot)
    .fetch_one(admin)
    .await
    .expect("lote presente")
}

#[tokio::test]
async fn adjust_fija_stock_registra_movimiento_y_aisla_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let org2 = org_id(&admin, "B22222222").await;
    let store = a_store(&admin, org1).await;
    let product = make_product(&app, org1).await;

    let user = a_user(&admin, org1).await;
    let view = service::adjust(
        &app,
        org1,
        user,
        Adjust {
            product_id: product,
            store_id: store,
            new_quantity: Decimal::new(42, 0),
            reason: "recuento".into(),
        },
    )
    .await
    .expect("ajuste");
    assert_eq!(view.quantity, Decimal::new(42, 0));

    // Movimiento ADJUSTMENT registrado y visible en org1.
    let page = service::movements(
        &app,
        org1,
        service::MovementsFilter {
            product_id: Some(product),
            page: 1,
            page_size: 50,
            ..Default::default()
        },
    )
    .await
    .expect("movimientos");
    assert!(page.total_items >= 1);
    assert_eq!(page.items[0].movement_type, MovementType::Adjustment);

    // org2 no ve los movimientos de org1 (RLS).
    let page2 = service::movements(
        &app,
        org2,
        service::MovementsFilter {
            product_id: Some(product),
            page: 1,
            page_size: 50,
            ..Default::default()
        },
    )
    .await
    .expect("movimientos org2");
    assert_eq!(page2.total_items, 0);

    cleanup(&admin, product).await;
}

#[tokio::test]
async fn set_min_dispara_alerta_y_reposicion_la_resuelve() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let store = a_store(&admin, org1).await;
    let product = make_product(&app, org1).await;
    let user = a_user(&admin, org1).await;

    // Stock 5, mínimo 10 → LOW_STOCK.
    service::adjust(
        &app,
        org1,
        user,
        Adjust {
            product_id: product,
            store_id: store,
            new_quantity: Decimal::new(5, 0),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
    service::set_min(
        &app,
        org1,
        SetMin {
            product_id: product,
            store_id: store,
            min_stock: Decimal::new(10, 0),
        },
    )
    .await
    .unwrap();

    let active: Option<String> = sqlx::query_scalar(
        r#"SELECT "alertType"::text FROM "StockAlert" WHERE "productId" = $1 AND resolved = false"#,
    )
    .bind(product)
    .fetch_optional(&admin)
    .await
    .unwrap();
    assert_eq!(active.as_deref(), Some("LOW_STOCK"));

    // Reponer por encima del mínimo → alerta resuelta.
    service::adjust(
        &app,
        org1,
        user,
        Adjust {
            product_id: product,
            store_id: store,
            new_quantity: Decimal::new(100, 0),
            reason: "reposición".into(),
        },
    )
    .await
    .unwrap();
    let still_active: i64 = sqlx::query_scalar(
        r#"SELECT count(*) FROM "StockAlert" WHERE "productId" = $1 AND resolved = false"#,
    )
    .bind(product)
    .fetch_one(&admin)
    .await
    .unwrap();
    assert_eq!(still_active, 0, "la alerta se resuelve al reponer");

    cleanup(&admin, product).await;
}

#[tokio::test]
async fn fefo_consume_el_mas_proximo_a_caducar_primero_y_aplica_faltante() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let store = a_store(&admin, org1).await;
    let product = make_product(&app, org1).await;
    let today = OffsetDateTime::now_utc().date();
    let early = today.saturating_add(time::Duration::days(10));
    let late = today.saturating_add(time::Duration::days(120));

    // Recibe LATE primero (10) y luego EARLY (3): el orden de inserción NO importa.
    receive(
        &app,
        org1,
        product,
        store,
        "L-LATE",
        Some(late),
        Decimal::new(10, 0),
    )
    .await;
    receive(
        &app,
        org1,
        product,
        store,
        "L-EARLY",
        Some(early),
        Decimal::new(3, 0),
    )
    .await;

    // Vende 5 → FEFO: 3 de EARLY (agota) + 2 de LATE.
    let resulting = with_tenant_tx(&app, org1, async move |tx, _after| {
        service::apply_fefo_outflow(
            tx,
            org1,
            product,
            store,
            MovementType::Sale,
            Decimal::new(5, 0),
            None,
            None,
        )
        .await
    })
    .await
    .unwrap();
    assert_eq!(resulting, Decimal::new(8, 0));
    assert_eq!(batch_qty(&admin, product, "L-EARLY").await, Decimal::ZERO);
    assert_eq!(
        batch_qty(&admin, product, "L-LATE").await,
        Decimal::new(8, 0)
    );

    // Vende 20 más → 8 de LATE + 12 de faltante (sin lote): stock agregado -12.
    let resulting2 = with_tenant_tx(&app, org1, async move |tx, _after| {
        service::apply_fefo_outflow(
            tx,
            org1,
            product,
            store,
            MovementType::Sale,
            Decimal::new(20, 0),
            None,
            None,
        )
        .await
    })
    .await
    .unwrap();
    assert_eq!(resulting2, Decimal::new(-12, 0));

    cleanup(&admin, product).await;
}

#[tokio::test]
async fn expiring_devuelve_caducados_y_proximos_excluye_lejanos_y_sin_fecha() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let store = a_store(&admin, org1).await;
    let product = make_product(&app, org1).await;
    let today = OffsetDateTime::now_utc().date();
    let past = today.saturating_add(time::Duration::days(-10));
    let soon = today.saturating_add(time::Duration::days(5));
    let far = today.saturating_add(time::Duration::days(120));

    receive(
        &app,
        org1,
        product,
        store,
        "EXP-PAST",
        Some(past),
        Decimal::new(2, 0),
    )
    .await;
    receive(
        &app,
        org1,
        product,
        store,
        "EXP-SOON",
        Some(soon),
        Decimal::new(2, 0),
    )
    .await;
    receive(
        &app,
        org1,
        product,
        store,
        "EXP-FAR",
        Some(far),
        Decimal::new(2, 0),
    )
    .await;
    receive(
        &app,
        org1,
        product,
        store,
        "EXP-NODATE",
        None,
        Decimal::new(2, 0),
    )
    .await;

    let rows = service::expiring_batches(&app, org1, Some(store), Some(30))
        .await
        .unwrap();
    let lots: Vec<&str> = rows
        .iter()
        .filter(|b| b.product_id == product)
        .map(|b| b.lot_code.as_str())
        .collect();
    assert!(lots.contains(&"EXP-PAST"), "incluye caducado");
    assert!(lots.contains(&"EXP-SOON"), "incluye próximo");
    assert!(!lots.contains(&"EXP-FAR"), "excluye lejano");
    assert!(!lots.contains(&"EXP-NODATE"), "excluye sin fecha");
    // Orden por caducidad ascendente: el caducado va antes que el próximo.
    let past_idx = rows.iter().position(|b| b.lot_code == "EXP-PAST").unwrap();
    let soon_idx = rows.iter().position(|b| b.lot_code == "EXP-SOON").unwrap();
    assert!(past_idx < soon_idx);

    cleanup(&admin, product).await;
}
