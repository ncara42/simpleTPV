# Backoffice calcado a mockups con capa demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar las nueve pantallas del backoffice (Dashboard, Catálogo, Familias, Stock, Usuarios, Tiendas, Ventas, Compras, VeriFactu) idénticas a los mockups aprobados, alimentadas por una capa de datos demo hardcodeados, con login mockeado, shell con la TopBar compartida y toggle Backoffice↔TPV navegable. Sin tocar el backend.

**Architecture:** El backoffice arranca siempre en modo demo. Una capa `demo/demoData.ts` provee datos calcados a los mockups; las funciones de `apps/backoffice/src/lib/*` (admin, dashboard, families, products, stock, verifactu, purchases) se reescriben para devolver esos datos en vez de llamar a la API, y `api.login` se mockea (JWT falso con `role: 'ADMIN'`). El shell sustituye la `bo-topbar` artesanal por la `TopBar` de `packages/ui`, cuyo toggle navega entre apps por URL leída de env vars Vite. No se modifica `packages/auth` ni el backend.

**Tech Stack:** React 19, Vite 6, TypeScript, Zustand, @tanstack/react-query, recharts, lucide-react, Playwright. Estilos en CSS plano (`styles.css`, `catalog.css`, `dashboard.css`) con variables `--ui-*`.

---

## File Structure

**Crear:**

- `apps/backoffice/src/demo/demoData.ts` — datos demo de las 9 vistas + JWT falso ADMIN + usuario.

**Modificar:**

- `packages/ui/src/components/TopBar.tsx` — `onSwitchApp` ya existe; sin cambios de API (el handler navegable vive en cada app).
- `apps/backoffice/src/lib/{admin,dashboard,families,products,stock,verifactu,purchases}.ts` — devolver datos demo.
- `apps/backoffice/src/lib/auth.ts` — login mockeado (JWT ADMIN).
- `apps/backoffice/src/lib/nav.ts` — NUEVO: helper `switchApp(app)` con URLs por env var (compartible).
- `apps/backoffice/src/App.tsx` — shell con `TopBar` + toggle navegable; quita `bo-topbar`.
- `apps/backoffice/src/styles.css` — importa `topbar.css`; elimina estilos `.bo-topbar*`; añade estilos de cards de Tiendas y de VeriFactu.
- `apps/backoffice/src/CatalogPage.tsx` — añade columna STOCK (badge) + "12 productos activos" + Editar/Borrar.
- `apps/backoffice/src/FamiliesPage.tsx` — añade "N productos" + bullet de color + subtítulo.
- `apps/backoffice/src/UsersPage.tsx` — badge de rol + columna TIENDA + "4 usuarios".
- `apps/backoffice/src/StoresPage.tsx` — reescribe tabla → grid de cards.
- `apps/backoffice/src/StockPage.tsx` — badges `Tienda : N` en la fila + subtítulo.
- `apps/backoffice/src/SalesHistoryPage.tsx` — columnas calcadas (TICKET/TIENDA/LÍNEAS/PAGO/TOTAL/HORA) + subtítulo.
- `apps/backoffice/src/VerifactuPage.tsx` — 3 cards + card "Estado del conector".
- `apps/backoffice/src/DashboardPage.tsx` — KPIs y paneles calcados (roturas como lista, top productos).
- `apps/backoffice/src/dashboard.css`, `catalog.css` — ajustes de estética.
- `apps/tpv/src/App.tsx` — cablear el toggle de la `TopBar` a `switchApp`.
- `apps/tpv/src/lib/nav.ts` — NUEVO: mismo helper para el TPV (navega a backoffice).
- `apps/backoffice/e2e/access.spec.ts`, `dashboard.spec.ts` — reescritos para modo demo; nuevo `pages.spec.ts`.

> **Nota sobre la columna LÍNEAS de Ventas:** `SaleSummary` no trae el nº de líneas. El módulo demo añade un campo auxiliar; ver Task 1 (se usa un tipo demo `DemoSale` que extiende lo necesario, y `SalesHistoryPage` lo lee con tolerancia).

---

## Task 1: Datos demo del backoffice

**Files:**

- Create: `apps/backoffice/src/demo/demoData.ts`

Datos calcados a los 9 mockups, con los tipos reales de `@simpletpv/auth` (precios/decimales como `string`; `total`, `quantity`, `sortOrder`, `attempts`, `leadTimeDays` como `number`). JWT falso con `role: 'ADMIN'`.

- [ ] **Step 1: Crear el módulo de datos demo**

