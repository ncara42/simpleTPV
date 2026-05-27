# F1 — Skeleton Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inicializar `qrush_tpv` como monorepo TypeScript con Turborepo + pnpm workspaces, ESLint flat + Prettier + tsconfig compartido, y stubs vacíos de los 4 workspaces que F2-F4 llenarán.

**Architecture:** Configs en la raíz (ESLint, Prettier, tsconfig.base.json, turbo.json), workspaces stub con `package.json` mínimo en `apps/api`, `apps/tpv`, `apps/backoffice`, `packages/db`. Scripts raíz envolventes — `build/typecheck/test/test:e2e` por Turborepo, `lint/format` por binarios directos.

**Tech Stack:** Node 22 LTS, pnpm 11, TypeScript 6, ESLint 10 (flat config), Prettier 3, Turborepo 2, typescript-eslint 8.

**Spec de referencia:** `docs/superpowers/specs/2026-05-28-f1-skeleton-monorepo-design.md`

---

## Convenciones del plan

- **Rutas:** todas absolutas a `/Users/admin/Desktop/qrush_tpv/`.
- **Commits:** Conventional Commits, uno por tarea (o agrupado donde tiene sentido).
- **Verificación:** cada tarea de creación de archivos termina validando que el resultado existe y/o pasa los checks correspondientes.
- **Node activo:** se asume `nvm use 22` antes de empezar. Si no, el primer comando de Task 0 lo detecta.

---

## File Structure

Archivos que crea este plan, agrupados por responsabilidad:

| Path                           | Responsabilidad                   | Tarea |
| ------------------------------ | --------------------------------- | ----- |
| `.git/`                        | Repositorio git                   | T1    |
| `.gitignore`                   | Excluir build/deps/secrets        | T2    |
| `.editorconfig`                | Convenciones de editor            | T2    |
| `.nvmrc`                       | Versión Node fija                 | T2    |
| `.npmrc`                       | Config pnpm estricta              | T2    |
| `.prettierrc.json`             | Estilo Prettier                   | T3    |
| `.prettierignore`              | Paths fuera de Prettier           | T3    |
| `package.json`                 | Manifest raíz + scripts + devDeps | T4    |
| `pnpm-workspace.yaml`          | Declaración de workspaces         | T4    |
| `apps/api/package.json`        | Stub @qrush/api                   | T5    |
| `apps/tpv/package.json`        | Stub @qrush/tpv                   | T5    |
| `apps/backoffice/package.json` | Stub @qrush/backoffice            | T5    |
| `packages/db/package.json`     | Stub @qrush/db                    | T5    |
| `tsconfig.base.json`           | Compiler options compartidas      | T6    |
| `tsconfig.json`                | References a workspaces (raíz)    | T6    |
| `eslint.config.js`             | ESLint 10 flat config raíz        | T7    |
| `turbo.json`                   | Pipelines Turborepo               | T8    |
| `README.md`                    | Doc de arranque                   | T9    |
| `CLAUDE.md`                    | Instrucciones para agentes        | T9    |
| `.github/.gitkeep`             | Carpeta vacía reservada para CI   | T9    |

---

## Task 1: Inicializar git

**Files:**

- Create: `.git/` (vía `git init`)

- [ ] **Step 1: Verificar Node 22 activo**

Run:

```bash
cd /Users/admin/Desktop/qrush_tpv && node --version
```

Expected: `v22.x.x`.

Si no es 22.x: `nvm install 22 && nvm use 22`. Si `nvm` no está, instalar nvm o cambiar a Node 22 por otro medio antes de continuar.

- [ ] **Step 2: Verificar pnpm 11+**

Run: `pnpm --version`
Expected: `11.x.x` o superior.

Si no, ejecutar `npm install -g pnpm@11`.

- [ ] **Step 3: Inicializar repo git con branch `main`**

Run:

```bash
cd /Users/admin/Desktop/qrush_tpv && git init -b main
```

Expected: `Initialized empty Git repository in /Users/admin/Desktop/qrush_tpv/.git/`.

