//! Proveedores y tarifas de compra (#153, Fase 3): CRUD de proveedores +
//! tarifas por (proveedor, producto), comparativa e import CSV por SKU.

pub mod input;
pub mod model;
pub mod service;

pub use input::{
    CreateSupplier, ImportSupplierPrices, ListSupplierPricesQuery, UpdateSupplier,
    UpsertSupplierPrice,
};
pub use model::{ComparisonRow, PriceEntry, Supplier, SupplierPriceRow};
