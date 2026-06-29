//! Verificación de integridad de la cadena de huellas VERI\*FACTU (#156, Fase 9).
//! Recorre los registros del tenant en orden de creación y comprueba, por registro,
//! la INTEGRIDAD (la huella almacenada se reproduce al recomputarla desde los campos
//! del `payload` + su `previousHash` → el registro no se ha manipulado) y el
//! ENCADENAMIENTO (el `previousHash` almacenado coincide con la huella del registro
//! anterior → el orden de la cadena está intacto). Cualquier discrepancia rompe la
//! cadena y se reporta con el registro culpable.

use rust_decimal::Decimal;
use serde::Serialize;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::hash::{compute_alta_hash, compute_anulacion_hash, AltaHashInput, AnulacionHashInput};

/// Resultado de la verificación de la cadena de un tenant.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainReport {
    /// Registros revisados.
    pub total: usize,
    /// `true` si toda la cadena es íntegra y está bien encadenada.
    pub ok: bool,
    /// Primer registro que rompe la cadena (si lo hay).
    pub broken_at: Option<Uuid>,
    /// Descripción del fallo (si lo hay).
    pub detail: Option<String>,
}

fn s(v: &serde_json::Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_owned()
}

fn dec(v: &serde_json::Value, key: &str) -> Decimal {
    v.get(key)
        .and_then(|x| x.as_str())
        .and_then(|x| x.parse().ok())
        .unwrap_or_default()
}

/// Recomputa la huella de un registro desde su `payload` y el `previousHash` que
/// declara. `kind` es el valor textual de `VerifactuType`.
fn recompute(kind: &str, payload: &serde_json::Value, previous: Option<&str>) -> String {
    if kind == "ANULACION" {
        compute_anulacion_hash(
            &AnulacionHashInput {
                id_emisor: &s(payload, "idEmisorFacturaAnulada"),
                num_serie: &s(payload, "numSerieFacturaAnulada"),
                fecha_expedicion: &s(payload, "fechaExpedicionFacturaAnulada"),
                fecha_hora_huso_gen: &s(payload, "fechaHoraHusoGenRegistro"),
            },
            previous,
        )
    } else {
        compute_alta_hash(
            &AltaHashInput {
                id_emisor: &s(payload, "idEmisorFactura"),
                num_serie: &s(payload, "numSerieFactura"),
                fecha_expedicion: &s(payload, "fechaExpedicionFactura"),
                tipo_factura: &s(payload, "tipoFactura"),
                cuota_total: dec(payload, "cuotaTotal"),
                importe_total: dec(payload, "importeTotal"),
                fecha_hora_huso_gen: &s(payload, "fechaHoraHusoGenRegistro"),
            },
            previous,
        )
    }
}

/// Verifica la cadena de huellas del tenant (RLS). Lee `payload` como texto y lo
/// parsea (no depende del feature `json` de sqlx).
pub async fn verify_chain(pool: &PgPool, org: Uuid) -> Result<ChainReport, AppError> {
    let rows: Vec<(Uuid, String, String, Option<String>, String)> =
        with_tenant_tx(pool, org, async move |tx, _| {
            sqlx::query_as(
                r#"SELECT id, type::text, hash, "previousHash", payload::text
                   FROM "VerifactuRecord"
                   WHERE "organizationId" = $1
                   ORDER BY "createdAt", id"#,
            )
            .bind(org)
            .fetch_all(&mut **tx)
            .await
        })
        .await?;

    let total = rows.len();
    let mut prev_hash: Option<String> = None;

    for (id, kind, hash, previous_hash, payload_text) in rows {
        // 1) Encadenamiento: el previousHash declarado == huella del anterior.
        let declared_prev = previous_hash.as_deref().unwrap_or("");
        let expected_prev = prev_hash.as_deref().unwrap_or("");
        if declared_prev != expected_prev {
            return Ok(ChainReport {
                total,
                ok: false,
                broken_at: Some(id),
                detail: Some(format!(
                    "encadenamiento roto: previousHash declarado no coincide con la huella del registro anterior (registro {id})"
                )),
            });
        }

        // 2) Integridad: recomputar la huella desde el payload + previousHash.
        let payload: serde_json::Value =
            serde_json::from_str(&payload_text).map_err(|_| AppError::Internal)?;
        let recomputed = recompute(&kind, &payload, previous_hash.as_deref());
        if recomputed != hash {
            return Ok(ChainReport {
                total,
                ok: false,
                broken_at: Some(id),
                detail: Some(format!(
                    "integridad rota: la huella almacenada no coincide con la recomputada (registro {id})"
                )),
            });
        }

        prev_hash = Some(hash);
    }

    Ok(ChainReport {
        total,
        ok: true,
        broken_at: None,
        detail: None,
    })
}
