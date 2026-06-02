# TPV calcado a mockups con capa demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar las cuatro pantallas del TPV (Venta, Devolución, Traspasos, Caja) idénticas a los mockups aprobados, alimentadas por una capa de datos demo hardcodeados, con login mockeado y sin tocar el backend.

**Architecture:** El TPV arranca siempre en modo demo. Una capa `demo/` provee datos calcados a los mockups; las funciones de `apps/tpv/src/lib/*` (catalog, cash, transfers, sales, stock) se reescriben para devolver esos datos en lugar de llamar a la API, y `api.login` se mockea para aceptar cualquier credencial. El sidebar pasa a fijo-expandido con bloque de usuario; se añade un `TopBar` compartido con eyebrow+título y toggle Backoffice/TPV (visual) + Salir. No se modifica `packages/auth` ni el backend.

**Tech Stack:** React 19, Vite 6, TypeScript, Zustand, @tanstack/react-query, lucide-react, Playwright. Estilos en CSS plano (variables `--ui-*` en `packages/ui/src/styles/theme.css`) + algo de Tailwind utility en componentes existentes.

---

## File Structure

**Crear:**

- `packages/ui/src/components/TopBar.tsx` — cabecera: eyebrow+título / toggle BO·TPV + Salir.
- `packages/ui/src/styles/topbar.css` — estilos del TopBar.
- `apps/tpv/src/demo/demoData.ts` — datos demo (productos, familias, stock, caja, traspasos, ticket, JWT falso, usuario).

**Modificar:**

- `packages/ui/src/components/Sidebar.tsx` — fijo expandido + bloque de usuario en footer.
- `packages/ui/src/styles/sidebar.css` — ajustes para fijo expandido + estilos del bloque de usuario.
- `packages/ui/src/index.ts` — exportar `TopBar`.
- `apps/tpv/src/lib/catalog.ts`, `lib/cash.ts`, `lib/transfers.ts`, `lib/sales.ts`, `lib/stock.ts` — devolver datos demo.
- `apps/tpv/src/lib/auth.ts` — login mockeado.
- `apps/tpv/src/App.tsx` — shell con Sidebar + TopBar; título por vista; precarga del carrito; usuario.
- `apps/tpv/src/styles.css` — shell con cabecera.
- `apps/tpv/src/SalePage.tsx` — Venta calcada.
- `apps/tpv/src/CashPanel.tsx` — barra de caja con "Esperado en caja".
- `apps/tpv/src/CartPanel.tsx` — "Ticket actual".
- `apps/tpv/src/sale.css` — estilos de las 4 vistas (caja, ticket, devolución, traspasos, caja-vista).
- `apps/tpv/src/App.tsx` (`ReturnsView`, `CashView`) — composición de Devolución y Caja.
- `apps/tpv/src/ReturnPanel.tsx` — estado vacío centrado calcado.
- `apps/tpv/src/TransferReceivePanel.tsx` — tabla de traspasos.
- `apps/tpv/e2e/login.spec.ts`, `sale-search.spec.ts`, `scanner.spec.ts`, `checkout.spec.ts` — reescritos para modo demo.

---

## Task 1: Datos demo

**Files:**

- Create: `apps/tpv/src/demo/demoData.ts`

Datos calcados a los mockups. Un JWT falso (header.payload.signature en base64url, sin firma válida) con `role: 'CLERK'` para que `getRole()` devuelva CLERK. Tipos reales de `@simpletpv/auth` (precios/decimales como `string`).

- [ ] **Step 1: Crear el módulo de datos demo**

```typescript
// apps/tpv/src/demo/demoData.ts
import type { CashSession, FamilyNode, Product, StockRow, Store, Transfer } from '@simpletpv/auth';

// ─── Identidad demo ──────────────────────────────────────────
export const DEMO_STORE_ID = 'demo-store-centro';
export const DEMO_USER = { name: 'Marta Ruiz', email: 'marta@centro.demo' };
export const DEMO_STORE_LABEL = 'Tienda Centro';

export const DEMO_STORES: Store[] = [
  { id: DEMO_STORE_ID, name: 'Tienda Centro', address: null, code: 'CENTRO', active: true },
];

// JWT falso (sin firma válida; solo para que getRole() lea role=CLERK).
// header={"alg":"none","typ":"JWT"} payload={"sub":"demo","organizationId":"demo-org","role":"CLERK"}
export const DEMO_JWT =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0' +
  '.eyJzdWIiOiJkZW1vIiwib3JnYW5pemF0aW9uSWQiOiJkZW1vLW9yZyIsInJvbGUiOiJDTEVSSyJ9' +
  '.demo';

// ─── Familias (con sus contadores en los chips) ──────────────
// El chip "Todas" muestra 88; los chips de familia, sus contadores fijos.
export const DEMO_FAMILY_COUNTS: Record<string, number> = {
  'fam-flores': 42,
  'fam-aceites': 12,
  'fam-cosmetica': 18,
  'fam-vapeo': 9,
  'fam-infusiones': 7,
};
export const DEMO_TOTAL_COUNT = 88;

export const DEMO_FAMILIES: FamilyNode[] = [
  {
    id: 'fam-flores',
    parentId: null,
    name: 'Flores CBD',
    color: '#16734f',
    icon: null,
    sortOrder: 1,
    children: [],
  },
  {
    id: 'fam-aceites',
    parentId: null,
    name: 'Aceites',
    color: '#b45309',
    icon: null,
    sortOrder: 2,
    children: [],
  },
  {
    id: 'fam-cosmetica',
    parentId: null,
    name: 'Cosmética',
    color: '#7c3aed',
    icon: null,
    sortOrder: 3,
    children: [],
  },
  {
    id: 'fam-vapeo',
    parentId: null,
    name: 'Vapeo',
    color: '#2563eb',
    icon: null,
    sortOrder: 4,
    children: [],
  },
  {
    id: 'fam-infusiones',
    parentId: null,
    name: 'Infusiones',
    color: '#0e7c6b',
    icon: null,
    sortOrder: 5,
    children: [],
  },
];

// ─── Productos (12, calcados al mockup de Venta) ─────────────
function product(id: string, name: string, salePrice: string, familyId: string): Product {
  return {
    id,
    name,
    sku: id.toUpperCase(),
    barcode: null,
    description: null,
    salePrice,
    costPrice: '0',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'ud',
    familyId,
    active: true,
  };
}

export const DEMO_PRODUCTS: Product[] = [
  product('p-aceite-cbd-10', 'Aceite CBD 10%', '24.90', 'fam-aceites'),
  product('p-flor-lemon-haze', 'Flor Lemon Haze 2g', '14.50', 'fam-flores'),
  product('p-crema-regeneradora', 'Crema regeneradora 50ml', '19.90', 'fam-cosmetica'),
  product('p-vapeador-pro', 'Vapeador Pro', '39.00', 'fam-vapeo'),
  product('p-resina-premium', 'Resina Premium 1g', '22.00', 'fam-flores'),
  product('p-infusion-relax', 'Infusión relax 20u', '8.90', 'fam-infusiones'),
  product('p-aceite-cbd-5', 'Aceite CBD 5%', '16.90', 'fam-aceites'),
  product('p-flor-premium', 'Flor Premium 3,5g', '29.90', 'fam-flores'),
  product('p-balsamo-muscular', 'Bálsamo muscular', '12.50', 'fam-cosmetica'),
  product('p-liquido-vape', 'Líquido vape 10ml', '9.90', 'fam-vapeo'),
  product('p-infusion-noche', 'Infusión noche 15u', '7.50', 'fam-infusiones'),
  product('p-aceite-full', 'Aceite full spectrum', '34.00', 'fam-aceites'),
];

// ─── Stock por producto (cantidad + nivel del badge) ─────────
// Vapeador Pro: cantidad 0 → la tarjeta muestra el badge "Agotado".
const STOCK: Array<{ productId: string; quantity: number; level: StockRow['level'] }> = [
  { productId: 'p-aceite-cbd-10', quantity: 18, level: 'green' },
  { productId: 'p-flor-lemon-haze', quantity: 3, level: 'yellow' },
  { productId: 'p-crema-regeneradora', quantity: 11, level: 'green' },
  { productId: 'p-vapeador-pro', quantity: 0, level: 'red' },
  { productId: 'p-resina-premium', quantity: 25, level: 'green' },
  { productId: 'p-infusion-relax', quantity: 4, level: 'yellow' },
  { productId: 'p-aceite-cbd-5', quantity: 30, level: 'green' },
  { productId: 'p-flor-premium', quantity: 12, level: 'green' },
  { productId: 'p-balsamo-muscular', quantity: 9, level: 'green' },
  { productId: 'p-liquido-vape', quantity: 2, level: 'yellow' },
  { productId: 'p-infusion-noche', quantity: 16, level: 'green' },
  { productId: 'p-aceite-full', quantity: 6, level: 'yellow' },
];

export const DEMO_STOCK_ROWS: StockRow[] = STOCK.map((s) => {
  const p = DEMO_PRODUCTS.find((x) => x.id === s.productId)!;
  return {
    productId: s.productId,
    productName: p.name,
    storeId: DEMO_STORE_ID,
    quantity: s.quantity,
    minStock: 5,
    level: s.level,
  };
});

// ─── Sesión de caja abierta ──────────────────────────────────
// Apertura 150,00 € · Ventas efectivo 312,40 € · Esperado 462,40 €.
export const DEMO_CASH_OPENING = 150;
export const DEMO_CASH_SALES = 312.4;
export const DEMO_CASH_EXPECTED = 462.4;

export const DEMO_CASH_SESSION: CashSession = {
  id: 'demo-cash-session',
  storeId: DEMO_STORE_ID,
  userId: 'demo',
  openingAmount: '150.00',
  closingAmount: null,
  expectedAmount: '462.40',
  difference: null,
  status: 'OPEN',
  openedAt: '2026-06-02T08:00:00.000Z',
  closedAt: null,
};

// ─── Carrito precargado (3 líneas del mockup "Ticket actual") ─
// Base imponible 60,99 € · IVA (21%) 12,81 € · Total 73,80 €.
export const DEMO_CART_LINES: Array<{
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}> = [
  { productId: 'p-aceite-cbd-10', name: 'Aceite CBD 10%', unitPrice: 24.9, qty: 1 },
  { productId: 'p-flor-lemon-haze', name: 'Flor Lemon Haze 2g', unitPrice: 14.5, qty: 2 },
  { productId: 'p-crema-regeneradora', name: 'Crema regeneradora 50ml', unitPrice: 19.9, qty: 1 },
];

// ─── Traspasos (tabla de recepción) ──────────────────────────
function transferLines(n: number): Transfer['lines'] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tl-${i}`,
    transferId: 't',
    productId: DEMO_PRODUCTS[i % DEMO_PRODUCTS.length]!.id,
    quantitySent: '1',
    quantityReceived: null,
    discrepancy: null,
    discrepancyNote: null,
  }));
}

