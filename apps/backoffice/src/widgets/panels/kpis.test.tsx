import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const SALES = {
  salesCount: 762,
  revenue: 63526.52,
  avgTicket: 83.37,
  upt: 3.89,
  discountRate: 0.0002,
  returnRate: 0.0007,
  series: {
    avgTicket: [80, 82, 83, 83.37],
    upt: [3.8, 3.85, 3.9, 3.89],
    discountRate: [0.0003, 0.0002],
    returnRate: [0.0007, 0.0007],
  },
};
const MARGIN = {
  grossMargin: 38004,
  realMargin: 37991.62,
  marginPct: 0.598,
  revenue: 63526.52,
  series: [0.59, 0.6, 0.598],
  realMarginSeries: [12000, 24000, 37991.62],
};
const STOCK = {
  events: 9,
  resolved: 0,
  open: 9,
  avgDurationHours: null,
  rate: 0.01,
  estimatedLostSales: 207.3,
};

vi.mock('../../lib/dashboard.js', () => ({
  getSalesKpis: vi.fn(() => Promise.resolve(SALES)),
  getMarginKpis: vi.fn(() => Promise.resolve(MARGIN)),
  getStockoutKpis: vi.fn(() => Promise.resolve(STOCK)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { PANEL_RENDER_IDS } from './index.js';
import { ClassicKpiCard, ConnectedKpiGrid } from './kpis.js';

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 01 (KPIs)', () => {
  it('cada widget con render existe en el catálogo (ITEM_SPECS + WIDGET_LABELS)', () => {
    for (const id of PANEL_RENDER_IDS) {
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
    }
  });

  it('los 2 widgets de KPIs están en la galería bajo «kpis»', () => {
    const kpis = GALLERY_ENTRIES.filter((e) => e.category === 'kpis').map((e) => e.id);
    expect(kpis).toEqual(expect.arrayContaining(['kpi-grid-connected', 'kpi-classic']));
  });

  it('la rejilla conectada pinta las 6 métricas con sus datos', async () => {
    renderWidget(<ConnectedKpiGrid period="month" store={undefined} />);

    expect(await screen.findByText('762 tickets')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText('Ticket medio')).toBeInTheDocument();
    expect(screen.getByText('Uds. / ticket')).toBeInTheDocument();
    expect(screen.getByText('% Margen')).toBeInTheDocument();
    expect(screen.getByText('Beneficio')).toBeInTheDocument();
    expect(screen.getByText('Venta perdida est.')).toBeInTheDocument();
    expect(screen.getByText('9 roturas')).toBeInTheDocument();
  });

  it('la tarjeta clásica pinta Facturación con su cifra', async () => {
    renderWidget(<ClassicKpiCard period="month" store={undefined} />);

    expect(await screen.findByText('762 tickets')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
  });
});
