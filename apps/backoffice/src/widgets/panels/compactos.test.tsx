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
  series: { avgTicket: [80, 82, 83, 83.37], upt: [3.8, 3.9], discountRate: [], returnRate: [] },
};
const MARGIN = {
  grossMargin: 38004,
  realMargin: 37991.62,
  marginPct: 0.598,
  revenue: 63526.52,
  series: [0.59, 0.6, 0.598],
  realMarginSeries: [12000, 24000, 37991.62],
};
const FAMILY = [
  { familyId: 'f1', familyName: 'Bebidas', color: null, total: 4200 },
  { familyId: 'f2', familyName: 'Snacks', color: null, total: 2600 },
  { familyId: 'f3', familyName: 'Limpieza', color: null, total: 1500 },
  { familyId: null, familyName: 'Otras', color: null, total: 700 },
];
const EMPLOYEES = [
  { userId: 'u1', userName: 'Ana', salesCount: 120, total: 9800 },
  { userId: 'u2', userName: 'Luis', salesCount: 90, total: 7100 },
];

vi.mock('../../lib/dashboard.js', () => ({
  getSalesKpis: vi.fn(() => Promise.resolve(SALES)),
  getMarginKpis: vi.fn(() => Promise.resolve(MARGIN)),
  getSalesByFamily: vi.fn(() => Promise.resolve(FAMILY)),
  getSalesByEmployee: vi.fn(() => Promise.resolve(EMPLOYEES)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import {
  CompactDonut,
  CompactHero,
  CompactLeaderboard,
  CompactRibbon,
  CompactTreemap,
} from './compactos.js';
import { WIDGET_PANELS } from './index.js';

const IDS = ['cmp-ribbon', 'cmp-donut', 'cmp-treemap', 'cmp-leaderboard', 'cmp-hero'];

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 05 (Compactos)', () => {
  it('los 5 widgets están cableados en render, catálogo y galería bajo «compactos»', () => {
    const compactos = GALLERY_ENTRIES.filter((e) => e.category === 'compactos').map((e) => e.id);
    for (const id of IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(compactos, `galería falta ${id}`).toContain(id);
    }
  });

  it('banda compacta: facturación, tickets y ticket medio', async () => {
    renderWidget(<CompactRibbon period="month" store={undefined} />);

    expect(await screen.findByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.getByText('Ticket medio')).toBeInTheDocument();
  });

  it('donut por familia: leyenda con las primeras familias', async () => {
    renderWidget(<CompactDonut period="month" store={undefined} />);

    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
  });

  it('treemap compacto: mapa de área con las familias', async () => {
    renderWidget(<CompactTreemap period="month" store={undefined} />);

    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Reparto de la facturación por familia' }),
    ).toBeInTheDocument();
  });

  it('top vendedores: nombre y pista de tickets por puesto', async () => {
    renderWidget(<CompactLeaderboard period="month" store={undefined} />);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('120 tickets')).toBeInTheDocument();
  });

  it('cifra-héroe: facturación destacada con chip de tickets', async () => {
    renderWidget(<CompactHero period="month" store={undefined} />);

    expect(await screen.findByText('762 tickets')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
  });
});
