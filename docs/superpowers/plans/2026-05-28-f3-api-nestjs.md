# F3 — apps/api NestJS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar `apps/api` con NestJS 11 mínimo viable: `GET /health`, RLS multi-tenant aplicada por request vía `$extends` + `AsyncLocalStorage`, y test de integración que demuestra el aislamiento contra Postgres real.

**Architecture:** `PrismaService` extiende `PrismaClient`; un wrapper `applyTenantExtension` añade `$extends.query.$allOperations` que envuelve cada query en una transacción con `SET LOCAL app.current_organization_id`. `TenantMiddleware` valida `X-Org-Id` (regex UUID estricto) y pobla `AsyncLocalStorage`. Sin auth real ni CRUD — solo el esqueleto sobre el que MVP semana 1+ construye.

**Tech Stack:** NestJS 11 (Express platform), Prisma 6, TypeScript 6 (override `module: CommonJS` en `apps/api`), Vitest 2 + @vitest/coverage-v8, AsyncLocalStorage (node:async_hooks).

**Spec de referencia:** `docs/superpowers/specs/2026-05-28-f3-api-nestjs-design.md`

---

## Convenciones del plan

- **Rutas:** todas absolutas a `/Users/admin/Desktop/simpletpv/`.
- **Commits:** Conventional Commits, uno por tarea.
- **Verificación:** cada tarea valida antes de commitear; los tests son código real, no placeholders.
- **F1 y F2 asumidos completos:** repo git, monorepo Turborepo, `packages/db` con migraciones `initial` y `add_rls`, Postgres corriendo via docker-compose.
- **Cliente Prisma generado:** Task 2 corre `prisma generate` antes de cualquier código TS que importe de `@simpletpv/db`.

---

## File Structure

| Path                                                         | Acción                                     | Tarea |
| ------------------------------------------------------------ | ------------------------------------------ | ----- |
| `apps/api/package.json`                                      | Modificar (de stub a workspace real)       | T1    |
| `apps/api/tsconfig.json`                                     | Crear                                      | T1    |
| `apps/api/tsconfig.build.json`                               | Crear                                      | T1    |
| `apps/api/nest-cli.json`                                     | Crear                                      | T1    |
| `apps/api/vitest.config.ts`                                  | Crear                                      | T1    |
| `apps/api/vitest.integration.config.ts`                      | Crear                                      | T1    |
| `packages/db/prisma/migrations/<ts>_app_login/migration.sql` | Crear                                      | T2    |
| `.env.example` (raíz)                                        | Modificar (descomentar `DATABASE_URL_APP`) | T2    |
| `.env` (raíz, local)                                         | Modificar (añadir `DATABASE_URL_APP`)      | T2    |
| `apps/api/src/prisma/tenant-context.ts`                      | Crear                                      | T3    |
| `apps/api/src/prisma/prisma.service.ts`                      | Crear                                      | T4    |
| `apps/api/src/prisma/prisma.module.ts`                       | Crear                                      | T4    |
| `apps/api/src/tenant/tenant.middleware.ts`                   | Crear                                      | T5    |
| `apps/api/src/tenant/tenant.middleware.spec.ts`              | Crear                                      | T5    |
| `apps/api/src/tenant/tenant.module.ts`                       | Crear                                      | T5    |
| `apps/api/src/health/health.controller.ts`                   | Crear                                      | T6    |
| `apps/api/src/health/health.controller.spec.ts`              | Crear                                      | T6    |
| `apps/api/src/health/health.module.ts`                       | Crear                                      | T6    |
| `apps/api/src/app.module.ts`                                 | Crear                                      | T7    |
| `apps/api/src/main.ts`                                       | Crear                                      | T7    |
| `apps/api/test/rls.integration.spec.ts`                      | Crear                                      | T8    |
| `CLAUDE.md` (raíz)                                           | Modificar (nota override + tenant context) | T10   |

---

## Task 1: Scaffolding del workspace `@simpletpv/api`

**Files:**

- Modify: `/Users/admin/Desktop/simpletpv/apps/api/package.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/tsconfig.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/tsconfig.build.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/nest-cli.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/vitest.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/vitest.integration.config.ts`

