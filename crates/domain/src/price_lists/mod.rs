//! Tarifas B2B (#154, Fase 4, IT-17): listas de precios y sus precios por
//! producto. CRUD de central (ADMIN/MANAGER); `create` gatea el módulo `b2b`.

pub mod input;
pub mod model;
pub mod service;

pub use input::{CreatePriceList, SetPriceListItem, UpdatePriceList};
pub use model::{PriceList, PriceListDetail, PriceListItem, PriceListSummary};
