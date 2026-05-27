# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implantar en `qrush_tpv` los workflows de CI/CD, configs y hooks descritos en `docs/superpowers/specs/2026-05-28-ci-pipeline-design.md`, portados y adaptados desde el proyecto `vivienda`.

**Architecture:** Tres workflows GitHub Actions (`ci.yml`, `security.yml`, `trivy.yml`) sobre `ubuntu-latest`, más Dependabot, CODEOWNERS, hooks Husky y configs raíz. Quality gate con coverage ratchet, E2E con Postgres efímero (`services:`), deploy automático a Dokploy via webhook.

**Tech Stack:** GitHub Actions, pnpm 11, Node 22 LTS, Vitest, Prisma 6, Playwright, Husky, lint-staged, Prettier, Knip, Gitleaks, Semgrep, OWASP Dependency-Check, OSV Scanner, Trivy, Dokploy.

---

## Convenciones del plan

- **Rutas:** todas relativas a la raíz del repo `/Users/admin/Desktop/qrush_tpv/`.
- **SHAs pinneados:** cada acción de GitHub se referencia por SHA + comentario de versión, como en vivienda. Los SHAs concretos están en este plan; si Dependabot ya los actualizó cuando se ejecute, usar los más recientes mostrando el comentario de versión.
- **Commits:** Conventional Commits. Frecuentes, uno por tarea.
- **Verificación local:** GitHub Actions no se puede ejecutar 100% localmente. Donde aplique, el plan indica cómo simular cada paso con `act` (opcional) o validar el YAML con `actionlint` antes de pushear.

---

## File Structure

Archivos que crea o modifica este plan:

| Path                             | Responsabilidad                       | Acción    |
| -------------------------------- | ------------------------------------- | --------- |
| `.github/workflows/ci.yml`       | Quality gate + ratchet + E2E + deploy | Crear     |
| `.github/workflows/security.yml` | gitleaks + semgrep + owasp + osv      | Crear     |
| `.github/workflows/trivy.yml`    | Trivy filesystem + SARIF upload       | Crear     |
| `.github/dependabot.yml`         | Updates semanales npm + actions       | Crear     |
| `.github/CODEOWNERS`             | Reviewers para paths sensibles        | Crear     |
| `.husky/pre-commit`              | lint-staged + gitleaks opcional       | Crear     |
| `.lintstagedrc.json`             | Reglas por extensión                  | Crear     |
| `.prettierrc.json`               | Estilo de formato                     | Crear     |
| `.prettierignore`                | Paths que no formatea Prettier        | Crear     |
| `.trivyignore.yaml`              | Vacío inicial (sin excepciones)       | Crear     |
| `knip.json`                      | Entries para detección de dead code   | Crear     |
| `coverage-threshold.json`        | Suelo de cobertura (api: 0)           | Crear     |
| `.nvmrc`                         | Versión de Node (22)                  | Crear     |
| `package.json` (raíz)            | Añadir `prepare: husky` si no existe  | Modificar |

---

## Task 0: Verificar prerequisitos (gate manual)

**Files:**

- Lectura: estructura del repo

Esta tarea es un **gate**: si alguna comprobación falla, el plan se bloquea hasta que el scaffolding del monorepo se complete. No es parte del CI, pero CI no puede existir sin el scaffolding.

- [ ] **Step 1: Verificar que es un repositorio git**

Run: `git rev-parse --is-inside-work-tree`
Expected output: `true`

Si falla con `fatal: not a git repository`, ejecutar `git init` y crear el primer commit con el PRD/plan existentes antes de continuar.

- [ ] **Step 2: Verificar `package.json` raíz**

Run: `node -e "const p=require('./package.json'); console.log(p.packageManager, p.engines?.node)"`
Expected: algo como `pnpm@11.1.3 >=22`

Si falla, el scaffolding del monorepo no está hecho. Crear `package.json` raíz con al menos:

```json
{
  "name": "qrush-tpv",
  "private": true,
  "engines": { "node": ">=22", "pnpm": ">=11" },
  "packageManager": "pnpm@11.1.3",
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:write": "prettier --write .",
    "knip": "knip",
    "prepare": "husky"
  }
}
```

- [ ] **Step 3: Verificar `pnpm-workspace.yaml`**

Run: `test -f pnpm-workspace.yaml && cat pnpm-workspace.yaml`
Expected: contiene al menos `packages:` con `apps/*` y `packages/*`.

- [ ] **Step 4: Verificar workspaces declarados**

Run: `pnpm -r exec node -e "console.log(require('./package.json').name)"`
Expected: lista que incluya `@qrush/api`, `@qrush/tpv`, `@qrush/backoffice`, `@qrush/db`.

Si falta alguno, el plan se bloquea hasta que el scaffolding cree esos workspaces. Anotar qué falta y avisar al usuario.

- [ ] **Step 5: Verificar scripts mínimos por workspace**

Run:

