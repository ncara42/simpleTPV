# F4 — Frontends Vite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar `apps/tpv` y `apps/backoffice` (React 19 + Vite 6 + Tailwind 4 + shadcn-style + TanStack Query 5 + Zustand 5) más los packages compartidos `packages/web-config` (configs base) y `packages/ui` (componentes), con smoke tests E2E Playwright que validan SPA + ping al `/api/health` del API de F3.

**Architecture:** Dos SPAs idénticas-pero-independientes (`apps/tpv` y `apps/backoffice`). Comparten configuración vía `packages/web-config` (funciones que devuelven config Vite/Tailwind/ESLint/tsconfig). Comparten componentes vía `packages/ui` (Button + helper cn, ampliable). En dev Vite proxyea `/api/*` al API en `:3000`; en E2E Playwright arranca `vite preview` automáticamente como `webServer:` y usa el mismo proxy.

**Tech Stack:** React 19, Vite 6, `@vitejs/plugin-react-swc`, Tailwind CSS v4 + `@tailwindcss/vite`, TanStack Query 5, Zustand 5, Playwright 1.50, Vitest 2, @testing-library/react 16, jsdom 25, clsx + tailwind-merge, eslint-plugin-react.

**Spec de referencia:** `docs/superpowers/specs/2026-05-28-f4-frontends-vite-design.md`

---

## Convenciones del plan

- **Rutas:** todas absolutas a `/Users/admin/Desktop/simpletpv/`.
- **Commits:** Conventional Commits, uno por tarea (o agrupado donde tiene sentido).
- **F1, F2, F3 asumidos completos:** monorepo Turborepo, configs raíz, `packages/db` con migraciones + seed, `apps/api` con `/health` funcional, Postgres corriendo.
- **API arriba para tests E2E:** los tests E2E asumen `pnpm --filter @simpletpv/api start` corriendo en `:3000`. T11/T12 documentan cómo arrancarlo.

---

## File Structure

| Path                                         | Acción                  | Tarea |
| -------------------------------------------- | ----------------------- | ----- |
| `packages/web-config/package.json`           | Crear                   | T1    |
| `packages/web-config/vite.base.ts`           | Crear                   | T1    |
| `packages/web-config/tailwind.preset.ts`     | Crear                   | T1    |
| `packages/web-config/eslint.react.js`        | Crear                   | T1    |
| `packages/web-config/tsconfig.frontend.json` | Crear                   | T1    |
| `packages/ui/package.json`                   | Crear                   | T2    |
| `packages/ui/tsconfig.json`                  | Crear                   | T2    |
| `packages/ui/vitest.config.ts`               | Crear                   | T2    |
| `packages/ui/vitest.setup.ts`                | Crear                   | T2    |
| `packages/ui/src/lib/cn.ts`                  | Crear                   | T3    |
| `packages/ui/src/components/Button.tsx`      | Crear                   | T3    |
| `packages/ui/src/components/Button.test.tsx` | Crear                   | T3    |
| `packages/ui/src/index.ts`                   | Crear                   | T3    |
| `apps/tpv/package.json`                      | Modificar (stub → real) | T4    |
| `apps/tpv/tsconfig.json`                     | Crear                   | T4    |
| `apps/tpv/vite.config.ts`                    | Crear                   | T4    |
| `apps/tpv/tailwind.config.ts`                | Crear                   | T4    |
| `apps/tpv/postcss.config.js`                 | Crear                   | T4    |
| `apps/tpv/index.html`                        | Crear                   | T5    |
| `apps/tpv/src/main.tsx`                      | Crear                   | T5    |
| `apps/tpv/src/App.tsx`                       | Crear                   | T5    |
| `apps/tpv/src/lib/api.ts`                    | Crear                   | T5    |
| `apps/tpv/src/styles.css`                    | Crear                   | T5    |
| `apps/tpv/playwright.config.ts`              | Crear                   | T6    |
| `apps/tpv/e2e/smoke.spec.ts`                 | Crear                   | T6    |
| `apps/backoffice/*`                          | Crear espejo de tpv     | T7-T9 |

