# Spec — F3: `apps/api` NestJS mínimo

| Campo       | Valor                                                                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-05-28                                                                                                                                                                                                                                                                   |
| Autor       | noel@noelcaravaca.com                                                                                                                                                                                                                                                        |
| Estado      | Aprobado para implementación                                                                                                                                                                                                                                                 |
| Fase        | F3 (de 4 de scaffolding) — depende de F1 y F2; precede a F4 y al plan de CI                                                                                                                                                                                                  |
| Referencias | `Plan_Desarrollo_MVP.md` §1 (NestJS 11), §2 (arquitectura), §6 (RLS); `docs/superpowers/specs/2026-05-28-f2-db-prisma-design.md`; `docs/superpowers/specs/2026-05-28-ci-pipeline-design.md` §5.1 (el job E2E hace `pnpm --filter @qrush/api start` y consulta `GET /health`) |

## 1. Objetivo

Levantar `apps/api` con NestJS 11 en su **alcance mínimo viable**: app arrancable, endpoint `GET /health` que responde 200, conexión a Prisma como rol `app` con RLS aplicada automáticamente por cada request mediante un patrón `$extends` + `AsyncLocalStorage` + `SET LOCAL`, y un test de integración que verifica el aislamiento multi-tenant en directo.

F3 entrega la **capa de servidor mínima** sobre la que el MVP semana 1+ construye auth real, CRUD y módulos de negocio. Sin auth, sin CRUD, sin Swagger todavía — eso es deuda intencional, no oversight.

Al cerrar F3:

- `pnpm --filter @qrush/api start` arranca un servidor en `:3000` con `/health` 200.
- `pnpm --filter @qrush/api test` corre tests unitarios con cobertura.
- `pnpm --filter @qrush/api test:int` corre tests de integración contra Postgres real que **demuestran** que org A no ve datos de org B.
- El job E2E del plan de CI puede arrancar la API y validar `/health`.

## 2. Alcance

**Incluido:**