- [ ] **Step 1: Sobrescribir `apps/api/package.json`**

Contenido exacto (reemplaza el stub de F1):

```json
{
  "name": "@simpletpv/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text",
    "test:watch": "vitest",
    "test:int": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@simpletpv/db": "workspace:*",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Crear `apps/api/tsconfig.json`**

Contenido exacto:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2023",
    "outDir": "./dist",
    "rootDir": "./src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Crear `apps/api/tsconfig.build.json`**

Contenido exacto:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

- [ ] **Step 4: Crear `apps/api/nest-cli.json`**

Contenido exacto:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

- [ ] **Step 5: Crear `apps/api/vitest.config.ts`**

Contenido exacto:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['test/**', 'node_modules', 'dist'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
});
```

- [ ] **Step 6: Crear `apps/api/vitest.integration.config.ts`**

Contenido exacto:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.spec.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

- [ ] **Step 7: Crear directorio `src/` vacío para que el workspace exista**

Run: `mkdir -p apps/api/src apps/api/test`

- [ ] **Step 8: Instalar dependencias**

Run: `pnpm install`
Expected: pnpm resuelve `@simpletpv/db` desde el workspace (link interno), instala todas las deps Nest + vitest sin errores ni warnings strict-peer.

> **Si strict-peer falla por `reflect-metadata`:** añadir `reflect-metadata` como devDependency también o ajustar a la versión que pida Nest. No relajar `strict-peer-dependencies`.

- [ ] **Step 9: Verificar JSON válidos**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/api/package.json','utf8'))" && \
node -e "JSON.parse(require('fs').readFileSync('apps/api/tsconfig.json','utf8'))" && \
node -e "JSON.parse(require('fs').readFileSync('apps/api/tsconfig.build.json','utf8'))" && \
node -e "JSON.parse(require('fs').readFileSync('apps/api/nest-cli.json','utf8'))" && \
echo OK
```

Expected: `OK`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json \
        apps/api/nest-cli.json apps/api/vitest.config.ts apps/api/vitest.integration.config.ts \
        pnpm-lock.yaml
git commit -m "feat(api): scaffolding @simpletpv/api (nest 11 + vitest + tsconfig CJS override)"
```

---

## Task 2: Migración `app_login` + actualización `.env.example`

**Files:**

- Create: `packages/db/prisma/migrations/<timestamp>_app_login/migration.sql`
- Modify: `/Users/admin/Desktop/simpletpv/.env.example`
- Modify: `/Users/admin/Desktop/simpletpv/.env` (local, no commiteable)

- [ ] **Step 1: Generar timestamp y crear directorio de la migración**

Run:

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "Timestamp: $TS"
mkdir -p "packages/db/prisma/migrations/${TS}_app_login"
echo "$TS" > /tmp/simpletpv-app-login-ts
```

Expected: imprime el timestamp; carpeta creada vacía.

- [ ] **Step 2: Crear `migration.sql`**

Crear `packages/db/prisma/migrations/${TS}_app_login/migration.sql` (sustituir `${TS}` por el valor del step 1) con contenido exacto:

```sql
-- F3 necesita que el rol `app` (creado en add_rls con NOLOGIN) pueda
-- conectarse desde la aplicación. Le damos LOGIN y contraseña de desarrollo.
-- En producción Dokploy sobrescribirá la contraseña vía ALTER ROLE con
-- secret antes del despliegue inicial.

ALTER ROLE app LOGIN PASSWORD 'app_dev_password';
```

- [ ] **Step 3: Aplicar la migración**

Run:

```bash
set -a && source .env && set +a
pnpm --filter @simpletpv/db exec prisma migrate dev --skip-seed
```

Expected: salida que incluye `Applying migration '<timestamp>_app_login'` y termina con `Your database is now in sync with your schema.`

- [ ] **Step 4: Verificar que `app` tiene login**

Run:

```bash
docker compose exec -T postgres psql -U postgres -d simpletpv -c \
  "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname='app';"