```typescript
// apps/backoffice/src/demo/demoData.ts
import type {
  FamilyNode,
  Product,
  SalesPage,
  SaleSummary,
  StockAlert,
  StockGlobalRow,
  Store,
  User,
  VerifactuRecord,
} from '@simpletpv/auth';
import type {
  FamilySales,
  MarginKpis,
  ProductRankings,
  SalesKpis,
  SalesTodayResponse,
  StockoutKpis,
} from '../lib/dashboard.js';

// ─── Identidad demo ──────────────────────────────────────────
export const DEMO_USER = { name: 'Ana Caravaca', email: 'admin@org1.test' };

// JWT falso (sin firma válida; solo para que getRole() lea role=ADMIN y pase el guard).
// header={"alg":"none","typ":"JWT"} payload={"sub":"demo","organizationId":"demo-org","role":"ADMIN"}
export const DEMO_JWT =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0' +
  '.eyJzdWIiOiJkZW1vIiwib3JnYW5pemF0aW9uSWQiOiJkZW1vLW9yZyIsInJvbGUiOiJBRE1JTiJ9' +
  '.demo';

// ─── Tiendas (6 ubicaciones) ─────────────────────────────────
export const DEMO_STORES: Store[] = [
  { id: 's-centro', name: 'Centro', address: 'C/ Mayor 12', code: 'CENTRO', active: true },
  { id: 's-norte', name: 'Norte', address: 'Av. Norte 88', code: 'NORTE', active: true },
  { id: 's-sur', name: 'Sur', address: 'Pza. Sur 3', code: 'SUR', active: true },
  { id: 's-granvia', name: 'Gran Vía', address: 'Gran Vía 41', code: 'GRANVIA', active: true },
  { id: 's-online', name: 'Online', address: 'eCommerce', code: 'ONLINE', active: true },
  { id: 's-almacen', name: 'Almacén', address: 'Pol. Ind. 7', code: 'ALMACEN', active: false },
];

// ─── Familias (con contador de productos para el mockup) ─────
// `productCount` es un campo demo extra (FamilyNode no lo trae); FamiliesPage lo lee opcional.
export interface DemoFamily extends FamilyNode {
  productCount: number;
}
export const DEMO_FAMILIES: DemoFamily[] = [
  {
    id: 'fam-flores',
    parentId: null,
    name: 'Flores CBD',
    color: '#16734f',
    icon: null,
    sortOrder: 1,
    children: [],
    productCount: 24,
  },
  {
    id: 'fam-aceites',
    parentId: null,
    name: 'Aceites',
    color: '#b45309',
    icon: null,
    sortOrder: 2,
    children: [],
    productCount: 12,
  },
  {
    id: 'fam-cosmetica',
    parentId: null,
    name: 'Cosmética',
    color: '#7c3aed',
    icon: null,
    sortOrder: 3,
    children: [],
    productCount: 18,
  },
  {
    id: 'fam-vapeo',
    parentId: null,
    name: 'Vapeo',
    color: '#2563eb',
    icon: null,
    sortOrder: 4,
    children: [],
    productCount: 9,
  },
  {
    id: 'fam-infusiones',
    parentId: null,
    name: 'Infusiones',
    color: '#0e7c6b',
    icon: null,
    sortOrder: 5,
    children: [],
    productCount: 7,
  },
];

// ─── Productos (12, con SKU/IVA del mockup de Catálogo) ──────
function product(
  id: string,
  name: string,
  sku: string,
  salePrice: string,
  taxRate: string,
  familyId: string,
): Product {
  return {
    id,
    name,
    sku,
    barcode: null,
    description: null,
    salePrice,
    costPrice: '0',
    taxRate,
    saleUnit: 'unit',
    unitSymbol: 'ud',
    familyId,
    active: true,
  };
}
export const DEMO_PRODUCTS: Product[] = [
  product('p-aceite-cbd-10', 'Aceite CBD 10%', 'ACE-010', '24.90', '21', 'fam-aceites'),
  product('p-flor-lemon-haze', 'Flor Lemon Haze 2g', 'FLO-LH2', '14.50', '21', 'fam-flores'),
  product(
    'p-crema-regeneradora',
    'Crema regeneradora 50ml',
    'COS-R50',
    '19.90',
    '21',
    'fam-cosmetica',
  ),
  product('p-vapeador-pro', 'Vapeador Pro', 'VAP-PRO', '39.00', '21', 'fam-vapeo'),
  product('p-resina-premium', 'Resina Premium 1g', 'FLO-RP1', '22.00', '21', 'fam-flores'),
  product('p-infusion-relax', 'Infusión relax 20u', 'INF-R20', '8.90', '10', 'fam-infusiones'),
  product('p-aceite-cbd-5', 'Aceite CBD 5%', 'ACE-005', '16.90', '21', 'fam-aceites'),
  product('p-flor-premium', 'Flor Premium 3,5g', 'FLO-PR3', '29.90', '21', 'fam-flores'),
  product('p-balsamo-muscular', 'Bálsamo muscular', 'COS-BAL', '12.50', '21', 'fam-cosmetica'),
  product('p-liquido-vape', 'Líquido vape 10ml', 'VAP-L10', '9.90', '21', 'fam-vapeo'),
  product('p-infusion-noche', 'Infusión noche 15u', 'INF-N15', '7.50', '10', 'fam-infusiones'),
  product('p-aceite-full', 'Aceite full spectrum', 'ACE-FUL', '34.00', '21', 'fam-aceites'),
];

// Stock total por producto (para la columna STOCK del Catálogo). Calcado al mockup.
export const DEMO_PRODUCT_STOCK: Record<string, number> = {
  'p-aceite-cbd-10': 18,
  'p-flor-lemon-haze': 3,
  'p-crema-regeneradora': 11,
  'p-vapeador-pro': 0,
  'p-resina-premium': 25,
  'p-infusion-relax': 4,
  'p-aceite-cbd-5': 30,
  'p-flor-premium': 12,
  'p-balsamo-muscular': 9,
  'p-liquido-vape': 2,
  'p-infusion-noche': 16,
  'p-aceite-full': 6,
};
export function stockLevel(qty: number): 'red' | 'yellow' | 'green' {
  if (qty === 0) return 'red';
  if (qty <= 5) return 'yellow';
  return 'green';
}

// ─── Usuarios (4, con tienda para el mockup) ─────────────────
// `storeName` es un campo demo extra (User no lo trae); UsersPage lo lee opcional.
export interface DemoUser extends User {
  storeName: string;
}
export const DEMO_USERS: DemoUser[] = [
  {
    id: 'u-ana',
    name: 'Ana Caravaca',
    email: 'admin@org1.test',
    role: 'ADMIN',
    active: true,
    storeName: 'Central',
  },
  {
    id: 'u-luis',
    name: 'Luis Pérez',
    email: 'luis@org1.test',
    role: 'MANAGER',
    active: true,
    storeName: 'Centro',
  },
  {
    id: 'u-marta',
    name: 'Marta Ruiz',
    email: 'marta@org1.test',
    role: 'CLERK',
    active: true,
    storeName: 'Norte',
  },
  {
    id: 'u-jon',
    name: 'Jon Aguirre',
    email: 'jon@org1.test',
    role: 'CLERK',
    active: true,
    storeName: 'Sur',
  },
];
// Etiqueta de rol en castellano para el badge.
export const ROLE_LABEL: Record<User['role'], string> = {
  ADMIN: 'Admin',
  MANAGER: 'Responsable',
  CLERK: 'Dependiente',
};

// ─── Stock global (5 productos × 3 tiendas) ──────────────────
export const DEMO_STOCK_GLOBAL: StockGlobalRow[] = [
  {
    productId: 'p-aceite-cbd-10',
    productName: 'Aceite CBD 10%',
    total: 42,
    stores: [
      { storeId: 's-centro', storeName: 'Centro', quantity: 0, minStock: 5, level: 'red' },
      { storeId: 's-norte', storeName: 'Norte', quantity: 18, minStock: 5, level: 'green' },
      { storeId: 's-sur', storeName: 'Sur', quantity: 24, minStock: 5, level: 'green' },
    ],
  },
  {
    productId: 'p-flor-lemon-haze',
    productName: 'Flor Lemon Haze',
    total: 19,
    stores: [
      { storeId: 's-centro', storeName: 'Centro', quantity: 8, minStock: 5, level: 'green' },
      { storeId: 's-norte', storeName: 'Norte', quantity: 3, minStock: 5, level: 'yellow' },
      { storeId: 's-sur', storeName: 'Sur', quantity: 8, minStock: 5, level: 'green' },
    ],
  },
  {
    productId: 'p-vapeador-pro',
    productName: 'Vapeador Pro',
    total: 7,
    stores: [
      { storeId: 's-centro', storeName: 'Centro', quantity: 0, minStock: 5, level: 'red' },
      { storeId: 's-norte', storeName: 'Norte', quantity: 4, minStock: 5, level: 'yellow' },
      { storeId: 's-sur', storeName: 'Sur', quantity: 3, minStock: 5, level: 'yellow' },
    ],
  },
  {
    productId: 'p-crema-regeneradora',
    productName: 'Crema regeneradora',
    total: 33,
    stores: [
      { storeId: 's-centro', storeName: 'Centro', quantity: 11, minStock: 5, level: 'green' },
      { storeId: 's-norte', storeName: 'Norte', quantity: 14, minStock: 5, level: 'green' },
      { storeId: 's-sur', storeName: 'Sur', quantity: 8, minStock: 5, level: 'green' },
    ],
  },
  {
    productId: 'p-infusion-relax',
    productName: 'Infusión relax',
    total: 12,
    stores: [
      { storeId: 's-centro', storeName: 'Centro', quantity: 6, minStock: 5, level: 'green' },
      { storeId: 's-norte', storeName: 'Norte', quantity: 2, minStock: 5, level: 'yellow' },
      { storeId: 's-sur', storeName: 'Sur', quantity: 4, minStock: 5, level: 'yellow' },
    ],
  },
];
// 2 alertas (el subtab "Alertas" muestra el contador 2).
export const DEMO_ALERTS: StockAlert[] = [
  {
    id: 'a-1',
    productId: 'p-aceite-cbd-10',
    productName: 'Aceite CBD 10%',
    storeId: 's-centro',
    storeName: 'Centro',
    alertType: 'OUT_OF_STOCK',
    resolved: false,
    createdAt: '2026-06-02T08:00:00.000Z',
  },
  {
    id: 'a-2',
    productId: 'p-vapeador-pro',
    productName: 'Vapeador Pro',
    storeId: 's-centro',
    storeName: 'Centro',
    alertType: 'OUT_OF_STOCK',
    resolved: false,
    createdAt: '2026-06-02T08:05:00.000Z',
  },
];

// ─── Ventas (5 tickets del mockup) ───────────────────────────
// `storeName` y `lines` son campos demo extra; SalesHistoryPage los lee opcional.
export interface DemoSale extends SaleSummary {
  storeName: string;
  lines: number;
}
const DEMO_SALE_ITEMS: DemoSale[] = [
  {
    id: 'v-1042',
    ticketNumber: '#A-1042',
    createdAt: '2026-06-02T12:41:00.000Z',
    total: '53.90',
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    storeId: 's-centro',
    storeName: 'Centro',
    lines: 3,
  },
  {
    id: 'v-1041',
    ticketNumber: '#A-1041',
    createdAt: '2026-06-02T12:30:00.000Z',
    total: '24.90',
    paymentMethod: 'CARD',
    status: 'COMPLETED',
    storeId: 's-centro',
    storeName: 'Centro',
    lines: 1,
  },
  {
    id: 'v-1040',
    ticketNumber: '#A-1040',
    createdAt: '2026-06-02T12:18:00.000Z',
    total: '88.40',
    paymentMethod: 'CARD',
    status: 'VOIDED',
    storeId: 's-norte',
    storeName: 'Norte',
    lines: 5,
  },
  {
    id: 'v-1039',
    ticketNumber: '#A-1039',
    createdAt: '2026-06-02T11:57:00.000Z',
    total: '34.40',
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    storeId: 's-sur',
    storeName: 'Sur',
    lines: 2,
  },
  {
    id: 'v-1038',
    ticketNumber: '#A-1038',
    createdAt: '2026-06-02T11:40:00.000Z',
    total: '61.20',
    paymentMethod: 'CARD',
    status: 'COMPLETED',
    storeId: 's-granvia',
    storeName: 'Gran Vía',
    lines: 4,
  },
];
export const DEMO_SALES_PAGE: SalesPage = {
  items: DEMO_SALE_ITEMS,
  page: 1,
  pageSize: 20,
  totalItems: DEMO_SALE_ITEMS.length,
  // totals agrega solo COMPLETED (las VOIDED no suman): 53.90+24.90+34.40+61.20 = 174.40 (4 tickets).
  totals: { count: 4, totalAmount: '174.40' },
};

// ─── VeriFactu (128 enviados / 0 cola / 0 fallidos) ──────────
// Lista demo de registros SENT para que el contador de enviados tenga sentido.
export const DEMO_VERIFACTU: VerifactuRecord[] = Array.from({ length: 6 }, (_, i) => ({
  id: `vf-${i}`,
  saleId: `v-${1042 - i}`,
  returnId: null,
  type: 'INVOICE',
  status: 'SENT',
  hash: `hash${i}`,
  previousHash: i === 0 ? null : `hash${i - 1}`,
  qrData: null,
  attempts: 1,
  lastError: null,
  sentAt: '2026-06-02T12:40:00.000Z',
  createdAt: '2026-06-02T12:40:00.000Z',
}));
export const DEMO_VERIFACTU_STATS = { sentToday: 128, queued: 0, failed: 0, lastSentSeconds: 14 };

// ─── Dashboard ───────────────────────────────────────────────
export const DEMO_SALES_TODAY: SalesTodayResponse = {
  today: { total: 1284, count: 68 },
  yesterday: { total: 1142, count: 63 },
  deltaPct: 12.4,
  byStore: [
    { storeId: 's-centro', storeName: 'Centro', today: 310, yesterday: 280, deltaPct: 10.7 },
    { storeId: 's-norte', storeName: 'Norte', today: 240, yesterday: 300, deltaPct: -20 },
    { storeId: 's-sur', storeName: 'Sur', today: 220, yesterday: 150, deltaPct: 46.7 },
    { storeId: 's-granvia', storeName: 'Gran Vía', today: 360, yesterday: 250, deltaPct: 44 },
    { storeId: 's-online', storeName: 'Online', today: 154, yesterday: 162, deltaPct: -4.9 },
  ],
};
export const DEMO_SALES_KPIS: SalesKpis = {
  salesCount: 68,
  revenue: 1284,
  avgTicket: 18.9,
  upt: 2.4,
  discountRate: 0.062,
  returnRate: 0.018,
};
export const DEMO_MARGIN_KPIS: MarginKpis = {
  grossMargin: 526,
  realMargin: 500,
  marginPct: 0.41,
  revenue: 1284,
};
export const DEMO_SALES_BY_FAMILY: FamilySales[] = [
  { familyId: 'fam-flores', familyName: 'Flores CBD', color: '#16734f', total: 488 },
  { familyId: 'fam-aceites', familyName: 'Aceites', color: '#b45309', total: 344 },
  { familyId: 'fam-cosmetica', familyName: 'Cosmética', color: '#7c3aed', total: 220 },
  { familyId: 'fam-vapeo', familyName: 'Vapeo', color: '#2563eb', total: 152 },
  { familyId: 'fam-infusiones', familyName: 'Infusiones', color: '#0e7c6b', total: 80 },
];
export const DEMO_STOCKOUT_KPIS: StockoutKpis = {
  events: 4,
  resolved: 2,
  open: 2,
  avgDurationHours: 3.5,
  rate: 0.04,
  estimatedLostSales: 320,
};
export const DEMO_RANKINGS: ProductRankings = {
  topSales: [
    { productId: 'p-aceite-cbd-10', name: 'Aceite CBD 10%', total: 142, units: 6 },
    { productId: 'p-flor-premium', name: 'Flor Premium 3,5g', total: 120, units: 4 },
    { productId: 'p-resina-premium', name: 'Resina Premium 1g', total: 88, units: 4 },
    { productId: 'p-crema-regeneradora', name: 'Crema regeneradora 50ml', total: 60, units: 3 },
  ],
  topMargin: [
    { productId: 'p-flor-premium', name: 'Flor Premium 3,5g', margin: 72 },
    { productId: 'p-aceite-cbd-10', name: 'Aceite CBD 10%', margin: 64 },
  ],
  worstRotation: [
    { productId: 'p-liquido-vape', name: 'Líquido vape 10ml', units: 1 },
    { productId: 'p-vapeador-pro', name: 'Vapeador Pro', units: 2 },
  ],
};
// Roturas de stock del mockup (lista del panel derecho del Dashboard).
export const DEMO_STOCKOUTS: Array<{
  name: string;
  store: string;
  qty: number;
  level: 'red' | 'yellow';
}> = [
  { name: 'Aceite CBD 10%', store: 'Centro', qty: 0, level: 'red' },
  { name: 'Vapeador Pro', store: 'Centro', qty: 0, level: 'red' },
  { name: 'Flor Lemon Haze', store: 'Norte', qty: 3, level: 'yellow' },
  { name: 'Infusión relax', store: 'Sur', qty: 4, level: 'yellow' },
];
```

