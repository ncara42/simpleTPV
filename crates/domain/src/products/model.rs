//! Modelo de catálogo: `Product` (fila de la tabla) y `SaleUnit` (enum Prisma).
//!
//! `Product` es un tipo de SALIDA (se serializa a JSON para el cliente React).
//! Réplica del contrato Prisma: claves camelCase, `Decimal` como string (paridad
//! con `Decimal.toJSON` de Prisma) y fechas en ISO-8601 UTC.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Unidad de venta (enum `SaleUnit` de Prisma/Postgres). Mayúsculas para
/// interoperar con el cliente y la columna enum de la BD.
///
/// En SQLx viaja como **texto** (no como tipo enum nombrado): SQLx enviaría el
/// nombre del tipo sin comillas y Postgres lo plegaría a minúsculas
/// (`saleunit`), que no existe — el tipo real es `"SaleUnit"`. Por eso se castea
/// explícitamente en SQL (`$n::"SaleUnit"`, `"saleUnit"::text`), igual que el
/// patrón `role::text` de la capa de auth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum SaleUnit {
    Unit,
    Weight,
    Volume,
    Length,
}

impl SaleUnit {
    /// Etiqueta tal cual la almacena Postgres/espera el cliente.
    pub fn as_str(self) -> &'static str {
        match self {
            SaleUnit::Unit => "UNIT",
            SaleUnit::Weight => "WEIGHT",
            SaleUnit::Volume => "VOLUME",
            SaleUnit::Length => "LENGTH",
        }
    }

    fn from_db(s: &str) -> Option<Self> {
        match s {
            "UNIT" => Some(SaleUnit::Unit),
            "WEIGHT" => Some(SaleUnit::Weight),
            "VOLUME" => Some(SaleUnit::Volume),
            "LENGTH" => Some(SaleUnit::Length),
            _ => None,
        }
    }
}

impl sqlx::Type<sqlx::Postgres> for SaleUnit {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <str as sqlx::Type<sqlx::Postgres>>::type_info()
    }
    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <&str as sqlx::Type<sqlx::Postgres>>::compatible(ty)
    }
}

impl sqlx::Encode<'_, sqlx::Postgres> for SaleUnit {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, Box<dyn std::error::Error + Send + Sync>> {
        <&str as sqlx::Encode<sqlx::Postgres>>::encode(self.as_str(), buf)
    }
}

impl<'r> sqlx::Decode<'r, sqlx::Postgres> for SaleUnit {
    fn decode(
        value: sqlx::postgres::PgValueRef<'r>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<sqlx::Postgres>>::decode(value)?;
        SaleUnit::from_db(s).ok_or_else(|| format!("SaleUnit desconocido: {s}").into())
    }
}

/// Fila de `Product`. Solo SALIDA: deriva `FromRow` (lectura BD) + `Serialize`.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub family_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub barcode: Option<String>,
    pub sku: Option<String>,
    pub sale_unit: SaleUnit,
    pub unit_symbol: String,
    #[serde(serialize_with = "decimal_str")]
    pub sale_price: Decimal,
    #[serde(serialize_with = "decimal_str")]
    pub cost_price: Decimal,
    #[serde(serialize_with = "decimal_str")]
    pub tax_rate: Decimal,
    pub image_url: Option<String>,
    pub active: bool,
    pub tracks_batch: bool,
    #[serde(serialize_with = "iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "iso_utc")]
    pub updated_at: PrimitiveDateTime,
}

/// Serializa un `Decimal` como string NORMALIZADO (sin ceros finales), igual que
/// `Decimal.toJSON` de Prisma (`9.9900` → `"9.99"`, `21.00` → `"21"`).
fn decimal_str<S: serde::Serializer>(d: &Decimal, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&d.normalize().to_string())
}

/// Serializa un `TIMESTAMP` (sin tz, almacenado en UTC) como ISO-8601 con `Z`.
fn iso_utc<S: serde::Serializer>(dt: &PrimitiveDateTime, s: S) -> Result<S::Ok, S::Error> {
    let formatted = dt
        .assume_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(serde::ser::Error::custom)?;
    s.serialize_str(&formatted)
}
