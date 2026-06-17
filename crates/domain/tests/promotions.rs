//! Integración de promociones (#154) contra Postgres con RLS: CRUD, enums de
//! condición/descuento, fechas y validación.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::promotions::model::{PromoConditionType, PromoDiscountType};
use simpletpv_domain::promotions::{service, CreatePromotion, UpdatePromotion};
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
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Promotion" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(&admin)
        .await
        .unwrap();
    Ctx { admin, app, org }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "Promotion" WHERE "organizationId" = $1"#)
        .bind(c.org)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn dec(s: &str) -> Decimal {
    s.parse().unwrap()
}

#[tokio::test]
async fn crud_promociones_enums_y_validacion() {
    let c = setup().await;

    // Alta: 3x2 (min_qty=3) con 10% de descuento.
    let created = service::create(
        &c.app,
        c.org,
        CreatePromotion {
            name: "Rebajas".into(),
            condition_type: PromoConditionType::MinQty,
            threshold: 3,
            discount_type: PromoDiscountType::Percent,
            discount_value: dec("10"),
            start_date: "2026-06-01".into(),
            end_date: "2026-06-30".into(),
            active: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(created.condition_type, PromoConditionType::MinQty);
    assert_eq!(created.discount_type, PromoDiscountType::Percent);
    assert_eq!(created.threshold, 3);
    assert!(created.active); // default true
    assert_eq!(created.start_date, "2026-06-01");
    assert_eq!(created.end_date, "2026-06-30");

    // find_one / find_all.
    let one = service::find_one(&c.app, c.org, created.id).await.unwrap();
    assert_eq!(one.id, created.id);
    let all = service::find_all(&c.app, c.org).await.unwrap();
    assert_eq!(all.len(), 1);

    // PATCH parcial: cambia tipo de descuento a importe y desactiva; lo demás queda.
    let updated = service::update(
        &c.app,
        c.org,
        created.id,
        UpdatePromotion {
            name: None,
            condition_type: None,
            threshold: None,
            discount_type: Some(PromoDiscountType::Amount),
            discount_value: Some(dec("5.50")),
            start_date: None,
            end_date: None,
            active: Some(false),
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.discount_type, PromoDiscountType::Amount);
    assert_eq!(updated.discount_value, dec("5.50"));
    assert!(!updated.active);
    assert_eq!(updated.threshold, 3); // conservado
    assert_eq!(updated.name, "Rebajas"); // conservado

    // Validación: threshold fuera de rango → BadRequest.
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            CreatePromotion {
                name: "Mala".into(),
                condition_type: PromoConditionType::MinQty,
                threshold: 0,
                discount_type: PromoDiscountType::Percent,
                discount_value: dec("10"),
                start_date: "2026-06-01".into(),
                end_date: "2026-06-30".into(),
                active: None,
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Fecha con formato inválido → BadRequest.
    assert_eq!(
        service::create(
            &c.app,
            c.org,
            CreatePromotion {
                name: "Mala fecha".into(),
                condition_type: PromoConditionType::MinTicket,
                threshold: 50,
                discount_type: PromoDiscountType::Percent,
                discount_value: dec("10"),
                start_date: "01/06/2026".into(),
                end_date: "2026-06-30".into(),
                active: None,
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Borrado idempotente.
    service::remove(&c.app, c.org, created.id).await.unwrap();
    assert_eq!(
        service::remove(&c.app, c.org, created.id).await.err(),
        Some(AppError::NotFound)
    );

    teardown(&c).await;
}
