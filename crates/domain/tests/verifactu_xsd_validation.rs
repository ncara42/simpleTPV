//! Validación del XML VERI\*FACTU contra el **XSD oficial** de la AEAT (`tikeV1.0`),
//! complemento de `verifactu_xml_conformance.rs` (que comprueba buena-formación y
//! consistencia de la huella, pero NO el esquema).
//!
//! Este test SOLO corre cuando se dan las dos condiciones; si falta cualquiera, se
//! **omite** con un aviso (no rompe el gate):
//!   1. `xmllint` (paquete `libxml2-utils`) está en el `PATH`.
//!   2. Los XSD oficiales están en `tests/fixtures/verifactu/xsd/` (ver su README).
//!
//! En CI (`rust.yml`) se instala `xmllint`; en cuanto los XSD estén en el repo, la
//! validación corre automáticamente. Valida el documento de negocio
//! `RegFactuSistemaFacturacion` (lo que va dentro del Body SOAP) contra `SuministroLR.xsd`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::json;
use simpletpv_domain::verifactu::aeat::xml::{NS_LR, NS_SF};
use simpletpv_domain::verifactu::aeat::{
    build_envelope, registro_alta_xml, registro_anulacion_xml, registro_factura_wrap,
    Encadenamiento, Persona, SistemaInformatico,
};
use uuid::Uuid;

fn xsd_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/verifactu/xsd")
}

fn xmllint_disponible() -> bool {
    Command::new("xmllint").arg("--version").output().is_ok()
}

fn sis() -> SistemaInformatico {
    SistemaInformatico {
        nombre_razon: "Software Casa SL".into(),
        nif: "B99999999".into(),
        nombre_sistema: "simpleTPV".into(),
        id_sistema: "01".into(),
        version: "0.1.0".into(),
        numero_instalacion: "001".into(),
        solo_verifactu: true,
        multi_ot: true,
        indicador_multi_ot: true,
    }
}

fn obligado() -> Persona {
    Persona {
        nombre_razon: "Comercio Verde SL".into(),
        nif: "B12345678".into(),
    }
}

fn payload_alta(serie: &str, tipo: &str, cuota: &str, importe: &str) -> serde_json::Value {
    json!({
        "idEmisorFactura": "B12345678",
        "numSerieFactura": serie,
        "fechaExpedicionFactura": "02-06-2026",
        "tipoFactura": tipo,
        "cuotaTotal": cuota,
        "importeTotal": importe,
        "fechaHoraHusoGenRegistro": "2026-06-02T14:05:00+02:00",
        "huella": "A".repeat(64),
        "desglose": [{
            "impuesto": "01",
            "tipoImpositivo": "21.00",
            "baseImponibleOimporteNoSujeto": "44.55",
            "cuotaRepercutida": "9.35"
        }]
    })
}

/// Extrae el `RegFactuSistemaFacturacion` del sobre SOAP y lo deja como documento
/// independiente (con declaración XML y los namespaces en el raíz) para validarlo
/// contra el XSD, que NO conoce el envoltorio `soapenv`.
fn doc_negocio(envelope: &str) -> String {
    let open = "<sfLR:RegFactuSistemaFacturacion>";
    let close = "</sfLR:RegFactuSistemaFacturacion>";
    let start = envelope
        .find(open)
        .expect("RegFactuSistemaFacturacion en el sobre");
    let end = envelope
        .find(close)
        .expect("cierre de RegFactuSistemaFacturacion")
        + close.len();
    let inner = &envelope[start..end];
    let con_ns = inner.replacen(
        open,
        &format!(r#"<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="{NS_LR}" xmlns:sf="{NS_SF}">"#),
        1,
    );
    format!(r#"<?xml version="1.0" encoding="UTF-8"?>{con_ns}"#)
}

/// Valida `doc` contra `schema` con `xmllint`. `Ok(())` o el stderr de `xmllint`
/// (que señala el elemento/línea infractor).
fn validar(doc: &str, schema: &Path) -> Result<(), String> {
    let path = std::env::temp_dir().join(format!("vf-xsd-{}.xml", Uuid::new_v4()));
    std::fs::write(&path, doc).map_err(|e| e.to_string())?;
    let salida = Command::new("xmllint")
        .arg("--noout")
        .arg("--schema")
        .arg(schema)
        .arg(&path)
        .output()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    if salida.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&salida.stderr).into_owned())
    }
}

