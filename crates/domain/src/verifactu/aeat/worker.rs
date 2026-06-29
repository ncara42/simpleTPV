//! Orquestación del envío a la AEAT (#156, Fase 4). Reclama los `VerifactuRecord`
//! PENDING **vencidos** (control de flujo) de comercios en modalidad de envío
//! (`DIRECT_OWN_CERT`/`COLLAB_SOCIAL`, no exentos), los agrupa por tenant, construye
//! el sobre SOAP `RegFactuSistemaFacturacion` (≤1000 registros), lo envía por mTLS y
//! actualiza el estado de cada registro + una fila de traza (`VerifactuSubmission`).
//!
//! Corre sobre el pool **app_admin (BYPASSRLS)**: es un proceso de sistema que abarca
//! todos los tenants. Mantiene la transacción durante el envío (un único worker;
//! `FOR UPDATE SKIP LOCKED` evita que dos lo procesen). Fail-safe: si no hay
//! certificado/identidad para un comercio, sus registros quedan PENDING con backoff
//! (nunca se marcan SENT en falso → no se incumple la obligación fiscal).

use serde_json::Value;
use simpletpv_db::classify;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::client::{AeatEndpoint, AeatTransport, TransportError};
use super::response::{parse_respuesta, Outcome};
use super::xml::{
    build_envelope, registro_alta_xml, registro_anulacion_xml, registro_factura_wrap,
    Encadenamiento, Persona, SistemaInformatico,
};
use super::{crypto, response::LineaRespuesta};
use crate::verifactu::queue::MAX_ATTEMPTS;

/// Reintento de transporte (fallo de red/HTTP): no antes de 1 h (mínimo legal).
const RETRY_BACKOFF_SECS: i64 = 3600;

/// Configuración del worker AEAT (constantes del despliegue/fabricante).
#[derive(Clone)]
pub struct AeatWorkerConfig {
    /// Datos del SIF (productor) — bloque `SistemaInformatico` de cada registro.
    pub sistema: SistemaInformatico,
    /// Certificado del fabricante en PEM, para modo `COLLAB_SOCIAL` (uno para todos).
    pub collab_cert_pem: Option<Vec<u8>>,
    /// Clave AES-256 para descifrar los certificados `DIRECT_OWN_CERT` de la BD.
    pub cert_key: Option<[u8; 32]>,
    /// Timeout por petición HTTP a la AEAT.
    pub timeout_secs: u64,
}

struct Claimed {
    id: Uuid,
    org: Uuid,
    kind: String,
    payload: Value,
    previous_hash: Option<String>,
    subsanacion: bool,
    rechazo_previo: bool,
    mode: String,
    razon_social: Option<String>,
    environment: String,
}

/// Fila cruda reclamada (payload aún como texto JSON, parseado a [`Claimed`]).
#[derive(sqlx::FromRow)]
struct ClaimedRow {
    id: Uuid,
    org: Uuid,
    kind: String,
    payload: String,
    previous_hash: Option<String>,
    subsanacion: bool,
    rechazo_previo: bool,
    mode: String,
    razon_social: Option<String>,
    environment: String,
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_owned()
}

/// IDFactura (emisor, serie, fecha) de un registro a partir de su payload, sirviendo
/// tanto a altas como a anulaciones (claves distintas).
fn triple_from_payload(v: &Value) -> (String, String, String) {
    if v.get("idEmisorFactura").is_some() {
        (
            str_field(v, "idEmisorFactura"),
            str_field(v, "numSerieFactura"),
            str_field(v, "fechaExpedicionFactura"),
        )
    } else {
        (
            str_field(v, "idEmisorFacturaAnulada"),
            str_field(v, "numSerieFacturaAnulada"),
            str_field(v, "fechaExpedicionFacturaAnulada"),
        )
    }
}

