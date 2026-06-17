//! Entrada y validación de creación de API key (#154) — port del DTO.

use serde::Deserialize;
use simpletpv_shared::AppError;
use uuid::Uuid;

const MAX_NAME: usize = 64;
const MAX_TTL_DAYS: i32 = 3650;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiKey {
    pub name: String,
    #[serde(default)]
    pub price_list_id: Option<Uuid>,
    /// TTL en días (caducidad). Ausente = sin caducidad. KEY-02.
    #[serde(default)]
    pub ttl_days: Option<i32>,
}

impl CreateApiKey {
    pub fn validate(&self) -> Result<(), AppError> {
        let n = self.name.trim().chars().count();
        if !(1..=MAX_NAME).contains(&n) {
            return Err(AppError::BadRequest);
        }
        if self
            .ttl_days
            .is_some_and(|t| !(1..=MAX_TTL_DAYS).contains(&t))
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}