---

## Task 1: `packages/web-config`

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/packages/web-config/package.json`
- Create: `/Users/admin/Desktop/simpletpv/packages/web-config/vite.base.ts`
- Create: `/Users/admin/Desktop/simpletpv/packages/web-config/tailwind.preset.ts`
- Create: `/Users/admin/Desktop/simpletpv/packages/web-config/eslint.react.js`
- Create: `/Users/admin/Desktop/simpletpv/packages/web-config/tsconfig.frontend.json`

- [ ] **Step 1: Crear directorio**

Run: `mkdir -p /Users/admin/Desktop/simpletpv/packages/web-config`

- [ ] **Step 2: Crear `package.json`**

Contenido exacto:

```json
{
  "name": "@simpletpv/web-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./vite.base.ts",
  "exports": {
    "./vite": "./vite.base.ts",
    "./tailwind": "./tailwind.preset.ts",
    "./eslint": "./eslint.react.js",
    "./tsconfig": "./tsconfig.frontend.json"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react-swc": "^4.0.0",
    "eslint-plugin-react": "^8.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.5.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 3: Crear `vite.base.ts`**

Contenido exacto:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { defineConfig, type UserConfig } from 'vite';

export interface FrontendViteOptions {
  port: number;
  previewPort: number;
  apiUrl?: string;
}

export function createViteConfig(opts: FrontendViteOptions): UserConfig {
  const apiUrl = opts.apiUrl ?? 'http://localhost:3000';
  return defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      port: opts.port,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      port: opts.previewPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  });
}
```

- [ ] **Step 4: Crear `tailwind.preset.ts`**

Contenido exacto:

```ts
import type { Config } from 'tailwindcss';

export const tailwindBasePreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0ea5e9',
          foreground: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

- [ ] **Step 5: Crear `eslint.react.js`**

Contenido exacto:

```js
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export const reactConfig = [
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'warn',
    },
  },
];
```

- [ ] **Step 6: Crear `tsconfig.frontend.json`**

Contenido exacto:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false
  }
}
```

- [ ] **Step 7: Instalar**

Run: `cd /Users/admin/Desktop/simpletpv && pnpm install`
Expected: pnpm reconoce `@simpletpv/web-config` y resuelve sus deps sin warnings strict-peer.

- [ ] **Step 8: Validar JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/web-config/package.json','utf8'))" && \
node -e "JSON.parse(require('fs').readFileSync('packages/web-config/tsconfig.frontend.json','utf8'))" && \
echo OK
```

Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git add packages/web-config/ pnpm-lock.yaml
git commit -m "feat(web-config): packages/web-config con base Vite + Tailwind + ESLint + tsconfig"
```

---

## Task 2: `packages/ui` esqueleto + configs

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/packages/ui/package.json`
- Create: `/Users/admin/Desktop/simpletpv/packages/ui/tsconfig.json`
- Create: `/Users/admin/Desktop/simpletpv/packages/ui/vitest.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/packages/ui/vitest.setup.ts`

- [ ] **Step 1: Crear directorios**

Run: `mkdir -p /Users/admin/Desktop/simpletpv/packages/ui/src/lib /Users/admin/Desktop/simpletpv/packages/ui/src/components`

- [ ] **Step 2: Crear `package.json`**

Contenido exacto:

```json
{
  "name": "@simpletpv/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text"
  },
  "dependencies": {
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "jsdom": "^25.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vitest": "^2.0.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 3: Crear `tsconfig.json`**

Contenido exacto:

```json
{
  "extends": "../web-config/tsconfig.frontend.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Crear `vitest.config.ts`**

Contenido exacto:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/index.ts'],
    },
  },
});
```

- [ ] **Step 5: Crear `vitest.setup.ts`**

Contenido exacto:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Instalar**

Run: `pnpm install`
Expected: sin warnings strict-peer. React resuelve desde `@simpletpv/ui` propio.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/tsconfig.json packages/ui/vitest.config.ts packages/ui/vitest.setup.ts pnpm-lock.yaml
git commit -m "feat(ui): @simpletpv/ui esqueleto (package.json + tsconfig + vitest)"
```

