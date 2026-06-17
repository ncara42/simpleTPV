//! Integración de familias de producto (#154) contra Postgres con RLS: árbol
//! jerárquico, invariante de arquetipo (solo productos) y prevención de ciclos.

use std::time::Duration;

use simpletpv_domain::product_families::{service, CreateFamily, UpdateFamily};
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
    // Limpia familias residuales de corridas previas para un árbol determinista.
    sqlx::query(r#"DELETE FROM "ProductFamily" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(&admin)
        .await
        .unwrap();
    Ctx { admin, app, org }
}

async fn teardown(c: &Ctx) {
    sqlx::query(r#"DELETE FROM "ProductFamily" WHERE "organizationId" = $1"#)
        .bind(c.org)
        .execute(&c.admin)
        .await
        .unwrap();
}

fn new_family(name: &str, parent: Option<Uuid>) -> CreateFamily {
    CreateFamily {
        name: name.into(),
        parent_id: parent,
        color: None,
        icon: None,
        sort_order: None,
        is_archetype: None,
    }
}

#[tokio::test]
async fn arbol_arquetipo_y_ciclos() {
    let c = setup().await;

    // Raíz "Bebidas" con subfamilia "Refrescos".
    let bebidas = service::create(&c.app, c.org, new_family("Bebidas", None))
        .await
        .unwrap();
    let refrescos = service::create(&c.app, c.org, new_family("Refrescos", Some(bebidas.id)))
        .await
        .unwrap();
    assert_eq!(refrescos.parent_id, Some(bebidas.id));

    // El árbol tiene una raíz con un hijo.
    let tree = service::find_tree(&c.app, c.org).await.unwrap();
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].family.id, bebidas.id);
    assert_eq!(tree[0].children.len(), 1);
    assert_eq!(tree[0].children[0].family.id, refrescos.id);

    // Marcar "Refrescos" como arquetipo (no tiene hijos): OK.
    let refrescos = service::update(
        &c.app,
        c.org,
        refrescos.id,
        UpdateFamily {
            name: None,
            parent_id: None,
            color: None,
            icon: None,
            sort_order: None,
            is_archetype: Some(true),
        },
    )
    .await
    .unwrap();
    assert!(refrescos.is_archetype);

    // Crear una subfamilia bajo un arquetipo → BadRequest.
    assert_eq!(
        service::create(&c.app, c.org, new_family("Colas", Some(refrescos.id)))
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    // Marcar "Bebidas" como arquetipo teniendo subfamilia → BadRequest.
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            bebidas.id,
            UpdateFamily {
                name: None,
                parent_id: None,
                color: None,
                icon: None,
                sort_order: None,
                is_archetype: Some(true),
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Reparentar "Bebidas" bajo su propia descendiente "Refrescos" → ciclo → BadRequest.
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            bebidas.id,
            UpdateFamily {
                name: None,
                parent_id: Some(Some(refrescos.id)),
                color: None,
                icon: None,
                sort_order: None,
                is_archetype: None,
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Reparentar a sí misma → BadRequest.
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            bebidas.id,
            UpdateFamily {
                name: None,
                parent_id: Some(Some(bebidas.id)),
                color: None,
                icon: None,
                sort_order: None,
                is_archetype: None,
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Mover "Refrescos" a raíz (parentId = null explícito).
    let refrescos = service::update(
        &c.app,
        c.org,
        refrescos.id,
        UpdateFamily {
            name: None,
            parent_id: Some(None),
            color: None,
            icon: None,
            sort_order: None,
            is_archetype: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(refrescos.parent_id, None);
    let tree = service::find_tree(&c.app, c.org).await.unwrap();
    assert_eq!(tree.len(), 2); // ahora dos raíces

    // Borrado.
    service::remove(&c.app, c.org, refrescos.id).await.unwrap();
    assert_eq!(
        service::remove(&c.app, c.org, refrescos.id).await.err(),
        Some(AppError::NotFound)
    );

    teardown(&c).await;
}
