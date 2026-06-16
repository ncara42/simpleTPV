//! Módulo de ventas (core): dominio puro, modelos, entradas y servicio. Slice 1:
//! creación (idempotente, FEFO, totales, límites), consulta por ticket, reserva de
//! bloque y listado. `void`/recibos/desglose-IVA llegan en slices posteriores.

pub mod domain;
pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateSale, CreateSaleLine, ReserveTicketBlock};
pub use model::{
    DiscountSource, PaymentMethod, Sale, SaleLine, SaleStatus, SaleWithLines, SalesPage,
    TicketBlock,
};
