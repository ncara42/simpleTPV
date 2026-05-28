# Venta v1 (crear venta ACID) + carrito TPV — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir una venta (cabecera + líneas) de forma atómica y aislada por tenant desde un carrito en el TPV, con nº de ticket secuencial por tienda.

**Architecture:** Modelos `Sale`/`SaleLine` + `code`/`ticketCounter` en `Store` con RLS. Módulo NestJS `sales` con `POST /sales` que ejecuta una `$transaction` interactiva (helper `withTenantTx`) donde incrementa el contador y crea venta+líneas en un solo bloque ACID; el precio lo pone el servidor. En el TPV, un store Zustand para el carrito + selector de tienda + botón de crear venta.

**Tech Stack:** NestJS 11, Prisma 6 (adapter-pg, `$extends` RLS), PostgreSQL 16, React 19 + Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-issue8-venta-crear-design.md`

---

## File Structure

**Base de datos (`packages/db/`):**

- Modify: `prisma/schema.prisma` — `code`/`ticketCounter` en `Store`; modelos `Sale`, `SaleLine`; relaciones inversas en `Organization`, `User`, `Product`.
- Create: `prisma/migrations/<timestamp>_sales/migration.sql` — generada por Prisma + bloque RLS manual.
- Modify: `prisma/seed.ts` — `code` `"01"`/`"02"` a las tiendas.

**API (`apps/api/src/`):**

- Create: `prisma/with-tenant-tx.ts` — helper de transacción interactiva con `set_config`.
- Create: `sales/sales.dto.ts`, `sales/sales.service.ts`, `sales/sales.controller.ts`, `sales/sales.module.ts`.
- Create: `sales/sales.service.spec.ts` (unit), `test/sales.integration.spec.ts` (integración).
- Modify: `app.module.ts` — registrar `SalesModule`.

**Tipos compartidos (`packages/auth/src/`):**

- Modify: `api-types.ts` — `code` en `Store`; tipos `Sale`, `SaleLine`, `CreateSaleInput`.
- Modify: `index.ts` — exportar los tipos nuevos.

**TPV (`apps/tpv/src/`):**

- Create: `lib/cart.ts` — store Zustand del carrito.
- Create: `lib/cart.test.ts` — test del store.
- Create: `lib/sales.ts` — `createSale()` y `listStores()`.
- Create: `CartPanel.tsx` — UI del carrito.
- Modify: `SalePage.tsx` — añadir al carrito al pulsar producto + selector de tienda + render de `CartPanel`.
- Modify: `sale.css` — estilos del panel.

---

## Task 1: Schema Prisma — Store, Sale, SaleLine

**Files:**

- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Añadir campos a `Store`**

En el `model Store`, añade `code` y `ticketCounter`, la relación inversa `sales` y el unique. Queda así:

```prisma
model Store {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  address        String?
  active         Boolean  @default(true)
  code           String
  ticketCounter  Int      @default(0)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  users        UserStore[]
  sales        Sale[]

  @@unique([organizationId, code])
  @@index([organizationId])
}
```

- [ ] **Step 2: Añadir modelos `Sale` y `SaleLine`**

Al final del fichero (antes de los `enum`):

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

model SaleLine {
  id        String  @id @default(uuid()) @db.Uuid
  saleId    String  @db.Uuid
  productId String  @db.Uuid
  name      String
  unitPrice Decimal @db.Decimal(10, 4)
  qty       Decimal @db.Decimal(10, 3)
  lineTotal Decimal @db.Decimal(12, 2)

  sale    Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@index([saleId])
}
```

- [ ] **Step 3: Añadir relaciones inversas en `Organization`, `User`, `Product`**

En `model Organization`, añade a la lista de relaciones: `sales Sale[]`
En `model User`, añade: `sales Sale[]`
En `model Product`, añade: `saleLines SaleLine[]`

- [ ] **Step 4: Validar el schema**

Run: `pnpm --filter @simpletpv/db exec prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): modelos Sale/SaleLine y code/ticketCounter en Store (#8)"
```

---

## Task 2: Migración con RLS

