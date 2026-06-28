//! Almacenamiento del certificado de cliente del comercio (modo `DIRECT_OWN_CERT`,
//! #156 Fase 8). El PEM (certificado + clave privada) se guarda **cifrado en reposo**
//! (AES-256-GCM, ver [`super::aeat::crypto`]); la clave de cifrado vive en el entorno
//! (`VERIFACTU_CERT_KEY`), nunca en la BD ni en el repo. Las operaciones corren por
//! tenant (RLS): las dispara el ADMIN del comercio. El certificado en claro NUNCA se
//! devuelve por la API ni se registra en logs.

use serde::Serialize;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::PrimitiveDateTime;
use uuid::Uuid;

use super::aeat::crypto;

/// Estado del certificado para la UI (sin material sensible).
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CertStatus {
    pub subject: Option<String>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub valid_from: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub valid_to: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Guarda el certificado PEM del comercio cifrado con `key`. Valida que el PEM
/// contiene una identidad de cliente usable (cert + clave) ANTES de cifrar/guardar;
/// si no, devuelve `BadRequest`. Conserva el histórico (el worker usa el más reciente).
pub async fn store_certificate(
    pool: &PgPool,
    org: Uuid,
    pem: &[u8],
    key: &[u8; 32],
    subject: Option<String>,
) -> Result<(), AppError> {
    // Validación de frontera: el PEM debe ser una identidad de cliente cargable.
    reqwest::Identity::from_pem(pem).map_err(|_| AppError::BadRequest)?;
    let blob = crypto::seal(pem, key).map_err(|_| AppError::Internal)?;
    let has_subject = subject.is_some();
    with_tenant_tx(pool, org, async move |tx, _| {
        sqlx::query(
            r#"INSERT INTO "VerifactuCertificate" (id, "organizationId", "encBlob", subject)
               VALUES ($1, $2, $3, $4)"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(&blob)
        .bind(&subject)
        .execute(&mut **tx)
        .await?;
        Ok(())
    })
    .await?;
    // Auditoría: deja constancia del cambio (sin material sensible).
    tracing::info!(organization_id = %org, has_subject, "certificado VeriFactu actualizado");
    Ok(())
}

/// Estado del certificado más reciente del comercio (o `None` si no hay).
pub async fn status(pool: &PgPool, org: Uuid) -> Result<Option<CertStatus>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _| {
        sqlx::query_as(
            r#"SELECT subject, "validFrom" AS valid_from, "validTo" AS valid_to,
                      "createdAt" AS created_at
               FROM "VerifactuCertificate"
               WHERE "organizationId" = $1
               ORDER BY "createdAt" DESC LIMIT 1"#,
        )
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
    })
    .await
}
