# Spec — F4: Frontends Vite (TPV + Backoffice) + packages compartidos

| Campo       | Valor                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-05-28                                                                                                                                                                                                                                                                             |
| Autor       | noel@noelcaravaca.com                                                                                                                                                                                                                                                                  |
| Estado      | Aprobado para implementación                                                                                                                                                                                                                                                           |
| Fase        | F4 (última de 4 de scaffolding) — depende de F1, F2, F3; precede al plan de CI                                                                                                                                                                                                         |
| Referencias | `Plan_Desarrollo_MVP.md` §1.4 (frontend stack), §2 (dos SPAs separadas vía Nginx); `docs/superpowers/specs/2026-05-28-f3-api-nestjs-design.md` (`/health` consumido por los smoke tests); `docs/superpowers/plans/2026-05-28-ci-pipeline.md` Task 6 (contrato E2E que F4 debe cumplir) |

## 1. Objetivo

Levantar los dos frontends del producto en su **alcance mínimo viable**:

- `apps/tpv` — Punto de venta. React 19 + Vite 6 + Tailwind 4 + shadcn-style.
- `apps/backoffice` — Backoffice administrativo. Mismo stack.

Y los **dos packages compartidos** que evitan duplicación entre las dos SPAs desde el día 1:

- `packages/web-config` — Funciones/objetos de configuración (Vite, Tailwind, ESLint, tsconfig).
- `packages/ui` — Componentes UI compartidos (arranca con `Button` + helper `cn`).

Cada SPA renderiza un placeholder con un ping al `/api/health` (proxyeado via Vite a `:3000`). Cada SPA tiene su `playwright.config.ts` con un smoke test E2E que verifica la carga + el ping. Sin auth, sin rutas, sin stores reales — el MVP semana 1+ los construye.

Al cerrar F4:

- `pnpm --filter @simpletpv/tpv dev` arranca dev server en `:5173`.
- `pnpm --filter @simpletpv/backoffice dev` arranca dev server en `:5174`.
- `pnpm --filter @simpletpv/tpv build` produce `apps/tpv/dist/`.
- `pnpm --filter @simpletpv/tpv test:e2e` arranca `vite preview` y pasa el smoke test.
- Igual para backoffice.
- El job E2E del plan de CI (ya escrito) ejecuta el contrato sin modificaciones.

## 2. Alcance

**Incluido:**

- `packages/web-config/` con `vite.base.ts`, `tailwind.preset.ts`, `eslint.react.js`, `tsconfig.frontend.json` y `package.json` exportándolos.
- `packages/ui/` con `Button` (shadcn-style), helper `cn` (clsx + tailwind-merge), tests Vitest + testing-library.
- `apps/tpv/` y `apps/backoffice/` idénticos salvo nombre y puertos, con:
  - `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css` (`@import 'tailwindcss';`), `src/lib/api.ts`.
  - `vite.config.ts` usando `createViteConfig` de `@simpletpv/web-config`.
  - `tailwind.config.ts` usando el preset de `@simpletpv/web-config`.
  - `postcss.config.js` vacío (Tailwind 4 no lo necesita pero algunos tools lo buscan).
  - `tsconfig.json` extendiendo `@simpletpv/web-config/tsconfig`.
  - `playwright.config.ts` con `webServer: vite preview`.
  - `e2e/smoke.spec.ts` que verifica placeholder + ping a `/api/health`.
- `package.json` actualizado en ambas apps con deps reales (React 19, TanStack Query 5, Zustand 5, Playwright, etc.) y workspace deps.

**Excluido:**

- React Router — MVP semana 1.
- Stores Zustand reales (auth, cart, etc.) — MVP semana 1.
- Cliente API tipado generado desde OpenAPI — cuando MVP semana 1 active Swagger.
- Componentes shadcn más allá de Button — MVP semana 1+.
- Login UI, auth flow — MVP semana 1.
- Service Worker / PWA / modo offline — post-MVP (mencionado en MVP §1173).
- Storybook — cuando `packages/ui` tenga ≥5 componentes.
- Animaciones (framer-motion), iconos (lucide), i18n (i18next) — YAGNI.
- Tests unitarios en `apps/*` — F4 solo testea `packages/ui`. Componentes de app vienen con MVP semana 1.
- Nginx config — el job E2E usa `vite preview` con su propio proxy.

## 3. Decisiones explícitas

