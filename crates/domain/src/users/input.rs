//! Entradas y validación de usuarios (#153) — port de `users.dto.ts`. Las
//! validaciones replican class-validator: email laxo, nombre 1..MAX, contraseña
//! 8..72 (bcrypt trunca a 72 bytes, #107), PIN 4-8 dígitos, rol válido.

use serde::Deserialize;
use simpletpv_shared::limits::{MAX_ARRAY_SIZE, MAX_NAME_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

use super::model::UserRole;

const PASSWORD_MIN: usize = 8;
/// bcrypt descarta los bytes 73+; topamos para no hashear un prefijo en silencio.
pub const PASSWORD_MAX: usize = 72;

pub(crate) fn parse_role(s: &str) -> Result<UserRole, AppError> {
    match s.trim().to_uppercase().as_str() {
        "ADMIN" => Ok(UserRole::Admin),
        "MANAGER" => Ok(UserRole::Manager),
        "CLERK" => Ok(UserRole::Clerk),
        _ => Err(AppError::BadRequest),
    }
}

/// Email válido (criterio laxo equivalente a `@IsEmail`): `algo@algo.algo`, sin
/// espacios, con punto en el dominio.
pub(crate) fn valid_email(email: &str) -> bool {
    let e = email.trim();
    if e.is_empty() || e.chars().any(char::is_whitespace) {
        return false;
    }
    let Some(at) = e.find('@') else { return false };
    let (local, rest) = e.split_at(at);
    let domain = &rest[1..];
    !local.is_empty()
        && !domain.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

pub(crate) fn valid_password(p: &str) -> bool {
    (PASSWORD_MIN..=PASSWORD_MAX).contains(&p.len())
}

fn valid_name(n: &str) -> bool {
    let t = n.trim();
    !t.is_empty() && t.chars().count() <= MAX_NAME_LENGTH
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUser {
    pub email: String,
    pub name: String,
    pub password: String,
    pub role: String,
}

impl CreateUser {
    pub fn validate(&self) -> Result<UserRole, AppError> {
        if !valid_email(&self.email) || !valid_name(&self.name) || !valid_password(&self.password) {
            return Err(AppError::BadRequest);
        }
        parse_role(&self.role)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUser {
    pub name: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub active: Option<bool>,
    pub password: Option<String>,
}

impl UpdateUser {
    /// Valida y resuelve el rol (si viene). Devuelve `Some(role)` o `None`.
    pub fn validate(&self) -> Result<Option<UserRole>, AppError> {
        if let Some(e) = &self.email {
            if !valid_email(e) {
                return Err(AppError::BadRequest);
            }
        }
        if let Some(n) = &self.name {
            if !valid_name(n) {
                return Err(AppError::BadRequest);
            }
        }
        if let Some(p) = &self.password {
            if !valid_password(p) {
                return Err(AppError::BadRequest);
            }
        }
        match &self.role {
            Some(r) => Ok(Some(parse_role(r)?)),
            None => Ok(None),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SetPin {
    pub pin: String,
}

impl SetPin {
    pub fn validate(&self) -> Result<(), AppError> {
        if (4..=8).contains(&self.pin.len()) && self.pin.chars().all(|c| c.is_ascii_digit()) {
            Ok(())
        } else {
            Err(AppError::BadRequest)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignStores {
    pub store_ids: Vec<Uuid>,
}

impl AssignStores {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.store_ids.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct ImportUsers {
    pub csv: String,
}