---

## Task 3: `packages/ui` — Button + cn con TDD

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/packages/ui/src/lib/cn.ts`
- Create: `/Users/admin/Desktop/simpletpv/packages/ui/src/components/Button.tsx`
- Create: `/Users/admin/Desktop/simpletpv/packages/ui/src/components/Button.test.tsx`
- Create: `/Users/admin/Desktop/simpletpv/packages/ui/src/index.ts`

- [ ] **Step 1: Escribir test fallando (TDD)**

Crear `packages/ui/src/components/Button.test.tsx` con contenido exacto:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renderiza children', () => {
    render(<Button>Hola</Button>);
    expect(screen.getByRole('button', { name: 'Hola' })).toBeInTheDocument();
  });

  it('aplica clases del variant ghost', () => {
    render(<Button variant="ghost">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('aplica className adicional sin sobrescribir base', () => {
    render(<Button className="extra-class">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('extra-class');
    expect(screen.getByRole('button')).toHaveClass('inline-flex');
  });
});
```

- [ ] **Step 2: Correr test → debe FALLAR**

Run: `pnpm --filter @simpletpv/ui test`
Expected: FAIL con `Cannot find module './Button.js'` o equivalente.

- [ ] **Step 3: Crear `cn.ts`**

Crear `packages/ui/src/lib/cn.ts` con contenido exacto:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Crear `Button.tsx`**

Crear `packages/ui/src/components/Button.tsx` con contenido exacto:

```tsx
import * as React from 'react';

import { cn } from '../lib/cn.js';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center rounded-md px-4 text-sm font-medium transition',
        variant === 'default' && 'bg-brand text-brand-foreground hover:opacity-90',
        variant === 'ghost' && 'bg-transparent hover:bg-gray-100',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
```

- [ ] **Step 5: Crear `index.ts`**

Crear `packages/ui/src/index.ts` con contenido exacto:

```ts
export { Button } from './components/Button.js';
export { cn } from './lib/cn.js';
```

- [ ] **Step 6: Correr test → debe PASAR**

Run: `pnpm --filter @simpletpv/ui test`
Expected: 3 tests pasan. Genera `packages/ui/coverage/coverage-summary.json`.

- [ ] **Step 7: Verificar typecheck**

Run: `pnpm --filter @simpletpv/ui typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/
git commit -m "feat(ui): Button + helper cn con tests"
```

---

## Task 4: `apps/tpv` — package + configs

**Files:**

- Modify: `/Users/admin/Desktop/simpletpv/apps/tpv/package.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/tsconfig.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/vite.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/tailwind.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/postcss.config.js`

- [ ] **Step 1: Sobrescribir `apps/tpv/package.json` (era stub de F1)**

Contenido exacto:

```json
{
  "name": "@simpletpv/tpv",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@simpletpv/ui": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@simpletpv/web-config": "workspace:*",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Crear `apps/tpv/tsconfig.json`**

Contenido exacto:

```json
{
  "extends": "../../packages/web-config/tsconfig.frontend.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "e2e"]
}
```

- [ ] **Step 3: Crear `apps/tpv/vite.config.ts`**

Contenido exacto:

```ts
import { createViteConfig } from '@simpletpv/web-config/vite';

export default createViteConfig({
  port: 5173,
  previewPort: 4173,
});
```

- [ ] **Step 4: Crear `apps/tpv/tailwind.config.ts`**

Contenido exacto:

```ts
import type { Config } from 'tailwindcss';