- [ ] **Step 2: Typecheck del módulo**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit`
Expected: PASS. Si algún campo no casa con los tipos de `@simpletpv/auth`, ajustar al tipo real.

- [ ] **Step 3: Commit**

```bash
git add apps/backoffice/src/demo/demoData.ts
git commit -m "feat(backoffice): datos demo calcados a los mockups"
```

---

## Task 2: Interceptar lib/\* con datos demo + login mock

**Files:**

- Modify: `apps/backoffice/src/lib/{admin,dashboard,families,products,stock,verifactu,purchases}.ts`, `lib/auth.ts`

Cada función devuelve datos demo vía `Promise.resolve`. Se conservan firmas y reexports de tipos.

- [ ] **Step 1: admin.ts → demo**

```typescript
// apps/backoffice/src/lib/admin.ts
import type { NewUser, SalesPage, Store, StoreInput, User } from '@simpletpv/auth';

import { DEMO_SALES_PAGE, DEMO_STORES, DEMO_USERS } from '../demo/demoData.js';

export type { NewUser, SalesPage, Store, StoreInput, User };

export function listUsers(): Promise<User[]> {
  return Promise.resolve(DEMO_USERS);
}
export function createUser(input: NewUser): Promise<User> {
  return Promise.resolve({
    id: `u-${input.email}`,
    name: input.name,
    email: input.email,
    role: input.role,
    active: true,
  });
}
export function deleteUser(_id: string): Promise<void> {
  return Promise.resolve();
}

export function listStores(): Promise<Store[]> {
  return Promise.resolve(DEMO_STORES);
}
export function createStore(input: StoreInput): Promise<Store> {
  return Promise.resolve({
    id: `s-${input.code}`,
    name: input.name,
    code: input.code,
    address: input.address ?? null,
    active: true,
  });
}
export function deleteStore(_id: string): Promise<void> {
  return Promise.resolve();
}

export function listSales(_params: {
  storeId?: string;
  date?: string;
  page?: number;
}): Promise<SalesPage> {
  return Promise.resolve(DEMO_SALES_PAGE);
}
```

- [ ] **Step 2: dashboard.ts → demo**

Mantener los `export type`/`export interface` tal cual (los consumen las páginas). Reemplazar solo los cuerpos de las funciones para que devuelvan los datos demo. Sustituir desde `function periodQuery(...)` hasta el final del archivo por:

```typescript
// apps/backoffice/src/lib/dashboard.ts — cuerpos demo (debajo de las interfaces)
import {
  DEMO_MARGIN_KPIS,
  DEMO_RANKINGS,
  DEMO_SALES_BY_FAMILY,
  DEMO_SALES_KPIS,
  DEMO_SALES_TODAY,
  DEMO_STOCKOUT_KPIS,
} from '../demo/demoData.js';

export function getSalesToday(_storeId?: string): Promise<SalesTodayResponse> {
  return Promise.resolve(DEMO_SALES_TODAY);
}
export function getSalesByFamily(
  _period: DashboardPeriod,
  _storeId?: string,
): Promise<FamilySales[]> {
  return Promise.resolve(DEMO_SALES_BY_FAMILY);
}
export function getSalesKpis(_period: DashboardPeriod, _storeId?: string): Promise<SalesKpis> {
  return Promise.resolve(DEMO_SALES_KPIS);
}
export function getMarginKpis(_period: DashboardPeriod, _storeId?: string): Promise<MarginKpis> {
  return Promise.resolve(DEMO_MARGIN_KPIS);
}
export function getStockoutKpis(
  _period: DashboardPeriod,
  _storeId?: string,
): Promise<StockoutKpis> {
  return Promise.resolve(DEMO_STOCKOUT_KPIS);
}
export function getProductRankings(
  _period: DashboardPeriod,
  _storeId?: string,
): Promise<ProductRankings> {
  return Promise.resolve(DEMO_RANKINGS);
}
```

Eliminar el `import { api } from './auth.js';` del inicio (ya no se usa) y la función `periodQuery` (huérfana).

- [ ] **Step 3: products.ts → demo**

```typescript
// apps/backoffice/src/lib/products.ts
import type { Product, ProductInput } from '@simpletpv/auth';

