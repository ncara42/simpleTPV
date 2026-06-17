//! Feature flags (#152 resolución + #154 gestión) — port de `FeatureFlagService`.
//! Precedencia: override de tienda ?? default de la org (storeId NULL) ?? default
//! del código. RLS por tenant: sin contexto → 0 filas → cae al default del
//! código, nunca a "apagado". Gestión (list/set/clear) y catálogo: Fase 4 (#154).

pub mod catalog;
pub mod model;
pub mod service;

pub use catalog::{is_feature_key, FEATURE_FLAGS};
pub use model::{CatalogEntry, FeatureFlagList, FlagRow};
pub use service::{
    assert_flag_enabled, clear_flag, default_for_key, is_flag_enabled, list, resolve_all, set_flag,
};
