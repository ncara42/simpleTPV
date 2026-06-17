//! Integración de la cola de envío VeriFactu (#155): `process_pending_batch`
//! (Postgres SKIP LOCKED + proveedor + reintentos) y `retry`. Usa una org
//! desechable propia para no procesar los PENDING de otros tests en paralelo
//! (el batch se acota con `Some(org)`).

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_domain::verifactu::queue::{
    self, process_pending_batch, SendResult, VerifactuProvider, MAX_ATTEMPTS,
};
use simpletpv_domain::verifactu::record_invoice;
use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

async fn admin_pool() -> PgPool {
    let url = std::env::var("DATABASE_URL_ADMIN").unwrap_or_else(|_| DEV_ADMIN_URL.to_owned());
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .expect("conectar a Postgres")
}

/// Org desechable (BYPASSRLS) para aislar los registros del test.
async fn temp_org(admin: &PgPool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(r#"INSERT INTO "Organization" (id, name) VALUES ($1, $2)"#)
        .bind(id)
        .bind(format!("vf-queue-test-{id}"))
        .execute(admin)
        .await
        .expect("crear org de test");
    id
}

/// Inserta un registro PENDING (INVOICE) mínimo para `org` y devuelve su id.
async fn insert_pending(admin: &PgPool, org: Uuid) -> Uuid {
    let id = Uuid::new_v4();
    let hash = format!("{:0>64}", id.simple()); // 64 chars, suficiente para el test
    sqlx::query(
        r#"INSERT INTO "VerifactuRecord"
             (id, "organizationId", type, status, hash, payload)
           VALUES ($1, $2, 'INVOICE'::"VerifactuType", 'PENDING'::"VerifactuStatus", $3,
             '{"total":"10.00"}'::jsonb)"#,
    )
    .bind(id)
    .bind(org)
    .bind(&hash)
    .execute(admin)
    .await
    .expect("insertar registro PENDING");
    id
}

/// (status, attempts, lastError) de un registro.
async fn state_of(admin: &PgPool, id: Uuid) -> (String, i32, Option<String>) {
    sqlx::query_as(
        r#"SELECT status::text, attempts, "lastError" FROM "VerifactuRecord" WHERE id = $1"#,
    )
    .bind(id)
    .fetch_one(admin)
    .await
    .unwrap()
}

async fn cleanup(admin: &PgPool, org: Uuid) {
    sqlx::query(r#"DELETE FROM "VerifactuRecord" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Organization" WHERE id = $1"#)
        .bind(org)
        .execute(admin)
        .await
        .unwrap();
}

/// Proveedor que siempre rechaza (para ejercitar reintentos y FAILED).
struct FailingProvider;
impl VerifactuProvider for FailingProvider {
    async fn send(&self, _payload: &str, _hash: &str) -> SendResult {
        SendResult {
            ok: false,
            error: Some("AEAT rechazó".to_owned()),
        }
    }
}

#[tokio::test]
async fn encadena_huellas_previous_hash() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await; // org desechable → encadenamiento aislado
    let (sale1, sale2) = (Uuid::new_v4(), Uuid::new_v4());

    // Dos facturas encadenadas en la misma tx (el advisory lock serializa).
    with_tenant_tx(&admin, org, async move |tx, _| {
        record_invoice(tx, org, sale1, "INV-1", Decimal::from(100)).await?;
        record_invoice(tx, org, sale2, "INV-2", Decimal::from(50)).await?;
        Ok(())
    })
    .await
    .unwrap();

    let sql = r#"SELECT hash, "previousHash" FROM "VerifactuRecord" WHERE "saleId" = $1"#;
    let (hash1, prev1): (String, Option<String>) = sqlx::query_as(sql)
        .bind(sale1)
        .fetch_one(&admin)
        .await
        .unwrap();
    let (hash2, prev2): (String, Option<String>) = sqlx::query_as(sql)
        .bind(sale2)
        .fetch_one(&admin)
        .await
        .unwrap();

    assert_eq!(hash1.len(), 64, "huella SHA-256 hex");
    assert!(
        prev1.is_none(),
        "el 1er registro de la org no tiene previousHash"
    );
    assert_eq!(
        prev2.as_deref(),
        Some(hash1.as_str()),
        "el 2º registro encadena con la huella del 1º (previousHash == hash(r1))"
    );
    assert_ne!(hash1, hash2, "huellas distintas");

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn envio_ok_marca_sent() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    let id = insert_pending(&admin, org).await;

    let n = process_pending_batch(&admin, &queue::SandboxProvider, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(n, 1, "procesa el único PENDING de la org");

    let (status, attempts, err) = state_of(&admin, id).await;
    assert_eq!(status, "SENT", "envío OK → SENT");
    assert_eq!(attempts, 1, "un intento contabilizado");
    assert!(err.is_none());

    // Idempotencia: un segundo ciclo no reprocesa lo ya enviado.
    let n2 = process_pending_batch(&admin, &queue::SandboxProvider, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(n2, 0, "nada PENDING que reenviar");

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn fallos_reintentan_hasta_failed() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    let id = insert_pending(&admin, org).await;

    // Cada ciclo con el proveedor que rechaza incrementa attempts; sigue PENDING
    // mientras queden intentos.
    for expected in 1..MAX_ATTEMPTS {
        process_pending_batch(&admin, &FailingProvider, 50, Some(org))
            .await
            .unwrap();
        let (status, attempts, err) = state_of(&admin, id).await;
        assert_eq!(attempts, expected, "attempts incrementa cada ciclo");
        assert_eq!(status, "PENDING", "aún quedan intentos → sigue PENDING");
        assert_eq!(err.as_deref(), Some("AEAT rechazó"));
    }

    // El intento nº MAX_ATTEMPTS agota y marca FAILED.
    process_pending_batch(&admin, &FailingProvider, 50, Some(org))
        .await
        .unwrap();
    let (status, attempts, _) = state_of(&admin, id).await;
    assert_eq!(attempts, MAX_ATTEMPTS);
    assert_eq!(status, "FAILED", "agotados los intentos → FAILED");

    // Un FAILED ya no se reprocesa…
    let n = process_pending_batch(&admin, &FailingProvider, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(n, 0, "FAILED no vuelve a la cola");

    // …hasta que retry lo devuelve a PENDING (lastError limpio) y se reenvía OK.
    queue::retry(&admin, org, id).await.unwrap();
    let (status, attempts, err) = state_of(&admin, id).await;
    assert_eq!(status, "PENDING", "retry resetea a PENDING");
    assert_eq!(
        attempts, 0,
        "retry resetea attempts (H-02): vuelve a tener todos los intentos"
    );
    assert!(err.is_none(), "retry limpia el lastError");

    process_pending_batch(&admin, &queue::SandboxProvider, 50, Some(org))
        .await
        .unwrap();
    let (status, _, _) = state_of(&admin, id).await;
    assert_eq!(status, "SENT", "tras retry, el sandbox lo envía");

    cleanup(&admin, org).await;
}
