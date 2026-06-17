//! Registro VeriFactu encadenado (#155) — port de `createRecordInTx`. INSERT del
//! `VerifactuRecord` (INVOICE en ventas / RECTIFICATION en devoluciones) con
//! huella encadenada, DENTRO de la MISMA tx que la operación que factura
//! (atómico, SEC-02: una factura nunca queda sin su registro fiscal). El ENVÍO a
//! la AEAT (cola/reintentos) es un efecto posterior reintentable — ver
//! `verifactu::queue`.

use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

use super::hash::{build_qr_data, compute_hash, VerifactuPayload};

/// Tipo de registro (paridad con el enum `VerifactuType` de la BD).
#[derive(Debug, Clone, Copy)]
enum RecordKind {
    Invoice,
    Rectification,
}

impl RecordKind {
    fn as_str(self) -> &'static str {
        match self {
            RecordKind::Invoice => "INVOICE",
            RecordKind::Rectification => "RECTIFICATION",
        }
    }
}

/// Crea un `VerifactuRecord` (PENDING) encadenado dentro de `tx`. Serializa el
/// encadenamiento de huellas del tenant con `pg_advisory_xact_lock` para que dos
/// registros concurrentes no tomen el mismo `previousHash`. `sale_id`/`return_id`
/// son excluyentes según el tipo; `total` ya viene con el signo correcto (negativo
/// en rectificativos/abonos).
async fn create_record_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    kind: RecordKind,
    sale_id: Option<Uuid>,
    return_id: Option<Uuid>,
    invoice_number: &str,
    total: Decimal,
) -> Result<(), sqlx::Error> {
    // `hashtextextended(...,0)` da 64 bits (como en time_clock): evita colisiones
    // de lock entre tenants distintos que sí tendría `hashtext` (32 bits) — M-02.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))")
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

    let date = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_default();
    let payload = VerifactuPayload {
        nif: nif.as_deref(),
        invoice_number,
        date: &date,
        total,
        record_type: kind.as_str(),
    };
    let hash = compute_hash(&payload, previous_hash.as_deref());
    let qr = build_qr_data(nif.as_deref(), invoice_number, total);
    let payload_json = serde_json::json!({
        "nif": nif,
        "invoiceNumber": invoice_number,
        "date": date,
        "total": format!("{total:.2}"),
        "type": kind.as_str(),
    })
    .to_string();

    sqlx::query(
        r#"INSERT INTO "VerifactuRecord"
             (id, "organizationId", "saleId", "returnId", type, status, hash, "previousHash",
              "qrData", payload)
           VALUES ($1, $2, $3, $4, $5::"VerifactuType", 'PENDING'::"VerifactuStatus",
             $6, $7, $8, $9::jsonb)"#,
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .bind(sale_id)
    .bind(return_id)
    .bind(kind.as_str())
    .bind(&hash)
    .bind(previous_hash)
    .bind(&qr)
    .bind(&payload_json)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Registra la factura (INVOICE) de una venta dentro de `tx`. `invoice_number` es
/// el número de ticket; el importe es el total de la venta (positivo).
pub async fn record_invoice(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    sale_id: Uuid,
    invoice_number: &str,
    total: Decimal,
) -> Result<(), sqlx::Error> {
    create_record_in_tx(
        tx,
        org,
        RecordKind::Invoice,
        Some(sale_id),
        None,
        invoice_number,
        total,
    )
    .await
}

/// Registra el rectificativo de una devolución dentro de `tx`. `invoice_number`
/// referencia la factura original (ticket de la venta) o, en devolución ciega, un
/// identificador propio (`BLIND-<returnId>`). El importe se almacena en negativo
/// (abono).
pub async fn record_rectification(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    return_id: Uuid,
    invoice_number: &str,
    total: Decimal,
) -> Result<(), sqlx::Error> {
    create_record_in_tx(
        tx,
        org,
        RecordKind::Rectification,
        None,
        Some(return_id),
        invoice_number,
        -total.abs(), // abono: importe negativo
    )
    .await
}
