//! VeriFactu (mínimo, #152): huella SHA-256 encadenada + registro rectificativo
//! de devoluciones. El subsistema completo (colas, envío AEAT, reintentos) va en
//! Fase 5 (#155).

pub mod hash;
pub mod record;

pub use hash::{build_qr_data, compute_hash, VerifactuPayload};
pub use record::record_rectification;
