//! Catálogo de feature flags (#127 B / #154) — port de `feature-flags.catalog.ts`.
//! Cada key declara su default EN CÓDIGO = su comportamiento ACTUAL. Hoy las 4
//! arrancan ACTIVAS (`true`): un flag solo sirve para APAGAR un módulo; un flag
//! ausente nunca desactiva nada (la resolución cae a este default).

pub struct FlagDef {
    pub key: &'static str,
    pub label: &'static str,
    pub default: bool,
}

pub const FEATURE_FLAGS: [FlagDef; 4] = [
    FlagDef {
        key: "blind_returns",
        label: "Devolución ciega",
        default: true,
    },
    FlagDef {
        key: "time_clock",
        label: "Control horario",
        default: true,
    },
    FlagDef {
        key: "data_export",
        label: "Exportación (ventas y contable)",
        default: true,
    },
    FlagDef {
        key: "b2b",
        label: "Mayorista B2B",
        default: true,
    },
];

/// ¿`key` pertenece al catálogo?
pub fn is_feature_key(key: &str) -> bool {
    FEATURE_FLAGS.iter().any(|f| f.key == key)
}