/// Nº de serie del registro (clave para casar con la `RespuestaLinea`).
fn num_serie_of(c: &Claimed) -> String {
    if c.kind == "ANULACION" {
        str_field(&c.payload, "numSerieFacturaAnulada")
    } else {
        str_field(&c.payload, "numSerieFactura")
    }
}

/// Descripción de operación (obligatoria) según el tipo de registro.
fn descripcion(kind: &str) -> &'static str {
    match kind {
        "RECTIFICATION" => "Rectificación/abono de venta en TPV",
        "ANULACION" => "Anulación de factura",
        _ => "Venta en TPV",
    }
}

/// Arrendamiento del claim: mientras se hace la llamada de red (sin tx abierta), los
/// registros reclamados quedan "no vencidos" (`nextAttemptAt` en el futuro) para que
/// ningún otro ciclo/worker los reprocese. Si el worker cae a mitad, vencen y se
/// reintentan (la AEAT deduplica → `Outcome::Duplicado`, idempotente).
const CLAIM_LEASE_SECS: i64 = 300;

/// Procesa un lote de envío a la AEAT. Devuelve cuántos registros se reclamaron.
/// `only_org`: `None` procesa todos los tenants (worker); `Some` lo acota (tests).
/// `transport` es la costura de red ([`super::RealTransport`] en producción).
///
/// Tres fases para NO retener locks de BD durante la red (un fallo de la AEAT podría
/// tardar segundos):
///  1. TX corta: reclama los PENDING vencidos (`FOR UPDATE SKIP LOCKED`) y los ARRIENDA
///     (`nextAttemptAt` futuro); el COMMIT libera los locks.
///  2. Sin tx: construye el sobre y envía por mTLS.
///  3. TX corta por comercio: persiste el resultado (SENT/FAILED/reintento) + traza.
pub async fn process_aeat_batch<T: AeatTransport>(
    admin: &PgPool,
    cfg: &AeatWorkerConfig,
    transport: &T,
    limit: i64,
    only_org: Option<Uuid>,
) -> Result<usize, AppError> {
    let claimed = claim_and_lease(admin, limit, only_org).await?;
    let processed = claimed.len();

    // Agrupa por org (las filas vienen ordenadas por organizationId).
    let mut groups: Vec<Vec<Claimed>> = Vec::new();
    for c in claimed {
        match groups.last_mut() {
            Some(g) if g[0].org == c.org => g.push(c),
            _ => groups.push(vec![c]),
        }
    }

    // El fallo de un comercio no aborta el lote de los demás: sus registros quedaron
    // arrendados y vencerán para reintentarse.
    for group in groups {
        let org = group[0].org;
        if let Err(e) = process_org_group(admin, cfg, transport, group).await {
            tracing::warn!(%org, error = %e, "envío VeriFactu de un comercio falló");
        }
    }
    Ok(processed)
}

