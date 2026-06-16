//! Tipos transversales del backend: configuración y errores de aplicación.
//!
//! No conoce ni Axum ni SQLx (inversión de dependencias, doc 02 §3): las capas
//! superiores dependen de `shared`, nunca al revés.

pub mod config;
pub mod error;
pub mod limits;

pub use config::AppConfig;
pub use error::AppError;
