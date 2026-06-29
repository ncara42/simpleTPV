//! Clientes B2B (#154, Fase 4, IT-17): CRUD de central (ADMIN/MANAGER). El alta
//! gatea el módulo mayorista (feature flag `b2b`).

pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateCustomer, UpdateCustomer};
pub use model::{Customer, CustomerLedgerRow, PriceListRef};
