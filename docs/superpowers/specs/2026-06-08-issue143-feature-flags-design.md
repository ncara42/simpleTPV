# Diseño — #143 Control plane B: feature flags por tienda/organización

> Estado: **VALIDADO 2026-06-08** (decisiones §6). Sub-issue B del épico #127
> (control plane). Sub-issue A (#142 precio por tienda) ya cerrado. Contexto de
> negocio: memoria `cbd-anchor-business-model` (cadena de 7 tiendas CBD que quiere
> activar/desactivar módulos por punto). Diseño del épico:
> `2026-06-08-issue127-control-plane-design.md` §3-B.

## 1. Objetivo

Permitir **activar/desactivar módulos** por tienda u organización, respetando el
aislamiento multi-tenant (RLS por `organizationId`) y **sin romper a quien no use
flags**. Regla rectora (mandato de #143): **un flag ausente = comportamiento actual,
nunca "desactivado"**. Los módulos candidatos están hoy disponibles para todos; el
flag solo sirve para **apagarlos** en una org/tienda concreta.

## 2. Estado actual (verificado)

- **Multi-tenant**: `organizationId` viaja en el JWT → `TenantContextInterceptor`
  abre `AsyncLocalStorage` (`tenantStorage`). El `storeId` **NO** está en el
  contexto: viaja en el body/params de cada endpoint.
- **Autorización**: `@Roles` + `RolesGuard` global (lee `req.user.role`). El
  aislamiento por tienda se hace **dentro de los servicios** con
  `assertStoreAccess(prisma, { userId, role, storeId })` (SEC-01), no en un guard.
- **No existe** registro de capacidades; el frontend decide UI por `role` + `/me`.
- **RLS**: patrón de migración a mano estándar (igual que `StorePrice`):
  `GRANT ALL TO app, app_admin` + `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy
  `tenant_isolation USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)`.

## 3. Modelo de datos (migración a mano + RLS)

```prisma
model FeatureFlag {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  storeId        String?  @db.Uuid    // null = default de la organización
  key            String                // clave del módulo (catálogo en código)
  enabled        Boolean               // true = activo, false = apagado
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  store        Store?       @relation(fields: [storeId], references: [id])

  // Un override por (org, key, tienda) y un default por (org, key). storeId NULL
  // se trata como valor único (NULLS NOT DISTINCT, PG15+): así NO puede haber dos
  // defaults de org para la misma key. La migración crea el índice con esa cláusula.
  @@unique([organizationId, key, storeId])
  @@index([organizationId, key])
}
```

- **`NULLS NOT DISTINCT`**: Prisma genera el índice único, pero por defecto Postgres
  trata cada NULL como distinto → permitiría dos filas `(org, key, NULL)`. La
  migración a mano sustituye el índice por uno con `NULLS NOT DISTINCT` para que el
  default de org sea único. El cliente Prisma sigue usando el selector compuesto
  `organizationId_key_storeId` (upsert en slice 2).
- RLS por tenant (fail-safe): sin contexto → 0 filas → el servicio cae al **default
  del código** (comportamiento actual), nunca a "apagado".

## 4. Resolución y catálogo (el corazón)

### 4.1 Catálogo en código (defaults seguros)

Las claves válidas y su **default en código = comportamiento actual** viven en un
registro (`feature-flags.catalog.ts`). Los 4 módulos del primer corte están hoy ON
para todos → su default es `true`:

```ts
export const FEATURE_FLAGS = {
  blind_returns: { default: true, label: 'Devolución ciega' },
  time_clock: { default: true, label: 'Control horario' },
  data_export: { default: true, label: 'Exportación (ventas y contable)' },
  b2b: { default: true, label: 'Mayorista B2B' },
} as const;
export type FeatureKey = keyof typeof FEATURE_FLAGS;
```

> **Default seguro**: el default de una key SIEMPRE es su comportamiento actual.
> Una key nueva que apague algo sensible debe seguir defaulteando a su conducta
> segura/actual; un flag ausente jamás desactiva un módulo. Un `enabled=false`
> explícito (de org o tienda) es la ÚNICA forma de apagar.

### 4.2 Resolución (store override ?? org default ?? código)

```ts
// FeatureFlagService.isEnabled(key, storeId?)
// Lee en UNA query las filas (org default + override de la tienda) de esa key y
// resuelve: fila de la tienda → fila de org (storeId null) → default del código.
const rows = await this.prisma.featureFlag.findMany({
  where: { organizationId, key, storeId: storeId ? { in: [storeId, null] } : null },
  select: { storeId: true, enabled: true },
});
const store = storeId ? rows.find((r) => r.storeId === storeId) : undefined;
const org = rows.find((r) => r.storeId === null);
return store?.enabled ?? org?.enabled ?? FEATURE_FLAGS[key].default;
```

- `assertEnabled(key, storeId?)`: lanza `ForbiddenException('Módulo no disponible en
esta tienda')` si `isEnabled` es false. Mismo estilo que `assertStoreAccess`.
- `resolveAll(storeId?)`: devuelve `Record<FeatureKey, boolean>` (todas las keys
  resueltas) para `/me/features` — una sola query por org.

### 4.3 Enforcement (decisión §6: check en servicio)

`FeatureFlagService.assertEnabled` se llama **dentro del servicio**, donde el
`storeId` y el tenant ya están a mano (igual que `assertStoreAccess`). Puntos:

| key             | módulo                 | punto de enforcement                                                                   | scope  |
| --------------- | ---------------------- | -------------------------------------------------------------------------------------- | ------ |
| `blind_returns` | devolución ciega       | `ReturnsService.createBlind` (tras `assertStoreAccess`, `dto.storeId`)                 | tienda |
| `time_clock`    | control horario        | `TimeClockService.create` (tras `assertStoreAccess`, `input.storeId`)                  | tienda |
| `data_export`   | export ventas/contable | `SalesExportService.requestExport` (cubre ambos formatos)                              | org    |
| `b2b`           | mayorista B2B          | `WholesaleOrdersService.create`, `CustomersService.create`, `PriceListsService.create` | org    |

- **Store-level** (`blind_returns`, `time_clock`): se pasa el `storeId` → resuelve
  override de tienda ?? default de org ?? código.
- **Org-level** (`data_export`, `b2b`): sin `storeId` → resuelve default de org ??
  código. (Estos módulos son de central; no tienen tienda en la acción.)
- Las **lecturas** de estos módulos no se gatean en slice 1 (no rompen nada; la UI
  las oculta en slice 2). El enforcement va en las **acciones** (mutaciones/registro
  de export), que es donde "usar el módulo" tiene efecto.

### 4.4 `/me/features` (para el frontend)

`GET /me/features?storeId=<uuid?>` → `FeatureFlagService.resolveAll(storeId)`. El
frontend lo cachea al arrancar y oculta/des­habilita UI. El backend sigue siendo la
fuente de verdad: aunque el cliente oculte un botón, el endpoint devuelve **403** si
el flag está apagado. `@Roles('ADMIN','MANAGER','CLERK')` (todos lo consultan).

## 5. Plan de slices

1. **Slice 1 (este):** modelo `FeatureFlag` + migración a mano + RLS (+ índice
   `NULLS NOT DISTINCT`) + `prisma generate`. Catálogo en código.
   `FeatureFlagService` (`isEnabled`/`assertEnabled`/`resolveAll`). Enforcement en
   los 4 módulos (§4.3). `GET /me/features`. Tipo compartido + lib frontend (solo
   lectura de features, sin UI de gestión). Tests: unit (resolución store??org??código;
   assertEnabled; resolveAll; que cada servicio bloquea con flag off) + integración
   (RLS de `FeatureFlag`; resolución real; flag off bloquea la acción; aislamiento).
2. **Slice 2:** endpoints de gestión `@Roles('ADMIN','MANAGER')` (fijar/quitar flag
   por org/tienda, `assertStoreAccess` para store-level) + UI backoffice (matriz de
   módulos × tiendas) + ocultar UI en backoffice/TPV según `/me/features`. Cierra #143.

## 6. Decisiones (validadas 2026-06-08)

- **Q1 — Enforcement:** ✅ **Check en servicio** (`FeatureFlagService.assertEnabled`),
  no guard/decorator: el `storeId` ya está a mano, resuelve org y tienda igual, 403 si
  apagado, fácil de testear; consistente con `assertStoreAccess`.
- **Q2 — Catálogo del primer corte:** ✅ los **4**: `blind_returns`, `time_clock`,
  `data_export`, `b2b`. Todos hoy ON; el flag solo apaga.
- **Q3 — Slicing:** ✅ **2 slices** (core+enforcement, luego gestión+UI).
- **Default seguro (no negociable):** flag ausente = comportamiento actual; solo un
  `enabled=false` explícito apaga.

## 7. Seguridad y robustez

- **RLS fail-safe** en `FeatureFlag` (sin tenant → 0 filas → cae al default del
  código, nunca a "apagado"). `organizationId` explícito en todos los `where`.
- **Nunca apagar por omisión**: la ausencia de fila resuelve al comportamiento
  actual. Un bug que borre flags NO desactiva módulos (cae al default seguro).
- **Backend fuente de verdad**: `/me/features` solo informa a la UI; el bloqueo real
  es el `assertEnabled` (403) en el servidor.
- **Aislamiento por tienda** en la gestión (slice 2): `assertStoreAccess` al fijar un
  flag de tienda (un MANAGER no apaga módulos de la tienda de otro).
- **Org-level solo ADMIN** (slice 2, least privilege): un flag a nivel org (sin
  `storeId`) afecta a TODAS las tiendas → es un cambio de control-plane org-wide y se
  restringe a `ADMIN` en `setFlag`/`clearFlag`. El `MANAGER` solo gestiona flags de
  tienda (acotado por `assertStoreAccess`). Defensa en profundidad sobre el
  `@Roles('ADMIN','MANAGER')` del controller (cierra escalada de privilegio: un MANAGER
  no podía apagar un módulo para toda la organización).

## 8. Riesgos

- Un flag mal configurado podría apagar un módulo operativo → mitigado: defaults
  seguros (ausencia = actual), gestión solo ADMIN/MANAGER, y `/me/features` visible
  para auditar el estado efectivo.
- Resolución incorrecta (precedencia) → cobertura unit del orden
  `tienda ?? org ?? código` con las 4 combinaciones + integración del bloqueo real.