import { DEMO_PRODUCTS } from '../demo/demoData.js';

export type { Product, ProductInput };

export function listProducts(search?: string): Promise<Product[]> {
  const term = (search ?? '').trim().toLowerCase();
  const rows =
    term === ''
      ? DEMO_PRODUCTS
      : DEMO_PRODUCTS.filter(
          (p) => p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term),
        );
  return Promise.resolve(rows);
}
export function createProduct(input: ProductInput): Promise<Product> {
  return Promise.resolve({
    id: `p-${input.name}`,
    name: input.name,
    sku: input.sku ?? null,
    barcode: input.barcode ?? null,
    description: null,
    salePrice: String(input.salePrice),
    costPrice: String(input.costPrice ?? 0),
    taxRate: String(input.taxRate ?? 21),
    saleUnit: 'unit',
    unitSymbol: 'ud',
    familyId: input.familyId ?? null,
    active: true,
  });
}
export function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const base = DEMO_PRODUCTS.find((p) => p.id === id) ?? DEMO_PRODUCTS[0]!;
  return Promise.resolve({
    ...base,
    ...(input.name ? { name: input.name } : {}),
    ...(input.salePrice != null ? { salePrice: String(input.salePrice) } : {}),
  });
}
export function deleteProduct(_id: string): Promise<void> {
  return Promise.resolve();
}
```

- [ ] **Step 4: families.ts → demo**

```typescript
// apps/backoffice/src/lib/families.ts
import type { FamilyInput, FamilyNode } from '@simpletpv/auth';

import { DEMO_FAMILIES } from '../demo/demoData.js';

export type { FamilyInput, FamilyNode };

export function listFamilies(): Promise<FamilyNode[]> {
  return Promise.resolve(DEMO_FAMILIES);
}
export function createFamily(input: FamilyInput): Promise<FamilyNode> {
  return Promise.resolve({
    id: `fam-${input.name}`,
    parentId: input.parentId ?? null,
    name: input.name,
    color: input.color ?? null,
    icon: input.icon ?? null,
    sortOrder: input.sortOrder ?? 0,
    children: [],
  });
}
export function updateFamily(id: string, input: Partial<FamilyInput>): Promise<FamilyNode> {
  const base = DEMO_FAMILIES.find((f) => f.id === id) ?? DEMO_FAMILIES[0]!;
  return Promise.resolve({ ...base, ...(input.name ? { name: input.name } : {}) });
}
export function deleteFamily(_id: string): Promise<void> {
  return Promise.resolve();
}
```

> `DEMO_FAMILIES` es `DemoFamily[]` (extiende `FamilyNode` con `productCount`), así que es asignable a `Promise<FamilyNode[]>` sin error. FamiliesPage leerá `productCount` con un cast tolerante (Task 5).

- [ ] **Step 5: stock.ts → demo**

```typescript
// apps/backoffice/src/lib/stock.ts
import type { SetMinStockInput, StockAlert, StockGlobalRow, Transfer } from '@simpletpv/auth';

import { DEMO_ALERTS, DEMO_STOCK_GLOBAL } from '../demo/demoData.js';

export type { StockAlert, StockGlobalRow, Transfer };

export function getGlobalStock(): Promise<StockGlobalRow[]> {
  return Promise.resolve(DEMO_STOCK_GLOBAL);
}
export function listAlerts(_storeId?: string): Promise<StockAlert[]> {
  return Promise.resolve(DEMO_ALERTS);
}
export function setMinStock(_input: SetMinStockInput): Promise<unknown> {
  return Promise.resolve({ ok: true });
}
export function listMovements(
  _productId: string,
): Promise<{ items: never[]; page: number; pageSize: number; totalItems: number }> {
  return Promise.resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 });
}
export function listTransfers(_status?: string): Promise<Transfer[]> {
  return Promise.resolve([]);
}
export function createTransfer(): Promise<Transfer> {
  return Promise.reject(new Error('no disponible en demo'));
}
export function sendTransfer(): Promise<Transfer> {
  return Promise.reject(new Error('no disponible en demo'));
}
```

> Verificar el tipo de retorno real de `listMovements` en el archivo actual (era `StockMovementsPage`). Si difiere, importar `StockMovementsPage` de `@simpletpv/auth` y devolver `{ items: [], page: 1, pageSize: 20, totalItems: 0 }` tipado como tal. `createTransfer`/`sendTransfer` no se usan en el mockup (estado demo sin traspasos); su rechazo queda capturado por el manejo de error existente.

- [ ] **Step 6: verifactu.ts → demo**

```typescript
// apps/backoffice/src/lib/verifactu.ts
import type { VerifactuRecord } from '@simpletpv/auth';

import { DEMO_VERIFACTU } from '../demo/demoData.js';

export type { VerifactuRecord };

export function listVerifactu(status?: string): Promise<VerifactuRecord[]> {
  const rows = status ? DEMO_VERIFACTU.filter((r) => r.status === status) : DEMO_VERIFACTU;
  return Promise.resolve(rows);
}
export function retryVerifactu(_id: string): Promise<{ ok: true }> {
  return Promise.resolve({ ok: true });
}
```

- [ ] **Step 7: purchases.ts → demo (estado vacío)**

```typescript
// apps/backoffice/src/lib/purchases.ts
import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  SuggestionRow,
  Supplier,
  SupplierInput,
  SuggestPurchaseInput,
} from '@simpletpv/auth';

export type { PurchaseOrder, SuggestionRow, Supplier };

export function listSuppliers(): Promise<Supplier[]> {
  return Promise.resolve([]);
}
export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return Promise.resolve({
    id: `sup-${input.name}`,
    name: input.name,
    nif: input.nif ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    leadTimeDays: input.leadTimeDays ?? 0,
    active: true,
  });
}
export function deleteSupplier(_id: string): Promise<void> {
  return Promise.resolve();
}
export function listPurchaseOrders(_status?: string): Promise<PurchaseOrder[]> {
  return Promise.resolve([]); // estado vacío "Sin pedidos abiertos"
}
export function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return Promise.resolve({
    id,
    supplierId: '',
    storeId: '',
    status: 'DRAFT',
    notes: null,
    createdAt: '2026-06-02T10:00:00.000Z',
    confirmedAt: null,
    receivedAt: null,
    lines: [],
  });
}
export function createPurchaseOrder(_input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  return getPurchaseOrder('po-demo');
}
export function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return getPurchaseOrder(id);
}
export function receivePurchaseOrder(
  id: string,
  _input: ReceivePurchaseOrderInput,
): Promise<PurchaseOrder> {
  return getPurchaseOrder(id);
}
export function suggestPurchase(_input: SuggestPurchaseInput): Promise<SuggestionRow[]> {
  return Promise.resolve([]);
}
```

> Verificar los nombres exactos de los tipos de input importados (`CreatePurchaseOrderInput`, `ReceivePurchaseOrderInput`, `SuggestPurchaseInput`, `SupplierInput`) en `@simpletpv/auth`; ajustar si difieren.

- [ ] **Step 8: auth.ts → login mockeado**

```typescript
// apps/backoffice/src/lib/auth.ts
import type { AppEvent } from '@simpletpv/auth';
import { setupAuth } from '@simpletpv/auth';

import { DEMO_JWT } from '../demo/demoData.js';

const setup = setupAuth('backoffice');

export const useAuthStore = setup.useAuthStore;

// Modo demo: login acepta cualquier credencial y guarda un JWT falso con
// role=ADMIN (para pasar el guard del backoffice). No llama a la API.
export const api = {
  ...setup.api,
  login: (_email: string, _password: string): Promise<void> => {
    setup.useAuthStore.getState().setTokens({ accessToken: DEMO_JWT, refreshToken: DEMO_JWT });
    return Promise.resolve();
  },
  subscribeEvents: (_onEvent: (event: AppEvent) => void): (() => void) => {
    return () => {};
  },
};
```

- [ ] **Step 9: Typecheck + lint**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit && pnpm exec eslint apps/backoffice/src/lib/`
Expected: PASS. Resolver cualquier import de tipo inexistente ajustándolo al nombre real de `@simpletpv/auth`.

