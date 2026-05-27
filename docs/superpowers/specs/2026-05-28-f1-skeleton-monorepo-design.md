# Spec — F1: Skeleton del monorepo + tooling base

| Campo       | Valor                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fecha       | 2026-05-28                                                                                                                                       |
| Autor       | noel@noelcaravaca.com                                                                                                                            |
| Estado      | Aprobado para implementación                                                                                                                     |
| Fase        | F1 (de 4 de scaffolding) — precede a F2 (db), F3 (api), F4 (frontends), y al plan de CI ya escrito                                               |
| Referencias | `Plan_Desarrollo_MVP.md` §1 (Stack) y §3 (Estructura del monorepo); `docs/superpowers/specs/2026-05-28-ci-pipeline-design.md` §3 (prerequisitos) |

## 1. Objetivo

Inicializar el repositorio `simpletpv` como **monorepo TypeScript** con Turborepo + pnpm workspaces, ESLint flat + Prettier + tsconfig compartido, y stubs vacíos de los 4 workspaces que F2-F4 llenarán. Al cerrar F1, un dev puede clonar el repo y ejecutar `pnpm install && pnpm lint && pnpm format && pnpm typecheck && pnpm build` en verde sin errores.

F1 entrega el **esqueleto** y las **reglas del juego** del monorepo. Sin código de aplicación; sin DB; sin CI. Solo la base sobre la que se asentarán las fases siguientes.

## 2. Alcance

**Incluido:**

- `git init` y primer commit con la base ya completa.
- Archivos raíz de configuración: `.gitignore`, `.editorconfig`, `.nvmrc`, `.npmrc`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `tsconfig.base.json`, `tsconfig.json`, `turbo.json`, `pnpm-workspace.yaml`, `package.json`, `README.md`, `CLAUDE.md`.
- Carpetas y stubs de los 4 workspaces: `apps/api/`, `apps/tpv/`, `apps/backoffice/`, `packages/db/`, cada uno con `package.json` mínimo (`name`, `version`, `private`, scripts placeholder que no rompen pero no hacen nada útil aún).
- `.github/` vacío (la carpeta existe pero no contiene workflows; los workflows los crea el plan de CI ya escrito).

**Excluido:**

- Husky / lint-staged / Knip / Gitleaks → los activa el plan de CI en su Task 2.
- Schema Prisma, Postgres, docker-compose → F2.
- NestJS, Vitest config, healthcheck, lógica de negocio → F3.
- Vite, React, Playwright, Zustand, TanStack Query → F4.
- GitHub Actions workflows, secrets, Dokploy → plan de CI ya escrito.
- Implementación de funcionalidad del PRD (ventas, stock, traspasos, etc.).
- `packages/shared` — YAGNI. Se crea cuando F3 o F4 necesiten compartir tipos reales.
- `packages/config` como workspace publicable interno — YAGNI. Las configs viven en la raíz y los workspaces extienden.

## 3. Decisiones explícitas

