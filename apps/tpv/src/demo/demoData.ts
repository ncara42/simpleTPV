import type {
  CashSession,
  FamilyNode,
  Product,
  StockRow,
  Store,
  StoreOrder,
  Transfer,
} from '@simpletpv/auth';

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

// ─── Familias y subfamilias (con sus contadores en los chips) ─
// El chip "Todas" muestra 88; cada (sub)familia su contador fijo. Algunas
// familias tienen subfamilias para demostrar la navegación Familia→Subfamilia.
export const DEMO_FAMILY_COUNTS: Record<string, number> = {
  'fam-flores': 42,
  'fam-flores-flor': 30,
  'fam-flores-resina': 12,
  'fam-aceites': 12,
  'fam-aceites-cbd10': 5,
  'fam-aceites-cbd5': 4,
  'fam-aceites-full': 3,
  'fam-cosmetica': 18,
  'fam-vapeo': 9,
  'fam-vapeo-disp': 4,
  'fam-vapeo-liq': 5,
  'fam-infusiones': 7,
};
export const DEMO_TOTAL_COUNT = 88;

function fam(
  id: string,
  name: string,
  color: string,
  sortOrder: number,
  children: FamilyNode[] = [],
): FamilyNode {
  return { id, parentId: null, name, color, icon: null, sortOrder, children };
}
function subfam(
  parentId: string,
  id: string,
  name: string,
  color: string,
  sortOrder: number,
): FamilyNode {
  return { id, parentId, name, color, icon: null, sortOrder, children: [] };
}

export const DEMO_FAMILIES: FamilyNode[] = [
  fam('fam-flores', 'Flores CBD', '#16734f', 1, [
    subfam('fam-flores', 'fam-flores-flor', 'Flores', '#16734f', 1),
    subfam('fam-flores', 'fam-flores-resina', 'Resina', '#13624a', 2),
  ]),
  fam('fam-aceites', 'Aceites', '#b45309', 2, [
    subfam('fam-aceites', 'fam-aceites-cbd10', 'CBD 10%', '#b45309', 1),
    subfam('fam-aceites', 'fam-aceites-cbd5', 'CBD 5%', '#c2660f', 2),
    subfam('fam-aceites', 'fam-aceites-full', 'Full spectrum', '#92400e', 3),
  ]),
  fam('fam-cosmetica', 'Cosmética', '#7c3aed', 3),
  fam('fam-vapeo', 'Vapeo', '#2563eb', 4, [
    subfam('fam-vapeo', 'fam-vapeo-disp', 'Dispositivos', '#2563eb', 1),
    subfam('fam-vapeo', 'fam-vapeo-liq', 'Líquidos', '#1d4ed8', 2),
  ]),
  fam('fam-infusiones', 'Infusiones', '#0e7c6b', 5),
];

// ─── Productos (12, calcados al mockup de Venta) ─────────────
function product(
  id: string,
  name: string,
  salePrice: string,
  familyId: string,
  barcode: string | null = null,
): Product {
  return {
    id,
    name,
    sku: id.toUpperCase(),
    barcode,
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
  // Algunos productos llevan código de barras EAN-13 para poder demostrar el
  // escaneo (la pistola teclea el código en el buscador y Enter lo resuelve).
  product('p-aceite-cbd-10', 'Aceite CBD 10%', '24.90', 'fam-aceites-cbd10', '8400000000017'),
  product('p-flor-lemon-haze', 'Flor Lemon Haze 2g', '14.50', 'fam-flores-flor', '8400000000024'),
  product('p-crema-regeneradora', 'Crema regeneradora 50ml', '19.90', 'fam-cosmetica'),
  product('p-vapeador-pro', 'Vapeador Pro', '39.00', 'fam-vapeo-disp', '8400000000031'),
  product('p-resina-premium', 'Resina Premium 1g', '22.00', 'fam-flores-resina'),
  product('p-infusion-relax', 'Infusión relax 20u', '8.90', 'fam-infusiones'),
  product('p-aceite-cbd-5', 'Aceite CBD 5%', '16.90', 'fam-aceites-cbd5'),
  product('p-flor-premium', 'Flor Premium 3,5g', '29.90', 'fam-flores-flor'),
  product('p-balsamo-muscular', 'Bálsamo muscular', '12.50', 'fam-cosmetica'),
  product('p-liquido-vape', 'Líquido vape 10ml', '9.90', 'fam-vapeo-liq'),
  product('p-infusion-noche', 'Infusión noche 15u', '7.50', 'fam-infusiones'),
  product('p-aceite-full', 'Aceite full spectrum', '34.00', 'fam-aceites-full'),
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

// ─── Pedidos internos (tabla de recepción) ───────────────────
function storeOrderLines(n: number): StoreOrder['lines'] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tl-${i}`,
    storeOrderId: 't',
    productId: DEMO_PRODUCTS[i % DEMO_PRODUCTS.length]!.id,
    productName: DEMO_PRODUCTS[i % DEMO_PRODUCTS.length]!.name,
    barcode: DEMO_PRODUCTS[i % DEMO_PRODUCTS.length]!.barcode,
    quantitySent: '1',
    quantityReceived: null,
    discrepancy: null,
    discrepancyNote: null,
  }));
}

export const DEMO_STORE_ORDERS: StoreOrder[] = [
  {
    id: 'demo-store-order-pending',
    originStoreId: 'central',
    destStoreId: DEMO_STORE_ID,
    status: 'SENT',
    notes: null,
    createdBy: 'central',
    createdAt: '2026-05-31T08:30:00.000Z',
    sentAt: '2026-05-31T08:30:00.000Z',
    receivedAt: null,
    closedAt: null,
    lines: storeOrderLines(7),
  },
  {
    id: 'demo-store-order-received',
    originStoreId: 'central',
    destStoreId: DEMO_STORE_ID,
    status: 'RECEIVED',
    notes: null,
    createdBy: 'central',
    createdAt: '2026-05-29T16:10:00.000Z',
    sentAt: '2026-05-29T16:10:00.000Z',
    receivedAt: '2026-05-29T16:40:00.000Z',
    closedAt: null,
    lines: storeOrderLines(4),
  },
];

export const DEMO_TRANSFERS: Transfer[] = DEMO_STORE_ORDERS.map((order) => ({
  ...order,
  lines: order.lines.map(({ storeOrderId, ...line }) => ({ ...line, transferId: storeOrderId })),
}));
