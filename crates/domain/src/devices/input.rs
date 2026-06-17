//! Entradas y validación de dispositivos (#154) — port de los DTOs.

use serde::Deserialize;
use simpletpv_shared::limits::MAX_NAME_LENGTH;
use simpletpv_shared::AppError;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDevice {
    pub store_id: Uuid,
    pub name: String,
}

impl CreateDevice {
    pub fn validate(&self) -> Result<(), AppError> {
        let n = self.name.trim();
        if n.chars().count() < 2 || n.chars().count() > MAX_NAME_LENGTH {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairDevice {
    pub pairing_token: String,
}

impl PairDevice {
    /// Token de 12 hex en mayúsculas (6 bytes). KEY-03.
    pub fn validate(&self) -> Result<(), AppError> {
        let t = &self.pairing_token;
        if t.len() == 12
            && t.bytes()
                .all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b))
        {
            Ok(())
        } else {
            Err(AppError::BadRequest)
        }
    }
}