export const DEMO_TRANSFERS: Transfer[] = [
  {
    id: 'demo-transfer-pending',
    originStoreId: 'central',
    destStoreId: DEMO_STORE_ID,
    status: 'SENT',
    notes: null,
    createdBy: 'central',
    createdAt: '2026-05-31T08:30:00.000Z',
    sentAt: '2026-05-31T08:30:00.000Z',
    receivedAt: null,
    closedAt: null,
    lines: transferLines(7),
  },
  {
    id: 'demo-transfer-received',
    originStoreId: 'central',
    destStoreId: DEMO_STORE_ID,
    status: 'RECEIVED',
    notes: null,
    createdBy: 'central',
    createdAt: '2026-05-29T16:10:00.000Z',
    sentAt: '2026-05-29T16:10:00.000Z',
    receivedAt: '2026-05-29T16:40:00.000Z',
    closedAt: null,
    lines: transferLines(4),
  },
];
```

- [ ] **Step 2: Typecheck del módulo**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit`
Expected: PASS (sin errores). Si algún campo no casa con los tipos de `@simpletpv/auth`, ajustar al tipo real (revisar `packages/auth/src/api-types.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/tpv/src/demo/demoData.ts
git commit -m "feat(tpv): datos demo calcados a los mockups"
```

---

## Task 2: Interceptar lib/\* con datos demo + login mockeado

**Files:**

- Modify: `apps/tpv/src/lib/catalog.ts`, `lib/cash.ts`, `lib/transfers.ts`, `lib/sales.ts`, `lib/stock.ts`, `lib/auth.ts`

Cada función devuelve los datos demo (vía `Promise.resolve`) en vez de llamar a `api`. Se conservan las firmas y los reexports de tipos para no romper imports.

- [ ] **Step 1: catalog.ts → demo**

```typescript
// apps/tpv/src/lib/catalog.ts
import { ApiError, type FamilyNode, type Product } from '@simpletpv/auth';

import { DEMO_FAMILIES, DEMO_PRODUCTS } from '../demo/demoData.js';

export type { FamilyNode, Product };

export function searchProducts(search: string, familyId: string | null): Promise<Product[]> {
  const term = search.trim().toLowerCase();
  const filtered = DEMO_PRODUCTS.filter((p) => {
    const matchFamily = familyId === null || p.familyId === familyId;
    const matchTerm =
      term === '' ||
      p.name.toLowerCase().includes(term) ||
      (p.sku ?? '').toLowerCase().includes(term);
    return matchFamily && matchTerm;
  });
  return Promise.resolve(filtered);
}

export function listFamilies(): Promise<FamilyNode[]> {
  return Promise.resolve(DEMO_FAMILIES);
}

export function findByBarcode(code: string): Promise<Product | null> {
  void ApiError; // tipo reexportado por compatibilidad
  const found = DEMO_PRODUCTS.find((p) => p.barcode === code) ?? null;
  return Promise.resolve(found);
}
```

> Nota: `searchProducts('', null)` devuelve los 12 productos. El contador "Todas" del chip usa `DEMO_TOTAL_COUNT` (88) y los chips de familia `DEMO_FAMILY_COUNTS` — se cablean en Task 6, no desde aquí.

- [ ] **Step 2: cash.ts → demo**

```typescript
// apps/tpv/src/lib/cash.ts
import type { CashSession, OpenCashSessionInput } from '@simpletpv/auth';

import { DEMO_CASH_SESSION } from '../demo/demoData.js';

export type { CashSession };

export function openCashSession(_input: OpenCashSessionInput): Promise<CashSession> {
  return Promise.resolve(DEMO_CASH_SESSION);
}

export function closeCashSession(_id: string, countedAmount: number): Promise<CashSession> {
  const expected = Number(DEMO_CASH_SESSION.expectedAmount ?? 0);
  return Promise.resolve({
    ...DEMO_CASH_SESSION,
    status: 'CLOSED',
    closingAmount: countedAmount.toFixed(2),
    difference: (countedAmount - expected).toFixed(2),
    closedAt: '2026-06-02T14:00:00.000Z',
  });
}

export function currentCashSession(_storeId: string): Promise<CashSession | null> {
  return Promise.resolve(DEMO_CASH_SESSION);
}
```

- [ ] **Step 3: stock.ts → demo**

```typescript
// apps/tpv/src/lib/stock.ts
import type { StockByProductRow, StockRow } from '@simpletpv/auth';

import { DEMO_STOCK_ROWS, DEMO_STORE_ID, DEMO_STORE_LABEL } from '../demo/demoData.js';

export type { StockByProductRow, StockRow };

export function getStoreStock(_storeId: string): Promise<StockRow[]> {
  return Promise.resolve(DEMO_STOCK_ROWS);
}

export function getProductStock(productId: string): Promise<StockByProductRow[]> {
  const row = DEMO_STOCK_ROWS.find((r) => r.productId === productId);
  if (!row) return Promise.resolve([]);
  return Promise.resolve([
    {
      productId,
      storeId: DEMO_STORE_ID,
      storeName: DEMO_STORE_LABEL,
      quantity: row.quantity,
      minStock: row.minStock,
      level: row.level,
    },
  ]);
}
```

- [ ] **Step 4: sales.ts → demo**

```typescript
// apps/tpv/src/lib/sales.ts
import type { CreateSaleInput, Sale, SaleTicket, Store } from '@simpletpv/auth';

import { DEMO_STORES } from '../demo/demoData.js';

export type { Sale, SaleTicket, Store };

export function listStores(): Promise<Store[]> {
  return Promise.resolve(DEMO_STORES);
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  const total = '73.80';
  return Promise.resolve({
    id: 'demo-sale',
    storeId: input.storeId,
    userId: 'demo',
    ticketNumber: 'T01-000042',
    subtotal: '60.99',
    discountTotal: '0',
    total,
    paymentMethod: input.paymentMethod,
    cashGiven: input.cashGiven != null ? input.cashGiven.toFixed(2) : null,
    cashChange: input.cashGiven != null ? (input.cashGiven - Number(total)).toFixed(2) : null,
    status: 'COMPLETED',
    voidedAt: null,
    voidedBy: null,
    createdAt: '2026-06-02T14:05:00.000Z',
    lines: [],
  });
}

export function getTicket(_id: string): Promise<SaleTicket> {
  return Promise.resolve({
    organization: { name: 'SimpleTPV', nif: 'B12345678' },
    store: { name: 'Tienda Centro', code: 'CENTRO' },
    ticketNumber: 'T01-000042',
    createdAt: '2026-06-02T14:05:00.000Z',
    lines: [
      {
        name: 'Aceite CBD 10%',
        qty: '1',
        unitPrice: '24.90',
        discountPct: '0',
        lineTotal: '24.90',
      },
      {
        name: 'Flor Lemon Haze 2g',
        qty: '2',
        unitPrice: '14.50',
        discountPct: '0',
        lineTotal: '29.00',
      },
      {
        name: 'Crema regeneradora 50ml',
        qty: '1',
        unitPrice: '19.90',
        discountPct: '0',
        lineTotal: '19.90',
      },
    ],
    subtotal: '60.99',
    discountTotal: '0',
    total: '73.80',
    paymentMethod: 'CASH',
    cashGiven: null,
    cashChange: null,
    taxBreakdown: [{ taxRate: '21', base: '60.99', cuota: '12.81' }],
  });
}

export function voidSale(id: string): Promise<Sale> {
  return createSale({ storeId: 'demo', lines: [], paymentMethod: 'CASH' }).then((s) => ({
    ...s,
    id,
    status: 'VOIDED',
    voidedAt: '2026-06-02T14:10:00.000Z',
  }));
}

export function findSaleByTicket(_ticketNumber: string): Promise<Sale> {
  return createSale({ storeId: 'demo', lines: [], paymentMethod: 'CASH' });
}
```

- [ ] **Step 5: transfers.ts → demo**

```typescript
// apps/tpv/src/lib/transfers.ts
import type { ReceiveTransferInput, Transfer } from '@simpletpv/auth';

import { DEMO_TRANSFERS } from '../demo/demoData.js';

export type { Transfer };

export function listIncomingTransfers(_destStoreId: string): Promise<Transfer[]> {
  return Promise.resolve(DEMO_TRANSFERS);
}

export function receiveTransfer(id: string, _input: ReceiveTransferInput): Promise<Transfer> {
  const t = DEMO_TRANSFERS.find((x) => x.id === id) ?? DEMO_TRANSFERS[0]!;
  return Promise.resolve({ ...t, status: 'RECEIVED', receivedAt: '2026-06-02T14:00:00.000Z' });
}
```

- [ ] **Step 6: auth.ts → login mockeado**

```typescript
// apps/tpv/src/lib/auth.ts
import { setupAuth } from '@simpletpv/auth';

import { DEMO_JWT } from '../demo/demoData.js';

const setup = setupAuth('tpv');

// Modo demo: el login acepta cualquier credencial y guarda un JWT falso
// (sin firma válida) para que getRole() lea role=CLERK. No llama a la API.
export const useAuthStore = setup.useAuthStore;
export const api = {
  ...setup.api,
  login: (_email: string, _password: string): Promise<void> => {
    setup.useAuthStore.getState().setTokens({ accessToken: DEMO_JWT, refreshToken: DEMO_JWT });
    return Promise.resolve();
  },
  // En demo no hay SSE: devolvemos un unsubscribe no-op para que SalePage no falle.
  subscribeEvents:
    (_onEvent: (event: import('@simpletpv/auth').AppEvent) => void): (() => void) =>
    () => {},
};
```

> `lib/returns.ts` (`createReturn`, `listReturns`) lo usan `ReturnPanel`/`BlindReturnPanel`, pero el mockup de Devolución solo muestra el estado vacío (no se llega a buscar). No se toca en esta entrega; si en runtime se invocara, fallaría con error de red controlado por su try/catch. Se deja fuera de alcance.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit && pnpm --filter @simpletpv/tpv lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/tpv/src/lib/
git commit -m "feat(tpv): capa demo en lib/* y login mockeado"
```

---

## Task 3: Sidebar fijo expandido + bloque de usuario

**Files:**

- Modify: `packages/ui/src/components/Sidebar.tsx`
- Modify: `packages/ui/src/styles/sidebar.css`

Quitar la lógica colapsable (`pinned`/`hovered`/`expanded`). Mantener `groups`/`mobileOpen`. Header con logo + nombre. Footer con bloque de usuario (avatar iniciales) sin logout (el logout pasa al TopBar).

- [ ] **Step 1: Reescribir Sidebar.tsx**

```tsx
// packages/ui/src/components/Sidebar.tsx
import { useCallback, useState } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

export interface NavGroup {
  id: string;
  label: string;
}

export interface SidebarProps {
  items: NavItem[];
  groups?: NavGroup[];
  activeItem: string;
  onSelect: (id: string) => void;
  user?: { name: string; subtitle?: string };
  logo?: React.ReactNode;
  brand?: { title: string; subtitle?: string };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

export function Sidebar({ items, groups, activeItem, onSelect, user, logo, brand }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      setMobileOpen(false);
    },
    [onSelect],
  );

  const renderItems = (filterGroup?: string) =>
    items
      .filter((item) => item.group === filterGroup)
      .map((item) => (
        <li key={item.id}>
          <button
            className={`sidebar-item${activeItem === item.id ? ' active' : ''}`}
            onClick={() => handleSelect(item.id)}
            title={item.label}
            data-testid={`nav-${item.id}`}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </button>
        </li>
      ));

  return (
    <>
      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        {/* Header: logo + marca */}
        <div className="sidebar-header">
          <span className="sidebar-logo">{logo ?? 'S'}</span>
          {brand && (
            <span className="sidebar-brand">
              <span className="sidebar-brand-title">{brand.title}</span>
              {brand.subtitle && <span className="sidebar-brand-sub">{brand.subtitle}</span>}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {groups && groups.length > 0 ? (
            <>
              <ul className="sidebar-group-items">{renderItems(undefined)}</ul>
              {groups.map((group) => {
                const isCollapsed = !!collapsedGroups[group.id];
                return (
                  <div key={group.id}>
                    <button
                      className="sidebar-group-header"
                      onClick={() => toggleGroup(group.id)}
                      title={group.label}
                    >
                      <span>{group.label}</span>
                      <span>{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    <ul className={`sidebar-group-items${isCollapsed ? ' collapsed' : ''}`}>
                      {renderItems(group.id)}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : (
            <ul className="sidebar-group-items">{renderItems(undefined)}</ul>
          )}
        </nav>

        {/* Footer: bloque de usuario */}
        {user && (
          <div className="sidebar-footer">
            <div className="sidebar-user" data-testid="sidebar-user">
              <span className="sidebar-avatar">{initials(user.name)}</span>
              <span className="sidebar-user-text">
                <span className="sidebar-user-name">{user.name}</span>
                {user.subtitle && <span className="sidebar-user-sub">{user.subtitle}</span>}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Reescribir sidebar.css (fijo expandido + usuario)**

```css
/* packages/ui/src/styles/sidebar.css */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: var(--sidebar-width-expanded);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  z-index: 30;
  overflow: hidden;
}

/* ─── Header: logo + marca ─── */
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 64px;
  padding: 0 1rem;
  flex-shrink: 0;
}

.sidebar-logo {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--ui-brand);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
}

.sidebar-brand {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
}

.sidebar-brand-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--ui-text);
}

.sidebar-brand-sub {
  font-size: 0.75rem;
  color: var(--ui-text-soft);
}

/* ─── Nav ─── */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.sidebar-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.5rem 0.25rem;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sidebar-group-label-color);
  cursor: pointer;
  background: none;
  border: none;
  width: 100%;
}

.sidebar-group-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebar-group-items.collapsed {
  display: none;
}

/* ─── Items ─── */
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.6rem;
  border-radius: var(--ui-radius-sm, 7px);
  cursor: pointer;
  color: var(--sidebar-text);
  transition: background 100ms;
  width: 100%;
  background: none;
  border: none;
  text-align: left;
}

.sidebar-item:hover {
  background: var(--sidebar-item-hover-bg);
}

.sidebar-item.active {
  background: var(--sidebar-item-active-bg);
  color: var(--sidebar-text-active);
  font-weight: 600;
}

.sidebar-item-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-item-label {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
}

/* ─── Footer: usuario ─── */
.sidebar-footer {
  padding: 0.75rem;
  border-top: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.sidebar-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--ui-success-soft);
  color: var(--ui-success);
  font-weight: 700;
  font-size: 0.75rem;
}

.sidebar-user-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}

.sidebar-user-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-text);
}

.sidebar-user-sub {
  font-size: 0.72rem;
  color: var(--ui-text-soft);
}

/* ─── Móvil ─── */
@media (max-width: 767px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform 150ms ease;
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 29;
  }
  .sidebar-overlay.visible {
    display: block;
  }
}
```

- [ ] **Step 3: Fijar el ancho del shell en theme.css**

`packages/ui/src/styles/theme.css` define `--sidebar-current-width: 56px`. Como el sidebar ya no colapsa, el shell debe usar siempre el ancho expandido. Editar esa línea:

```css
--sidebar-current-width: var(--sidebar-width-expanded);
```

(Mantener `--sidebar-width-rail` aunque ya no se use; backoffice podría referenciarlo. No romper.)

- [ ] **Step 4: Typecheck del paquete ui**

Run: `pnpm --filter @simpletpv/ui exec tsc --noEmit`
Expected: PASS. (`backoffice` consume `Sidebar`; los props eliminados — `onLogout`, `statusBadge`, `user.email` — pueden dar error de tipos en backoffice. Si ocurre, NO se arregla aquí: se aborda en Task 9. Si el typecheck de `ui` aislado no toca backoffice, pasa limpio.)

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Sidebar.tsx packages/ui/src/styles/sidebar.css packages/ui/src/styles/theme.css
git commit -m "feat(ui): sidebar fijo expandido con bloque de usuario"
```

---

## Task 4: TopBar compartido

**Files:**

- Create: `packages/ui/src/components/TopBar.tsx`
- Create: `packages/ui/src/styles/topbar.css`
- Modify: `packages/ui/src/index.ts`

Cabecera: izquierda eyebrow + título; derecha toggle Backoffice/TPV (visual) + Salir.

- [ ] **Step 1: Crear TopBar.tsx**

```tsx
// packages/ui/src/components/TopBar.tsx
import { LogOut } from 'lucide-react';

export interface TopBarProps {
  eyebrow?: string;
  title: string;
  activeApp?: 'backoffice' | 'tpv';
  onSwitchApp?: (app: 'backoffice' | 'tpv') => void;
  onLogout?: () => void;
}

export function TopBar({ eyebrow, title, activeApp = 'tpv', onSwitchApp, onLogout }: TopBarProps) {
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        {eyebrow && <span className="topbar-eyebrow">{eyebrow}</span>}
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <div className="topbar-switch" role="group" aria-label="Cambiar de app">
          <button
            type="button"
            className={`topbar-switch-btn${activeApp === 'backoffice' ? ' active' : ''}`}
            onClick={() => onSwitchApp?.('backoffice')}
            data-testid="switch-backoffice"
          >
            Backoffice
          </button>
          <button
            type="button"
            className={`topbar-switch-btn${activeApp === 'tpv' ? ' active' : ''}`}
            onClick={() => onSwitchApp?.('tpv')}
            data-testid="switch-tpv"
          >
            TPV
          </button>
        </div>
        {onLogout && (
          <button type="button" className="topbar-logout" onClick={onLogout} data-testid="logout">
            <LogOut size={16} />
            Salir
          </button>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Crear topbar.css**

```css
/* packages/ui/src/styles/topbar.css */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 76px;
  padding: 0 1.5rem;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-border);
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.topbar-eyebrow {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-soft);
}

.topbar-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ui-text);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.topbar-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.2rem;
  border-radius: 9px;
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-border);
}

.topbar-switch-btn {
  height: 30px;
  padding: 0 0.85rem;
  border: none;
  border-radius: 7px;
  background: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.topbar-switch-btn.active {
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-sm);
}

.topbar-logout {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 36px;
  padding: 0 0.9rem;
  border-radius: 9px;
  border: 1px solid var(--ui-border-strong);
  background: var(--ui-surface);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-text);
  cursor: pointer;
  transition: background 0.12s;
}

.topbar-logout:hover {
  background: var(--ui-surface-subtle);
}
```

- [ ] **Step 3: Exportar TopBar en index.ts**

Añadir a `packages/ui/src/index.ts`:

```typescript
export { TopBar, type TopBarProps } from './components/TopBar.js';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @simpletpv/ui exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificar que el subpath ./topbar.css es importable**

`packages/ui/package.json` define los `exports` de los CSS. Comprobar que existe una entrada para los estilos (p.ej. `"./theme.css"`, `"./sidebar.css"`). Si usa un patrón glob (`"./*.css"`) no hay que tocar nada; si lista cada archivo, añadir:

```json
    "./topbar.css": "./src/styles/topbar.css"
```

Run: `node -e "console.log(require('./packages/ui/package.json').exports)"`
Expected: ver el mapa de exports; confirmar que `topbar.css` queda cubierto.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/TopBar.tsx packages/ui/src/styles/topbar.css packages/ui/src/index.ts packages/ui/package.json
git commit -m "feat(ui): componente TopBar (eyebrow+título / toggle BO·TPV + salir)"
```

---

## Task 5: Shell del TPV (App.tsx + styles.css) con TopBar y carrito precargado

**Files:**

- Modify: `apps/tpv/src/App.tsx`
- Modify: `apps/tpv/src/styles.css`

El shell pasa a Sidebar + columna con TopBar arriba y main debajo. Título por vista. Usuario "Marta Ruiz / Centro · Dependiente". El carrito se precarga con las 3 líneas demo al entrar.

- [ ] **Step 1: Reescribir App.tsx**

```tsx
// apps/tpv/src/App.tsx
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/topbar.css';
import './sale.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { ArrowLeftRight, Banknote, RotateCcw, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CashView } from './CashPanel.js';
import { DEMO_CART_LINES, DEMO_USER } from './demo/demoData.js';
import { api, useAuthStore } from './lib/auth.js';
import { useCart } from './lib/cart.js';
import { ReturnsView } from './ReturnPanel.js';
import { SalePage } from './SalePage.js';
import { TransferReceivePanel } from './TransferReceivePanel.js';

type View = 'sale' | 'return' | 'transfers' | 'cash';

const TPV_NAV: NavItem[] = [
  { id: 'sale', label: 'Venta', icon: <ShoppingBag size={18} /> },
  { id: 'return', label: 'Devolución', icon: <RotateCcw size={18} /> },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} /> },
  { id: 'cash', label: 'Caja', icon: <Banknote size={18} /> },
];

const TITLES: Record<View, { eyebrow: string; title: string }> = {
  sale: { eyebrow: 'Tienda Centro', title: 'Venta' },
  return: { eyebrow: 'Tienda Centro', title: 'Devolución' },
  transfers: { eyebrow: 'Tienda Centro', title: 'Recepción de traspasos' },
  cash: { eyebrow: 'Tienda Centro', title: 'Caja' },
};

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [view, setView] = useState<View>('sale');
  const setItems = useCart.setState;
  const items = useCart((s) => s.items);

  // Precarga del carrito demo: solo la primera vez (si está vacío) para que
  // "Ticket actual" aparezca con las 3 líneas del mockup al entrar.
  useEffect(() => {
    if (items.length === 0) {
      setItems({
        items: DEMO_CART_LINES.map((l) => ({ ...l, discountPct: 0 })),
        ticketDiscountPct: 0,
        ticketDiscountAmt: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { eyebrow, title } = TITLES[view];

  return (
    <div className="app-shell">
      <Sidebar
        items={TPV_NAV}
        activeItem={view}
        onSelect={(id) => setView(id as View)}
        brand={{ title: 'SimpleTPV', subtitle: 'Punto de venta' }}
        user={{ name: DEMO_USER.name, subtitle: 'Centro · Dependiente' }}
      />
      <div className="app-content">
        <TopBar eyebrow={eyebrow} title={title} activeApp="tpv" onLogout={logout} />
        <main className="app-main">
          {view === 'sale' && <SalePage />}
          {view === 'return' && <ReturnsView />}
          {view === 'transfers' && <TransferReceivePanel />}
          {view === 'cash' && <CashView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  if (!isAuthed) {
    return <LoginForm onSubmit={api.login} subtitle="Punto de venta" />;
  }
  return <Home />;
}
```

> Mueve `ReturnsView` a `ReturnPanel.tsx` (Task 7) y `CashView` a `CashPanel.tsx` (Task 8) como exports nombrados. Las firmas: `export function ReturnsView()` y `export function CashView()`, ambas sin props.

- [ ] **Step 2: Reescribir styles.css (shell con cabecera)**

```css
/* apps/tpv/src/styles.css */
@import 'tailwindcss';
@import '@simpletpv/ui/theme.css';
@import '@simpletpv/ui/sidebar.css';

.app-shell {
  display: flex;
  min-height: 100vh;
}

.app-content {
  margin-left: var(--sidebar-current-width);
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--content-bg);
  min-width: 0;
}

.app-main {
  flex: 1;
  padding: 1.5rem 2rem;
  min-width: 0;
}

@media (max-width: 767px) {
  .app-content {
    margin-left: 0;
  }
}
```

- [ ] **Step 3: Typecheck (fallará hasta Task 7/8)**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit`
Expected: FAIL con "Module './ReturnPanel.js' has no exported member 'ReturnsView'" y lo mismo para `CashView`. Es lo esperado: se resuelve en Task 7 y 8. **No commitear aún** — este shell se commitea junto con Task 8.

> Para mantener cada commit verde, ejecutar Tasks 5→6→7→8 y commitear el conjunto en Task 8, o commitear stubs temporales. Recomendado: commitear App.tsx/styles.css al final de Task 8 (un solo commit "shell + vistas").

---

## Task 6: Venta — SalePage, CashPanel barra, CartPanel "Ticket actual"

**Files:**

- Modify: `apps/tpv/src/SalePage.tsx`
- Modify: `apps/tpv/src/CashPanel.tsx`
- Modify: `apps/tpv/src/CartPanel.tsx`
- Modify: `apps/tpv/src/sale.css`

- [ ] **Step 1: SalePage — chips con contadores demo y badge "Agotado"**

En `apps/tpv/src/SalePage.tsx`:

1. Importar los contadores demo:

```typescript
import { DEMO_FAMILY_COUNTS, DEMO_TOTAL_COUNT } from './demo/demoData.js';
```

2. Reemplazar el contador del chip "Todas" (`{allProducts.length}`) por `{DEMO_TOTAL_COUNT}` y el de cada familia (`{countByFamily.get(f.id) ?? 0}`) por `{DEMO_FAMILY_COUNTS[f.id] ?? 0}`. Se puede eliminar el `useMemo` de `countByFamily` y la query `allProducts` si quedan sin uso (mantener `allProducts` solo si el chip "Todas" lo necesitaba — ahora usa la constante, así que se elimina la query `['sale-products','',null]` y `countByFamily`).

3. Badge de stock: cuando `stock.quantity === 0`, en vez del número mostrar "Agotado". Sustituir el bloque de la tarjeta:

```tsx
{
  stock ? (
    stock.quantity === 0 ? (
      <span className="prod-stock sold-out" data-testid="prod-stock">
        Agotado
      </span>
    ) : (
      <span
        className={`prod-stock stock-${stock.level}`}
        data-testid="prod-stock"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setStockDetail(p);
        }}
        title="Ver stock por tienda"
      >
        {stock.quantity}
      </span>
    )
  ) : (
    <span className="prod-stock neutral" data-testid="prod-stock">
      —
    </span>
  );
}
```

4. La fila de selección de tienda (`stores.length > 1`) no se mostrará (solo hay 1 tienda demo): dejar el código como está.

- [ ] **Step 2: CashPanel — añadir "Esperado en caja" a la barra**

En `apps/tpv/src/CashPanel.tsx`, en la rama `if (session)` (caja abierta), tras el `cash-stat` de Apertura y antes del `cash-spacer`, añadir el dato esperado leyendo `session.expectedAmount`:

```tsx
          <span className="cash-div" />
          <div className="cash-stat">
            <span className="cash-stat-label">Esperado en caja</span>
            <span className="cash-stat-value" data-testid="cash-expected-bar">
              {Number(session.expectedAmount ?? 0).toFixed(2)} €
            </span>
          </div>
```

(Queda: ● Caja abierta | Apertura 150,00 € | Esperado en caja 462,40 € | … | Cerrar caja.)

- [ ] **Step 3: CartPanel → "Ticket actual"**

Reescribir el bloque de cabecera, líneas y pie del `return` principal de `CartPanel` (no la rama `confirmed`). Cambios:

- Cabecera: "Ticket actual" + enlace "Vaciar" (llama `clear()`).
- Cada línea: nombre + precio unitario debajo (`{i.unitPrice.toFixed(2)} € / ud`).
- Pie: "Base imponible" + "IVA (21%)" (desglose desde el total: `base = total / 1.21`, `iva = total - base`) + "Total" grande + botón "Cobrar · {total}".
- Quitar el botón "Aplicar descuento" del pie.

Reemplazar el `return (...)` principal por:

```tsx
// Desglose de IVA (21%) desde el total, calculado en cliente para el mockup.
const base = total > 0 ? total / 1.21 : 0;
const iva = total - base;

return (
  <aside
    className="flex w-80 shrink-0 flex-col rounded-xl border border-[var(--ui-border)] bg-white shadow-sm"
    data-testid="cart"
  >
    <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
      <h2 className="text-sm font-semibold text-neutral-900">Ticket actual</h2>
      <button
        className="text-sm font-medium text-neutral-400 hover:text-neutral-700"
        onClick={clear}
        disabled={items.length === 0}
        data-testid="cart-clear"
      >
        Vaciar
      </button>
    </div>

    <div className="flex-1 overflow-y-auto px-4">
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400" data-testid="cart-empty">
          Vacío. Pulsa un producto para añadirlo.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--ui-border)]" data-testid="cart-lines">
          {items.map((i) => {
            const net = lineNet(i);
            return (
              <li key={i.productId} className="py-3" data-testid="cart-line">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {i.name}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {i.unitPrice.toFixed(2)} € / ud
                    </span>
                  </div>
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900"
                    data-testid="cart-line-total"
                  >
                    {net.toFixed(2)} €
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => setQty(i.productId, i.qty - 1)}
                    aria-label="Quitar uno"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{i.qty}</span>
                  <button
                    onClick={() => setQty(i.productId, i.qty + 1)}
                    aria-label="Añadir uno"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>

    <div className="space-y-2 border-t border-[var(--ui-border)] p-4">
      <div className="flex justify-between text-sm text-neutral-500">
        <span>Base imponible</span>
        <span className="tabular-nums" data-testid="cart-base">
          {base.toFixed(2)} €
        </span>
      </div>
      <div className="flex justify-between text-sm text-neutral-500">
        <span>IVA (21%)</span>
        <span className="tabular-nums" data-testid="cart-iva">
          {iva.toFixed(2)} €
        </span>
      </div>
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-base font-bold text-neutral-900">Total</span>
        <span
          className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900"
          data-testid="cart-total"
        >
          {total.toFixed(2)} €
        </span>
      </div>

      <Button
        size="lg"
        className="w-full text-base"
        onClick={openCheckout}
        disabled={!canCheckout}
        data-testid="cart-checkout"
      >
        {items.length > 0 ? `Cobrar · ${total.toFixed(2)} €` : 'Cobrar'}
      </Button>

      {!cashOpen && items.length > 0 && (
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          data-testid="cart-cash-warning"
        >
          Abre la caja para poder cobrar
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600" data-testid="cart-msg">
          {error}
        </p>
      )}
    </div>

    {modalOpen && (
      <PaymentModal
        total={total}
        onConfirm={onConfirmPayment}
        onCancel={() => setModalOpen(false)}
        busy={busy}
      />
    )}
  </aside>
);
```

Eliminar de `CartPanel` lo que queda huérfano: el estado `discountOpen`/`setDiscountOpen`, el `import { DiscountModal }`, el bloque `{discountOpen && <DiscountModal .../>}`, y los selectores de descuento de la store que ya no se usan en el render (`setLineDiscount`, `setTicketDiscount`, `ticketDiscount`, `subtotal`). Mantener `apiHealthy` en las props (App no lo pasa, su default es `true`).

- [ ] **Step 4: sale.css — badge "Agotado" y barra de caja**

Añadir a `apps/tpv/src/sale.css`:

```css
.prod-stock.sold-out {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}
```

(El resto de la barra de caja ya tiene estilos `cash-stat`/`cash-div`; el nuevo dato los reutiliza.)

- [ ] **Step 5: Typecheck (sigue fallando por App.tsx hasta Task 8)**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit`
Expected: solo los errores de `ReturnsView`/`CashView` pendientes de Task 7/8. Ningún error nuevo en SalePage/CartPanel/CashPanel.

---

## Task 7: Devolución — estado vacío centrado

**Files:**

- Modify: `apps/tpv/src/ReturnPanel.tsx` (añadir export `ReturnsView`)
- Modify: `apps/tpv/src/sale.css`

`ReturnsView` mueve aquí la lógica del toggle "Con ticket / Sin ticket" (antes en App.tsx) y, para el mockup, muestra el estado vacío calcado: título + subtítulo + toggle + buscador + tarjeta vacía centrada.

- [ ] **Step 1: Añadir ReturnsView a ReturnPanel.tsx**

Al principio del archivo, añadir imports:

```typescript
import { useState } from 'react'; // ya importado; reutilizar
import { BlindReturnPanel } from './BlindReturnPanel.js';
```

Y al final del archivo, exportar `ReturnsView`:

```tsx
// Vista de Devolución calcada al mockup: toggle + buscador + estado vacío.
export function ReturnsView() {
  const [mode, setMode] = useState<'ticket' | 'blind'>('ticket');
  const [query, setQuery] = useState('');

  return (
    <div className="return-view" data-testid="return-view">
      <div className="return-view-head">
        <h2 className="return-view-title">Devolución</h2>
        <p className="return-view-sub">Reintegro con o sin ticket</p>
      </div>

      <div className="return-toggle">
        <button
          className={`return-toggle-btn${mode === 'ticket' ? ' active' : ''}`}
          onClick={() => setMode('ticket')}
          data-testid="return-mode-ticket"
        >
          Con ticket
        </button>
        <button
          className={`return-toggle-btn${mode === 'blind' ? ' active' : ''}`}
          onClick={() => setMode('blind')}
          data-testid="return-mode-blind"
        >
          Sin ticket
        </button>
      </div>

      {mode === 'ticket' ? (
        <>
          <div className="return-view-search">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="return-view-input"
              placeholder="Nº de ticket, fecha o producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="return-ticket-search"
            />
          </div>
          <div className="return-empty" data-testid="return-empty">
            <span className="return-empty-icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                <path d="M21 3v6h-6" />
              </svg>
            </span>
            <p className="return-empty-title">Busca el ticket original</p>
            <p className="return-empty-text">
              Escanea el QR del ticket o introduce su número para empezar la devolución.
            </p>
          </div>
        </>
      ) : (
        <BlindReturnPanel />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Estilos de Devolución en sale.css**

Añadir a `apps/tpv/src/sale.css`:

```css
/* ─── Vista de Devolución (mockup) ─── */
.return-view {
  max-width: 40rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.return-view-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.return-view-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ui-text);
}

.return-view-sub {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ui-text-muted);
}

.return-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.25rem;
  border-radius: 9px;
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-border);
  width: fit-content;
}

.return-toggle-btn {
  height: 32px;
  padding: 0 0.9rem;
  border: none;
  border-radius: 7px;
  background: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.return-toggle-btn.active {
  background: var(--ui-primary);
  color: var(--ui-primary-fg);
}

.return-view-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 46px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 12px;
  background: var(--ui-surface);
  padding: 0 0.9rem;
}

.return-view-search svg {
  color: var(--ui-text-soft);
  flex-shrink: 0;
}

.return-view-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.92rem;
  color: var(--ui-text);
}

.return-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 3rem 1.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}

.return-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--ui-text-soft);
  background: var(--ui-surface-subtle);
  margin-bottom: 0.25rem;
}

.return-empty-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ui-text);
}

.return-empty-text {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ui-text-muted);
  max-width: 22rem;
}
```

- [ ] **Step 3: Typecheck (queda solo CashView)**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit`
Expected: solo el error de `CashView`. Sin errores nuevos.

---

## Task 8: Caja — vista dedicada + commit del shell

**Files:**

- Modify: `apps/tpv/src/CashPanel.tsx` (añadir export `CashView`)
- Modify: `apps/tpv/src/sale.css`
- Commit: App.tsx + styles.css (Task 5) + esta tarea

`CashView` muestra la tarjeta "Sesión de caja" calcada: Estado/Abierta, Apertura, Ventas efectivo, Esperado, botón rojo "Cerrar caja".

- [ ] **Step 1: Añadir CashView a CashPanel.tsx**

Al inicio del archivo, añadir import de los datos demo:

```typescript
import {
  DEMO_CASH_EXPECTED,
  DEMO_CASH_OPENING,
  DEMO_CASH_SALES,
  DEMO_STORE_ID,
} from './demo/demoData.js';
```

Y al final del archivo, exportar `CashView`:

```tsx
// Vista de Caja calcada al mockup: tarjeta con estado + cifras + cerrar caja.
export function CashView() {
  const [closing, setClosing] = useState(false);

  if (closing) {
    // Reutiliza el panel-barra existente (incluye el formulario de cierre real).
    return (
      <div className="cash-view">
        <CashPanel storeId={DEMO_STORE_ID} />
      </div>
    );
  }

  return (
    <div className="cash-view" data-testid="cash-view">
      <div className="cash-view-head">
        <h2 className="cash-view-title">Sesión de caja</h2>
        <p className="cash-view-sub">Tienda Centro · turno de mañana</p>
      </div>

      <div className="cash-card">
        <div className="cash-card-head">
          <span className="cash-card-title">Estado</span>
          <span className="cash-card-badge" data-testid="cash-state">
            <span className="cash-dot" /> Abierta
          </span>
        </div>
        <dl className="cash-card-rows">
          <div className="cash-card-row">
            <dt>Apertura</dt>
            <dd>{DEMO_CASH_OPENING.toFixed(2)} €</dd>
          </div>
          <div className="cash-card-row">
            <dt>Ventas efectivo</dt>
            <dd>+ {DEMO_CASH_SALES.toFixed(2)} €</dd>
          </div>
          <div className="cash-card-row">
            <dt>Esperado en caja</dt>
            <dd>{DEMO_CASH_EXPECTED.toFixed(2)} €</dd>
          </div>
        </dl>
        <button
          className="cash-card-close"
          onClick={() => setClosing(true)}
          data-testid="cash-view-close"
        >
          Cerrar caja
        </button>
      </div>
    </div>
  );
}
```

> `CashPanel` ya importa `useState`; reutilizar. Si `useState` no estuviera importado, está al inicio del archivo (`import { useState } from 'react'`).

- [ ] **Step 2: Estilos de la vista de Caja en sale.css**

Añadir a `apps/tpv/src/sale.css`:

```css
/* ─── Vista de Caja (mockup) ─── */
.cash-view {
  max-width: 34rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.cash-view-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.cash-view-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ui-text);
}

.cash-view-sub {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ui-text-muted);
}

.cash-card {
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-surface);
  padding: 1.3rem 1.4rem;
  box-shadow: var(--ui-shadow-sm);
}

.cash-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.cash-card-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ui-text);
}

.cash-card-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 26px;
  padding: 0 0.6rem;
  border-radius: 999px;
  background: var(--ui-success-soft);
  color: var(--ui-success);
  font-size: 0.8rem;
  font-weight: 600;
}

.cash-card-rows {
  margin: 0 0 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.cash-card-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.cash-card-row dt {
  color: var(--ui-text-muted);
  font-size: 0.92rem;
}

.cash-card-row dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text);
}

.cash-card-close {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 10px;
  background: var(--ui-danger);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.12s;
}

.cash-card-close:hover {
  filter: brightness(0.94);
}
```

- [ ] **Step 3: Typecheck completo del TPV**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit`
Expected: PASS (ya no quedan errores de exports; App.tsx resuelve `ReturnsView` y `CashView`).

- [ ] **Step 4: Lint**

Run: `pnpm --filter @simpletpv/tpv lint`
Expected: PASS. Corregir imports sin uso que hayan quedado (p.ej. en App.tsx ya no se usan `useQuery`/`listStores`/`BlindReturnPanel`/`ReturnPanel`/`CashPanel` directos).

- [ ] **Step 5: Commit del shell + vistas**

```bash
git add apps/tpv/src/App.tsx apps/tpv/src/styles.css apps/tpv/src/SalePage.tsx apps/tpv/src/CartPanel.tsx apps/tpv/src/CashPanel.tsx apps/tpv/src/ReturnPanel.tsx apps/tpv/src/sale.css
git commit -m "feat(tpv): shell con TopBar + Venta/Devolución/Caja calcadas a mockups"
```

---

## Task 9: Traspasos — tabla de recepción

**Files:**

- Modify: `apps/tpv/src/TransferReceivePanel.tsx`
- Modify: `apps/tpv/src/sale.css`

Reemplazar la lista de tarjetas del listado (la rama final del `return`, no el detalle `selected` ni `done`) por una tabla FECHA / ORIGEN / LÍNEAS / ESTADO + acción. Filas demo: pendiente (con "Recibir") y recibido (con badge).

- [ ] **Step 1: Reescribir el listado de TransferReceivePanel**

Sustituir la rama final (el `return (<div className="mx-auto max-w-xl ...">...)`) por:

```tsx
// Formatea createdAt como "31/05 08:30".
function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

return (
  <div className="transfer-view" data-testid="transfer-receive">
    <div className="transfer-view-head">
      <h2 className="transfer-view-title">Recepción de traspasos</h2>
      <p className="transfer-view-sub">Mercancía enviada desde central</p>
    </div>

    {isLoading ? (
      <p className="py-8 text-center text-sm text-neutral-400">Cargando…</p>
    ) : transfers.length === 0 ? (
      <div className="transfer-empty" data-testid="transfer-empty">
        <p className="text-sm text-neutral-400">No hay traspasos pendientes de recibir.</p>
      </div>
    ) : (
      <table className="transfer-table" data-testid="transfer-list">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th className="num">Líneas</th>
            <th>Estado</th>
            <th aria-label="Acción" />
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const received = t.status === 'RECEIVED';
            return (
              <tr key={t.id} data-testid="transfer-item">
                <td>{fmt(t.sentAt ?? t.createdAt)}</td>
                <td>Central</td>
                <td className="num">{t.lines.length}</td>
                <td>
                  {received ? (
                    <span className="transfer-badge received" data-testid="transfer-status">
                      <span className="cash-dot" /> Recibido
                    </span>
                  ) : (
                    <span className="transfer-badge pending" data-testid="transfer-status">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="action">
                  {!received && (
                    <button
                      className="transfer-receive-link"
                      onClick={() => openTransfer(t)}
                      data-testid="transfer-open"
                    >
                      Recibir
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
);
```

Quitar el `import { Button }` si ya no se usa en el listado (sí se usa en el detalle `selected` y en `done` — mantenerlo). Quitar el selector de tienda del listado (solo hay 1 tienda demo). Mantener intactas las ramas `done` y `selected`.

- [ ] **Step 2: Estilos de la tabla en sale.css**

Añadir a `apps/tpv/src/sale.css`:

```css
/* ─── Vista de Traspasos (tabla, mockup) ─── */
.transfer-view {
  max-width: 46rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.transfer-view-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.transfer-view-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ui-text);
}

.transfer-view-sub {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ui-text-muted);
}

.transfer-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}

.transfer-table thead th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-soft);
  background: var(--ui-surface-subtle);
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.transfer-table th.num,
.transfer-table td.num {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.transfer-table tbody td {
  padding: 0.85rem 1rem;
  font-size: 0.9rem;
  color: var(--ui-text);
  border-bottom: 1px solid var(--ui-border);
  vertical-align: middle;
}

.transfer-table tbody tr:last-child td {
  border-bottom: none;
}

.transfer-table td.action {
  text-align: right;
}

.transfer-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 24px;
  padding: 0 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.transfer-badge.pending {
  background: var(--ui-surface-subtle);
  color: var(--ui-text-muted);
  border: 1px solid var(--ui-border);
}

.transfer-badge.received {
  background: var(--ui-success-soft);
  color: var(--ui-success);
}

.transfer-receive-link {
  border: none;
  background: none;
  color: var(--ui-text);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.3rem 0.4rem;
  border-radius: 7px;
}

.transfer-receive-link:hover {
  background: var(--ui-surface-subtle);
}

.transfer-empty {
  padding: 2.5rem 1.5rem;
  text-align: center;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit && pnpm --filter @simpletpv/tpv lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/tpv/src/TransferReceivePanel.tsx apps/tpv/src/sale.css
git commit -m "feat(tpv): traspasos como tabla fecha/origen/líneas/estado"
```

---

## Task 10: Arreglar backoffice si el cambio de Sidebar lo rompió

**Files:**

- Modify: `apps/backoffice/src/App.tsx` (solo si el typecheck lo exige)

Los props eliminados del `Sidebar` (`onLogout`, `statusBadge`, `user.email`) pueden romper el backoffice, que también usa `Sidebar`.

- [ ] **Step 1: Typecheck del backoffice**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit`
Expected: si PASA, saltar al Step 3 (no hay nada que arreglar). Si FALLA, anotar los errores (p.ej. `Property 'onLogout' does not exist on type 'SidebarProps'`).

- [ ] **Step 2: Adaptar el uso de Sidebar en backoffice (solo si falló)**

Leer `apps/backoffice/src/App.tsx`, localizar el `<Sidebar .../>`, y:

- Cambiar `user={{ name, email }}` por `user={{ name, subtitle: <rol/tienda> }}` (usar el subtítulo que tenga sentido; si solo había email, usar `subtitle: email`).
- Quitar `onLogout` y `statusBadge` del Sidebar; si el backoffice necesita logout, moverlo donde corresponda (fuera del alcance de la demo TPV — mínimo: mantener el logout accesible). Si el backoffice tenía `logo`/`brand`, pasar `brand={{ title: ... }}`.

> Mantener los cambios al mínimo: el objetivo es que backoffice compile, no rediseñarlo. Documentar en el commit que el rediseño de backoffice queda pendiente.

- [ ] **Step 3: Typecheck del monorepo**

Run: `pnpm typecheck`
Expected: PASS en todos los workspaces.

- [ ] **Step 4: Commit (solo si hubo cambios)**

```bash
git add apps/backoffice/src/App.tsx
git commit -m "fix(backoffice): adaptar uso de Sidebar tras props simplificados"
```

---

## Task 11: Reescribir los e2e para modo demo

**Files:**

- Modify: `apps/tpv/e2e/login.spec.ts`, `sale-search.spec.ts`, `scanner.spec.ts`, `checkout.spec.ts`

Sin API: login con cualquier credencial, productos demo visibles, carrito precargado, cobro demo, navegación entre vistas.

- [ ] **Step 1: login.spec.ts**

```typescript
import { expect, test } from '@playwright/test';

// Modo demo: el TPV no llama a la API. El login acepta cualquier credencial.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('muestra el login cuando no hay sesión', async ({ page }) => {
  await expect(page.getByTestId('login-card')).toBeVisible();
  await expect(page.getByTestId('login-email')).toBeVisible();
});

test('login con cualquier credencial entra al TPV (modo demo)', async ({ page }) => {
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('lo-que-sea');
  await page.getByTestId('login-submit').click();

  // Tras entrar se ve la TopBar con "Salir" y desaparece el login.
  await expect(page.getByTestId('logout')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('login-card')).toHaveCount(0);
  await expect(page.getByTestId('sale-grid')).toBeVisible();
});
```

- [ ] **Step 2: sale-search.spec.ts**

```typescript
import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('tras login se ven los productos demo', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('sale-grid')).toBeVisible({ timeout: 10000 });
  // 12 productos demo.
  expect(await page.getByTestId('prod-card').count()).toBe(12);
});

test('la búsqueda en vivo filtra los productos (debounce)', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  const total = await page.getByTestId('prod-card').count();

  await page.getByTestId('sale-search').fill('CBD');
  await page.waitForTimeout(400); // > debounce 200ms
  const filtered = await page.getByTestId('prod-card').count();

  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);
  const names = await page.getByTestId('prod-card').locator('.prod-name').allTextContents();
  expect(names.every((n) => /cbd/i.test(n))).toBe(true);
});

test('el chip "Todas" muestra el total demo (88)', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('fam-chip-all')).toContainText('88');
});

test('el producto agotado muestra el badge "Agotado"', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  await expect(page.getByText('Agotado')).toBeVisible();
});
```

- [ ] **Step 3: checkout.spec.ts**

```typescript
import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('el ticket precargado muestra total 73,80 € y permite cobrar', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  // Carrito precargado con 3 líneas demo.
  await expect(page.getByTestId('cart-line')).toHaveCount(3);
  await expect(page.getByTestId('cart-total')).toContainText('73,80');

  // Caja abierta → cobrar habilitado.
  await expect(page.getByTestId('cart-checkout')).toBeEnabled();
  await page.getByTestId('cart-checkout').click();
  await expect(page.getByTestId('payment-modal')).toBeVisible();

  await page.getByTestId('pay-cash').click();
  await page.getByTestId('cash-given').fill('80');
  await page.getByTestId('pay-confirm').click();

  await expect(page.getByTestId('sale-confirmation')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('ticket-view')).toBeVisible({ timeout: 10000 });

  await page.getByTestId('new-sale').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});

test('"Vaciar" deja el ticket vacío', async ({ page }) => {
  await login(page);
  await page.getByTestId('cart-line').first().waitFor({ timeout: 10000 });
  await page.getByTestId('cart-clear').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});
```

> Antes de fijar selectores del modal de pago (`pay-cash`, `cash-given`, `pay-confirm`, `payment-modal`) y del ticket (`ticket-view`), confirmarlos leyendo `apps/tpv/src/PaymentModal.tsx` y `TicketView.tsx`. Si algún testid difiere, ajustar el test al real (no inventar). El total formateado usa coma decimal (locale es-ES): "73,80".

- [ ] **Step 4: scanner.spec.ts → navegación entre vistas**

El escáner demo no tiene barcodes asociados (todos `barcode: null`), así que este spec se reconvierte a navegación entre vistas (cubre Devolución/Traspasos/Caja calcadas):

```typescript
import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('la navegación del sidebar muestra cada vista calcada', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-return').click();
  await expect(page.getByTestId('return-empty')).toBeVisible();
  await expect(page.getByText('Busca el ticket original')).toBeVisible();

  await page.getByTestId('nav-transfers').click();
  await expect(page.getByTestId('transfer-list')).toBeVisible();
  await expect(page.getByTestId('transfer-item')).toHaveCount(2);

  await page.getByTestId('nav-cash').click();
  await expect(page.getByTestId('cash-view')).toBeVisible();
  await expect(page.getByTestId('cash-state')).toContainText('Abierta');

  await page.getByTestId('nav-sale').click();
  await expect(page.getByTestId('sale-grid')).toBeVisible();
});
```

- [ ] **Step 5: Verificar PaymentModal/TicketView testids antes de correr**

Run: `grep -n "data-testid" apps/tpv/src/PaymentModal.tsx apps/tpv/src/TicketView.tsx`
Expected: ver los testids reales. Ajustar checkout.spec.ts si difieren de `payment-modal`/`pay-cash`/`cash-given`/`pay-confirm`/`ticket-view`/`new-sale`.

- [ ] **Step 6: Correr los e2e**

Run: `pnpm --filter @simpletpv/tpv test:e2e`
Expected: PASS los 4 specs. Si Playwright arranca un dev server que esperaba la API, comprobar `apps/tpv/playwright.config.ts` (`webServer`): en modo demo no hace falta backend, pero si el config espera `/api` o el seed, basta con que el dev server de Vite levante. Si un test falla por timing del carrito precargado, esperar a `cart-line` antes de aseverar.

- [ ] **Step 7: Commit**

```bash
git add apps/tpv/e2e/
git commit -m "test(tpv): reescribir e2e para modo demo (sin backend)"
```

---

## Task 12: Verificación visual y cierre

**Files:** ninguno (verificación)

- [ ] **Step 1: Gate del monorepo**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 2: Levantar el TPV y comparar con los mockups**

Run: `pnpm --filter @simpletpv/tpv dev`
Abrir el navegador en la URL que indique Vite. Login con cualquier credencial. Verificar contra cada mockup:

- Venta: sidebar expandido + TopBar (TIENDA CENTRO / Venta + Backoffice·TPV + Salir); barra de caja con Apertura 150,00 € y Esperado 462,40 €; chips (Todas 88, Flores CBD 42, …); grid con "Agotado" en Vapeador Pro; "Ticket actual" con 3 líneas, Base 60,99 €, IVA 12,81 €, Total 73,80 €, botón "Cobrar · 73,80 €".
- Devolución: título + subtítulo + toggle + buscador + tarjeta "Busca el ticket original".
- Traspasos: tabla con 2 filas (Pendiente con "Recibir", Recibido con badge).
- Caja: tarjeta "Estado · Abierta", Apertura/Ventas efectivo/Esperado, botón rojo "Cerrar caja".
- Sidebar footer: avatar "MR", "Marta Ruiz", "Centro · Dependiente".

- [ ] **Step 3: Usar la skill `verify` o `run` para captura**

Si está disponible, usar la skill `run`/`verify` para abrir la app y tomar capturas de las 4 vistas, y compararlas con los mockups. Anotar cualquier desviación y corregir en el CSS correspondiente.

- [ ] **Step 4: Commit final (si hubo ajustes visuales)**

```bash
git add -A
git commit -m "style(tpv): ajustes finos para calcar los mockups"
```

---

## Self-Review

**Spec coverage:**

- Sidebar fijo expandido + usuario → Task 3. ✔
- TopBar eyebrow+título / toggle BO·TPV (visual) + Salir → Task 4, integrado en Task 5. ✔
- Capa demo (productos, familias, stock, caja, ticket, traspasos, JWT) → Task 1 + Task 2. ✔
- Login mockeado conservado → Task 2 (auth.ts) + Task 5 (App). ✔
- Venta (caja con Esperado, buscador, chips con contadores, grid con Agotado, Ticket actual con base+IVA) → Task 6. ✔
- Devolución (estado vacío centrado) → Task 7. ✔
- Traspasos (tabla) → Task 9. ✔
- Caja (tarjeta dedicada) → Task 8. ✔
- E2E reescritos para demo → Task 11. ✔
- Backoffice no roto por Sidebar → Task 10. ✔
- Verificación visual contra mockups → Task 12. ✔

**Placeholder scan:** sin TODO/TBD; todo el código está completo. Los únicos pasos "condicionales" (Task 4 Step 5 exports, Task 10) traen instrucción concreta de qué comprobar y qué editar.

**Type consistency:** los datos demo usan los tipos reales de `api-types.ts` (precios `string`, `level: StockLevel`, `status` literales). `ReturnsView`/`CashView` se exportan sin props y App los importa así. `Sidebar` nuevo: `user={ name, subtitle? }`, `brand={ title, subtitle? }`, sin `onLogout`/`statusBadge` — App y backoffice (Task 10) se alinean. `TopBar` props coinciden entre Task 4 y Task 5. La store `useCart` se precarga vía `useCart.setState({ items, ticketDiscountPct, ticketDiscountAmt })`, claves que existen en `CartState`.