```bash
for pkg in api tpv backoffice; do
  echo "--- @qrush/$pkg ---"
  pnpm --filter @qrush/$pkg exec node -e "
    const s = require('./package.json').scripts || {};
    ['build','typecheck'].forEach(k => console.log(k + ': ' + (s[k] || 'MISSING')));
  "
done
pnpm --filter @qrush/db exec node -e "
  const s = require('./package.json').scripts || {};
  console.log('prisma generate / migrate / seed scripts:', JSON.stringify(s, null, 2));
"
```

Expected: ningún `MISSING` para `build` y `typecheck` en api/tpv/backoffice. `@qrush/db` con scripts para `prisma generate`, `prisma migrate deploy`, `prisma db seed`.

- [ ] **Step 6: Verificar que `apps/tpv` y `apps/backoffice` tienen Playwright**

Run:

```bash
for pkg in tpv backoffice; do
  echo "--- @qrush/$pkg ---"
  test -f apps/$pkg/playwright.config.ts && echo "playwright.config: OK" || echo "playwright.config: MISSING"
  pnpm --filter @qrush/$pkg exec node -e "
    const s = require('./package.json').scripts || {};
    console.log('test:e2e: ' + (s['test:e2e'] || 'MISSING'));
  "
done
```

Expected: `playwright.config: OK` y `test:e2e: ...` (no MISSING) para los dos.

- [ ] **Step 7: Verificar que `apps/api` tiene Vitest con coverage json-summary**

Run:

```bash
pnpm --filter @qrush/api exec node -e "
  const fs = require('fs');
  const files = ['vitest.config.ts','vitest.config.js','vitest.config.mjs'];
  const cfg = files.find(f => fs.existsSync(f));
  console.log('config: ' + (cfg || 'MISSING'));
  if (cfg) console.log(fs.readFileSync(cfg, 'utf8'));
"
```

Expected: imprime el archivo de config; la sección `coverage` debe incluir `reporter: ['json-summary', 'text']` o equivalente que produzca `coverage-summary.json`. Si solo está `text`, anotar como hueco a corregir antes de la Task 3.

- [ ] **Step 8: Commit del estado de verificación**

Si todo OK y has tenido que crear `package.json` o `pnpm-workspace.yaml` en steps anteriores:

```bash
git add package.json pnpm-workspace.yaml
git commit -m "chore: prerequisitos para CI"
```

Si no has tenido que crear nada (todo ya existía), no hay nada que commitear. Pasar a Task 1.

---

## Task 1: Crear configs raíz mínimos

**Files:**

- Create: `.nvmrc`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.lintstagedrc.json`
- Create: `coverage-threshold.json`
- Create: `.trivyignore.yaml`

- [ ] **Step 1: Crear `.nvmrc`**

Contenido exacto:

```
22
```

- [ ] **Step 2: Crear `.prettierrc.json`**

Contenido exacto:

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "semi": true
}
```

- [ ] **Step 3: Crear `.prettierignore`**

Contenido exacto:

```
node_modules
dist
build
coverage
.next
*.generated.*
pnpm-lock.yaml
apps/*/playwright-report
apps/*/test-results
```

- [ ] **Step 4: Crear `.lintstagedrc.json`**

Contenido exacto:

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,mjs,json,md,yml,yaml}": ["prettier --write"]
}
```

- [ ] **Step 5: Crear `coverage-threshold.json`**

Contenido exacto:

```json
{
  "api": {
    "statements": 0
  }
}
```

- [ ] **Step 6: Crear `.trivyignore.yaml` vacío con comentario**

Contenido exacto:

```yaml
# Excepciones de Trivy. Cada entrada debe documentar:
#   - id: <CVE-id o DS-id>
#   - paths: [archivos afectados]
#   - razón: por qué se ignora
# Vacío al inicio — añadir entradas solo con justificación explícita.
```

- [ ] **Step 7: Verificar que Prettier acepta su propia config**

Run: `npx prettier --check .prettierrc.json .lintstagedrc.json coverage-threshold.json`
Expected: `All matched files use Prettier code style!` o equivalente.

Si falla porque Prettier no está instalado en el repo, instalarlo antes:

```bash
pnpm add -D -w prettier@^3
```

Y reintentar.

- [ ] **Step 8: Commit**

```bash
git add .nvmrc .prettierrc.json .prettierignore .lintstagedrc.json coverage-threshold.json .trivyignore.yaml
git commit -m "chore: configs raíz para CI (prettier, lint-staged, coverage, trivy)"
```

---

## Task 2: Instalar y configurar Husky + lint-staged + Knip

**Files:**

- Create: `.husky/pre-commit`
- Create: `knip.json`
- Modify: `package.json` (asegurar `prepare: husky` y deps)

- [ ] **Step 1: Instalar dependencias dev**

Run:

```bash
pnpm add -D -w husky@^9 lint-staged@^17 knip@^6 prettier@^3
```

Expected: actualiza `package.json` raíz con los 4 paquetes en `devDependencies`.

- [ ] **Step 2: Asegurar script `prepare: husky` en package.json raíz**

Comprobar que `package.json` raíz tiene en `scripts`:

```json
"prepare": "husky"
```

Si no está, añadirlo. No tocar otros scripts existentes.

- [ ] **Step 3: Inicializar husky**

Run: `pnpm run prepare`
Expected: crea el directorio `.husky/_/` (helpers internos).

- [ ] **Step 4: Crear `.husky/pre-commit`**

Contenido exacto:

```bash
pnpm exec lint-staged

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --pre-commit --staged --no-banner --redact
else
  echo "⚠ gitleaks no instalado — escaneo de secretos local omitido."
  echo "  Instálalo con: brew install gitleaks"
