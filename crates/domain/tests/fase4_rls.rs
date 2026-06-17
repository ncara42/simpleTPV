//! Aislamiento cross-tenant (RLS) de las tablas nuevas de la Fase 4 (#154).
//!
//! La Fase 3 tenía `*_rls.rs` por dominio; la Fase 4 no añadió ninguno (#165):
//! el mecanismo RLS está validado a nivel de infra en `db/tests/rls.rs`, pero
//! faltaba evidencia POR TABLA. Aquí se cubre en dos niveles:
//!   1. Estructural: cada tabla de Fase 4 tiene RLS habilitada + ≥1 política
//!      (caza el olvido de `ENABLE ROW LEVEL SECURITY` en una tabla nueva).
//!   2. De comportamiento: la fila de org2 es invisible bajo el contexto de
//!      org1 (y viceversa) y sin contexto no se ve ninguna (fail-safe).
//!
//! Las tablas con FK pesadas (PriceListItem, WholesaleOrder/Line) se cubren solo
//! a nivel estructural: comparten la misma plantilla de política `tenant_isolation`
//! y construir sus cadenas de FK no añade evidencia sobre el aislamiento.
//!
//! Requiere el Postgres dev sembrado (orgs B11111111 / B22222222), mismos
//! roles/credenciales que el resto de tests de integración.

use std::time::Duration;

use simpletpv_db::with_tenant_tx;
use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

/// Tablas nuevas de la Fase 4 que deben estar bajo RLS por tenant.
const FASE4_TABLES: &[&str] = &[
    "Customer",
    "PriceList",
    "PriceListItem",
    "WholesaleOrder",
    "WholesaleOrderLine",
    "ApiKey",
    "Promotion",
    "ProductFamily",
    "OfficialDevice",
    "UserPreference",
];

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
        .expect("seed ejecutado (organización presente)")
}

