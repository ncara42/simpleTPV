//! Módulo de ventas (core): dominio puro, modelos, entradas y servicio. Slice 1:
//! creación (idempotente, FEFO, totales, límites), consulta por ticket, reserva de
//! bloque y listado. `void`/recibos/desglose-IVA llegan en slices posteriores.

pub mod domain;
pub mod export;
pub mod input;
pub mod model;
pub mod service;

pub use domain::{build_tax_breakdown, TaxBreakdownItem, TaxLine};
pub use export::{build_accounting_csv, build_sales_csv, AccountingSaleRow, SalesExportRow};
pub use input::{CreateSale, CreateSaleLine, ReserveTicketBlock};
pub use model::{
    DiscountSource, OrgInfo, PaymentMethod, Sale, SaleLine, SaleStatus, SaleWithLines, SalesPage,
    StoreInfo, TicketBlock, TicketData, TicketLine,
};
