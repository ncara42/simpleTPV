//! Configuración VERI\*FACTU por comercio (#156): modalidad de envío, razón social
//! del obligado (va en la `Cabecera` del envío a la AEAT), tipo de obligado (solo
//! para avisos de plazo 2027), exención (fuera de ámbito: SII/foral/manual) y
//! entorno AEAT (preproducción/producción). Relación 1:1 con `Organization`.
//!
//! El acceso del comercio (get/upsert) corre por tenant (RLS). El worker de envío
//! lee la config con el pool admin (BYPASSRLS) al construir el envío, igual que el
//! resto de procesos de sistema multi-tenant.

use serde::{Deserialize, Serialize};
use simpletpv_db::{classify, with_tenant_tx};
use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Modalidades de cumplimiento (ver plan §4): sin envío, asistido (app gratuita
/// AEAT), envío directo con certificado propio del comercio, o colaborador social.
pub const MODES: [&str; 4] = ["DISABLED", "ASSISTED", "DIRECT_OWN_CERT", "COLLAB_SOCIAL"];
/// Entornos del servicio web de la AEAT.
pub const ENVIRONMENTS: [&str; 2] = ["preprod", "prod"];
/// Tipo de obligado tributario (solo informativo, para los plazos 1-ene/1-jul-2027).
pub const OBLIGADO_TIPOS: [&str; 2] = ["IS", "OTHERS"];
/// Cota de longitud de la razón social (defensa de entrada).
const MAX_RAZON_SOCIAL: usize = 120;
const MAX_MOTIVO: usize = 200;

/// Configuración persistida del comercio.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VerifactuConfig {
    pub organization_id: Uuid,
    pub mode: String,
    pub razon_social: Option<String>,
    pub obligado_tipo: Option<String>,
    pub exento: bool,
    pub exento_motivo: Option<String>,
    pub environment: String,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
}

impl VerifactuConfig {
    /// `true` si el comercio debe remitir registros a la AEAT por servicio web
    /// (modos de integración directa). En `DISABLED`/`ASSISTED`/exento el worker no
    /// envía (los registros quedan PENDING como traza local / cotejo asistido).
    pub fn sends_to_aeat(&self) -> bool {
        !self.exento && (self.mode == "DIRECT_OWN_CERT" || self.mode == "COLLAB_SOCIAL")
    }
}

/// Datos de entrada para crear/actualizar la configuración (validados en boundary).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifactuConfigInput {
    pub mode: String,
    #[serde(default)]
    pub razon_social: Option<String>,
    #[serde(default)]
    pub obligado_tipo: Option<String>,
    #[serde(default)]
    pub exento: Option<bool>,
    #[serde(default)]
    pub exento_motivo: Option<String>,
    #[serde(default)]
    pub environment: Option<String>,
}

impl VerifactuConfigInput {
    /// Valida con allowlists (modo, entorno, tipo) y cotas de longitud. Rechaza
    /// valores arbitrarios (L-02): nunca se interpolan en SQL, pero se acotan igual.
    pub fn validate(&self) -> Result<(), AppError> {
        if !MODES.contains(&self.mode.as_str()) {
            return Err(AppError::BadRequest);
        }
        if let Some(env) = &self.environment {
            if !ENVIRONMENTS.contains(&env.as_str()) {
                return Err(AppError::BadRequest);
            }
        }
        if let Some(t) = &self.obligado_tipo {
            if !OBLIGADO_TIPOS.contains(&t.as_str()) {
                return Err(AppError::BadRequest);
            }
        }
        if self
            .razon_social
            .as_deref()
            .is_some_and(|s| s.chars().count() > MAX_RAZON_SOCIAL)
            || self
                .exento_motivo
                .as_deref()
                .is_some_and(|s| s.chars().count() > MAX_MOTIVO)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

const SELECT_COLS: &str = r#""organizationId" AS organization_id, mode,
    "razonSocial" AS razon_social, "obligadoTipo" AS obligado_tipo, exento,
    "exentoMotivo" AS exento_motivo, environment, "updatedAt" AS updated_at"#;

/// Configuración del tenant (RLS). `None` si nunca se configuró.
pub async fn get(pool: &PgPool, org: Uuid) -> Result<Option<VerifactuConfig>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _| {
        sqlx::query_as(&format!(
            r#"SELECT {SELECT_COLS} FROM "VerifactuConfig" WHERE "organizationId" = $1"#
        ))
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
    })
    .await
}

