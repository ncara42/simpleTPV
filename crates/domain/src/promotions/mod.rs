//! Promociones (#154, Fase 4): catálogo de central (org-wide). Lectura para
//! cualquier sesión; escritura ADMIN/MANAGER.

pub mod apply;
pub mod input;
pub mod model;
pub mod service;

pub use apply::{best_promotions, MatchInput, PromoLine, PromoOutcome};
pub use input::{CreatePromotion, UpdatePromotion};
pub use model::{
    PromoAmountScope, PromoAppliesTo, PromoConditionType, PromoDiscountType, Promotion,
};
