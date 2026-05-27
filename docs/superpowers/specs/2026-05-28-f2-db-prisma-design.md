# Spec — F2: `packages/db` Prisma + Postgres

| Campo       | Valor                                                                                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-05-28                                                                                                                                                                                                                                                                                    |
| Autor       | noel@noelcaravaca.com                                                                                                                                                                                                                                                                         |
| Estado      | Aprobado para implementación                                                                                                                                                                                                                                                                  |
| Fase        | F2 (de 4 de scaffolding) — depende de F1; precede a F3, F4 y al plan de CI                                                                                                                                                                                                                    |
| Referencias | `Plan_Desarrollo_MVP.md` §4 (Schema completo), §2 (Postgres en docker-compose), §6 (RLS multi-tenant); `docs/superpowers/specs/2026-05-28-f1-skeleton-monorepo-design.md`; `docs/superpowers/specs/2026-05-28-ci-pipeline-design.md` §5.1 (uso de `prisma migrate deploy` + `prisma db seed`) |

## 1. Objetivo

Implantar `packages/db` con un **schema Prisma mínimo viable** (5 modelos), migraciones que incluyen aislamiento multi-tenant vía **Row-Level Security (RLS)** de PostgreSQL, y seed con 2 organizaciones para validar el aislamiento. Levantar Postgres 16 localmente vía `docker-compose.yml`.

Al cerrar F2:

- `docker compose up -d postgres` deja Postgres corriendo en `127.0.0.1:5432`.
- `pnpm --filter @simpletpv/db exec prisma migrate dev` aplica dos migraciones (tablas + RLS) sin error.
- `pnpm --filter @simpletpv/db exec prisma db seed` inserta 2 organizaciones con sus stores, users y products.
- F3 puede importar el cliente Prisma generado desde `@simpletpv/db`.

F2 entrega la **base de datos**; F3 entrega el código que la consume.

## 2. Alcance

**Incluido:**

- `docker-compose.yml` en raíz con servicio `postgres` (postgres:16-alpine), volumen `pgdata`, bind a `127.0.0.1`, healthcheck.
- `.env.example` en raíz con `DATABASE_URL` apuntando a Postgres local.
- `packages/db/package.json` actualizado (dependencias, scripts, `prisma.seed`, `main`/`types`).
- `packages/db/tsconfig.json` extendiendo `tsconfig.base.json`.
- `packages/db/prisma/schema.prisma` con 5 modelos: `Organization`, `Store`, `User`, `UserStore`, `Product`, y enum `UserRole`.
- Migración `<ts>_initial/migration.sql` autogenerada por Prisma.
- Migración `<ts>_add_rls/migration.sql` manual con roles, `ENABLE`/`FORCE ROW LEVEL SECURITY`, y políticas `USING current_setting('app.current_organization_id', true)::uuid`.
- `packages/db/prisma/seed.ts` con 2 organizaciones idempotentes (upsert).
- Actualización de `.gitignore` para excluir `packages/db/generated/`.

**Excluido:**

- Resto de modelos del MVP §4 (Stock, Sale, SaleLine, SaleTaxBreakdown, Return, ReturnLine, Transfer, TransferLine, PurchaseOrder, PurchaseOrderLine, Supplier, CashSession, StockMovement, StockAlert, AuditLog, Module, ModuleSubscription, ProductFamily) → los añade el MVP semanas 1-6.
- Tests automatizados de RLS (org A no ve datos de org B) → F3 cuando exista el código que monta conexión como rol `app`.
- `DATABASE_URL_APP` (URL del rol aplicación) — solo se deja un comentario en `.env.example`; F3 la activa.
- Connection pooling (PgBouncer) → F3 o post-MVP.
- Redis → F3.
- Estrategia de backup / restore → fuera de scaffolding.
- `packages/shared` → YAGNI; F3/F4 si lo necesitan.

## 3. Decisiones explícitas

