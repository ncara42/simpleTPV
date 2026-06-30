import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const COMPARE = [
  {
    productId: 'p1',
    productName: 'Aceite CBD 20%',
    sku: null,
    prices: [
      { supplierId: 'beemine', supplierName: 'Beemine', price: 8.4 },
      { supplierId: 'otros', supplierName: 'Otros', price: 9.1 },
    ],
    best: { supplierId: 'beemine', supplierName: 'Beemine', price: 8.4 },
  },
];
const STORES = [
  {
    id: 's1',
    name: 'Sur',
    address: 'Gran Vía, Madrid',
    code: 'SUR',
    active: true,
    opsVerified: true,
    opsIncident: null,
    opsUpdatedAt: null,
    isCentral: false,
  },
  {
    id: 's2',
    name: 'Online',
    address: null,
    code: 'ON',
    active: true,
    opsVerified: false,
    opsIncident: 'TPV caído',
    opsUpdatedAt: null,
    isCentral: true,
  },
];
const SALES_TODAY = {
  today: { total: 1000, count: 16 },
  yesterday: { total: 900, count: 14 },
  deltaPct: 11,
  byStore: [
    { storeId: 's1', storeName: 'Sur', today: 600, yesterday: 500, deltaPct: 20 },
    { storeId: 's2', storeName: 'Online', today: 400, yesterday: 400, deltaPct: 0 },
  ],
};
const HOURS = [
  { hour: 9, count: 5, revenue: 300 },
  { hour: 14, count: 8, revenue: 500 },
  { hour: 18, count: 3, revenue: 200 },
];
const SALES_KPIS = {
  salesCount: 762,
  revenue: 63527,
  avgTicket: 83.37,
  upt: 0,
  discountRate: 0,
  returnRate: 0,
};
const MARGIN_KPIS = { grossMargin: 0, realMargin: 37991.62, marginPct: 0.598, revenue: 63527 };
const STOCKOUT_KPIS = {
  events: 0,
  resolved: 0,
  open: 9,
  avgDurationHours: null,
  rate: 0,
  estimatedLostSales: 207,
};
// Mes anterior: ritmo más alto → la variación sale negativa (≈ −45,9%).
const PREV_KPIS = { ...SALES_KPIS, revenue: 117500, salesCount: 0, avgTicket: 0 };

vi.mock('../../lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve(STORES)) }));
vi.mock('../../lib/supplier-prices.js', () => ({
  compareSupplierPrices: vi.fn(() => Promise.resolve(COMPARE)),
}));
vi.mock('../../lib/dashboard.js', () => ({
  getSalesToday: vi.fn(() => Promise.resolve(SALES_TODAY)),
  getSalesByHourOnDay: vi.fn(() => Promise.resolve(HOURS)),
  getSalesKpis: vi.fn(() => Promise.resolve(SALES_KPIS)),
  getMarginKpis: vi.fn(() => Promise.resolve(MARGIN_KPIS)),
  getStockoutKpis: vi.fn(() => Promise.resolve(STOCKOUT_KPIS)),
  getSalesKpisRange: vi.fn(() => Promise.resolve(PREV_KPIS)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import {
  ExecutiveSummary,
  StoreBandMatrix,
  StoreDirectory,
  SupplierComparison,
} from './especializados.js';
import { WIDGET_PANELS } from './index.js';

const ESP_IDS = ['esp-proveedores', 'esp-matriz', 'esp-tiendas', 'esp-resumen-ejecutivo'];

function renderWidget(node: ReactNode): { container: HTMLElement } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 11 (Especializados)', () => {
  it('los 4 widgets construidos están cableados en render, catálogo y galería bajo «especializados»', () => {
    const cat = GALLERY_ENTRIES.filter((e) => e.category === 'especializados').map((e) => e.id);
    for (const id of ESP_IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(cat, `galería falta ${id}`).toContain(id);
    }
  });

  it('esp-embudo y esp-calendario quedan diferidos (no cableados)', () => {
    expect(WIDGET_PANELS['esp-embudo']).toBeUndefined();
    expect(WIDGET_PANELS['esp-calendario']).toBeUndefined();
  });

  it('proveedores: producto + badge del mejor proveedor con su precio', async () => {
    renderWidget(<SupplierComparison period="month" store={undefined} />);
    expect(await screen.findByText('Aceite CBD 20%')).toBeInTheDocument();
    expect(screen.getByText('Beemine 8,40 €')).toBeInTheDocument();
    expect(screen.getByText('Otros 9,10 €')).toBeInTheDocument();
  });

  it('matriz: cabeceras POR HORAS (rango activo) + una fila por tienda', async () => {
    renderWidget(<StoreBandMatrix period="today" store={undefined} />);
    expect(await screen.findByText('Sur')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    // HOURS mockea ventas a las 9, 14 y 18 → el rango activo es 9–18 (cabeceras por hora, sin bandas).
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.queryByText('Mañana')).not.toBeInTheDocument();
  });

  it('tiendas: dirección + estado operativo (Operativa / Incidencia)', async () => {
    const { container } = renderWidget(<StoreDirectory period="today" store={undefined} />);
    expect(await screen.findByText('Gran Vía, Madrid')).toBeInTheDocument();
    expect(screen.getByText('Operativa')).toBeInTheDocument();
    expect(screen.getByText('Incidencia')).toBeInTheDocument();
    // s1 operativa (pin azul), s2 con incidencia (pin gris).
    expect(container.querySelectorAll('.sp-store-pin--on')).toHaveLength(1);
    expect(container.querySelectorAll('.sp-store-pin--off')).toHaveLength(1);
  });

  it('resumen ejecutivo: cifras clave del mes + variación frente al mes anterior', async () => {
    renderWidget(<ExecutiveSummary period="month" store={undefined} />);
    expect(await screen.findByText('63.527 €')).toBeInTheDocument(); // facturación del mes
    expect(screen.getByText('762')).toBeInTheDocument(); // tickets
    expect(screen.getByText('83,37 €')).toBeInTheDocument(); // ticket medio
    expect(screen.getByText('37.992 €')).toBeInTheDocument(); // beneficio
    expect(screen.getByText('207 €')).toBeInTheDocument(); // venta perdida
    expect(screen.getByText(/45,9%/)).toBeInTheDocument(); // ritmo diario MoM
    expect(screen.getByText(/9 roturas/)).toBeInTheDocument();
  });
});
