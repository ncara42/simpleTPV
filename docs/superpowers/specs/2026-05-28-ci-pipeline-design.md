# Spec — Pipeline CI/CD para simpletpv

| Campo      | Valor                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                  |
| Autor      | noel@noelcaravaca.com                                                       |
| Estado     | Aprobado para implementación                                                |
| Referencia | Portado y adaptado desde `/Users/admin/Desktop/proyectos/vivienda/.github/` |

## 1. Objetivo

Implantar en `simpletpv` la misma disciplina de CI/CD que el proyecto `vivienda`, adaptada al stack del TPV (Turborepo + pnpm + NestJS + Prisma + React/Vite x2 + Postgres 16 sin PostGIS) y al hecho de que los workflows correrán en GitHub-hosted runners (no en self-hosted), dentro del free tier de GitHub Actions.

El objetivo es que **desde el primer PR del scaffolding del monorepo**:

1. Todo cambio pase un gate de calidad (lint, typecheck, dead code, tests con cobertura, build).
2. Todo cambio pase un gate de seguridad (gitleaks, semgrep, OWASP Dependency-Check, OSV, Trivy filesystem).
3. La cobertura de tests de `@simpletpv/api` solo pueda subir (coverage ratchet).
4. Todo push a `main` que pase quality + e2e dispare un redeploy automático en Dokploy.

## 2. Alcance

**Incluido:**

- 3 workflows GitHub Actions (`ci.yml`, `security.yml`, `trivy.yml`).
- `dependabot.yml` con npm + github-actions, ambos semanales.
- `CODEOWNERS` apuntando al owner de seguridad/infra/CI.
- Hook local `.husky/pre-commit` con lint-staged + gitleaks opcional.
- Configs: `.lintstagedrc.json`, `.prettierrc.json`, `.prettierignore`, `.trivyignore.yaml`, `knip.json`, `coverage-threshold.json`, `.nvmrc`.

**Excluido:**

- Workflow `pipeline.yml` de ingesta mensual de datos públicos (no aplica a simpletpv — no hay ingesta SERPAVI/Atlas/EPA equivalente).
- Job `image-scan` de Trivy (queda como TODO comentado hasta que existan los Dockerfiles de cada app).
- Migración a runners self-hosted (decisión futura cuando el consumo de minutos lo justifique).
- Scaffolding del monorepo en sí (es prerequisito de este spec, no parte de él).

## 3. Prerrequisitos del repositorio

El spec asume que, antes de aplicar la CI, el repo ya tiene:

- `package.json` raíz con `packageManager: "pnpm@<x>"`, `engines.node >= 22`, scripts `lint`, `format`, `format:write`, `knip`, `prepare`.
- `pnpm-workspace.yaml` declarando `apps/*` y `packages/*`.
- `apps/api` (NestJS 11) con scripts `build`, `typecheck`, `test`, configurado con Vitest y cobertura reporter `json-summary`.
- `apps/tpv` (React 19 + Vite 6) con scripts `build`, `typecheck`, `test:e2e` (Playwright).
- `apps/backoffice` (React 19 + Vite 6) con scripts `build`, `typecheck`, `test:e2e`.
- `packages/db` con `prisma/schema.prisma`, scripts para `prisma generate`, `prisma migrate deploy` y `prisma db seed` (seed multi-tenant: ≥ 2 organizaciones, ejecutado como rol que hace BYPASSRLS).
- `.nvmrc` con `22`.

Si alguna de estas piezas falta cuando se ejecute la implementación, el plan se bloquea hasta que el scaffolding cubra el hueco.

## 4. Decisiones explícitas (con justificación)

