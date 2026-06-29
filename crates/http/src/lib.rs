//! Capa HTTP (Axum) del backend (doc 03). Traduce `AppError` a respuesta,
//! expone el extractor `AuthUser` (equivalente al AuthGuard) y las rutas
//! `/auth/*`, y monta el stack de producción (trace, cabeceras sensibles,
//! timeout, cabeceras de seguridad, rate-limit de login).
//!
//! `domain` no se conoce aquí; los handlers llaman a los servicios (de momento
//! `AuthService`). La capa http no toca SQL directamente.

mod api_key_extractor;
mod api_keys;
mod audit;
mod branding;
mod cash_sessions;
mod chat;
mod customers;
mod dashboard;
mod devices;
mod error;
mod events;
mod extractor;
mod feature_flags;
mod json;
mod me;
mod openapi;
mod price_lists;
mod product_families;
mod products;
mod promotions;
mod public;
mod purchases;
mod returns;
mod router;
mod routes;
mod sales;
mod sales_export;
mod state;
mod stock;
mod stores;
mod support;
mod suppliers;
mod time_clock;
mod transfers;
mod users;
mod verifactu;
mod wholesale_orders;
mod z_report;

pub use error::ApiError;
pub use extractor::AuthUser;
pub use router::build_router;
pub use state::AppState;
