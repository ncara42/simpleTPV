//! Marca corporativa (#154, Fase 4, U-08): color y logo de la organización.
//! Lectura para cualquier sesión (backoffice y TPV aplican el tema); escritura
//! solo ADMIN.

pub mod input;
pub mod model;
pub mod service;

pub use input::UpdateBranding;
pub use model::Branding;