- [ ] **Step 4: Verificar que el branch por defecto es `main`**

Run: `git symbolic-ref HEAD`
Expected: `refs/heads/main`.

---

## Task 2: Configs de entorno del repo (gitignore, editorconfig, nvmrc, npmrc)

**Files:**

- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `.npmrc`

- [ ] **Step 1: Crear `.gitignore`**

Contenido exacto:

```
# Dependencias
node_modules/

# Builds
dist/
build/
.next/
out/

# Coverage / test
coverage/
playwright-report/
test-results/
*.lcov

# Logs y tmp
*.log
.DS_Store
.vite/
.turbo/

# Entorno
.env
.env.*.local
!.env.example

# IDE
.vscode/
.idea/

# Prisma
**/generated/

# Misc
*.tsbuildinfo
```

- [ ] **Step 2: Crear `.editorconfig`**

Contenido exacto:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Crear `.nvmrc`**

Contenido exacto (una sola línea + newline final):

```
22
```

- [ ] **Step 4: Crear `.npmrc`**

Contenido exacto:

```
strict-peer-dependencies=true
auto-install-peers=true
engine-strict=true
shamefully-hoist=false
```

- [ ] **Step 5: Verificar los 4 archivos**

Run:

```bash
ls -la .gitignore .editorconfig .nvmrc .npmrc && cat .nvmrc
```

Expected: los 4 archivos listados, `.nvmrc` muestra `22`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .editorconfig .nvmrc .npmrc
git commit -m "chore: env configs (gitignore, editorconfig, nvmrc, npmrc)"
```

---

## Task 3: Prettier (config + ignore)

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Crear `.prettierrc.json`**

Contenido exacto:

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "semi": true
}
```

- [ ] **Step 2: Crear `.prettierignore`**

Contenido exacto:

```
node_modules
dist
build
coverage
.next
.turbo
*.generated.*
pnpm-lock.yaml
apps/*/playwright-report
apps/*/test-results
**/generated/
```

- [ ] **Step 3: Commit**

```bash
git add .prettierrc.json .prettierignore
git commit -m "chore: configurar prettier"
```

---

## Task 4: `package.json` raíz + `pnpm-workspace.yaml`

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Crear `pnpm-workspace.yaml`**

Contenido exacto:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Crear `package.json` raíz**

Contenido exacto:

