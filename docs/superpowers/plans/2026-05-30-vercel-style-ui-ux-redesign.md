# Vercel-Style UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar login, backoffice y TPV con una UI compacta estilo Vercel, manteniendo intacta la lógica de negocio.

**Architecture:** El rediseño se apoya primero en tokens y componentes presentacionales de `packages/ui`, después migra la composición visual de backoffice y finalmente el TPV. Los `data-testid`, stores, API clients, queries, roles y handlers existentes se conservan.

**Tech Stack:** React 19, Vite 8, Tailwind 4, CSS global existente, `@simpletpv/ui`, Vitest, Playwright.

---

## Guardrails

- No modificar `apps/*/src/lib/*`, `packages/auth/*`, `apps/api/*` ni Prisma sin aprobación explícita.
- No añadir Next.js, Vercel, shadcn CLI ni dependencias nuevas sin aprobación explícita.
- Conservar todos los `data-testid` existentes.
- Si un cambio exige alterar un handler, query key, DTO, store o regla de permisos, parar y preguntar.
- Cada task debe terminar con typecheck y revisión visual de las pantallas afectadas.

## File Map

- `packages/ui/src/styles/theme.css`: tokens, reset visual y utilidades compartidas.
- `packages/ui/src/styles/login.css`: rediseño del login.
- `packages/ui/src/components/Button.tsx`: variantes visuales del botón compartido.
- `packages/ui/src/components/Input.tsx`: input presentacional.
- `packages/ui/src/components/Panel.tsx`: contenedor presentacional para paneles.
- `packages/ui/src/components/Badge.tsx`: estados visuales.
- `packages/ui/src/components/EmptyState.tsx`: estados vacíos accionables.
- `packages/ui/src/index.ts`: exports de componentes.
- `packages/ui/package.json`: export CSS `./theme.css`.
- `apps/backoffice/src/App.tsx`: shell compacto con sidebar manteniendo `useState<Tab>`.
- `apps/backoffice/src/catalog.css`: lenguaje visual común de backoffice.
- `apps/backoffice/src/dashboard.css`: densidad y paneles de dashboard.
- `apps/tpv/src/App.tsx`: shell operativo de TPV manteniendo `useState`.
- `apps/tpv/src/sale.css`: layout, carrito, caja, producto, modales y subflujos TPV.

## Task 1: UI Foundation

**Files:**

- Create: `packages/ui/src/styles/theme.css`
- Create: `packages/ui/src/components/Input.tsx`
- Create: `packages/ui/src/components/Panel.tsx`
- Create: `packages/ui/src/components/Badge.tsx`
- Create: `packages/ui/src/components/EmptyState.tsx`
- Modify: `packages/ui/src/components/Button.tsx`
- Modify: `packages/ui/src/components/Button.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Add shared theme CSS**

Create `packages/ui/src/styles/theme.css` with these tokens and base utilities:

```css
:root {
  --ui-bg: #fafafa;
  --ui-surface: #ffffff;
  --ui-surface-subtle: #f5f5f5;
  --ui-border: #e5e5e5;
  --ui-border-strong: #d4d4d4;
  --ui-text: #171717;
  --ui-text-muted: #737373;
  --ui-text-soft: #a3a3a3;
  --ui-primary: #000000;
  --ui-primary-foreground: #ffffff;
  --ui-danger: #dc2626;
  --ui-danger-soft: #fef2f2;
  --ui-warning: #d97706;
  --ui-warning-soft: #fffbeb;
  --ui-success: #16a34a;
  --ui-success-soft: #f0fdf4;
  --ui-focus: 0 0 0 3px rgb(0 0 0 / 0.08);
  --ui-radius: 8px;
  --ui-radius-sm: 6px;
  --ui-shadow-panel: 0 1px 2px rgb(0 0 0 / 0.04);
}

html {
  background: var(--ui-bg);
}