fi
```

Run: `chmod +x .husky/pre-commit`

- [ ] **Step 5: Crear `knip.json`**

Contenido exacto:

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    ".": {},
    "packages/db": {
      "ignoreDependencies": ["@prisma/client"]
    },
    "apps/tpv": {
      "playwright": {
        "config": ["playwright.config.ts"]
      }
    },
    "apps/backoffice": {
      "playwright": {
        "config": ["playwright.config.ts"]
      }
    }
  }
}
```

- [ ] **Step 6: Verificar que Knip arranca sin error de config**

Run: `pnpm knip --no-progress 2>&1 | head -20`
Expected: no error de "config not found" ni de parsing. Findings de dead code son aceptables — limpiar dead code es trabajo separado, no parte de este plan.

- [ ] **Step 7: Verificar que el hook se dispara**

Run:

```bash
echo "// test" > /tmp/qrush-hook-test.ts
mv /tmp/qrush-hook-test.ts ./hook-test.ts
git add hook-test.ts
git commit -m "test: pre-commit hook" --dry-run 2>&1 | head
```

Hacer un commit real de prueba:

```bash
git commit -m "test: pre-commit hook"
```

Expected: lint-staged corre sin error. Si gitleaks está instalado, también corre. Si no, imprime el aviso.

- [ ] **Step 8: Limpiar el archivo de prueba**

Run:

```bash
git reset --soft HEAD~1
git restore --staged hook-test.ts
rm hook-test.ts
```

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml .husky/pre-commit knip.json
git commit -m "chore: husky pre-commit + lint-staged + knip"
```

---

## Task 3: Crear `.github/CODEOWNERS` y `dependabot.yml`

**Files:**

- Create: `.github/CODEOWNERS`
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Pedir al usuario su handle de GitHub**

Antes de escribir CODEOWNERS, preguntar al usuario su handle de GitHub (ej. `@ncara42` para vivienda). Si el usuario no responde en el contexto, usar el placeholder literal `@OWNER-HANDLE-PENDIENTE` y dejar nota en el commit message.

- [ ] **Step 2: Crear `.github/CODEOWNERS`**

Contenido exacto (sustituir `@OWNER` por el handle real del paso 1):

```
# Ownership de las piezas sensibles del repo. GitHub solicita revisión de
# @OWNER para PRs que toquen estos paths — defensa en profundidad contra
# cambios accidentales en seguridad, CI o infra.

# CI/CD y workflows
/.github/                          @OWNER

# Configuración de seguridad y headers
/apps/api/src/auth/                @OWNER

# Infraestructura
/infra/                            @OWNER
/docker-compose.yml                @OWNER
/.trivyignore.yaml                 @OWNER

# Gitignore (filtros de secretos)
/.gitignore                        @OWNER

# Schema de la base de datos
/packages/db/prisma/               @OWNER
```

- [ ] **Step 3: Crear `.github/dependabot.yml`**

Contenido exacto:

```yaml
version: 2

updates:
  # GitHub Actions — mantiene los SHAs pinneados actualizados
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '08:00'
    labels: [dependencies, ci-cd]

  # npm — el monorepo pnpm tiene un único lockfile en la raíz;
  # Dependabot descubre todos los workspaces desde ahí.
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '08:00'
    labels: [dependencies]
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        dependency-type: development
        update-types: [minor, patch]
```

- [ ] **Step 4: Validar YAML de dependabot**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))" && echo OK`
Expected: `OK`.

Si `python3` no está disponible, usar `node -e "console.log(require('js-yaml').load(require('fs').readFileSync('.github/dependabot.yml','utf8')))"` tras `pnpm add -D -w js-yaml` (revertir esta dep luego).

- [ ] **Step 5: Commit**

```bash
git add .github/CODEOWNERS .github/dependabot.yml
git commit -m "ci: codeowners + dependabot (weekly npm + actions)"
```

---

## Task 4: Crear `.github/workflows/ci.yml` — job `quality`

**Files:**

- Create: `.github/workflows/ci.yml`

Esta tarea crea SOLO el job `quality` del ci.yml. Los jobs `ratchet`, `e2e` y `deploy` se añaden en tareas separadas para que cada commit del plan deje un workflow ejecutable y verificable.

- [ ] **Step 1: Crear `.github/workflows/ci.yml` con job `quality`**

Contenido exacto:

