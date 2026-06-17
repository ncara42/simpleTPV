//! Helpers de serialización compartidos por los modelos de salida (DTOs de
//! respuesta), para emitir el MISMO formato JSON que el backend NestJS/Prisma.

use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer};
use time::PrimitiveDateTime;

/// Deserializa un campo en `Option<Option<T>>` para distinguir "ausente" de
/// `null` en un PATCH (paridad con el `data: input` de Prisma): combinado con
/// `#[serde(default)]`, ausente→`None`, `null`→`Some(None)`, valor→`Some(Some)`.
pub fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

/// Serializa un `Decimal` como string NORMALIZADO (sin ceros finales), igual que
/// `Decimal.toJSON` de Prisma (`9.9900` → `"9.99"`, `21.00` → `"21"`).
pub fn decimal_str<S: serde::Serializer>(d: &Decimal, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&d.normalize().to_string())
}

/// Variante `Option` de [`decimal_str`]: `null` si es `None`.
pub fn decimal_opt_str<S: serde::Serializer>(d: &Option<Decimal>, s: S) -> Result<S::Ok, S::Error> {
    match d {
        Some(v) => decimal_str(v, s),
        None => s.serialize_none(),
    }
}

/// Serializa un `Decimal` como NÚMERO JSON (paridad con los campos que NestJS
/// emite vía `Number(...)`: ratios, KPIs, métricas de sugerencia).
pub fn decimal_float<S: serde::Serializer>(d: &Decimal, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_f64(d.to_f64().unwrap_or(0.0))
}

/// Variante `Option` de [`decimal_float`]: `null` si es `None`.
pub fn decimal_opt_float<S: serde::Serializer>(
    d: &Option<Decimal>,
    s: S,
) -> Result<S::Ok, S::Error> {
    match d {
        Some(v) => decimal_float(v, s),
        None => s.serialize_none(),
    }
}

/// Serializa un `TIMESTAMP` (sin tz, almacenado en UTC) como ISO-8601 con `Z`.
pub fn iso_utc<S: serde::Serializer>(dt: &PrimitiveDateTime, s: S) -> Result<S::Ok, S::Error> {
    let formatted = dt
        .assume_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(serde::ser::Error::custom)?;
    s.serialize_str(&formatted)
}

/// Variante `Option` de [`iso_utc`]: `null` si es `None`.
pub fn iso_opt_utc<S: serde::Serializer>(
    dt: &Option<PrimitiveDateTime>,
    s: S,
) -> Result<S::Ok, S::Error> {
    match dt {
        Some(v) => iso_utc(v, s),
        None => s.serialize_none(),
    }
}