body {
  margin: 0;
  color: var(--ui-text);
  background: var(--ui-bg);
  font-family:
    Geist,
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

button,
input,
select,
textarea {
  font: inherit;
}

.ui-shell {
  min-height: 100vh;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.ui-panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-panel);
}

.ui-muted {
  color: var(--ui-text-muted);
}

.ui-tabular {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Export `theme.css`**

Modify `packages/ui/package.json`:

```json
"exports": {
  ".": "./src/index.ts",
  "./login.css": "./src/styles/login.css",
  "./theme.css": "./src/styles/theme.css"
}
```

- [ ] **Step 3: Expand `Button` variants without changing behavior**

Replace `packages/ui/src/components/Button.tsx` with:

```tsx
import * as React from 'react';

import { cn } from '../lib/cn.js';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--ui-radius-sm)] border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3',
        size === 'md' && 'h-10 px-4',
        size === 'lg' && 'h-11 px-5 text-base',
        variant === 'primary' &&
          'border-[var(--ui-primary)] bg-[var(--ui-primary)] text-[var(--ui-primary-foreground)] hover:bg-neutral-800',
        variant === 'secondary' &&
          'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-subtle)] hover:text-[var(--ui-text)]',
        variant === 'danger' &&
          'border-[var(--ui-danger)] bg-[var(--ui-danger)] text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
```

- [ ] **Step 4: Add presentational primitives**

Create `packages/ui/src/components/Input.tsx`:

```tsx
import * as React from 'react';

import { cn } from '../lib/cn.js';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-[var(--ui-radius-sm)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none transition placeholder:text-[var(--ui-text-soft)] focus:border-[var(--ui-border-strong)] focus:shadow-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
```

Create `packages/ui/src/components/Panel.tsx`:

```tsx
import * as React from 'react';

import { cn } from '../lib/cn.js';

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-panel', className)} {...props} />;
}
```

Create `packages/ui/src/components/Badge.tsx`:

```tsx
import * as React from 'react';

import { cn } from '../lib/cn.js';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' &&
          'border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] text-[var(--ui-text-muted)]',
        tone === 'success' &&
          'border-green-200 bg-[var(--ui-success-soft)] text-[var(--ui-success)]',
        tone === 'warning' &&
          'border-amber-200 bg-[var(--ui-warning-soft)] text-[var(--ui-warning)]',
        tone === 'danger' && 'border-red-200 bg-[var(--ui-danger-soft)] text-[var(--ui-danger)]',
        className,
      )}
      {...props}
    />
  );
}
```

Create `packages/ui/src/components/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--ui-radius)] border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-8 text-center">
      <p className="text-sm font-medium text-[var(--ui-text)]">{title}</p>
      {children && <div className="mt-1 text-sm text-[var(--ui-text-muted)]">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Export primitives**

Modify `packages/ui/src/index.ts`:

```ts
export { Badge } from './components/Badge.js';
export { Button } from './components/Button.js';
export { EmptyState } from './components/EmptyState.js';
export { Input } from './components/Input.js';
export { LoginForm, type LoginFormProps } from './components/LoginForm.js';
export { Panel } from './components/Panel.js';
export { cn } from './lib/cn.js';
```

- [ ] **Step 6: Update button tests**

Modify `packages/ui/src/components/Button.test.tsx` to cover the new default and compatibility:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveClass('bg-[var(--ui-primary)]');
  });

  it('renders secondary and danger variants', () => {
    render(
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="danger">Eliminar</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass(
      'border-[var(--ui-border)]',
    );
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveClass('bg-[var(--ui-danger)]');
  });
});
```

- [ ] **Step 7: Verify Task 1**

Run:

```bash
pnpm --filter @simpletpv/ui typecheck
pnpm --filter @simpletpv/ui test
```

Expected: both commands pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add packages/ui
git commit -m "feat(ui): add compact design primitives"
```

## Task 2: Login Redesign

**Files:**

- Modify: `packages/ui/src/components/LoginForm.tsx`
- Modify: `packages/ui/src/styles/login.css`
- Modify: `apps/tpv/src/App.tsx`
- Modify: `apps/backoffice/src/App.tsx`

- [ ] **Step 1: Keep login API and test ids unchanged**

Do not change `LoginFormProps`, `onSubmit(email, password)`, `data-testid="login-email"`,
`data-testid="login-password"` or `data-testid="login-submit"`.

- [ ] **Step 2: Update login markup for clearer UX**

In `packages/ui/src/components/LoginForm.tsx`, keep the same state and submit
handler, but use this visual structure inside the return:

```tsx
return (
  <div className="login-shell">
    <section className="login-panel" data-testid="login-card">
      <div className="login-aside" aria-hidden>
        <span className="login-kicker">simpleTPV</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        <div className="login-steps">
          <span>1. Inicia sesión</span>
          <span>2. Elige tienda</span>
          <span>3. Empieza a trabajar</span>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="login-form" noValidate>
        <div>
          <h2>Entrar</h2>
          <p>Usa tu correo y contraseña de la tienda.</p>
        </div>
        <label className="login-field">
          <span className="login-label">Correo</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
            placeholder="admin@org1.test"
            data-testid="login-email"
          />
        </label>
        <label className="login-field">
          <span className="login-label">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            placeholder="password123"
            data-testid="login-password"
          />
        </label>
        {error && (
          <p className="login-error" role="alert" data-testid="login-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className={cn('login-submit', loading && 'is-loading')}
          data-testid="login-submit"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </section>
  </div>
);
```

- [ ] **Step 3: Replace login CSS with compact Vercel-style**

Replace `packages/ui/src/styles/login.css` with CSS that imports `theme.css`,
uses white/black panels, no decorative gradients, and keeps responsive behavior.
Required selectors:

```css
@import './theme.css';

.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    linear-gradient(var(--ui-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--ui-border) 1px, transparent 1px), var(--ui-bg);
  background-size: 48px 48px;
}

.login-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(20rem, 24rem);
  width: min(58rem, 100%);
  min-height: 34rem;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--ui-surface);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.08);
}