- [ ] **Step 10: Commit**

```bash
git add apps/backoffice/src/lib/
git commit -m "feat(backoffice): capa demo en lib/* y login mockeado (ADMIN)"
```

---

## Task 3: Helper de navegación entre apps + shell con TopBar

**Files:**

- Create: `apps/backoffice/src/lib/nav.ts`
- Modify: `apps/backoffice/src/App.tsx`, `apps/backoffice/src/styles.css`

- [ ] **Step 1: Crear el helper de navegación**

```typescript
// apps/backoffice/src/lib/nav.ts
// Navegación entre apps del toggle Backoffice/TPV. La URL de la otra app se lee
// de una env var Vite, con default de local (TPV dev en :5173).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'backoffice') return; // ya estamos en backoffice
  const url = import.meta.env.VITE_TPV_URL ?? 'http://localhost:5173';
  window.location.assign(url);
}
```

- [ ] **Step 2: Declarar la env var en vite-env**

Comprobar `apps/backoffice/src/vite-env.d.ts`. Si no declara `VITE_TPV_URL`, añadir:

```typescript
interface ImportMetaEnv {
  readonly VITE_TPV_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

(Si ya existe `ImportMetaEnv`, añadir solo la línea `readonly VITE_TPV_URL?: string;`.)

- [ ] **Step 3: App.tsx — usar TopBar compartida**

En `apps/backoffice/src/App.tsx`:

1. Importar `TopBar` y el helper, y los datos demo del usuario:

```typescript
import { LoginForm, type NavGroup, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { DEMO_USER } from './demo/demoData.js';
import { switchApp } from './lib/nav.js';
```

2. Añadir el import del CSS de la topbar al principio (junto a los otros imports de CSS):

```typescript
import '@simpletpv/ui/topbar.css';
```

3. Reemplazar el cuerpo de `Home()` (la `return`) por:

```tsx
return (
  <div className="app-shell">
    <Sidebar
      items={NAV}
      groups={GROUPS}
      activeItem={tab}
      onSelect={(id) => setTab(id as Tab)}
      brand={{ title: 'SimpleTPV', subtitle: 'Backoffice' }}
      user={{ name: DEMO_USER.name, subtitle: 'Central · Admin' }}
    />
    <div className="app-content">
      <TopBar
        eyebrow="Administración"
        title={TAB_LABELS[tab]}
        activeApp="backoffice"
        onSwitchApp={switchApp}
        onLogout={logout}
      />
      <main className="bo-main">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'catalog' && <CatalogPage />}
        {tab === 'families' && <FamiliesPage />}
        {tab === 'stock' && <StockPage />}
        {tab === 'users' && <UsersPage />}
        {tab === 'stores' && <StoresPage />}
        {tab === 'sales' && <SalesHistoryPage />}
        {tab === 'purchases' && <PurchasesPage />}
        {tab === 'verifactu' && <VerifactuPage />}
      </main>
    </div>
  </div>
);
```

- [ ] **Step 4: styles.css — quitar bo-topbar y dejar bo-main**

En `apps/backoffice/src/styles.css`, eliminar los bloques `.bo-topbar`, `.bo-topbar-eyebrow`, `.bo-topbar-title`, `.bo-topbar-logout` (los sustituye la `TopBar`). Añadir el padding del main si no existe:

```css
.bo-main {
  padding: 1.5rem 2rem;
  min-width: 0;
}
```

(Mantener `.app-shell` y `.app-content` como están.)

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit && pnpm exec eslint apps/backoffice/src/App.tsx apps/backoffice/src/lib/nav.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backoffice/src/App.tsx apps/backoffice/src/styles.css apps/backoffice/src/lib/nav.ts apps/backoffice/src/vite-env.d.ts
git commit -m "feat(backoffice): shell con TopBar compartida + toggle navegable"
```

---

## Task 4: Cablear el toggle del TPV a la navegación

**Files:**

- Create: `apps/tpv/src/lib/nav.ts`
- Modify: `apps/tpv/src/App.tsx`, `apps/tpv/src/vite-env.d.ts`

- [ ] **Step 1: Crear el helper de navegación del TPV**

```typescript
// apps/tpv/src/lib/nav.ts
// Navegación del toggle Backoffice/TPV: navega al backoffice (default local :5174).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'tpv') return; // ya estamos en TPV
  const url = import.meta.env.VITE_BACKOFFICE_URL ?? 'http://localhost:5174';
  window.location.assign(url);
}
```

- [ ] **Step 2: Declarar la env var en vite-env del TPV**

En `apps/tpv/src/vite-env.d.ts`, añadir `readonly VITE_BACKOFFICE_URL?: string;` dentro de `ImportMetaEnv` (crear la interfaz si no existe, igual que en Task 3 Step 2).

- [ ] **Step 3: App.tsx del TPV — pasar onSwitchApp**

En `apps/tpv/src/App.tsx`, importar el helper y pasarlo a la `TopBar`:

```typescript
import { switchApp } from './lib/nav.js';
```

Y en el `<TopBar ... />` añadir la prop `onSwitchApp={switchApp}` (mantener `activeApp="tpv"`, `onLogout={logout}`):

```tsx
<TopBar eyebrow={eyebrow} title={title} activeApp="tpv" onSwitchApp={switchApp} onLogout={logout} />
```

- [ ] **Step 4: Typecheck + lint del TPV**

Run: `pnpm --filter @simpletpv/tpv exec tsc --noEmit && pnpm exec eslint apps/tpv/src/App.tsx apps/tpv/src/lib/nav.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/tpv/src/App.tsx apps/tpv/src/lib/nav.ts apps/tpv/src/vite-env.d.ts
git commit -m "feat(tpv): toggle Backoffice/TPV navega al backoffice por env var"
```

---

## Task 5: Catálogo, Familias y Usuarios (refinar tablas)

**Files:**

- Modify: `apps/backoffice/src/CatalogPage.tsx`, `FamiliesPage.tsx`, `UsersPage.tsx`, `catalog.css`

- [ ] **Step 1: CatalogPage — subtítulo + columna STOCK + Editar**

En `apps/backoffice/src/CatalogPage.tsx`:

1. Importar el stock demo y el helper de nivel:

```typescript
import { DEMO_PRODUCT_STOCK, stockLevel } from './demo/demoData.js';
```

2. Bajo el `<h2>Catálogo</h2>`, añadir el subtítulo con el contador (dentro del header, antes de las acciones). Reemplazar el `<h2>Catálogo</h2>` por:

```tsx
<div>
  <h2>Catálogo</h2>
  <p className="catalog-sub" data-testid="catalog-count">
    {products.length} productos activos
  </p>
</div>
```

3. Añadir la columna STOCK a la tabla. En el `<thead>`, tras `<th>IVA</th>` añadir `<th>Stock</th>`. En cada fila, tras la celda de IVA añadir:

```tsx
<td>
  {(() => {
    const qty = DEMO_PRODUCT_STOCK[p.id] ?? 0;
    return (
      <span className={`stock-tag stock-${stockLevel(qty)}`} data-testid="catalog-stock">
        {qty}
      </span>
    );
  })()}
</td>
```

4. Asegurar que la celda de acciones tiene "Editar" y "Borrar" (si solo tiene Borrar, añadir Editar que abra el form de edición existente). Mantener los testids actuales.

- [ ] **Step 2: catalog.css — subtítulo**

Añadir a `apps/backoffice/src/catalog.css`:

```css
.catalog-sub {
  margin: 0.15rem 0 0;
  font-size: 0.88rem;
  color: var(--ui-text-muted);
}
```

- [ ] **Step 3: FamiliesPage — subtítulo + bullet de color + N productos**

En `apps/backoffice/src/FamiliesPage.tsx`:

1. Subtítulo bajo el `<h2>`: reemplazar `<h2>Familias</h2>` (o equivalente) por:

```tsx
<div>
  <h2>Familias</h2>
  <p className="catalog-sub">Estructura de catálogo · 2 niveles</p>
</div>
```

2. En `FamilyRow`, mostrar el bullet con el color de la familia y el contador de productos. Reemplazar el `<span className="fam-name">...</span>` por:

```tsx
        <span className="fam-name">
          <span className="fam-color-dot" style={{ background: node.color ?? 'var(--ui-text-soft)' }} />
          {node.name}
        </span>
        <span className="fam-count" data-testid="fam-count">
          {(node as { productCount?: number }).productCount ?? 0} productos
        </span>
```

