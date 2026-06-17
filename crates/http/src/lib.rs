//! Capa HTTP (Axum) del backend (doc 03). Traduce `AppError` a respuesta,
//! expone el extractor `AuthUser` (equivalente al AuthGuard) y las rutas
//! `/auth/*`, y monta el stack de producción (trace, cabeceras sensibles,
//! timeout, cabeceras de seguridad, rate-limit de login).
//!
//! `domain` no se conoce aquí; los handlers llaman a los servicios (de momento
//! `AuthService`). La capa http no toca SQL directamente.

mod error;
mod extractor;
mod json;
mod products;
mod returns;
mod router;
mod routes;
mod sales;
mod sales_export;
mod state;
mod stock;
mod stores;
mod suppliers;
mod users;

pub use error::ApiError;
pub use extractor::AuthUser;
pub use router::build_router;
pub use state::AppState;
