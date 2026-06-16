//! Capa de datos sobre SQLx (doc 04). Punto único donde se fija el tenant para
//! RLS — un solo sitio que auditar (doc 02 §3).

pub mod error;
pub mod pool;
pub mod tenant;

pub use error::classify;
pub use pool::build_pool;
pub use tenant::{with_tenant_tx, AfterCommit};
