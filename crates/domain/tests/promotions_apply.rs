//! Integración del COBRO con promociones automáticas (#275 S-22) contra Postgres
//! con RLS. Verifica que `sales::service::create` engancha el matching:
//!  - una promo de PRODUCTO aplica el descuento y marca `discountSource=PROMOTION`;
//!  - el límite de rol NO bloquea por la promo automática (un CLERK con una promo
//!    del 50% en producto cobra sin Forbidden);
//!  - sin promos vigentes la venta es idéntica a hoy (no regresión, source VOLUNTARY).
//!
//! El test es AUTOCONTENIDO: crea su propia org/usuarios/tienda/productos/caja y
//! promos, así que corre contra cualquier DB con el esquema + roles `app`/`app_admin`
//! (incluida una DB efímera). Limpia todo en teardown.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_auth::Role;
use simpletpv_domain::products::{self, NewProduct};
use simpletpv_domain::promotions::model::{
    PromoAppliesTo, PromoConditionType, PromoDiscountType,
};
use simpletpv_domain::promotions::{service as promo_svc, CreatePromotion};
use simpletpv_domain::sales::model::DiscountSource;
use simpletpv_domain::sales::{service, CreateSale, CreateSaleLine, PaymentMethod};
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
    admin_user: Uuid,
    clerk_user: Uuid,
}

