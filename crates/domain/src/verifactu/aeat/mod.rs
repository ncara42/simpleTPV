//! Cliente del servicio web VERI\*FACTU de la AEAT (#156, Fase 4).
//!
//! - [`xml`]: serializa el envoltorio SOAP `RegFactuSistemaFacturacion` conforme a
//!   los XSD oficiales `tikeV1.0` (funciones puras).
//! - [`response`]: parsea la respuesta de la AEAT (estado, CSV, control de flujo,
//!   resultado por registro).
//! - [`client`]: transporte SOAP 1.1 sobre mTLS (certificado de cliente) + selección
//!   de endpoint (preproducción/producción).
//!
//! - [`crypto`]: cifrado en reposo (AES-256-GCM) del certificado de cliente.
//! - [`worker`]: ORQUESTACIÓN del envío (agrupar PENDING por tenant, encadenamiento,
//!   enviar, actualizar estado y traza).
//!
//! En VERI\*FACTU NO se firma con XAdES: la autenticación es el certificado de
//! transporte (mTLS) + la huella encadenada.

pub mod client;
pub mod crypto;
pub mod response;
pub mod worker;
pub mod xml;

pub use client::{AeatClient, AeatEndpoint, TransportError, TransportResult};
pub use response::{parse_respuesta, EstadoRegistro, LineaRespuesta, Outcome, RespuestaAeat};
pub use worker::{process_aeat_batch, AeatWorkerConfig};
pub use xml::{
    build_envelope, registro_alta_xml, registro_anulacion_xml, registro_factura_wrap,
    Encadenamiento, Persona, SistemaInformatico,
};
