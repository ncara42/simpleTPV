# Sentry — monitorización de errores en producción (#79) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar automáticamente las excepciones no manejadas de la API NestJS y de los dos frontends React en producción y enviarlas a Sentry, de forma agnóstica de proveedor y fail-safe.

**Architecture:** Tres puntos de integración independientes. La API usa `@sentry/nestjs` (init en `main.ts` + `SentryGlobalFilter` como `APP_FILTER`, con `organizationId` como tag). Cada frontend usa `@sentry/react` (init en `main.tsx` + `Sentry.ErrorBoundary`). Cada servicio se inicializa solo si su DSN está presente **y** el entorno es producción; sin DSN, no-op total.

**Tech Stack:** TypeScript, NestJS 11, React 19, Vite, Vitest, `@sentry/nestjs`, `@sentry/react`.

**Spec:** `docs/superpowers/specs/2026-05-29-issue79-sentry-design.md`

---

## File Structure

| Fichero                                                     | Responsabilidad                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/api/src/observability/sentry.ts` (crear)              | `initSentry()` + guard prod/DSN + `beforeSend` scrub + tag de tenant |
| `apps/api/src/observability/sentry.spec.ts` (crear)         | Test unitario del guard de inicialización                            |
| `apps/api/src/main.ts` (modificar)                          | Llamar `initSentry()` al principio del bootstrap                     |
| `apps/api/src/app.module.ts` (modificar)                    | Registrar `SentryGlobalFilter` como `APP_FILTER`                     |
| `apps/api/package.json` (modificar)                         | Dep `@sentry/nestjs`                                                 |
| `apps/tpv/src/observability/sentry.ts` (crear)              | `initSentry()` frontend (guard PROD/DSN)                             |
| `apps/tpv/src/observability/ErrorScreen.tsx` (crear)        | Fallback de error amable                                             |
| `apps/tpv/src/main.tsx` (modificar)                         | init + `Sentry.ErrorBoundary`                                        |
| `apps/tpv/package.json` (modificar)                         | Dep `@sentry/react`                                                  |
| `apps/backoffice/src/observability/sentry.ts` (crear)       | Idéntico al de TPV                                                   |
| `apps/backoffice/src/observability/ErrorScreen.tsx` (crear) | Fallback de error amable                                             |
| `apps/backoffice/src/main.tsx` (modificar)                  | init + `Sentry.ErrorBoundary`                                        |
| `apps/backoffice/package.json` (modificar)                  | Dep `@sentry/react`                                                  |
| `.env.example` (modificar)                                  | Variables `SENTRY_*` y `VITE_SENTRY_*` comentadas                    |
| `docs/observability-sentry.md` (crear)                      | Guía de obtención de DSN y configuración en Dokploy                  |

**Nota de testing:** la config vitest de la API (`apps/api/vitest.config.ts`) incluye solo `src/**/*.spec.ts` y excluye `test/**` (eso es integración con Postgres). El coverage incluye `src/**/*.ts` excepto `*.spec.ts` y `src/main.ts`. Por eso el test del módulo Sentry va **junto al código** en `src/observability/sentry.spec.ts`, y `sentry.ts` debe quedar cubierto por test para no bajar el floor de cobertura.

---

## Task 1: Dependencia y módulo Sentry de la API (TDD)

**Files:**

- Modify: `apps/api/package.json`
- Create: `apps/api/src/observability/sentry.ts`
- Test: `apps/api/src/observability/sentry.spec.ts`

- [ ] **Step 1: Añadir la dependencia**

Run:

```bash
pnpm --filter @simpletpv/api add @sentry/nestjs
```

Expected: añade `@sentry/nestjs` a `apps/api/package.json` dependencies y actualiza el lockfile.

- [ ] **Step 2: Escribir el test que falla**

Crear `apps/api/src/observability/sentry.spec.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock del SDK: capturamos las llamadas a Sentry.init sin tocar la red.
const initMock = vi.fn();
vi.mock('@sentry/nestjs', () => ({
  init: (opts: unknown) => initMock(opts),
}));

import { initSentry } from './sentry.js';