| #      | Decisión                                                           | Justificación                                                                                                                                                |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F4-D1  | `packages/web-config` + `packages/ui` desde F4                     | Decisión explícita del usuario. Trade-off: F4 más grande a cambio de menos duplicación.                                                                      |
| F4-D2  | Tailwind v4 con `@tailwindcss/vite` (sin `postcss.config.js` útil) | Estándar 2026, más rápido, menos config. Directiva en CSS es `@import 'tailwindcss';`.                                                                       |
| F4-D3  | shadcn-style con un solo componente inicial (`Button`)             | Demuestra el patrón sin sobreingeniería. Resto en MVP semana 1+.                                                                                             |
| F4-D4  | `@vitejs/plugin-react-swc` (no plugin-react Babel)                 | ~10× más rápido en HMR. Estándar moderno con React 19.                                                                                                       |
| F4-D5  | Vite dev/preview proxy `/api → http://localhost:3000`              | Misma URL en dev y prod. En prod Nginx proxyea igual. Tests usan la misma ruta.                                                                              |
| F4-D6  | Playwright contra `vite preview` (no dev server)                   | Tests cercanos a producción (build real). Rápido.                                                                                                            |
| F4-D7  | TanStack Query 5 + Zustand 5 desde F4                              | MVP ya los decidió; instalarlos en scaffolding evita PRs ruidosos cuando se añadan en semana 1.                                                              |
| F4-D8  | Zustand 5 instalado pero sin store inicial                         | YAGNI; F4 declara solo la dep.                                                                                                                               |
| F4-D9  | Sin React Router en F4                                             | YAGNI; placeholder es una sola pantalla. MVP semana 1 lo añade.                                                                                              |
| F4-D10 | Sin iconos, sin i18n, sin animaciones                              | YAGNI; placeholder no los necesita.                                                                                                                          |
| F4-D11 | Sin tests unitarios en `apps/*` (solo en `packages/ui`)            | YAGNI; componentes de app llegan con MVP semana 1.                                                                                                           |
| F4-D12 | API tipado a mano (sin OpenAPI generator)                          | YAGNI; cuando MVP semana 1 active Swagger, generamos.                                                                                                        |
| F4-D13 | `strictPort: true` en Vite (dev y preview)                         | Falla rápido si el puerto está ocupado en lugar de buscar otro. Esencial para tests deterministas.                                                           |
| F4-D14 | `apps/backoffice` espejo de `apps/tpv` salvo nombre/puertos        | Divergen cuando los productos requieran. Hasta entonces, idénticos.                                                                                          |
| F4-D15 | `packages/web-config` exporta `.ts` directamente (sin compilar)    | Vite/ESBuild transforma on-the-fly al importarlo desde apps. Funciona en el monorepo.                                                                        |
| F4-D16 | `packages/ui` declara React como `peerDependencies`                | Estándar para componentes; pnpm resuelve desde el workspace consumidor.                                                                                      |
| F4-D17 | El smoke test E2E acepta `ok` o "Sin conexión"                     | En CI siempre hay API → debería ser `ok`. En local sin API, la SPA renderiza error elegantemente. Valida la SPA en isolation sin acoplar duro al API arriba. |
| F4-D18 | Solo Chromium en Playwright (no Firefox/Webkit)                    | Plan de CI ya instala solo Chromium. Coherente. Resto post-MVP si dolor real.                                                                                |
| F4-D19 | Tailwind `content[]` incluye `../../packages/ui/src/**`            | Para que las clases usadas en el package compartido se compilen en cada app.                                                                                 |
| F4-D20 | Sin Storybook en F4                                                | YAGNI; con un componente no aporta.                                                                                                                          |

## 4. Estructura final

```
simpletpv/
├── packages/
│   ├── web-config/                            (nuevo workspace)
│   │   ├── package.json
│   │   ├── vite.base.ts
│   │   ├── tailwind.preset.ts
│   │   ├── eslint.react.js
│   │   └── tsconfig.frontend.json
│   └── ui/                                    (nuevo workspace)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── vitest.setup.ts
│       └── src/
│           ├── index.ts
│           ├── lib/cn.ts
│           └── components/
│               ├── Button.tsx
│               └── Button.test.tsx
├── apps/
│   ├── tpv/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── index.html
│   │   ├── playwright.config.ts
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── styles.css
│   │   │   └── lib/api.ts
│   │   └── e2e/
│   │       └── smoke.spec.ts
│   └── backoffice/                            (estructura idéntica a tpv)
│       └── ...
```

`tsconfig.json` raíz (de F1) tiene `references` a `apps/tpv`, `apps/backoffice`, `packages/db`, `apps/api`. F4 NO añade `packages/web-config` ni `packages/ui` a las references (son packages "leaf" sin emitir, no necesitan project references).

## 5. Contenido de archivos

### 5.1 `packages/web-config/package.json`

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

### 5.2 `packages/web-config/vite.base.ts`

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

### 5.3 `packages/web-config/tailwind.preset.ts`

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

### 5.4 `packages/web-config/eslint.react.js`

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

