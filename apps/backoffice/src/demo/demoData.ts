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

// Ventas (€) por tienda y periodo — demo para ordenar el listado por rendimiento
// y mostrar la métrica principal en cada card (#103). Los valores de `today`
// coinciden con DEMO_SALES_TODAY.byStore. Clave: id de tienda.
export type StoreSalesPeriod = 'today' | 'week' | 'month';
export const DEMO_STORE_SALES: Record<string, Record<StoreSalesPeriod, number>> = {
  's-centro': { today: 310, week: 2010, month: 8450 },
  's-norte': { today: 240, week: 1680, month: 7120 },
  's-sur': { today: 220, week: 1490, month: 6240 },
  's-granvia': { today: 360, week: 2360, month: 9810 },
  's-online': { today: 154, week: 1120, month: 4980 },
  's-almacen': { today: 0, week: 0, month: 0 },
};

// ─── Familias y subfamilias (jerarquía de 2 niveles para el mockup) ──────
// `productCount` es un campo demo extra (FamilyNode no lo trae); FamiliesPage lo lee opcional.
// Las subfamilias solo existen dentro de su familia padre (parentId apunta a ella).
export interface DemoFamily extends FamilyNode {
  productCount: number;
  children: DemoFamily[];
}
function fam(
  id: string,
  name: string,
  color: string,
  sortOrder: number,
  productCount: number,
  children: DemoFamily[] = [],
): DemoFamily {
  return { id, parentId: null, name, color, icon: null, sortOrder, productCount, children };
}
function subfam(
  parentId: string,
  id: string,
  name: string,
  color: string,
  sortOrder: number,
  productCount: number,
): DemoFamily {
  return { id, parentId, name, color, icon: null, sortOrder, productCount, children: [] };
}
export const DEMO_FAMILIES: DemoFamily[] = [
  fam('fam-flores', 'Flores CBD', '#16734f', 1, 24, [
    subfam('fam-flores', 'fam-flores-indica', 'Índica', '#16734f', 1, 14),
    subfam('fam-flores', 'fam-flores-sativa', 'Sativa', '#16734f', 2, 10),
  ]),
  fam('fam-aceites', 'Aceites', '#b45309', 2, 12, [
    subfam('fam-aceites', 'fam-aceites-suave', 'Suaves (≤5%)', '#b45309', 1, 5),
    subfam('fam-aceites', 'fam-aceites-fuerte', 'Fuertes (≥10%)', '#b45309', 2, 7),
  ]),
  fam('fam-cosmetica', 'Cosmética', '#7c3aed', 3, 18, [
    subfam('fam-cosmetica', 'fam-cosmetica-facial', 'Facial', '#7c3aed', 1, 10),
    subfam('fam-cosmetica', 'fam-cosmetica-corporal', 'Corporal', '#7c3aed', 2, 8),
  ]),
  fam('fam-vapeo', 'Vapeo', '#2563eb', 4, 9),
  fam('fam-infusiones', 'Infusiones', '#0e7c6b', 5, 7),
];

// Localiza familia y (opcional) subfamilia por id; útil para mostrar la ruta jerárquica.
export function findFamily(id: string | null): {
  family: DemoFamily | null;
  sub: DemoFamily | null;
} {
  if (!id) return { family: null, sub: null };
  for (const root of DEMO_FAMILIES) {
    if (root.id === id) return { family: root, sub: null };
    const sub = root.children.find((c) => c.id === id);
    if (sub) return { family: root, sub };
  }
  return { family: null, sub: null };
}
// Etiqueta "Familia › Subfamilia" (o solo familia). "—" si no se encuentra.
export function familyPathLabel(id: string | null): string {
  const { family, sub } = findFamily(id);
  if (!family) return '—';
  return sub ? `${family.name} › ${sub.name}` : family.name;
}

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
  product('p-aceite-cbd-10', 'Aceite CBD 10%', 'ACE-010', '24.90', '21', 'fam-aceites-fuerte'),
  product('p-flor-lemon-haze', 'Flor Lemon Haze 2g', 'FLO-LH2', '14.50', '21', 'fam-flores-sativa'),
  product(
    'p-crema-regeneradora',
    'Crema regeneradora 50ml',
    'COS-R50',
    '19.90',
    '21',
    'fam-cosmetica-facial',
  ),
  product('p-vapeador-pro', 'Vapeador Pro', 'VAP-PRO', '39.00', '21', 'fam-vapeo'),
  product('p-resina-premium', 'Resina Premium 1g', 'FLO-RP1', '22.00', '21', 'fam-flores-indica'),
  product('p-infusion-relax', 'Infusión relax 20u', 'INF-R20', '8.90', '10', 'fam-infusiones'),
  product('p-aceite-cbd-5', 'Aceite CBD 5%', 'ACE-005', '16.90', '21', 'fam-aceites-suave'),
  product('p-flor-premium', 'Flor Premium 3,5g', 'FLO-PR3', '29.90', '21', 'fam-flores-indica'),
  product(
    'p-balsamo-muscular',
    'Bálsamo muscular',
    'COS-BAL',
    '12.50',
    '21',
    'fam-cosmetica-corporal',
  ),
  product('p-liquido-vape', 'Líquido vape 10ml', 'VAP-L10', '9.90', '21', 'fam-vapeo'),
  product('p-infusion-noche', 'Infusión noche 15u', 'INF-N15', '7.50', '10', 'fam-infusiones'),
  product('p-aceite-full', 'Aceite full spectrum', 'ACE-FUL', '34.00', '21', 'fam-aceites-fuerte'),
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

