//! Promociones (#154, Fase 4): catálogo de central (org-wide). Lectura para
//! cualquier sesión; escritura ADMIN/MANAGER.

pub mod input;
pub mod model;
pub mod service;

pub use input::{CreatePromotion, UpdatePromotion};
pub use model::{PromoConditionType, PromoDiscountType, Promotion};