```json
{
  "name": "qrush-tpv",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22",
    "pnpm": ">=11"
  },
  "packageManager": "pnpm@11.1.3",
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:write": "prettier --write .",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "knip": "knip",
    "prepare": "husky"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.0",
    "eslint": "^10.0.0",
    "eslint-config-prettier": "^10.0.0",
    "eslint-plugin-simple-import-sort": "^13.0.0",
    "eslint-plugin-unused-imports": "^4.0.0",
    "prettier": "^3.0.0",
    "turbo": "^2.0.0",
    "typescript": "^6.0.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

- [ ] **Step 3: Validar JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Instalar dependencias**

Run: `pnpm install`
Expected: sin errores. Genera `pnpm-lock.yaml` y `node_modules/`. Reconoce los 4 workspaces (los crearemos en Task 5; en este punto solo `apps/*` y `packages/*` están vacíos, lo cual pnpm acepta).

> **Si pnpm avisa de `WARN  No projects matched the filters in ...`:** es esperado en este paso porque aún no hay package.json en los workspaces. No bloquea. Si en cambio pnpm aborta por `strict-peer-dependencies`, anotar la dep concreta que falla y resolverla añadiendo el peer faltante a devDependencies (no relajar `strict-peer-dependencies`).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: package.json raíz + pnpm workspace + devDeps base"
```

---

## Task 5: Stubs de workspaces

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/tpv/package.json`
- Create: `apps/backoffice/package.json`
- Create: `packages/db/package.json`

- [ ] **Step 1: Crear carpetas**

Run:

```bash
mkdir -p apps/api apps/tpv apps/backoffice packages/db
```

- [ ] **Step 2: Crear `apps/api/package.json`**

Contenido exacto:

```json
{
  "name": "@qrush/api",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 3: Crear `apps/tpv/package.json`**

Contenido exacto:

```json
{
  "name": "@qrush/tpv",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 4: Crear `apps/backoffice/package.json`**

Contenido exacto:

```json
{
  "name": "@qrush/backoffice",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 5: Crear `packages/db/package.json`**

Contenido exacto:

```json
{
  "name": "@qrush/db",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 6: Verificar que pnpm reconoce los 4 workspaces**

Run: `pnpm -r exec node -e "console.log(require('./package.json').name)"`
Expected output (orden puede variar):

```
@qrush/api
@qrush/backoffice
@qrush/db
@qrush/tpv
```

- [ ] **Step 7: Reinstalar para enlazar workspaces**

Run: `pnpm install`
Expected: sin warnings de "no projects matched". `pnpm-lock.yaml` actualizado si cambió algo.

- [ ] **Step 8: Commit**

```bash
git add apps packages pnpm-lock.yaml
git commit -m "chore: stubs de workspaces (@qrush/api|tpv|backoffice|db)"
```

---

## Task 6: TypeScript base + raíz

**Files:**

- Create: `tsconfig.base.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Crear `tsconfig.base.json`**

Contenido exacto:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 2: Crear `tsconfig.json` (raíz)**

Contenido exacto:

```json
{
  "files": [],
  "references": [
    { "path": "./apps/api" },
    { "path": "./apps/tpv" },
    { "path": "./apps/backoffice" },
    { "path": "./packages/db" }
  ]
}
```

- [ ] **Step 3: Validar JSON de ambos**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('tsconfig.base.json','utf8'))" && \
node -e "JSON.parse(require('fs').readFileSync('tsconfig.json','utf8'))" && \
echo OK
```

Expected: `OK`.

- [ ] **Step 4: Verificar que TypeScript está instalado**

Run: `pnpm exec tsc --version`
Expected: `Version 6.x.x` (la major es 6; minor/patch puede variar).

> **Nota:** NO ejecutar `tsc --build` aquí. El `tsconfig.json` raíz tiene references a workspaces que aún no tienen su propio `tsconfig.json` (los crean F2-F4). Esto es esperado y documentado en el spec §5.9. El comando `pnpm typecheck` no rompe porque va por Turborepo, que itera workspaces y omite los que no declaran ese script.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json tsconfig.json
git commit -m "chore: tsconfig base compartido + references raíz"
```

---

## Task 7: ESLint 10 flat config

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Crear `eslint.config.js`**

Contenido exacto:

```js
// ESLint 10 flat config. Reglas mínimas en F1: TS recommended + import sort
// + unused-imports + prettier. Reglas específicas de React, NestJS o
// seguridad las añaden F3/F4 en sus propios archivos override.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.next',
      '.turbo',
      '**/generated/**',
      '**/*.generated.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  prettier,
);
```

- [ ] **Step 2: Ejecutar lint sobre el repo**

Run: `pnpm lint`
Expected: sin errores. Como no hay archivos `.ts` aún, salida tipo `> eslint .` seguida de prompt vacío (0 problems).

> **Si rompe con `Cannot find package '@eslint/js'`:** la instalación de Task 4 no incluyó la dep. Ejecutar `pnpm install` de nuevo y reintentar. Si persiste, revisar `package.json` raíz contra Task 4 step 2.

- [ ] **Step 3: Ejecutar prettier check sobre el repo**

Run: `pnpm format`
Expected: `All matched files use Prettier code style!` o equivalente.

> **Si rompe por algún archivo mal formateado** (p.ej. un `.md` con líneas largas): ejecutar `pnpm format:write` para auto-corregir y volver a `pnpm format`. Si rompe en archivos pre-existentes (`PRD_TPV_Multitienda.md`, `Plan_Desarrollo_MVP.md`), añadirlos a `.prettierignore` antes que reformatearlos (son documentos vivos del usuario).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore: eslint 10 flat config (ts + import sort + unused + prettier)"
```

---