| #   | Decisión                                                                 | Justificación                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Runners `ubuntu-latest` (GitHub-hosted), no self-hosted                  | Entrar en free tier. Migración a self-hosted reservada para el futuro.                                                                                                              |
| D2  | Node **22 LTS**, no 24                                                   | 22 está más probado en hosted runners. NestJS 11 y Prisma 6 aún muestran edge cases con 24. Alineamiento con vivienda no compensa la inestabilidad.                                 |
| D3  | E2E desde el primer día con Postgres efímero                             | El plan MVP arranca semana 0 con seed multi-tenant; tener E2E desde el principio evita deuda de testing.                                                                            |
| D4  | Postgres efímero vía `services:` de Actions, no `docker run` hermano     | En hosted runners `services:` es nativo, simplifica la red, evita la danza de `$HOSTNAME` + descubrir red Docker que necesita vivienda al correr el runner dentro de un contenedor. |
| D5  | `postgres:16-alpine` oficial, no `postgis/postgis`                       | simpletpv no usa PostGIS. Imagen más ligera, menos superficie.                                                                                                                      |
| D6  | Coverage ratchet replicado, apuntando a `@simpletpv/api`                 | Mismo patrón que vivienda. Suelo inicial `0` para que el primer push lo establezca.                                                                                                 |
| D7  | Deploy automático Dokploy desde día 1                                    | El usuario va a usar Dokploy. Mismo patrón que vivienda (webhook, secret en env, validación 2xx).                                                                                   |
| D8  | `pre-commit` hook con gitleaks **opcional** (avisa, no rompe)            | Reduce fricción de onboarding del equipo. vivienda lo hace obligatorio pero allí el repo es de un solo dev; simpletpv previsiblemente tendrá más manos.                             |
| D9  | Sin `pipeline.yml`                                                       | simpletpv no tiene ingesta mensual de fuentes públicas; mantener el archivo crearía confusión.                                                                                      |
| D10 | Image-scan de Trivy comentado como TODO                                  | No hay Dockerfiles de apps todavía. Se activa cuando existan `apps/api/Dockerfile`, `apps/tpv/Dockerfile`, `apps/backoffice/Dockerfile`.                                            |
| D11 | Semgrep sin `p/nextjs` (simpletpv usa Vite/SPA, no Next)                 | Reglas: `p/typescript`, `p/nodejs`, `p/secrets`, `p/owasp-top-ten`.                                                                                                                 |
| D12 | Actions pinneadas por SHA con comentario `# vX.Y.Z`                      | Una credencial de maintainer robada no puede reetiquetar. Dependabot propone upgrades.                                                                                              |
| D13 | `permissions: {}` a nivel workflow + permisos mínimos por job            | Principio de mínimo privilegio. Solo el job `ratchet` tiene `contents: write`.                                                                                                      |
| D14 | `concurrency` con `cancel-in-progress: true` salvo en jobs irreversibles | Ahorro de minutos. (`pipeline.yml` con `cancel-in-progress: false` no aplica porque ese workflow se descarta.)                                                                      |

## 5. Arquitectura — 3 workflows

### 5.1 `ci.yml` — quality + ratchet + e2e + deploy

**Triggers:** `push` a `main`, `pull_request` a `main`.
**Concurrency:** `${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`.
**Permissions a nivel workflow:** `{}`.

#### Job `quality` (≈ 8–10 min)

- `runs-on: ubuntu-latest`, `timeout-minutes: 15`, `permissions: contents: read`.
- Pasos:
  1. Checkout (`actions/checkout` pinneado por SHA).
  2. Setup pnpm (`pnpm/action-setup` pinneado por SHA; lee la versión de `packageManager` del `package.json`).
  3. Setup Node 22 (`actions/setup-node` con `cache: pnpm`).
  4. `pnpm install --frozen-lockfile`.
  5. `pnpm --filter @simpletpv/db exec prisma generate`.
  6. `pnpm audit --audit-level=high --prod`.
  7. `pnpm lint`.
  8. `pnpm knip`.
  9. `pnpm -r typecheck`.
  10. `pnpm --filter @simpletpv/api exec vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text`.
  11. **Coverage ratchet gate** (lectura, no escritura): script `node -e '...'` inline que lee `apps/api/coverage/coverage-summary.json` y `coverage-threshold.json`. Si `summary.total.statements.pct < threshold.api.statements`, falla. Si no hay cobertura instrumentada todavía, sale `0` con mensaje "ratchet omitido".
  12. Build de todas las apps: `pnpm -r --filter "./apps/*" build`.

#### Job `ratchet` (≈ 3–4 min)