/// ids de `table` visibles bajo el contexto RLS de `org`.
async fn tenant_ids(app: &PgPool, org: Uuid, table: &str) -> Vec<Uuid> {
    let sql = format!(r#"SELECT id FROM "{table}""#);
    with_tenant_tx(app, org, async move |tx, _| {
        sqlx::query_scalar::<_, Uuid>(&sql)
            .fetch_all(&mut **tx)
            .await
    })
    .await
    .expect("lectura bajo tenant")
}

/// Verifica el aislamiento de lectura de `table` con dos filas ya insertadas
/// (`id1` de org1, `id2` de org2) y limpia ambas al terminar.
async fn assert_isolation(
    admin: &PgPool,
    app: &PgPool,
    org1: Uuid,
    org2: Uuid,
    table: &str,
    id1: Uuid,
    id2: Uuid,
) {
    let see1 = tenant_ids(app, org1, table).await;
    assert!(see1.contains(&id1), "{table}: org1 debe ver su propia fila");
    assert!(
        !see1.contains(&id2),
        "{table}: org1 NO debe ver la fila de org2 (fuga cross-tenant)"
    );

    let see2 = tenant_ids(app, org2, table).await;
    assert!(see2.contains(&id2), "{table}: org2 debe ver su propia fila");
    assert!(
        !see2.contains(&id1),
        "{table}: org2 NO debe ver la fila de org1 (fuga cross-tenant)"
    );

    // Sin contexto de tenant ⇒ 0 filas (fail-safe), independientemente de cuántas
    // filas existan: la política filtra por `current_setting` ausente → NULL.
    let none: Vec<Uuid> = sqlx::query_scalar(&format!(r#"SELECT id FROM "{table}""#))
        .fetch_all(app)
        .await
        .unwrap();
    assert!(
        none.is_empty(),
        "{table}: sin tenant no debe verse ninguna fila"
    );

    for id in [id1, id2] {
        sqlx::query(&format!(r#"DELETE FROM "{table}" WHERE id = $1"#))
            .bind(id)
            .execute(admin)
            .await
            .expect("limpiar fila de test");
    }
}

// --- Inserciones mínimas vía BYPASSRLS (admin). Devuelven el id creado. ---

/// Tablas cuyo único requisito (más allá de `organizationId`) es `name`
/// (+ `updatedAt` cuando la columna existe sin default).
async fn insert_named(admin: &PgPool, org: Uuid, table: &str, updated_at: bool) -> Uuid {
    let name = format!("rls-test-{}", Uuid::new_v4());
    let sql = if updated_at {
        format!(
            r#"INSERT INTO "{table}" (id, "organizationId", name, "updatedAt")
               VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id"#
        )
    } else {
        format!(
            r#"INSERT INTO "{table}" (id, "organizationId", name)
               VALUES (gen_random_uuid(), $1, $2) RETURNING id"#
        )
    };
    sqlx::query_scalar(&sql)
        .bind(org)
        .bind(name)
        .fetch_one(admin)
        .await
        .expect("insert con nombre")
}

async fn insert_promotion(admin: &PgPool, org: Uuid) -> Uuid {
    sqlx::query_scalar(
        r#"INSERT INTO "Promotion"
             (id, "organizationId", name, "conditionType", threshold, "discountType",
              "discountValue", "startDate", "endDate", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'min_qty'::"PromoConditionType", 3,
                   'percent'::"PromoDiscountType", 10.0, current_date, current_date, now())
           RETURNING id"#,
    )
    .bind(org)
    .bind(format!("rls-test-{}", Uuid::new_v4()))
    .fetch_one(admin)
    .await
    .expect("insert promotion")
}

async fn insert_api_key(admin: &PgPool, org: Uuid) -> Uuid {
    let token = Uuid::new_v4().simple().to_string();
    sqlx::query_scalar(
        r#"INSERT INTO "ApiKey" (id, "organizationId", name, prefix, "hashedKey")
           VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id"#,
    )
    .bind(org)
    .bind(format!("rls-test-{token}"))
    .bind(token[..8].to_owned())
    .bind(format!("hash-{token}"))
    .fetch_one(admin)
    .await
    .expect("insert api key")
}

async fn insert_official_device(admin: &PgPool, org: Uuid) -> Uuid {
    let store: Uuid =
        sqlx::query_scalar(r#"SELECT id FROM "Store" WHERE "organizationId" = $1 LIMIT 1"#)
            .bind(org)
            .fetch_one(admin)
            .await
            .expect("org con tienda sembrada");
    let token = Uuid::new_v4().simple().to_string();
    sqlx::query_scalar(
        r#"INSERT INTO "OfficialDevice" (id, "organizationId", "storeId", name, "pairingToken")
           VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id"#,
    )
    .bind(org)
    .bind(store)
    .bind(format!("rls-test-{token}"))
    .bind(token)
    .fetch_one(admin)
    .await
    .expect("insert official device")
}

async fn insert_user_preference(admin: &PgPool, org: Uuid) -> Uuid {
    let user: Uuid =
        sqlx::query_scalar(r#"SELECT id FROM "User" WHERE "organizationId" = $1 LIMIT 1"#)
            .bind(org)
            .fetch_one(admin)
            .await
            .expect("org con usuario sembrado");
    sqlx::query_scalar(
        r#"INSERT INTO "UserPreference" (id, "organizationId", "userId", key, value, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, '{"x":1}'::jsonb, now()) RETURNING id"#,
    )
    .bind(org)
    .bind(user)
    .bind(format!("rls-test-{}", Uuid::new_v4()))
    .fetch_one(admin)
    .await
    .expect("insert user preference")
}

// --- Estructural: cada tabla de Fase 4 bajo RLS + con política. ---

#[tokio::test]
async fn fase4_tablas_tienen_rls_habilitada_y_politica() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    for &table in FASE4_TABLES {
        let (rls_on, policies): (bool, i64) = sqlx::query_as(
            r#"SELECT c.relrowsecurity,
                      (SELECT count(*) FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = $1)
               FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = $1"#,
        )
        .bind(table)
        .fetch_one(&admin)
        .await
        .unwrap_or_else(|e| panic!("consultar catálogo de {table}: {e}"));
        assert!(
            rls_on,
            "{table}: RLS no habilitada (falta ENABLE ROW LEVEL SECURITY)"
        );
        assert!(
            policies >= 1,
            "{table}: sin política de aislamiento por tenant"
        );
    }
}

// --- De comportamiento: aislamiento de lectura por tabla. ---

#[tokio::test]
async fn customer_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_named(&admin, o1, "Customer", true).await;
    let id2 = insert_named(&admin, o2, "Customer", true).await;
    assert_isolation(&admin, &app, o1, o2, "Customer", id1, id2).await;
}

#[tokio::test]
async fn price_list_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_named(&admin, o1, "PriceList", false).await;
    let id2 = insert_named(&admin, o2, "PriceList", false).await;
    assert_isolation(&admin, &app, o1, o2, "PriceList", id1, id2).await;
}

#[tokio::test]
async fn product_family_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_named(&admin, o1, "ProductFamily", true).await;
    let id2 = insert_named(&admin, o2, "ProductFamily", true).await;
    assert_isolation(&admin, &app, o1, o2, "ProductFamily", id1, id2).await;
}

#[tokio::test]
async fn promotion_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_promotion(&admin, o1).await;
    let id2 = insert_promotion(&admin, o2).await;
    assert_isolation(&admin, &app, o1, o2, "Promotion", id1, id2).await;
}

#[tokio::test]
async fn api_key_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_api_key(&admin, o1).await;
    let id2 = insert_api_key(&admin, o2).await;
    assert_isolation(&admin, &app, o1, o2, "ApiKey", id1, id2).await;
}

#[tokio::test]
async fn official_device_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_official_device(&admin, o1).await;
    let id2 = insert_official_device(&admin, o2).await;
    assert_isolation(&admin, &app, o1, o2, "OfficialDevice", id1, id2).await;
}

#[tokio::test]
async fn user_preference_aisla_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let (o1, o2) = (
        org_id(&admin, "B11111111").await,
        org_id(&admin, "B22222222").await,
    );
    let id1 = insert_user_preference(&admin, o1).await;
    let id2 = insert_user_preference(&admin, o2).await;
    assert_isolation(&admin, &app, o1, o2, "UserPreference", id1, id2).await;
}