## Task 8: Turborepo

**Files:**

- Create: `turbo.json`

- [ ] **Step 1: Crear `turbo.json`**

Contenido exacto:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**", ".next/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "outputs": ["playwright-report/**", "test-results/**"]
    }
  }
}
```

- [ ] **Step 2: Verificar que turbo arranca**

Run: `pnpm exec turbo --version`
Expected: `2.x.x`.

- [ ] **Step 3: Ejecutar `pnpm build`**

Run: `pnpm build`
Expected: Turborepo corre `turbo run build`. Como ningún workspace declara script `build`, salida tipo:

```
 Tasks:    0 successful, 0 total
Cached:    0 cached, 0 total
  Time:    ...
```

Sale con código 0.

> **Si Turborepo se queja con "No tasks were executed":** es comportamiento normal en este punto y sale con 0. Si en cambio falla con código distinto de 0, revisar `turbo.json`.

- [ ] **Step 4: Commit**

```bash
git add turbo.json
git commit -m "chore: turborepo pipelines (build/typecheck/test/test:e2e)"
```

---

## Task 9: Docs base + reserva de `.github/`

**Files:**

- Create: `README.md`
- Create: `CLAUDE.md`
- Create: `.github/.gitkeep`

- [ ] **Step 1: Crear `README.md`**

Contenido exacto:

````markdown
# qrush_tpv

TPV multitienda SaaS — monorepo TypeScript.

## Requisitos

- Node 22 (`nvm use`)
- pnpm 11+

## Arranque

```bash
pnpm install
pnpm lint
pnpm format
pnpm build
```

## Estructura

- `apps/api` — Backend NestJS 11
- `apps/tpv` — Frontend TPV (React 19 + Vite 6)
- `apps/backoffice` — Frontend Backoffice (React 19 + Vite 6)
- `packages/db` — Schema Prisma + cliente compartido

## Documentación

- `PRD_TPV_Multitienda.md` — Producto y requisitos
- `Plan_Desarrollo_MVP.md` — Cronograma y stack detallado
- `docs/superpowers/` — Specs y planes de implementación
````

- [ ] **Step 2: Crear `CLAUDE.md`**

Contenido exacto:

```markdown
# Instrucciones para agentes Claude en qrush_tpv

## Idioma

- Español de España (tuteo peninsular, nunca voseo).
- Términos técnicos y identificadores en su forma original.

## Stack

- TypeScript end-to-end, Node 22, pnpm 11.
- Monorepo Turborepo + pnpm workspaces.
- Backend: NestJS 11 + Prisma 6 + PostgreSQL 16.
- Frontends: React 19 + Vite 6 (apps/tpv y apps/backoffice).
- Tests: Vitest (api), Playwright (frontends).

## Convenciones

- Conventional Commits.
- Antes de tocar código, leer el archivo relevante; preferir edits a reescrituras.
- No mocks de BD en tests de integración — usar Postgres efímero.
- ESLint flat config raíz aplica a todo el monorepo; cada workspace puede sobreescribir.
- `tsconfig.base.json` en raíz; cada workspace extiende.

## Scripts raíz

- `pnpm lint`, `pnpm format`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
- Build/test/typecheck van por Turborepo (cache local activado).

## Documentación viva

- Specs en `docs/superpowers/specs/`.
- Planes de implementación en `docs/superpowers/plans/`.
- PRD y plan MVP en raíz (`PRD_TPV_Multitienda.md`, `Plan_Desarrollo_MVP.md`).
```

- [ ] **Step 3: Crear `.github/.gitkeep`**

Run:

```bash
mkdir -p .github && touch .github/.gitkeep
```

> **Por qué `.gitkeep`:** la carpeta `.github/` la llenará el plan de CI ya escrito. Tenerla en git desde F1 evita que el plan de CI necesite crearla y deja claro que está reservada.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md .github/.gitkeep
git commit -m "docs: readme + claude.md + reserva de .github"
```

---

## Task 10: Validación de cierre de F1

**Files:** ninguno permanente; solo verificación.

