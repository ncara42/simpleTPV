//! Traspasos de stock entre tiendas (#153, Fase 3): DRAFT→SENT→RECEIVED→CLOSED,
//! con salida FEFO del origen y recreación de lotes viajeros en el destino.

pub mod input;
pub mod model;
pub mod service;

pub use input::{
    CreateAttachment, CreateMessage, CreateTransfer, CreateTransferLine, ReceiveTransfer,
    ReceiveTransferLine,
};
pub use model::{
    Transfer, TransferAttachment, TransferLine, TransferMessage, TransferStatus, TransferWithLines,
};
