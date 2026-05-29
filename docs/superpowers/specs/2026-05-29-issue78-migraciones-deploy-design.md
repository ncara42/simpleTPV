# Diseño — Migraciones seguras en el deploy a producción (#78, cierre)

- **Semana:** 6 (Despliegue piloto + Estabilización)
- **Fecha:** 2026-05-29
- **Issue:** ncara42/simpleTPV#78 (parte pendiente: estrategia de migraciones en deploy)
- **Área:** infra / db / api

## Contexto y problema

El job `deploy` de `.github/workflows/ci.yml` ya dispara un webhook de Dokploy
que redespliega la imagen Docker de la API tras CI verde en `main` (cubre «push
a main despliega sin intervención manual»). Pero **`prisma migrate deploy` no se
ejecuta en ningún punto del flujo de producción**:

- `apps/api/Dockerfile` (etapa `runner`) arranca con `CMD ["node", "dist/main.js"]`;
  solo ejecuta `prisma generate` en build-time.
- El script `db:migrate:deploy` existe en `packages/db/package.json` pero nunca se
  invoca en producción (sí en el job e2e del CI, contra Postgres efímero).
- No hay entrypoint ni hook de release.

Resultado: un push con una migración nueva despliega código que espera un esquema
que la BD de producción aún no tiene. Este diseño cierra el criterio pendiente de
#78: «El deploy aplica migraciones de forma segura y hace rollback o falla limpio
si algo va mal».

## Decisiones (acordadas en brainstorming)

1. **Dónde migrar:** en un **entrypoint del contenedor** de la API, antes de
   arrancar el proceso. Autocontenido, versionado en el repo, funciona igual en
   Dokploy y en cualquier host Docker.
2. **Credenciales del migrador:** variable dedicada **`DATABASE_URL_MIGRATE`**
   (rol owner/superuser). El runtime sigue usando `DATABASE_URL_APP` (rol `app`
   con RLS). El rol potente solo vive durante la migración, no en el proceso que
   sirve tráfico.
3. **Ante fallo:** **fail-fast**. Si `migrate deploy` falla, el entrypoint sale
   con código ≠ 0 y la API no arranca; Dokploy mantiene la versión anterior.

## Restricción técnica descubierta

La etapa `runner` del Dockerfile se poda con `pnpm --filter @simpletpv/api deploy
--legacy --prod /app`, que **elimina las devDependencies**. El CLI de Prisma
(`prisma`) está en `devDependencies` de `packages/db`, por lo que **no está en la
imagen runner actual**. Además, `migrate deploy` necesita el `schema.prisma`, la
carpeta `prisma/migrations/` (6 migraciones hoy) y `prisma.config.ts`, que tampoco
se copian al runner.

**Enfoque verificado** (investigado contra el código real de Prisma 7.8 y el
layout de pnpm): copiar el CLI desde la etapa `builder` a mano es **frágil e
impracticable** — en pnpm vive en `node_modules/.pnpm/prisma@7.8.0_<hash-de-peers>/`
y depende de una cadena de symlinks (`@prisma/config → c12 → jiti`, `effect`…) que
habría que materializar recursivamente. En su lugar:

- **Mover `prisma` de `devDependencies` a `dependencies` en `packages/db/package.json`.**
  Como `@simpletpv/db` es dep de producción de `@simpletpv/api`, el
  `pnpm deploy --legacy --prod` ya incluye `prisma` transitivamente en
  `/app/node_modules/` con estructura **flat** (sin hashes, predecible): `prisma/`,
  `@prisma/config/`, `@prisma/engines/` (el binario linux se descarga en el
  postinstall durante el build), `jiti/`, etc.
- **`tsx` NO es necesario:** `migrate deploy` carga `prisma.config.ts` vía `jiti`
  (transitiva de `@prisma/config`), no vía `tsx`. `tsx` solo lo usaría `db seed`,
  que no se ejecuta en el deploy.
- **`prisma.config.ts` es obligatoria en Prisma 7:** la URL de datasource se lee de
  ese fichero (no hay flag `--url`). El entrypoint exporta `DATABASE_URL=$DATABASE_URL_MIGRATE`
  antes de invocar el CLI; `dotenv/config` (que importa la config) **no** sobreescribe
  variables ya presentes en el proceso, así que el override funciona.

**Coste:** la imagen runner crece ~100 MB (CLI + engine linux + `effect` y demás
deps transitivas de `@prisma/config`). Asumible para el piloto; se anota como
posible optimización futura (target `migrate` separado) si el tamaño molesta.

## Arquitectura

```
Dokploy redespliega imagen → contenedor arranca → docker-entrypoint.sh:
  1. valida que DATABASE_URL_MIGRATE está definida (si no → exit 1)
  2. DATABASE_URL=$DATABASE_URL_MIGRATE prisma migrate deploy
       ├─ OK    → exec "$@"  (CMD: node dist/main.js; API usa DATABASE_URL_APP)
       └─ FALLO → exit ≠ 0 → contenedor muere → Dokploy conserva versión previa
```

## Componentes

### `apps/api/docker-entrypoint.sh` (nuevo)

Script POSIX (`#!/bin/sh`, `set -e`):

1. Si `DATABASE_URL_MIGRATE` está vacía → log de error claro y `exit 1` (no
   arrancar a ciegas sin saber contra qué BD migrar).