// ─── Usuarios (4, con tiendas asignadas para el mockup) ──────
// `storeIds` es un campo demo extra (User no lo trae); UsersPage lo lee opcional.
// Los ADMIN tienen acceso a todas las tiendas → storeIds vacío (regla por rol).
export interface DemoUser extends User {
  storeIds: string[];
}
export const DEMO_USERS: DemoUser[] = [
  {
    id: 'u-ana',
    name: 'Ana Caravaca',
    email: 'admin@org1.test',
    role: 'ADMIN',
    active: true,
    storeIds: [],
  },
  {
    id: 'u-luis',
    name: 'Luis Pérez',
    email: 'luis@org1.test',
    role: 'MANAGER',
    active: true,
    storeIds: ['s-centro'],
  },
  {
    id: 'u-marta',
    name: 'Marta Ruiz',
    email: 'marta@org1.test',
    role: 'CLERK',
    active: true,
    storeIds: ['s-norte'],
  },
  {
    id: 'u-jon',
    name: 'Jon Aguirre',
    email: 'jon@org1.test',
    role: 'CLERK',
    active: true,
    storeIds: ['s-sur'],
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

// ─── Ventas: dataset enriquecido para el historial con scroll infinito y filtros (#95) ───
// Cada venta lleva vendedor y familia (raíz) dominante para poder filtrar por ambos.
export interface DemoSaleRow extends SaleSummary {
  storeName: string;
  sellerId: string;
  sellerName: string;
  familyId: string;
  familyName: string;
  lines: number;
}
export const SALE_SELLERS = [
  { id: 'u-ana', name: 'Ana Caravaca' },
  { id: 'u-luis', name: 'Luis Pérez' },
  { id: 'u-marta', name: 'Marta Ruiz' },
  { id: 'u-jon', name: 'Jon Aguirre' },
];
const SALE_STORES = DEMO_STORES.filter((s) => s.id !== 's-almacen'); // 5 tiendas con venta
const SALE_BASE_MS = Date.parse('2026-06-02T13:00:00.000Z');
export const DEMO_SALES: DemoSaleRow[] = Array.from({ length: 60 }, (_, i) => {
  const store = SALE_STORES[i % SALE_STORES.length]!;
  const seller = SALE_SELLERS[i % SALE_SELLERS.length]!;
  const family = DEMO_FAMILIES[(i * 3) % DEMO_FAMILIES.length]!;
  const ticket = 1042 - i;
  return {
    id: `v-${ticket}`,
    ticketNumber: `#A-${ticket}`,
    createdAt: new Date(SALE_BASE_MS - i * 11 * 60000).toISOString(),
    total: (8 + ((i * 7) % 80) + (i % 4) * 0.25).toFixed(2),
    paymentMethod: i % 3 === 0 ? 'CARD' : 'CASH',
    status: i % 17 === 0 ? 'VOIDED' : 'COMPLETED',
    storeId: store.id,
    storeName: store.name,
    sellerId: seller.id,
    sellerName: seller.name,
    familyId: family.id,
    familyName: family.name,
    lines: 1 + (i % 5),
  };
});

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
