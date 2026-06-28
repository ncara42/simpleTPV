import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const HOURS = [
  { hour: 9, count: 8, revenue: 220 },
  { hour: 12, count: 20, revenue: 540 },
  { hour: 14, count: 31, revenue: 880 }, // hora punta
  { hour: 18, count: 17, revenue: 460 },
  { hour: 21, count: 6, revenue: 150 },
];

vi.mock('../../lib/dashboard.js', () => ({
  getSalesByHourOnDay: vi.fn(() => Promise.resolve(HOURS)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { HourHeatmap } from './graficas.js';
import { WIDGET_PANELS } from './index.js';

function renderWidget(node: ReactNode): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 02 (Gráficas)', () => {
  it('graf-heatmap está cableado en render, catálogo y galería', () => {
    expect(WIDGET_PANELS['graf-heatmap']).toBeDefined();
    expect(ITEM_SPECS['graf-heatmap']).toBeDefined();
    expect(WIDGET_LABELS['graf-heatmap']).toBeDefined();
    const graficas = GALLERY_ENTRIES.filter((e) => e.category === 'graficas').map((e) => e.id);
    expect(graficas).toContain('graf-heatmap');
  });

  it('el mapa de calor pinta una celda por hora con ventas', async () => {
    renderWidget(<HourHeatmap period="month" store={undefined} />);

    expect(await screen.findByText('14')).toBeInTheDocument(); // hora punta
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /intensidad por franja/i })).toBeInTheDocument();
  });
});