/// Fase 1: TX corta que reclama y arrienda los registros PENDING vencidos de comercios
/// en modalidad de envío (no exentos). Devuelve los reclamados ya parseados.
async fn claim_and_lease(
    admin: &PgPool,
    limit: i64,
    only_org: Option<Uuid>,
) -> Result<Vec<Claimed>, AppError> {
    let mut tx = admin.begin().await.map_err(|e| classify(&e))?;
    let rows: Vec<ClaimedRow> = sqlx::query_as(
        r#"SELECT r.id AS id, r."organizationId" AS org, r.type::text AS kind,
                  r.payload::text AS payload, r."previousHash" AS previous_hash,
                  r.subsanacion AS subsanacion, r."rechazoPrevio" AS rechazo_previo,
                  c.mode AS mode, c."razonSocial" AS razon_social, c.environment AS environment
           FROM "VerifactuRecord" r
           JOIN "VerifactuConfig" c ON c."organizationId" = r."organizationId"
           WHERE r.status = 'PENDING'::"VerifactuStatus"
             AND (r."nextAttemptAt" IS NULL OR r."nextAttemptAt" <= now())
             AND ($2::uuid IS NULL OR r."organizationId" = $2)
             AND c.exento = false
             AND c.mode IN ('DIRECT_OWN_CERT', 'COLLAB_SOCIAL')
           ORDER BY r."organizationId", r."createdAt"
           FOR UPDATE OF r SKIP LOCKED
           LIMIT $1"#,
    )
    .bind(limit)
    .bind(only_org)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| classify(&e))?;

    let claimed: Vec<Claimed> = rows
        .into_iter()
        .filter_map(|r| match serde_json::from_str::<Value>(&r.payload) {
            Ok(payload) => Some(Claimed {
                id: r.id,
                org: r.org,
                kind: r.kind,
                payload,
                previous_hash: r.previous_hash,
                subsanacion: r.subsanacion,
                rechazo_previo: r.rechazo_previo,
                mode: r.mode,
                razon_social: r.razon_social,
                environment: r.environment,
            }),
            Err(e) => {
                tracing::error!(record = %r.id, error = %e, "payload VeriFactu no parseable; se omite");
                None
            }
        })
        .collect();

    // Arrienda los reclamados para que no los tome otro ciclo durante la red; la fase 3
    // sobrescribe `nextAttemptAt` con el resultado real (SENT no lo reactiva).
    if !claimed.is_empty() {
        let ids: Vec<Uuid> = claimed.iter().map(|c| c.id).collect();
        sqlx::query(
            r#"UPDATE "VerifactuRecord"
               SET "nextAttemptAt" = now() + make_interval(secs => $2)
               WHERE id = ANY($1)"#,
        )
        .bind(&ids)
        .bind(CLAIM_LEASE_SECS as f64)
        .execute(&mut *tx)
        .await
        .map_err(|e| classify(&e))?;
    }
    tx.commit().await.map_err(|e| classify(&e))?;
    Ok(claimed)
}

