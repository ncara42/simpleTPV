# Spec — Issue #8: Venta v1 (crear venta ACID) + carrito en TPV

| Campo       | Valor                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-05-28                                                                                                                                                                    |
| Autor       | noel@noelcaravaca.com                                                                                                                                                         |
| Estado      | Aprobado para implementación                                                                                                                                                  |
| Issue       | [#8](https://github.com/ncara42/simpleTPV/issues/8) — `area:api`, `area:db`, `area:tpv`, `mvp:week-2`                                                                         |
| Fase MVP    | Semana 2 — Venta v1 funcional en tienda. Base de la que cuelgan #9 (cobro), #10 (descuentos), #11 (ticket), #12 (anulación), #13 (caja), #14 (historial), #15 (devoluciones). |
| Referencias | `Plan_Desarrollo_MVP.md`; patrones de `apps/api/src/products/`, `apps/api/src/prisma/`, RLS de `migrations/20260528065732_product_families`.                                  |

## 1. Objetivo

Camino vertical completo: del carrito en el TPV a una venta persistida de forma atómica y aislada por tenant.

Al cerrar la issue:

- `POST /sales` crea una venta y sus líneas en una transacción ACID (todo o nada).
- El nº de ticket es **secuencial por tienda**, formato `T01-000001`, único.
- La venta queda aislada por tenant (RLS) y asociada a usuario + tienda.
- En el TPV: añadir productos al carrito, cambiar cantidades, eliminar líneas; subtotal y total en vivo; botón que crea la venta.
- Tests: unit del servicio + integración de transacción ACID, secuencialidad del ticket y aislamiento multi-tenant.

## 2. Alcance

**Dentro:**

- Modelos `Sale` y `SaleLine` + cambios en `Store` (`code`, `ticketCounter`), migración con RLS.
- Módulo `sales` en la API: `POST /sales`.
- Carrito en el TPV (store Zustand) + UI + selección de tienda activa + crear venta.

**Fuera (otras issues / deuda intencional):**

- Cobro, medios de pago, cambio → #9.
- Descuentos por línea/ticket → #10 (en esta issue `total = subtotal`).
- Ticket formateado para impresión → #11.
- Decremento de stock → Semana 3 (no-op con `// TODO` que no rompe la transacción).
- `storeId` en el JWT / rediseño de sesión → fuera; se resuelve con selector de tienda en el TPV.

## 3. Schema de datos (Prisma + migración con RLS)

### 3.1 Cambios en `Store`

```prisma
model Store {
  // ... campos existentes ...
  code          String   // código corto: "01", "02"
  ticketCounter Int      @default(0)

  sales Sale[]

  @@unique([organizationId, code])
}
```

- `code` es único por organización; estable aunque cambie el nombre.
- `ticketCounter` es el contador secuencial de tickets de esa tienda.
- El seed asigna `"01"`, `"02"` a las tiendas existentes.

### 3.2 `Sale`

```prisma
model Sale {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  storeId        String   @db.Uuid
  userId         String   @db.Uuid
  ticketNumber   String
  subtotal       Decimal  @db.Decimal(12, 2)
  total          Decimal  @db.Decimal(12, 2)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  store        Store        @relation(fields: [storeId], references: [id])
  user         User         @relation(fields: [userId], references: [id])
  lines        SaleLine[]

  @@unique([organizationId, ticketNumber])
  @@index([organizationId, storeId, createdAt])
}
```

### 3.3 `SaleLine`

```prisma
model SaleLine {
  id        String  @id @default(uuid()) @db.Uuid
  saleId    String  @db.Uuid
  productId String  @db.Uuid
  name      String                       // nombre congelado al vender
  unitPrice Decimal @db.Decimal(10, 4)    // precio congelado (mismo tipo que Product.salePrice)
  qty       Decimal @db.Decimal(10, 3)    // Decimal: hay productos por peso (SaleUnit)
  lineTotal Decimal @db.Decimal(12, 2)

  sale    Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@index([saleId])
}
```

**Decisiones:**

- `name` y `unitPrice` **congelados** en la línea: si el producto cambia de precio/nombre, el ticket histórico no varía.
- `qty` es `Decimal(10,3)`: las cantidades no siempre son enteras (productos por peso).
- `SaleLine` **tiene `organizationId` propio** con su propia policy RLS. Inicialmente se planteó aislarla solo vía la venta padre, pero eso permitiría leer líneas de otro tenant con un `SELECT` directo sobre `SaleLine` sin `JOIN` a `Sale` (fuga). Con `organizationId` + policy directa, el aislamiento es coherente con el resto del schema y no depende de hacer siempre el `JOIN`. El servicio debe poblar `organizationId` en cada línea del nested create.
- **Todas las policies usan `NULLIF`**: `NULLIF(current_setting('app.current_organization_id', true), '')::uuid`. Sin contexto, `current_setting(..., true)` devuelve `''` (no NULL); castear `''::uuid` lanza error 22P02 en vez del fail-safe a 0 filas. Documentado en la migración `20260527235720_rls_nullif_fix`.

### 3.4 Migración

Replica el patrón RLS de `20260528065732_product_families`:

```sql
GRANT ALL ON "Sale" TO app, app_admin;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Sale";
CREATE POLICY tenant_isolation ON "Sale"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);
```

`SaleLine` recibe `GRANT` pero su aislamiento depende del `JOIN` con `Sale` (no tiene policy propia por no llevar `organizationId`). El seed (`packages/db/prisma/seed.ts`) asigna `code` a las tiendas.

## 4. API: módulo `sales`

Estructura calcada de `products/`: `sales.service.ts`, `sales.controller.ts`, `sales.module.ts`, `sales.dto.ts`, specs. Registrado en `app.module.ts`.

### 4.1 `POST /sales`

`@Roles('ADMIN', 'MANAGER', 'CLERK')` — los tres roles pueden vender.

**`CreateSaleDto`** (`class-validator`):

```ts
storeId: string;              // @IsUUID
lines: CreateSaleLineDto[];   // @ArrayMinSize(1), @ValidateNested({ each: true })

// CreateSaleLineDto
productId: string;            // @IsUUID
qty: number;                  // @IsNumber, @IsPositive
```

El cliente manda **solo `productId` + `qty`**. El precio y el nombre los pone el servidor desde la BD (precio de confianza, no manipulable). `userId` sale del JWT; `organizationId` del contexto de tenant.

### 4.2 Flujo del servicio (transacción ACID)

Todo dentro de **una `$transaction` interactiva** con `set_config` manual al inicio, encapsulada en un helper `withTenantTx(prisma, organizationId, fn)` (única escritura del sistema que necesita una transacción multi-operación; el resto usa la extension por-operación).

1. `requireTenant()` → `organizationId`; `userId` del usuario autenticado.
2. Cargar productos (`product.findMany({ where: { id: { in } } })`): valida existencia + tenant (RLS), obtiene `name`/`salePrice` reales. Si falta alguno → `BadRequestException`.
3. Calcular `lineTotal = unitPrice * qty`, `subtotal = Σ lineTotal`, `total = subtotal`.
4. `UPDATE "Store" SET ticketCounter = ticketCounter + 1 WHERE id = storeId RETURNING ticketCounter, code`. Si no afecta filas → `NotFoundException`. Formatear `T{code}-{counter.padStart(6,'0')}`.
5. `sale.create({ data: { ...sale, lines: { create: [...] } } })`.
6. Decremento de stock: `// TODO: stock semana 3` (no-op).

Pasos 4 y 5 comparten la misma transacción → contador y venta son verdaderamente todo-o-nada. Si la venta falla, el contador no queda incrementado (rollback) → sin huecos en la numeración.

### 4.3 Helper `withTenantTx`

Vive junto a `prisma.service.ts` / `tenant-context.ts`. Abre `client.$transaction`, ejecuta `SELECT set_config('app.current_organization_id', $1, true)` como primera sentencia, y pasa el cliente transaccional `tx` al callback. Usa el cliente Prisma **base** (no el extendido) para evitar transacciones anidadas.

## 5. TPV: carrito + crear venta

### 5.1 Cart store (`apps/tpv/src/lib/cart.ts`)

Estilo del store de `@simpletpv/auth`. Estado en memoria del cliente.

```
items: Array<{ productId, name, unitPrice, qty }>
addItem(product)        // si existe, qty+1; si no, lo añade con qty=1
setQty(productId, qty)  // qty<=0 elimina la línea
removeItem(productId)
clear()
// selectores: subtotal, total (Σ unitPrice*qty)
```

El precio se guarda solo para mostrar en vivo; el backend lo recalcula de la BD.

### 5.2 Tienda activa

El TPV llama a `GET /stores`. Si el usuario tiene una sola tienda, se autoselecciona; si varias, desplegable en la cabecera. La `storeId` elegida vive en el estado del TPV y se manda en `POST /sales`. No se toca auth/JWT.

### 5.3 UI

- `CartPanel.tsx`: panel lateral junto al grid de `SalePage`. Lista de líneas (nombre, precio unitario, `+`/`−`, eliminar, total de línea). Pie con subtotal y total en grande.
- Botón **"Crear venta"** (deshabilitado si el carrito está vacío) → `POST /sales` con `{ storeId, lines: [{ productId, qty }] }` vía cliente API tipado de `@simpletpv/auth`.
- Pulsar producto del grid (o escanear) → `addItem`.
- Éxito → `clear()` + aviso con nº de ticket. Error → mensaje, **sin vaciar** el carrito.

## 6. Manejo de errores

| Caso                                     | Respuesta                                                         |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Body malformado                          | 400 (ValidationPipe global)                                       |
| Carrito vacío (`lines` < 1)              | 400 (`@ArrayMinSize(1)`)                                          |
| `productId` inexistente / de otro tenant | 400 `BadRequestException` (qué producto falló)                    |
| `storeId` inexistente / de otro tenant   | 404 `NotFoundException` (UPDATE no afecta filas)                  |
| Fallo a mitad de transacción             | Rollback completo: ni venta, ni líneas, ni incremento de contador |
| Error en el TPV                          | Mensaje al usuario; carrito NO se vacía                           |

## 7. Tests

Convención del repo: sin mocks de BD en integración → Postgres efímero. Estilo de `products.service.spec.ts` y `rls.integration.spec.ts`.

**Unit (`sales.service.spec.ts`):**

- Cálculo de `subtotal`/`total`/`lineTotal` con varias líneas y cantidades decimales.
- Formateo del nº de ticket (`T01-000001`, padding a 6).
- Rechazo de producto inexistente.

**Integración (`sales.integration.spec.ts`), Postgres real:**

- `POST /sales` crea venta + líneas atómicamente; al forzar fallo, no queda nada (ni incremento de contador).
- Nº de ticket secuencial por tienda: dos ventas en la misma tienda → `T01-000001`, `T01-000002`; otra tienda → `T02-000001`. Unicidad.
- Aislamiento por tenant: venta de org A invisible/inaccesible desde org B.
- Precio tomado de BD, no del cliente.

**TPV:** test del cart store (añadir, `+`/`−`, eliminar, subtotal/total). Sin E2E Playwright nuevo en esta issue.
