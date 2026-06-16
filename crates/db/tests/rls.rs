//! Port de `apps/api/test/rls.integration.spec.ts` a SQLx.
//!
//! Verifica que RLS aísla organizaciones DE VERDAD contra un PostgreSQL real.
//! Es el GATE BLOQUEANTE de la Fase 0 (doc 02 §4): si esto no pasa en Rust, la
//! seguridad multi-tenant no está demostrada y la migración no continúa.
//!
//! Requisitos (los mismos que el test de Vitest):
//!   - Postgres arriba (docker compose up -d postgres), migraciones aplicadas
//!     (prisma migrate deploy) y seed ejecutado (orgs B11111111 y B22222222).
//!   - `DATABASE_URL_APP`   → rol `app` (RLS aplicada).
//!   - `DATABASE_URL_ADMIN` → rol `app_admin` (BYPASSRLS), solo para descubrir
//!     los IDs de las orgs por NIF en el setup. Si no se exportan, se usan las
//!     credenciales de desarrollo (públicas, ver dev-bootstrap.sql).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use simpletpv_db::with_tenant_tx;
use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

fn app_url() -> String {
    std::env::var("DATABASE_URL_APP").unwrap_or_else(|_| DEV_APP_URL.to_string())
}

fn admin_url() -> String {
    std::env::var("DATABASE_URL_ADMIN").unwrap_or_else(|_| DEV_ADMIN_URL.to_string())
}

/// Pool pequeño para tests (cargo ejecuta tests en paralelo; mantener el total
/// de conexiones por debajo del `max_connections` de Postgres).
async fn test_pool(url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(url)
        .await
        .expect("conectar a Postgres")
}

struct Ctx {
    app: PgPool,
    org1: Uuid,
    org2: Uuid,
}

/// Setup: descubre los IDs de las orgs por NIF con el rol BYPASSRLS y devuelve
/// el pool del rol `app` (RLS) para las aserciones.
async fn ctx() -> Ctx {
    let admin = test_pool(&admin_url()).await;
    let org1 = org_id_by_nif(&admin, "B11111111").await;
    let org2 = org_id_by_nif(&admin, "B22222222").await;
    admin.close().await; // liberar conexiones antes de las aserciones
    Ctx {
        app: test_pool(&app_url()).await,
        org1,
        org2,
    }
}

async fn org_id_by_nif(admin: &PgPool, nif: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM \"Organization\" WHERE nif = $1")
        .bind(nif)
        .fetch_one(admin)
        .await
        .unwrap_or_else(|e| panic!("seed no ejecutado: no existe org {nif} ({e})"))
}

/// Ejecuta una query que devuelve una columna `uuid` dentro de la tx RLS de `org`.
async fn tenant_uuids(pool: &PgPool, org: Uuid, sql: &'static str) -> Vec<Uuid> {
    with_tenant_tx(pool, org, async |tx, _| {
        sqlx::query_scalar::<_, Uuid>(sql)
            .fetch_all(&mut **tx)
            .await
    })
    .await
    .expect("query con tenant")
}

async fn product_org_ids(pool: &PgPool, org: Uuid) -> Vec<Uuid> {
    tenant_uuids(pool, org, "SELECT \"organizationId\" FROM \"Product\"").await
}

// 1. org1 solo ve sus propios productos.
#[tokio::test]
async fn org1_solo_ve_sus_productos() {
    let c = ctx().await;
    let ids = product_org_ids(&c.app, c.org1).await;
    assert!(!ids.is_empty(), "org1 debería tener productos sembrados");
    assert!(ids.iter().all(|id| *id == c.org1));
}

// 2. org2 solo ve sus propios productos.
#[tokio::test]
async fn org2_solo_ve_sus_productos() {
    let c = ctx().await;
    let ids = product_org_ids(&c.app, c.org2).await;
    assert!(!ids.is_empty(), "org2 debería tener productos sembrados");
    assert!(ids.iter().all(|id| *id == c.org2));
}

