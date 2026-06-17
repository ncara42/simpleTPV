//! Cierre Z (#124, Fase 4): arqueo fiscal diario por tienda. Informe de central
//! (ADMIN/MANAGER); el cálculo (dominio puro) reusa el desglose de IVA del ticket.

pub mod domain;
pub mod model;
pub mod service;

pub use model::ZReport;
pub use service::get_z_report;