### 5.5 `packages/web-config/tsconfig.frontend.json`

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

### 5.6 `packages/ui/package.json`

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

### 5.7 `packages/ui/tsconfig.json`

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

### 5.8 `packages/ui/vitest.config.ts`

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

### 5.9 `packages/ui/vitest.setup.ts`

```ts
import '@testing-library/jest-dom/vitest';
```

### 5.10 `packages/ui/src/lib/cn.ts`

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

### 5.11 `packages/ui/src/components/Button.tsx`

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

### 5.12 `packages/ui/src/components/Button.test.tsx`

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

### 5.13 `packages/ui/src/index.ts`

```ts
export { Button } from './components/Button.js';
export { cn } from './lib/cn.js';
```

### 5.14 `apps/tpv/package.json`

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

### 5.15 `apps/tpv/tsconfig.json`

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

### 5.16 `apps/tpv/vite.config.ts`

```ts
import { createViteConfig } from '@simpletpv/web-config/vite';

export default createViteConfig({
  port: 5173,
  previewPort: 4173,
});
```

### 5.17 `apps/tpv/tailwind.config.ts`

```ts
import type { Config } from 'tailwindcss';

import { tailwindBasePreset } from '@simpletpv/web-config/tailwind';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [tailwindBasePreset as Config],
} satisfies Config;
```

### 5.18 `apps/tpv/postcss.config.js`

```js
// Tailwind 4 usa el plugin de Vite. Este archivo existe solo porque algunos
// tools (lint-staged, IDEs) lo buscan; está vacío intencionadamente.
export default {};
```

### 5.19 `apps/tpv/index.html`

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

### 5.20 `apps/tpv/src/main.tsx`

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

### 5.21 `apps/tpv/src/App.tsx`

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

### 5.22 `apps/tpv/src/lib/api.ts`

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

### 5.23 `apps/tpv/src/styles.css`

```css
@import 'tailwindcss';
```

### 5.24 `apps/tpv/playwright.config.ts`

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

### 5.25 `apps/tpv/e2e/smoke.spec.ts`

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

### 5.26 `apps/backoffice/*`

Estructura **idéntica** a `apps/tpv/*` salvo:

- `apps/backoffice/package.json`: `"name": "@simpletpv/backoffice"`.
- `apps/backoffice/vite.config.ts`:
  ```ts
  import { createViteConfig } from '@simpletpv/web-config/vite';
  export default createViteConfig({ port: 5174, previewPort: 4174 });
  ```
- `apps/backoffice/index.html`: `<title>simpleTPV Backoffice</title>`.
- `apps/backoffice/src/App.tsx`: cambiar `simpleTPV` → `simpleTPV Backoffice` y `Punto de venta` → `Backoffice administrativo`.
- `apps/backoffice/playwright.config.ts`:
  - `baseURL: 'http://localhost:4174'`
  - `webServer.command: 'pnpm exec vite preview --port 4174'`
  - `webServer.url: 'http://localhost:4174'`
- `apps/backoffice/e2e/smoke.spec.ts`: `name: 'simpleTPV Backoffice'`.
- `apps/backoffice/package.json` script `preview`: `vite preview --port 4174`.
- `apps/backoffice/tailwind.config.ts`: igual que TPV (mismo preset, mismo `content[]`).
- `apps/backoffice/tsconfig.json`: igual que TPV.
- `apps/backoffice/postcss.config.js`: igual que TPV (vacío).
- `apps/backoffice/src/main.tsx`: igual que TPV.
- `apps/backoffice/src/lib/api.ts`: igual que TPV.
- `apps/backoffice/src/styles.css`: igual que TPV.

## 6. Validación de cierre de F4

Con F1, F2, F3 completos y Postgres corriendo.

| #   | Comando                                                                                   | Resultado esperado                                                  |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `pnpm install`                                                                            | Resuelve nuevos workspaces sin warnings strict-peer.                |
| 2   | `pnpm --filter @simpletpv/ui test`                                                        | 3 tests pasan; genera `packages/ui/coverage/coverage-summary.json`. |
| 3   | `pnpm --filter @simpletpv/tpv typecheck`                                                  | Sin errores.                                                        |
| 4   | `pnpm --filter @simpletpv/backoffice typecheck`                                           | Sin errores.                                                        |
| 5   | `pnpm --filter @simpletpv/tpv build`                                                      | Genera `apps/tpv/dist/index.html` + assets.                         |
| 6   | `pnpm --filter @simpletpv/backoffice build`                                               | Genera `apps/backoffice/dist/index.html` + assets.                  |
| 7   | API arriba: `pnpm --filter @simpletpv/api start &` (background)                           | API en `:3000`.                                                     |
| 8   | `pnpm --filter @simpletpv/tpv exec playwright install --with-deps chromium` (primera vez) | Chromium instalado.                                                 |
| 9   | `pnpm --filter @simpletpv/tpv test:e2e`                                                   | Smoke test pasa contra `vite preview` en `:4173`.                   |
| 10  | `pnpm --filter @simpletpv/backoffice test:e2e`                                            | Smoke test pasa contra `vite preview` en `:4174`.                   |
| 11  | Matar API (`kill %1` o equivalente)                                                       | Termina limpio.                                                     |
| 12  | `pnpm lint && pnpm format`                                                                | F1-F3 siguen verdes.                                                |
| 13  | `pnpm typecheck`                                                                          | Todos los workspaces verdes.                                        |
| 14  | `pnpm build` (Turborepo raíz)                                                             | Construye api + tpv + backoffice + ui sin error.                    |
| 15  | `git status --porcelain`                                                                  | Vacío (todo commiteado).                                            |