```

Expected: 1 fila, `rolcanlogin = t`.

- [ ] **Step 5: Verificar conexión como `app`**

Run:

```bash
PGPASSWORD=app_dev_password psql -h localhost -U app -d simpletpv -c 'SELECT current_user;'
```

Expected: imprime `app` como current_user. Si `psql` no está en el host, hacerlo desde dentro del contenedor:

```bash
docker compose exec -T postgres bash -c "PGPASSWORD=app_dev_password psql -h localhost -U app -d simpletpv -c 'SELECT current_user;'"
```

- [ ] **Step 6: Actualizar `.env.example`**

Sobrescribir `.env.example` con contenido exacto:

```
# Postgres local (docker compose up -d postgres)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=simpletpv

# Prisma migrate/seed usa este (superuser).
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/simpletpv?schema=public

# API runtime usa este (rol app con RLS aplicada).
DATABASE_URL_APP=postgresql://app:app_dev_password@localhost:5432/simpletpv?schema=public
```

- [ ] **Step 7: Actualizar `.env` local**

Run:

```bash
if ! grep -q '^DATABASE_URL_APP=' .env; then
  echo 'DATABASE_URL_APP=postgresql://app:app_dev_password@localhost:5432/simpletpv?schema=public' >> .env
fi
grep DATABASE_URL .env
```

Expected: dos líneas, `DATABASE_URL=...` y `DATABASE_URL_APP=...`.

> **`.env` está en `.gitignore` (F1)** — no se commitea. Solo `.env.example` entra en el commit.

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/migrations/ .env.example
git commit -m "feat(db): migración app_login + .env.example con DATABASE_URL_APP"
```

---

## Task 3: AsyncLocalStorage para tenant context

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/prisma/tenant-context.ts`

- [ ] **Step 1: Crear directorio**

Run: `mkdir -p apps/api/src/prisma`

- [ ] **Step 2: Crear `tenant-context.ts`**

Contenido exacto:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenant(): TenantContext | undefined {
  return tenantStorage.getStore();
}
```

- [ ] **Step 3: Verificar typecheck del archivo**

Run: `pnpm --filter @simpletpv/api exec tsc --noEmit src/prisma/tenant-context.ts`
Expected: sin errores (la opción `--noEmit` con un solo archivo puede ignorar `tsconfig.json`; alternativa: `pnpm --filter @simpletpv/api typecheck`).

Si falla por `tsc` no encontrado: `pnpm install` desde la raíz.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/prisma/tenant-context.ts
git commit -m "feat(api): tenant-context con AsyncLocalStorage"
```

---

## Task 4: PrismaService con `$extends` para RLS

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/prisma/prisma.service.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/prisma/prisma.module.ts`

- [ ] **Step 1: Asegurar cliente Prisma generado**

Run: `pnpm --filter @simpletpv/db exec prisma generate`
Expected: `✔ Generated Prisma Client` o equivalente.

- [ ] **Step 2: Crear `prisma.service.ts`**

Contenido exacto:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@simpletpv/db';

