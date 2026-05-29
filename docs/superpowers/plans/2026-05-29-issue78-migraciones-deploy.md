# Migraciones seguras en el deploy (#78) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el contenedor de la API aplique `prisma migrate deploy` antes de arrancar, con fail-fast, usando un rol de migración separado (`DATABASE_URL_MIGRATE`).

**Architecture:** Un entrypoint POSIX (`docker-entrypoint.sh`) corre `prisma migrate deploy` y solo si tiene éxito hace `exec` del CMD (`node dist/main.js`). El CLI de Prisma llega a la imagen runner moviendo `prisma` a `dependencies` de `packages/db` (estructura flat vía `pnpm deploy --legacy --prod`); el Dockerfile copia además `prisma.config.ts` + `schema.prisma` + `migrations/`. Fail-fast: si la migración falla, el contenedor muere y Dokploy conserva la versión previa.

**Tech Stack:** Docker (multi-stage), pnpm, Prisma 7.8 CLI, Postgres 16, shell POSIX.

**Spec:** `docs/superpowers/specs/2026-05-29-issue78-migraciones-deploy-design.md`

---

## File Structure

| Fichero                                 | Responsabilidad                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/db/package.json` (modificar)  | Mover `prisma` de `devDependencies` a `dependencies`                          |
| `apps/api/docker-entrypoint.sh` (crear) | Migrar (fail-fast) y luego `exec` del CMD                                     |
| `apps/api/Dockerfile` (modificar)       | Copiar config/schema/migrations + entrypoint a la imagen runner; `ENTRYPOINT` |
| `.env.example` (modificar)              | Documentar `DATABASE_URL_MIGRATE`                                             |
| `docs/deployment.md` (crear)            | Flujo de deploy, variable de migración, qué hacer si falla                    |

**Verificación con Docker real** (Docker v29 disponible). Como esto no es testeable con vitest, las Tasks 2 y 3 verifican construyendo y arrancando la imagen contra un Postgres efímero.

---

## Task 1: Mover `prisma` a dependencies de packages/db

**Files:**

- Modify: `packages/db/package.json`

- [ ] **Step 1: Mover `prisma` de devDependencies a dependencies**

En `packages/db/package.json`, quita `"prisma": "^7.0.0"` del bloque `devDependencies` y añádelo al bloque `dependencies` (mantén el orden alfabético dentro de cada bloque). El resto de devDeps (`@types/node`, `@types/pg`, `tsx`, `typescript`) se quedan donde están.

- [ ] **Step 2: Reinstalar para actualizar el lockfile**

Run: `pnpm install`
Expected: actualiza `pnpm-lock.yaml` reflejando `prisma` como dependency de `@simpletpv/db`. Sin errores.

- [ ] **Step 3: Verificar que nada se rompe (typecheck + build de db)**

Run: `pnpm --filter @simpletpv/db build && pnpm --filter @simpletpv/api build`
Expected: ambos OK (mover de devDep a dep no cambia la resolución en dev).

- [ ] **Step 4: Commit**

```bash
git add packages/db/package.json pnpm-lock.yaml
git commit -m "build(db): mover prisma CLI a dependencies para el deploy en producción (#78)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Entrypoint + Dockerfile + verificación de build

**Files:**

- Create: `apps/api/docker-entrypoint.sh`
- Modify: `apps/api/Dockerfile`

El Dockerfile actual (etapa `runner`) es:

```dockerfile
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/packages/db/generated ./node_modules/@simpletpv/db/generated
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

- [ ] **Step 1: Crear el entrypoint**

Crear `apps/api/docker-entrypoint.sh`:

```sh
#!/bin/sh
# Entrypoint del contenedor de la API (#78).
# Aplica las migraciones de Prisma antes de arrancar y aborta si fallan
# (fail-fast): así nunca se sirve código contra un esquema a medio migrar.
set -e

