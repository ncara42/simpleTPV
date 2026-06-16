//! Módulo de devoluciones. Slice 1: devolución CON ticket (valida cantidades vs
//! vendido−devuelto, repone al lote original) + listado. La devolución CIEGA (con
//! PIN/4-ojos) y el registro VeriFactu llegan en slices posteriores.

pub mod domain;
pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateReturn, CreateReturnLine};
pub use model::{Return, ReturnLine, ReturnWithLines};
