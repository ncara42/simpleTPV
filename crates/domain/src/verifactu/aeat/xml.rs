//! Serialización del XML VERI\*FACTU conforme a los XSD OFICIALES `tikeV1.0`
//! (`SuministroInformacion.xsd` / `SuministroLR.xsd`, descargados verbatim del
//! portal de desarrolladores de la AEAT). Funciones PURAS: construyen el envoltorio
//! SOAP `RegFactuSistemaFacturacion` a partir del `payload` JSONB ya almacenado en
//! cada `VerifactuRecord` (mismos valores que entraron en la huella → la AEAT
//! recomputa la misma huella) más el bloque `SistemaInformatico` del fabricante y
//! la cabecera del obligado.
//!
//! Reglas tomadas del XSD (ver `docs/.../verifactu` y los tests):
//!  - `elementFormDefault="qualified"` en ambos esquemas → TODO elemento lleva
//!    prefijo: `sfLR:` (envoltorio: RegFactuSistemaFacturacion, Cabecera,
//!    RegistroFactura) y `sf:` (resto, definido en SuministroInformacion).
//!  - `fecha` = `DD-MM-AAAA`; `TipoHuella` = `01` (SHA-256); `Huella` ≤ 64.
//!  - `DescripcionOperacion` es OBLIGATORIO. `Destinatarios` solo en F1.
//!  - En VERI\*FACTU `ds:Signature` es opcional y NO se incluye (sin XAdES).

use serde_json::Value;

/// Namespace SOAP 1.1.
pub const NS_SOAP: &str = "http://schemas.xmlsoap.org/soap/envelope/";
/// Namespace del esquema de operaciones (SuministroLR.xsd).
pub const NS_LR: &str = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
/// Namespace del esquema de tipos comunes (SuministroInformacion.xsd).
pub const NS_SF: &str = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

/// Bloque `SistemaInformatico` del productor del SIF (constantes del fabricante).
/// Las longitudes máximas del XSD: NombreSistemaInformatico≤30, IdSistemaInformatico≤2,
/// Version≤50, NumeroInstalacion≤100.
#[derive(Debug, Clone)]
pub struct SistemaInformatico {
    pub nombre_razon: String,
    pub nif: String,
    pub nombre_sistema: String,
    pub id_sistema: String,
    pub version: String,
    pub numero_instalacion: String,
    pub solo_verifactu: bool,
    pub multi_ot: bool,
    pub indicador_multi_ot: bool,
}

/// Persona física/jurídica (NombreRazon + NIF): obligado, representante, destinatario.
#[derive(Debug, Clone)]
pub struct Persona {
    pub nombre_razon: String,
    pub nif: String,
}

/// Encadenamiento de la cadena de huellas del tenant.
#[derive(Debug, Clone)]
pub enum Encadenamiento {
    /// Primer registro de la cadena (`<PrimerRegistro>S</PrimerRegistro>`).
    Primero,
    /// Referencia al registro anterior (su IDFactura + huella).
    Anterior {
        id_emisor: String,
        num_serie: String,
        fecha_exp: String,
        huella: String,
    },
}

/// Escapa texto para nodo XML (`&`, `<`, `>`). Los valores fiscales no llevan
/// comillas en posición de atributo, así que basta con estos tres.
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// `<sf:Name>valor</sf:Name>` con el valor escapado.
fn el(out: &mut String, name: &str, value: &str) {
    out.push_str("<sf:");
    out.push_str(name);
    out.push('>');
    out.push_str(&esc(value));
    out.push_str("</sf:");
    out.push_str(name);
    out.push('>');
}

fn p<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

fn sino(b: bool) -> &'static str {
    if b {
        "S"
    } else {
        "N"
    }
}

