//! Huella SHA-256 encadenada de los registros VeriFactu (#152, mínimo) — port de
//! `verifactu.hash.ts`. La cadena es inalterable: cambiar un registro pasado
//! rompe todas las huellas siguientes. Funciones puras y reproducibles (formato
//! de campos en orden, separados por `|`). El subsistema completo (colas, envío
//! AEAT, reintentos) llega en Fase 5 (#155).

use rust_decimal::Decimal;

/// Datos mínimos que entran en la huella de un registro VeriFactu.
pub struct VerifactuPayload<'a> {
    pub nif: Option<&'a str>,
    pub invoice_number: &'a str,
    pub date: &'a str,
    pub total: Decimal,
    /// `"INVOICE"` o `"RECTIFICATION"`.
    pub record_type: &'a str,
}

/// SHA-256 (hex) de un registro encadenado con la huella del anterior del tenant.
/// Importe formateado con 2 decimales (paridad con `Number.toFixed(2)`).
pub fn compute_hash(payload: &VerifactuPayload, previous_hash: Option<&str>) -> String {
    use sha2::{Digest, Sha256};
    let total = format!("{:.2}", payload.total);
    let parts = [
        previous_hash.unwrap_or(""),
        payload.nif.unwrap_or(""),
        payload.invoice_number,
        payload.date,
        &total,
        payload.record_type,
    ];
    let digest = Sha256::digest(parts.join("|").as_bytes());
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    hex
}

/// URL de cotejo de la AEAT codificada en el QR del ticket (sandbox). Formato de
/// query del servicio de cotejo VeriFactu (`nif`, `numserie`, `importe`).
pub fn build_qr_data(nif: Option<&str>, invoice_number: &str, total: Decimal) -> String {
    format!(
        "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif={}&numserie={}&importe={total:.2}",
        form_encode(nif.unwrap_or("")),
        form_encode(invoice_number),
    )
}

/// `application/x-www-form-urlencoded` (identidad para valores limpios).
fn form_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'*' | b'-' | b'.' | b'_' => {
                out.push(b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    fn payload() -> VerifactuPayload<'static> {
        VerifactuPayload {
            nif: Some("B1"),
            invoice_number: "T1",
            date: "2026-01-01",
            total: dec("121.00"),
            record_type: "INVOICE",
        }
    }

    #[test]
    fn hash_paridad_con_vector_conocido() {
        // SHA-256 de "|B1|T1|2026-01-01|121.00|INVOICE" (sin huella previa).
        assert_eq!(
            compute_hash(&payload(), None),
            "6041e6fade5e720e849c92bfb81b626254546bb9f4931f8bc553ad7c8daf2ea1"
        );
        // Con huella previa "abc123" → encadenado.
        assert_eq!(
            compute_hash(&payload(), Some("abc123")),
            "4fc81030c0ad04d3fb84c206e10aae09b95460b6d189a1b0dcce0abd3794b06d"
        );
    }

    #[test]
    fn hash_es_determinista_y_cambia_con_la_cadena() {
        assert_eq!(
            compute_hash(&payload(), None),
            compute_hash(&payload(), None)
        );
        assert_ne!(
            compute_hash(&payload(), None),
            compute_hash(&payload(), Some("x"))
        );
        assert_eq!(compute_hash(&payload(), None).len(), 64);
    }

    #[test]
    fn qr_data_incluye_nif_numserie_importe() {
        let qr = build_qr_data(Some("B12345678"), "T01-000001", dec("53.90"));
        assert!(qr.contains("nif=B12345678"));
        assert!(qr.contains("numserie=T01-000001"));
        assert!(qr.contains("importe=53.90"));
    }
}