.login-aside {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2rem;
  border-right: 1px solid var(--ui-border);
  background: #0a0a0a;
  color: #fff;
}

.login-kicker,
.login-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-aside h1,
.login-form h2 {
  margin: 0;
  letter-spacing: -0.04em;
}

.login-aside p,
.login-form p {
  color: var(--ui-text-muted);
}

.login-aside p {
  color: #a3a3a3;
}

.login-steps {
  display: grid;
  gap: 0.5rem;
  font-size: 0.86rem;
  color: #d4d4d4;
}

.login-form {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
}

.login-field {
  display: grid;
  gap: 0.4rem;
}

.login-input {
  height: 2.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 0 0.8rem;
  outline: none;
}

.login-input:focus {
  border-color: var(--ui-border-strong);
  box-shadow: var(--ui-focus);
}

.login-error {
  margin: 0;
  border: 1px solid #fecaca;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-danger-soft);
  padding: 0.7rem 0.8rem;
  color: var(--ui-danger);
  font-size: 0.88rem;
}

.login-submit {
  height: 2.75rem;
  border: 1px solid #000;
  border-radius: var(--ui-radius-sm);
  background: #000;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.login-submit:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 760px) {
  .login-panel {
    grid-template-columns: 1fr;
  }

  .login-aside {
    display: none;
  }
}
```

- [ ] **Step 4: Import theme CSS in both apps**

Ensure `apps/tpv/src/App.tsx` and `apps/backoffice/src/App.tsx` import
`@simpletpv/ui/theme.css` before app-specific CSS:

```tsx
import '@simpletpv/ui/theme.css';
import '@simpletpv/ui/login.css';
```

- [ ] **Step 5: Verify Task 2**

Run:

```bash
pnpm --filter @simpletpv/ui typecheck
pnpm --filter @simpletpv/tpv typecheck
pnpm --filter @simpletpv/backoffice typecheck
```

Open:

- `http://localhost:5173`
- `http://localhost:5174`

