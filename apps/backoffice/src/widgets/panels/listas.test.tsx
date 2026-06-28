import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const FAMILY = [
  { familyId: 'f1', familyName: 'Bebidas', color: null, total: 4200 },
  { familyId: 'f2', familyName: 'Snacks', color: null, total: 2600 },
  { familyId: 'f3', familyName: 'Limpieza', color: null, total: 1500 },
  { familyId: null, familyName: 'Otras', color: null, total: 700 },
];
const RANKINGS = {
  topSales: [
    { productId: 'p1', name: 'Agua 1,5L', total: 1800, units: 900 },
    { productId: 'p2', name: 'Café molido', total: 1200, units: 300 },
    { productId: 'p3', name: 'Galletas', total: 800, units: 200 },
  ],
  topMargin: [],
  worstRotation: [],
};

vi.mock('../../lib/dashboard.js', () => ({
  getSalesByFamily: vi.fn(() => Promise.resolve(FAMILY)),
  getProductRankings: vi.fn(() => Promise.resolve(RANKINGS)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { WIDGET_PANELS } from './index.js';
import { FamilyShare, FamilyTreemap, ProductRanking } from './listas.js';

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 03 (Listas)', () => {
  it('los 3 widgets están cableados en render, catálogo y galería bajo «listas»', () => {
    const listas = GALLERY_ENTRIES.filter((e) => e.category === 'listas').map((e) => e.id);
    for (const id of ['lista-familia', 'lista-rankings', 'lista-mix']) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(listas, `galería falta ${id}`).toContain(id);
    }
  });

  it('reparto por familia: riel + leyenda con las familias', async () => {
    renderWidget(<FamilyShare period="month" store={undefined} />);

    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('Snacks')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Reparto' })).toBeInTheDocument();
  });

  it('ranking de productos: nombre y pista de unidades por puesto', async () => {
    renderWidget(<ProductRanking period="month" store={undefined} />);

    expect(await screen.findByText('Agua 1,5L')).toBeInTheDocument();
    expect(screen.getByText('Café molido')).toBeInTheDocument();
    expect(screen.getByText('900 uds')).toBeInTheDocument();
  });

  it('mix por familia: mapa de área con las familias', async () => {
    renderWidget(<FamilyTreemap period="month" store={undefined} />);

    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('Otras')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Reparto por área' })).toBeInTheDocument();
  });
});
