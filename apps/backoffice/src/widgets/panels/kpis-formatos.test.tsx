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
  series: { avgTicket: [80, 83], upt: [3.8, 3.9], discountRate: [], returnRate: [] },
};
const MARGIN = {
  grossMargin: 38004,
  realMargin: 37991.62,
  marginPct: 0.598,
  revenue: 63526.52,
  series: [0.59, 0.6, 0.598],
  realMarginSeries: [9000, 12000, 11000, 15000, 13000, 18000, 19991.62],
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
import { WIDGET_PANELS } from './index.js';
import { AlertKpi, AreaKpi, DualKpi, SevenDayKpi } from './kpis-formatos.js';

const IDS = ['kpi-dual', 'kpi-area', 'kpi-alerta', 'kpi-7dias'];

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 07 (KPIs · más formatos)', () => {
  it('los 4 widgets están cableados en render, catálogo y galería bajo «kpis-formatos»', () => {
    const cat = GALLERY_ENTRIES.filter((e) => e.category === 'kpis-formatos').map((e) => e.id);
    for (const id of IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(cat, `galería falta ${id}`).toContain(id);
    }
  });

  it('KPI dual: dos métricas (Facturación y Beneficio)', async () => {
    renderWidget(<DualKpi period="month" store={undefined} />);

    expect(await screen.findByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText('Beneficio')).toBeInTheDocument();
    expect(screen.getByText('Dual')).toBeInTheDocument();
  });

  it('KPI con área: % Margen con etiqueta de esquina «Área»', async () => {
    renderWidget(<AreaKpi period="month" store={undefined} />);

    expect(await screen.findByText('% Margen')).toBeInTheDocument();
    expect(screen.getByText('Área')).toBeInTheDocument();
  });

  it('KPI de alerta: venta perdida con chip de roturas', async () => {
    renderWidget(<AlertKpi period="month" store={undefined} />);

    expect(await screen.findByText('9 roturas')).toBeInTheDocument();
    expect(screen.getByText('Venta perdida est.')).toBeInTheDocument();
    expect(screen.getByText('Alerta')).toBeInTheDocument();
  });

  it('KPI 7 días: beneficio con etiqueta de esquina «7 días»', async () => {
    renderWidget(<SevenDayKpi period="month" store={undefined} />);

    expect(await screen.findByText('7 días')).toBeInTheDocument();
    expect(screen.getByText('Beneficio')).toBeInTheDocument();
  });
});
