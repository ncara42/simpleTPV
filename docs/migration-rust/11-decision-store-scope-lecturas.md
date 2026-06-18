# Decisión — Alcance store-scope en endpoints de lectura (#157)

> **Decisión de producto/seguridad, no un bug.** Documenta la postura sobre si las
> rutas de **lectura agregada** deben acotarse por tienda (SEC-01) además de por
> tenant (RLS). Resuelve la issue #157 enlazada al EPIC de handoff #158.

## Contexto

El review automático de la migración marcó como posible IDOR/store-scope que varias
rutas de **lectura** no acotan por tienda cuando las consume un `CLERK`:

- `stock`: `by_product`, `alerts`, `expiring`, `movements`, `global`.
- `sales`: `by-ticket`, `void` (lectura previa), `list`.
- `returns`: `list`.

Hoy esas lecturas son **org-scoped por RLS**: un `CLERK` ve los agregados de **toda
su organización**, no solo de su(s) tienda(s).

## Análisis — es fiel al backend NestJS

La comprobación por tienda (`assertStoreAccess` en NestJS / `has_store_access` en
Rust, `crates/domain/src/store_access.rs`) se aplica **exactamente en los mismos
endpoints que el original**: operaciones de **escritura o sensibles** —
`sales create`/`reserveTicketBlock`, `returns create`/`createBlind`,
`stock byStore`/`toReorder`, caja, fichaje, traspasos (destino), dispositivos,
tiendas, z-report. La auditoría SEC-01 acotó la comprobación a esos endpoints, **no**
a los agregados de lectura.

Dos invariantes de diseño sostienen la postura:

1. **`ADMIN`/`MANAGER` son org-wide por diseño** (`ORG_WIDE_ROLES` / `Role::is_org_wide`).
   El store-scope solo afecta al `CLERK`. En el código Rust, todas las llamadas a
   `has_store_access` van guardadas por `if !is_org_wide && ...`.
2. **RLS por tenant es el suelo de seguridad**: ninguna lectura cruza nunca entre
   organizaciones. El alcance en discusión es **intra-organización** (qué ve un
   `CLERK` de las **otras tiendas de su propia empresa**), no cross-tenant.

Está documentado en doc-comments del propio código Rust y verificado por los tests
de aislamiento (`*_rls.rs`, `fase4_rls.rs`).

## Decisión

**Mantener la paridad con NestJS** (los agregados de lectura siguen org-scoped por
RLS; el store-scope solo gobierna escrituras/operaciones sensibles).

### Por qué (especialmente durante el corte strangler)

- **Coherencia de autorización entre backends.** Durante el corte (#156) una misma
  request puede aterrizar en Rust o en NestJS según la ruta. Si Rust endureciese
  estas lecturas y NestJS no, la **misma** petición recibiría autorización distinta
  según quién la sirva — exactamente el tipo de incoherencia que el invariante
  SEC-01 del corte (doc `10-corte-produccion.md`) pide evitar. Reforzar en un solo
  backend rompería esa coherencia.
- **Riesgo residual acotado y no cross-tenant.** El "peor caso" es que un `CLERK`
  vea métricas/listados agregados de **otras tiendas de su misma organización**. No
  hay fuga entre empresas (RLS), ni escritura cross-store (sí gateada). Para un TPV
  multitienda de una pyme, ese alcance intra-org en lecturas es el comportamiento
  histórico esperado, no una vulnerabilidad.
- **YAGNI / menor superficie de cambio.** Endurecer exigiría tocar SQL y firmas en
  ambos backends de forma coordinada, con riesgo de regresión en flujos del TPV que
  hoy funcionan.

## Si en el futuro se decide reforzar (no ahora)

Condiciones que reabrirían la decisión:

- Requisito de producto explícito de que un `CLERK` **no** vea agregados de otras
  tiendas de su organización.
- Fin del corte strangler (NestJS retirado): desaparece la restricción de
  coherencia entre backends y se puede endurecer solo en Rust sin incoherencia.

Cómo se haría, **coordinado en AMBOS backends** mientras conviven:

- Exigir `storeId` + `has_store_access` en esas lecturas para roles no org-wide, o
- Filtrar por `UserStore` en el SQL del agregado (join/where por tiendas asignadas).

## Estado

- **Resuelto**: mantener paridad. Cerrar #157.
- Revisar junto con la retirada de NestJS (Fase 6 / #156) o ante requisito de producto.
