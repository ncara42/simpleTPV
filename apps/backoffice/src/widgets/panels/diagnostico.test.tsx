import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const ALERTS = [
  {
    id: 'a1',
    productId: 'p1',
    productName: 'Agua 1,5L',
    storeId: 's1',
    storeName: 'Centro',
    alertType: 'low_stock',
    hasSubstituteStock: false,
    severity: 'critical',
    resolved: false,
    createdAt: '2026-06-28T09:30:00Z',
  },
  {
    id: 'a2',
    productId: 'p2',
    productName: 'Café molido',
    storeId: 's1',
    storeName: 'Centro',
    alertType: 'low_stock',
    hasSubstituteStock: true,
    severity: 'soft',
    resolved: false,
    createdAt: '2026-06-28T10:15:00Z',
  },
];

vi.mock('../../lib/stock.js', () => ({
  listAlerts: vi.fn(() => Promise.resolve(ALERTS)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { DiagnosticActivity } from './diagnostico.js';
import { WIDGET_PANELS } from './index.js';

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 06 (Diagnóstico)', () => {
  it('diag-actividad está cableado en render, catálogo y galería bajo «diagnostico»', () => {
    expect(WIDGET_PANELS['diag-actividad']).toBeDefined();
    expect(ITEM_SPECS['diag-actividad']).toBeDefined();
    expect(WIDGET_LABELS['diag-actividad']).toBeDefined();
    const diag = GALLERY_ENTRIES.filter((e) => e.category === 'diagnostico').map((e) => e.id);
    expect(diag).toContain('diag-actividad');
  });

  it('el feed pinta un hito por alerta con su producto y tienda', async () => {
    renderWidget(<DiagnosticActivity period="month" store={undefined} />);

    expect(await screen.findByText('Agua 1,5L')).toBeInTheDocument();
    expect(screen.getByText('Café molido')).toBeInTheDocument();
    expect(screen.getAllByText(/Centro/).length).toBeGreaterThanOrEqual(1);
  });
});
