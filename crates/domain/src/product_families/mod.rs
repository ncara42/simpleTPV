//! Familias de producto (#154, Fase 4): árbol jerárquico (familia/subfamilia o
//! arquetipo). Lectura para cualquier sesión; escritura solo ADMIN.

pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateFamily, UpdateFamily};
pub use model::{build_tree, FamilyNode, ProductFamily};
