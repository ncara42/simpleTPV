//! Tiendas (#153, Fase 3): CRUD (ADMIN), estado operativo y central, y overrides
//! de precio por tienda (ADMIN/MANAGER).

pub mod input;
pub mod model;
pub mod service;

pub use input::{
    CreateStore, ImportStorePrices, MarkCentral, SetStorePrice, UpdateStore, UpdateStoreOps,
};
pub use model::{Store, StorePriceItem};