/// Fases 2 y 3 para un comercio: construye el sobre, lo envía (sin tx) y persiste el
/// resultado en una TX corta atómica.
async fn process_org_group<T: AeatTransport>(
    admin: &PgPool,
    cfg: &AeatWorkerConfig,
    transport: &T,
    group: Vec<Claimed>,
) -> Result<(), AppError> {
    let org = group[0].org;
    let mode = group[0].mode.clone();
    let environment = group[0].environment.clone();

    // Identidad (PEM) según modalidad.
    let identity_pem: Option<Vec<u8>> = match mode.as_str() {
        "COLLAB_SOCIAL" => cfg.collab_cert_pem.clone(),
        "DIRECT_OWN_CERT" => load_org_cert(admin, org, cfg.cert_key.as_ref()).await?,
        _ => None,
    };
    let Some(identity_pem) = identity_pem else {
        // Sin certificado: backoff sin marcar SENT (fail-safe).
        for c in &group {
            defer_record(
                admin,
                c.id,
                "sin certificado configurado para el envío VERI*FACTU",
            )
            .await?;
        }
        return Ok(());
    };

    let endpoint = AeatEndpoint::from_config(&environment);
    let endpoint_url = endpoint.url();

    // Obligado (Cabecera): razón social (config) o nombre de la organización; NIF del
    // emisor (del propio registro).
    let nif_emisor = num_emisor(&group[0]);
    let nombre_razon = match &group[0].razon_social {
        Some(r) if !r.is_empty() => r.clone(),
        _ => org_name(admin, org)
            .await?
            .unwrap_or_else(|| nif_emisor.clone()),
    };
    let obligado = Persona {
        nombre_razon: nombre_razon.clone(),
        nif: nif_emisor,
    };

    // Construye un RegistroFactura por registro (lecturas sueltas, sin tx larga).
    let mut registros_xml = Vec::with_capacity(group.len());
    for c in &group {
        let enc = encadenamiento_for(admin, org, c.previous_hash.as_deref()).await?;
        let reg = if c.kind == "ANULACION" {
            registro_anulacion_xml(&c.payload, c.rechazo_previo, &enc, &cfg.sistema)
        } else {
            registro_alta_xml(
                &c.payload,
                descripcion(&c.kind),
                c.subsanacion,
                c.rechazo_previo,
                &enc,
                &cfg.sistema,
                &nombre_razon,
            )
        };
        registros_xml.push(registro_factura_wrap(&reg));
    }
    let envelope = build_envelope(&obligado, None, &registros_xml);

    // Fase 2: llamada de red SIN transacción abierta (no se retienen locks de BD).
    let send = transport
        .submit(&identity_pem, endpoint, cfg.timeout_secs, &envelope)
        .await;

    // Identidad/certificado inválido (`TransportError::Build`): es configuración
    // incorrecta, no un fallo de la AEAT → se difiere sin gastar intentos (fail-safe),
    // igual que la ausencia de certificado.
    if let Err(TransportError::Build(msg)) = &send {
        for c in &group {
            defer_record(admin, c.id, &format!("certificado inválido: {msg}")).await?;
        }
        return Ok(());
    }

    // Fase 3: TX corta que persiste el resultado del grupo de forma atómica.
    let mut tx = admin.begin().await.map_err(|e| classify(&e))?;
    match send {
        Ok(res) => {
            let parsed = match parse_respuesta(&res.body) {
                Ok(p) => Some(p),
                Err(e) => {
                    tracing::warn!(%org, error = %e, "respuesta AEAT no parseable");
                    None
                }
            };
            apply_response(
                &mut tx,
                &group,
                parsed,
                endpoint_url,
                res.http_status as i32,
            )
            .await?;
        }
        Err(TransportError::Status { code, .. }) => {
            tracing::warn!(%org, code, "la AEAT devolvió HTTP no 2xx");
            for c in &group {
                record_transport_failure(
                    &mut tx,
                    c,
                    endpoint_url,
                    Some(code as i32),
                    "HTTP no 2xx de la AEAT",
                )
                .await?;
            }
        }
        Err(e) => {
            tracing::warn!(%org, error = %e, "fallo de transporte al enviar a la AEAT");
            for c in &group {
                record_transport_failure(&mut tx, c, endpoint_url, None, &e.to_string()).await?;
            }
        }
    }
    tx.commit().await.map_err(|e| classify(&e))?;
    Ok(())
}

fn num_emisor(c: &Claimed) -> String {
    if c.kind == "ANULACION" {
        str_field(&c.payload, "idEmisorFacturaAnulada")
    } else {
        str_field(&c.payload, "idEmisorFactura")
    }
}