(Mantener `fam-actions` con Editar/Borrar a la derecha.)

- [ ] **Step 4: catalog.css — estilos de familia**

```css
.fam-color-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 3px;
  margin-right: 0.5rem;
  vertical-align: middle;
}
.fam-count {
  margin-left: auto;
  color: var(--ui-text-muted);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}
.fam-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}
```

- [ ] **Step 5: UsersPage — subtítulo + badge de rol + columna TIENDA**

En `apps/backoffice/src/UsersPage.tsx`:

1. Importar la etiqueta de rol:

```typescript
import { ROLE_LABEL } from './demo/demoData.js';
```

2. Subtítulo: reemplazar `<h2>Usuarios</h2>` por:

```tsx
<div>
  <h2>Usuarios</h2>
  <p className="catalog-sub" data-testid="users-count">
    {users.length} usuarios
  </p>
</div>
```

3. Cabecera: tras `<th>Email</th>` la tabla debe quedar `Nombre / Email / Rol / Tienda`. Cambiar el `<thead>` a:

```tsx
<tr>
  <th>Nombre</th>
  <th>Email</th>
  <th>Rol</th>
  <th>Tienda</th>
  <th />
</tr>
```

4. Filas: pintar el rol como badge y añadir la tienda. Reemplazar la celda `<td>{u.role}</td>` y siguientes por:

```tsx
                <td>
                  <span className="role-badge" data-testid="user-role-badge">
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td className="muted">{(u as { storeName?: string }).storeName ?? '—'}</td>
                <td className="row-actions">
                  <button>Editar</button>
                </td>
```

(El mockup muestra solo "Editar" en Usuarios; sustituir el botón "Borrar" por "Editar" que abra el form existente, o conservar ambos si se prefiere — el mockup solo muestra Editar.)

- [ ] **Step 6: catalog.css — badge de rol**

```css
.role-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--ui-success-soft);
  color: var(--ui-success);
}
```

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit && pnpm exec eslint apps/backoffice/src/CatalogPage.tsx apps/backoffice/src/FamiliesPage.tsx apps/backoffice/src/UsersPage.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backoffice/src/CatalogPage.tsx apps/backoffice/src/FamiliesPage.tsx apps/backoffice/src/UsersPage.tsx apps/backoffice/src/catalog.css
git commit -m "feat(backoffice): Catálogo/Familias/Usuarios calcados (stock, contadores, badges)"
```

---

## Task 6: Tiendas como grid de cards

**Files:**

- Modify: `apps/backoffice/src/StoresPage.tsx`, `catalog.css`

- [ ] **Step 1: Reescribir el listado de StoresPage a cards**

En `apps/backoffice/src/StoresPage.tsx`, reemplazar el bloque que va desde `<header className="catalog-head">` hasta el cierre de la tabla (el `</table>` o el `<p>` de empty) por:

```tsx
<header className="catalog-head">
  <div>
    <h2>Tiendas</h2>
    <p className="catalog-sub">{stores.length} ubicaciones</p>
  </div>
  <button
    className="btn-primary"
    onClick={() => setForm({ name: '', code: '', address: '' })}
    data-testid="new-store"
  >
    Nueva tienda
  </button>
</header>;

{
  isLoading ? (
    <p className="catalog-empty">Cargando…</p>
  ) : stores.length === 0 ? (
    <p className="catalog-empty" data-testid="stores-empty">
      Sin tiendas. Crea la primera.
    </p>
  ) : (
    <div className="store-grid" data-testid="stores-grid">
      {stores.map((s) => (
        <div className="store-card" key={s.id} data-testid="store-card">
          <span className="store-card-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l1-5h16l1 5" />
              <path d="M4 9v11h16V9" />
              <path d="M9 20v-6h6v6" />
            </svg>
          </span>
          <span className="store-card-text">
            <span className="store-card-name">{s.name}</span>
            <span className="store-card-addr">{s.address ?? '—'}</span>
          </span>
          <span className={`store-badge ${s.active ? 'active' : 'muted'}`}>
            {s.active ? 'Activa' : 'Almacén'}
          </span>
        </div>
      ))}
    </div>
  );
}
```

(Mantener intacto el bloque del modal `{form && (...)}`.)

- [ ] **Step 2: catalog.css — estilos del grid de tiendas**

```css
.store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.8rem;
}
.store-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}
.store-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text-muted);
  flex-shrink: 0;
}
.store-card-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.store-card-name {
  font-weight: 700;
  color: var(--ui-text);
}
.store-card-addr {
  font-size: 0.82rem;
  color: var(--ui-text-soft);
}
.store-badge {
  margin-left: auto;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
}
.store-badge.active {
  background: var(--ui-success-soft);
  color: var(--ui-success);
}
.store-badge.muted {
  background: var(--ui-surface-subtle);
  color: var(--ui-text-muted);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit && pnpm exec eslint apps/backoffice/src/StoresPage.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backoffice/src/StoresPage.tsx apps/backoffice/src/catalog.css
git commit -m "feat(backoffice): Tiendas como grid de cards calcado al mockup"
```

---

## Task 7: Stock, Ventas y Compras (refinar presentación)

**Files:**

- Modify: `apps/backoffice/src/StockPage.tsx`, `SalesHistoryPage.tsx`, `PurchasesPage.tsx`, `catalog.css`

- [ ] **Step 1: StockPage — subtítulo + badges "Tienda : N" por tienda**

En `apps/backoffice/src/StockPage.tsx`:

1. Subtítulo: bajo el `<h2>` (o el header de la sección) añadir:

```tsx
<div>
  <h2>Stock</h2>
  <p className="catalog-sub">Stock por tienda en tiempo real</p>
</div>
```

2. En la celda "Por tienda" del tab global, sustituir la lista `<ul className="stock-stores">...` por badges horizontales calcados al mockup:

```tsx
<td>
  <span className="stock-badges">
    {row.stores.map((st) => (
      <span
        className={`store-stock-badge stock-${st.level}`}
        key={st.storeId}
        data-testid="stock-store-cell"
      >
        <span className={`stock-dot stock-${st.level}`} />
        {st.storeName} : {st.quantity}
      </span>
    ))}
  </span>
</td>
```

(Conservar los testids `stock-row`, `stock-table`, etc. El editor de mínimo y "Movimientos" pueden quedarse como acción secundaria a la derecha; el mockup muestra "Movimientos" en la última columna.)

- [ ] **Step 2: catalog.css — badges de stock por tienda**

```css
.stock-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.store-stock-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
}
```

- [ ] **Step 2bis: Verificar el contador del subtab Alertas**

En `StockPage.tsx`, el subtab "Alertas" muestra un contador. Asegurar que usa `alerts.length` (los datos demo devuelven 2 alertas). Si el badge no existe, añadir junto a la etiqueta del subtab Alertas:

```tsx
            Alertas {alerts.length > 0 && <span className="subtab-badge">{alerts.length}</span>}
```

Y en `catalog.css`:

```css
.subtab-badge {
  margin-left: 0.35rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}
```

> Si el subtab de alertas ya tiene un contador con otro nombre de clase, mantener el existente y solo asegurar que lee `alerts.length`.

- [ ] **Step 3: SalesHistoryPage — columnas y subtítulo calcados**

En `apps/backoffice/src/SalesHistoryPage.tsx`:

1. Subtítulo bajo el `<h2>`:

```tsx
<div>
  <h2>Ventas</h2>
  <p className="catalog-sub">Historial de tickets · hoy</p>
</div>
```

2. Cabecera de tabla → TICKET / TIENDA / LÍNEAS / PAGO / TOTAL / HORA:

```tsx
<tr>
  <th>Ticket</th>
  <th>Tienda</th>
  <th>Líneas</th>
  <th>Pago</th>
  <th>Total</th>
  <th>Hora</th>
</tr>
```

3. Filas con los campos demo (tienda y líneas vía cast tolerante; método en castellano):

```tsx
<tr
  key={sale.id}
  className={sale.status === 'VOIDED' ? 'sale-voided' : undefined}
  data-testid="sales-row"
>
  <td>
    {sale.ticketNumber}
    {sale.status === 'VOIDED' && <span className="sale-tag-voided">Anulada</span>}
  </td>
  <td className="muted">{(sale as { storeName?: string }).storeName ?? '—'}</td>
  <td>{(sale as { lines?: number }).lines ?? '—'}</td>
  <td className="muted">{sale.paymentMethod === 'CASH' ? 'Efectivo' : 'Tarjeta'}</td>
  <td>{Number(sale.total).toFixed(2).replace('.', ',')} €</td>
  <td className="muted">{new Date(sale.createdAt).toUTCString().slice(17, 22)}</td>