```yaml
name: CI

# Quality gate. Cada PR y cada push a main pasa lint + typecheck + tests
# + build sobre todo el monorepo. El gate de cobertura se aplica inline.
#
# Actions pinneadas por SHA con comentario de versión: una credencial de
# maintainer robada no puede reetiquetar. Dependabot propone upgrades.

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions: {}

jobs:
  quality:
    name: Lint, typecheck, tests y build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Setup pnpm
        uses: pnpm/action-setup@a15d269cd4658e1107c09f1fabf4cbd7bd1f308a # v4.4.0

      - name: Setup Node 22
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # El cliente Prisma generado es un prerrequisito de compilación:
      # @qrush/api no tipa sin él, así que va antes de lint/typecheck.
      - name: Generate Prisma client
        run: pnpm --filter @qrush/db exec prisma generate

      - name: Audit dependencies
        run: pnpm audit --audit-level=high --prod

      - name: Lint
        run: pnpm lint

      - name: Detect unused code (knip)
        run: pnpm knip

      - name: Type-check
        run: pnpm run -r typecheck

      - name: Tests with coverage
        run: pnpm --filter @qrush/api exec vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text

      # Ratchet de lectura: falla el gate si la cobertura baja del suelo.
      # No escribe nada — solo lee y decide si el job pasa o falla.
      # El commit del umbral actualizado lo hace el job `ratchet` (solo en push).
      - name: Coverage ratchet (gate)
        run: |
          node -e '
            const fs = require("fs");
            const summary = require("./apps/api/coverage/coverage-summary.json");
            const threshold = JSON.parse(fs.readFileSync("coverage-threshold.json", "utf8"));

            const current = summary.total.statements.pct;
            const floor = threshold.api.statements;

            if (typeof current !== "number") {
              console.log("sin cobertura instrumentada todavía — ratchet omitido");
              process.exit(0);
            }

            console.log("api statements: " + current + "% (floor: " + floor + "%)");

            if (current < floor) {
              console.error("coverage dropped below floor — ratchet triggered");
              process.exit(1);
            }

            console.log("gate passed");
          '

      - name: Build apps
        run: pnpm -r --filter "./apps/*" build
```

- [ ] **Step 2: Validar el YAML con actionlint si está disponible**

Run:

```bash
if command -v actionlint >/dev/null 2>&1; then
  actionlint .github/workflows/ci.yml
else
  echo "actionlint no instalado — saltando. Instálalo con: brew install actionlint"
fi
```

Expected: sin errores. Si actionlint no está, no bloquea (validación real ocurre en GitHub al pushear).

- [ ] **Step 3: Validar el YAML con parser básico**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: quality gate (lint, typecheck, knip, tests, ratchet, build)"
```

---

## Task 5: Añadir job `ratchet` a `ci.yml`

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job `ratchet` al final de `ci.yml`**

Editar `.github/workflows/ci.yml`, añadir al final del bloque `jobs:` (después del job `quality`, mismo nivel de indentación):

```yaml
# -----------------------------------------------------------------------
# Ratchet: actualiza coverage-threshold.json si la cobertura subió.
# Solo corre en push a main (no en PRs: solo leemos + fallamos ahí).
# Necesita contents: write para el commit del bot. Job separado para
# que `quality` opere con contents: read (principio de mínimo privilegio).
# -----------------------------------------------------------------------
ratchet:
  name: Raise coverage floor
  runs-on: ubuntu-latest
  needs: [quality]
  if: github.event_name == 'push'
  timeout-minutes: 5
  permissions:
    contents: write
  steps:
    - name: Checkout
      uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      with:
        persist-credentials: true

    - name: Setup pnpm
      uses: pnpm/action-setup@a15d269cd4658e1107c09f1fabf4cbd7bd1f308a # v4.4.0

    - name: Setup Node 22
      uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
      with:
        node-version: '22'
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Generate Prisma client
      run: pnpm --filter @qrush/db exec prisma generate

    - name: Run tests with coverage
      run: pnpm --filter @qrush/api exec vitest run --coverage --coverage.reporter=json-summary

    - name: Raise floor if coverage improved
      run: |
        node -e '
          const fs = require("fs");
          const summary = require("./apps/api/coverage/coverage-summary.json");
          const threshold = JSON.parse(fs.readFileSync("coverage-threshold.json", "utf8"));

          const current = summary.total.statements.pct;
          const floor = threshold.api.statements;

          if (typeof current !== "number") {
            console.log("sin cobertura instrumentada — floor sin cambios");
            process.exit(0);
          }

          if (current > floor) {
            threshold.api.statements = current;
            fs.writeFileSync("coverage-threshold.json", JSON.stringify(threshold, null, 2) + "\n");
            console.log("floor raised to " + current + "%");
          } else {
            console.log("floor unchanged (" + floor + "%)");
          }
        '

    # github.ref_name pasa por env: y no interpolado en el run: — el contexto
    # github es entrada no confiable y `${{ }}` inline en un shell permitiría
    # inyección de comandos.
    - name: Commit raised floor
      env:
        TARGET_BRANCH: ${{ github.ref_name }}
      run: |
        git diff --quiet coverage-threshold.json && exit 0
        git config user.name "github-actions[bot]"
        git config user.email "github-actions[bot]@users.noreply.github.com"
        git add coverage-threshold.json
        git commit -m "chore: ratchet coverage floor [skip ci]"
        git push origin "HEAD:${TARGET_BRANCH}"
```

- [ ] **Step 2: Validar el YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`.

