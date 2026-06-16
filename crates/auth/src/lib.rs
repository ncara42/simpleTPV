//! Autenticación (Fase 1, doc 06) — port fiel del módulo `auth` de NestJS.
//!
//! Cubre el DOMINIO de auth y la criptografía:
//! - JWT **HS256** (interop con el backend NestJS durante el corte) — `jwt`.
//! - Verificación de contraseña con **bcrypt** (hashes existentes, cost 10) +
//!   mitigación de timing (SEC-14) — `password`.
//! - `AuthService`: login, rotación de refresh con detección de reuso (SEC-06)
//!   y logout, usando el rol **app_admin (BYPASSRLS)** para el lookup previo al
//!   tenant — `service`.
//!
//! FUERA DE ALCANCE de esta fase (van con la capa http): rutas HTTP `/auth/*`,
//! cookie httpOnly del refresh, rate limiting, revalidación A-04 por request y
//! el extractor Axum `AuthUser` (envuelve `AuthService::verify_access_token`).

pub mod claims;
pub mod config;
pub mod jwt;
pub mod password;
pub mod service;

pub use claims::{AccessClaims, RefreshClaims, Role};
pub use config::AuthConfig;
pub use jwt::Jwt;
pub use service::{AuthService, TokenPair};