2. Exportar `DATABASE_URL="$DATABASE_URL_MIGRATE"` (lo que leerá `prisma.config.ts`).
3. Loguear «Aplicando migraciones de base de datos…».
4. `cd` al directorio del paquete db dentro de la imagen (donde vive
   `prisma.config.ts`) y ejecutar el CLI: `node node_modules/prisma/build/index.js
migrate deploy` (ruta flat predecible gracias a `prisma` en deps + `pnpm deploy
--legacy`). La ruta exacta se fija en el plan tras inspeccionar la imagen.
5. Si falla → el `set -e` aborta; loguear «Migración falló, abortando arranque».
6. Si OK → loguear «Migraciones aplicadas», volver a `/app` y `exec "$@"` para
   arrancar el CMD (PID 1 correcto para señales).

### `apps/api/Dockerfile` (modificar etapa `runner`) + `packages/db/package.json`

- **`packages/db/package.json`:** mover `prisma` de `devDependencies` a
  `dependencies` (para que `pnpm deploy --prod` lo incluya con estructura flat).
- **Dockerfile `runner`**, tras las copias existentes:
  - Copiar `packages/db/prisma.config.ts`, `packages/db/prisma/schema.prisma` y
    `packages/db/prisma/migrations/` desde `builder` a la ruta del paquete dentro
    de `node_modules` (`node_modules/@simpletpv/db/...`), de modo que el CLI
    encuentre la config y las migraciones junto al cliente generado ya copiado.
  - Copiar `apps/api/docker-entrypoint.sh`, darle permisos de ejecución.
  - Cambiar el final a:
    `ENTRYPOINT ["./docker-entrypoint.sh"]` + `CMD ["node", "dist/main.js"]`.
  - Mantener `USER node` y `EXPOSE 3001`.
  - (El CLI `prisma`, `@prisma/config`, `@prisma/engines` y `jiti` ya vienen en
    `/app/node_modules` por el cambio de deps; no hay que copiarlos a mano.)

### Variables de entorno

- Nueva: **`DATABASE_URL_MIGRATE`** — URL de conexión con rol owner/superuser,
  usada solo por el entrypoint. Documentada (comentada) en `.env.example` y
  configurada en el panel de Dokploy en producción.
- `DATABASE_URL_APP` — sin cambios, runtime de la API (rol `app`, RLS).

## Manejo de errores y rollback

- **Fail-fast:** `set -e` + salida ≠ 0 si la migración o la validación de la
  variable fallan. El contenedor no llega a servir tráfico.
- **Rollback de despliegue:** lo proporciona Dokploy — al no arrancar/no pasar
  healthcheck la imagen nueva, sigue corriendo la anterior. No se implementa
  rollback automático de esquema (peligroso y no estándar en Prisma): un fallo de
  migración requiere intervención manual, documentada.
- `prisma migrate deploy` aplica cada migración pendiente en orden; si una falla,
  las anteriores ya aplicadas quedan registradas y la fallida no se marca como
  aplicada (se reintenta en el siguiente arranque tras corregirla).

## Testing y verificación

Verificación con Docker real (Docker disponible en el entorno, v29):

1. **Build de la imagen:** `docker build -f apps/api/Dockerfile -t simpletpv-api-test .`
   desde la raíz del monorepo → debe completar (valida que las copias nuevas y el
   entrypoint existen en la imagen).
2. **Arranque contra Postgres efímero:**
   - Levantar un Postgres limpio (contenedor `postgres:16-alpine`).
   - Arrancar la imagen con `DATABASE_URL_MIGRATE` apuntando a esa BD (rol con
     privilegios DDL) y `DATABASE_URL_APP` para el runtime.
   - Verificar en logs que aplica las 6 migraciones y que la API arranca.
   - `curl http://localhost:3001/health` → 200.
   - Verificar en la BD que la tabla `_prisma_migrations` tiene las migraciones
     aplicadas.
3. **Caso de fallo (fail-fast):** arrancar la imagen **sin** `DATABASE_URL_MIGRATE`
   → el contenedor debe salir con código ≠ 0 y no quedar escuchando.

Estos pasos quedan documentados como guion reproducible; se ejecutan en local
durante la implementación. (Opcional, fuera de alcance inmediato: un job de CI que
construya la imagen como smoke de build.)

## Documentación

`docs/deployment.md` (nuevo):

- Flujo de deploy: push a `main` → CI → webhook Dokploy → contenedor arranca →
  entrypoint migra → API arranca.
- Variable `DATABASE_URL_MIGRATE` (qué rol, por qué separada de `DATABASE_URL_APP`).
- Qué hacer si una migración falla en producción (intervención manual; la versión
  previa sigue sirviendo).
- Recordatorio del `ALTER ROLE app LOGIN PASSWORD` post-primer-deploy que ya
  documenta `packages/db/scripts/README.md`.

## Fuera de alcance (YAGNI)

- Rollback automático de esquema.
- Migración como job/contenedor de release separado en Dokploy (se descartó a
  favor del entrypoint, más simple y versionado).
- Migración desde el CI por red contra la BD de producción (se descartó por la
  superficie de seguridad de exponer la BD de prod al runner).
- Job de CI que construya la imagen (posible mejora futura, no requerida para
  cerrar #78).

## Criterios de aceptación (de la issue)

- [x] Un push/merge a `main` despliega a producción sin intervención manual (ya
      cubierto por el webhook de Dokploy existente).
- [ ] El deploy aplica migraciones de forma segura y hace rollback o falla limpio
      si algo va mal (este diseño: entrypoint con `migrate deploy` + fail-fast +
      Dokploy conserva la versión previa).