</tr>
```

> `toUTCString().slice(17,22)` extrae "HH:MM" en UTC (calca la hora del mockup sin desfase de zona). Conservar el resto de la página (filtro de tienda, paginación) tal cual; el subtítulo ya indica "hoy".

- [ ] **Step 4: PurchasesPage — estado vacío calcado**

El estado vacío ya aparece porque `listPurchaseOrders()` devuelve `[]`. Ajustar el texto del empty del subtab "orders" para calcar el mockup y añadir el botón "Generar propuesta". En `apps/backoffice/src/PurchasesPage.tsx`, localizar el `data-testid="orders-empty"` y sustituir su contenido por un bloque centrado:

```tsx
<div className="purchases-empty" data-testid="orders-empty">
  <span className="purchases-empty-icon" aria-hidden="true">
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05" />
    </svg>
  </span>
  <p className="purchases-empty-title">Sin pedidos abiertos</p>
  <p className="purchases-empty-text">
    Genera una propuesta automática a partir de ventas, rotación y mínimos.
  </p>
</div>
```

(El botón "Generar propuesta" ya existe en el subtab "suggest"; el mockup lo muestra dentro del estado vacío. Si la página tiene un botón de generar, enlazarlo aquí; si no, dejar el estado vacío informativo con el subtítulo "Propuestas y pedidos a proveedor" en el header.)

Añadir también el subtítulo en el header de Compras:

```tsx
<div>
  <h2>Compras</h2>
  <p className="catalog-sub">Propuestas y pedidos a proveedor</p>
</div>
```

- [ ] **Step 5: catalog.css — estado vacío de compras**

```css
.purchases-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 3rem 1.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-surface);
}
.purchases-empty-icon {
  color: var(--ui-text-soft);
  margin-bottom: 0.25rem;
}
.purchases-empty-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--ui-text);
}
.purchases-empty-text {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ui-text-muted);
  max-width: 28rem;
}
```

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit && pnpm exec eslint apps/backoffice/src/StockPage.tsx apps/backoffice/src/SalesHistoryPage.tsx apps/backoffice/src/PurchasesPage.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backoffice/src/StockPage.tsx apps/backoffice/src/SalesHistoryPage.tsx apps/backoffice/src/PurchasesPage.tsx apps/backoffice/src/catalog.css
git commit -m "feat(backoffice): Stock/Ventas/Compras calcados al mockup"
```

---

## Task 8: VeriFactu (3 cards + conector) y Dashboard (roturas como lista)

**Files:**

- Modify: `apps/backoffice/src/VerifactuPage.tsx`, `DashboardPage.tsx`, `dashboard.css`

- [ ] **Step 1: VerifactuPage — cards de estado + conector**

En `apps/backoffice/src/VerifactuPage.tsx`, importar las stats demo y reescribir el render principal (la `section`) para calcar el mockup. Importar:

```typescript
import { DEMO_VERIFACTU_STATS } from './demo/demoData.js';
```

Reemplazar el contenido de `<section data-testid="verifactu-page">` por:

```tsx
<section className="catalog" data-testid="verifactu-page">
  <header className="catalog-head">
    <div>
      <h2>VeriFactu</h2>
      <p className="catalog-sub">Cumplimiento y cola de envíos a AEAT</p>
    </div>
  </header>

  <div className="vf-cards">
    <div className="vf-card" data-testid="vf-sent-card">
      <span className="vf-card-label">Registros enviados hoy</span>
      <span className="vf-card-value">{DEMO_VERIFACTU_STATS.sentToday}</span>
      <span className="vf-card-foot vf-up">▲ al día</span>
    </div>
    <div className="vf-card" data-testid="vf-queued-card">
      <span className="vf-card-label">En cola</span>
      <span className="vf-card-value">{DEMO_VERIFACTU_STATS.queued}</span>
      <span className="vf-card-foot">sin pendientes</span>
    </div>
    <div className="vf-card" data-testid="vf-failed-card">
      <span className="vf-card-label">Fallidos</span>
      <span className="vf-card-value">{DEMO_VERIFACTU_STATS.failed}</span>
      <span className="vf-card-foot">—</span>
    </div>
  </div>

  <div className="vf-connector" data-testid="vf-connector">
    <div>
      <p className="vf-connector-title">Estado del conector</p>
      <p className="vf-connector-sub">Proveedor homologado · sandbox AEAT</p>
    </div>
    <div className="vf-connector-status">
      <span className="vf-status-badge">
        <span className="stock-dot stock-green" /> Operativo
      </span>
      <span className="muted">Último envío hace {DEMO_VERIFACTU_STATS.lastSentSeconds} s</span>
    </div>
  </div>
</section>
```

(Se elimina la tabla de registros — el mockup no la muestra. Las funciones `listVerifactu`/`retryVerifactu` quedan disponibles pero la vista calcada no las usa; si quedan imports huérfanos, eliminarlos.)

- [ ] **Step 2: dashboard.css — cards y conector VeriFactu**

```css
.vf-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}
@media (max-width: 900px) {
  .vf-cards {
    grid-template-columns: 1fr;
  }
}
.vf-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}
.vf-card-label {
  font-size: 0.82rem;
  color: var(--ui-text-muted);
}
.vf-card-value {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.vf-card-foot {
  font-size: 0.8rem;
  color: var(--ui-text-soft);
}
.vf-card-foot.vf-up {
  color: var(--ui-success);
}
.vf-connector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.3rem;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}
.vf-connector-title {
  margin: 0;
  font-weight: 700;
  color: var(--ui-text);
}
.vf-connector-sub {
  margin: 0.1rem 0 0;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}
.vf-connector-status {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.vf-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--ui-success-soft);
  color: var(--ui-success);
  font-size: 0.82rem;
  font-weight: 600;
}
```

- [ ] **Step 3: DashboardPage — subtítulo, roturas como lista, top productos**

En `apps/backoffice/src/DashboardPage.tsx`:

1. Importar las roturas demo:

```typescript
import { DEMO_STOCKOUTS } from './demo/demoData.js';
```

2. Subtítulo en el header: bajo `<h2>Dashboard</h2>` añadir (envolviendo el h2 en un div):

```tsx
<div>
  <h2>Resumen de hoy</h2>
  <p className="catalog-sub">Última actualización hace 2 min</p>
</div>
```

3. Reemplazar el panel de roturas (el `data-testid="dash-stockout"`) por la lista calcada del mockup:

```tsx
<div className="dash-panel" data-testid="dash-stockout">
  <h3>Roturas de stock</h3>
  <p className="dash-panel-sub">Productos en alerta ahora</p>
  <ul className="dash-stockout-list">
    {DEMO_STOCKOUTS.map((s) => (
      <li key={`${s.name}-${s.store}`}>
        <span className={`stock-dot stock-${s.level}`} />
        <span className="dash-stockout-name">{s.name}</span>
        <span className="dash-stockout-store">
          {s.store} · {s.qty} ud
        </span>
      </li>
    ))}
  </ul>
  <div className="dash-stockout-foot">
    <span>Venta perdida est.</span>
    <strong className="dash-lost">{fmtEur(DEMO_STOCKOUT_KPIS.estimatedLostSales)}</strong>
  </div>
</div>
```

Para usar `DEMO_STOCKOUT_KPIS` importarlo también:

```typescript
import { DEMO_STOCKOUTS, DEMO_STOCKOUT_KPIS } from './demo/demoData.js';
```

(Mantener los paneles de barras, ventas por familia y rankings. El `stockout` query sigue existiendo pero el panel usa los datos demo de lista; si `stockout`/`Stat` quedan sin uso, eliminarlos para no romper el lint.)

- [ ] **Step 4: dashboard.css — lista de roturas**

```css
.dash-stockout-list {
  list-style: none;
  margin: 0.5rem 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.dash-stockout-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dash-stockout-name {
  font-weight: 600;
  color: var(--ui-text);
}
.dash-stockout-store {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}
.dash-stockout-foot {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-top: 1px solid var(--ui-border);
  margin-top: 0.7rem;
  padding-top: 0.6rem;
  font-size: 0.9rem;
  color: var(--ui-text-muted);
}
.dash-lost {
  color: var(--ui-danger);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @simpletpv/backoffice exec tsc --noEmit && pnpm exec eslint apps/backoffice/src/VerifactuPage.tsx apps/backoffice/src/DashboardPage.tsx`