| #      | Decisión                                                                                                                                      | Justificación                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-D1  | Schema mínimo (5 modelos)                                                                                                                     | YAGNI. El MVP construye el resto semana a semana. F2 debe entregar lo justo para que CI y F3 tengan base sobre la que tirar.                            |
| F2-D2  | Postgres **16-alpine** en docker-compose                                                                                                      | Misma imagen que el job E2E de CI (`services:`), coherente con MVP §2. Imagen ligera.                                                                   |
| F2-D3  | Bind `127.0.0.1:5432` (no `0.0.0.0`)                                                                                                          | Hardening. La DB local no debe ser accesible desde el LAN. Coherente con la práctica CN-005 de vivienda.                                                |
| F2-D4  | RLS en migración SQL separada (`<ts>_add_rls`)                                                                                                | Prisma no expresa RLS. Tenerla en su propia migración evita mezclar SQL manual con autogen y rota independientemente.                                   |
| F2-D5  | Tres roles Postgres: `postgres` (superuser, migraciones via `DATABASE_URL`), `app_admin` (BYPASSRLS, seed), `app` (runtime API, RLS aplicada) | Mínimo privilegio. El API en producción nunca corre como superuser.                                                                                     |
| F2-D6  | `FORCE ROW LEVEL SECURITY` además de `ENABLE`                                                                                                 | Por defecto el owner de la tabla escapa RLS — `FORCE` lo evita. Defensa en profundidad.                                                                 |
| F2-D7  | `current_setting('app.current_organization_id', true)::uuid` con segundo arg `true`                                                           | `missing_ok=true` devuelve NULL si nadie hizo `SET LOCAL`. Una comparación con NULL es FALSE → filtra a 0 filas (fail-safe).                            |
| F2-D8  | IDs como `@db.Uuid` nativo (no `String` raw)                                                                                                  | Mejor índice y semántica. Postgres tiene tipo UUID first-class.                                                                                         |
| F2-D9  | Cliente Prisma generado a `packages/db/generated/client` (fuera de node_modules)                                                              | Reproducibilidad CI; `pnpm install` no toca el cliente; `prisma generate` lo escribe explícitamente. Gitignored.                                        |
| F2-D10 | `main`/`types` del package apuntan al cliente generado                                                                                        | Imports de F3 (`import { PrismaClient } from '@simpletpv/db'`) resuelven sin gymnastics de paths.                                                       |
| F2-D11 | Seed con 2 organizaciones, idempotente vía `upsert`                                                                                           | 2 orgs es el mínimo para probar aislamiento RLS. Idempotencia permite re-correr en CI sin duplicar.                                                     |
| F2-D12 | `bcryptjs` (no `bcrypt` nativo)                                                                                                               | Sin compilación nativa = funciona en cualquier runner sin node-gyp ni paquetes de SO extra. Aceptamos el ~3× más lento porque solo se usa en seed/auth. |
| F2-D13 | `DATABASE_URL` del `.env.example` apunta al superuser `postgres`                                                                              | Para que `prisma migrate dev` y `prisma db seed` funcionen out-of-the-box. F3 añadirá `DATABASE_URL_APP` para runtime.                                  |
| F2-D14 | `tsx` para ejecutar `seed.ts`                                                                                                                 | Estándar de facto para correr TS sin compilar; ya lo usa vivienda en sus scripts de pipeline.                                                           |
| F2-D15 | Sin policy directa en `UserStore`                                                                                                             | Se filtra por join a `User`. Si en el futuro hace falta acceso directo, se añade. YAGNI.                                                                |

## 4. Estructura final

```
simpletpv/
├── docker-compose.yml                         (raíz, nuevo)
├── .env.example                               (raíz, nuevo)
├── .gitignore                                 (raíz, actualizado: + packages/db/generated/)
└── packages/db/
    ├── package.json                           (actualizado: deps, scripts, prisma.seed, main/types)
    ├── tsconfig.json                          (nuevo: extends ../../tsconfig.base.json)
    ├── prisma/
    │   ├── schema.prisma                      (nuevo)
    │   ├── seed.ts                            (nuevo)
    │   └── migrations/
    │       ├── <ts>_initial/migration.sql     (autogenerada)
    │       ├── <ts>_add_rls/migration.sql     (manual)
    │       └── migration_lock.toml            (autogenerada)
    └── generated/                             (gitignored, lo crea `prisma generate`)
        └── client/
```

## 5. Contenido de cada archivo

### 5.1 `docker-compose.yml` (raíz)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: simpletpv-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-simpletpv}
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-postgres}']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

### 5.2 `.env.example` (raíz)