- `needs: [quality]`, `if: github.event_name == 'push'`, `permissions: contents: write`, `timeout-minutes: 5`.
- Repite checkout + setup + install + prisma generate + vitest con coverage.
- Script `node -e '...'` inline que **sube** `threshold.api.statements` si `current > floor`, escribe `coverage-threshold.json`.
- Si el diff de `coverage-threshold.json` no es vacío:
  ```bash
  git config user.name "github-actions[bot]"
  git config user.email "github-actions[bot]@users.noreply.github.com"
  git add coverage-threshold.json
  git commit -m "chore: ratchet coverage floor [skip ci]"
  git push origin "HEAD:${TARGET_BRANCH}"
  ```
- `TARGET_BRANCH` se pasa via `env: TARGET_BRANCH: ${{ github.ref_name }}` para evitar inyección en shell.

#### Job `e2e` (≈ 10–12 min)

- `needs: [quality]`, `timeout-minutes: 15`, `permissions: contents: read`.
- `services:`:
  ```yaml
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: simpletpv_test
    options: >-
      --health-cmd "pg_isready -U postgres"
      --health-interval 3s
      --health-timeout 5s
      --health-retries 10
    ports: ['5432:5432']
  ```
- `env: DATABASE_URL: postgresql://postgres:postgres@localhost:5432/simpletpv_test`.
- Pasos:
  1. Checkout + setup pnpm + setup Node 22 + install.
  2. `pnpm --filter @simpletpv/db exec prisma generate`.
  3. `pnpm --filter @simpletpv/db exec prisma migrate deploy`.
  4. `pnpm --filter @simpletpv/db exec prisma db seed` (seed multi-tenant: ≥ 2 organizaciones, corre como superuser para BYPASSRLS).
  5. `pnpm -r --filter "./apps/*" build`.
  6. Arrancar `apps/api` en background y esperar a que responda. El comando concreto y el endpoint de healthcheck (esperado `GET /health` devolviendo 200) los define el scaffolding de la app — el job lanza `pnpm --filter @simpletpv/api start` con `&` y hace polling con `curl --retry` o equivalente sobre la URL local hasta 30s de timeout. Si pasados los 30s no responde, el job falla con mensaje explícito.
  7. `pnpm --filter @simpletpv/tpv exec playwright install --with-deps chromium`.
  8. `pnpm --filter @simpletpv/tpv test:e2e`.
  9. `pnpm --filter @simpletpv/backoffice test:e2e` (reutiliza el Chromium ya instalado).
  10. `if: failure()` → upload artifact `playwright-report` con `apps/tpv/playwright-report/`, `apps/tpv/test-results/`, `apps/backoffice/playwright-report/`, `apps/backoffice/test-results/`, retention 7d.

#### Job `deploy` (≈ 1 min)

- `needs: [e2e]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, `timeout-minutes: 5`, `permissions: {}`.
- Un único paso:
  ```yaml
  env:
    DOKPLOY_WEBHOOK_URL: ${{ secrets.DOKPLOY_WEBHOOK_URL }}
  run: |
    read -r code redirects <<<"$(curl -sS -L \
      --proto-redir =http,https \
      --max-redirs 10 \
      -o /dev/null \
      -w "%{http_code} %{num_redirects}" \
      -X GET "$DOKPLOY_WEBHOOK_URL")"
    echo "Webhook HTTP $code tras $redirects redirección(es)"
    case "$code" in
      2*) echo "Redeploy disparado." ;;
      *) echo "::error::El webhook de Dokploy devolvió $code"; exit 1 ;;
    esac
  ```

### 5.2 `security.yml` — gitleaks + semgrep + owasp + osv

**Triggers:** `push` a `main`, `pull_request` a `main`, cron semanal `0 8 * * 1`.
**Concurrency:** mismo patrón que ci.yml.
**Permissions a nivel workflow:** `{}`.

Adaptación clave vs vivienda: en self-hosted, vivienda usaba binarios preinstalados; en hosted runners usamos actions oficiales pinneadas por SHA.

| Job        | Action / herramienta                                                 | Permisos         | Timeout | Configuración                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitleaks` | `gitleaks/gitleaks-action@<sha>`                                     | `contents: read` | 5 min   | `fetch-depth: 0`, `persist-credentials: false`, redact, no-banner                                                                                                                                                      |
| `semgrep`  | `semgrep/semgrep-action@<sha>` (action oficial, no Docker container) | `contents: read` | 10 min  | Configs: `p/typescript`, `p/nodejs`, `p/secrets`, `p/owasp-top-ten`. Excludes: `node_modules`, `dist`, `build`, `coverage`, `*.spec.ts`, `*.test.ts`, `data`, `generated`. `--error` para que falle el job en findings |
| `owasp`    | `dependency-check/Dependency-Check_Action@<sha>`                     | `contents: read` | 20 min  | `--failOnCVSS 8`, `--enableRetired`, `propertyfile` con NVD_API_KEY si está, upload artifact HTML retention 14d                                                                                                        |
| `osv`      | `google/osv-scanner-action@<sha>`                                    | `contents: read` | 10 min  | `--lockfile=./pnpm-lock.yaml`                                                                                                                                                                                          |

