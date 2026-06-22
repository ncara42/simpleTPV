//! Integración de los totales/márgenes de `GET /sales` (#152): agregan SOLO las
//! ventas COMPLETED del filtro (las VOIDED se listan pero no suman) y la división
//! por cero (sin ventas) no rompe.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::sales::service::{self, SalesFilter};
use simpletpv_domain::sales::{CreateSale, CreateSaleLine, PaymentMethod};
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
    let code = format!("T{}", &store.simple().to_string()[..8]);
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
            name: format!("TOT-{}", Uuid::new_v4()),
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
            new_quantity: Decimal::from(100),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
    id
}

async fn sell(c: &Ctx, product: Uuid, qty: i64) -> Uuid {
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
    .sale
    .id
}

fn filter(store: Uuid) -> SalesFilter {
    SalesFilter {
        store_id: Some(store),
        page: 1,
        page_size: 50,
        ..Default::default()
    }
}

async fn teardown(c: &Ctx, product: Uuid) {
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
async fn totales_solo_cuentan_ventas_completed() {
    let c = setup().await;
    let product = make_product(&c).await;
    // Dos ventas: una se queda COMPLETED, otra se anula (VOIDED).
    let _keep = sell(&c, product, 2).await; // total 200, margen (100-60)*2=80
    let voided = sell(&c, product, 1).await;
    service::void(&c.app, c.org, voided, c.user).await.unwrap();

    let page = service::list(&c.app, c.org, c.user, true, filter(c.store))
        .await
        .unwrap();

    // items lista AMBAS (auditoría), pero totals solo la COMPLETED.
    assert_eq!(page.items.len(), 2, "ambas se listan");
    assert_eq!(page.totals.count, 1, "solo la COMPLETED suma");
    assert_eq!(page.totals.total_amount, Decimal::from(200));
    // Margen: 80 / 200 = 0.4.
    assert_eq!(page.totals.avg_margin_pct, Decimal::new(4, 1)); // 0.4

    teardown(&c, product).await;
}

#[tokio::test]
async fn totales_sin_ventas_no_dividen_por_cero() {
    let c = setup().await;
    let product = make_product(&c).await; // sin ventas
    let page = service::list(&c.app, c.org, c.user, true, filter(c.store))
        .await
        .unwrap();
    assert_eq!(page.totals.count, 0);
    assert_eq!(page.totals.total_amount, Decimal::ZERO);
    assert_eq!(page.totals.avg_discount_pct, Decimal::ZERO);
    assert_eq!(page.totals.avg_margin_pct, Decimal::ZERO);
    teardown(&c, product).await;
}

async fn make_family(c: &Ctx, name: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "ProductFamily" (id, "organizationId", name, "updatedAt")
           VALUES ($1, $2, $3, now())"#,
    )
    .bind(id)
    .bind(c.org)
    .bind(name)
    .execute(&c.admin)
    .await
    .unwrap();
    id
}

async fn make_product_named(c: &Ctx, name: String, family: Option<Uuid>) -> Uuid {
    let id = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name,
            sale_price: Decimal::from(100),
            description: None,
            barcode: None,
            sku: None,
            cost_price: Some(Decimal::from(60)),
            tax_rate: Some(Decimal::from(21)),
            sale_unit: None,
            unit_symbol: None,
            family_id: family,
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

/// Vende `qty` uds de `product` y devuelve (id de venta, total).
async fn sell_qty(c: &Ctx, product: Uuid, qty: i64) -> (Uuid, Decimal) {
    let s = service::create(
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
    .sale;
    (s.id, s.total)
}

async fn cleanup_qfam(c: &Ctx, products: &[Uuid], family: Uuid) {
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
    sqlx::query(r#"DELETE FROM "ProductFamily" WHERE id = $1"#)
        .bind(family)
        .execute(&c.admin)
        .await
        .unwrap();
}

/// `GET /sales` aplica los filtros `q` (búsqueda libre) y `familyId` — paridad con
/// `buildSalesFilter` de NestJS. Antes el `ListQuery` de Rust los descartaba en
/// silencio y devolvía TODAS las ventas del tenant (regresión HIGH de la auditoría
/// de paridad). El filtro afecta tanto al listado como a los totales agregados.
#[tokio::test]
async fn filtro_q_y_family_id_acotan_listado_y_totales() {
    let c = setup().await;

    // Producto A sin familia, producto B en la familia F. Nombres únicos → la barra
    // de búsqueda casa por nombre de línea (SaleLine.name = nombre del producto).
    let family = make_family(&c, &format!("Fam-{}", Uuid::new_v4())).await;
    let name_a = format!("AAA-{}", Uuid::new_v4());
    let prod_a = make_product_named(&c, name_a.clone(), None).await;
    let prod_b = make_product_named(&c, format!("BBB-{}", Uuid::new_v4()), Some(family)).await;
    // A: 1 ud (total 100); B: 2 uds (total 200) → totales distintos para el `q` numérico.
    let (sale_a, _) = sell_qty(&c, prod_a, 1).await;
    let (sale_b, total_b) = sell_qty(&c, prod_b, 2).await;

    // q por nombre de línea de A → solo la venta A, en listado y en totales.
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            q: Some(name_a.clone()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(page.total_items, 1, "q por nombre casa solo la venta A");
    assert_eq!(page.items[0].sale.id, sale_a);
    assert_eq!(page.totals.count, 1, "los totales también se acotan por q");

    // q que no casa nada → 0 items y totales a cero.
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            q: Some("ZZZ-no-existe".into()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(page.total_items, 0);
    assert_eq!(page.totals.count, 0);
    assert_eq!(page.totals.total_amount, Decimal::ZERO);

    // q numérico = total de B (200) → casa B por total exacto, no A (100).
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            q: Some(total_b.to_string()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert!(
        page.items.iter().any(|s| s.sale.id == sale_b),
        "q numérico casa el total de B"
    );
    assert!(
        !page.items.iter().any(|s| s.sale.id == sale_a),
        "no casa A (total distinto)"
    );

    // familyId = F → solo la venta B (su línea es de un producto de F).
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            family_id: Some(family),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(
        page.total_items, 1,
        "familyId acota a la venta del producto en F"
    );
    assert_eq!(page.items[0].sale.id, sale_b);

    // familyId desconocida → 0.
    let page = service::list(
        &c.app,
        c.org,
        c.user,
        true,
        SalesFilter {
            family_id: Some(Uuid::new_v4()),
            ..filter(c.store)
        },
    )
    .await
    .unwrap();
    assert_eq!(page.total_items, 0);

    cleanup_qfam(&c, &[prod_a, prod_b], family).await;
}
