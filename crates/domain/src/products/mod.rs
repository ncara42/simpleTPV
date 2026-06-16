//! Módulo de catálogo (`products`): modelo, entradas y servicio.

pub mod input;
pub mod model;
pub mod service;

pub use input::{NewProduct, ProductPatch};
pub use model::{Product, SaleUnit};