Secret opcional: `NVD_API_KEY` (sin él, OWASP funciona pero más lento).

### 5.3 `trivy.yml` — filesystem scan + SARIF upload

**Triggers:** push/PR cuando cambien `**/Dockerfile`, `**/package.json`, `pnpm-lock.yaml`, `.github/workflows/trivy.yml`; cron semanal `0 7 * * 1`.
**Concurrency:** mismo patrón.
**Permissions a nivel workflow:** `{}`.

Job único `filesystem-scan`:

- `permissions: contents: read, security-events: write`.
- Cache de Trivy DB (`actions/cache`) con `key: trivy-db-${{ github.run_id }}` + restore-keys `trivy-db-`.
- Step 1 — **Gate**: `aquasecurity/trivy-action@<sha>` con `scan-type: fs`, `severity: CRITICAL,HIGH`, `ignore-unfixed: true`, `exit-code: "1"`, `scanners: vuln,secret,misconfig`, `skip-dirs: node_modules,dist,build,coverage,data`, `trivyignores: .trivyignore.yaml`.
- Step 2 — **SARIF report** (`if: always()`): mismo action, `format: sarif`, `output: trivy-fs.sarif`.
- Step 3 — Upload SARIF a la pestaña Security: `github/codeql-action/upload-sarif@<sha>` con `category: trivy-fs`, `continue-on-error: true`.

Sección comentada como TODO para activar image-scan con matrix cuando existan los Dockerfiles:

```
# matrix:
#   - app: simpletpv-api,        dockerfile: apps/api/Dockerfile
#   - app: simpletpv,        dockerfile: apps/tpv/Dockerfile
#   - app: simpletpv-backoffice, dockerfile: apps/backoffice/Dockerfile
```

## 6. `.github/dependabot.yml`

Mismo patrón que vivienda:

- **github-actions** semanal lunes 08:00, labels `[dependencies, ci-cd]`.
- **npm** semanal lunes 08:00, labels `[dependencies]`, `open-pull-requests-limit: 10`, grupo `dev-dependencies` con `update-types: [minor, patch]`.

## 7. `.github/CODEOWNERS`

Paths sensibles que requieren review del owner:

- `/.github/` — CI/CD y workflows.
- `/infra/` — infraestructura.
- `/docker-compose.yml` — orquestación local.
- `/.trivyignore.yaml` — excepciones de seguridad.
- `/.gitignore` — filtros de secretos.
- `/packages/db/prisma/` — schema de base de datos.
- `/apps/api/src/auth/` — autenticación.
- `/apps/api/src/**/rls/` o equivalente — políticas RLS (path exacto a confirmar cuando exista la estructura del módulo).

Owner: el handle de GitHub del usuario (a fijar en implementación, valor por defecto sugerido `@<github-handle-noel>` — el implementador debe sustituirlo por el handle real al crear el archivo).

## 8. Hooks locales y configs

### 8.1 `.husky/pre-commit`

```bash
pnpm exec lint-staged

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --pre-commit --staged --no-banner --redact
else
  echo "⚠ gitleaks no instalado — escaneo de secretos local omitido."
  echo "  Instálalo con: brew install gitleaks"
fi
```

**Decisión D8 reflejada:** sin `exit 1` si gitleaks falta. El gate obligatorio vive en CI (`security.yml`).

