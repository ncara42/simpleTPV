//! Autenticación (Fase 1, doc 06) — port fiel del módulo `auth` de NestJS.
//!
//! Cubre el DOMINIO de auth y la criptografía:
//! - JWT **HS256** (interop con el backend NestJS durante el corte) — `jwt`.
//! - Verificación de contraseña con **bcrypt** (hashes existentes, cost 10) +
//!   mitigación de timing (SEC-14) — `password`.
//! - `AuthService`: login, rotación de refresh con detección de reuso (SEC-06)
//!   y logout, usando el rol **app_admin (BYPASSRLS)** para el lookup previo al
//!   tenant — `service`.
//! - Revalidación A-04 por petición (lookup `active`/`role` + caché en-proceso de
//!   TTL corto) — `user_state`. La política fail-closed/fail-open por rol vive en
//!   la capa http (el extractor), no aquí.
//!
//! FUERA DE ALCANCE de esta fase (van con la capa http): rutas HTTP `/auth/*`,
//! cookie httpOnly del refresh, rate limiting y el extractor Axum `AuthUser`
//! (envuelve `AuthService::verify_access_token` y la revalidación A-04).

pub mod claims;
pub mod config;
pub mod jwt;
pub mod password;
pub mod service;
pub mod user_state;

pub use claims::{AccessClaims, RefreshClaims, Role};
pub use config::AuthConfig;
pub use jwt::Jwt;
pub use service::{AuthService, TokenPair};
pub use user_state::{DbUserStateLookup, UserState, UserStateLookup, UserStateService};
