//! Conformidad del XML VERI\*FACTU (#156, Fase 4) más allá de las aserciones de
//! estructura/orden que ya viven en `aeat::xml` (unit tests). Aquí se comprueba lo que
//! de verdad rechazaría la AEAT y que los tests de subcadena no cubren:
//!
//!  1. **Buena formación**: el sobre completo se parsea con `quick-xml` sin error
//!     (etiquetas balanceadas, escapado correcto), no solo `contains(...)`.
//!  2. **Consistencia de la huella**: el `<Huella>` emitido en el XML se RECOMPUTA a
//!     partir de los propios campos del XML (los mismos que la AEAT rehashea) y debe
//!     coincidir. Esto detecta cualquier deriva entre lo que se hashea y lo que se
//!     serializa (un cambio de formato/orden de campo haría que la AEAT calculara otra
//!     huella y rechazara el registro).
//!
//! NOTA: esto NO sustituye la validación contra el XSD oficial `tikeV1.0`
//! (`SuministroLR.xsd`/`SuministroInformacion.xsd`). Esa validación byte-a-byte exige
//! `xmllint` + los XSD oficiales y se ejecuta en CI; el algoritmo de la huella ya está
//! verificado contra los vectores oficiales en `hash.rs`.

use quick_xml::events::Event;
use quick_xml::Reader;
use rust_decimal::Decimal;
use serde_json::json;
use simpletpv_domain::verifactu::aeat::{
    build_envelope, registro_alta_xml, registro_anulacion_xml, registro_factura_wrap,
    Encadenamiento, Persona, SistemaInformatico,
};
use simpletpv_domain::verifactu::hash::{
    compute_alta_hash, compute_anulacion_hash, AltaHashInput, AnulacionHashInput,
};

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

fn dec(s: &str) -> Decimal {
    s.parse().unwrap()
}

/// Recorre el XML y devuelve `(parentElement, element, texto)` por cada nodo de texto,
/// comparando por nombre local (ignora prefijos). El padre desambigua elementos con el
/// mismo nombre (p. ej. `Huella` del registro vs. `Huella` de `RegistroAnterior`).
fn collect(xml: &str) -> Vec<(String, String, String)> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut stack: Vec<String> = Vec::new();
    let mut out = Vec::new();
    loop {
        match reader.read_event().expect("XML bien formado") {
            Event::Start(e) => {
                stack.push(String::from_utf8_lossy(e.local_name().into_inner()).into_owned());
            }
            Event::Text(e) => {
                let text = e.xml10_content().unwrap().into_owned();
                if text.is_empty() {
                    continue;
                }
                let elem = stack.last().cloned().unwrap_or_default();
                let parent = stack.iter().rev().nth(1).cloned().unwrap_or_default();
                out.push((parent, elem, text));
            }
            Event::End(_) => {
                stack.pop();
            }
            Event::Eof => break,
            _ => {}
        }
    }
    out
}

/// Primer valor cuyo `(parent, element)` coincide.
fn get<'a>(items: &'a [(String, String, String)], parent: &str, elem: &str) -> Option<&'a str> {
    items
        .iter()
        .find(|(p, e, _)| p == parent && e == elem)
        .map(|(_, _, v)| v.as_str())
}

