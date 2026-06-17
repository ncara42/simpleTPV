//! Caja y movimientos de efectivo (#145/#146, Fase 3): apertura/cierre con cuadre,
//! registro de cierres, y flujo de aprobación de movimientos (solicitar→aprobar/
//! denegar) incluido el traspaso de efectivo a la tienda central.

pub mod domain;
pub mod input;
pub mod model;
pub mod service;

pub use input::{CashMovementInput, CloseCashSession, OpenCashSession};
pub use model::{
    CashMovement, CashMovementStatus, CashMovementType, CashSession, CashSessionStatus,
    PendingMovement,
};
