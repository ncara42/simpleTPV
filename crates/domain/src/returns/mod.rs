//! Módulo de devoluciones: CON ticket (valida vendido−devuelto, repone al lote
//! original) + CIEGA (sin ticket, con PIN/4-ojos y lockout) + listado. El registro
//! VeriFactu rectificativo y el feature flag `blind_returns` llegan después.

pub mod domain;
pub mod input;
pub mod model;
pub mod service;

pub use input::{BlindReturnLine, CreateBlindReturn, CreateReturn, CreateReturnLine};
pub use model::{Return, ReturnLine, ReturnWithLines};