describe('initSentry (API)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    initMock.mockClear();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('no inicializa si no hay SENTRY_DSN', () => {
    process.env.NODE_ENV = 'production';
    expect(initSentry()).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('no inicializa fuera de producción aunque haya DSN', () => {
    process.env.NODE_ENV = 'test';
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    expect(initSentry()).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('inicializa en producción con DSN, sin tracing ni PII', () => {
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'production';
    expect(initSentry()).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.dsn).toBe('https://abc@o1.ingest.sentry.io/1');
    expect(opts.environment).toBe('production');
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.sendDefaultPii).toBe(false);
    expect(typeof opts.beforeSend).toBe('function');
  });

  it('beforeSend elimina cabeceras authorization y cookie', () => {
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    initSentry();
    const opts = initMock.mock.calls[0][0] as {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    const scrubbed = opts.beforeSend({
      request: { headers: { authorization: 'Bearer x', cookie: 'a=b', 'x-org-id': 'keep' } },
    }) as { request: { headers: Record<string, string> } };
    expect(scrubbed.request.headers.authorization).toBeUndefined();
    expect(scrubbed.request.headers.cookie).toBeUndefined();
    expect(scrubbed.request.headers['x-org-id']).toBe('keep');
  });
});
```

- [ ] **Step 3: Ejecutar el test para verlo fallar**

Run: `pnpm --filter @simpletpv/api exec vitest run src/observability/sentry.spec.ts`
Expected: FAIL — `Cannot find module './sentry.js'` (aún no existe).

- [ ] **Step 4: Implementar el módulo**

Crear `apps/api/src/observability/sentry.ts`:

```typescript
import * as Sentry from '@sentry/nestjs';

/**
 * Inicializa Sentry SOLO en producción y SOLO si hay DSN configurado.
 * Sin DSN o fuera de producción → no-op (la API funciona igual). Fail-safe,
 * igual que el cache Redis y el webhook de Dokploy del proyecto.
 *
 * Debe llamarse al principio de main.ts, antes de NestFactory.create, para que
 * el SDK instrumente el runtime antes de que arranque la app.
 *
 * @returns true si Sentry se inicializó.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NODE_ENV !== 'production') {
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0, // solo errores (#79)
    sendDefaultPii: false,
    beforeSend: scrubSensitive,
  });

  return true;
}

/**
 * Defensa en profundidad: elimina cabeceras sensibles del evento por si el SDK
 * las adjuntara. No mutamos el objeto original más allá de sus headers.
 */