Expected:

- Login loads on both apps.
- Valid credentials still log in.
- Invalid credentials still show `data-testid="login-error"`.
- No unrelated logic files changed.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/ui apps/tpv/src/App.tsx apps/backoffice/src/App.tsx
git commit -m "feat(ui): redesign login experience"
```

## Task 3: Backoffice Shell

**Files:**

- Modify: `apps/backoffice/src/App.tsx`
- Modify: `apps/backoffice/src/catalog.css`

- [ ] **Step 1: Keep tab state and authorization logic unchanged**

Do not alter:

```tsx
const [tab, setTab] = useState<Tab>('dashboard');
if (getRole() !== 'ADMIN') {
  return <AccessDenied />;
}
```

- [ ] **Step 2: Replace backoffice Home layout with shell markup**

In `apps/backoffice/src/App.tsx`, update only presentation around existing tab
rendering. Use `TABS` and `setTab` exactly as now:

```tsx
function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('dashboard');
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <main className="bo-shell">
      <aside className="bo-sidebar">
        <div className="bo-brand">
          <span className="bo-logo">s</span>
          <div>
            <strong>simpleTPV</strong>
            <span>Backoffice</span>
          </div>
        </div>
        <nav className="bo-nav" aria-label="Navegación principal">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`bo-nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="bo-main">
        <header className="bo-topbar">
          <div>
            <span className="bo-eyebrow">Administración</span>
            <h1>{active.label}</h1>
          </div>
          <Button variant="secondary" onClick={logout} data-testid="logout">
            Cerrar sesión
          </Button>
        </header>
        <div className="bo-content">
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'catalog' && <CatalogPage />}
          {tab === 'families' && <FamiliesPage />}
          {tab === 'users' && <UsersPage />}
          {tab === 'stores' && <StoresPage />}
          {tab === 'sales' && <SalesHistoryPage />}
          {tab === 'stock' && <StockPage />}
          {tab === 'purchases' && <PurchasesPage />}
          {tab === 'verifactu' && <VerifactuPage />}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Add shell CSS**

Add to the top of `apps/backoffice/src/catalog.css`:

```css
.bo-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  background: var(--ui-bg);
}

.bo-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  border-right: 1px solid var(--ui-border);
  background: var(--ui-surface);
  padding: 1rem;
}

.bo-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.25rem 1.25rem;
}

.bo-logo {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-primary);
  color: var(--ui-primary-foreground);
  font-weight: 700;
}

.bo-brand div {
  display: grid;
  gap: 0.1rem;
}

.bo-brand span:last-child {
  color: var(--ui-text-muted);
  font-size: 0.78rem;
}

.bo-nav {
  display: grid;
  gap: 0.25rem;
}

.bo-nav-item {
  height: 2.25rem;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 0 0.75rem;
  text-align: left;
  font-size: 0.9rem;
}

.bo-nav-item:hover,
.bo-nav-item.active {
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
}

.bo-main {
  min-width: 0;
}

.bo-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ui-border);
  background: rgb(250 250 250 / 0.86);
  padding: 1rem 1.5rem;
  backdrop-filter: blur(12px);
}