// 3. Sin contexto de tenant, RLS devuelve 0 filas (fail-safe).
#[tokio::test]
async fn sin_contexto_cero_filas() {
    let c = ctx().await;
    // Query directa sobre el pool, SIN with_tenant_tx ⇒ sin set_config.
    let ids: Vec<Uuid> = sqlx::query_scalar("SELECT \"organizationId\" FROM \"Product\"")
        .fetch_all(&c.app)
        .await
        .unwrap();
    assert!(ids.is_empty(), "sin tenant no debe verse ninguna fila");
}

// 4. El contexto de org1 no permite leer datos de org2.
#[tokio::test]
async fn contexto_org1_no_lee_org2() {
    let c = ctx().await;
    let user_orgs = with_tenant_tx(&c.app, c.org1, async |tx, _| {
        sqlx::query_scalar::<_, Uuid>("SELECT \"organizationId\" FROM \"User\"")
            .fetch_all(&mut **tx)
            .await
    })
    .await
    .unwrap();
    assert!(user_orgs.iter().all(|id| *id != c.org2));
}

// 5. WITH CHECK bloquea un INSERT cross-tenant (RLS-06).
#[tokio::test]
async fn with_check_bloquea_insert_cross_tenant() {
    let c = ctx().await;
    let res = with_tenant_tx(&c.app, c.org1, async |tx, _| {
        sqlx::query(
            "INSERT INTO \"Customer\" (id, \"organizationId\", name, \"updatedAt\") \
             VALUES (gen_random_uuid(), $1, $2, now())",
        )
        .bind(c.org2) // organizationId ajeno al contexto
        .bind("cliente inyectado cross-tenant")
        .execute(&mut **tx)
        .await
        .map(|_| ())
    })
    .await;
    assert!(
        res.is_err(),
        "INSERT con organizationId ajeno debe fallar (WITH CHECK)"
    );
}

// 6. WITH CHECK bloquea un UPDATE que mueve una fila a otro tenant (RLS-06).
#[tokio::test]
async fn with_check_bloquea_update_cross_tenant() {
    let c = ctx().await;
    // Insertamos válido (org1) y, en la MISMA tx, intentamos moverlo a org2:
    // el UPDATE falla por WITH CHECK ⇒ la tx hace rollback ⇒ no queda residuo.
    let res = with_tenant_tx(&c.app, c.org1, async |tx, _| {
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO \"Customer\" (id, \"organizationId\", name, \"updatedAt\") \
             VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id",
        )
        .bind(c.org1)
        .bind("cliente para test de UPDATE cross-tenant")
        .fetch_one(&mut **tx)
        .await?;

        sqlx::query("UPDATE \"Customer\" SET \"organizationId\" = $1 WHERE id = $2")
            .bind(c.org2)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await;
    assert!(res.is_err(), "UPDATE cross-tenant debe fallar (WITH CHECK)");
}

// 7. Queries concurrentes de dos orgs nunca cruzan datos (regresión RLS-07).
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrencia_nunca_cruza_tenants() {
    let c = ctx().await;
    for _ in 0..10 {
        let (r1, r2) = tokio::join!(
            product_org_ids(&c.app, c.org1),
            product_org_ids(&c.app, c.org2),
        );
        assert!(r1.iter().all(|id| *id == c.org1), "org1 vio datos ajenos");
        assert!(r2.iter().all(|id| *id == c.org2), "org2 vio datos ajenos");
    }
}

// 8. UserStore se aísla por organización vía RLS (join a Store, RLS-05).
#[tokio::test]
async fn userstore_aisla_por_organizacion() {
    let c = ctx().await;

    let org1_stores = tenant_uuids(&c.app, c.org1, "SELECT id FROM \"Store\"").await;
    let org2_stores = tenant_uuids(&c.app, c.org2, "SELECT id FROM \"Store\"").await;
    let org1_links = tenant_uuids(&c.app, c.org1, "SELECT \"storeId\" FROM \"UserStore\"").await;
    let org2_links = tenant_uuids(&c.app, c.org2, "SELECT \"storeId\" FROM \"UserStore\"").await;

    for link in &org1_links {
        assert!(org1_stores.contains(link));
        assert!(!org2_stores.contains(link));
    }
    for link in &org2_links {
        assert!(org2_stores.contains(link));
        assert!(!org1_stores.contains(link));
    }

    // Sin contexto, fail-safe: 0 filas.
    let no_ctx: Vec<Uuid> = sqlx::query_scalar("SELECT \"storeId\" FROM \"UserStore\"")
        .fetch_all(&c.app)
        .await
        .unwrap();
    assert!(no_ctx.is_empty());
}

// 9. Capacidades requeridas por la Fase 0 (doc 02 §4, doc 09): `SELECT ... FOR
//    UPDATE` dentro de la tx RLS + hook `after_commit` que se ejecuta tras el
//    commit. No está en el spec original; demuestra el contrato de la capa db.
#[tokio::test]
async fn for_update_y_after_commit() {
    let c = ctx().await;
    let fired = Arc::new(AtomicBool::new(false));
    let fired_cb = fired.clone();

    let locked = with_tenant_tx(&c.app, c.org1, async move |tx, after| {
        let ids: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM \"Product\" FOR UPDATE")
            .fetch_all(&mut **tx)
            .await?;
        after.register(move || async move {
            fired_cb.store(true, Ordering::SeqCst);
            Ok(())
        });
        Ok(ids.len())
    })
    .await
    .unwrap();

    assert!(
        locked > 0,
        "FOR UPDATE debe bloquear filas de Product de org1"
    );
    assert!(
        fired.load(Ordering::SeqCst),
        "el efecto after_commit debe ejecutarse tras el commit"
    );
}

