//! Recursos del usuario autenticado (#154, Fase 4): perfil (rol/tiendas/identidad)
//! y preferencias de personalización (IT-16). Cualquier sesión accede a lo suyo;
//! las tiendas y los feature flags efectivos se sirven desde la capa HTTP
//! reutilizando `stores` y `feature_flags`.

pub mod model;
pub mod preferences;
pub mod service;

pub use model::{MeProfile, SavedPreference};
pub use service::profile;
