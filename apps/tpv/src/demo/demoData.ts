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
// El chip "Todas" muestra 112; cada (sub)familia su contador fijo. Algunas
// familias tienen subfamilias para demostrar la navegación Familia→Subfamilia.
// El contador de una familia con subfamilias es la suma de las suyas.
export const DEMO_FAMILY_COUNTS: Record<string, number> = {
  'fam-flores': 51,
  'fam-flores-flor': 36,
  'fam-flores-resina': 15,
  'fam-aceites': 17,
  'fam-aceites-cbd10': 7,
  'fam-aceites-cbd5': 6,
  'fam-aceites-full': 4,
  'fam-cosmetica': 23,
  'fam-vapeo': 12,
  'fam-vapeo-disp': 5,
  'fam-vapeo-liq': 7,
  'fam-infusiones': 9,
};
export const DEMO_TOTAL_COUNT = 112;

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

// ─── Productos (36, catálogo demo de tienda CBD) ─────────────
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

  // ── Catálogo ampliado (24 productos más, repartidos por familia) ──
  // Flores · flor
  product('p-flor-og-kush', 'Flor OG Kush 2g', '15.50', 'fam-flores-flor', '8400000000048'),
  product('p-flor-amnesia', 'Flor Amnesia 2g', '14.90', 'fam-flores-flor'),
  product('p-flor-white-widow', 'Flor White Widow 2g', '15.90', 'fam-flores-flor'),
  product('p-flor-gorilla-glue', 'Flor Gorilla Glue 3,5g', '27.50', 'fam-flores-flor'),
  product('p-flor-strawberry', 'Flor Strawberry 2g', '16.50', 'fam-flores-flor'),
  product('p-flor-critical', 'Flor Critical 5g', '34.90', 'fam-flores-flor'),
  // Flores · resina
  product('p-resina-charas', 'Resina Charas 1g', '24.00', 'fam-flores-resina'),
  product('p-resina-marruecos', 'Resina Marruecos 2g', '19.50', 'fam-flores-resina'),
  product('p-resina-afgana', 'Resina Afgana 1g', '26.00', 'fam-flores-resina', '8400000000055'),
  // Aceites · CBD 10%
  product('p-aceite-cbd-10-30ml', 'Aceite CBD 10% 30ml', '39.90', 'fam-aceites-cbd10'),
  product(
    'p-aceite-cbd-10-menta',
    'Aceite CBD 10% menta',
    '26.90',
    'fam-aceites-cbd10',
    '8400000000062',
  ),
  // Aceites · CBD 5%
  product('p-aceite-cbd-5-30ml', 'Aceite CBD 5% 30ml', '27.90', 'fam-aceites-cbd5'),
  product('p-aceite-cbd-5-naranja', 'Aceite CBD 5% naranja', '18.50', 'fam-aceites-cbd5'),
  // Aceites · full spectrum
  product('p-aceite-full-20', 'Aceite full spectrum 20%', '49.00', 'fam-aceites-full'),
  // Cosmética
  product('p-serum-facial', 'Sérum facial CBD 30ml', '28.90', 'fam-cosmetica', '8400000000079'),
  product('p-aceite-masaje', 'Aceite de masaje CBD 100ml', '21.50', 'fam-cosmetica'),
  product('p-jabon-cbd', 'Jabón artesano CBD', '7.90', 'fam-cosmetica'),
  product('p-roll-on', 'Roll-on muscular CBD', '14.90', 'fam-cosmetica'),
  product('p-mascarilla', 'Mascarilla facial CBD', '9.50', 'fam-cosmetica'),
  // Vapeo · dispositivos
  product('p-vapeador-mini', 'Vapeador Mini', '24.90', 'fam-vapeo-disp', '8400000000086'),
  // Vapeo · líquidos
  product('p-liquido-menta', 'Líquido vape menta 10ml', '10.50', 'fam-vapeo-liq'),
  product('p-liquido-frutos', 'Líquido vape frutos rojos 10ml', '10.50', 'fam-vapeo-liq'),
  // Infusiones
  product('p-infusion-digestiva', 'Infusión digestiva 20u', '8.50', 'fam-infusiones'),
  product('p-infusion-energia', 'Infusión energía 15u', '7.90', 'fam-infusiones'),
];

// ─── Stock por producto (cantidad + nivel del badge) ─────────
// Vapeador Pro: cantidad 0 → la tarjeta muestra "0", se atenúa y se ordena al final.
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
  // Stock del catálogo ampliado (varía nivel para realismo).
  { productId: 'p-flor-og-kush', quantity: 14, level: 'green' },
  { productId: 'p-flor-amnesia', quantity: 7, level: 'green' },
  { productId: 'p-flor-white-widow', quantity: 3, level: 'yellow' },
  { productId: 'p-flor-gorilla-glue', quantity: 0, level: 'red' },
  { productId: 'p-flor-strawberry', quantity: 9, level: 'green' },
  { productId: 'p-flor-critical', quantity: 5, level: 'yellow' },
  { productId: 'p-resina-charas', quantity: 11, level: 'green' },
  { productId: 'p-resina-marruecos', quantity: 2, level: 'yellow' },
  { productId: 'p-resina-afgana', quantity: 8, level: 'green' },
  { productId: 'p-aceite-cbd-10-30ml', quantity: 6, level: 'yellow' },
  { productId: 'p-aceite-cbd-10-menta', quantity: 20, level: 'green' },
  { productId: 'p-aceite-cbd-5-30ml', quantity: 13, level: 'green' },
  { productId: 'p-aceite-cbd-5-naranja', quantity: 4, level: 'yellow' },
  { productId: 'p-aceite-full-20', quantity: 0, level: 'red' },
  { productId: 'p-serum-facial', quantity: 10, level: 'green' },
  { productId: 'p-aceite-masaje', quantity: 15, level: 'green' },
  { productId: 'p-jabon-cbd', quantity: 22, level: 'green' },
  { productId: 'p-roll-on', quantity: 3, level: 'yellow' },
  { productId: 'p-mascarilla', quantity: 18, level: 'green' },
  { productId: 'p-vapeador-mini', quantity: 7, level: 'green' },
  { productId: 'p-liquido-menta', quantity: 12, level: 'green' },
  { productId: 'p-liquido-frutos', quantity: 1, level: 'yellow' },
  { productId: 'p-infusion-digestiva', quantity: 9, level: 'green' },
  { productId: 'p-infusion-energia', quantity: 5, level: 'yellow' },
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