// 10. after_commit NO se ejecuta si la transacción hace rollback (invariante:
//     no publicar efectos de una operación que nunca se confirmó).
#[tokio::test]
async fn after_commit_no_se_ejecuta_en_rollback() {
    let c = ctx().await;
    let fired = Arc::new(AtomicBool::new(false));
    let fired_cb = fired.clone();

    let res = with_tenant_tx(&c.app, c.org1, async move |tx, after| {
        after.register(move || async move {
            fired_cb.store(true, Ordering::SeqCst);
            Ok(())
        });
        // Forzamos un error (tabla inexistente) ⇒ rollback.
        sqlx::query("SELECT 1 FROM tabla_que_no_existe")
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await;

    assert!(res.is_err(), "la query inválida debe provocar rollback");
    assert!(
        !fired.load(Ordering::SeqCst),
        "after_commit NO debe ejecutarse cuando la tx hace rollback"
    );
}

// 11. Port directo del caso NestJS: una fila YA PERSISTIDA (commit previo) no
//     puede moverse a otro tenant en una transacción posterior (WITH CHECK).
#[tokio::test]
async fn update_cross_tenant_sobre_fila_persistida() {
    let c = ctx().await;

    // tx1: insertar y CONFIRMAR un customer de org1.
    let id: Uuid = with_tenant_tx(&c.app, c.org1, async |tx, _| {
        sqlx::query_scalar(
            "INSERT INTO \"Customer\" (id, \"organizationId\", name, \"updatedAt\") \
             VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id",
        )
        .bind(c.org1)
        .bind("cliente persistido para update cross-tenant")
        .fetch_one(&mut **tx)
        .await
    })
    .await
    .unwrap();

    // tx2 (separada): intentar moverlo a org2 ⇒ WITH CHECK lo bloquea.
    let res = with_tenant_tx(&c.app, c.org1, async |tx, _| {
        sqlx::query("UPDATE \"Customer\" SET \"organizationId\" = $1 WHERE id = $2")
            .bind(c.org2)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await;
    assert!(
        res.is_err(),
        "UPDATE cross-tenant sobre fila persistida debe fallar (WITH CHECK)"
    );

    // Limpieza: la fila sigue en org1, así que org1 puede borrarla.
    with_tenant_tx(&c.app, c.org1, async |tx, _| {
        sqlx::query("DELETE FROM \"Customer\" WHERE id = $1")
            .bind(id)
            .execute(&mut **tx)
            .await
            .map(|_| ())
    })
    .await
    .unwrap();
}
