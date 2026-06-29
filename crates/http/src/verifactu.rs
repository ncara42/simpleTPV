//! Handlers de estado/reintento de VeriFactu (`/verifactu/records`, #155). Solo
//! ADMIN/MANAGER (administración). El ENVÍO real lo procesa el worker de fondo;
//! aquí solo se consulta el estado y se re-encolan los registros fallidos.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use simpletpv_auth::Role;
use simpletpv_domain::verifactu::aeat::crypto;
use simpletpv_domain::verifactu::config::{self, VerifactuConfig, VerifactuConfigInput};
use simpletpv_domain::verifactu::queue::{self, VerifactuRecordView};
use simpletpv_domain::verifactu::CertStatus;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];
/// La configuración (modalidad, certificado, exención) la fija solo el ADMIN.
const CONFIG_ROLES: [Role; 1] = [Role::Admin];
/// Estados válidos del filtro (allowlist, L-02): rechaza valores arbitrarios.
const VALID_STATUS: [&str; 3] = ["PENDING", "SENT", "FAILED"];

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    status: Option<String>,
}

/// `GET /verifactu/records?status=` — registros del tenant (ADMIN/MANAGER).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<VerifactuRecordView>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    if let Some(s) = &q.status {
        if !VALID_STATUS.contains(&s.as_str()) {
            return Err(simpletpv_shared::AppError::BadRequest.into());
        }
    }
    Ok(Json(
        queue::list(state.db(), user.organization_id, q.status).await?,
    ))
}

/// `POST /verifactu/records/:id/retry` — re-encola un registro (ADMIN/MANAGER).
pub async fn retry(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    queue::retry(state.db(), user.organization_id, id).await?;
    Ok(Json(json!({ "ok": true })))
}

/// `GET /verifactu/verify` — re-verifica la cadena de huellas del comercio (#156,
/// integridad + encadenamiento). ADMIN/MANAGER.
pub async fn verify_chain(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<simpletpv_domain::verifactu::ChainReport>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        simpletpv_domain::verifactu::verify_chain(state.db(), user.organization_id).await?,
    ))
}

/// `GET /verifactu/config` — configuración VERI\*FACTU del comercio (ADMIN). Devuelve
/// `null` si aún no se ha configurado.
pub async fn config_get(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Option<VerifactuConfig>>, ApiError> {
    user.require_role(&CONFIG_ROLES)?;
    Ok(Json(config::get(state.db(), user.organization_id).await?))
}

/// `PUT /verifactu/config` — crea/actualiza la configuración del comercio (ADMIN).
pub async fn config_put(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<VerifactuConfigInput>,
) -> Result<Json<VerifactuConfig>, ApiError> {
    user.require_role(&CONFIG_ROLES)?;
    Ok(Json(
        config::upsert(state.db(), user.organization_id, input).await?,
    ))
}

/// `GET /verifactu/certificate` — estado del certificado del comercio (ADMIN). Nunca
/// devuelve el material del certificado, solo metadatos.
pub async fn cert_status(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Option<CertStatus>>, ApiError> {
    user.require_role(&CONFIG_ROLES)?;
    Ok(Json(
        simpletpv_domain::verifactu::cert_status(state.db(), user.organization_id).await?,
    ))
}

#[derive(Deserialize)]
pub struct CertInput {
    /// Certificado de cliente en PEM (certificado + clave privada concatenados).
    pem: String,
    #[serde(default)]
    subject: Option<String>,
}

/// `PUT /verifactu/certificate` — sube el certificado PEM del comercio (modo
/// DIRECT_OWN_CERT, ADMIN). Se cifra con `VERIFACTU_CERT_KEY` (entorno) antes de
/// guardar; el PEM en claro nunca se persiste ni se devuelve. Si el servidor no tiene
/// configurada la clave de cifrado → 503.
pub async fn cert_put(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<CertInput>,
) -> Result<Json<Value>, ApiError> {
    user.require_role(&CONFIG_ROLES)?;
    let key_hex = std::env::var("VERIFACTU_CERT_KEY").map_err(|_| {
        tracing::error!("subida de certificado sin VERIFACTU_CERT_KEY configurada");
        simpletpv_shared::AppError::Unavailable
    })?;
    let key = crypto::key_from_hex(&key_hex).map_err(|e| {
        tracing::error!(error = %e, "VERIFACTU_CERT_KEY inválida");
        simpletpv_shared::AppError::Unavailable
    })?;
    simpletpv_domain::verifactu::store_certificate(
        state.db(),
        user.organization_id,
        input.pem.as_bytes(),
        &key,
        input.subject,
    )
    .await?;
    Ok(Json(json!({ "ok": true })))
}
