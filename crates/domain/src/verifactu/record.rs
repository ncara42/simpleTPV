//! Registro VeriFactu encadenado (#155) — INSERT del `VerifactuRecord` (INVOICE en
//! ventas / RECTIFICATION en devoluciones) con **huella oficial** (RegistroAlta,
//! spec huella v0.1.2) DENTRO de la MISMA tx que la operación que factura (atómico,
//! SEC-02: una factura nunca queda sin su registro fiscal). El ENVÍO a la AEAT
//! (cola/reintentos) es un efecto posterior reintentable — ver `verifactu::queue`.
//!
//! Tanto la factura (ticket = factura simplificada `F2`) como la devolución
//! (rectificativa `R5`, importes en negativo) son un `RegistroAlta`: comparten la
//! misma huella oficial; difieren en `TipoFactura` y el signo. La anulación de una
//! factura mal emitida (RegistroAnulacion) es otro flujo y aún no se emite aquí.

use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use time::OffsetDateTime;
use time_tz::{timezones, OffsetDateTimeExt};
use uuid::Uuid;

use crate::sales::TaxBreakdownItem;

use super::hash::{
    build_qr_data, compute_alta_hash, format_fecha_expedicion, format_fecha_hora_huso,
    AltaHashInput,
};

/// Operación que origina el registro. Determina el tipo de registro, la clave
/// oficial `TipoFactura`, el signo del importe y la columna a la que se ancla.
#[derive(Debug, Clone, Copy)]
enum RecordRef {
    /// Venta → factura (INVOICE).
    Sale(Uuid),
    /// Devolución → rectificativo/abono (RECTIFICATION).
    Return(Uuid),
}

impl RecordRef {
    /// Valor del enum `VerifactuType` de la BD.
    fn kind_str(self) -> &'static str {
        match self {
            RecordRef::Sale(_) => "INVOICE",
            RecordRef::Return(_) => "RECTIFICATION",
        }
    }

    /// Clave oficial `TipoFactura` (`ClaveTipoFacturaType` del XSD). Nuestras ventas
    /// son tickets = **factura simplificada (`F2`)**; su rectificativa (devolución /
    /// abono) es **`R5`** (rectificativa en facturas simplificadas).
    fn tipo_factura(self) -> &'static str {
        match self {
            RecordRef::Sale(_) => "F2",
            RecordRef::Return(_) => "R5",
        }
    }

    /// Signo del importe: la rectificativa (abono) se registra en negativo.
    fn sign(self) -> Decimal {
        match self {
            RecordRef::Sale(_) => Decimal::ONE,
            RecordRef::Return(_) => -Decimal::ONE,
        }
    }

    fn sale_id(self) -> Option<Uuid> {
        match self {
            RecordRef::Sale(id) => Some(id),
            RecordRef::Return(_) => None,
        }
    }

    fn return_id(self) -> Option<Uuid> {
        match self {
            RecordRef::Return(id) => Some(id),
            RecordRef::Sale(_) => None,
        }
    }
}

/// Crea un `VerifactuRecord` (PENDING) con huella oficial encadenada dentro de `tx`.
/// Serializa el encadenamiento de huellas del tenant con `pg_advisory_xact_lock`
/// para que dos registros concurrentes no tomen el mismo `previousHash`.
/// `importe_abs` y `breakdown` vienen en POSITIVO; el signo (negativo en
/// rectificativos) se aplica aquí según `reference`.
async fn create_record_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    reference: RecordRef,
    invoice_number: &str,
    importe_abs: Decimal,
    breakdown: &[TaxBreakdownItem],
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

    // Fechas en hora local española (Europe/Madrid, DST correcto): la
    // `FechaExpedicionFactura` es la fecha fiscal del negocio, no UTC (una venta de
    // madrugada en UTC caería el día anterior), y `FechaHoraHusoGenRegistro` lleva
    // el huso español (`+01:00`/`+02:00`).
    let now = OffsetDateTime::now_utc().to_timezone(timezones::db::europe::MADRID);
    let fecha_expedicion = format_fecha_expedicion(now);
    let fecha_hora_huso = format_fecha_hora_huso(now);

    let sign = reference.sign();
    let importe_total = importe_abs.abs() * sign;
    let cuota_abs: Decimal = breakdown.iter().map(|b| b.cuota).sum();
    let cuota_total = cuota_abs * sign;
    let nif_str = nif.as_deref().unwrap_or("");

    let input = AltaHashInput {
        id_emisor: nif_str,
        num_serie: invoice_number,
        fecha_expedicion: &fecha_expedicion,
        tipo_factura: reference.tipo_factura(),
        cuota_total,
        importe_total,
        fecha_hora_huso_gen: &fecha_hora_huso,
    };
    let hash = compute_alta_hash(&input, previous_hash.as_deref());
    let qr = build_qr_data(nif_str, invoice_number, &fecha_expedicion, importe_total);

    // Desglose de IVA por tipo con los nombres de elemento del XSD (DetalleType),
    // para que la capa de envío construya el RegistroAlta y re-verifique la huella.
    let desglose: Vec<serde_json::Value> = breakdown
        .iter()
        .map(|b| {
            serde_json::json!({
                "impuesto": "01", // 01 = IVA (ImpuestoType)
                "tipoImpositivo": format!("{:.2}", b.tax_rate), // Tipo2.2Type (2 decimales)
                "baseImponibleOimporteNoSujeto": format!("{:.2}", b.base * sign),
                "cuotaRepercutida": format!("{:.2}", b.cuota * sign),
            })
        })
        .collect();

    let payload_json = serde_json::json!({
        "idEmisorFactura": nif.as_deref(),
        "numSerieFactura": invoice_number,
        "fechaExpedicionFactura": fecha_expedicion,
        "tipoFactura": reference.tipo_factura(),
        "cuotaTotal": format!("{cuota_total:.2}"),
        "importeTotal": format!("{importe_total:.2}"),
        "fechaHoraHusoGenRegistro": fecha_hora_huso,
        "huellaAnterior": previous_hash.as_deref(),
        "huella": &hash,
        "desglose": desglose,
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
    .bind(reference.sale_id())
    .bind(reference.return_id())
    .bind(reference.kind_str())
    .bind(&hash)
    .bind(previous_hash)
    .bind(&qr)
    .bind(&payload_json)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Registra la factura (INVOICE) de una venta dentro de `tx`. `invoice_number` es
/// el número de ticket; `total` es el importe total de la venta (positivo) y
/// `breakdown` su desglose de IVA por tipo (cuota positiva).
pub async fn record_invoice(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    sale_id: Uuid,
    invoice_number: &str,
    total: Decimal,
    breakdown: &[TaxBreakdownItem],
) -> Result<(), sqlx::Error> {
    create_record_in_tx(
        tx,
        org,
        RecordRef::Sale(sale_id),
        invoice_number,
        total,
        breakdown,
    )
    .await
}

/// Registra el rectificativo (R5, abono) de una devolución dentro de `tx`.
/// `invoice_number` referencia la factura original (ticket de la venta) o, en
/// devolución ciega, un identificador propio (`BLIND-<returnId>`). `total` y
/// `breakdown` vienen en POSITIVO; se almacenan en negativo (abono).
pub async fn record_rectification(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    return_id: Uuid,
    invoice_number: &str,
    total: Decimal,
    breakdown: &[TaxBreakdownItem],
) -> Result<(), sqlx::Error> {
    create_record_in_tx(
        tx,
        org,
        RecordRef::Return(return_id),
        invoice_number,
        total,
        breakdown,
    )
    .await
}