if [ -z "$DATABASE_URL_MIGRATE" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL_MIGRATE no está definida. Abortando." >&2
  echo "[entrypoint] Configúrala en Dokploy con un rol con privilegios DDL (owner)." >&2
  exit 1
fi

# El CLI de Prisma lee la URL de prisma.config.ts, que toma process.env.DATABASE_URL.
# dotenv/config no sobreescribe variables ya presentes, así que este export manda.
export DATABASE_URL="$DATABASE_URL_MIGRATE"

echo "[entrypoint] Aplicando migraciones de base de datos…"
# prisma.config.ts vive junto al paquete db dentro de node_modules; el CLI necesita
# ese CWD para encontrar la config y la carpeta prisma/migrations.
cd /app/node_modules/@simpletpv/db
node /app/node_modules/prisma/build/index.js migrate deploy
cd /app

echo "[entrypoint] Migraciones aplicadas. Arrancando la API…"
exec "$@"
```

- [ ] **Step 2: Modificar la etapa `runner` del Dockerfile**

Reemplaza el bloque `runner` completo por:

```dockerfile
# ---- runner: imagen mínima de runtime ----
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/packages/db/generated ./node_modules/@simpletpv/db/generated
# Migraciones en el arranque (#78): el entrypoint corre `prisma migrate deploy`.
# El CLI necesita la config y las migraciones junto al paquete db en node_modules.
COPY --from=builder /repo/packages/db/prisma.config.ts ./node_modules/@simpletpv/db/prisma.config.ts
COPY --from=builder /repo/packages/db/prisma/schema.prisma ./node_modules/@simpletpv/db/prisma/schema.prisma
COPY --from=builder /repo/packages/db/prisma/migrations ./node_modules/@simpletpv/db/prisma/migrations
COPY --from=builder /repo/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
# Corre como el usuario `node` (no root) que ya trae la imagen oficial.
USER node
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Construir la imagen**

Run (desde la raíz del repo):

```bash
docker build -f apps/api/Dockerfile -t simpletpv-api-test .
```

Expected: build completa sin error. Si falla en una de las nuevas líneas `COPY` (p.ej. `prisma.config.ts` no existe en builder), revisa la ruta. Si falla porque `node_modules/prisma` no está, confirma que la Task 1 movió `prisma` a deps y que el lockfile se reinstaló (rebuild de la imagen reinstala con el lockfile actualizado).

- [ ] **Step 4: Verificar que el CLI de Prisma quedó en la imagen**

Run:

```bash
docker run --rm --entrypoint sh simpletpv-api-test -c "ls node_modules/prisma/build/index.js && ls node_modules/@simpletpv/db/prisma/migrations | head -3 && ls node_modules/@simpletpv/db/prisma.config.ts"
```

Expected: imprime la ruta del index.js del CLI, varias migraciones, y la ruta de prisma.config.ts (todos existen).

- [ ] **Step 5: Commit**

```bash
git add apps/api/docker-entrypoint.sh apps/api/Dockerfile
git commit -m "feat(infra): entrypoint que aplica migraciones con fail-fast en el arranque (#78)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verificación de arranque contra Postgres efímero

Verifica el flujo completo: migración OK + arranque, y el caso de fallo. No cambia código (salvo que se descubra un bug, que se corrige en la task correspondiente). Usa una red Docker para conectar la API con Postgres.

- [ ] **Step 1: Levantar un Postgres limpio en una red Docker**

Run:

```bash
docker network create simpletpv-test-net 2>/dev/null || true
docker run -d --name simpletpv-test-pg --network simpletpv-test-net \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=simpletpv \
  postgres:16-alpine
# Esperar a que esté listo
for i in $(seq 1 30); do
  docker exec simpletpv-test-pg pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
echo "postgres listo"
```

Expected: "postgres listo".

- [ ] **Step 2: Arrancar la imagen con DATABASE_URL_MIGRATE (caso éxito)**

Run:

```bash
docker run -d --name simpletpv-test-api --network simpletpv-test-net \
  -e DATABASE_URL_MIGRATE="postgresql://postgres:postgres@simpletpv-test-pg:5432/simpletpv?schema=public" \
  -e DATABASE_URL_APP="postgresql://postgres:postgres@simpletpv-test-pg:5432/simpletpv?schema=public" \
  -e JWT_SECRET=test-access -e JWT_REFRESH_SECRET=test-refresh \
  -p 3001:3001 \
  simpletpv-api-test
sleep 5
docker logs simpletpv-test-api
```

Expected en logs: «Aplicando migraciones…», luego que Prisma aplica las 6 migraciones (o «No pending migrations» si ya estaban), «Migraciones aplicadas. Arrancando la API…», y la API escuchando en :3001.

Nota: para este test de humo usamos el superuser `postgres` también como `DATABASE_URL_APP` (evita el paso de bootstrap de roles `app`/password). El objetivo es validar el ENTRYPOINT (migración + arranque), no el RLS, que ya está cubierto por `apps/api/test/rls.integration.spec.ts`.

- [ ] **Step 3: Verificar /health y la tabla de migraciones**

Run:

```bash
sleep 3
curl -sf http://localhost:3001/health && echo " <- health OK"
docker exec simpletpv-test-pg psql -U postgres -d simpletpv -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;"
```

Expected: `{"status":"ok","uptime":...} <- health OK`, y la lista de 6 migraciones aplicadas en `_prisma_migrations`.

- [ ] **Step 4: Verificar el caso de fallo (fail-fast sin DATABASE_URL_MIGRATE)**

Run:

```bash
docker rm -f simpletpv-test-api >/dev/null 2>&1
docker run --name simpletpv-test-api-fail --network simpletpv-test-net \
  -e DATABASE_URL_APP="postgresql://postgres:postgres@simpletpv-test-pg:5432/simpletpv?schema=public" \
  -e JWT_SECRET=test-access -e JWT_REFRESH_SECRET=test-refresh \
  simpletpv-api-test; echo "EXIT CODE: $?"
```

Expected: el contenedor imprime el error «DATABASE_URL_MIGRATE no está definida. Abortando.» y `EXIT CODE: 1` (no se queda escuchando). Esto demuestra el fail-fast.

- [ ] **Step 5: Limpieza de los recursos de prueba**

Run:

```bash
docker rm -f simpletpv-test-api simpletpv-test-api-fail simpletpv-test-pg >/dev/null 2>&1 || true
docker network rm simpletpv-test-net >/dev/null 2>&1 || true
docker rmi simpletpv-api-test >/dev/null 2>&1 || true
echo "limpieza OK"
```

Expected: "limpieza OK". (No hay commit en esta task: es solo verificación. Si algún step reveló un bug, corrígelo en Task 1 o 2 y vuelve a verificar.)

---

## Task 4: Variable de entorno y documentación de deploy

**Files:**

- Modify: `.env.example`
- Create: `docs/deployment.md`

- [ ] **Step 1: Documentar DATABASE_URL_MIGRATE en .env.example**

En `.env.example`, justo después del bloque de `DATABASE_URL_APP` (la línea que define `DATABASE_URL_APP=...`), añadir:

```
# Migraciones en el deploy (#78). Rol con privilegios DDL (owner) que aplica
# `prisma migrate deploy` en el arranque del contenedor (apps/api/docker-entrypoint.sh).
# Separado del rol de runtime DATABASE_URL_APP (que tiene RLS y no puede hacer DDL).
# En local apunta al superuser; en producción se configura en Dokploy. Ver docs/deployment.md.
DATABASE_URL_MIGRATE=postgresql://postgres:postgres@localhost:5434/simpletpv?schema=public
```

- [ ] **Step 2: Escribir docs/deployment.md**

Crear `docs/deployment.md`:

```markdown
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

| Variable               | Rol                      | Uso                                       |
| ---------------------- | ------------------------ | ----------------------------------------- |
| `DATABASE_URL_MIGRATE` | owner / superuser (DDL)  | Solo el entrypoint, para `migrate deploy` |
| `DATABASE_URL_APP`     | rol `app` (RLS, sin DDL) | Runtime de la API                         |

`DATABASE_URL_MIGRATE` se separa a propósito: el rol potente que aplica DDL solo
existe durante la migración, no en el proceso que sirve peticiones.

## Si una migración falla en producción

1. El contenedor nuevo no arranca; la versión previa sigue sirviendo (no hay caída).
2. Revisa los logs del contenedor en Dokploy: el entrypoint imprime el error de Prisma.
3. Corrige la migración (o el estado de la BD) y vuelve a desplegar. `migrate deploy`
   reintenta las pendientes; las ya aplicadas no se repiten (tracking en
   `_prisma_migrations`).
4. No hay rollback automático de esquema (no es estándar en Prisma): si una
   migración dejó la BD en mal estado, la corrección es manual.

## Primer despliegue: passwords de los roles

Las migraciones crean los roles `app` y `app_admin` sin LOGIN. Tras el **primer**
`migrate deploy`, el operador les da contraseña UNA VEZ (leyendo los secrets de
Dokploy):

\`\`\`sql
ALTER ROLE app LOGIN PASSWORD '<secret-app-de-dokploy>';
ALTER ROLE app_admin LOGIN PASSWORD '<secret-app-admin-de-dokploy>';
\`\`\`

Ver `packages/db/scripts/README.md`. En dev/CI esto lo hace `dev-bootstrap.sql`.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/deployment.md
git commit -m "docs(infra): variable DATABASE_URL_MIGRATE y guía de deploy (#78)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Gate del monorepo

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: sin errores. (El entrypoint `.sh` no lo cubre eslint; opcionalmente, si `shellcheck` está disponible, `shellcheck apps/api/docker-entrypoint.sh` no debe dar errores graves.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 7/7 workspaces OK.

- [ ] **Step 3: Tests de la API con cobertura**

Run: `pnpm --filter @simpletpv/api test`
Expected: PASS (este cambio no toca código TS de la API; los 328 tests siguen verdes y la cobertura no baja del floor).

- [ ] **Step 4: Build del monorepo**

Run: `pnpm build`
Expected: build OK de las apps.

- [ ] **Step 5: Verificación final del diff**

Run: `git log --oneline main..HEAD`
Expected: la serie de commits de Tasks 1, 2 y 4 (Task 3 y 5 no commitean; son verificación).

---

## Notas de cierre

- **PR/merge:** contra `main` (tracker `ncara42/simpleTPV`), cerrando la parte
  pendiente de `#78`. Título sugerido: `feat(infra): migraciones seguras en el deploy con fail-fast (#78)`.
- **Tras mergear:** en Dokploy, configurar `DATABASE_URL_MIGRATE` con un rol owner
  y dejar `DATABASE_URL_APP` con el rol `app`. El primer deploy aplicará las
  migraciones; luego, el `ALTER ROLE ... LOGIN PASSWORD` una vez (ver
  `docs/deployment.md`).

```

```