.bo-eyebrow {
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.bo-topbar h1 {
  margin: 0.15rem 0 0;
  font-size: 1.25rem;
  letter-spacing: -0.03em;
}

.bo-content {
  padding: 1.5rem;
}

@media (max-width: 860px) {
  .bo-shell {
    grid-template-columns: 1fr;
  }

  .bo-sidebar {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
  }

  .bo-nav {
    display: flex;
    overflow-x: auto;
  }

  .bo-nav-item {
    white-space: nowrap;
  }
}
```

- [ ] **Step 4: Verify Task 3**

Run:

```bash
pnpm --filter @simpletpv/backoffice typecheck
```

Open `http://localhost:5174` with `admin@org1.test / password123`.

Expected:

- Sidebar shows all current tabs.
- Clicking every tab still renders its existing page.
- `clerk@org1.test` still sees access denied.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/backoffice/src/App.tsx apps/backoffice/src/catalog.css
git commit -m "feat(backoffice): add compact admin shell"
```

## Task 4: Backoffice Dashboard and Tables

**Files:**

- Modify: `apps/backoffice/src/catalog.css`
- Modify: `apps/backoffice/src/dashboard.css`

- [ ] **Step 1: Make page containers full-width inside shell**

Update `.catalog` in `apps/backoffice/src/catalog.css`:

```css
.catalog {
  width: 100%;
  max-width: 82rem;
  margin: 0 auto;
}
```

- [ ] **Step 2: Convert headers, actions and tables to compact neutral style**

Replace existing `.catalog-head`, `.catalog-actions`, `.catalog-search`,
`.btn-primary`, `.catalog-table`, `.row-actions`, `.modal`, `.bo-tabs` and
`.bo-tab` blocks with neutral Vercel-style equivalents using `var(--ui-*)`.
Required behavior:

```css
.catalog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.catalog-head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.catalog-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.catalog-search,
.modal input,
.modal select {
  height: 2.35rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  padding: 0 0.7rem;
  color: var(--ui-text);
  font-size: 0.88rem;
  outline: none;
}

.catalog-search:focus,
.modal input:focus,
.modal select:focus {
  border-color: var(--ui-border-strong);
  box-shadow: var(--ui-focus);
}

.btn-primary {
  height: 2.35rem;
  border: 1px solid var(--ui-primary);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-primary);
  color: var(--ui-primary-foreground);
  padding: 0 0.85rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.catalog-table {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  border-spacing: 0;
  border-collapse: separate;
  background: var(--ui-surface);
  font-size: 0.86rem;
}

.catalog-table th {
  background: var(--ui-surface-subtle);
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
}

.catalog-table th,
.catalog-table td {
  border-bottom: 1px solid var(--ui-border);
  padding: 0.55rem 0.7rem;
}

.catalog-table tr:last-child td {
  border-bottom: 0;
}

.row-actions button,
.link-btn {
  color: var(--ui-text);
  text-decoration: none;
}

.row-actions button.danger {
  color: var(--ui-danger);
}

.bo-tabs {
  display: inline-flex;
  gap: 0.25rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  padding: 0.2rem;
}

.bo-tab {
  min-height: 1.9rem;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 0 0.65rem;
  font-size: 0.82rem;
  font-weight: 500;
}

.bo-tab.active {
  background: var(--ui-primary);
  color: var(--ui-primary-foreground);
}
```

- [ ] **Step 3: Redesign dashboard CSS**

Replace `apps/backoffice/src/dashboard.css` with a compact grid:

```css
.dash-period {
  margin: 0;
}

.dash-cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.dash-card,
.dash-stat,
.dash-panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-panel);
}

.dash-card,
.dash-stat {
  display: flex;
  min-height: 5rem;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.75rem;
}

.dash-card-label {
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  font-weight: 500;
}

.dash-card-value {
  font-size: 1.35rem;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.dash-card-delta {
  font-size: 0.75rem;
  font-weight: 600;
}

.dash-delta-up {
  color: var(--ui-success);
}

.dash-delta-down {
  color: var(--ui-danger);
}

.dash-delta-flat {
  color: var(--ui-text-soft);
}

.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(20rem, 0.7fr);
  gap: 1rem;
}

.dash-panel {
  min-width: 0;
  padding: 1rem;
}

.dash-panel h3 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.dash-stockout-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.6rem;
}

.dash-stat-warn {
  border-color: #fcd34d;
  background: var(--ui-warning-soft);
}