fn sistema_informatico_xml(out: &mut String, s: &SistemaInformatico) {
    out.push_str("<sf:SistemaInformatico>");
    el(out, "NombreRazon", &s.nombre_razon);
    el(out, "NIF", &s.nif);
    el(out, "NombreSistemaInformatico", &s.nombre_sistema);
    el(out, "IdSistemaInformatico", &s.id_sistema);
    el(out, "Version", &s.version);
    el(out, "NumeroInstalacion", &s.numero_instalacion);
    el(out, "TipoUsoPosibleSoloVerifactu", sino(s.solo_verifactu));
    el(out, "TipoUsoPosibleMultiOT", sino(s.multi_ot));
    el(out, "IndicadorMultiplesOT", sino(s.indicador_multi_ot));
    out.push_str("</sf:SistemaInformatico>");
}

fn encadenamiento_xml(out: &mut String, enc: &Encadenamiento) {
    out.push_str("<sf:Encadenamiento>");
    match enc {
        Encadenamiento::Primero => el(out, "PrimerRegistro", "S"),
        Encadenamiento::Anterior {
            id_emisor,
            num_serie,
            fecha_exp,
            huella,
        } => {
            out.push_str("<sf:RegistroAnterior>");
            el(out, "IDEmisorFactura", id_emisor);
            el(out, "NumSerieFactura", num_serie);
            el(out, "FechaExpedicionFactura", fecha_exp);
            el(out, "Huella", huella);
            out.push_str("</sf:RegistroAnterior>");
        }
    }
    out.push_str("</sf:Encadenamiento>");
}

