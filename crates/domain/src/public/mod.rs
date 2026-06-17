//! API pública (#154, IT-18): stock + precio mayorista, autenticada por API key
//! (sin JWT). Rate limit estricto en la capa HTTP.

pub mod model;
pub mod service;

pub use model::PublicStockItem;
pub use service::stock;