import { tailwindBasePreset } from '@simpletpv/web-config/tailwind';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [tailwindBasePreset as Config],
} satisfies Config;
```

- [ ] **Step 5: Crear `apps/tpv/postcss.config.js`**

Contenido exacto:

```js
// Tailwind 4 usa el plugin de Vite. Este archivo existe solo porque algunos
// tools (lint-staged, IDEs) lo buscan; está vacío intencionadamente.
export default {};
```

- [ ] **Step 6: Instalar**

Run: `pnpm install`
Expected: sin warnings; `@simpletpv/ui` y `@simpletpv/web-config` resuelven desde workspace.

- [ ] **Step 7: Commit**

```bash
git add apps/tpv/package.json apps/tpv/tsconfig.json apps/tpv/vite.config.ts apps/tpv/tailwind.config.ts apps/tpv/postcss.config.js pnpm-lock.yaml
git commit -m "feat(tpv): package.json + configs (vite + tailwind + tsconfig)"
```

---

## Task 5: `apps/tpv` — código React (index.html + main + App + lib/api + styles)

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/index.html`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/src/main.tsx`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/src/App.tsx`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/src/lib/api.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/src/styles.css`

- [ ] **Step 1: Crear directorio src/lib**

Run: `mkdir -p /Users/admin/Desktop/simpletpv/apps/tpv/src/lib`

- [ ] **Step 2: Crear `apps/tpv/index.html`**

Contenido exacto:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>simpleTPV</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Crear `apps/tpv/src/lib/api.ts`**

Contenido exacto:

```ts
export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

export async function pingHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`API /health respondió ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
```

- [ ] **Step 4: Crear `apps/tpv/src/App.tsx`**

Contenido exacto:

```tsx
import { Button } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import { pingHealth } from './lib/api.js';

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: pingHealth,
    retry: false,
  });

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">simpleTPV</h1>
      <p className="mt-2 text-sm text-gray-600">Punto de venta — scaffolding</p>
      <section className="mt-6">
        <h2 className="text-lg font-medium">API status</h2>
        <p data-testid="api-status" className="mt-1 text-sm">
          {isLoading && 'Cargando...'}
          {isError && 'Sin conexión con API'}
          {data && `${data.status} · uptime ${Math.round(data.uptime)}s`}
        </p>
        <Button className="mt-3">Botón placeholder</Button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Crear `apps/tpv/src/main.tsx`**

Contenido exacto:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Crear `apps/tpv/src/styles.css`**

Contenido exacto:

```css
@import 'tailwindcss';
```

- [ ] **Step 7: Verificar typecheck**

Run: `pnpm --filter @simpletpv/tpv typecheck`
Expected: sin errores.

> **Si tsc rompe con `Cannot find module '@simpletpv/ui'`:** verificar que F1 + F2 instalaron el monorepo correctamente y que `pnpm install` corrió tras T2. Ejecutar `pnpm install` y reintentar.

- [ ] **Step 8: Build**

Run: `pnpm --filter @simpletpv/tpv build`
Expected: produce `apps/tpv/dist/index.html` + assets. Sin errores TS ni Vite.

- [ ] **Step 9: Commit**

```bash
git add apps/tpv/index.html apps/tpv/src/
git commit -m "feat(tpv): App placeholder con TanStack Query + ping /api/health"
```

---

## Task 6: `apps/tpv` — Playwright + smoke test E2E

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/playwright.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/tpv/e2e/smoke.spec.ts`

- [ ] **Step 1: Crear directorio e2e**

Run: `mkdir -p /Users/admin/Desktop/simpletpv/apps/tpv/e2e`

- [ ] **Step 2: Crear `apps/tpv/playwright.config.ts`**

Contenido exacto:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

- [ ] **Step 3: Crear `apps/tpv/e2e/smoke.spec.ts`**

Contenido exacto:

