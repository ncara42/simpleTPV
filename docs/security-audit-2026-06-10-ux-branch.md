# Auditoría de seguridad (delta) — rama `feat/ux-improvements`

- **Fecha:** 2026-06-10
- **Alcance:** superficies NUEVAS introducidas por la rama (no re-audita lo cubierto por la
  auditoría completa del 2026-06-03): modelo `SupplierPrice` + endpoints `/supplier-prices`,
  importaciones CSV en lote (`POST /users/import`, `POST /supplier-prices/import`,
  `POST /stores/:id/prices/import`), series del dashboard (`salesKpis`/`marginKpis`),
  persistencia de reorden de familias, auto-login de desarrollo y componente `CsvDropzone`.
- **Metodología:** revisión manual del diff completo + verificación dinámica contra la API
  local (RLS, roles, rechazo cross-tenant) + barrido de patrones peligrosos
  (`$queryRawUnsafe`, `Prisma.raw` con input de usuario, `dangerouslySetInnerHTML`, `eval`,
  secretos hardcodeados) — todos limpios.

## Controles verificados (dinámicamente, contra la API local)

| Control                | Verificación                                                                                   | Resultado                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| RLS en `SupplierPrice` | `GET /supplier-prices` como admin de org1 vs org demo                                          | org1 → 0 filas; demo → sus 18 ✓          |
| Gating por rol         | `GET /supplier-prices` como CLERK                                                              | 403 ✓                                    |
| Escritura cross-tenant | `PUT /supplier-prices` e import CSV de org1 apuntando a proveedor/producto de la org demo      | 400 «Proveedor no encontrado» ✓          |
| Validación de entrada  | UUIDs/decimales fuera de rango en upsert/import                                                | 400 de class-validator ✓                 |
| Migración RLS          | `GRANT` + `ENABLE/FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` con `NULLIF` fail-safe | mismo patrón que las tablas existentes ✓ |

## Hallazgos y correcciones aplicadas en esta auditoría

| #    | Severidad | Hallazgo                                                                                                                                                                                                                                                                               | Corrección                                                                                                                                                                   |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | MEDIUM    | **DoS autenticado por trabajo por fila en imports CSV.** El body JSON está capado a 512kb, pero los imports hacen trabajo costoso por fila (hash bcrypt ≈80 ms/fila en usuarios; lookups + upserts en tarifas). Un CSV al límite (~10k filas) costaría minutos de CPU en una petición. | `MAX_IMPORT_ROWS = 500` en `apps/api/src/common/csv.ts`: `parseCsv` lanza 400 si se supera (mismo orden que `@ArrayMaxSize(500)` de SEC-10). Test unitario en `csv.spec.ts`. |
| D-02 | LOW       | **Lookup por SKU sin `organizationId` explícito** en `supplier-prices.importCsv`. La RLS ya lo aísla, pero el resto del código añade el filtro explícito (defensa en profundidad; ver `store-prices`).                                                                                 | Añadido `organizationId` al `where` del lookup.                                                                                                                              |
| D-03 | INFO      | **`CsvDropzone` sin tope de tamaño en cliente**: un fichero grande producía el 413 genérico del servidor.                                                                                                                                                                              | Tope de 512 KB en cliente (espejo del límite del body) con mensaje claro.                                                                                                    |

## Revisado sin hallazgo

- **Series del dashboard**: `date_trunc(${unit}, …)` interpola `'hour'|'day'` como **parámetro
  posicional** (literal interno, nunca input del usuario); el resto del SQL ya estaba
  parametrizado. `Prisma.raw` solo se usa para nombres de columna literales del código.
- **`POST /users/import`**: hereda `@Roles('ADMIN')` de la clase; valida email/contraseña
  (≥8)/rol por fila con el mismo criterio que el alta manual; las contraseñas se hashean con
  bcrypt y nunca se devuelven (`PUBLIC_SELECT`); `skipDuplicates` no filtra información entre
  tenants (solo afecta al contador).
- **`POST /stores/:id/prices/import`**: reutiliza `assertStoreAccess` (SEC-01) y
  `requireOwned` antes de escribir, igual que `setPrice`.
- **Auto-login de desarrollo** (`useDevAutoLogin`): doblemente gated por
  `import.meta.env.DEV` (eliminado del bundle de producción por tree-shaking) y por las
  variables `VITE_DEV_AUTOLOGIN_*` (no definidas fuera de local).
- **Persistencia de reorden de familias**: usa los endpoints PATCH existentes (validación de
  ciclos y de arquetipo en el servicio); sin superficie nueva.
- **Plantillas CSV como `data:` URI**: contenido estático del código, sin input del usuario.

## Deuda de seguridad preexistente (fuera del alcance del delta)

Sigue aplicando lo abierto en `security-audit-2026-06-03.md` (IDOR horizontal entre tiendas,
VeriFactu best-effort, SSE/Redis sin tope). Ninguna de las superficies nuevas amplía esos
hallazgos: las tarifas de compra y los imports son funciones de central (ADMIN/MANAGER),
no operaciones por tienda del TPV.
