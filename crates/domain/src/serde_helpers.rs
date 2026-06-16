//! Helpers de serialización compartidos por los modelos de salida (DTOs de
//! respuesta), para emitir el MISMO formato JSON que el backend NestJS/Prisma.

use rust_decimal::Decimal;
use time::PrimitiveDateTime;

/// Serializa un `Decimal` como string NORMALIZADO (sin ceros finales), igual que
/// `Decimal.toJSON` de Prisma (`9.9900` → `"9.99"`, `21.00` → `"21"`).
pub fn decimal_str<S: serde::Serializer>(d: &Decimal, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&d.normalize().to_string())
}

/// Serializa un `TIMESTAMP` (sin tz, almacenado en UTC) como ISO-8601 con `Z`.
pub fn iso_utc<S: serde::Serializer>(dt: &PrimitiveDateTime, s: S) -> Result<S::Ok, S::Error> {
    let formatted = dt
        .assume_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(serde::ser::Error::custom)?;
    s.serialize_str(&formatted)
}
