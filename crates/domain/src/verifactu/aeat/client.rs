//! Transporte SOAP 1.1 sobre **mTLS** hacia el servicio web VERI\*FACTU de la AEAT
//! (#156, Fase 4). Usa `reqwest` con `rustls` e **identidad de cliente en PEM**
//! (certificado + clave concatenados). En modo `COLLAB_SOCIAL` la identidad es el
//! certificado único del fabricante (env); en `DIRECT_OWN_CERT`, el del comercio
//! (descifrado de la BD). No se firma con XAdES (VERI\*FACTU exime).
//!
//! Endpoints OFICIALES (del WSDL `SistemaFacturacion.wsdl`, puerto `sfVerifactu`):
//! producción `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
//! y preproducción `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`.
//! El `soapAction` es vacío y el `Content-Type` es `text/xml; charset=utf-8`.

use std::time::Duration;

/// Entorno del servicio web de la AEAT.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AeatEndpoint {
    Preprod,
    Prod,
}

impl AeatEndpoint {
    /// URL del endpoint `VerifactuSOAP` (puerto `www1`/`prewww1`).
    pub fn url(self) -> &'static str {
        match self {
            AeatEndpoint::Prod => {
                "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
            }
            AeatEndpoint::Preprod => {
                "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
            }
        }
    }

    /// Mapea el valor de configuración (`preprod`/`prod`) al endpoint.
    pub fn from_config(env: &str) -> Self {
        if env == "prod" {
            AeatEndpoint::Prod
        } else {
            AeatEndpoint::Preprod
        }
    }
}

/// Error de transporte (no incluye errores de negocio de la AEAT, que van en el XML).
#[derive(Debug)]
pub enum TransportError {
    /// Construcción del cliente / carga de la identidad (certificado).
    Build(String),
    /// Fallo de red / TLS al enviar.
    Network(String),
    /// La AEAT respondió con un estado HTTP no 2xx (puede ser SOAP Fault).
    Status { code: u16, body: String },
    /// No se pudo leer el cuerpo de la respuesta.
    Body(String),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransportError::Build(m) => write!(f, "construcción cliente AEAT: {m}"),
            TransportError::Network(m) => write!(f, "red/TLS AEAT: {m}"),
            TransportError::Status { code, .. } => write!(f, "HTTP {code} de la AEAT"),
            TransportError::Body(m) => write!(f, "cuerpo respuesta AEAT: {m}"),
        }
    }
}
impl std::error::Error for TransportError {}

/// Respuesta cruda del transporte (cuerpo XML para parsear con [`super::response`]).
#[derive(Debug, Clone)]
pub struct TransportResult {
    pub http_status: u16,
    pub body: String,
}

/// Cliente mTLS contra un endpoint de la AEAT.
pub struct AeatClient {
    http: reqwest::Client,
    endpoint: AeatEndpoint,
}

impl AeatClient {
    /// Construye el cliente con la identidad de cliente en PEM (cert + clave privada
    /// concatenados). `timeout_secs` acota cada petición.
    pub fn new(
        identity_pem: &[u8],
        endpoint: AeatEndpoint,
        timeout_secs: u64,
    ) -> Result<Self, TransportError> {
        let identity = reqwest::Identity::from_pem(identity_pem)
            .map_err(|e| TransportError::Build(format!("identidad PEM inválida: {e}")))?;
        let http = reqwest::Client::builder()
            .use_rustls_tls()
            .identity(identity)
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .map_err(|e| TransportError::Build(e.to_string()))?;
        Ok(Self { http, endpoint })
    }

    /// URL del endpoint configurado.
    pub fn endpoint_url(&self) -> &'static str {
        self.endpoint.url()
    }

    /// Envía el sobre SOAP y devuelve el cuerpo de la respuesta. No registra el XML
    /// (datos fiscales) ni la identidad.
    pub async fn send_soap(&self, soap_xml: &str) -> Result<TransportResult, TransportError> {
        let resp = self
            .http
            .post(self.endpoint.url())
            .header("Content-Type", "text/xml; charset=utf-8")
            .header("SOAPAction", "")
            .body(soap_xml.to_owned())
            .send()
            .await
            .map_err(|e| TransportError::Network(e.to_string()))?;
        let code = resp.status().as_u16();
        let body = resp
            .text()
            .await
            .map_err(|e| TransportError::Body(e.to_string()))?;
        // 2xx → cuerpo de negocio; no-2xx con cuerpo (SOAP Fault) → Status para que el
        // worker lo registre y reintente como fallo de transporte.
        if !(200..300).contains(&code) {
            return Err(TransportError::Status { code, body });
        }
        Ok(TransportResult {
            http_status: code,
            body,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_urls_oficiales() {
        assert!(AeatEndpoint::Prod.url().starts_with("https://www1.agenciatributaria.gob.es/"));
        assert!(AeatEndpoint::Preprod.url().starts_with("https://prewww1.aeat.es/"));
        assert_eq!(AeatEndpoint::from_config("prod"), AeatEndpoint::Prod);
        assert_eq!(AeatEndpoint::from_config("preprod"), AeatEndpoint::Preprod);
        assert_eq!(AeatEndpoint::from_config("cualquier-otra"), AeatEndpoint::Preprod);
    }

    #[test]
    fn identidad_pem_invalida_falla() {
        let err = AeatClient::new(b"no soy un pem", AeatEndpoint::Preprod, 30);
        assert!(matches!(err, Err(TransportError::Build(_))));
    }
}