import { getCurrentTenant } from './tenant-context.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: { url: process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL },
      },
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// Cliente extendido con RLS: cada query envuelve SET LOCAL en una transacción
// con el organizationId del AsyncLocalStorage. UUID validado por TenantMiddleware
// antes de entrar al storage (no hay riesgo de SQL injection vía organizationId).
// Sin contexto → query corre sin SET LOCAL → RLS devuelve 0 filas (fail-safe).
export function applyTenantExtension(client: PrismaService) {
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const tenant = getCurrentTenant();
        if (!tenant) {
          return query(args);
        }
        return client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_organization_id = '${tenant.organizationId}'`,
          );
          return query(args);
        });
      },
    },
  });
}
```

- [ ] **Step 3: Crear `prisma.module.ts`**

Contenido exacto:

```ts
import { Global, Module } from '@nestjs/common';

import { applyTenantExtension, PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: () => {
        const client = new PrismaService();
        return applyTenantExtension(client) as unknown as PrismaService;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @simpletpv/api typecheck`
Expected: sin errores.

> **Si tsc se queja de `Cannot find module '@simpletpv/db'`:** ejecutar `pnpm --filter @simpletpv/db exec prisma generate` y reintentar. El cliente debe existir en `packages/db/generated/client/`.

> **Si tsc se queja de `useFactory` con tipos:** la conversión `as unknown as PrismaService` es deliberada — el extended client tiene tipos distintos pero compatibles en runtime. Aceptado en F3, refinable cuando MVP semana 1 añada DI más estricta.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prisma/prisma.service.ts apps/api/src/prisma/prisma.module.ts
git commit -m "feat(api): PrismaService con \$extends para RLS por request"
```

---

## Task 5: TenantMiddleware con tests

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/tenant/tenant.middleware.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/tenant/tenant.middleware.spec.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/tenant/tenant.module.ts`

- [ ] **Step 1: Crear directorio**

Run: `mkdir -p apps/api/src/tenant`

- [ ] **Step 2: Escribir test fallando (TDD)**

Crear `apps/api/src/tenant/tenant.middleware.spec.ts` con contenido exacto:

```ts
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { TenantMiddleware } from './tenant.middleware.js';

function mockReq(path: string, headers: Record<string, string> = {}): Request {
  return {
    path,
    header: (name: string) => headers[name],
  } as unknown as Request;
}

describe('TenantMiddleware', () => {
  const middleware = new TenantMiddleware();
  const res = {} as Response;

  it('exenta /health sin requerir X-Org-Id', () => {
    const next = vi.fn();
    middleware.use(mockReq('/health'), res, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza request sin X-Org-Id', () => {
    expect(() => middleware.use(mockReq('/products'), res, vi.fn() as NextFunction)).toThrow(
      /X-Org-Id/,
    );
  });

  it('rechaza X-Org-Id que no es UUID', () => {
    expect(() =>
      middleware.use(
        mockReq('/products', { 'X-Org-Id': 'not-a-uuid' }),
        res,
        vi.fn() as NextFunction,
      ),
    ).toThrow(/UUID/);
  });

  it('rechaza UUID con caracteres extraños (potencial SQL injection)', () => {
    expect(() =>
      middleware.use(
        mockReq('/products', { 'X-Org-Id': "'; DROP TABLE Organization; --" }),
        res,
        vi.fn() as NextFunction,
      ),
    ).toThrow(/UUID/);
  });

  it('pobla AsyncLocalStorage con UUID válido y llama next', () => {
    const validUuid = '11111111-1111-1111-1111-111111111111';
    let observed: string | undefined;

    middleware.use(mockReq('/products', { 'X-Org-Id': validUuid }), res, (() => {
      observed = tenantStorage.getStore()?.organizationId;
    }) as NextFunction);

    expect(observed).toBe(validUuid);
  });
});
```

- [ ] **Step 3: Correr test → debe FALLAR (no existe el módulo todavía)**

Run: `pnpm --filter @simpletpv/api test`
Expected: FAIL con `Cannot find module './tenant.middleware.js'` o similar.

- [ ] **Step 4: Crear `tenant.middleware.ts`**

Contenido exacto:

```ts
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { tenantStorage } from '../prisma/tenant-context.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rutas que NO requieren contexto de tenant.
// /health debe responder aunque no haya tenant ni DB.
const EXEMPT_PATHS = new Set<string>(['/health']);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }

    const orgId = req.header('X-Org-Id');
    if (!orgId || !UUID_RE.test(orgId)) {
      throw new BadRequestException('X-Org-Id header obligatorio y debe ser UUID v4 válido');
    }

    tenantStorage.run({ organizationId: orgId }, () => next());
  }
}
```

- [ ] **Step 5: Crear `tenant.module.ts`**

Contenido exacto:

```ts
import { Module } from '@nestjs/common';

import { TenantMiddleware } from './tenant.middleware.js';

@Module({
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantModule {}
```

- [ ] **Step 6: Correr test → debe PASAR**

Run: `pnpm --filter @simpletpv/api test`
Expected: los 5 tests de `TenantMiddleware` pasan.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tenant/
git commit -m "feat(api): TenantMiddleware (valida X-Org-Id UUID, pobla AsyncLocalStorage)"
```

---

## Task 6: HealthController con tests

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/health/health.controller.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/health/health.controller.spec.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/health/health.module.ts`

- [ ] **Step 1: Crear directorio**

Run: `mkdir -p apps/api/src/health`

- [ ] **Step 2: Escribir test fallando**

Crear `apps/api/src/health/health.controller.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('devuelve status ok con uptime numérico', () => {
    const controller = new HealthController();
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Correr test → debe FALLAR**

Run: `pnpm --filter @simpletpv/api test src/health`
Expected: FAIL por `Cannot find module './health.controller.js'`.

- [ ] **Step 4: Crear `health.controller.ts`**

Contenido exacto:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }
}
```

- [ ] **Step 5: Crear `health.module.ts`**

Contenido exacto:

```ts
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 6: Correr test → debe PASAR**

Run: `pnpm --filter @simpletpv/api test src/health`
Expected: 1 test pasa.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/health/
git commit -m "feat(api): HealthController GET /health (sin tocar DB)"
```

---

## Task 7: AppModule + bootstrap main.ts

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/app.module.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/api/src/main.ts`

- [ ] **Step 1: Crear `app.module.ts`**

Contenido exacto:

```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenantMiddleware } from './tenant/tenant.middleware.js';
import { TenantModule } from './tenant/tenant.module.js';

