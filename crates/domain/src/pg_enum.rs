//! Macro para enums de Postgres que viajan como **texto** por SQLx.
//!
//! SQLx, al bindear un enum nombrado, envía el nombre del tipo sin comillas y
//! Postgres lo pliega a minúsculas (p. ej. `"SaleUnit"` → `saleunit`, que no
//! existe). La solución (igual que `role::text` en auth) es tratar el enum como
//! texto en el wire y castear explícitamente en SQL (`$n::"Tipo"`,
//! `col::text`). Este macro genera el enum + `as_str`/`from_db` + las impls
//! `sqlx::Type/Encode/Decode` (sobre `&str`) + `serde` con etiquetas explícitas.

macro_rules! pg_text_enum {
    (
        $(#[$doc:meta])*
        pub enum $name:ident { $( $variant:ident = $label:literal ),+ $(,)? }
    ) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, ::serde::Serialize, ::serde::Deserialize)]
        pub enum $name {
            $( #[serde(rename = $label)] $variant ),+
        }

        impl $name {
            /// Etiqueta tal cual la almacena Postgres / espera el cliente.
            pub fn as_str(self) -> &'static str {
                match self { $( Self::$variant => $label ),+ }
            }

            fn from_db(s: &str) -> ::core::option::Option<Self> {
                match s {
                    $( $label => ::core::option::Option::Some(Self::$variant), )+
                    _ => ::core::option::Option::None,
                }
            }
        }

        impl ::sqlx::Type<::sqlx::Postgres> for $name {
            fn type_info() -> ::sqlx::postgres::PgTypeInfo {
                <str as ::sqlx::Type<::sqlx::Postgres>>::type_info()
            }
            fn compatible(ty: &::sqlx::postgres::PgTypeInfo) -> bool {
                <&str as ::sqlx::Type<::sqlx::Postgres>>::compatible(ty)
            }
        }

        impl ::sqlx::Encode<'_, ::sqlx::Postgres> for $name {
            fn encode_by_ref(
                &self,
                buf: &mut ::sqlx::postgres::PgArgumentBuffer,
            ) -> ::core::result::Result<
                ::sqlx::encode::IsNull,
                ::std::boxed::Box<dyn ::std::error::Error + Send + Sync>,
            > {
                <&str as ::sqlx::Encode<::sqlx::Postgres>>::encode(self.as_str(), buf)
            }
        }

        impl<'r> ::sqlx::Decode<'r, ::sqlx::Postgres> for $name {
            fn decode(
                value: ::sqlx::postgres::PgValueRef<'r>,
            ) -> ::core::result::Result<Self, ::std::boxed::Box<dyn ::std::error::Error + Send + Sync>>
            {
                let s = <&str as ::sqlx::Decode<::sqlx::Postgres>>::decode(value)?;
                Self::from_db(s)
                    .ok_or_else(|| ::std::format!("{} desconocido: {}", ::core::stringify!($name), s).into())
            }
        }
    };
}