**Files:**

- Create: `packages/db/prisma/migrations/<timestamp>_sales/migration.sql`

- [ ] **Step 1: Generar la migración**

Run: `pnpm --filter @simpletpv/db exec prisma migrate dev --name sales --create-only`
Expected: crea `prisma/migrations/<timestamp>_sales/migration.sql` con los `CREATE TABLE`/`ALTER TABLE`. `--create-only` la genera sin aplicarla todavía (necesitamos editarla).

- [ ] **Step 2: Resolver el `code` NOT NULL sin default**

`Store.code` es NOT NULL y la tabla puede tener filas (seed). Edita la migración: la línea `ALTER TABLE "Store" ADD COLUMN "code" TEXT NOT NULL;` fallaría sobre filas existentes. Cámbiala por un patrón en dos pasos — añadir con default temporal, backfill por orden de creación, quitar el default:

```sql
ALTER TABLE "Store" ADD COLUMN "code" TEXT;
ALTER TABLE "Store" ADD COLUMN "ticketCounter" INTEGER NOT NULL DEFAULT 0;

-- Backfill: numera las tiendas por organización, "01", "02", ... según createdAt.
WITH numbered AS (
  SELECT id, LPAD((ROW_NUMBER() OVER (
    PARTITION BY "organizationId" ORDER BY "createdAt", id
  ))::text, 2, '0') AS code
  FROM "Store"
)
UPDATE "Store" s SET "code" = n.code FROM numbered n WHERE s.id = n.id;

ALTER TABLE "Store" ALTER COLUMN "code" SET NOT NULL;
```

Deja el resto de la migración (CREATE TABLE Sale/SaleLine, índices, FKs, el `@@unique` de Store → `CREATE UNIQUE INDEX "Store_organizationId_code_key"`) tal como la generó Prisma.

- [ ] **Step 3: Añadir el bloque RLS al final de la migración**

Replica el patrón de `20260528065732_product_families/migration.sql`:

```sql
-- RLS para Sale (mismo patrón que las tablas existentes).
-- Sin contexto de tenant → current_setting(..., true) = NULL → 0 filas (fail-safe).
GRANT ALL ON "Sale" TO app, app_admin;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Sale";
CREATE POLICY tenant_isolation ON "Sale"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- SaleLine no tiene organizationId: se aísla vía la venta padre (JOIN con Sale).
-- Necesita GRANT para que el rol app pueda escribir/leer las líneas de sus ventas.
GRANT ALL ON "SaleLine" TO app, app_admin;
```

- [ ] **Step 4: Aplicar la migración a la BD de desarrollo**

Run: `pnpm --filter @simpletpv/db exec prisma migrate deploy`
Expected: "All migrations have been successfully applied."
Luego regenera el cliente: `pnpm --filter @simpletpv/db exec prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/migrations
git commit -m "feat(db): migración de Sale/SaleLine con RLS y backfill de code (#8)"
```

---

## Task 3: Seed — code en las tiendas

**Files:**

- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Añadir `code` al tipo y a los datos de stores**

En `seed.ts`, el tipo de `stores` (línea ~25) pasa a incluir `code`:

```ts
stores: Array<{ id: string; name: string; code: string }>;
```

En `ORG1.stores`:

```ts
stores: [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Tienda Madrid Centro', code: '01' },
  { id: '11111111-1111-1111-1111-111111111112', name: 'Almacén Central Madrid', code: '02' },
],
```

En `ORG2.stores`:

```ts
stores: [
  { id: '22222222-2222-2222-2222-222222222221', name: 'Tienda Sevilla', code: '01' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Tienda Málaga', code: '02' },
],
```

- [ ] **Step 2: Pasar `code` en el upsert de store**

En el bucle `for (const store of spec.stores)`, el `create` incluye `code`:

```ts
await prisma.store.upsert({
  where: { id: store.id },
  update: { code: store.code },
  create: { id: store.id, organizationId: org.id, name: store.name, code: store.code },
});
```

- [ ] **Step 3: Ejecutar el seed**

