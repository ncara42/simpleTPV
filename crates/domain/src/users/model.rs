//! Modelos de usuarios (#153) — port de `users.service.ts`. NUNCA exponen
//! `passwordHash`/`pinHash`: solo los campos públicos.

use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

pg_text_enum! {
    /// Rol del usuario (enum `UserRole` de Prisma).
    pub enum UserRole {
        Admin = "ADMIN",
        Manager = "MANAGER",
        Clerk = "CLERK",
    }
}

/// Usuario público: jamás incluye hashes de credenciales.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: UserRole,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Usuario público + tiendas asignadas (para la matriz de acceso del backoffice).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserListItem {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: UserRole,
    pub active: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    pub store_ids: Vec<Uuid>,
}
