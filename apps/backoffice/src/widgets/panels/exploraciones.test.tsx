import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const PAYMENT = [
  { method: 'CASH', count: 40, revenue: 5200 },
  { method: 'CARD', count: 25, revenue: 3100 },
  { method: 'BIZUM', count: 8, revenue: 640 },
];
const RECENT = [
  {
    id: 's1',
    ticketNumber: 'T-1001',
    storeName: 'Centro',
    total: 42.5,
    paymentMethod: 'CARD',
    createdAt: '2026-06-30T09:15:00Z',
  },
  {
    id: 's2',
    ticketNumber: 'T-1000',
    storeName: 'Norte',
    total: 18,
    paymentMethod: 'CASH',
    createdAt: '2026-06-30T08:40:00Z',
  },
];
// 63527 / 85000 ≈ 74,7 % de cumplimiento (el bullet pinta ese %).
const GOAL = { current: 63527, target: 85000, projection: 79408 };
const CUMULATIVE = {
  actual: [100, 250, 420, 600],
  compare: [90, 180, 300, 450, 700],
  projectionEnd: 920,
  totalPoints: 30,
};

vi.mock('../../lib/dashboard.js', () => ({
  getSalesByPayment: vi.fn(() => Promise.resolve(PAYMENT)),
  getRecentSales: vi.fn(() => Promise.resolve(RECENT)),
  getSalesGoal: vi.fn(() => Promise.resolve(GOAL)),
  getCumulativeMonth: vi.fn(() => Promise.resolve(CUMULATIVE)),
  PAYMENT_METHOD_LABELS: {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    TRANSFER: 'Transferencia',
    BIZUM: 'Bizum',
    DIRECT_DEBIT: 'Domiciliación',
  },
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import {
  ExpCumulativeMonth,
  ExpGoal,
  ExpPaymentMethods,
  ExpRecentTickets,
} from './exploraciones.js';
import { WIDGET_PANELS } from './index.js';

const IDS = ['exp-objetivo', 'exp-metodos-pago', 'exp-tickets-recientes', 'exp-acumulado-mes'];

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 04 (Más exploraciones)', () => {
  it('los 4 widgets están cableados en render, talla, etiqueta y galería «exploraciones»', () => {
    const exp = GALLERY_ENTRIES.filter((e) => e.category === 'exploraciones').map((e) => e.id);
    for (const id of IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(exp, `galería falta ${id}`).toContain(id);
    }
  });

  it('métodos de pago: leyenda con los métodos en es-ES', async () => {
    renderWidget(<ExpPaymentMethods period="month" store={undefined} />);

    expect(await screen.findByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
  });

  it('tickets recientes: nº de ticket de la última venta', async () => {
    renderWidget(<ExpRecentTickets period="month" store={undefined} />);

    expect(await screen.findByText(/T-1001/)).toBeInTheDocument();
  });

  it('objetivo: bullet con marca de objetivo y % de cumplimiento', async () => {
    renderWidget(<ExpGoal period="month" store={undefined} />);

    expect(await screen.findByText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText(/74,7\s*%/)).toBeInTheDocument();
  });

  it('acumulado del mes: dibuja el área con proyección', async () => {
    renderWidget(<ExpCumulativeMonth period="month" store={undefined} />);

    expect(
      await screen.findByRole('img', { name: 'Acumulado con proyección' }),
    ).toBeInTheDocument();
  });
});