Run: `pnpm --filter @simpletpv/db exec prisma db seed`
Expected: termina sin error (seed idempotente).

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat(db): asignar code 01/02 a tiendas en el seed (#8)"
```

---

## Task 4: Helper `withTenantTx`

**Files:**

- Create: `apps/api/src/prisma/with-tenant-tx.ts`

- [ ] **Step 1: Escribir el helper**

Usa el cliente Prisma **base** (no el extendido) para abrir una `$transaction` interactiva, fija el tenant con `set_config` LOCAL y pasa el cliente transaccional al callback. Replica el SQL parametrizado de `applyTenantExtension`.

```ts
import type { PrismaService } from './prisma.service.js';

// Cliente transaccional de Prisma (lo que recibe el callback de $transaction).
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

// Ejecuta `fn` dentro de UNA transacción interactiva con el tenant fijado
// (set_config LOCAL = vive en la tx). Para escrituras multi-tabla que deben ser
// atómicas Y respetar RLS — la extension por-operación no sirve aquí porque
// abriría una transacción distinta por cada operación.
//
// IMPORTANTE: invocar con el cliente Prisma BASE (sin applyTenantExtension),
// si no se anidarían transacciones.
export function withTenantTx<T>(
  base: PrismaService,
  organizationId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
```

- [ ] **Step 2: Verificar que typechequea**

Run: `pnpm --filter @simpletpv/api typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/prisma/with-tenant-tx.ts
git commit -m "feat(api): helper withTenantTx para escrituras ACID con RLS (#8)"
```

---

## Task 5: DTO de ventas

**Files:**

- Create: `apps/api/src/sales/sales.dto.ts`

- [ ] **Step 1: Escribir el DTO**

```ts
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsPositive, IsUUID, ValidateNested } from 'class-validator';

export class CreateSaleLineDto {
  @IsUUID()
  productId!: string;

  @IsPositive()
  qty!: number;
}

export class CreateSaleDto {
  @IsUUID()
  storeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  lines!: CreateSaleLineDto[];
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @simpletpv/api typecheck`
Expected: sin errores. (Si `class-transformer` no estuviera instalado, añádelo: `pnpm --filter @simpletpv/api add class-transformer` — pero NestJS 11 lo trae como peer de `@nestjs/common`, verifica antes con `pnpm --filter @simpletpv/api list class-transformer`.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/sales/sales.dto.ts
git commit -m "feat(api): CreateSaleDto con validación de líneas (#8)"
```

---

## Task 6: Servicio de ventas (unit test primero)

**Files:**

- Create: `apps/api/src/sales/sales.service.spec.ts`
- Create: `apps/api/src/sales/sales.service.ts`

- [ ] **Step 1: Escribir el test unitario del cálculo y el formato de ticket**

El test aísla la lógica pura. Extraemos dos funciones puras del servicio: `formatTicket(code, counter)` y `computeTotals(lines)`. El test las prueba directamente.

```ts
import { describe, expect, it } from 'vitest';

import { computeTotals, formatTicket } from './sales.service.js';

describe('formatTicket', () => {
  it('formatea code + contador con padding a 6', () => {
    expect(formatTicket('01', 1)).toBe('T01-000001');
    expect(formatTicket('02', 123456)).toBe('T02-123456');
  });
});

describe('computeTotals', () => {
  it('calcula lineTotal, subtotal y total con cantidades decimales', () => {
    const result = computeTotals([
      { productId: 'p1', name: 'A', unitPrice: 12.5, qty: 2 },
      { productId: 'p2', name: 'B', unitPrice: 3.333, qty: 1.5 },
    ]);
    expect(result.lines[0]!.lineTotal).toBeCloseTo(25, 2);
    expect(result.lines[1]!.lineTotal).toBeCloseTo(5, 2);
    expect(result.subtotal).toBeCloseTo(30, 2);
    expect(result.total).toBeCloseTo(30, 2);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter @simpletpv/api exec vitest run src/sales/sales.service.spec.ts`
Expected: FAIL — `formatTicket`/`computeTotals` no existen.

- [ ] **Step 3: Implementar el servicio**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreateSaleDto } from './sales.dto.js';

interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export function formatTicket(code: string, counter: number): string {
  return `T${code}-${String(counter).padStart(6, '0')}`;
}

export function computeTotals(lines: PricedLine[]): {
  lines: Array<PricedLine & { lineTotal: number }>;
  subtotal: number;
  total: number;
} {
  const priced = lines.map((l) => ({ ...l, lineTotal: l.unitPrice * l.qty }));
  const subtotal = priced.reduce((acc, l) => acc + l.lineTotal, 0);
  return { lines: priced, subtotal, total: subtotal };
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleDto, userId: string) {
    const tenant = requireTenant();

    // El cliente extendido ya aplica RLS por-operación: esta lectura solo ve
    // productos del tenant. Si falta alguno → error (no se mezcla con otro tenant).
    const ids = dto.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const priced: PricedLine[] = dto.lines.map((l) => {
      const product = byId.get(l.productId);
      if (!product) {
        throw new BadRequestException(`Producto ${l.productId} no encontrado`);
      }
      return {
        productId: l.productId,
        name: product.name,
        unitPrice: Number(product.salePrice),
        qty: l.qty,
      };
    });

    const { lines, subtotal, total } = computeTotals(priced);

    // El cliente inyectado es el extendido; necesitamos el base para abrir UNA
    // transacción que incluya el incremento del contador + la creación. Como el
    // extendido envuelve cada operación en su propia tx, usamos el método
    // $transaction del propio cliente: withTenantTx fija el tenant con set_config
    // LOCAL y todo corre en esa única tx.
    return withTenantTx(this.prisma, tenant.organizationId, async (tx) => {
      const updated = await tx.$queryRaw<Array<{ code: string; ticketCounter: number }>>`
        UPDATE "Store" SET "ticketCounter" = "ticketCounter" + 1
        WHERE id = ${dto.storeId}::uuid
        RETURNING code, "ticketCounter"
      `;
      const store = updated[0];
      if (!store) {
        throw new NotFoundException(`Tienda ${dto.storeId} no encontrada`);
      }
      const ticketNumber = formatTicket(store.code, store.ticketCounter);

      // TODO: stock semana 3 — decrementar stock atómicamente aquí (no-op por ahora).

      return tx.sale.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: dto.storeId,
          userId,
          ticketNumber,
          subtotal,
          total,
          lines: {
            create: lines.map((l) => ({
              organizationId: tenant.organizationId,
              productId: l.productId,
              name: l.name,
              unitPrice: l.unitPrice,
              qty: l.qty,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter @simpletpv/api exec vitest run src/sales/sales.service.spec.ts`
Expected: PASS (ambos describe).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sales/sales.service.ts apps/api/src/sales/sales.service.spec.ts
git commit -m "feat(api): SalesService con cálculo de totales y ticket secuencial (#8)"
```

---

## Task 7: Controller y módulo de ventas

**Files:**

- Create: `apps/api/src/sales/sales.controller.ts`
- Create: `apps/api/src/sales/sales.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Escribir el controller**

`userId` sale de `req.user.sub` (el JWT), no del body.

```ts
import { Body, Controller, Post, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateSaleDto } from './sales.dto.js';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateSaleDto, @Req() req: { user: JwtPayload }) {
    return this.sales.create(body, req.user.sub);
  }
}
```

- [ ] **Step 2: Escribir el módulo**

```ts
import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
```

- [ ] **Step 3: Registrar en `app.module.ts`**

Añade el import y mételo en el array `imports` (junto a `ProductsModule`):

```ts
import { SalesModule } from './sales/sales.module.js';
```

Y en `imports: [...]` añade `SalesModule,`.

- [ ] **Step 4: Verificar typecheck y build**

Run: `pnpm --filter @simpletpv/api typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sales/sales.controller.ts apps/api/src/sales/sales.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): controller y módulo sales, POST /sales (#8)"
```

---

## Task 8: Test de integración (transacción ACID, ticket secuencial, RLS)

**Files:**

- Create: `apps/api/test/sales.integration.spec.ts`

Sigue el patrón de `test/rls.integration.spec.ts`: cliente base + `applyTenantExtension`, descubrimiento de IDs vía cliente admin (`DATABASE_URL`), tenant fijado con `tenantStorage.run(...)`.

- [ ] **Step 1: Escribir el test de integración**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SalesService } from '../src/sales/sales.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('Ventas — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: SalesService;
  let org1Id: string;
  let store1Id: string;
  let store2Id: string;
  let user1Id: string;
  let product1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    // El service recibe el cliente extendido (igual que en producción vía DI),
    // pero withTenantTx usa $transaction del cliente base subyacente.
    service = new SalesService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) throw new Error('DATABASE_URL (superuser) requerido en setup.');
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
    try {
      const [o1] = await admin.$queryRaw<
        Array<{ id: string }>
      >`SELECT id::text FROM "Organization" WHERE nif='B11111111'`;
      const [o2] = await admin.$queryRaw<
        Array<{ id: string }>
      >`SELECT id::text FROM "Organization" WHERE nif='B22222222'`;
      org1Id = o1!.id;
      org2Id = o2!.id;
      const stores = await admin.$queryRaw<
        Array<{ id: string; code: string }>
      >`SELECT id::text, code FROM "Store" WHERE "organizationId"=${org1Id}::uuid ORDER BY code`;
      store1Id = stores[0]!.id;
      store2Id = stores[1]!.id;
      const [u1] = await admin.$queryRaw<
        Array<{ id: string }>
      >`SELECT id::text FROM "User" WHERE email='clerk@org1.test'`;
      user1Id = u1!.id;
      const [p1] = await admin.$queryRaw<
        Array<{ id: string }>
      >`SELECT id::text FROM "Product" WHERE "organizationId"=${org1Id}::uuid LIMIT 1`;
      product1Id = p1!.id;
    } finally {
      await admin.$disconnect();
    }
  });

  afterAll(async () => {
    await base.onModuleDestroy();
  });

  it('crea venta + líneas atómicamente y devuelve nº de ticket', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ storeId: store1Id, lines: [{ productId: product1Id, qty: 2 }] }, user1Id),
    );
    expect(sale.ticketNumber).toMatch(/^T\d{2}-\d{6}$/);
    expect(sale.lines).toHaveLength(1);
    expect(Number(sale.total)).toBeGreaterThan(0);
  });

  it('numera tickets secuencialmente por tienda', async () => {
    const a = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }] }, user1Id),
    );
    const b = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }] }, user1Id),
    );
    const numA = Number(a.ticketNumber.split('-')[1]);
    const numB = Number(b.ticketNumber.split('-')[1]);
    expect(numB).toBe(numA + 1);
    expect(a.ticketNumber.startsWith('T')).toBe(true);
  });

  it('rechaza producto inexistente sin crear venta', async () => {
    await expect(
      tenantStorage.run({ organizationId: org1Id }, () =>
        service.create(
          {
            storeId: store1Id,
            lines: [{ productId: '00000000-0000-0000-0000-000000000000', qty: 1 }],
          },
          user1Id,
        ),
      ),
    ).rejects.toThrow();
  });

  it('aísla por tenant: org2 no ve la venta creada por org1', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }] }, user1Id),
    );
    const seenByOrg2 = await tenantStorage.run({ organizationId: org2Id }, () =>
      prisma.sale.findUnique({ where: { id: sale.id } }),
    );
    expect(seenByOrg2).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test de integración**

Asegúrate de que Postgres está arriba, migraciones aplicadas y seed ejecutado (Tasks 2 y 3). Luego:

Run: `pnpm --filter @simpletpv/api test:int`
Expected: PASS — los 4 tests verdes. Si falla por "Tienda no encontrada", revisa que el seed corrió tras la migración.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/sales.integration.spec.ts
git commit -m "test(api): integración de ventas — ACID, ticket secuencial y RLS (#8)"
```

---

## Task 9: Tipos compartidos en @simpletpv/auth

**Files:**

- Modify: `packages/auth/src/api-types.ts`
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Añadir `code` a `Store` y los tipos de venta**

En `api-types.ts`, añade `code` al interface `Store`:

```ts
export interface Store {
  id: string;
  name: string;
  address: string | null;
  code: string;
  active: boolean;
}
```

Y al final del fichero los tipos de venta (Decimal viaja como string sobre HTTP):

```ts
export interface SaleLine {
  id: string;
  productId: string;
  name: string;
  unitPrice: string;
  qty: string;
  lineTotal: string;
}

export interface Sale {
  id: string;
  storeId: string;
  userId: string;
  ticketNumber: string;
  subtotal: string;
  total: string;
  createdAt: string;
  lines: SaleLine[];
}

export interface CreateSaleInput {
  storeId: string;
  lines: Array<{ productId: string; qty: number }>;
}
```

- [ ] **Step 2: Exportarlos en `index.ts`**

En el bloque `export type { ... } from './api-types.js';` añade `CreateSaleInput`, `Sale`, `SaleLine` (orden alfabético junto a los demás).

- [ ] **Step 3: Verificar typecheck del paquete**

Run: `pnpm --filter @simpletpv/auth typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add packages/auth/src/api-types.ts packages/auth/src/index.ts
git commit -m "feat(auth): tipos Sale/SaleLine/CreateSaleInput y code en Store (#8)"
```

---

## Task 10: Cart store (Zustand) en el TPV — test primero

**Files:**

- Create: `apps/tpv/src/lib/cart.test.ts`
- Create: `apps/tpv/src/lib/cart.ts`

- [ ] **Step 1: Escribir el test del store**

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useCart } from './cart.js';

const product = { id: 'p1', name: 'Flor CBD', salePrice: '12.50' };

describe('useCart', () => {
  beforeEach(() => {
    useCart.getState().clear();
  });

  it('añade un producto con qty 1 y vuelve a sumarlo si ya está', () => {
    useCart.getState().addItem(product);
    useCart.getState().addItem(product);
    const items = useCart.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.qty).toBe(2);
  });

  it('calcula subtotal y total', () => {
    useCart.getState().addItem(product);
    useCart.getState().setQty('p1', 3);
    expect(useCart.getState().subtotal()).toBeCloseTo(37.5, 2);
    expect(useCart.getState().total()).toBeCloseTo(37.5, 2);
  });

  it('setQty <= 0 elimina la línea', () => {
    useCart.getState().addItem(product);
    useCart.getState().setQty('p1', 0);
    expect(useCart.getState().items).toHaveLength(0);
  });

  it('removeItem quita la línea', () => {
    useCart.getState().addItem(product);
    useCart.getState().removeItem('p1');
    expect(useCart.getState().items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter @simpletpv/tpv exec vitest run src/lib/cart.test.ts`
Expected: FAIL — `./cart.js` no existe.

- [ ] **Step 3: Implementar el store**

```ts
import { create } from 'zustand';

import type { Product } from '@simpletpv/auth';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Pick<Product, 'id' | 'name' | 'salePrice'>) => void;
  setQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  subtotal: () => number;
  total: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === product.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            unitPrice: Number(product.salePrice),
            qty: 1,
          },
        ],
      };
    }),
  setQty: (productId, qty) =>
    set((state) => {
      if (qty <= 0) {
        return { items: state.items.filter((i) => i.productId !== productId) };
      }
      return { items: state.items.map((i) => (i.productId === productId ? { ...i, qty } : i)) };
    }),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
  clear: () => set({ items: [] }),
  subtotal: () => get().items.reduce((acc, i) => acc + i.unitPrice * i.qty, 0),
  total: () => get().subtotal(),
}));
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter @simpletpv/tpv exec vitest run src/lib/cart.test.ts`
Expected: PASS (los 4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/tpv/src/lib/cart.ts apps/tpv/src/lib/cart.test.ts
git commit -m "feat(tpv): cart store Zustand con subtotal/total en vivo (#8)"
```

