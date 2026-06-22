//! Huella SHA-256 **oficial** de los registros VeriFactu y QR de cotejo, conforme a
//! las especificaciones técnicas publicadas por la AEAT:
//!  - «Especificaciones técnicas para la generación de la huella o hash de los
//!    registros de facturación» v0.1.2 (AEAT, 27-08-2024).
//!  - «Detalle de las especificaciones técnicas del código QR de la factura»
//!    v0.5.0 (AEAT, 10-12-2025).
//!
//! La huella concatena `nombreCampo=valor` unidos por `&`, en el ORDEN exacto del
//! diseño de registro, codifica en UTF-8 y aplica SHA-256; la salida es hexadecimal
//! **en MAYÚSCULAS** de 64 caracteres. Un campo ausente o vacío se representa solo
//! con su nombre y el `=` (sin valor). La huella del registro inmediatamente
//! anterior entra en el campo `Huella`; en el primer registro de la cadena va vacía.
//! La cadena es inalterable: cambiar un registro pasado rompe todas las huellas
//! siguientes. Funciones puras y verificadas contra los vectores oficiales del PDF
//! (ver tests). El detalle oficial vive en `docs/superpowers/specs/`.

use std::sync::LazyLock;

use rust_decimal::Decimal;
use time::OffsetDateTime;

/// URL base del servicio de cotejo de la AEAT (impreso en el QR del ticket). Por
/// defecto **producción VERI\*FACTU** (`www2.agenciatributaria.gob.es`, valor
/// oficial de la spec QR v0.5.0); el sandbox de preproducción
/// (`https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`) se fija con la env
/// `AEAT_COTEJO_URL`.
static COTEJO_BASE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("AEAT_COTEJO_URL").unwrap_or_else(|_| {
        "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR".to_owned()
    })
});

/// URL base del cotejo AEAT (configurable por env, default producción).
pub fn cotejo_base_url() -> &'static str {
    &COTEJO_BASE_URL
}

/// Campos del `RegistroAlta` que entran en la huella, en el ORDEN oficial:
/// `IDEmisorFactura`, `NumSerieFactura`, `FechaExpedicionFactura`, `TipoFactura`,
/// `CuotaTotal`, `ImporteTotal`, `Huella` (del anterior), `FechaHoraHusoGenRegistro`.
/// Las facturas rectificativas (devoluciones, `TipoFactura` `R*`) son también un
/// `RegistroAlta`: usan esta misma huella con importes en negativo.
pub struct AltaHashInput<'a> {
    /// NIF del emisor (`IDEmisorFactura`).
    pub id_emisor: &'a str,
    /// Serie + número de la factura (`NumSerieFactura`).
    pub num_serie: &'a str,
    /// Fecha de expedición en formato oficial `DD-MM-AAAA` (`FechaExpedicionFactura`).
    pub fecha_expedicion: &'a str,
    /// Clave del tipo de factura (`F1`, `F2`, `R1`..`R5`).
    pub tipo_factura: &'a str,
    /// Cuota total de IVA repercutida (`CuotaTotal`).
    pub cuota_total: Decimal,
    /// Importe total de la factura (`ImporteTotal`).
    pub importe_total: Decimal,
    /// Fecha-hora con huso de generación del registro, ISO 8601 con offset
    /// (`FechaHoraHusoGenRegistro`, p. ej. `2024-01-01T19:20:35+01:00`).
    pub fecha_hora_huso_gen: &'a str,
}

/// Campos del `RegistroAnulacion` que entran en la huella, en el ORDEN oficial:
/// `IDEmisorFacturaAnulada`, `NumSerieFacturaAnulada`, `FechaExpedicionFacturaAnulada`,
/// `Huella` (del anterior), `FechaHoraHusoGenRegistro`. La anulación cancela una
/// factura previamente emitida (distinta de una rectificativa/abono).
pub struct AnulacionHashInput<'a> {
    pub id_emisor: &'a str,
    pub num_serie: &'a str,
    pub fecha_expedicion: &'a str,
    pub fecha_hora_huso_gen: &'a str,
}

