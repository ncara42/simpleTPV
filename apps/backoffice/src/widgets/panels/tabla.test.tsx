import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const SALES_TODAY = {
  today: { total: 30000, count: 250 },
  yesterday: { total: 29000, count: 240 },
  deltaPct: 3.4,
  byStore: [
    { storeId: 's1', storeName: 'Tienda Sur', today: 11945, yesterday: 11000, deltaPct: 8.2 },
    { storeId: 's2', storeName: 'Tienda Online', today: 11188, yesterday: 11500, deltaPct: -2.4 },
    { storeId: 's3', storeName: 'Tienda Centro', today: 10796, yesterday: 10000, deltaPct: 7.9 },
  ],
};
const EMPLOYEES = [
  { userId: 'u1', userName: 'Dependiente Demo', salesCount: 760, total: 41000 },
  { userId: 'u2', userName: 'Admin Demo', salesCount: 12, total: 900 },
  { userId: 'u3', userName: 'Encargada Demo', salesCount: 8, total: 600 },
];
const RANKINGS = {
  topSales: [
    { productId: 'p1', name: 'Aceite 20% Profesor', total: 6360, units: 120 },
    { productId: 'p2', name: 'Vaporizador', total: 5537, units: 40 },
    { productId: 'p3', name: 'Aceite 20% Beemine', total: 5391, units: 110 },
  ],
  topMargin: [],
  worstRotation: [],
};
const ALERTS = [
  {
    id: 'a1',
    productId: 'p1',
    productName: 'Prueba',
    storeId: 's1',
    storeName: 'Tienda Sur',
    alertType: 'STOCKOUT',
    hasSubstituteStock: false,
    severity: 'critical' as const,
    resolved: false,
    createdAt: '2026-06-29T09:30:00Z',
  },
  {
    id: 'a2',
    productId: 'p2',
    productName: 'Filtros x100',
    storeId: 's1',
    storeName: 'Tienda Sur',
    alertType: 'LOW_STOCK',
    hasSubstituteStock: true,
    severity: 'soft' as const,
    resolved: false,
    createdAt: '2026-06-29T10:30:00Z',
  },
  {
    id: 'a3',
    productId: 'p3',
    productName: 'Vaporizador',
    storeId: 's1',
    storeName: 'Tienda Sur',
    alertType: 'LOW_STOCK',
    hasSubstituteStock: true,
    severity: 'soft' as const,
    resolved: true,
    createdAt: '2026-06-29T08:30:00Z',
  },
];

vi.mock('../../lib/dashboard.js', () => ({
  getSalesToday: vi.fn(() => Promise.resolve(SALES_TODAY)),
  getSalesByEmployee: vi.fn(() => Promise.resolve(EMPLOYEES)),
  getProductRankings: vi.fn(() => Promise.resolve(RANKINGS)),
}));
vi.mock('../../lib/stock.js', () => ({
  listAlerts: vi.fn(() => Promise.resolve(ALERTS)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { WIDGET_PANELS } from './index.js';
import {
  AvatarList,
  RankingList,
  SimpleList,
  StatusList,
  TaskList,
  VariationList,
} from './tabla.js';

const TABLA_IDS = [
  'tabla-simple',
  'tabla-avatar',
  'tabla-estado',
  'tabla-variacion',
  'tabla-ranking',
  'tabla-tareas',
];

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 09 (Listas y tablas)', () => {
  it('los 6 widgets están cableados en render, catálogo y galería bajo «listas-tablas»', () => {
    const cat = GALLERY_ENTRIES.filter((e) => e.category === 'listas-tablas').map((e) => e.id);
    for (const id of TABLA_IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(cat, `galería falta ${id}`).toContain(id);
    }
  });

  it('lista simple: tienda + facturación (€ sin decimales)', async () => {
    renderWidget(<SimpleList period="today" store={undefined} />);
    expect(await screen.findByText('Tienda Sur')).toBeInTheDocument();
    expect(screen.getByText('11.945 €')).toBeInTheDocument();
  });

  it('con avatar: iniciales + nombre + nº de tickets', async () => {
    renderWidget(<AvatarList period="month" store={undefined} />);
    expect(await screen.findByText('Dependiente Demo')).toBeInTheDocument();
    expect(screen.getByText('DD')).toBeInTheDocument(); // iniciales
    expect(screen.getByText('760')).toBeInTheDocument();
  });

  it('con estado: badge Agotado / Bajo / OK según severidad y resolución', async () => {
    renderWidget(<StatusList period="today" store={undefined} />);
    expect(await screen.findByText('Agotado')).toBeInTheDocument(); // critical no resuelta
    expect(screen.getByText('Bajo')).toBeInTheDocument(); // soft no resuelta
    expect(screen.getByText('OK')).toBeInTheDocument(); // resuelta
  });

  it('con variación: ▲ verde si sube, ▼ rojo si baja', async () => {
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <VariationList period="today" store={undefined} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Tienda Sur')).toBeInTheDocument();
    expect(container.querySelector('.tl-delta--up')).not.toBeNull();
    expect(container.querySelector('.tl-delta--down')).not.toBeNull();
  });

  it('ranking: nº1 con chip de acento y nombre del producto', async () => {
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RankingList period="month" store={undefined} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Aceite 20% Profesor')).toBeInTheDocument();
    expect(container.querySelectorAll('.tl-rank--top')).toHaveLength(1);
  });

  it('tareas: las resueltas salen tachadas (hechas)', async () => {
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TaskList period="today" store={undefined} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Prueba')).toBeInTheDocument();
    expect(container.querySelectorAll('.tl-task--done')).toHaveLength(1); // solo la resuelta
  });
});
