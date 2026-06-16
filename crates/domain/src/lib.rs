//! Lógica de dominio del backend (Fase 2, doc 02 §4). El "corazón" transaccional:
//! catálogo, stock, ventas y devoluciones. Cada módulo expone funciones que
//! ejecutan sus lecturas/escrituras a través de [`simpletpv_db::with_tenant_tx`]
//! ⇒ RLS por tenant en un único punto auditable.
//!
//! Esta fase incluye `products` (catálogo). `stock`, `sales` y `returns` llegan
//! en PRs siguientes.

pub mod csv;
pub mod products;

pub use csv::{ImportResult, RowError};