/// Huella oficial SHA-256 (hex mayúsculas, 64 chars) de un `RegistroAlta`,
/// encadenada con la huella del registro anterior del tenant (vacía en el primero).
pub fn compute_alta_hash(input: &AltaHashInput, previous_hash: Option<&str>) -> String {
    let chain = format!(
        "IDEmisorFactura={}&NumSerieFactura={}&FechaExpedicionFactura={}&TipoFactura={}&CuotaTotal={}&ImporteTotal={}&Huella={}&FechaHoraHusoGenRegistro={}",
        input.id_emisor.trim(),
        input.num_serie.trim(),
        input.fecha_expedicion.trim(),
        input.tipo_factura.trim(),
        fmt_importe(input.cuota_total),
        fmt_importe(input.importe_total),
        previous_hash.unwrap_or("").trim(),
        input.fecha_hora_huso_gen.trim(),
    );
    sha256_upper_hex(chain.as_bytes())
}

/// Huella oficial SHA-256 (hex mayúsculas, 64 chars) de un `RegistroAnulacion`.
pub fn compute_anulacion_hash(input: &AnulacionHashInput, previous_hash: Option<&str>) -> String {
    let chain = format!(
        "IDEmisorFacturaAnulada={}&NumSerieFacturaAnulada={}&FechaExpedicionFacturaAnulada={}&Huella={}&FechaHoraHusoGenRegistro={}",
        input.id_emisor.trim(),
        input.num_serie.trim(),
        input.fecha_expedicion.trim(),
        previous_hash.unwrap_or("").trim(),
        input.fecha_hora_huso_gen.trim(),
    );
    sha256_upper_hex(chain.as_bytes())
}

/// URL de cotejo de la AEAT codificada en el QR del ticket. Parámetros oficiales en
/// el ORDEN exacto de la spec QR v0.5.0: `nif`, `numserie`, `fecha` (`DD-MM-AAAA`),
/// `importe`. Codificación URL en UTF-8 (p. ej. un `&` en la serie → `%26`).
pub fn build_qr_data(nif: &str, num_serie: &str, fecha: &str, importe: Decimal) -> String {
    format!(
        "{}?nif={}&numserie={}&fecha={}&importe={}",
        cotejo_base_url(),
        url_encode(nif.trim()),
        url_encode(num_serie.trim()),
        url_encode(fecha.trim()),
        url_encode(&fmt_importe(importe)),
    )
}

/// `FechaExpedicionFactura` en formato oficial `DD-MM-AAAA`.
pub fn format_fecha_expedicion(dt: OffsetDateTime) -> String {
    format!(
        "{:02}-{:02}-{:04}",
        dt.day(),
        u8::from(dt.month()),
        dt.year()
    )
}

/// `FechaHoraHusoGenRegistro` en ISO 8601 con huso explícito (`±HH:MM`). Con una
/// marca en UTC el huso es `+00:00` (huso válido); para hora local española habría
/// que convertir a `Europe/Madrid` con su DST antes de formatear.
pub fn format_fecha_hora_huso(dt: OffsetDateTime) -> String {
    let (oh, om, _) = dt.offset().as_hms();
    let sign = if dt.offset().is_negative() { '-' } else { '+' };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}{}{:02}:{:02}",
        dt.year(),
        u8::from(dt.month()),
        dt.day(),
        dt.hour(),
        dt.minute(),
        dt.second(),
        sign,
        oh.unsigned_abs(),
        om.unsigned_abs(),
    )
}

/// Importe con 2 decimales fijos (`ImporteSgn12.2Type` del XSD). El signo se
/// conserva (rectificativos en negativo).
fn fmt_importe(d: Decimal) -> String {
    format!("{d:.2}")
}

/// SHA-256 → hexadecimal **en mayúsculas** (formato de salida oficial).
fn sha256_upper_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02X}"));
    }
    hex
}

