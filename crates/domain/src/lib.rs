//! Lógica de dominio del backend (Fase 2, doc 02 §4). El "corazón" transaccional:
//! catálogo, stock, ventas y devoluciones. Cada módulo expone funciones que
//! ejecutan sus lecturas/escrituras a través de [`simpletpv_db::with_tenant_tx`]
//! ⇒ RLS por tenant en un único punto auditable.
//!
//! Incluye `products` (catálogo), `stock` (inventario + lotes/FEFO), `sales`
//! (ventas) y `returns` (devoluciones con ticket).

pub mod csv;
#[macro_use]
mod pg_enum;
pub mod products;
pub mod receipt;
pub mod returns;
pub mod sales;
pub mod serde_helpers;
pub mod stock;
pub mod store_access;

pub use csv::{ImportResult, RowError};
