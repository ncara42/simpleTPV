//! Módulo de stock (inventario + lotes/FEFO): dominio puro, modelos, entradas y
//! servicio. Las operaciones `apply_*` son la primitiva atómica reutilizada por
//! ventas/devoluciones/traspasos en fases posteriores.

pub mod domain;
pub mod input;
pub mod model;
pub mod service;

pub use domain::{ExpiryStatus, StockLevel};
pub use input::{Adjust, InventoryCount, InventoryCountLine, SetMin};
pub use model::{
    AlertType, ExpiringBatch, InventoryCountResult, MovementType, MovementsPage, StockMovement,
    StockView,
};