```ts
import { expect, test } from '@playwright/test';

test('carga TPV y muestra status de API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'simpleTPV' })).toBeVisible();

  const status = page.getByTestId('api-status');
  await expect(status).toBeVisible();
  // En CI hay API arriba → "ok". En local sin API → "Sin conexión".
  // Ambos son válidos para verificar que la SPA renderiza.
  await expect(status).toContainText(/(ok|Sin conexión)/, { timeout: 10000 });
});
```

- [ ] **Step 4: Instalar Chromium de Playwright (primera vez)**

Run: `pnpm --filter @simpletpv/tpv exec playwright install --with-deps chromium`
Expected: descarga Chromium (~150MB) y dependencias del sistema.

> **Si pide sudo y no quieres dárselo:** usar `pnpm --filter @simpletpv/tpv exec playwright install chromium` (sin `--with-deps`); en macOS suele bastar.

- [ ] **Step 5: Asegurar build existe**

Run: `pnpm --filter @simpletpv/tpv build`
Expected: `dist/` existe.

- [ ] **Step 6: Arrancar API en background (para que el smoke test reciba "ok")**

Run (en background):

```bash
cd /Users/admin/Desktop/simpletpv
set -a && source .env && set +a
pnpm --filter @simpletpv/api start > /tmp/simpletpv-api.log 2>&1 &
echo $! > /tmp/simpletpv-api.pid
for i in $(seq 1 15); do
  curl -sf http://localhost:3000/health > /dev/null && break
  sleep 1
done
curl -s http://localhost:3000/health
```

Expected: imprime `{"status":"ok",...}`.

> **Si la API no arranca:** revisar `/tmp/simpletpv-api.log`. Posibles causas: Postgres no corriendo, falta `DATABASE_URL_APP` en `.env`, build de api desactualizado (`pnpm --filter @simpletpv/api build`).

- [ ] **Step 7: Ejecutar smoke test**

Run: `pnpm --filter @simpletpv/tpv test:e2e`
Expected: 1 test pasa. Salida tipo:

```
Running 1 test using 1 worker
  ✓  e2e/smoke.spec.ts:3:1 › carga TPV y muestra status de API (Xs)
  1 passed
```

> **Si falla con `status texto "Cargando..."`:** subir el timeout del `toContainText` a 20s. El cold start del QueryClient puede tardar.

> **Si Playwright se queja del `webServer` (puerto ocupado):** matar procesos vite anteriores: `lsof -ti :4173 | xargs kill -9`.

- [ ] **Step 8: Matar API**

Run: `kill $(cat /tmp/simpletpv-api.pid) 2>/dev/null; rm -f /tmp/simpletpv-api.pid`

- [ ] **Step 9: Commit**

```bash
git add apps/tpv/playwright.config.ts apps/tpv/e2e/
git commit -m "test(tpv): playwright smoke test (placeholder + ping /api/health)"
```

---

## Task 7: `apps/backoffice` — package + configs (espejo de TPV)

**Files:**