Run (si actionlint disponible): `actionlint .github/workflows/ci.yml`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: coverage ratchet job (raise floor on push to main)"
```

---

## Task 6: Añadir job `e2e` a `ci.yml`

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job `e2e` al final de `ci.yml`**

Editar `.github/workflows/ci.yml`, añadir al final del bloque `jobs:` (después de `ratchet`):

```yaml
# -----------------------------------------------------------------------
# E2E smoke tests — Playwright / Chromium
#
# Postgres efímero (postgres:16-alpine) vía `services:` nativo de Actions.
# Sin estado persistente; idempotente por diseño (seed + migrate deploy).
# RLS: el seed corre como superuser (BYPASSRLS); los tests E2E acceden
# a la app mediante la API, que internamente fija el rol aplicación.
# -----------------------------------------------------------------------
e2e:
  name: E2E smoke test (Playwright)
  runs-on: ubuntu-latest
  needs: [quality]
  timeout-minutes: 15
  permissions:
    contents: read

  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: qrush_test
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 3s
        --health-timeout 5s
        --health-retries 10
      ports:
        - 5432:5432

  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/qrush_test
    NODE_ENV: test

  steps:
    - name: Checkout
      uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

    - name: Setup pnpm
      uses: pnpm/action-setup@a15d269cd4658e1107c09f1fabf4cbd7bd1f308a # v4.4.0

    - name: Setup Node 22
      uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
      with:
        node-version: '22'
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Generate Prisma client
      run: pnpm --filter @qrush/db exec prisma generate

    - name: Apply Prisma migrations
      run: pnpm --filter @qrush/db exec prisma migrate deploy

    - name: Seed multi-tenant fixtures
      run: pnpm --filter @qrush/db exec prisma db seed

    - name: Build apps
      run: pnpm -r --filter "./apps/*" build

    # API en background. El healthcheck se valida con polling sobre
    # GET /health (debe devolver 200). Timeout duro de 30s para no
    # colgar el job si la app no arranca.
    - name: Start API
      run: |
        pnpm --filter @qrush/api start > /tmp/api.log 2>&1 &
        echo $! > /tmp/api.pid
        for i in $(seq 1 30); do
          if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            echo "API healthy tras ${i}s"
            exit 0
          fi
          sleep 1
        done
        echo "API no respondió en 30s — log:"
        cat /tmp/api.log
        exit 1

    - name: Install Playwright Chromium
      run: pnpm --filter @qrush/tpv exec playwright install --with-deps chromium

    - name: Run E2E tests (TPV)
      run: pnpm --filter @qrush/tpv test:e2e

    - name: Run E2E tests (Backoffice)
      run: pnpm --filter @qrush/backoffice test:e2e

    - name: Upload Playwright reports
      if: failure()
      uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: playwright-report
        path: |
          apps/tpv/test-results/
          apps/tpv/playwright-report/
          apps/backoffice/test-results/
          apps/backoffice/playwright-report/
          /tmp/api.log
        retention-days: 7

    - name: Stop API
      if: always()
      run: |
        if [ -f /tmp/api.pid ]; then
          kill "$(cat /tmp/api.pid)" 2>/dev/null || true
        fi
```

- [ ] **Step 2: Validar el YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`.

Run (si actionlint disponible): `actionlint .github/workflows/ci.yml`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: e2e job con postgres efímero + playwright (tpv + backoffice)"
```

---

## Task 7: Añadir job `deploy` a `ci.yml`

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job `deploy` al final de `ci.yml`**

Editar `.github/workflows/ci.yml`, añadir al final del bloque `jobs:` (después de `e2e`):

```yaml
# -----------------------------------------------------------------------
# Deploy a producción — solo en push a main, tras pasar quality + e2e.
# Llama al webhook de Dokploy que redespliega la imagen Docker.
# -----------------------------------------------------------------------
deploy:
  name: Deploy a producción (Dokploy)
  runs-on: ubuntu-latest
  needs: [e2e]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  timeout-minutes: 5
  permissions: {}
  steps:
    - name: Trigger redeploy
      # El secreto se pasa como variable de entorno (no interpolado en shell)
      # para evitar que metacaracteres en la URL o un fallo de enmascaramiento
      # de GitHub Actions expongan el valor en los logs del job.
      env:
        DOKPLOY_WEBHOOK_URL: ${{ secrets.DOKPLOY_WEBHOOK_URL }}
      run: |
        # -L sigue redirecciones; --proto-redir permite saltos entre http y
        # https. Validamos el código final y fallamos si no es 2xx para no
        # dar un falso verde cuando el redeploy no se ha lanzado. Mostramos
        # num_redirects para diagnosticar bucles sin filtrar la URL.
        read -r code redirects <<<"$(curl -sS -L \
          --proto-redir =http,https \
          --max-redirs 10 \
          -o /dev/null \
          -w "%{http_code} %{num_redirects}" \
          -X GET "$DOKPLOY_WEBHOOK_URL")"
        echo "Webhook HTTP $code tras $redirects redirección(es)"
        case "$code" in
          2*) echo "Redeploy disparado." ;;
          *) echo "::error::El webhook de Dokploy devolvió $code (esperado 2xx)"; exit 1 ;;
        esac