.dash-rank-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1100px) {
  .dash-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dash-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .dash-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 4: Verify Task 4**

Run:

```bash
pnpm --filter @simpletpv/backoffice typecheck
pnpm --filter @simpletpv/backoffice test:e2e
```

Expected: dashboard E2E still passes, dashboard is denser, tables remain readable.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/backoffice/src/catalog.css apps/backoffice/src/dashboard.css
git commit -m "feat(backoffice): compact dashboard and tables"
```

## Task 5: Backoffice Operational Views Polish

**Files:**

- Modify: `apps/backoffice/src/catalog.css`
- Review only: `apps/backoffice/src/CatalogPage.tsx`
- Review only: `apps/backoffice/src/FamiliesPage.tsx`
- Review only: `apps/backoffice/src/PurchasesPage.tsx`
- Review only: `apps/backoffice/src/SalesHistoryPage.tsx`
- Review only: `apps/backoffice/src/StockPage.tsx`
- Review only: `apps/backoffice/src/StoresPage.tsx`
- Review only: `apps/backoffice/src/UsersPage.tsx`
- Review only: `apps/backoffice/src/VerifactuPage.tsx`

- [ ] **Step 1: Improve empty and error states via CSS**

Update `.catalog-empty`, `.form-error`, `.sale-tag-voided`, `.stock-tag` and
status classes in `catalog.css` to use neutral tokens:

```css
.catalog-empty {
  display: grid;
  place-items: center;
  min-height: 8rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  font-size: 0.9rem;
}

.form-error {
  margin: 0 0 0.75rem;
  border: 1px solid #fecaca;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
  padding: 0.65rem 0.75rem;
  font-size: 0.86rem;
}

.sale-tag-voided,
.stock-tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface-subtle);
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.sale-tag-voided,
.stock-tag.stock-red {
  border-color: #fecaca;
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}

