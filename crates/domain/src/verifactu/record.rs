//! Registro VeriFactu rectificativo (#152, mínimo) — port de `recordRectification`
//! / `createRecordInTx`. INSERT del `VerifactuRecord` (tipo RECTIFICATION, abono)
//! con huella encadenada, dentro de la MISMA tx que la devolución (atómico,
//! SEC-07). El ENVÍO a la AEAT (cola/reintentos) se difiere a Fase 5 (#155).

use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

use super::hash::{build_qr_data, compute_hash, VerifactuPayload};

/// Registra el rectificativo de una devolución dentro de `tx`. `invoice_number`
/// referencia la factura original (ticket de la venta) o, en devolución ciega, un
/// identificador propio (`BLIND-<returnId>`). El importe se almacena en negativo
/// (abono). Serializa el encadenamiento de huellas del tenant con un advisory lock.
pub async fn record_rectification(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    return_id: Uuid,
    invoice_number: &str,
    total: Decimal,
) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1::text))")
        .bind(org.to_string())
        .execute(&mut **tx)
        .await?;

    let nif: Option<String> = sqlx::query_scalar(r#"SELECT nif FROM "Organization" WHERE id = $1"#)
        .bind(org)
        .fetch_one(&mut **tx)
        .await?;
    let previous_hash: Option<String> = sqlx::query_scalar(
        r#"SELECT hash FROM "VerifactuRecord" WHERE "organizationId" = $1
           ORDER BY "createdAt" DESC LIMIT 1"#,
    )
    .bind(org)
    .fetch_optional(&mut **tx)
    .await?;

    let amount = -total.abs(); // abono: importe negativo
    let date = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_default();
    let payload = VerifactuPayload {
        nif: nif.as_deref(),
        invoice_number,
        date: &date,
        total: amount,
        record_type: "RECTIFICATION",
    };
    let hash = compute_hash(&payload, previous_hash.as_deref());
    let qr = build_qr_data(nif.as_deref(), invoice_number, amount);
    let payload_json = serde_json::json!({
        "nif": nif,
        "invoiceNumber": invoice_number,
        "date": date,
        "total": format!("{amount:.2}"),
        "type": "RECTIFICATION",
    })
    .to_string();

    sqlx::query(
        r#"INSERT INTO "VerifactuRecord"
             (id, "organizationId", "returnId", type, status, hash, "previousHash", "qrData", payload)
           VALUES ($1, $2, $3, 'RECTIFICATION'::"VerifactuType", 'PENDING'::"VerifactuStatus",
             $4, $5, $6, $7::jsonb)"#,
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .bind(return_id)
    .bind(&hash)
    .bind(previous_hash)
    .bind(&qr)
    .bind(&payload_json)
    .execute(&mut **tx)
    .await?;

    // TODO #155: encolar el envío a la AEAT tras el commit (afterCommit + reintentos).
    tracing::debug!(%return_id, "VeriFactu rectificativo registrado; envío AEAT diferido (#155)");
    Ok(())
}