| #      | Decisión                                                           | Justificación                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-D1  | Node **22 LTS** (no 24)                                            | Mismo motivo que el spec de CI: estabilidad en GitHub-hosted runners y compatibilidad madura con NestJS 11 y Prisma 6.                                                                             |
| F1-D2  | TypeScript **6.x**                                                 | Última estable a fecha 2026-05. Soporta `exactOptionalPropertyTypes` maduro.                                                                                                                       |
| F1-D3  | ESLint **10.x** con flat config                                    | Estándar moderno; ESLint 9 ya forzó flat config y plugins/configs del ecosistema se han adaptado.                                                                                                  |
| F1-D4  | Turborepo completo desde F1                                        | El MVP ya lo decidió. Configurarlo desde el inicio evita migrar después; cache local activado.                                                                                                     |
| F1-D5  | `tsconfig` base en raíz + cada workspace extiende                  | Sin `packages/config`. Menos ceremonia, menos workspaces, alineado con el patrón de vivienda.                                                                                                      |
| F1-D6  | `composite: true` y `declaration: true` en base                    | Habilita TypeScript project references → `tsc --build` cross-workspace; `packages/db` puede ser referenciado por tipos desde `apps/api` sin recompilar todo.                                       |
| F1-D7  | `module: ESNext`, `moduleResolution: Bundler`                      | Moderno. NestJS 11 con SWC lo soporta; si F3 detecta fricción, override local en `apps/api/tsconfig.json`.                                                                                         |
| F1-D8  | `strict-peer-dependencies=true` en `.npmrc`                        | Detecta incompatibilidades de peers antes de runtime. Más estricto que el default.                                                                                                                 |
| F1-D9  | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` activados | Modo estricto profesional. NestJS y Vite los soportan sin problema.                                                                                                                                |
| F1-D10 | `.editorconfig` con 2 espacios, LF, UTF-8                          | Evita ruido de PRs entre editores distintos.                                                                                                                                                       |
| F1-D11 | `CLAUDE.md` en raíz                                                | Otros agentes Claude que toquen el repo heredan convenciones (idioma, scripts, no voseo, etc.). Práctica establecida en otros repos del usuario.                                                   |
| F1-D12 | Workspaces stub con `package.json` mínimo                          | `pnpm install` no avisa de globs vacíos; F2-F4 llenan cada stub sin renombrar nada.                                                                                                                |
| F1-D13 | `eslint-plugin-security` NO se incluye en F1                       | Vivienda lo tiene; aquí lo posponemos a F3 cuando exista código de servidor real. F1 mantiene plugins mínimos.                                                                                     |
| F1-D14 | `lint` y `format` invocan binarios directos (no `turbo run`)       | ESLint flat config raíz ya cubre todo el monorepo en una pasada; Turborepo añadiría overhead sin valor. Solo `build`/`typecheck`/`test`/`test:e2e` van por Turborepo.                              |
| F1-D15 | Scripts de Husky (`prepare`) declarados ya en F1                   | El binario lo instala el plan de CI Task 2; tenerlo en `package.json` desde F1 hace que el hook se cree automáticamente cuando se instale husky. Cero cambio en F1 si no se ejecuta el plan de CI. |

## 4. Estructura de archivos al cerrar F1

```
simpletpv/
├── .git/                            (git init)
├── .github/                         (vacío de momento; lo llena el plan de CI)
├── .gitignore
├── .editorconfig
├── .nvmrc                           → "22"
├── .npmrc
├── .prettierrc.json
├── .prettierignore
├── eslint.config.js
├── tsconfig.base.json
├── tsconfig.json                    (raíz, references a workspaces)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── README.md
├── CLAUDE.md
├── PRD_TPV_Multitienda.md           (preexistente; no se mueve)
├── Plan_Desarrollo_MVP.md           (preexistente; no se mueve)
├── docs/
│   └── superpowers/                 (preexistente; specs y plans)
├── apps/
│   ├── api/
│   │   └── package.json             (stub @simpletpv/api)
│   ├── tpv/
│   │   └── package.json             (stub @simpletpv/tpv)
│   └── backoffice/
│       └── package.json             (stub @simpletpv/backoffice)
└── packages/
    └── db/
        └── package.json             (stub @simpletpv/db)
```

## 5. Contenido de cada archivo

### 5.1 `.gitignore`

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

### 5.2 `.editorconfig`

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

### 5.3 `.nvmrc`

```
22
```

### 5.4 `.npmrc`

```
strict-peer-dependencies=true
auto-install-peers=true
engine-strict=true
shamefully-hoist=false
```

### 5.5 `.prettierrc.json`

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "semi": true
}
```

### 5.6 `.prettierignore`

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

### 5.7 `eslint.config.js`

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

### 5.8 `tsconfig.base.json`

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

### 5.9 `tsconfig.json` (raíz, solo references)

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

> **Nota de F1:** los referenced paths `./apps/api`, etc., deben tener cada uno su propio `tsconfig.json` para que `tsc --build` funcione. F1 NO los crea (los crea cada fase F2-F4 al llenar su workspace). Para que F1 no rompa, el `tsconfig.json` raíz solo se usa cuando se ejecuta `tsc --build`, y `tsc --build` no se invoca en F1 (no hay script `typecheck` en raíz que lo llame directamente — va por Turborepo). El `pnpm typecheck` de F1 ejecuta `turbo run typecheck`, que itera por workspaces; los stubs no declaran ese script, así que Turborepo lo omite. Resultado: F1 verdea sin `tsconfig` por workspace.

### 5.10 `turbo.json`

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

### 5.11 `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 5.12 `package.json` (raíz)