Verificación manual de dev experience (opcional pero recomendado):

| #   | Comando                                                                         | Resultado                                                                                                   |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| M1  | API arriba + `pnpm --filter @simpletpv/tpv dev` → abrir `http://localhost:5173` | Pantalla muestra "simpleTPV", "Punto de venta — scaffolding", "ok · uptime …s" y un botón estilado en azul. |
| M2  | Igual con backoffice (`:5174`)                                                  | Misma pantalla con título "simpleTPV Backoffice".                                                           |

## 7. Riesgos y mitigaciones

| Riesgo                                                                   | Mitigación                                                                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind v4 (relativamente nuevo) tiene edge cases con el plugin Vite    | Fallback documentado: migrar a Tailwind v3.4 + `postcss.config.js` + `tailwind.config.ts` clásico si rompe. Si solo afecta a dev (no a build/E2E), aceptar y esperar release.          |
| `@simpletpv/web-config` exporta `.ts` directamente sin compilar          | Funciona porque Vite/ESBuild transforma on-the-fly. Si el `vite.config.ts` rompe al importarlo, alternativa: añadir `tsx` y entrypoint que precompile.                                 |
| `packages/ui` con React como peer puede dar conflictos                   | pnpm con `strict-peer-dependencies` + `peerDependencies` en `packages/ui` + `dependencies` en apps → resolución correcta. Si rompe, revisar versión exacta.                            |
| `vite preview` no proxyea bien                                           | Vite 6 soporta `preview.proxy` igual que `server.proxy`. Si rompe, alternativa: `serve` o express trivial.                                                                             |
| Tests E2E flaky por timing del API                                       | `webServer.timeout: 30000`, `expect.toContainText` con timeout 10s. Si flaky, subir timeouts.                                                                                          |
| `apps/backoffice` se separa de `apps/tpv` sin querer (drift)             | Aceptado: F4 los deja idénticos. Cuando MVP semana 1 los diverge intencionalmente, está documentado.                                                                                   |
| Plan de CI E2E ya escrito asume rutas/scripts específicos                | Verificado: el plan de CI invoca `pnpm --filter @simpletpv/tpv test:e2e` y `pnpm --filter @simpletpv/backoffice test:e2e` (Task 6 step 1 del plan CI). Encaja sin tocar el plan de CI. |
| Inter font no se carga (cae a system-ui)                                 | Aceptado: F4 no instala fuente web. MVP semana 1 decide (Google Fonts vs Fontsource vs nada).                                                                                          |
| Coverage de `packages/ui` (0% real porque solo hay 1 componente trivial) | Aceptado en F4. Suelo de cobertura en `coverage-threshold.json` solo aplica a `api` (no a `ui`). Si futuro plan de CI quiere incluir `ui` en ratchet, se añade entonces.               |

## 8. Definición de "done" para F4

- [ ] Todos los archivos de §4 existen con el contenido de §5.
- [ ] Los 15 checks de §6 pasan en limpio.
- [ ] F1, F2, F3 siguen verdes.
- [ ] El plan de CI (Task 6 del plan ya escrito) puede ejecutarse contra F4 sin modificaciones.
- [ ] El commit final de F4 es Conventional Commits y mergea en `main`.

## 9. Fuera de alcance — siguiente fase

- **Ejecución del plan de CI ya escrito** (`docs/superpowers/plans/2026-05-28-ci-pipeline.md`): F4 deja todo listo para que ese plan se ejecute en su Task 0 (verificación prerequisitos) y siguientes.
- **MVP semana 1** (arranca 2026-06-02): auth real, primer CRUD, primeras rutas con React Router, primeros stores Zustand, eliminación del header `X-Org-Id` stub, componentes shadcn adicionales en `packages/ui`.
- **Post-MVP**: Service Worker, PWA, i18n, Storybook si la lib crece.
