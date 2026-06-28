//! VeriFactu (#155): huella SHA-256 encadenada + registro de facturas (ventas),
//! rectificativos (devoluciones) y anulaciones (ventas VOIDED, #230), dentro de la
//! tx que opera. El envío a la AEAT (cola/reintentos) vive en `queue`.

pub mod aeat;
pub mod cert;
pub mod config;
pub mod hash;
pub mod queue;
pub mod record;
pub mod verify;

pub use cert::{status as cert_status, store_certificate, CertStatus};
pub use config::{VerifactuConfig, VerifactuConfigInput};
pub use verify::{verify_chain, ChainReport};
pub use hash::{
    build_qr_data, compute_alta_hash, compute_anulacion_hash, AltaHashInput, AnulacionHashInput,
};
pub use queue::{process_pending_batch, SandboxProvider, VerifactuProvider};
pub use record::{record_anulacion, record_invoice, record_rectification};
