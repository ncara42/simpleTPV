//! Pedidos a proveedor (#153, Fase 3): DRAFT→CONFIRMED→(PARTIALLY)→RECEIVED, con
//! recepción que incrementa stock (PURCHASE_RECEIPT + lote), KPIs de proveedor,
//! propuesta de reposición y export CSV.

pub mod domain;
pub mod input;
pub mod model;
pub mod service;

pub use input::{
    CreatePurchaseOrder, CreatePurchaseOrderLine, ReceivePurchaseOrder, ReceivePurchaseOrderLine,
    SuggestPurchase,
};
pub use model::{
    PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, PurchaseOrderWithLines, SuggestionRow,
};
