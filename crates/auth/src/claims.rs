//! Claims de los JWT (paridad con `jwt-payload.ts` y `auth.service.ts`).
//!
//! `organizationId` viaja DENTRO del token (no hay header `X-Org-Id`); en
//! camelCase porque el cliente React y el backend NestJS lo esperan así.

use serde::{Deserialize, Serialize};
use simpletpv_shared::AppError;

/// Rol del usuario (enum `UserRole` de Prisma). Serializa en mayúsculas
/// (`"ADMIN"`) para interoperar con los tokens del backend NestJS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Role {
    Admin,
    Manager,
    Clerk,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Admin => "ADMIN",
            Role::Manager => "MANAGER",
            Role::Clerk => "CLERK",
        }
    }

    /// ¿El rol accede a TODA la organización (no acotado por tienda)?
    /// ADMIN/MANAGER operan sobre cualquier tienda; CLERK queda acotado a las
    /// suyas (UserStore). Espeja `isOrgWideRole` de NestJS (SEC-01).
    pub fn is_org_wide(self) -> bool {
        matches!(self, Role::Admin | Role::Manager)
    }

    /// Parsea el `role::text` leído de la BD. Un valor desconocido es un fallo
    /// interno (no debería existir), nunca se expone al cliente.
    pub fn from_db(s: &str) -> Result<Self, AppError> {
        match s {
            "ADMIN" => Ok(Role::Admin),
            "MANAGER" => Ok(Role::Manager),
            "CLERK" => Ok(Role::Clerk),
            other => {
                tracing::error!(role = other, "rol desconocido en la base de datos");
                Err(AppError::Internal)
            }
        }
    }
}

/// Claims del access token (~15 min).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessClaims {
    /// User id.
    pub sub: String,
    #[serde(rename = "organizationId")]
    pub organization_id: String,
    pub role: Role,
    pub exp: usize,
    pub iat: usize,
}

/// Claims del refresh token (~7 días). `jti` identifica el token (rotación) y
/// `fam` la familia (revocación ante reuso, SEC-06).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshClaims {
    pub sub: String,
    pub jti: String,
    pub fam: String,
    pub exp: usize,
    pub iat: usize,
}
