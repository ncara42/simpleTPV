# Diseño — Sentry: monitorización de errores en producción (#79)

- **Semana:** 6 (Despliegue piloto + Estabilización)
- **Fecha:** 2026-05-29
- **Issue:** ncara42/simpleTPV#79
- **Área:** infra / api / tpv / backoffice
- **Alcance elegido:** solo errores (sin performance tracing, sin session replay)

## Objetivo

Instrumentar los tres servicios desplegados (API NestJS, TPV, backoffice) para
capturar automáticamente las excepciones no manejadas que ocurran en producción
y enviarlas a un panel de Sentry, con contexto suficiente (entorno, release y
`organizationId` cuando aplique) para diagnosticar fricciones del piloto sin
depender de que el personal de tienda reporte los fallos.

Cubre el entregable del plan: «Sentry recogiendo errores, sin errores críticos
recurrentes tras el primer día».

## Principios de diseño

1. **Agnóstico de proveedor.** El SDK se configura mediante un DSN leído de
   variable de entorno. Sirve igual para Sentry SaaS (sentry.io) o una instancia
   self-hosted en Dokploy: el código no cambia, solo el valor del DSN.
2. **Fail-safe.** Si no hay DSN, Sentry no se inicializa y la aplicación arranca
   y funciona de forma idéntica. Misma filosofía que el cache Redis (degrada a
   Postgres) y el webhook de Dokploy (avisa y sale OK) ya presentes en el repo.
3. **Solo en producción.** No se inicializa en `development`, `test` ni en CI.
   Evita ruido, no contamina la suite de tests ni la cobertura, y no envía
   eventos de desarrollo al panel.
4. **Sin PII.** No se envían tokens de autenticación, cookies ni cuerpos de
   request sensibles. Se aplica scrubbing defensivo en `beforeSend`.
5. **Mínima superficie.** `tracesSampleRate: 0` (solo errores). Sin replay.
   Adecuado para un piloto de 1-2 tiendas y un plan gratuito de Sentry.

## Arquitectura

Tres puntos de integración independientes, con la misma filosofía:

```
apps/api  (NestJS 11)    → @sentry/nestjs   → SentryGlobalFilter (APP_FILTER)
apps/tpv  (React 19)     → @sentry/react    → Sentry.ErrorBoundary + init
apps/backoffice (React)  → @sentry/react    → Sentry.ErrorBoundary + init
```

Cada servicio decide inicializar según `DSN presente && entorno === producción`.

## Componente 1 — API (NestJS)

- **Dependencia:** `@sentry/nestjs` (SDK oficial, soporta NestJS 11).
- **Fichero nuevo:** `apps/api/src/observability/sentry.ts`
  - Exporta `initSentry(): boolean`. Devuelve `true` si inicializó.
  - Lee de `process.env`: `SENTRY_DSN`, `SENTRY_ENVIRONMENT` (default `production`),
    `SENTRY_RELEASE` (opcional).
  - **No inicializa** si falta `SENTRY_DSN` o si `process.env.NODE_ENV !== 'production'`.
  - Config: `tracesSampleRate: 0`, `sendDefaultPii: false`.
  - `beforeSend`: elimina cabeceras `authorization` y `cookie` del evento si
    existieran, como defensa en profundidad.
- **Bootstrap:** `initSentry()` se llama al **principio de `apps/api/src/main.ts`**,
  antes de `NestFactory.create`, porque el SDK necesita instrumentar el runtime
  antes de que arranque la app (requisito del SDK de Nest).
- **Captura global:** registrar `SentryGlobalFilter` (provisto por `@sentry/nestjs`)
  como `APP_FILTER` en `AppModule`. Convive con el manejo HTTP estándar de Nest:
  reenvía la excepción tras capturarla, no altera el código de respuesta.
- **Contexto de tenant:** dentro del flujo de captura, leer
  `getCurrentTenant()?.organizationId` (de `apps/api/src/prisma/tenant-context.ts`)
  y adjuntarlo como `tag` `organization_id` del evento. Permite saber a qué
  tienda/organización afecta cada error. Nunca se envían datos personales.