@Module({
  imports: [PrismaModule, TenantModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 2: Crear `main.ts`**

Contenido exacto:

```ts
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error', 'log'],
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API escuchando en :${port}`);
}

bootstrap().catch((err) => {
  console.error('Fallo arrancando API:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @simpletpv/api build`
Expected: NestJS compila a `apps/api/dist/`. Sin errores TS.

- [ ] **Step 4: Arrancar manualmente y validar `/health`**

Run en terminal 1:

```bash
set -a && source .env && set +a
pnpm --filter @simpletpv/api start
```

Expected: imprime `API escuchando en :3000`.

Run en terminal 2:

```bash
curl -s http://localhost:3000/health
```

Expected: `{"status":"ok","uptime":<numérico>}`.

- [ ] **Step 5: Validar middleware rechaza request sin X-Org-Id**

Run en terminal 2:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/products
```

Expected: `400`.

- [ ] **Step 6: Validar middleware acepta UUID válido**

Run:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'X-Org-Id: 11111111-1111-1111-1111-111111111111' \
  http://localhost:3000/products
```

Expected: `404` (no hay controller de products todavía — confirma que el middleware deja pasar UUIDs válidos al routing de Nest).

- [ ] **Step 7: Matar la API en terminal 1 (`Ctrl+C`)**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): AppModule + bootstrap (TenantMiddleware global)"
```

---

## Task 8: Test de integración RLS contra Postgres real

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/api/test/rls.integration.spec.ts`

- [ ] **Step 1: Asegurar prerrequisitos**

Run:

```bash
docker compose ps postgres | grep -q healthy && echo "postgres OK" || \
  (docker compose up -d postgres && sleep 6)
set -a && source .env && set +a
pnpm --filter @simpletpv/db exec prisma migrate deploy
pnpm --filter @simpletpv/db exec prisma db seed
```

Expected: postgres healthy, migraciones aplicadas, seed con 2 orgs.

- [ ] **Step 2: Crear `apps/api/test/rls.integration.spec.ts`**

Contenido exacto:

```ts
// Test de integración: verifica que RLS aísla orgs DE VERDAD contra una
// instancia real de Postgres. Si esto falla, la seguridad multi-tenant
// está rota — todo el resto sobra.
//
// Requisitos previos:
//   - Postgres corriendo (docker compose up -d postgres).
//   - Migraciones aplicadas (initial + add_rls + app_login).
//   - Seed ejecutado (2 organizaciones: B11111111 y B22222222).
//   - DATABASE_URL_APP apunta al rol `app` (no superuser).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('RLS aislamiento multi-tenant', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);

    // Descubrimos IDs con $queryRaw como rol `app` SIN contexto.
    // RLS bloquearía un SELECT normal, pero $queryRaw como app sin SET LOCAL
    // también devuelve 0 (igual de fail-safe). Usamos una conexión SIN
    // extensión (base) que actúa como conexión a app — sigue siendo RLS-bound
    // pero sin SET LOCAL → 0 filas. Para descubrir IDs necesitamos saltar
    // RLS aquí, así que usamos un cliente temporal con DATABASE_URL (superuser).

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const admin = new AdminClient({ datasources: { db: { url: adminUrl } } });
    try {
      const found1 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
      `;
      const found2 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B22222222'
      `;
      if (found1.length === 0 || found2.length === 0) {
        throw new Error(
          'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
        );
      }
      org1Id = found1[0].id;
      org2Id = found2[0].id;
    } finally {
      await admin.$disconnect();
    }
  });

  afterAll(async () => {
    await base.onModuleDestroy();
  });

  it('org1 solo ve sus propios productos', async () => {
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      const products = await prisma.product.findMany();
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.organizationId).toBe(org1Id);
      }
    });
  });

  it('org2 solo ve sus propios productos', async () => {
    await tenantStorage.run({ organizationId: org2Id }, async () => {
      const products = await prisma.product.findMany();
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.organizationId).toBe(org2Id);
      }
    });
  });

  it('sin contexto, devuelve 0 filas (fail-safe)', async () => {
    const products = await prisma.product.findMany();
    expect(products).toEqual([]);
  });

  it('contexto de org1 no permite leer datos de org2', async () => {
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      const allUsers = await prisma.user.findMany();
      const org2Users = allUsers.filter((u) => u.organizationId === org2Id);
      expect(org2Users).toEqual([]);
    });
  });
});
```

> **Nota implementación:** el `beforeAll` necesita descubrir los UUIDs de las dos orgs. Como el cliente extendido sin contexto devuelve 0, usamos un `PrismaClient` admin temporal con `DATABASE_URL` (superuser) SOLO para descubrir IDs. Es un compromiso aceptable para tests; en producción nunca se mezclan los dos roles.

- [ ] **Step 3: Correr test de integración**

Run:

```bash
set -a && source .env && set +a
pnpm --filter @simpletpv/api test:int
```

Expected: 4 tests pasan. Salida tipo:

```
✓ RLS aislamiento multi-tenant > org1 solo ve sus propios productos
✓ RLS aislamiento multi-tenant > org2 solo ve sus propios productos
✓ RLS aislamiento multi-tenant > sin contexto, devuelve 0 filas (fail-safe)
✓ RLS aislamiento multi-tenant > contexto de org1 no permite leer datos de org2

Test Files  1 passed (1)
     Tests  4 passed (4)
```

> **Si el test "sin contexto" devuelve filas en lugar de 0:** RLS no está activa o el rol conectado tiene BYPASSRLS. Verificar:
>
> - `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname='app';` → `rolbypassrls = f`.
> - `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('Product','User');` → ambos `t`.
> - `DATABASE_URL_APP` apunta al usuario `app`, no a `postgres`.

> **Si `$transaction` rompe con "no se pueden anidar transacciones":** revisar que `applyTenantExtension` usa `client.$transaction` y no `tx.$transaction`. Aceptable: si Prisma 6 no permite el patrón exacto, alternativa es `$executeRawUnsafe` antes de cada query sin envolver en transacción (RLS aplica al statement). El plan documenta cuál usar tras descubrirlo en ejecución.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/rls.integration.spec.ts
git commit -m "test(api): integration spec que prueba aislamiento RLS contra postgres real"
```

---

## Task 9: Cobertura de tests unitarios

**Files:** ninguno permanente.

Esta tarea verifica que `pnpm --filter @simpletpv/api test` genera `coverage-summary.json` que el plan de CI necesita.

- [ ] **Step 1: Limpiar coverage previo**

Run: `rm -rf apps/api/coverage`

- [ ] **Step 2: Ejecutar tests unitarios con cobertura**

Run: `pnpm --filter @simpletpv/api test`
Expected:

- Los 6 tests (5 de TenantMiddleware + 1 de HealthController) pasan.
- Imprime tabla de coverage en consola.
- Genera `apps/api/coverage/coverage-summary.json`.

- [ ] **Step 3: Verificar que `coverage-summary.json` tiene la forma esperada**

Run:

```bash
node -e "
  const s = require('./apps/api/coverage/coverage-summary.json');
  console.log('statements pct:', s.total.statements.pct);
  if (typeof s.total.statements.pct !== 'number') {
    console.error('FAIL: no pct numérico');
    process.exit(1);
  }
  console.log('OK');
"
```

Expected: imprime `statements pct: <número>` y `OK`. El plan de CI consume exactamente este formato (ver `coverage-threshold.json` y job `quality` del plan de CI).

- [ ] **Step 4: Sin commit (esta tarea solo valida)**

`coverage/` está en `.gitignore` (F1) — no se commitea.

---

## Task 10: Actualizar `CLAUDE.md` con convenciones de F3

**Files:**

- Modify: `/Users/admin/Desktop/simpletpv/CLAUDE.md`

- [ ] **Step 1: Leer la versión actual**

Run: `cat CLAUDE.md`

- [ ] **Step 2: Añadir bloque al final de la sección "Convenciones"**

Editar `CLAUDE.md` añadiendo las siguientes líneas dentro de la sección "Convenciones" (mantener las existentes):

```
- `apps/api/tsconfig.json` sobrescribe `module` a `CommonJS` (NestJS 11 más estable). El resto del monorepo usa ESM. Override documentado en `docs/superpowers/specs/2026-05-28-f3-api-nestjs-design.md` F3-D2.
- Multi-tenancy: cada request HTTP DEBE pasar `X-Org-Id` (UUID v4) salvo `/health`. `TenantMiddleware` lo valida y pobla `AsyncLocalStorage`. `PrismaService` con `$extends` ejecuta `SET LOCAL app.current_organization_id` por cada query → RLS aplicada en DB.
- Sin contexto → query devuelve 0 filas (fail-safe). Nunca filtra entre tenants.
```

- [ ] **Step 3: Verificar que el archivo sigue parseando como markdown válido**

Run: `pnpm format`
Expected: sin error. Si Prettier reformatea CLAUDE.md, aceptar el reformateo.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md con convenciones F3 (CJS override + tenant context)"
```

---

## Task 11: Validación de cierre de F3

**Files:** ninguno permanente; solo verificación.

- [ ] **Step 1: Aplicar los 16 checks del spec §6**

Ejecutar uno por uno desde la raíz:

```bash
# 1. install limpio
pnpm install

# 2. migraciones aplicadas
set -a && source .env && set +a
pnpm --filter @simpletpv/db exec prisma migrate deploy

# 3. app puede login
docker compose exec -T postgres psql -U postgres -d simpletpv -c \
  "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname='app';"
# Expected: rolcanlogin = t

# 4. seed
pnpm --filter @simpletpv/db exec prisma db seed
# Expected: Seed completado: 2 organizaciones.

# 5. db build (genera cliente Prisma)
pnpm --filter @simpletpv/db build

# 6. api build
pnpm --filter @simpletpv/api build
# Expected: dist/ creado

# 7. tests unitarios con cobertura
pnpm --filter @simpletpv/api test
# Expected: todos pasan, coverage-summary.json creado

# 8. tests de integración
pnpm --filter @simpletpv/api test:int
# Expected: 4 tests RLS pasan

# 9-12. healthcheck + middleware (terminal 1 arranca, terminal 2 prueba)
pnpm --filter @simpletpv/api start &
API_PID=$!
sleep 3
curl -s http://localhost:3000/health
echo ""
curl -s -o /dev/null -w 'sin X-Org-Id: %{http_code}\n' http://localhost:3000/products
curl -s -o /dev/null -w 'X-Org-Id inválido: %{http_code}\n' -H 'X-Org-Id: not-a-uuid' http://localhost:3000/products
curl -s -o /dev/null -w 'X-Org-Id válido: %{http_code}\n' -H 'X-Org-Id: 11111111-1111-1111-1111-111111111111' http://localhost:3000/products
kill $API_PID
# Expected:
#   {"status":"ok","uptime":...}
#   sin X-Org-Id: 400
#   X-Org-Id inválido: 400
#   X-Org-Id válido: 404

# 14. lint + format raíz
pnpm lint && pnpm format

# 15. typecheck
pnpm typecheck

# 16. git limpio
git status --porcelain
# Expected: vacío
```

- [ ] **Step 2: Confirmar que F1 y F2 siguen verdes**

Run:

```bash
pnpm lint && pnpm format && pnpm --filter @simpletpv/db build
docker compose exec -T postgres psql -U postgres -d simpletpv -tc 'SELECT COUNT(*) FROM "Organization";'
```

Expected: lint/format/build OK; conteo de Organization = 2.

- [ ] **Step 3: Verificar git log**

Run: `git log --oneline | head -15`
Expected: al menos 10 commits de F3 (uno por cada Task 1-8 + Task 10), Conventional Commits.

- [ ] **Step 4: Sin commit final (esta tarea solo valida)**

---

## Self-review (ejecutado al escribir el plan)

**1. Cobertura del spec:**

| Spec §                             | Cubierto por                     |
| ---------------------------------- | -------------------------------- |
| §4 estructura completa             | T1-T7 (cada archivo tiene tarea) |
| §5.1 package.json @simpletpv/api   | T1 step 1                        |
| §5.2 tsconfig.json (CJS override)  | T1 step 2                        |
| §5.3 tsconfig.build.json           | T1 step 3                        |
| §5.4 nest-cli.json                 | T1 step 4                        |
| §5.5 tenant-context.ts             | T3                               |
| §5.6 prisma.service.ts             | T4 step 2                        |
| §5.7 prisma.module.ts              | T4 step 3                        |
| §5.8 tenant.middleware.ts          | T5 step 4                        |
| §5.9 tenant.module.ts              | T5 step 5                        |
| §5.10 health.controller.ts         | T6 step 4                        |
| §5.11 health.module.ts             | T6 step 5                        |
| §5.12 app.module.ts                | T7 step 1                        |
| §5.13 main.ts                      | T7 step 2                        |
| §5.14 vitest.config.ts             | T1 step 5                        |
| §5.15 vitest.integration.config.ts | T1 step 6                        |
| §5.16 health.controller.spec.ts    | T6 step 2                        |
| §5.17 tenant.middleware.spec.ts    | T5 step 2                        |
| §5.18 rls.integration.spec.ts      | T8 step 2                        |
| §5.19 migración app_login          | T2 step 2                        |
| §5.20 .env.example actualizado     | T2 step 6                        |
| §5.21 CLAUDE.md actualizado        | T10                              |
| §6 validación 16 checks            | T11                              |
| §8 definición de done              | T11 (todos los puntos cubiertos) |

Extra: T9 valida explícitamente el contrato con el plan de CI (coverage-summary.json formato).

Sin gaps.

**2. Placeholder scan:**

- `<timestamp>` y `<ts>` en T2 son notación de Prisma (timestamp generado en runtime via `date -u`); T2 step 1 captura el valor en `$TS` y step 2 lo usa explícitamente.
- Notas `> **Si X:**` son contingencias, no diferimientos.
- T8 step 3 anticipa el riesgo de `$transaction` anidados y documenta la alternativa explícitamente — no es un placeholder, es un fallback.

**3. Consistencia de tipos/nombres:**

- `@simpletpv/api`, `@simpletpv/db` consistentes.
- `tenantStorage`, `getCurrentTenant`, `applyTenantExtension`, `PrismaService`, `TenantMiddleware`, `HealthController`, `AppModule` consistentes entre archivos y tests.
- `app.current_organization_id` consistente entre migración add_rls (F2), `prisma.service.ts` (T4), `tenant-context.ts` (T3), tests integration (T8), spec §3.
- `X-Org-Id` consistente entre middleware (T5), curl checks (T7), spec §3.
- `DATABASE_URL_APP` consistente entre `.env.example` (T2), PrismaService (T4), validación T11.
- `app_dev_password` consistente entre migración (T2 step 2) y `.env.example` (T2 step 6).

Sin issues detectados.
