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
import { FamilyShare, ProductRanking, SalesMix } from './listas.js';

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

  it('ventas por familia: fila por familia con cifra y cuota', async () => {
    renderWidget(<FamilyShare period="month" store={undefined} />);

    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('Ventas por familia')).toBeInTheDocument();
    expect(screen.getByText('Snacks')).toBeInTheDocument();
    // Bebidas = 4.200 de 9.000 → 46,7% de cuota.
    expect(screen.getByText('46,7%')).toBeInTheDocument();
  });

  it('rankings: pestañas y top de productos por ventas', async () => {
    renderWidget(<ProductRanking period="month" store={undefined} />);

    expect(await screen.findByText('Agua 1,5L')).toBeInTheDocument();
    expect(screen.getByText('Rankings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Top ventas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Peor rotación' })).toBeInTheDocument();
    expect(screen.getByText('Café molido')).toBeInTheDocument();
  });

  it('mix de ventas: barra apilada monocroma + leyenda con «Otras familias»', async () => {
    renderWidget(<SalesMix period="month" store={undefined} />);

    // «Bebidas» depende de los datos → se espera con findBy; el resto ya está en el DOM.
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('Mix de ventas')).toBeInTheDocument();
    expect(screen.getByText('Otras familias')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Reparto de ventas por familia' })).toBeInTheDocument();
  });
});