- Scaffolding NestJS 11 en `apps/api/` (`main.ts`, `app.module.ts`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`).
- `package.json` del workspace `@qrush/api` con deps NestJS, vitest, dependencia `@qrush/db: workspace:*`.
- Módulo `PrismaModule` (global) con `PrismaService` que extiende `PrismaClient`, aplica `$extends` para inyectar `SET LOCAL app.current_organization_id` por query usando `AsyncLocalStorage`.
- Helper `tenant-context.ts` con `AsyncLocalStorage<TenantContext>`.
- `TenantMiddleware` que valida `X-Org-Id` (UUID estricto, regex), exenta `/health`, pobla `AsyncLocalStorage` o lanza 400.
- `HealthController` con `GET /health` que NO toca DB y devuelve `{status: 'ok', uptime}`.
- Migración Prisma `<ts>_app_login` que añade `LOGIN PASSWORD` al rol `app` creado por F2.
- Actualización de `.env.example` para activar `DATABASE_URL_APP`.
- Vitest configurado con dos perfiles: `vitest.config.ts` (unit) y `vitest.integration.config.ts` (integration).
- Tests unitarios: `health.controller.spec.ts`, `tenant.middleware.spec.ts`.
- Test de integración: `test/rls.integration.spec.ts` que verifica aislamiento RLS contra Postgres real.

**Excluido:**

- Auth real (JWT, login, refresh tokens) → MVP semana 1. F3 usa header `X-Org-Id` como stub.
- CRUD de cualquier recurso → MVP semana 1-2.
- Swagger / OpenAPI → cuando haya endpoints reales que documentar.
- Pipes globales de validación (class-validator/class-transformer) → con el primer CRUD.
- Logging estructurado (Pino) → cuando se note dolor.
- Sentry / instrumentación → cuando exista entorno donde reportar.
- SSE / Redis pub/sub → MVP semana de tiempo real.
- Rate limiting → MVP cuando haya endpoints expuestos.
- Connection pooling (PgBouncer) → post-MVP si se necesita.

## 3. Decisiones explícitas

| #      | Decisión                                                                                               | Justificación                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3-D1  | Mínimo viable (sin auth, sin CRUD)                                                                     | YAGNI. Cada semana del MVP añade su capa. F3 entrega solo lo que CI y F4 necesitan.                                                                                               |
| F3-D2  | `module: CommonJS` override en `apps/api/tsconfig.json` (raíz declara ESNext)                          | Ecosistema NestJS 11 más estable en CJS. Migración a ESM cuando Nest 12 lo solidifique. Override documentado y aceptado.                                                          |
| F3-D3  | RLS via `$extends` + `AsyncLocalStorage` + `$transaction` con `SET LOCAL`                              | Patrón recomendado por docs Prisma 6 para multi-tenancy. Cada query lleva su contexto inviolable, sin contaminar controllers.                                                     |
| F3-D4  | `X-Org-Id` header como stub de auth en F3                                                              | Auth real es trabajo de MVP semana 1. El stub permite tests E2E y manual sin bloqueo. Validado UUID estrictamente.                                                                |
| F3-D5  | `/health` NO toca DB                                                                                   | Healthcheck robusto independiente de DB caída. Load balancers no deben tirar la app por dependencia externa. Si en el futuro hace falta `/health/db`, será endpoint separado.     |
| F3-D6  | Migración `<ts>_app_login` añade `LOGIN PASSWORD 'app_dev_password'` al rol `app`                      | F2 dejó `app` como NOLOGIN coherentemente con su alcance. F3 añade login porque F3 es quien necesita conectarse como `app`. Cada fase añade lo que su capa exige.                 |
| F3-D7  | `DATABASE_URL_APP` con fallback a `DATABASE_URL` en `PrismaService`                                    | Permite que la API arranque antes de aplicar la migración de login y después con la URL correcta. Producción siempre usa `DATABASE_URL_APP`.                                      |
| F3-D8  | Vitest (no Jest)                                                                                       | Coherente con el spec de CI que ya invoca `vitest run --coverage`. NestJS docs recomiendan Jest por defecto pero Vitest funciona bien en Nest 11.                                 |
| F3-D9  | `vitest.config.ts` (unit) separado de `vitest.integration.config.ts` (integration)                     | Unit es rápido y sin DB; integration necesita DB, timeouts mayores, run secuencial. Separación clara evita acoplamientos.                                                         |
| F3-D10 | `$executeRawUnsafe` con interpolación de `organizationId`                                              | Aceptado riesgo conocido y mitigado: el middleware valida regex UUID estricto antes de poblar `AsyncLocalStorage`. Imposible llegar a `SET LOCAL` con valor no-UUID. Documentado. |
| F3-D11 | Sin Swagger, sin guards globales, sin pipes globales de validación en F3                               | YAGNI. No hay endpoints reales que documentar/validar. MVP semana 1 los añade con el primer CRUD.                                                                                 |
| F3-D12 | `@qrush/db` como `workspace:*`                                                                         | Resolución estándar de pnpm workspaces. F3 importa el cliente Prisma generado por F2.                                                                                             |
| F3-D13 | Sin contexto de tenant → query corre como rol `app` sin `SET LOCAL` → RLS devuelve 0 filas (fail-safe) | Diseño explícito. Si alguien olvida poblar contexto, NUNCA fuga datos: ve 0 en lugar de todos. Mejor query rota que tenant filtration.                                            |
| F3-D14 | Bootstrap con Express (no Fastify)                                                                     | Default de NestJS 11. Cambio a Fastify es decisión separada cuando se note necesidad de performance.                                                                              |
| F3-D15 | `NODE_ENV` no se usa para condicionar lógica de seguridad                                              | Mismo binario en dev, CI y prod; diferencias solo via env vars. Evita "funciona en dev pero rompe en prod".                                                                       |

## 4. Estructura final de `apps/api`

```
apps/api/
├── package.json                       (actualizado: deps Nest + vitest + @qrush/db workspace)
├── tsconfig.json                      (extends raíz, override module: CommonJS)
├── tsconfig.build.json                (excluye tests del build de Nest)
├── nest-cli.json                      (config CLI Nest)
├── vitest.config.ts                   (unit; coverage reporter json-summary)
├── vitest.integration.config.ts       (integration; secuencial, timeout 30s)
├── src/
│   ├── main.ts                        (bootstrap NestFactory.create, listen)
│   ├── app.module.ts                  (root: PrismaModule + HealthModule + TenantMiddleware aplicado)
│   ├── health/
│   │   ├── health.module.ts
│   │   ├── health.controller.ts       (GET /health)
│   │   └── health.controller.spec.ts  (unit)
│   ├── prisma/
│   │   ├── prisma.module.ts           (@Global({ providers: [PrismaService], exports: [PrismaService] }))
│   │   ├── prisma.service.ts          (PrismaClient + $extends para SET LOCAL)
│   │   └── tenant-context.ts          (AsyncLocalStorage helper)
│   └── tenant/
│       ├── tenant.module.ts
│       ├── tenant.middleware.ts       (extrae X-Org-Id → AsyncLocalStorage)
│       └── tenant.middleware.spec.ts  (unit)
└── test/
    └── rls.integration.spec.ts        (verifica aislamiento RLS contra Postgres real)
```

Y, **fuera de `apps/api/`**, F3 también toca:

- `packages/db/prisma/migrations/<ts>_app_login/migration.sql` (nueva migración para login del rol `app`).
- `.env.example` (raíz, descomenta `DATABASE_URL_APP`).
- `CLAUDE.md` (raíz, añade nota sobre override de `module: CommonJS` en `apps/api`).

## 5. Contenido de archivos

### 5.1 `apps/api/package.json`

```json
{
  "name": "@qrush/api",
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
    "@qrush/db": "workspace:*",
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

Notas:

- `type: module` se hereda de F1 pero NestJS funciona como CJS en runtime gracias al override de `tsconfig.json`. El `package.json` declara ESM por consistencia con el monorepo; Nest build genera CJS en `dist/` y `node dist/main.js` lo ejecuta correctamente.
- `test` ya genera `coverage-summary.json` — lo consume el ratchet del plan de CI.

### 5.2 `apps/api/tsconfig.json`

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

### 5.3 `apps/api/tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

### 5.4 `apps/api/nest-cli.json`

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

### 5.5 `apps/api/src/prisma/tenant-context.ts`

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

### 5.6 `apps/api/src/prisma/prisma.service.ts`

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@qrush/db';

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

// El extended client se exporta como factory para uso externo si hace falta;
// el módulo lo inyecta como PrismaService directamente.
export function applyTenantExtension(client: PrismaService) {
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const tenant = getCurrentTenant();
        if (!tenant) {
          // Sin contexto: query corre como rol `app` sin SET LOCAL.
          // RLS devolverá 0 filas → fail-safe.
          return query(args);
        }
        // Cada query corre en una transacción que envuelve SET LOCAL + query.
        // El UUID ya fue validado por TenantMiddleware (regex estricta) — no
        // hay riesgo de SQL injection vía organizationId.
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

> **Nota implementación:** Prisma 6 `$extends` no se aplica en el constructor del `PrismaClient` extendido; se aplica desde fuera. El módulo `PrismaModule` (§5.7) configura el provider para devolver el cliente extendido.

### 5.7 `apps/api/src/prisma/prisma.module.ts`

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
        // applyTenantExtension devuelve un cliente extendido con $extends.
        // Lo asignamos al mismo símbolo para que los consumidores reciban
        // la versión con RLS automática.
        return applyTenantExtension(client) as unknown as PrismaService;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 5.8 `apps/api/src/tenant/tenant.middleware.ts`

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

### 5.9 `apps/api/src/tenant/tenant.module.ts`

```ts
import { Module } from '@nestjs/common';

import { TenantMiddleware } from './tenant.middleware.js';

@Module({
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantModule {}
```

### 5.10 `apps/api/src/health/health.controller.ts`

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

### 5.11 `apps/api/src/health/health.module.ts`

```ts
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

### 5.12 `apps/api/src/app.module.ts`

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

### 5.13 `apps/api/src/main.ts`

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

### 5.14 `apps/api/vitest.config.ts`

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

### 5.15 `apps/api/vitest.integration.config.ts`

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

> **Por qué `singleFork`:** los tests de integración tocan DB; correrlos en paralelo causaría carreras. Un solo fork es predecible y suficientemente rápido para esta fase.

### 5.16 `apps/api/src/health/health.controller.spec.ts`

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

### 5.17 `apps/api/src/tenant/tenant.middleware.spec.ts`

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

### 5.18 `apps/api/test/rls.integration.spec.ts`

```ts
// Test de integración: verifica que RLS aísla orgs DE VERDAD contra una
// instancia real de Postgres. Si esto falla, la seguridad multi-tenant
// está rota — todo el resto sobra.
//
// Requisitos:
//   - Postgres corriendo (docker compose up -d postgres en local, services: en CI).
//   - Migraciones aplicadas (incluyendo add_rls y app_login).
//   - Seed ejecutado (2 organizaciones).
//   - DATABASE_URL_APP apunta al rol `app` (no superuser).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('RLS aislamiento multi-tenant', () => {
  let prisma: ReturnType<typeof applyTenantExtension>;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    const base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);

    // Para descubrir IDs, usamos $queryRaw que esquiva $extends por ser raw.
    // De todos modos como rol app sin contexto, SELECT directo devolvería 0.
    // Trampa: lanzamos una transacción con SET LOCAL al ORG1 conocido por nif,
    // y luego al ORG2 conocido por nif.
    const found1 = await base.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
    `;
    const found2 = await base.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B22222222'
    `;
    if (found1.length === 0 || found2.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @qrush/db exec prisma db seed` antes.',
      );
    }
    org1Id = found1[0].id;
    org2Id = found2[0].id;
  });

  afterAll(async () => {
    // base.onModuleDestroy() libera la conexión; el cliente extendido
    // delega al base.
    await (prisma as unknown as PrismaService).$disconnect();
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

### 5.19 Migración `<ts>_app_login` (en `packages/db/`)

`packages/db/prisma/migrations/<timestamp>_app_login/migration.sql`:

```sql
-- F3 necesita que el rol `app` (creado en add_rls con NOLOGIN) pueda
-- conectarse desde la aplicación. Le damos LOGIN y contraseña de desarrollo.
-- En producción Dokploy sobrescribirá la contraseña vía variables de entorno
-- o un ALTER ROLE manual antes del despliegue inicial.

ALTER ROLE app LOGIN PASSWORD 'app_dev_password';
```

### 5.20 Actualización de `.env.example` (raíz)

Descomentar y completar:

```
# Postgres local (docker compose up -d postgres)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=qrush

# Prisma migrate/seed usa este (superuser).
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qrush?schema=public

# API runtime usa este (rol app con RLS aplicada).
DATABASE_URL_APP=postgresql://app:app_dev_password@localhost:5432/qrush?schema=public
```

### 5.21 Actualización de `CLAUDE.md` (raíz)

Añadir bajo la sección "Convenciones":

```
- `apps/api/tsconfig.json` sobrescribe `module` a `CommonJS` (NestJS 11 más estable). El resto del monorepo usa ESM. Override documentado en `docs/superpowers/specs/2026-05-28-f3-api-nestjs-design.md` F3-D2.
- Multi-tenancy: cada request HTTP DEBE pasar `X-Org-Id` (UUID v4) salvo `/health`. `TenantMiddleware` lo valida y pobla `AsyncLocalStorage`. `PrismaService` con `$extends` ejecuta `SET LOCAL app.current_organization_id` por cada query → RLS aplicada en DB.
- Sin contexto → query devuelve 0 filas (fail-safe). Nunca filtra entre tenants.
```

## 6. Validación de cierre de F3

Pasos manuales desde la raíz. Asumen F1 + F2 completas y Postgres corriendo.

| #   | Comando                                                                                                                         | Resultado esperado                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install`                                                                                                                  | Sin warnings strict-peer.                                                                            |
| 2   | `pnpm --filter @qrush/db exec prisma migrate deploy`                                                                            | Aplica `add_rls` (de F2) y `app_login` (de F3) si faltan.                                            |
| 3   | `docker compose exec -T postgres psql -U postgres -d qrush -c "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname='app';"` | `rolcanlogin = t`.                                                                                   |
| 4   | `pnpm --filter @qrush/db exec prisma db seed`                                                                                   | "Seed completado: 2 organizaciones."                                                                 |
| 5   | `pnpm --filter @qrush/db build`                                                                                                 | Genera el cliente Prisma.                                                                            |
| 6   | `pnpm --filter @qrush/api build`                                                                                                | NestJS build → `dist/main.js`.                                                                       |
| 7   | `pnpm --filter @qrush/api test`                                                                                                 | Tests unitarios pasan; genera `apps/api/coverage/coverage-summary.json`.                             |
| 8   | `pnpm --filter @qrush/api test:int`                                                                                             | Tests de integración pasan (los 4 casos de RLS).                                                     |
| 9   | `pnpm --filter @qrush/api start &` luego `curl -s http://localhost:3000/health`                                                 | `{"status":"ok","uptime":<numérico>}`. Status 200.                                                   |
| 10  | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/products`                                                       | `400` (sin X-Org-Id).                                                                                |
| 11  | `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Org-Id: not-a-uuid' http://localhost:3000/products`                             | `400`.                                                                                               |
| 12  | `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Org-Id: 11111111-1111-1111-1111-111111111111' http://localhost:3000/products`   | `404` (no hay controller de products todavía — confirma que el middleware deja pasar UUIDs válidos). |
| 13  | Matar el proceso API: `kill %1` o equivalente                                                                                   | Termina limpio.                                                                                      |
| 14  | `pnpm lint && pnpm format`                                                                                                      | F1/F2 siguen verdes.                                                                                 |
| 15  | `pnpm typecheck`                                                                                                                | `apps/api` y `packages/db` typecheck OK.                                                             |
| 16  | `git status --porcelain`                                                                                                        | Vacío (todo commiteado).                                                                             |

## 7. Riesgos y mitigaciones

| Riesgo                                                                                | Mitigación                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$executeRawUnsafe` con interpolación = SQL injection si `organizationId` no validado | Triple defensa: (a) middleware regex UUID estricto antes de `tenantStorage.run`; (b) tipo TS `TenantContext.organizationId: string` y único origen de población es el middleware; (c) test unit del middleware con caso "`'; DROP TABLE ...`".                                                              |
| Olvidar `tenantStorage.run` en algún punto futuro → 0 filas en lugar de fuga          | Aceptado como fail-safe (D13). Si en el futuro un caso de uso necesita admin sin contexto (cron jobs, dashboards globales), se usará un segundo PrismaClient explícito con rol `app_admin` (BYPASSRLS).                                                                                                     |
| `$extends` envuelve `$queryRaw` también — tests de seed/admin raw verían fallo        | `$queryRaw` raw es ejecutado por `query()` dentro del `$allOperations`, pero no recibe el `args` del modelo; Prisma 6 trata raw separadamente. Se valida en T integración del plan: si rompe, se mueve la lógica raw a un cliente "admin" separado. Aceptado el riesgo de descubrir esto en implementación. |
| Override `module: CommonJS` confunde a otros desarrolladores                          | Documentado en F3-D2, en `apps/api/tsconfig.json` (comentario opcional), y en CLAUDE.md (§5.21).                                                                                                                                                                                                            |
| Vitest 2 y Vitest 3 tienen breaking changes (decorators metadata)                     | Anclamos a `^2.0.0`. Cuando Vitest 3 estabilice Nest 11, migración separada.                                                                                                                                                                                                                                |
| Migración `app_login` con password hardcoded en SQL = credencial en repo              | Aceptado: es contraseña de DESARROLLO LOCAL. Producción la sobrescribe via `ALTER ROLE` manual desde Dokploy con secret. Documentado en F3-D6. Si el equipo crece, se mueve a un `psql` post-migrate con secret real.                                                                                       |
| Tests integration necesitan Postgres + migraciones + seed antes                       | Plan F3 documenta los prerequisitos en cada step. CI ya hace esa secuencia en el job e2e.                                                                                                                                                                                                                   |
| `singleFork` ralentiza tests integration                                              | Aceptado — son ~4 tests, < 5s total. Si crece, partir por archivo.                                                                                                                                                                                                                                          |

## 8. Definición de "done" para F3

- [ ] Todos los archivos de §4 existen con el contenido de §5.
- [ ] Los 16 checks de §6 pasan en limpio.
- [ ] F1 y F2 siguen verdes (lint, format, build, los 13 checks de F2).
- [ ] El cliente Prisma extendido (`applyTenantExtension`) está cubierto por al menos un test (los 4 del integration spec lo ejercen).
- [ ] El commit final de F3 es Conventional Commits y mergea en `main`.
- [ ] `CLAUDE.md` actualizado con la nota de override y la convención de tenant context.

## 9. Fuera de alcance — siguiente fase

- **F4** (`...-f4-frontends-vite-design.md` — pendiente): React 19 + Vite 6 en `apps/tpv` y `apps/backoffice`, Playwright configurado, smoke tests E2E por cada frontend que toquen el `/health` de la API.
- **CI** (plan ya escrito): tras F4, el job E2E ya invoca `pnpm --filter @qrush/api start`, espera healthcheck en `:3000/health`, y corre Playwright. Todo el contrato que el plan de CI espera de F3 está cubierto en este spec.
- **MVP semana 1**: auth real (JWT), pipes globales de validación, primer CRUD (Product), Swagger, eliminación del header `X-Org-Id` stub.