### 8.2 `.lintstagedrc.json`

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,mjs,json,md,yml,yaml}": ["prettier --write"]
}
```

### 8.3 `.prettierrc.json`, `.prettierignore`

Estilo a definir por el equipo en implementación. Mínimo razonable: `singleQuote: true`, `printWidth: 100`. `.prettierignore` excluye `node_modules`, `dist`, `build`, `coverage`, `*.generated.*`, `pnpm-lock.yaml`.

### 8.4 `.trivyignore.yaml`

Vacío al inicio. Cualquier excepción futura documenta el ID, paths afectados y razón.

### 8.5 `knip.json`

Adaptado al stack simpletpv (sin scripts de ingesta):

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    ".": {},
    "packages/db": { "ignoreDependencies": ["@prisma/client"] },
    "apps/tpv": { "playwright": { "config": ["playwright.config.ts"] } },
    "apps/backoffice": { "playwright": { "config": ["playwright.config.ts"] } }
  }
}
```

### 8.6 `coverage-threshold.json`

```json
{ "api": { "statements": 0 } }
```

Suelo inicial 0. El primer push a `main` lo subirá automáticamente.

### 8.7 `.nvmrc`

```
22
```

## 9. Secrets a configurar en GitHub (manual)

- `DOKPLOY_WEBHOOK_URL` — **obligatorio** para el job `deploy`. Sin él, el job falla.
- `NVD_API_KEY` — **opcional**. Sin él, OWASP Dependency-Check funciona pero descarga más lenta.

## 10. Validación de la implementación

Definición de done:

1. Los 3 workflows existen en `.github/workflows/`, con todas las actions pinneadas por SHA con comentario de versión.
2. Existe `.github/dependabot.yml` y `.github/CODEOWNERS` (con handle real, no placeholder).
3. Existen los archivos de config raíz: `.husky/pre-commit`, `.lintstagedrc.json`, `.prettierrc.json`, `.prettierignore`, `.trivyignore.yaml`, `knip.json`, `coverage-threshold.json`, `.nvmrc`.
4. Un PR de prueba con un cambio trivial verdea los 3 workflows.
5. El merge de ese PR a `main` produce:
   - un commit `chore: ratchet coverage floor [skip ci]` (si la cobertura es > 0),
   - una llamada exitosa (HTTP 2xx) al webhook Dokploy registrada en los logs del job `deploy`.
6. La pestaña **Security → Code scanning** del repo muestra resultados de Trivy categoría `trivy-fs`.
7. Dependabot abre PRs semanales para actions y npm sin errores.

## 11. Riesgos y mitigaciones

| Riesgo                                                         | Mitigación                                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consumo de minutos del free tier (~2000/mes en repos privados) | Estimación ~25 min por PR (quality 10 + e2e 12 + security 5 + trivy 3). Margen ~80 PRs/mes. Si se acerca al límite, migrar a self-hosted (mismo runner de vivienda u otro). |
| RLS de Postgres no es expresable en Prisma                     | Las políticas viven en SQL puro en migraciones. El seed corre como superuser (BYPASSRLS), los tests E2E como rol aplicación. Documentado en `packages/db`.                  |
| Node 22 vs 24 puede divergir de vivienda                       | Aceptado por decisión D2. Si en el futuro se quiere alinear, basta cambiar `node-version` en los tres workflows.                                                            |
| Sin Dockerfiles aún → Trivy image-scan inactivo                | TODO comentado. Activar cuando existan los Dockerfiles de las tres apps.                                                                                                    |
| Webhook Dokploy expone URL en logs si curl falla               | Patrón seguro replicado de vivienda: URL pasada por env, no interpolada en shell; solo se loguea `http_code` y `num_redirects`, no la URL.                                  |
| Inyección de comandos vía `github.ref_name` en el job ratchet  | Replicado de vivienda: pasar por `env: TARGET_BRANCH` y referenciar `"${TARGET_BRANCH}"` quoted en el script.                                                               |

## 12. Fuera de alcance — futuro

- **Self-hosted runner** para simpletpv (reutilizando infra de vivienda o nuevo). Disparador: consumo de minutos > 80% del free tier.
- **Image-scan de Trivy** con matrix de Dockerfiles.
- **Workflow de release** (changelog, tag, publish) cuando exista versionado público.
- **Preview deployments** por PR (Dokploy lo permite, pero requiere infra extra).
- **SBOM** generation y firma con cosign si el cliente piloto lo exige.