function scrubSensitive<T extends Record<string, unknown>>(event: T): T {
  const request = event.request as { headers?: Record<string, unknown> } | undefined;
  if (request?.headers) {
    delete request.headers.authorization;
    delete request.headers.cookie;
  }
  return event;
}
```

- [ ] **Step 5: Ejecutar el test para verlo pasar**

Run: `pnpm --filter @simpletpv/api exec vitest run src/observability/sentry.spec.ts`
Expected: PASS — 4 tests verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/observability/sentry.ts apps/api/src/observability/sentry.spec.ts
git commit -m "feat(api): módulo Sentry init fail-safe solo en producción (#79)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Cablear Sentry en el bootstrap y el filtro global de la API

**Files:**

- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Llamar initSentry al principio de main.ts**

En `apps/api/src/main.ts`, justo después de `import 'reflect-metadata';` (línea 1) y antes del resto de imports de Nest, añadir el import e invocarlo lo antes posible dentro de `bootstrap`. Editar así:

Añadir tras la línea 1 (`import 'reflect-metadata';`):

```typescript
import { initSentry } from './observability/sentry.js';
```

Dentro de `async function bootstrap(): Promise<void> {`, como **primera** sentencia (antes de `const app = await NestFactory.create(...)`):

```typescript
// Sentry debe instrumentar el runtime antes de crear la app (#79).
// No-op si no hay SENTRY_DSN o no estamos en producción.
initSentry();
```

- [ ] **Step 2: Registrar SentryGlobalFilter en AppModule**

En `apps/api/src/app.module.ts`:

Añadir el import de `APP_FILTER` a la línea 2 (que ya importa `APP_GUARD, APP_INTERCEPTOR` de `@nestjs/core`):

```typescript
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
```

Añadir tras los imports existentes (p.ej. tras la línea de `ThrottlerModule`):

```typescript
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
```

En el array `providers`, añadir como **primer** provider (antes del `TenantContextInterceptor`), para que capture todo lo que escapa:

```typescript
    // Captura en Sentry las excepciones no manejadas (#79). Reenvía la excepción
    // tras registrarla: no altera la respuesta HTTP estándar de Nest.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
```

- [ ] **Step 3: Verificar typecheck y build de la API**

Run: `pnpm --filter @simpletpv/api typecheck && pnpm --filter @simpletpv/api build`
Expected: ambos OK, sin errores de tipos.

- [ ] **Step 4: Verificar que la suite unitaria de la API sigue verde**

Run: `pnpm --filter @simpletpv/api exec vitest run src/`
Expected: PASS — incluyendo los 4 tests de `sentry.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat(api): cablear Sentry en bootstrap + SentryGlobalFilter (#79)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Tag de organizationId en los eventos de la API

**Files:**

- Modify: `apps/api/src/observability/sentry.ts`
- Modify: `apps/api/src/observability/sentry.spec.ts`

Aprovecha el `AsyncLocalStorage` de tenant ya existente (`apps/api/src/prisma/tenant-context.ts`, función `getCurrentTenant()`).

- [ ] **Step 1: Añadir el test del tag de tenant**

En `apps/api/src/observability/sentry.spec.ts`, añadir el mock de `tenant-context` arriba (junto al `vi.mock` de `@sentry/nestjs`):

```typescript
let currentTenant: { organizationId: string } | undefined;
vi.mock('../prisma/tenant-context.js', () => ({
  getCurrentTenant: () => currentTenant,
}));
```

Y añadir este bloque de tests dentro del `describe`:

```typescript
it('beforeSend añade organization_id como tag cuando hay tenant', () => {
  currentTenant = { organizationId: 'org-123' };
  process.env.NODE_ENV = 'production';
  process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
  initSentry();
  const opts = initMock.mock.calls[0][0] as {
    beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
  };
  const out = opts.beforeSend({}) as { tags?: Record<string, string> };
  expect(out.tags?.organization_id).toBe('org-123');
  currentTenant = undefined;
});

it('beforeSend no añade tag si no hay tenant', () => {
  currentTenant = undefined;
  process.env.NODE_ENV = 'production';
  process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
  initSentry();
  const opts = initMock.mock.calls[0][0] as {
    beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
  };
  const out = opts.beforeSend({}) as { tags?: Record<string, string> };
  expect(out.tags?.organization_id).toBeUndefined();
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `pnpm --filter @simpletpv/api exec vitest run src/observability/sentry.spec.ts`
Expected: FAIL — los dos tests nuevos fallan (el tag aún no se añade).

- [ ] **Step 3: Implementar el tag en scrubSensitive**

En `apps/api/src/observability/sentry.ts`, añadir el import arriba:

```typescript
import { getCurrentTenant } from '../prisma/tenant-context.js';
```

Reemplazar la función `scrubSensitive` por:

```typescript
/**
 * beforeSend: defensa en profundidad (elimina cabeceras sensibles) + enriquece
 * el evento con el organizationId del tenant actual (#79), tomado del
 * AsyncLocalStorage. Permite saber a qué organización afecta cada error.
 */
function scrubSensitive<T extends Record<string, unknown>>(event: T): T {
  const request = event.request as { headers?: Record<string, unknown> } | undefined;
  if (request?.headers) {
    delete request.headers.authorization;
    delete request.headers.cookie;
  }

  const tenant = getCurrentTenant();
  if (tenant) {
    const tags = (event.tags as Record<string, string> | undefined) ?? {};
    tags.organization_id = tenant.organizationId;
    (event as Record<string, unknown>).tags = tags;
  }

  return event;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `pnpm --filter @simpletpv/api exec vitest run src/observability/sentry.spec.ts`
Expected: PASS — 6 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/sentry.ts apps/api/src/observability/sentry.spec.ts
git commit -m "feat(api): etiquetar eventos Sentry con organization_id del tenant (#79)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Sentry en el frontend TPV

**Files:**

- Modify: `apps/tpv/package.json`
- Create: `apps/tpv/src/observability/sentry.ts`
- Create: `apps/tpv/src/observability/ErrorScreen.tsx`
- Modify: `apps/tpv/src/main.tsx`

- [ ] **Step 1: Añadir la dependencia**

Run:

```bash
pnpm --filter @simpletpv/tpv add @sentry/react
```

Expected: añade `@sentry/react` a `apps/tpv/package.json`.

- [ ] **Step 2: Crear el módulo de init del frontend**

Crear `apps/tpv/src/observability/sentry.ts`:

```typescript
import * as Sentry from '@sentry/react';

/**
 * Inicializa Sentry SOLO en build de producción (import.meta.env.PROD) y SOLO si
 * hay VITE_SENTRY_DSN. En dev/test → no-op (no contamina los E2E de Playwright).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || !import.meta.env.PROD) {
    return;
  }

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'production',
    tracesSampleRate: 0, // solo errores (#79)
  });
}
```

- [ ] **Step 3: Crear el fallback de error**

Crear `apps/tpv/src/observability/ErrorScreen.tsx`:

```tsx
/**
 * Fallback de Sentry.ErrorBoundary (#79). Sustituye la pantalla en blanco por un
 * mensaje amable cuando un error de render escapa. Mínimo, sin librerías nuevas.
 */
export function ErrorScreen() {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Algo ha fallado</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Ha ocurrido un error inesperado. Recarga la página para continuar.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}
      >
        Recargar
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Cablear init + ErrorBoundary en main.tsx**

Reemplazar el contenido de `apps/tpv/src/main.tsx` por:

```tsx
import './styles.css';

import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { ErrorScreen } from './observability/ErrorScreen.js';
import { initSentry } from './observability/sentry.js';

initSentry();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorScreen />}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 5: Verificar typecheck y build**

Run: `pnpm --filter @simpletpv/tpv typecheck && pnpm --filter @simpletpv/tpv build`
Expected: ambos OK.

- [ ] **Step 6: Verificar que los E2E del TPV siguen verdes (no-op en dev)**

Run: `pnpm --filter @simpletpv/tpv test:e2e`
Expected: PASS — la app arranca igual; Sentry no se activa sin DSN/PROD.
(Si el entorno local no tiene la BD efímera levantada para los E2E, basta con confirmar build verde en el Step 5 y dejar la verificación E2E al CI.)

- [ ] **Step 7: Commit**

```bash
git add apps/tpv/package.json pnpm-lock.yaml apps/tpv/src/observability/ apps/tpv/src/main.tsx
git commit -m "feat(tpv): Sentry ErrorBoundary + init fail-safe en producción (#79)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Sentry en el frontend backoffice

**Files:**

- Modify: `apps/backoffice/package.json`
- Create: `apps/backoffice/src/observability/sentry.ts`
- Create: `apps/backoffice/src/observability/ErrorScreen.tsx`
- Modify: `apps/backoffice/src/main.tsx`

Idéntico patrón al TPV (Task 4); el código es el mismo salvo el `--filter`.

- [ ] **Step 1: Añadir la dependencia**

Run:

```bash
pnpm --filter @simpletpv/backoffice add @sentry/react
```

Expected: añade `@sentry/react` a `apps/backoffice/package.json`.

- [ ] **Step 2: Crear el módulo de init del frontend**

Crear `apps/backoffice/src/observability/sentry.ts` con este contenido exacto:

```typescript
import * as Sentry from '@sentry/react';

/**
 * Inicializa Sentry SOLO en build de producción (import.meta.env.PROD) y SOLO si
 * hay VITE_SENTRY_DSN. En dev/test → no-op (no contamina los E2E de Playwright).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || !import.meta.env.PROD) {
    return;
  }

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'production',
    tracesSampleRate: 0, // solo errores (#79)
  });
}
```

- [ ] **Step 3: Crear el fallback de error**

Crear `apps/backoffice/src/observability/ErrorScreen.tsx` con este contenido exacto:

```tsx
/**
 * Fallback de Sentry.ErrorBoundary (#79). Sustituye la pantalla en blanco por un
 * mensaje amable cuando un error de render escapa. Mínimo, sin librerías nuevas.
 */
export function ErrorScreen() {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Algo ha fallado</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Ha ocurrido un error inesperado. Recarga la página para continuar.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}
      >
        Recargar
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Cablear init + ErrorBoundary en main.tsx**

Reemplazar el contenido de `apps/backoffice/src/main.tsx` por:

```tsx
import './styles.css';

import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { ErrorScreen } from './observability/ErrorScreen.js';
import { initSentry } from './observability/sentry.js';

initSentry();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorScreen />}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 5: Verificar typecheck y build**

Run: `pnpm --filter @simpletpv/backoffice typecheck && pnpm --filter @simpletpv/backoffice build`
Expected: ambos OK.

- [ ] **Step 6: Verificar que los E2E del backoffice siguen verdes**

Run: `pnpm --filter @simpletpv/backoffice test:e2e`
Expected: PASS (o dejar al CI si no hay BD efímera local, confirmando build verde en Step 5).

- [ ] **Step 7: Commit**

```bash
git add apps/backoffice/package.json pnpm-lock.yaml apps/backoffice/src/observability/ apps/backoffice/src/main.tsx
git commit -m "feat(backoffice): Sentry ErrorBoundary + init fail-safe en producción (#79)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Variables de entorno y documentación

**Files:**

- Modify: `.env.example`
- Create: `docs/observability-sentry.md`

- [ ] **Step 1: Añadir las variables a .env.example**

Al final de `.env.example` (tras la línea `THROTTLE_LIMIT=120`), añadir:

```
# Monitorización de errores (#79). Sin DSN → Sentry inactivo (la app funciona igual).
# Solo se activa en producción (NODE_ENV=production en la API, build PROD en los frontends).
# DSN agnóstico: vale para sentry.io (SaaS) o una instancia self-hosted. Ver docs/observability-sentry.md.
# SENTRY_DSN=
# SENTRY_ENVIRONMENT=production
# SENTRY_RELEASE=
# Frontends — Vite solo expone variables con prefijo VITE_:
# VITE_SENTRY_DSN=
# VITE_SENTRY_ENVIRONMENT=production
```

- [ ] **Step 2: Escribir la guía de observabilidad**

Crear `docs/observability-sentry.md`:

```markdown
# Sentry — monitorización de errores (#79)

## Qué es y por qué

Sentry captura automáticamente las excepciones no manejadas que ocurren en
producción (API NestJS, TPV y backoffice) y las envía a un panel web con stack
trace, entorno, dispositivo y la organización afectada. Permite detectar y
diagnosticar fallos del piloto sin depender de que el personal de tienda los
reporte. Cubre el criterio «sin errores críticos recurrentes tras el primer día».

La integración es **fail-safe**: sin DSN configurado, Sentry queda inactivo y la
aplicación funciona igual. Solo se activa en producción.

## Obtener un DSN

El código es **idéntico** sea cual sea el proveedor; solo cambia el valor del DSN.

### Opción A — sentry.io (SaaS, recomendado para el piloto)

1. Crea una cuenta gratuita en https://sentry.io (plan Developer: 5.000 errores/mes).
2. Crea **tres proyectos**: uno Node/NestJS (API) y dos React (TPV, backoffice).
3. En cada proyecto, Settings → Client Keys (DSN): copia el DSN.

### Opción B — self-hosted en Dokploy

1. Despliega Sentry self-hosted (requiere recursos holgados; consulta los docs de
   Sentry self-hosted). El DSN apunta a tu instancia en lugar de a ingest.sentry.io.
2. El resto es igual: un DSN por proyecto.

## Qué variable usa cada servicio

| Servicio     | Variable                                          | Dónde se configura              |
| ------------ | ------------------------------------------------- | ------------------------------- |
| API (NestJS) | `SENTRY_DSN`                                      | Panel de Dokploy (servicio api) |
| API          | `SENTRY_ENVIRONMENT` (opc., default `production`) | Panel de Dokploy                |
| API          | `SENTRY_RELEASE` (opc.)                           | Panel de Dokploy / CI           |
| TPV          | `VITE_SENTRY_DSN`                                 | Build del TPV (Dokploy)         |
| TPV          | `VITE_SENTRY_ENVIRONMENT` (opc.)                  | Build del TPV                   |
| Backoffice   | `VITE_SENTRY_DSN`                                 | Build del backoffice (Dokploy)  |
| Backoffice   | `VITE_SENTRY_ENVIRONMENT` (opc.)                  | Build del backoffice            |

> Las variables `VITE_*` se inyectan en **build time** (Vite las hornea en el
> bundle). Hay que rebuildar el frontend tras cambiarlas.

## Verificar que funciona

1. Con el DSN configurado y la app en producción, provoca un error de prueba:
   - API: un endpoint temporal que lance, o un error real.
   - Frontend: forzar una excepción de render.
2. En unos segundos el evento aparece en el panel de Sentry, con el tag
   `organization_id` en los eventos de la API.

## Alcance actual

Solo captura de errores (`tracesSampleRate: 0`, sin performance ni session
replay). Suficiente para el piloto. Ampliable más adelante sin cambios de
arquitectura.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/observability-sentry.md
git commit -m "docs(observability): variables de entorno y guía de Sentry (#79)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Gate completo del monorepo

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: sin errores.

- [ ] **Step 2: Typecheck de todo el monorepo**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 3: Tests unitarios de la API con cobertura**

Run: `pnpm --filter @simpletpv/api test`
Expected: PASS, y la cobertura de statements **no baja** del floor en `coverage-threshold.json` (el módulo `sentry.ts` está cubierto por `sentry.spec.ts`).

- [ ] **Step 4: Build de las tres apps**

Run: `pnpm build`
Expected: build OK de api, tpv y backoffice.

- [ ] **Step 5: Verificación final del diff**

Run: `git log --oneline fork/main..HEAD`
Expected: la serie de commits de Tasks 1-6, todos enfocados.

---

## Notas de cierre

- **PR:** abrir contra `fork/main` (el tracker real es `ncara42/simpleTPV`), título
  `feat(observability): Sentry — monitorización de errores en producción (#79)`,
  cerrando `#79`.
- **Tras mergear:** configurar los DSN reales en Dokploy (ver `docs/observability-sentry.md`)
  y provocar un evento de prueba en cada servicio para marcar el primer criterio
  de aceptación. El segundo criterio («sin errores recurrentes tras el primer día»)
  se valida durante el piloto.

```

```