/// Codificación URL (percent-encoding) en UTF-8 para los valores del QR. Deja sin
/// codificar los caracteres no reservados (RFC 3986: alfanuméricos y `-._~`) y
/// codifica el resto como `%XX` (espacio → `%20`, `&` → `%26`, `/` → `%2F`).
fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::{Date, Month, Time};

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    /// Vector OFICIAL del PDF de huella v0.1.2 (Caso 2, segundo registro de la
    /// cadena): si esta aserción pasa, `compute_alta_hash` reproduce exactamente el
    /// algoritmo de la AEAT (cadena, UTF-8, SHA-256, hex mayúsculas).
    #[test]
    fn alta_hash_vector_oficial_aeat() {
        let input = AltaHashInput {
            id_emisor: "89890001K",
            num_serie: "12345679/G34",
            fecha_expedicion: "01-01-2024",
            tipo_factura: "F1",
            cuota_total: dec("12.35"),
            importe_total: dec("123.45"),
            fecha_hora_huso_gen: "2024-01-01T19:20:35+01:00",
        };
        let previa = "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60";
        assert_eq!(
            compute_alta_hash(&input, Some(previa)),
            "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97"
        );
    }

    /// Vector OFICIAL del PDF de huella v0.1.2 (Caso 3, anulación encadenada tras el
    /// registro del Caso 2).
    #[test]
    fn anulacion_hash_vector_oficial_aeat() {
        let input = AnulacionHashInput {
            id_emisor: "89890001K",
            num_serie: "12345679/G34",
            fecha_expedicion: "01-01-2024",
            fecha_hora_huso_gen: "2024-01-01T19:20:40+01:00",
        };
        let previa = "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97";
        assert_eq!(
            compute_anulacion_hash(&input, Some(previa)),
            "177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68"
        );
    }

    #[test]
    fn hash_es_determinista_mayusculas_64_y_encadena() {
        let input = AltaHashInput {
            id_emisor: "B1",
            num_serie: "T1",
            fecha_expedicion: "01-01-2026",
            tipo_factura: "F2",
            cuota_total: dec("21.00"),
            importe_total: dec("121.00"),
            fecha_hora_huso_gen: "2026-01-01T10:00:00+00:00",
        };
        let h = compute_alta_hash(&input, None);
        assert_eq!(h.len(), 64);
        assert!(h
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
        // Determinista y sensible a la huella previa (encadenamiento real).
        assert_eq!(h, compute_alta_hash(&input, None));
        assert_ne!(h, compute_alta_hash(&input, Some("ABC123")));
    }

    /// Campo vacío → solo el nombre y el `=` (huella previa ausente en el primer
    /// registro): la cadena contiene `…&Huella=&FechaHoraHusoGenRegistro=…`.
    #[test]
    fn primer_registro_huella_previa_vacia() {
        let input = AltaHashInput {
            id_emisor: "B1",
            num_serie: "T1",
            fecha_expedicion: "01-01-2026",
            tipo_factura: "F2",
            cuota_total: dec("0.00"),
            importe_total: dec("10.00"),
            fecha_hora_huso_gen: "2026-01-01T10:00:00+00:00",
        };
        // None y Some("") producen la misma huella (campo vacío en ambos casos).
        assert_eq!(
            compute_alta_hash(&input, None),
            compute_alta_hash(&input, Some(""))
        );
    }

    #[test]
    fn qr_data_parametros_oficiales_y_encoding() {
        let qr = build_qr_data("89890001K", "12345678&G33", "01-01-2024", dec("241.40"));
        assert!(qr.starts_with(cotejo_base_url()));
        assert!(
            qr.contains("?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.40")
        );
    }

    #[test]
    fn formato_fechas_oficiales() {
        let dt = Date::from_calendar_date(2026, Month::March, 5)
            .unwrap()
            .with_time(Time::from_hms(9, 7, 2).unwrap())
            .assume_utc();
        assert_eq!(format_fecha_expedicion(dt), "05-03-2026");
        assert_eq!(format_fecha_hora_huso(dt), "2026-03-05T09:07:02+00:00");
    }
}