/// Lectura por el worker/proveedor (pool admin, BYPASSRLS): construye el envío sin
/// contexto de tenant. `None` si el comercio no tiene configuración.
pub async fn get_admin(admin: &PgPool, org: Uuid) -> Result<Option<VerifactuConfig>, AppError> {
    sqlx::query_as(&format!(
        r#"SELECT {SELECT_COLS} FROM "VerifactuConfig" WHERE "organizationId" = $1"#
    ))
    .bind(org)
    .fetch_optional(admin)
    .await
    .map_err(|e| classify(&e))
}

/// Crea o actualiza (upsert) la configuración del tenant. Valida la entrada antes.
pub async fn upsert(
    pool: &PgPool,
    org: Uuid,
    input: VerifactuConfigInput,
) -> Result<VerifactuConfig, AppError> {
    input.validate()?;
    let environment = input.environment.unwrap_or_else(|| "preprod".to_owned());
    let exento = input.exento.unwrap_or(false);
    with_tenant_tx(pool, org, async move |tx, _| {
        sqlx::query_as(&format!(
            r#"INSERT INTO "VerifactuConfig"
                 ("organizationId", mode, "razonSocial", "obligadoTipo", exento,
                  "exentoMotivo", environment, "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, now())
               ON CONFLICT ("organizationId") DO UPDATE SET
                 mode = $2, "razonSocial" = $3, "obligadoTipo" = $4, exento = $5,
                 "exentoMotivo" = $6, environment = $7, "updatedAt" = now()
               RETURNING {SELECT_COLS}"#
        ))
        .bind(org)
        .bind(&input.mode)
        .bind(&input.razon_social)
        .bind(&input.obligado_tipo)
        .bind(exento)
        .bind(&input.exento_motivo)
        .bind(&environment)
        .fetch_one(&mut **tx)
        .await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(mode: &str) -> VerifactuConfigInput {
        VerifactuConfigInput {
            mode: mode.to_owned(),
            razon_social: None,
            obligado_tipo: None,
            exento: None,
            exento_motivo: None,
            environment: None,
        }
    }

    #[test]
    fn valida_modo_y_entorno_con_allowlist() {
        assert!(input("COLLAB_SOCIAL").validate().is_ok());
        assert!(input("HACKED").validate().is_err());
        let mut i = input("ASSISTED");
        i.environment = Some("staging".into());
        assert!(i.validate().is_err());
        i.environment = Some("prod".into());
        assert!(i.validate().is_ok());
    }

    #[test]
    fn valida_cotas_de_longitud() {
        let mut i = input("DISABLED");
        i.razon_social = Some("x".repeat(MAX_RAZON_SOCIAL + 1));
        assert!(i.validate().is_err());
    }

    #[test]
    fn sends_to_aeat_solo_en_modos_directos_y_no_exento() {
        let cfg = |mode: &str, exento: bool| VerifactuConfig {
            organization_id: Uuid::nil(),
            mode: mode.to_owned(),
            razon_social: None,
            obligado_tipo: None,
            exento,
            exento_motivo: None,
            environment: "preprod".to_owned(),
            updated_at: time::macros::datetime!(2026-01-01 0:00),
        };
        assert!(cfg("COLLAB_SOCIAL", false).sends_to_aeat());
        assert!(cfg("DIRECT_OWN_CERT", false).sends_to_aeat());
        assert!(!cfg("COLLAB_SOCIAL", true).sends_to_aeat()); // exento
        assert!(!cfg("ASSISTED", false).sends_to_aeat());
        assert!(!cfg("DISABLED", false).sends_to_aeat());
    }
}