async fn org_name(admin: &PgPool, org: Uuid) -> Result<Option<String>, AppError> {
    let name: Option<String> =
        sqlx::query_scalar(r#"SELECT name FROM "Organization" WHERE id = $1"#)
            .bind(org)
            .fetch_optional(admin)
            .await
            .map_err(|e| classify(&e))?;
    Ok(name)
}

async fn load_org_cert(
    admin: &PgPool,
    org: Uuid,
    key: Option<&[u8; 32]>,
) -> Result<Option<Vec<u8>>, AppError> {
    let Some(key) = key else { return Ok(None) };
    let blob: Option<Vec<u8>> = sqlx::query_scalar(
        r#"SELECT "encBlob" FROM "VerifactuCertificate" WHERE "organizationId" = $1
           ORDER BY "createdAt" DESC LIMIT 1"#,
    )
    .bind(org)
    .fetch_optional(admin)
    .await
    .map_err(|e| classify(&e))?;
    Ok(blob.and_then(|b| crypto::open(&b, key).ok()))
}

/// Encadenamiento para un registro: primer registro o referencia al anterior (busca
/// el registro cuya huella == previousHash y toma su IDFactura).
async fn encadenamiento_for(
    admin: &PgPool,
    org: Uuid,
    previous_hash: Option<&str>,
) -> Result<Encadenamiento, AppError> {
    let Some(prev) = previous_hash.filter(|h| !h.is_empty()) else {
        return Ok(Encadenamiento::Primero);
    };
    let payload_text: Option<String> = sqlx::query_scalar(
        r#"SELECT payload::text FROM "VerifactuRecord"
           WHERE "organizationId" = $1 AND hash = $2 LIMIT 1"#,
    )
    .bind(org)
    .bind(prev)
    .fetch_optional(admin)
    .await
    .map_err(|e| classify(&e))?;
    match payload_text.and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
        Some(v) => {
            let (id_emisor, num_serie, fecha_exp) = triple_from_payload(&v);
            Ok(Encadenamiento::Anterior {
                id_emisor,
                num_serie,
                fecha_exp,
                huella: prev.to_owned(),
            })
        }
        // No debería ocurrir (la huella previa siempre apunta a un registro existente
        // del mismo tenant). Si pasa, encadenamos con la huella sola y avisamos: la AEAT
        // rechazará el registro y se reintentará como fallo (nunca se marca SENT en falso).
        None => {
            tracing::warn!(%org, prev, "registro anterior no encontrado para el encadenamiento");
            Ok(Encadenamiento::Anterior {
                id_emisor: String::new(),
                num_serie: String::new(),
                fecha_exp: String::new(),
                huella: prev.to_owned(),
            })
        }
    }
}

/// Aplica la respuesta de la AEAT a cada registro del grupo (casando por nº de serie).
async fn apply_response(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    group: &[Claimed],
    parsed: Option<super::response::RespuestaAeat>,
    endpoint: &str,
    http_status: i32,
) -> Result<(), AppError> {
    let lineas = parsed
        .as_ref()
        .map(|p| p.lineas.clone())
        .unwrap_or_default();
    let estado_envio = parsed.as_ref().map(|p| p.estado_envio.clone());
    for c in group {
        let serie = num_serie_of(c);
        let linea = lineas
            .iter()
            .find(|l| l.num_serie.as_deref() == Some(serie.as_str()));
        match linea {
            Some(l) => {
                mark_outcome(tx, c, l, endpoint, http_status, estado_envio.as_deref()).await?
            }
            None => {
                // La AEAT no devolvió línea para este registro: ambiguo → reintentar.
                record_transport_failure(
                    tx,
                    c,
                    endpoint,
                    Some(http_status),
                    "sin RespuestaLinea de la AEAT para el registro",
                )
                .await?;
            }
        }
    }
    Ok(())
}

async fn mark_outcome(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &Claimed,
    linea: &LineaRespuesta,
    endpoint: &str,
    http_status: i32,
    estado_envio: Option<&str>,
) -> Result<(), AppError> {
    let aeat_state = format!("{:?}", linea.estado);
    let csv = linea.csv.clone();
    match linea.outcome() {
        Outcome::Aceptado | Outcome::Duplicado | Outcome::AceptadoConErrores => {
            sqlx::query(
                r#"UPDATE "VerifactuRecord"
                   SET status = 'SENT'::"VerifactuStatus", "sentAt" = now(),
                       attempts = attempts + 1, csv = $2, "aeatState" = $3,
                       "errorCode" = $4, "lastError" = $5
                   WHERE id = $1"#,
            )
            .bind(c.id)
            .bind(&csv)
            .bind(&aeat_state)
            .bind(&linea.codigo_error)
            .bind(&linea.descripcion_error)
            .execute(&mut **tx)
            .await
            .map_err(|e| classify(&e))?;
        }
        Outcome::Rechazado => {
            // Rechazo de datos → FAILED (requiere subsanación; no se reintenta solo).
            sqlx::query(
                r#"UPDATE "VerifactuRecord"
                   SET status = 'FAILED'::"VerifactuStatus", attempts = attempts + 1,
                       "aeatState" = $2, "errorCode" = $3, "lastError" = $4
                   WHERE id = $1"#,
            )
            .bind(c.id)
            .bind(&aeat_state)
            .bind(&linea.codigo_error)
            .bind(&linea.descripcion_error)
            .execute(&mut **tx)
            .await
            .map_err(|e| classify(&e))?;
        }
    }
    insert_submission(
        tx,
        c,
        endpoint,
        Some(http_status),
        estado_envio,
        Some(aeat_state.as_str()),
        csv.as_deref(),
        linea.codigo_error.as_deref(),
        linea.descripcion_error.as_deref(),
    )
    .await
}