```

- [ ] **Step 2: Validar el YAML completo**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print('jobs:', list(d['jobs'].keys()))"`
Expected: `jobs: ['quality', 'ratchet', 'e2e', 'deploy']`

Run (si actionlint disponible): `actionlint .github/workflows/ci.yml`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: deploy job (dokploy webhook, push a main)"
```

---

## Task 8: Crear `.github/workflows/security.yml`

**Files:**

- Create: `.github/workflows/security.yml`

- [ ] **Step 1: Crear `.github/workflows/security.yml`**

Contenido exacto:

```yaml
name: Security

# Escaneo de seguridad sobre GitHub-hosted runners. Las herramientas se
# usan vía actions oficiales pinneadas por SHA (en vivienda venían
# preinstaladas en el runner self-hosted; aquí no aplica).

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Escaneo semanal para capturar CVEs nuevas aunque no haya cambios.
    - cron: '0 8 * * 1'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions: {}

jobs:
  # -----------------------------------------------------------------------
  # Detección de secretos en el historial git completo
  # -----------------------------------------------------------------------
  gitleaks:
    name: Gitleaks (secrets)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@83373cf2f8c4db6e24b41c1a9b086bb9619e9cd3 # v2.3.9
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # -----------------------------------------------------------------------
  # Análisis estático (SAST) — Semgrep action oficial.
  # Reglas: typescript, nodejs, secrets, owasp-top-ten.
  # -----------------------------------------------------------------------
  semgrep:
    name: Semgrep (SAST)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    container:
      image: returntocorp/semgrep@sha256:1f3a37b2b3a85a3f0b7d6c1a18d6e3f9b3c9b4d5e8f2a1b3c4d5e6f7a8b9c0d1
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Run Semgrep
        run: |
          semgrep scan \
            --config=p/typescript \
            --config=p/nodejs \
            --config=p/secrets \
            --config=p/owasp-top-ten \
            --error \
            --exclude=node_modules \
            --exclude=dist \
            --exclude=build \
            --exclude=coverage \
            --exclude='*.spec.ts' \
            --exclude='*.test.ts' \
            --exclude=data \
            --exclude=generated

  # -----------------------------------------------------------------------
  # CVEs en dependencias (CVSS >= 8 bloqueante)
  # -----------------------------------------------------------------------
  owasp:
    name: OWASP Dependency-Check
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Write Dependency-Check properties
        shell: bash
        run: |
          set -euo pipefail
          umask 077
          if [ -n "${NVD_API_KEY:-}" ]; then
            printf 'nvd.api.key=%s\n' "$NVD_API_KEY" > "$RUNNER_TEMP/dependencycheck.properties"
          else
            : > "$RUNNER_TEMP/dependencycheck.properties"
          fi
        env:
          NVD_API_KEY: ${{ secrets.NVD_API_KEY }}

      - name: Run OWASP Dependency-Check
        uses: dependency-check/Dependency-Check_Action@75ba02d6183445fe0761d26e836bde58b1560600 # v1.1.0
        with:
          project: qrush-tpv
          path: .
          format: HTML
          args: >
            --enableRetired
            --failOnCVSS 8
            --propertyfile ${{ runner.temp }}/dependencycheck.properties
            --exclude "**/node_modules/**"
            --exclude "**/data/**"

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: owasp-dependency-check-report
          path: reports/
          retention-days: 14

  # -----------------------------------------------------------------------
  # Vulnerabilidades conocidas en el lockfile (pnpm)
  # -----------------------------------------------------------------------
  osv:
    name: OSV Scanner (pnpm-lock)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Run OSV Scanner
        uses: google/osv-scanner-action/osv-scanner-action@e92cbe0a4b30bc119b97c52d7ad5f70b18c5e9c1 # v2.0.0
        with:
          scan-args: |-
            --lockfile=./pnpm-lock.yaml
```

> **Nota de SHAs:** los SHAs de `gitleaks-action`, `semgrep` container, y `osv-scanner-action` arriba son orientativos a fecha 2026-05-28. Antes de commitear, verificar el SHA actual de cada release en:
>
> - gitleaks-action: https://github.com/gitleaks/gitleaks-action/releases
> - semgrep image: `docker pull returntocorp/semgrep:latest && docker inspect returntocorp/semgrep:latest --format '{{index .RepoDigests 0}}'`
> - osv-scanner-action: https://github.com/google/osv-scanner-action/releases
>
> Si algún SHA está obsoleto, Dependabot lo actualizará en su primera pasada. Si en la primera ejecución alguna action no resuelve, sustituir el SHA por el actual del comentario de versión.

- [ ] **Step 2: Validar SHAs reales antes de pushear**

Para cada action no nativa de actions/\* (gitleaks, semgrep, osv), abrir su release page y reemplazar el SHA en el archivo por el real correspondiente al tag indicado en el comentario.

- [ ] **Step 3: Validar YAML**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/security.yml')); print('jobs:', list(d['jobs'].keys()))"`
Expected: `jobs: ['gitleaks', 'semgrep', 'owasp', 'osv']`