```
# Postgres local (docker compose up -d postgres)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=simpletpv

# Prisma usa esta — se conecta como superuser para migraciones y seed.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/simpletpv?schema=public

# URL del rol aplicación (la usará el API en F3, sin password porque
# será authentication peer/trust en local y password real en producción).
# DATABASE_URL_APP=postgresql://app:app@localhost:5432/simpletpv?schema=public
```

### 5.3 `.gitignore` (actualización)

Añadir al final de `.gitignore`:

```
# Prisma generated client
packages/db/generated/
```

### 5.4 `packages/db/package.json`

```json
{
  "name": "@simpletpv/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./generated/client/index.js",
  "types": "./generated/client/index.d.ts",
  "scripts": {
    "build": "prisma generate",
    "typecheck": "tsc --noEmit",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:reset": "prisma migrate reset --force",
    "db:studio": "prisma studio",
    "db:seed": "prisma db seed"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "bcryptjs": "^3.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.0",
    "prisma": "^6.0.0",
    "tsx": "^4.0.0",
    "typescript": "^6.0.0"
  }
}
```

### 5.5 `packages/db/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./prisma"
  },
  "include": ["prisma/**/*.ts"],
  "exclude": ["generated", "dist", "node_modules"]
}
```

### 5.6 `packages/db/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Organization {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  nif       String?  @unique
  country   String   @default("ES")
  locale    String   @default("es-ES")
  currency  String   @default("EUR")
  createdAt DateTime @default(now())

  stores   Store[]
  users    User[]
  products Product[]
}

model Store {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  address        String?
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  users        UserStore[]

  @@index([organizationId])
}

model User {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  email          String   @unique
  name           String
  passwordHash   String
  role           UserRole
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  stores       UserStore[]

  @@index([organizationId])
}

model UserStore {
  userId  String @db.Uuid
  storeId String @db.Uuid

  user  User  @relation(fields: [userId], references: [id])
  store Store @relation(fields: [storeId], references: [id])

  @@id([userId, storeId])
}

model Product {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  salePrice      Decimal  @db.Decimal(10, 4)
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId, active])
}

enum UserRole {
  ADMIN
  MANAGER
  CLERK
}
```

### 5.7 Migración `<ts>_add_rls/migration.sql`

```sql
-- Aislamiento multi-tenant vía Row-Level Security.
-- Prisma no expresa RLS; esta migración la añade a mano sobre las tablas
-- creadas por la migración initial.

-- Roles
--   postgres  : superuser (usado por DATABASE_URL para migraciones)
--   app_admin : BYPASSRLS (usado por seed y operaciones de admin)
--   app       : RLS aplicada (usado por el API en runtime)
-- Los roles son NOLOGIN aquí; F3 (o el operador) les añade contraseña/login
-- cuando los necesite para conexión real.

CREATE ROLE app NOLOGIN;
CREATE ROLE app_admin NOLOGIN BYPASSRLS;

GRANT USAGE ON SCHEMA public TO app, app_admin;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO app, app_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO app, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO app, app_admin;

-- Habilitar y forzar RLS en cada tabla con organizationId.
-- FORCE: evita que el owner de la tabla escape RLS por defecto.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "Store"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "Product"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product"      FORCE  ROW LEVEL SECURITY;

-- Política única por tabla. Si app.current_organization_id no está set,
-- current_setting(..., true) devuelve NULL → filtra a 0 filas (fail-safe).
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "Store"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "Product"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- UserStore se filtra por join a User; sin política directa hasta que un
-- caso real lo exija.
```

### 5.8 `packages/db/prisma/seed.ts`

```ts
// Seed idempotente: 2 organizaciones, 2 stores cada una, 3 users por org,
// 5 products por org. Usa upsert para que correr 2 veces no duplique.
// Corre asumiendo conexión como superuser (DATABASE_URL del .env) — el rol
// app_admin (BYPASSRLS) se utilizará cuando F3 monte connection pooling
// con rol distinto.

import bcrypt from 'bcryptjs';

import { PrismaClient, UserRole } from '../generated/client';

const prisma = new PrismaClient();

interface OrgSeed {
  nif: string;
  name: string;
  stores: Array<{ id: string; name: string }>;
  users: Array<{ email: string; name: string; role: UserRole }>;
  products: Array<{ name: string; salePrice: number }>;
}