---

## Task 11: Cliente de ventas y tiendas en el TPV

**Files:**

- Create: `apps/tpv/src/lib/sales.ts`

- [ ] **Step 1: Escribir el cliente**

```ts
import type { CreateSaleInput, Sale, Store } from '@simpletpv/auth';

import { api } from './auth.js';

export type { Sale, Store };

export function listStores(): Promise<Store[]> {
  return api.get<Store[]>('/stores');
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  return api.post<Sale>('/sales', input);
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @simpletpv/tpv typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/tpv/src/lib/sales.ts
git commit -m "feat(tpv): cliente createSale y listStores (#8)"
```

---

## Task 12: UI del carrito (CartPanel)

**Files:**

- Create: `apps/tpv/src/CartPanel.tsx`
- Modify: `apps/tpv/src/sale.css`

- [ ] **Step 1: Escribir `CartPanel.tsx`**

```tsx
import { useState } from 'react';

import { useCart } from './lib/cart.js';
import { createSale } from './lib/sales.js';

export function CartPanel({ storeId }: { storeId: string | null }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart((s) => s.subtotal());
  const total = useCart((s) => s.total());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!storeId || items.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const sale = await createSale({
        storeId,
        lines: items.map((i) => ({ productId: i.productId, qty: i.qty })),
      });
      clear();
      setMsg(`Venta creada: ${sale.ticketNumber}`);
    } catch {
      setMsg('Error al crear la venta. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="cart" data-testid="cart">
      <h2 className="cart-title">Carrito</h2>
      {items.length === 0 ? (
        <p className="cart-empty" data-testid="cart-empty">
          Vacío. Pulsa un producto para añadirlo.
        </p>
      ) : (
        <ul className="cart-lines">
          {items.map((i) => (
            <li key={i.productId} className="cart-line" data-testid="cart-line">
              <span className="cart-line-name">{i.name}</span>
              <span className="cart-line-controls">
                <button onClick={() => setQty(i.productId, i.qty - 1)} aria-label="Quitar uno">
                  −
                </button>
                <span className="cart-line-qty">{i.qty}</span>
                <button onClick={() => setQty(i.productId, i.qty + 1)} aria-label="Añadir uno">
                  +
                </button>
              </span>
              <span className="cart-line-total">{(i.unitPrice * i.qty).toFixed(2)} €</span>
              <button
                className="cart-line-remove"
                onClick={() => removeItem(i.productId)}
                aria-label="Eliminar línea"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cart-foot">
        <div className="cart-totals">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{subtotal.toFixed(2)} €</span>
        </div>
        <div className="cart-totals cart-total">
          <span>Total</span>
          <span data-testid="cart-total">{total.toFixed(2)} €</span>
        </div>
        <button
          className="cart-create"
          onClick={onCreate}
          disabled={busy || items.length === 0 || !storeId}
          data-testid="cart-create"
        >
          {busy ? 'Creando…' : 'Crear venta'}
        </button>
        {msg && (
          <p className="cart-msg" data-testid="cart-msg">
            {msg}
          </p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Añadir estilos a `sale.css`**

Añade al final del fichero:

```css
.cart {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 18rem;
}
.cart-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.cart-empty {
  color: #888;
  font-size: 0.9rem;
}
.cart-lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.cart-line {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 0.5rem;
}
.cart-line-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.cart-line-controls button {
  width: 1.6rem;
  height: 1.6rem;
}
.cart-line-total {
  font-variant-numeric: tabular-nums;
}
.cart-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.cart-totals {
  display: flex;
  justify-content: space-between;
}
.cart-total {
  font-weight: 700;
  font-size: 1.1rem;
}
.cart-create {
  padding: 0.6rem;
  font-weight: 600;
}
.cart-msg {
  font-size: 0.9rem;
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm --filter @simpletpv/tpv typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/tpv/src/CartPanel.tsx apps/tpv/src/sale.css
git commit -m "feat(tpv): UI del carrito con crear venta (#8)"
```

---

## Task 13: Integrar carrito y selector de tienda en SalePage

**Files:**

- Modify: `apps/tpv/src/SalePage.tsx`

- [ ] **Step 1: Añadir imports, query de tiendas, estado de tienda y carrito**

Al principio del componente, tras los imports existentes, añade:

```tsx
import { useCart } from './lib/cart.js';
import { listStores } from './lib/sales.js';
import { CartPanel } from './CartPanel.js';
```

Dentro de `SalePage()`, junto a los demás hooks:

```tsx
const addToCart = useCart((s) => s.addItem);
const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
const [storeId, setStoreId] = useState<string | null>(null);
const activeStore = storeId ?? stores[0]?.id ?? null;
```

- [ ] **Step 2: Hacer que el grid añada al carrito y el banner de escaneo también**

En el `<button className="prod-card" ...>` del grid, añade el `onClick`:

```tsx
<button
  key={p.id}
  className="prod-card"
  data-testid="prod-card"
  onClick={() => addToCart(p)}
>
```

En el handler del escáner, añade el producto al carrito si existe:

```tsx
useBarcodeScanner((code) => {
  void findByBarcode(code).then((product) => {
    setScanned({ product, code });
    if (product) addToCart(product);
  });
});
```

- [ ] **Step 3: Añadir el selector de tienda y el CartPanel al layout**

Envuelve el contenido en un layout de dos columnas. Sustituye el `return (...)` para que el bloque existente quede en una columna izquierda y `CartPanel` en la derecha; añade el selector de tienda arriba (solo si hay más de una tienda):

```tsx
return (
  <div className="sale-layout">
    <div className="sale">
      {stores.length > 1 && (
        <div className="sale-store-row">
          <label>
            Tienda:{' '}
            <select
              value={activeStore ?? ''}
              onChange={(e) => setStoreId(e.target.value)}
              data-testid="store-select"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {/* ...todo el contenido existente de .sale (search-row, families, banner, grid)... */}
    </div>
    <CartPanel storeId={activeStore} />
  </div>
);
```

Mueve el contenido actual (desde `<div className="sale-search-row">` hasta el cierre del grid) dentro del `<div className="sale">` nuevo, eliminando el `<div className="sale">` antiguo para no duplicarlo.

- [ ] **Step 4: Añadir el layout de dos columnas a `sale.css`**

```css
.sale-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}
.sale-layout .sale {
  flex: 1;
}
.sale-store-row {
  margin-bottom: 0.75rem;
}
```

- [ ] **Step 5: Verificar typecheck y build del TPV**

Run: `pnpm --filter @simpletpv/tpv typecheck && pnpm --filter @simpletpv/tpv build`
Expected: sin errores, build OK.

- [ ] **Step 6: Commit**

```bash
git add apps/tpv/src/SalePage.tsx apps/tpv/src/sale.css
git commit -m "feat(tpv): integrar carrito y selector de tienda en SalePage (#8)"
```

---

## Task 14: Verificación final

- [ ] **Step 1: Typecheck del monorepo**

Run: `pnpm typecheck`
Expected: sin errores en ningún workspace.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: sin errores.

- [ ] **Step 3: Tests unitarios**

Run: `pnpm --filter @simpletpv/api test && pnpm --filter @simpletpv/tpv exec vitest run`
Expected: todo verde (incluye `sales.service.spec.ts` y `cart.test.ts`).

- [ ] **Step 4: Tests de integración (Postgres real)**

Asegúrate de Postgres arriba + migración + seed. Run: `pnpm --filter @simpletpv/api test:int`
Expected: `sales.integration.spec.ts` y `rls.integration.spec.ts` verdes.

- [ ] **Step 5: Humo manual en el navegador (golden path)**

Arranca API (`pnpm --filter @simpletpv/api start:dev`) y TPV (`pnpm --filter @simpletpv/tpv dev`). Inicia sesión como `clerk@org1.test`, pulsa productos del grid → aparecen en el carrito, ajusta cantidades, comprueba subtotal/total, pulsa "Crear venta" → mensaje con nº de ticket `T01-000001`. Repite → `T01-000002`.

- [ ] **Step 6: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "chore(sales): ajustes finales tras verificación (#8)"
```

```

```
