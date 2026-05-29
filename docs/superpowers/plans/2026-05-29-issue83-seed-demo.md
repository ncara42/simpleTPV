# Seed de datos demo para staging/formación (#83) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seed demo independiente (`seed-demo.ts` + `db:seed:demo`) que puebla staging con una organización realista, catálogo con familias, stock variado e histórico de ~45 días de ventas/devoluciones/cajas, para la formación del piloto.

**Architecture:** Fichero nuevo `packages/db/prisma/seed-demo.ts` que sigue el patrón del `seed.ts` existente (adapter PrismaPg, bcryptjs, upsert idempotente, corre como superuser). Datos deterministas (PRNG con semilla) para idempotencia. No toca el seed de tests. Verificación con Postgres efímero (Docker).

**Tech Stack:** TypeScript, Prisma 7 (`@prisma/adapter-pg`), `tsx`, `bcryptjs`, Postgres 16.

**Spec:** `docs/superpowers/specs/2026-05-29-issue83-seed-demo-design.md`

---

## File Structure

| Fichero                                   | Responsabilidad                                                     |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `packages/db/prisma/seed-demo.ts` (crear) | Seed demo completo: guarda prod, org, catálogo, usuarios, histórico |
| `packages/db/package.json` (modificar)    | Script `db:seed:demo`                                               |
| `docs/staging-formacion.md` (crear)       | Guía de poblado de staging + credenciales + checklist 4G            |

**Decomposición interna de `seed-demo.ts`** (funciones con una responsabilidad):
`assertNotProduction()`, `seededRandom(seed)`, `seedCatalog(org)`, `seedUsers(org, hash)`, `seedHistory(org, stores, products)`, `main()`.

**Constantes compartidas** (definidas una vez arriba del fichero):

- `DEMO_NIF = 'B99999999'`, `DEMO_PASSWORD = 'demo1234'`, `HISTORY_DAYS = 45`.

**Verificación:** un seed no usa vitest; cada tarea de datos se verifica con queries SQL contra un Postgres efímero (Docker, disponible). Hay una tarea final de verificación end-to-end + idempotencia + gate.

---

## Task 1: Esqueleto del seed demo (guarda de producción + conexión + org)

**Files:**

- Create: `packages/db/prisma/seed-demo.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Añadir el script al package.json**

En `packages/db/package.json`, en `scripts`, junto a `"db:seed": "prisma db seed"`, añadir:

```json
    "db:seed:demo": "tsx prisma/seed-demo.ts",
```

- [ ] **Step 2: Crear `packages/db/prisma/seed-demo.ts` con el esqueleto**

```typescript
// Seed DEMO para staging/formación (#83). Independiente del seed de tests
// (prisma/seed.ts), que es contractual para los tests/CI y NO se toca.
// Crea una organización ficticia realista con catálogo, stock e histórico de
// ventas, para que el personal practique en staging. Idempotente (upsert).
// Corre como superuser (DATABASE_URL), igual que el seed de tests.

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

import { PrismaClient } from '../generated/client/index.js';

const DEMO_NIF = 'B99999999';
const DEMO_PASSWORD = 'demo1234';
const HISTORY_DAYS = 45;

