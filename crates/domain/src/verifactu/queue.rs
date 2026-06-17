//! Cola de envío VeriFactu (#155): drena los `VerifactuRecord` PENDING con
//! `FOR UPDATE SKIP LOCKED` y los envía vía un `VerifactuProvider`, con
//! reintentos. SIN BullMQ/Redis: un worker de fondo (en `app`) poll-ea esta
//! función. El claim y la actualización corren sobre el pool **app_admin
//! (BYPASSRLS)** porque es un proceso de sistema que abarca todos los tenants
//! (como el lookup pre-tenant de API key). La gestión (list/retry) sí corre por
//! tenant (RLS): la dispara un ADMIN/MANAGER de su organización.

use serde::Serialize;
use simpletpv_db::{classify, with_tenant_tx};
use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Tras 5 intentos fallidos el registro se marca FAILED (paridad NestJS).
pub const MAX_ATTEMPTS: i32 = 5;

/// Resultado del envío al proveedor homologado.
pub struct SendResult {
    pub ok: bool,
    pub error: Option<String>,
}

/// Adaptador del proveedor de envío a la AEAT. El envío real exige un proveedor
/// certificado + credenciales que NO tenemos en este entorno; esta interfaz lo
/// aísla (enchufar el real = nueva impl). `payload` es el JSON crudo del registro.
pub trait VerifactuProvider: Send + Sync {
    fn send(
        &self,
        payload: &str,
        hash: &str,
    ) -> impl std::future::Future<Output = SendResult> + Send;
}

/// Proveedor sandbox: simula el OK del proveedor SIN llamar a la AEAT (dev/test e
/// instancia única). El real devolvería el CSV de cotejo de la AEAT.
#[derive(Clone, Default)]
pub struct SandboxProvider;

impl VerifactuProvider for SandboxProvider {
    async fn send(&self, _payload: &str, hash: &str) -> SendResult {
        let csv = format!("SANDBOX-{}", &hash[..hash.len().min(16)]);
        tracing::info!(%csv, "envío VeriFactu simulado (sandbox)");
        SendResult {
            ok: true,
            error: None,
        }
    }
}

/// Procesa hasta `limit` registros PENDING con `FOR UPDATE SKIP LOCKED` (dos
/// workers nunca toman el mismo) y devuelve cuántos procesó. En éxito → SENT; en
/// fallo incrementa `attempts` y, al alcanzar `MAX_ATTEMPTS`, marca FAILED (los
/// que aún tienen intentos siguen PENDING y se reintentan en el siguiente ciclo).
/// `org`: `None` procesa todos los tenants (worker); `Some` lo acota (tests).
pub async fn process_pending_batch<P: VerifactuProvider>(
    admin: &PgPool,
    provider: &P,
    limit: i64,
    org: Option<Uuid>,
) -> Result<usize, AppError> {
    let mut tx = admin.begin().await.map_err(|e| classify(&e))?;
    let rows: Vec<(Uuid, String, i32, String)> = sqlx::query_as(
        r#"SELECT id, hash, attempts, payload::text
           FROM "VerifactuRecord"
           WHERE status = 'PENDING'::"VerifactuStatus"
             AND ($2::uuid IS NULL OR "organizationId" = $2)
           ORDER BY "createdAt"
           FOR UPDATE SKIP LOCKED
           LIMIT $1"#,
    )
    .bind(limit)
    .bind(org)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| classify(&e))?;

    let processed = rows.len();
    for (id, hash, attempts, payload) in rows {
        let res = provider.send(&payload, &hash).await;
        if res.ok {
            sqlx::query(
                r#"UPDATE "VerifactuRecord"
                   SET status = 'SENT'::"VerifactuStatus", "sentAt" = now(),
                       attempts = attempts + 1
                   WHERE id = $1"#,
            )
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| classify(&e))?;
        } else {
            let next = attempts + 1;
            sqlx::query(
                r#"UPDATE "VerifactuRecord"
                   SET attempts = $2, "lastError" = $3,
                       status = CASE WHEN $2 >= $4 THEN 'FAILED'::"VerifactuStatus"
                                     ELSE status END
                   WHERE id = $1"#,
            )
            .bind(id)
            .bind(next)
            .bind(res.error.unwrap_or_else(|| "envío rechazado".to_owned()))
            .bind(MAX_ATTEMPTS)
            .execute(&mut *tx)
            .await
            .map_err(|e| classify(&e))?;
        }
    }
    tx.commit().await.map_err(|e| classify(&e))?;
    Ok(processed)
}

/// Vista de un registro para la pantalla de gestión (sin el payload completo).
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VerifactuRecordView {
    pub id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub kind: String,
    pub status: String,
    pub hash: String,
    pub previous_hash: Option<String>,
    pub qr_data: Option<String>,
    pub attempts: i32,
    pub last_error: Option<String>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub sent_at: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    pub sale_id: Option<Uuid>,
    pub return_id: Option<Uuid>,
}

/// Lista los registros del tenant, filtrable por estado (PENDING/SENT/FAILED).
pub async fn list(
    pool: &PgPool,
    org: Uuid,
    status: Option<String>,
) -> Result<Vec<VerifactuRecordView>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _| {
        sqlx::query_as(
            r#"SELECT id, type::text AS type, status::text AS status, hash,
                 "previousHash" AS previous_hash, "qrData" AS qr_data, attempts,
                 "lastError" AS last_error, "sentAt" AS sent_at, "createdAt" AS created_at,
                 "saleId" AS sale_id, "returnId" AS return_id
               FROM "VerifactuRecord"
               WHERE "organizationId" = $1 AND ($2::text IS NULL OR status::text = $2)
               ORDER BY "createdAt" DESC"#,
        )
        .bind(org)
        .bind(status)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

/// Reintenta un registro: lo vuelve a PENDING y limpia el error (idempotente,
/// paridad NestJS `retry`); el worker lo recoge en el siguiente ciclo.
pub async fn retry(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _| {
        sqlx::query(
            r#"UPDATE "VerifactuRecord"
               SET status = 'PENDING'::"VerifactuStatus", "lastError" = NULL
               WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(id)
        .bind(org)
        .execute(&mut **tx)
        .await?;
        Ok(())
    })
    .await
}