- [ ] **Step 1: Verificar git inicializado en `main`**

Run:

```bash
git rev-parse --is-inside-work-tree && git symbolic-ref HEAD
```

Expected:

```
true
refs/heads/main
```

- [ ] **Step 2: Verificar que `pnpm install` está limpio**

Run: `pnpm install`
Expected: `Already up to date` o equivalente, sin warnings de strict-peer.

- [ ] **Step 3: Verificar `pnpm lint`**

Run: `pnpm lint`
Expected: salida limpia, exit 0.

- [ ] **Step 4: Verificar `pnpm format`**

Run: `pnpm format`
Expected: `All matched files use Prettier code style!` o equivalente, exit 0.

- [ ] **Step 5: Verificar `pnpm build`**

Run: `pnpm build`
Expected: Turborepo corre sin tareas reales (ningún workspace declara `build` aún), exit 0.

- [ ] **Step 6: Verificar workspaces declarados**

Run: `pnpm -r exec node -e "console.log(require('./package.json').name)"`
Expected: lista que incluye los 4 workspaces (`@qrush/api`, `@qrush/backoffice`, `@qrush/db`, `@qrush/tpv`).

- [ ] **Step 7: Verificar git log**

Run: `git log --oneline`
Expected: al menos 8 commits (uno por cada Task 1-9 con cambios).

- [ ] **Step 8: Verificar que no quedan archivos sin trackear**

Run: `git status --porcelain`
Expected: salida vacía (todo commiteado).

> **Si quedan archivos sin trackear (típicamente `node_modules/` o `.turbo/` no listados en `.gitignore`):** revisar `.gitignore` y completar. NO commitear `node_modules/`.

---

## Self-review (ejecutado al escribir el plan)

**1. Cobertura del spec:**

| Spec §                      | Cubierto por                            |
| --------------------------- | --------------------------------------- |
| §4 estructura completa      | Tasks 1-9 (cada archivo tiene una task) |
| §5.1 `.gitignore`           | T2 step 1                               |
| §5.2 `.editorconfig`        | T2 step 2                               |
| §5.3 `.nvmrc`               | T2 step 3                               |
| §5.4 `.npmrc`               | T2 step 4                               |
| §5.5 `.prettierrc.json`     | T3 step 1                               |
| §5.6 `.prettierignore`      | T3 step 2                               |
| §5.7 `eslint.config.js`     | T7 step 1                               |
| §5.8 `tsconfig.base.json`   | T6 step 1                               |
| §5.9 `tsconfig.json` (raíz) | T6 step 2                               |
| §5.10 `turbo.json`          | T8 step 1                               |
| §5.11 `pnpm-workspace.yaml` | T4 step 1                               |
| §5.12 `package.json` raíz   | T4 step 2                               |
| §5.13 stubs                 | T5                                      |
| §5.14 `README.md`           | T9 step 1                               |
| §5.15 `CLAUDE.md`           | T9 step 2                               |
| §6 validación cierre        | T10                                     |
| §8 definición de done       | T10 (todos los checks listados)         |

Sin gaps.

**2. Placeholder scan:**

- Ninguna ocurrencia de "TBD", "TODO", "implement later", "appropriate", "handle edge cases" sin contenido.
- Las "notas" de los pasos (`> Nota:`) describen comportamientos esperados explícitos, no diferimientos.
- T6 step 4 documenta explícitamente por qué no se ejecuta `tsc --build` (referenciando spec §5.9).
- T9 step 3 documenta por qué se crea `.gitkeep`.

**3. Consistencia de tipos/nombres:**

- Nombres de workspace `@qrush/api`, `@qrush/tpv`, `@qrush/backoffice`, `@qrush/db` consistentes en T4, T5, T6, T10.
- Scripts del `package.json` raíz declarados en T4 step 2 y consumidos en T7, T8, T10 sin divergencias.
- Versiones `^x.0.0` consistentes en T4 step 2 (pisos mínimos) — la resolución real queda en `pnpm-lock.yaml`.

Sin issues detectados.
