//! Entradas y validación de familias de producto (#154) — port de los DTOs.
//!
//! `parent_id` usa "doble opción" para distinguir tres casos del PATCH original
//! (`data: input` de Prisma): ausente = no tocar, `null` = mover a raíz, valor =
//! reparentar. El resto de campos opcionales son patch simple (ausente = no
//! tocar); poner `color`/`icon` a `null` explícito no se soporta (divergencia
//! menor frente a Prisma, documentada).

use serde::{Deserialize, Deserializer};
use simpletpv_shared::limits::{MAX_CODE_LENGTH, MAX_NAME_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

fn name_ok(n: &str) -> bool {
    let t = n.trim();
    !t.is_empty() && t.chars().count() <= MAX_NAME_LENGTH
}

fn short_ok(s: &Option<String>) -> bool {
    s.as_ref()
        .map(|v| v.chars().count() <= MAX_CODE_LENGTH)
        .unwrap_or(true)
}

/// Deserializa un campo en `Option<Option<T>>`: ausente→`None`, `null`→`Some(None)`,
/// valor→`Some(Some(v))`. Se combina con `#[serde(default)]`.
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFamily {
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<Uuid>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub is_archetype: Option<bool>,
}

impl CreateFamily {
    pub fn validate(&self) -> Result<(), AppError> {
        if !name_ok(&self.name)
            || !short_ok(&self.color)
            || !short_ok(&self.icon)
            || self.sort_order.is_some_and(|s| s < 0)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFamily {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub parent_id: Option<Option<Uuid>>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub is_archetype: Option<bool>,
}

impl UpdateFamily {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| !name_ok(n))
            || !short_ok(&self.color)
            || !short_ok(&self.icon)
            || self.sort_order.is_some_and(|s| s < 0)
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
