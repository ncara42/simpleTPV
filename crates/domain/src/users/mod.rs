//! Gestión de usuarios (#153, Fase 3): alta/edición/borrado, PIN, asignación de
//! tiendas e import CSV. Solo ADMIN (control de la capa HTTP). NUNCA expone
//! hashes de credenciales.

pub mod input;
pub mod model;
pub mod service;

pub use input::{AssignStores, CreateUser, ImportUsers, SetPin, UpdateUser};
pub use model::{PublicUser, UserListItem, UserRole};
