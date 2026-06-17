//! Entrada y validación de marca corporativa (#154, U-08) — port de
//! `branding.dto.ts` + la validación de SVG de `branding.service.ts`.
//!
//! `brandColor`/`logoUrl` usan "doble opción": ausente = no tocar, `null` =
//! restaurar el valor por defecto, valor = fijar. El logo viaja como data-URL
//! base64 (PNG/JPEG/SVG, ≤ ~64KB). Para SVG se decodifica y se rechaza cualquier
//! vector de XSS (script/handlers/javascript:/foreignObject) — defensa en
//! profundidad, aunque el logo se pinta con `<img src=dataURL>`. `xlink:href`
//! no se prohíbe por sí solo (paridad con NestJS: un `<use xlink:href="#id">`
//! interno es legítimo); el riesgo real, `xlink:href="javascript:…"`, lo cubre
//! la rama `javascript:`.

use serde::Deserialize;
use simpletpv_shared::AppError;

use crate::serde_helpers::double_option;

const MAX_LOGO_LEN: usize = 90_000; // ~64KB en base64
const SVG_PREFIX: &str = "data:image/svg+xml;base64,";
const DATA_URL_PREFIXES: [&str; 3] = [
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    SVG_PREFIX,
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBranding {
    #[serde(default, deserialize_with = "double_option")]
    pub brand_color: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub logo_url: Option<Option<String>>,
}

impl UpdateBranding {
    pub fn validate(&self) -> Result<(), AppError> {
        if let Some(Some(c)) = &self.brand_color {
            if !hex_color_ok(c) {
                return Err(AppError::BadRequest);
            }
        }
        if let Some(Some(u)) = &self.logo_url {
            if !logo_data_url_ok(u) {
                return Err(AppError::BadRequest);
            }
            if let Some(b64) = u.strip_prefix(SVG_PREFIX) {
                let decoded = b64_decode(b64).ok_or(AppError::BadRequest)?;
                let svg = String::from_utf8_lossy(&decoded);
                if svg_has_forbidden(&svg) {
                    return Err(AppError::BadRequest);
                }
            }
        }
        Ok(())
    }
}

/// `#rrggbb` (6 dígitos hex).
fn hex_color_ok(c: &str) -> bool {
    let b = c.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(u8::is_ascii_hexdigit)
}

/// data-URL base64 de PNG/JPEG/SVG, no vacía y dentro del límite de tamaño.
fn logo_data_url_ok(u: &str) -> bool {
    if u.len() > MAX_LOGO_LEN {
        return false;
    }
    let Some(prefix) = DATA_URL_PREFIXES.iter().find(|p| u.starts_with(**p)) else {
        return false;
    };
    let payload = &u[prefix.len()..];
    !payload.is_empty()
        && payload
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
}

/// Decodifica base64 estándar (ignora `=`). Devuelve `None` ante caracteres no
/// válidos. Solo se usa para inspeccionar el contenido SVG.
fn b64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.bytes().filter(|&b| b != b'=') {
        buf = (buf << 6) | val(c)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// Detecta patrones peligrosos en SVG (paridad con `SVG_FORBIDDEN`):
/// `<script`, `javascript:`, `<foreignObject` y handlers `on<letras>=`.
fn svg_has_forbidden(svg: &str) -> bool {
    let lower = svg.to_ascii_lowercase();
    if lower.contains("<script")
        || lower.contains("javascript:")
        || lower.contains("<foreignobject")
    {
        return true;
    }
    let b = lower.as_bytes();
    let mut i = 0;
    while i + 1 < b.len() {
        if b[i] == b'o' && b[i + 1] == b'n' {
            let mut j = i + 2;
            let start = j;
            while j < b.len() && b[j].is_ascii_lowercase() {
                j += 1;
            }
            let saw_letter = j > start;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if saw_letter && j < b.len() && b[j] == b'=' {
                return true; // on<letras>[ws]=
            }
        }
        i += 1;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b64(s: &str) -> String {
        // Codificación mínima para los tests (alfabeto estándar, con padding).
        const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        for chunk in s.as_bytes().chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
            out.push(T[(n >> 18 & 63) as usize] as char);
            out.push(T[(n >> 12 & 63) as usize] as char);
            out.push(if chunk.len() > 1 {
                T[(n >> 6 & 63) as usize] as char
            } else {
                '='
            });
            out.push(if chunk.len() > 2 {
                T[(n & 63) as usize] as char
            } else {
                '='
            });
        }
        out
    }

    #[test]
    fn color_y_data_url() {
        assert!(hex_color_ok("#1a2B3c"));
        assert!(!hex_color_ok("#123"));
        assert!(!hex_color_ok("1a2b3c"));
        assert!(logo_data_url_ok("data:image/png;base64,AAAA"));
        assert!(!logo_data_url_ok("data:image/gif;base64,AAAA"));
        assert!(!logo_data_url_ok("data:image/png;base64,")); // vacío
    }

    /// `UpdateBranding` con un único logo SVG (como data-URL base64).
    fn svg_logo(svg: &str) -> UpdateBranding {
        UpdateBranding {
            brand_color: None,
            logo_url: Some(Some(format!("{SVG_PREFIX}{}", b64(svg)))),
        }
    }

    #[test]
    fn svg_limpio_se_acepta() {
        assert!(
            svg_logo(r#"<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>"#)
                .validate()
                .is_ok()
        );
        // `xlink:href` interno (referencia a un símbolo del propio documento) es
        // legítimo y NO se prohíbe per se — paridad con `SVG_FORBIDDEN` de
        // NestJS, que no lo lista. El vector real (una URI `javascript:` dentro
        // del atributo) lo caza la rama `javascript:`; ver el test siguiente.
        assert!(svg_logo(r##"<svg><use xlink:href="#icon"/></svg>"##)
            .validate()
            .is_ok());
    }

    #[test]
    fn svg_vectores_xss_se_rechazan() {
        // Las cuatro primeras son los fixtures de paridad de
        // `apps/api/src/organization/branding.service.spec.ts`; las dos últimas
        // cubren ramas antes sin ejercitar: `on*=` con espacios y un
        // `javascript:` embebido en `xlink:href`.
        for bad in [
            "<svg><script>alert(1)</script></svg>",              // <script
            r#"<svg onload="alert(1)"/>"#,                       // on*=
            r#"<svg><a href="javascript:alert(1)">x</a></svg>"#, // javascript:
            "<svg><foreignObject/></svg>",                       // <foreignObject
            r#"<svg onerror = "alert(1)"/>"#,                    // on*= con espacios
            r##"<svg><image xlink:href="javascript:alert(1)"/></svg>"##, // xlink:href → js:
        ] {
            assert_eq!(
                svg_logo(bad).validate().err(),
                Some(AppError::BadRequest),
                "debía rechazar: {bad}"
            );
        }
    }
}
