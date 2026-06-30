//! Integración del dashboard (#154) contra Postgres con RLS: sales_today
//! (comparativa por tienda + intradía) y sales_kpis (KPIs del periodo).

use std::time::Duration;

use simpletpv_domain::dashboard::period::{
    resolve_period, CompareMode, DashboardPeriod, DateRange,
};
use simpletpv_domain::dashboard::service;
use simpletpv_domain::sales::model::PaymentMethod;
use sqlx::postgres::{PgPool, PgPoolOptions};
use time::macros::datetime;
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
    sqlx::query(r#"DELETE FROM "StockAlert" WHERE "storeId" = $1"#)
        .bind(c.store)
        .execute(&c.admin)
        .await
        .unwrap();
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

/// Venta COMPLETED con descuento: `net` = subtotal neto (post-descuento) y total;
/// `discount` = `discountTotal`. La tarifa bruta es `net + discount`. Una línea
/// de 2 uds con `discountSource` por defecto (VOLUNTARY) → cuenta como descuento
/// voluntario del vendedor (no promoción).
async fn insert_discounted_sale(
    c: &Ctx,
    ticket: &str,
    net: &str,
    discount: &str,
    created: PrimitiveDateTime,
) {
    let sale_id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Sale"
             (id, "organizationId", "storeId", "userId", "ticketNumber", status, "paymentMethod",
              subtotal, total, "discountTotal", "createdAt")
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED'::"SaleStatus", 'CASH'::"PaymentMethod",
              $6::numeric, $6::numeric, $7::numeric, $8)"#,
    )
    .bind(sale_id)
    .bind(c.org)
    .bind(c.store)
    .bind(c.user)
    .bind(ticket)
    .bind(net)
    .bind(discount)
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
    .bind(net)
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
    assert!(row.yesterday.abs() < 1e-9, "la tienda no vendió ayer");
    assert!(
        row.delta_pct.is_none(),
        "deltaPct de la tienda null si ayer = 0"
    );
    // Sin ventas ayer → deltaPct agregado null y total de ayer 0.
    assert!(st.delta_pct.is_none(), "deltaPct agregado null si ayer = 0");
    assert!(
        st.yesterday.total.abs() < 1e-9,
        "agregado de ayer sin ventas"
    );
    // Intradía acumulado (compare=day): monótono no decreciente y su último valor =
    // total del día (40). Verifica la acumulación, no solo que exista sparkline.
    assert!(
        !st.intraday.is_empty(),
        "hay sparkline intradía en compare=day"
    );
    assert!(
        st.intraday.windows(2).all(|w| w[1] >= w[0] - 1e-9),
        "el intradía es acumulado (no decreciente): {:?}",
        st.intraday
    );
    assert!(
        (st.intraday.last().copied().unwrap() - 40.0).abs() < 1e-9,
        "el último acumulado del intradía = total del día (40): {:?}",
        st.intraday
    );

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
    // Sin alertas de rotura en la tienda nueva → estado cero COMPLETO (no solo events).
    assert_eq!(stockout.events, 0);
    assert_eq!(stockout.open, 0);
    assert_eq!(stockout.resolved, 0);
    assert!(stockout.avg_duration_hours.is_none());
    assert!(stockout.estimated_lost_sales.abs() < 1e-9);

    // Acotado a la tienda nueva, solo nuestro producto tiene ventas → encabeza el
    // ranking, con total = ΣlineTotal (40) y units = Σqty (4). Asevera valor+orden.
    let rankings = service::product_rankings(&c.app, c.org, range, Some(c.store), 10)
        .await
        .unwrap();
    let top = rankings
        .top_sales
        .first()
        .expect("hay al menos un producto en el ranking");
    assert_eq!(
        top.product_id, c.product,
        "nuestro producto encabeza el ranking"
    );
    assert!(
        (top.total - 40.0).abs() < 1e-9,
        "total del ranking = ΣlineTotal (40)"
    );
    assert!(
        (top.units - 4.0).abs() < 1e-9,
        "units del ranking = Σqty (4)"
    );

    let rotation = service::product_rotation(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    let rot = rotation
        .iter()
        .find(|r| r.product_id == c.product)
        .expect("nuestro producto aparece en rotación");
    assert!(
        (rot.units - 4.0).abs() < 1e-9,
        "rotación: units vendidas = 4"
    );
    assert_eq!(rot.days_since_last_sale, Some(0), "última venta = hoy");

    // El producto no tiene familia → grupo "Sin arquetipo" (family_id = None). Acotado
    // a la tienda nueva, sus units vendidas = 4. (product_count NO se filtra por venta
    // —cuenta todos los productos sin familia de la org— así que no se asevera aquí.)
    let arch = service::archetype_rotation(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    let sin_arq = arch
        .iter()
        .find(|a| a.family_id.is_none())
        .expect("existe el grupo Sin arquetipo");
    assert!(
        (sin_arq.units - 4.0).abs() < 1e-9,
        "Sin arquetipo: units vendidas = 4"
    );
    assert!(
        sin_arq.product_count >= 1,
        "incluye al menos nuestro producto"
    );

    teardown(&c).await;
}

/// Con descuento REAL (los fixtures base van a 0): asegura que `discount_rate`
/// (escalar y serie) y `discount_by_employee` calculan el porcentaje correcto, no
/// solo que devuelven algo. Cierra el hueco de #165 (KPIs de descuento sin aserción).
#[tokio::test]
async fn discount_rate_y_serie_con_descuento_real() {
    let c = setup().await;

    let pfx = &c.store.simple().to_string()[..8];
    let t1 = now_utc() - time::Duration::minutes(10);
    let t2 = now_utc() - time::Duration::minutes(5);
    // 2 ventas: subtotal neto 80 + descuento 20 ⇒ tarifa bruta 100, 20% de dto.
    insert_discounted_sale(&c, &format!("D{pfx}-1"), "80.00", "20.00", t1).await;
    insert_discounted_sale(&c, &format!("D{pfx}-2"), "80.00", "20.00", t2).await;

    let range = resolve_period(DashboardPeriod::Today, now_utc(), None, None).unwrap();
    let k = service::sales_kpis(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();

    // discount_rate = discount / (subtotal + discount) = 40 / (160 + 40) = 0.20.
    assert!(
        (k.discount_rate - 0.20).abs() < 1e-9,
        "discount_rate esperado 0.20, fue {}",
        k.discount_rate
    );

    // Serie intradía: solo aparecen buckets con venta, cada uno al 20% (round3).
    assert!(
        !k.series.discount_rate.is_empty(),
        "la serie de descuento no debe estar vacía"
    );
    assert!(
        k.series
            .discount_rate
            .iter()
            .any(|&r| (r - 0.20).abs() < 1e-9),
        "algún bucket debe reflejar el 20%: {:?}",
        k.series.discount_rate
    );
    assert!(
        k.series
            .discount_rate
            .iter()
            .all(|&r| r == 0.0 || (r - 0.20).abs() < 1e-9),
        "cada bucket con venta debe ir al 20%: {:?}",
        k.series.discount_rate
    );

    // discount_by_employee: descuento voluntario 40 / tarifa 200 = 0.20 (sin promos).
    let disc = service::discount_by_employee(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    let me = disc
        .iter()
        .find(|d| d.user_id == c.user)
        .expect("el vendedor debe aparecer");
    assert!(
        (me.avg_discount_pct - 0.20).abs() < 1e-9,
        "avg_discount_pct esperado 0.20, fue {}",
        me.avg_discount_pct
    );

    teardown(&c).await;
}

/// Inserta una alerta StockAlert OUT_OF_STOCK para el producto/tienda del Ctx.
async fn insert_stockout_alert(
    c: &Ctx,
    resolved: bool,
    created: PrimitiveDateTime,
    resolved_at: Option<PrimitiveDateTime>,
) {
    sqlx::query(
        r#"INSERT INTO "StockAlert"
             (id, "organizationId", "productId", "storeId", "alertType", resolved, "resolvedAt", "createdAt")
           VALUES ($1, $2, $3, $4, 'OUT_OF_STOCK'::"AlertType", $5, $6, $7)"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(c.product)
    .bind(c.store)
    .bind(resolved)
    .bind(resolved_at)
    .bind(created)
    .execute(&c.admin)
    .await
    .unwrap();
}

/// stockout-kpis con alertas REALES (caso poblado, no solo estado cero): cuenta
/// eventos OUT_OF_STOCK del periodo, separa abiertas/resueltas, calcula la duración
/// media de las resueltas y las ventas perdidas estimadas (ΣsalePrice de las abiertas).
#[tokio::test]
async fn stockout_kpis_cuenta_abiertas_y_resueltas() {
    let c = setup().await;

    // Dos alertas de rotura HOY: una resuelta (duró 1h exacta) y una abierta.
    let resolved_created = now_utc() - time::Duration::hours(2);
    let resolved_at = now_utc() - time::Duration::hours(1);
    let open_created = now_utc() - time::Duration::minutes(30);
    insert_stockout_alert(&c, true, resolved_created, Some(resolved_at)).await;
    insert_stockout_alert(&c, false, open_created, None).await;

    let range = resolve_period(DashboardPeriod::Today, now_utc(), None, None).unwrap();
    let k = service::stockout_kpis(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    assert_eq!(k.events, 2, "dos eventos de rotura en el periodo");
    assert_eq!(k.resolved, 1, "una resuelta");
    assert_eq!(k.open, 1, "una abierta");
    let dur = k.avg_duration_hours.expect("hay duración de las resueltas");
    assert!((dur - 1.0).abs() < 1e-6, "duración media 1h, fue {dur}");
    // Ventas perdidas estimadas = salePrice del producto de la alerta abierta (10.00).
    assert!(
        (k.estimated_lost_sales - 10.0).abs() < 1e-9,
        "ventas perdidas = salePrice de la abierta (10), fue {}",
        k.estimated_lost_sales
    );

    teardown(&c).await;
}

/// sales_by_store (#224): desglose por tienda con facturación, nº de tickets, ticket medio y
/// margen real. Asevera los valores exactos (acotado a la tienda), que la tienda aparece en el
/// desglose multitienda (sin filtro) y que el orden es descendente por facturación — la base de
/// la comparación entre tiendas del agente.
#[tokio::test]
async fn sales_by_store_desglosa_facturacion_ticket_y_margen() {
    let c = setup().await;

    let pfx = &c.store.simple().to_string()[..8];
    let t1 = now_utc() - time::Duration::minutes(10);
    let t2 = now_utc() - time::Duration::minutes(5);
    insert_sale(&c, &format!("S{pfx}-1"), "10.00", t1).await;
    insert_sale(&c, &format!("S{pfx}-2"), "30.00", t2).await;

    let range = resolve_period(DashboardPeriod::Today, now_utc(), None, None).unwrap();

    // Acotado a la tienda nueva: una fila con los valores exactos.
    let scoped = service::sales_by_store(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();
    let row = scoped
        .iter()
        .find(|s| s.store_id == c.store)
        .expect("la tienda aparece en el desglose acotado");
    assert_eq!(row.sales_count, 2, "2 tickets");
    assert!((row.revenue - 40.0).abs() < 1e-9, "facturación = 10 + 30");
    assert!(
        (row.avg_ticket - 20.0).abs() < 1e-9,
        "ticket medio = 40 / 2"
    );
    // costPrice por defecto 0 → margen real = ΣlineTotal (40) y % margen = 1.0 (verifica la fórmula).
    assert!((row.margin - 40.0).abs() < 1e-9, "margen real = ΣlineTotal");
    assert!(
        (row.margin_pct - 1.0).abs() < 1e-9,
        "% margen = 1.0 con coste 0"
    );

    // Sin filtro de tienda: el desglose multitienda incluye la tienda (base de la comparación) y
    // va de mayor a menor facturación.
    let all = service::sales_by_store(&c.app, c.org, range, None)
        .await
        .unwrap();
    let mine = all
        .iter()
        .find(|s| s.store_id == c.store)
        .expect("la tienda aparece en el desglose multitienda");
    assert!((mine.revenue - 40.0).abs() < 1e-9);
    assert!(
        all.windows(2).all(|w| w[0].revenue >= w[1].revenue - 1e-9),
        "el desglose va de mayor a menor facturación"
    );

    teardown(&c).await;
}

/// sales_by_day: agrupa las ventas por día natural (base del acumulado del informe).
/// Inserta dos ventas en días distintos y comprueba que salen dos filas, ordenadas
/// ascendentemente por fecha ISO y con la facturación correcta por día.
#[tokio::test]
async fn sales_by_day_agrupa_por_dia_natural() {
    let c = setup().await;

    let pfx = &c.store.simple().to_string()[..8];
    // Venta de hoy (45) y de hace dos días (20), ancladas dentro del rango de consulta.
    let hoy = now_utc() - time::Duration::minutes(10);
    let hace_dos = now_utc() - time::Duration::days(2) - time::Duration::minutes(10);
    insert_sale(&c, &format!("D{pfx}-1"), "45.00", hoy).await;
    insert_sale(&c, &format!("D{pfx}-2"), "20.00", hace_dos).await;

    // Rango explícito [hace 3 días 00:00, mañana 00:00) — cubre ambas ventas sin
    // depender de bordes de semana/mes.
    let range = DateRange {
        from: PrimitiveDateTime::new(
            (now_utc() - time::Duration::days(3)).date(),
            time::Time::MIDNIGHT,
        ),
        to: PrimitiveDateTime::new(
            (now_utc() + time::Duration::days(1)).date(),
            time::Time::MIDNIGHT,
        ),
    };

    let by_day = service::sales_by_day(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();

    assert_eq!(by_day.len(), 2, "dos días con ventas: {by_day:?}");
    assert!(
        by_day.windows(2).all(|w| w[0].day <= w[1].day),
        "ordenado ascendente por día: {:?}",
        by_day.iter().map(|d| &d.day).collect::<Vec<_>>()
    );
    let total: f64 = by_day.iter().map(|d| d.revenue).sum();
    assert!((total - 65.0).abs() < 1e-9, "facturación total = 45 + 20");
    // El día de la venta de hoy factura 45 con un único ticket (fecha derivada del
    // propio timestamp para no fallar en la ventana tras medianoche UTC).
    let hoy_iso = hoy.date().to_string();
    let hoy_row = by_day
        .iter()
        .find(|d| d.day == hoy_iso)
        .expect("aparece el día de la venta reciente");
    assert!((hoy_row.revenue - 45.0).abs() < 1e-9, "ese día factura 45");
    assert_eq!(hoy_row.count, 1, "un ticket ese día");

    teardown(&c).await;
}

// ── sección 04 «Más exploraciones» ───────────────────────────────────────────

/// Venta COMPLETED mínima (sin línea) con método de pago e instante concretos. Suficiente para
/// las agregaciones de la sección 04 (que solo leen `Sale`).
async fn insert_sale_pm(
    c: &Ctx,
    ticket: &str,
    total: &str,
    method: &str,
    created: PrimitiveDateTime,
) {
    sqlx::query(
        r#"INSERT INTO "Sale"
             (id, "organizationId", "storeId", "userId", "ticketNumber", status, "paymentMethod",
              subtotal, total, "discountTotal", "createdAt")
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED'::"SaleStatus", $6::"PaymentMethod",
              $7::numeric, $7::numeric, 0, $8)"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(c.store)
    .bind(c.user)
    .bind(ticket)
    .bind(method)
    .bind(total)
    .bind(created)
    .execute(&c.admin)
    .await
    .unwrap();
}

/// `sales_by_payment` agrupa por método, suma importe y nº de tickets y ordena por importe desc.
#[tokio::test]
async fn sales_by_payment_agrupa_por_metodo() {
    let c = setup().await;
    let pfx = &c.store.simple().to_string()[..8];
    let t = now_utc() - time::Duration::minutes(10);
    insert_sale_pm(&c, &format!("P{pfx}-1"), "30.00", "CASH", t).await;
    insert_sale_pm(&c, &format!("P{pfx}-2"), "20.00", "CASH", t).await;
    insert_sale_pm(&c, &format!("P{pfx}-3"), "70.00", "CARD", t).await;

    let range = DateRange {
        from: PrimitiveDateTime::new(
            (now_utc() - time::Duration::days(1)).date(),
            time::Time::MIDNIGHT,
        ),
        to: PrimitiveDateTime::new(
            (now_utc() + time::Duration::days(1)).date(),
            time::Time::MIDNIGHT,
        ),
    };
    let by_pm = service::sales_by_payment(&c.app, c.org, range, Some(c.store))
        .await
        .unwrap();

    // CARD (70) primero por importe; CASH agrega los dos tickets (50, 2 tickets).
    assert_eq!(by_pm.len(), 2, "dos métodos con ventas: {by_pm:?}");
    assert!(matches!(by_pm[0].method, PaymentMethod::Card));
    assert!((by_pm[0].revenue - 70.0).abs() < 1e-9);
    assert_eq!(by_pm[0].count, 1);
    assert!(matches!(by_pm[1].method, PaymentMethod::Cash));
    assert!((by_pm[1].revenue - 50.0).abs() < 1e-9);
    assert_eq!(by_pm[1].count, 2);

    teardown(&c).await;
}

/// `recent_sales` devuelve las últimas N ventas (más reciente primero) con tienda y método.
#[tokio::test]
async fn recent_sales_ordena_y_acota() {
    let c = setup().await;
    let pfx = &c.store.simple().to_string()[..8];
    let t = now_utc();
    insert_sale_pm(
        &c,
        &format!("R{pfx}-old"),
        "10.00",
        "CASH",
        t - time::Duration::hours(3),
    )
    .await;
    insert_sale_pm(
        &c,
        &format!("R{pfx}-mid"),
        "20.00",
        "CARD",
        t - time::Duration::hours(2),
    )
    .await;
    insert_sale_pm(
        &c,
        &format!("R{pfx}-new"),
        "30.00",
        "BIZUM",
        t - time::Duration::hours(1),
    )
    .await;

    let recent = service::recent_sales(&c.app, c.org, 2, Some(c.store))
        .await
        .unwrap();

    assert_eq!(recent.len(), 2, "limit=2 acota a las dos más recientes");
    assert_eq!(recent[0].ticket_number, format!("R{pfx}-new"));
    assert!((recent[0].total - 30.0).abs() < 1e-9);
    assert!(matches!(recent[0].payment_method, PaymentMethod::Bizum));
    assert!(
        !recent[0].store_name.is_empty(),
        "incluye el nombre de tienda"
    );
    assert_eq!(recent[1].ticket_number, format!("R{pfx}-mid"));

    teardown(&c).await;
}

/// `sales_goal`: `current` = periodo en curso, `target` = periodo anterior completo, `projection`
/// = extrapolación por fracción transcurrida (a mitad de periodo, duplica lo facturado).
#[tokio::test]
async fn sales_goal_objetivo_y_proyeccion() {
    let c = setup().await;
    let pfx = &c.store.simple().to_string()[..8];
    let base = PrimitiveDateTime::new(
        (now_utc() - time::Duration::days(40)).date(),
        time::Time::MIDNIGHT,
    );
    let now = base + time::Duration::days(5); // mitad de un periodo de 10 días
    let current = DateRange {
        from: base,
        to: now,
    };
    let full_end = base + time::Duration::days(10);
    let prev_full = DateRange {
        from: base - time::Duration::days(10),
        to: base,
    };

    // En curso: 100 € dentro de [base, now). Anterior completo: 200 €.
    insert_sale_pm(
        &c,
        &format!("G{pfx}-1"),
        "60.00",
        "CASH",
        base + time::Duration::days(1),
    )
    .await;
    insert_sale_pm(
        &c,
        &format!("G{pfx}-2"),
        "40.00",
        "CASH",
        base + time::Duration::days(3),
    )
    .await;
    insert_sale_pm(
        &c,
        &format!("G{pfx}-3"),
        "200.00",
        "CASH",
        base - time::Duration::days(5),
    )
    .await;

    let goal = service::sales_goal(
        &c.app,
        c.org,
        current,
        prev_full,
        full_end,
        now,
        Some(c.store),
    )
    .await
    .unwrap();

    assert!((goal.current - 100.0).abs() < 1e-9, "en curso = 60 + 40");
    assert!(
        (goal.target - 200.0).abs() < 1e-9,
        "objetivo = periodo anterior completo"
    );
    // frac = 5/10 = 0,5 → proyección = 100 / 0,5 = 200.
    assert!(
        (goal.projection - 200.0).abs() < 1e-6,
        "proj={}",
        goal.projection
    );

    teardown(&c).await;
}

/// `cumulative_month`: acumulados crecientes del mes en curso (parcial) y del anterior (completo),
/// con proyección por la FORMA del mes anterior (150 × 200/80 = 375 a fin de mes).
#[tokio::test]
async fn cumulative_month_acumula_y_proyecta() {
    let c = setup().await;
    let pfx = &c.store.simple().to_string()[..8];
    let now = datetime!(2026-06-15 12:00);
    // Mes en curso (junio): 100 el día 5, 50 el día 10 → acumulado a día 15 = 150.
    insert_sale_pm(
        &c,
        &format!("M{pfx}-1"),
        "100.00",
        "CASH",
        datetime!(2026-06-05 9:00),
    )
    .await;
    insert_sale_pm(
        &c,
        &format!("M{pfx}-2"),
        "50.00",
        "CASH",
        datetime!(2026-06-10 9:00),
    )
    .await;
    // Mes anterior (mayo): 80 el día 10, 120 el día 20 → a día 15 lleva 80; total 200.
    insert_sale_pm(
        &c,
        &format!("M{pfx}-3"),
        "80.00",
        "CASH",
        datetime!(2026-05-10 9:00),
    )
    .await;
    insert_sale_pm(
        &c,
        &format!("M{pfx}-4"),
        "120.00",
        "CASH",
        datetime!(2026-05-20 9:00),
    )
    .await;

    let cm = service::cumulative_month(&c.app, c.org, now, Some(c.store))
        .await
        .unwrap();

    assert_eq!(cm.total_points, 30, "junio tiene 30 días");
    assert_eq!(cm.actual.len(), 15, "acumulado del 1 al 15");
    assert!((cm.actual.last().copied().unwrap() - 150.0).abs() < 1e-9);
    assert_eq!(cm.compare.len(), 31, "mayo completo (31 días)");
    assert!((cm.compare.last().copied().unwrap() - 200.0).abs() < 1e-9);
    // Forma del mes anterior: 150 × (200 / 80) = 375.
    assert!(
        (cm.projection_end - 375.0).abs() < 1e-6,
        "proj={}",
        cm.projection_end
    );

    teardown(&c).await;
}
