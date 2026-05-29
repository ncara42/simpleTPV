# Despliegue a producción (#78)

## Flujo

1. Merge/push a `main` → CI (`.github/workflows/ci.yml`) corre quality + e2e.
2. Tras CI verde, el job `deploy` hace POST al webhook de Dokploy.
3. Dokploy reconstruye/redespliega la imagen Docker de la API.
4. Al arrancar el contenedor, `apps/api/docker-entrypoint.sh`:
   - Ejecuta `prisma migrate deploy` (usando `DATABASE_URL_MIGRATE`).
   - Si la migración tiene éxito, arranca la API (`node dist/main.js`, que usa
     `DATABASE_URL_APP` con RLS).
   - Si la migración falla, el contenedor sale con código ≠ 0 y **no** sirve
     tráfico → Dokploy mantiene la versión anterior corriendo (fail-fast).

## Variables de entorno de migración

| Variable               | Rol                         | Uso                                                                   |
| ---------------------- | --------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL_MIGRATE` | owner / superuser (DDL)     | Solo el entrypoint, para `migrate deploy`                             |
| `DATABASE_URL_APP`     | rol `app` (RLS, sin DDL)    | Runtime de la API                                                     |
| `DATABASE_URL_AUTH`    | rol `app_admin` (BYPASSRLS) | Lookup de login (buscar usuario por email antes de conocer su tenant) |

`DATABASE_URL_MIGRATE` se separa a propósito: el rol potente que aplica DDL solo
existe durante la migración, no en el proceso que sirve peticiones. El entrypoint
exporta su valor como `DATABASE_URL` antes de invocar el CLI de Prisma (que lee la
URL de `prisma.config.ts`); `dotenv/config` no sobreescribe variables ya presentes,
así que el valor de producción manda. Tras migrar, el entrypoint hace `unset
DATABASE_URL` para que la API **no** herede la credencial DDL.

> **Obligatorio en Dokploy:** `DATABASE_URL_APP` (runtime del API) y
> `DATABASE_URL_AUTH` (lookup de login) DEBEN estar definidas. Si faltaran, el
> código cae a `DATABASE_URL` como fallback — y la API arrancaría con el rol owner
> saltándose RLS, sin error. El `unset` del entrypoint evita que ese fallback use
> la credencial de migración, pero configura siempre las dos variables de runtime.

## Si una migración falla en producción

1. El contenedor nuevo no arranca; la versión previa sigue sirviendo (no hay caída).
2. Revisa los logs del contenedor en Dokploy: el entrypoint imprime el error de Prisma.
3. Corrige la migración (o el estado de la BD) y vuelve a desplegar. `migrate deploy`
   reintenta las pendientes; las ya aplicadas no se repiten (tracking en
   `_prisma_migrations`).
4. No hay rollback automático de esquema (no es estándar en Prisma): si una
   migración dejó la BD en mal estado, la corrección es manual.

## Primer despliegue: passwords de los roles

Las migraciones crean los roles `app` y `app_admin` sin contraseña de LOGIN. Tras
el **primer** `migrate deploy`, el operador les da contraseña UNA VEZ (leyendo los
secrets de Dokploy):

```sql
ALTER ROLE app       LOGIN PASSWORD '<secret-app-de-dokploy>';
ALTER ROLE app_admin LOGIN PASSWORD '<secret-app-admin-de-dokploy>';
```

Ver `packages/db/scripts/README.md`. En dev/CI esto lo hace `dev-bootstrap.sql`.

## Detalles de la imagen Docker

El CLI de Prisma viaja en la imagen porque `prisma` es `dependency` de
`@simpletpv/db` (no devDependency), así que `pnpm deploy --legacy --prod` lo
incluye. El `runner` stage copia además `prisma.config.ts`, `schema.prisma` y
`prisma/migrations/` junto al paquete en `node_modules`, e instala `libssl3` (que
`node:22-slim` no trae y Prisma necesita) y da al usuario `node` permisos sobre
`node_modules/.pnpm` para que el engine de Prisma pueda operar. El entrypoint
resuelve el CLI con `require.resolve('prisma/build/index.js')` para no depender de
la ruta interna de pnpm.
