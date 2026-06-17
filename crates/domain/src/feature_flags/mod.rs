//! Resolución de feature flags (#152, gate de `blind_returns`) — port de
//! `FeatureFlagService.isEnabled`. Precedencia: override de tienda ?? default de
//! la org (storeId NULL) ?? default del código. RLS por tenant: sin contexto → 0
//! filas → cae al default del código, nunca a "apagado". La gestión (set/clear)
//! y el catálogo completo llegan con la plataforma (Fase 4, #154).

pub mod service;

pub use service::{assert_flag_enabled, default_for_key, is_flag_enabled};
