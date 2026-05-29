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
