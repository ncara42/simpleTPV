//! Lógica de dominio del backend (Fase 2, doc 02 §4). El "corazón" transaccional:
//! catálogo, stock, ventas y devoluciones. Cada módulo expone funciones que
//! ejecutan sus lecturas/escrituras a través de [`simpletpv_db::with_tenant_tx`]
//! ⇒ RLS por tenant en un único punto auditable.
//!
//! Incluye `products` (catálogo), `stock` (inventario + lotes/FEFO), `sales`
//! (ventas) y `returns` (devoluciones con ticket).

#[macro_use]
mod pg_enum;
pub mod api_keys;
pub mod branding;
pub mod cache;
pub mod cash_sessions;
pub mod chat;
pub mod csv;
pub mod customers;
pub mod dashboard;
pub mod devices;
pub mod feature_flags;
pub mod me;
pub mod price_lists;
pub mod product_families;
pub mod products;
pub mod promotions;
pub mod public;
pub mod purchases;
pub mod receipt;
pub mod returns;
pub mod sales;
pub mod serde_helpers;
pub mod stock;
pub mod store_access;
pub mod stores;
pub mod suppliers;
pub mod support;
pub mod time_clock;
pub mod transfers;
pub mod users;
pub mod verifactu;
pub mod wholesale_orders;
pub mod z_report;

pub use csv::{ImportResult, RowError};