/// Fallo de transporte: incrementa intentos, programa reintento (≥1 h) o marca FAILED
/// al alcanzar el máximo. Deja constancia en la traza.
async fn record_transport_failure(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &Claimed,
    endpoint: &str,
    http_status: Option<i32>,
    err: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"UPDATE "VerifactuRecord"
           SET attempts = attempts + 1, "lastError" = $2,
               "nextAttemptAt" = now() + make_interval(secs => $3),
               status = CASE WHEN attempts + 1 >= $4 THEN 'FAILED'::"VerifactuStatus"
                             ELSE status END
           WHERE id = $1"#,
    )
    .bind(c.id)
    .bind(err)
    .bind(RETRY_BACKOFF_SECS as f64)
    .bind(MAX_ATTEMPTS)
    .execute(&mut **tx)
    .await
    .map_err(|e| classify(&e))?;
    insert_submission(
        tx,
        c,
        endpoint,
        http_status,
        None,
        None,
        None,
        None,
        Some(err),
    )
    .await
}

/// Programa un reintento sin contarlo como fallo de la AEAT (p.ej. falta certificado).
async fn defer_record(admin: &PgPool, id: Uuid, reason: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"UPDATE "VerifactuRecord"
           SET "lastError" = $2, "nextAttemptAt" = now() + make_interval(secs => $3)
           WHERE id = $1"#,
    )
    .bind(id)
    .bind(reason)
    .bind(RETRY_BACKOFF_SECS as f64)
    .execute(admin)
    .await
    .map_err(|e| classify(&e))?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_submission(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &Claimed,
    endpoint: &str,
    http_status: Option<i32>,
    estado_envio: Option<&str>,
    estado_registro: Option<&str>,
    csv: Option<&str>,
    error_code: Option<&str>,
    error_desc: Option<&str>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"INSERT INTO "VerifactuSubmission"
             (id, "organizationId", "recordId", endpoint, "httpStatus", "estadoEnvio",
              "estadoRegistro", csv, "errorCode", "errorDesc")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)"#,
    )
    .bind(Uuid::new_v4())
    .bind(c.org)
    .bind(c.id)
    .bind(endpoint)
    .bind(http_status)
    .bind(estado_envio)
    .bind(estado_registro)
    .bind(csv)
    .bind(error_code)
    .bind(error_desc)
    .execute(&mut **tx)
    .await
    .map_err(|e| classify(&e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn triple_de_alta_y_anulacion() {
        let alta = json!({"idEmisorFactura":"B1","numSerieFactura":"S1","fechaExpedicionFactura":"01-01-2026"});
        assert_eq!(
            triple_from_payload(&alta),
            ("B1".into(), "S1".into(), "01-01-2026".into())
        );
        let anul = json!({"idEmisorFacturaAnulada":"B2","numSerieFacturaAnulada":"S2","fechaExpedicionFacturaAnulada":"02-02-2026"});
        assert_eq!(
            triple_from_payload(&anul),
            ("B2".into(), "S2".into(), "02-02-2026".into())
        );
    }

    #[test]
    fn descripcion_por_tipo() {
        assert_eq!(descripcion("INVOICE"), "Venta en TPV");
        assert!(descripcion("RECTIFICATION").contains("Rectificación"));
        assert!(descripcion("ANULACION").contains("Anulación"));
    }
}