- Modify: `/Users/admin/Desktop/simpletpv/apps/backoffice/package.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/tsconfig.json`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/vite.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/tailwind.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/postcss.config.js`

- [ ] **Step 1: Sobrescribir `apps/backoffice/package.json`**

Contenido exacto (idéntico a TPV salvo `name` y script `preview` con puerto 4174):

```json
{
  "name": "@simpletpv/backoffice",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 4174",
    "typecheck": "tsc --noEmit",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@simpletpv/ui": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@simpletpv/web-config": "workspace:*",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Crear `apps/backoffice/tsconfig.json`**

Contenido exacto (idéntico a TPV):

```json
{
  "extends": "../../packages/web-config/tsconfig.frontend.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "e2e"]
}
```

- [ ] **Step 3: Crear `apps/backoffice/vite.config.ts`**

Contenido exacto (puertos cambian a 5174/4174):

```ts
import { createViteConfig } from '@simpletpv/web-config/vite';

export default createViteConfig({
  port: 5174,
  previewPort: 4174,
});
```

- [ ] **Step 4: Crear `apps/backoffice/tailwind.config.ts`**

Contenido exacto (idéntico a TPV):

```ts
import type { Config } from 'tailwindcss';

import { tailwindBasePreset } from '@simpletpv/web-config/tailwind';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [tailwindBasePreset as Config],
} satisfies Config;
```

- [ ] **Step 5: Crear `apps/backoffice/postcss.config.js`**

Contenido exacto:

```js
// Tailwind 4 usa el plugin de Vite. Este archivo existe solo porque algunos
// tools (lint-staged, IDEs) lo buscan; está vacío intencionadamente.
export default {};
```

- [ ] **Step 6: Instalar**

Run: `pnpm install`
Expected: sin warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/backoffice/package.json apps/backoffice/tsconfig.json apps/backoffice/vite.config.ts apps/backoffice/tailwind.config.ts apps/backoffice/postcss.config.js pnpm-lock.yaml
git commit -m "feat(backoffice): package.json + configs (puertos 5174/4174)"
```

---

## Task 8: `apps/backoffice` — código React (idéntico a TPV salvo títulos)

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/index.html`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/src/main.tsx`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/src/App.tsx`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/src/lib/api.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/src/styles.css`

- [ ] **Step 1: Crear directorio src/lib**

Run: `mkdir -p /Users/admin/Desktop/simpletpv/apps/backoffice/src/lib`

- [ ] **Step 2: Crear `apps/backoffice/index.html`**

Contenido exacto (cambia `<title>`):

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>simpleTPV Backoffice</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Crear `apps/backoffice/src/lib/api.ts`**

Contenido exacto (idéntico a TPV):

```ts
export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

export async function pingHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`API /health respondió ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
```

- [ ] **Step 4: Crear `apps/backoffice/src/App.tsx`**

Contenido exacto (cambia título y descripción):

```tsx
import { Button } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import { pingHealth } from './lib/api.js';

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: pingHealth,
    retry: false,
  });

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">simpleTPV Backoffice</h1>
      <p className="mt-2 text-sm text-gray-600">Backoffice administrativo — scaffolding</p>
      <section className="mt-6">
        <h2 className="text-lg font-medium">API status</h2>
        <p data-testid="api-status" className="mt-1 text-sm">
          {isLoading && 'Cargando...'}
          {isError && 'Sin conexión con API'}
          {data && `${data.status} · uptime ${Math.round(data.uptime)}s`}
        </p>
        <Button className="mt-3">Botón placeholder</Button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Crear `apps/backoffice/src/main.tsx`**

Contenido exacto (idéntico a TPV):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Crear `apps/backoffice/src/styles.css`**

Contenido exacto (idéntico a TPV):

```css
@import 'tailwindcss';
```

- [ ] **Step 7: Typecheck + build**

Run:

```bash
pnpm --filter @simpletpv/backoffice typecheck
pnpm --filter @simpletpv/backoffice build
```

Expected: ambos pasan. `apps/backoffice/dist/index.html` existe.

- [ ] **Step 8: Commit**

```bash
git add apps/backoffice/index.html apps/backoffice/src/
git commit -m "feat(backoffice): App placeholder (espejo de tpv con título distinto)"
```

---

## Task 9: `apps/backoffice` — Playwright + smoke test E2E

**Files:**

- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/playwright.config.ts`
- Create: `/Users/admin/Desktop/simpletpv/apps/backoffice/e2e/smoke.spec.ts`

- [ ] **Step 1: Crear directorio e2e**

Run: `mkdir -p /Users/admin/Desktop/simpletpv/apps/backoffice/e2e`

- [ ] **Step 2: Crear `apps/backoffice/playwright.config.ts`**

Contenido exacto (puerto 4174 en lugar de 4173):

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

- [ ] **Step 3: Crear `apps/backoffice/e2e/smoke.spec.ts`**

Contenido exacto (cambia nombre del heading):

```ts
import { expect, test } from '@playwright/test';

test('carga Backoffice y muestra status de API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'simpleTPV Backoffice' })).toBeVisible();

  const status = page.getByTestId('api-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText(/(ok|Sin conexión)/, { timeout: 10000 });
});
```

- [ ] **Step 4: Arrancar API en background**

Run:

```bash
cd /Users/admin/Desktop/simpletpv
set -a && source .env && set +a
pnpm --filter @simpletpv/api start > /tmp/simpletpv-api.log 2>&1 &
echo $! > /tmp/simpletpv-api.pid
for i in $(seq 1 15); do
  curl -sf http://localhost:3000/health > /dev/null && break
  sleep 1
done
```

- [ ] **Step 5: Ejecutar smoke test del backoffice**

Run: `pnpm --filter @simpletpv/backoffice test:e2e`
Expected: 1 test pasa.

> **Si Chromium no está instalado** (porque solo se hizo para tpv en T6): `pnpm --filter @simpletpv/backoffice exec playwright install chromium`. El binario es compartido entre apps via `~/.cache/ms-playwright/`, así que no se descarga dos veces.

- [ ] **Step 6: Matar API**

Run: `kill $(cat /tmp/simpletpv-api.pid) 2>/dev/null; rm -f /tmp/simpletpv-api.pid`

- [ ] **Step 7: Commit**

```bash
git add apps/backoffice/playwright.config.ts apps/backoffice/e2e/
git commit -m "test(backoffice): playwright smoke test (placeholder + ping /api/health)"
```

---

## Task 10: Validación de cierre de F4

**Files:** ninguno permanente; verificación.

- [ ] **Step 1: Aplicar los 15 checks del spec §6**

```bash
# 1. install limpio
pnpm install

# 2. tests de @simpletpv/ui
pnpm --filter @simpletpv/ui test
# Expected: 3 tests pasan

# 3-4. typecheck por app
pnpm --filter @simpletpv/tpv typecheck
pnpm --filter @simpletpv/backoffice typecheck

# 5-6. builds
pnpm --filter @simpletpv/tpv build
pnpm --filter @simpletpv/backoffice build
ls apps/tpv/dist/index.html apps/backoffice/dist/index.html
# Expected: ambos existen

# 7. arrancar API
set -a && source .env && set +a
pnpm --filter @simpletpv/api start > /tmp/simpletpv-api.log 2>&1 &
echo $! > /tmp/simpletpv-api.pid
for i in $(seq 1 15); do
  curl -sf http://localhost:3000/health > /dev/null && break
  sleep 1
done
curl -s http://localhost:3000/health
# Expected: {"status":"ok",...}

# 8-10. E2E
pnpm --filter @simpletpv/tpv test:e2e
pnpm --filter @simpletpv/backoffice test:e2e
# Expected: ambos pasan (1 test cada uno)

# 11. matar API
kill $(cat /tmp/simpletpv-api.pid) 2>/dev/null
rm -f /tmp/simpletpv-api.pid

# 12. lint + format
pnpm lint && pnpm format

# 13. typecheck monorepo
pnpm typecheck

# 14. build monorepo
pnpm build

# 15. git limpio
git status --porcelain
# Expected: vacío
```

- [ ] **Step 2: Confirmar F1, F2, F3 siguen verdes**

Run:

```bash
docker compose ps postgres | grep healthy && echo "postgres OK"
pnpm --filter @simpletpv/db build
pnpm --filter @simpletpv/api test
```

Expected: postgres healthy, db build OK, tests api OK.

- [ ] **Step 3: Verificar contrato con plan de CI**

Verificar que los comandos que invoca el plan de CI (Task 6 del plan CI) están alineados con los scripts de F4:

- `pnpm -r --filter "./apps/*" build` → ahora construye api + tpv + backoffice + (db lo hace por dependencia).
- `pnpm --filter @simpletpv/tpv exec playwright install --with-deps chromium` → existe.
- `pnpm --filter @simpletpv/tpv test:e2e` → existe.
- `pnpm --filter @simpletpv/backoffice test:e2e` → existe.

Run para confirmar todos los scripts existen:

```bash
node -e "
const fs = require('fs');
const apps = ['tpv','backoffice'];
for (const a of apps) {
  const pkg = JSON.parse(fs.readFileSync('apps/'+a+'/package.json','utf8'));
  console.log('@simpletpv/'+a+' scripts:', Object.keys(pkg.scripts||{}).join(', '));
}
"
```

Expected: cada app lista `dev, build, preview, typecheck, test:e2e`.

- [ ] **Step 4: Verificar git log**

Run: `git log --oneline | head -15`
Expected: al menos 9 commits de F4 (T1, T2, T3, T4, T5, T6, T7, T8, T9), Conventional Commits.

- [ ] **Step 5: Sin commit final**

T10 solo valida.

---

## Self-review (ejecutado al escribir el plan)

**1. Cobertura del spec:**

| Spec §                                              | Cubierto por                     |
| --------------------------------------------------- | -------------------------------- |
| §4 estructura packages/web-config                   | T1                               |
| §4 estructura packages/ui                           | T2 + T3                          |
| §4 estructura apps/tpv                              | T4 + T5 + T6                     |
| §4 estructura apps/backoffice                       | T7 + T8 + T9                     |
| §5.1-5.5 web-config files                           | T1 (steps 2-6)                   |
| §5.6-5.9 ui configs                                 | T2 (steps 2-5)                   |
| §5.10-5.13 ui src (Button, cn, index)               | T3 (steps 3-5)                   |
| §5.14 tpv package.json                              | T4 step 1                        |
| §5.15 tpv tsconfig                                  | T4 step 2                        |
| §5.16 tpv vite.config                               | T4 step 3                        |
| §5.17 tpv tailwind.config                           | T4 step 4                        |
| §5.18 tpv postcss.config                            | T4 step 5                        |
| §5.19 tpv index.html                                | T5 step 2                        |
| §5.20 tpv main.tsx                                  | T5 step 5                        |
| §5.21 tpv App.tsx                                   | T5 step 4                        |
| §5.22 tpv lib/api.ts                                | T5 step 3                        |
| §5.23 tpv styles.css                                | T5 step 6                        |
| §5.24 tpv playwright.config                         | T6 step 2                        |
| §5.25 tpv smoke.spec                                | T6 step 3                        |
| §5.26 backoffice (todas las diferencias enumeradas) | T7 + T8 + T9                     |
| §6 validación 15 checks                             | T10 step 1                       |
| §8 definición de done                               | T10 (todos los puntos cubiertos) |

Sin gaps.

**2. Placeholder scan:**

- T3 sigue TDD estricto (test → fail → impl → pass → commit).
- Notas `> **Si X:**` son contingencias documentadas, no diferimientos.
- Repetición consciente del código entre TPV y Backoffice (T4-T6 vs T7-T9): el spec §5.26 lo justifica como "espejo deliberado hasta que diverjan en MVP semana 1". El plan repite literalmente el código en T7-T9 (no usa "ver Task X") porque la repetición es funcional, no documental.

**3. Consistencia de tipos/nombres:**

- `@simpletpv/tpv` (5173/4173), `@simpletpv/backoffice` (5174/4174), `@simpletpv/ui`, `@simpletpv/web-config` consistentes en todas las tareas.
- `Button`, `cn`, `pingHealth`, `HealthResponse`, `tailwindBasePreset`, `createViteConfig`, `FrontendViteOptions` consistentes entre archivos y consumidores.
- `data-testid="api-status"` consistente entre App.tsx (T5/T8) y smoke.spec.ts (T6/T9).
- `/api/health` consistente entre lib/api.ts y proxy rewrite del vite.base.ts (que reescribe a `/health`).
- Workspace links `@simpletpv/ui: workspace:*` y `@simpletpv/web-config: workspace:*` consistentes en T4 step 1 y T7 step 1.

Sin issues detectados.
