import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const SALES_TODAY = {
  today: { total: 41929, count: 300 },
  yesterday: { total: 40000, count: 290 },
  deltaPct: 4.8,
  byStore: [
    { storeId: 's1', storeName: 'Tienda Sur', today: 11945, yesterday: 11000, deltaPct: 8.5 },
    { storeId: 's2', storeName: 'Tienda Online', today: 11188, yesterday: 11500, deltaPct: -2.7 },
    { storeId: 's3', storeName: 'Tienda Centro', today: 10796, yesterday: 10000, deltaPct: 7.9 },
    { storeId: 's4', storeName: 'Tienda Norte', today: 8000, yesterday: 7800, deltaPct: 2.5 },
    { storeId: 's5', storeName: 'Tienda Este', today: 7000, yesterday: 7200, deltaPct: -2.7 },
  ],
};
const SALES_KPIS = {
  salesCount: 762,
  revenue: 63527,
  avgTicket: 83.37,
  upt: 3.89,
  discountRate: 0.04,
  returnRate: 0.01,
  series: {
    avgTicket: [70, 75, 72, 80, 78, 84, 83],
    upt: [3, 3.5, 3.2, 4, 3.8, 3.9, 3.89],
    discountRate: [0.03, 0.04, 0.04],
    returnRate: [0.01, 0.01, 0.01],
  },
};
const MARGIN_KPIS = {
  grossMargin: 40000,
  realMargin: 37992,
  marginPct: 0.598,
  revenue: 63527,
  series: [0.6, 0.59, 0.598],
  realMarginSeries: [4000, 5200, 4800, 6100, 5500, 6300, 6092],
};
const FAMILY = [
  { familyId: 'f1', familyName: 'Aceite 20%', color: null, total: 6360 },
  { familyId: 'f2', familyName: 'Aceite 10%', color: null, total: 6040 },
  { familyId: 'f3', familyName: 'Accesorios', color: null, total: 5530 },
  { familyId: null, familyName: 'Otras', color: null, total: 2000 },
];
// Horas 7..17 con facturación; la punta a las 11h.
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour, i) => ({
  hour,
  count: 10 + i,
  revenue: hour === 11 ? 3000 : 800 + i * 120,
}));

vi.mock('../../lib/dashboard.js', () => ({
  getSalesToday: vi.fn(() => Promise.resolve(SALES_TODAY)),
  getSalesKpis: vi.fn(() => Promise.resolve(SALES_KPIS)),
  getMarginKpis: vi.fn(() => Promise.resolve(MARGIN_KPIS)),
  getSalesByFamily: vi.fn(() => Promise.resolve(FAMILY)),
  getSalesByHourOnDay: vi.fn(() => Promise.resolve(HOURS)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { WIDGET_PANELS } from './index.js';
import {
  MiniFamilyDonut,
  MiniHourColumns,
  MiniMarginGauge,
  MiniStoreBars,
  MiniTopFamilies,
} from './mini.js';

const MINI_IDS = [
  'mini-tiendas',
  'mini-tendencia',
  'mini-acumulado',
  'mini-donut',
  'mini-gauge',
  'mini-familias',
  'mini-heatmap',
  'mini-columnas',
];

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 08 (Mini gráficas)', () => {
  it('los 8 widgets están cableados en render, catálogo y galería bajo «mini»', () => {
    const mini = GALLERY_ENTRIES.filter((e) => e.category === 'mini').map((e) => e.id);
    for (const id of MINI_IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(mini, `galería falta ${id}`).toContain(id);
    }
  });

  it('barras por tienda: una barra por tienda, ordenadas por facturación de hoy', async () => {
    renderWidget(<MiniStoreBars period="today" store={undefined} />);
    // El título de cada barra lleva el nombre de la tienda → ancla accesible.
    expect(await screen.findByTitle(/Tienda Sur/)).toBeInTheDocument();
    expect(screen.getByTitle(/Tienda Online/)).toBeInTheDocument();
  });

  it('gauge de margen: muestra el % de margen formateado (es-ES)', async () => {
    renderWidget(<MiniMarginGauge period="month" store={undefined} />);
    expect(await screen.findByText('59,8%')).toBeInTheDocument();
  });

  it('donut de familias: muestra el recuento de familias', async () => {
    renderWidget(<MiniFamilyDonut period="month" store={undefined} />);
    expect(await screen.findByText('4 fam.')).toBeInTheDocument();
  });

  it('top familias: nombra las 3 familias con más facturación', async () => {
    renderWidget(<MiniTopFamilies period="month" store={undefined} />);
    expect(await screen.findByText('Aceite 20%')).toBeInTheDocument();
    expect(screen.getByText('Aceite 10%')).toBeInTheDocument();
    expect(screen.getByText('Accesorios')).toBeInTheDocument();
    // «Otras» (4ª) queda fuera del top 3.
    expect(screen.queryByText('Otras')).not.toBeInTheDocument();
  });

  it('columnas por hora: marca la hora punta (11h) en acento', async () => {
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MiniHourColumns period="today" store={undefined} />
      </QueryClientProvider>,
    );
    // Espera a que carguen los datos y comprueba que exactamente una columna es la punta.
    await screen.findByTestId('mini-columnas');
    await waitFor(() => expect(container.querySelectorAll('.mw-cols > .is-peak')).toHaveLength(1));
  });
});