/// `<sf:RegistroAlta>` (factura/ticket `F1`/`F2` o rectificativa `R*`) desde el
/// payload del registro. `descripcion` es el texto obligatorio `DescripcionOperacion`.
pub fn registro_alta_xml(
    payload: &Value,
    descripcion: &str,
    subsanacion: bool,
    rechazo_previo: bool,
    enc: &Encadenamiento,
    sis: &SistemaInformatico,
    nombre_razon_emisor: &str,
) -> String {
    let tipo = p(payload, "tipoFactura");
    let mut out = String::with_capacity(2048);
    out.push_str("<sf:RegistroAlta>");
    el(&mut out, "IDVersion", "1.0");
    out.push_str("<sf:IDFactura>");
    el(&mut out, "IDEmisorFactura", p(payload, "idEmisorFactura"));
    el(&mut out, "NumSerieFactura", p(payload, "numSerieFactura"));
    el(
        &mut out,
        "FechaExpedicionFactura",
        p(payload, "fechaExpedicionFactura"),
    );
    out.push_str("</sf:IDFactura>");
    el(&mut out, "NombreRazonEmisor", nombre_razon_emisor);
    if subsanacion {
        el(&mut out, "Subsanacion", "S");
    }
    if rechazo_previo {
        el(&mut out, "RechazoPrevio", "S");
    }
    el(&mut out, "TipoFactura", tipo);
    // Rectificativas (R1..R5): por diferencias ("I") — los importes ya van en
    // negativo (abono). Pendiente de validar en preproducción si FacturasRectificadas
    // es exigible para el caso de ticket simplificado.
    if tipo.starts_with('R') {
        el(&mut out, "TipoRectificativa", "I");
    }
    el(&mut out, "DescripcionOperacion", descripcion);
    // Destinatarios solo en factura completa F1 (payload.destinatario presente).
    if let Some(dest) = payload.get("destinatario") {
        out.push_str("<sf:Destinatarios><sf:IDDestinatario>");
        el(
            &mut out,
            "NombreRazon",
            dest.get("nombreRazon")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        );
        el(
            &mut out,
            "NIF",
            dest.get("nif").and_then(|v| v.as_str()).unwrap_or(""),
        );
        out.push_str("</sf:IDDestinatario></sf:Destinatarios>");
    }
    // Desglose de IVA (1..12 DetalleDesglose). Valores verbatim del payload (los
    // mismos que entraron en la huella).
    out.push_str("<sf:Desglose>");
    if let Some(arr) = payload.get("desglose").and_then(|v| v.as_array()) {
        for d in arr {
            out.push_str("<sf:DetalleDesglose>");
            el(
                &mut out,
                "Impuesto",
                d.get("impuesto").and_then(|v| v.as_str()).unwrap_or("01"),
            );
            el(&mut out, "ClaveRegimen", "01");
            el(&mut out, "CalificacionOperacion", "S1");
            el(
                &mut out,
                "TipoImpositivo",
                d.get("tipoImpositivo")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            el(
                &mut out,
                "BaseImponibleOimporteNoSujeto",
                d.get("baseImponibleOimporteNoSujeto")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            el(
                &mut out,
                "CuotaRepercutida",
                d.get("cuotaRepercutida")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            out.push_str("</sf:DetalleDesglose>");
        }
    }
    out.push_str("</sf:Desglose>");
    el(&mut out, "CuotaTotal", p(payload, "cuotaTotal"));
    el(&mut out, "ImporteTotal", p(payload, "importeTotal"));
    encadenamiento_xml(&mut out, enc);
    sistema_informatico_xml(&mut out, sis);
    el(
        &mut out,
        "FechaHoraHusoGenRegistro",
        p(payload, "fechaHoraHusoGenRegistro"),
    );
    el(&mut out, "TipoHuella", "01");
    el(&mut out, "Huella", p(payload, "huella"));
    out.push_str("</sf:RegistroAlta>");
    out
}

/// `<sf:RegistroAnulacion>` desde el payload de un registro de anulación.
pub fn registro_anulacion_xml(
    payload: &Value,
    rechazo_previo: bool,
    enc: &Encadenamiento,
    sis: &SistemaInformatico,
) -> String {
    let mut out = String::with_capacity(1024);
    out.push_str("<sf:RegistroAnulacion>");
    el(&mut out, "IDVersion", "1.0");
    out.push_str("<sf:IDFactura>");
    el(
        &mut out,
        "IDEmisorFactura",
        p(payload, "idEmisorFacturaAnulada"),
    );
    el(
        &mut out,
        "NumSerieFactura",
        p(payload, "numSerieFacturaAnulada"),
    );
    el(
        &mut out,
        "FechaExpedicionFactura",
        p(payload, "fechaExpedicionFacturaAnulada"),
    );
    out.push_str("</sf:IDFactura>");
    if rechazo_previo {
        el(&mut out, "RechazoPrevio", "S");
    }
    encadenamiento_xml(&mut out, enc);
    sistema_informatico_xml(&mut out, sis);
    el(
        &mut out,
        "FechaHoraHusoGenRegistro",
        p(payload, "fechaHoraHusoGenRegistro"),
    );
    el(&mut out, "TipoHuella", "01");
    el(&mut out, "Huella", p(payload, "huella"));
    out.push_str("</sf:RegistroAnulacion>");
    out
}

/// Envuelve un registro (`<sf:RegistroAlta>`/`<sf:RegistroAnulacion>` ya serializado)
/// en `<sfLR:RegistroFactura>`.
pub fn registro_factura_wrap(registro_xml: &str) -> String {
    format!("<sfLR:RegistroFactura>{registro_xml}</sfLR:RegistroFactura>")
}

/// Sobre SOAP completo `RegFactuSistemaFacturacion` con la cabecera del obligado y
/// los `RegistroFactura` ya serializados (1..1000).
pub fn build_envelope(
    obligado: &Persona,
    representante: Option<&Persona>,
    registros_factura: &[String],
) -> String {
    let mut out = String::with_capacity(4096 + registros_factura.len() * 2048);
    out.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    out.push_str(&format!(
        r#"<soapenv:Envelope xmlns:soapenv="{NS_SOAP}" xmlns:sfLR="{NS_LR}" xmlns:sf="{NS_SF}"><soapenv:Body><sfLR:RegFactuSistemaFacturacion><sfLR:Cabecera><sf:ObligadoEmision>"#
    ));
    el(&mut out, "NombreRazon", &obligado.nombre_razon);
    el(&mut out, "NIF", &obligado.nif);
    out.push_str("</sf:ObligadoEmision>");
    if let Some(rep) = representante {
        out.push_str("<sf:Representante>");
        el(&mut out, "NombreRazon", &rep.nombre_razon);
        el(&mut out, "NIF", &rep.nif);
        out.push_str("</sf:Representante>");
    }
    out.push_str("</sfLR:Cabecera>");
    for r in registros_factura {
        out.push_str(r);
    }
    out.push_str("</sfLR:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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

    fn payload_f2() -> Value {
        json!({
            "idEmisorFactura": "B12345678",
            "numSerieFactura": "T01-000042",
            "fechaExpedicionFactura": "02-06-2026",
            "tipoFactura": "F2",
            "cuotaTotal": "9.35",
            "importeTotal": "53.90",
            "fechaHoraHusoGenRegistro": "2026-06-02T14:05:00+02:00",
            "huellaAnterior": null,
            "huella": "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
            "desglose": [{
                "impuesto": "01",
                "tipoImpositivo": "21.00",
                "baseImponibleOimporteNoSujeto": "44.55",
                "cuotaRepercutida": "9.35"
            }]
        })
    }

    #[test]
    fn alta_f2_estructura_y_orden_oficial() {
        let xml = registro_alta_xml(
            &payload_f2(),
            "Venta",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "Comercio Verde SL",
        );
        // Elementos clave presentes.
        assert!(xml.contains("<sf:IDVersion>1.0</sf:IDVersion>"));
        assert!(xml.contains("<sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>"));
        assert!(xml.contains("<sf:TipoFactura>F2</sf:TipoFactura>"));
        assert!(xml.contains("<sf:DescripcionOperacion>Venta</sf:DescripcionOperacion>"));
        assert!(xml.contains("<sf:TipoHuella>01</sf:TipoHuella>"));
        assert!(xml.contains("<sf:PrimerRegistro>S</sf:PrimerRegistro>"));
        assert!(xml.contains("<sf:CuotaRepercutida>9.35</sf:CuotaRepercutida>"));
        assert!(xml.contains("<sf:CalificacionOperacion>S1</sf:CalificacionOperacion>"));
        // F2 (simplificada) NO lleva Destinatarios.
        assert!(!xml.contains("<sf:Destinatarios>"));
        // Orden oficial: IDFactura → NombreRazonEmisor → TipoFactura → DescripcionOperacion
        // → Desglose → CuotaTotal → ImporteTotal → Encadenamiento → SistemaInformatico
        // → FechaHoraHusoGenRegistro → TipoHuella → Huella.
        let idx = |needle: &str| xml.find(needle).unwrap();
        assert!(idx("<sf:IDFactura>") < idx("<sf:NombreRazonEmisor>"));
        assert!(idx("<sf:NombreRazonEmisor>") < idx("<sf:TipoFactura>"));
        assert!(idx("<sf:TipoFactura>") < idx("<sf:DescripcionOperacion>"));
        assert!(idx("<sf:DescripcionOperacion>") < idx("<sf:Desglose>"));
        assert!(idx("<sf:Desglose>") < idx("<sf:CuotaTotal>"));
        assert!(idx("<sf:CuotaTotal>") < idx("<sf:ImporteTotal>"));
        assert!(idx("<sf:ImporteTotal>") < idx("<sf:Encadenamiento>"));
        assert!(idx("<sf:Encadenamiento>") < idx("<sf:SistemaInformatico>"));
        assert!(idx("<sf:SistemaInformatico>") < idx("<sf:FechaHoraHusoGenRegistro>"));
        assert!(idx("<sf:FechaHoraHusoGenRegistro>") < idx("<sf:TipoHuella>"));
        assert!(idx("<sf:TipoHuella>") < idx("<sf:Huella>"));
    }

    #[test]
    fn alta_f1_incluye_destinatario() {
        let mut payload = payload_f2();
        payload["tipoFactura"] = json!("F1");
        payload["destinatario"] = json!({"nif": "B87654321", "nombreRazon": "Cliente SA"});
        let xml = registro_alta_xml(
            &payload,
            "Venta",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "Comercio Verde SL",
        );
        assert!(xml.contains("<sf:Destinatarios><sf:IDDestinatario>"));
        assert!(xml.contains("<sf:NombreRazon>Cliente SA</sf:NombreRazon>"));
        assert!(xml.contains("<sf:NIF>B87654321</sf:NIF>"));
        assert!(xml.contains("<sf:TipoFactura>F1</sf:TipoFactura>"));
        // Destinatarios va DESPUÉS de DescripcionOperacion y ANTES de Desglose.
        let idx = |needle: &str| xml.find(needle).unwrap();
        assert!(idx("<sf:DescripcionOperacion>") < idx("<sf:Destinatarios>"));
        assert!(idx("<sf:Destinatarios>") < idx("<sf:Desglose>"));
    }

    #[test]
    fn rectificativa_lleva_tipo_rectificativa() {
        let mut payload = payload_f2();
        payload["tipoFactura"] = json!("R5");
        payload["importeTotal"] = json!("-53.90");
        let xml = registro_alta_xml(
            &payload,
            "Abono",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "Comercio Verde SL",
        );
        assert!(xml.contains("<sf:TipoFactura>R5</sf:TipoFactura>"));
        assert!(xml.contains("<sf:TipoRectificativa>I</sf:TipoRectificativa>"));
        assert!(xml.contains("<sf:ImporteTotal>-53.90</sf:ImporteTotal>"));
    }

    #[test]
    fn alta_con_registro_anterior() {
        let xml = registro_alta_xml(
            &payload_f2(),
            "Venta",
            false,
            false,
            &Encadenamiento::Anterior {
                id_emisor: "B12345678".into(),
                num_serie: "T01-000041".into(),
                fecha_exp: "02-06-2026".into(),
                huella: "PREVHASH".into(),
            },
            &sis(),
            "Comercio Verde SL",
        );
        assert!(xml.contains("<sf:RegistroAnterior>"));
        assert!(xml.contains("<sf:Huella>PREVHASH</sf:Huella>"));
        assert!(!xml.contains("<sf:PrimerRegistro>"));
    }

    #[test]
    fn anulacion_estructura() {
        let payload = json!({
            "idEmisorFacturaAnulada": "B12345678",
            "numSerieFacturaAnulada": "T01-000042",
            "fechaExpedicionFacturaAnulada": "02-06-2026",
            "fechaHoraHusoGenRegistro": "2026-06-03T10:00:00+02:00",
            "huella": "ANULHASH"
        });
        let xml = registro_anulacion_xml(&payload, false, &Encadenamiento::Primero, &sis());
        assert!(xml.contains("<sf:RegistroAnulacion>"));
        assert!(xml.contains("<sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>"));
        // La anulación NO lleva NombreRazonEmisor ni Desglose.
        assert!(!xml.contains("<sf:NombreRazonEmisor>"));
        assert!(!xml.contains("<sf:Desglose>"));
    }

    #[test]
    fn envelope_namespaces_y_cabecera() {
        let alta = registro_alta_xml(
            &payload_f2(),
            "Venta",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "Comercio Verde SL",
        );
        let env = build_envelope(
            &Persona {
                nombre_razon: "Comercio Verde SL".into(),
                nif: "B12345678".into(),
            },
            None,
            &[registro_factura_wrap(&alta)],
        );
        assert!(env.contains(&format!("xmlns:soapenv=\"{NS_SOAP}\"")));
        assert!(env.contains(&format!("xmlns:sfLR=\"{NS_LR}\"")));
        assert!(env.contains(&format!("xmlns:sf=\"{NS_SF}\"")));
        assert!(env.contains("<sfLR:RegFactuSistemaFacturacion>"));
        assert!(env.contains("<sfLR:Cabecera><sf:ObligadoEmision>"));
        assert!(env.contains("<sfLR:RegistroFactura><sf:RegistroAlta>"));
    }

    #[test]
    fn escapa_caracteres_xml() {
        let mut payload = payload_f2();
        payload["numSerieFactura"] = json!("A&B<C>");
        let xml = registro_alta_xml(
            &payload,
            "Venta",
            false,
            false,
            &Encadenamiento::Primero,
            &sis(),
            "R&D SL",
        );
        assert!(xml.contains("A&amp;B&lt;C&gt;"));
        assert!(xml.contains("<sf:NombreRazonEmisor>R&amp;D SL</sf:NombreRazonEmisor>"));
    }
}