Run (si actionlint disponible): `actionlint .github/workflows/security.yml`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "ci: security workflow (gitleaks, semgrep, owasp dep-check, osv)"
```

---

## Task 9: Crear `.github/workflows/trivy.yml`

**Files:**

- Create: `.github/workflows/trivy.yml`

- [ ] **Step 1: Crear `.github/workflows/trivy.yml`**

Contenido exacto:

```yaml
name: Trivy

# Escaneo de imágenes Docker y filesystem.
# Los jobs de imagen están condicionados a que existan los Dockerfiles
# (se añadirán cuando las apps tengan despliegue propio). Por ahora solo
# el filesystem-scan está activo.

on:
  push:
    branches: [main]
    paths:
      - '**/Dockerfile'
      - '**/package.json'
      - 'pnpm-lock.yaml'
      - '.github/workflows/trivy.yml'
  pull_request:
    branches: [main]
    paths:
      - '**/Dockerfile'
      - '**/package.json'
      - 'pnpm-lock.yaml'
  schedule:
    # Escaneo semanal para capturar CVEs nuevas en la imagen base.
    - cron: '0 7 * * 1'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions: {}

jobs:
  # -----------------------------------------------------------------------
  # Escaneo de imágenes Docker
  # TODO (despliegue): Activar cuando existan los Dockerfiles.
  # Job image-scan con matrix:
  #   - app: qrush-api,        dockerfile: apps/api/Dockerfile
  #   - app: qrush-tpv,        dockerfile: apps/tpv/Dockerfile
  #   - app: qrush-backoffice, dockerfile: apps/backoffice/Dockerfile
  # -----------------------------------------------------------------------

  # -----------------------------------------------------------------------
  # Escaneo del filesystem: dependencias npm + secretos + misconfiguraciones
  # Activo desde el primer commit.
  # -----------------------------------------------------------------------
  filesystem-scan:
    name: Scan filesystem (deps + secrets + misconfig)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      security-events: write
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Cache Trivy DB
        uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v4
        with:
          path: ~/.cache/trivy
          key: trivy-db-${{ github.run_id }}
          restore-keys: |
            trivy-db-

      - name: Run Trivy gate (CRITICAL,HIGH)
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          scan-type: fs
          scan-ref: .
          format: table
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: '1'
          scanners: vuln,secret,misconfig
          skip-dirs: node_modules,build,dist,data,coverage
          trivyignores: .trivyignore.yaml

      - name: Run Trivy SARIF report
        if: always()
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          scan-type: fs
          scan-ref: .
          format: sarif
          output: trivy-fs.sarif
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          trivyignores: .trivyignore.yaml
          skip-dirs: node_modules,build,dist,data,coverage

      - name: Upload SARIF
        if: always()
        continue-on-error: true
        uses: github/codeql-action/upload-sarif@9e0d7b8d25671d64c341c19c0152d693099fb5ba # v4.35.5
        with:
          sarif_file: trivy-fs.sarif
          category: trivy-fs
```

- [ ] **Step 2: Validar YAML**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/trivy.yml')); print('jobs:', list(d['jobs'].keys()))"`
Expected: `jobs: ['filesystem-scan']`