/// Casos representativos: cada uno como su propio `RegFactuSistemaFacturacion` (para
/// localizar el fallo) + uno con varios registros (alta + anulación en un sobre).
fn casos() -> Vec<(&'static str, String)> {
    let mut f1 = payload_alta("T01-000001", "F1", "9.35", "53.90");
    f1["destinatario"] = json!({"nif": "B87654321", "nombreRazon": "Cliente SA"});
    let f2 = payload_alta("T01-000002", "F2", "9.35", "53.90");
    let r5 = payload_alta("T01-000003", "R5", "-9.35", "-53.90");
    let anul = json!({
        "idEmisorFacturaAnulada": "B12345678",
        "numSerieFacturaAnulada": "T01-000002",
        "fechaExpedicionFacturaAnulada": "02-06-2026",
        "fechaHoraHusoGenRegistro": "2026-06-03T10:00:00+02:00",
        "huella": "B".repeat(64)
    });

    let alta_f1 = registro_alta_xml(
        &f1,
        "Venta",
        false,
        false,
        &Encadenamiento::Primero,
        &sis(),
        "Comercio Verde SL",
    );
    let alta_f2 = registro_alta_xml(
        &f2,
        "Venta",
        false,
        false,
        &Encadenamiento::Primero,
        &sis(),
        "Comercio Verde SL",
    );
    let alta_r5 = registro_alta_xml(
        &r5,
        "Abono",
        false,
        false,
        &Encadenamiento::Primero,
        &sis(),
        "Comercio Verde SL",
    );
    // Subsanación: alta con Subsanacion=S y RechazoPrevio=S.
    let alta_sub = registro_alta_xml(
        &f2,
        "Venta",
        true,
        true,
        &Encadenamiento::Primero,
        &sis(),
        "Comercio Verde SL",
    );
    let anulacion = registro_anulacion_xml(&anul, false, &Encadenamiento::Primero, &sis());

    let uno = |reg: &str| {
        doc_negocio(&build_envelope(
            &obligado(),
            None,
            &[registro_factura_wrap(reg)],
        ))
    };

    vec![
        ("alta_f1", uno(&alta_f1)),
        ("alta_f2", uno(&alta_f2)),
        ("rectificativa_r5", uno(&alta_r5)),
        ("alta_subsanacion", uno(&alta_sub)),
        ("anulacion", uno(&anulacion)),
        (
            "lote_alta_y_anulacion",
            doc_negocio(&build_envelope(
                &obligado(),
                None,
                &[
                    registro_factura_wrap(&alta_f2),
                    registro_factura_wrap(&anulacion),
                ],
            )),
        ),
    ]
}

#[test]
fn xml_valida_contra_xsd_oficial_aeat() {
    let schema = xsd_dir().join("SuministroLR.xsd");

    if !xmllint_disponible() {
        eprintln!("[OMITIDO] xmllint no está instalado (paquete libxml2-utils); validación XSD no ejecutada");
        return;
    }
    if !schema.exists() {
        eprintln!(
            "[OMITIDO] faltan los XSD oficiales en {} (ver README); validación XSD no ejecutada",
            xsd_dir().display()
        );
        return;
    }

    let mut errores = Vec::new();
    for (nombre, doc) in casos() {
        if let Err(e) = validar(&doc, &schema) {
            errores.push(format!("--- {nombre} ---\n{e}"));
        }
    }
    assert!(
        errores.is_empty(),
        "el XML generado no valida contra el XSD oficial de la AEAT:\n{}",
        errores.join("\n")
    );
}
