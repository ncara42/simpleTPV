//! Parseo de la respuesta del servicio web VERI\*FACTU de la AEAT
//! (`RespuestaRegFactuSistemaFacturacion`, esquema `RespuestaSuministro.xsd`).
//! Extrae el estado global del envío, el control de flujo (`TiempoEsperaEnvio`), el
//! CSV (justificante) y el resultado por registro (`RespuestaLinea`): estado,
//! código/descipción de error y si la AEAT lo considera duplicado (ya registrado).
//! Robusto a prefijos de namespace: compara por nombre local.

use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::Reader;

/// Estado por registro devuelto por la AEAT.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EstadoRegistro {
    Correcto,
    AceptadoConErrores,
    Incorrecto,
    #[default]
    Desconocido,
}

impl EstadoRegistro {
    fn parse(s: &str) -> Self {
        match s {
            "Correcto" => Self::Correcto,
            "AceptadoConErrores" => Self::AceptadoConErrores,
            "Incorrecto" => Self::Incorrecto,
            _ => Self::Desconocido,
        }
    }
}

/// Desenlace operativo de un registro (lo que decide el worker).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Aceptado sin errores → SENT.
    Aceptado,
    /// Aceptado con errores subsanables → SENT (con aviso).
    AceptadoConErrores,
    /// Ya estaba registrado (idempotente) → SENT.
    Duplicado,
    /// Rechazado → FAILED (normalmente requiere subsanación).
    Rechazado,
}

/// Resultado por registro (`RespuestaLinea`).
#[derive(Debug, Clone, Default)]
pub struct LineaRespuesta {
    pub num_serie: Option<String>,
    pub estado: EstadoRegistro,
    pub codigo_error: Option<String>,
    pub descripcion_error: Option<String>,
    pub csv: Option<String>,
    pub duplicado: bool,
}

impl LineaRespuesta {
    /// Desenlace operativo a partir del estado/duplicado.
    pub fn outcome(&self) -> Outcome {
        if self.duplicado {
            return Outcome::Duplicado;
        }
        match self.estado {
            EstadoRegistro::Correcto => Outcome::Aceptado,
            EstadoRegistro::AceptadoConErrores => Outcome::AceptadoConErrores,
            EstadoRegistro::Incorrecto | EstadoRegistro::Desconocido => Outcome::Rechazado,
        }
    }
}

/// Respuesta completa de la AEAT a un envío.
#[derive(Debug, Clone, Default)]
pub struct RespuestaAeat {
    /// CSV global del envío (si la AEAT lo emite a nivel de envío).
    pub csv: Option<String>,
    /// `Correcto` | `ParcialmenteCorrecto` | `Incorrecto`.
    pub estado_envio: String,
    /// Segundos a esperar antes del siguiente envío (control de flujo). Inicial 60.
    pub tiempo_espera_envio: Option<i64>,
    /// Resultado por registro, en el orden del envío.
    pub lineas: Vec<LineaRespuesta>,
}

fn local_start(e: &BytesStart) -> String {
    String::from_utf8_lossy(e.local_name().into_inner()).into_owned()
}
fn local_end(e: &BytesEnd) -> String {
    String::from_utf8_lossy(e.local_name().into_inner()).into_owned()
}