```json
{
  "name": "simpletpv",
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

**Versiones:** los `^x.0.0` son pisos mínimos. `pnpm install` resolverá a la última compatible. Las versiones concretas quedan congeladas en `pnpm-lock.yaml` y Dependabot las actualiza después.

**`knip` y `husky`:** referenciados en scripts pero no añadidos como devDependency en F1. El plan de CI Task 2 los instala. Mientras tanto, los scripts `knip` y `prepare` fallarán si se invocan, lo cual es aceptable porque F1 no los invoca en su verificación.

### 5.13 Stubs de workspaces

Cada uno con el mismo patrón mínimo, sustituyendo `<name>`:

`apps/api/package.json`:

```json
{
  "name": "@simpletpv/api",
  "version": "0.0.0",
  "private": true
}
```

`apps/tpv/package.json`:

```json
{
  "name": "@simpletpv/tpv",
  "version": "0.0.0",
  "private": true
}
```

`apps/backoffice/package.json`:

```json
{
  "name": "@simpletpv/backoffice",
  "version": "0.0.0",
  "private": true
}
```

`packages/db/package.json`:

```json
{
  "name": "@simpletpv/db",
  "version": "0.0.0",
  "private": true
}
```

Sin scripts. Sin dependencias. F2-F4 los llenan.

### 5.14 `README.md`

````markdown
# simpletpv

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
````

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

### 5.15 `CLAUDE.md`

```markdown
# Instrucciones para agentes Claude en simpletpv

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
````

## 6. Validación del cierre de F1

Al cerrar F1, ejecutar desde la raíz (con Node 22 activo via `nvm use`):

```bash
pnpm install
pnpm lint
pnpm format
pnpm build
```

Resultado esperado:

| Comando        | Salida esperada                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` | Sin errores. Reconoce los 4 workspaces stub. `pnpm-lock.yaml` creado.                                                                                           |
| `pnpm lint`    | ESLint corre sobre el repo. Como no hay archivos `.ts` aún, output: `0 problems`.                                                                               |
| `pnpm format`  | Prettier valida todos los archivos JSON/YAML/MD del repo. `All matched files use Prettier code style!` o equivalente.                                           |
| `pnpm build`   | Turborepo ejecuta `turbo run build`. Como ningún stub declara script `build`, Turborepo reporta `>>> FULL TURBO` o `No tasks were executed`. Sale con código 0. |

`pnpm typecheck` se omite en F1 — los stubs no declaran ese script, Turborepo lo ignora, salida limpia.

`git log --oneline` debe mostrar al menos un commit con la base completa.

## 7. Riesgos y mitigaciones

| Riesgo                                                                       | Mitigación                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versiones `^x.0.0` resuelven a una major rompedora (TypeScript 7 hipotético) | `pnpm-lock.yaml` congela la versión real; Dependabot abre PRs visibles para actualizaciones major.                                                     |
| `module: ESNext` incompatible con NestJS 11 por defecto                      | F3 puede sobreescribir `module` en `apps/api/tsconfig.json`. Documentado en F1-D7.                                                                     |
| `strict-peer-dependencies=true` rompe `pnpm install` de alguna dep           | Se documenta y se ajusta deps. Mejor descubrirlo ahora que en producción.                                                                              |
| Plan de CI Task 2 espera `knip` y `husky` instalados                         | F1 declara los scripts en `package.json`; el plan de CI los añade como devDeps en su Task 2. No hay conflicto.                                         |
| Turborepo añade un binario pesado al `node_modules`                          | Aceptado. El MVP ya decidió Turborepo.                                                                                                                 |
| Falta de `tsconfig.json` por workspace rompe `tsc --build` desde raíz        | F1 no invoca `tsc --build` directo; va por Turborepo y los stubs no declaran `typecheck`. F3/F4 crean cada `tsconfig.json` cuando llenan su workspace. |

## 8. Definición de "done" para F1

- [ ] `git rev-parse --is-inside-work-tree` devuelve `true`.
- [ ] Todos los archivos de §4 existen con el contenido de §5.
- [ ] `pnpm install` ejecuta sin error.
- [ ] `pnpm lint` ejecuta sin error.
- [ ] `pnpm format` ejecuta sin error.
- [ ] `pnpm build` ejecuta sin error.
- [ ] `git log` muestra al menos un commit conventional con la base completa.
- [ ] El branch principal es `main` (no `master`).

## 9. Fuera de alcance — siguiente fase

- **F2** (`docs/superpowers/specs/2026-05-28-f2-db-prisma-design.md` — pendiente): schema Prisma, migración inicial, seed multi-tenant, `docker-compose.yml` con Postgres 16.
- **F3** (`...-f3-api-nestjs-design.md` — pendiente): NestJS 11 en `apps/api`, conexión a DB, healthcheck `GET /health`, Vitest configurado, primer test unitario.
- **F4** (`...-f4-frontends-vite-design.md` — pendiente): React 19 + Vite 6 en `apps/tpv` y `apps/backoffice`, Playwright configurado, smoke test E2E por cada frontend.
- **CI** (`...-ci-pipeline-design.md` — ya escrito): tras F4, ejecutar el plan de CI ya existente.