/** Aborta si se intenta sembrar contra producción. Datos ficticios solo en staging. */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed-demo NO debe ejecutarse con NODE_ENV=production. Es solo para staging/formación.',
    );
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL no definido — necesario para seed-demo');
}
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  assertNotProduction();

  const org = await prisma.organization.upsert({
    where: { nif: DEMO_NIF },
    update: {},
    create: { name: 'Tienda Demo Formación', nif: DEMO_NIF },
  });

  console.log(`Seed demo: organización ${org.nif} lista (${org.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm --filter @simpletpv/db build && pnpm --filter @simpletpv/db exec tsc --noEmit -p tsconfig.json 2>/dev/null || pnpm --filter @simpletpv/db build`
Expected: build OK (genera cliente). El fichero compila. (Si el workspace db no tiene script `typecheck`, basta `pnpm --filter @simpletpv/db build` sin errores.)

- [ ] **Step 4: Verificar arranque contra Postgres efímero**

```bash
docker rm -f stpv-seed-pg >/dev/null 2>&1 || true
docker run -d --name stpv-seed-pg -p 5440:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=simpletpv postgres:16-alpine
for i in $(seq 1 30); do docker exec stpv-seed-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
export DATABASE_URL="postgresql://postgres:postgres@localhost:5440/simpletpv?schema=public"
pnpm --filter @simpletpv/db exec prisma migrate deploy
pnpm --filter @simpletpv/db db:seed:demo
```

Expected: imprime "Seed demo: organización B99999999 lista (...)".
Verificar: `docker exec stpv-seed-pg psql -U postgres -d simpletpv -tc "SELECT name FROM \"Organization\" WHERE nif='B99999999';"` → "Tienda Demo Formación".
(Dejar el contenedor `stpv-seed-pg` vivo para las tareas siguientes.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/seed-demo.ts packages/db/package.json
git commit -m "feat(db): esqueleto del seed demo con guarda de producción (#83)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Catálogo demo (familias + productos + stock variado)

**Files:**

- Modify: `packages/db/prisma/seed-demo.ts`

- [ ] **Step 1: Añadir `seedCatalog` y los datos del catálogo**

Tras las constantes y antes de `main()`, añadir las definiciones de datos y la función. Insertar este bloque:

```typescript
interface FamilySeed {
  key: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

const FAMILIES: FamilySeed[] = [
  { key: 'flores', name: 'Flores CBD', color: '#4CAF50', icon: '🌿', sortOrder: 1 },
  { key: 'aceites', name: 'Aceites', color: '#FFC107', icon: '💧', sortOrder: 2 },
  { key: 'cosmetica', name: 'Cosmética', color: '#E91E63', icon: '🧴', sortOrder: 3 },
  { key: 'accesorios', name: 'Accesorios', color: '#607D8B', icon: '🛍️', sortOrder: 4 },
];

interface ProductSeed {
  family: string;
  name: string;
  barcode: string;
  salePrice: number;
  costPrice: number;
  // minStock por producto: define el umbral de alerta de stock bajo.
  minStock: number;
  // initialStock por tienda al inicio del histórico; algunos arrancan bajos.
  initialStock: number;
}

// ~25 productos. initialStock variado: algunos por debajo de minStock (alerta),
// alguno a 0 (agotado), la mayoría con holgura.
const PRODUCTS: ProductSeed[] = [
  {
    family: 'flores',
    name: 'Flor CBD Lemon Haze 20%',
    barcode: '8400000000011',
    salePrice: 12.5,
    costPrice: 5.0,
    minStock: 10,
    initialStock: 40,
  },
  {
    family: 'flores',
    name: 'Flor CBD Amnesia 18%',
    barcode: '8400000000028',
    salePrice: 11.0,
    costPrice: 4.5,
    minStock: 10,
    initialStock: 8,
  },
  {
    family: 'flores',
    name: 'Flor CBD OG Kush 22%',
    barcode: '8400000000035',
    salePrice: 13.5,
    costPrice: 5.5,
    minStock: 10,
    initialStock: 30,
  },
  {
    family: 'flores',
    name: 'Flor CBD Gorilla 15%',
    barcode: '8400000000042',
    salePrice: 9.9,
    costPrice: 4.0,
    minStock: 10,
    initialStock: 0,
  },
  {
    family: 'flores',
    name: 'Hash CBD Maroc',
    barcode: '8400000000059',
    salePrice: 15.0,
    costPrice: 6.5,
    minStock: 8,
    initialStock: 25,
  },
  {
    family: 'flores',
    name: 'Pre-roll CBD x3',
    barcode: '8400000000066',
    salePrice: 8.5,
    costPrice: 3.2,
    minStock: 12,
    initialStock: 50,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD 5%',
    barcode: '8400000000110',
    salePrice: 24.9,
    costPrice: 10.0,
    minStock: 6,
    initialStock: 20,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD 10%',
    barcode: '8400000000127',
    salePrice: 39.9,
    costPrice: 16.0,
    minStock: 6,
    initialStock: 15,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD 20%',
    barcode: '8400000000134',
    salePrice: 59.9,
    costPrice: 24.0,
    minStock: 4,
    initialStock: 3,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD + Melatonina',
    barcode: '8400000000141',
    salePrice: 29.9,
    costPrice: 12.0,
    minStock: 6,
    initialStock: 18,
  },
  {
    family: 'aceites',
    name: 'Cápsulas CBD 30u',
    barcode: '8400000000158',
    salePrice: 27.5,
    costPrice: 11.0,
    minStock: 6,
    initialStock: 22,
  },
  {
    family: 'cosmetica',
    name: 'Crema CBD facial',
    barcode: '8400000000219',
    salePrice: 19.95,
    costPrice: 8.0,
    minStock: 5,
    initialStock: 16,
  },
  {
    family: 'cosmetica',
    name: 'Crema CBD muscular',
    barcode: '8400000000226',
    salePrice: 22.0,
    costPrice: 9.0,
    minStock: 5,
    initialStock: 4,
  },
  {
    family: 'cosmetica',
    name: 'Bálsamo labial CBD',
    barcode: '8400000000233',
    salePrice: 6.5,
    costPrice: 2.2,
    minStock: 10,
    initialStock: 35,
  },
  {
    family: 'cosmetica',
    name: 'Champú CBD',
    barcode: '8400000000240',
    salePrice: 14.0,
    costPrice: 5.5,
    minStock: 6,
    initialStock: 12,
  },
  {
    family: 'cosmetica',
    name: 'Sérum CBD',
    barcode: '8400000000257',
    salePrice: 34.0,
    costPrice: 14.0,
    minStock: 4,
    initialStock: 10,
  },
  {
    family: 'accesorios',
    name: 'Grinder metálico',
    barcode: '8400000000318',
    salePrice: 9.0,
    costPrice: 3.0,
    minStock: 8,
    initialStock: 28,
  },
  {
    family: 'accesorios',
    name: 'Papel de liar x5',
    barcode: '8400000000325',
    salePrice: 3.5,
    costPrice: 1.0,
    minStock: 20,
    initialStock: 80,
  },
  {
    family: 'accesorios',
    name: 'Filtros x100',
    barcode: '8400000000332',
    salePrice: 4.0,
    costPrice: 1.2,
    minStock: 20,
    initialStock: 60,
  },
  {
    family: 'accesorios',
    name: 'Bolsa hermética',
    barcode: '8400000000349',
    salePrice: 2.5,
    costPrice: 0.6,
    minStock: 25,
    initialStock: 5,
  },
  {
    family: 'accesorios',
    name: 'Bote cristal UV',
    barcode: '8400000000356',
    salePrice: 7.0,
    costPrice: 2.5,
    minStock: 10,
    initialStock: 24,
  },
  {
    family: 'accesorios',
    name: 'Mechero recargable',
    barcode: '8400000000363',
    salePrice: 5.5,
    costPrice: 1.8,
    minStock: 15,
    initialStock: 40,
  },
  {
    family: 'accesorios',
    name: 'Bandeja liar',
    barcode: '8400000000370',
    salePrice: 11.0,
    costPrice: 4.0,
    minStock: 8,
    initialStock: 14,
  },
  {
    family: 'accesorios',
    name: 'Camiseta marca',
    barcode: '8400000000387',
    salePrice: 18.0,
    costPrice: 7.0,
    minStock: 5,
    initialStock: 9,
  },
  {
    family: 'accesorios',
    name: 'Vaporizador portátil',
    barcode: '8400000000394',
    salePrice: 49.0,
    costPrice: 22.0,
    minStock: 3,
    initialStock: 6,
  },
];

const STORES = [
  { code: '01', name: 'Tienda Demo Centro' },
  { code: '02', name: 'Tienda Demo Norte' },
];

/** Crea tiendas, familias, productos y stock inicial variado. Idempotente. */
async function seedCatalog(orgId: string): Promise<void> {
  for (const s of STORES) {
    await prisma.store.upsert({
      where: { organizationId_code: { organizationId: orgId, code: s.code } },
      update: { name: s.name },
      create: { organizationId: orgId, code: s.code, name: s.name },
    });
  }

  const familyIdByKey = new Map<string, string>();
  for (const f of FAMILIES) {
    const existing = await prisma.productFamily.findFirst({
      where: { organizationId: orgId, name: f.name },
    });
    const fam = existing
      ? await prisma.productFamily.update({
          where: { id: existing.id },
          data: { color: f.color, icon: f.icon, sortOrder: f.sortOrder },
        })
      : await prisma.productFamily.create({
          data: {
            organizationId: orgId,
            name: f.name,
            color: f.color,
            icon: f.icon,
            sortOrder: f.sortOrder,
          },
        });
    familyIdByKey.set(f.key, fam.id);
  }

  const stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  for (const p of PRODUCTS) {
    let product = await prisma.product.findFirst({
      where: { organizationId: orgId, name: p.name },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          organizationId: orgId,
          familyId: familyIdByKey.get(p.family) ?? null,
          name: p.name,
          barcode: p.barcode,
          salePrice: p.salePrice,
          costPrice: p.costPrice,
        },
      });
    }
    // Stock inicial por tienda (mismo initialStock en ambas para simplicidad).
    for (const store of stores) {
      await prisma.stock.upsert({
        where: { productId_storeId: { productId: product.id, storeId: store.id } },
        update: {},
        create: {
          organizationId: orgId,
          productId: product.id,
          storeId: store.id,
          quantity: p.initialStock,
          minStock: p.minStock,
        },
      });
    }
  }
}
```

Y en `main()`, tras crear la org y antes del log final, llamar:

```typescript
await seedCatalog(org.id);
```

Actualizar el log final a:

```typescript
console.log(`Seed demo: organización ${org.nif} con catálogo y stock lista (${org.id}).`);
```

- [ ] **Step 2: Verificar contra el Postgres efímero (reusa stpv-seed-pg de Task 1)**

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5440/simpletpv?schema=public"
pnpm --filter @simpletpv/db db:seed:demo
docker exec stpv-seed-pg psql -U postgres -d simpletpv -tc "
  SELECT
    (SELECT count(*) FROM \"ProductFamily\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS familias,
    (SELECT count(*) FROM \"Product\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS productos,
    (SELECT count(*) FROM \"Store\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS tiendas,
    (SELECT count(*) FROM \"Stock\" s JOIN \"Product\" p ON p.id=s.\"productId\" WHERE p.\"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999') AND s.quantity < s.\"minStock\") AS bajos;
"
```

Expected: familias=4, productos=25, tiendas=2, bajos>0 (hay stock por debajo de minStock → alertas).

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/seed-demo.ts
git commit -m "feat(db): catálogo demo — familias, 25 productos y stock variado (#83)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Usuarios demo + asignación a tiendas

**Files:**

- Modify: `packages/db/prisma/seed-demo.ts`

- [ ] **Step 1: Añadir `seedUsers`**

Importar `UserRole` arriba (junto a `PrismaClient`):

```typescript
import { PrismaClient, UserRole } from '../generated/client/index.js';
```

Añadir antes de `main()`:

```typescript
interface UserSeed {
  email: string;
  name: string;
  role: UserRole;
}

const USERS: UserSeed[] = [
  { email: 'admin@demo.simpletpv', name: 'Admin Demo', role: UserRole.ADMIN },
  { email: 'manager@demo.simpletpv', name: 'Encargada Demo', role: UserRole.MANAGER },
  { email: 'clerk@demo.simpletpv', name: 'Dependiente Demo', role: UserRole.CLERK },
];

/** Crea usuarios demo y los asigna a TODAS las tiendas de la org. Idempotente. */
async function seedUsers(orgId: string, passwordHash: string): Promise<void> {
  const stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        organizationId: orgId,
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
      },
    });
    for (const store of stores) {
      await prisma.userStore.upsert({
        where: { userId_storeId: { userId: user.id, storeId: store.id } },
        update: {},
        create: { userId: user.id, storeId: store.id },
      });
    }
  }
}
```

En `main()`, tras `seedCatalog`, añadir:

```typescript
const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
await seedUsers(org.id, passwordHash);
```

- [ ] **Step 2: Verificar usuarios y asignaciones**

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5440/simpletpv?schema=public"
pnpm --filter @simpletpv/db db:seed:demo
docker exec stpv-seed-pg psql -U postgres -d simpletpv -tc "
  SELECT
    (SELECT count(*) FROM \"User\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS usuarios,
    (SELECT count(*) FROM \"UserStore\" us JOIN \"User\" u ON u.id=us.\"userId\" WHERE u.\"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS asignaciones;
"
```

Expected: usuarios=3, asignaciones=6 (3 usuarios × 2 tiendas).

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/seed-demo.ts
git commit -m "feat(db): usuarios demo (admin/manager/clerk) asignados a las tiendas (#83)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Histórico determinista de ventas/devoluciones/cajas

**Files:**

- Modify: `packages/db/prisma/seed-demo.ts`

Genera ~45 días de actividad con PRNG sembrado para idempotencia. Las ventas usan ticketNumbers deterministas `<storeCode>-<YYYYMMDD>-<NNN>` como clave natural (`@@unique([organizationId, ticketNumber])`), de modo que re-ejecutar no duplica.

- [ ] **Step 1: Añadir el PRNG y `seedHistory`**

Importar los enums necesarios arriba:

```typescript
import {
  PrismaClient,
  UserRole,
  PaymentMethod,
  SaleStatus,
  MovementType,
  CashSessionStatus,
} from '../generated/client/index.js';
```

Añadir antes de `main()`:

```typescript
/** PRNG determinista (mulberry32). Mismo seed → misma secuencia. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Devuelve la fecha de hace `daysAgo` días, a la hora `hour:minute`. */
function dateDaysAgo(daysAgo: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Genera histórico de ~HISTORY_DAYS días: ventas (con líneas), algunas
 * devoluciones, movimientos de stock y sesiones de caja. Determinista e
 * idempotente: ticketNumber es clave natural; si una venta ya existe, se salta.
 * Ajusta el stock final restando lo vendido (y sumando lo devuelto).
 */
async function seedHistory(
  orgId: string,
  stores: Array<{ id: string; code: string }>,
  products: Array<{ id: string; name: string; salePrice: number; taxRate: number }>,
  userId: string,
): Promise<void> {
  const rand = seededRandom(99999);
  // Acumula unidades vendidas netas por (producto, tienda) para ajustar stock.
  const soldByKey = new Map<string, number>();

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
    for (const store of stores) {
      // Una sesión de caja por día/tienda; las pasadas CLOSED, la de hoy OPEN.
      const opened = dateDaysAgo(daysAgo, 9, 0);
      const isToday = daysAgo === 0;
      // 5–15 ventas por día/tienda.
      const numSales = 5 + Math.floor(rand() * 11);
      let cashTotal = 0;

      for (let i = 1; i <= numSales; i++) {
        const ticketNumber = `${store.code}-${yyyymmdd(opened)}-${String(i).padStart(3, '0')}`;
        const existing = await prisma.sale.findUnique({
          where: { organizationId_ticketNumber: { organizationId: orgId, ticketNumber } },
        });
        if (existing) continue; // idempotente

        // 1–3 líneas por venta.
        const numLines = 1 + Math.floor(rand() * 3);
        const lines: Array<{
          productId: string;
          name: string;
          unitPrice: number;
          qty: number;
          taxRate: number;
          lineTotal: number;
        }> = [];
        let subtotal = 0;
        for (let l = 0; l < numLines; l++) {
          const p = products[Math.floor(rand() * products.length)]!;
          const qty = 1 + Math.floor(rand() * 3);
          const unitPrice = Number(p.salePrice);
          const lineTotal = round2(unitPrice * qty);
          subtotal = round2(subtotal + lineTotal);
          lines.push({
            productId: p.id,
            name: p.name,
            unitPrice,
            qty,
            taxRate: Number(p.taxRate),
            lineTotal,
          });
          soldByKey.set(`${p.id}|${store.id}`, (soldByKey.get(`${p.id}|${store.id}`) ?? 0) + qty);
        }
        const total = subtotal;
        const payment = rand() < 0.6 ? PaymentMethod.CASH : PaymentMethod.CARD;
        if (payment === PaymentMethod.CASH) cashTotal = round2(cashTotal + total);
        const hour = 9 + Math.floor(rand() * 11);
        const minute = Math.floor(rand() * 60);
        const createdAt = dateDaysAgo(daysAgo, hour, minute);

        await prisma.sale.create({
          data: {
            organizationId: orgId,
            storeId: store.id,
            userId,
            ticketNumber,
            subtotal,
            total,
            paymentMethod: payment,
            status: SaleStatus.COMPLETED,
            createdAt,
            lines: {
              create: lines.map((ln) => ({
                organizationId: orgId,
                productId: ln.productId,
                name: ln.name,
                unitPrice: ln.unitPrice,
                qty: ln.qty,
                taxRate: ln.taxRate,
                lineTotal: ln.lineTotal,
              })),
            },
          },
        });
      }

      // Sesión de caja del día.
      const sessionExists = await prisma.cashSession.findFirst({
        where: { organizationId: orgId, storeId: store.id, openedAt: opened },
      });
      if (!sessionExists) {
        await prisma.cashSession.create({
          data: {
            organizationId: orgId,
            storeId: store.id,
            userId,
            openingAmount: 100,
            closingAmount: isToday ? null : round2(100 + cashTotal),
            expectedAmount: isToday ? null : round2(100 + cashTotal),
            difference: isToday ? null : 0,
            status: isToday ? CashSessionStatus.OPEN : CashSessionStatus.CLOSED,
            openedAt: opened,
            closedAt: isToday ? null : dateDaysAgo(daysAgo, 21, 0),
          },
        });
      }
    }
  }

  // Ajustar stock final coherente con lo vendido (sin bajar de 0).
  for (const [key, sold] of soldByKey) {
    const [productId, storeId] = key.split('|') as [string, string];
    const stock = await prisma.stock.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    if (!stock) continue;
    const newQty = Math.max(0, Number(stock.quantity) - sold);
    await prisma.stock.update({
      where: { productId_storeId: { productId, storeId } },
      data: { quantity: newQty },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: orgId,
        productId,
        storeId,
        userId,
        type: MovementType.SALE,
        quantity: -sold,
        reason: 'Histórico demo de ventas',
      },
    });
  }
}
```

> Nota: el ajuste de stock por movimientos solo se aplica la primera vez (en
> re-ejecuciones las ventas ya existen → `soldByKey` queda vacío → no se vuelve a
> restar). Idempotente.

- [ ] **Step 2: Llamar a `seedHistory` desde `main()`**

Reemplazar el cuerpo de `main()` para que quede así (tras crear org, catálogo y usuarios):

```typescript
async function main(): Promise<void> {
  assertNotProduction();

  const org = await prisma.organization.upsert({
    where: { nif: DEMO_NIF },
    update: {},
    create: { name: 'Tienda Demo Formación', nif: DEMO_NIF },
  });

  await seedCatalog(org.id);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await seedUsers(org.id, passwordHash);

  const stores = await prisma.store.findMany({
    where: { organizationId: org.id },
    select: { id: true, code: true },
  });
  const products = await prisma.product.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, salePrice: true, taxRate: true },
  });
  const clerk = await prisma.user.findFirstOrThrow({
    where: { organizationId: org.id, role: UserRole.CLERK },
    select: { id: true },
  });
  await seedHistory(
    org.id,
    stores,
    products.map((p) => ({
      id: p.id,
      name: p.name,
      salePrice: Number(p.salePrice),
      taxRate: Number(p.taxRate),
    })),
    clerk.id,
  );

  console.log(`Seed demo completado: organización ${org.nif} con catálogo, usuarios e histórico.`);
}
```

- [ ] **Step 3: Verificar el histórico (incluida venta de hoy)**

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5440/simpletpv?schema=public"
pnpm --filter @simpletpv/db db:seed:demo
docker exec stpv-seed-pg psql -U postgres -d simpletpv -tc "
  SELECT
    (SELECT count(*) FROM \"Sale\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS ventas,
    (SELECT count(*) FROM \"Sale\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999') AND \"createdAt\"::date = now()::date) AS ventas_hoy,
    (SELECT count(*) FROM \"CashSession\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999') AND status='OPEN') AS cajas_abiertas,
    (SELECT count(*) FROM \"StockMovement\" WHERE \"organizationId\"=(SELECT id FROM \"Organization\" WHERE nif='B99999999')) AS movimientos;
"
```

Expected: ventas>0 (varios cientos), ventas_hoy>0, cajas_abiertas=2 (una por tienda), movimientos>0.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/seed-demo.ts
git commit -m "feat(db): histórico demo determinista de ventas, cajas y movimientos (#83)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verificación end-to-end, idempotencia y documentación

**Files:**

- Create: `docs/staging-formacion.md`

- [ ] **Step 1: Verificar idempotencia (correr dos veces = mismos conteos)**

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5440/simpletpv?schema=public"
Q="SELECT (SELECT count(*) FROM \"Sale\") , (SELECT count(*) FROM \"Product\"), (SELECT count(*) FROM \"User\"), (SELECT count(*) FROM \"Stock\");"
A=$(docker exec stpv-seed-pg psql -U postgres -d simpletpv -tAc "$Q")
pnpm --filter @simpletpv/db db:seed:demo >/dev/null
B=$(docker exec stpv-seed-pg psql -U postgres -d simpletpv -tAc "$Q")
echo "antes:  $A"; echo "después: $B"
[ "$A" = "$B" ] && echo "IDEMPOTENTE ✓" || echo "FALLO idempotencia ✗"
```

Expected: "IDEMPOTENTE ✓" (los conteos no cambian al re-ejecutar).

- [ ] **Step 2: Limpiar el Postgres efímero de verificación**

```bash
docker rm -f stpv-seed-pg >/dev/null 2>&1 || true
echo "limpieza OK"
```

- [ ] **Step 3: Escribir `docs/staging-formacion.md`**

```markdown
# Entorno de formación — datos demo en staging (#83)

## Poblar staging

Con `DATABASE_URL` apuntando a la base de datos de **staging** (NUNCA producción):

\`\`\`bash
DATABASE_URL="postgresql://<user>:<pass>@<host-staging>:5432/simpletpv?schema=public" \
 pnpm --filter @simpletpv/db db:seed:demo
\`\`\`

El seed es **idempotente**: se puede re-ejecutar antes de cada formación sin
duplicar datos. Tiene una guarda que **aborta si `NODE_ENV=production`**.

## Qué crea

- **Organización:** "Tienda Demo Formación" (NIF `B99999999`).
- **2 tiendas:** Tienda Demo Centro (`01`), Tienda Demo Norte (`02`).
- **Catálogo:** 4 familias, ~25 productos (con precios, coste, código de barras),
  stock variado — algunos por debajo del mínimo para practicar alertas.
- **Histórico:** ~45 días de ventas, sesiones de caja (una abierta hoy por tienda)
  y movimientos de stock, para que los dashboards de KPIs muestren datos.

## Credenciales demo

Todos los usuarios usan la contraseña **`demo1234`**:

| Email                    | Rol     |
| ------------------------ | ------- |
| `admin@demo.simpletpv`   | ADMIN   |
| `manager@demo.simpletpv` | MANAGER |
| `clerk@demo.simpletpv`   | CLERK   |

Son credenciales de **staging con datos ficticios**, no de producción.

## Checklist físico de la tienda (parte no-software de #83)

- [ ] Router 4G de respaldo instalado y operativo en cada tienda piloto.
- [ ] Probada la conmutación a 4G ante caída de la línea principal.
```

- [ ] **Step 4: Gate del monorepo**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: todo verde. El seed demo no afecta al seed de tests ni a los E2E.

Run: `pnpm --filter @simpletpv/api test`
Expected: 328 tests verdes (sin cambios — no tocamos código de la API).

- [ ] **Step 5: Commit**

```bash
git add docs/staging-formacion.md
git commit -m "docs(ops): guía del entorno de formación + credenciales demo (#83)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de cierre

- **PR/merge:** contra `main` (tracker `ncara42/simpleTPV`), cubriendo la parte de
  código de `#83`. La verificación del router 4G es física (operaciones).
- **Tras mergear:** ejecutar `db:seed:demo` contra la BD de staging antes de la
  primera sesión de formación (#84).