Expected: PASS. Eliminar imports/variables huérfanos que marque el lint (p.ej. `listVerifactu` si ya no se usa).

- [ ] **Step 6: Commit**

```bash
git add apps/backoffice/src/VerifactuPage.tsx apps/backoffice/src/DashboardPage.tsx apps/backoffice/src/dashboard.css
git commit -m "feat(backoffice): VeriFactu con cards+conector y Dashboard con roturas calcado"
```

---

## Task 9: Reescribir los e2e del backoffice para modo demo

**Files:**

- Modify: `apps/backoffice/e2e/access.spec.ts`, `dashboard.spec.ts`
- Create: `apps/backoffice/e2e/pages.spec.ts`

- [ ] **Step 1: access.spec.ts**

```typescript
import { expect, test } from '@playwright/test';

// Modo demo: el backoffice no llama a la API. El login acepta cualquier
// credencial y entra como ADMIN (JWT demo).
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('login con cualquier credencial entra como ADMIN y ve el sidebar', async ({ page }) => {
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('nav-families')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('nav-users')).toBeVisible();
  await expect(page.getByTestId('access-denied')).toHaveCount(0);
  await expect(page.getByTestId('dashboard')).toBeVisible();
});
```

- [ ] **Step 2: dashboard.spec.ts (login demo, KPIs demo)**

```typescript
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 10000 });
});

test('muestra las 6 KPI cards y el selector de periodo', async ({ page }) => {
  await expect(page.getByTestId('dash-cards')).toBeVisible();
  for (const id of [
    'kpi-today',
    'kpi-avg-ticket',
    'kpi-upt',
    'kpi-margin',
    'kpi-discount',
    'kpi-return',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('kpi-today')).toContainText('1.284');
  await expect(page.getByTestId('dash-period-today')).toBeVisible();
});

test('los paneles de gráficas y roturas se renderizan', async ({ page }) => {
  await expect(page.getByTestId('dash-bars')).toBeVisible();
  await expect(page.getByTestId('dash-family')).toBeVisible();
  await expect(page.getByTestId('dash-stockout')).toBeVisible();
  await expect(page.getByTestId('dash-rankings')).toBeVisible();
});
```

> El selector EUR del KPI usa `fmtEur`; verificar el separador real que produce (es-ES → "1.284 €"). Si `fmtEur` formatea distinto, ajustar el `toContainText` al valor real observado en el primer run.

- [ ] **Step 3: pages.spec.ts — navegación por las 9 vistas demo**

```typescript
import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 10000 });
}

test('Catálogo muestra los 12 productos demo', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-catalog').click();
  await expect(page.getByTestId('catalog-count')).toContainText('12');
  await expect(page.getByTestId('catalog-table')).toBeVisible();
});

test('Tiendas muestra el grid de 6 ubicaciones', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stores').click();
  await expect(page.getByTestId('stores-grid')).toBeVisible();
  await expect(page.getByTestId('store-card')).toHaveCount(6);
});

test('Usuarios muestra 4 usuarios con badge de rol', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-users').click();
  await expect(page.getByTestId('users-count')).toContainText('4');
  await expect(page.getByTestId('user-role-badge').first()).toBeVisible();
});

test('Stock global muestra la tabla con badges por tienda', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stock').click();
  await expect(page.getByTestId('stock-table')).toBeVisible();
  await expect(page.getByTestId('stock-row')).toHaveCount(5);
});

test('Ventas muestra el historial con una venta anulada', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-sales').click();
  await expect(page.getByTestId('sales-table')).toBeVisible();
  await expect(page.getByTestId('sales-row')).toHaveCount(5);
  await expect(page.getByText('Anulada')).toBeVisible();
});

test('Compras muestra el estado vacío', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-purchases').click();
  await expect(page.getByTestId('orders-empty')).toBeVisible();
  await expect(page.getByText('Sin pedidos abiertos')).toBeVisible();
});

test('VeriFactu muestra las cards de estado y el conector', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-verifactu').click();
  await expect(page.getByTestId('vf-sent-card')).toContainText('128');
  await expect(page.getByTestId('vf-connector')).toContainText('Operativo');
});

test('Familias muestra las 5 familias con contador', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-families').click();
  await expect(page.getByTestId('fam-row')).toHaveCount(5);
  await expect(page.getByTestId('fam-count').first()).toContainText('productos');
});
```

> Antes de fijar los `toHaveCount`, confirmar que `nav-catalog`, `nav-stores`, etc. son los testids reales del Sidebar (el Sidebar emite `nav-${id}` y los ids del NAV son catalog/stores/users/stock/sales/purchases/verifactu/families). Verificado en App.tsx.

- [ ] **Step 4: Build + e2e**

Run:

```bash
pnpm --filter @simpletpv/backoffice build
cd apps/backoffice && pnpm exec playwright test
```

Expected: PASS todos los specs. Si falla un `toContainText` por formato (EUR, etc.), ajustar al valor real renderizado. Si `vite preview` espera la API, no pasa nada: en demo no se llama; los warnings de proxy `/api` son inocuos.

- [ ] **Step 5: Commit**

```bash
git add apps/backoffice/e2e/
git commit -m "test(backoffice): reescribir e2e para modo demo + cobertura de las 9 vistas"
```

---

## Task 10: Verificación visual y cierre

**Files:** ninguno (verificación)

- [ ] **Step 1: Gate del monorepo (typecheck)**

Run: `pnpm typecheck`
Expected: PASS en todos los workspaces.

- [ ] **Step 2: Lint de los directorios tocados**

Run: `pnpm exec eslint apps/backoffice/src apps/backoffice/e2e apps/tpv/src packages/ui/src`
Expected: PASS. (El `pnpm lint` raíz puede fallar por worktrees anidados preexistentes ajenos a este trabajo; lintar los directorios tocados evita ese ruido.)

- [ ] **Step 3: Capturar las 9 vistas y comparar con los mockups**

Crear un spec temporal `apps/backoffice/e2e/_shots.spec.ts` que haga login demo y navegue por las 9 vistas tomando `page.screenshot` de cada una a `/tmp/bo-shots/`. Levantar `vite preview --port 4174` (build ya hecho en Task 9), correr el spec con Playwright, y revisar cada PNG contra el mockup correspondiente. Anotar desviaciones y corregir en el CSS/JSX correspondiente. Eliminar el spec temporal al acabar.

- [ ] **Step 4: Commit final (si hubo ajustes visuales)**

```bash
git add -A
git commit -m "style(backoffice): ajustes finos para calcar los mockups"
```

---

## Self-Review

**Spec coverage:**

- Demo total (lib/\* + login ADMIN) → Task 1 + Task 2. ✔
- TopBar compartida + shell → Task 3. ✔
- Toggle navegable por env vars (BO y TPV) → Task 3 (helper + vite-env) + Task 4 (TPV). ✔
- Dashboard calcado (KPIs, barras, roturas, top productos) → Task 8 (roturas/lista) + datos en Task 1; KPIs y rankings ya renderizan con datos demo. ✔
- Catálogo (12 productos, STOCK) → Task 5. ✔
- Familias (contadores, bullets) → Task 5. ✔
- Stock (badges por tienda, alertas 2) → Task 7. ✔
- Usuarios (badge rol, tienda) → Task 5. ✔
- Tiendas (cards) → Task 6. ✔
- Ventas (columnas, anulada) → Task 7. ✔
- Compras (estado vacío) → Task 7. ✔
- VeriFactu (cards + conector) → Task 8. ✔
- E2E demo → Task 9. ✔
- Verificación visual → Task 10. ✔

**Placeholder scan:** sin TODO/TBD; cada paso trae código completo. Los pasos "verificar el tipo/nombre real" traen instrucción concreta de qué comprobar y cómo ajustar.

**Type consistency:** los datos demo usan los tipos reales (`Product.salePrice: string`, `StockGlobalRow.total: number`, `SalesPage.totals.totalAmount: string`, `User.role` literal). `DemoFamily`/`DemoUser`/`DemoSale` extienden los tipos base, así que son asignables a sus `Promise<Base[]>`; las páginas leen los campos extra (`productCount`, `storeName`, `lines`) con cast tolerante `(x as { campo?: T }).campo`. `switchApp(app)` tiene la misma firma en ambas apps. El JWT demo lleva `role: 'ADMIN'` (BO) frente a `'CLERK'` del TPV — correcto para pasar el guard del backoffice.