Run (si actionlint disponible): `actionlint .github/workflows/trivy.yml`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/trivy.yml
git commit -m "ci: trivy filesystem scan + SARIF upload"
```

---

## Task 10: Configurar secrets en GitHub (manual)

**Files:** ninguno (acción en la UI de GitHub)

Esta tarea no toca el repo. La hace el usuario en GitHub. Documentada aquí para no olvidarla — sin ella, el deploy job falla.

- [ ] **Step 1: Verificar que el repo existe en GitHub**

Si el repo no se ha creado todavía en GitHub, crearlo (privado o público según prefiera el usuario) y pushear el branch `main`.

Run:

```bash
git remote -v
```

Expected: muestra `origin` apuntando a `git@github.com:<user>/qrush_tpv.git` o equivalente HTTPS.

- [ ] **Step 2: Añadir `DOKPLOY_WEBHOOK_URL`**

En la UI de GitHub: `Settings → Secrets and variables → Actions → New repository secret`.

- Name: `DOKPLOY_WEBHOOK_URL`
- Value: la URL del webhook de Dokploy (copiada desde el panel Dokploy del servicio qrush_tpv).

- [ ] **Step 3: (Opcional) Añadir `NVD_API_KEY`**

Si el usuario tiene una API key del NVD (https://nvd.nist.gov/developers/request-an-api-key), añadirla como secret `NVD_API_KEY`. Sin ella, OWASP funciona pero más lento.

- [ ] **Step 4: Verificar que los secrets están listados**

En `Settings → Secrets and variables → Actions`, comprobar que aparece `DOKPLOY_WEBHOOK_URL` (y `NVD_API_KEY` si se añadió).

---

## Task 11: Validación end-to-end con PR de prueba

**Files:** ninguno permanente; un cambio trivial temporal.

- [ ] **Step 1: Crear branch de prueba**

Run:

```bash
git checkout -b chore/ci-smoke-test
echo "" >> README.md
git add README.md
git commit -m "chore: smoke test CI"
git push -u origin chore/ci-smoke-test
```

Si `README.md` no existe, crearlo con una línea:

```bash
echo "# qrush_tpv" > README.md
git add README.md
git commit -m "chore: smoke test CI (add readme)"
```

- [ ] **Step 2: Abrir PR en GitHub**

Run: `gh pr create --base main --head chore/ci-smoke-test --title "chore: smoke test CI" --body "Validación inicial de los workflows."`

Si `gh` no está instalado o no autenticado: abrir el PR manualmente en la UI de GitHub.

- [ ] **Step 3: Observar los checks del PR**

En la UI del PR, comprobar que aparecen y verdean (o fallan con razón conocida):

- `CI / Lint, typecheck, tests y build` → debe verdear (gate completo).
- `CI / E2E smoke test (Playwright)` → puede verdear o fallar si todavía no hay tests E2E reales. Si falla por "no tests found", es esperado en una fase inicial — anotar y continuar.
- `Security / Gitleaks (secrets)` → debe verdear.
- `Security / Semgrep (SAST)` → debe verdear.
- `Security / OWASP Dependency-Check` → debe verdear (puede tardar 10-15 min).
- `Security / OSV Scanner (pnpm-lock)` → debe verdear.
- `Trivy / Scan filesystem` → debe verdear (puede no dispararse si los paths del trigger no cambiaron — ese es comportamiento correcto).

- [ ] **Step 4: Diagnosticar fallos genuinos**

Si algún job falla por bug del workflow (no por findings legítimos de seguridad), corregir el archivo en el branch y volver a pushear. Repetir hasta que verdee.

Fallos esperados/aceptables en esta primera ejecución:

- `Coverage ratchet (gate)` imprimiendo "sin cobertura instrumentada todavía — ratchet omitido" → OK.
- `e2e` fallando con "no tests found" → OK si todavía no hay E2E.

Fallos no aceptables:

- YAML inválido → corregir.
- Action no resuelve por SHA inexistente → actualizar SHA al actual del tag de la release.
- Comando no encontrado (`pnpm`, `node`, `prisma`) → revisar el orden de los setup steps.

- [ ] **Step 5: Mergear el PR**

Una vez verde:

```bash
gh pr merge chore/ci-smoke-test --squash --delete-branch
```

O manualmente en la UI.

- [ ] **Step 6: Verificar disparo de `ratchet` y `deploy` en main**

Tras el merge, ir a la pestaña Actions del repo. Confirmar:

- El run de `CI` en el push a main ejecuta `quality` → `ratchet` → `e2e` → `deploy`.
- El job `ratchet` o bien no hace nada (no había cobertura) o crea automáticamente un commit `chore: ratchet coverage floor [skip ci]` que aparece en `git log` de `main`.
- El job `deploy` registra `Webhook HTTP 2XX tras N redirección(es)` y `Redeploy disparado.`. Si devuelve 401/403/404, el secret está mal configurado — revisar Task 10.

- [ ] **Step 7: Verificar SARIF en pestaña Security**

En la UI: `Security → Code scanning`. Tras unos minutos del run de Trivy, debe aparecer categoría `trivy-fs` (puede que sin findings, lo cual es OK).

- [ ] **Step 8: Verificar que Dependabot está habilitado**

En la UI: `Insights → Dependency graph → Dependabot`. Debe mostrar las dos entradas activas (npm y github-actions) que `.github/dependabot.yml` declara. El primer PR de Dependabot llegará el siguiente lunes a las 08:00 UTC.

---

## Self-review (ejecutado al escribir el plan)

**1. Cobertura del spec:**

- §5.1 ci.yml quality/ratchet/e2e/deploy → Tasks 4, 5, 6, 7. ✓
- §5.2 security.yml → Task 8. ✓
- §5.3 trivy.yml → Task 9. ✓
- §6 dependabot.yml → Task 3. ✓
- §7 CODEOWNERS → Task 3. ✓
- §8.1–8.7 hooks/configs raíz → Tasks 1, 2. ✓
- §9 secrets → Task 10. ✓
- §10 validación → Task 11. ✓
- §3 prerequisitos → Task 0 (gate). ✓

**2. Placeholders:**

- Task 3 step 1 acepta `@OWNER-HANDLE-PENDIENTE` como sentinela explícito si el handle no se obtiene en el momento — esto es deliberado y trazable, no un TBD oculto.
- Task 8 SHAs orientativos de gitleaks/semgrep/osv tienen instrucción explícita de verificar/actualizar en Step 2 antes de commitear. Aceptable porque GitHub Actions cambia con el tiempo y este plan puede ejecutarse meses después.
- No quedan TODOs internos sin acción concreta.

**3. Consistencia de tipos/nombres:**

- `@qrush/api`, `@qrush/tpv`, `@qrush/backoffice`, `@qrush/db` usados consistentemente en todos los workflows y tareas.
- `coverage-threshold.json` con clave `api.statements` consistente entre Task 1 step 5, ci.yml quality (Task 4), ci.yml ratchet (Task 5).
- `apps/api/coverage/coverage-summary.json` consistente entre Tasks 4 y 5.
- `DOKPLOY_WEBHOOK_URL` consistente entre Task 7 y Task 10.

Sin gaps detectados.
