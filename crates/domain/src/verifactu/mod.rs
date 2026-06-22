//! VeriFactu (#155): huella SHA-256 encadenada + registro de facturas (ventas) y
//! rectificativos (devoluciones), dentro de la tx que factura. El envío a la AEAT
//! (cola/reintentos) llega en el siguiente slice.

pub mod hash;
pub mod queue;
pub mod record;

pub use hash::{
    build_qr_data, compute_alta_hash, compute_anulacion_hash, AltaHashInput, AnulacionHashInput,
};
pub use queue::{process_pending_batch, SandboxProvider, VerifactuProvider};
pub use record::{record_invoice, record_rectification};