/// Hoy en `YYYY-MM-DD` (vigencia abierta para que las promos casen siempre).
fn today() -> String {
    time::OffsetDateTime::now_utc().date().to_string()
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;

    // Org dedicada (NIF único) → aislamiento total respecto a otros tests/seed.
    let org = Uuid::new_v4();
    let nif = format!("S22-{}", &org.simple().to_string()[..8]);
    sqlx::query(r#"INSERT INTO "Organization" (id, name, nif) VALUES ($1, $2, $3)"#)
        .bind(org)
        .bind("Org S-22")
        .bind(&nif)
        .execute(&admin)
        .await
        .unwrap();

    let admin_user = Uuid::new_v4();
    let clerk_user = Uuid::new_v4();
    for (id, email, role) in [
        (admin_user, format!("admin-{org}@s22.test"), "ADMIN"),
        (clerk_user, format!("clerk-{org}@s22.test"), "CLERK"),
    ] {
        sqlx::query(
            r#"INSERT INTO "User" (id, "organizationId", email, name, "passwordHash", role)
               VALUES ($1, $2, $3, $4, 'x', $5::"UserRole")"#,
        )
        .bind(id)
        .bind(org)
        .bind(&email)
        .bind("U")
        .bind(role)
        .execute(&admin)
        .await
        .unwrap();
    }

    let store = Uuid::new_v4();
    let code = format!("S{}", &store.simple().to_string()[..8]);
    sqlx::query(r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#)
        .bind(store)
        .bind(org)
        .bind("Tienda S-22")
        .bind(&code)
        .execute(&admin)
        .await
        .unwrap();

    // El CLERK necesita acceso a la tienda (SEC-01) para llegar al cálculo.
    sqlx::query(r#"INSERT INTO "UserStore" ("userId", "storeId") VALUES ($1, $2)"#)
        .bind(clerk_user)
        .bind(store)
        .execute(&admin)
        .await
        .unwrap();

    // Caja abierta (obligatoria para cobrar).
    sqlx::query(
        r#"INSERT INTO "CashSession" (id, "organizationId", "storeId", "userId", "openingAmount", status)
           VALUES ($1, $2, $3, $4, 0, 'OPEN'::"CashSessionStatus")"#,
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .bind(store)
    .bind(admin_user)
    .execute(&admin)
    .await
    .unwrap();

    Ctx {
        admin,
        app,
        org,
        store,
        admin_user,
        clerk_user,
    }
}

async fn make_product(c: &Ctx, price: Decimal) -> Uuid {
    let id = products::service::create(
        &c.app,
        c.org,
        NewProduct {
            name: format!("S22-{}", Uuid::new_v4()),
            sale_price: price,
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
    .unwrap()
    .id;
    // Stock suficiente para vender.
    stock::adjust(
        &c.app,
        c.org,
        c.admin_user,
        Adjust {
            product_id: id,
            store_id: c.store,
            new_quantity: Decimal::from(1000),
            reason: "init".into(),
        },
    )
    .await
    .unwrap();
    id
}

fn product_promo(name: &str, product: Uuid, pct: &str) -> CreatePromotion {
    CreatePromotion {
        name: name.into(),
        condition_type: PromoConditionType::MinTicket,
        threshold: 1,
        discount_type: PromoDiscountType::Percent,
        discount_value: pct.parse().unwrap(),
        start_date: today(),
        end_date: "2099-12-31".into(),
        active: Some(true),
        applies_to: PromoAppliesTo::Product,
        amount_scope: simpletpv_domain::promotions::model::PromoAmountScope::Line,
        start_time: None,
        end_time: None,
        weekdays: vec![],
        stackable: None,
        clerk_can_skip: None,
        buy_qty: None,
        pay_qty: None,
        priority: None,
        product_ids: vec![product],
        family_ids: vec![],
        store_ids: vec![],
    }
}

async fn teardown(c: &Ctx) {
    // Orden FK: líneas → ventas → caja → scopes/promos → stock → productos →
    // userstore → tienda → usuarios → org.
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "StockBatch" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "VerifactuRecord" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "SaleLine" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "Sale" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "CashSession" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "PromotionProduct" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "PromotionFamily" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "PromotionStore" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "Promotion" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "Product" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "UserStore" WHERE "storeId" = $2"#,
        r#"DELETE FROM "Store" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "User" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "Organization" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(c.org)
            .bind(c.store)
            .execute(&c.admin)
            .await
            .unwrap();
    }
}

fn line(product: Uuid, qty: i64) -> CreateSaleLine {
    CreateSaleLine {
        product_id: product,
        qty: Decimal::from(qty),
        discount_pct: None,
        discount_amt: None,
    }
}

fn sale_body(c: &Ctx, lines: Vec<CreateSaleLine>) -> CreateSale {
    CreateSale {
        store_id: c.store,
        client_id: None,
        ticket_number: None,
        lines,
        payment_method: PaymentMethod::Card,
        cash_given: None,
        ticket_discount_pct: None,
        ticket_discount_amt: None,
        customer_tax_id: None,
        customer_name: None,
        skipped_promotions: vec![],
    }
}

#[tokio::test]
async fn promo_de_producto_aplica_descuento_y_marca_source_promotion() {
    let c = setup().await;
    let product = make_product(&c, Decimal::from(100)).await; // 100.00 / ud

    // Promo 20% en el producto.
    promo_svc::create(&c.app, c.org, product_promo("20% prod", product, "20"))
        .await
        .unwrap();

    // Vende 1 ud: bruto 100 → 20% promo → línea 80.00, source PROMOTION.
    let sale = service::create(&c.app, c.org, c.admin_user, Role::Admin, sale_body(&c, vec![line(product, 1)]))
        .await
        .unwrap();

    assert_eq!(sale.lines.len(), 1);
    assert_eq!(sale.lines[0].discount_amt, Decimal::new(2000, 2)); // 20.00
    assert_eq!(sale.lines[0].line_total, Decimal::new(8000, 2)); // 80.00
    assert_eq!(
        sale.lines[0].discount_source,
        DiscountSource::Promotion,
        "la línea con promo automática marca PROMOTION"
    );
    assert_eq!(sale.sale.total, Decimal::new(8000, 2));
    teardown(&c).await;
}

#[tokio::test]
async fn la_promo_automatica_no_dispara_el_limite_del_rol_clerk() {
    let c = setup().await;
    let product = make_product(&c, Decimal::from(100)).await;

    // Promo del 50% en producto: muy por encima del límite CLERK (10%).
    promo_svc::create(&c.app, c.org, product_promo("50% prod", product, "50"))
        .await
        .unwrap();

    // El CLERK cobra sin descuento manual; la promo del 50% NO debe bloquear.
    let sale = service::create(&c.app, c.org, c.clerk_user, Role::Clerk, sale_body(&c, vec![line(product, 1)]))
        .await
        .expect("la promo automática no cuenta contra el límite del rol");
    assert_eq!(sale.lines[0].discount_source, DiscountSource::Promotion);
    assert_eq!(sale.lines[0].line_total, Decimal::new(5000, 2)); // 50.00
    teardown(&c).await;
}

#[tokio::test]
async fn descuento_manual_del_clerk_sigue_limitado_aunque_haya_promos() {
    let c = setup().await;
    let product = make_product(&c, Decimal::from(100)).await;
    // SIN promos sobre este producto: el CLERK con 50% manual debe seguir bloqueado.
    let mut body = sale_body(&c, vec![CreateSaleLine {
        product_id: product,
        qty: Decimal::ONE,
        discount_pct: Some(Decimal::from(50)), // 50% manual > límite CLERK 10%
        discount_amt: None,
    }]);
    body.payment_method = PaymentMethod::Card;
    let res = service::create(&c.app, c.org, c.clerk_user, Role::Clerk, body).await;
    assert_eq!(
        res.err(),
        Some(simpletpv_shared::AppError::Forbidden),
        "el descuento MANUAL del vendedor sí sigue topado por el rol"
    );
    teardown(&c).await;
}

#[tokio::test]
async fn sin_promos_la_venta_es_identica_y_source_voluntary() {
    let c = setup().await;
    let product = make_product(&c, Decimal::from(10)).await; // 10.00

    // No hay promos vigentes para este producto.
    let sale = service::create(&c.app, c.org, c.admin_user, Role::Admin, sale_body(&c, vec![line(product, 2)]))
        .await
        .unwrap();
    assert_eq!(sale.lines[0].discount_amt, Decimal::new(0, 2)); // sin descuento
    assert_eq!(sale.lines[0].line_total, Decimal::new(2000, 2)); // 20.00
    assert_eq!(
        sale.lines[0].discount_source,
        DiscountSource::Voluntary,
        "sin promo, el origen es VOLUNTARY (no regresión)"
    );
    assert_eq!(sale.sale.total, Decimal::new(2000, 2));
    teardown(&c).await;
}

#[tokio::test]
async fn promo_skipped_por_el_cajero_se_ignora_en_el_cobro() {
    let c = setup().await;
    let product = make_product(&c, Decimal::from(100)).await;
    let promo = promo_svc::create(&c.app, c.org, product_promo("20% prod", product, "20"))
        .await
        .unwrap();

    // El cajero quita la promo (skipped) → la venta no aplica el descuento.
    let mut body = sale_body(&c, vec![line(product, 1)]);
    body.skipped_promotions = vec![promo.id];
    let sale = service::create(&c.app, c.org, c.admin_user, Role::Admin, body)
        .await
        .unwrap();
    assert_eq!(sale.lines[0].line_total, Decimal::new(10000, 2)); // 100.00 sin descuento
    assert_eq!(sale.lines[0].discount_source, DiscountSource::Voluntary);
    teardown(&c).await;
}

#[tokio::test]
async fn gana_la_mejor_promo_vs_descuento_manual() {
    let c = setup().await;
    let product = make_product(&c, Decimal::from(100)).await;
    // Promo 30% en producto.
    promo_svc::create(&c.app, c.org, product_promo("30% prod", product, "30"))
        .await
        .unwrap();
    // El ADMIN (sin límite) mete 10% manual: la promo (30) gana → source PROMOTION.
    let mut body = sale_body(&c, vec![CreateSaleLine {
        product_id: product,
        qty: Decimal::ONE,
        discount_pct: Some(Decimal::from(10)),
        discount_amt: None,
    }]);
    body.payment_method = PaymentMethod::Card;
    let sale = service::create(&c.app, c.org, c.admin_user, Role::Admin, body)
        .await
        .unwrap();
    assert_eq!(sale.lines[0].line_total, Decimal::new(7000, 2)); // 70.00 (30% gana)
    assert_eq!(sale.lines[0].discount_source, DiscountSource::Promotion);
    teardown(&c).await;
}