/// Cuenta los elementos `Start` con ese nombre local.
fn count_elem(xml: &str, local: &str) -> usize {
    let mut reader = Reader::from_str(xml);
    let mut n = 0;
    loop {
        match reader.read_event().expect("XML bien formado") {
            Event::Start(e) | Event::Empty(e) => {
                if e.local_name().into_inner() == local.as_bytes() {
                    n += 1;
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    n
}

fn payload_alta(
    serie: &str,
    tipo: &str,
    cuota: &str,
    importe: &str,
    huella: &str,
) -> serde_json::Value {
    json!({
        "idEmisorFactura": "B12345678",
        "numSerieFactura": serie,
        "fechaExpedicionFactura": "02-06-2026",
        "tipoFactura": tipo,
        "cuotaTotal": cuota,
        "importeTotal": importe,
        "fechaHoraHusoGenRegistro": "2026-06-02T14:05:00+02:00",
        "huella": huella,
        "desglose": [{
            "impuesto": "01",
            "tipoImpositivo": "21.00",
            "baseImponibleOimporteNoSujeto": "44.55",
            "cuotaRepercutida": "9.35"
        }]
    })
}

#[test]
fn sobre_completo_es_xml_bien_formado() {
    // Alta F1 + alta F2 + rectificativa R5 + anulación en un único sobre.
    let f1 = payload_alta("T01-000001", "F1", "9.35", "53.90", "A".repeat(64).as_str());
    let mut f1 = f1;
    f1["destinatario"] = json!({"nif": "B87654321", "nombreRazon": "Cliente SA"});
    let f2 = payload_alta("T01-000002", "F2", "9.35", "53.90", "B".repeat(64).as_str());
    let r5 = payload_alta(
        "T01-000003",
        "R5",
        "-9.35",
        "-53.90",
        "C".repeat(64).as_str(),
    );
    let anul = json!({
        "idEmisorFacturaAnulada": "B12345678",
        "numSerieFacturaAnulada": "T01-000002",
        "fechaExpedicionFacturaAnulada": "02-06-2026",
        "fechaHoraHusoGenRegistro": "2026-06-03T10:00:00+02:00",
        "huella": "D".repeat(64)
    });

    let registros = vec![
        registro_factura_wrap(&registro_alta_xml(
            &f1,
            "Venta",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "Comercio Verde SL",
        )),
        registro_factura_wrap(&registro_alta_xml(
            &f2,
            "Venta",
            false,
            false,
            &Encadenamiento::Anterior {
                id_emisor: "B12345678".into(),
                num_serie: "T01-000001".into(),
                fecha_exp: "02-06-2026".into(),
                huella: "A".repeat(64),
            },
            &sis(),
            "Comercio Verde SL",
        )),
        registro_factura_wrap(&registro_alta_xml(
            &r5,
            "Abono",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "Comercio Verde SL",
        )),
        registro_factura_wrap(&registro_anulacion_xml(
            &anul,
            false,
            &Encadenamiento::Primero,
            &sis(),
        )),
    ];
    let envelope = build_envelope(
        &Persona {
            nombre_razon: "Comercio Verde SL".into(),
            nif: "B12345678".into(),
        },
        None,
        &registros,
    );

    // `collect` parsea el sobre entero: si estuviera mal formado, haría panic.
    let _ = collect(&envelope);
    assert_eq!(count_elem(&envelope, "RegistroFactura"), 4);
    assert_eq!(count_elem(&envelope, "RegistroAlta"), 3);
    assert_eq!(count_elem(&envelope, "RegistroAnulacion"), 1);
}

#[test]
fn huella_alta_se_recomputa_desde_el_xml() {
    // Huella de un primer registro, calculada con la función oficial.
    let input = AltaHashInput {
        id_emisor: "B12345678",
        num_serie: "T01-000042",
        fecha_expedicion: "02-06-2026",
        tipo_factura: "F2",
        cuota_total: dec("9.35"),
        importe_total: dec("53.90"),
        fecha_hora_huso_gen: "2026-06-02T14:05:00+02:00",
    };
    let huella = compute_alta_hash(&input, None);

    let payload = payload_alta("T01-000042", "F2", "9.35", "53.90", &huella);
    let xml = registro_alta_xml(
        &payload,
        "Venta",
        false,
        false,
        &Encadenamiento::Primero,
        &sis(),
        "Comercio Verde SL",
    );
    let items = collect(&xml);

    // El `<Huella>` del registro (hijo directo de RegistroAlta) es el emitido.
    assert_eq!(get(&items, "RegistroAlta", "Huella"), Some(huella.as_str()));

    // Recompone la entrada desde los CAMPOS DEL XML y rehashea (como hará la AEAT).
    let recomputada = compute_alta_hash(
        &AltaHashInput {
            id_emisor: get(&items, "IDFactura", "IDEmisorFactura").unwrap(),
            num_serie: get(&items, "IDFactura", "NumSerieFactura").unwrap(),
            fecha_expedicion: get(&items, "IDFactura", "FechaExpedicionFactura").unwrap(),
            tipo_factura: get(&items, "RegistroAlta", "TipoFactura").unwrap(),
            cuota_total: dec(get(&items, "RegistroAlta", "CuotaTotal").unwrap()),
            importe_total: dec(get(&items, "RegistroAlta", "ImporteTotal").unwrap()),
            fecha_hora_huso_gen: get(&items, "RegistroAlta", "FechaHoraHusoGenRegistro").unwrap(),
        },
        None,
    );
    assert_eq!(
        recomputada, huella,
        "el XML debe portar exactamente los campos hasheados"
    );
}

#[test]
fn huella_alta_encadenada_recomputa_con_huella_anterior() {
    let previa = "A".repeat(64);
    let input = AltaHashInput {
        id_emisor: "B12345678",
        num_serie: "T01-000043",
        fecha_expedicion: "02-06-2026",
        tipo_factura: "F2",
        cuota_total: dec("9.35"),
        importe_total: dec("53.90"),
        fecha_hora_huso_gen: "2026-06-02T14:06:00+02:00",
    };
    let huella = compute_alta_hash(&input, Some(&previa));

    let payload = json!({
        "idEmisorFactura": "B12345678",
        "numSerieFactura": "T01-000043",
        "fechaExpedicionFactura": "02-06-2026",
        "tipoFactura": "F2",
        "cuotaTotal": "9.35",
        "importeTotal": "53.90",
        "fechaHoraHusoGenRegistro": "2026-06-02T14:06:00+02:00",
        "huella": huella,
        "desglose": [{"impuesto":"01","tipoImpositivo":"21.00","baseImponibleOimporteNoSujeto":"44.55","cuotaRepercutida":"9.35"}]
    });
    let xml = registro_alta_xml(
        &payload,
        "Venta",
        false,
        false,
        &Encadenamiento::Anterior {
            id_emisor: "B12345678".into(),
            num_serie: "T01-000042".into(),
            fecha_exp: "02-06-2026".into(),
            huella: previa.clone(),
        },
        &sis(),
        "Comercio Verde SL",
    );
    let items = collect(&xml);

    // La huella previa viaja dentro de RegistroAnterior; la del registro, en RegistroAlta.
    assert_eq!(
        get(&items, "RegistroAnterior", "Huella"),
        Some(previa.as_str())
    );
    assert_eq!(get(&items, "RegistroAlta", "Huella"), Some(huella.as_str()));

    let recomputada = compute_alta_hash(
        &AltaHashInput {
            id_emisor: get(&items, "IDFactura", "IDEmisorFactura").unwrap(),
            num_serie: get(&items, "IDFactura", "NumSerieFactura").unwrap(),
            fecha_expedicion: get(&items, "IDFactura", "FechaExpedicionFactura").unwrap(),
            tipo_factura: get(&items, "RegistroAlta", "TipoFactura").unwrap(),
            cuota_total: dec(get(&items, "RegistroAlta", "CuotaTotal").unwrap()),
            importe_total: dec(get(&items, "RegistroAlta", "ImporteTotal").unwrap()),
            fecha_hora_huso_gen: get(&items, "RegistroAlta", "FechaHoraHusoGenRegistro").unwrap(),
        },
        get(&items, "RegistroAnterior", "Huella"),
    );
    assert_eq!(recomputada, huella);
}

#[test]
fn huella_anulacion_se_recomputa_desde_el_xml() {
    let previa = "B".repeat(64);
    let input = AnulacionHashInput {
        id_emisor: "B12345678",
        num_serie: "T01-000042",
        fecha_expedicion: "02-06-2026",
        fecha_hora_huso_gen: "2026-06-03T10:00:00+02:00",
    };
    let huella = compute_anulacion_hash(&input, Some(&previa));

    let payload = json!({
        "idEmisorFacturaAnulada": "B12345678",
        "numSerieFacturaAnulada": "T01-000042",
        "fechaExpedicionFacturaAnulada": "02-06-2026",
        "fechaHoraHusoGenRegistro": "2026-06-03T10:00:00+02:00",
        "huella": huella
    });
    let xml = registro_anulacion_xml(
        &payload,
        false,
        &Encadenamiento::Anterior {
            id_emisor: "B12345678".into(),
            num_serie: "T01-000041".into(),
            fecha_exp: "02-06-2026".into(),
            huella: previa.clone(),
        },
        &sis(),
    );
    let items = collect(&xml);

    assert_eq!(
        get(&items, "RegistroAnulacion", "Huella"),
        Some(huella.as_str())
    );
    let recomputada = compute_anulacion_hash(
        &AnulacionHashInput {
            id_emisor: get(&items, "IDFactura", "IDEmisorFacturaAnulada").unwrap(),
            num_serie: get(&items, "IDFactura", "NumSerieFacturaAnulada").unwrap(),
            fecha_expedicion: get(&items, "IDFactura", "FechaExpedicionFacturaAnulada").unwrap(),
            fecha_hora_huso_gen: get(&items, "RegistroAnulacion", "FechaHoraHusoGenRegistro")
                .unwrap(),
        },
        get(&items, "RegistroAnterior", "Huella"),
    );
    assert_eq!(recomputada, huella);
}
