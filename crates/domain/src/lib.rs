//! Lógica de dominio del backend (Fase 2, doc 02 §4). El "corazón" transaccional:
//! catálogo, stock, ventas y devoluciones. Cada módulo expone funciones que
//! ejecutan sus lecturas/escrituras a través de [`simpletpv_db::with_tenant_tx`]
//! ⇒ RLS por tenant en un único punto auditable.
//!
//! Esta fase incluye `products` (catálogo) y `stock` (inventario + lotes/FEFO).
//! `sales` y `returns` llegan en PRs siguientes.

pub mod csv;
#[macro_use]
mod pg_enum;
pub mod products;
pub mod serde_helpers;
pub mod stock;

pub use csv::{ImportResult, RowError};
