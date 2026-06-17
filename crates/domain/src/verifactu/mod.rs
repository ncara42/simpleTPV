//! VeriFactu (#155): huella SHA-256 encadenada + registro de facturas (ventas) y
//! rectificativos (devoluciones), dentro de la tx que factura. El envío a la AEAT
//! (cola/reintentos) llega en el siguiente slice.

pub mod hash;
pub mod record;

pub use hash::{build_qr_data, compute_hash, VerifactuPayload};
pub use record::{record_invoice, record_rectification};
