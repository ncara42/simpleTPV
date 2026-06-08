# Diseño — #127 Control plane multi-tienda (épico)

> Estado: **BORRADOR para validar** (no tocar código hasta aprobar). Issue: ncara42/simpleTPV #127.
> Épico → se entrega en **sub-issues**. Contexto de negocio: memoria `cbd-anchor-business-model`
> (cliente ancla 7 tiendas CBD). Gotchas: `docs/roadmap-post-mvp.md` §3.

## 1. Objetivo

Soportar la operación de la cadena (7 tiendas): **precio por tienda** (retail), **feature
flags** por tienda/org, y **vista central** cross-tienda. Todo respetando el aislamiento
multi-tenant (RLS por `organizationId`) y sin tocar el flujo de las tiendas que no lo usen.

## 2. Estado actual (lo que hay, verificado)

- **Multi-tenant**: `organizationId` en el JWT; RLS por-operación vía `PrismaService` `$extends`
  (`set_config('app.current_organization_id', …)` en `$transaction`); sin contexto → 0 filas
  (fail-safe). Tiendas (`Store`) cuelgan de la org (`@@unique([organizationId, code])`).
- **Precio retail**: el PVP es del producto (`Product.salePrice Decimal(10,4)`). La venta lo
  resuelve en **un único punto** — `sales.service.ts` `unitPrice: Number(product.salePrice)`
  (el servidor lo fija; el DTO de línea NO acepta precio del cliente). `taxRate`/`costPrice`
  se **congelan** en la `SaleLine` (histórico de margen). Descuentos por rol limitados.
- **Tarifas B2B** (`PriceList`/`PriceListItem`, `@@unique([priceListId, productId])`,
  `price Decimal(10,4)`): se aplican **solo en pedidos mayoristas** (`wholesale-orders.service`,
  patrón `tariffById.get(productId) ?? salePrice`), NO en la venta retail del TPV.
- **Autorización de precios**: crear/editar precio de producto y tarifas B2B es
  `@Roles('ADMIN','MANAGER')`; CLERK no fija precios. `RolesGuard` global lee `req.user.role`.
- **No existe**: precio retail por tienda, ni feature flags, ni vista central agregada.

## 3. Decomposición en sub-issues (orden recomendado)

**Sub-issue A — Precio por tienda (retail).** Override del PVP del producto por `Store`,
resuelto en la venta. El más valioso y concreto → **primero**. (Diseño detallado en §4.)

**Sub-issue B — Feature flags por tienda/org.** Activar/desactizar módulos por punto
(p.ej. devolución ciega, control horario, export). Modelo `FeatureFlag` (org + store? null=org)

- servicio de resolución (store override ?? org default ?? default del código) + guard/decorator
  o check en servicio + UI backoffice. Diseño propio cuando se aborde.

**Sub-issue C — Vista central cross-tienda.** Agregados de gestión multi-tienda para el dueño
de la cadena (ventas/stock/alertas por tienda en una vista), respetando RLS (todo dentro de la
org; el "central" es cross-store, NO cross-org). Mayormente lectura/dashboard. Diseño propio.

> Cada sub-issue: spec → slices → PR a `main` con gate verde, forks sincronizados. Este
> documento cubre el **épico** y deja A listo para implementar; B y C tendrán su propio spec.

## 4. Diseño detallado — Sub-issue A: precio por tienda (retail)

### 4.1 Modelo de datos (migración a mano + RLS)

Nueva tabla `StorePrice` (clon estructural de `Stock`):

```prisma
model StorePrice {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  productId      String   @db.Uuid
  storeId        String   @db.Uuid
  price          Decimal  @db.Decimal(10, 4)   // PVP retail de ESTE producto en ESTA tienda
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  product      Product      @relation(fields: [productId], references: [id])
  store        Store        @relation(fields: [storeId], references: [id])

  @@unique([productId, storeId])              // un override por (producto, tienda)
  @@index([organizationId, storeId])          // lookup en la venta por tienda
}
```

- **Override absoluto** (no porcentaje): un PVP concreto por (producto, tienda). Sin fila →
  cae al `Product.salePrice` (comportamiento actual intacto). Mismo patrón y precisión
  `Decimal(10,4)` que B2B → consistencia y sin pérdida de céntimos.
- Migración **a mano** (Prisma 7) con el bloque RLS estándar: `GRANT ALL TO app, app_admin`
  - `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation USING (organizationId =
NULLIF(current_setting('app.current_organization_id', true),'')::uuid)`.

### 4.2 Resolución del precio en la venta (el corazón, money-safe)

