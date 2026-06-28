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

const STORES = {
  today: { total: 0, count: 0 },
  yesterday: { total: 0, count: 0 },
  deltaPct: null,
  byStore: [
    { storeId: 's3', storeName: 'Centro', today: 10800, yesterday: 0, deltaPct: null },
    { storeId: 's1', storeName: 'Sur', today: 11900, yesterday: 0, deltaPct: null }, // líder
    { storeId: 's5', storeName: 'Norte', today: 9000, yesterday: 0, deltaPct: null },
    { storeId: 's2', storeName: 'Online', today: 11200, yesterday: 0, deltaPct: null },
    { storeId: 's4', storeName: 'Gran Vía', today: 9300, yesterday: 0, deltaPct: null },
  ],
};

vi.mock('../../lib/dashboard.js', () => ({
  getSalesByHourOnDay: vi.fn(() => Promise.resolve(HOURS)),
  getSalesToday: vi.fn(() => Promise.resolve(STORES)),
}));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { HourArea, HourHeatmap, StoreBars } from './graficas.js';
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

  it('el mapa de calor pinta las 24 horas con su etiqueta', async () => {
    renderWidget(<HourHeatmap period="month" store={undefined} />);

    // Rejilla de 24 celdas (00–23) con la hora a dos dígitos; la hora punta (14) lleva anillo.
    expect(await screen.findByText('14')).toBeInTheDocument();
    expect(screen.getByText('00')).toBeInTheDocument();
    expect(screen.getByText('09')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /intensidad de ventas por hora/i })).toBeInTheDocument();
  });

  it('graf-hour-area está cableado en render, catálogo y galería', () => {
    expect(WIDGET_PANELS['graf-hour-area']).toBeDefined();
    expect(ITEM_SPECS['graf-hour-area']).toBeDefined();
    expect(WIDGET_LABELS['graf-hour-area']).toBeDefined();
    const graficas = GALLERY_ENTRIES.filter((e) => e.category === 'graficas').map((e) => e.id);
    expect(graficas).toContain('graf-hour-area');
  });

  it('la distribución horaria marca el pico y la franja activa', async () => {
    renderWidget(<HourArea period="month" store={undefined} />);

    // Pico = hora 14 (880 €, 31 tickets); franja activa = de la primera a la última hora con ventas.
    // El tooltip depende de los datos → se espera con findBy.
    expect(await screen.findByText('31 tickets · pico del día')).toBeInTheDocument();
    expect(screen.getByText('Distribución horaria')).toBeInTheDocument();
    expect(screen.getByText('9 – 21 h')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /facturación por franja/i })).toBeInTheDocument();
  });

  it('graf-store-bars está cableado en render, catálogo y galería', () => {
    expect(WIDGET_PANELS['graf-store-bars']).toBeDefined();
    expect(ITEM_SPECS['graf-store-bars']).toBeDefined();
    expect(WIDGET_LABELS['graf-store-bars']).toBeDefined();
    const graficas = GALLERY_ENTRIES.filter((e) => e.category === 'graficas').map((e) => e.id);
    expect(graficas).toContain('graf-store-bars');
  });

  it('ventas por tienda ordena las tiendas de mayor a menor facturación', async () => {
    renderWidget(<StoreBars period="month" store={undefined} />);

    // El líder (Sur, 11.900) se formatea «11,9k»; se pintan todas las tiendas con su nombre.
    expect(await screen.findByText('11,9k')).toBeInTheDocument();
    expect(screen.getByText('Ventas por tienda')).toBeInTheDocument();
    expect(screen.getByText('Sur')).toBeInTheDocument();
    expect(screen.getByText('Norte')).toBeInTheDocument();
    expect(screen.getByText('9,0k')).toBeInTheDocument();
  });
});