const ORG1: OrgSeed = {
  nif: 'B11111111',
  name: 'Cadena CBD Norte',
  stores: [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Tienda Madrid Centro' },
    { id: '11111111-1111-1111-1111-111111111112', name: 'Almacén Central Madrid' },
  ],
  users: [
    { email: 'admin@org1.test', name: 'Admin Org1', role: UserRole.ADMIN },
    { email: 'manager@org1.test', name: 'Manager Org1', role: UserRole.MANAGER },
    { email: 'clerk@org1.test', name: 'Clerk Org1', role: UserRole.CLERK },
  ],
  products: [
    { name: 'Flor CBD 20%', salePrice: 12.5 },
    { name: 'Aceite CBD 5%', salePrice: 29.9 },
    { name: 'Crema CBD', salePrice: 19.95 },
    { name: 'Té CBD', salePrice: 7.5 },
    { name: 'Vape CBD', salePrice: 34.0 },
  ],
};

const ORG2: OrgSeed = {
  nif: 'B22222222',
  name: 'Distribuidora Sur',
  stores: [
    { id: '22222222-2222-2222-2222-222222222221', name: 'Tienda Sevilla' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Tienda Málaga' },
  ],
  users: [
    { email: 'admin@org2.test', name: 'Admin Org2', role: UserRole.ADMIN },
    { email: 'manager@org2.test', name: 'Manager Org2', role: UserRole.MANAGER },
    { email: 'clerk@org2.test', name: 'Clerk Org2', role: UserRole.CLERK },
  ],
  products: [
    { name: 'Bolsa premium 1g', salePrice: 9.0 },
    { name: 'Pack mensual', salePrice: 49.0 },
    { name: 'Accesorio A', salePrice: 4.5 },
    { name: 'Accesorio B', salePrice: 6.0 },
    { name: 'Merch camiseta', salePrice: 18.0 },
  ],
};

async function seedOrg(spec: OrgSeed, passwordHash: string): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { nif: spec.nif },
    update: {},
    create: { name: spec.name, nif: spec.nif },
  });

  for (const store of spec.stores) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {},
      create: { id: store.id, organizationId: org.id, name: store.name },
    });
  }

  for (const user of spec.users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        organizationId: org.id,
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
      },
    });
  }

  // Productos: no hay unique compuesto en F2; usamos upsert por id sintético
  // basado en orgId + nombre, vía findFirst + create. Idempotente.
  for (const p of spec.products) {
    const existing = await prisma.product.findFirst({
      where: { organizationId: org.id, name: p.name },
    });
    if (!existing) {
      await prisma.product.create({
        data: {
          organizationId: org.id,
          name: p.name,
          salePrice: p.salePrice,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('password123', 10);
  await seedOrg(ORG1, passwordHash);
  await seedOrg(ORG2, passwordHash);
  console.log('Seed completado: 2 organizaciones.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

## 6. Validación de cierre de F2

Pasos manuales para verificar que F2 está completa. Cada uno debe pasar.

| #   | Comando                                                                                                                                                    | Resultado esperado                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `docker compose up -d postgres`                                                                                                                            | Servicio `simpletpv-postgres` en estado `Up (healthy)` tras ~10 s. |
| 2   | `docker compose ps postgres`                                                                                                                               | Estado `Up (healthy)`.                                             |
| 3   | `cp .env.example .env`                                                                                                                                     | Sin error. `.env` no se commitea.                                  |
| 4   | `pnpm install`                                                                                                                                             | Sin warnings de strict-peer.                                       |
| 5   | `pnpm --filter @simpletpv/db exec prisma generate`                                                                                                         | Genera `packages/db/generated/client/`.                            |
| 6   | `pnpm --filter @simpletpv/db exec prisma migrate dev --name initial`                                                                                       | (Primera vez) crea migración initial y la aplica.                  |
| 7   | Crear `packages/db/prisma/migrations/<ts>_add_rls/migration.sql` manualmente (T9 del plan), después: `pnpm --filter @simpletpv/db exec prisma migrate dev` | Aplica `add_rls` sin error.                                        |
| 8   | `pnpm --filter @simpletpv/db exec prisma db seed`                                                                                                          | Imprime `Seed completado: 2 organizaciones.`                       |
| 9   | Re-ejecutar `prisma db seed`                                                                                                                               | Imprime el mismo mensaje sin duplicar (idempotente).               |
| 10  | `docker compose exec postgres psql -U postgres -d simpletpv -c 'SELECT COUNT(*) FROM "Organization";'`                                                     | `count = 2`.                                                       |
| 11  | `docker compose exec postgres psql -U postgres -d simpletpv -c "SELECT polname FROM pg_policy WHERE polname = 'tenant_isolation';"`                        | 4 filas (Organization, Store, User, Product).                      |
| 12  | `docker compose exec postgres psql -U postgres -d simpletpv -c "SELECT rolname FROM pg_roles WHERE rolname IN ('app', 'app_admin');"`                      | 2 filas.                                                           |
| 13  | `git status --porcelain`                                                                                                                                   | Vacío salvo el `.env` (que está en `.gitignore`).                  |

## 7. Riesgos y mitigaciones

| Riesgo                                                                                                                 | Mitigación                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma migrate dev` crea la migración `initial` con timestamp en su nombre — no podemos hardcodear el path en el plan | El plan invoca el comando que la genera (no la escribimos a mano) y luego añade `add_rls` después. Documentado en T8/T9.                                                                                                                                                                                                |
| RLS rota seed si `app_admin` no existe cuando seed corre                                                               | F2-D13: el seed corre como `postgres` (superuser), no como `app_admin`. `app_admin` queda creado pero no se usa en F2; F3 lo usará. Cero acoplamiento.                                                                                                                                                                  |
| `current_setting('app.current_organization_id', true)::uuid` falla si el valor no es UUID válido                       | Solo se usa cuando F3 hace `SET LOCAL` con un UUID validado de JWT. Fail-loud aquí es correcto.                                                                                                                                                                                                                         |
| Bcryptjs lento en seed                                                                                                 | El seed corre una vez por entorno y solo crea ~6 hashes. ~50 ms total. Aceptable.                                                                                                                                                                                                                                       |
| Migración `add_rls` no se reaplica si reseteamos la DB sin recrear roles                                               | `prisma migrate reset` ejecuta TODAS las migraciones incluyendo `add_rls`. Si el operador hace `DROP DATABASE` a mano, los roles los recrea la propia migración (idempotente solo en una DB nueva — si los roles ya existen, falla; aceptamos esto en F2, F3 puede pasar a `CREATE ROLE IF NOT EXISTS` si surge dolor). |
| `bind 127.0.0.1:5432` impide acceder a la DB desde otro contenedor en una red distinta                                 | En desarrollo local solo dev se conecta. En CI no se usa este docker-compose (CI usa `services:`). En producción es Dokploy con su propia red. Sin impacto.                                                                                                                                                             |
| Decimal(10,4) en `salePrice` vs Decimal(10,2) del MVP en algunos campos                                                | El MVP §4 usa Decimal(10,4) para precios (granel); F2 mantiene esa precisión. Consistente.                                                                                                                                                                                                                              |

## 8. Definición de "done" para F2

- [ ] Todos los archivos de §4 existen con el contenido de §5.
- [ ] Los 13 checks de §6 pasan en limpio.
- [ ] `pnpm lint` y `pnpm format` siguen pasando (F1 no se rompe).
- [ ] El commit final del trabajo de F2 es Conventional Commits y mergea en `main`.
- [ ] El cliente Prisma generado está en `packages/db/generated/client/` y NO está commiteado (gitignored).

## 9. Fuera de alcance — siguiente fase

- **F3** (`...-f3-api-nestjs-design.md` — pendiente): NestJS 11, `DATABASE_URL_APP` con rol `app`, `SET LOCAL app.current_organization_id` por request via Prisma middleware, healthcheck, Vitest, primer test de aislamiento RLS verificando que org A no ve datos de org B.
- **F4** (`...-f4-frontends-vite-design.md` — pendiente): React 19 + Vite 6 en `apps/tpv` y `apps/backoffice`.
- **CI** (plan ya escrito): tras F4, ejecutar el plan de CI que ya invoca `prisma migrate deploy` + `prisma db seed`.
