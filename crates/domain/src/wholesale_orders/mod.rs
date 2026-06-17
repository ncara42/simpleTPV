//! Pedidos mayoristas B2B (#154, Fase 4, IT-17c): pedidos salientes con precio
//! congelado por línea. Función de central (ADMIN/MANAGER); `create` gatea `b2b`.

pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateWholesaleOrder, WholesaleOrderLineInput};
pub use model::{
    WholesaleOrderCreated, WholesaleOrderDetail, WholesaleOrderPage, WholesaleOrderStatus,
};