## Componente 2 y 3 — Frontends (TPV y backoffice)

- **Dependencia:** `@sentry/react` en cada app.
- **Fichero nuevo por app:** `src/observability/sentry.ts`
  - Exporta `initSentry(): void`.
  - Lee `import.meta.env.VITE_SENTRY_DSN` y `import.meta.env.VITE_SENTRY_ENVIRONMENT`
    (default `production`).
  - **No inicializa** si falta el DSN o si `!import.meta.env.PROD`.
  - Config: `tracesSampleRate: 0`, sin replay.
- **Entry point (`src/main.tsx` de cada app):**
  - Llamar `initSentry()` antes de `createRoot`.
  - Envolver el árbol en `<Sentry.ErrorBoundary fallback={<ErrorScreen />}>`.
    Hoy no existe ningún ErrorBoundary en ninguno de los dos frontends: un error
    de render deja la pantalla en blanco. Esta envoltura también mejora la
    robustez del piloto mostrando una pantalla de error amable («Algo ha fallado,
    recarga la página») en lugar del blanco.
- El `fallback` es un componente mínimo y local a cada app (no se introduce una
  librería de UI nueva).

## Variables de entorno

Añadir a `.env.example` (comentadas, siguiendo el patrón de `CORS_ORIGINS`):

```
# Monitorización de errores (#79). Sin DSN → Sentry inactivo (la app funciona igual).
# Solo se activa cuando NODE_ENV/PROD es producción. DSN agnóstico: sentry.io o self-hosted.
# SENTRY_DSN=
# SENTRY_ENVIRONMENT=production
# SENTRY_RELEASE=
# Frontends (Vite expone solo variables con prefijo VITE_):
# VITE_SENTRY_DSN=
# VITE_SENTRY_ENVIRONMENT=production
```

En producción, los DSN se configuran en el panel de Dokploy (no en Vercel),
conforme a la convención de infraestructura del proyecto.

## Documentación

`docs/observability-sentry.md`:

- Qué es Sentry y por qué (1 párrafo).
- Cómo obtener un DSN: opción A (sentry.io SaaS, plan gratuito) y opción B
  (self-hosted en Dokploy), con la nota de que el código es idéntico.
- Qué variable corresponde a cada servicio y dónde pegarlas en Dokploy.
- Cómo verificar que llega un evento de prueba.

## Testing y verificación

- **Unitario (API):** `apps/api/test/sentry.spec.ts`
  - Sin `SENTRY_DSN` → `initSentry()` devuelve `false`, no llama a `Sentry.init`.
  - `NODE_ENV=test` con DSN → no inicializa (guard de producción).
  - `NODE_ENV=production` con DSN (mock de `@sentry/nestjs`) → llama a `Sentry.init`
    con `tracesSampleRate: 0` y `sendDefaultPii: false`.
- **Frontends:** la naturaleza no-op en dev/test garantiza que los E2E de
  Playwright existentes no se ven afectados (no hay DSN ni `PROD` en esos
  entornos). No se añaden E2E nuevos para Sentry.
- **Gate completo antes de cerrar:** `pnpm lint && pnpm typecheck && pnpm test`
  - `pnpm build` de las tres apps. La cobertura no debe bajar del floor (el
    ratchet del CI lo verifica), por eso el módulo de la API lleva test.

## Fuera de alcance (YAGNI)

- Performance tracing / transacciones (`tracesSampleRate > 0`).
- Session Replay.
- Alerting avanzado, dashboards custom o integración Slack (se configura en el
  panel de Sentry, no en código).
- Source maps upload automatizado en CI (se puede añadir más adelante; para el
  piloto el stack trace minificado + release basta).

## Criterios de aceptación (de la issue)

- [ ] Sentry recibe errores de los tres servicios (verificable lanzando un error
      de prueba en cada uno con el DSN configurado).
- [ ] Sin errores críticos recurrentes tras el primer día (criterio operativo,
      se valida durante el piloto, no en esta PR).