En `SalesService.create`, ANTES del `.map` que construye las líneas, un **único** `findMany`
de los overrides de la tienda de la venta para los productos del ticket (evita N+1):

```ts
const overrides = await this.prisma.storePrice.findMany({
  where: { storeId: dto.storeId, productId: { in: ids }, organizationId: tenant.organizationId },
  select: { productId: true, price: true },
});
const priceByProduct = new Map(overrides.map((o) => [o.productId, Number(o.price)]));
// en el .map de cada línea:
const unitPrice = priceByProduct.get(product.id) ?? Number(product.salePrice);
```

Idéntico patrón al B2B (`tarifa ?? salePrice`). **Invariantes que NO cambian**: el precio lo
sigue fijando el servidor (el cliente nunca manda `unitPrice`); `taxRate`/`costPrice` se
congelan igual; descuentos/IVA/totales operan sobre el `unitPrice` ya resuelto. El override
solo cambia DE DÓNDE sale `unitPrice`. → blast radius mínimo, una sola línea efectiva.

### 4.3 Gestión (backoffice) y autorización

- Endpoints `@Roles('ADMIN','MANAGER')` (igual que precio de producto y tarifas B2B; CLERK no
  fija precios): `PUT /stores/:storeId/prices` (upsert override por producto) y
  `DELETE /stores/:storeId/prices/:productId` (quitar override → vuelve al PVP) + `GET` para
  listar overrides de una tienda. Validación: `price` `Decimal(12,?)`… usar `@IsNumber({maxDecimalPlaces:4})`,
  `@Min(0)`, `@Max(MAX_*)`; `assertStoreAccess` para que un MANAGER solo toque sus tiendas (SEC-01).
- UI backoffice: en la ficha de tienda (o de producto) una tabla de overrides por tienda;
  reusar el patrón de edición de tarifas B2B.

### 4.4 Seguridad y robustez (checklist)

- **RLS fail-safe** en `StorePrice` (sin tenant → 0 filas); `organizationId` explícito en todos
  los `where` (defensa en profundidad), como el resto del código.
- **Precio servidor-only**: el TPV nunca envía precio; el override se resuelve en el servidor.
- **Aislamiento por tienda (SEC-01)**: `assertStoreAccess` al gestionar overrides; un MANAGER de
  la tienda A no fija precios de la B.
- **Precisión monetaria**: `Decimal(10,4)`, `Number()` solo en el borde de cálculo (igual que hoy).
- **Histórico intacto**: el precio se congela en `SaleLine.unitPrice` al vender (auditable);
  cambiar un override no altera ventas pasadas.
- **No-rotura**: producto sin override → flujo idéntico al actual (tiendas que no usan pricing
  por tienda no notan nada).

### 4.5 Plan de slices (sub-issue A)

1. **Modelo + migración a mano + RLS** (`StorePrice`) + `prisma generate`. Integración RLS del
   override (aislamiento por tenant).
2. **Resolución en venta + gestión**: override en `SalesService.create` (unit: precio resuelto
   con/sin override) + endpoints de gestión (`@Roles`, `assertStoreAccess`) + UI backoffice.
   Unit (resolución override?? salePrice; autorización) + integración (la venta usa el precio de
   la tienda; sin override usa el PVP; aislamiento; congelado del precio en la línea).

## 5. Decisiones (validadas 2026-06-08)

- **Q1 — Modelo:** ✅ **Tabla nueva `StorePrice`** (producto, tienda)→precio (clon de `Stock`
  - RLS). Sin override → cae al `Product.salePrice`.
- **Q2 — Tipo de override:** ✅ **Precio absoluto** por producto/tienda (como B2B).
- **Q3 — Alcance:** ✅ **Solo retail** (venta TPV). El mayorista (B2B) mantiene su tarifa por
  cliente; no se combinan.
- **Q4 — Orden:** ✅ **A (pricing) → B (flags) → C (vista central)**.
- **Q5 — Sub-issues:** ✅ Crear las **3 sub-issues** (A/B/C) en GitHub bajo #127; empezar por A.

## 6. Riesgos

- Toca la resolución de precio de la venta (**dinero**): un error cobra de más/menos.
  Mitigación: un único punto de cambio (override ?? salePrice), igual al patrón B2B ya probado;
  cobertura de integración del precio efectivo con y sin override; el precio se congela en la
  línea (auditable).
- Épico amplio: mitigado partiéndolo en A/B/C con specs y PRs independientes.
- Feature flags (B) mal resueltos podrían apagar módulos de seguridad por error → su spec debe
  definir defaults seguros (un flag ausente = comportamiento actual, nunca "desactivado").