/// Parsea el XML de respuesta de la AEAT. Acepta el sobre SOAP completo o solo el
/// cuerpo `RespuestaRegFactuSistemaFacturacion` (compara por nombre local).
pub fn parse_respuesta(xml: &str) -> Result<RespuestaAeat, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut out = RespuestaAeat::default();
    let mut in_linea = false;
    let mut cur: Option<LineaRespuesta> = None;
    let mut last = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = local_start(&e);
                match name.as_str() {
                    "RespuestaLinea" => {
                        in_linea = true;
                        cur = Some(LineaRespuesta::default());
                    }
                    "RegistroDuplicado" if in_linea => {
                        if let Some(l) = cur.as_mut() {
                            l.duplicado = true;
                        }
                    }
                    _ => {}
                }
                last = name;
            }
            Ok(Event::Text(e)) => {
                let text = e.xml10_content().map_err(|x| x.to_string())?.into_owned();
                if text.is_empty() {
                    continue;
                }
                match last.as_str() {
                    "CSV" => {
                        if in_linea {
                            if let Some(l) = cur.as_mut() {
                                l.csv = Some(text);
                            }
                        } else {
                            out.csv = Some(text);
                        }
                    }
                    "EstadoEnvio" if !in_linea => out.estado_envio = text,
                    "TiempoEsperaEnvio" if !in_linea => out.tiempo_espera_envio = text.parse().ok(),
                    "EstadoRegistro" => {
                        if let Some(l) = cur.as_mut() {
                            l.estado = EstadoRegistro::parse(&text);
                        }
                    }
                    "NumSerieFactura" if in_linea => {
                        if let Some(l) = cur.as_mut() {
                            if l.num_serie.is_none() {
                                l.num_serie = Some(text);
                            }
                        }
                    }
                    "CodigoErrorRegistro" => {
                        if let Some(l) = cur.as_mut() {
                            l.codigo_error = Some(text);
                        }
                    }
                    "DescripcionErrorRegistro" => {
                        if let Some(l) = cur.as_mut() {
                            l.descripcion_error = Some(text);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                if local_end(&e) == "RespuestaLinea" {
                    in_linea = false;
                    if let Some(l) = cur.take() {
                        out.lineas.push(l);
                    }
                }
                last.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML de respuesta AEAT inválido: {e}")),
            _ => {}
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OK: &str = r#"<?xml version="1.0"?>
    <env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
     <env:Body>
      <sfR:RespuestaRegFactuSistemaFacturacion xmlns:sfR="urn:r" xmlns:sf="urn:sf">
        <sfR:CSV>CSV-GLOBAL-123</sfR:CSV>
        <sfR:TiempoEsperaEnvio>60</sfR:TiempoEsperaEnvio>
        <sfR:EstadoEnvio>Correcto</sfR:EstadoEnvio>
        <sfR:RespuestaLinea>
          <sf:IDFactura>
            <sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>
            <sf:NumSerieFactura>T01-000042</sf:NumSerieFactura>
            <sf:FechaExpedicionFactura>02-06-2026</sf:FechaExpedicionFactura>
          </sf:IDFactura>
          <sf:Operacion>Alta</sf:Operacion>
          <sfR:EstadoRegistro>Correcto</sfR:EstadoRegistro>
          <sfR:CSV>CSV-LINEA-042</sfR:CSV>
        </sfR:RespuestaLinea>
      </sfR:RespuestaRegFactuSistemaFacturacion>
     </env:Body>
    </env:Envelope>"#;

    const PARCIAL: &str = r#"<RespuestaRegFactuSistemaFacturacion xmlns="urn:r">
        <TiempoEsperaEnvio>120</TiempoEsperaEnvio>
        <EstadoEnvio>ParcialmenteCorrecto</EstadoEnvio>
        <RespuestaLinea>
          <NumSerieFactura>T01-000043</NumSerieFactura>
          <EstadoRegistro>Incorrecto</EstadoRegistro>
          <CodigoErrorRegistro>1102</CodigoErrorRegistro>
          <DescripcionErrorRegistro>NIF no identificado</DescripcionErrorRegistro>
        </RespuestaLinea>
        <RespuestaLinea>
          <NumSerieFactura>T01-000044</NumSerieFactura>
          <EstadoRegistro>Incorrecto</EstadoRegistro>
          <RegistroDuplicado><EstadoRegistroDuplicado>Correcto</EstadoRegistroDuplicado></RegistroDuplicado>
        </RespuestaLinea>
    </RespuestaRegFactuSistemaFacturacion>"#;

    #[test]
    fn parsea_envio_correcto_con_csv_y_tiempo() {
        let r = parse_respuesta(OK).unwrap();
        assert_eq!(r.estado_envio, "Correcto");
        assert_eq!(r.tiempo_espera_envio, Some(60));
        assert_eq!(r.csv.as_deref(), Some("CSV-GLOBAL-123"));
        assert_eq!(r.lineas.len(), 1);
        let l = &r.lineas[0];
        assert_eq!(l.num_serie.as_deref(), Some("T01-000042"));
        assert_eq!(l.estado, EstadoRegistro::Correcto);
        assert_eq!(l.csv.as_deref(), Some("CSV-LINEA-042"));
        assert_eq!(l.outcome(), Outcome::Aceptado);
    }

    #[test]
    fn parsea_parcial_con_error_y_duplicado() {
        let r = parse_respuesta(PARCIAL).unwrap();
        assert_eq!(r.estado_envio, "ParcialmenteCorrecto");
        assert_eq!(r.tiempo_espera_envio, Some(120));
        assert_eq!(r.lineas.len(), 2);
        // Línea 1: rechazada con código.
        assert_eq!(r.lineas[0].estado, EstadoRegistro::Incorrecto);
        assert_eq!(r.lineas[0].codigo_error.as_deref(), Some("1102"));
        assert_eq!(r.lineas[0].outcome(), Outcome::Rechazado);
        // Línea 2: marcada Incorrecto pero con RegistroDuplicado → idempotente.
        assert!(r.lineas[1].duplicado);
        assert_eq!(r.lineas[1].outcome(), Outcome::Duplicado);
    }

    #[test]
    fn xml_invalido_es_error() {
        assert!(parse_respuesta("<a><b></a>").is_err());
    }
}
