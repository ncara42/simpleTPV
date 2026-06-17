//! Integración del dashboard (#154) contra Postgres con RLS: sales_today
//! (comparativa por tienda + intradía) y sales_kpis (KPIs del periodo).

use std::time::Duration;

use simpletpv_domain::dashboard::period::{resolve_period, CompareMode, DashboardPeriod};
use simpletpv_domain::dashboard::service;
use sqlx::postgres::{PgPool, PgPoolOptions};
use time::{OffsetDateTime, PrimitiveDateTime};
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
    product: Uuid,
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
    let code = format!("D{}", &store.simple().to_string()[..7]);
    sqlx::query(r#"INSERT INTO "Store" (id, "organizationId", name, code, active) VALUES ($1, $2, $3, $4, true)"#)
        .bind(store)
        .bind(org)
        .bind(format!("DashStore {code}"))
        .bind(&code)
        .execute(&admin)
        .await
        .unwrap();
    let product = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Product" (id, "organizationId", sku, name, "salePrice", "updatedAt")
           VALUES ($1, $2, $3, 'Prod Dash', 10.00, now())"#,
    )
    .bind(product)
    .bind(org)
    .bind(format!("DP{}", &product.simple().to_string()[..7]))
    .execute(&admin)
    .await
    .unwrap();
    Ctx {
        admin,
        app,
        org,
        store,
        user,
        product,
    }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "Sale" WHERE "storeId" = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(c.product)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Store" WHERE id = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
}

/// Venta COMPLETED con una línea (2 uds), creada en `created` (timestamp UTC).
async fn insert_sale(c: &Ctx, ticket: &str, total: &str, created: PrimitiveDateTime) {
    let sale_id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Sale"
             (id, "organizationId", "storeId", "userId", "ticketNumber", status, "paymentMethod",
              subtotal, total, "discountTotal", "createdAt")
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED'::"SaleStatus", 'CASH'::"PaymentMethod",
              $6::numeric, $6::numeric, 0, $7)"#,
    )
    .bind(sale_id)
    .bind(c.org)
    .bind(c.store)
    .bind(c.user)
    .bind(ticket)
    .bind(total)
    .bind(created)
    .execute(&c.admin)
    .await
    .unwrap();
    sqlx::query(
        r#"INSERT INTO "SaleLine"
             (id, "organizationId", "saleId", "productId", name, "unitPrice", qty, "taxRate", "lineTotal")
           VALUES ($1, $2, $3, $4, 'L', $5::numeric, 2, 21, $5::numeric)"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(sale_id)
    .bind(c.product)
    .bind(total)
    .execute(&c.admin)
    .await
    .unwrap();
}

fn now_utc() -> PrimitiveDateTime {
    let n = OffsetDateTime::now_utc();
    PrimitiveDateTime::new(n.date(), n.time())
}

#[tokio::test]
async fn sales_today_y_sales_kpis_del_dia() {
    let c = setup().await;

    // Dos ventas de HOY (10 + 30), ancladas unos minutos ANTES de ahora para que
    // sean < now y caigan en el día en curso (salvo en los primeros minutos tras
    // medianoche UTC, ventana despreciable en dev/CI).
    // ticketNumber es único por org → lo derivamos del UUID de la tienda (único por run).
    let pfx = &c.store.simple().to_string()[..8];
    let t1 = now_utc() - time::Duration::minutes(10);
    let t2 = now_utc() - time::Duration::minutes(5);
    insert_sale(&c, &format!("T{pfx}-1"), "10.00", t1).await;
    insert_sale(&c, &format!("T{pfx}-2"), "30.00", t2).await;

    // sales_today (compare=day): total de hoy = 40, 2 tickets; la tienda aparece.
    let st = service::sales_today(&c.app, c.org, Some(c.store), CompareMode::Day)
        .await
        .unwrap();
    assert_eq!(st.today.count, 2);
    assert!((st.today.total - 40.0).abs() < 1e-9);
    let row = st.by_store.iter().find(|s| s.store_id == c.store).unwrap();
    assert!((row.today - 40.0).abs() < 1e-9);
    assert!(!st.intraday.is_empty()); // hay sparkline intradía en compare=day

    // sales_kpis del periodo "today": revenue 40, 2 ventas, avgTicket 20, UPT 2.
    let range = resolve_period(DashboardPeriod::Today, now_utc(), None, None).unwrap();
    let k = service::sales_kpis(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert_eq!(k.sales_count, 2);
    assert!((k.revenue - 40.0).abs() < 1e-9);
    assert!((k.avg_ticket - 20.0).abs() < 1e-9);
    assert!((k.upt - 2.0).abs() < 1e-9); // 4 uds / 2 ventas
    assert!(k.return_rate.abs() < 1e-9); // sin devoluciones

    // El resto de endpoints del dashboard responden coherentemente con las 2 ventas.
    let by_hour = service::sales_by_hour(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert_eq!(by_hour.iter().map(|h| h.count).sum::<i64>(), 2);
    assert!((by_hour.iter().map(|h| h.revenue).sum::<f64>() - 40.0).abs() < 1e-9);

    let by_emp = service::sales_by_employee(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    let me = by_emp.iter().find(|e| e.user_id == c.user).unwrap();
    assert_eq!(me.sales_count, 2);
    assert!((me.total - 40.0).abs() < 1e-9);

    let by_fam = service::sales_by_family(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    // El producto no tiene familia → fila "Sin familia" con el total.
    assert!(by_fam.iter().any(|fmly| (fmly.total - 40.0).abs() < 1e-9));

    let margin = service::margin_kpis(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert!((margin.revenue - 40.0).abs() < 1e-9); // lineTotal de las 2 líneas
                                                   // costPrice por defecto 0 → real_margin = revenue y margin_pct = 1.0 (verifica
                                                   // las fórmulas, no solo que devuelve algo ≥ 0).
    assert!((margin.real_margin - 40.0).abs() < 1e-9);
    assert!((margin.margin_pct - 1.0).abs() < 1e-9);

    let disc = service::discount_by_employee(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert!(disc.iter().any(|d| d.user_id == c.user)); // sin descuento → 0%

    let stockout = service::stockout_kpis(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert_eq!(stockout.events, 0); // sin alertas de rotura en el periodo

    let rankings = service::product_rankings(&c.app, c.org, range, Some(c.store), 10)
        .await
        .unwrap();
    assert!(rankings.top_sales.iter().any(|r| r.product_id == c.product));

    let rotation = service::product_rotation(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert!(rotation.iter().any(|r| r.product_id == c.product));

    // No falla y devuelve filas (incluye el grupo "Sin arquetipo" del producto sin familia).
    let arch = service::archetype_rotation(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert!(!arch.is_empty());

    teardown(&c).await;
}
