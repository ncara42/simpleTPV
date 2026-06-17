//! Integración de clientes B2B (#154, IT-17) contra Postgres con RLS: CRUD,
//! tarifa anidada, validación de tarifa del tenant y desasignación (null).

use std::time::Duration;

use simpletpv_domain::customers::{service, CreateCustomer, UpdateCustomer};
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
    price_list: Uuid,
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Customer" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(&admin)
        .await
        .unwrap();
    // Tarifa de prueba (única por (org, name)).
    let price_list = Uuid::new_v4();
    let name = format!("Tarifa {}", &price_list.simple().to_string()[..8]);
    sqlx::query(r#"INSERT INTO "PriceList" (id, "organizationId", name) VALUES ($1, $2, $3)"#)
        .bind(price_list)
        .bind(org)
        .bind(&name)
        .execute(&admin)
        .await
        .unwrap();
    Ctx {
        admin,
        app,
        org,
        price_list,
    }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "Customer" WHERE "organizationId" = $1"#)
        .bind(c.org)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "PriceList" WHERE id = $1"#)
        .bind(c.price_list)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn new_customer(name: &str, price_list: Option<Uuid>) -> CreateCustomer {
    CreateCustomer {
        name: name.into(),
        nif: None,
        email: Some("b2b@cliente.test".into()),
        phone: None,
        address: None,
        price_list_id: price_list,
        active: None,
    }
}

#[tokio::test]
async fn crud_clientes_y_tarifa_anidada() {
    let c = setup().await;

    // Alta con tarifa: la respuesta trae priceList anidada {id, name}.
    let created = service::create(&c.app, c.org, new_customer("Bar Pepe", Some(c.price_list)))
        .await
        .unwrap();
    assert_eq!(created.price_list_id, Some(c.price_list));
    assert_eq!(
        created.price_list.as_ref().map(|p| p.id),
        Some(c.price_list)
    );
    assert!(created.active); // default true
    assert_eq!(created.email.as_deref(), Some("b2b@cliente.test"));

    // Listado.
    let all = service::list(&c.app, c.org).await.unwrap();
    assert_eq!(all.len(), 1);
    assert!(all[0].price_list.is_some());

    // Tarifa inexistente al crear → BadRequest (FK del tenant, requireOwned=400).
    assert_eq!(
        service::create(&c.app, c.org, new_customer("Malo", Some(Uuid::new_v4())))
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    // PATCH: desasigna la tarifa (priceListId = null) y cambia el nombre.
    let updated = service::update(
        &c.app,
        c.org,
        created.id,
        UpdateCustomer {
            name: Some("Bar Pepe SL".into()),
            nif: None,
            email: None,
            phone: None,
            address: None,
            price_list_id: Some(None),
            active: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.name, "Bar Pepe SL");
    assert_eq!(updated.price_list_id, None);
    assert!(updated.price_list.is_none());
    assert_eq!(updated.email.as_deref(), Some("b2b@cliente.test")); // conservado

    // PATCH de cliente inexistente → NotFound.
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            Uuid::new_v4(),
            UpdateCustomer {
                name: Some("X".into()),
                nif: None,
                email: None,
                phone: None,
                address: None,
                price_list_id: None,
                active: None,
            },
        )
        .await
        .err(),
        Some(AppError::NotFound)
    );

    // Borrado idempotente (no falla aunque ya no exista).
    service::remove(&c.app, c.org, created.id).await.unwrap();
    service::remove(&c.app, c.org, created.id).await.unwrap();
    assert!(service::list(&c.app, c.org).await.unwrap().is_empty());

    teardown(&c).await;
}