.stock-tag.stock-yellow {
  border-color: #fde68a;
  background: var(--ui-warning-soft);
  color: var(--ui-warning);
}
```

- [ ] **Step 2: Review views without changing logic**

Open each reviewed TSX file and confirm any JSX edits are limited to:

- className additions,
- copy clarifications,
- grouping existing controls,
- reordering visual blocks without changing handlers.

Do not modify `useQuery`, `useMutation`, handler bodies, DTO construction,
imports from `./lib/*`, or data transformations.

- [ ] **Step 3: Verify Task 5**

Run:

```bash
pnpm --filter @simpletpv/backoffice typecheck
```

Manual review in `http://localhost:5174`:

- Dashboard
- Catálogo
- Familias
- Usuarios
- Tiendas
- Ventas
- Stock
- Compras
- VeriFactu

Expected: all tabs remain reachable and visually consistent.

- [ ] **Step 4: Commit Task 5**

```bash
git add apps/backoffice/src
git commit -m "feat(backoffice): polish operational views"
```

## Task 6: TPV Shell and Sale Workspace

**Files:**

- Modify: `apps/tpv/src/App.tsx`
- Modify: `apps/tpv/src/sale.css`

- [ ] **Step 1: Import shared theme in TPV**

Ensure `apps/tpv/src/App.tsx` starts with:

```tsx
import '@simpletpv/ui/theme.css';
import '@simpletpv/ui/login.css';
import './sale.css';
```

- [ ] **Step 2: Replace TPV Home wrapper with an operational shell**

Keep `const [view, setView] = useState<'sale' | 'return' | 'transfers'>('sale');`.
Only change markup around existing view rendering:

```tsx
return (
  <main className="tpv-shell">
    <header className="tpv-topbar">
      <div>
        <span className="tpv-eyebrow">Punto de venta</span>
        <h1>simpleTPV</h1>
      </div>
      <div className="tpv-nav">
        <button
          className={`tpv-tab ${view === 'sale' ? 'active' : ''}`}
          onClick={() => setView('sale')}
          data-testid="tab-sale"
        >
          Venta
        </button>
        <button
          className={`tpv-tab ${view === 'return' ? 'active' : ''}`}
          onClick={() => setView('return')}
          data-testid="tab-return"
        >
          Devolución
        </button>
        <button
          className={`tpv-tab ${view === 'transfers' ? 'active' : ''}`}
          onClick={() => setView('transfers')}
          data-testid="tab-transfers"
        >
          Traspasos
        </button>
        <Button variant="secondary" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
    </header>
    <section className="tpv-content">
      {view === 'sale' && <SalePage />}
      {view === 'return' && <ReturnsView />}
      {view === 'transfers' && <TransferReceivePanel />}
    </section>
  </main>
);
```

- [ ] **Step 3: Add shell and workspace CSS**

At the top of `apps/tpv/src/sale.css`, add:

```css
.tpv-shell {
  min-height: 100vh;
  background: var(--ui-bg);
}

.tpv-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--ui-border);
  background: rgb(250 250 250 / 0.9);
  padding: 0.9rem 1.25rem;
  backdrop-filter: blur(12px);
}

.tpv-eyebrow {
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tpv-topbar h1 {
  margin: 0.1rem 0 0;
  font-size: 1.25rem;
  letter-spacing: -0.04em;
}

.tpv-content {
  padding: 1.25rem;
}

.sale-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(20rem, 24rem);
  gap: 1rem;
  align-items: start;
  max-width: 90rem;
  margin: 0 auto;
}

.sale-layout .sale {
  max-width: none;
  margin: 0;
}

@media (max-width: 980px) {
  .tpv-topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .tpv-nav {
    width: 100%;
    overflow-x: auto;
  }

  .sale-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Restyle sale search, chips and product cards**

In `sale.css`, update `.sale-search`, `.fam-chip`, `.sale-grid`, `.prod-card`,
`.prod-price` and stock styles to use neutral tokens. Required outcomes:

- Search is visually dominant.
- Family chips are compact.
- Product cards have white background, thin border, and clear price.
- Stock badges keep green/yellow/red meaning.

- [ ] **Step 5: Verify Task 6**

Run:

```bash
pnpm --filter @simpletpv/tpv typecheck
```

Open `http://localhost:5173` with `admin@org1.test / password123`.

Expected:

- Venta, Devolución and Traspasos tabs still switch.
- Product click still adds to cart.
- Search still filters.
- Store selector still works.

- [ ] **Step 6: Commit Task 6**

```bash
git add apps/tpv/src/App.tsx apps/tpv/src/sale.css
git commit -m "feat(tpv): add compact sales workspace"
```

## Task 7: TPV Cart, Cash, Payment and Subflows

**Files:**

- Modify: `apps/tpv/src/sale.css`
- Review only: `apps/tpv/src/CartPanel.tsx`
- Review only: `apps/tpv/src/CashPanel.tsx`
- Review only: `apps/tpv/src/PaymentModal.tsx`
- Review only: `apps/tpv/src/DiscountModal.tsx`
- Review only: `apps/tpv/src/ReturnPanel.tsx`
- Review only: `apps/tpv/src/BlindReturnPanel.tsx`
- Review only: `apps/tpv/src/TransferReceivePanel.tsx`

- [ ] **Step 1: Restyle cart panel and checkout controls**

Update `.cart`, `.cart-lines`, `.cart-line`, `.cart-foot`, `.cart-create`,
`.cart-discount`, `.cart-msg`, `.cart-cash-warning` and `.cart-api-warning` to
make blockers explicit. Required CSS pattern:

```css
.cart {
  position: sticky;
  top: 5.25rem;
  max-height: calc(100vh - 6.5rem);
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  padding: 1rem;
  box-shadow: var(--ui-shadow-panel);
}

.cart-title {
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.cart-create {
  min-height: 2.75rem;
  border: 1px solid var(--ui-primary);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-primary);
  color: var(--ui-primary-foreground);
  font-weight: 700;
  cursor: pointer;
}

.cart-create:disabled {
  border-color: var(--ui-border);
  background: var(--ui-surface-subtle);
  color: var(--ui-text-muted);
  cursor: not-allowed;
}

.cart-msg {
  margin: 0;
  border-radius: var(--ui-radius-sm);
  padding: 0.65rem 0.75rem;
  font-size: 0.86rem;
}

.cart-cash-warning,
.cart-api-warning {
  border: 1px solid #fde68a;
  background: var(--ui-warning-soft);
  color: var(--ui-warning);
}
```

- [ ] **Step 2: Restyle cash and payment modal**

Update `.cash-panel`, `.cash-badge-*`, `.pay-overlay`, `.pay-modal`,
`.pay-method`, `.pay-confirm`, `.pay-cancel`, `.modal`, `.modal-backdrop` to
use the same neutral panel and button language. Keep dangerous close/cancel
actions distinct but not visually louder than the primary flow.

- [ ] **Step 3: Restyle returns and transfers**

Update `.return-panel`, `.return-line`, `.blind-field`, `.blind-picked`,
`.transfer-receive`, `.transfer-list`, `.cart-table` with thin borders,
compact rows and clear empty states.

- [ ] **Step 4: Review JSX only if CSS cannot solve clarity**

If a TPV TSX file needs markup changes, limit them to class names or text.
Do not alter:

- `onConfirmPayment`
- `openCheckout`
- `onVoid`
- `newSale`
- `useQuery` calls
- `useMutation` calls
- cart store calls
- imported functions from `./lib/*`

- [ ] **Step 5: Verify Task 7**

Run:

```bash
pnpm --filter @simpletpv/tpv typecheck
pnpm --filter @simpletpv/tpv test:e2e
```

Manual review in `http://localhost:5173`:

- Login.
- Open cash session.
- Add product.
- Checkout.
- New sale.
- Return tab.
- Transfers tab.

Expected: existing E2E passes and all blockers are visually explicit.

- [ ] **Step 6: Commit Task 7**

```bash
git add apps/tpv/src
git commit -m "feat(tpv): polish cart and operational flows"
```

## Task 8: Final Verification and Cleanup

**Files:**

- Review: `git diff b6a7a3c..HEAD`
- Modify: CSS presentation files only when a visual bug is observed during the manual smoke.

- [ ] **Step 1: Run full frontend checks**

Run:

```bash
pnpm --filter @simpletpv/ui typecheck
pnpm --filter @simpletpv/ui test
pnpm --filter @simpletpv/backoffice typecheck
pnpm --filter @simpletpv/tpv typecheck
```

Expected: all pass.

- [ ] **Step 2: Run E2E checks covered by UI changes**

Run:

```bash
pnpm --filter @simpletpv/backoffice test:e2e
pnpm --filter @simpletpv/tpv test:e2e
```

Expected: both pass with existing test ids.

- [ ] **Step 3: Check forbidden changes**

Run:

```bash
git diff --name-only b6a7a3c..HEAD
```

Expected: changed files are limited to `packages/ui`, `apps/backoffice/src`
presentation files, `apps/tpv/src` presentation files, and docs. No backend,
database, auth package or frontend `lib/*` files unless the user approved them.

- [ ] **Step 4: Manual visual smoke**

Open:

- `http://localhost:5173`
- `http://localhost:5174`

Check:

- Login is understandable without instructions.
- Backoffice navigation exposes all areas in one shell.
- Dashboard is compact and readable.
- TPV core flow is obvious: open cash, search/scan, add product, checkout.
- Disabled checkout explains exactly what is missing.

- [ ] **Step 5: Commit final cleanup if needed**

Only if cleanup changes were made:

```bash
git add apps packages
git commit -m "fix(ui): cleanup redesign polish"
```

## Self-Review

- Spec coverage: covered base visual, login, backoffice shell, backoffice views,
  TPV shell, TPV sale/cash/cart, TPV subflows, verification and no-logic guard.
- Placeholder scan: no deferred requirements or undefined tasks.
- Type consistency: component names and file paths match `packages/ui` and app
  structure currently present in the repository.
- Scope control: plan explicitly forbids backend, data, auth, stores and
  deployment changes without user approval.
